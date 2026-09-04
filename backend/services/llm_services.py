# qython/backend/services/llm_services.py

import os
import time
import logging
import re
import asyncio
from typing import List, Dict
from datetime import timedelta
import io
from PIL import Image
from google import genai
from google.api_core import exceptions as google_exceptions
from google.genai import types
import requests
import pathlib
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from ..models import AcademicLibrary
from ..config import Config

from .enhancementprompts import PROMPTS, PATIENT_DATA_RULE
from .academic_services import vector_db_service

logger = logging.getLogger(__name__)


def sanitize_user_input_for_prompt(text: str, max_length: int = 5000) -> str:
    """
    Sanitiza input do usuário antes de interpolá-lo em prompts LLM.
    Remove padrões comuns de prompt injection e limita o tamanho.
    """
    if not text:
        return ""
    # Truncar para evitar abuse de contexto
    text = text[:max_length]
    # Remover caracteres de controle e null bytes
    text = ''.join(char for char in text if ord(char) >= 32 or char in '\n\t\r')
    # Escapar delimitadores que podem quebrar a estrutura do prompt
    text = text.replace("```", "'''")
    text = text.replace("---", "___")
    return text.strip()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GOOGLE_CLOUD_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT")
GOOGLE_CLOUD_LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION")
SERVICE_ACCOUNT_FILE = os.getenv("SERVICE_ACCOUNT_FILE")
USE_SERVICE_ACCOUNT = os.getenv("USE_SERVICE_ACCOUNT", "0") == "1"

PRIMARY_LLM_MODEL = os.getenv("PRIMARY_LLM_MODEL")
FALLBACK_LLM_MODEL = os.getenv("FALLBACK_LLM_MODEL")
SIMPLE_TASK_LLM_MODEL = os.getenv("SIMPLE_TASK_LLM_MODEL")
MEDICAL_IMAGE_ANALYST_MODEL = os.getenv("MEDICAL_IMAGE_ANALYST_MODEL")


MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))
INITIAL_BACKOFF = int(os.getenv("INITIAL_BACKOFF", "2"))
MAX_BACKOFF = int(os.getenv("MAX_BACKOFF", "60"))

DEFAULT_MAX_TOKENS_COMPLEX = int(os.getenv("DEFAULT_MAX_TOKENS_COMPLEX", "8192"))
DEFAULT_MAX_TOKENS_CHAT = int(os.getenv("DEFAULT_MAX_TOKENS_CHAT", "8192"))
DEFAULT_MAX_TOKENS_SUMMARY = int(os.getenv("DEFAULT_MAX_TOKENS_SUMMARY", "4096"))
DEFAULT_MAX_TOKENS_IMPROVE_NOTES = int(os.getenv("DEFAULT_MAX_TOKENS_IMPROVE_NOTES", "16384"))
DEFAULT_MAX_TOKENS_SIMPLE = int(os.getenv("DEFAULT_MAX_TOKENS_SIMPLE", "1024"))

# === SISTEMA DE PROMPTS DINÂMICOS ===
import json
from starlette.concurrency import run_in_threadpool
PROMPTS_FILE = os.path.join(Config.PROJECT_ROOT, 'config', 'system_prompts.json')


def repair_json_string(json_str: str) -> str:
    """
    Attempts to repair common JSON formatting issues from LLM responses.
    Handles:
    - Unterminated strings
    - Missing closing brackets
    - Trailing commas
    - Unescaped control characters
    """
    if not json_str or not json_str.strip():
        return json_str

    text = json_str.strip()

    # Remove markdown code blocks if present
    if text.startswith("```"):
        lines = text.split('\n')
        # Remove first line (```json or ```)
        lines = lines[1:]
        # Remove last line if it's just ```
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = '\n'.join(lines).strip()

    # Count brackets to detect imbalance
    open_brackets = text.count('[')
    close_brackets = text.count(']')
    open_braces = text.count('{')
    close_braces = text.count('}')

    # Fix unterminated strings - find last complete object/array
    # If we have more opening than closing, try to close them
    if open_brackets > close_brackets or open_braces > close_braces:
        # Try to find a valid truncation point
        # Look for the last complete object (ends with })
        last_complete_brace = text.rfind('}')
        if last_complete_brace > 0:
            # Check if we need to close an array
            temp = text[:last_complete_brace + 1]
            # Add missing closing brackets
            temp_open = temp.count('[')
            temp_close = temp.count(']')
            if temp_open > temp_close:
                text = temp + ']' * (temp_open - temp_close)
            else:
                text = temp

    # Remove trailing commas before ] or }
    text = re.sub(r',(\s*[\]\}])', r'\1', text)

    # Fix common escape issues in strings
    # Replace unescaped newlines inside strings (this is a heuristic)
    # Look for patterns like "text\nmore text" where newline isn't escaped

    return text


def try_parse_json_with_repair(json_str: str, context: str = "") -> tuple:
    """
    Attempts to parse JSON, with automatic repair on failure.
    Returns (parsed_data, success_bool, error_message)
    """
    if not json_str or not json_str.strip():
        return None, False, "Empty input"

    # First, try parsing as-is
    try:
        return json.loads(json_str), True, None
    except json.JSONDecodeError as first_error:
        logger.debug(f"[JSON_REPAIR] {context} First parse failed: {first_error}")

    # Try with repair
    repaired = repair_json_string(json_str)
    try:
        result = json.loads(repaired)
        logger.info(f"[JSON_REPAIR] {context} Successfully parsed after repair")
        return result, True, None
    except json.JSONDecodeError as repair_error:
        logger.debug(f"[JSON_REPAIR] {context} Repair attempt failed: {repair_error}")

    # Last resort: try to extract just the array/object portion
    # Find first [ or { and try to parse from there
    array_start = json_str.find('[')
    obj_start = json_str.find('{')

    if array_start >= 0 or obj_start >= 0:
        start_idx = min(
            array_start if array_start >= 0 else len(json_str),
            obj_start if obj_start >= 0 else len(json_str)
        )
        extracted = json_str[start_idx:]
        extracted_repaired = repair_json_string(extracted)
        try:
            result = json.loads(extracted_repaired)
            logger.info(f"[JSON_REPAIR] {context} Successfully parsed after extraction and repair")
            return result, True, None
        except json.JSONDecodeError:
            pass

    return None, False, f"All repair attempts failed"

# Prompts Padrão (hardcoded como fallback)
DEFAULT_NEURALWEB_PROMPT = (
    "**PERSONA:** Você é Qython, um assistente de IA médico avançado, projetado para um chat interativo com profissionais de saúde. "
    "Sua finalidade é fornecer respostas diretas, precisas, baseadas em evidências e clinicamente relevantes. "
    "Comunique-se de forma clara, objetiva e conversacional, como um colega experiente. "
    "NUNCA se identifique como um 'modelo de linguagem' ou 'treinado pelo Google'. Você é Qython. "
    "Responda diretamente à pergunta do usuário, sem usar saudações formais (como 'Prezado(a) colega') ou despedidas (como 'Atenciosamente').\n\n"
    "**ESCOPO E CONTEXTO:**\n"
    "Você atende profissionais e estudantes de saúde. Considere dentro do escopo "
    "tudo que faça parte da prática médica — inclusive o que não é obviamente "
    "clínico, mas que o médico precisa no dia a dia:\n"
    "- Medicina, doenças, sintomas, tratamentos, farmacologia, ciências biomédicas\n"
    "- Procedimentos clínicos/cirúrgicos, interpretação de exames, diagnóstico\n"
    "- Saúde pública, epidemiologia, bioestatística e metodologia de pesquisa\n"
    "- Ética e legislação médica (CFM, LGPD na clínica, telemedicina), gestão de consultório, economia da saúde, faturamento/TUSS\n"
    "- Redação científica e médica, tradução de artigos, cartas de encaminhamento e documentos clínicos\n"
    "- Tecnologia em saúde, dispositivos médicos, educação médica, determinantes sociais/ambientais e ocupacionais da saúde\n\n"
    "Use bom senso: responda diretamente sempre que houver qualquer enquadramento "
    "médico ou profissional plausível — não recuse só porque o tema não é "
    "estritamente clínico. Apenas para pedidos claramente alheios à área da saúde "
    "(ex.: entretenimento, política partidária, esportes, programação sem relação "
    "com medicina), responda de forma breve e cordial e ofereça ajuda com algo "
    "médico — sem recusa ríspida nem texto pronto.\n\n"
    "**REGRA SOBRE REFERÊNCIAS (EMBASAMENTO POR BUSCA):**\n"
    "- Ao afirmar fatos clínicos verificáveis (doses/ajustes, condutas, critérios diagnósticos, escores, "
    "diretrizes, dados epidemiológicos), SEMPRE pesquise na web e fundamente a resposta nas fontes que "
    "encontrar — NÃO responda apenas de memória quando há um fato verificável em jogo. Priorize fontes "
    "oficiais e indexadas (diretriz, sociedade, bula, PubMed, AHA, ESC, SBEM, NEJM, Lancet).\n"
    "- O sistema CAPTURA AUTOMATICAMENTE as fontes que você consultou na busca e monta a lista de referências "
    "e os marcadores `[n]` no texto. Você NÃO precisa escrever a lista nem fornecer/recordar PMIDs, DOIs ou "
    "URLs — e NUNCA deve inventá-los ou recuperá-los de memória.\n"
    "- Opcional: se citar um estudo/diretriz específico pelo nome, pode marcá-lo ao final com `[REFS]` "
    "(ex.: `[REFS]\\n1. Autor et al. Título. Ano.`) e o sistema resolve — mas a BUSCA é o caminho principal.\n"
    "- Só DISPENSA a busca em conversa, saudação, planejamento ou opinião pura. ⚠️ Conduta, dose, protocolo, escore, critério diagnóstico ou diretriz clínica NÃO são 'consensual dispensável' — mesmo que pareçam óbvios (ex.: ACLS/parada, cetoacidose/CAD, sepse, IAM), PESQUISE e fundamente nas fontes.\n\n"
    "**IMAGEM DA BIBLIOTECA DO USUÁRIO:**\n"
    "Quando o ACHADO VISUAL for central para a resposta — morfologia de lesão de pele, padrão de "
    "exantema, traçado de ECG, padrão radiológico, achado de fundoscopia, peça anatômica —, você "
    "pode pedir uma imagem escrevendo, em uma linha SOZINHA, no ponto exato do texto onde ela "
    "ajuda:\n"
    "`[IMAGEM: <descrição do que mostrar, EM INGLÊS>]`\n"
    "Ex.: `[IMAGEM: dermatology photograph of herpes zoster vesicular rash in dermatomal distribution]`\n"
    "Regras: (1) a consulta vai em INGLÊS — o acervo é indexado em inglês e em português o recall cai a zero; "
    "(2) no MÁXIMO 2 por resposta, e só quando a imagem acrescenta o que o texto não descreve; "
    "(3) NÃO use para enfeitar (nada de ilustrar 'consulta médica' ou 'hospital'); "
    "(4) o sistema busca no material que o PRÓPRIO usuário subiu e insere a imagem com a fonte (documento e página); "
    "se não houver nada que corresponda, a linha é removida — então NUNCA escreva o texto dependendo da imagem "
    "(\"como se vê na figura acima\"): a resposta tem de fazer sentido sem ela.\n\n"
    "**CONSULTA DE MEDICAMENTOS:**\n"
    "Quando o usuário perguntar sobre um medicamento específico (nome comercial ou genérico), forneça uma resposta estruturada e completa cobrindo TODOS os tópicos abaixo que forem clinicamente relevantes:\n\n"
    "1. **Nome genérico e classe farmacológica** — identifique a classe terapêutica e o mecanismo de ação resumido.\n"
    "2. **Indicações principais** — para quais condições é aprovado/utilizado na prática clínica.\n"
    "3. **Posologia habitual** — doses padrão para adultos (e pediátrica se relevante), via de administração, frequência e duração típica do tratamento.\n"
    "4. **Ajustes de dose** — insuficiência renal, insuficiência hepática, idosos, obesidade, quando aplicável.\n"
    "5. **Contraindicações** — absolutas e relativas.\n"
    "6. **Efeitos adversos** — os mais comuns E os mais graves (mesmo que raros).\n"
    "7. **Interações medicamentosas relevantes** — as mais importantes na prática clínica.\n"
    "8. **Gestação e lactação** — categoria de risco ou status atual (FDA/ANVISA).\n"
    "9. **Monitorização** — exames laboratoriais ou parâmetros clínicos a serem monitorados.\n"
    "10. **Observações clínicas práticas** — dicas de prescrição, alertas de segurança recentes, equivalências terapêuticas, custo-efetividade quando relevante.\n\n"
    "Se o usuário fizer uma pergunta específica sobre apenas um aspecto do medicamento (ex: 'qual a dose de amoxicilina?'), responda focado naquele aspecto sem incluir todos os tópicos. "
    "Use a estrutura completa apenas quando a pergunta for ampla (ex: 'me fale sobre a metformina', 'informações sobre losartana').\n"
)

DEFAULT_CLINICAL_REASONING_PROMPT = (
    "**PERSONA:** Você é Qython em modo de Discussão Clínica. Imagine que você está discutindo um caso clínico com um colega em um corredor do hospital - pragmático, direto, mas profundo quando necessário.\n\n"
    "**FILOSOFIA DO MODO 'DISCUSSÃO CLÍNICA':**\n"
    "Este NÃO é um modo de ensino tradicional com perguntas intermináveis. É uma discussão estratégica entre pares. Você deve:\n\n"
    "1. **SER EFICIENTE:** Se a pergunta é factual e direta (ex: 'dose de amoxicilina para sinusite'), responda diretamente sem rodeios.\n\n"
    "2. **QUESTIONAR ESTRATEGICAMENTE:** Faça perguntas APENAS quando:\n"
    "   - Há risco clínico significativo que o usuário pode não ter considerado\n"
    "   - Uma nuance do caso pode mudar completamente a conduta\n"
    "   - Falta informação crítica para segurança do paciente\n"
    "   - Há oportunidade pedagógica de alto valor (não trivial)\n\n"
    "3. **USAR QUESTIONAMENTO SOCRÁTICO SUAVE:**\n"
    "   ❌ MAU: 'Quais são suas 3 principais hipóteses diagnósticas? Justifique cada uma. Liste o diagnóstico diferencial completo.'\n"
    "   ✅ BOM: 'IAM parece provável aqui. Mas com 78 anos e histórico de gastrite, vale pensar: ticagrelor ou clopidogrel? O risco hemorrágico muda nossa escolha?'\n\n"
    "4. **PRIORIZAR SEGURANÇA:** Sempre que houver:\n"
    "   - Risco de erro diagnóstico grave\n"
    "   - Medicação com janela terapêutica estreita\n"
    "   - Contraindicações não consideradas\n"
    "   → Faça uma pergunta focada para chamar atenção ao ponto.\n\n"
    "5. **FORNECER CONTEXTO, NÃO APENAS FATOS:**\n"
    "   Ao responder, explique o 'porquê' de forma concisa. Não liste apenas protocolos - discuta o raciocínio.\n\n"
    "6. **RECONHECER INCERTEZA:**\n"
    "   Se o caso for ambíguo, diga. Discuta as opções. Medicina não é binária.\n\n"
    "**EXEMPLO DE BOA DISCUSSÃO:**\n"
    "USUÁRIO: 'Paciente 55a, DM2, glicemia 180. Ajustar dose de metformina?'\n"
    "VOCÊ: 'Antes de mexer na metformina: ela está tomando algum ISGLT2? Pergunto porque se ela tiver HbA1c recente >8% e risco cardiovascular (idade + DM de longa data), adicionar empagliflozina pode ter mais impacto que só aumentar metformina. Tem esses dados?'\n\n"
    "**EXEMPLO DE EFICIÊNCIA:**\n"
    "USUÁRIO: 'Dose de azitromicina para pneumonia comunitária?'\n"
    "VOCÊ: '500mg no D1, seguido de 250mg/dia D2-D5. Se for PAC grave (CURB-65 ≥2), considere betalactâmico associado (ex: amoxicilina-clavulanato 875mg 12/12h).'\n\n"
    "**QUANDO NÃO QUESTIONAR:**\n"
    "- Perguntas factuais simples\n"
    "- Cálculos de dose padrão\n"
    "- Casos straightforward sem nuances\n\n"
    "**EMBASAMENTO POR BUSCA:**\n"
    "Ao afirmar fatos clínicos verificáveis (doses, condutas, critérios, escores, diretrizes, estudos), "
    "SEMPRE pesquise na web e fundamente a resposta nas fontes que encontrar — não responda só de memória. "
    "O sistema CAPTURA AUTOMATICAMENTE as fontes consultadas e monta a lista de referências e os marcadores "
    "`[n]`; você NÃO precisa escrever a lista nem fornecer/recordar PMIDs, DOIs ou URLs, e NUNCA deve "
    "inventá-los ou recuperá-los de memória.\n"
    "Opcional: citar um estudo/diretriz pelo nome com `[REFS]` ao final (`[REFS]\\n1. Autor et al. Título. Ano.`) "
    "— mas a busca é o caminho principal. "
    "Só dispensa a busca em conversa, perguntas clarificadoras/estratégicas ou opinião. ⚠️ Conduta/dose/protocolo/critério/diretriz clínicos, mesmo consensuais (ACLS, CAD, sepse, IAM), DEVEM ser pesquisados e fundamentados.\n\n"
    "**TOM:** Colega experiente, não professor avaliando. Respeite o conhecimento do usuário, mas não tenha medo de questionar gentilmente quando necessário.\n\n"
    "**IMAGEM DA BIBLIOTECA DO USUÁRIO:**\n"
    "Quando o ACHADO VISUAL for central para a resposta — morfologia de lesão de pele, padrão de "
    "exantema, traçado de ECG, padrão radiológico, achado de fundoscopia, peça anatômica —, você "
    "pode pedir uma imagem escrevendo, em uma linha SOZINHA, no ponto exato do texto onde ela "
    "ajuda:\n"
    "`[IMAGEM: <descrição do que mostrar, EM INGLÊS>]`\n"
    "Ex.: `[IMAGEM: dermatology photograph of herpes zoster vesicular rash in dermatomal distribution]`\n"
    "Regras: (1) a consulta vai em INGLÊS — o acervo é indexado em inglês e em português o recall cai a zero; "
    "(2) no MÁXIMO 2 por resposta, e só quando a imagem acrescenta o que o texto não descreve; "
    "(3) NÃO use para enfeitar (nada de ilustrar 'consulta médica' ou 'hospital'); "
    "(4) o sistema busca no material que o PRÓPRIO usuário subiu e insere a imagem com a fonte (documento e página); "
    "se não houver nada que corresponda, a linha é removida — então NUNCA escreva o texto dependendo da imagem "
    "(\"como se vê na figura acima\"): a resposta tem de fazer sentido sem ela.\n\n"
    "**CONSULTA DE MEDICAMENTOS:**\n"
    "Quando o usuário perguntar sobre um medicamento específico (nome comercial ou genérico), forneça uma resposta estruturada e completa cobrindo TODOS os tópicos abaixo que forem clinicamente relevantes:\n\n"
    "1. **Nome genérico e classe farmacológica** — identifique a classe terapêutica e o mecanismo de ação resumido.\n"
    "2. **Indicações principais** — para quais condições é aprovado/utilizado na prática clínica.\n"
    "3. **Posologia habitual** — doses padrão para adultos (e pediátrica se relevante), via de administração, frequência e duração típica do tratamento.\n"
    "4. **Ajustes de dose** — insuficiência renal, insuficiência hepática, idosos, obesidade, quando aplicável.\n"
    "5. **Contraindicações** — absolutas e relativas.\n"
    "6. **Efeitos adversos** — os mais comuns E os mais graves (mesmo que raros).\n"
    "7. **Interações medicamentosas relevantes** — as mais importantes na prática clínica.\n"
    "8. **Gestação e lactação** — categoria de risco ou status atual (FDA/ANVISA).\n"
    "9. **Monitorização** — exames laboratoriais ou parâmetros clínicos a serem monitorados.\n"
    "10. **Observações clínicas práticas** — dicas de prescrição, alertas de segurança recentes, equivalências terapêuticas, custo-efetividade quando relevante.\n\n"
    "Se o usuário fizer uma pergunta específica sobre apenas um aspecto do medicamento (ex: 'qual a dose de amoxicilina?'), responda focado naquele aspecto sem incluir todos os tópicos — mantenha a eficiência da discussão clínica. "
    "Use a estrutura completa apenas quando a pergunta for ampla (ex: 'me fale sobre a metformina', 'informações sobre losartana').\n"
)

