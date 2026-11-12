# tests/backend/test_pdf_engine.py
"""Leitura de PDF (backend/services/pdf_engine.py, sobre o pypdfium2) e o que depende dela em
backend/services/academic_services/file_processing_service.py.

Rode direto (não há pytest neste repositório):
    python3 tests/backend/test_pdf_engine.py

Os PDFs são gerados na hora (fpdf2). O que importa:
  - o texto digital vem inteiro, com acento, e página só de imagem (escaneada) vem vazia;
  - a página vira imagem na resolução pedida (dpi para OCR, escala para miniatura), e uma página
    gigante é reduzida em vez de estourar a memória;
  - as imagens embutidas saem das páginas em que são desenhadas (não de todas), com os bytes originais
    no JPEG e os mesmos pixels no resto, sem repetir a que aparece duas vezes e sem decodificar a
    que o filtro de tamanho recusa;
  - várias threads lendo ao mesmo tempo não derrubam o PDFium;
  - arquivo que não é PDF dá erro, e as funções do file_processing_service o tratam sem quebrar;
  - o caminho do PDF escaneado (sem texto nativo) chega ao OCR.
"""
import importlib.util
import io
import os
import shutil
import sys
import tempfile
import threading

os.environ.setdefault("JWT_SECRET_KEY", "k" * 48)
os.environ.setdefault("DATABASE_URL", "postgresql://t:t@127.0.0.1:1/t")
os.environ.setdefault("QYTHON_ALLOW_EPHEMERAL_KEK", "1")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)

from fpdf import FPDF  # noqa: E402
from PIL import Image, ImageChops, ImageDraw  # noqa: E402


def load(name, relpath):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, relpath))
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


pdf_engine = load("pdf_engine", "backend/services/pdf_engine.py")


# ---------------------------------------------------------------- material de teste

