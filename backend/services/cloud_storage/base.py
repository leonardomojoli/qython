# qython/backend/services/cloud_storage/base.py
"""Provider-agnostic contract for user-owned cloud storage ("Conectores").

The Biblioteca stores ORIGINALS in the user's own cloud (v1: Google Drive,
scope drive.file). The server keeps only derivatives (Chroma chunks,
thumbnails, document_images). Adapters implement this ABC; callers resolve
one via cloud_storage.get_provider(name) and never import adapters directly,
so OneDrive/Dropbox can be added without touching call sites.

All methods are async and raise the exception taxonomy below — callers map
them to document states (pending/error) and API errors (403/409/410).
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import AsyncIterator, Optional


class CloudStorageError(Exception):
    """Base: provider unreachable or returned an unexpected response."""


class CloudNotConfigured(CloudStorageError):
    """OAuth client credentials are not set in the environment."""


class CloudAuthRevoked(CloudStorageError):
    """Refresh token is invalid/revoked — the user must reconnect."""


class CloudQuotaExceeded(CloudStorageError):
    """The USER's cloud storage is full (not a Qython limit)."""


class CloudFileNotFound(CloudStorageError):
    """File id no longer resolves (user deleted/moved it outside the app)."""


class CloudTransientError(CloudStorageError):
    """Rate limit / 5xx — safe to retry with backoff."""

    def __init__(self, message: str, retry_after: Optional[float] = None):
        super().__init__(message)
        self.retry_after = retry_after


class CloudStorageProvider(ABC):
    """Contract every storage connector must fulfil."""

    name: str  # slug used in user_cloud_connections.provider ('gdrive', ...)

    # --- OAuth ---
    @abstractmethod
    def is_configured(self) -> bool:
        """True when client credentials exist in the environment."""

    @abstractmethod
    def get_auth_url(self, state: str) -> str:
        """Authorization URL for the consent screen (offline access)."""

    @abstractmethod
    async def exchange_code(self, code: str) -> dict:
        """code -> {refresh_token, access_token, expires_in, email, scopes}."""

    @abstractmethod
    async def refresh_access_token(self, refresh_token: str) -> dict:
        """refresh_token -> {access_token, expires_in}. CloudAuthRevoked on invalid_grant."""

    @abstractmethod
    async def revoke(self, refresh_token: str) -> None:
        """Best-effort server-side revocation on disconnect."""

    # --- Files ---
    @abstractmethod
    async def ensure_root_folder(self, access_token: str, existing_id: Optional[str]) -> str:
        """Return the app root folder id, creating it if missing/deleted."""

    @abstractmethod
    async def upload_file(
        self, access_token: str, folder_id: str, local_path: str,
        filename: str, mime_type: Optional[str] = None,
    ) -> str:
        """Stream local_path into the folder (resumable); returns the file id."""

    @abstractmethod
    async def download_to_file(self, access_token: str, file_id: str, dest_path: str) -> None:
        """Stream the file's bytes to dest_path (pipeline temp / viewer cache)."""

    @abstractmethod
    async def stream_file(self, access_token: str, file_id: str) -> AsyncIterator[bytes]:
        """Async iterator over the file's bytes (proxy streaming)."""

    @abstractmethod
    async def get_metadata(self, access_token: str, file_id: str) -> dict:
        """{id, name, size, mime_type, trashed}."""

    @abstractmethod
    async def trash_file(self, access_token: str, file_id: str) -> None:
        """Move an app-created file to the provider's trash (never hard-delete)."""
