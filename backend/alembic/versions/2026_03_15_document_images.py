"""Document images table for vision pipeline

Revision ID: 2026_03_15_doc_images
Revises: 2026_02_28_med_i18n
Create Date: 2026-03-15
"""
from alembic import op
import sqlalchemy as sa

revision = '2026_03_15_doc_images'
down_revision = '2026_02_28_med_i18n'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'document_images',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('document_id', sa.Integer(), sa.ForeignKey('academic_documents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('library_id', sa.Integer(), sa.ForeignKey('academic_libraries.id', ondelete='CASCADE'), nullable=False),

        # File info
        sa.Column('image_filename', sa.String(255), nullable=False),
        sa.Column('page_number', sa.Integer(), nullable=False),
        sa.Column('image_index', sa.Integer(), nullable=False),
        sa.Column('width', sa.Integer(), nullable=True),
        sa.Column('height', sa.Integer(), nullable=True),
        sa.Column('file_size_bytes', sa.BigInteger(), nullable=True),

        # Vision processing
        sa.Column('vision_status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('vision_description', sa.Text(), nullable=True),
        sa.Column('vision_model', sa.String(100), nullable=True),
        sa.Column('vision_error', sa.Text(), nullable=True),
        sa.Column('retry_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('vision_completed_at', sa.DateTime(timezone=True), nullable=True),

        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_index('ix_document_images_document_id', 'document_images', ['document_id'])
    op.create_index('ix_document_images_library_id', 'document_images', ['library_id'])
    op.create_index('ix_document_images_vision_status', 'document_images', ['vision_status'])


def downgrade() -> None:
    op.drop_index('ix_document_images_vision_status', table_name='document_images')
    op.drop_index('ix_document_images_library_id', table_name='document_images')
    op.drop_index('ix_document_images_document_id', table_name='document_images')
    op.drop_table('document_images')
