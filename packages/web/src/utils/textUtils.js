import DOMPurify from 'dompurify';

/**
 * Processes translation content by converting escaped newlines and formatting
 * @param {string} content - The raw translation content
 * @returns {string} - HTML-formatted content
 */
export const processTranslationContent = (content) => {
    if (!content) return '';

    const html = content
        // Convert escaped newlines (\\n from JSON) to HTML breaks
        .replace(/\\n/g, '<br />')
        // Convert markdown bold (**text**) to HTML
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        // Convert check/cross marks (keep as is)
        .replace(/✅/g, '✅')
        .replace(/❌/g, '❌');

    return DOMPurify.sanitize(html, { ALLOWED_TAGS: ['br', 'strong', 'em', 'b', 'i', 'p', 'span'] });
};

/**
 * Creates a safe HTML object for dangerouslySetInnerHTML
 * @param {string} content - The raw translation content
 * @returns {object} - Object with __html property
 */
export const createSafeHTML = (content) => {
    return { __html: processTranslationContent(content) };
};
