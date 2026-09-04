"""academic_documents: campos de storage Drive-first (drive_file_id, provider, origin, error_code)

Revision ID: 2026_07_11_docs_drive_fields
Revises: 2026_07_10_cloud_connections
Create Date: 2026-07-11

Fase 2 do plano Drive-first: o original do documento passa a morar na nuvem do
usuário (Google Drive). Novas colunas em `academic_documents`:
  - `drive_file_id`   — id do arquivo original na nuvem do usuário (NULL = ainda não subiu / legado)
  - `storage_provider`— NULL = legado server-side (original em PERMANENT_UPLOAD_FOLDER) | 'gdrive'
  - `drive_origin`    — 'uploaded' (write-through, o app criou → pode ir p/ lixeira no delete)
                        | 'imported' (Picker, arquivo do usuário → NUNCA tocamos no Drive dele)
  - `error_code`      — código acionável de falha (ex.: 'drive_quota_full', 'cloud_reauth_required')

`storage_path` deixa de ser NOT NULL: docs Drive-only têm o original descartado do
servidor após o processamento (storage_path = NULL). Registros legados mantêm o path.
"""
from alembic import op
import sqlalchemy as sa


revision = '2026_07_11_docs_drive_fields'
down_revision = '2026_07_10_cloud_connections'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('academic_documents', sa.Column('drive_file_id', sa.String(length=128), nullable=True))
    op.add_column('academic_documents', sa.Column('storage_provider', sa.String(length=20), nullable=True))
    op.add_column('academic_documents', sa.Column('drive_origin', sa.String(length=20), nullable=True))
    op.add_column('academic_documents', sa.Column('error_code', sa.String(length=40), nullable=True))
    op.alter_column('academic_documents', 'storage_path',
                    existing_type=sa.String(length=500), nullable=True)


def downgrade():
    # Docs Drive-only têm storage_path NULL; preenche com '' antes de re-impor NOT NULL.
    op.execute("UPDATE academic_documents SET storage_path = '' WHERE storage_path IS NULL")
    op.alter_column('academic_documents', 'storage_path',
                    existing_type=sa.String(length=500), nullable=False)
    op.drop_column('academic_documents', 'error_code')
    op.drop_column('academic_documents', 'drive_origin')
    op.drop_column('academic_documents', 'storage_provider')
    op.drop_column('academic_documents', 'drive_file_id')
