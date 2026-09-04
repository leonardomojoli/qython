# Qython Features Documentation

> **Última atualização:** 5 de Agosto de 2026

This document provides a detailed overview of the features available in the Qython platform.

## 1. Consultation Management (Gerenciamento de Consultas)

Qython offers a comprehensive suite of tools to streamline the medical consultation process. The Ambulatorio module is organized into 6 tabs: New Consultation, Saved Consultations, Prescription (Receituario), Attestado, Exams, and Patient Orientations.

* **Smart Anamnesis (Anamnese Estruturada com IA):**
  * AI-guided patient data collection.
  * Ensures no crucial information is missed.
  * Suggests relevant questions based on reported symptoms.
* **Diagnostic Hypotheses (Hipóteses Diagnósticas):**
  * Generates a list of potential diagnoses based on anamnesis and patient history.
  * Ranked by probability to assist clinical decision-making.
* **Receituario (ReceituarioTab - 3 sub-tabs):**
  * **Prescrição (Prescription):** Secure generation of digital prescriptions with updated medication database and automatic drug interaction verification.
  * **Relatório (Report):** Clinical report generation with structured templates.
  * **Encaminhamento (Referral):** Patient referral documents for other specialists.
* **Attestado (AttestadoModal - 3 sub-tabs):**
  * **Atestado:** Standard medical certificates (sick leave, etc.).
  * **Comparecimento:** Attendance certificates confirming patient's presence at appointment.
  * **Aptidão:** Fitness certificates (physical aptitude, clearance for activities).
* **Patient Orientations (Orientações ao Paciente):**
  * Pre-built templates for common patient education materials (e.g., blood pressure tracking, dietary guidelines, pre/post-operative instructions).
  * AI-powered generation of personalized orientation materials based on doctor's prompt and patient context (costs 5 dracmas).
  * Editable content before printing or saving as PDF.
  * PDF export with doctor/clinic header and patient data.
  * History of all generated orientations with search and filtering.
* **Specialty-Specific Templates (24 specialties):**
  * Dedicated first consultation + return (SOAP) prompts for each specialty.
  * Specialties: Anestesiologia, Cardiologia, Cirurgia Geral, Cirurgia Plástica, Clínica Médica, Dermatologia, Endocrinologia e Metabologia, Gastroenterologia, Geriatria, Ginecologia e Obstetrícia, Hematologia e Hemoterapia, Infectologia, Medicina da Família e Comunidade, Nefrologia, Neurocirurgia, Neurologia, Oftalmologia, Ortopedia e Traumatologia, Otorrinolaringologia, Pediatria, Pneumologia, Psiquiatria, Reumatologia, Urologia.
  * Each prompt includes specialty-specific data fields, clinical scores, and example transformations.
* **Pharmacy Module (Módulo Farmácia):**
  * Medication catalog with ~950 entries and multi-country support (20 countries via the country filter; `brands_by_country` + `government_program_codes` per medication). See `docs/PRODUCT_ROADMAP.md` for the per-country government programs. Brazil and Uruguay below are the most-developed examples.
  * Country filter: users see medications from their country by default (`user.country`), with chip selector to switch between countries.
  * **Brazil:** Farmácia Popular integration — 42 official items, all 100% free since Feb 2025 (Portaria GM/MS 6.613/2025). Includes non-medication items (absorbents, diapers).
  * **Uruguay:** FNR (Fondo Nacional de Recursos) — high-cost medications 100% free for 46 pathologies. ASSE — essential medications via public health system.
  * Government Programs infrastructure (`GovernmentProgram`, `MedicationGovernmentProgram`) — multi-country with seed support for `government_program_codes`.
  * Drug interaction checker: deterministic DB lookups (not LLM), severity levels (contraindicated/severe/moderate/mild), mechanism and clinical management.
  * Partner pharmacies: geo-search by location, grouped by chain (e.g., "Drogasil - 3 units nearby").
  * Prescription sharing: QR code on PDF, shareable links (UUID tokens, 30-day expiry), public patient-facing page.
  * Direct pharmacy sends: send prescription to specific pharmacy, status tracking (sent/viewed/fulfilled).
  * Public prescription page (`/receita/:token`): mobile-first, no auth required, shows medications + nearby pharmacies.
  * B2B model: pharmacies pay subscriptions (Individual R$299, Regional R$1,999, Enterprise custom).
  * PharmacyChain entity: supports networks with multiple brands (e.g., RD Saúde → Raia + Drogasil).
  * Pharmacy waitlist for onboarding new pharmacy partners.
  * Admin panel: CRUD for chains/pharmacies, waitlist management, chain metrics dashboard.
  * Clinical reference data: Whitebook-style fields (common brands, usual posology, max dose, indications, pregnancy category, renal/hepatic adjustments).
  * Medication detail modal with thumbs up/down feedback — feeds Data Flywheel for data quality scoring and DPO training.
  * Drug interactions and pharmacy sends cost 0 dracmas (loss leader for engagement).
