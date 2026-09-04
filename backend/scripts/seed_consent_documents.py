# qython/backend/scripts/seed_consent_documents.py
"""
Idempotent seeder for ConsentDocument records (LGPD).

Publishes v1 of all 8 consent document types:
    - terms_of_use, privacy_policy  (no expiry)
    - ml_training_general, ml_training_specialty, ml_training_image,
      ml_training_voice, ml_training_feedback, ml_research_publication
      (365 day TTL)

Locale: pt-BR. Other locales can be added via re-running with different
content or by editing this file and re-running.

Idempotent: if a document with the same (type, version='v1', locale='pt-BR')
already exists, it's left alone. To force a new version, bump VERSION.

Usage:
    python3 backend/scripts/seed_consent_documents.py
"""

import asyncio
import logging
import os
import sys

# Add project root to path
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, project_root)

from sqlalchemy import select
from backend.database import AsyncSessionLocal
from backend.models import ConsentDocument, ConsentDocumentType
from backend.services import consent_service

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


VERSION = "v2"
# Per-document version overrides (when a single document is revised without
# bumping all of them). The seeder is idempotent, so re-running publishes only
# the documents whose (type, version) isn't already present.
DOC_VERSION_OVERRIDES = {
    # v3: generalized subprocessor disclosure; v4: dropped RUT + Latreo;
    # v5: data residency generalized (Chile -> América do Sul)
    "privacy_policy": "v5",
    "terms_of_use": "v3",  # dropped RUT from controller identification
}
LOCALE = "pt-BR"
ML_TTL_DAYS = 365


# ============================================================
# Document bodies — v2 (2026-05-28)
# ============================================================

