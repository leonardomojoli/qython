"""scripts/fetch_models.py: o hash do manifesto é a barreira entre a imagem e um arquivo trocado.

Sem rede: um arquivo local faz o papel do Hugging Face. Rodar: python tests/backend/test_fetch_models.py
"""
import hashlib
import json
import os
import sys
import pathlib
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts"))
import fetch_models  # noqa: E402


def manifest(tmp, payload: bytes, *, sha=None, size=None, with_url=True):
    source = os.path.join(tmp, "origem.bin")
    with open(source, "wb") as handle:
        handle.write(payload)
    file = {
        "role": "model", "name": "model.onnx", "path": "onnx/model_quantized.onnx",
        "size": len(payload) if size is None else size,
        "sha256": hashlib.sha256(payload).hexdigest() if sha is None else sha,
    }
    if with_url:
        file["url"] = pathlib.Path(source).as_uri()
    path = os.path.join(tmp, "models.json")
    with open(path, "w", encoding="utf-8") as handle:
        json.dump({"models": [{"id": "demo", "kind": "support", "repo": "a/b", "revision": "r1", "files": [file]}]}, handle)
    return path


def test_baixa_e_confere():
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "out")
        written = fetch_models.fetch(manifest(tmp, b"conteudo do modelo"), out, ["demo"])
        assert [os.path.basename(p) for p in written] == ["model.onnx"]
        with open(os.path.join(out, "demo", "model.onnx"), "rb") as handle:
            assert handle.read() == b"conteudo do modelo"


def test_hash_errado_nao_deixa_arquivo():
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "out")
        path = manifest(tmp, b"conteudo", sha="0" * 64)
        try:
            fetch_models.fetch(path, out, ["demo"], retries=1)
        except RuntimeError as exc:
            assert "não consegui baixar" in str(exc)
        else:
            raise AssertionError("aceitou um arquivo com o SHA-256 errado")
        assert not os.path.exists(os.path.join(out, "demo", "model.onnx"))
        assert not os.path.exists(os.path.join(out, "demo", "model.onnx.part"))


def test_tamanho_errado_recusa():
    with tempfile.TemporaryDirectory() as tmp:
        path = manifest(tmp, b"conteudo", size=3)
        try:
            fetch_models.fetch(path, os.path.join(tmp, "out"), ["demo"], retries=1)
        except RuntimeError:
            return
        raise AssertionError("aceitou um arquivo do tamanho errado")


def test_arquivo_ja_conferido_nao_baixa_de_novo():
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "out")
        path = manifest(tmp, b"abc")
        assert len(fetch_models.fetch(path, out, ["demo"])) == 1
        os.remove(os.path.join(tmp, "origem.bin"))  # sem a origem, só passa se nada for baixado
        assert fetch_models.fetch(path, out, ["demo"]) == []


def test_modelo_fora_do_manifesto():
    with tempfile.TemporaryDirectory() as tmp:
        try:
            fetch_models.fetch(manifest(tmp, b"x"), os.path.join(tmp, "out"), ["outro"])
        except SystemExit as exc:
            assert "outro" in str(exc)
            return
        raise AssertionError("aceitou um id que não existe")


def test_url_do_hugging_face_na_revisao_fixada():
    model = {"repo": "Xenova/multilingual-e5-base", "revision": "abc123"}
    assert fetch_models.file_url(model, {"name": "tokenizer.json"}) == \
        "https://huggingface.co/Xenova/multilingual-e5-base/resolve/abc123/tokenizer.json"
    assert fetch_models.file_url(model, {"name": "model.onnx", "path": "onnx/model_quantized.onnx"}).endswith(
        "/resolve/abc123/onnx/model_quantized.onnx")
    assert fetch_models.file_url(model, {"name": "x", "url": "https://exemplo.org/x"}) == "https://exemplo.org/x"


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print("ok  ", name)
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print("FAIL", name, "->", exc)
    sys.exit(1 if failed else 0)
