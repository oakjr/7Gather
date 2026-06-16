import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MediaControls, MediaControlsProps } from './MediaControls';

function renderControls(overrides: Partial<MediaControlsProps> = {}) {
  const defaultProps: MediaControlsProps = {
    isMuted: false,
    isVideoOn: false,
    isScreenSharing: false,
    onToggleMute: vi.fn(),
    onToggleVideo: vi.fn(),
    onToggleScreenShare: vi.fn(),
    ...overrides,
  };
  return { ...render(<MediaControls {...defaultProps} />), props: defaultProps };
}

describe('MediaControls', () => {
  describe('rendering and structure', () => {
    it('renders a toolbar with three media buttons', () => {
      renderControls();

      const toolbar = screen.getByRole('toolbar', { name: /controles de mídia/i });
      expect(toolbar).toBeDefined();

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(3);
    });

    it('renders mic button with unmuted state by default', () => {
      renderControls({ isMuted: false });

      const micBtn = screen.getByRole('button', { name: /desativar microfone/i });
      expect(micBtn).toBeDefined();
      expect(micBtn.getAttribute('aria-pressed')).toBe('true');
    });

    it('renders mic button with muted state', () => {
      renderControls({ isMuted: true });

      const micBtn = screen.getByRole('button', { name: /ativar microfone/i });
      expect(micBtn).toBeDefined();
      expect(micBtn.getAttribute('aria-pressed')).toBe('false');
    });

    it('renders video button off by default', () => {
      renderControls({ isVideoOn: false });

      const videoBtn = screen.getByRole('button', { name: /ativar câmera/i });
      expect(videoBtn).toBeDefined();
      expect(videoBtn.getAttribute('aria-pressed')).toBe('false');
    });

    it('renders video button on when isVideoOn is true', () => {
      renderControls({ isVideoOn: true });

      const videoBtn = screen.getByRole('button', { name: /desativar câmera/i });
      expect(videoBtn).toBeDefined();
      expect(videoBtn.getAttribute('aria-pressed')).toBe('true');
    });

    it('renders screen share button off by default', () => {
      renderControls({ isScreenSharing: false });

      const screenBtn = screen.getByRole('button', { name: /compartilhar tela/i });
      expect(screenBtn).toBeDefined();
      expect(screenBtn.getAttribute('aria-pressed')).toBe('false');
    });

    it('renders screen share button on when isScreenSharing is true', () => {
      renderControls({ isScreenSharing: true });

      const screenBtn = screen.getByRole('button', { name: /parar compartilhamento de tela/i });
      expect(screenBtn).toBeDefined();
      expect(screenBtn.getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('interactions', () => {
    it('calls onToggleMute when mic button is clicked', () => {
      const onToggleMute = vi.fn();
      renderControls({ onToggleMute });

      const micBtn = screen.getByRole('button', { name: /desativar microfone/i });
      fireEvent.click(micBtn);

      expect(onToggleMute).toHaveBeenCalledTimes(1);
    });

    it('calls onToggleVideo when video button is clicked', () => {
      const onToggleVideo = vi.fn();
      renderControls({ onToggleVideo });

      const videoBtn = screen.getByRole('button', { name: /ativar câmera/i });
      fireEvent.click(videoBtn);

      expect(onToggleVideo).toHaveBeenCalledTimes(1);
    });

    it('calls onToggleScreenShare when screen share button is clicked', () => {
      const onToggleScreenShare = vi.fn();
      renderControls({ onToggleScreenShare });

      const screenBtn = screen.getByRole('button', { name: /compartilhar tela/i });
      fireEvent.click(screenBtn);

      expect(onToggleScreenShare).toHaveBeenCalledTimes(1);
    });
  });

  describe('permission denied states', () => {
    it('disables mic button when micPermission is denied', () => {
      const onToggleMute = vi.fn();
      renderControls({ micPermission: 'denied', onToggleMute });

      const micBtn = screen.getByRole('button', { name: /microfone indisponível/i });
      expect(micBtn.hasAttribute('disabled')).toBe(true);

      fireEvent.click(micBtn);
      expect(onToggleMute).not.toHaveBeenCalled();
    });

    it('disables video button when cameraPermission is denied', () => {
      const onToggleVideo = vi.fn();
      renderControls({ cameraPermission: 'denied', onToggleVideo });

      const videoBtn = screen.getByRole('button', { name: /câmera indisponível/i });
      expect(videoBtn.hasAttribute('disabled')).toBe(true);

      fireEvent.click(videoBtn);
      expect(onToggleVideo).not.toHaveBeenCalled();
    });

    it('screen share button is never disabled by permissions', () => {
      renderControls({ micPermission: 'denied', cameraPermission: 'denied' });

      const screenBtn = screen.getByRole('button', { name: /compartilhar tela/i });
      expect(screenBtn.hasAttribute('disabled')).toBe(false);
    });

    it('shows permission denied indicator text for mic', () => {
      renderControls({ micPermission: 'denied' });

      expect(screen.getByText('Mic indisponível')).toBeDefined();
    });

    it('shows permission denied indicator text for camera', () => {
      renderControls({ cameraPermission: 'denied' });

      expect(screen.getByText('Câmera indisponível')).toBeDefined();
    });

    it('applies media-btn--disabled class to mic button when permission is denied', () => {
      renderControls({ micPermission: 'denied' });

      const micBtn = screen.getByRole('button', { name: /microfone indisponível/i });
      expect(micBtn.className).toContain('media-btn--disabled');
      expect(micBtn.className).not.toContain('media-btn--on');
      expect(micBtn.className).not.toContain('media-btn--off');
    });

    it('applies media-btn--disabled class to video button when permission is denied', () => {
      renderControls({ cameraPermission: 'denied' });

      const videoBtn = screen.getByRole('button', { name: /câmera indisponível/i });
      expect(videoBtn.className).toContain('media-btn--disabled');
      expect(videoBtn.className).not.toContain('media-btn--on');
      expect(videoBtn.className).not.toContain('media-btn--off');
    });

    it('disabled mic button does not use on/off class regardless of isMuted state', () => {
      renderControls({ micPermission: 'denied', isMuted: true });

      const micBtn = screen.getByRole('button', { name: /microfone indisponível/i });
      expect(micBtn.className).toContain('media-btn--disabled');
      expect(micBtn.className).not.toContain('media-btn--off');
    });

    it('disabled video button does not use on/off class regardless of isVideoOn state', () => {
      renderControls({ cameraPermission: 'denied', isVideoOn: true });

      const videoBtn = screen.getByRole('button', { name: /câmera indisponível/i });
      expect(videoBtn.className).toContain('media-btn--disabled');
      expect(videoBtn.className).not.toContain('media-btn--on');
    });
  });

  describe('permission prompt and granted states', () => {
    it('enables mic button when micPermission is prompt', () => {
      renderControls({ micPermission: 'prompt' });

      const micBtn = screen.getByRole('button', { name: /desativar microfone/i });
      expect(micBtn.hasAttribute('disabled')).toBe(false);
    });

    it('enables mic button when micPermission is granted', () => {
      renderControls({ micPermission: 'granted' });

      const micBtn = screen.getByRole('button', { name: /desativar microfone/i });
      expect(micBtn.hasAttribute('disabled')).toBe(false);
    });

    it('enables video button when cameraPermission is prompt', () => {
      renderControls({ cameraPermission: 'prompt' });

      const videoBtn = screen.getByRole('button', { name: /ativar câmera/i });
      expect(videoBtn.hasAttribute('disabled')).toBe(false);
    });

    it('enables video button when cameraPermission is granted', () => {
      renderControls({ cameraPermission: 'granted' });

      const videoBtn = screen.getByRole('button', { name: /ativar câmera/i });
      expect(videoBtn.hasAttribute('disabled')).toBe(false);
    });
  });

  describe('visual indicators', () => {
    it('shows muted icon when mic is muted', () => {
      renderControls({ isMuted: true });

      const micBtn = screen.getByRole('button', { name: /ativar microfone/i });
      expect(micBtn.textContent).toContain('🔇');
    });

    it('shows active mic icon when not muted', () => {
      renderControls({ isMuted: false });

      const micBtn = screen.getByRole('button', { name: /desativar microfone/i });
      expect(micBtn.textContent).toContain('🎤');
    });

    it('shows denied icon when mic permission is denied', () => {
      renderControls({ micPermission: 'denied' });

      const micBtn = screen.getByRole('button', { name: /microfone indisponível/i });
      expect(micBtn.textContent).toContain('🚫');
    });

    it('shows denied icon when camera permission is denied', () => {
      renderControls({ cameraPermission: 'denied' });

      const videoBtn = screen.getByRole('button', { name: /câmera indisponível/i });
      expect(videoBtn.textContent).toContain('🚫');
    });
  });

  describe('accessibility', () => {
    it('has proper toolbar role with accessible name', () => {
      renderControls();

      const toolbar = screen.getByRole('toolbar');
      expect(toolbar.getAttribute('aria-label')).toBe('Controles de mídia');
    });

    it('uses aria-pressed to indicate toggle state', () => {
      renderControls({ isMuted: false, isVideoOn: true, isScreenSharing: true });

      const buttons = screen.getAllByRole('button');
      // mic: not muted = pressed true (mic is on)
      expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
      // video: on = pressed true
      expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
      // screen: sharing = pressed true
      expect(buttons[2].getAttribute('aria-pressed')).toBe('true');
    });

    it('provides descriptive aria-labels for each state', () => {
      renderControls({ isMuted: true, isVideoOn: false, isScreenSharing: false });

      expect(screen.getByRole('button', { name: /ativar microfone/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /ativar câmera/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /compartilhar tela/i })).toBeDefined();
    });
  });
});
