# Qython Desktop

O Qython como programa para instalar no computador: sem Docker, sem terminal e sem editar
`.env`. O app (Electron) é um orquestrador de serviços locais; nada sai da máquina por padrão.

```
Electron (processo principal)
 ├─ PostgreSQL embarcado      127.0.0.1:<porta>   dados em <perfil>/db
 └─ qython-backend serve      127.0.0.1:<porta>   API + front (mesma origem), PyInstaller
        └─ janela: http://127.0.0.1:<porta>/
```

A janela abre `http://127.0.0.1:<porta>/` e não `file://`: o front exige `/api` na mesma
origem e abre o WebSocket por `window.location.host`. A porta é lembrada entre aberturas,
porque o login mora no `localStorage` da origem; trocar de porta deslogaria o médico.

## O que já está aqui (fatia 1: o núcleo que sobe)

| Peça | Onde | Observação |
|---|---|---|
| Postgres embarcado | `src/postgres.js` | `initdb` + `pg_ctl` dos binários de `@embedded-postgres/*`. Banco novo em UTF-8 com locale `builtin` `C.UTF-8` (igual nos 3 sistemas). Só TCP em 127.0.0.1. |
| Backend empacotado | `python/qython-backend.spec` | PyInstaller em pasta (onedir). Um executável, vários modos: `serve`, `chroma`, `selftest`. |
| Front servido pelo backend | `backend/spa.py` | Wrapper ASGI: só GET/HEAD fora de `/api` e `/static`. |
| Chaves | `src/secrets.js` | `QYTHON_FIELD_KEK`, `QYTHON_TOKEN_KEK`, `JWT_SECRET_KEY` e a senha do Postgres, geradas uma vez e guardadas no cofre do sistema (`safeStorage`). |
| Supervisão | `src/supervisor.js` | Reinício com recuo, parada limpa (o stdin do backend é fechado), pidfile para limpar sobras. |
| Janela, bandeja, notificações | `src/main.js`, `src/preload.cjs` | Links externos abrem no navegador do sistema. |
| Teste de fumaça | `src/smoke.js` | `electron . --smoke`: ver abaixo. |

A IA local (llama-server, Chroma, whisper), o assistente de primeiro uso, as Configurações
da IA, os instaladores e a atualização automática são as fatias seguintes.

### As chaves de criptografia

`QYTHON_FIELD_KEK` cifra CPF, RG e notas clínicas. Se ela mudasse entre duas aberturas, as
colunas cifradas ficariam ilegíveis. Por isso:

- são geradas **uma vez** e nunca recriadas: se o cofre do sistema não abre (chaveiro
  bloqueado), o app **para com uma mensagem**, em vez de gerar chaves novas por cima;
- se o banco já existe e o `secrets.json` sumiu, o app se recusa a abrir (`KeysMissingError`);
- sem cofre no sistema (Linux sem chaveiro), as chaves ficam num arquivo `0600` e o app
  registra o aviso em `logs/app.log`.

### O que fica de fora do backend empacotado (e por quê)

`python/lock.sh` gera o lock universal do desktop a partir do `requirements.txt` do
backend, nas **mesmas versões** do lock do Docker. Não vão no pacote:

- `torch`, `sentence-transformers`, `transformers`, `faster-whisper`: o embedder e o whisper
  rodam em outro processo, sob demanda (próxima fatia). Eram ~3 GB.
- `firebase-admin`: login com Google e SMS são do servidor hospedado (`firebase_service`
  continua funcionando sem ele).
- `presidio-*`, `spacy`, `pt_core_news_md`: redação de nomes antes de o texto ir ao Gemini.
  **Sem eles a redação cai no detector por regex**, que deixa nomes passarem
  (`middleware/pii_redaction.py`). Isso só importa no modo Gemini, e a tela de Configurações
  da IA (fatia 3) não pode ligar o Gemini sem oferecer o pacote de redação.
- `opencv-python` (nada importa o `cv2`) e `gunicorn` (não roda no Windows).

Sem Pango/GTK (Windows e macOS não têm), o backend sobe e só a geração de PDF avisa que
falta a biblioteca. O empacotamento dessas bibliotecas fica com os instaladores.

## Desenvolvimento

```bash
npm ci                                                   # na raiz do repositório
npm run build:desktop --workspace=packages/web           # front sem service worker
cd packages/desktop
pip install -r python/requirements.lock -r python/requirements-build.txt
(cd python && pyinstaller --noconfirm --distpath dist --workpath build qython-backend.spec)
node scripts/prepare-resources.mjs                       # monta build-resources/
npx electron . --no-sandbox                              # --no-sandbox só em Linux sem SUID
```

Para iterar sem refazer o PyInstaller, rode o backend do código-fonte:

```bash
QYTHON_BACKEND_DEV=$PWD/../.. QYTHON_PYTHON=/caminho/do/venv/bin/python npx electron .
```

Variáveis úteis: `QYTHON_USER_DATA` (perfil isolado, para testes), `QYTHON_RESOURCES_DIR`.

### Teste de fumaça

```bash
QYTHON_USER_DATA=$(mktemp -d) xvfb-run -a npx electron . --smoke --no-sandbox   # Linux sem tela
```

Sobe a pilha em um perfil novo e, pela API, como um médico novo: confere que o front é servido
na mesma origem e que o React renderiza a tela de login, cria a conta do dono (sem captcha,
SMS nem e-mail), aceita o termo de uso e cadastra um paciente com documento. Então **reinicia
tudo** e confere que a porta é a mesma, que o login funciona e que o documento cifrado
continua legível. Imprime `SMOKE OK` e sai com código 0. O CI (`.github/workflows/desktop.yml`)
roda isso em Linux, Windows e macOS.

### Testes unitários

```bash
npm test --workspace=packages/desktop          # node:test: portas, chaves, supervisor, logs
python3 tests/backend/test_desktop_backend.py  # spa.py, mime_sniff.py, QYTHON_DATA_DIR
```

## Dados no perfil do usuário

`app.getPath('userData')` (`~/.config/Qython`, `%APPDATA%\Qython`,
`~/Library/Application Support/Qython`):

```
db/data/        cluster do PostgreSQL
data/           QYTHON_DATA_DIR do backend: uploads, biblioteca, chroma_db, exports, config
logs/           app.log, backend.log, postgres.log, backend/qython_app.log (com rotação)
models/         modelos de IA (próxima fatia)
secrets.json    chaves cifradas pelo cofre do sistema
settings.json   preferências do app (porta lembrada)
```
