// src/components/shared/InlineMarkdown.js
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

/**
 * Markdown INLINE para enunciado, alternativas e justificativa das questões.
 *
 * O gerador escreve Markdown (é como o modelo naturalmente escreve, e é o que
 * permite destacar em **negrito** os termos que a questão manda analisar, como
 * a banca faz na prova impressa). Aqui renderizamos isso SEM quebra de bloco:
 * o `p` vira fragmento, então o texto flui dentro do elemento do chamador.
 *
 * ⚠️ LACUNAS: a convenção de lacuna é uma sequência de sublinhados (`______`).
 * Em Markdown, `_` é ênfase — dependendo do que vier em volta, o parser poderia
 * comer a lacuna e a questão perderia o sentido. Por isso escapamos toda
 * sequência de 2+ sublinhados antes de renderizar, garantindo que a lacuna
 * apareça sempre, em qualquer vizinhança.
 */
const escapeBlanks = (value) =>
  String(value ?? '').replace(/_{2,}/g, (run) => run.replace(/_/g, '\\_'));

const INLINE_COMPONENTS = {
  p: ({ children }) => <>{children}</>,
  // segurança extra: nada de bloco dentro de um enunciado
  h1: ({ children }) => <>{children}</>,
  h2: ({ children }) => <>{children}</>,
  h3: ({ children }) => <>{children}</>,
};

const InlineMarkdown = ({ children }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    rehypePlugins={[rehypeSanitize]}
    components={INLINE_COMPONENTS}
  >
    {escapeBlanks(children)}
  </ReactMarkdown>
);

export default InlineMarkdown;
