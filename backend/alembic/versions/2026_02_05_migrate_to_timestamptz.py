"""Migrate all TIMESTAMP columns to TIMESTAMPTZ for timezone-aware datetimes

Revision ID: 2026_02_05_tz
Revises: 2026_02_04_storage
Create Date: 2026-02-05

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '2026_02_05_tz'
down_revision = '2026_02_04_storage'
branch_labels = None
depends_on = None

# All (table, column) pairs that need TIMESTAMP -> TIMESTAMPTZ
COLUMNS = [
    ('arena_seasons', 'start_date'),
    ('arena_seasons', 'end_date'),
    ('arena_seasons', 'created_at'),
    ('season_rankings', 'updated_at'),
    ('arena_challenges', 'created_at'),
    ('arena_challenges', 'expires_at'),
    ('arena_challenges', 'completed_at'),
    ('patients', 'birth_date'),
    ('patients', 'created_at'),
    ('patients', 'updated_at'),
    ('consultations', 'created_at'),
    ('consultations', 'updated_at'),
    ('prescriptions', 'created_at'),
    ('medical_documents', 'created_at'),
    ('exam_orders', 'created_at'),
    ('users', 'last_student_bonus_date'),
    ('users', 'last_monthly_credit_date'),
    ('users', 'created_at'),
    ('users', 'updated_at'),
    ('invitations', 'created_at'),
    ('transactions', 'timestamp'),
    ('dracma_ledger', 'acquired_at'),
    ('dracma_ledger', 'expires_at'),
    ('dracma_ledger', 'consumed_at'),
    ('avatar_history', 'created_at'),
    ('user_anamnesis_templates', 'created_at'),
    ('user_anamnesis_templates', 'updated_at'),
    ('feedback', 'created_at'),
    ('chat_sessions', 'created_at'),
    ('chat_sessions', 'updated_at'),
    ('chat_messages', 'timestamp'),
    ('academic_libraries', 'created_at'),
    ('academic_documents', 'created_at'),
    ('academic_documents', 'updated_at'),
    ('achievements', 'achieved_at'),
    ('quiz_attempts', 'completed_at'),
    ('podcast_generation_jobs', 'created_at'),
    ('podcast_generation_jobs', 'updated_at'),
    ('podcast_generation_jobs', 'expires_at'),
    ('video_lesson_jobs', 'created_at'),
    ('video_lesson_jobs', 'updated_at'),
    ('video_lesson_jobs', 'expires_at'),
    ('simulado_generation_jobs', 'created_at'),
    ('simulado_generation_jobs', 'updated_at'),
    ('academic_materials', 'created_at'),
    ('academic_materials', 'updated_at'),
    ('academic_materials', 'expires_at'),
    ('training_data', 'created_at'),
    ('preference_data', 'created_at'),
    ('surgical_cases', 'created_at'),
    ('surgical_cases', 'updated_at'),
    ('surgical_events', 'timestamp'),
    ('drug_administrations', 'timestamp'),
    ('surgical_outcomes', 'created_at'),
    ('surgical_templates', 'created_at'),
    ('surgical_templates', 'updated_at'),
    ('surgical_materials', 'expiration_date'),
    ('surgical_materials', 'timestamp'),
    ('frequent_materials', 'last_used'),
    ('payment_waitlist', 'created_at'),
    ('profile_update_requests', 'created_at'),
    ('profile_update_requests', 'reviewed_at'),
    ('system_settings', 'updated_at'),
    ('settings_audit_log', 'changed_at'),
    ('rate_limit_entries', 'timestamp'),
    ('server_metrics', 'timestamp'),
    ('blog_posts', 'published_at'),
    ('blog_posts', 'created_at'),
    ('blog_posts', 'updated_at'),
]


def upgrade():
    for table, column in COLUMNS:
        op.alter_column(
            table, column,
            type_=sa.DateTime(timezone=True),
            existing_type=sa.DateTime(),
            existing_nullable=True,
        )


def downgrade():
    for table, column in COLUMNS:
        op.alter_column(
            table, column,
            type_=sa.DateTime(),
            existing_type=sa.DateTime(timezone=True),
            existing_nullable=True,
        )
