// Como executar o backend empacotado (ou o código-fonte, em desenvolvimento).
import path from 'node:path';

/**
 * @param {{backend:string}} resources
 * @param {string[]} args modo e argumentos: ['serve', '--port', '8000'], ['chroma', ...]
 */
export function processCommand(resources, args, env = process.env) {
  if (env.QYTHON_BACKEND_DEV) {
    return {
      command: env.QYTHON_PYTHON || 'python3',
      args: ['-m', 'backend.desktop', ...args],
      cwd: env.QYTHON_BACKEND_DEV,
    };
  }
  const exe = process.platform === 'win32' ? 'qython-backend.exe' : 'qython-backend';
  return { command: path.join(resources.backend, exe), args, cwd: undefined };
}
