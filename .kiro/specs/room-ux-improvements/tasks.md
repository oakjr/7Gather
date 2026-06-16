# Implementation Plan: Room UX Improvements

## Overview

This plan implements 10 UX improvements across the 7Gather platform: UI polish (media toggle feedback, screen share minimize, settings cancel), social features (call participant, persist status, avatar status indicator), and bug fixes (floor color, room lock, room reset, door rendering). Changes span React UI components, Phaser game scene, Colyseus server state/handlers, and asset generation scripts.

## Tasks

- [x] 1. Shared types, constants, and state schema updates
  - [x] 1.1 Add shared message types and constants
    - Add `CallParticipantMessage`, `SetStatusMessage`, `CallNotificationMessage`, `CallExpiredMessage` interfaces to `src/shared/types.ts`
    - Add `STATUS_COLORS`, `CALL_TIMEOUT_MS`, `MAX_VISIBLE_CALLS`, `SCREEN_SHARE_THUMBNAIL_WIDTH`, `SCREEN_SHARE_THUMBNAIL_HEIGHT` to `src/shared/constants.ts`
    - Add `UserStatus` type alias (`'available' | 'busy' | 'dnd'`)
    - _Requirements: 3.2, 3.4, 4.1, 5.2, 5.3, 5.4_

  - [x] 1.2 Add status field to PlayerSchema
    - Add `@type("string") status: string = "available"` field to PlayerSchema in `src/server/state/RoomState.ts`
    - _Requirements: 4.4, 5.5_

  - [x] 1.3 Write property test for status color mapping totality
    - **Property 5: Status indicator color mapping is total and correct**
    - For any status in {"available", "busy", "dnd"}, verify the color map returns exactly one correct hex color; for any undefined/null, verify default to "available" color
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.7**

- [x] 2. Media Controls toggle visual feedback
  - [x] 2.1 Update MediaControls CSS transitions and contrast
    - Add explicit `transition: background-color 100ms ease, border-color 100ms ease, color 100ms ease` to `.media-btn--on` and `.media-btn--off` in `src/client/styles/index.css`
    - Ensure border colors provide ≥3:1 contrast between active and inactive states per WCAG 1.4.11
    - Add `.media-btn--disabled` class with distinct grey styling (border-color differentiation, reduced opacity)
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 2.2 Ensure aria-pressed and disabled attribute sync in MediaControls
    - Verify `aria-pressed` is synchronized with visual toggle state in `MediaControls.tsx`
    - Add `disabled` attribute handling when browser permission is denied, preventing toggle activation
    - Apply `.media-btn--disabled` class when permission denied
    - _Requirements: 1.5, 1.6_

  - [x] 2.3 Write property test for media button state consistency
    - **Property 1: Media button visual state reflects logical state**
    - For any sequence of toggle operations on any media button, verify CSS class always corresponds to `aria-pressed` value; disabled buttons never transition to on/off
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6**

- [x] 3. Screen Share Overlay minimize feature
  - [x] 3.1 Create ScreenShareOverlay component
    - Create `src/client/ui/components/ScreenShareOverlay.tsx` with `full`, `minimized`, `hidden` states
    - Implement minimize button (top-right, 32×32 min touch target, accessible label "Minimizar compartilhamento")
    - Implement thumbnail view (max 120×80px, bottom-right, live video feed scaled to fit)
    - Add `pointer-events: none` on container when minimized (only thumbnail interactive)
    - Handle Escape key to minimize from full state
    - Handle sharing stop (stream becomes null) → transition to hidden
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 3.2 Add CSS for ScreenShareOverlay transitions
    - Add `transition: all 300ms ease` for size/position changes in `src/client/styles/index.css`
    - Style full overlay, minimized thumbnail, and hidden states
    - _Requirements: 2.2, 2.4_

  - [x] 3.3 Integrate ScreenShareOverlay into main UI
    - Wire ScreenShareOverlay to the existing screen share stream from LiveKitClient
    - Ensure GameScene remains fully interactive when overlay is minimized
    - _Requirements: 2.3, 2.5_

  - [x] 3.4 Write property test for screen share overlay state machine
    - **Property 2: Screen share overlay state machine transitions**
    - For any sequence of user interactions, verify only valid transitions occur: `full → minimized`, `minimized → full`, `full|minimized → hidden`
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Call Participant system
  - [x] 5.1 Add poke button to ParticipantList
    - Add poke icon button (�) next to each participant entry except current user in `ParticipantList.tsx`
    - Add `onPoke: (sessionId: string) => void` prop
    - Handle disconnected participant case (inline error message)
    - _Requirements: 3.1, 3.3_

  - [x] 5.2 Implement server-side call message handlers
    - Add `call_participant` message handler in `SpatialRoom.ts`
    - Validate target exists and is connected before delivering
    - Send `call_notification` to target with callerSessionId, callerName, timestamp
    - Send `call_expired` when caller leaves before response
    - _Requirements: 3.2, 3.3, 3.8_

  - [x] 5.3 Create CallNotification component
    - Create `src/client/ui/components/CallNotification.tsx`
    - Display toast with caller name, "Ir" button (🚀), elapsed time (format: "Xm Ys atrás")
    - Stack max 3 notifications (FIFO, discard oldest)
    - Update elapsed time every 1s via setInterval
    - Auto-dismiss after 60s
    - Disable "Ir" button and show "Chamador saiu da sala" when caller leaves
    - _Requirements: 3.4, 3.5, 3.6, 3.8, 3.9_

  - [x] 5.4 Wire "Ir" button to pathfinding navigation
    - On "Ir" click, call `GameScene.navigateTo(callerX, callerY)` using existing pathfinding
    - Register ColyseusClient listener for `call_notification` and `call_expired` messages
    - _Requirements: 3.7_

  - [x] 5.5 Write property test for call notification FIFO stacking
    - **Property 3: Call notification stacking respects FIFO with max 3**
    - For any sequence of N incoming calls, verify visible notifications ≤ 3 and represent the 3 most recent
    - **Validates: Requirements 3.5**

  - [x] 5.6 Write property test for call auto-dismiss after timeout
    - **Property 11: Call auto-dismiss after timeout**
    - For any call notification, verify it is dismissed after 60s without user action; no stale notifications remain
    - **Validates: Requirements 3.9**

