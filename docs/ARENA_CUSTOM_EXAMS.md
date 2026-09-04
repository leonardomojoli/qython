# Arena — Provas Customizadas (Concursos)

**Status:** GERADOR PESSOAL (web + mobile) — gerar + pesquisa/dossiê. Compartilhar/competir DESCARTADO. · jun/2026
**Fonte de verdade** deste recurso. Atualizar aqui antes/depois de mexer no código.

> ⚠️ **PIVOT (jun/2026):** a parte de **compartilhar/competir foi descartada**. Concurso é jogo de **soma zero** — o usuário não quer entregar suas provas a concorrentes (mesmo "colegas"). O recurso é um **gerador PESSOAL**: bibliotecas + pesquisa da banca → provas fiéis e privadas. A camada 3 (publicar+competir) e toda a "trilha separada" de XP saem; as tabelas `custom_exam_rounds`/`custom_round_attempts` foram **dropadas** (migração `2026_06_21_drop_arena_rounds`). As seções §5.1 (rounds/attempts), §9 (competição), §10 (rotas de round) e §13 abaixo referentes a round/compartilhar ficam como **registro histórico do que foi descartado** — não implementar.

---

## 1. Resumo

Hoje a **Arena** é um catálogo **fixo** de provas definidas por admin (`ArenaExam`: ENEM, USMLE…) com competição por XP/ligas/temporadas globais. Este recurso adiciona um **3º pilar — "Meus Concursos"** — onde o **usuário cria a própria prova** a partir das suas bibliotecas (e/ou upload), o Qython **pesquisa a prova na web** para entender a banca antes de gerar, produz **muitas provas variadas**, e pode **publicar um round congelado** que colegas do mesmo concurso respondem e disputam num **leaderboard próprio**.

Cenário-alvo (do solicitante): preparar um concurso específico (ex.: Campina Grande). O usuário monta uma biblioteca com tudo da prova, cria um *card*, define nº de questões/tempo, o Qython pesquisa o edital/banca/provas passadas, gera o simulado, e o grupo de estudo compete no mesmo round por link de convite.

---

## 2. Decisões travadas

| # | Decisão | Escolha | Implicação |
|---|---------|---------|------------|
| 1 | O que se compartilha | **Prova pronta (round congelado)** | Não expõe os PDFs do dono; competição justa (todos respondem o mesmo conjunto) |
| 2 | Competição | **Entra no Arena de verdade** | Reusa `QuizPlayer`/desafio/share-card; vive no pilar Arena |
| 3 | Escopo v1 | **Tudo de uma vez** | Gerador + pesquisa + publicar + competir; faseado só como ordem de build |
| 4 | XP / liga | **Trilha separada** | Leaderboard próprio do round; **não** alimenta liga/temporada oficial (sem farming) |
| 5 | Descoberta | **Convite por link (privado)** | Sem vitrine pública nem moderação no v1; round privado por `join_token` |

**Default assumido (quality-gate):** publicar um round exige o dono **revisar o gabarito**; quem responde tem botão **"reportar questão"**.

---

## 3. Conceito central

> Um **Card** é um *ArenaExam definido pelo usuário*: onde o `ArenaExam` oficial tem um `context_filename` estático, o Card tem contexto **dinâmico** (bibliotecas + dossiê de pesquisa + histórico de provas). Dele saem **Rounds** (instâncias congeladas, publicáveis e competíveis).

A competição é "Arena de verdade" na **experiência** (mesmo player, leaderboard, desafio, share-card), mas roda numa **trilha paralela** isolada da liga global — resolvendo o buraco de "gerar prova fácil em casa e farmar XP".

---

## 4. Ciclo de vida

1. **Criar Card** — nome ("Concurso SES-PB 2026 — Clínica"), fontes (1+ bibliotecas e/ou upload direto), config (nº questões, tempo, mix obj/disc, dificuldade, idioma).
2. **Pesquisar a prova → dossiê revisável** — busca web (banca, formato, temas, provas passadas); o Qython **mostra o que achou**, o usuário **confirma/corrige**, e o dossiê fica **cacheado no Card** (pesquisa 1×, reusa em todas as gerações).
3. **Gerar provas (drafts)** — quantas quiser; cada draft é privado. Reusa o motor atual + **duas memórias**: exemplar positivo (estilo da banca) e avoid-list (gerações anteriores deste Card).
4. **Revisar o draft** — o dono valida questões/gabarito (chave errada num round competitivo envenena o placar de todos).
5. **Publicar Round (congelado)** — vira imutável, ganha `join_token` e leaderboard.
6. **Competir** — colegas entram pelo link, respondem o mesmo conjunto no `QuizPlayer`, são ranqueados na trilha do round, geram share-card. O dono pode publicar novos rounds quando quiser.

