import React, { useState, useEffect } from 'react';

export interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  forceState?: boolean | null; // null = use internal state, true = force open, false = force closed
  children: React.ReactNode;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  defaultOpen = true,
  forceState = null,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Sync with forceState whenever it changes (not null)
  useEffect(() => {
    if (forceState !== null) {
      setIsOpen(forceState);
    }
  }, [forceState]);

  return (
    <div className="sidebar-section">
      <button
        type="button"
        className="sidebar-section-header sidebar-section-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className={`section-arrow${isOpen ? ' open' : ''}`}>🚀</span>
        <span>{title}</span>
      </button>
      {isOpen && <div className="sidebar-section-content">{children}</div>}
    </div>
  );
};

export default CollapsibleSection;
