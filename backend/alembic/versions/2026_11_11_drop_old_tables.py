"""apaga as tabelas dos recursos que saíram com o fim do SaaS

Revision ID: 2026_11_11_drop_old_tables
Revises: 2026_11_10_summaries
Create Date: 2026-11-11

O Qython deixou de coletar dados de treinamento, de cobrar e de pedir 👍/👎 (os avisos viram issues no
GitHub). O código foi embora, mas as tabelas ficaram nos bancos que já estavam de pé. Esta migration
apaga as que só serviam a esses recursos:

  training_data, preference_data, refinement_chains, quality_snapshots, dataset_export_logs
      coleta para treinar modelo (guardava cópia de notas, conversas e provas);
  transactions, dracma_ledger, payment_waitlist
      cobrança, saldo de dracmas e lista de espera de plano pago;
  feedback
      o 👍/👎 com o texto original da resposta;
  server_metrics
      monitor de servidor da edição hospedada.

É destrutivo e não tem volta: os dados somem. `IF EXISTS` porque bancos criados pelos modelos depois
desta mudança nem chegam a ter essas tabelas. Colunas soltas em outras tabelas (por exemplo
`users.training_data_opt_out` e os `training_data_id` dos jobs de material) ficam como estão; são só
inteiros e datas sem chave estrangeira.
"""
from alembic import op


revision = '2026_11_11_drop_old_tables'
down_revision = '2026_11_10_summaries'
branch_labels = None
depends_on = None


# Quem tem chave estrangeira para outra tabela da lista vem antes dela.
TABLES = [
    'dracma_ledger',       # -> transactions
    'refinement_chains',   # -> training_data
    'transactions',
    'training_data',
    'preference_data',
    'quality_snapshots',
    'dataset_export_logs',
    'payment_waitlist',
    'feedback',
    'server_metrics',
]


def upgrade():
    for table in TABLES:
        op.execute(f'DROP TABLE IF EXISTS {table} CASCADE')


def downgrade():
    # Os dados foram apagados de propósito; não há o que recriar.
    pass
