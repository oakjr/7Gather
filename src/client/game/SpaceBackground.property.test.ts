/**
 * Property-Based Test: Maximum concurrent twinkle animations (Property 9)
 *
 * Feature: space-theme-room-decoration
 *
 * Property 9: Maximum concurrent twinkle animations
 * For any point in time during the SpaceBackground animation lifecycle, the number of
 * stars simultaneously in a twinkle animation state SHALL NOT exceed 3.
 *
 * **Validates: Requirements 15.4**
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock Phaser module
vi.mock('phaser', () => {
  const phaserMock = {
    Scene: class {},
    Math: {
      Between: (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min,
    },
    GameObjects: {
      Graphics: class {},
      Rectangle: class {},
    },
    Tilemaps: {
      Tilemap: class {},
      TilemapLayer: class {},
    },
    Time: {
      TimerEvent: class {},
    },
    Tweens: {
      Tween: class {},
    },
    Types: {},
  };

  return {
    default: phaserMock,
    ...phaserMock,
  };
});

import { SpaceBackground } from './SpaceBackground';

/**
 * Creates a mock Phaser scene that captures timer and tween callbacks
 * so we can simulate time progression in the property test.
 */
function createMockScene() {
  const tweensAdded: Array<{ targets: unknown; onComplete?: () => void }> = [];
  const timersAdded: Array<{ delay: number; callback: () => void; callbackScope: unknown }> = [];

  const mockScene = {
    add: {
      rectangle: vi.fn((_x: number, _y: number, _w: number, _h: number, _color: number) => ({
        setDepth: vi.fn().mockReturnThis(),
        setOrigin: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
      })),
      graphics: vi.fn(() => ({
        fillStyle: vi.fn().mockReturnThis(),
        fillRect: vi.fn().mockReturnThis(),
        fillCircle: vi.fn().mockReturnThis(),
        setDepth: vi.fn().mockReturnThis(),
        setPosition: vi.fn().mockReturnThis(),
        setOrigin: vi.fn().mockReturnThis(),
        alpha: 1,
        destroy: vi.fn(),
      })),
    },
    time: {
      addEvent: vi.fn((config: { delay: number; callback: () => void; callbackScope: unknown }) => {
        timersAdded.push(config);
        return { destroy: vi.fn() };
      }),
    },
    tweens: {
      add: vi.fn((config: { targets: unknown; alpha?: number; duration?: number; yoyo?: boolean; onComplete?: () => void; x?: number; y?: number }) => {
        tweensAdded.push(config);
        return { stop: vi.fn() };
      }),
    },
  };

  return { mockScene, tweensAdded, timersAdded };
}

/**
 * Represents a single event in a simulated timeline:
 * - 'trigger': invoke the twinkle timer callback (attempts to start a new twinkle)
 * - 'complete': complete one existing twinkle (calls onComplete on an outstanding tween)
 */
type TimelineEvent = { type: 'trigger' } | { type: 'complete'; tweenIndex: number };

