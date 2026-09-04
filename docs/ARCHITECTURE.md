# Arquitetura do Sistema Qython

> **Última atualização:** 30 de Maio de 2026

## 1. Fluxo de Autenticação e "Soft Block"

O Qython utiliza uma estratégia de retenção chamada "Soft Block" para usuários na lista de espera.

1. **Registro:** Usuário cria conta (Google ou Email).
2. **KYC:** Documentos são enviados e analisados pelo **Gemini 3.5 Flash**.
   - *Aprovado:* Status `verified`.
   - *Dúvida:* Status `manual_review` (Acesso liberado, mas limitado).
   - *Rejeitado:* Status `rejected` (Bloqueio total).
3. **Waitlist:**
   - Se não tiver convite, status é `waitlist`.
   - O usuário **consegue logar**, mas é redirecionado forçadamente para `/waitlist`.
   - Lá, ele pode inserir um token para virar `active` instantaneamente.

## 2. Data Flywheel (Estratégia de Dados)

O objetivo do Qython é treinar o modelo proprietário **Qython-1**. Para isso, coletamos dados de alta qualidade de todas as interações de IA na plataforma.

Ver `docs/ML_ROADMAP.md` para documentação detalhada do pipeline completo.

### Tabela: `training_data`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `source_type` | String | Origem: consultation_improvement, chat_interaction, podcast_script, etc. |
| `input_data` | Text | Entrada do usuário/contexto |
| `output_data` | Text | Saída gerada pela IA |
| `quality_score` | Integer | -2=rejeitado, -1=dislike, 0=neutro, 1=like, 2=gold, 3=platinum |
| `creation_method` | String | 'human', 'ai_generated', 'hybrid' |
| `generation_number` | Integer | 0=humano, 1=primeira IA, N+1=modelo treinado em gen N |
| `bloom_level` | String | Taxonomia de Bloom: remember→create |
| `difficulty_score` | Float | 0.0-1.0 para curriculum learning |
| `pii_detected` | Boolean | PII detectado (CPF, CRM, etc.) |
| `consent_id` | FK | Consentimento ML que autorizou a captura (NULL = legado/anon) |
| `anonymization_level` | String | `pseudo` (consentido, tokenizado) ou `anon` (irreversível, Art. 12) |
| `excluded_due_to_revocation` | Boolean | Removido do pool por revogação/exclusão de conta |
| `is_evaluation_holdout` | Boolean | Reservado para eval, nunca treinar |
| `ready_for_training` | Boolean | Aprovado para uso em fine-tuning |
| `content_hash` | String | Hash MD5 para deduplicação |

### Tabela: `preference_data`

Pares chosen/rejected para DPO training:
| Campo | Tipo | Descrição |
|-------|------|-----------|
| `prompt` | Text | Contexto/pergunta original |
| `chosen` | Text | Resposta preferida |
| `rejected` | Text | Resposta rejeitada |
| `preference_source` | String | 'human', 'llm_judge', 'implicit', 'self_play' |
| `confidence_score` | Float | 0.0-1.0 |

### Pipeline de Coleta

Todas as rotas chamam `collect_data()` que automaticamente:
1. **Consent gate (LGPD):** checa consentimento ML ativo do usuário; sem isso, roteia para o trilho anon
2. **PII assessment (Presidio):** PII de paciente → redação inline (ou descarte se confiança < 0,8) + força trilho anon
3. Valida qualidade (tamanho, placeholders, conteúdo real)
4. Classifica: creation_method, bloom_level, generation_number
5. Define `anonymization_level` (pseudo/anon) e `consent_id`
6. Calcula difficulty_score + gera hash para deduplicação
7. Salva com savepoint (não bloqueia transação principal)

### Pipeline RLAIF (Semanal)

Jobs automáticos no scheduler (domingo):
- **2:00 AM UTC:** AI-as-Judge avalia entries com quality=0 (accuracy, completeness, safety, style)
- **3:00 AM UTC:** Self-play gera pares sintéticos de preferência

### Quality Decay Detection (Semanal)

Job automático no scheduler (segunda):
- **1:00 AM UTC:** Snapshot de qualidade com métricas + alertas + health status
- Monitora model collapse: quality score, % dados humanos, % generation > 1
- Alertas automáticos (warning/critical) quando thresholds são violados
- Training Readiness Assessment: 6 checks para avaliar prontidão para fine-tuning

**Tabela:** `quality_snapshots` (snapshot_data JSON, alerts JSON, health_status)

