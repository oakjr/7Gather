import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ScreenShareOverlay, ScreenShareOverlayProps } from './ScreenShareOverlay';
import { SCREEN_SHARE_THUMBNAIL_WIDTH, SCREEN_SHARE_THUMBNAIL_HEIGHT } from '../../../shared/constants';

/** Create a mock MediaStream for testing. */
function createMockStream(): MediaStream {
  return {
    id: 'mock-stream-id',
    active: true,
    getTracks: () => [],
    getAudioTracks: () => [],
    getVideoTracks: () => [],
    addTrack: vi.fn(),
    removeTrack: vi.fn(),
    clone: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onaddtrack: null,
    onremovetrack: null,
  } as unknown as MediaStream;
}

function renderOverlay(overrides: Partial<ScreenShareOverlayProps> = {}) {
  const defaultProps: ScreenShareOverlayProps = {
    stream: createMockStream(),
    sharerName: 'João',
    onClose: vi.fn(),
    ...overrides,
  };
  return { ...render(<ScreenShareOverlay {...defaultProps} />), props: defaultProps };
}

describe('ScreenShareOverlay', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('renders in full state when stream is provided', () => {
      renderOverlay();

      const overlay = screen.getByTestId('screen-share-overlay');
      expect(overlay.getAttribute('data-state')).toBe('full');
    });

    it('renders nothing (hidden) when stream is null', () => {
      renderOverlay({ stream: null });

      expect(screen.queryByTestId('screen-share-overlay')).toBeNull();
    });

    it('displays sharer name in full state', () => {
      renderOverlay({ sharerName: 'Maria' });

      expect(screen.getByText('Maria está compartilhando a tela')).toBeDefined();
    });

    it('displays minimize button in full state', () => {
      renderOverlay();

      const btn = screen.getByTestId('screen-share-minimize-btn');
      expect(btn).toBeDefined();
      expect(btn.getAttribute('aria-label')).toBe('Minimizar compartilhamento');
    });

    it('minimize button has minimum 32x32 touch target', () => {
      renderOverlay();

      const btn = screen.getByTestId('screen-share-minimize-btn');
      expect(btn.style.minWidth).toBe('32px');
      expect(btn.style.minHeight).toBe('32px');
    });
  });

  describe('minimize button click', () => {
    it('transitions to minimized state when minimize button is clicked', () => {
      renderOverlay();

      const btn = screen.getByTestId('screen-share-minimize-btn');
      fireEvent.click(btn);

      const overlay = screen.getByTestId('screen-share-overlay');
      expect(overlay.getAttribute('data-state')).toBe('minimized');
    });

    it('shows thumbnail in minimized state', () => {
      renderOverlay();

      const btn = screen.getByTestId('screen-share-minimize-btn');
      fireEvent.click(btn);

      const thumbnail = screen.getByTestId('screen-share-thumbnail');
      expect(thumbnail).toBeDefined();
    });

    it('thumbnail has correct max dimensions', () => {
      renderOverlay();

      const btn = screen.getByTestId('screen-share-minimize-btn');
      fireEvent.click(btn);

      const thumbnail = screen.getByTestId('screen-share-thumbnail');
      expect(thumbnail.style.maxWidth).toBe(`${SCREEN_SHARE_THUMBNAIL_WIDTH}px`);
      expect(thumbnail.style.maxHeight).toBe(`${SCREEN_SHARE_THUMBNAIL_HEIGHT}px`);
    });

    it('container has pointer-events: none when minimized', () => {
      renderOverlay();

      const btn = screen.getByTestId('screen-share-minimize-btn');
      fireEvent.click(btn);

      const overlay = screen.getByTestId('screen-share-overlay');
      expect(overlay.style.pointerEvents).toBe('none');
    });

    it('thumbnail has pointer-events: auto (interactive)', () => {
      renderOverlay();

      const btn = screen.getByTestId('screen-share-minimize-btn');
      fireEvent.click(btn);

      const thumbnail = screen.getByTestId('screen-share-thumbnail');
      expect(thumbnail.style.pointerEvents).toBe('auto');
    });
  });

  describe('Escape key', () => {
    it('minimizes overlay when Escape is pressed in full state', () => {
      renderOverlay();

      fireEvent.keyDown(document, { key: 'Escape' });

      const overlay = screen.getByTestId('screen-share-overlay');
      expect(overlay.getAttribute('data-state')).toBe('minimized');
    });

    it('does not change state when Escape is pressed in minimized state', () => {
      renderOverlay();

      // First minimize
      fireEvent.click(screen.getByTestId('screen-share-minimize-btn'));
      expect(screen.getByTestId('screen-share-overlay').getAttribute('data-state')).toBe('minimized');

      // Press Escape again — should stay minimized
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.getByTestId('screen-share-overlay').getAttribute('data-state')).toBe('minimized');
    });
  });

  describe('thumbnail click to expand', () => {
    it('expands to full state when thumbnail is clicked', () => {
      renderOverlay();

      // Minimize first
      fireEvent.click(screen.getByTestId('screen-share-minimize-btn'));
      expect(screen.getByTestId('screen-share-overlay').getAttribute('data-state')).toBe('minimized');

      // Click thumbnail to expand
      fireEvent.click(screen.getByTestId('screen-share-thumbnail'));
      expect(screen.getByTestId('screen-share-overlay').getAttribute('data-state')).toBe('full');
    });

    it('thumbnail has accessible expand label', () => {
      renderOverlay({ sharerName: 'Carlos' });

      fireEvent.click(screen.getByTestId('screen-share-minimize-btn'));

      const thumbnail = screen.getByTestId('screen-share-thumbnail');
      expect(thumbnail.getAttribute('aria-label')).toBe('Expandir compartilhamento de Carlos');
    });
  });

  describe('stream null → hidden transition', () => {
    it('transitions to hidden when stream becomes null', () => {
      const stream = createMockStream();
      const { rerender } = render(
        <ScreenShareOverlay stream={stream} sharerName="João" onClose={vi.fn()} />
      );

      expect(screen.getByTestId('screen-share-overlay')).toBeDefined();

      // Stream becomes null (sharing stopped)
      rerender(
        <ScreenShareOverlay stream={null} sharerName="João" onClose={vi.fn()} />
      );

      expect(screen.queryByTestId('screen-share-overlay')).toBeNull();
    });

    it('transitions from minimized to hidden when stream becomes null', () => {
      const stream = createMockStream();
      const { rerender } = render(
        <ScreenShareOverlay stream={stream} sharerName="João" onClose={vi.fn()} />
      );

      // Minimize
      fireEvent.click(screen.getByTestId('screen-share-minimize-btn'));
      expect(screen.getByTestId('screen-share-overlay').getAttribute('data-state')).toBe('minimized');

      // Stream becomes null
      rerender(
        <ScreenShareOverlay stream={null} sharerName="João" onClose={vi.fn()} />
      );

      expect(screen.queryByTestId('screen-share-overlay')).toBeNull();
    });

    it('transitions to full state when stream re-appears after being hidden', () => {
      const stream = createMockStream();
      const { rerender } = render(
        <ScreenShareOverlay stream={null} sharerName="João" onClose={vi.fn()} />
      );

      expect(screen.queryByTestId('screen-share-overlay')).toBeNull();

      // Stream appears
      rerender(
        <ScreenShareOverlay stream={stream} sharerName="João" onClose={vi.fn()} />
      );

      expect(screen.getByTestId('screen-share-overlay').getAttribute('data-state')).toBe('full');
    });
  });

  describe('video element', () => {
    it('renders a video element in full state', () => {
      renderOverlay();

      const videos = document.querySelectorAll('video');
      expect(videos.length).toBeGreaterThan(0);
    });

    it('renders a video element in minimized state', () => {
      renderOverlay();

      fireEvent.click(screen.getByTestId('screen-share-minimize-btn'));

      const videos = document.querySelectorAll('video');
      expect(videos.length).toBeGreaterThan(0);
    });
  });
});
