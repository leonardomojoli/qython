# qython/backend/services/preference_service.py
"""
PREFERENCE DATA SERVICE: Coleta de pares de preferência para DPO Training.

Este serviço implementa o padrão moderno (2025-2026) de coleta de dados para
fine-tuning de LLMs via Direct Preference Optimization (DPO).

Funcionalidades:
- Coleta de pares chosen/rejected quando usuário regenera resposta
- LLM-as-Judge para classificação automática de qualidade
- Export em formato JSONL/Parquet compatível com TRL/TorchTune
- Migração de dados do TrainingData antigo para PreferenceData

Referências:
- TRL (Transformers Reinforcement Learning): https://huggingface.co/docs/trl
- TorchTune: https://pytorch.org/torchtune/0.3/basics/preference_datasets.html
- RLTHF (2025): https://arxiv.org/abs/2505.xxxxx
"""

import logging
import os
import json
import hashlib
from datetime import datetime, timezone
from typing import List, Dict, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy import and_

from ..models import PreferenceData, TrainingData, User
from ..config import Config

logger = logging.getLogger("qython_logger")

# === CONSTANTES ===
LLM_JUDGE_MODEL = os.getenv("SIMPLE_TASK_LLM_MODEL", "gemini-2.5-flash-lite")
LLM_JUDGE_CONFIDENCE_THRESHOLD = 0.7  # Mínimo para aceitar julgamento automático


def get_preference_hash(prompt: str, chosen: str, rejected: str) -> str:
    """
    Gera hash MD5 único do trio prompt/chosen/rejected para evitar duplicatas.
    """
    combined = f"{prompt[:500]}|||{chosen[:500]}|||{rejected[:500]}"
    return hashlib.md5(combined.encode('utf-8')).hexdigest()


async def collect_preference_pair(
    db: AsyncSession,
    user_id: int,
    prompt: str,
    chosen: str,
    rejected: str,
    source_type: str,
    preference_source: str = 'human',
    confidence_score: float = 1.0,
    metadata: dict = None,
    language: str = 'pt-BR'
) -> Optional[int]:
    """
    Salva um par de preferência (chosen/rejected) para DPO training.

    Args:
        db: Sessão do banco de dados
        user_id: ID do usuário (pode ser None para dados anônimos)
        prompt: O prompt/contexto que gerou as respostas
        chosen: A resposta preferida
        rejected: A resposta rejeitada
        source_type: Tipo da fonte ('chat', 'consultation_draft', 'icd10', etc.)
        preference_source: 'human', 'llm_judge', ou 'implicit'
        confidence_score: Confiança do julgamento (0.0-1.0)
        metadata: Metadados adicionais (specialty, model, etc.)
        language: Código do idioma

    Returns:
        ID do registro criado ou None se falhou/duplicata
    """
    try:
        # === 0. CHECK OPT-OUT (LGPD Art. 18(IV)) ===
        if user_id:
            user_result = await db.execute(select(User.training_data_opt_out).filter(User.id == user_id))
            opt_out = user_result.scalar()
            if opt_out:
                logger.debug(f"[PREFERENCE] User {user_id} opted out of training data collection, skipping.")
                return None

        # === 1. VALIDAÇÃO BÁSICA ===
        if not prompt or not chosen or not rejected:
            logger.warning("[PREFERENCE] Campos obrigatórios vazios, ignorando...")
            return None

        # Chosen e rejected devem ser diferentes
        if chosen.strip() == rejected.strip():
            logger.warning("[PREFERENCE] Chosen e rejected são iguais, ignorando...")
            return None

        # === 2. PREPARAR METADADOS ===
        if not metadata:
            metadata = {}
        metadata["ts"] = datetime.now(timezone.utc).isoformat()
        metadata["v"] = "1.0"

        # === 3. GERAR HASH PARA DEDUPLICAÇÃO ===
        content_hash = get_preference_hash(prompt, chosen, rejected)

        # === 4. CRIAR E SALVAR ENTRY ===
        new_entry = PreferenceData(
            user_id=user_id,
            prompt=prompt,
            chosen=chosen,
            rejected=rejected,
            source_type=source_type,
            preference_source=preference_source,
            confidence_score=confidence_score,
            metadata_info=metadata,
            language=language,
            content_hash=content_hash,
            ready_for_export=True
        )

        # Use nested transaction (savepoint) to avoid rolling back caller's transaction
        try:
            async with db.begin_nested():
                db.add(new_entry)

            logger.info(f"[PREFERENCE] Coletado: {source_type} (ID: {new_entry.id}, Source: {preference_source})")
            return new_entry.id

        except IntegrityError:
            # Savepoint rollback only, parent transaction unaffected
            logger.info(f"[PREFERENCE] Duplicata ignorada: hash={content_hash[:8]}...")
            return None

    except Exception as e:
        logger.error(f"[PREFERENCE] Falha ao coletar par: {e}")
        return None


