# Requirements Document

## Introduction

This feature redesigns the 7Gather virtual office with an 8-bit space theme. The map receives a futuristic aesthetic with space-themed floor tiles, walls styled as spaceship/station corridors, and decorative objects placed throughout the rooms and common areas. Each private room contains a desk with a notebook and a chair, while the meeting room features a large table surrounded by many chairs. Objects follow collision rules: solid furniture (desks, tables) blocks avatar movement, while chairs allow avatars to pass through them freely.

## Glossary

- **Tileset_Generator**: The script (`scripts/generate-tileset.js`) responsible for producing the tileset PNG with all tile graphics used in the map
- **Map_Generator**: The script (`scripts/generate-map.js`) responsible for producing the Tiled JSON map (`public/maps/default.json`) with layer data and object definitions
- **TiledMapManager**: The client-side class that loads tile maps, handles rendering layers, and manages collision detection
- **Physics_Layer**: The Tiled map layer that defines collision and zone tiles (wall tiles block movement, zone tiles define private areas)
- **Objects_Layer**: The Tiled map layer used for decorative objects and zone definitions that render above the ground
- **Top_Layer**: The Tiled map layer rendered above avatars for visual depth (e.g., wall tops, overhanging elements)
- **Collision_Tile**: A tile marked with the `collide: true` property that prevents avatar traversal
- **Passthrough_Object**: A decorative tile placed on the Objects layer without collision properties, allowing avatar movement through it
- **Space_Theme**: An 8-bit pixel-art aesthetic inspired by outer space, featuring dark backgrounds with stars, metallic surfaces, neon accents, and futuristic elements
- **Desk_Object**: A furniture composition consisting of a desk surface with a notebook (laptop) on top, occupying one or more tiles
- **Chair_Object**: A seat tile that avatars can walk through without collision
- **Meeting_Table**: A large table occupying multiple tiles in the center of the meeting room, blocking avatar movement
- **GameScene**: The main Phaser scene that initializes the map, handles input, and manages avatar rendering
- **Space_Window_Tile**: A decorative tile depicting a view of outer space (stars, nebulae) placed on the back wall of private rooms for visual effect only, with no collision or gameplay impact
- **Door_Tile**: A tile depicting futuristic sliding-panel doors (8-bit space station style) placed at room doorway openings on the Objects layer
- **Door_Animation**: A visual animation sequence where door tiles slide apart horizontally or vertically when an avatar approaches the doorway proximity threshold
- **Proximity_Threshold**: The distance in tiles (1 tile) at which an avatar triggers door-opening animations upon approaching a doorway
- **Room_Lock**: A feature that allows a home room owner to toggle their room between locked (no entry by others) and unlocked (open) states
- **Padlock_Icon**: A UI element in the sidebar next to the home room name that indicates and toggles the room lock state (red when locked, default color when unlocked)
- **Sidebar**: The client-side UI panel displaying room information including the home room name ("Minha Sala") and associated controls
- **Space_Background**: The visual area rendered behind and beyond the tile map boundaries, depicting deep outer space with scattered stars, visible when the camera shows regions outside the map edges
- **Star_Twinkle_Animation**: A subtle opacity or brightness pulse applied to individual star graphics in the Space_Background at randomized intervals, so that stars blink one at a time rather than simultaneously
- **Comet_Animation**: A small animated sprite or graphic that traverses the Space_Background at infrequent random intervals, simulating a comet passing through the visible space area
- **Floor_Color_Picker**: A UI element in the Sidebar "Minha Sala" section that displays a grid of 18 selectable color swatches, allowing the home room owner to choose a custom floor tint for their private room
- **Floor_Color_Index**: A numeric value (0–17) representing one of 18 predefined 8-bit space-themed floor colors, stored in the Colyseus RoomState and used by GameScene to apply a tint to zone floor tiles
- **Tile_Tint**: The Phaser tint property applied to individual tilemap tiles at runtime to colorize them without requiring separate tile graphics in the tileset

