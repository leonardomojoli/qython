# qython/backend/i18n/pharma_translations.py
"""
Pharmaceutical translation dictionaries for medication i18n.
Translates medication names, therapeutic classes, administration routes,
dosage forms, and presentation terms from PT-BR to EN/ES.
"""

import re
from typing import Optional


# ─── Dosage Forms (appear in medication names and presentations) ───

DOSAGE_FORMS: dict[str, dict[str, str]] = {
    "comprimido": {"en": "tablet", "es": "comprimido"},
    "comprimidos": {"en": "tablets", "es": "comprimidos"},
    "comprimido revestido": {"en": "coated tablet", "es": "comprimido recubierto"},
    "comprimido dispersível": {"en": "dispersible tablet", "es": "comprimido dispersable"},
    "comprimido mastigável": {"en": "chewable tablet", "es": "comprimido masticable"},
    "comprimido sublingual": {"en": "sublingual tablet", "es": "comprimido sublingual"},
    "comprimido efervescente": {"en": "effervescent tablet", "es": "comprimido efervescente"},
    "comprimido de liberação prolongada": {"en": "extended-release tablet", "es": "comprimido de liberación prolongada"},
    "comprimido de liberação controlada": {"en": "controlled-release tablet", "es": "comprimido de liberación controlada"},
    "comprimido de liberação retardada": {"en": "delayed-release tablet", "es": "comprimido de liberación retardada"},
    "cápsula": {"en": "capsule", "es": "cápsula"},
    "cápsulas": {"en": "capsules", "es": "cápsulas"},
    "cápsula dura": {"en": "hard capsule", "es": "cápsula dura"},
    "cápsula mole": {"en": "soft capsule", "es": "cápsula blanda"},
    "cápsula de liberação prolongada": {"en": "extended-release capsule", "es": "cápsula de liberación prolongada"},
    "xarope": {"en": "syrup", "es": "jarabe"},
    "solução oral": {"en": "oral solution", "es": "solución oral"},
    "solução": {"en": "solution", "es": "solución"},
    "solução injetável": {"en": "injectable solution", "es": "solución inyectable"},
    "solução oftálmica": {"en": "ophthalmic solution", "es": "solución oftálmica"},
    "solução nasal": {"en": "nasal solution", "es": "solución nasal"},
    "solução otológica": {"en": "otic solution", "es": "solución ótica"},
    "suspensão oral": {"en": "oral suspension", "es": "suspensión oral"},
    "suspensão": {"en": "suspension", "es": "suspensión"},
    "suspensão injetável": {"en": "injectable suspension", "es": "suspensión inyectable"},
    "gotas": {"en": "drops", "es": "gotas"},
    "gotas oftálmicas": {"en": "eye drops", "es": "gotas oftálmicas"},
    "gotas nasais": {"en": "nasal drops", "es": "gotas nasales"},
    "gotas otológicas": {"en": "otic drops", "es": "gotas óticas"},
    "colírio": {"en": "eye drops", "es": "colirio"},
    "pomada": {"en": "ointment", "es": "pomada"},
    "pomada oftálmica": {"en": "ophthalmic ointment", "es": "pomada oftálmica"},
    "creme": {"en": "cream", "es": "crema"},
    "creme vaginal": {"en": "vaginal cream", "es": "crema vaginal"},
    "gel": {"en": "gel", "es": "gel"},
    "gel oral": {"en": "oral gel", "es": "gel oral"},
    "loção": {"en": "lotion", "es": "loción"},
    "spray": {"en": "spray", "es": "spray"},
    "spray nasal": {"en": "nasal spray", "es": "spray nasal"},
    "aerossol": {"en": "aerosol", "es": "aerosol"},
    "inalador": {"en": "inhaler", "es": "inhalador"},
    "pó para inalação": {"en": "inhalation powder", "es": "polvo para inhalación"},
    "pó para solução oral": {"en": "powder for oral solution", "es": "polvo para solución oral"},
    "pó para suspensão oral": {"en": "powder for oral suspension", "es": "polvo para suspensión oral"},
    "pó para solução injetável": {"en": "powder for injectable solution", "es": "polvo para solución inyectable"},
    "injetável": {"en": "injectable", "es": "inyectable"},
    "injeção": {"en": "injection", "es": "inyección"},
    "sachê": {"en": "sachet", "es": "sobre"},
    "sachês": {"en": "sachets", "es": "sobres"},
    "envelope": {"en": "sachet", "es": "sobre"},
    "envelopes": {"en": "sachets", "es": "sobres"},
    "supositório": {"en": "suppository", "es": "supositorio"},
    "supositório retal": {"en": "rectal suppository", "es": "supositorio rectal"},
    "óvulo vaginal": {"en": "vaginal ovule", "es": "óvulo vaginal"},
    "adesivo": {"en": "patch", "es": "parche"},
    "adesivo transdérmico": {"en": "transdermal patch", "es": "parche transdérmico"},
    "implante": {"en": "implant", "es": "implante"},
    "dispositivo intrauterino": {"en": "intrauterine device", "es": "dispositivo intrauterino"},
    "DIU": {"en": "IUD", "es": "DIU"},
    "caneta": {"en": "pen", "es": "pluma"},
    "caneta preenchida": {"en": "prefilled pen", "es": "pluma precargada"},
    "seringa preenchida": {"en": "prefilled syringe", "es": "jeringa precargada"},
    "drágea": {"en": "dragee", "es": "gragea"},
    "drágeas": {"en": "dragees", "es": "grageas"},
    "pastilha": {"en": "lozenge", "es": "pastilla"},
    "granulado": {"en": "granules", "es": "granulado"},
    "emulsão": {"en": "emulsion", "es": "emulsión"},
    "elixir": {"en": "elixir", "es": "elixir"},
    "tintura": {"en": "tincture", "es": "tintura"},
    "shampoo": {"en": "shampoo", "es": "champú"},
    "xampu": {"en": "shampoo", "es": "champú"},
}

# ─── Presentation / Packaging Terms ───

