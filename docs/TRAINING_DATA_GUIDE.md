# Qython Training Data Pipeline Guide

> Guia completo do sistema de coleta, enriquecimento e exportação de dados para treinar o Qython-1.
>
> **Heads up sobre source types descontinuados (maio/2026):** todas as
> entradas relacionadas a `surgical_*`, `anesthesia_*` e `plantao_*`
> são **históricas**. Os módulos Centro Cirúrgico e Modo Plantão foram
> removidos em maio/2026 (zero adoção em ambos). Esses source types
> continuam citados aqui apenas como referência ao desenho original;
> nenhum dado novo é coletado nessas categorias.

## Visão Geral

O Qython coleta dados de treinamento de 7 módulos ativos da plataforma
(Copilot, Consultations, Library RAG, Academic Materials, Pharmacy,
Patient Orientations, Documents). Cada entrada passa por validação,
enriquecimento de metadados e classificação automática antes de ser
salva.

> **LGPD (atualizado em maio/2026):** a coleta deixou de ser opt-out e
> passou a respeitar um **consent gate** com **dois trilhos de
> anonimização**. Antes de salvar qualquer entrada, o coletor:
> 1. checa consentimento ML ativo do usuário (opt-in granular — ver
>    `docs/QYTHON_LGPD_PLAN.md`);
> 2. roda PII detection (Presidio PT-BR) sobre o conteúdo;
> 3. roteia para o trilho **pseudo** (usuário consentiu, PII tokenizada)
>    ou **anon** (sem consentimento → anonimização irreversível, Art. 12);
> 4. dados de **paciente** vão SEMPRE para o trilho anon, com redação
>    inline; se a confiança da redação for < 0,8, a entrada é descartada.
>
> Campos novos em `TrainingData`: `consent_id` (FK → user_consents),
> `anonymization_level` (`pseudo` | `anon`), `excluded_due_to_revocation`.

## Arquivos Principais

| Arquivo | Função |
|---------|--------|
| `backend/services/data_collector_service.py` | Coleta principal (`collect_data()`) + consent gate + roteamento pseudo/anon |
| `backend/middleware/pii_redaction.py` | PII detection/redação (Presidio PT-BR + recognizers BR) + `assess_for_training()` |
| `backend/services/pii_detector.py` | Detector regex legado (fallback do Presidio) — 14 países |
| `backend/services/consent_service.py` | Consentimento versionado (grant/revoke/check) + mapa source_type → escopo ML |
| `backend/services/anonymization_service.py` | Generalização + suppression + K-anonimato (≥ 5) |
| `backend/services/encryption_service.py` | Fernet field-level (`EncryptedString/JSON`) + `pseudonymize()` |
| `backend/services/export_validator_service.py` | Pre-export validator (consent ativo, PII recheck) + `DatasetExportLog` |
| `backend/services/preference_service.py` | Pares de preferência DPO + exportação validada |
| `backend/services/rlaif_service.py` | AI-as-Judge batch + self-play + holdout set |
| `backend/services/citation_collector.py` | Dados de treinamento com citações |
| `backend/services/self_critique_service.py` | Auto-avaliação Constitutional AI |
| `backend/routes/feedback_routes.py` | Vinculação de feedback ao TrainingData |
| `backend/services/quality_decay_service.py` | Detecção de model collapse + readiness assessment |
| `backend/services/refinement_tracking_service.py` | Rastreamento de cadeias de refinamento |
| `backend/services/scheduler.py` | Jobs semanais RLAIF + self-play + quality snapshot |

## Source Types

