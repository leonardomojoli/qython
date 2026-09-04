"""merge blog and preference_data

Revision ID: 3ddb6af77d22
Revises: 2026_01_18_blog_posts, ead2a9beda23
Create Date: 2026-01-19 00:48:17.629276

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3ddb6af77d22'
down_revision = ('2026_01_18_blog_posts', 'ead2a9beda23')
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