---

## 5. Modelo de dados

### 5.1 Tabelas NOVAS

**`custom_exam_cards`** — o gerador/template
| Coluna | Tipo | Nota |
|--------|------|------|
| id | PK | |
| user_id | FK users (CASCADE) | dono |
| name | String(120) | |
| description | Text, null | |
| language | String(10), default 'pt-BR' | idioma da prova/pesquisa |
| config | JSON | `{num_questions, time_limit_minutes, objective_ratio, difficulty_distribution, ...}` |
| dossier | JSON, null | `{confirmed, banca, format_notes, themes, sources[], past_exam_examples[], researched_at}` |
| status | String(20), default 'active' | active / archived |
| created_at / updated_at | timestamptz | |

**`custom_card_sources`** — quais fontes alimentam o Card (1 linha por biblioteca)
| Coluna | Tipo | Nota |
|--------|------|------|
| id | PK | |
| card_id | FK custom_exam_cards (CASCADE) | |
| library_id | FK academic_libraries (SET NULL) | upload direto → **auto-cria uma biblioteca de apoio** e entra aqui (fontes ficam uniformes = bibliotecas, reusando todo o pipeline vetorial) |

**`custom_exam_rounds`** — instância congelada/publicável
| Coluna | Tipo | Nota |
|--------|------|------|
| id | PK | |
| card_id | FK custom_exam_cards (CASCADE) | |
| user_id | FK users | dono (denormalizado) |
| title | String(140) | "SES-PB — Simulado #3" |
| content | JSON | questões **congeladas** + gabarito (mesmo schema `questionario_objetivo`) |
| num_questions | Integer | |
| time_limit_minutes | Integer, null | |
| status | String(20) | draft / published / closed |
| visibility | String(20), default 'link' | v1: só `link` |
| join_token | String(40), unique, null | link de convite |
| published_at / closed_at / created_at | timestamptz | |

**`custom_round_attempts`** — respostas a um round (trilha separada; **tabela própria de propósito**, p/ não contaminar stats/XP globais)
| Coluna | Tipo | Nota |
|--------|------|------|
| id | PK | |
| round_id | FK custom_exam_rounds (CASCADE) | |
| user_id | FK users | |
| score | Integer | |
| correct_count / incorrect_count / unanswered_count / total_questions | Integer | |
| time_elapsed_seconds | Integer, null | desempate do leaderboard |
| answers_detail | JSON, null | revisão por questão |
| completed_at | timestamptz | |

> **Leaderboard do round** = `SELECT … FROM custom_round_attempts WHERE round_id = X ORDER BY score DESC, time_elapsed_seconds ASC`. Sem `SeasonRanking`, sem XP global.

### 5.2 Alteração

**`academic_materials`** + `card_id` (nullable, FK `custom_exam_cards` SET NULL, index). Drafts gerados de um Card são `AcademicMaterial` (reusa todo o caminho de geração + flywheel `training_data_id` + `expires_at`). O `card_id` permite a **anti-repetição por Card** (não só por biblioteca).

### 5.3 Intocadas (garantia da trilha separada)
`season_rankings`, `user_xp_profiles`, `xp_transactions`, `arena_seasons`, `arena_exams`, `quiz_attempts`. Round customizado **não** escreve em nenhuma delas → zero impacto na liga oficial.

Migração sugerida: revisão Alembic `2026_06_21_arena_custom_exams` (4 tabelas novas + 1 coluna).

---

## 6. Reuso vs. novo

