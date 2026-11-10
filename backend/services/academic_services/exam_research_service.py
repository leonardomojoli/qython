# qython/backend/services/academic_services/exam_research_service.py
"""Dossiê da prova/banca — pilar "Meus Concursos".

O Qython roda só com IA local, que não pesquisa na web. O dossiê é escrito pelo modelo a partir
do que o usuário informou (nome do concurso, descrição, banca, edital) e de uma amostra da
biblioteca, e SAI MARCADO como "sem fontes" (`grounded: False`): o usuário o revisa, edita e só
então o confirma para guiar a geração das provas. Texto do modelo sem fonte não deve passar por
fato: a tela avisa, e o prompt manda dizer o que NÃO se sabe.

Saída em markdown. O dossiê fica cacheado em `card.dossier`; depois de CONFIRMADO, vira
"perfil da banca" na geração.

Ver docs/ARENA_CUSTOM_EXAMS.md (§7 Pesquisa).
"""
import logging
from typing import Dict, Any, Optional

from .. import llm_types as types

from ..llm_services import client, _get_thinking_config_for_model, _log_call_cost
from ...config import Config

logger = logging.getLogger("qython_logger")


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
        "NOTAS (o Qython não pesquisa na web: escreva só com o que o usuário informou e com o que você sabe com segurança — seja conservador):"
    )

    return f"""Você é um especialista em concursos, residências e provas da área da saúde.
Monte um DOSSIÊ para guiar a criação de um simulado FIEL ao que essa prova costuma cobrar.

Prova/concurso: {exam_name}{desc_block}{sample_block}
{notes_header}
\"\"\"
{research_notes.strip()}
\"\"\"

IMPORTANTE:
- NÃO invente números de edital, datas, pesos ou regras que não estejam nas notas ou no contexto do usuário — escreva "não informado" e siga.
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
edições passadas e referências que o usuário informou; escreva "não informado" quando não houver.
## Como montar um simulado fiel
recomendações práticas: proporção de casos clínicos, distribuição de temas, armadilhas típicas da banca.
## Exemplos no estilo da banca
2 a 3 questões CURTAS de exemplo, escritas por você IMITANDO o formato e o estilo típicos desta prova (não precisam ser questões reais literais). Mostre como a banca costuma formular o enunciado e as alternativas.

Seja específico e conciso. Se a prova for pouco documentada, seja honesto sobre o que NÃO se sabe e oriente-se pela área/nível."""


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
    """Escreve o dossiê (sem busca na web) e devolve {synthesis, sources, queries, grounded, model}. Sem `confirmed`/`researched_at`
    (a rota seta). É BLOQUEANTE — chamar via run_in_threadpool."""
    model = Config.CHAT_LLM_MODEL or 'local'

    # Sem busca na web: o dossiê sai do que o usuário informou (e da amostra da biblioteca).
    notes = '(sem busca na web: use só o que o usuário informou)'
    synthesis = _write_dossier(
        model,
        _write_prompt(exam_name, description, language, content_sample, notes, False),
    )
    if not synthesis:
        synthesis = notes

    logger.info(f"[EXAM_RESEARCH] '{exam_name[:60]}' sem fontes (IA local) dossier_len={len(synthesis)}")

    return {
        'synthesis': synthesis,
        'sources': [],
        'queries': [],
        'grounded': False,
        'model': model,
    }
