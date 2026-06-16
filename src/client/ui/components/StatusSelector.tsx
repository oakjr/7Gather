import React, { useState, useCallback, useEffect } from 'react';
import { UserStatus } from '../../../shared/types';

export type { UserStatus };

const VALID_STATUSES: UserStatus[] = ['available', 'busy', 'dnd'];

const STORAGE_KEY = 'user_status';

export interface StatusSelectorProps {
  /** If provided, overrides localStorage for the initial status */
  currentStatus?: UserStatus;
  /** @deprecated Use currentStatus instead */
  initialStatus?: UserStatus;
  /** Called when the user changes status (sends set_status to Colyseus) */
  onStatusChange?: (status: UserStatus) => void;
}

const STATUS_OPTIONS: { value: UserStatus; label: string; icon: string; color: string }[] = [
  { value: 'available', label: 'Disponível', icon: '🟢', color: '#4cdf8b' },
  { value: 'busy', label: 'Ocupado', icon: '🟡', color: '#ffb347' },
  { value: 'dnd', label: 'Não Perturbe', icon: '🔴', color: '#ff6b6b' },
];

/**
 * Reads and validates the persisted user status from localStorage.
 * Returns the valid status or defaults to 'available' (persisting the default).
 */
function getPersistedStatus(): UserStatus {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && VALID_STATUSES.includes(stored as UserStatus)) {
      return stored as UserStatus;
    }
  } catch {
    // localStorage unavailable — fall through to default
  }
  // Persist the default
  try {
    localStorage.setItem(STORAGE_KEY, 'available');
  } catch {
    // silently ignore write failures
  }
  return 'available';
}

/**
 * StatusSelector allows the user to set their availability status.
 * Reads persisted status from localStorage on mount, validates and defaults to 'available'.
 * Persists changes to localStorage and notifies the parent via onStatusChange.
 */
export const StatusSelector: React.FC<StatusSelectorProps> = ({
  currentStatus,
  initialStatus,
  onStatusChange,
}) => {
  const [status, setStatus] = useState<UserStatus>(() => {
    return currentStatus ?? initialStatus ?? getPersistedStatus();
  });

  // On mount, notify the parent of the initial (possibly defaulted) status
  useEffect(() => {
    if (!currentStatus && !initialStatus) {
      const persisted = getPersistedStatus();
      if (persisted !== status) {
        setStatus(persisted);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = useCallback((newStatus: UserStatus) => {
    setStatus(newStatus);
    // Persist to localStorage, silently catching write failures
    try {
      localStorage.setItem(STORAGE_KEY, newStatus);
    } catch {
      // silently ignore — requirement 4.5
    }
    onStatusChange?.(newStatus);
  }, [onStatusChange]);

  return (
    <div className="status-selector" role="radiogroup" aria-label="Selecionar status">
      {STATUS_OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={status === opt.value}
          className={`status-option${status === opt.value ? ' active' : ''}`}
          onClick={() => handleChange(opt.value)}
          style={{
            borderColor: status === opt.value ? opt.color : undefined,
          }}
        >
          <span className="status-icon">{opt.icon}</span>
          <span className="status-label">{opt.label}</span>
        </button>
      ))}
    </div>
  );
};

export default StatusSelector;
