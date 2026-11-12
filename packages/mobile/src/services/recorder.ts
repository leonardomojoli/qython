import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

/**
 * Gravação de voz do ditado (módulo nativo QythonRecorder, Android).
 *
 * Grava num arquivo m4a no cache do app; quem chama manda o arquivo ao computador pareado (ver
 * dictation.ts) e depois o apaga com discardRecording. No iPhone o módulo ainda não existe, e
 * recorderAvailable() diz isso para a tela esconder o botão em vez de quebrar.
 */

export interface Recording {
  uri: string;
  durationMs: number;
  sizeBytes: number;
}

export type RecorderErrorCode =
  | 'E_PERMISSION' // o usuário negou o microfone
  | 'E_BUSY' // já havia uma gravação
  | 'E_START' // o microfone não abriu
  | 'E_TOO_SHORT' // parou antes de captar áudio
  | 'E_NOT_RECORDING'; // a gravação foi descartada (app foi para o segundo plano)

export class RecorderError extends Error {
  constructor(
    public code: RecorderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RecorderError';
  }
}

interface NativeRecorder {
  start(): Promise<void>;
  stop(): Promise<Recording>;
  cancel(): Promise<void>;
  discard(uri: string): Promise<void>;
}

function native(): NativeRecorder | undefined {
  return NativeModules.QythonRecorder as NativeRecorder | undefined;
}

export function recorderAvailable(): boolean {
  return Platform.OS === 'android' && !!native();
}

const MESSAGES: Record<RecorderErrorCode, string> = {
  E_PERMISSION: 'Sem permissão para usar o microfone. Libere nas configurações do aparelho.',
  E_BUSY: 'Já existe uma gravação em andamento.',
  E_START: 'Não foi possível abrir o microfone.',
  E_TOO_SHORT: 'A gravação ficou curta demais. Fale por alguns segundos antes de parar.',
  E_NOT_RECORDING: 'A gravação foi interrompida porque o app saiu da tela.',
};

function wrap(error: any): RecorderError {
  const code = (error?.code in MESSAGES ? error.code : 'E_START') as RecorderErrorCode;
  return new RecorderError(code, MESSAGES[code]);
}

async function ensureMicrophone(): Promise<void> {
  const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
  if (await PermissionsAndroid.check(permission)) return;
  const result = await PermissionsAndroid.request(permission, {
    title: 'Microfone',
    message: 'O Qython usa o microfone para o ditado. A voz é transcrita no seu computador, não na nuvem.',
    buttonPositive: 'Permitir',
    buttonNegative: 'Agora não',
  });
  if (result !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new RecorderError('E_PERMISSION', MESSAGES.E_PERMISSION);
  }
}

export async function startRecording(): Promise<void> {
  const module = native();
  if (!module) throw new RecorderError('E_START', MESSAGES.E_START);
  await ensureMicrophone();
  try {
    await module.start();
  } catch (error) {
    throw wrap(error);
  }
}

export async function stopRecording(): Promise<Recording> {
  const module = native();
  if (!module) throw new RecorderError('E_NOT_RECORDING', MESSAGES.E_NOT_RECORDING);
  try {
    return await module.stop();
  } catch (error) {
    throw wrap(error);
  }
}

/** Descarta a gravação em andamento (não falha se não houver). */
export async function cancelRecording(): Promise<void> {
  try {
    await native()?.cancel();
  } catch {
    // nada a descartar
  }
}

/** Apaga o arquivo de um ditado já enviado (ou recusado). Nunca atrapalha o fluxo. */
export async function discardRecording(uri: string): Promise<void> {
  try {
    await native()?.discard(uri);
  } catch {
    // o cache do sistema limpa depois
  }
}