TERMS_OF_USE_BODY = """\
TERMOS DE USO DO QYTHON
Versão 3.0 · 28 de maio de 2026

Estes Termos regem o uso da plataforma Qython, operada por Olympos Group
SAS (Uruguai). Ao criar uma conta, você declara que leu,
entendeu e concorda integralmente com este documento e com a Política de
Privacidade. Se discordar de qualquer cláusula, não use o serviço.

1. ELEGIBILIDADE
O Qython destina-se exclusivamente a profissionais de saúde, residentes,
estudantes da área e instituições que prestem suporte a esses públicos. É
necessário ter capacidade civil plena. Cadastros falsos ou de menores
desacompanhados podem ser suspensos a qualquer tempo.

2. NATUREZA DO SERVIÇO E LIMITES CLÍNICOS
O Qython é uma ferramenta de apoio à decisão clínica baseada em
inteligência artificial. NÃO é um dispositivo médico regulamentado nem
substitui o juízo profissional. Toda hipótese diagnóstica, prescrição,
interpretação de exame ou recomendação gerada pela plataforma deve ser
validada criticamente pelo profissional antes de qualquer uso clínico. A
responsabilidade pela conduta junto ao paciente é integralmente do
profissional, conforme as resoluções do CFM e legislação aplicável.

3. CONTA E SEGURANÇA
Você é responsável pela veracidade dos dados cadastrais, pela guarda das
credenciais e pela utilização que terceiros venham a fazer da conta. Não
compartilhe credenciais. Notifique-nos imediatamente em caso de uso
indevido pelo e-mail do Encarregado.

4. USO ACEITÁVEL
É proibido: (a) usar a plataforma para fins ilegais ou contrários à
deontologia médica; (b) tentar acessar dados de terceiros; (c) realizar
engenharia reversa, scraping em massa ou contornar limites de uso; (d)
inserir conteúdo ofensivo, fraudulento, discriminatório ou que viole
direitos de terceiros; (e) explorar a plataforma para gerar conteúdo
malicioso ou para enganar pacientes.

5. CONTEÚDO DO USUÁRIO E PROPRIEDADE INTELECTUAL
Você mantém integralmente os direitos sobre os dados clínicos, anotações,
materiais acadêmicos e demais conteúdos que registra. O Qython recebe
apenas a licença, restrita e revogável, necessária para operar o serviço
(armazenar, processar, exibir, fazer backup). As marcas, código e
identidade visual do Qython permanecem de propriedade da Olympos Group SAS.

6. TRATAMENTO DE DADOS E INTELIGÊNCIA ARTIFICIAL
6.1. Dados de pacientes que você registra são tratados com base na tutela
da saúde por profissional (LGPD, Art. 11 §2º, II, f). Esses dados são
encriptados em repouso e auditados a cada acesso.
6.2. Antes de qualquer chamada a modelos externos (Google Gemini,
Anthropic Claude, OpenAI), dados pessoais identificáveis são
automaticamente redigidos por nossa infraestrutura. A lista completa de
sub-operadores está em https://qython.ai/subprocessors.
6.3. O uso de dados para treinar e aprimorar os modelos do Qython é
ESTRITAMENTE OPCIONAL. O default é desligado. Você pode conceder ou
revogar a qualquer momento, por finalidade, em Configurações →
Privacidade. Dados de pacientes, mesmo quando você opta por contribuir
com treinamento, passam sempre por anonimização irreversível (LGPD,
Art. 12).

7. PLANOS, ASSINATURA E PAGAMENTOS
A maior parte das funcionalidades é coberta por planos com mensalidade ou
pelo consumo de "dracmas" (créditos internos). Renovação, cancelamento e
política de reembolso são apresentados no momento da contratação. Atrasos
ou disputas podem resultar em suspensão temporária do acesso pago.

8. SUSPENSÃO E ENCERRAMENTO
Podemos suspender ou encerrar contas que violem estes Termos, mediante
aviso prévio quando possível. Você pode encerrar sua conta a qualquer
momento em Configurações → Privacidade. O encerramento desencadeia a
exclusão dos seus dados pessoais conforme a Política de Privacidade;
dados já anonimizados podem ser mantidos.

9. LIMITAÇÃO DE RESPONSABILIDADE
Na máxima extensão permitida pela legislação aplicável, a Olympos Group
SAS não responde por (a) decisões clínicas tomadas pelo profissional, (b)
indisponibilidades temporárias do serviço, (c) perda de dados decorrente
de uso indevido, ou (d) danos indiretos ou lucros cessantes.

10. ALTERAÇÕES
Mudanças relevantes serão comunicadas com antecedência razoável (mínimo
de 7 dias quando viável). O uso continuado após a vigência presume
aceite; mudanças que ampliem materialmente o tratamento de dados exigem
novo consentimento expresso.

11. JURISDIÇÃO E LEI APLICÁVEL
Estes Termos regem-se pela legislação brasileira para usuários situados
no Brasil. Para usuários em outros países da América Latina ou Europa,
aplica-se supletivamente a legislação uruguaia (sede da Olympos Group SAS).
Fica eleito o foro da cidade do usuário titular ou, na sua ausência, o
foro central de Montevidéu, salvo regras especiais de proteção ao
consumidor.

12. CONTATO
Olympos Group SAS — Encarregado: Leonardo Abreu Santos — dpo@qython.ai
https://qython.ai/encarregado

Versão integral em hipertexto: https://qython.ai/terms-of-use
"""

