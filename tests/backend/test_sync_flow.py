# tests/backend/test_sync_flow.py
"""Sincronização do celular contra um backend de verdade (rota /api/sync/user-data).

Rode contra um servidor no ar (o CI faz isso na imagem Docker):
    python3 tests/backend/test_sync_flow.py http://127.0.0.1:8000 [email senha]
ou com QYTHON_URL no ambiente. Sem endereço, o teste se pula (código 0).

Só biblioteca padrão. Sem email e senha, cadastra o dono (instalação nova); com eles, entra.

O que prova:
  - as consultas vêm em páginas, mais recentes primeiro, sem repetir nem perder nenhuma, e
    `consultations_has_more` diz quando acabou (antes só vinham as 50 mais recentes);
  - os pacientes vêm todos na primeira página e não se repetem nas seguintes;
  - sem `limit`, o comportamento antigo (50) continua valendo, para celulares já instalados;
  - a sincronização por diferença (`since`) também pagina;
  - parâmetros fora do limite são recusados.
"""
import json
import os
import sys
import time
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
        with urllib.request.urlopen(req, timeout=60) as resp:
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


def fetch_all(base, token, limit, since=None):
    """Percorre todas as páginas como o celular faz. Devolve (pacientes, consultas, nº de páginas)."""
    patients, consultations, offset, pages = [], [], 0, 0
    while True:
        query = {'limit': limit, 'offset': offset}
        if since:
            query['since'] = since
        status, page = call(base, 'GET', '/sync/user-data?' + urllib.parse.urlencode(query), token=token)
        assert status == 200, (status, page)
        pages += 1
        assert pages < 50, 'a paginação não terminou'
        if offset > 0:
            assert page['patients'] == [], 'pacientes só vêm na primeira página'
        patients += page['patients']
        consultations += page['consultations']
        if not page['consultations_has_more']:
            return patients, consultations, pages
        assert len(page['consultations']) == limit, 'página cheia quando ainda há mais'
        offset += limit


def main(base, email=None, password=None):
    token = owner_token(base, email, password)

    # Três pacientes e sete consultas (a de número i guarda o seu número nas anotações).
    for i in range(3):
        status, _ = call(base, 'POST', '/patients', body={'full_name': f'Paciente Sync {i}'}, token=token)
        assert status == 201, status
    since = None
    for i in range(7):
        if i == 4:
            time.sleep(1.1)
            since = time.strftime('%Y-%m-%dT%H:%M:%S+00:00', time.gmtime())
            time.sleep(1.1)
        status, created = call(base, 'POST', '/consultations', token=token, body={
            'specialty': 'Clínica Médica', 'rawNotes': f'consulta {i}', 'isFirstConsultation': True})
        assert status == 201, (status, created)

    # 1. Páginas de 3: 7 consultas = 3 páginas, sem repetir nem perder, mais recentes primeiro.
    patients, consultations, pages = fetch_all(base, token, limit=3)
    notes = [c['raw_notes'] for c in consultations]
    assert pages == 3 and len(consultations) == 7, (pages, len(consultations))
    assert notes == [f'consulta {i}' for i in range(6, -1, -1)], notes
    assert len({c['id'] for c in consultations}) == 7
    assert len(patients) == 3 and len({p['id'] for p in patients}) == 3, patients

    # 2. Uma página exata não inventa uma próxima: 7 em páginas de 7 acaba na primeira.
    _, _, pages = fetch_all(base, token, limit=7)
    assert pages == 1, pages

    # 3. Sem limit vale o antigo (50), e a resposta continua trazendo o que o celular antigo lê.
    status, page = call(base, 'GET', '/sync/user-data', token=token)
    assert status == 200 and len(page['consultations']) == 7 and page['consultations_has_more'] is False, page
    assert len(page['patients']) == 3 and page['server_timestamp'], page

    # 4. Por diferença (since): só as 3 consultas feitas depois do marco, também em páginas.
    _, delta, pages = fetch_all(base, token, limit=2, since=since)
    assert [c['raw_notes'] for c in delta] == ['consulta 6', 'consulta 5', 'consulta 4'], [c['raw_notes'] for c in delta]
    assert pages == 2, pages

    # 5. Parâmetros fora do limite são recusados.
    for bad in ('limit=0', 'limit=201', 'offset=-1'):
        assert call(base, 'GET', f'/sync/user-data?{bad}', token=token)[0] == 422, bad
    assert call(base, 'GET', '/sync/user-data')[0] == 401
    print('sincronização: ok')


if __name__ == '__main__':
    url = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get('QYTHON_URL', '')).rstrip('/')
    if not url:
        print('SKIP test_sync_flow (informe o endereço do backend ou QYTHON_URL)')
        sys.exit(0)
    main(url, *(sys.argv[2:4] if len(sys.argv) > 3 else (None, None)))
