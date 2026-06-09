import React, { useState } from 'react';

export interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  defaultOpen = true,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="sidebar-section">
      <button
        type="button"
        className="sidebar-section-header sidebar-section-toggle"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className={`section-arrow${isOpen ? ' open' : ''}`}>▸</span>
        <span>{title}</span>
      </button>
      {isOpen && <div className="sidebar-section-content">{children}</div>}
    </div>
  );
};

export default CollapsibleSection;
