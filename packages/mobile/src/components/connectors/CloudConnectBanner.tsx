import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import { useConnectorStatus } from '../../hooks/useConnectorStatus';
import DriveConnectButton from './DriveConnectButton';

interface Props {
  onConnected?: () => void;
}

// Banner "conecte sua nuvem" no topo da Biblioteca (paridade com o web). Some quando já
// conectado; em 'revoked', vira aviso de reconexão. É o nudge visível estilo Conectores;
// o bloqueio DURO de ações fica no backend (403 quando CLOUD_LIBRARY_REQUIRED liga).
export default function CloudConnectBanner({ onConnected }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { isConnected, isRevoked, loading, refetch } = useConnectorStatus();

  if (loading || isConnected) return null;

  const accent = isRevoked ? '#F59E0B' : theme.primary;
  const handleReturn = () => {
    refetch();
    if (typeof onConnected === 'function') onConnected();
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: `${accent}55` }]}>
      <Text style={styles.icon}>{isRevoked ? '⚠️' : '☁️'}</Text>
      <View style={styles.body}>
        <Text style={[styles.title, { color: theme.text }]}>
          {isRevoked
            ? t('cloudReconnectTitle', 'Reconecte seu Google Drive')
            : t('cloudConnectTitle', 'Guarde seus arquivos na sua nuvem')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {isRevoked
            ? t('cloudReconnectBanner', 'O acesso ao seu Drive expirou. Reconecte para voltar a adicionar e abrir arquivos.')
            : t('cloudConnectSubtitle', 'Conecte o Google Drive: os originais ficam na sua conta, sem limite de arquivos. A inteligência fica no Qython.')}
        </Text>
        <DriveConnectButton
          onReturn={handleReturn}
          style={[styles.button, { backgroundColor: accent }]}
          textStyle={styles.buttonText}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'flex-start',
  },
  icon: { fontSize: 24, lineHeight: 30 },
  body: { flex: 1, gap: 6 },
  title: { fontSize: 15, fontWeight: '700' },
  subtitle: { fontSize: 13, lineHeight: 18 },
  button: {
    alignSelf: 'flex-start',
    marginTop: 6,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 16,
    minWidth: 160,
    alignItems: 'center',
  },
  buttonText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
});
