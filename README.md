# Qython

**Plataforma de inteligência clínica com IA para médicos e estudantes de medicina.**
Copiloto clínico com RAG, biblioteca médica com busca semântica, gerador de materiais
de estudo, simulados e documentação de consulta — tudo autohospedável.

> *English: Qython is a self-hostable clinical AI platform for physicians and medical
> students — evidence-grounded copilot with RAG, semantic medical library, study
> material generation, exam simulation and consultation documentation. Apache-2.0.
> Documentation is primarily in Brazilian Portuguese.*

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

---

## Sobre este projeto

O Qython nasceu como um SaaS. Em setembro de 2026 o código foi aberto sob Apache-2.0:
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
| **Copiloto clínico** | Chat médico com embasamento por busca (Google Search grounding), citações inline numeradas, hierarquia de evidência (meta-análise > diretriz > relato de caso) e recuperação da sua própria biblioteca. |
| **Biblioteca** | Ingestão de PDF, áudio e vídeo. OCR, transcrição, indexação vetorial. Busca híbrida (embeddings e5 + BM25 + reranking cross-encoder). |
| **Produtor de materiais** | Gera resumos, mapas mentais, flashcards, podcasts e videoaulas a partir da sua biblioteca. |
| **Arena acadêmica** | Simulados com anti-repetição, provas customizadas para concurso, ranking e gamificação. |
| **Consultas** | Anamnese guiada por especialidade (33 especialidades), evolução clínica, prescrição. |
| **Mobile** | App React Native (Android/iOS) com modo offline e sync delta. |

## Começando

Você precisa de [Docker](https://docs.docker.com/get-docker/) e uma chave da
[API do Google Gemini](https://aistudio.google.com/apikey) (o tier gratuito serve
para experimentar — veja a ressalva em [Privacidade](#privacidade-e-escolha-de-modelo)).

```bash
git clone https://github.com/leonardomojoli/qython.git
cd qython
cp .env.example .env
```

Edite o `.env` e preencha no mínimo:

```bash
GEMINI_API_KEY=sua-chave-aqui
JWT_SECRET_KEY=$(openssl rand -hex 32)   # gere uma sua, não reutilize
```

Então:

```bash
docker compose up -d
```

A aplicação sobe em **http://localhost:8080**. As migrations rodam sozinhas no
primeiro boot.

Crie sua conta pela tela de cadastro e então promova-a a administrador:

```bash
docker compose exec backend python -m scripts.check_admin voce@exemplo.com
```

O script encontra a conta pelo e-mail, marca como admin e ativa — a instalação
nova não tem nenhum usuário privilegiado até esse passo.

### Modelos locais (opcional)

Por padrão a transcrição usa a API do Groq e a busca usa embeddings locais leves.
Para rodar tudo self-hosted, sem enviar áudio a terceiros:

```bash
docker compose --profile ml up -d
```

Isso sobe `faster-whisper` (large-v3-turbo, INT8) e o serviço de embeddings
(`multilingual-e5-base` + reranker). Baixa alguns GB de modelo no primeiro start
e pede uns 8 GB de RAM. Sem esse perfil, 4 GB bastam.

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
              ┌─────────────┴─────────────┐   (perfil "ml", opcional)
        ┌─────▼─────┐              ┌──────▼──────┐
        │  whisper  │              │  embedder   │
        └───────────┘              └─────────────┘
```

Detalhamento em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Outros documentos
úteis: [`docs/features.md`](docs/features.md) (capacidades por módulo),
[`docs/SETUP.md`](docs/SETUP.md) (serviços externos),
[`docs/QYTHON_LGPD_PLAN.md`](docs/QYTHON_LGPD_PLAN.md) (modelo de compliance).

## Privacidade e escolha de modelo

O Qython foi construído para lidar com dado clínico, e isso impõe uma escolha que
vale entender antes de configurar:

- **Redação de PII** (`backend/middleware/pii_redaction.py`) roda com Presidio antes
  de qualquer chamada a LLM externo. Nomes, CPF, CNS, CRM, telefone e e-mail são
  substituídos por marcadores. ⚠️ O Presidio precisa de um modelo do spaCy, que
  não vem no `pip install`. Sem ele o sistema **não deixa de redigir**, mas cai
  num detector por regex, mais fraco — e avisa só no log. Para a redação forte:
  ```bash
  docker compose exec backend python -m spacy download pt_core_news_lg
  ```
- **Criptografia em repouso** (Fernet) nos campos sensíveis de usuário, paciente e
  consulta. As chaves vêm de `QYTHON_FIELD_KEK` e `QYTHON_TOKEN_KEK`.
- **Audit log append-only** com trigger no Postgres que rejeita UPDATE e DELETE.

⚠️ **O tier gratuito da API do Gemini permite que o Google use os dados enviados para
melhorar os produtos deles.** Para qualquer uso com dado de paciente real, use uma
chave do tier pago, onde isso não se aplica. Para estudo e testes, o tier gratuito
está ok.

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

[Apache License 2.0](LICENSE) — uso comercial permitido, modificação permitida,
com concessão expressa de patente. Veja [NOTICE](NOTICE) para as dependências de
terceiros, que têm licenças próprias.
