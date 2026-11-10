# Qython Desktop

O Qython como programa para instalar no computador: sem Docker, sem terminal e sem editar
`.env`. O app (Electron) é um orquestrador de serviços locais; nada sai da máquina por padrão.

```
Electron (processo principal)
 ├─ PostgreSQL embarcado      127.0.0.1:<porta>   dados em <perfil>/db
 ├─ qython-backend serve      127.0.0.1:<porta>   API + front (mesma origem), PyInstaller
 │      └─ janela: http://127.0.0.1:<porta>/
 └─ IA local (sob demanda)    127.0.0.1:<porta fixa>  →  llama-server (só enquanto há pedido)
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

## IA local (fatia 2a)

| Peça | Onde | Observação |
|---|---|---|
| `llama-server` sob demanda | `src/ondemand.js`, `src/llm.js` | O backend fala sempre com uma porta fixa. No primeiro pedido o app sobe o `llama-server` e espera o `/health`; sem pedido por 15 min, desliga (a RAM só é ocupada enquanto a IA trabalha). Quando o cliente desiste, o pedido ao modelo é cancelado. |
| Manifesto de modelos | `models.json` | Cada arquivo com tamanho, SHA-256 e a revisão do Hugging Face. O padrão é o Gemma 4 26B-A4B `Q4_0` (a quantização vai explícita: sem ela o llama.cpp baixaria os 50 GB do BF16), mais o `mmproj` para imagens. |
| Download | `src/downloader.js` | Retomável (Range), progresso, SHA-256 conferido antes de usar; o app fechado no meio retoma de onde parou. |
| Assistente de primeiro uso | `src/setup/`, `src/ai.js` | Mostra RAM e disco, **avisa com clareza** quando o computador tem menos de 32 GB e deixa o médico escolher: baixar mesmo assim ou escolher um modelo menor. **Nunca troca de modelo sozinho.** Reabre em Ajuda › Escolher a IA. |
| `llama-server` no pacote | `scripts/fetch-llama.mjs` | Build de CPU fixada em `models.json`, com SHA-256, por sistema. |
| tiktoken offline | `python/prepare_tiktoken.py` | O vocabulário vai no pacote; sem isso o copiloto baixaria um arquivo da internet no primeiro uso. |

A conta local e o termo de uso continuam sendo feitos na própria tela do Qython (o primeiro
usuário vira dono), logo depois do assistente.

O llama-server escuta só em 127.0.0.1, exige uma chave de API (guardada no cofre, junto das
outras) e roda com um slot: CPU não ganha com paralelismo e a conversa fica com o contexto
inteiro (16 384 tokens, o mesmo do `docker-compose.yml`).

### Transcrição de áudio e vídeo

A biblioteca transcreve com o **faster-whisper** (Whisper large-v3 turbo, 1,6 GB, no formato
CTranslate2), o mesmo serviço do servidor (`backend/whisper_server.py`), como modo `whisper` do
executável do backend. Entra com o ctranslate2 e o PyAV, **sem torch e sem ffmpeg para instalar**: o
PyAV traz o ffmpeg dentro da roda. Sobe sob demanda atrás de uma porta fixa (`WHISPER_SERVER_URL`) e
desliga parado. O modelo baixa junto com a IA; quem pulou a IA baixa por **Ajuda > Baixar a
transcrição de áudio e vídeo**. Se o modelo ainda não está no disco o serviço responde 503 e o
documento volta para a fila de retentativa do backend, em vez de falhar de vez.

### Leitura de documentos escaneados (OCR)
PDFs sem texto e fotos de documentos passam por `backend/services/ocr_service.py`: RapidOCR com o
PP-OCRv6 em ONNX, sem binário nativo e sem rede. O modelo **pequeno** (31 MB) vem dentro do pacote
e sempre funciona. O **médio** (139 MB), que erra bem menos em texto miúdo, está no `models.json`
como modelo de apoio: baixa junto com a IA, com SHA-256 conferido, e o app passa a pasta dele ao
backend em `QYTHON_OCR_MODELS`. Sem ele o backend usa o pequeno. `QYTHON_OCR_MODELO=pequeno` força
o pequeno em máquina lenta; `QYTHON_OCR_THREADS` limita os núcleos (padrão: metade, no máximo 4).
Tempo por página densa em CPU de 4 threads: cerca de 30 s no médio, 8 s no pequeno. O `selftest`
do executável lê uma imagem gerada na hora e confere que o pacote levou os modelos e o `cv2`.

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

- `torch`, `sentence-transformers`, `transformers`: o embedder (onnxruntime) e o whisper
  (ctranslate2) rodam sem eles, em outro processo, sob demanda. Eram ~3 GB.
- `firebase-admin`: login com Google e SMS são do servidor hospedado (`firebase_service`
  continua funcionando sem ele).
- `presidio-*`, `spacy`, `pt_core_news_md`: redação de nomes antes de o texto ir a um serviço de
  IA externo. O Qython roda só com IA local, então nada precisa ser redigido e o pacote não vai
  (a redação só serve à exportação de dados de treino, e cai no detector por regex).
- `opencv-python` completo (precisaria de libGL; o OCR usa o `opencv-python-headless`) e
  `gunicorn` (não roda no Windows).

**PDF (receita, atestado, materiais).** O WeasyPrint precisa do Pango/GTK. No Linux vem com o GTK do
Electron (o deb declara `libpango-1.0-0` e `libpangoft2-1.0-0`). No Windows e no macOS o CI reúne as
bibliotecas e elas entram dentro do pacote do backend: no Windows as DLLs do MSYS2
(`python/pdf-libs/windows.sh`), no macOS as dylibs do Homebrew com os caminhos reescritos para
`@loader_path/` (`python/pdf-libs/bundle_dylibs.py`), numa pasta própria do pacote (`pdf-libs/mac`: na raiz elas dividiriam o nome com as do opencv do OCR). O PyInstaller dá a elas `@rpath/` e um `LC_RPATH` que aponta para a raiz do pacote, então o fim do `qython-backend.spec` acrescenta `@loader_path` ao `LC_RPATH` de cada uma e as reassina. Um `fonts-<so>.conf` mínimo vai junto, porque o
fontconfig empacotado não traz a configuração do sistema onde foi compilado e, sem ela, o PDF sai
sem texto. No macOS a `libharfbuzz-subset` não vai: ela derrubou o processo ao reduzir uma fonte do sistema
(o WeasyPrint então reduz as fontes com o fontTools, mais lento e sem esse defeito). O `selftest` do executável gera um PDF e confere que o texto (com acentos) está nele.

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

### Teste de fumaça (e da IA)

```bash
QYTHON_USER_DATA=$(mktemp -d) xvfb-run -a npx electron . --smoke --no-sandbox   # Linux sem tela
```

Sobe a pilha em um perfil novo e, pela API, como um médico novo: confere que o front é servido
na mesma origem e que o React renderiza a tela de login, cria a conta do dono (sem captcha,
SMS nem e-mail), aceita o termo de uso e cadastra um paciente com documento. Então **reinicia
tudo** e confere que a porta é a mesma, que o login funciona e que o documento cifrado
continua legível. Com `QYTHON_AI_MODEL_FILE` (um GGUF qualquer, o CI usa o Qwen3 0.6B), também
pergunta algo ao copiloto: o `llama-server` sobe sob demanda, responde, é desligado por inatividade
(`QYTHON_LLM_IDLE_SECONDS`) e sobe de novo no pedido seguinte. Prova a fiação; a qualidade do Gemma 4
é avaliada à parte. Imprime `SMOKE OK` e sai com código 0. O CI (`.github/workflows/desktop.yml`)
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
models/         modelos de IA baixados (<id>/<arquivo>.gguf, mais .part e .ok)
secrets.json    chaves cifradas pelo cofre do sistema
settings.json   preferências do app (porta lembrada)
```

