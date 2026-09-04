# qython/backend/services/data_collector_service.py
"""
DATA FLYWHEEL: Serviço de coleta de dados para treinamento do Qython-1.
Captura pares de Input/Output das interações de IA para fine-tuning futuro.

QUALITY FILTERS (Inspirado em Google DeepMind / Anthropic):
- Validação de tamanho mínimo/máximo
- Detecção de placeholders
- Hash para deduplicação
- Lógica automática de ready_for_training
"""

import logging
import os
import re
import uuid
import hashlib
import json
from io import BytesIO
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.exc import IntegrityError
from ..models import TrainingData, User
from ..config import Config

from .pii_detector import detect_and_summarize as detect_pii_in_texts
from . import consent_service
from ..middleware import pii_redaction

logger = logging.getLogger("qython_logger")

# === CREATION METHOD INFERENCE ===
# Maps source_type -> creation_method ('human', 'ai_generated', 'hybrid')
CREATION_METHOD_MAP = {
    # Human-only data (physician wrote everything)
    'consultation_raw_only': 'human',
    'prescription': 'human',
    'exam_order': 'human',
    # AI-generated (model produced the output)
    'chat_interaction': 'ai_generated',
    'chat_clinical_discussion': 'ai_generated',
    'library_rag_chat': 'ai_generated',
    'summary_generation': 'ai_generated',
    'consultation_summary': 'ai_generated',
    'icd10_extraction': 'ai_generated',
    'podcast_script': 'ai_generated',
    'video_lesson_script': 'ai_generated',
    'study_material': 'ai_generated',
    'patient_orientation_ai_generated': 'ai_generated',
    'draft_generation': 'ai_generated',
    'citation_grounded': 'ai_generated',
    'simulado_generation': 'ai_generated',
    'clinical_term_normalization': 'ai_generated',
    'clinical_history_parsing': 'ai_generated',
    'patient_info_extraction': 'ai_generated',
    'patient_info_extraction_correction': 'hybrid',
    'image_diagnosis': 'ai_generated',
    # Hybrid (AI output edited/validated by physician)
    'consultation_improvement': 'hybrid',
    'medical_document_report': 'hybrid',
    'exam_request': 'hybrid',
}

# Prefix-based fallback for dynamic source types (e.g., study_material_flashcards, medical_document_atestado)
CREATION_METHOD_PREFIX_MAP = {
    'study_material': 'ai_generated',
    'patient_orientation': 'ai_generated',
    'medical_document': 'hybrid',
}

# Source types whose data subject is the PATIENT. These ALWAYS take the
# irreversible anon track (LGPD Art. 12, "sempre anonimização") — regardless of
# PII detection or the physician's ML consent — because the detector can miss
# identifiers in free-text clinical notes. Matched by prefix against source_type.
# Physician-owned sources (chat, library, academic materials) are NOT listed
# here and only go to anon when PII is actually detected in the content.
PATIENT_ORIGIN_PREFIXES = (
    'consultation', 'patient_orientation', 'patient_info',
    'prescription', 'exam_order', 'exam_request', 'exam_',
    'icd10', 'clinical_history', 'clinical_term',
    'medical_document', 'image_diagnosis', 'draft_generation',
)

# === BLOOM'S TAXONOMY CLASSIFICATION ===
# Maps source_type -> cognitive level (for curriculum learning)
BLOOM_LEVEL_MAP = {
    # Level 1 - Remember: raw data retrieval
    'consultation_raw_only': 'remember',
    # Level 2 - Understand: explain/summarize
    'summary_generation': 'understand',
    'consultation_summary': 'understand',
    'icd10_extraction': 'understand',
    'clinical_term_normalization': 'understand',
    'clinical_history_parsing': 'understand',
    'patient_info_extraction': 'understand',
    # Level 3 - Apply: apply knowledge to cases
    'prescription': 'apply',
    'exam_request': 'apply',
    'exam_order': 'apply',
    'patient_orientation_ai_generated': 'apply',
    # Level 4 - Analyze: compare, differentiate
    'consultation_improvement': 'analyze',
    'library_rag_chat': 'analyze',
    'citation_grounded': 'analyze',
    # Level 5 - Evaluate: judge, decide
    'chat_interaction': 'evaluate',
    'chat_clinical_discussion': 'evaluate',  # Clinical reasoning = evaluate level
    'medical_document_report': 'evaluate',
    'simulado_generation': 'evaluate',
    'image_diagnosis': 'analyze',
    # Level 6 - Create: synthesize new content
    'podcast_script': 'create',
    'video_lesson_script': 'create',
    'study_material': 'create',
    'draft_generation': 'create',
}

