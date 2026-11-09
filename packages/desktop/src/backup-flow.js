// Backup e restauração sobre a pilha em funcionamento: para o que precisa parar, faz o
// trabalho de `backup.js` e sobe tudo de novo. O menu e o teste de fumaça usam estas funções.
import { PG_MAJOR } from './postgres.js';
import { applyRestore, checkCompatible, createBackup, openBackup, undoRestore } from './backup.js';
import fs from 'node:fs';

/** Pausa a pilha (o Postgres precisa estar parado para a cópia ser consistente), copia e religa. */
export async function backupFlow({ stack, passphrase, outFile, appVersion }) {
  const secrets = await stack.secrets.load();
  await stack.stop();
  try {
    return await createBackup({ root: stack.paths.root, secrets, passphrase, outFile, appVersion });
  } finally {
    await stack.start();
  }
}

/**
 * Restaura um backup. A senha e a compatibilidade são conferidas ANTES de parar qualquer
 * coisa: uma senha errada não custa nem um segundo de indisponibilidade.
 * @returns {Promise<{antes:string}>} pasta onde ficou o que existia antes
 */
export async function restoreFlow({ stack, file, passphrase }) {
  const root = stack.paths.root;
  const { meta, stage } = await openBackup({ file, passphrase, root });
  try {
    checkCompatible(meta, { pgMajor: PG_MAJOR });
  } catch (err) {
    fs.rmSync(stage, { recursive: true, force: true });
    throw err;
  }
  await stack.stop();
  try {
    const result = applyRestore({ root, stage, secretsFile: stack.paths.secrets });
    try {
      await stack.secrets.replaceAll(meta.secrets);
    } catch (err) {
      undoRestore({ root, antes: result.antes, secretsFile: stack.paths.secrets });
      throw err;
    }
    return result;
  } finally {
    await stack.start();
  }
}
