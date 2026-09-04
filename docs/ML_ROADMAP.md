# Qython ML Roadmap

> **Última atualização:** 27 de Maio de 2026
>
> **Heads up sobre fontes removidas:** referências a `surgical_report_*`,
> `surgical_drug_administration`, `surgical_outcome_prediction`,
> `anesthesia_vital_signs`, `anesthesia_alert_feedback` são **históricas**.
> O módulo Centro Cirúrgico foi removido em maio/2026 (zero adoção); as
> tabelas correspondentes (`surgical_*`, `drug_administrations`,
> `vital_signs`, `anesthesia_alerts`) foram dropadas pela migration
> `2026_05_27_drop_surg`. Esses source types continuam citados aqui
> apenas como referência ao desenho original do flywheel; nenhum dado
> novo é coletado nessas categorias.

Este documento detalha o pipeline completo de ML do Qython para treinar o modelo proprietário **Qython-1**.

---

## Implementações Realizadas

### 1. Curriculum Learning - Difficulty Score ✅
**Arquivo:** `backend/services/data_collector_service.py`

Cálculo automático de `difficulty_score` (0.0-1.0):
- Comprimento do conteúdo (15%), vocabulário médico (30%), CIDs (25%), especialidade (20%), contexto (10%)

### 2. Validated References Collection ✅
**Arquivo:** `backend/services/reference_service.py`

Referências validadas (anti-alucinação) salvas em `TrainingData.references`:
- Anti-Hallucination via HEAD request, PubMed/NIH/WHO bypass, metadata enrichment

### 3. Self-Critique / Constitutional AI ✅
**Arquivo:** `backend/services/self_critique_service.py`

5 princípios: Segurança, Acurácia, Completude, Clareza, Ética. Ativado via `ENABLE_SELF_CRITIQUE=1`.

### 4. DPO Preference Data Collection ✅
**Arquivo:** `backend/services/preference_service.py`

- Regeneration pairs com LLM-as-Judge
- Edit diffs como preferência implícita
- Export JSONL/Parquet compatível com TRL/TorchTune

### 5. Engagement Metrics ✅
**Colunas em `training_data`:** `regeneration_count`, `time_to_first_edit_ms`, `total_edit_time_ms`, `accepted_without_edit`

### 6. Feedback Matching Preciso ✅ (Fev 2026)
**Arquivo:** `backend/routes/feedback_routes.py`

- `FEEDBACK_TO_SOURCE` map: content_type do feedback → source_types do TrainingData
- Match por prefixo de conteúdo (não apenas "última entrada")
- Feedback history acumula como array (não sobrescreve)
- Like promove `ready_for_training`

### 7. PII Detection Multi-Country ✅ (Fev 2026, reforçado Mai 2026)
**Arquivos:** `backend/middleware/pii_redaction.py` (Presidio) + `backend/services/pii_detector.py` (regex legado/fallback)

Detecção regex multi-país cobrindo todos os mercados-alvo: BR (CPF, CRM, CEP, RG), AR (DNI, CUIL/CUIT, matrícula), CL (RUT/RUN), UY/PY (CI), CO (CC, NIT), MX (CURP, RFC), PE (DNI), ES (DNI, NIE), PT (NIF, CC), US (SSN, NPI), UK (NHS), + email, telefone internacional, licenças médicas genéricas.

**Atualização Mai/2026 (LGPD):** o detector primário virou **Presidio** com
NLP PT-BR (`pt_core_news_lg`) + recognizers BR + nome-com-contexto-clínico.
A redação agora roda **antes de toda chamada a LLM externo** e **na coleta**
(não só no export). PII de paciente passou a **bloquear/redigir** a entrada
(trilho anon ou descarte se confiança < 0,8), não apenas sinalizar. Ver
`docs/TRAINING_DATA_GUIDE.md` e `docs/QYTHON_LGPD_PLAN.md`.

### 8. Creation Method Tracking ✅ (Fev 2026)
**Coluna:** `training_data.creation_method` (VARCHAR 20)

Auto-inferido do `source_type` com fallback por prefixo para tipos dinâmicos:
- `human`: consultation_raw_only, surgical_report_manual, prescription, exam_order
- `ai_generated`: chat_interaction, library_rag_chat, summary, podcasts, simulado, clinical_*, etc.
- `hybrid`: consultation_improvement, surgical_report_ai, medical_document_*, exam_request

