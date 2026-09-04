import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Share,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';
import { MATERIAL_TYPE_CONFIG } from '../../types/academic';

interface Props {
  materialType: string;
  title: string;
  content: string;
  onClose: () => void;
}

export default function MaterialContentViewer({ materialType, title, content, onClose }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const config = MATERIAL_TYPE_CONFIG[materialType];

  const handleShare = async () => {
    try {
      await Share.share({ title, message: `${title}\n\n${content}` });
    } catch {}
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.surfaceBorder }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={[styles.closeBtnText, { color: theme.primary }]}>
              {t('close', 'Fechar')}
            </Text>
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
              {config?.icon} {title}
            </Text>
            <Text style={[styles.headerType, { color: theme.textMuted }]}>
              {config ? t(config.labelKey) : materialType}
            </Text>
          </View>
          <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
            <Text style={{ color: theme.primary, fontSize: 16 }}>{'↗'}</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.contentText, { color: theme.text }]}>{content}</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.base,
    borderBottomWidth: 1, gap: spacing.sm,
  },
  closeBtn: { paddingRight: spacing.sm },
  closeBtnText: { ...typography.buttonSmall },
  headerInfo: { flex: 1 },
  headerTitle: { ...typography.label, fontWeight: '600' },
  headerType: { ...typography.caption, marginTop: 2 },
  shareBtn: { padding: spacing.xs },
  content: { padding: spacing.base, paddingBottom: spacing.xxl },
  contentText: { ...typography.body, lineHeight: 26 },
});
