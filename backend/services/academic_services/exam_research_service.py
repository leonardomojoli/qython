# qython/backend/services/academic_services/exam_research_service.py
"""Pesquisa standalone da prova/banca (dossiê) — pilar "Meus Concursos".

DUAS chamadas (busca → redação), porque medido ao vivo (jul/2026): o prompt GRANDE de
redação estruturada com Google Search grounda só ~1/3 das vezes (a busca vira acessório
de uma tarefa de escrita e o modelo a pula; com amostra de biblioteca no contexto, 0/2) —
enquanto um prompt curto cuja ÚNICA tarefa é buscar grounda 4/4.

1) BUSCA (grounded, prompt mínimo): coleta notas cruas + FONTES reais do grounding;
   retry único com diretiva dura se vier sem nenhuma busca.
2) REDAÇÃO (sem tools): estrutura o dossiê em markdown a partir das notas + contexto.

Saída em markdown — NÃO JSON: schema/JSON estrito também SUPRIME o grounding. O dossiê
fica cacheado em `card.dossier`; depois de CONFIRMADO, vira "perfil da banca" na geração.

Ver docs/ARENA_CUSTOM_EXAMS.md (§7 Pesquisa).
"""
import logging
from typing import Dict, Any, List, Optional

from google.genai import types

from ..llm_services import client, _get_thinking_config_for_model, _log_call_cost
from ...config import Config

logger = logging.getLogger("qython_logger")


def _search_prompt(exam_name: str, description: Optional[str]) -> str:
    """Prompt CURTO cuja única tarefa é BUSCAR — assim o grounding dispara de forma
    confiável (medido: 4/4 vs ~1/3 do prompt de redação). Sem amostra de biblioteca
    aqui (contexto rico suprime a busca)."""
    hints = f"\nPistas do usuário (banca, cargo, edital): {description}\n" if description else ""
    return f"""Pesquise na web sobre esta prova/concurso da área da saúde:

{exam_name}{hints}
Execute VÁRIAS buscas (banca + cargo, edital, provas anteriores, estilo das questões da banca, relatos de candidatos) e liste em NOTAS CRUAS tudo de relevante que encontrar: formato da prova, nº de questões/alternativas, duração, pesos, temas mais cobrados, estilo de cobrança da banca, edições passadas. Cite de onde veio cada achado. NÃO invente o que não encontrar — anote "não encontrado" e siga."""


def _write_prompt(exam_name: str, description: Optional[str], language: str,
                  content_sample: Optional[str], research_notes: str, grounded: bool) -> str:
    lang_line = {
        'en': "Write the dossier in English.",
        'es': "Escribe el dosier en español.",
    }.get((language or 'pt-BR')[:2], "Escreva o dossiê em português do Brasil.")

    desc_block = f"\nContexto dado pelo usuário: {description}\n" if description else ""
    sample_block = ""
    if content_sample and content_sample.strip():
        sample_block = (
            "\nAmostra do material que o usuário reuniu para estudar (serve só para você entender a "
            "ÁREA/assunto — NÃO é a prova em si):\n\"\"\"\n" + content_sample[:2000].strip() + "\n\"\"\"\n"
        )
    notes_header = (
        "NOTAS DA PESQUISA NA WEB (sua fonte primária — baseie o dossiê nelas):"
        if grounded else
        "NOTAS (a busca na web NÃO retornou fontes; estas notas vêm do conhecimento do modelo — seja conservador):"
    )

    return f"""Você é um especialista em concursos, residências e provas da área da saúde.
Monte um DOSSIÊ para guiar a criação de um simulado FIEL ao que essa prova costuma cobrar.

Prova/concurso: {exam_name}{desc_block}{sample_block}
{notes_header}
\"\"\"
{research_notes.strip()}
\"\"\"

IMPORTANTE:
- NÃO invente números de edital, datas, pesos ou regras que não estejam nas notas ou no contexto do usuário — escreva "não encontrado" e siga.
- Se as notas divergirem do contexto do usuário, o contexto do usuário (edital em mãos) prevalece.
- {lang_line}

Estruture o dossiê em MARKDOWN com EXATAMENTE estas seções (mantenha os títulos):
## Formato da prova
nº de questões, objetiva/discursiva, nº de alternativas, duração, pesos — o que houver.
## Estilo das questões
como a banca cobra: casos clínicos/vinhetas? memorização? interpretação? nível de dificuldade; descreva o estilo.
## Temas e assuntos mais cobrados
liste os tópicos/áreas com maior incidência, do mais para o menos cobrado.
## Provas anteriores e referências
edições passadas e fontes encontradas na pesquisa.
## Como montar um simulado fiel
recomendações práticas: proporção de casos clínicos, distribuição de temas, armadilhas típicas da banca.
## Exemplos no estilo da banca
2 a 3 questões CURTAS de exemplo, escritas por você IMITANDO o formato e o estilo típicos desta prova (não precisam ser questões reais literais). Mostre como a banca costuma formular o enunciado e as alternativas.

Seja específico e conciso. Se a prova for pouco documentada, seja honesto sobre o que NÃO se sabe e oriente-se pela área/nível."""


