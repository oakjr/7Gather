import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  SCREEN_SHARE_THUMBNAIL_WIDTH,
  SCREEN_SHARE_THUMBNAIL_HEIGHT,
} from '../../../shared/constants';

export interface ScreenShareOverlayProps {
  /** The remote screen share MediaStream, or null if not sharing. */
  stream: MediaStream | null;
  /** Display name of the participant sharing their screen. */
  sharerName: string;
  /** Callback invoked when the overlay should be fully closed/dismissed. */
  onClose: () => void;
}

export type OverlayState = 'full' | 'minimized' | 'hidden';

/**
 * ScreenShareOverlay displays a remote screen share stream as a full overlay
 * that can be minimized to a thumbnail in the bottom-right corner.
 *
 * States:
 * - full: overlay covers the game viewport with a minimize button
 * - minimized: thumbnail (120×80px) pinned bottom-right, pointer-events: none on container
 * - hidden: component renders nothing (stream is null or sharing stopped)
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */
export const ScreenShareOverlay: React.FC<ScreenShareOverlayProps> = ({
  stream,
  sharerName,
  onClose,
}) => {
  const [state, setState] = useState<OverlayState>(stream ? 'full' : 'hidden');
  const videoRef = useRef<HTMLVideoElement>(null);

  // When stream becomes null, transition to hidden
  useEffect(() => {
    if (!stream) {
      setState('hidden');
    } else if (state === 'hidden') {
      setState('full');
    }
  }, [stream]); // eslint-disable-line react-hooks/exhaustive-deps

  // Attach stream to video element
  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) {
      video.srcObject = stream;
    }
    return () => {
      if (video) {
        video.srcObject = null;
      }
    };
  }, [stream, state]);

  // Handle Escape key to minimize from full state
  useEffect(() => {
    if (state !== 'full') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setState('minimized');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state]);

  const handleMinimize = useCallback(() => {
    setState('minimized');
  }, []);

  const handleExpand = useCallback(() => {
    setState('full');
  }, []);

  if (state === 'hidden') {
    return null;
  }

  if (state === 'minimized') {
    return (
      <div
        className="screen-share-overlay screen-share-overlay--minimized"
        style={{ pointerEvents: 'none' }}
        data-testid="screen-share-overlay"
        data-state="minimized"
      >
        <button
          type="button"
          className="screen-share-overlay__thumbnail"
          onClick={handleExpand}
          style={{
            pointerEvents: 'auto',
            maxWidth: `${SCREEN_SHARE_THUMBNAIL_WIDTH}px`,
            maxHeight: `${SCREEN_SHARE_THUMBNAIL_HEIGHT}px`,
          }}
          aria-label={`Expandir compartilhamento de ${sharerName}`}
          data-testid="screen-share-thumbnail"
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
        </button>
      </div>
    );
  }

  // state === 'full'
  return (
    <div
      className="screen-share-overlay screen-share-overlay--full"
      data-testid="screen-share-overlay"
      data-state="full"
    >
      <div className="screen-share-overlay__header">
        <span className="screen-share-overlay__sharer-name">
          {sharerName} está compartilhando a tela
        </span>
        <button
          type="button"
          className="screen-share-overlay__minimize-btn"
          onClick={handleMinimize}
          aria-label="Minimizar compartilhamento"
          style={{
            minWidth: '32px',
            minHeight: '32px',
          }}
          data-testid="screen-share-minimize-btn"
        >
          ⊟
        </button>
      </div>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="screen-share-overlay__video"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
      />
    </div>
  );
};

export default ScreenShareOverlay;
