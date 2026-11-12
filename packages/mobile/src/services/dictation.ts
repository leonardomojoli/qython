import api from './api';

/**
 * Ditado de voz: manda a gravação ao Qython do computador pareado, que a transcreve com o whisper local
 * (POST /api/dictation). A voz só cruza a rede local; nada vai para a nuvem.
 */

export type DictationErrorKind =
  | 'unavailable' // o computador respondeu que não pode transcrever agora (ex.: falta baixar o modelo)
  | 'network' // sem rota até o computador
  | 'rejected' // áudio vazio ou grande demais
  | 'busy'; // ditados demais seguidos

export class DictationError extends Error {
  constructor(
    public kind: DictationErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'DictationError';
  }
}

const NO_ROUTE =
  'Sem conexão com o computador. O ditado precisa do Qython aberto lá, na mesma rede.';

/** Devolve o texto falado (vazio se não houve fala). */
export async function transcribeRecording(uri: string, language: string): Promise<string> {
  const form = new FormData();
  form.append('file', { uri, type: 'audio/mp4', name: 'ditado.m4a' } as any);
  form.append('language', language);
  try {
    const response = await api.post<{ text?: string }>('/dictation', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      // O whisper transcreve um trecho de 2 min em até alguns segundos num PC comum, mas pode estar
      // subindo (carrega 1,6 GB do disco na primeira vez).
      timeout: 180000,
    });
    return (response.data?.text ?? '').trim();
  } catch (error: any) {
    const status = error?.response?.status;
    const detail = typeof error?.response?.data?.detail === 'string' ? error.response.data.detail : null;
    if (status === 503) {
      throw new DictationError('unavailable', detail ?? 'O computador não conseguiu transcrever agora.');
    }
    if (status === 429) {
      throw new DictationError('busy', 'Muitos ditados seguidos. Espere um minuto.');
    }
    if (status === 400 || status === 413) {
      throw new DictationError('rejected', detail ?? 'Este áudio não pôde ser enviado.');
    }
    if (!error?.response) {
      throw new DictationError('network', NO_ROUTE);
    }
    throw error;
  }
}
