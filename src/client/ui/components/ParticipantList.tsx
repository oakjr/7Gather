import React, { useCallback } from 'react';

/** Information about a participant in the room. */
export interface ParticipantInfo {
  sessionId: string;
  displayName: string;
  avatarId: number;
  /** Empty string if in general area, zone ID if in a private zone. */
  currentZone: string;
}

export interface ParticipantListProps {
  participants: ParticipantInfo[];
  onLocate: (sessionId: string) => void;
  onFollow: (sessionId: string) => void;
}

/** Returns an emoji representing the avatar category based on ID. */
function getAvatarEmoji(avatarId: number): string {
  if (avatarId >= 1 && avatarId <= 5) return '🤖';
  if (avatarId >= 6 && avatarId <= 10) return '🛸';
  if (avatarId >= 11 && avatarId <= 15) return '🚀';
  return '👾';
}

/** Returns a category label for screen readers. */
function getAvatarCategory(avatarId: number): string {
  if (avatarId >= 1 && avatarId <= 5) return 'Robot';
  if (avatarId >= 6 && avatarId <= 10) return 'Drone';
  if (avatarId >= 11 && avatarId <= 15) return 'Space Soldier';
  return 'Alien';
}

/**
 * ParticipantList displays all participants in the current room.
 * Each entry shows the participant's avatar, name, private zone indicator,
 * and action buttons for "Localizar" (locate) and "Seguir" (follow).
 *
 * Validates: Requirements 5.1, 5.2
 */
export const ParticipantList: React.FC<ParticipantListProps> = ({
  participants,
  onLocate,
  onFollow,
}) => {
  const handleLocate = useCallback(
    (sessionId: string) => {
      onLocate(sessionId);
    },
    [onLocate]
  );

  const handleFollow = useCallback(
    (sessionId: string) => {
      onFollow(sessionId);
    },
    [onFollow]
  );

  return (
    <div
      className="participant-list"
      role="region"
      aria-labelledby="participant-list-title"
    >
      <h2 id="participant-list-title">Participantes</h2>

      {participants.length === 0 && (
        <p className="participant-list-empty" role="status">
          Nenhum participante na sala.
        </p>
      )}

      <ul className="participant-list-items" aria-label="Lista de participantes">
        {participants.map((participant) => (
          <li
            key={participant.sessionId}
            className="participant-item"
            data-session-id={participant.sessionId}
          >
            <span
              className="participant-avatar"
              aria-label={`Avatar: ${getAvatarCategory(participant.avatarId)}`}
              aria-hidden="false"
            >
              <img src={`/sprites/avatar_${participant.avatarId}.png`} alt="" style={{ width: '20px', height: '20px', imageRendering: 'pixelated' }} />
            </span>

            <span className="participant-name">{participant.displayName}</span>

            {participant.currentZone !== '' && (
              <span
                className="participant-zone-indicator"
                aria-label="Em zona privada"
                title="Em zona privada"
              >
                🔒
              </span>
            )}

            <div className="participant-actions">
              <button
                type="button"
                className="participant-locate-btn"
                onClick={() => handleLocate(participant.sessionId)}
                aria-label={`Localizar ${participant.displayName}`}
                title="Localizar"
              >
                🛰️
              </button>

              <button
                type="button"
                className="participant-follow-btn"
                onClick={() => handleFollow(participant.sessionId)}
                aria-label={`Seguir ${participant.displayName}`}
                title="Seguir"
              >
                🚀
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ParticipantList;