| Peça | Estado | Onde |
|------|--------|------|
| Motor de gerar prova | ✅ reuso | `generate_study_material` / `generate_objective_quiz_prompt` / schema estruturado / `extract_json_from_response` (raw_decode) / `_log_call_cost` |
| Anti-repetição | ✅ reuso, **rechavear p/ Card** | `_collect_prior_quiz_stems(db, user_id, library_id)` → aceitar `card_id`; `_avoid_repetition_block` |
| Texto da fonte p/ geração | ✅ reuso, **multi** | `get_all_text_for_library` → `get_all_text_for_libraries(ids)` (concatena; amostra via RAG quando estourar o contexto) |
| Player de quiz | ✅ reuso | `QuizPlayer` (web) / `QuizPlayerModal` (mobile) |
| Share-card de resultado | ✅ reuso | `share_card_service` |
| Pesquisa web (grounding) | ⚠️ **novo** (hoje só dentro do chat) | nova função standalone (ver §7) |
| Compartilhar conteúdo acadêmico | ⚠️ **novo** inteiro | só existe `PrescriptionShare` (token) como padrão |
| Multi-biblioteca / upload-no-card | ⚠️ **novo** | hoje `ProcessPayload` é 1 biblioteca OU 1 arquivo |
| UI do pilar (CRUD card, dossiê, publicar) | ⚠️ **novo** | `ArenaQython.js` (web) + `ArenaTab.tsx` (mobile) |

---

## 7. Pesquisa da prova (dossiê)

Função **standalone** de grounding (nova; hoje grounding só roda embutido no chat). Ex.: `services/academic_services/exam_research_service.py`.

- **Entrada:** nome do concurso/prova + banca (texto do usuário) + amostra do conteúdo das fontes.
- **Chamada:** Gemini com `types.Tool(google_search=...)` (mesmo padrão de `llm_services`), prompt pedindo: **formato** (nº de alternativas, discursiva, pesos), **estilo** das questões, **temas recorrentes**, e **sinais de provas passadas**. Enriquecer fontes via `reference_service` (mesmo pipeline de citações).
- **Saída → `card.dossier` (JSON):** `{synthesis, format_notes, themes[], sources[], past_exam_examples[], confirmed:false}`.
- **Human-in-the-loop:** o usuário revê e **confirma/edita** (`confirmed:true`) antes do dossiê guiar a geração. Crítico: pesquisa de concurso específico erra/alucina; a confirmação é a rede de segurança (objetivo do solicitante: "não fazer uma prova que se diferencia do que de fato vai ser cobrado").
- **Cache:** roda 1× por Card (botão "atualizar pesquisa" re-roda). Custo ~1 chamada grounded (~$0,035), não por geração.

---

## 8. Geração — duas memórias

O solicitante juntou dois usos de "provas em contexto"; separá-los melhora a qualidade:

- **Exemplar positivo (estilo):** `dossier.past_exam_examples` (provas reais passadas) **ou** um draft que o dono marque como "referência" → few-shot de "é ASSIM que essa banca escreve".
- **Avoid-list negativa (variedade):** por **Card**. Redesenhada em ago/2026 depois de medir 7 provas (280 questões) e achar 5 pares praticamente idênticos, 3 reescritos e 15 gabaritos repetidos:
  - **Por BLOCO** (`_collect_prior_by_block`), não mais uma lista plana com teto de 150 replicada em todos os blocos. Com 280 enunciados no card, 130 ficavam invisíveis — as provas mais antigas não existiam para o gerador, origem de 4 dos 5 pares idênticos. Medido: 900 linhas de contexto → **280, com cobertura total** (teto por bloco em `EXAM_AVOID_PER_BLOCK`, default 200).
  - **Cada linha carrega o NÚCLEO** (`_prior_line`): enunciado + `[cobrou: <gabarito> · <tópico>]`. Só o enunciado não segurava — o modelo reescrevia a pergunta e mantinha o ponto.
  - **Verificação, não só instrução:** `REPETE_PROVA_ANTERIOR` / `REPETE_NA_PROVA` no QA (similaridade ≥ 0,80 sobre o enunciado normalizado) alimentam o auto-reparo.
  - ⚠️ **Repetição é questão de GRAU** (decisão do fundador): onde a fonte é estreita de propósito (História local, Informática, Legislação — o concurso só cobra aqueles temas), repetir é inevitável. `should_repair` só gasta a 2ª chamada quando a repetição passa de 20% do bloco **e** de 1 questão.

Demais: temperatura 0.85 (já é o default de questionário), `MATERIAL_LLM_MODEL` (3.1-lite) + `MATERIAL_THINKING_LEVEL` (high). **Multi-fonte:** concatenar texto das bibliotecas do Card; quando passar do teto de contexto, amostrar por RAG (e5) em vez de full-text.

