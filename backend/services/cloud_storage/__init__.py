# qython/backend/services/cloud_storage/__init__.py
"""Conectores de nuvem do usuário — registry de providers.

Uso:
    from ..services import cloud_storage
    provider = cloud_storage.get_provider('gdrive')
"""
from .base import (  # noqa: F401 — re-export da taxonomia p/ os call sites
    CloudAuthRevoked,
    CloudFileNotFound,
    CloudNotConfigured,
    CloudQuotaExceeded,
    CloudStorageError,
    CloudStorageProvider,
    CloudTransientError,
)
from .gdrive import GoogleDriveProvider

_PROVIDERS = {
    GoogleDriveProvider.name: GoogleDriveProvider(),
}


def get_provider(name: str) -> CloudStorageProvider:
    """Resolve um provider pelo slug ('gdrive'). KeyError amigável se desconhecido."""
    try:
        return _PROVIDERS[name]
    except KeyError:
        raise CloudStorageError(f"Provider de nuvem desconhecido: {name!r}")


def available_providers() -> list:
    """Slugs dos providers com credenciais OAuth configuradas (p/ a página de
    Conectores). Sem elas o botão de conectar só levaria a um erro, então o front
    esconde o conector e a Biblioteca guarda os originais no disco local."""
    return [name for name, provider in _PROVIDERS.items() if provider.is_configured()]