# Prompts ativos em memória (iniciados com defaults)
current_prompts = {
    "neuralweb_chat": DEFAULT_NEURALWEB_PROMPT,
    "clinical_reasoning": DEFAULT_CLINICAL_REASONING_PROMPT
}

def reload_system_prompts():
    """Carrega os prompts do arquivo JSON para a memória. Chamável via Admin Panel."""
    global current_prompts
    if os.path.exists(PROMPTS_FILE):
        try:
            with open(PROMPTS_FILE, 'r', encoding='utf-8') as f:
                file_prompts = json.load(f)
                # Atualiza apenas se tiver conteúdo
                if file_prompts.get('neuralweb_chat'):
                    current_prompts['neuralweb_chat'] = file_prompts['neuralweb_chat']
                if file_prompts.get('clinical_reasoning'):
                    current_prompts['clinical_reasoning'] = file_prompts['clinical_reasoning']
                logger.info("Prompts do sistema recarregados do arquivo JSON.")
        except Exception as e:
            logger.error(f"Erro ao carregar prompts do arquivo: {e}")
    else:
        logger.info("Arquivo de prompts não encontrado. Usando defaults hardcoded.")

# Carrega prompts na inicialização do módulo
reload_system_prompts()

# Variáveis de compatibilidade (apontam para os prompts dinâmicos)
NEURALWEB_CONVENCIONAL_CHAT_PROMPT = current_prompts["neuralweb_chat"]
CLINICAL_REASONING_AGENT_PROMPT = current_prompts["clinical_reasoning"]


# CLIENTE GLOBAL PARA REUTILIZAÇÃO
# This is the correct way to set a global timeout for all requests.
http_options = types.HttpOptions(
    client_args={'timeout': 300.0}
)

# ── Fallback transparente p/ FREE tier ────────────────────────────────────────────────
# Resiliência do Gemini PAGO em sobrecarga TRANSITÓRIA (503 UNAVAILABLE "high demand"): re-tenta
# a MESMA chamada no próprio modelo pago, com backoff curto (o 503 é "tente de novo em instantes").
# NÃO há mais fallback de chave FREE — o projeto free do Google foi descontinuado/bloqueado
# (403 "project has been denied access"); tudo roda na chave PAGA. Tunável por env (sem deploy).
GEMINI_PAID_RETRIES = max(0, int(os.getenv("GEMINI_PAID_RETRIES", "2")))           # re-tentativas extras no 503
GEMINI_PAID_RETRY_BACKOFF = float(os.getenv("GEMINI_PAID_RETRY_BACKOFF", "0.8"))   # segundos × nº da tentativa


def _is_quota_error(exc) -> bool:
    s = str(exc).lower()
    return any(k in s for k in ('resource_exhausted', '429', 'prepayment', 'quota', 'exhausted'))


def _is_transient_error(exc) -> bool:
    s = str(exc).lower()
    return any(k in s for k in ('503', 'unavailable', 'high demand', 'overloaded'))


# Preço por 1M tokens (input, output) em USD — thinking conta como OUTPUT. Fonte:
# BILLING_ECONOMICS.md. Modelos fora da tabela → custo logado como "$? (preço desconhecido)".
_MODEL_PRICE_PER_1M_USD = {
    'gemini-3.5-flash': (1.50, 9.00),
    'gemini-3.1-flash': (0.50, 3.00),        # estimado (não-lite) — confirmar preço GA
    'gemini-3.1-flash-lite': (0.25, 1.50),
    'gemini-3-flash-preview': (0.50, 3.00),
    'gemini-2.5-flash': (0.30, 2.50),
    'gemini-2.5-flash-lite': (0.10, 0.40),
}


def _log_call_cost(label: str, model: str, usage) -> None:
    """Instrumentação de custo: loga input/output/thinking tokens → USD por chamada, p/ medir a
    margem REAL por feature (a tabela do BILLING_ECONOMICS ignorava thinking). thinking = output."""
    try:
        if not usage:
            return
        key = (model or '').replace('models/', '')
        inp = getattr(usage, 'prompt_token_count', 0) or 0
        out = getattr(usage, 'candidates_token_count', 0) or 0
        think = getattr(usage, 'thoughts_token_count', 0) or 0
        price = _MODEL_PRICE_PER_1M_USD.get(key)
        if price:
            cost = inp / 1e6 * price[0] + (out + think) / 1e6 * price[1]
            logger.info(f"[COST] {label} model={key} in={inp} out={out} think={think} → ${cost:.5f}")
        else:
            logger.info(f"[COST] {label} model={key} in={inp} out={out} think={think} → $? (preço desconhecido)")
    except Exception as e:
        logger.debug(f"[COST] falha ao logar custo: {e}")


def _adapt_kwargs_for_model(kwargs: dict, model_full_name: str) -> dict:
    """Ao trocar de modelo (ex.: fallback p/ free), reconstrói o thinking_config p/ casar com
    a família do modelo alvo: Gemini 3.x usa thinking_level; 2.5 usa thinking_budget. Sem isso,
    mandar um thinking_level (gemini-3) p/ um gemini-2.5 dá 400 INVALID_ARGUMENT e mata o
    fallback inteiro. `_get_thinking_config_for_model` é definido adiante (resolvido em runtime)."""
    cfg = kwargs.get('config')
    if cfg is None or getattr(cfg, 'thinking_config', None) is None:
        return kwargs
    try:
        # Preserva a INTENÇÃO ao trocar de família: thinking minimal continua minimal, não
        # vira HIGH (senão um título pediria raciocínio máximo de novo no fallback free).
        tc = cfg.thinking_config
        is_minimal = (getattr(tc, 'thinking_budget', None) == 0) or \
                     (getattr(tc, 'thinking_level', None) in (types.ThinkingLevel.MINIMAL, types.ThinkingLevel.LOW))
        adapted = _get_thinking_config_for_model(model_full_name, 'minimal' if is_minimal else 'high')
        copy_fn = getattr(cfg, 'model_copy', None) or getattr(cfg, 'copy', None)
        if copy_fn is None:
            return kwargs
        return {**kwargs, 'config': copy_fn(update={'thinking_config': adapted})}
    except Exception:
        return kwargs


class _ResilientModels:
    """Espelha client.models.*. Em sobrecarga TRANSITÓRIA do PAGO (503 UNAVAILABLE "high demand")
    re-tenta o próprio modelo pago com backoff curto antes de desistir — o 503 é "tente de novo em
    instantes" e a chave PAGA é a única (o free foi descontinuado/bloqueado pelo Google). Cota
    (429) e demais erros (400 etc.) propagam pro caller na hora."""
    def __init__(self, paid_models):
        self._paid = paid_models

    def generate_content(self, *args, **kwargs):
        import time
        last = None
        for attempt in range(GEMINI_PAID_RETRIES + 1):
            try:
                return self._paid.generate_content(*args, **kwargs)
            except Exception as exc:
                last = exc
                # Só re-tenta em sobrecarga transitória (503/UNAVAILABLE). Cota (429) e erro
                # "real" (400 etc.) propagam na hora — retry não ajudaria.
                if attempt < GEMINI_PAID_RETRIES and _is_transient_error(exc) and not _is_quota_error(exc):
                    backoff = GEMINI_PAID_RETRY_BACKOFF * (attempt + 1)
                    logger.warning("Gemini PAGO 503 (sobrecarga) — retry %d/%d em %.1fs",
                                   attempt + 1, GEMINI_PAID_RETRIES, backoff)
                    time.sleep(backoff)
                    continue
                raise
        raise last  # defensivo (laço sempre retorna ou levanta)

    def __getattr__(self, name):
        return getattr(self._paid, name)


class ResilientGeminiClient:
    """genai.Client da chave PAGA com retry de sobrecarga transitória (503). Expõe
    `.models.generate_content` (usado em todo o backend); os demais atributos delegam ao paid."""
    def __init__(self, paid_client):
        self._paid = paid_client
        self.models = _ResilientModels(paid_client.models)

    def __getattr__(self, name):
        return getattr(self._paid, name)


_paid_client = genai.Client(api_key=Config.GEMINI_API_KEY, http_options=http_options)
client = ResilientGeminiClient(_paid_client)
logger.info("Cliente Gemini inicializado (timeout 300s) — chave PAGA única + retry no 503 (até %d).", GEMINI_PAID_RETRIES)


# ---------------------------------------------------------------------------
# LGPD: PII redaction for every outbound Gemini call.
#
# `client.models.generate_content(contents=...)` accepts strings, lists of
# strings, lists of dicts (multimodal messages), or types.Content objects.
# `_redact_llm_contents` walks the structure and redacts identifying PII in
# string leaves before they leave the server. Non-string values (images,
# files, configs) pass through untouched.
# ---------------------------------------------------------------------------
from ..middleware.pii_redaction import redact_for_llm  # noqa: E402


def _redact_llm_contents(value):
    """Recursively redact PII in any string leaves of an LLM-bound payload.

    Handles primitive strings, lists, dicts, and SDK Content/Part objects
    (which expose a `.text` attribute we can rewrite). Non-string fields
    pass through untouched, so images, files and configs are unaffected.
    """
    try:
        if value is None or isinstance(value, (int, float, bool, bytes)):
            return value
        if isinstance(value, str):
            redacted, _ = redact_for_llm(value, preserve_tokens=False)
            return redacted
        if isinstance(value, dict):
            return {k: _redact_llm_contents(v) for k, v in value.items()}
        if isinstance(value, (list, tuple)):
            cls = type(value)
            return cls(_redact_llm_contents(item) for item in value)
        # SDK objects (types.Content / types.Part) — patch .text if present
        text_attr = getattr(value, "text", None)
        if isinstance(text_attr, str):
            try:
                redacted, _ = redact_for_llm(text_attr, preserve_tokens=False)
                value.text = redacted
            except Exception:
                pass
        return value
    except Exception as exc:
        logger.warning("PII redaction skipped on payload of type %s: %s",
                       type(value).__name__, exc)
        return value

# Dicionário para gerenciar caches em memória
prompt_cache_manager = {}
ENABLE_PROMPT_CACHING = os.getenv("ENABLE_PROMPT_CACHING", "0") == "1"

def initialize_prompt_cache():
    if not ENABLE_PROMPT_CACHING:
        logger.info("O cache de prompts está desabilitado pela configuração de ambiente (ENABLE_PROMPT_CACHING=0).")
        return

    logger.info("Iniciando cacheamento de prompts de melhoria...")
    # Conforme a documentação, o cache é criado com um modelo específico.
    model_for_caching = Config.PRIMARY_LLM_MODEL
    
    for specialty, types_map in PROMPTS.items():
        for consult_type, prompt_text in types_map.items():
            cache_name = f"{specialty.lower()}_{consult_type}"
            try:
                cached_content = client.caches.create(
                    model=model_for_caching,
                    config={
                        'system_instruction': prompt_text,
                        'ttl': "3600s"
                    }
                )
                prompt_cache_manager[cache_name] = cached_content
                logger.info(f"Prompt '{cache_name}' cacheado com sucesso: {cached_content.name}")
            except Exception as e:
                error_message = str(e)
                # Verifica se o erro é o específico de "conteúdo muito pequeno"
                if "INVALID_ARGUMENT" in error_message and "Cached content is too small" in error_message:
                    logger.warning(f"Não foi possível cachear o prompt '{cache_name}' pois ele não atende aos requisitos da API (tamanho mínimo). A funcionalidade continuará sem cache para este item. Erro: {error_message}")
                else:
                    # Para todos os outros erros, registra como um erro crítico
                    logger.error(f"Falha inesperada ao tentar cachear o prompt '{cache_name}': {error_message}")

# Chame esta função na inicialização do seu servidor (por exemplo, no main.py ou no início deste módulo)
initialize_prompt_cache()