* **Consultation History:**
  * Save and manage patient consultations.
  * "Improved Notes" feature to refine raw notes into structured medical records.
  * Automatic summarization of cases.

## 2. Clinical Copilot (Copiloto Clínico)

The core AI engine of Qython, designed to assist medical professionals with evidence-based information.

* **Interactive Chat (Chat Interativo):**
  * Natural language interface to query medical knowledge.
  * Powered by Gemini 3.5 Flash with thinking mode (HIGH level).
  * Automatic fallback to Gemini 3.1 Flash-Lite with retry and exponential backoff.
  * **Google Search Grounding** for real-time scientific references.
  * **Unified Reference System** with anti-hallucination validation:
    * Validates all URLs via HEAD requests (discards 404, invalid).
    * Enriches metadata (author, year, title) via page fetch.
    * Combines grounding sources with validated model-generated references.
    * Single academic-style citations section with clickable links.
  * All validated references stored for future model training (Data Flywheel).
  * **Model curation of references (ago/2026):** after the mechanical validation, a light LLM
    pass judges each candidate against the answer's claims — `irrelevante` is dropped,
    `fraca` is demoted, `sustenta` is kept. Safeguards: the list is never emptied (if all are
    rejected, the two highest-authority survive), a candidate without a verdict is kept, and
    any failure returns the mechanical list untouched. Runs BEFORE inline numbering, so
    dropping a reference cannot shift the `[n]` markers. Toggle: `REF_CURATION_ENABLED`.
  * **Evidence hierarchy in ranking (ago/2026):** PubMed `PublicationType` and publication year
    now weigh in — meta-analysis / systematic review / guideline rise, randomized trials rise
    less, case reports / editorials / comments fall, retracted articles plummet. The upward
    adjustment is capped at +3 so it cannot break the class hierarchy (label 96 > guideline 94
    > PubMed 90).
* **Illustrations from the user's own library (ago/2026):**
  * When a visual finding is central (skin lesion morphology, rash pattern, ECG tracing,
    imaging pattern), the model requests an image with `[IMAGEM: <query in ENGLISH>]` on its
    own line, at the exact point of the text where it helps. Max 2 per answer.
  * Resolved against `document_images` — pictures extracted from the PDFs the user uploaded and
    described by `vision_service`. English query is mandatory: the descriptions are in English
    and Postgres full-text runs with the `english` configuration.
  * Served through an **HMAC-signed URL** binding image + owner + expiry (`<img>` cannot send an
    Authorization header, and clinical images must not sit at a guessable path). Long expiry on
    purpose: the URL is stored inside the persisted answer.
  * No match → the directive is removed. The prompt forbids the text from depending on the image
    ("as seen in the figure above"), because it may not exist.
  * ⏳ **Pending:** web image search (Gemini-app style). Blocked on a Google Custom Search Engine
    credential (`GOOGLE_CSE_ID` + key). Agreed plan: license filter (`cc_publicdomain` /
    `cc_attribute`), visible attribution, and proxy-with-cache instead of hotlinking.
  * ❌ Ruled out by decision: AI-generated clinical images (a fabricated clinical photo presented
    as real is a liability) and code-rendered diagrams (Mermaid).
* **Medical Image Analysis (Análise de Exames - Vision):**
  * Upload capabilities for X-rays, CT scans, MRIs, and lab results.
  * Powered by Gemini 3.5 Flash with enhanced visual reasoning.
  * AI detection of anomalies and regions of interest.
  * Suggests differential diagnoses for detected abnormalities.
  * *Note: Always requires human validation.*
