"""Share BR medications to UY in medication_countries

Revision ID: 2026_02_09_br_to_uy
Revises: 2026_02_09_cl_programs
Create Date: 2026-02-09

"""
from alembic import op
from sqlalchemy import text

revision = '2026_02_09_br_to_uy'
down_revision = '2026_02_09_cl_programs'
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    # Link all BR medications to UY (shared essential catalog)
    conn.execute(text("""
        INSERT INTO medication_countries (medication_id, country_code)
        SELECT id, 'uy' FROM medications WHERE country = 'br'
        ON CONFLICT DO NOTHING
    """))


def downgrade() -> None:
    conn = op.get_bind()

    # Remove BR meds from UY (keep UY-origin meds)
    conn.execute(text("""
        DELETE FROM medication_countries
        WHERE country_code = 'uy'
        AND medication_id IN (SELECT id FROM medications WHERE country = 'br')
    """))
