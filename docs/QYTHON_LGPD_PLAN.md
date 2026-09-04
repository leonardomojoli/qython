# Plano de LGPD do Qython (interno)

> **Status:** Plano para implementação faseada
> **Data:** 27 de Maio de 2026 (substitui dependência de Latreo para compliance)
> **Owner:** Olympos Group SAS
> **Escopo:** Compliance LGPD do Qython resolvido internamente, sem depender de Latreo
> **Doc complementar:** `docs/LATREO_INTEGRATION_PROPOSAL.md` (verificação médica é o ÚNICO uso do Latreo)

---

## TL;DR

- **Compliance LGPD é problema interno do Qython.** Latreo não é a solução (vira commodity, sem moat).
- **Stack:** Presidio (PII), `anonymeter` (risco de reidentificação), Fernet (field-level encryption), `UserConsent` próprio versionado, AuditLog local.
- **Modelo de dois consentimentos:** operacional bloqueante (T&C + Privacy Policy) + ML granular opcional (6 scopes, default OFF).
- **Dados de paciente:** sempre anonimização (Art. 11 §2º II f cobre uso primário). Sem termo individual.
- **PII redaction:** inline com placeholders consistentes; descarte se confiança < 0,8.
- **Esforço:** ~7-8 semanas (3 fases sequenciais + 1 paralela).

---

## 1. Contexto

### 1.1. Por que Qython resolve internamente

Análise estratégica concluiu que compliance LGPD vira table stakes (commodity defensável por agente bem-orientado + bibliotecas open-source + template DPA). Não é moat. Não cabe ao Latreo construir isso. E não cabe ao Qython esperar que outro produto resolva isso por nós.

**O que muda:** versão original deste plano dependia de Latreo como Compliance Ledger externo. Agora todos os requisitos LGPD são atendidos no próprio Qython, usando bibliotecas maduras.

### 1.2. Princípios

1. **Soberania de dados (princípio fundacional).** Toda stack de privacy / PII detection / anonimização / consent / audit roda **100% no servidor Qython**. Nenhum dado pessoal ou clínico é enviado para serviços geridos por terceiros (SaaS de privacy, APIs externas tipo AWS Comprehend, Presidio Cloud, etc.). Bibliotecas open-source que rodam local no nosso servidor (Presidio, anonymeter, Fernet) são aceitáveis — são código que executamos, não serviços que consultamos. Única exceção: LLMs externos (Gemini, Claude, OpenAI) recebem chamadas operacionais, mas SEMPRE com PII redactada antes via middleware local.
2. **Open-source primeiro.** Toda stack mainstream open-source, sem dependência paga.
3. **Field-level encryption obrigatória** em dados clínicos.
4. **Audit log local append-only** via trigger Postgres.
5. **Consent versionado e granular** no próprio modelo `UserConsent`.
6. **Pacientes sempre anonimizados** no pipeline ML (Art. 12 LGPD).
7. **Documentação como produto:** páginas públicas (DPO, sub-operadores, aviso a pacientes) são parte do compliance.

---

## 2. Diagnóstico — 12 lacunas e como cada uma é resolvida

Auditoria identificou 12 lacunas. Aqui está como cada uma é fechada internamente:

| # | Lacuna | Resolução interna | Fase |
|---|---|---|---|
| 1 | Sem endpoint SAR (portabilidade) | `GET /api/users/me/data-export` retornando ZIP com JSON estruturado | 0 |
| 2 | Sem cascata de exclusão de conta | `DELETE /api/users/me` com cascata via SQLAlchemy `cascade="all, delete-orphan"` + flag `deleted_at` | 0 |
| 3 | ML training é opt-out | Inverter para opt-in granular (6 scopes). Default OFF. Banner forçado de re-consentimento. | 2 |
| 4 | PII bruto para LLMs externas | Middleware Presidio antes de chamadas Gemini/OpenAI/Anthropic | 1 |
| 5 | Zero audit log | Tabela `audit_log` append-only via trigger Postgres + service `audit_service.py` | 0 |
| 6 | Pacientes sem consentimento | Base legal Art. 11 §2º II f (tutela da saúde). Aviso público via `qython.ai/paciente`. | 3 |
| 7 | Consent sem versionamento | Novo modelo `UserConsent` com `version`, `granted_at`, `revoked_at`, `actor_ip`, `actor_user_agent`, `document_hash` | 0 |
| 8 | CPF/RG em texto plano | Field-level encryption Fernet em `User.cpf`, `User.personal_id_number`, `User.phone_number`, `Patient.*` | 0 |
| 9 | Sem DPA visível com terceiros | Aceitar DPAs auto-aplicáveis (Google, Anthropic, OpenAI, Stripe, Binance, Vultr) + listar em `qython.ai/subprocessors` | 3 |
| 10 | Sem retention policy | Cron diário `data_retention_job` purgando dados conforme política (chat history > 12 meses, training_data > 24 meses, etc.) | 2 |
| 11 | training_data nunca redactado | Presidio aplica redação inline antes de salvar | 1 |
| 12 | Consent sem granularidade | 6 scopes ML separados de T&C operacional | 2 |