# Prefix-based fallback for dynamic source types
BLOOM_LEVEL_PREFIX_MAP = {
    'study_material': 'create',
    'patient_orientation': 'apply',
    'medical_document': 'evaluate',
}

# Pasta específica para dataset de imagens (separada dos uploads temporários)
TRAINING_IMAGES_DIR = os.path.join(Config.PERMANENT_UPLOAD_FOLDER, 'training_dataset')
os.makedirs(TRAINING_IMAGES_DIR, exist_ok=True)

# === CONSTANTES DE VALIDAÇÃO ===
MIN_CONTENT_LENGTH = 100  # Mínimo de caracteres para ser válido
MAX_CONTENT_LENGTH = 50000  # Máximo de caracteres (trunca)

# Placeholders e templates não preenchidos
PLACEHOLDER_PATTERNS = [
    r'lorem\s+ipsum',
    r'preencher\s+aqui',
    r'xxx+',
    r'___+',
    r'\.\.\.+',
    r'\[inserir\]',
    r'\[exemplo\]',
    r'texto\s+de\s+exemplo',
    r'template\s+padrão',
]

# Padrões que indicam conteúdo real (deve ter pelo menos um)
REAL_CONTENT_PATTERN = re.compile(r'[a-zA-ZÀ-ÿ]{4,}')

# === CURRICULUM LEARNING: SPECIALTY COMPLEXITY WEIGHTS ===
# Complexidade baseada em: diagnóstico diferencial amplo, multissistêmico, necessidade de raciocínio clínico avançado
SPECIALTY_COMPLEXITY = {
    # Alta complexidade (0.7-0.9): Diagnóstico diferencial amplo, multissistêmico
    'Clínica Médica': 0.75,
    'Medicina da Família e Comunidade': 0.70,
    'Neurologia': 0.85,
    'Reumatologia': 0.80,
    'Hematologia e Hemoterapia': 0.85,

    # Média-alta complexidade (0.5-0.7): Especialidades com boa profundidade
    'Cardiologia': 0.65,
    'Gastroenterologia': 0.60,
    'Endocrinologia e Metabologia': 0.65,
    'Nefrologia': 0.70,
    'Pneumologia': 0.60,
    'Psiquiatria': 0.65,

    # Média complexidade (0.3-0.5): Especialidades mais focadas
    'Ginecologia e Obstetrícia': 0.50,
    'Pediatria': 0.55,
    'Urologia': 0.45,

    # Média-baixa complexidade (0.2-0.4): Especialidades com escopo mais definido
    'Dermatologia': 0.35,
}

