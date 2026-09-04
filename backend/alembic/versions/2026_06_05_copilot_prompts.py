"""create copilot_prompts table (v2 suggestion pills, curate-without-deploy)

Revision ID: 2026_06_05_copilot_prompts
Revises: 2026_06_05_user_treatment
Create Date: 2026-06-05

Tabela `copilot_prompts`: pílulas de sugestão do copiloto servidas por
GET /api/copilot/suggested-prompts (curar sem deploy do front). `usage_count` +
evento UserActivity('suggested_prompt_click') alimentam o sinal de flywheel
(quais pílulas pegam). Seed inicial = as 8 pílulas que estavam fixas no front (v1).
"""
import datetime
from alembic import op
import sqlalchemy as sa


revision = '2026_06_05_copilot_prompts'
down_revision = '2026_06_05_user_treatment'
branch_labels = None
depends_on = None


_SEED = [
    {
        'slug': 'study-schedule', 'category': 'academico', 'icon': '📅',
        'label_key': 'pillStudySchedule', 'label': 'Montar cronograma de estudos',
        'opener': 'Quero montar um cronograma de estudos para a prova de residência. Me pergunte o que precisar — data da prova, horas disponíveis por dia e as matérias em que estou mais fraco — e monte um plano realista com revisão espaçada.',
    },
    {
        'slug': 'pcr', 'category': 'pronto_socorro', 'icon': '🫀',
        'label_key': 'pillPcr', 'label': 'Conduta na PCR',
        'opener': 'Me conduza passo a passo no atendimento de uma parada cardiorrespiratória (ACLS): ritmos chocáveis e não chocáveis, drogas, doses e o ciclo de RCP. Pergunte o cenário se precisar.',
    },
    {
        'slug': 'sepsis', 'category': 'pronto_socorro', 'icon': '🦠',
        'label_key': 'pillSepsis', 'label': 'Manejo da sepse no PS',
        'opener': 'Me ajude com o manejo inicial da sepse e do choque séptico no pronto-socorro: identificação, pacote da primeira hora, antibiótico empírico e ressuscitação volêmica. Pergunte o caso se precisar.',
    },
    {
        'slug': 'preop', 'category': 'cirurgico', 'icon': '🩺',
        'label_key': 'pillPreop', 'label': 'Checklist pré-operatório',
        'opener': 'Monte comigo a avaliação pré-operatória do paciente. Pergunte idade, comorbidades e o porte da cirurgia para estratificar o risco cardiovascular e definir a propedêutica.',
    },
    {
        'slug': 'ecg', 'category': 'clinica', 'icon': '📈',
        'label_key': 'pillEcg', 'label': 'Interpretar um ECG',
        'opener': 'Vou te descrever (ou anexar) um ECG. Me guie numa leitura sistemática — ritmo, frequência, eixo, intervalos e alterações — e me diga as hipóteses diagnósticas.',
    },
    {
        'slug': 'differential', 'category': 'clinica', 'icon': '🩻',
        'label_key': 'pillDdx', 'label': 'Diagnóstico diferencial',
        'opener': 'Vou te dar um quadro clínico e quero construir o diagnóstico diferencial. Pergunte os dados que faltarem e me ajude a priorizar as hipóteses por probabilidade e gravidade.',
    },
    {
        'slug': 'drug-dose', 'category': 'clinica', 'icon': '💊',
        'label_key': 'pillDrugDose', 'label': 'Dose e ajuste de fármaco',
        'opener': 'Preciso da dose de um fármaco com ajuste para o paciente (função renal/hepática, peso, idade). Me diga qual é a droga e o contexto e me ajude com a posologia.',
    },
    {
        'slug': 'library', 'category': 'biblioteca', 'icon': '📚',
        'label_key': 'pillLibrary', 'label': 'Me testar pela minha biblioteca',
        'opener': 'Quero estudar o conteúdo da minha biblioteca. Me faça perguntas sobre os materiais que subi, uma de cada vez, para testar e fixar meu conhecimento.',
    },
]


def upgrade():
    op.create_table(
        'copilot_prompts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('slug', sa.String(50), nullable=False),
        sa.Column('category', sa.String(30), nullable=True),
        sa.Column('icon', sa.String(16), nullable=True),
        sa.Column('label_key', sa.String(60), nullable=True),
        sa.Column('label', sa.String(120), nullable=False),
        sa.Column('opener', sa.Text(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('weight', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('usage_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_copilot_prompts_slug', 'copilot_prompts', ['slug'], unique=True)
    op.create_index('ix_copilot_prompts_category', 'copilot_prompts', ['category'])
    op.create_index('ix_copilot_prompts_is_active', 'copilot_prompts', ['is_active'])
    op.create_index('ix_copilot_prompts_active_sort', 'copilot_prompts', ['is_active', 'sort_order'])

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
    for i, p in enumerate(_SEED):
        rows.append({
            **p,
            'is_active': True,
            'sort_order': i,
            'weight': 1,
            'usage_count': 0,
            'created_at': now,
            'updated_at': now,
        })
    op.bulk_insert(prompts, rows)


def downgrade():
    op.drop_table('copilot_prompts')
