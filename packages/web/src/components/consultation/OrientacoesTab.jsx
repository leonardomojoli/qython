// frontend/src/components/consultation/OrientacoesTab.js

import React, { useState } from 'react';
import styles from './OrientacoesTab.module.css';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faBookMedical,
    faWandMagicSparkles,
    faFilePdf,
    faUserPlus,
    faTimes,
    faTint,
    faHeartPulse,
    faAppleWhole,
    faUtensils,
    faHospital,
    faBandage,
    faCapsules,
    faSpinner,
    faThumbsUp,
    faThumbsDown
} from '@fortawesome/free-solid-svg-icons';
import { createOrientation, generateOrientation, getOrientationPdf, submitFeedback } from '../../api';
import { useNotification } from '../../contexts/NotificationContext';
import PatientPickerModal from './PatientPickerModal';
import FeedbackModal from '../shared/FeedbackModal';

// Template definitions (matching backend orientation_templates.py)
const TEMPLATES = [
    { key: 'glucose_control', icon: faTint, specialty: 'Endocrinologia' },
    { key: 'blood_pressure', icon: faHeartPulse, specialty: 'Cardiologia' },
    { key: 'diet_low_sodium', icon: faAppleWhole, specialty: 'Cardiologia' },
    { key: 'diet_diabetic', icon: faUtensils, specialty: 'Endocrinologia' },
    { key: 'pre_op', icon: faHospital, specialty: 'Cirurgia Geral' },
    { key: 'post_op', icon: faHospital, specialty: 'Cirurgia Geral' },
    { key: 'wound_care', icon: faBandage, specialty: 'Cirurgia Geral' },
    { key: 'medication_guidance', icon: faCapsules, specialty: 'Clínica Médica' },
];

