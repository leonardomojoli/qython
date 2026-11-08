# qython/backend/spa.py
"""
Serve o front (o build do React) pelo próprio backend, na mesma origem da API.

No Docker quem faz isso é o nginx; no app desktop não há nginx, e o front exige `/api` na
mesma origem (e abre o WebSocket por `window.location.host`).

É um wrapper ASGI por fora do FastAPI, e não um `app.mount("/")`, de propósito: um mount
na raiz captura TODO caminho, inclusive `/api/patients/` com a barra a mais, e o
`redirect_slashes` do FastAPI nunca roda (o POST vira 405). Aqui só GET/HEAD fora de
`/api` e `/static` são atendidos; o resto passa direto para o app, intacto.
"""

from __future__ import annotations

from pathlib import Path

from starlette.responses import FileResponse, Response

# Rotas que pertencem ao FastAPI, mesmo com GET.
_API_PREFIXES = ("/api", "/static", "/docs", "/redoc", "/openapi.json")

_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
}


class SPAWrapper:
    def __init__(self, app, web_dir: str | Path):
        self.app = app
        self.root = Path(web_dir).resolve()
        self.index = self.root / "index.html"
        if not self.index.is_file():
            raise FileNotFoundError(f"{self.index} não existe: o front não foi compilado.")

    def _file_for(self, path: str) -> Path | None:
        rel = path.lstrip("/")
        if not rel:
            return None
        candidate = (self.root / rel).resolve()
        # Não deixa "../" sair da pasta do front.
        if self.root not in candidate.parents:
            return None
        return candidate if candidate.is_file() else None

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in ("GET", "HEAD"):
            return await self.app(scope, receive, send)
        path = scope["path"]
        if any(path == p or path.startswith(p + "/") for p in _API_PREFIXES):
            return await self.app(scope, receive, send)

        found = self._file_for(path)
        if found is not None:
            response: Response = FileResponse(found, headers=_HEADERS)
        else:
            # Rota do React Router (/login, /consultas/12...): devolve o index e o React resolve.
            # O index referencia os arquivos com hash no nome; revalidar a cada abertura
            # faz o app pegar o front novo logo depois de atualizar.
            response = FileResponse(self.index, headers={**_HEADERS, "Cache-Control": "no-cache"})
        await response(scope, receive, send)