---

## 3. Bases legais por origem de dado

| Origem | Titular | Base legal uso primário | Base legal uso secundário (treino) |
|---|---|---|---|
| Cadastro de usuário-médico | Médico | Art. 7 V (execução de contrato) | Art. 11 I (consent específico opt-in) OU Art. 12 (anon) |
| Chat médico ↔ copiloto | Médico | Art. 7 V | Art. 11 I OU Art. 12 |
| Material acadêmico criado pelo médico | Médico | Art. 7 V | Art. 11 I OU Art. 12 |
| Feedback (like/dislike) | Médico | Art. 7 V | Art. 11 I OU Art. 12 |
| **Prontuário de paciente** | **Paciente** | **Art. 11 §2º II f (tutela da saúde por profissional)** | **Art. 12 OBRIGATÓRIO — sempre anonimização** |
| **Áudio de consulta** | **Paciente + médico** | Art. 11 §2º II f | **Art. 12 OBRIGATÓRIO** |
| **Imagem médica anexada** | **Paciente** | Art. 11 §2º II f | **Art. 12 OBRIGATÓRIO** |

**Conclusão:** todo dado onde o paciente aparece como titular vai SEMPRE para o trilho de anonimização. Sem opt-in, sem exceção, sem dependência do consent do médico.

---

## 4. Arquitetura

### 4.1. Visão dos componentes

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                  QYTHON                                  │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Camada de aplicação (FastAPI)                                    │  │
│  │  - Endpoints LGPD: SAR, deletion, consent grant/revoke            │  │
│  │  - Onboarding flow com 2 consentimentos                           │  │
│  │  - Settings → Privacidade                                         │  │
│  └────────────────────┬──────────────────────────────────────────────┘  │
│                       │                                                  │
│  ┌────────────────────▼──────────────────────────────────────────────┐  │
│  │  Middleware Presidio (PII redaction)                              │  │
│  │  - Aplicado em chamadas LLM externas                              │  │
│  │  - Aplicado em coleta de training_data                            │  │
│  │  - Token map em cache local (TTL 1h, opcional)                    │  │
│  └────────────────────┬──────────────────────────────────────────────┘  │
│                       │                                                  │
│  ┌────────────────────▼──────────────────────────────────────────────┐  │
│  │  Services LGPD                                                    │  │
│  │  - consent_service.py: grant/revoke/check                         │  │
│  │  - audit_service.py: log append-only                              │  │
│  │  - data_export_service.py: SAR                                    │  │
│  │  - anonymization_service.py: k-anon + suppression + risk check    │  │
│  │  - retention_job.py: cron purga                                   │  │
│  └────────────────────┬──────────────────────────────────────────────┘  │
│                       │                                                  │
│  ┌────────────────────▼──────────────────────────────────────────────┐  │
│  │  Postgres                                                         │  │
│  │  - User (com field-level encryption Fernet)                       │  │
│  │  - Patient (com field-level encryption Fernet)                    │  │
│  │  - Consultation (com field-level encryption Fernet)               │  │
│  │  - UserConsent (versionado, com audit fields)                     │  │
│  │  - ConsentDocument (imutável, content_hash SHA-256)               │  │
│  │  - AuditLog (append-only via trigger)                             │  │
│  │  - TrainingData (com consent_id FK + anonymization_level)         │  │
│  │  - DatasetExportLog (prova de minimização)                        │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  KEKs (rotacionáveis):                                                  │
│  - QYTHON_FIELD_KEK: field-level encryption                             │
│  - QYTHON_TOKEN_KEK: tokenização determinística (placeholders ML)       │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2. Stack técnica

