# qython/backend/services/llm_provider.py
"""
Provedor de IA trocável: Google Gemini ou qualquer servidor compatível com a API da
OpenAI — llama.cpp (`llama-server`), Ollama, LM Studio, vLLM, OpenRouter, a própria
OpenAI.

O backend inteiro fala com a IA pela interface do SDK do Gemini,
`client.models.generate_content(model=..., contents=..., config=...)`. Em vez de
reescrever as ~30 chamadas, o provedor OpenAI-compatível imita essa interface:
traduz o pedido para /v1/chat/completions e devolve um objeto com os campos que o
código lê (`.text`, `.candidates`, `.usage_metadata`).

O que não tem equivalente fora do Gemini fica de fora, e `capabilities()` diz o que
a instalação oferece, para o front esconder ou avisar:
  - busca do Google (tool google_search): a resposta vem sem grounding;
  - geração de imagem e de áudio (TTS): exigem a chave do Gemini.

Configuração (.env):
  LLM_PROVIDER    gemini | openai. Padrão: gemini se houver GEMINI_API_KEY.
  LLM_BASE_URL    endereço da API, com o /v1 (ex.: http://127.0.0.1:8081/v1).
  LLM_MODEL       nome do modelo para o servidor (o llama-server ignora; o Ollama
                  exige, ex.: gemma4:e4b).
  LLM_API_KEY     só para servidores que pedem chave.
  LLM_TIMEOUT_SECONDS  tempo máximo de uma resposta (padrão 600: CPU é lenta).
  LLM_THINKING    on | off (padrão off). Modelos como o Gemma 4 raciocinam antes de
                  responder; em CPU, a uns 8 tokens/s, isso custa minutos e pode
                  esgotar o limite de tokens antes da resposta.
"""

from __future__ import annotations

import base64
import logging
import os
import re
import time
from dataclasses import dataclass, field
from typing import Any, List, Optional

from google.genai import types

logger = logging.getLogger("qython_logger")


class CapabilityUnavailable(RuntimeError):
    """O provedor configurado não faz isso (ex.: gerar imagem sem o Gemini)."""


def provider_name() -> str:
    explicit = (os.getenv("LLM_PROVIDER") or "").strip().lower()
    if explicit in ("gemini", "openai"):
        return explicit
    return "gemini" if os.getenv("GEMINI_API_KEY") else "openai"


def capabilities() -> dict:
    """O que a IA desta instalação faz. Imagem e áudio dependem só de haver uma
    chave do Gemini, mesmo com o texto num modelo local."""
    gemini_text = provider_name() == "gemini"
    has_gemini_key = bool(os.getenv("GEMINI_API_KEY"))
    return {
        "provider": provider_name(),
        "model": os.getenv("LLM_MODEL") if not gemini_text else None,
        "web_search": gemini_text,
        "image_generation": has_gemini_key,
        "tts": has_gemini_key,
        "vision": True,
    }


# --------------------------------------------------------------------------- #
# Resposta no formato do SDK do Gemini (só os campos que o backend lê)
# --------------------------------------------------------------------------- #

@dataclass
class _Part:
    text: Optional[str] = None
    inline_data: Any = None
    thought: Optional[bool] = None


@dataclass
class _Content:
    parts: List[_Part]
    role: str = "model"


@dataclass
class _Candidate:
    content: _Content
    finish_reason: Any = types.FinishReason.STOP
    grounding_metadata: Any = None
    citation_metadata: Any = None


@dataclass
class _Usage:
    prompt_token_count: int = 0
    candidates_token_count: int = 0
    thoughts_token_count: int = 0
    total_token_count: int = 0


@dataclass
class _Response:
    candidates: List[_Candidate]
    usage_metadata: _Usage = field(default_factory=_Usage)
    prompt_feedback: Any = None
    parsed: Any = None

    @property
    def text(self) -> Optional[str]:
        if not self.candidates:
            return None
        texts = [p.text for p in self.candidates[0].content.parts if p.text]
        return "".join(texts) if texts else None


