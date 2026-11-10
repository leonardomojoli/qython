"""macOS: deixa as bibliotecas do PDF (Pango e companhia) autocontidas na pasta pdf-libs/mac do pacote.

O pacote leva duas famílias de bibliotecas com o MESMO nome: as do Pango, que o CI reúne do
Homebrew, e as do opencv, que a roda do opencv-python-headless traz em cv2/.dylibs (libglib, libpng,
libfreetype...). O PyInstaller resolve dependência por NOME de arquivo, então a libgobject do Pango
acabava ligada à libglib do opencv, mais antiga, e o dlopen falhava com
`Symbol not found: _g_string_copy` (o WeasyPrint só relata o último nome que tentou, o que escondia a
causa; o erro real saiu do selftest e do relatório de falha do macOS).

Aqui, depois do COLLECT, cada biblioteca da pasta passa a apontar as irmãs por `@loader_path/<irmã>`
(caminho explícito, que nenhum rpath nem nome repetido desvia) e ganha um id `@loader_path/<nome>`,
que o dyld não confunde com o `@rpath/<nome>` das do opencv. Depois refaz a assinatura: o
install_name_tool a invalida, e o macOS em arm64 mata o processo que carrega biblioteca com
assinatura inválida.

Uso (pelo qython-backend.spec):  fix_dylibs.main("<pasta com os .dylib>")
"""
import glob
import os
import subprocess
from typing import Iterable, List, Tuple


def parse_deps(otool_l_output: str) -> List[str]:
    """Os caminhos que `otool -L` lista (a 1ª linha é o próprio arquivo, e as demais, as dependências)."""
    lines = otool_l_output.strip().splitlines()[1:]
    return [line.strip().split(" (")[0] for line in lines if line.strip()]


def parse_id(otool_d_output: str) -> str:
    """O id (LC_ID_DYLIB) que `otool -D` imprime na 2ª linha."""
    lines = otool_d_output.strip().splitlines()
    return lines[1].strip() if len(lines) > 1 else ""


def rewrites(deps: Iterable[str], own_id: str, siblings: Iterable[str]) -> List[Tuple[str, str]]:
    """(antigo, novo) para cada dependência que é uma biblioteca irmã (pelo nome) e ainda não aponta
    para `@loader_path/<nome>`. O próprio id não é dependência e fica de fora."""
    names = set(siblings)
    out = []
    for dep in deps:
        if dep == own_id:
            continue
        name = os.path.basename(dep)
        if name in names and dep != f"@loader_path/{name}":
            out.append((dep, f"@loader_path/{name}"))
    return out


def _run(*cmd: str) -> str:
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout


def main(folder: str) -> int:
    libs = sorted(glob.glob(os.path.join(folder, "*.dylib")))
    names = {os.path.basename(p) for p in libs}
    for lib in libs:
        own_id = parse_id(_run("otool", "-D", lib))
        for old, new in rewrites(parse_deps(_run("otool", "-L", lib)), own_id, names):
            _run("install_name_tool", "-change", old, new, lib)
        _run("install_name_tool", "-id", f"@loader_path/{os.path.basename(lib)}", lib)
        _run("codesign", "--force", "--sign", "-", lib)
    return len(libs)