# Função para melhorar as anotações de consulta
def improve_consultation_notes(specialty: str, is_first_consultation: bool, raw_text: str, language_code: str = 'pt-BR') -> str:
    logger.info(f"Iniciando improve_consultation_notes: specialty={specialty}, is_first_consultation={is_first_consultation}, language_code={language_code}")

    if not specialty or not isinstance(specialty, str):
        logger.error(f"Specialty inválida fornecida: '{specialty}'")
        return "Erro: Especialidade inválida fornecida."
    if not raw_text or not isinstance(raw_text, str) or not raw_text.strip():
        logger.error(f"Texto bruto inválido ou ausente.")
        return "Erro: Texto bruto inválido ou ausente."

    if isinstance(is_first_consultation, str):
        is_first_consultation = is_first_consultation.lower() == 'true'
    elif not isinstance(is_first_consultation, bool):
        logger.warning(f"is_first_consultation ('{is_first_consultation}') não é booleano, interpretando como True por padrão.")
        is_first_consultation = True

    consultation_type = "first" if is_first_consultation else "return"
    logger.debug(f"Tipo de consulta determinado: {consultation_type} para especialidade: {specialty}")

    cached_prompt_name = f"{specialty.lower()}_{consultation_type}"
    cached_content_ref = prompt_cache_manager.get(cached_prompt_name)

    config = None
    contents = None

    if not cached_content_ref:
        logger.warning(f"Cache para '{cached_prompt_name}' não encontrado. Usando prompt genérico sem cache.")
        
        # === MULTILINGUAL SUPPORT ===
        # Comprehensive language instructions that handle few-shot examples properly
        language_instructions = {
            'en': (
                "**CRITICAL LANGUAGE INSTRUCTION:**\n"
                "1. Write your ENTIRE response in **English (US)**.\n"
                "2. The instructions and examples below are in Portuguese for reference, but you MUST produce output in English.\n"
                "3. Apply the same clinical reasoning and transformation patterns shown in the Portuguese examples, but generate English output.\n"
                "4. Use standard English medical terminology (e.g., 'Chief Complaint' not 'Queixa Principal', 'History of Present Illness' not 'HDA').\n"
                "5. Maintain the same formatting structure (bold headers, lists, sections) as shown in the examples.\n\n"
            ),
            'en-US': (
                "**CRITICAL LANGUAGE INSTRUCTION:**\n"
                "1. Write your ENTIRE response in **English (US)**.\n"
                "2. The instructions and examples below are in Portuguese for reference, but you MUST produce output in English.\n"
                "3. Apply the same clinical reasoning and transformation patterns shown in the Portuguese examples, but generate English output.\n"
                "4. Use standard English medical terminology (e.g., 'Chief Complaint' not 'Queixa Principal', 'History of Present Illness' not 'HDA').\n"
                "5. Maintain the same formatting structure (bold headers, lists, sections) as shown in the examples.\n\n"
            ),
            'es': (
                "**INSTRUCCIÓN CRÍTICA DE IDIOMA:**\n"
                "1. Escriba TODA su respuesta en **español**.\n"
                "2. Las instrucciones y ejemplos a continuación están en portugués como referencia, pero DEBE producir la salida en español.\n"
                "3. Aplique el mismo razonamiento clínico y patrones de transformación mostrados en los ejemplos portugueses, pero genere salida en español.\n"
                "4. Use terminología médica estándar en español (ej: 'Motivo de Consulta' no 'Queixa Principal', 'Enfermedad Actual' no 'HDA').\n"
                "5. Mantenga la misma estructura de formato (encabezados en negrita, listas, secciones) mostrada en los ejemplos.\n\n"
            ),
            'es-ES': (
                "**INSTRUCCIÓN CRÍTICA DE IDIOMA:**\n"
                "1. Escriba TODA su respuesta en **español**.\n"
                "2. Las instrucciones y ejemplos a continuación están en portugués como referencia, pero DEBE producir la salida en español.\n"
                "3. Aplique el mismo razonamiento clínico y patrones de transformación mostrados en los ejemplos portugueses, pero genere salida en español.\n"
                "4. Use terminología médica estándar en español (ej: 'Motivo de Consulta' no 'Queixa Principal', 'Enfermedad Actual' no 'HDA').\n"
                "5. Mantenga la misma estructura de formato (encabezados en negrita, listas, secciones) mostrada en los ejemplos.\n\n"
            ),
            'pt': "",  # Default - prompts are already in Portuguese
            'pt-BR': ""
        }
        language_prefix = language_instructions.get(language_code, "")
        
        default_prompt_instructions = (
            "Você é um médico clínico geral organizando uma consulta médica a partir de anotações brutas ou ditado por voz.\n\n"
            "## Sua Tarefa\n"
            "Transforme o texto bruto abaixo em uma consulta médica estruturada e profissional.\n\n"
            "## REGRA CRÍTICA - NUNCA INVENTE INFORMAÇÕES\n"
            "- Se os dados do paciente (nome, idade, sexo) foram fornecidos no contexto, use EXATAMENTE esses dados\n"
            "- Se NÃO foram fornecidos dados do paciente, NÃO mencione idade, sexo ou nome - deixe essas informações em branco\n"
            "- NUNCA invente dados demográficos como 'paciente feminina de 45 anos' se essa informação não foi fornecida\n"
            "- É MELHOR omitir uma informação do que inventá-la\n\n"
            "## REGRA OBRIGATÓRIA - CÓDIGOS CID-10\n"
            "- SEMPRE inclua o código CID-10 entre parênteses após cada hipótese diagnóstica\n"
            "- Formato: 'Nome do Diagnóstico (CID-10: X00.0)' ou 'Nome do Diagnóstico (X00.0)'\n"
            "- Exemplos: Hipertensão Arterial Sistêmica (I10), Diabetes Mellitus Tipo 2 (E11.9)\n\n"
            "## Regras Obrigatórias\n"
            "1. EXTRAIA todas as informações relevantes do texto e organize nas seções corretas\n"
            "2. INFIRA hipóteses diagnósticas baseadas nos sintomas e achados descritos\n"
            "3. COMPLETE a conduta com exames e orientações pertinentes ao caso\n"
            "4. USE linguagem médica formal e objetiva\n"
            "5. NÃO use linguagem sugestiva ('considerar', 'sugerido', 'a avaliar', 'poderia ser')\n"
            "6. NÃO adicione seções de 'análise crítica', 'sugestões' ou 'comentários'\n"
            "7. NÃO use asteriscos (*) para formatação - use hífens (-) para listas\n"
            "8. ESCREVA como se fosse a consulta FINAL, já revisada por um especialista\n"
            "9. SUBSTITUA termos populares por terminologia médica adequada\n"
            "10. O texto pode ser um DIÁLOGO médico-paciente gravado - IDENTIFIQUE e extraia as informações clínicas relevantes\n"
            "11. USE tabelas em formato markdown para apresentar resultados de exames laboratoriais\n"
            "12. SE houver erros na conduta original (doses incorretas, medicamentos contraindicados, etc), CORRIJA-OS silenciosamente na saída\n"
            "13. Use os dados do CONTEXTO DO PACIENTE quando fornecidos (alergias, medicamentos, condições crônicas, histórico)\n"
            "14. CONJUGUE verbos na PRIMEIRA PESSOA DO SINGULAR para AÇÕES DO MÉDICO (ex: 'oriento', 'solicito', 'prescrevo', 'encaminho') - NUNCA use infinitivo ('orientar', 'solicitar') ou voz passiva ('foi orientado'). EXCEÇÃO: posologia de medicamentos é instrução ao paciente, use INFINITIVO (ex: 'tomar 2 comprimidos', 'aplicar 1 vez ao dia') - NUNCA 'tomo', 'aplico' (isso significaria que o médico toma o remédio)\n\n"
            "## Formato de Saída\n"
            "Use estas seções (omita se não houver informação relevante):\n\n"
            "## Queixa Principal\n"
            "> (Use blockquote com > para destacar a queixa em uma frase objetiva)\n\n"
            "## História da Doença Atual\n"
            "**Início:** X dias | **Evolução:** descrição | **Duração:** X\n"
            "**Características:** Narrativa organizada dos sintomas em linguagem médica formal.\n\n"
            "## Revisão de Sistemas\n"
            "(Se mencionada no texto original, use formato estruturado)\n\n"
            "## Antecedentes\n"
            "- **Pessoais:** comorbidades, cirurgias prévias\n"
            "- **Familiares:** histórico relevante\n"
            "- **Medicamentos em uso:** lista\n"
            "- **Alergias:** lista ou 'Nega'\n"
            "- **Hábitos:** tabagismo, etilismo\n\n"
            "## Exame Físico\n"
            "(Achados organizados por sistemas, use **negrito** para destaques)\n\n"
            "## Hipóteses Diagnósticas\n"
            "1. **Diagnóstico principal (CID-10: X00.0)** - justificativa breve\n"
            "2. Diagnóstico diferencial (CID-10: Y00.0)\n\n"
            "## Conduta\n"
            "- **Exames:** lista de exames solicitados\n"
            "- **Prescrições:** medicamentos com doses corretas e seguras\n"
            "- **Orientações:** orientações ao paciente\n"
            "- **Retorno:** prazo para retorno\n\n"
            "---\n"
            "IMPORTANTE: Sua resposta deve começar DIRETAMENTE com o registro clínico organizado, sem qualquer introdução, análise ou menção à tarefa.\n\n"
            "**TEXTO BRUTO DA CONSULTA:**\n"
        )
        prompt_base = PROMPTS.get(specialty, {}).get(consultation_type, default_prompt_instructions)

        # Prepend language instruction and PATIENT_DATA_RULE to all prompts
        # This ensures the model NEVER invents patient information
        if language_prefix:
            system_instruction = f"{language_prefix}{PATIENT_DATA_RULE}{prompt_base}"
        else:
            system_instruction = f"{PATIENT_DATA_RULE}{prompt_base}"
        
        # thinking_config será definido por modelo no loop de retry
        # (gemini-3 usa thinking_level, gemini-2.5 usa thinking_budget)
        config_params = {
            "system_instruction": system_instruction,
            "temperature": 1.0,
        }
        contents = raw_text
        # --- FIM DA CORREÇÃO ---

    else:
        logger.info(f"Usando cache: {cached_content_ref.name}")
        config_params = {
            "cached_content": cached_content_ref.name,
            "temperature": 1.0,
        }
        contents = raw_text

    # Build list of models to try (primary + fallback)
    models_to_try = [Config.PRIMARY_LLM_MODEL]
    if FALLBACK_LLM_MODEL and FALLBACK_LLM_MODEL != Config.PRIMARY_LLM_MODEL:
        models_to_try.append(FALLBACK_LLM_MODEL)
        logger.info(f"[IMPROVE_NOTES] Fallback configurado: primário={Config.PRIMARY_LLM_MODEL}, fallback={FALLBACK_LLM_MODEL}")

    last_error = None
    for model_idx, model_to_use in enumerate(models_to_try):
        is_fallback = model_idx > 0

        # Configura thinking apropriado para este modelo
        thinking_config = _get_thinking_config_for_model(model_to_use)
        config = types.GenerateContentConfig(
            **config_params,
            thinking_config=thinking_config
        )

        # Retry loop with exponential backoff
        for attempt in range(MAX_RETRIES):
            try:
                logger.info(f"[IMPROVE_NOTES] Tentativa {attempt + 1}/{MAX_RETRIES} com modelo: {model_to_use}{' (fallback)' if is_fallback else ''}")

                response = client.models.generate_content(
                    model=f'models/{model_to_use}',
                    contents=_redact_llm_contents(contents),
                    config=config
                )

                usage = response.usage_metadata
                logger.debug(f"Resposta de improve_consultation_notes recebida. Usage: {usage}")

                # Check for None response (safety filters or timeout)
                response_text = response.text
                if response_text is None:
                    logger.warning(f"[IMPROVE_NOTES] LLM retornou response.text = None (tentativa {attempt + 1}, modelo: {model_to_use})")
                    last_error = "response.text = None"
                    # Wait before retry
                    if attempt < MAX_RETRIES - 1:
                        backoff = min(INITIAL_BACKOFF * (2 ** attempt), MAX_BACKOFF)
                        logger.info(f"[IMPROVE_NOTES] Aguardando {backoff}s antes de retry...")
                        time.sleep(backoff)
                    continue

                # Success
                if is_fallback:
                    logger.warning(f"[IMPROVE_NOTES] Sucesso com modelo de fallback: {model_to_use}")
                return response_text.strip(), usage, model_to_use

            except google_exceptions.ResourceExhausted as e:
                logger.warning(f"[IMPROVE_NOTES] Rate limit (tentativa {attempt + 1}, modelo: {model_to_use}): {str(e)}")
                last_error = str(e)
                if attempt < MAX_RETRIES - 1:
                    backoff = min(INITIAL_BACKOFF * (2 ** attempt), MAX_BACKOFF)
                    logger.info(f"[IMPROVE_NOTES] Aguardando {backoff}s antes de retry...")
                    time.sleep(backoff)
                continue

            except Exception as e:
                error_msg = str(e)
                last_error = error_msg

                # Check for 503 (model overloaded) - worth retrying
                if "503" in error_msg or "UNAVAILABLE" in error_msg or "overloaded" in error_msg.lower():
                    logger.warning(f"[IMPROVE_NOTES] Modelo sobrecarregado (tentativa {attempt + 1}, modelo: {model_to_use}): {error_msg}")
                    if attempt < MAX_RETRIES - 1:
                        backoff = min(INITIAL_BACKOFF * (2 ** attempt), MAX_BACKOFF)
                        logger.info(f"[IMPROVE_NOTES] Aguardando {backoff}s antes de retry...")
                        time.sleep(backoff)
                    continue

                # Other errors - log and try fallback
                logger.error(f"[IMPROVE_NOTES] Erro (modelo: {model_to_use}): {error_msg}", exc_info=True)
                break  # Exit retry loop, try fallback

        # If we get here, all retries for this model failed
        logger.warning(f"[IMPROVE_NOTES] Todas as tentativas falharam para modelo: {model_to_use}")

    # All models failed
    logger.error(f"[IMPROVE_NOTES] Todos os modelos falharam. Último erro: {last_error}")
    return "Erro: Não foi possível processar a consulta. O serviço de IA está temporariamente indisponível. Tente novamente.", None, None


def generate_case_summary(improved_text: str, language_code: str = 'pt-BR') -> tuple:
    """
    Gera um resumo do caso clínico.

    Returns:
        tuple: (summary_text, usage_metadata, model_name) ou (error_message, None, None) em caso de erro
    """
    logger.info(f"Iniciando generate_case_summary, language_code={language_code}")
    if not improved_text or not isinstance(improved_text, str) or not improved_text.strip():
        logger.error(f"Texto aprimorado inválido ou ausente para resumo.")
        return "Erro: Conteúdo ausente ou inválido para gerar resumo.", None, None
    if len(improved_text.strip()) < 50:
        logger.warning(f"Texto aprimorado muito curto para gerar resumo significativo. Comprimento: {len(improved_text.strip())}")
        return "Erro: Conteúdo fornecido é muito curto para gerar um resumo clínico útil.", None, None

    language_instruction = f"Responda na seguinte língua: {language_code}."

    prompt_summary = (
        f"**PERSONA:** Você é um médico experiente e conciso, com habilidade para sintetizar informações complexas. Sua especialidade é criar resumos de caso claros e eficientes para prontuários eletrônicos e passagens de plantão ou encaminhamentos. {language_instruction}\n"
        "**TAREFA:** Elabore um resumo clinicamente denso e informativo do caso apresentado nas 'Anotações Médicas Aprimoradas' abaixo. O resumo deve ser escrito em **parágrafo único ou, no máximo, dois parágrafos curtos de texto corrido**. O objetivo é que um colega médico possa rapidamente entender a essência do caso.\n"
        "**ESTILO E TOM:** Linguagem médica formal, precisa, objetiva e direta. Utilize voz ativa preferencialmente. Use abreviações médicas consagradas e de conhecimento universal (ex: HAS, DM, IAM, DPOC), mas evite abreviações raras ou ambíguas.\n\n"
        "**CONTEÚDO ESSENCIAL A SER INCLUÍDO (se a informação estiver disponível nas anotações):**\n"
        "1.  **Identificação do Paciente:** Idade e sexo (ex: Paciente masculino, 45 anos...). Se houver iniciais ou nome fictício nas anotações, pode incluí-los (ex: Paciente J.S., ...).\n"
        "2.  **Queixa Principal (QP) e Duração Concisa:** O motivo central da consulta e há quanto tempo o problema principal persiste.\n"
        "3.  **História da Doença Atual (HDA) Sintetizada:** Destaque os sintomas mais importantes, a cronologia da evolução, fatores de melhora/piora e tratamentos prévios relevantes. Seja breve e foque no que é crucial para o entendimento do quadro atual.\n"
        "4.  **Antecedentes Pessoais Mais Relevantes:** Apenas as comorbidades, cirurgias prévias ou alergias que tenham impacto direto no diagnóstico ou manejo do caso atual.\n"
        "5.  **Achados Significativos no Exame Físico e Exames Complementares:** Mencione apenas os achados (físicos, laboratoriais, de imagem) que são fundamentais para o raciocínio diagnóstico e para a conduta adotada. Evite listar todos os exames normais, a menos que a normalidade de um exame específico seja crucial (ex: 'ECG sem alterações isquêmicas agudas').\n"
        "6.  **Hipótese(s) Diagnóstica(s) Principal(is):** O(s) diagnóstico(s) mais provável(is) ou já confirmados.\n"
        "7.  **Plano Terapêutico e de Seguimento Resumido:** As principais intervenções realizadas ou planejadas (medicamentos chave, procedimentos) e os próximos passos para o acompanhamento do paciente.\n\n"
        "**INSTRUÇÕES ADICIONAIS IMPORTANTES:**\n"
        "-   **NÃO FAÇA PERGUNTAS AO USUÁRIO OU A SI MESMO NO RESUMO.**\n"
        "-   **NÃO REPITA ESTAS INSTRUÇÕES NA SUA RESPOSTA.**\n"
        "-   **FOCO NA SÍNTESE EFICIENTE:** O objetivo não é reescrever o prontuário, mas extrair a essência de forma coesa e informativa.\n"
        "-   **OMITIR SE AUSENTE:** Se alguma das seções de 'Conteúdo Essencial' não estiver presente ou não for relevante nas anotações, simplesmente omita-a do resumo, sem mencioná-la.\n\n"
        "**ANOTAÇÕES MÉDICAS APRIMORADAS PARA RESUMIR:**\n"
        "--------------------------------------------------\n"
        f"{improved_text}\n"
        "--------------------------------------------------\n\n"
        "**RESUMO DO CASO (EM TEXTO CORRIDO):**\n"
    )
    logger.debug(f"Prompt de resumo (primeiros 500 chars): {prompt_summary[:500]}...")

    # Build list of models to try (primary + fallback)
    models_to_try = [Config.PRIMARY_LLM_MODEL]
    if FALLBACK_LLM_MODEL and FALLBACK_LLM_MODEL != Config.PRIMARY_LLM_MODEL:
        models_to_try.append(FALLBACK_LLM_MODEL)
        logger.info(f"[SUMMARY] Fallback configurado: primário={Config.PRIMARY_LLM_MODEL}, fallback={FALLBACK_LLM_MODEL}")

    config = types.GenerateContentConfig(
        temperature=0.3,
        max_output_tokens=DEFAULT_MAX_TOKENS_SUMMARY
    )

    last_error = None
    for model_idx, model_to_use in enumerate(models_to_try):
        is_fallback = model_idx > 0

        # Retry loop with exponential backoff
        for attempt in range(MAX_RETRIES):
            try:
                logger.info(f"[SUMMARY] Tentativa {attempt + 1}/{MAX_RETRIES} com modelo: {model_to_use}{' (fallback)' if is_fallback else ''}")

                response = client.models.generate_content(
                    model=f'models/{model_to_use}',
                    contents=_redact_llm_contents(prompt_summary),
                    config=config
                )

                # Check for None response (safety filters or timeout)
                summary = response.text
                if summary is None:
                    logger.warning(f"[SUMMARY] LLM retornou response.text = None (tentativa {attempt + 1}, modelo: {model_to_use})")
                    last_error = "response.text = None"
                    if attempt < MAX_RETRIES - 1:
                        backoff = min(INITIAL_BACKOFF * (2 ** attempt), MAX_BACKOFF)
                        logger.info(f"[SUMMARY] Aguardando {backoff}s antes de retry...")
                        time.sleep(backoff)
                    continue

                # Success
                usage = response.usage_metadata
                if is_fallback:
                    logger.warning(f"[SUMMARY] Sucesso com modelo de fallback: {model_to_use}")
                logger.debug(f"Resumo gerado (primeiros 500 chars): {summary[:500]}... Usage: {usage}")
                return summary, usage, model_to_use

            except google_exceptions.ResourceExhausted as e:
                logger.warning(f"[SUMMARY] Rate limit (tentativa {attempt + 1}, modelo: {model_to_use}): {str(e)}")
                last_error = str(e)
                if attempt < MAX_RETRIES - 1:
                    backoff = min(INITIAL_BACKOFF * (2 ** attempt), MAX_BACKOFF)
                    logger.info(f"[SUMMARY] Aguardando {backoff}s antes de retry...")
                    time.sleep(backoff)
                continue

            except Exception as e:
                error_msg = str(e)
                last_error = error_msg

                # Check for 503 (model overloaded) - worth retrying
                if "503" in error_msg or "UNAVAILABLE" in error_msg or "overloaded" in error_msg.lower():
                    logger.warning(f"[SUMMARY] Modelo sobrecarregado (tentativa {attempt + 1}, modelo: {model_to_use}): {error_msg}")
                    if attempt < MAX_RETRIES - 1:
                        backoff = min(INITIAL_BACKOFF * (2 ** attempt), MAX_BACKOFF)
                        logger.info(f"[SUMMARY] Aguardando {backoff}s antes de retry...")
                        time.sleep(backoff)
                    continue

                # Other errors - log and try fallback
                logger.error(f"[SUMMARY] Erro (modelo: {model_to_use}): {error_msg}", exc_info=True)
                break  # Exit retry loop, try fallback

        # If we get here, all retries for this model failed
        logger.warning(f"[SUMMARY] Todas as tentativas falharam para modelo: {model_to_use}")

    # All models failed
    logger.error(f"[SUMMARY] Todos os modelos falharam. Último erro: {last_error}")
    return "Erro: Não foi possível gerar o resumo. O serviço de IA está temporariamente indisponível. Tente novamente.", None, None