- [x] 6. Status persistence and selector
  - [x] 6.1 Create StatusSelector component
    - Create `src/client/ui/components/StatusSelector.tsx`
    - Read from `localStorage.getItem('user_status')` on mount; validate value
    - Default to "available" if invalid or missing; persist default
    - Write to localStorage on change; silently catch write failures
    - Send `set_status` message to Colyseus on change
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

  - [x] 6.2 Add set_status server handler
    - Add `set_status` message handler in `SpatialRoom.ts`
    - Update `PlayerSchema.status` field on receive
    - Validate status is one of "available", "busy", "dnd"
    - Delta sync broadcasts to all clients within SYNC_RATE
    - _Requirements: 4.4_

  - [x] 6.3 Write property test for status persistence round trip
    - **Property 4: Status persistence round trip**
    - For any valid status written to localStorage, reading back produces the same value; for any invalid/missing value, system defaults to "available"
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [x] 7. Status indicator on avatars
  - [x] 7.1 Add status indicator to PlayerAvatar
    - Add `Phaser.GameObjects.Graphics` circle (8px diameter) to PlayerAvatar and RemoteAvatar classes in `src/client/game/PlayerAvatar.ts`
    - Position with center offset +8px right, +8px below avatar sprite center
    - Set depth to 12 (above avatar depth 10 and name label depth 11)
    - Implement `setStatus(status)` method using `STATUS_COLORS` map
    - Default to "available" color when status is undefined/null
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7_

  - [x] 7.2 Update status indicator position every frame
    - In `PlayerAvatar.update()` and `RemoteAvatar.update()`, reposition indicator relative to sprite position
    - Listen for status changes from Colyseus state sync and call `setStatus()`
    - _Requirements: 5.5, 5.8_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Fix floor color application
  - [x] 9.1 Fix floor tint to target Ground layer only
    - In `TiledMapManager.ts`, verify `applyFloorTint()` only iterates `this.groundLayer.getTilesWithin(...)` with `tile.index === 10` filter
    - Fix any code that applies tint to Physics layer or other layers
    - Verify GID offset handling (firstgid) when comparing tile indices
    - _Requirements: 6.3, 6.5_

  - [x] 9.2 Verify server-side floor color validation
    - Confirm `set_floor_color` handler validates sender is zone owner and colorIndex is in range [0, 17]
    - Add/fix rejection logic for invalid color index or non-owner sender
    - _Requirements: 6.1, 6.2, 6.4, 6.6_

  - [x] 9.3 Write property test for floor color owner authorization
    - **Property 6: Floor color owner authorization**
    - For any `set_floor_color` message, verify server accepts iff sender matches zone owner AND colorIndex ∈ [0, 17]; otherwise zone state unchanged
    - **Validates: Requirements 6.4, 6.6**

