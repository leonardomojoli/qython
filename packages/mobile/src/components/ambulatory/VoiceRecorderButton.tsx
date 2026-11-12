import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import {
  RecorderError,
  cancelRecording,
  discardRecording,
  recorderAvailable,
  startRecording,
  stopRecording,
} from '../../services/recorder';
import { DictationError, transcribeRecording } from '../../services/dictation';

interface Props {
  onTranscription: (text: string) => void;
  language?: string; // 'pt-BR', 'en-US', 'es-ES'
  disabled?: boolean;
}

type Phase = 'idle' | 'recording' | 'transcribing';

// O ditado é para trechos curtos; o servidor também recusa áudio grande.
const MAX_SECONDS = 120;

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/**
 * Ditado: toca para gravar, toca de novo para transcrever. A gravação vai ao computador pareado, que
 * a transcreve com o whisper local (nada de reconhecimento de voz em nuvem do celular).
 */
export default function VoiceRecorderButton({
  onTranscription,
  language = 'pt-BR',
  disabled = false,
}: Props) {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('idle');
  const [seconds, setSeconds] = useState(0);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const finishRef = useRef<() => void>(() => {});
  const elapsed = useRef(0);
  const working = useRef(false); // começando ou terminando: ignora toques repetidos

  const stopTimer = () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopTimer();
      cancelRecording();
    };
  }, []);

  // Pulsa enquanto grava.
  useEffect(() => {
    if (phase !== 'recording') {
      pulseAnim.setValue(1);
      return undefined;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [phase, pulseAnim]);

  const fail = useCallback(
    (error: unknown) => {
      let message = t('dictationFailed', 'Não foi possível usar o ditado agora.');
      if (error instanceof RecorderError || error instanceof DictationError) {
        message = error.message;
      }
      Alert.alert(t('dictation', 'Ditado'), message);
    },
    [t],
  );

  const finish = useCallback(async () => {
    if (working.current) return;
    working.current = true;
    stopTimer();
    setPhase('transcribing');
    let uri: string | null = null;
    try {
      const recording = await stopRecording();
      uri = recording.uri;
      const text = await transcribeRecording(recording.uri, language);
      if (!mounted.current) return;
      if (text) {
        onTranscription(text);
      } else {
        Alert.alert(
          t('dictation', 'Ditado'),
          t('dictationNoSpeech', 'Não ouvi nenhuma fala. Fale mais perto do microfone.'),
        );
      }
    } catch (error) {
      if (mounted.current) fail(error);
    } finally {
      if (uri) discardRecording(uri);
      working.current = false;
      if (mounted.current) {
        setPhase('idle');
        setSeconds(0);
      }
    }
  }, [fail, language, onTranscription, t]);
  finishRef.current = finish;

  const begin = useCallback(async () => {
    if (working.current) return;
    working.current = true;
    try {
      await startRecording();
    } catch (error) {
      working.current = false;
      fail(error);
      return;
    }
    if (!mounted.current) {
      working.current = false;
      cancelRecording();
      return;
    }
    elapsed.current = 0;
    setSeconds(0);
    setPhase('recording');
    working.current = false;
    timer.current = setInterval(() => {
      elapsed.current += 1;
      setSeconds(elapsed.current);
      // Chegou ao limite: encerra como se a pessoa tivesse tocado.
      if (elapsed.current >= MAX_SECONDS) finishRef.current();
    }, 1000);
  }, [fail]);

  const onPress = useCallback(() => {
    if (phase === 'idle') begin();
    else if (phase === 'recording') finish();
  }, [begin, finish, phase]);

  // iPhone: o módulo de gravação ainda não existe lá. Melhor sem botão do que um botão que não funciona.
  if (!recorderAvailable()) return null;

  const recording = phase === 'recording';
  return (
    <View style={styles.container}>
      {recording && (
        <View style={[styles.bubble, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
          <Text style={[styles.bubbleText, { color: theme.textSecondary }]}>
            {t('dictationRecording', 'Gravando')} {clock(seconds)}
          </Text>
        </View>
      )}

      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <TouchableOpacity
          style={[
            styles.micButton,
            {
              backgroundColor: recording ? 'rgba(231, 76, 60, 0.15)' : theme.surface,
              borderColor: recording ? '#e74c3c' : theme.surfaceBorder,
            },
          ]}
          onPress={onPress}
          disabled={disabled || phase === 'transcribing'}
          accessibilityRole="button"
          accessibilityLabel={
            recording
              ? t('dictationStop', 'Parar e transcrever')
              : t('dictationStart', 'Ditar')
          }
          activeOpacity={0.7}>
          {phase === 'transcribing' ? (
            <ActivityIndicator color={theme.textSecondary} />
          ) : (
            <Text style={styles.micIcon}>{recording ? '🔴' : '🎤'}</Text>
          )}
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  bubble: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  bubbleText: {
    ...typography.bodySmall,
    fontStyle: 'italic',
  },
  micButton: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micIcon: {
    fontSize: 22,
  },
});