## Instaladores, atualização e assinatura (fatia 4)

`electron-builder.yml` gera, por sistema: **NSIS** (Windows, instala por usuário, sem pedir
administrador, e **nunca apaga os dados dos pacientes ao desinstalar**), **AppImage** e **deb**
(Linux) e **dmg** e **zip** (macOS, sem assinatura). Sem asar: o Postgres e o backend são binários
executados pelo app. O backend, o front e o llama-server vão em `resources/` (`extraResources`).

```bash
npm run build:desktop --workspace=packages/web
(cd python && python prepare_tiktoken.py && pyinstaller --noconfirm --distpath dist --workpath build qython-backend.spec)
node scripts/prepare-resources.mjs && node scripts/fetch-llama.mjs
npm run dist --workspace=packages/desktop          # gera release/
```

O `desktop.yml` faz isso nos três sistemas e **instala de verdade** (apt/dpkg no Linux, NSIS
silencioso no Windows, dmg no macOS) antes de repetir a fumaça no app instalado. O
`desktop-release.yml` roda em tag `v*`, usa a versão da tag e anexa os instaladores à release que o
`release.yml` cria (como o APK). Não cria tag nem release.

### Atualização automática

`electron-updater` pelo GitHub Releases (`src/updater.js`): baixa em segundo plano e **instala quando o
app é fechado**, sem interromper o médico; o banco se atualiza sozinho na abertura seguinte (as
migrations rodam no bootstrap). Para desligar: `autoUpdate: false` no `settings.json` ou
`QYTHON_NO_UPDATE=1` (checar atualização revela o IP e a versão ao GitHub).

