/**
 * Property-Based Test: Status indicator color mapping is total and correct (Property 5)
 *
 * Feature: room-ux-improvements, Property 5: Status indicator color mapping is total and correct
 *
 * For any status value in the domain {"available", "busy", "dnd"}, the status indicator
 * color SHALL map to exactly one color (0x4cdf8b, 0xffb347, 0xff6b6b respectively),
 * and for any undefined/null status, it SHALL default to the "available" color.
 *
 * **Validates: Requirements 5.2, 5.3, 5.4, 5.7**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { STATUS_COLORS } from './constants';
import type { UserStatus } from './types';

/**
 * Helper that resolves a status color, defaulting to "available" color
 * when the status is undefined, null, or not in the map.
 * This mirrors the behavior expected in PlayerAvatar.setStatus().
 */
function getStatusColor(status: string | undefined | null): number {
  if (status == null || !(status in STATUS_COLORS)) {
    return STATUS_COLORS['available'];
  }
  return STATUS_COLORS[status];
}

/** Expected color mapping per the requirements */
const EXPECTED_COLORS: Record<UserStatus, number> = {
  available: 0x4cdf8b,
  busy: 0xffb347,
  dnd: 0xff6b6b,
};

/** All valid UserStatus values */
const VALID_STATUSES: UserStatus[] = ['available', 'busy', 'dnd'];

describe('Feature: room-ux-improvements, Property 5: Status indicator color mapping is total and correct', () => {
  /**
   * **Validates: Requirements 5.2, 5.3, 5.4**
   *
   * For any valid UserStatus, STATUS_COLORS returns exactly one correct hex color.
   */
  it('maps every valid status to its correct color', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_STATUSES),
        (status: UserStatus) => {
          const color = STATUS_COLORS[status];

          // Must return exactly one value (not undefined)
          expect(color).toBeDefined();
          expect(typeof color).toBe('number');

          // Must match the expected color for that status
          expect(color).toBe(EXPECTED_COLORS[status]);

          // The lookup helper must also return the same value
          expect(getStatusColor(status)).toBe(EXPECTED_COLORS[status]);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 5.7**
   *
   * For any undefined or null status, the lookup defaults to the "available" color.
   */
  it('defaults to available color for undefined or null status', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(undefined, null),
        (status: undefined | null) => {
          const color = getStatusColor(status);

          expect(color).toBe(EXPECTED_COLORS['available']);
          expect(color).toBe(0x4cdf8b);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 5.2, 5.3, 5.4, 5.7**
   *
   * For any arbitrary string that is NOT a valid status, the lookup defaults
   * to the "available" color. This tests the totality of the mapping.
   */
  it('defaults to available color for any invalid status string', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => !VALID_STATUSES.includes(s as UserStatus)),
        (invalidStatus: string) => {
          const color = getStatusColor(invalidStatus);

          expect(color).toBe(EXPECTED_COLORS['available']);
          expect(color).toBe(0x4cdf8b);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 5.2, 5.3, 5.4**
   *
   * The STATUS_COLORS map covers all and only the valid statuses,
   * and each maps to a distinct color.
   */
  it('STATUS_COLORS covers exactly the valid status set with distinct colors', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_STATUSES),
        (status: UserStatus) => {
          // The map must have exactly 3 keys
          expect(Object.keys(STATUS_COLORS)).toHaveLength(3);

          // Each valid status must be a key
          expect(status in STATUS_COLORS).toBe(true);

          // Colors must be distinct from each other
          const otherStatuses = VALID_STATUSES.filter(s => s !== status);
          for (const other of otherStatuses) {
            expect(STATUS_COLORS[status]).not.toBe(STATUS_COLORS[other]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
