"""separa ACESSO de verificação (access_granted) + flag de onboarding_completed

Revision ID: 2026_06_18_access_onboarding
Revises: 2026_06_16_mat_library_id
Create Date: 2026-06-18

Decoupling de ACESSO × VERIFICAÇÃO. A verificação de identidade é do Latreo (única
fonte de verdade — o Qython nunca a forja). `access_granted` é a política de ACESSO
do Qython: libera o uso das features de IA sem afirmar que o usuário é Latreo-
verificado (admin concede; permite abrir a plataforma a não-verificados). Acesso
efetivo = is_admin OR verification_status=='verified' OR access_granted.

`onboarding_completed` rastreia se o usuário passou (ou pulou) o wizard de onboarding,
para que convidados via admin (que entram já 'active') também sejam roteados ao
onboarding em vez de cair direto no /copilot.

Backfill: usuários EXISTENTES recebem onboarding_completed=true (não disrompe quem já
usa o app); access_granted fica false para todos (verificados seguem com acesso via
o check de verification_status; ninguém perde acesso).
"""
from alembic import op
import sqlalchemy as sa


revision = '2026_06_18_access_onboarding'
down_revision = '2026_06_16_mat_library_id'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('access_granted', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('users', sa.Column('onboarding_completed', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    # Backfill: usuários existentes já passaram (ou não precisam) do onboarding —
    # evita yank pro wizard de quem já está usando o app. Só novos cadastros (default
    # false) entram no fluxo de onboarding.
    op.execute("UPDATE users SET onboarding_completed = true")


def downgrade():
    op.drop_column('users', 'onboarding_completed')
    op.drop_column('users', 'access_granted')
