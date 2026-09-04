import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { generateOrientation, createOrientation, downloadAndSharePdf } from '../../services/ambulatory';
import { ORIENTATION_TEMPLATES, TEMPLATE_CONTENT } from '../../data/orientationTemplates';
import SpecialtyPicker from '../../components/ambulatory/SpecialtyPicker';
import PatientPickerModal from '../../components/ambulatory/PatientPickerModal';
import GradientButton from '../../components/shared/GradientButton';
import FeedbackButtons from '../../components/ambulatory/FeedbackButtons';
import type { Patient } from '../../types/ambulatory';

type Mode = 'templates' | 'ai';

const ICON_MAP: Record<string, string> = {
  'tint': '\u{1F4A7}',
  'heart-pulse': '\u{1F493}',
  'apple': '\u{1F34E}',
  'utensils': '\u{1F37D}',
  'hospital': '\u{1F3E5}',
  'bandage': '\u{1FA79}',
  'capsules': '\u{1F48A}',
};

const getLang = (): string => {
  const lang = i18n.language || 'pt';
  if (lang.startsWith('pt')) return 'pt';
  if (lang.startsWith('es')) return 'es';
  return 'en';
};

export default function OrientationsTab() {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const [mode, setMode] = useState<Mode>('templates');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [editableTitle, setEditableTitle] = useState('');
  const [editableContent, setEditableContent] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiSpecialty, setAiSpecialty] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiTrainingDataId, setAiTrainingDataId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [specialtyPickerVisible, setSpecialtyPickerVisible] = useState(false);
  const [patientPickerVisible, setPatientPickerVisible] = useState(false);

  const handleSelectTemplate = (key: string) => {
    setSelectedTemplate(key);
    const lang = getLang();
    const content = TEMPLATE_CONTENT[key]?.[lang];
    if (content) {
      setEditableTitle(content.title);
      setEditableContent(content.content);
    }
  };

  const handleGenerateAI = async () => {
    if (!aiPrompt.trim()) {
      Alert.alert('', t('enterPromptFirst', 'Digite o prompt primeiro'));
      return;
    }

    setIsGenerating(true);
    try {
      const result = await generateOrientation({
        prompt: aiPrompt,
        specialty: aiSpecialty || undefined,
        patient_id: selectedPatient?.id ?? undefined,
        language_code: getLang(),
      });
      setEditableTitle(result.title);
      setEditableContent(result.content);
      setAiTrainingDataId(result.training_data_id ?? null);
    } catch {
      Alert.alert('', t('errorGeneratingOrientation', 'Erro ao gerar orientacao'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!editableTitle.trim() || !editableContent.trim()) {
      Alert.alert('', t('fillRequiredFields', 'Preencha os campos obrigatorios'));
      return;
    }

    setIsSaving(true);
    try {
      const result = await createOrientation({
        patient_id: selectedPatient?.id ?? null,
        generation_type: mode === 'templates' ? 'template' : 'ai_generated',
        template_key: selectedTemplate || null,
        title: editableTitle,
        content: editableContent,
        specialty: aiSpecialty || null,
      });
      const filename = `orientacao_${result.id}.pdf`;
      await downloadAndSharePdf(`/orientations/${result.id}/pdf`, filename);
      Alert.alert('', t('orientationCreatedSuccess', 'Orientacao gerada com sucesso!'));
      // Reset form
      setEditableTitle('');
      setEditableContent('');
      setSelectedTemplate(null);
      setAiPrompt('');
      setAiSpecialty('');
      setSelectedPatient(null);
    } catch {
      Alert.alert('', t('errorCreatingOrientation', 'Erro ao criar orientacao'));
    } finally {
      setIsSaving(false);
    }
  };

  const lang = getLang();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        {/* Mode toggle */}
        <View style={styles.typeRow}>
          {(['templates', 'ai'] as Mode[]).map((m) => {
            const selected = mode === m;
            return (
              <TouchableOpacity
                key={m}
                style={[
                  styles.typeButton,
                  {
                    borderColor: selected ? theme.primary : theme.surfaceBorder,
                    backgroundColor: selected ? `${theme.primary}20` : theme.surface,
                  },
                ]}
                onPress={() => setMode(m)}>
                <Text
                  style={[
                    styles.typeButtonText,
                    { color: selected ? theme.primary : theme.text },
                  ]}>
                  {m === 'templates'
                    ? t('templates', 'Templates')
                    : t('generateWithAI', 'Gerar com IA')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Templates mode */}
        {mode === 'templates' && (
          <>
            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('selectTemplate', 'Selecione um modelo')}
            </Text>
            <View style={styles.templateGrid}>
              {ORIENTATION_TEMPLATES.map((tmpl) => {
                const isSelected = selectedTemplate === tmpl.key;
                const icon = ICON_MAP[tmpl.icon] || '\u{1F4C4}';
                const templateContent = TEMPLATE_CONTENT[tmpl.key]?.[lang];
                const title = templateContent?.title || tmpl.key;
                return (
                  <TouchableOpacity
                    key={tmpl.key}
                    style={[
                      styles.templateCard,
                      {
                        borderColor: isSelected ? theme.primary : theme.surfaceBorder,
                        backgroundColor: isSelected ? `${theme.primary}20` : theme.surface,
                      },
                    ]}
                    onPress={() => handleSelectTemplate(tmpl.key)}
                    activeOpacity={0.7}>
                    <Text style={styles.templateIcon}>{icon}</Text>
                    <Text
                      style={[
                        styles.templateTitle,
                        { color: isSelected ? theme.primary : theme.text },
                      ]}
                      numberOfLines={2}>
                      {title}
                    </Text>
                    <Text style={[styles.templateSpecialty, { color: theme.textMuted }]} numberOfLines={1}>
                      {tmpl.specialty}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Editable preview when template selected */}
            {selectedTemplate && (
              <>
                <Text style={[styles.label, { color: theme.textMuted }]}>
                  {t('title', 'Titulo')}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    { color: theme.text, backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
                  ]}
                  value={editableTitle}
                  onChangeText={setEditableTitle}
                  placeholderTextColor={theme.textMuted}
                />

                <Text style={[styles.label, { color: theme.textMuted }]}>
                  {t('content', 'Conteudo')}
                </Text>
                <TextInput
                  style={[
                    styles.textAreaLarge,
                    { color: theme.text, backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
                  ]}
                  value={editableContent}
                  onChangeText={setEditableContent}
                  multiline
                  textAlignVertical="top"
                />

                {/* Patient (optional) */}
                <Text style={[styles.label, { color: theme.textMuted }]}>
                  {t('patient', 'Paciente')} ({t('optional', 'opcional')})
                </Text>
                {selectedPatient ? (
                  <View style={[styles.patientChip, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
                    <Text style={[styles.patientChipText, { color: theme.text }]} numberOfLines={1}>
                      {selectedPatient.full_name}
                    </Text>
                    <TouchableOpacity onPress={() => setSelectedPatient(null)}>
                      <Text style={[styles.removePatient, { color: theme.textMuted }]}>X</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.selector, { borderColor: theme.surfaceBorder, backgroundColor: theme.surface }]}
                    onPress={() => setPatientPickerVisible(true)}>
                    <Text style={[styles.selectorText, { color: theme.textMuted }]}>
                      {t('selectPatient', 'Selecionar Paciente')}...
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Download PDF */}
                <View style={styles.ctaWrapper}>
                  <GradientButton
                    label={t('downloadPdf', 'Baixar PDF')}
                    onPress={handleDownloadPdf}
                    loading={isSaving}
                  />
                </View>
              </>
            )}
          </>
        )}

        {/* AI mode */}
        {mode === 'ai' && (
          <>
            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('prompt', 'Prompt')} *
            </Text>
            <TextInput
              style={[
                styles.textArea,
                { color: theme.text, backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
              ]}
              value={aiPrompt}
              onChangeText={setAiPrompt}
              placeholder={t('orientationPromptPlaceholder', 'Descreva a orientacao que deseja gerar...')}
              placeholderTextColor={theme.textMuted}
              multiline
              textAlignVertical="top"
            />

            {/* Specialty (optional) */}
            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('specialty', 'Especialidade')} ({t('optional', 'opcional')})
            </Text>
            <TouchableOpacity
              style={[styles.selector, { borderColor: theme.surfaceBorder, backgroundColor: theme.surface }]}
              onPress={() => setSpecialtyPickerVisible(true)}>
              <Text
                style={[
                  styles.selectorText,
                  { color: aiSpecialty ? theme.text : theme.textMuted },
                ]}>
                {aiSpecialty || t('selectSpecialty', 'Selecionar especialidade...')}
              </Text>
            </TouchableOpacity>

            {/* Patient (optional) */}
            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('patient', 'Paciente')} ({t('optional', 'opcional')})
            </Text>
            {selectedPatient ? (
              <View style={[styles.patientChip, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
                <Text style={[styles.patientChipText, { color: theme.text }]} numberOfLines={1}>
                  {selectedPatient.full_name}
                </Text>
                <TouchableOpacity onPress={() => setSelectedPatient(null)}>
                  <Text style={[styles.removePatient, { color: theme.textMuted }]}>X</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.selector, { borderColor: theme.surfaceBorder, backgroundColor: theme.surface }]}
                onPress={() => setPatientPickerVisible(true)}>
                <Text style={[styles.selectorText, { color: theme.textMuted }]}>
                  {t('selectPatient', 'Selecionar Paciente')}...
                </Text>
              </TouchableOpacity>
            )}

            {/* Cost badge */}
            <View style={[styles.costBadge, { backgroundColor: `${theme.primary}15` }]}>
              <Text style={[styles.costBadgeText, { color: theme.primary }]}>
                5 dracmas
              </Text>
            </View>

            {/* Generate button */}
            <View style={styles.ctaWrapper}>
              <GradientButton
                label={t('generate', 'Gerar')}
                onPress={handleGenerateAI}
                loading={isGenerating}
              />
            </View>

            {/* Preview after generation */}
            {editableTitle !== '' && editableContent !== '' && (
              <>
                <Text style={[styles.label, { color: theme.textMuted }]}>
                  {t('title', 'Titulo')}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    { color: theme.text, backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
                  ]}
                  value={editableTitle}
                  onChangeText={setEditableTitle}
                  placeholderTextColor={theme.textMuted}
                />

                <Text style={[styles.label, { color: theme.textMuted }]}>
                  {t('content', 'Conteudo')}
                </Text>
                <TextInput
                  style={[
                    styles.textAreaLarge,
                    { color: theme.text, backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
                  ]}
                  value={editableContent}
                  onChangeText={setEditableContent}
                  multiline
                  textAlignVertical="top"
                />

                {aiTrainingDataId != null && (
                  <FeedbackButtons
                    contentType="patient_orientation"
                    trainingDataId={aiTrainingDataId}
                  />
                )}

                {/* Download PDF */}
                <View style={styles.ctaWrapper}>
                  <GradientButton
                    label={t('downloadPdf', 'Baixar PDF')}
                    onPress={handleDownloadPdf}
                    loading={isSaving}
                  />
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>

      <SpecialtyPicker
        visible={specialtyPickerVisible}
        onClose={() => setSpecialtyPickerVisible(false)}
        onSelect={(s) => {
          setAiSpecialty(s);
          setSpecialtyPickerVisible(false);
        }}
      />

      <PatientPickerModal
        visible={patientPickerVisible}
        onClose={() => setPatientPickerVisible(false)}
        onSelect={(patient) => {
          setSelectedPatient(patient);
          setPatientPickerVisible(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.base,
    paddingBottom: spacing.xxl + spacing.xl,
  },
  label: {
    ...typography.label,
    marginTop: spacing.base,
    marginBottom: spacing.xs,
  },
  selector: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  selectorText: {
    ...typography.body,
  },
  patientChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  patientChipText: {
    ...typography.body,
    flex: 1,
  },
  removePatient: {
    ...typography.body,
    fontWeight: '600',
    paddingLeft: spacing.md,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  typeButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  typeButtonText: {
    ...typography.buttonSmall,
  },
  templateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  templateCard: {
    width: '48%',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  templateIcon: {
    fontSize: 28,
    marginBottom: spacing.xs,
  },
  templateTitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  templateSpecialty: {
    ...typography.caption,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    minHeight: 120,
  },
  textAreaLarge: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    minHeight: 200,
  },
  costBadge: {
    alignSelf: 'flex-start',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginTop: spacing.md,
  },
  costBadgeText: {
    ...typography.caption,
    fontWeight: '600',
  },
  ctaWrapper: {
    marginTop: spacing.lg,
  },
});
