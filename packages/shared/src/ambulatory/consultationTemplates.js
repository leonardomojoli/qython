// frontend/src/data/consultationTemplates.js
// Templates de consulta (primeira consulta e retorno) por especialidade

export const ANAMNESE_DATA = {
  "Ginecologia e Obstetrícia": {
    first: `## Identificação
**Nome:** | **Idade:** | **DUM:**

## Queixa Principal
> 

## História da Doença Atual
**Início:** | **Evolução:**
**Sintomas:** 
**Fatores de piora/alívio:**

## Antecedentes
- **G_P_A_** | Menarca: | Sexarca:
- **Método contraceptivo:**
- **Cirurgias ginec:**
- **Alergias:**
- **Medicações:**
- **Comorbidades:**

## Exame Físico
**PA:** | **FC:** | **Peso:** | **Alt:** | **IMC:**
**Mamas:**
**Abdome:**
**Especular:**
**Toque vaginal:**

## Hipótese Diagnóstica


## Conduta
- **Exames:**
- **Tratamento:**
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Evolução desde última consulta:**
**Adesão ao tratamento:**
**Novas queixas:**

## O - Objetivo
**PA:** | **FC:** | **Peso:** | **Alt:** | **IMC:**
**Exames trazidos:**
**Exame físico:**

## A - Avaliação
**Diagnóstico evolutivo:**

## P - Plano
- **Medicações:**
- **Orientações:**
- **Retorno:**
`,
  },

  "Mastologia": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:**

## Queixa Principal
>

## História da Doença Atual
**Nódulo/Massa:** Localização (mama D/E, quadrante): | Tamanho: | Tempo de evolução: | Crescimento:
**Dor (mastalgia):** Cíclica ( ) Acíclica ( ) | Relação com o ciclo:
**Descarga papilar:** Espontânea ( ) À expressão ( ) | Cor: | Uni/multiductal:
**Alterações de pele/papila:** Retração ( ) Eczema ( ) Edema/"casca de laranja" ( )

## Antecedentes
- **G_P_A_** | Menarca: | Menopausa: | TRH:
- **Amamentação:** | **ACO:**
- **Mamografia/USG prévios:** Data: | BI-RADS:
- **CA de mama pessoal:** | **Biópsias prévias:**
- **HF de CA mama/ovário:** Parente: | Idade ao dx: | Mutação (BRCA):
- **Medicações:** | **Alergias:**

## Exame Físico
**Inspeção (estática/dinâmica):** Simetria | Retração | Abaulamento | Pele
**Palpação das mamas:** Nódulo (local/tamanho/consistência/mobilidade):
**Descarga à expressão:**
**Linfonodos:** Axilares: | Supra/infraclaviculares:

## Exames Trazidos
**Mamografia (BI-RADS):**
**USG mamária:**
**Core biopsy/PAAF:**

## Hipótese Diagnóstica

## Conduta
- **Exames:** (Mamografia / USG / RM / core biopsy)
- **BI-RADS e conduta:**
- **Encaminhamento / seguimento:**
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Evolução desde a última consulta:**
**Resultados de exames/biópsia:**
**Novas queixas:**

## O - Objetivo
**Exame físico das mamas e cadeias linfonodais:**
**Exames trazidos:**

## A - Avaliação
**Diagnóstico / BI-RADS:**

## P - Plano
- **Conduta (seguimento / biópsia / encaminhamento oncológico):**
- **Orientações:**
- **Retorno:**
`,
  },

  "Medicina de Emergência": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:** | **Hora de chegada:**

## Queixa Principal
>

## Classificação de Risco
**Manchester:** Vermelho ( ) Laranja ( ) Amarelo ( ) Verde ( ) Azul ( )
**Sinais de alarme:**

## História da Doença Atual
**Início:** Súbito ( ) Gradual ( ) | **Tempo de evolução:**
**Sintomas:**
**Fatores associados / desencadeantes:**

## Antecedentes
- **Comorbidades:** | **Cirurgias:**
- **Medicações em uso:** | **Alergias:**
- **Episódio semelhante prévio:**

## Exame Físico
**Sinais vitais:** PA: | FC: | FR: | Tax: | SatO2: | HGT: | Dor (0-10):
**Estado geral / Glasgow:**
**Avaliação ABCDE / exame dirigido:**

## Exames (trazidos / solicitados)
**Labs:** | **ECG:** | **Imagem:**

## Hipótese Diagnóstica

## Conduta
- **Medidas imediatas:**
- **Exames:**
- **Tratamento / medicações:**
- **Desfecho:** Alta ( ) Observação ( ) Internação ( ) Transferência ( )
`,
    return: `## S - Subjetivo
**Evolução desde a admissão:**
**Resposta ao tratamento:**
**Novas queixas:**

## O - Objetivo
**Sinais vitais:** PA: | FC: | FR: | Tax: | SatO2: | Dor (0-10):
**Exame físico:**
**Resultados de exames:**

## A - Avaliação
**Diagnóstico:**
**Estabilidade clínica:**

## P - Plano
- **Conduta:**
- **Desfecho:** Alta ( ) Mantém observação ( ) Internação ( )
- **Orientações de alta / retornar se:**
`,
  },

  "Cardiologia Pediátrica": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:** | **Peso:** | **Acompanhante:**

## Queixa Principal
>

## História da Doença Atual
**Cianose:** Repouso ( ) Esforço/choro ( ) | **Sopro:** Idade de detecção:
**Cansaço às mamadas / sudorese:** | **Ganho ponderal:**
**Dispneia / taquipneia:** | **Palpitações / síncope:**
**Infecções respiratórias de repetição:**

## Antecedentes
- **Gestação:** Pré-natal | Intercorrências | Medicações/álcool
- **Parto:** IG | Peso ao nascer | Apgar | Teste do coraçãozinho:
- **Síndromes genéticas / malformações:**
- **Cirurgias / cateterismos prévios:**
- **Medicações:** | **Alergias:**
- **HF:** Cardiopatia congênita | Morte súbita precoce:

## Exame Físico
**Sinais vitais:** PA (4 membros): | FC: | FR: | SatO2 (pré/pós-ductal): | Peso/Estatura (percentil):
**ACV:** Ritmo | B2 | Sopro (local/intensidade/irradiação) | Frêmito:
**Pulsos (incl. femorais):**
**AP / Fígado / Perfusão / Edema:**

## Exames Trazidos
**ECG:** | **Ecocardiograma:** | **RX tórax:**

## Hipótese Diagnóstica

## Conduta
- **Exames:**
- **Tratamento:**
- **Encaminhamento (cirurgia/hemodinâmica):**
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Evolução / sintomas:** | **Mamadas / ganho ponderal:**
**Adesão à medicação:**

