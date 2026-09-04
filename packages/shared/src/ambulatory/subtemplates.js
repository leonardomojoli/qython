// frontend/src/data/subtemplates.js
// Subtemplates de Consulta - Protocolos Clínicos por Especialidade
// Conteúdo extraído e adaptado do Painel Consultório Inteligente (Notion)

/**
 * Categorias de subtemplates
 */
export const SUBTEMPLATE_CATEGORIES = {
  prenatal: {
    labelKey: 'subtemplateCategory.prenatal',
  },
  puerperio: {
    labelKey: 'subtemplateCategory.puerperio',
  },
  puericultura: {
    labelKey: 'subtemplateCategory.puericultura',
  },
  chronicDisease: {
    labelKey: 'subtemplateCategory.chronicDisease',
  },
  mentalHealth: {
    labelKey: 'subtemplateCategory.mentalHealth',
  },
  acuteDisease: {
    labelKey: 'subtemplateCategory.acuteDisease',
  },
  dermatology: {
    labelKey: 'subtemplateCategory.dermatology',
  },
  gastroenterology: {
    labelKey: 'subtemplateCategory.gastroenterology',
  },
  neurology: {
    labelKey: 'subtemplateCategory.neurology',
  },
  orl: {
    labelKey: 'subtemplateCategory.orl',
  },
  rheumatology: {
    labelKey: 'subtemplateCategory.rheumatology',
  },
  ophthalmology: {
    labelKey: 'subtemplateCategory.ophthalmology',
  },
  surgery: {
    labelKey: 'subtemplateCategory.surgery',
  },
  geriatrics: {
    labelKey: 'subtemplateCategory.geriatrics',
  },
  infectology: {
    labelKey: 'subtemplateCategory.infectology',
  },
  hematology: {
    labelKey: 'subtemplateCategory.hematology',
  },
  orthopedics: {
    labelKey: 'subtemplateCategory.orthopedics',
  },
  oncology: {
    labelKey: 'subtemplateCategory.oncology',
  },
  vascular: {
    labelKey: 'subtemplateCategory.vascular',
  },
};

/**
 * Lista de subtemplates
 * Cada subtemplate possui:
 * - id: identificador único
 * - category: chave da categoria (referencia SUBTEMPLATE_CATEGORIES)
 * - labelKey: chave i18n para o nome exibido no dropdown
 * - specialties: array de especialidades onde o subtemplate aparece ('*' = todas)
 * - content: conteúdo markdown do template
 */