// Template content per language (simplified versions for frontend preview)
const TEMPLATE_CONTENT = {
    glucose_control: {
        pt: { title: 'Controle de Glicemia', content: '<h2>Tabela de Controle de Glicemia</h2><p>Registre suas medições diárias de glicemia capilar nos horários indicados pelo seu médico.</p><table border="1" cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;"><tr><th>Data</th><th>Jejum</th><th>Pós-café</th><th>Pré-almoço</th><th>Pós-almoço</th><th>Pré-jantar</th><th>Pós-jantar</th></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr></table><h3>Valores de Referência</h3><ul><li><strong>Jejum:</strong> 70-100 mg/dL (bom) | 100-130 mg/dL (atenção) | >130 mg/dL (alto)</li><li><strong>Pós-refeição (2h):</strong> &lt;140 mg/dL (bom) | 140-180 mg/dL (atenção) | &gt;180 mg/dL (alto)</li><li><strong>Hipoglicemia:</strong> &lt;70 mg/dL - procure atendimento</li></ul>' },
        en: { title: 'Blood Glucose Control', content: '<h2>Blood Glucose Control Chart</h2><p>Record your daily capillary blood glucose measurements at the times indicated by your doctor.</p><table border="1" cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;"><tr><th>Date</th><th>Fasting</th><th>Post-breakfast</th><th>Pre-lunch</th><th>Post-lunch</th><th>Pre-dinner</th><th>Post-dinner</th></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr></table><h3>Reference Values</h3><ul><li><strong>Fasting:</strong> 70-100 mg/dL (good) | 100-130 mg/dL (attention) | >130 mg/dL (high)</li><li><strong>Post-meal (2h):</strong> &lt;140 mg/dL (good) | 140-180 mg/dL (attention) | &gt;180 mg/dL (high)</li></ul>' },
        es: { title: 'Control de Glucemia', content: '<h2>Tabla de Control de Glucemia</h2><p>Registre sus mediciones diarias de glucemia capilar en los horarios indicados por su médico.</p><table border="1" cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;"><tr><th>Fecha</th><th>Ayuno</th><th>Post-desayuno</th><th>Pre-almuerzo</th><th>Post-almuerzo</th><th>Pre-cena</th><th>Post-cena</th></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr></table><h3>Valores de Referencia</h3><ul><li><strong>Ayuno:</strong> 70-100 mg/dL (bueno) | 100-130 mg/dL (atención) | >130 mg/dL (alto)</li></ul>' }
    },
    blood_pressure: {
        pt: { title: 'Controle de Pressão Arterial', content: '<h2>Diário de Pressão Arterial</h2><p>Meça sua pressão arterial nos mesmos horários todos os dias, preferencialmente de manhã e à noite.</p><table border="1" cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;"><tr><th>Data</th><th>Manhã (PAS/PAD)</th><th>FC</th><th>Noite (PAS/PAD)</th><th>FC</th><th>Obs</th></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td></tr></table><h3>Classificação</h3><ul><li><strong>Normal:</strong> &lt;120/80 mmHg</li><li><strong>Elevada:</strong> 120-129/&lt;80 mmHg</li><li><strong>Hipertensão Grau 1:</strong> 130-139/80-89 mmHg</li><li><strong>Hipertensão Grau 2:</strong> ≥140/≥90 mmHg</li></ul><h3>Orientações</h3><ul><li>Fique sentado em repouso por 5 minutos antes de medir</li><li>Não fume, beba café ou faça exercício 30 minutos antes</li><li>Apoie o braço na altura do coração</li></ul>' },
        en: { title: 'Blood Pressure Control', content: '<h2>Blood Pressure Diary</h2><p>Measure your blood pressure at the same times every day, preferably morning and evening.</p><table border="1" cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;"><tr><th>Date</th><th>Morning (SBP/DBP)</th><th>HR</th><th>Evening (SBP/DBP)</th><th>HR</th><th>Notes</th></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td></tr></table><h3>Classification</h3><ul><li><strong>Normal:</strong> &lt;120/80 mmHg</li><li><strong>Elevated:</strong> 120-129/&lt;80 mmHg</li><li><strong>Stage 1:</strong> 130-139/80-89 mmHg</li><li><strong>Stage 2:</strong> ≥140/≥90 mmHg</li></ul>' },
        es: { title: 'Control de Presión Arterial', content: '<h2>Diario de Presión Arterial</h2><p>Mida su presión arterial a las mismas horas todos los días.</p><table border="1" cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;"><tr><th>Fecha</th><th>Mañana (PAS/PAD)</th><th>FC</th><th>Noche (PAS/PAD)</th><th>FC</th><th>Obs</th></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td></tr></table><h3>Clasificación</h3><ul><li><strong>Normal:</strong> &lt;120/80 mmHg</li><li><strong>Elevada:</strong> 120-129/&lt;80 mmHg</li></ul>' }
    },
    diet_low_sodium: {
        pt: { title: 'Dieta Hipossódica', content: '<h2>Orientações para Dieta com Baixo Teor de Sódio</h2><p>A redução do sal na alimentação é fundamental para o controle da pressão arterial.</p><h3>Alimentos a EVITAR</h3><ul><li>Embutidos (presunto, salsicha, mortadela, salame)</li><li>Enlatados e conservas</li><li>Temperos prontos (caldos de carne, sopas industrializadas)</li><li>Queijos amarelos e processados</li><li>Salgadinhos, biscoitos salgados</li></ul><h3>Alimentos PERMITIDOS</h3><ul><li>Frutas, verduras e legumes frescos</li><li>Carnes magras (frango, peixe)</li><li>Arroz, feijão, lentilha</li><li>Temperos naturais (alho, cebola, limão, ervas)</li><li>Queijo branco (com moderação)</li></ul><h3>Dicas Práticas</h3><ul><li>Limite máximo: 5g de sal/dia (1 colher de chá rasa)</li><li>Retire o saleiro da mesa</li><li>Leia os rótulos dos alimentos</li><li>Prefira alimentos in natura</li></ul>' },
        en: { title: 'Low Sodium Diet', content: '<h2>Low Sodium Diet Guidelines</h2><p>Reducing salt intake is essential for blood pressure control.</p><h3>Foods to AVOID</h3><ul><li>Processed meats (ham, sausage, bacon)</li><li>Canned and preserved foods</li><li>Ready-made seasonings and bouillon cubes</li><li>Processed cheeses</li><li>Salty snacks, crackers</li></ul><h3>Foods ALLOWED</h3><ul><li>Fresh fruits and vegetables</li><li>Lean meats (chicken, fish)</li><li>Rice, beans, lentils</li><li>Natural seasonings (garlic, onion, lemon, herbs)</li></ul><h3>Practical Tips</h3><ul><li>Maximum: 5g salt/day (1 level teaspoon)</li><li>Remove the salt shaker from the table</li><li>Read food labels</li></ul>' },
        es: { title: 'Dieta Hiposódica', content: '<h2>Orientaciones para Dieta con Bajo Contenido de Sodio</h2><p>La reducción de sal en la alimentación es fundamental para el control de la presión arterial.</p><h3>Alimentos a EVITAR</h3><ul><li>Embutidos (jamón, salchicha, mortadela)</li><li>Enlatados y conservas</li><li>Condimentos preparados</li></ul><h3>Alimentos PERMITIDOS</h3><ul><li>Frutas, verduras y legumbres frescas</li><li>Carnes magras</li><li>Condimentos naturales</li></ul>' }
    },
    diet_diabetic: {
        pt: { title: 'Dieta para Diabéticos', content: '<h2>Orientações Alimentares para Diabetes</h2><p>Uma alimentação adequada é pilar fundamental no controle do diabetes.</p><h3>Princípios Gerais</h3><ul><li>Faça 5-6 refeições ao dia (3 principais + 2-3 lanches)</li><li>Não pule refeições</li><li>Mantenha horários regulares</li><li>Inclua fibras em todas as refeições</li></ul><h3>Modelo do Prato Saudável</h3><ul><li><strong>Metade do prato:</strong> Salada e legumes</li><li><strong>1/4 do prato:</strong> Proteína (carne, frango, peixe, ovo)</li><li><strong>1/4 do prato:</strong> Carboidrato (arroz, batata, macarrão integral)</li></ul><h3>Alimentos com Baixo Índice Glicêmico (preferir)</h3><ul><li>Pão integral, aveia, arroz integral</li><li>Leguminosas (feijão, lentilha, grão-de-bico)</li><li>Frutas com casca (maçã, pêra)</li></ul><h3>Alimentos a EVITAR</h3><ul><li>Açúcar refinado, doces, refrigerantes</li><li>Farinha branca, pão branco</li><li>Sucos de frutas (mesmo naturais - preferir a fruta inteira)</li><li>Frituras</li></ul>' },
        en: { title: 'Diabetic Diet', content: '<h2>Dietary Guidelines for Diabetes</h2><p>Proper nutrition is a fundamental pillar in diabetes management.</p><h3>General Principles</h3><ul><li>Eat 5-6 meals a day (3 main + 2-3 snacks)</li><li>Don\'t skip meals</li><li>Keep regular schedules</li><li>Include fiber in every meal</li></ul><h3>Healthy Plate Model</h3><ul><li><strong>Half plate:</strong> Salad and vegetables</li><li><strong>1/4 plate:</strong> Protein</li><li><strong>1/4 plate:</strong> Carbohydrate</li></ul><h3>Foods to AVOID</h3><ul><li>Refined sugar, sweets, sodas</li><li>White flour, white bread</li><li>Fruit juices (even natural - prefer whole fruit)</li></ul>' },
        es: { title: 'Dieta para Diabéticos', content: '<h2>Orientaciones Alimentarias para Diabetes</h2><p>Una alimentación adecuada es pilar fundamental en el control de la diabetes.</p><h3>Principios Generales</h3><ul><li>Haga 5-6 comidas al día</li><li>No salte comidas</li><li>Mantenga horarios regulares</li></ul><h3>Alimentos a EVITAR</h3><ul><li>Azúcar refinada, dulces, refrescos</li><li>Harina blanca, pan blanco</li></ul>' }
    },
    pre_op: {
        pt: { title: 'Orientações Pré-Operatórias', content: '<h2>Orientações Pré-Operatórias</h2><h3>Jejum</h3><ul><li>Jejum absoluto de <strong>8 horas</strong> para sólidos</li><li>Líquidos claros (água, chá) podem ser ingeridos até <strong>2 horas</strong> antes</li></ul><h3>Medicamentos</h3><ul><li>Informe TODOS os medicamentos que usa ao anestesista</li><li>Anti-hipertensivos: manter com pequeno gole de água</li><li>Anticoagulantes e AAS: suspender conforme orientação médica</li><li>Metformina: suspender 48h antes</li></ul><h3>No Dia da Cirurgia</h3><ul><li>Traga documentos e exames pré-operatórios</li><li>Vista roupas confortáveis e folgadas</li><li>Remova esmalte das unhas, joias e piercings</li><li>Não aplique cremes ou maquiagem</li><li>Traga um acompanhante maior de 18 anos</li></ul><h3>O que NÃO fazer 24h antes</h3><ul><li>Não consumir bebidas alcoólicas</li><li>Não fumar</li><li>Evitar refeições pesadas</li></ul>' },
        en: { title: 'Pre-Operative Instructions', content: '<h2>Pre-Operative Instructions</h2><h3>Fasting</h3><ul><li>Absolute fast of <strong>8 hours</strong> for solids</li><li>Clear liquids (water, tea) allowed up to <strong>2 hours</strong> before</li></ul><h3>Medications</h3><ul><li>Inform ALL medications to the anesthesiologist</li><li>Blood pressure meds: maintain with small sip of water</li><li>Anticoagulants: suspend as directed</li></ul><h3>On Surgery Day</h3><ul><li>Bring documents and pre-operative exams</li><li>Wear comfortable clothing</li><li>Remove nail polish, jewelry, and piercings</li><li>Bring an adult companion</li></ul>' },
        es: { title: 'Orientaciones Preoperatorias', content: '<h2>Orientaciones Preoperatorias</h2><h3>Ayuno</h3><ul><li>Ayuno absoluto de <strong>8 horas</strong> para sólidos</li><li>Líquidos claros permitidos hasta <strong>2 horas</strong> antes</li></ul><h3>Medicamentos</h3><ul><li>Informe TODOS los medicamentos al anestesiólogo</li></ul><h3>El Día de la Cirugía</h3><ul><li>Traiga documentos y exámenes</li><li>Vista ropa cómoda</li><li>Retire esmalte, joyas y piercings</li></ul>' }
    },
    post_op: {
        pt: { title: 'Orientações Pós-Operatórias', content: '<h2>Orientações Pós-Operatórias</h2><h3>Repouso</h3><ul><li>Mantenha repouso relativo nas primeiras 48-72 horas</li><li>Evite esforços físicos por ______ dias (conforme orientação médica)</li><li>Deambulação precoce é recomendada (caminhadas leves)</li></ul><h3>Alimentação</h3><ul><li>Inicie com líquidos claros e evolua gradualmente</li><li>Evite alimentos gordurosos e de difícil digestão</li><li>Mantenha-se bem hidratado</li></ul><h3>Medicamentos</h3><ul><li>Tome os medicamentos prescritos nos horários corretos</li><li>Não se automedique</li><li>Não suspenda medicamentos sem orientação médica</li></ul><h3>Sinais de ALERTA - Procure o hospital</h3><ul><li>Febre acima de 38°C</li><li>Dor intensa que não melhora com analgésicos</li><li>Sangramento abundante pela ferida</li><li>Vermelhidão, inchaço ou secreção na ferida</li><li>Falta de ar ou dor no peito</li></ul><h3>Retorno</h3><ul><li>Retorno em ______ dias para revisão</li><li>Traga os exames solicitados</li></ul>' },
        en: { title: 'Post-Operative Instructions', content: '<h2>Post-Operative Instructions</h2><h3>Rest</h3><ul><li>Relative rest for the first 48-72 hours</li><li>Avoid physical exertion for ______ days</li><li>Early walking is recommended</li></ul><h3>Diet</h3><ul><li>Start with clear liquids and advance gradually</li><li>Avoid greasy and hard-to-digest foods</li><li>Stay well hydrated</li></ul><h3>WARNING Signs - Go to the hospital</h3><ul><li>Fever above 38°C (100.4°F)</li><li>Intense pain unresponsive to analgesics</li><li>Heavy wound bleeding</li><li>Redness, swelling, or discharge from wound</li></ul>' },
        es: { title: 'Orientaciones Postoperatorias', content: '<h2>Orientaciones Postoperatorias</h2><h3>Reposo</h3><ul><li>Reposo relativo las primeras 48-72 horas</li><li>Evite esfuerzos físicos por ______ días</li></ul><h3>Signos de ALERTA</h3><ul><li>Fiebre superior a 38°C</li><li>Dolor intenso que no mejora con analgésicos</li><li>Sangrado abundante por la herida</li></ul>' }
    },
    wound_care: {
        pt: { title: 'Cuidados com a Ferida', content: '<h2>Cuidados com a Ferida Cirúrgica</h2><h3>Curativo</h3><ul><li>Mantenha o curativo seco e limpo por 24-48 horas</li><li>Troque o curativo diariamente ou quando sujo/úmido</li><li>Lave as mãos antes e depois de mexer no curativo</li><li>Use soro fisiológico para limpeza</li></ul><h3>Banho</h3><ul><li>Pode tomar banho após remoção do curativo (geralmente 48h)</li><li>Evite esfregar a ferida - deixe a água escorrer suavemente</li><li>Seque com toalha limpa, sem esfregar</li></ul><h3>Sinais de Infecção - Procure seu médico</h3><ul><li>Vermelhidão progressiva ao redor da ferida</li><li>Inchaço que não diminui</li><li>Secreção amarelada ou esverdeada (pus)</li><li>Cheiro forte/desagradável</li><li>Febre acima de 37,8°C</li><li>Aumento da dor no local</li></ul><h3>Evitar</h3><ul><li>Não aplique produtos caseiros (açúcar, mel, pomadas sem receita)</li><li>Não exponha a ferida ao sol por 6 meses</li><li>Não remova os pontos por conta própria</li></ul>' },
        en: { title: 'Wound Care', content: '<h2>Surgical Wound Care</h2><h3>Dressing</h3><ul><li>Keep the dressing dry and clean for 24-48 hours</li><li>Change daily or when dirty/wet</li><li>Wash hands before and after touching the dressing</li></ul><h3>Bathing</h3><ul><li>You can shower after dressing removal (usually 48h)</li><li>Don\'t scrub the wound</li></ul><h3>Signs of Infection - Contact your doctor</h3><ul><li>Progressive redness around the wound</li><li>Persistent swelling</li><li>Yellow or green discharge (pus)</li><li>Fever above 37.8°C</li></ul>' },
        es: { title: 'Cuidados de la Herida', content: '<h2>Cuidados de la Herida Quirúrgica</h2><h3>Curación</h3><ul><li>Mantenga la curación seca y limpia por 24-48 horas</li><li>Cambie diariamente o cuando esté sucio</li></ul><h3>Signos de Infección</h3><ul><li>Enrojecimiento progresivo</li><li>Secreción amarillenta o verdosa</li><li>Fiebre superior a 37.8°C</li></ul>' }
    },
    medication_guidance: {
        pt: { title: 'Orientações sobre Medicamentos', content: '<h2>Orientações sobre o Uso de Medicamentos</h2><p>Siga rigorosamente as orientações de horário e dose prescritas pelo seu médico.</p><table border="1" cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;"><tr><th>Medicamento</th><th>Dose</th><th>Horário</th><th>Via</th><th>Duração</th><th>Observações</th></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td></tr></table><h3>Recomendações Gerais</h3><ul><li>Não altere doses ou pare de tomar sem orientação médica</li><li>Se esquecer uma dose, tome assim que lembrar (salvo se próximo da próxima)</li><li>Armazene em local fresco e seco, longe da luz solar</li><li>Verifique a validade antes de usar</li><li>Mantenha fora do alcance de crianças</li></ul><h3>Interações Importantes</h3><ul><li>Evite bebidas alcoólicas durante o tratamento</li><li>Informe seu médico sobre TODOS os medicamentos que usa</li><li>Alguns medicamentos não devem ser tomados juntos - respeite os intervalos</li></ul>' },
        en: { title: 'Medication Guidelines', content: '<h2>Medication Use Guidelines</h2><p>Follow the prescribed dosage and schedule strictly.</p><table border="1" cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;"><tr><th>Medication</th><th>Dose</th><th>Schedule</th><th>Route</th><th>Duration</th><th>Notes</th></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td></tr></table><h3>General Recommendations</h3><ul><li>Don\'t change doses or stop without medical guidance</li><li>If you miss a dose, take it as soon as you remember</li><li>Store in a cool, dry place</li></ul>' },
        es: { title: 'Orientaciones sobre Medicamentos', content: '<h2>Orientaciones sobre el Uso de Medicamentos</h2><p>Siga rigurosamente las orientaciones de horario y dosis prescritas.</p><table border="1" cellpadding="8" cellspacing="0" style="width:100%;border-collapse:collapse;"><tr><th>Medicamento</th><th>Dosis</th><th>Horario</th><th>Vía</th><th>Duración</th><th>Observaciones</th></tr><tr><td></td><td></td><td></td><td></td><td></td><td></td></tr></table><h3>Recomendaciones Generales</h3><ul><li>No altere dosis sin orientación médica</li></ul>' }
    },
};

