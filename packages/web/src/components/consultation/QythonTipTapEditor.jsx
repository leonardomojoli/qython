// frontend/src/components/consultation/QythonTipTapEditor.js

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Strikethrough from '@tiptap/extension-strike';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { marked } from 'marked';
import { useTranslation } from 'react-i18next';
import { useUser } from '../../contexts/UserContext';
import { useNotification } from '../../contexts/NotificationContext'; // Import useNotification
import localStorageService from '../../utils/localStorageService';

// Configure marked to respect line breaks (single newline = <br>)
marked.setOptions({
  breaks: true,
  gfm: true,
});

import { faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBold, faItalic, faStrikethrough as faStrike, faHeading,
  faQuoteRight, faListUl, faListOl, faTasks, faTableCellsLarge,
  faExpand, faCompress, faUpload, faCheck, faTimes, faChevronUp, faChevronDown,
  faTableColumns, faBarsStaggered, faTrash,
  faSave, faCheckCircle, faSpinner, faCopy, faPaste, faListCheck
} from '@fortawesome/free-solid-svg-icons';
import './QythonTipTapEditor.css';

const AUTOSAVE_DEBOUNCE_TIME = 2000;

// Normal physical exam templates by specialty (same as QuickInsertBar)
const NORMAL_EXAM_TEMPLATES = {
    general: `## Exame Físico
**Estado Geral:** Bom, lúcido, orientado, corado, hidratado, anictérico, acianótico, afebril.
**ACV:** RCR, 2T, BNF, sem sopros.
**AR:** MV presente bilateralmente, sem RA.
**Abdome:** Plano, flácido, indolor à palpação, RHA+.
**MMII:** Sem edema, pulsos palpáveis e simétricos.`,
    "Cardiologia": `## Exame Cardiovascular
**ACV:** RCR, 2T, BNF, sem sopros. Ictus cordis normoposicionado.
**Pulsos:** Carotídeos simétricos, sem sopros. Periféricos presentes e simétricos.
**Jugulares:** Sem estase.
**MMII:** Sem edema. Panturrilhas livres.`,
    "Pneumologia": `## Exame Respiratório
**Inspeção:** Tórax simétrico, sem uso de musculatura acessória.
**Palpação:** Expansibilidade preservada bilateralmente. FTV normal.
**Percussão:** Som claro pulmonar bilateral.
**Ausculta:** MV presente bilateralmente, sem ruídos adventícios.`,
    "Gastroenterologia": `## Exame Abdominal
**Inspeção:** Plano, sem cicatrizes ou abaulamentos.
**Ausculta:** RHA presentes, normoativos.
**Percussão:** Timpanismo difuso, espaço de Traube livre.
**Palpação:** Flácido, indolor, sem massas ou visceromegalias.
**Sinais:** Murphy (-), Blumberg (-), Giordano (-).`,
    "Neurologia": `## Exame Neurológico
**Estado Mental:** Glasgow 15. Lúcido, orientado.
**Nervos Cranianos:** Pupilas isocóricas e fotorreagentes. MOE preservada. Mímica simétrica.
**Força:** Grau V nos 4 membros.
**Sensibilidade:** Tátil e dolorosa preservadas.
**Reflexos:** Presentes e simétricos. RCP em flexão bilateral.
**Coordenação:** Sem dismetria. **Marcha:** Normal.`,
    "Psiquiatria": `## Exame Psíquico
**Aparência:** Adequada. **Atitude:** Cooperativo.
**Consciência:** Vigil. **Orientação:** Preservada.
**Atenção/Memória:** Preservadas.
**Humor:** Eutímico. **Afeto:** Modulado.
**Pensamento:** Curso e conteúdo sem alterações.
**Sensopercepção:** Sem alucinações.
**Juízo/Insight:** Preservados.`,
    "Dermatologia": `## Exame Dermatológico
**Pele:** Normotérmica, normocorada, turgor preservado.
**Lesões:** Ausentes/Presentes (descrever localização, tipo, cor, tamanho, bordas).
**Mucosas:** Íntegras, normocoradas.
**Fâneros:** Cabelos e unhas sem alterações.`,
};

