# tests/backend/test_llm_provider_live.py
"""Live wiring test for the OpenAI-compatible provider against a real llama-server.

Run directly (no pytest harness in this repo), with a server up:
    LLM_BASE_URL=http://127.0.0.1:8081/v1 python3 tests/backend/test_llm_provider_live.py

Checks the plumbing, not answer quality: the request shapes the backend sends
(system instruction, chat history with repeated roles, JSON schema, thinking off)
reach the server and come back as the attributes the call sites read. CI runs it
with a tiny model (.github/workflows/ia-local.yml).
"""
import json
import os
import sys

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
sys.path.insert(0, project_root)

from google.genai import types  # noqa: E402

from qython.backend.services import llm_provider as lp  # noqa: E402

BASE_URL = os.environ.get("LLM_BASE_URL")


def client():
    return lp.OpenAICompatibleClient(base_url=BASE_URL, model=os.environ.get("LLM_MODEL", "local"), timeout=300)


def test_plain_chat_with_system_instruction():
    cfg = types.GenerateContentConfig(system_instruction="Responda em uma frase.", max_output_tokens=64, temperature=0)
    resp = client().models.generate_content(model="models/gemini-x", contents="Diga olá.", config=cfg)
    assert resp.text and resp.text.strip(), "resposta vazia"
    assert "<think>" not in resp.text
    assert resp.usage_metadata.prompt_token_count > 0


def test_history_with_repeated_roles():
    history = [
        {"role": "user", "parts": [{"text": "Meu nome é Ana."}]},
        {"role": "model", "parts": [{"text": "Prazer, Ana."}]},
        {"role": "user", "parts": [{"text": "Contexto: sem contexto."}]},
        {"role": "user", "parts": [types.Part(text="Repita meu nome.")]},
    ]
    resp = client().models.generate_content(
        model="models/gemini-x", contents=history,
        config=types.GenerateContentConfig(max_output_tokens=32, temperature=0))
    assert resp.text is not None


def test_json_schema_output():
    schema = types.Schema(type=types.Type.OBJECT, required=["codigos"], properties={
        "codigos": types.Schema(type=types.Type.ARRAY, items=types.Schema(type=types.Type.STRING)),
    })
    cfg = types.GenerateContentConfig(response_mime_type="application/json", response_schema=schema,
                                      max_output_tokens=96, temperature=0)
    resp = client().models.generate_content(
        model="models/gemini-x", contents="Liste dois códigos CID-10 de hipertensão.", config=cfg)
    data = json.loads(resp.text)
    assert isinstance(data.get("codigos"), list), data


def test_output_cap_is_respected():
    cfg = types.GenerateContentConfig(max_output_tokens=8, temperature=0)
    resp = client().models.generate_content(model="models/gemini-x", contents="Conte até cem.", config=cfg)
    assert resp.usage_metadata.candidates_token_count <= 8
    assert resp.candidates[0].finish_reason == types.FinishReason.MAX_TOKENS


if __name__ == "__main__":
    if not BASE_URL:
        sys.exit("Defina LLM_BASE_URL (ex.: http://127.0.0.1:8081/v1).")
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} testes ao vivo passaram")
