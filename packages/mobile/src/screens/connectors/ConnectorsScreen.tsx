import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, borderRadius } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { useConnectorStatus } from '../../hooks/useConnectorStatus';
import { disconnectDrive } from '../../services/connectors';
import DriveConnectButton from '../../components/connectors/DriveConnectButton';

// Seção Conectores do mobile (paridade com a ConnectorsSection do web). Gerenciar a
// conexão de nuvem: status do Google Drive + Conectar/Desconectar. OneDrive/Dropbox "em breve".
export default function ConnectorsScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { isConnected, isRevoked, accountEmail, loading, refetch } = useConnectorStatus();

  const handleDisconnect = () => {
    Alert.alert(
      t('cloudDisconnect', 'Desconectar'),
      t('cloudDisconnectConfirm', 'Desconectar seu Google Drive? Os arquivos permanecem na sua nuvem, mas o Qython perde acesso a eles até você reconectar.'),
      [
        { text: t('cancel', 'Cancelar'), style: 'cancel' },
        {
          text: t('cloudDisconnect', 'Desconectar'),
          style: 'destructive',
          onPress: async () => { try { await disconnectDrive(); } finally { refetch(); } },
        },
      ],
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        {t('connectorsSubtitle', 'Seus arquivos ficam na sua nuvem; a inteligência fica no Qython.')}
      </Text>

      {/* Google Drive */}
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
        <Text style={styles.cardIcon}>📁</Text>
        <View style={styles.cardBody}>
          <Text style={[styles.cardName, { color: theme.text }]}>Google Drive</Text>
          {loading ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : isConnected ? (
            <Text style={[styles.status, { color: '#03dac6' }]} numberOfLines={1}>
              ✓ {accountEmail || t('cloudConnected', 'Conectado')}
            </Text>
          ) : isRevoked ? (
            <Text style={[styles.status, { color: '#F59E0B' }]}>{t('cloudReconnectNeeded', 'Acesso expirado — reconecte sua conta')}</Text>
          ) : (
            <Text style={[styles.status, { color: theme.textSecondary }]}>{t('cloudNotConnected', 'Não conectado')}</Text>
          )}
        </View>
        {!loading && (isConnected ? (
          <TouchableOpacity onPress={handleDisconnect} style={[styles.discBtn, { borderColor: theme.surfaceBorder }]}>
            <Text style={[styles.discText, { color: theme.textSecondary }]}>{t('cloudDisconnect', 'Desconectar')}</Text>
          </TouchableOpacity>
        ) : (
          <DriveConnectButton
            onReturn={refetch}
            style={[styles.connBtn, { backgroundColor: theme.primary }]}
            textStyle={styles.connText}
            label={t('cloudConnectShort', 'Conectar')}
          />
        ))}
      </View>

      {/* OneDrive / Dropbox — em breve */}
      {['OneDrive', 'Dropbox'].map((name) => (
        <View key={name} style={[styles.card, styles.soon, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
          <Text style={styles.cardIcon}>☁️</Text>
          <View style={styles.cardBody}><Text style={[styles.cardName, { color: theme.text }]}>{name}</Text></View>
          <Text style={[styles.soonBadge, { color: theme.textSecondary }]}>{t('connectorComingSoon', 'Em breve')}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.base },
  subtitle: { ...typography.bodySmall, marginBottom: spacing.base, lineHeight: 20 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.base,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  soon: { opacity: 0.6 },
  cardIcon: { fontSize: 24 },
  cardBody: { flex: 1 },
  cardName: { ...typography.body, fontWeight: '600' },
  status: { ...typography.bodySmall, marginTop: 2 },
  connBtn: { borderRadius: borderRadius.md, paddingVertical: 8, paddingHorizontal: 16, minWidth: 96, alignItems: 'center' },
  connText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  discBtn: { borderRadius: borderRadius.md, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1 },
  discText: { fontWeight: '600', fontSize: 14 },
  soonBadge: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
});