PRESENTATION_TERMS: dict[str, dict[str, str]] = {
    "frasco": {"en": "bottle", "es": "frasco"},
    "frascos": {"en": "bottles", "es": "frascos"},
    "frasco-ampola": {"en": "vial", "es": "frasco-ampolla"},
    "bisnaga": {"en": "tube", "es": "tubo"},
    "bisnagas": {"en": "tubes", "es": "tubos"},
    "ampola": {"en": "ampoule", "es": "ampolla"},
    "ampolas": {"en": "ampoules", "es": "ampollas"},
    "seringa": {"en": "syringe", "es": "jeringa"},
    "seringas": {"en": "syringes", "es": "jeringas"},
    "blister": {"en": "blister", "es": "blíster"},
    "cartela": {"en": "blister pack", "es": "blíster"},
    "caixa": {"en": "box", "es": "caja"},
    "tubo": {"en": "tube", "es": "tubo"},
    "tubos": {"en": "tubes", "es": "tubos"},
    "bolsa": {"en": "bag", "es": "bolsa"},
    "refil": {"en": "refill", "es": "recarga"},
    "dispositivo": {"en": "device", "es": "dispositivo"},
    "unidade": {"en": "unit", "es": "unidad"},
    "unidades": {"en": "units", "es": "unidades"},
    "dose": {"en": "dose", "es": "dosis"},
    "doses": {"en": "doses", "es": "dosis"},
    "aplicação": {"en": "application", "es": "aplicación"},
    "aplicações": {"en": "applications", "es": "aplicaciones"},
}

# ─── Administration Routes ───

ADMIN_ROUTES: dict[str, dict[str, str]] = {
    "oral": {"en": "oral", "es": "oral"},
    "tópica": {"en": "topical", "es": "tópica"},
    "tópico": {"en": "topical", "es": "tópico"},
    "nasal": {"en": "nasal", "es": "nasal"},
    "oftálmica": {"en": "ophthalmic", "es": "oftálmica"},
    "oftálmico": {"en": "ophthalmic", "es": "oftálmico"},
    "otológica": {"en": "otic", "es": "ótica"},
    "retal": {"en": "rectal", "es": "rectal"},
    "vaginal": {"en": "vaginal", "es": "vaginal"},
    "sublingual": {"en": "sublingual", "es": "sublingual"},
    "inalatória": {"en": "inhalation", "es": "inhalatoria"},
    "inalatório": {"en": "inhalation", "es": "inhalatorio"},
    "injetável": {"en": "injectable", "es": "inyectable"},
    "intravenosa": {"en": "intravenous", "es": "intravenosa"},
    "intravenoso": {"en": "intravenous", "es": "intravenoso"},
    "intramuscular": {"en": "intramuscular", "es": "intramuscular"},
    "subcutânea": {"en": "subcutaneous", "es": "subcutánea"},
    "subcutâneo": {"en": "subcutaneous", "es": "subcutáneo"},
    "subcutánea": {"en": "subcutaneous", "es": "subcutánea"},
    "intradérmica": {"en": "intradermal", "es": "intradérmica"},
    "intrauterino": {"en": "intrauterine", "es": "intrauterino"},
    "oral / tópica": {"en": "oral / topical", "es": "oral / tópica"},
    "IV": {"en": "IV", "es": "IV"},
    "IV/IM": {"en": "IV/IM", "es": "IV/IM"},
    "IV/IM/IT": {"en": "IV/IM/IT", "es": "IV/IM/IT"},
    "IV/SC": {"en": "IV/SC", "es": "IV/SC"},
    "SC": {"en": "SC", "es": "SC"},
    "SC/IM": {"en": "SC/IM", "es": "SC/IM"},
    "SC/IV": {"en": "SC/IV", "es": "SC/IV"},
}

# ─── Therapeutic Classes (all 301) ───