# Termos médicos avançados para scoring de vocabulário (português e inglês)
ADVANCED_MEDICAL_TERMS = [
    # Termos diagnósticos complexos
    r'\bdiagnóstico\s+diferencial\b', r'\bdiferencial\b',
    r'\bfisiopatologia\b', r'\bpatogênese\b', r'\betiopatogenia\b',
    r'\bprognóstico\b', r'\bestratificação\s+de\s+risco\b',

    # Termos de exames complementares
    r'\bhemograma\b', r'\bbioquímica\b', r'\beletrocardiograma\b', r'\becg\b',
    r'\btomografia\b', r'\bressonância\b', r'\bultrassonografia\b',
    r'\bbiopsia\b', r'\bhistopatológico\b', r'\bimunohistoquímica\b',

    # Termos farmacológicos avançados
    r'\bfarmacocinética\b', r'\bfarmacodinâmica\b', r'\binteração\s+medicamentosa\b',
    r'\bposologia\b', r'\bdose[-\s]dependente\b', r'\btitulação\b',

    # Termos de conduta/tratamento
    r'\babordagem\s+terapêutica\b', r'\bmanejo\b', r'\bprotocolo\b',
    r'\bdiretriz\b', r'\bguideline\b', r'\bevidência\b',
    r'\bfirst[-\s]line\b', r'\bsegunda[-\s]linha\b',

    # Termos anatômicos/fisiológicos avançados
    r'\bhomeostase\b', r'\bmetabolismo\b', r'\bhemodinâmica\b',
    r'\bperfusão\b', r'\bisquemia\b', r'\bnecrose\b',

    # Termos epidemiológicos
    r'\bprevalência\b', r'\bincidência\b', r'\bsensibilidade\b', r'\bespecificidade\b',
    r'\bvpn\b', r'\bvpp\b', r'\brisco\s+relativo\b', r'\bodds\s+ratio\b',

    # Termos de emergência/gravidade
    r'\binstabilidade\b', r'\bdescompensação\b', r'\bchoque\b',
    r'\bsepse\b', r'\binsuficiência\b', r'\bagudo\b', r'\bcrônico\b',

    # Procedimentos
    r'\bintubação\b', r'\bventilação\b', r'\bcateterismo\b',
    r'\bendoscopia\b', r'\bartroscopia\b', r'\blaparoscopia\b',
]

# Padrões CID-10 / ICD-10
ICD_PATTERN = re.compile(r'\b[A-Z]\d{2}(?:\.\d{1,2})?\b')


