# tests/backend/test_ocr_service.py
"""Testes do OCR local (backend/services/ocr_service.py).

Rode direto (não há pytest neste repositório):
    python3 tests/backend/test_ocr_service.py

Duas partes:
  - a ordem de leitura (XY-cut), que é lógica pura e não precisa do modelo;
  - o OCR de verdade (RapidOCR com o PP-OCRv6, em ONNX), com imagens geradas na hora. Cobre
    acento, símbolo clínico e página em duas colunas, que é onde o motor anterior (Tesseract)
    falhava ou embaralhava.

O módulo é carregado pelo caminho do arquivo (não importa nada do pacote `backend`), então o
teste não depende do nome da pasta do checkout.
"""
import importlib.util
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


def load(name, relpath):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, relpath))
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


ocr = load('ocr_service', 'backend/services/ocr_service.py')
pdf_engine = load('pdf_engine', 'backend/services/pdf_engine.py')


def caixa(x0, y0, x1, y1, texto):
    return (x0, y0, x1, y1, texto)


# ---------------------------------------------------------------- ordem de leitura (sem modelo)

def test_ordem_de_leitura_uma_coluna_vai_de_cima_para_baixo():
    caixas = [caixa(100, 300, 900, 330, 'terceira'), caixa(100, 100, 900, 130, 'primeira'),
              caixa(100, 200, 900, 230, 'segunda')]
    assert ocr._ordem_de_leitura(caixas) == 'primeira\nsegunda\nterceira'


def test_ordem_de_leitura_duas_colunas_le_uma_coluna_inteira_antes_da_outra():
    # Título de largura inteira e, abaixo, duas colunas de texto corrido com 6 linhas cada.
    caixas = [caixa(100, 50, 1100, 90, 'TITULO')]
    for i in range(6):
        y = 200 + i * 45
        caixas.append(caixa(100, y, 560, y + 35, f'esq{i}'))
        caixas.append(caixa(640, y, 1100, y + 35, f'dir{i}'))
    linhas = ocr._ordem_de_leitura(caixas).split('\n')
    assert linhas == ['TITULO'] + [f'esq{i}' for i in range(6)] + [f'dir{i}' for i in range(6)], linhas


def test_ordem_de_leitura_tabela_continua_lida_por_linha():
    # Resultado de exame: células curtas em colunas. NÃO pode virar "coluna por coluna", senão
    # o valor se separa do nome do exame.
    caixas = []
    for i, (nome, valor, un) in enumerate([('Hemoglobina', '11,2', 'g/dL'), ('Leucocitos', '9800', '/mm3'),
                                           ('Plaquetas', '210000', '/mm3'), ('Creatinina', '0,9', 'mg/dL'),
                                           ('Ureia', '28', 'mg/dL'), ('Glicemia', '92', 'mg/dL')]):
        y = 100 + i * 50
        caixas += [caixa(100, y, 300, y + 35, nome), caixa(500, y, 580, y + 35, valor),
                   caixa(700, y, 780, y + 35, un)]
    linhas = ocr._ordem_de_leitura(caixas).split('\n')
    assert linhas[0] == 'Hemoglobina 11,2 g/dL', linhas
    assert linhas[3] == 'Creatinina 0,9 mg/dL', linhas
    assert len(linhas) == 6, linhas


def test_ordem_de_leitura_vazia():
    assert ocr._ordem_de_leitura([]) == ''


def test_modelo_medio_exige_os_dois_arquivos_e_pode_ser_desligado():
    import tempfile

    antes = {k: os.environ.get(k) for k in ('QYTHON_OCR_MODELS', 'QYTHON_OCR_MODELO')}
    try:
        with tempfile.TemporaryDirectory() as pasta:
            os.environ['QYTHON_OCR_MODELS'] = pasta
            os.environ.pop('QYTHON_OCR_MODELO', None)
            assert ocr.modelo_em_uso() == 'pequeno'  # pasta vazia: cai no que vem no pacote
            open(os.path.join(pasta, ocr.DET_MEDIO), 'wb').close()
            assert ocr.modelo_em_uso() == 'pequeno'  # só o detector não basta
            open(os.path.join(pasta, ocr.REC_MEDIO), 'wb').close()
            assert ocr.modelo_em_uso() == 'medio'
            os.environ['QYTHON_OCR_MODELO'] = 'pequeno'  # máquina lenta: o médio fica de lado
            assert ocr.modelo_em_uso() == 'pequeno'
    finally:
        for k, v in antes.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


