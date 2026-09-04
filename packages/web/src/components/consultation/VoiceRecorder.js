// frontend/src/components/consultation/VoiceRecorder.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrophone, faMicrophoneSlash, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import styles from './VoiceRecorder.module.css';

/**
 * VoiceRecorder Component - Uses Web Speech API for voice-to-text transcription
 * Falls back gracefully if the browser doesn't support speech recognition
 */
function VoiceRecorder({ onTranscription, language = 'pt-BR', disabled = false }) {
    const { t } = useTranslation();
    const [isListening, setIsListening] = useState(false);
    const [isSupported, setIsSupported] = useState(false);
    const [interimTranscript, setInterimTranscript] = useState('');
    const recognitionRef = useRef(null);

    // Check for browser support
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        setIsSupported(!!SpeechRecognition);

        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = language;

            recognition.onresult = (event) => {
                let interim = '';
                let final = '';

                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        final += transcript + ' ';
                    } else {
                        interim += transcript;
                    }
                }

                setInterimTranscript(interim);

                if (final.trim()) {
                    onTranscription(final.trim());
                    setInterimTranscript('');
                }
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                if (event.error === 'not-allowed') {
                    setIsSupported(false);
                }
                setIsListening(false);
            };

            recognition.onend = () => {
                // Auto-restart if still supposed to be listening (for continuous mode)
                if (isListening && recognitionRef.current) {
                    try {
                        recognitionRef.current.start();
                    } catch (e) {
                        setIsListening(false);
                    }
                }
            };

            recognitionRef.current = recognition;
        }

        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, [language]);

    // Update language when it changes
    useEffect(() => {
        if (recognitionRef.current) {
            recognitionRef.current.lang = language;
        }
    }, [language]);

    const toggleListening = useCallback(() => {
        if (!recognitionRef.current) return;

        if (isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
            setInterimTranscript('');
        } else {
            try {
                recognitionRef.current.start();
                setIsListening(true);
            } catch (e) {
                console.error('Failed to start speech recognition:', e);
            }
        }
    }, [isListening]);

    if (!isSupported) {
        return null; // Don't render anything if not supported
    }

    return (
        <div className={styles.voiceRecorderContainer}>
            <button
                type="button"
                className={`${styles.voiceButton} ${isListening ? styles.listening : ''}`}
                onClick={toggleListening}
                disabled={disabled}
                title={isListening ? t('stopDictation') : t('startDictation')}
                aria-label={isListening ? t('stopDictation') : t('startDictation')}
            >
                <FontAwesomeIcon
                    icon={isListening ? faMicrophoneSlash : faMicrophone}
                    className={isListening ? styles.pulsingIcon : ''}
                />
            </button>

            {isListening && interimTranscript && (
                <div className={styles.interimDisplay}>
                    <FontAwesomeIcon icon={faSpinner} spin className={styles.spinnerIcon} />
                    <span className={styles.interimText}>{interimTranscript}</span>
                </div>
            )}
        </div>
    );
}

export default VoiceRecorder;