### 9. Data Provenance (Generation Number) ✅ (Fev 2026)
**Coluna:** `training_data.generation_number` (INTEGER)

- `0` = dados humanos puros
- `1` = primeira geração de IA
- `N+1` = modelo treinado em dados de geração N

Previne model collapse: filtrar treino para max 20% de dados geração > 1.

### 10. Bloom's Taxonomy Classification ✅ (Fev 2026)
**Coluna:** `training_data.bloom_level` (VARCHAR 20)

Mapeamento automático para curriculum learning cognitivo:
| Nível | Source Types |
|-------|-------------|
| remember | consultation_raw_only |
| understand | summary_generation, consultation_summary, icd10_extraction, clinical_term_normalization, clinical_history_parsing |
| apply | prescription, exam_order, exam_request, patient_orientation_*, surgical_drug_administration, anesthesia_vital_signs |
| analyze | consultation_improvement, library_rag_chat, citation_grounded |
| evaluate | chat_interaction, medical_document_*, simulado_generation, surgical_outcome_prediction, anesthesia_alert_feedback |
| create | podcast_script, video_lesson_script, study_material_*, surgical_report_*, draft_generation |

Source types dinâmicos (com `*`) usam fallback por prefixo via `BLOOM_LEVEL_PREFIX_MAP`.

### 11. Held-Out Evaluation Set ✅ (Fev 2026)
**Coluna:** `training_data.is_evaluation_holdout` (BOOLEAN)

Endpoint admin `POST /api/admin/ml/holdout/build`:
- Seleciona entries com quality ≥ 2, sem PII, ready_for_training
- Marca como holdout (NUNCA usado para treino, apenas benchmarking)
- Target: 500-1000 exemplos curados

### 12. RLAIF Pipeline (AI-as-Judge) ✅ (Fev 2026)
**Arquivo:** `backend/services/rlaif_service.py`

Job semanal (domingo 2 AM UTC) via `scheduler.py`:
1. Busca TrainingData com quality=0 e ready_for_training=False
2. AI judge (Gemini Flash Lite) avalia em 4 critérios: accuracy, completeness, safety, style (0-5)
3. Score médio ≥ 3.5 → marca ready_for_training
4. Score < 2.0 → flagged como low_quality para revisão

**Admin trigger:** `POST /api/admin/ml/rlaif/run`

### 13. Self-Play Preference Generation ✅ (Fev 2026)
**Arquivo:** `backend/services/rlaif_service.py`

Job semanal (domingo 3 AM UTC):
1. Pega inputs de alta qualidade (quality ≥ 2)
2. Gera 2 respostas: T=0.3 (conservative) vs T=0.9 (creative)
3. AI judge escolhe a melhor
4. Cria PreferenceData com `preference_source='self_play'`

**Admin trigger:** `POST /api/admin/ml/self-play/run`

### 14. Citation-Grounded Training Data ✅ (Fev 2026)
**Arquivo:** `backend/services/citation_collector.py`

Quando o copiloto usa referências do Google Grounding + PubMed:
- Salva par (pergunta → resposta com citações `[1]`, `[2]`)
- Metadata: `references: [{title, url, source, snippet}]`
- Source_type: `citation_grounded`, quality: 1

**Para treinar:** modelo que cita fontes nativamente, reduzindo alucinações.

### 15. Vision Pipeline Training Data ✅ (Março 2026)
**Arquivos:** `backend/services/academic_services/vision_service.py`, `backend/services/data_collector_service.py`

Imagens médicas extraídas de PDFs da biblioteca são descritas pelo Gemini Flash Lite e salvas como training data:
- `source_type='image_diagnosis'` → `creation_method='ai_generated'`, `bloom_level='analyze'`
- Input: prompt + imagem comprimida (WebP 1024px via `compress_image_for_training()`)
- Output: descrição clínica detalhada em inglês
- Metadata: `document_id`, `library_id`, `page_number`, `vision_model`, `width`, `height`
- Feedback (like/dislike) promove `quality_score` como qualquer outro training data

**Para treinar:** modelo multimodal que descreve/analisa imagens médicas (radiografias, ECGs, histologia, lesões, diagramas clínicos).

