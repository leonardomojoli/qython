"""Add doctor_logo column to users table

Allows doctors to upload a custom logo (clinic, hospital, city hall)
for use in medical PDF headers (prescriptions, attestados, exam orders, orientations).

Revision ID: 2026_02_10_doctor_logo
Revises: 2026_02_10_multi_file_upload
Create Date: 2026-02-10 23:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '2026_02_10_doctor_logo'
down_revision = '2026_02_10_multi_file_upload'
branch_labels = None
depends_on = None

def upgrade():
    op.add_column('users', sa.Column('doctor_logo', sa.String(255), nullable=True))

def downgrade():
    op.drop_column('users', 'doctor_logo')
