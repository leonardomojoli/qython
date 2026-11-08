// Log em arquivo com rotação, mais o console. Cada serviço grava no seu próprio arquivo.
import fs from 'node:fs';
import path from 'node:path';

const MAX_BYTES = 5 * 1024 * 1024;
const KEEP = 5;

export class FileLog {
  constructor(file, { maxBytes = MAX_BYTES, keep = KEEP } = {}) {
    this.file = file;
    this.maxBytes = maxBytes;
    this.keep = keep;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    this.size = fs.existsSync(file) ? fs.statSync(file).size : 0;
    this.fd = fs.openSync(file, 'a');
  }

  write(text) {
    const chunk = Buffer.isBuffer(text) ? text : Buffer.from(String(text));
    if (this.size + chunk.length > this.maxBytes) this._rotate();
    fs.writeSync(this.fd, chunk);
    this.size += chunk.length;
  }

  _rotate() {
    fs.closeSync(this.fd);
    for (let i = this.keep - 1; i >= 1; i -= 1) {
      const from = `${this.file}.${i}`;
      if (fs.existsSync(from)) fs.renameSync(from, `${this.file}.${i + 1}`);
    }
    fs.renameSync(this.file, `${this.file}.1`);
    this.fd = fs.openSync(this.file, 'a');
    this.size = 0;
  }

  close() {
    try {
      fs.closeSync(this.fd);
    } catch {
      // já fechado
    }
  }
}

const stamp = () => new Date().toISOString();

/** Logger do app: uma linha por evento, com hora, no arquivo e no console. */
export function createLogger(logsDir, name = 'app', { echo = true } = {}) {
  const file = new FileLog(path.join(logsDir, `${name}.log`));
  const emit = (level, message) => {
    const line = `${stamp()} ${level.padEnd(5)} ${message}\n`;
    file.write(line);
    if (echo) (level === 'ERROR' ? process.stderr : process.stdout).write(line);
  };
  return {
    info: (m) => emit('INFO', m),
    warn: (m) => emit('WARN', m),
    error: (m) => emit('ERROR', m),
    /** Arquivo de log separado para a saída de um processo filho. */
    sink: (child) => new FileLog(path.join(logsDir, `${child}.log`)),
    close: () => file.close(),
    dir: logsDir,
  };
}
