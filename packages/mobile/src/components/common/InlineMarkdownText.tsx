import React from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';

/**
 * Markdown INLINE das questões (paridade com o `InlineMarkdown` do web).
 *
 * O gerador escreve **negrito** para destacar os termos que a questão manda
 * analisar — sem renderizar isso, o candidato veria os asteriscos crus. Aqui
 * basta um parser inline: o enunciado é um parágrafo corrido (o prompt proíbe
 * títulos, listas e tabelas), então não vale o custo de um renderer de bloco.
 *
 * ⚠️ Sublinhado NÃO é tratado como ênfase de propósito: `______` é a convenção
 * de LACUNA das questões de preenchimento e precisa aparecer sempre.
 */
const TOKEN_RE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;

interface Props {
  children?: string | null;
  style?: StyleProp<TextStyle>;
}

export const InlineMarkdownText: React.FC<Props> = ({ children, style }) => {
  const raw = String(children ?? '');
  const parts = raw.split(TOKEN_RE).filter((p) => p !== '');

  return (
    <Text style={style}>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <Text key={i} style={{ fontWeight: '700' }}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return (
            <Text key={i} style={{ fontStyle: 'italic' }}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <Text key={i} style={{ fontFamily: 'monospace' }}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        return <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
};

export default InlineMarkdownText;
