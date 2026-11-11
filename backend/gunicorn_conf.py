# Configuração do gunicorn da imagem Docker (usada com `-c backend/gunicorn_conf.py`).
import logging


class _SemQueryString(logging.Filter):
    """Tira a query string da linha de acesso do uvicorn (logger `uvicorn.access`).

    O WebSocket de notificações leva o token de acesso na URL (?token=...); sem este filtro ele iria
    para o log do contêiner. O worker do uvicorn ignora o `access_log_format` do gunicorn e escreve a
    própria linha, com os argumentos (cliente, método, caminho com query, versão HTTP, status)."""

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) == 5 and isinstance(args[2], str):
            record.args = (args[0], args[1], args[2].split("?", 1)[0], args[3], args[4])
        return True


def post_fork(server, worker):
    logging.getLogger("uvicorn.access").addFilter(_SemQueryString())
