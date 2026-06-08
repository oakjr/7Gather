import React, { useState, useCallback, useEffect, useRef } from 'react';
import { MAX_AVATARS } from '@shared/constants';
import { setAvatarId } from '../avatarStorage';

/** Avatar category metadata for display purposes. */
interface AvatarMeta {
  id: number;
  name: string;
  category: 'robots' | 'drones' | 'space-soldiers' | 'pixelated-aliens';
}

/** Maps avatar IDs to categories (5 per category). */
function getAvatarMeta(id: number): AvatarMeta {
  if (id >= 1 && id <= 5) {
    return { id, name: `Robot ${id}`, category: 'robots' };
  } else if (id >= 6 && id <= 10) {
    return { id, name: `Drone ${id - 5}`, category: 'drones' };
  } else if (id >= 11 && id <= 15) {
    return { id, name: `Space Soldier ${id - 10}`, category: 'space-soldiers' };
  } else {
    return { id, name: `Alien ${id - 15}`, category: 'pixelated-aliens' };
  }
}

const CATEGORY_LABELS: Record<AvatarMeta['category'], string> = {
  robots: 'Robôs',
  drones: 'Drones',
  'space-soldiers': 'Soldados Espaciais',
  'pixelated-aliens': 'Aliens Pixelados',
};

const ALL_AVATARS: AvatarMeta[] = Array.from({ length: MAX_AVATARS }, (_, i) =>
  getAvatarMeta(i + 1)
);

export interface AvatarSelectorProps {
  onSelect: (id: number, displayName: string) => void;
}

/**
 * AvatarSelector displays a name input and a grid of 20 avatar models.
 * On confirmation, saves avatar ID and display name to LocalStorage.
 */
export const AvatarSelector: React.FC<AvatarSelectorProps> = ({ onSelect }) => {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [displayName, setDisplayName] = useState(() => {
    return localStorage.getItem('display_name') || '';
  });
  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleSelect = useCallback((id: number) => {
    setSelectedId(id);
  }, []);

  const isFormValid = selectedId !== null && displayName.trim().length >= 2;

  const handleConfirm = useCallback(() => {
    if (!isFormValid) return;
    const trimmedName = displayName.trim();
    setAvatarId(selectedId!);
    localStorage.setItem('display_name', trimmedName);
    onSelect(selectedId!, trimmedName);
  }, [selectedId, displayName, isFormValid, onSelect]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, id: number) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleSelect(id);
      }
    },
    [handleSelect]
  );

  // Focus name input on mount
  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const categories = Object.keys(CATEGORY_LABELS) as AvatarMeta['category'][];

  return (
    <div
      className="avatar-selector"
      role="dialog"
      aria-labelledby="avatar-selector-title"
      aria-modal="true"
    >
      <h2 id="avatar-selector-title">Entrar na Sala</h2>

      <div className="avatar-name-input" style={{ marginBottom: '1.5rem' }}>
        <label htmlFor="display-name" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
          Seu nome:
        </label>
        <input
          ref={nameInputRef}
          id="display-name"
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && isFormValid) handleConfirm();
          }}
          placeholder="Digite seu nome..."
          maxLength={20}
          autoComplete="off"
          style={{
            width: '100%',
            maxWidth: '300px',
            padding: '0.75rem 1rem',
            fontSize: '1rem',
            borderRadius: '8px',
            border: '2px solid #444',
            background: '#2a2a3e',
            color: '#fff',
            outline: 'none',
          }}
          aria-required="true"
          aria-describedby="name-hint"
        />
        <small id="name-hint" style={{ display: 'block', marginTop: '0.25rem', color: '#888' }}>
          Mínimo 2 caracteres. Aparecerá acima do seu avatar.
        </small>
      </div>

      <p id="avatar-selector-description">
        Selecione um avatar para entrar na sala.
      </p>

      {categories.map((category) => {
        const avatars = ALL_AVATARS.filter((a) => a.category === category);
        return (
          <section key={category} aria-label={CATEGORY_LABELS[category]}>
            <h3>{CATEGORY_LABELS[category]}</h3>
            <div
              className="avatar-grid"
              role="radiogroup"
              aria-label={`Avatares: ${CATEGORY_LABELS[category]}`}
              aria-describedby="avatar-selector-description"
            >
              {avatars.map((avatar) => (
                <button
                  key={avatar.id}
                  type="button"
                  role="radio"
                  aria-checked={selectedId === avatar.id}
                  aria-label={avatar.name}
                  className={`avatar-option${selectedId === avatar.id ? ' selected' : ''}`}
                  onClick={() => handleSelect(avatar.id)}
                  onKeyDown={(e) => handleKeyDown(e, avatar.id)}
                  data-avatar-id={avatar.id}
                >
                  <span className="avatar-icon" aria-hidden="true">
                    {getCategoryEmoji(avatar.category)}
                  </span>
                  <span className="avatar-label">{avatar.name}</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}

      <button
        type="button"
        className="avatar-confirm-btn"
        onClick={handleConfirm}
        disabled={!isFormValid}
        aria-disabled={!isFormValid}
        aria-label={isFormValid ? `Entrar como ${displayName.trim()}` : 'Preencha nome e selecione avatar'}
      >
        {isFormValid ? `Entrar como ${displayName.trim()}` : 'Preencha nome e selecione avatar'}
      </button>
    </div>
  );
};

function getCategoryEmoji(category: AvatarMeta['category']): string {
  switch (category) {
    case 'robots':
      return '🤖';
    case 'drones':
      return '🛸';
    case 'space-soldiers':
      return '🚀';
    case 'pixelated-aliens':
      return '👾';
  }
}

export default AvatarSelector;