### Iterative Refinement Tracking

Rastreia cadeias de refinamento (original → refinado) para treinar auto-melhoria:
- `self_critique`: auto-refinado pelo Constitutional AI
- `user_edit`: médico editou output da IA
- `regeneration`: usuário pediu nova resposta
- `rlaif_judge`: AI judge flagou e re-gerou

**Tabela:** `refinement_chains` (original_id → refined_id, step, type)
**Export:** DPO JSONL com pares (rejected=original, chosen=refined)

### Feedback Matching

Feedback do usuário (like/dislike) é vinculado ao TrainingData correto via:
1. Mapa `FEEDBACK_TO_SOURCE`: content_type → source_types
2. Match por prefixo de conteúdo (não apenas "última entrada")
3. Feedback history acumula como array no metadata

**Módulos cobertos:** chat, consultas (improved_notes, summary, icd10), biblioteca (library_rag_chat), materiais acadêmicos.

### Tratamento de Imagens (Training Data)

- **Compressão:** WebP com qualidade 80%
- **Redimensionamento:** Max 1024px no maior lado (padrão VLM)
- **Armazenamento:** Disco local em `/training_dataset/`
- **Referência:** Caminho salvo no `input_data` como JSON

### Document Image Extraction & Vision Pipeline (Março 2026)

Pipeline multimodal em duas fases para extrair e descrever imagens médicas de PDFs da biblioteca:

**Fase 1 — Durante upload (sem custo, imediata):**
- `file_processing_service.extract_images_from_pdf()` usa PyMuPDF (`page.get_images()` + `doc.extract_image()`)
- Filtro heurístico local (`_is_likely_medical_image()`) descarta logos, gradientes, ícones — analisa variância de cor, aspect ratio, tamanho mínimo (250px, 5KB)
- Imagens salvas em `/static/uploads/document_images/{document_id}/`
- Registros `DocumentImage` criados com `vision_status='pending'`
- **Documento marca `processed` normalmente** — extração de imagens nunca bloqueia

**Fase 2 — Processamento agendado (Gemini Flash Lite, gratuito):**
- `vision_service.process_pending_vision_batch()` processa imagens em lotes
- Envia cada imagem para Gemini 2.5 Flash-Lite com prompt médico (classifica MEDICAL vs NON-MEDICAL)
- Auto-throttle: RPM counter, para se rate-limited (defere para próximo ciclo)
- Scheduler: batch grande 1:00 AM UTC (100 imgs) + catch-up cada 4h (25 imgs)

**Integração com RAG e materiais:**
- Descrições médicas indexadas no ChromaDB via `vector_db_service.store_image_descriptions()`
- IDs: `doc_{id}_img_{img_id}` (sem colisão com text chunks)
- Metadata: `content_type: "image_description"`, `page_number`
- `get_all_text_for_library()` inclui seção `--- MEDICAL IMAGES IN THIS DOCUMENT ---` no contexto de geração de materiais

**Integração com Training Data (Data Flywheel):**
- Pares imagem+descrição salvos automaticamente via `collect_data(source_type='image_diagnosis')`
- Imagens comprimidas para WebP 1024px no `training_dataset/`
- Classificação: `creation_method='ai_generated'`, `bloom_level='analyze'`

**Modelo:** `DocumentImage` (tabela `document_images`, migration `2026_03_15_doc_images`)
**Campos:** `document_id`, `library_id`, `image_filename`, `page_number`, `image_index`, `width`, `height`, `file_size_bytes`, `vision_status`, `vision_description`, `vision_model`, `vision_error`, `retry_count`, `vision_completed_at`

### Otimização de Processamento de PDFs (Março 2026)

O processamento de documentos tenta **extração direta de texto** (PyMuPDF `page.get_text()`) antes de recorrer ao OCR:

1. `extract_text_direct(filepath)` — instantâneo, zero temp files
2. Se < 100 chars extraídos → PDF escaneado → fallback para OCR (render 300dpi + Tesseract)
3. PDFs digitais (maioria dos livros médicos) processam em **segundos** ao invés de 30+ minutos

### Biblioteca Drive-first — Conectores de nuvem do usuário (Julho 2026)

Os arquivos ORIGINAIS da Biblioteca moram na nuvem do PRÓPRIO usuário (v1 Google Drive, scope não-sensível `drive.file`); o servidor **não retém original nenhum** — só os derivados (texto/transcrição no ChromaDB, embeddings, thumbnails, `document_images`).

