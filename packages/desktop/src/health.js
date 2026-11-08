// Espera um endereço HTTP ficar saudável.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {string} url
 * @param {{timeoutMs?:number, intervalMs?:number, isAlive?:()=>boolean, validate?:(res:Response, body:string)=>boolean, onTick?:(ms:number)=>void}} opts
 */
export async function waitForHttp(url, opts = {}) {
  const { timeoutMs = 120000, intervalMs = 500, isAlive = () => true, onTick } = opts;
  const validate = opts.validate ?? ((res) => res.ok);
  const started = Date.now();
  let lastError = 'sem resposta';
  while (Date.now() - started < timeoutMs) {
    if (!isAlive()) throw new Error('O processo encerrou antes de ficar pronto.');
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(Math.min(5000, intervalMs * 10)) });
      const body = await res.text();
      if (validate(res, body)) return;
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err.cause?.code ?? err.message;
    }
    onTick?.(Date.now() - started);
    await sleep(intervalMs);
  }
  throw new Error(`Tempo esgotado esperando ${url} (${lastError}).`);
}