---

## 9. Competição (trilha separada)

- **Congelar:** publicar copia o draft escolhido (`AcademicMaterial.content`) para `custom_exam_rounds.content` (imutável) + gera `join_token`.
- **Responder:** colega abre `…/rounds/{token}`, faz no `QuizPlayer`, submete → grava `custom_round_attempts` (**não** `quiz_attempts`, **não** XP). Endpoint dedicado que **não** chama o serviço de XP.
- **Leaderboard:** derivado de `custom_round_attempts` (score, desempate por tempo).
- **Quality-gate:** revisão do gabarito antes de publicar + "reportar questão" no player.
- **Share-card:** reusa `share_card_service` no resultado.

---

## 10. Superfície de API (nova, sob `/api/academic/arena/`)

| Método | Rota | Função |
|--------|------|--------|
| POST | `cards` | criar card (nome, config, fontes) |
| GET | `cards` | listar meus cards |
| GET / PUT / DELETE | `cards/{id}` | detalhe / editar / apagar |
| POST | `cards/{id}/research` | rodar/atualizar dossiê |
| PUT | `cards/{id}/dossier` | confirmar/editar dossiê |
| POST | `cards/{id}/generate` | gerar draft (assíncrono) |
| GET | `cards/{id}/drafts` | listar drafts |
| POST | `cards/{id}/rounds` | publicar draft → round congelado |
| GET | `rounds/{token}` | abrir round por convite |
| POST | `rounds/{id}/attempt` | submeter tentativa |
| GET | `rounds/{id}/leaderboard` | classificação |

Acesso: dono é checado por `user_id` (mesmo padrão das bibliotecas). Round é acessível por quem tem o `join_token` (autenticado p/ pontuar).

---

## 11. Frontend

- **Web** (`packages/web/src/components/academic/ArenaQython.js`): novo pilar **"Meus Concursos"** ao lado de "My Rankings"/"Explore" — lista de cards, *card builder* (seletor **multi-biblioteca** + upload, form de config), painel de **revisão do dossiê**, lista de drafts + botão gerar, publicar → round + link de convite + leaderboard. Reusa `QuizPlayer`.
- **Mobile** (`packages/mobile/src/screens/academic/ArenaTab.tsx`): **paridade 100%** (regra do projeto) — mesmo fluxo, `QuizPlayerModal`.

---

## 12. Custo & gating

- **Geração** ~$0,015/prova (lite+thinking); **pesquisa** ~$0,035 cacheada por Card. "Inúmeras provas" = consumo de dracmas previsível, coberto pelo billing (detalhar em `BILLING_ECONOMICS.md`).
- **Plano:** a Arena já exige plano (resident/staff/specialist); cards customizados seguem **premium** por padrão (confirmar).
- **Abuso:** criação de card / pesquisa são gated por dracma + rate-limit; round privado-por-link não abre superfície de moderação.

---

## 13. Ordem de construção (o destino é tudo; isto sequencia p/ cada camada ser testável)

1. **Fundação + gerador pessoal** — 4 tabelas + `academic_materials.card_id` + migração; criar card (multi-biblioteca + upload→auto-lib); gerar drafts com anti-repetição por Card. *Testável:* crio um card e gero provas variadas.
2. **Pesquisa (dossiê)** — função grounding standalone + tela de revisão/confirmação + injeção na geração. *Testável:* provas saem com a cara da banca.
3. **Publicar + competir** — congelar round + `join_token` + `QuizPlayer` + `custom_round_attempts` + leaderboard + share-card + reportar questão. *Testável:* o grupo faz o mesmo round e vê o ranking.
4. **Paridade mobile + polish** — portar o pilar p/ `ArenaTab.tsx`.

---

## 14. Decisões em aberto (defaults, não-arquitetura)

- Limites: nº de cards por usuário/plano, teto de questões, faixa de tempo, expiração/fechamento de round.
- Idioma do dossiê (pt p/ concurso BR por default).
- "Referência de estilo": automática (1º draft) vs. escolhida pelo dono.
- Confirmar gating premium e preço em dracmas de geração/pesquisa.

---

## 15. Riscos & mitigações

