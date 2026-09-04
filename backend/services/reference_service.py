"""
Serviço de validação e enriquecimento de referências bibliográficas.
Valida URLs, extrai metadados e unifica fontes do Google Grounding com referências do texto.

Anti-Alucinação:
- Referências do texto do modelo são validadas via HEAD request
- URLs inválidas (404, timeout, DNS failure) são descartadas
- Domínios confiáveis (pubmed, nih, etc.) são priorizados
- Citações textuais (autor, ano) são validadas via PubMed E-utilities API (gratuita)
"""

import asyncio
import aiohttp
import re
import logging
from defusedxml import ElementTree as ET
from typing import List, Dict, Optional, Tuple
from urllib.parse import urlparse, quote_plus

from ..config import Config
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Timeout curto para não bloquear resposta do chat
VALIDATION_TIMEOUT = 3  # segundos
FETCH_TIMEOUT = 5  # segundos
PUBMED_TIMEOUT = 4  # segundos para busca PubMed

# PubMed E-utilities API. Sem API key: ~3 req/s (compartilhado por IP). Com
# NCBI_API_KEY: ~10 req/s — recomendado em produção para as referências não
# falharem sob carga concorrente.
PUBMED_ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
PUBMED_EFETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"

# Configurações de retry para PubMed API (evitar 429 Too Many Requests)
PUBMED_MAX_RETRIES = 3
PUBMED_BACKOFF_MULTIPLIER = 2.0  # Multiplicador para backoff exponencial

# Optional NCBI API key (Config/env). Raises the rate limit 3 → 10 req/s and
# lets us shorten the inter-request delay accordingly.
NCBI_API_KEY = (getattr(Config, "NCBI_API_KEY", "") or "").strip()
PUBMED_BASE_DELAY = 0.12 if NCBI_API_KEY else 0.6  # Delay base entre requests (s)

# Domínios confiáveis que não precisam de validação extra de existência
# (ainda fazemos fetch para enriquecer metadados)
TRUSTED_DOMAINS = {
    'pubmed.ncbi.nlm.nih.gov', 'ncbi.nlm.nih.gov', 'nih.gov',
    'who.int', 'cdc.gov', 'fda.gov',
    'uptodate.com', 'medscape.com', 'mayoclinic.org',
    'nejm.org', 'thelancet.com', 'bmj.com', 'jamanetwork.com',
    'ahajournals.org', 'heart.org', 'acc.org', 'escardio.org',
    'scielo.br', 'bvsalud.org', 'gov.br',
    'cochranelibrary.com', 'doi.org', 'nature.com', 'springer.com',
    'wiley.com', 'elsevier.com', 'oup.com', 'sagepub.com',
    'mdpi.com', 'frontiersin.org', 'plos.org',
    'afya.com.br', 'msdmanuals.com', 'medway.com.br'
}


# =============================================================================
# PubMed E-utilities Integration (API Gratuita)
# =============================================================================

def parse_text_citation(citation_text: str) -> Optional[Dict]:
    """
    Extrai autor, ano e palavras-chave de uma citação textual.

    Formatos suportados:
    - "Mancia G, et al. 2024 ESC Guidelines for hypertension..."
    - "1. Smith J, et al. Title of article. Journal. 2024."
    - "Williams B, et al. 2018 ESC/ESH Guidelines..."
    - "MCEVOY, J. W., et al. 2024 ESC Guidelines..." (formato Vancouver/CAPS)
    - "McEvoy JW, et al. Title. Journal. 2024."

    Returns:
        Dict com 'author', 'year', 'keywords' ou None se não conseguir parsear
    """
    if not citation_text or len(citation_text) < 10:
        return None

    result = {}

    # Extrair ano (4 dígitos entre 2000-2030)
    year_match = re.search(r'\b(20[0-2]\d)\b', citation_text)
    if year_match:
        result['year'] = year_match.group(1)

    # Remover número de lista no início (ex: "1. ", "12. ")
    text_stripped = re.sub(r'^\d+\.\s*', '', citation_text).strip()
    text_stripped_lower = text_stripped.lower()

    # Detectar organizações ANTES dos padrões de autor
    # Organizações são frequentemente confundidas com autores, gerando buscas PubMed irrelevantes
    ORGANIZATION_PREFIXES = [
        'sociedade', 'associação', 'global initiative', 'american', 'european',
        'world health', 'national institute', 'british', 'royal college',
        'ministério', 'organização', 'federação', 'conselho',
        'instituto', 'fundação', 'college of', 'academy of',
    ]
    ORGANIZATION_SIGLAS = {
        'ESC', 'AHA', 'ACC', 'WHO', 'SBC', 'SBEM', 'NICE', 'HFSA', 'ESH',
        'GINA', 'GOLD', 'KDIGO', 'ISTH', 'ERS', 'ATS', 'IDSA', 'EASL',
    }

    is_organization = False

    # Verificar se começa com prefixo de organização
    for prefix in ORGANIZATION_PREFIXES:
        if text_stripped_lower.startswith(prefix):
            is_organization = True
            result['organization'] = text_stripped.split('.')[0].strip()[:100]
            logger.debug(f"[CITATION_PARSE] Organização detectada por prefixo: '{result['organization'][:60]}'")
            break

    # Verificar se começa com sigla conhecida seguida de espaço/pontuação
    if not is_organization:
        first_word = re.match(r'^([A-Z]{2,6})\b', text_stripped)
        if first_word and first_word.group(1) in ORGANIZATION_SIGLAS:
            is_organization = True
            result['organization'] = first_word.group(1)
            logger.debug(f"[CITATION_PARSE] Organização detectada por sigla: '{result['organization']}'")

    # Extrair autor apenas se NÃO for organização
    if not is_organization:
        # Lista de padrões para extrair autor (do mais específico ao mais genérico)
        author_patterns = [
            # Padrão Vancouver: "MCEVOY, J. W.," ou "SMITH, A. B.,"
            r'^(?:\d+\.\s*)?([A-Z][A-Z\-\']+),\s*([A-Z]\.?\s*[A-Z]?\.?),?\s*(?:et\s*al)?',
            # Padrão: "McEvoy JW," ou "Smith AB,"
            r'^(?:\d+\.\s*)?([A-Z][a-zA-Z\-\']+)\s+([A-Z]{1,3}),?\s*(?:et\s*al)?',
            # Padrão: "Mancia G, et al" ou "Mancia G et al"
            r'^(?:\d+\.\s*)?([A-Z][a-zA-Z\-\']+)\s+([A-Z]{1,2})(?:,?\s*et\s*al)?',
            # Padrão: Só sobrenome antes de vírgula ou "et al"
            r'^(?:\d+\.\s*)?([A-Z][a-zA-Z\-\']+)(?:\s+et\s+al|,)',
        ]

        for pattern in author_patterns:
            author_match = re.search(pattern, citation_text)
            if author_match:
                if author_match.lastindex >= 2:
                    # Tem sobrenome + iniciais
                    surname = author_match.group(1)
                    initials = author_match.group(2).replace('.', '').strip()
                    # Capitalizar corretamente se estiver em CAPS
                    if surname.isupper():
                        surname = surname.capitalize()
                    result['author'] = f"{surname} {initials}"
                else:
                    # Só sobrenome
                    surname = author_match.group(1)
                    if surname.isupper():
                        surname = surname.capitalize()
                    result['author'] = surname
                break

    # Extrair palavras-chave do título
    # Remover autor e ano, pegar palavras restantes
    text_clean = citation_text
    if result.get('author'):
        text_clean = text_clean.replace(result['author'], '')
    if result.get('year'):
        text_clean = text_clean.replace(result['year'], '')

    # Palavras significativas (excluir stopwords e palavras curtas)
    # Inclui stopwords em EN, PT, ES para citações multilíngue
    stopwords = {
        # English
        'the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was', 'were',
        'been', 'being', 'have', 'has', 'had', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used',
        'etc', 'etal', 'journal', 'report', 'update',
        # Português
        'para', 'como', 'mais', 'sobre', 'pela', 'pelo', 'pelas', 'pelos',
        'das', 'dos', 'uma', 'uns', 'umas', 'nas', 'nos', 'com', 'sem', 'por',
        'entre', 'após', 'antes', 'desde', 'durante', 'segundo', 'conforme',
        'recomendações', 'manejo', 'tratamento', 'diagnóstico',  # muito genéricos para PubMed
        # Español
        'para', 'como', 'sobre', 'por', 'con', 'sin', 'entre', 'tras', 'según',
        # Generic medical terms too common on PubMed to be useful as search keywords
        'strategy', 'diagnosis', 'management', 'prevention', 'treatment', 'guideline',
        'guidelines', 'clinical', 'practice', 'report', 'update', 'focused', 'review',
        'recommendations', 'statement', 'consensus',
    }

    # Para organizações: usar min 3 chars para capturar siglas (ESC, AHA, ICC, SBC, DRC)
    # Para autores normais: manter min 4 chars
    min_word_len = 3 if is_organization else 4
    words = re.findall(rf'\b[a-zA-Z]{{{min_word_len},}}\b', text_clean.lower())
    all_keywords = [w for w in words if w not in stopwords]

    # Para organizações: priorizar keywords de doença/tópico sobre nome da org
    # Ex: "Sociedade Brasileira de Pneumologia. Recomendações para manejo da DPOC."
    # Queremos ["dpoc", "manejo", "pneumologia"] e não ["sociedade", "brasileira", "pneumologia"]
    if is_organization and result.get('organization'):
        org_words = set(re.findall(r'\b[a-zA-Z]{3,}\b', result['organization'].lower()))
        # Palavras genéricas de organizações que não ajudam na busca PubMed
        org_noise = {'sociedade', 'brasileira', 'brasileiro', 'associação', 'global', 'initiative',
                     'american', 'european', 'national', 'institute', 'british', 'royal', 'college',
                     'world', 'health', 'organization', 'organização', 'federação', 'conselho',
                     'ministério', 'fundação', 'instituto', 'academy'}
        # Separar: topic_keywords (fora do nome da org) vs org_keywords
        topic_keywords = [w for w in all_keywords if w not in org_words and w not in org_noise]
        org_keywords = [w for w in all_keywords if w in org_words and w not in org_noise]
        # Tópico primeiro, org depois (PubMed usa keywords[:2] então tópico tem prioridade)
        keywords = (topic_keywords + org_keywords)[:5]
        logger.debug(f"[CITATION_PARSE] Org keywords reordenadas: topic={topic_keywords[:3]}, org={org_keywords[:3]} → final={keywords}")
    else:
        keywords = all_keywords[:5]

    if keywords:
        result['keywords'] = keywords

    # Precisa ter pelo menos autor OU organização OU (ano + keywords) para ser útil
    if result.get('author') or result.get('organization') or (result.get('year') and result.get('keywords')):
        result['original_text'] = citation_text[:200]  # Guardar texto original truncado
        return result

    return None


