import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useUser } from '../../contexts/UserContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { createPatient, updatePatient } from '../../services/ambulatory';
import { GENDER_OPTIONS } from '../../types/ambulatory';
import type { Patient, Gender, CreatePatientPayload } from '../../types/ambulatory';

interface Props {
  visible: boolean;
  patient?: Patient | null;
  onClose: () => void;
  onSaved: (patient: Patient) => void;
}

export default function PatientFormModal({ visible, patient, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { user } = useUser();
  const isEdit = !!patient;

  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState<Gender | ''>('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [address, setAddress] = useState('');
  const [allergies, setAllergies] = useState('');
  const [chronicConditions, setChronicConditions] = useState('');
  const [currentMedications, setCurrentMedications] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      if (patient) {
        setFullName(patient.full_name);
        setBirthDate(patient.birth_date || '');
        setGender(patient.gender || '');
        setPhone(patient.phone || '');
        setEmail(patient.email || '');
        setDocumentId(patient.document_id || '');
        setAddress(patient.address || '');
        setAllergies(patient.allergies.join(', '));
        setChronicConditions(patient.chronic_conditions.join(', '));
        setCurrentMedications(patient.current_medications.join(', '));
        setNotes(patient.notes || '');
      } else {
        setFullName('');
        setBirthDate('');
        setGender('');
        setPhone('');
        setEmail('');
        setDocumentId('');
        setAddress('');
        setAllergies('');
        setChronicConditions('');
        setCurrentMedications('');
        setNotes('');
      }
    }
  }, [visible, patient]);

  const parseCommaSeparated = (text: string): string[] =>
    text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const handleSave = async () => {
    if (!fullName.trim()) {
      Alert.alert('', t('patientNameRequired', 'Nome do paciente e obrigatorio'));
      return;
    }

    const payload: CreatePatientPayload = {
      full_name: fullName.trim(),
      birth_date: birthDate || null,
      gender: (gender as Gender) || null,
      phone: phone || null,
      email: email || null,
      country: user?.country || null,
      document_id: documentId || null,
      address: address || null,
      allergies: parseCommaSeparated(allergies),
      chronic_conditions: parseCommaSeparated(chronicConditions),
      current_medications: parseCommaSeparated(currentMedications),
      notes: notes || null,
    };

    setSaving(true);
    try {
      const saved = isEdit
        ? await updatePatient(patient!.id, payload)
        : await createPatient(payload);
      onSaved(saved);
      onClose();
    } catch {
      Alert.alert('', t('errorSavingPatient', 'Erro ao salvar paciente'));
    } finally {
      setSaving(false);
    }
  };

  const renderField = (
    label: string,
    value: string,
    onChangeText: (t: string) => void,
    opts?: {
      placeholder?: string;
      multiline?: boolean;
      keyboardType?: TextInput['props']['keyboardType'];
      autoCapitalize?: TextInput['props']['autoCapitalize'];
    },
  ) => (
    <View style={styles.fieldGroup}>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          opts?.multiline && styles.inputMultiline,
          { color: theme.text, backgroundColor: theme.background, borderColor: theme.surfaceBorder },
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={opts?.placeholder}
        placeholderTextColor={theme.textMuted}
        multiline={opts?.multiline}
        keyboardType={opts?.keyboardType}
        autoCapitalize={opts?.autoCapitalize ?? 'sentences'}
      />
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: theme.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
          <TouchableOpacity onPress={onClose}>
            <Text style={[styles.headerButton, { color: theme.textMuted }]}>
              {t('cancel', 'Cancelar')}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {isEdit ? t('editPatient', 'Editar Paciente') : t('registerNewPatient', 'Novo Paciente')}
          </Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Text style={[styles.headerButton, { color: theme.primary, fontWeight: '600' }]}>
                {t('save', 'Salvar')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          {renderField(
            t('patientFullNamePlaceholder', 'Nome completo') + ' *',
            fullName,
            setFullName,
            { autoCapitalize: 'words' },
          )}
          {renderField(t('birthDate', 'Data de Nascimento'), birthDate, setBirthDate, {
            placeholder: 'YYYY-MM-DD',
            keyboardType: 'numeric',
          })}

          {/* Gender */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: theme.textMuted }]}>
              {t('gender', 'Sexo')}
            </Text>
            <View style={styles.genderRow}>
              {GENDER_OPTIONS.map((opt) => {
                const selected = gender === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[
                      styles.genderButton,
                      {
                        borderColor: selected ? theme.primary : theme.surfaceBorder,
                        backgroundColor: selected ? `${theme.primary}20` : theme.background,
                      },
                    ]}
                    onPress={() => setGender(selected ? '' : opt.value)}>
                    <Text
                      style={[
                        styles.genderText,
                        { color: selected ? theme.primary : theme.text },
                      ]}>
                      {t(opt.labelKey, opt.value)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {renderField(t('phone', 'Telefone'), phone, setPhone, {
            keyboardType: 'phone-pad',
          })}
          {renderField('Email', email, setEmail, {
            keyboardType: 'email-address',
            autoCapitalize: 'none',
          })}
          {renderField(t('document', 'Documento'), documentId, setDocumentId)}
          {renderField(t('address', 'Endereco'), address, setAddress)}

          {/* Clinical Alerts Section */}
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            {t('clinicalAlerts', 'Alertas Clinicos')}
          </Text>
          {renderField(t('allergies', 'Alergias'), allergies, setAllergies, {
            placeholder: t('commaSeparated', 'Separar por virgulas'),
            multiline: true,
          })}
          {renderField(
            t('chronicConditions', 'Condicoes Cronicas'),
            chronicConditions,
            setChronicConditions,
            { placeholder: t('commaSeparated', 'Separar por virgulas'), multiline: true },
          )}
          {renderField(
            t('currentMedications', 'Medicamentos em Uso'),
            currentMedications,
            setCurrentMedications,
            { placeholder: t('commaSeparated', 'Separar por virgulas'), multiline: true },
          )}
          {renderField(t('notes', 'Observacoes'), notes, setNotes, {
            placeholder: t('patientNotesPlaceholder', 'Observacoes gerais...'),
            multiline: true,
          })}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  headerTitle: {
    ...typography.body,
    fontWeight: '600',
  },
  headerButton: {
    ...typography.body,
  },
  scrollContent: {
    padding: spacing.base,
    paddingBottom: spacing.xxl,
  },
  fieldGroup: {
    marginBottom: spacing.base,
  },
  label: {
    ...typography.label,
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  sectionTitle: {
    ...typography.h3,
    marginTop: spacing.md,
    marginBottom: spacing.base,
  },
  genderRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  genderButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  genderText: {
    ...typography.buttonSmall,
  },
});