const Toolbar = ({
  editor,
  toggleFullScreen,
  isFullScreen,
  saveStatus,
  t,
  globalAutosaveEnabled,
  onManualSave,
  canManuallySave
}) => {
  if (!editor) return null;

  const [showTableForm, setShowTableForm] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const fileInputRef = useRef(null);

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result;
      if (src) {
        editor.chain().focus().setImage({ src: String(src), alt: file.name }).run();
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const triggerImageUpload = () => {
    fileInputRef.current?.click();
  };

  const toggleTableForm = useCallback(() => {
    setShowTableForm(prev => !prev);
  }, []);

  const insertTable = useCallback(() => {
    editor.chain().focus().insertTable({ rows: Number(tableRows), cols: Number(tableCols), withHeaderRow: true }).run();
    setShowTableForm(false);
  }, [editor, tableRows, tableCols]);

  const toolbarCommands = [
    { action: () => editor.chain().focus().toggleBold().run(), icon: faBold, name: 'bold', title: t('boldTitle') },
    { action: () => editor.chain().focus().toggleItalic().run(), icon: faItalic, name: 'italic', title: t('italicTitle') },
    { action: () => editor.chain().focus().toggleStrike().run(), icon: faStrike, name: 'strike', title: t('strikeTitle') },
    { action: () => editor.chain().focus().toggleBlockquote().run(), icon: faQuoteRight, name: 'blockquote', title: t('blockquoteTitle') },
    { type: 'divider' },
    { action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), icon: faHeading, name: 'heading', params: { level: 1 }, title: t('heading1Title'), text: 'H1' },
    { action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), icon: faHeading, name: 'heading', params: { level: 2 }, title: t('heading2Title'), text: 'H2' },
    { action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), icon: faHeading, name: 'heading', params: { level: 3 }, title: t('heading3Title'), text: 'H3' },
    { type: 'divider' },
    { action: triggerImageUpload, icon: faUpload, name: 'imageUpload', title: t('uploadImageTitle') },
    { type: 'divider' },
    { action: () => editor.chain().focus().toggleBulletList().run(), icon: faListUl, name: 'bulletList', title: t('bulletListTitle') },
    { action: () => editor.chain().focus().toggleOrderedList().run(), icon: faListOl, name: 'orderedList', title: t('orderedListTitle') },
    { action: () => editor.chain().focus().toggleTaskList().run(), icon: faListCheck, name: 'taskList', title: t('taskListTitle') },
    { action: toggleTableForm, icon: faTableCellsLarge, name: 'table', title: t('insertTableTitle') },
  ];

  return (
    <div className="qython-editor-toolbar">
      <div className="toolbar-section toolbar-section-left">
        <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" style={{ display: 'none' }} />
        {toolbarCommands.map((cmd, index) => {
          if (cmd.type === 'divider') {
            return <span key={`divider-${index}`} className="toolbar-divider"></span>;
          }
          let isDisabled = false;
          if (cmd.name && !['imageUpload', 'table'].includes(cmd.name)) {
            const commandName = cmd.name === 'strike' ? 'toggleStrike' : `toggle${cmd.name.charAt(0).toUpperCase() + cmd.name.slice(1)}`;
            if (editor.can()?.[commandName]) {
              isDisabled = !editor.can()[commandName](cmd.params);
            } else if (cmd.name === 'heading' && editor.can()?.toggleHeading) {
              isDisabled = !editor.can().toggleHeading(cmd.params);
            }
          }
          let isActive = false;
          if (cmd.isActiveTest) {
            isActive = cmd.isActiveTest();
          } else if (cmd.name) {
            isActive = editor.isActive(cmd.name, cmd.params);
          }
          const buttonElement = (
            <button
              key={cmd.title || `cmd-${index}`}
              onClick={cmd.action}
              title={cmd.title}
              disabled={isDisabled}
              className={isActive ? 'is-active' : ''} // A classe base .qython-editor-toolbar button já aplica estilos
            >
              <FontAwesomeIcon icon={cmd.icon} />
              {cmd.text && <span className="toolbar-button-text">{cmd.text}</span>}
            </button>
          );

          if (cmd.name === 'table') {
            return (
              <React.Fragment key={(cmd.title || 'table-group') + '-group'}>
                {buttonElement}
                {showTableForm && (
                  <div className="qython-inline-form qython-table-form">
                    <div className="table-dimension-control">
                      <span>L:</span>
                      <input type="number" value={tableRows} onChange={(e) => setTableRows(Math.max(1, parseInt(e.target.value, 10) || 1))} min="1" aria-label={t('tableRowsLabel')} />
                      <div className="dimension-buttons">
                        <button onClick={() => setTableRows(prev => prev + 1)} aria-label={t('increaseRowsLabel')}><FontAwesomeIcon icon={faChevronUp} /></button>
                        <button onClick={() => setTableRows(prev => Math.max(1, prev - 1))} aria-label={t('decreaseRowsLabel')}><FontAwesomeIcon icon={faChevronDown} /></button>
                      </div>
                    </div>
                    <span>×</span>
                    <div className="table-dimension-control">
                      <span>C:</span>
                      <input type="number" value={tableCols} onChange={(e) => setTableCols(Math.max(1, parseInt(e.target.value, 10) || 1))} min="1" aria-label={t('tableColsLabel')} />
                      <div className="dimension-buttons">
                        <button onClick={() => setTableCols(prev => prev + 1)} aria-label={t('increaseColsLabel')}><FontAwesomeIcon icon={faChevronUp} /></button>
                        <button onClick={() => setTableCols(prev => Math.max(1, prev - 1))} aria-label={t('decreaseColsLabel')}><FontAwesomeIcon icon={faChevronDown} /></button>
                      </div>
                    </div>
                    <button onClick={insertTable} title={t('createTableTitle')} className="table-action-button"><FontAwesomeIcon icon={faCheck} /></button>
                    <button onClick={() => setShowTableForm(false)} title={t('cancelButtonLabel')} className="table-action-button"><FontAwesomeIcon icon={faTimes} /></button>
                  </div>
                )}
              </React.Fragment>
            );
          }
          return buttonElement;
        })}
      </div>

      <div className="toolbar-section toolbar-section-right">
        {!globalAutosaveEnabled && canManuallySave && (
          <button
            onClick={onManualSave}
            title={t('recordButtonLabel')}
            className="qython-manual-save-button"
            disabled={saveStatus === 'saving'}
          >
            <FontAwesomeIcon icon={faSave} />
            <span style={{ marginLeft: '5px' }}>{t('recordButtonLabel')}</span>
          </button>
        )}

        <div className={`save-status-indicator ${saveStatus !== 'idle' ? saveStatus : (globalAutosaveEnabled ? 'idle-autosave' : '')}`}>
          {saveStatus === 'idle' && globalAutosaveEnabled && (
            <>
              <FontAwesomeIcon icon={faCheckCircle} />
              <span>{t('autosaveActive')}</span>
            </>
          )}
          {saveStatus === 'saving' && (
            <>
              <FontAwesomeIcon icon={faSpinner} spin />
              <span>{t('autosaveRecording')}</span>
            </>
          )}
          {saveStatus === 'saved' && (
            <>
              <FontAwesomeIcon icon={faCheckCircle} />
              <span>{t('autosaveRecorded')}</span>
            </>
          )}
          {saveStatus === 'error' && (
            <>
              <FontAwesomeIcon icon={faTimes} />
              <span>{t('autosaveError')}</span>
            </>
          )}
        </div>

        <button
          onClick={toggleFullScreen}
          title={isFullScreen ? t('exitFullScreen') : t('enterFullScreen')}
          className="qython-fullscreen-button"
        >
          <FontAwesomeIcon icon={isFullScreen ? faCompress : faExpand} />
        </button>
      </div>
    </div>
  );
};