THERAPEUTIC_CLASSES: dict[str, dict[str, str]] = {
    "Administração": {"en": "Administration", "es": "Administración"},
    "Adsorvente / Antídoto": {"en": "Adsorbent / Antidote", "es": "Adsorbente / Antídoto"},
    "Agonista beta-3 adrenérgico": {"en": "Beta-3 adrenergic agonist", "es": "Agonista beta-3 adrenérgico"},
    "Agonista beta-3 urinário": {"en": "Beta-3 urinary agonist", "es": "Agonista beta-3 urinario"},
    "Agonista do receptor de trombopoietina": {"en": "Thrombopoietin receptor agonist", "es": "Agonista del receptor de trombopoyetina"},
    "Agonista dopaminérgico": {"en": "Dopaminergic agonist", "es": "Agonista dopaminérgico"},
    "Alfa-bloqueador": {"en": "Alpha-blocker", "es": "Alfa-bloqueador"},
    "Alfa-bloqueador + inibidor 5-alfa redutase": {"en": "Alpha-blocker + 5-alpha reductase inhibitor", "es": "Alfa-bloqueador + inhibidor 5-alfa reductasa"},
    "Alfa-bloqueador prostático": {"en": "Prostatic alpha-blocker", "es": "Alfa-bloqueador prostático"},
    "Analgésico": {"en": "Analgesic", "es": "Analgésico"},
    "Analgésico + antiespasmódico": {"en": "Analgesic + antispasmodic", "es": "Analgésico + antiespasmódico"},
    "Analgésico / Antitérmico": {"en": "Analgesic / Antipyretic", "es": "Analgésico / Antipirético"},
    "Analgésico opioide": {"en": "Opioid analgesic", "es": "Analgésico opioide"},
    "Analgésico opioide + não opioide": {"en": "Opioid + non-opioid analgesic", "es": "Analgésico opioide + no opioide"},
    "Analgésico otológico": {"en": "Otic analgesic", "es": "Analgésico otológico"},
    "Anestésico dissociativo": {"en": "Dissociative anesthetic", "es": "Anestésico disociativo"},
    "Anestésico geral": {"en": "General anesthetic", "es": "Anestésico general"},
    "Anestésico local": {"en": "Local anesthetic", "es": "Anestésico local"},
    "Ansiolítico": {"en": "Anxiolytic", "es": "Ansiolítico"},
    "Antagonista opioide": {"en": "Opioid antagonist", "es": "Antagonista opioide"},
    "Anti-craving alcoólico": {"en": "Alcohol anti-craving", "es": "Anti-craving alcohólico"},
    "Anti-helmíntico": {"en": "Anthelmintic", "es": "Antihelmíntico"},
    "Anti-helmíntico tópico": {"en": "Topical anthelmintic", "es": "Antihelmíntico tópico"},
    "Anti-hipertensivo": {"en": "Antihypertensive", "es": "Antihipertensivo"},
    "Anti-hipertensivo (bloqueador de canal de cálcio)": {"en": "Antihypertensive (calcium channel blocker)", "es": "Antihipertensivo (bloqueador de canal de calcio)"},
    "Anti-hipertensivo central": {"en": "Central antihypertensive", "es": "Antihipertensivo central"},
    "Anti-histamínico": {"en": "Antihistamine", "es": "Antihistamínico"},
    "Anti-histamínico / Ansiolítico": {"en": "Antihistamine / Anxiolytic", "es": "Antihistamínico / Ansiolítico"},
    "Anti-histamínico nasal": {"en": "Nasal antihistamine", "es": "Antihistamínico nasal"},
    "Anti-histamínico oftálmico": {"en": "Ophthalmic antihistamine", "es": "Antihistamínico oftálmico"},
    "Anti-inflamatório": {"en": "Anti-inflammatory", "es": "Antiinflamatorio"},
    "Anti-inflamatório (COXIB)": {"en": "Anti-inflammatory (COXIB)", "es": "Antiinflamatorio (COXIB)"},
    "Anti-inflamatório / Antigotoso": {"en": "Anti-inflammatory / Antigout", "es": "Antiinflamatorio / Antigotoso"},
    "Anti-inflamatório intestinal": {"en": "Intestinal anti-inflammatory", "es": "Antiinflamatorio intestinal"},
    "Anti-inflamatório não esteroidal": {"en": "Non-steroidal anti-inflammatory", "es": "Antiinflamatorio no esteroideo"},
    "Anti-inflamatório não esteroidal (oxicam)": {"en": "Non-steroidal anti-inflammatory (oxicam)", "es": "Antiinflamatorio no esteroideo (oxicam)"},
    "Anti-inflamatório tópico": {"en": "Topical anti-inflammatory", "es": "Antiinflamatorio tópico"},
    "Antiacneico / Despigmentante": {"en": "Anti-acne / Depigmenting", "es": "Antiacneico / Despigmentante"},
    "Antiacneico tópico": {"en": "Topical anti-acne", "es": "Antiacneico tópico"},
    "Antiandrógeno": {"en": "Antiandrogen", "es": "Antiandrógeno"},
    "Antianginoso": {"en": "Antianginal", "es": "Antianginoso"},
    "Antianginoso / Bradicardizante seletivo": {"en": "Antianginal / Selective bradycardic", "es": "Antianginoso / Bradicardizante selectivo"},
    "Antianginoso metabólico": {"en": "Metabolic antianginal", "es": "Antianginoso metabólico"},
    "Antianêmico": {"en": "Antianemic", "es": "Antianémico"},
    "Antiarrítmico": {"en": "Antiarrhythmic", "es": "Antiarrítmico"},
    "Antiarrítmico classe IC": {"en": "Class IC antiarrhythmic", "es": "Antiarrítmico clase IC"},
    "Antiarrítmico classe III": {"en": "Class III antiarrhythmic", "es": "Antiarrítmico clase III"},
    "Antiarrítmico classe III / Betabloqueador": {"en": "Class III antiarrhythmic / Beta-blocker", "es": "Antiarrítmico clase III / Betabloqueador"},
    "Antibacteriano tópico": {"en": "Topical antibacterial", "es": "Antibacteriano tópico"},
    "Antibiótico": {"en": "Antibiotic", "es": "Antibiótico"},
    "Antibiótico (aminoglicosídeo)": {"en": "Antibiotic (aminoglycoside)", "es": "Antibiótico (aminoglucósido)"},
    "Antibiótico (carbapenêmico)": {"en": "Antibiotic (carbapenem)", "es": "Antibiótico (carbapenémico)"},
    "Antibiótico (lipopeptídeo)": {"en": "Antibiotic (lipopeptide)", "es": "Antibiótico (lipopéptido)"},
    "Antibiótico (quinolona de 1ª geração)": {"en": "Antibiotic (1st generation quinolone)", "es": "Antibiótico (quinolona de 1ª generación)"},
    "Antibiótico + corticosteroide oftálmico": {"en": "Antibiotic + ophthalmic corticosteroid", "es": "Antibiótico + corticosteroide oftálmico"},
    "Antibiótico + corticosteroide ótico": {"en": "Antibiotic + otic corticosteroid", "es": "Antibiótico + corticosteroide ótico"},
    "Antibiótico oftálmico": {"en": "Ophthalmic antibiotic", "es": "Antibiótico oftálmico"},
    "Antibiótico otológico": {"en": "Otic antibiotic", "es": "Antibiótico otológico"},
    "Antibiótico tópico": {"en": "Topical antibiotic", "es": "Antibiótico tópico"},
    "Antibiótico vaginal": {"en": "Vaginal antibiotic", "es": "Antibiótico vaginal"},
    "Antibiótico ótico": {"en": "Otic antibiotic", "es": "Antibiótico ótico"},
    "Anticoagulante": {"en": "Anticoagulant", "es": "Anticoagulante"},
    "Anticoagulante (heparina de baixo peso molecular)": {"en": "Anticoagulant (low molecular weight heparin)", "es": "Anticoagulante (heparina de bajo peso molecular)"},
    "Anticoagulante (inibidor seletivo do fator Xa)": {"en": "Anticoagulant (selective factor Xa inhibitor)", "es": "Anticoagulante (inhibidor selectivo del factor Xa)"},
    "Anticoagulante oral direto (inibidor do fator Xa)": {"en": "Direct oral anticoagulant (factor Xa inhibitor)", "es": "Anticoagulante oral directo (inhibidor del factor Xa)"},
    "Anticolinesterásico": {"en": "Anticholinesterase", "es": "Anticolinesterásico"},
    "Anticolinérgico": {"en": "Anticholinergic", "es": "Anticolinérgico"},
    "Anticolinérgico de longa ação (LAMA)": {"en": "Long-acting anticholinergic (LAMA)", "es": "Anticolinérgico de larga acción (LAMA)"},
    "Anticolinérgico vesical": {"en": "Vesical anticholinergic", "es": "Anticolinérgico vesical"},
    "Anticonvulsivante": {"en": "Anticonvulsant", "es": "Anticonvulsivante"},
    "Anticorpo monoclonal anti-IL-5": {"en": "Anti-IL-5 monoclonal antibody", "es": "Anticuerpo monoclonal anti-IL-5"},
    "Anticorpo monoclonal anti-IL-5R": {"en": "Anti-IL-5R monoclonal antibody", "es": "Anticuerpo monoclonal anti-IL-5R"},
    "Anticorpo monoclonal anti-IgE": {"en": "Anti-IgE monoclonal antibody", "es": "Anticuerpo monoclonal anti-IgE"},
    "Anticorpo monoclonal antiangiogênico": {"en": "Antiangiogenic monoclonal antibody", "es": "Anticuerpo monoclonal antiangiogénico"},
    "Antidemencial": {"en": "Anti-dementia", "es": "Antidemencial"},
    "Antidepressivo": {"en": "Antidepressant", "es": "Antidepresivo"},
    "Antidiabético": {"en": "Antidiabetic", "es": "Antidiabético"},
    "Antidiabético (sulfonilureia)": {"en": "Antidiabetic (sulfonylurea)", "es": "Antidiabético (sulfonilurea)"},
    "Antidiarreico": {"en": "Antidiarrheal", "es": "Antidiarreico"},
    "Antidiarreico adsorvente": {"en": "Adsorbent antidiarrheal", "es": "Antidiarreico adsorbente"},
    "Antiemético": {"en": "Antiemetic", "es": "Antiemético"},
    "Antiemético (antagonista 5-HT3 de longa ação)": {"en": "Antiemetic (long-acting 5-HT3 antagonist)", "es": "Antiemético (antagonista 5-HT3 de larga acción)"},
    "Antiemético (antagonista 5-HT3)": {"en": "Antiemetic (5-HT3 antagonist)", "es": "Antiemético (antagonista 5-HT3)"},
    "Antiemético (antagonista NK1)": {"en": "Antiemetic (NK1 antagonist)", "es": "Antiemético (antagonista NK1)"},
    "Antiemético (pró-droga do aprepitanto; antagonista NK1)": {"en": "Antiemetic (aprepitant prodrug; NK1 antagonist)", "es": "Antiemético (prodroga del aprepitant; antagonista NK1)"},
    "Antiemético / Antivertiginoso": {"en": "Antiemetic / Antivertigo", "es": "Antiemético / Antivertiginoso"},
    "Antienxaqueca": {"en": "Antimigraine", "es": "Antimigrañoso"},
    "Antienxaqueca (ergotamínico)": {"en": "Antimigraine (ergotamine)", "es": "Antimigrañoso (ergotamínico)"},
    "Antienxaqueca (triptano)": {"en": "Antimigraine (triptan)", "es": "Antimigrañoso (triptán)"},
    "Antiespasmódico": {"en": "Antispasmodic", "es": "Antiespasmódico"},
    "Antiespasmódico urinário": {"en": "Urinary antispasmodic", "es": "Antiespasmódico urinario"},
    "Antifibrinolítico": {"en": "Antifibrinolytic", "es": "Antifibrinolítico"},
    "Antifibrótico pulmonar": {"en": "Pulmonary antifibrotic", "es": "Antifibrótico pulmonar"},
    "Antifibrótico pulmonar (inibidor de tirosina quinase)": {"en": "Pulmonary antifibrotic (tyrosine kinase inhibitor)", "es": "Antifibrótico pulmonar (inhibidor de tirosina quinasa)"},
    "Antiflatulento": {"en": "Antiflatulent", "es": "Antiflatulento"},
    "Antifúngico": {"en": "Antifungal", "es": "Antifúngico"},
    "Antifúngico oral": {"en": "Oral antifungal", "es": "Antifúngico oral"},
    "Antifúngico sistêmico": {"en": "Systemic antifungal", "es": "Antifúngico sistémico"},
    "Antifúngico tópico": {"en": "Topical antifungal", "es": "Antifúngico tópico"},
    "Antifúngico tópico / Protetor cutâneo": {"en": "Topical antifungal / Skin protectant", "es": "Antifúngico tópico / Protector cutáneo"},
    "Antifúngico vaginal": {"en": "Vaginal antifungal", "es": "Antifúngico vaginal"},
    "Antiglaucomatoso": {"en": "Antiglaucoma", "es": "Antiglaucomatoso"},
    "Antigotoso": {"en": "Antigout", "es": "Antigotoso"},
    "Antiinfeccioso vaginal combinado": {"en": "Combined vaginal anti-infective", "es": "Antiinfeccioso vaginal combinado"},
    "Antileucotrieno": {"en": "Antileukotriene", "es": "Antileucotrieno"},
    "Antimalárico/Imunossupressor": {"en": "Antimalarial/Immunosuppressant", "es": "Antimalárico/Inmunosupresor"},
    "Antimicobacteriano/Dermatológico": {"en": "Antimycobacterial/Dermatological", "es": "Antimicobacteriano/Dermatológico"},
    "Antimuscarínico urinário": {"en": "Urinary antimuscarinic", "es": "Antimuscarínico urinario"},
    "Antineoplásico": {"en": "Antineoplastic", "es": "Antineoplásico"},
    "Antineoplásico / Imunossupressor": {"en": "Antineoplastic / Immunosuppressant", "es": "Antineoplásico / Inmunosupresor"},
    "Antiparasitário": {"en": "Antiparasitic", "es": "Antiparasitario"},
    "Antiparasitário / Antibacteriano": {"en": "Antiparasitic / Antibacterial", "es": "Antiparasitario / Antibacteriano"},
    "Antiparasitário / Antibiótico": {"en": "Antiparasitic / Antibiotic", "es": "Antiparasitario / Antibiótico"},
    "Antiparasitário / Antiviral": {"en": "Antiparasitic / Antiviral", "es": "Antiparasitario / Antiviral"},
    "Antiparasitário tópico": {"en": "Topical antiparasitic", "es": "Antiparasitario tópico"},
    "Antiparkinsoniano": {"en": "Antiparkinsonian", "es": "Antiparkinsoniano"},
    "Antiplaquetário": {"en": "Antiplatelet", "es": "Antiplaquetario"},
    "Antiplaquetário/Vasodilatador": {"en": "Antiplatelet/Vasodilator", "es": "Antiplaquetario/Vasodilatador"},
    "Antipsicótico": {"en": "Antipsychotic", "es": "Antipsicótico"},
    "Antipsoriásico tópico": {"en": "Topical antipsoriatic", "es": "Antipsoriásico tópico"},
    "Antipsoriático / Antisseborreico": {"en": "Antipsoriatic / Antiseborrheic", "es": "Antipsoriático / Antiseborreico"},
    "Antirreabsortivo ósseo": {"en": "Bone antiresorptive", "es": "Antirresortivo óseo"},
    "Antirretroviral": {"en": "Antiretroviral", "es": "Antirretroviral"},
    "Antirreumático": {"en": "Antirheumatic", "es": "Antirreumático"},
    "Antirreumático / Antimalárico": {"en": "Antirheumatic / Antimalarial", "es": "Antirreumático / Antimalárico"},
    "Antirreumático / Quelante": {"en": "Antirheumatic / Chelating", "es": "Antirreumático / Quelante"},
    "Antisseborreico": {"en": "Antiseborrheic", "es": "Antiseborreico"},
    "Antissecretor intestinal": {"en": "Intestinal antisecretory", "es": "Antisecretor intestinal"},
    "Antisséptico oral": {"en": "Oral antiseptic", "es": "Antiséptico oral"},
    "Antisséptico otológico": {"en": "Otic antiseptic", "es": "Antiséptico otológico"},
    "Antisséptico tópico": {"en": "Topical antiseptic", "es": "Antiséptico tópico"},
    "Antitireoidiano": {"en": "Antithyroid", "es": "Antitiroideo"},
    "Antituberculoso": {"en": "Antituberculosis", "es": "Antituberculoso"},
    "Antitussígeno": {"en": "Antitussive", "es": "Antitusivo"},
    "Antivertiginoso": {"en": "Antivertigo", "es": "Antivertiginoso"},
    "Antivertiginoso / Anti-histamínico": {"en": "Antivertigo / Antihistamine", "es": "Antivertiginoso / Antihistamínico"},
    "Antiviral": {"en": "Antiviral", "es": "Antiviral"},
    "Antiácido": {"en": "Antacid", "es": "Antiácido"},
    "Antiácido / Alcalinizante": {"en": "Antacid / Alkalinizer", "es": "Antiácido / Alcalinizante"},
    "Antídoto (antagonista benzodiazepínico)": {"en": "Antidote (benzodiazepine antagonist)", "es": "Antídoto (antagonista benzodiazepínico)"},
    "Antídoto / Resgate de folato": {"en": "Antidote / Folate rescue", "es": "Antídoto / Rescate de folato"},
    "Antídoto heparina": {"en": "Heparin antidote", "es": "Antídoto de heparina"},
    "Análogo ADH": {"en": "ADH analogue", "es": "Análogo de ADH"},
    "Análogo de vasopressina / Hemostático": {"en": "Vasopressin analogue / Hemostatic", "es": "Análogo de vasopresina / Hemostático"},
    "Análogo de vitamina D": {"en": "Vitamin D analogue", "es": "Análogo de vitamina D"},
    "Análogo de vitamina D (ativador seletivo do receptor de vitamina D)": {"en": "Vitamin D analogue (selective VDR activator)", "es": "Análogo de vitamina D (activador selectivo del receptor de vitamina D)"},
    "Análogo somatostatina": {"en": "Somatostatin analogue", "es": "Análogo de somatostatina"},
    "Aversivo alcoólico": {"en": "Alcohol aversive", "es": "Aversivo alcohólico"},
    "Beta-2 agonista de ultra longa ação (ultra-LABA)": {"en": "Ultra-long-acting beta-2 agonist (ultra-LABA)", "es": "Agonista beta-2 de acción ultra prolongada (ultra-LABA)"},
    "Biológico": {"en": "Biologic", "es": "Biológico"},
    "Biológico anti-IL-12/23": {"en": "Anti-IL-12/23 biologic", "es": "Biológico anti-IL-12/23"},
    "Biológico anti-IL-4/13": {"en": "Anti-IL-4/13 biologic", "es": "Biológico anti-IL-4/13"},
    "Biológico anti-IL-6": {"en": "Anti-IL-6 biologic", "es": "Biológico anti-IL-6"},
    "Biológico anti-integrina": {"en": "Anti-integrin biologic", "es": "Biológico anti-integrina"},
    "Bloqueador de canal de cálcio": {"en": "Calcium channel blocker", "es": "Bloqueador de canal de calcio"},
    "Bloqueador neuromuscular": {"en": "Neuromuscular blocker", "es": "Bloqueador neuromuscular"},
    "Bloqueador neuromuscular despolarizante": {"en": "Depolarizing neuromuscular blocker", "es": "Bloqueador neuromuscular despolarizante"},
    "Broncodilatador": {"en": "Bronchodilator", "es": "Broncodilatador"},
    "Broncodilatador + Corticosteroide": {"en": "Bronchodilator + Corticosteroid", "es": "Broncodilatador + Corticosteroide"},
    "Calcimimético": {"en": "Calcimimetic", "es": "Calcimimético"},
    "Cardioprotetor": {"en": "Cardioprotective", "es": "Cardioprotector"},
    "Cardiotônico": {"en": "Cardiotonic", "es": "Cardiotónico"},
    "Cicatrizante / Anticicatricial": {"en": "Healing / Anti-scarring", "es": "Cicatrizante / Anticicatricial"},
    "Cicatrizante / Hidratante cutâneo": {"en": "Healing / Skin moisturizer", "es": "Cicatrizante / Hidratante cutáneo"},
    "Citoprotetor (uroprotetor)": {"en": "Cytoprotective (uroprotective)", "es": "Citoprotector (uroprotector)"},
    "Combo prostático": {"en": "Prostatic combo", "es": "Combo prostático"},
    "Complexo vitamínico": {"en": "Vitamin complex", "es": "Complejo vitamínico"},
    "Contraceptivo": {"en": "Contraceptive", "es": "Anticonceptivo"},
    "Contraceptivo antiandrogênico": {"en": "Antiandrogenic contraceptive", "es": "Anticonceptivo antiandrogénico"},
    "Contraceptivo de emergência": {"en": "Emergency contraceptive", "es": "Anticonceptivo de emergencia"},
    "Contraceptivo intrauterino": {"en": "Intrauterine contraceptive", "es": "Anticonceptivo intrauterino"},
    "Corticoide inalatório + LABA (ICS/LABA)": {"en": "Inhaled corticosteroid + LABA (ICS/LABA)", "es": "Corticoide inhalado + LABA (ICS/LABA)"},
    "Corticosteroide": {"en": "Corticosteroid", "es": "Corticosteroide"},
    "Corticosteroide + antibiótico tópico": {"en": "Corticosteroid + topical antibiotic", "es": "Corticosteroide + antibiótico tópico"},
    "Corticosteroide inalatório": {"en": "Inhaled corticosteroid", "es": "Corticosteroide inhalado"},
    "Corticosteroide nasal": {"en": "Nasal corticosteroid", "es": "Corticosteroide nasal"},
    "Corticosteroide oftálmico": {"en": "Ophthalmic corticosteroid", "es": "Corticosteroide oftálmico"},
    "Corticosteroide para mucosa oral": {"en": "Oral mucosa corticosteroid", "es": "Corticosteroide para mucosa oral"},
    "Corticosteroide sistêmico": {"en": "Systemic corticosteroid", "es": "Corticosteroide sistémico"},
    "Corticosteroide tópico": {"en": "Topical corticosteroid", "es": "Corticosteroide tópico"},
    "Corticosteroide tópico (baixa potência)": {"en": "Topical corticosteroid (low potency)", "es": "Corticosteroide tópico (baja potencia)"},
    "Corticosteroide tópico (média potência)": {"en": "Topical corticosteroid (medium potency)", "es": "Corticosteroide tópico (mediana potencia)"},
    "Corticosteroide tópico (potência média)": {"en": "Topical corticosteroid (medium potency)", "es": "Corticosteroide tópico (potencia media)"},
    "Cuidados Respiratórios": {"en": "Respiratory Care", "es": "Cuidados Respiratorios"},
    "Curativos Avançados": {"en": "Advanced Wound Care", "es": "Apósitos Avanzados"},
    "Descongestionante nasal": {"en": "Nasal decongestant", "es": "Descongestionante nasal"},
    "Descongestionante ocular/nasal": {"en": "Ocular/Nasal decongestant", "es": "Descongestionante ocular/nasal"},
    "Descongestionante sistêmico": {"en": "Systemic decongestant", "es": "Descongestionante sistémico"},
    "Despigmentante": {"en": "Depigmenting agent", "es": "Despigmentante"},
    "Diurético": {"en": "Diuretic", "es": "Diurético"},
    "Enzima pancreática": {"en": "Pancreatic enzyme", "es": "Enzima pancreática"},
    "Enzimático": {"en": "Enzymatic", "es": "Enzimático"},
    "Escabicida": {"en": "Scabicide", "es": "Escabicida"},
    "Estabilizador de humor": {"en": "Mood stabilizer", "es": "Estabilizador del humor"},
    "Estimulante da eritropoiese": {"en": "Erythropoiesis stimulant", "es": "Estimulante de la eritropoyesis"},
    "Estimulante de eritropoiese": {"en": "Erythropoiesis stimulant", "es": "Estimulante de eritropoyesis"},
    "Estrogênio vaginal tópico": {"en": "Topical vaginal estrogen", "es": "Estrógeno vaginal tópico"},
    "Expectorante": {"en": "Expectorant", "es": "Expectorante"},
    "Fator de coagulação": {"en": "Coagulation factor", "es": "Factor de coagulación"},
    "Fator estimulador G-CSF": {"en": "G-CSF stimulating factor", "es": "Factor estimulante G-CSF"},
    "Fator estimulante de colônias de granulócitos (G-CSF peguilado)": {"en": "Granulocyte colony-stimulating factor (pegylated G-CSF)", "es": "Factor estimulante de colonias de granulocitos (G-CSF pegilado)"},
    "Fator estimulante de colônias de granulócitos (G-CSF)": {"en": "Granulocyte colony-stimulating factor (G-CSF)", "es": "Factor estimulante de colonias de granulocitos (G-CSF)"},
    "Gastroprotetor": {"en": "Gastroprotective", "es": "Gastroprotector"},
    "Higiene": {"en": "Hygiene", "es": "Higiene"},
    "Higiene e Conforto": {"en": "Hygiene and Comfort", "es": "Higiene y Confort"},
    "Hipnótico": {"en": "Hypnotic", "es": "Hipnótico"},
    "Hipolipemiante": {"en": "Lipid-lowering", "es": "Hipolipemiante"},
    "Hormônio": {"en": "Hormone", "es": "Hormona"},
    "Hormônio androgênico": {"en": "Androgenic hormone", "es": "Hormona androgénica"},
    "Hormônio paratireoidiano": {"en": "Parathyroid hormone", "es": "Hormona paratiroidea"},
    "Hormônio tireoidiano": {"en": "Thyroid hormone", "es": "Hormona tiroidea"},
    "INRA": {"en": "ARNI", "es": "INRA"},
    "Imunomodulador": {"en": "Immunomodulator", "es": "Inmunomodulador"},
    "Imunomodulador tópico": {"en": "Topical immunomodulator", "es": "Inmunomodulador tópico"},
    "Imunossupressor": {"en": "Immunosuppressant", "es": "Inmunosupresor"},
    "Imunossupressor (inibidor de calcineurina)": {"en": "Immunosuppressant (calcineurin inhibitor)", "es": "Inmunosupresor (inhibidor de calcineurina)"},
    "Imunossupressor / Antirreumático": {"en": "Immunosuppressant / Antirheumatic", "es": "Inmunosupresor / Antirreumático"},
    "Inibidor 5-alfa redutase": {"en": "5-alpha reductase inhibitor", "es": "Inhibidor de 5-alfa reductasa"},
    "Inibidor If": {"en": "If channel inhibitor", "es": "Inhibidor If"},
    "Inibidor JAK": {"en": "JAK inhibitor", "es": "Inhibidor JAK"},
    "Inibidor PDE5": {"en": "PDE5 inhibitor", "es": "Inhibidor PDE5"},
    "Inibidor da anidrase carbônica": {"en": "Carbonic anhydrase inhibitor", "es": "Inhibidor de la anhidrasa carbónica"},
    "Inibidor de fosfodiesterase-4 (PDE4)": {"en": "Phosphodiesterase-4 (PDE4) inhibitor", "es": "Inhibidor de fosfodiesterasa-4 (PDE4)"},
    "Inibidor de neprilisina e antagonista de angiotensina II": {"en": "Neprilysin inhibitor and angiotensin II antagonist", "es": "Inhibidor de neprilisina y antagonista de angiotensina II"},
    "Inibidor do complemento (anticorpo monoclonal anti-C5)": {"en": "Complement inhibitor (anti-C5 monoclonal antibody)", "es": "Inhibidor del complemento (anticuerpo monoclonal anti-C5)"},
    "Inmunomodulador": {"en": "Immunomodulator", "es": "Inmunomodulador"},
    "Inotrópico": {"en": "Inotropic", "es": "Inotrópico"},
    "Insumo para Diabetes": {"en": "Diabetes Supply", "es": "Insumo para Diabetes"},
    "Insumo para Ostomia": {"en": "Ostomy Supply", "es": "Insumo para Ostomía"},
    "LABA + LAMA (associação broncodilatadora dupla)": {"en": "LABA + LAMA (dual bronchodilator)", "es": "LABA + LAMA (asociación broncodilatadora dual)"},
    "LAMA + LABA (associação broncodilatadora dupla)": {"en": "LAMA + LABA (dual bronchodilator)", "es": "LAMA + LABA (asociación broncodilatadora dual)"},
    "Lavagem nasal": {"en": "Nasal wash", "es": "Lavado nasal"},
    "Laxante": {"en": "Laxative", "es": "Laxante"},
    "Laxante / Emoliente": {"en": "Laxative / Emollient", "es": "Laxante / Emoliente"},
    "Laxante estimulante": {"en": "Stimulant laxative", "es": "Laxante estimulante"},
    "Laxante lubrificante": {"en": "Lubricant laxative", "es": "Laxante lubricante"},
    "Laxante osmótico": {"en": "Osmotic laxative", "es": "Laxante osmótico"},
    "Laxante osmótico / Eletrólito": {"en": "Osmotic laxative / Electrolyte", "es": "Laxante osmótico / Electrolito"},
    "Lubrificante ocular": {"en": "Ocular lubricant", "es": "Lubricante ocular"},
    "Material de Curativo": {"en": "Wound Care Material", "es": "Material de Curación"},
    "Midriático": {"en": "Mydriatic", "es": "Midriático"},
    "Midriático / Cicloplégico": {"en": "Mydriatic / Cycloplegic", "es": "Midriático / Ciclopléjico"},
    "Midriático simpatomimético": {"en": "Sympathomimetic mydriatic", "es": "Midriático simpatomimético"},
    "Mineralocorticoide": {"en": "Mineralocorticoid", "es": "Mineralocorticoide"},
    "Modulador CFTR": {"en": "CFTR modulator", "es": "Modulador CFTR"},
    "Modulador seletivo do receptor de estrogênio": {"en": "Selective estrogen receptor modulator", "es": "Modulador selectivo del receptor de estrógeno"},
    "Monitoramento": {"en": "Monitoring", "es": "Monitoreo"},
    "Mucolítico": {"en": "Mucolytic", "es": "Mucolítico"},
    "Mucolítico / Expectorante": {"en": "Mucolytic / Expectorant", "es": "Mucolítico / Expectorante"},
    "Multivitamínico": {"en": "Multivitamin", "es": "Multivitamínico"},
    "Nootrópico": {"en": "Nootropic", "es": "Nootrópico"},
    "Nutrição": {"en": "Nutrition", "es": "Nutrición"},
    "Nutrição Enteral": {"en": "Enteral Nutrition", "es": "Nutrición Enteral"},
    "OPM — Mobilidade": {"en": "OPM — Mobility", "es": "OPM — Movilidad"},
    "OPM — Órteses e Próteses": {"en": "OPM — Orthoses and Prostheses", "es": "OPM — Órtesis y Prótesis"},
    "Ortopedia": {"en": "Orthopedics", "es": "Ortopedia"},
    "Outros Dispositivos": {"en": "Other Devices", "es": "Otros Dispositivos"},
    "Probiótico": {"en": "Probiotic", "es": "Probiótico"},
    "Procinético": {"en": "Prokinetic", "es": "Procinético"},
    "Procinético / Antiemético": {"en": "Prokinetic / Antiemetic", "es": "Procinético / Antiemético"},
    "Progestágeno": {"en": "Progestogen", "es": "Progestágeno"},
    "Prostaglandina": {"en": "Prostaglandin", "es": "Prostaglandina"},
    "Protetor dermatológico": {"en": "Dermatological protectant", "es": "Protector dermatológico"},
    "Protetor gástrico": {"en": "Gastric protectant", "es": "Protector gástrico"},
    "Psicoestimulante": {"en": "Psychostimulant", "es": "Psicoestimulante"},
    "Quelante de fósforo": {"en": "Phosphate binder", "es": "Quelante de fósforo"},
    "Queratolítico": {"en": "Keratolytic", "es": "Queratolítico"},
    "Queratolítico / Antiviral tópico": {"en": "Keratolytic / Topical antiviral", "es": "Queratolítico / Antiviral tópico"},
    "Regulador de motilidade": {"en": "Motility regulator", "es": "Regulador de motilidad"},
    "Regulador do sono": {"en": "Sleep regulator", "es": "Regulador del sueño"},
    "Reidratante oral": {"en": "Oral rehydration", "es": "Rehidratante oral"},
    "Relaxante muscular": {"en": "Muscle relaxant", "es": "Relajante muscular"},
    "Relaxante muscular + analgésico": {"en": "Muscle relaxant + analgesic", "es": "Relajante muscular + analgésico"},
    "Relaxante muscular central": {"en": "Central muscle relaxant", "es": "Relajante muscular central"},
    "Relaxante muscular de ação central": {"en": "Centrally-acting muscle relaxant", "es": "Relajante muscular de acción central"},
    "Reposição hormonal": {"en": "Hormone replacement", "es": "Reposición hormonal"},
    "Resgate de folato / Modulador de fluoropirimidina": {"en": "Folate rescue / Fluoropyrimidine modulator", "es": "Rescate de folato / Modulador de fluoropirimidina"},
    "Retinoide": {"en": "Retinoid", "es": "Retinoide"},
    "Retinoide + antibacteriano tópico": {"en": "Retinoid + topical antibacterial", "es": "Retinoide + antibacteriano tópico"},
    "Retinoide tópico": {"en": "Topical retinoid", "es": "Retinoide tópico"},
    "Reversor de bloqueio neuromuscular": {"en": "Neuromuscular blockade reversal", "es": "Reversor de bloqueo neuromuscular"},
    "Sedativo alfa-2 agonista": {"en": "Alpha-2 agonist sedative", "es": "Sedante alfa-2 agonista"},
    "Simpatomimético": {"en": "Sympathomimetic", "es": "Simpatomimético"},
    "Sondas e Cateteres": {"en": "Probes and Catheters", "es": "Sondas y Catéteres"},
    "Suplemento eletrolítico": {"en": "Electrolyte supplement", "es": "Suplemento electrolítico"},
    "Suplemento lipídico": {"en": "Lipid supplement", "es": "Suplemento lipídico"},
    "Suplemento mineral": {"en": "Mineral supplement", "es": "Suplemento mineral"},
    "Suplemento ósseo": {"en": "Bone supplement", "es": "Suplemento óseo"},
    "Tripla terapia inalatória (ICS/LAMA/LABA)": {"en": "Triple inhaled therapy (ICS/LAMA/LABA)", "es": "Triple terapia inhalatoria (ICS/LAMA/LABA)"},
    "Vacina": {"en": "Vaccine", "es": "Vacuna"},
    "Vasodilatador": {"en": "Vasodilator", "es": "Vasodilatador"},
    "Vasodilatador periférico": {"en": "Peripheral vasodilator", "es": "Vasodilatador periférico"},
    "Vasodilatador pulmonar": {"en": "Pulmonary vasodilator", "es": "Vasodilatador pulmonar"},
    "Vasodilatador tópico": {"en": "Topical vasodilator", "es": "Vasodilatador tópico"},
    "Vasopressor": {"en": "Vasopressor", "es": "Vasopresor"},
    "Vasopressor/Inotrópico": {"en": "Vasopressor/Inotropic", "es": "Vasopresor/Inotrópico"},
    "Vitamina": {"en": "Vitamin", "es": "Vitamina"},
    "Vitamina (complexo B)": {"en": "Vitamin (B complex)", "es": "Vitamina (complejo B)"},
    "Vitamina D ativa": {"en": "Active vitamin D", "es": "Vitamina D activa"},
    "Vitamina K": {"en": "Vitamin K", "es": "Vitamina K"},
    "Ácido biliar": {"en": "Bile acid", "es": "Ácido biliar"},
}