async def search_pubmed(
    query: str,
    session: aiohttp.ClientSession,
    max_results: int = 3
) -> List[str]:
    """
    Busca no PubMed usando ESearch e retorna lista de PMIDs.
    Implementa retry com backoff exponencial para lidar com rate limiting (429).

    Args:
        query: Termo de busca (autor, título, ano)
        session: Sessão aiohttp
        max_results: Máximo de resultados

    Returns:
        Lista de PMIDs encontrados
    """
    params = {
        'db': 'pubmed',
        'term': query,
        'retmax': max_results,
        'retmode': 'json',
        'sort': 'relevance'
    }
    if NCBI_API_KEY:
        params['api_key'] = NCBI_API_KEY

    url = f"{PUBMED_ESEARCH_URL}?{'&'.join(f'{k}={quote_plus(str(v))}' for k, v in params.items())}"

    last_error = None
    for attempt in range(PUBMED_MAX_RETRIES):
        try:
            async with session.get(
                url,
                timeout=aiohttp.ClientTimeout(total=PUBMED_TIMEOUT)
            ) as response:
                if response.status == 429:
                    # Rate limited - fazer backoff exponencial
                    delay = PUBMED_BASE_DELAY * (PUBMED_BACKOFF_MULTIPLIER ** attempt)
                    logger.warning(f"[PUBMED] ESearch 429 (rate limit), aguardando {delay:.1f}s (tentativa {attempt + 1}/{PUBMED_MAX_RETRIES})")
                    await asyncio.sleep(delay)
                    continue

                if response.status != 200:
                    logger.warning(f"[PUBMED] ESearch retornou status {response.status}")
                    return []

                data = await response.json()
                id_list = data.get('esearchresult', {}).get('idlist', [])

                if id_list:
                    logger.debug(f"[PUBMED] Busca '{query[:50]}...' encontrou {len(id_list)} resultados")

                return id_list

        except asyncio.TimeoutError:
            last_error = "timeout"
            delay = PUBMED_BASE_DELAY * (PUBMED_BACKOFF_MULTIPLIER ** attempt)
            logger.warning(f"[PUBMED] Timeout na busca (tentativa {attempt + 1}/{PUBMED_MAX_RETRIES}), aguardando {delay:.1f}s")
            await asyncio.sleep(delay)
        except Exception as e:
            last_error = str(e)
            logger.warning(f"[PUBMED] Erro na busca (tentativa {attempt + 1}): {e}")
            break  # Erro inesperado, não fazer retry

    logger.warning(f"[PUBMED] ESearch falhou após {PUBMED_MAX_RETRIES} tentativas: {last_error}")
    return []


async def fetch_pubmed_details(
    pmids: List[str],
    session: aiohttp.ClientSession
) -> List[Dict]:
    """
    Busca detalhes dos artigos no PubMed usando EFetch.
    Implementa retry com backoff exponencial para lidar com rate limiting (429).

    Args:
        pmids: Lista de PMIDs
        session: Sessão aiohttp

    Returns:
        Lista de dicts com uri, title, author, year
    """
    if not pmids:
        return []

    params = {
        'db': 'pubmed',
        'id': ','.join(pmids),
        'rettype': 'abstract',
        'retmode': 'xml'
    }
    if NCBI_API_KEY:
        params['api_key'] = NCBI_API_KEY

    url = f"{PUBMED_EFETCH_URL}?{'&'.join(f'{k}={quote_plus(str(v))}' for k, v in params.items())}"

    last_error = None
    for attempt in range(PUBMED_MAX_RETRIES):
        try:
            async with session.get(
                url,
                timeout=aiohttp.ClientTimeout(total=PUBMED_TIMEOUT)
            ) as response:
                if response.status == 429:
                    # Rate limited - fazer backoff exponencial
                    delay = PUBMED_BASE_DELAY * (PUBMED_BACKOFF_MULTIPLIER ** attempt)
                    logger.warning(f"[PUBMED] EFetch 429 (rate limit), aguardando {delay:.1f}s (tentativa {attempt + 1}/{PUBMED_MAX_RETRIES})")
                    await asyncio.sleep(delay)
                    continue

                if response.status != 200:
                    logger.warning(f"[PUBMED] EFetch retornou status {response.status}")
                    return []

                xml_text = await response.text()
                return parse_pubmed_xml(xml_text)

        except asyncio.TimeoutError:
            last_error = "timeout"
            delay = PUBMED_BASE_DELAY * (PUBMED_BACKOFF_MULTIPLIER ** attempt)
            logger.warning(f"[PUBMED] EFetch timeout (tentativa {attempt + 1}/{PUBMED_MAX_RETRIES}), aguardando {delay:.1f}s")
            await asyncio.sleep(delay)
        except Exception as e:
            last_error = str(e)
            logger.warning(f"[PUBMED] Erro no fetch (tentativa {attempt + 1}): {e}")
            break  # Erro inesperado, não fazer retry

    logger.warning(f"[PUBMED] EFetch falhou após {PUBMED_MAX_RETRIES} tentativas: {last_error}")
    return []


def parse_pubmed_xml(xml_text: str) -> List[Dict]:
    """
    Parseia XML do PubMed EFetch e extrai metadados.
    """
    results = []

    try:
        root = ET.fromstring(xml_text)

        for article in root.findall('.//PubmedArticle'):
            pmid_elem = article.find('.//PMID')
            if pmid_elem is None:
                continue

            pmid = pmid_elem.text

            # Título
            title_elem = article.find('.//ArticleTitle')
            title = title_elem.text if title_elem is not None and title_elem.text else None

            # Primeiro autor
            author_elem = article.find('.//Author')
            author = None
            if author_elem is not None:
                lastname = author_elem.find('LastName')
                initials = author_elem.find('Initials')
                if lastname is not None and lastname.text:
                    author = lastname.text
                    if initials is not None and initials.text:
                        author += f" {initials.text}"

            # Ano de publicação
            year = None
            pub_date = article.find('.//PubDate')
            if pub_date is not None:
                year_elem = pub_date.find('Year')
                if year_elem is not None and year_elem.text:
                    year = year_elem.text

            # Se não tem ano no PubDate, tentar em ArticleDate
            if not year:
                article_date = article.find('.//ArticleDate')
                if article_date is not None:
                    year_elem = article_date.find('Year')
                    if year_elem is not None and year_elem.text:
                        year = year_elem.text

            # Criar título fallback se não houver título do PubMed
            display_title = title
            if not display_title:
                # Construir título a partir de autor e ano
                parts = []
                if author:
                    parts.append(f"{author} et al.")
                if year:
                    parts.append(f"({year})")
                display_title = ' '.join(parts) if parts else f"PubMed Article {pmid}"
                logger.debug(f"[PUBMED] Título não encontrado para PMID {pmid}, usando fallback: {display_title}")

            # Tipo(s) de publicação — desenho do estudo. Alimenta o ranking: meta-análise e
            # diretriz valiam o MESMO que relato de caso ("PubMed/90"), o que é errado como
            # hierarquia de evidência.
            pub_types = [pt.text.strip() for pt in article.findall('.//PublicationType')
                         if pt is not None and pt.text]

            results.append({
                'uri': f'https://pubmed.ncbi.nlm.nih.gov/{pmid}/',
                'title': display_title,
                'author': author,
                'year': year,
                'pmid': pmid,
                'pub_types': pub_types,
                'source': 'pubmed_lookup',
                'verified': True
            })

    except ET.ParseError as e:
        logger.warning(f"[PUBMED] Erro parseando XML: {e}")
    except Exception as e:
        logger.warning(f"[PUBMED] Erro processando XML: {e}")

    return results


async def validate_pmid(
    pmid: str,
    session: aiohttp.ClientSession
) -> Optional[Dict]:
    """
    Validates a PMID by fetching its details from PubMed.
    Returns enriched metadata if valid, None if hallucinated.
    """
    if not pmid or not re.match(r'^\d{7,8}$', pmid):
        logger.debug(f"[TIER1] PMID format invalid: '{pmid}'")
        return None

    details = await fetch_pubmed_details([pmid], session)
    if details:
        result = details[0]
        result['source'] = 'model_pmid_validated'
        logger.info(f"[TIER1] Validated PMID {pmid}: '{result.get('title', '?')[:60]}'")
        return result

    logger.info(f"[TIER1] PMID {pmid} not found in PubMed (hallucination)")
    return None


async def validate_doi(
    doi: str,
    session: aiohttp.ClientSession
) -> Optional[Dict]:
    """
    Validates a DOI by resolving it via doi.org, then tries to find its PMID.
    Returns enriched metadata if valid, None if hallucinated.
    """
    if not doi or not doi.startswith('10.'):
        logger.debug(f"[TIER1] DOI format invalid: '{doi}'")
        return None

    # Step 1: Validate DOI exists via HEAD request
    doi_url = f'https://doi.org/{doi}'
    try:
        async with session.head(
            doi_url,
            timeout=aiohttp.ClientTimeout(total=VALIDATION_TIMEOUT),
            allow_redirects=True
        ) as response:
            if response.status >= 400:
                logger.info(f"[TIER1] DOI {doi} invalid (HTTP {response.status})")
                return None
    except Exception as e:
        logger.info(f"[TIER1] DOI {doi} validation failed: {e}")
        return None

    # Step 2: Try to find PMID via PubMed DOI search
    pmids = await search_pubmed(f'{doi}[doi]', session, max_results=1)
    if pmids:
        details = await fetch_pubmed_details(pmids[:1], session)
        if details:
            result = details[0]
            result['source'] = 'model_doi_validated'
            result['doi'] = doi
            logger.info(f"[TIER1] DOI {doi} → PMID {result.get('pmid')}: '{result.get('title', '?')[:60]}'")
            return result

    # Step 3: DOI is valid but no PMID found — return with DOI URL
    logger.info(f"[TIER1] DOI {doi} valid but no PMID found, using DOI URL")
    return {
        'uri': doi_url,
        'title': f'Article (DOI: {doi})',
        'doi': doi,
        'source': 'model_doi_validated',
        'verified': True
    }