| Função | Lib | Licença | Justificativa |
|---|---|---|---|
| PII detection multi-país | `presidio-analyzer` + `presidio-anonymizer` (Microsoft) | Apache 2.0 | Maduro, suporte PT-BR via spaCy, customizável, ML-augmented |
| Risco de reidentificação | `anonymeter` | The MIT License (verificar) | Mede risco singling-out + linkability + inference |
| Field-level encryption | `cryptography.fernet` (já em uso) | BSD/Apache | Mesma stack que o Latreo usa internamente |
| Audit append-only | Trigger Postgres `audit_log_no_modify` | – | Native, defensável judicialmente |
| Consent versionado | Modelo SQLAlchemy próprio + Alembic | – | Espelha o desenho do Latreo (`UserConsent` + `ConsentDocument`) mas local |
| Anonimização generalização | Implementação própria + anonymeter para checagem | – | Generalização + suppression simples, K-anon ≥ 5 |

**Por que Presidio:**
- Cobertura nativa de 25+ países (incluindo BR, AR, CL, UY, PY, CO, MX, ES, PT)
- ML-based via spaCy/transformers (não só regex como o `pii_detector.py` atual)
- Customizável (adicionar regex próprios para casos brasileiros específicos)
- Mantido pela Microsoft (Apache 2.0, sustentável)
- Permite token map reversível para UX (cache local TTL 1h)

**Por que anonymeter:**
- Mede 3 dimensões de risco de reidentificação (singling-out, linkability, inference)
- Output é número 0-1, fácil de usar como gate
- Validar licença antes de adotar (pode exigir wrapper se for AGPL)

---

## 5. Modelo de dois consentimentos

Decisão tomada (2026-05-27): ninguém usa o Qython sem consentir o operacional. Mas treinamento é separado, opcional, granular.

### 5.1. Consentimento OPERACIONAL (bloqueante)

```
- Aceite de T&C + Privacy Policy
- Bloqueia login se não aceito
- Base legal: Art. 7 V (execução de contrato)
- Cobre: usar o Qython, salvar prontuário, IA em runtime
- Registrado em UserConsent (terms_of_use, privacy_policy)
- Versionado: nova versão dispara re-consentimento
```

### 5.2. Consentimento de TREINAMENTO (separado, opcional)

```
- Toggle granular: 6 scopes
- Default OFF em todos
- Tela SEPARADA no onboarding (não embutida em T&C)
- Pode pular (não bloqueia uso)
- Revisitável em Settings → Privacidade
- Revogação granular por scope
- Base legal: Art. 11 I (consent específico)
- Registrado em UserConsent (ml_training_general, ml_training_specialty, ...)
- Expiração: 12 meses (renovação obrigatória)
```

### 5.3. Os 6 scopes de consent para ML

```python
ML_CONSENT_SCOPES = {
    "ml_training_general":     "Treinamento do copiloto clínico geral",
    "ml_training_specialty":   "Treinamento de modelos por especialidade",
    "ml_training_image":       "Treinamento de modelos de imagem médica",
    "ml_training_voice":       "Treinamento de modelos de transcrição",
    "ml_training_feedback":    "Uso de feedback (like/dislike) para DPO",
    "ml_research_publication": "Uso em pesquisa acadêmica anônima publicada",
}
```

### 5.4. Onboarding em 4 steps