def calculate_difficulty_score(
    input_data: str,
    output_data: str,
    specialty: str = None,
    num_icds: int = 0,
    metadata: dict = None
) -> float:
    """
    CURRICULUM LEARNING: Calcula automaticamente o difficulty_score (0.0-1.0).

    Fatores considerados:
    1. Comprimento do conteúdo (longer = potentially more complex)
    2. Complexidade do vocabulário médico
    3. Número de CIDs/diagnósticos
    4. Peso da especialidade
    5. Presença de comorbidades/multimorbidade

    O score é usado para ordenar dados de treino do mais fácil ao mais difícil,
    permitindo curriculum learning (treinar primeiro em casos simples).

    Returns:
        float: Score de 0.0 (muito fácil) a 1.0 (muito difícil)
    """
    combined_text = f"{input_data} {output_data}".lower()
    scores = []
    weights = []

    # === 1. COMPRIMENTO DO CONTEÚDO (15% do peso) ===
    # Textos mais longos geralmente indicam casos mais complexos
    total_length = len(combined_text)
    if total_length < 500:
        length_score = 0.1
    elif total_length < 1500:
        length_score = 0.3
    elif total_length < 3000:
        length_score = 0.5
    elif total_length < 6000:
        length_score = 0.7
    else:
        length_score = 0.9
    scores.append(length_score)
    weights.append(0.15)

    # === 2. VOCABULÁRIO MÉDICO AVANÇADO (30% do peso) ===
    # Conta termos médicos complexos
    advanced_term_count = 0
    for pattern in ADVANCED_MEDICAL_TERMS:
        matches = len(re.findall(pattern, combined_text, re.IGNORECASE))
        advanced_term_count += matches

    # Normalizar: 0-5 termos = fácil, 6-15 = médio, 16+ = difícil
    if advanced_term_count <= 2:
        vocab_score = 0.1
    elif advanced_term_count <= 5:
        vocab_score = 0.3
    elif advanced_term_count <= 10:
        vocab_score = 0.5
    elif advanced_term_count <= 15:
        vocab_score = 0.7
    else:
        vocab_score = 0.9
    scores.append(vocab_score)
    weights.append(0.30)

    # === 3. NÚMERO DE CIDS/DIAGNÓSTICOS (25% do peso) ===
    # Mais diagnósticos = caso mais complexo (comorbidades)
    if num_icds == 0:
        # Tentar detectar CIDs no texto
        found_icds = ICD_PATTERN.findall(combined_text.upper())
        num_icds = len(set(found_icds))  # unique ICDs

    if num_icds <= 1:
        icd_score = 0.2
    elif num_icds <= 2:
        icd_score = 0.4
    elif num_icds <= 4:
        icd_score = 0.6
    elif num_icds <= 6:
        icd_score = 0.8
    else:
        icd_score = 0.95  # Muitas comorbidades = caso muito complexo
    scores.append(icd_score)
    weights.append(0.25)

    # === 4. COMPLEXIDADE DA ESPECIALIDADE (20% do peso) ===
    if specialty:
        # Normalizar nome da especialidade
        specialty_normalized = specialty.strip()
        specialty_score = SPECIALTY_COMPLEXITY.get(specialty_normalized, 0.5)
    else:
        specialty_score = 0.5  # Default médio
    scores.append(specialty_score)
    weights.append(0.20)

    # === 5. INDICADORES CONTEXTUAIS (10% do peso) ===
    context_score = 0.3  # Base

    # Detectar sinais de complexidade no texto
    complexity_indicators = [
        (r'\bdiagnóstico\s+diferencial\b', 0.2),
        (r'\bcomorbidade', 0.15),
        (r'\bmultimorbidade', 0.2),
        (r'\bpaciente\s+idoso', 0.1),
        (r'\bgestante|gravidez', 0.15),
        (r'\bpediátrico|criança|neonato', 0.1),
        (r'\bimunossuprimido|imunodeprimido', 0.2),
        (r'\boncológico|câncer|neoplasia', 0.15),
        (r'\buti|terapia\s+intensiva', 0.2),
        (r'\bemergência|urgência', 0.1),
        (r'\binteração\s+medicamentosa', 0.15),
        (r'\bcontraindicação', 0.1),
    ]

    for pattern, boost in complexity_indicators:
        if re.search(pattern, combined_text, re.IGNORECASE):
            context_score = min(0.95, context_score + boost)

    scores.append(context_score)
    weights.append(0.10)

    # === CÁLCULO FINAL: Média ponderada ===
    final_score = sum(s * w for s, w in zip(scores, weights))

    # Garantir que está no range [0.0, 1.0]
    final_score = max(0.0, min(1.0, final_score))

    # Arredondar para 2 casas decimais
    return round(final_score, 2)


def validate_training_data(input_data: str, output_data: str, source_type: str) -> tuple:
    """
    Valida dados antes de salvar no dataset de treinamento.
    
    Returns:
        tuple: (is_valid: bool, rejection_reason: str, is_ready: bool)
    """
    # Chat interactions: skip min length check - all conversations are valuable for training
    skip_min_length_sources = ['chat_interaction', 'chat_clinical_discussion']
    
    if source_type not in skip_min_length_sources:
        # 1. Verificar tamanho mínimo (apenas para documentos/consultas)
        if len(input_data) < MIN_CONTENT_LENGTH:
            return False, "input_too_short", False
        
        if len(output_data) < MIN_CONTENT_LENGTH:
            return False, "output_too_short", False
    
    # 2. Verificar placeholders no input
    lower_input = input_data.lower()
    for pattern in PLACEHOLDER_PATTERNS:
        if re.search(pattern, lower_input):
            return False, f"placeholder_detected:{pattern}", False
    
    # 3. Verificar se tem conteúdo real (não só pontuação/números)
    if not REAL_CONTENT_PATTERN.search(output_data):
        return False, "no_real_content", False
    
    # 4. Determinar se está pronto para treinamento
    # Lógica: conteúdo longo e de sources confiáveis = auto_ready
    # Dados de chat, library_rag, orientações etc. começam como pending
    # e viram ready quando o usuário dá like (via feedback_routes)
    is_ready = False
    trusted_source_prefixes = [
        'consultation_improvement',
        'consultation_raw_only',
        'podcast_script',
        'video_lesson_script',
        'study_material',          # matches study_material_flashcards, study_material_summary, etc.
        'patient_orientation',     # matches patient_orientation_ai_generated, patient_orientation_*
        'prescription',
        'medical_document',        # matches medical_document_report, medical_document_*
    ]

    if any(source_type.startswith(prefix) for prefix in trusted_source_prefixes) and len(output_data) > 300:
        is_ready = True

    return True, "ok", is_ready


