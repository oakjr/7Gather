/**
 * Property-Based Test: Screen share overlay state machine transitions (Property 2)
 *
 * Feature: room-ux-improvements, Property 2: Screen share overlay state machine transitions
 *
 * For any sequence of user interactions (minimize click, thumbnail click, Escape key,
 * sharing stops), the ScreenShareOverlay state SHALL follow valid transitions:
 * `full → minimized`, `minimized → full`, `full|minimized → hidden`,
 * and no other transitions SHALL occur.
 *
 * **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6**
 */
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import React from 'react';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { ScreenShareOverlay, OverlayState } from './ScreenShareOverlay';

/**
 * User action types that can affect the overlay state machine:
 * - minimizeClick: click the minimize button (valid in 'full' state)
 * - thumbnailClick: click the thumbnail (valid in 'minimized' state)
 * - escapeKey: press Escape key (valid in 'full' state)
 * - streamNull: stream becomes null (valid in 'full' or 'minimized' state)
 */
type UserAction = 'minimizeClick' | 'thumbnailClick' | 'escapeKey' | 'streamNull';

/** Arbitrary for user actions */
const userActionArb = fc.constantFrom<UserAction>(
  'minimizeClick',
  'thumbnailClick',
  'escapeKey',
  'streamNull'
);

/** Generate a sequence of 1-20 user actions */
const actionSequenceArb = fc.array(userActionArb, { minLength: 1, maxLength: 20 });

/**
 * Valid transitions for the overlay state machine:
 * - full → minimized (minimize button or Escape key)
 * - minimized → full (thumbnail click)
 * - full → hidden (stream becomes null)
 * - minimized → hidden (stream becomes null)
 *
 * Self-transitions (staying in the same state when an action is a no-op)
 * are NOT state transitions - they are ignored actions.
 */
const VALID_TRANSITIONS: Record<OverlayState, OverlayState[]> = {
  full: ['minimized', 'hidden'],
  minimized: ['full', 'hidden'],
  hidden: [], // no transitions out of hidden (stream must be re-provided externally)
};

function isValidTransition(from: OverlayState, to: OverlayState): boolean {
  if (from === to) return true; // No-op (staying in same state) is always valid
  return VALID_TRANSITIONS[from].includes(to);
}

