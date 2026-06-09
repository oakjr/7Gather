# Implementation Plan: Space Theme Room Decoration

## Overview

This plan transforms the 7Gather virtual office into a futuristic 8-bit space station. Implementation progresses from asset generation (tileset + map), through client-side rendering extensions (Objects layer collision, doors, background), to server-side state management (room lock, floor color). Each task builds incrementally so there is no orphaned code.

## Tasks

- [x] 1. Update tileset generator with space-themed tiles
  - [x] 1.1 Rewrite `scripts/generate-tileset.js` to produce all space-themed tiles
    - Replace current color scheme with space theme palette (dark backgrounds, metallic walls, purple zones)
    - Generate tile index 0: dark space ground with 3-10 star dots
    - Generate tile index 1: corridor floor with grid-line pattern (lines spaced 4-8px apart)
    - Generate tile index 2: wall tile with panel seams (≥2 lines) and rivets (≥4 dots), cool-tone palette, seamless tiling
    - Generate tile index 10: private zone floor with purple/violet base (80-120, 60-90, 140-180) and lighter center gradient
    - Generate tile index 11: zone detection tile (unchanged behavior)
    - Generate tile index 12: desk with notebook (collide: true)
    - Generate tile index 13: futuristic chair (no collision)
    - Generate tile index 14: meeting table segment (collide: true)
    - Generate tile index 15: closed door (two panels meeting at center, doorState: "closed")
    - Generate tile index 16: open door (panels retracted to edges, doorState: "open")
    - Generate tile index 17: space window (frame with stars/celestial elements)
    - Generate tile indices 18-23: 2-6 decorative objects (control panels, server racks, etc., mixed collision)
    - Output 256x256 PNG as 8x8 grid of 32x32 tiles to `public/maps/tileset.png`
    - Include tileset `tiles` array with collide and doorState properties as per design
    - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 2.4, 3.1, 4.1, 5.1, 6.1, 8.1, 8.2, 9.1, 10.1, 10.2, 10.3, 11.1, 11.3, 12.1, 12.2, 12.4, 12.6_

  - [x] 1.2 Write unit tests for tileset generator output
    - Verify output PNG is exactly 256x256
    - Verify tile 0 has ≥80% dark pixels and 3-10 star dots
    - Verify tile 2 uses cool-tone palette with panel seams and rivets
    - Verify tile 10 has purple base with lighter center
    - Verify collision properties are correctly assigned in the tiles array
    - Verify doorState properties on tiles 15 and 16
    - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 10.1, 10.2, 10.3, 12.6_

- [x] 2. Update map generator with furniture placement and ObjectsTiles layer
  - [x] 2.1 Rewrite `scripts/generate-map.js` to produce updated 5-layer map
    - Maintain existing room layout (16 private rooms + 1 meeting room, 50x40 grid)
    - Ground layer: space ground (index 0) everywhere, corridor tiles (index 1) in hallways
    - Physics layer: walls (index 2), zone tiles (index 11), desk tiles (index 12), meeting table tiles (index 14)
    - Add new `ObjectsTiles` tilelayer: door tiles (index 15), chair tiles (index 13), decoratives (18+)
    - Objects objectgroup: zone definitions unchanged
    - Top layer: space window tiles (index 17) on back walls of each private room (center of wall opposite doorway)
    - Place one desk per private room at relative position (col 2, row 1), shifted inward if doorway conflicts
    - Place one chair adjacent to each desk, opposite side from doorway, oriented per door direction
    - Place meeting table (4x2 to 8x4) centered in meeting room with ≥1 tile margin on each side
    - Place 8-16 meeting room chairs adjacent to table perimeter across ≥3 sides, avoiding doorways
    - Place closed door tiles (index 15) at every 2-tile-wide doorway on ObjectsTiles layer
    - Place 8+ decorative objects in corridors (max 3 per corridor segment)
    - Ensure all doorways remain reachable via BFS pathfinding after object placement
    - Update tileset definition in JSON with all tile properties (collide, doorState, jitsiRoom)
    - _Requirements: 1.3, 4.2, 4.4, 4.5, 5.2, 5.4, 5.5, 6.2, 6.4, 6.5, 7.1, 7.2, 7.4, 9.2, 9.3, 9.4, 10.4, 11.2, 11.4, 12.3_

  - [x] 2.2 Write unit tests for map generator output
    - Verify 16 private rooms each have exactly 1 desk on Physics layer
    - Verify each private room has exactly 1 chair on ObjectsTiles layer adjacent to desk
    - Verify meeting table is centered in meeting room with correct size range
    - Verify 8-16 meeting chairs placed on ≥3 sides avoiding doorways
    - Verify door tiles placed at all 2-tile-wide doorways on ObjectsTiles layer
    - Verify ≥8 decorative objects in corridors, max 3 per segment
    - Verify space windows placed on Top layer at center of back walls
    - Verify BFS reachability between all doorways
    - _Requirements: 4.2, 4.4, 5.2, 6.2, 6.4, 7.1, 7.2, 9.2, 9.3, 11.2, 12.3_

  - [x] 2.3 Write property test for doorway reachability (Property 4)
    - **Property 4: Doorway reachability after object placement**
    - Use fast-check to generate varying decorative placements
    - Verify BFS from any room doorway to any other doorway always finds a valid path
    - **Validates: Requirements 9.3**