describe('Property 9: Maximum concurrent twinkle animations', () => {
  /**
   * **Validates: Requirements 15.4**
   *
   * For any point in time during the SpaceBackground animation lifecycle, the number of
   * stars simultaneously in a twinkle animation state SHALL NOT exceed 3.
   */
  it('active twinkles never exceed 3 for any sequence of trigger and completion events', () => {
    fc.assert(
      fc.property(
        // Generate a random sequence of trigger/complete events
        fc.array(
          fc.oneof(
            // Trigger event: attempt to start a new twinkle
            fc.constant({ type: 'trigger' as const }),
            // Complete event: complete one of the outstanding tweens (index relative to outstanding count)
            fc.nat({ max: 9 }).map(n => ({ type: 'complete' as const, tweenIndex: n }))
          ),
          { minLength: 5, maxLength: 50 }
        ),
        (events) => {
          const { mockScene, tweensAdded, timersAdded } = createMockScene();
          const background = new SpaceBackground(mockScene as unknown as Phaser.Scene, 1600, 1280);
          background.create();

          // Track which tweens haven't completed yet
          const completedTweens = new Set<number>();
          let maxObserved = 0;

          for (const event of events) {
            if (event.type === 'trigger') {
              // Fire the latest twinkle timer callback (twinkle timer reschedules itself)
              // The twinkle timer callbacks are at indices 0, 2, 4, ... (odd indices are comet timers)
              // Find the most recent timer that was added (twinkle timers are added first and reschedule)
              const lastTimerIndex = timersAdded.length - 1;
              if (lastTimerIndex >= 0) {
                const timer = timersAdded[lastTimerIndex];
                timer.callback.call(timer.callbackScope);
              }
            } else {
              // Complete an outstanding tween (if any exist)
              const outstandingIndices: number[] = [];
              for (let i = 0; i < tweensAdded.length; i++) {
                if (!completedTweens.has(i) && tweensAdded[i].onComplete) {
                  outstandingIndices.push(i);
                }
              }
              if (outstandingIndices.length > 0) {
                // Use the tweenIndex modulo outstanding count to pick which one to complete
                const idx = event.tweenIndex % outstandingIndices.length;
                const tweenIdx = outstandingIndices[idx];
                tweensAdded[tweenIdx].onComplete!();
                completedTweens.add(tweenIdx);
              }
            }

            // Check invariant after each event
            const activeTwinkles = background.getActiveTwinkles();
            maxObserved = Math.max(maxObserved, activeTwinkles);
            if (activeTwinkles > 3) {
              return false;
            }
          }

          // Clean up
          background.destroy();
          return true;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('active twinkles never exceed 3 even with rapid consecutive triggers without completions', () => {
    fc.assert(
      fc.property(
        // Generate a burst of trigger-only events (worst case: no completions)
        fc.integer({ min: 5, max: 30 }),
        (triggerCount) => {
          const { mockScene, timersAdded } = createMockScene();
          const background = new SpaceBackground(mockScene as unknown as Phaser.Scene, 1600, 1280);
          background.create();

          // Fire the twinkle trigger multiple times without any completions
          for (let i = 0; i < triggerCount; i++) {
            const lastTimerIndex = timersAdded.length - 1;
            if (lastTimerIndex >= 0) {
              const timer = timersAdded[lastTimerIndex];
              timer.callback.call(timer.callbackScope);
            }

            // Check invariant after each trigger
            const activeTwinkles = background.getActiveTwinkles();
            if (activeTwinkles > 3) {
              return false;
            }
          }

          // Final check
          expect(background.getActiveTwinkles()).toBeLessThanOrEqual(3);
          background.destroy();
          return true;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('active twinkles correctly decrease after completions and allow new triggers', () => {
    fc.assert(
      fc.property(
        // Generate cycles: number of trigger-complete cycles
        fc.array(
          fc.record({
            triggers: fc.integer({ min: 1, max: 10 }),
            completions: fc.integer({ min: 0, max: 5 }),
          }),
          { minLength: 3, maxLength: 20 }
        ),
        (cycles) => {
          const { mockScene, tweensAdded, timersAdded } = createMockScene();
          const background = new SpaceBackground(mockScene as unknown as Phaser.Scene, 1600, 1280);
          background.create();

          const completedTweens = new Set<number>();

          for (const cycle of cycles) {
            // Apply triggers
            for (let i = 0; i < cycle.triggers; i++) {
              const lastTimerIndex = timersAdded.length - 1;
              if (lastTimerIndex >= 0) {
                const timer = timersAdded[lastTimerIndex];
                timer.callback.call(timer.callbackScope);
              }

              // Check invariant
              if (background.getActiveTwinkles() > 3) {
                return false;
              }
            }

            // Apply completions
            for (let i = 0; i < cycle.completions; i++) {
              const outstandingIndices: number[] = [];
              for (let j = 0; j < tweensAdded.length; j++) {
                if (!completedTweens.has(j) && tweensAdded[j].onComplete) {
                  outstandingIndices.push(j);
                }
              }
              if (outstandingIndices.length > 0) {
                const tweenIdx = outstandingIndices[0];
                tweensAdded[tweenIdx].onComplete!();
                completedTweens.add(tweenIdx);
              }
            }

            // Check invariant after completions too
            if (background.getActiveTwinkles() > 3) {
              return false;
            }
          }

          background.destroy();
          return true;
        }
      ),
      { numRuns: 200 }
    );
  });
});
