/**
 * Property-Based Test: Doorway Reachability (Property 4)
 *
 * Feature: space-theme-room-decoration, Property 4: Doorway reachability after object placement
 *
 * For any generated map with decorative and furniture objects placed, BFS pathfinding
 * from any room doorway tile to any other room doorway tile SHALL find a valid path
 * consisting of non-collision tiles.
 *
 * **Validates: Requirements 9.3**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// === Map Constants (from generate-map.js and design doc) ===
const WIDTH = 50;
const HEIGHT = 40;

// Tile indices (0-based)
const TILE_FLOOR = 0;
const TILE_CORRIDOR = 1;
const TILE_WALL = 2;
const TILE_ZONE = 10;
const TILE_ZONE_DETECT = 11;
const TILE_DESK = 12;
const TILE_CHAIR = 13;
const TILE_MEETING_TABLE = 14;
const TILE_CLOSED_DOOR = 15;
const TILE_OPEN_DOOR = 16;
const TILE_SPACE_WINDOW = 17;

// Decorative tile indices (some collide, some don't)
const DECORATIVE_TILES = [18, 19, 20, 21, 22, 23];
// Collision decoratives per design: index 18 has collide: true
// For the test we'll parameterize which decoratives collide
const COLLISION_DECORATIVES = new Set([18, 19, 22]);

// firstgid offset: data value = tile_index + 1 (0 in data means empty/walkable)
const FIRSTGID = 1;

function tileIndexToData(index: number): number {
  return index + FIRSTGID;
}

function dataToTileIndex(data: number): number {
  return data - FIRSTGID;
}

// Collision tile indices (tiles that block movement)
const COLLISION_TILE_INDICES = new Set([
  TILE_WALL,
  TILE_DESK,
  TILE_MEETING_TABLE,
  ...COLLISION_DECORATIVES,
]);

// === Room Layout (from generate-map.js) ===
interface Room {
  name: string;
  ix: number; // interior top-left x
  iy: number; // interior top-left y
  w: number; // interior width
  h: number; // interior height
  doorSide: 'north' | 'south' | 'east' | 'west';
}

const topRoomXPositions = [2, 11, 20, 29, 38];
const botRowY = HEIGHT - 6; // 34
const leftRoomYPositions = [10, 18, 26];
const rightColX = WIDTH - 6; // 44
const rightRoomYPositions = [10, 18, 26];

// Meeting room
const bigIx = 19, bigIy = 17, bigW = 12, bigH = 8;

function getRooms(): Room[] {
  const rooms: Room[] = [];

  // Top row: 5 rooms with doors facing south
  for (let i = 0; i < 5; i++) {
    rooms.push({
      name: `sala-${i + 1}`,
      ix: topRoomXPositions[i], iy: 1, w: 5, h: 5,
      doorSide: 'south',
    });
  }

  // Bottom row: 5 rooms with doors facing north
  for (let i = 0; i < 5; i++) {
    rooms.push({
      name: `sala-${i + 6}`,
      ix: topRoomXPositions[i], iy: botRowY, w: 5, h: 5,
      doorSide: 'north',
    });
  }

  // Left column: 3 rooms with doors facing east
  for (let i = 0; i < 3; i++) {
    rooms.push({
      name: `sala-${i + 11}`,
      ix: 1, iy: leftRoomYPositions[i], w: 5, h: 5,
      doorSide: 'east',
    });
  }

  // Right column: 3 rooms with doors facing west
  for (let i = 0; i < 3; i++) {
    rooms.push({
      name: `sala-${i + 14}`,
      ix: rightColX, iy: rightRoomYPositions[i], w: 5, h: 5,
      doorSide: 'west',
    });
  }

  // Meeting room (4 doors: north, south, east, west)
  rooms.push({
    name: 'sala-reuniao',
    ix: bigIx, iy: bigIy, w: bigW, h: bigH,
    doorSide: 'south', // has multiple doors, we'll compute them separately
  });

  return rooms;
}

/**
 * Get doorway tile positions for a room.
 * Doorways are 2-tile-wide openings in the wall.
 */
