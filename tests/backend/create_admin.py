import os
import sys
import pathlib

# --- CORREÇÃO NO CAMINHO ---
# O script está em qython/tests/backend.
# Precisamos adicionar 'qython' ao sys.path para que 'import backend.database' funcione.
# Subimos 3 níveis (backend -> tests -> qython) para chegar na raiz do projeto.
project_root = pathlib.Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(project_root))

# Agora as importações do backend devem funcionar
from backend.database import SessionLocal
from backend.models import User
from backend.security import get_password_hash

# Dados do Administrador
ADMIN_EMAIL = "you@example.com"
ADMIN_PASSWORD = "BeautifulOswaldo1!"
ADMIN_FULL_NAME = "Leonardo Abreu"
ADMIN_PHONE = "00000000000"
ADMIN_OCCUPATION = "Administrator"

def create_admin_user():
    """Cria ou atualiza o usuário administrador usando uma sessão de banco de dados direta."""
    
    db = SessionLocal()
    
    try:
        # Verifica se o usuário já existe
        existing_user = db.query(User).filter(User.email == ADMIN_EMAIL).first()
        
        if existing_user:
            print(f"Usuário com email '{ADMIN_EMAIL}' já existe. Verificando e atualizando...")
            
            new_hash = get_password_hash(ADMIN_PASSWORD)
            if existing_user.password_hash != new_hash:
                existing_user.password_hash = new_hash
                print("-> Senha do administrador atualizada para a definida no script.")

            if not existing_user.is_admin:
                existing_user.is_admin = True
                print("-> Privilégios de administrador concedidos.")
            
            if existing_user.status != 'active':
                existing_user.status = 'active'
                print("-> Status do administrador definido como 'ativo'.")

            db.commit()
            print("Verificação/Atualização do administrador concluída.")

        else:
            print(f"Criando novo usuário administrador: {ADMIN_EMAIL}")
            admin_user = User(
                email=ADMIN_EMAIL,
                password_hash=get_password_hash(ADMIN_PASSWORD),
                full_name=ADMIN_FULL_NAME,
                phone_number=ADMIN_PHONE,
                occupation=ADMIN_OCCUPATION,
                is_admin=True,
                status='active'
            )
            db.add(admin_user)
            db.commit()
            print("Usuário administrador criado com sucesso!")

    except Exception as e:
        db.rollback()
        print(f"Erro ao criar/atualizar usuário administrador: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    # Carrega as variáveis de ambiente do .env para o script
    from dotenv import load_dotenv
    # O caminho para o .env é relativo à raiz do projeto
    env_path = project_root / 'config' / '.env'
    if os.path.exists(env_path):
        print(f"Carregando .env de: {env_path}")
        load_dotenv(dotenv_path=env_path)
    else:
        print(f"Aviso: arquivo .env não encontrado em {env_path}")

    # Primeiro, apaga o usuário antigo para garantir um recomeço limpo
    db = SessionLocal()
    try:
        user_to_delete = db.query(User).filter(User.email == ADMIN_EMAIL).first()
        if user_to_delete:
            print(f"Apagando usuário administrador existente: {ADMIN_EMAIL}")
            db.delete(user_to_delete)
            db.commit()
            print("Usuário antigo apagado com sucesso.")
        else:
            print("Nenhum usuário administrador antigo encontrado para apagar.")
    except Exception as e:
        print(f"Erro ao apagar usuário antigo: {e}")
        db.rollback()
    finally:
        db.close()

    # Agora, criamos o novo usuário
    create_admin_user()
