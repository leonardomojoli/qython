"""dropa custom_exam_rounds + custom_round_attempts (competição descartada)

Revision ID: 2026_06_21_drop_arena_rounds
Revises: 2026_06_21_arena_custom_exams
Create Date: 2026-06-21

As Provas Customizadas viraram um GERADOR PESSOAL (bibliotecas + dossiê de pesquisa da
banca), sem compartilhar/competir — concurso é jogo de soma zero, o usuário não dá as
próprias provas a concorrentes. As tabelas de round congelado e de tentativas (criadas em
2026_06_21_arena_custom_exams para a competição que NÃO foi adiante) ficaram órfãs e são
dropadas aqui. `custom_exam_cards`, `custom_card_sources` e `academic_materials.card_id`
PERMANECEM (são o gerador). downgrade recria as 2 tabelas (idênticas à criação original).
"""
from alembic import op
import sqlalchemy as sa


revision = '2026_06_21_drop_arena_rounds'
down_revision = '2026_06_21_arena_custom_exams'
branch_labels = None
depends_on = None


def upgrade():
    # attempts referencia rounds → dropar attempts primeiro
    op.drop_table('custom_round_attempts')
    op.drop_table('custom_exam_rounds')


def downgrade():
    op.create_table(
        'custom_exam_rounds',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('card_id', sa.Integer(), sa.ForeignKey('custom_exam_cards.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('title', sa.String(length=140), nullable=False),
        sa.Column('content', sa.JSON(), nullable=False),
        sa.Column('num_questions', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('time_limit_minutes', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='draft'),
        sa.Column('visibility', sa.String(length=20), nullable=False, server_default='link'),
        sa.Column('join_token', sa.String(length=40), nullable=True),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_custom_exam_rounds_card_id', 'custom_exam_rounds', ['card_id'])
    op.create_index('ix_custom_exam_rounds_user_id', 'custom_exam_rounds', ['user_id'])
    op.create_index('ix_custom_exam_rounds_status', 'custom_exam_rounds', ['status'])
    op.create_index('ix_custom_exam_rounds_join_token', 'custom_exam_rounds', ['join_token'], unique=True)

    op.create_table(
        'custom_round_attempts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('round_id', sa.Integer(), sa.ForeignKey('custom_exam_rounds.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('score', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('correct_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('incorrect_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('unanswered_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_questions', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('time_elapsed_seconds', sa.Integer(), nullable=True),
        sa.Column('answers_detail', sa.JSON(), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_custom_round_attempts_round_id', 'custom_round_attempts', ['round_id'])
    op.create_index('ix_custom_round_attempts_user_id', 'custom_round_attempts', ['user_id'])
