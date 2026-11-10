#!/usr/bin/env python3
"""Baixa modelos do manifesto do app desktop (packages/desktop/models.json) e confere o SHA-256.

O manifesto é a fonte única de quais arquivos, de qual revisão e com qual hash: o app desktop baixa
pelo mesmo arquivo. A imagem Docker usa este script para embutir o e5 (busca da biblioteca) e o
reranker em ONNX sem o torch. Só biblioteca padrão, para rodar no início do build.

Uso:  python scripts/fetch_models.py --manifest packages/desktop/models.json \
          --out /opt/qython/embed-models e5-base-int8 rerank-mmarco-int8

Cada modelo vai para <out>/<id>/ com os nomes que o manifesto dá (model.onnx, tokenizer.json...).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.request


def file_url(model: dict, file: dict) -> str:
    """Mesma regra do app desktop (models.js): URL própria, ou o repositório do Hugging Face na revisão fixada."""
    if file.get("url"):
        return file["url"]
    return f"https://huggingface.co/{model['repo']}/resolve/{model['revision']}/{file.get('path') or file['name']}"


def sha256_of(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def is_verified(path: str, file: dict) -> bool:
    return os.path.isfile(path) and os.path.getsize(path) == file["size"] and sha256_of(path) == file["sha256"]


def download(url: str, dest: str, file: dict, retries: int = 3) -> None:
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + ".part"
    last: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(url, timeout=60) as response, open(tmp, "wb") as out:
                while True:
                    block = response.read(1 << 20)
                    if not block:
                        break
                    out.write(block)
            if not is_verified(tmp, file):
                raise RuntimeError(
                    f"{file['name']}: tamanho ou SHA-256 não conferem com o manifesto "
                    f"(esperado {file['size']} bytes, {file['sha256']})"
                )
            os.replace(tmp, dest)
            return
        except Exception as exc:  # noqa: BLE001 - tenta de novo e relata o último
            last = exc
            if os.path.exists(tmp):
                os.remove(tmp)
            if attempt < retries:
                time.sleep(2 * attempt)
    raise RuntimeError(f"não consegui baixar {url}: {last}")


def fetch(manifest_path: str, out_dir: str, ids: list[str]) -> list[str]:
    with open(manifest_path, encoding="utf-8") as handle:
        models = {m["id"]: m for m in json.load(handle)["models"]}
    unknown = [i for i in ids if i not in models]
    if unknown:
        raise SystemExit(f"modelos fora do manifesto: {', '.join(unknown)}")
    written = []
    for model_id in ids:
        model = models[model_id]
        for file in model["files"]:
            dest = os.path.join(out_dir, model_id, file["name"])
            if is_verified(dest, file):
                continue
            print(f"baixando {model_id}/{file['name']} ({file['size'] / 1e6:.0f} MB)", flush=True)
            download(file_url(model, file), dest, file)
            written.append(dest)
    return written


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("ids", nargs="+", help="ids do manifesto (ex.: e5-base-int8)")
    args = parser.parse_args(argv)
    fetch(args.manifest, args.out, args.ids)
    return 0


if __name__ == "__main__":
    sys.exit(main())
