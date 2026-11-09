// Escolha de portas. Tudo escuta só em 127.0.0.1.
import net from 'node:net';

const HOST = '127.0.0.1';

export function isPortFree(port, host = HOST) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

/** Pede uma porta qualquer ao sistema operacional. */
export function randomFreePort(host = HOST) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, host, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/**
 * Usa a porta preferida se estiver livre; senão, outra. O front guarda o login no
 * localStorage da ORIGEM (http://127.0.0.1:porta): trocar de porta a cada abertura
 * desconectaria o médico toda vez. Por isso a porta do app é lembrada.
 */
export async function pickPort(preferred, { exclude = [] } = {}) {
  if (preferred && !exclude.includes(preferred) && (await isPortFree(preferred))) {
    return preferred;
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = await randomFreePort();
    if (!exclude.includes(port)) return port;
  }
  throw new Error('Não foi possível encontrar uma porta livre.');
}