## Requirements

### Requirement 1: Space-Themed Ground Tiles

**User Story:** As a user, I want to see a space-themed floor when moving my avatar, so that the environment feels like a futuristic space station.

#### Acceptance Criteria

1. THE Tileset_Generator SHALL produce a ground tile at tile index 0 with a background where at least 80% of pixels have RGB values in the dark range (R ≤ 40, G ≤ 40, B ≤ 80) and include between 3 and 10 single-pixel or 2x2-pixel lighter-colored dots representing stars, rendered in 8-bit pixel art style within a 32x32 pixel tile
2. THE Tileset_Generator SHALL produce a corridor ground tile at a dedicated tile index (distinct from tile index 0) using a repeating grid-line pattern with lines spaced 4 to 8 pixels apart, where grid lines differ from the background color by at least 30 RGB units in at least one channel, rendered in 8-bit pixel art style within a 32x32 pixel tile
3. WHEN the map is rendered, THE GameScene SHALL display ground tiles from the tileset on every cell of the Ground tile layer such that no cell in the Ground layer is left empty or shows a default/fallback color
4. THE Tileset_Generator SHALL output the tileset as a single 256x256 pixel PNG file organized as an 8x8 grid of 32x32 pixel tiles, saved to the path public/maps/tileset.png

### Requirement 2: Space-Themed Wall Tiles

**User Story:** As a user, I want walls to look like spaceship hull segments, so that the environment maintains a cohesive 8-bit space aesthetic.

#### Acceptance Criteria

1. THE Tileset_Generator SHALL produce wall tiles at tile index 2 as 32×32 pixel art panels containing at least 2 horizontal or vertical straight lines (panel seams) and at least 4 single-pixel dots (rivets) distributed across the tile area, using no more than 8 distinct colors total
2. THE Tileset_Generator SHALL produce wall tiles using a palette limited to cool-tone hues (grays with RGB values where R≤130 and B≥R, dark blues with B≥150 and R≤80, or teals with G≥100 and B≥100 and R≤80), with up to 2 accent pixels per tile permitted in higher-saturation values (S≥70% in HSL) for highlight details
3. WHEN a wall tile is rendered, THE TiledMapManager SHALL block avatar movement at that tile position by applying collision via setCollisionByExclusion on the Physics layer, preserving the existing behavior where tile index 2 on the Physics layer prevents avatar entry
4. THE Tileset_Generator SHALL produce wall tiles that tile seamlessly, meaning panel lines or patterns that reach a tile edge align with the corresponding edge of an adjacent identical tile without visible discontinuity

### Requirement 3: Space-Themed Private Zone Floor Tiles

**User Story:** As a user, I want private room floors to have a distinct space-themed appearance, so that I can visually distinguish rooms from corridors.

#### Acceptance Criteria

1. THE Tileset_Generator SHALL produce the private zone floor tile at tile index 10 (0-based) in the 8x8 tileset grid using a purple/violet base color in the RGB range (80-120, 60-90, 140-180) with a lighter interior gradient (center pixels at least 15 RGB units brighter than border pixels) to create a glow effect, such that the hue differs from corridor tiles (green, index 0) by at least 60 degrees on the HSL color wheel
2. WHEN a private zone tile is rendered, THE TiledMapManager SHALL exclude tile index 11 from collision detection via setCollisionByExclusion, ensuring avatars can walk over private zone floor tiles without obstruction
3. WHEN a private zone tile is rendered, THE TiledMapManager SHALL detect private zones by scanning the Physics layer for tiles with index 11 (ZONE_TILE_INDEX constant) and matching them against Objects layer zone definitions to produce PrivateZone records with id, bounds, and tile coordinates

### Requirement 4: Desk with Notebook Object in Private Rooms

**User Story:** As a user, I want each private room to contain a desk with a notebook, so that the rooms feel like individual workstations.

#### Acceptance Criteria

