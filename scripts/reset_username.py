import asyncio
import sys
import os

# Adiciona o diretório pai ao path para importar módulos do backend
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import AsyncSessionLocal
from backend.models import User
from sqlalchemy import select

async def reset_username(username_to_reset):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.username == username_to_reset))
        user = result.scalars().first()
        
        if not user:
            print(f"❌ Usuário com username '{username_to_reset}' não encontrado.")
            return

        print(f"✅ Usuário encontrado: {user.email} (ID: {user.id})")
        
        # Limpa o username
        user.username = None
        
        await db.commit()
        print(f"🚀 Username '{username_to_reset}' foi removido com sucesso! Agora você pode usá-lo novamente.")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python reset_username.py <username>")
        sys.exit(1)
        
    username = sys.argv[1]
    asyncio.run(reset_username(username))
