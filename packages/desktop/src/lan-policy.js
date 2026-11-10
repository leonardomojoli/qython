// O que a porta da rede local (para o celular pareado) deixa passar.
//
// Essa porta é a única do app aberta para fora do computador, então a regra é restritiva: ela não
// serve o app web, não aceita login por senha e não deixa o celular administrar aparelhos nem a conta
// de administrador. O celular entra pelo pareamento e depois usa a API com o acesso do aparelho.
import os from 'node:os';

/** Sem login: o celular ainda não tem acesso (ou só quer saber se o servidor responde). */
const OPEN = new Set([
  'GET /api/health',
  'GET /api/public/config',
  'POST /api/pairing/claim',
  'POST /api/pairing/token',
]);

/** Nunca pela rede local, nem logado. */
const DENIED_PREFIXES = [
  '/api/auth', // login, cadastro e recuperação de senha: o celular pareia, não digita senha
  '/api/pairing/start', // gerar código vale só pela janela do computador
  '/api/pairing/devices', // listar e revogar aparelhos também
  '/api/admin', // console de administração
];

const WS_PATH = '/api/notifications/ws';

/**
 * Decide o que fazer com uma requisição. A decisão usa o caminho DECODIFICADO uma vez, que é o que o
 * backend roteia: assim `/api/auth%2Flogin` não escapa da regra de `/api/auth`.
 *
 * @param {{method:string, url:string, headers:Record<string,string|string[]|undefined>, upgrade?:boolean}} req
 * @returns {{ok:true, path:string}|{ok:false, status:number, message:string}}
 */
export function decide({ method, url, headers, upgrade = false }) {
  let parsed;
  let path;
  try {
    parsed = new URL(url, 'http://qython.invalid');
    path = decodeURIComponent(parsed.pathname);
  } catch {
    return { ok: false, status: 400, message: 'Endereço inválido.' };
  }
  if (path.includes('\0') || path.includes('\\') || path.includes('//')) {
    return { ok: false, status: 400, message: 'Endereço inválido.' };
  }
  if (path !== '/api' && !path.startsWith('/api/')) {
    return { ok: false, status: 404, message: 'Não encontrado.' };
  }
  const bare = path.replace(/\/+$/, '');
  if (DENIED_PREFIXES.some((p) => bare === p || bare.startsWith(`${p}/`))) {
    return { ok: false, status: 403, message: 'Esta rota só funciona na janela do Qython no computador.' };
  }
  const verb = upgrade ? 'WS' : String(method || '').toUpperCase();
  if (upgrade) {
    if (bare !== WS_PATH) return { ok: false, status: 404, message: 'Não encontrado.' };
    if (!parsed.searchParams.get('token')) return { ok: false, status: 401, message: 'Falta o acesso do aparelho.' };
    return { ok: true, path: parsed.pathname + parsed.search };
  }
  if (!OPEN.has(`${verb} ${bare}`)) {
    const auth = String(headers.authorization ?? '');
    if (!/^Bearer\s+\S+/i.test(auth)) {
      return { ok: false, status: 401, message: 'Falta o acesso do aparelho. Pareie o celular de novo.' };
    }
  }
  return { ok: true, path: parsed.pathname + parsed.search };
}

/** Limite de tentativas por origem numa janela deslizante (em memória: reinicia com o app). */
export class Throttle {
  constructor({ limit, windowMs, now = () => Date.now() }) {
    Object.assign(this, { limit, windowMs, now });
    this.hits = new Map();
  }

  /** @returns {boolean} true se esta tentativa passa */
  allow(key) {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(key, recent);
    if (this.hits.size > 1000) {
      for (const [k, v] of this.hits) if (!v.some((x) => t - x < this.windowMs)) this.hits.delete(k);
    }
    return true;
  }
}

/** Qual limite vale para a rota (as de login do celular, que ninguém deveria martelar). */
export function throttleKey(method, path) {
  const bare = path.replace(/\/+$/, '');
  if (method === 'POST' && bare === '/api/pairing/claim') return 'claim';
  if (method === 'POST' && bare === '/api/pairing/token') return 'token';
  return null;
}

/**
 * Endereços IPv4 do computador na rede local, os mais prováveis primeiro (192.168.x, 10.x,
 * 172.16-31.x). Fora: loopback, link-local (169.254) e interfaces internas.
 */
export function lanAddresses(interfaces = os.networkInterfaces()) {
  const rank = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3);
  const found = [];
  for (const list of Object.values(interfaces)) {
    for (const i of list ?? []) {
      if (i.family !== 'IPv4' || i.internal || i.address.startsWith('169.254.')) continue;
      found.push(i.address);
    }
  }
  return [...new Set(found)].sort((a, b) => rank(a) - rank(b));
}