def validate_pubmed_relevance(result: Dict, citation: Dict, min_overlap: int = 1) -> bool:
    """
    Valida se o artigo PubMed retornado é relevante para a citação original.

    Evita retornar artigos irrelevantes (ex: artigo de COVID-19 quando buscando chia/constipação).

    Args:
        result: Dict com dados do PubMed (title, author, etc.)
        citation: Dict original com keywords, author, year
        min_overlap: Mínimo de keywords que devem aparecer no título

    Returns:
        True se o artigo parece relevante, False caso contrário
    """
    title = result.get('title', '').lower()
    keywords = citation.get('keywords', [])
    author = citation.get('author', '')

    # Se não tem título ou título muito curto, não podemos validar - rejeitar
    if not title or len(title) < 20:
        logger.warning(f"[PUBMED_RELEVANCE] Rejeitado: título muito curto ou ausente ({len(title) if title else 0} chars)")
        return False

    # Verificar consistência de ano (±1 tolerância para pre-prints)
    citation_year = citation.get('year', '')
    result_year = result.get('year', '')
    if citation_year and result_year:
        try:
            year_diff = abs(int(citation_year) - int(result_year))
            if year_diff > 1:
                logger.warning(f"[PUBMED_RELEVANCE] ❌ Ano incompatível: citação={citation_year}, resultado={result_year} (diff={year_diff})")
                return False
        except ValueError:
            pass  # Se não consegue parsear, ignorar verificação de ano

    # Se tem autor e o autor está no resultado, é provavelmente relevante
    if author:
        author_lower = author.lower().split()[0]  # Primeiro nome/sobrenome
        if author_lower in title or author_lower in result.get('author', '').lower():
            logger.debug(f"[PUBMED_RELEVANCE] ✅ Autor '{author}' encontrado no resultado")
            return True

    # Verificar overlap de keywords no título
    if keywords:
        overlap_count = 0
        matched_keywords = []
        for kw in keywords:
            kw_lower = kw.lower()
            if kw_lower in title:
                overlap_count += 1
                matched_keywords.append(kw)

        if overlap_count >= min_overlap:
            logger.debug(f"[PUBMED_RELEVANCE] ✅ Keywords encontradas no título: {matched_keywords}")
            return True
        else:
            logger.warning(f"[PUBMED_RELEVANCE] ❌ Overlap insuficiente: {overlap_count}/{min_overlap} keywords. Title: '{title[:80]}...', Keywords: {keywords[:3]}")
            return False

    # Sem keywords para validar - aceitar se tem autor, rejeitar caso contrário
    if author:
        return True

    logger.warning(f"[PUBMED_RELEVANCE] ❌ Sem keywords nem autor para validar relevância")
    return False


def _extract_simple_keywords(text: str) -> List[str]:
    """Extract words >= 5 chars from text for relevance validation."""
    words = re.findall(r'\b[a-zA-Z]{5,}\b', text.lower())
    noise = {
        'author', 'journal', 'title', 'available', 'accessed', 'retrieved',
        'https', 'volume', 'pages', 'issue', 'published', 'article',
    }
    return [w for w in words if w not in noise][:8]


async def lookup_citation_fulltext(
    citation_text: str,
    session: aiohttp.ClientSession
) -> Optional[Dict]:
    """
    Tier 2: Sends raw citation text as free-text query to PubMed.
    PubMed is good at resolving author names, abbreviations, organizations from free text.

    Args:
        citation_text: Raw citation line (e.g. "Mancia G, et al. 2024 ESC Guidelines for hypertension...")
        session: aiohttp session

    Returns:
        Dict with PubMed metadata or None
    """
    if not citation_text or len(citation_text) < 15:
        return None

    # Clean: remove numbering prefix, PMID/DOI already handled by Tier 1
    cleaned = re.sub(r'^\s*\d+\.\s*', '', citation_text).strip()
    cleaned = re.sub(r'\s*(?:PMID|DOI)[:\s]*\S+', '', cleaned, flags=re.IGNORECASE).strip()
    # Truncate to 200 chars for PubMed query
    query = cleaned[:200]

    logger.info(f"[TIER2] Fulltext query: '{query[:80]}...'")

    # Attempt 1: Full query
    pmids = await search_pubmed(query, session, max_results=3)

    # Attempt 2: If no results, try shorter query (first 100 chars)
    if not pmids and len(query) > 100:
        short_query = query[:100]
        logger.debug(f"[TIER2] Retrying with shorter query: '{short_query[:60]}...'")
        pmids = await search_pubmed(short_query, session, max_results=3)

    if not pmids:
        logger.info(f"[TIER2] No results for: '{query[:60]}...'")
        return None

    details = await fetch_pubmed_details(pmids[:3], session)
    if not details:
        return None

    # Validate relevance using simple keyword overlap
    keywords = _extract_simple_keywords(cleaned)
    citation_proxy = {'keywords': keywords, 'original_text': cleaned[:200]}

    # Extract year from citation for relevance check
    year_match = re.search(r'\b(20[0-2]\d)\b', cleaned)
    if year_match:
        citation_proxy['year'] = year_match.group(1)

    for result in details:
        if validate_pubmed_relevance(result, citation_proxy, min_overlap=1):
            result['source'] = 'pubmed_fulltext_lookup'
            result['original_citation'] = cleaned[:200]
            logger.info(f"[TIER2] Found: '{cleaned[:50]}...' → PMID {result.get('pmid')}")
            return result

    logger.info(f"[TIER2] Results rejected by relevance check for: '{query[:50]}...'")
    return None


def _split_ref_section_into_lines(ref_section: str) -> List[str]:
    """
    Splits a [REFS] section into individual citation lines.
    Handles numbered lists, bullet points, and plain newlines.
    """
    if not ref_section:
        return []

    lines = []

    # Try numbered pattern first (1. ..., 2. ..., etc.)
    numbered = re.split(r'(?:^|\n)\s*\d+\.\s+', ref_section)
    numbered = [l.strip() for l in numbered if l.strip() and len(l.strip()) > 15]
    if numbered:
        return numbered

    # Try bullet points
    bulleted = re.split(r'(?:^|\n)\s*[\*\-•]\s+', ref_section)
    bulleted = [l.strip() for l in bulleted if l.strip() and len(l.strip()) > 15]
    if bulleted:
        return bulleted

    # Fallback: split by newlines
    for line in ref_section.strip().split('\n'):
        line = re.sub(r'^[\s\*\-•\d\.]+', '', line).strip()
        if len(line) > 15:
            lines.append(line)

    return lines


async def lookup_citation_in_pubmed(
    citation: Dict,
    session: aiohttp.ClientSession
) -> Optional[Dict]:
    """
    Tenta encontrar uma citação textual no PubMed.

    Args:
        citation: Dict com 'author', 'year', 'keywords' parseados
        session: Sessão aiohttp

    Returns:
        Dict com metadados do PubMed ou None se não encontrar
    """
    author = citation.get('author', '')
    year = citation.get('year', '')
    keywords = citation.get('keywords', [])

    logger.info(f"[PUBMED] Buscando: autor='{author}', ano='{year}', keywords={keywords[:3]}")

    # Estratégia 1: Busca específica com campos
    if author and year:
        # Para guidelines, usar apenas autor e ano (títulos longos atrapalham)
        query = f"{author}[Author] AND {year}[pdat]"
        logger.debug(f"[PUBMED] Query específica: {query}")
        pmids = await search_pubmed(query, session, max_results=3)

        if pmids:
            details = await fetch_pubmed_details(pmids[:3], session)
            for result in details:
                # Validar relevância antes de retornar (min_overlap=1 pois já filtramos por autor+ano)
                if validate_pubmed_relevance(result, citation, min_overlap=1):
                    result['original_citation'] = citation.get('original_text', '')
                    logger.info(f"[PUBMED] ✅ Encontrado (query específica): '{author} {year}' → PMID {result.get('pmid')}")
                    return result
            logger.info(f"[PUBMED] Strategy 1: {len(details)} resultados rejeitados por irrelevância para '{author} {year}'")

    # Estratégia 2: Busca com keywords se autor falhou
    if keywords and year:
        # Usar primeiras 3 keywords + ano (3 para maior especificidade em buscas de org)
        kw_count = min(3, len(keywords))
        kw_query = ' AND '.join([f"{kw}[Title]" for kw in keywords[:kw_count]])
        query = f"{kw_query} AND {year}[pdat]"
        logger.debug(f"[PUBMED] Query com keywords: {query}")
        pmids = await search_pubmed(query, session, max_results=3)

        if pmids:
            # Buscar detalhes de até 3 resultados para encontrar um relevante
            details = await fetch_pubmed_details(pmids[:3], session)
            for result in details:
                if validate_pubmed_relevance(result, citation, min_overlap=1):
                    result['original_citation'] = citation.get('original_text', '')
                    logger.info(f"[PUBMED] ✅ Encontrado (keywords): '{keywords[:2]} {year}' → PMID {result.get('pmid')}")
                    return result
            logger.debug(f"[PUBMED] Nenhum dos {len(details)} resultados passou na validação de relevância")

    # Estratégia 3: Busca mais relaxada (texto livre) - REQUER VALIDAÇÃO ESTRITA
    if author or keywords:
        relaxed_parts = []
        if author:
            relaxed_parts.append(author)
        if year:
            relaxed_parts.append(year)
        if keywords:
            relaxed_parts.extend(keywords[:2])

        relaxed_query = ' '.join(relaxed_parts)
        logger.debug(f"[PUBMED] Query relaxada: {relaxed_query}")
        pmids = await search_pubmed(relaxed_query, session, max_results=5)

        if pmids:
            # Buscar detalhes de até 5 resultados para encontrar um relevante
            # A busca relaxada é mais propensa a retornar resultados irrelevantes
            details = await fetch_pubmed_details(pmids[:5], session)
            for result in details:
                # Exigir pelo menos 2 keywords no título para busca relaxada (evita off-topic)
                if validate_pubmed_relevance(result, citation, min_overlap=2):
                    result['original_citation'] = citation.get('original_text', '')
                    logger.info(f"[PUBMED] ✅ Encontrado (relaxada+validada): '{relaxed_query[:50]}...' → PMID {result.get('pmid')}")
                    return result
            logger.warning(f"[PUBMED] Busca relaxada retornou {len(details)} resultados, mas nenhum passou na validação de relevância (min_overlap=2)")

    logger.warning(f"[PUBMED] ❌ Não encontrado ou irrelevante: autor='{author}', ano='{year}', keywords={keywords[:3]}")
    return None


def extract_inline_citations(text: str) -> List[Dict]:
    """
    Extrai citações inline do corpo do texto (não da seção de referências).

    Procura por padrões como:
    - "segundo a diretriz ESC 2024"
    - "Heidenreich et al. (2022)"
    - "guidelines ACC/AHA 2022"
    - "conforme Smith et al., 2023"

    Usado quando não há seção de referências mas há grounding sources,
    para complementar com referências PubMed adicionais.
    """
    if not text:
        return []

    citations = []
    seen = set()  # Evitar duplicatas

    # Padrões para capturar citações inline
    patterns = [
        # Autor et al. (ano) ou Autor et al., ano
        r'([A-Z][a-zA-Z\-\']+)\s+et\s+al\.?\s*[,\(]\s*(20[0-2]\d)',
        # diretriz/guideline + organização + ano
        r'(?:diretriz|guideline|diretrizes|guidelines)\s+(?:da\s+|do\s+)?([A-Z]{2,}(?:/[A-Z]{2,})?)\s+(?:de\s+)?(20[0-2]\d)',
        # organização + ano (ex: "ESC 2024", "AHA 2022")
        r'\b(ESC|AHA|ACC|HFSA|ESH|SBC|SBEM|WHO|NICE)\s+(20[0-2]\d)\b',
        # Autor ano (sem et al.) - ex: "Mancia 2024"
        r'([A-Z][a-zA-Z\-\']+)\s+(20[0-2]\d)\s+(?:guidelines?|diretrizes?)',
    ]

    for pattern in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        for match in matches:
            if len(match) >= 2:
                # match pode ser (autor, ano) ou (org, ano)
                identifier = match[0] if isinstance(match[0], str) else str(match[0])
                year = match[1] if len(match) > 1 else match[0]

                # Criar chave única para evitar duplicatas
                key = f"{identifier.lower()}_{year}"
                if key in seen:
                    continue
                seen.add(key)

                # Determinar se é autor ou organização
                orgs = {'esc', 'aha', 'acc', 'hfsa', 'esh', 'sbc', 'sbem', 'who', 'nice'}
                if identifier.lower() in orgs:
                    # É uma organização - usar como keyword
                    citations.append({
                        'year': year,
                        'keywords': [identifier.lower(), 'guideline'],
                        'original_text': f"{identifier} {year} guideline"
                    })
                else:
                    # É um autor
                    citations.append({
                        'author': identifier,
                        'year': year,
                        'original_text': f"{identifier} et al. {year}"
                    })

    if citations:
        logger.info(f"[INLINE_CITATIONS] Extraídas {len(citations)} citações inline do corpo do texto")

    return citations[:5]  # Limitar a 5 para não atrasar


