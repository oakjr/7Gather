import React, { useEffect, useState, useRef, useCallback } from 'react';
import { CALL_TIMEOUT_MS, MAX_VISIBLE_CALLS } from '../../../shared/constants';

/** Information about an incoming call notification. */
export interface CallInfo {
  callerId: string;
  callerName: string;
  timestamp: number;
  callerLeft: boolean;
}

export interface CallNotificationProps {
  calls: CallInfo[];
  onGo: (callerId: string) => void;
  onDismiss: (callerId: string) => void;
}

/** Formats elapsed time since a timestamp as "Xm Ys atrás". */
export function formatElapsed(timestamp: number, now: number): string {
  const elapsedMs = Math.max(0, now - timestamp);
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s atrás`;
  }
  return `${seconds}s atrás`;
}

/**
 * CallNotification displays toast notifications for incoming calls.
 * Shows max 3 notifications (FIFO, discards oldest).
 * Each notification auto-dismisses after CALL_TIMEOUT_MS (60s).
 *
 * Validates: Requirements 3.4, 3.5, 3.6, 3.8, 3.9
 */
export const CallNotification: React.FC<CallNotificationProps> = ({
  calls,
  onGo,
  onDismiss,
}) => {
  const [now, setNow] = useState<number>(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dismissTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Update elapsed time every 1s
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Auto-dismiss after CALL_TIMEOUT_MS
  useEffect(() => {
    for (const call of calls) {
      if (!dismissTimersRef.current.has(call.callerId)) {
        const elapsed = Date.now() - call.timestamp;
        const remaining = CALL_TIMEOUT_MS - elapsed;

        if (remaining <= 0) {
          // Already expired, dismiss immediately
          onDismiss(call.callerId);
        } else {
          const timer = setTimeout(() => {
            dismissTimersRef.current.delete(call.callerId);
            onDismiss(call.callerId);
          }, remaining);
          dismissTimersRef.current.set(call.callerId, timer);
        }
      }
    }

    // Clean up timers for calls no longer in the list
    const currentCallerIds = new Set(calls.map((c) => c.callerId));
    for (const [callerId, timer] of dismissTimersRef.current.entries()) {
      if (!currentCallerIds.has(callerId)) {
        clearTimeout(timer);
        dismissTimersRef.current.delete(callerId);
      }
    }
  }, [calls, onDismiss]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of dismissTimersRef.current.values()) {
        clearTimeout(timer);
      }
      dismissTimersRef.current.clear();
    };
  }, []);

  const handleGo = useCallback(
    (callerId: string) => {
      onGo(callerId);
      onDismiss(callerId);
    },
    [onGo, onDismiss]
  );

  // Show max MAX_VISIBLE_CALLS notifications (most recent), FIFO discard oldest
  const visibleCalls = calls.length > MAX_VISIBLE_CALLS
    ? calls.slice(calls.length - MAX_VISIBLE_CALLS)
    : calls;

  if (visibleCalls.length === 0) {
    return null;
  }

  return (
    <div
      className="call-notification-container"
      role="region"
      aria-label="Notificações de chamada"
      aria-live="polite"
    >
      {visibleCalls.map((call) => (
        <div
          key={call.callerId}
          className="call-notification-toast"
          role="alert"
          data-caller-id={call.callerId}
        >
          <div className="call-notification-content">
            <span className="call-notification-name">
              {call.callerName}
            </span>
            <span className="call-notification-time" aria-label="Tempo decorrido">
              {formatElapsed(call.timestamp, now)}
            </span>
            {call.callerLeft && (
              <span
                className="call-notification-left"
                role="status"
              >
                Chamador saiu da sala
              </span>
            )}
          </div>
          <div className="call-notification-actions">
            <button
              type="button"
              className="call-notification-go-btn"
              onClick={() => handleGo(call.callerId)}
              disabled={call.callerLeft}
              aria-label={`Ir até ${call.callerName}`}
              title="Ir"
            >
              🚀 Ir
            </button>
            <button
              type="button"
              className="call-notification-dismiss-btn"
              onClick={() => onDismiss(call.callerId)}
              aria-label={`Dispensar chamada de ${call.callerName}`}
              title="Dispensar"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CallNotification;