* **Second Opinion:**
  * Acts as a virtual colleague for discussing complex cases.

## 3. Intelligent Library (Biblioteca Inteligente)

A personalized knowledge base that allows users to leverage their own documents.

* **Drive-first storage (2026-07):** The library's ORIGINAL files live in the user's OWN cloud (v1 Google Drive, `drive.file` scope) — the server keeps only the derivatives (extracted text/transcription in ChromaDB, embeddings, thumbnails). Upload → written through to the user's "Qython" Drive folder → processed → local copy discarded. Users connect their cloud from **Profile → Settings → Connectors** (web) or **More → Connectors** (mobile); files can also be imported from Drive via the Google Picker (web). No per-plan file limit — the ceiling is the user's own Drive. See `docs/ARCHITECTURE.md` (services/cloud_storage).
* **RAG (Retrieval-Augmented Generation):**
  * Upload documents: PDF, PPTX, DOCX, TXT, MD, CSV, HTML, and audio/video files.
  * Chat specifically with the content of uploaded libraries.
  * Semantic search to find concepts rather than just keywords.
  * **Multimodal Vision Pipeline:** Images embedded in PDFs (radiographs, histology, ECGs, clinical flowcharts, etc.) are automatically extracted, described by Gemini AI, and indexed for semantic search.
  * **Smart PDF Processing:** Direct text extraction for digital PDFs (instant); OCR fallback only for scanned documents.
* **Study Material Generation (Produtor de Materiais):**
  * **Audio Transcription:** Converts audio/video recordings (MP3, WAV, MP4, etc.) into editable text using Whisper Large V3. Ideal for transcribing lectures, classes, and presentations.
  * **Podcasts:** Converts text/documents into audio discussions between two AI hosts. (Residente+ plan required)
  * **Video Lessons:** Generates slide presentations with voiceover narration. (Residente+ plan required)
  * **Mind Maps:** AI-generated visual diagrams with Pro model image generation. Export to PNG/PDF. (Residente+ plan required)
  * **Flashcards:** Automated creation of study cards for memorization.
  * **Questionnaires:**
    * **Objective:** Multiple-choice questions with answer keys.
    * **Subjective:** Open-ended questions for deep understanding.
  * **Summaries & Comparative Tables:** Tools to synthesize information.

## 4. Academic Arena (Arena de Competição)

Gamified learning environment for medical students and residents.

* **Exam Simulations (Simulados):**
  * Support for major exams like ENAMED, USMLE, MIR, etc.
  * Real exam questions from top institutions.
* **Adaptive Quizzes:**
  * Questions that adapt to the user's knowledge level.
* **Performance Analytics:**
  * Detailed dashboards showing strengths and weaknesses.
  * **Rankings:** Compare performance with peers in national leaderboards.
  * Time management tracking.

## 5. Storage Management (Gerenciamento de Armazenamento)

> ⚠️ **Retired as a plan feature (2026-07, Drive-first).** With the library storing originals in the user's own cloud (see section 3), storage is no longer a per-plan quota or upsell lever — there is no file limit and the storage card was removed from billing. The quotas below remain only as a **safeguard for the legacy server-side residue** (users who have not yet connected a cloud, with `CLOUD_LIBRARY_REQUIRED` OFF). Cost per user is now processing (dracmas), not storage.

* **Storage Quotas per Plan (legacy safeguard):**

  | Plan | Storage | Docs/Library | Libraries |
  |------|---------|-------------|-----------|
  | Interno (Free) | 500 MB | 20 | 3 |
  | Residente | 2 GB | 50 | 10 |
  | Staff | 5 GB | 100 | 25 |
  | Especialista | 15 GB | Unlimited | Unlimited |

* **Content TTL (Time-to-Live):**
  * Generated media files (podcast WAV, video MP4, slideshow PPTX, SRT subtitles) expire after **72 hours**.
  * Job records remain in the database with status `expired` — users can view history and regenerate.
  * JSON-based materials (flashcards, summaries, mind maps, questionnaires) do **not** expire — they are stored inline and don't consume significant disk space.