| source_type | Módulo | creation_method | bloom_level | quality padrão |
|-------------|--------|-----------------|-------------|----------------|
| consultation_raw_only | Consultas | human | remember | 0 (auto_ready) |
| consultation_improvement | Consultas | hybrid | analyze | 0 (auto_ready) |
| consultation_summary | Consultas | ai_generated | understand | 0 (auto_ready) |
| draft_generation | Consultas | ai_generated | create | 0 |
| summary_generation | Consultas | ai_generated | understand | 0 (auto_ready) |
| icd10_extraction | Consultas | ai_generated | understand | 0 |
| chat_interaction | Copiloto | ai_generated | evaluate | 0 |
| chat_clinical_discussion | Copiloto | ai_generated | evaluate | 0 |
| library_rag_chat | Biblioteca | ai_generated | analyze | 0 |
| podcast_script | Acadêmico | ai_generated | create | 0 (auto_ready) |
| video_lesson_script | Acadêmico | ai_generated | create | 0 (auto_ready) |
| study_material_* | Acadêmico | ai_generated | create | 0 (auto_ready) |
| simulado_generation | Acadêmico | ai_generated | evaluate | 0 |
| surgical_report_manual | Cirurgia | human | create | 3 (platinum) |
| surgical_report_ai | Cirurgia | hybrid | create | 2 (gold) |
| surgical_report_generated | Cirurgia | ai_generated | create | 0 |
| surgical_report_regeneration | Cirurgia | ai_generated | create | 0 (DPO pair) |
| surgical_drug_administration | Cirurgia | ai_generated | apply | 1 (auto_ready) |
| surgical_outcome_prediction | Cirurgia | ai_generated | evaluate | 2 (auto_ready) |
| patient_orientation_* | Orientações | ai_generated | apply | 0 (auto_ready) |
| prescription | Prescrições | human | apply | 0 (auto_ready) |
| medical_document_* | Documentos | hybrid | evaluate | 0 (auto_ready) |
| exam_order | Exames | human | apply | 0 |
| exam_request | Exames | hybrid | apply | 0 |
| clinical_term_normalization | Pacientes | ai_generated | understand | 0 |
| clinical_history_parsing | Pacientes | ai_generated | understand | 0 |
| citation_grounded | Copiloto | ai_generated | analyze | 1 |

**Nota:** Source types com `*` usam naming dinâmico (ex: `study_material_flashcards`, `medical_document_atestado`). Os mapas de classificação fazem match por prefixo.

## Quality Score System

| Score | Label | Significado |
|-------|-------|-------------|
| -2 | rejected | Filtrado automaticamente (placeholder, vazio, etc.) |
| -1 | dislike | Usuário deu dislike |
| 0 | neutral | Sem feedback |
| 1 | like | Usuário deu like / salvo explicitamente |
| 2 | gold | Relatório cirúrgico IA (revisado por médico) |
| 3 | platinum | Relatório cirúrgico manual (100% humano) |

## ready_for_training Logic

Uma entrada fica `ready_for_training = True` quando:
1. **auto_ready**: source_type inicia com um dos `trusted_source_prefixes` E output > 300 chars, OU
2. **quality >= 1**: usuário deu like/gold/platinum, OU
3. **AI judge**: score médio ≥ 3.5 (via RLAIF batch)

Exceções:
- Entries com `is_evaluation_holdout = True` têm `ready_for_training = False`
- Entries com `quality_score = -2` nunca ficam ready

## PII Detection & Redação (atualizado maio/2026)

A detecção agora usa **Microsoft Presidio** com NLP PT-BR
(`pt_core_news_lg`) + **recognizers brasileiros customizados** (CPF, CNS,
CEP, CRM, RG, telefone) e um recognizer de nome-com-contexto-clínico
(captura "Paciente João da Silva" mesmo quando o NER genérico falha). Se o
Presidio não estiver disponível, cai no `pii_detector.py` regex legado
(14 países: BR, AR, CL, UY, PY, CO, MX, PE, ES, PT, US, UK + genérico).

Onde roda (não é mais só na exportação):
1. **Antes de toda chamada a LLM externo** (`llm_services._redact_llm_contents`)
   — Gemini/OpenAI/Anthropic recebem texto com PII já redigida
   (`[PATIENT_NAME]`, `[CPF]`, `[DATE]`, ...).
2. **Na coleta de training_data** (`assess_for_training`) — decide trilho:
   - PII de paciente com confiança ≥ 0,8 → redação inline + trilho **anon**
   - PII de paciente com confiança < 0,8 → **entrada descartada**
   - sem PII de paciente → trilho conforme consentimento do usuário
3. **No pre-export validator** — recheck de PII antes de gerar o dataset.

`pii_detected` continua sendo marcado no DB para auditoria. A diferença
chave: PII de paciente agora **bloqueia/redige** em vez de só sinalizar.

## Feedback Matching

Quando um usuário dá like/dislike, o `feedback_routes.py` vincula ao TrainingData correto:

1. **FEEDBACK_TO_SOURCE map**: content_type → source_types
   - `chat_response` → `chat_interaction`, `chat_clinical_discussion`
   - `improved_notes` → `consultation_improvement`, `consultation_raw_only`, `draft_generation`
   - `summary` → `summary_generation`
   - `icd10_extraction` → `icd10_extraction`
   - `library_rag_chat` → `library_rag_chat`
   - `surgical_report` → `surgical_report_generated`, `surgical_report_ai`, `surgical_report_manual`

