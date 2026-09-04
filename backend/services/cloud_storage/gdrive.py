# qython/backend/services/cloud_storage/gdrive.py
"""Google Drive adapter (scope drive.file) for the Conectores layer.

drive.file only sees files/folders THIS app created or the user explicitly
opened via the Google Picker — no CASA audit, no access to the rest of the
user's Drive. Originals live under a visible "Qython" folder in the USER's
Drive; the server never retains them (see docs/ARCHITECTURE.md).

HTTP is aiohttp with lazy import, mirroring latreo_client.py — no Google SDK.
"""
from __future__ import annotations

import json
import logging
import os
import urllib.parse
from typing import AsyncIterator, Optional

from ...config import Config
from .base import (
    CloudAuthRevoked,
    CloudFileNotFound,
    CloudNotConfigured,
    CloudQuotaExceeded,
    CloudStorageError,
    CloudStorageProvider,
    CloudTransientError,
)

logger = logging.getLogger("qython_logger")

_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
_FILES_URL = "https://www.googleapis.com/drive/v3/files"
_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files"

_SCOPES = "openid email https://www.googleapis.com/auth/drive.file"
_TIMEOUT_SECONDS = 30
_UPLOAD_TIMEOUT_SECONDS = 600  # lecture audio/video can be tens of MB
_CHUNK = 64 * 1024

_FOLDER_MIME = "application/vnd.google-apps.folder"


def _map_drive_error(status: int, body: str, retry_after: Optional[str] = None) -> CloudStorageError:
    """Translate a Drive/OAuth HTTP error into the connector taxonomy."""
    reason = ""
    error_code = ""
    try:
        payload = json.loads(body)
        error_code = str(payload.get("error", ""))
        errors = (payload.get("error") or {}).get("errors") if isinstance(payload.get("error"), dict) else None
        if errors:
            reason = errors[0].get("reason", "")
    except (ValueError, AttributeError):
        pass

    if status == 404:
        return CloudFileNotFound(f"Drive 404: {body[:200]}")
    if status == 429 or reason in ("rateLimitExceeded", "userRateLimitExceeded", "sharingRateLimitExceeded"):
        ra = None
        try:
            ra = float(retry_after) if retry_after else None
        except ValueError:
            pass
        return CloudTransientError(f"Drive rate limit: {body[:200]}", retry_after=ra)
    if status == 403 and reason == "storageQuotaExceeded":
        return CloudQuotaExceeded("O Google Drive do usuário está cheio.")
    if status == 403 and reason in ("insufficientPermissions", "appNotAuthorizedToFile", "forbidden"):
        return CloudAuthRevoked(f"Drive 403 {reason}: {body[:200]}")
    if error_code == "invalid_grant" or "invalid_grant" in body:
        return CloudAuthRevoked("Refresh token revogado/expirado (invalid_grant).")
    if status == 401:
        # Access token expired mid-flight — callers re-mint via connector_service
        # (the in-process cache keeps a safety margin, so this is rare).
        return CloudTransientError("Drive 401: access token expirado.")
    if status >= 500:
        return CloudTransientError(f"Drive {status}: {body[:200]}")
    return CloudStorageError(f"Drive {status}: {body[:300]}")


