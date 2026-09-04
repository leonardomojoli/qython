import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import {
  generateMaterial,
  getMaterialJobStatus,
} from '../../services/academic';
import type { MaterialType } from '../../services/academic';
import { MATERIAL_TYPE_CONFIG } from '../../types/academic';

interface Props {
  visible: boolean;
  onClose: () => void;
  libraryId: number;
  onMaterialGenerated: () => void;
}

// Materiais de estudo gerados a partir da biblioteca (retornam uma AcademicMaterial, pollável
// por /material/{id}/status). Podcast/videoaula/transcrição usam fluxos próprios (job/arquivo)
// e ficam fora deste modal por ora; 'quiz' não é um material_type válido do gerador.
const MATERIAL_TYPES: MaterialType[] = [
  'summary',
  'detailed_text',
  'flashcards',
  'mind_map',
  'questionnaire_objective',
  'questionnaire_subjective',
  'comparative_table',
  'clinical_case',
  'critical_appraisal',
  'slideshow_only',
];

export default function MaterialGeneratorModal({
  visible,
  onClose,
  libraryId,
  onMaterialGenerated,
}: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [generating, setGenerating] = useState(false);
  const [selectedType, setSelectedType] = useState<MaterialType | null>(null);
  const [statusText, setStatusText] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount or close
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  const handleSelect = async (materialType: MaterialType) => {
    setSelectedType(materialType);
    setGenerating(true);
    setStatusText(t('generatingMaterial', 'Gerando material...'));

    try {
      const { job_id } = await generateMaterial(libraryId, materialType);

      // Poll for job status every 3 seconds
      pollRef.current = setInterval(async () => {
        try {
          const status = await getMaterialJobStatus(job_id);

          if (status.status === 'completed') {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            setGenerating(false);
            Alert.alert(
              t('materialGenerated', 'Material gerado!'),
              t('materialGeneratedDesc', 'Seu material foi gerado com sucesso.'),
              [
                {
                  text: t('close', 'Fechar'),
                  onPress: () => {
                    setSelectedType(null);
                    onMaterialGenerated();
                    onClose();
                  },
                },
              ],
            );
          } else if (status.status === 'error') {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            setGenerating(false);
            Alert.alert(
              t('materialError', 'Erro ao gerar material'),
              status.error || t('unknownError', 'Erro desconhecido'),
            );
            setSelectedType(null);
          } else if (status.status === 'processing') {
            setStatusText(t('processingMaterial', 'Processando...'));
          }
        } catch {
          // Network error during polling - keep trying
        }
      }, 3000);
    } catch (err: any) {
      setGenerating(false);
      setSelectedType(null);
      // Casos acionáveis do backend: {code} p/ biblioteca vazia / ainda processando / sem
      // texto; detail string p/ restrição de plano (403), conflito (409) etc. Resto → genérico.
      const detail = err?.response?.data?.detail;
      const code = detail?.code;
      if (code === 'LIBRARY_EMPTY') {
        Alert.alert('', t('libraryEmptyForMaterial', 'Esta biblioteca está vazia. Adicione documentos antes de gerar material.'));
      } else if (code === 'LIBRARY_PROCESSING') {
        Alert.alert('', t('libraryProcessingForMaterial', 'Os documentos ainda estão sendo processados. Aguarde a conclusão e tente novamente.'));
      } else if (code === 'LIBRARY_NO_TEXT') {
        Alert.alert('', t('libraryNoTextForMaterial', 'A biblioteca não contém texto processado. Verifique se os documentos foram processados corretamente.'));
      } else if (typeof detail === 'string' && detail) {
        Alert.alert('', detail);
      } else {
        Alert.alert('', t('materialError', 'Erro ao gerar material'));
      }
    }
  };

  const handleClose = () => {
    if (generating) {
      Alert.alert(
        t('cancelGeneration', 'Cancelar?'),
        t('cancelGenerationDesc', 'A geração continuará em segundo plano.'),
        [
          { text: t('cancel', 'Cancelar'), style: 'cancel' },
          {
            text: t('close', 'Fechar'),
            onPress: () => {
              if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
              }
              setGenerating(false);
              setSelectedType(null);
              onClose();
            },
          },
        ],
      );
    } else {
      setSelectedType(null);
      onClose();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>
              {t('selectMaterialType', 'Selecione o tipo de material')}
            </Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Text style={[styles.closeBtnText, { color: theme.textMuted }]}>
                {'\u2715'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Content */}
          {generating ? (
            <View style={styles.generatingContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.generatingText, { color: theme.textMuted }]}>
                {statusText}
              </Text>
              {selectedType && (
                <Text style={[styles.generatingType, { color: theme.text }]}>
                  {MATERIAL_TYPE_CONFIG[selectedType]?.icon}{' '}
                  {t(MATERIAL_TYPE_CONFIG[selectedType]?.labelKey || '')}
                </Text>
              )}
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.grid}>
              {MATERIAL_TYPES.map((type) => {
                const config = MATERIAL_TYPE_CONFIG[type];
                return (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeCard,
                      {
                        backgroundColor: theme.surface,
                        borderColor: theme.surfaceBorder,
                      },
                    ]}
                    onPress={() => handleSelect(type)}
                    activeOpacity={0.7}>
                    <Text style={styles.typeIcon}>{config.icon}</Text>
                    <Text style={[styles.typeTitle, { color: theme.text }]}>
                      {t(config.labelKey)}
                    </Text>
                    <Text
                      style={[styles.typeDesc, { color: theme.textMuted }]}
                      numberOfLines={2}>
                      {t(config.descriptionKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '80%',
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.base,
    borderBottomWidth: 1,
  },
  headerTitle: {
    ...typography.h3,
    flex: 1,
  },
  closeBtn: {
    padding: spacing.sm,
  },
  closeBtnText: {
    fontSize: 20,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: spacing.base,
    gap: spacing.md,
  },
  typeCard: {
    width: '47%',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.base,
    alignItems: 'center',
  },
  typeIcon: {
    fontSize: 36,
    marginBottom: spacing.sm,
  },
  typeTitle: {
    ...typography.label,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  typeDesc: {
    ...typography.caption,
    textAlign: 'center',
    lineHeight: 16,
  },
  generatingContainer: {
    padding: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  generatingText: {
    ...typography.body,
    marginTop: spacing.base,
  },
  generatingType: {
    ...typography.label,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
});
