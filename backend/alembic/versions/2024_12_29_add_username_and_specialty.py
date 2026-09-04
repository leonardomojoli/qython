"""add_username_and_specialty_columns

Revision ID: a1b2c3d4e5f6
Revises: 2024_12_28_add_content_hash
Create Date: 2024-12-29

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '2024_12_28_add_content_hash'
branch_labels = None
depends_on = None


def upgrade():
    # Add username column (unique)
    op.add_column('users', sa.Column('username', sa.String(30), nullable=True))
    op.create_unique_constraint('uq_users_username', 'users', ['username'])
    
    # Add specialty column
    op.add_column('users', sa.Column('specialty', sa.String(100), nullable=True))


def downgrade():
    op.drop_constraint('uq_users_username', 'users', type_='unique')
    op.drop_column('users', 'username')
    op.drop_column('users', 'specialty')