* **Storage Tracking:**
  * User's `storage_used_bytes` is maintained incrementally on every upload and delete.
  * `GET /user/storage` endpoint returns usage, quota, percentage, library counts, and plan limits.
  * Storage bar displayed in the Billing section with color warnings at 70% and 90% usage.
* **Avatar Storage Policy:**
  * Avatar history limit varies by plan (`MAX_AVATAR_HISTORY`): Free=5, Residente=15, Staff=30, Especialista=50. Oldest entries are auto-removed when limit is exceeded (file + DB record).
  * The currently active profile picture is never deleted by the limit enforcement.
  * Orphan avatar files (generated but never saved) are cleaned up automatically after 1 hour.
* **Automated Cleanup (Scheduler):**
  * **Daily at 3:30 AM UTC:** Deletes orphan avatar files not referenced in `users.profile_picture` or `avatar_history.filename` (retention: 1h).
  * **Daily at 4:00 AM UTC:** Deletes chat visualization images older than 30 days.
  * **Daily at 5:00 AM UTC:** Deletes expired generated content, temp upload files (>24h), and orphan thumbnails.

## 6. Billing & Economy (Faturamento e Economia)

* **Dracmas (Virtual Currency):**
  * Used to pay for premium AI generations (Podcasts, Videos, Advanced Image Analysis).
  * Earned via subscription plans or purchased separately.
* **Subscription Plans:**
  * **Interno (Free):** Basic access, limited Dracmas.
  * **Residente:** Monthly subscription, more Dracmas, access to Arena.
  * **Staff:** Higher limits, full Image Analysis access.
  * **Especialista:** Priority processing, maximum limits.
  * **Institucional:** Custom plans for hospitals/universities.
* **Billing Management:**
  * Monthly vs Annual billing (with discounts).
  * Stripe integration for secure payments.
  * Binance Pay for cryptocurrency payments.

## 7. Pesquisa: Qython Medical AI Benchmark

Página dedicada (`/benchmark` no web) com o estudo comparativo do Qython 1
contra os principais LLMs de mercado (Claude Opus 4.7, Sonnet 4.6, GPT-5.5,
Gemini 3.5 Flash, Llama 4 Maverick, DeepSeek V4) em 8 especialidades médicas
(Radiologia, Emergência, Cardiologia, Clínica Médica, G&O, MFC, Cirurgia
Geral, Pediatria). Conduzido como TCC de Medicina; resultados publicados
após coleta. Newsletter de inscrição reaproveita o endpoint
`/api/user/payment-waitlist`.

## 8. User Experience & Settings

* **Profile Management:**
  * AI Avatar Generation for user profiles.
  * Specialty and occupation customization.
* **Interface:**
  * Dark theme (native).
  * Multi-language support (Portuguese, English, Spanish).
  * Responsive design (Mobile-First).
  * **Persistent material viewer (web):** generated study materials open in an app-level viewer that survives navigation — minimize a quiz to a floating pill, go ask the Copilot, and come back to the same question, answers and timer (timer pauses while minimized). Up to 5 materials open at once, stacked as pills; one expanded at a time. Deliberately *not* used by Meus Concursos, where an exam should stay focused.
* **Identity Verification (via Lastreo):**
  * Physicians (CRM/CFM + CNES) and medical students (institutional e-mail or enrollment proof), through an embedded Lastreo flow.
  * Documents and selfie go straight to Lastreo — they never pass through Qython's backend.
  * The internal Gemini-based KYC was removed in Jun/2026; `verification_status` is now written only from Lastreo sources.
* **Privacy & Data Rights (LGPD):** (Settings → Privacidade)
  * Granular ML training consent — 6 opt-in scopes (default OFF), revocable anytime.
  * Export my data (Art. 18 V) — ZIP with structured JSON.
  * Delete my account (Art. 18 VI) — cascade + soft delete + async purge.
  * Patient transparency block — copy link + printable QR code for the `/paciente` notice (waiting room).
  * Public pages: `/encarregado` (DPO), `/subprocessors` (by category), `/paciente`.
  * Under the hood: field-level encryption (Fernet), append-only audit log, PII redaction before any external LLM call. See `docs/QYTHON_LGPD_PLAN.md`.

