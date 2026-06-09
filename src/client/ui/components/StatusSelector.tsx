import React, { useState, useCallback } from 'react';

export type UserStatus = 'available' | 'busy' | 'dnd';

export interface StatusSelectorProps {
  initialStatus?: UserStatus;
  onStatusChange?: (status: UserStatus) => void;
}

const STATUS_OPTIONS: { value: UserStatus; label: string; icon: string; color: string }[] = [
  { value: 'available', label: 'Disponível', icon: '🟢', color: '#4cdf8b' },
  { value: 'busy', label: 'Ocupado', icon: '🟡', color: '#ffb347' },
  { value: 'dnd', label: 'Não Perturbe', icon: '🔴', color: '#ff6b6b' },
];

/**
 * StatusSelector allows the user to set their availability status.
 */
export const StatusSelector: React.FC<StatusSelectorProps> = ({
  initialStatus = 'available',
  onStatusChange,
}) => {
  const [status, setStatus] = useState<UserStatus>(initialStatus);

  const handleChange = useCallback((newStatus: UserStatus) => {
    setStatus(newStatus);
    localStorage.setItem('user_status', newStatus);
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
