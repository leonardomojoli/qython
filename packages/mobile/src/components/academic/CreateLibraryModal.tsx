import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { createLibrary, updateLibrary } from '../../services/academic';
import type { Library } from '../../types/academic';
import LibraryIconPicker from './LibraryIconPicker';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated: (library?: Library) => void;
  /** If provided, modal acts as "edit" instead of "create" */
  editLibrary?: Library | null;
}

export default function CreateLibraryModal({ visible, onClose, onCreated, editLibrary }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [creating, setCreating] = useState(false);

  const isEditing = !!editLibrary;

  // Populate form when editing
  React.useEffect(() => {
    if (editLibrary) {
      setName(editLibrary.name || '');
      setDescription(editLibrary.description || '');
      setIcon(editLibrary.icon || '');
    } else {
      setName('');
      setDescription('');
      setIcon('');
    }
  }, [editLibrary]);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('', t('libraryNameCannotBeEmpty', 'O nome da biblioteca não pode ser vazio.'));
      return;
    }

    setCreating(true);
    try {
      if (isEditing && editLibrary) {
        const updated = await updateLibrary(editLibrary.id, {
          name: name.trim(),
          description: description.trim(),
          icon,
        });
        onCreated(updated);
      } else {
        await createLibrary({
          name: name.trim(),
          description: description.trim() || undefined,
          icon: icon || undefined,
        });
        onCreated();
      }
      handleClose();
    } catch {
      Alert.alert('', isEditing
        ? t('errorUpdatingLibrary', 'Erro ao atualizar a biblioteca.')
        : t('errorCreatingLibrary', 'Erro ao criar a biblioteca.'));
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setIcon('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleClose}>
        <View style={[styles.drawer, { backgroundColor: theme.background }]}>
          <TouchableOpacity activeOpacity={1}>
            <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
              <Text style={[styles.title, { color: theme.text }]}>
                {isEditing
                  ? t('editLibrary', 'Editar Biblioteca')
                  : t('createNewLibrary', 'Criar Nova Biblioteca')}
              </Text>
            </View>

            <View style={styles.form}>
              <Text style={[styles.label, { color: theme.text }]}>
                {t('libraryName', 'Nome da Biblioteca')}
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    backgroundColor: theme.surface,
                    borderColor: theme.surfaceBorder,
                  },
                ]}
                value={name}
                onChangeText={setName}
                placeholder={t('newLibraryNamePlaceholder', 'Nome da nova biblioteca...')}
                placeholderTextColor={theme.textMuted}
                editable={!creating}
                autoFocus
              />

              <Text style={[styles.label, { color: theme.text, marginTop: spacing.base }]}>
                {t('descriptionOptional', 'Descrição (opcional)')}
              </Text>
              <TextInput
                style={[
                  styles.input,
                  styles.textArea,
                  {
                    color: theme.text,
                    backgroundColor: theme.surface,
                    borderColor: theme.surfaceBorder,
                  },
                ]}
                value={description}
                onChangeText={setDescription}
                placeholder={t(
                  'libraryDescriptionPlaceholder',
                  'Adicione uma descrição para sua biblioteca...',
                )}
                placeholderTextColor={theme.textMuted}
                editable={!creating}
                multiline
                numberOfLines={3}
              />

              <Text style={[styles.label, { color: theme.text, marginTop: spacing.base }]}>
                {t('libraryIconLabel', 'Ícone')}
              </Text>
              <LibraryIconPicker value={icon} onChange={setIcon} />

              <View style={styles.buttons}>
                <TouchableOpacity
                  style={[styles.button, { borderColor: theme.surfaceBorder }]}
                  onPress={handleClose}
                  disabled={creating}>
                  <Text style={[styles.buttonText, { color: theme.textMuted }]}>
                    {t('cancel', 'Cancelar')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.createButton, { backgroundColor: theme.primary }]}
                  onPress={handleCreate}
                  disabled={creating}>
                  {creating ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={[styles.buttonText, { color: '#fff' }]}>
                      {isEditing ? t('save', 'Salvar') : t('create', 'Criar')}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  drawer: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingBottom: spacing.xxl,
  },
  header: {
    padding: spacing.base,
    borderBottomWidth: 1,
  },
  title: {
    ...typography.h3,
  },
  form: {
    padding: spacing.base,
  },
  label: {
    ...typography.label,
    marginBottom: spacing.xs,
  },
  input: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  button: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
  },
  createButton: {
    borderWidth: 0,
  },
  buttonText: {
    ...typography.button,
  },
});
