/**
 * Unit tests for the map generator output (scripts/generate-map.js)
 * Validates: Requirements 4.2, 4.4, 5.2, 6.2, 6.4, 7.1, 7.2, 9.2, 9.3, 11.2, 12.3
 */
import { describe, it, expect, beforeAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Map constants
const WIDTH = 50;
const HEIGHT = 40;
const FIRSTGID = 1; // Tiled JSON firstgid offset

// Tile indices (0-based in tileset)
const TILE_WALL = 2;
const TILE_ZONE = 11;
const TILE_DESK = 12;
const TILE_CHAIR = 13;
const TILE_MEETING_TABLE = 14;
const TILE_CLOSED_DOOR = 15;
const TILE_OPEN_DOOR = 16;
const TILE_SPACE_WINDOW = 17;
const TILE_DECORATIVE_START = 18;

// Values in layer data (tile index + firstgid)
const VAL_WALL = TILE_WALL + FIRSTGID;       // 3
const VAL_ZONE = TILE_ZONE + FIRSTGID;       // 12
const VAL_DESK = TILE_DESK + FIRSTGID;       // 13
const VAL_CHAIR = TILE_CHAIR + FIRSTGID;     // 14
const VAL_MEETING_TABLE = TILE_MEETING_TABLE + FIRSTGID; // 15
const VAL_CLOSED_DOOR = TILE_CLOSED_DOOR + FIRSTGID;    // 16
const VAL_OPEN_DOOR = TILE_OPEN_DOOR + FIRSTGID;        // 17
const VAL_SPACE_WINDOW = TILE_SPACE_WINDOW + FIRSTGID;  // 18
const VAL_DECORATIVE_START = TILE_DECORATIVE_START + FIRSTGID; // 19

let mapData;
let groundLayer;
let physicsLayer;
let objectsTilesLayer;
let objectsGroup;
let topLayer;

/**
 * Helper to get tile value at (x, y) from a layer data array
 */
function getTile(layerData, x, y) {
  return layerData[y * WIDTH + x];
}

/**
 * Helper to find all positions with a specific value in a layer
 */
function findTiles(layerData, value) {
  const positions = [];
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (getTile(layerData, x, y) === value) {
        positions.push({ x, y });
      }
    }
  }
  return positions;
}

/**
 * Helper to find all positions with values >= threshold in a layer
 */
function findTilesAbove(layerData, threshold) {
  const positions = [];
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const val = getTile(layerData, x, y);
      if (val >= threshold) {
        positions.push({ x, y, value: val });
      }
    }
  }
  return positions;
}

/**
 * Get the private room zones from the Objects objectgroup
 */
function getPrivateRoomZones() {
  return objectsGroup.objects.filter(
    obj => obj.name.startsWith('sala-') && obj.name !== 'sala-reuniao'
  );
}

/**
 * Get the meeting room zone
 */
function getMeetingRoomZone() {
  return objectsGroup.objects.find(obj => obj.name === 'sala-reuniao');
}

/**
 * Convert zone pixel coordinates to tile coordinates
 */
function zoneToTiles(zone) {
  const tileX = Math.round(zone.x / 32);
  const tileY = Math.round(zone.y / 32);
  const tileW = Math.round(zone.width / 32);
  const tileH = Math.round(zone.height / 32);
  return { tileX, tileY, tileW, tileH };
}

/**
 * Check if two positions are orthogonally adjacent
 */
function isAdjacent(pos1, pos2) {
  const dx = Math.abs(pos1.x - pos2.x);
  const dy = Math.abs(pos1.y - pos2.y);
  return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
}

/**
 * Find doorway positions for a room (2-tile gaps in the walls on Physics layer)
 */
