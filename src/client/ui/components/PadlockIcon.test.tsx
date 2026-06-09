import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PadlockIcon, PadlockIconProps } from './PadlockIcon';

function renderPadlock(overrides: Partial<PadlockIconProps> = {}) {
  const defaultProps: PadlockIconProps = {
    isLocked: false,
    onToggle: vi.fn(),
    hasHomeRoom: true,
    ...overrides,
  };
  return { ...render(<PadlockIcon {...defaultProps} />), props: defaultProps };
}

describe('PadlockIcon', () => {
  describe('rendering based on hasHomeRoom', () => {
    it('renders nothing when hasHomeRoom is false', () => {
      const { container } = renderPadlock({ hasHomeRoom: false });
      expect(container.innerHTML).toBe('');
    });

    it('renders nothing when hasHomeRoom is undefined (defaults to false)', () => {
      const { container } = render(
        <PadlockIcon isLocked={false} onToggle={vi.fn()} />
      );
      expect(container.innerHTML).toBe('');
    });

    it('renders the padlock button when hasHomeRoom is true', () => {
      renderPadlock({ hasHomeRoom: true });
      const button = screen.getByRole('button');
      expect(button).toBeDefined();
    });
  });

  describe('locked state rendering', () => {
    it('shows red color (#FF4444) when locked', () => {
      renderPadlock({ isLocked: true });
      const button = screen.getByRole('button');
      const svg = button.querySelector('svg');
      const rect = svg?.querySelector('rect');
      expect(rect?.getAttribute('fill')).toBe('#FF4444');
    });

    it('shows grey color (#888888) when unlocked', () => {
      renderPadlock({ isLocked: false });
      const button = screen.getByRole('button');
      const svg = button.querySelector('svg');
      const rect = svg?.querySelector('rect');
      expect(rect?.getAttribute('fill')).toBe('#888888');
    });

    it('has aria-label "Desbloquear sala" when locked', () => {
      renderPadlock({ isLocked: true });
      const button = screen.getByRole('button', { name: 'Desbloquear sala' });
      expect(button).toBeDefined();
    });

    it('has aria-label "Bloquear sala" when unlocked', () => {
      renderPadlock({ isLocked: false });
      const button = screen.getByRole('button', { name: 'Bloquear sala' });
      expect(button).toBeDefined();
    });

    it('sets aria-pressed to true when locked', () => {
      renderPadlock({ isLocked: true });
      const button = screen.getByRole('button');
      expect(button.getAttribute('aria-pressed')).toBe('true');
    });

    it('sets aria-pressed to false when unlocked', () => {
      renderPadlock({ isLocked: false });
      const button = screen.getByRole('button');
      expect(button.getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('interactions', () => {
    it('calls onToggle when clicked', () => {
      const onToggle = vi.fn();
      renderPadlock({ onToggle });

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(onToggle).toHaveBeenCalledTimes(1);
    });

    it('calls onToggle on each click', () => {
      const onToggle = vi.fn();
      renderPadlock({ onToggle });

      const button = screen.getByRole('button');
      fireEvent.click(button);
      fireEvent.click(button);

      expect(onToggle).toHaveBeenCalledTimes(2);
    });
  });
});
