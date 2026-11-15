"""apaga o que sobrou da edição hospedada: farmácias parceiras, receita compartilhada, ranking, desafios e temporadas

Revision ID: 2026_11_12_drop_hosted
Revises: 2026_11_11_drop_old_tables
Create Date: 2026-11-12

O Qython deixou de ter rede de farmácias parceiras, link público de receita, ranking, ligas, desafios entre
usuários e temporadas: tudo isso dependia de um servidor central com muita gente. O código saiu do backend, do
web e do celular; esta migration apaga as tabelas e as colunas que sobraram.

  pharmacy_prescriptions, prescription_shares, pharmacy_medications, pharmacies, pharmacy_chains,
  pharmacy_waitlist
      a rede de farmácias, o envio de receita a ela e o link público da receita;
  arena_challenges, season_rankings, arena_seasons
      desafios, ranking por temporada e as próprias temporadas;
  user_xp_profiles.season_xp, league_tier, season_id, season_rank, season_percentile
  xp_transactions.season_id, challenge_id
      colunas que só serviam a eles (o XP total e a sequência de dias continuam).

É destrutivo e não tem volta. `IF EXISTS` porque bancos criados pelos modelos depois desta mudança já nascem
sem nada disso.
"""
from alembic import op


revision = '2026_11_12_drop_hosted'
down_revision = '2026_11_11_drop_old_tables'
branch_labels = None
depends_on = None


COLUMNS = {
    'user_xp_profiles': ['season_xp', 'league_tier', 'season_id', 'season_rank', 'season_percentile'],
    'xp_transactions': ['season_id', 'challenge_id'],
}

# Quem tem chave estrangeira para outra tabela da lista vem antes dela.
TABLES = [
    'pharmacy_prescriptions',
    'prescription_shares',
    'pharmacy_medications',
    'pharmacies',
    'pharmacy_chains',
    'pharmacy_waitlist',
    'arena_challenges',
    'season_rankings',
    'arena_seasons',
]


def upgrade():
    for table, columns in COLUMNS.items():
        for column in columns:
            op.execute(f'ALTER TABLE IF EXISTS {table} DROP COLUMN IF EXISTS {column} CASCADE')
    for table in TABLES:
        op.execute(f'DROP TABLE IF EXISTS {table} CASCADE')


def downgrade():
    # Os dados foram apagados de propósito; não há o que recriar.
    pass
