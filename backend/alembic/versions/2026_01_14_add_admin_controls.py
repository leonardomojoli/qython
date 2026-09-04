# backend/alembic/versions/2026_01_14_add_admin_controls.py
"""Add admin controls tables (system_settings, audit_log, rate_limit, metrics)

Revision ID: 2026_01_14_admin
Revises: 9abc06438de2
Create Date: 2026-01-14

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = '2026_01_14_admin'
down_revision = '9abc06438de2'
branch_labels = None
depends_on = None


def table_exists(table_name):
    """Check if a table exists in the database."""
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade():
    # Create payment_waitlist table (if not exists)
    if not table_exists('payment_waitlist'):
        op.create_table('payment_waitlist',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('email', sa.String(length=255), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('notified', sa.Boolean(), nullable=True, server_default='false'),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_payment_waitlist_email', 'payment_waitlist', ['email'], unique=True)

    # Create system_settings table
    if not table_exists('system_settings'):
        op.create_table('system_settings',
            sa.Column('key', sa.String(length=100), nullable=False),
            sa.Column('value', sa.Text(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.Column('updated_by', sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(['updated_by'], ['users.id']),
            sa.PrimaryKeyConstraint('key')
        )

    # Create settings_audit_log table
    if not table_exists('settings_audit_log'):
        op.create_table('settings_audit_log',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('setting_key', sa.String(length=100), nullable=False),
            sa.Column('old_value', sa.Text(), nullable=True),
            sa.Column('new_value', sa.Text(), nullable=False),
            sa.Column('changed_by', sa.Integer(), nullable=True),
            sa.Column('changed_at', sa.DateTime(), nullable=True),
            sa.Column('ip_address', sa.String(length=45), nullable=True),
            sa.Column('user_agent', sa.String(length=500), nullable=True),
            sa.Column('reason', sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(['changed_by'], ['users.id']),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_settings_audit_log_setting_key', 'settings_audit_log', ['setting_key'])

    # Create rate_limit_entries table
    if not table_exists('rate_limit_entries'):
        op.create_table('rate_limit_entries',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=True),
            sa.Column('ip_address', sa.String(length=45), nullable=False),
            sa.Column('endpoint', sa.String(length=200), nullable=False),
            sa.Column('timestamp', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['users.id']),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_rate_limit_entries_timestamp', 'rate_limit_entries', ['timestamp'])
        op.create_index('ix_rate_limit_user_time', 'rate_limit_entries', ['user_id', 'timestamp'])
        op.create_index('ix_rate_limit_ip_time', 'rate_limit_entries', ['ip_address', 'timestamp'])

    # Create server_metrics table
    if not table_exists('server_metrics'):
        op.create_table('server_metrics',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('timestamp', sa.DateTime(), nullable=True),
            sa.Column('cpu_percent', sa.Float(), nullable=True),
            sa.Column('memory_percent', sa.Float(), nullable=True),
            sa.Column('disk_percent', sa.Float(), nullable=True),
            sa.Column('active_connections', sa.Integer(), nullable=True),
            sa.Column('requests_per_minute', sa.Integer(), nullable=True),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index('ix_server_metrics_timestamp', 'server_metrics', ['timestamp'])

    # Insert default settings (use ON CONFLICT to avoid duplicates)
    op.execute("""
        INSERT INTO system_settings (key, value, updated_at) VALUES
        ('payment_gateway_stripe_enabled', 'true', NOW()),
        ('payment_gateway_binance_enabled', 'true', NOW()),
        ('server_maintenance_level', '0', NOW()),
        ('new_registrations_enabled', 'true', NOW()),
        ('auto_maintenance_cpu_threshold', '90', NOW()),
        ('auto_maintenance_memory_threshold', '85', NOW()),
        ('rate_limit_requests_per_minute', '60', NOW()),
        ('rate_limit_enabled', 'true', NOW()),
        ('auto_maintenance_enabled', 'true', NOW())
        ON CONFLICT (key) DO NOTHING
    """)


def downgrade():
    # Drop tables (only if they exist)
    op.drop_table('server_metrics')
    op.drop_table('rate_limit_entries')
    op.drop_table('settings_audit_log')
    op.drop_table('system_settings')