## O - Objetivo
**Sinais vitais / SatO2 / percentis:**
**ACV / pulsos / exame físico:**
**Exames trazidos:**

## A - Avaliação
**Diagnóstico / status hemodinâmico:**

## P - Plano
- **Medicações:** | **Orientações:**
- **Próximo eco / seguimento:**
- **Retorno:**
`,
  },

  "Cirurgia do Aparelho Digestivo": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:**

## Queixa Principal
>

## História da Doença Atual
**Dor abdominal:** Localização: | Tipo: | Irradiação: | Relação com alimentação:
**Disfagia / odinofagia:** | **Pirose / regurgitação:**
**Náuseas / vômitos:** | **Hematêmese / melena:**
**Alteração do hábito intestinal:** | **Icterícia:**
**Perda de peso:** | **Massa abdominal:**

## Antecedentes
- **Cirurgias abdominais prévias:**
- **Comorbidades:** | **Etilismo / tabagismo:**
- **EDA / colono prévias:** Data | Achados:
- **Medicações (IBP, AINE, anticoagulante):** | **Alergias:**
- **HF de neoplasia digestiva:**

## Exame Físico
**Sinais vitais / IMC:**
**Abdome:** Inspeção | Cicatrizes/hérnias | Palpação (dor/massa/visceromegalia) | RHA | Sinais de irritação peritoneal:
**Toque retal (se indicado):**

## Exames Trazidos
**Labs:** | **EDA / Colono:** | **USG / TC / RM:**

## Hipótese Diagnóstica

## Conduta
- **Exames:**
- **Indicação cirúrgica / risco:**
- **Tratamento:**
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Evolução / sintomas:**
**Período pré/pós-operatório:**

## O - Objetivo
**Sinais vitais:**
**Abdome / ferida operatória:**
**Exames trazidos:**

## A - Avaliação
**Diagnóstico / estágio do tratamento:**

## P - Plano
- **Conduta:** | **Orientações:**
- **Retorno:**
`,
  },

  "Cirurgia Vascular": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:**

## Queixa Principal
>

## História da Doença Atual
**Claudicação:** Distância: | Localização (panturrilha/coxa/glúteo):
**Dor em repouso / ferida que não cicatriza:**
**Varizes / dor / peso:** | **Edema:** Uni/bilateral:
**Dor súbita / membro frio (isquemia aguda):**
**Sintomas carotídeos (AIT / amaurose):**

## Antecedentes
- **Fatores de risco:** Tabagismo ( ) DM ( ) HAS ( ) DLP ( )
- **DAOP / TVP / AVC prévios:** | **Revascularização / angioplastia:**
- **Medicações (antiagregante/anticoagulante/estatina):** | **Alergias:**

## Exame Físico
**PA (ambos os braços):** | **IMC:**
**Pulsos:** Carotídeo | Braquial | Radial | Femoral | Poplíteo | Tibial post. | Pedioso:
**Sopros (carotídeo / abdominal):**
**Membros:** Coloração | Temperatura | Enchimento capilar | Trofismo | Úlceras | Varizes:
**ITB (índice tornozelo-braquial):**

## Exames Trazidos
**Eco-Doppler:** | **Angio-TC / RM:** | **Labs:**

## Hipótese Diagnóstica

## Conduta
- **Exames:**
- **Tratamento clínico (fatores de risco / antiagregação):**
- **Indicação de intervenção:**
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Evolução dos sintomas (claudicação/dor/ferida):**
**Adesão (antiagregante/estatina/cessação tabágica):**

## O - Objetivo
**Pulsos / ITB / membros / feridas:**
**Exames trazidos:**

## A - Avaliação
**Diagnóstico / status vascular:**

## P - Plano
- **Conduta:** | **Orientações:**
- **Retorno:**
`,
  },

  "Coloproctologia": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:**

## Queixa Principal
>

## História da Doença Atual
**Sangramento anal:** Cor (vivo/escuro): | Relação com evacuação: | Quantidade:
**Dor anal:** Evacuatória ( ) Contínua ( ) | **Prurido anal:**
**Hábito intestinal:** Frequência: | Consistência (Bristol): | Esforço:
**Tenesmo / urgência / incontinência:** | **Prolapso / abaulamento:**
**Muco / pus:** | **Perda de peso:**

## Antecedentes
- **Colonoscopia prévia:** Data | Achados:
- **Comorbidades / DII:** | **Cirurgias anorretais:**
- **Medicações:** | **Alergias:**
- **HF de câncer colorretal / pólipos:**

## Exame Físico
**Abdome:**
**Inspeção anal:** Plicomas | Fissura | Fístula | Hemorroidas | Prolapso:
**Toque retal:** Tônus | Dor | Massa | Próstata (H): | Sangue/fezes na luva:
**Anuscopia (se disponível):**

## Exames Trazidos
**Colonoscopia / retossigmoidoscopia:** | **Labs (Hb, sangue oculto):**

## Hipótese Diagnóstica

## Conduta
- **Exames:** (Colonoscopia / anuscopia)
- **Tratamento:**
- **Indicação cirúrgica:**
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Evolução (sangramento/dor/hábito intestinal):**
**Resultado de exames/biópsia:**

## O - Objetivo
**Abdome / inspeção anal / toque retal:**
**Exames trazidos:**

## A - Avaliação
**Diagnóstico:**

## P - Plano
- **Conduta (clínica / cirúrgica / seguimento):**
- **Orientações:**
- **Retorno:**
`,
  },

  "Endoscopia": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:**

## Indicação do Exame
> (EDA / Colonoscopia / outro)

## História da Doença Atual
**Sintomas:** Dispepsia / pirose / disfagia / dor / sangramento / alteração do hábito intestinal:
**Tempo de evolução:** | **Perda de peso / anemia:**
**Exames prévios (motivo do encaminhamento):**

## Antecedentes / Preparo
- **Comorbidades (cardio/pneumo/DRC):** | **Cirurgias prévias:**
- **Medicações:** Anticoagulante/antiagregante ( ) — suspenso? | IBP | Insulina:
- **Alergias / reações à sedação:**
- **Jejum confirmado:** | **Preparo de cólon (se colono):** Qualidade:
- **Risco anestésico (ASA):** | **Via aérea:**

## Exame Físico
**Sinais vitais / SatO2 / IMC:**
**Cardiopulmonar / abdome:**

## Objetivo do Procedimento

## Conduta
- **Procedimento proposto:** | **Sedação:**
- **Consentimento informado:** ( )
- **Orientações pós-procedimento / retorno:**
`,
    return: `## S - Subjetivo
**Sintomas atuais / pós-procedimento:**

## O - Objetivo
**Sinais vitais:**
**Laudo endoscópico / biópsias:**

## A - Avaliação
**Diagnóstico:**

