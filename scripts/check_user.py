#!/usr/bin/env python3
"""
Script to check the most recent user in the database.
Useful for debugging registration and verification flow.

Usage:
    cd /opt/qython
    source venv/bin/activate
    python scripts/check_user.py
"""

import asyncio
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import AsyncSessionLocal
from backend.models import User
from sqlalchemy.future import select


async def check():
    """Fetch and display the most recent user's details."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).order_by(User.id.desc()).limit(1))
        user = result.scalars().first()
        
        if not user:
            print("Nenhum usuário encontrado no banco de dados.")
            return
        
        print("\n" + "=" * 50)
        print("ÚLTIMO USUÁRIO REGISTRADO")
        print("=" * 50)
        print(f"ID:                  {user.id}")
        print(f"Email:               {user.email}")
        print(f"Nome:                {user.full_name}")
        print(f"Status:              {user.status}")
        print(f"Ocupação:            {user.occupation}")
        print(f"País:                {user.country}")
        print(f"Telefone:            {user.phone_number}")
        print(f"Telefone Verificado: {user.phone_verified}")
        print(f"Documento:           {user.proof_document_path}")
        print(f"Status KYC:          {getattr(user, 'verification_status', 'N/A')}")
        print(f"Notas KYC:           {getattr(user, 'verification_notes', 'N/A')}")
        print(f"Admin:               {user.is_admin}")
        print(f"Dracmas:             {user.dracmas}")
        print("=" * 50 + "\n")


if __name__ == "__main__":
    asyncio.run(check())
