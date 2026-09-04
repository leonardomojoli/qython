"""remove personal_id_number + personal_doc_type (órfãos pós-KYC interno)

Revision ID: 2026_06_19_drop_personal_doc
Revises: 2026_06_19_drop_kyc_cols
Create Date: 2026-06-19

Últimas colunas do KYC interno (consumidor único, já removido). Não havia coleta real:
o cadastro mandava personal_doc_type='id_card' e personal_id_number='' como constantes
(sem input). Com o Latreo como única autoridade de identidade, o Qython não precisa
guardar o CPF/DNI nem o tipo de documento pessoal → data-minimization (LGPD).

personal_id_number era EncryptedString (impl=LargeBinary → BYTEA); o downgrade o
re-adiciona como BYTEA. 'personal_id_number' segue na allowlist do anonymization_service
(filtro defensivo de PII — não se reduz cobertura de anonimização).
"""
from alembic import op
import sqlalchemy as sa


revision = '2026_06_19_drop_personal_doc'
down_revision = '2026_06_19_drop_kyc_cols'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column('users', 'personal_id_number')
    op.drop_column('users', 'personal_doc_type')


def downgrade():
    op.add_column('users', sa.Column('personal_doc_type', sa.String(length=20), nullable=True))
    op.add_column('users', sa.Column('personal_id_number', sa.LargeBinary(), nullable=True))
