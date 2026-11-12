// O ditado por dentro: gravação (módulo nativo de mentira) e envio ao computador pareado.
// O que se testa é a lógica do app: permissão, mapeamento de erros e o formato do envio.
const mockNative = {
  start: jest.fn(),
  stop: jest.fn(),
  cancel: jest.fn(),
  discard: jest.fn(),
};
const mockModules: Record<string, unknown> = { QythonRecorder: mockNative };
const mockPlatform = { OS: 'android' };
const mockPermissions = {
  PERMISSIONS: { RECORD_AUDIO: 'android.permission.RECORD_AUDIO' },
  RESULTS: { GRANTED: 'granted', DENIED: 'denied' },
  check: jest.fn(),
  request: jest.fn(),
};
const mockPost = jest.fn();

// Getters porque o jest.mock sobe para o topo, antes das constantes acima existirem.
jest.mock('react-native', () => ({
  get NativeModules() {
    return mockModules;
  },
  get Platform() {
    return mockPlatform;
  },
  get PermissionsAndroid() {
    return mockPermissions;
  },
}));
jest.mock('../src/services/api', () => ({ __esModule: true, default: { post: (...a: unknown[]) => mockPost(...a) } }));

import {
  RecorderError,
  cancelRecording,
  discardRecording,
  recorderAvailable,
  startRecording,
  stopRecording,
} from '../src/services/recorder';
import { DictationError, transcribeRecording } from '../src/services/dictation';

beforeEach(() => {
  jest.clearAllMocks();
  mockModules.QythonRecorder = mockNative;
  mockPlatform.OS = 'android';
  mockPermissions.check.mockResolvedValue(true);
});

describe('recorder', () => {
  it('só existe no Android com o módulo nativo', () => {
    expect(recorderAvailable()).toBe(true);
    mockPlatform.OS = 'ios';
    expect(recorderAvailable()).toBe(false);
    mockPlatform.OS = 'android';
    mockModules.QythonRecorder = undefined;
    expect(recorderAvailable()).toBe(false);
  });

  it('grava direto quando o microfone já foi liberado', async () => {
    mockNative.start.mockResolvedValue(undefined);
    await startRecording();
    expect(mockPermissions.request).not.toHaveBeenCalled();
    expect(mockNative.start).toHaveBeenCalledTimes(1);
  });

  it('pede o microfone e grava se o usuário liberar', async () => {
    mockPermissions.check.mockResolvedValue(false);
    mockPermissions.request.mockResolvedValue('granted');
    mockNative.start.mockResolvedValue(undefined);
    await startRecording();
    expect(mockPermissions.request).toHaveBeenCalledTimes(1);
    expect(mockNative.start).toHaveBeenCalledTimes(1);
  });

  it('não abre o microfone se o usuário negar', async () => {
    mockPermissions.check.mockResolvedValue(false);
    mockPermissions.request.mockResolvedValue('denied');
    await expect(startRecording()).rejects.toMatchObject({ name: 'RecorderError', code: 'E_PERMISSION' });
    expect(mockNative.start).not.toHaveBeenCalled();
  });

  it('traduz o erro do módulo nativo para uma mensagem do app', async () => {
    mockNative.start.mockRejectedValue({ code: 'E_START', message: 'MediaRecorder: start failed' });
    const error = await startRecording().catch((e) => e);
    expect(error).toBeInstanceOf(RecorderError);
    expect(error.code).toBe('E_START');
    expect(error.message).toBe('Não foi possível abrir o microfone.');
  });

  it('erro desconhecido vira falha ao abrir o microfone, sem vazar texto técnico', async () => {
    mockNative.stop.mockRejectedValue(new Error('java.lang.IllegalStateException'));
    const error = await stopRecording().catch((e) => e);
    expect(error.code).toBe('E_START');
    expect(error.message).not.toMatch(/java/);
  });

  it('devolve o arquivo gravado', async () => {
    const recording = { uri: 'file:///cache/ditado-1.m4a', durationMs: 4200, sizeBytes: 9000 };
    mockNative.stop.mockResolvedValue(recording);
    await expect(stopRecording()).resolves.toEqual(recording);
  });

  it('gravação descartada pelo sistema é dita como interrompida', async () => {
    mockNative.stop.mockRejectedValue({ code: 'E_NOT_RECORDING' });
    await expect(stopRecording()).rejects.toMatchObject({ code: 'E_NOT_RECORDING' });
  });

  it('cancelar e apagar nunca falham, mesmo sem módulo ou com erro', async () => {
    mockNative.cancel.mockRejectedValue(new Error('x'));
    mockNative.discard.mockRejectedValue(new Error('x'));
    await expect(cancelRecording()).resolves.toBeUndefined();
    await expect(discardRecording('file:///cache/ditado-1.m4a')).resolves.toBeUndefined();
    mockModules.QythonRecorder = undefined;
    await expect(cancelRecording()).resolves.toBeUndefined();
    await expect(discardRecording('file:///x')).resolves.toBeUndefined();
  });
});