async def llm_judge_preference(
    response_a: str,
    response_b: str,
    prompt: str,
    criteria: str = "medical_accuracy"
) -> Tuple[str, str, float]:
    """
    Usa LLM-as-Judge para determinar qual resposta é melhor.

    Args:
        response_a: Primeira resposta
        response_b: Segunda resposta
        prompt: O prompt original
        criteria: Critério de avaliação ('medical_accuracy', 'clarity', 'completeness')

    Returns:
        Tuple de (chosen, rejected, confidence_score)
    """
    try:
        from google import genai
        from google.genai import types

        GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
        client = genai.Client(api_key=GEMINI_API_KEY)

        # === PROMPT DO JUIZ ===
        criteria_descriptions = {
            "medical_accuracy": "precisão médica e científica, baseando-se em evidências",
            "clarity": "clareza, organização e facilidade de compreensão",
            "completeness": "completude da resposta, cobrindo todos os aspectos relevantes",
            "helpfulness": "utilidade prática para o profissional de saúde"
        }

        criteria_desc = criteria_descriptions.get(criteria, criteria_descriptions["medical_accuracy"])

        judge_prompt = f"""Você é um avaliador especializado em respostas médicas. Compare as duas respostas abaixo e determine qual é MELHOR considerando: {criteria_desc}.

## PROMPT ORIGINAL:
{prompt[:1000]}

## RESPOSTA A:
{response_a[:2000]}

## RESPOSTA B:
{response_b[:2000]}

## INSTRUÇÃO:
Responda APENAS com um JSON válido no formato:
{{"winner": "A" ou "B", "confidence": 0.0-1.0, "reason": "breve justificativa"}}

- "winner": qual resposta é melhor (A ou B)
- "confidence": quão confiante você está (0.5 = incerto, 1.0 = muito confiante)
- "reason": justificativa de 1-2 frases

IMPORTANTE: Responda SOMENTE o JSON, sem texto adicional."""

        from . import llm_services
        response = client.models.generate_content(
            model=LLM_JUDGE_MODEL,
            contents=llm_services._redact_llm_contents(judge_prompt),
            config=types.GenerateContentConfig(
                temperature=0.1,  # Baixa temperatura para consistência
                max_output_tokens=256
            )
        )

        # Parse do resultado
        result_text = response.text.strip()

        # Limpar possíveis marcadores de código
        if result_text.startswith("```"):
            result_text = result_text.split("```")[1]
            if result_text.startswith("json"):
                result_text = result_text[4:]

        result = json.loads(result_text)

        winner = result.get("winner", "A")
        confidence = float(result.get("confidence", 0.5))

        if winner == "A":
            return response_a, response_b, confidence
        else:
            return response_b, response_a, confidence

    except Exception as e:
        logger.error(f"[LLM-JUDGE] Erro ao avaliar: {e}")
        # Em caso de erro, assume primeira resposta como chosen (sem confiança)
        return response_a, response_b, 0.3


