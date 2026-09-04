// frontend/src/components/DocumentViewerModal.js

import React, { useState, useMemo, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faExpand, faCompress } from '@fortawesome/free-solid-svg-icons';
import styles from './DocumentViewerModal.module.css';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
// Worker do pdf.js configurado em um único lugar (ver utils/pdfWorker.js).
// A versão do worker é travada para casar com a API do react-pdf — não inline aqui.
import '../../utils/pdfWorker';

const DocumentViewerModal = ({ isOpen, onClose, doc }) => {
  // Todos os hooks são chamados incondicionalmente no topo do componente.
  const { t } = useTranslation();
  const [numPages, setNumPages] = useState(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const modalContentRef = useRef(null);
  const options = useMemo(() => ({
    cMapUrl: '/cmaps/',
    cMapPacked: true,
  }), []);

  // Memoizado por `doc`: react-pdf recarrega o PDF sempre que a prop `file` muda de
  // referência. Sem isso, alternar tela cheia (que re-renderiza) re-baixaria/re-renderizaria
  // o documento inteiro a cada toggle.
  const fileWithAuth = useMemo(() => {
    if (!doc?.id) return null;
    const token = localStorage.getItem('authToken');
    // Viewer por id: legado serve do disco; Drive-backed faz proxy do original na nuvem
    // do usuário (cache efêmero + Range p/ pdf.js). storage_path pode ser NULL (Drive-only).
    return {
      url: `${api.defaults.baseURL}/academic/documents/${doc.id}/content`,
      httpHeaders: token ? { Authorization: `Bearer ${token}` } : {},
    };
  }, [doc]);

  // Mantém o estado em sincronia com a Fullscreen API (inclui sair via ESC).
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Renderiza cada página na largura ÚTIL do corpo do modal (responsivo). Sem isso a
  // página sai no tamanho intrínseco e, em tela cheia, fica pequena no meio de margens
  // enormes. O ResizeObserver recalcula ao redimensionar e ao entrar/sair da tela cheia.
  const bodyRef = useRef(null);
  const [pageWidth, setPageWidth] = useState(null);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      setPageWidth(Math.max(0, Math.round(el.clientWidth - padX)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen]);

  // A lógica de retorno condicional agora vem DEPOIS dos hooks.
  if (!isOpen || !doc) {
    return null;
  }

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  const toggleFullScreen = () => {
    if (!modalContentRef.current) return;
    if (!document.fullscreenElement) {
      modalContentRef.current.requestFullscreen().catch(() => {});
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  };

  return ReactDOM.createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div
        ref={modalContentRef}
        className={`${styles.modalContent} ${isFullScreen ? styles.fullscreen : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h3>{doc.original_filename.replace(/\.[^/.]+$/, "")}</h3>
          <div className={styles.headerActions}>
            <button
              onClick={toggleFullScreen}
              title={isFullScreen ? t('exitFullScreen') : t('enterFullScreen')}
              className={styles.fullscreenButton}
            >
              <FontAwesomeIcon icon={isFullScreen ? faCompress : faExpand} />
            </button>
            <button onClick={onClose} className={styles.closeButton}>×</button>
          </div>
        </div>
        <div className={styles.modalBody} ref={bodyRef}>
          <Document
            file={fileWithAuth}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={<p>{t('loadingDocument')}</p>}
            error={<p>{t('errorLoadingDocument')}</p>}
            options={options}
          >
            {Array.from(new Array(numPages), (el, index) => (
              <Page
                key={`page_${index + 1}`}
                pageNumber={index + 1}
                width={pageWidth || undefined}
                className={styles.pdfPage}
              />
            ))}
          </Document>
        </div>
      </div>
    </div>,
    document.getElementById('modal-portal')
  );
};

export default DocumentViewerModal;