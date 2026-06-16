import React, { useCallback } from 'react';

/** Permission state from the browser Permissions API. */
export type MediaPermissionState = 'granted' | 'denied' | 'prompt';

export interface MediaControlsProps {
  /** Whether the user's microphone is currently muted. */
  isMuted: boolean;
  /** Whether the user's camera is currently on. */
  isVideoOn: boolean;
  /** Whether the user is currently sharing their screen. */
  isScreenSharing: boolean;
  /** Callback to toggle mute/unmute. */
  onToggleMute: () => void;
  /** Callback to toggle video on/off. */
  onToggleVideo: () => void;
  /** Callback to toggle screen sharing on/off. */
  onToggleScreenShare: () => void;
  /** Browser permission state for microphone. Defaults to 'prompt'. */
  micPermission?: MediaPermissionState;
  /** Browser permission state for camera. Defaults to 'prompt'. */
  cameraPermission?: MediaPermissionState;
}

/**
 * MediaControls provides mute, video, and screen-share toggle buttons.
 * Buttons reflect the current media state and browser permission status.
 *
 * - Mute/unmute: active by default, disabled if mic permission is denied.
 * - Video on/off: off by default, disabled if camera permission is denied.
 * - Screen share on/off: off by default, always available (browser handles permission via dialog).
 *
 * Requirements: 2.4, 3.1, 3.2, 3.5, 3.6, 3.7
 */
export const MediaControls: React.FC<MediaControlsProps> = ({
  isMuted,
  isVideoOn,
  isScreenSharing,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  micPermission = 'prompt',
  cameraPermission = 'prompt',
}) => {
  const isMicDenied = micPermission === 'denied';
  const isCameraDenied = cameraPermission === 'denied';

  const handleToggleMute = useCallback(() => {
    if (!isMicDenied) {
      onToggleMute();
    }
  }, [isMicDenied, onToggleMute]);

  const handleToggleVideo = useCallback(() => {
    if (!isCameraDenied) {
      onToggleVideo();
    }
  }, [isCameraDenied, onToggleVideo]);

  const handleToggleScreenShare = useCallback(() => {
    onToggleScreenShare();
  }, [onToggleScreenShare]);

  return (
    <div
      className="media-controls"
      role="toolbar"
      aria-label="Controles de mídia"
    >
      {/* Mute/Unmute Button */}
      <button
        type="button"
        className={`media-btn media-btn--mic${isMicDenied ? ' media-btn--disabled' : isMuted ? ' media-btn--off' : ' media-btn--on'}`}
        onClick={handleToggleMute}
        disabled={isMicDenied}
        aria-pressed={!isMuted}
        aria-label={
          isMicDenied
            ? 'Microfone indisponível — permissão negada'
            : isMuted
              ? 'Ativar microfone'
              : 'Desativar microfone'
        }
        title={
          isMicDenied
            ? 'Permissão de microfone negada'
            : isMuted
              ? 'Ativar microfone'
              : 'Desativar microfone'
        }
      >
        <span className="media-btn__icon" aria-hidden="true">
          {isMicDenied ? '🚫' : isMuted ? '🔇' : '🎤'}
        </span>
        <span className="media-btn__label">
          {isMicDenied ? 'Mic indisponível' : isMuted ? 'Mic off' : 'Mic on'}
        </span>
      </button>

      {/* Video On/Off Button */}
      <button
        type="button"
        className={`media-btn media-btn--video${isCameraDenied ? ' media-btn--disabled' : isVideoOn ? ' media-btn--on' : ' media-btn--off'}`}
        onClick={handleToggleVideo}
        disabled={isCameraDenied}
        aria-pressed={isVideoOn}
        aria-label={
          isCameraDenied
            ? 'Câmera indisponível — permissão negada'
            : isVideoOn
              ? 'Desativar câmera'
              : 'Ativar câmera'
        }
        title={
          isCameraDenied
            ? 'Permissão de câmera negada'
            : isVideoOn
              ? 'Desativar câmera'
              : 'Ativar câmera'
        }
      >
        <span className="media-btn__icon" aria-hidden="true">
          {isCameraDenied ? '🚫' : isVideoOn ? '📹' : '📷'}
        </span>
        <span className="media-btn__label">
          {isCameraDenied ? 'Câmera indisponível' : isVideoOn ? 'Vídeo on' : 'Vídeo off'}
        </span>
      </button>

      {/* Screen Share On/Off Button */}
      <button
        type="button"
        className={`media-btn media-btn--screen${isScreenSharing ? ' media-btn--on' : ' media-btn--off'}`}
        onClick={handleToggleScreenShare}
        aria-pressed={isScreenSharing}
        aria-label={isScreenSharing ? 'Parar compartilhamento de tela' : 'Compartilhar tela'}
        title={isScreenSharing ? 'Parar compartilhamento' : 'Compartilhar tela'}
      >
        <span className="media-btn__icon" aria-hidden="true">
          {isScreenSharing ? '🖥️' : '💻'}
        </span>
        <span className="media-btn__label">
          {isScreenSharing ? 'Tela on' : 'Tela off'}
        </span>
      </button>
    </div>
  );
};

export default MediaControls;
