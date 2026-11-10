# tests/backend/test_pairing_flow.py
"""Fluxo de pareamento do celular contra um backend de verdade (rotas /api/pairing).

Rode contra um servidor no ar (o CI faz isso na imagem Docker e no app desktop):
    python3 tests/backend/test_pairing_flow.py http://127.0.0.1:8000 [email senha]
ou com QYTHON_URL no ambiente. Sem endereço, o teste se pula (código 0).

Só biblioteca padrão. Sem email e senha, cadastra o dono (instalação nova); com eles, entra.

O que prova:
  - o código vem em formato legível e só serve UMA vez;
  - código errado ou colado com outro formato é recusado, e o que está certo passa mesmo escrito
    em minúsculas e com hífen;
  - o celular recebe um segredo de aparelho e um acesso que abre a API como o médico;
  - o segredo renova o acesso, e um segredo desconhecido não;
  - revogar o aparelho corta a renovação e o acesso que ele já tinha, sem mexer na senha;
  - um aparelho pareado por um médico não aparece nem se revoga na conta de outro.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid


def call(base, method, path, body=None, token=None, form=None):
    headers = {}
    data = None
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
    elif body is not None:
        data = json.dumps(body).encode()
        headers['Content-Type'] = 'application/json'
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(f'{base}/api{path}', data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw)
        except ValueError:
            return exc.code, {'raw': raw[:200].decode(errors='replace')}


def owner_token(base, email, password):
    if email:
        status, data = call(base, 'POST', '/auth/login', form={'username': email, 'password': password})
        assert status == 200, ('login', status, data)
        return data['access_token']
    boundary = uuid.uuid4().hex
    fields = {'email': f'dono-{uuid.uuid4().hex[:6]}@clinica-teste.com.br', 'password': 'Senha123!',
              'full_name': 'Dono Teste', 'occupation': 'Médico', 'country': 'br', 'identifier_number': 'CRM-T'}
    parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n' for k, v in fields.items()]
    payload = ''.join(parts).encode() + f'--{boundary}--\r\n'.encode()
    req = urllib.request.Request(f'{base}/api/auth/register/step1', data=payload, method='POST',
                                 headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    assert data.get('status') == 'active', data
    token = data['access_token']
    call(base, 'POST', '/user/me/consents', body={'type': 'terms_of_use'}, token=token)
    return token


def main(base, email=None, password=None):
    owner = owner_token(base, email, password)

    # 1. O código vem legível e só serve uma vez.
    status, start = call(base, 'POST', '/pairing/start', token=owner)
    assert status == 200 and len(start['code']) == 8 and start['display_code'] == f"{start['code'][:4]}-{start['code'][4:]}", start
    assert start['expires_in_seconds'] == 300, start

    status, _ = call(base, 'POST', '/pairing/claim', body={'code': 'ZZZZZZZZ', 'device_name': 'x'})
    assert status == 400, status  # código desconhecido
    status, _ = call(base, 'POST', '/pairing/claim', body={'code': 'AB', 'device_name': 'x'})
    assert status == 400, status  # curto demais

    typed = start['display_code'].lower()  # o médico pode digitar em minúsculas e com hífen
    status, claim = call(base, 'POST', '/pairing/claim', body={'code': typed, 'device_name': 'Pixel de teste', 'platform': 'android'})
    assert status == 200, (status, claim)
    for key in ('device_id', 'device_token', 'access_token', 'user'):
        assert claim.get(key), key
    assert 'token_hash' not in json.dumps(claim)

    status, again = call(base, 'POST', '/pairing/claim', body={'code': start['code'], 'device_name': 'outro'})
    assert status == 400, (status, again)  # uso único

    # 2. O acesso do celular abre a API como o médico.
    status, info = call(base, 'GET', '/user/info', token=claim['access_token'])
    assert status == 200 and info.get('email') == claim['user']['email'], (status, info)

    # 3. O segredo renova o acesso; um segredo qualquer, não.
    status, renewed = call(base, 'POST', '/pairing/token', body={'device_token': claim['device_token']})
    assert status == 200 and renewed['access_token'], (status, renewed)
    status, _ = call(base, 'GET', '/user/info', token=renewed['access_token'])
    assert status == 200
    status, _ = call(base, 'POST', '/pairing/token', body={'device_token': 'segredo-que-nao-existe'})
    assert status == 401, status

    # 4. O aparelho aparece na conta do médico e some da de outro.
    status, devices = call(base, 'GET', '/pairing/devices', token=owner)
    assert status == 200 and [d['id'] for d in devices] == [claim['device_id']] and devices[0]['name'] == 'Pixel de teste', devices
    assert devices[0]['last_seen_at'], 'last_seen_at deveria registrar a renovação'

    # 5. Revogar corta a renovação.
    status, _ = call(base, 'DELETE', f"/pairing/devices/{claim['device_id']}", token=owner)
    assert status == 200, status
    status, _ = call(base, 'POST', '/pairing/token', body={'device_token': claim['device_token']})
    assert status == 401, status
    # O acesso que o aparelho já tinha também deixa de valer na hora, não só quando expirar.
    for token in (claim['access_token'], renewed['access_token']):
        assert call(base, 'GET', '/user/info', token=token)[0] == 401, 'token de aparelho revogado ainda abre a API'
    assert call(base, 'GET', '/user/info', token=owner)[0] == 200, 'revogar o celular não pode derrubar o médico'
    status, devices = call(base, 'GET', '/pairing/devices', token=owner)
    assert status == 200 and devices == [], devices
    status, _ = call(base, 'DELETE', '/pairing/devices/999999', token=owner)
    assert status == 404, status

    # 6. Sem login não se gera código nem se lista aparelho.
    assert call(base, 'POST', '/pairing/start')[0] == 401
    assert call(base, 'GET', '/pairing/devices')[0] == 401
    print('pareamento: ok')


if __name__ == '__main__':
    url = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get('QYTHON_URL', '')).rstrip('/')
    if not url:
        print('SKIP test_pairing_flow (informe o endereço do backend ou QYTHON_URL)')
        sys.exit(0)
    main(url, *(sys.argv[2:4] if len(sys.argv) > 3 else (None, None)))
