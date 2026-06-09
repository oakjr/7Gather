import React, { useState, useCallback } from 'react';
import { MAX_AVATARS } from '@shared/constants';
import { setAvatarId, getAvatarId } from '../avatarStorage';

export interface SettingsMenuProps {
  /** Current display name */
  currentName: string;
  /** Current avatar ID */
  currentAvatarId: number;
}

const AVATAR_NAMES: Record<number, string> = {
  1: 'Astronauta', 2: 'Comandante', 3: 'Piloto', 4: 'Engenheiro', 5: 'Cientista', 6: 'Médico',
  7: 'Alien Verde', 8: 'Alien Roxo', 9: 'Alien Azul', 10: 'Robô', 11: 'Andróide', 12: 'Cyborg',
  13: 'Nave', 14: 'UFO', 15: 'Satélite', 16: 'Estrela', 17: 'Planeta', 18: 'Cometa',
};

/**
 * SettingsMenu is a dropdown/modal that lets the player change their
 * display name and avatar without leaving the room.
 */
export const SettingsMenu: React.FC<SettingsMenuProps> = ({ currentName, currentAvatarId }) => {
  const [isOpen, setIsOpen] = useState(true);
  const [name, setName] = useState(currentName);
  const [selectedAvatar, setSelectedAvatar] = useState(currentAvatarId);

  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const handleSave = useCallback(() => {
    const trimmedName = name.trim();
    if (trimmedName.length < 2) return;

    localStorage.setItem('display_name', trimmedName);
    setAvatarId(selectedAvatar);

    // Reload page to apply changes (re-enters room with new name/avatar)
    window.location.reload();
  }, [name, selectedAvatar]);

  const hasChanges = name.trim() !== currentName || selectedAvatar !== currentAvatarId;
  const isValid = name.trim().length >= 2;

  return (
    <div className="settings-menu" style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={handleToggle}
        className="settings-toggle-btn"
        aria-label="Configurações"
        aria-expanded={isOpen}
        style={{
          background: '#2a2a3e',
          border: '2px solid #555',
          borderRadius: '8px',
          padding: '8px 12px',
          color: '#fff',
          cursor: 'pointer',
          fontSize: '1.2rem',
        }}
      >
        ⚙️
      </button>

      {isOpen && (
        <div
          className="settings-panel"
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '8px',
            background: '#1e1e2e',
            border: '2px solid #444',
            borderRadius: '12px',
            padding: '16px',
            minWidth: '280px',
            zIndex: 100,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          <h3 style={{ margin: '0 0 12px', color: '#fff', fontSize: '14px' }}>Configurações</h3>

          {/* Name field */}
          <label htmlFor="settings-name" style={{ display: 'block', color: '#aaa', fontSize: '12px', marginBottom: '4px' }}>
            Nome:
          </label>
          <input
            id="settings-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #555',
              background: '#2a2a3e',
              color: '#fff',
              fontSize: '14px',
              marginBottom: '12px',
              boxSizing: 'border-box',
            }}
          />

          {/* Avatar grid */}
          <label style={{ display: 'block', color: '#aaa', fontSize: '12px', marginBottom: '4px' }}>
            Avatar:
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px', marginBottom: '12px' }}>
            {Array.from({ length: MAX_AVATARS }, (_, i) => i + 1).map(id => (
              <button
                key={id}
                type="button"
                onClick={() => setSelectedAvatar(id)}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '6px',
                  border: selectedAvatar === id ? '2px solid #4fc3f7' : '1px solid #555',
                  background: selectedAvatar === id ? '#3a3a5e' : '#2a2a3e',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
                aria-label={AVATAR_NAMES[id] || `Avatar ${id}`}
                aria-pressed={selectedAvatar === id}
                title={AVATAR_NAMES[id] || `Avatar ${id}`}
              >
                <img src={`/sprites/avatar_${id}.png`} alt={AVATAR_NAMES[id]} style={{ width: '28px', height: '28px', imageRendering: 'pixelated' }} />
              </button>
            ))}
          </div>

          {/* Save button */}
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || !isValid}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '6px',
              border: 'none',
              background: hasChanges && isValid ? '#4fc3f7' : '#555',
              color: hasChanges && isValid ? '#000' : '#888',
              fontWeight: 'bold',
              cursor: hasChanges && isValid ? 'pointer' : 'not-allowed',
              fontSize: '13px',
            }}
          >
            {hasChanges ? 'Salvar e Reentrar' : 'Sem alterações'}
          </button>
        </div>
      )}
    </div>
  );
};

export default SettingsMenu;
