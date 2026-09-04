"""Add script_path column to podcast_generation_jobs

Revision ID: 2026_02_06_podcast_script
Revises: 2026_02_05_tz
Create Date: 2026-02-06

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '2026_02_06_podcast_script'
down_revision = '2026_02_05_tz'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('podcast_generation_jobs', sa.Column('script_path', sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column('podcast_generation_jobs', 'script_path')
