"""Create patient_orientations table

Revision ID: 2026_02_06_orientations
Revises: 2026_02_06_podcast_script
Create Date: 2026-02-06

"""
from alembic import op
import sqlalchemy as sa

revision = '2026_02_06_orientations'
down_revision = '2026_02_06_podcast_script'
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.create_table('patient_orientations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('doctor_id', sa.Integer(), nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=True),
        sa.Column('generation_type', sa.String(20), nullable=False, server_default='template'),
        sa.Column('template_key', sa.String(50), nullable=True),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('ai_prompt', sa.Text(), nullable=True),
        sa.Column('specialty', sa.String(100), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['doctor_id'], ['users.id']),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
        sa.PrimaryKeyConstraint('id')
    )

def downgrade() -> None:
    op.drop_table('patient_orientations')
