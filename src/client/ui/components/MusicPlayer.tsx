import React, { useState, useCallback, useRef } from 'react';

/** Information about the currently playing music track. */
export interface MusicTrackInfo {
  source: string;
  startedBy: string;
  isPlaying: boolean;
}

export interface MusicPlayerProps {
  currentTrack: MusicTrackInfo | null;
  volume: number;
  /** Whether the local user has muted the music for themselves */
  isMusicMuted?: boolean;
  /** Whether music is paused */
  isPaused?: boolean;
  onVolumeChange: (vol: number) => void;
  onPlay: (source: string, displayName?: string) => void;
  onStop: () => void;
  /** Toggle local music mute */
  onToggleMusicMute?: () => void;
  /** Toggle pause/resume */
  onTogglePause?: () => void;
  /** Current playback time in seconds */
  currentTime?: number;
  /** Total duration in seconds */
  duration?: number;
  /** Callback to seek to a specific time */
  onSeek?: (time: number) => void;
}

/** Supported audio formats for shared music. */
const SUPPORTED_FORMATS = ['mp3', 'ogg', 'wav'];
const SUPPORTED_MIME_TYPES = ['audio/mpeg', 'audio/ogg', 'audio/wav'];

/** Formats seconds into MM:SS display. */
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Extracts a display name from a source URL or filename. */
function getTrackDisplayName(source: string): string {
  try {
    const url = new URL(source);
    const pathname = url.pathname;
    const filename = pathname.split('/').pop();
    return filename || source;
  } catch {
    // Not a URL, return as-is (likely a filename)
    return source;
  }
}

/** Validates that a source string has a supported audio format. */
function isValidAudioSource(source: string): boolean {
  const trimmed = source.trim().toLowerCase();
  if (!trimmed) return false;
  return SUPPORTED_FORMATS.some(
    (fmt) => trimmed.endsWith(`.${fmt}`)
  );
}

/** Validates that a file has a supported MIME type. */
function isValidAudioFile(file: File): boolean {
  return SUPPORTED_MIME_TYPES.includes(file.type);
}

/**
 * MusicPlayer provides shared music controls for the room.
 * - Input for audio URL or file upload (MP3, OGG, WAV)
 * - Visual indicator: track name + who started it
 * - Individual volume slider (0-100%, default 50%)
 * - Play/stop button (anyone can adjust volume, only initiator or admin can stop)
 */
export const MusicPlayer: React.FC<MusicPlayerProps> = ({
  currentTrack,
  volume,
  isMusicMuted = false,
  isPaused = false,
  onVolumeChange,
  onPlay,
  onStop,
  onToggleMusicMute,
  onTogglePause,
  currentTime = 0,
  duration = 0,
  onSeek,
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUrlSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const trimmed = urlInput.trim();
      if (!trimmed) {
        setError('Insira uma URL de áudio válida.');
        return;
      }

      if (!isValidAudioSource(trimmed)) {
        setError('Formato não suportado. Use MP3, OGG ou WAV.');
        return;
      }

      onPlay(trimmed);
      setUrlInput('');
    },
    [urlInput, onPlay]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setError(null);
      const file = e.target.files?.[0];
      if (!file) return;

      if (!isValidAudioFile(file)) {
        setError('Formato não suportado. Use MP3, OGG ou WAV.');
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }

      // Create a blob URL so the audio element can load the local file
      const blobUrl = URL.createObjectURL(file);
      onPlay(blobUrl, file.name);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [onPlay]
  );

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVolume = Number(e.target.value);
      onVolumeChange(newVolume);
    },
    [onVolumeChange]
  );

  const handleStop = useCallback(() => {
    onStop();
  }, [onStop]);

  return (
    <section
      className="music-player"
      aria-label="Player de música compartilhada"
    >
      <h3 id="music-player-title">Música Compartilhada</h3>

      {currentTrack && currentTrack.isPlaying ? (
        <div className="music-player-active" aria-live="polite">
          <div className="music-player-info">
            <span className="music-player-track-name" aria-label="Música em reprodução">
              🎵 {getTrackDisplayName(currentTrack.source)}
            </span>
            <span className="music-player-started-by" aria-label="Iniciado por">
              por {currentTrack.startedBy}
            </span>
          </div>

          {/* Progress bar */}
          {duration > 0 && (
            <div className="music-progress">
              <span className="music-progress-time">{formatTime(currentTime)}</span>
              <input
                type="range"
                className="music-progress-bar"
                min={0}
                max={duration || 1}
                value={currentTime}
                onChange={(e) => onSeek?.(Number(e.target.value))}
                aria-label="Progresso da música"
              />
              <span className="music-progress-time">{formatTime(duration)}</span>
            </div>
          )}

          <div className="music-player-controls">
            <label htmlFor="music-volume-slider" className="music-volume-label">
              Volume: {volume}%
            </label>
            <input
              id="music-volume-slider"
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={handleVolumeChange}
              aria-label={`Volume da música: ${volume}%`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={volume}
            />
          </div>

          <div className="music-player-actions">
            <button
              type="button"
              className="music-action-btn"
              onClick={onTogglePause}
              aria-label={isPaused ? 'Retomar música' : 'Pausar música'}
            >
              {isPaused ? '▶ Play' : '⏸ Pausar'}
            </button>
            <button
              type="button"
              className="music-action-btn music-action-btn--danger"
              onClick={handleStop}
              aria-label="Parar música"
            >
              ⏹ Parar
            </button>
            {onToggleMusicMute && (
              <button
                type="button"
                className={`music-action-btn${isMusicMuted ? ' music-action-btn--danger' : ''}`}
                onClick={onToggleMusicMute}
                aria-label={isMusicMuted ? 'Reativar música' : 'Silenciar música para mim'}
                aria-pressed={isMusicMuted}
              >
                {isMusicMuted ? '🔊 Unmute' : '🔇 Mute'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="music-player-input">
          <form onSubmit={handleUrlSubmit} aria-label="Iniciar música por URL">
            <label htmlFor="music-url-input" className="music-url-label">
              URL de áudio
            </label>
            <div className="music-url-row">
              <input
                id="music-url-input"
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://exemplo.com/musica.mp3"
                aria-describedby={error ? 'music-error' : undefined}
              />
              <button
                type="submit"
                className="music-play-btn"
                aria-label="Tocar música"
              >
                ▶ Tocar
              </button>
            </div>
          </form>

          <div className="music-file-upload">
            <label htmlFor="music-file-input" className="music-file-label">
              Ou envie um arquivo (MP3, OGG, WAV)
            </label>
            <input
              id="music-file-input"
              ref={fileInputRef}
              type="file"
              accept=".mp3,.ogg,.wav,audio/mpeg,audio/ogg,audio/wav"
              onChange={handleFileChange}
              aria-describedby={error ? 'music-error' : undefined}
            />
          </div>

          {error && (
            <p id="music-error" className="music-error" role="alert" aria-live="assertive">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
};

export default MusicPlayer;