```
[Step 1: Cadastro]
   Email + senha + nome + CRM/ocupação + país
   
[Step 2: Verificação]
   SMS code + email confirmation
   → Em paralelo: dispara verificação médica via Latreo (async)
   
[Step 3: Aceite operacional (BLOQUEANTE)]
   "Aceito os Termos de Uso e Política de Privacidade"
   → consent_service.grant(user, "terms_of_use", version)
   → consent_service.grant(user, "privacy_policy", version)
   
[Step 4: Aceite ML (OPCIONAL, separado)]
   "Você quer ajudar a melhorar o Qython?
    Seus dados anonimizados podem ser usados para treinar nossos modelos.
    Você decide o que quer compartilhar — e pode mudar de ideia a qualquer momento."
   ☐ Treinamento do copiloto clínico geral
   ☐ Treinamento de modelos por especialidade
   ☐ Treinamento de modelos de imagem médica
   ☐ Treinamento de modelos de transcrição
   ☐ Uso de feedback para melhorias
   ☐ Pesquisa acadêmica anônima publicada
   [ Pular ]  [ Salvar e continuar ]
   → Para cada toggle ON: consent_service.grant(user, scope_key, version)
   
[Liberação do produto]
```

### 5.5. Settings → Privacidade

Página acessível a qualquer momento:
- Aceite atual de T&C + versão + data
- 6 toggles de ML scopes (status atual)
- Botão "Exportar meus dados" (Art. 18 V)
- Botão "Excluir minha conta" (Art. 18 VI — com confirmação dupla)
- Histórico de consentimentos e revogações
- Badge de verificação Latreo (com link para detalhes)

---

## 6. Pipeline de ML training compliance

### 6.1. Dois trilhos

```
                            ┌────────────────────────────┐
                            │   Captura de dado          │
                            └────────────┬───────────────┘
                                         │
                            ┌────────────▼───────────────┐
                            │  Presidio analyze (PII)    │
                            │  - retorna entities + score│
                            └────────────┬───────────────┘
                                         │
                  ┌──────────────────────┴──────────────────────┐
                  │                                              │
        PII de paciente detectado?                  Apenas titular usuário?
                  │                                              │
              ┌───┴────┐                                  ┌──────┴──────┐
              │        │                                  │             │
            SIM      NÃO                              consent ML?     │
              │        │                                  │             │
              ▼        ▼                                  ▼             ▼
   ┌─────────────────────────┐                  ┌──────────────┐ ┌────────────┐
   │ Presidio anonymize       │                  │ Pseudonimiz. │ │ Anonimiz.  │
   │ inline:                  │                  │ track        │ │ track      │
   │ - Replace com tokens     │                  │              │ │            │
   │ - Confiança média < 0.8: │                  │ Token por    │ │ Generalize │
   │   DESCARTA entry         │                  │ usuário      │ │ Suppress   │
   │ - Confiança ≥ 0.8:       │                  │ (KEK)        │ │ anonymeter │
   │   continua para anon     │                  │ TTL 12 meses │ │ check      │
   └──────────────┬───────────┘                  └──────┬───────┘ └──────┬─────┘
                  │                                      │                │
                  ▼                                      └────────┬───────┘
            ANONIMIZAÇÃO                                          │
            track                                                  │
                  │                                                │
                  └────────────────────┬───────────────────────────┘
                                       ▼
                         ┌─────────────────────────┐
                         │   training_data table   │
                         │   + consent_id (FK)     │
                         │   + anonymization_level │
                         │     ('pseudo' | 'anon') │
                         │   + source_consent_ver  │
                         │   + tokenization_kek_id │
                         └────────────┬────────────┘
                                      │
                         ┌────────────▼────────────┐
                         │  Pre-export validator   │
                         │  - consent ainda ativo? │
                         │  - usuário deletou?     │
                         │  - PII recheck          │
                         │  - anonymeter risk      │
                         │  - Registra export log  │
                         └─────────────────────────┘
```

### 6.2. Anonimização (Art. 12 LGPD)

Diferença jurídica importante:
- **Pseudonimizado:** ainda é dado pessoal. Sob LGPD. Reversível com chave.
- **Anonimizado:** não é mais dado pessoal. Fora do escopo da LGPD.

Para o trilho anon, exigências mínimas:
- Remover identificadores diretos (nome, CPF, telefone, email, endereço completo, data exata, foto, voz)
- Generalizar quasi-identifiers (idade → faixa de 5 anos, CEP → região, especialidade rara → "outras", data → mês/ano)
- K-anonymity ≥ 5 via anonymeter ou implementação própria
- anonymeter score de reidentificação < 0.3 (singling-out + linkability + inference)
- Sem reverter — não há chave que desanonimize

