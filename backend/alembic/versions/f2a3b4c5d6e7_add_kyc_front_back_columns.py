"""add kyc front back columns

Revision ID: f2a3b4c5d6e7
Revises: e66d2db2f63a
Create Date: 2024-12-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f2a3b4c5d6e7'
down_revision: Union[str, None] = 'e66d2db2f63a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new columns for KYC Level 2 front/back document support
    op.add_column('users', sa.Column('personal_doc_type', sa.String(20), nullable=True))
    op.add_column('users', sa.Column('personal_doc_front_path', sa.String(500), nullable=True))
    op.add_column('users', sa.Column('personal_doc_back_path', sa.String(500), nullable=True))
    
    # Remove old single document column (if it exists)
    # Using try/except since column may not exist in all environments
    try:
        op.drop_column('users', 'personal_id_doc_path')
    except:
        pass


def downgrade() -> None:
    # Remove new columns
    op.drop_column('users', 'personal_doc_back_path')
    op.drop_column('users', 'personal_doc_front_path')
    op.drop_column('users', 'personal_doc_type')
    
    # Re-add old column
    op.add_column('users', sa.Column('personal_id_doc_path', sa.String(500), nullable=True))
