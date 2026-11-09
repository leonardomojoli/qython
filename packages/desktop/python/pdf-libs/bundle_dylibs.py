"""Reúne as bibliotecas do Pango/GTK que o WeasyPrint carrega no macOS (Homebrew) e tudo de que
elas dependem, reescrevendo os caminhos para `@loader_path/`, de modo que funcionem de dentro do
pacote do backend, num Mac sem Homebrew.

    python3 pdf-libs/bundle_dylibs.py pdf-libs/mac

Os nomes dos arquivos seguem o que o weasyprint/text/ffi.py procura: ele abre `libpango-1.0.dylib`
e `libpangoft2-1.0.dylib` (sem o `.0`), então essas duas bibliotecas são gravadas com esses nomes
e quem depende delas é reescrito para o nome novo.
"""
import os
import shutil
import subprocess
import sys

# SEM libharfbuzz-subset: o WeasyPrint a usa para reduzir as fontes embutidas no PDF e, sem ela, cai no
# fontTools (mais lento, mas puro Python). No CI do macOS a harfbuzz-subset do Homebrew derrubou o processo
# (EXC_BAD_ACCESS em OT::StatAxisRecord::get_name_id) ao reduzir uma fonte do sistema com tabela STAT.
ROOTS = [
    "libgobject-2.0.0.dylib", "libpango-1.0.0.dylib", "libpangoft2-1.0.0.dylib",
    "libharfbuzz.0.dylib", "libfontconfig.1.dylib",
]
RENAME = {"libpango-1.0.0.dylib": "libpango-1.0.dylib", "libpangoft2-1.0.0.dylib": "libpangoft2-1.0.dylib"}
SYSTEM = ("/usr/lib/", "/System/")


def otool_deps(path):
    lines = subprocess.check_output(["otool", "-L", path], text=True).splitlines()[1:]
    return [line.strip().split(" (")[0] for line in lines]


def find(dep, origin_dir, search_dirs):
    """Caminho real de uma dependência, ou None se ela é do sistema."""
    if dep.startswith(SYSTEM):
        return None
    if dep.startswith("@loader_path/"):
        candidate = os.path.join(origin_dir, dep[len("@loader_path/"):])
    elif dep.startswith(("@rpath/", "@executable_path/")):
        base = os.path.basename(dep)
        candidate = next((os.path.join(d, base) for d in search_dirs if os.path.exists(os.path.join(d, base))), dep)
    else:
        candidate = dep
    return os.path.realpath(candidate) if os.path.exists(candidate) else None


def main(out):
    prefix = subprocess.check_output(["brew", "--prefix"], text=True).strip()
    search_dirs = [os.path.join(prefix, "lib")]
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)

    bundled = {}  # caminho real -> nome no pacote
    queue = []
    for name in ROOTS:
        real = os.path.realpath(os.path.join(prefix, "lib", name))
        if not os.path.exists(real):
            sys.exit(f"::error::falta {name} em {prefix}/lib (brew install pango)")
        queue.append((real, RENAME.get(name, name)))
    while queue:
        real, name = queue.pop(0)
        if real in bundled:
            continue
        bundled[real] = name
        dest = os.path.join(out, name)
        shutil.copy2(real, dest)
        os.chmod(dest, 0o644)
        for dep in otool_deps(real):
            found = find(dep, os.path.dirname(real), search_dirs)
            if found and found not in bundled:
                base = os.path.basename(dep)
                queue.append((found, RENAME.get(base, base)))

    # Reescreve os caminhos: cada biblioteca passa a achar as outras ao lado dela.
    for real, name in bundled.items():
        dest = os.path.join(out, name)
        subprocess.check_call(["install_name_tool", "-id", f"@loader_path/{name}", dest])
        for dep in otool_deps(real)[1:]:  # o primeiro item é o próprio nome da biblioteca
            found = find(dep, os.path.dirname(real), search_dirs)
            if found and found in bundled:
                subprocess.check_call(["install_name_tool", "-change", dep, f"@loader_path/{bundled[found]}", dest])
        # O install_name_tool invalida a assinatura; no Apple silicon o código sem assinatura não carrega.
        subprocess.check_call(["codesign", "--force", "--sign", "-", dest])

    print(f"{len(bundled)} bibliotecas em {out}:")
    for name in sorted(bundled.values()):
        print("  ", name)
    # Conferência: nada pode apontar para fora da pasta (exceto o sistema).
    bad = []
    for name in bundled.values():
        for dep in otool_deps(os.path.join(out, name))[1:]:
            if not dep.startswith(SYSTEM) and not dep.startswith("@loader_path/"):
                bad.append((name, dep))
    if bad:
        sys.exit("::error::dependências fora do pacote: " + repr(bad))


if __name__ == "__main__":
    main(sys.argv[1])