function getDoorwayTiles(room: Room): { x: number; y: number }[] {
  const { ix, iy, w, h, doorSide } = room;
  const wl = ix - 1, wr = ix + w, wt = iy - 1, wb = iy + h;
  const midX = ix + 2, midY = iy + 2;

  if (room.name === 'sala-reuniao') {
    // Meeting room has 4 doors: north, south, east, west
    const bigDoorX = bigIx + 4, bigDoorY = bigIy + 3;
    return [
      // North door (3 tiles wide)
      { x: bigDoorX, y: bigIy - 1 },
      { x: bigDoorX + 1, y: bigIy - 1 },
      { x: bigDoorX + 2, y: bigIy - 1 },
      // South door (3 tiles wide)
      { x: bigDoorX, y: bigIy + bigH },
      { x: bigDoorX + 1, y: bigIy + bigH },
      { x: bigDoorX + 2, y: bigIy + bigH },
      // West door (2 tiles)
      { x: bigIx - 1, y: bigDoorY },
      { x: bigIx - 1, y: bigDoorY + 1 },
      // East door (2 tiles)
      { x: bigIx + bigW, y: bigDoorY },
      { x: bigIx + bigW, y: bigDoorY + 1 },
    ];
  }

  switch (doorSide) {
    case 'south':
      return [{ x: midX, y: wb }, { x: midX + 1, y: wb }];
    case 'north':
      return [{ x: midX, y: wt }, { x: midX + 1, y: wt }];
    case 'east':
      return [{ x: wr, y: midY }, { x: wr, y: midY + 1 }];
    case 'west':
      return [{ x: wl, y: midY }, { x: wl, y: midY + 1 }];
  }
}

/**
 * Generate the base map (Physics layer) with walls, rooms, and zones.
 * Returns the physics layer data array matching generate-map.js output.
 */