## P - Plano
- **Conduta conforme achados:**
- **Seguimento / novo exame:**
- **Retorno:**
`,
  },

  "Medicina Intensiva": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:** | **Leito/UTI:** | **Admissão (data/hora):**

## Motivo de Admissão
>

## História / Evolução até a UTI
**Diagnóstico de base:** | **Origem (PS/enfermaria/CC):**
**Eventos (PCR / IOT / choque):**

## Antecedentes
- **Comorbidades:** | **Medicações de uso:** | **Alergias:**
- **Diretivas / status de RCP:**

## Suportes em Uso
**VM:** Modo | FiO2 | PEEP | VC | (ou O2/cateter):
**Drogas vasoativas:** | **Sedação/analgesia (RASS):**
**Acessos:** PVC / PAI | **Diálise:**

## Exame Físico (ABCDE)
**Vitais:** PA(M): | FC: | FR: | Tax: | SatO2: | Diurese:
**Neuro (Glasgow/RASS/pupilas):** | **Cardiopulmonar:** | **Abdome:** | **Pele/perfusão:**

## Exames
**Gasometria / lactato:** | **Labs:** | **Imagem / culturas:**
**Escores:** SOFA: | APACHE II:

## Problemas Ativos / Hipóteses

## Conduta (por sistema)
- **Neuro / Resp / CV / Renal-metab / Infeccioso / Dig-nutrição / Hemato:**
- **Profilaxias (TEV, LAMG):** | **Metas do dia:**
`,
    return: `## Problemas Ativos (por sistema)


## S - Subjetivo / Eventos nas últimas 24h


## O - Objetivo
**Vitais / balanço hídrico / diurese:**
**Suportes (VM / DVA / sedação):**
**Exames (gaso/lactato/labs/culturas):** | **SOFA:**

## A - Avaliação
**Evolução por sistema:**

## P - Plano (metas do dia)
- **Neuro / Resp / CV / Renal / Infeccioso / Nutrição / Profilaxias:**
- **Desmame / metas / comunicação com a família:**
`,
  },

  "Oncologia Clínica": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:**

## Queixa Principal
>

## História Oncológica
**Diagnóstico:** Tumor primário | Histologia | Data do dx:
**Estadiamento (TNM / estágio):** | **Biomarcadores (RE/RP/HER2, EGFR, PD-L1...):**
**Tratamentos prévios:** Cirurgia | RT | QT/alvo/imuno (linhas e datas):
**Status atual:** Resposta / estável / progressão:

## Avaliação Funcional e Sintomas
**ECOG / Karnofsky:** | **Dor (0-10):** | **Perda de peso:**
**Toxicidades (náusea, mucosite, neuropatia, diarreia, neutropenia):**

## Antecedentes
- **Comorbidades:** | **Medicações:** | **Alergias:**
- **HF de neoplasia:**

## Exame Físico
**Sinais vitais / IMC / SC (m²):**
**Linfonodos / massa / sítios de doença:**
**Exame dirigido:**

## Exames Trazidos
**Labs (hemograma, função renal/hepática):** | **Imagem (TC/RM/PET):** | **Marcadores tumorais:**

## Avaliação / Conduta
- **Intenção (curativa / paliativa):**
- **Plano terapêutico (esquema / ciclo):** | **Pré-quimio (hemograma/função):**
- **Manejo de sintomas / suporte:**
- **Próximo ciclo / retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Toxicidades desde o último ciclo (CTCAE):**
**Dor / ECOG / ingesta:**

## O - Objetivo
**Sinais vitais / peso:**
**Exame físico / sítios de doença:**
**Labs (hemograma/função) / imagem:**

## A - Avaliação
**Resposta (RECIST) / tolerância:**

## P - Plano
- **Seguir / ajustar / suspender esquema:** | **Suporte (antiemético/G-CSF/analgesia):**
- **Próximo ciclo / reestadiamento:**
- **Retorno:**
`,
  },

  "Cirurgia Plástica": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:** | **Profissão:**

## Queixa Principal / Objetivo
> (estético / reconstrutor / pós-trauma / pós-bariátrica)

## História da Doença Atual
**Área de interesse / queixa:** | **Tempo / evolução:**
**Expectativas do paciente:**
**Lesão / ferida / sequela (se reconstrutor):** Local | Tamanho | Tempo:

## Antecedentes
- **Cirurgias prévias (estéticas/gerais):** | **Cicatrização (quelóide):**
- **Comorbidades (DM, HAS, coagulopatia):**
- **Tabagismo:** | **Anticoagulante / AAS / fitoterápicos:**
- **Medicações:** | **Alergias:**
- **IMC / variação de peso / gestações futuras:**

## Exame Físico
**Sinais vitais / IMC:**
**Avaliação da área:** Medidas | Simetria | Flacidez/excesso de pele | Trofismo | Cicatrizes:
**Pele / vascularização / sensibilidade:**
**Documentação fotográfica:** ( )

## Avaliação Pré-operatória
**Labs / risco cirúrgico (ASA):**

## Indicação / Conduta
- **Procedimento proposto / técnica:**
- **Riscos e consentimento:** ( )
- **Pré-operatório (cessar tabagismo/anticoagulante):**
- **Retorno / agendamento:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Evolução / dor / satisfação:**
**Pós-operatório (se aplicável):**

## O - Objetivo
**Ferida operatória / cicatriz / curativo / dreno:**
**Sinais de complicação (hematoma/infecção/necrose):**

## A - Avaliação
**Evolução cirúrgica:**

## P - Plano
- **Curativos / pontos / orientações:**
- **Retorno:**
`,
  },

  "Medicina da Família e Comunidade": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:** | **Ocupação:** | **Composição familiar:**

## Lista de Problemas / Motivos da Consulta
>

## História (abordagem centrada na pessoa)
**Doença atual:** Sintomas | Tempo | Evolução:
**Ideias, preocupações e expectativas (ICE):**
**Contexto biopsicossocial:** Trabalho | Moradia | Rede de apoio | Hábitos:

## Antecedentes
- **Problemas crônicos:** | **Medicações de uso contínuo:**
- **Alergias:** | **Cirurgias / internações:**
- **HF / genograma (se relevante):**

## Hábitos e Rastreamento
**Tabagismo / álcool / drogas:** | **Atividade física / alimentação:**
**Vacinação em dia:** | **Rastreios (PA, glicemia, colpocitologia, mamografia, colorretal — conforme idade):**

## Exame Físico
**Sinais vitais / IMC / CA:**
**Exame dirigido à(s) queixa(s):**

## Avaliação (problemas priorizados)

## Plano de Cuidado
- **Condutas por problema:**
- **Promoção / prevenção (rastreios, vacinas, hábitos):**
- **Pactuação com o paciente / metas:**
- **Retorno / acompanhamento:**
`,
    return: `## Lista de Problemas (ativos)


