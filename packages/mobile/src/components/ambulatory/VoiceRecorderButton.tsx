import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface Props {
  onTranscription: (text: string) => void;
  language?: string; // 'pt-BR', 'en-US', 'es-ES'
  disabled?: boolean;
}

export default function VoiceRecorderButton({
  onTranscription,
  language = 'pt-BR',
  disabled = false,
}: Props) {
  const { theme } = useTheme();
  const [isListening, setIsListening] = useState(false);
  const [partialResults, setPartialResults] = useState('');
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const voiceRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;

    const loadVoice = async () => {
      try {
        const Voice = (await import('@react-native-voice/voice')).default;
        voiceRef.current = Voice;

        Voice.onSpeechResults = (e: any) => {
          if (!mounted) return;
          const text = e.value?.[0] || '';
          if (text) {
            onTranscription(text);
          }
          setIsListening(false);
          setPartialResults('');
        };

        Voice.onSpeechPartialResults = (e: any) => {
          if (!mounted) return;
          const partial = e.value?.[0] || '';
          setPartialResults(partial);
        };

        Voice.onSpeechError = () => {
          if (!mounted) return;
          setIsListening(false);
          setPartialResults('');
        };
      } catch {
        // Voice module not available
      }
    };

    loadVoice();

    return () => {
      mounted = false;
      if (voiceRef.current) {
        try {
          voiceRef.current.destroy();
          voiceRef.current.removeAllListeners();
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, [onTranscription]);

  // Pulsing animation when listening
  useEffect(() => {
    if (isListening) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isListening, pulseAnim]);

  const toggleListening = useCallback(async () => {
    const Voice = voiceRef.current;
    if (!Voice) return;

    try {
      if (isListening) {
        await Voice.stop();
        setIsListening(false);
        setPartialResults('');
      } else {
        setPartialResults('');
        await Voice.start(language);
        setIsListening(true);
      }
    } catch {
      setIsListening(false);
      setPartialResults('');
    }
  }, [isListening, language]);

  return (
    <View style={styles.container}>
      {isListening && partialResults.length > 0 && (
        <View style={[styles.partialBubble, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
          <Text style={[styles.partialText, { color: theme.textSecondary }]} numberOfLines={2}>
            {partialResults}
          </Text>
        </View>
      )}

      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <TouchableOpacity
          style={[
            styles.micButton,
            {
              backgroundColor: isListening ? 'rgba(231, 76, 60, 0.15)' : theme.surface,
              borderColor: isListening ? '#e74c3c' : theme.surfaceBorder,
            },
          ]}
          onPress={toggleListening}
          disabled={disabled}
          activeOpacity={0.7}>
          <Text style={styles.micIcon}>{isListening ? '\uD83D\uDD34' : '\uD83C\uDFA4'}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  partialBubble: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
    maxWidth: '90%',
  },
  partialText: {
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