### 16. Enhanced Export ✅ (Fev 2026)

**SFT Export:** `GET /api/admin/export/sft/jsonl`
- Filtros: source_type, creation_method, bloom_level, max_generation, exclude_pii
- Formato: `{"instruction": "...", "output": "...", "metadata": {...}}`

**DPO Export:** `GET /api/admin/export/dpo/jsonl` e `/parquet`
- Enriquecido com preference_source, confidence_score, generation_number

**ML Stats:** `GET /api/admin/ml/stats`
- By creation_method, bloom_level, generation_number, PII stats, holdout count

---

## Arquitetura do Pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    QYTHON ML DATA PIPELINE                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  COLETA (Real-time)                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐│
│  │ Consultas│  │  Chat    │  │ Cirurgia │  │Acadêmico │  │Anestesia││
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘│
│       └──────────────┴──────────────┴──────────────┘                    │
│                              │                                          │
│                     collect_data()                                       │
│                              │                                          │
│              ┌───────────────┼───────────────┐                          │
│              ▼               ▼               ▼                          │
│        PII Detection   Bloom Level    Creation Method                   │
│        Difficulty Score Generation #   Quality Score                    │
│              └───────────────┼───────────────┘                          │
│                              ▼                                          │
│                      training_data                                      │
│                              │                                          │
│  ENRIQUECIMENTO (Batch/Weekly)                                          │
│              ┌───────────────┼───────────────┐                          │
│              ▼               ▼               ▼                          │
│        RLAIF Judge     Self-Play      Holdout Set                       │
│        (score 0→5)   (T=0.3/0.9)   (top quality)                       │
│              │               │                                          │
│              ▼               ▼                                          │
│       ready_for_training  preference_data                               │
│                                                                         │
│  EXPORTAÇÃO (On-demand)                                                 │
│        ┌──────────┐    ┌──────────┐    ┌──────────┐                    │
│        │ SFT JSONL│    │DPO JSONL │    │  Parquet │                    │
│        └──────────┘    └──────────┘    └──────────┘                    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### 17. Quality Decay Detection ✅ (Fev 2026)
**Arquivo:** `backend/services/quality_decay_service.py`

Monitoramento contínuo de model collapse via snapshots semanais (segunda 1 AM UTC).

**Tabela:** `quality_snapshots` — armazena métricas periódicas + alertas + status de saúde.

**Métricas monitoradas:**
- Distribuição por creation_method (human/ai_generated/hybrid)
- Distribuição por generation_number (previne model collapse)
- Taxa de PII
- Quality score médio dos dados ready_for_training
- Tendência semana-a-semana

**Thresholds de alerta:**
| Métrica | Alerta | Ação |
|---------|--------|------|
| Quality score médio | < 0.80 | Pausar treinamento |
| Quality score médio | < 0.70 | CRITICAL — pausar imediatamente |
| % dados humanos no batch | < 25% | Aumentar coleta humana |
| Dados generation > 1 | > 20% | Filtrar dados sintéticos |
| Queda semana/semana | > 5% | Investigar fontes recentes |
| Taxa de PII | > 10% | Revisar pontos de coleta |

**Training Readiness Assessment:** Endpoint que avalia se o dataset está pronto para fine-tuning com 6 checks (mín. 5000 entries, 25% humanos, holdout ≥ 500, sem alertas críticos, PII < 5%, gen>1 ≤ 20%).

**Admin endpoints:**
- `POST /api/admin/ml/quality/snapshot` — cria snapshot manualmente
- `GET /api/admin/ml/quality/history` — histórico de snapshots
- `GET /api/admin/ml/quality/readiness` — avaliação de prontidão para fine-tuning

**Scheduler:** `quality_snapshot` — semanal segunda 1 AM UTC

### 18. Iterative Refinement Tracking ✅ (Fev 2026)
**Arquivo:** `backend/services/refinement_tracking_service.py`

Rastreia cadeias completas de refinamentos para treinar o modelo a melhorar iterativamente.

**Tabela:** `refinement_chains` — links (original_id → refined_id) com tipo e metadados.

**Tipos de refinamento:**
| Tipo | Descrição |
|------|-----------|
| `self_critique` | Auto-refinado pelo self-critique service |
| `user_edit` | Médico editou output da IA |
| `regeneration` | Usuário pediu nova resposta |
| `rlaif_judge` | AI judge flagou + re-gerou |