# ---------------------------------------------------------------- OCR de verdade

def _fonte(tamanho):
    from PIL import ImageFont

    return ImageFont.load_default(size=tamanho)


def _imagem(linhas, largura=1000, passo=70, tamanho=44, x=30, y=30):
    from PIL import Image, ImageDraw

    altura = y + passo * (len(linhas) + 1)
    img = Image.new('RGB', (largura, altura), 'white')
    d = ImageDraw.Draw(img)
    for i, t in enumerate(linhas):
        d.text((x, y + i * passo), t, fill='black', font=_fonte(tamanho))
    return img


def _pagina_de_pdf(linhas, tamanho=22):
    """Página de PDF (gerada pelo fpdf2) rasterizada pelo pdf_engine, como o backend faz com PDF
    escaneado. A fonte padrão do Pillow não tem ç nem ã (desenha caixinhas), a Helvetica do PDF tem."""
    from fpdf import FPDF

    pdf = FPDF(unit='pt', format=(595, 842))
    pdf.add_page()
    pdf.set_font('Helvetica', size=tamanho)
    for i, t in enumerate(linhas):
        pdf.set_xy(50, 60 + i * 40)
        pdf.cell(0, tamanho + 6, t)
    with pdf_engine.PdfFile(bytes(pdf.output())) as doc:
        return doc.render(0, dpi=200)


def test_ocr_le_texto_clinico_em_portugues():
    texto = ocr.ocr_imagem(_imagem(['Amoxicilina 50 mg/kg/dia', 'Dipirona 500 mg a cada 6 horas'])).lower()
    for esperado in ('amoxicilina', 'dipirona', '500'):
        assert esperado in texto, texto


def test_ocr_preserva_acentos_do_portugues():
    texto = ocr.ocr_imagem(_pagina_de_pdf(['Coração e pressão arterial', 'Avaliação pediátrica urgente',
                                           'Náuseas, vômitos e cefaleia há 3 dias'])).lower()
    for esperado in ('coração', 'pressão', 'avaliação', 'pediátrica', 'náuseas', 'vômitos'):
        assert esperado in texto, f'{esperado!r} não saiu:\n{texto}'


def test_ocr_pagina_em_duas_colunas_nao_embaralha():
    from PIL import Image, ImageDraw

    img = Image.new('RGB', (1400, 520), 'white')
    d = ImageDraw.Draw(img)
    for i in range(6):
        d.text((40, 30 + i * 75), f'Esquerda numero {i + 1}', fill='black', font=_fonte(40))
        d.text((760, 30 + i * 75), f'Direita numero {i + 1}', fill='black', font=_fonte(40))
    texto = ocr.ocr_imagem(img).lower()
    ultima_esq = texto.rfind('esquerda')
    primeira_dir = texto.find('direita')
    assert ultima_esq != -1 and primeira_dir != -1, texto
    assert ultima_esq < primeira_dir, f'colunas misturadas:\n{texto}'


def test_ocr_imagem_em_branco_devolve_vazio():
    from PIL import Image

    assert ocr.ocr_imagem(Image.new('RGB', (600, 400), 'white')).strip() == ''


def test_ocr_aceita_caminho_de_arquivo():
    import tempfile

    with tempfile.TemporaryDirectory() as pasta:
        caminho = os.path.join(pasta, 'pagina.png')
        _imagem(['Losartana 50 mg']).save(caminho)
        assert 'losartana' in ocr.ocr_imagem(caminho).lower()


if __name__ == '__main__':
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith('test_') and callable(fn):
            try:
                fn()
                print(f'ok   {name}')
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print(f'FAIL {name}: {type(exc).__name__}: {exc}')
    sys.exit(1 if failed else 0)