## S - Subjetivo
**Evolução desde a última consulta:**
**Adesão / dificuldades / novos problemas:**

## O - Objetivo
**Sinais vitais / IMC:**
**Exame dirigido / resultados de exames:**

## A - Avaliação
**Status dos problemas / rastreios pendentes:**

## P - Plano
- **Ajustes / renovação de receitas:**
- **Prevenção (vacinas/rastreios):**
- **Retorno:**
`,
  },

  "Neurocirurgia": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:** | **Dominância (destro/canhoto):**

## Queixa Principal
>

## História da Doença Atual
**Cefaleia:** Padrão | Início | Sinais de alarme (pior da vida, matinal, com vômito):
**Déficit neurológico:** Motor / sensitivo / fala / visual — início e evolução:
**Crises convulsivas:** | **Alteração de marcha / esfíncteres:**
**Coluna / radiculopatia:** Irradiação | Déficit | Claudicação neurogênica:

## Antecedentes
- **Comorbidades:** | **Neoplasia / cirurgia neuro prévia:**
- **Medicações (anticoagulante/antiagregante/anticonvulsivante):** | **Alergias:**
- **HF (aneurisma, tumores):**

## Exame Físico / Neurológico
**Sinais vitais:** | **Glasgow / nível de consciência:**
**Pupilas / pares cranianos:** | **Força (MRC) / tônus / reflexos / Babinski:**
**Sensibilidade / coordenação / marcha:**
**Sinais radiculares (Lasègue) / coluna:**

## Exames Trazidos
**TC / RM (crânio/coluna):** | **Angio / outros:**

## Hipótese Diagnóstica

## Conduta
- **Exames:**
- **Indicação cirúrgica / risco / urgência:**
- **Tratamento (clínico/conservador):**
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Evolução (cefaleia / déficit / dor):**
**Pós-operatório (se aplicável):**

## O - Objetivo
**Exame neurológico:**
**Ferida operatória (se PO) / exames de imagem:**

## A - Avaliação
**Diagnóstico / evolução:**

## P - Plano
- **Conduta (cirúrgica / conservadora):** | **Reabilitação:**
- **Retorno:**
`,
  },

  "Cardiologia": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:**

## Queixa Principal
> 

## História da Doença Atual
**Dor torácica:** Localização: | Irradiação: | Tipo: | Intensidade (0-10): | Duração:
**Dispneia:** Esforço: | Ortopneia: | DPN:
**Palpitações:** | **Síncope:** | **Edema MMII:**

## Antecedentes
- **Fatores de risco CV:** HAS ( ) DM ( ) DLP ( ) Tabagismo ( ) Obesidade ( )
- **IAM/AVC prévio:** | **Revascularização:**
- **Medicações em uso:**
- **Alergias:**
- **HF:** IAM precoce (<55a H / <65a M): ( )

## Exame Físico
**PA:** | **FC:** | **Peso:** | **Alt:** | **IMC:**
**ACV:** RCR/I | Bulhas: | Sopros:
**Pulsos periféricos:**
**AP:**
**Edema:**

## Exames Trazidos
**ECG:**
**Eco:**
**Labs:**

## Hipótese Diagnóstica
**Risco CV (ERG):**

## Conduta
- **Exames:**
- **Tratamento:**
- **Metas:** PA < | LDL <
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Sintomas atuais:**
**Adesão medicamentosa:**
**Tolerância:**
**Hábitos (dieta/exercício):**

## O - Objetivo
**PA:** | **FC:** | **Peso:** | **Alt:** | **IMC:**
**ECG/Exames:**
**ACV:**

## A - Avaliação
**Controle pressórico:** Adequado ( ) Não ( )
**Metas atingidas:**

## P - Plano
- **Ajustes:**
- **Exames:**
- **Retorno:**
`,
  },

  "Gastroenterologia": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:**

## Queixa Principal
> 

## História da Doença Atual
**Dor abdominal:** Local: | Tipo: | Intensidade: | Relação com alimentação:
**Náusea/Vômito:** | **Pirose:** | **Regurgitação:**
**Hábito intestinal:** Freq: | Consistência: | Sangue:
**Perda de peso:** kg em __ meses

## Sinais de Alarme
( ) Disfagia ( ) Odinofagia ( ) Hematêmese ( ) Melena ( ) Perda peso >10% ( ) Anemia ( ) HF câncer GI

## Antecedentes
- **Cirurgias abdominais:**
- **DII/SII/Celíaca:**
- **Uso de AINEs/AAS:**
- **Medicações:**
- **Alergias:**
- **Etilismo:** | **Tabagismo:**

## Exame Físico
**PA:** | **FC:** | **Peso:** | **Alt:** | **IMC:**
**Abdome:** Inspeção: | Palpação: | RHA:
**Sinais de hepatopatia:**

## Hipótese Diagnóstica


## Conduta
- **Exames:** EDA ( ) Colono ( ) USG ( ) Labs ( )
- **Tratamento:**
- **Dieta:**
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Evolução dos sintomas:**
**Adesão à dieta e medicação:**
**Novos sintomas:**

## O - Objetivo
**Peso:** | **Alt:** | **IMC:** (Δ desde última)
**Exames trazidos:**
**Abdome:**

## A - Avaliação


## P - Plano
- **Ajustes:**
- **Exames:**
- **Retorno:**
`,
  },

  "Dermatologia": {
    first: `## Identificação
**Nome:** | **Idade:** | **Fototipo:**

## Queixa Principal
> 

## História da Doença Atual
**Lesão:** Início: | Localização inicial: | Evolução:
**Sintomas:** Prurido (0-10): | Dor: | Secreção:
**Fatores de piora:** Sol ( ) Calor ( ) Suor ( ) Estresse ( ) Alimento:
**Tratamentos prévios:**

## Antecedentes
- **Dermatoses prévias:**
- **Atopia (asma/rinite/DA):**
- **Medicações em uso:**
- **Alergias (drogas/contato):**
- **HF câncer de pele:**

## Hábitos
- **Exposição solar:** | **Fotoproteção:**
- **Skincare:**

## Descrição das Lesões
**Localização:**
**Lesão elementar:**
**Cor:** | **Forma:** | **Bordas:** | **Tamanho:**
**Distribuição:**
**Dermatoscopia:**

## Hipótese Diagnóstica


## Conduta
- **Exames:** Biópsia ( ) Micológico ( ) Patch test ( )
- **Tratamento tópico:**
- **Tratamento sistêmico:**
- **Fotoproteção:**
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Evolução das lesões:**
**Prurido:** (0-10) Antes: | Agora:
**Adesão ao tratamento:**
**Fotoproteção:**

## O - Objetivo
**Descrição lesões atuais:**
**Comparação com anterior:**

## A - Avaliação


## P - Plano
- **Ajustes:**
- **Retorno:**
`,
  },

  "Endocrinologia e Metabologia": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:**

