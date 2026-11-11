# Qython

**Plataforma de inteligência clínica com IA para médicos e estudantes de medicina.**
Copiloto clínico com RAG, biblioteca médica com busca semântica, gerador de materiais
de estudo, simulados e documentação de consulta — tudo autohospedável.

> *English: Qython is a self-hostable clinical AI platform for physicians and medical
> students — evidence-grounded copilot with RAG, semantic medical library, study
> material generation, exam simulation and consultation documentation. AGPL-3.0.
> Documentation is primarily in Brazilian Portuguese.*

[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

---

## Sobre este projeto

O Qython nasceu como um SaaS. Em setembro de 2026 o código foi aberto:
o serviço hospedado foi desligado e o projeto passou a ser distribuído para quem quiser
rodar por conta própria.

Isso muda uma coisa importante para você: **os dados ficam na sua infraestrutura.**
Não há servidor central, não há telemetria, não há assinatura. Você fornece suas
próprias chaves de API e o custo é o que os provedores cobrarem de você — na prática,
centavos por mês em uso individual.

O código está em produção-quality porque *esteve* em produção. Mas é software médico
auxiliar: não substitui julgamento clínico, e nada aqui é dispositivo médico
certificado. Leia a seção [Aviso clínico](#aviso-clínico).

## O que ele faz

| Módulo | Descrição |
|---|---|
| **Copiloto clínico** | Chat médico que responde a partir de fontes, com citações inline numeradas. Com a IA local, busca antes de responder no catálogo de medicamentos, na sua biblioteca e no PubMed. Hierarquia de evidência (meta-análise > diretriz > relato de caso). |
| **Biblioteca** | Ingestão de PDF, áudio e vídeo. OCR, transcrição, indexação vetorial. Busca híbrida (embeddings e5 + BM25 + reranking cross-encoder). |
| **Produtor de materiais** | Gera resumos, mapas mentais, flashcards, questionários, casos clínicos e slides a partir da sua biblioteca. |
| **Arena acadêmica** | Simulados com anti-repetição, provas customizadas para concurso, ranking e gamificação. |
| **Consultas** | Anamnese guiada por especialidade (33 especialidades), evolução clínica, prescrição. |
| **Mobile** | App React Native (Android/iOS) com modo offline e sync delta. |

## Começando

Você precisa de [Docker](https://docs.docker.com/get-docker/) e de uma máquina com
32 GB de RAM. A IA roda na própria máquina, sem chave de API: o compose sobe o
[llama.cpp](https://github.com/ggml-org/llama.cpp) com o Gemma 4 26B-A4B.

```bash
git clone https://github.com/leonardomojoli/qython.git
cd qython
cp .env.example .env
```

Edite o `.env` e preencha a chave que assina as sessões:

```bash
JWT_SECRET_KEY=$(openssl rand -hex 32)   # gere uma sua, não reutilize
```

Então:

```bash
docker compose up -d
```

As chaves que cifram nome, CPF e notas clínicas são geradas na primeira vez e guardadas no volume
`keys`: **inclua esse volume no backup**, ou defina `QYTHON_FIELD_KEK` e `QYTHON_TOKEN_KEK` no
`.env` ([como gerar](docs/SETUP.md#6-privacidade-e-chaves-de-criptografia)).

A aplicação sobe em **http://localhost:8080**.

O primeiro `up` demora: a imagem do backend tem cerca de 3,5 GB e o modelo de IA,
uns 15 GB, baixado na primeira subida do serviço `llm`. Depois disso o start é
rápido.

**Modelo de IA.** O padrão é a versão robusta do Gemma 4 (26B-A4B), que ocupa uns
17 GB de RAM. As versões pequenas (E2B, E4B) rodam em máquinas mais modestas, mas
erram fato clínico com frequência — nos nossos testes, dose de antibiótico pela
metade e volume de adrenalina errado — e por isso não são o padrão. Com uma GPU de
24 GB, o Gemma 4 31B é ainda melhor (`LLM_HF_REPO=ggml-org/gemma-4-31B-it-GGUF:Q4_0`).
Em CPU, uma resposta leva de 30 segundos a alguns minutos. Nenhum modelo é livre de
erro: confira toda informação clínica.
O Qython roda só com IA local: não há chave de provedor em nuvem a configurar, e o
texto das suas perguntas não sai da máquina.

O banco se prepara sozinho — num banco vazio o schema é criado a partir dos modelos, e num banco já existente só as
migrations pendentes são aplicadas (`backend/bootstrap_db.py` decide, e o
próprio arquivo explica por quê).

Abra o endereço e crie a primeira conta. Ela vira a administradora da
instalação, sem captcha, SMS nem confirmação por e-mail: essas travas só valem
quando o serviço de cada uma está configurado no `.env`. Em seguida aparece o
termo de uso, que precisa ser aceito antes de usar o app. Crie essa conta logo
depois de subir a instalação, porque até ela existir quem abrir o endereço
primeiro vira o administrador.

Contas criadas depois entram sem acesso às funções de IA até o administrador
liberar pelo painel de administração. Sem e-mail configurado, "Esqueci minha
senha" não tem como mandar o link; a senha se redefine pelo terminal:

```bash
docker compose exec backend python -m backend.scripts.reset_password voce@exemplo.com
```

### Modelos locais

A transcrição de áudio e vídeo roda no `faster-whisper` local e a busca da biblioteca no serviço
`embedder` (`multilingual-e5-base` + reranker, em ONNX, sem torch); nada vai a terceiros. Os modelos
da busca já vêm dentro da imagem (~410 MB); o do whisper baixa na primeira transcrição. Quem vem de
uma versão anterior (que buscava com um modelo menor) precisa reindexar as bibliotecas uma vez:

```bash
docker compose exec backend python -m backend.scripts.reindex_to_v2
```

### Ingestão de arquivos Office

Converter `.docx`/`.pptx` exige LibreOffice, que adiciona ~500 MB à imagem. Por isso
é opt-in:

```bash
WITH_LIBREOFFICE=true docker compose build backend
```

## Arquitetura

```
                    ┌───────────────┐
   navegador ─────▶ │  web (nginx)  │  React 19 + Vite, SPA
                    └───────┬───────┘
                            │ /api
                    ┌───────▼───────┐
                    │    backend    │  FastAPI + SQLAlchemy async
                    └───┬───────┬───┘
              ┌─────────┘       └─────────┐
        ┌─────▼─────┐              ┌──────▼──────┐
        │ postgres  │              │   chroma    │  índice vetorial
        └───────────┘              └─────────────┘
                            │
              ┌─────────────┴─────────────┐
        ┌─────▼─────┐              ┌──────▼──────┐
        │  whisper  │              │  embedder   │
        └───────────┘              └─────────────┘
```

Detalhamento em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Outros documentos
úteis: [`docs/features.md`](docs/features.md) (capacidades por módulo),
[`docs/SETUP.md`](docs/SETUP.md) (instalação e configuração),
[`docs/QYTHON_LGPD_PLAN.md`](docs/QYTHON_LGPD_PLAN.md) (modelo de compliance).

## Privacidade

O Qython foi construído para lidar com dado clínico:

- **A IA roda na sua máquina.** O texto das perguntas, das consultas e dos documentos não é
  enviado a nenhum serviço de IA. Por isso não há redação de nomes antes da IA: trocar o nome do
  paciente por um marcador só pioraria a nota gerada. A única saída por padrão é a busca do
  copiloto no PubMed, que envia só os termos da busca (`COPILOT_PUBMED=0` desliga).
- **Criptografia em repouso** (Fernet) nos campos sensíveis de usuário, paciente e consulta. As
  chaves vêm de `QYTHON_FIELD_KEK` e `QYTHON_TOKEN_KEK`; sem elas no `.env`, o Docker as gera e as
  guarda no volume `keys`, que precisa ir para o backup junto com o banco. Detalhes em
  [`docs/SETUP.md`](docs/SETUP.md#6-privacidade-e-chaves-de-criptografia).
- **Audit log append-only** com trigger no Postgres que rejeita UPDATE e DELETE.

## Desenvolvimento

Sem Docker, para trabalhar no código:

```bash
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
npm install

# backend
cd backend && alembic upgrade head && cd ..
uvicorn backend.main:app --reload

# web
npm run dev:web
```

Testes: `pytest tests/` e `npm test`.

O mobile tem instruções próprias em [`docs/ANDROID_DEV_SETUP.md`](docs/ANDROID_DEV_SETUP.md)
e [`docs/IOS_BUILD.md`](docs/IOS_BUILD.md).

## Contribuindo

Issues e pull requests são bem-vindos. Não há processo formal: abra uma issue
descrevendo o que pretende antes de investir tempo em algo grande, para não
duplicar esforço.

Este projeto é mantido em ritmo de tempo livre. Respostas podem demorar, e um PR
sem resposta não é desinteresse — é fila.

## Aviso clínico

Este software é uma **ferramenta auxiliar de estudo e documentação**. Não é
dispositivo médico, não foi submetido a ANVISA, FDA ou qualquer agência
reguladora, e não deve ser usado como fonte única para decisão clínica.

Saídas de modelos de linguagem contêm erros, inclusive erros confiantes e
plausíveis. Toda informação clínica gerada precisa ser verificada contra a fonte
primária antes de qualquer uso assistencial. A responsabilidade pelo uso é de
quem opera o sistema.

## Licença

[GNU AGPL-3.0](LICENSE). Na prática:

- **Usar é livre**, inclusive no consultório, na clínica ou no hospital, e
  inclusive com fins comerciais.
- **Modificar é livre.** Se você oferecer uma versão modificada a outras pessoas
  pela rede — como serviço web, por exemplo —, precisa disponibilizar o
  código-fonte dessa versão a esses usuários (seção 13 da licença). Melhorias em
  software clínico continuam abertas, em vez de virarem cópias fechadas.
- **Sem garantia.** O software é fornecido "como está" (seções 15 e 16).
- **A licença cobre o código, não o nome.** Versões modificadas não podem se
  apresentar como "Qython".

Até o commit `e673b26` (24/out/2026) o projeto foi publicado sob Apache-2.0, e
cópias obtidas naquelas condições continuam sob elas. Veja [NOTICE](NOTICE) para
o histórico e para as dependências de terceiros, que têm licenças próprias —
entre elas o PyMuPDF, também AGPL-3.0.