// O FormData do React Native guarda os campos em _parts; o do Node não.
class FakeFormData {
  _parts: Array<[string, unknown]> = [];
  append(key: string, value: unknown) {
    this._parts.push([key, value]);
  }
}

describe('transcribeRecording', () => {
  const uri = 'file:///cache/ditado-1.m4a';
  beforeAll(() => {
    (globalThis as any).FormData = FakeFormData;
  });

  it('envia o arquivo e o idioma e devolve o texto sem espaços nas pontas', async () => {
    mockPost.mockResolvedValue({ data: { text: '  Paciente refere cefaleia.  ' } });
    await expect(transcribeRecording(uri, 'pt-BR')).resolves.toBe('Paciente refere cefaleia.');

    const [url, form, config] = mockPost.mock.calls[0];
    expect(url).toBe('/dictation');
    expect(config.headers['Content-Type']).toBe('multipart/form-data');
    expect(config.timeout).toBeGreaterThanOrEqual(120000);
    const parts = (form as any)._parts as Array<[string, any]>;
    expect(parts.find(([k]) => k === 'language')?.[1]).toBe('pt-BR');
    expect(parts.find(([k]) => k === 'file')?.[1]).toMatchObject({ uri, type: 'audio/mp4', name: 'ditado.m4a' });
  });

  it('silêncio volta texto vazio', async () => {
    mockPost.mockResolvedValue({ data: { text: '' } });
    await expect(transcribeRecording(uri, 'pt-BR')).resolves.toBe('');
    mockPost.mockResolvedValue({ data: {} });
    await expect(transcribeRecording(uri, 'pt-BR')).resolves.toBe('');
  });

  it('503 repassa a explicação do computador (ex.: falta baixar o modelo)', async () => {
    mockPost.mockRejectedValue({ response: { status: 503, data: { detail: 'Baixe o modelo de transcrição.' } } });
    const error = await transcribeRecording(uri, 'pt-BR').catch((e) => e);
    expect(error).toBeInstanceOf(DictationError);
    expect(error.kind).toBe('unavailable');
    expect(error.message).toBe('Baixe o modelo de transcrição.');
  });

  it('503 sem explicação ainda diz algo útil', async () => {
    mockPost.mockRejectedValue({ response: { status: 503, data: {} } });
    const error = await transcribeRecording(uri, 'pt-BR').catch((e) => e);
    expect(error.kind).toBe('unavailable');
    expect(error.message.length).toBeGreaterThan(10);
  });

  it('429 vira "ditados demais"', async () => {
    mockPost.mockRejectedValue({ response: { status: 429, data: {} } });
    await expect(transcribeRecording(uri, 'pt-BR')).rejects.toMatchObject({ kind: 'busy' });
  });

  it('400 e 413 viram áudio recusado', async () => {
    for (const status of [400, 413]) {
      mockPost.mockRejectedValue({ response: { status, data: { detail: 'Áudio vazio.' } } });
      await expect(transcribeRecording(uri, 'pt-BR')).rejects.toMatchObject({ kind: 'rejected', message: 'Áudio vazio.' });
    }
  });

  it('sem resposta é falta de rota até o computador', async () => {
    mockPost.mockRejectedValue(new Error('Network Error'));
    const error = await transcribeRecording(uri, 'pt-BR').catch((e) => e);
    expect(error.kind).toBe('network');
    expect(error.message).toMatch(/mesma rede/);
  });

  it('outros erros do servidor passam como estão', async () => {
    const boom = { response: { status: 500, data: {} } };
    mockPost.mockRejectedValue(boom);
    await expect(transcribeRecording(uri, 'pt-BR')).rejects.toBe(boom);
  });
});