def _run_grounded_call(model: str, prompt: str) -> Dict[str, Any]:
    """Uma chamada grounded; devolve {synthesis, sources, queries, grounded}."""
    tools = [types.Tool(google_search=types.GoogleSearch())]
    cfg = types.GenerateContentConfig(
        temperature=0.5,
        max_output_tokens=3072,
        tools=tools,
        thinking_config=_get_thinking_config_for_model(model, 'medium'),
    )
    response = client.models.generate_content(
        model=f'models/{model}',
        contents=prompt,
        config=cfg,
    )

    synthesis = (getattr(response, 'text', None) or '').strip()

    sources: List[Dict[str, str]] = []
    queries: List[str] = []
    seen = set()
    try:
        candidates = getattr(response, 'candidates', None) or []
        if candidates:
            gm = getattr(candidates[0], 'grounding_metadata', None)
            if gm:
                for chunk in (getattr(gm, 'grounding_chunks', None) or []):
                    web = getattr(chunk, 'web', None)
                    uri = getattr(web, 'uri', None) if web else None
                    if uri and uri not in seen:
                        seen.add(uri)
                        sources.append({'uri': uri, 'title': (getattr(web, 'title', None) or '')})
                queries = [q for q in (getattr(gm, 'web_search_queries', None) or []) if q]
    except Exception as e:  # extração de grounding nunca deve derrubar a pesquisa
        logger.warning(f"[EXAM_RESEARCH] falha ao extrair grounding: {e}")

    try:
        _log_call_cost('exam_research', model, getattr(response, 'usage_metadata', None))
    except Exception:
        pass

    return {
        'synthesis': synthesis,
        'sources': sources,
        'queries': queries,
        'grounded': bool(sources or queries),
    }


def _write_dossier(model: str, prompt: str) -> str:
    """Chamada de REDAÇÃO (sem tools — nada de grounding para suprimir aqui)."""
    cfg = types.GenerateContentConfig(
        temperature=0.5,
        max_output_tokens=3072,
        thinking_config=_get_thinking_config_for_model(model, 'medium'),
    )
    response = client.models.generate_content(
        model=f'models/{model}',
        contents=prompt,
        config=cfg,
    )
    try:
        _log_call_cost('exam_research_write', model, getattr(response, 'usage_metadata', None))
    except Exception:
        pass
    return (getattr(response, 'text', None) or '').strip()


def research_exam_dossier(
    exam_name: str,
    description: Optional[str] = None,
    language: str = 'pt-BR',
    content_sample: Optional[str] = None,
) -> Dict[str, Any]:
    """Pesquisa em DUAS etapas (busca grounded → redação sem tools) e devolve o dossiê
    {synthesis, sources, queries, grounded, model}. Sem `confirmed`/`researched_at`
    (a rota seta). É BLOQUEANTE — chamar via run_in_threadpool."""
    model = Config.CHAT_LLM_MODEL or 'gemini-3.1-flash-lite'

    # Etapa 1 — BUSCA (prompt mínimo, tarefa única). Retry único se vier sem busca.
    search = _run_grounded_call(model, _search_prompt(exam_name, description))
    if not search['grounded']:
        logger.info(f"[EXAM_RESEARCH] '{exam_name[:60]}' busca sem grounding — retry com diretiva dura")
        retry = _run_grounded_call(
            model,
            _search_prompt(exam_name, description)
            + "\n\nATENÇÃO: sua tentativa anterior NÃO executou NENHUMA busca e respondeu de memória. "
              "Execute as buscas (Google Search) AGORA e liste apenas o que encontrar nelas.",
        )
        if retry['grounded'] or (not search['synthesis'] and retry['synthesis']):
            search = retry

    grounded = search['grounded']
    notes = search['synthesis'] or '(a busca não retornou notas)'

    # Etapa 2 — REDAÇÃO estruturada a partir das notas (+ contexto do usuário).
    synthesis = _write_dossier(
        model,
        _write_prompt(exam_name, description, language, content_sample, notes, grounded),
    )
    if not synthesis:
        synthesis = notes  # fallback: melhor as notas cruas do que nada

    logger.info(f"[EXAM_RESEARCH] '{exam_name[:60]}' grounded={grounded} sources={len(search['sources'])} queries={len(search['queries'])} dossier_len={len(synthesis)}")

    return {
        'synthesis': synthesis,
        'sources': search['sources'][:12],
        'queries': search['queries'],
        'grounded': grounded,
        'model': model,
    }
