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

    it('calls onToggle synchronously on click (within single event loop tick)', () => {
      let callTimestamp = 0;
      const onToggle = vi.fn(() => {
        callTimestamp = performance.now();
      });
      renderPadlock({ onToggle });

      const before = performance.now();
      const button = screen.getByRole('button');
      fireEvent.click(button);
      const after = performance.now();

      expect(onToggle).toHaveBeenCalledTimes(1);
      // Verify the toggle was called synchronously (no setTimeout/async delay)
      expect(callTimestamp).toBeGreaterThanOrEqual(before);
      expect(callTimestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('single render cycle SVG toggle (Requirements 7.3, 7.4)', () => {
    it('switches from unlocked to locked SVG in a single re-render', () => {
      const { rerender } = render(
        <PadlockIcon isLocked={false} onToggle={vi.fn()} hasHomeRoom={true} />
      );

      // Verify unlocked state
      let button = screen.getByRole('button');
      let svg = button.querySelector('svg');
      let rect = svg?.querySelector('rect');
      expect(rect?.getAttribute('fill')).toBe('#888888');

      // Re-render with locked prop (simulating single render cycle)
      rerender(
        <PadlockIcon isLocked={true} onToggle={vi.fn()} hasHomeRoom={true} />
      );

      // Verify locked state immediately after re-render
      button = screen.getByRole('button');
      svg = button.querySelector('svg');
      rect = svg?.querySelector('rect');
      expect(rect?.getAttribute('fill')).toBe('#FF4444');
    });

    it('switches from locked to unlocked SVG in a single re-render', () => {
      const { rerender } = render(
        <PadlockIcon isLocked={true} onToggle={vi.fn()} hasHomeRoom={true} />
      );

      // Verify locked state
      let button = screen.getByRole('button');
      let rect = button.querySelector('svg rect');
      expect(rect?.getAttribute('fill')).toBe('#FF4444');

      // Re-render with unlocked prop
      rerender(
        <PadlockIcon isLocked={false} onToggle={vi.fn()} hasHomeRoom={true} />
      );

      // Verify unlocked state immediately
      button = screen.getByRole('button');
      rect = button.querySelector('svg rect');
      expect(rect?.getAttribute('fill')).toBe('#888888');
    });

    it('renders locked SVG with closed shackle path (d contains "v4")', () => {
      renderPadlock({ isLocked: true });
      const button = screen.getByRole('button');
      const path = button.querySelector('svg path');
      // Locked shackle ends with "v4" (closed connection to body)
      expect(path?.getAttribute('d')).toContain('v4');
    });

    it('renders unlocked SVG with open shackle path (no "v4")', () => {
      renderPadlock({ isLocked: false });
      const button = screen.getByRole('button');
      const path = button.querySelector('svg path');
      // Unlocked shackle does not end with "v4" (open, not connected to body)
      expect(path?.getAttribute('d')).not.toContain('v4');
    });
  });
});
