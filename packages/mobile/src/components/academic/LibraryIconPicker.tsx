import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import {
  FA_ICON_OPTIONS,
  EMOJI_OPTIONS,
  LIBRARY_ICONS,
  isFaIconName,
  resolveLibraryIcon,
  sanitizeEmoji,
} from '../../types/academic';

interface Props {
  /** Nome do ícone FA ('heart-pulse'), um emoji cru ('🫀') ou '' (automático/heurística). */
  value: string;
  onChange: (value: string) => void;
}

// Equivalente mobile do picker do web: por padrão mostra só o ícone atual (swatch). As opções
// (ícones + emojis + emoji custom) abrem num bottom-sheet só ao tocar — não despeja a grade inline.
export default function LibraryIconPicker({ value, onChange }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);

  // Emoji digitado que não está entre os pré-definidos.
  const customEmoji =
    value && !isFaIconName(value) && !EMOJI_OPTIONS.includes(value) ? value : '';

  const select = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <View style={styles.triggerRow}>
      <TouchableOpacity
        style={[
          styles.swatch,
          { borderColor: theme.surfaceBorder, backgroundColor: theme.primary + '14' },
        ]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={
          value
            ? t('changeIcon', 'Trocar ícone')
            : t('iconAutoHint', 'Automático — toque para escolher')
        }>
        <Text style={styles.swatchGlyph}>{resolveLibraryIcon(value)}</Text>
      </TouchableOpacity>
      <Text style={[styles.hint, { color: theme.textMuted }]} numberOfLines={2}>
        {value
          ? t('changeIcon', 'Trocar ícone')
          : t('iconAutoHint', 'Automático — toque para escolher')}
      </Text>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: theme.background }]}>
            <TouchableOpacity activeOpacity={1}>
              <View style={[styles.sheetHeader, { borderBottomColor: theme.surfaceBorder }]}>
                <Text style={[styles.sheetTitle, { color: theme.text }]}>
                  {t('libraryIcon', 'Ícone da biblioteca')}
                </Text>
              </View>

              <ScrollView
                style={styles.sheetScroll}
                contentContainerStyle={styles.sheetBody}
                keyboardShouldPersistTaps="handled">
                <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
                  {t('icons', 'Ícones')}
                </Text>
                <View style={styles.grid}>
                  {FA_ICON_OPTIONS.map((name) => {
                    const selected = value === name;
                    return (
                      <TouchableOpacity
                        key={name}
                        style={[
                          styles.cell,
                          {
                            borderColor: selected ? theme.primary : theme.surfaceBorder,
                            backgroundColor: selected ? theme.primary + '22' : 'transparent',
                          },
                        ]}
                        onPress={() => select(name)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={name}>
                        <Text style={styles.cellGlyph}>{LIBRARY_ICONS[name] || '📚'}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
                  {t('emoji', 'Emoji')}
                </Text>
                <View style={styles.grid}>
                  {EMOJI_OPTIONS.map((emoji) => {
                    const selected = value === emoji;
                    return (
                      <TouchableOpacity
                        key={emoji}
                        style={[
                          styles.cell,
                          {
                            borderColor: selected ? theme.primary : theme.surfaceBorder,
                            backgroundColor: selected ? theme.primary + '22' : 'transparent',
                          },
                        ]}
                        onPress={() => select(emoji)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={emoji}>
                        <Text style={styles.cellGlyph}>{emoji}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
                  {t('customEmoji', 'Emoji personalizado')}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: theme.text,
                      backgroundColor: theme.surface,
                      borderColor: customEmoji ? theme.primary : theme.surfaceBorder,
                    },
                  ]}
                  value={customEmoji}
                  onChangeText={(txt) => onChange(sanitizeEmoji(txt))}
                  placeholder={t('customEmojiPlaceholder', 'ou cole um emoji…')}
                  placeholderTextColor={theme.textMuted}
                  maxLength={8}
                />

                <TouchableOpacity
                  style={[styles.autoBtn, { borderColor: theme.surfaceBorder }]}
                  onPress={() => select('')}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t('iconAutoReset', 'Automático (escolher por mim)')}>
                  <Text style={[styles.autoBtnText, { color: theme.textMuted }]}>
                    {t('iconAutoReset', 'Automático (escolher por mim)')}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  triggerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  swatch: {
    width: 46,
    height: 46,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swatchGlyph: {
    fontSize: 24,
  },
  hint: {
    ...typography.caption,
    flexShrink: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingBottom: spacing.xxl,
  },
  sheetHeader: {
    padding: spacing.base,
    borderBottomWidth: 1,
  },
  sheetTitle: {
    ...typography.h3,
  },
  sheetScroll: {
    maxHeight: 440,
  },
  sheetBody: {
    padding: spacing.base,
  },
  sectionLabel: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cell: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellGlyph: {
    fontSize: 24,
  },
  input: {
    ...typography.body,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    textAlign: 'center',
    marginBottom: spacing.base,
  },
  autoBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  autoBtnText: {
    ...typography.caption,
  },
});
