# qython/backend/alembic/versions/2025_01_10_ambulatory_models.py
"""Add ambulatory models: Patient, Prescription, MedicalDocument, ExamOrder

Revision ID: ambulatory_001
Revises: 
Create Date: 2025-01-10

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '2025_01_10_ambulatory'
down_revision = '2026_01_08_add_summaries'
branch_labels = None
depends_on = None


def upgrade():
    # Create patients table
    op.create_table('patients',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('doctor_id', sa.Integer(), nullable=False),
        sa.Column('full_name', sa.String(length=150), nullable=False),
        sa.Column('birth_date', sa.DateTime(), nullable=True),
        sa.Column('gender', sa.String(length=20), nullable=True),
        sa.Column('phone', sa.String(length=20), nullable=True),
        sa.Column('email', sa.String(length=120), nullable=True),
        sa.Column('cpf', sa.String(length=14), nullable=True),
        sa.Column('allergies', sa.JSON(), nullable=True),
        sa.Column('chronic_conditions', sa.JSON(), nullable=True),
        sa.Column('current_medications', sa.JSON(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['doctor_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Add patient_id to consultations
    op.add_column('consultations', sa.Column('patient_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_consultations_patient_id', 'consultations', 'patients', ['patient_id'], ['id'])
    
    # Create prescriptions table
    op.create_table('prescriptions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('doctor_id', sa.Integer(), nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('consultation_id', sa.Integer(), nullable=True),
        sa.Column('prescription_type', sa.String(length=30), nullable=True),
        sa.Column('items', sa.JSON(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['doctor_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ),
        sa.ForeignKeyConstraint(['consultation_id'], ['consultations.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create medical_documents table
    op.create_table('medical_documents',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('doctor_id', sa.Integer(), nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('document_type', sa.String(length=30), nullable=False),
        sa.Column('content', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['doctor_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create exam_orders table
    op.create_table('exam_orders',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('doctor_id', sa.Integer(), nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('consultation_id', sa.Integer(), nullable=True),
        sa.Column('exams', sa.JSON(), nullable=False),
        sa.Column('clinical_indication', sa.Text(), nullable=True),
        sa.Column('urgency', sa.String(length=20), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['doctor_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], ),
        sa.ForeignKeyConstraint(['consultation_id'], ['consultations.id'], ),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade():
    op.drop_table('exam_orders')
    op.drop_table('medical_documents')
    op.drop_table('prescriptions')
    op.drop_constraint('fk_consultations_patient_id', 'consultations', type_='foreignkey')
    op.drop_column('consultations', 'patient_id')
    op.drop_table('patients')