# =============================================================================
# URL Validation Functions
# =============================================================================

async def _probe_url(url: str, method: str, session: aiohttp.ClientSession, timeout: int):
    """Single HTTP probe. Returns (is_valid, status) where status is the HTTP
    code on a response, or an error string ('timeout'/'conn'/'err') on failure
    (is_valid=None in that case)."""
    try:
        async with session.request(
            method, url,
            timeout=aiohttp.ClientTimeout(total=timeout),
            allow_redirects=True,
        ) as response:
            return (200 <= response.status < 400), response.status
    except asyncio.TimeoutError:
        return None, 'timeout'
    except aiohttp.ClientError as e:
        return None, f'conn:{e}'
    except Exception as e:
        return None, f'err:{e}'


async def validate_url(url: str, session: aiohttp.ClientSession) -> bool:
    """
    Valida se uma URL existe (retorna 200-399).
    Usa HEAD primeiro (mínima transferência). Muitos servidores médicos recusam
    HEAD (405/403) ou bloqueiam bots (999) mas respondem 200 ao GET — então,
    quando o HEAD é inconclusivo ou bloqueado, confirmamos com um GET leve antes
    de descartar. Só um 404/410 definitivo (ou ambos falharem) derruba a ref.
    """
    head_ok, head_status = await _probe_url(url, 'HEAD', session, VALIDATION_TIMEOUT)
    if head_ok is True:
        return True
    if head_status in (404, 410):
        logger.warning(f"[REF_VALIDATION] URL inexistente ({head_status}): {url}")
        return False

    # HEAD bloqueado/falhou/inconclusivo → confirmar com GET leve
    get_ok, get_status = await _probe_url(url, 'GET', session, FETCH_TIMEOUT)
    if get_ok is True:
        return True
    logger.warning(f"[REF_VALIDATION] URL inválida (HEAD={head_status}, GET={get_status}): {url}")
    return False


async def fetch_metadata(url: str, session: aiohttp.ClientSession, skip_fetch: bool = False) -> Dict:
    """
    Faz fetch de uma URL e extrai metadados (título, autor, ano).

    Args:
        url: URL para fazer fetch
        session: Sessão aiohttp
        skip_fetch: Se True, retorna apenas estrutura básica sem fetch
    """
    # Estrutura base com uri (compatível com formato existente)
    metadata = {
        'uri': url,
        'verified': True
    }

    if skip_fetch:
        # Extrair domínio como título fallback
        domain = urlparse(url).netloc.replace('www.', '')
        metadata['title'] = domain
        return metadata

    try:
        async with session.get(
            url,
            timeout=aiohttp.ClientTimeout(total=FETCH_TIMEOUT),
            allow_redirects=True
        ) as response:
            if response.status != 200:
                # Ainda é válido, só não conseguimos metadados
                domain = urlparse(url).netloc.replace('www.', '')
                metadata['title'] = domain
                return metadata

            html = await response.text()

            # Importar BeautifulSoup apenas quando necessário
            try:
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(html, 'html.parser')
            except ImportError:
                logger.warning("[REF_FETCH] BeautifulSoup não instalado, usando fallback")
                domain = urlparse(url).netloc.replace('www.', '')
                metadata['title'] = domain
                return metadata

            # Extrair título
            title_tag = soup.find('title')
            if title_tag:
                title = title_tag.get_text().strip()
                # Limpar títulos muito longos ou com lixo
                if title and len(title) < 500:
                    metadata['title'] = title

            # Extrair meta tags
            for meta in soup.find_all('meta'):
                name = meta.get('name', '').lower()
                property_ = meta.get('property', '').lower()
                content = meta.get('content', '')

                if not content:
                    continue

                # Autor
                if name in ('author', 'citation_author', 'dc.creator') or property_ == 'article:author':
                    if 'author' not in metadata:  # Pegar só o primeiro
                        metadata['author'] = content[:200]  # Limitar tamanho

                # Data/Ano
                elif name in ('citation_publication_date', 'citation_date', 'dc.date') or property_ == 'article:published_time':
                    year = extract_year(content)
                    if year:
                        metadata['year'] = year

            # Para PubMed, tentar extrair do título da página
            if 'pubmed' in url.lower() and 'title' in metadata and 'year' not in metadata:
                pubmed_meta = parse_pubmed_title(metadata['title'])
                metadata.update(pubmed_meta)

            # Fallback: se não tem título, usar domínio
            if 'title' not in metadata:
                domain = urlparse(url).netloc.replace('www.', '')
                metadata['title'] = domain

    except asyncio.TimeoutError:
        logger.debug(f"[REF_FETCH] Timeout extraindo metadados de {url}")
        domain = urlparse(url).netloc.replace('www.', '')
        metadata['title'] = domain
    except Exception as e:
        logger.debug(f"[REF_FETCH] Erro extraindo metadados de {url}: {e}")
        domain = urlparse(url).netloc.replace('www.', '')
        metadata['title'] = domain

    return metadata


def extract_year(date_str: str) -> Optional[str]:
    """Extrai ano de uma string de data."""
    if not date_str:
        return None
    match = re.search(r'(19|20)\d{2}', date_str)
    return match.group(0) if match else None


def parse_pubmed_title(title: str) -> Dict:
    """
    Parseia título de página PubMed para extrair autor e ano.
    Formato típico: "Article Title - Author1 AB, Author2 CD - Year - PubMed"
    """
    result = {}
    if not title:
        return result

    # Tentar extrair ano (formato: "- 2024 -" ou "- 2024 ")
    year_match = re.search(r'- ((?:19|20)\d{2})(?:\s|$|-)', title)
    if year_match:
        result['year'] = year_match.group(1)

    return result


def extract_references_from_text(text: str) -> Tuple[List[Dict], Optional[str], List[Dict]]:
    """
    Extrai referências bibliográficas do texto gerado pelo modelo.
    Procura pelo marcador [REFS] ou headers tradicionais em múltiplos idiomas.

    Returns:
        Tuple: (
            lista de refs com URLs (for URL validation),
            seção de referências raw,
            lista de identifiers [{'type': 'pmid'|'doi', 'value': '...', 'citation_text': '...'}]
        )
    """
    if not text:
        return [], None, []

    refs = []
    identifiers = []
    seen_urls = set()
    seen_identifiers = set()
    ref_section = None

    # === ESTRATÉGIA 1: Marcador especial [REFS] ===
    refs_marker = '[REFS]'
    marker_pos = text.find(refs_marker)
    if marker_pos != -1:
        # Tudo após o marcador é a seção de referências
        ref_section = text[marker_pos + len(refs_marker):].strip()
        logger.debug(f"[REF_EXTRACT] Seção extraída via marcador [REFS]: {len(ref_section)} chars")

    # === ESTRATÉGIA 2: Fallback - Padrões tradicionais ===
    if not ref_section:
        # Padrões para encontrar seção de referências (múltiplos idiomas)
        section_patterns = [
            # Formato inline: "Referências Bibliográficas: 1. Author..." (sem quebra de linha)
            r'(?:Referências\s*Bibliográficas|Bibliografia|References|Referências|Referencias|Références|Riferimenti)\s*:\s*((?:\d+\.\s+[^\n]+(?:\s+\d+\.\s+[^\n]+)*)|[\s\S]+?)(?:\n\n\n|\Z)',
            # Formato com quebra de linha após header
            r'(?:Referências\s*Bibliográficas|Bibliografia|References|Referências|Referencias|Références|Riferimenti)\s*:?\s*\n([\s\S]+?)(?:\n\n\n|\Z)',
            # Formato markdown bold: **Referências Bibliográficas:** 1. Author...
            r'\*\*(?:Referências\s*Bibliográficas|Bibliografia|Referências|References|Referencias|Références|Riferimenti)\*\*:?\s*([\s\S]+?)(?:\n\n\n|\Z)',
            # Formato markdown header: ### Referências
            r'#{1,3}\s*(?:Referências|References|Bibliografia|Referencias|Références|Riferimenti)\s*\n([\s\S]+?)(?:\n\n\n|\Z)',
        ]

        for pattern in section_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                ref_section = match.group(1)
                logger.debug(f"[REF_EXTRACT] Seção extraída via padrão regex: {len(ref_section)} chars")
                break

    if not ref_section:
        return [], None, []

    # Extrair URLs da seção (for URL validation in validate_and_enrich_references)
    url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+(?<![.,;:)\]])'
    urls = re.findall(url_pattern, ref_section)

    for url in urls:
        url = url.rstrip('.,;:)\'\"')
        url_lower = url.lower()
        # Skip doi.org URLs — these are handled as DOI identifiers below
        if 'doi.org/' in url_lower:
            continue
        # Skip pubmed URLs — these are handled as PMID identifiers below
        if 'pubmed.ncbi.nlm.nih.gov/' in url_lower:
            continue
        if url_lower not in seen_urls:
            seen_urls.add(url_lower)
            refs.append({
                'uri': url,
                'source': 'model_text',
                'verified': False
            })

    # Extract PMIDs as identifiers (Tier 1 will validate them)
    pmid_pattern = r'PMID[:\s]*(\d{7,8})'
    for match in re.finditer(pmid_pattern, ref_section, re.IGNORECASE):
        pmid = match.group(1)
        if pmid not in seen_identifiers:
            seen_identifiers.add(pmid)
            # Find the citation line this PMID belongs to
            line_start = ref_section.rfind('\n', 0, match.start())
            line_start = 0 if line_start == -1 else line_start + 1
            line_end = ref_section.find('\n', match.end())
            line_end = len(ref_section) if line_end == -1 else line_end
            citation_text = ref_section[line_start:line_end].strip()

            identifiers.append({
                'type': 'pmid',
                'value': pmid,
                'citation_text': citation_text
            })

    # Extract DOIs as identifiers (Tier 1 will validate them)
    doi_pattern = r'(?:DOI|doi)[:\s]*(10\.\d{4,}/[^\s,;]+)'
    for match in re.finditer(doi_pattern, ref_section):
        doi = match.group(1).rstrip('.,;:)\'\"')
        if doi not in seen_identifiers:
            seen_identifiers.add(doi)
            line_start = ref_section.rfind('\n', 0, match.start())
            line_start = 0 if line_start == -1 else line_start + 1
            line_end = ref_section.find('\n', match.end())
            line_end = len(ref_section) if line_end == -1 else line_end
            citation_text = ref_section[line_start:line_end].strip()

            identifiers.append({
                'type': 'doi',
                'value': doi,
                'citation_text': citation_text
            })

    # Also extract bare DOIs (10.xxxx/xxx without DOI: prefix, not in doi.org URL)
    bare_doi_pattern = r'(?<!\w)(10\.\d{4,}/[^\s,;]+)'
    for match in re.finditer(bare_doi_pattern, ref_section):
        doi = match.group(1).rstrip('.,;:)\'\"')
        if doi not in seen_identifiers:
            seen_identifiers.add(doi)
            line_start = ref_section.rfind('\n', 0, match.start())
            line_start = 0 if line_start == -1 else line_start + 1
            line_end = ref_section.find('\n', match.end())
            line_end = len(ref_section) if line_end == -1 else line_end
            citation_text = ref_section[line_start:line_end].strip()

            identifiers.append({
                'type': 'doi',
                'value': doi,
                'citation_text': citation_text
            })

    logger.info(f"[REF_EXTRACT] Found {len(refs)} URLs, {len(identifiers)} identifiers ({sum(1 for i in identifiers if i['type'] == 'pmid')} PMIDs, {sum(1 for i in identifiers if i['type'] == 'doi')} DOIs)")

    return refs, ref_section, identifiers


