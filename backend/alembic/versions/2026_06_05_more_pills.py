"""seed mais pílulas do copiloto (Discussão Clínica + variedade p/ rotação)

Revision ID: 2026_06_05_more_pills
Revises: 2026_06_05_copilot_prompts
Create Date: 2026-06-05

Insere 7 pílulas novas em copilot_prompts (sort_order 8..14): a "Discussão Clínica"
(que era um toggle no input, agora prompt-driven) + 6 sugestões clínicas distintas
p/ enriquecer a rotação do empty-state. Sincronizado com as listas-fallback embutidas
(copilotPrompts.js / copilotPrompts.ts).
"""
import datetime
from alembic import op
import sqlalchemy as sa


revision = '2026_06_05_more_pills'
down_revision = '2026_06_05_copilot_prompts'
branch_labels = None
depends_on = None


_NEW = [
    {
        'slug': 'discussao', 'category': 'clinica', 'icon': '🧠',
        'label_key': 'pillDiscussion', 'label': 'Discussão clínica de caso',
        'opener': 'Quero discutir um caso clínico com você como uma conversa socrática: me faça perguntas, questione meu raciocínio e vamos construir o diagnóstico e a conduta juntos, passo a passo. Vou te apresentar o caso.',
    },
    {
        'slug': 'drug-interaction', 'category': 'clinica', 'icon': '⚠️',
        'label_key': 'pillDrugInteraction', 'label': 'Interação medicamentosa',
        'opener': 'Quero checar interações medicamentosas. Vou te listar os fármacos do paciente — me diga as interações relevantes, o mecanismo, a gravidade e a conduta (ajuste, monitorização ou substituição).',
    },
    {
        'slug': 'lab-results', 'category': 'clinica', 'icon': '🧪',
        'label_key': 'pillLabResults', 'label': 'Interpretar exames laboratoriais',
        'opener': 'Vou te passar resultados de exames laboratoriais. Me ajude a interpretá-los de forma sistemática, correlacionar com o quadro clínico e sugerir hipóteses e a próxima conduta. Pergunte o contexto se precisar.',
    },
    {
        'slug': 'clinical-score', 'category': 'clinica', 'icon': '🧮',
        'label_key': 'pillClinicalScore', 'label': 'Calcular escore clínico',
        'opener': 'Quero calcular e interpretar um escore clínico (ex.: CHA2DS2-VASc, Wells, CURB-65, qSOFA, Glasgow). Me diga qual escore e me pergunte os dados que faltarem para chegar no resultado e na conduta.',
    },
    {
        'slug': 'empiric-abx', 'category': 'pronto_socorro', 'icon': '💉',
        'label_key': 'pillEmpiricAbx', 'label': 'Antibiótico empírico',
        'opener': 'Me ajude a escolher o antibiótico empírico para uma infecção. Pergunte o foco infeccioso, a gravidade, o perfil do paciente e os fatores de risco para resistência, e sugira esquema, dose e tempo.',
    },
    {
        'slug': 'case-study', 'category': 'academico', 'icon': '🎯',
        'label_key': 'pillCaseStudy', 'label': 'Caso clínico para treinar',
        'opener': 'Crie um caso clínico para eu treinar raciocínio diagnóstico. Me apresente o caso por partes, me faça as perguntas de conduta uma de cada vez e dê feedback do meu raciocínio ao final. Pergunte a área/tema se precisar.',
    },
    {
        'slug': 'anamnesis', 'category': 'clinica', 'icon': '📋',
        'label_key': 'pillAnamnesis', 'label': 'Anamnese dirigida',
        'opener': 'Me ajude a conduzir uma anamnese dirigida para uma queixa. Me diga a queixa principal e eu te guio nas perguntas certas — sintomas associados, red flags e hipóteses — para fechar a história. Pergunte o que faltar.',
    },
]


def upgrade():
    now = datetime.datetime.now(datetime.timezone.utc)
    prompts = sa.table(
        'copilot_prompts',
        sa.column('slug', sa.String),
        sa.column('category', sa.String),
        sa.column('icon', sa.String),
        sa.column('label_key', sa.String),
        sa.column('label', sa.String),
        sa.column('opener', sa.Text),
        sa.column('is_active', sa.Boolean),
        sa.column('sort_order', sa.Integer),
        sa.column('weight', sa.Integer),
        sa.column('usage_count', sa.Integer),
        sa.column('created_at', sa.DateTime(timezone=True)),
        sa.column('updated_at', sa.DateTime(timezone=True)),
    )
    rows = []
    for i, p in enumerate(_NEW):
        rows.append({
            **p,
            'is_active': True,
            'sort_order': 8 + i,
            'weight': 1,
            'usage_count': 0,
            'created_at': now,
            'updated_at': now,
        })
    op.bulk_insert(prompts, rows)


def downgrade():
    slugs = tuple(p['slug'] for p in _NEW)
    op.execute(
        sa.text("DELETE FROM copilot_prompts WHERE slug IN :slugs").bindparams(
            sa.bindparam('slugs', value=slugs, expanding=True)
        )
    )