- [x] 3. Extend TiledMapManager for Objects layer collision and door tracking
  - [x] 3.1 Add ObjectsTiles layer loading and collision detection in `TiledMapManager.ts`
    - Load `ObjectsTiles` as a tile layer in `loadMap()` with graceful fallback if missing
    - Set collision on ObjectsTiles layer for tiles with `collide: true` property
    - Extend `isColliding()` to check ObjectsTiles layer in addition to Physics layer
    - Add `getObjectsTileLayer()` method returning the ObjectsTiles layer
    - Set correct depth values on all layers per architecture (Ground=1, Physics=2, ObjectsTiles=3, Top=5)
    - _Requirements: 2.3, 8.3, 8.4, 8.5, 10.4_

  - [x] 3.2 Add door tile detection and state management methods
    - Implement `getDoorTiles(): DoorTile[]` scanning ObjectsTiles for tiles with `doorState` property
    - Implement `setDoorState(tileX, tileY, open: boolean)` to swap tile indices on ObjectsTiles layer
    - Store door tile entries with closedIndex, openIndex, tileX, tileY, isOpen
    - Identify open/closed indices from tileset tile properties (doorState: "closed" / "open")
    - _Requirements: 12.5, 12.6, 13.7_

  - [x] 3.3 Add floor tint application methods
    - Implement `applyFloorTint(zone: PrivateZone, color: number)` to tint all zone floor tiles (index 10) within zone bounds
    - Implement `clearFloorTint(zone: PrivateZone)` to reset tint to default
    - Use Phaser `tile.tint` API for runtime colorization
    - _Requirements: 16.9, 16.10_

  - [x] 3.4 Write property tests for collision system (Properties 1 & 2)
    - **Property 1: Collision tiles block movement**
    - **Property 2: Non-collision tiles allow passage**
    - Use fast-check to generate random tile maps with various collide/non-collide tiles
    - Verify isColliding returns true for collide tiles and does not return true for non-collide tiles on ObjectsTiles (unless Physics layer blocks)
    - **Validates: Requirements 2.3, 3.2, 4.3, 5.3, 6.3, 7.3, 8.3, 8.4, 8.5**

  - [x] 3.5 Write property test for door tile detection (Property 5)
    - **Property 5: Door tile detection completeness**
    - Use fast-check to generate ObjectsTiles layers with door tiles at random positions
    - Verify getDoorTiles returns entries for every tile with doorState property
    - **Validates: Requirements 12.5**

  - [x] 3.6 Write property test for zone detection (Property 3)
    - **Property 3: Zone detection correctness**
    - Use fast-check to generate zone tile configurations within zone rectangles
    - Verify detectPrivateZones produces correct PrivateZone records
    - **Validates: Requirements 3.3**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement DoorAnimationSystem
  - [x] 5.1 Create `src/client/game/DoorAnimationSystem.ts`
    - Implement DoorAnimationSystem class with constructor taking TiledMapManager and ObjectsTiles layer
    - Implement `update(localAvatarTileX, localAvatarTileY, remotePositions)` method
    - For each door: compute Manhattan distance to all avatar positions (local + remote)
    - If any avatar within Manhattan distance ≤ 1 of a closed door → swap to open index via mapManager.setDoorState
    - If all avatars beyond Manhattan distance > 2 of an open door → swap to closed index
    - Tile swap is immediate (within single frame, well under 300ms)
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8_

  - [x] 5.2 Write property test for door proximity opens (Property 6)
    - **Property 6: Door proximity opens**
    - Use fast-check to generate random avatar positions and closed door positions
    - Verify: if any avatar Manhattan distance ≤ 1 from closed door, door becomes open after update
    - **Validates: Requirements 13.1, 13.4, 13.6**

  - [x] 5.3 Write property test for door distance closes (Property 7)
    - **Property 7: Door distance closes**
    - Use fast-check to generate random avatar positions and open door positions
    - Verify: if all avatars Manhattan distance > 2 from open door, door becomes closed after update
    - **Validates: Requirements 13.2**