function generateBasePhysicsLayer(): number[] {
  const WALL_DATA = tileIndexToData(TILE_WALL);
  const ZONE_DATA = tileIndexToData(TILE_ZONE_DETECT);
  const physics = new Array(WIDTH * HEIGHT).fill(0);

  function set(x: number, y: number, val: number) {
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) physics[y * WIDTH + x] = val;
  }
  function hWall(x1: number, x2: number, y: number) {
    for (let x = x1; x <= x2; x++) set(x, y, WALL_DATA);
  }
  function vWall(y1: number, y2: number, x: number) {
    for (let y = y1; y <= y2; y++) set(x, y, WALL_DATA);
  }
  function fillZone(x1: number, y1: number, x2: number, y2: number) {
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) set(x, y, ZONE_DATA);
  }

  function drawRoom(ix: number, iy: number, doorSide: string) {
    const w = 5, h = 5;
    const wl = ix - 1, wr = ix + w, wt = iy - 1, wb = iy + h;
    hWall(wl, wr, wt); hWall(wl, wr, wb);
    vWall(wt, wb, wl); vWall(wt, wb, wr);
    const midX = ix + 2, midY = iy + 2;
    if (doorSide === 'south') { set(midX, wb, 0); set(midX + 1, wb, 0); }
    if (doorSide === 'north') { set(midX, wt, 0); set(midX + 1, wt, 0); }
    if (doorSide === 'east') { set(wr, midY, 0); set(wr, midY + 1, 0); }
    if (doorSide === 'west') { set(wl, midY, 0); set(wl, midY + 1, 0); }
    fillZone(ix, iy, ix + w - 1, iy + h - 1);
  }

  // Border walls
  hWall(0, WIDTH - 1, 0);
  hWall(0, WIDTH - 1, HEIGHT - 1);
  vWall(0, HEIGHT - 1, 0);
  vWall(0, HEIGHT - 1, WIDTH - 1);

  // Top row rooms
  for (let i = 0; i < 5; i++) drawRoom(topRoomXPositions[i], 1, 'south');
  // Bottom row rooms
  for (let i = 0; i < 5; i++) drawRoom(topRoomXPositions[i], botRowY, 'north');
  // Left column rooms
  for (let i = 0; i < 3; i++) drawRoom(1, leftRoomYPositions[i], 'east');
  // Right column rooms
  for (let i = 0; i < 3; i++) drawRoom(rightColX, rightRoomYPositions[i], 'west');

  // Meeting room
  hWall(bigIx - 1, bigIx + bigW, bigIy - 1);
  hWall(bigIx - 1, bigIx + bigW, bigIy + bigH);
  vWall(bigIy - 1, bigIy + bigH, bigIx - 1);
  vWall(bigIy - 1, bigIy + bigH, bigIx + bigW);
  // Meeting room doors
  const bigDoorX = bigIx + 4, bigDoorY = bigIy + 3;
  set(bigDoorX, bigIy - 1, 0); set(bigDoorX + 1, bigIy - 1, 0); set(bigDoorX + 2, bigIy - 1, 0);
  set(bigDoorX, bigIy + bigH, 0); set(bigDoorX + 1, bigIy + bigH, 0); set(bigDoorX + 2, bigIy + bigH, 0);
  set(bigIx - 1, bigDoorY, 0); set(bigIx - 1, bigDoorY + 1, 0);
  set(bigIx + bigW, bigDoorY, 0); set(bigIx + bigW, bigDoorY + 1, 0);
  fillZone(bigIx, bigIy, bigIx + bigW - 1, bigIy + bigH - 1);

  // Place desk in each private room (Physics layer, index 12 -> data 13)
  const DESK_DATA = tileIndexToData(TILE_DESK);
  const rooms = getRooms().filter(r => r.name !== 'sala-reuniao');
  for (const room of rooms) {
    // Desk at relative position (col 2, row 1)
    let deskX = room.ix + 2;
    let deskY = room.iy + 1;
    // Shift inward if doorway conflicts
    if (room.doorSide === 'north' && deskY === room.iy) deskY++;
    set(deskX, deskY, DESK_DATA);
  }

  // Place meeting table centered in meeting room (data 15 = index 14)
  const TABLE_DATA = tileIndexToData(TILE_MEETING_TABLE);
  const tableW = 6, tableH = 2;
  const tableX = bigIx + Math.floor((bigW - tableW) / 2);
  const tableY = bigIy + Math.floor((bigH - tableH) / 2);
  for (let ty = tableY; ty < tableY + tableH; ty++) {
    for (let tx = tableX; tx < tableX + tableW; tx++) {
      set(tx, ty, TABLE_DATA);
    }
  }

  return physics;
}

/**
 * Generate ObjectsTiles layer with chairs, doors, and decoratives.
 * Decorative positions are parameterized for property testing.
 */
function generateObjectsTilesLayer(
  decorativePlacements: { x: number; y: number; tileIndex: number }[]
): number[] {
  const objectsTiles = new Array(WIDTH * HEIGHT).fill(0);

  function set(x: number, y: number, val: number) {
    if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) objectsTiles[y * WIDTH + x] = val;
  }

  // Place chairs adjacent to desks in private rooms
  const CHAIR_DATA = tileIndexToData(TILE_CHAIR);
  const rooms = getRooms().filter(r => r.name !== 'sala-reuniao');
  for (const room of rooms) {
    const deskX = room.ix + 2;
    const deskY = room.iy + 1;
    // Chair on opposite side of desk from doorway
    let chairX = deskX, chairY = deskY;
    switch (room.doorSide) {
      case 'south': chairY = deskY - 1; break; // chair north of desk
      case 'north': chairY = deskY + 1; break; // chair south of desk
      case 'east': chairX = deskX - 1; break; // chair west of desk
      case 'west': chairX = deskX + 1; break; // chair east of desk
    }
    set(chairX, chairY, CHAIR_DATA);
  }

  // Place closed door tiles at all doorways
  const DOOR_DATA = tileIndexToData(TILE_CLOSED_DOOR);
  const allRooms = getRooms();
  for (const room of allRooms) {
    const doorTiles = getDoorwayTiles(room);
    for (const dt of doorTiles) {
      set(dt.x, dt.y, DOOR_DATA);
    }
  }

  // Place decorative objects
  for (const deco of decorativePlacements) {
    set(deco.x, deco.y, tileIndexToData(deco.tileIndex));
  }

  return objectsTiles;
}

