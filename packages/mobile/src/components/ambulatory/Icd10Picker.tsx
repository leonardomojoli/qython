import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { searchIcd10 } from '../../services/ambulatory';
import type { Icd10Code } from '../../types/ambulatory';

interface Icd10PickerProps {
  selected: Icd10Code[];
  onChange: (codes: Icd10Code[]) => void;
  maxSelections?: number;
}

/**
 * Busca de CID-10 na tabela oficial (/api/icd10/search), por código ("J06",
 * "e11.9") ou descrição. Mesmo comportamento do ICD10Autocomplete do web: o
 * médico escolhe um código da lista, e o que fica selecionado aparece em chips.
 */
export default function Icd10Picker({ selected, onChange, maxSelections = 3 }: Icd10PickerProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Icd10Code[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    let cancelled = false;
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await searchIcd10(q);
        if (!cancelled) {
          setResults(data.filter(item => !selected.some(s => s.code === item.code)));
          setSearched(true);
        }
      } catch (error) {
        console.error('ICD-10 search error:', error);
        if (!cancelled) {
          setResults([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 300);
    return () => {
      cancelled = true;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, selected]);

  const handleSelect = (item: Icd10Code) => {
    if (selected.length >= maxSelections) {
      return;
    }
    onChange([...selected, item]);
    setQuery('');
    setResults([]);
    setSearched(false);
  };

  const handleRemove = (code: string) => {
    onChange(selected.filter(item => item.code !== code));
  };

  const full = selected.length >= maxSelections;

  return (
    <View>
      {selected.map(item => (
        <View
          key={item.code}
          style={[styles.chip, { backgroundColor: theme.surface, borderColor: theme.primary }]}>
          <Text style={[styles.chipCode, { color: theme.primary }]}>{item.code}</Text>
          <Text style={[styles.chipDesc, { color: theme.text }]} numberOfLines={2}>
            {item.description}
          </Text>
          <TouchableOpacity
            onPress={() => handleRemove(item.code)}
            accessibilityLabel={`${t('remove', 'Remover')} ${item.code}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={[styles.chipRemove, { color: theme.textMuted }]}>✕</Text>
          </TouchableOpacity>
        </View>
      ))}

      {!full && (
        <View>
          <View
            style={[
              styles.inputRow,
              { backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
            ]}>
            <TextInput
              style={[styles.input, { color: theme.text }]}
              value={query}
              onChangeText={setQuery}
              placeholder={t('searchICD10', 'Buscar CID-10 (código ou descrição)...')}
              placeholderTextColor={theme.textMuted}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {loading && <ActivityIndicator size="small" color={theme.primary} />}
          </View>

          {results.length > 0 && (
            <View
              style={[
                styles.results,
                { backgroundColor: theme.surface, borderColor: theme.surfaceBorder },
              ]}>
              {results.map(item => (
                <TouchableOpacity
                  key={item.code}
                  style={[styles.resultRow, { borderBottomColor: theme.surfaceBorder }]}
                  onPress={() => handleSelect(item)}>
                  <Text style={[styles.resultCode, { color: theme.primary }]}>{item.code}</Text>
                  <Text style={[styles.resultDesc, { color: theme.text }]} numberOfLines={2}>
                    {item.description}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {searched && !loading && results.length === 0 && (
            <Text style={[styles.noResults, { color: theme.textMuted }]}>
              {t('noICD10Results', 'Nenhum código CID-10 encontrado')}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  chipCode: {
    ...typography.body,
    fontWeight: '700',
  },
  chipDesc: {
    ...typography.caption,
    flex: 1,
  },
  chipRemove: {
    ...typography.body,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
  },
  input: {
    ...typography.body,
    flex: 1,
    paddingVertical: spacing.md,
  },
  results: {
    borderWidth: 1,
    borderRadius: borderRadius.md,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  resultCode: {
    ...typography.body,
    fontWeight: '700',
    minWidth: 52,
  },
  resultDesc: {
    ...typography.caption,
    flex: 1,
  },
  noResults: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
});
