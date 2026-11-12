# backend/services/pdf_engine.py
"""Leitura de PDF: texto, página como imagem e imagens embutidas.

Usa o pypdfium2, que embrulha o PDFium (o leitor de PDF do Chrome, mantido pelo Google).
Licenças: pypdfium2 BSD-3-Clause ou Apache-2.0; PDFium BSD-3-Clause. Entra no lugar do PyMuPDF, que é
AGPL-3.0 ou licença comercial paga: com ele o Qython só podia ser distribuído sob a AGPL.

O PDFium não é thread-safe e o backend chama estas funções de várias threads (run_in_threadpool),
então todo acesso passa por um trava única.
"""
import hashlib
import io
import os
import threading
from dataclasses import dataclass
from typing import Callable, List, Optional, Union

import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_raw

_LOCK = threading.RLock()

# Página enorme (planta, cartaz) a 300 dpi viraria um bitmap de gigabytes: acima disto, reduz a escala.
MAX_RENDER_PIXELS = 120_000_000

_LIGATURES = str.maketrans({
    "ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl", "ﬅ": "st", "ﬆ": "st",
})


@dataclass
class EmbeddedImage:
    width: int
    height: int
    ext: str  # "jpg", "jp2" ou "png"
    data: bytes


class PdfFile:
    """Um PDF aberto. Use com `with`. `source` é um caminho ou os bytes do arquivo."""

    def __init__(self, source: Union[str, os.PathLike, bytes]):
        with _LOCK:
            self._doc = pdfium.PdfDocument(source)

    def __enter__(self) -> "PdfFile":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def close(self) -> None:
        with _LOCK:
            doc, self._doc = getattr(self, "_doc", None), None
            if doc is not None:
                doc.close()

    def __len__(self) -> int:
        with _LOCK:
            return len(self._doc)

    def text(self, index: int) -> str:
        """Texto da página `index` (0 a n-1). Vazio em página só de imagem (escaneada)."""
        with _LOCK:
            page = self._doc[index]
            try:
                textpage = page.get_textpage()
                try:
                    raw = textpage.get_text_bounded()
                finally:
                    textpage.close()
            finally:
                page.close()
        return raw.replace("\r\n", "\n").replace("\r", "\n").translate(_LIGATURES)

    def render(self, index: int, *, dpi: Optional[float] = None, scale: Optional[float] = None):
        """A página como imagem PIL. `dpi` (300 para OCR) ou `scale` (1 = 72 dpi; 0.5 para miniatura)."""
        if (dpi is None) == (scale is None):
            raise ValueError("informe dpi ou scale, um dos dois")
        factor = scale if scale is not None else dpi / 72.0
        with _LOCK:
            page = self._doc[index]
            try:
                width, height = page.get_size()
                pixels = width * factor * height * factor
                if pixels > MAX_RENDER_PIXELS:
                    factor *= (MAX_RENDER_PIXELS / pixels) ** 0.5
                return page.render(scale=factor).to_pil()
            finally:
                page.close()

    def save_png(self, index: int, path: str, *, dpi: Optional[float] = None, scale: Optional[float] = None) -> None:
        self.render(index, dpi=dpi, scale=scale).save(path, "PNG")

    def images(self, index: int, accept: Callable[[int, int], bool] = lambda w, h: True) -> List[EmbeddedImage]:
        """Imagens que a página realmente desenha (inclusive dentro de formulários XObject).

        `accept(largura, altura)` roda antes de ler os bytes: imagem recusada nem chega a ser decodificada.
        JPEG e JPEG 2000 saem com os bytes originais; o resto é decodificado e salvo como PNG (os mesmos
        pixels). Uma imagem desenhada duas vezes na mesma página sai uma vez só. Devolve uma lista (e não um
        gerador) para a trava do PDFium não ficar presa enquanto quem chama processa cada imagem.
        """
        found, seen = [], set()
        with _LOCK:
            page = self._doc[index]
            try:
                for obj in page.get_objects(filter=[pdfium_raw.FPDF_PAGEOBJ_IMAGE], max_depth=15):
                    try:
                        width, height = obj.get_px_size()
                        if width <= 0 or height <= 0 or not accept(width, height):
                            continue
                        image = self._read(obj, width, height)
                    except Exception:
                        continue  # imagem que o PDFium não decodifica: segue com as outras
                    key = hashlib.md5(image.data).hexdigest()
                    if key not in seen:
                        seen.add(key)
                        found.append(image)
            finally:
                page.close()
        return found

    @staticmethod
    def _read(obj, width: int, height: int) -> EmbeddedImage:
        complex_filters = obj.get_filters(skip_simple=True)
        if complex_filters == ["DCTDecode"]:
            return EmbeddedImage(width, height, "jpg", bytes(obj.get_data(decode_simple=True)))
        if complex_filters == ["JPXDecode"]:
            return EmbeddedImage(width, height, "jp2", bytes(obj.get_data(decode_simple=True)))
        buffer = io.BytesIO()
        obj.get_bitmap().to_pil().save(buffer, "PNG")
        return EmbeddedImage(width, height, "png", buffer.getvalue())