def extract_icd10_from_notes(clinical_notes: str, specialty: str = "", language_code: str = 'pt-BR') -> list:
    """
    Extract relevant ICD-10 codes from clinical notes using LLM.
    Returns a list of dicts with 'code', 'description', and 'confidence'.
    """
    logger.info(f"Iniciando extract_icd10_from_notes, specialty={specialty}, language_code={language_code}")

    if not clinical_notes or len(clinical_notes.strip()) < 50:
        logger.warning("Notas clínicas muito curtas para extração de CID-10")
        return []

    # Language-specific instructions
    output_instructions = {
        'pt-BR': "Responda em português brasileiro.",
        'pt': "Responda em português.",
        'en': "Respond in English.",
        'en-US': "Respond in English (US).",
        'es': "Responda en español.",
        'es-ES': "Responda en español."
    }
    lang_instruction = output_instructions.get(language_code, output_instructions['pt-BR'])

    # JSON Schema for structured output
    icd10_schema = {
        "type": "array",
        "description": "Array of ICD-10 codes extracted from clinical notes",
        "items": {
            "type": "object",
            "properties": {
                "code": {
                    "type": "string",
                    "description": "ICD-10 code (e.g., I10, E11.9)"
                },
                "description": {
                    "type": "string",
                    "description": "Description of the diagnosis"
                },
                "confidence": {
                    "type": "string",
                    "description": "Confidence level: alta, média, or baixa"
                }
            },
            "required": ["code", "description", "confidence"]
        }
    }

    prompt = f"""Analise as notas clínicas abaixo e extraia os códigos CID-10 mais relevantes.

INSTRUÇÕES:
1. Identifique até 3 diagnósticos mais prováveis
2. Para cada diagnóstico, forneça o código CID-10 correto e a descrição
3. Ordene por relevância/probabilidade (mais provável primeiro)
4. {lang_instruction}
5. Se não for possível determinar diagnósticos, retorne um array vazio []

NOTAS CLÍNICAS:
{clinical_notes}

ESPECIALIDADE: {specialty if specialty else "Clínica Geral"}"""

    try:
        model_to_use = Config.SIMPLE_TASK_LLM_MODEL  # Usar modelo mais leve para esta tarefa
        response = client.models.generate_content(
            model=f'models/{model_to_use}',
            contents=_redact_llm_contents(prompt),
            config=types.GenerateContentConfig(
                temperature=0.1,  # Very low temperature for structured output
                max_output_tokens=500,
                response_mime_type="application/json",
                response_schema=icd10_schema
            )
        )

        # Proteção contra response.text None
        if response.text is None:
            logger.warning("LLM retornou response.text = None em extract_icd10_from_notes")
            return []

        response_text = response.text.strip()
        logger.debug(f"Resposta bruta de extract_icd10 (structured): {response_text}")

        # Parse JSON with repair capability (as fallback, but should be valid with response_mime_type)
        icd_codes, parse_success, parse_error = try_parse_json_with_repair(
            response_text,
            context="[CID-10]"
        )

        if not parse_success:
            logger.warning(f"Falha ao parsear JSON de CID-10: {parse_error}")
            return []

        if isinstance(icd_codes, list):
            # Validar estrutura
            validated = []
            for item in icd_codes:
                if isinstance(item, dict) and 'code' in item and 'description' in item:
                    validated.append({
                        'code': item.get('code', '').upper(),
                        'description': item.get('description', ''),
                        'confidence': item.get('confidence', 'média')
                    })
            logger.info(f"CID-10 extraídos com sucesso: {len(validated)} códigos")
            return validated

        return []
    except Exception as e:
        logger.error(f"Erro em extract_icd10_from_notes: {str(e)}", exc_info=True)
        return []


def extract_patient_updates(
    consultation_notes: str,
    summary: str,
    current_patient_info: dict,
    language_code: str = 'pt-BR'
) -> dict | None:
    """
    Extract patient info updates from consultation notes using LLM.
    Compares notes against current patient data and detects explicit changes
    (new medications, suspended medications, new allergies, new diagnoses, etc.)
    Returns a dict with has_changes, medications, chronic_conditions, allergies, demographics, reasoning.
    """
    logger.info(f"Iniciando extract_patient_updates, language_code={language_code}")

    combined_text = f"{consultation_notes or ''}\n\n{summary or ''}".strip()
    if not combined_text or len(combined_text) < 30:
        logger.warning("Notas clínicas muito curtas para extração de atualizações do paciente")
        return {"has_changes": False, "medications": {"add": [], "remove": [], "modify": []},
                "chronic_conditions": {"add": [], "remove": []}, "allergies": {"add": [], "remove": []},
                "demographics": {}, "reasoning": {}}

    output_instructions = {
        'pt-BR': "Responda em português brasileiro.",
        'pt': "Responda em português.",
        'en': "Respond in English.",
        'en-US': "Respond in English (US).",
        'es': "Responda en español.",
        'es-ES': "Responda en español."
    }
    lang_instruction = output_instructions.get(language_code, output_instructions['pt-BR'])

    patient_updates_schema = {
        "type": "object",
        "properties": {
            "has_changes": {"type": "boolean"},
            "medications": {
                "type": "object",
                "properties": {
                    "add": {"type": "array", "items": {"type": "string"}},
                    "remove": {"type": "array", "items": {"type": "string"}},
                    "modify": {"type": "array", "items": {
                        "type": "object",
                        "properties": {"from": {"type": "string"}, "to": {"type": "string"}},
                        "required": ["from", "to"]
                    }}
                },
                "required": ["add", "remove", "modify"]
            },
            "chronic_conditions": {
                "type": "object",
                "properties": {
                    "add": {"type": "array", "items": {"type": "string"}},
                    "remove": {"type": "array", "items": {"type": "string"}}
                },
                "required": ["add", "remove"]
            },
            "allergies": {
                "type": "object",
                "properties": {
                    "add": {"type": "array", "items": {"type": "string"}},
                    "remove": {"type": "array", "items": {"type": "string"}}
                },
                "required": ["add", "remove"]
            },
            "demographics": {
                "type": "object",
                "properties": {
                    "phone": {"type": "string"},
                    "email": {"type": "string"},
                    "address": {"type": "string"}
                }
            },
            "reasoning": {
                "type": "object",
                "description": "key=item changed, value=reason extracted from notes"
            }
        },
        "required": ["has_changes", "medications", "chronic_conditions", "allergies", "demographics", "reasoning"]
    }

    current_meds = current_patient_info.get('current_medications') or []
    current_conditions = current_patient_info.get('chronic_conditions') or []
    current_allergies = current_patient_info.get('allergies') or []
    current_phone = current_patient_info.get('phone') or ''
    current_email = current_patient_info.get('email') or ''
    current_address = current_patient_info.get('address') or ''

    prompt = f"""Analise as notas clínicas abaixo e compare com o cadastro atual do paciente.
Identifique APENAS mudanças EXPLICITAMENTE mencionadas nas notas. NÃO invente mudanças não mencionadas.

CADASTRO ATUAL DO PACIENTE:
- Medicamentos em uso: {', '.join(current_meds) if current_meds else 'Nenhum registrado'}
- Condições crônicas: {', '.join(current_conditions) if current_conditions else 'Nenhuma registrada'}
- Alergias: {', '.join(current_allergies) if current_allergies else 'Nenhuma registrada'}
- Telefone: {current_phone or 'Não informado'}
- Email: {current_email or 'Não informado'}
- Endereço: {current_address or 'Não informado'}

NOTAS DA CONSULTA:
{combined_text}

INSTRUÇÕES:
1. Detecte suspensão/adição/modificação de medicamentos (ex: "suspendo Losartana", "inicio Amoxicilina 500mg")
2. Detecte novos diagnósticos ou condições resolvidas (ex: "novo diagnóstico: ICC NYHA II", "alta de acompanhamento para diabetes")
3. Detecte novas alergias relatadas (ex: "paciente relata alergia a Dipirona")
4. Detecte dados demográficos mencionados (ex: "novo telefone: 11-99999-8888")
5. Para REMOÇÕES, use o valor EXATO como está no cadastro atual (para facilitar match)
6. Use terminologia médica padronizada para adições (ex: "Hipertensão Arterial Sistêmica" em vez de "pressão alta")
7. Se não houver mudanças, retorne has_changes=false com arrays vazios
8. No campo reasoning, explique brevemente por que cada mudança foi detectada, citando o trecho relevante das notas
9. {lang_instruction}"""

    try:
        model_to_use = Config.SIMPLE_TASK_LLM_MODEL
        response = client.models.generate_content(
            model=f'models/{model_to_use}',
            contents=_redact_llm_contents(prompt),
            config=types.GenerateContentConfig(
                temperature=0.1,
                max_output_tokens=1000,
                response_mime_type="application/json",
                response_schema=patient_updates_schema
            )
        )

        if response.text is None:
            logger.warning("LLM retornou response.text = None em extract_patient_updates")
            return None

        response_text = response.text.strip()
        logger.debug(f"Resposta bruta de extract_patient_updates (structured): {response_text}")

        result, parse_success, parse_error = try_parse_json_with_repair(
            response_text,
            context="[PatientUpdates]"
        )

        if not parse_success:
            logger.warning(f"Falha ao parsear JSON de patient updates: {parse_error}")
            return None

        if isinstance(result, dict):
            logger.info(f"Patient updates extraídos com sucesso: has_changes={result.get('has_changes')}")
            return result

        return None
    except Exception as e:
        logger.error(f"Erro em extract_patient_updates: {str(e)}", exc_info=True)
        return None


# NOTE: is_health_related_genai() removido (2026-05). Ele alimentava o gate de
# tópico "só medicina", descontinuado nesta mesma passada — a relevância agora é
# tratada de forma permissiva pelo system prompt (seção ESCOPO E CONTEXTO).
# Ficou sem uso após a remoção do gate, então foi excluído.


def _get_thinking_config_for_model(model_name: str, level: str = 'high') -> types.ThinkingConfig:
    """
    Retorna a configuração de thinking apropriada para o modelo, na intensidade pedida.
    Gemini 3.x (3 Flash, 3.1 Flash-Lite, etc): usa thinking_level (MINIMAL/LOW/MEDIUM/HIGH)
    Gemini 2.x (2.5 Flash, 2.5 Flash-Lite, etc): usa thinking_budget (número de tokens; 0 = off)

    level='high'     → raciocínio máximo (chat clínico, tarefas complexas).
    level='minimal'  → praticamente sem thinking (tarefas triviais: título, classificação curta).
                       Evita que o orçamento de saída seja consumido pelo raciocínio (sintoma:
                       max_output_tokens pequeno + thinking dinâmico = response.text=None) e
                       poupa a cota free.
    """
    is_gemini_3 = 'gemini-3' in model_name.lower()

    if level == 'minimal':
        if is_gemini_3:
            return types.ThinkingConfig(thinking_level=types.ThinkingLevel.MINIMAL)
        return types.ThinkingConfig(thinking_budget=0)
    if level == 'low':
        if is_gemini_3:
            return types.ThinkingConfig(thinking_level=types.ThinkingLevel.LOW)
        return types.ThinkingConfig(thinking_budget=2048)
    if level == 'medium':
        if is_gemini_3:
            return types.ThinkingConfig(thinking_level=types.ThinkingLevel.MEDIUM)
        return types.ThinkingConfig(thinking_budget=8192)

    if is_gemini_3:
        # Todos os modelos Gemini 3.x (3 Flash, 3.1 Flash-Lite, etc): thinking_level=HIGH
        logger.info(f"[THINKING] {model_name}: thinking_level=HIGH")
        return types.ThinkingConfig(thinking_level=types.ThinkingLevel.HIGH)
    else:
        logger.info(f"[THINKING] {model_name}: thinking_budget=24576")
        return types.ThinkingConfig(thinking_budget=24576)


# Stopwords genéricas p/ o fallback de inline por conteúdo: termos clínicos comuns demais p/
# distinguir uma referência. Mantém termos ESPECÍFICOS (doença/fármaco/órgão/achado) como sinal.
_INLINE_STOP = {
    'about', 'above', 'after', 'against', 'among', 'because', 'before', 'being', 'between',
    'during', 'their', 'there', 'these', 'those', 'through', 'under', 'until', 'while', 'which',
    'patient', 'patients', 'clinical', 'study', 'studies', 'review', 'treatment', 'management',
    'diagnosis', 'disease', 'diseases', 'syndrome', 'effect', 'effects', 'therapy', 'therapies',
    'guideline', 'guidelines', 'versus', 'associated', 'using', 'based', 'randomized',
    'controlled', 'trial', 'analysis', 'practice', 'update', 'recommendations', 'adults', 'adult',
    'paciente', 'pacientes', 'clinico', 'clinica', 'estudo', 'tratamento', 'manejo', 'doenca',
    'diretriz', 'diretrizes', 'terapia', 'diagnostico', 'conduta', 'sindrome',
    'brasileira', 'brasileiro', 'sociedade', 'consenso', 'posicionamento', 'sobre',
}


def _deaccent(s: str) -> str:
    """Remove acentos (NFKD → ASCII) p/ casar termos apesar de variação de acento no PT
    (ex.: título 'fibrilação' casa o corpo 'fibrilacao')."""
    import unicodedata
    return unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode('ascii')


def _content_keywords(title: str) -> set:
    """Termos distintivos (>=5 letras, fora de stopwords genéricas) de um título, SEM acento."""
    out = set()
    for w in re.findall(r'[a-zà-ÿ]{5,}', (title or '').lower()):
        d = _deaccent(w)
        if d not in _INLINE_STOP:
            out.add(d)
    return out


def _sentence_end_positions(text: str) -> list:
    """(start, end) de cada frase (split por .!? seguido de espaço/fim). end = índice após a pontuação."""
    spans, start = [], 0
    for m in re.finditer(r'[.!?](?=\s|$)', text):
        end = m.start() + 1
        if end - start > 25:
            spans.append((start, end))
        start = m.end()
    if len(text) - start > 25:
        spans.append((start, len(text)))
    return spans


# Fecha-aspas/parênteses opcionais + terminador de frase, logo após o ponto de inserção.
_TRAILING_SENTENCE_END_RE = re.compile(r'^[)\]}»"\'’”]*[.!?…]+["\'’”]?')


def _slide_past_sentence_end(text: str, idx: int) -> int:
    """Empurra o ponto de inserção do marcador para DEPOIS da pontuação final da frase.

    O support do grounding termina no fim da frase mas ANTES do ponto, então inserir no
    offset cru deixava o ponto órfão depois do badge ("…ao longo do tempo [1][2] .") — e,
    quando a linha quebrava ali, o ponto ia sozinho para a linha seguinte. A citação
    pertence ao fim da frase, não ao meio dela."""
    m = _TRAILING_SENTENCE_END_RE.match(text[idx:idx + 12])
    return idx + m.end() if m else idx


def _insert_inline_citations(text: str, supports: list, grounding_sources: list, unified_sources: list) -> str:
    """Insere marcadores [n] inline (estilo artigo), onde n é o número da referência JÁ
    RERANQUEADA (bate com a lista no fim). Dois passos:
      1. GROUNDING (preciso): casa o trecho do support por CONTEÚDO (support['text']) e mapeia
         chunk→ref pela URI — é o próprio mapeamento do modelo. Robusto a acento PT.
      2. CONTEÚDO (fallback): p/ refs SEM support (Tier1/2/4, ou support não-casado), casa o
         TÍTULO da ref à frase de maior sobreposição de termos distintivos. Conservador (>=2
         termos + >=1 específico) — senão não marca (a lista no fim cobre)."""
    if not text or not unified_sources:
        return text
    try:
        from collections import defaultdict
        uri_to_refnum = {}
        for n, ref in enumerate(unified_sources, start=1):
            u = (ref.get('uri') or ref.get('url') or '').strip().lower()
            if u and u not in uri_to_refnum:
                uri_to_refnum[u] = n

        placements = defaultdict(set)  # posição(fim) → {refnums}

        # --- Passo 1: grounding supports (mapeamento preciso do modelo) ---
        if supports:
            chunk_to_refnum = {}
            for i, gs in enumerate(grounding_sources or []):
                u = (gs.get('uri') or gs.get('url') or '').strip().lower()
                if u in uri_to_refnum:
                    chunk_to_refnum[i] = uri_to_refnum[u]
            for sup in supports:
                seg = (sup.get('text') or '').strip()
                if not seg:
                    continue
                refnums = {chunk_to_refnum[ci] for ci in (sup.get('chunk_indices') or []) if ci in chunk_to_refnum}
                if not refnums:
                    continue
                start = text.find(seg)
                if start == -1:
                    continue
                placements[_slide_past_sentence_end(text, start + len(seg))] |= refnums

        marked = set().union(*placements.values()) if placements else set()

        # --- Passo 2: fallback por conteúdo p/ refs ainda sem marcador (ex.: Tier4 não-grounding) ---
        unmarked = [(n, ref) for n, ref in enumerate(unified_sources, start=1) if n not in marked]
        if unmarked:
            sent_spans = _sentence_end_positions(text)
            for n, ref in unmarked:
                kws = _content_keywords(ref.get('title', ''))
                if len(kws) < 2:
                    continue
                best_end, best_matched = None, set()
                for s, e in sent_spans:
                    seg = _deaccent(text[s:e].lower())
                    matched = {k for k in kws if k in seg}
                    if len(matched) > len(best_matched):
                        best_matched, best_end = matched, e
                # exige >=2 termos distintivos do título na frase, sendo >=1 específico (>=7 letras)
                if best_end is not None and len(best_matched) >= 2 and any(len(k) >= 7 for k in best_matched):
                    placements[_slide_past_sentence_end(text, best_end)].add(n)

        if not placements:
            return text

        # Insere de trás p/ frente (não desloca offsets). Máx. 2 marcadores/posição (maior autoridade).
        for end in sorted(placements.keys(), reverse=True):
            if text[end:end + 1] == '[':  # já marcado nesse ponto
                continue
            refnums = sorted(placements[end])
            if len(refnums) > 2:
                refnums = sorted(sorted(refnums, key=lambda x: unified_sources[x - 1].get('authority', 0), reverse=True)[:2])
            marker = ''.join(f'[{x}]' for x in refnums)
            text = text[:end] + ' ' + marker + text[end:]
        return text
    except Exception as e:
        logger.warning(f"[INLINE_CITE] falhou (ignorando marcadores): {e}")
        return text


