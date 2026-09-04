"""add treatment (salutation) column to users

Revision ID: 2026_06_05_user_treatment
Revises: 2026_06_04_tdata_jobs
Create Date: 2026-06-05

Adiciona a coluna nullable `treatment` em users — tratamento/saudação
auto-declarado (Dr./Dra.) que o usuário escolhe no perfil. Usado na saudação
do copiloto e em documentos. Vazio/NULL = sem prefixo.
"""
from alembic import op
import sqlalchemy as sa


revision = '2026_06_05_user_treatment'
down_revision = '2026_06_04_tdata_jobs'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('treatment', sa.String(20), nullable=True))


def downgrade():
    op.drop_column('users', 'treatment')