## Queixa Principal
> 

## História da Doença Atual
**Sintomas:** Poliúria ( ) Polidipsia ( ) Polifagia ( ) Perda peso ( )
**Fadiga:** | **Alteração peso:** kg em __ meses
**Sintomas tireoidianos:**

## Antecedentes
- **DM:** Tipo: | Diagnóstico:
- **HAS:** | **DLP:** | **Obesidade:**
- **Tireoide:**
- **Medicações (dose):**
- **Alergias:**
- **HF endócrina:**

## Controle Metabólico
**HbA1c última:** | **Glicemia jejum:**
**Meta HbA1c:**
**Hipoglicemias:**
**Automonitorização:**

## Exame Físico
**PA:** | **FC:** | **Peso:** | **Alt:** | **IMC:**
**Circ. abdominal:**
**Tireoide:**
**Pé diabético:** Pulsos: | Sensibilidade:

## Rastreio Complicações DM
**Fundo de olho:** | **Microalbuminúria:** | **Pé:**

## Conduta
- **Exames:**
- **Medicações:**
- **Metas:** HbA1c < | PA < | LDL <
- **Orientação nutricional:**
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Controle glicêmico:**
**Hipoglicemias:**
**Adesão (medicação/dieta/exercício):**
**Tolerância:**

## O - Objetivo
**Peso:** | **Alt:** | **IMC:** | Δ:
**PA:**
**Glicemia:** | **HbA1c:**
**Perfil lipídico:**
**Função renal:**

## A - Avaliação
**Controle:** Adequado ( ) Não ( )
**Metas atingidas:**

## P - Plano
- **Ajustes:**
- **Exames:**
- **Retorno:**
`,
  },

  "Hematologia e Hemoterapia": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:**

## Queixa Principal
> 

## História da Doença Atual
**Anemia:** Fadiga ( ) Dispneia ( ) Palidez ( )
**Sangramento:** Local: | Espontâneo ( ) Trauma ( )
**Linfonodomegalia:** Local: | Tamanho: | Tempo:
**Febre:** | **Perda peso:** | **Sudorese noturna:**

## Antecedentes
- **Hemopatias prévias:**
- **Transfusões:**
- **Uso de anticoagulantes:**
- **Medicações:**
- **Alergias:**
- **HF hematológica:**

## Exame Físico
**PA:** | **FC:** | **Peso:** | **Alt:** | **IMC:**
**Palidez:** | **Icterícia:** | **Petéquias:**
**Linfonodos:**
**Hepatomegalia:** | **Esplenomegalia:**

## Hemograma
**Hb:** | **Ht:** | **VCM:** | **Plaq:** | **Leuco:**
**Esfregaço:**

## Hipótese Diagnóstica


## Conduta
- **Exames:** Mielograma ( ) Biópsia MO ( ) Imunofeno ( )
- **Tratamento:**
- **Suporte:**
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Sintomas atuais:**
**Tolerância ao tratamento:**
**Sangramentos/Infecções:**

## O - Objetivo
**Hemograma:**
**Exames de controle:**

## A - Avaliação
**Resposta ao tratamento:**

## P - Plano
- **Próximo ciclo/ajuste:**
- **Suporte:**
- **Retorno:**
`,
  },

  "Pediatria": {
    first: `## Identificação
**Nome:** | **DN:** | **Idade:**
**Acompanhante:**

## Queixa Principal
> 

## História da Doença Atual
**Início:** | **Evolução:**
**Febre:** Tmax: | Há quanto tempo:
**Outros sintomas:**
**Tratamentos em casa:**

## Antecedentes
- **Pré-natal/Parto:** IG: | Tipo parto: | PN: | Apgar:
- **Aleitamento:** | **Alimentação atual:**
- **Vacinas:** Em dia ( ) Atrasadas ( )
- **Internações:**
- **Alergias:**
- **Medicações:**

## Desenvolvimento (DNPM)
**Motor:** | **Linguagem:** | **Social:**

## Exame Físico
**Peso:** | **Estatura:** | **PC:**
**Percentis:** P: | E: | PC:
**Estado geral:** | **Hidratação:**
**Orofaringe:** | **Otoscopia:**
**AR:** | **ACV:**
**Abdome:**

## Hipótese Diagnóstica


## Conduta
- **Tratamento:**
- **Orientações (sinais de alerta):**
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Evolução:**
**Alimentação:** | **Sono:**
**Vacinas:** | **Escola:**

## O - Objetivo
**Peso:** | **Estatura:**
**Curvas:**
**Exame:**

## A - Avaliação
**DNPM:**
**Crescimento:**

## P - Plano
- **Orientações:**
- **Próxima vacina:**
- **Retorno:**
`,
  },

  "Pneumologia": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:**

## Queixa Principal
> 

## História da Doença Atual
**Dispneia:** mMRC: | Início: | Progressão:
**Tosse:** Seca ( ) Produtiva ( ) | Expectoração (cor):
**Sibilância:** | **Hemoptise:**
**Dor torácica:**

## Antecedentes
- **Tabagismo:** __ maços/dia x __ anos = __ maços-ano
- **Exposição ocupacional:**
- **Asma/DPOC:** | **TB prévia:**
- **Medicações inalatórias:**
- **Alergias:**
- **Vacinação:** Influenza ( ) Pneumo ( )

## Exame Físico
**PA:** | **FC:** | **FR:** | **SpO2 (AA):**
**Peso:** | **Alt:** | **IMC:**
**AP:** MV: | RA:
**Uso de musculatura acessória:**

## Espirometria
**VEF1:** | **CVF:** | **VEF1/CVF:**
**Resposta BD:**

## Hipótese Diagnóstica
**Classificação:**

## Conduta
- **Exames:** Espiro ( ) RX ( ) TC ( )
- **Tratamento:**
- **Técnica inalatória:**
- **Cessação tabágica:**
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Sintomas (mMRC):**
**Exacerbações:**
**Adesão (técnica inalatória):**
**Tabagismo:**

## O - Objetivo
**SpO2:** | **FR:**
**Espirometria:**
**Questionário:** CAT: | ACT:

## A - Avaliação
**Controle:**
**Classificação GOLD/GINA:**