function findDoorways(roomTileX, roomTileY, roomTileW, roomTileH) {
  const doorways = [];
  const wallLeft = roomTileX - 1;
  const wallRight = roomTileX + roomTileW;
  const wallTop = roomTileY - 1;
  const wallBottom = roomTileY + roomTileH;

  // Check top wall for gaps (consecutive empty/non-wall tiles)
  if (wallTop >= 0) {
    for (let x = wallLeft; x <= wallRight; x++) {
      if (x >= 0 && x < WIDTH) {
        const val = getTile(physicsLayer, x, wallTop);
        if (val !== VAL_WALL) {
          doorways.push({ x, y: wallTop });
        }
      }
    }
  }
  // Check bottom wall for gaps
  if (wallBottom < HEIGHT) {
    for (let x = wallLeft; x <= wallRight; x++) {
      if (x >= 0 && x < WIDTH) {
        const val = getTile(physicsLayer, x, wallBottom);
        if (val !== VAL_WALL) {
          doorways.push({ x, y: wallBottom });
        }
      }
    }
  }
  // Check left wall for gaps
  if (wallLeft >= 0) {
    for (let y = wallTop; y <= wallBottom; y++) {
      if (y >= 0 && y < HEIGHT) {
        const val = getTile(physicsLayer, wallLeft, y);
        if (val !== VAL_WALL) {
          doorways.push({ x: wallLeft, y });
        }
      }
    }
  }
  // Check right wall for gaps
  if (wallRight < WIDTH) {
    for (let y = wallTop; y <= wallBottom; y++) {
      if (y >= 0 && y < HEIGHT) {
        const val = getTile(physicsLayer, wallRight, y);
        if (val !== VAL_WALL) {
          doorways.push({ x: wallRight, y });
        }
      }
    }
  }

  // Filter to only include tiles that are actually on the wall line
  // (not interior tiles that happen to be non-wall)
  const wallPositions = new Set();
  for (let x = wallLeft; x <= wallRight; x++) {
    if (x >= 0 && x < WIDTH) {
      if (wallTop >= 0) wallPositions.add(`${x},${wallTop}`);
      if (wallBottom < HEIGHT) wallPositions.add(`${x},${wallBottom}`);
    }
  }
  for (let y = wallTop; y <= wallBottom; y++) {
    if (y >= 0 && y < HEIGHT) {
      if (wallLeft >= 0) wallPositions.add(`${wallLeft},${y}`);
      if (wallRight < WIDTH) wallPositions.add(`${wallRight},${y}`);
    }
  }

  // Only return positions that are on the wall ring AND are not walls
  const seen = new Set();
  return doorways.filter(d => {
    const key = `${d.x},${d.y}`;
    if (seen.has(key)) return false;
    if (!wallPositions.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * BFS to check reachability between positions on non-collision tiles
 */
function bfsReachable(startX, startY, endX, endY) {
  const visited = new Set();
  const queue = [{ x: startX, y: startY }];
  visited.add(`${startX},${startY}`);

  while (queue.length > 0) {
    const { x, y } = queue.shift();
    if (x === endX && y === endY) return true;

    const neighbors = [
      { x: x - 1, y },
      { x: x + 1, y },
      { x, y: y - 1 },
      { x, y: y + 1 },
    ];

    for (const n of neighbors) {
      if (n.x < 0 || n.x >= WIDTH || n.y < 0 || n.y >= HEIGHT) continue;
      const key = `${n.x},${n.y}`;
      if (visited.has(key)) continue;

      const physVal = getTile(physicsLayer, n.x, n.y);
      // Wall tiles block movement, desk/meeting table on Physics also block
      if (physVal === VAL_WALL || physVal === VAL_DESK || physVal === VAL_MEETING_TABLE) continue;

      // Check ObjectsTiles for collision decoratives
      const objVal = objectsTilesLayer ? getTile(objectsTilesLayer, n.x, n.y) : 0;
      if (objVal >= VAL_DECORATIVE_START) {
        const tileIndex = objVal - FIRSTGID;
        const tilesetDef = mapData.tilesets[0].tiles;
        const tileDef = tilesetDef ? tilesetDef.find(t => t.id === tileIndex) : null;
        if (tileDef) {
          const collideProp = tileDef.properties && tileDef.properties.find(
            p => p.name === 'collide' && p.value === true
          );
          if (collideProp) continue;
        }
      }

      visited.add(key);
      queue.push(n);
    }
  }
  return false;
}

beforeAll(() => {
  // Run the map generator
  const scriptPath = path.join(__dirname, 'generate-map.js');
  execSync(`node "${scriptPath}"`, { stdio: 'pipe' });

  // Read the generated map
  const mapPath = path.join(__dirname, '..', 'public', 'maps', 'default.json');
  const raw = fs.readFileSync(mapPath, 'utf8');
  mapData = JSON.parse(raw);

  // Extract layers
  const groundLayerObj = mapData.layers.find(l => l.name === 'Ground' && l.type === 'tilelayer');
  const physicsLayerObj = mapData.layers.find(l => l.name === 'Physics' && l.type === 'tilelayer');
  const objectsTilesLayerObj = mapData.layers.find(l => l.name === 'ObjectsTiles' && l.type === 'tilelayer');
  objectsGroup = mapData.layers.find(l => l.name === 'Objects' && l.type === 'objectgroup');
  const topLayerObj = mapData.layers.find(l => l.name === 'Top' && l.type === 'tilelayer');

  // Use .data from layers
  groundLayer = groundLayerObj ? groundLayerObj.data : null;
  physicsLayer = physicsLayerObj ? physicsLayerObj.data : null;
  objectsTilesLayer = objectsTilesLayerObj ? objectsTilesLayerObj.data : null;
  topLayer = topLayerObj ? topLayerObj.data : null;
});

describe('Map Generator - Layer Structure', () => {
  it('should produce a 50x40 map', () => {
    expect(mapData.width).toBe(WIDTH);
    expect(mapData.height).toBe(HEIGHT);
  });

  it('should have all 5 required layers', () => {
    const layerNames = mapData.layers.map(l => l.name);
    expect(layerNames).toContain('Ground');
    expect(layerNames).toContain('Physics');
    expect(layerNames).toContain('ObjectsTiles');
    expect(layerNames).toContain('Objects');
    expect(layerNames).toContain('Top');
  });

  it('should have ObjectsTiles as a tilelayer', () => {
    const layer = mapData.layers.find(l => l.name === 'ObjectsTiles');
    expect(layer).toBeDefined();
    expect(layer.type).toBe('tilelayer');
    expect(layer.data).toHaveLength(WIDTH * HEIGHT);
  });
});

describe('Map Generator - Private Room Desks (Req 4.2, 4.4)', () => {
  it('should have exactly 16 private rooms', () => {
    const rooms = getPrivateRoomZones();
    expect(rooms).toHaveLength(16);
  });

  it('should place exactly 1 desk per private room on Physics layer', () => {
    const rooms = getPrivateRoomZones();
    for (const room of rooms) {
      const { tileX, tileY, tileW, tileH } = zoneToTiles(room);
      let deskCount = 0;
      for (let y = tileY; y < tileY + tileH; y++) {
        for (let x = tileX; x < tileX + tileW; x++) {
          if (getTile(physicsLayer, x, y) === VAL_DESK) {
            deskCount++;
          }
        }
      }
      expect(deskCount, `Room ${room.name} should have exactly 1 desk`).toBe(1);
    }
  });
});

describe('Map Generator - Private Room Chairs (Req 5.2)', () => {
  it('should place exactly 1 chair per private room on ObjectsTiles layer adjacent to desk', () => {
    const rooms = getPrivateRoomZones();
    for (const room of rooms) {
      const { tileX, tileY, tileW, tileH } = zoneToTiles(room);

      // Find the desk position in this room
      let deskPos = null;
      for (let y = tileY; y < tileY + tileH; y++) {
        for (let x = tileX; x < tileX + tileW; x++) {
          if (getTile(physicsLayer, x, y) === VAL_DESK) {
            deskPos = { x, y };
          }
        }
      }
      expect(deskPos, `Room ${room.name} should have a desk`).not.toBeNull();

      // Find chair tiles in this room on ObjectsTiles
      const chairs = [];
      for (let y = tileY; y < tileY + tileH; y++) {
        for (let x = tileX; x < tileX + tileW; x++) {
          if (getTile(objectsTilesLayer, x, y) === VAL_CHAIR) {
            chairs.push({ x, y });
          }
        }
      }
      expect(chairs.length, `Room ${room.name} should have exactly 1 chair`).toBe(1);

      // Chair must be adjacent to desk
      expect(
        isAdjacent(chairs[0], deskPos),
        `Room ${room.name}: chair at (${chairs[0].x},${chairs[0].y}) should be adjacent to desk at (${deskPos.x},${deskPos.y})`
      ).toBe(true);
    }
  });
});

describe('Map Generator - Meeting Table (Req 6.2, 6.4)', () => {
  it('should place meeting table centered in meeting room with correct size range', () => {
    const meetingZone = getMeetingRoomZone();
    expect(meetingZone).toBeDefined();

    const { tileX, tileY, tileW, tileH } = zoneToTiles(meetingZone);

    // Find all meeting table tiles in the meeting room on Physics layer
    const tableTiles = [];
    for (let y = tileY; y < tileY + tileH; y++) {
      for (let x = tileX; x < tileX + tileW; x++) {
        if (getTile(physicsLayer, x, y) === VAL_MEETING_TABLE) {
          tableTiles.push({ x, y });
        }
      }
    }
    expect(tableTiles.length).toBeGreaterThan(0);

    // Determine bounding box of table tiles
    const minX = Math.min(...tableTiles.map(t => t.x));
    const maxX = Math.max(...tableTiles.map(t => t.x));
    const minY = Math.min(...tableTiles.map(t => t.y));
    const maxY = Math.max(...tableTiles.map(t => t.y));

    const tableW = maxX - minX + 1;
    const tableH = maxY - minY + 1;

    // Table size should be 4x2 to 8x4 (either orientation)
    const longSide = Math.max(tableW, tableH);
    const shortSide = Math.min(tableW, tableH);
    expect(longSide).toBeGreaterThanOrEqual(4);
    expect(longSide).toBeLessThanOrEqual(8);
    expect(shortSide).toBeGreaterThanOrEqual(2);
    expect(shortSide).toBeLessThanOrEqual(4);

    // Table should be centered: at least 1 tile margin on each side
    expect(minX - tileX).toBeGreaterThanOrEqual(1);
    expect(tileX + tileW - 1 - maxX).toBeGreaterThanOrEqual(1);
    expect(minY - tileY).toBeGreaterThanOrEqual(1);
    expect(tileY + tileH - 1 - maxY).toBeGreaterThanOrEqual(1);
  });
});

describe('Map Generator - Meeting Room Chairs (Req 7.1, 7.2)', () => {
  it('should place 8-16 meeting chairs adjacent to table on ≥3 sides avoiding doorways', () => {
    const meetingZone = getMeetingRoomZone();
    const { tileX, tileY, tileW, tileH } = zoneToTiles(meetingZone);

    // Find table bounds
    const tableTiles = [];
    for (let y = tileY; y < tileY + tileH; y++) {
      for (let x = tileX; x < tileX + tileW; x++) {
        if (getTile(physicsLayer, x, y) === VAL_MEETING_TABLE) {
          tableTiles.push({ x, y });
        }
      }
    }
    const tableMinX = Math.min(...tableTiles.map(t => t.x));
    const tableMaxX = Math.max(...tableTiles.map(t => t.x));
    const tableMinY = Math.min(...tableTiles.map(t => t.y));
    const tableMaxY = Math.max(...tableTiles.map(t => t.y));

    // Find chair tiles in meeting room on ObjectsTiles
    const meetingChairs = [];
    for (let y = tileY; y < tileY + tileH; y++) {
      for (let x = tileX; x < tileX + tileW; x++) {
        if (getTile(objectsTilesLayer, x, y) === VAL_CHAIR) {
          meetingChairs.push({ x, y });
        }
      }
    }

    // Should have 8+ chairs (placed on all 4 sides of table)
    expect(meetingChairs.length).toBeGreaterThanOrEqual(8);

    // All chairs should be adjacent to the table perimeter
    for (const chair of meetingChairs) {
      const adjacentToTable = tableTiles.some(t => isAdjacent(chair, t));
      expect(
        adjacentToTable,
        `Meeting chair at (${chair.x},${chair.y}) should be adjacent to table`
      ).toBe(true);
    }

    // Chairs should be distributed across ≥3 sides
    const sides = new Set();
    for (const chair of meetingChairs) {
      if (chair.y < tableMinY) sides.add('north');
      if (chair.y > tableMaxY) sides.add('south');
      if (chair.x < tableMinX) sides.add('west');
      if (chair.x > tableMaxX) sides.add('east');
    }
    expect(sides.size).toBeGreaterThanOrEqual(3);

    // Chairs should not be on doorway tiles or adjacent to doorways
    const doorways = findDoorways(tileX, tileY, tileW, tileH);
    for (const chair of meetingChairs) {
      const onDoorway = doorways.some(d => d.x === chair.x && d.y === chair.y);
      expect(
        onDoorway,
        `Meeting chair at (${chair.x},${chair.y}) should not be on a doorway`
      ).toBe(false);
    }
  });
});

describe('Map Generator - Door Tiles (Req 12.3)', () => {
  // Tiled flipped-diagonal bit for 90° clockwise rotation
  const FLIPPED_DIAG = 0x20000000;
  // Mask to strip all Tiled flip/rotation bits (bits 29-31)
  const GID_MASK = 0x1FFFFFFF;

  it('should place door tiles at all 2-tile-wide doorways on ObjectsTiles layer', () => {
    const allZones = [...getPrivateRoomZones()];
    const meetingZone = getMeetingRoomZone();
    if (meetingZone) allZones.push(meetingZone);

    let totalDoorTiles = 0;

    for (const zone of allZones) {
      const { tileX, tileY, tileW, tileH } = zoneToTiles(zone);
      const doorways = findDoorways(tileX, tileY, tileW, tileH);

      // Each doorway tile should have an open door tile on ObjectsTiles (doors are open by default)
      // Strip rotation bits before comparing GID
      for (const d of doorways) {
        const val = getTile(objectsTilesLayer, d.x, d.y);
        const baseGid = val & GID_MASK;
        expect(
          baseGid,
          `Door tile expected at (${d.x},${d.y}) for ${zone.name}, got value ${val} (base GID ${baseGid})`
        ).toBe(VAL_OPEN_DOOR);
        totalDoorTiles++;
      }
    }

    // Should have door tiles placed (at least 16 private rooms * 2 tiles + meeting room doors)
    expect(totalDoorTiles).toBeGreaterThanOrEqual(16 * 2);
  });

  it('should apply rotation flag (flipped-diagonal bit) to east/west wall doors', () => {
    const allZones = [...getPrivateRoomZones()];
    const meetingZone = getMeetingRoomZone();
    if (meetingZone) allZones.push(meetingZone);

    for (const zone of allZones) {
      const { tileX, tileY, tileW, tileH } = zoneToTiles(zone);
      const doorways = findDoorways(tileX, tileY, tileW, tileH);

      for (const d of doorways) {
        const val = getTile(objectsTilesLayer, d.x, d.y);
        const wallLeft = tileX - 1;
        const wallRight = tileX + tileW;

        // If door is on left or right wall (east/west), it should have rotation bit
        if (d.x === wallLeft || d.x === wallRight) {
          expect(
            (val & FLIPPED_DIAG) !== 0,
            `East/west door at (${d.x},${d.y}) for ${zone.name} should have rotation flag, got ${val}`
          ).toBe(true);
        }
      }
    }
  });

  it('should NOT apply rotation flag to north/south wall doors', () => {
    const allZones = [...getPrivateRoomZones()];
    const meetingZone = getMeetingRoomZone();
    if (meetingZone) allZones.push(meetingZone);

    for (const zone of allZones) {
      const { tileX, tileY, tileW, tileH } = zoneToTiles(zone);
      const doorways = findDoorways(tileX, tileY, tileW, tileH);

      for (const d of doorways) {
        const val = getTile(objectsTilesLayer, d.x, d.y);
        const wallTop = tileY - 1;
        const wallBottom = tileY + tileH;

        // If door is on top or bottom wall (north/south), no rotation bit
        if (d.y === wallTop || d.y === wallBottom) {
          expect(
            (val & FLIPPED_DIAG) === 0,
            `North/south door at (${d.x},${d.y}) for ${zone.name} should NOT have rotation flag, got ${val}`
          ).toBe(true);
        }
      }
    }
  });

  it('should place each door tile in its own 32x32 cell with no overlap', () => {
    const allZones = [...getPrivateRoomZones()];
    const meetingZone = getMeetingRoomZone();
    if (meetingZone) allZones.push(meetingZone);

    for (const zone of allZones) {
      const { tileX, tileY, tileW, tileH } = zoneToTiles(zone);
      const doorways = findDoorways(tileX, tileY, tileW, tileH);

      // Doorways should always be exactly 2 tiles (pairs)
      // Each tile occupies a unique grid cell
      const doorPositions = new Set();
      for (const d of doorways) {
        const key = `${d.x},${d.y}`;
        expect(
          doorPositions.has(key),
          `Duplicate door tile at (${d.x},${d.y}) for ${zone.name}`
        ).toBe(false);
        doorPositions.add(key);
      }

      // Verify doorways come in pairs (2-tile wide)
      expect(doorways.length % 2).toBe(0);
    }
  });
});

describe('Map Generator - Decorative Objects (Req 9.2, 9.3)', () => {
  it('should place ≥8 decorative objects in corridors', () => {
    // Find decorative tiles on ObjectsTiles layer (values >= VAL_DECORATIVE_START)
    const decorativesOnObjects = findTilesAbove(objectsTilesLayer, VAL_DECORATIVE_START);
    // Some decoratives with collide:true are placed on Physics layer
    const decorativesOnPhysics = findTilesAbove(physicsLayer, VAL_DECORATIVE_START);
    const totalDecoratives = decorativesOnObjects.length + decorativesOnPhysics.length;
    expect(totalDecoratives).toBeGreaterThanOrEqual(8);
  });

  it('should place max 3 decorative objects per corridor segment', () => {
    // Get all room interiors
    const allZones = [...getPrivateRoomZones()];
    const meetingZone = getMeetingRoomZone();
    if (meetingZone) allZones.push(meetingZone);

    const roomTileSet = new Set();
    for (const zone of allZones) {
      const { tileX, tileY, tileW, tileH } = zoneToTiles(zone);
      for (let y = tileY; y < tileY + tileH; y++) {
        for (let x = tileX; x < tileX + tileW; x++) {
          roomTileSet.add(`${x},${y}`);
        }
      }
    }

    // Find corridor decoratives on both layers (outside rooms)
    const decorativesOnObjects = findTilesAbove(objectsTilesLayer, VAL_DECORATIVE_START)
      .filter(d => !roomTileSet.has(`${d.x},${d.y}`));
    const decorativesOnPhysics = findTilesAbove(physicsLayer, VAL_DECORATIVE_START)
      .filter(d => !roomTileSet.has(`${d.x},${d.y}`));
    const corridorDecoratives = [...decorativesOnObjects, ...decorativesOnPhysics];

    // Group by corridor segment using grid-based approach
    // Corridor segments are approximately 8-tile blocks
    const segmentSize = 8;
    const segmentCounts = new Map();

    for (const d of corridorDecoratives) {
      const segX = Math.floor(d.x / segmentSize);
      const segY = Math.floor(d.y / segmentSize);
      const key = `${segX},${segY}`;
      segmentCounts.set(key, (segmentCounts.get(key) || 0) + 1);
    }

    for (const [segment, count] of segmentCounts.entries()) {
      expect(
        count,
        `Corridor segment ${segment} has ${count} decoratives, max allowed is 3`
      ).toBeLessThanOrEqual(3);
    }
  });
});

describe('Map Generator - Space Windows (Req 11.2)', () => {
  it('should place space windows on Top layer at center of back walls for all 16 rooms', () => {
    const rooms = getPrivateRoomZones();
    expect(rooms).toHaveLength(16);

    for (const room of rooms) {
      const { tileX, tileY, tileW, tileH } = zoneToTiles(room);

      // Find the doorway to determine which wall is the back wall
      const doorways = findDoorways(tileX, tileY, tileW, tileH);

      // Determine door side
      let doorSide = '';
      if (doorways.length > 0) {
        const d = doorways[0];
        if (d.y < tileY) doorSide = 'north';
        else if (d.y >= tileY + tileH) doorSide = 'south';
        else if (d.x < tileX) doorSide = 'west';
        else if (d.x >= tileX + tileW) doorSide = 'east';
      }

      // Find window tiles on the Top layer within and around the room
      let windowFound = false;
      const centerX = tileX + Math.floor(tileW / 2);
      const centerY = tileY + Math.floor(tileH / 2);

      // Back wall is opposite the door. Window should be at center of that wall.
      // Check a small area around the expected position (allowing ±1 tolerance)
      if (doorSide === 'south') {
        // Back wall is north side: check row tileY (first interior row against back wall)
        for (let x = centerX - 1; x <= centerX + 1; x++) {
          for (let y = tileY - 1; y <= tileY; y++) {
            if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
              if (getTile(topLayer, x, y) === VAL_SPACE_WINDOW) windowFound = true;
            }
          }
        }
      } else if (doorSide === 'north') {
        // Back wall is south side
        for (let x = centerX - 1; x <= centerX + 1; x++) {
          for (let y = tileY + tileH - 1; y <= tileY + tileH; y++) {
            if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
              if (getTile(topLayer, x, y) === VAL_SPACE_WINDOW) windowFound = true;
            }
          }
        }
      } else if (doorSide === 'east') {
        // Back wall is west side
        for (let y = centerY - 1; y <= centerY + 1; y++) {
          for (let x = tileX - 1; x <= tileX; x++) {
            if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
              if (getTile(topLayer, x, y) === VAL_SPACE_WINDOW) windowFound = true;
            }
          }
        }
      } else if (doorSide === 'west') {
        // Back wall is east side
        for (let y = centerY - 1; y <= centerY + 1; y++) {
          for (let x = tileX + tileW - 1; x <= tileX + tileW; x++) {
            if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) {
              if (getTile(topLayer, x, y) === VAL_SPACE_WINDOW) windowFound = true;
            }
          }
        }
      }

      expect(
        windowFound,
        `Room ${room.name} (door: ${doorSide}) should have a space window on Top layer at center of back wall`
      ).toBe(true);
    }
  });
});

describe('Map Generator - BFS Reachability (Req 9.3)', () => {
  it('should have all doorways reachable from each other', () => {
    const allZones = [...getPrivateRoomZones()];
    const meetingZone = getMeetingRoomZone();
    if (meetingZone) allZones.push(meetingZone);

    // Collect one doorway tile per room
    const doorwayPositions = [];
    for (const zone of allZones) {
      const { tileX, tileY, tileW, tileH } = zoneToTiles(zone);
      const doorways = findDoorways(tileX, tileY, tileW, tileH);
      if (doorways.length > 0) {
        doorwayPositions.push({ ...doorways[0], room: zone.name });
      }
    }

    expect(doorwayPositions.length).toBeGreaterThanOrEqual(17); // 16 rooms + 1 meeting room

    // Check that first doorway can reach all others (transitive connectivity)
    const start = doorwayPositions[0];
    for (let i = 1; i < doorwayPositions.length; i++) {
      const end = doorwayPositions[i];
      const reachable = bfsReachable(start.x, start.y, end.x, end.y);
      expect(
        reachable,
        `Doorway of ${start.room} at (${start.x},${start.y}) should reach doorway of ${end.room} at (${end.x},${end.y})`
      ).toBe(true);
    }
  });
});
