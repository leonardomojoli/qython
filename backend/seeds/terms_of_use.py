"""Termo de uso da edição local, aceito no primeiro acesso.

O termo do SaaS (backend/scripts/seed_consent_documents.py) descrevia um serviço:
a empresa como controladora dos dados, servidores, planos. Na instalação local não
há serviço nenhum; quem instala opera o software e responde pelo uso. Este texto diz
isso e é publicado como um ConsentDocument, então o aceite fica gravado em
user_consents com a versão e o hash do texto exato que a pessoa leu.

Publicar uma versão nova desativa a anterior, e quem aceitou a antiga volta a ver o
termo no próximo acesso. Para mudar o texto, mude também TERMS_VERSION.
"""
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import Config
from ..models import ConsentDocument, ConsentDocumentType
from ..services import consent_service

logger = logging.getLogger("qython_logger")

TERMS_VERSION = "local-v1"
TERMS_LOCALE = "pt-BR"
TERMS_TITLE = "Termo de Uso do Qython"
TERMS_BODY = """\
TERMO DE USO DO QYTHON
Versão local-v1 · 25 de outubro de 2026

Leia com atenção. Para usar o Qython você precisa concordar com este termo.

1. O que é o Qython
O Qython é um software livre de apoio ao estudo e à documentação clínica. Ele roda
no computador ou no servidor onde foi instalado, operado por você ou pela sua
instituição. Não é um serviço: os autores do projeto não hospedam os seus dados e
não têm acesso à sua instalação.

2. O Qython não é um dispositivo médico
O Qython não foi avaliado nem registrado pela ANVISA, pela FDA ou por qualquer
outra autoridade sanitária. Ele não diagnostica, não prescreve e não substitui o
julgamento clínico. Nenhuma decisão sobre um paciente deve se basear apenas no que
ele mostra.

3. A inteligência artificial erra
Respostas do copiloto, resumos de consulta, códigos CID, sugestões de prescrição,
materiais de estudo e questões são gerados por modelos de linguagem e podem conter
erros, inclusive erros plausíveis e afirmados com segurança. Confira cada
informação clínica em fontes primárias antes de usá-la. Receitas, atestados e
pedidos de exame só valem depois que você os revisa e assina, e o conteúdo deles é
seu.

4. Sua responsabilidade
O uso do Qython na prática clínica é de responsabilidade do profissional que o
usa, dentro das normas do seu conselho profissional. Isso inclui o que você
registra, o que decide e o que entrega ao paciente.

5. Seus dados e os dos seus pacientes
Os dados ficam no banco de dados desta instalação. Você, ou a instituição que
opera o Qython, é o controlador desses dados nos termos da LGPD (Lei 13.709/2018):
cabe a você ter base legal para tratá-los, proteger o acesso ao computador, manter
cópias de segurança e atender os pedidos dos titulares.

Nada sai da máquina por padrão. Dados saem apenas para os serviços externos que
você mesmo configurar, e ficam sujeitos aos termos de cada um:
  - com uma chave de API de inteligência artificial (por exemplo, Google Gemini),
    o texto da pergunta, da consulta ou do documento processado é enviado ao
    provedor escolhido;
  - buscas em bases públicas, como o PubMed, enviam os termos da busca;
  - transcrição de áudio por serviço externo (por exemplo, Groq), cópia de
    documentos no Google Drive e verificação profissional pelo Lastreo, quando
    configuradas, enviam o que cada recurso precisa.
Antes de ligar um serviço externo, avalie se o envio é compatível com as suas
obrigações de sigilo e de proteção de dados.

6. Software livre, sem garantia
O Qython é distribuído sob a licença GNU Affero General Public License, versão 3
(AGPL-3.0). Ele é fornecido "no estado em que se encontra", sem garantia de
qualquer tipo, expressa ou implícita, inclusive de funcionamento, de adequação a
uma finalidade ou de ausência de erros. Na extensão permitida pela lei, os autores
e colaboradores não respondem por danos decorrentes do uso ou da impossibilidade
de uso do software.

Quem modifica o Qython responde pela versão modificada. A licença cobre o código,
não o nome: versões modificadas não podem se apresentar como Qython.

7. Mudanças neste termo
Se o termo mudar, a nova versão será mostrada no seu próximo acesso, e o uso
continua depois de um novo aceite.
"""


async def seed_terms_of_use(db: AsyncSession) -> bool:
    """Publica o termo da edição local se esta versão ainda não existe.
    Retorna True quando publicou."""
    if Config.EDITION != "local":
        return False
    exists = await db.scalar(
        select(ConsentDocument.id).where(
            ConsentDocument.type == ConsentDocumentType.terms_of_use,
            ConsentDocument.version == TERMS_VERSION,
            ConsentDocument.locale == TERMS_LOCALE,
        )
    )
    if exists:
        return False
    await consent_service.publish_document(
        db,
        consent_type=ConsentDocumentType.terms_of_use,
        version=TERMS_VERSION,
        title=TERMS_TITLE,
        body=TERMS_BODY,
        locale=TERMS_LOCALE,
    )
    await db.commit()
    return True