- **Camada** `backend/services/cloud_storage/` — contrato provider-agnostic (`base.py`) + adapter Google Drive v3 (`gdrive.py`, aiohttp, sem SDK). `services/connector_service.py` minta access tokens sob demanda (refresh token cifrado em repouso via `EncryptedString`; access token nunca persistido). Rotas `/api/connectors/*`.
- **Pipeline write-through** (`library_service`): upload → temp em `library_staging/` → sobe pro Drive do usuário (pasta "Qython") → processa (extração/OCR/transcrição → Chroma) → descarta o temp e zera `storage_path`. `_process_document_task` re-baixa do Drive se o temp sumir; retry e delete são Drive-aware.
- **Gate** via env `CLOUD_LIBRARY_REQUIRED` (default OFF): write-through é oportunista (quem conectou já usa Drive); com a flag ON, adicionar arquivo EXIGE nuvem conectada. UI: seção Conectores (web Perfil / mobile Mais) + banner na Biblioteca.
- **Migração de legado** (`scripts/migrate_docs_to_drive.py` + `schedule_legacy_migration` no pós-connect): docs server-side sobem pro Drive do dono ao conectar.

Detalhe completo e gotchas: cadeia de migrations no `CLAUDE.md` (`2026_07_10_cloud_connections`, `2026_07_11_docs_drive_fields`).

## 3. Stack de IA (Junho 2026)

| Função | Modelo | Configuração | Custo |
|--------|--------|--------------|-------|
| **Chat Copiloto / RAG** (alto volume) | **Gemini 3.1 Flash-Lite** (`CHAT_LLM_MODEL`) | `CHAT_THINKING_LEVEL="high"` | $0.25/$1.50 por 1M tokens |
| **Consultas / Resumos / Relatórios** | Gemini 3.5 Flash (`PRIMARY_LLM_MODEL`) | `thinking_level="HIGH"` | $1.50/$9.00 por 1M tokens |
| **Análise de Imagens** | Gemini 3.5 Flash (`MEDICAL_IMAGE_ANALYST_MODEL`) | `thinking_level="HIGH"` | $1.50/$9.00 por 1M tokens |
| **Tarefas Simples** (título/normalização) | Gemini 2.5 Flash-Lite | thinking minimal | $0.10/$0.40 por 1M tokens |
| **Fallback** | Gemini 3.1 Flash-Lite | `thinking_level="HIGH"` | $0.25/$1.50 por 1M tokens |
| **Geração de Imagem** | Nano Banana 2 | `gemini-3.1-flash-image` (avatar, stock, mapas) | ~$0.045 por img |
| **Embeddings (RAG)** | all-MiniLM-L6-v2 / e5-base | Local | Gratuito |
| **TTS (Podcast/Video)** | Google TTS | API | Por uso |

> **⚠️ Roteamento de custo (Jun/2026):** o chat do copiloto + RAG (alto volume) foram **roteados do 3.5-flash para o `gemini-3.1-flash-lite`** (`CHAT_LLM_MODEL`, ~16-27× mais barato em perguntas de raciocínio). Motivo: o 3.5-flash + thinking HIGH dava **margem NEGATIVA** (~$0.06-0.09/chat — o thinking gera 5.700-7.900 tokens cobrados como output a $9/1M, custo que a tabela de margens do `BILLING_ECONOMICS` ignorava). A/B validou: lite é clinicamente sólido e correto. No modelo barato o thinking HIGH é afordável (~$0.003), então o raciocínio foi mantido. `CHAT_LLM_MODEL` e `CHAT_THINKING_LEVEL` são tunáveis por `.env` sem deploy. Custo real instrumentado no log (`[COST] in/out/think → $`).

### Gemini 3.5 Flash - Modelo Principal

- **Lançamento:** maio/2026 (GA). Substituiu o `gemini-3-flash-preview`.
- **Performance:** supera o Gemini 3.1 Pro em agentic/coding; ~4× mais rápido que frontier
- **Context Window:** 1M tokens input, 64K tokens output
- **Thinking Levels:** `MINIMAL`, `LOW`, `MEDIUM`, `HIGH` (usado no Qython)
- **Temperatura:** 1.0 recomendada para raciocínio otimizado
- **Custo:** $1.50/$9.00 por 1M — 3× o antigo 3-flash (ver impacto de margem no BILLING_ECONOMICS)

