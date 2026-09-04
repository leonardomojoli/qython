# qython/backend/services/self_critique_service.py
"""
SELF-CRITIQUE SERVICE: Constitutional AI para respostas médicas.

Implementa auto-avaliação de respostas de IA contra princípios médicos
antes de entregar ao usuário. Baseado em Constitutional AI (Anthropic, 2023).

PRINCÍPIOS MÉDICOS (Medical Constitution):
1. Primum non nocere - Primeiro, não causar dano
2. Evidência científica - Baseado em guidelines atualizados
3. Completude clínica - Informações relevantes não omitidas
4. Clareza comunicativa - Linguagem apropriada ao contexto
5. Segurança do paciente - Alertas para red flags

FLUXO:
1. Resposta inicial gerada pelo LLM
2. Self-critique avalia contra princípios
3. Se necessário, resposta é refinada
4. Versão final entregue + score de confiança
"""

import logging
import os
import json
from typing import Tuple, Optional, Dict, Any
from google import genai
from google.genai import types
from ..config import Config

logger = logging.getLogger("qython_logger")

# Usar modelo rápido para critique (custo-efetivo)
CRITIQUE_MODEL = os.getenv("SIMPLE_TASK_LLM_MODEL", "gemini-2.5-flash-lite")

# Timeout para chamadas de critique
CRITIQUE_TIMEOUT = 30.0  # segundos

# Cliente para self-critique
http_options = types.HttpOptions(client_args={'timeout': CRITIQUE_TIMEOUT})
critique_client = genai.Client(api_key=Config.GEMINI_API_KEY, http_options=http_options)

# === CONSTITUTIONAL PRINCIPLES ===
MEDICAL_CONSTITUTION = """
## PRINCÍPIOS CONSTITUCIONAIS MÉDICOS (Medical Constitution)

Você é um revisor médico sênior. Avalie a resposta abaixo contra estes princípios:

### 1. PRIMUM NON NOCERE (Segurança)
- A resposta pode causar dano se seguida literalmente?
- Há recomendações de doses que podem ser perigosas?
- Faltam alertas sobre contraindicações críticas?
- Há sugestão de procedimento sem mencionar riscos relevantes?

### 2. EVIDÊNCIA CIENTÍFICA (Acurácia)
- As informações são consistentes com guidelines atualizados?
- Há afirmações que contradizem consenso médico?
- Doses e protocolos estão corretos?
- Referências citadas (se houver) são plausíveis?

### 3. COMPLETUDE CLÍNICA (Relevância)
- Informações críticas foram omitidas?
- Diagnósticos diferenciais importantes foram ignorados?
- Red flags que deveriam ser mencionadas estão ausentes?
- O contexto clínico foi adequadamente considerado?

### 4. CLAREZA COMUNICATIVA (Compreensão)
- A linguagem é apropriada para profissionais de saúde?
- Há ambiguidades que podem levar a erros?
- A estrutura facilita a compreensão rápida?
- Termos técnicos são usados corretamente?

### 5. ÉTICA MÉDICA (Profissionalismo)
- A resposta respeita autonomia do paciente?
- Há viés que pode prejudicar grupos específicos?
- O tom é profissional e respeitoso?
- Limites de competência são respeitados?
"""

CRITIQUE_PROMPT_TEMPLATE = """
{constitution}

## RESPOSTA A AVALIAR:
```
{response}
```

## CONTEXTO:
- Especialidade: {specialty}
- Tipo: {context_type}

## SUA TAREFA:
Avalie a resposta e retorne um JSON com a seguinte estrutura:

```json
{{
    "confidence_score": 0.0-1.0,
    "issues_found": [
        {{
            "principle": "nome_do_principio",
            "severity": "low|medium|high|critical",
            "description": "descrição breve do problema",
            "suggestion": "como corrigir"
        }}
    ],
    "requires_refinement": true/false,
    "refinement_instructions": "instruções para refinar a resposta (se necessário)",
    "overall_assessment": "breve avaliação geral"
}}
```

### REGRAS:
1. confidence_score: 0.95+ = excelente, 0.85-0.94 = bom, 0.70-0.84 = aceitável, <0.70 = precisa refinamento
2. Se não houver issues, retorne lista vazia
3. requires_refinement = true APENAS se houver issue com severity "high" ou "critical"
4. Seja criterioso - não marque issues menores como críticas
5. Responda APENAS com o JSON, sem texto adicional
"""

REFINEMENT_PROMPT_TEMPLATE = """
## RESPOSTA ORIGINAL:
```
{original_response}
```

## PROBLEMAS IDENTIFICADOS:
{issues}

## INSTRUÇÕES DE REFINAMENTO:
{instructions}

## SUA TAREFA:
Reescreva a resposta corrigindo os problemas identificados.
Mantenha todo o conteúdo válido e correto da resposta original.
Adicione ou corrija APENAS o que foi identificado como problemático.
Mantenha o mesmo formato e estrutura.
Responda APENAS com a resposta refinada, sem comentários adicionais.
"""


