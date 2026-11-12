# tests/backend/test_site_terms.py
"""As páginas legais do site (site/terms-of-use e site/privacy-policy).

Rode direto (não há pytest neste repositório):
    python3 tests/backend/test_site_terms.py

O app instalado (celular e computador) abre qython.ai/terms-of-use e qython.ai/privacy-policy; sem as
páginas, o link dá 404. O que importa:
  - a página do termo é exatamente a que scripts/gerar_termos_site.py gera do texto que o app mostra
    (backend/seeds/terms_of_use.py): se alguém muda o termo e esquece a página, isto falha;
  - a política de privacidade existe, aponta para o termo e vice-versa, e o site não carrega nada de
    terceiros (nem script, nem fonte, nem folha de estilo de fora, e o único script próprio não faz
    chamada de rede), porque a própria política afirma isso;
  - a landing liga para as duas páginas.
Só biblioteca padrão.
"""
import importlib.util
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SITE = os.path.join(ROOT, "site")


def ler(*partes):
    return open(os.path.join(SITE, *partes), encoding="utf-8").read()


def gerador():
    spec = importlib.util.spec_from_file_location("gerar_termos_site", os.path.join(ROOT, "scripts", "gerar_termos_site.py"))
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def test_pagina_do_termo_e_a_gerada_do_texto_do_app():
    esperado = gerador().renderizar()
    atual = ler("terms-of-use", "index.html")
    assert atual == esperado, "site/terms-of-use/index.html está desatualizada: rode python3 scripts/gerar_termos_site.py"


def test_termo_traz_o_texto_inteiro_do_app():
    _, _, corpo = gerador().ler_termo()
    pagina = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", ler("terms-of-use", "index.html")))
    pagina = pagina.replace("&quot;", '"').replace("&amp;", "&")
    for titulo in re.findall(r"^(\d+\. .+)$", corpo, re.M):
        assert titulo in pagina, f"falta a seção: {titulo}"
    assert "controlador desses dados nos termos da LGPD" in pagina


def test_paginas_se_ligam_e_a_landing_liga_para_as_duas():
    assert 'href="/privacy-policy/"' in ler("terms-of-use", "index.html")
    assert 'href="/terms-of-use/"' in ler("privacy-policy", "index.html")
    landing = ler("index.html")
    assert 'href="/privacy-policy/"' in landing and 'href="/terms-of-use/"' in landing


def test_politica_de_privacidade_diz_o_essencial():
    texto = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", ler("privacy-policy", "index.html")))
    for trecho in ("Controlador dos dados dos pacientes", "PubMed", "Google Drive", "COPILOT_PUBMED=0",
                   "Leonardo de Abreu", "não usa cookies", "relato privado"):
        assert trecho in texto, f"a política precisa dizer: {trecho}"


def test_site_nao_carrega_nada_de_terceiros():
    for pagina in ("index.html", "404.html", os.path.join("terms-of-use", "index.html"),
                   os.path.join("privacy-policy", "index.html")):
        html = ler(pagina)
        # Script só o próprio da landing (o botão "copiar"): sem src de fora e sem nenhuma chamada de rede.
        for tag in re.findall(r"<script\b([^>]*)>(.*?)</script>", html, re.I | re.S):
            assert "src=" not in tag[0].lower(), f"{pagina} carrega script de fora"
            codigo = re.sub(r"//[^\n]*|/\*.*?\*/", "", tag[1], flags=re.S)  # comentário não conta
            assert not re.search(r"fetch\(|XMLHttpRequest|sendBeacon|WebSocket|https?://", codigo), f"{pagina}: o script faz chamada de rede"
        for m in re.finditer(r'<(?:link|img|source|iframe)\b[^>]*\b(?:src|href)="(https?://[^"]+)"', html, re.I):
            if 'rel="canonical"' in m.group(0).lower():
                continue
            assert m.group(1).startswith("https://qython.ai"), f"{pagina} carrega recurso de fora: {m.group(1)}"
        assert "fonts.googleapis" not in html and "fonts.gstatic" not in html
    assert "@import" not in ler("legal.css") and "url(http" not in ler("legal.css")


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
