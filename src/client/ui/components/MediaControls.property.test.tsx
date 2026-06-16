/**
 * Property-Based Test: Media button visual state reflects logical state (Property 1)
 *
 * Feature: room-ux-improvements, Property 1: Media button visual state reflects logical state
 *
 * For any combination of MediaControls props (isMuted, isVideoOn, isScreenSharing,
 * micPermission, cameraPermission), the CSS class applied to each button always
 * corresponds to the aria-pressed value, and disabled buttons always use
 * media-btn--disabled (never on/off).
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6**
 */
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import React from 'react';
import { render } from '@testing-library/react';
import { MediaControls, MediaPermissionState } from './MediaControls';

/** Arbitrary for permission state values */
const permissionArb = fc.constantFrom<MediaPermissionState>('granted', 'denied', 'prompt');

/** Arbitrary for all MediaControls props relevant to visual state */
const mediaPropsArb = fc.record({
  isMuted: fc.boolean(),
  isVideoOn: fc.boolean(),
  isScreenSharing: fc.boolean(),
  micPermission: permissionArb,
  cameraPermission: permissionArb,
});

describe('Property 1: Media button visual state reflects logical state', () => {
  /**
   * **Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6**
   *
   * For any combination of props, verify that each button's CSS class
   * corresponds to its aria-pressed value, and disabled buttons always
   * have media-btn--disabled class (never on/off).
   */
  it('CSS class always corresponds to aria-pressed value for all prop combinations', () => {
    fc.assert(
      fc.property(mediaPropsArb, (props) => {
        const { container } = render(
          <MediaControls
            isMuted={props.isMuted}
            isVideoOn={props.isVideoOn}
            isScreenSharing={props.isScreenSharing}
            onToggleMute={vi.fn()}
            onToggleVideo={vi.fn()}
            onToggleScreenShare={vi.fn()}
            micPermission={props.micPermission}
            cameraPermission={props.cameraPermission}
          />
        );

        const buttons = container.querySelectorAll('button.media-btn');
        expect(buttons.length).toBe(3);

        // Mic button (index 0)
        const micBtn = buttons[0];
        const micDisabled = props.micPermission === 'denied';
        const micAriaPressed = micBtn.getAttribute('aria-pressed');
        const micClassName = micBtn.className;

        if (micDisabled) {
          // Disabled buttons must have media-btn--disabled and never on/off
          expect(micClassName).toContain('media-btn--disabled');
          expect(micClassName).not.toContain('media-btn--on');
          expect(micClassName).not.toContain('media-btn--off');
          expect(micBtn.hasAttribute('disabled')).toBe(true);
        } else {
          // Non-disabled buttons: class must match aria-pressed
          expect(micClassName).not.toContain('media-btn--disabled');
          if (micAriaPressed === 'true') {
            expect(micClassName).toContain('media-btn--on');
            expect(micClassName).not.toContain('media-btn--off');
          } else {
            expect(micClassName).toContain('media-btn--off');
            expect(micClassName).not.toContain('media-btn--on');
          }
        }

        // Video button (index 1)
        const videoBtn = buttons[1];
        const videoDisabled = props.cameraPermission === 'denied';
        const videoAriaPressed = videoBtn.getAttribute('aria-pressed');
        const videoClassName = videoBtn.className;

        if (videoDisabled) {
          expect(videoClassName).toContain('media-btn--disabled');
          expect(videoClassName).not.toContain('media-btn--on');
          expect(videoClassName).not.toContain('media-btn--off');
          expect(videoBtn.hasAttribute('disabled')).toBe(true);
        } else {
          expect(videoClassName).not.toContain('media-btn--disabled');
          if (videoAriaPressed === 'true') {
            expect(videoClassName).toContain('media-btn--on');
            expect(videoClassName).not.toContain('media-btn--off');
          } else {
            expect(videoClassName).toContain('media-btn--off');
            expect(videoClassName).not.toContain('media-btn--on');
          }
        }

        // Screen share button (index 2) - never disabled by permissions
        const screenBtn = buttons[2];
        const screenAriaPressed = screenBtn.getAttribute('aria-pressed');
        const screenClassName = screenBtn.className;

        expect(screenClassName).not.toContain('media-btn--disabled');
        expect(screenBtn.hasAttribute('disabled')).toBe(false);

        if (screenAriaPressed === 'true') {
          expect(screenClassName).toContain('media-btn--on');
          expect(screenClassName).not.toContain('media-btn--off');
        } else {
          expect(screenClassName).toContain('media-btn--off');
          expect(screenClassName).not.toContain('media-btn--on');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('disabled buttons never transition to on/off states regardless of toggle state props', () => {
    fc.assert(
      fc.property(
        fc.record({
          isMuted: fc.boolean(),
          isVideoOn: fc.boolean(),
        }),
        (toggles) => {
          // When permissions are denied, buttons must always be disabled
          // regardless of what the toggle state says
          const { container } = render(
            <MediaControls
              isMuted={toggles.isMuted}
              isVideoOn={toggles.isVideoOn}
              isScreenSharing={false}
              onToggleMute={vi.fn()}
              onToggleVideo={vi.fn()}
              onToggleScreenShare={vi.fn()}
              micPermission="denied"
              cameraPermission="denied"
            />
          );

          const buttons = container.querySelectorAll('button.media-btn');

          // Mic button - always disabled regardless of isMuted value
          const micBtn = buttons[0];
          expect(micBtn.className).toContain('media-btn--disabled');
          expect(micBtn.className).not.toContain('media-btn--on');
          expect(micBtn.className).not.toContain('media-btn--off');
          expect(micBtn.hasAttribute('disabled')).toBe(true);

          // Video button - always disabled regardless of isVideoOn value
          const videoBtn = buttons[1];
          expect(videoBtn.className).toContain('media-btn--disabled');
          expect(videoBtn.className).not.toContain('media-btn--on');
          expect(videoBtn.className).not.toContain('media-btn--off');
          expect(videoBtn.hasAttribute('disabled')).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('aria-pressed is synchronized with the logical toggle state for non-disabled buttons', () => {
    fc.assert(
      fc.property(mediaPropsArb, (props) => {
        const { container } = render(
          <MediaControls
            isMuted={props.isMuted}
            isVideoOn={props.isVideoOn}
            isScreenSharing={props.isScreenSharing}
            onToggleMute={vi.fn()}
            onToggleVideo={vi.fn()}
            onToggleScreenShare={vi.fn()}
            micPermission={props.micPermission}
            cameraPermission={props.cameraPermission}
          />
        );

        const buttons = container.querySelectorAll('button.media-btn');

        // Mic: aria-pressed reflects !isMuted (mic on = not muted = pressed true)
        const micBtn = buttons[0];
        const expectedMicPressed = (!props.isMuted).toString();
        expect(micBtn.getAttribute('aria-pressed')).toBe(expectedMicPressed);

        // Video: aria-pressed reflects isVideoOn
        const videoBtn = buttons[1];
        const expectedVideoPressed = props.isVideoOn.toString();
        expect(videoBtn.getAttribute('aria-pressed')).toBe(expectedVideoPressed);

        // Screen share: aria-pressed reflects isScreenSharing
        const screenBtn = buttons[2];
        const expectedScreenPressed = props.isScreenSharing.toString();
        expect(screenBtn.getAttribute('aria-pressed')).toBe(expectedScreenPressed);
      }),
      { numRuns: 100 }
    );
  });
});