def remove_references_section(text: str) -> str:
    """
    Remove a seção de referências do texto para evitar duplicação.
    A seção unificada será exibida separadamente pelo frontend.

    Estratégia em 2 níveis:
    1. PRIMÁRIO: Detectar marcador especial [REFS] (mais confiável)
    2. FALLBACK: Busca por headers conhecidos em múltiplos idiomas
    """
    if not text:
        return text

    # Log para debug
    logger.debug(f"[REF_REMOVE] Texto antes (últimos 500 chars): ...{text[-500:] if len(text) > 500 else text}")

    result = text
    cut_position = -1
    matched_marker = None

    # === ESTRATÉGIA 1: Marcador especial [REFS] ===
    # Este é o método mais confiável - funciona em qualquer idioma
    refs_marker = '[REFS]'
    marker_pos = text.find(refs_marker)
    if marker_pos != -1:
        # Encontrar o início da linha onde o marcador aparece
        line_start = text.rfind('\n', 0, marker_pos)
        if line_start == -1:
            line_start = 0
        else:
            line_start += 1  # Pular o \n

        cut_position = line_start
        matched_marker = refs_marker
        logger.info(f"[REF_REMOVE] Marcador '{refs_marker}' encontrado na posição {marker_pos}, cortando a partir de {line_start}")

    # === ESTRATÉGIA 2: Fallback - Headers em múltiplos idiomas ===
    if cut_position == -1:
        # Headers em português, inglês, espanhol, francês, alemão, italiano
        ref_headers = [
            # Português
            'Referências Bibliográficas', 'Referências', 'Bibliografia',
            # Inglês
            'References', 'Bibliography', 'Bibliographic References',
            # Espanhol
            'Referencias Bibliográficas', 'Referencias', 'Bibliografía',
            # Francês
            'Références Bibliographiques', 'Références', 'Bibliographie',
            # Alemão
            'Literaturverzeichnis', 'Quellenangaben', 'Referenzen',
            # Italiano
            'Riferimenti Bibliografici', 'Riferimenti', 'Bibliografia',
        ]

        text_lower = text.lower()
        for header in ref_headers:
            header_lower = header.lower()
            pos = text_lower.rfind(header_lower)  # rfind = última ocorrência

            if pos != -1:
                # Verificar se está em uma posição razoável (últimos 40% do texto)
                # para evitar cortar menções no meio do conteúdo
                if pos > len(text) * 0.6:
                    # Encontrar o início da linha onde o header aparece
                    line_start = text.rfind('\n', 0, pos)
                    if line_start == -1:
                        line_start = 0
                    else:
                        line_start += 1  # Pular o \n

                    # Se encontramos uma posição válida e é antes de qualquer corte anterior
                    if cut_position == -1 or line_start < cut_position:
                        cut_position = line_start
                        matched_marker = header
                        logger.info(f"[REF_REMOVE] Header '{header}' encontrado na posição {pos}, cortando a partir de {line_start}")

    # Aplicar o corte se encontramos algo
    if cut_position != -1:
        result = text[:cut_position].rstrip()
        chars_removed = len(text) - len(result)
        logger.info(f"[REF_REMOVE] Removidos {chars_removed} chars após '{matched_marker}'")
    else:
        logger.debug("[REF_REMOVE] Nenhuma seção de referências encontrada para remover")

    logger.debug(f"[REF_REMOVE] Texto depois (últimos 200 chars): ...{result[-200:] if len(result) > 200 else result}")

    return result


VERTEX_REDIRECT_PREFIX = 'vertexaisearch.cloud.google.com/grounding-api-redirect'
REDIRECT_TIMEOUT = 3  # segundos para resolver redirects


async def resolve_redirect_url(url: str, session: aiohttp.ClientSession, timeout: int = REDIRECT_TIMEOUT) -> str:
    """
    Resolve Vertex AI redirect URLs para obter a URL final real.

    O Vertex AI (google-genai >= 1.65.0) retorna URIs opacas como
    vertexaisearch.cloud.google.com/grounding-api-redirect/... em vez de URLs reais.
    Resolvemos via HEAD request com allow_redirects=True.
    """
    try:
        async with session.head(
            url,
            timeout=aiohttp.ClientTimeout(total=timeout),
            allow_redirects=True
        ) as response:
            final_url = str(response.url)
            if final_url != url:
                logger.info(f"[GROUNDING_RESOLVE] Redirect resolvido: {url[:80]}... → {final_url[:120]}")
                return final_url
            return url
    except Exception as e:
        logger.warning(f"[GROUNDING_RESOLVE] Falha ao resolver redirect: {e}")
        return url  # fallback: manter redirect original


def is_trusted_domain(url: str) -> bool:
    """Verifica se a URL pertence a um domínio confiável."""
    try:
        domain = urlparse(url).netloc.lower()
        return any(trusted in domain for trusted in TRUSTED_DOMAINS)
    except Exception:
        return False


