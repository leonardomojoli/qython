"""Add pharmacy module tables

Revision ID: 2026_02_08_pharmacy
Revises: 2026_02_06_orientations
Create Date: 2026-02-08

"""
from alembic import op
import sqlalchemy as sa

revision = '2026_02_08_pharmacy'
down_revision = '2026_02_06_orientations'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Medications catalog
    op.create_table('medications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('active_principle', sa.String(255), nullable=False),
        sa.Column('presentation', sa.String(255), nullable=True),
        sa.Column('atc_code', sa.String(20), nullable=True),
        sa.Column('therapeutic_class', sa.String(150), nullable=True),
        sa.Column('requires_prescription', sa.Boolean(), server_default='true'),
        sa.Column('controlled_type', sa.String(10), nullable=True),
        sa.Column('farmacia_popular', sa.Boolean(), server_default='false'),
        sa.Column('farmacia_popular_copay', sa.Float(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_medications_active_principle', 'medications', ['active_principle'])
    op.create_index('ix_medications_farmacia_popular', 'medications', ['farmacia_popular'])
    op.create_index('ix_medication_name_principle', 'medications', ['name', 'active_principle'])

    # Drug interactions
    op.create_table('drug_interactions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('active_principle_a', sa.String(255), nullable=False),
        sa.Column('active_principle_b', sa.String(255), nullable=False),
        sa.Column('severity', sa.String(20), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('mechanism', sa.Text(), nullable=True),
        sa.Column('clinical_management', sa.Text(), nullable=True),
        sa.Column('source', sa.String(100), nullable=True),
        sa.Column('evidence_level', sa.String(30), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('active_principle_a', 'active_principle_b', name='uq_interaction_pair')
    )
    op.create_index('ix_drug_interactions_principle_a', 'drug_interactions', ['active_principle_a'])
    op.create_index('ix_drug_interactions_principle_b', 'drug_interactions', ['active_principle_b'])

    # Pharmacy chains (networks)
    op.create_table('pharmacy_chains',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('brand_names', sa.JSON(), nullable=True),
        sa.Column('cnpj_matriz', sa.String(20), nullable=True),
        sa.Column('logo_url', sa.String(500), nullable=True),
        sa.Column('website', sa.String(500), nullable=True),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('contact_name', sa.String(150), nullable=True),
        sa.Column('contact_email', sa.String(120), nullable=True),
        sa.Column('contact_phone', sa.String(20), nullable=True),
        sa.Column('subscription_tier', sa.String(20), server_default='individual'),
        sa.Column('subscription_active', sa.Boolean(), server_default='false'),
        sa.Column('stripe_customer_id', sa.String(255), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('is_verified', sa.Boolean(), server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('cnpj_matriz')
    )
    op.create_index('ix_pharmacy_chains_is_active', 'pharmacy_chains', ['is_active'])

    # Individual pharmacy units
    op.create_table('pharmacies',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('chain_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('brand_name', sa.String(255), nullable=True),
        sa.Column('cnpj', sa.String(20), nullable=True),
        sa.Column('phone', sa.String(20), nullable=True),
        sa.Column('email', sa.String(120), nullable=True),
        sa.Column('address', sa.String(500), nullable=True),
        sa.Column('city', sa.String(100), nullable=True),
        sa.Column('state', sa.String(2), nullable=True),
        sa.Column('zip_code', sa.String(10), nullable=True),
        sa.Column('latitude', sa.Float(), nullable=True),
        sa.Column('longitude', sa.Float(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('is_verified', sa.Boolean(), server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['chain_id'], ['pharmacy_chains.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('cnpj')
    )
    op.create_index('ix_pharmacies_city', 'pharmacies', ['city'])
    op.create_index('ix_pharmacies_state', 'pharmacies', ['state'])
    op.create_index('ix_pharmacies_is_active', 'pharmacies', ['is_active'])
    op.create_index('ix_pharmacy_geo', 'pharmacies', ['latitude', 'longitude'])
    op.create_index('ix_pharmacy_city_state', 'pharmacies', ['city', 'state'])

    # Pharmacy medication inventory
    op.create_table('pharmacy_medications',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('pharmacy_id', sa.Integer(), nullable=False),
        sa.Column('medication_id', sa.Integer(), nullable=False),
        sa.Column('price', sa.Float(), nullable=True),
        sa.Column('farmacia_popular_price', sa.Float(), nullable=True),
        sa.Column('in_stock', sa.Boolean(), server_default='true'),
        sa.Column('last_stock_update', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['pharmacy_id'], ['pharmacies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['medication_id'], ['medications.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('pharmacy_id', 'medication_id', name='uq_pharmacy_medication')
    )

    # Prescription share links
    op.create_table('prescription_shares',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('prescription_id', sa.Integer(), nullable=False),
        sa.Column('share_token', sa.String(64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('view_count', sa.Integer(), server_default='0'),
        sa.Column('last_viewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(20), server_default="'active'"),
        sa.ForeignKeyConstraint(['prescription_id'], ['prescriptions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_prescription_shares_token', 'prescription_shares', ['share_token'], unique=True)

    # Pharmacy prescription sends
    op.create_table('pharmacy_prescriptions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('prescription_id', sa.Integer(), nullable=False),
        sa.Column('pharmacy_id', sa.Integer(), nullable=False),
        sa.Column('doctor_id', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(20), server_default="'sent'"),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('viewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('fulfilled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('pharmacy_notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['prescription_id'], ['prescriptions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['pharmacy_id'], ['pharmacies.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['doctor_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('prescription_id', 'pharmacy_id', name='uq_prescription_pharmacy')
    )

    # Pharmacy waitlist
    op.create_table('pharmacy_waitlist',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('pharmacy_name', sa.String(255), nullable=False),
        sa.Column('cnpj', sa.String(20), nullable=True),
        sa.Column('contact_name', sa.String(150), nullable=False),
        sa.Column('email', sa.String(120), nullable=False),
        sa.Column('phone', sa.String(20), nullable=True),
        sa.Column('city', sa.String(100), nullable=True),
        sa.Column('state', sa.String(2), nullable=True),
        sa.Column('is_chain', sa.Boolean(), server_default='false'),
        sa.Column('chain_size', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(20), server_default="'pending'"),
        sa.Column('admin_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_pharmacy_waitlist_email', 'pharmacy_waitlist', ['email'])


def downgrade() -> None:
    op.drop_table('pharmacy_waitlist')
    op.drop_table('pharmacy_prescriptions')
    op.drop_table('prescription_shares')
    op.drop_table('pharmacy_medications')
    op.drop_table('pharmacies')
    op.drop_table('pharmacy_chains')
    op.drop_table('drug_interactions')
    op.drop_table('medications')
