"""Remove duplicate UY medications, merge data into BR equivalents, fix Spanish text

Revision ID: 2026_02_09_dedup_uy
Revises: 2026_02_09_med_brands
Create Date: 2026-02-09 22:30:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '2026_02_09_dedup_uy'
down_revision = '2026_02_09_med_brands'
branch_labels = None
depends_on = None

# UY duplicate name → BR equivalent name
DUPLICATE_PAIRS = [
    ("Losartana 50mg", "Losartana 50mg"),
    ("Enalapril 10mg", "Enalapril 10mg"),
    ("Atenolol 50mg", "Atenolol 50mg"),
    ("Hidroclorotiazida 25mg", "Hidroclorotiazida 25mg"),
    ("Furosemida 40mg", "Furosemida 40mg"),
    ("Espironolactona 25mg", "Espironolactona 25mg"),
    ("Metformina 850mg", "Metformina 850mg"),
    ("Metformina 500mg", "Metformina 500mg"),
    ("Glibenclamida 5mg", "Glibenclamida 5mg"),
    ("Amoxicilina 500mg", "Amoxicilina 500mg"),
    ("Azitromicina 500mg", "Azitromicina 500mg"),
    ("Omeprazol 20mg", "Omeprazol 20mg"),
    ("Ibuprofeno 400mg", "Ibuprofeno 400mg"),
    ("Paracetamol 500mg", "Paracetamol 500mg"),
    ("Fluoxetina 20mg", "Fluoxetina 20mg"),
    ("Sertralina 50mg", "Sertralina 50mg"),
    ("Haloperidol 5mg", "Haloperidol 5mg"),
    ("Diazepam 10mg", "Diazepam 10mg"),
    ("Carbamazepina 200mg", "Carbamazepina 200mg"),
    ("Ácido Valproico 500mg", "Ácido Valproico 500mg"),
    ("Levotiroxina 100mcg", "Levotiroxina 100mcg"),
    ("Prednisona 20mg", "Prednisona 20mg"),
    ("Etinilestradiol + Levonorgestrel", "Etinilestradiol + Levonorgestrel"),
    ("Ácido Fólico 5mg", "Ácido Fólico 5mg"),
    ("Alendronato 70mg", "Alendronato 70mg"),
    # Special cases: different names
    ("Insulina Regular 100 UI/mL", "Insulina Regular 100UI/mL"),
    ("Hierro Sulfato 200mg", "Sulfato Ferroso 40mg Fe"),  # DB still has Spanish name
    ("Sulfato Ferroso 200mg", "Sulfato Ferroso 40mg Fe"),  # In case it was already fixed
    ("Ácido Acetilsalicílico 100mg", "AAS 100mg"),
]

# Spanish → Portuguese text updates for remaining medications
SPANISH_TEXT_FIXES = [
    # name fixes
    ("UPDATE medications SET name = 'Sulfato Ferroso 200mg' WHERE name = 'Hierro Sulfato 200mg'"),

    # common_indications fixes
    ("UPDATE medications SET common_indications = 'Diabetes mellitus tipo 1; diabetes mellitus tipo 2 com falha a antidiabéticos orais' WHERE name = 'Insulina NPH 100 UI/mL' AND common_indications LIKE '%con falla%'"),
    ("UPDATE medications SET common_indications = 'Asma persistente; EPOC com exacerbações frequentes' WHERE name LIKE 'Beclometasona%' AND common_indications LIKE '%con exacerbaciones%'"),
    ("UPDATE medications SET common_indications = 'Epilepsia parcial e generalizada; neuralgia do trigêmeo; transtorno bipolar' WHERE name LIKE 'Carbamazepina%' AND common_indications LIKE '%trigémino%'"),
    ("UPDATE medications SET common_indications = 'Epilepsia; transtorno bipolar; migrânea profilática' WHERE name LIKE 'Ácido Valproico%' AND common_indications LIKE '%migraña%'"),
    ("UPDATE medications SET common_indications = 'Hipotireoidismo; supressão de TSH em câncer de tireoide; mixedema' WHERE name LIKE 'Levotiroxina%' AND common_indications LIKE '%Hipotiroidismo%'"),
    ("UPDATE medications SET common_indications = 'Anticoncepção; regulação do ciclo menstrual; acne; endometriose' WHERE name LIKE 'Etinilestradiol%' AND common_indications LIKE '%Anticoncepción%'"),
    ("UPDATE medications SET common_indications = 'Anemia ferropriva; profilaxia em gestantes; deficiência de ferro' WHERE common_indications LIKE '%profilaxis en embarazadas%'"),
    ("UPDATE medications SET common_indications = 'Prevenção de defeitos do tubo neural; anemia megaloblástica; suplementação na gestação' WHERE name LIKE 'Ácido Fólico%' AND common_indications LIKE '%defectos del tubo%'"),
    ("UPDATE medications SET common_indications = 'Artrite reumatoide; psoríase grave; leucemia linfoblástica aguda; gravidez ectópica' WHERE name LIKE 'Metotrexato%' AND common_indications LIKE '%Artritis%'"),
    ("UPDATE medications SET common_indications = 'Artrite reumatoide; doença de Crohn; colite ulcerosa; psoríase; espondilite anquilosante' WHERE name LIKE 'Adalimumab%' AND common_indications LIKE '%Artritis%'"),
    ("UPDATE medications SET common_indications = 'Artrite reumatoide; artrite psoriásica; espondilite anquilosante; psoríase em placa' WHERE name LIKE 'Etanercept%' AND common_indications LIKE '%Artritis%'"),
    ("UPDATE medications SET common_indications = 'Linfoma no-Hodgkin; artrite reumatoide refratária; granulomatose com poliangeíte; LLC' WHERE name LIKE 'Rituximab%' AND common_indications LIKE '%granulomatosis%'"),
    ("UPDATE medications SET common_indications = 'Esclerose múltipla remitente-recorrente' WHERE name LIKE 'Interferón Beta%' AND common_indications LIKE '%múltiple%'"),
    ("UPDATE medications SET common_indications = 'Esclerose múltipla remitente-recorrente com alta atividade' WHERE name LIKE 'Fingolimod%' AND common_indications LIKE '%múltiple%'"),
    ("UPDATE medications SET common_indications = 'Hepatite C crônica (genótipos 1-6); em combinação com outros antivirais' WHERE name LIKE 'Sofosbuvir%' AND common_indications LIKE '%Hepatitis%'"),
    ("UPDATE medications SET common_indications = 'VIH-1 (em combinação com outros ARV); profilaxia pré-exposição (PrEP)' WHERE name LIKE 'Tenofovir%' AND common_indications LIKE '%profilaxis%'"),
    ("UPDATE medications SET common_indications = 'Hipertensão arterial pulmonar (WHO II-III); prevenção de úlceras digitais na esclerose sistêmica' WHERE name LIKE 'Bosentán%' AND common_indications LIKE '%digitales%'"),
    ("UPDATE medications SET common_indications = 'Fibrose cística com mutação G551D ou outras mutações de gating do CFTR' WHERE name LIKE 'Ivacaftor%' AND common_indications LIKE '%quística%'"),
    ("UPDATE medications SET common_indications = 'Doença de Crohn; colite ulcerosa; artrite reumatoide; psoríase; espondilite anquilosante' WHERE name LIKE 'Infliximab%' AND common_indications LIKE '%psoriasis%'"),
    ("UPDATE medications SET common_indications = 'Psoríase em placa moderada-grave; artrite psoriásica; espondilite anquilosante' WHERE name LIKE 'Secukinumab%' AND common_indications LIKE '%Psoriasis%'"),
    ("UPDATE medications SET common_indications = 'Câncer de mama ER+; prevenção de câncer de mama em alto risco' WHERE name LIKE 'Tamoxifeno%' AND common_indications LIKE '%riesgo%'"),
    ("UPDATE medications SET common_indications = 'Câncer de mama ER+ em pós-menopáusicas; adjuvante e metastático' WHERE name LIKE 'Letrozol%' AND common_indications LIKE '%postmenopáusicas%'"),
    ("UPDATE medications SET common_indications = 'Câncer colorretal; câncer de mama metastático; câncer gástrico' WHERE name LIKE 'Capecitabina%' AND common_indications LIKE '%colorrectal%'"),
    ("UPDATE medications SET common_indications = 'Depressão maior; TOC; bulimia nervosa; transtorno de pânico' WHERE name LIKE 'Fluoxetina%' AND common_indications LIKE '%trastorno%'"),
    ("UPDATE medications SET common_indications = 'Depressão maior; TOC; transtorno de pânico; TEPT; ansiedade social' WHERE name LIKE 'Sertralina%' AND common_indications LIKE '%trastorno%'"),
    ("UPDATE medications SET common_indications = 'Ansiedade; espasmo muscular; convulsões; abstinência alcoólica; sedação pré-operatória' WHERE name LIKE 'Diazepam%' AND common_indications LIKE '%Ansiedad%'"),

    # usual_posology fixes
    ("UPDATE medications SET usual_posology = '70mg VO 1x/semana em jejum com água' WHERE name LIKE 'Alendronato 70mg%' AND usual_posology LIKE '%con agua%'"),
    ("UPDATE medications SET usual_posology = '400mg VO 1x/dia com comida' WHERE name LIKE 'Imatinib%' AND usual_posology LIKE '%con comida%'"),
    ("UPDATE medications SET usual_posology = '62,5mg VO 2x/dia x4 semanas, depois 125mg 2x/dia' WHERE name LIKE 'Bosentán%' AND usual_posology LIKE '%luego%'"),
    ("UPDATE medications SET usual_posology = '150mg VO a cada 12h com refeições gordurosas' WHERE name LIKE 'Ivacaftor%' AND usual_posology LIKE '%grasas%'"),
    ("UPDATE medications SET usual_posology = '5mg/kg IV semanas 0, 2, 6, depois a cada 8 semanas' WHERE name LIKE 'Infliximab%' AND usual_posology LIKE '%luego%'"),
    ("UPDATE medications SET usual_posology = '300mg SC semanas 0,1,2,3,4, depois 300mg a cada 4 semanas' WHERE name LIKE 'Secukinumab%' AND usual_posology LIKE '%luego%'"),
    ("UPDATE medications SET usual_posology = 'Carga: 8mg/kg IV; Manutenção: 6mg/kg IV a cada 3 semanas' WHERE name LIKE 'Trastuzumab%' AND usual_posology LIKE '%Mantenimiento%'"),
    ("UPDATE medications SET usual_posology = '40mg SC a cada 2 semanas' WHERE name LIKE 'Adalimumab%' AND usual_posology LIKE '%cada 2 semanas%' AND usual_posology NOT LIKE '%a cada%'"),
    ("UPDATE medications SET usual_posology = '60U/kg IV a cada 2 semanas' WHERE name LIKE 'Imiglucerasa%' AND usual_posology LIKE '%cada 2 semanas%' AND usual_posology NOT LIKE '%a cada%'"),
    ("UPDATE medications SET usual_posology = '1mg/kg IV a cada 2 semanas' WHERE name LIKE 'Agalsidasa%' AND usual_posology LIKE '%cada 2 semanas%' AND usual_posology NOT LIKE '%a cada%'"),
    ("UPDATE medications SET usual_posology = '2 puffs (200mcg) a cada 4-6h conforme necessidade' WHERE name LIKE 'Salbutamol aerosol%' AND usual_posology LIKE '%cada 4-6h%' AND usual_posology NOT LIKE '%a cada%'"),

    # presentation fixes
    ("UPDATE medications SET presentation = '100mcg/dose, aerosol 200 doses' WHERE name LIKE 'Salbutamol aerosol%' AND presentation LIKE '%dosis%'"),
    ("UPDATE medications SET presentation = '250mcg/dose, aerosol 200 doses' WHERE name LIKE 'Beclometasona%' AND presentation LIKE '%dosis%'"),

    # max_daily_dose fixes
    ("UPDATE medications SET max_daily_dose = '300mg a cada 4 semanas' WHERE name LIKE 'Secukinumab%' AND max_daily_dose LIKE '%cada 4 semanas%' AND max_daily_dose NOT LIKE '%a cada%'"),
    ("UPDATE medications SET max_daily_dose = '60U/kg a cada 2 semanas' WHERE name LIKE 'Imiglucerasa%' AND max_daily_dose LIKE '%cada 2 semanas%' AND max_daily_dose NOT LIKE '%a cada%'"),
    ("UPDATE medications SET max_daily_dose = '1mg/kg a cada 2 semanas' WHERE name LIKE 'Agalsidasa%' AND max_daily_dose LIKE '%cada 2 semanas%' AND max_daily_dose NOT LIKE '%a cada%'"),
]


def upgrade():
    conn = op.get_bind()

    # Step 1: Fix Spanish text in remaining medications
    for sql in SPANISH_TEXT_FIXES:
        conn.execute(sa.text(sql))

    # Step 2: For each UY duplicate, transfer brands/programs to BR equivalent, then delete
    for uy_name, br_name in DUPLICATE_PAIRS:
        # Find IDs
        uy_row = conn.execute(
            sa.text("SELECT id FROM medications WHERE name = :name AND country = 'uy'"),
            {"name": uy_name}
        ).fetchone()

        br_row = conn.execute(
            sa.text("SELECT id FROM medications WHERE name = :name AND country = 'br'"),
            {"name": br_name}
        ).fetchone()

        if not uy_row or not br_row:
            continue

        uy_id = uy_row[0]
        br_id = br_row[0]

        # Transfer medication_brands (UY brands → BR medication)
        existing_brands = conn.execute(
            sa.text("SELECT country_code FROM medication_brands WHERE medication_id = :br_id"),
            {"br_id": br_id}
        ).fetchall()
        existing_countries = {r[0] for r in existing_brands}

        uy_brands = conn.execute(
            sa.text("SELECT country_code, brand_names FROM medication_brands WHERE medication_id = :uy_id"),
            {"uy_id": uy_id}
        ).fetchall()

        for country_code, brand_names in uy_brands:
            if country_code not in existing_countries:
                conn.execute(
                    sa.text(
                        "INSERT INTO medication_brands (medication_id, country_code, brand_names) "
                        "VALUES (:br_id, :cc, :brands)"
                    ),
                    {"br_id": br_id, "cc": country_code, "brands": brand_names}
                )

        # Transfer government program links
        existing_programs = conn.execute(
            sa.text("SELECT program_id FROM medication_government_programs WHERE medication_id = :br_id"),
            {"br_id": br_id}
        ).fetchall()
        existing_program_ids = {r[0] for r in existing_programs}

        uy_programs = conn.execute(
            sa.text(
                "SELECT program_id, copay, max_quantity_per_month, notes "
                "FROM medication_government_programs WHERE medication_id = :uy_id"
            ),
            {"uy_id": uy_id}
        ).fetchall()

        for prog_id, copay, max_qty, notes in uy_programs:
            if prog_id not in existing_program_ids:
                conn.execute(
                    sa.text(
                        "INSERT INTO medication_government_programs "
                        "(medication_id, program_id, copay, max_quantity_per_month, notes, is_active) "
                        "VALUES (:br_id, :pid, :copay, :qty, :notes, true)"
                    ),
                    {"br_id": br_id, "pid": prog_id, "copay": copay or 0, "qty": max_qty, "notes": notes}
                )

        # Ensure BR medication is linked to UY in medication_countries
        uy_link = conn.execute(
            sa.text(
                "SELECT 1 FROM medication_countries "
                "WHERE medication_id = :br_id AND country_code = 'uy'"
            ),
            {"br_id": br_id}
        ).fetchone()

        if not uy_link:
            conn.execute(
                sa.text(
                    "INSERT INTO medication_countries (medication_id, country_code) "
                    "VALUES (:br_id, 'uy')"
                ),
                {"br_id": br_id}
            )

        # Delete the UY duplicate (CASCADE handles junction tables)
        conn.execute(
            sa.text("DELETE FROM medications WHERE id = :uy_id"),
            {"uy_id": uy_id}
        )


def downgrade():
    # Not reversible — UY medications would need to be re-seeded
    pass
