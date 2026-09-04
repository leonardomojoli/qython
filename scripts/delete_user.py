import sys
import os
import asyncio
from sqlalchemy.future import select
from sqlalchemy import update

# --- AJUSTE DE PATH ---
# Adiciona o diretório pai (raiz do projeto) ao Python Path
# Isso permite importar 'backend' mesmo estando dentro de 'scripts'
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# ----------------------

from backend.database import AsyncSessionLocal
from backend.models import User, Invitation

async def delete_user_by_email(email):
    print(f"--- Tentando deletar usuário: {email} ---")
    
    async with AsyncSessionLocal() as session:
        # Busca o usuário
        result = await session.execute(select(User).filter(User.email == email))
        user = result.scalars().first()

        if user:
            print(f"✅ Usuário encontrado: {user.full_name} (ID: {user.id})")
            
            # Resetar convites usados por este usuário
            print("   Verificando convites usados...")
            
            # Opção A: Resetar (liberar para uso novamente)
            result_inv = await session.execute(
                select(Invitation).filter(Invitation.used_by_user_id == user.id)
            )
            invitations = result_inv.scalars().all()
            
            if invitations:
                for inv in invitations:
                    print(f"   🔄 Resetando convite {inv.token} (era usado por {user.id})...")
                    inv.used_by_user_id = None
                    inv.is_used = False
                    session.add(inv) # Marca para update
            else:
                print("   Nenhum convite associado encontrado.")

            print("   Deletando usuário...")
            await session.delete(user)
            await session.commit()
            
            print("✨ Usuário e histórico de convites removidos/resetados com sucesso!")
        else:
            print(f"❌ Usuário com email '{email}' não encontrado no banco.")

if __name__ == "__main__":
    # Substitua pelo email que você quer deletar
    target_email = "you@example.com" 
    asyncio.run(delete_user_by_email(target_email))