1. THE Tileset_Generator SHALL produce a desk tile at a designated tile index in the 8x8 tileset grid that visually depicts an 8-bit desk surface with a notebook (laptop) on top, distinguishable from floor, wall, and zone tiles at 32x32 pixel resolution
2. THE Map_Generator SHALL place exactly one desk object tile inside each of the 16 private rooms (salas 1-16) on the Physics layer with the desk tile index
3. WHEN an avatar moves toward a desk tile position, THE TiledMapManager SHALL block the movement because the desk tile has the collide property set to true in the tileset tile definitions
4. THE Map_Generator SHALL position the desk tile at a fixed offset within each private room's 5x5 interior (at relative position column 2, row 1 from the room's interior top-left origin), ensuring the tile is at least 2 tiles away from the doorway opening
5. IF a private room's doorway is on the same wall as the desk's fixed offset position, THEN THE Map_Generator SHALL shift the desk tile one row inward toward the room center to maintain at least 1 tile of clearance from the doorway tiles

### Requirement 5: Chair Object in Private Rooms

**User Story:** As a user, I want each private room to contain a chair near the desk, so that the workspace looks complete.

#### Acceptance Criteria

1. THE Tileset_Generator SHALL produce a chair tile at a dedicated index in the 8x8 tileset grid (256×256 PNG) that visually represents a futuristic 8-bit office chair rendered as a 32×32 pixel tile with distinct coloring differentiable from floor, wall, and desk tiles
2. THE Map_Generator SHALL place exactly one chair tile on the Objects tile layer at a position orthogonally adjacent (sharing an edge, not diagonal) to the desk tile in each of the 16 private rooms (salas 1-16)
3. WHEN an avatar moves toward a chair tile position, THE TiledMapManager SHALL allow the movement by not assigning collision properties to the chair tile index in the Physics layer
4. THE Map_Generator SHALL position the chair tile on the side of the desk that does not face the room doorway, ensuring at least one walkable tile remains between the chair and the doorway opening so that entry into the room is not obstructed
5. THE Map_Generator SHALL orient each chair placement relative to the room's door direction: for rooms with south-facing doors the chair SHALL be placed north of the desk, for north-facing doors south of the desk, for east-facing doors west of the desk, and for west-facing doors east of the desk

### Requirement 6: Meeting Room Large Table

**User Story:** As a user, I want the meeting room to have a large central table, so that it looks like a proper conference space.

#### Acceptance Criteria

1. THE Tileset_Generator SHALL produce a meeting table tile at a dedicated tile index, visually distinct from wall and floor tiles, representing an 8-bit conference table segment with the `collide` property set to `true` in the tileset definition
2. THE Map_Generator SHALL place meeting table tiles arranged as a rectangular group centered within the 12x8 meeting room interior (sala-reuniao), with equal margin of at least 1 tile on each side between the table edges and the room interior walls
3. WHEN an avatar moves toward a meeting table tile position, THE TiledMapManager SHALL block the movement using the tile's `collide: true` property detected via the Physics layer collision check
4. THE Map_Generator SHALL size the meeting table to occupy a rectangular area of at least 4x2 tiles and at most 8x4 tiles within the 12x8 meeting room interior
5. THE Map_Generator SHALL place the meeting table using a single dedicated tile index repeated across all positions of the rectangular table area on the Physics layer

### Requirement 7: Meeting Room Chairs

**User Story:** As a user, I want the meeting room table to be surrounded by chairs, so that it resembles a real conference room.

#### Acceptance Criteria

1. THE Map_Generator SHALL place chair tiles on tiles directly adjacent to the meeting table perimeter in the meeting room (sala-reuniao), using the same chair tile used in private rooms
2. THE Map_Generator SHALL place at minimum 8 and at maximum 16 chair tiles distributed across at least 3 of the 4 sides of the meeting table
3. WHEN an avatar moves toward a meeting room chair tile position, THE TiledMapManager SHALL allow the movement (chair tiles have no collision)
4. THE Map_Generator SHALL NOT place any chair tile on a tile that is part of a doorway opening or directly adjacent to a doorway opening in the meeting room

