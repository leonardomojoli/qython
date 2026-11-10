// Funções puras sobre o endereço do servidor (sem armazenamento), para valer também nos testes.

/**
 * Turns what the user typed ("192.168.0.10:8080", "http://host/",
 * "https://host/api") into "scheme://host[:port][/path]" with no trailing
 * slash and no /api suffix. No scheme means http, the common case on a LAN.
 */
export function normalizeServerUrl(input: string): string {
  let url = input.trim();
  if (!url) {
    return '';
  }
  const scheme = /^https?:\/\//i.exec(url);
  url = scheme ? scheme[0].toLowerCase() + url.slice(scheme[0].length) : `http://${url}`;
  return url.replace(/\/+$/, '').replace(/\/api$/i, '');
}

/**
 * "host:porta" de um endereço https/http, que é a chave da impressão digital fixada para o servidor
 * (ver PinnedTls.kt). Sem porta vale a do esquema.
 */
export function hostPortOf(url: string): { host: string; port: number; key: string; secure: boolean } | null {
  const match = /^(https?):\/\/([^/:?#]+)(?::(\d+))?/i.exec(url.trim());
  if (!match) {
    return null;
  }
  const secure = match[1].toLowerCase() === 'https';
  const host = match[2].toLowerCase();
  const port = match[3] ? Number(match[3]) : secure ? 443 : 80;
  return { host, port, key: `${host}:${port}`, secure };
}
