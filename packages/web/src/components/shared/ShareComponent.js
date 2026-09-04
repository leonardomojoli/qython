// frontend/src/components/ShareComponent.js
import { api } from '../../api';
import { marked } from 'marked';

import { API_URL as API_BASE_URL, WEB_URL } from '../../config';

// A função de conversão agora é exportada para ser reutilizada
export const convertMarkdownToPlainText = (markdownText) => {
  if (!markdownText) return '';
  const html = marked.parse(markdownText);
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  // ... (implementação da conversão de HTML para texto plano)
  const processNode = (node) => {
    let text = '';
    const listSymbols = ['- ', '* ', '• '];
    const traverse = (currentNode, listDepth = 0) => {
      currentNode.childNodes.forEach(child => {
        switch (child.nodeName) {
          case 'P':
          case 'H1':
          case 'H2':
          case 'H3':
          case 'H4':
          case 'H5':
          case 'H6':
            traverse(child, listDepth);
            text += '\n\n';
            break;
          case 'UL':
          case 'OL':
            traverse(child, listDepth + 1);
            text += '\n';
            break;
          case 'LI':
            text += '  '.repeat(listDepth) + listSymbols[listDepth % listSymbols.length];
            traverse(child, listDepth);
            text += '\n';
            break;
          case 'BR':
            text += '\n';
            break;
          case 'HR':
            text += '--------------------------\n\n';
            break;
          case '#text':
            text += child.textContent;
            break;
          default:
            traverse(child, listDepth);
        }
      });
    };
    traverse(node);
    return text;
  };
  let finalText = processNode(doc.body);
  return finalText.replace(/\n{3,}/g, '\n\n').trim();
};


const downloadFile = (content, filename, mimeType) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const getBrandingFooter = (t) => {
  const now = new Date();
  return `\n\n---\n${t('generatedByQython')}\n${WEB_URL}\n${now.toLocaleString()}`;
};

export const handleShareAsTxt = (content, title, t, addNotification) => {
  try {
    const plainTextContent = convertMarkdownToPlainText(content);
    const fullContent = `${title}\n\n${plainTextContent}${getBrandingFooter(t)}`;
    downloadFile(fullContent, `${title.replace(/ /g, '_')}.txt`, 'text/plain;charset=utf-8');
    return true; // Retorna sucesso
  } catch (error) {
    console.error("Erro ao gerar TXT:", error);
    addNotification(t('errorGeneratingTxt', { error: error.message }), 'error');
    return false; // Retorna falha
  }
};

export const handleShareAsPdf = async (content, addNotification, i18n) => {
  try {
    // O 'content' que chega aqui agora é a string formatada.
    // Precisamos garantir que seja uma string.
    const markdownContent = (typeof content === 'string') ? content : convertMarkdownToPlainText(JSON.stringify(content, null, 2));

    const language = i18n.language.split('-')[0];
    const response = await api.post('/export/pdf', { content: markdownContent, language }, {
      responseType: 'blob',
    });

    const disposition = response.headers['content-disposition'];
    let filename = `Qython_Response_${new Date().toISOString().split('T')[0]}.pdf`;

    if (disposition) {
      const filenameMatch = disposition.match(/filename="(.+?)"/);
      if (filenameMatch && filenameMatch[1]) {
        filename = filenameMatch[1];
      }
    }

    downloadFile(response.data, filename, 'application/pdf');
    return true; // Retorna sucesso
  } catch (error) {
    console.error("Error exporting as PDF:", error);
    addNotification('Erro ao gerar o PDF. Tente novamente.', 'error');
    return false; // Retorna falha
  }
};

export const handleShareAsMarkdown = (content, title, t, addNotification) => {
  try {
    // O conteúdo já está em Markdown, então não precisamos convertê-lo.
    const fullContent = `# ${title}\n\n${content}${getBrandingFooter(t)}`;
    downloadFile(fullContent, `${title.replace(/ /g, '_')}.md`, 'text/markdown;charset=utf-8');
    return true; // Retorna sucesso
  } catch (error) {
    console.error("Erro ao gerar Markdown:", error);
    addNotification(t('errorGeneratingMd', { error: error.message }), 'error');
    return false; // Retorna falha
  }
};