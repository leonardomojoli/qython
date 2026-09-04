// frontend/src/components/academic/PodcastPlayer.js

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import WaveSurfer from 'wavesurfer.js';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlay,
  faPause,
  faVolumeUp,
  faVolumeMute,
  faBackward,
  faForward,
  faExpand,
  faCompress,
  faDownload,
  faFileAlt,
  faBookmark,
  faCheck,
  faCheckCircle,
  faClock,
  faMicrophone,
  faListUl,
  faTimes,
  faTrash,
  faHeadphones
} from '@fortawesome/free-solid-svg-icons';
import styles from './PodcastPlayer.module.css';
import { useNotification } from '../../contexts/NotificationContext';

const PodcastPlayer = ({
  audioUrl,
  title = 'Podcast',
  script = null,
  duration: initialDuration = null,
  onListened = null
}) => {
  const { t } = useTranslation();
  const { addNotification } = useNotification();

  // Player state
  const waveformRef = useRef(null);
  const wavesurfer = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration || 0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  // Enhanced features state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isListened, setIsListened] = useState(false);
  const [bookmarks, setBookmarks] = useState([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [listenedPercentage, setListenedPercentage] = useState(0);

  // Refs
  const containerRef = useRef(null);
  const maxListenedTime = useRef(0);

  const formatTime = useCallback((seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const formatLongTime = useCallback((seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Calculate word count and estimated reading time from script
  const scriptStats = useMemo(() => {
    if (!script) return null;
    const wordCount = script.split(/\s+/).filter(w => w.length > 0).length;
    const speakingTime = Math.ceil(wordCount / 150); // ~150 words per minute
    return { wordCount, speakingTime };
  }, [script]);

  useEffect(() => {
    if (!waveformRef.current || !audioUrl) return;

    if (wavesurfer.current) {
      wavesurfer.current.destroy();
    }

    wavesurfer.current = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: 'rgba(3, 218, 198, 0.4)',
      progressColor: '#03dac6',
      cursorColor: '#03dac6',
      cursorWidth: 2,
      barWidth: 3,
      barGap: 2,
      barRadius: 3,
      height: 80,
      normalize: true,
      backend: 'WebAudio',
    });

    wavesurfer.current.load(audioUrl);

    wavesurfer.current.on('ready', () => {
      setIsReady(true);
      const dur = wavesurfer.current.getDuration();
      setDuration(dur);
      wavesurfer.current.setVolume(volume);
    });

    wavesurfer.current.on('audioprocess', () => {
      const time = wavesurfer.current.getCurrentTime();
      setCurrentTime(time);

      // Track max listened time for progress
      if (time > maxListenedTime.current) {
        maxListenedTime.current = time;
        const dur = wavesurfer.current.getDuration();
        if (dur > 0) {
          const percent = Math.round((maxListenedTime.current / dur) * 100);
          setListenedPercentage(percent);

          // Auto-mark as listened if > 90% played
          if (percent >= 90 && !isListened) {
            setIsListened(true);
            onListened?.(true);
          }
        }
      }
    });

    wavesurfer.current.on('seeking', () => {
      setCurrentTime(wavesurfer.current.getCurrentTime());
    });

    wavesurfer.current.on('play', () => setIsPlaying(true));
    wavesurfer.current.on('pause', () => setIsPlaying(false));
    wavesurfer.current.on('finish', () => {
      setIsPlaying(false);
      setIsListened(true);
      onListened?.(true);
    });

    return () => {
      if (wavesurfer.current) {
        wavesurfer.current.destroy();
        wavesurfer.current = null;
      }
    };
  }, [audioUrl]);

  const togglePlay = useCallback(() => {
    if (wavesurfer.current && isReady) {
      wavesurfer.current.playPause();
    }
  }, [isReady]);

  const handleVolumeChange = useCallback((e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
    if (wavesurfer.current) {
      wavesurfer.current.setVolume(newVolume);
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (wavesurfer.current) {
      const newMuted = !isMuted;
      setIsMuted(newMuted);
      wavesurfer.current.setVolume(newMuted ? 0 : volume);
    }
  }, [isMuted, volume]);

  const skip = useCallback((seconds) => {
    if (wavesurfer.current && isReady) {
      const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
      wavesurfer.current.seekTo(newTime / duration);
    }
  }, [isReady, duration, currentTime]);

  const seekTo = useCallback((time) => {
    if (wavesurfer.current && isReady && duration > 0) {
      wavesurfer.current.seekTo(time / duration);
    }
  }, [isReady, duration]);

  const handlePlaybackRateChange = useCallback(() => {
    const rates = [1, 1.25, 1.5, 1.75, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % rates.length;
    const newRate = rates[nextIndex];
    setPlaybackRate(newRate);
    if (wavesurfer.current) {
      wavesurfer.current.setPlaybackRate(newRate);
    }
  }, [playbackRate]);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  // Handle ESC key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Add bookmark at current time
  const addBookmark = useCallback(() => {
    const newBookmark = {
      id: Date.now(),
      time: currentTime,
      label: `${t('bookmark')} ${bookmarks.length + 1}`
    };
    setBookmarks(prev => [...prev, newBookmark].sort((a, b) => a.time - b.time));
    addNotification(t('bookmarkAdded'), 'success');
  }, [currentTime, bookmarks.length, t, addNotification]);

  // Remove bookmark
  const removeBookmark = useCallback((id) => {
    setBookmarks(prev => prev.filter(b => b.id !== id));
  }, []);

  // Toggle listened status
  const toggleListened = useCallback(() => {
    const newStatus = !isListened;
    setIsListened(newStatus);
    onListened?.(newStatus);
    addNotification(
      newStatus ? t('markedAsListened') : t('unmarkedAsListened'),
      'success'
    );
  }, [isListened, onListened, t, addNotification]);

  // Export script as Markdown
  const exportScriptMarkdown = useCallback(() => {
    if (!script) return;

    let markdown = `# ${title}\n\n`;
    markdown += `---\n\n`;
    markdown += `**${t('duration')}:** ${formatLongTime(duration)}\n\n`;
    if (scriptStats) {
      markdown += `**${t('wordCount')}:** ${scriptStats.wordCount.toLocaleString()}\n\n`;
    }
    markdown += `---\n\n`;
    markdown += `## ${t('script')}\n\n`;
    markdown += script;

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `podcast-${title.replace(/\s+/g, '-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);

    addNotification(t('scriptExported'), 'success');
  }, [script, title, duration, scriptStats, formatLongTime, t, addNotification]);

  // Download audio
  const downloadAudio = useCallback(() => {
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = `podcast-${title.replace(/\s+/g, '-').toLowerCase()}.mp3`;
    a.click();
    addNotification(t('downloadStarted'), 'success');
  }, [audioUrl, title, addNotification, t]);

  return (
    <div
      ref={containerRef}
      className={`${styles.podcastPlayer} ${isFullscreen ? styles.fullscreen : ''}`}
    >
      {/* Fullscreen close button */}
      {isFullscreen && (
        <button className={styles.closeFullscreen} onClick={toggleFullscreen}>
          <FontAwesomeIcon icon={faTimes} />
        </button>
      )}

      {/* Header with metadata */}
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <FontAwesomeIcon icon={faHeadphones} className={styles.podcastIcon} />
          <h4 className={styles.title}>{title}</h4>
          {isListened && (
            <span className={styles.listenedBadge}>
              <FontAwesomeIcon icon={faCheckCircle} /> {t('listened')}
            </span>
          )}
        </div>
        <div className={styles.metadata}>
          <span className={styles.metaItem}>
            <FontAwesomeIcon icon={faClock} />
            {formatLongTime(duration)}
          </span>
          {scriptStats && (
            <span className={styles.metaItem}>
              <FontAwesomeIcon icon={faFileAlt} />
              {scriptStats.wordCount.toLocaleString()} {t('words')}
            </span>
          )}
          {bookmarks.length > 0 && (
            <span className={styles.metaItem}>
              <FontAwesomeIcon icon={faBookmark} />
              {bookmarks.length} {t('bookmarks')}
            </span>
          )}
        </div>
      </div>

      {/* Progress indicator */}
      {listenedPercentage > 0 && listenedPercentage < 100 && (
        <div className={styles.listenProgress}>
          <div className={styles.listenProgressBar}>
            <div
              className={styles.listenProgressFill}
              style={{ width: `${listenedPercentage}%` }}
            />
          </div>
          <span className={styles.listenProgressText}>
            {listenedPercentage}% {t('listened').toLowerCase()}
          </span>
        </div>
      )}

      {/* Waveform */}
      <div ref={waveformRef} className={styles.waveform} />

      {/* Time display */}
      <div className={styles.timeDisplay}>
        <span>{formatTime(currentTime)}</span>
        <span className={styles.timeSeparator}>/</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Main controls */}
      <div className={styles.controls}>
        <div className={styles.mainControls}>
          <button
            onClick={() => skip(-10)}
            className={styles.skipButton}
            title={t('skip10sBack')}
            disabled={!isReady}
          >
            <FontAwesomeIcon icon={faBackward} />
            <span className={styles.skipLabel}>10</span>
          </button>

          <button
            onClick={togglePlay}
            className={styles.playButton}
            disabled={!isReady}
          >
            <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} />
          </button>

          <button
            onClick={() => skip(10)}
            className={styles.skipButton}
            title={t('skip10sForward')}
            disabled={!isReady}
          >
            <FontAwesomeIcon icon={faForward} />
            <span className={styles.skipLabel}>10</span>
          </button>
        </div>

        {/* Secondary controls */}
        <div className={styles.secondaryControls}>
          <button
            onClick={handlePlaybackRateChange}
            className={styles.rateButton}
            title={t('playbackSpeed')}
          >
            {playbackRate}x
          </button>

          <div className={styles.volumeControl}>
            <button
              onClick={toggleMute}
              className={styles.volumeButton}
              title={isMuted ? t('unmute') : t('mute')}
            >
              <FontAwesomeIcon icon={isMuted || volume === 0 ? faVolumeMute : faVolumeUp} />
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className={styles.volumeSlider}
            />
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className={styles.actionBar}>
        <button
          onClick={addBookmark}
          className={styles.actionButton}
          title={t('addBookmark')}
          disabled={!isReady}
        >
          <FontAwesomeIcon icon={faBookmark} />
          <span>{t('bookmark')}</span>
        </button>

        <button
          onClick={toggleListened}
          className={`${styles.actionButton} ${isListened ? styles.active : ''}`}
          title={isListened ? t('markAsNotListened') : t('markAsListened')}
        >
          <FontAwesomeIcon icon={isListened ? faCheckCircle : faCheck} />
          <span>{isListened ? t('listened') : t('markAsListened')}</span>
        </button>

        {script && (
          <button
            onClick={() => setShowScript(!showScript)}
            className={`${styles.actionButton} ${showScript ? styles.active : ''}`}
            title={t('showScript')}
          >
            <FontAwesomeIcon icon={faFileAlt} />
            <span>{t('script')}</span>
          </button>
        )}

        {bookmarks.length > 0 && (
          <button
            onClick={() => setShowBookmarks(!showBookmarks)}
            className={`${styles.actionButton} ${showBookmarks ? styles.active : ''}`}
            title={t('showBookmarks')}
          >
            <FontAwesomeIcon icon={faListUl} />
            <span>{t('bookmarks')}</span>
          </button>
        )}

        <button
          onClick={toggleFullscreen}
          className={styles.actionButton}
          title={isFullscreen ? t('exitFullscreen') : t('fullscreen')}
        >
          <FontAwesomeIcon icon={isFullscreen ? faCompress : faExpand} />
          <span>{isFullscreen ? t('exitFullscreen') : t('fullscreen')}</span>
        </button>
      </div>

      {/* Export buttons */}
      <div className={styles.exportBar}>
        <button onClick={downloadAudio} className={styles.exportButton}>
          <FontAwesomeIcon icon={faDownload} />
          {t('downloadAudio')}
        </button>
        {script && (
          <button onClick={exportScriptMarkdown} className={styles.exportButton}>
            <FontAwesomeIcon icon={faFileAlt} />
            {t('exportScript')}
          </button>
        )}
      </div>

      {/* Bookmarks panel */}
      {showBookmarks && bookmarks.length > 0 && (
        <div className={styles.bookmarksPanel}>
          <h5>{t('bookmarks')}</h5>
          <ul className={styles.bookmarksList}>
            {bookmarks.map((bookmark) => (
              <li key={bookmark.id} className={styles.bookmarkItem}>
                <button
                  className={styles.bookmarkTime}
                  onClick={() => seekTo(bookmark.time)}
                >
                  <FontAwesomeIcon icon={faBookmark} />
                  {formatTime(bookmark.time)}
                </button>
                <span className={styles.bookmarkLabel}>{bookmark.label}</span>
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

      {/* Script panel */}
      {showScript && script && (
        <div className={styles.scriptPanel}>
          <div className={styles.scriptHeader}>
            <h5>
              <FontAwesomeIcon icon={faMicrophone} /> {t('podcastScript')}
            </h5>
            <button onClick={exportScriptMarkdown} className={styles.scriptExportBtn}>
              <FontAwesomeIcon icon={faDownload} /> {t('export')}
            </button>
          </div>
          <div className={styles.scriptContent}>
            {script.split('\n').map((line, idx) => (
              <p key={idx}>{line || '\u00A0'}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PodcastPlayer;
