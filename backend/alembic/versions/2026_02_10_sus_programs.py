"""Add SUS programs (CBAF + CEAF) and tag medications

Creates two new government programs:
- CBAF (Componente Básico): ~231 medications available free at UBS
- CEAF (Componente Especializado): ~90 high-cost medications requiring LME authorization

Revision ID: 2026_02_10_sus_programs
Revises: 2026_02_09_fix_fp
Create Date: 2026-02-10 02:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '2026_02_10_sus_programs'
down_revision = '2026_02_09_fix_fp'

# Connection-bound metadata for queries
meta = sa.MetaData()

# --- Programs to insert ---
PROGRAMS = [
    {
        'code': 'cbaf',
        'name': 'SUS/UBS',
        'country': 'br',
        'description': 'Componente Básico da Assistência Farmacêutica (CBAF) - medicamentos essenciais da RENAME dispensados gratuitamente em Unidades Básicas de Saúde (UBS/postos de saúde).',
        'legal_reference': 'Portaria GM/MS 3.916/1998; RENAME 2024',
        'website_url': 'https://www.gov.br/saude/pt-br/composicao/sctie/daf/rename',
        'all_items_free': True,
    },
    {
        'code': 'ceaf',
        'name': 'SUS Especializado',
        'country': 'br',
        'description': 'Componente Especializado da Assistência Farmacêutica (CEAF) - medicamentos de alto custo dispensados em farmácias especializadas do SUS, mediante autorização via Laudo para Medicamento Especializado (LME).',
        'legal_reference': 'Portaria GM/MS 1.554/2013; RENAME 2024',
        'website_url': 'https://www.gov.br/saude/pt-br/composicao/sctie/daf/ceaf',
        'all_items_free': True,
    },
]

# --- Medication names to tag ---

CBAF_MED_NAMES = [
    'AAS 100mg',
    'Aciclovir 200mg',
    'Albendazol 400mg',
    'Albendazol 40mg/mL suspensão oral',
    'Alendronato 10mg',
    'Alendronato 70mg',
    'Alopurinol 100mg',
    'Alopurinol 300mg',
    'Amiodarona 200mg',
    'Amitriptilina 25mg',
    'Amitriptilina 75mg',
    'Amoxicilina + Clavulanato 250/62,5mg/5mL suspensão oral',
    'Amoxicilina + Clavulanato 500/125mg',
    'Amoxicilina + Clavulanato 875/125mg',
    'Amoxicilina 250mg/5mL suspensão oral',
    'Amoxicilina 500mg',
    'Amoxicilina 875mg',
    'Anlodipino 10mg',
    'Anlodipino 5mg',
    'Atenolol 100mg',
    'Atenolol 25mg',
    'Atenolol 50mg',
    'Azitromicina 200mg/5mL suspensão oral',
    'Azitromicina 500mg',
    'Beclometasona + Formoterol 100/6mcg',
    'Beclometasona 200mcg Cápsula Inalação',
    'Beclometasona 250mcg Spray',
    'Beclometasona 50mcg Nasal',
    'Beclometasona 50mcg Spray',
    'Beclometasona aerosol 250mcg',
    'Benserazida + Levodopa 25mg+100mg',
    'Benzoilmetronidazol 40mg/mL suspensão',
    'Betametasona + gentamicina creme',
    'Betametasona creme 0.5mg/g',
    'Biperideno 2mg',
    'Brometo de Ipratrópio 0,25mg/mL',
    'Brometo de Ipratrópio Spray 0,02mg',
    'Budesonida Inalatória 200mcg',
    'Budesonida Inalatória 400mcg',
    'Budesonida Nasal 32mcg',
    'Budesonida Nasal 50mcg',
    'Budesonida nasal 32mcg/dose',
    'Captopril 25mg',
    'Captopril 50mg',
    'Carbamazepina 200mg',
    'Carbamazepina 20mg/mL suspensão oral',
    'Carbamazepina 400mg',
    'Carbonato de Cálcio + Colecalciferol 500mg/400UI',
    'Carbonato de Lítio 300mg',
    'Carbonato de Lítio 450mg',
    'Carvedilol 12,5mg',
    'Carvedilol 25mg',
    'Carvedilol 3,125mg',
    'Carvedilol 6,25mg',
    'Cefalexina 250mg/5mL suspensão oral',
    'Cefalexina 500mg',
    'Ceftriaxona 1g injetável',
    'Cetoconazol 200mg',
    'Cetoconazol creme 2%',
    'Cetoconazol shampoo 2%',
    'Ciprofloxacina 500mg',
    'Claritromicina 500mg',
    'Clindamicina 300mg',
    'Clindamicina creme vaginal 2%',
    'Clindamicina gel tópico 1%',
    'Clomipramina 10mg',
    'Clomipramina 25mg',
    'Clonazepam 0,5mg',
    'Clonazepam 2,5mg/mL Gotas',
    'Clonazepam 2mg',
    'Cloranfenicol colírio 0.5%',
    'Clorpromazina 100mg',
    'Clorpromazina 25mg',
    'Cálcio 600mg + Vitamina D3 400UI',
    'Dexametasona 0,5mg',
    'Dexametasona 0,5mg/5mL elixir',
    'Dexametasona 2mg',
    'Dexametasona 4mg',
    'Dexametasona 8mg injetável',
    'Dexametasona colírio 0.1%',
    'Dexametasona creme 1mg/g',
    'Dexametasona elixir 0.5mg/5mL',
    'Diazepam 10mg',
    'Diazepam 5mg',
    'Digoxina 0,25mg',
    'Dipirona 1g',
    'Dipirona 500mg',
    'Dipirona 50mg/mL solução oral pediátrica',
    'Dipirona Gotas 500mg/mL',
    'Divalproato de Sódio 500mg',
    'Enalapril 10mg',
    'Enalapril 20mg',
    'Enalapril 5mg',
    'Eritromicina 250mg/5mL suspensão oral',
    'Eritromicina 500mg',
    'Eritromicina gel tópico 2%',
    'Eritromicina pomada oftálmica 0.5%',
    'Espironolactona 100mg',
    'Espironolactona 25mg',
    'Espironolactona 50mg',
    'Etinilestradiol + Levonorgestrel',
    'Fenitoína 100mg',
    'Fenobarbital 100mg',
    'Fenobarbital 40mg/mL Gotas',
    'Finasterida 1mg',
    'Finasterida 5mg',
    'Fluconazol 150mg',
    'Fluconazol 150mg dose única',
    'Fluoxetina 20mg',
    'Formoterol + Budesonida 6/200mcg',
    'Furosemida 10mg/ml injetável',
    'Furosemida 40mg',
    'Glibenclamida 5mg',
    'Haloperidol 1mg',
    'Haloperidol 5mg',
    'Hidralazina 25mg',
    'Hidroclorotiazida 25mg',
    'Hidrocortisona 20mg',
    'Hidróxido de alumínio 60mg/ml',
    'Ibuprofeno 100mg/mL gotas',
    'Ibuprofeno 200mg',
    'Ibuprofeno 400mg',
    'Ibuprofeno 50mg/mL suspensão oral',
    'Ibuprofeno 600mg',
    'Itraconazol 100mg',
    'Ivermectina 6mg',
    'Ivermectina creme 1%',
    'Lactulose 667mg/mL',
    'Levodopa + Benserazida 100/25mg',
    'Levodopa + Benserazida 200/50mg',
    'Levodopa + Carbidopa 100/25mg',
    'Levodopa + Carbidopa 250/25mg',
    'Levonorgestrel 1,5mg',
    'Levonorgestrel DIU 52mg',
    'Levotiroxina 100mcg',
    'Levotiroxina 112mcg',
    'Levotiroxina 125mcg',
    'Levotiroxina 137mcg',
    'Levotiroxina 150mcg',
    'Levotiroxina 175mcg',
    'Levotiroxina 200mcg',
    'Levotiroxina 25mcg',
    'Levotiroxina 50mcg',
    'Levotiroxina 75mcg',
    'Levotiroxina 88mcg',
    'Loratadina 10mg',
    'Loratadina 1mg/mL xarope',
    'Losartana 100mg',
    'Losartana 25mg',
    'Losartana 50mg',
    'Medroxiprogesterona 150mg/mL',
    'Metformina 1000mg',
    'Metformina 500mg',
    'Metformina 500mg LP',
    'Metformina 850mg',
    'Metformina XR 500mg',
    'Metformina XR 750mg',
    'Metildopa 250mg',
    'Metildopa 250mg Injetável',
    'Metildopa 500mg',
    'Metoclopramida 10mg',
    'Metronidazol + nistatina creme vaginal',
    'Metronidazol 250mg',
    'Metronidazol 400mg',
    'Metronidazol 40mg/mL suspensão oral',
    'Metronidazol gel vaginal 0.75%',
    'Miconazol creme tópico 2%',
    'Miconazol creme vaginal 2%',
    'Mononitrato de Isossorbida 20mg',
    'Nifedipino 20mg',
    'Nifedipino 60mg',
    'Nistatina 100.000UI/mL',
    'Nistatina 100.000UI/mL creme dermatológico',
    'Nistatina 100.000UI/mL gotas oral',
    'Nistatina creme vaginal 25000UI/g',
    'Nistatina pomada tópica 100000UI/g',
    'Nistatina suspensão oral 100000UI/ml',
    'Nitrato de Isossorbida 5mg',
    'Nitrofurantoína 100mg',
    'Nitrofurantoína 25mg/5mL suspensão oral',
    'Noretisterona 0,35mg',
    'Nortriptilina 10mg',
    'Nortriptilina 25mg',
    'Nortriptilina 50mg',
    'Nortriptilina 75mg',
    'Omeprazol 20mg',
    'Omeprazol 40mg',
    'Paracetamol 100mg/mL gotas pediátricas',
    'Paracetamol 500mg',
    'Paracetamol 750mg',
    'Paracetamol Gotas 200mg/mL',
    "Pasta d'água com nistatina",
    'Penicilina Benzatina 1.200.000UI',
    'Prednisolona 1mg/mL solução oral',
    'Prednisolona 20mg',
    'Prednisolona 3mg/mL',
    'Prednisolona colírio 1%',
    'Prednisona 20mg',
    'Prednisona 5mg',
    'Propiltiouracil 100mg',
    'Propranolol 10mg',
    'Propranolol 40mg',
    'Propranolol 80mg',
    'Rifampicina 300mg',
    'Salbutamol 0,4mg/mL xarope',
    'Salbutamol 5mg/mL Solução Nebulização',
    'Salbutamol Spray 100mcg',
    'Salbutamol Xarope 2mg/5mL',
    'Salbutamol aerosol 100mcg',
    'Sinvastatina 10mg',
    'Sinvastatina 20mg',
    'Sinvastatina 40mg',
    'Sulfametoxazol + Trimetoprima 200/40mg/5mL suspensão oral',
    'Sulfametoxazol + Trimetoprima 800/160mg',
    'Sulfato Ferroso 200mg',
    'Sulfato Ferroso 40mg Fe',
    'Timolol Colírio 0,25%',
    'Timolol Colírio 0,5%',
    'Tobramicina + dexametasona colírio',
    'Valerato de Estradiol + Noretisterona 5mg+50mg',
    'Varfarina 1mg',
    'Varfarina 3mg',
    'Varfarina 5mg',
    'Verapamil 120mg',
    'Verapamil 80mg',
    'Ácido Fólico 5mg',
    'Ácido Valproico 250mg',
    'Ácido Valproico 500mg',
    'Ácido Valproico 50mg/mL xarope',
]

CEAF_MED_NAMES = [
    'Adalimumab 40mg',
    'Alfacalcidol 0,25mcg',
    'Alfacalcidol 1mcg',
    'Aripiprazol 10mg',
    'Aripiprazol 15mg',
    'Atazanavir 300mg',
    'Azatioprina 100mg',
    'Azatioprina 50mg',
    'Benralizumabe 30mg',
    'Calcitriol 0.25mcg',
    'Ciclosporina 100mg',
    'Ciclosporina 25mg',
    'Ciclosporina 50mg',
    'Cinacalcete 60mg',
    'Cinacalcete 90mg',
    'Clozapina 100mg',
    'Clozapina 25mg',
    'Dapagliflozina 10mg',
    'Darbepoetina alfa 100mcg',
    'Darbepoetina alfa 40mcg',
    'Darunavir 600mg',
    'Desmopressina 4mcg/mL injetável',
    'Dolutegravir 50mg',
    'Donepezila 10mg',
    'Eculizumabe 300mg',
    'Efavirenz 600mg',
    'Eltrombopague 25mg',
    'Eltrombopague 50mg',
    'Eritropoietina 10000UI',
    'Eritropoietina 2000UI',
    'Etanercept 50mg',
    'Fator VII recombinante ativado 1mg',
    'Fator VIII recombinante 1000UI',
    'Fator VIII recombinante 500UI',
    'Filgrastim 100mcg',
    'Fingolimod 0,5mg',
    'Hidroxicloroquina 200mg',
    'Hidroxicloroquina 400mg',
    'Imiglucerasa 400U',
    'Infliximab 100mg',
    'Ivacaftor 150mg',
    'Lamivudina 150mg',
    'Lamotrigina 100mg',
    'Lamotrigina 25mg',
    'Lamotrigina 50mg',
    'Leflunomida 10mg',
    'Leflunomida 20mg',
    'Memantina 10mg',
    'Mepolizumabe 100mg',
    'Metotrexato 10mg/mL injetável',
    'Metotrexato 15mg/mL injetável',
    'Metotrexato 2,5mg',
    'Metotrexato 7,5mg',
    'Micofenolato mofetila 500mg',
    'Micofenolato sódico 360mg',
    'Miglustat 100mg',
    'Nintedanibe 100mg',
    'Nintedanibe 150mg',
    'Olanzapina 10mg',
    'Olanzapina 5mg',
    'Omalizumabe 150mg',
    'Pirfenidona 267mg',
    'Quetiapina 100mg',
    'Quetiapina 200mg',
    'Quetiapina 25mg',
    'Quetiapina 300mg',
    'Raltegravir 400mg',
    'Risperidona 1mg',
    'Risperidona 2mg',
    'Risperidona 3mg',
    'Rituximab 500mg',
    'Rivastigmina 3mg',
    'Romiplostim 250mcg',
    'Romiplostim 500mcg',
    'Secukinumab 150mg',
    'Sevelâmer 400mg',
    'Sevelâmer 800mg',
    'Sildenafil 20mg',
    'Sofosbuvir 400mg',
    'Sulfassalazina 500mg',
    'Tacrolimus 0,5mg',
    'Tacrolimus 1mg',
    'Tacrolimus 5mg',
    'Tacrolimus pomada 0.03%',
    'Tacrolimus pomada 0.1%',
    'Tenofovir + Emtricitabina',
    'Tiotrópio 18mcg cápsula inalação',
    'Tocilizumabe 162mg SC',
    'Vedolizumabe 300mg',
    'Ziprasidona 40mg',
]


def upgrade():
    conn = op.get_bind()

    # 1. Insert government programs (idempotent)
    for prog in PROGRAMS:
        existing = conn.execute(
            sa.text("SELECT id FROM government_programs WHERE code = :code"),
            {'code': prog['code']}
        ).fetchone()

        if existing:
            continue

        conn.execute(
            sa.text("""
                INSERT INTO government_programs (code, name, country, description, legal_reference, website_url, is_active, all_items_free)
                VALUES (:code, :name, :country, :description, :legal_reference, :website_url, true, :all_items_free)
            """),
            prog
        )

    # 2. Get program IDs
    cbaf_row = conn.execute(
        sa.text("SELECT id FROM government_programs WHERE code = 'cbaf'")
    ).fetchone()
    ceaf_row = conn.execute(
        sa.text("SELECT id FROM government_programs WHERE code = 'ceaf'")
    ).fetchone()

    if not cbaf_row or not ceaf_row:
        return

    cbaf_id = cbaf_row[0]
    ceaf_id = ceaf_row[0]

    # 3. Tag CBAF medications
    cbaf_linked = 0
    for med_name in CBAF_MED_NAMES:
        med_row = conn.execute(
            sa.text("SELECT id FROM medications WHERE name = :name AND is_active = true"),
            {'name': med_name}
        ).fetchone()
        if not med_row:
            continue

        # Check if link already exists
        existing = conn.execute(
            sa.text("""
                SELECT 1 FROM medication_government_programs
                WHERE medication_id = :med_id AND program_id = :prog_id
            """),
            {'med_id': med_row[0], 'prog_id': cbaf_id}
        ).fetchone()

        if not existing:
            conn.execute(
                sa.text("""
                    INSERT INTO medication_government_programs (medication_id, program_id, copay, is_active)
                    VALUES (:med_id, :prog_id, 0, true)
                """),
                {'med_id': med_row[0], 'prog_id': cbaf_id}
            )
            cbaf_linked += 1

    # 4. Tag CEAF medications
    ceaf_linked = 0
    for med_name in CEAF_MED_NAMES:
        med_row = conn.execute(
            sa.text("SELECT id FROM medications WHERE name = :name AND is_active = true"),
            {'name': med_name}
        ).fetchone()
        if not med_row:
            continue

        existing = conn.execute(
            sa.text("""
                SELECT 1 FROM medication_government_programs
                WHERE medication_id = :med_id AND program_id = :prog_id
            """),
            {'med_id': med_row[0], 'prog_id': ceaf_id}
        ).fetchone()

        if not existing:
            conn.execute(
                sa.text("""
                    INSERT INTO medication_government_programs (medication_id, program_id, copay, is_active)
                    VALUES (:med_id, :prog_id, 0, true)
                """),
                {'med_id': med_row[0], 'prog_id': ceaf_id}
            )
            ceaf_linked += 1

    print(f"SUS Programs: CBAF linked {cbaf_linked} meds, CEAF linked {ceaf_linked} meds")


def downgrade():
    conn = op.get_bind()

    # Remove links first, then programs
    for code in ['cbaf', 'ceaf']:
        prog_row = conn.execute(
            sa.text("SELECT id FROM government_programs WHERE code = :code"),
            {'code': code}
        ).fetchone()
        if prog_row:
            conn.execute(
                sa.text("DELETE FROM medication_government_programs WHERE program_id = :prog_id"),
                {'prog_id': prog_row[0]}
            )
            conn.execute(
                sa.text("DELETE FROM government_programs WHERE id = :id"),
                {'id': prog_row[0]}
            )