## P - Plano
- **Step up/down:**
- **Vacinação:**
- **Reabilitação:**
- **Retorno:**
`,
  },

  "Neurologia": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:** | **Escolaridade:**

## Queixa Principal
> 

## História da Doença Atual
**Cefaleia:** Localização: | Tipo: | Intensidade: | Frequência: | Duração:
**Aura:** | **Fotofobia:** | **Náusea:**
**Déficit motor/sensitivo:**
**Alteração cognitiva:** | **Convulsões:**

## Antecedentes
- **AVC/TCE:** | **Epilepsia:**
- **Medicações:**
- **Alergias:**
- **HF neurológica:**

## Exame Neurológico
**Estado mental:** Glasgow: | Orientação:
**Nervos cranianos:**
**Força:** MSD: | MSE: | MID: | MIE:
**Sensibilidade:**
**Reflexos:**
**Coordenação:** | **Marcha:**

## Hipótese Diagnóstica


## Conduta
- **Exames:** TC ( ) RM ( ) EEG ( ) LCR ( )
- **Tratamento:**
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Frequência crises/cefaleias:**
**Adesão:**
**Efeitos adversos:**
**Funcionalidade:**

## O - Objetivo
**Exame neurológico:**
**Exames:**

## A - Avaliação
**Controle:**

## P - Plano
- **Ajustes:**
- **Retorno:**
`,
  },

  "Psiquiatria": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:** | **Ocupação:**

## Queixa Principal
> 

## História da Doença Atual
**Início:** | **Evolução:**
**Humor:** | **Sono:** | **Apetite:**
**Ansiedade:** | **Ideação suicida:**
**Uso de substâncias:**

## História Psiquiátrica
- **Diagnósticos prévios:**
- **Internações:**
- **Medicações anteriores:**
- **História de autolesão/tentativa:**

## Antecedentes
- **Comorbidades:**
- **HF psiquiátrica:**
- **Contexto social/familiar:**

## Exame Psíquico
**Aparência:** | **Atitude:**
**Consciência:** | **Orientação:**
**Atenção:** | **Memória:**
**Humor:** | **Afeto:**
**Pensamento:** Curso: | Conteúdo:
**Sensopercepção:**
**Juízo:** | **Insight:**

## Hipótese Diagnóstica
**CID-10:**

## Risco
**Suicídio:** Baixo ( ) Moderado ( ) Alto ( )
**Heteroagressão:**

## Conduta
- **Medicação:**
- **Psicoterapia:**
- **Orientações familiares:**
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Humor/Ansiedade:**
**Sono:** | **Apetite:**
**Efeitos medicação:**
**Ideação suicida:** Sim ( ) Não ( )
**Funcionamento:**

## O - Objetivo
**Exame psíquico resumido:**

## A - Avaliação
**Resposta ao tratamento:**

## P - Plano
- **Ajustes:**
- **Psicoterapia:**
- **Retorno:**
`,
  },

  "Nefrologia": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:**

## Queixa Principal
> 

## História da Doença Atual
**Edema:** | **Oligúria:**
**Hematúria:** | **Espumúria:**
**Sintomas urêmicos:**

## Antecedentes
- **DM:** | **HAS:**
- **Litíase:** | **ITU de repetição:**
- **AINEs/Nefrotóxicos:**
- **Medicações:**
- **Alergias:**

## Função Renal
**Creatinina:** | **TFGe:**
**Estágio DRC:**
**Proteinúria:**

## Exame Físico
**PA:** | **FC:** | **Peso:** | **Alt:** | **IMC:**
**Edema:**
**Sinais de uremia:**

## Conduta
- **Exames:**
- **Tratamento:**
- **Encaminhamento diálise:**
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Sintomas:**
**Diurese:**
**Adesão (dieta/medicação):**

## O - Objetivo
**PA:** | **Peso:** | **Alt:** | **IMC:**
**Cr:** | **K:** | **TFGe:**

## A - Avaliação
**Progressão:**

## P - Plano
- **Ajustes:**
- **Retorno:**
`,
  },

  "Reumatologia": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:**

## Queixa Principal
> 

## História da Doença Atual
**Artralgia/Artrite:** Localização: | Padrão: | Rigidez matinal (min):
**Sintomas sistêmicos:** Febre ( ) Fadiga ( ) Perda peso ( )
**Manifestações extra-articulares:**

## Antecedentes
- **Doenças autoimunes:**
- **Medicações:**
- **Alergias:**
- **HF reumatológica:**

## Exame Físico
**Art. acometidas:**
**Sinais flogísticos:**
**Deformidades:**
**Pele/Mucosas:**

## Exames
**VHS:** | **PCR:** | **FR:** | **Anti-CCP:**
**FAN:** | **Complemento:**
**RX:**

## Hipótese Diagnóstica


## Conduta
- **Exames:**
- **Tratamento:** DMARD ( ) Biológico ( )
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Dor articular:** (0-10)
**Rigidez matinal:**
**Atividade da doença:**
**Tolerância medicação:**

## O - Objetivo
**Art. com sinovite:**
**DAS28:** | **CDAI:**
**Labs:**

## A - Avaliação
**Resposta:**

## P - Plano
- **Ajustes:**
- **Retorno:**
`,
  },

  "Urologia": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:**

## Queixa Principal
>

## História da Doença Atual
**Sintomas urinários baixos (IPSS):**
- Jato fraco ( ) Hesitação ( ) Intermitência ( )
- Urgência ( ) Frequência ( ) Noctúria ( )
**Dor:** | **Hematúria:**
**Disfunção erétil:** (IIEF-5)

## Antecedentes
- **Litíase:** | **ITU:**
- **Cirurgias urológicas:**
- **Medicações:**
- **Alergias:**
- **HF Ca próstata:**

## Exame Físico
**Abdome:**
**Toque retal:**
- Próstata: Tamanho: | Consistência: | Nódulos:

## Exames
**PSA:** | **Creatinina:**
**USG vias urinárias:**

## Hipótese Diagnóstica


## Conduta
- **Exames:** PSA ( ) USG ( ) Urodinâmica ( )
- **Tratamento:**
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**IPSS:**
**Sintomas:**
**Adesão:**

## O - Objetivo
**PSA:**
**Exames:**
**TR:**

## A - Avaliação


## P - Plano
- **Ajustes:**
- **Retorno:**
`,
  },

  "Clínica Médica": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:** | **Ocupação:**

## Queixa Principal
>

## História da Doença Atual
**Início:** | **Evolução:** | **Duração:**
**Características:**
**Fatores de piora:**
**Fatores de alívio:**
**Sintomas associados:**
**Tratamentos prévios:**

## Revisão de Sistemas
**Geral:** Febre ( ) Perda peso ( ) Astenia ( ) Sudorese noturna ( )
**CV:** Dor torácica ( ) Dispneia ( ) Palpitações ( ) Edema ( )
**Resp:** Tosse ( ) Expectoração ( ) Hemoptise ( )
**GI:** Náusea ( ) Vômitos ( ) Dor abdominal ( ) Diarreia ( ) Constipação ( )
**GU:** Disúria ( ) Hematúria ( ) Alteração jato urinário ( )
**Neuro:** Cefaleia ( ) Tontura ( ) Déficit focal ( ) Convulsão ( )
**Osteomusc:** Artralgia ( ) Mialgia ( ) Lombalgia ( )