async def _call_llm_with_retry(
    model_name: str,
    full_contents: list,
    generation_config: types.GenerateContentConfig,
    max_retries: int = MAX_RETRIES,
    initial_backoff: float = INITIAL_BACKOFF
) -> tuple:
    """
    Tenta chamar o LLM com retry e backoff exponencial.

    Returns:
        tuple: (response, error) - Se sucesso, error é None. Se falha, response é None.
    """
    last_error = None

    for attempt in range(max_retries):
        try:
            logger.info(f"[LLM_CALL] Tentativa {attempt + 1}/{max_retries} com modelo {model_name}")

            response = client.models.generate_content(
                model=f'models/{model_name}',
                contents=_redact_llm_contents(full_contents),
                config=generation_config
            )

            # Verifica se a resposta tem texto válido
            if response.text is None:
                # Log detalhado para debug
                logger.warning(f"[LLM_CALL] response.text = None na tentativa {attempt + 1}")
                if response.candidates:
                    for i, candidate in enumerate(response.candidates):
                        finish_reason = getattr(candidate, 'finish_reason', 'N/A')
                        logger.warning(f"[LLM_CALL] Candidate {i}: finish_reason={finish_reason}")
                        # Se foi bloqueado por safety, não adianta retry
                        if str(finish_reason) in ['SAFETY', 'BLOCKED']:
                            logger.warning(f"[LLM_CALL] Resposta bloqueada por safety filter")
                            return None, Exception("Resposta bloqueada por filtro de segurança")

                # Trata como erro recuperável para tentar novamente
                raise Exception("response.text is None - possível timeout ou erro transiente")

            # Sucesso!
            logger.info(f"[LLM_CALL] Sucesso com {model_name} na tentativa {attempt + 1}")
            return response, None

        except Exception as e:
            last_error = e
            error_str = str(e).lower()

            # Erros não recuperáveis - não adianta retry
            if any(err in error_str for err in ['invalid_argument', 'permission_denied', 'not_found']):
                logger.error(f"[LLM_CALL] Erro não recuperável com {model_name}: {e}")
                return None, e

            # Erros recuperáveis - aplica backoff e tenta novamente
            if attempt < max_retries - 1:
                backoff_time = min(initial_backoff * (2 ** attempt), MAX_BACKOFF)
                logger.warning(f"[LLM_CALL] Erro recuperável na tentativa {attempt + 1}: {e}. Aguardando {backoff_time}s...")
                await asyncio.sleep(backoff_time)
            else:
                logger.error(f"[LLM_CALL] Esgotadas {max_retries} tentativas com {model_name}: {e}")

    return None, last_error


def _strip_thinking_leak(text: str) -> str:
    """Remove vazamento do formato interno de thinking/tool-use do Gemini que às vezes cai no
    TEXTO da resposta (geração DEGRADADA — free/preview sob 429 — em que o modelo "narra" o
    próprio monólogo em vez de mantê-lo nas partes `thought`/`executable_code`). Sintoma:
    `tool_code print(google_search.search(queries=[...]))` + `thought <raciocínio em inglês>`
    antes da resposta real — expõe a arquitetura de busca e suja o texto.

    SÓ age quando há marcador inequívoco (`tool_code`/`google_search.search`/`print(default_api`)
    — resposta clínica normal NUNCA contém isso, então zero risco de mexer em conteúdo legítimo
    (incl. respostas que comecem com a palavra "thought", ex.: "Thought disorders...")."""
    if not text:
        return text
    low = text.lower()
    if 'tool_code' not in low and 'google_search.search' not in low and 'print(default_api' not in low:
        return text  # resposta normal — não toca

    # 1. Blocos de tool-code (fenced ```tool_code``` ou inline) + chamadas print(google_search…)
    text = re.sub(r'```+\s*tool_code.*?```+', ' ', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'print\(\s*(?:google_search|default_api)[^\n]*?\)\s*\)', ' ', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'\btool_code\b', ' ', text, flags=re.IGNORECASE)

    # 2. Cadeia de raciocínio vazada (introduzida por 'thought'): corta do início até a junção
    #    fim-do-thought/início-da-resposta — "...sources.O esquema" (ponto seguido de MAIÚSCULA
    #    sem espaço = artefato da concatenação thinking+resposta). Só no começo, uma vez.
    text = re.sub(r'^\s*thought\b.*?[.!?](?=[A-ZÀ-Ý])', '', text, count=1, flags=re.DOTALL | re.IGNORECASE)
    # fallback: se sobrou só o marcador 'thought' no início (sem a junção .X), remove-o
    text = re.sub(r'^\s*thought\b[:\s]*', '', text, count=1, flags=re.IGNORECASE)

    return text.strip()


async def chat_with_google_ai(message: str, history: List[Dict] = None, context_truncated: bool = False, include_clinical_reasoning: bool = False, language_code: str = 'pt-BR', file_content_context: str = None, image_data_list: list = None, library_id: int = None, db: AsyncSession = None, skip_topic_check: bool = False, user_id: int = None) -> str:
    logger.info(f"Iniciando chat_with_google_ai. History items: {len(history) if history else 0}. Truncated: {context_truncated}. Reasoning: {include_clinical_reasoning}, Lang: {language_code}, File Context: {bool(file_content_context)}, Images: {len(image_data_list) if image_data_list else 0}, Library ID: {library_id}")

    if not message and not file_content_context and not image_data_list:
        logger.warning("Mensagem, contexto de arquivo e imagem vazios em chat_with_google_ai.")
        return "Por favor, forneça uma pergunta ou anexe um arquivo/imagem para que eu possa ajudar."
    
    # Topic gating removed (2026-05): the medicine-only restriction is now
    # handled (permissively) by the system prompt's ESCOPO section instead of a
    # pre-LLM classifier. The model judges relevance in context, which avoids
    # false rejections on medicine-adjacent topics and saves a Gemini call per
    # message. `skip_topic_check` is kept in the signature for compatibility.

    # Imagem médica → modelo de visão (3.5-flash); texto → CHAT_LLM_MODEL (barato, alto volume).
    model_name = Config.MEDICAL_IMAGE_ANALYST_MODEL if image_data_list else Config.CHAT_LLM_MODEL
    
    # 1. Prepara o histórico da conversa
    full_contents = []
    if history:
        for msg in history:
            role = 'user' if msg['sender'] == 'user' else 'model'
            full_contents.append({'role': role, 'parts': [{'text': msg['content']}]})
    
    # 2. Injeta o contexto da biblioteca a partir dos DERIVADOS já indexados no ChromaDB
    # (texto extraído/transcrição + descrições de imagem) — NÃO relê os originais do disco.
    # Antes lia cada arquivo a CADA mensagem (re-OCR/re-transcrição por turno; degradaria
    # silenciosamente em docs Drive-only, cujo original não vive mais no servidor). O texto
    # no Chroma é a fonte canônica e já agrupa por documento.
    library_context_string = ""
    if library_id and db:
        result = await db.execute(select(AcademicLibrary).filter(AcademicLibrary.id == library_id))
        library = result.scalars().first()
        if library:
            logger.info(f"Enriquecendo prompt com a biblioteca: '{library.name}'")
            library_text = await asyncio.to_thread(vector_db_service.get_all_text_for_library, library_id)
            if library_text and library_text.strip():
                library_context_string = (
                    f"Use o seguinte conteúdo da biblioteca '{library.name}' como base principal para sua resposta. "
                    f"Analise-o cuidadosamente antes de responder à pergunta do usuário.\n\n"
                    f"<CONTEXTO_DA_BIBLIOTECA>\n{library_text}\n</CONTEXTO_DA_BIBLIOTECA>\n\n"
                )

    # 3. Prepara a mensagem atual do usuário (que pode ser multimodal)
    current_user_message_parts = []
    # Adiciona o contexto da biblioteca no início da mensagem do usuário
    if library_context_string:
        current_user_message_parts.append(types.Part(text=library_context_string))
    # Adiciona o conteúdo do arquivo de texto/documento anexado
    # O contexto já vem formatado com tags <DOCUMENTO_N> e instruções do copilot_routes
    if file_content_context:
        current_user_message_parts.append(types.Part(text=file_content_context))
    if message:
        current_user_message_parts.append(types.Part(text=message))
    if image_data_list:
        for img_data in image_data_list:
            image_part = types.Part(inline_data=types.Blob(
                mime_type=img_data['mime_type'], data=img_data['bytes']
            ))
            current_user_message_parts.append(image_part)

    # 4. Adiciona a mensagem atual do usuário ao histórico
    full_contents.append({'role': 'user', 'parts': current_user_message_parts})

    # 5. Define o prompt de sistema a ser usado com base na escolha do usuário
    # USA current_prompts PARA SUPORTAR EDIÇÃO DINÂMICA VIA ADMIN PANEL
    system_prompt_text = current_prompts["clinical_reasoning"] if include_clinical_reasoning else current_prompts["neuralweb_chat"]

    # 5.1 Injetar instrução de idioma no prompt do sistema
    # Isto garante que a resposta seja no idioma da UI do usuário
    language_instructions = {
        'en': "\n\n**LANGUAGE INSTRUCTION:** You MUST respond in English. All your responses should be in English, regardless of the language of the system prompt above.",
        'es': "\n\n**INSTRUCCIÓN DE IDIOMA:** DEBES responder en español. Todas tus respuestas deben ser en español, independientemente del idioma del prompt del sistema anterior.",
        'pt': "\n\n**INSTRUÇÃO DE IDIOMA:** Responda em português brasileiro.",
        'pt-BR': "\n\n**INSTRUÇÃO DE IDIOMA:** Responda em português brasileiro."
    }
    # Pega a instrução de idioma apropriada (fallback para pt se não encontrar)
    lang_instruction = language_instructions.get(language_code, language_instructions.get('pt'))
    system_prompt_text = system_prompt_text + lang_instruction
    logger.info(f"[LANGUAGE] Instrução de idioma adicionada: {language_code}")

    # (b) Nudge de EMBASAMENTO: o lite grounseia menos → poucas referências. Encoraja busca +
    # citação p/ afirmações FACTUAIS (dose/ajuste/conduta/critério/escore/diretriz), preservando
    # o reconhecimento de tipo (conversa/planejamento NÃO força busca). Só com grounding ligado.
    if Config.ENABLE_GROUNDING:
        grounding_nudges = {
            'en': "\n\n**SOURCING:** For factual, verifiable clinical claims — drug doses/adjustments, management, diagnostic criteria, scores, guidelines — use web search to confirm and ground your answer, preferring authoritative sources (drug labels, guidelines, societies, indexed literature). For conversation, planning, or opinion, do NOT force a search. Never fabricate a reference.",
            'es': "\n\n**FUNDAMENTACIÓN:** Para afirmaciones clínicas factuales y verificables — dosis/ajustes, conducta, criterios diagnósticos, escalas, guías — usa la búsqueda web para confirmar y fundamentar, priorizando fuentes autorizadas (prospecto, guías, sociedades, literatura indexada). En conversación, planificación u opinión, NO fuerces la búsqueda. Nunca inventes una referencia.",
            'pt': "\n\n**EMBASAMENTO:** Para afirmações clínicas factuais e verificáveis — doses/ajustes, condutas, critérios diagnósticos, escores, diretrizes — pesquise na web para confirmar e fundamentar a resposta, priorizando fontes oficiais (bula, diretriz, sociedade, literatura indexada). Em conversa, planejamento ou opinião, NÃO force busca. Nunca invente referência.",
        }
        system_prompt_text = system_prompt_text + grounding_nudges.get(language_code, grounding_nudges['pt'])

    # 6. Define a configuração da geração com Google Search Grounding (opcional)
    # O Grounding ajuda o modelo a buscar referências científicas em tempo real
    grounding_tools = None
    if Config.ENABLE_GROUNDING:
        grounding_tools = [types.Tool(google_search=types.GoogleSearch())]
        logger.info("[GROUNDING] Google Search habilitado para esta requisição")

    # 7. Define a lista de modelos para tentar (primário + fallback)
    # Para análise de imagens, não usamos fallback (requer modelo específico)
    models_to_try = [model_name]
    if not image_data_list and FALLBACK_LLM_MODEL and FALLBACK_LLM_MODEL != model_name:
        models_to_try.append(FALLBACK_LLM_MODEL)
        logger.info(f"[FALLBACK] Configurado: primário={model_name}, fallback={FALLBACK_LLM_MODEL}")

    # 8. Define configuração base (sem thinking_config que é modelo-específico)
    base_max_tokens = DEFAULT_MAX_TOKENS_COMPLEX if include_clinical_reasoning else (DEFAULT_MAX_TOKENS_CHAT if image_data_list else None)

    # 9. Tenta cada modelo com retry e backoff
    response = None
    model_used = None
    last_error = None

    for current_model in models_to_try:
        logger.info(f"[FALLBACK] Tentando modelo: {current_model}")

        # Configura thinking apropriado para este modelo. No chat usa CHAT_THINKING_LEVEL — no
        # modelo barato (lite) dá p/ manter alto sem estourar custo (output 6× mais barato).
        thinking_config = _get_thinking_config_for_model(current_model, Config.CHAT_THINKING_LEVEL)

        generation_config = types.GenerateContentConfig(
            system_instruction=system_prompt_text,
            max_output_tokens=base_max_tokens,
            tools=grounding_tools,
            thinking_config=thinking_config
        )

        # Tenta com retry e backoff exponencial
        response, error = await _call_llm_with_retry(
            model_name=current_model,
            full_contents=full_contents,
            generation_config=generation_config
        )

        if response is not None:
            model_used = current_model
            if current_model != model_name:
                logger.warning(f"[FALLBACK] Sucesso com modelo de fallback: {current_model}")
            break
        else:
            last_error = error
            logger.warning(f"[FALLBACK] Modelo {current_model} falhou: {error}")

    # 10. Se todos os modelos falharam, retorna erro
    if response is None:
        logger.error(f"[FALLBACK] Todos os modelos falharam. Último erro: {last_error}")
        error_message = "Lamento, nossos servidores estão temporariamente sobrecarregados. Por favor, tente novamente em alguns segundos."
        return error_message, None, None, None, None

    # 11. Processa a resposta bem-sucedida
    raw_response_text = response.text.strip()
    _log_call_cost('chat', model_used, response.usage_metadata)  # instrumentação de custo real

    # Estanca vazamento de thinking/tool-use: em respostas degradadas (free/preview sob 429) o
    # modelo às vezes cospe o próprio formato interno no TEXTO (`tool_code print(google_search.
    # search(queries=[...]))` + `thought <raciocínio>`), expondo a arquitetura de busca. Limpa.
    raw_response_text = _strip_thinking_leak(raw_response_text)

    # Higieniza a resposta para remover quebras de linha excessivas
    cleaned_response_text = re.sub(r'\n{3,}', '\n\n', raw_response_text)

    # Substitui notação LaTeX inline por símbolos Unicode (Gemini às vezes usa LaTeX)
    latex_to_unicode = {
        r'$\ge$': '≥', r'$\le$': '≤', r'$\geq$': '≥', r'$\leq$': '≤',
        r'$\gt$': '>', r'$\lt$': '<', r'$\neq$': '≠', r'$\approx$': '≈',
        r'$\pm$': '±', r'$\times$': '×', r'$\div$': '÷', r'$\infty$': '∞',
        r'$\alpha$': 'α', r'$\beta$': 'β', r'$\gamma$': 'γ', r'$\delta$': 'δ',
        r'$\mu$': 'μ', r'$\sigma$': 'σ', r'$\degree$': '°', r'$\circ$': '°',
    }
    for latex, unicode_char in latex_to_unicode.items():
        cleaned_response_text = cleaned_response_text.replace(latex, unicode_char)
    # Also handle $\ge 7$ style patterns (LaTeX with value inside)
    cleaned_response_text = re.sub(r'\$\\ge\s*(\d+)\$', r'≥ \1', cleaned_response_text)
    cleaned_response_text = re.sub(r'\$\\le\s*(\d+)\$', r'≤ \1', cleaned_response_text)
    cleaned_response_text = re.sub(r'\$\\geq\s*(\d+)\$', r'≥ \1', cleaned_response_text)
    cleaned_response_text = re.sub(r'\$\\leq\s*(\d+)\$', r'≤ \1', cleaned_response_text)

    # Extract grounding sources and supports (for inline citations) if available
    grounding_sources = None
    grounding_supports = None
    grounding_search_queries = []  # buscas que o Gemini fez no grounding → ótima query p/ PubMed
    if Config.ENABLE_GROUNDING and response.candidates and len(response.candidates) > 0:
        candidate = response.candidates[0]
        logger.info(f"[GROUNDING] Checking candidate for grounding_metadata: hasattr={hasattr(candidate, 'grounding_metadata')}")
        if hasattr(candidate, 'grounding_metadata') and candidate.grounding_metadata:
            grounding = candidate.grounding_metadata
            logger.info(f"[GROUNDING] grounding_metadata found. Type: {type(grounding).__name__}")

            # Debug: mostrar conteúdo completo do grounding_metadata
            chunks = grounding.grounding_chunks if hasattr(grounding, 'grounding_chunks') else None
            supports = grounding.grounding_supports if hasattr(grounding, 'grounding_supports') else None
            chunks_count = len(chunks) if chunks else 0
            supports_count = len(supports) if supports else 0
            logger.info(f"[GROUNDING] grounding_chunks: {chunks_count} items, grounding_supports: {supports_count} items")

            # Se não temos chunks mas o grounding existe, logar warning detalhado
            if chunks_count == 0:
                logger.warning(f"[GROUNDING] ⚠️ grounding_metadata presente mas sem chunks! Model: {model_used}")
                # Log raw representation para debug
                try:
                    grounding_dict = {attr: getattr(grounding, attr, None) for attr in dir(grounding) if not attr.startswith('_')}
                    logger.warning(f"[GROUNDING] Raw grounding attrs: {list(grounding_dict.keys())}")
                    # Verificar se há retrieval_queries ou search_entry_point
                    if hasattr(grounding, 'retrieval_queries'):
                        logger.info(f"[GROUNDING] retrieval_queries: {grounding.retrieval_queries}")
                    if hasattr(grounding, 'search_entry_point'):
                        logger.info(f"[GROUNDING] search_entry_point: {grounding.search_entry_point}")
                except Exception as e:
                    logger.warning(f"[GROUNDING] Erro ao logar attrs: {e}")

            if hasattr(grounding, 'web_search_queries') and grounding.web_search_queries:
                logger.info(f"[GROUNDING] Buscas realizadas: {grounding.web_search_queries}")
                grounding_search_queries = [q for q in grounding.web_search_queries if q]

            # Extract structured sources from grounding_chunks
            if hasattr(grounding, 'grounding_chunks') and grounding.grounding_chunks:
                grounding_sources = []
                for chunk in grounding.grounding_chunks:
                    if hasattr(chunk, 'web') and chunk.web:
                        source = {
                            'uri': chunk.web.uri if hasattr(chunk.web, 'uri') else None,
                            'title': chunk.web.title if hasattr(chunk.web, 'title') else None
                        }
                        # Only add if we have at least a URI
                        if source['uri']:
                            grounding_sources.append(source)

                logger.info(f"[GROUNDING] {len(grounding_sources)} fontes estruturadas extraídas")

            # Extract grounding_supports for inline citation mapping
            if hasattr(grounding, 'grounding_supports') and grounding.grounding_supports:
                grounding_supports = []
                for support in grounding.grounding_supports:
                    seg = getattr(support, 'segment', None)
                    support_data = {
                        # O Gemini omite start_index quando o segmento começa em 0 → vem None
                        # (o atributo existe mas é None). Coerção None→0, senão o ChatResponse
                        # (start_index: int) estoura ValidationError → 500.
                        'start_index': getattr(seg, 'start_index', None) or 0,
                        'end_index': getattr(seg, 'end_index', None) or 0,
                        'text': getattr(seg, 'text', None),
                        'chunk_indices': list(support.grounding_chunk_indices) if hasattr(support, 'grounding_chunk_indices') else []
                    }
                    if support_data['chunk_indices']:
                        grounding_supports.append(support_data)

                logger.info(f"[GROUNDING] {len(grounding_supports)} supports (mapeamentos inline) extraídos")

    # 12. Processar e unificar referências (validação anti-alucinação + enriquecimento)
    grounded = bool(grounding_supports or grounding_sources or grounding_search_queries)
    ref_search_queries = grounding_search_queries
    force_pubmed = False
    # REFORÇO TIER4: se a resposta é clínica-FACTUAL mas o modelo NÃO grounseou (achou "consensual"),
    # força a busca ativa no PubMed com uma query EM INGLÊS gerada por LLM — a busca por palavra-chave
    # PT da resposta dá recall ~0. Tira a decisão de "buscar ou não" das mãos do modelo (pedido do user).
    if not grounded and _warrants_clinical_refs(cleaned_response_text):
        gen_q = _generate_pubmed_query(cleaned_response_text)
        if gen_q:
            ref_search_queries = (ref_search_queries or []) + [gen_q]
            force_pubmed = True
            logger.info(f"[TIER4] Reforço clínico (sem grounding) — query gerada: '{gen_q[:70]}'")
    try:
        from .reference_service import process_references
        cleaned_response_text, unified_sources = await process_references(
            response_text=cleaned_response_text,
            grounding_sources=grounding_sources,
            search_queries=ref_search_queries,
            grounded=grounded,
            force_pubmed=force_pubmed,
        )
        logger.info(f"[CHAT] Referências processadas: {len(unified_sources)} válidas")
    except Exception as e:
        logger.warning(f"[CHAT] Erro no processamento de referências (usando fallback): {e}")
        # Fallback: usar grounding_sources original — mas AINDA classificando, senão a
        # referência chega ao front sem `source_type` (12% das fontes auditadas estavam
        # assim) e o badge/ranking não têm como funcionar.
        unified_sources = grounding_sources
        try:
            from .reference_service import rank_and_filter_references
            unified_sources = rank_and_filter_references(list(grounding_sources or []))
        except Exception:
            pass

    # Curadoria: o modelo julga cada fonte antes de a lista ser numerada. TEM de vir antes
    # dos marcadores inline — descartar uma ref depois da numeração deslocaria todos os [n].
    if unified_sources:
        unified_sources = await run_in_threadpool(_curate_references, cleaned_response_text, unified_sources)

    # Marcadores [n] inline (estilo artigo) — casa por conteúdo do trecho citado, n = número
    # da ref já reranqueada. Web torna clicável; mobile mostra inline. Falha → texto intacto.
    cleaned_response_text = _insert_inline_citations(
        cleaned_response_text, grounding_supports, grounding_sources, unified_sources
    )

    # Imagem da biblioteca do usuário: resolve DEPOIS dos marcadores inline, porque inserir
    # markdown antes deslocaria os offsets calculados para os [n].
    cleaned_response_text = await _resolve_image_directives(
        cleaned_response_text, db, user_id, library_id
    )

    logger.info(f"[CHAT] Resposta gerada com sucesso usando {model_used}. Tamanho: {len(cleaned_response_text)} chars")
    return cleaned_response_text, response.usage_metadata, model_used, unified_sources, grounding_supports


