"""OCR local do Qython: RapidOCR com o PP-OCRv6 (pequeno), em ONNX.

Por que este motor e não o Tesseract, que o projeto usava:
  - Não depende de binário nativo. O Tesseract exigia instalar o programa e os dados de idioma
    em cada sistema (apt no Docker; nos instaladores do Windows e do macOS ficou de fora). Aqui
    são dois arquivos .onnx que vêm DENTRO da roda do `rapidocr`: nada é baixado, nada vai para
    a rede, e o mesmo código roda no Docker, no app desktop e no CI.
  - Um modelo multilíngue só (português, espanhol, inglês e o resto do alfabeto latino).
  - Em teste com texto clínico em português (acentos, µg, mg/kg/dia, ≥, %), errou menos acentos
    que o Tesseract e leu foto de documento, onde o Tesseract não devolveu nada.

Dois tamanhos do mesmo modelo:
  - médio (padrão quando os arquivos estão em `QYTHON_OCR_MODELS`): 139 MB, o que menos erra. Em
    página escaneada de livro com texto de 9 pt a 300 dpi, errou 0,3% dos caracteres; o pequeno,
    11%. Custa cerca de 30 s por página densa em CPU de 4 threads.
  - pequeno (reserva): 31 MB, vem DENTRO da roda do `rapidocr`, funciona sem baixar nada. Cerca
    de 8 s por página densa. É o que roda quando o médio não está instalado.
O médio não vai na roda (a roda traz só o pequeno): o app desktop o baixa junto com a IA e a
imagem Docker o traz embutido. `QYTHON_OCR_MODELO=pequeno` força o pequeno em máquina lenta.

A extração de texto nativo do PDF continua sendo a primeira tentativa; o OCR só roda nas páginas
que não têm texto (ver `file_processing_service.extract_pages_from_pdf`).

O RapidOCR devolve uma caixa por linha de texto, sem ordem de leitura. Ordenar por altura
embaralharia páginas em duas colunas (artigos e diretrizes), então `_ordem_de_leitura` faz um
corte recursivo (XY-cut) para ler coluna por coluna.
"""

from __future__ import annotations

import logging
import os
import threading
from statistics import median
from typing import Any, List, Sequence, Tuple, Union

logger = logging.getLogger(__name__)

# (x0, y0, x1, y1, texto)
Caixa = Tuple[float, float, float, float, str]


class OcrIndisponivel(RuntimeError):
    """O OCR não pôde ser carregado (pacote ausente ou biblioteca nativa que não abre)."""


_engine = None
_engine_lock = threading.Lock()
_run_lock = threading.Lock()
_falha_de_carga: Union[str, None] = None


