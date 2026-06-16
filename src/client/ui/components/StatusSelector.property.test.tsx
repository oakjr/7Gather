/**
 * Property-Based Test: Status persistence round trip (Property 4)
 *
 * Feature: room-ux-improvements, Property 4: Status persistence round trip
 *
 * For any valid status value written to localStorage, reading it back and applying it
 * as the initial status SHALL produce the same value. For any invalid or missing
 * localStorage value, the system SHALL default to "available".
 *
 * **Validates: Requirements 4.1, 4.2, 4.3**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { StatusSelector } from './StatusSelector';
import type { UserStatus } from '../../../shared/types';

describe('Feature: room-ux-improvements, Property 4: Status persistence round trip', () => {
  let localStorageMock: Record<string, string>;

  beforeEach(() => {
    localStorageMock = {};
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(
      (key: string) => localStorageMock[key] ?? null
    );
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
      (key: string, value: string) => {
        localStorageMock[key] = value;
      }
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  /**
   * **Validates: Requirements 4.1, 4.2**
   *
   * For any valid UserStatus value written to localStorage, rendering StatusSelector
   * reads it back and displays the correct status.
   */
  it('round-trips any valid status through localStorage', () => {
    const validStatuses: UserStatus[] = ['available', 'busy', 'dnd'];

    const statusLabelMap: Record<UserStatus, string> = {
      available: 'Disponível',
      busy: 'Ocupado',
      dnd: 'Não Perturbe',
    };

    fc.assert(
      fc.property(
        fc.constantFrom(...validStatuses),
        (status: UserStatus) => {
          // Write the status to localStorage
          localStorageMock['user_status'] = status;

          // Render StatusSelector — it should read from localStorage
          const { unmount } = render(<StatusSelector onStatusChange={vi.fn()} />);

          // Find the button corresponding to this status
          const label = statusLabelMap[status];
          const button = screen.getByText(label).closest('button');

          // Verify the correct status is active
          expect(button?.getAttribute('aria-checked')).toBe('true');

          // Verify localStorage still holds the same value (not overwritten)
          expect(localStorageMock['user_status']).toBe(status);

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 4.3**
   *
   * For any invalid or missing value in localStorage, StatusSelector defaults to "available".
   */
  it('defaults to "available" for any invalid or missing localStorage value', () => {
    const validStatuses = new Set(['available', 'busy', 'dnd']);

    fc.assert(
      fc.property(
        fc.oneof(
          // Generate arbitrary strings that are NOT valid statuses
          fc.string({ minLength: 0, maxLength: 50 }).filter(s => !validStatuses.has(s)),
          // Also generate some edge-case values
          fc.constantFrom('', ' ', 'AVAILABLE', 'Busy', 'DND', 'null', 'undefined', '0', '1', 'true', 'false')
        ),
        (invalidValue: string) => {
          // Write the invalid value to localStorage
          localStorageMock['user_status'] = invalidValue;

          // Render StatusSelector
          const { unmount } = render(<StatusSelector onStatusChange={vi.fn()} />);

          // The "Disponível" (available) button should be active
          const availableButton = screen.getByText('Disponível').closest('button');
          expect(availableButton?.getAttribute('aria-checked')).toBe('true');

          // localStorage should now have "available" persisted as the default
          expect(localStorageMock['user_status']).toBe('available');

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 4.3**
   *
   * When localStorage has no user_status key at all, defaults to "available".
   */
  it('defaults to "available" when localStorage key is missing', () => {
    fc.assert(
      fc.property(
        // Generate arbitrary unrelated keys that might exist in localStorage
        fc.dictionary(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => s !== 'user_status'),
          fc.string()
        ),
        (otherEntries: Record<string, string>) => {
          // Set up localStorage without user_status key
          localStorageMock = { ...otherEntries };

          // Render StatusSelector
          const { unmount } = render(<StatusSelector onStatusChange={vi.fn()} />);

          // Should default to "available"
          const availableButton = screen.getByText('Disponível').closest('button');
          expect(availableButton?.getAttribute('aria-checked')).toBe('true');

          // Should persist the default
          expect(localStorageMock['user_status']).toBe('available');

          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