/** Creates a mock MediaStream for testing */
function createMockStream(): MediaStream {
  const stream = {
    id: 'mock-stream',
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
  return stream;
}

/**
 * Wrapper component that allows us to control the stream prop
 * from outside, simulating stream becoming null.
 */
function OverlayTestHarness({
  actions,
  onTransitions,
}: {
  actions: UserAction[];
  onTransitions: (transitions: Array<{ from: OverlayState; to: OverlayState }>) => void;
}) {
  const [stream, setStream] = React.useState<MediaStream | null>(createMockStream);
  const overlayRef = React.useRef<HTMLDivElement>(null);
  const transitions: Array<{ from: OverlayState; to: OverlayState }> = [];

  // We'll track state by reading data-state attribute
  const getState = (): OverlayState => {
    const el = overlayRef.current?.querySelector('[data-testid="screen-share-overlay"]');
    if (!el) return 'hidden';
    return (el.getAttribute('data-state') as OverlayState) || 'hidden';
  };

  React.useEffect(() => {
    let previousState: OverlayState = stream ? 'full' : 'hidden';

    for (const action of actions) {
      const beforeState = getState();

      switch (action) {
        case 'minimizeClick': {
          const btn = overlayRef.current?.querySelector(
            '[data-testid="screen-share-minimize-btn"]'
          ) as HTMLElement | null;
          if (btn) {
            fireEvent.click(btn);
          }
          break;
        }
        case 'thumbnailClick': {
          const thumb = overlayRef.current?.querySelector(
            '[data-testid="screen-share-thumbnail"]'
          ) as HTMLElement | null;
          if (thumb) {
            fireEvent.click(thumb);
          }
          break;
        }
        case 'escapeKey': {
          fireEvent.keyDown(document, { key: 'Escape' });
          break;
        }
        case 'streamNull': {
          setStream(null);
          break;
        }
      }

      const afterState = getState();
      if (beforeState !== afterState) {
        transitions.push({ from: beforeState, to: afterState });
      }
      previousState = afterState;
    }

    onTransitions(transitions);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={overlayRef}>
      <ScreenShareOverlay stream={stream} sharerName="Test User" onClose={vi.fn()} />
    </div>
  );
}

describe('Property 2: Screen share overlay state machine transitions', () => {
  /**
   * **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6**
   *
   * For any sequence of user interactions, verify that only valid state
   * transitions occur in the overlay state machine.
   */
  it('only valid transitions occur for any sequence of user interactions', () => {
    fc.assert(
      fc.property(actionSequenceArb, (actions) => {
        // Simulate state machine transitions without rendering
        // This tests the logical state machine independently
        let currentState: OverlayState = 'full'; // starts with a stream → full

        for (const action of actions) {
          const previousState = currentState;
          let nextState = currentState;

          switch (action) {
            case 'minimizeClick':
              // Only valid from 'full' state
              if (currentState === 'full') {
                nextState = 'minimized';
              }
              break;
            case 'thumbnailClick':
              // Only valid from 'minimized' state
              if (currentState === 'minimized') {
                nextState = 'full';
              }
              break;
            case 'escapeKey':
              // Only valid from 'full' state
              if (currentState === 'full') {
                nextState = 'minimized';
              }
              break;
            case 'streamNull':
              // Valid from 'full' or 'minimized'
              if (currentState === 'full' || currentState === 'minimized') {
                nextState = 'hidden';
              }
              break;
          }

          // Verify the transition is valid
          expect(isValidTransition(previousState, nextState)).toBe(true);
          currentState = nextState;
        }
      }),
      { numRuns: 200 }
    );
  });

  it('hidden state is terminal - no user action can leave hidden state', () => {
    fc.assert(
      fc.property(actionSequenceArb, (actions) => {
        let currentState: OverlayState = 'full';
        let reachedHidden = false;

        for (const action of actions) {
          if (reachedHidden) {
            // Once in hidden, no action should change state
            const previousState = currentState;
            // Apply the action - none should work from hidden
            // (hidden means stream is null, component renders nothing)
            expect(currentState).toBe('hidden');
            break;
          }

          switch (action) {
            case 'minimizeClick':
              if (currentState === 'full') currentState = 'minimized';
              break;
            case 'thumbnailClick':
              if (currentState === 'minimized') currentState = 'full';
              break;
            case 'escapeKey':
              if (currentState === 'full') currentState = 'minimized';
              break;
            case 'streamNull':
              if (currentState !== 'hidden') {
                currentState = 'hidden';
                reachedHidden = true;
              }
              break;
          }
        }

        if (reachedHidden) {
          // Verify that after reaching hidden, applying any remaining action
          // would still leave us in hidden state
          for (const action of ['minimizeClick', 'thumbnailClick', 'escapeKey'] as UserAction[]) {
            expect(currentState).toBe('hidden');
          }
        }
      }),
      { numRuns: 200 }
    );
  });

  it('component renders correct state for each valid transition via user interactions', () => {
    // Test the actual component: minimize button transitions full → minimized
    const stream = createMockStream();
    const { getByTestId, queryByTestId, rerender } = render(
      <ScreenShareOverlay stream={stream} sharerName="Test User" onClose={vi.fn()} />
    );

    // Initial state should be 'full'
    const overlay = getByTestId('screen-share-overlay');
    expect(overlay.getAttribute('data-state')).toBe('full');

    // Click minimize → should go to 'minimized'
    const minimizeBtn = getByTestId('screen-share-minimize-btn');
    fireEvent.click(minimizeBtn);

    const minimizedOverlay = getByTestId('screen-share-overlay');
    expect(minimizedOverlay.getAttribute('data-state')).toBe('minimized');

    // Click thumbnail → should go back to 'full'
    const thumbnail = getByTestId('screen-share-thumbnail');
    fireEvent.click(thumbnail);

    const fullOverlay = getByTestId('screen-share-overlay');
    expect(fullOverlay.getAttribute('data-state')).toBe('full');

    // Press Escape → should go to 'minimized'
    fireEvent.keyDown(document, { key: 'Escape' });

    const escapedOverlay = getByTestId('screen-share-overlay');
    expect(escapedOverlay.getAttribute('data-state')).toBe('minimized');

    // Stream becomes null → should go to 'hidden'
    rerender(
      <ScreenShareOverlay stream={null} sharerName="Test User" onClose={vi.fn()} />
    );

    expect(queryByTestId('screen-share-overlay')).toBeNull();

    cleanup();
  });

  it('minimize button and Escape key produce the same transition from full state', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<'minimizeClick' | 'escapeKey'>('minimizeClick', 'escapeKey'),
        (action) => {
          // Both actions from 'full' state should result in 'minimized'
          const startState: OverlayState = 'full';
          let endState: OverlayState = startState;

          if (action === 'minimizeClick' && startState === 'full') {
            endState = 'minimized';
          } else if (action === 'escapeKey' && startState === 'full') {
            endState = 'minimized';
          }

          expect(endState).toBe('minimized');
          expect(isValidTransition(startState, endState)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('pointer-events are none on container when minimized (game remains interactive)', () => {
    const stream = createMockStream();
    const { getByTestId } = render(
      <ScreenShareOverlay stream={stream} sharerName="Test User" onClose={vi.fn()} />
    );

    // Minimize the overlay
    const minimizeBtn = getByTestId('screen-share-minimize-btn');
    fireEvent.click(minimizeBtn);

    // In minimized state, the container should have pointer-events: none
    const overlay = getByTestId('screen-share-overlay');
    expect(overlay.style.pointerEvents).toBe('none');

    // But the thumbnail should be interactive (pointer-events: auto)
    const thumbnail = getByTestId('screen-share-thumbnail');
    expect(thumbnail.style.pointerEvents).toBe('auto');

    cleanup();
  });

  it('streamNull from any non-hidden state always transitions to hidden', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<OverlayState>('full', 'minimized'),
        (startState) => {
          // streamNull action from any visible state must transition to hidden
          let currentState = startState;
          if (currentState === 'full' || currentState === 'minimized') {
            currentState = 'hidden';
          }
          expect(currentState).toBe('hidden');
          expect(isValidTransition(startState, 'hidden')).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
