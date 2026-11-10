import {
  PairingError,
  formatFingerprint,
  isValidCode,
  normalizeCode,
  normalizePairingAddress,
  parsePairingQr,
} from '../src/services/pairingProtocol';
import { hostPortOf, normalizeServerUrl } from '../src/config/serverUrl';

const FP = 'ab'.repeat(32);
const qr = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ t: 'qython-pair', v: 1, a: ['https://192.168.0.10:8443'], f: FP, c: 'ABCDEFGH', ...over });

describe('parsePairingQr', () => {
  it('lê um QR code válido', () => {
    expect(parsePairingQr(qr())).toEqual({
      addresses: ['https://192.168.0.10:8443'],
      fingerprint: FP,
      code: 'ABCDEFGH',
    });
  });

  it('normaliza endereços (esquema em minúsculas, sem barra nem /api), impressão digital e código', () => {
    const target = parsePairingQr(
      qr({ a: ['HTTPS://Host.Local:8443/', 'https://10.0.0.5:8443/api'], f: FP.toUpperCase(), c: 'abcd-efgh' }),
    );
    expect(target?.addresses).toEqual(['https://Host.Local:8443', 'https://10.0.0.5:8443']);
    expect(target?.fingerprint).toBe(FP);
    expect(target?.code).toBe('ABCDEFGH');
  });

  it('aceita f nulo (servidor com certificado de autoridade pública)', () => {
    expect(parsePairingQr(qr({ f: null }))?.fingerprint).toBeNull();
  });

  it.each([
    ['texto qualquer', 'ola'],
    ['outro tipo', qr({ t: 'outro' })],
    ['versão desconhecida', qr({ v: 2 })],
    ['sem endereços', qr({ a: [] })],
    ['só endereço http', qr({ a: ['http://192.168.0.10:8080'] })],
    ['impressão digital curta', qr({ f: 'abcd' })],
    ['impressão digital não hexadecimal', qr({ f: 'z'.repeat(64) })],
    ['código curto', qr({ c: 'ABC' })],
    ['código com caracteres fora do alfabeto', qr({ c: 'ABCDEFG0' })],
    ['endereços que não são lista', qr({ a: 'https://192.168.0.10:8443' })],
  ])('recusa: %s', (_name, text) => {
    expect(parsePairingQr(text as string)).toBeNull();
  });

  it('limita a 8 endereços', () => {
    const many = Array.from({ length: 20 }, (_v, i) => `https://10.0.0.${i + 1}:8443`);
    expect(parsePairingQr(qr({ a: many }))?.addresses).toHaveLength(8);
  });
});

describe('código', () => {
  it('normaliza o que o médico digita', () => {
    expect(normalizeCode('abcd-efgh')).toBe('ABCDEFGH');
    expect(normalizeCode(' ab cd  ef-gh ')).toBe('ABCDEFGH');
  });

  it('valida o alfabeto de 32 caracteres', () => {
    expect(isValidCode('ABCDEFGH')).toBe(true);
    expect(isValidCode('23456789')).toBe(true);
    expect(isValidCode('ABCDEFG')).toBe(false);
    expect(isValidCode('ABCDEFG1')).toBe(false); // sem 1
    expect(isValidCode('ABCDEFGO')).toBe(false); // sem O
  });
});

describe('normalizePairingAddress', () => {
  it('assume https e tira barra e /api', () => {
    expect(normalizePairingAddress('192.168.0.10:8443')).toBe('https://192.168.0.10:8443');
    expect(normalizePairingAddress(' https://192.168.0.10:8443/ ')).toBe('https://192.168.0.10:8443');
    expect(normalizePairingAddress('https://host.local:8443/api')).toBe('https://host.local:8443');
  });

  it('recusa http: o código não pode trafegar sem criptografia', () => {
    expect(() => normalizePairingAddress('http://192.168.0.10:8080')).toThrow(PairingError);
  });
});

describe('formatFingerprint', () => {
  it('mostra 20 caracteres em grupos de 4, em maiúsculas', () => {
    expect(formatFingerprint('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')).toBe(
      '0123 4567 89AB CDEF 0123',
    );
  });
});

describe('endereço do servidor', () => {
  it('hostPortOf separa host e porta e usa a porta do esquema', () => {
    expect(hostPortOf('https://192.168.0.10:8443')).toMatchObject({ host: '192.168.0.10', port: 8443, key: '192.168.0.10:8443', secure: true });
    expect(hostPortOf('https://Host.local')).toMatchObject({ key: 'host.local:443' });
    expect(hostPortOf('http://10.0.2.2:8000')).toMatchObject({ port: 8000, secure: false });
    expect(hostPortOf('ftp://x')).toBeNull();
  });

  it('normalizeServerUrl continua como antes', () => {
    expect(normalizeServerUrl('192.168.0.10:8080')).toBe('http://192.168.0.10:8080');
    expect(normalizeServerUrl('')).toBe('');
  });
});
