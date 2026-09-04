#!/usr/bin/env python3
"""
Generate expanded medications.json and drug_interactions.json seed data.
Run: python -m backend.seeds.generate_seed_data
Output: backend/seeds/data/medications.json, backend/seeds/data/drug_interactions.json
"""
import json
import os

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")


# Combined clinical reference data for all medications
CLINICAL_DATA = {
    'aciclovir': {
        'brands': 'Zovirax, Aciclovir (genérico)',
        'posology': 'Herpes simples: 200-400 mg VO 5x/dia ou 5-10 mg/kg IV 8/8h. Varicela/Zoster: 800 mg VO 5x/dia. Profilaxia: 400 mg 12/12h',
        'max_dose': '4g/dia VO; 30 mg/kg/dia IV',
        'indications': 'Herpes simples (genital, labial); herpes zoster; varicela; encefalite herpética; profilaxia em imunossuprimidos',
        'preg': 'B',
        "renal": True,
    },
    'albendazol': {
        'brands': 'Zentel, Albendazol (genérico)',
        'posology': '400 mg VO dose única (oxiuríase, ascaridíase). Estrongiloidíase: 400 mg/dia por 3 dias. Hidatidose: 400 mg 12/12h por 28 dias',
        'max_dose': '800 mg/dia',
        'indications': 'Oxiuríase; ascaridíase; ancilostomíase; estrongiloidíase; teníase; giardíase; hidatidose; neurocisticercose',
        'preg': 'C',
        "hepatic": True,
    },
    'alendronato': {
        'brands': 'Fosamax, Ostenan, Alendil, Alendronato (genérico)',
        'posology': '70 mg VO 1x/semana em jejum, com copo cheio de água. Manter-se em pé ou sentado por 30 min após ingestão. Não deitar.',
        'max_dose': '70 mg/semana (ou 10 mg/dia)',
        'indications': 'Osteoporose pós-menopausa; Osteoporose masculina; Osteoporose induzida por corticoides; Doença de Paget',
        'preg': 'C',
        "renal": True,
    },
    'alopurinol': {
        'brands': 'Zyloric, Alopurinol (genérico)',
        'posology': 'Iniciar 100 mg/dia VO, aumentar 100 mg/semana até 300 mg/dia. Meta: ácido úrico <6 mg/dL. Máximo 800 mg/dia',
        'max_dose': '800 mg/dia (fracionado se >300 mg)',
        'indications': 'Hiperuricemia; gota crônica; profilaxia de cálculos renais de ácido úrico; síndrome de lise tumoral; quimioterapia',
        'preg': 'C',
        "renal": True,
    },
    'alprazolam': {
        'brands': 'Frontal, Apraz, Alprazolam (genérico)',
        'posology': 'TAG: iniciar 0,25-0,5mg 3x/dia, aumentar a cada 3-4 dias até 0,5-4mg/dia dividido. Pânico: iniciar 0,5mg 3x/dia, aumentar até 1-10mg/dia (usual 5-6mg/dia). Tomar com ou sem alimentos. Uso crônico deve ser evitado.',
        'max_dose': '10mg/dia (pânico); 4mg/dia (TAG)',
        'indications': 'Transtorno de ansiedade generalizada; Transtorno de pânico; Ansiedade associada à depressão',
        'preg': 'D',
        "hepatic": True,
    },
    'amiodarona': {
        'brands': 'Ancoron, Atlansil',
        'posology': '200mg VO 3x/dia por 1 semana, depois 200mg 2x/dia por 1 semana, manutenção 200mg/dia',
        'max_dose': '400mg/dia manutenção',
        'indications': 'Fibrilação atrial; flutter atrial; taquicardia ventricular; prevenção de morte súbita; arritmias refratárias',
        'preg': 'D',
        "hepatic": True,
    },
    'amitriptilina': {
        'brands': 'Tryptanol, Amytril, Neurotrypt',
        'posology': 'Depressão: iniciar 25mg à noite, aumentar gradualmente até 75-150mg/dia (dose única noturna ou dividida). Dor neuropática: 10-25mg à noite, aumentar semanalmente até 75-150mg/dia. Profilaxia de enxaqueca: 10-25mg à noite.',
        'max_dose': '300mg/dia (depressão grave hospitalar); 150mg/dia (ambulatorial)',
        'indications': 'Transtorno depressivo maior; Dor neuropática; Profilaxia de enxaqueca; Enurese noturna (crianças >6 anos)',
        'preg': 'C',
        "hepatic": True,
    },
    'amoxicilina': {
        'brands': 'Amoxil, Novocilin, Amoxicilina (genérico)',
        'posology': '500-875 mg VO 8/8h ou 12/12h conforme gravidade. Infecções graves: até 1g 8/8h',
        'max_dose': '3g/dia (dose fracionada)',
        'indications': 'Infecções do trato respiratório; otite média aguda; sinusite; faringite estreptocócica; infecções urinárias; profilaxia de endocardite',
        'preg': 'B',
        "renal": True,
    },
    'amoxicilina + clavulanato': {
        'brands': 'Clavulin, Amoxiclavulanato (genérico)',
        'posology': '500/125 mg VO 8/8h ou 875/125 mg 12/12h. Infecções graves: 1000/200 mg IV 8/8h',
        'max_dose': '4g amoxicilina + 600mg clavulanato/dia',
        'indications': 'Infecções respiratórias resistentes; sinusite bacteriana; otite média recorrente; pneumonia comunitária; pielonefrite; infecções de pele e tecidos moles; mordeduras',
        'preg': 'B',
        "renal": True,
        "hepatic": True,
    },
    'anlodipino': {
        'brands': 'Norvasc, Pressat, Tensaliv',
        'posology': '5-10mg VO 1x/dia',
        'max_dose': '10mg/dia',
        'indications': 'Hipertensão arterial; angina estável crônica; angina vasoespástica',
        'preg': 'C',
        "hepatic": True,
    },
    'apixabana': {
        'brands': 'Eliquis',
        'posology': '5mg VO 2x/dia (ou 2,5mg 2x/dia em situações específicas)',
        'max_dose': '10mg/dia',
        'indications': 'Fibrilação atrial não-valvar; trombose venosa profunda; embolia pulmonar; prevenção de trombose pós-cirurgia ortopédica',
        'preg': 'B',
        "renal": True,
        "hepatic": True,
    },
    'aripiprazol': {
        'brands': 'Abilify, Aristab',
        'posology': 'Esquizofrenia: iniciar 10-15mg/dia em dose única, manutenção 15mg/dia (10-30mg/dia). Mania bipolar: iniciar 15mg/dia, ajustar até 15-30mg/dia. Depressão maior (adjuvante): 2-5mg/dia, máximo 15mg/dia. Tomar com ou sem alimentos, mesma hora diariamente.',
        'max_dose': '30mg/dia',
        'indications': 'Esquizofrenia; Mania bipolar; Manutenção bipolar; Depressão maior (adjuvante); Irritabilidade no autismo; Síndrome de Tourette',
        'preg': 'C',
    },
    'atenolol': {
        'brands': 'Atenol, Angipress',
        'posology': '25-100mg VO 1x/dia',
        'max_dose': '100mg/dia',
        'indications': 'Hipertensão arterial; angina pectoris; pós-infarto agudo do miocárdio; taquiarritmias',
        'preg': 'D',
        "renal": True,
    },
    'atorvastatina': {
        'brands': 'Lipitor, Citalor',
        'posology': '10-80mg VO 1x/dia',
        'max_dose': '80mg/dia',
        'indications': 'Hipercolesterolemia; dislipidemia mista; prevenção cardiovascular primária e secundária; síndrome coronariana aguda',
        'preg': 'X',
        "hepatic": True,
    },
    'azitromicina': {
        'brands': 'Zitromax, Astro, Azitromicina (genérico)',
        'posology': '500 mg VO dose única no D1, seguido de 250 mg/dia D2-D5. Ou 500 mg/dia por 3 dias. IST: dose única 1g',
        'max_dose': '500 mg/dia (manutenção)',
        'indications': 'Pneumonia comunitária; sinusite; faringite; bronquite aguda; infecções de pele; IST (clamídia, cancro mole); diarreia do viajante',
        'preg': 'B',
        "hepatic": True,
    },
    'beclometasona': {
        'brands': 'Clenil, Beclosol, Beclometasona (genérico)',
        'posology': 'Inalatório: 200-800 mcg/dia divididos em 2 tomadas. Iniciar com dose baixa e ajustar conforme controle. Enxaguar boca após uso.',
        'max_dose': '2000 mcg/dia (adultos)',
        'indications': 'Asma persistente leve a grave (manutenção); Rinite alérgica (spray nasal); Profilaxia de sintomas respiratórios',
        'preg': 'C',
    },
    'benserazida + levodopa': {
        'brands': 'Prolopa',
        'posology': 'Parkinson inicial: iniciar 50/200mg (benserazida/levodopa) 3x/dia, aumentar gradualmente conforme resposta. Dose usual: 50/200mg 3-4x/dia. HBS (liberação controlada): 1-2 cápsulas 2x/dia. Tomar 30min antes ou 1h após refeições. Evitar proteínas na mesma refeição.',
        'max_dose': '200/800mg/dia (benserazida/levodopa)',
        'indications': 'Doença de Parkinson; Parkinsonismo',
        'preg': 'C',
    },
    'bezafibrato': {
        'brands': 'Cedur',
        'posology': '200mg VO 2-3x/dia ou 400mg VO 1x/dia (liberação retardada)',
        'max_dose': '600mg/dia',
        'indications': 'Hipertrigliceridemia; dislipidemia mista; hiperlipidemia tipo III',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'biperideno': {
        'brands': 'Akineton',
        'posology': 'Parkinsonismo: 2mg 3-4x/dia, ajustar conforme resposta até 2mg 6x/dia. Distonia aguda: 2-5mg IM/IV, repetir se necessário. Sintomas extrapiramidais por antipsicóticos: 2-4mg 1-3x/dia. Tomar durante ou após refeições para reduzir desconforto gástrico.',
        'max_dose': '16mg/dia VO',
        'indications': 'Parkinsonismo; Sintomas extrapiramidais induzidos por antipsicóticos; Distonia aguda',
        'preg': 'C',
    },
    'bisoprolol': {
        'brands': 'Concor',
        'posology': '2,5-10mg VO 1x/dia',
        'max_dose': '20mg/dia',
        'indications': 'Hipertensão arterial; angina pectoris; insuficiência cardíaca estável',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'brimonidina': {
        'brands': 'Alphagan, Brimonidina (genérico)',
        'posology': '1 gota 0,2% no olho afetado 8/8h ou 12/12h',
        'max_dose': '1 gota 8/8h por olho',
        'indications': 'Glaucoma de ângulo aberto; hipertensão ocular; profilaxia de glaucoma agudo',
        'preg': 'B',
        "route": 'oftálmico',
    },
    'bromazepam': {
        'brands': 'Lexotan, Somalium, Bromazepam (genérico)',
        'posology': 'Ansiedade: 3mg 3x/dia, podendo aumentar até 6mg 3x/dia conforme necessidade. Idosos: iniciar 1,5mg 2x/dia. Tomar com ou sem alimentos. Evitar uso prolongado (>4 semanas).',
        'max_dose': '18mg/dia',
        'indications': 'Transtornos de ansiedade; Ansiedade associada a condições médicas',
        'preg': 'D',
        "hepatic": True,
    },
    'brometo de ipratrópio': {
        'brands': 'Atrovent',
        'posology': 'Inalatório: 40 mcg (2 jatos) 3-4x/dia. Nebulização: 250-500 mcg (20-40 gotas) diluídos em SF 0,9%, 3-4x/dia.',
        'max_dose': '160 mcg/dia (spray) ou 2000 mcg/dia (nebulização)',
        'indications': 'DPOC; Broncoespasmo agudo (combinado com beta-2 agonistas); Asma refratária a broncodilatadores',
        'preg': 'B',
    },
    'budesonida': {
        'brands': 'Busonid, Pulmicort, Noex, Symbicort (combinado)',
        'posology': 'Inalatório: 200-800 mcg/dia divididos em 2 tomadas. Nebulização (suspensão): 0,5-1 mg 1-2x/dia. Enxaguar boca após uso.',
        'max_dose': '1600 mcg/dia (inalatório adultos)',
        'indications': 'Asma persistente (manutenção); DPOC grave com exacerbações; Rinite alérgica (spray nasal); Laringite aguda em crianças (nebulização)',
        'preg': 'B',
    },
    'bupropiona': {
        'brands': 'Wellbutrin XL, Bup, Zetron, Zyban',
        'posology': 'Depressão: iniciar 150mg/dia pela manhã (XL), após 3 dias aumentar para 300mg/dia. Cessação tabágica: 150mg/dia por 3 dias, depois 150mg 2x/dia por 7-12 semanas. Tomar pela manhã com ou sem alimentos, não tomar à noite (insônia).',
        'max_dose': '450mg/dia (dividido, máximo 150mg por dose)',
        'indications': 'Transtorno depressivo maior; Cessação tabágica; Transtorno afetivo sazonal (off-label); TDAH adulto (off-label)',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'buspirone': {
        'brands': 'Buspar, Ansitec',
        'posology': 'Ansiedade: iniciar 7,5mg 2x/dia, aumentar 5mg/dia a cada 2-3 dias conforme resposta. Dose usual 15-30mg/dia dividido em 2-3 tomadas. Tomar sempre com alimentos ou sempre sem alimentos (consistência). Efeito ansiolítico demora 2-4 semanas.',
        'max_dose': '60mg/dia',
        'indications': 'Transtorno de ansiedade generalizada',
        'preg': 'B',
        "renal": True,
        "hepatic": True,
    },
    'candesartana': {
        'brands': 'Atacand, Blopress',
        'posology': '8-16mg VO 1x/dia, podendo aumentar para 32mg/dia',
        'max_dose': '32mg/dia',
        'indications': 'Hipertensão arterial; insuficiência cardíaca',
        'preg': 'D',
        "renal": True,
        "hepatic": True,
    },
    'captopril': {
        'brands': 'Capoten, Captril',
        'posology': '25-50mg VO 2-3x/dia, 30-60 min antes das refeições',
        'max_dose': '450mg/dia',
        'indications': 'Hipertensão arterial; insuficiência cardíaca; pós-infarto agudo do miocárdio; nefropatia diabética; crise hipertensiva (sublingual)',
        'preg': 'D',
        "renal": True,
    },
    'carbamazepina': {
        'brands': 'Tegretol, Tegretard, Carmazin',
        'posology': 'Epilepsia adulto: iniciar 200mg 2x/dia, aumentar 200mg/semana até 800-1200mg/dia dividido. Neuralgia do trigêmeo: iniciar 100mg 2x/dia, aumentar 100mg a cada 12h até controle da dor (usual 400-800mg/dia). Mania: 400-1600mg/dia. Tomar com alimentos. Monitorar hemograma e função hepática.',
        'max_dose': '2000mg/dia (adultos); 1600mg/dia (mania)',
        'indications': 'Epilepsia (crises parciais e tônico-clônicas); Neuralgia do trigêmeo; Mania aguda; Transtorno bipolar manutenção',
        'preg': 'D',
        "renal": True,
        "hepatic": True,
    },
    'carbonato de cálcio + colecalciferol': {
        'brands': 'Calcium D3, Os-Cal D, Caltrate D',
        'posology': '1 comprimido VO 1-2x/dia com refeições. Usual: 500-600 mg cálcio elementar + 400-800 UI vit D por comprimido.',
        'max_dose': '2000 mg cálcio elementar/dia + 4000 UI vitamina D/dia',
        'indications': 'Prevenção e tratamento de osteoporose; Deficiência de cálcio e vitamina D; Adjuvante em hipoparatireoidismo',
        'preg': 'A',
        "renal": True,
    },
    'carbonato de lítio': {
        'brands': 'Carbolitium, Litiocar',
        'posology': 'Mania aguda: 900-1800mg/dia dividido em 2-3 doses, ajustar para litemia 0,8-1,2 mEq/L. Manutenção: 600-1200mg/dia, litemia 0,6-1,0 mEq/L. Tomar com alimentos ou leite. REQUER monitoramento de litemia semanal até estabilização, depois mensal. Manter hidratação adequada.',
        'max_dose': 'Ajustado por litemia (alvo <1,2 mEq/L em agudo; <1,0 mEq/L em manutenção)',
        'indications': 'Transtorno bipolar (mania e manutenção); Prevenção de suicídio em transtorno bipolar; Depressão unipolar resistente (adjuvante)',
        'preg': 'D',
        "renal": True,
    },
    'carvedilol': {
        'brands': 'Coreg, Divelol',
        'posology': '3,125-6,25mg VO 2x/dia inicialmente, aumentar gradualmente até 25-50mg 2x/dia',
        'max_dose': '100mg/dia',
        'indications': 'Insuficiência cardíaca; hipertensão arterial; pós-infarto agudo do miocárdio com disfunção ventricular',
        'preg': 'C',
        "hepatic": True,
    },
    'cefalexina': {
        'brands': 'Keflex, Cefalexina (genérico)',
        'posology': '500 mg VO 6/6h ou 1g 12/12h. Infecções leves: 250 mg 6/6h',
        'max_dose': '4g/dia',
        'indications': 'Infecções de pele e tecidos moles; faringite estreptocócica; ITU não complicada; otite média; profilaxia cirúrgica',
        'preg': 'B',
        "renal": True,
    },
    'cefalotina': {
        'brands': 'Keflin, Cefalotina (genérico)',
        'posology': '1-2g IV 6/6h. Profilaxia cirúrgica: 1-2g dose única pré-operatória',
        'max_dose': '12g/dia',
        'indications': 'Infecções graves por gram-positivos; profilaxia cirúrgica; infecções de pele e tecidos moles; pneumonia hospitalar; sepse',
        'preg': 'B',
        "renal": True,
        "route": 'intravenoso',
    },
    'cefuroxima': {
        'brands': 'Zinnat, Cefuroxima (genérico)',
        'posology': '250-500 mg VO 12/12h ou 750 mg-1,5g IV 8/8h conforme gravidade',
        'max_dose': '1500 mg/dia VO; 9g/dia IV',
        'indications': 'Pneumonia comunitária; exacerbação de DPOC; sinusite; otite média; ITU; infecções de pele; Lyme; profilaxia cirúrgica',
        'preg': 'B',
        "renal": True,
    },
    'celecoxibe': {
        'brands': 'Celebra, Celecoxibe (genérico)',
        'posology': '200 mg VO 1x/dia ou 100 mg 12/12h. Gota aguda: 400 mg dose inicial, depois 200 mg 12/12h',
        'max_dose': '400 mg/dia',
        'indications': 'Osteoartrite; artrite reumatoide; espondilite anquilosante; gota aguda; dismenorreia; dor musculoesquelética',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'cetirizina': {
        'brands': 'Zyrtec, Reactine, Cetirizina (genérico)',
        'posology': '10 mg VO 1x/dia ou 5 mg 12/12h',
        'max_dose': '10 mg/dia',
        'indications': 'Rinite alérgica; urticária; prurido; conjuntivite alérgica; dermatite atópica',
        'preg': 'B',
        "renal": True,
    },
    'cetoconazol': {
        'brands': 'Nizoral, Cetoconazol (genérico)',
        'posology': '200-400 mg VO 1x/dia. Dermatofitose: 200 mg/dia por 2-4 semanas. Candidíase: 200-400 mg/dia por 7-14 dias. Xampu: 2x/semana',
        'max_dose': '400 mg/dia',
        'indications': 'Candidíase; dermatofitoses; pitiríase versicolor; seborreia; síndrome de Cushing (uso off-label)',
        'preg': 'C',
        "hepatic": True,
    },
    'cetoprofeno': {
        'brands': 'Profenid, Cetoprofeno (genérico)',
        'posology': '50-100 mg VO 8/8h ou 12/12h. Liberação prolongada: 200 mg/dia. IM: 100 mg 12/12h',
        'max_dose': '300 mg/dia',
        'indications': 'Dor musculoesquelética; artrite; dismenorreia; lombalgias; trauma; pós-operatório',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'ciclobenzaprina': {
        'brands': 'Miosan, Cizax, Ciclobenzaprina (genérico)',
        'posology': '5-10 mg VO 8/8h. Uso por curto prazo (2-3 semanas). Iniciar com 5 mg à noite',
        'max_dose': '30 mg/dia',
        'indications': 'Espasmo muscular; lombalgia; cervicalgia; fibromialgia; dor musculoesquelética aguda',
        'preg': 'B',
        "hepatic": True,
    },
    'ciprofloxacino': {
        'brands': 'Cipro, Ciprobid, Ciprofloxacino (genérico)',
        'posology': '500-750 mg VO 12/12h ou 400 mg IV 12/12h. ITU simples: 250 mg 12/12h por 3 dias',
        'max_dose': '1500 mg/dia VO; 800 mg/dia IV',
        'indications': 'Infecções urinárias complicadas; pielonefrite; prostatite; diarreia bacteriana; infecções abdominais; osteomielite; antraz; febre tifóide',
        'preg': 'C',
        "renal": True,
    },
    'citalopram': {
        'brands': 'Cipramil, Procimax, Denyl',
        'posology': 'Depressão: iniciar 20mg/dia em dose única, podendo aumentar para 40mg/dia após 1 semana. Pânico: iniciar 10mg/dia na primeira semana, depois 20-40mg/dia. Tomar manhã ou noite, independente de alimentos.',
        'max_dose': '40mg/dia (máximo 20mg/dia em >60 anos ou hepatopatas)',
        'indications': 'Transtorno depressivo maior; Transtorno de pânico',
        'preg': 'C',
        "hepatic": True,
    },
    'claritromicina': {
        'brands': 'Klaricid, Claritromicina (genérico)',
        'posology': '500 mg VO 12/12h ou 1g (XL) 1x/dia. H. pylori: 500 mg 12/12h por 7-14 dias. MAC: 500 mg 12/12h',
        'max_dose': '1g/dia (dose fracionada) ou 1g/dia XL',
        'indications': 'Pneumonia comunitária; bronquite; sinusite; faringite; infecções de pele; erradicação H. pylori; micobacteriose atípica (MAC); profilaxia em HIV',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'clindamicina': {
        'brands': 'Dalacin C, Clindamicina (genérico)',
        'posology': '300-450 mg VO 6/6h ou 600-900 mg IV 8/8h. Vaginose: creme vaginal à noite por 7 dias',
        'max_dose': '1800 mg/dia VO; 4800 mg/dia IV',
        'indications': 'Infecções anaeróbicas; pneumonia por aspiração; infecções de pele (MRSA); vaginose bacteriana; acne; toxoplasmose cerebral; abscessos dentários',
        'preg': 'B',
        "hepatic": True,
    },
    'clomipramina': {
        'brands': 'Anafranil',
        'posology': 'TOC: iniciar 25mg/dia, aumentar gradualmente até 100-250mg/dia em 2 semanas. Depressão: 75-150mg/dia. Tomar durante/após refeições, dose única noturna ou dividida. Manutenção: dose única à noite.',
        'max_dose': '250mg/dia (ambulatorial); 300mg/dia (hospitalar)',
        'indications': 'Transtorno obsessivo-compulsivo; Transtorno depressivo maior; Transtorno de pânico; Fobias',
        'preg': 'C',
        "hepatic": True,
    },
    'clonazepam': {
        'brands': 'Rivotril',
        'posology': 'Epilepsia: iniciar 0,5mg 3x/dia, aumentar 0,5-1mg a cada 3 dias até controle (usual 4-8mg/dia). Pânico: iniciar 0,25mg 2x/dia, aumentar para 1mg/dia após 3 dias, até 2-4mg/dia. Tomar com ou sem alimentos.',
        'max_dose': '20mg/dia (epilepsia); 4mg/dia (pânico)',
        'indications': 'Epilepsia (crises de ausência, mioclônicas); Transtorno de pânico; Espasmos infantis; Síndrome das pernas inquietas (off-label)',
        'preg': 'D',
        "hepatic": True,
    },
    'clopidogrel': {
        'brands': 'Plavix, Clopidogrel',
        'posology': '75mg VO 1x/dia (ou 300-600mg dose de ataque)',
        'max_dose': '75mg/dia manutenção',
        'indications': 'Síndrome coronariana aguda; pós-stent coronariano; pós-AVE isquêmico; doença arterial periférica; prevenção de eventos aterotrombóticos',
        'preg': 'B',
        "hepatic": True,
    },
    'clorpromazina': {
        'brands': 'Amplictil, Longactil',
        'posology': 'Esquizofrenia: iniciar 25mg 3x/dia, aumentar 25-50mg/dia a cada 3-4 dias até 400-800mg/dia dividido. Náuseas/vômitos: 10-25mg a cada 4-6h. Soluços intratáveis: 25-50mg 3-4x/dia. Tomar com alimentos para reduzir irritação gástrica.',
        'max_dose': '1000mg/dia (hospitalar); 400mg/dia (ambulatorial)',
        'indications': 'Esquizofrenia; Psicoses; Mania; Náuseas e vômitos; Soluços intratáveis; Agitação psicomotora',
        'preg': 'C',
        "hepatic": True,
    },
    'clortalidona': {
        'brands': 'Higroton',
        'posology': '12,5-25mg VO 1x/dia pela manhã',
        'max_dose': '50mg/dia',
        'indications': 'Hipertensão arterial; edema; insuficiência cardíaca',
        'preg': 'B',
        "renal": True,
    },
    'clozapina': {
        'brands': 'Leponex',
        'posology': 'Esquizofrenia refratária: iniciar 12,5mg 1-2x/dia, aumentar 25-50mg/dia até 300-450mg/dia em 2 semanas, depois ajustar 50-100mg/semana até resposta (usual 300-600mg/dia). Tomar dividido 2-3x/dia com alimentos. REQUER monitoramento semanal de hemograma nas primeiras 18 semanas, depois quinzenal até 1 ano, depois mensal.',
        'max_dose': '900mg/dia',
        'indications': 'Esquizofrenia refratária a outros antipsicóticos; Redução de comportamento suicida em esquizofrenia/transtorno esquizoafetivo',
        'preg': 'B',
        "hepatic": True,
    },
    'codeína': {
        'brands': 'Codein, Codeína (genérico)',
        'posology': '30-60 mg VO 4/4h ou 6/6h conforme necessário. Antitussígeno: 10-20 mg 4-6/6h',
        'max_dose': '360 mg/dia (analgesia); 120 mg/dia (tosse)',
        'indications': 'Dor leve a moderada; tosse seca persistente; diarreia (uso adjuvante)',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'codeína + paracetamol': {
        'brands': 'Tylex, Codex',
        'posology': '30/500 mg VO 6/6h conforme necessário',
        'max_dose': '240 mg codeína + 4g paracetamol/dia',
        'indications': 'Dor moderada; cefaleia intensa; dor pós-operatória; dor oncológica; dor refratária a analgésicos simples',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'colchicina': {
        'brands': 'Colchis, Colchicina (genérico)',
        'posology': 'Gota aguda: 1,2 mg inicial, depois 0,6 mg após 1h (máximo 1,8 mg/dia). Profilaxia: 0,6 mg 1-2x/dia',
        'max_dose': '1,8 mg/dia (agudo); 1,2 mg/dia (profilaxia)',
        'indications': 'Gota aguda; profilaxia de gota; febre familiar do Mediterrâneo; pericardite; pseudogota',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'dabigatrana': {
        'brands': 'Pradaxa',
        'posology': '150mg VO 2x/dia (ou 110mg 2x/dia em pacientes selecionados)',
        'max_dose': '300mg/dia',
        'indications': 'Fibrilação atrial não-valvar; trombose venosa profunda; embolia pulmonar; prevenção de trombose pós-cirurgia ortopédica',
        'preg': 'C',
        "renal": True,
    },
    'dapagliflozina': {
        'brands': 'Forxiga',
        'posology': '10 mg VO 1x/dia pela manhã, independente de refeições.',
        'max_dose': '10 mg/dia',
        'indications': 'Diabetes mellitus tipo 2; Insuficiência cardíaca com fração de ejeção reduzida; Doença renal crônica',
        'preg': 'C',
        "renal": True,
    },
    'desloratadina': {
        'brands': 'Desalex, Desloratadina (genérico)',
        'posology': '5 mg VO 1x/dia',
        'max_dose': '5 mg/dia',
        'indications': 'Rinite alérgica; urticária crônica idiopática; prurido; alergia sazonal',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'desvenlafaxina': {
        'brands': 'Pristiq, Desven',
        'posology': 'Depressão: 50mg/dia em dose única, mesma hora diariamente. Dose pode ir até 100mg/dia, mas sem evidência de benefício adicional. Tomar com ou sem alimentos, não esmagar ou mastigar.',
        'max_dose': '100mg/dia',
        'indications': 'Transtorno depressivo maior',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'dexametasona': {
        'brands': 'Decadron, Dexametasona (genérico)',
        'posology': '0,5-9 mg VO ou IV/IM 1x/dia. Edema cerebral: 10 mg IV dose inicial, depois 4 mg 6/6h. Náusea QT: 8-20 mg',
        'max_dose': '24 mg/dia (edema cerebral)',
        'indications': 'Edema cerebral; náuseas por quimioterapia; COVID grave; meningite (adjuvante); alergia grave; teste supressão cortisol',
        'preg': 'C',
    },
    'dexclorfeniramina': {
        'brands': 'Polaramine, Dexclorfeniramina (genérico)',
        'posology': '2 mg VO 8/8h ou 6 mg (liberação prolongada) 12/12h',
        'max_dose': '12 mg/dia',
        'indications': 'Rinite alérgica; urticária; prurido; conjuntivite alérgica; reações alérgicas leves',
        'preg': 'B',
        "renal": True,
    },
    'diazepam': {
        'brands': 'Valium, Dienpax, Compaz',
        'posology': 'Ansiedade: 2-10mg 2-4x/dia. Espasticidade: 2-15mg/dia dividido. Convulsões agudas: 5-10mg IV/IM, repetir a cada 10-15min se necessário. Sedação pré-procedimento: 5-10mg VO 1h antes. Uso crônico deve ser evitado.',
        'max_dose': '40mg/dia VO; 30mg em dose única IV (status epilepticus)',
        'indications': 'Transtornos de ansiedade; Espasticidade muscular; Convulsões (adjuvante); Sedação pré-procedimento; Abstinência alcoólica',
        'preg': 'D',
        "hepatic": True,
    },
    'diclofenaco': {
        'brands': 'Voltaren, Cataflan, Diclofenaco (genérico)',
        'posology': '50 mg VO 8/8h ou 75 mg IM dose única. Liberação prolongada: 100 mg/dia. Supositório: 50-100 mg',
        'max_dose': '150 mg/dia',
        'indications': 'Dor musculoesquelética; artrite; espondilite; tendinite; bursite; cólica renal; dismenorreia; pós-operatório',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'digoxina': {
        'brands': 'Digoxina, Lanoxin',
        'posology': '0,125-0,25mg VO 1x/dia (dose de manutenção)',
        'max_dose': '0,5mg/dia',
        'indications': 'Insuficiência cardíaca com disfunção sistólica; fibrilação atrial; flutter atrial',
        'preg': 'C',
        "renal": True,
    },
    'dipirona': {
        'brands': 'Novalgina, Anador, Dipirona (genérico)',
        'posology': '500-1000 mg VO, IV ou IM 6/6h ou 8/8h. Gotas: 20-40 gotas (500 mg/mL)',
        'max_dose': '4g/dia',
        'indications': 'Dor aguda; febre; cefaleia; cólicas; dor pós-operatória; dor oncológica',
        'preg': 'C',
        "renal": True,
    },
    'divalproato de sódio': {
        'brands': 'Depakote ER, Torval CR',
        'posology': 'Mania: iniciar 750mg/dia dividido, aumentar rapidamente até 1000-2000mg/dia. Profilaxia enxaqueca: 500-1000mg/dia em dose única. Epilepsia: 10-15mg/kg/dia, aumentar até controle. Tomar com alimentos, não esmagar comprimidos ER. Monitorar enzimas hepáticas.',
        'max_dose': '60mg/kg/dia',
        'indications': 'Mania bipolar; Epilepsia (crises complexas parciais, ausência); Profilaxia de enxaqueca',
        'preg': 'D',
        "hepatic": True,
    },
    'domperidona': {
        'brands': 'Motilium, Domperidona (genérico)',
        'posology': '10 mg VO 3-4x/dia antes das refeições. Náusea: 10 mg 8/8h',
        'max_dose': '30 mg/dia',
        'indications': 'Dispepsia funcional; gastroparesia; náuseas e vômitos; DRGE (sintomas motores); aumento de lactação',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'dorzolamida': {
        'brands': 'Trusopt, Dorzolamida (genérico)',
        'posology': '1 gota 2% no olho afetado 8/8h',
        'max_dose': '1 gota 8/8h por olho',
        'indications': 'Glaucoma de ângulo aberto; hipertensão ocular; glaucoma pseudoexfoliativo',
        'preg': 'C',
        "renal": True,
        "route": 'oftálmico',
    },
    'doxazosina': {
        'brands': 'Carduran, Doxazosina (genérico)',
        'posology': 'Iniciar 1 mg VO à noite, titular até 4-8 mg/dia. HAS: 1-16 mg/dia. HPB: 4-8 mg/dia',
        'max_dose': '16 mg/dia (HAS); 8 mg/dia (HPB)',
        'indications': 'Hiperplasia prostática benigna; hipertensão arterial; cálculo ureteral (expulsão)',
        'preg': 'C',
        "hepatic": True,
    },
    'doxiciclina': {
        'brands': 'Vibramicina, Doxiciclina (genérico)',
        'posology': '100 mg VO 12/12h no D1, depois 100 mg/dia. IST/acne: 100 mg 12/12h. Malária: 100 mg/dia profilaxia',
        'max_dose': '200 mg/dia',
        'indications': 'IST (clamídia, sífilis, linfogranuloma); acne; rosácea; pneumonia atípica; doença de Lyme; rickettsiose; malária; leptospirose; antraz',
        'preg': 'D',
    },
    'duloxetina': {
        'brands': 'Cymbalta, Velija, Dual',
        'posology': 'Depressão/TAG: 60mg/dia em dose única. Dor neuropática diabética: 60mg/dia. Fibromialgia: iniciar 30mg/dia por 1 semana, depois 60mg/dia. Tomar com ou sem alimentos, evitar abertura da cápsula.',
        'max_dose': '120mg/dia (dividido em 2 doses)',
        'indications': 'Transtorno depressivo maior; Transtorno de ansiedade generalizada; Dor neuropática diabética; Fibromialgia; Dor crônica musculoesquelética',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'empagliflozina': {
        'brands': 'Jardiance',
        'posology': '10 mg VO 1x/dia pela manhã, independente de refeições. Pode aumentar para 25 mg se tolerado.',
        'max_dose': '25 mg/dia',
        'indications': 'Diabetes mellitus tipo 2; Insuficiência cardíaca com fração de ejeção reduzida; Doença renal crônica diabética',
        'preg': 'C',
        "renal": True,
    },
    'enalapril': {
        'brands': 'Renitec, Vasopril, Eupressin',
        'posology': '5-20mg VO 1-2x/dia',
        'max_dose': '40mg/dia',
        'indications': 'Hipertensão arterial; insuficiência cardíaca; disfunção ventricular esquerda assintomática; nefropatia diabética',
        'preg': 'D',
        "renal": True,
    },
    'enoxaparina': {
        'brands': 'Clexane',
        'posology': '1mg/kg SC 2x/dia ou 1,5mg/kg SC 1x/dia (terapêutica); 40mg SC 1x/dia (profilática)',
        'max_dose': 'Dose ajustada conforme peso e indicação',
        'indications': 'Trombose venosa profunda; embolia pulmonar; síndrome coronariana aguda; profilaxia de tromboembolismo; hemodiálise',
        'preg': 'B',
        "renal": True,
        "route": 'subcutâneo',
    },
    'entacapona': {
        'brands': 'Comtan',
        'posology': 'Parkinson: 200mg com cada dose de levodopa/carbidopa ou levodopa/benserazida. Máximo 8 doses/dia (sempre junto com levodopa, nunca isolado). Quando iniciar entacapona, pode ser necessário reduzir dose de levodopa em 10-30%. Tomar com ou sem alimentos.',
        'max_dose': '1600mg/dia (200mg x 8 doses)',
        'indications': 'Doença de Parkinson como adjuvante à levodopa (flutuações de fim de dose)',
        'preg': 'C',
        "hepatic": True,
    },
    'escitalopram': {
        'brands': 'Lexapro, Exodus, Reconter',
        'posology': 'Depressão/TAG: 10mg/dia em dose única, podendo aumentar para 20mg/dia após 1 semana. Pânico/Fobia social: iniciar 5mg/dia na primeira semana, depois 10mg/dia, podendo ir até 20mg/dia. Tomar manhã ou noite, com ou sem alimentos.',
        'max_dose': '20mg/dia',
        'indications': 'Transtorno depressivo maior; Transtorno de ansiedade generalizada; Transtorno de pânico; Fobia social',
        'preg': 'C',
        "hepatic": True,
    },
    'esomeprazol': {
        'brands': 'Nexium, Esomeprazol (genérico)',
        'posology': '20-40 mg VO 1x/dia. DRGE: 40 mg/dia. Úlcera: 40 mg/dia. H. pylori: 40 mg/dia + ATB',
        'max_dose': '80 mg/dia',
        'indications': 'DRGE; úlcera péptica; esofagite erosiva; erradicação H. pylori; gastropatia por AINE; Zollinger-Ellison; Barrett',
        'preg': 'B',
        "hepatic": True,
    },
    'espironolactona': {
        'brands': 'Aldactone',
        'posology': '25-100mg VO 1-2x/dia',
        'max_dose': '400mg/dia',
        'indications': 'Insuficiência cardíaca; hipertensão arterial; edema; hiperaldosteronismo; ascite cirrótica; síndrome nefrótica',
        'preg': 'C',
        "renal": True,
    },
    'etinilestradiol + levonorgestrel': {
        'brands': 'Ciclo 21, Nordette, Level, Microvlar',
        'posology': '1 comprimido VO 1x/dia por 21 dias, pausa de 7 dias (sangramento). Iniciar no 1º dia da menstruação ou domingo após início.',
        'max_dose': '1 comprimido/dia (não exceder dose)',
        'indications': 'Contracepção hormonal oral; Regulação do ciclo menstrual; Tratamento de dismenorreia e hirsutismo leve',
        'preg': 'X',
        "hepatic": True,
    },
    'ezetimiba': {
        'brands': 'Zetia',
        'posology': '10mg VO 1x/dia',
        'max_dose': '10mg/dia',
        'indications': 'Hipercolesterolemia; sitosterolemia; em associação com estatina ou isolada',
        'preg': 'C',
        "hepatic": True,
    },
    'fenitoína': {
        'brands': 'Hidantal',
        'posology': 'Epilepsia: iniciar 300mg/dia em dose única ou dividida, ajustar conforme níveis séricos (alvo 10-20 mcg/mL). Dose de ataque: 15-20mg/kg IV lento. Tomar com alimentos para reduzir irritação gástrica. Monitorar níveis séricos, função hepática.',
        'max_dose': '600mg/dia VO',
        'indications': 'Epilepsia (crises tônico-clônicas e parciais); Status epilepticus (IV); Profilaxia de convulsões pós-neurocirurgia',
        'preg': 'D',
        "hepatic": True,
    },
    'fenobarbital': {
        'brands': 'Gardenal',
        'posology': 'Epilepsia adulto: 60-180mg/dia em dose única ao deitar ou dividido 2-3x/dia. Criança: 3-6mg/kg/dia. Sedação: 30-120mg/dia dividido 2-3x/dia. Status epilepticus: 10-20mg/kg IV. Tomar com ou sem alimentos.',
        'max_dose': '200mg/dia (epilepsia); dose ajustada por nível sérico',
        'indications': 'Epilepsia (crises tônico-clônicas e parciais); Sedação; Status epilepticus (IV); Abstinência de sedativos',
        'preg': 'D',
        "renal": True,
        "hepatic": True,
    },
    'fenofibrato': {
        'brands': 'Lipanon, Lipidil',
        'posology': '145-160mg VO 1x/dia (micronizado) ou 200mg VO 1x/dia',
        'max_dose': '200mg/dia',
        'indications': 'Hipertrigliceridemia; dislipidemia mista; hiperlipidemia tipo III',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'fexofenadina': {
        'brands': 'Allegra, Fexofenadina (genérico)',
        'posology': '120-180 mg VO 1x/dia. Rinite: 120 mg/dia. Urticária: 180 mg/dia',
        'max_dose': '180 mg/dia',
        'indications': 'Rinite alérgica sazonal e perene; urticária crônica idiopática; alergia',
        'preg': 'C',
        "renal": True,
    },
    'finasterida': {
        'brands': 'Proscar (5mg), Propecia (1mg), Finasterida (genérico)',
        'posology': 'HPB: 5 mg VO 1x/dia. Alopecia androgenética: 1 mg VO 1x/dia',
        'max_dose': '5 mg/dia',
        'indications': 'Hiperplasia prostática benigna; alopecia androgenética masculina; hematúria por HPB',
        'preg': 'X',
        "hepatic": True,
    },
    'fluconazol': {
        'brands': 'Zoltec, Fluconazol (genérico)',
        'posology': 'Candidíase vaginal: 150 mg VO dose única. Candidíase oral: 100-200 mg/dia por 7-14 dias. Criptococose: 400 mg/dia',
        'max_dose': '800 mg/dia (infecções graves)',
        'indications': 'Candidíase vaginal; candidíase oral/esofágica; candidúria; onicomicose; criptococose; profilaxia fúngica em imunossuprimidos',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'fluoxetina': {
        'brands': 'Prozac, Daforin, Deprax, Fluxene, Eufor',
        'posology': 'Depressão/TOC: 20mg/dia pela manhã, podendo aumentar para 40-80mg/dia após várias semanas. Bulimia: 60mg/dia. Tomar pela manhã com ou sem alimentos.',
        'max_dose': '80mg/dia (depressão/TOC); 60mg/dia (bulimia)',
        'indications': 'Transtorno depressivo maior; Transtorno obsessivo-compulsivo; Bulimia nervosa; Transtorno de pânico; Transtorno disfórico pré-menstrual',
        'preg': 'C',
        "hepatic": True,
    },
    'fluticasona': {
        'brands': 'Flixotide',
        'posology': 'Inalatório: 100-500 mcg 2x/dia. Iniciar com dose apropriada à gravidade. Enxaguar boca após uso para prevenir candidíase.',
        'max_dose': '1000 mcg/dia (adultos)',
        'indications': 'Asma persistente leve a grave (manutenção); Profilaxia de sintomas asmáticos',
        'preg': 'C',
    },
    'formoterol': {
        'brands': 'Fluir, Oxis, Foradil',
        'posology': '6-12 mcg (cápsula inalatória) 2x/dia (manhã e noite). Sempre associado a corticoide inalatório. Não usar como resgate.',
        'max_dose': '24 mcg/dia (12 mcg 2x/dia)',
        'indications': 'Asma persistente (sempre com corticoide inalatório); DPOC; Profilaxia de broncoespasmo',
        'preg': 'C',
    },
    'formoterol + budesonida': {
        'brands': 'Alenia, Symbicort',
        'posology': '1-2 inalações 2x/dia (manhã e noite). Doses: 6/100, 6/200 ou 12/400 mcg (formoterol/budesonida). Ajustar conforme gravidade.',
        'max_dose': '4 inalações/dia da dose 12/400 mcg',
        'indications': 'Asma persistente moderada a grave; DPOC com sintomas frequentes; Manutenção e alívio (terapia MART)',
        'preg': 'C',
    },
    'furosemida': {
        'brands': 'Lasix, Furosemix',
        'posology': '20-80mg VO 1-2x/dia ou 20-40mg IV/IM',
        'max_dose': '600mg/dia VO, 200mg/dose IV',
        'indications': 'Edema; insuficiência cardíaca congestiva; insuficiência renal aguda; hipertensão arterial; hipercalcemia',
        'preg': 'C',
        "hepatic": True,
    },
    'gabapentina': {
        'brands': 'Neurontin, Progresse, Gabapentina (genérico)',
        'posology': 'Epilepsia: dia 1: 300mg à noite, dia 2: 300mg 2x/dia, dia 3: 300mg 3x/dia, depois ajustar até 900-1800mg/dia. Dor neuropática: dia 1: 300mg, dia 2: 600mg/dia, dia 3: 900mg/dia, até 1800-3600mg/dia dividido. Não esmagar cápsulas. Intervalo máximo entre doses: 12h.',
        'max_dose': '3600mg/dia (dividido em 3 doses)',
        'indications': 'Epilepsia (crises parciais, adjuvante); Dor neuropática pós-herpética; Neuropatia diabética (off-label); Síndrome das pernas inquietas (off-label)',
        'preg': 'C',
        "renal": True,
    },
    'glibenclamida': {
        'brands': 'Daonil, Euglucon, Glibenclamida (genérico)',
        'posology': '2,5-5 mg VO 1x/dia pela manhã, antes do café. Ajustar a cada 5-7 dias. Dose usual: 5-10 mg/dia.',
        'max_dose': '20 mg/dia (dividir se >10 mg)',
        'indications': 'Diabetes mellitus tipo 2 em pacientes não obesos; Controle glicêmico adjuvante à dieta e exercício',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'glicazida': {
        'brands': 'Diamicron MR, Glicazida (genérico)',
        'posology': '30-60 mg VO 1x/dia pela manhã, junto ao café. Formulação MR (modificada): iniciar 30 mg, aumentar a cada 2-4 semanas.',
        'max_dose': '120 mg/dia (formulação MR)',
        'indications': 'Diabetes mellitus tipo 2; Controle glicêmico adjuvante à dieta e exercício',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'haloperidol': {
        'brands': 'Haldol',
        'posology': 'Esquizofrenia/psicose: iniciar 0,5-5mg 2-3x/dia, aumentar 0,5-5mg/dia a cada 3-7 dias até 5-20mg/dia. Agitação aguda: 2-10mg IM, repetir a cada 30-60min se necessário. Idosos: iniciar 0,5-2mg/dia. Tomar com ou sem alimentos.',
        'max_dose': '100mg/dia VO (dose excepcional); 20mg/dia IM',
        'indications': 'Esquizofrenia; Psicoses agudas; Agitação psicomotora; Síndrome de Tourette; Náuseas/vômitos (off-label); Delirium (off-label)',
        'preg': 'C',
        "hepatic": True,
    },
    'hidroclorotiazida': {
        'brands': 'Clorana, Drenol',
        'posology': '12,5-25mg VO 1x/dia pela manhã',
        'max_dose': '50mg/dia',
        'indications': 'Hipertensão arterial; edema; insuficiência cardíaca; diabetes insipidus',
        'preg': 'B',
        "renal": True,
    },
    'hidrocortisona': {
        'brands': 'Cortef, Solu-Cortef, Hidrocortisona (genérico)',
        'posology': '20-30 mg VO dividido 2-3x/dia. IV: 100-500 mg 6/6h (choque). Insuficiência adrenal: 15-25 mg/dia dividido',
        'max_dose': '2000 mg/dia (choque séptico)',
        'indications': 'Insuficiência adrenal; choque séptico; anafilaxia; dermatite (tópico); colite ulcerativa (enema); asma grave',
        'preg': 'C',
    },
    'hidroxizina': {
        'brands': 'Hixizine, Prurizin, Hidroxizina (genérico)',
        'posology': '25-100 mg VO 6/6h ou 8/8h. Ansiedade: 50-100 mg 4x/dia. Prurido: 25 mg 3-4x/dia',
        'max_dose': '600 mg/dia (ansiedade); 400 mg/dia (prurido)',
        'indications': 'Prurido; urticária; ansiedade; sedação pré-operatória; náuseas',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'ibuprofeno': {
        'brands': 'Advil, Alivium, Ibuprofeno (genérico)',
        'posology': '200-400 mg VO 6/6h ou 8/8h. Dor/febre: 400 mg 4-6/6h. Antiinflamatório: 400-800 mg 8/8h',
        'max_dose': '3200 mg/dia (uso hospitalar); 1200 mg/dia (OTC)',
        'indications': 'Dor leve a moderada; febre; dismenorreia; cefaleia; dor musculoesquelética; artrite; enxaqueca',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'indapamida': {
        'brands': 'Natrilix SR',
        'posology': '1,5mg VO 1x/dia pela manhã',
        'max_dose': '1,5mg/dia',
        'indications': 'Hipertensão arterial',
        'preg': 'B',
        "renal": True,
        "hepatic": True,
    },
    'insulina glargina': {
        'brands': 'Lantus, Basaglar, Toujeo',
        'posology': '0,2-0,4 UI/kg/dia SC 1x/dia, sempre no mesmo horário (preferencialmente ao deitar). Ajustar conforme glicemia de jejum.',
        'max_dose': 'Individualizado conforme necessidade',
        'indications': 'Diabetes mellitus tipo 1 (insulinização basal); Diabetes mellitus tipo 2 não controlado; Terapia basal-bolus',
        'preg': 'C',
        "renal": True,
        "route": 'subcutâneo',
    },
    'insulina nph': {
        'brands': 'Humulin N, Novolin N, Insulina NPH (genérico)',
        'posology': '0,3-0,5 UI/kg/dia SC em 1-2 aplicações. Usual: 2/3 pela manhã (30 min antes café) e 1/3 ao deitar. Ajustar conforme glicemias.',
        'max_dose': 'Individualizado conforme necessidade (até >1 UI/kg/dia em resistência insulínica)',
        'indications': 'Diabetes mellitus tipo 1; Diabetes mellitus tipo 2 não controlado com hipoglicemiantes orais; Diabetes gestacional refratário à dieta',
        'preg': 'B',
        "renal": True,
        "route": 'subcutâneo',
    },
    'insulina regular': {
        'brands': 'Humulin R, Novolin R, Insulina Regular (genérico)',
        'posology': '0,1-0,2 UI/kg SC 30 min antes das refeições. Esquema basal-bolus: 50% basal (NPH/glargina) + 50% prandial dividido em 3 doses.',
        'max_dose': 'Individualizado conforme necessidade',
        'indications': 'Diabetes mellitus tipo 1; Controle glicêmico prandial em DM2; Cetoacidose diabética (IV); Hiperglicemia hospitalar',
        'preg': 'B',
        "renal": True,
        "route": 'subcutâneo',
    },
    'isotretinoína': {
        'brands': 'Roacutan, Isotretinoína (genérico)',
        'posology': '0,5-1 mg/kg/dia VO dividido 1-2x/dia por 4-6 meses. Dose cumulativa: 120-150 mg/kg',
        'max_dose': '2 mg/kg/dia (casos graves)',
        'indications': 'Acne nódulo-cística grave; acne conglobata; acne refratária; rosácea grave; prevenção de câncer de pele (xeroderma pigmentoso)',
        'preg': 'X',
        "hepatic": True,
    },
    'ivermectina': {
        'brands': 'Revectina, Ivermectina (genérico)',
        'posology': '200 mcg/kg VO dose única. Escabiose: repetir após 7-14 dias. Estrongiloidíase: dose única, repetir após 2 semanas se necessário',
        'max_dose': '200 mcg/kg/dose',
        'indications': 'Escabiose; pediculose; estrongiloidíase; oncocercose; filariose; larva migrans',
        'preg': 'C',
    },
    'lactulose': {
        'brands': 'Lactulona, Farlac, Lactulose (genérico)',
        'posology': '15-30 mL VO 1-2x/dia. Encefalopatia: 30-45 mL 3-4x/dia até 2-3 evacuações/dia',
        'max_dose': '60 mL/dia (constipação); 180 mL/dia (encefalopatia)',
        'indications': 'Constipação crônica; encefalopatia hepática; preparo intestinal pré-cirúrgico',
        'preg': 'B',
    },
    'lamotrigina': {
        'brands': 'Lamictal, Neural, Lamitor',
        'posology': 'Bipolar (sem valproato): semanas 1-2: 25mg/dia, semanas 3-4: 50mg/dia, semana 5: 100mg/dia, semana 6: 200mg/dia (alvo). Com valproato: METADE das doses. Com carbamazepina: DOBRO das doses. Titulação lenta é ESSENCIAL para prevenir síndrome de Stevens-Johnson. Tomar com ou sem alimentos.',
        'max_dose': '400mg/dia (monoterapia bipolar); 500mg/dia (epilepsia)',
        'indications': 'Transtorno bipolar (prevenção de episódios depressivos); Epilepsia (crises parciais e generalizadas)',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'lansoprazol': {
        'brands': 'Prazol, Lansoprazol (genérico)',
        'posology': '30 mg VO 1x/dia em jejum. DRGE: 30 mg/dia. Úlcera: 30 mg/dia. H. pylori: 30 mg 12/12h + ATB',
        'max_dose': '60 mg/dia',
        'indications': 'DRGE; úlcera péptica; esofagite erosiva; erradicação H. pylori; gastropatia por AINE; Zollinger-Ellison',
        'preg': 'B',
        "hepatic": True,
    },
    'latanoprosta': {
        'brands': 'Xalatan, Latanoprosta (genérico)',
        'posology': '1 gota 0,005% no olho afetado 1x/dia à noite',
        'max_dose': '1 gota/dia por olho',
        'indications': 'Glaucoma de ângulo aberto; hipertensão ocular',
        'preg': 'C',
        "route": 'oftálmico',
    },
    'levetiracetam': {
        'brands': 'Keppra',
        'posology': 'Epilepsia adulto: iniciar 500mg 2x/dia, aumentar 500mg 2x/dia a cada 2 semanas até 1500mg 2x/dia. Idosos: iniciar 250mg 2x/dia. Tomar com ou sem alimentos. Não é necessário monitoramento de níveis séricos ou laboratorial rotineiro.',
        'max_dose': '3000mg/dia (1500mg 2x/dia)',
        'indications': 'Epilepsia (crises parciais, mioclônicas, tônico-clônicas generalizadas)',
        'preg': 'C',
        "renal": True,
    },
    'levodopa + benserazida': {
        'brands': 'Prolopa',
        'posology': 'Parkinson inicial: iniciar 50/200mg (benserazida/levodopa) 3x/dia, aumentar gradualmente conforme resposta. Dose usual: 50/200mg 3-4x/dia. HBS (liberação controlada): 1-2 cápsulas 2x/dia. Tomar 30min antes ou 1h após refeições. Evitar proteínas na mesma refeição.',
        'max_dose': '200/800mg/dia (benserazida/levodopa)',
        'indications': 'Doença de Parkinson; Parkinsonismo',
        'preg': 'C',
    },
    'levodopa + carbidopa': {
        'brands': 'Sinemet, Cronomet, Carbidol',
        'posology': 'Parkinson inicial: iniciar 25/100mg (carbidopa/levodopa) 3x/dia, aumentar 1 comprimido/dia a cada 1-2 dias até resposta. Dose usual: 25/250mg 3-4x/dia ou CR 50/200mg 2x/dia. Tomar 30min antes ou 1h após refeições (proteínas reduzem absorção). Refeições com baixa proteína na hora da medicação.',
        'max_dose': '200/2000mg/dia (carbidopa/levodopa)',
        'indications': 'Doença de Parkinson; Parkinsonismo; Síndrome das pernas inquietas (off-label)',
        'preg': 'C',
    },
    'levofloxacino': {
        'brands': 'Levaquin, Tavanic, Levofloxacino (genérico)',
        'posology': '500-750 mg VO ou IV 1x/dia. Pneumonia: 750 mg/dia por 5 dias',
        'max_dose': '750 mg/dia',
        'indications': 'Pneumonia comunitária; sinusite bacteriana aguda; bronquite crônica exacerbada; ITU complicada; pielonefrite; prostatite; infecções de pele',
        'preg': 'C',
        "renal": True,
    },
    'levonorgestrel': {
        'brands': 'Postinor, Pozato, Diad, Mirena (DIU)',
        'posology': 'Contracepção emergência: 1,5 mg VO dose única até 72h após relação (eficácia máxima em 24h). DIU: inserção única, duração 5 anos.',
        'max_dose': '1,5 mg (contracepção de emergência, dose única)',
        'indications': 'Contracepção de emergência (pílula do dia seguinte); Contracepção intrauterina (SIU-LNG); Sangramento menstrual intenso (DIU)',
        'preg': 'X',
        "hepatic": True,
    },
    'levotiroxina': {
        'brands': 'Puran T4, Euthyrox, Synthroid, Levotiroxina (genérico)',
        'posology': '1,6 mcg/kg/dia VO em jejum (30-60 min antes do café). Idosos/cardiopatas: iniciar 25-50 mcg/dia. Ajustar a cada 6-8 semanas conforme TSH.',
        'max_dose': 'Individualizado (usual até 200 mcg/dia; pode chegar a 300 mcg em hipotireoidismo grave)',
        'indications': 'Hipotireoidismo primário e secundário; Supressão de TSH em câncer de tireoide; Bócio atóxico; Tireoidite de Hashimoto',
        'preg': 'A',
    },
    'liraglutida': {
        'brands': 'Victoza, Saxenda',
        'posology': 'Iniciar 0,6 mg SC 1x/dia por 1 semana. Aumentar 0,6 mg semanalmente até 1,8 mg/dia (Victoza-DM2) ou 3 mg/dia (Saxenda-obesidade).',
        'max_dose': '1,8 mg/dia (diabetes) ou 3 mg/dia (obesidade)',
        'indications': 'Diabetes mellitus tipo 2; Obesidade (IMC ≥30 ou ≥27 com comorbidades); Redução de risco cardiovascular em DM2',
        'preg': 'C',
        "route": 'subcutâneo',
    },
    'lisdexanfetamina': {
        'brands': 'Venvanse',
        'posology': 'TDAH: iniciar 30mg/dia pela manhã, aumentar 10-20mg/semana se necessário até 50-70mg/dia. Tomar pela manhã com ou sem alimentos. Pode abrir cápsula e dissolver em água. Evitar tarde/noite (insônia). Monitorar pressão arterial, frequência cardíaca, crescimento (crianças).',
        'max_dose': '70mg/dia',
        'indications': 'Transtorno de déficit de atenção e hiperatividade; Transtorno de compulsão alimentar periódica',
        'preg': 'C',
        "renal": True,
    },
    'loperamida': {
        'brands': 'Imosec, Loperamida (genérico)',
        'posology': '4 mg dose inicial, depois 2 mg após cada evacuação diarreica. Máximo 16 mg/dia',
        'max_dose': '16 mg/dia (8 mg/dia em venda livre)',
        'indications': 'Diarreia aguda não infecciosa; diarreia crônica; síndrome do intestino irritável; ileostomia (redução de débito)',
        'preg': 'C',
        "hepatic": True,
    },
    'loratadina': {
        'brands': 'Claritin, Loratadina (genérico)',
        'posology': '10 mg VO 1x/dia',
        'max_dose': '10 mg/dia',
        'indications': 'Rinite alérgica; urticária; prurido; conjuntivite alérgica',
        'preg': 'B',
        "renal": True,
        "hepatic": True,
    },
    'lorazepam': {
        'brands': 'Lorax, Lorazepam (genérico)',
        'posology': 'Ansiedade: 1-2mg 2-3x/dia, ajustar conforme resposta (usual 2-6mg/dia dividido). Insônia: 2-4mg ao deitar. Idosos: iniciar 0,5-1mg/dia dividido. Tomar com ou sem alimentos.',
        'max_dose': '10mg/dia VO',
        'indications': 'Transtornos de ansiedade; Insônia por ansiedade; Sedação pré-operatória; Status epilepticus (IV)',
        'preg': 'D',
        "hepatic": True,
    },
    'losartana': {
        'brands': 'Cozaar, Losartec, Aradois, Torlos',
        'posology': '50mg VO 1x/dia, podendo aumentar para 100mg/dia',
        'max_dose': '100mg/dia',
        'indications': 'Hipertensão arterial; insuficiência cardíaca; nefropatia diabética; prevenção de AVE em hipertensos com hipertrofia ventricular esquerda',
        'preg': 'D',
        "renal": True,
    },
    'medroxiprogesterona': {
        'brands': 'Depo-Provera, Contracep',
        'posology': '150 mg IM a cada 3 meses (12-13 semanas). Aplicar nos primeiros 5 dias do ciclo na primeira dose. Aplicação em glúteo ou deltoide.',
        'max_dose': '150 mg a cada 12 semanas (não antecipar)',
        'indications': 'Contracepção de longa duração; Endometriose; Sangramento uterino disfuncional',
        'preg': 'X',
        "route": 'intramuscular',
    },
    'meloxicam': {
        'brands': 'Movatec, Meloxicam (genérico)',
        'posology': '7,5-15 mg VO 1x/dia. Iniciar com 7,5 mg e aumentar se necessário',
        'max_dose': '15 mg/dia',
        'indications': 'Osteoartrite; artrite reumatoide; espondilite anquilosante; dor musculoesquelética crônica',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'mesalazina': {
        'brands': 'Mesacol, Pentasa, Asacol',
        'posology': '1-1,5g VO 8/8h ou 12/12h. Manutenção: 1,5-2g/dia. Supositório: 1g/dia. Enema: 2-4g/dia',
        'max_dose': '4,8g/dia',
        'indications': 'Doença de Crohn; retocolite ulcerativa (indução e manutenção); proctite; colite',
        'preg': 'B',
        "renal": True,
    },
    'metformina': {
        'brands': 'Glifage, Glucoformin, Metformina (genérico)',
        'posology': '500-850 mg VO 1-2x/dia, aumentar gradualmente. Dose usual: 2000 mg/dia divididos em 2-3 tomadas. Administrar com refeições.',
        'max_dose': '2550 mg/dia (3000 mg/dia em alguns protocolos)',
        'indications': 'Diabetes mellitus tipo 2; Síndrome dos ovários policísticos; Prevenção de DM2 em pré-diabetes',
        'preg': 'B',
        "renal": True,
        "hepatic": True,
    },
    'metildopa': {
        'brands': 'Aldomet',
        'posology': '250-500mg VO 2-3x/dia',
        'max_dose': '3g/dia',
        'indications': 'Hipertensão arterial; hipertensão gestacional; pré-eclâmpsia',
        'preg': 'B',
        "renal": True,
        "hepatic": True,
    },
    'metilfenidato': {
        'brands': 'Ritalina, Ritalina LA, Concerta',
        'posology': 'TDAH: iniciar 5mg 2x/dia (antes café e almoço), aumentar 5-10mg/semana até 20-60mg/dia dividido. Concerta (liberação prolongada): iniciar 18mg pela manhã, ajustar semanalmente até 54-72mg/dia. Narcolepsia: 10mg 2-3x/dia, até 60mg/dia. Tomar 30-45min antes das refeições. Última dose até 18h (insônia).',
        'max_dose': '80mg/dia (TDAH); 100mg/dia (narcolepsia)',
        'indications': 'Transtorno de déficit de atenção e hiperatividade; Narcolepsia',
        'preg': 'C',
    },
    'metimazol': {
        'brands': 'Tapazol',
        'posology': '15-30 mg VO 1x/dia (dose matinal). Manutenção: 5-10 mg/dia. Casos graves: até 40-60 mg divididos em 2-3 tomadas.',
        'max_dose': '60 mg/dia',
        'indications': 'Hipertireoidismo (Doença de Graves, bócio tóxico); Preparo pré-operatório para tireoidectomia; Preparo para iodoterapia',
        'preg': 'D',
        "hepatic": True,
    },
    'metoclopramida': {
        'brands': 'Plasil, Metoclopramida (genérico)',
        'posology': '10 mg VO ou IV 8/8h antes das refeições. Náusea aguda: 10 mg dose única',
        'max_dose': '30 mg/dia (uso prolongado limitado a 5 dias)',
        'indications': 'Náuseas e vômitos; gastroparesia; DRGE; enxaqueca (adjuvante); quimioterapia (profilaxia)',
        'preg': 'B',
        "renal": True,
    },
    'metoprolol': {
        'brands': 'Seloken, Lopressor',
        'posology': '50-100mg VO 1-2x/dia',
        'max_dose': '400mg/dia',
        'indications': 'Hipertensão arterial; angina pectoris; pós-infarto agudo do miocárdio; insuficiência cardíaca; taquiarritmias',
        'preg': 'C',
        "hepatic": True,
    },
    'metronidazol': {
        'brands': 'Flagyl, Metronidazol (genérico)',
        'posology': '500 mg VO ou IV 8/8h. Vaginose: 500 mg VO 12/12h por 7 dias ou dose única 2g. Giardíase: 250 mg 8/8h por 5-7 dias',
        'max_dose': '4g/dia',
        'indications': 'Vaginose bacteriana; tricomoníase; amebíase; giardíase; infecções anaeróbicas; Clostridium difficile; erradicação H. pylori; profilaxia cirúrgica abdominal',
        'preg': 'B',
        "renal": True,
        "hepatic": True,
    },
    'midazolam': {
        'brands': 'Dormonid, Dormire',
        'posology': 'Sedação consciente: 1-2,5mg IV lento, titular até sedação. Pré-anestésico: 0,07-0,15mg/kg IM 30-60min antes. Indução anestésica: 0,15-0,35mg/kg IV. Oral (crianças): 0,25-0,5mg/kg até 20mg.',
        'max_dose': '0,6mg/kg ou 10mg (dose única sedação)',
        'indications': 'Sedação consciente para procedimentos; Pré-medicação anestésica; Indução anestésica; Crises convulsivas refratárias (IV)',
        'preg': 'D',
        "renal": True,
        "hepatic": True,
    },
    'minoxidil': {
        'brands': 'Rogaine, Pant, Minoxidil (genérico)',
        'posology': 'Solução 2-5%: aplicar 1 mL 2x/dia no couro cabeludo seco. Barba: aplicar 2x/dia',
        'max_dose': '2 mL/dia (1 mL 12/12h)',
        'indications': 'Alopecia androgenética masculina e feminina; alopecia areata; crescimento de barba',
        'preg': 'C',
        "route": 'tópico',
    },
    'mirtazapina': {
        'brands': 'Remeron, Menelat, Mirtazapina (genérico)',
        'posology': 'Depressão: iniciar 15mg/dia à noite, aumentar a cada 1-2 semanas conforme resposta até 30-45mg/dia. Tomar à noite devido sedação. Efeito sedativo é maior em doses baixas (15mg).',
        'max_dose': '45mg/dia',
        'indications': 'Transtorno depressivo maior; Insônia (off-label); Estimulante de apetite (off-label)',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'mometasona': {
        'brands': 'Nasonex, Budecort Aqua, Mometasona (genérico)',
        'posology': '2 jatos (50 mcg/jato) em cada narina 1x/dia. Manutenção: 1 jato/narina/dia',
        'max_dose': '4 jatos por narina/dia (200 mcg/narina)',
        'indications': 'Rinite alérgica; polipose nasal; rinossinusite crônica',
        'preg': 'C',
        "route": 'nasal',
    },
    'mononitrato de isossorbida': {
        'brands': 'Monocordil',
        'posology': '20-40mg VO 2x/dia (8h de intervalo para evitar tolerância) ou 60mg VO 1x/dia',
        'max_dose': '120mg/dia',
        'indications': 'Angina pectoris profilaxia; insuficiência cardíaca congestiva',
        'preg': 'C',
    },
    'montelucaste': {
        'brands': 'Singulair, Montelair, Montelucaste (genérico)',
        'posology': '10 mg VO 1x/dia à noite. Crianças 6-14 anos: 5 mg/dia. Pode ser usado continuamente.',
        'max_dose': '10 mg/dia',
        'indications': 'Asma persistente (adjuvante); Profilaxia de asma induzida por exercício; Rinite alérgica sazonal ou perene',
        'preg': 'B',
    },
    'naproxeno': {
        'brands': 'Naprosyn, Flanax, Naproxeno (genérico)',
        'posology': '250-500 mg VO 12/12h. Dose de ataque: 500-750 mg, depois 250-500 mg 12/12h',
        'max_dose': '1250 mg/dia',
        'indications': 'Artrite reumatoide; osteoartrite; espondilite; gota aguda; dismenorreia; cefaleia; dor musculoesquelética',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'nifedipino': {
        'brands': 'Adalat',
        'posology': '30-60mg VO 1-2x/dia (liberação controlada)',
        'max_dose': '120mg/dia',
        'indications': 'Hipertensão arterial; angina estável crônica; angina vasoespástica; fenômeno de Raynaud',
        'preg': 'C',
        "hepatic": True,
    },
    'nimesulida': {
        'brands': 'Nisulid, Nimesulida (genérico)',
        'posology': '100 mg VO 12/12h. Uso por curto prazo (máximo 15 dias)',
        'max_dose': '200 mg/dia',
        'indications': 'Dor aguda; dor musculoesquelética; dismenorreia; febre; processos inflamatórios agudos',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'nistatina': {
        'brands': 'Micostatin, Nistatina (genérico)',
        'posology': 'Suspensão oral: 100.000 UI (1 mL) 4x/dia por 7-14 dias. Creme vaginal: 1 aplicador à noite por 14 dias',
        'max_dose': '400.000 UI/dia (oral)',
        'indications': 'Candidíase oral; candidíase vaginal; candidíase cutânea; prevenção de candidíase em imunossuprimidos',
        'preg': 'A',
    },
    'nitrato de isossorbida': {
        'brands': 'Isordil, Isocord',
        'posology': '5-20mg VO 2-3x/dia (sublingual para crise) ou 40mg VO 2x/dia (liberação controlada)',
        'max_dose': '240mg/dia',
        'indications': 'Angina pectoris profilaxia e tratamento; insuficiência cardíaca congestiva',
        'preg': 'C',
    },
    'nitrofurantoína': {
        'brands': 'Macrodantina, Nitrofurantoína (genérico)',
        'posology': '100 mg VO 6/6h por 7 dias (cistite). Profilaxia: 50-100 mg/dia à noite',
        'max_dose': '400 mg/dia (tratamento agudo)',
        'indications': 'Cistite aguda não complicada; profilaxia de ITU recorrente',
        'preg': 'B',
        "renal": True,
    },
    'noretisterona': {
        'brands': 'Micronor, Norestin',
        'posology': '0,35 mg VO 1x/dia, sem pausas, sempre no mesmo horário (tolerância de 3h). Iniciar no 1º dia da menstruação.',
        'max_dose': '0,35 mg/dia',
        'indications': 'Contracepção em lactantes; Contraindicação a estrogênios; Endometriose (doses maiores)',
        'preg': 'X',
        "hepatic": True,
    },
    'norfloxacino': {
        'brands': 'Floxacin, Norfloxacino (genérico)',
        'posology': '400 mg VO 12/12h. ITU simples: 400 mg 12/12h por 3 dias. Prostatite: 400 mg 12/12h por 28 dias',
        'max_dose': '800 mg/dia',
        'indications': 'ITU não complicada; cistite; prostatite; diarreia bacteriana; gonorreia; profilaxia de infecções urinárias',
        'preg': 'C',
        "renal": True,
    },
    'nortriptilina': {
        'brands': 'Pamelor',
        'posology': 'Depressão: iniciar 25mg 2-4x/dia ou 50-75mg à noite, ajustar gradualmente até 75-100mg/dia. Dor neuropática: iniciar 10-25mg à noite, aumentar semanalmente até 75mg/dia. Idosos: 30-50mg/dia.',
        'max_dose': '150mg/dia',
        'indications': 'Transtorno depressivo maior; Dor neuropática; Cessação tabágica (off-label)',
        'preg': 'C',
        "hepatic": True,
    },
    'olanzapina': {
        'brands': 'Zyprexa, Olanzapina (genérico), Zyad',
        'posology': 'Esquizofrenia: iniciar 5-10mg/dia à noite, ajustar 5mg/semana até 10-20mg/dia. Mania bipolar: iniciar 10-15mg/dia, ajustar 5mg até 5-20mg/dia. Manutenção bipolar: 5-20mg/dia. Tomar com ou sem alimentos, preferir à noite (sedação).',
        'max_dose': '20mg/dia',
        'indications': 'Esquizofrenia; Mania bipolar; Manutenção transtorno bipolar; Agitação aguda (IM); Depressão bipolar (combinado com fluoxetina)',
        'preg': 'C',
        "hepatic": True,
    },
    'olmesartana': {
        'brands': 'Benicar, Olmetec',
        'posology': '20-40mg VO 1x/dia',
        'max_dose': '40mg/dia',
        'indications': 'Hipertensão arterial',
        'preg': 'D',
        "renal": True,
        "hepatic": True,
    },
    'omeprazol': {
        'brands': 'Losec, Peprazol, Omeprazol (genérico)',
        'posology': '20-40 mg VO 1x/dia em jejum. DRGE: 20 mg/dia. Úlcera: 40 mg/dia. H. pylori: 40 mg/dia + ATB por 7-14 dias',
        'max_dose': '80 mg/dia (Zollinger-Ellison)',
        'indications': 'DRGE; úlcera péptica; esofagite erosiva; erradicação H. pylori; gastropatia por AINE; Zollinger-Ellison; dispepsia funcional',
        'preg': 'C',
        "hepatic": True,
    },
    'ondansetrona': {
        'brands': 'Zofran, Vonau, Ondansetrona (genérico)',
        'posology': '4-8 mg VO ou IV 8/8h. Quimioterapia: 8-32 mg IV pré-QT. Pós-op: 4 mg dose única',
        'max_dose': '32 mg/dia (fracionado)',
        'indications': 'Náuseas e vômitos induzidos por quimioterapia; radioterapia; pós-operatório; gastroenterite; hiperêmese gravídica',
        'preg': 'B',
        "hepatic": True,
    },
    'oxcarbazepina': {
        'brands': 'Trileptal, Oleptal',
        'posology': 'Epilepsia (monoterapia): iniciar 300mg 2x/dia, aumentar 300mg/dia a cada semana até 1200-2400mg/dia dividido. Epilepsia (adjuvante): iniciar 300mg 2x/dia, aumentar 600mg/dia/semana até 1200mg/dia. Conversão de carbamazepina: dose equivalente é 1,5x. Tomar com ou sem alimentos.',
        'max_dose': '2400mg/dia',
        'indications': 'Epilepsia (crises parciais); Neuralgia do trigêmeo (off-label); Transtorno bipolar (off-label)',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'oxibutinina': {
        'brands': 'Retemic, Incontinol, Oxibutinina (genérico)',
        'posology': '5 mg VO 2-3x/dia. Liberação prolongada: 5-30 mg 1x/dia',
        'max_dose': '20 mg/dia (liberação imediata); 30 mg/dia (XL)',
        'indications': 'Bexiga hiperativa; incontinência urinária de urgência; enurese noturna; espasmo vesical',
        'preg': 'B',
        "renal": True,
        "hepatic": True,
    },
    'pantoprazol': {
        'brands': 'Pantozol, Pantoprazol (genérico)',
        'posology': '40 mg VO ou IV 1x/dia. DRGE: 40 mg/dia por 4-8 semanas. Úlcera: 40 mg/dia. Zollinger: até 240 mg/dia',
        'max_dose': '240 mg/dia (Zollinger-Ellison)',
        'indications': 'DRGE; úlcera péptica; esofagite erosiva; erradicação H. pylori; gastropatia por AINE; Zollinger-Ellison; HDA (IV)',
        'preg': 'B',
        "hepatic": True,
    },
    'paracetamol': {
        'brands': 'Tylenol, Paracetamol (genérico)',
        'posology': '500-1000 mg VO 6/6h ou 8/8h. Máximo 4g/dia. IV: 1g 6/6h',
        'max_dose': '4g/dia (3g/dia em hepatopatas ou etilistas)',
        'indications': 'Dor leve a moderada; febre; cefaleia; dor musculoesquelética; alternativa a AINE quando contraindicado',
        'preg': 'B',
        "renal": True,
        "hepatic": True,
    },
    'penicilina benzatina': {
        'brands': 'Benzetacil, Penicilina benzatina (genérico)',
        'posology': '1.200.000 UI IM dose única (faringite). Sífilis primária: 2.400.000 UI IM dose única. Sífilis terciária: 2.400.000 UI IM semanal por 3 semanas',
        'max_dose': '2.400.000 UI/dose',
        'indications': 'Faringite estreptocócica; sífilis (todos os estágios); profilaxia secundária de febre reumática; erisipela',
        'preg': 'B',
        "renal": True,
        "route": 'intramuscular',
    },
    'piroxicam': {
        'brands': 'Feldene, Piroxicam (genérico)',
        'posology': '20 mg VO 1x/dia ou 10 mg 12/12h',
        'max_dose': '20 mg/dia',
        'indications': 'Artrite reumatoide; osteoartrite; espondilite; dor musculoesquelética; gota',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'pramipexol': {
        'brands': 'Sifrol, Pramipexol (genérico), Mirapex',
        'posology': 'Parkinson: iniciar 0,125mg 3x/dia, aumentar a cada 5-7 dias: semana 2: 0,25mg 3x/dia, semana 3: 0,5mg 3x/dia, depois ajustar até 0,5-1,5mg 3x/dia. Síndrome pernas inquietas: 0,125-0,5mg 2-3h antes de deitar. Tomar com ou sem alimentos. Retirada deve ser gradual.',
        'max_dose': '4,5mg/dia (1,5mg 3x/dia) - Parkinson',
        'indications': 'Doença de Parkinson (inicial ou avançada); Síndrome das pernas inquietas',
        'preg': 'C',
        "renal": True,
    },
    'prednisolona': {
        'brands': 'Predsim, Prelone, Prednisolona (genérico)',
        'posology': '5-60 mg VO 1x/dia. Crianças: 1-2 mg/kg/dia',
        'max_dose': '80 mg/dia',
        'indications': 'Asma; DPOC; doenças autoimunes; alergia; artrite; hepatite autoimune; síndrome nefrótica',
        'preg': 'C',
    },
    'prednisona': {
        'brands': 'Meticorten, Prednisona (genérico)',
        'posology': '5-60 mg VO 1x/dia manhã. Imunossupressão: 1 mg/kg/dia. Pulso: 500-1000 mg/dia IV por 3-5 dias',
        'max_dose': '80 mg/dia (uso prolongado); 1000 mg/dia (pulso)',
        'indications': 'Doenças autoimunes; asma; DPOC exacerbada; artrite reumatoide; lúpus; polimialgia; alergia grave; leucemia/linfoma',
        'preg': 'C',
    },
    'pregabalina': {
        'brands': 'Lyrica, Prebictal, Dorene',
        'posology': 'Dor neuropática: iniciar 75mg 2x/dia ou 50mg 3x/dia, aumentar em 1 semana para 150mg 2x/dia, máximo 300mg 2x/dia. Fibromialgia: iniciar 75mg 2x/dia, aumentar para 150mg 2x/dia em 1 semana. Epilepsia: 150-600mg/dia dividido. Tomar com ou sem alimentos.',
        'max_dose': '600mg/dia (dividido em 2-3 doses)',
        'indications': 'Dor neuropática (neuropatia diabética e pós-herpética); Fibromialgia; Epilepsia (crises parciais, adjuvante); Transtorno de ansiedade generalizada',
        'preg': 'C',
        "renal": True,
    },
    'prometazina': {
        'brands': 'Fenergan, Prometazina (genérico)',
        'posology': '25-50 mg VO, IM ou IV à noite. Náusea: 12,5-25 mg 4-6/6h. Sedação: 25-50 mg',
        'max_dose': '100 mg/dia',
        'indications': 'Náuseas e vômitos; vertigem; cinetose; alergia; sedação; insônia',
        'preg': 'C',
        "hepatic": True,
    },
    'propiltiouracil': {
        'brands': 'Propiltiouracil (genérico)',
        'posology': '100-150 mg VO 3x/dia (a cada 8h). Manutenção: 50-100 mg 2-3x/dia. Preferir no 1º trimestre de gestação.',
        'max_dose': '600 mg/dia (divididos em 3-4 tomadas)',
        'indications': 'Hipertireoidismo (Doença de Graves, bócio tóxico); Crise tireotóxica; Hipertireoidismo na gestação (1º trimestre)',
        'preg': 'D',
        "hepatic": True,
    },
    'propranolol': {
        'brands': 'Inderal',
        'posology': '40-80mg VO 2-3x/dia',
        'max_dose': '640mg/dia',
        'indications': 'Hipertensão arterial; angina pectoris; arritmias; tremor essencial; enxaqueca profilaxia; ansiedade; hipertireoidismo; varizes esofágicas profilaxia',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'quetiapina': {
        'brands': 'Seroquel, Quetipin, Ketipinor',
        'posology': 'Esquizofrenia: dia 1: 25mg 2x/dia, aumentar 25-50mg 2-3x/dia até 300-450mg/dia no dia 4, manutenção 300-800mg/dia. Mania bipolar: dia 1: 100mg/dia, dia 2: 200mg, dia 3: 300mg, dia 4: 400mg, dividido 2x/dia. Depressão bipolar (XR): iniciar 50mg à noite, dia 2: 100mg, dia 3: 200mg, dia 4: 300mg. Tomar com ou sem alimentos.',
        'max_dose': '800mg/dia (esquizofrenia); 800mg/dia (mania); 300mg/dia (depressão bipolar)',
        'indications': 'Esquizofrenia; Mania bipolar; Depressão bipolar; Transtorno bipolar manutenção; Depressão maior resistente (adjuvante)',
        'preg': 'C',
        "hepatic": True,
    },
    'ramipril': {
        'brands': 'Triatec',
        'posology': '2,5-10mg VO 1x/dia',
        'max_dose': '10mg/dia',
        'indications': 'Hipertensão arterial; insuficiência cardíaca; pós-infarto agudo do miocárdio; nefropatia diabética; prevenção cardiovascular',
        'preg': 'D',
        "renal": True,
        "hepatic": True,
    },
    'ranitidina': {
        'brands': 'Antak, Label, Ranitidina (genérico)',
        'posology': '150 mg VO 12/12h ou 300 mg à noite. Úlcera: 150 mg 12/12h ou 300 mg noite. IV: 50 mg 6-8/8h',
        'max_dose': '300 mg/dia VO; 400 mg/dia IV',
        'indications': 'DRGE leve; úlcera péptica; dispepsia; gastropatia por AINE; profilaxia de úlcera de estresse; anafilaxia (adjuvante)',
        'preg': 'B',
        "renal": True,
    },
    'risperidona': {
        'brands': 'Risperdal, Respidon, Riss, Zargus',
        'posology': 'Esquizofrenia: iniciar 2mg/dia (1mg 2x/dia ou 2mg à noite), aumentar 1-2mg/dia até 4-8mg/dia. Mania bipolar: iniciar 2-3mg/dia em dose única, ajustar 1mg/dia até 1-6mg/dia. Idosos: iniciar 0,5mg 2x/dia. Tomar com ou sem alimentos.',
        'max_dose': '16mg/dia (esquizofrenia); 6mg/dia (mania)',
        'indications': 'Esquizofrenia; Mania bipolar; Irritabilidade no autismo; Transtorno esquizoafetivo',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'rivaroxabana': {
        'brands': 'Xarelto',
        'posology': '10-20mg VO 1x/dia (dose varia conforme indicação)',
        'max_dose': '20mg/dia',
        'indications': 'Fibrilação atrial não-valvar; trombose venosa profunda; embolia pulmonar; prevenção de trombose pós-cirurgia ortopédica; síndrome coronariana aguda',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'rosuvastatina': {
        'brands': 'Crestor, Rosucor',
        'posology': '5-20mg VO 1x/dia',
        'max_dose': '40mg/dia',
        'indications': 'Hipercolesterolemia; dislipidemia mista; hipertrigliceridemia; prevenção cardiovascular primária e secundária',
        'preg': 'X',
        "renal": True,
        "hepatic": True,
    },
    'salbutamol': {
        'brands': 'Aerolin, Aerojet, Salbutamol (genérico)',
        'posology': 'Inalatório: 100-200 mcg (1-2 jatos) até 4x/dia SOS. Nebulização: 2,5-5 mg diluídos em 3-5 mL SF 0,9% até 4x/dia.',
        'max_dose': '800 mcg/dia (spray) ou 20 mg/dia (nebulização)',
        'indications': 'Broncoespasmo agudo (asma, DPOC); Profilaxia de broncoconstrição induzida por exercício; Exacerbação de doença pulmonar obstrutiva',
        'preg': 'C',
    },
    'salmeterol + fluticasona': {
        'brands': 'Seretide',
        'posology': '1 inalação 2x/dia (manhã e noite). Doses: 25/50, 25/125 ou 25/250 mcg (salmeterol/fluticasona). Não usar como resgate.',
        'max_dose': '2 inalações/dia da dose 25/250 mcg',
        'indications': 'Asma persistente moderada a grave; DPOC com sintomas frequentes; Manutenção em pacientes não controlados com corticoide isolado',
        'preg': 'C',
    },
    'semaglutida': {
        'brands': 'Ozempic, Wegovy, Rybelsus',
        'posology': 'SC: iniciar 0,25 mg/sem por 4 sem, depois 0,5 mg/sem. VO (Rybelsus): 3 mg/dia por 30 dias, depois 7 mg.',
        'max_dose': '2,4 mg/semana SC (Wegovy-obesidade); 1 mg/semana SC (Ozempic-DM2); 14 mg/dia VO',
        'indications': 'Diabetes mellitus tipo 2; Obesidade (IMC ≥30 ou ≥27 com comorbidades); Redução de risco cardiovascular em DM2',
        'preg': 'C',
    },
    'sertralina': {
        'brands': 'Zoloft, Assert, Tolrest, Serenata, Sercerin',
        'posology': 'Depressão/TOC: iniciar 50mg/dia, podendo aumentar semanalmente até 200mg/dia. Pânico/TEPT/Fobia social: iniciar 25mg/dia, aumentar para 50mg após 1 semana. Tomar pela manhã ou noite com alimentos.',
        'max_dose': '200mg/dia',
        'indications': 'Transtorno depressivo maior; Transtorno obsessivo-compulsivo; Transtorno de pânico; Transtorno de estresse pós-traumático; Fobia social; Transtorno disfórico pré-menstrual',
        'preg': 'C',
        "hepatic": True,
    },
    'sildenafila': {
        'brands': 'Viagra, Sildenafila (genérico)',
        'posology': '50 mg VO 1h antes da atividade sexual. Ajustar 25-100 mg conforme resposta. Máximo 1x/dia',
        'max_dose': '100 mg/dose',
        'indications': 'Disfunção erétil; hipertensão arterial pulmonar',
        'preg': 'B',
        "renal": True,
        "hepatic": True,
    },
    'simeticona': {
        'brands': 'Luftal, Dimeticona, Simeticona (genérico)',
        'posology': '40-80 mg VO 4x/dia após refeições e ao deitar. Gotas: 40 gotas 4x/dia',
        'max_dose': '500 mg/dia',
        'indications': 'Flatulência; distensão abdominal; aerofagia; dispepsia funcional; preparo para exames (ultrassom, endoscopia)',
        'preg': 'A',
    },
    'sinvastatina': {
        'brands': 'Zocor, Sinvascor',
        'posology': '10-40mg VO 1x/dia à noite',
        'max_dose': '80mg/dia',
        'indications': 'Hipercolesterolemia; dislipidemia mista; prevenção cardiovascular primária e secundária',
        'preg': 'X',
        "renal": True,
        "hepatic": True,
    },
    'sitagliptina': {
        'brands': 'Januvia',
        'posology': '100 mg VO 1x/dia, independente de refeições.',
        'max_dose': '100 mg/dia (ajustar em disfunção renal: 50 mg se TFG 30-50, 25 mg se <30)',
        'indications': 'Diabetes mellitus tipo 2 em monoterapia ou combinação; Adjuvante à dieta e exercício',
        'preg': 'B',
        "renal": True,
    },
    'sulfametoxazol + trimetoprima': {
        'brands': 'Bactrim, Infectrin, Sulfametoxazol (genérico)',
        'posology': '800/160 mg (dose dupla) VO 12/12h. ITU simples: dose única 12/12h por 3 dias. Pneumocistose: 15-20 mg/kg/dia TMP dividido 6/6h',
        'max_dose': '320 mg trimetoprima/dia (infecções comuns)',
        'indications': 'ITU não complicada; pneumonia por Pneumocystis; toxoplasmose; nocardiose; MRSA comunitário; shiguelose; profilaxia em HIV',
        'preg': 'C',
        "renal": True,
    },
    'sulfato ferroso': {
        'brands': 'Combiron Fólico, Sulfato Ferroso (genérico), Neutrofer',
        'posology': '40-60 mg ferro elementar VO 1-2x/dia em jejum (ou com refeição se intolerância). Gestantes: 30-60 mg/dia.',
        'max_dose': '200 mg ferro elementar/dia (divididos em 2-3 tomadas)',
        'indications': 'Anemia ferropriva; Profilaxia de anemia na gestação; Deficiência de ferro',
        'preg': 'A',
    },
    'tadalafila': {
        'brands': 'Cialis, Tadalafila (genérico)',
        'posology': 'Sob demanda: 10-20 mg antes da atividade (efeito até 36h). Diário: 2,5-5 mg/dia. HAP: 40 mg/dia',
        'max_dose': '20 mg/dose (sob demanda); 5 mg/dia (diário); 40 mg/dia (HAP)',
        'indications': 'Disfunção erétil; hiperplasia prostática benigna; hipertensão arterial pulmonar',
        'preg': 'B',
        "renal": True,
        "hepatic": True,
    },
    'tansulosina': {
        'brands': 'Secotex, Ominic, Tansulosina (genérico)',
        'posology': '0,4 mg VO 1x/dia após refeição. Pode aumentar para 0,8 mg se resposta inadequada',
        'max_dose': '0,8 mg/dia',
        'indications': 'Hiperplasia prostática benigna; sintomas do trato urinário inferior; cálculo ureteral (facilitação de expulsão)',
        'preg': 'B',
        "renal": True,
        "hepatic": True,
    },
    'telmisartana': {
        'brands': 'Micardis, Predicor',
        'posology': '40-80mg VO 1x/dia',
        'max_dose': '80mg/dia',
        'indications': 'Hipertensão arterial; redução de risco cardiovascular em pacientes com alto risco',
        'preg': 'D',
        "hepatic": True,
    },
    'timolol': {
        'brands': 'Timoptol, Timolol (genérico)',
        'posology': '1 gota 0,25-0,5% no olho afetado 12/12h',
        'max_dose': '1 gota 0,5% 12/12h por olho',
        'indications': 'Glaucoma de ângulo aberto; hipertensão ocular; glaucoma pós-cirúrgico',
        'preg': 'C',
        "route": 'oftálmico',
    },
    'tiotrópio': {
        'brands': 'Spiriva',
        'posology': '18 mcg (cápsula inalatória) 1x/dia pela manhã, via Handihaler. Ou 2,5 mcg (2 jatos Respimat) 1x/dia.',
        'max_dose': '18 mcg/dia (Handihaler) ou 5 mcg/dia (Respimat)',
        'indications': 'DPOC (manutenção e redução de exacerbações); Asma grave não controlada (off-label como adjuvante)',
        'preg': 'C',
        "renal": True,
    },
    'tizanidina': {
        'brands': 'Sirdalud, Tizanidina (genérico)',
        'posology': '2-4 mg VO 8/8h. Iniciar 2 mg à noite, titular gradualmente. Máximo 12 mg 8/8h',
        'max_dose': '36 mg/dia',
        'indications': 'Espasticidade; esclerose múltipla; lesão medular; AVC; espasmo muscular; lombalgia',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'tolterodina': {
        'brands': 'Detrusitol, Tolterodina (genérico)',
        'posology': '2 mg VO 12/12h. Liberação prolongada: 4 mg 1x/dia',
        'max_dose': '4 mg/dia (liberação imediata); 4 mg/dia (XL)',
        'indications': 'Bexiga hiperativa; incontinência urinária de urgência; polaciúria; noctúria',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'topiramato': {
        'brands': 'Topamax, Amato, Topiramato (genérico)',
        'posology': 'Epilepsia: iniciar 25-50mg/dia à noite, aumentar 25-50mg/semana até 200-400mg/dia dividido 2x/dia. Profilaxia enxaqueca: iniciar 25mg à noite, aumentar 25mg/semana até 100mg/dia dividido. Tomar com ou sem alimentos. Manter hidratação adequada (risco de litíase renal).',
        'max_dose': '1600mg/dia (epilepsia); 200mg/dia (enxaqueca)',
        'indications': 'Epilepsia (crises parciais e tônico-clônicas); Profilaxia de enxaqueca; Transtorno bipolar (off-label)',
        'preg': 'D',
        "renal": True,
        "hepatic": True,
    },
    'tramadol': {
        'brands': 'Tramal, Tramadol (genérico)',
        'posology': '50-100 mg VO ou IV 6/6h ou 8/8h. Liberação prolongada: 100-200 mg 12/12h ou 24/24h',
        'max_dose': '400 mg/dia',
        'indications': 'Dor moderada a intensa; dor neuropática; dor oncológica; pós-operatório; dor crônica',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'travoprosta': {
        'brands': 'Travatan, Travoprosta (genérico)',
        'posology': '1 gota 0,004% no olho afetado 1x/dia à noite',
        'max_dose': '1 gota/dia por olho',
        'indications': 'Glaucoma de ângulo aberto; hipertensão ocular',
        'preg': 'C',
        "route": 'oftálmico',
    },
    'trazodona': {
        'brands': 'Donaren, Loredon',
        'posology': 'Depressão: iniciar 50mg à noite, aumentar 50mg a cada 3-4 dias até 150-300mg/dia (dividido ou dose única noturna). Insônia: 25-100mg à noite. Tomar após refeições para reduzir tontura.',
        'max_dose': '600mg/dia (hospitalar); 400mg/dia (ambulatorial)',
        'indications': 'Transtorno depressivo maior; Insônia; Ansiedade associada à depressão',
        'preg': 'C',
        "hepatic": True,
    },
    'valerato de estradiol + noretisterona': {
        'brands': 'Mesigyna, Noregyna',
        'posology': '1 ampola IM a cada 30 dias (±3 dias). Aplicar nos primeiros 5 dias do ciclo na primeira dose. Via intramuscular profunda.',
        'max_dose': '1 ampola/mês',
        'indications': 'Contracepção hormonal injetável mensal; Regulação do ciclo menstrual',
        'preg': 'X',
        "hepatic": True,
        "route": 'intramuscular',
    },
    'valsartana': {
        'brands': 'Diovan, Tareg',
        'posology': '80-160mg VO 1x/dia',
        'max_dose': '320mg/dia',
        'indications': 'Hipertensão arterial; insuficiência cardíaca; pós-infarto agudo do miocárdio',
        'preg': 'D',
        "renal": True,
        "hepatic": True,
    },
    'varfarina': {
        'brands': 'Marevan, Coumadin',
        'posology': '2-10mg VO 1x/dia, ajustado conforme INR (alvo geralmente 2-3)',
        'max_dose': 'Dose variável conforme INR',
        'indications': 'Fibrilação atrial; trombose venosa profunda; embolia pulmonar; prótese valvar cardíaca; prevenção de tromboembolismo',
        'preg': 'D',
        "hepatic": True,
    },
    'venlafaxina': {
        'brands': 'Efexor XR, Venlift, Venlafaxina XR',
        'posology': 'Depressão: iniciar 75mg/dia (liberação prolongada), podendo aumentar 75mg a cada 4 dias até 225mg/dia. TAG: iniciar 75mg/dia, dose usual 75-225mg/dia. Pânico/Fobia social: iniciar 37,5mg/dia por 4-7 dias. Tomar com alimentos, mesma hora diariamente.',
        'max_dose': '375mg/dia (depressão grave); 225mg/dia (TAG)',
        'indications': 'Transtorno depressivo maior; Transtorno de ansiedade generalizada; Transtorno de pânico; Fobia social',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'verapamil': {
        'brands': 'Dilacoron, Calan',
        'posology': '80-120mg VO 3x/dia ou 240mg VO 1x/dia (liberação controlada)',
        'max_dose': '480mg/dia',
        'indications': 'Hipertensão arterial; angina estável; taquiarritmias supraventriculares; enxaqueca profilaxia',
        'preg': 'C',
        "renal": True,
        "hepatic": True,
    },
    'vildagliptina': {
        'brands': 'Galvus',
        'posology': '50 mg VO 2x/dia (manhã e noite) com refeições. Monoterapia ou combinação com metformina.',
        'max_dose': '100 mg/dia (50 mg 2x/dia)',
        'indications': 'Diabetes mellitus tipo 2 em monoterapia ou combinação; Adjuvante à dieta e exercício',
        'preg': 'B',
        "renal": True,
        "hepatic": True,
    },
    'zolpidem': {
        'brands': 'Stilnox, Patz, Lioram',
        'posology': 'Insônia: 10mg imediatamente antes de deitar (com estômago vazio). Idosos/debilitados: 5mg. Tomar apenas se puder dormir 7-8h. Uso limitado a 4 semanas. Evitar álcool.',
        'max_dose': '10mg/dia',
        'indications': 'Insônia (dificuldade para iniciar sono); Tratamento de curto prazo',
        'preg': 'C',
        "hepatic": True,
    },
    'ácido acetilsalicílico': {
        'brands': 'AAS, Aspirina, Somalgin',
        'posology': '100-300mg VO 1x/dia (antiagregante); 500-1000mg VO 4-6h (analgésico/antitérmico)',
        'max_dose': '300mg/dia (antiagregante), 4g/dia (analgésico)',
        'indications': 'Prevenção cardiovascular primária e secundária; síndrome coronariana aguda; pós-stent; pós-AVE isquêmico; doença arterial periférica; analgesia; febre; anti-inflamatório',
        'preg': 'D',
        "renal": True,
        "hepatic": True,
    },
    'ácido fólico': {
        'brands': 'Endofolin, Ácido Fólico (genérico)',
        'posology': '5 mg VO 1x/dia. Profilaxia gestacional: 0,4-0,8 mg/dia (400-800 mcg). Alto risco de defeito tubo neural: 4-5 mg/dia.',
        'max_dose': '15 mg/dia (tratamento de deficiência grave)',
        'indications': 'Anemia megaloblástica por deficiência de folato; Profilaxia de defeitos de tubo neural na gestação; Uso concomitante com metotrexato',
        'preg': 'A',
    },
    'ácido valproico': {
        'brands': 'Depakene',
        'posology': 'Mania: iniciar 250mg 3x/dia, aumentar rapidamente até 1000-2000mg/dia dividido. Epilepsia: 10-15mg/kg/dia, aumentar 5-10mg/kg/semana até resposta (usual 1000-2500mg/dia). Profilaxia enxaqueca: 250mg 2x/dia. Tomar com alimentos. Monitorar enzimas hepáticas e plaquetas.',
        'max_dose': '60mg/kg/dia',
        'indications': 'Mania bipolar; Epilepsia (vários tipos de crise); Profilaxia de enxaqueca',
        'preg': 'D',
        "hepatic": True,
    },
}



_UNSET = object()


def med(name, ap, pres, atc, tc, rx=True, ctrl=None, fp=False, copay=None, country='br',
        brands=_UNSET, route=_UNSET, posology=_UNSET, max_dose=_UNSET,
        indications=_UNSET, preg=_UNSET, renal=_UNSET, hepatic=_UNSET):
    clinical = CLINICAL_DATA.get(ap.lower(), {})
    _route = route if route is not _UNSET else clinical.get("route", "oral")
    return {
        "name": name, "active_principle": ap, "presentation": pres,
        "atc_code": atc, "therapeutic_class": tc,
        "requires_prescription": rx, "controlled_type": ctrl,
        "farmacia_popular": fp,
        "farmacia_popular_copay": copay if fp else None,
        "country": country,
        "common_brands": brands if brands is not _UNSET else clinical.get("brands"),
        "administration_route": _route,
        "usual_posology": posology if posology is not _UNSET else clinical.get("posology"),
        "max_daily_dose": max_dose if max_dose is not _UNSET else clinical.get("max_dose"),
        "common_indications": indications if indications is not _UNSET else clinical.get("indications"),
        "pregnancy_category": preg if preg is not _UNSET else clinical.get("preg"),
        "renal_adjustment": renal if renal is not _UNSET else clinical.get("renal", False),
        "hepatic_adjustment": hepatic if hepatic is not _UNSET else clinical.get("hepatic", False),
    }


def interaction(a, b, sev, desc, mech, mgmt, src="Micromedex", ev="established"):
    # Normalize pair order
    if a.lower() > b.lower():
        a, b = b, a
    return {
        "active_principle_a": a.lower(), "active_principle_b": b.lower(),
        "severity": sev, "description": desc, "mechanism": mech,
        "clinical_management": mgmt, "source": src, "evidence_level": ev,
    }


def generate_medications():
    meds = []

    # ============================================================
    # FARMÁCIA POPULAR - HIPERTENSÃO (Gratuito - 42 itens oficiais)
    # Portaria GM/MS 6.613/2025 - Todos 100% gratuitos desde fev/2025
    # ============================================================
    # FP: Losartana apenas 50mg
    meds.append(med("Losartana 50mg", "losartana", "50mg, 30 comprimidos", "C09CA01", "Anti-hipertensivo", fp=True, copay=0))
    # Outras doses NÃO FP
    for dose in ["25mg", "100mg"]:
        meds.append(med(f"Losartana {dose}", "losartana", f"{dose}, 30 comprimidos", "C09CA01", "Anti-hipertensivo"))
    # FP: Captopril apenas 25mg
    meds.append(med("Captopril 25mg", "captopril", "25mg, 30 comprimidos", "C09AA01", "Anti-hipertensivo", fp=True, copay=0))
    meds.append(med("Captopril 50mg", "captopril", "50mg, 30 comprimidos", "C09AA01", "Anti-hipertensivo"))
    # FP: Enalapril apenas 10mg
    meds.append(med("Enalapril 10mg", "enalapril", "10mg, 30 comprimidos", "C09AA02", "Anti-hipertensivo", fp=True, copay=0))
    for dose in ["5mg", "20mg"]:
        meds.append(med(f"Enalapril {dose}", "enalapril", f"{dose}, 30 comprimidos", "C09AA02", "Anti-hipertensivo"))
    # FP: Hidroclorotiazida 25mg
    meds.append(med("Hidroclorotiazida 25mg", "hidroclorotiazida", "25mg, 30 comprimidos", "C03AA03", "Diurético", fp=True, copay=0))
    # FP: Anlodipino apenas 5mg
    meds.append(med("Anlodipino 5mg", "anlodipino", "5mg, 30 comprimidos", "C08CA01", "Anti-hipertensivo", fp=True, copay=0))
    meds.append(med("Anlodipino 10mg", "anlodipino", "10mg, 30 comprimidos", "C08CA01", "Anti-hipertensivo"))
    # FP: Atenolol apenas 25mg
    meds.append(med("Atenolol 25mg", "atenolol", "25mg, 30 comprimidos", "C07AB03", "Anti-hipertensivo", fp=True, copay=0))
    for dose in ["50mg", "100mg"]:
        meds.append(med(f"Atenolol {dose}", "atenolol", f"{dose}, 30 comprimidos", "C07AB03", "Anti-hipertensivo"))
    # FP: Propranolol apenas 40mg
    meds.append(med("Propranolol 40mg", "propranolol", "40mg, 30 comprimidos", "C07AA05", "Anti-hipertensivo", fp=True, copay=0))
    for dose in ["10mg", "80mg"]:
        meds.append(med(f"Propranolol {dose}", "propranolol", f"{dose}, 30 comprimidos", "C07AA05", "Anti-hipertensivo"))
    # FP: Espironolactona 25mg (NOVO no FP)
    meds.append(med("Espironolactona 25mg", "espironolactona", "25mg, 30 comprimidos", "C03DA01", "Diurético", fp=True, copay=0))
    for dose in ["50mg", "100mg"]:
        meds.append(med(f"Espironolactona {dose}", "espironolactona", f"{dose}, 30 comprimidos", "C03DA01", "Diurético"))
    # FP: Furosemida 40mg (NOVO no FP)
    meds.append(med("Furosemida 40mg", "furosemida", "40mg, 20 comprimidos", "C03CA01", "Diurético", fp=True, copay=0))
    # FP: Succinato de Metoprolol 25mg (NOVO no FP)
    meds.append(med("Succinato de Metoprolol 25mg", "metoprolol", "25mg, 30 comprimidos", "C07AB02", "Anti-hipertensivo", fp=True, copay=0))

    # Anti-hipertensivos NÃO FP
    for dose in ["80mg", "160mg", "320mg"]:
        meds.append(med(f"Valsartana {dose}", "valsartana", f"{dose}, 30 comprimidos", "C09CA03", "Anti-hipertensivo"))
    for dose in ["40mg", "80mg"]:
        meds.append(med(f"Telmisartana {dose}", "telmisartana", f"{dose}, 30 comprimidos", "C09CA07", "Anti-hipertensivo"))
    for dose in ["20mg", "40mg"]:
        meds.append(med(f"Olmesartana {dose}", "olmesartana", f"{dose}, 30 comprimidos", "C09CA08", "Anti-hipertensivo"))
    for dose in ["8mg", "16mg", "32mg"]:
        meds.append(med(f"Candesartana {dose}", "candesartana", f"{dose}, 30 comprimidos", "C09CA06", "Anti-hipertensivo"))
    meds.append(med("Indapamida 1,5mg", "indapamida", "1,5mg SR, 30 comprimidos", "C03BA11", "Diurético"))
    meds.append(med("Clortalidona 12,5mg", "clortalidona", "12,5mg, 30 comprimidos", "C03BA04", "Diurético"))
    meds.append(med("Clortalidona 25mg", "clortalidona", "25mg, 30 comprimidos", "C03BA04", "Diurético"))
    for dose in ["3,125mg", "6,25mg", "12,5mg", "25mg"]:
        meds.append(med(f"Carvedilol {dose}", "carvedilol", f"{dose}, 30 comprimidos", "C07AG02", "Anti-hipertensivo"))
    for dose in ["2,5mg", "5mg", "10mg"]:
        meds.append(med(f"Bisoprolol {dose}", "bisoprolol", f"{dose}, 30 comprimidos", "C07AB07", "Anti-hipertensivo"))
    for dose in ["5mg", "10mg"]:
        meds.append(med(f"Ramipril {dose}", "ramipril", f"{dose}, 30 comprimidos", "C09AA05", "Anti-hipertensivo"))
    meds.append(med("Nifedipino 20mg", "nifedipino", "20mg retard, 30 comprimidos", "C08CA05", "Anti-hipertensivo"))
    meds.append(med("Nifedipino 60mg", "nifedipino", "60mg OROS, 30 comprimidos", "C08CA05", "Anti-hipertensivo"))
    # Metildopa e Verapamil NÃO são FP
    for dose in ["250mg", "500mg"]:
        meds.append(med(f"Metildopa {dose}", "metildopa", f"{dose}, 30 comprimidos", "C02AB01", "Anti-hipertensivo"))
    for dose in ["80mg", "120mg"]:
        meds.append(med(f"Verapamil {dose}", "verapamil", f"{dose}, 30 comprimidos", "C08DA01", "Anti-hipertensivo"))

    # ============================================================
    # FARMÁCIA POPULAR - DIABETES (Gratuito)
    # ============================================================
    for dose in ["500mg", "850mg"]:
        meds.append(med(f"Metformina {dose}", "metformina", f"{dose}, 30 comprimidos", "A10BA02", "Antidiabético", fp=True, copay=0))
    # FP: Metformina 500mg LP (liberação prolongada) — NOVO no FP
    meds.append(med("Metformina 500mg LP", "metformina", "500mg liberação prolongada, 30 comprimidos", "A10BA02", "Antidiabético", fp=True, copay=0))
    # FP: Glibenclamida 5mg
    meds.append(med("Glibenclamida 5mg", "glibenclamida", "5mg, 30 comprimidos", "A10BB01", "Antidiabético", fp=True, copay=0))
    # FP: Insulina NPH e Regular
    meds.append(med("Insulina NPH 100UI/mL", "insulina nph", "100UI/mL, 10mL frasco", "A10AC01", "Antidiabético", fp=True, copay=0, route='subcutâneo'))
    meds.append(med("Insulina Regular 100UI/mL", "insulina regular", "100UI/mL, 10mL frasco", "A10AB01", "Antidiabético", fp=True, copay=0, route='subcutâneo'))
    # FP: Dapagliflozina 10mg (NOVO no FP)
    meds.append(med("Dapagliflozina 10mg", "dapagliflozina", "10mg, 30 comprimidos", "A10BK01", "Antidiabético", fp=True, copay=0))

    # Antidiabéticos NÃO FP
    # Metformina XR NÃO é FP (LP sim, XR não)
    for dose in ["500mg", "750mg"]:
        meds.append(med(f"Metformina XR {dose}", "metformina", f"{dose} XR, 30 comprimidos", "A10BA02", "Antidiabético"))
    # Glicazida MR NÃO é FP
    for dose in ["30mg", "60mg"]:
        meds.append(med(f"Glicazida {dose} MR", "glicazida", f"{dose} MR, 30 comprimidos", "A10BB09", "Antidiabético"))
    # Insulina Glargina NÃO é FP
    meds.append(med("Insulina Glargina 100UI/mL", "insulina glargina", "100UI/mL, 3mL caneta", "A10AE04", "Antidiabético", route='subcutâneo'))
    for dose in ["10mg", "25mg"]:
        meds.append(med(f"Empagliflozina {dose}", "empagliflozina", f"{dose}, 30 comprimidos", "A10BK03", "Antidiabético"))
    meds.append(med("Sitagliptina 100mg", "sitagliptina", "100mg, 30 comprimidos", "A10BH01", "Antidiabético"))
    meds.append(med("Vildagliptina 50mg", "vildagliptina", "50mg, 56 comprimidos", "A10BH02", "Antidiabético"))
    meds.append(med("Liraglutida 6mg/mL", "liraglutida", "6mg/mL, caneta 3mL", "A10BJ02", "Antidiabético", route='subcutâneo'))
    meds.append(med("Semaglutida 1,34mg/mL", "semaglutida", "1,34mg/mL, caneta", "A10BJ06", "Antidiabético", route='subcutâneo'))

    # ============================================================
    # FARMÁCIA POPULAR - ASMA/DPOC (Gratuito)
    # ============================================================
    meds.append(med("Salbutamol Spray 100mcg", "salbutamol", "100mcg/dose, 200 doses", "R03AC02", "Broncodilatador", fp=True, copay=0, route='inalatório'))
    # FP: Salbutamol solução para nebulização (NOVO no FP)
    meds.append(med("Salbutamol 5mg/mL Solução Nebulização", "salbutamol", "5mg/mL, 10mL", "R03AC02", "Broncodilatador", fp=True, copay=0, route='inalatório'))
    # FP: Beclometasona 200mcg cápsula inalação e 50mcg nasal
    meds.append(med("Beclometasona 200mcg Cápsula Inalação", "beclometasona", "200mcg, cápsula para inalação", "R03BA01", "Corticosteroide inalatório", fp=True, copay=0, route='inalatório'))
    meds.append(med("Beclometasona 250mcg Spray", "beclometasona", "250mcg/dose, 200 doses", "R03BA01", "Corticosteroide inalatório", fp=True, copay=0, route='inalatório'))
    meds.append(med("Beclometasona 50mcg Nasal", "beclometasona", "50mcg/dose spray nasal, 200 doses", "R01AD01", "Corticosteroide nasal", fp=True, copay=0, route='nasal'))
    meds.append(med("Brometo de Ipratrópio 0,25mg/mL", "brometo de ipratrópio", "0,25mg/mL, 20mL", "R03BB01", "Broncodilatador", fp=True, copay=0, route='inalatório'))
    meds.append(med("Brometo de Ipratrópio Spray 0,02mg", "brometo de ipratrópio", "0,02mg/dose, 200 doses", "R03BB01", "Broncodilatador", fp=True, copay=0, route='inalatório'))
    for dose in ["200mcg", "400mcg"]:
        meds.append(med(f"Budesonida Inalatória {dose}", "budesonida", f"{dose}/dose, 200 doses", "R03BA02", "Corticosteroide inalatório", fp=True, copay=0, route='inalatório'))

    # Respiratórios NÃO FP
    meds.append(med("Salbutamol Xarope 2mg/5mL", "salbutamol", "2mg/5mL, 120mL", "R03AC02", "Broncodilatador"))
    meds.append(med("Beclometasona 50mcg Spray", "beclometasona", "50mcg/dose, 200 doses", "R03BA01", "Corticosteroide inalatório", route='inalatório'))
    meds.append(med("Formoterol 12mcg", "formoterol", "12mcg/dose, 60 cápsulas inalantes", "R03AC13", "Broncodilatador", route='inalatório'))
    meds.append(med("Formoterol + Budesonida 6/200mcg", "formoterol + budesonida", "6/200mcg, 60 doses", "R03AK07", "Broncodilatador + Corticosteroide", route='inalatório'))
    meds.append(med("Fluticasona 250mcg", "fluticasona", "250mcg/dose, 60 doses", "R03BA05", "Corticosteroide inalatório", route='inalatório'))
    meds.append(med("Salmeterol + Fluticasona 50/250mcg", "salmeterol + fluticasona", "50/250mcg, 60 doses", "R03AK06", "Broncodilatador + Corticosteroide", route='inalatório'))
    meds.append(med("Montelucaste 10mg", "montelucaste", "10mg, 30 comprimidos", "R03DC03", "Antileucotrieno"))
    meds.append(med("Tiotrópio 2,5mcg", "tiotrópio", "2,5mcg/dose, Respimat", "R03BB04", "Broncodilatador", route='inalatório'))

    # ============================================================
    # FARMÁCIA POPULAR - DISLIPIDEMIA (Gratuito)
    # ============================================================
    for dose in ["10mg", "20mg", "40mg"]:
        meds.append(med(f"Sinvastatina {dose}", "sinvastatina", f"{dose}, 30 comprimidos", "C10AA01", "Hipolipemiante", fp=True, copay=0))

    # Hipolipemiantes NÃO FP
    for dose in ["10mg", "20mg", "40mg", "80mg"]:
        meds.append(med(f"Atorvastatina {dose}", "atorvastatina", f"{dose}, 30 comprimidos", "C10AA05", "Hipolipemiante"))
    for dose in ["10mg", "20mg", "40mg"]:
        meds.append(med(f"Rosuvastatina {dose}", "rosuvastatina", f"{dose}, 30 comprimidos", "C10AA07", "Hipolipemiante"))
    meds.append(med("Ezetimiba 10mg", "ezetimiba", "10mg, 30 comprimidos", "C10AX09", "Hipolipemiante"))
    meds.append(med("Fenofibrato 200mg", "fenofibrato", "200mg, 30 cápsulas", "C10AB05", "Hipolipemiante"))
    meds.append(med("Bezafibrato 400mg", "bezafibrato", "400mg retard, 30 comprimidos", "C10AB02", "Hipolipemiante"))

    # ============================================================
    # FARMÁCIA POPULAR - OSTEOPOROSE (Gratuito)
    # ============================================================
    meds.append(med("Alendronato 70mg", "alendronato", "70mg, 4 comprimidos", "M05BA04", "Antirreabsortivo ósseo", fp=True, copay=0))
    meds.append(med("Alendronato 10mg", "alendronato", "10mg, 30 comprimidos", "M05BA04", "Antirreabsortivo ósseo", fp=True, copay=0))
    # Carbonato de Cálcio + Colecalciferol NÃO é FP
    meds.append(med("Carbonato de Cálcio + Colecalciferol 500mg/400UI", "carbonato de cálcio + colecalciferol", "500mg+400UI, 60 comprimidos", "A12AX", "Suplemento ósseo", rx=False))

    # ============================================================
    # FARMÁCIA POPULAR - ANTICONCEPÇÃO (Gratuito)
    # ============================================================
    meds.append(med("Etinilestradiol + Levonorgestrel", "etinilestradiol + levonorgestrel", "0,03mg + 0,15mg, 21 comprimidos", "G03AA07", "Contraceptivo", fp=True, copay=0))
    # FP: Noretisterona 0,35mg
    meds.append(med("Noretisterona 0,35mg", "noretisterona", "0,35mg, 35 comprimidos", "G03AC01", "Contraceptivo", fp=True, copay=0))
    meds.append(med("Medroxiprogesterona 150mg/mL", "medroxiprogesterona", "150mg/mL, 1mL injetável", "G03AC06", "Contraceptivo", fp=True, copay=0, route='intramuscular'))
    # FP: Valerato de Estradiol + Noretisterona injetável
    meds.append(med("Valerato de Estradiol + Noretisterona 5mg+50mg", "valerato de estradiol + noretisterona", "5mg+50mg/mL, injetável mensal", "G03AA", "Contraceptivo", fp=True, copay=0, route='intramuscular'))
    # Levonorgestrel emergência NÃO é FP
    meds.append(med("Levonorgestrel 1,5mg", "levonorgestrel", "1,5mg, 1 comprimido", "G03AC03", "Contraceptivo de emergência"))

    # ============================================================
    # FARMÁCIA POPULAR - PARKINSON (Gratuito)
    # ============================================================
    for pres in ["100/25mg", "250/25mg"]:
        meds.append(med(f"Levodopa + Carbidopa {pres}", "levodopa + carbidopa", f"{pres}, 30 comprimidos", "N04BA02", "Antiparkinsoniano", ctrl="c1", fp=True, copay=0))
    # FP: Benserazida + Levodopa 25mg+100mg
    meds.append(med("Benserazida + Levodopa 25mg+100mg", "benserazida + levodopa", "25mg+100mg, 30 comprimidos", "N04BA02", "Antiparkinsoniano", ctrl="c1", fp=True, copay=0))
    # Levodopa + Benserazida 200/50mg NÃO é FP
    meds.append(med("Levodopa + Benserazida 200/50mg", "levodopa + benserazida", "200/50mg, 30 comprimidos", "N04BA02", "Antiparkinsoniano", ctrl="c1"))
    # Pramipexol, Biperideno, Entacapona NÃO são FP
    for dose in ["0,125mg", "0,25mg", "1mg"]:
        meds.append(med(f"Pramipexol {dose}", "pramipexol", f"{dose}, 30 comprimidos", "N04BC05", "Antiparkinsoniano", ctrl="c1"))
    meds.append(med("Biperideno 2mg", "biperideno", "2mg, 30 comprimidos", "N04AA02", "Anticolinérgico", ctrl="c1"))
    meds.append(med("Entacapona 200mg", "entacapona", "200mg, 30 comprimidos", "N04BX02", "Antiparkinsoniano", ctrl="c1"))

    # ============================================================
    # FARMÁCIA POPULAR - SUPLEMENTOS E ITENS DIVERSOS (Gratuito)
    # ============================================================
    meds.append(med("Sulfato Ferroso 40mg Fe", "sulfato ferroso", "40mg Fe elementar, 30 comprimidos", "B03AA07", "Antianêmico", rx=False, fp=True, copay=0))
    meds.append(med("Ácido Fólico 5mg", "ácido fólico", "5mg, 30 comprimidos", "B03BB01", "Vitamina", rx=False, fp=True, copay=0))
    # FP: Absorvente Higiênico (NOVO no FP - item não-medicamentoso)
    meds.append(med("Absorvente Higiênico", "absorvente higiênico", "pacote com unidades", "N/A", "Item não-medicamentoso", rx=False, fp=True, copay=0,
        brands="Diversas marcas disponíveis na rede credenciada",
        indications="Higiene menstrual — distribuído gratuitamente pelo Farmácia Popular desde 2025"))
    # FP: Fralda Geriátrica (NOVO no FP - item não-medicamentoso)
    meds.append(med("Fralda Geriátrica", "fralda geriátrica", "pacote com unidades", "N/A", "Item não-medicamentoso", rx=False, fp=True, copay=0,
        brands="Diversas marcas disponíveis na rede credenciada",
        indications="Incontinência urinária/fecal em idosos — distribuído gratuitamente pelo Farmácia Popular desde 2025"))

    # ============================================================
    # SAÚDE MENTAL - NÃO FP (nenhum psiquiátrico é FP na lista oficial)
    # ============================================================
    # Antidepressivos
    meds.append(med("Fluoxetina 20mg", "fluoxetina", "20mg, 30 cápsulas", "N06AB03", "Antidepressivo", ctrl="c1"))
    for dose in ["25mg", "75mg"]:
        meds.append(med(f"Amitriptilina {dose}", "amitriptilina", f"{dose}, 30 comprimidos", "N06AA09", "Antidepressivo", ctrl="c1"))
    for dose in ["10mg", "25mg", "50mg", "75mg"]:
        meds.append(med(f"Nortriptilina {dose}", "nortriptilina", f"{dose}, 30 cápsulas", "N06AA10", "Antidepressivo", ctrl="c1"))
    for dose in ["10mg", "25mg"]:
        meds.append(med(f"Clomipramina {dose}", "clomipramina", f"{dose}, 20 comprimidos", "N06AA04", "Antidepressivo", ctrl="c1"))
    for dose in ["50mg", "100mg"]:
        meds.append(med(f"Sertralina {dose}", "sertralina", f"{dose}, 30 comprimidos", "N06AB06", "Antidepressivo", ctrl="c1"))
    for dose in ["10mg", "20mg"]:
        meds.append(med(f"Escitalopram {dose}", "escitalopram", f"{dose}, 30 comprimidos", "N06AB10", "Antidepressivo", ctrl="c1"))
    for dose in ["75mg", "150mg"]:
        meds.append(med(f"Venlafaxina {dose}", "venlafaxina", f"{dose} XR, 30 cápsulas", "N06AX16", "Antidepressivo", ctrl="c1"))
    for dose in ["30mg", "60mg"]:
        meds.append(med(f"Duloxetina {dose}", "duloxetina", f"{dose}, 30 cápsulas", "N06AX21", "Antidepressivo", ctrl="c1"))
    meds.append(med("Citalopram 20mg", "citalopram", "20mg, 30 comprimidos", "N06AB04", "Antidepressivo", ctrl="c1"))
    for dose in ["150mg", "300mg"]:
        meds.append(med(f"Bupropiona {dose}", "bupropiona", f"{dose} XL, 30 comprimidos", "N06AX12", "Antidepressivo", ctrl="c1"))
    for dose in ["15mg", "30mg", "45mg"]:
        meds.append(med(f"Mirtazapina {dose}", "mirtazapina", f"{dose}, 30 comprimidos", "N06AX11", "Antidepressivo", ctrl="c1"))
    for dose in ["50mg", "100mg"]:
        meds.append(med(f"Desvenlafaxina {dose}", "desvenlafaxina", f"{dose}, 30 comprimidos", "N06AX23", "Antidepressivo", ctrl="c1"))
    for dose in ["50mg", "100mg", "150mg"]:
        meds.append(med(f"Trazodona {dose}", "trazodona", f"{dose}, 30 comprimidos", "N06AX05", "Antidepressivo", ctrl="c1"))

    # Ansiolíticos
    for dose in ["5mg", "10mg"]:
        meds.append(med(f"Diazepam {dose}", "diazepam", f"{dose}, 20 comprimidos", "N05BA01", "Ansiolítico", ctrl="b1"))
    for dose in ["0,5mg", "2mg"]:
        meds.append(med(f"Clonazepam {dose}", "clonazepam", f"{dose}, 30 comprimidos", "N03AE01", "Ansiolítico", ctrl="b1"))
    meds.append(med("Clonazepam 2,5mg/mL Gotas", "clonazepam", "2,5mg/mL, 20mL gotas", "N03AE01", "Ansiolítico", ctrl="b1"))
    for dose in ["0,5mg", "1mg", "2mg"]:
        meds.append(med(f"Alprazolam {dose}", "alprazolam", f"{dose}, 30 comprimidos", "N05BA12", "Ansiolítico", ctrl="b1"))
    for dose in ["3mg", "6mg"]:
        meds.append(med(f"Bromazepam {dose}", "bromazepam", f"{dose}, 20 comprimidos", "N05BA08", "Ansiolítico", ctrl="b1"))
    for dose in ["1mg", "2mg"]:
        meds.append(med(f"Lorazepam {dose}", "lorazepam", f"{dose}, 20 comprimidos", "N05BA06", "Ansiolítico", ctrl="b1"))
    meds.append(med("Midazolam 15mg", "midazolam", "15mg, 30 comprimidos", "N05CD08", "Hipnótico", ctrl="b1"))
    meds.append(med("Zolpidem 10mg", "zolpidem", "10mg, 30 comprimidos", "N05CF02", "Hipnótico", ctrl="c1"))
    meds.append(med("Buspirone 10mg", "buspirone", "10mg, 30 comprimidos", "N05BE01", "Ansiolítico"))

    # Antipsicóticos (NÃO FP)
    for dose in ["1mg", "2mg", "3mg"]:
        meds.append(med(f"Risperidona {dose}", "risperidona", f"{dose}, 30 comprimidos", "N05AX08", "Antipsicótico", ctrl="c1"))
    for dose in ["25mg", "100mg", "200mg", "300mg"]:
        meds.append(med(f"Quetiapina {dose}", "quetiapina", f"{dose}, 30 comprimidos", "N05AH04", "Antipsicótico", ctrl="c1"))
    for dose in ["5mg", "10mg"]:
        meds.append(med(f"Olanzapina {dose}", "olanzapina", f"{dose}, 30 comprimidos", "N05AH03", "Antipsicótico", ctrl="c1"))
    for dose in ["25mg", "100mg"]:
        meds.append(med(f"Clozapina {dose}", "clozapina", f"{dose}, 30 comprimidos", "N05AH02", "Antipsicótico", ctrl="c1"))
    for dose in ["1mg", "5mg"]:
        meds.append(med(f"Haloperidol {dose}", "haloperidol", f"{dose}, 20 comprimidos", "N05AD01", "Antipsicótico", ctrl="c1"))
    for dose in ["25mg", "100mg"]:
        meds.append(med(f"Clorpromazina {dose}", "clorpromazina", f"{dose}, 20 comprimidos", "N05AA01", "Antipsicótico", ctrl="c1"))
    meds.append(med("Aripiprazol 10mg", "aripiprazol", "10mg, 30 comprimidos", "N05AX12", "Antipsicótico", ctrl="c1"))
    meds.append(med("Aripiprazol 15mg", "aripiprazol", "15mg, 30 comprimidos", "N05AX12", "Antipsicótico", ctrl="c1"))

    # Estabilizadores de humor (NÃO FP)
    for dose in ["300mg", "450mg"]:
        meds.append(med(f"Carbonato de Lítio {dose}", "carbonato de lítio", f"{dose}, 30 comprimidos", "N05AN01", "Estabilizador de humor", ctrl="c1"))
    for dose in ["250mg", "500mg"]:
        meds.append(med(f"Ácido Valproico {dose}", "ácido valproico", f"{dose}, 30 cápsulas", "N03AG01", "Anticonvulsivante", ctrl="c1"))
    meds.append(med("Divalproato de Sódio 500mg", "divalproato de sódio", "500mg ER, 30 comprimidos", "N03AG01", "Anticonvulsivante", ctrl="c1"))
    for dose in ["25mg", "50mg", "100mg"]:
        meds.append(med(f"Lamotrigina {dose}", "lamotrigina", f"{dose}, 30 comprimidos", "N03AX09", "Anticonvulsivante", ctrl="c1"))

    # ============================================================
    # ANTICONVULSIVANTES (NÃO FP)
    # ============================================================
    for dose in ["200mg", "400mg"]:
        meds.append(med(f"Carbamazepina {dose}", "carbamazepina", f"{dose}, 20 comprimidos", "N03AF01", "Anticonvulsivante", ctrl="c1"))
    meds.append(med("Fenitoína 100mg", "fenitoína", "100mg, 30 comprimidos", "N03AB02", "Anticonvulsivante", ctrl="c1"))
    meds.append(med("Fenobarbital 100mg", "fenobarbital", "100mg, 30 comprimidos", "N03AA02", "Anticonvulsivante", ctrl="b1"))
    meds.append(med("Fenobarbital 40mg/mL Gotas", "fenobarbital", "40mg/mL, 20mL gotas", "N03AA02", "Anticonvulsivante", ctrl="b1"))
    for dose in ["300mg", "600mg"]:
        meds.append(med(f"Gabapentina {dose}", "gabapentina", f"{dose}, 30 cápsulas", "N03AX12", "Anticonvulsivante", ctrl="c1"))
    for dose in ["75mg", "150mg", "300mg"]:
        meds.append(med(f"Pregabalina {dose}", "pregabalina", f"{dose}, 30 cápsulas", "N03AX16", "Anticonvulsivante", ctrl="c1"))
    for dose in ["25mg", "50mg", "100mg"]:
        meds.append(med(f"Topiramato {dose}", "topiramato", f"{dose}, 60 comprimidos", "N03AX11", "Anticonvulsivante", ctrl="c1"))
    for dose in ["300mg", "600mg"]:
        meds.append(med(f"Oxcarbazepina {dose}", "oxcarbazepina", f"{dose}, 30 comprimidos", "N03AF02", "Anticonvulsivante", ctrl="c1"))
    for dose in ["250mg", "500mg", "1000mg"]:
        meds.append(med(f"Levetiracetam {dose}", "levetiracetam", f"{dose}, 30 comprimidos", "N03AX14", "Anticonvulsivante", ctrl="c1"))

    # ============================================================
    # ANTICOAGULANTES (NÃO FP - Varfarina removida do FP)
    # ============================================================
    for dose in ["1mg", "3mg", "5mg"]:
        meds.append(med(f"Varfarina {dose}", "varfarina", f"{dose}, 30 comprimidos", "B01AA03", "Anticoagulante"))
    for dose in ["15mg", "20mg"]:
        meds.append(med(f"Rivaroxabana {dose}", "rivaroxabana", f"{dose}, 28 comprimidos", "B01AF01", "Anticoagulante"))
    for dose in ["2,5mg", "5mg"]:
        meds.append(med(f"Apixabana {dose}", "apixabana", f"{dose}, 60 comprimidos", "B01AF02", "Anticoagulante"))
    for dose in ["110mg", "150mg"]:
        meds.append(med(f"Dabigatrana {dose}", "dabigatrana", f"{dose}, 60 cápsulas", "B01AE07", "Anticoagulante"))
    for dose in ["40mg", "60mg", "80mg"]:
        meds.append(med(f"Enoxaparina {dose}", "enoxaparina", f"{dose}, seringa preenchida", "B01AB05", "Anticoagulante", route='subcutâneo'))
    meds.append(med("AAS 100mg", "ácido acetilsalicílico", "100mg, 30 comprimidos", "B01AC06", "Antiplaquetário", rx=False))
    meds.append(med("Clopidogrel 75mg", "clopidogrel", "75mg, 28 comprimidos", "B01AC04", "Antiplaquetário"))

    # ============================================================
    # GLAUCOMA (NÃO FP - removidos do FP)
    # ============================================================
    for conc in ["0,25%", "0,5%"]:
        meds.append(med(f"Timolol Colírio {conc}", "timolol", f"{conc}, 5mL", "S01ED01", "Antiglaucomatoso", route='oftálmico'))
    meds.append(med("Latanoprosta 0,005% Colírio", "latanoprosta", "0,005%, 2,5mL", "S01EE01", "Antiglaucomatoso", route='oftálmico'))
    meds.append(med("Brimonidina 0,2% Colírio", "brimonidina", "0,2%, 5mL", "S01EA05", "Antiglaucomatoso", route='oftálmico'))
    meds.append(med("Dorzolamida 2% Colírio", "dorzolamida", "2%, 5mL", "S01EC03", "Antiglaucomatoso", route='oftálmico'))
    meds.append(med("Travoprosta 0,004% Colírio", "travoprosta", "0,004%, 2,5mL", "S01EE04", "Antiglaucomatoso", route='oftálmico'))

    # ============================================================
    # RINITE (NÃO FP - Budesonida nasal removida, Mometasona removida)
    # ============================================================
    for dose in ["32mcg", "50mcg"]:
        meds.append(med(f"Budesonida Nasal {dose}", "budesonida", f"{dose}/dose, 120 doses", "R01AD05", "Corticosteroide nasal", route='nasal'))
    meds.append(med("Mometasona Nasal 50mcg", "mometasona", "50mcg/dose, 120 doses", "R01AD09", "Corticosteroide nasal", route='nasal'))
    meds.append(med("Fluticasona Nasal 50mcg", "fluticasona", "50mcg/dose, 120 doses", "R01AD08", "Corticosteroide nasal", route='nasal'))

    # ============================================================
    # INCONTINÊNCIA (NÃO FP - removidos)
    # ============================================================
    meds.append(med("Oxibutinina 5mg", "oxibutinina", "5mg, 30 comprimidos", "G04BD04", "Antiespasmódico urinário"))
    meds.append(med("Tolterodina 2mg", "tolterodina", "2mg, 30 comprimidos", "G04BD07", "Antiespasmódico urinário"))

    # ============================================================
    # OUTROS (NÃO FP - Fluconazol e Albendazol removidos)
    # ============================================================
    meds.append(med("Fluconazol 150mg", "fluconazol", "150mg, 2 cápsulas", "J02AC01", "Antifúngico"))
    meds.append(med("Albendazol 400mg", "albendazol", "400mg, 1 comprimido mastigável", "P02CA03", "Anti-helmíntico", rx=False))

    # ============================================================
    # ANTIBIÓTICOS (Não FP)
    # ============================================================
    for dose in ["500mg", "875mg"]:
        meds.append(med(f"Amoxicilina {dose}", "amoxicilina", f"{dose}, 21 cápsulas", "J01CA04", "Antibiótico"))
    meds.append(med("Amoxicilina + Clavulanato 500/125mg", "amoxicilina + clavulanato", "500/125mg, 21 comprimidos", "J01CR02", "Antibiótico"))
    meds.append(med("Amoxicilina + Clavulanato 875/125mg", "amoxicilina + clavulanato", "875/125mg, 14 comprimidos", "J01CR02", "Antibiótico"))
    meds.append(med("Azitromicina 500mg", "azitromicina", "500mg, 3 comprimidos", "J01FA10", "Antibiótico"))
    meds.append(med("Ciprofloxacino 500mg", "ciprofloxacino", "500mg, 14 comprimidos", "J01MA02", "Antibiótico"))
    meds.append(med("Cefalexina 500mg", "cefalexina", "500mg, 8 cápsulas", "J01DB01", "Antibiótico"))
    for dose in ["500mg", "750mg"]:
        meds.append(med(f"Levofloxacino {dose}", "levofloxacino", f"{dose}, 7 comprimidos", "J01MA12", "Antibiótico"))
    for dose in ["250mg", "400mg"]:
        meds.append(med(f"Metronidazol {dose}", "metronidazol", f"{dose}, 24 comprimidos", "J01XD01", "Antibiótico"))
    meds.append(med("Sulfametoxazol + Trimetoprima 800/160mg", "sulfametoxazol + trimetoprima", "800/160mg, 14 comprimidos", "J01EE01", "Antibiótico"))
    meds.append(med("Nitrofurantoína 100mg", "nitrofurantoína", "100mg, 14 cápsulas", "J01XE01", "Antibiótico"))
    for dose in ["250mg", "500mg"]:
        meds.append(med(f"Cefuroxima {dose}", "cefuroxima", f"{dose}, 10 comprimidos", "J01DC02", "Antibiótico"))
    meds.append(med("Claritromicina 500mg", "claritromicina", "500mg, 14 comprimidos", "J01FA09", "Antibiótico"))
    meds.append(med("Doxiciclina 100mg", "doxiciclina", "100mg, 15 comprimidos", "J01AA02", "Antibiótico"))
    meds.append(med("Clindamicina 300mg", "clindamicina", "300mg, 16 cápsulas", "J01FF01", "Antibiótico"))
    meds.append(med("Norfloxacino 400mg", "norfloxacino", "400mg, 14 comprimidos", "J01MA06", "Antibiótico"))
    meds.append(med("Penicilina Benzatina 1.200.000UI", "penicilina benzatina", "1.200.000UI, IM", "J01CE08", "Antibiótico", route='intramuscular'))
    meds.append(med("Cefalotina 1g", "cefalotina", "1g, IV", "J01DB03", "Antibiótico", route='intravenoso'))

    # ============================================================
    # ANTI-INFLAMATÓRIOS / ANALGÉSICOS (Não FP)
    # ============================================================
    for dose in ["400mg", "600mg"]:
        meds.append(med(f"Ibuprofeno {dose}", "ibuprofeno", f"{dose}, 20 comprimidos", "M01AE01", "Anti-inflamatório", rx=dose == "600mg"))
    meds.append(med("Diclofenaco 50mg", "diclofenaco", "50mg, 20 comprimidos", "M01AB05", "Anti-inflamatório"))
    meds.append(med("Diclofenaco 100mg", "diclofenaco", "100mg retard, 10 comprimidos", "M01AB05", "Anti-inflamatório"))
    meds.append(med("Nimesulida 100mg", "nimesulida", "100mg, 12 comprimidos", "M01AX17", "Anti-inflamatório"))
    for dose in ["7,5mg", "15mg"]:
        meds.append(med(f"Meloxicam {dose}", "meloxicam", f"{dose}, 10 comprimidos", "M01AC06", "Anti-inflamatório"))
    meds.append(med("Cetoprofeno 100mg", "cetoprofeno", "100mg, 20 comprimidos", "M01AE03", "Anti-inflamatório"))
    for dose in ["250mg", "500mg"]:
        meds.append(med(f"Naproxeno {dose}", "naproxeno", f"{dose}, 20 comprimidos", "M01AE02", "Anti-inflamatório"))
    meds.append(med("Celecoxibe 200mg", "celecoxibe", "200mg, 30 cápsulas", "M01AH01", "Anti-inflamatório"))
    meds.append(med("Piroxicam 20mg", "piroxicam", "20mg, 10 cápsulas", "M01AC01", "Anti-inflamatório"))
    for dose in ["500mg", "1g"]:
        meds.append(med(f"Dipirona {dose}", "dipirona", f"{dose}, 10 comprimidos", "N02BB02", "Analgésico", rx=False))
    meds.append(med("Dipirona Gotas 500mg/mL", "dipirona", "500mg/mL, 20mL gotas", "N02BB02", "Analgésico", rx=False))
    for dose in ["500mg", "750mg"]:
        meds.append(med(f"Paracetamol {dose}", "paracetamol", f"{dose}, 20 comprimidos", "N02BE01", "Analgésico", rx=False))
    meds.append(med("Paracetamol Gotas 200mg/mL", "paracetamol", "200mg/mL, 15mL gotas", "N02BE01", "Analgésico", rx=False))
    for dose in ["50mg", "100mg"]:
        meds.append(med(f"Tramadol {dose}", "tramadol", f"{dose}, 10 cápsulas", "N02AX02", "Analgésico opioide", ctrl="c1"))
    meds.append(med("Codeína 30mg", "codeína", "30mg, 10 comprimidos", "N02AA59", "Analgésico opioide", ctrl="b1"))
    meds.append(med("Codeína + Paracetamol 30/500mg", "codeína + paracetamol", "30/500mg, 12 comprimidos", "N02AA59", "Analgésico opioide", ctrl="b1"))

    # ============================================================
    # GASTROINTESTINAIS (Não FP)
    # ============================================================
    for dose in ["20mg", "40mg"]:
        meds.append(med(f"Omeprazol {dose}", "omeprazol", f"{dose}, 28 cápsulas", "A02BC01", "Gastroprotetor"))
    for dose in ["20mg", "40mg"]:
        meds.append(med(f"Pantoprazol {dose}", "pantoprazol", f"{dose}, 28 comprimidos", "A02BC02", "Gastroprotetor"))
    for dose in ["20mg", "40mg"]:
        meds.append(med(f"Esomeprazol {dose}", "esomeprazol", f"{dose}, 28 comprimidos", "A02BC05", "Gastroprotetor"))
    meds.append(med("Lansoprazol 30mg", "lansoprazol", "30mg, 28 cápsulas", "A02BC03", "Gastroprotetor"))
    for dose in ["150mg", "300mg"]:
        meds.append(med(f"Ranitidina {dose}", "ranitidina", f"{dose}, 20 comprimidos", "A02BA02", "Gastroprotetor"))
    meds.append(med("Domperidona 10mg", "domperidona", "10mg, 30 comprimidos", "A03FA03", "Procinético"))
    meds.append(med("Metoclopramida 10mg", "metoclopramida", "10mg, 20 comprimidos", "A03FA01", "Antiemético"))
    for dose in ["4mg", "8mg"]:
        meds.append(med(f"Ondansetrona {dose}", "ondansetrona", f"{dose}, 10 comprimidos", "A04AA01", "Antiemético"))
    meds.append(med("Loperamida 2mg", "loperamida", "2mg, 12 comprimidos", "A07DA03", "Antidiarreico", rx=False))
    meds.append(med("Simeticona 125mg", "simeticona", "125mg, 20 comprimidos", "A03AX13", "Antiflatulento", rx=False))
    meds.append(med("Lactulose 667mg/mL", "lactulose", "667mg/mL, 120mL", "A06AD11", "Laxante osmótico", rx=False))
    meds.append(med("Mesalazina 800mg", "mesalazina", "800mg, 30 comprimidos", "A07EC02", "Anti-inflamatório intestinal"))

    # ============================================================
    # HORMÔNIOS TIREOIDIANOS (Não FP)
    # ============================================================
    for dose in ["25mcg", "50mcg", "75mcg", "88mcg", "100mcg", "112mcg", "125mcg", "137mcg", "150mcg", "175mcg", "200mcg"]:
        meds.append(med(f"Levotiroxina {dose}", "levotiroxina", f"{dose}, 30 comprimidos", "H03AA01", "Hormônio tireoidiano"))
    meds.append(med("Propiltiouracil 100mg", "propiltiouracil", "100mg, 30 comprimidos", "H03BA02", "Antitireoidiano"))
    meds.append(med("Metimazol 10mg", "metimazol", "10mg, 30 comprimidos", "H03BB01", "Antitireoidiano"))

    # ============================================================
    # ANTI-HISTAMÍNICOS (Não FP)
    # ============================================================
    meds.append(med("Loratadina 10mg", "loratadina", "10mg, 12 comprimidos", "R06AX13", "Anti-histamínico", rx=False))
    meds.append(med("Desloratadina 5mg", "desloratadina", "5mg, 10 comprimidos", "R06AX27", "Anti-histamínico", rx=False))
    meds.append(med("Cetirizina 10mg", "cetirizina", "10mg, 10 comprimidos", "R06AE07", "Anti-histamínico", rx=False))
    for dose in ["120mg", "180mg"]:
        meds.append(med(f"Fexofenadina {dose}", "fexofenadina", f"{dose}, 10 comprimidos", "R06AX26", "Anti-histamínico", rx=False))
    meds.append(med("Hidroxizina 25mg", "hidroxizina", "25mg, 20 comprimidos", "N05BB01", "Anti-histamínico"))
    meds.append(med("Dexclorfeniramina 2mg", "dexclorfeniramina", "2mg, 20 comprimidos", "R06AB02", "Anti-histamínico", rx=False))
    meds.append(med("Prometazina 25mg", "prometazina", "25mg, 20 comprimidos", "R06AD02", "Anti-histamínico"))

    # ============================================================
    # CORTICOSTEROIDES SISTÊMICOS (Não FP)
    # ============================================================
    for dose in ["5mg", "20mg"]:
        meds.append(med(f"Prednisona {dose}", "prednisona", f"{dose}, 20 comprimidos", "H02AB07", "Corticosteroide"))
    meds.append(med("Prednisolona 3mg/mL", "prednisolona", "3mg/mL, 60mL solução", "H02AB06", "Corticosteroide"))
    for dose in ["0,5mg", "4mg"]:
        meds.append(med(f"Dexametasona {dose}", "dexametasona", f"{dose}, 10 comprimidos", "H02AB02", "Corticosteroide"))
    meds.append(med("Hidrocortisona 20mg", "hidrocortisona", "20mg, 30 comprimidos", "H02AB09", "Corticosteroide"))

    # ============================================================
    # PSICOESTIMULANTES (Controlados B1/B2)
    # ============================================================
    for dose in ["10mg", "18mg", "36mg", "54mg"]:
        meds.append(med(f"Metilfenidato {dose}", "metilfenidato", f"{dose}, 30 comprimidos", "N06BA04", "Psicoestimulante", ctrl="b2" if dose == "10mg" else "b1"))
    for dose in ["30mg", "50mg", "70mg"]:
        meds.append(med(f"Lisdexanfetamina {dose}", "lisdexanfetamina", f"{dose}, 28 cápsulas", "N06BA12", "Psicoestimulante", ctrl="b2"))

    # ============================================================
    # OUTROS - DIVERSOS (Não FP)
    # ============================================================
    meds.append(med("Digoxina 0,25mg", "digoxina", "0,25mg, 30 comprimidos", "C01AA05", "Cardiotônico"))
    meds.append(med("Amiodarona 200mg", "amiodarona", "200mg, 30 comprimidos", "C01BD01", "Antiarrítmico"))
    for dose in ["100mg", "300mg"]:
        meds.append(med(f"Alopurinol {dose}", "alopurinol", f"{dose}, 30 comprimidos", "M04AA01", "Antigotoso"))
    meds.append(med("Colchicina 0,5mg", "colchicina", "0,5mg, 30 comprimidos", "M04AC01", "Antigotoso"))
    for dose in ["50mg", "100mg"]:
        meds.append(med(f"Sildenafila {dose}", "sildenafila", f"{dose}, 4 comprimidos", "G04BE03", "Inibidor PDE5"))
    for dose in ["5mg", "20mg"]:
        meds.append(med(f"Tadalafila {dose}", "tadalafila", f"{dose}, 30 comprimidos", "G04BE08", "Inibidor PDE5"))
    meds.append(med("Nitrato de Isossorbida 5mg", "nitrato de isossorbida", "5mg SL, 30 comprimidos", "C01DA08", "Vasodilatador"))
    meds.append(med("Mononitrato de Isossorbida 20mg", "mononitrato de isossorbida", "20mg, 30 comprimidos", "C01DA14", "Vasodilatador"))
    for dose in ["5mg", "10mg"]:
        meds.append(med(f"Ciclobenzaprina {dose}", "ciclobenzaprina", f"{dose}, 15 comprimidos", "M03BX08", "Relaxante muscular"))
    meds.append(med("Tizanidina 2mg", "tizanidina", "2mg, 30 comprimidos", "M03BX02", "Relaxante muscular"))
    for dose in ["10mg", "20mg"]:
        meds.append(med(f"Isotretinoína {dose}", "isotretinoína", f"{dose}, 30 cápsulas", "D10BA01", "Retinoide", ctrl="c2"))
    for dose in ["1mg", "5mg"]:
        meds.append(med(f"Finasterida {dose}", "finasterida", f"{dose}, 30 comprimidos", "D11AX10", "Antiandrógeno"))
    for dose in ["2mg", "4mg"]:
        meds.append(med(f"Doxazosina {dose}", "doxazosina", f"{dose}, 30 comprimidos", "C02CA04", "Alfa-bloqueador"))
    meds.append(med("Tansulosina 0,4mg", "tansulosina", "0,4mg, 30 cápsulas", "G04CA02", "Alfa-bloqueador"))
    meds.append(med("Minoxidil 5% Tópico", "minoxidil", "5%, 60mL solução capilar", "D11AX01", "Vasodilatador tópico", rx=False, route='tópico'))
    meds.append(med("Aciclovir 200mg", "aciclovir", "200mg, 25 comprimidos", "J05AB01", "Antiviral"))
    meds.append(med("Ivermectina 6mg", "ivermectina", "6mg, 4 comprimidos", "P02CF01", "Antiparasitário"))
    meds.append(med("Metildopa 250mg Injetável", "metildopa", "250mg/5mL, ampola", "C02AB01", "Anti-hipertensivo", route='intravenoso'))

    # Derm / Tópicos
    meds.append(med("Cetoconazol 200mg", "cetoconazol", "200mg, 10 comprimidos", "J02AB02", "Antifúngico"))
    meds.append(med("Nistatina 100.000UI/mL", "nistatina", "100.000UI/mL, 50mL suspensão", "A07AA02", "Antifúngico", rx=False))

    return meds


def generate_interactions():
    ints = []

    # ============================================================
    # CONTRAINDICADAS
    # ============================================================
    ints.append(interaction("nitrato de isossorbida", "sildenafila", "contraindicated",
        "Risco de hipotensão grave e potencialmente fatal.",
        "Ambos causam vasodilatação via NO/GMPc. Efeito sinérgico pode causar colapso cardiovascular.",
        "NUNCA usar concomitantemente. Esperar 24h (sildenafila) ou 48h (tadalafila) após uso de nitrato."))
    ints.append(interaction("mononitrato de isossorbida", "sildenafila", "contraindicated",
        "Risco de hipotensão grave e potencialmente fatal.",
        "Ambos causam vasodilatação via NO/GMPc. Efeito sinérgico pode causar colapso cardiovascular.",
        "NUNCA usar concomitantemente. Esperar 24h após uso de nitrato."))
    ints.append(interaction("nitrato de isossorbida", "tadalafila", "contraindicated",
        "Risco de hipotensão grave e potencialmente fatal.",
        "Ambos causam vasodilatação via NO/GMPc. Tadalafila tem meia-vida longa (17,5h).",
        "NUNCA usar concomitantemente. Esperar no mínimo 48h."))
    ints.append(interaction("fluoxetina", "selegilina", "contraindicated",
        "Risco de síndrome serotoninérgica fatal.",
        "ISRS + IMAO = acúmulo massivo de serotonina no SNC.",
        "Contraindicação absoluta. Washout de 5 semanas (fluoxetina) ou 14 dias (IMAO) entre as trocas."))
    ints.append(interaction("sertralina", "selegilina", "contraindicated",
        "Risco de síndrome serotoninérgica fatal.",
        "ISRS + IMAO = acúmulo massivo de serotonina no SNC.",
        "Contraindicação absoluta. Washout de 14 dias entre as trocas."))
    ints.append(interaction("metotrexato", "sulfametoxazol + trimetoprima", "contraindicated",
        "Risco de supressão medular grave (pancitopenia).",
        "TMP inibe a diidrofolato redutase e potencializa a toxicidade do metotrexato.",
        "Evitar completamente. Se necessário antibiótico, usar alternativa."))
    ints.append(interaction("carbamazepina", "voriconazol", "contraindicated",
        "Falha terapêutica do antifúngico com risco de infecção descontrolada.",
        "Carbamazepina é potente indutor de CYP3A4, metabolizando quase todo o voriconazol.",
        "Usar antifúngico alternativo ou trocar anticonvulsivante."))
    ints.append(interaction("varfarina", "miconazol", "contraindicated",
        "Risco de sangramento grave.",
        "Miconazol inibe CYP2C9 e CYP3A4, aumentando drasticamente os níveis de varfarina.",
        "Evitar miconazol (inclusive tópico oral). Usar antifúngico alternativo."))
    ints.append(interaction("linezolida", "sertralina", "contraindicated",
        "Risco de síndrome serotoninérgica.",
        "Linezolida é IMAO reversível não-seletivo. ISRS + IMAO = excesso de serotonina.",
        "Suspender ISRS 24h antes de iniciar linezolida. Reiniciar 24h após última dose."))
    ints.append(interaction("ergotamina", "claritromicina", "contraindicated",
        "Risco de ergotismo (vasoespasmo periférico grave, gangrena).",
        "Claritromicina inibe CYP3A4, aumentando níveis plasmáticos de ergotamina.",
        "Contraindicação absoluta. Usar alternativa para enxaqueca ou antibiótico."))

    # ============================================================
    # GRAVES
    # ============================================================
    ints.append(interaction("losartana", "captopril", "severe",
        "Aumento do risco de hipercalemia, hipotensão e insuficiência renal.",
        "Duplo bloqueio do SRAA (BRA + IECA) sem benefício adicional comprovado.",
        "Evitar combinação. Usar apenas um bloqueador do SRAA. Monitorar potássio e creatinina se inevitável.",
        "DrugBank"))
    ints.append(interaction("losartana", "enalapril", "severe",
        "Aumento do risco de hipercalemia, hipotensão e insuficiência renal.",
        "Duplo bloqueio do SRAA (BRA + IECA) sem benefício adicional comprovado.",
        "Evitar combinação. Usar apenas um bloqueador do SRAA."))
    ints.append(interaction("losartana", "espironolactona", "severe",
        "Risco significativo de hipercalemia.",
        "BRA retém potássio + espironolactona é diurético poupador de potássio.",
        "Se necessário, monitorar potássio sérico rigorosamente (semanal no início). Evitar suplementos de K+.",
        "DrugBank"))
    ints.append(interaction("enalapril", "espironolactona", "severe",
        "Risco significativo de hipercalemia.",
        "IECA retém potássio + espironolactona é diurético poupador de potássio.",
        "Se necessário (ex: IC), monitorar potássio sérico rigorosamente. Iniciar espironolactona em dose baixa."))
    ints.append(interaction("digoxina", "amiodarona", "severe",
        "Risco de toxicidade digitálica (arritmias, náusea, distúrbios visuais).",
        "Amiodarona inibe P-gp e CYP3A4, dobrando os níveis séricos de digoxina.",
        "Reduzir dose de digoxina em 50% ao iniciar amiodarona. Monitorar digoxinemia."))
    ints.append(interaction("varfarina", "amiodarona", "severe",
        "Risco aumentado de sangramento.",
        "Amiodarona inibe CYP2C9 e CYP1A2, reduzindo o metabolismo da varfarina.",
        "Reduzir dose de varfarina em 30-50%. Monitorar INR semanalmente por 6-8 semanas."))
    ints.append(interaction("varfarina", "fluconazol", "severe",
        "Risco aumentado de sangramento.",
        "Fluconazol inibe CYP2C9, principal via de metabolismo da S-varfarina.",
        "Reduzir dose de varfarina. Monitorar INR a cada 2-3 dias durante uso concomitante."))
    ints.append(interaction("varfarina", "metronidazol", "severe",
        "Risco aumentado de sangramento.",
        "Metronidazol inibe CYP2C9, reduzindo metabolismo da varfarina.",
        "Monitorar INR. Considerar redução de 25-50% da dose de varfarina."))
    ints.append(interaction("metotrexato", "ibuprofeno", "severe",
        "Risco de toxicidade por metotrexato (mielossupressão, mucosite, nefrotoxicidade).",
        "AINEs reduzem clearance renal do metotrexato e competem pela ligação proteica.",
        "Evitar AINEs em pacientes com metotrexato em dose alta. Usar paracetamol como alternativa."))
    ints.append(interaction("metotrexato", "diclofenaco", "severe",
        "Risco de toxicidade por metotrexato.",
        "AINEs reduzem clearance renal do metotrexato.",
        "Evitar AINEs. Usar paracetamol se necessário analgesia."))
    ints.append(interaction("carbonato de lítio", "ibuprofeno", "severe",
        "Aumento dos níveis séricos de lítio com risco de toxicidade (tremores, confusão, arritmias).",
        "AINEs reduzem excreção renal de lítio em 15-25%.",
        "Evitar AINEs. Se necessário, monitorar litemia semanalmente. Preferir paracetamol."))
    ints.append(interaction("carbonato de lítio", "furosemida", "severe",
        "Aumento dos níveis de lítio por depleção de sódio.",
        "Diuréticos de alça causam perda de sódio, levando a reabsorção compensatória de lítio nos túbulos renais.",
        "Monitorar litemia ao iniciar/ajustar diurético. Manter hidratação adequada."))
    ints.append(interaction("carbonato de lítio", "hidroclorotiazida", "severe",
        "Aumento dos níveis de lítio por depleção de sódio.",
        "Tiazídicos reduzem excreção renal de lítio em 25-40%.",
        "Se necessário, reduzir dose de lítio em 25-50%. Monitorar litemia."))
    ints.append(interaction("carbamazepina", "eritromicina", "severe",
        "Toxicidade por carbamazepina (ataxia, diplopia, nistagmo).",
        "Eritromicina inibe CYP3A4, aumentando níveis de carbamazepina.",
        "Usar macrolídeo alternativo (azitromicina tem menor interação)."))
    ints.append(interaction("carbamazepina", "claritromicina", "severe",
        "Toxicidade por carbamazepina.",
        "Claritromicina inibe fortemente CYP3A4.",
        "Usar azitromicina como alternativa. Se inevitável, monitorar níveis de carbamazepina."))
    ints.append(interaction("fluoxetina", "tramadol", "severe",
        "Risco de síndrome serotoninérgica e convulsões.",
        "Fluoxetina inibe CYP2D6 (reduz eficácia analgésica) e ambos aumentam serotonina.",
        "Evitar combinação. Usar analgésico não-opioide ou opioide sem ação serotoninérgica."))
    ints.append(interaction("sertralina", "tramadol", "severe",
        "Risco de síndrome serotoninérgica.",
        "Ambos aumentam serotonina no SNC. ISRS inibe CYP2D6.",
        "Se necessário, usar dose baixa e monitorar. Preferir analgésico alternativo."))
    ints.append(interaction("clopidogrel", "omeprazol", "severe",
        "Redução da eficácia antiplaquetária do clopidogrel.",
        "Omeprazol inibe CYP2C19, enzima necessária para ativar o pró-fármaco clopidogrel.",
        "Usar pantoprazol (menor inibição de CYP2C19) ou rabeprazol como alternativa."))
    ints.append(interaction("digoxina", "verapamil", "severe",
        "Risco de toxicidade digitálica e bradiarritmias.",
        "Verapamil inibe P-gp (aumenta absorção de digoxina) e ambos reduzem condução AV.",
        "Reduzir digoxina em 33-50%. Monitorar digoxinemia e ECG."))
    ints.append(interaction("atenolol", "verapamil", "severe",
        "Risco de bradicardia severa, bloqueio AV e insuficiência cardíaca.",
        "Ambos deprimem condução AV e contratilidade miocárdica.",
        "Evitar combinação. Se necessário, usar com extrema cautela e monitorização contínua."))
    ints.append(interaction("propranolol", "verapamil", "severe",
        "Risco de bradicardia severa, bloqueio AV e IC descompensada.",
        "Efeito aditivo depressor sobre condução AV e inotropismo.",
        "Contraindicado IV. Oral: apenas se absolutamente necessário com monitorização."))
    ints.append(interaction("clonazepam", "álcool etílico", "severe",
        "Depressão respiratória e do SNC potencialmente fatal.",
        "Efeito sinérgico GABA-A. Ambos são depressores do SNC.",
        "Orientar paciente a evitar álcool completamente durante tratamento."))
    ints.append(interaction("metformina", "contraste iodado", "severe",
        "Risco de acidose láctica.",
        "Contraste pode causar nefropatia, reduzindo clearance de metformina e acúmulo de lactato.",
        "Suspender metformina 48h antes do contraste. Reiniciar após verificar função renal."))
    ints.append(interaction("espironolactona", "cloreto de potássio", "severe",
        "Risco de hipercalemia grave (arritmias cardíacas).",
        "Espironolactona retém potássio. Suplemento adiciona mais potássio.",
        "Evitar suplementação de K+. Monitorar potássio sérico."))
    ints.append(interaction("fluoxetina", "clorpromazina", "severe",
        "Risco de prolongamento QT e arritmias.",
        "Fluoxetina inibe CYP2D6, aumentando níveis de clorpromazina. Ambos prolongam QT.",
        "Monitorar ECG. Considerar antipsicótico com menor efeito no QT."))
    ints.append(interaction("ciprofloxacino", "tizanidina", "severe",
        "Toxicidade por tizanidina (hipotensão, sedação, bradicardia).",
        "Ciprofloxacino inibe fortemente CYP1A2, aumentando AUC da tizanidina em 10x.",
        "Contraindicação. Usar outro antibiótico ou suspender tizanidina."))
    ints.append(interaction("sinvastatina", "claritromicina", "severe",
        "Risco de rabdomiólise.",
        "Claritromicina inibe CYP3A4, aumentando níveis de sinvastatina até 10x.",
        "Suspender sinvastatina durante tratamento com claritromicina. Usar azitromicina como alternativa."))
    ints.append(interaction("atorvastatina", "claritromicina", "severe",
        "Risco de miopatia e rabdomiólise.",
        "Claritromicina inibe CYP3A4, aumentando exposição à atorvastatina.",
        "Limitar atorvastatina a 20mg/dia ou usar azitromicina."))

    # ============================================================
    # MODERADAS
    # ============================================================
    ints.append(interaction("losartana", "ibuprofeno", "moderate",
        "Redução do efeito anti-hipertensivo e risco renal.",
        "AINEs antagonizam o efeito hipotensor via inibição de prostaglandinas renais.",
        "Monitorar PA e função renal. Uso curto (<5 dias) geralmente tolerado."))
    ints.append(interaction("losartana", "diclofenaco", "moderate",
        "Redução do efeito anti-hipertensivo.",
        "AINEs inibem prostaglandinas vasodilatadoras renais.",
        "Monitorar PA. Preferir paracetamol para dor."))
    ints.append(interaction("enalapril", "ibuprofeno", "moderate",
        "Redução do efeito anti-hipertensivo e risco de IRA.",
        "Tríplice whammy (IECA + AINE + diurético) = alto risco renal.",
        "Evitar uso prolongado de AINE. Monitorar creatinina e potássio."))
    ints.append(interaction("enalapril", "diclofenaco", "moderate",
        "Redução do efeito anti-hipertensivo.",
        "AINEs antagonizam efeito de IECA via prostaglandinas.",
        "Uso breve tolerado. Monitorar PA e função renal."))
    ints.append(interaction("atenolol", "anlodipino", "moderate",
        "Risco de bradicardia e hipotensão.",
        "Efeito aditivo sobre frequência cardíaca e pressão arterial.",
        "Combinação frequentemente usada, mas iniciar com doses baixas. Monitorar FC."))
    ints.append(interaction("propranolol", "insulina nph", "moderate",
        "Mascaramento de sintomas de hipoglicemia e prolongamento da recuperação.",
        "Beta-bloqueadores mascaram taquicardia e tremores da hipoglicemia.",
        "Orientar paciente a monitorar glicemia frequentemente. Reconhecer sinais como sudorese."))
    ints.append(interaction("propranolol", "insulina regular", "moderate",
        "Mascaramento de sintomas de hipoglicemia.",
        "Beta-bloqueadores mascaram taquicardia da hipoglicemia.",
        "Monitorar glicemia. Preferir beta-bloqueadores cardiosseletivos (bisoprolol)."))
    ints.append(interaction("metformina", "furosemida", "moderate",
        "Aumento do risco de acidose láctica.",
        "Furosemida pode causar desidratação e redução da função renal, acumulando metformina.",
        "Manter hidratação adequada. Monitorar função renal. Ajustar dose se TFG reduzir."))
    ints.append(interaction("sinvastatina", "anlodipino", "moderate",
        "Aumento do risco de miopatia.",
        "Anlodipino inibe levemente CYP3A4, aumentando níveis de sinvastatina.",
        "Limitar sinvastatina a 20mg/dia quando combinada com anlodipino."))
    ints.append(interaction("sinvastatina", "fenofibrato", "moderate",
        "Aumento do risco de miopatia e rabdomiólise.",
        "Fibratos aumentam risco muscular independentemente das estatinas.",
        "Se necessário, preferir fenofibrato (menor risco que genfibrozila). Monitorar CK."))
    ints.append(interaction("sinvastatina", "amiodarona", "moderate",
        "Aumento do risco de miopatia.",
        "Amiodarona inibe CYP3A4, aumentando níveis de sinvastatina.",
        "Limitar sinvastatina a 20mg/dia."))
    ints.append(interaction("varfarina", "paracetamol", "moderate",
        "Aumento leve do INR com uso prolongado.",
        "Paracetamol em doses >2g/dia pode interferir no metabolismo da varfarina.",
        "Uso ocasional é seguro. Em doses >2g/dia por >3 dias, monitorar INR.", "DrugBank", "probable"))
    ints.append(interaction("varfarina", "ácido acetilsalicílico", "moderate",
        "Aumento do risco de sangramento.",
        "AAS inibe plaquetas + varfarina inibe coagulação = dupla antitrombose.",
        "Combinação pode ser indicada em próteses valvares. Monitorar INR e sinais de sangramento."))
    ints.append(interaction("levotiroxina", "carbonato de cálcio + colecalciferol", "moderate",
        "Redução da absorção de levotiroxina.",
        "Cálcio quelado levotiroxina no TGI, reduzindo absorção em até 25%.",
        "Separar administração por pelo menos 4 horas. Tomar levotiroxina em jejum."))
    ints.append(interaction("levotiroxina", "omeprazol", "moderate",
        "Possível redução da absorção de levotiroxina.",
        "IBPs reduzem acidez gástrica necessária para dissolução de levotiroxina.",
        "Monitorar TSH ao iniciar/suspender IBP. Ajustar dose se necessário.", "DrugBank", "probable"))
    ints.append(interaction("levotiroxina", "sulfato ferroso", "moderate",
        "Redução da absorção de levotiroxina.",
        "Ferro forma complexo insolúvel com levotiroxina no TGI.",
        "Separar administração por pelo menos 4 horas."))
    ints.append(interaction("fluoxetina", "clonazepam", "moderate",
        "Aumento dos níveis de clonazepam e sedação.",
        "Fluoxetina inibe CYP3A4, reduzindo metabolismo de clonazepam.",
        "Monitorar sedação. Pode ser necessário reduzir dose de clonazepam."))
    ints.append(interaction("fluoxetina", "risperidona", "moderate",
        "Aumento dos níveis de risperidona com risco de efeitos extrapiramidais.",
        "Fluoxetina inibe CYP2D6, principal via de metabolismo da risperidona.",
        "Monitorar sintomas extrapiramidais. Considerar redução de dose da risperidona."))
    ints.append(interaction("carbamazepina", "etinilestradiol + levonorgestrel", "moderate",
        "Falha contraceptiva.",
        "Carbamazepina induz CYP3A4, acelerando metabolismo dos contraceptivos orais.",
        "Usar método contraceptivo adicional (barreira). Considerar DIU ou injetável trimestral."))
    ints.append(interaction("omeprazol", "clopidogrel", "moderate",
        "Redução da ativação do clopidogrel.",
        "Omeprazol inibe CYP2C19 mais que outros IBPs.",
        "Preferir pantoprazol. Se omeprazol necessário, considerar ticagrelor."))
    ints.append(interaction("ciprofloxacino", "carbonato de cálcio + colecalciferol", "moderate",
        "Redução da absorção do ciprofloxacino.",
        "Cátions divalentes (Ca2+) quelam quinolonas no TGI.",
        "Separar administração por pelo menos 2 horas."))
    ints.append(interaction("ciprofloxacino", "sulfato ferroso", "moderate",
        "Redução da absorção do ciprofloxacino.",
        "Ferro quelado quinolona no TGI, formando complexo insolúvel.",
        "Separar administração por pelo menos 2 horas."))
    ints.append(interaction("metoclopramida", "haloperidol", "moderate",
        "Risco aumentado de efeitos extrapiramidais.",
        "Ambos são antagonistas dopaminérgicos - efeito aditivo.",
        "Evitar combinação. Se necessário antiemético, usar ondansetrona."))
    ints.append(interaction("metformina", "liraglutida", "moderate",
        "Aumento do risco de hipoglicemia quando combinados com sulfonilureia.",
        "Efeito aditivo na redução de glicemia.",
        "Ajustar dose de sulfonilureia se prescrita. Combinação metformina+GLP1 é segura.", "DrugBank", "probable"))
    ints.append(interaction("furosemida", "digoxina", "moderate",
        "Risco de toxicidade digitálica por hipocalemia.",
        "Furosemida depleta potássio, aumentando sensibilidade à digoxina.",
        "Monitorar potássio sérico e digoxinemia. Suplementar K+ se necessário."))
    ints.append(interaction("glibenclamida", "propranolol", "moderate",
        "Mascaramento de hipoglicemia e possível potencialização.",
        "Beta-bloqueadores mascaram sinais adrenérgicos e podem reduzir glicogenólise.",
        "Preferir beta-bloqueadores cardiosseletivos. Monitorar glicemia."))
    ints.append(interaction("hidroclorotiazida", "carbonato de lítio", "moderate",
        "Aumento dos níveis de lítio.",
        "Tiazídicos reduzem excreção renal de lítio.",
        "Monitorar litemia ao iniciar/ajustar dose. Considerar redução do lítio."))
    ints.append(interaction("dexametasona", "ibuprofeno", "moderate",
        "Aumento do risco de úlcera gástrica e sangramento.",
        "Efeito aditivo na lesão da mucosa gástrica.",
        "Usar gastroprotetor (IBP). Evitar combinação prolongada."))
    ints.append(interaction("prednisona", "ibuprofeno", "moderate",
        "Aumento do risco de úlcera gástrica.",
        "Corticosteroides + AINEs = risco aditivo de lesão gastrointestinal.",
        "Associar IBP se uso prolongado necessário."))
    ints.append(interaction("ácido acetilsalicílico", "ibuprofeno", "moderate",
        "Redução do efeito cardioprotetor do AAS.",
        "Ibuprofeno compete pelo sítio COX-1, bloqueando a acetilação irreversível pelo AAS.",
        "Tomar AAS 30min antes do ibuprofeno. Ou usar outro AINE (diclofenaco não interfere)."))
    ints.append(interaction("rivaroxabana", "ácido acetilsalicílico", "moderate",
        "Aumento do risco de sangramento.",
        "Dupla antitrombose: anticoagulante + antiplaquetário.",
        "Combinação pode ser indicada pós-SCA. Avaliar risco/benefício. Monitorar sangramento."))
    ints.append(interaction("amiodarona", "levotiroxina", "moderate",
        "Alteração da função tireoidiana.",
        "Amiodarona contém 37% de iodo e inibe conversão periférica de T4 em T3.",
        "Monitorar TSH a cada 3-6 meses durante uso de amiodarona."))
    ints.append(interaction("quetiapina", "carbamazepina", "moderate",
        "Redução dos níveis de quetiapina.",
        "Carbamazepina induz CYP3A4, acelerando metabolismo da quetiapina.",
        "Pode necessitar aumento da dose de quetiapina. Monitorar resposta clínica."))
    ints.append(interaction("risperidona", "carbamazepina", "moderate",
        "Redução dos níveis de risperidona.",
        "Carbamazepina induz CYP3A4 e P-gp.",
        "Pode necessitar aumento da dose de risperidona. Monitorar resposta clínica."))

    # ============================================================
    # LEVES
    # ============================================================
    ints.append(interaction("omeprazol", "carbonato de cálcio + colecalciferol", "mild",
        "Possível redução da absorção de cálcio.",
        "IBPs reduzem acidez gástrica necessária para absorção de cálcio.",
        "Preferir citrato de cálcio (não depende de acidez). Suplementar vitamina D.", "DrugBank", "probable"))
    ints.append(interaction("metformina", "omeprazol", "mild",
        "Possível redução da absorção de vitamina B12.",
        "Ambos reduzem absorção de B12 por mecanismos diferentes.",
        "Monitorar B12 anualmente em uso crônico de ambos.", "DrugBank", "theoretical"))
    ints.append(interaction("losartana", "paracetamol", "mild",
        "Interação mínima em uso ocasional.",
        "Paracetamol tem mínimo efeito sobre prostaglandinas renais.",
        "Preferir paracetamol sobre AINEs para pacientes hipertensos. Seguro em doses terapêuticas."))
    ints.append(interaction("anlodipino", "omeprazol", "mild",
        "Leve aumento dos níveis de anlodipino.",
        "Omeprazol inibe levemente CYP3A4.",
        "Geralmente sem significância clínica. Monitorar PA.", "DrugBank", "probable"))
    ints.append(interaction("sinvastatina", "verapamil", "mild",
        "Leve aumento do risco de miopatia.",
        "Verapamil inibe levemente CYP3A4.",
        "Limitar sinvastatina a 20mg/dia. Monitorar sintomas musculares."))
    ints.append(interaction("dipirona", "captopril", "mild",
        "Possível redução leve do efeito anti-hipertensivo.",
        "Dipirona pode ter leve efeito anti-prostaglandina.",
        "Uso ocasional seguro. Em uso crônico, monitorar PA.", "DrugBank", "probable"))
    ints.append(interaction("paracetamol", "propranolol", "mild",
        "Leve aumento dos níveis de paracetamol.",
        "Propranolol reduz fluxo hepático, diminuindo metabolismo de primeira passagem.",
        "Sem significância clínica em doses terapêuticas.", "DrugBank", "probable"))
    ints.append(interaction("loratadina", "cetirizina", "mild",
        "Efeito sedativo aditivo leve.",
        "Ambos são anti-histamínicos H1. Cetirizina tem mais sedação que loratadina.",
        "Evitar combinação (sem benefício). Usar apenas um anti-histamínico."))

    return ints


if __name__ == "__main__":
    meds = generate_medications()
    interactions = generate_interactions()

    # Deduplicate medications by (name, active_principle)
    seen = set()
    unique_meds = []
    for m in meds:
        key = (m["name"].lower(), m["active_principle"].lower())
        if key not in seen:
            seen.add(key)
            unique_meds.append(m)

    # Deduplicate interactions by (a, b)
    seen_pairs = set()
    unique_ints = []
    for i in interactions:
        key = (i["active_principle_a"], i["active_principle_b"])
        if key not in seen_pairs:
            seen_pairs.add(key)
            unique_ints.append(i)

    os.makedirs(DATA_DIR, exist_ok=True)

    with open(os.path.join(DATA_DIR, "medications.json"), "w", encoding="utf-8") as f:
        json.dump(unique_meds, f, ensure_ascii=False, indent=2)
    print(f"Generated {len(unique_meds)} medications")
    fp_count = sum(1 for m in unique_meds if m["farmacia_popular"])
    fp_free = sum(1 for m in unique_meds if m["farmacia_popular"] and m.get("farmacia_popular_copay") == 0)
    print(f"  Farmácia Popular: {fp_count} ({fp_free} gratuitos, {fp_count - fp_free} com copagamento)")

    with open(os.path.join(DATA_DIR, "drug_interactions.json"), "w", encoding="utf-8") as f:
        json.dump(unique_ints, f, ensure_ascii=False, indent=2)
    print(f"Generated {len(unique_ints)} drug interactions")
    for sev in ["contraindicated", "severe", "moderate", "mild"]:
        count = sum(1 for i in unique_ints if i["severity"] == sev)
        print(f"  {sev}: {count}")

