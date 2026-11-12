# Como contribuir com o Qython

O Qython é software livre ([AGPL-3.0-only](LICENSE)) para médicos e instituições de saúde no Brasil.
Contribuições são bem-vindas: código, correções, testes, documentação, traduções e, principalmente,
**relatos de uso real**, que dizem mais sobre o que falta do que qualquer lista nossa.

## Antes de começar

- **Problemas e ideias** vão para as [issues](https://github.com/leonardomojoli/qython/issues/new/choose).
  Procure antes se já existe uma.
- **Dúvida de uso**: veja [`docs/SETUP.md`](docs/SETUP.md); se não resolver, abra uma issue.
- **Vulnerabilidade de segurança**: não abra issue pública. Veja [`SECURITY.md`](SECURITY.md).
- **Nunca coloque dados de pacientes** (nome, CPF, exames, prints do app com dados reais) em issue, PR ou
  log. Tudo aqui é público. Se um log tiver dados reais, apague antes de colar.

## Como funciona

O projeto tem um mantenedor principal, que decide o que entra e o que fica de fora, e outras pessoas
que contribuem. A regra é a de projetos como o kernel do Linux: **mudança pequena, bem explicada e
testada entra rápido; mudança grande e sem conversa prévia não**. Por isso:

1. Para algo maior que uma correção pontual, **abra uma issue primeiro** e descreva o que quer fazer.
   Assim ninguém gasta uma semana numa direção que o projeto não vai seguir.
2. Faça um fork, crie uma branch e abra um **pull request** pequeno e focado (um assunto por PR).
3. Descreva o **porquê**, não só o quê. Se corrige um defeito, diga como reproduzir.
4. Inclua **testes** quando houver lógica nova ou defeito corrigido (veja abaixo como rodar).
5. O PR só é mesclado com os checks do CI verdes e depois de uma revisão. Revisão não é crítica à pessoa:
   é como o código melhora.

## Como o projeto é conduzido

O modelo é o do kernel do Linux, em escala pequena:

- Existe **um mantenedor principal**, que decide o que entra. Cada área tem um responsável que revisa as
  mudanças dela ([`MAINTAINERS.md`](MAINTAINERS.md)); com o tempo, o mantenedor principal confia mais nas
  revisões deles e lê menos linhas.
- **Tudo acontece em público**: discussão, revisão e decisão ficam nas issues e nos pull requests.
- **A `main` está sempre funcionando.** Só entra mudança com os checks do CI verdes; se algo quebrar, o
  conserto vem antes de qualquer novidade.
- **Não se quebra quem já usa.** O que mais pesa aqui é o dado dos pacientes: mudança que mexe no banco
  (migrations), nos backups, no pareamento ou nas chaves de criptografia precisa de teste, e nunca pode
  deixar uma instalação existente sem conseguir abrir os seus dados.
- As **versões** saem quando um conjunto de mudanças está pronto e testado, com notas do que mudou. Só a
  versão mais recente recebe correções.
- Todo commit leva `Signed-off-by` (`git commit -s`): é o [DCO](https://developercertificate.org/), e o CI
  confere.

## Conteúdo clínico exige fonte

Doses, interações, condutas, CID-10, tabelas e textos de orientação ao paciente são o que mais pesa num
software médico. Qualquer PR que **mude conteúdo clínico** precisa:

- citar a fonte (bula da ANVISA, diretriz do Ministério da Saúde ou de sociedade brasileira, artigo
  revisado por pares) com link ou referência exata;
- priorizar a **diretriz nacional** sobre a internacional quando divergirem (o Qython é feito para o Brasil);
- dizer o que mudou em relação ao que havia, em uma frase.

Sem fonte, o PR volta com um pedido de fonte, por melhor que seja a intenção.

## Código

- Backend: Python 3.12, FastAPI, PostgreSQL. Testes em `tests/backend/` (`python tests/backend/<teste>.py`).
- Web: React + Vite (`packages/web`). Desktop: Electron (`packages/desktop`, `npm test`). Celular: React Native
  (`packages/mobile`, `npm test`).
- A IA roda **só localmente**; não adicione chamadas a serviços de nuvem nem telemetria. O que o médico escreve
  não sai da máquina dele.
- Mensagens de commit em português, no imperativo curto, com o motivo no corpo.
- Não versione segredos, chaves nem dados reais.

## Licença e origem da contribuição

Ao contribuir, você declara que tem o direito de enviar o código e concorda que ele seja distribuído sob a
**AGPL-3.0-only**, a licença do projeto. Usamos o [Developer Certificate of Origin](https://developercertificate.org/):
assine seus commits com `git commit -s` (isso acrescenta a linha `Signed-off-by: Seu Nome <email>`).

## Código de conduta

Seja respeitoso. Discuta o código e as ideias, não as pessoas. Quem for abusivo ou desrespeitoso é
afastado do projeto, sem aviso prévio se necessário.