PRIVACY_POLICY_BODY = """\
POLÍTICA DE PRIVACIDADE DO QYTHON
Versão 5.0 · 28 de maio de 2026

Esta Política descreve como o Qython, operado por Olympos Group SAS
(Uruguai), trata dados pessoais em conformidade com a
Lei Geral de Proteção de Dados Pessoais brasileira (Lei 13.709/2018 —
LGPD) e demais legislações aplicáveis (GDPR, Delaware DPDPA, etc.).

1. QUEM SOMOS
Controlador dos dados: Olympos Group SAS, organização operadora do
Qython. Encarregado pelo Tratamento de Dados
(DPO): Leonardo Abreu Santos — dpo@qython.ai.

2. CATEGORIAS DE DADOS TRATADOS
2.1. Dados cadastrais: nome completo, e-mail, telefone, documento (CPF
ou equivalente), ocupação, especialidade, instituição de ensino, foto de
perfil.
2.2. Dados de verificação profissional: CRM/UF, comprovantes de vínculo,
metadados de validação.
2.3. Dados clínicos: anotações de consulta, prontuários de pacientes que
você cadastra, prescrições, exames, materiais acadêmicos gerados.
2.4. Dados de uso: histórico de interações com o copiloto, telemetria
operacional, logs de auditoria, métricas de engajamento.
2.5. Dados financeiros: limitados aos necessários para faturamento.
Dados de cartão NÃO são armazenados em nossos servidores — são
processados diretamente pelo Stripe.

3. BASES LEGAIS
3.1. Execução de contrato (Art. 7, V) — operação do serviço, manutenção
da conta, comunicações operacionais.
3.2. Cumprimento de obrigação legal (Art. 7, II) — armazenamento de
prontuários e logs conforme exigência do CFM e legislação tributária.
3.3. Tutela da saúde por profissional (Art. 11, §2º, II, f) — dados
clínicos de pacientes registrados pelo médico-usuário no exercício da
profissão.
3.4. Consentimento específico (Art. 11, I) — uso de dados em treinamento
de modelos de IA. É opt-in granular (6 finalidades distintas), default
desligado, com validade de 12 meses e revogável a qualquer momento.
3.5. Anonimização (Art. 12) — dados clínicos de pacientes utilizados em
treinamento sempre passam por anonimização irreversível, deixando o
escopo da LGPD.
3.6. Legítimo interesse (Art. 7, IX) — segurança da plataforma, prevenção
a fraudes, telemetria mínima de funcionamento.

4. FINALIDADES
Operação do serviço, geração de assistência clínica baseada em IA,
verificação de identidade profissional, processamento de pagamentos,
comunicações transacionais, segurança, atendimento a obrigações legais e
melhoria contínua da plataforma (esta última, apenas com consentimento
específico).

5. COMPARTILHAMENTO COM TERCEIROS
Compartilhamos dados estritamente necessários com sub-operadores
(processors), descritos por categoria funcional e jurisdição em
https://qython.ai/subprocessors — incluindo provedores de modelos de IA,
infraestrutura de hospedagem, processamento de pagamentos, autenticação e
verificação de identidade profissional. Cada sub-operador é regido por
contrato de processamento de dados (DPA). A identificação nominal de cada
sub-operador está disponível ao titular mediante solicitação ao
Encarregado, conforme o Art. 18, VII da LGPD.

Antes de qualquer envio a provedores externos de IA, dados pessoais
identificáveis são automaticamente redigidos por nossa infraestrutura
local (Presidio + recognizers próprios). Dados clínicos brutos NUNCA são
enviados a terceiros sem essa redação.

6. TRANSFERÊNCIA INTERNACIONAL
A infraestrutura primária do Qython está hospedada na América do Sul.
Eventuais transferências internacionais (por uso de sub-operadores fora
da região) ocorrem com base em cláusulas contratuais padrão ou outras
salvaguardas previstas no Art. 33 da LGPD.

7. RETENÇÃO
7.1. Dados cadastrais e clínicos ativos: mantidos enquanto a conta
estiver ativa.
7.2. Após encerramento de conta: dados pessoais excluídos imediatamente
(soft delete + cascata em até 24 horas). Dados anonimizados podem ser
preservados conforme Art. 12 da LGPD.
7.3. Logs de auditoria: até 10 anos (prazo prescricional civil) ou pelo
prazo legal aplicável, o que for maior.
7.4. Dados de pagamento: pelo prazo exigido pela legislação fiscal.

8. SEUS DIREITOS (LGPD, Art. 18)
Em Configurações → Privacidade você pode exercer diretamente:
   - Confirmar e acessar seus dados
   - Corrigir dados incompletos ou desatualizados
   - Exportar seus dados em formato portável (ZIP/JSON)
   - Excluir sua conta com cascata sobre dados pessoais
   - Conceder ou revogar consentimentos granulares de IA
   - Consultar o histórico de operações sobre seus dados

Solicitações fora desses fluxos podem ser feitas pelo e-mail do
Encarregado, com prazo legal de resposta de 15 dias.

9. SEGURANÇA
TLS 1.3 em todas as conexões; criptografia simétrica (Fernet) em repouso
para colunas com dados pessoais e clínicos sensíveis; trigger Postgres
append-only no audit log; controles de acesso por papel; backups
criptografados.

10. CRIANÇAS E ADOLESCENTES
O Qython não é destinado a menores de 18 anos. Dados de pacientes
crianças/adolescentes registrados por profissionais são tratados sob a
tutela da saúde (Art. 11) e com cuidado especial de minimização.

11. COOKIES E TECNOLOGIAS SIMILARES
Utilizamos cookies essenciais para autenticação e operação. Cookies
analíticos opcionais podem ser ativados/desativados nas configurações do
navegador.

12. ATUALIZAÇÕES DESTA POLÍTICA
Mudanças significativas são comunicadas por e-mail com antecedência
razoável. O histórico de versões fica disponível mediante solicitação ao
Encarregado.

Versão integral em hipertexto: https://qython.ai/privacy-policy
"""

