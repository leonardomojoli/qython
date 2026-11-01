# qython/backend/scripts/reset_password.py
"""
Redefine a senha de uma conta pela linha de comando.

Sem e-mail configurado (o padrão da instalação local), "Esqueci minha senha" não
tem como mandar o link. Quem tem acesso ao computador ou ao servidor redefine aqui:

    python -m backend.scripts.reset_password medica@exemplo.com.br
    docker compose exec backend python -m backend.scripts.reset_password medica@exemplo.com.br

A senha é pedida no terminal, sem eco, e nunca passa pela linha de comando.
"""

import asyncio
import getpass
import sys

from sqlalchemy import func, select

from backend.database import AsyncSessionLocal
from backend.models import User
from backend.security import get_password_hash
from backend.services import audit_service


def _password_problem(pwd: str):
    # Mesma regra do cadastro (auth_routes.register_step1).
    if len(pwd) < 8 or not any(c.isupper() for c in pwd) or not any(c.isdigit() for c in pwd):
        return "A senha deve ter no mínimo 8 caracteres, incluindo 1 letra maiúscula e 1 número."
    return None


async def reset(email: str, password: str) -> bool:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(func.lower(User.email) == email.strip().lower()))
        user = result.scalars().first()
        if user is None:
            return False
        user.password_hash = get_password_hash(password)
        await audit_service.log(
            db, action='auth.password.reset', actor_role='local_admin',
            affected_user_id=user.id, metadata={'via': 'cli'},
        )
        await db.commit()
        return True


def main():
    if len(sys.argv) != 2:
        sys.exit("Uso: python -m backend.scripts.reset_password <email>")
    email = sys.argv[1]
    password = getpass.getpass("Nova senha: ")
    problem = _password_problem(password)
    if problem:
        sys.exit(problem)
    if getpass.getpass("Repita a nova senha: ") != password:
        sys.exit("As senhas não conferem.")
    if not asyncio.run(reset(email, password)):
        sys.exit(f"Nenhuma conta com o e-mail {email}.")
    print("Senha redefinida. Entre com a nova senha.")


if __name__ == "__main__":
    main()