### Requirement 8: Collision System for Furniture Objects

**User Story:** As a user, I want to walk through chairs but not through desks or tables, so that navigation feels natural while maintaining spatial boundaries.

#### Acceptance Criteria

1. THE Tileset_Generator SHALL assign the `collide: true` property to desk tiles and meeting table tiles in the tileset definition, where desk and meeting table are any tile indices designated as solid furniture in the tileset `tiles` array
2. THE Tileset_Generator SHALL NOT assign the `collide` property to chair tiles in the tileset definition, so that chair tile indices have no collision property or have `collide: false`
3. WHEN the map is loaded, THE TiledMapManager SHALL read tile collision properties from the Objects layer and configure Phaser arcade physics collision on tiles marked with `collide: true`, so that the avatar sprite cannot overlap those tiles
4. WHEN the map is loaded, THE TiledMapManager SHALL allow avatar passage through tiles on the Objects layer that do not have the `collide: true` property set
5. WHEN the avatar attempts to move into a tile on the Objects layer that has `collide: true`, THE TiledMapManager SHALL report that position as blocked via the `isColliding` method, in addition to existing Physics layer collision checks

### Requirement 9: Decorative Space Objects in Common Areas

**User Story:** As a user, I want the corridors and common areas to have futuristic decorative elements, so that the space feels alive and themed.

#### Acceptance Criteria

1. THE Tileset_Generator SHALL produce at minimum 2 and at most 6 decorative space-themed tiles (such as control panels, server racks, space plants, or holographic displays) as 32x32 pixel tiles matching the existing tileset grid
2. THE Map_Generator SHALL place a minimum of 8 decorative objects distributed across corridor areas and open spaces outside of private rooms and the meeting room, with no more than 3 decorative objects in any single corridor segment
3. THE Map_Generator SHALL ensure that after decorative object placement, every room doorway remains reachable from every other room doorway via at least one unobstructed path of floor tiles (no collision tiles blocking all routes)
4. WHEN a decorative tile is defined as a collision object (e.g., server rack), THE Tileset_Generator SHALL assign the collide property to that tile, and WHEN defined as passthrough (e.g., holographic display), THE Tileset_Generator SHALL leave the collide property unset

### Requirement 10: Tileset Size and Compatibility

**User Story:** As a developer, I want the new tileset to remain compatible with the existing map system, so that no rendering or loading issues occur.

#### Acceptance Criteria

1. THE Tileset_Generator SHALL produce a tileset PNG image of exactly 256x256 pixels organized as an 8x8 grid of 32x32 pixel tiles, totaling 64 tile slots
2. THE Tileset_Generator SHALL maintain tile index 0 as the ground tile, tile index 2 as the wall/collision tile, tile index 10 as the private zone tile, and tile index 11 as the zone detection tile in the Physics layer
3. THE Tileset_Generator SHALL assign furniture and decorative object tiles only to unused indices in the range 12–63, preserving reserved indices 0, 2, 10, and 11 unchanged
4. WHEN the tileset is loaded by Phaser, THE GameScene SHALL render the tilemap using the tileset key 'tileset' and tileset name 'tileset' with firstgid of 1 as defined in the Tiled JSON, and all tile layers (Ground, Physics, Top) SHALL display without missing tile warnings in the browser console
5. IF the tileset PNG file does not match the expected dimensions of 256x256 pixels, THEN THE GameScene SHALL fail to load and report the dimension mismatch to the browser console


### Requirement 11: Space Windows on Private Room Back Walls

**User Story:** As a user, I want to see space-themed windows on the back wall of each private room, so that the rooms feel immersive and connected to the outer space environment.

#### Acceptance Criteria

