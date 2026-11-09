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
  LLM_LOCAL_KEY: () => hexSecret(24),
};

/**
 * Cofre do sistema pelo safeStorage do Electron, na API assíncrona (a síncrona está
 * marcada para remoção). No Linux, o backend "basic_text" é só ofuscação (não há chaveiro
 * no sistema): não conta como cofre.
 *
 * @returns {{available():Promise<boolean>, encrypt(s:string):Promise<Buffer>, decrypt(b:Buffer):Promise<{result:string, shouldReEncrypt:boolean}>}}
 */
export function electronVault(safeStorage) {
  return {
    async available() {
      if (!(await safeStorage.isAsyncEncryptionAvailable())) return false;
      try {
        if (safeStorage.getSelectedStorageBackend() === 'basic_text') return false;
      } catch {
        // não é Linux: o método não existe
      }
      return true;
    },
    encrypt: (text) => safeStorage.encryptStringAsync(text),
    decrypt: (buf) => safeStorage.decryptStringAsync(buf),
  };
}

export class SecretStore {
  /**
   * @param {string} file caminho do secrets.json
   * @param {ReturnType<typeof electronVault>|null} vault null = sem cofre (só arquivo)
   */
  constructor(file, vault) {
    this.file = file;
    this.vault = vault;
    this.mode = null; // 'os' | 'file', conhecido depois de load()
  }

  exists() {
    return fs.existsSync(this.file);
  }

  async osVaultAvailable() {
    return !!this.vault && (await this.vault.available());
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
  async _seal(value, protection) {
    if (protection === 'os') return (await this.vault.encrypt(value)).toString('base64');
    return value;
  }

  /** @returns {Promise<{value:string, reseal:boolean}>} */
  async _open(stored, protection) {
    if (protection !== 'os') return { value: stored, reseal: false };
    if (!(await this.osVaultAvailable())) {
      throw new SecretsUnavailableError(
        'As chaves de criptografia estão no cofre do sistema, que não está disponível agora. ' +
          'Desbloqueie o chaveiro do sistema e abra o Qython de novo.',
      );
    }
    try {
      const { result, shouldReEncrypt } = await this.vault.decrypt(Buffer.from(stored, 'base64'));
      return { value: result, reseal: !!shouldReEncrypt };
    } catch (err) {
      throw new SecretsUnavailableError(
        `Não foi possível abrir as chaves de criptografia no cofre do sistema: ${err.message}`,
      );
    }
  }

  /**
   * Devolve as chaves pedidas, criando as que ainda não existem. NUNCA recria uma chave
   * que já existe — nem quando ela não abre: recriar apagaria, na prática, os dados
   * cifrados com a antiga. Nesse caso lança SecretsUnavailableError.
   */
  async load(names = Object.keys(GENERATORS)) {
    let doc = this._read();
    const created = doc === null;
    if (created) {
      doc = { version: 1, protection: (await this.osVaultAvailable()) ? 'os' : 'file', items: {} };
    }
    this.mode = doc.protection;
    let changed = created;
    const out = {};
    for (const name of names) {
      if (name in doc.items) {
        const { value, reseal } = await this._open(doc.items[name], doc.protection);
        out[name] = value;
        if (reseal) {
          // O sistema trocou a chave dele: regrava o mesmo segredo com a chave nova.
          doc.items[name] = await this._seal(value, doc.protection);
          changed = true;
        }
      } else {
        const gen = GENERATORS[name];
        if (!gen) throw new Error(`Segredo desconhecido: ${name}`);
        out[name] = gen();
        doc.items[name] = await this._seal(out[name], doc.protection);
        changed = true;
      }
    }
    if (changed) this._write(doc);
    return out;
  }

  /**
   * Troca TODAS as chaves por estas (restauração de backup): os dados restaurados só abrem
   * com as chaves com que foram cifrados. Sela com o cofre DESTE computador, que pode ser outro.
   * @param {Record<string,string>} values
   */
  async replaceAll(values) {
    for (const name of Object.keys(GENERATORS)) {
      if (typeof values[name] !== 'string' || !values[name]) throw new Error(`O backup não traz a chave ${name}.`);
    }
    const protection = (await this.osVaultAvailable()) ? 'os' : 'file';
    const doc = { version: 1, protection, items: {} };
    for (const name of Object.keys(GENERATORS)) doc.items[name] = await this._seal(values[name], protection);
    this.mode = protection;
    this._write(doc);
  }

  /** 'os' (cofre do sistema) ou 'file' (arquivo de uso restrito); conhecido depois de load(). */
  get protection() {
    return this.mode;
  }
}