## Antecedentes
- **Comorbidades:**
- **Cirurgias:**
- **Internações:**
- **Alergias:**
- **Medicações em uso:**

## Hábitos
- **Tabagismo:** __ maços-ano
- **Etilismo:**
- **Drogas ilícitas:**

## História Familiar
**HAS:** | **DM:** | **Câncer:** | **DAC precoce:** | **Dça autoimune:**

## Exame Físico
**PA:** | **FC:** | **FR:** | **Tax:** | **SpO2:**
**Peso:** | **Alt:** | **IMC:**
**Estado geral:** | **Mucosas:** | **Linfonodos:**
**ACV:** | **AP:** | **Abdome:** | **MMII:**
**Exame específico:**

## Exames Trazidos


## Hipótese Diagnóstica
**Principal:**
**Diferenciais:**

## Conduta
- **Exames:**
- **Tratamento:**
- **Orientações:**
- **Encaminhamentos:**
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Evolução do quadro:**
**Resposta ao tratamento:**
**Adesão medicamentosa:**
**Novos sintomas:**

## O - Objetivo
**PA:** | **FC:** | **Peso:** | **Alt:** | **IMC:**
**Exames trazidos:**
**Exame físico direcionado:**

## A - Avaliação
**Diagnóstico atual:**
**Evolução:**

## P - Plano
- **Exames:**
- **Prescrições/Ajustes:**
- **Orientações:**
- **Encaminhamentos:**
- **Retorno:**
`,
  },

  "Cirurgia Geral": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:**

## Queixa Principal
>

## História da Doença Atual
**Início:** | **Evolução:**
**Sintomas:**
**Fatores de piora/alívio:**

## Antecedentes
- **Cirurgias prévias:**
- **Comorbidades:** HAS ( ) DM ( ) Cardiopatia ( ) Pneumopatia ( )
- **Alergias:**
- **Medicações em uso:** Anticoagulantes ( ) AAS ( )
- **Tabagismo:** | **Etilismo:**

## Exame Físico
**PA:** | **FC:** | **Peso:** | **Alt:** | **IMC:**
**Estado geral:**
**Abdome:**
**Região de interesse:**

## Exames Complementares
**Labs:**
**Imagem:**

## Hipótese Diagnóstica

## Conduta
- **Indicação cirúrgica:**
- **Risco cirúrgico (ASA):**
- **Exames pré-operatórios:**
- **Orientações pré-op:**
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Evolução pós-operatória:**
**Queixas:** Dor ( ) Febre ( ) Alteração ferida ( )
**Função intestinal:**
**Alimentação:**

## O - Objetivo
**PA:** | **FC:** | **Tax:**
**Ferida operatória:**
**Abdome:**
**Drenos (se houver):**

## A - Avaliação
**Diagnóstico evolutivo:**

## P - Plano
- **Curativos:**
- **Medicações:**
- **Dieta:**
- **Retorno:**
`,
  },

  "Geriatria": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:**

## Queixa Principal
>

## História da Doença Atual
**Início:** | **Evolução:**
**Sintomas:**
**Impacto nas AVDs:**

## Antecedentes
- **Comorbidades:** HAS ( ) DM ( ) ICC ( ) DPOC ( ) Demência ( ) Depressão ( )
- **Cirurgias:**
- **Quedas (último ano):**
- **Internações recentes:**
- **Alergias:**
- **Medicações em uso (listar todas):**

## Avaliação Geriátrica Ampla
**Funcionalidade:**
- AVDs básicas (Katz): Banho ( ) Vestir ( ) Higiene ( ) Transferência ( ) Continência ( ) Alimentação ( )
- AVDs instrumentais (Lawton): Telefone ( ) Compras ( ) Cozinha ( ) Casa ( ) Roupas ( ) Transporte ( ) Medicação ( ) Finanças ( )

**Cognição:**
- Mini-Mental (MEEM): ___/30
- Teste do relógio: ___/5

**Humor:**
- GDS-15 (Yesavage): ___/15

**Mobilidade/Equilíbrio:**
- Timed Up and Go: ___s
- Velocidade de marcha: ___m/s

**Nutrição:**
- MNA (Mini Nutritional Assessment): ___
- Peso: ___kg | Alt: ___m | IMC: ___

**Sensorial:**
- Visão: [ ] Adequada [ ] Alterada
- Audição: [ ] Adequada [ ] Alterada

## Contexto Social
- **Cuidador:** | **Moradia:**
- **Rede de apoio:**

## Exame Físico
**PA (sentado e em pé):** | **FC:** | **Peso:**
**Estado geral:**
**Exame direcionado:**

## Hipótese Diagnóstica

## Conduta
- **Exames:**
- **Medicações (revisar polifarmácia):**
- **Reabilitação:**
- **Orientações:**
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Evolução desde última consulta:**
**Adesão ao tratamento:**
**Novas queixas:**
**Funcionalidade:**
**Quedas:** [ ] Sim [ ] Não

## O - Objetivo
**PA (sentado/em pé):** | **FC:** | **Peso:**
**Exames trazidos:**
**Exame direcionado:**

## A - Avaliação
**Controle das condições crônicas:**
**Funcionalidade:**
**Revisão medicamentosa:**

## P - Plano
- **Ajustes no tratamento:**
- **Desprescrição:**
- **Orientações:**
- **Retorno:**
`,
  },

  "Infectologia": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:**

## Queixa Principal
>

## História da Doença Atual
**Início:** | **Evolução:**
**Febre:** Padrão: | Temperatura máx: | Duração:
**Sintomas associados:**
**Viagens recentes:**
**Contato com doentes:**

## Antecedentes
- **Comorbidades:** HIV ( ) Hepatite ( ) DM ( ) Imunossupressão ( )
- **Cirurgias/Procedimentos recentes:**
- **Alergias (especialmente ATB):**
- **Medicações em uso:**
- **Vacinação:** Atualizada ( ) Pendente:
- **Transfusões:**
- **Comportamento sexual:**

## Exame Físico
**PA:** | **FC:** | **FR:** | **Tax:** | **SpO2:**
**Estado geral:**
**Linfonodos:**
**Orofaringe:**
**AR:**
**Abdome:**
**Pele:**

## Exames Complementares
**Labs:**
**Culturas:**
**Sorologias:**
**Imagem:**

## Hipótese Diagnóstica

## Conduta
- **ATB/Antiviral/Antifúngico:**
- **Exames pendentes:**
- **Isolamento:** [ ] Sim [ ] Não
- **Notificação compulsória:** [ ] Sim [ ] Não
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Evolução clínica:**
**Adesão ao tratamento:**
**Efeitos adversos dos ATB:**
**Febre:**

## O - Objetivo
**PA:** | **FC:** | **Tax:**
**Exames/Culturas:**
**Exame direcionado:**

## A - Avaliação
**Resposta ao tratamento:**

## P - Plano
- **Ajuste antimicrobiano:**
- **Exames de controle:**
- **Retorno:**
`,
  },

  "Oftalmologia": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:**

