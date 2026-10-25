"""Prompts sugeridos do copiloto (as "pílulas" da tela inicial do chat).

Até aqui eles só existiam dentro de duas migrations (2026_06_05_copilot_prompts e
2026_06_05_more_pills). Instalação nova cria o schema pelos modelos, sem rodar
migrations, e ficava com o copiloto sem nenhuma sugestão. Os dados foram
extraídos de lá sem alteração, com o mesmo sort_order.

Semeia só com a tabela vazia: inserir "o que faltar" faria voltar, a cada boot,
um prompt que o usuário apagou de propósito.
"""
import logging
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import CopilotPrompt

logger = logging.getLogger("qython_logger")

PROMPTS = [{'slug': 'study-schedule',
  'category': 'academico',
  'icon': '📅',
  'label_key': 'pillStudySchedule',
  'label': 'Montar cronograma de estudos',
  'opener': 'Quero montar um cronograma de estudos para a prova de residência. Me pergunte o que precisar — '
            'data da prova, horas disponíveis por dia e as matérias em que estou mais fraco — e monte um '
            'plano realista com revisão espaçada.',
  'sort_order': 0},
 {'slug': 'pcr',
  'category': 'pronto_socorro',
  'icon': '🫀',
  'label_key': 'pillPcr',
  'label': 'Conduta na PCR',
  'opener': 'Me conduza passo a passo no atendimento de uma parada cardiorrespiratória (ACLS): ritmos '
            'chocáveis e não chocáveis, drogas, doses e o ciclo de RCP. Pergunte o cenário se precisar.',
  'sort_order': 1},
 {'slug': 'sepsis',
  'category': 'pronto_socorro',
  'icon': '🦠',
  'label_key': 'pillSepsis',
  'label': 'Manejo da sepse no PS',
  'opener': 'Me ajude com o manejo inicial da sepse e do choque séptico no pronto-socorro: identificação, '
            'pacote da primeira hora, antibiótico empírico e ressuscitação volêmica. Pergunte o caso se '
            'precisar.',
  'sort_order': 2},
 {'slug': 'preop',
  'category': 'cirurgico',
  'icon': '🩺',
  'label_key': 'pillPreop',
  'label': 'Checklist pré-operatório',
  'opener': 'Monte comigo a avaliação pré-operatória do paciente. Pergunte idade, comorbidades e o porte da '
            'cirurgia para estratificar o risco cardiovascular e definir a propedêutica.',
  'sort_order': 3},
 {'slug': 'ecg',
  'category': 'clinica',
  'icon': '📈',
  'label_key': 'pillEcg',
  'label': 'Interpretar um ECG',
  'opener': 'Vou te descrever (ou anexar) um ECG. Me guie numa leitura sistemática — ritmo, frequência, '
            'eixo, intervalos e alterações — e me diga as hipóteses diagnósticas.',
  'sort_order': 4},
 {'slug': 'differential',
  'category': 'clinica',
  'icon': '🩻',
  'label_key': 'pillDdx',
  'label': 'Diagnóstico diferencial',
  'opener': 'Vou te dar um quadro clínico e quero construir o diagnóstico diferencial. Pergunte os dados que '
            'faltarem e me ajude a priorizar as hipóteses por probabilidade e gravidade.',
  'sort_order': 5},
 {'slug': 'drug-dose',
  'category': 'clinica',
  'icon': '💊',
  'label_key': 'pillDrugDose',
  'label': 'Dose e ajuste de fármaco',
  'opener': 'Preciso da dose de um fármaco com ajuste para o paciente (função renal/hepática, peso, idade). '
            'Me diga qual é a droga e o contexto e me ajude com a posologia.',
  'sort_order': 6},
 {'slug': 'library',
  'category': 'biblioteca',
  'icon': '📚',
  'label_key': 'pillLibrary',
  'label': 'Me testar pela minha biblioteca',
  'opener': 'Quero estudar o conteúdo da minha biblioteca. Me faça perguntas sobre os materiais que subi, '
            'uma de cada vez, para testar e fixar meu conhecimento.',
  'sort_order': 7},
 {'slug': 'discussao',
  'category': 'clinica',
  'icon': '🧠',
  'label_key': 'pillDiscussion',
  'label': 'Discussão clínica de caso',
  'opener': 'Quero discutir um caso clínico com você como uma conversa socrática: me faça perguntas, '
            'questione meu raciocínio e vamos construir o diagnóstico e a conduta juntos, passo a passo. Vou '
            'te apresentar o caso.',
  'sort_order': 8},
 {'slug': 'drug-interaction',
  'category': 'clinica',
  'icon': '⚠️',
  'label_key': 'pillDrugInteraction',
  'label': 'Interação medicamentosa',
  'opener': 'Quero checar interações medicamentosas. Vou te listar os fármacos do paciente — me diga as '
            'interações relevantes, o mecanismo, a gravidade e a conduta (ajuste, monitorização ou '
            'substituição).',
  'sort_order': 9},
 {'slug': 'lab-results',
  'category': 'clinica',
  'icon': '🧪',
  'label_key': 'pillLabResults',
  'label': 'Interpretar exames laboratoriais',
  'opener': 'Vou te passar resultados de exames laboratoriais. Me ajude a interpretá-los de forma '
            'sistemática, correlacionar com o quadro clínico e sugerir hipóteses e a próxima conduta. '
            'Pergunte o contexto se precisar.',
  'sort_order': 10},
 {'slug': 'clinical-score',
  'category': 'clinica',
  'icon': '🧮',
  'label_key': 'pillClinicalScore',
  'label': 'Calcular escore clínico',
  'opener': 'Quero calcular e interpretar um escore clínico (ex.: CHA2DS2-VASc, Wells, CURB-65, qSOFA, '
            'Glasgow). Me diga qual escore e me pergunte os dados que faltarem para chegar no resultado e na '
            'conduta.',
  'sort_order': 11},
 {'slug': 'empiric-abx',
  'category': 'pronto_socorro',
  'icon': '💉',
  'label_key': 'pillEmpiricAbx',
  'label': 'Antibiótico empírico',
  'opener': 'Me ajude a escolher o antibiótico empírico para uma infecção. Pergunte o foco infeccioso, a '
            'gravidade, o perfil do paciente e os fatores de risco para resistência, e sugira esquema, dose '
            'e tempo.',
  'sort_order': 12},
 {'slug': 'case-study',
  'category': 'academico',
  'icon': '🎯',
  'label_key': 'pillCaseStudy',
  'label': 'Caso clínico para treinar',
  'opener': 'Crie um caso clínico para eu treinar raciocínio diagnóstico. Me apresente o caso por partes, me '
            'faça as perguntas de conduta uma de cada vez e dê feedback do meu raciocínio ao final. Pergunte '
            'a área/tema se precisar.',
  'sort_order': 13},
 {'slug': 'anamnesis',
  'category': 'clinica',
  'icon': '📋',
  'label_key': 'pillAnamnesis',
  'label': 'Anamnese dirigida',
  'opener': 'Me ajude a conduzir uma anamnese dirigida para uma queixa. Me diga a queixa principal e eu te '
            'guio nas perguntas certas — sintomas associados, red flags e hipóteses — para fechar a '
            'história. Pergunte o que faltar.',
  'sort_order': 14}]


async def seed_copilot_prompts(db: AsyncSession) -> int:
    """Insere os prompts padrão se a tabela estiver vazia. Retorna quantos inseriu."""
    if await db.scalar(select(func.count()).select_from(CopilotPrompt)):
        return 0
    now = datetime.now(timezone.utc)
    db.add_all(
        CopilotPrompt(**p, is_active=True, weight=1, usage_count=0, created_at=now, updated_at=now)
        for p in PROMPTS
    )
    await db.commit()
    return len(PROMPTS)
