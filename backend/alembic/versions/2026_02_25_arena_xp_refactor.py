"""Arena XP refactor: effort-based ranking system

Revision ID: 2026_02_25_arena_xp
Revises: 2026_02_21_analytics
Create Date: 2026-02-25
"""
from alembic import op
import sqlalchemy as sa

revision = '2026_02_25_arena_xp'
down_revision = '2026_02_21_analytics'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- New table: user_xp_profiles ---
    op.create_table(
        'user_xp_profiles',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('total_xp', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('season_xp', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('current_streak', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('longest_streak', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('last_activity_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('league_tier', sa.String(20), nullable=False, server_default='bronze'),
        sa.Column('season_id', sa.Integer(), sa.ForeignKey('arena_seasons.id'), nullable=True),
        sa.Column('season_rank', sa.Integer(), nullable=True),
        sa.Column('season_percentile', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_user_xp_profiles_league_tier', 'user_xp_profiles', ['league_tier'])

    # --- New table: xp_transactions ---
    op.create_table(
        'xp_transactions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('season_id', sa.Integer(), sa.ForeignKey('arena_seasons.id'), nullable=True),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('source', sa.String(30), nullable=False),
        sa.Column('quiz_attempt_id', sa.Integer(), sa.ForeignKey('quiz_attempts.id'), nullable=True),
        sa.Column('challenge_id', sa.Integer(), sa.ForeignKey('arena_challenges.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('ix_xp_transactions_user_id', 'xp_transactions', ['user_id'])

    # --- Alter quiz_attempts: add XP columns ---
    op.add_column('quiz_attempts', sa.Column('xp_earned', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('quiz_attempts', sa.Column('correct_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('quiz_attempts', sa.Column('incorrect_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('quiz_attempts', sa.Column('unanswered_count', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('quiz_attempts', sa.Column('total_questions', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('quiz_attempts', sa.Column('time_elapsed_seconds', sa.Integer(), nullable=True))
    op.add_column('quiz_attempts', sa.Column('answers_detail', sa.JSON(), nullable=True))

    # --- Alter season_rankings: add XP column ---
    op.add_column('season_rankings', sa.Column('total_xp', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('season_rankings', sa.Column('league_tier', sa.String(20), server_default='bronze'))

    # --- Alter arena_challenges: add XP columns ---
    op.add_column('arena_challenges', sa.Column('challenger_xp', sa.Integer(), nullable=True))
    op.add_column('arena_challenges', sa.Column('opponent_xp', sa.Integer(), nullable=True))

    # --- Data migration: create XP profiles for existing users with stats ---
    op.execute("""
        INSERT INTO user_xp_profiles (user_id, total_xp, season_xp, league_tier)
        SELECT user_id, total_score * 5, 0, 'bronze'
        FROM user_stats
        WHERE total_score > 0
        ON CONFLICT (user_id) DO NOTHING
    """)


def downgrade() -> None:
    op.drop_column('arena_challenges', 'opponent_xp')
    op.drop_column('arena_challenges', 'challenger_xp')
    op.drop_column('season_rankings', 'league_tier')
    op.drop_column('season_rankings', 'total_xp')
    op.drop_column('quiz_attempts', 'answers_detail')
    op.drop_column('quiz_attempts', 'time_elapsed_seconds')
    op.drop_column('quiz_attempts', 'total_questions')
    op.drop_column('quiz_attempts', 'unanswered_count')
    op.drop_column('quiz_attempts', 'incorrect_count')
    op.drop_column('quiz_attempts', 'correct_count')
    op.drop_column('quiz_attempts', 'xp_earned')
    op.drop_index('ix_xp_transactions_user_id', 'xp_transactions')
    op.drop_table('xp_transactions')
    op.drop_index('ix_user_xp_profiles_league_tier', 'user_xp_profiles')
    op.drop_table('user_xp_profiles')