**Prova auditável:** hash do dataset original + hash do anonimizado + algoritmo + parâmetros + timestamp, salvo em `DatasetExportLog`.

### 6.3. Retenção e revogação

- **Trilho pseudo:** TTL 12 meses. Renovação obrigatória. Sem renovação: migração pro trilho anon ou descarte.
- **Trilho anon:** sem TTL. Prova de anonimização arquivada permanentemente.
- **Revogação:** usuário revoga scope → cron remove entries do pool de export. Dados já em datasets exportados são marcados `should_not_use` (treino retroativo é impossível — ANPD aceita desde que documentado).

### 6.4. PII redaction inline (opção 3 — decisão tomada)

Sempre que detectada PII em dado cujo titular é o usuário-médico mas que menciona paciente:
- Presidio anonymize com placeholders consistentes (`[PATIENT_NAME]`, `[PATIENT_AGE]`, `[CPF_xxxxxxxx]`)
- Se confiança agregada do Presidio < 0,8: a entry inteira é descartada (não vai pra training_data)
- Se confiança ≥ 0,8: entry vai pro trilho anon (mesmo se médico consentiu pseudo — paciente não consentiu)

> **Precisão da redação (Jun/2026) — só dado PESSOAL, sem corromper texto clínico:**
> - **Allowlist de entidades** (`_PII_ENTITIES`): redige apenas identificadores de pessoa natural — PERSON / e-mail / telefone / CPF / CNS / CRM / RG / CEP. **NÃO** redige `ORGANIZATION`/`LOCATION`/`DATE_TIME`: nome de instituição ("INCA", "Ministério da Saúde"), local e data clínica **não são dado pessoal** (LGPD = pessoa natural) e estavam corrompendo a resposta médica (ex.: "INCA" → `[ORG]`).
> - **Validador de nome** (`_looks_like_person_name`): a NER PT do spaCy marcava trecho clínico como `PERSON` ("paciente com TFG", "DRC estágio", "como monitorar") → `[PATIENT_NAME]`, corrompendo quase toda pergunta clínica. O filtro mantém o span de nome **só se parece nome próprio** (Title-case + conectores `da/de/do`); rejeita sigla (all-caps), minúscula e palavra-função. Nomes reais (João da Silva) + identificadores estruturados (CPF/CNS/…) seguem redigidos.

### 6.5. Tokenização determinística

Para o trilho pseudo (dados onde apenas o usuário-médico é titular):
- Token gerado por HMAC-SHA256(user_id, QYTHON_TOKEN_KEK)
- Mesmo usuário → mesmo token sempre (permite feedback loop)
- Sem KEK: token é opaco
- KEK rotacionável (rotação anual, com período de double-tokenization durante transição)

### 6.6. Hash-for-lookup em colunas encriptadas

Quando uma coluna encriptada precisar de busca por igualdade (`WHERE x = :y`),
o padrão é uma coluna irmã `<col>_lookup String(64)` contendo o hash
determinístico do valor.

Helper: `backend/services/encryption_service.py::lookup_hash(value, scope)`.
Usa HMAC-SHA256 com `QYTHON_TOKEN_KEK` como pepper, e o `scope` como
ligação ao contexto da coluna (evita colisão entre colunas).

Exemplo de schema:
```python
class User(Base):
    cpf         = Column(EncryptedString, nullable=True)
    cpf_lookup  = Column(String(64), nullable=True, index=True)
```

Exemplo de insert/update:
```python
user.cpf = "12345678900"
user.cpf_lookup = lookup_hash(user.cpf, scope="user.cpf")
```

Exemplo de query:
```python
stmt = select(User).where(
    User.cpf_lookup == lookup_hash(input_cpf, scope="user.cpf")
)
```

Auditoria 2026-05-28: hoje nenhuma query por igualdade existe em colunas
encriptadas — todas as queries por usuário no `auth_routes` usam `User.email`,
que continua em texto plano. O helper está pronto para uso quando algum
endpoint novo precisar (ex: "buscar paciente por CPF" no painel admin).

---

## 7. Dados de paciente

### 7.1. Base legal — Art. 11 §2º II f LGPD

