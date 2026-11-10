# qython/backend/services/llm_types.py
"""Tipos do pedido e da resposta de IA, sem depender do SDK de nenhum provedor.

O backend monta os pedidos à IA com nomes herdados do SDK do Google (`Schema`, `Type`,
`GenerateContentConfig`, `Part`, `Content`): são ~30 chamadas e centenas de esquemas de saída
estruturada. Em vez de reescrevê-las, este módulo oferece os mesmos nomes, só com o que o
Qython usa, e o `llm_provider` os traduz para a API compatível com a da OpenAI. Quem importa
faz `from . import llm_types as types` e continua escrevendo `types.Schema(...)`.

Nada aqui fala com a rede.
"""

from __future__ import annotations

import enum
from typing import Any, Dict, List, Optional


class Type(str, enum.Enum):
    """Tipos de um campo de esquema (o JSON Schema usa estes nomes em minúsculas)."""

    STRING = "STRING"
    NUMBER = "NUMBER"
    INTEGER = "INTEGER"
    BOOLEAN = "BOOLEAN"
    ARRAY = "ARRAY"
    OBJECT = "OBJECT"


class FinishReason(str, enum.Enum):
    STOP = "STOP"
    MAX_TOKENS = "MAX_TOKENS"
    SAFETY = "SAFETY"
    OTHER = "OTHER"


def _json_type(value: Any) -> Optional[str]:
    if value is None:
        return None
    return str(getattr(value, "value", value)).lower()


class Schema:
    """Esquema de uma resposta JSON. `to_json_schema()` devolve o JSON Schema equivalente,
    que o servidor de IA usa para restringir a geração (constrained decoding)."""

    def __init__(
        self,
        type: Any = None,  # noqa: A002 - mesmo nome do SDK de origem
        properties: Optional[Dict[str, Any]] = None,
        items: Any = None,
        required: Optional[List[str]] = None,
        description: Optional[str] = None,
        enum: Optional[List[Any]] = None,
        nullable: Optional[bool] = None,
        format: Optional[str] = None,  # noqa: A002
        minimum: Optional[float] = None,
        maximum: Optional[float] = None,
        min_items: Optional[int] = None,
        max_items: Optional[int] = None,
        title: Optional[str] = None,
        property_ordering: Optional[List[str]] = None,
    ):
        self.type = type
        self.properties = properties
        self.items = items
        self.required = required
        self.description = description
        self.enum = enum
        self.nullable = nullable
        self.format = format
        self.minimum = minimum
        self.maximum = maximum
        self.min_items = min_items
        self.max_items = max_items
        self.title = title
        # Só uma dica de ordem; o JSON Schema segue a ordem do dict `properties`.
        self.property_ordering = property_ordering

    def to_json_schema(self) -> dict:
        out: dict = {}
        kind = _json_type(self.type)
        if kind:
            out["type"] = [kind, "null"] if self.nullable else kind
        if self.title:
            out["title"] = self.title
        if self.description:
            out["description"] = self.description
        if self.format:
            out["format"] = self.format
        if self.enum is not None:
            out["enum"] = list(self.enum)
        if self.minimum is not None:
            out["minimum"] = self.minimum
        if self.maximum is not None:
            out["maximum"] = self.maximum
        if self.properties is not None:
            out["properties"] = {name: _sub_schema(sub) for name, sub in self.properties.items()}
        if self.required:
            out["required"] = list(self.required)
        if self.items is not None:
            out["items"] = _sub_schema(self.items)
        if self.min_items is not None:
            out["minItems"] = self.min_items
        if self.max_items is not None:
            out["maxItems"] = self.max_items
        return out


def _sub_schema(value: Any) -> Any:
    """Um campo pode ser outro Schema ou já um dict de JSON Schema (copiado como está)."""
    if isinstance(value, Schema):
        return value.to_json_schema()
    return value


class Blob:
    """Bytes inline com o tipo MIME (imagem enviada junto da pergunta)."""

    def __init__(self, data: Optional[bytes] = None, mime_type: Optional[str] = None):
        self.data = data
        self.mime_type = mime_type


class Part:
    """Uma parte de uma mensagem: texto ou bytes inline."""

    def __init__(
        self,
        text: Optional[str] = None,
        inline_data: Optional[Blob] = None,
        file_data: Any = None,
        thought: Optional[bool] = None,
    ):
        self.text = text
        self.inline_data = inline_data
        self.file_data = file_data
        self.thought = thought

    @classmethod
    def from_text(cls, *, text: str) -> "Part":
        return cls(text=text)

    @classmethod
    def from_bytes(cls, *, data: bytes, mime_type: str) -> "Part":
        return cls(inline_data=Blob(data=data, mime_type=mime_type))


class Content:
    """Uma mensagem: papel ("user" ou "model") e partes."""

    def __init__(self, parts: Optional[List[Part]] = None, role: Optional[str] = None):
        self.parts = parts or []
        self.role = role


_CONFIG_FIELDS = (
    "temperature", "top_p", "top_k", "max_output_tokens", "stop_sequences", "seed",
    "system_instruction", "response_mime_type", "response_schema", "response_json_schema",
    "response_modalities", "thinking_config", "tools", "safety_settings", "cached_content",
)


class GenerateContentConfig:
    """Parâmetros de uma geração. O `llm_provider` lê só os que a API compatível entende
    (temperatura, tamanho, parada, semente, esquema de saída); os demais (raciocínio, tools,
    segurança) o servidor local não tem e são ignorados."""

    def __init__(self, **kwargs: Any):
        for name in _CONFIG_FIELDS:
            setattr(self, name, kwargs.pop(name, None))
        # Campo que este módulo não conhece: guardado, para não quebrar quem o passa.
        for name, value in kwargs.items():
            setattr(self, name, value)
