# qython/backend/services/academic_services/exam_generation_service.py

import logging
import json
import re
import os
from .. import llm_services, llm_provider
from .material_generation_service import _schema_questionario_objetivo
from google.genai import types
from types import SimpleNamespace
from ...models import ArenaExam

logger = logging.getLogger("qython_logger")

def _load_exam_context(context_filename: str) -> str:
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    context_path = os.path.join(backend_dir, 'exam_contexts', context_filename)
    
    logger.info(f"Carregando contexto do exame de: {context_path}")
    if not os.path.exists(context_path):
        logger.error(f"Arquivo de contexto não encontrado: {context_path}")
        return ""
    try:
        with open(context_path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        logger.error(f"Erro ao ler o arquivo de contexto {context_path}: {e}")
        return ""

def _alternatives_for(guide: str) -> int:
    """Número de alternativas da prova, na primeira linha do guia ("ALTERNATIVAS: 4")."""
    match = re.match(r"\s*ALTERNATIVAS:\s*(\d+)", guide or "")
    return int(match.group(1)) if match else 5


def _exam_plan() -> tuple:
    """(total de questões, questões por chamada). No Gemini, as 100 numa chamada só, como
    sempre foi. Num modelo local em CPU (~7 tokens/s) 100 questões levariam perto de uma
    hora e não caberiam na janela: o simulado fica menor (LOCAL_SIMULADO_QUESTIONS) e sai
    em lotes de 5, cada um com resposta em poucos minutos."""
    if llm_provider.provider_name() == "gemini":
        return 100, 100
    return max(5, int(os.getenv("LOCAL_SIMULADO_QUESTIONS", "20"))), 5


def _exam_prompt(exam: ArenaExam, guide: str, n: int, alternatives: int, avoid: list) -> str:
    letters = "ABCDEFGH"[:alternatives]
    avoid_block = ""
    if avoid:
        avoid_block = (
            "\n**NÃO REPITA** temas já cobertos neste simulado (enunciados abreviados):\n"
            + "\n".join(f"- {a}" for a in avoid) + "\n"
        )
    return f"""
    **PERSONA:** Você é um especialista sênior na elaboração de provas de residência médica, especificamente para o exame **{exam.title} ({exam.country})**.

    **TAREFA:** Gerar **{n} questões** de múltipla escolha fiéis ao estilo, ao formato, ao nível de dificuldade e aos temas do exame real, descritos no guia abaixo.

    **REGRAS ESTRUTURAIS:**
    1.  **Idioma:** Gere as questões inteiramente em **{exam.language}**.
    2.  **Formato:** Todas as questões DEVEM ter **exatamente {alternatives} alternativas ({", ".join(letters)})**. **Distratores HOMOGÊNEOS:** as alternativas devem ter comprimento, estrutura e nível técnico parecidos — a correta NÃO pode se destacar por ser a mais longa ou elaborada. Cada distrator deve ser plausível (um equívoco real e comum), exigindo domínio do CONCEITO para ser descartado.
    3.  **Originalidade:** questões novas, que poderiam estar na prova real; nunca reproduza questões de provas anteriores.
    4.  **Formato de Saída:** um único objeto JSON com a chave "questionario_objetivo": uma lista de {n} objetos de questão, cada um com "pergunta", "alternativas", "resposta_correta" e "justificativa".
{avoid_block}
    **INSTRUÇÃO FINAL:** Sua resposta inteira deve ser um único bloco de código JSON. Não inclua "```json" no início ou "```" no final. Sua resposta deve começar com `{{` e terminar com `}}`.

    ---
    **GUIA DE ESTILO DA PROVA ({exam.title}):**
    {guide}
    ---
    """


def generate_exam(exam: ArenaExam, user_id: int) -> tuple:
    logger.info(f"Iniciando geração de simulado para o exame '{exam.exam_code}' para o usuário {user_id}.")

    guide = _load_exam_context(exam.context_filename)
    if not guide.strip():
        raise RuntimeError(f"Não foi possível carregar o guia de estilo do exame {exam.exam_code}. A geração não pode continuar.")

    alternatives = _alternatives_for(guide)
    total, per_call = _exam_plan()
    model_name = llm_services.PRIMARY_LLM_MODEL
    local = llm_provider.provider_name() != "gemini"

    questions: list = []
    usage = None
    failures = 0
    while len(questions) < total and failures < 3:
        n = min(per_call, total - len(questions))
        avoid = [str(q.get("pergunta", ""))[:90] for q in questions[-20:]]
        config = types.GenerateContentConfig(
            temperature=0.5,
            # Teto proporcional no modelo local, para uma amostragem que degenera não
            # rodar por meia hora (ver material_generation_service).
            max_output_tokens=450 * n + 600 if local else 32768,
            response_mime_type="application/json",
        )
        if local:
            # Decodificação restrita ao schema: modelos pequenos erram o JSON sem ela.
            config.response_schema = _schema_questionario_objetivo(False)
        try:
            response = llm_services.client.models.generate_content(
                model=f'models/{model_name}',
                contents=llm_services._redact_llm_contents(_exam_prompt(exam, guide, n, alternatives, avoid)),
                config=config,
            )
            text = (response.text or "").strip()
            # Strip markdown code block if present
            if text.startswith('```'):
                text = re.sub(r'^```(?:json)?\s*', '', text)
                text = re.sub(r'\s*```$', '', text)
            parsed, ok, error = llm_services.try_parse_json_with_repair(text, context=f"simulado {exam.exam_code}")
            batch = (parsed or {}).get("questionario_objetivo", []) if ok and isinstance(parsed, dict) else []
            if not batch:
                raise ValueError(error or "lote sem questões")
            questions.extend(batch)
            usage = response.usage_metadata
            logger.info(f"Simulado '{exam.exam_code}': {len(questions)}/{total} questões.")
        except Exception as e:
            failures += 1
            logger.warning(f"Lote do simulado '{exam.exam_code}' falhou ({failures}/3): {e}")

    if not questions:
        raise RuntimeError(f"Erro na comunicação com o serviço de IA durante a geração das questões de {exam.title}.")

    logger.info(f"Exame '{exam.exam_code}' gerado com sucesso com {len(questions)} questões.")
    return {"questionario_objetivo": questions[:total]}, usage, model_name