## 9. Mobile App (Android — React Native)

* **Adaptive Layout:**
  * `useDeviceClass()` hook detects compact (phone), medium (foldable), expanded (tablet).
  * Compact: Bottom Tabs (5 items: Copiloto, Ambulatório, Farmácia, Acadêmico, Mais).
  * Medium/Expanded: Permanent Drawer (Copiloto, Ambulatório, Farmácia, Acadêmico, Perfil).
* **Authentication:**
  * Email/password login.
  * Google Sign-In via Firebase Auth.
  * Forgot Password flow (sends reset email, user resets via web browser).
  * Session validation on app launch (`GET /user/info`).
  * JWT persistence in AsyncStorage.
* **Copilot Chat:**
  * Full chat with markdown rendering and typing animation.
  * Camera and gallery image upload (max 3 images, 5 files, 20MB).
  * Session management (create, switch, delete).
  * Like/dislike feedback on AI responses.
  * Clinical reasoning toggle.
  * Source references display.
  * Library context selection (RAG).
  * Patient context for clinical queries.
* **Ambulatory (Full Web Parity):**
  * New consultation with 24 specialty templates, AI draft generation.
  * Patient CRUD (create, list, detail, edit, delete, picker modal).
  * Consultation history with search and filtering.
  * Prescription generation.
  * Exam orders with grouped exam panels.
  * Patient orientations (templates + AI generation).
  * Voice transcription (mobile-exclusive: record audio → text).
  * Consultation timer with inactivity timeout (mobile-exclusive).
  * Quick insert bar and subtemplate sheets.
  * Feedback buttons on AI-generated content.
* **Pharmacy (Full Web Parity):**
  * Medication search with filters (therapeutic class, controlled type, government program, country).
  * Medication detail modals with clinical reference data.
  * Medical supplies catalog.
  * Drug interaction checker (deterministic DB, not LLM).
  * Prescription history and sharing.
  * Government program badges and controlled substance badges.
* **Academic (Full Web Parity):**
  * Library management (create, list, delete).
  * Document upload and management within libraries.
  * Library RAG chat (chat with your documents).
  * Material generation from documents (podcasts, summaries, flashcards, quizzes).
  * Podcast player.
  * Arena: exam simulations, rankings, seasons.
* **Profile (3-Tab Layout):**
  * **Personal Tab:** Edit profile (name, specialty, country), change password.
  * **Billing Tab:** Subscription card, dracma balance breakdown, storage usage, dracma statement, PricingModal, DracmaPurchaseModal (all gated with ComingSoonModal).
  * **Settings Tab:** Privacy & data rights (granular ML consent opt-in, export/delete account), dark/light theme toggle, language selector (PT/EN/ES), about, logout.
  * Header: avatar + name + email (fixed above TabBar).
* **i18n:**
  * Portuguese, English, Spanish — same keys as web.
  * Device language auto-detection with PT fallback.
* **Push Notifications:**
  * Firebase Cloud Messaging (FCM).
  * Token registration via `POST /user/push-token`.
  * Foreground and background message handlers.
  * Android 13+ POST_NOTIFICATIONS permission handling.
* **Billing (Dashboard + Coming Soon Gating):**
  * ProfileScreen refactored into 3-tab layout (Personal, Billing, Settings).
  * BillingTab dashboard: subscription card, dracma balance with source breakdown, storage usage bar, dracma statement with expiration tracking.
  * PricingModal: 5 plans (Intern/Resident/Staff/Specialist/Enterprise), monthly/annual toggle with 20% discount.
  * DracmaPurchaseModal: 3 packages (500/2,000/4,000 dracmas).
  * ComingSoonModal: waitlist integration (check + join), gating all payment CTAs.
  * API: `GET /billing/balance/breakdown`, `GET /user/storage`, waitlist check/join.
* **Native Share Sheet:**
  * `useShare()` hook: reusable PDF download + native share, with loading state and temp-file cleanup.
  * `sharePdf(endpoint, filename)`: authenticated download via `react-native-blob-util`, opens OS share sheet via `react-native-share`.
  * `shareText(text, title?)`: plain-text sharing via RN built-in `Share.share()`.
  * Used por ambulatório (receitas, relatórios, pedidos de exame, orientações).