## Queixa Principal
>

## História da Doença Atual
**Início:** | **Evolução:**
**Olho acometido:** [ ] OD [ ] OE [ ] AO
**Sintomas:** Dor ( ) Prurido ( ) Lacrimejamento ( ) Fotofobia ( ) Secreção ( )
**Perda visual:** [ ] Sim [ ] Não | Súbita ( ) Gradual ( )

## Antecedentes Oftalmológicos
- **Uso de óculos/lentes:**
- **Cirurgias oculares prévias:**
- **Glaucoma/Catarata:**
- **Última consulta oftalmo:**

## Antecedentes Gerais
- **Comorbidades:** DM ( ) HAS ( )
- **Medicações em uso:**
- **Alergias:**

## Exame Oftalmológico
**Acuidade visual (c/s correção):** OD: | OE:
**Biomicroscopia:**
- Pálpebras:
- Conjuntiva:
- Córnea:
- Câmara anterior:
- Cristalino:
**Tonometria:** OD: ___mmHg | OE: ___mmHg
**Fundoscopia:** OD: | OE:
**Reflexos pupilares:**
**Motilidade ocular extrínseca:**

## Hipótese Diagnóstica

## Conduta
- **Tratamento:**
- **Exames complementares:**
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Evolução desde última consulta:**
**Adesão ao tratamento:**
**Novas queixas visuais:**

## O - Objetivo
**AV (c/s correção):** OD: | OE:
**Biomicroscopia:**
**Tonometria:** OD: ___mmHg | OE: ___mmHg
**Fundoscopia:**

## A - Avaliação
**Diagnóstico evolutivo:**

## P - Plano
- **Medicações:**
- **Exames:**
- **Retorno:**
`,
  },

  "Ortopedia e Traumatologia": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:** | **Ocupação:**

## Queixa Principal
>

## História da Doença Atual
**Início:** | **Mecanismo de trauma (se houver):**
**Localização da dor:**
**Intensidade (0-10):**
**Irradiação:**
**Fatores de piora:** Repouso ( ) Movimento ( ) Carga ( )
**Fatores de alívio:**
**Limitação funcional:**

## Antecedentes
- **Lesões/Fraturas prévias:**
- **Cirurgias ortopédicas:**
- **Comorbidades:** DM ( ) Osteoporose ( ) AR ( )
- **Alergias:**
- **Medicações em uso:**
- **Tabagismo:**

## Exame Físico
**Inspeção:** Edema ( ) Equimose ( ) Deformidade ( ) Atrofia ( )
**Palpação:** Ponto doloroso:
**Amplitude de movimento (ADM):**
**Testes especiais:**
**Força muscular:**
**Sensibilidade:**
**Vascular periférico:**

## Exames de Imagem
**RX:**
**TC/RM (se indicado):**

## Hipótese Diagnóstica

## Conduta
- **Imobilização:**
- **Medicações:**
- **Fisioterapia:**
- **Indicação cirúrgica:** [ ] Sim [ ] Não
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Evolução da dor (0-10):**
**Funcionalidade:**
**Adesão à fisioterapia:**
**Novas queixas:**

## O - Objetivo
**Inspeção:**
**ADM:**
**Força muscular:**
**Testes especiais:**
**Exames trazidos:**

## A - Avaliação
**Diagnóstico evolutivo:**

## P - Plano
- **Medicações:**
- **Fisioterapia:**
- **Retorno:**
`,
  },

  "Otorrinolaringologia": {
    first: `## Identificação
**Nome:** | **Idade:** | **Sexo:**

## Queixa Principal
>

## História da Doença Atual
**Início:** | **Evolução:**
**Ouvido:** Otalgia ( ) Otorreia ( ) Hipoacusia ( ) Zumbido ( ) Vertigem ( )
**Nariz:** Obstrução ( ) Rinorreia ( ) Epistaxe ( ) Anosmia ( )
**Garganta:** Odinofagia ( ) Disfagia ( ) Disfonia ( ) Roncos ( )

## Antecedentes
- **ORL prévios:** Otite recorrente ( ) Sinusite crônica ( ) Amigdalite recorrente ( )
- **Cirurgias ORL:**
- **Alergias:**
- **Medicações em uso:**
- **Tabagismo:** | **Etilismo:**

## Exame Físico
**Otoscopia:** OD: | OE:
**Rinoscopia anterior:**
**Orofaringe:**
**Pescoço/Linfonodos:**
**Teste de Weber:** | **Rinne:**

## Hipótese Diagnóstica

## Conduta
- **Tratamento:**
- **Exames:**
- **Retorno:**
`,
    return: `## Problemas Ativos


## S - Subjetivo
**Evolução desde última consulta:**
**Adesão ao tratamento:**
**Novas queixas:**

## O - Objetivo
**Otoscopia:** OD: | OE:
**Rinoscopia:**
**Orofaringe:**
**Exames trazidos:**

## A - Avaliação
**Diagnóstico evolutivo:**

## P - Plano
- **Medicações:**
- **Exames:**
- **Retorno:**
`,
  },
};

/**
 * Helper function to get the correct template based on patient selection
 * When a patient is already selected, we don't need the "## Identificação" section
 * since the patient info is already visible in the patient card.
 *
 * @param {string} specialty - The medical specialty
 * @param {boolean} isFirstConsultation - Whether it's a first consultation or return
 * @param {boolean} hasPatientSelected - Whether a patient is already selected
 * @returns {string} The appropriate template
 */
export function getTemplate(specialty, isFirstConsultation, hasPatientSelected = false) {
  const templateData = ANAMNESE_DATA[specialty];
  if (!templateData) return '';

  const templateType = isFirstConsultation ? 'first' : 'return';
  const template = templateData[templateType] || '';

  // For return consultations or when no patient is selected, use template as-is
  if (!isFirstConsultation || !hasPatientSelected) {
    return template;
  }

  // For first consultations with patient selected, remove the Identification section
  // The regex matches from "## Identificação" to the next "##" header
  const identificationRegex = /^## Identificação\n(?:.*\n)*?\n(?=## )/m;
  return template.replace(identificationRegex, '');
}

/**
 * Get all available specialties
 * @returns {string[]} Array of specialty names
 */
export function getSpecialties() {
  return Object.keys(ANAMNESE_DATA);
}
