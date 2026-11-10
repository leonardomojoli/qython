"""Nenhum import do backend aponta para um módulo ou nome que não existe mais.

Importar a aplicação só prova os imports do TOPO dos módulos; os feitos dentro de função (muitos, para
tardar pacotes pesados e quebrar ciclos) só falhariam quando alguém chamasse a rota. Este teste lê todos
os arquivos de backend/ e confere, por análise estática, cada `import backend...` e cada `from ... import
nome`: o módulo existe e o nome é definido nele (função, classe, variável, importação ou submódulo).
Serve de rede de segurança para apagar código sem deixar chamadas penduradas.

Rodar: python tests/backend/test_imports_resolve.py
"""
import ast
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BACKEND = os.path.join(ROOT, "backend")


def collect_modules():
    mods = {}
    for folder, _dirs, files in os.walk(BACKEND):
        if "__pycache__" in folder:
            continue
        for name in files:
            if not name.endswith(".py"):
                continue
            path = os.path.join(folder, name)
            dotted = os.path.relpath(path[:-3], ROOT).replace(os.sep, ".")
            if dotted.endswith(".__init__"):
                dotted = dotted[: -len(".__init__")]
            mods[dotted] = path
    # Pastas sem __init__.py (backend, backend/services...) também são pacotes importáveis.
    for folder, _dirs, _files in os.walk(BACKEND):
        if "__pycache__" in folder:
            continue
        dotted = os.path.relpath(folder, ROOT).replace(os.sep, ".")
        if dotted not in mods:
            mods[dotted] = None
    return mods


def defined_names(tree):
    """Nomes visíveis de fora de um módulo: tudo que o nível de topo define ou importa."""
    names = set()
    star = False
    for node in ast.walk(tree):
        # Definições de nível de topo (e dentro de try/if de topo) valem; funções aninhadas não são exportadas,
        # mas aceitar a mais só deixa o teste menos rígido, nunca errado para o que importa (nome inexistente).
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                for sub in ast.walk(target):
                    if isinstance(sub, ast.Name):
                        names.add(sub.id)
        elif isinstance(node, (ast.AnnAssign, ast.AugAssign)) and isinstance(node.target, ast.Name):
            names.add(node.target.id)
        elif isinstance(node, ast.Import):
            for alias in node.names:
                names.add((alias.asname or alias.name).split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            for alias in node.names:
                if alias.name == "*":
                    star = True
                else:
                    names.add(alias.asname or alias.name)
    return names, star


def check():
    mods = collect_modules()
    trees = {}
    for dotted, path in mods.items():
        if path is None:
            trees[dotted] = ast.parse("")  # pacote sem __init__.py: só tem submódulos
            continue
        with open(path, encoding="utf-8") as handle:
            trees[dotted] = ast.parse(handle.read(), filename=path)
    exported = {dotted: defined_names(tree) for dotted, tree in trees.items()}
    problems = []

    for dotted, tree in trees.items():
        is_pkg = mods[dotted] is None or mods[dotted].endswith("__init__.py")
        package = dotted if is_pkg else dotted.rsplit(".", 1)[0]
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name.startswith("backend.") and alias.name not in mods:
                        problems.append(f"{dotted}:{node.lineno}: import {alias.name} (módulo inexistente)")
            elif isinstance(node, ast.ImportFrom):
                if node.level:
                    base = package.split(".")
                    base = base[: len(base) - (node.level - 1)]
                    target = ".".join(base + ([node.module] if node.module else []))
                else:
                    target = node.module or ""
                if not (target == "backend" or target.startswith("backend.")):
                    continue
                if target not in mods:
                    problems.append(f"{dotted}:{node.lineno}: from {target} import ... (módulo inexistente)")
                    continue
                names, star = exported[target]
                for alias in node.names:
                    if alias.name == "*" or star or alias.name in names or f"{target}.{alias.name}" in mods:
                        continue
                    problems.append(f"{dotted}:{node.lineno}: from {target} import {alias.name} (nome inexistente)")
    return problems


def test_todos_os_imports_do_backend_resolvem():
    problems = check()
    assert not problems, "imports pendurados:\n  " + "\n  ".join(problems)


if __name__ == "__main__":
    found = check()
    for line in found:
        print("FAIL", line)
    print("ok  test_todos_os_imports_do_backend_resolvem" if not found else f"{len(found)} problema(s)")
    sys.exit(1 if found else 0)
