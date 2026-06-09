import React, { useCallback } from 'react';

export interface PadlockIconProps {
  /** Whether the room is currently locked. */
  isLocked: boolean;
  /** Callback triggered when the padlock is clicked to toggle lock state. */
  onToggle: () => void;
  /** Whether the user has a home room defined. Component does not render without one. */
  hasHomeRoom?: boolean;
}

/** Color displayed when the room is locked. */
const LOCKED_COLOR = '#FF4444';
/** Color displayed when the room is unlocked. */
const UNLOCKED_COLOR = '#888888';

/**
 * SVG path for a locked padlock icon.
 * Shackle is closed (connected arc at top).
 */
const LockedSvg: React.FC<{ color: string }> = ({ color }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect x="4" y="11" width="16" height="11" rx="2" fill={color} />
    <path
      d="M8 11V7a4 4 0 1 1 8 0v4"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <circle cx="12" cy="16" r="1.5" fill="#fff" />
  </svg>
);

/**
 * SVG path for an unlocked padlock icon.
 * Shackle is open (arc separated from body).
 */
const UnlockedSvg: React.FC<{ color: string }> = ({ color }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect x="4" y="11" width="16" height="11" rx="2" fill={color} />
    <path
      d="M8 11V7a4 4 0 0 1 8 0"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <circle cx="12" cy="16" r="1.5" fill="#fff" />
  </svg>
);

/**
 * PadlockIcon displays a lock/unlock SVG icon next to the home room name.
 * Red (#FF4444) when locked, grey (#888888) when unlocked.
 * Clicking triggers onToggle which should send lock_room/unlock_room
 * message to the server via ColyseusClient within 500ms.
 *
 * Only renders when the user has a home room defined.
 *
 * Validates: Requirements 14.1, 14.2, 14.3, 14.4
 */
export const PadlockIcon: React.FC<PadlockIconProps> = ({
  isLocked,
  onToggle,
  hasHomeRoom = false,
}) => {
  const handleClick = useCallback(() => {
    onToggle();
  }, [onToggle]);

  if (!hasHomeRoom) {
    return null;
  }

  const color = isLocked ? LOCKED_COLOR : UNLOCKED_COLOR;
  const label = isLocked ? 'Desbloquear sala' : 'Bloquear sala';

  return (
    <button
      type="button"
      className="padlock-icon"
      onClick={handleClick}
      aria-label={label}
      aria-pressed={isLocked}
      title={label}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '4px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {isLocked ? <LockedSvg color={color} /> : <UnlockedSvg color={color} />}
    </button>
  );
};

export default PadlockIcon;