* **Modo Offline (Offline Mode):**
  * Network detection via `@react-native-community/netinfo` with `NetworkProvider` context.
  * MMKV (react-native-mmkv) encrypted storage for offline data (~4MB total).
  * Delta sync with backend: `GET /api/sync/medications`, `/api/sync/interactions`, `/api/sync/user-data` — supports `since` parameter for incremental updates.
  * Sync orchestration: auto-sync on login, sync-if-stale (>1h) on app foreground, manual sync from settings.
  * Offline search: medications (country, class, controlled, substring), drug interactions (A-B and B-A matching), patients, consultations.
  * Offline mutations queue (FIFO): create/update patients, create consultations — persisted in MMKV, processed on reconnect with 3x retry and exponential backoff.
  * Temp ID resolution: offline-created records get `temp_xxx` IDs, resolved to server IDs when queue processes.
  * OfflineBanner: animated amber banner when offline, shows last sync time.
  * SyncStatusBadge: visual indicator (synced/syncing/pending).
  * OfflineFeatureGate: disables AI-dependent features (improve notes, generate summary, share PDF) when offline.
  * Sync Settings screen: sync timestamps, record counts, cache size, "sync now", "clear cache".
  * PendingActionsSheet: bottom sheet showing queued operations with remove and sync actions.
  * Pharmacy offline: medication search, supply search, and interaction checker work from cached data.
  * Ambulatory offline: patient search, consultation history from cache; new patients/consultations queued.
  * Cloud icon on locally-created records that haven't synced yet.
* **Web PWA (Basic Offline):**
  * `vite-plugin-pwa` with service worker caching strategies.
  * CacheFirst for static assets, StaleWhileRevalidate for medications API, NetworkFirst for other APIs.
  * Offline fallback page with glassmorphism design and retry button.
  * OfflineBanner component at top of app when offline.
* **Notification System:**
  * Persistent notification center with full history (bell icon on web sidebar and mobile).
  * **WebSocket real-time delivery** as primary channel (`wss://qython.ai/api/notifications/ws?token=<jwt>`).
    * In-process `ConnectionManager` (dict `user_id → set(WebSocket)`) for instant push.
    * Auto-reconnect with exponential backoff (1s, 2s, 5s, 10s, 30s) on both web and mobile.
    * 30s ping/pong keepalive.
    * Polling as fallback: web 5min, mobile 60s.
  * In-app toast notifications for foreground push messages (mobile: animated slide-down with color-coded types; web: stacked glassmorphism toasts).
  * FCM push notifications for background/killed-state events.
  * Event-driven triggers: material generation complete/failed, dracma expiration warnings, KYC verification status, arena season start.
  * Unread badge updated in real-time via WebSocket (with polling fallback).
  * Mark as read (individual or bulk) with optimistic UI updates + WebSocket broadcast of updated unread count.
  * Notification preferences: per-type and global push/email toggles.
  * Automatic cleanup of read notifications older than 90 days (daily scheduler job).
  * Deep linking: tap notification to navigate to relevant screen.
  * i18n: all notification content localized (PT/EN/ES).
* **Transactional Email System:**
  * 5 automated email templates with dark glassmorphism design (matching brand):
    * **Material Ready:** Sent when podcast/video/simulado completes generation. Includes direct link.
    * **Weekly Digest:** Monday morning summary with consultation count, dracmas used, arena score, and streak days.
    * **Inactivity (14 days):** "We miss you" re-engagement email.
    * **Deactivation Warning (60 days):** Urgency email warning of account deactivation with red banner.
    * **Welcome Day 3:** Tips email 3 days after activation (create library, generate podcasts, train in arena).
  * All templates localized in PT/EN/ES.
  * `email_tracking` JSON field on User model prevents duplicate sends.
  * Delivery via Resend API.
* **Analytics Dashboard (Admin):**
  * Admin-only dashboard at `/admin/analytics` with period selector (7d / 30d / 90d).
  * Metrics: DAU, WAU (with week-over-week change), MAU, Total Active Users.
  * Charts (Recharts): DAU line chart, registration growth bar chart, feature adoption donut, AI usage horizontal bars.
  * Activity tracking across 4 features: copilot, consultation, academic, pharmacy.
  * Backend endpoints: DAU/MAU, growth, cohort retention, feature usage, AI/dracma usage.
  * Fire-and-forget `track_activity()` service piggybacks on existing route commits.