**Funcionalidades:**
- `record_refinement()` — registra link entre original e refinado
- `get_refinement_chain()` — caminha a cadeia completa (bidirecional)
- `get_refinement_stats()` — estatísticas por tipo e profundidade
- `export_refinement_pairs()` — exporta em formato DPO JSONL

**Valor para treinamento:**
- **SFT:** Treinar modelo a produzir a versão refinada diretamente
- **DPO:** Usar (original, refinado) como pares (rejected, chosen)
- **Curriculum:** Começar com refinamentos simples, progredir para cadeias complexas

**Admin endpoints:**
- `GET /api/admin/ml/refinements/stats` — estatísticas
- `GET /api/admin/ml/refinements/chain/{id}` — cadeia completa de um entry
- `GET /api/admin/export/refinement-pairs/jsonl` — exportar pares DPO

---

### 19. Anesthesia Monitoring Data Collection ✅ (Fev 2026)
**Integração:** `backend/routes/surgical_routes.py` + `backend/services/anesthesia_monitor_service.py`

Coleta de dados intraoperatórios via monitorização manual de sinais vitais durante cirurgias.

**Novos source types:**

| source_type | creation_method | bloom_level | quality | trusted |
|-------------|----------------|-------------|---------|---------|
| `anesthesia_vital_signs` | human | apply | 1 | Sim |
| `anesthesia_alert_feedback` | hybrid | evaluate | 2 (se preciso) | Sim |

**Formato do flywheel para vitais:**
- Input: contexto do paciente (idade, peso, ASA, procedimento)
- Output: JSON com sinais vitais + minuto desde indução
- Qualidade = 1 (dados humanos validados)

**DPO pairs para alertas rejeitados:**
- Quando médico marca alerta como falso positivo (`was_accurate=False`)
- Chosen: feedback do médico ou "Alert dismissed as false positive"
- Rejected: sugestão do alerta original
- `preference_source='implicit'`, `confidence_score=0.85`

**Valor para ML:** Séries temporais de vitais são o input principal para futuros modelos preditivos LSTM/Transformer de intercorrências intraoperatórias.

---

### 20. Surgical Flywheel Wiring Fix ✅ (Fev 2026)
**Arquivos:** `feedback_routes.py`, `data_collector_service.py`, `surgical_routes.py`

Auditoria comparativa revelou 4 gaps no Centro Cirúrgico vs Ambulatório/Copiloto. Todos corrigidos:

| Gap | Fix | Impacto |
|-----|-----|---------|
| Feedback em relatório cirúrgico não atualizava `quality_score` no TrainingData | Adicionado `'surgical_report'` ao `FEEDBACK_TO_SOURCE` (→ `surgical_report_generated`, `surgical_report_ai`, `surgical_report_manual`) | Like/dislike agora promove quality + ready_for_training |
| `surgical_drug_administration` e `surgical_outcome_prediction` não eram `trusted_sources` | Adicionados aos `trusted_source_prefixes` | Dados coletados com quality=1/2 agora marcados `ready_for_training=True` automaticamente |
| Regeneração de relatório cirúrgico não capturava par DPO | Adicionado `collect_regeneration_pair()` no endpoint `generate_report` | Ao gerar relatório 2x, par (anterior vs novo) salvo como `surgical_report_regeneration` |
| Quality promotion via like não funcionava para relatórios | Resolvido pelo fix do FEEDBACK_TO_SOURCE | Like promove quality 0→1 e ready_for_training False→True |

**Novo source type:** `surgical_report_regeneration` (creation_method: `ai_generated`, bloom_level: `create`)

---

## Implementações Futuras

*Todas as implementações planejadas foram concluídas.* O pipeline está pronto para fine-tuning quando houver volume de dados suficiente.

---

## Referências

1. **Curriculum Learning:** Bengio et al. (2009)
2. **DPO:** Rafailov et al. (2023)
3. **Constitutional AI:** Bai et al. (2022)
4. **RLAIF:** Lee et al. (2023)
5. **Model Collapse:** Shumailov et al. (2023)
6. **NVIDIA Data Flywheel Blueprint** (2025)
7. **JMIR Tutorial: Medical AI Training Datasets** (2024)