| Risco | Mitigação |
|-------|-----------|
| Pesquisa web alucina o edital | Dossiê **revisável** (confirm obrigatório) antes de guiar a geração |
| Questão/gabarito de IA errado num round competitivo | Quality-gate (revisão do dono) + "reportar questão" |
| Farming de XP com prova fácil | **Trilha separada** — round não escreve XP/liga/season |
| Fonte gigante estoura o contexto | Amostragem RAG quando full-text não couber |
| Compartilhar expõe PDF autoral | Compartilha-se só o **round congelado**, nunca a fonte |

---

## 16. Status de implementação

- ✅ **Qualidade da geração — Markdown, QA com auto-reparo e texto-base** (ago/2026):
  - **Markdown inline** virou o formato oficial das questões: o modelo destaca com `**negrito**` os termos que a questão manda analisar (como a banca faz), e a UI renderiza igual em quiz, revisão, visualização, PDF e mobile (`shared/InlineMarkdown` no web, `common/InlineMarkdownText` no mobile). **Lacuna = `______`**, escapada antes de renderizar (web e PDF) porque `_` é ênfase em Markdown. ⚠️ Regra de prompt pedindo "TEXTO PLANO" quebrou um bloco inteiro (escreveu sem acentuação E sem as lacunas) — não repetir.
  - **`services/academic_services/question_qa.py`**: a saída é VALIDADA antes de entregar — `SEM_ACENTO`, `LACUNA_AUSENTE`, `LACUNA_DESCASADA`, `DESTAQUE_FANTASMA`, `REFERENCIA_IMPOSSIVEL`, `TEXTO_BASE_AUSENTE`, `TEXTO_INEXISTENTE`, `GABARITO_INVALIDO`, `ALTERNATIVAS`, `ALTERNATIVAS_IGUAIS`, `REPETE_*`. Havendo defeito, o bloco é refeito **1×** com a lista exata + um exemplo do que saiu errado; só troca se melhorar. Vale para a prova por blocos e para o Produtor de Materiais.
  - **Texto-base compartilhado** (`textos_base` + `texto_base` na questão): formato clássico de banca — um texto de apoio ancorando 2-4 questões ("Leia o texto para responder às questões 15 e 16"). Rótulos renumerados globalmente no merge (cada bloco é uma chamada de LLM e entregaria o seu próprio "Texto I"). No quiz o texto se repete a cada questão do grupo; no PDF sai uma vez.
  - ⚠️ **Gotcha durável:** a geração usa **constrained decoding** (`_QUESTIONNAIRE_OBJECTIVE_SCHEMA`). Campo que não está no schema o modelo é **impedido** de emitir, por mais que o prompt mande — foi o que aconteceu ao lançar o texto-base. **Campo novo exige mexer no schema JUNTO com o prompt.**
  - **Ferramenta de reparo:** `/tmp/refazer_bloco.py` no servidor — diagnostica por bloco, refaz só os reprovados pelo mesmo caminho da rota, aceita `--dry`, `--force=<bloco>` e `--strict`, e limpa `last_attempt` porque os itens mudam.
- ❌ **Questão com IMAGEM — não suportada** (decisão de ago/2026): o gerador produz só questão textual. Se um dia entrar, o caminho definido é **reaproveitar imagem real** já extraída das fontes do usuário (`document_images` + `vision_description`), **nunca gerar por IA** — figura clínica inventada apresentada como real é passivo, não feature. Exigiria campo `imagem_id` no **schema de constrained decoding** (ver gotcha acima), validação no QA e render no web/mobile/PDF. ⚠️ Antes de implementar, verificar se a banca daquele usuário cobra imagem: é característica do concurso, não do produto — o Qython não tem essa resposta a priori.

