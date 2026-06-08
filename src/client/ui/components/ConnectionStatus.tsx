import React from 'react';

export type ConnectionState = 'connected' | 'reconnecting' | 'disconnected';

export interface ConnectionStatusProps {
  state: ConnectionState;
  /** Optional error message for audio/video issues */
  errorMessage?: string | null;
}

/** Visual configuration for each connection state */
const STATE_CONFIG: Record<
  ConnectionState,
  { label: string; icon: string; className: string; ariaLive: 'polite' | 'assertive' }
> = {
  connected: {
    label: 'Conectado',
    icon: '🟢',
    className: 'connection-status--connected',
    ariaLive: 'polite',
  },
  reconnecting: {
    label: 'Reconectando...',
    icon: '🟡',
    className: 'connection-status--reconnecting',
    ariaLive: 'assertive',
  },
  disconnected: {
    label: 'Desconectado',
    icon: '🔴',
    className: 'connection-status--disconnected',
    ariaLive: 'assertive',
  },
};

/**
 * ConnectionStatus displays the current connection state with a visual indicator
 * and optional error message for audio/video failures.
 *
 * Validates: Requirements 1.5, 2.6
 */
export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ state, errorMessage }) => {
  const config = STATE_CONFIG[state];

  return (
    <div
      className={`connection-status ${config.className}`}
      role="status"
      aria-live={config.ariaLive}
      aria-atomic="true"
    >
      <span className="connection-status__icon" aria-hidden="true">
        {config.icon}
      </span>
      <span className="connection-status__label">{config.label}</span>
      {errorMessage && (
        <span className="connection-status__error" role="alert" aria-live="assertive">
          {errorMessage}
        </span>
      )}
    </div>
  );
};

export interface RoomFullMessageProps {
  roomName: string;
}

/**
 * RoomFullMessage displays a notification when a room has reached its participant limit.
 *
 * Validates: Requirement 11.4
 */
export const RoomFullMessage: React.FC<RoomFullMessageProps> = ({ roomName }) => {
  return (
    <div
      className="room-full-message"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <span className="room-full-message__icon" aria-hidden="true">
        ⚠️
      </span>
      <span className="room-full-message__text">
        A sala <strong>{roomName}</strong> está cheia. Não é possível entrar no momento.
      </span>
    </div>
  );
};

export default ConnectionStatus;
