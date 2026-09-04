# backend/alembic/versions/2026_05_27_lgpd_core.py
"""LGPD core: consent documents, user consents, audit log, dataset export log.

Revision ID: 2026_05_27_lgpd_core
Revises: 2026_05_27_drop_surg
Create Date: 2026-05-27

Adds the foundational LGPD compliance layer:

1. consent_documents — immutable, versioned, content-hashed legal documents
   (Terms of Use, Privacy Policy, 6 ML training scopes).

2. user_consents — explicit grant/revoke records per (user, document type),
   with a PARTIAL UNIQUE index ensuring only one ACTIVE (non-revoked,
   non-expired) consent per (user, type) at any time.

3. audit_log — append-only operations log (Art. 37). Protected by a Postgres
   trigger that rejects UPDATE/DELETE — forensic integrity is enforced at the
   DB level, not by application code.

4. dataset_export_logs — proof of minimization for each ML training data
   export (which consents authorized which records at export time).

5. User table updates — soft delete (deleted_at), ML consent timestamps.

6. TrainingData table updates — consent_id FK, anonymization_level,
   excluded_due_to_revocation flag.

Field-level encryption of existing columns (User.cpf, Patient.*, etc.) is
NOT in this migration — that requires careful data migration and lives in a
separate revision.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql


revision = '2026_05_27_lgpd_core'
down_revision = '2026_05_27_drop_surg'
branch_labels = None
depends_on = None


CONSENT_TYPES = (
    'terms_of_use',
    'privacy_policy',
    'ml_training_general',
    'ml_training_specialty',
    'ml_training_image',
    'ml_training_voice',
    'ml_training_feedback',
    'ml_research_publication',
)


def _table_exists(name: str) -> bool:
    bind = op.get_bind()
    return name in inspect(bind).get_table_names()


def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    if table not in inspect(bind).get_table_names():
        return False
    return column in [c['name'] for c in inspect(bind).get_columns(table)]


def upgrade():
    bind = op.get_bind()

    # ---- 1. Enum type for consent document types ----
    consent_enum = postgresql.ENUM(
        *CONSENT_TYPES,
        name='consent_document_type',
        create_type=False,
    )
    consent_enum.create(bind, checkfirst=True)

    # ---- 2. consent_documents ----
    if not _table_exists('consent_documents'):
        op.create_table(
            'consent_documents',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('type', consent_enum, nullable=False),
            sa.Column('version', sa.String(length=20), nullable=False),
            sa.Column('locale', sa.String(length=10), nullable=False, server_default='pt-BR'),
            sa.Column('title', sa.String(length=200), nullable=False),
            sa.Column('body', sa.Text(), nullable=False),
            sa.Column('content_hash', sa.String(length=64), nullable=False),
            sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column('default_ttl_days', sa.Integer(), nullable=True),
            sa.Column('published_at', sa.DateTime(timezone=True),
                      server_default=sa.func.now(), nullable=False),
            sa.Column('metadata_info', sa.JSON(), nullable=True),
            sa.UniqueConstraint('type', 'version', 'locale',
                                name='uq_consent_doc_type_version_locale'),
        )
        op.create_index('ix_consent_documents_type', 'consent_documents', ['type'])
        op.create_index('ix_consent_documents_content_hash', 'consent_documents', ['content_hash'])
        op.create_index('ix_consent_doc_type_active', 'consent_documents', ['type', 'is_active'])

    # ---- 3. user_consents ----
    if not _table_exists('user_consents'):
        op.create_table(
            'user_consents',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('user_id', sa.Integer(),
                      sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('document_id', sa.Integer(),
                      sa.ForeignKey('consent_documents.id', ondelete='RESTRICT'), nullable=False),
            sa.Column('type', consent_enum, nullable=False),
            sa.Column('version', sa.String(length=20), nullable=False),
            sa.Column('granted_at', sa.DateTime(timezone=True),
                      server_default=sa.func.now(), nullable=False),
            sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('actor_ip', sa.String(length=45), nullable=True),
            sa.Column('actor_user_agent', sa.String(length=500), nullable=True),
            sa.Column('document_hash', sa.String(length=64), nullable=False),
            sa.Column('scope_metadata', sa.JSON(), nullable=True),
        )
        op.create_index('ix_user_consents_user_id', 'user_consents', ['user_id'])
        op.create_index('ix_user_consents_type', 'user_consents', ['type'])
        op.create_index('ix_user_consents_revoked_at', 'user_consents', ['revoked_at'])
        op.create_index('ix_user_consents_expires_at', 'user_consents', ['expires_at'])
        op.create_index('ix_user_consents_user_type', 'user_consents', ['user_id', 'type'])
        # Partial unique index: only one ACTIVE (non-revoked) consent per (user, type).
        # Expiry is checked in application code (we cannot reference now() in an index).
        op.create_index(
            'ix_user_consents_active',
            'user_consents',
            ['user_id', 'type'],
            unique=True,
            postgresql_where=sa.text('revoked_at IS NULL'),
        )

    # ---- 4. audit_log + trigger ----
    if not _table_exists('audit_log'):
        op.create_table(
            'audit_log',
            sa.Column('id', sa.BigInteger(), primary_key=True),
            sa.Column('occurred_at', sa.DateTime(timezone=True),
                      server_default=sa.func.now(), nullable=False),
            sa.Column('actor_user_id', sa.Integer(),
                      sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
            sa.Column('actor_role', sa.String(length=30), nullable=True),
            sa.Column('actor_ip', sa.String(length=45), nullable=True),
            sa.Column('actor_user_agent', sa.String(length=500), nullable=True),
            sa.Column('action', sa.String(length=80), nullable=False),
            sa.Column('target_type', sa.String(length=50), nullable=True),
            sa.Column('target_id', sa.String(length=64), nullable=True),
            sa.Column('affected_user_id', sa.Integer(),
                      sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
            sa.Column('before', postgresql.JSONB(), nullable=True),
            sa.Column('after', postgresql.JSONB(), nullable=True),
            sa.Column('metadata_info', postgresql.JSONB(), nullable=True),
        )
        op.create_index('ix_audit_log_occurred_at', 'audit_log', ['occurred_at'])
        op.create_index('ix_audit_log_actor_user_id', 'audit_log', ['actor_user_id'])
        op.create_index('ix_audit_log_affected_user_id', 'audit_log', ['affected_user_id'])
        op.create_index('ix_audit_log_action', 'audit_log', ['action'])
        op.create_index('ix_audit_log_target_type', 'audit_log', ['target_type'])
        op.create_index('ix_audit_log_target_id', 'audit_log', ['target_id'])
        op.create_index('ix_audit_log_action_occurred', 'audit_log', ['action', 'occurred_at'])
        op.create_index('ix_audit_log_affected_user', 'audit_log',
                        ['affected_user_id', 'occurred_at'])

        # Trigger: refuse UPDATE and DELETE on audit_log.
        # This is the forensic-integrity guarantee. Application code cannot bypass.
        op.execute("""
            CREATE OR REPLACE FUNCTION audit_log_reject_modify()
            RETURNS TRIGGER AS $$
            BEGIN
                RAISE EXCEPTION
                    'audit_log is append-only — % operations are forbidden (LGPD Art. 37 forensic integrity)',
                    TG_OP;
            END;
            $$ LANGUAGE plpgsql;
        """)
        op.execute("""
            CREATE TRIGGER audit_log_no_modify
            BEFORE UPDATE OR DELETE ON audit_log
            FOR EACH ROW EXECUTE FUNCTION audit_log_reject_modify();
        """)

    # ---- 5. dataset_export_logs ----
    if not _table_exists('dataset_export_logs'):
        op.create_table(
            'dataset_export_logs',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('exported_at', sa.DateTime(timezone=True),
                      server_default=sa.func.now(), nullable=False),
            sa.Column('exported_by_user_id', sa.Integer(),
                      sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
            sa.Column('export_type', sa.String(length=40), nullable=False),
            sa.Column('dataset_hash', sa.String(length=64), nullable=False),
            sa.Column('entry_count', sa.Integer(), nullable=False),
            sa.Column('anonymization_level', sa.String(length=20), nullable=False),
            sa.Column('consent_snapshot', postgresql.JSONB(), nullable=True),
            sa.Column('excluded_due_to_revocation', sa.Integer(),
                      nullable=False, server_default='0'),
            sa.Column('excluded_due_to_expiry', sa.Integer(),
                      nullable=False, server_default='0'),
            sa.Column('metadata_info', postgresql.JSONB(), nullable=True),
        )
        op.create_index('ix_dataset_export_logs_exported_at',
                        'dataset_export_logs', ['exported_at'])
        op.create_index('ix_dataset_export_logs_dataset_hash',
                        'dataset_export_logs', ['dataset_hash'])

    # ---- 6. User table updates ----
    if not _column_exists('users', 'deleted_at'):
        op.add_column('users',
                      sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
        op.create_index('ix_users_deleted_at', 'users', ['deleted_at'])

    if not _column_exists('users', 'training_data_consent_at'):
        op.add_column('users',
                      sa.Column('training_data_consent_at',
                                sa.DateTime(timezone=True), nullable=True))

    if not _column_exists('users', 'training_data_consent_version'):
        op.add_column('users',
                      sa.Column('training_data_consent_version',
                                sa.String(length=20), nullable=True))

    # ---- 7. TrainingData table updates ----
    if not _column_exists('training_data', 'consent_id'):
        op.add_column('training_data',
                      sa.Column('consent_id', sa.Integer(),
                                sa.ForeignKey('user_consents.id', ondelete='SET NULL'),
                                nullable=True))
        op.create_index('ix_training_data_consent_id', 'training_data', ['consent_id'])

    if not _column_exists('training_data', 'anonymization_level'):
        op.add_column('training_data',
                      sa.Column('anonymization_level', sa.String(length=10), nullable=True))
        op.create_index('ix_training_data_anonymization_level',
                        'training_data', ['anonymization_level'])

    if not _column_exists('training_data', 'excluded_due_to_revocation'):
        op.add_column('training_data',
                      sa.Column('excluded_due_to_revocation', sa.Boolean(),
                                nullable=False, server_default=sa.false()))
        op.create_index('ix_training_data_excluded_due_to_revocation',
                        'training_data', ['excluded_due_to_revocation'])


def downgrade():
    """Reverse the migration. Caveat: data inserted in the new tables is LOST."""
    bind = op.get_bind()

    # training_data
    if _column_exists('training_data', 'excluded_due_to_revocation'):
        op.drop_index('ix_training_data_excluded_due_to_revocation', table_name='training_data')
        op.drop_column('training_data', 'excluded_due_to_revocation')
    if _column_exists('training_data', 'anonymization_level'):
        op.drop_index('ix_training_data_anonymization_level', table_name='training_data')
        op.drop_column('training_data', 'anonymization_level')
    if _column_exists('training_data', 'consent_id'):
        op.drop_index('ix_training_data_consent_id', table_name='training_data')
        op.drop_column('training_data', 'consent_id')

    # users
    if _column_exists('users', 'training_data_consent_version'):
        op.drop_column('users', 'training_data_consent_version')
    if _column_exists('users', 'training_data_consent_at'):
        op.drop_column('users', 'training_data_consent_at')
    if _column_exists('users', 'deleted_at'):
        op.drop_index('ix_users_deleted_at', table_name='users')
        op.drop_column('users', 'deleted_at')

    # tables (reverse dependency order)
    if _table_exists('dataset_export_logs'):
        op.drop_table('dataset_export_logs')

    if _table_exists('audit_log'):
        op.execute('DROP TRIGGER IF EXISTS audit_log_no_modify ON audit_log')
        op.execute('DROP FUNCTION IF EXISTS audit_log_reject_modify')
        op.drop_table('audit_log')

    if _table_exists('user_consents'):
        op.drop_table('user_consents')

    if _table_exists('consent_documents'):
        op.drop_table('consent_documents')

    # enum
    consent_enum = postgresql.ENUM(*CONSENT_TYPES, name='consent_document_type')
    consent_enum.drop(bind, checkfirst=True)