1. THE Tileset_Generator SHALL produce a space window tile at a single dedicated tile index in the 8x8 tileset grid (index range 12–63) that visually depicts an 8-bit window frame with a view of outer space containing at least 2 visible dots or circles representing stars or celestial elements, rendered as a 32x32 pixel tile whose dominant colors differ from the wall tile (index 2) by at least 30 RGB units in at least one channel
2. THE Map_Generator SHALL place exactly one space window tile on the back wall of each of the 16 private rooms (salas 1–16) on the Top layer at the center tile of that wall, where the back wall is the wall opposite the doorway
3. THE Tileset_Generator SHALL NOT assign the `collide` property to the space window tile in the tileset definition, ensuring the tile has no entry in the tileset's `tiles` array with a `collide: true` property
4. THE Map_Generator SHALL place the space window tile exclusively on the Top layer and SHALL NOT place it on the Physics layer, ensuring the window does not affect collision detection or avatar movement
5. WHEN the map is rendered, THE GameScene SHALL display space window tiles as static decorative elements that do not respond to pointer events, do not trigger zone transitions, and do not execute frame-by-frame animation updates

### Requirement 12: Door Tiles with Visual Opening at Room Doorways

**User Story:** As a user, I want to see futuristic 8-bit door tiles at each room's doorway, so that the rooms look like proper space station compartments.

#### Acceptance Criteria

1. THE Tileset_Generator SHALL produce a closed door tile at a dedicated tile index in the 8x8 tileset grid (range 12–63) that visually depicts two futuristic sliding panels meeting at the center, rendered as a 32x32 pixel 8-bit sprite using metallic gray and accent colors consistent with the Space_Theme palette
2. THE Tileset_Generator SHALL produce an open door tile at a separate dedicated tile index (range 12–63, distinct from the closed door tile index) depicting the same sliding panels retracted to the edges of the tile frame (panels separated), indicating an open doorway
3. THE Map_Generator SHALL place closed door tiles on the Objects tile layer at every tile position that forms a doorway opening for all 16 private rooms and the meeting room, resulting in exactly 2 closed door tiles per 2-tile-wide doorway, matching the doorway width defined in the Physics layer wall gaps
4. THE Tileset_Generator SHALL NOT assign the `collide` property to door tiles (closed or open), so that avatar movement through doorways is not blocked by door tile collision
5. WHEN the map is loaded, THE TiledMapManager SHALL scan the Objects tile layer for tiles matching the closed door tile index, and store each door's tile coordinates (tileX, tileY) in an accessible collection, so that the door animation system can look up door positions by coordinate to swap between closed and open tile indices
6. THE Tileset_Generator SHALL register the closed door tile index in the tileset `tiles` array with a custom property `doorState` set to `"closed"`, and register the open door tile index with a custom property `doorState` set to `"open"`, so that the TiledMapManager can identify door tiles by property rather than hardcoded index values

### Requirement 13: Animated Door Opening on Avatar Proximity

**User Story:** As a user, I want doors to animate open as my avatar approaches a room entrance, so that the space feels dynamic and responsive.

#### Acceptance Criteria

1. WHEN the local avatar moves within a Manhattan distance of 1 tile from a closed door tile on the Objects layer, THE GameScene SHALL trigger a door-opening animation by replacing the closed door tile index with the corresponding open door tile index on the Objects layer
2. WHEN the local avatar moves beyond a Manhattan distance of 2 tiles from an open door tile position, THE GameScene SHALL trigger a door-closing animation by replacing the open door tile index with the corresponding closed door tile index on the Objects layer
3. WHEN a proximity threshold crossing triggers a door tile swap, THE GameScene SHALL complete the tile index replacement within 300 milliseconds of the threshold being crossed
4. WHEN a remote avatar moves within a Manhattan distance of 1 tile from a closed door tile, THE GameScene SHALL trigger the same door-opening tile swap locally on each client that has the door position within its loaded map
5. THE GameScene SHALL NOT block avatar movement during door animation; avatars SHALL pass through the doorway tile regardless of whether the door tile currently displays the open or closed tile index
6. IF multiple avatars (local or remote) are within the opening threshold of 1 tile from the same door, THEN THE GameScene SHALL keep the door in the open state until all avatars have moved beyond the closing threshold of 2 tiles
7. THE GameScene SHALL identify door tiles on the Objects layer by the tile's `doorState` property set in the tileset definition, and SHALL determine the open tile index from the tileset tile properties
8. WHEN the GameScene update loop runs, THE GameScene SHALL evaluate proximity between all tracked avatar positions (local and remote) and all door tile positions using Manhattan distance in tile coordinates

