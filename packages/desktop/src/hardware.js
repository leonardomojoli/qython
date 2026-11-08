// O que o computador tem, e se um modelo cabe nele.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const GB = 1024 ** 3;

export function totalRamGb() {
  return os.totalmem() / GB;
}

/** Espaço livre (bytes) no volume da pasta; sobe até a primeira pasta que existe. */
export function freeDiskBytes(dir) {
  let current = path.resolve(dir);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const st = fs.statfsSync(current);
  return st.bavail * st.bsize;
}

/** Threads do llama.cpp: núcleos físicos (aproximados), deixando folga para o resto do app. */
export function defaultThreads() {
  const n = os.availableParallelism?.() ?? os.cpus().length;
  if (process.platform === 'darwin') return Math.max(2, n - 2);
  return Math.max(2, Math.floor(n / 2));
}

export function modelBytes(model) {
  return model.files.reduce((sum, f) => sum + f.size, 0);
}

/**
 * Avalia um modelo contra o computador. Nunca escolhe nem troca nada sozinha: quem decide
 * é o médico. `blocking` impede o download (falta de disco); `warnings` só informam.
 */
export function assess(model, { totalRamGb: ram, freeDiskBytes: disk }, installed = 0) {
  const warnings = [];
  const remaining = Math.max(0, modelBytes(model) - installed);
  const needDisk = remaining * 1.02;
  let blocking = null;
  if (disk < needDisk) {
    blocking = `Falta espaço em disco: o download precisa de ${(needDisk / GB).toFixed(1)} GB livres e há ${(disk / GB).toFixed(1)} GB.`;
  }
  let ramLevel = 'ok';
  if (ram < model.minTotalRamGb) {
    ramLevel = ram < model.ramGb ? 'insufficient' : 'low';
    warnings.push(
      ram < model.ramGb
        ? `Este computador tem ${ram.toFixed(0)} GB de RAM e este modelo usa cerca de ${model.ramGb} GB: ele provavelmente não vai rodar.`
        : `Este computador tem ${ram.toFixed(0)} GB de RAM; este modelo pede ${model.minTotalRamGb} GB. Vai rodar devagar e pode travar outros programas.`,
    );
  }
  return { ramLevel, warnings, blocking };
}