- [x] 6. Implement SpaceBackground
  - [x] 6.1 Create `src/client/game/SpaceBackground.ts`
    - Implement SpaceBackground class with constructor(scene, mapWidth, mapHeight)
    - Create dark background rectangle (RGB ≤ 15,15,30) at depth 0, extending beyond map bounds
    - Scatter 40-120 stars at randomized world positions (1-3px size, white/light-blue tint)
    - Implement star twinkle animation: individual stars pulse opacity (100% → 20% → 100%) over 400-800ms
    - Twinkle triggers at randomized intervals (500-3000ms), max 3 concurrent twinkles enforced
    - Implement comet animation: 4-8px sprite moving diagonally across background, interval 8-20s, duration 2-4s
    - All elements at depth lower than tile layers (depth 0)
    - Stars and background fixed in world coordinates (not camera-relative)
    - Implement create() and update(time, delta) methods, plus destroy() for cleanup
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7_

  - [x] 6.2 Write property test for max concurrent twinkles (Property 9)
    - **Property 9: Maximum concurrent twinkle animations**
    - Use fast-check to simulate time progression with randomized twinkle triggers
    - Verify that at no point more than 3 stars are simultaneously in twinkle state
    - **Validates: Requirements 15.4**

- [x] 7. Integrate door animation and space background into GameScene
  - [x] 7.1 Update `src/client/game/GameScene.ts` to use DoorAnimationSystem and SpaceBackground
    - Import and instantiate SpaceBackground in create() before map loading (depth 0)
    - Import and instantiate DoorAnimationSystem in create() after map loading
    - In update(), call SpaceBackground.update(time, delta)
    - In update(), call DoorAnimationSystem.update() with local avatar tile position and all remote positions
    - Remove camera bounds constraint to allow viewing space background beyond map edges
    - Ensure layer depth ordering matches architecture (Background=0, Ground=1, Physics=2, Objects=3, Avatars=4, Top=5)
    - _Requirements: 1.3, 10.4, 13.1, 13.8, 15.1, 15.6_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement server-side room lock and floor color state
  - [x] 9.1 Add ZoneStateSchema and extend RoomState in `src/server/state/RoomState.ts`
    - Create ZoneStateSchema class with @type decorators: zoneId (string), isLocked (boolean), ownerSessionId (string), floorColorIndex (int8, default -1)
    - Add `zones: MapSchema<ZoneStateSchema>` field to RoomState
    - _Requirements: 14.9, 16.6_

  - [x] 9.2 Add FLOOR_COLORS constant to `src/shared/constants.ts`
    - Add the 18 predefined hex color values as a readonly array
    - Add FLOOR_COLOR_COUNT = 18 constant
    - _Requirements: 16.3_

  - [x] 9.3 Add lock_room, unlock_room, and set_floor_color message handlers in `src/server/rooms/SpatialRoom.ts`
    - Implement "lock_room" handler: validate sender is zone owner, set isLocked=true on ZoneStateSchema
    - Implement "unlock_room" handler: validate sender is zone owner, set isLocked=false
    - Implement "set_floor_color" handler: validate sender is owner, validate index 0-17 integer, update floorColorIndex
    - Extend "move" handler: reject movement into locked zone tiles for non-owners, send "room_locked" notification
    - Allow owner to enter their own locked room without restriction
    - On owner disconnect timeout: unlock the room after RECONNECT_TIMEOUT_MS
    - Initialize ZoneStateSchema entries for all zones on room creation
    - _Requirements: 14.3, 14.4, 14.5, 14.7, 14.8, 14.9, 14.10, 16.5, 16.6, 16.7, 16.8_

  - [x] 9.4 Write property test for locked room access control (Property 8)
    - **Property 8: Locked room access control**
    - Use fast-check to generate random player sessions, room ownership, lock states, and movement targets
    - Verify: movement into locked zone accepted iff sender is owner; non-owner rejected with position unchanged
    - **Validates: Requirements 14.5, 14.7**

  - [x] 9.5 Write property test for floor color validation (Property 10)
    - **Property 10: Floor color change validation**
    - Use fast-check to generate random session IDs, ownership mappings, and color indices
    - Verify: change accepted iff sender is owner AND index in 0-17; all others rejected
    - **Validates: Requirements 16.6, 16.7, 16.8**

