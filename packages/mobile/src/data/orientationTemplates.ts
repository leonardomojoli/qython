// Orientation templates for patient education
// Extracted from web/src/components/consultation/OrientacoesTab.js

import type { OrientationTemplate } from '../types/ambulatory';

export const ORIENTATION_TEMPLATES: OrientationTemplate[] = [
  { key: 'glucose_control', icon: 'tint', specialty: 'Endocrinologia' },
  { key: 'blood_pressure', icon: 'heart-pulse', specialty: 'Cardiologia' },
  { key: 'diet_low_sodium', icon: 'apple', specialty: 'Cardiologia' },
  { key: 'diet_diabetic', icon: 'utensils', specialty: 'Endocrinologia' },
  { key: 'pre_op', icon: 'hospital', specialty: 'Cirurgia Geral' },
  { key: 'post_op', icon: 'hospital', specialty: 'Cirurgia Geral' },
  { key: 'wound_care', icon: 'bandage', specialty: 'Cirurgia Geral' },
  { key: 'medication_guidance', icon: 'capsules', specialty: 'Clínica Médica' },
];

// Template content per language (HTML stripped to plain text for mobile)
export const TEMPLATE_CONTENT: Record<string, Record<string, { title: string; content: string }>> = {
  glucose_control: {
    pt: {
      title: 'Controle de Glicemia',
      content: `Tabela de Controle de Glicemia

Registre suas medições diárias de glicemia capilar nos horários indicados pelo seu médico.

Data | Jejum | Pós-café | Pré-almoço | Pós-almoço | Pré-jantar | Pós-jantar

Valores de Referência:
- Jejum: 70-100 mg/dL (bom) | 100-130 mg/dL (atenção) | >130 mg/dL (alto)
- Pós-refeição (2h): <140 mg/dL (bom) | 140-180 mg/dL (atenção) | >180 mg/dL (alto)
- Hipoglicemia: <70 mg/dL - procure atendimento`,
    },
    en: {
      title: 'Blood Glucose Control',
      content: `Blood Glucose Control Chart

Record your daily capillary blood glucose measurements at the times indicated by your doctor.

Date | Fasting | Post-breakfast | Pre-lunch | Post-lunch | Pre-dinner | Post-dinner

Reference Values:
- Fasting: 70-100 mg/dL (good) | 100-130 mg/dL (attention) | >130 mg/dL (high)
- Post-meal (2h): <140 mg/dL (good) | 140-180 mg/dL (attention) | >180 mg/dL (high)`,
    },
    es: {
      title: 'Control de Glucemia',
      content: `Tabla de Control de Glucemia

Registre sus mediciones diarias de glucemia capilar en los horarios indicados por su médico.

Fecha | Ayuno | Post-desayuno | Pre-almuerzo | Post-almuerzo | Pre-cena | Post-cena

Valores de Referencia:
- Ayuno: 70-100 mg/dL (bueno) | 100-130 mg/dL (atención) | >130 mg/dL (alto)`,
    },
  },
  blood_pressure: {
    pt: {
      title: 'Controle de Pressão Arterial',
      content: `Diário de Pressão Arterial

Meça sua pressão arterial nos mesmos horários todos os dias, preferencialmente de manhã e à noite.

Data | Manhã (PAS/PAD) | FC | Noite (PAS/PAD) | FC | Obs

Classificação:
- Normal: <120/80 mmHg
- Elevada: 120-129/<80 mmHg
- Hipertensão Grau 1: 130-139/80-89 mmHg
- Hipertensão Grau 2: ≥140/≥90 mmHg

Orientações:
- Fique sentado em repouso por 5 minutos antes de medir
- Não fume, beba café ou faça exercício 30 minutos antes
- Apoie o braço na altura do coração`,
    },
    en: {
      title: 'Blood Pressure Control',
      content: `Blood Pressure Diary

Measure your blood pressure at the same times every day, preferably morning and evening.

Date | Morning (SBP/DBP) | HR | Evening (SBP/DBP) | HR | Notes

Classification:
- Normal: <120/80 mmHg
- Elevated: 120-129/<80 mmHg
- Stage 1: 130-139/80-89 mmHg
- Stage 2: ≥140/≥90 mmHg`,
    },
    es: {
      title: 'Control de Presión Arterial',
      content: `Diario de Presión Arterial

Mida su presión arterial a las mismas horas todos los días.

Fecha | Mañana (PAS/PAD) | FC | Noche (PAS/PAD) | FC | Obs

Clasificación:
- Normal: <120/80 mmHg
- Elevada: 120-129/<80 mmHg`,
    },
  },
  diet_low_sodium: {
    pt: {
      title: 'Dieta Hipossódica',
      content: `Orientações para Dieta com Baixo Teor de Sódio

A redução do sal na alimentação é fundamental para o controle da pressão arterial.

Alimentos a EVITAR:
- Embutidos (presunto, salsicha, mortadela, salame)
- Enlatados e conservas
- Temperos prontos (caldos de carne, sopas industrializadas)
- Queijos amarelos e processados
- Salgadinhos, biscoitos salgados

Alimentos PERMITIDOS:
- Frutas, verduras e legumes frescos
- Carnes magras (frango, peixe)
- Arroz, feijão, lentilha
- Temperos naturais (alho, cebola, limão, ervas)
- Queijo branco (com moderação)

Dicas Práticas:
- Limite máximo: 5g de sal/dia (1 colher de chá rasa)
- Retire o saleiro da mesa
- Leia os rótulos dos alimentos
- Prefira alimentos in natura`,
    },
    en: {
      title: 'Low Sodium Diet',
      content: `Low Sodium Diet Guidelines

Reducing salt intake is essential for blood pressure control.

Foods to AVOID:
- Processed meats (ham, sausage, bacon)
- Canned and preserved foods
- Ready-made seasonings and bouillon cubes
- Processed cheeses
- Salty snacks, crackers

Foods ALLOWED:
- Fresh fruits and vegetables
- Lean meats (chicken, fish)
- Rice, beans, lentils
- Natural seasonings (garlic, onion, lemon, herbs)

Practical Tips:
- Maximum: 5g salt/day (1 level teaspoon)
- Remove the salt shaker from the table
- Read food labels`,
    },
    es: {
      title: 'Dieta Hiposódica',
      content: `Orientaciones para Dieta con Bajo Contenido de Sodio

La reducción de sal en la alimentación es fundamental para el control de la presión arterial.

Alimentos a EVITAR:
- Embutidos (jamón, salchicha, mortadela)
- Enlatados y conservas
- Condimentos preparados

Alimentos PERMITIDOS:
- Frutas, verduras y legumbres frescas
- Carnes magras
- Condimentos naturales`,
    },
  },
  diet_diabetic: {
    pt: {
      title: 'Dieta para Diabéticos',
      content: `Orientações Alimentares para Diabetes

Uma alimentação adequada é pilar fundamental no controle do diabetes.

Princípios Gerais:
- Faça 5-6 refeições ao dia (3 principais + 2-3 lanches)
- Não pule refeições
- Mantenha horários regulares
- Inclua fibras em todas as refeições

Modelo do Prato Saudável:
- Metade do prato: Salada e legumes
- 1/4 do prato: Proteína (carne, frango, peixe, ovo)
- 1/4 do prato: Carboidrato (arroz, batata, macarrão integral)

Alimentos com Baixo Índice Glicêmico (preferir):
- Pão integral, aveia, arroz integral
- Leguminosas (feijão, lentilha, grão-de-bico)
- Frutas com casca (maçã, pêra)

Alimentos a EVITAR:
- Açúcar refinado, doces, refrigerantes
- Farinha branca, pão branco
- Sucos de frutas (mesmo naturais - preferir a fruta inteira)
- Frituras`,
    },
    en: {
      title: 'Diabetic Diet',
      content: `Dietary Guidelines for Diabetes

Proper nutrition is a fundamental pillar in diabetes management.

General Principles:
- Eat 5-6 meals a day (3 main + 2-3 snacks)
- Don't skip meals
- Keep regular schedules
- Include fiber in every meal

Healthy Plate Model:
- Half plate: Salad and vegetables
- 1/4 plate: Protein
- 1/4 plate: Carbohydrate

Foods to AVOID:
- Refined sugar, sweets, sodas
- White flour, white bread
- Fruit juices (even natural - prefer whole fruit)`,
    },
    es: {
      title: 'Dieta para Diabéticos',
      content: `Orientaciones Alimentarias para Diabetes

Una alimentación adecuada es pilar fundamental en el control de la diabetes.

Principios Generales:
- Haga 5-6 comidas al día
- No salte comidas
- Mantenga horarios regulares

Alimentos a EVITAR:
- Azúcar refinada, dulces, refrescos
- Harina blanca, pan blanco`,
    },
  },
  pre_op: {
    pt: {
      title: 'Orientações Pré-Operatórias',
      content: `Orientações Pré-Operatórias

Jejum:
- Jejum absoluto de 8 horas para sólidos
- Líquidos claros (água, chá) podem ser ingeridos até 2 horas antes

Medicamentos:
- Informe TODOS os medicamentos que usa ao anestesista
- Anti-hipertensivos: manter com pequeno gole de água
- Anticoagulantes e AAS: suspender conforme orientação médica
- Metformina: suspender 48h antes

No Dia da Cirurgia:
- Traga documentos e exames pré-operatórios
- Vista roupas confortáveis e folgadas
- Remova esmalte das unhas, joias e piercings
- Não aplique cremes ou maquiagem
- Traga um acompanhante maior de 18 anos

O que NÃO fazer 24h antes:
- Não consumir bebidas alcoólicas
- Não fumar
- Evitar refeições pesadas`,
    },
    en: {
      title: 'Pre-Operative Instructions',
      content: `Pre-Operative Instructions

Fasting:
- Absolute fast of 8 hours for solids
- Clear liquids (water, tea) allowed up to 2 hours before

Medications:
- Inform ALL medications to the anesthesiologist
- Blood pressure meds: maintain with small sip of water
- Anticoagulants: suspend as directed

On Surgery Day:
- Bring documents and pre-operative exams
- Wear comfortable clothing
- Remove nail polish, jewelry, and piercings
- Bring an adult companion`,
    },
    es: {
      title: 'Orientaciones Preoperatorias',
      content: `Orientaciones Preoperatorias

Ayuno:
- Ayuno absoluto de 8 horas para sólidos
- Líquidos claros permitidos hasta 2 horas antes

Medicamentos:
- Informe TODOS los medicamentos al anestesiólogo

El Día de la Cirugía:
- Traiga documentos y exámenes
- Vista ropa cómoda
- Retire esmalte, joyas y piercings`,
    },
  },
  post_op: {
    pt: {
      title: 'Orientações Pós-Operatórias',
      content: `Orientações Pós-Operatórias

Repouso:
- Mantenha repouso relativo nas primeiras 48-72 horas
- Evite esforços físicos por ______ dias (conforme orientação médica)
- Deambulação precoce é recomendada (caminhadas leves)

Alimentação:
- Inicie com líquidos claros e evolua gradualmente
- Evite alimentos gordurosos e de difícil digestão
- Mantenha-se bem hidratado

Medicamentos:
- Tome os medicamentos prescritos nos horários corretos
- Não se automedique
- Não suspenda medicamentos sem orientação médica

Sinais de ALERTA - Procure o hospital:
- Febre acima de 38°C
- Dor intensa que não melhora com analgésicos
- Sangramento abundante pela ferida
- Vermelhidão, inchaço ou secreção na ferida
- Falta de ar ou dor no peito

Retorno:
- Retorno em ______ dias para revisão
- Traga os exames solicitados`,
    },
    en: {
      title: 'Post-Operative Instructions',
      content: `Post-Operative Instructions

Rest:
- Relative rest for the first 48-72 hours
- Avoid physical exertion for ______ days
- Early walking is recommended

Diet:
- Start with clear liquids and advance gradually
- Avoid greasy and hard-to-digest foods
- Stay well hydrated

WARNING Signs - Go to the hospital:
- Fever above 38°C (100.4°F)
- Intense pain unresponsive to analgesics
- Heavy wound bleeding
- Redness, swelling, or discharge from wound`,
    },
    es: {
      title: 'Orientaciones Postoperatorias',
      content: `Orientaciones Postoperatorias

Reposo:
- Reposo relativo las primeras 48-72 horas
- Evite esfuerzos físicos por ______ días

Signos de ALERTA:
- Fiebre superior a 38°C
- Dolor intenso que no mejora con analgésicos
- Sangrado abundante por la herida`,
    },
  },
  wound_care: {
    pt: {
      title: 'Cuidados com a Ferida',
      content: `Cuidados com a Ferida Cirúrgica

Curativo:
- Mantenha o curativo seco e limpo por 24-48 horas
- Troque o curativo diariamente ou quando sujo/úmido
- Lave as mãos antes e depois de mexer no curativo
- Use soro fisiológico para limpeza

Banho:
- Pode tomar banho após remoção do curativo (geralmente 48h)
- Evite esfregar a ferida - deixe a água escorrer suavemente
- Seque com toalha limpa, sem esfregar

Sinais de Infecção - Procure seu médico:
- Vermelhidão progressiva ao redor da ferida
- Inchaço que não diminui
- Secreção amarelada ou esverdeada (pus)
- Cheiro forte/desagradável
- Febre acima de 37,8°C
- Aumento da dor no local

Evitar:
- Não aplique produtos caseiros (açúcar, mel, pomadas sem receita)
- Não exponha a ferida ao sol por 6 meses
- Não remova os pontos por conta própria`,
    },
    en: {
      title: 'Wound Care',
      content: `Surgical Wound Care

Dressing:
- Keep the dressing dry and clean for 24-48 hours
- Change daily or when dirty/wet
- Wash hands before and after touching the dressing

Bathing:
- You can shower after dressing removal (usually 48h)
- Don't scrub the wound

Signs of Infection - Contact your doctor:
- Progressive redness around the wound
- Persistent swelling
- Yellow or green discharge (pus)
- Fever above 37.8°C`,
    },
    es: {
      title: 'Cuidados de la Herida',
      content: `Cuidados de la Herida Quirúrgica

Curación:
- Mantenga la curación seca y limpia por 24-48 horas
- Cambie diariamente o cuando esté sucio

Signos de Infección:
- Enrojecimiento progresivo
- Secreción amarillenta o verdosa
- Fiebre superior a 37.8°C`,
    },
  },
  medication_guidance: {
    pt: {
      title: 'Orientações sobre Medicamentos',
      content: `Orientações sobre o Uso de Medicamentos

Siga rigorosamente as orientações de horário e dose prescritas pelo seu médico.

Medicamento | Dose | Horário | Via | Duração | Observações

Recomendações Gerais:
- Não altere doses ou pare de tomar sem orientação médica
- Se esquecer uma dose, tome assim que lembrar (salvo se próximo da próxima)
- Armazene em local fresco e seco, longe da luz solar
- Verifique a validade antes de usar
- Mantenha fora do alcance de crianças

Interações Importantes:
- Evite bebidas alcoólicas durante o tratamento
- Informe seu médico sobre TODOS os medicamentos que usa
- Alguns medicamentos não devem ser tomados juntos - respeite os intervalos`,
    },
    en: {
      title: 'Medication Guidelines',
      content: `Medication Use Guidelines

Follow the prescribed dosage and schedule strictly.

Medication | Dose | Schedule | Route | Duration | Notes

General Recommendations:
- Don't change doses or stop without medical guidance
- If you miss a dose, take it as soon as you remember
- Store in a cool, dry place`,
    },
    es: {
      title: 'Orientaciones sobre Medicamentos',
      content: `Orientaciones sobre el Uso de Medicamentos

Siga rigurosamente las orientaciones de horario y dosis prescritas.

Medicamento | Dosis | Horario | Vía | Duración | Observaciones

Recomendaciones Generales:
- No altere dosis sin orientación médica`,
    },
  },
};