### Gemini 3.1 Flash-Lite - Fallback

- **Context Window:** 1M tokens input, 64K tokens output
- **Custo:** $0.25/$1.50 por 1M
- **Uso:** fallback automático quando o primário falha/timeout

### Recursos Avançados

- **Google Search Grounding:** Busca em tempo real para referências científicas (1,500 queries/dia grátis)
- **Thinking Mode:** Raciocínio dinâmico - modelo decide profundidade automaticamente

## 4. Arquitetura de Rotas API

### Principais Endpoints

```
/api/auth           → Autenticação (login, registro, verificação, forgot/reset password)
/api/user           → Perfil, estatísticas, direitos LGPD (data-export, delete, consents, audit-log)
/api/consultations  → CRUD de consultas, geração de drafts/summaries
/api/copilot        → Chat com IA (Copiloto Clínico)
/api/academic       → Biblioteca, Arena, Materiais
/api/connectors     → Conectores de nuvem do usuário (OAuth Google Drive, status, Picker)
/api/billing        → Dracmas, Stripe, transações
/api/orientations   → Orientações ao paciente (templates + geração IA)
/api/medications    → Catálogo de medicamentos, Farmácia Popular, interações
/api/pharmacy       → Farmácias parceiras, redes, inventário, waitlist
/api/public         → Receita pública (QR code), farmácias próximas (sem auth)
/api/admin          → Dashboard, gerenciamento de usuários
/api/feedback       → Sistema de feedback (likes/dislikes)
/api/sync           → Sync offline (medications, interactions, user-data)
/api/notifications  → Notification center, preferences, unread count
```

### Rotas de Orientações ao Paciente (`/api/orientations`)

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/orientations` | Lista orientações do médico (filtro opcional por `patient_id`) |
| `POST` | `/api/orientations` | Salva orientação (template ou conteúdo editado) |
| `POST` | `/api/orientations/generate` | Gera orientação personalizada via IA (5 dracmas) |
| `GET` | `/api/orientations/{id}` | Busca orientação específica por ID |
| `GET` | `/api/orientations/{id}/pdf` | Gera PDF da orientação (com cabeçalho médico/paciente) |
| `DELETE` | `/api/orientations/{id}` | Remove orientação |

**Model:** `PatientOrientation` (campos: `doctor_id`, `patient_id`, `generation_type`, `template_key`, `title`, `content`, `ai_prompt`, `specialty`, `created_at`)

### Rotas do Módulo Farmácia

#### Medicamentos (`/api/medications`)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `GET` | `/api/medications` | Autenticado | Buscar medicamentos (search, filtros, country filtra resultados, lang aplica traduções) |
| `GET` | `/api/medications/farmacia-popular` | Autenticado | Lista completa Farmácia Popular (42 itens, todos gratuitos) |
| `GET` | `/api/medications/government-programs` | Autenticado | Listar programas governamentais (BR: Farmácia Popular; UY: FNR, ASSE) |
| `GET` | `/api/medications/government-programs/{code}` | Autenticado | Detalhe do programa governamental |
| `GET` | `/api/medications/{id}` | Autenticado | Detalhe do medicamento |
| `POST` | `/api/medications/check-interactions` | Autenticado | Verificar interações medicamentosas (0 dracmas) |

#### Farmácias (`/api/pharmacy`)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `GET` | `/api/pharmacy` | Público | Listar farmácias (geo, cidade, estado) |
| `GET` | `/api/pharmacy/{id}` | Público | Detalhe da farmácia + catálogo |
| `GET` | `/api/pharmacy/{id}/medications` | Público | Catálogo de medicamentos da farmácia |
| `GET` | `/api/pharmacy/chains` | Admin | Listar redes de farmácia |
| `POST` | `/api/pharmacy/chains` | Admin | Criar rede |
| `PUT` | `/api/pharmacy/chains/{id}` | Admin | Atualizar rede |
| `POST` | `/api/pharmacy` | Admin | Criar farmácia |
| `PUT` | `/api/pharmacy/{id}` | Admin | Atualizar farmácia |
| `DELETE` | `/api/pharmacy/{id}` | Admin | Desativar farmácia (soft delete) |
| `POST` | `/api/pharmacy/{id}/medications` | Admin | Atualizar inventário (bulk) |
| `POST` | `/api/pharmacy/waitlist` | Público | Formulário de interesse (rate limited) |
| `GET` | `/api/pharmacy/waitlist` | Admin | Listar waitlist |
| `GET` | `/api/pharmacy/chains/{id}/metrics` | Admin | Métricas agregadas da rede |

#### Rotas Públicas (`/api/public`)

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `GET` | `/api/public/prescription/{token}` | Nenhum | Dados da receita + farmácias próximas (via QR code) |
| `GET` | `/api/public/pharmacies/nearby` | Nenhum | Farmácias perto de coordenadas |

**Models:** `Medication`, `DrugInteraction`, `GovernmentProgram`, `MedicationGovernmentProgram`, `PharmacyChain`, `Pharmacy`, `PharmacyMedication`, `PrescriptionShare`, `PharmacyPrescription`, `PharmacyWaitlist`

## 5. Diagrama de Fluxo

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Frontend  │────▶│   FastAPI    │────▶│  PostgreSQL │
│   (React)   │◀────│   Backend    │◀────│  + ChromaDB │
└─────────────┘     └──────────────┘     └─────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Google Gemini│
                    │  2.5 / 3.0   │
                    └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │Google Search │
                    │  Grounding   │
                    └──────────────┘
```