def extract_references_from_response(response_text: str) -> list:
    """
    Extrai referências bibliográficas da resposta do LLM para ML training.
    Retorna lista de dicts com url, pmid, title extraídos.
    """
    if not response_text:
        return []
    
    refs = []
    
    # Procurar por seção de referências (vários formatos possíveis)
    ref_patterns = [
        r'Referências Bibliográficas[\s\S]*',
        r'Referências:[\s\S]*',
        r'Bibliografia[\s\S]*',
        r'Fontes[\s\S]*'
    ]
    
    ref_section = None
    for pattern in ref_patterns:
        match = re.search(pattern, response_text, re.IGNORECASE)
        if match:
            ref_section = match.group(0)
            break
    
    if not ref_section:
        return []
    
    # Extrair URLs
    url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+'
    found_urls = re.findall(url_pattern, ref_section)
    
    for url in found_urls:
        ref_dict = {"url": url.strip()}
        
        # Tentar extrair PMID se for PubMed
        pmid_match = re.search(r'pubmed\.ncbi\.nlm\.nih\.gov/(\d+)', url)
        if pmid_match:
            ref_dict["pmid"] = pmid_match.group(1)
            ref_dict["source_type"] = "pubmed"
        
        # Tentar extrair DOI
        doi_match = re.search(r'doi\.org/(10\.\d{4,}/[^\s]+)', url)
        if doi_match:
            ref_dict["doi"] = doi_match.group(1)
        
        # Classificar tipo de fonte por domínio
        if "uptodate.com" in url.lower():
            ref_dict["source_type"] = "uptodate"
        elif "guideline" in url.lower() or "diretriz" in url.lower():
            ref_dict["source_type"] = "guideline"
        elif not ref_dict.get("source_type"):
            ref_dict["source_type"] = "other"
        
        refs.append(ref_dict)
    
    return refs


def get_content_hash(input_data: str, output_data: str) -> str:
    """
    Gera hash MD5 único do par input/output para evitar duplicatas.
    Usa o conteúdo COMPLETO — antes hashava só os primeiros 1000 chars de cada
    lado, o que podia colidir (e descartar silenciosamente) turnos de chat
    distintos que compartilhavam um contexto inicial longo.
    """
    combined = f"{input_data}|||{output_data}"
    return hashlib.md5(combined.encode('utf-8')).hexdigest()


