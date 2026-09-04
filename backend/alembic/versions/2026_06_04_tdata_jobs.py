"""add training_data_id to academic job/material tables

Revision ID: 2026_06_04_tdata_jobs
Revises: 2026_05_29_latreo_verif
Create Date: 2026-06-04

Adiciona a coluna nullable `training_data_id` em podcast_generation_jobs,
video_lesson_jobs, simulado_generation_jobs e academic_materials. Permite que o
feedback do usuário (like/dislike) case com a entrada exata de TrainingData
gerada por aquele job — match à prova de balas, sem depender do match por texto.
"""
from alembic import op
import sqlalchemy as sa


revision = '2026_06_04_tdata_jobs'
down_revision = '2026_05_29_latreo_verif'
branch_labels = None
depends_on = None


_TABLES = [
    'podcast_generation_jobs',
    'video_lesson_jobs',
    'simulado_generation_jobs',
    'academic_materials',
]


def upgrade():
    for table in _TABLES:
        op.add_column(table, sa.Column('training_data_id', sa.Integer(), nullable=True))


def downgrade():
    for table in _TABLES:
        op.drop_column(table, 'training_data_id')