async def collect_regeneration_pair(
    db: AsyncSession,
    user_id: int,
    prompt: str,
    original_response: str,
    new_response: str,
    source_type: str,
    use_llm_judge: bool = True,
    metadata: dict = None,
    language: str = 'pt-BR'
) -> Optional[int]:
    """
    Coleta par de preferência quando usuário regenera uma resposta.

    A regeneração é um sinal IMPLÍCITO de preferência:
    - Se o usuário regenerou, provavelmente a original não foi satisfatória
    - Mas nem sempre a nova é melhor - usamos LLM-as-Judge para confirmar

    Args:
        db: Sessão do banco
        user_id: ID do usuário
        prompt: Prompt original
        original_response: Resposta que foi regenerada
        new_response: Nova resposta gerada
        source_type: Tipo da fonte
        use_llm_judge: Se True, usa LLM para confirmar preferência
        metadata: Metadados adicionais
        language: Código do idioma

    Returns:
        ID do registro ou None
    """
    # === CHECK OPT-OUT (LGPD Art. 18(IV)) ===
    if user_id:
        user_result = await db.execute(select(User.training_data_opt_out).filter(User.id == user_id))
        opt_out = user_result.scalar()
        if opt_out:
            logger.debug(f"[PREFERENCE] User {user_id} opted out of training data collection, skipping regeneration pair.")
            return None

    if not metadata:
        metadata = {}

    # === ESTRATÉGIA DE PREFERÊNCIA ===
    if use_llm_judge:
        # Usa LLM para determinar qual é realmente melhor
        chosen, rejected, confidence = await llm_judge_preference(
            new_response,
            original_response,
            prompt,
            criteria="medical_accuracy"
        )

        # Se confiança muito baixa, descarta
        if confidence < LLM_JUDGE_CONFIDENCE_THRESHOLD:
            logger.info(f"[PREFERENCE] Confiança muito baixa ({confidence:.2f}), descartando...")
            return None

        preference_source = 'llm_judge'
        metadata["judge_confidence"] = confidence
        metadata["regeneration"] = True

    else:
        # Assume implicitamente que nova resposta é melhor
        chosen = new_response
        rejected = original_response
        confidence = 0.6  # Confiança moderada para sinal implícito
        preference_source = 'implicit'
        metadata["regeneration"] = True

    return await collect_preference_pair(
        db=db,
        user_id=user_id,
        prompt=prompt,
        chosen=chosen,
        rejected=rejected,
        source_type=source_type,
        preference_source=preference_source,
        confidence_score=confidence,
        metadata=metadata,
        language=language
    )


async def convert_feedback_to_preference(
    db: AsyncSession,
    liked_entry_id: int,
    disliked_entry_id: int
) -> Optional[int]:
    """
    Converte dois entries de TrainingData (um liked, um disliked) em um par de preferência.

    Útil para migrar dados antigos para o novo formato DPO.

    Args:
        db: Sessão do banco
        liked_entry_id: ID do TrainingData com quality_score >= 1
        disliked_entry_id: ID do TrainingData com quality_score <= -1

    Returns:
        ID do PreferenceData criado ou None
    """
    try:
        # Buscar os dois entries
        liked_result = await db.execute(
            select(TrainingData).where(TrainingData.id == liked_entry_id)
        )
        liked = liked_result.scalar_one_or_none()

        disliked_result = await db.execute(
            select(TrainingData).where(TrainingData.id == disliked_entry_id)
        )
        disliked = disliked_result.scalar_one_or_none()

        if not liked or not disliked:
            logger.warning("[PREFERENCE] Entries não encontrados para conversão")
            return None

        # Verificar se são do mesmo source_type
        if liked.source_type != disliked.source_type:
            logger.warning("[PREFERENCE] Source types diferentes, não é possível comparar")
            return None

        return await collect_preference_pair(
            db=db,
            user_id=liked.user_id,
            prompt=liked.input_data,  # Assume mesmo prompt
            chosen=liked.output_data,
            rejected=disliked.output_data,
            source_type=liked.source_type,
            preference_source='human',
            confidence_score=1.0,
            metadata={
                "converted_from_training_data": True,
                "liked_id": liked_entry_id,
                "disliked_id": disliked_entry_id
            },
            language=liked.metadata_info.get("lang", "pt-BR") if liked.metadata_info else "pt-BR"
        )

    except Exception as e:
        logger.error(f"[PREFERENCE] Erro ao converter feedback: {e}")
        return None


