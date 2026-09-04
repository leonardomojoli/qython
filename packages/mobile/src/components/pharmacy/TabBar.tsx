import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { alpha } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

export interface Tab {
  key: string;
  label: string;
}

interface Props {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
}

export default function TabBar({ tabs, activeTab, onTabChange }: Props) {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { borderBottomColor: theme.surfaceBorder }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              style={({ pressed }) => [
                styles.tab,
                isActive && {
                  backgroundColor: alpha(theme.primary, 0.1),
                },
                pressed && !isActive && {
                  backgroundColor: alpha(theme.primary, 0.04),
                },
              ]}
              onPress={() => onTabChange(tab.key)}>
              <Text
                style={[
                  styles.tabText,
                  { color: isActive ? theme.primary : theme.textMuted },
                  isActive && styles.tabTextActive,
                ]}>
                {tab.label}
              </Text>
              {isActive && (
                <View
                  style={[
                    styles.activeIndicator,
                    {
                      backgroundColor: theme.primary,
                      shadowColor: theme.primary,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.6,
                      shadowRadius: 4,
                      elevation: 3,
                    },
                  ]}
                />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  tab: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopLeftRadius: borderRadius.md,
    borderTopRightRadius: borderRadius.md,
    position: 'relative',
  },
  tabText: {
    ...typography.buttonSmall,
    letterSpacing: 0.2,
  },
  tabTextActive: {
    fontWeight: '700',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -1,
    left: spacing.sm,
    right: spacing.sm,
    height: 2.5,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
});