def _threads() -> int:
    try:
        return max(1, int(os.getenv("QYTHON_OCR_THREADS", "")))
    except ValueError:
        # O OCR é tarefa de fundo e divide a máquina com o llama-server: não pega todos os núcleos.
        return max(1, min(4, (os.cpu_count() or 2) // 2))


DET_MEDIO = "PP-OCRv6_det_medium.onnx"
REC_MEDIO = "PP-OCRv6_rec_medium.onnx"


def _modelos_medios() -> Union[Tuple[str, str], None]:
    """Caminhos do detector e do reconhecedor médios, se estiverem instalados e permitidos."""
    if os.getenv("QYTHON_OCR_MODELO", "").strip().lower() in ("pequeno", "small"):
        return None
    pasta = os.getenv("QYTHON_OCR_MODELS", "").strip()
    if not pasta:
        return None
    det, rec = os.path.join(pasta, DET_MEDIO), os.path.join(pasta, REC_MEDIO)
    return (det, rec) if os.path.isfile(det) and os.path.isfile(rec) else None


def modelo_em_uso() -> str:
    """"medio" ou "pequeno", conforme o que está instalado (não carrega o motor)."""
    return "medio" if _modelos_medios() else "pequeno"


def _carregar_engine():
    global _engine, _falha_de_carga
    if _engine is not None:
        return _engine
    with _engine_lock:
        if _engine is not None:
            return _engine
        if _falha_de_carga:
            raise OcrIndisponivel(_falha_de_carga)
        try:
            from rapidocr import ModelType, OCRVersion, RapidOCR

            params = {
                "Global.log_level": "warning",
                "EngineConfig.onnxruntime.intra_op_num_threads": _threads(),
                "EngineConfig.onnxruntime.inter_op_num_threads": 1,
                "Det.ocr_version": OCRVersion.PPOCRV6,
                "Rec.ocr_version": OCRVersion.PPOCRV6,
            }
            medios = _modelos_medios()
            if medios:
                params.update({
                    "Det.model_type": ModelType.MEDIUM,
                    "Rec.model_type": ModelType.MEDIUM,
                    "Det.model_path": medios[0],
                    "Rec.model_path": medios[1],
                })
            else:
                params.update({"Det.model_type": ModelType.SMALL, "Rec.model_type": ModelType.SMALL})
            _engine = RapidOCR(params=params)
            logger.info("OCR carregado: PP-OCRv6 %s, %d threads", "médio" if medios else "pequeno", _threads())
        except Exception as e:  # ImportError, biblioteca nativa, modelo ausente
            _falha_de_carga = f"OCR indisponível: {e}"
            logger.error(_falha_de_carga)
            raise OcrIndisponivel(_falha_de_carga) from e
        return _engine


def ocr_disponivel() -> bool:
    """True se o motor carrega. A primeira chamada carrega o modelo (cerca de 1 s)."""
    try:
        _carregar_engine()
        return True
    except OcrIndisponivel:
        return False


# --------------------------------------------------------------------------------------
# Ordem de leitura
# --------------------------------------------------------------------------------------


def _limites(poligono: Any) -> Tuple[float, float, float, float]:
    xs = [float(p[0]) for p in poligono]
    ys = [float(p[1]) for p in poligono]
    return min(xs), min(ys), max(xs), max(ys)


def _cortar(itens: Sequence[Caixa], eixo: int, folga_minima: float) -> List[List[Caixa]]:
    """Separa `itens` em grupos nos vazios de pelo menos `folga_minima` ao longo do `eixo`
    (0 = horizontal, em x, que separa colunas; 1 = vertical, em y, que separa faixas)."""
    ordenados = sorted(itens, key=lambda c: c[eixo])
    grupos: List[List[Caixa]] = [[ordenados[0]]]
    fim = ordenados[0][eixo + 2]
    for c in ordenados[1:]:
        if c[eixo] - fim >= folga_minima:
            grupos.append([])
        grupos[-1].append(c)
        fim = max(fim, c[eixo + 2])
    return grupos


def _parece_coluna_de_texto(grupo: Sequence[Caixa], largura_regiao: float) -> bool:
    """Coluna de texto corrido tem várias linhas e linhas largas. Célula de tabela é curta."""
    if len(grupo) < 5:
        return False
    return median(c[2] - c[0] for c in grupo) >= 0.2 * largura_regiao


def _linhas(itens: Sequence[Caixa]) -> List[str]:
    """Junta caixas que estão na mesma altura (linha de tabela) e devolve uma string por linha."""
    linhas: List[List[Caixa]] = []
    centro_atual = None
    for c in sorted(itens, key=lambda c: ((c[1] + c[3]) / 2, c[0])):
        centro = (c[1] + c[3]) / 2
        altura = c[3] - c[1]
        if linhas and centro_atual is not None and abs(centro - centro_atual) <= 0.5 * altura:
            linhas[-1].append(c)
        else:
            linhas.append([c])
            centro_atual = centro
    return [" ".join(c[4] for c in sorted(l, key=lambda c: c[0])) for l in linhas]


def _xy(itens: Sequence[Caixa], profundidade: int = 0) -> List[str]:
    if len(itens) <= 1 or profundidade > 8:
        return _linhas(itens)
    x0 = min(c[0] for c in itens)
    x1 = max(c[2] for c in itens)
    largura = max(1.0, x1 - x0)
    altura_mediana = median(c[3] - c[1] for c in itens) or 1.0

    # 1) Colunas: um vazio vertical que atravessa a região inteira.
    colunas = _cortar(itens, 0, max(12.0, 0.015 * largura))
    if len(colunas) > 1 and all(_parece_coluna_de_texto(g, largura) for g in colunas):
        saida: List[str] = []
        for g in colunas:
            saida += _xy(g, profundidade + 1)
        return saida

    # 2) Faixas: um vazio horizontal maior que o espaço entre linhas de um mesmo parágrafo
    #    (separa título, parágrafos alinhados, rodapé).
    faixas = _cortar(itens, 1, 0.8 * altura_mediana)
    if len(faixas) > 1:
        saida = []
        for g in faixas:
            saida += _xy(g, profundidade + 1)
        return saida

    return _linhas(itens)


def _ordem_de_leitura(caixas: Sequence[Caixa]) -> str:
    if not caixas:
        return ""
    return "\n".join(_xy(list(caixas)))


# --------------------------------------------------------------------------------------
# API
# --------------------------------------------------------------------------------------


def ocr_imagem(imagem: Any) -> str:
    """Lê o texto de uma imagem (caminho, `PIL.Image`, `numpy.ndarray` ou bytes).

    Devolve o texto na ordem de leitura, uma linha por linha impressa. Texto vazio quando não
    há nada legível. Levanta `OcrIndisponivel` se o motor não carrega.
    """
    engine = _carregar_engine()
    if hasattr(imagem, "convert"):  # PIL.Image
        import numpy as np

        imagem = np.array(imagem.convert("RGB"))
    # O ONNX Runtime já usa vários núcleos por chamada; duas páginas ao mesmo tempo só brigam
    # pela CPU (e pelo llama-server).
    with _run_lock:
        resultado = engine(imagem)
    textos = getattr(resultado, "txts", None)
    caixas_brutas = getattr(resultado, "boxes", None)
    if not textos or caixas_brutas is None:
        return ""
    caixas: List[Caixa] = []
    for poligono, texto in zip(caixas_brutas, textos):
        texto = (texto or "").strip()
        if texto:
            caixas.append((*_limites(poligono), texto))
    return _ordem_de_leitura(caixas)
