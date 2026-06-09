import React, { useState, useEffect, useCallback } from 'react';
import { RoomEntryFlow, RoomEntryState, RoomEntryError, RoomEntryConfig } from '../../RoomEntryFlow';
import { AvatarSelector } from './AvatarSelector';
import { ConnectionStatus } from './ConnectionStatus';

export interface RoomEntryAppProps {
  flow: RoomEntryFlow;
  config: RoomEntryConfig;
  /**
   * Called when the flow reaches 'ready' state.
   * The parent should create/start the GameScene at this point.
   */
  onReady: (avatarId: number, config: RoomEntryConfig) => void;
}

/**
 * RoomEntryApp is the top-level React component that manages the room entry UI.
 * It renders the appropriate view based on the current flow state:
 * - Avatar selection screen when no avatar is stored
 * - Loading/connecting indicators during connection phases
 * - Error messages for failures (room full, not found, etc.)
 * - Game canvas container when ready
 *
 * Validates: Requirements 2.1, 3.6, 8.3, 9.3
 */
export const RoomEntryApp: React.FC<RoomEntryAppProps> = ({ flow, config, onReady }) => {
  const [flowState, setFlowState] = useState<RoomEntryState>(flow.getState());
  const [error, setError] = useState<RoomEntryError | null>(flow.getError());

  useEffect(() => {
    const unsubscribe = flow.onStateChange((state, err) => {
      setFlowState(state);
      setError(err ?? null);

      if (state === 'ready') {
        const avatarId = flow.getAvatarId();
        const flowConfig = flow.getConfig();
        if (avatarId !== null && flowConfig) {
          onReady(avatarId, flowConfig);
        }
      }
    });

    return unsubscribe;
  }, [flow, onReady]);

  // Start the flow on mount
  useEffect(() => {
    flow.start(config);
  }, [flow, config]);

  const handleAvatarSelected = useCallback(
    (avatarId: number, displayName: string) => {
      // Update the config display name before proceeding
      if (config) {
        config.displayName = displayName;
      }
      flow.onAvatarSelected(avatarId);
    },
    [flow, config]
  );

  const handleRetry = useCallback(() => {
    flow.start(config);
  }, [flow, config]);

  // Render based on current flow state
  if (flowState === 'avatar_selection') {
    return (
      <div className="room-entry room-entry--avatar-selection">
        <AvatarSelector onSelect={handleAvatarSelected} />
      </div>
    );
  }

  if (flowState === 'error' && error) {
    return (
      <div className="room-entry room-entry--error" role="alert">
        <ErrorView error={error} onRetry={handleRetry} />
      </div>
    );
  }

  if (
    flowState === 'connecting_colyseus' ||
    flowState === 'fetching_livekit_token' ||
    flowState === 'connecting_media' ||
    flowState === 'loading_map'
  ) {
    return (
      <div className="room-entry room-entry--loading">
        <LoadingView state={flowState} />
      </div>
    );
  }

  if (flowState === 'ready') {
    // Game canvas and overlay are rendered separately — hide the entry UI
    return null;
  }

  // idle state - nothing to show yet
  return null;
};

// === Sub-components ===

interface LoadingViewProps {
  state: RoomEntryState;
}

const LOADING_MESSAGES: Record<string, string> = {
  connecting_colyseus: 'Conectando ao servidor...',
  fetching_livekit_token: 'Obtendo token de mídia...',
  connecting_media: 'Conectando áudio e vídeo...',
  loading_map: 'Carregando mapa...',
};

const LoadingView: React.FC<LoadingViewProps> = ({ state }) => {
  const message = LOADING_MESSAGES[state] ?? 'Carregando...';

  return (
    <div className="loading-view" aria-live="polite" aria-busy="true">
      <div className="loading-spinner" aria-hidden="true" />
      <p className="loading-message">{message}</p>
    </div>
  );
};

interface ErrorViewProps {
  error: RoomEntryError;
  onRetry: () => void;
}

const ERROR_MESSAGES: Record<RoomEntryError['code'], string> = {
  room_full: 'A sala está cheia. Tente novamente mais tarde.',
  room_not_found: 'Sala não encontrada. Verifique o link e tente novamente.',
  connection_failed: 'Falha ao conectar ao servidor. Verifique sua conexão.',
  media_failed: 'Falha ao conectar mídia. Verifique permissões do navegador.',
  unknown: 'Ocorreu um erro inesperado.',
};

const ErrorView: React.FC<ErrorViewProps> = ({ error, onRetry }) => {
  const displayMessage = ERROR_MESSAGES[error.code] ?? error.message;
  const canRetry = error.code !== 'room_full' && error.code !== 'room_not_found';

  return (
    <div className="error-view" role="alert">
      <h2 className="error-title">Não foi possível entrar na sala</h2>
      <p className="error-message">{displayMessage}</p>
      {canRetry && (
        <button
          type="button"
          className="error-retry-btn"
          onClick={onRetry}
          aria-label="Tentar novamente"
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
};

export default RoomEntryApp;