- ✅ **Camada 1 — backend** (jun/2026): modelos (`CustomExamCard` / `CustomCardSource` / `CustomExamRound` / `CustomRoundAttempt`) + `academic_materials.card_id`; migração `2026_06_21_arena_custom_exams`; CRUD do Card (`POST/GET/PATCH/DELETE /api/academic/arena/cards`, multi-biblioteca, gate Residente+); geração de draft (`POST .../cards/{id}/generate`) com agregação multi-fonte (`_aggregate_library_text`), **anti-repetição POR CARD** (`_collect_prior_quiz_stems(card_id=…)`) e **quantidade de questões parametrizável** (`question_count` propagado até os prompts; default 25 = comportamento legado do Produtor de Materiais intacto; clamp 5–50 na camada 1). Validado local: `configure_mappers()` OK + DDL das 4 tabelas executa em SQLite. ⚠️ A migração real (PG) roda no **deploy**.
- ✅ **Camada 1 — UI web** (jun/2026): 3º pilar **"Meus Concursos"** no `ArenaQython` (gate Residente+), componente `MeusConcursos.js` + `MeusConcursos.module.css` (glassmorphism). Criar/editar card (seletor **multi-biblioteca** por chips + nº de questões + tipo obj/disc + tempo), **gerar prova** (polling via `getMaterialJobStatus`), **ver drafts** e abrir no `MaterialResultModal` (reuso), botão **"Refazer"** gera novo draft do mesmo card. Funções em `api.js` (`/academic/arena/cards…`); i18n `mc*` (46 chaves) em pt/en/es. Validado: esbuild (JSX) + JSON dos locales OK.
- ⏳ Pendente na camada 1: **upload-direto-no-card** (auto-biblioteca de apoio) — hoje orquestrável pelo front via `/upload` + `/libraries` existentes; atalho dedicado depois.
- ✅ **Camada 2 — pesquisa/dossiê** (jun/2026): `exam_research_service.research_exam_dossier` faz UMA chamada **grounded** (Google Search, reusa `client`/tool/extração do `llm_services`) e devolve um dossiê em **MARKDOWN** (Formato/Estilo/Temas/Provas-passadas/Como-montar) + fontes; **NÃO usa JSON estrito** (suprimiria o grounding). Endpoints `POST cards/{id}/research` (cacheia em `card.dossier`, `confirmed=false`) e `PUT cards/{id}/dossier` (editar/confirmar — **human-in-the-loop**). A geração injeta o dossiê **só se `confirmed`** (`_banca_profile_block` no topo do prompt do questionário; `banca_profile` threaded por `generate_study_material` → `_run_material_generation_task`; default ausente = comportamento intacto). UI: botão **"Dossiê"** + modal (pesquisar → revisar/editar markdown via ReactMarkdown → confirmar) + selo **"Dossiê"** no card; api `researchCardExam`/`updateCardDossier`; +16 chaves i18n. **Sem migração nova** (usa a coluna `dossier` da camada 1). Cobrança reusa a feature `generate_study_material` por ora. Validado: py_compile + esbuild + JSON.
- ❌ **Camada 3 (publicar round + competir) — DESCARTADA** (ver PIVOT no topo). Tabelas `custom_exam_rounds`/`custom_round_attempts` dropadas (`2026_06_21_drop_arena_rounds`); modelos/relationships/UI de rounds removidos.
- ✅ **Reforço do gerador (solo)** (jun/2026): (a) **"fazer a prova e se corrigir"** — já existia no `MaterialResultModal` (`quizMode` + cronômetro + score + revisão acerto/erro), reusado ao abrir um draft, então saiu de graça; (b) **exemplos no estilo da banca** — seção no prompt da pesquisa (o modelo escreve 2-3 exemplos representativos; flui pra geração via `banca_profile`); (c) **upload-direto-no-card** — o form anexa arquivos que viram uma **biblioteca de apoio** (`createLibrary` + `uploadDocumentToLibrary`) e entram como fonte; orquestração 100% frontend, reusa o pipeline de documentos. *(Provas passadas REAIS literais ficou de fora — exigiria fetch/parse de PDFs, pouco confiável; o modelo escreve exemplos no estilo em vez disso.)*
- ✅ **Paridade mobile** (jun/2026): `components/academic/MeusConcursosView.tsx` (3ª aba no `ArenaTab`) — CRUD do card, multi-biblioteca + **upload via `react-native-document-picker`** (→ biblioteca de apoio), gerar (poll 3s) + abrir no **`MaterialQuizMode`** (fazer/corrigir, já existia), **dossiê** (pesquisar/revisar/editar/confirmar via `MarkdownRenderer`). API em `services/academic.ts` (tipada); i18n `mc*` (56 chaves) em pt/en/es; `ChallengeSection` escondida na aba. Validado: `tsc --noEmit` do pacote mobile = **0 erros** + JSON dos locales. ⚠️ Mobile chega ao usuário por **build do app** (Play/TestFlight/OTA), não pelo deploy web.