async def critique_response(
    response: str,
    specialty: str = "",
    context_type: str = "consultation"
) -> Dict[str, Any]:
    """
    Avalia uma resposta de IA contra os princípios médicos constitucionais.

    Args:
        response: A resposta gerada pelo LLM principal
        specialty: Especialidade médica do contexto
        context_type: Tipo de contexto (consultation, chat, summary, etc.)

    Returns:
        Dict com score de confiança, issues encontradas, e se precisa refinamento
    """
    try:
        prompt = CRITIQUE_PROMPT_TEMPLATE.format(
            constitution=MEDICAL_CONSTITUTION,
            response=response,
            specialty=specialty or "Geral",
            context_type=context_type
        )

        result = critique_client.models.generate_content(
            model=CRITIQUE_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.1,  # Baixa temperatura para consistência
                max_output_tokens=2048
            )
        )

        response_text = result.text.strip()

        # Extrair JSON da resposta
        if "```json" in response_text:
            json_start = response_text.find("```json") + 7
            json_end = response_text.find("```", json_start)
            response_text = response_text[json_start:json_end].strip()
        elif "```" in response_text:
            json_start = response_text.find("```") + 3
            json_end = response_text.find("```", json_start)
            response_text = response_text[json_start:json_end].strip()

        critique_result = json.loads(response_text)

        # Validar estrutura
        critique_result.setdefault("confidence_score", 0.85)
        critique_result.setdefault("issues_found", [])
        critique_result.setdefault("requires_refinement", False)
        critique_result.setdefault("refinement_instructions", "")
        critique_result.setdefault("overall_assessment", "")

        logger.info(f"[SELF-CRITIQUE] Score: {critique_result['confidence_score']}, "
                   f"Issues: {len(critique_result['issues_found'])}, "
                   f"Needs refinement: {critique_result['requires_refinement']}")

        return critique_result

    except json.JSONDecodeError as e:
        logger.warning(f"[SELF-CRITIQUE] Falha ao parsear JSON: {e}")
        return {
            "confidence_score": 0.80,
            "issues_found": [],
            "requires_refinement": False,
            "refinement_instructions": "",
            "overall_assessment": "Não foi possível avaliar automaticamente"
        }
    except Exception as e:
        logger.error(f"[SELF-CRITIQUE] Erro na avaliação: {e}")
        return {
            "confidence_score": 0.75,
            "issues_found": [],
            "requires_refinement": False,
            "refinement_instructions": "",
            "overall_assessment": f"Erro na avaliação: {str(e)}"
        }


async def refine_response(
    original_response: str,
    critique_result: Dict[str, Any],
    specialty: str = ""
) -> str:
    """
    Refina uma resposta baseado nos issues identificados pelo critique.

    Args:
        original_response: Resposta original que precisa refinamento
        critique_result: Resultado do critique com issues e instruções
        specialty: Especialidade médica

    Returns:
        Resposta refinada
    """
    try:
        issues_text = "\n".join([
            f"- [{issue['severity'].upper()}] {issue['principle']}: {issue['description']}"
            for issue in critique_result.get("issues_found", [])
        ])

        prompt = REFINEMENT_PROMPT_TEMPLATE.format(
            original_response=original_response,
            issues=issues_text or "Nenhum issue específico listado",
            instructions=critique_result.get("refinement_instructions", "Melhorar qualidade geral")
        )

        result = critique_client.models.generate_content(
            model=CRITIQUE_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.3,
                max_output_tokens=16384
            )
        )

        refined = result.text.strip()
        logger.info(f"[SELF-CRITIQUE] Resposta refinada com sucesso")
        return refined

    except Exception as e:
        logger.error(f"[SELF-CRITIQUE] Erro no refinamento: {e}")
        # Em caso de erro, retorna a original
        return original_response


async def evaluate_and_refine(
    response: str,
    specialty: str = "",
    context_type: str = "consultation",
    auto_refine: bool = True
) -> Tuple[str, Dict[str, Any]]:
    """
    Pipeline completo: avalia resposta e refina se necessário.

    Args:
        response: Resposta do LLM a avaliar
        specialty: Especialidade médica
        context_type: Tipo de contexto
        auto_refine: Se True, refina automaticamente quando necessário

    Returns:
        Tuple[resposta_final, critique_result]
    """
    # 1. Avaliar resposta
    critique_result = await critique_response(response, specialty, context_type)

    # 2. Refinar se necessário e auto_refine está ativo
    if auto_refine and critique_result.get("requires_refinement", False):
        refined_response = await refine_response(response, critique_result, specialty)
        critique_result["was_refined"] = True
        critique_result["original_response"] = response
        return refined_response, critique_result

    critique_result["was_refined"] = False
    return response, critique_result


def should_apply_critique(source_type: str) -> bool:
    """
    Determina se self-critique deve ser aplicado para um dado tipo de fonte.

    Critique é mais importante para:
    - Consultas médicas
    - Chat com perguntas de saúde
    - Resumos clínicos

    Menos importante para:
    - Transcrições
    - Dados administrativos
    """
    high_priority_sources = [
        'consultation_improvement',
        'consultation_raw_only',
        'chat_interaction',
        'summary',
        'clinical_reasoning'
    ]
    return source_type in high_priority_sources


# === MÉTRICAS PARA TREINAMENTO ===

def extract_critique_metrics(critique_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extrai métricas do critique para uso em treinamento.

    Estas métricas são valiosas para:
    - Filtrar dados de treino (alta confiança = melhor qualidade)
    - Curriculum learning (ordenar por dificuldade/confiança)
    - Análise de padrões de erro
    """
    return {
        "self_critique_score": critique_result.get("confidence_score", 0.0),
        "self_critique_issues_count": len(critique_result.get("issues_found", [])),
        "self_critique_was_refined": critique_result.get("was_refined", False),
        "self_critique_severity_max": max(
            [
                {"low": 1, "medium": 2, "high": 3, "critical": 4}.get(
                    issue.get("severity", "low"), 1
                )
                for issue in critique_result.get("issues_found", [])
            ],
            default=0
        )
    }
