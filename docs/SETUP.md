# Guia de Configuração de Serviços Externos

Este guia detalha como configurar cada serviço externo necessário para o Qython funcionar completamente.

## Índice

1. [Firebase (SMS e Google Authentication)](#1-firebase-sms-e-google-authentication)
2. [Google Cloud (OAuth Branding)](#2-google-cloud-oauth-branding)
3. [Resend (E-mails Transacionais)](#3-resend-e-mails-transacionais)
4. [ImprovMX (Recebimento de E-mail)](#4-improvmx-recebimento-de-e-mail)
5. [Google AI / Gemini](#5-google-ai--gemini)
6. [Stripe (Pagamentos Cartão)](#6-stripe-pagamentos-cartão)
7. [Cloudflare Turnstile (CAPTCHA)](#7-cloudflare-turnstile-captcha)
8. [Latreo (Verificação Médica)](#8-latreo-verificação-médica)

---

## 1. Firebase (SMS e Google Authentication)

**Custo:** Gratuito até 50.000 MAUs (usuários ativos/mês) no plano Blaze
**Projeto atual:** `qython-ai`

### Configuração

1. Acesse o [Firebase Console](https://console.firebase.google.com/)
2. Crie um novo projeto (ID: `qython-ai`)
3. Ative o plano **Blaze** (pagamento por utilização) — gratuito até 50K MAUs
4. Faça upgrade para **Authentication with Identity Platform** (gratuito até 50K MAUs, desbloqueia MFA, funções de bloqueio, cota de SMS maior)
5. Vá em **Authentication** → **Sign-in method**
6. Ative o método **Telefone** (SMS)
7. Ative o método **Google** (login social)
8. Em **Settings** → **Authorized domains**, adicione:
   - Seu domínio de produção (ex: `qython.ai`)
   - `localhost` (desenvolvimento)

### Credenciais do Frontend

1. Vá em **Project Settings** → **General**
2. Em **Your apps**, clique em **Web** (`</>`)
3. Registre o app como `Qython Web`
4. Copie as configurações para o `.env`:

```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=qython-ai.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=qython-ai
VITE_FIREBASE_STORAGE_BUCKET=qython-ai.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

### Credenciais do Backend

1. Vá em **Project Settings** → **Service accounts**
2. Clique em **Generate new private key**
3. Salve o arquivo como `firebase_credentials.json`
4. Mova para a pasta `config/` do projeto:
   ```bash
   mkdir -p config
   mv firebase_credentials.json config/
   chmod 600 config/firebase_credentials.json
   ```
5. **IMPORTANTE:** Este arquivo está no `.gitignore` - nunca faça commit dele!

### Identity Platform

O projeto usa **Firebase Auth with Identity Platform**, que oferece:
- **50.000 MAUs grátis** (vs 10K no Firebase Auth básico)
- **1.000 SMS/dia** (vs 10/dia no plano Spark)
- **MFA por SMS** disponível
- **Funções de bloqueio** (custom logic no login/registro)
- **Registro de auditoria** de atividade do usuário
- **SLA empresarial**

O upgrade é irreversível mas não requer migração de dados.

### Números de Teste (Desenvolvimento)

Para evitar bloqueios por spam durante desenvolvimento:
1. Vá em **Authentication** → **Sign-in method** → **Phone**
2. Em **Phone numbers for testing**, adicione:
   - `+55 11 99999-9999` → Código: `123456`

---

## 2. Google Cloud (OAuth Branding)

**Necessário para:** Nome "Qython" aparecer na tela de login do Google.

### Configuração

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/apis/credentials/consent)
2. Selecione o projeto do Firebase
3. **Tela de Permissão OAuth:**
   - Tipo: Externo
   - Nome do App: `Qython`
   - E-mail de suporte: Use um Google Group ou seu e-mail
   - Domínios autorizados: `qython.ai` (ou domínio de produção atual)
4. **Credenciais:**
   - Crie um **ID do cliente OAuth** (Aplicação Web)
   - Origens autorizadas: `https://qython.ai` (ou domínio de produção atual)
   - URIs de redirecionamento: Copie do Firebase (`https://qython-ai.firebaseapp.com/__/auth/handler`)
   - Copie **Client ID** e **Client Secret** para o Firebase Authentication (provedor Google)

---

## 3. Resend (E-mails Transacionais)

**Custo:** Gratuito até 3.000 emails/mês (100/dia)

### Configuração

1. Crie conta em [resend.com](https://resend.com/)
2. Vá em **Domains** → **Add Domain**
3. Adicione `qython.ai` (ou o domínio de produção atual)
4. Configure os registros DNS conforme instruído:
   - TXT (SPF)
   - TXT (DKIM)
   - MX (opcional, para receber respostas)

### API Key

1. Vá em **API Keys** → **Create API Key**
2. Nome: `Qython Backend`
3. Permission: `Sending access`
4. Copie a chave (começa com `re_`)

```env
RESEND_API_KEY=re_xxxxx...
MAIL_FROM_EMAIL=nao-responda@qython.ai
```

### Verificação de Domínio

Após configurar o DNS, aguarde alguns minutos e clique em **Verify**. O status deve mudar para verde.

---

## 4. ImprovMX (Recebimento de E-mail)

**Custo:** Gratuito (plano básico)

**Necessário para:** Receber e-mails em `suporte@qython.ai` gratuitamente.

### Configuração

1. Crie conta no [ImprovMX](https://improvmx.com/)
2. Adicione o domínio `qython.ai` (ou o domínio de produção atual)
3. Configure o alias `suporte` para encaminhar para seu Gmail pessoal
4. Configure os registros DNS:
   - **MX:** Conforme instruido pelo ImprovMX
   - **SPF (TXT):** Combine Resend + ImprovMX:
     ```
     v=spf1 include:amazonses.com include:spf.improvmx.com ~all
     ```

---

## 5. Google AI / Gemini

**Custo:** Pay-as-you-go (limites generosos no tier gratuito)

### Configuração da API Key

1. Acesse [Google AI Studio](https://aistudio.google.com/)
2. Clique em **Get API Key**
3. Crie ou selecione um projeto
4. Copie a chave:

```env
# Chave principal para funções gerais
GEMINI_API_KEY=AIza...

# Chave separada para KYC (opcional, para monitorar custos separadamente)
GEMINI_DOCSVERIFICATION_KEY=AIza...
```

### Modelos Configurados (Março 2026)

```env
# Chat médico e funções principais
PRIMARY_LLM_MODEL=gemini-3.5-flash
FALLBACK_LLM_MODEL=gemini-3.1-flash-lite

# Tarefas simples (classificação, títulos, ícones)
SIMPLE_TASK_LLM_MODEL=gemini-2.5-flash-lite

# Juiz do RLAIF / self-play — curadoria do dataset, desacoplado do SIMPLE
RLAIF_JUDGE_MODEL=gemini-3.1-flash-lite

# Análise de imagens médicas e KYC (visão)
MEDICAL_IMAGE_ANALYST_MODEL=gemini-3.5-flash

# Geração de imagens (Nano Banana 2)
IMAGE_GEN_MODEL=gemini-3.1-flash-image

# Mapas mentais — Nano Banana 2 (mesmo do IMAGE_GEN). Pro `gemini-3-pro-image` se precisar de tipografia fina/composição complexa.
IMAGE_GEN_MODEL_PRO=gemini-3.1-flash-image

# Vision pipeline — descrição de imagens médicas extraídas de PDFs
VISION_DESCRIPTION_MODEL=gemini-2.5-flash-lite

# Google Search Grounding para referências científicas
ENABLE_GROUNDING=1
```

### Custos por Modelo

| Modelo | Input | Output | Uso |
|--------|-------|--------|-----|
| Gemini 3.5 Flash | $1.50/1M | $9.00/1M | Chat médico, análise de imagens |
| Gemini 3.1 Flash-Lite | $0.25/1M | $1.50/1M | Fallback |
| Gemini 2.5 Flash-Lite | $0.10/1M | $0.40/1M | Tarefas simples |

### Recursos Avançados

- **Thinking Mode:** Habilitado automaticamente para raciocínio profundo
- **Google Search Grounding:** 1,500 queries/dia grátis, depois $35/1000

### NCBI PubMed API Key (referências — opcional, recomendado em produção)

O copiloto valida/enriquece citações via PubMed E-utilities. **Sem** chave o NCBI
limita a ~3 req/s **compartilhado por IP** — sob carga concorrente as referências
falham silenciosamente e somem da resposta. **Com** chave: ~10 req/s.

1. Gere em [NCBI Account](https://www.ncbi.nlm.nih.gov/account/) → **Settings → API Key**
2. Adicione ao `.env`:

```env
NCBI_API_KEY=...
```

---

## 6. Stripe (Pagamentos Cartão)

**Custo:** 2.9% + $0.30 por transação

### Configuração

1. Crie conta em [stripe.com](https://stripe.com/)
2. Vá em **Developers** → **API Keys**
3. Use as chaves de **Test mode** para desenvolvimento

```env
STRIPE_API_KEY=sk_test_xxxxx...
STRIPE_WEBHOOK_SECRET=whsec_xxxxx...
```

### Webhook

1. Vá em **Developers** → **Webhooks**
2. Adicione endpoint: `https://qython.ai/api/billing/stripe-webhook`
3. Selecione evento: `checkout.session.completed`
4. Copie o **Signing secret** para `STRIPE_WEBHOOK_SECRET`

---

## 7. Cloudflare Turnstile (CAPTCHA)

**Custo:** Gratuito

### Configuração

1. Acesse [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Vá em **Turnstile** → **Add site**
3. Nome: `Qython`
4. Domínios: `qython.ai`, `localhost`
5. Tipo: `Managed`

```env
CLOUDFLARE_SECRET_KEY=0x4AAA...  # Backend
VITE_CLOUDFLARE_SITE_KEY=0x4BBB...  # Frontend
```

---

## LGPD / Privacy (field-level encryption + PII redaction)

### Chaves de criptografia (KEKs)

A camada LGPD exige duas chaves no `.env`. Geram-se uma única vez por
ambiente e **não devem ser commitadas nem rotacionadas sem plano de
re-encriptação** (a perda do `QYTHON_FIELD_KEK` torna ilegíveis as colunas
encriptadas).

```bash
# QYTHON_FIELD_KEK — Fernet, criptografa colunas sensíveis (CPF, clínico)
python3 -c "from cryptography.fernet import Fernet; print('QYTHON_FIELD_KEK=' + Fernet.generate_key().decode())"

# QYTHON_TOKEN_KEK — pseudonimização ML + lookup_hash determinístico
python3 -c "import os, base64; print('QYTHON_TOKEN_KEK=' + base64.urlsafe_b64encode(os.urandom(32)).decode())"
```

```env
QYTHON_FIELD_KEK=...   # gerado acima
QYTHON_TOKEN_KEK=...   # gerado acima
# Apenas dev descartável (gera chaves efêmeras a cada boot — dados não persistem legíveis):
# QYTHON_ALLOW_EPHEMERAL_KEK=1
```

### Dependências de PII (Presidio + spaCy)

`pip install -r requirements.txt` já traz `presidio-analyzer` e
`presidio-anonymizer`. O modelo spaCy PT-BR precisa ser baixado à parte:

```bash
python -m spacy download pt_core_news_lg   # ~568 MB
```

Sem o modelo, o middleware cai no detector regex legado (`pii_detector.py`),
que não captura nomes próprios — instalar o modelo é recomendado em produção.

### Documentos de consentimento (seed)

Após a migration, publique os documentos de consentimento (T&C, Privacy,
6 escopos ML). Idempotente:

```bash
python3 backend/scripts/seed_consent_documents.py
```

---

## Checklist de Configuração

Use esta checklist para garantir que tudo está configurado:

### Obrigatórios (Sistema não funciona sem)
- [ ] `DATABASE_URL` - PostgreSQL
- [ ] `JWT_SECRET_KEY` - Chave de 32+ caracteres
- [ ] `GEMINI_API_KEY` - Para LLM
- [ ] `QYTHON_FIELD_KEK` - Field-level encryption (LGPD)
- [ ] `QYTHON_TOKEN_KEK` - Pseudonimização ML (LGPD)

### Funcionalidades de Segurança
- [ ] `firebase_credentials.json` - Verificação de telefone
- [ ] `VITE_FIREBASE_*` - Config do frontend
- [ ] `RESEND_API_KEY` - Verificação de e-mail
- [ ] `CLOUDFLARE_SECRET_KEY` - CAPTCHA
- [ ] `spacy download pt_core_news_lg` - PII detection PT-BR
- [ ] `seed_consent_documents.py` rodado - Documentos de consentimento

### Opcionais (Funcionalidades extras)
- [ ] `GEMINI_DOCSVERIFICATION_KEY` - Chave separada para KYC (monitorar custos)
- [ ] `STRIPE_API_KEY` - Pagamentos com cartão
- [ ] `HUGGINGFACE_API_KEY` - Geração de avatares

---

## 8. Latreo (Verificação Médica)

Verifica o registro profissional de médicos (CFM + CNES / foto + selfie / ICP-Brasil) via embed. A carteira CRM + selfie vão **direto para o Latreo** — nunca passam pelo backend do Qython. Estudantes continuam no KYC interno (Gemini).

### Pré-requisitos

1. API key criada no dashboard Lastreo (Developer → **API Keys** → Nova API Key). Auth server-to-server via header `X-API-KEY: lk_...`.
2. Webhook criado no dashboard Lastreo (Webhooks & Push → **Webhooks (HTTP)**) apontando para `https://qython.ai/api/internal/lastreo/webhook`, assinando os eventos `verification.*`. Guarde o signing secret (`whsec_...`).

### Configuração (`.env` do backend)

```bash
LATREO_BASE_URL=https://lastreo.com
LATREO_API_KEY=lk_<prefix>_<secret>                  # API key (Developer → API Keys), header X-API-KEY
LATREO_WEBHOOK_SECRET=whsec_...                      # signing secret do webhook
LATREO_VERIFY_THEME_COLOR=#bb86fc                    # opcional — cor do embed
```

Frontend web (opcional, default já aponta pro Latreo):

```bash
VITE_LATREO_SDK_URL=https://lastreo.com/dashboard/sdk/lastreo.js
```

### Funcionamento

- **Cadastro**: o médico abre o modal Latreo, declara CRM/UF e envia a mídia ao Latreo. O frontend envia `latreo_session_id` no `POST /auth/register/step1`; o backend confirma o resultado server-side (`GET /verification-sessions/{id}`) e grava `verification_status`/`verification_tier`.
- **Webhook**: aprovações assíncronas (tier prata revisado por admin) e mudanças futuras chegam em `/api/internal/lastreo/webhook` (HMAC `X-Lastreo-Signature`, mapeado por `latreo_doctor_id`).
- **Sem a API key**: a verificação Latreo desliga graciosamente — o médico cadastra como `pending` e o banner cobra depois.

### Mobile

Requer `react-native-webview` (já em `package.json`). Após `npm install`, rode `pod install` (iOS) e refaça o build nativo. A permissão de câmera já está declarada (Android/iOS).

O cadastro mobile usa o mesmo Cloudflare Turnstile do web, renderizado dentro de um WebView (`TurnstileModal`). A **site key pública** fica em `packages/mobile/src/config/env.ts` (`CLOUDFLARE_TURNSTILE_SITE_KEY`) e deve ser igual à `VITE_CLOUDFLARE_SITE_KEY` do web. O domínio `qython.ai` precisa estar na lista de domínios permitidos da site key (o WebView carrega o desafio com `baseUrl=https://qython.ai`).

---

## Troubleshooting

### Latreo: verificação não inicia (503)
- Confirme `LATREO_API_KEY` no `.env` (enviada no header `X-API-KEY`)

### Latreo: webhook rejeitado (401)
- `LATREO_WEBHOOK_SECRET` precisa ser exatamente o signing secret do webhook no dashboard Lastreo

### Firebase: "auth/invalid-api-key"
- Verifique se as variáveis `VITE_FIREBASE_*` estão corretas
- Confirme que o domínio está autorizado no Console

### Resend: Emails indo para spam
- Configure DKIM e SPF no DNS
- Use um domínio verificado ao invés de `onboarding@resend.dev`

### Gemini: 429 Rate Limit
- Verifique os limites do tier gratuito
- Considere upgrade para tier pago no Google AI Studio

### Stripe: Webhook falha
- Verifique se o `STRIPE_WEBHOOK_SECRET` está correto
- Confirme que a URL é HTTPS e acessível publicamente
