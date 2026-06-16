/**
 * Property-Based Tests for CallNotification component
 *
 * Feature: room-ux-improvements
 *
 * Property 3: Call notification stacking respects FIFO with max 3
 * Property 11: Call auto-dismiss after timeout
 *
 * **Validates: Requirements 3.5, 3.9**
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import React from 'react';
import { render, act } from '@testing-library/react';
import { CallNotification, CallInfo } from './CallNotification';
import { CALL_TIMEOUT_MS } from '../../../shared/constants';

/** Arbitrary for a single CallInfo object */
const callInfoArb = (index: number): fc.Arbitrary<CallInfo> =>
  fc.record({
    callerId: fc.constant(`caller-${index}`),
    callerName: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
    timestamp: fc.constant(Date.now() - index * 1000),
    callerLeft: fc.boolean(),
  });

/** Arbitrary for an array of 1 to 10 CallInfo items with unique callerIds */
const callsArrayArb = fc
  .integer({ min: 1, max: 10 })
  .chain((n) => fc.tuple(...Array.from({ length: n }, (_, i) => callInfoArb(i))));

describe('Property 3: Call notification stacking respects FIFO with max 3', () => {
  /**
   * **Validates: Requirements 3.5**
   *
   * For any sequence of N incoming calls (1-10), the rendered notifications
   * are at most MAX_VISIBLE_CALLS (3) and represent the most recent calls
   * (the last 3 items in the array).
   */
  it('visible notifications are at most 3 and represent the most recent calls', () => {
    fc.assert(
      fc.property(callsArrayArb, (calls) => {
        const { container } = render(
          <CallNotification
            calls={calls}
            onGo={vi.fn()}
            onDismiss={vi.fn()}
          />
        );

        const toasts = container.querySelectorAll('.call-notification-toast');

        // Visible notifications must be at most 3
        expect(toasts.length).toBeLessThanOrEqual(3);

        // Visible notifications must equal min(calls.length, 3)
        const expectedCount = Math.min(calls.length, 3);
        expect(toasts.length).toBe(expectedCount);

        // The visible notifications should represent the most recent calls
        // (the last `expectedCount` items from the array)
        const expectedCalls = calls.slice(calls.length - expectedCount);

        for (let i = 0; i < expectedCount; i++) {
          const toast = toasts[i];
          const callerIdAttr = toast.getAttribute('data-caller-id');
          expect(callerIdAttr).toBe(expectedCalls[i].callerId);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.5**
   *
   * When there are 0 calls, no notifications are rendered.
   */
  it('renders no notifications when calls array is empty', () => {
    const { container } = render(
      <CallNotification
        calls={[]}
        onGo={vi.fn()}
        onDismiss={vi.fn()}
      />
    );

    const toasts = container.querySelectorAll('.call-notification-toast');
    expect(toasts.length).toBe(0);
  });

  /**
   * **Validates: Requirements 3.5**
   *
   * The oldest calls (earliest in array) are the ones discarded when count exceeds 3.
   */
  it('discards the oldest calls when more than 3 are provided', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 10 }).chain((n) =>
          fc.tuple(...Array.from({ length: n }, (_, i) => callInfoArb(i)))
        ),
        (calls) => {
          const { container } = render(
            <CallNotification
              calls={calls}
              onGo={vi.fn()}
              onDismiss={vi.fn()}
            />
          );

          const toasts = container.querySelectorAll('.call-notification-toast');

          // Only 3 should be visible
          expect(toasts.length).toBe(3);

          // The discarded calls (first N-3) should NOT be present
          const discardedCalls = calls.slice(0, calls.length - 3);
          for (const discarded of discardedCalls) {
            const found = container.querySelector(
              `[data-caller-id="${discarded.callerId}"]`
            );
            expect(found).toBeNull();
          }

          // The visible calls (last 3) should be present
          const visibleCalls = calls.slice(calls.length - 3);
          for (const visible of visibleCalls) {
            const found = container.querySelector(
              `[data-caller-id="${visible.callerId}"]`
            );
            expect(found).not.toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Property 11: Call auto-dismiss after timeout
 *
 * Feature: room-ux-improvements, Property 11: Call auto-dismiss after timeout
 *
 * For any call notification, if 60 seconds elapse without the user clicking "Ir",
 * the notification SHALL be automatically dismissed. No stale notifications SHALL
 * remain visible past the timeout.
 *
 * **Validates: Requirements 3.9**
 */
describe('Property 11: Call auto-dismiss after timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * **Validates: Requirements 3.9**
   *
   * For any call with an elapsed time between 0 and 59 seconds,
   * advancing fake timers by (CALL_TIMEOUT_MS - elapsed) triggers onDismiss.
   */
  it('auto-dismisses each call after exactly CALL_TIMEOUT_MS from its timestamp', () => {
    fc.assert(
      fc.property(
        // Generate elapsed time in ms: 0 to 59_999ms (call is 0-59s old)
        fc.integer({ min: 0, max: 59_999 }),
        fc.string({ minLength: 1, maxLength: 15 }).filter((s) => s.trim().length > 0),
        (elapsedMs, callerName) => {
          const now = 1_000_000_000; // Fixed "now" for fake timers
          vi.setSystemTime(now);

          const callTimestamp = now - elapsedMs;
          const onDismiss = vi.fn();
          const onGo = vi.fn();

          const calls: CallInfo[] = [
            {
              callerId: 'caller-auto-dismiss',
              callerName,
              timestamp: callTimestamp,
              callerLeft: false,
            },
          ];

          render(
            <CallNotification calls={calls} onGo={onGo} onDismiss={onDismiss} />
          );

          // onDismiss should NOT have been called yet (remaining > 0)
          expect(onDismiss).not.toHaveBeenCalled();

          // Advance timers by the remaining time until auto-dismiss
          const remaining = CALL_TIMEOUT_MS - elapsedMs;
          act(() => {
            vi.advanceTimersByTime(remaining);
          });

          // onDismiss should now have been called with the callerId
          expect(onDismiss).toHaveBeenCalledWith('caller-auto-dismiss');
          expect(onDismiss).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.9**
   *
   * For multiple calls with various ages, all are dismissed by the time
   * CALL_TIMEOUT_MS has elapsed from the youngest call.
   */
  it('no stale notifications remain after CALL_TIMEOUT_MS from each call timestamp', () => {
    fc.assert(
      fc.property(
        // Generate 1-3 calls with different elapsed times (0-59s old)
        fc.array(
          fc.integer({ min: 0, max: 59_999 }),
          { minLength: 1, maxLength: 3 }
        ),
        (elapsedList) => {
          const now = 1_000_000_000;
          vi.setSystemTime(now);

          const onDismiss = vi.fn();
          const onGo = vi.fn();

          const calls: CallInfo[] = elapsedList.map((elapsedMs, i) => ({
            callerId: `caller-${i}`,
            callerName: `User ${i}`,
            timestamp: now - elapsedMs,
            callerLeft: false,
          }));

          render(
            <CallNotification calls={calls} onGo={onGo} onDismiss={onDismiss} />
          );

          // Advance by CALL_TIMEOUT_MS (maximum possible remaining is CALL_TIMEOUT_MS)
          // This ensures all calls have expired regardless of their age
          act(() => {
            vi.advanceTimersByTime(CALL_TIMEOUT_MS);
          });

          // Each call should have had onDismiss called exactly once
          for (let i = 0; i < calls.length; i++) {
            expect(onDismiss).toHaveBeenCalledWith(`caller-${i}`);
          }

          // Total dismiss calls should match number of calls
          expect(onDismiss).toHaveBeenCalledTimes(calls.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 3.9**
   *
   * Calls that are already expired (elapsed >= CALL_TIMEOUT_MS) are dismissed immediately.
   */
  it('immediately dismisses calls that have already exceeded the timeout', () => {
    const now = 1_000_000_000;
    vi.setSystemTime(now);

    const onDismiss = vi.fn();
    const onGo = vi.fn();

    // Call that is exactly 60s old (already expired)
    const calls: CallInfo[] = [
      {
        callerId: 'expired-caller',
        callerName: 'Expired',
        timestamp: now - CALL_TIMEOUT_MS,
        callerLeft: false,
      },
    ];

    render(
      <CallNotification calls={calls} onGo={onGo} onDismiss={onDismiss} />
    );

    // Should be dismissed immediately (within same tick)
    expect(onDismiss).toHaveBeenCalledWith('expired-caller');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
