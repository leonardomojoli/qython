import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import SpecialtyPicker from '../../components/ambulatory/SpecialtyPicker';
import {
  getAnamnesisTemplates,
  saveAnamnesisTemplate,
  deleteAnamnesisTemplate,
  type AnamnesisTemplate,
} from '../../services/ambulatory';
import { ANAMNESE_DATA } from '@qython/shared/src/ambulatory/consultationTemplates';

type ConsultType = 'first' | 'return';

// Tela de customização dos templates de anamnese (paridade com o ConsultaDefinitions do web).
// O médico escolhe especialidade + tipo (1ª/retorno), edita o markdown e salva como custom
// (POST /settings/anamnesis-templates) ou restaura o padrão (DELETE). As customizações
// sincronizam com o web e são auto-carregadas ao documentar uma consulta (ConsultationTab).
export default function AnamnesisTemplatesScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const [specialty, setSpecialty] = useState('');
  const [type, setType] = useState<ConsultType | ''>('');
  const [content, setContent] = useState('');
  const [initialContent, setInitialContent] = useState('');
  const [userTemplates, setUserTemplates] = useState<AnamnesisTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      const d = await getAnamnesisTemplates();
      if (Array.isArray(d)) setUserTemplates(d);
    } catch {
      /* silencioso — mostra o padrão */
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Carrega o conteúdo (custom ou padrão) quando especialidade + tipo estão definidos.
  useEffect(() => {
    if (specialty && type) {
      const custom = userTemplates.find(
        (tm) => tm.specialty === specialty && tm.consultation_type === type,
      );
      const def = (ANAMNESE_DATA[specialty] && ANAMNESE_DATA[specialty][type]) || '';
      const c = custom ? custom.content : def;
      setContent(c);
      setInitialContent(c);
    } else {
      setContent('');
      setInitialContent('');
    }
  }, [specialty, type, userTemplates]);

  const isCustom = !!userTemplates.find(
    (tm) => tm.specialty === specialty && tm.consultation_type === type,
  );

  const handleSave = async () => {
    if (!specialty || !type) return;
    if (content === initialContent) {
      Alert.alert('', t('noChangesToSave', 'Nenhuma alteração para salvar'));
      return;
    }
    setSaving(true);
    try {
      await saveAnamnesisTemplate(specialty, type, content);
      await fetchTemplates();
      setInitialContent(content);
      Alert.alert('', t('templateSavedSuccess', 'Template salvo com sucesso!'));
    } catch {
      Alert.alert('', t('errorSavingTemplate', 'Erro ao salvar template'));
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async () => {
    if (!specialty || !type || !isCustom) return;
    setSaving(true);
    try {
      await deleteAnamnesisTemplate(specialty, type);
      setUserTemplates((prev) =>
        prev.filter((tm) => !(tm.specialty === specialty && tm.consultation_type === type)),
      );
      const def = (ANAMNESE_DATA[specialty] && ANAMNESE_DATA[specialty][type]) || '';
      setContent(def);
      setInitialContent(def);
      Alert.alert('', t('templateRestoredSuccess', 'Template restaurado para o padrão!'));
    } catch {
      Alert.alert('', t('errorRestoringTemplate', 'Erro ao restaurar template'));
    } finally {
      setSaving(false);
    }
  };

  const TYPES: [ConsultType, string][] = [
    ['first', t('firstConsultation', 'Primeira Consulta')],
    ['return', t('returnConsultation', 'Consulta de Retorno')],
  ];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.desc, { color: theme.textSecondary }]}>
          {t(
            'anamnesisTemplatesDesc',
            'Personalize os templates de 1ª consulta e retorno por especialidade. São carregados automaticamente ao documentar uma consulta.',
          )}
        </Text>

        {/* Especialidade */}
        <Text style={[styles.label, { color: theme.textSecondary }]}>
          {t('specialty', 'Especialidade')}
        </Text>
        <TouchableOpacity
          style={[styles.select, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}
          onPress={() => setPickerVisible(true)}
          activeOpacity={0.7}>
          <Text style={[styles.selectText, { color: specialty ? theme.text : theme.textMuted }]}>
            {specialty ? t(specialty) : t('selectSpecialty', 'Selecionar especialidade')}
          </Text>
          <Text style={[styles.chevron, { color: theme.textMuted }]}>{'›'}</Text>
        </TouchableOpacity>

        {/* Tipo */}
        <Text style={[styles.label, { color: theme.textSecondary }]}>
          {t('consultationType', 'Tipo de Consulta')}
        </Text>
        <View style={styles.segment}>
          {TYPES.map(([val, lbl]) => {
            const sel = type === val;
            return (
              <TouchableOpacity
                key={val}
                style={[
                  styles.segmentOption,
                  {
                    backgroundColor: sel ? theme.primary : theme.background,
                    borderColor: sel ? theme.primary : theme.surfaceBorder,
                  },
                ]}
                onPress={() => setType(val)}
                activeOpacity={0.7}>
                <Text style={[styles.segmentText, { color: sel ? '#fff' : theme.text }]}>{lbl}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Editor */}
        {specialty && type ? (
          <>
            <View style={styles.editorHead}>
              <Text style={[styles.label, { color: theme.textSecondary, marginBottom: 0 }]}>
                {t('editTemplate', 'Editar template')}
              </Text>
              {isCustom && (
                <Text style={[styles.customBadge, { color: theme.primary }]}>
                  {t('customized', 'Personalizado')}
                </Text>
              )}
            </View>
            <TextInput
              style={[
                styles.editor,
                { backgroundColor: theme.surface, borderColor: theme.surfaceBorder, color: theme.text },
              ]}
              value={content}
              onChangeText={setContent}
              multiline
              textAlignVertical="top"
              placeholder={t('templateContentPlaceholder', 'Conteúdo do template (markdown)...')}
              placeholderTextColor={theme.textMuted}
            />
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: theme.primary, opacity: saving ? 0.6 : 1 }]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.8}>
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.btnPrimaryText}>{t('saveTemplate', 'Salvar Template')}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnNeutral, { borderColor: theme.surfaceBorder }]}
                onPress={handleRestore}
                disabled={saving || !isCustom}
                activeOpacity={0.8}>
                <Text style={[styles.btnNeutralText, { color: isCustom ? theme.text : theme.textMuted }]}>
                  {t('restoreDefault', 'Restaurar Padrão')}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <Text style={[styles.placeholder, { color: theme.textMuted }]}>
            {t(
              'selectSpecialtyAndTypeToEditTemplate',
              'Selecione especialidade e tipo para editar o template.',
            )}
          </Text>
        )}
      </ScrollView>

      <SpecialtyPicker
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={(s) => setSpecialty(s)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.base,
    paddingBottom: spacing.xxl,
  },
  desc: {
    ...typography.bodySmall,
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.label,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  selectText: {
    ...typography.body,
    flex: 1,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '300',
  },
  segment: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segmentOption: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  segmentText: {
    ...typography.body,
    fontWeight: '600',
  },
  editorHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  customBadge: {
    ...typography.label,
    fontWeight: '700',
  },
  editor: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    padding: spacing.base,
    minHeight: 320,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    lineHeight: 19,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  btn: {
    flex: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btnPrimaryText: {
    ...typography.button,
    color: '#fff',
    fontWeight: '700',
  },
  btnNeutral: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  btnNeutralText: {
    ...typography.button,
    fontWeight: '600',
  },
  placeholder: {
    ...typography.body,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