- [x] 10. Implement Padlock Icon UI component
  - [x] 10.1 Create `src/client/ui/components/PadlockIcon.tsx`
    - Implement PadlockIcon React component displaying lock/unlock icon
    - Show red (#FF4444) when locked, grey (#888888) when unlocked
    - onClick triggers onToggle callback
    - Only render when user has a home room defined
    - Send lock_room/unlock_room message to server via ColyseusClient within 500ms of click
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [x] 10.2 Write unit tests for PadlockIcon component
    - Test renders correctly in locked/unlocked states with correct colors
    - Test does not render when no home room defined
    - Test onClick fires onToggle
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

- [x] 11. Implement Floor Color Picker UI component
  - [x] 11.1 Create `src/client/ui/components/FloorColorPicker.tsx`
    - Implement FloorColorPicker React component displaying 18 color swatches as a grid
    - Import FLOOR_COLORS from shared constants
    - Highlight currently active swatch with visible border (not color-only distinction)
    - onClick on swatch calls onSelectColor(index) callback
    - Send set_floor_color message to server within 500ms of selection
    - Only render when user has a home room defined
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

  - [x] 11.2 Write unit tests for FloorColorPicker component
    - Test renders exactly 18 swatches
    - Test highlights active color with distinguishable border
    - Test does not render when no home room
    - Test onClick fires with correct color index
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

- [x] 12. Integrate server state with GameScene (lock indicator + floor tint)
  - [x] 12.1 Update `GameScene.ts` to listen for zone state changes from Colyseus
    - Listen for ZoneStateSchema changes on the room state `zones` map
    - When isLocked changes: display/remove lock indicator (red padlock overlay) on locked room's doorway tiles
    - When floorColorIndex changes: call mapManager.applyFloorTint or clearFloorTint for the affected zone
    - Apply tint on initial state sync (scene load) for zones with non-default floorColorIndex
    - _Requirements: 14.6, 16.9, 16.10, 16.11_

- [x] 13. Wire Sidebar UI to display PadlockIcon and FloorColorPicker
  - [x] 13.1 Update Sidebar component to include PadlockIcon and FloorColorPicker
    - Add PadlockIcon adjacent to home room name ("Minha Sala") when home room is defined
    - Add FloorColorPicker below PadlockIcon in the "Minha Sala" section
    - Connect components to ColyseusClient for sending messages
    - Read current lock/color state from Colyseus synchronized state
    - _Requirements: 14.1, 14.2, 16.1, 16.2_

- [x] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check
- Unit tests validate specific examples and edge cases
- The project uses TypeScript with Vitest for testing
- fast-check must be installed as a dev dependency before running property tests

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3"] },
    { "id": 4, "tasks": ["3.4", "3.5", "3.6", "5.1", "6.1", "9.1", "9.2"] },
    { "id": 5, "tasks": ["5.2", "5.3", "6.2", "9.3"] },
    { "id": 6, "tasks": ["7.1", "9.4", "9.5", "10.1", "11.1"] },
    { "id": 7, "tasks": ["10.2", "11.2", "12.1"] },
    { "id": 8, "tasks": ["13.1"] }
  ]
}
```