2. **Match strategy**: prefixo do conteúdo original (300 chars) vs output_data (500 chars)
3. **Fallback**: candidato único recente (< 10 min)
4. **Like promove**: se entry não era ready_for_training, fica ready

## RLAIF Pipeline

### AI-as-Judge (Semanal)
- **Scheduler**: Domingo 2 AM UTC, batch de 50 entries
- **Critérios**: accuracy (0-5), completeness (0-5), safety (0-5), style (0-5)
- **Score ≥ 3.5**: marca ready_for_training
- **Score < 2.0**: flagged como low_quality
- **Modelo**: Gemini Flash Lite (barato)
- **Admin trigger**: `POST /api/admin/ml/rlaif/run`

### Self-Play (Semanal)
- **Scheduler**: Domingo 3 AM UTC, batch de 20
- **Inputs**: quality ≥ 2 de chat/consultation/library_rag/summary
- **Geração**: T=0.3 (conservative) vs T=0.9 (creative)
- **Judge**: LLM-as-Judge determina vencedor
- **Output**: PreferenceData com `preference_source='self_play'`
- **Admin trigger**: `POST /api/admin/ml/self-play/run`

## Exportação

> **Pre-export validator (obrigatório, LGPD):** SFT e DPO passam por
> `export_validator_service` antes de gerar o arquivo. Para cada entrada
> ele dropa quem revogou consentimento, expirou, teve a conta excluída, ou
> falha no recheck de PII; e registra um `DatasetExportLog` com hash do
> dataset + snapshot dos consentimentos ativos (prova de minimização,
> Art. 12 + Art. 37). O resumo de exclusões vem no header
> `X-Qython-Export-Summary`.

### SFT (Supervised Fine-Tuning)
`GET /api/admin/export/sft/jsonl`

Filtros: source_type, creation_method, bloom_level, max_generation, exclude_pii

```json
{"instruction": "...", "output": "...", "metadata": {"source_type": "...", "creation_method": "...", "bloom_level": "...", "anonymization_level": "anon", ...}}
```

### DPO (Direct Preference Optimization)
`GET /api/admin/export/dpo/jsonl` | `GET /api/admin/export/dpo/parquet`

```json
{"prompt": "...", "chosen": "...", "rejected": "...", "metadata": {"preference_source": "...", "confidence_score": 0.9}}
```

### Evaluation Holdout
`POST /api/admin/ml/holdout/build?target_count=500`

Seleciona top-quality entries (quality ≥ 2, sem PII) e marca como holdout. NUNCA exportadas para treino.

## Prevenção de Model Collapse

1. **generation_number**: Filtra export com `max_generation=1` para evitar treinar em dados sintéticos de gerações anteriores
2. **creation_method**: Manter mínimo 30% de dados humanos no batch de treino
3. **Evaluation holdout**: Set fixo para medir degradação de qualidade ao longo das versões
4. **PII filtering**: Dados com PII excluídos do export por padrão

## Admin Endpoints

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/admin/ml/stats` | GET | Estatísticas completas do pipeline |
| `/api/admin/ml/holdout/build` | POST | Construir/expandir eval set |
| `/api/admin/ml/rlaif/run` | POST | Trigger manual RLAIF batch |
| `/api/admin/ml/self-play/run` | POST | Trigger manual self-play |
| `/api/admin/export/sft/jsonl` | GET | Export SFT com filtros |
| `/api/admin/export/dpo/jsonl` | GET | Export DPO JSONL |
| `/api/admin/export/dpo/parquet` | GET | Export DPO Parquet |
| `/api/admin/export/dpo/stats` | GET | Estatísticas DPO |
| `/api/admin/ml/pii/rescan` | POST | Re-scan all entries with current PII patterns |
| `/api/admin/ml/quality/snapshot` | POST | Criar snapshot de qualidade |
| `/api/admin/ml/quality/history` | GET | Histórico de snapshots |
| `/api/admin/ml/quality/readiness` | GET | Avaliação de prontidão para fine-tuning |
| `/api/admin/ml/refinements/stats` | GET | Estatísticas de refinamentos |
| `/api/admin/ml/refinements/chain/{id}` | GET | Cadeia completa de um entry |
| `/api/admin/export/refinement-pairs/jsonl` | GET | Export pares de refinamento DPO |
| `/api/admin/ml-dataset-stats` | GET | Stats legacy (training + surgical) |