* **iOS Build Setup:**
  * Info.plist with permission descriptions (camera, photo library, microphone, speech recognition).
  * UIBackgroundModes: `fetch` and `remote-notification`.
  * Firebase Messaging integration in AppDelegate.swift (APNs token, foreground notifications).
  * Entitlements: push notifications (development), associated domains (`applinks:qython.ai`, `applinks:qython.app`).
  * GoogleService-Info.plist.example template (real file from Firebase Console).
  * Build scripts: `ios:pod-install`, `ios:build-debug`, `ios:build-release`, `ios:open-xcode`, `ios:clean`.
  * Comprehensive iOS build documentation at `docs/IOS_BUILD.md`.
* **Recent Features (February 2026):**
  * **Session Rename (Copilot):** Long-press on session in drawer to rename or delete. Inline TextInput for editing session title.
  * **Undo/Redo (Ambulatory):** After AI improves notes, undo restores original raw notes. Redo offers "with edits" (current text) or "from original" options. Tracks original notes for DPO training data.
  * **Challenges (Academic Arena):** Create challenges by username + exam selection. Accept/decline incoming challenges. Score comparison and result display.
  * **Onboarding Tour System:** Reusable `QythonTour` component with spotlight overlay, step navigation, and AsyncStorage persistence. 5 module configs (Copilot, Consultation, Academic, Pharmacy, Profile). Reset tours option in Settings.
  * **Difficulty Badges (Quiz):** Color-coded difficulty labels (easy/medium/hard) and topic badges displayed in quiz questions.
  * **Library Edit/Delete:** Visible edit (pencil) and delete (X) action buttons on library cards. Long-press menu with edit/delete options. Dual-mode CreateLibraryModal (create + edit).
  * **iOS/Android Parity:** Standardized KeyboardAvoidingView behavior, platform-safe vibration patterns, zero TypeScript errors.
* **Mobile Design System (Clinical Glassmorphism)** *(May 2026)*:
  * Shared `GradientButton` component (3 variants: primary, secondary, outline) with LinearGradient + luminous brand-colored shadow + animated press feedback.
  * Shared `useButtonPress` hook (scale + translateY spring animation, mirrors web `.cta:hover`).
  * `alpha(hex, opacity)` helper in `theme/colors.ts` to replace inline `+ '20'` transparency suffixes.
  * `react-native-linear-gradient` lib (^2.8.3) — auto-linked on Android, requires `pod install` on iOS.
  * `qython-imagotipo.png` brand asset shared with web.
  * Coverage: Auth (Login/Register), Profile (Screen/PersonalTab/Avatar), Copilot (Screen/Bubble/Header), Ambulatory (4 form tabs + cards + FAB), Pharmacy (4 tabs + 5 card components + MedicationPill), Academic (LibraryDetail + Document/MaterialCard + FAB), Billing (PricingModal), TabBar shared.
* **Removed Features** *(May 2026 — cleanup pass)*:
  * **Blog system:** public `/blog/:id` route, admin manager, news articles data, backend `/api/blog/*` routes, `blog_posts` table — all removed (zero adoption, see `2026_05_26_drop_blog` migration).
  * **Centro Cirúrgico:** 18 web components, 17 mobile components/screens, 9 DB tables (`surgical_cases`, `surgical_events`, `surgical_outcomes`, `surgical_templates`, `surgical_materials`, `surgical_checklists`, `drug_administrations`, `vital_signs`, `anesthesia_alerts`), `/api/surgical/*` router, ASA calculator, anesthesia monitoring — all removed (0 cases ever created, see `2026_05_27_drop_surg` migration).
  * **Modo Plantão (Emergency On-Call):** Quick Doses + Clinical Protocols mobile/web tabs — removed (no backend state, no usage data, redundant with Copilot for the legitimate post-shift handoff/quick-reference cases).
* **Not Yet Implemented:**
  * Google Play Billing integration (actual payments — currently gated with Coming Soon).
