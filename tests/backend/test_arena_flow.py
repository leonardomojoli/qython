# tests/backend/test_arena_flow.py
"""Simulado e XP contra um backend de verdade (rotas /api/academic/arena/*).

Rode contra um servidor no ar (o CI faz isso na imagem Docker):
    python3 tests/backend/test_arena_flow.py http://127.0.0.1:8000 [email senha]
ou com QYTHON_URL no ambiente. Sem endereço, o teste se pula (código 0).

Só biblioteca padrão. Sem email e senha, cadastra o dono (instalação nova); com eles, entra.

O que prova:
  - o PRIMEIRO simulado de um usuário novo é aceito (antes quebrava com 500: os contadores de
    UserStats nasciam None) e dá XP, que aparece no perfil junto com a sequência de dias;
  - o perfil de XP só traz o que o app usa (XP total, sequência, histórico): sem liga, ranking nem temporada;
  - o que era da edição hospedada saiu do servidor: ranking, temporada, desafios, rede de farmácias,
    envio de receita a farmácia e página pública de farmácias respondem 404.
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


def questions(n):
    return [{'pergunta': f'Pergunta {i}', 'alternativas': ['a', 'b', 'c', 'd'], 'resposta_correta': 'a',
             'dificuldade': 'medio', 'topico': 'teste', 'explicacao': 'porque sim'} for i in range(n)]


def main(base, email=None, password=None):
    token = owner_token(base, email, password)

    # 1. O perfil de XP de quem nunca jogou: zerado e sem nada de liga, ranking ou temporada.
    status, xp = call(base, 'GET', '/academic/arena/my-xp-profile', token=token)
    assert status == 200, (status, xp)
    assert sorted(xp) == ['current_streak', 'last_activity_date', 'longest_streak', 'total_xp', 'xp_history'], sorted(xp)
    start = xp['total_xp']

    # 2. O primeiro simulado é aceito e dá XP (3 certas de 5, uma errada, uma em branco).
    status, res = call(base, 'POST', '/academic/arena/submit_quiz', token=token, body={
        'specialty': 'ENAMED', 'mode': 'ENAMED', 'questions': questions(5), 'time_elapsed_seconds': 900,
        'answers': {'0': 0, '1': 0, '2': 0, '3': 1}})
    assert status == 200, (status, res)
    assert res['correct_count'] == 3 and res['incorrect_count'] == 1 and res['unanswered_count'] == 1, res
    assert res['score'] == 3 * 10 - 2 and res['xp_earned'] > 0, res
    for gone in ('league', 'ranking_update'):
        assert gone not in res, f'a resposta ainda traz {gone}'
    assert res['streak']['current'] >= 1, res['streak']

    # 3. O XP e a sequência aparecem no perfil, com o histórico das fontes de XP.
    status, xp = call(base, 'GET', '/academic/arena/my-xp-profile', token=token)
    assert status == 200 and xp['total_xp'] == start + res['xp_earned'], (xp, res)
    assert xp['current_streak'] >= 1 and xp['xp_history'], xp
    status, stats = call(base, 'GET', '/user/statistics/comprehensive', token=token)
    assert status == 200 and stats['academic']['quizzes_completed'] >= 1, stats
    assert sorted(stats['academic']) == ['correct_rate', 'quizzes_completed'], sorted(stats['academic'])

    # 4. O que era da edição hospedada saiu do servidor.
    for method, path in [('GET', '/academic/arena/rankings'), ('GET', '/academic/arena/ranking/ENAMED'),
                         ('GET', '/academic/arena/current-season'), ('GET', '/academic/arena/league-tiers'),
                         ('GET', '/academic/arena/challenges'), ('POST', '/academic/arena/matchmaking'),
                         ('POST', '/academic/arena/generate-share-card'), ('GET', '/pharmacy'),
                         ('GET', '/public/pharmacies/nearby?lat=0&lng=0'),
                         ('POST', '/prescriptions/1/send-to-pharmacy'), ('GET', '/prescriptions/1/pharmacy-sends')]:
        status, _ = call(base, method, path, body={} if method == 'POST' else None, token=token)
        assert status in (404, 405), f'{method} {path} ainda responde ({status})'

    # 5. O que fica continua de pé: catálogo de medicamentos e interações.
    status, _ = call(base, 'POST', '/medications/check-interactions', body={'active_principles': ['varfarina', 'aspirina']}, token=token)
    assert status == 200, status
    print('arena e xp: ok')


if __name__ == '__main__':
    url = (sys.argv[1] if len(sys.argv) > 1 else os.environ.get('QYTHON_URL', '')).rstrip('/')
    if not url:
        print('SKIP test_arena_flow (informe o endereço do backend ou QYTHON_URL)')
        sys.exit(0)
    main(url, *(sys.argv[2:4] if len(sys.argv) > 3 else (None, None)))
