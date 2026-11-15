#!/usr/bin/env python3
"""Gera site/terms-of-use/index.html a partir do termo de uso que o app mostra.

O texto do termo mora em backend/seeds/terms_of_use.py (é o que a pessoa aceita no primeiro acesso, com
versão e hash). A página do site é uma cópia gerada dele, para as duas nunca divergirem: o teste
tests/backend/test_site_terms.py falha se a página commitada não for igual à que este script gera.

Uso:  python3 scripts/gerar_termos_site.py            grava a página
      python3 scripts/gerar_termos_site.py --stdout   só imprime
Só biblioteca padrão: lê o arquivo do termo por análise estática, sem importar o backend.
"""
import ast
import html
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SEED = os.path.join(ROOT, "backend", "seeds", "terms_of_use.py")
OUT = os.path.join(ROOT, "site", "terms-of-use", "index.html")


def ler_termo():
    """(versão, título, corpo) do termo, sem executar o módulo."""
    tree = ast.parse(open(SEED, encoding="utf-8").read())
    valores = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
            nome = node.targets[0].id
            if nome in ("TERMS_VERSION", "TERMS_TITLE", "TERMS_BODY"):
                valores[nome] = ast.literal_eval(node.value)
    return valores["TERMS_VERSION"], valores["TERMS_TITLE"], valores["TERMS_BODY"]


def blocos(corpo):
    """Corpo em blocos: ('h2', texto) | ('p', texto) | ('ul', [itens]). As linhas do termo são quebradas à mão."""
    saida, atual, lista = [], [], None

    def fecha_paragrafo():
        nonlocal atual
        if atual:
            saida.append(("p", " ".join(s.strip() for s in atual)))
            atual = []

    def fecha_lista():
        nonlocal lista
        if lista is not None:
            saida.append(("ul", [" ".join(item) for item in lista]))
            lista = None

    for linha in corpo.split("\n"):
        if not linha.strip():
            fecha_paragrafo(); fecha_lista()
        elif re.match(r"^\s+- ", linha):
            fecha_paragrafo()
            lista = lista if lista is not None else []
            lista.append([linha.strip()[2:].strip()])
        elif lista is not None and linha.startswith("    "):
            lista[-1].append(linha.strip())  # continuação do item
        elif re.match(r"^\d+\. \S", linha) and not atual:
            fecha_lista()
            saida.append(("h2", linha.strip()))
        else:
            fecha_lista()
            atual.append(linha)
    fecha_paragrafo(); fecha_lista()
    return saida


def renderizar():
    versao, titulo, corpo = ler_termo()
    linhas = corpo.split("\n")
    # linha 1: título em maiúsculas; linha 2: "Versão ... · data"; o resto é o termo.
    data = linhas[1].split("·", 1)[1].strip() if "·" in linhas[1] else ""
    partes = []
    for tipo, valor in blocos("\n".join(linhas[2:])):
        if tipo == "h2":
            partes.append(f"    <h2>{html.escape(valor)}</h2>")
        elif tipo == "p":
            partes.append(f"    <p>{html.escape(valor)}</p>")
        else:
            itens = "\n".join(f"      <li>{html.escape(i)}</li>" for i in valor)
            partes.append(f"    <ul>\n{itens}\n    </ul>")
    corpo_html = "\n".join(partes)
    return f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(titulo)} · Qython</title>
<meta name="description" content="Termo de uso do Qython, software livre de apoio à documentação clínica.">
<link rel="icon" href="/favicon.png">
<meta name="theme-color" content="#0d0d12">
<meta name="color-scheme" content="dark">
<link rel="stylesheet" href="/legal.css">
</head>
<body>
  <header><a href="/"><img src="/logo.png" alt="Qython"></a></header>
  <main>
    <h1>{html.escape(titulo)}</h1>
    <p class="meta">Versão {html.escape(versao)} · {html.escape(data)} · Este é o mesmo texto que o aplicativo mostra no primeiro acesso.</p>
{corpo_html}
  </main>
  <footer>
    <a href="/">Início</a>
    <a href="/privacy-policy/">Política de privacidade</a>
    <a href="https://github.com/leonardomojoli/qython/blob/main/LICENSE">Licença AGPL-3.0</a>
  </footer>
</body>
</html>
"""


if __name__ == "__main__":
    pagina = renderizar()
    if "--stdout" in sys.argv:
        sys.stdout.write(pagina)
    else:
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        open(OUT, "w", encoding="utf-8", newline="\n").write(pagina)
        print("gerado:", os.path.relpath(OUT, ROOT))
