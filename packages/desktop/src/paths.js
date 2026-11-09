// Onde cada coisa mora no perfil do usuário. Funções puras: o `root` vem de fora
// (app.getPath('userData') no app, uma pasta temporária nos testes).
import path from 'node:path';

export function layout(root) {
  return {
    root,
    // Postgres embarcado: os arquivos do cluster.
    pgData: path.join(root, 'db', 'data'),
    // QYTHON_DATA_DIR do backend: uploads, biblioteca, Chroma, exportações, configuração.
    data: path.join(root, 'data'),
    chroma: path.join(root, 'data', 'chroma_db'),
    models: path.join(root, 'models'),
    logs: path.join(root, 'logs'),
    // PIDs dos processos filhos, para limpar os que sobraram de uma queda do app.
    run: path.join(root, 'run'),
    secrets: path.join(root, 'secrets.json'),
    settings: path.join(root, 'settings.json'),
  };
}

export const DB_NAME = 'qython';
export const DB_USER = 'qython';