> "O tratamento de dados pessoais sensíveis poderá ocorrer [...] sem fornecimento de consentimento do titular [...] f) tutela da saúde, exclusivamente, em procedimento realizado por profissionais de saúde, serviços de saúde ou autoridade sanitária."

Tradução: médico atendendo paciente não precisa de termo explícito para tratar dados clínicos. Qython, como ferramenta do médico em procedimento de saúde, opera sob o mesmo guarda-chuva. Resolução CFM 2.217/2018 e Guias da ANPD para o setor saúde confirmam.

**Decisão:** termo individual do paciente NÃO é capturado pelo Qython.

### 7.2. Aviso de transparência

Responsabilidade operacional do médico no consultório, não do Qython digital. O que o Qython oferece:

- Página pública `qython.ai/paciente` em linguagem simples explicando:
  - O que é o Qython
  - Como dados são protegidos (encryption, audit, anonimização)
  - O que é feito com dados para treinamento (sempre anonimizados)
  - Como exercer direitos (via médico)
- Template PDF de folder de sala de espera (baixável pelo médico em Settings)
- Aviso pequeno no rodapé de relatórios impressos: "Atendimento auxiliado por Qython — saiba mais em qython.ai/paciente"

### 7.3. Trilho de ML

Todo dado onde o paciente é titular vai SEMPRE para anonimização:
- Identifiers do paciente removidos via Presidio
- Quasi-identifiers generalizados
- anonymeter score < 0.3
- Prova de anonimização arquivada em `DatasetExportLog`

### 7.4. DSR do paciente

Se um paciente exerce direito do Art. 18:
- Procura o médico (controlador funcional)
- Médico aciona Qython via ferramenta admin: "buscar paciente por CPF/nome" + ações DSR
- Cada operação gera audit no `audit_log` interno do Qython

---

## 8. Fases de implementação

### Fase 0 — Quick wins internos (2 semanas)

**Migrations:**
- `User.deleted_at` (soft delete)
- Tabela `user_consents` (com `version`, `granted_at`, `revoked_at`, `actor_ip`, `actor_user_agent`, `document_hash`, `expires_at`, `scope_metadata`)
- Tabela `consent_documents` (imutável, `type`, `version`, `content_hash`)
- Tabela `audit_log` com trigger `audit_log_no_modify`
- Tabela `dataset_export_logs`

**Field-level encryption (Fernet):**
- `User.cpf`, `User.personal_id_number`, `User.phone_number`
- `Patient.full_name`, `Patient.document_id`, `Patient.phone`, `Patient.email`, `Patient.address`, `Patient.clinical_history`, `Patient.allergies`, `Patient.chronic_conditions`, `Patient.current_medications`
- `Consultation.raw_notes`, `Consultation.improved_notes`, `Consultation.summary`, `Consultation.chief_complaint`, `Consultation.physical_exam`
- KEK master em `QYTHON_FIELD_KEK` env (rotacionável anualmente)

**Endpoints LGPD básicos:**
- `GET /api/users/me/data-export` (Art. 18 V — portabilidade) — ZIP com JSON estruturado
- `DELETE /api/users/me` (Art. 18 VI) — cascata via SQLAlchemy + marca `deleted_at`
- `GET /api/users/me/audit-log` (Art. 18 II — leitura própria)
- `GET /api/users/me/consents` — lista de consents ativos
- `POST /api/users/me/consents` — grant
- `DELETE /api/users/me/consents/{type}` — revoke

**Services:**
- `consent_service.py` — grant/revoke/check
- `audit_service.py` — log append-only
- `data_export_service.py` — SAR builder

**Páginas públicas:**
- `qython.ai/encarregado` (DPO)
- `qython.ai/subprocessors` (sub-operadores: Google, Anthropic, Stripe, Binance, Vultr + Latreo como provider de verificação)
- `qython.ai/paciente` (aviso de transparência)

### Fase 1 — Presidio + middleware (2 semanas)

**Setup:**
- Adicionar `presidio-analyzer` e `presidio-anonymizer` a `requirements.txt`
- Download spaCy model PT-BR (`pt_core_news_lg`)
- Configurar `RecognizerRegistry` customizado para padrões BR específicos (CPF, CRM, CNS, CNES, CEP)