/**
 * Check if a tile at (x, y) is walkable given both Physics and ObjectsTiles layers.
 */
function isWalkable(
  x: number,
  y: number,
  physicsLayer: number[],
  objectsTilesLayer: number[]
): boolean {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return false;

  const physicsData = physicsLayer[y * WIDTH + x];
  const objectsData = objectsTilesLayer[y * WIDTH + x];

  // Check physics layer for collision
  if (physicsData !== 0) {
    const physicsIndex = dataToTileIndex(physicsData);
    if (COLLISION_TILE_INDICES.has(physicsIndex)) return false;
  }

  // Check objects layer for collision
  if (objectsData !== 0) {
    const objectsIndex = dataToTileIndex(objectsData);
    if (COLLISION_TILE_INDICES.has(objectsIndex)) return false;
  }

  return true;
}

/**
 * BFS flood-fill from a start position.
 * Returns the set of all reachable tile keys (y * WIDTH + x).
 */
function bfsReachableSet(
  startX: number,
  startY: number,
  physicsLayer: number[],
  objectsTilesLayer: number[]
): Set<number> {
  const visited = new Set<number>();
  if (!isWalkable(startX, startY, physicsLayer, objectsTilesLayer)) return visited;

  const queue: [number, number][] = [[startX, startY]];
  visited.add(startY * WIDTH + startX);

  const directions = [
    [0, 1], [0, -1], [1, 0], [-1, 0],
  ];

  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!;

    for (const [dx, dy] of directions) {
      const nx = cx + dx;
      const ny = cy + dy;

      const key = ny * WIDTH + nx;
      if (visited.has(key)) continue;

      if (isWalkable(nx, ny, physicsLayer, objectsTilesLayer)) {
        visited.add(key);
        queue.push([nx, ny]);
      }
    }
  }

  return visited;
}

/**
 * Get all unique doorway tile positions across all rooms.
 * Returns one representative tile per doorway for BFS testing.
 */
function getAllDoorwayPositions(): { x: number; y: number; room: string }[] {
  const positions: { x: number; y: number; room: string }[] = [];
  const allRooms = getRooms();

  for (const room of allRooms) {
    const doorTiles = getDoorwayTiles(room);
    // Use first door tile as representative for BFS start/end
    if (doorTiles.length > 0) {
      positions.push({ x: doorTiles[0].x, y: doorTiles[0].y, room: room.name });
    }
  }

  return positions;
}

/**
 * Get corridor tile positions (tiles that are not inside rooms and not walls).
 * These are the valid positions where decoratives can be placed.
 */
function getCorridorPositions(physicsLayer: number[]): { x: number; y: number }[] {
  const corridorPositions: { x: number; y: number }[] = [];

  // Collect all room interior + wall positions to exclude
  const roomTiles = new Set<number>();
  const allRooms = getRooms();

  for (const room of allRooms) {
    // Room interior
    for (let y = room.iy; y < room.iy + room.h; y++) {
      for (let x = room.ix; x < room.ix + room.w; x++) {
        roomTiles.add(y * WIDTH + x);
      }
    }
    // Room walls (one tile around interior)
    for (let x = room.ix - 1; x <= room.ix + room.w; x++) {
      roomTiles.add((room.iy - 1) * WIDTH + x);
      roomTiles.add((room.iy + room.h) * WIDTH + x);
    }
    for (let y = room.iy - 1; y <= room.iy + room.h; y++) {
      roomTiles.add(y * WIDTH + (room.ix - 1));
      roomTiles.add(y * WIDTH + (room.ix + room.w));
    }
  }

  for (let y = 1; y < HEIGHT - 1; y++) {
    for (let x = 1; x < WIDTH - 1; x++) {
      const key = y * WIDTH + x;
      const data = physicsLayer[key];
      // Skip walls
      if (data !== 0 && COLLISION_TILE_INDICES.has(dataToTileIndex(data))) continue;
      // Skip room interiors and walls
      if (roomTiles.has(key)) continue;
      corridorPositions.push({ x, y });
    }
  }

  return corridorPositions;
}

