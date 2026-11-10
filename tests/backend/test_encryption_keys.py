# tests/backend/test_encryption_keys.py
"""Testes de onde o backend busca as chaves de criptografia (backend/services/encryption_service.py).

Rode direto (não há pytest neste repositório):
    python3 tests/backend/test_encryption_keys.py

Na instalação Docker, as chaves não ficam no .env: se QYTHON_FIELD_KEK e QYTHON_TOKEN_KEK não
estiverem lá, o backend as gera na primeira vez e as guarda no arquivo QYTHON_KEYS_FILE (um volume).
Sem isso, salvar o primeiro paciente quebrava ("QYTHON_FIELD_KEK is not set"). O que importa:
  - sem env e sem arquivo configurado, continua falhando com a mensagem clara (nada gerado em silêncio);
  - com o arquivo: as chaves são criadas (0600), reaproveitadas no restart e o que foi cifrado antes abre;
  - as chaves do env têm prioridade e o arquivo nem é criado;
  - vários processos criando ao mesmo tempo (os workers do gunicorn) acabam com as MESMAS chaves;
  - arquivo ilegível é erro claro, e não chaves novas por cima das antigas.
"""
import importlib.util
import json
import os
import stat
import sys
import tempfile
import threading

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
KEYS = ('QYTHON_FIELD_KEK', 'QYTHON_TOKEN_KEK', 'QYTHON_KEYS_FILE', 'QYTHON_ALLOW_EPHEMERAL_KEK')


def load():
    path = os.path.join(ROOT, 'backend', 'services', 'encryption_service.py')
    spec = importlib.util.spec_from_file_location('encryption_service', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


es = load()


def fresh(env):
    """Estado limpo do módulo e do ambiente para um teste."""
    for k in KEYS:
        os.environ.pop(k, None)
    os.environ.update(env)
    es._field_cipher = None
    es._token_kek = None


def test_sem_env_e_sem_arquivo_falha_com_mensagem_clara():
    fresh({})
    try:
        es.encrypt_value('12345678900')
    except RuntimeError as exc:
        assert 'QYTHON_FIELD_KEK is not set' in str(exc), exc
        return
    raise AssertionError('deveria falhar sem chaves')


def test_arquivo_de_chaves_e_criado_e_reaproveitado():
    with tempfile.TemporaryDirectory() as pasta:
        caminho = os.path.join(pasta, 'sub', 'keys.json')
        fresh({'QYTHON_KEYS_FILE': caminho})
        cifrado = es.encrypt_value('Maria da Silva')
        assert os.path.isfile(caminho)
        if os.name != 'nt':  # no Windows o modo de arquivo não é Unix
            assert stat.S_IMODE(os.stat(caminho).st_mode) == 0o600
        chaves = json.load(open(caminho))
        assert set(chaves) == {'QYTHON_FIELD_KEK', 'QYTHON_TOKEN_KEK'}
        # "reinício": o módulo esquece as chaves, o arquivo continua, o que foi cifrado antes abre
        fresh({'QYTHON_KEYS_FILE': caminho})
        assert es.decrypt_value(cifrado) == 'Maria da Silva'
        assert json.load(open(caminho)) == chaves  # nada foi regravado


def test_chaves_do_env_tem_prioridade_e_o_arquivo_nem_nasce():
    from cryptography.fernet import Fernet
    with tempfile.TemporaryDirectory() as pasta:
        caminho = os.path.join(pasta, 'keys.json')
        fresh({'QYTHON_KEYS_FILE': caminho, 'QYTHON_FIELD_KEK': Fernet.generate_key().decode(),
               'QYTHON_TOKEN_KEK': 'a' * 32})
        assert es.decrypt_value(es.encrypt_value('x')) == 'x'
        assert not os.path.exists(caminho)


def test_varios_processos_criando_ao_mesmo_tempo_ficam_com_as_mesmas_chaves():
    with tempfile.TemporaryDirectory() as pasta:
        caminho = os.path.join(pasta, 'keys.json')
        achados, barreira = [], threading.Barrier(8)

        def corrida():
            barreira.wait()
            achados.append(json.dumps(es._create_keys_file(caminho), sort_keys=True))

        threads = [threading.Thread(target=corrida) for _ in range(8)]
        [t.start() for t in threads]
        [t.join() for t in threads]
        assert len(achados) == 8 and len(set(achados)) == 1, 'workers ficaram com chaves diferentes'
        assert not [n for n in os.listdir(pasta) if n.endswith('.tmp')], 'sobrou arquivo temporário'


def test_arquivo_ilegivel_e_erro_claro_e_nao_chaves_novas():
    with tempfile.TemporaryDirectory() as pasta:
        caminho = os.path.join(pasta, 'keys.json')
        open(caminho, 'w').write('{isto não é json')
        fresh({'QYTHON_KEYS_FILE': caminho})
        try:
            es.encrypt_value('x')
        except RuntimeError as exc:
            assert 'ilegível' in str(exc), exc
            assert open(caminho).read() == '{isto não é json'  # não foi sobrescrito
            return
        raise AssertionError('deveria recusar o arquivo ilegível')


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
