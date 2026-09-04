"""adiciona library_id em academic_materials (memória anti-repetição de questões)

Revision ID: 2026_06_16_mat_library_id
Revises: 2026_06_05_more_pills
Create Date: 2026-06-16

Vincula cada material à biblioteca de origem para que a geração de questionários
possa consultar as provas já criadas DAQUELA biblioteca e evitar repetir questões.
Nullable (materiais gerados a partir de filepath/upload não têm biblioteca).
ON DELETE SET NULL: apagar a biblioteca não apaga o material, só desvincula.
"""
from alembic import op
import sqlalchemy as sa


revision = '2026_06_16_mat_library_id'
down_revision = '2026_06_05_more_pills'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('academic_materials', sa.Column('library_id', sa.Integer(), nullable=True))
    op.create_index('ix_academic_materials_library_id', 'academic_materials', ['library_id'])
    op.create_foreign_key(
        'fk_academic_materials_library_id',
        'academic_materials', 'academic_libraries',
        ['library_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade():
    op.drop_constraint('fk_academic_materials_library_id', 'academic_materials', type_='foreignkey')
    op.drop_index('ix_academic_materials_library_id', table_name='academic_materials')
    op.drop_column('academic_materials', 'library_id')