_DOSE_RE = re.compile(r'\b\d+([.,]\d+)?\s*(mg|mcg|µg|ug|g|ml|l|ui|u|mg/kg|mcg/kg|mg/dl|g/dl|meq|mmol|mmhg|bpm|j|joules?|%)\b', re.IGNORECASE)
_CLINICAL_TERM_HINTS = ('diagn', 'trata', 'conduta', 'dose', 'sintom', 'síndrome', 'sindrome', 'terap',
                        'fármac', 'farmac', 'protocol', 'critério', 'criterio', 'manejo', 'diretriz',
                        'fisiopat', 'etiolog', 'profilax', 'prescri', 'indicaç', 'contraindic', 'patolog')


def _warrants_clinical_refs(text: str) -> bool:
    """A resposta é clínica-FACTUAL (merece referência)? Heurística: dose/valor com unidade (fato
    clínico inequívoco) OU >=2 termos clínicos substantivos. Conversa curta/clarificadora → não.
    Usado p/ FORÇAR a busca de referências mesmo quando o modelo não grounseou (achou 'consensual')."""
    if not text or len(text) < 200:
        return False
    if _DOSE_RE.search(text):
        return True
    low = text.lower()
    return sum(1 for kw in _CLINICAL_TERM_HINTS if kw in low) >= 2


_CURATION_SCHEMA = types.Schema(
    type=types.Type.OBJECT,
    required=['veredictos'],
    properties={
        'veredictos': types.Schema(
            type=types.Type.ARRAY,
            items=types.Schema(
                type=types.Type.OBJECT,
                required=['n', 'veredicto'],
                properties={
                    'n': types.Schema(type=types.Type.INTEGER),
                    'veredicto': types.Schema(type=types.Type.STRING,
                                              enum=['sustenta', 'fraca', 'irrelevante']),
                    'motivo': types.Schema(type=types.Type.STRING),
                },
            ),
        )
    },
)


def _curate_references(response_text: str, refs: list) -> list:
    """Dá VOTO ao modelo sobre as referências antes de mostrá-las.

    Até aqui a seleção era 100% mecânica: o que a busca devolveu, existindo a URL e não
    sendo domínio de lixo, entrava — ranqueado por autoridade de DOMÍNIO. Ninguém julgava
    se a fonte sustenta o que a resposta afirma. Esta passada pede ao modelo um veredicto
    por candidata: `irrelevante` sai da lista, `fraca` desce (fica disponível, mas atrás),
    `sustenta` fica. Rede de segurança: nunca esvazia a lista — se tudo for reprovado,
    preserva as duas de maior autoridade (melhor uma fonte fraca do que resposta sem fonte).

    Falha de qualquer natureza → devolve a lista original (a curadoria é um bônus, não um
    ponto único de falha do chat)."""
    if not refs or len(refs) < 2 or not getattr(Config, 'REF_CURATION_ENABLED', True):
        return refs
    try:
        linhas = []
        for i, r in enumerate(refs, 1):
            tipo = r.get('source_type') or '?'
            ano = r.get('year') or 's/ano'
            titulo = (r.get('title') or '')[:150]
            dominio = ''
            m = re.search(r'https?://(?:www\.)?([^/]+)', r.get('uri') or '')
            if m and 'vertexaisearch' not in m.group(1):
                dominio = m.group(1)
            linhas.append(f"{i}. [{tipo} · {ano}{(' · ' + dominio) if dominio else ''}] {titulo}")
        prompt = (
            "Você é revisor de referências de um copiloto clínico. Abaixo estão a RESPOSTA "
            "entregue ao médico e as FONTES candidatas que serão listadas junto dela.\n"
            "Para cada fonte, julgue se ela sustenta as afirmações da resposta:\n"
            "- 'sustenta': trata do mesmo assunto e ampara o que foi afirmado.\n"
            "- 'fraca': tem relação, mas é tangencial, genérica ou de baixa qualidade.\n"
            "- 'irrelevante': não tem a ver com o assunto, ou não ampara nada do que foi dito.\n"
            "Seja criterioso mas não zeloso: na dúvida entre 'fraca' e 'irrelevante', escolha "
            "'fraca'. Julgue SÓ pela pertinência ao conteúdo — não invente informação sobre a "
            "fonte que o título não permita.\n\nRESPOSTA:\n"
            + (response_text or '')[:4000]
            + "\n\nFONTES:\n" + "\n".join(linhas)
        )
        modelo = getattr(Config, 'REF_CURATION_MODEL', None) or Config.SIMPLE_TASK_LLM_MODEL
        resp = client.models.generate_content(
            model=f'models/{modelo}',
            contents=_redact_llm_contents(prompt),
            config=types.GenerateContentConfig(
                response_mime_type='application/json',
                response_schema=_CURATION_SCHEMA,
                max_output_tokens=1024,
                thinking_config=_get_thinking_config_for_model(modelo, 'minimal'),
            ),
        )
        data = json.loads(resp.text or '{}')
        veredictos = {}
        for v in (data.get('veredictos') or []):
            try:
                veredictos[int(v.get('n'))] = (v.get('veredicto') or '').strip().lower()
            except (TypeError, ValueError):
                continue
        if not veredictos:
            return refs

        mantidas, descartadas = [], []
        for i, r in enumerate(refs, 1):
            v = veredictos.get(i, 'sustenta')      # sem veredicto = mantém como está
            if v == 'irrelevante':
                descartadas.append((i, r))
                continue
            if v == 'fraca':
                # Numa fonte FORTE, "fraca" ainda vale a pena mostrar mais abaixo. Numa
                # fonte "web" (portal/blog/curso), fraca + tangencial é exatamente o que
                # derruba a confiança do médico na resposta — sai.
                if (r.get('source_type') or 'other') == 'other':
                    descartadas.append((i, r))
                    continue
                r['authority'] = max(5, (r.get('authority') or 30) - 15)
                r['curation'] = 'fraca'
            else:
                r['curation'] = 'sustenta'
            mantidas.append(r)

        if not mantidas:   # nunca zera: preserva as 2 de maior autoridade
            mantidas = sorted(refs, key=lambda x: x.get('authority', 0), reverse=True)[:2]
            descartadas = []
        mantidas.sort(key=lambda x: x.get('authority', 0), reverse=True)
        if descartadas:
            logger.info("[REF_CURATE] %d de %d descartada(s) como irrelevante: %s",
                        len(descartadas), len(refs),
                        ' | '.join(f"#{i} {(r.get('title') or '')[:40]}" for i, r in descartadas))
        fracas = sum(1 for r in mantidas if r.get('curation') == 'fraca')
        logger.info(f"[REF_CURATE] modelo={modelo} mantidas={len(mantidas)} (fracas={fracas})")
        return mantidas
    except Exception as e:
        logger.warning(f"[REF_CURATE] falhou (mantendo lista mecânica): {e}")
        return refs


_IMAGE_DIRECTIVE_RE = re.compile(r'^[ \t]*\[IMAGEM:\s*([^\]\n]{3,120})\][ \t]*$', re.M | re.I)


async def _resolve_image_directives(text: str, db, user_id: int, library_id: int = None) -> str:
    """Troca cada `[IMAGEM: <consulta>]` por uma imagem REAL da biblioteca do usuário.

    Medicina é visual e a resposta era só texto. O modelo pede a imagem no ponto do texto
    onde ela ajuda; aqui a diretiva é resolvida contra as imagens que o próprio usuário
    subiu (extraídas dos PDFs e descritas pelo `vision_service`). Não achou nada que case?
    A diretiva é REMOVIDA — melhor a resposta sem ilustração do que uma imagem que não
    corresponde ao que o texto afirma.

    Teto de 2 por resposta: ilustração é apoio, não enfeite."""
    if not text or not db or not user_id or '[IMAGEM:' not in text.upper():
        return text
    try:
        from .academic_services.image_lookup_service import find_medical_images, MAX_IMAGES_PER_ANSWER
        usadas = set()
        inseridas = 0

        async def _resolver(consulta: str):
            nonlocal inseridas
            if inseridas >= MAX_IMAGES_PER_ANSWER:
                return ''
            # 1º o material do PRÓPRIO usuário: licença resolvida, e citar a página do
            # documento dele vale mais que uma imagem genérica.
            achadas = await find_medical_images(db, user_id, consulta, library_id=library_id, limit=3)
            for img in achadas:
                if img['id'] in usadas:
                    continue
                usadas.add(img['id'])
                inseridas += 1
                legenda = f"Do seu material: {img['document']} — p. {img['page']}"
                alt = (img['alt'] or consulta).replace(']', '').replace('[', '')
                return f"![{alt}]({img['url']})\n*{legenda}*"

            # 2º acervo ABERTO (Commons/Openverse), só licença que permite uso comercial
            # com atribuição. O crédito vai na legenda porque a licença exige.
            try:
                from .web_image_service import find_open_medical_image
                for img in await find_open_medical_image(consulta, limite=1):
                    chave = img['url']
                    if chave in usadas:
                        continue
                    usadas.add(chave)
                    inseridas += 1
                    alt = (img['alt'] or consulta).replace(']', '').replace('[', '')
                    credito = img['credito']
                    if img.get('pagina'):
                        credito = f"[{credito}]({img['pagina']})"
                    return f"![{alt}]({img['url']})\n*{credito}*"
            except Exception as e:
                logger.info(f"[IMG_DIRECTIVE] acervo aberto indisponível: {e}")
            return ''

        partes, ultimo = [], 0
        for m in _IMAGE_DIRECTIVE_RE.finditer(text):
            partes.append(text[ultimo:m.start()])
            partes.append(await _resolver(m.group(1).strip()))
            ultimo = m.end()
        partes.append(text[ultimo:])
        novo = ''.join(partes)
        # limpa linhas vazias triplas deixadas por diretiva removida
        novo = re.sub(r'\n{3,}', '\n\n', novo)
        if inseridas:
            logger.info(f"[IMG_DIRECTIVE] {inseridas} imagem(ns) da biblioteca inserida(s) na resposta")
        return novo
    except Exception as e:
        logger.warning(f"[IMG_DIRECTIVE] falhou (removendo diretivas): {e}")
        return _IMAGE_DIRECTIVE_RE.sub('', text)


def _generate_pubmed_query(response_text: str) -> str:
    """Gera uma query FOCADA em INGLÊS p/ o PubMed a partir da resposta clínica — a busca por
    palavra-chave PT da resposta dá recall ~0 (PubMed é indexado em inglês). Modelo leve + retry
    (ResilientGeminiClient); qualquer falha → '' (sem reforço, sem quebrar o chat)."""
    try:
        prompt = ("From the clinical answer below, output ONLY a focused PubMed search query in "
                  "ENGLISH — 3 to 6 key terms (condition, drugs, intervention), no boolean operators, "
                  "no quotes, no explanation.\n\nAnswer:\n" + (response_text or '')[:1500])
        resp = client.models.generate_content(
            model=f'models/{Config.SIMPLE_TASK_LLM_MODEL}',
            contents=_redact_llm_contents(prompt),
            config=types.GenerateContentConfig(
                max_output_tokens=80,
                thinking_config=_get_thinking_config_for_model(Config.SIMPLE_TASK_LLM_MODEL, 'minimal'),
            ),
        )
        q = (resp.text or '').strip().replace('"', '').replace('\n', ' ')
        return q[:200]
    except Exception as e:
        logger.warning(f"[TIER4] Falha ao gerar query PubMed clínica: {e}")
        return ''


def _fallback_title(content: str, language_code: str = 'pt', has_image: bool = False) -> str:
    """Título de fallback SEM LLM (modelo sobrecarregado/503 ou sem cota): deriva das primeiras
    palavras da mensagem do usuário — mais útil que um rótulo genérico e nunca usa marca antiga.
    Imagem sem texto → rótulo de análise de imagem; mensagem vazia → 'Nova conversa'."""
    if has_image:
        return {'pt': 'Análise de Imagem', 'en': 'Image Analysis', 'es': 'Análisis de Imagen'}.get(language_code, 'Análise de Imagem')
    import re as _re
    text = (content or '').strip()
    text = next((ln.strip() for ln in text.splitlines() if ln.strip()), '')  # 1ª linha não-vazia
    text = _re.sub(r'[#*`_>~\[\]()]+', ' ', text)        # remove marcação básica
    text = _re.sub(r'\s+', ' ', text).strip()
    if not text:
        return {'pt': 'Nova conversa', 'en': 'New conversation', 'es': 'Nueva conversación'}.get(language_code, 'Nova conversa')
    title = ' '.join(text.split(' ')[:6])
    if len(title) > 48:
        title = title[:48].rstrip() + '…'
    return title