@dataclass
class _TokenCount:
    total_tokens: int


# --------------------------------------------------------------------------- #
# Tradução do pedido
# --------------------------------------------------------------------------- #

def _get(obj, name, default=None):
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _part_to_openai(part) -> Optional[dict]:
    """Uma parte do Gemini (str, types.Part, dict) -> item de conteúdo da OpenAI."""
    if part is None:
        return None
    if isinstance(part, str):
        return {"type": "text", "text": part}
    text = _get(part, "text")
    if text:
        return {"type": "text", "text": text}
    blob = _get(part, "inline_data")
    if blob is not None:
        data = _get(blob, "data")
        mime = _get(blob, "mime_type") or "application/octet-stream"
        if isinstance(data, (bytes, bytearray)):
            data = base64.b64encode(data).decode("ascii")
        if not mime.startswith("image/"):
            # Áudio, vídeo e PDF inline não têm formato comum entre os servidores.
            raise CapabilityUnavailable(f"Conteúdo {mime} só é aceito pelo Gemini.")
        return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{data}"}}
    if _get(part, "file_data") is not None:
        raise CapabilityUnavailable("Arquivos enviados ao Gemini (file_data) só valem no Gemini.")
    return None


def _is_turn(item) -> bool:
    return isinstance(item, types.Content) or (isinstance(item, dict) and "parts" in item)


def _turns(contents) -> List[tuple]:
    """contents do Gemini -> [(papel, [partes])]. Aceita os formatos usados no
    backend: texto, lista de textos/partes (um turno só), types.Content e dicts
    {'role', 'parts'} (conversa)."""
    if contents is None:
        return []
    if isinstance(contents, (str, types.Part)) or (isinstance(contents, dict) and "parts" not in contents):
        return [("user", [contents])]
    if _is_turn(contents):
        return [(_get(contents, "role") or "user", list(_get(contents, "parts") or []))]
    items = list(contents)
    if items and all(_is_turn(i) for i in items):
        return [(_get(i, "role") or "user", list(_get(i, "parts") or [])) for i in items]
    return [("user", items)]


def _system_text(instruction) -> Optional[str]:
    if instruction is None:
        return None
    if isinstance(instruction, str):
        return instruction
    parts = _get(instruction, "parts")
    if parts is None and isinstance(instruction, (list, tuple)):
        parts = instruction
    texts = [p if isinstance(p, str) else _get(p, "text") for p in (parts or [])]
    return "\n".join(t for t in texts if t) or None


def to_openai_messages(contents, system_instruction=None) -> List[dict]:
    messages = []
    system = _system_text(system_instruction)
    if system:
        messages.append({"role": "system", "content": system})
    for role, parts in _turns(contents):
        items = [i for i in (_part_to_openai(p) for p in parts) if i]
        if not items:
            continue
        role = "assistant" if role == "model" else "user"
        # O Gemini aceita turnos seguidos do mesmo papel; templates de chat de modelos
        # locais (Gemma, por exemplo) recusam se usuário e assistente não alternam.
        if messages and messages[-1]["role"] == role:
            previous = messages[-1]["content"]
            items = ([{"type": "text", "text": previous}] if isinstance(previous, str) else previous) + items
            messages.pop()
        if all(i["type"] == "text" for i in items):
            content: Any = "\n".join(i["text"] for i in items)
        else:
            content = items
        messages.append({"role": role, "content": content})
    return messages


def _json_schema(schema) -> Optional[dict]:
    """response_schema do Gemini (types.Schema, dict ou modelo pydantic) -> JSON Schema."""
    if schema is None:
        return None
    if isinstance(schema, types.Schema):
        return schema.json_schema.model_dump(exclude_none=True, mode="json")
    if isinstance(schema, dict):
        try:
            return types.Schema.model_validate(schema).json_schema.model_dump(exclude_none=True, mode="json")
        except Exception:
            return schema
    if hasattr(schema, "model_json_schema"):
        return schema.model_json_schema()
    return None


