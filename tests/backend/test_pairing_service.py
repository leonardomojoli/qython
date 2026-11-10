# tests/backend/test_pairing_service.py
"""Lógica pura do pareamento (backend/services/pairing_service.py), sem banco.

Rode direto (não há pytest neste repositório):
    python3 tests/backend/test_pairing_service.py

O fluxo contra um backend de verdade, com banco, está em test_pairing_flow.py.
"""
import os
import sys
from datetime import timedelta

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, ROOT)
os.environ.setdefault('JWT_SECRET_KEY', 'x' * 40)
os.environ.setdefault('DATABASE_URL', 'postgresql://u:p@127.0.0.1:1/db')
os.environ.setdefault('QYTHON_ALLOW_EPHEMERAL_KEK', '1')

from backend.services import pairing_service as ps  # noqa: E402


def test_codigo_tem_oito_caracteres_do_alfabeto_sem_ambiguos():
    for _ in range(200):
        code = ps.new_code()
        assert len(code) == 8 and set(code) <= set(ps.CODE_ALPHABET), code
    assert not set('01OI') & set(ps.CODE_ALPHABET), 'o alfabeto não pode ter 0, O, 1 nem I'


def test_codigos_nao_se_repetem_em_uma_amostra_grande():
    assert len({ps.new_code() for _ in range(5000)}) == 5000


def test_normalizacao_aceita_como_o_medico_digita():
    assert ps.normalize_code('abcd-efgh') == 'ABCDEFGH'
    assert ps.normalize_code(' ABCD EFGH\n') == 'ABCDEFGH'
    assert ps.normalize_code('ab.cd_ef gh') == 'ABCDEFGH'
    assert ps.normalize_code(None) == '' and ps.normalize_code('') == ''


def test_formato_de_exibicao_tem_hifen_no_meio():
    assert ps.format_code('ABCDEFGH') == 'ABCD-EFGH'
    assert ps.normalize_code(ps.format_code('ABCDEFGH')) == 'ABCDEFGH'


def test_hash_e_estavel_e_nao_guarda_o_segredo():
    h = ps.hash_secret('ABCDEFGH')
    assert h == ps.hash_secret('ABCDEFGH') and len(h) == 64 and 'ABCDEFGH' not in h
    assert h != ps.hash_secret('ABCDEFGI')


def test_validade_do_codigo_e_de_poucos_minutos():
    assert timedelta(minutes=1) <= ps.CODE_TTL <= timedelta(minutes=10)


def test_nome_do_aparelho_e_limpo_e_limitado():
    assert ps._clean_name('  Pixel   7  de  Maria ') == 'Pixel 7 de Maria'
    assert ps._clean_name('') == 'Celular' and ps._clean_name(None) == 'Celular'
    assert len(ps._clean_name('x' * 500)) == ps.DEVICE_NAME_MAX


if __name__ == '__main__':
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith('test_') and callable(fn):
            try:
                fn()
                print(f'ok   {name}')
            except Exception as exc:  # noqa: BLE001
                failed += 1
                print(f'FAIL {name}: {type(exc).__name__}: {exc}')
    sys.exit(1 if failed else 0)
