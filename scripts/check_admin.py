import sys
import os
import asyncio
from sqlalchemy.future import select

# Adiciona o diretório PAI (raiz do projeto) ao path para conseguir importar o backend
# Isso funciona independentemente de onde você execute o script
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)  # Sobe um nível: scripts -> qython
sys.path.insert(0, PROJECT_ROOT)

from backend.database import AsyncSessionLocal
from backend.models import User

async def check_and_update_admin(email):
    print(f"--- Verificando usuário: {email} ---")
    
    async with AsyncSessionLocal() as session:
        # Busca o usuário pelo email
        result = await session.execute(select(User).filter(User.email == email))
        user = result.scalars().first()

        if user:
            print(f"✅ Usuário encontrado: {user.full_name} (ID: {user.id})")
            print(f"   Status atual: {user.status}")
            print(f"   É Admin? {'SIM' if user.is_admin else 'NÃO'}")

            # Se não for admin ou não estiver ativo, atualiza
            changes = False
            if not user.is_admin:
                print("   -> Promovendo a Administrador...")
                user.is_admin = True
                changes = True
            
            if user.status != 'active':
                print(f"   -> Alterando status de '{user.status}' para 'active'...")
                user.status = 'active'
                changes = True

            if changes:
                await session.commit()
                print("\n✨ Alterações salvas com sucesso! O usuário agora é Admin.")
            else:
                print("\n👍 Nenhuma alteração necessária. O usuário já é Admin e está Ativo.")
        else:
            print(f"❌ ERRO: Usuário com email '{email}' não encontrado no banco de dados.")
            print("   Certifique-se de ter criado a conta na página de registro primeiro.")

if __name__ == "__main__":
    # E-mail pela linha de comando; sem ele o script nao teria como saber quem
    # promover em uma instalacao nova.
    if len(sys.argv) < 2:
        print("Uso: python -m scripts.check_admin <email>")
        print("Registre a conta pela tela de cadastro antes de promove-la.")
        sys.exit(1)
    asyncio.run(check_and_update_admin(sys.argv[1]))