## 6. Sistema de Logging

O Qython implementa logging profissional com as seguintes características:

| Aspecto | Configuração |
|---------|--------------|
| **Rotação** | 10MB por arquivo, 10 backups |
| **Compressão** | gzip automático em arquivos rotacionados |
| **Limite Total** | ~100MB máximo de logs de aplicação |
| **Journald** | 500MB max, 7 dias retenção, compressão |
| **Formato** | `timestamp \| level \| logger \| message` |
| **Filtros** | Bibliotecas externas silenciadas (httpx, google_genai) |

### Níveis de Log

- **INFO:** Eventos de aplicação (login, requisições, operações)
- **WARNING:** Situações anormais mas recuperáveis
- **ERROR:** Falhas que requerem atenção

## 7. Storage Management e Scheduled Jobs

### Quotas de Armazenamento

O sistema impõe limites de storage por plano de assinatura:

| Plano | Quota | Docs/Biblioteca | Bibliotecas |
|-------|-------|-----------------|-------------|
| free | 500 MB | 20 | 3 |
| resident | 2 GB | 50 | 10 |
| staff | 5 GB | 100 | 25 |
| specialist | 15 GB | ilimitado | ilimitado |

- **Enforcement:** Upload (`413`), criação de biblioteca (`403`), limite de documentos (`403`)
- **Tracking:** `storage_used_bytes` no model `User`, atualizado incrementalmente
- **Serviço:** `backend/services/storage_service.py`

### TTL de Conteúdo Gerado

Arquivos de mídia gerados (podcasts, vídeos, slideshows) expiram em **72 horas**:

- `expires_at` setado no momento da conclusão do job
- Status muda para `expired` após cleanup
- Materiais JSON (flashcards, resumos, etc.) não expiram

### Scheduled Jobs (APScheduler)

| Job | Horário (UTC) | Função |
|-----|---------------|--------|
| `daily_ranking_update` | 3:00 AM | Atualiza rankings da Arena |
| `season_check` | Cada 6h | Verifica/ativa temporadas |
| `dracma_expiration` | 2:00 AM | Processa dracmas expirados |
| `avatar_cleanup` | 3:30 AM | Remove avatares órfãos (não referenciados no DB, > 1h) |
| `chat_images_cleanup` | 4:00 AM | Remove imagens de chat > 30 dias |
| `generated_content_cleanup` | 5:00 AM | Remove mídia expirada, temp files > 24h, thumbnails órfãos |
| `dracma_expiration_notifications` | 10:00 AM | Emails de aviso (30d, 7d, 1d) + push/in-app |
| `notification_cleanup` | 6:00 AM | Remove notificações lidas com 90+ dias |
| `weekly_digest` | Monday 8:00 AM | Email de resumo semanal (consultas, dracmas, arena, streak) |
| `inactivity_check` | 9:00 AM | Emails de inatividade (14d) e aviso de desativação (60d) |
| `welcome_day3` | 10:30 AM | Email de dicas 3 dias após ativação |

## 8. Segurança e Compliance

- **Criptografia:** TLS 1.3 em trânsito + field-level encryption (Fernet) em repouso
- **Rate Limiting:** SlowAPI com limites por endpoint
- **CORS:** Whitelist de domínios permitidos
- **JWT:** Tokens de curta duração com refresh automático
- **KYC:** Verificação de documentos via IA (CRM, Carteirinhas)

