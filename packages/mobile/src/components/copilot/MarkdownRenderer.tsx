import React from 'react';
import { Image, Linking, StyleSheet, Text, TouchableOpacity } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { useTheme } from '../../contexts/ThemeContext';
import type { ChatSource } from '../../services/copilot';
import { useTranslation } from 'react-i18next';
import { referenceBadgeI18nKey, referenceUrl, linkifyCitations } from '@qython/shared/src/references';
import { API_BASE_URL } from '../../config/env';

interface Props {
  content: string;
  sources?: ChatSource[];
}

export default function MarkdownRenderer({ content, sources }: Props) {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const markdownStyles = StyleSheet.create({
    body: {
      color: theme.text,
      fontSize: 15,
      lineHeight: 22,
    },
    heading1: {
      color: theme.text,
      fontSize: 22,
      fontWeight: '700',
      marginVertical: 8,
    },
    heading2: {
      color: theme.text,
      fontSize: 19,
      fontWeight: '600',
      marginVertical: 6,
    },
    heading3: {
      color: theme.text,
      fontSize: 17,
      fontWeight: '600',
      marginVertical: 4,
    },
    paragraph: {
      marginVertical: 4,
    },
    strong: {
      fontWeight: '700',
      color: theme.text,
    },
    em: {
      fontStyle: 'italic',
    },
    link: {
      color: theme.primary,
      textDecorationLine: 'underline',
    },
    blockquote: {
      backgroundColor: theme.surface,
      borderLeftColor: theme.primary,
      borderLeftWidth: 3,
      paddingLeft: 12,
      paddingVertical: 8,
      marginVertical: 8,
    },
    code_inline: {
      backgroundColor: theme.surface,
      color: theme.secondary,
      fontFamily: 'monospace',
      fontSize: 13,
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 3,
    },
    code_block: {
      backgroundColor: theme.surface,
      color: theme.text,
      fontFamily: 'monospace',
      fontSize: 13,
      padding: 12,
      borderRadius: 8,
      marginVertical: 8,
    },
    fence: {
      backgroundColor: theme.surface,
      color: theme.text,
      fontFamily: 'monospace',
      fontSize: 13,
      padding: 12,
      borderRadius: 8,
      marginVertical: 8,
    },
    list_item: {
      marginVertical: 2,
    },
    bullet_list: {
      marginVertical: 4,
    },
    ordered_list: {
      marginVertical: 4,
    },
    table: {
      borderColor: theme.surfaceBorder,
      borderWidth: 1,
      borderRadius: 4,
      marginVertical: 8,
    },
    thead: {
      backgroundColor: theme.surface,
    },
    th: {
      padding: 8,
      borderColor: theme.surfaceBorder,
      borderRightWidth: 1,
    },
    td: {
      padding: 8,
      borderColor: theme.surfaceBorder,
      borderRightWidth: 1,
    },
    tr: {
      borderColor: theme.surfaceBorder,
      borderBottomWidth: 1,
    },
    hr: {
      backgroundColor: theme.surfaceBorder,
      height: 1,
      marginVertical: 12,
    },
  });

  const hasSources = !!(sources && sources.length);

  // Paridade web: [n] vira chip clicável com a badge do tipo da fonte (Bula/PubMed/…).
  // No mobile, tocar no chip abre a fonte direto (gesto natural — equivale a clicar na lista).
  const rules = {
    // Imagem da biblioteca do usuário (o backend resolve [IMAGEM: ...] e grava um caminho
    // RELATIVO na resposta — assim a mesma mensagem funciona em qualquer ambiente). No
    // mobile não existe origem implícita, então prefixamos com a base da API aqui.
    image: (node: any) => {
      const src: string = node.attributes?.src || '';
      if (!src) return null;
      const uri = src.startsWith('http') ? src : `${API_BASE_URL.replace(/\/$/, '')}${src}`;
      return (
        <TouchableOpacity
          key={node.key}
          activeOpacity={0.85}
          onPress={() => Linking.openURL(uri)}>
          <Image
            source={{ uri }}
            style={[chipStyles.answerImage, { borderColor: theme.surfaceBorder, backgroundColor: theme.surface }]}
            resizeMode="contain"
          />
        </TouchableOpacity>
      );
    },
    link: (node: any, children: any, _parent: any, styles: any, onLinkPress: any) => {
      const href: string = node.attributes?.href || '';
      const m = /^#qref-(\d+)$/.exec(href);
      if (m && hasSources) {
        const n = parseInt(m[1], 10);
        const src = sources![n - 1];
        // tipo + número ("Web 6"): badge sozinho era ambíguo (qual web?); número rastreia até a lista
        const label = src ? `${t(referenceBadgeI18nKey(src))} ${n}` : `[${n}]`;
        const url = src ? referenceUrl(src) : '';
        return (
          <Text
            key={node.key}
            onPress={() => url && Linking.openURL(url)}
            style={[
              chipStyles.citeChip,
              {
                color: theme.primary,
                backgroundColor: theme.primary + '1F',
              },
            ]}>
            {' '}{label}{' '}
          </Text>
        );
      }
      return (
        <Text
          key={node.key}
          style={styles.link}
          onPress={() => href && (onLinkPress ? onLinkPress(href) : Linking.openURL(href))}>
          {children}
        </Text>
      );
    },
  };

  const processed = hasSources ? linkifyCitations(content, sources) : content;

  return (
    <Markdown style={markdownStyles} rules={rules}>
      {processed}
    </Markdown>
  );
}

const chipStyles = StyleSheet.create({
  citeChip: {
    fontSize: 11,
    fontWeight: '700',
    borderRadius: 5,
    overflow: 'hidden',
  },
  // Imagem dentro da resposta: teto de altura para não empurrar o texto fora da tela;
  // tocar abre em tamanho cheio no navegador (paridade com o clique no web).
  answerImage: {
    width: '100%',
    height: 220,
    marginTop: 10,
    marginBottom: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
});