- [x] 10. Fix room lock system
  - [x] 10.1 Fix PadlockIcon toggle and lock indicator rendering
    - Ensure PadlockIcon switches SVG within a single React render cycle (locked: #FF4444, unlocked: #888888)
    - Ensure `GameScene.applyZoneLockState()` renders Lock_Indicator at depth 6 on door tiles adjacent to zone
    - Verify lock/unlock message sends within 500ms of click
    - _Requirements: 7.1, 7.3, 7.4, 7.5_

  - [x] 10.2 Fix DoorAnimationSystem locked zone handling
    - Verify `setZoneLocked(zoneId, isLocked)` is called synchronously from `applyZoneLockState()`
    - Ensure locked doors use `closedIndex`, call `setLockedDoor`, and ignore proximity triggers
    - Ensure unlock calls `clearLockedDoor` and restores proximity behavior (Manhattan distance ≤1 open, >2 close)
    - _Requirements: 7.6, 7.9_

  - [x] 10.3 Verify server-side lock authorization and movement rejection
    - Confirm `lock_room`/`unlock_room` handlers only accept from zone owner; discard non-owner silently
    - Confirm move handler rejects non-owner moves into locked zone tiles (preserve position, send `room_locked` notification)
    - Confirm owner bypass for moves into their own locked zone
    - _Requirements: 7.2, 7.7, 7.8_

  - [x] 10.4 Fix initial state handling on join/reconnect
    - Ensure `bindRoomState` processes `zones.onAdd` for initial locked zones on join/reconnect
    - Render Lock_Indicators and apply locked-door collision state before first user-movable frame
    - _Requirements: 7.10_

  - [x] 10.5 Write property test for room lock movement rejection
    - **Property 7: Room lock authorization and movement rejection**
    - For any move message targeting a locked zone tile, verify acceptance iff sender is zone owner; non-owner position unchanged
    - **Validates: Requirements 7.7, 7.8**

- [x] 11. Fix room reset (release_room)
  - [x] 11.1 Verify server-side release_room atomicity
    - Confirm `release_room` handler sets `isLocked = false`, `floorColorIndex = -1`, `ownerSessionId = ""` in one state patch cycle
    - Confirm non-owner sender is rejected silently
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6_

  - [x] 11.2 Fix client-side reaction to room reset state changes
    - Ensure `onChange` callbacks handle triple change (isLocked, floorColorIndex, ownerSessionId) correctly
    - Remove Lock_Indicators and clear floor tint within 500ms of state delta
    - _Requirements: 8.5_

  - [x] 11.3 Write property test for room reset atomicity
    - **Property 8: Room reset atomically clears all zone properties**
    - For any valid `release_room` from owner, verify resulting state has `isLocked = false`, `floorColorIndex = -1`, `ownerSessionId = ""`; non-owner messages leave state unchanged
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.6**

- [x] 12. Cancel button in Settings
  - [x] 12.1 Add Cancel button to SettingsMenu
    - Store `initialName` and `initialAvatarId` as refs on panel open in `SettingsMenu.tsx`
    - Add "Cancelar" button left of "Salvar e Reentrar"
    - On click: revert name and selectedAvatar to initial values, close panel without persisting or reloading
    - Disable "Cancelar" when form matches initial values (reduced opacity, visually distinct)
    - Re-enable when form diverges; re-disable if user manually reverts to original
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 12.2 Write property test for settings cancel revert
    - **Property 9: Settings cancel reverts to initial values**
    - For any sequence of form modifications followed by cancel, verify form state equals values captured on panel open; no localStorage writes or reloads
    - **Validates: Requirements 9.2, 9.3**

- [x] 13. Fix door rendering
  - [x] 13.1 Update generate-tileset.js for single-door sprites
    - Replace `generateClosedDoor()` with single-panel door (one panel filling full 32×32 tile)
    - Replace `generateOpenDoor()` with single-panel retracted version (panel on left edge, open space right)
    - Ensure closed (tile index 15) and open (tile index 16) each fit exactly one 32×32 slot in 256×256 tileset
    - _Requirements: 10.1, 10.6_

  - [x] 13.2 Update generate-map.js for door rotation flags
    - Apply Tiled flipped-diagonal bit (`gid | 0x20000000`) for east/west wall doors (90° clockwise)
    - Use plain GID (no rotation) for north/south wall doors
    - Ensure 2-tile-wide doorways have each tile in its own 32×32 cell with no overlap
    - _Requirements: 10.2, 10.3, 10.5_

  - [x] 13.3 Verify TiledMapManager handles rotation flags correctly
    - Confirm TiledMapManager renders door tiles on ObjectsTiles layer using rotation flags from tile data
    - Verify `detectDoorTiles()` correctly strips flip bits when comparing tile indices
    - _Requirements: 10.4_

  - [x] 13.4 Write property test for door rotation flag correctness
    - **Property 10: Door rotation flag correctness**
    - For any door on east/west wall, verify tile data includes flipped-diagonal bit (0x20000000); for any door on north/south wall, verify no rotation flags
    - **Validates: Requirements 10.2, 10.3**

- [x] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout — all implementation follows the existing project conventions
- Test files are colocated with source files per project convention

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1", "6.1", "13.1"] },
    { "id": 2, "tasks": ["2.2", "6.2", "9.1", "9.2", "13.2"] },
    { "id": 3, "tasks": ["2.3", "3.1", "5.1", "6.3", "9.3", "13.3"] },
    { "id": 4, "tasks": ["3.2", "5.2", "7.1", "10.1", "12.1", "13.4"] },
    { "id": 5, "tasks": ["3.3", "3.4", "5.3", "7.2", "10.2", "10.3", "11.1"] },
    { "id": 6, "tasks": ["5.4", "5.5", "5.6", "10.4", "10.5", "11.2", "12.2"] },
    { "id": 7, "tasks": ["11.3"] }
  ]
}
```
