# tests/backend/test_llm_provider.py
"""Standalone tests for the OpenAI-compatible provider (backend/services/llm_provider.py).

Run directly (no pytest harness in this repo):
    python3 tests/backend/test_llm_provider.py

Covers the translation from the Gemini SDK request shapes the backend actually
uses (text, part lists, chat history dicts, types.Content with inline images,
GenerateContentConfig with JSON schema) to /v1/chat/completions, and the
response back into the attributes the call sites read. No network: the OpenAI
client's create() is replaced by a stub that records the request.
"""
import os
import sys
from types import SimpleNamespace

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
sys.path.insert(0, project_root)

from google.genai import types  # noqa: E402

from qython.backend.services import llm_provider as lp  # noqa: E402


def test_plain_text():
    assert lp.to_openai_messages("Olá") == [{"role": "user", "content": "Olá"}]


def test_system_instruction_and_parts():
    msgs = lp.to_openai_messages(["Contexto", types.Part(text="Pergunta")], system_instruction="Seja breve")
    assert msgs == [
        {"role": "system", "content": "Seja breve"},
        {"role": "user", "content": "Contexto\nPergunta"},
    ]


def test_chat_history_dicts_alternate_and_merge():
    # Formato do chat_with_google_ai: dicts {'role','parts'} com 'model' para o assistente.
    history = [
        {"role": "user", "parts": [{"text": "oi"}]},
        {"role": "model", "parts": [{"text": "olá"}]},
        {"role": "user", "parts": [{"text": "contexto da biblioteca"}]},
        {"role": "user", "parts": [types.Part(text="pergunta final")]},
    ]
    msgs = lp.to_openai_messages(history)
    assert [m["role"] for m in msgs] == ["user", "assistant", "user"]
    assert msgs[2]["content"] == "contexto da biblioteca\npergunta final"


def test_inline_image_becomes_data_uri():
    content = types.Content(parts=[
        types.Part.from_bytes(data=b"\x89PNG fake", mime_type="image/png"),
        types.Part(text="Descreva a imagem"),
    ])
    msgs = lp.to_openai_messages([content])
    items = msgs[0]["content"]
    assert items[0]["type"] == "image_url"
    assert items[0]["image_url"]["url"].startswith("data:image/png;base64,")
    assert items[1] == {"type": "text", "text": "Descreva a imagem"}


def test_audio_is_refused():
    part = types.Part.from_bytes(data=b"RIFF", mime_type="audio/wav")
    try:
        lp.to_openai_messages([part])
    except lp.CapabilityUnavailable:
        return
    raise AssertionError("áudio inline deveria exigir o Gemini")


def test_json_schema_from_types_schema_and_dict():
    schema = types.Schema(type=types.Type.OBJECT, required=["codes"], properties={
        "codes": types.Schema(type=types.Type.ARRAY, items=types.Schema(type=types.Type.STRING)),
    })
    cfg = types.GenerateContentConfig(response_mime_type="application/json", response_schema=schema,
                                      temperature=0.2, max_output_tokens=512)
    params = lp.to_openai_params(cfg)
    assert params["temperature"] == 0.2 and params["max_tokens"] == 512
    js = params["response_format"]["json_schema"]["schema"]
    assert js["type"] == "object" and js["properties"]["codes"]["items"]["type"] == "string"

    # dict no estilo do backend (icd10_schema), com config em dict (material_generation)
    params = lp.to_openai_params({"response_mime_type": "application/json",
                                  "response_schema": {"type": "array", "items": {"type": "string"}}})
    assert params["response_format"]["json_schema"]["schema"]["type"] == "array"

    params = lp.to_openai_params({"response_mime_type": "application/json"})
    assert params["response_format"] == {"type": "json_object"}


def test_image_generation_refused():
    try:
        lp.to_openai_params(types.GenerateContentConfig(response_modalities=["IMAGE", "TEXT"]))
    except lp.CapabilityUnavailable:
        return
    raise AssertionError("gerar imagem deveria exigir o Gemini")


def test_client_roundtrip_with_stub():
    client = lp.OpenAICompatibleClient(base_url="http://127.0.0.1:9/v1", model="gemma-teste")
    seen = {}

    def fake_create(**request):
        seen.update(request)
        assert request["extra_body"] == {"chat_template_kwargs": {"enable_thinking": False}}
        return SimpleNamespace(
            choices=[SimpleNamespace(
                message=SimpleNamespace(content="<think>rascunho</think>\n[\"I10\"]"),
                finish_reason="length",
            )],
            usage=SimpleNamespace(prompt_tokens=12, completion_tokens=5),
        )

    client._client.chat.completions.create = fake_create
    cfg = types.GenerateContentConfig(system_instruction="Extraia CIDs",
                                      response_mime_type="application/json",
                                      tools=[types.Tool(google_search=types.GoogleSearch())])
    resp = client.models.generate_content(model="models/gemini-3.1-flash-lite", contents="HAS", config=cfg)

    assert seen["model"] == "gemma-teste"
    assert seen["messages"][0] == {"role": "system", "content": "Extraia CIDs"}
    assert "tools" not in seen  # google_search não tem equivalente
    assert resp.text == '["I10"]'  # raciocínio vazado removido
    assert resp.candidates[0].finish_reason == types.FinishReason.MAX_TOKENS
    assert resp.candidates[0].grounding_metadata is None
    assert resp.usage_metadata.prompt_token_count == 12
    assert resp.usage_metadata.candidates_token_count == 5


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
        print(f"ok  {t.__name__}")
    print(f"\n{len(tests)} testes passaram")
