// Chaves que precisam ser as MESMAS a cada abertura do app.
//
// QYTHON_FIELD_KEK cifra CPF, RG e notas clínicas no banco; QYTHON_TOKEN_KEK
// pseudonimiza identificadores; JWT_SECRET_KEY assina o login; a senha do Postgres
// protege a porta local. Se qualquer uma mudasse entre aberturas, as colunas cifradas
// ficariam ilegíveis (já aconteceu nos testes) e o médico seria deslogado.
//
// As chaves são geradas uma vez e guardadas cifradas pelo cofre do sistema
// (Electron safeStorage: DPAPI no Windows, Keychain no macOS, libsecret/kwallet no
// Linux). Sem cofre (Linux sem chaveiro), caem num arquivo de uso restrito ao usuário
// (modo 0600) e o app avisa — melhor que perder dado, pior que o cofre.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export class SecretsUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SecretsUnavailableError';
  }
}

/** Chave Fernet: 32 bytes aleatórios em base64 url-safe COM preenchimento (44 caracteres). */
export function fernetKey() {
  return crypto.randomBytes(32).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
}

export function hexSecret(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

export const GENERATORS = {
  QYTHON_FIELD_KEK: fernetKey,
  QYTHON_TOKEN_KEK: fernetKey,
  JWT_SECRET_KEY: () => hexSecret(32),
  PG_PASSWORD: () => hexSecret(24),
};

export class SecretStore {
  /**
   * @param {string} file caminho do secrets.json
   * @param {{isEncryptionAvailable():boolean, encryptString(s:string):Buffer, decryptString(b:Buffer):string, getSelectedStorageBackend?():string}|null} safeStorage
   */
  constructor(file, safeStorage) {
    this.file = file;
    this.safe = safeStorage;
  }

  exists() {
    return fs.existsSync(this.file);
  }

  /** O cofre do sistema é de verdade? No Linux, "basic_text" é só ofuscação. */
  osVaultAvailable() {
    const s = this.safe;
    if (!s || !s.isEncryptionAvailable()) return false;
    if (typeof s.getSelectedStorageBackend === 'function') {
      try {
        if (s.getSelectedStorageBackend() === 'basic_text') return false;
      } catch {
        // não é Linux: o método não existe
      }
    }
    return true;
  }

  _read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw new SecretsUnavailableError(`O arquivo de chaves está ilegível: ${err.message}`);
    }
  }

  _write(doc) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(doc, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    try {
      fs.chmodSync(this.file, 0o600);
    } catch {
      // Windows: as permissões vêm da pasta do perfil
    }
  }

  /** Protege o valor conforme o modo registrado no arquivo. */
  _seal(value, protection) {
    if (protection === 'os') return this.safe.encryptString(value).toString('base64');
    return value;
  }

  _open(stored, protection) {
    if (protection === 'os') {
      if (!this.osVaultAvailable()) {
        throw new SecretsUnavailableError(
          'As chaves de criptografia estão no cofre do sistema, que não está disponível agora. ' +
            'Desbloqueie o chaveiro do sistema e abra o Qython de novo.',
        );
      }
      try {
        return this.safe.decryptString(Buffer.from(stored, 'base64'));
      } catch (err) {
        throw new SecretsUnavailableError(
          `Não foi possível abrir as chaves de criptografia no cofre do sistema: ${err.message}`,
        );
      }
    }
    return stored;
  }

  /**
   * Devolve as chaves pedidas, criando as que ainda não existem. NUNCA recria uma chave
   * que já existe — nem quando ela não abre: recriar apagaria, na prática, os dados
   * cifrados com a antiga. Nesse caso lança SecretsUnavailableError.
   */
  load(names = Object.keys(GENERATORS)) {
    let doc = this._read();
    const created = doc === null;
    if (created) {
      doc = { version: 1, protection: this.osVaultAvailable() ? 'os' : 'file', items: {} };
    }
    let changed = created;
    const out = {};
    for (const name of names) {
      if (name in doc.items) {
        out[name] = this._open(doc.items[name], doc.protection);
      } else {
        const gen = GENERATORS[name];
        if (!gen) throw new Error(`Segredo desconhecido: ${name}`);
        out[name] = gen();
        doc.items[name] = this._seal(out[name], doc.protection);
        changed = true;
      }
    }
    if (changed) this._write(doc);
    return out;
  }

  get protection() {
    return this._read()?.protection ?? (this.osVaultAvailable() ? 'os' : 'file');
  }
}