### Camada de Compliance LGPD (interno, maio/2026)

Compliance LGPD é resolvido dentro do Qython — sem depender de terceiros.
Plano completo em `docs/QYTHON_LGPD_PLAN.md`.

| Componente | Implementação |
|------------|---------------|
| Field-level encryption | `services/encryption_service.py` — `EncryptedString`/`EncryptedJSON` (Fernet). Aplicado em `User` (cpf, phone), `Patient` (nome, doc, contato, histórico clínico, alergias...) e `Consultation` (raw_notes, summary, etc.). Colunas viram BYTEA. |
| Chaves (KEK) | `QYTHON_FIELD_KEK` (encryption) + `QYTHON_TOKEN_KEK` (pseudonimização/lookup_hash). Em env, gitignored. |
| Consentimento | `services/consent_service.py` + modelos `ConsentDocument` (imutável, versionado, content_hash) e `UserConsent` (grant/revoke, partial unique index do consent ativo). 8 documentos: T&C, Privacy + 6 escopos ML opt-in (default OFF, TTL 12 meses). |
| Audit log (Art. 37) | Tabela `audit_log` **append-only** via trigger Postgres que rejeita UPDATE/DELETE. `services/audit_service.py`. Instrumentado em login, patient/consultation/prescription/exam/document CRUD, consent, export, delete. |
| PII redaction (Art. 6 III) | `middleware/pii_redaction.py` — Presidio PT-BR + recognizers BR. Roda antes de toda chamada a LLM externo e na coleta de training_data. |
| Anonimização (Art. 12) | `services/anonymization_service.py` — generalização + suppression + K-anonimato ≥ 5. |
| Pre-export validator | `services/export_validator_service.py` — valida consent ativo + PII recheck antes de gerar SFT/DPO; grava `DatasetExportLog` (prova de minimização). |
| Direitos do titular (Art. 18) | Endpoints em `user_routes`: `GET /api/user/me/data-export` (portabilidade), `DELETE /api/user/me` (eliminação + soft delete + purga async), `GET/POST/DELETE /api/user/me/consents`, `GET /api/user/me/audit-log`. |
| Páginas públicas | `/encarregado` (DPO), `/subprocessors` (categorias, sem nomes), `/paciente` (aviso + QR de transparência). |
| Minimização de divulgação | Sub-operadores e residência de dados publicados por categoria/região, sem nomes de fornecedor nem RUT. Detalhe nominal só sob demanda ao Encarregado. |

## 9. Monitoramento de Servidor

O `ServerMonitor` coleta métricas automaticamente:

- **Intervalo:** 60 segundos
- **Métricas:** CPU, RAM, Disco, Conexões ativas
- **Auto-manutenção:** Ativada quando CPU/RAM > threshold
- **Alertas:** Email automático para admins em situações críticas
- **Retenção:** 7 dias de histórico de métricas

## 10. Convenção de Datetime

Todas as datas/horas no sistema são **timezone-aware UTC**:

| Aspecto | Convenção |
|---------|-----------|
| **Python** | `datetime.now(timezone.utc)` (nunca `datetime.utcnow()`) |
| **SQLAlchemy** | `Column(DateTime(timezone=True), ...)` |
| **PostgreSQL** | `TIMESTAMPTZ` (timestamp with time zone) |
| **Model defaults** | `default=lambda: datetime.now(timezone.utc)` |

**Importante:**
- `datetime.utcnow()` está deprecated desde Python 3.12
- `datetime.now()` sem argumento retorna hora local (evitar)
- Migration `2026_02_05_tz` converteu todas as 67 colunas existentes

## 11. Arquitetura Mobile (React Native)

### Estrutura Monorepo

```
packages/
├── web/         → React (Vite) — app web
├── mobile/      → React Native 0.84 — Android/iOS
└── shared/      → Types, constants compartilhados
```

### Stack Mobile

| Camada | Tecnologia |
|--------|-----------|
| **Framework** | React Native 0.84 + TypeScript |
| **Navegação** | React Navigation 7 (Bottom Tabs + Drawer) |
| **Animação** | Reanimated 4 + Gesture Handler |
| **HTTP** | Axios com interceptors (Bearer + 401 handling) |
| **Storage** | AsyncStorage (tokens, preferências) + MMKV (offline data cache) |
| **Auth** | Firebase Auth (Google Sign-In) + JWT backend |
| **Push** | Firebase Cloud Messaging (FCM) |
| **i18n** | i18next + react-i18next (PT/EN/ES) |
| **Markdown** | react-native-markdown-display |

