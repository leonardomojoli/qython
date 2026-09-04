"""remove colunas órfãs do KYC interno (paths de documento)

Revision ID: 2026_06_19_drop_kyc_cols
Revises: 2026_06_18_access_onboarding
Create Date: 2026-06-19

O KYC interno (Gemini, services/verification_service.py) foi removido — o Latreo é a
ÚNICA autoridade de verificação. As colunas que guardavam os PATHS dos documentos
enviados para o KYC ficaram órfãs (sem nenhum writer/reader restante) e são removidas:
  - proof_document_path
  - personal_doc_front_path
  - personal_doc_back_path

NÃO removemos personal_id_number (CPF/DNI, EncryptedString) nem personal_doc_type:
estão ligados ao design de field-encryption LGPD e à coleta no cadastro — limpeza
separada, decisão consciente do dono. downgrade re-adiciona as 3 colunas (dados órfãos
perdidos, como esperado num drop).
"""
from alembic import op
import sqlalchemy as sa


revision = '2026_06_19_drop_kyc_cols'
down_revision = '2026_06_18_access_onboarding'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column('users', 'proof_document_path')
    op.drop_column('users', 'personal_doc_front_path')
    op.drop_column('users', 'personal_doc_back_path')


def downgrade():
    op.add_column('users', sa.Column('personal_doc_back_path', sa.String(length=500), nullable=True))
    op.add_column('users', sa.Column('personal_doc_front_path', sa.String(length=500), nullable=True))
    op.add_column('users', sa.Column('proof_document_path', sa.String(length=500), nullable=True))
