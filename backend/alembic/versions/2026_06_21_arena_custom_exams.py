"""Arena — provas customizadas (concursos): cards, sources, rounds, attempts

Revision ID: 2026_06_21_arena_custom_exams
Revises: 2026_06_19_drop_personal_doc
Create Date: 2026-06-21

Pilar "Meus Concursos" da Arena: o usuário cria um CARD (gerador de prova a partir
das suas bibliotecas + dossiê de pesquisa web) e dele publica ROUNDS congelados que
colegas respondem e disputam num leaderboard PRÓPRIO.

TRILHA SEPARADA: a competição customizada NÃO toca season_rankings/user_xp_profiles/
xp_transactions — por isso as tentativas vivem em `custom_round_attempts` (tabela
própria), não em `quiz_attempts`. Sem buraco de farming de XP na liga oficial.

Tabelas novas: custom_exam_cards, custom_card_sources, custom_exam_rounds,
custom_round_attempts. + coluna academic_materials.card_id (drafts gerados de um Card,
p/ a anti-repetição por card). Desenho: docs/ARENA_CUSTOM_EXAMS.md
"""
from alembic import op
import sqlalchemy as sa


revision = '2026_06_21_arena_custom_exams'
down_revision = '2026_06_19_drop_personal_doc'
branch_labels = None
depends_on = None


def upgrade():
    # --- custom_exam_cards: o gerador/template ---
    op.create_table(
        'custom_exam_cards',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('language', sa.String(length=10), nullable=False, server_default='pt-BR'),
        sa.Column('config', sa.JSON(), nullable=False),
        sa.Column('dossier', sa.JSON(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='active'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_custom_exam_cards_user_id', 'custom_exam_cards', ['user_id'])

    # --- custom_card_sources: Card ↔ biblioteca-fonte (1 linha por biblioteca) ---
    op.create_table(
        'custom_card_sources',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('card_id', sa.Integer(), sa.ForeignKey('custom_exam_cards.id', ondelete='CASCADE'), nullable=False),
        sa.Column('library_id', sa.Integer(), sa.ForeignKey('academic_libraries.id', ondelete='SET NULL'), nullable=True),
        sa.UniqueConstraint('card_id', 'library_id', name='uq_card_source'),
    )
    op.create_index('ix_custom_card_sources_card_id', 'custom_card_sources', ['card_id'])

    # --- custom_exam_rounds: instância congelada/publicável ---
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

    # --- custom_round_attempts: tentativas (trilha separada, fora de quiz_attempts) ---
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

    # --- academic_materials.card_id: drafts gerados de um Card (anti-repetição por card) ---
    op.add_column('academic_materials', sa.Column('card_id', sa.Integer(), nullable=True))
    op.create_index('ix_academic_materials_card_id', 'academic_materials', ['card_id'])
    op.create_foreign_key(
        'fk_academic_materials_card_id',
        'academic_materials', 'custom_exam_cards',
        ['card_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade():
    op.drop_constraint('fk_academic_materials_card_id', 'academic_materials', type_='foreignkey')
    op.drop_index('ix_academic_materials_card_id', table_name='academic_materials')
    op.drop_column('academic_materials', 'card_id')

    op.drop_table('custom_round_attempts')
    op.drop_table('custom_exam_rounds')
    op.drop_table('custom_card_sources')
    op.drop_table('custom_exam_cards')