**Middleware:**
- `pii_redaction_middleware.py`:
  - Envolve calls a `genai.Client`, `anthropic.Client`, `openai.Client`
  - Aplica `analyzer.analyze()` + `anonymizer.anonymize()` antes do request
  - Mantém cache local de token map (TTL 1h) para eventual unredaction de resposta

**Pipeline de coleta:**
- Atualizar `data_collector_service.py`:
  - Antes de salvar como training_data, roda Presidio
  - Se PII de paciente detectada: roteamento conforme decisão da Seção 6.4 (opção 3)
  - Substitui `pii_detector.py` legado

**Backfill:**
- Job pontual para reprocessar `training_data` existente com Presidio
- Entries com `pii_detected=True`: reprocessadas; se confiança < 0.8 → descarte
- Entries com `pii_detected=False`: reprocessadas; se Presidio detectar PII nova → roteia conforme regras

### Fase 2 — ML compliance pipeline (3 semanas)

**Onboarding flow:**
- Reescrever fluxo de cadastro com 4 steps (Seção 5.4)
- Banner forçado de re-consentimento para usuários existentes:
  - 14 dias não-bloqueante
  - Após 14 dias: bloqueia funcionalidades de IA (mantém prontuário/agenda funcionando)
  - Não revoga acesso geral ao produto

**Pipeline de export:**
- Pre-export validator:
  - Para cada entry em training_data, verifica consent ativo
  - Recheck Presidio
  - Recheck K-anon via anonymeter
  - Gera `DatasetExportLog` com hash do dataset + snapshot de consents

**Anonymization service:**
- `anonymization_service.py`:
  - Remove identifiers diretos
  - Generaliza quasi-identifiers (idade → faixa, etc.)
  - Roda anonymeter para validar score < 0.3
  - Drop registros que não atingem k=5

**Retention job:**
- Cron diário `data_retention_job.py`:
  - Pseudo entries > 12 meses sem renovação → migra pra anon ou descarta
  - Chat history > 12 meses → arquiva (cold storage) ou deleta conforme política
  - Audit log > 10 anos → arquiva (mantém prova de purge)

**Settings → Privacidade:**
- Componente UI com 6 toggles + ações LGPD

### Fase 3 — Documentação legal (paralelo às Fases 0-2)

- Privacy Policy reescrita refletindo:
  - Latreo como sub-operador de verificação (não de compliance)
  - Lista de sub-operadores externos
  - Política de retenção explícita
  - 2 consentimentos (operacional + ML)
- Termos de Uso atualizados com seção "Uso de dados para aprimoramento de IA" — destacada, separada
- Aviso de transparência ao paciente (página + folder PDF)
- DPA intra-grupo Qython ↔ Latreo (escopo limitado a verificação médica)
- Aceite de DPAs externos:
  - Google Cloud DPA (Gemini)
  - Anthropic DPA (API)
  - OpenAI DPA (API)
  - Stripe DPA
  - Binance Pay DPA
  - Vultr DPA
- Runbooks internos:
  - `docs/DSR_RUNBOOK.md` — como responder DSR
  - `docs/INCIDENT_RUNBOOK.md` — como responder incidente de segurança

---

## 9. Onde Latreo encosta neste plano

**Em lugar algum diretamente.** Latreo entra no Qython exclusivamente como provider de verificação médica (ver `LATREO_INTEGRATION_PROPOSAL.md`).

Único ponto de interseção:
- Latreo aparece em `qython.ai/subprocessors` como "Provider de verificação de identidade profissional médica"
- DPA intra-grupo descreve esse escopo limitado
- Nada mais — compliance LGPD do Qython não passa por Latreo

---

