#!/usr/bin/env bash
# Reúne as DLLs do Pango/GTK que o WeasyPrint carrega (e tudo de que elas dependem) a partir do
# MSYS2/MINGW64, para o PyInstaller colocá-las dentro do pacote do backend. Sem isto o Windows não
# tem Pango e a geração de PDF (receita, atestado, materiais) não funcionaria.
#
# Roda dentro de um shell MINGW64 do MSYS2, com mingw-w64-x86_64-pango e mingw-w64-x86_64-ntldd
# instalados:  bash pdf-libs/windows.sh pdf-libs/win
set -euo pipefail
OUT="${1:?uso: windows.sh <pasta de destino>}"
BIN=/mingw64/bin
# As seis bibliotecas que o weasyprint/text/ffi.py abre pelo nome.
ROOTS="libgobject-2.0-0.dll libpango-1.0-0.dll libpangoft2-1.0-0.dll libharfbuzz-0.dll libharfbuzz-subset-0.dll libfontconfig-1.dll"

rm -rf "$OUT"
mkdir -p "$OUT"
for dll in $ROOTS; do
  [ -f "$BIN/$dll" ] || { echo "::error::falta $BIN/$dll (instale mingw-w64-x86_64-pango)"; exit 1; }
  cp -n "$BIN/$dll" "$OUT/"
  ntldd -R "$BIN/$dll" | sed -n 's/.*=> \(.*\) (0x.*/\1/p' | while read -r dep; do
    dep="$(cygpath -u "$dep")"
    case "$dep" in
      /mingw64/*) cp -n "$dep" "$OUT/" ;;  # só o que é do MSYS2; o que é do Windows fica de fora
    esac
  done
done
echo "DLLs reunidas em $OUT: $(ls -1 "$OUT" | wc -l)"
ls -1 "$OUT"