async def export_dpo_jsonl(
    db: AsyncSession,
    output_path: str = None,
    source_types: List[str] = None,
    min_confidence: float = 0.0,
    language: str = None
) -> str:
    """
    Exporta pares de preferência em formato JSONL para DPO training.

    Formato compatível com TRL (Transformers Reinforcement Learning):
    {"prompt": "...", "chosen": "...", "rejected": "..."}

    Args:
        db: Sessão do banco
        output_path: Caminho do arquivo (default: exports/dpo_TIMESTAMP.jsonl)
        source_types: Lista de source_types para filtrar (None = todos)
        min_confidence: Confiança mínima para incluir
        language: Filtrar por idioma (None = todos)

    Returns:
        Caminho do arquivo gerado
    """
    try:
        # === 1. CONSTRUIR QUERY ===
        query = select(PreferenceData).where(
            and_(
                PreferenceData.ready_for_export == True,
                PreferenceData.confidence_score >= min_confidence
            )
        )

        if source_types:
            query = query.where(PreferenceData.source_type.in_(source_types))

        if language:
            query = query.where(PreferenceData.language == language)

        result = await db.execute(query)
        entries = result.scalars().all()

        # === 2. PREPARAR OUTPUT PATH ===
        if not output_path:
            exports_dir = os.path.join(Config.PROJECT_ROOT, 'exports')
            os.makedirs(exports_dir, exist_ok=True)
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            output_path = os.path.join(exports_dir, f"dpo_{timestamp}.jsonl")

        # === 3. ESCREVER JSONL (enhanced with ML pipeline metadata) ===
        with open(output_path, 'w', encoding='utf-8') as f:
            for entry in entries:
                dpo_record = entry.to_dpo_format()
                # Enrich with ML pipeline metadata from metadata_info
                meta = entry.metadata_info or {}
                dpo_record.setdefault("metadata", {})
                dpo_record["metadata"]["preference_source"] = entry.preference_source
                dpo_record["metadata"]["confidence_score"] = entry.confidence_score
                if meta.get("generation_number") is not None:
                    dpo_record["metadata"]["generation_number"] = meta["generation_number"]
                if meta.get("self_play"):
                    dpo_record["metadata"]["self_play"] = True
                f.write(json.dumps(dpo_record, ensure_ascii=False) + '\n')

        logger.info(f"[PREFERENCE] Exportado {len(entries)} pares para {output_path}")
        return output_path

    except Exception as e:
        logger.error(f"[PREFERENCE] Erro ao exportar JSONL: {e}")
        raise


