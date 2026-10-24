import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { LibraryIcon, FA_ICON_OPTIONS, EMOJI_OPTIONS, isFaIcon, sanitizeIconEmoji } from './libraryIcons';

// Picker compacto: por padrão mostra só o ícone atual (swatch clicável). As opções
// (grade de ícones FA + grade de emojis + emoji custom) abrem num popover só ao clicar.
// `value` é o nome do ícone FA ('heart-pulse') OU um emoji ('🫀'); '' = automático (heurística).

const triggerStyle = {
  width: 46,
  height: 46,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 12,
  border: '1px solid var(--glass-border, rgba(128,128,128,0.3))',
  background: 'rgba(187,134,252,0.10)',
  color: 'var(--accent-color, #bb86fc)',
  cursor: 'pointer',
  fontSize: '1.4rem',
  padding: 0,
  transition: 'border-color .15s, background .15s',
};

const cellBase = {
  width: 38,
  height: 38,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 10,
  border: '1px solid rgba(128,128,128,0.25)',
  background: 'transparent',
  cursor: 'pointer',
  fontSize: '1.2rem',
  color: 'var(--accent-color, #bb86fc)',
  transition: 'border-color .15s, background .15s, transform .1s',
  padding: 0,
};
const cellSelected = {
  borderColor: '#bb86fc',
  background: 'rgba(187,134,252,0.18)',
  boxShadow: '0 0 0 1px #bb86fc',
};

const sectionLabel = {
  fontSize: '0.7rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--text-color-secondary, #999)',
  margin: '2px 2px 6px',
};

const Cell = ({ selected, onClick, title, children }) => (
  <button
    type="button"
    title={title}
    aria-pressed={selected}
    onClick={onClick}
    style={{ ...cellBase, ...(selected ? cellSelected : {}) }}
  >
    {children}
  </button>
);

const POPOVER_WIDTH = 320;
const POPOVER_MAX_HEIGHT = 340;

const LibraryIconPicker = ({ value, onChange }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null); // { top, left }
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  const computePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let top = r.bottom + 6;
    // Vira pra cima se não couber embaixo.
    if (top + POPOVER_MAX_HEIGHT > window.innerHeight - 8 && r.top - POPOVER_MAX_HEIGHT - 6 > 8) {
      top = r.top - POPOVER_MAX_HEIGHT - 6;
    }
    let left = r.left;
    if (left + POPOVER_WIDTH > window.innerWidth - 8) left = window.innerWidth - POPOVER_WIDTH - 8;
    if (left < 8) left = 8;
    setPos({ top, left });
  }, []);

  const toggle = () => {
    if (!open) computePos();
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const onScroll = (e) => {
      // Ignora scroll dentro do próprio popover (a grade rola).
      if (popoverRef.current && popoverRef.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  // Emoji digitado pelo usuário que não está entre os pré-definidos.
  const customEmoji = value && !isFaIcon(value) && !EMOJI_OPTIONS.includes(value) ? value : '';

  const select = (v) => { onChange(v); setOpen(false); };
  const clearToAuto = () => { onChange(''); setOpen(false); };

  const rowStyle = { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 };

  const popover = open && pos ? ReactDOM.createPortal(
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        width: POPOVER_WIDTH,
        maxHeight: POPOVER_MAX_HEIGHT,
        overflowY: 'auto',
        zIndex: 2000,
        background: 'var(--card-background-color, rgba(30,30,40,0.98))',
        border: '1px solid var(--glass-border, rgba(255,255,255,0.1))',
        borderRadius: 12,
        padding: 12,
        boxShadow: '0 12px 40px rgba(0,0,0,0.45)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      <div style={sectionLabel}>{t('icons', 'Ícones')}</div>
      <div style={rowStyle}>
        {FA_ICON_OPTIONS.map((name) => (
          <Cell key={name} title={name} selected={value === name} onClick={() => select(name)}>
            <LibraryIcon value={name} />
          </Cell>
        ))}
      </div>

      <div style={sectionLabel}>{t('emoji', 'Emoji')}</div>
      <div style={rowStyle}>
        {EMOJI_OPTIONS.map((emoji) => (
          <Cell key={emoji} title={t('emoji', 'Emoji')} selected={value === emoji} onClick={() => select(emoji)}>
            <span role="img" aria-label="emoji">{emoji}</span>
          </Cell>
        ))}
      </div>

      <input
        type="text"
        value={customEmoji}
        onChange={(e) => onChange(sanitizeIconEmoji(e.target.value))}
        placeholder={t('customEmojiPlaceholder', 'ou cole um emoji…')}
        maxLength={8}
        aria-label={t('customEmoji', 'Emoji personalizado')}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          padding: '8px 10px',
          borderRadius: 8,
          border: customEmoji ? '1px solid #bb86fc' : '1px solid rgba(128,128,128,0.25)',
          background: 'var(--input-background-color, transparent)',
          color: 'inherit',
          textAlign: 'center',
          fontSize: '1.1rem',
          marginBottom: 8,
        }}
      />

      <button
        type="button"
        onClick={clearToAuto}
        style={{
          width: '100%',
          padding: '8px 10px',
          borderRadius: 8,
          border: '1px dashed rgba(128,128,128,0.35)',
          background: 'transparent',
          color: 'var(--text-color-secondary, #999)',
          cursor: 'pointer',
          fontSize: '0.8rem',
        }}
      >
        {t('iconAutoReset', 'Automático (escolher por mim)')}
      </button>
    </div>,
    document.body
  ) : null;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        title={t('changeIcon', 'Trocar ícone')}
        style={triggerStyle}
      >
        <LibraryIcon value={value} />
      </button>
      <span style={{ fontSize: '0.82rem', color: 'var(--text-color-secondary, #999)' }}>
        {value ? t('changeIcon', 'Trocar ícone') : t('iconAutoHint', 'Automático — clique para escolher')}
      </span>
      {popover}
    </div>
  );
};

export default LibraryIconPicker;