## 10. Riscos e mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Presidio PT-BR não é robusto o suficiente | Média | Médio | Custom recognizers para padrões BR (CPF, CRM, CNS, CNES) + fallback regex via `pii_detector.py` legado |
| anonymeter tem licença restritiva | Baixa | Baixo | Validar antes da Fase 2. Se incompatível: implementar K-anon próprio sem a lib |
| Backfill de `training_data` legado descarta muitos registros | Média | Médio | Aceito — entries com PII duvidosa não deviam estar no pipeline. Melhor descartar do que vazar. |
| Re-consentimento forçado causa churn | Média | Médio | Banner não-bloqueante por 14 dias + email prévio + linguagem clara |
| Pacientes nunca consentem para ML | Certo | Nenhum | Por design: pacientes vão sempre pra anon. Sem opt-in. |
| ANPD questiona anonimização | Baixa | Alto | Prova auditável via `DatasetExportLog` + anonymeter score documentado |
| Vazamento de `QYTHON_FIELD_KEK` ou `QYTHON_TOKEN_KEK` | Muito baixa | Crítico | KMS proper em produção (não env puro) + rotação anual + monitoring de acesso |
| Trigger Postgres `audit_log_no_modify` é bypassed | Muito baixa | Alto | Trigger é defensável judicialmente. Combinado com least-privilege DB user. |

---

## 11. Métricas de sucesso

Pra avaliar após Fase 2 em produção:

| Métrica | Alvo |
|---|---|
| % usuários com consent operacional aceito | 100% (caso contrário não consegue logar) |
| % usuários que aceitam pelo menos 1 scope ML | > 30% |
| % usuários que aceitam TODOS os 6 scopes ML | > 10% |
| Tempo médio de SAR (do request à entrega) | < 24h (auto-processado) |
| Tempo médio de delete account (do request à confirmação) | < 1h (auto-processado) |
| % training_data entries com `anonymization_level='anon'` | > 50% |
| anonymeter score médio do trilho anon | < 0.2 |
| Audit log entries por dia (volume saudável) | > 1k (sinaliza coverage) |
| Incidentes de PII vazada para LLM externa | 0 |

---

## 12. Decisões registradas

| # | Decisão | Data |
|---|---|---|
| 1 | Compliance LGPD do Qython é resolvido internamente, sem Latreo | 2026-05-27 |
| 2 | Stack: Presidio + anonymeter + Fernet + UserConsent próprio | 2026-05-27 |
| 3 | Modelo de dois consentimentos: operacional bloqueante + ML granular opcional | 2026-05-27 |
| 4 | 6 scopes ML, default OFF, expiração 12 meses | 2026-05-27 |
| 5 | Dados de paciente: sempre anonimização (Art. 11 §2º II f cobre uso primário, sem termo individual) | 2026-05-27 |
| 6 | PII redaction inline (opção 3) — descarta se confiança < 0.8 | 2026-05-27 |
| 7 | Storage clínico no Qython com field-level encryption | 2026-05-27 |
| 8 | Encarregado/DPO: fundador (Leonardo Abreu) | 2026-05-27 |
| 9 | Sem advogado externo no curto prazo — operar com templates + DPAs auto-aplicáveis | 2026-05-27 |
| 10 | **Soberania de dados:** toda stack de privacy roda 100% no servidor Qython. Libs open-source locais (Presidio, anonymeter) OK. SaaS externos de privacy proibidos. Dados nunca saem para serviços geridos por terceiros — exceto LLMs operacionais com PII redactada antes. | 2026-05-27 |

---

## Apêndices

### A. Referências regulatórias

- LGPD (Lei 13.709/2018)
- Resolução CFM 2.217/2018 — sigilo médico
- Guia ANPD para o setor saúde
- Art. 11 §2º II f — tutela da saúde
- Art. 12 — anonimização
- Art. 18 — direitos do titular
- Art. 37 — registro de operações
- Art. 41 — Encarregado
- Art. 48 — notificação de incidentes

### B. Bibliotecas e versões

- `presidio-analyzer` >= 2.2.x
- `presidio-anonymizer` >= 2.2.x
- `spacy` >= 3.7.x + `pt_core_news_lg`
- `anonymeter` (validar licença e versão)
- `cryptography` (Fernet — já em uso)
- `alembic` (já em uso)

### C. Documentos relacionados

- `docs/LATREO_INTEGRATION_PROPOSAL.md` — escopo reduzido a verificação médica
- `docs/LATREO_SUGGESTIONS.md` — resposta ao claude do Latreo confirmando pivot
- `docs/TRAINING_DATA_GUIDE.md` — pipeline atual (será atualizado na Fase 2)
- `docs/ARCHITECTURE.md` — arquitetura geral do Qython (será atualizado nas Fases 0-1)