| Sistema | Atualização |
|---|---|
| Windows (NSIS) | automática |
| Linux AppImage | automática |
| Linux deb | pelo gerenciador de pacotes do sistema |
| macOS | **só avisa**: sem assinatura o macOS não deixa o app se trocar sozinho |

### Assinatura do Windows (SignPath Foundation): o que falta é cadastro seu

O workflow já tem os passos, desligados. Para ligar:

1. Candidatar o projeto à [SignPath Foundation](https://signpath.org/) (grátis para código aberto) e
   conectar o repositório pelo trusted build do GitHub.
2. No repositório, em *Settings > Secrets and variables > Actions*:
   - **variáveis**: `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`,
     `SIGNPATH_SIGNING_POLICY_SLUG`, `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG`;
   - **secret**: `SIGNPATH_API_TOKEN`.
3. Na SignPath, uma configuração de artefato que assine o `.exe` dentro do zip do artifact
   `instalador-windows-sem-assinatura`.

Depois da assinatura o `scripts/refresh-latest-yml.mjs` refaz o sha512 do `latest.yml` (o
atualizador reprova o instalador se o hash não bater). Sem a configuração, o instalador sai sem
assinatura e o SmartScreen avisa.

### O que ainda não está nos instaladores

- **macOS assinado e notarizado** (precisa de conta Apple).

## Backup e restauração

Menu **Arquivo → Fazer backup…** (e na bandeja). O Qython pausa por alguns instantes, grava o banco, os
dados do backend (biblioteca, exportações, Chroma) e as **chaves de criptografia** num único arquivo
`.qybackup` cifrado com a senha escolhida (scrypt + AES-256-GCM, arquivo inteiro). As chaves vão dentro
porque, sem elas, o CPF, o RG e as notas clínicas cifradas ficam ilegíveis no computador novo; é por isso
que a senha precisa ser guardada em outro lugar. Os modelos de IA não entram (o assistente baixa de novo).

**Arquivo → Restaurar backup…** confere a senha e a compatibilidade antes de parar qualquer coisa, e
nunca apaga o que existia: os dados de agora ficam em `antes-do-restauro-<data>`, dentro da pasta de dados
do Qython, para o médico apagar quando tiver certeza. Limite: o banco só restaura no **mesmo sistema,
mesma arquitetura e mesma versão maior do PostgreSQL**; para trocar de sistema operacional é preciso a
exportação por paciente (LGPD), que já existe no Qython. A API para o front é
`window.qythonDesktop.backup()` / `.restore()`.
