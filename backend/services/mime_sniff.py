# qython/backend/services/mime_sniff.py
"""
Detecção de tipo de arquivo pelo conteúdo, sem libmagic.

A biblioteca valida o upload pelo conteúdo (e não pela extensão que o usuário deu) com o
`python-magic`, que precisa da libmagic do sistema. No Docker ela vem pelo apt. No app
desktop para Windows e macOS não existe libmagic embutida, e `import magic` falhava no
boot. Este módulo cobre os tipos que a biblioteca aceita, com a mesma interface
(`from_buffer`/`from_file`), e entra no lugar do `magic` só quando ele não carrega.

Não pretende substituir a libmagic: o que não reconhece volta como
`application/octet-stream`, e o upload é recusado.
"""

from __future__ import annotations

import io
import json
import zipfile

OCTET = "application/octet-stream"
_HEAD = 8192


def _zip_kind(buf: bytes) -> str:
    try:
        names = zipfile.ZipFile(io.BytesIO(buf)).namelist()
    except Exception:
        return "application/zip"
    if any(n.startswith("ppt/") for n in names):
        return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    if any(n.startswith("word/") for n in names):
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    if any(n.startswith("xl/") for n in names):
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return "application/zip"


def _iso_media_kind(buf: bytes) -> str:
    brand = buf[8:12]
    if brand == b"qt  ":
        return "video/quicktime"
    if brand in (b"M4A ", b"M4B ", b"M4P "):
        return "audio/x-m4a"
    return "video/mp4"


def _text_kind(buf: bytes) -> str:
    try:
        text = buf.decode("utf-8")
    except UnicodeDecodeError:
        # Pode ser só um caractere cortado no fim da amostra.
        try:
            text = buf[:-3].decode("utf-8")
        except UnicodeDecodeError:
            return OCTET
    if "\x00" in text:
        return OCTET
    head = text.lstrip("﻿ \t\r\n")[:200].lower()
    if head.startswith("<?xml"):
        return "text/xml"
    if head.startswith(("<!doctype html", "<html")):
        return "text/html"
    if head[:1] in ("{", "["):
        try:
            json.loads(text)
            return "application/json"
        except ValueError:
            pass
    return "text/plain"


def from_buffer(buf: bytes, mime: bool = True) -> str:
    head = bytes(buf[:_HEAD])
    if head.startswith(b"%PDF-"):
        return "application/pdf"
    if head.startswith(b"PK\x03\x04"):
        return _zip_kind(bytes(buf))
    if head[:4] == b"RIFF" and head[8:12] == b"WAVE":
        return "audio/x-wav"
    if head[:4] == b"RIFF" and head[8:12] == b"AVI ":
        return "video/x-msvideo"
    if head[:3] == b"ID3" or (len(head) > 1 and head[0] == 0xFF and head[1] & 0xE6 == 0xE2):
        return "audio/mpeg"
    if len(head) > 1 and head[0] == 0xFF and head[1] & 0xF6 == 0xF0:
        return "audio/aac"
    if head[4:8] == b"ftyp":
        return _iso_media_kind(head)
    return _text_kind(head)


def from_file(path: str, mime: bool = True) -> str:
    with open(path, "rb") as fh:
        head = fh.read(_HEAD)
        if head.startswith(b"PK\x03\x04"):
            fh.seek(0)
            return _zip_kind(fh.read())
    return from_buffer(head)