function OrientacoesTab({ isEmbedded = false }) {
    const { t, i18n } = useTranslation();
    const { addNotification } = useNotification();

    const [mode, setMode] = useState('templates'); // 'templates' | 'ai'
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [editableContent, setEditableContent] = useState('');
    const [editableTitle, setEditableTitle] = useState('');

    // AI mode state
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiSpecialty, setAiSpecialty] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    // Feedback da orientação gerada por IA (alimenta o flywheel)
    const [aiTrainingDataId, setAiTrainingDataId] = useState(null);
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
    const [feedbackGiven, setFeedbackGiven] = useState(false);

    // Shared state
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [isPatientPickerOpen, setIsPatientPickerOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const getLang = () => {
        const lang = i18n.language || 'pt';
        if (lang.startsWith('pt')) return 'pt';
        if (lang.startsWith('es')) return 'es';
        return 'en';
    };

    const handlePatientSelect = (patient) => {
        setSelectedPatient(patient);
        setIsPatientPickerOpen(false);
    };

    const handleClearPatient = () => {
        setSelectedPatient(null);
    };

    const handleSelectTemplate = (templateKey) => {
        const lang = getLang();
        const tmpl = TEMPLATE_CONTENT[templateKey]?.[lang];
        if (tmpl) {
            setSelectedTemplate(templateKey);
            setEditableTitle(tmpl.title);
            setEditableContent(tmpl.content);
        }
    };

    const handleBackToTemplates = () => {
        setSelectedTemplate(null);
        setEditableContent('');
        setEditableTitle('');
    };

    const handleGenerateAI = async () => {
        if (!aiPrompt.trim()) {
            addNotification(t('orientationDescriptionRequired', 'Descreva o material desejado'), 'warning');
            return;
        }

        setIsGenerating(true);
        try {
            const lang = getLang();
            const langMap = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' };

            const result = await generateOrientation({
                patient_id: selectedPatient?.id || null,
                prompt: aiPrompt,
                specialty: aiSpecialty || null,
                language_code: langMap[lang] || 'pt-BR',
            });

            setEditableTitle(result.title);
            setEditableContent(result.content);
            setSelectedTemplate('__ai_generated__');
            setAiTrainingDataId(result.training_data_id || null);
            setFeedbackGiven(false);
            addNotification(t('orientationGenerated', 'Material gerado com sucesso!'), 'success');

            // Download PDF automatically
            try {
                const pdfBlob = await getOrientationPdf(result.id);
                const url = window.URL.createObjectURL(pdfBlob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `Orientacao_${result.title.replace(/\s/g, '_')}.pdf`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);
            } catch (pdfError) {
                console.error('Error downloading PDF:', pdfError);
            }

        } catch (error) {
            console.error('Error generating orientation:', error);
            addNotification(
                error?.message || t('orientationGenerateError', 'Erro ao gerar material'),
                'error'
            );
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDownloadPdf = async () => {
        setIsSaving(true);
        try {
            const result = await createOrientation({
                patient_id: selectedPatient?.id || null,
                generation_type: selectedTemplate === '__ai_generated__' ? 'ai_generated' : 'template',
                template_key: selectedTemplate !== '__ai_generated__' ? selectedTemplate : null,
                title: editableTitle,
                content: editableContent,
                specialty: TEMPLATES.find(t => t.key === selectedTemplate)?.specialty || aiSpecialty || null,
            });

            addNotification(t('orientationSaved', 'Orientação salva com sucesso!'), 'success');

            // Download PDF
            const pdfBlob = await getOrientationPdf(result.id);
            const url = window.URL.createObjectURL(pdfBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Orientacao_${editableTitle.replace(/\s/g, '_')}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

        } catch (error) {
            console.error('Error saving orientation:', error);
            addNotification(
                error?.message || t('orientationSaveError', 'Erro ao salvar orientação'),
                'error'
            );
        } finally {
            setIsSaving(false);
        }
    };

    const renderPatientSelector = () => (
        <div className={styles.section}>
            <label className={styles.label}>
                {t('patient', 'Paciente')} <span className={styles.optional}>({t('optional', 'opcional')})</span>
            </label>
            <div className={styles.patientRow}>
                {selectedPatient ? (
                    <div className={styles.selectedPatient}>
                        <div className={styles.patientInfo}>
                            <span className={styles.patientName}>{selectedPatient.full_name}</span>
                            {selectedPatient.birth_date && (
                                <span className={styles.patientMeta}>
                                    {new Date(selectedPatient.birth_date).toLocaleDateString()}
                                </span>
                            )}
                        </div>
                        <button
                            type="button"
                            className={styles.clearPatientBtn}
                            onClick={handleClearPatient}
                        >
                            <FontAwesomeIcon icon={faTimes} />
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        className={styles.selectPatientBtn}
                        onClick={() => setIsPatientPickerOpen(true)}
                    >
                        <FontAwesomeIcon icon={faUserPlus} />
                        <span>{t('selectOrCreatePatient', 'Selecionar Paciente')}</span>
                    </button>
                )}
            </div>
        </div>
    );

    const renderTemplateGrid = () => (
        <div className={styles.templateGrid}>
            {TEMPLATES.map(tmpl => {
                const lang = getLang();
                const content = TEMPLATE_CONTENT[tmpl.key]?.[lang];
                return (
                    <button
                        key={tmpl.key}
                        className={styles.templateCard}
                        onClick={() => handleSelectTemplate(tmpl.key)}
                    >
                        <div className={styles.templateIcon}>
                            <FontAwesomeIcon icon={tmpl.icon} />
                        </div>
                        <div className={styles.templateInfo}>
                            <span className={styles.templateTitle}>{content?.title || tmpl.key}</span>
                            <span className={styles.templateSpecialty}>{tmpl.specialty}</span>
                        </div>
                    </button>
                );
            })}
        </div>
    );

    const renderTemplatePreview = () => (
        <div className={styles.previewContainer}>
            <button className={styles.backButton} onClick={handleBackToTemplates}>
                {t('backToTemplates', 'Voltar aos modelos')}
            </button>
            <div className={styles.row}>
                <div className={styles.col}>
                    <label className={styles.label}>{t('orientationTitle', 'Título')}</label>
                    <input
                        className={styles.input}
                        value={editableTitle}
                        onChange={(e) => setEditableTitle(e.target.value)}
                    />
                </div>
            </div>
            <div className={styles.row}>
                <div className={styles.col}>
                    <label className={styles.label}>{t('editBeforeDownload', 'Edite antes de baixar')}</label>
                    <textarea
                        className={styles.textarea}
                        value={editableContent}
                        onChange={(e) => setEditableContent(e.target.value)}
                        rows={12}
                    />
                </div>
            </div>
        </div>
    );

    const renderAIMode = () => (
        <div className={styles.aiContainer}>
            <div className={styles.row}>
                <div className={styles.col}>
                    <label className={styles.label}>{t('orientationDescription', 'Descreva o material desejado')}</label>
                    <textarea
                        className={styles.textarea}
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder={t('orientationPromptPlaceholder', 'Ex: Orientações de cuidados pós-operatórios para paciente submetido a colecistectomia laparoscópica...')}
                        rows={4}
                    />
                </div>
            </div>
            <div className={styles.row}>
                <div className={styles.col}>
                    <label className={styles.label}>{t('specialty', 'Especialidade')} <span className={styles.optional}>({t('optional', 'opcional')})</span></label>
                    <input
                        className={styles.input}
                        value={aiSpecialty}
                        onChange={(e) => setAiSpecialty(e.target.value)}
                        placeholder="Ex: Cirurgia Geral"
                    />
                </div>
            </div>
            <button
                className={styles.aiGenerateButton}
                onClick={handleGenerateAI}
                disabled={isGenerating || !aiPrompt.trim()}
            >
                {isGenerating ? (
                    <>
                        <FontAwesomeIcon icon={faSpinner} spin />
                        {t('orientationGenerating', 'Gerando material...')}
                    </>
                ) : (
                    <>
                        <FontAwesomeIcon icon={faWandMagicSparkles} />
                        {t('orientationAiGenerate', 'Gerar com IA')}
                        <span className={styles.costBadge}>{t('orientationCost', '5 dracmas')}</span>
                    </>
                )}
            </button>

            {/* Show AI result as editable */}
            {selectedTemplate === '__ai_generated__' && editableContent && (
                <div className={styles.previewContainer}>
                    <div className={styles.row}>
                        <div className={styles.col}>
                            <label className={styles.label}>{t('orientationTitle', 'Título')}</label>
                            <input
                                className={styles.input}
                                value={editableTitle}
                                onChange={(e) => setEditableTitle(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className={styles.row}>
                        <div className={styles.col}>
                            <label className={styles.label}>{t('editBeforeDownload', 'Edite antes de baixar')}</label>
                            <textarea
                                className={styles.textarea}
                                value={editableContent}
                                onChange={(e) => setEditableContent(e.target.value)}
                                rows={12}
                            />
                        </div>
                    </div>
                    {aiTrainingDataId && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
                            <span style={{ fontSize: '0.9rem', opacity: 0.8 }}>{t('rateThisMaterial', 'Avalie este material:')}</span>
                            <button type="button" disabled={feedbackGiven} onClick={handleOrientationLike} title={t('like', 'Gostei')}
                                style={{ cursor: feedbackGiven ? 'default' : 'pointer', opacity: feedbackGiven ? 0.4 : 1, background: 'none', border: 'none', fontSize: '1.1rem', color: 'inherit' }}>
                                <FontAwesomeIcon icon={faThumbsUp} />
                            </button>
                            <button type="button" disabled={feedbackGiven} onClick={() => setIsFeedbackModalOpen(true)} title={t('dislike', 'Não gostei')}
                                style={{ cursor: feedbackGiven ? 'default' : 'pointer', opacity: feedbackGiven ? 0.4 : 1, background: 'none', border: 'none', fontSize: '1.1rem', color: 'inherit' }}>
                                <FontAwesomeIcon icon={faThumbsDown} />
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    const handleOrientationLike = async () => {
        try {
            await submitFeedback({
                feedback_type: 'like',
                content_type: 'patient_orientation',
                training_data_id: aiTrainingDataId,
                original_content: editableContent,
                user_prompt: aiPrompt,
                feedback_text: '',
                contact_permission: false,
            });
            setFeedbackGiven(true);
            addNotification(t('feedbackSentSuccess', 'Feedback enviado!'), 'success');
        } catch (error) {
            addNotification(t('feedbackSentError', 'Erro ao enviar feedback'), 'error');
        }
    };

    const handleOrientationFeedbackSubmit = async (comment) => {
        try {
            await submitFeedback({
                feedback_type: 'dislike',
                content_type: 'patient_orientation',
                training_data_id: aiTrainingDataId,
                original_content: editableContent,
                user_prompt: aiPrompt,
                feedback_text: comment,
                contact_permission: false,
            });
            setFeedbackGiven(true);
            addNotification(t('feedbackSentSuccess', 'Feedback enviado!'), 'success');
        } catch (error) {
            addNotification(t('feedbackSentError', 'Erro ao enviar feedback'), 'error');
        } finally {
            setIsFeedbackModalOpen(false);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>
                    <FontAwesomeIcon icon={faBookMedical} />
                    {t('patientOrientations', 'Orientações ao Paciente')}
                </h2>
            </div>

            {/* Mode Toggle */}
            <div className={styles.modeToggle}>
                <button
                    className={`${styles.modeBtn} ${mode === 'templates' ? styles.modeBtnActive : ''}`}
                    onClick={() => { setMode('templates'); setSelectedTemplate(null); setEditableContent(''); }}
                >
                    <FontAwesomeIcon icon={faBookMedical} />
                    {t('orientationTemplates', 'Modelos Prontos')}
                </button>
                <button
                    className={`${styles.modeBtn} ${mode === 'ai' ? styles.modeBtnActive : ''}`}
                    onClick={() => { setMode('ai'); setSelectedTemplate(null); setEditableContent(''); }}
                >
                    <FontAwesomeIcon icon={faWandMagicSparkles} />
                    {t('orientationAiGenerate', 'Gerar com IA')}
                </button>
            </div>

            {/* Patient Selector */}
            {renderPatientSelector()}

            {/* Content Area */}
            <div className={styles.formContent}>
                {mode === 'templates' && !selectedTemplate && renderTemplateGrid()}
                {mode === 'templates' && selectedTemplate && renderTemplatePreview()}
                {mode === 'ai' && renderAIMode()}
            </div>

            {/* Footer - Show PDF button when content is ready */}
            {editableContent && (
                <div className={styles.footer}>
                    <button
                        className={styles.generateButton}
                        onClick={handleDownloadPdf}
                        disabled={isSaving}
                    >
                        <FontAwesomeIcon icon={faFilePdf} />
                        {isSaving ? t('generating', 'Gerando...') : t('downloadPdf', 'Baixar PDF')}
                    </button>
                </div>
            )}

            {/* Patient Picker Modal */}
            <PatientPickerModal
                isOpen={isPatientPickerOpen}
                onClose={() => setIsPatientPickerOpen(false)}
                onSelect={handlePatientSelect}
            />

            <FeedbackModal
                isOpen={isFeedbackModalOpen}
                onClose={() => setIsFeedbackModalOpen(false)}
                onSubmit={handleOrientationFeedbackSubmit}
                feedbackType="dislike"
            />
        </div>
    );
}

export default OrientacoesTab;