async def export_dpo_parquet(
    db: AsyncSession,
    output_path: str = None,
    source_types: List[str] = None,
    min_confidence: float = 0.0,
    language: str = None
) -> str:
    """
    Exporta pares de preferência em formato Parquet para DPO training.

    Parquet é mais eficiente para datasets grandes e é o formato
    preferido pelo Hugging Face Datasets.

    Args:
        db: Sessão do banco
        output_path: Caminho do arquivo (default: exports/dpo_TIMESTAMP.parquet)
        source_types: Lista de source_types para filtrar (None = todos)
        min_confidence: Confiança mínima para incluir
        language: Filtrar por idioma (None = todos)

    Returns:
        Caminho do arquivo gerado
    """
    try:
        import pandas as pd

        # === 1. CONSTRUIR QUERY ===
        query = select(PreferenceData).where(
            and_(
                PreferenceData.ready_for_export == True,
                PreferenceData.confidence_score >= min_confidence
            )
        )

        if source_types:
            query = query.where(PreferenceData.source_type.in_(source_types))

        if language:
            query = query.where(PreferenceData.language == language)

        result = await db.execute(query)
        entries = result.scalars().all()

        # === 2. PREPARAR OUTPUT PATH ===
        if not output_path:
            exports_dir = os.path.join(Config.PROJECT_ROOT, 'exports')
            os.makedirs(exports_dir, exist_ok=True)
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            output_path = os.path.join(exports_dir, f"dpo_{timestamp}.parquet")

        # === 3. CONVERTER PARA DATAFRAME ===
        records = [entry.to_dpo_format() for entry in entries]
        df = pd.DataFrame(records)

        # === 4. SALVAR PARQUET ===
        df.to_parquet(output_path, index=False, engine='pyarrow')

        logger.info(f"[PREFERENCE] Exportado {len(entries)} pares para {output_path}")
        return output_path

    except ImportError:
        logger.error("[PREFERENCE] pandas/pyarrow não instalado. Use export_dpo_jsonl.")
        raise
    except Exception as e:
        logger.error(f"[PREFERENCE] Erro ao exportar Parquet: {e}")
        raise