def _build_term_pattern(terms: dict[str, dict[str, str]]) -> re.Pattern:
    """Build a compiled regex that matches any key from a translation dict (case-insensitive, word boundaries)."""
    # Sort by length descending so longer terms match first (e.g. "comprimido revestido" before "comprimido")
    sorted_keys = sorted(terms.keys(), key=len, reverse=True)
    escaped = [re.escape(k) for k in sorted_keys]
    pattern = r'\b(' + '|'.join(escaped) + r')\b'
    return re.compile(pattern, re.IGNORECASE)


# Pre-compiled patterns for performance
_DOSAGE_FORM_PATTERN = _build_term_pattern(DOSAGE_FORMS)
_PRESENTATION_PATTERN = _build_term_pattern(PRESENTATION_TERMS)

# Combined pattern for name/presentation translation (dosage forms + presentation terms)
_ALL_TERMS = {**DOSAGE_FORMS, **PRESENTATION_TERMS}
_ALL_TERMS_PATTERN = _build_term_pattern(_ALL_TERMS)

# Lowercase lookup for case-insensitive matching
_ALL_TERMS_LOWER = {k.lower(): v for k, v in _ALL_TERMS.items()}
_THERAPEUTIC_LOWER = {k.lower(): v for k, v in THERAPEUTIC_CLASSES.items()}
_ADMIN_ROUTES_LOWER = {k.lower(): v for k, v in ADMIN_ROUTES.items()}