def to_openai_params(config) -> dict:
    """GenerateContentConfig (ou dict) -> parâmetros de chat.completions."""
    params: dict = {}
    if config is None:
        return params
    for src, dst in (("temperature", "temperature"), ("top_p", "top_p"),
                     ("max_output_tokens", "max_tokens"), ("seed", "seed")):
        value = _get(config, src)
        if value is not None:
            params[dst] = value
    stop = _get(config, "stop_sequences")
    if stop:
        params["stop"] = list(stop)

    modalities = [str(m).upper() for m in (_get(config, "response_modalities") or [])]
    if any("IMAGE" in m or "AUDIO" in m for m in modalities):
        raise CapabilityUnavailable("Gerar imagem ou áudio exige a chave do Gemini.")

    if _get(config, "response_mime_type") == "application/json":
        schema = _json_schema(_get(config, "response_json_schema") or _get(config, "response_schema"))
        if schema:
            params["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "resposta", "schema": schema},
            }
        else:
            params["response_format"] = {"type": "json_object"}
    # tools (google_search), thinking_config e safety_settings não têm equivalente
    # comum: ficam de fora. A resposta sai sem grounding e sem orçamento de raciocínio.
    return params


# Modelos de raciocínio (Gemma 4 com thinking, Qwen3, DeepSeek) às vezes devolvem o
# raciocínio dentro do texto. O backend espera só a resposta.
_THINK_RE = re.compile(r"<think>.*?</think>\s*", re.DOTALL | re.IGNORECASE)


def _from_openai(completion) -> _Response:
    choice = completion.choices[0] if completion.choices else None
    text = (choice.message.content or "") if choice else ""
    text = _THINK_RE.sub("", text).strip()
    finish = {
        "length": types.FinishReason.MAX_TOKENS,
        "content_filter": types.FinishReason.SAFETY,
    }.get(getattr(choice, "finish_reason", None), types.FinishReason.STOP)
    usage = getattr(completion, "usage", None)
    prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0
    completion_tokens = getattr(usage, "completion_tokens", 0) or 0
    return _Response(
        candidates=[_Candidate(content=_Content(parts=[_Part(text=text)]), finish_reason=finish)],
        usage_metadata=_Usage(
            prompt_token_count=prompt_tokens,
            candidates_token_count=completion_tokens,
            total_token_count=prompt_tokens + completion_tokens,
        ),
    )


# --------------------------------------------------------------------------- #
# Cliente
# --------------------------------------------------------------------------- #

# Servidor local subindo (conexão recusada) ou sobrecarregado: vale tentar de novo.
_RETRIES = max(0, int(os.getenv("LLM_RETRIES", "2")))
_RETRY_BACKOFF = float(os.getenv("LLM_RETRY_BACKOFF", "2.0"))


