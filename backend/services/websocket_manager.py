import logging
from fastapi import WebSocket

logger = logging.getLogger("qython_logger")


class ConnectionManager:
    def __init__(self):
        self._connections: dict[int, set[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self._connections:
            self._connections[user_id] = set()
        self._connections[user_id].add(websocket)
        logger.info(f"[WS] User {user_id} connected ({len(self._connections[user_id])} active)")

    def disconnect(self, user_id: int, websocket: WebSocket):
        if user_id in self._connections:
            self._connections[user_id].discard(websocket)
            if not self._connections[user_id]:
                del self._connections[user_id]
        logger.info(f"[WS] User {user_id} disconnected")

    async def send_to_user(self, user_id: int, message: dict):
        if user_id not in self._connections:
            return
        stale = []
        for ws in self._connections[user_id]:
            try:
                await ws.send_json(message)
            except Exception:
                stale.append(ws)
        for ws in stale:
            self._connections[user_id].discard(ws)
        if user_id in self._connections and not self._connections[user_id]:
            del self._connections[user_id]


ws_manager = ConnectionManager()