def _translate_text_terms(text: str, locale: str) -> str:
    """Replace pharmaceutical terms in text (name/presentation) with translated equivalents."""
    if not text:
        return text

    def replacer(match: re.Match) -> str:
        original = match.group(0)
        entry = _ALL_TERMS_LOWER.get(original.lower())
        if entry and locale in entry:
            translated = entry[locale]
            # Preserve original capitalization pattern
            if original[0].isupper() and translated[0].islower():
                return translated[0].upper() + translated[1:]
            return translated
        return original

    return _ALL_TERMS_PATTERN.sub(replacer, text)


def translate_therapeutic_class(value: str, locale: str) -> str:
    """Translate a therapeutic class value."""
    if not value:
        return value
    entry = _THERAPEUTIC_LOWER.get(value.lower())
    if entry and locale in entry:
        return entry[locale]
    return value


def translate_admin_route(value: str, locale: str) -> str:
    """Translate an administration route value."""
    if not value:
        return value
    entry = _ADMIN_ROUTES_LOWER.get(value.lower())
    if entry and locale in entry:
        return entry[locale]
    return value


def translate_medication_response(
    response: dict,
    locale: str,
    db_override: Optional[dict] = None,
) -> dict:
    """
    Translate medication response fields to the target locale.

    Resolution order: DB override > dictionary > original (PT).

    Args:
        response: Medication response dict (from _build_medication_response)
        locale: Target locale ('en', 'es'). 'pt' is a no-op.
        db_override: Optional dict from MedicationTranslation table
                     with keys 'name' and/or 'active_principle'.
    """
    if not locale or locale == 'pt':
        return response

    result = dict(response)

    # 1. Apply DB override if available (highest priority)
    if db_override:
        if db_override.get('name'):
            result['name'] = db_override['name']
        if db_override.get('active_principle'):
            result['active_principle'] = db_override['active_principle']
    else:
        # 2. Translate terms in name via dictionary
        if result.get('name'):
            result['name'] = _translate_text_terms(result['name'], locale)

    # 3. Translate therapeutic_class via direct lookup
    if result.get('therapeutic_class'):
        result['therapeutic_class'] = translate_therapeutic_class(
            result['therapeutic_class'], locale
        )

    # 4. Translate administration_route via direct lookup
    if result.get('administration_route'):
        result['administration_route'] = translate_admin_route(
            result['administration_route'], locale
        )

    # 5. Translate terms in presentation via dictionary
    if result.get('presentation'):
        result['presentation'] = _translate_text_terms(result['presentation'], locale)

    return result