export const SUBTEMPLATES = [
  // ═══════════════════════════════════════════════════════════
  // PRÉ-NATAL
  // ═══════════════════════════════════════════════════════════
  {
    id: 'prenatal_1t',
    category: 'prenatal',
    labelKey: 'subtemplate.prenatal1T',
    specialties: ['Ginecologia e Obstetrícia', 'Medicina da Família e Comunidade'],
    content: `## Pré-Natal - 1º Trimestre

**Registros Iniciais:**
- [ ] Data da última menstruação (DUM): ___
- [ ] Data provável do parto (DPP): ___
- [ ] Idade gestacional: ___ semanas
- [ ] Paridade: G___P___A___

**Subjetivo:**
Gestante de ___ semanas comparece para acompanhamento pré-natal.
Refere/nega: náuseas, vômitos, sangramento vaginal, dor abdominal.
Movimentação fetal: [se aplicável]
Uso de ácido fólico: [ ] Sim [ ] Não

**Exames do 1º Trimestre:**
- [ ] Hemograma completo
- [ ] Tipagem sanguínea + Fator Rh
- [ ] Glicemia de jejum
- [ ] Sorologias: HIV, Sífilis (VDRL), Hepatite B (HBsAg), Toxoplasmose (IgG/IgM)
- [ ] Parcial de urina + Urocultura
- [ ] Ultrassom obstétrico (11-14 semanas)

**Conduta Padrão:**
1. Ácido fólico 5mg 1x/dia até 12ª semana
2. Sulfato ferroso 40mg 1x/dia (profilático a partir de 20 semanas)
3. Orientações sobre alimentação e atividade física
4. Evitar: álcool, tabaco, drogas ilícitas
5. Retorno em 4 semanas`,
  },
  {
    id: 'prenatal_2t',
    category: 'prenatal',
    labelKey: 'subtemplate.prenatal2T',
    specialties: ['Ginecologia e Obstetrícia', 'Medicina da Família e Comunidade'],
    content: `## Pré-Natal - 2º Trimestre (13-26 semanas)

**Identificação:**
IG: ___ semanas (por DUM e USG)
DPP: ___
GPCA: G___P___C___A___
Tipo sanguíneo: ___
Sorologia Toxoplasmose: [ ] Imune [ ] Suscetível

**Subjetivo:**
Histórico obstétrico: Gestações anteriores (intercorrências, amamentação)
Histórico de Pré-eclâmpsia ou DMG: [ ] Sim [ ] Não

Gestação atual:
[ ] Planejada [ ] Aceita
Comorbidades/ISTs: ___
Medicações em uso: ___
Suplementação: [ ] Ácido fólico [ ] Sulfato ferroso

Hábitos e Social:
- Perfil psicossocial (apoio, trabalho)
- Tabagismo/etilismo/drogas: [ ] Sim [ ] Não
- Atividade física, alimentação, sono, hidratação

Queixas atuais:
[ ] Movimentação fetal (a partir de ~20 sem)
[ ] Contrações
[ ] Perda de líquido
[ ] Corrimento/sangramento
[ ] Sintomas urinários
[ ] Edema e dispneia

**Exame Físico:**
Peso: ___kg | IMC: ___
PA: ___mmHg
AU (Altura Uterina): ___cm
BCF: ___bpm
Movimentação fetal: [ ] + [ ] -
Dinâmica uterina: ___
AC/AR: sem alterações
Edema: [ ] Ausente [ ] Presente (+/++/+++)

**Exames do 2º Trimestre:**
- [ ] Laboratoriais de 2º trimestre
- [ ] USG Morfológico (18-22 semanas) - IMPORTANTE

**Conduta:**
1. SUSPENDER ácido fólico após 12ª semana
2. INICIAR Sulfato Ferroso 40mg/dia a partir de 16 semanas
3. Orientar vacina dTpa a partir de 20 semanas
4. Orientações: alimentação, sinais de alerta, prevenção toxoplasmose
5. Iniciar discussão do Plano de Parto
6. Retorno em 4 semanas`,
  },
  {
    id: 'prenatal_3t',
    category: 'prenatal',
    labelKey: 'subtemplate.prenatal3T',
    specialties: ['Ginecologia e Obstetrícia', 'Medicina da Família e Comunidade'],
    content: `## Pré-Natal - 3º Trimestre (27-41 semanas)

**Subjetivo:**
Queixas específicas:
[ ] Edema (mãos/face - atenção!)
[ ] Cefaleia intensa
[ ] Escotomas/alterações visuais
[ ] Contrações
[ ] Diminuição da movimentação fetal
[ ] Perda de líquido
[ ] Sangramento

**Exame Físico:**
Peso: ___kg | Ganho total: ___kg
PA: ___mmHg (ATENÇÃO se > 140/90)
AU: ___cm
BCF: ___bpm
Apresentação: [ ] Cefálica [ ] Pélvica [ ] Transversa
Dinâmica uterina: ___
Edema: [ ] Ausente [ ] Presente (+/++/+++)

**Exames do 3º Trimestre:**
- [ ] Laboratoriais de 3º trimestre
- [ ] Triagem para Estreptococo grupo B (GBS) - 35-37 semanas
- [ ] Completar vacinas pendentes (dT/dTpa, Influenza, Hepatite B)

**Preparação para o Parto:**
- Finalizar Plano de Parto
- Vincular à maternidade de referência
- Orientar sobre consulta de puerpério e consulta precoce do RN
- Cuidados com mamas e amamentação

**Sinais de Trabalho de Parto:**

| Fase | Contrações | Características |
|------|------------|-----------------|
| Inicial | Cada 15-20 min, 30-45s | Irregulares, podem cessar |
| Avançada | 2-3 em 10 min, 60s | Regulares, não cessam com repouso |

**Sinais de Alerta (Ir à Maternidade):**
- Sangramento vaginal intenso
- Dor abdominal súbita
- Diminuição importante dos movimentos fetais
- Cefaleia intensa + alterações visuais
- PA elevada`,
  },

  // ═══════════════════════════════════════════════════════════
  // PUERPÉRIO
  // ═══════════════════════════════════════════════════════════
  {
    id: 'puerperio',
    category: 'puerperio',
    labelKey: 'subtemplate.puerperio',
    specialties: ['Ginecologia e Obstetrícia', 'Medicina da Família e Comunidade'],
    content: `## Puerpério

**Subjetivo:**
GPCA: G___P___C___A___
Parto: [ ] Vaginal [ ] Cesáreo, data: ___
       [ ] Com episiotomia/laceração [ ] Sem intercorrências

Amamentação:
[ ] Aleitamento materno exclusivo
[ ] Dificuldades: [ ] Pega [ ] Dor [ ] Produção
[ ] Uso de complemento

Sintomas:
[ ] Sangramento vaginal (lóquios)
[ ] Dor abdominal
[ ] Dor na ferida/períneo
[ ] Alterações de humor

**Objetivo:**
Sinais Vitais: PA ___mmHg, FC ___bpm

MAMAS:
  [ ] Simétricas
  Mamilos: [ ] Planos [ ] Protusos
  [ ] Com fissuras [ ] Sem fissuras
  [ ] Sinais de ingurgitamento

ABDOME:
  [ ] Indolor [ ] Doloroso
  Útero palpável: [altura em relação à cicatriz umbilical]
  (Involução ~1cm/dia)

PERÍNEO/FERIDA OPERATÓRIA:
  Sutura: [ ] Íntegra [ ] Deiscência
  [ ] Sem sinais de infecção [ ] Com sinais de infecção

**Sinais de Alerta:**

| Sinal | Suspeitar de |
|-------|--------------|
| Sangramento abundante | Hemorragia pós-parto |
| Febre > 38°C | Infecção puerperal |
| Dor abdominal intensa | Endometrite |
| Lóquios fétidos | Infecção |
| Dor/edema em MMII | TVP |
| Cefaleia intensa + alterações visuais | Pré-eclâmpsia pós-parto |
| Tristeza intensa > 2 semanas | Depressão pós-parto |

**Plano:**
- Sulfato ferroso 40mg/dia até 3 meses pós-parto
- Incentivo ao aleitamento exclusivo até 6 meses
- Avaliar rede de apoio e saúde mental
- Contracepção: DIU, implante, minipílula (seguros na lactação)
- Retorno: ___`,
  },

  // ═══════════════════════════════════════════════════════════
  // PUERICULTURA
  // ═══════════════════════════════════════════════════════════
  {
    id: 'puericultura_rn',
    category: 'puericultura',
    labelKey: 'subtemplate.puericulturaRN',
    specialties: ['Pediatria', 'Medicina da Família e Comunidade'],
    content: `## Puericultura - Recém-Nascido (até 28 dias)

**Registros Iniciais:**
- [ ] Data de nascimento: ___
- [ ] Tipo de parto: ___
- [ ] Peso ao nascer: ___g / Peso atual: ___g
- [ ] Comprimento ao nascer: ___cm
- [ ] Perímetro cefálico: ___cm
- [ ] APGAR 1': ___ / 5': ___
- [ ] Tipagem sanguínea (RN e mãe): ___

**Triagens Neonatais:**
- [ ] Teste do pezinho (3º ao 5º dia)
- [ ] Teste do olhinho (reflexo vermelho)
- [ ] Teste da orelhinha (EOA)
- [ ] Teste do coraçãozinho (oximetria de pulso)
- [ ] Teste da linguinha

**Avaliação Alimentação:**
[ ] Aleitamento materno exclusivo
[ ] Dificuldades na amamentação
[ ] Fórmula infantil (se indicada)
Frequência das mamadas: ___ vezes/dia

**Exame Físico do RN:**
- Fontanela anterior (bregmática): ___
- Reflexos primitivos: sucção, moro, preensão
- Ausculta cardíaca e respiratória
- Abdome: coto umbilical, visceromegalias
- Genitália: testículos tópicos / imperfuração himeno
- Quadril: Ortolani / Barlow
- Pele: icterícia (Kramer)

**Conduta:**
1. Manter coto umbilical limpo e seco
2. Vitamina D 400 UI até 12 meses
3. Orientar sobre aleitamento materno exclusivo
4. Próxima consulta aos 30 dias de vida`,
  },
  {
    id: 'puericultura_1m',
    category: 'puericultura',
    labelKey: 'subtemplate.puericultura1m',
    specialties: ['Pediatria', 'Medicina da Família e Comunidade'],
    content: `## Puericultura - 1 mês

**Subjetivo:**
Alimentação: [ ] AME [ ] Misto [ ] Fórmula
Dificuldades na pega: [ ] Sim [ ] Não
Sono: ___h/dia
Diurese e evacuações: ___
Suplementação: Vitamina D em uso

**Marcos do Desenvolvimento:**
- [ ] Fixa olhar momentaneamente
- [ ] Responde a sons (sobressalto)
- [ ] Reflexos primitivos presentes

**Plano:**
1. Orientações sobre aleitamento e pega
2. Prevenção de acidentes (quedas, engasgos)
3. Manter Vitamina D 400 UI/dia
4. Próxima consulta aos 2 meses`,
  },
  {
    id: 'puericultura_2m',
    category: 'puericultura',
    labelKey: 'subtemplate.puericultura2m',
    specialties: ['Pediatria', 'Medicina da Família e Comunidade'],
    content: `## Puericultura - 2 meses

**Vacinas (2 meses):**
- [ ] Pentavalente (DTP+Hib+HB)
- [ ] VIP (Polio injetável)
- [ ] VORH (Rotavírus)
- [ ] Pneumo 10-valente

**Marcos Esperados:**

| Marco | Presente |
|-------|----------|
| Segue objetos com olhar | [ ] |
| Sorriso social | [ ] |
| Sustenta cabeça momentaneamente | [ ] |
| Vocaliza (arrulhos) | [ ] |

**Plano:**
1. Orientar sobre estímulos (conversas, cores)
2. Próxima vacina: 3 meses (Meningo C)
3. Manter Vitamina D 400 UI
4. Próxima consulta aos 4 meses`,
  },
  {
    id: 'puericultura_4m',
    category: 'puericultura',
    labelKey: 'subtemplate.puericultura4m',
    specialties: ['Pediatria', 'Medicina da Família e Comunidade'],
    content: `## Puericultura - 4 meses

**Exame Específico:**
- Teste de Hirshberg e Cobertura: Iniciar avaliação de estrabismo

**Vacinas (4 meses):**
- [ ] Pentavalente (2ª dose)
- [ ] VIP (2ª dose)
- [ ] VORH (2ª dose)
- [ ] Pneumo 10 (2ª dose)

**Marcos Esperados:**

| Marco | Presente |
|-------|----------|
| Sustenta cabeça firme | [ ] |
| Leva objetos à boca | [ ] |
| Ri alto | [ ] |
| Tenta alcançar objetos | [ ] |

**Plano:**
1. Próxima vacina: 5 meses (Meningo C 2ª dose)
2. Manter Vitamina D 400 UI
3. Orientar segurança (quedas do sofá/cama)
4. Próxima consulta aos 6 meses`,
  },
  {
    id: 'puericultura_6m',
    category: 'puericultura',
    labelKey: 'subtemplate.puericultura6m',
    specialties: ['Pediatria', 'Medicina da Família e Comunidade'],
    content: `## Puericultura - 6 meses

**Alimentação - INTRODUÇÃO ALIMENTAR:**
Iniciar alimentos complementares:
- Frutas amassadas (iniciar)
- Papas de legumes e carnes
- Oferecer água
- MANTER aleitamento materno

**Vacinas (6 meses):**
- [ ] Pentavalente (3ª dose)
- [ ] VIP (3ª dose)
- [ ] Influenza (1ª dose)

**Marcos Esperados:**

| Marco | Presente |
|-------|----------|
| Senta com apoio | [ ] |
| Transfere objetos entre mãos | [ ] |
| Balbucia (ba-ba, da-da) | [ ] |
| Estranha desconhecidos | [ ] |

**Plano:**
1. Prescrever Sulfato Ferroso profilático
2. Manter Vitamina D 400 UI
3. Orientar sobre introdução alimentar
4. Próxima consulta aos 9 meses`,
  },
  {
    id: 'puericultura_9m',
    category: 'puericultura',
    labelKey: 'subtemplate.puericultura9m',
    specialties: ['Pediatria', 'Medicina da Família e Comunidade'],
    content: `## Puericultura - 9 meses

**Subjetivo:**
- Avaliação da adaptação alimentar
- Iniciar orientação sobre escovação dentária
- Avaliar sono e desmame noturno

**Vacinas (9 meses):**
- [ ] Febre Amarela

**Marcos Esperados:**

| Marco | Presente |
|-------|----------|
| Senta sem apoio | [ ] |
| Engatinha | [ ] |
| Pinça lateral | [ ] |
| Fala "mama/papa" | [ ] |
| Estranha desconhecidos | [ ] |
| Brinca de esconder | [ ] |

**Plano:**
1. Ajustar Sulfato Ferroso conforme peso
2. Manter Vitamina D 400 UI
3. Orientar higiene bucal
4. Próxima consulta aos 12 meses`,
  },
  {
    id: 'puericultura_12m',
    category: 'puericultura',
    labelKey: 'subtemplate.puericultura12m',
    specialties: ['Pediatria', 'Medicina da Família e Comunidade'],
    content: `## Puericultura - 12 meses

**Suplementação - Ajuste:**
- Vitamina D: Aumentar para **600 UI/dia** (manter até 24 meses)

**Vacinas (12 meses):**
- [ ] Tríplice Viral (SCR)
- [ ] Pneumo 10 (reforço)
- [ ] Meningo C (reforço)

**Marcos Esperados:**

| Marco | Presente |
|-------|----------|
| Anda com apoio | [ ] |
| Pinça fina | [ ] |
| Fala 1-3 palavras | [ ] |
| Aponta o que quer | [ ] |
| Imita gestos | [ ] |

**Plano:**
1. Ajustar Vitamina D para 600 UI
2. Manter Sulfato Ferroso até 24 meses
3. Orientar disciplina positiva
4. Próxima consulta aos 18 meses`,
  },
  {
    id: 'puericultura_18m',
    category: 'puericultura',
    labelKey: 'subtemplate.puericultura18m',
    specialties: ['Pediatria', 'Medicina da Família e Comunidade'],
    content: `## Puericultura - 18 meses

**Vacinas (15-18 meses):**
- [ ] DTP (1º reforço)
- [ ] VOP (1º reforço)
- [ ] Hepatite A
- [ ] Tetra Viral (se não fez Varicela)

**Marcos Esperados (15-18 meses):**

| Marco | Presente |
|-------|----------|
| Anda sozinho | [ ] |
| Coloca blocos na caneca | [ ] |
| Identifica partes do corpo | [ ] |
| Vocabulário 10-15 palavras | [ ] |
| Ajuda a se vestir | [ ] |

**Orientações:**
- Uso de telas: EVITAR em menores de 2 anos
- Atividade física diária
- Prevenção acidentes domésticos (quedas, queimaduras)`,
  },
  {
    id: 'puericultura_24m',
    category: 'puericultura',
    labelKey: 'subtemplate.puericultura24m',
    specialties: ['Pediatria', 'Medicina da Família e Comunidade'],
    content: `## Puericultura - 24 meses

**Marcos Esperados:**

| Marco | Presente |
|-------|----------|
| Corre | [ ] |
| Sobe degraus | [ ] |
| Forma frases simples (2 palavras) | [ ] |
| Ajuda a se despir | [ ] |
| Brinca de faz-de-conta | [ ] |
| Segue ordens simples | [ ] |

**Avaliação:**
- Alimentação: avaliar seletividade alimentar
- Linguagem: atenção se < 50 palavras ou sem frases
- Comportamento: atenção a sinais de TEA

**Orientações:**
- Telas: máximo 1h/dia supervisionado
- Incentivo à autonomia (comer sozinho, tirar fralda)
- Socialização com outras crianças`,
  },
  {
    id: 'puericultura_3a',
    category: 'puericultura',
    labelKey: 'subtemplate.puericultura3a',
    specialties: ['Pediatria', 'Medicina da Família e Comunidade'],
    content: `## Puericultura - 3 anos

**Marcos Esperados:**

| Marco | Presente |
|-------|----------|
| Pedala triciclo | [ ] |
| Frases completas (3+ palavras) | [ ] |
| Vocabulário > 200 palavras | [ ] |
| Veste-se com ajuda | [ ] |
| Treino esfincteriano (diurno) | [ ] |
| Brinca com outras crianças | [ ] |
| Sabe dizer o nome | [ ] |

**Antropometria:**
- Peso: ___ kg (Z-score: ___)
- Estatura: ___ cm (Z-score: ___)
- IMC: ___ kg/m² (Z-score: ___)

**Avaliação:**
- Linguagem: atenção se < 200 palavras ou frases incompletas
- Comportamento: atenção a sinais de TEA, TDAH
- Controle esfincteriano: diurno esperado até 3 anos
- Rastreamento visual: primeiro teste formal (cover test, Hirschberg)
- Avaliação odontológica: cáries de mamadeira, higiene bucal

**Orientações:**
- Telas: máximo 1h/dia supervisionado (conteúdo adequado)
- Higiene bucal: escovação com creme dental fluoretado (grão de arroz)
- Alimentação: dieta familiar, evitar ultraprocessados e açúcar
- Limites e disciplina positiva
- Segurança: afogamento, trânsito, quedas

**Vacinas (catch-up se necessário):**
- Verificar calendário PNI atualizado
- Hepatite A (15m), DTP + VIP reforço (15m), Tetra viral (15m)`,
  },
  {
    id: 'puericultura_5a',
    category: 'puericultura',
    labelKey: 'subtemplate.puericultura5a',
    specialties: ['Pediatria', 'Medicina da Família e Comunidade'],
    content: `## Puericultura - 5 anos

**Marcos Esperados:**

| Marco | Presente |
|-------|----------|
| Pula em um pé só | [ ] |
| Desenha pessoa com 6+ partes | [ ] |
| Escreve o próprio nome | [ ] |
| Conta até 10 | [ ] |
| Veste-se sozinho | [ ] |
| Compreende regras de jogos simples | [ ] |
| Controle esfincteriano completo (diurno e noturno) | [ ] |

**Antropometria:**
- Peso: ___ kg (Z-score: ___)
- Estatura: ___ cm (Z-score: ___)
- IMC: ___ kg/m² (Z-score: ___)
- PA: ___/___ mmHg (percentil: ___)

**Avaliação:**
- Rastreamento visual OBRIGATÓRIO pré-escolar (acuidade visual, Snellen)
- PA anual a partir de 3 anos (verificar percentil para idade/sexo/estatura)
- Prontidão escolar: linguagem, coordenação motora fina, socialização
- Avaliação odontológica

**Exames de Rotina:**
- [ ] Hemograma
- [ ] Parasitológico de fezes (3 amostras)
- [ ] EAS
- [ ] Perfil de ferro (ferritina, ferro sérico)

**Vacinas (2º reforço):**
- [ ] DTP (2º reforço - 4 anos)
- [ ] VOP (2º reforço - 4 anos)
- [ ] Varicela (2ª dose - 4 anos)
- Verificar catch-up se doses atrasadas

**Orientações:**
- Telas: máximo 1-2h/dia supervisionado
- Atividade física: pelo menos 60 min/dia
- Alimentação saudável: evitar ultraprocessados, refrigerantes
- Preparação para alfabetização: leitura compartilhada
- Segurança no trânsito: cadeirinha adequada para peso`,
  },
  {
    id: 'puericultura_escolar',
    category: 'puericultura',
    labelKey: 'subtemplate.puericulturaEscolar',
    specialties: ['Pediatria', 'Medicina da Família e Comunidade'],
    content: `## Puericultura - 7 a 10 anos (Escolar)

**Marcos Esperados:**

| Marco | Presente |
|-------|----------|
| Leitura e escrita fluentes | [ ] |
| Pensamento lógico concreto | [ ] |
| Autonomia em AVDs (higiene, alimentação) | [ ] |
| Habilidades sociais complexas | [ ] |
| Desempenho escolar adequado | [ ] |
| Atividade física regular | [ ] |

**Antropometria:**
- Peso: ___ kg (Z-score: ___)
- Estatura: ___ cm (Z-score: ___)
- IMC: ___ kg/m² (Z-score: ___)
- PA: ___/___ mmHg (percentil: ___)
- Velocidade de crescimento: ___ cm/ano (esperado: 5-7 cm/ano)

**Avaliação:**
- Desempenho escolar: rendimento, dificuldades, relação com professores/colegas
- Rastreamento TDAH/comportamental: atenção, hiperatividade, oposição
- PA anual (verificar percentil)
- Acuidade visual (a cada 2 anos ou conforme queixa)
- Avaliação odontológica anual

**Exames de Rotina:**
- [ ] Hemograma
- [ ] Parasitológico de fezes
- [ ] EAS
- [ ] Glicemia de jejum
- [ ] Perfil lipídico (screening universal 9-11 anos)

**Vacinas:**
- [ ] HPV (1ª dose - 9 anos PNI, esquema 0-6 meses)
- Verificar catch-up de doses atrasadas

**Orientações:**
- Telas: máximo 2h/dia, conteúdo supervisionado, sem telas no quarto
- Atividade física: pelo menos 60 min/dia
- Alimentação: autonomia com supervisão, lanche escolar saudável
- Cyberbullying: orientar sobre segurança online
- Higiene do sono: 9-11h/noite, rotina regular
- Autonomia progressiva com responsabilidades`,
  },
  {
    id: 'puericultura_puberdade',
    category: 'puericultura',
    labelKey: 'subtemplate.puericulturaPuberdade',
    specialties: ['Pediatria', 'Medicina da Família e Comunidade'],
    content: `## Puericultura - 11 a 14 anos (Puberdade)

**Estadiamento de Tanner:**

| Parâmetro | Estágio | Descrição |
|-----------|---------|-----------|
| Mamas (M) / Genitália (G) | [ ] 1 [ ] 2 [ ] 3 [ ] 4 [ ] 5 | ___ |
| Pelos pubianos (P) | [ ] 1 [ ] 2 [ ] 3 [ ] 4 [ ] 5 | ___ |
| Pelos axilares | [ ] Ausentes [ ] Presentes | |

Meninas: Menarca? [ ] Sim (DUM: ___) [ ] Não
Meninos: Volume testicular: ___ mL (Prader)

**Antropometria:**
- Peso: ___ kg (Z-score: ___)
- Estatura: ___ cm (Z-score: ___)
- IMC: ___ kg/m² (Z-score: ___)
- PA: ___/___ mmHg (percentil: ___)
- Velocidade de crescimento: ___ cm/ano
  - Meninas: estirão ~8-10 cm/ano (pico em M3)
  - Meninos: estirão ~10-12 cm/ano (pico em G4)

**Avaliação:**
- Estadiamento puberal: adequado/precoce/atrasado para idade
- Screening de escoliose: teste de Adams
- Saúde mental: rastreamento com PHQ-A (depressão), GAD-7 (ansiedade)
- CRAFFT: rastreamento uso de substâncias
- Desempenho escolar e socialização
- PA anual

**Exames de Rotina:**
- [ ] Hemograma
- [ ] Glicemia de jejum
- [ ] Perfil lipídico
- [ ] Função tireoidiana (TSH, T4L)
- [ ] EAS
- [ ] Ferritina (especialmente meninas pós-menarca)

**Vacinas:**
- [ ] HPV (completar esquema se não iniciado)
- [ ] Meningocócica ACWY (11-12 anos - reforço)
- [ ] dTpa (reforço 11-12 anos)

**Orientações:**
- Educação sexual: puberdade, higiene, consentimento
- Saúde mental: mudanças emocionais, autoestima, identidade
- Telas: orientar sobre redes sociais, cyberbullying, privacidade
- Atividade física: 60 min/dia, evitar sedentarismo
- Alimentação: necessidades calóricas aumentadas, evitar dietas restritivas
- Sono: 8-10h/noite
- Confidencialidade: iniciar consulta parcialmente sem responsável`,
  },
  {
    id: 'puericultura_adolescente',
    category: 'puericultura',
    labelKey: 'subtemplate.puericulturaAdolescente',
    specialties: ['Pediatria', 'Medicina da Família e Comunidade'],
    content: `## Puericultura - 15 a 18 anos (Adolescente)

**Avaliação HEEADSSS:**

| Domínio | Avaliação |
|---------|-----------|
| Home (Lar) | Estrutura familiar, conflitos, segurança: ___ |
| Education (Educação) | Desempenho, planos, evasão: ___ |
| Eating (Alimentação) | Hábitos, transtornos alimentares, imagem corporal: ___ |
| Activities (Atividades) | Lazer, esportes, amigos, telas: ___ |
| Drugs (Drogas) | Álcool, tabaco, drogas, CRAFFT score: ___ |
| Sexuality (Sexualidade) | Orientação, atividade sexual, contracepção, ISTs: ___ |
| Suicide/Depression | Humor, autolesão, ideação suicida, PHQ-A: ___ |
| Safety (Segurança) | Violência, bullying, acidentes, cinto de segurança: ___ |

**Maturação Sexual:**
- Tanner: M/G ___ P ___
- Maturação sexual: [ ] Completa [ ] Em andamento
- Meninas: ciclos regulares? DUM: ___
- Meninos: volume testicular: ___ mL

**Antropometria:**
- Peso: ___ kg (Z-score: ___)
- Estatura: ___ cm (Z-score: ___)
- IMC: ___ kg/m² (Z-score: ___)
- PA: ___/___ mmHg

**Avaliação:**
- Saúde mental: depressão, ansiedade, autolesão, uso de substâncias
- Imagem corporal e transtornos alimentares
- Atividade sexual: contracepção, prevenção de ISTs
- Desempenho escolar/profissional
- Projeto de vida e autonomia
- Transição para saúde do adulto (a partir de 16-18a)

**Exames de Rotina:**
- [ ] Hemograma
- [ ] Glicemia de jejum
- [ ] Perfil lipídico
- [ ] Função tireoidiana (TSH, T4L)
- [ ] EAS
- [ ] Ferritina (meninas)
- [ ] Sorologias ISTs (se atividade sexual): HIV, sífilis, hepatites B/C

**Vacinas (catch-up):**
- [ ] HPV (completar esquema)
- [ ] Meningocócica ACWY (se não realizada)
- [ ] dTpa (se não realizada)
- [ ] Hepatite B (verificar esquema completo)
- Verificar carteira vacinal completa

**Orientações:**
- Confidencialidade: consulta SEM responsável (garantir sigilo)
- Contracepção e prevenção de ISTs (preservativo, métodos combinados)
- Saúde mental: canais de apoio, CVV (188)
- Uso de substâncias: redução de danos, orientação
- Atividade física: 60 min/dia
- Sono: 8-10h/noite
- Projeto de vida: vocacional, acadêmico, profissional
- Transição para acompanhamento adulto: orientar processo`,
  },

  // ═══════════════════════════════════════════════════════════
  // DOENÇAS CRÔNICAS
  // ═══════════════════════════════════════════════════════════
  {
    id: 'dm',
    category: 'chronicDisease',
    labelKey: 'subtemplate.dm',
    specialties: ['Endocrinologia e Metabologia', 'Clínica Médica', 'Medicina da Família e Comunidade'],
    content: `## Diabetes Mellitus - Acompanhamento

**Registros:**
- [ ] Última fundoscopia: ___
- [ ] Últimos exames laboratoriais: ___
- [ ] Avaliação do pé diabético: ___
- [ ] Medicações em uso: ___

**Subjetivo:**
Paciente diabético tipo ___ comparece para acompanhamento.
Adesão ao tratamento: [ ] Boa [ ] Regular [ ] Ruim
Automonitorização glicêmica: [ ] Realiza [ ] Não realiza
Valores médios: jejum ___ / pós-prandial ___

Sintomas de neuropatia:
[ ] Parestesias em MMII
[ ] Fraqueza
[ ] Dor em queimação

Sintomas cardiovasculares:
[ ] Dispneia
[ ] Dor torácica
[ ] Edema

Hábitos de vida:
[ ] Dieta adequada
[ ] Atividade física regular
[ ] Tabagismo ativo/cessou/nunca
[ ] Etilismo

**Metas Glicêmicas:**

| Perfil | HbA1c | GJ | Pós-prandial |
|--------|-------|-----|--------------|
| Geral | < 7% | 80-130 | < 180 |
| Idoso frágil | < 8.5% | 100-180 | < 250 |
| Gestante | < 6% | < 95 | < 140 (1h) / < 120 (2h) |

**Exames de Acompanhamento (Anual):**
- HbA1c (a cada 3-4 meses se descompensado)
- Creatinina + TFG (CKD-EPI)
- Relação Albumina/Creatinina urinária (RAC)
- Perfil lipídico
- ECG
- Fundoscopia
- Avaliação do pé diabético

**Fluxograma de Tratamento:**
ETAPA 1 - Monoterapia:
- Metformina 500-850mg (iniciar com jantar, aumentar gradual)
  Meta: 850mg 2x/dia ou 1000mg 2x/dia

ETAPA 2 - Terapia dupla (se HbA1c > meta após 3 meses):
- Metformina + Sulfonilureia (Glicazida MR 30-120mg)
- Metformina + SGLT2i (se DCV ou DRC)
- Metformina + GLP-1 RA (se obesidade)

ETAPA 3 - Terapia tripla ou insulina basal:
- Adicionar NPH noturna 10 UI (ou 0.1-0.2 UI/kg)
  Ajustar 2-4 UI a cada 3 dias conforme glicemia de jejum

**Pé Diabético:**
[ ] Inspeção: fissuras, calosidades, úlceras
[ ] Pulsos: tibial posterior, pedioso
[ ] Sensibilidade: monofilamento 10g (10 pontos)
[ ] Deformidades: Charcot, dedos em garra`,
  },
  {
    id: 'has',
    category: 'chronicDisease',
    labelKey: 'subtemplate.has',
    specialties: ['Cardiologia', 'Clínica Médica', 'Medicina da Família e Comunidade', 'Nefrologia'],
    content: `## Hipertensão Arterial - Acompanhamento

**Registros:**
- [ ] Últimos exames: ___
- [ ] Última fundoscopia: ___
- [ ] Medicações em uso: ___

**Subjetivo:**
Paciente hipertenso comparece para acompanhamento.
Adesão ao tratamento: [ ] Boa [ ] Regular [ ] Ruim
Uso regular das medicações: [ ] Sim [ ] Não

Sintomas:
[ ] Cefaleia
[ ] Dispneia
[ ] Dor torácica
[ ] Edema de MMII
[ ] Tonturas

Hábitos de vida:
[ ] Atividade física regular
[ ] Dieta hipossódica
[ ] Tabagismo
[ ] Etilismo

**Exame Físico:**
- PA (braço direito e esquerdo): ___
- IMC: ___
- Circunferência abdominal: ___
- Ausculta cardíaca: ___
- Pulsos periféricos: ___
- Edema: ___

**Metas de Tratamento:**

| Perfil | Meta PA |
|--------|---------|
| Geral (baixo RCV) | < 140/90 |
| Alto risco (DM, DRC, IC, RCV>20%) | < 130/80 |
| Idoso > 80 anos | < 150/90 |

**Algoritmo de Tratamento:**
ETAPA 1 - Monoterapia:
- IECA (Enalapril 10-40mg/dia)
- BRA (Losartana 50-100mg/dia)
- BCC (Anlodipino 5-10mg/dia)
- Tiazídico (HCTZ 12.5-25mg/dia)

ETAPA 2 - Terapia dupla:
- IECA/BRA + BCC
- IECA/BRA + Tiazídico

ETAPA 3 - Terapia tripla:
- IECA/BRA + BCC + Tiazídico

ETAPA 4 - HAS Resistente:
- Adicionar Espironolactona 25-50mg/dia

**Exames Complementares Iniciais:**
- Hemograma, Creatinina + TFG, Potássio
- Glicemia de jejum / HbA1c, Perfil lipídico
- Parcial de urina, ECG`,
  },
  {
    id: 'dac',
    category: 'chronicDisease',
    labelKey: 'subtemplate.dac',
    specialties: ['Cardiologia', 'Clínica Médica', 'Medicina da Família e Comunidade'],
    content: `## Doença Arterial Coronariana - Acompanhamento

**Registros:**
- [ ] Comorbidades: ___
- [ ] Uso de álcool/tabagismo: ___
- [ ] Medicamentos em uso: ___
- [ ] Último ECG/teste ergométrico: ___

**Subjetivo:**
Paciente com DAC comparece para acompanhamento.
Dor torácica: [ ] Presente [ ] Ausente
  - Desencadeada por: [ ] Exercício [ ] Esforço [ ] Ansiedade
  - Alivia com: [ ] Repouso [ ] Nitrato SL
  - Duração: < 10 minutos / > 10 minutos

Nega/refere:
[ ] Dor muscular associada ao exercício
[ ] Dormência, fraqueza, palidez
[ ] Edema em panturrilhas
[ ] Dispneia aos esforços

Adesão: [ ] Boa [ ] Regular [ ] Ruim
Efeitos adversos dos fármacos: ___

**Objetivo:**
Estado Geral: BEG, LOC, MUC
PA: ___mmHg (Meta < 130/90) | FC: ___bpm (Alvo 50-60bpm em uso de BB)
Peso: ___ | IMC: ___ | CA: ___
AC: RCR, 2T, BNF, [sem/com] sopros
Extremidades: Aquecidas, perfundidas, pulsos pediosos cheios, TEC < 3s, sem edema

**Classificação da Angina (CCS):**

| Classe | Descrição |
|--------|-----------|
| I | Angina apenas aos grandes esforços |
| II | Angina aos esforços habituais |
| III | Angina aos pequenos esforços |
| IV | Angina em repouso ou mínimos esforços |

**Tratamento - Redução de Risco:**
1. AAS 100mg/dia (Clopidogrel 75mg se alergia)
2. Estatina alta potência: Atorvastatina 40-80mg ou Rosuvastatina 20-40mg
3. IECA: Enalapril 5mg 12/12h → progredir até 10mg 12/12h

**Sinais de Angina Instável (URGÊNCIA):**
- Dor em repouso > 20 minutos
- Início recente (< 2 meses) com CCS III-IV
- Padrão "crescendo"`,
  },
  {
    id: 'drc',
    category: 'chronicDisease',
    labelKey: 'subtemplate.drc',
    specialties: ['Nefrologia', 'Clínica Médica', 'Medicina da Família e Comunidade'],
    content: `## Doença Renal Crônica - Acompanhamento

**Registros:**
- [ ] Etiologia da DRC: ___
- [ ] Estadiamento atual: G___ A___
- [ ] Data último TFG/RAC: ___
- [ ] Medicações em uso: ___

**Subjetivo:**
Paciente com DRC comparece para acompanhamento.
Refere/nega:
[ ] Anorexia, náuseas, vômitos
[ ] Pernas inquietas
[ ] Prurido
[ ] Mal-estar geral
[ ] Edema

Fatores de risco: [ ] HAS [ ] DM [ ] Histórico familiar
Adesão medicamentosa: [ ] Boa [ ] Regular [ ] Ruim

**Objetivo:**
Estado Geral: BEG, LOC, MUC
PA: ___mmHg | Peso: ___kg
AC: RR, 2T, BNF
Extremidades: [sem/com] edemas

**Estadiamento (KDIGO):**

| Categoria | TFG (mL/min) | Descrição |
|-----------|-------------|-----------|
| G1 | ≥ 90 | Normal ou alto |
| G2 | 60-89 | Levemente diminuído |
| G3a | 45-59 | Leve a moderado |
| G3b | 30-44 | Moderado a severo |
| G4 | 15-29 | Severamente diminuído |
| G5 | < 15 | Falência renal |

**Tratamento:**
- IECA/BRA se albuminúria ≥ A2
- SGLT2i (Dapagliflozina 10mg) se TFG > 20 + (DM2 ou RAC > 200)
- Estatina se > 50 anos ou TFG < 60

**Encaminhamento Nefrologia:**
- TFG < 30 (G4-G5)
- Declínio rápido da TFG (> 5mL/min/ano)
- RAC > 300 persistente`,
  },
  {
    id: 'ic',
    category: 'chronicDisease',
    labelKey: 'subtemplate.ic',
    specialties: ['Cardiologia', 'Clínica Médica', 'Medicina da Família e Comunidade'],
    content: `## Insuficiência Cardíaca - Acompanhamento

**Classificação:**

| Tipo | FE | Nomenclatura |
|------|-----|--------------|
| ICFEr | ≤ 40% | IC com FE reduzida |
| ICFElr | 41-49% | IC com FE levemente reduzida |
| ICFEp | ≥ 50% | IC com FE preservada |

**Classe Funcional (NYHA):**

| Classe | Descrição |
|--------|-----------|
| I | Sem limitação |
| II | Limitação aos grandes esforços |
| III | Limitação aos pequenos esforços |
| IV | Sintomas em repouso |

**Pilar Terapêutico ICFEr - 4 Classes Fundamentais:**

| Classe | Medicamento | Dose-alvo |
|--------|-------------|-----------|
| IECA/BRA/ARNI | Sacubitril/Valsartana | 97/103mg 2x |
| Betabloqueador | Carvedilol | 25mg 2x |
| Antagonista MR | Espironolactona | 25-50mg/dia |
| iSGLT2 | Dapagliflozina | 10mg/dia |

**Outros:**
- Diurético de alça (Furosemida): controle congestão
- Ivabradina: se FC > 70 bpm em ritmo sinusal
- Digoxina: controle FA ou sintomas refratários`,
  },
  {
    id: 'fa',
    category: 'chronicDisease',
    labelKey: 'subtemplate.fa',
    specialties: ['Cardiologia', 'Clínica Médica'],
    content: `## Fibrilação Atrial - Acompanhamento

**CHA₂DS₂-VASc (Risco AVC):**

| Fator | Pontos |
|-------|--------|
| C - IC ou FE < 40% | 1 |
| H - Hipertensão | 1 |
| A - Idade ≥ 75 anos | 2 |
| D - Diabetes | 1 |
| S - AVC/AIT prévio | 2 |
| V - Doença vascular | 1 |
| A - Idade 65-74 | 1 |
| Sc - Sexo feminino | 1 |

Score calculado: ___ → Anticoagular: [ ] Sim [ ] Não

**Anticoagulação:**

| Medicamento | Dose |
|-------------|------|
| Rivaroxabana | 20mg/dia (15mg se ClCr 30-49) |
| Apixabana | 5mg 2x (2.5mg 2x se critérios redução) |
| Dabigatrana | 150mg 2x (110mg 2x se > 80 anos) |

**Controle de Frequência:**
Meta FC: < 110 bpm em repouso
- Betabloqueador (Metoprolol, Bisoprolol)
- Se IC: Betabloqueador ou Digoxina
- Se CI BB: BCC (Diltiazem, Verapamil) - NÃO em IC`,
  },
  {
    id: 'hipotireoidismo',
    category: 'chronicDisease',
    labelKey: 'subtemplate.hipotireoidismo',
    specialties: ['Endocrinologia e Metabologia', 'Clínica Médica', 'Medicina da Família e Comunidade'],
    content: `## Hipotireoidismo - Acompanhamento

**Perfil Tireoidiano:**

| Condição | TSH | T4 Livre |
|----------|-----|----------|
| Eutireoidismo | 0.4-4.0 mUI/L | 0.9-1.7 ng/dL |
| Hipotireoidismo Primário | ↑ | ↓ ou normal (subclínico) |
| Hipotireoidismo Central | ↓ ou normal | ↓ |

**Quando tratar hipotireoidismo subclínico:**
- TSH > 10 mUI/L
- Sintomas presentes
- Gestantes ou tentando engravidar
- Anti-TPO positivo
- Dislipidemia

**Levotiroxina (T4):**
- Adultos jovens, saudáveis: 1.6 mcg/kg/dia
- Idosos ou cardiopatas: 25-50 mcg/dia (titular lentamente)
- Ajuste: 12.5-25 mcg a cada 6-8 semanas conforme TSH
- Meta TSH geral: 0.5-2.5 mUI/L
- Meta idosos > 70 anos: até 4-6 mUI/L aceitável

**Orientações:**
- Tomar em JEJUM (30-60 min antes café)
- Longe de antiácidos, cálcio, ferro (mínimo 4h)
- Medicamento de uso contínuo/vitalício`,
  },
  {
    id: 'dpoc',
    category: 'chronicDisease',
    labelKey: 'subtemplate.dpoc',
    specialties: ['Pneumologia', 'Clínica Médica', 'Medicina da Família e Comunidade'],
    content: `## DPOC - Acompanhamento

**Espirometria:**
VEF1/CVF pós-BD: ___ (< 0.70 = DPOC)

**Classificação GOLD (VEF1 pós-BD):**

| Grau | VEF1 (% previsto) |
|------|-------------------|
| GOLD 1 (Leve) | ≥ 80% |
| GOLD 2 (Moderado) | 50-79% |
| GOLD 3 (Grave) | 30-49% |
| GOLD 4 (Muito Grave) | < 30% |

**Avaliação Combinada (ABE):**

| Grupo | Exacerbações/ano | mMRC/CAT |
|-------|-----------------|----------|
| A | 0-1 (sem hosp.) | mMRC 0-1, CAT < 10 |
| B | 0-1 (sem hosp.) | mMRC ≥ 2, CAT ≥ 10 |
| E (Exacerbador) | ≥ 2 OU ≥ 1 com hosp. | Qualquer |

**Tratamento:**
- Grupo A: BD curta duração SOS
- Grupo B: LABA ou LAMA monoterapia → se persistente: LABA + LAMA
- Grupo E: LABA + LAMA (1ª linha)
  - Se eosinófilos ≥ 300: LABA + LAMA + CI (tríplice)
  - Se eosinófilos < 100: Evitar CI, considerar Roflumilaste

**Outras Medidas:**
- Cessação tabágica (mais importante!)
- Vacinação: Influenza, Pneumocócica, COVID-19
- Reabilitação pulmonar
- O2 domiciliar se PaO2 ≤ 55 mmHg`,
  },
  {
    id: 'dislipidemia',
    category: 'chronicDisease',
    labelKey: 'subtemplate.dislipidemia',
    specialties: ['Cardiologia', 'Endocrinologia e Metabologia', 'Clínica Médica', 'Medicina da Família e Comunidade'],
    content: `## Dislipidemia - Acompanhamento

**Perfil Lipídico:**

| Parâmetro | Desejável | Limítrofe | Alto |
|-----------|-----------|-----------|------|
| CT | < 190 | 190-239 | ≥ 240 |
| LDL-c | < 100 | 100-129 | ≥ 130 |
| HDL-c | > 60 | 40-59 | < 40 |
| TG | < 150 | 150-199 | ≥ 200 |

**Metas por Risco CV:**

| Risco CV | Meta LDL |
|----------|----------|
| Muito Alto (DCV prévia, DM+LOA) | < 50 mg/dL |
| Alto (DM sem LOA, DRC G3-4) | < 70 mg/dL |
| Moderado | < 100 mg/dL |
| Baixo | < 116 mg/dL |

**Estatinas:**

| Potência | Medicamento | Dose | Redução LDL |
|----------|-------------|------|-------------|
| Alta | Atorvastatina | 40-80mg | 50-60% |
| Alta | Rosuvastatina | 20-40mg | 50-60% |
| Moderada | Sinvastatina | 20-40mg | 30-50% |

**Se meta não atingida:**
1ª: Ezetimiba 10mg (+15-20%)
2ª: Inibidor PCSK9 (+50-60%)

**Hipertrigliceridemia (TG ≥ 500):**
- Ciprofibrato 100mg ou Fenofibrato 200mg`,
  },
  {
    id: 'obesidade',
    category: 'chronicDisease',
    labelKey: 'subtemplate.obesidade',
    specialties: ['Endocrinologia e Metabologia', 'Clínica Médica', 'Medicina da Família e Comunidade'],
    content: `## Obesidade e Síndrome Metabólica

**Classificação por IMC:**

| IMC (kg/m²) | Classificação |
|-------------|---------------|
| < 18.5 | Baixo peso |
| 18.5-24.9 | Normal |
| 25-29.9 | Sobrepeso |
| 30-34.9 | Obesidade I |
| 35-39.9 | Obesidade II |
| ≥ 40 | Obesidade III |

**CA (risco CV aumentado):**
- Homens: ≥ 94 cm / ≥ 102 cm (muito aumentado)
- Mulheres: ≥ 80 cm / ≥ 88 cm (muito aumentado)

**Síndrome Metabólica (≥ 3 critérios):**
- [ ] CA aumentada
- [ ] Triglicerídeos ≥ 150 mg/dL
- [ ] HDL < 40 (H) ou < 50 (M)
- [ ] PA ≥ 130/85 mmHg
- [ ] Glicemia jejum ≥ 100 mg/dL

**Tratamento Farmacológico (IMC ≥30 ou ≥27 + comorbidade):**

| Medicamento | Dose | Perda peso esperada |
|-------------|------|---------------------|
| Semaglutida (Wegovy) | 2.4mg SC/sem | 15-17% |
| Tirzepatida (Mounjaro) | 5-15mg SC/sem | 20-25% |
| Liraglutida (Saxenda) | 3mg SC/dia | 8-10% |
| Orlistate | 120mg 3x/dia | 3-5% |

**Cirurgia Bariátrica:**
- IMC ≥ 40 ou ≥ 35 com comorbidades
- Falha de tratamento clínico por 2 anos`,
  },

  // ═══════════════════════════════════════════════════════════
  // SAÚDE MENTAL
  // ═══════════════════════════════════════════════════════════
  {
    id: 'depressao',
    category: 'mentalHealth',
    labelKey: 'subtemplate.depressao',
    specialties: ['Psiquiatria', 'Clínica Médica', 'Medicina da Família e Comunidade'],
    content: `## Depressão - Avaliação

**Subjetivo:**
Paciente refere/nega:
[ ] Humor deprimido
[ ] Perda de interesse/prazer (anedonia)
[ ] Alteração de peso/apetite
[ ] Insônia/hipersonia
[ ] Agitação/retardo psicomotor
[ ] Fadiga
[ ] Sentimentos de inutilidade/culpa
[ ] Dificuldade de concentração
[ ] Pensamentos de morte

Duração dos sintomas: ___
Fatores desencadeantes: ___
Tratamentos prévios: ___

**PHQ-9 - Interpretação:**

| Pontuação | Classificação | Conduta |
|-----------|---------------|---------|
| 0-4 | Sem depressão/mínima | Acompanhamento |
| 5-9 | Leve | Psicoterapia |
| 10-14 | Moderada | Antidepressivo + Psicoterapia |
| 15-19 | Moderadamente grave | Tratamento intensivo |
| 20-27 | Grave | Referência Psiquiatria |

**Exame do Estado Mental:**
Orientação: [ ] Tempo [ ] Espaço
Memória: [ ] Imediata [ ] Recente [ ] Remota
Humor: ___ | Afeto: ___
Pensamento: Curso ___ | Conteúdo ___
Sensopercepção: [ ] Sem alucinações
Ideação suicida: [ ] Ausente [ ] Presente → [ ] Plano [ ] Intenção

**Antidepressivos de 1ª Linha:**

| Medicamento | Dose inicial | Dose terapêutica |
|-------------|--------------|------------------|
| Sertralina | 50mg/dia | 50-200mg |
| Escitalopram | 10mg/dia | 10-20mg |
| Fluoxetina | 20mg/dia | 20-60mg |
| Venlafaxina | 75mg/dia | 75-225mg |
| Bupropiona | 150mg/dia | 150-300mg |

**Orientações:**
- Início de ação: 2-4 semanas
- Manter tratamento por mínimo 6-12 meses após remissão
- Suspensão gradual (desmame)`,
  },
  {
    id: 'ansiedade',
    category: 'mentalHealth',
    labelKey: 'subtemplate.ansiedade',
    specialties: ['Psiquiatria', 'Clínica Médica', 'Medicina da Família e Comunidade'],
    content: `## Transtorno de Ansiedade Generalizada (TAG)

**Critérios:**
- Ansiedade/preocupação excessiva por > 6 meses
- Dificuldade em controlar preocupações
- ≥ 3 sintomas somáticos:
  [ ] Inquietação
  [ ] Fadiga
  [ ] Dificuldade de concentração
  [ ] Irritabilidade
  [ ] Tensão muscular
  [ ] Alteração do sono

**Tratamento:**
- 1ª linha: ISRS (Sertralina, Escitalopram)
- Buspirona 10-30mg/dia
- Benzodiazepínicos (curto prazo, se necessário)
- TCC (Terapia Cognitivo-Comportamental)`,
  },

  // ═══════════════════════════════════════════════════════════
  // DOENÇAS AGUDAS
  // ═══════════════════════════════════════════════════════════
  {
    id: 'itu',
    category: 'acuteDisease',
    labelKey: 'subtemplate.itu',
    specialties: ['Urologia', 'Clínica Médica', 'Medicina da Família e Comunidade', 'Nefrologia'],
    content: `## Infecção Urinária (ITU)

**Subjetivo:**
Paciente refere:
[ ] Dor/pressão supra-púbica
[ ] Disúria
[ ] Urgência urinária
[ ] Polaciúria
[ ] Hematúria

Nega/refere:
[ ] Febre
[ ] Náuseas/vômitos
[ ] Dor lombar
[ ] Mal-estar geral

Fatores de risco: [ ] Sexo feminino [ ] Atividade sexual recente
                  [ ] Diabetes [ ] Cateter vesical [ ] ITU prévia

**Objetivo:**
Estado Geral: BEG, LOC, eupneico, MUC
PA: ___ | SatO2: ___ | FC: ___ | Tax: ___
Abdome: Indolor à palpação
Sinal de Giordano: [ ] Negativo [ ] Positivo à D/E

**Classificação:**

| Tipo | Características | Conduta |
|------|-----------------|---------|
| Não complicada | Mulher pré-menopausa, não grávida | Ambulatorial |
| Complicada | Homem, gestante, DM, alteração urológica | Avaliar internação |
| Pielonefrite | Febre + Giordano + dor lombar | Internação/ATB IV |

**Tratamento ITU Não Complicada:**

| Antibiótico | Dose | Duração |
|-------------|------|---------|
| Nitrofurantoína | 100mg 6/6h | 5 dias |
| Fosfomicina | 3g dose única | 1 dia |
| Norfloxacino | 400mg 12/12h | 3 dias |
| Cefalexina | 500mg 6/6h | 7 dias |

**Orientações:**
- Hidratação adequada
- Sinais de alerta: febre, dor lombar, piora clínica`,
  },
  {
    id: 'crise_asma',
    category: 'acuteDisease',
    labelKey: 'subtemplate.criseAsma',
    specialties: ['Pneumologia', 'Clínica Médica', 'Medicina da Família e Comunidade', 'Pediatria'],
    content: `## Crise de Asma / Exacerbação

**Subjetivo:**
Paciente asmático comparece com:
[ ] Sibilos
[ ] Tosse
[ ] Aperto no peito
[ ] Dispneia aos esforços

Uso de bombinha (SABA): [ ] Sim, ___x nas últimas 24h [ ] Não
Adesão ao tratamento de manutenção: [ ] Boa [ ] Ruim
Gatilhos: [ ] Tabaco [ ] Alérgenos [ ] Infecção viral [ ] Exercício

**Objetivo:**
SatO2: ___% | FR: ___irpm | FC: ___bpm
Uso de musculatura acessória: [ ] Ausente [ ] Presente
Tiragem intercostal: [ ] Ausente [ ] Presente
AR: MV [presente/diminuído/abolido] | RA: [ ] Sibilos

**Classificação de Gravidade:**

| Parâmetro | Leve | Moderada | Grave | Muito Grave |
|-----------|------|----------|-------|-------------|
| Fala | Frases completas | Frases interrompidas | Palavras | Não consegue |
| SatO2 | > 95% | 92-95% | < 92% | < 90% |
| FR | Normal | Aumentada | > 30 | > 40 |
| Consciência | Normal | Agitado | Muito agitado | Sonolento |

**MUITO GRAVE = EMERGÊNCIA IMEDIATA**

**Tratamento de Resgate (1ª Hora):**
1. SALBUTAMOL (100mcg) via espaçador:
   - Dose: 1 jato/4kg (máx 10 jatos)
   - A cada 20 min por 1 hora

2. CORTICOIDE ORAL:
   - Prednisona/Prednisolona 1-2 mg/kg (máx 40mg)
   - Dose única VO

3. OXIGÊNIO: Manter SatO2 94-98%

**Pós-Crise:**
- SABA SOS ou CI+LABA conforme GINA
- Corticoide oral: 3-5 dias
- Reavaliação obrigatória em até 7 dias`,
  },
  {
    id: 'lombalgia',
    category: 'acuteDisease',
    labelKey: 'subtemplate.lombalgia',
    specialties: ['Ortopedia e Traumatologia', 'Clínica Médica', 'Medicina da Família e Comunidade', 'Reumatologia'],
    content: `## Lombalgia

**Subjetivo:**
Refere dor lombar [em pontada/facada/peso], [com/sem] irradiação
há [xx dias/meses], de intensidade ___/10.

[Nega/refere] desencadeante ou trauma prévio
[Nega/refere] episódios prévios semelhantes
[Nega/refere] dormência ou perda de força em MMII
[Nega/refere] incontinência urinária ou fecal

**Red Flags (Sinais de Alerta):**

| Sinal de Alerta | Suspeitar de |
|-----------------|--------------|
| Dor > 4 semanas | Neoplasia/Metástase |
| Perda de peso inexplicada | Neoplasia |
| Extremos de idade (< 20 ou > 55) | Tumor, Fratura |
| Trauma prévio significativo | Fratura |
| Dor noturna que não melhora com repouso | Tumor, Infecção |
| Febre persistente + sudorese noturna | Infecção |
| Déficit neurológico | Compressão radicular |
| **Retenção urinária/fecal + anestesia em sela** | **SÍNDROME DA CAUDA EQUINA** |

**Exame Físico:**
Mobilidade ativa: [com/sem] flexão, extensão, rotação
Palpação paravertebral: [sem/com] contraturas musculares
Força MMII: [preservada/diminuída]
Sensibilidade MMII: [preservada/diminuída]

**Manobras Especiais:**

| Manobra | Positivo indica |
|---------|-----------------|
| Lasègue (elevar perna 30-45°) | Radiculopatia L4-S1 |
| Lasègue cruzado | Alta especificidade para hérnia |
| Schober (flexão lombar) | Anquilosante se aumento < 5cm |

**Tratamento:**

| Classe | Medicamento | Dose | Duração |
|--------|-------------|------|---------|
| Analgésico | Paracetamol | 500-1000mg 6/6h | 5-7 dias |
| AINE | Ibuprofeno | 400-600mg 8/8h | 5-7 dias |
| Relaxante | Ciclobenzaprina | 5-10mg à noite | 5-7 dias |

- NÃO realizar repouso absoluto
- Manter atividades dentro do tolerável
- Aplicar calor local`,
  },
  {
    id: 'sintomas_resp',
    category: 'acuteDisease',
    labelKey: 'subtemplate.sintomasResp',
    specialties: ['Clínica Médica', 'Medicina da Família e Comunidade', 'Pneumologia'],
    content: `## Sintomas Respiratórios - Avaliação

[ ] Tosse (seca/produtiva)
[ ] Coriza
[ ] Odinofagia
[ ] Dispneia
[ ] Febre
[ ] Mialgia

Tempo de evolução: ___

**Sinais de alarme:**
[ ] SpO2 < 94%
[ ] FR > 24 irpm
[ ] Tiragem intercostal
[ ] Cianose
[ ] Alteração de consciência`,
  },
  {
    id: 'dor_abdominal',
    category: 'acuteDisease',
    labelKey: 'subtemplate.dorAbdominal',
    specialties: ['Clínica Médica', 'Medicina da Família e Comunidade', 'Gastroenterologia'],
    content: `## Dor Abdominal - Avaliação

Localização: [ ] Epigástrio [ ] Periumbilical [ ] FID [ ] FIE [ ] Hipocôndrios
Irradiação: ___
Característica: [ ] Cólica [ ] Em aperto [ ] Queimação
Fatores de melhora/piora: ___
Sintomas associados: [ ] Náusea [ ] Vômito [ ] Diarreia [ ] Constipação

**Sinais de alarme:**
[ ] Rigidez abdominal
[ ] Sinal de Blumberg
[ ] Febre alta
[ ] Hematêmese/Melena
[ ] Icterícia`,
  },
  {
    id: 'feridas',
    category: 'acuteDisease',
    labelKey: 'subtemplate.feridas',
    specialties: ['Clínica Médica', 'Medicina da Família e Comunidade'],
    content: `## Feridas - Avaliação

Tipo: [ ] Traumática [ ] Cirúrgica [ ] Pressão [ ] Venosa [ ] Arterial [ ] Diabética
Localização: ___
Dimensões: ___ x ___ cm
Profundidade: [ ] Superficial [ ] Parcial [ ] Total

Leito:
[ ] Granulação (vermelho)
[ ] Fibrina (amarelo)
[ ] Necrose (preto)
[ ] Esfacelo

Exsudato: [ ] Ausente [ ] Pouco [ ] Moderado [ ] Abundante
Bordas: [ ] Regulares [ ] Irregulares [ ] Maceradas
Pele perilesional: ___

**Coberturas (Curativos):**

| Tipo | Indicação | Troca |
|------|-----------|-------|
| AGE | Ferida limpa, granulação | Diária |
| Hidrocoloide | Lesão superficial, pouco exsudato | 3-7 dias |
| Hidrogel | Debridamento autolítico | 24-72h |
| Alginato de cálcio | Moderado/alto exsudato | 24-48h |
| Carvão ativado | Ferida infectada, odor | 24-48h |
| Colagenase | Debridamento enzimático | Diária |
| Sulfadiazina de prata | Queimaduras | 12-24h |`,
  },

  // ═══════════════════════════════════════════════════════════
  // DERMATOLOGIA
  // ═══════════════════════════════════════════════════════════
  {
    id: 'acne',
    category: 'dermatology',
    labelKey: 'subtemplate.acne',
    specialties: ['Dermatologia', 'Medicina da Família e Comunidade'],
    content: `## Acne Vulgar

**Classificação:**

| Grau | Descrição | Tratamento |
|------|-----------|------------|
| I (Comedoniana) | Comedões abertos/fechados | Tretinoína tópica |
| II (Pápulo-pustulosa) | Pápulas, pústulas | + Peróxido de benzoíla ou ATB tópico |
| III (Nódulo-cística) | Nódulos, cistos | ATB oral (Doxiciclina 100mg/dia) |
| IV (Conglobata) | Abscessos, fístulas | Isotretinoína oral |

**Tratamento Tópico:**

| Medicamento | Concentração | Aplicação |
|-------------|--------------|-----------|
| Tretinoína | 0.025-0.1% | Noite |
| Adapaleno | 0.1-0.3% | Noite |
| Peróxido de benzoíla | 2.5-10% | 1-2x/dia |
| Clindamicina | 1% | 2x/dia |
| Ácido azelaico | 15-20% | 2x/dia |

Evitar ATB tópico isolado (resistência). Preferir combinações.`,
  },
  {
    id: 'micoses',
    category: 'dermatology',
    labelKey: 'subtemplate.micoses',
    specialties: ['Dermatologia', 'Medicina da Família e Comunidade'],
    content: `## Micoses Superficiais

**Tinea (Dermatofitose):**

| Local | Nome | Tratamento |
|-------|------|------------|
| Pés | Tinea pedis | Terbinafina creme 2 sem |
| Corpo | Tinea corporis | Antifúngico tópico 2-4 sem |
| Virilha | Tinea cruris | Antifúngico tópico 2-4 sem |
| Couro cabeludo | Tinea capitis | Terbinafina VO 2-4 sem (obrigatório sistêmico) |
| Unhas | Onicomicose | Terbinafina VO 6-12 sem |

**Tratamento Antifúngico:**

| Via | Medicamento | Dose |
|-----|-------------|------|
| Tópico | Cetoconazol creme 2% | 2x/dia |
| Tópico | Terbinafina creme 1% | 1-2x/dia |
| Oral | Terbinafina | 250mg/dia |
| Oral | Itraconazol | 100-200mg/dia |
| Oral | Fluconazol | 150mg/semana |`,
  },
  {
    id: 'psoriase',
    category: 'dermatology',
    labelKey: 'subtemplate.psoriase',
    specialties: ['Dermatologia', 'Reumatologia'],
    content: `## Psoríase

**Classificação de Gravidade:**

| PASI/BSA | Gravidade | Tratamento |
|----------|-----------|------------|
| < 10 | Leve | Tópico |
| 10-20 | Moderada | Fototerapia + tópico |
| > 20 | Grave | Sistêmico |

**Tratamento Tópico:**
- Corticoide (Betametasona, Clobetasol)
- Calcipotriol (análogo vitamina D)
- Queratolíticos (ácido salicílico)

**Tratamento Sistêmico (grave):**

| Medicamento | Dose | Monitorar |
|-------------|------|-----------|
| Metotrexato | 7.5-25mg/sem | Hemograma, TGO/TGP |
| Acitretina | 25-50mg/dia | Lípides, TGO/TGP |
| Ciclosporina | 2.5-5mg/kg/dia | Creatinina, PA |`,
  },

  // ═══════════════════════════════════════════════════════════
  // GASTROENTEROLOGIA
  // ═══════════════════════════════════════════════════════════
  {
    id: 'drge',
    category: 'gastroenterology',
    labelKey: 'subtemplate.drge',
    specialties: ['Gastroenterologia', 'Clínica Médica', 'Medicina da Família e Comunidade'],
    content: `## DRGE - Doença do Refluxo Gastroesofágico

**Sintomas:**
- Típicos: Pirose, regurgitação
- Atípicos: Tosse crônica, disfonia, dor torácica

**Sinais de Alarme (EDA indicada):**
- Disfagia progressiva
- Odinofagia
- Perda de peso
- Anemia
- > 45-50 anos com sintomas novos

**Tratamento:**
MEDIDAS COMPORTAMENTAIS:
- Elevar cabeceira 15-20cm
- Evitar: gorduras, álcool, café, chocolate, menta
- Não deitar após refeições (mín 3h)
- Perda de peso se sobrepeso

FARMACOLÓGICO:
1ª linha: IBP dose padrão por 4-8 semanas
  - Omeprazol 20mg ou Pantoprazol 40mg em jejum

Se refratário: IBP dose dobrada (2x/dia)
Manutenção: menor dose eficaz ou uso sob demanda`,
  },
  {
    id: 'h_pylori',
    category: 'gastroenterology',
    labelKey: 'subtemplate.hPylori',
    specialties: ['Gastroenterologia', 'Clínica Médica', 'Medicina da Família e Comunidade'],
    content: `## Infecção por H. pylori

**Indicações de Tratamento:**
- Úlcera péptica ativa ou cicatrizada
- Linfoma MALT gástrico
- Pós-ressecção de câncer gástrico precoce
- Familiares de 1º grau com câncer gástrico

**Esquema de Erradicação (1ª linha - 14 dias):**
TERAPIA TRIPLA:
- Amoxicilina 1g 12/12h
- Claritromicina 500mg 12/12h
- Omeprazol 20mg 12/12h (ou outro IBP dose dobrada)
Duração: 14 dias

**Esquema Alternativo (alergia penicilina ou falha):**
TERAPIA QUÁDRUPLA COM BISMUTO:
- Subsalicilato de bismuto 524mg 6/6h
- Metronidazol 500mg 8/8h
- Tetraciclina 500mg 6/6h
- IBP dose dobrada
Duração: 10-14 dias

Confirmação de erradicação recomendada após 4 semanas.`,
  },
  {
    id: 'hepatites',
    category: 'gastroenterology',
    labelKey: 'subtemplate.hepatites',
    specialties: ['Gastroenterologia', 'Clínica Médica', 'Medicina da Família e Comunidade'],
    content: `## Hepatites Virais - Rastreamento

| Hepatite | Exame Inicial | Interpretação |
|----------|---------------|---------------|
| A | Anti-HAV IgM | Aguda |
| A | Anti-HAV Total | Imunidade |
| B | HBsAg | Infecção ativa |
| B | Anti-HBs | Imunidade (vacina ou cura) |
| B | Anti-HBc Total | Contato prévio |
| C | Anti-HCV | Contato; confirmar com HCV-RNA |

**Hepatite B Crônica:**
- HBsAg + por > 6 meses
- Tratar se: HBeAg+, ALT elevada, HBV-DNA > 2000, fibrose significativa
- Medicamentos: Entecavir, Tenofovir

**Hepatite C Crônica:**
Sofosbuvir 400mg + Velpatasvir 100mg OU Glecaprevir/Pibrentasvir
Duração: 8-12 semanas | Taxa de cura: > 95%`,
  },

  // ═══════════════════════════════════════════════════════════
  // NEUROLOGIA
  // ═══════════════════════════════════════════════════════════
  {
    id: 'cefaleia',
    category: 'neurology',
    labelKey: 'subtemplate.cefaleia',
    specialties: ['Neurologia', 'Clínica Médica', 'Medicina da Família e Comunidade'],
    content: `## Cefaleia - Avaliação

**Classificação:**

| Tipo | Características | Duração |
|------|-----------------|---------|
| Tensional | Bilateral, pressão, leve-moderada | 30 min - 7 dias |
| Enxaqueca | Unilateral, pulsátil, fotofobia, náuseas | 4-72 horas |
| Em salvas | Periorbital, lacrimejamento, rinorreia | 15-180 min |

**Red Flags (investigar com imagem):**
- Início súbito ("pior dor da vida")
- Alteração do padrão habitual
- Déficit neurológico
- Papiledema
- Febre + rigidez nuca
- Idade > 50 anos (início novo)

**Tratamento Agudo Enxaqueca:**

| Gravidade | Medicamento | Dose |
|-----------|-------------|------|
| Leve | AINE (Ibuprofeno, Naproxeno) | 400-600mg / 500mg |
| Moderada | AINE + Metoclopramida | + 10mg |
| Grave | Triptano (Sumatriptano) | 50-100mg VO / 6mg SC |

**Profilaxia (≥ 4 crises/mês):**

| Medicamento | Dose |
|-------------|------|
| Propranolol | 40-160mg/dia |
| Amitriptilina | 25-75mg à noite |
| Topiramato | 50-100mg/dia |`,
  },
  {
    id: 'epilepsia',
    category: 'neurology',
    labelKey: 'subtemplate.epilepsia',
    specialties: ['Neurologia', 'Clínica Médica'],
    content: `## Epilepsia

**Quando iniciar tratamento:**
- Após 2ª crise não provocada
- Após 1ª crise se: lesão estrutural, EEG anormal, déficit neurológico

**Anticonvulsivantes:**

| Tipo de Crise | 1ª Linha | Alternativa |
|---------------|----------|-------------|
| Focal | Carbamazepina, Lamotrigina | Levetiracetam, Oxcarbazepina |
| Generalizada TC | Ácido valproico, Lamotrigina | Levetiracetam |
| Ausência | Etossuximida, Ácido valproico | Lamotrigina |
| Mioclônica | Ácido valproico | Levetiracetam |

**Atenção Mulher em Idade Fértil:**
- EVITAR ácido valproico (teratogênico)
- Preferir: Lamotrigina, Levetiracetam
- Ácido fólico 5mg/dia`,
  },

  // ═══════════════════════════════════════════════════════════
  // ORL
  // ═══════════════════════════════════════════════════════════
  {
    id: 'oma',
    category: 'orl',
    labelKey: 'subtemplate.oma',
    specialties: ['Otorrinolaringologia', 'Pediatria', 'Medicina da Família e Comunidade', 'Clínica Médica'],
    content: `## Otite Média Aguda (OMA)

**Diagnóstico:**
- Otalgia de início súbito
- Abaulamento timpânico
- Otorreia (se perfuração)

**Tratamento:**

| Situação | Conduta |
|----------|---------|
| < 2 anos | ATB sempre |
| ≥ 2 anos, leve, unilateral | Observação 48-72h |
| Bilateral ou grave | ATB |

**Antibióticos:**
1ª linha: Amoxicilina 50mg/kg/dia 8/8h por 10 dias

Se falha após 48-72h ou ATB recente:
Amoxicilina + Clavulanato 45mg/kg/dia 12/12h

Alergia à penicilina:
Azitromicina 10mg/kg/dia por 5 dias`,
  },
  {
    id: 'rinossinusite',
    category: 'orl',
    labelKey: 'subtemplate.rinossinusite',
    specialties: ['Otorrinolaringologia', 'Clínica Médica', 'Medicina da Família e Comunidade'],
    content: `## Rinossinusite

**Diagnóstico Clínico (≥ 2 sintomas):**
- Obstrução nasal
- Rinorreia (anterior ou posterior)
- Dor/pressão facial
- Hiposmia

**Tratamento:**
VIRAL (maioria - até 10 dias):
- Sintomáticos: analgésicos, descongestionantes
- Lavagem nasal com SF
- Corticoide nasal

BACTERIANA (suspeitar se):
- Sintomas > 10 dias sem melhora
- Piora após melhora inicial ("second worsening")
- Sintomas graves (febre > 39°C, dor facial intensa)

ATB: Amoxicilina 500mg 8/8h por 7-10 dias
     Se falha: Amoxicilina + Clavulanato`,
  },
  {
    id: 'faringoamigdalite',
    category: 'orl',
    labelKey: 'subtemplate.faringoamigdalite',
    specialties: ['Otorrinolaringologia', 'Clínica Médica', 'Medicina da Família e Comunidade', 'Pediatria'],
    content: `## Faringoamigdalite

**Critérios de Centor (modificados):**

| Critério | Pontos |
|----------|--------|
| Febre > 38°C | +1 |
| Ausência de tosse | +1 |
| Adenomegalia cervical anterior | +1 |
| Exsudato tonsilar | +1 |
| Idade 3-14 anos | +1 |
| Idade ≥ 45 anos | -1 |

**Conduta baseada em Centor:**

| Score | Conduta |
|-------|---------|
| 0-1 | Viral provável → sintomático |
| 2-3 | Teste rápido strep ou cultura |
| ≥ 4 | Considerar ATB empírico |

**Tratamento EBHGA:**
1ª linha: Amoxicilina 500mg 8/8h por 10 dias
OU Penicilina Benzatina 1.200.000 UI IM dose única
Alergia: Azitromicina 500mg/dia por 5 dias`,
  },

  // ═══════════════════════════════════════════════════════════
  // REUMATOLOGIA
  // ═══════════════════════════════════════════════════════════
  {
    id: 'gota',
    category: 'rheumatology',
    labelKey: 'subtemplate.gota',
    specialties: ['Reumatologia', 'Clínica Médica', 'Medicina da Família e Comunidade'],
    content: `## Gota

**Diagnóstico:**
- Artrite aguda monoarticular (1ª MTF, tornozelo, joelho)
- Ácido úrico elevado (pode estar normal na crise)

**Tratamento da Crise:**
1ª linha:
- AINE (Naproxeno 500mg 12/12h) por 5-7 dias
- OU Colchicina 0.5mg 8/8h (iniciar < 12h da crise)

Se contraindicação AINE/Colchicina:
- Prednisona 30-40mg/dia por 5 dias

**NÃO iniciar/alterar alopurinol durante crise aguda**

**Tratamento Crônico:**

| Indicação | Meta | Medicamento |
|-----------|------|-------------|
| ≥ 2 crises/ano | Ácido úrico < 6 mg/dL | Alopurinol 100-800mg/dia |
| Tofos | Ácido úrico < 5 mg/dL | Iniciar 2-4 sem após crise |`,
  },
  {
    id: 'artrite_reumatoide',
    category: 'rheumatology',
    labelKey: 'subtemplate.artriteReumatoide',
    specialties: ['Reumatologia', 'Clínica Médica'],
    content: `## Artrite Reumatoide

**Diagnóstico (ACR/EULAR 2010):**
- Artrite simétrica, pequenas articulações (MCF, IFP, punhos)
- Rigidez matinal > 1 hora
- FR e/ou Anti-CCP positivos
- VHS/PCR elevados

| Exame | Sensibilidade | Especificidade |
|-------|---------------|----------------|
| Fator Reumatoide (FR) | 60-80% | 60-70% |
| Anti-CCP | 50-70% | 90-95% |

**Tratamento:**
DMARD convencional (1ª linha):
- Metotrexato 7.5mg/sem → aumentar até 25mg/sem
- + Ácido fólico 5mg (24-48h após MTX)

Se contraindicação MTX:
- Leflunomida 20mg/dia
- Sulfassalazina 1-3g/dia

Biológico (falha DMARD convencional):
- Anti-TNF: Adalimumabe, Etanercepte
- Anti-IL6: Tocilizumabe
- Inibidor JAK: Tofacitinibe, Baricitinibe

**Monitorização MTX:**
- Hemograma, TGO/TGP a cada 4-8 semanas inicialmente`,
  },

  // ═══════════════════════════════════════════════════════════
  // OFTALMOLOGIA
  // ═══════════════════════════════════════════════════════════
  {
    id: 'conjuntivite',
    category: 'ophthalmology',
    labelKey: 'subtemplate.conjuntivite',
    specialties: ['Oftalmologia', 'Clínica Médica', 'Medicina da Família e Comunidade', 'Pediatria'],
    content: `## Conjuntivite

**Diagnóstico Diferencial:**

| Tipo | Características | Tratamento |
|------|-----------------|------------|
| Viral | Bilateral sequencial, lacrimejamento | Suporte, compressas frias |
| Bacteriana | Secreção purulenta, uni/bilateral | ATB tópico |
| Alérgica | Prurido intenso, bilateral, atopia | Anti-histamínico tópico |

**Tratamento Bacteriana:**
1ª linha: Tobramicina 0.3% ou Ciprofloxacino 0.3%
         1 gota 4x/dia por 5-7 dias

Se severa: Moxifloxacino 0.5% 1 gota 3x/dia

**Red Flags (Encaminhar Oftalmologista):**
- Dor ocular intensa
- Alteração visual
- Fotofobia
- Opacidade corneana
- Uso de lentes de contato`,
  },

  // ═══════════════════════════════════════════════════════════
  // CIRURGIA GERAL
  // ═══════════════════════════════════════════════════════════
  {
    id: 'pre_operatorio',
    category: 'surgery',
    labelKey: 'subtemplate.preOperatorio',
    specialties: ['Cirurgia Geral'],
    content: `## Avaliação Pré-Operatória

**Procedimento Proposto:**

**Classificação ASA:**
- [ ] ASA I - Saudável
- [ ] ASA II - Doença sistêmica leve
- [ ] ASA III - Doença sistêmica grave
- [ ] ASA IV - Doença sistêmica grave com ameaça à vida

**Comorbidades Relevantes:**
- Cardiopatia:
- Pneumopatia:
- Diabetes:
- Coagulopatia:
- Nefropatia:
- Hepatopatia:

**Medicações em Uso:**
(especialmente anticoagulantes, antiagregantes, hipoglicemiantes)

**Alergias:** (incluir látex e anestésicos)

**Exames Pré-Operatórios:**

| Exame | Resultado | Data |
|-------|-----------|------|
| Hemograma | | |
| Coagulograma (TP, TTPa) | | |
| Glicemia | | |
| Creatinina/Ureia | | |
| ECG | | |
| RX Tórax | | |

**Risco Cirúrgico Cardiológico:**
- Goldman / Lee (RCRI):

**Jejum:** __ horas
**Reserva de sangue:** Sim ( ) Não ( ) Tipagem:
**TCLE assinado:** Sim ( ) Não ( )

**Orientações Pré-Operatórias:**
- Jejum de 8h para sólidos, 2h para líquidos claros
- Suspender anticoagulantes conforme protocolo
- Banho com clorexidina na véspera e manhã da cirurgia
- Trazer exames e TCLE no dia`,
  },
  {
    id: 'pos_operatorio',
    category: 'surgery',
    labelKey: 'subtemplate.posOperatorio',
    specialties: ['Cirurgia Geral'],
    content: `## Evolução Pós-Operatória

**Procedimento Realizado:**
**Data da Cirurgia:** | **DPO (Dia Pós-Operatório):**

**Avaliação Subjetiva:**
- Dor (EAV 0-10):
- Náuseas/vômitos:
- Aceitação de dieta:
- Eliminação de flatos: Sim ( ) Não ( )
- Evacuação: Sim ( ) Não ( )
- Diurese:
- Deambulação: Sim ( ) Não ( )

**Exame Físico:**
- Estado geral:
- Sinais vitais: PA __ FC __ FR __ Tax __ SatO2 __
- Abdome: distensão ( ) RHA ( ) dor à palpação ( )
- Ferida operatória: limpa ( ) hiperemiada ( ) com secreção ( )
- Drenos: débito __mL, aspecto:
- MMII: edema ( ) sinais de TVP ( )

**Exames de Controle:**

| Exame | Resultado | Referência |
|-------|-----------|------------|
| Hemoglobina | | 12-16 g/dL |
| Leucócitos | | 4.000-11.000 |
| PCR | | <5 mg/L |

**Classificação Clavien-Dindo (se complicação):**
- [ ] Grau I - Desvio do PO normal sem necessidade de tratamento
- [ ] Grau II - Necessidade de tratamento farmacológico
- [ ] Grau III - Necessidade de intervenção cirúrgica/endoscópica/radiológica
- [ ] Grau IV - Complicação com risco de vida (UTI)
- [ ] Grau V - Óbito

**Conduta:**
- Dieta:
- Analgesia:
- Profilaxia TVP:
- Cuidados com FO:
- Previsão de alta:`,
  },
  {
    id: 'hernia_inguinal',
    category: 'surgery',
    labelKey: 'subtemplate.herniaInguinal',
    specialties: ['Cirurgia Geral'],
    content: `## Hérnia Inguinal - Avaliação

**Classificação Nyhus:**
- [ ] Tipo I - Indireta, anel inguinal interno normal
- [ ] Tipo II - Indireta, anel inguinal interno dilatado
- [ ] Tipo IIIA - Direta
- [ ] Tipo IIIB - Indireta com parede posterior fraca
- [ ] Tipo IIIC - Femoral
- [ ] Tipo IV - Recidivada

**Lateralidade:** D ( ) E ( ) Bilateral ( )

**Exame Físico:**
- Abaulamento inguinal: repouso ( ) esforço ( )
- Redutível: Sim ( ) Não ( )
- Manobra de Valsalva:
- Sinais de encarceramento: dor intensa ( ) irredutibilidade ( ) sinais flogísticos ( )
- Sinais de estrangulamento: toxemia ( ) irritação peritoneal ( )

**Indicação Cirúrgica:**
- [ ] Eletiva - hérnia sintomática
- [ ] Urgência - hérnia encarcerada

**Procedimento Proposto:**
- [ ] Hernioplastia inguinal aberta (Lichtenstein)
- [ ] Hernioplastia videolaparoscópica (TEP/TAPP)

**Orientações:**
- Evitar esforço físico por 30 dias no pós-operatório
- Retorno às atividades leves em 7-14 dias
- Retorno ao trabalho pesado em 30-45 dias`,
  },
  {
    id: 'colecistectomia',
    category: 'surgery',
    labelKey: 'subtemplate.colecistectomia',
    specialties: ['Cirurgia Geral'],
    content: `## Colelitíase / Colecistectomia - Avaliação

**Quadro Clínico:**
- Dor em HCD / epigástrio:
- Relação com alimentação gordurosa:
- Murphy:
- Sinal de Murphy ao USG:

**Classificação de Tokyo (se colecistite aguda):**
- [ ] Grau I (leve) - sem disfunção orgânica
- [ ] Grau II (moderada) - leucocitose >18.000, massa palpável, >72h evolução
- [ ] Grau III (grave) - disfunção orgânica

**Exames de Imagem:**
- USG abdome: cálculos ( ) parede vesicular __mm, Murphy sonográfico ( ), colédoco __mm
- Laboratório: BT/BD, FA, GGT, TGO, TGP, amilase, lipase

**Indicação:**
- [ ] Colecistectomia videolaparoscópica eletiva (colelitíase sintomática)
- [ ] Colecistectomia videolaparoscópica de urgência (colecistite aguda)
- [ ] CPRE pré-operatória (se coledocolitíase)

**Critérios de conversão para via aberta:**
- Aderências firmes, anatomia não identificável, sangramento, lesão de via biliar

**Orientações Pré-Operatórias:**
- Jejum de 8h
- Antibioticoprofilaxia: Cefazolina 2g IV na indução`,
  },

  // ═══════════════════════════════════════════════════════════
  // GERIATRIA
  // ═══════════════════════════════════════════════════════════
  {
    id: 'aga',
    category: 'geriatrics',
    labelKey: 'subtemplate.aga',
    specialties: ['Geriatria', 'Medicina da Família e Comunidade'],
    content: `## Avaliação Geriátrica Ampla (AGA)

### Funcionalidade

**AVDs - Índice de Katz** (0-6):
- [ ] Banho
- [ ] Vestir-se
- [ ] Higiene pessoal
- [ ] Transferência
- [ ] Continência
- [ ] Alimentação
**Escore:** __/6

**AIVDs - Escala de Lawton-Brody** (9-27):
- Usar telefone: __ (1-3)
- Fazer compras: __ (1-3)
- Preparo de alimentos: __ (1-3)
- Tarefas domésticas: __ (1-3)
- Lavanderia: __ (1-3)
- Transporte: __ (1-3)
- Medicações: __ (1-3)
- Finanças: __ (1-3)
- Trabalho manual doméstico: __ (1-3)
**Escore:** __/27

### Cognição

**MEEM (Mini Exame do Estado Mental):**
- Orientação temporal: __/5
- Orientação espacial: __/5
- Registro (3 palavras): __/3
- Atenção e cálculo: __/5
- Evocação: __/3
- Linguagem: __/8
- Praxia: __/1
**Escore total:** __/30 (Ponto de corte: analfabeto ≥20, 1-4 anos ≥25, 5-8 anos ≥26, 9-11 anos ≥28, >11 anos ≥29)

**Teste do Relógio:** __/5

### Humor

**GDS-15 (Escala de Depressão Geriátrica):** __/15
(≥5 pontos: sugere depressão | ≥11: depressão grave)

### Mobilidade e Equilíbrio

**TUG (Timed Up and Go):** __ segundos
(<10s: normal | 10-20s: risco leve | >20s: alto risco de quedas)

**Quedas nos últimos 12 meses:** __
**Medo de cair:** Sim ( ) Não ( )

### Estado Nutricional
- Peso: __ kg | Altura: __ m | IMC: __
- Perda ponderal: __ kg em __ meses
- Circunferência da panturrilha: __ cm (<31cm: risco sarcopenia)

### Sensorial
- Acuidade visual:
- Acuidade auditiva: Teste do sussurro ( )

### Continência
- Incontinência urinária: Sim ( ) Não ( ) | Tipo:
- Incontinência fecal: Sim ( ) Não ( )

### Suporte Social
- Mora: sozinho ( ) com familiar ( ) ILPI ( )
- Cuidador: Sim ( ) Não ( ) | Quem:
- Rede de apoio:`,
  },
  {
    id: 'polifarmacia',
    category: 'geriatrics',
    labelKey: 'subtemplate.polifarmacia',
    specialties: ['Geriatria', 'Medicina da Família e Comunidade'],
    content: `## Revisão de Polifarmácia e Reconciliação Medicamentosa

**Número total de medicamentos:** __
**Polifarmácia:** ( ) ≥5 medicamentos

### Lista de Medicamentos Atual

| Medicamento | Dose | Posologia | Indicação | Beers/STOPP |
|-------------|------|-----------|-----------|-------------|
| | | | | |
| | | | | |
| | | | | |
| | | | | |
| | | | | |

### Critérios de Beers - Medicações Potencialmente Inapropriadas (MPI)

**Benzodiazepínicos (evitar em idosos):**
- Risco: sedação excessiva, quedas, delirium, dependência

**Anticolinérgicos (evitar em idosos):**
- Amitriptilina, nortriptilina, oxibutinina, prometazina
- Risco: confusão mental, retenção urinária, constipação, boca seca

**AINEs de uso crônico (evitar):**
- Risco: sangramento GI, nefrotoxicidade, descompensação cardíaca

**Critérios STOPP/START:**
- STOPP (medicações a suspender):
- START (medicações a iniciar):

### Interações Medicamentosas Relevantes

| Medicamento 1 | Medicamento 2 | Risco |
|---------------|---------------|-------|
| | | |

### Plano de Desprescrição

| Medicamento | Ação | Cronograma |
|-------------|------|------------|
| | Suspender / Reduzir / Trocar | |

**Orientações:**
- Organizar medicações em caixa organizadora semanal
- Agendar horários fixos para cada medicação
- Revisão medicamentosa a cada consulta`,
  },
  {
    id: 'prevencao_quedas',
    category: 'geriatrics',
    labelKey: 'subtemplate.prevencaoQuedas',
    specialties: ['Geriatria', 'Medicina da Família e Comunidade'],
    content: `## Avaliação de Risco de Quedas e Prevenção

**Fatores de Risco Intrínsecos:**
- [ ] Idade >75 anos
- [ ] Quedas prévias (últimos 12 meses): __
- [ ] Déficit visual
- [ ] Déficit auditivo
- [ ] Hipotensão ortostática (queda ≥20 mmHg PAS ou ≥10 mmHg PAD)
- [ ] Polifarmácia (≥5 medicamentos)
- [ ] Uso de psicotrópicos (BZD, antidepressivos, antipsicóticos)
- [ ] Déficit cognitivo (MEEM <24)
- [ ] Déficit de força em MMII
- [ ] Alteração de marcha/equilíbrio
- [ ] Incontinência urinária
- [ ] Dor articular / artrose

**Fatores de Risco Extrínsecos (Domicílio):**
- [ ] Tapetes soltos
- [ ] Iluminação inadequada
- [ ] Escadas sem corrimão
- [ ] Banheiro sem barras de apoio
- [ ] Calçado inadequado
- [ ] Obstáculos no caminho

**Testes de Mobilidade:**
- TUG: __ segundos
- Equilíbrio unipodálico: __ segundos (normal >5s)
- Velocidade de marcha: __ m/s (normal >0.8 m/s)
- Hipotensão postural: PA deitado __ x __ | PA em pé __ x __

**Conduta Preventiva:**
- Exercícios de equilíbrio e fortalecimento (fisioterapia)
- Revisão medicamentosa (reduzir/retirar psicotrópicos)
- Adaptação ambiental domiciliar
- Correção visual
- Suplementação de vitamina D (se deficiente)
- Calçado adequado (fechado, solado antiderrapante)
- Protetor de quadril (se alto risco de fratura)`,
  },

  // ═══════════════════════════════════════════════════════════
  // HEMATOLOGIA
  // ═══════════════════════════════════════════════════════════
  {
    id: 'anemia',
    category: 'hematology',
    labelKey: 'subtemplate.anemia',
    specialties: ['Hematologia e Hemoterapia', 'Clínica Médica', 'Medicina da Família e Comunidade'],
    content: `## Investigação de Anemia

**Classificação Morfológica (VCM):**
- [ ] Microcítica (VCM <80): ferropriva, talassemia, doença crônica
- [ ] Normocítica (VCM 80-100): doença crônica, hemolítica, sangramento agudo
- [ ] Macrocítica (VCM >100): megaloblástica (B12/folato), hepatopatia, hipotireoidismo

**Hemograma:**

| Parâmetro | Resultado | Referência |
|-----------|-----------|------------|
| Hemoglobina | | H: 13-17 / M: 12-16 g/dL |
| Hematócrito | | H: 40-54% / M: 36-48% |
| VCM | | 80-100 fL |
| HCM | | 27-33 pg |
| RDW | | 11.5-14.5% |
| Reticulócitos | | 0.5-2.5% |
| Leucócitos | | 4.000-11.000 |
| Plaquetas | | 150.000-450.000 |

**Perfil de Ferro:**

| Exame | Resultado | Referência |
|-------|-----------|------------|
| Ferro sérico | | 60-170 mcg/dL |
| Ferritina | | H: 30-300 / M: 20-200 ng/mL |
| TIBC (CTLF) | | 250-370 mcg/dL |
| Saturação de transferrina | | 20-50% |

**Outros Exames:**
- Vitamina B12: (ref: >300 pg/mL)
- Ácido fólico: (ref: >5 ng/mL)
- DHL:
- Bilirrubinas (direta/indireta):
- Haptoglobina:
- Coombs direto:
- Eletroforese de hemoglobina:

**Diagnóstico Etiológico:**

**Tratamento:**
- Ferropriva: Sulfato ferroso __ mg/dia (60-200mg Fe elementar) por __meses
- Megaloblástica: B12 1000mcg IM __x/semana | Ácido fólico 5mg/dia
- Doença crônica: tratar causa base`,
  },
  {
    id: 'anticoagulacao',
    category: 'hematology',
    labelKey: 'subtemplate.anticoagulacao',
    specialties: ['Hematologia e Hemoterapia', 'Cardiologia', 'Clínica Médica'],
    content: `## Manejo de Anticoagulação

**Indicação da Anticoagulação:**
- [ ] FA não-valvar (CHA2DS2-VASc ≥2 H / ≥3 M)
- [ ] TEV (TVP / TEP)
- [ ] Prótese valvar mecânica
- [ ] Trombofilia
- [ ] Outro:

**CHA2DS2-VASc (se FA):**
- [ ] C - IC / Disfunção VE (+1)
- [ ] H - HAS (+1)
- [ ] A2 - Idade ≥75 (+2)
- [ ] D - DM (+1)
- [ ] S2 - AVC/AIT/TEV prévio (+2)
- [ ] V - Doença vascular (+1)
- [ ] A - Idade 65-74 (+1)
- [ ] Sc - Sexo feminino (+1)
**Escore:** __

**HAS-BLED (risco de sangramento):**
- [ ] H - HAS não controlada (+1)
- [ ] A - Função renal/hepática alterada (+1 cada)
- [ ] S - AVC prévio (+1)
- [ ] B - Sangramento prévio (+1)
- [ ] L - INR lábil (+1)
- [ ] E - Idade >65 (+1)
- [ ] D - Drogas/álcool (+1 cada)
**Escore:** __ (≥3: alto risco)

**Anticoagulante em Uso:**
- [ ] Varfarina - dose: __ mg/dia | INR alvo: __
- [ ] Rivaroxabana - dose: __
- [ ] Apixabana - dose: __
- [ ] Dabigatrana - dose: __
- [ ] Enoxaparina - dose: __

**Controle Laboratorial:**

| Data | INR/Anti-Xa | Hemoglobina | Creatinina | Plaquetas |
|------|-------------|-------------|------------|-----------|
| | | | | |

**Função Renal (ajuste de dose de DOACs):**
- ClCr (Cockcroft-Gault): __ mL/min
- Dabigatrana: CI se ClCr <30 | Rivaroxabana: ajuste se ClCr 15-49

**Sinais de Sangramento:**
- Maior: ( ) | Menor: ( ) | CRNM: ( )

**Orientações:**
- Não usar AINEs sem orientação médica
- Informar sobre anticoagulação em qualquer procedimento
- Pulseira/cartão de identificação de anticoagulado`,
  },
  {
    id: 'trombocitopenia',
    category: 'hematology',
    labelKey: 'subtemplate.trombocitopenia',
    specialties: ['Hematologia e Hemoterapia', 'Clínica Médica'],
    content: `## Investigação de Trombocitopenia

**Plaquetas:** __ /mm³
**Gravidade:**
- [ ] Leve: 100.000-150.000
- [ ] Moderada: 50.000-100.000
- [ ] Grave: 20.000-50.000
- [ ] Muito grave: <20.000

**Sinais de Sangramento:**
- Petéquias: ( ) | Equimoses: ( ) | Epistaxe: ( )
- Gengivorragia: ( ) | Hematúria: ( ) | Melena/hematoquezia: ( )
- Sangramento SNC: ( )

**Etiologia - Investigação:**

| Causa | Investigação | Resultado |
|-------|-------------|-----------|
| Pseudotrombocitopenia | Lâmina de sangue periférico (EDTA vs citrato) | |
| Drogas (heparina, QT) | Relação temporal | |
| PTI | Diagnóstico de exclusão | |
| PTT/SHU | Esquizócitos, DHL, haptoglobina, Coombs | |
| CIVD | TP, TTPa, fibrinogênio, D-dímero | |
| Hepatopatia/esplenomegalia | USG abdome, função hepática | |
| Infecções | HIV, HCV, HBV, CMV, dengue | |
| Mielodisplasia | Mielograma se indicado | |

**Conduta por gravidade:**
- \>50.000: geralmente sem restrições
- 20.000-50.000: evitar procedimentos invasivos
- <20.000: risco de sangramento espontâneo
- <10.000: considerar transfusão de plaquetas (se sangramento ativo)

**Tratamento PTI:**
- 1ª linha: Prednisona 1mg/kg/dia (máx 80mg) por 2-4 semanas
- Se urgência: Dexametasona 40mg/dia por 4 dias
- Imunoglobulina IV 1g/kg se sangramento grave
- 2ª linha: Rituximabe, esplenectomia, agonistas de TPO`,
  },

  // ═══════════════════════════════════════════════════════════
  // INFECTOLOGIA
  // ═══════════════════════════════════════════════════════════
  {
    id: 'hiv_inicial',
    category: 'infectology',
    labelKey: 'subtemplate.hivInicial',
    specialties: ['Infectologia', 'Clínica Médica'],
    content: `## HIV/AIDS - Avaliação Inicial

**Data do Diagnóstico:**
**Modo de Transmissão Provável:**
**Infecções Oportunistas Prévias:**

**Exames Basais:**

| Exame | Resultado | Data |
|-------|-----------|------|
| CD4 (cel/mm³) | | |
| Carga Viral (cópias/mL) | | |
| Genotipagem pré-tratamento | | |
| HLA-B*5701 | | |
| Hemograma | | |
| Creatinina / TFG | | |
| TGO / TGP | | |
| Bilirrubinas | | |
| Perfil lipídico | | |
| Glicemia de jejum | | |
| HBsAg / Anti-HBs / Anti-HBc | | |
| Anti-HCV | | |
| VDRL | | |
| Anti-Toxoplasma IgG | | |
| Anti-CMV IgG | | |
| PPD / IGRA | | |
| Chagas (IgG) | | |
| RX Tórax | | |

**Classificação CDC:**

| CD4 | A (Assintomático) | B (Sintomático) | C (AIDS) |
|-----|-------|-------|-------|
| ≥500 | A1 | B1 | C1 |
| 200-499 | A2 | B2 | C2 |
| <200 | A3 | B3 | C3 |

**Categoria:** __

**TARV (Terapia Antirretroviral):**
Esquema preferencial: TDF/3TC + DTG
- Tenofovir 300mg + Lamivudina 300mg (TDF/3TC) 1cp/dia
- Dolutegravir 50mg (DTG) 1cp/dia

**Profilaxias:**
- Pneumocistose (se CD4 <200): SMX/TMP 800/160mg 1cp/dia
- Toxoplasmose (se CD4 <100 e IgG+): SMX/TMP 800/160mg 1cp/dia
- MAC (se CD4 <50): Azitromicina 1200mg/semana
- TB latente (se PPD ≥5mm ou IGRA+): Isoniazida 300mg/dia por 6-9 meses

**Vacinação:** Hepatite B, Influenza, Pneumocócica, HPV
**Próximo retorno com CD4/CV:** em 8 semanas`,
  },
  {
    id: 'febre_origem_indeterminada',
    category: 'infectology',
    labelKey: 'subtemplate.febreOrigem',
    specialties: ['Infectologia', 'Clínica Médica'],
    content: `## Febre de Origem Indeterminada (FOI)

**Critérios Clássicos de Petersdorf:**
- [ ] Febre >38.3°C em múltiplas ocasiões
- [ ] Duração >3 semanas
- [ ] Diagnóstico incerto após 1 semana de investigação hospitalar

**Padrão Febril:**
- Contínua ( ) Remitente ( ) Intermitente ( ) Recorrente ( )
- Picos: __°C | Predominância: manhã ( ) tarde ( ) noite ( )
- Calafrios: Sim ( ) Não ( ) | Sudorese noturna: Sim ( ) Não ( )

**Etiologias Principais:**

| Categoria | Exemplos | Frequência |
|-----------|----------|------------|
| Infecciosas | TB, endocardite, abscesso, osteomielite, HIV | ~30% |
| Neoplásicas | Linfoma, leucemia, carcinoma renal, hepatocarcinoma | ~20% |
| Autoimunes | Doença de Still, LES, vasculites, AR | ~15% |
| Miscelânea | TEP, febre medicamentosa, factícia, tireoidite | ~15% |
| Sem diagnóstico | | ~20% |

**Investigação Sistemática:**

*Fase 1 (Básica):*
- Hemograma, VHS, PCR, procalcitonina
- Hemoculturas (3 amostras de sítios diferentes)
- Urocultura, parcial de urina
- TGO, TGP, FA, GGT, DHL, bilirrubinas
- Função renal, eletrólitos
- FAN, FR, ANCA
- Sorologias: HIV, HBV, HCV, CMV, EBV, toxoplasmose
- PPD / IGRA
- RX tórax

*Fase 2 (Imagem):*
- TC tórax + abdome + pelve com contraste
- Ecocardiograma (se suspeita de endocardite)
- USG abdome

*Fase 3 (Específica):*
- PET-CT (localizar foco oculto)
- Biópsia de medula óssea
- Biópsia hepática / linfonodo
- Ecocardiograma transesofágico`,
  },
  {
    id: 'antibioticoterapia',
    category: 'infectology',
    labelKey: 'subtemplate.antibioticoterapia',
    specialties: ['Infectologia', 'Clínica Médica', 'Medicina da Família e Comunidade'],
    content: `## Guia de Antibioticoterapia Empírica

**Foco Infeccioso:**
**Gravidade:** Leve ( ) Moderada ( ) Grave ( ) Choque séptico ( )

### Principais Sítios e Esquemas

**Pneumonia Comunitária (PAC):**

| Gravidade | 1ª Linha | Alternativa |
|-----------|----------|-------------|
| Leve (ambulatorial) | Amoxicilina 500mg 8/8h 7d | Azitromicina 500mg 1x/dia 5d |
| Moderada (enfermaria) | Amoxicilina-Clav + Azitromicina | Ceftriaxona 1g/dia + Azitromicina |
| Grave (UTI) | Ceftriaxona 1g 12/12h + Azitromicina 500mg/dia | Ampicilina-Sulbactam + Levofloxacino |

**Infecção Urinária:**

| Tipo | 1ª Linha | Alternativa |
|------|----------|-------------|
| Cistite não-complicada | Fosfomicina 3g DU ou Nitrofurantoína 100mg 6/6h 5d | SMX/TMP 800/160 12/12h 3d |
| Pielonefrite leve | Ciprofloxacino 500mg 12/12h 7d | Ceftriaxona 1g/dia 14d |
| Pielonefrite grave | Ceftriaxona 1g 12/12h ou Piperacilina-Tazobactam | Meropenem (se ESBL) |

**Infecção de Pele:**

| Tipo | 1ª Linha | Alternativa |
|------|----------|-------------|
| Celulite leve | Cefalexina 500mg 6/6h 7d | Clindamicina 300mg 8/8h |
| Celulite grave | Oxacilina 2g 4/4h IV | Ceftriaxona 1g/dia + Clindamicina |
| Abscesso (MRSA) | Drenagem + SMX/TMP | Drenagem + Clindamicina |

**Importante:**
- SEMPRE coletar culturas ANTES de iniciar ATB
- Reavaliar em 48-72h conforme resposta clínica
- Desescalonar conforme antibiograma
- Atentar para ajuste renal (ClCr)`,
  },

  // ═══════════════════════════════════════════════════════════
  // ORTOPEDIA E TRAUMATOLOGIA
  // ═══════════════════════════════════════════════════════════
  {
    id: 'fratura',
    category: 'orthopedics',
    labelKey: 'subtemplate.fratura',
    specialties: ['Ortopedia e Traumatologia'],
    content: `## Avaliação de Fratura

**Mecanismo de Trauma:**
- Tipo: queda ( ) torção ( ) impacto direto ( ) alta energia ( )
- Energia: baixa ( ) alta ( )
- Data/hora do trauma:

**Localização:**
**Lateralidade:** D ( ) E ( )
**Fratura exposta:** Não ( ) Sim ( ) - Classificação Gustilo-Anderson: I ( ) II ( ) IIIA ( ) IIIB ( ) IIIC ( )

**Classificação AO/OTA:** __

**Exame Físico:**
- Deformidade: Sim ( ) Não ( )
- Edema: leve ( ) moderado ( ) importante ( )
- Equimose: Sim ( ) Não ( )
- Crepitação: Sim ( ) Não ( )
- Dor à palpação: Sim ( ) Não ( )
- Avaliação neurovascular distal:
  - Pulsos: presentes ( ) ausentes ( )
  - Sensibilidade: preservada ( ) alterada ( )
  - Mobilidade distal: preservada ( ) alterada ( )
  - Preenchimento capilar: <2s ( ) >2s ( )

**Classificações Específicas:**
- Fratura de quadril (Garden): I ( ) II ( ) III ( ) IV ( )
- Fratura de tornozelo (Danis-Weber): A ( ) B ( ) C ( )
- Fratura de rádio distal: Colles ( ) Smith ( ) Barton ( )

**Exames de Imagem:**
- RX (incidências):
- TC (se necessário):

**Conduta:**
- [ ] Tratamento conservador: imobilização tipo __ por __ semanas
- [ ] Tratamento cirúrgico: procedimento proposto __
- Analgesia: Dipirona __ + Tramadol __ (se necessário)
- Profilaxia TEV: Enoxaparina (se imobilização de MMII)
- Orientações: elevação do membro, gelo, sinais de alerta (parestesias, dor desproporcional)
- Retorno: RX controle em __`,
  },
  {
    id: 'ombro',
    category: 'orthopedics',
    labelKey: 'subtemplate.ombro',
    specialties: ['Ortopedia e Traumatologia'],
    content: `## Avaliação do Ombro

**Queixa:** Dor ( ) Limitação de movimento ( ) Instabilidade ( ) Fraqueza ( )
**Lateralidade:** D ( ) E ( ) | Membro dominante: D ( ) E ( )
**Duração:** Agudo ( ) Crônico ( )
**Mecanismo:** Trauma ( ) Overuse ( ) Insidioso ( )

**Amplitude de Movimento (ADM):**

| Movimento | Ativo | Passivo | Normal |
|-----------|-------|---------|--------|
| Flexão | | | 180° |
| Extensão | | | 60° |
| Abdução | | | 180° |
| Rotação externa | | | 90° |
| Rotação interna | | | 70° |

**Testes Especiais:**

| Teste | Estrutura Avaliada | Resultado |
|-------|-------------------|-----------|
| Neer | Impacto subacromial | + ( ) - ( ) |
| Hawkins-Kennedy | Impacto subacromial | + ( ) - ( ) |
| Jobe (Empty can) | Supraespinhoso | + ( ) - ( ) |
| Patte | Infraespinhoso | + ( ) - ( ) |
| Gerber (Lift-off) | Subescapular | + ( ) - ( ) |
| Speed | Bíceps (porção longa) | + ( ) - ( ) |
| Yergason | Bíceps (porção longa) | + ( ) - ( ) |
| O'Brien | SLAP / AC | + ( ) - ( ) |
| Apreensão anterior | Instabilidade anterior | + ( ) - ( ) |
| Cross-body | Articulação AC | + ( ) - ( ) |

**Diagnóstico Diferencial:**

| Diagnóstico | Achados Sugestivos |
|-------------|-------------------|
| Tendinopatia do manguito | Neer+, Hawkins+, arco doloroso 60-120° |
| Ruptura do manguito | Fraqueza RE, drop arm+, atrofia |
| Capsulite adesiva | Limitação ativa E passiva, especialmente RE |
| Instabilidade | Apreensão+, história de luxação |
| Lesão AC | Cross-body+, dor localizada AC |

**Exames:** RX ombro (AP, perfil escapular, axilar) | USG | RNM se indicado`,
  },
  {
    id: 'joelho',
    category: 'orthopedics',
    labelKey: 'subtemplate.joelho',
    specialties: ['Ortopedia e Traumatologia', 'Reumatologia'],
    content: `## Avaliação do Joelho

**Queixa:** Dor ( ) Instabilidade ( ) Bloqueio ( ) Edema ( ) Falseio ( )
**Lateralidade:** D ( ) E ( )
**Mecanismo:** Trauma ( ) Degenerativo ( ) Overuse ( )

**Derrame Articular:** Ausente ( ) Leve ( ) Moderado ( ) Importante ( )

**Amplitude de Movimento:**
- Extensão: __ (normal 0°)
- Flexão: __ (normal 140°)

**Testes Especiais:**

| Teste | Estrutura | Resultado |
|-------|-----------|-----------|
| Lachman | LCA | + ( ) - ( ) |
| Gaveta anterior | LCA | + ( ) - ( ) |
| Gaveta posterior | LCP | + ( ) - ( ) |
| McMurray (medial) | Menisco medial | + ( ) - ( ) |
| McMurray (lateral) | Menisco lateral | + ( ) - ( ) |
| Apley | Meniscos | + ( ) - ( ) |
| Estresse em valgo | LCM | + ( ) - ( ) |
| Estresse em varo | LCL | + ( ) - ( ) |
| Teste de Apprehension (patela) | Instabilidade patelar | + ( ) - ( ) |
| Teste de Clarke | Condromalácia patelar | + ( ) - ( ) |

**Alinhamento:** Normal ( ) Valgo ( ) Varo ( )
**Marcha:**

**Diagnóstico Diferencial:**

| Diagnóstico | Achados-Chave |
|-------------|--------------|
| Lesão LCA | Lachman+, hemartrose aguda pós-trauma |
| Lesão meniscal | McMurray+, bloqueio mecânico, dor interlinha |
| Condromalácia | Dor retropatelar, Clarke+, piora em escadas |
| Gonartrose | Crepitação, rigidez matinal <30min, RX com osteófitos |
| Lesão ligamentar colateral | Estresse em valgo/varo positivo |

**Exames:** RX joelho (AP + lateral + axial de patela) | RNM se indicado`,
  },
  {
    id: 'coluna_lombar',
    category: 'orthopedics',
    labelKey: 'subtemplate.colunaLombar',
    specialties: ['Ortopedia e Traumatologia', 'Reumatologia', 'Clínica Médica'],
    content: `## Avaliação da Coluna Lombar

**Tipo de Dor:** Mecânica ( ) Inflamatória ( ) Radicular ( ) Mista ( )
**Duração:** Aguda <6 sem ( ) Subaguda 6-12 sem ( ) Crônica >12 sem ( )
**EAV (0-10):**

**Irradiação:** Não ( ) Sim ( ) - Trajeto:
**Parestesia/Dormência:** Não ( ) Sim ( ) - Distribuição:

**Red Flags (Sinais de Alarme):**
- [ ] Idade <20 ou >55 anos com primeira crise
- [ ] Trauma significativo
- [ ] Dor noturna que não melhora com repouso
- [ ] Perda ponderal inexplicada
- [ ] História de neoplasia
- [ ] Uso de corticoides crônico / imunossupressão
- [ ] Febre
- [ ] Síndrome da cauda equina: retenção/incontinência urinária, anestesia em sela
- [ ] Déficit motor progressivo

**Exame Físico:**
- Inspeção: escoliose ( ) retificação da lordose ( ) espasmo muscular ( )
- Palpação: pontos dolorosos processos espinhosos __
- ADM: flexão __ extensão __ rotação __ lateralização __
- Marcha: normal ( ) claudicante ( ) sobre calcanhares ( ) sobre pontas ( )

**Testes Especiais:**

| Teste | Significado | Resultado |
|-------|-------------|-----------|
| Lasègue (EEP) | Radiculopatia L5-S1 | + ( ) - ( ) __ graus |
| Lasègue cruzado | Hérnia extrusão/sequestro | + ( ) - ( ) |
| Bragard | Confirma Lasègue | + ( ) - ( ) |
| Slump test | Tensão neural | + ( ) - ( ) |
| Teste femoral (L2-L4) | Radiculopatia alta | + ( ) - ( ) |

**Exame Neurológico:**

| Raiz | Dermátomo | Miótomo | Reflexo |
|------|-----------|---------|---------|
| L4 | Face medial da perna | Quadríceps (extensão joelho) | Patelar |
| L5 | Dorso do pé | Extensor do hálux / tibial anterior | - |
| S1 | Face lateral do pé | Gastrocnêmio (flexão plantar) | Aquileu |

**Conduta:**
- Fase aguda: analgesia escalonada + miorrelaxante + orientações posturais
- Fisioterapia: estabilização lombar
- Exames de imagem: RX se >6 semanas sem melhora; RNM se déficit neurológico ou red flags
- Encaminhamento neurocirúrgico se: síndrome da cauda equina, déficit motor progressivo, dor refratária com hérnia confirmada`,
  },
  {
    id: 'sepsis_bundle',
    category: 'acuteDisease',
    labelKey: 'subtemplate.sepsisBundle',
    specialties: ['Medicina de Emergência', 'Medicina Intensiva', 'Clínica Médica', 'Infectologia'],
    content: `## Sepse / Choque Séptico - Pacote da 1ª Hora
**Triagem (qSOFA):** PAS ≤100 ( ) FR ≥22 ( ) Glasgow <15 ( ) | **Lactato:**
**Foco suspeito:**

**Pacote da 1ª hora:**
- [ ] Lactato (repetir se >2)
- [ ] Hemoculturas (2 pares) antes do antibiótico
- [ ] Antibiótico de amplo espectro na 1ª hora
- [ ] Cristaloide 30 mL/kg se hipotensão ou lactato ≥4
- [ ] Vasopressor (noradrenalina) se PAM <65 após volume
- [ ] Reavaliar perfusão (PAM, diurese, lactato)

**Controle do foco:**
**Reavaliação:**`,
  },
  {
    id: 'chest_pain_ed',
    category: 'acuteDisease',
    labelKey: 'subtemplate.chestPainED',
    specialties: ['Medicina de Emergência', 'Cardiologia'],
    content: `## Dor Torácica na Emergência
**Início / duração / caráter / irradiação:**
**Fatores de risco CV:** | **Equivalentes anginosos:**
**Sinais de alarme:** Instabilidade ( ) Sudorese ( ) Síncope ( )

**Avaliação:**
- [ ] ECG em <10 min (repetir se dor persistir)
- [ ] Troponina seriada
- [ ] Monitorização / acesso / O2 se SatO2 <94%
- [ ] Escore HEART:

**Excluir causas fatais:** SCA, TEP, dissecção de aorta, pneumotórax hipertensivo, tamponamento.

**Conduta / desfecho:**`,
  },
  {
    id: 'icu_admission',
    category: 'acuteDisease',
    labelKey: 'subtemplate.icuAdmission',
    specialties: ['Medicina Intensiva'],
    content: `## Admissão em UTI - Por Sistemas
**Motivo / diagnóstico:** | **SOFA:** | **APACHE II:**
- **Neuro:** Glasgow/RASS | Sedação/analgesia | Pupilas:
- **Resp:** VM (modo/FiO2/PEEP/VC) ou O2 | Gasometria:
- **CV:** PAM | Droga vasoativa | Ritmo | Balanço:
- **Renal/metab:** Diurese | Cr | Eletrólitos | Diálise:
- **Infeccioso:** Foco | Culturas | ATB (dia):
- **Dig/nutrição:** Dieta | Profilaxia LAMG:
- **Hemato:** Hb/plaquetas | Profilaxia TEV:
**Metas do dia:**`,
  },
  {
    id: 'preop_assessment',
    category: 'surgery',
    labelKey: 'subtemplate.preopAssessment',
    specialties: ['Cirurgia Geral', 'Cirurgia do Aparelho Digestivo', 'Cirurgia Plástica', 'Cirurgia Vascular', 'Coloproctologia', 'Neurocirurgia', 'Mastologia'],
    content: `## Avaliação Pré-operatória
**Cirurgia proposta:** | **Porte:** | **Data:**
**Comorbidades:** | **Capacidade funcional (METs):**
**Medicações (anticoag/antiagreg/insulina/AINE):** Conduta/suspensão:
**Alergias:** | **Jejum orientado:**
**Risco:** ASA: | Cardíaco (Lee/ACP): | Via aérea:

**Exames pré-op (conforme indicação):** Hemograma | Coagulograma | Função renal | Glicemia | ECG | RX tórax:
**Reserva de hemoderivados:** ( )
**Consentimento informado:** ( )
**Pendências:**`,
  },
  {
    id: 'colonoscopy_prep',
    category: 'gastroenterology',
    labelKey: 'subtemplate.colonoscopyPrep',
    specialties: ['Coloproctologia', 'Endoscopia', 'Gastroenterologia'],
    content: `## Preparo para Colonoscopia
**Indicação:** | **Data do exame:**
**Dieta:** Pobre em resíduos 2-3 dias antes; líquidos claros na véspera.
**Preparo (split-dose):**
- Véspera à noite: 1ª dose do laxante
- Manhã do exame: 2ª dose (terminar ≥2h antes)
**Medicações:** Suspender ferro 5 dias antes; ajustar anticoagulante/antiagregante e antidiabético conforme risco.
**Jejum:** ≥2h para líquidos claros antes do exame.
**Orientações:** Acompanhante (sedação); avaliar qualidade do preparo (Boston).`,
  },
  {
    id: 'prechemo',
    category: 'oncology',
    labelKey: 'subtemplate.prechemo',
    specialties: ['Oncologia Clínica'],
    content: `## Avaliação Pré-quimioterapia
**Esquema / ciclo / dia:** | **Intenção (curativa/paliativa):**
**ECOG:** | **Peso / SC (m²):**
**Toxicidades do ciclo anterior (CTCAE):**

**Checklist:**
- [ ] Hemograma (neutrófilos, plaquetas) adequado
- [ ] Função renal / hepática
- [ ] Pré-medicação (antiemético, corticoide, anti-histamínico)
- [ ] Acesso venoso / cateter
- [ ] Ajuste de dose (toxicidade / função orgânica)
**Liberação:** ( ) | **Sinais de alarme (febre/neutropenia):**`,
  },
  {
    id: 'dvt_wells',
    category: 'acuteDisease',
    labelKey: 'subtemplate.dvtWells',
    specialties: ['Cirurgia Vascular', 'Medicina de Emergência', 'Clínica Médica'],
    content: `## TVP - Investigação (Escore de Wells)
**Critérios (1 ponto cada, salvo indicado):**
- [ ] Câncer ativo
- [ ] Paralisia / imobilização de MMII
- [ ] Acamado >3 dias ou cirurgia <12 semanas
- [ ] Dor à palpação do trajeto venoso profundo
- [ ] Edema de todo o membro
- [ ] Panturrilha >3 cm vs contralateral
- [ ] Edema depressível no membro sintomático
- [ ] Veias colaterais superficiais
- [ ] TVP prévia
- [ ] Diagnóstico alternativo provável (−2)

**Probabilidade:** ≤0 baixa | 1-2 intermediária | ≥3 alta
**Conduta:** D-dímero (baixa/intermediária) | USG Doppler venoso | Anticoagulação conforme resultado.`,
  },
  {
    id: 'peripheral_arterial',
    category: 'vascular',
    labelKey: 'subtemplate.peripheralArterial',
    specialties: ['Cirurgia Vascular'],
    content: `## DAOP / Claudicação - Avaliação
**Claudicação:** Distância | Localização | Dor em repouso ( ) | Ferida/úlcera ( )
**Fatores de risco:** Tabagismo | DM | HAS | DLP
**Pulsos:** Femoral | Poplíteo | Tibial post. | Pedioso:
**ITB:** Direito: | Esquerdo:
(>0,9 normal | 0,4-0,9 DAOP leve-moderada | <0,4 isquemia crítica)
**Classificação (Fontaine/Rutherford):**
**Conduta:** Cessar tabagismo | Exercício supervisionado | Antiagregante + estatina | Eco-Doppler/Angio-TC | Avaliar revascularização.`,
  },
];

/**
 * Retorna subtemplates agrupados por categoria para uma especialidade
 * @param {string} specialty - Nome da especialidade
 * @returns {Object} - { categoryKey: { labelKey, items: [...] } }
 */
export function getSubtemplatesForSpecialty(specialty) {
  if (!specialty) return {};

  const matching = SUBTEMPLATES.filter(
    (st) => st.specialties.includes(specialty) || st.specialties.includes('*')
  );

  const grouped = {};
  for (const st of matching) {
    if (!grouped[st.category]) {
      const cat = SUBTEMPLATE_CATEGORIES[st.category];
      if (!cat) continue;
      grouped[st.category] = {
        labelKey: cat.labelKey,
        items: [],
      };
    }
    grouped[st.category].items.push(st);
  }

  return grouped;
}