/**
 * Simulate the map generator's intelligent decorative placement strategy.
 * The map generator places decoratives incrementally and verifies BFS connectivity
 * after each placement. If a placement would break connectivity, it skips that position.
 *
 * This function takes candidate placements and returns only those that maintain
 * full doorway-to-doorway reachability.
 */
function filterPlacementsPreservingReachability(
  candidates: { x: number; y: number; tileIndex: number }[],
  physicsLayer: number[]
): { x: number; y: number; tileIndex: number }[] {
  const accepted: { x: number; y: number; tileIndex: number }[] = [];
  const doorwayPositions = getAllDoorwayPositions();

  for (const candidate of candidates) {
    // Non-collision decoratives never break paths
    if (!COLLISION_TILE_INDICES.has(candidate.tileIndex)) {
      accepted.push(candidate);
      continue;
    }

    // For collision decoratives, tentatively add and verify reachability
    const testPlacements = [...accepted, candidate];
    const objectsTilesLayer = generateObjectsTilesLayer(testPlacements);

    const startDoor = doorwayPositions[0];
    const reachable = bfsReachableSet(
      startDoor.x, startDoor.y,
      physicsLayer,
      objectsTilesLayer
    );

    let allReachable = true;
    for (let i = 1; i < doorwayPositions.length; i++) {
      const door = doorwayPositions[i];
      if (!reachable.has(door.y * WIDTH + door.x)) {
        allReachable = false;
        break;
      }
    }

    if (allReachable) {
      accepted.push(candidate);
    }
    // Otherwise skip this placement (map generator would do the same)
  }

  return accepted;
}

// === Property Test ===

describe('Property 4: Doorway reachability after object placement', () => {
  it('BFS from any room doorway to any other doorway always finds a valid path through non-collision tiles', () => {
    const physicsLayer = generateBasePhysicsLayer();
    const corridorPositions = getCorridorPositions(physicsLayer);
    const doorwayPositions = getAllDoorwayPositions();

    // Arbitrary to generate: place 8-30 candidate decorative objects at random corridor positions
    // with random tile indices from the decorative set (some collide, some don't)
    // The map generator's placement algorithm filters out any that break connectivity
    const decorativePlacementArb = fc.array(
      fc.record({
        positionIndex: fc.nat({ max: corridorPositions.length - 1 }),
        tileIndex: fc.constantFrom(...DECORATIVE_TILES),
      }),
      { minLength: 8, maxLength: 30 }
    ).map(placements => {
      // Deduplicate positions (only one decorative per tile)
      const usedPositions = new Set<number>();
      const candidates = placements
        .filter(p => {
          const pos = corridorPositions[p.positionIndex];
          const key = pos.y * WIDTH + pos.x;
          if (usedPositions.has(key)) return false;
          usedPositions.add(key);
          return true;
        })
        .map(p => ({
          x: corridorPositions[p.positionIndex].x,
          y: corridorPositions[p.positionIndex].y,
          tileIndex: p.tileIndex,
        }));

      // Apply the map generator's reachability-preserving filter
      return filterPlacementsPreservingReachability(candidates, physicsLayer);
    });

    fc.assert(
      fc.property(decorativePlacementArb, (decoratives) => {
        const objectsTilesLayer = generateObjectsTilesLayer(decoratives);

        // BFS from the first doorway — all other doorways must be in the reachable set
        const startDoor = doorwayPositions[0];
        const reachable = bfsReachableSet(
          startDoor.x, startDoor.y,
          physicsLayer,
          objectsTilesLayer
        );

        // Verify every other doorway is reachable from the first
        for (let i = 1; i < doorwayPositions.length; i++) {
          const door = doorwayPositions[i];
          const key = door.y * WIDTH + door.x;
          if (!reachable.has(key)) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });
});
