// frontend/src/components/academic/AudioWaveformPlayer.js

import React, { useEffect, useRef, useState, useCallback } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faPause, faVolumeUp, faVolumeMute, faBackward, faForward } from '@fortawesome/free-solid-svg-icons';
import styles from './AudioWaveformPlayer.module.css';

const AudioWaveformPlayer = ({ audioUrl, onReady, onDurationChange }) => {
  const waveformRef = useRef(null);
  const wavesurfer = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  const formatTime = useCallback((seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  useEffect(() => {
    if (!waveformRef.current || !audioUrl) return;

    // Destroy previous instance if exists
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
      onReady?.(dur);
      onDurationChange?.(dur);
      wavesurfer.current.setVolume(volume);
    });

    wavesurfer.current.on('audioprocess', () => {
      setCurrentTime(wavesurfer.current.getCurrentTime());
    });

    wavesurfer.current.on('seeking', () => {
      setCurrentTime(wavesurfer.current.getCurrentTime());
    });

    wavesurfer.current.on('play', () => setIsPlaying(true));
    wavesurfer.current.on('pause', () => setIsPlaying(false));
    wavesurfer.current.on('finish', () => setIsPlaying(false));

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

  return (
    <div className={styles.waveformPlayer}>
      <div ref={waveformRef} className={styles.waveform} />

      <div className={styles.timeDisplay}>
        <span>{formatTime(currentTime)}</span>
        <span className={styles.timeSeparator}>/</span>
        <span>{formatTime(duration)}</span>
      </div>

      <div className={styles.controls}>
        <div className={styles.mainControls}>
          <button
            onClick={() => skip(-10)}
            className={styles.skipButton}
            title="Voltar 10s"
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
            title="Avançar 10s"
            disabled={!isReady}
          >
            <FontAwesomeIcon icon={faForward} />
            <span className={styles.skipLabel}>10</span>
          </button>
        </div>

        <div className={styles.secondaryControls}>
          <button
            onClick={handlePlaybackRateChange}
            className={styles.rateButton}
            title="Velocidade de reprodução"
          >
            {playbackRate}x
          </button>

          <div className={styles.volumeControl}>
            <button
              onClick={toggleMute}
              className={styles.volumeButton}
              title={isMuted ? 'Ativar som' : 'Silenciar'}
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
    </div>
  );
};

export default AudioWaveformPlayer;