def generate_title_from_content(content: str, language_code: str = 'pt', has_image: bool = False) -> str:
    logger.info(f"Iniciando a geração de título para o conteúdo em '{language_code}'. has_image={has_image}")

    # Add image context if applicable
    image_context = {
        'pt': " O usuário enviou uma imagem médica junto com esta mensagem.",
        'en': " The user sent a medical image along with this message.",
        'es': " El usuario envió una imagen médica junto con este mensaje."
    }

    context_suffix = image_context.get(language_code, image_context['pt']) if has_image else ""

    # Improved prompts that are more strict about output format
    safe_content = sanitize_user_input_for_prompt(content, max_length=500)
    prompts = {
        'pt': f"Gere um título de 2-4 palavras para esta conversa médica.{context_suffix}\n\nMensagem do usuário: \"{safe_content}\"\n\nResponda APENAS com o título, sem explicações, aspas ou pontuação extra.",
        'en': f"Generate a 2-4 word title for this medical conversation.{context_suffix}\n\nUser message: \"{safe_content}\"\n\nRespond with ONLY the title, no explanations, quotes or extra punctuation.",
        'es': f"Genera un título de 2-4 palabras para esta conversación médica.{context_suffix}\n\nMensaje del usuario: \"{safe_content}\"\n\nResponde SOLO con el título, sin explicaciones, comillas ni puntuación extra."
    }
    prompt = prompts.get(language_code, prompts['pt'])

    fallback = _fallback_title(content, language_code, has_image)

    try:
        model_to_use = Config.SIMPLE_TASK_LLM_MODEL
        response = client.models.generate_content(
            model=f'models/{model_to_use}',
            contents=_redact_llm_contents(prompt),
            config=types.GenerateContentConfig(
                # Título é tarefa trivial → thinking minimal (sem isso, os modelos 2.5/3 gastam
                # o orçamento pensando e devolvem response.text=None → caía no fallback "Documento
                # Quíron"). max_output_tokens generoso p/ o texto curto sempre caber.
                max_output_tokens=256,
                thinking_config=_get_thinking_config_for_model(model_to_use, 'minimal'),
            )
        )
        response_text = response.text

        # Proteção contra response.text None
        if response_text is None:
            logger.warning("LLM retornou response.text = None em generate_chat_title")
            return fallback

        title = response_text.strip().replace('"', '').replace('*', '')

        # If title is too long (>50 chars), it's likely an explanation - use fallback
        if len(title) > 50:
            logger.warning(f"Título gerado muito longo ({len(title)} chars), usando fallback")
            return fallback

        # Remove common explanation prefixes that LLMs sometimes add
        prefixes_to_remove = ['Título:', 'Title:', 'Título Gerado:', 'Generated Title:']
        for prefix in prefixes_to_remove:
            if title.lower().startswith(prefix.lower()):
                title = title[len(prefix):].strip()

        logger.info(f"Título gerado com sucesso: '{title}'")
        return title if title else fallback

    except Exception as e:
        logger.error(f"Erro ao gerar título com GenAI: {e}", exc_info=True)
        return fallback


def count_tokens_for_billing(model_name: str, contents) -> int:
    """Função para estimar tokens antes de uma chamada."""
    try:
        response = client.count_tokens(model=f'models/{model_name}', contents=_redact_llm_contents(contents))
        return response.total_tokens
    except Exception as e:
        logger.error(f"Erro ao contar tokens: {e}")
        return 0

async def chat_with_library_rag(query: str, library_id: int, db: AsyncSession, history: List[Dict] = None) -> str:
    """
    Realiza um chat com uma biblioteca específica usando a abordagem RAG.
    1. Busca chunks relevantes no banco de vetores.
    2. Constrói um prompt com o contexto recuperado.
    3. Chama o LLM para gerar uma resposta baseada no contexto.
    """
    logger.info(f"Iniciando chat RAG para a biblioteca ID {library_id} com a query: '{query[:100]}...'")

    # 1. Buscar chunks relevantes no banco de vetores (Retrieval)
    try:
        relevant_chunks = vector_db_service.query_library(
            query_text=query,
            library_id=library_id,
            n_results=5  # Buscar os 5 chunks mais relevantes
        )
    except Exception as e:
        logger.error(f"Falha ao buscar chunks na biblioteca {library_id}: {e}", exc_info=True)
        return "Desculpe, não consegui acessar o conteúdo desta biblioteca no momento. Por favor, tente novamente mais tarde."

    if not relevant_chunks:
        logger.warning(f"Nenhum chunk relevante encontrado para a query na biblioteca {library_id}.")
        return "Não encontrei informações relevantes sobre este tópico nos documentos da sua biblioteca. Por favor, tente reformular sua pergunta ou adicione mais documentos."

    # 2. Construir o prompt para o LLM (Augmentation)
    context_string = "\n\n---\n\n".join(relevant_chunks)

    # Prepara o histórico da conversa para o LLM
    chat_history_for_llm = []
    if history:
        for msg in history:
            role = 'user' if msg['sender'] == 'user' else 'model'
            chat_history_for_llm.append({'role': role, 'parts': [{'text': msg['content']}]})

    # Adiciona a query atual do usuário ao histórico
    # O prompt de sistema instruirá o modelo a usar o contexto fornecido
    safe_query = sanitize_user_input_for_prompt(query)
    safe_context = sanitize_user_input_for_prompt(context_string, max_length=50000)
    user_query_with_context = (
        f"**Contexto Relevante da sua Biblioteca:**\n"
        f"[INICIO_CONTEXTO]\n{safe_context}\n[FIM_CONTEXTO]\n\n"
        f"**Sua Pergunta:**\n"
        f"[INICIO_PERGUNTA]{safe_query}[FIM_PERGUNTA]"
    )
    chat_history_for_llm.append({'role': 'user', 'parts': [{'text': user_query_with_context}]})

    # Prompt de sistema que força o modelo a usar o contexto
    library_persona_prompt = (
        "**PERSONA:** Você é um assistente de pesquisa inteligente. Sua função é analisar o conteúdo de uma biblioteca de documentos fornecida pelo usuário e responder às perguntas dele com base nesse conteúdo. "
        "Você deve sintetizar as informações de forma clara, coesa e em linguagem natural, como se estivesse explicando os pontos principais de um texto. "
        "NUNCA se apresente. Apenas forneça a resposta diretamente. "
        "Sua função é ser uma interface de conversação para os documentos do usuário, transformando os dados brutos em uma resposta bem elaborada."
    )
    system_prompt = (
        f"{library_persona_prompt}\n\n"
        "**TAREFA CRÍTICA:** Responda à pergunta do usuário baseando-se **estritamente** no 'Contexto Relevante da sua Biblioteca' fornecido. "
        "Sintetize os pontos-chave em um texto corrido e coeso. Não liste os fatos. "
        "Se a resposta não estiver no contexto, afirme que a informação não foi encontrada nos documentos fornecidos. "
        "Não utilize conhecimento externo."
    )

    # 3. Chamar o LLM para gerar a resposta (Generation)
    try:
        model_to_use = Config.CHAT_LLM_MODEL  # RAG = alto volume → modelo barato (igual chat)
        generation_config = types.GenerateContentConfig(
            system_instruction=system_prompt
        )
        
        response = client.models.generate_content(
            model=f'models/{model_to_use}',
            contents=_redact_llm_contents(chat_history_for_llm),
            config=generation_config
        )

        # Proteção contra response.text None
        if response.text is None:
            logger.warning("LLM retornou response.text = None em chat_with_library_rag")
            return "Não foi possível gerar uma resposta. Por favor, tente novamente."

        logger.info(f"Resposta RAG gerada com sucesso para a biblioteca {library_id}.")
        _log_call_cost('rag', model_to_use, response.usage_metadata)  # instrumentação de custo real
        return response.text.strip()

    except Exception as e:
        logger.error(f"Erro na chamada do LLM para o chat RAG: {e}", exc_info=True)
        return "Ocorreu um erro ao tentar gerar a resposta. Por favor, tente novamente."
   
# suggest_icon_for_topic (LLM) REMOVIDA — agora é heurística local (sem custo/latência/
# dependência) em library_service.suggest_icon_for_topic. Escolher 1 de ~24 ícones é
# tarefa de keyword, não precisa de IA.


def generate_surgical_report(case_data_str: str, language_code: str = 'pt-BR') -> str:
    """
    Gera um relatório pós-operatório cirúrgico/anestésico baseado nos dados do caso.
    """
    logger.info(f"Iniciando geração de relatório cirúrgico. Lang: {language_code}")
    
    language_instruction = f"Escreva o relatório em {language_code}."
    
    prompt = (
        f"**PERSONA:** Você é um anestesiologista sênior detalhista.\n"
        f"**TAREFA:** Gere um relatório pós-operatório técnico e completo (nota de alta da sala) com base nos dados JSON fornecidos abaixo. {language_instruction}\n"
        "**ESTRUTURA SUGERIDA:**\n"
        "1. **Identificação e Contexto:** Paciente, idade, ASA, procedimento realizado.\n"
        "2. **Monitorização e Via Aérea:** Cite resumidamente se houve intubação ou via aérea difícil (baseado nos eventos/desfechos).\n"
        "3. **Eventos Intraoperatórios:** Descreva cronologicamente os marcadores principais (indução, incisão, etc) e intercorrências.\n"
        "4. **Drogas e Balanço:** Cite as principais drogas utilizadas (indução e manutenção).\n"
        "5. **Desfecho e Complicações:** Condições de saída, encaminhamento (RPA/UTI) e eventuais complicações marcadas.\n\n"
        "**ESTILO:** Prontuário médico formal, voz passiva ou impessoal, objetivo. Use termos técnicos. Omitir informações ausentes.\n\n"
        "**DADOS DO CASO (JSON):**\n"
        f"```json\n{case_data_str}\n```\n\n"
        "**RELATÓRIO PÓS-OPERATÓRIO:**"
    )

    try:
        model_to_use = Config.PRIMARY_LLM_MODEL
        response = client.models.generate_content(
            model=f'models/{model_to_use}',
            contents=_redact_llm_contents(prompt),
            config=types.GenerateContentConfig(
                temperature=0.3, # Baixa temperatura para precisão factual
                max_output_tokens=2048
            )
        )
        # Proteção contra response.text None
        if response.text is None:
            logger.warning("LLM retornou response.text = None em generate_surgical_report")
            return "Erro: O modelo não gerou uma resposta válida. Tente novamente."

        report = response.text.strip()
        logger.info("Relatório cirúrgico gerado com sucesso.")
        return report
    except Exception as e:
        logger.error(f"Erro ao gerar relatório cirúrgico: {e}", exc_info=True)
        return "Erro ao gerar o relatório. Por favor, verifique os dados e tente novamente."


def generate_patient_orientation(prompt: str, specialty: str = '', language_code: str = 'pt-BR') -> dict:
    """
    Gera material educativo para pacientes usando IA.
    Retorna HTML formatado para impressão em A4.

    Args:
        prompt: Descrição do que o médico deseja orientar ao paciente
        specialty: Especialidade médica (contexto)
        language_code: Código do idioma

    Returns:
        dict com 'title' e 'content' (HTML)
    """
    logger.info(f"Gerando orientação ao paciente. Specialty: {specialty}, Lang: {language_code}")

    lang_map = {
        'pt-BR': 'português brasileiro',
        'pt': 'português brasileiro',
        'en': 'inglês',
        'en-US': 'inglês',
        'es': 'espanhol',
        'es-ES': 'espanhol'
    }
    language_name = lang_map.get(language_code, 'português brasileiro')

    specialty_context = f"Contexto da especialidade: {specialty}. " if specialty else ""

    system_prompt = (
        f"**PERSONA:** Você é um médico experiente que cria materiais educativos para pacientes.\n"
        f"**TAREFA:** Gere um material educativo claro e acessível para o paciente, em {language_name}. "
        f"{specialty_context}"
        f"O conteúdo deve ser em formato HTML adequado para impressão em folha A4.\n\n"
        "**REGRAS:**\n"
        "- Use linguagem simples e acessível (nível de leitura para leigos)\n"
        "- Inclua títulos (h2, h3), listas (ul/li), tabelas quando apropriado\n"
        "- Seja detalhado e prático, com orientações acionáveis\n"
        "- Inclua sinais de alerta quando relevante\n"
        "- NÃO inclua tags html, head, body - apenas o conteúdo interno\n"
        "- NÃO inclua disclaimers genéricos sobre consultar um médico (o documento já vem de um médico)\n"
        "- O conteúdo deve ter pelo menos 300 palavras\n\n"
        "**FORMATO DE SAÍDA:**\n"
        "Retorne um JSON com dois campos:\n"
        '- "title": título do material (curto, máximo 80 caracteres)\n'
        '- "content": conteúdo HTML do material\n\n'
        f"**SOLICITAÇÃO DO MÉDICO:**\n{prompt}"
    )

    try:
        model_to_use = Config.PRIMARY_LLM_MODEL
        response = client.models.generate_content(
            model=f'models/{model_to_use}',
            contents=_redact_llm_contents(system_prompt),
            config=types.GenerateContentConfig(
                temperature=0.4,
                max_output_tokens=4096,
                response_mime_type="application/json"
            )
        )

        if response.text is None:
            logger.warning("LLM retornou response.text = None em generate_patient_orientation")
            return {
                "title": "Orientação ao Paciente",
                "content": "<p>Erro: O modelo não gerou uma resposta válida. Tente novamente.</p>"
            }

        import json
        result = json.loads(response.text.strip())

        title = result.get('title', 'Orientação ao Paciente')
        content = result.get('content', '')

        if not content:
            logger.warning("LLM retornou content vazio em generate_patient_orientation")
            return {
                "title": title,
                "content": "<p>Erro: O modelo não gerou conteúdo. Tente novamente com uma descrição mais detalhada.</p>"
            }

        logger.info(f"Orientação ao paciente gerada com sucesso: {title}")
        return {"title": title, "content": content}

    except Exception as e:
        logger.error(f"Erro ao gerar orientação ao paciente: {e}", exc_info=True)
        return {
            "title": "Orientação ao Paciente",
            "content": "<p>Erro ao gerar o material. Por favor, tente novamente.</p>"
        }


async def normalize_clinical_terms(
    field_type: str,
    terms: list[str] | None,
    language_code: str = 'pt-BR'
) -> list[str] | None:
    """
    Normaliza termos clínicos usando Gemini Flash Lite.

    Funções:
    1. Detecta negações ("nega", "não", "nenhum") e retorna None
    2. Padroniza terminologia médica ("pressão alta" -> "Hipertensão Arterial Sistêmica")
    3. Remove duplicatas e termos inválidos

    Args:
        field_type: 'allergies', 'chronic_conditions', ou 'current_medications'
        terms: Lista de termos informados pelo usuário
        language_code: Código do idioma para a resposta

    Returns:
        Lista de termos normalizados ou None se for negação
    """
    if not terms or len(terms) == 0:
        return None

    # Join terms for analysis
    terms_text = ", ".join(terms)
    logger.info(f"[CLINICAL] Normalizando {field_type}: {terms_text}")

    field_descriptions = {
        'allergies': 'alergias medicamentosas ou alimentares',
        'chronic_conditions': 'condições crônicas ou doenças de base',
        'current_medications': 'medicamentos em uso contínuo'
    }

    field_desc = field_descriptions.get(field_type, field_type)

    # Regras específicas por tipo de campo
    field_specific_rules = {
        'allergies': (
            "   - Para alergias: use o nome do fármaco/substância (ex: \"alergia a dipirona\" → \"Dipirona\")\n"
        ),
        'chronic_conditions': (
            "   - Para condições: use terminologia médica padrão (ex: \"pressão alta\" → \"Hipertensão Arterial Sistêmica (HAS)\")\n"
            "   - \"diabetes\" → \"Diabetes Mellitus Tipo 2\"\n"
            "   - \"colesterol alto\" → \"Dislipidemia\"\n"
            "   - \"problema no coração\" → especifique se possível ou use \"Cardiopatia\"\n"
        ),
        'current_medications': (
            "   - Para medicamentos: use nome genérico quando possível\n"
            "   - CADA medicamento informado deve gerar EXATAMENTE UMA entrada na saída — NUNCA divida um medicamento em múltiplas entradas\n"
            "   - PRESERVE a posologia completa (dose + concentração + frequência + duração) em uma ÚNICA entrada\n"
            "   - Padronize o formato da posologia: \"1 vez ao dia\" → \"1x/dia\", \"de 12 em 12 horas\" → \"12/12h\", \"2 vezes ao dia\" → \"2x/dia\", \"de 8 em 8h\" → \"8/8h\"\n"
            "   - Padronize duração: \"por 5 dias\" → \"5 dias\", \"durante 7 dias\" → \"7 dias\"\n"
            "   - Se a dose for informada sem unidade, adicione \"mg\" (ex: \"losartana 50\" → \"Losartana 50mg\")\n"
            "   - NÃO invente dose ou posologia se não foram informadas (ex: \"metformina\" → \"Metformina\")\n"
            "   - Exemplo completo: \"losartana 50 1 vez ao dia\" → \"Losartana 50mg 1x/dia\"\n"
            "   - Exemplo com duração: \"prednisolona 3mg/ml 1ml de 12 em 12 horas por 5 dias\" → \"Prednisolona 3mg/mL 1mL 12/12h 5 dias\"\n"
        )
    }

    specific_rules = field_specific_rules.get(field_type, '')

    prompt = f"""Você é um assistente médico especializado em padronização terminológica.

**TAREFA:** Analise o texto abaixo informado como "{field_desc}" de um paciente e retorne os termos padronizados.

**TEXTO INFORMADO:** "{terms_text}"

**REGRAS:**
1. Se o texto indicar NEGAÇÃO (ex: "nega", "não", "nenhum", "sem", "nada", "ausente", "-", "n/a"), responda exatamente: NULL
2. Se houver termos válidos, padronize para terminologia médica correta:
{specific_rules}3. Remova duplicatas
4. Mantenha o idioma {language_code}

**FORMATO DA RESPOSTA:**
- Se negação: NULL
- Se termos válidos: termo1 | termo2 | termo3
  (use | como separador, sem espaços extras)

**RESPOSTA:**"""

    try:
        model_to_use = Config.SIMPLE_TASK_LLM_MODEL
        response = client.models.generate_content(
            model=f'models/{model_to_use}',
            contents=_redact_llm_contents(prompt),
            config=types.GenerateContentConfig(
                temperature=0.1,  # Baixa temperatura para consistência
                max_output_tokens=200
            )
        )

        # Proteção contra response.text None
        if response.text is None:
            logger.warning(f"[CLINICAL] LLM retornou response.text = None para {field_type}")
            return None

        result = response.text.strip()
        logger.info(f"[CLINICAL] LLM response for {field_type}: {result}")

        # Check for null/negation response
        if result.upper() in ['NULL', 'NULO', 'NONE', 'N/A', '-']:
            logger.info(f"[CLINICAL] Detected negation for {field_type}")
            return None

        # Parse pipe-separated terms
        normalized_terms = [term.strip() for term in result.split('|') if term.strip()]

        # Remove any empty or invalid terms
        normalized_terms = [t for t in normalized_terms if len(t) > 1 and t.upper() not in ['NULL', 'NULO']]

        if not normalized_terms:
            return None

        logger.info(f"[CLINICAL] Normalized {field_type}: {normalized_terms}")
        return normalized_terms

    except Exception as e:
        logger.error(f"[CLINICAL] Error normalizing {field_type}: {e}", exc_info=True)
        # On error, return original terms (don't lose data)
        return terms


