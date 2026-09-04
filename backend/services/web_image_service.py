"""Busca de imagem médica em acervos abertos, para ilustrar a resposta do copiloto.

Complementa `image_lookup_service` (que procura no material do PRÓPRIO usuário): quando a
biblioteca dele não tem nada que corresponda, buscamos em acervos públicos.

**Por que não pela busca do Google:** a Custom Search JSON API está FECHADA para clientes
novos e será desligada em 1º/jan/2027 — provado ao vivo (403 `This project does not have
the access to Custom Search JSON API` com tudo corretamente configurado). As APIs abaixo
são melhores para o nosso caso por um motivo que vai além de serem gratuitas: elas
devolvem **licença e autoria como dado estruturado**, que é exatamente o que a atribuição
exige. Com a busca do Google isso seria inferido de um metadado que quase nunca vem.

Duas garantias de projeto:
- **Só licença que permite uso comercial com atribuição** (domínio público, CC0, CC BY,
  CC BY-SA). NC e ND são recusadas — o Qython é produto pago.
- **Proxy com cache, nunca hotlink**: a imagem é baixada na hora da resposta e servida por
  nós. Hotlink quebraria quando a origem mudasse (e a URL fica gravada na resposta) e
  entregaria o IP do médico ao site de origem a cada leitura.
"""

import asyncio
import hashlib
import html
import logging
import os
import re
from typing import Dict, List, Optional

import aiohttp

from ..config import Config

logger = logging.getLogger("qython_logger")

# ⚠️ Pasta PERMANENTE, não a de upload temporário: a URL da imagem fica gravada na
# resposta do chat e o médico relê a conversa meses depois. Em `temp_upload/` o janitor
# varreria o cache e as imagens das respostas antigas morreriam.
CACHE_DIR = os.path.join(Config.PERMANENT_UPLOAD_FOLDER, 'web_image_cache')
os.makedirs(CACHE_DIR, exist_ok=True)

TIMEOUT = aiohttp.ClientTimeout(total=12)
USER_AGENT = "QythonMedicalCopilot/1.0 (https://qython.ai; suporte@qython.ai)"
MAX_BYTES = 6 * 1024 * 1024          # imagem maior que isso não vale a pena servir
THUMB_WIDTH = 900

# Licenças aceitas: permitem uso comercial exigindo apenas atribuição.
_LICENSE_OK = re.compile(r'^(cc0|cc[- ]by([- ]sa)?([- ]\d)?|public domain|pd[- ]|no restrictions)', re.I)
_LICENSE_BAD = re.compile(r'(non[- ]?commercial|\bnc\b|no[- ]?deriv|\bnd\b|fair use|copyright)', re.I)


def _strip_html(texto: str) -> str:
    return html.unescape(re.sub(r'<[^>]+>', '', texto or '')).strip()


def _license_allowed(nome: str) -> bool:
    n = (nome or '').strip()
    if not n or _LICENSE_BAD.search(n):
        return False
    return bool(_LICENSE_OK.match(n))


_TERMO_STOP = {'the', 'and', 'with', 'from', 'this', 'that', 'view', 'image', 'photo',
               'photograph', 'medical', 'clinical', 'patient', 'human', 'case'}