ML_INTRO = """\
Este consentimento é específico e destacado (LGPD Art. 11, §1º) e
permite que dados gerados pela sua interação com o Qython sejam usados
para treinar e aprimorar os modelos de inteligência artificial da
plataforma. Trata-se de tratamento ADICIONAL ao operacional — você pode
usar o Qython normalmente mesmo recusando todos os escopos abaixo.

Características gerais:
  • Default: desligado. Coletamos somente se você marcar a opção.
  • Validade: 12 meses a partir da concessão. Após esse prazo é necessário
    renovar.
  • Revogação: a qualquer momento, em Configurações → Privacidade. Após a
    revogação, entradas ainda não incorporadas a versões já publicadas dos
    modelos são removidas do pool de treinamento; reentrar a treinos
    retroativos é tecnicamente impossível, mas a ANPD admite essa
    limitação desde que devidamente documentada.
  • Redação automática: antes de qualquer entrada virar dado de treino,
    nossa infraestrutura local (sem envio a terceiros) redige
    identificadores diretos (nome, CPF, telefone, e-mail).
  • Dados de pacientes (qualquer informação que identifique paciente nos
    seus registros): passam SEMPRE por anonimização irreversível antes do
    uso em treinamento, independentemente deste consentimento (Art. 12).
  • Auditoria: cada export para treinamento é registrado em log imutável
    com hash do conjunto de dados e snapshot dos consentimentos ativos
    naquele momento, conforme Art. 37 e Art. 18, VII da LGPD.
"""

