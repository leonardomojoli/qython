"""Add storage management: TTL for generated content, storage quotas and tracking

Revision ID: 2026_02_04_storage
Revises: 2026_01_23_ledger
Create Date: 2026-02-04

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '2026_02_04_storage'
down_revision = '2026_01_23_ledger'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # TTL: expires_at for generated content
    op.add_column('podcast_generation_jobs', sa.Column('expires_at', sa.DateTime(), nullable=True))
    op.create_index('ix_podcast_generation_jobs_expires_at', 'podcast_generation_jobs', ['expires_at'])

    op.add_column('video_lesson_jobs', sa.Column('expires_at', sa.DateTime(), nullable=True))
    op.create_index('ix_video_lesson_jobs_expires_at', 'video_lesson_jobs', ['expires_at'])

    op.add_column('academic_materials', sa.Column('expires_at', sa.DateTime(), nullable=True))
    op.create_index('ix_academic_materials_expires_at', 'academic_materials', ['expires_at'])

    # Storage tracking on users
    op.add_column('users', sa.Column('storage_used_bytes', sa.BigInteger(), nullable=False, server_default='0'))

    # File size tracking on documents
    op.add_column('academic_documents', sa.Column('file_size_bytes', sa.BigInteger(), nullable=True))


def downgrade() -> None:
    op.drop_column('academic_documents', 'file_size_bytes')
    op.drop_column('users', 'storage_used_bytes')

    op.drop_index('ix_academic_materials_expires_at', table_name='academic_materials')
    op.drop_column('academic_materials', 'expires_at')

    op.drop_index('ix_video_lesson_jobs_expires_at', table_name='video_lesson_jobs')
    op.drop_column('video_lesson_jobs', 'expires_at')

    op.drop_index('ix_podcast_generation_jobs_expires_at', table_name='podcast_generation_jobs')
    op.drop_column('podcast_generation_jobs', 'expires_at')