class GoogleDriveProvider(CloudStorageProvider):
    name = "gdrive"

    # --- OAuth ---

    def is_configured(self) -> bool:
        return bool(Config.GOOGLE_OAUTH_CLIENT_ID and Config.GOOGLE_OAUTH_CLIENT_SECRET)

    def _require_configured(self) -> None:
        if not self.is_configured():
            raise CloudNotConfigured("GOOGLE_OAUTH_CLIENT_ID/SECRET não configurados.")

    def get_auth_url(self, state: str) -> str:
        self._require_configured()
        params = {
            "client_id": Config.GOOGLE_OAUTH_CLIENT_ID,
            "redirect_uri": Config.GOOGLE_OAUTH_REDIRECT_URI,
            "response_type": "code",
            "scope": _SCOPES,
            # offline + consent garante refresh_token também em reconexões
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "true",
            "state": state,
        }
        return f"{_AUTH_URL}?{urllib.parse.urlencode(params)}"

    async def exchange_code(self, code: str) -> dict:
        self._require_configured()
        data = {
            "code": code,
            "client_id": Config.GOOGLE_OAUTH_CLIENT_ID,
            "client_secret": Config.GOOGLE_OAUTH_CLIENT_SECRET,
            "redirect_uri": Config.GOOGLE_OAUTH_REDIRECT_URI,
            "grant_type": "authorization_code",
        }
        tokens = await self._form_post(_TOKEN_URL, data)
        refresh_token = tokens.get("refresh_token")
        access_token = tokens.get("access_token")
        if not refresh_token or not access_token:
            # Sem refresh_token (ex.: consent reaproveitado sem prompt=consent) a
            # conexão nasceria morta — trate como erro para o usuário tentar de novo.
            raise CloudStorageError("Google não retornou refresh_token; refaça a conexão.")
        email = ""
        try:
            email = (await self._authed_get_json(_USERINFO_URL, access_token)).get("email", "")
        except CloudStorageError as e:
            logger.warning(f"[CONNECTOR] userinfo falhou (segue sem email): {e}")
        return {
            "refresh_token": refresh_token,
            "access_token": access_token,
            "expires_in": tokens.get("expires_in", 3600),
            "email": email,
            "scopes": tokens.get("scope", _SCOPES),
        }

    async def refresh_access_token(self, refresh_token: str) -> dict:
        self._require_configured()
        data = {
            "refresh_token": refresh_token,
            "client_id": Config.GOOGLE_OAUTH_CLIENT_ID,
            "client_secret": Config.GOOGLE_OAUTH_CLIENT_SECRET,
            "grant_type": "refresh_token",
        }
        tokens = await self._form_post(_TOKEN_URL, data)
        return {
            "access_token": tokens["access_token"],
            "expires_in": tokens.get("expires_in", 3600),
        }

    async def revoke(self, refresh_token: str) -> None:
        try:
            await self._form_post(_REVOKE_URL, {"token": refresh_token})
        except CloudStorageError as e:
            # Best-effort: revogação falha não impede o disconnect local.
            logger.warning(f"[CONNECTOR] revoke no Google falhou (ignorado): {e}")

    # --- Files ---

    async def ensure_root_folder(self, access_token: str, existing_id: Optional[str]) -> str:
        if existing_id:
            try:
                meta = await self.get_metadata(access_token, existing_id)
                if not meta.get("trashed"):
                    return existing_id
            except CloudFileNotFound:
                pass  # pasta apagada pelo usuário — recria abaixo
        folder_name = Config.DRIVE_ROOT_FOLDER_NAME.replace("'", "\\'")
        query = (
            f"name = '{folder_name}' and mimeType = '{_FOLDER_MIME}' "
            "and trashed = false and appProperties has { key='qython_root' and value='1' }"
        )
        params = urllib.parse.urlencode({"q": query, "fields": "files(id,name)", "spaces": "drive"})
        found = await self._authed_get_json(f"{_FILES_URL}?{params}", access_token)
        files = found.get("files") or []
        if files:
            return files[0]["id"]
        created = await self._json_post(
            _FILES_URL,
            access_token,
            {
                "name": Config.DRIVE_ROOT_FOLDER_NAME,
                "mimeType": _FOLDER_MIME,
                "appProperties": {"qython_root": "1"},
            },
        )
        logger.info(f"[CONNECTOR] Pasta raiz '{Config.DRIVE_ROOT_FOLDER_NAME}' criada no Drive: {created.get('id')}")
        return created["id"]

    async def upload_file(
        self, access_token: str, folder_id: str, local_path: str,
        filename: str, mime_type: Optional[str] = None,
    ) -> str:
        """Upload resumável em sessão única: initiate + um PUT streamando do disco."""
        import aiohttp

        size = os.path.getsize(local_path)
        metadata = {"name": filename, "parents": [folder_id]}
        init_headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Length": str(size),
        }
        if mime_type:
            init_headers["X-Upload-Content-Type"] = mime_type

        timeout = aiohttp.ClientTimeout(total=_UPLOAD_TIMEOUT_SECONDS)
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(
                    f"{_UPLOAD_URL}?uploadType=resumable&fields=id",
                    json=metadata, headers=init_headers,
                ) as resp:
                    body = await resp.text()
                    if resp.status >= 400:
                        raise _map_drive_error(resp.status, body, resp.headers.get("Retry-After"))
                    upload_url = resp.headers.get("Location")
                if not upload_url:
                    raise CloudStorageError("Drive não retornou a URL de upload resumável.")

                put_headers = {"Content-Length": str(size)}
                if mime_type:
                    put_headers["Content-Type"] = mime_type
                with open(local_path, "rb") as fh:
                    async with session.put(upload_url, data=fh, headers=put_headers) as resp:
                        body = await resp.text()
                        if resp.status >= 400:
                            raise _map_drive_error(resp.status, body, resp.headers.get("Retry-After"))
                        return json.loads(body)["id"]
        except CloudStorageError:
            raise
        except aiohttp.ClientError as e:
            raise CloudTransientError(f"Drive upload: erro de conexão: {e}")
        except (ValueError, KeyError) as e:
            raise CloudStorageError(f"Drive upload: resposta inesperada: {e}")

    async def download_to_file(self, access_token: str, file_id: str, dest_path: str) -> None:
        import aiohttp

        os.makedirs(os.path.dirname(dest_path) or ".", exist_ok=True)
        tmp_path = f"{dest_path}.part"
        timeout = aiohttp.ClientTimeout(total=_UPLOAD_TIMEOUT_SECONDS)
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(
                    f"{_FILES_URL}/{file_id}?alt=media",
                    headers={"Authorization": f"Bearer {access_token}"},
                ) as resp:
                    if resp.status >= 400:
                        body = await resp.text()
                        raise _map_drive_error(resp.status, body, resp.headers.get("Retry-After"))
                    with open(tmp_path, "wb") as fh:
                        async for chunk in resp.content.iter_chunked(_CHUNK):
                            fh.write(chunk)
            os.replace(tmp_path, dest_path)
        except CloudStorageError:
            self._cleanup_partial(tmp_path)
            raise
        except aiohttp.ClientError as e:
            self._cleanup_partial(tmp_path)
            raise CloudTransientError(f"Drive download: erro de conexão: {e}")

    async def stream_file(self, access_token: str, file_id: str) -> AsyncIterator[bytes]:
        import aiohttp

        timeout = aiohttp.ClientTimeout(total=_UPLOAD_TIMEOUT_SECONDS, sock_read=60)
        session = aiohttp.ClientSession(timeout=timeout)
        try:
            resp = await session.get(
                f"{_FILES_URL}/{file_id}?alt=media",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if resp.status >= 400:
                body = await resp.text()
                raise _map_drive_error(resp.status, body, resp.headers.get("Retry-After"))
            async for chunk in resp.content.iter_chunked(_CHUNK):
                yield chunk
        finally:
            await session.close()

    async def get_metadata(self, access_token: str, file_id: str) -> dict:
        params = urllib.parse.urlencode({"fields": "id,name,size,mimeType,trashed"})
        meta = await self._authed_get_json(f"{_FILES_URL}/{file_id}?{params}", access_token)
        return {
            "id": meta.get("id"),
            "name": meta.get("name"),
            "size": int(meta["size"]) if meta.get("size") else None,
            "mime_type": meta.get("mimeType"),
            "trashed": bool(meta.get("trashed")),
        }

    async def trash_file(self, access_token: str, file_id: str) -> None:
        await self._json_patch(f"{_FILES_URL}/{file_id}", access_token, {"trashed": True})

    # --- HTTP helpers (aiohttp lazy, padrão latreo_client) ---

    @staticmethod
    def _cleanup_partial(tmp_path: str) -> None:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except OSError:
            pass

    async def _form_post(self, url: str, data: dict) -> dict:
        import aiohttp

        try:
            timeout = aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(url, data=data) as resp:
                    body = await resp.text()
                    if resp.status >= 400:
                        raise _map_drive_error(resp.status, body, resp.headers.get("Retry-After"))
                    return json.loads(body) if body else {}
        except CloudStorageError:
            raise
        except aiohttp.ClientError as e:
            raise CloudTransientError(f"OAuth POST {url}: erro de conexão: {e}")
        except ValueError as e:
            raise CloudStorageError(f"OAuth POST {url}: resposta não-JSON: {e}")

    async def _authed_get_json(self, url: str, access_token: str) -> dict:
        import aiohttp

        try:
            timeout = aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(url, headers={"Authorization": f"Bearer {access_token}"}) as resp:
                    body = await resp.text()
                    if resp.status >= 400:
                        raise _map_drive_error(resp.status, body, resp.headers.get("Retry-After"))
                    return json.loads(body) if body else {}
        except CloudStorageError:
            raise
        except aiohttp.ClientError as e:
            raise CloudTransientError(f"Drive GET {url}: erro de conexão: {e}")
        except ValueError as e:
            raise CloudStorageError(f"Drive GET {url}: resposta não-JSON: {e}")

    async def _json_post(self, url: str, access_token: str, payload: dict) -> dict:
        import aiohttp

        try:
            timeout = aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(
                    url, json=payload, headers={"Authorization": f"Bearer {access_token}"},
                ) as resp:
                    body = await resp.text()
                    if resp.status >= 400:
                        raise _map_drive_error(resp.status, body, resp.headers.get("Retry-After"))
                    return json.loads(body) if body else {}
        except CloudStorageError:
            raise
        except aiohttp.ClientError as e:
            raise CloudTransientError(f"Drive POST {url}: erro de conexão: {e}")
        except ValueError as e:
            raise CloudStorageError(f"Drive POST {url}: resposta não-JSON: {e}")

    async def _json_patch(self, url: str, access_token: str, payload: dict) -> dict:
        import aiohttp

        try:
            timeout = aiohttp.ClientTimeout(total=_TIMEOUT_SECONDS)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.patch(
                    url, json=payload, headers={"Authorization": f"Bearer {access_token}"},
                ) as resp:
                    body = await resp.text()
                    if resp.status >= 400:
                        raise _map_drive_error(resp.status, body, resp.headers.get("Retry-After"))
                    return json.loads(body) if body else {}
        except CloudStorageError:
            raise
        except aiohttp.ClientError as e:
            raise CloudTransientError(f"Drive PATCH {url}: erro de conexão: {e}")
        except ValueError as e:
            raise CloudStorageError(f"Drive PATCH {url}: resposta não-JSON: {e}")
