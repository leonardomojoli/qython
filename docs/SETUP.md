# Instalação e configuração

Como instalar e configurar o Qython. Há dois jeitos, sobre a mesma base de código:

| | App desktop | Docker |
|---|---|---|
| Para quem | um médico, no próprio computador | a instituição, num servidor |
| O que precisa | Windows, macOS ou Linux; 32 GB de RAM para a IA recomendada | Docker; 32 GB de RAM; uns 20 GB de disco |
| Terminal e `.env` | não | sim, uma vez |
| Onde ficam os dados | na pasta do perfil do usuário | nos volumes do Docker |

O Qython roda **só com IA local**: não existe provedor em nuvem nem chave de IA a configurar. O
texto das perguntas, das consultas e dos documentos não sai da máquina.

## Índice

1. [App desktop](#1-app-desktop)
2. [Servidor com Docker](#2-servidor-com-docker)
3. [IA local](#3-ia-local)
4. [Transcrição, busca e OCR](#4-transcrição-busca-e-ocr)
5. [Servidor exposto na internet ou na rede](#5-servidor-exposto-na-internet-ou-na-rede)
6. [Privacidade e chaves de criptografia](#6-privacidade-e-chaves-de-criptografia)
7. [Solução de problemas](#7-solução-de-problemas)

---

## 1. App desktop

Baixe o instalador da página de [releases](https://github.com/leonardomojoli/qython/releases):

- **Windows:** instalador `.exe` (NSIS). Instala só para o seu usuário, sem pedir administrador, e
  **nunca apaga os dados dos pacientes ao desinstalar**.
- **macOS:** `.dmg` (ou `.zip`).
- **Linux:** `AppImage` ou `.deb`.

**Aviso de segurança na primeira abertura.** Os instaladores ainda não são assinados (a assinatura
depende de cadastros que o projeto ainda não fez). O Windows (SmartScreen) e o macOS (Gatekeeper)
vão avisar que o programa não é de um desenvolvedor conhecido. No Windows: *Mais informações* →
*Executar assim mesmo*. No macOS 15 (Sequoia) ou mais novo: tente abrir o app uma vez, depois vá em *Ajustes do Sistema* →
*Privacidade e Segurança*, role até o aviso sobre o Qython e clique em *Abrir Assim Mesmo* (o atalho
do botão direito → *Abrir* só funciona até o macOS 14). Se o macOS disser que o app "está danificado",
é o mesmo bloqueio: no Terminal, `xattr -dr com.apple.quarantine /Applications/Qython.app`.

**Primeiro uso.** Um assistente mostra a memória e o disco do computador e escolhe a IA:

- O padrão é o **Gemma 4 26B-A4B** (cerca de 15 GB de download, uns 17 GB de RAM). Se o computador
  tiver menos de 32 GB, o assistente avisa com clareza, e você escolhe: baixar mesmo assim ou um
  modelo menor. **Ele nunca troca de modelo sozinho.** Os modelos pequenos rodam em máquinas mais
  modestas, mas erram fato clínico com frequência (nos nossos testes, dose de antibiótico pela
  metade e volume de adrenalina errado).
- O download é retomável, com o SHA-256 conferido. Junto vêm os modelos da busca da biblioteca, da
  transcrição de áudio e do OCR (uns 2 GB, além do modelo de IA).
- Reabra o assistente quando quiser em *Ajuda* → *Escolher a IA*. Se pulou a transcrição de áudio e
  vídeo (1,6 GB), baixe depois em *Ajuda* → *Baixar a transcrição de áudio e vídeo*.

Depois crie a primeira conta: ela vira a administradora da instalação, sem captcha, SMS nem
confirmação por e-mail. Em seguida aparece o termo de uso, que precisa ser aceito.

**Dados.** Ficam na pasta do perfil do usuário (`~/.config/Qython`, `%APPDATA%\Qython` ou
`~/Library/Application Support/Qython`): o banco, a biblioteca, os logs e os modelos baixados. As
chaves de criptografia ficam no cofre do sistema.

**Backup.** *Arquivo* → *Fazer backup…* grava o banco, os dados e as chaves num único arquivo
`.qybackup`, cifrado com a senha que você escolher. **Guarde essa senha em outro lugar:** sem ela o
backup não abre. *Arquivo* → *Restaurar backup…* confere a senha antes de parar qualquer coisa e
nunca apaga o que já existia. O banco só restaura no mesmo sistema, na mesma arquitetura e na mesma
versão maior do PostgreSQL; para trocar de sistema use a exportação por paciente (LGPD).

**Atualização.** Windows e AppImage atualizam sozinhos, em segundo plano, e instalam quando o app é
fechado. O `.deb` atualiza pelo gerenciador de pacotes. No macOS o app só avisa. Para desligar:
`QYTHON_NO_UPDATE=1` (checar atualização revela o IP e a versão ao GitHub).

Detalhes técnicos em [`packages/desktop/README.md`](../packages/desktop/README.md).

---

## 2. Servidor com Docker

Você precisa de [Docker](https://docs.docker.com/get-docker/) e de uma máquina com 32 GB de RAM. O
`docker compose` sobe o banco, o índice de busca, o backend, o front, a IA (llama.cpp com o Gemma
4) e a transcrição.

```bash
git clone https://github.com/leonardomojoli/qython.git
cd qython
cp .env.example .env
```

Edite o `.env` e preencha a chave que assina as sessões:

```bash
JWT_SECRET_KEY=$(openssl rand -hex 32)   # gere uma sua, não reutilize
```

```bash
docker compose up -d
```

O Qython abre em **http://localhost:8080**. O primeiro `up` demora: a imagem do backend tem uns 3,5
GB e o modelo de IA, uns 15 GB, baixado na primeira subida do serviço `llm`. Para fixar uma versão,
use `QYTHON_VERSION=<versão>` no `.env`.

**Primeira conta.** Crie-a logo depois de subir: até ela existir, quem abrir o endereço primeiro
vira o administrador. Ela não passa por captcha, SMS nem e-mail (essas travas só valem quando o
serviço de cada uma está configurado, ver [seção 5](#5-servidor-exposto-na-internet-ou-na-rede)).
Depois aparece o termo de uso. Contas criadas depois entram sem acesso às funções de IA até o
administrador liberar pelo painel. Sem e-mail configurado, "Esqueci minha senha" não tem como
mandar o link; redefina pelo terminal:

```bash
docker compose exec backend python -m backend.scripts.reset_password voce@exemplo.com
```

**Serviços do compose:** `db` (PostgreSQL), `chroma` (índice vetorial), `backend` (FastAPI), `web`
(nginx com o front), `llm` (llama.cpp), `whisper` (transcrição) e `embedder` (a busca da biblioteca, em
ONNX, com os modelos já dentro da imagem; uns 1 GB de RAM). Para ingerir `.docx` e `.pptx` a imagem precisa do LibreOffice (uns 500 MB):
`WITH_LIBREOFFICE=true docker compose build backend`.

**Chaves de criptografia.** Nome, CPF e notas clínicas são cifrados no banco. Se
`QYTHON_FIELD_KEK` e `QYTHON_TOKEN_KEK` não estiverem no `.env`, o backend gera as duas na primeira
vez e as guarda no volume `keys` (`/var/lib/qython/keys.json`). Veja a [seção 6](#6-privacidade-e-chaves-de-criptografia).

**O que guardar em backup:** os volumes `pgdata` (banco), `permanent` e `uploads` (arquivos),
`chromadata` (índice de busca) e **`keys` (chaves)**. Sem as chaves, o resto não abre.

**Atualizar:**

```bash
docker compose pull && docker compose up -d
```

As migrations do banco rodam sozinhas no início do backend.

---

## 3. IA local

Um modelo serve a tudo (consulta, chat, material, prova, leitura de imagem): o que o servidor de IA
carregou. Os papéis `PRIMARY_LLM_MODEL`, `CHAT_LLM_MODEL` e semelhantes valem `local` e não precisam
ser definidos.

No Docker, o serviço `llm` roda o llama.cpp com o Gemma 4 26B-A4B (`Q4_0`). Variáveis do `.env`:

```env
# LLM_HF_REPO=ggml-org/gemma-4-26B-A4B-it-GGUF:Q4_0   # padrão (~17 GB de RAM)
#                                                     # GPU de 24 GB: ggml-org/gemma-4-31B-it-GGUF:Q4_0
# LLM_THREADS=4
# LLM_CONTEXT_TOKENS=16384    # o mesmo -c do llama-server
```

Para usar o seu próprio servidor compatível com a API da OpenAI (llama-server, Ollama, LM Studio,
vLLM), aponte para ele:

```env
LLM_BASE_URL=http://127.0.0.1:8081/v1   # com o /v1
LLM_MODEL=gemma-4                       # o Ollama exige o nome exato
LLM_CONTEXT_TOKENS=16384                # precisa bater com o -c do llama-server (ou num_ctx do Ollama)
LLM_API_KEY=                            # só se o servidor pedir
```

O administrador também troca o endereço e o modelo pela tela **Configurações da IA**, sem reiniciar.

Em CPU, uma resposta leva de 30 segundos a alguns minutos. **Nenhum modelo é livre de erro: confira
toda informação clínica.** Para pergunta clínica, o copiloto busca fontes *antes* de responder (o
catálogo de medicamentos, a sua biblioteca e o PubMed) e responde a partir delas, citando-as.

**O que a IA local não faz, e o Qython não oferece:** busca na web durante a resposta, geração de
imagem (o mapa mental sai como diagrama interativo, o avatar é foto enviada ou avatar pronto, os
slides saem sem imagem) e geração de áudio.

---

## 4. Transcrição, busca e OCR

- **Transcrição de áudio e vídeo:** `faster-whisper` local (large-v3-turbo), no serviço `whisper`.
  Não há transcrição em nuvem. Ajustes: `WHISPER_MODEL`, `WHISPER_COMPUTE_TYPE`,
  `WHISPER_CPU_THREADS` e `WHISPER_LANGUAGE` (vazio = detecta pt, en ou es).
- **Busca na biblioteca:** o índice vetorial é o ChromaDB (serviço `chroma`) e os vetores vêm do serviço
  `embedder` (`multilingual-e5-base` + reranker, em ONNX e sem torch, modelos dentro da imagem). Vindo
  de uma versão anterior, que buscava com um modelo menor, reindexe as bibliotecas uma vez:
  `docker compose exec backend python -m backend.scripts.reindex_to_v2`.
- **OCR** de PDF escaneado e de foto de documento: RapidOCR com o PP-OCRv6, local. O modelo médio
  (139 MB, o que menos erra em texto miúdo) vem na imagem Docker e é baixado pelo app desktop; o
  pequeno está sempre disponível como reserva. `QYTHON_OCR_MODELO=pequeno` força o pequeno em
  máquina lenta; `QYTHON_OCR_THREADS` limita os núcleos. Só as páginas sem texto passam pelo OCR.
- **PubMed:** o copiloto consulta o PubMed e envia **só os termos da busca**. Em instalação sem
  internet, `COPILOT_PUBMED=0` desliga. `NCBI_API_KEY` (opcional, gratuita em
  <https://www.ncbi.nlm.nih.gov/account/>) sobe o limite de ~3 para ~10 consultas por segundo.

---

## 5. Servidor exposto na internet ou na rede

Para uso em rede, defina no `.env` os endereços pelos quais o Qython será acessado e ponha um proxy
reverso com HTTPS na frente:

```env
WEB_BASE_URL=https://qython.suainstituicao.com.br
API_BASE_URL=https://qython.suainstituicao.com.br/api
ALLOWED_ORIGINS=https://qython.suainstituicao.com.br
ALLOWED_HOSTS=qython.suainstituicao.com.br
```

Num servidor aberto, vale ligar as travas de cadastro. **Cada uma só vale quando o serviço dela está
configurado**; sem nada, um Qython novo cria a primeira conta sem etapa nenhuma:

| Trava | Serviço | Configuração |
|---|---|---|
| Confirmação de e-mail e recuperação de senha | [Resend](https://resend.com) | `RESEND_API_KEY`, `MAIL_FROM_EMAIL` |
| CAPTCHA no cadastro | [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) | `CLOUDFLARE_SECRET_KEY` (backend) e `VITE_CLOUDFLARE_SITE_KEY` (front) |
| Verificação de telefone por SMS | [Firebase Authentication](https://firebase.google.com/docs/auth) | `config/firebase_credentials.json` (backend) e `VITE_FIREBASE_*` (front) |
| Verificação do registro profissional (CRM) | Lastreo | `LATREO_API_KEY`, `LATREO_WEBHOOK_SECRET`, `LATREO_BASE_URL` |

As variáveis `VITE_*` são lidas na **construção do front**: com as imagens prontas do GHCR, elas
precisam entrar numa reconstrução da imagem `web`.

**Google Drive (opcional).** Quem quiser que a biblioteca copie os documentos para o Drive do
próprio usuário configura um cliente OAuth do Google Cloud: `GOOGLE_OAUTH_CLIENT_ID`,
`GOOGLE_OAUTH_CLIENT_SECRET` e `GOOGLE_OAUTH_REDIRECT_URI`
(`https://<seu domínio>/api/connectors/google/callback`). Sem isso, a biblioteca fica no disco da
instalação.

---

## 6. Privacidade e chaves de criptografia

**O que sai da máquina.** Por padrão, só as buscas do copiloto no PubMed (os termos da busca, não o
texto do paciente). A cópia de documentos no Google Drive e a verificação profissional pelo Lastreo
só existem se você as configurar.

**Chaves de criptografia (LGPD).** Os campos sensíveis (nome, CPF, telefone, e-mail, notas clínicas)
são cifrados no banco com duas chaves:

- `QYTHON_FIELD_KEK` (Fernet): cifra as colunas.
- `QYTHON_TOKEN_KEK`: pseudonimização e busca por hash determinístico.

De onde o backend as lê, nesta ordem: o `.env` (variáveis de ambiente); o arquivo
`QYTHON_KEYS_FILE` (o `docker compose` o aponta para o volume `keys` e o cria na primeira vez); e o
app desktop usa o cofre do sistema. Para chaves próprias, num servidor de instituição:

```bash
# QYTHON_FIELD_KEK
python3 -c "from cryptography.fernet import Fernet; print('QYTHON_FIELD_KEK=' + Fernet.generate_key().decode())"
# QYTHON_TOKEN_KEK
python3 -c "import os, base64; print('QYTHON_TOKEN_KEK=' + base64.urlsafe_b64encode(os.urandom(32)).decode())"
```

**Gere uma vez, guarde em local seguro e não troque sem um plano de re-cifragem:** a perda da
`QYTHON_FIELD_KEK` torna ilegíveis os campos cifrados, e não há como recuperá-los. Só para
desenvolvimento descartável existe `QYTHON_ALLOW_EPHEMERAL_KEK=1`, que gera chaves novas a cada
início (os dados deixam de abrir depois de reiniciar).

**Trilha de auditoria.** O log de auditoria só aceita inclusão: um gatilho no PostgreSQL recusa
`UPDATE` e `DELETE`.

**Redação de nomes antes da IA.** Não há: a IA roda na máquina, então o texto vai ao modelo como
está. Trocar o nome do paciente por um marcador só pioraria a nota gerada.

---

## 7. Solução de problemas

**A IA demora ou erra por contexto.** Em CPU, de 30 segundos a alguns minutos por resposta. Confira
`LLM_THREADS` e a RAM livre. `LLM_CONTEXT_TOKENS` precisa bater com o `-c` do llama-server.

**"QYTHON_FIELD_KEK is not set" ao salvar um paciente.** Acontecia numa instalação Docker anterior
a esta documentação, que pedia só a `JWT_SECRET_KEY`. Atualize a imagem (o backend passa a gerar as
chaves no volume `keys`) ou defina as duas chaves no `.env`.

**O PDF da receita sai sem texto ou o PDF falha.** No servidor Docker, confira o log do backend. No
app desktop, abra *Ajuda* → *Abrir a pasta de logs* e procure `pdf`.

**Esqueci a senha, sem e-mail configurado.** `docker compose exec backend python -m
backend.scripts.reset_password voce@exemplo.com`.

**Transcrição não funciona.** O serviço `whisper` precisa estar de pé e o backend precisa de
`WHISPER_SERVER_URL` (o compose define). Sem ele a transcrição fica indisponível, sem fallback em
nuvem. No app desktop, o whisper sobe sob demanda quando há um arquivo para transcrever.

**O download do modelo parou.** No desktop o download é retomável: abra o assistente de novo. No
Docker, `docker compose logs -f llm`.

**Windows ou macOS avisam que o app não é confiável.** Veja o aviso na [seção 1](#1-app-desktop): os
instaladores ainda não são assinados.