### Adaptive Layout

O hook `useDeviceClass()` retorna a classe do dispositivo baseada na largura da tela:

| Classe | Largura | Layout | Navegação |
|--------|---------|--------|-----------|
| `compact` | < 600dp | Phone | Bottom Tabs (5 itens) |
| `medium` | 600-839dp | Foldable/Tablet pequeno | Drawer permanente (6 itens) |
| `expanded` | ≥ 840dp | Tablet 10"+ | Drawer permanente + multi-pane (futuro) |

### Fluxo de Autenticação Mobile

1. App verifica token no AsyncStorage
2. Se token existe, valida com `GET /api/user/info`
3. Se inválido ou ausente → tela de Login
4. Login via email/senha ou Google Sign-In (Firebase → JWT backend)
5. JWT salvo em AsyncStorage
6. Após login: registra token FCM via `POST /api/user/push-token`

### Módulos Mobile (Paridade Completa com Web)

| Tab | Tela | Status |
|-----|------|--------|
| Copiloto | Chat com IA (markdown, imagens, sessões, rename, feedback, RAG, contexto paciente) | ✅ Implementado |
| Ambulatório | Consultas (24 esp.), pacientes CRUD, prescrições, exames, orientações, voz, timer, undo/redo | ✅ Implementado |
| Farmácia | Medicamentos (busca, filtros, 20 países), insumos, interações, prescrições | ✅ Implementado |
| Acadêmico | Bibliotecas (CRUD + edit), upload, RAG chat, materiais, podcasts, arena, challenges, rankings, difficulty badges | ✅ Implementado |
| Perfil | Avatar, plano, dracmas, tema, idioma, senha, privacidade/consentimentos LGPD, tour system, logout | ✅ Implementado |

### API Endpoints Usados pelo Mobile

| Endpoint | Uso |
|----------|-----|
| `POST /auth/login` | Login email/senha |
| `POST /auth/google` | Login Google (Firebase token) |
| `POST /auth/logout` | Logout |
| `GET /user/info` | Dados do usuário (avatar, plano, dracmas) |
| `POST /user/push-token` | Registrar token FCM |
| `POST /copilot` | Enviar mensagem (multipart/form-data) |
| `GET /copilot/sessions` | Listar sessões |
| `GET /copilot/sessions/:id` | Mensagens de uma sessão |
| `DELETE /copilot/sessions/:id` | Excluir sessão |
| `POST /copilot/feedback` | Like/dislike em mensagem |

### Sync Endpoints (`/api/sync`)

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/sync/medications?since=&country=` | Full dump (~950 medicamentos, ~3.500 linhas `MedicationCountry`) ou delta via `updated_at`. Inclui `country_links` e `brands` |
| `GET` | `/api/sync/interactions?since=` | Full dump (~78 pares) ou delta. Requer migration `2026_02_18_sync_support` |
| `GET` | `/api/sync/user-data?since=` | Patients (by doctor) + últimas 50 consultations. Delta via `updated_at` |

Todos retornam `server_timestamp` (capturado antes da query para evitar race condition), `total_count`, e flag `is_full_sync`.

### Offline Architecture (Mobile)

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   UI (RN)   │────▶│  syncService │────▶│    MMKV     │
│             │◀────│  + queue     │◀────│ (encrypted) │
└─────────────┘     └──────────────┘     └─────────────┘
                           │
                    Online? │ Offline?
                           ▼
                    ┌──────────────┐
                    │  FastAPI     │
                    │  /api/sync/* │
                    └──────────────┘
```

**Key services:**
- `syncService.ts` — Orchestrates delta sync (medications, interactions, user-data). Stale = >1h
- `offlineSearchService.ts` — Local search with filters (country, class, controlled, substring)
- `offlineQueue.ts` — FIFO mutation queue with 3x retry, backoff (1s/5s/15s), temp ID resolution
- `offlineMutations.ts` — Wrappers: online → API + cache; offline → temp record + enqueue
- `storage.ts` — MMKV instance with encryption, typed helpers (`setObject<T>`, `getObject<T>`)

**Conflict resolution:** Last-write-wins (server is authoritative after sync).

### Push Notifications & Notification System

Tabela `push_tokens` armazena tokens FCM/APNs por dispositivo:
- Um usuário pode ter múltiplos tokens (vários dispositivos)
- Token é atualizado (`last_used_at`) a cada login
- Constraint única: (user_id, token)