def compress_image_for_training(image_bytes: bytes) -> str:
    """
    Recebe bytes de uma imagem, redimensiona para padrão de VLM (max 1024px),
    converte para WebP (leve) e salva no disco.
    Retorna o nome do arquivo salvo.
    """
    try:
        from PIL import Image
        
        img = Image.open(BytesIO(image_bytes))
        
        # 1. Converter para RGB (caso seja PNG com transparência ou DICOM)
        if img.mode in ("RGBA", "P", "LA"):
            img = img.convert("RGB")
            
        # 2. Redimensionar (Max 1024px no maior lado para VLMs)
        max_size = 1024
        if max(img.size) > max_size:
            ratio = max_size / max(img.size)
            new_size = (int(img.width * ratio), int(img.height * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
            
        # 3. Gerar nome único
        filename = f"train_{uuid.uuid4().hex}.webp"
        filepath = os.path.join(TRAINING_IMAGES_DIR, filename)
        
        # 4. Salvar como WebP com qualidade 80 (ótimo balanço tamanho/qualidade)
        img.save(filepath, "WEBP", quality=80)
        
        logger.info(f"[DATA FLYWHEEL] Imagem comprimida e salva: {filename}")
        return filename
        
    except Exception as e:
        logger.error(f"Erro ao comprimir imagem para treino: {e}")
        return None


async def collect_data(
    db: AsyncSession,
    user_id: int,
    source_type: str,
    input_data: str,
    output_data: str,
    meta: dict = None,
    quality: int = 0,
    image_bytes: bytes = None,
    lang: str = None,
    references: list = None,
    creation_method: str = None,
    generation_number: int = None,
):
    """
    Salva dados valiosos para o treinamento do Qython-1.

    Args:
        db: Sessão do banco de dados
        user_id: ID do usuário
        source_type: Tipo da fonte ('consultation', 'chat', 'summary', 'image_diagnosis', etc.)
        input_data: Entrada do usuário/contexto
        output_data: Saída gerada pela IA
        meta: Metadados adicionais (specialty, model, etc.)
        quality: Score de qualidade (-1=dislike, 0=neutro, 1=like, 2=gold, 3=platinum)
        image_bytes: Bytes da imagem para compressão (opcional)
        lang: Código do idioma (pt-BR, en, es, etc.)
        references: Lista de referências bibliográficas citadas (opcional)
        creation_method: Override for creation method ('human', 'ai_generated', 'hybrid').
                         Auto-inferred from source_type if not provided.
        generation_number: Override for data provenance generation (0=human, 1=first AI gen).
                           Auto-inferred if not provided.
    """
    try:
        # === 0. CONSENT GATE (LGPD Art. 7 V + Art. 11 I + Art. 12) ===
        # The collected data is routed into one of two tracks:
        #   - 'pseudo': user gave explicit ML consent for this source_type
        #   - 'anon':   no consent → must be anonymized before being usable
        # Patient data (PII detected) is ALWAYS routed to 'anon', regardless
        # of the user's consent.
        target_consent = None
        anonymization_level = 'anon'  # safe default

        if user_id:
            user_obj = await db.get(User, user_id)
            if user_obj is None:
                logger.warning(
                    f"[DATA FLYWHEEL] User {user_id} not found, skipping."
                )
                return None

            # Soft-deleted users: never collect
            if getattr(user_obj, 'deleted_at', None) is not None:
                logger.debug(
                    f"[DATA FLYWHEEL] User {user_id} is deleted, skipping."
                )
                return None

            # Legacy opt-out flag: if the user explicitly opted out under the
            # old semantics and has NOT yet gone through the new consent flow,
            # respect the opt-out completely (don't collect).
            if user_obj.training_data_opt_out and not user_obj.training_data_consent_at:
                logger.debug(
                    f"[DATA FLYWHEEL] User {user_id} has legacy opt-out and no new consent, skipping."
                )
                return None

            # Look up active consent matching this source_type
            target_consent = await consent_service.get_consent_for_source_type(
                db, user_id, source_type,
            )
            if target_consent is not None:
                anonymization_level = 'pseudo'

        # === 0b. PII assessment — opção 3 (inline redaction or discard) ===
        combined_text = f"{input_data}\n{output_data}"
        assessment = pii_redaction.assess_for_training(combined_text)

        if assessment['should_discard']:
            logger.info(
                f"[DATA FLYWHEEL] ❌ Descartado: PII de paciente não-redutível com confiança "
                f"(Presidio indisponível) source={source_type}"
            )
            return None

        # Patient-origin sources ALWAYS take the irreversible anon track — even
        # when no PII was detected — because the detector can miss identifiers in
        # free-text clinical notes (LGPD Art. 12). Physician-owned sources only
        # go to anon when PII is actually present (e.g. a patient note pasted
        # into the chat).
        is_patient_origin = any(
            source_type.startswith(p) for p in PATIENT_ORIGIN_PREFIXES
        )

        if assessment['has_pii'] or is_patient_origin:
            input_data, _ = pii_redaction.redact_for_llm(input_data, preserve_tokens=False)
            output_data, _ = pii_redaction.redact_for_llm(output_data, preserve_tokens=False)
            anonymization_level = 'anon'
            target_consent = None  # patient data / PII present — never pseudo, drop consent linkage

        # === 1. PREPARAR METADADOS ===
        if not meta:
            meta = {}
        meta["ts"] = datetime.now(timezone.utc).isoformat()
        meta["v"] = "3.0"  # Versão do coletor com filtros de qualidade
        
        if lang:
            meta["lang"] = lang
        
        # === 2. PROCESSAR IMAGEM (se houver) ===
        if image_bytes:
            saved_image_filename = compress_image_for_training(image_bytes)
            if saved_image_filename:
                input_payload = {
                    "text_prompt": input_data,
                    "image_ref": saved_image_filename
                }
                input_data = json.dumps(input_payload, ensure_ascii=False)
                meta["has_image"] = True
                meta["image_type"] = "medical_exam"

        # === 3. VALIDAÇÃO BÁSICA: Não salvar vazios ===
        if not input_data or not output_data:
            logger.warning("[DATA FLYWHEEL] Input ou output vazio, ignorando...")
            return None

        # Serialização segura
        if not isinstance(input_data, str):
            input_data = str(input_data)
        if not isinstance(output_data, str):
            output_data = str(output_data)
            
        # Truncar se muito grande
        input_data = input_data[:MAX_CONTENT_LENGTH]
        output_data = output_data[:MAX_CONTENT_LENGTH]

        # === 4. VALIDAÇÃO DE QUALIDADE ===
        is_valid, rejection_reason, auto_ready = validate_training_data(
            input_data, output_data, source_type
        )
        
        if not is_valid:
            logger.info(f"[DATA FLYWHEEL] ⚠️ Dado rejeitado: {rejection_reason}")
            meta["rejected"] = True
            meta["rejection_reason"] = rejection_reason
            # Ainda salvamos para análise, mas marcamos como rejeitado
            quality = -2  # -2 = rejeitado por filtro automático
        
        # === 5. GERAR HASH PARA DEDUPLICAÇÃO ===
        content_hash = get_content_hash(input_data, output_data)
        
        # === 6. DETERMINAR ready_for_training ===
        # ready = True se passou validação E:
        #   - quality >= 1 (liked, gold=2, platinum=3), OU
        #   - auto_ready (fonte confiável com output > 300 chars)
        ready_for_training = False
        if is_valid:
            if quality >= 1 or auto_ready:
                ready_for_training = True
        
        meta["auto_ready"] = auto_ready

        # === 7. CALCULAR DIFFICULTY_SCORE (Curriculum Learning) ===
        specialty = meta.get("specialty")
        num_icds = 0
        if meta.get("icds"):
            # ICDs podem vir como lista de strings ou lista de dicts
            icds = meta.get("icds", [])
            if isinstance(icds, list):
                num_icds = len(icds)

        difficulty_score = calculate_difficulty_score(
            input_data=input_data,
            output_data=output_data,
            specialty=specialty,
            num_icds=num_icds,
            metadata=meta
        )
        meta["difficulty_score"] = difficulty_score

        # === 8. ML PIPELINE METADATA ===

        # 8a. Creation method (human / ai_generated / hybrid)
        # Try exact match first, then prefix-based fallback for dynamic source types
        inferred_creation_method = creation_method or CREATION_METHOD_MAP.get(source_type)
        if not inferred_creation_method:
            for prefix, method in CREATION_METHOD_PREFIX_MAP.items():
                if source_type.startswith(prefix):
                    inferred_creation_method = method
                    break
            else:
                inferred_creation_method = 'ai_generated'
        meta["creation_method"] = inferred_creation_method

        # 8b. Generation number (0=human, 1=first AI gen)
        inferred_generation = generation_number
        if inferred_generation is None:
            inferred_generation = 0 if inferred_creation_method == 'human' else 1
        meta["generation_number"] = inferred_generation

        # 8c. Bloom's taxonomy level (for curriculum learning)
        # Try exact match first, then prefix-based fallback for dynamic source types
        bloom_level = BLOOM_LEVEL_MAP.get(source_type)
        if not bloom_level:
            for prefix, level in BLOOM_LEVEL_PREFIX_MAP.items():
                if source_type.startswith(prefix):
                    bloom_level = level
                    break
        if bloom_level:
            meta["bloom_level"] = bloom_level

        # 8d. PII detection (flags but does NOT block)
        pii_detected = False
        try:
            pii_result = detect_pii_in_texts(input_data, output_data)
            pii_detected = pii_result["pii_detected"]
            if pii_detected:
                meta["pii_types"] = pii_result["pii_types"]
                meta["pii_count"] = pii_result["pii_count"]
        except Exception:
            pass  # PII detection must never block data collection

        # === 9. CRIAR E SALVAR ENTRY ===
        # LGPD metadata: link to the consent that authorized capture (if any)
        # and record the anonymization track applied.
        meta["anonymization_level"] = anonymization_level
        if assessment.get("patient_pii_likely"):
            meta["patient_pii_redacted"] = True

        # Engagement metrics → dedicated typed columns (previously these only
        # landed in metadata_info JSON, leaving the columns/indexes empty).
        regen_count = meta.get("regeneration_count")
        if regen_count is None:
            regen_count = (meta.get("regeneration_count_improved") or 0) + \
                          (meta.get("regeneration_count_summary") or 0)

        new_entry = TrainingData(
            user_id=user_id,
            source_type=source_type,
            input_data=input_data,
            output_data=output_data,
            difficulty_score=difficulty_score,
            metadata_info=meta,
            references=references,
            quality_score=quality,
            content_hash=content_hash,
            ready_for_training=ready_for_training,
            creation_method=inferred_creation_method,
            generation_number=inferred_generation,
            bloom_level=bloom_level,
            pii_detected=pii_detected,
            consent_id=target_consent.id if target_consent is not None else None,
            anonymization_level=anonymization_level,
            # Mirror anonymization_level so exporters can filter on the flag
            # (was never written before → all rows showed up as False).
            is_anonymized=(anonymization_level == 'anon'),
            regeneration_count=int(regen_count or 0),
            time_to_first_edit_ms=meta.get("time_to_first_edit_ms"),
            total_edit_time_ms=meta.get("total_edit_time_ms"),
            accepted_without_edit=meta.get("accepted_without_edit"),
        )
        
        # Use nested transaction (savepoint) to avoid affecting the caller's transaction
        # This prevents IntegrityError from rolling back the main transaction
        try:
            async with db.begin_nested():
                db.add(new_entry)
                # Nested transaction auto-commits on exit

            status = "✅" if is_valid else "⚠️"
            ready_status = "READY" if ready_for_training else "PENDING"
            logger.info(f"[DATA FLYWHEEL] {status} Coletado: {source_type} (ID: {new_entry.id}, Q: {quality}, {ready_status})")
            return new_entry.id

        except IntegrityError:
            # Duplicata detectada pelo hash único
            # Nested transaction rollback only affects the savepoint, not the main transaction
            logger.info(f"[DATA FLYWHEEL] 🔄 Duplicata ignorada: hash={content_hash[:8]}...")
            return None

    except Exception as e:
        logger.error(f"[DATA FLYWHEEL] ❌ Falha ao coletar dados: {e}")
        return None


# NOTE: update_training_data_quality() was removed (2026-05) — it was dead code
# (zero call sites). The live like/dislike path is feedback_routes.py, which
# updates quality_score / ready_for_training directly.