### Requirement 14: Room Lock (Padlock UI and Server Enforcement)

**User Story:** As a user, I want to lock my home room so that other avatars cannot enter while I am focused, giving me privacy control over my personal space.

#### Acceptance Criteria

1. WHEN the user has a home room defined (via the Home Room system), THE Sidebar SHALL display a Padlock_Icon adjacent to the home room name ("Minha Sala") in the sidebar UI
2. WHEN the user does not have a home room defined, THE Sidebar SHALL NOT display the Padlock_Icon
3. WHEN the user clicks the Padlock_Icon while the room is unlocked, THE Sidebar SHALL toggle the room lock state to locked, change the Padlock_Icon color to red (#FF4444), and send a lock state message to the SpatialRoom server within 500 milliseconds
4. WHEN the user clicks the Padlock_Icon while the room is locked, THE Sidebar SHALL toggle the room lock state to unlocked, restore the Padlock_Icon color to the default grey (#888888), and send an unlock state message to the SpatialRoom server within 500 milliseconds
5. WHEN a non-owner avatar sends a movement message that would place them inside a locked room's zone tiles, THE SpatialRoom server SHALL reject the movement message, keep that avatar at their previous valid position, and send a "room_locked" notification message to the rejected client indicating entry was denied
6. WHEN a room's lock state changes in the Colyseus synchronized state, THE GameScene SHALL display a visual lock indicator (red padlock overlay or tinted border) on the locked room's doorway tiles so that other users can see the room is locked, and SHALL remove the indicator when the room is unlocked
7. WHEN the room owner enters their own locked room, THE SpatialRoom server SHALL allow the movement without restriction
8. IF the user locks their room while another avatar is already inside, THEN THE SpatialRoom server SHALL allow the existing avatar to remain but SHALL prevent additional non-owner avatars from entering until the room is unlocked
9. WHEN the room owner toggles the lock state, THE SpatialRoom server SHALL update the lock state in the Colyseus RoomState schema so that all connected clients receive the state change via delta synchronization
10. IF the room owner disconnects while the room is locked, THEN THE SpatialRoom server SHALL maintain the locked state for the duration of the reconnection timeout (5 seconds), and SHALL unlock the room if the owner does not reconnect within that period

### Requirement 15: Space Background Outside the Map

**User Story:** As a user, I want to see a deep space background with stars and occasional comets beyond the tile map edges, so that the space station feels like it is floating in outer space.

#### Acceptance Criteria

1. WHEN the GameScene is created, THE GameScene SHALL render a Space_Background layer behind all tile map layers (at the lowest depth value) that fills the visible camera area beyond the tile map boundaries with a dark space color (RGB values R ≤ 15, G ≤ 15, B ≤ 30)
2. WHEN the camera viewport extends beyond the tile map edges, THE GameScene SHALL display between 40 and 120 small star graphics (1 to 3 pixels in size) scattered across the Space_Background area at randomized positions, using white or light-blue tint colors
3. WHILE the GameScene is running, THE GameScene SHALL apply a Star_Twinkle_Animation to individual stars one at a time at randomized intervals between 500 and 3000 milliseconds, where each twinkle consists of an opacity transition from full opacity to 20% opacity and back over a duration of 400 to 800 milliseconds
4. WHILE the GameScene is running, THE GameScene SHALL ensure that no more than 3 stars are simultaneously in a twinkle animation state at any given frame
5. WHILE the GameScene is running, THE GameScene SHALL display a Comet_Animation consisting of a small sprite (4 to 8 pixels in length) that moves across the Space_Background in a straight diagonal path, appearing at randomized intervals between 8 and 20 seconds, traversing the visible background area over a duration of 2 to 4 seconds before disappearing
6. THE GameScene SHALL render the Space_Background, star graphics, and Comet_Animation at a depth value lower than all tile map layers, so that map content always renders on top of the background elements
7. WHEN the camera pans or zooms, THE GameScene SHALL keep the Space_Background and star positions fixed relative to the world coordinate system (not the camera viewport), so that the parallax effect remains consistent as the player moves


### Requirement 16: Custom Room Floor Color

**User Story:** As a user, I want to change the floor color of my home room from a palette of space-themed colors, so that I can personalize my private space and make it visually distinct.

#### Acceptance Criteria

1. WHEN the user has a home room defined (via the Home Room system), THE Sidebar SHALL display a Floor_Color_Picker in the "Minha Sala" section alongside the existing Padlock_Icon controls
2. WHEN the user does not have a home room defined, THE Sidebar SHALL NOT display the Floor_Color_Picker
3. THE Floor_Color_Picker SHALL present exactly 18 color options as a grid of selectable swatches, where each swatch corresponds to a predefined Floor_Color_Index (0–17) mapped to the following 8-bit space-themed hex values: deep purple (#2D1B69), cyan glow (#00E5FF), neon green (#39FF14), dark red (#8B0000), blue nebula (#1A237E), violet (#7C4DFF), magenta (#FF00FF), teal (#008080), dark orange (#FF6D00), cosmic blue (#0D47A1), emerald (#00C853), crimson (#DC143C), indigo (#3F00FF), gold (#FFD700), silver (#C0C0C0), turquoise (#00CED1), lavender (#B388FF), rose (#FF007F)
4. THE Floor_Color_Picker SHALL visually indicate the currently active Floor_Color_Index for the user's home room by rendering a visible border or highlight on the corresponding swatch, distinguishable from unselected swatches without relying solely on color
5. WHEN the user selects a color swatch in the Floor_Color_Picker, THE Sidebar SHALL send a floor color change message containing the selected Floor_Color_Index to the SpatialRoom server within 500 milliseconds
6. WHEN the SpatialRoom server receives a floor color change message, THE SpatialRoom server SHALL validate that the sender is the owner of the specified home room and that the Floor_Color_Index is an integer in the range 0–17, and SHALL update the floor color index in the Colyseus RoomState schema so that all connected clients receive the change via delta synchronization
7. IF a non-owner sends a floor color change message for a room they do not own, THEN THE SpatialRoom server SHALL reject the message and not modify the room state
8. IF the SpatialRoom server receives a floor color change message with a Floor_Color_Index outside the valid range (0–17) or of a non-integer type, THEN THE SpatialRoom server SHALL reject the message and not modify the room state
9. WHEN a floor color index change is received via Colyseus state synchronization, THE GameScene SHALL apply a Tile_Tint to all zone floor tiles (tile index 10) within the corresponding private room's bounds using the hex color mapped to the received Floor_Color_Index, replacing any previously applied tint
10. THE GameScene SHALL apply the Tile_Tint using Phaser's tile tint system (setTint on individual tiles) rather than requiring separate tile graphics for each color variant, preserving the tileset's 64-slot capacity
11. WHEN a Floor_Color_Index of null or undefined is present in the room state for a given room, THE GameScene SHALL render zone floor tiles with no tint applied (default tile appearance)
12. WHEN a client joins the room, THE GameScene SHALL read the current floor color index for each private room from the synchronized Colyseus state and apply the corresponding Tile_Tint to all zone floor tiles within that room's bounds during initial map rendering