Tabela `notifications` armazena notificações persistentes para o Notification Center:
- `user_id`, `type`, `title`, `body`, `data` (JSON), `is_read`, `created_at`
- Índices em `user_id`, `type`, `created_at` para consultas rápidas
- Tipos: `material_ready`, `material_failed`, `dracma_expiring`, `kyc_verified`, `kyc_rejected`, `waitlist_activated`, `arena_season_started`, `arena_season_ended`, `system_announcement`

**Notification Service** (`backend/services/notification_service.py`):
- `send_notification()`: persiste no DB + envia push via FCM + broadcast via WebSocket
- `_send_push_to_user()`: itera tokens, envia `messaging.Message()` com config Android/APNS/Web, limpa tokens stale
- `send_notification_to_multiple()`: batch para múltiplos users
- `get_notifications()`: paginação + unread count
- `mark_read()`: individual ou bulk + broadcast unread_count via WebSocket
- `cleanup_old_notifications()`: scheduler job, remove lidas com 90+ dias
- Respeita `user.notification_preferences` (push_enabled, type_overrides)

**WebSocket Manager** (`backend/services/websocket_manager.py`):
- `ConnectionManager`: dict `user_id → set(WebSocket)` para conexões ativas
- `connect(user_id, ws)`: registra conexão
- `disconnect(user_id, ws)`: remove conexão
- `send_to_user(user_id, message)`: broadcast JSON para todas as conexões do user, limpa sockets stale
- Singleton `ws_manager` usado pelo notification_service
- In-process (sem Redis) — polling fallback cobre cross-worker gap

**API Endpoints** (`/api/notifications`):
| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/notifications` | Lista com paginação + unread_count |
| `GET` | `/api/notifications/unread-count` | Badge count (polling leve) |
| `POST` | `/api/notifications/mark-read` | Marca lidas (IDs ou todas) |
| `GET` | `/api/notifications/preferences` | Preferências do user |
| `PUT` | `/api/notifications/preferences` | Atualiza preferências |
| `WS` | `/api/notifications/ws?token=<jwt>` | WebSocket real-time (new_notification, unread_count) |

**Event Triggers**:
- Material generation (podcast/video/simulado) → `material_ready` / `material_failed`
- Dracma expiration warnings → `dracma_expiring`
- KYC verification → `kyc_verified` / `kyc_rejected`
- Arena season activation → `arena_season_started`

### Activity Tracking (`backend/services/activity_service.py`)

Tabela `user_activity` rastreia uso de features para o Analytics Dashboard:

| Feature | Action | Rota |
|---------|--------|------|
| `copilot` | `chat` | `POST /copilot` |
| `consultation` | `generate` | `POST /consultations/draft` |
| `academic` | `material_generate` | `POST /academic/process` |
| `academic` | `rag_chat` | `POST /academic/libraries/{id}/chat` |
| `pharmacy` | `search` | `GET /medications` |

- Fire-and-forget: `track_activity()` adiciona ao session sem flush/commit
- Commit acontece junto com a operação principal da rota
- Erros são logados mas nunca propagados

### Analytics Endpoints (`/api/admin/analytics`)

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/admin/analytics/dau-mau?days=30` | DAU/WAU/MAU diário via `last_login_at` |
| `GET` | `/api/admin/analytics/growth?period=30d` | Registros agrupados por dia |
| `GET` | `/api/admin/analytics/retention?weeks=8` | Matriz de retenção cohort semanal |
| `GET` | `/api/admin/analytics/feature-usage?days=30` | Adoção de features via `user_activity` |
| `GET` | `/api/admin/analytics/ai-usage?days=30` | Uso de IA por tipo + consumo de dracmas |

### Transactional Email Templates

5 templates adicionais ao `email_service.py` (todos i18n PT/EN/ES, design glassmorphism):

| Template | Trigger | `email_tracking` key |
|----------|---------|---------------------|
| `send_material_ready_email` | Podcast/video/simulado completou | — |
| `send_weekly_digest_email` | Scheduler (Monday 8:00 UTC) | `weekly_digest` |
| `send_inactivity_email` | 14 dias sem login | `inactivity_14d` |
| `send_deactivation_warning_email` | 60 dias sem login | `deactivation_60d` |
| `send_welcome_day3_email` | 3 dias após ativação | `welcome_day3` |