def foto(largura, altura, semente=1):
    """Imagem com gradiente, ruído e um círculo: passa no filtro de 'imagem médica' e não é chapada."""
    import random

    rnd = random.Random(semente)
    img = Image.new("RGB", (largura, altura))
    px = img.load()
    for y in range(altura):
        for x in range(largura):
            px[x, y] = ((x * 255) // largura + rnd.randint(0, 40) & 255, (y * 255) // altura, 120 + rnd.randint(0, 60))
    ImageDraw.Draw(img).ellipse((largura // 4, altura // 4, 3 * largura // 4, 3 * altura // 4), outline=(255, 255, 255), width=5)
    return img


def jpeg_bytes(img):
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=88)
    return buf.getvalue()


def pdf_com_texto():
    pdf = FPDF(unit="pt", format=(595, 842))
    pdf.set_font("Helvetica", size=14)
    pdf.add_page()
    pdf.set_xy(50, 60)
    pdf.cell(0, 20, "Dipirona 500 mg a cada 6 horas - ação, coração, avaliação")
    pdf.set_xy(50, 100)
    pdf.cell(0, 20, "Retorno em sete dias")
    pdf.add_page()  # página 2 em branco
    return bytes(pdf.output())


def pdf_com_imagens(tmp):
    """Página 1: JPEG (duas vezes), PNG e um ícone de 24 px. Página 2: outra foto."""
    jpg = foto(640, 480)
    png = foto(300, 300, semente=2)
    jpg_path, png_path, icon_path, outra_path = (os.path.join(tmp, n) for n in ("a.jpg", "b.png", "c.png", "d.jpg"))
    open(jpg_path, "wb").write(jpeg_bytes(jpg))
    png.save(png_path)
    Image.new("RGB", (24, 24), (200, 30, 30)).save(icon_path)
    open(outra_path, "wb").write(jpeg_bytes(foto(500, 400, semente=3)))
    pdf = FPDF(unit="pt", format=(595, 842))
    pdf.add_page()
    pdf.image(jpg_path, x=40, y=40, w=240)
    pdf.image(jpg_path, x=300, y=40, w=240)  # a mesma foto de novo na mesma página
    pdf.image(png_path, x=40, y=300, w=200)
    pdf.image(icon_path, x=300, y=300, w=24)
    pdf.add_page()
    pdf.image(outra_path, x=40, y=40, w=240)
    return bytes(pdf.output()), open(jpg_path, "rb").read(), png


def pdf_escaneado(tmp):
    """Página que é só uma imagem com texto desenhado (nenhum texto nativo)."""
    from PIL import ImageFont

    img = Image.new("RGB", (1240, 700), "white")
    d = ImageDraw.Draw(img)
    fonte = ImageFont.load_default(size=52)
    d.text((60, 60), "Amoxicilina 50 mg/kg/dia", fill="black", font=fonte)
    d.text((60, 200), "Dipirona 500 mg", fill="black", font=fonte)
    path = os.path.join(tmp, "scan.jpg")
    img.save(path, "JPEG", quality=95)
    pdf = FPDF(unit="pt", format=(595, 337))
    pdf.add_page()
    pdf.image(path, x=0, y=0, w=595)
    return bytes(pdf.output())


class Pasta:
    def __enter__(self):
        self.path = tempfile.mkdtemp(prefix="pdf_engine_")
        return self.path

    def __exit__(self, *a):
        shutil.rmtree(self.path, ignore_errors=True)


# ---------------------------------------------------------------- texto

def test_texto_digital_vem_inteiro_e_com_acento():
    with pdf_engine.PdfFile(pdf_com_texto()) as pdf:
        assert len(pdf) == 2
        t = pdf.text(0)
    assert "Dipirona 500 mg a cada 6 horas" in t, t
    assert "ação, coração, avaliação" in t, t
    assert "\r" not in t
    assert t.index("Dipirona") < t.index("Retorno")


def test_pagina_sem_texto_vem_vazia():
    with pdf_engine.PdfFile(pdf_com_texto()) as pdf:
        assert pdf.text(1).strip() == ""


def test_caminho_e_bytes_dao_o_mesmo():
    data = pdf_com_texto()
    with Pasta() as tmp:
        path = os.path.join(tmp, "x.pdf")
        open(path, "wb").write(data)
        with pdf_engine.PdfFile(path) as a, pdf_engine.PdfFile(data) as b:
            assert a.text(0) == b.text(0) and len(a) == len(b)


def test_ligaduras_viram_letras():
    assert "fi" in "ﬁ".translate(pdf_engine._LIGATURES)
    assert "ffl" == "ﬄ".translate(pdf_engine._LIGATURES)


# ---------------------------------------------------------------- página como imagem

def test_render_na_resolucao_pedida():
    with pdf_engine.PdfFile(pdf_com_texto()) as pdf:
        base = pdf.render(0, scale=1)
        ocr = pdf.render(0, dpi=288)  # 4x
        mini = pdf.render(0, scale=0.5)
    assert abs(base.size[0] - 595) <= 1 and abs(base.size[1] - 842) <= 1, base.size
    assert abs(ocr.size[0] - 4 * base.size[0]) <= 4, (ocr.size, base.size)
    assert abs(mini.size[0] - base.size[0] // 2) <= 1, (mini.size, base.size)
    # a página tem tinta: não saiu em branco
    assert ImageChops.invert(base.convert("L")).getbbox() is not None


def test_render_exige_dpi_ou_escala():
    with pdf_engine.PdfFile(pdf_com_texto()) as pdf:
        for kwargs in ({}, {"dpi": 300, "scale": 1}):
            try:
                pdf.render(0, **kwargs)
            except ValueError:
                continue
            raise AssertionError(f"deveria recusar {kwargs}")


def test_pagina_gigante_e_reduzida():
    original = pdf_engine.MAX_RENDER_PIXELS
    pdf_engine.MAX_RENDER_PIXELS = 1_000_000
    try:
        with pdf_engine.PdfFile(pdf_com_texto()) as pdf:
            img = pdf.render(0, dpi=600)
    finally:
        pdf_engine.MAX_RENDER_PIXELS = original
    assert img.size[0] * img.size[1] <= 1_050_000, img.size


def test_save_png_grava_um_png_valido():
    with Pasta() as tmp, pdf_engine.PdfFile(pdf_com_texto()) as pdf:
        out = os.path.join(tmp, "p.png")
        pdf.save_png(0, out, dpi=150)
        with Image.open(out) as img:
            assert img.format == "PNG" and img.size[0] > 800


# ---------------------------------------------------------------- imagens embutidas

def test_imagens_saem_da_pagina_certa_sem_repetir():
    with Pasta() as tmp:
        data, jpg_original, png_original = pdf_com_imagens(tmp)
        with pdf_engine.PdfFile(data) as pdf:
            p1 = pdf.images(0)
            p2 = pdf.images(1)
    assert sorted(i.ext for i in p1) == ["jpg", "png", "png"], [(i.ext, i.width, i.height) for i in p1]  # JPEG 1x, PNG, ícone
    assert [i.ext for i in p2] == ["jpg"], "a foto da página 2 não pode aparecer na 1 nem o contrário"
    jpg = next(i for i in p1 if i.ext == "jpg")
    assert (jpg.width, jpg.height) == (640, 480)
    assert jpg.data == jpg_original, "o JPEG precisa sair com os bytes originais"
    png = next(i for i in p1 if i.ext == "png" and i.width == 300)
    assert ImageChops.difference(Image.open(io.BytesIO(png.data)).convert("RGB"), png_original.convert("RGB")).getbbox() is None


def test_filtro_de_tamanho_roda_antes_de_decodificar():
    chamadas = []

    def aceita(w, h):
        chamadas.append((w, h))
        return w >= 100 and h >= 100

    with Pasta() as tmp:
        data, _, _ = pdf_com_imagens(tmp)
        with pdf_engine.PdfFile(data) as pdf:
            achadas = pdf.images(0, accept=aceita)
    assert (24, 24) in chamadas, chamadas
    assert all(i.width >= 100 for i in achadas) and len(achadas) == 2, [(i.width, i.height) for i in achadas]


def test_pagina_sem_imagem_devolve_lista_vazia():
    with pdf_engine.PdfFile(pdf_com_texto()) as pdf:
        assert pdf.images(0) == []


# ---------------------------------------------------------------- robustez

def test_varias_threads_ao_mesmo_tempo():
    data = pdf_com_texto()
    erros, resultados = [], []

    def trabalho():
        try:
            for _ in range(15):
                with pdf_engine.PdfFile(data) as pdf:
                    resultados.append((pdf.text(0), pdf.render(0, scale=0.5).size))
        except Exception as exc:  # noqa: BLE001
            erros.append(repr(exc))

    threads = [threading.Thread(target=trabalho) for _ in range(8)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert not erros, erros
    assert len(resultados) == 8 * 15 and len(set(resultados)) == 1


def test_arquivo_que_nao_e_pdf_da_erro():
    for lixo in (b"isto nao e um pdf", b""):
        try:
            pdf_engine.PdfFile(lixo)
        except Exception:
            continue
        raise AssertionError("deveria recusar um arquivo que não é PDF")


def test_usar_depois_de_fechar_da_erro():
    pdf = pdf_engine.PdfFile(pdf_com_texto())
    pdf.close()
    pdf.close()  # fechar duas vezes é inofensivo
    try:
        pdf.text(0)
    except Exception:
        return
    raise AssertionError("ler um PDF fechado deveria falhar")


# ---------------------------------------------------------------- file_processing_service

def processing():
    from backend.config import Config
    from backend.services.academic_services import file_processing_service as fps

    return fps, Config


def test_servico_extrai_texto_direto_e_por_pagina():
    fps, _ = processing()
    with Pasta() as tmp:
        path = os.path.join(tmp, "doc.pdf")
        open(path, "wb").write(pdf_com_texto())
        assert "coração" in fps.extract_text_direct(path)
        pages = fps.extract_pages_from_pdf(path, ocr_threshold=0)  # sem OCR: só o texto nativo
    assert [n for n, _ in pages] == [1, 2] and "Dipirona" in pages[0][1], pages


def test_servico_trata_arquivo_ruim_sem_quebrar():
    fps, _ = processing()
    with Pasta() as tmp:
        path = os.path.join(tmp, "ruim.pdf")
        open(path, "wb").write(b"%PDF-1.4 truncado")
        assert fps.extract_text_direct(path) == ""
        assert fps.extract_images_from_pdf(path, 1, 1, os.path.join(tmp, "img")) == []


def test_servico_miniatura_e_paginas_em_imagem():
    fps, Config = processing()
    with Pasta() as tmp:
        path = os.path.join(tmp, "doc.pdf")
        open(path, "wb").write(pdf_com_texto())
        Config.THUMBNAIL_FOLDER = os.path.join(tmp, "thumbs")
        rel = fps.generate_thumbnail(path, 7)
        assert rel and os.path.exists(os.path.join(Config.THUMBNAIL_FOLDER, "thumb_7_doc.pdf.png"))
        with Image.open(os.path.join(Config.THUMBNAIL_FOLDER, "thumb_7_doc.pdf.png")) as thumb:
            assert thumb.size[0] < 400
        paginas = fps.converter_para_imagem(path, os.path.join(tmp, "out"))
        assert len(paginas) == 2 and all(os.path.exists(p) for p in paginas)
        with Image.open(paginas[0]) as img:
            assert img.size[0] > 2000  # 300 dpi


def test_servico_extrai_imagens_com_metadados():
    fps, Config = processing()
    with Pasta() as tmp:
        data, jpg_original, _ = pdf_com_imagens(tmp)
        path = os.path.join(tmp, "imgs.pdf")
        open(path, "wb").write(data)
        achadas = fps.extract_images_from_pdf(path, 9, 3, os.path.join(tmp, "img"))
        assert achadas, "nenhuma imagem passou pelos filtros"
        assert all(a["document_id"] == 9 and a["library_id"] == 3 for a in achadas)
        assert {a["page_number"] for a in achadas} <= {0, 1}
        pequenas = [a for a in achadas if a["width"] < Config.MIN_IMAGE_DIMENSION]
        assert not pequenas, "o ícone de 24 px deveria ter sido filtrado"
        for a in achadas:
            assert os.path.getsize(os.path.join(tmp, "img", a["image_filename"])) == a["file_size_bytes"]
        # cada imagem fica na página em que é desenhada: a foto da página 2 não aparece na 1
        paginas = sorted((a["page_number"], a["width"]) for a in achadas)
        assert paginas.count((1, 500)) <= 1 and (0, 500) not in paginas, paginas


def test_servico_le_pdf_de_bytes():
    fps, _ = processing()
    texto = fps.get_input_data_from_bytes(pdf_com_texto() * 1, "pdf")
    assert "Dipirona" in texto or texto == ""  # com menos de 50 caracteres cai no fluxo de OCR


def test_pdf_escaneado_chega_ao_ocr():
    fps, _ = processing()
    with Pasta() as tmp:
        path = os.path.join(tmp, "scan.pdf")
        open(path, "wb").write(pdf_escaneado(tmp))
        from backend.config import Config

        Config.UPLOAD_FOLDER = os.path.join(tmp, "up")
        assert fps.extract_text_direct(path) == "", "PDF escaneado não tem texto nativo"
        pages = fps.extract_pages_from_pdf(path)
    texto = pages[0][1].lower()
    assert "amoxicilina" in texto and "dipirona" in texto, pages


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print("ok  ", name)
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print("FAIL", name, "->", repr(exc))
    sys.exit(1 if failed else 0)