ML_DOCUMENTS = {
    ConsentDocumentType.ml_training_general: (
        "Treinamento do copiloto clínico geral",
        ML_INTRO + """
Escopo deste consentimento
Cobre o uso das suas conversas com o copiloto, anotações de consulta
(raw e melhoradas), sumários e geração de orientações para treinar o
modelo geral do Qython.

O que NÃO está coberto
Imagens médicas (escopo separado), áudio/transcrição (escopo separado),
feedback (escopo separado), pesquisa acadêmica publicada (escopo
separado). Cada categoria exige consentimento independente.
""",
    ),
    ConsentDocumentType.ml_training_specialty: (
        "Treinamento de modelos por especialidade",
        ML_INTRO + """
Escopo deste consentimento
Permite que seus dados (com PII redigida) ajudem a treinar modelos
especializados na sua área (cardiologia, pediatria, psiquiatria, etc.).
Útil para que o copiloto se torne mais preciso no contexto da prática
específica da sua especialidade.

Garantias adicionais
Não usamos sua especialidade declarada como rótulo direto de
identificação. Especialidades raras são generalizadas antes do treino
(ex.: "outras") para evitar reidentificação por contexto.
""",
    ),
    ConsentDocumentType.ml_training_image: (
        "Treinamento de modelos de imagem médica",
        ML_INTRO + """
Escopo deste consentimento
Imagens médicas anexadas ao Qython (raio-X, eletrocardiogramas, fotos
de exame físico, etc.).

Garantias adicionais
Identificadores visuais do paciente (rostos, etiquetas com nome, números
de prontuário em canto de exame) são removidos automaticamente antes do
uso em treinamento. Quando essa remoção não puder ser feita com alta
confiança, a imagem é descartada do pool de treino.
""",
    ),
    ConsentDocumentType.ml_training_voice: (
        "Treinamento de modelos de transcrição",
        ML_INTRO + """
Escopo deste consentimento
Áudios de consulta gravados na plataforma, juntamente com transcrições
correspondentes, para treinar modelos de transcrição automática.

Garantias adicionais
Antes do uso em treinamento, áudios passam por filtragem de menções
diretas a nome, documento, endereço e qualquer outro identificador que
apareça na fala. Trechos que não puderem ser higienizados com confiança
são suprimidos do pool de treino.
""",
    ),
    ConsentDocumentType.ml_training_feedback: (
        "Uso de feedback para alinhamento (DPO/RLHF)",
        ML_INTRO + """
Escopo deste consentimento
Seus likes/dislikes nas respostas do copiloto, padrões de edição (quando
você modifica uma resposta gerada) e regenerações são utilizados para
construir pares de preferência usados em técnicas modernas de
fine-tuning baseadas em preferência (DPO, RLHF, KTO).

O que isso significa na prática
Permite que o copiloto fique mais alinhado com a sua prática clínica e
com o estilo de comunicação que você prefere. Esse é o tipo de dado mais
diretamente útil para melhorar a qualidade do produto.

Garantias adicionais
Os pares chegam ao pipeline já filtrados por PII e somente com o
contexto necessário (a pergunta original e as duas respostas). Histórico
clínico do paciente não é incluído.
""",
    ),
    ConsentDocumentType.ml_research_publication: (
        "Pesquisa acadêmica anônima publicada",
        ML_INTRO + """
Escopo deste consentimento
Uso de dados clínicos ANONIMIZADOS de forma irreversível em pesquisa
acadêmica publicada — artigos científicos, dissertações, relatórios
técnicos, posters em congressos.

Garantias adicionais
Qualquer publicação decorrente segue princípios éticos de pesquisa em
saúde: anonimização irreversível, agregação estatística, ausência de
identificação individual, K-anonimato mínimo de 5. Resultados são
publicados em formato agregado, sem dados originais associados a você
ou aos seus pacientes.

Distinção importante
Este escopo cobre apenas o uso para PUBLICAÇÃO acadêmica externa. O uso
interno para treinar nossos próprios modelos exige os outros escopos
("treinamento do copiloto", "treinamento por especialidade", etc.).
""",
    ),
}


# ============================================================
# Seeder
# ============================================================

async def document_exists(session, type_, version, locale):
    stmt = (
        select(ConsentDocument)
        .where(
            ConsentDocument.type == type_,
            ConsentDocument.version == version,
            ConsentDocument.locale == locale,
        )
        .limit(1)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def seed():
    plan = [
        # (type, title, body, ttl_days)
        (ConsentDocumentType.terms_of_use,
         "Termos de Uso do Qython",
         TERMS_OF_USE_BODY,
         None),
        (ConsentDocumentType.privacy_policy,
         "Política de Privacidade do Qython",
         PRIVACY_POLICY_BODY,
         None),
    ]
    for type_, (title, body) in ML_DOCUMENTS.items():
        plan.append((type_, title, body, ML_TTL_DAYS))

    created = 0
    skipped = 0

    async with AsyncSessionLocal() as session:
        try:
            for type_, title, body, ttl_days in plan:
                version = DOC_VERSION_OVERRIDES.get(type_.value, VERSION)
                existing = await document_exists(session, type_, version, LOCALE)
                if existing is not None:
                    logger.info("SKIP: %s@%s (%s) already present (id=%s)",
                                type_.value, version, LOCALE, existing.id)
                    skipped += 1
                    continue

                doc = await consent_service.publish_document(
                    session,
                    consent_type=type_,
                    version=version,
                    title=title,
                    body=body,
                    locale=LOCALE,
                    default_ttl_days=ttl_days,
                    deactivate_previous=True,
                )
                logger.info("CREATED: %s@%s (id=%s, hash=%s...)",
                            type_.value, version, doc.id, doc.content_hash[:8])
                created += 1

            await session.commit()
            logger.info("Done. created=%d skipped=%d", created, skipped)
        except Exception as exc:
            await session.rollback()
            logger.error("Seed failed: %s", exc, exc_info=True)
            raise


if __name__ == "__main__":
    asyncio.run(seed())
