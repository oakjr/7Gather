/**
 * Property-Based Test: Settings cancel reverts to initial values (Property 9)
 *
 * Feature: room-ux-improvements, Property 9: Settings cancel reverts to initial values
 *
 * For any sequence of form modifications (name changes, avatar selections) followed by
 * clicking "Cancelar", the form state SHALL equal the values captured when the panel was
 * opened. No localStorage writes or page reloads SHALL occur.
 *
 * **Validates: Requirements 9.2, 9.3**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SettingsMenu } from './SettingsMenu';
import { MAX_AVATARS } from '@shared/constants';

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

/**
 * Helper to get all avatar buttons in the grid by their aria-pressed attribute.
 * Avatar buttons are identified by having aria-pressed set.
 */
function getAvatarButtons(): HTMLElement[] {
  return screen.getAllByRole('button').filter(btn => btn.hasAttribute('aria-pressed'));
}

/**
 * Helper to click an avatar button by its position (0-indexed) in the grid.
 */
function clickAvatarAtIndex(index: number): void {
  const buttons = getAvatarButtons();
  if (index < buttons.length) {
    fireEvent.click(buttons[index]);
  }
}

/**
 * Helper to get which avatar index is currently selected (0-indexed).
 */
function getSelectedAvatarIndex(): number {
  const buttons = getAvatarButtons();
  return buttons.findIndex(btn => btn.getAttribute('aria-pressed') === 'true');
}

describe('Feature: room-ux-improvements, Property 9: Settings cancel reverts to initial values', () => {
  let setItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // Arbitrary for valid avatar IDs (1 to MAX_AVATARS)
  const avatarIdArb = fc.integer({ min: 1, max: MAX_AVATARS });

  // Arbitrary for valid display names (at least 2 non-space chars, up to 15)
  const displayNameArb = fc.string({ minLength: 2, maxLength: 15, unit: fc.hexa() })
    .map(s => 'U' + s); // Ensure non-empty trimmed (prefix with letter)

  // Arbitrary for a sequence of name modifications (1-3 changes)
  const nameModificationsArb = fc.array(
    fc.string({ minLength: 1, maxLength: 15, unit: fc.hexa() }).map(s => 'N' + s),
    { minLength: 1, maxLength: 3 }
  );

  // Arbitrary for a sequence of avatar selections as 0-indexed offsets (1-3 selections)
  const avatarModificationsArb = fc.array(
    fc.integer({ min: 0, max: MAX_AVATARS - 1 }),
    { minLength: 1, maxLength: 3 }
  );

  /**
   * **Validates: Requirements 9.2**
   *
   * For any initial name and avatar, and any sequence of form modifications followed
   * by cancel, the form state reverts to the initial values when reopened.
   */
  it('cancel reverts name and avatar to initial values after arbitrary modifications', () => {
    fc.assert(
      fc.property(
        displayNameArb,
        avatarIdArb,
        nameModificationsArb,
        avatarModificationsArb,
        (initialName, initialAvatarId, nameChanges, avatarChanges) => {
          const { unmount } = render(
            <SettingsMenu currentName={initialName} currentAvatarId={initialAvatarId} />
          );

          const nameInput = screen.getByLabelText(/nome/i) as HTMLInputElement;

          // Apply a sequence of name modifications
          for (const newName of nameChanges) {
            fireEvent.change(nameInput, { target: { value: newName } });
          }

          // Apply a sequence of avatar selections by index
          for (const avatarIdx of avatarChanges) {
            clickAvatarAtIndex(avatarIdx);
          }

          // Now click Cancel
          const cancelBtn = screen.getByRole('button', { name: /cancelar/i });
          // Cancel may be disabled if user happens to end up back at initial values
          if (!cancelBtn.hasAttribute('disabled')) {
            fireEvent.click(cancelBtn);

            // Panel closes after cancel. Re-open by clicking the toggle button.
            const toggleBtn = screen.getByRole('button', { name: /configurações/i });
            fireEvent.click(toggleBtn);

            // Verify the name field was reverted
            const nameInputAfter = screen.getByLabelText(/nome/i) as HTMLInputElement;
            expect(nameInputAfter.value).toBe(initialName);

            // Verify the avatar was reverted — initial avatar index is (id - 1)
            const selectedIdx = getSelectedAvatarIndex();
            expect(selectedIdx).toBe(initialAvatarId - 1);
          }

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 9.3**
   *
   * For any sequence of modifications followed by cancel, no localStorage.setItem
   * calls occur during or after the cancel action.
   */
  it('cancel does not write to localStorage for any modification sequence', () => {
    fc.assert(
      fc.property(
        displayNameArb,
        avatarIdArb,
        nameModificationsArb,
        avatarModificationsArb,
        (initialName, initialAvatarId, nameChanges, avatarChanges) => {
          const { unmount } = render(
            <SettingsMenu currentName={initialName} currentAvatarId={initialAvatarId} />
          );

          const nameInput = screen.getByLabelText(/nome/i) as HTMLInputElement;

          // Apply modifications
          for (const newName of nameChanges) {
            fireEvent.change(nameInput, { target: { value: newName } });
          }

          for (const avatarIdx of avatarChanges) {
            clickAvatarAtIndex(avatarIdx);
          }

          // Clear any prior setItem calls (in case component writes during modifications)
          setItemSpy.mockClear();

          // Click Cancel
          const cancelBtn = screen.getByRole('button', { name: /cancelar/i });
          if (!cancelBtn.hasAttribute('disabled')) {
            fireEvent.click(cancelBtn);
          }

          // Verify: no localStorage writes occurred from cancel action
          expect(setItemSpy).not.toHaveBeenCalled();

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 9.3**
   *
   * For any sequence of modifications followed by cancel, no page reload occurs.
   */
  it('cancel does not trigger page reload for any modification sequence', () => {
    fc.assert(
      fc.property(
        displayNameArb,
        avatarIdArb,
        nameModificationsArb,
        avatarModificationsArb,
        (initialName, initialAvatarId, nameChanges, avatarChanges) => {
          reloadMock.mockClear();

          const { unmount } = render(
            <SettingsMenu currentName={initialName} currentAvatarId={initialAvatarId} />
          );

          const nameInput = screen.getByLabelText(/nome/i) as HTMLInputElement;

          // Apply modifications
          for (const newName of nameChanges) {
            fireEvent.change(nameInput, { target: { value: newName } });
          }

          for (const avatarIdx of avatarChanges) {
            clickAvatarAtIndex(avatarIdx);
          }

          // Click Cancel
          const cancelBtn = screen.getByRole('button', { name: /cancelar/i });
          if (!cancelBtn.hasAttribute('disabled')) {
            fireEvent.click(cancelBtn);
          }

          // Verify: no page reload occurred
          expect(reloadMock).not.toHaveBeenCalled();

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