def _relevante(consulta: str, titulo: str, descricao: str = '') -> bool:
    """A imagem tem de casar o ACHADO, não só palavras soltas da consulta.

    O acervo aberto indexa por texto livre, então "electrocardiogram ST elevation
    myocardial infarction" traz um ECG normal chamado "ECG 001" — casou "ECG", não o
    supradesnivelamento. Numa resposta clínica isso é pior que não ilustrar. Exigimos que
    a MAIORIA dos termos significativos da consulta apareça no título/descrição do
    arquivo, e ao menos um termo específico (>= 6 letras)."""
    termos = {t for t in re.findall(r'[a-z]{4,}', (consulta or '').lower()) if t not in _TERMO_STOP}
    if not termos:
        return False
    alvo = f"{titulo} {descricao}".lower()
    casados = {t for t in termos if t in alvo}
    if len(casados) < max(2, (len(termos) + 1) // 2):
        return False
    return any(len(t) >= 6 for t in casados)


def cache_key(url: str) -> str:
    return hashlib.sha256((url or '').encode()).hexdigest()[:32]


def cached_path(key: str) -> str:
    return os.path.join(CACHE_DIR, f"{key}.img")


async def _buscar_commons(session: aiohttp.ClientSession, consulta: str, limite: int) -> List[Dict]:
    """Wikimedia Commons: acervo grande de imagem médica, licença sempre declarada."""
    params = {
        'action': 'query', 'format': 'json', 'generator': 'search',
        'gsrsearch': f'{consulta} filetype:bitmap|drawing', 'gsrnamespace': '6',
        'gsrlimit': str(max(3, limite * 3)),
        'prop': 'imageinfo', 'iiprop': 'url|extmetadata|size|mime',
        'iiurlwidth': str(THUMB_WIDTH),
    }
    async with session.get('https://commons.wikimedia.org/w/api.php', params=params) as r:
        if r.status != 200:
            logger.warning(f"[WEB_IMG] Commons HTTP {r.status}")
            return []
        data = await r.json()

    saida = []
    for page in (data.get('query', {}).get('pages', {}) or {}).values():
        info = (page.get('imageinfo') or [{}])[0]
        meta = info.get('extmetadata') or {}
        licenca = _strip_html((meta.get('LicenseShortName') or {}).get('value', ''))
        if not _license_allowed(licenca):
            continue
        url = info.get('thumburl') or info.get('url')
        if not url or not (info.get('mime') or '').startswith('image/'):
            continue
        titulo = _strip_html(page.get('title', '')).replace('File:', '').rsplit('.', 1)[0]
        descricao = _strip_html((meta.get('ImageDescription') or {}).get('value', ''))[:400]
        if not _relevante(consulta, titulo, descricao):
            continue
        saida.append({
            'url': url,
            'titulo': titulo,
            'autor': _strip_html((meta.get('Artist') or {}).get('value', ''))[:80] or 'Wikimedia Commons',
            'licenca': licenca,
            'pagina': info.get('descriptionurl') or '',
            'fonte': 'Wikimedia Commons',
        })
    return saida


async def _buscar_openverse(session: aiohttp.ClientSession, consulta: str, limite: int) -> List[Dict]:
    """Openverse: só indexa conteúdo com licença aberta; complementa o Commons."""
    params = {'q': consulta, 'page_size': str(max(3, limite * 3)),
              'license_type': 'commercial,modification', 'mature': 'true'}
    async with session.get('https://api.openverse.org/v1/images/', params=params) as r:
        if r.status != 200:
            logger.info(f"[WEB_IMG] Openverse HTTP {r.status} (ignorando)")
            return []
        data = await r.json()

    saida = []
    for it in (data.get('results') or []):
        lic = (it.get('license') or '').upper()
        versao = it.get('license_version') or ''
        nome = f"CC {lic} {versao}".strip() if lic not in ('CC0', 'PDM') else lic
        if not _license_allowed(nome):
            continue
        url = it.get('url')
        titulo = (it.get('title') or '')[:120]
        if not url or not _relevante(consulta, titulo, ' '.join(it.get('tags_list') or [])):
            continue
        saida.append({
            'url': url,
            'titulo': titulo or consulta,
            'autor': (it.get('creator') or it.get('source') or 'Openverse')[:80],
            'licenca': nome,
            'pagina': it.get('foreign_landing_url') or '',
            'fonte': (it.get('source') or 'Openverse').title(),
        })
    return saida


async def _baixar_e_cachear(session: aiohttp.ClientSession, url: str) -> Optional[str]:
    """Baixa a imagem para o cache local. Devolve a chave, ou None se não deu."""
    chave = cache_key(url)
    destino = cached_path(chave)
    if os.path.exists(destino) and os.path.getsize(destino) > 0:
        return chave
    try:
        async with session.get(url) as r:
            if r.status != 200:
                return None
            tipo = (r.headers.get('Content-Type') or '')
            if not tipo.startswith('image/'):
                return None
            declarado = int(r.headers.get('Content-Length') or 0)
            if declarado and declarado > MAX_BYTES:
                return None
            # ⚠️ `content.read(n)` lê ATÉ n bytes do stream, não o corpo inteiro — usá-lo
            # aqui truncava toda imagem no primeiro chunk (~12 KB) e o JPEG chegava
            # corrompido ao usuário. Ler em pedaços, acumulando, com teto de tamanho.
            buf = bytearray()
            async for pedaco in r.content.iter_chunked(64 * 1024):
                buf.extend(pedaco)
                if len(buf) > MAX_BYTES:
                    return None
            dados = bytes(buf)
            if not dados:
                return None
        with open(destino, 'wb') as f:
            f.write(dados)
        return chave
    except Exception as e:
        logger.info(f"[WEB_IMG] falha ao baixar {url[:60]}: {e}")
        return None


async def find_open_medical_image(consulta: str, limite: int = 1) -> List[Dict]:
    """Imagens de acervo aberto para `consulta` (em inglês), já baixadas para o cache.

    Devolve [{url, alt, credito, pagina}] — `url` é do NOSSO proxy, não da origem.
    """
    if not consulta or not consulta.strip() or not getattr(Config, 'WEB_IMAGE_SEARCH_ENABLED', True):
        return []
    consulta = consulta.strip()[:150]
    headers = {'User-Agent': USER_AGENT, 'Accept': 'application/json'}
    achadas: List[Dict] = []
    try:
        async with aiohttp.ClientSession(timeout=TIMEOUT, headers=headers) as session:
            resultados = await asyncio.gather(
                _buscar_commons(session, consulta, limite),
                _buscar_openverse(session, consulta, limite),
                return_exceptions=True,
            )
            candidatas: List[Dict] = []
            for r in resultados:
                if isinstance(r, list):
                    candidatas.extend(r)
                else:
                    logger.info(f"[WEB_IMG] fonte falhou: {r}")

            for c in candidatas:
                if len(achadas) >= limite:
                    break
                chave = await _baixar_e_cachear(session, c['url'])
                if not chave:
                    continue
                credito = f"{c['fonte']} · {c['autor']} · {c['licenca']}"
                achadas.append({
                    'url': f"/api/academic/web-images/{chave}",
                    'alt': c['titulo'][:180],
                    'credito': credito,
                    'pagina': c['pagina'],
                })
    except Exception as e:
        logger.warning(f"[WEB_IMG] busca falhou para '{consulta[:40]}': {e}")
        return []

    logger.info(f"[WEB_IMG] '{consulta[:50]}' → {len(achadas)} imagem(ns) de acervo aberto")
    return achadas