class _OpenAIModels:
    def __init__(self, client, default_model: str, thinking: bool = False):
        self._client = client
        self._default_model = default_model
        self._thinking = thinking
        # llama.cpp e afins aceitam chat_template_kwargs; a API da OpenAI recusa campo
        # desconhecido. Tenta uma vez e lembra a resposta.
        self._template_kwargs_ok = True

    def generate_content(self, *, model: str = None, contents=None, config=None, **_ignored):
        import openai

        system = _get(config, "system_instruction")
        request = {
            # O nome de modelo do Gemini pedido pela chamada não existe aqui; vale o
            # modelo configurado da instalação.
            "model": self._default_model,
            "messages": to_openai_messages(contents, system),
            **to_openai_params(config),
        }
        last = None
        for attempt in range(_RETRIES + 1):
            extra = {"chat_template_kwargs": {"enable_thinking": self._thinking}} if self._template_kwargs_ok else None
            try:
                completion = self._client.chat.completions.create(**request, extra_body=extra)
                return _from_openai(completion)
            except openai.BadRequestError as exc:
                if extra and "chat_template_kwargs" in str(exc):
                    logger.info("Servidor de IA não aceita chat_template_kwargs; seguindo sem ele.")
                    self._template_kwargs_ok = False
                    completion = self._client.chat.completions.create(**request)
                    return _from_openai(completion)
                raise
            except (openai.APIConnectionError, openai.APITimeoutError, openai.InternalServerError) as exc:
                last = exc
                if attempt < _RETRIES:
                    wait = _RETRY_BACKOFF * (attempt + 1)
                    logger.warning("IA local indisponível (%s); nova tentativa em %.0fs", exc.__class__.__name__, wait)
                    time.sleep(wait)
                    continue
                raise
        raise last  # defensivo

    def count_tokens(self, *, model: str = None, contents=None, **_ignored) -> _TokenCount:
        # Estimativa: o servidor OpenAI-compatível não expõe contagem de tokens. Só a
        # cobrança (desligada fora do SaaS) usa este número.
        text = " ".join(
            m["content"] if isinstance(m["content"], str) else
            " ".join(i.get("text", "") for i in m["content"])
            for m in to_openai_messages(contents)
        )
        return _TokenCount(total_tokens=max(1, len(text) // 4))


class OpenAICompatibleClient:
    """Imita o genai.Client nas partes que o backend usa (`.models`)."""

    def __init__(self, base_url: str, model: str, api_key: Optional[str] = None,
                 timeout: float = 600.0, thinking: bool = False):
        from openai import OpenAI

        # Servidores locais não pedem chave, mas o SDK exige uma string.
        self._client = OpenAI(base_url=base_url, api_key=api_key or "sem-chave",
                              timeout=timeout, max_retries=0)
        self.models = _OpenAIModels(self._client, model, thinking=thinking)

    def count_tokens(self, **kwargs):
        return self.models.count_tokens(**kwargs)


_gemini_client = None


def gemini_client():
    """genai.Client, criado na primeira vez que alguém precisa dele. Serve ao texto
    quando o provedor é o Gemini e ao que só o Gemini faz (imagem, áudio, busca do
    Google) com qualquer provedor. Sem chave, avisa em vez de quebrar o boot: antes o
    cliente nascia na importação dos módulos e o backend nem subia sem a chave."""
    global _gemini_client
    if _gemini_client is None:
        from google import genai

        key = os.getenv("GEMINI_API_KEY")
        if not key:
            raise CapabilityUnavailable("Este recurso precisa de uma chave do Gemini (GEMINI_API_KEY).")
        _gemini_client = genai.Client(
            api_key=key,
            http_options=types.HttpOptions(client_args={"timeout": 300.0}),
        )
    return _gemini_client


class LazyClient:
    """Adia a construção do cliente até o primeiro uso. Os módulos importam `client`
    no carregamento; com isto, importar não exige chave nem servidor no ar."""

    def __init__(self, factory):
        self._factory = factory
        self._client = None

    def _resolve(self):
        if self._client is None:
            self._client = self._factory()
        return self._client

    def __getattr__(self, name):
        return getattr(self._resolve(), name)


def build_openai_client() -> OpenAICompatibleClient:
    base_url = os.getenv("LLM_BASE_URL")
    if not base_url:
        raise RuntimeError(
            "LLM_PROVIDER=openai exige LLM_BASE_URL (ex.: http://127.0.0.1:8081/v1)."
        )
    return OpenAICompatibleClient(
        base_url=base_url.rstrip("/"),
        model=os.getenv("LLM_MODEL") or "local",
        api_key=os.getenv("LLM_API_KEY"),
        timeout=float(os.getenv("LLM_TIMEOUT_SECONDS", "600")),
        thinking=os.getenv("LLM_THINKING", "off").strip().lower() in ("1", "on", "true"),
    )