async def export_dpo_jsonl_validated(
    db: AsyncSession,
    exporter_user_id: int,
    output_path: str = None,
    source_types: List[str] = None,
    min_confidence: float = 0.0,
    language: str = None,
    enforce_pii_recheck: bool = True,
) -> Tuple[str, "object"]:
    """LGPD-aware DPO JSONL export.

    Runs the pre-export validator across PreferenceData candidates, drops
    entries whose user revoked consent / was deleted / contains PII, and
    persists a DatasetExportLog with the consent snapshot and dataset hash.

    Returns:
        (output_path, ExportValidationReport)
    """
    from .export_validator_service import (
        register_export,
        validate_preference_entries_for_export,
    )

    query = select(PreferenceData).where(
        and_(
            PreferenceData.ready_for_export == True,
            PreferenceData.confidence_score >= min_confidence,
        )
    )
    if source_types:
        query = query.where(PreferenceData.source_type.in_(source_types))
    if language:
        query = query.where(PreferenceData.language == language)

    result = await db.execute(query)
    candidates = list(result.scalars().all())

    report = await validate_preference_entries_for_export(
        db, candidates, enforce_pii_recheck=enforce_pii_recheck,
    )

    if not output_path:
        exports_dir = os.path.join(Config.PROJECT_ROOT, 'exports')
        os.makedirs(exports_dir, exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        output_path = os.path.join(exports_dir, f"dpo_{timestamp}.jsonl")

    with open(output_path, 'w', encoding='utf-8') as f:
        for entry in report.valid:
            dpo_record = entry.to_dpo_format()
            meta = entry.metadata_info or {}
            dpo_record.setdefault("metadata", {})
            dpo_record["metadata"]["preference_source"] = entry.preference_source
            dpo_record["metadata"]["confidence_score"] = entry.confidence_score
            if meta.get("generation_number") is not None:
                dpo_record["metadata"]["generation_number"] = meta["generation_number"]
            if meta.get("self_play"):
                dpo_record["metadata"]["self_play"] = True
            f.write(json.dumps(dpo_record, ensure_ascii=False) + '\n')

    with open(output_path, 'rb') as f:
        dataset_bytes = f.read()

    await register_export(
        db,
        exporter_user_id=exporter_user_id,
        export_type="dpo_jsonl",
        dataset_bytes=dataset_bytes,
        report=report,
        anonymization_level="pseudo",  # DPO is the feedback-loop track
        metadata={
            "filters": {
                "source_types": source_types,
                "min_confidence": min_confidence,
                "language": language,
            },
            "filename": os.path.basename(output_path),
        },
    )
    logger.info(
        "[PREFERENCE] Exportado validado: %d pares (de %d candidatos) -> %s",
        len(report.valid), len(candidates), output_path,
    )
    return output_path, report


async def export_dpo_parquet_validated(
    db: AsyncSession,
    exporter_user_id: int,
    output_path: str = None,
    source_types: List[str] = None,
    min_confidence: float = 0.0,
    language: str = None,
    enforce_pii_recheck: bool = True,
) -> Tuple[str, "object"]:
    """LGPD-aware DPO Parquet export. Same validation flow as JSONL variant."""
    import pandas as pd

    from .export_validator_service import (
        register_export,
        validate_preference_entries_for_export,
    )

    query = select(PreferenceData).where(
        and_(
            PreferenceData.ready_for_export == True,
            PreferenceData.confidence_score >= min_confidence,
        )
    )
    if source_types:
        query = query.where(PreferenceData.source_type.in_(source_types))
    if language:
        query = query.where(PreferenceData.language == language)

    result = await db.execute(query)
    candidates = list(result.scalars().all())

    report = await validate_preference_entries_for_export(
        db, candidates, enforce_pii_recheck=enforce_pii_recheck,
    )

    if not output_path:
        exports_dir = os.path.join(Config.PROJECT_ROOT, 'exports')
        os.makedirs(exports_dir, exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        output_path = os.path.join(exports_dir, f"dpo_{timestamp}.parquet")

    records = [entry.to_dpo_format() for entry in report.valid]
    df = pd.DataFrame(records)
    df.to_parquet(output_path, index=False, engine='pyarrow')

    with open(output_path, 'rb') as f:
        dataset_bytes = f.read()

    await register_export(
        db,
        exporter_user_id=exporter_user_id,
        export_type="dpo_parquet",
        dataset_bytes=dataset_bytes,
        report=report,
        anonymization_level="pseudo",
        metadata={
            "filters": {
                "source_types": source_types,
                "min_confidence": min_confidence,
                "language": language,
            },
            "filename": os.path.basename(output_path),
        },
    )
    logger.info(
        "[PREFERENCE] Exportado parquet validado: %d pares (de %d candidatos) -> %s",
        len(report.valid), len(candidates), output_path,
    )
    return output_path, report


async def get_preference_stats(db: AsyncSession) -> Dict:
    """
    Retorna estatísticas sobre os dados de preferência coletados.

    Returns:
        Dict com estatísticas (total, por source, por source_type, etc.)
    """
    try:
        from sqlalchemy import func

        # Total de pares
        total_result = await db.execute(
            select(func.count(PreferenceData.id))
        )
        total = total_result.scalar()

        # Por preference_source
        by_source_result = await db.execute(
            select(
                PreferenceData.preference_source,
                func.count(PreferenceData.id)
            ).group_by(PreferenceData.preference_source)
        )
        by_source = dict(by_source_result.all())

        # Por source_type
        by_type_result = await db.execute(
            select(
                PreferenceData.source_type,
                func.count(PreferenceData.id)
            ).group_by(PreferenceData.source_type)
        )
        by_type = dict(by_type_result.all())

        # Ready for export
        ready_result = await db.execute(
            select(func.count(PreferenceData.id)).where(
                PreferenceData.ready_for_export == True
            )
        )
        ready_count = ready_result.scalar()

        # Média de confiança
        avg_conf_result = await db.execute(
            select(func.avg(PreferenceData.confidence_score))
        )
        avg_confidence = avg_conf_result.scalar() or 0

        return {
            "total_pairs": total,
            "ready_for_export": ready_count,
            "by_preference_source": by_source,
            "by_source_type": by_type,
            "average_confidence": round(float(avg_confidence), 3)
        }

    except Exception as e:
        logger.error(f"[PREFERENCE] Erro ao obter estatísticas: {e}")
        return {"error": str(e)}