function ContextMenuComponent({ x, y, options, onClose }) {
  const menuRef = useRef(null);
  const [adjustedPosition, setAdjustedPosition] = useState({ x, y });

  if (!options || options.length === 0) return null;

  const handleAction = (action) => {
    if (typeof action === 'function') {
      action();
    }
    onClose();
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (event.target.closest('.qython-context-menu') === null) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Adjust position to keep menu within viewport and near cursor
  useEffect(() => {
    if (!menuRef.current) return;

    const menu = menuRef.current;
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let newX = x;
    let newY = y;

    // Check if menu extends beyond right edge
    if (x + menuRect.width > viewportWidth - 10) {
      newX = x - menuRect.width;
    }

    // Check if menu extends beyond bottom edge
    if (y + menuRect.height > viewportHeight - 10) {
      newY = y - menuRect.height;
    }

    // Ensure menu doesn't go off-screen on left or top
    if (newX < 10) newX = 10;
    if (newY < 10) newY = 10;

    setAdjustedPosition({ x: newX, y: newY });
  }, [x, y]);

  // Use portal to render menu directly in document.body to avoid positioning issues
  const menuContent = (
    <div
      ref={menuRef}
      className="qython-context-menu"
      style={{ top: adjustedPosition.y, left: adjustedPosition.x, position: 'fixed', zIndex: 10000 }}
      onClick={(e) => e.stopPropagation()}
    >
      {options.map((option, index) => {
        if (option.type === 'divider') {
          return <div key={`divider-${index}`} className="context-menu-divider"></div>;
        }
        return (
          <button
            key={option.label || `ctx-menu-item-${index}`}
            onClick={() => handleAction(option.action)}
            disabled={option.disabled}
            className={`context-menu-item ${option.active ? 'active' : ''}`}
          >
            {option.label || "Action"}
          </button>
        );
      })}
    </div>
  );

  return createPortal(menuContent, document.body);
}

const QythonTipTapEditor = ({
  value,
  onChange,
  placeholder,
  height = 200,
  specialty,
  consultationType,
  autosavePrefix = "content",
  enableAutosaveRestore = true,
  onRestore
}) => {
  const { t } = useTranslation();
  const { autosaveEnabled: globalAutosaveEnabled } = useUser();
  const { addNotification } = useNotification(); // For paste notifications
  const editorWrapperRef = useRef(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [currentHeight, setCurrentHeight] = useState(height);
  const [contextMenu, setContextMenu] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const autosaveTimeoutRef = useRef(null);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [restorableContent, setRestorableContent] = useState(null);
  const isRestoringRef = useRef(false);
  // Track which autosave key we last attempted restoration for
  const lastRestorationKeyRef = useRef(null);

  const getAutosaveKey = useCallback(() => {
    // Use "general" as fallback when specialty is empty/undefined
    // This ensures autosave works even before specialty is selected
    const effectiveSpecialty = specialty || 'general';
    if (consultationType && autosavePrefix) {
      return `qythonAutosave_${autosavePrefix}_${effectiveSpecialty}_${consultationType}`;
    }
    return null;
  }, [specialty, consultationType, autosavePrefix]);

  const AUTOSAVE_KEY_DYNAMIC = getAutosaveKey();

  const performSaveRef = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        code: false,
        codeBlock: false,
        strike: false,
      }),
      Markdown.configure({ html: true, linkify: true, breaks: true }),
      Link.configure({ openOnClick: true, autolink: true, linkOnPaste: true, validate: href => /^https?:\/\//.test(href) }),
      Image.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({ placeholder: placeholder || t('startTypingPlaceholder') }),
      Table.configure({ resizable: true }), TableRow, TableHeader, TableCell, Strikethrough, TaskList,
      TaskItem.configure({ nested: true }),
    ],
    immediatelyRender: false,
    content: value ? marked(value) : '',
    onUpdate: ({ editor: currentEditor, transaction }) => {
      if (!transaction.docChanged || isRestoringRef.current) {
        return;
      }
      const markdown = currentEditor.storage.markdown.getMarkdown();
      if (markdown !== value) {
        onChange(markdown);
      }

      if (globalAutosaveEnabled && AUTOSAVE_KEY_DYNAMIC && performSaveRef.current) {
        setSaveStatus('saving');
        if (autosaveTimeoutRef.current) {
          clearTimeout(autosaveTimeoutRef.current);
        }
        autosaveTimeoutRef.current = setTimeout(performSaveRef.current, AUTOSAVE_DEBOUNCE_TIME);
      } else if (!globalAutosaveEnabled) {
        if (saveStatus !== 'idle' && saveStatus !== 'saved') {
          setSaveStatus('idle');
        }
        if (autosaveTimeoutRef.current) {
          clearTimeout(autosaveTimeoutRef.current);
        }
      }
    },
    editorProps: {
      attributes: {
        class: 'ProseMirror qython-tiptap-editable-area',
        spellCheck: "false",
      },
      handleDOMEvents: {
        contextmenu: (view, event) => {
          event.preventDefault();
          const { state } = view;
          const { selection } = state;
          const isTextSelected = !selection.empty;
          let menuOptions = [];

          if (isTextSelected) {
            menuOptions = [
              {
                label: t('cut'), action: async () => {
                  const { from, to } = selection;
                  const selectedText = state.doc.textBetween(from, to, " ");
                  try {
                    await navigator.clipboard.writeText(selectedText);
                    editor.chain().focus().deleteSelection().run();
                    addNotification(t('cutToClipboard'), 'success');
                  } catch (err) {
                    console.error(t('errorCutting'), err);
                    addNotification(t('errorCutting'), 'error');
                  }
                }
              },
              {
                label: t('copy'), action: () => {
                  const { from, to } = selection;
                  const selectedText = state.doc.textBetween(from, to, " ");
                  navigator.clipboard.writeText(selectedText)
                    .then(() => addNotification(t('copiedToClipboard'), 'success'))
                    .catch(err => {
                      console.error(t('errorCopying'), err);
                      addNotification(t('errorCopying'), 'error');
                    });
                }
              },
              {
                label: t('paste'), action: async () => {
                  try {
                    const textToPaste = await navigator.clipboard.readText();
                    if (textToPaste) {
                      editor.chain().focus().insertContent(textToPaste).run();
                      addNotification(t('pastedFromClipboard'), 'success');
                    }
                  } catch (err) {
                    console.error(t('errorPasting'), err);
                    addNotification(t('errorPastingEnablePermission'), 'error');
                  }
                }
              },
              { type: 'divider' },
              { label: t('boldTitle'), action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive('bold') },
              { label: t('italicTitle'), action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive('italic') },
              { label: t('strikeTitle'), action: () => editor.chain().focus().toggleStrike().run(), active: editor.isActive('strike') },
              { type: 'divider' },
              { label: t('selectAll'), action: () => editor.chain().focus().selectAll().run() },
            ];
          } else {
            menuOptions = [
              {
                label: t('paste'), action: async () => {
                  try {
                    const textToPaste = await navigator.clipboard.readText();
                    if (textToPaste) {
                      editor.chain().focus().insertContent(textToPaste).run();
                      addNotification(t('pastedFromClipboard'), 'success');
                    }
                  } catch (err) {
                    console.error(t('errorPasting'), err);
                    addNotification(t('errorPastingEnablePermission'), 'error');
                  }
                }
              },
              { label: t('selectAll'), action: () => editor.chain().focus().selectAll().run() },
              { type: 'divider' },
              {
                label: t('insertVitalSigns'),
                action: () => {
                  const vitalSigns = `## Sinais Vitais\n**PA:** ___/___mmHg | **FC:** ___bpm | **FR:** ___irpm\n**SpO2:** ___%  | **Tax:** ___°C\n**Peso:** ___kg | **Alt:** ___m | **IMC:** ___kg/m²\n`;
                  editor.chain().focus().insertContent(vitalSigns).run();
                }
              },
              {
                label: t('insertNormalExam'),
                action: () => {
                  const examTemplate = NORMAL_EXAM_TEMPLATES[specialty] || NORMAL_EXAM_TEMPLATES.general;
                  editor.chain().focus().insertContent(examTemplate).run();
                }
              },
              {
                label: t('insertChecklistTitle'),
                action: () => {
                  editor.chain().focus().toggleTaskList().run();
                }
              },
            ];
          }

          // Context menu for table operations
          const $anchor = selection.$anchor;
          let inTable = false;
          for (let d = $anchor.depth; d > 0; d--) {
            if ($anchor.node(d).type.name === 'table') {
              inTable = true;
              break;
            }
          }

          if (inTable) {
            menuOptions.push({ type: 'divider' });
            menuOptions.push({ label: t('addColumnBefore'), action: () => editor.chain().focus().addColumnBefore().run(), disabled: !editor.can().addColumnBefore() });
            menuOptions.push({ label: t('addColumnAfter'), action: () => editor.chain().focus().addColumnAfter().run(), disabled: !editor.can().addColumnAfter() });
            menuOptions.push({ label: t('deleteColumn'), action: () => editor.chain().focus().deleteColumn().run(), disabled: !editor.can().deleteColumn() });
            menuOptions.push({ type: 'divider' });
            menuOptions.push({ label: t('addRowBefore'), action: () => editor.chain().focus().addRowBefore().run(), disabled: !editor.can().addRowBefore() });
            menuOptions.push({ label: t('addRowAfter'), action: () => editor.chain().focus().addRowAfter().run(), disabled: !editor.can().addRowAfter() });
            menuOptions.push({ label: t('deleteRow'), action: () => editor.chain().focus().deleteRow().run(), disabled: !editor.can().deleteRow() });
            menuOptions.push({ type: 'divider' });
            menuOptions.push({ label: t('mergeOrSplit'), action: () => editor.chain().focus().mergeOrSplit().run(), disabled: !editor.can().mergeOrSplit() });
            menuOptions.push({ label: t('deleteTable'), action: () => editor.chain().focus().deleteTable().run(), disabled: !editor.can().deleteTable() });
          }

          setContextMenu({ x: event.clientX, y: event.clientY, options: menuOptions });
          return true;
        },
      },
    },
  });

  // ... (props definition)

  const performSave = useCallback(() => {
    if (!editor || !AUTOSAVE_KEY_DYNAMIC) {
      console.warn("Salvamento não pôde ser executado: editor ou chave de autosave indisponível.");
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
      return;
    }
    setSaveStatus('saving');
    try {
      const currentMarkdownContent = editor.storage.markdown.getMarkdown();
      // Use localStorageService with default TTL (7 days)
      localStorageService.setItem(AUTOSAVE_KEY_DYNAMIC, currentMarkdownContent);
      setSaveStatus('saved');
      console.log(`Conteúdo salvo para ${AUTOSAVE_KEY_DYNAMIC}.`);
    } catch (error) {
      console.error("Erro ao salvar conteúdo:", error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, [editor, AUTOSAVE_KEY_DYNAMIC]);

  useEffect(() => {
    performSaveRef.current = performSave;
  }, [performSave]);

  useEffect(() => {
    // Only attempt restoration if:
    // 1. Feature is enabled
    // 2. Editor is ready
    // 3. We have a valid autosave key
    // 4. We haven't already attempted for THIS specific key
    // 5. We're not currently in a restore operation
    const shouldAttemptRestore =
      enableAutosaveRestore &&
      globalAutosaveEnabled &&
      editor &&
      AUTOSAVE_KEY_DYNAMIC &&
      lastRestorationKeyRef.current !== AUTOSAVE_KEY_DYNAMIC &&
      !isRestoringRef.current;

    if (shouldAttemptRestore) {
      // Small delay to ensure editor is fully initialized and value prop is stable
      const checkTimeout = setTimeout(() => {
        // Double-check we haven't already processed this key
        if (lastRestorationKeyRef.current === AUTOSAVE_KEY_DYNAMIC) return;
        lastRestorationKeyRef.current = AUTOSAVE_KEY_DYNAMIC;

        // Retrieve using service (handles expiry)
        const savedMarkdown = localStorageService.getItem(AUTOSAVE_KEY_DYNAMIC);
        if (savedMarkdown && savedMarkdown.trim()) {
          const savedTrimmed = savedMarkdown.trim();
          const valueTrimmed = (value || '').trim();

          // Show restore prompt if saved content differs from the template/prop value
          // We only compare with 'value' (the template), not with editor content,
          // because by this time the editor might have been synced with the template already
          if (savedTrimmed !== valueTrimmed) {
            console.log(`[Autosave] Found saved content for ${AUTOSAVE_KEY_DYNAMIC} that differs from template, showing restore prompt`);
            setRestorableContent(savedMarkdown);
            setShowRestorePrompt(true);
          } else {
            console.log(`[Autosave] Content for ${AUTOSAVE_KEY_DYNAMIC} matches template - no restore needed`);
          }
        } else {
          console.log(`[Autosave] No saved content found for ${AUTOSAVE_KEY_DYNAMIC}`);
        }
      }, 150); // Slightly longer delay to ensure specialty is properly set

      return () => clearTimeout(checkTimeout);
    }
  }, [editor, AUTOSAVE_KEY_DYNAMIC, value, enableAutosaveRestore, globalAutosaveEnabled]);


  const handleRestore = () => {
    if (editor && restorableContent) {
      isRestoringRef.current = true;
      const htmlValue = marked(restorableContent);
      editor.commands.setContent(htmlValue, false);
      onChange(restorableContent);
      console.log(`Conteúdo restaurado de ${AUTOSAVE_KEY_DYNAMIC}`);
      isRestoringRef.current = false;
      if (onRestore) {
        onRestore();
      }
    }
    setShowRestorePrompt(false);
    setRestorableContent(null);
  };

  const handleDiscardRestore = () => {
    if (enableAutosaveRestore && globalAutosaveEnabled && AUTOSAVE_KEY_DYNAMIC) {
      localStorageService.removeItem(AUTOSAVE_KEY_DYNAMIC);
      console.log(`Conteúdo de autosave para ${AUTOSAVE_KEY_DYNAMIC} descartado.`);
    }
    setShowRestorePrompt(false);
    setRestorableContent(null);
    if (editor) {
      isRestoringRef.current = true;
      const defaultHtmlValue = marked(value || '');
      editor.commands.setContent(defaultHtmlValue, false);
      onChange(value || '');
      isRestoringRef.current = false;
    }
  };

  useEffect(() => {
    if (editor && editor.isEditable && !showRestorePrompt && !isRestoringRef.current) {
      const currentMarkdown = editor.storage.markdown.getMarkdown();
      if (value !== currentMarkdown) {
        const newHtmlValue = marked(value || '');
        if (newHtmlValue !== editor.getHTML()) {
          // Prevent this sync from triggering the onUpdate callback (which would cause loops)
          isRestoringRef.current = true;
          editor.commands.setContent(newHtmlValue, true);
          // Use setTimeout to ensure the flag is reset after the update event is processed
          setTimeout(() => {
            isRestoringRef.current = false;
            // After programmatic content update, trigger auto-save if enabled
            // This ensures content from API responses (improved notes, summary) is saved
            // BUT: Don't overwrite if there's existing user content that differs (user edits take priority)
            if (globalAutosaveEnabled && AUTOSAVE_KEY_DYNAMIC && value && value.trim()) {
              try {
                // Check if there's existing saved content that differs from the incoming value
                // If so, this is likely a template being loaded while user has saved edits - don't overwrite
                const existingSaved = localStorageService.getItem(AUTOSAVE_KEY_DYNAMIC);
                if (existingSaved && existingSaved.trim() && existingSaved.trim() !== value.trim()) {
                  console.log(`[Autosave] Preserving existing user content for ${AUTOSAVE_KEY_DYNAMIC} (differs from programmatic value)`);
                  // Don't overwrite - the restore prompt will handle this
                  return;
                }

                setSaveStatus('saving');
                localStorageService.setItem(AUTOSAVE_KEY_DYNAMIC, value);
                console.log(`[Autosave] Programmatic content saved for ${AUTOSAVE_KEY_DYNAMIC}`);
                setSaveStatus('saved');
              } catch (error) {
                console.error("[Autosave] Error saving programmatic content:", error);
                setSaveStatus('error');
                setTimeout(() => setSaveStatus('idle'), 3000);
              }
            }
          }, 0);
        }
      }
    }
  }, [value, editor, showRestorePrompt, enableAutosaveRestore, globalAutosaveEnabled, AUTOSAVE_KEY_DYNAMIC]);

  const toggleFullScreen = () => {
    if (!editorWrapperRef.current) return;
    if (!document.fullscreenElement) {
      editorWrapperRef.current.requestFullscreen().catch(err => {
        alert(`Error entering full screen: ${err.message} (${err.name})`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    setCurrentHeight(height);
  }, [height]);

  const editorWrapperClass = isFullScreen
    ? 'qython-tiptap-editor-wrapper fullscreen'
    : 'qython-tiptap-editor-wrapper';

  const editorStyle = !isFullScreen ? { minHeight: `${currentHeight}px`, resize: 'vertical', overflowY: 'auto' } : { height: '100%', display: 'flex', flexDirection: 'column' };

  const renderRestorePrompt = () => {
    if (!showRestorePrompt || !restorableContent) return null;
    return (
      <div className="qython-restore-prompt">
        <div className="qython-restore-prompt-content">
          <FontAwesomeIcon icon={faInfoCircle} className="qython-restore-prompt-icon" />
          <p className="qython-restore-prompt-text">
            {t('restorePromptMessage')}
          </p>
        </div>
        <div className="qython-restore-prompt-actions">
          <button
            onClick={handleRestore}
            className="qython-restore-prompt-button qython-restore-button-confirm"
          >
            {t('restoreButtonYes')}
          </button>
          <button
            onClick={handleDiscardRestore}
            className="qython-restore-prompt-button qython-restore-button-discard"
          >
            {t('restoreButtonNo')}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div ref={editorWrapperRef} className={editorWrapperClass} style={editorStyle}>
      {editor && (
        <Toolbar
          editor={editor}
          toggleFullScreen={toggleFullScreen}
          isFullScreen={isFullScreen}
          saveStatus={saveStatus}
          t={t}
          globalAutosaveEnabled={globalAutosaveEnabled}
          onManualSave={performSave}
          canManuallySave={!!AUTOSAVE_KEY_DYNAMIC}
        />
      )}
      {renderRestorePrompt()}
      <EditorContent editor={editor} className={isFullScreen ? 'fullscreen-editor-content' : ''} />
      {contextMenu && (
        <ContextMenuComponent // Using the renamed generic component
          x={contextMenu.x}
          y={contextMenu.y}
          options={contextMenu.options}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};

export default QythonTipTapEditor;