async def parse_and_extract_from_history(
    raw_history: str,
    language_code: str = 'pt-BR'
) -> dict | None:
    """
    Parses raw clinical history AND extracts patient demographic/clinical data in a single AI call.

    Returns a dict with:
    - consultations: list of structured consultation records
    - patient_data: extracted patient info (name, gender, birth_date, document_id, allergies, etc.)

    Used by the preview-history-import endpoint (no patient_id required).
    """
    if not raw_history or len(raw_history.strip()) < 20:
        logger.warning("[HISTORY-EXTRACT] Raw history too short to parse")
        return None

    logger.info(f"[HISTORY-EXTRACT] Parsing + extracting from history, length={len(raw_history)}, lang={language_code}")

    output_instructions = {
        'pt-BR': "Responda em português brasileiro.",
        'pt': "Responda em português.",
        'en': "Respond in English.",
        'en-US': "Respond in English (US).",
        'es': "Respond in Spanish.",
        'es-ES': "Respond in Spanish."
    }
    lang_instruction = output_instructions.get(language_code, output_instructions['pt-BR'])

    # Extended JSON Schema: consultations + patient_data
    combined_schema = {
        "type": "object",
        "properties": {
            "consultations": {
                "type": "array",
                "description": "Array of structured consultation records extracted from clinical history",
                "items": {
                    "type": "object",
                    "properties": {
                        "date": {"type": "string", "description": "Consultation date in YYYY-MM-DD format or original format if unclear"},
                        "chief_complaint": {"type": "string", "description": "Main reason for visit / chief complaint"},
                        "notes": {"type": "string", "description": "Clinical notes, findings, exam results"},
                        "diagnosis": {"type": "string", "description": "Working diagnosis or assessment"},
                        "plan": {"type": "string", "description": "Treatment plan, prescriptions, follow-up"},
                        "provider": {"type": "string", "description": "Name of the healthcare provider if mentioned"}
                    },
                    "required": ["date", "chief_complaint", "notes", "diagnosis", "plan", "provider"]
                }
            },
            "patient_data": {
                "type": "object",
                "description": "Patient demographic and clinical data extracted from the text",
                "properties": {
                    "full_name": {"type": "string", "description": "Patient's full name"},
                    "gender": {"type": "string", "description": "Patient gender: 'male' or 'female'"},
                    "birth_date": {"type": "string", "description": "Date of birth in YYYY-MM-DD format"},
                    "document_id": {"type": "string", "description": "Patient ID document (CPF, DNI, etc.) with original formatting"},
                    "allergies": {"type": "array", "items": {"type": "string"}, "description": "Known allergies consolidated from all records"},
                    "chronic_conditions": {"type": "array", "items": {"type": "string"}, "description": "Chronic conditions consolidated from all records"},
                    "current_medications": {"type": "array", "items": {"type": "string"}, "description": "Current medications consolidated from all records"}
                },
                "required": ["full_name", "gender", "birth_date", "document_id", "allergies", "chronic_conditions", "current_medications"]
            }
        },
        "required": ["consultations", "patient_data"]
    }

    prompt = f"""Analise o histórico clínico bruto abaixo e faça DUAS tarefas:

**TAREFA 1 — ORGANIZAR CONSULTAS:**
1. Identifique cada consulta/atendimento separado no texto
2. Para cada consulta, extraia: data, queixa principal, anotações clínicas, diagnóstico e plano
3. Se uma informação não estiver presente, use string vazia ""
4. Ordene cronologicamente (mais antiga primeiro)

DICAS PARA PARSING:
- Procure por padrões de data (DD/MM/AAAA, DD-MM-AAAA, etc.)
- Seções como "QP:", "HDA:", "HD:", "Conduta:", "S:", "O:", "A:", "P:" indicam estrutura SOAP
- Números de prontuário ou códigos podem indicar separação de consultas
- Texto após "Atendimento:" ou "Consulta:" geralmente inicia nova entrada

**TAREFA 2 — EXTRAIR DADOS CADASTRAIS DO PACIENTE:**
Extraia os dados do paciente presentes no texto:
- full_name: Nome completo do paciente (geralmente no início do texto)
- gender: "male" ou "female" (extrair de "Sexo Masculino"/"Sexo Feminino" ou contexto)
- birth_date: Data de nascimento em formato YYYY-MM-DD (extrair de "Nasceu em DD/MM/AAAA")
- document_id: CPF ou documento de identificação (manter formatação original com pontos/traços)
- allergies: Lista de alergias mencionadas em QUALQUER parte do histórico (consolidar de todas as consultas)
- chronic_conditions: Lista de condições crônicas/doenças de base (consolidar de todos os diagnósticos)
- current_medications: Lista de medicamentos em uso contínuo (consolidar dos planos de tratamento)

REGRAS para patient_data:
- Extrair SOMENTE informações EXPLICITAMENTE presentes no texto
- Se um campo não estiver no texto, usar string vazia "" ou array vazio []
- Para allergies/conditions/medications: consolidar de TODAS as consultas, sem duplicatas
- Usar terminologia médica padronizada (ex: "pressão alta" → "Hipertensão Arterial Sistêmica")
- Incluir posologia nos medicamentos quando disponível (ex: "Losartana 50mg 1x/dia")

Se o texto não contiver consultas estruturáveis, retorne consultations como array vazio [].

{lang_instruction}

HISTÓRICO CLÍNICO BRUTO:
---
{raw_history}
---"""

    max_attempts = 3
    models_to_try = [Config.PRIMARY_LLM_MODEL]
    if Config.FALLBACK_LLM_MODEL and Config.FALLBACK_LLM_MODEL != Config.PRIMARY_LLM_MODEL:
        models_to_try.append(Config.FALLBACK_LLM_MODEL)

    last_error = None
    for attempt in range(1, max_attempts + 1):
        model_to_use = models_to_try[0] if attempt < max_attempts or len(models_to_try) < 2 else models_to_try[1]

        try:
            logger.info(f"[HISTORY-EXTRACT] Tentativa {attempt}/{max_attempts} com modelo: {model_to_use}")

            response = client.models.generate_content(
                model=f'models/{model_to_use}',
                contents=_redact_llm_contents(prompt),
                config=types.GenerateContentConfig(
                    temperature=0.1,
                    max_output_tokens=8192,
                    response_mime_type="application/json",
                    response_schema=combined_schema
                )
            )

            if response.text is None:
                logger.warning(f"[HISTORY-EXTRACT] Tentativa {attempt}: LLM retornou response.text = None")
                last_error = "response.text is None"
                continue

            response_text = response.text.strip()
            logger.debug(f"[HISTORY-EXTRACT] Raw LLM response: {response_text[:500]}...")

            parsed_result, parse_success, parse_error = try_parse_json_with_repair(
                response_text,
                context=f"[HISTORY-EXTRACT] Tentativa {attempt}"
            )

            if not parse_success:
                logger.warning(f"[HISTORY-EXTRACT] Tentativa {attempt}: Failed to parse JSON: {parse_error}")
                last_error = parse_error
                continue

            if isinstance(parsed_result, dict):
                # Validate consultations
                raw_consultations = parsed_result.get('consultations', [])
                validated_consultations = []
                if isinstance(raw_consultations, list):
                    for record in raw_consultations:
                        if isinstance(record, dict):
                            validated_consultations.append({
                                'date': record.get('date', ''),
                                'chief_complaint': record.get('chief_complaint', ''),
                                'notes': record.get('notes', ''),
                                'diagnosis': record.get('diagnosis', ''),
                                'plan': record.get('plan', ''),
                                'provider': record.get('provider', '')
                            })

                # Validate patient_data
                raw_patient = parsed_result.get('patient_data', {})
                patient_data = {
                    'full_name': raw_patient.get('full_name', '') if isinstance(raw_patient, dict) else '',
                    'gender': raw_patient.get('gender', '') if isinstance(raw_patient, dict) else '',
                    'birth_date': raw_patient.get('birth_date', '') if isinstance(raw_patient, dict) else '',
                    'document_id': raw_patient.get('document_id', '') if isinstance(raw_patient, dict) else '',
                    'allergies': raw_patient.get('allergies', []) if isinstance(raw_patient, dict) else [],
                    'chronic_conditions': raw_patient.get('chronic_conditions', []) if isinstance(raw_patient, dict) else [],
                    'current_medications': raw_patient.get('current_medications', []) if isinstance(raw_patient, dict) else []
                }
                # Ensure arrays are actually arrays
                for field in ['allergies', 'chronic_conditions', 'current_medications']:
                    if not isinstance(patient_data[field], list):
                        patient_data[field] = []

                logger.info(
                    f"[HISTORY-EXTRACT] Success: {len(validated_consultations)} consultations, "
                    f"patient_data extracted (name='{patient_data['full_name']}', "
                    f"allergies={len(patient_data['allergies'])}, "
                    f"conditions={len(patient_data['chronic_conditions'])}, "
                    f"meds={len(patient_data['current_medications'])})"
                )

                return {
                    'consultations': validated_consultations if validated_consultations else [],
                    'patient_data': patient_data
                }

            logger.warning(f"[HISTORY-EXTRACT] Tentativa {attempt}: resposta não é um objeto JSON")
            last_error = "response is not a JSON object"

        except Exception as e:
            logger.error(f"[HISTORY-EXTRACT] Tentativa {attempt}: Error: {e}", exc_info=True)
            last_error = str(e)

    logger.error(f"[HISTORY-EXTRACT] Todas as {max_attempts} tentativas falharam. Último erro: {last_error}")
    return None


async def parse_clinical_history(
    raw_history: str,
    language_code: str = 'pt-BR'
) -> list[dict] | None:
    """
    Parses raw clinical history text into structured consultation records using AI.

    Takes unformatted text (often copied from Google Docs or other EMR systems)
    and structures it into individual consultations with:
    - date: consultation date
    - chief_complaint: main reason for visit
    - notes: clinical notes/findings
    - diagnosis: working diagnosis
    - plan: treatment plan
    - provider: who saw the patient (if mentioned)

    Args:
        raw_history: Raw text containing clinical history
        language_code: Language for the response

    Returns:
        List of structured consultation records or None if parsing fails
    """
    if not raw_history or len(raw_history.strip()) < 20:
        logger.warning("[HISTORY] Raw history too short to parse")
        return None

    logger.info(f"[HISTORY] Parsing clinical history, length={len(raw_history)}, lang={language_code}")

    # Language-specific instructions
    output_instructions = {
        'pt-BR': "Responda em português brasileiro.",
        'pt': "Responda em português.",
        'en': "Respond in English.",
        'en-US': "Respond in English (US).",
        'es': "Respond in Spanish.",
        'es-ES': "Respond in Spanish."
    }
    lang_instruction = output_instructions.get(language_code, output_instructions['pt-BR'])

    # JSON Schema for structured output - ensures valid JSON from the model
    consultation_record_schema = {
        "type": "array",
        "description": "Array of structured consultation records extracted from clinical history",
        "items": {
            "type": "object",
            "properties": {
                "date": {
                    "type": "string",
                    "description": "Consultation date in YYYY-MM-DD format or original format if unclear"
                },
                "chief_complaint": {
                    "type": "string",
                    "description": "Main reason for visit / chief complaint"
                },
                "notes": {
                    "type": "string",
                    "description": "Clinical notes, findings, exam results"
                },
                "diagnosis": {
                    "type": "string",
                    "description": "Working diagnosis or assessment"
                },
                "plan": {
                    "type": "string",
                    "description": "Treatment plan, prescriptions, follow-up"
                },
                "provider": {
                    "type": "string",
                    "description": "Name of the healthcare provider if mentioned"
                }
            },
            "required": ["date", "chief_complaint", "notes", "diagnosis", "plan", "provider"]
        }
    }

    prompt = f"""Analise o histórico clínico bruto abaixo e estruture-o em consultas individuais.

INSTRUÇÕES:
1. Identifique cada consulta/atendimento separado no texto
2. Para cada consulta, extraia: data, queixa principal, anotações clínicas, diagnóstico e plano
3. Se uma informação não estiver presente, use string vazia ""
4. Ordene cronologicamente (mais antiga primeiro)
5. {lang_instruction}

DICAS PARA PARSING:
- Procure por padrões de data (DD/MM/AAAA, DD-MM-AAAA, etc.)
- Seções como "QP:", "HDA:", "HD:", "Conduta:", "S:", "O:", "A:", "P:" indicam estrutura SOAP
- Números de prontuário ou códigos podem indicar separação de consultas
- Texto após "Atendimento:" ou "Consulta:" geralmente inicia nova entrada

Se o texto não contiver informações clínicas estruturáveis, retorne um array vazio [].

HISTÓRICO CLÍNICO BRUTO:
---
{raw_history}
---"""

    max_attempts = 3
    models_to_try = [Config.PRIMARY_LLM_MODEL]
    if Config.FALLBACK_LLM_MODEL and Config.FALLBACK_LLM_MODEL != Config.PRIMARY_LLM_MODEL:
        models_to_try.append(Config.FALLBACK_LLM_MODEL)

    logger.info(f"[HISTORY] Modelos disponíveis: {models_to_try}")

    last_error = None
    for attempt in range(1, max_attempts + 1):
        # Use fallback model on last attempt if available
        model_to_use = models_to_try[0] if attempt < max_attempts or len(models_to_try) < 2 else models_to_try[1]

        try:
            logger.info(f"[HISTORY] Tentativa {attempt}/{max_attempts} com modelo: {model_to_use}")

            # Use structured output with response_mime_type for guaranteed valid JSON
            response = client.models.generate_content(
                model=f'models/{model_to_use}',
                contents=_redact_llm_contents(prompt),
                config=types.GenerateContentConfig(
                    temperature=0.1,  # Very low temperature for consistent structured output
                    max_output_tokens=8192,  # Increased for longer histories
                    response_mime_type="application/json",  # Forces valid JSON output
                    response_schema=consultation_record_schema  # Schema validation
                )
            )

            # Proteção contra response.text None (pode ocorrer com safety filters ou timeout)
            if response.text is None:
                logger.warning(f"[HISTORY] Tentativa {attempt}: LLM retornou response.text = None")
                last_error = "response.text is None"
                continue

            response_text = response.text.strip()
            logger.debug(f"[HISTORY] Raw LLM response (structured): {response_text[:500]}...")

            # With response_mime_type="application/json", response should be valid JSON
            # But we still use repair as fallback for edge cases
            parsed_records, parse_success, parse_error = try_parse_json_with_repair(
                response_text,
                context=f"[HISTORY] Tentativa {attempt}"
            )

            if not parse_success:
                logger.warning(f"[HISTORY] Tentativa {attempt}: Failed to parse JSON response: {parse_error}")
                last_error = parse_error
                continue

            if isinstance(parsed_records, list):
                # Validate structure
                validated = []
                for record in parsed_records:
                    if isinstance(record, dict):
                        # Normalize date to YYYY-MM-DD if AI returned DD/MM/YYYY
                        raw_date = record.get('date', '')
                        if raw_date and '/' in raw_date:
                            parts = raw_date.split('/')
                            if len(parts) == 3:
                                d, m, y = parts
                                if len(y) == 4 and d.isdigit() and m.isdigit():
                                    raw_date = f"{y}-{m.zfill(2)}-{d.zfill(2)}"
                        validated.append({
                            'date': raw_date,
                            'chief_complaint': record.get('chief_complaint', ''),
                            'notes': record.get('notes', ''),
                            'diagnosis': record.get('diagnosis', ''),
                            'plan': record.get('plan', ''),
                            'provider': record.get('provider', '')
                        })

                logger.info(f"[HISTORY] Successfully parsed {len(validated)} consultation records (tentativa {attempt})")
                return validated if validated else None

            logger.warning(f"[HISTORY] Tentativa {attempt}: resposta não é uma lista JSON")
            last_error = "response is not a JSON array"

        except Exception as e:
            logger.error(f"[HISTORY] Tentativa {attempt}: Error parsing clinical history: {e}", exc_info=True)
            last_error = str(e)

    logger.error(f"[HISTORY] Todas as {max_attempts} tentativas falharam. Último erro: {last_error}")
    return None
