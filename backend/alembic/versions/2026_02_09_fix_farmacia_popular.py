"""Fix Farmácia Popular: correct to official 41-item list (Portaria 6.613/2025)

Previous data incorrectly tagged 132 medications. The real program has only
41 items (39 medications + geriatric diapers + menstrual pads), ALL 100% free
since Feb 14, 2025 (Portaria GM/MS Nº 6.613/2025).

Revision ID: 2026_02_09_fix_fp
Revises: 2026_02_09_dedup_uy
Create Date: 2026-02-09 23:45:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '2026_02_09_fix_fp'
down_revision = '2026_02_09_dedup_uy'
branch_labels = None
depends_on = None

# Official Farmácia Popular list - 41 items by medication name
# Source: Portaria GM/MS Nº 6.613/2025, updated values Jan 2026
FARMACIA_POPULAR_NAMES = [
    # Hipertensão (10)
    "Anlodipino 5mg",
    "Atenolol 25mg",
    "Captopril 25mg",
    "Enalapril 10mg",
    "Espironolactona 25mg",
    "Furosemida 40mg",
    "Hidroclorotiazida 25mg",
    "Losartana 50mg",
    "Propranolol 40mg",
    "Succinato de Metoprolol 25mg",
    # Diabetes (7)
    "Dapagliflozina 10mg",
    "Glibenclamida 5mg",
    "Insulina NPH 100UI/mL",
    "Insulina Regular 100UI/mL",
    "Metformina 500mg",
    "Metformina 500mg LP",
    "Metformina 850mg",
    # Asma/DPOC (7)
    "Brometo de Ipratrópio 0,25mg/mL",
    "Brometo de Ipratrópio Spray 0,02mg",
    "Beclometasona 50mcg",
    "Beclometasona 200mcg Cápsula Inalação",
    "Beclometasona 250mcg",
    "Salbutamol Spray 100mcg",
    "Salbutamol 5mg/mL Solução Nebulização",
    # Rinite (3)
    "Beclometasona 50mcg Nasal",
    "Budesonida Nasal 32mcg",
    "Budesonida Nasal 50mcg",
    # Dislipidemia (3)
    "Sinvastatina 10mg",
    "Sinvastatina 20mg",
    "Sinvastatina 40mg",
    # Parkinson (2)
    "Levodopa + Carbidopa 250/25mg",
    "Levodopa + Benserazida 100/25mg",
    # Osteoporose (1)
    "Alendronato 70mg",
    # Glaucoma (2)
    "Timolol Colírio 0,25%",
    "Timolol Colírio 0,5%",
    # Anticoncepção (4)
    "Etinilestradiol + Levonorgestrel",
    "Medroxiprogesterona 150mg/mL",
    "Noretisterona 0,35mg",
    "Valerato de Estradiol + Noretisterona",
    # Itens não-medicamentosos (2)
    "Absorvente Higiênico",
    "Fralda Geriátrica",
]


def upgrade():
    conn = op.get_bind()

    # Get farmacia_popular program ID
    fp_row = conn.execute(
        sa.text("SELECT id FROM government_programs WHERE code = 'farmacia_popular'")
    ).fetchone()
    if not fp_row:
        return
    fp_id = fp_row[0]

    # Step 1: Remove ALL existing FP linkages
    conn.execute(
        sa.text("DELETE FROM medication_government_programs WHERE program_id = :fp_id"),
        {"fp_id": fp_id}
    )

    # Step 2: Reset all farmacia_popular booleans
    conn.execute(
        sa.text("UPDATE medications SET farmacia_popular = false, farmacia_popular_copay = NULL WHERE country = 'br'")
    )

    # Step 3: For each official FP medication, link and set boolean
    for name in FARMACIA_POPULAR_NAMES:
        row = conn.execute(
            sa.text("SELECT id FROM medications WHERE name = :name AND country = 'br'"),
            {"name": name}
        ).fetchone()
        if not row:
            continue

        med_id = row[0]

        # Link to FP program
        conn.execute(
            sa.text(
                "INSERT INTO medication_government_programs "
                "(medication_id, program_id, copay, is_active) "
                "VALUES (:med_id, :fp_id, 0, true) "
                "ON CONFLICT DO NOTHING"
            ),
            {"med_id": med_id, "fp_id": fp_id}
        )

        # Set boolean
        conn.execute(
            sa.text(
                "UPDATE medications SET farmacia_popular = true, farmacia_popular_copay = 0 "
                "WHERE id = :med_id"
            ),
            {"med_id": med_id}
        )

    # Step 4: Ensure all_items_free is true (since Feb 2025)
    conn.execute(
        sa.text("UPDATE government_programs SET all_items_free = true WHERE id = :fp_id"),
        {"fp_id": fp_id}
    )


def downgrade():
    # Not reversible — previous data was incorrect
    pass
