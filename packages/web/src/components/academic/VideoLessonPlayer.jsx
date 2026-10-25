// frontend/src/components/academic/VideoLessonPlayer.js

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlay,
  faPause,
  faVolumeUp,
  faVolumeMute,
  faVolumeDown,
  faBackward,
  faForward,
  faExpand,
  faCompress,
  faDownload,
  faClosedCaptioning,
  faBookmark,
  faCheck,
  faCheckCircle,
  faClock,
  faVideo,
  faListUl,
  faTimes,
  faTrash,
  faGraduationCap,
  faCog,
  faStepBackward,
  faStepForward
} from '@fortawesome/free-solid-svg-icons';
import styles from './VideoLessonPlayer.module.css';
import { useNotification } from '../../contexts/NotificationContext';

const VideoLessonPlayer = ({
  videoUrl,
  title = 'Video Lesson',
  srtUrl = null,
  thumbnailUrl = null,
  chapters = [],
  onWatched = null
}) => {
  const { t } = useTranslation();
  const { addNotification } = useNotification();

  // Video element ref
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const progressBarRef = useRef(null);

  // Player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showCaptions, setShowCaptions] = useState(false);
  const [buffered, setBuffered] = useState(0);

  // Enhanced features state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isWatched, setIsWatched] = useState(false);
  const [bookmarks, setBookmarks] = useState([]);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [watchedPercentage, setWatchedPercentage] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isHoveringProgress, setIsHoveringProgress] = useState(false);
  const [previewTime, setPreviewTime] = useState(null);
  const [showChapters, setShowChapters] = useState(false);

  // Refs
  const maxWatchedTime = useRef(0);
  const controlsTimeout = useRef(null);

  // Playback rate options
  const playbackRates = useMemo(() => [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2], []);

  const formatTime = useCallback((seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setIsReady(true);
      setDuration(video.duration);
    };

    const handleTimeUpdate = () => {
      const time = video.currentTime;
      setCurrentTime(time);

      // Track max watched time for progress
      if (time > maxWatchedTime.current) {
        maxWatchedTime.current = time;
        if (video.duration > 0) {
          const percent = Math.round((maxWatchedTime.current / video.duration) * 100);
          setWatchedPercentage(percent);

          // Auto-mark as watched if > 90% played
          if (percent >= 90 && !isWatched) {
            setIsWatched(true);
            onWatched?.(true);
          }
        }
      }
    };

    const handleProgress = () => {
      if (video.buffered.length > 0) {
        const bufferedEnd = video.buffered.end(video.buffered.length - 1);
        const bufferedPercent = (bufferedEnd / video.duration) * 100;
        setBuffered(bufferedPercent);
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setIsWatched(true);
      onWatched?.(true);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('progress', handleProgress);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('progress', handleProgress);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [isWatched, onWatched]);

  // Controls visibility timeout
  useEffect(() => {
    const handleMouseMove = () => {
      setShowControls(true);
      clearTimeout(controlsTimeout.current);
      controlsTimeout.current = setTimeout(() => {
        if (isPlaying) {
          setShowControls(false);
        }
      }, 3000);
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('mousemove', handleMouseMove);
    }

    return () => {
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove);
      }
      clearTimeout(controlsTimeout.current);
    };
  }, [isPlaying]);

  // Fullscreen handling
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!containerRef.current?.contains(document.activeElement) &&
          document.activeElement.tagName !== 'INPUT') {
        return;
      }

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skip(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          skip(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          adjustVolume(0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          adjustVolume(-0.1);
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'Escape':
          if (isFullscreen) {
            document.exitFullscreen();
          }
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, isPlaying, volume]);

  const togglePlay = useCallback(() => {
    if (videoRef.current && isReady) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  }, [isReady, isPlaying]);

  const adjustVolume = useCallback((delta) => {
    const newVolume = Math.max(0, Math.min(1, volume + delta));
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
    }
  }, [volume]);

  const handleVolumeChange = useCallback((e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
    }
  }, []);

  const toggleMute = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    if (videoRef.current) {
      videoRef.current.muted = newMuted;
    }
  }, [isMuted]);

  const skip = useCallback((seconds) => {
    if (videoRef.current && isReady) {
      videoRef.current.currentTime = Math.max(0, Math.min(duration, currentTime + seconds));
    }
  }, [isReady, duration, currentTime]);

  const seekTo = useCallback((time) => {
    if (videoRef.current && isReady) {
      videoRef.current.currentTime = time;
    }
  }, [isReady]);

  const handleProgressClick = useCallback((e) => {
    if (!progressBarRef.current || !isReady) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const time = percentage * duration;
    seekTo(time);
  }, [isReady, duration, seekTo]);

  const handleProgressHover = useCallback((e) => {
    if (!progressBarRef.current || !isReady) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    setPreviewTime(percentage * duration);
  }, [isReady, duration]);

  const handlePlaybackRateChange = useCallback((rate) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
    setShowSettings(false);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await containerRef.current?.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  }, []);

  const toggleCaptions = useCallback(() => {
    if (videoRef.current && videoRef.current.textTracks.length > 0) {
      const track = videoRef.current.textTracks[0];
      track.mode = track.mode === 'showing' ? 'hidden' : 'showing';
      setShowCaptions(track.mode === 'showing');
    }
  }, []);

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

  // Toggle watched status
  const toggleWatched = useCallback(() => {
    const newStatus = !isWatched;
    setIsWatched(newStatus);
    onWatched?.(newStatus);
    addNotification(
      newStatus ? t('markedAsWatched') : t('unmarkedAsWatched'),
      'success'
    );
  }, [isWatched, onWatched, t, addNotification]);

  // Download video
  const downloadVideo = useCallback(() => {
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = `video-${title.replace(/\s+/g, '-').toLowerCase()}.mp4`;
    a.click();
    addNotification(t('downloadStarted'), 'success');
  }, [videoUrl, title, addNotification, t]);

  // Download subtitles
  const downloadSubtitles = useCallback(() => {
    if (srtUrl) {
      const a = document.createElement('a');
      a.href = srtUrl;
      a.download = `subtitles-${title.replace(/\s+/g, '-').toLowerCase()}.srt`;
      a.click();
      addNotification(t('downloadStarted'), 'success');
    }
  }, [srtUrl, title, addNotification, t]);

  // Get volume icon based on level
  const getVolumeIcon = useCallback(() => {
    if (isMuted || volume === 0) return faVolumeMute;
    if (volume < 0.5) return faVolumeDown;
    return faVolumeUp;
  }, [isMuted, volume]);

  // Get current chapter
  const currentChapter = useMemo(() => {
    if (!chapters.length) return null;
    return chapters.find((ch, idx) => {
      const nextChapter = chapters[idx + 1];
      return currentTime >= ch.time && (!nextChapter || currentTime < nextChapter.time);
    });
  }, [chapters, currentTime]);

  return (
    <div
      ref={containerRef}
      className={`${styles.videoPlayer} ${isFullscreen ? styles.fullscreen : ''}`}
      tabIndex={0}
    >
      {/* Video element */}
      <div className={styles.videoWrapper} onClick={togglePlay}>
        <video
          ref={videoRef}
          src={videoUrl}
          poster={thumbnailUrl}
          className={styles.video}
          playsInline
        >
          {srtUrl && (
            <track
              kind="subtitles"
              src={srtUrl}
              srcLang="pt"
              label="Português"
              default={showCaptions}
            />
          )}
        </video>

        {/* Play overlay for initial state */}
        {!isPlaying && isReady && (
          <div className={styles.playOverlay}>
            <button className={styles.playOverlayButton} onClick={togglePlay}>
              <FontAwesomeIcon icon={faPlay} />
            </button>
          </div>
        )}

        {/* Loading indicator */}
        {!isReady && (
          <div className={styles.loadingOverlay}>
            <div className={styles.spinner} />
          </div>
        )}
      </div>

      {/* Controls overlay */}
      <div className={`${styles.controlsOverlay} ${showControls ? styles.visible : ''}`}>
        {/* Header */}
        <div className={styles.controlsHeader}>
          <div className={styles.titleSection}>
            <FontAwesomeIcon icon={faGraduationCap} className={styles.videoIcon} />
            <h4 className={styles.title}>{title}</h4>
            {isWatched && (
              <span className={styles.watchedBadge}>
                <FontAwesomeIcon icon={faCheckCircle} /> {t('watched')}
              </span>
            )}
          </div>
          {currentChapter && (
            <span className={styles.currentChapter}>
              {currentChapter.title}
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className={styles.progressContainer}>
          {watchedPercentage > 0 && watchedPercentage < 100 && (
            <div className={styles.watchedProgress}>
              <span>{watchedPercentage}% {t('watched').toLowerCase()}</span>
            </div>
          )}

          <div
            ref={progressBarRef}
            className={styles.progressBar}
            onClick={handleProgressClick}
            onMouseMove={handleProgressHover}
            onMouseEnter={() => setIsHoveringProgress(true)}
            onMouseLeave={() => {
              setIsHoveringProgress(false);
              setPreviewTime(null);
            }}
          >
            {/* Buffered progress */}
            <div className={styles.buffered} style={{ width: `${buffered}%` }} />

            {/* Watched progress (max time) */}
            <div
              className={styles.watchedBar}
              style={{ width: `${(maxWatchedTime.current / duration) * 100}%` }}
            />

            {/* Current progress */}
            <div
              className={styles.progress}
              style={{ width: `${(currentTime / duration) * 100}%` }}
            >
              <div className={styles.progressHandle} />
            </div>

            {/* Chapter markers */}
            {chapters.map((chapter, idx) => (
              <div
                key={idx}
                className={styles.chapterMarker}
                style={{ left: `${(chapter.time / duration) * 100}%` }}
                title={chapter.title}
              />
            ))}

            {/* Bookmark markers */}
            {bookmarks.map((bookmark) => (
              <div
                key={bookmark.id}
                className={styles.bookmarkMarker}
                style={{ left: `${(bookmark.time / duration) * 100}%` }}
                title={bookmark.label}
                onClick={(e) => {
                  e.stopPropagation();
                  seekTo(bookmark.time);
                }}
              />
            ))}

            {/* Time preview tooltip */}
            {isHoveringProgress && previewTime !== null && (
              <div
                className={styles.timePreview}
                style={{ left: `${(previewTime / duration) * 100}%` }}
              >
                {formatTime(previewTime)}
              </div>
            )}
          </div>

          {/* Time display */}
          <div className={styles.timeDisplay}>
            <span>{formatTime(currentTime)}</span>
            <span className={styles.timeSeparator}>/</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Main controls */}
        <div className={styles.controlsMain}>
          <div className={styles.controlsLeft}>
            <button onClick={togglePlay} className={styles.controlButton} disabled={!isReady}>
              <FontAwesomeIcon icon={isPlaying ? faPause : faPlay} />
            </button>

            <button onClick={() => skip(-10)} className={styles.controlButton} disabled={!isReady}>
              <FontAwesomeIcon icon={faBackward} />
              <span className={styles.skipLabel}>10</span>
            </button>

            <button onClick={() => skip(10)} className={styles.controlButton} disabled={!isReady}>
              <FontAwesomeIcon icon={faForward} />
              <span className={styles.skipLabel}>10</span>
            </button>

            <div className={styles.volumeControl}>
              <button onClick={toggleMute} className={styles.controlButton}>
                <FontAwesomeIcon icon={getVolumeIcon()} />
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className={styles.volumeSlider}
              />
            </div>
          </div>

          <div className={styles.controlsRight}>
            {/* Playback rate */}
            <div className={styles.settingsDropdown}>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={styles.controlButton}
              >
                <span className={styles.rateLabel}>{playbackRate}x</span>
              </button>
              {showSettings && (
                <div className={styles.settingsMenu}>
                  <h5>{t('playbackSpeed')}</h5>
                  {playbackRates.map((rate) => (
                    <button
                      key={rate}
                      onClick={() => handlePlaybackRateChange(rate)}
                      className={`${styles.settingsItem} ${playbackRate === rate ? styles.active : ''}`}
                    >
                      {rate}x
                      {playbackRate === rate && <FontAwesomeIcon icon={faCheck} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Captions toggle */}
            {srtUrl && (
              <button
                onClick={toggleCaptions}
                className={`${styles.controlButton} ${showCaptions ? styles.active : ''}`}
                title={t('captions')}
              >
                <FontAwesomeIcon icon={faClosedCaptioning} />
              </button>
            )}

            {/* Chapters */}
            {chapters.length > 0 && (
              <div className={styles.chaptersDropdown}>
                <button
                  onClick={() => setShowChapters(!showChapters)}
                  className={`${styles.controlButton} ${showChapters ? styles.active : ''}`}
                  title={t('chapters')}
                >
                  <FontAwesomeIcon icon={faListUl} />
                </button>
                {showChapters && (
                  <div className={styles.chaptersMenu}>
                    <h5>{t('chapters')}</h5>
                    {chapters.map((chapter, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          seekTo(chapter.time);
                          setShowChapters(false);
                        }}
                        className={`${styles.chapterItem} ${currentChapter === chapter ? styles.active : ''}`}
                      >
                        <span className={styles.chapterTime}>{formatTime(chapter.time)}</span>
                        <span className={styles.chapterTitle}>{chapter.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className={styles.controlButton}
              title={isFullscreen ? t('exitFullscreen') : t('fullscreen')}
            >
              <FontAwesomeIcon icon={isFullscreen ? faCompress : faExpand} />
            </button>
          </div>
        </div>
      </div>

      {/* Action bar - outside video */}
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
          onClick={toggleWatched}
          className={`${styles.actionButton} ${isWatched ? styles.active : ''}`}
          title={isWatched ? t('markAsNotWatched') : t('markAsWatched')}
        >
          <FontAwesomeIcon icon={isWatched ? faCheckCircle : faCheck} />
          <span>{isWatched ? t('watched') : t('markAsWatched')}</span>
        </button>

        {bookmarks.length > 0 && (
          <button
            onClick={() => setShowBookmarks(!showBookmarks)}
            className={`${styles.actionButton} ${showBookmarks ? styles.active : ''}`}
            title={t('showBookmarks')}
          >
            <FontAwesomeIcon icon={faListUl} />
            <span>{t('bookmarks')} ({bookmarks.length})</span>
          </button>
        )}

        <div className={styles.actionSpacer} />

        <button onClick={downloadVideo} className={styles.actionButton}>
          <FontAwesomeIcon icon={faDownload} />
          <span>{t('downloadVideo')}</span>
        </button>

        {srtUrl && (
          <button onClick={downloadSubtitles} className={styles.actionButton}>
            <FontAwesomeIcon icon={faClosedCaptioning} />
            <span>{t('downloadSubtitles')}</span>
          </button>
        )}
      </div>

      {/* Bookmarks panel */}
      {showBookmarks && bookmarks.length > 0 && (
        <div className={styles.bookmarksPanel}>
          <div className={styles.panelHeader}>
            <h5>
              <FontAwesomeIcon icon={faBookmark} /> {t('bookmarks')}
            </h5>
            <button onClick={() => setShowBookmarks(false)} className={styles.panelClose}>
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>
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

      {/* Metadata footer */}
      <div className={styles.metadataFooter}>
        <div className={styles.metadata}>
          <span className={styles.metaItem}>
            <FontAwesomeIcon icon={faClock} />
            {formatTime(duration)}
          </span>
          {bookmarks.length > 0 && (
            <span className={styles.metaItem}>
              <FontAwesomeIcon icon={faBookmark} />
              {bookmarks.length} {t('bookmarks')}
            </span>
          )}
          {chapters.length > 0 && (
            <span className={styles.metaItem}>
              <FontAwesomeIcon icon={faListUl} />
              {chapters.length} {t('chapters')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoLessonPlayer;
