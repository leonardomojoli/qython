# Responsáveis por área

Cada área do Qython tem alguém que revisa as mudanças nela e responde por ela. A decisão final sobre
o que entra no projeto é do mantenedor principal. Se você quer cuidar de uma área, veja o fim deste arquivo.

**Mantenedor principal:** @leonardomojoli

| Área | Onde fica | Responsável |
|---|---|---|
| Backend e API | `backend/` | @leonardomojoli |
| App web (telas) | `packages/web/` | @leonardomojoli |
| App desktop (Windows, macOS, Linux) | `packages/desktop/` | @leonardomojoli |
| App Android e pareamento com o computador | `packages/mobile/`, `docs/PAREAMENTO.md` | @leonardomojoli |
| IA local, busca da biblioteca, OCR e transcrição | `backend/services/llm_*`, `backend/embed_onnx.py`, `backend/whisper_server.py` | @leonardomojoli |
| Servidor com Docker | `Dockerfile`, `docker-compose.yml` | @leonardomojoli |
| **Conteúdo clínico** (medicamentos, interações, CID-10, textos de orientação) | `backend/seeds/`, `backend/data/` | *vaga: pessoa com formação médica* |
| Documentação | `docs/`, `README.md` | @leonardomojoli |
| CI e releases | `.github/` | @leonardomojoli |

## Como alguém vira responsável por uma área

Não há formulário. Quem contribui com regularidade, com mudanças que entram quase sem ajuste, passa a
revisar as mudanças dos outros naquela área; depois de um tempo, o mantenedor principal o nomeia
responsável e acrescenta o nome aqui. A confiança vem do histórico: PRs bons, revisões úteis, cuidado
com o que não pode quebrar.

A área de **conteúdo clínico** é a que mais precisa de gente de fora: doses, interações e condutas só
devem ser aprovadas por quem tem formação para isso, sempre com a fonte citada.