async def validate_and_enrich_references(
    grounding_sources: List[Dict],
    text_references: List[Dict]
) -> List[Dict]:
    """
    Valida e enriquece todas as referências em paralelo.

    Args:
        grounding_sources: Sources do Google Grounding (já verificadas pelo Google)
        text_references: Referências extraídas do texto (precisam validação)

    Returns:
        Lista unificada de referências válidas e enriquecidas
    """
    unified = []
    seen_urls = set()

    # Headers para simular navegador e evitar bloqueios
    headers = {
        'User-Agent': 'Mozilla/5.0 (compatible; QythonBot/1.0; Medical Reference Validator)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    }

    try:
        async with aiohttp.ClientSession(headers=headers) as session:

            # 1. Processar grounding sources (já verificadas pelo Google)
            # Resolver redirect URLs do Vertex AI em paralelo antes de deduplicar
            sources_to_process = [s for s in (grounding_sources or []) if s.get('uri')]

            # Identificar quais URIs precisam de resolução (redirect do Vertex AI)
            redirect_tasks = []
            redirect_indices = []
            for i, source in enumerate(sources_to_process):
                uri = source.get('uri', '')
                if VERTEX_REDIRECT_PREFIX in uri:
                    redirect_tasks.append(resolve_redirect_url(uri, session))
                    redirect_indices.append(i)

            # Resolver redirects em paralelo
            if redirect_tasks:
                logger.info(f"[GROUNDING] Resolvendo {len(redirect_tasks)} redirect URLs do Vertex AI")
                resolved_urls = await asyncio.gather(*redirect_tasks, return_exceptions=True)
                for idx, resolved in zip(redirect_indices, resolved_urls):
                    if isinstance(resolved, str):
                        sources_to_process[idx]['uri'] = resolved
                    # Se deu exceção, mantém a URI original

            # Deduplicar por URL final e adicionar ao resultado
            for source in sources_to_process:
                uri = source.get('uri', '')
                if not uri:
                    continue

                uri_lower = uri.lower()
                if uri_lower in seen_urls:
                    continue
                seen_urls.add(uri_lower)

                # Usar título do grounding se disponível, senão domínio
                title = source.get('title')
                if not title:
                    title = urlparse(uri).netloc.replace('www.', '')

                unified.append({
                    'uri': uri,
                    'title': title,
                    'source': 'grounding',
                    'verified': True
                })

            grounding_resolved = len(redirect_indices) if redirect_tasks else 0
            logger.info(f"[GROUNDING] {len([u for u in unified if u.get('source') == 'grounding'])} fontes estruturadas extraídas ({grounding_resolved} redirects resolvidos)")

            # 2. Validar e processar referências do texto
            if text_references:
                text_tasks = []
                text_refs_to_process = []

                for ref in text_references:
                    uri = ref.get('uri', '')
                    if not uri:
                        continue

                    uri_lower = uri.lower()
                    if uri_lower in seen_urls:
                        continue
                    seen_urls.add(uri_lower)
                    text_refs_to_process.append(ref)

                    # Verificar se domínio é confiável
                    if is_trusted_domain(uri):
                        # Domínio confiável: apenas enriquecer metadados (sem validar existência)
                        text_tasks.append(fetch_metadata(uri, session, skip_fetch=False))
                    else:
                        # Domínio desconhecido: validar primeiro, depois enriquecer
                        text_tasks.append(validate_and_fetch(uri, session))

                if text_tasks:
                    text_results = await asyncio.gather(*text_tasks, return_exceptions=True)
                    for i, result in enumerate(text_results):
                        if isinstance(result, Exception):
                            logger.warning(f"[REF_VALIDATION] Exceção processando referência: {result}")
                            continue

                        if isinstance(result, dict) and result.get('verified', False):
                            result['source'] = 'model_text'
                            unified.append(result)
                        else:
                            ref_uri = text_refs_to_process[i].get('uri', 'unknown')
                            logger.info(f"[REF_VALIDATION] Referência descartada (alucinação?): {ref_uri}")

    except Exception as e:
        logger.error(f"[REF_PROCESS] Erro no processamento de referências: {e}")
        # Em caso de erro, retornar pelo menos as grounding sources
        for source in (grounding_sources or []):
            uri = source.get('uri', '')
            if uri and uri.lower() not in seen_urls:
                unified.append({
                    'uri': uri,
                    'title': source.get('title', urlparse(uri).netloc),
                    'source': 'grounding',
                    'verified': True
                })

    return unified


async def validate_and_fetch(url: str, session: aiohttp.ClientSession) -> Dict:
    """Valida URL e, se válida, extrai metadados."""
    is_valid = await validate_url(url, session)
    if not is_valid:
        return {'uri': url, 'verified': False}

    return await fetch_metadata(url, session)


def interleave_references(refs: List[Dict]) -> List[Dict]:
    """
    Intercala referências PubMed com outras fontes para distribuição natural.

    Estratégia:
    1. Primeira referência PubMed vai para posição [1] (mais visível)
    2. Restante é intercalado: 2 grounding/outras, 1 PubMed, 2 grounding/outras...

    Isso evita que todas as refs PubMed fiquem amontoadas no final,
    criando uma apresentação mais orgânica e gerando confiança imediata
    ao mostrar uma fonte acadêmica verificada logo no início.
    """
    if not refs or len(refs) <= 2:
        return refs

    # Separar por tipo
    PUBMED_SOURCES = {'pubmed_lookup', 'pubmed_fulltext_lookup', 'model_pmid_validated', 'model_doi_validated'}
    pubmed_refs = [r for r in refs if r.get('source') in PUBMED_SOURCES]
    other_refs = [r for r in refs if r.get('source') not in PUBMED_SOURCES]

    # Se não tem PubMed, retornar como está
    if not pubmed_refs:
        return refs

    # Se não tem outras refs, retornar só PubMed
    if not other_refs:
        return pubmed_refs

    result = []

    # 1. Primeira ref PubMed vai para posição [1]
    first_pubmed = pubmed_refs.pop(0)
    result.append(first_pubmed)

    # 2. Intercalar: 2 outras, 1 PubMed, 2 outras, 1 PubMed...
    other_idx = 0
    pubmed_idx = 0
    batch_size = 2  # Quantas refs "outras" entre cada PubMed

    while other_idx < len(other_refs) or pubmed_idx < len(pubmed_refs):
        # Adicionar batch de refs "outras"
        for _ in range(batch_size):
            if other_idx < len(other_refs):
                result.append(other_refs[other_idx])
                other_idx += 1

        # Adicionar uma ref PubMed
        if pubmed_idx < len(pubmed_refs):
            result.append(pubmed_refs[pubmed_idx])
            pubmed_idx += 1

    logger.info(f"[REF_INTERLEAVE] Referências intercaladas: PubMed na posição 1, total {len(result)} refs")

    return result


# =============================================================================
# RANKING DE QUALIDADE / CLASSIFICAÇÃO CANÔNICA
# =============================================================================
# Filosofia: dar ao médico "munição" acionável. Bula/regulador/diretriz no topo;
# PubMed/journal relevante em seguida; referência clínica confiável; o resto
# (blog/rede social/agregador) é cortado. Não citar fonte de baixa autoridade.
_JUNK_DOMAINS = (
    'wordpress.com', 'blogspot.', 'medium.com', '.blog', 'substack.com',
    'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'youtube.com',
    'reddit.com', 'quora.com', 'pinterest.', 'tiktok.com', 'linkedin.com',
    'doctronic.ai', 'droracle.ai', 'slideshare.net', 'scribd.com',
)
_LABEL_REGULATOR_DOMAINS = (
    'anvisa.gov.br', 'consultas.anvisa', 'dailymed.nlm.nih.gov', 'accessdata.fda.gov',
    'fda.gov', 'ema.europa.eu', 'medsafe.govt.nz', 'mhra.gov.uk', 'cima.aemps.es',
    'aemps.es', 'tga.gov.au', 'hc-sc.gc.ca', 'bulario',
    # fabricantes (hospedam bula / prescribing info) — surge bula BR no topo
    'sandoz.com', 'novartis.com', 'pfizer.com', 'bayer.com', 'gsk.com', 'roche.com',
    'abbvie.com', 'sanofi.com', 'takeda.com', 'janssen.com', 'eurofarma.com',
    'ems.com.br', 'ache.com.br', 'medley.com.br', 'libbs.com', 'cristalia',
    'teuto.com', 'germed', 'hypera', 'biolab',
)
_GUIDELINE_DOMAINS = (
    'who.int', 'cdc.gov', 'nice.org.uk', 'escardio.org', 'acc.org',
    'heart.org', 'idsociety.org', 'cardiol.br', 'sign.ac.uk', 'guidelines.gov',
    # Sociedades/órgãos que publicam diretriz — internacionais
    'thoracic.org', 'ersnet.org', 'kdigo.org', 'goldcopd.org', 'diabetes.org',
    'easl.eu', 'esmo.org', 'asco.org', 'nccn.org', 'sccm.org', 'rheumatology.org',
    'gastro.org', 'ashp.org', 'thyroid.org', 'aafp.org', 'uspreventiveservicestaskforce.org',
    # Achados na auditoria de referências reais (ago/2026): caíam como "web" genérica
    'ginasthma.org', 'ginaasthma.org', 'globalinitiativeforasthma.org', 'atsjournals.org',
    'acr.org', 'aan.com', 'aasm.org', 'eular.org', 'ecdc.europa.eu', 'paho.org',
    'ahrq.gov', 'sbd.org.br', 'sbc.org.br', 'sbot.org.br', 'sbgg.org.br',
    # Sociedades brasileiras (diretrizes nacionais)
    'sbpt.org.br', 'amb.org.br', 'febrasgo.org.br', 'sbim.org.br', 'infectologia.org.br',
    'sbn.org.br', 'sbem.org.br', 'sbp.com.br', 'diabetes.org.br', 'reumatologia.org.br',
    'endocrino.org.br', 'sbmfc.org.br',
    # Órgãos de saúde do governo BR que PUBLICAM diretriz nacional (não é "gov" genérico):
    # INCA (diretrizes de câncer), Biblioteca Virtual do MS, CONITEC (PCDT), e o path '/pcdt'
    # (Protocolos Clínicos e Diretrizes Terapêuticas) no gov.br. Sem isso, a Diretriz do INCA/MS
    # caía em gov/60 → selo "Web" (errado: é a diretriz nacional).
    'inca.gov.br', 'bvsms.saude.gov.br', 'conitec.gov.br', '/pcdt',
)
# Livros / manuais / compêndios point-of-care (terciária revisada) → selo "Livro".
# StatPearls/Bookshelf casam pelo path '/books/' também (ver _classify_reference).
_BOOK_DOMAINS = (
    'statpearls.com', 'ncbi.nlm.nih.gov/books', 'bookshelf',
    'uptodate.com', 'dynamed.com', 'bestpractice.bmj.com',
    'msdmanuals.com', 'merckmanuals.com', 'accessmedicine', 'ebmedicine',
    'whitebook',
    # Fast Facts (Palliative Care Network of Wisconsin): referência clínica concisa, revisada
    # editorialmente — NÃO é lixo; mesmo balde dos compêndios point-of-care.
    'mypcnow.org',
)
_JOURNAL_DOMAINS = (
    'ncbi.nlm.nih.gov', 'nejm.org', 'thelancet.com', 'jamanetwork.com', 'bmj.com',
    'nature.com', 'springer.com', 'sciencedirect.com', 'elsevier.com', 'wiley.com',
    'oup.com', 'sagepub.com', 'cochranelibrary.com', 'plos.org', 'frontiersin.org',
    'mdpi.com', 'scielo.br', 'scielosp.org', 'bvsalud.org', 'ahajournals.org',
    # Achados na auditoria (ago/2026): editora médica caindo como 'other' e sendo
    # descartada pela política de fallback junto com blog de cursinho.
    'thieme-connect.de', 'thieme.com', 'karger.com', 'jamanetwork.org', 'annals.org',
    'acpjournals.org', 'atsjournals.org', 'chestnet.org', 'aappublications.org',
)
# Portais de saúde / órgãos / info ao paciente — boa fonte institucional, MAS o selo é
# "Web" (decisão do user: só 5 selos). Mantidos com autoridade média p/ ranquear acima de
# blog/agregador, mesmo exibindo "Web".
_CLINICAL_REF_DOMAINS = (
    'medlineplus.gov', 'nih.gov', 'nhs.uk', 'mayoclinic.org', 'drugs.com',
    'medscape.com', 'mskcc.org', 'clevelandclinic.org', 'rxlist.com',
    'epocrates.com', 'hopkinsmedicine.org',
    'hsl.org.br', 'einstein.br', 'saudedireta', 'medicinanet',
    # Referência clínica reconhecida que estava em 'other' (auditoria ago/2026)
    'litfl.com', 'radiopaedia.org', 'geekymedics.com', 'patient.info', 'bmjbestpractice.com',
)


# Diretriz publicada em REVISTA: tem PMID/DOI (pareceria "Artigo"), mas o título denuncia que
# é diretriz/consenso → promove p/ "Diretriz". Preciso p/ NÃO pegar paper SOBRE diretrizes:
# exige "for (the) management/diagnosis/treatment/prevention" OU terminar em "guideline(s)".
_GUIDELINE_TITLE_RE = re.compile(
    r'(?:diretrizes?|consenso|posicionamento|recomenda[çc][õo]es|'
    r'consensus statement|position statement|clinical practice guideline|practice guideline|'
    r'best practice recommendation|practice recommendation|consensus recommendation|'
    r'(?:guidelines?|recommendations?) for (?:the )?(?:management|diagnosis|treatment|prevention|use|care)|'
    r'(?:guidelines?|recommendations?)[\s.]*$)',
    re.IGNORECASE)


def _matches_junk(hay: str) -> bool:
    """Match de domínio de lixo com BORDA de domínio (não substring solto). Sem isso, 'x.com'
    (junk = Twitter/X) casava DENTRO de 'goodrx.com' e derrubava farmácia/preço por engano —
    qualquer '*rx.com'. Trata os 3 formatos da lista: sufixo de TLD ('.blog'), prefixo
    ('blogspot.'), e domínio cheio ('x.com', 'wordpress.com')."""
    for d in _JUNK_DOMAINS:
        if d.startswith('.'):                                            # TLD/sufixo: '.blog'
            if re.search(re.escape(d) + r'(?:[/\s]|$)', hay):
                return True
        elif d.endswith('.'):                                            # prefixo: 'blogspot.'
            if re.search(r'(?:^|[/.\s])' + re.escape(d), hay):
                return True
        elif re.search(r'(?:^|[/.\s@])' + re.escape(d) + r'(?:[/:?\s]|$)', hay):  # domínio cheio
            return True
    return False


# Hierarquia de evidência: o tipo de publicação do PubMed entra no ranking. Antes,
# meta-análise, diretriz e RELATO DE CASO valiam o mesmo ("PubMed/90") — o que é errado
# como ordem de evidência e colocava um relato de caso de 1998 na frente de uma revisão
# sistemática de 2024. O ajuste é fino de propósito: não inverte a ordem das CLASSES
# (bula > diretriz > artigo), só desempata dentro delas.
_STRONG_DESIGNS = ('meta-analysis', 'systematic review', 'practice guideline', 'guideline',
                   'consensus development conference')
_TRIAL_DESIGNS = ('randomized controlled trial', 'clinical trial, phase iii')
_WEAK_DESIGNS = ('case reports', 'letter', 'editorial', 'comment', 'news', 'newspaper article',
                 'historical article', 'biography', 'preprint', 'retracted publication')


def _evidence_bonus(ref: Dict) -> int:
    """Ajuste de autoridade por DESENHO de estudo e RECÊNCIA (só onde temos o metadado —
    referência resolvida no PubMed traz `pub_types` e `year`)."""
    bonus = 0
    tipos = ' | '.join(t.lower() for t in (ref.get('pub_types') or []))
    if tipos:
        if any(k in tipos for k in _STRONG_DESIGNS):
            bonus += 6
        elif any(k in tipos for k in _TRIAL_DESIGNS):
            bonus += 4
        if any(k in tipos for k in _WEAK_DESIGNS):
            bonus -= 10
        if 'retracted publication' in tipos:      # retratado nunca sustenta conduta
            bonus -= 40
    try:
        ano = int(str(ref.get('year') or '')[:4])
    except (TypeError, ValueError):
        ano = 0
    if ano:
        idade = datetime.now(timezone.utc).year - ano
        if idade <= 3:
            bonus += 4
        elif idade <= 7:
            bonus += 2
        elif idade >= 25:
            bonus -= 8
        elif idade >= 15:
            bonus -= 4
    return bonus


def _classify_reference(ref: Dict) -> Dict:
    """Anota `source_type` + `authority` (0-100) + `pmid` pela URL resolvida. Classificação
    canônica única → ranking confiável e badge consistente (sem parse frágil no front).
    authority=0 marca lixo (descartado em rank_and_filter_references)."""
    uri = (ref.get('uri') or '').lower()
    title = (ref.get('title') or '').lower()
    src = ref.get('source') or ''
    # O redirect do Vertex às vezes NÃO resolve → a URI fica opaca e o domínio real vem no
    # título (ex.: title="doctronic.ai"). Classifica olhando URI + título.
    hay = uri + ' ' + title

    def has(domains):
        return any(d in hay for d in domains)

    # Um grounding que aponta pro PubMed também ganha pmid → badge correto.
    if not ref.get('pmid') and 'pubmed.ncbi.nlm.nih.gov' in uri:
        m = re.search(r'/(\d{6,9})/?', uri)
        if m:
            ref['pmid'] = m.group(1)

    is_validated_pubmed = src in ('model_pmid_validated', 'pubmed_lookup')
    is_fuzzy_pubmed = src == 'pubmed_fulltext_lookup'
    is_pubmed_url = 'pubmed.ncbi.nlm.nih.gov' in uri or bool(ref.get('pmid'))

    if _matches_junk(hay):
        ref['source_type'], ref['authority'] = 'other', 0           # descartar (ruído real)
    elif has(_LABEL_REGULATOR_DOMAINS) or '/bula' in uri:
        # bula/regulador/fabricante (munição). 'bula' SÓ no PATH da URL (/bula...) — não em
        # qualquer lugar do título, senão página de editora ("manole.com.br") ou livro com a
        # palavra "bula" no título subia indevidamente p/ label/96.
        ref['source_type'], ref['authority'] = 'label', 96
    elif has(_GUIDELINE_DOMAINS):
        ref['source_type'], ref['authority'] = 'guideline', 94
    elif (ref.get('pmid') or 'doi.org' in uri or has(_JOURNAL_DOMAINS)) and _GUIDELINE_TITLE_RE.search(title):
        # diretriz/consenso publicado em revista (tem PMID/DOI) — título denuncia que é diretriz
        ref['source_type'], ref['authority'] = 'guideline', 94
    elif '/books/' in uri or has(_BOOK_DOMAINS):
        # Livro/manual de referência (StatPearls, MSD, UpToDate). ANTES de pubmed/journal:
        # StatPearls vive em ncbi.nlm.nih.gov/books (que também casa _JOURNAL_DOMAINS).
        ref['source_type'], ref['authority'] = 'book', 80
    elif (is_validated_pubmed or is_pubmed_url) and not is_fuzzy_pubmed:
        ref['source_type'], ref['authority'] = 'pubmed', 90
    elif 'doi.org' in uri or src == 'model_doi_validated':
        ref['source_type'], ref['authority'] = 'doi', 88
    elif has(_JOURNAL_DOMAINS):
        ref['source_type'], ref['authority'] = 'journal', 82
    elif has(_CLINICAL_REF_DOMAINS):
        ref['source_type'], ref['authority'] = 'reference', 75
    elif is_fuzzy_pubmed:
        # match fuzzy do PubMed (Tier2/3): autoridade menor — evita "PubMed irrelevante" no topo
        ref['source_type'], ref['authority'] = 'pubmed', 72
    elif '.gov' in hay or '.edu' in hay:
        ref['source_type'], ref['authority'] = 'gov', 60
    elif '.org' in hay:
        ref['source_type'], ref['authority'] = 'other', 45
    else:
        ref['source_type'], ref['authority'] = 'other', 30

    if ref['authority'] > 0:
        # A SUBIDA é limitada a +3 para não furar a hierarquia de CLASSES (bula 96 >
        # diretriz 94 > PubMed 90): uma meta-análise recente com +10 passaria a bula, o
        # que inverteria a ordem desenhada. A DESCIDA é livre — é ali que está o ganho:
        # relato de caso, editorial e artigo retratado precisam mesmo cair.
        ajuste = min(3, _evidence_bonus(ref))
        if ajuste:
            # piso 5: o ajuste nunca transforma referência válida em lixo (0 = descartar)
            ref['authority'] = max(5, min(99, ref['authority'] + ajuste))
            ref['evidence_bonus'] = ajuste
    return ref


_REL_STOP = {
    'the', 'and', 'for', 'with', 'from', 'this', 'that', 'study', 'effect', 'effects',
    'levels', 'changes', 'following', 'using', 'versus', 'among', 'patients', 'clinical',
    'review', 'analysis', 'randomized', 'controlled', 'trial', 'case', 'report', 'treatment',
    'role', 'novel', 'method', 'methods', 'results', 'between', 'after', 'during',
    'de', 'da', 'do', 'em', 'para', 'com', 'uma', 'dos', 'das', 'que', 'por', 'sobre',
}


def _title_relevant_to_text(title: str, text: str, min_hits: int = 1) -> bool:
    """Anti-PMID-alucinado: o título da referência precisa compartilhar ao menos `min_hits`
    palavra(s) de conteúdo (≥4 letras, fora stopwords) com a resposta. Match por SUBSTRING,
    então o nome do fármaco casa entre línguas (title "gabapentin" ⊂ resposta "gabapentina").
    Pega PMID que o modelo inventou (ex.: paper de glutamato retiniano numa resposta de
    gabapentina) — conservador: só rejeita quando NÃO há nenhuma palavra de conteúdo em comum."""
    words = {w for w in re.findall(r'[a-zà-ÿ]{4,}', (title or '').lower()) if w not in _REL_STOP}
    if not words:
        return False
    tl = (text or '').lower()
    return sum(1 for w in words if w in tl) >= min_hits


def _ref_log_label(ref: Dict) -> str:
    """Rótulo curto e identificável de uma ref p/ log: autor/ano (se PMID) ou o domínio real
    (do host da URI; se o redirect veio opaco do Vertex, usa o título, que tem o domínio)."""
    if ref.get('pmid'):
        base = f"{ref.get('author') or ''} {ref.get('year') or ''}".strip() or f"PMID:{ref['pmid']}"
        return base[:45]
    uri = ref.get('uri') or ''
    m = re.search(r'https?://(?:www\.)?([^/]+)', uri)
    host = m.group(1) if m else ''
    if not host or 'vertexaisearch' in host:
        host = ''  # redirect opaco → o domínio real está no título
    return (host or (ref.get('title') or '').strip())[:45] or '?'


# Fontes que sustentam conduta clínica. O resto ('other') é portal/blog/curso: pode ser
# útil quando não há nada melhor, mas ao lado de uma diretriz só dilui a lista.
_STRONG_TYPES = {'label', 'guideline', 'pubmed', 'doi', 'journal', 'book'}


def rank_and_filter_references(refs: List[Dict], max_refs: int = None) -> List[Dict]:
    """Classifica, descarta lixo (blog/rede social/agregador) e ordena por autoridade
    (bula/diretriz > PubMed/journal > clínico). Corta em `max_refs`. Ordenação ESTÁVEL:
    dentro do mesmo tier preserva a ordem original (relevância do grounding).

    ⚠️ **Fonte "web" é FALLBACK, não complemento** (diretiva do fundador, ago/2026):
    auditoria de 42 respostas reais mostrou 42% das referências no tipo `other` — cursinho
    de residência, blog de hospital, site de plano de saúde — e 14% das respostas TRAZIAM
    SÓ isso. Referência fraca ao lado de uma diretriz não agrega: subtrai, porque sinaliza
    curadoria ruim. Havendo `REF_WEB_FALLBACK_MIN_STRONG` fontes fortes, as `other` saem.
    Quando não há nada melhor, elas continuam aparecendo — melhor uma fonte fraca do que
    afirmação sem lastro."""
    if not refs:
        return refs
    max_refs = max_refs or getattr(Config, 'REF_MAX', 5)
    for r in refs:
        _classify_reference(r)
    junk = [r for r in refs if r.get('authority', 0) <= 0]
    kept = [r for r in refs if r.get('authority', 0) > 0]
    if not kept:
        kept, junk = list(refs), []  # nunca zera tudo (fallback de segurança)

    minimo_forte = getattr(Config, 'REF_WEB_FALLBACK_MIN_STRONG', 2)
    fortes = [r for r in kept if r.get('source_type') in _STRONG_TYPES]
    if len(fortes) >= minimo_forte:
        web = [r for r in kept if r.get('source_type') == 'other']
        if web:
            kept = [r for r in kept if r.get('source_type') != 'other']
            logger.info("[REF_RANK] %d fonte(s) 'web' descartada(s) — a resposta já tem %d forte(s): %s",
                        len(web), len(fortes), ' | '.join(_ref_log_label(r) for r in web[:5]))
    kept.sort(key=lambda r: r.get('authority', 0), reverse=True)  # stable → desempata por ordem
    final = kept[:max_refs]
    cut = len(kept) - len(final)
    # Log rico: cada ref final como "N.tipo/autoridade(domínio)" + o lixo descartado (com domínio)
    finais = ' '.join(
        f"{i}.{r.get('source_type')}/{r.get('authority')}({_ref_log_label(r)})"
        for i, r in enumerate(final, 1)
    )
    logger.info(f"[REF_RANK] {len(refs)}→{len(final)} | descartados: {len(junk)} lixo + {cut} corte | FINAIS: {finais}")
    if junk:
        logger.info(f"[REF_RANK]   LIXO: {', '.join(_ref_log_label(r) for r in junk)}")
    return final


def _build_pubmed_query(search_queries: Optional[List[str]], response_text: str, ref_section: Optional[str] = None) -> str:
    """Monta uma query p/ a busca ATIVA no PubMed (Tier 4). Prefere as buscas que o Gemini fez
    no grounding (já vêm focadas e muitas em inglês = melhor recall no PubMed). Sem grounding,
    usa os TÍTULOS das citações que o modelo escreveu no [REFS] (são tópicos reais, em inglês);
    senão cai nas palavras-chave da resposta. Escolhe a query com mais palavras ASCII (viés inglês)."""
    candidates = [q.strip() for q in (search_queries or []) if q and len(q.strip()) > 3]
    if candidates:
        best = max(candidates, key=lambda q: sum(1 for w in q.split() if w.isascii()))
        return best[:200]
    # Sem grounding: os títulos das citações do [REFS] mencionam o assunto → bom material tópico.
    if ref_section:
        kws = _extract_simple_keywords(ref_section)
        if kws:
            return ' '.join(kws[:6])
    kws = _extract_simple_keywords(response_text)
    return ' '.join(kws[:5]) if kws else ''


async def process_references(
    response_text: str,
    grounding_sources: List[Dict],
    search_queries: Optional[List[str]] = None,
    grounded: bool = False,
    force_pubmed: bool = False
) -> tuple:
    """
    Processa referências usando waterfall de 4 tiers:

    Tier 1: Identifiers diretos (PMID/DOI fornecidos pelo modelo) → valida via PubMed/DOI
    Tier 2: Fulltext search (citation text raw → PubMed free-text query)
    Tier 3: Inline citations fallback (quando sem seção [REFS])
    Tier 4: Busca ATIVA no PubMed (relevância-guardada) quando nenhum artigo indexado apareceu

    Args:
        response_text: Texto da resposta do LLM
        grounding_sources: Sources do Google Grounding
        search_queries: Buscas que o Gemini fez no grounding (material p/ a busca ativa Tier 4)

    Returns:
        tuple: (texto_limpo, referencias_unificadas)
    """
    # 1. Extract references from text (URLs + identifiers + raw section)
    text_refs, ref_section, identifiers = extract_references_from_text(response_text)
    logger.info(f"[REF_PROCESS] Extracted {len(text_refs)} URLs, {len(identifiers)} identifiers from model text")

    # 2. Validate and enrich URL references (grounding + model URLs)
    unified_refs = await validate_and_enrich_references(grounding_sources, text_refs)

    grounding_count = len([r for r in unified_refs if r.get('source') == 'grounding'])
    text_count = len([r for r in unified_refs if r.get('source') == 'model_text'])
    logger.info(f"[REF_PROCESS] After URL validation: {len(unified_refs)} refs ({grounding_count} grounding, {text_count} model_text)")

    # Deduplication tracking
    seen_pmids = set()
    seen_titles_lower = set()

    for ref in unified_refs:
        uri = ref.get('uri', '')
        title = ref.get('title', '')
        if 'pubmed' in uri.lower():
            pmid_match = re.search(r'/(\d{7,8})/?', uri)
            if pmid_match:
                seen_pmids.add(pmid_match.group(1))
        if title:
            seen_titles_lower.add(title.lower()[:50])

    def _add_ref(result: Dict) -> bool:
        """Add a reference if not duplicate. Returns True if added."""
        if not result:
            return False
        pmid = result.get('pmid', '')
        title = result.get('title', '')
        if pmid and pmid in seen_pmids:
            logger.debug(f"[REF_DEDUP] PMID {pmid} already exists, skipping")
            return False
        if title and title.lower()[:50] in seen_titles_lower:
            logger.debug(f"[REF_DEDUP] Title already exists: {title[:50]}...")
            return False
        if pmid:
            seen_pmids.add(pmid)
        if title:
            seen_titles_lower.add(title.lower()[:50])
        unified_refs.append(result)
        return True

    # PubMed API session headers
    headers = {
        'User-Agent': 'QythonMedicalCopilot/1.0 (Medical Education Platform; mailto:support@qython.ai)'
    }

    tier1_pmid_count = 0
    tier1_doi_count = 0
    tier2_count = 0
    tier3_count = 0
    tier4_count = 0
    resolved_citation_texts = set()  # Track which citation lines were resolved by Tier 1

    try:
        async with aiohttp.ClientSession(headers=headers) as session:

            # ============================================================
            # TIER 1: Validate direct identifiers (PMID/DOI from model)
            # ============================================================
            if identifiers:
                logger.info(f"[TIER1] Validating {len(identifiers)} identifiers from model")

                for i, ident in enumerate(identifiers):
                    if i > 0:
                        await asyncio.sleep(PUBMED_BASE_DELAY)

                    try:
                        if ident['type'] == 'pmid':
                            result = await validate_pmid(ident['value'], session)
                            if result and not _title_relevant_to_text(result.get('title', ''), response_text):
                                logger.warning(f"[TIER1] PMID {ident['value']} descartado por irrelevância (modelo alucinou?): '{result.get('title', '')[:60]}'")
                            elif result and _add_ref(result):
                                tier1_pmid_count += 1
                                resolved_citation_texts.add(ident.get('citation_text', ''))
                        elif ident['type'] == 'doi':
                            result = await validate_doi(ident['value'], session)
                            if result and not _title_relevant_to_text(result.get('title', ''), response_text):
                                logger.warning(f"[TIER1] DOI {ident['value']} descartado por irrelevância: '{result.get('title', '')[:60]}'")
                            elif result and _add_ref(result):
                                tier1_doi_count += 1
                                resolved_citation_texts.add(ident.get('citation_text', ''))
                    except Exception as e:
                        logger.debug(f"[TIER1] Error validating {ident['type']} {ident['value']}: {e}")

                logger.info(f"[TIER1] Results: {tier1_pmid_count} PMIDs validated, {tier1_doi_count} DOIs validated")

            # ============================================================
            # TIER 2: Fulltext PubMed search for unresolved citation lines
            # ============================================================
            if ref_section:
                citation_lines = _split_ref_section_into_lines(ref_section)
                logger.info(f"[TIER2] {len(citation_lines)} citation lines from ref section, {len(resolved_citation_texts)} already resolved by Tier 1")

                unresolved_lines = []
                for line in citation_lines:
                    # Skip lines already resolved by Tier 1
                    is_resolved = False
                    for resolved in resolved_citation_texts:
                        if resolved and (line.strip()[:40] in resolved[:40] or resolved[:40] in line.strip()[:40]):
                            is_resolved = True
                            break
                    if not is_resolved:
                        unresolved_lines.append(line)

                max_tier2 = 5  # Limit to avoid slow responses
                for i, line in enumerate(unresolved_lines[:max_tier2]):
                    if i > 0 or identifiers:  # Delay if there were Tier 1 requests too
                        await asyncio.sleep(PUBMED_BASE_DELAY)

                    try:
                        result = await lookup_citation_fulltext(line, session)
                        if result and _add_ref(result):
                            tier2_count += 1
                    except Exception as e:
                        logger.debug(f"[TIER2] Error looking up citation: {e}")

                logger.info(f"[TIER2] Results: {tier2_count} citations found via fulltext search")

            # ============================================================
            # TIER 3: Inline citations fallback (no [REFS] section or few results)
            # ============================================================
            pubmed_count = tier1_pmid_count + tier1_doi_count + tier2_count
            if pubmed_count < 2 and not ref_section:
                inline_citations = extract_inline_citations(response_text)
                if inline_citations:
                    logger.info(f"[TIER3] Trying {len(inline_citations)} inline citations from body text")

                    max_tier3 = 5
                    for i, citation in enumerate(inline_citations[:max_tier3]):
                        if i > 0 or pubmed_count > 0:
                            await asyncio.sleep(PUBMED_BASE_DELAY)

                        try:
                            result = await lookup_citation_in_pubmed(citation, session)
                            if result and _add_ref(result):
                                tier3_count += 1
                        except Exception as e:
                            logger.debug(f"[TIER3] Error looking up inline citation: {e}")

                    logger.info(f"[TIER3] Results: {tier3_count} citations found via inline lookup")

            # ============================================================
            # TIER 4: Busca ATIVA no PubMed (relevância-guardada) — REDE DE SEGURANÇA quando
            # NENHUM artigo indexado apareceu via grounding/tiers. Garante literatura primária
            # quando ela existe, sem reintroduzir PMID irrelevante (guard _title_relevant_to_text).
            # GATE: dispara quando o modelo SINALIZOU intenção de embasar — houve grounding
            # (`grounded`), OU escreveu um bloco [REFS] (`ref_section`), OU citou identificadores
            # (mesmo inválidos). Cobre o caso em que o lite NÃO grounseia mas escreve [REFS] com
            # PMIDs alucinados/irresolvíveis: a busca ativa recupera o artigo real do tópico.
            # Conversa/planejamento puro (nenhum desses sinais) → 0 refs forçadas.
            # ============================================================
            has_pubmed = any(
                r.get('pmid') or 'pubmed.ncbi.nlm.nih.gov' in (r.get('uri') or '').lower()
                for r in unified_refs
            )
            if not has_pubmed and (grounded or ref_section or identifiers or force_pubmed):
                pq = _build_pubmed_query(search_queries, response_text, ref_section)
                if pq:
                    await asyncio.sleep(PUBMED_BASE_DELAY)
                    try:
                        active_pmids = await search_pubmed(pq, session, max_results=4)
                        if active_pmids:
                            details = await fetch_pubmed_details(active_pmids, session)
                            for d in details:
                                if tier4_count >= 2:
                                    break
                                if _title_relevant_to_text(d.get('title', ''), response_text) and _add_ref(d):
                                    tier4_count += 1
                        logger.info(f"[TIER4] Busca ativa PubMed '{pq[:60]}' → {len(active_pmids)} PMIDs, {tier4_count} adicionados (relevantes)")
                    except Exception as e:
                        logger.debug(f"[TIER4] Erro na busca ativa PubMed: {e}")

    except Exception as e:
        logger.warning(f"[REF_PROCESS] PubMed session error: {e}")

    # Log final breakdown
    final_grounding = len([r for r in unified_refs if r.get('source') == 'grounding'])
    final_text = len([r for r in unified_refs if r.get('source') == 'model_text'])
    logger.info(
        f"[REF_PROCESS] Final: {len(unified_refs)} refs "
        f"(Tier1-PMID: {tier1_pmid_count}, Tier1-DOI: {tier1_doi_count}, "
        f"Tier2-fulltext: {tier2_count}, Tier3-inline: {tier3_count}, "
        f"Tier4-active: {tier4_count}, "
        f"grounding: {final_grounding}, model_text: {final_text})"
    )

    # Ranking de qualidade: classifica, descarta lixo, ordena por autoridade
    # (bula/diretriz > PubMed/journal > clínico) e corta no máximo. Substitui o antigo
    # interleave (que jogava qualquer PubMed — até match irrelevante — pra posição 1).
    unified_refs = rank_and_filter_references(unified_refs)

    # Always strip the [REFS] block from the visible text — even when we
    # resolved zero structured refs — so the raw "[REFS]\n1. ... PMID:" marker
    # never leaks into the answer the user sees (it used to leak whenever every
    # reference was dropped by validation/PubMed timeouts).
    original_len = len(response_text)
    clean_text = remove_references_section(response_text)
    removed_chars = original_len - len(clean_text)
    if unified_refs:
        logger.info(f"[REF_PROCESS] Structured refs available, removed {removed_chars} chars from text")
    else:
        logger.info(f"[REF_PROCESS] No structured refs resolved; stripped {removed_chars} chars of raw [REFS] block")

    return clean_text, unified_refs
