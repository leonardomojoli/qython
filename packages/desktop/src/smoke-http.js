// Ajudantes dos testes de fumaça: afirmação com mensagem própria e chamada HTTP simples.

export function assert(cond, message) {
  if (!cond) throw new Error(`FUMAÇA FALHOU: ${message}`);
}

export async function call(base, method, route, { token, json, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    body = form instanceof FormData ? form : new URLSearchParams(form);
  }
  const res = await fetch(`${base}${route}`, { method, headers, body });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}
