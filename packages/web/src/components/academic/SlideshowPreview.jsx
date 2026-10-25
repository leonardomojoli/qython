// frontend/src/components/academic/SlideshowPreview.js
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { toPng } from 'html-to-image';
import styles from './SlideshowPreview.module.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChevronLeft,
  faChevronRight,
  faExpand,
  faCompress,
  faStickyNote,
  faBookmark,
  faCheck,
  faCheckCircle,
  faDownload,
  faFileAlt,
  faImage,
  faClock,
  faListUl,
  faTimes,
  faTrash,
  faThLarge,
  faPlay,
  faPause,
  faRedo
} from '@fortawesome/free-solid-svg-icons';
import { useNotification } from '../../contexts/NotificationContext';

// Helper function to render a single content block based on its type
const renderContentBlock = (block, index, t) => {
  switch (block.type) {
    case 'text':
      return (
        <div key={index} className={styles.textBlock}>
          <ul>
            {block.points.map((point, i) => (
              <li key={i} className={point.startsWith("  ") ? styles.subPoint : styles.mainPoint}>
                <ReactMarkdown>{point.trim()}</ReactMarkdown>
              </li>
            ))}
          </ul>
        </div>
      );
    case 'table':
      return (
        <div key={index} className={styles.tableBlock}>
          {block.title && <h4>{block.title}</h4>}
          <div className={styles.tableWrapper}>
            <table>
              <thead>
                <tr>
                  {block.columns.map((col, i) => <th key={i}>{col}</th>)}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => <td key={j}>{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    case 'image_suggestion':
      if (block.generated_image_url) {
        return (
          <div key={index} className={styles.imageBlock}>
            <img src={block.generated_image_url} alt={block.description} />
          </div>
        );
      }
      return null;
    case 'key_takeaway':
      return (
        <div key={index} className={styles.keyTakeawayBlock}>
          <h4>{t('keyPoints')}</h4>
          <ul>
            {block.points.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
        </div>
      );
    case 'clinical_vignette':
      return (
        <div key={index} className={styles.vignetteBlock}>
          <h4>{block.title || t('clinicalCase')}</h4>
          <p><strong>{t('scenario')}:</strong> {block.scenario}</p>
          <p><strong>{t('question')}:</strong> {block.question}</p>
          <p><strong>{t('answer')}:</strong> {block.answer}</p>
        </div>
      );
    default:
      return null;
  }
};

const SlideshowPreview = ({ slideshowData, title: externalTitle }) => {
  const { t } = useTranslation();
  const { addNotification } = useNotification();

  // Core states
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Enhanced features states
  const [viewedSlides, setViewedSlides] = useState({});
  const [bookmarks, setBookmarks] = useState([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showGridView, setShowGridView] = useState(false);
  const [isViewed, setIsViewed] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Timer states
  const [timerActive, setTimerActive] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [slideStartTime, setSlideStartTime] = useState(Date.now());

  // Refs
  const containerRef = useRef(null);
  const slideRef = useRef(null);

  if (!slideshowData || !slideshowData.slides || slideshowData.slides.length === 0) {
    return <p className={styles.noContent}>{t('noSlidesContent')}</p>;
  }

  const { title: presentationTitle, slides } = slideshowData;
  const displayTitle = externalTitle || presentationTitle;

  // Calculate progress
  const progress = useMemo(() => {
    const viewed = Object.keys(viewedSlides).length;
    const total = slides.length;
    const percentage = total > 0 ? Math.round((viewed / total) * 100) : 0;
    return { viewed, total, percentage };
  }, [viewedSlides, slides.length]);

  // Mark current slide as viewed
  useEffect(() => {
    setViewedSlides(prev => ({ ...prev, [currentSlide]: true }));
    setSlideStartTime(Date.now());
  }, [currentSlide]);

  // Auto-mark as viewed when all slides seen
  useEffect(() => {
    if (progress.percentage >= 100 && !isViewed) {
      setIsViewed(true);
    }
  }, [progress.percentage, isViewed]);

  // Timer effect
  useEffect(() => {
    let interval;
    if (timerActive && isPresentationMode) {
      interval = setInterval(() => {
        setTimerSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerActive, isPresentationMode]);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const goToPrevious = useCallback(() => {
    setCurrentSlide((prev) => (prev > 0 ? prev - 1 : slides.length - 1));
  }, [slides.length]);

  const goToNext = useCallback(() => {
    setCurrentSlide((prev) => (prev < slides.length - 1 ? prev + 1 : 0));
  }, [slides.length]);

  const goToSlide = useCallback((index) => {
    setCurrentSlide(index);
    setShowGridView(false);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goToNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrevious();
      } else if (e.key === 'Escape') {
        if (showGridView) {
          setShowGridView(false);
        } else if (isPresentationMode) {
          setIsPresentationMode(false);
          if (document.fullscreenElement) {
            document.exitFullscreen();
          }
        }
      } else if (e.key === 'g' && !isPresentationMode) {
        setShowGridView(prev => !prev);
      } else if (e.key === 'b') {
        addBookmark();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPresentationMode, showGridView, goToNext, goToPrevious]);

  // Handle fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isPresentationMode) {
        setIsPresentationMode(false);
        setTimerActive(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [isPresentationMode]);

  const togglePresentationMode = async () => {
    if (!isPresentationMode) {
      try {
        if (containerRef.current) {
          await containerRef.current.requestFullscreen();
        }
        setIsPresentationMode(true);
        setTimerActive(true);
        setTimerSeconds(0);
      } catch (err) {
        console.error('Could not enter fullscreen:', err);
      }
    } else {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      }
      setIsPresentationMode(false);
      setTimerActive(false);
    }
  };

  // Bookmark functions
  const addBookmark = useCallback(() => {
    const existingBookmark = bookmarks.find(b => b.slideIndex === currentSlide);
    if (existingBookmark) {
      addNotification(t('slideAlreadyBookmarked'), 'info');
      return;
    }

    const newBookmark = {
      id: Date.now(),
      slideIndex: currentSlide,
      slideTitle: slides[currentSlide].title,
      createdAt: new Date().toISOString()
    };
    setBookmarks(prev => [...prev, newBookmark].sort((a, b) => a.slideIndex - b.slideIndex));
    addNotification(t('bookmarkAdded'), 'success');
  }, [currentSlide, bookmarks, slides, t, addNotification]);

  const removeBookmark = useCallback((id) => {
    setBookmarks(prev => prev.filter(b => b.id !== id));
    addNotification(t('bookmarkRemoved'), 'success');
  }, [t, addNotification]);

  const isCurrentSlideBookmarked = bookmarks.some(b => b.slideIndex === currentSlide);

  // Export functions
  const exportNotesAsMarkdown = useCallback(() => {
    let markdown = `# ${displayTitle}\n\n`;
    markdown += `---\n\n`;
    markdown += `**${t('totalSlides')}:** ${slides.length}\n\n`;
    markdown += `---\n\n`;

    slides.forEach((slide, idx) => {
      markdown += `## ${t('slide')} ${idx + 1}: ${slide.title}\n\n`;

      if (slide.speaker_notes) {
        markdown += `### ${t('speakerNotes')}\n\n`;
        markdown += `${slide.speaker_notes}\n\n`;
      }

      // Add content summary
      slide.content.forEach(block => {
        if (block.type === 'text' && block.points) {
          block.points.forEach(point => {
            markdown += `- ${point.trim()}\n`;
          });
          markdown += '\n';
        } else if (block.type === 'key_takeaway' && block.points) {
          markdown += `**${t('keyPoints')}:**\n`;
          block.points.forEach(point => {
            markdown += `- ${point}\n`;
          });
          markdown += '\n';
        }
      });

      markdown += `---\n\n`;
    });

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${displayTitle.replace(/\s+/g, '-').toLowerCase()}-notes.md`;
    a.click();
    URL.revokeObjectURL(url);

    addNotification(t('notesExported'), 'success');
    setShowExportMenu(false);
  }, [slides, displayTitle, t, addNotification]);

  const exportCurrentSlideAsImage = useCallback(async () => {
    if (!slideRef.current) return;

    try {
      const dataUrl = await toPng(slideRef.current, {
        backgroundColor: '#1a1a2e',
        pixelRatio: 2
      });

      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `slide-${currentSlide + 1}-${slides[currentSlide].title.replace(/\s+/g, '-').toLowerCase()}.png`;
      a.click();

      addNotification(t('slideExported'), 'success');
    } catch (err) {
      console.error('Failed to export slide:', err);
      addNotification(t('exportFailed'), 'error');
    }
    setShowExportMenu(false);
  }, [currentSlide, slides, t, addNotification]);

  // Toggle viewed status
  const toggleViewed = useCallback(() => {
    setIsViewed(prev => !prev);
    addNotification(
      isViewed ? t('unmarkedAsViewed') : t('markedAsViewed'),
      'success'
    );
  }, [isViewed, t, addNotification]);

  const slide = slides[currentSlide];

  // Render thumbnail content preview
  const renderThumbnailContent = (slideData) => {
    const firstTextBlock = slideData.content?.find(b => b.type === 'text');
    if (firstTextBlock && firstTextBlock.points?.length > 0) {
      return firstTextBlock.points[0].substring(0, 40) + (firstTextBlock.points[0].length > 40 ? '...' : '');
    }
    return '';
  };

  return (
    <div
      ref={containerRef}
      className={`${styles.slideshowContainer} ${isPresentationMode ? styles.presentationMode : ''}`}
    >
      {/* Header */}
      {!isPresentationMode && (
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <h3 className={styles.presentationTitle}>{displayTitle}</h3>
            {isViewed && (
              <span className={styles.viewedBadge}>
                <FontAwesomeIcon icon={faCheckCircle} /> {t('viewed')}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className={styles.progressSection}>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
            <span className={styles.progressText}>
              {progress.viewed}/{progress.total} {t('slides')} ({progress.percentage}%)
            </span>
          </div>
        </div>
      )}

      {/* Grid View Modal */}
      {showGridView && !isPresentationMode && (
        <div className={styles.gridOverlay}>
          <div className={styles.gridHeader}>
            <h4>{t('slideOverview')}</h4>
            <button onClick={() => setShowGridView(false)} className={styles.closeButton}>
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>
          <div className={styles.gridContainer}>
            {slides.map((slideItem, index) => (
              <div
                key={index}
                className={`${styles.gridItem} ${currentSlide === index ? styles.gridItemActive : ''} ${viewedSlides[index] ? styles.gridItemViewed : ''}`}
                onClick={() => goToSlide(index)}
              >
                <div className={styles.gridItemNumber}>{index + 1}</div>
                <div className={styles.gridItemTitle}>{slideItem.title}</div>
                {bookmarks.some(b => b.slideIndex === index) && (
                  <FontAwesomeIcon icon={faBookmark} className={styles.gridItemBookmark} />
                )}
                {viewedSlides[index] && (
                  <FontAwesomeIcon icon={faCheck} className={styles.gridItemCheck} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={styles.mainLayout}>
        {/* Thumbnail Sidebar */}
        <div className={`${styles.thumbnailSidebar} ${isPresentationMode ? styles.hidden : ''}`}>
          {slides.map((slideItem, index) => (
            <div
              key={index}
              className={`${styles.thumbnail} ${currentSlide === index ? styles.active : ''} ${viewedSlides[index] ? styles.viewed : ''}`}
              onClick={() => setCurrentSlide(index)}
            >
              <div className={styles.thumbnailHeader}>
                <span className={styles.thumbnailNumber}>{index + 1}</span>
                {bookmarks.some(b => b.slideIndex === index) && (
                  <FontAwesomeIcon icon={faBookmark} className={styles.thumbnailBookmark} />
                )}
                {viewedSlides[index] && (
                  <FontAwesomeIcon icon={faCheck} className={styles.thumbnailCheck} />
                )}
              </div>
              <div className={styles.thumbnailTitle}>
                {slideItem.title?.substring(0, 25)}{slideItem.title?.length > 25 ? '...' : ''}
              </div>
              <div className={styles.thumbnailPreview}>
                {renderThumbnailContent(slideItem)}
              </div>
            </div>
          ))}
        </div>

        {/* Main Slide View */}
        <div className={styles.slideArea}>
          <div className={styles.slideWrapper}>
            <div
              ref={slideRef}
              className={`${styles.slide} ${isPresentationMode ? styles.presentationSlide : ''}`}
            >
              <h4 className={styles.slideTitle}>{slide.title}</h4>
              <div className={styles.slideContent}>
                {slide.content.map((block, index) => renderContentBlock(block, index, t))}
              </div>
            </div>
          </div>

          {/* Speaker Notes Panel */}
          {slide.speaker_notes && showNotes && !isPresentationMode && (
            <div className={styles.notesPanel}>
              <h5 className={styles.notesPanelTitle}>{t('speakerNotes')}</h5>
              <p className={styles.notesContent}>{slide.speaker_notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Action Bar (non-presentation mode) */}
      {!isPresentationMode && (
        <div className={styles.actionBar}>
          <button
            onClick={addBookmark}
            className={`${styles.actionBtn} ${isCurrentSlideBookmarked ? styles.active : ''}`}
            title={t('addBookmark')}
          >
            <FontAwesomeIcon icon={faBookmark} />
            <span>{t('bookmark')}</span>
          </button>

          <button
            onClick={toggleViewed}
            className={`${styles.actionBtn} ${isViewed ? styles.active : ''}`}
            title={isViewed ? t('markAsNotViewed') : t('markAsViewed')}
          >
            <FontAwesomeIcon icon={isViewed ? faCheckCircle : faCheck} />
            <span>{isViewed ? t('viewed') : t('markAsViewed')}</span>
          </button>

          <button
            onClick={() => setShowGridView(true)}
            className={styles.actionBtn}
            title={t('slideOverview')}
          >
            <FontAwesomeIcon icon={faThLarge} />
            <span>{t('overview')}</span>
          </button>

          {bookmarks.length > 0 && (
            <button
              onClick={() => setShowBookmarks(!showBookmarks)}
              className={`${styles.actionBtn} ${showBookmarks ? styles.active : ''}`}
              title={t('showBookmarks')}
            >
              <FontAwesomeIcon icon={faListUl} />
              <span>{t('bookmarks')} ({bookmarks.length})</span>
            </button>
          )}

          <div className={styles.exportWrapper}>
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className={styles.actionBtn}
              title={t('export')}
            >
              <FontAwesomeIcon icon={faDownload} />
              <span>{t('export')}</span>
            </button>
            {showExportMenu && (
              <div className={styles.exportMenu}>
                <button onClick={exportNotesAsMarkdown}>
                  <FontAwesomeIcon icon={faFileAlt} /> {t('exportNotes')}
                </button>
                <button onClick={exportCurrentSlideAsImage}>
                  <FontAwesomeIcon icon={faImage} /> {t('exportSlideImage')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bookmarks Panel */}
      {showBookmarks && bookmarks.length > 0 && !isPresentationMode && (
        <div className={styles.bookmarksPanel}>
          <h5>{t('bookmarkedSlides')}</h5>
          <ul className={styles.bookmarksList}>
            {bookmarks.map((bookmark) => (
              <li key={bookmark.id} className={styles.bookmarkItem}>
                <button
                  className={styles.bookmarkSlide}
                  onClick={() => goToSlide(bookmark.slideIndex)}
                >
                  <span className={styles.bookmarkNumber}>{bookmark.slideIndex + 1}</span>
                  {bookmark.slideTitle}
                </button>
                <button
                  className={styles.bookmarkDelete}
                  onClick={() => removeBookmark(bookmark.id)}
                  title={t('delete')}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Navigation */}
      <div className={`${styles.navigation} ${isPresentationMode ? styles.presentationNav : ''}`}>
        <div className={styles.navLeft}>
          <button onClick={goToPrevious} className={styles.navButton} title={t('previousSlide')}>
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
        </div>

        <div className={styles.navCenter}>
          {isPresentationMode && (
            <div className={styles.timerDisplay}>
              <FontAwesomeIcon icon={faClock} />
              <span>{formatTimer(timerSeconds)}</span>
              <button
                onClick={() => setTimerActive(!timerActive)}
                className={styles.timerButton}
                title={timerActive ? t('pauseTimer') : t('startTimer')}
              >
                <FontAwesomeIcon icon={timerActive ? faPause : faPlay} />
              </button>
              <button
                onClick={() => setTimerSeconds(0)}
                className={styles.timerButton}
                title={t('resetTimer')}
              >
                <FontAwesomeIcon icon={faRedo} />
              </button>
            </div>
          )}
          <span className={styles.slideCounter}>
            {t('slide')} {currentSlide + 1} / {slides.length}
          </span>
        </div>

        <div className={styles.navRight}>
          <button onClick={goToNext} className={styles.navButton} title={t('nextSlide')}>
            <FontAwesomeIcon icon={faChevronRight} />
          </button>

          {slide.speaker_notes && (
            <button
              onClick={() => setShowNotes(!showNotes)}
              className={`${styles.navActionButton} ${showNotes ? styles.activeAction : ''}`}
              title={showNotes ? t('hideNotes') : t('showNotes')}
            >
              <FontAwesomeIcon icon={faStickyNote} />
            </button>
          )}

          <button
            onClick={togglePresentationMode}
            className={styles.navActionButton}
            title={isPresentationMode ? t('exitPresentation') : t('presentationMode')}
          >
            <FontAwesomeIcon icon={isPresentationMode ? faCompress : faExpand} />
          </button>
        </div>
      </div>

      {/* Presentation Mode Hint */}
      {isPresentationMode && (
        <div className={styles.presentationHint}>
          {t('useArrowKeys')} | ESC {t('toExit')} | B = {t('bookmark')}
        </div>
      )}
    </div>
  );
};

export default SlideshowPreview;
