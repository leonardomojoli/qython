# Script para testar envio de email de verificação
# Uso: python scripts/test_email.py (executar da raiz do projeto)

import sys
from pathlib import Path
from dotenv import load_dotenv

# Carrega o .env da raiz do projeto
project_root = Path(__file__).resolve().parent.parent
load_dotenv(project_root / ".env")

# Adiciona o backend ao path
backend_path = project_root / "backend"
sys.path.insert(0, str(backend_path))

from services.email_service import send_verification_email

def main():
    # Envia email de teste
    email = "you@example.com"
    token = "TEST_TOKEN_12345"
    user_name = "Leonardo de Abreu"
    lang = "pt"
    
    print(f"Enviando email de teste para: {email}")
    
    result = send_verification_email(
        email=email,
        token=token,
        user_name=user_name,
        lang=lang
    )
    
    if result:
        print("✅ Email enviado com sucesso!")
    else:
        print("❌ Falha ao enviar email")

if __name__ == "__main__":
    main()
