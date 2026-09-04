# backend/alembic/versions/2026_01_10_consultation_enhancements.py
"""Add enhanced fields to consultations table

Revision ID: 2026_01_10_consultation_enhancements
Revises: 2025_01_10_ambulatory
Create Date: 2026-01-10

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '2026_01_10_consult_enhance'
down_revision = '2025_01_10_ambulatory'
branch_labels = None
depends_on = None


def upgrade():
    # Add new structured fields to consultations table
    
    # Chief complaint - structured field for the main complaint
    op.add_column('consultations', 
        sa.Column('chief_complaint', sa.String(500), nullable=True))
    
    # ICD-10 codes - array of diagnosis codes (using JSON for compatibility)
    op.add_column('consultations',
        sa.Column('icd_codes', sa.JSON(), nullable=True))
    
    # Vital signs - structured JSON with PA, FC, FR, SpO2, Temp, Weight
    op.add_column('consultations',
        sa.Column('vital_signs', sa.JSON(), nullable=True))
    
    # Physical exam summary - separate from improved_notes for structured access
    op.add_column('consultations',
        sa.Column('physical_exam', sa.Text(), nullable=True))
    
    # AI adoption metrics - how many AI suggestions were accepted
    op.add_column('consultations',
        sa.Column('ai_suggestions_accepted', sa.Integer(), nullable=True, server_default='0'))
    
    # Consultation duration in minutes
    op.add_column('consultations',
        sa.Column('duration_minutes', sa.Integer(), nullable=True))
    
    # Updated timestamp for tracking edits
    op.add_column('consultations',
        sa.Column('updated_at', sa.DateTime(), nullable=True))


def downgrade():
    # Drop columns in reverse order
    op.drop_column('consultations', 'updated_at')
    op.drop_column('consultations', 'duration_minutes')
    op.drop_column('consultations', 'ai_suggestions_accepted')
    op.drop_column('consultations', 'physical_exam')
    op.drop_column('consultations', 'vital_signs')
    op.drop_column('consultations', 'icd_codes')
    op.drop_column('consultations', 'chief_complaint')
