"""Busca da biblioteca sem torch: os vetores vêm do serviço de embeddings (EMBED_SERVER_URL).

Sem rede nem Chroma: o cliente do serviço é trocado por um de mentira. Rodar:
    python tests/backend/test_vector_search.py
"""
import os
import sys

# Antes do import: o módulo lê EMBED_SERVER_URL ao carregar.
os.environ.pop("EMBED_SERVER_URL", None)
os.environ.setdefault("JWT_SECRET_KEY", "x" * 40)
os.environ.setdefault("DATABASE_URL", "postgresql://t:t@127.0.0.1:1/t")
os.environ.setdefault("QYTHON_ALLOW_EPHEMERAL_KEK", "1")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.services.academic_services import embedding_client as ec  # noqa: E402
from backend.services.academic_services import vector_db_service as v  # noqa: E402


def test_sem_servico_de_embeddings_o_erro_e_claro():
    assert not ec.is_v2_enabled()
    try:
        v._embed(["texto"], "passage")
    except RuntimeError as exc:
        assert "EMBED_SERVER_URL" in str(exc)
        return
    raise AssertionError("indexou sem serviço de embeddings configurado")


def test_com_servico_usa_o_cliente_e_o_tipo():
    vistos = []
    antigo_url, antigo_embed = ec.EMBED_SERVER_URL, ec.embed_texts
    ec.EMBED_SERVER_URL = "http://embedder:8003"
    ec.embed_texts = lambda texts, kind: vistos.append((list(texts), kind)) or [[0.0] * 3 for _ in texts]
    try:
        assert v._embed(["a", "b"], "query") == [[0.0] * 3, [0.0] * 3]
        assert vistos == [(["a", "b"], "query")]
    finally:
        ec.EMBED_SERVER_URL, ec.embed_texts = antigo_url, antigo_embed


def test_colecao_e_de_cosseno_com_sufixo_e5():
    assert v._collection_name(12) == "library_12_e5"

    class Fake:
        def get_or_create_collection(self, name, metadata=None):
            self.args = (name, metadata)
            return self

    fake = Fake()
    v._get_or_create_collection(fake, 12)
    assert fake.args == ("library_12_e5", {"hnsw:space": "cosine"})


def test_nao_ha_mais_caminho_do_torch():
    assert not hasattr(v, "get_embeddings_model")
    import importlib.util
    assert importlib.util.find_spec("backend.embed_server") is None


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
