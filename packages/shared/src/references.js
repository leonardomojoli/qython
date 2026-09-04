// @qython/shared - Badge canônico de referência (FONTE ÚNICA web + mobile).
//
// JS puro (deep-path import). O selo classifica a fonte por TIPO DE DOCUMENTO — o que diz ao
// médico COMO ler/confiar na fonte (e agrega info que o domínio sozinho não dá). 5 categorias:
//   Bula      → rótulo / regulador / fabricante (ANVISA, FDA, EMA, Sandoz…)
//   Diretriz  → guideline clínico (WHO, CDC, NICE, sociedades…)
//   Artigo    → artigo científico (PubMed, NEJM, Lancet, JAMA, DOI…) — PubMed dobra aqui
//   Livro     → livro / manual de referência (StatPearls, MSD, UpToDate…)
//   Web       → resto (inclui portal de saúde institucional: nih.gov, Mayo, MedlinePlus…)
//
// A classificação canônica é do backend (`_classify_reference` → `source_type`, olhando URI +
// título, robusto a redirect opaco). Aqui o selo é derivado do `source_type`; o match por
// domínio é só rede de segurança p/ fontes sem `source_type`. Retorna SEMPRE uma string.

const _BULA = ['anvisa', 'dailymed', 'accessdata.fda.gov', 'fda.gov', 'ema.europa', 'medsafe',
  'aemps', 'mhra', 'tga.gov.au', 'hc-sc.gc.ca', 'bula', 'sandoz', 'novartis', 'pfizer', 'bayer',
  'gsk.com', 'roche', 'abbvie', 'sanofi', 'takeda', 'janssen', 'eurofarma', 'ems.com', 'ache.com',
  'medley', 'libbs', 'cristalia', 'teuto', 'germed', 'hypera', 'biolab'];
const _DIRETRIZ = ['who.int', 'cdc.gov', 'nice.org.uk', 'escardio', 'acc.org', 'heart.org',
  'idsociety', 'cardiol.br', 'sign.ac.uk', 'guidelines.gov'];
const _LIVRO = ['/books/', 'bookshelf', 'statpearls', 'uptodate', 'dynamed', 'bestpractice.bmj',
  'msdmanuals', 'merckmanuals', 'accessmedicine', 'ebmedicine', 'whitebook', 'mypcnow.org'];
const _ARTIGO = ['pubmed.ncbi.nlm.nih.gov', 'pubmed.gov', '/pmc/', 'pmc.ncbi', 'doi.org',
  'nejm.org', 'thelancet', 'jamanetwork', 'bmj.com', 'nature.com', 'springer', 'sciencedirect',
  'elsevier', 'wiley', 'cochranelibrary', 'plos.org', 'frontiersin', 'scielo', 'ahajournals',
  'ncbi.nlm.nih.gov'];

function _byDomain(hay) {
  const has = (list) => list.some((d) => hay.includes(d));
  if (has(_BULA)) return 'label';
  if (has(_DIRETRIZ)) return 'guideline';
  if (has(_LIVRO)) return 'book';        // antes de article: StatPearls vive em ncbi/books
  if (has(_ARTIGO)) return 'article';
  return 'web';
}

// Retorna a CHAVE SEMÂNTICA do tipo da fonte (não o rótulo): 'label'|'guideline'|'article'|
// 'book'|'web'. O rótulo exibido é resolvido por i18n no componente (ver referenceBadgeI18nKey).
export function referenceBadge(source) {
  if (!source) return 'web';
  const st = source.source_type;

  // 1. Canônico: tipo pelo source_type do backend. VEM PRIMEIRO — já considera pmid (no branch
  // 'pubmed') E distingue DIRETRIZ-com-pmid (guideline publicada em revista: Surviving Sepsis,
  // KDIGO, Brazilian AF…) de artigo. Se checássemos pmid antes, essas diretrizes (que têm PMID)
  // virariam "Artigo" e anulariam a classificação diretriz-no-título do backend.
  switch (st) {
    case 'label': return 'label';
    case 'guideline': return 'guideline';
    case 'pubmed':
    case 'doi':
    case 'journal': return 'article';
    case 'book': return 'book';
    case 'reference':
    case 'gov':
    case 'other': return 'web';
    default: break; // sem source_type (ref legada) → pmid, depois domínio
  }

  // 2. Sem source_type: pmid confiável (mesmo com URL opaca) → artigo indexado
  if (source.pmid) return 'article';

  // 3. Rede de segurança: classifica por URI + título (domínio real costuma estar no título)
  return _byDomain(((source.uri || source.url || '') + ' ' + (source.title || '')).toLowerCase());
}

// Chave de i18n do selo (ex.: 'refBadgeArticle'). O componente faz t(referenceBadgeI18nKey(src)).
// Traduções em pt/en/es: refBadgeLabel/Guideline/Article/Book/Web (web + mobile).
const _BADGE_I18N_KEY = {
  label: 'refBadgeLabel',
  guideline: 'refBadgeGuideline',
  article: 'refBadgeArticle',
  book: 'refBadgeBook',
  web: 'refBadgeWeb',
};
export function referenceBadgeI18nKey(source) {
  return _BADGE_I18N_KEY[referenceBadge(source)] || 'refBadgeWeb';
}

// URL utilizável de uma fonte (backend manda `uri`; alguns lugares usam `url`).
export function referenceUrl(source) {
  return (source && (source.uri || source.url)) || '';
}

// Converte marcadores [n] (n = índice 1-based de uma fonte) em links internos [n](#qref-n).
// Esses links viram CHIPS de citação clicáveis (web e mobile), rotulados com a badge do tipo
// da fonte (Bula/PubMed/…). Só linka [n] cujo n aponta para uma fonte existente; o resto do
// texto é preservado intacto. FONTE ÚNICA — usado por Chat.js (web) e MarkdownRenderer (mobile).
export function linkifyCitations(text, sources) {
  if (!text || !sources || !sources.length) return text;
  return text.replace(/\[(\d{1,2})\]/g, (full, num) => {
    const i = parseInt(num, 10);
    return i >= 1 && i <= sources.length ? `[${num}](#qref-${num})` : full;
  });
}
