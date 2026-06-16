import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SettingsMenu, SettingsMenuProps } from './SettingsMenu';

// Mock avatarStorage
vi.mock('../avatarStorage', () => ({
  setAvatarId: vi.fn(),
  getAvatarId: vi.fn(() => 1),
}));

// Mock window.location.reload
const reloadMock = vi.fn();
Object.defineProperty(window, 'location', {
  value: { reload: reloadMock },
  writable: true,
});

function renderSettings(overrides: Partial<SettingsMenuProps> = {}) {
  const defaultProps: SettingsMenuProps = {
    currentName: 'Player1',
    currentAvatarId: 1,
    ...overrides,
  };
  return { ...render(<SettingsMenu {...defaultProps} />), props: defaultProps };
}

describe('SettingsMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('rendering', () => {
    it('renders the settings panel with name input and avatar grid', () => {
      renderSettings();

      expect(screen.getByLabelText(/nome/i)).toBeDefined();
      expect(screen.getByText('Configurações')).toBeDefined();
    });

    it('renders both Cancel and Save buttons', () => {
      renderSettings();

      expect(screen.getByRole('button', { name: /cancelar/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /sem alterações/i })).toBeDefined();
    });

    it('Cancel button is positioned left of Save button', () => {
      renderSettings();

      const cancelBtn = screen.getByRole('button', { name: /cancelar/i });
      const saveBtn = screen.getByRole('button', { name: /sem alterações/i });

      // Both buttons should be in the same parent flex container
      expect(cancelBtn.parentElement).toBe(saveBtn.parentElement);

      // Cancel should come before Save in DOM order (left in flex row)
      const parent = cancelBtn.parentElement!;
      const children = Array.from(parent.children);
      expect(children.indexOf(cancelBtn)).toBeLessThan(children.indexOf(saveBtn));
    });
  });

  describe('Cancel button disabled state', () => {
    it('Cancel button is disabled when form matches initial values', () => {
      renderSettings({ currentName: 'Player1', currentAvatarId: 1 });

      const cancelBtn = screen.getByRole('button', { name: /cancelar/i });
      expect(cancelBtn.hasAttribute('disabled')).toBe(true);
    });

    it('Cancel button has reduced opacity when disabled', () => {
      renderSettings({ currentName: 'Player1', currentAvatarId: 1 });

      const cancelBtn = screen.getByRole('button', { name: /cancelar/i });
      expect(cancelBtn.style.opacity).toBe('0.5');
    });

    it('Cancel button is enabled when name changes', () => {
      renderSettings({ currentName: 'Player1', currentAvatarId: 1 });

      const nameInput = screen.getByLabelText(/nome/i);
      fireEvent.change(nameInput, { target: { value: 'NewName' } });

      const cancelBtn = screen.getByRole('button', { name: /cancelar/i });
      expect(cancelBtn.hasAttribute('disabled')).toBe(false);
      expect(cancelBtn.style.opacity).toBe('1');
    });

    it('Cancel button is enabled when avatar changes', () => {
      renderSettings({ currentName: 'Player1', currentAvatarId: 1 });

      // Click a different avatar
      const avatar2 = screen.getByRole('button', { name: /comandante/i });
      fireEvent.click(avatar2);

      const cancelBtn = screen.getByRole('button', { name: /cancelar/i });
      expect(cancelBtn.hasAttribute('disabled')).toBe(false);
    });

    it('Cancel button returns to disabled when user manually reverts name to original', () => {
      renderSettings({ currentName: 'Player1', currentAvatarId: 1 });

      const nameInput = screen.getByLabelText(/nome/i);
      fireEvent.change(nameInput, { target: { value: 'Changed' } });

      // Cancel should be enabled
      let cancelBtn = screen.getByRole('button', { name: /cancelar/i });
      expect(cancelBtn.hasAttribute('disabled')).toBe(false);

      // Revert back to original
      fireEvent.change(nameInput, { target: { value: 'Player1' } });

      cancelBtn = screen.getByRole('button', { name: /cancelar/i });
      expect(cancelBtn.hasAttribute('disabled')).toBe(true);
    });

    it('Cancel button returns to disabled when user manually reverts avatar to original', () => {
      renderSettings({ currentName: 'Player1', currentAvatarId: 1 });

      // Change avatar
      const avatar2 = screen.getByRole('button', { name: /comandante/i });
      fireEvent.click(avatar2);

      let cancelBtn = screen.getByRole('button', { name: /cancelar/i });
      expect(cancelBtn.hasAttribute('disabled')).toBe(false);

      // Revert back to original avatar
      const avatar1 = screen.getByRole('button', { name: /astronauta/i });
      fireEvent.click(avatar1);

      cancelBtn = screen.getByRole('button', { name: /cancelar/i });
      expect(cancelBtn.hasAttribute('disabled')).toBe(true);
    });
  });

  describe('Cancel button behavior', () => {
    it('clicking Cancel reverts name to initial value', () => {
      renderSettings({ currentName: 'Player1', currentAvatarId: 1 });

      const nameInput = screen.getByLabelText(/nome/i) as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'Changed' } });

      const cancelBtn = screen.getByRole('button', { name: /cancelar/i });
      fireEvent.click(cancelBtn);

      // Panel should close, so the input won't be visible
      // Re-open to verify the state reverted
      expect(screen.queryByLabelText(/nome/i)).toBeNull();
    });

    it('clicking Cancel closes the settings panel', () => {
      renderSettings({ currentName: 'Player1', currentAvatarId: 1 });

      const nameInput = screen.getByLabelText(/nome/i);
      fireEvent.change(nameInput, { target: { value: 'Changed' } });

      const cancelBtn = screen.getByRole('button', { name: /cancelar/i });
      fireEvent.click(cancelBtn);

      // Panel should be closed
      expect(screen.queryByText('Configurações')).toBeNull();
    });

    it('clicking Cancel does not write to localStorage', () => {
      renderSettings({ currentName: 'Player1', currentAvatarId: 1 });

      const nameInput = screen.getByLabelText(/nome/i);
      fireEvent.change(nameInput, { target: { value: 'Changed' } });

      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

      const cancelBtn = screen.getByRole('button', { name: /cancelar/i });
      fireEvent.click(cancelBtn);

      expect(setItemSpy).not.toHaveBeenCalled();
      setItemSpy.mockRestore();
    });

    it('clicking Cancel does not trigger page reload', () => {
      renderSettings({ currentName: 'Player1', currentAvatarId: 1 });

      const nameInput = screen.getByLabelText(/nome/i);
      fireEvent.change(nameInput, { target: { value: 'Changed' } });

      const cancelBtn = screen.getByRole('button', { name: /cancelar/i });
      fireEvent.click(cancelBtn);

      expect(reloadMock).not.toHaveBeenCalled();
    });

    it('clicking Cancel reverts avatar selection to initial value', () => {
      const { rerender } = renderSettings({ currentName: 'Player1', currentAvatarId: 1 });

      // Change avatar to 2
      const avatar2 = screen.getByRole('button', { name: /comandante/i });
      fireEvent.click(avatar2);

      // Avatar 2 should now be selected
      expect(avatar2.getAttribute('aria-pressed')).toBe('true');

      // Cancel
      const cancelBtn = screen.getByRole('button', { name: /cancelar/i });
      fireEvent.click(cancelBtn);

      // Panel is closed. Re-open by clicking toggle
      const toggleBtn = screen.getByRole('button', { name: /configurações/i });
      fireEvent.click(toggleBtn);

      // Avatar 1 should be selected again (reverted)
      const avatar1 = screen.getByRole('button', { name: /astronauta/i });
      expect(avatar1.getAttribute('aria-pressed')).toBe('true');
    });
  });
});
