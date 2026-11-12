// frontend/src/components/consultation/VoiceRecorder.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrophone, faStop, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import styles from './VoiceRecorder.module.css';

// O ditado é para trechos curtos (o servidor recusa áudio grande): corta em 2 minutos.
const MAX_SECONDS = 120;
// Menos que isso é clique sem fala; nem vale mandar ao servidor.
const MIN_BYTES = 1000;

// Do mais ao menos desejável; cada navegador grava o que sabe (Chrome/Electron/Firefox: webm ou ogg;
// Safari: mp4). O whisper do servidor abre todos.
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

function pickMimeType() {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
    return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

function fileNameFor(type) {
    if (type.includes('mp4')) return 'ditado.m4a';
    if (type.includes('ogg')) return 'ditado.ogg';
    return 'ditado.webm';
}

const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/**
 * VoiceRecorder - ditado de voz pelo whisper da própria instalação.
 *
 * Grava com o MediaRecorder do navegador, manda o áudio a POST /api/dictation (o mesmo endpoint do
 * celular) e devolve o texto. Substitui a Web Speech API, que no Chrome envia o áudio à nuvem do Google
 * e no app desktop (Electron) não funciona. Como o texto só aparece depois que a pessoa para, não há
 * transcrição parcial enquanto fala: mostra o tempo de gravação.
 */
function VoiceRecorder({ onTranscription, language = 'pt-BR', disabled = false }) {
    const { t } = useTranslation();
    const [phase, setPhase] = useState('idle'); // idle | recording | transcribing
    const [seconds, setSeconds] = useState(0);
    const [error, setError] = useState(null);

    const recorderRef = useRef(null);
    const streamRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const mountedRef = useRef(true);
    const discardRef = useRef(false);
    const errorTimerRef = useRef(null);
    // Os callbacks do MediaRecorder nascem uma vez; leem sempre o valor mais recente destas props.
    const latest = useRef({ onTranscription, language });
    latest.current = { onTranscription, language };

    const supported =
        typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== 'undefined';

    const showError = useCallback((message) => {
        setError(message);
        clearTimeout(errorTimerRef.current);
        errorTimerRef.current = setTimeout(() => mountedRef.current && setError(null), 9000);
    }, []);

    const releaseMicrophone = () => {
        clearInterval(timerRef.current);
        timerRef.current = null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
    };

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            discardRef.current = true; // saiu da tela: não transcreve
            clearTimeout(errorTimerRef.current);
            const recorder = recorderRef.current;
            if (recorder && recorder.state !== 'inactive') recorder.stop();
            releaseMicrophone();
        };
    }, []);

    const errorMessage = useCallback(
        (err) => {
            const status = err?.response?.status;
            const detail = err?.response?.data?.detail;
            if (status === 503) return typeof detail === 'string' ? detail : t('dictationUnavailable');
            if (status === 429) return t('dictationBusy');
            if (status === 400 || status === 413) return typeof detail === 'string' ? detail : t('dictationRejected');
            if (!err?.response) return t('dictationNetwork');
            return t('dictationFailed');
        },
        [t],
    );

    const send = useCallback(
        async (blob) => {
            if (blob.size < MIN_BYTES) {
                showError(t('dictationNoSpeech'));
                return;
            }
            try {
                const form = new FormData();
                form.append('file', blob, fileNameFor(blob.type || ''));
                form.append('language', latest.current.language);
                const response = await api.post('/dictation', form, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    // O whisper pode estar subindo (carrega o modelo na primeira vez).
                    timeout: 180000,
                });
                if (!mountedRef.current) return;
                const text = (response.data?.text || '').trim();
                if (text) latest.current.onTranscription(text);
                else showError(t('dictationNoSpeech'));
            } catch (err) {
                if (mountedRef.current) showError(errorMessage(err));
            }
        },
        [errorMessage, showError, t],
    );

    const stop = useCallback(() => {
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== 'inactive') {
            clearInterval(timerRef.current);
            timerRef.current = null;
            setPhase('transcribing');
            recorder.stop(); // o onstop faz o resto
        }
    }, []);

    const start = useCallback(async () => {
        setError(null);
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
            });
        } catch (err) {
            showError(err?.name === 'NotAllowedError' ? t('dictationMicDenied') : t('dictationMicUnavailable'));
            return;
        }
        if (!mountedRef.current) {
            stream.getTracks().forEach((track) => track.stop());
            return;
        }

        const mimeType = pickMimeType();
        let recorder;
        try {
            recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined);
        } catch {
            stream.getTracks().forEach((track) => track.stop());
            showError(t('dictationMicUnavailable'));
            return;
        }

        chunksRef.current = [];
        discardRef.current = false;
        streamRef.current = stream;
        recorderRef.current = recorder;
        recorder.ondataavailable = (event) => {
            if (event.data && event.data.size) chunksRef.current.push(event.data);
        };
        recorder.onstop = async () => {
            releaseMicrophone();
            const type = recorder.mimeType || mimeType || 'audio/webm';
            const blob = new Blob(chunksRef.current, { type });
            chunksRef.current = [];
            recorderRef.current = null;
            if (!discardRef.current) await send(blob);
            if (mountedRef.current) setPhase('idle');
        };

        try {
            recorder.start();
        } catch {
            // O dispositivo sumiu entre pedir o microfone e começar (ou o navegador recusou o formato).
            releaseMicrophone();
            recorderRef.current = null;
            showError(t('dictationMicUnavailable'));
            return;
        }
        setSeconds(0);
        setPhase('recording');
        let elapsed = 0;
        timerRef.current = setInterval(() => {
            elapsed += 1;
            setSeconds(elapsed);
            if (elapsed >= MAX_SECONDS) stop();
        }, 1000);
    }, [send, showError, stop, t]);

    if (!supported) {
        return null; // navegador sem gravação de áudio
    }

    const recording = phase === 'recording';
    const transcribing = phase === 'transcribing';
    const label = recording ? t('stopDictation') : t('startDictation');

    return (
        <div className={styles.voiceRecorderContainer}>
            <button
                type="button"
                className={`${styles.voiceButton} ${recording ? styles.listening : ''}`}
                onClick={recording ? stop : start}
                disabled={disabled || transcribing}
                title={label}
                aria-label={label}
            >
                <FontAwesomeIcon
                    icon={transcribing ? faSpinner : recording ? faStop : faMicrophone}
                    spin={transcribing}
                    className={recording ? styles.pulsingIcon : ''}
                />
            </button>

            {(recording || transcribing) && (
                <div className={styles.statusDisplay} role="status" aria-live="polite">
                    <span className={styles.statusText}>
                        {recording ? `${t('dictationRecording')} ${clock(seconds)}` : t('dictationTranscribing')}
                    </span>
                </div>
            )}

            {error && (
                <div className={styles.errorDisplay} role="alert">
                    {error}
                </div>
            )}
        </div>
    );
}

export default VoiceRecorder;
