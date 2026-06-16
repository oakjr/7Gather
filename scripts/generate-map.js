/**
 * Generate default.json - Virtual Office Map for 7Gather (Space Theme)
 * 5-layer map: Ground, Physics, ObjectsTiles, Objects (objectgroup), Top
 * Compact layout: room back walls merge with workspace border (no outer corridors)
 */
const fs = require('fs');
const path = require('path');
const { tiles } = require('./generate-tileset.js');

// Map dimensions
const WIDTH = 50;
const HEIGHT = 40;

// Tile indices (0-based in tileset; stored as index+1 in layer data due to firstgid=1)
const TILE = {
  SPACE_GROUND: 0,
  CORRIDOR: 1,
  WALL: 2,
  ZONE_FLOOR: 10,
  ZONE_DETECT: 11,
  DESK: 12,
  CHAIR: 13,
  MEETING_TABLE: 14,
  CLOSED_DOOR: 15,
  OPEN_DOOR: 16,
  SPACE_WINDOW: 17,
  // Decoratives
  CONTROL_PANEL: 18,
  SERVER_RACK: 19,
  HOLOGRAM: 20,
  SPACE_PLANT: 21,
  ANTENNA: 22,
  ENERGY_CONDUIT: 23,
};

// Convert tile index to GID (firstgid = 1, so GID = index + 1)
function gid(tileIndex) {
  return tileIndex + 1;
}

// Layer data arrays (store GIDs; 0 = empty)
const ground = new Array(WIDTH * HEIGHT).fill(gid(TILE.SPACE_GROUND));
const physics = new Array(WIDTH * HEIGHT).fill(0);
const objectsTiles = new Array(WIDTH * HEIGHT).fill(0);
const top = new Array(WIDTH * HEIGHT).fill(0);

// Helper functions
function idx(x, y) { return y * WIDTH + x; }
function inBounds(x, y) { return x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT; }

function setPhysics(x, y, tileIdx) {
  if (inBounds(x, y)) physics[idx(x, y)] = gid(tileIdx);
}
function setGround(x, y, tileIdx) {
  if (inBounds(x, y)) ground[idx(x, y)] = gid(tileIdx);
}
function setObjectsTiles(x, y, tileIdx) {
  if (inBounds(x, y)) objectsTiles[idx(x, y)] = gid(tileIdx);
}
function setTop(x, y, tileIdx) {
  if (inBounds(x, y)) top[idx(x, y)] = gid(tileIdx);
}

function hWall(x1, x2, y) { for (let x = x1; x <= x2; x++) setPhysics(x, y, TILE.WALL); }
function vWall(y1, y2, x) { for (let y = y1; y <= y2; y++) setPhysics(x, y, TILE.WALL); }
function fillZone(x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++)
    for (let x = x1; x <= x2; x++)
      setPhysics(x, y, TILE.ZONE_DETECT);
}

// Track all rooms for furniture/door placement
const rooms = [];

/**
 * Draw a room with 5x5 interior
 * @param {number} ix - interior top-left x
 * @param {number} iy - interior top-left y
 * @param {string} doorSide - 'north', 'south', 'east', 'west'
 * @param {string} name - room name for zone
 */
function drawRoom(ix, iy, doorSide, name) {
  const w = 5, h = 5;
  const wl = ix - 1, wr = ix + w, wt = iy - 1, wb = iy + h;

  // Draw walls
  hWall(wl, wr, wt);
  hWall(wl, wr, wb);
  vWall(wt, wb, wl);
  vWall(wt, wb, wr);

  // Create doorway (2-tile wide)
  const midX = ix + 2, midY = iy + 2;
  const doorTiles = [];
  if (doorSide === 'south') {
    setPhysics(midX, wb, 0); setPhysics(midX + 1, wb, 0);
    // Clear the GID (set to 0 means empty - no wall)
    physics[idx(midX, wb)] = 0; physics[idx(midX + 1, wb)] = 0;
    doorTiles.push({ x: midX, y: wb }, { x: midX + 1, y: wb });
  }
  if (doorSide === 'north') {
    physics[idx(midX, wt)] = 0; physics[idx(midX + 1, wt)] = 0;
    doorTiles.push({ x: midX, y: wt }, { x: midX + 1, y: wt });
  }
  if (doorSide === 'east') {
    physics[idx(wr, midY)] = 0; physics[idx(wr, midY + 1)] = 0;
    doorTiles.push({ x: wr, y: midY }, { x: wr, y: midY + 1 });
  }
  if (doorSide === 'west') {
    physics[idx(wl, midY)] = 0; physics[idx(wl, midY + 1)] = 0;
    doorTiles.push({ x: wl, y: midY }, { x: wl, y: midY + 1 });
  }

  // Fill zone
  fillZone(ix, iy, ix + w - 1, iy + h - 1);

  rooms.push({
    name,
    ix, iy, w, h,
    doorSide,
    doorTiles,
    wl, wr, wt, wb,
    isMeeting: false,
  });
}

// === OUTER BORDER ===
hWall(0, WIDTH - 1, 0);
hWall(0, WIDTH - 1, HEIGHT - 1);
vWall(0, HEIGHT - 1, 0);
vWall(0, HEIGHT - 1, WIDTH - 1);

// === TOP ROW: 5 rooms (back wall = top border y=0), door facing south ===
const topRoomXPositions = [2, 11, 20, 29, 38];
for (let i = 0; i < 5; i++) {
  drawRoom(topRoomXPositions[i], 1, 'south', `sala-${i + 1}`);
}

// === BOTTOM ROW: 5 rooms (back wall = bottom border), door facing north ===
const botRowY = HEIGHT - 6; // interior starts at y=34 for HEIGHT=40
for (let i = 0; i < 5; i++) {
  drawRoom(topRoomXPositions[i], botRowY, 'north', `sala-${i + 6}`);
}

// === LEFT COLUMN: 3 rooms (back wall = left border), door facing east ===
const leftRoomYPositions = [10, 18, 26];
for (let i = 0; i < 3; i++) {
  drawRoom(1, leftRoomYPositions[i], 'east', `sala-${i + 11}`);
}

// === RIGHT COLUMN: 3 rooms (back wall = right border), door facing west ===
const rightColX = WIDTH - 6; // interior starts at x=44
const rightRoomYPositions = [10, 18, 26];
for (let i = 0; i < 3; i++) {
  drawRoom(rightColX, rightRoomYPositions[i], 'west', `sala-${i + 14}`);
}

// === MEETING ROOM (centered, 12x8 interior) ===
const bigIx = 19, bigIy = 17, bigW = 12, bigH = 8;
const bigWl = bigIx - 1, bigWr = bigIx + bigW, bigWt = bigIy - 1, bigWb = bigIy + bigH;
hWall(bigWl, bigWr, bigWt);
hWall(bigWl, bigWr, bigWb);
vWall(bigWt, bigWb, bigWl);
vWall(bigWt, bigWb, bigWr);

// Meeting room has 4 doors (2-tile wide each)
const bigMidX = bigIx + 5; // center x for north/south doors
const bigMidY = bigIy + 3; // center y for east/west doors
const meetingDoorTiles = [];

// North door
physics[idx(bigMidX, bigWt)] = 0; physics[idx(bigMidX + 1, bigWt)] = 0;
meetingDoorTiles.push({ x: bigMidX, y: bigWt }, { x: bigMidX + 1, y: bigWt });

// South door
physics[idx(bigMidX, bigWb)] = 0; physics[idx(bigMidX + 1, bigWb)] = 0;
meetingDoorTiles.push({ x: bigMidX, y: bigWb }, { x: bigMidX + 1, y: bigWb });

// West door
physics[idx(bigWl, bigMidY)] = 0; physics[idx(bigWl, bigMidY + 1)] = 0;
meetingDoorTiles.push({ x: bigWl, y: bigMidY }, { x: bigWl, y: bigMidY + 1 });

// East door
physics[idx(bigWr, bigMidY)] = 0; physics[idx(bigWr, bigMidY + 1)] = 0;
meetingDoorTiles.push({ x: bigWr, y: bigMidY }, { x: bigWr, y: bigMidY + 1 });

fillZone(bigIx, bigIy, bigIx + bigW - 1, bigIy + bigH - 1);

const meetingRoom = {
  name: 'sala-reuniao',
  ix: bigIx, iy: bigIy, w: bigW, h: bigH,
  doorSide: 'all',
  doorTiles: meetingDoorTiles,
  wl: bigWl, wr: bigWr, wt: bigWt, wb: bigWb,
  isMeeting: true,
};
rooms.push(meetingRoom);

// === GROUND LAYER: corridor tiles in hallways ===
// Corridors are open tiles (not inside rooms, not walls)
// First, identify all room interiors
const roomInteriors = new Set();
for (const room of rooms) {
  for (let y = room.iy; y < room.iy + room.h; y++) {
    for (let x = room.ix; x < room.ix + room.w; x++) {
      roomInteriors.add(`${x},${y}`);
    }
  }
}

// Set corridor tiles on ground layer for all walkable non-room tiles
for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    const physGid = physics[idx(x, y)];
    const isWall = physGid === gid(TILE.WALL);
    const isRoom = roomInteriors.has(`${x},${y}`);
    if (!isWall && !isRoom) {
      // This is a corridor/hallway tile
      setGround(x, y, TILE.CORRIDOR);
    }
    // Room interiors keep space ground (index 0)
  }
}

// === FURNITURE PLACEMENT: Desks in private rooms ===
const privateRooms = rooms.filter(r => !r.isMeeting);

for (const room of privateRooms) {
  // Desk at relative position (col 2, row 1) from interior top-left
  let deskX = room.ix + 2;
  let deskY = room.iy + 1;

  // Check if doorway conflicts: shift desk inward if door is on the same side
  if (room.doorSide === 'north') {
    // Door is on north wall (top). Desk at row 1 is close to north. Shift inward.
    // Check if desk is within 2 tiles of doorway
    const doorY = room.wt; // doorway y
    if (Math.abs(deskY - doorY) < 2) {
      deskY = room.iy + 2; // shift one row inward
    }
  }

  // Place desk on Physics layer (collision)
  setPhysics(deskX, deskY, TILE.DESK);

  // Place chair adjacent to desk, opposite side from doorway
  let chairX = deskX, chairY = deskY;
  switch (room.doorSide) {
    case 'south': chairY = deskY - 1; break; // chair north of desk
    case 'north': chairY = deskY + 1; break; // chair south of desk
    case 'east':  chairX = deskX - 1; break; // chair west of desk
    case 'west':  chairX = deskX + 1; break; // chair east of desk
  }
  setObjectsTiles(chairX, chairY, TILE.CHAIR);

  // Store for reference
  room.desk = { x: deskX, y: deskY };
  room.chair = { x: chairX, y: chairY };
}

// === MEETING TABLE: centered in meeting room (6x3 - within 4x2 to 8x4 range) ===
const tableW = 6, tableH = 3;
const tableX = meetingRoom.ix + Math.floor((meetingRoom.w - tableW) / 2);
const tableY = meetingRoom.iy + Math.floor((meetingRoom.h - tableH) / 2);

// Verify margins (≥1 tile on each side)
// Left margin: tableX - meetingRoom.ix, Right margin: (meetingRoom.ix + meetingRoom.w - 1) - (tableX + tableW - 1)
// Top margin: tableY - meetingRoom.iy, Bottom margin: (meetingRoom.iy + meetingRoom.h - 1) - (tableY + tableH - 1)

for (let y = tableY; y < tableY + tableH; y++) {
  for (let x = tableX; x < tableX + tableW; x++) {
    setPhysics(x, y, TILE.MEETING_TABLE);
  }
}

// === MEETING ROOM CHAIRS: chairs on ALL sides of table (surrounding the entire table) ===
const meetingChairPositions = [];

// Generate candidate positions on each side of the table
const sides = {
  north: [], south: [], west: [], east: []
};

// North side (row above table)
for (let x = tableX; x < tableX + tableW; x++) {
  const pos = { x, y: tableY - 1 };
  if (inBounds(pos.x, pos.y)) {
    sides.north.push(pos);
  }
}
// South side (row below table)
for (let x = tableX; x < tableX + tableW; x++) {
  const pos = { x, y: tableY + tableH };
  if (inBounds(pos.x, pos.y)) {
    sides.south.push(pos);
  }
}
// West side (column left of table)
for (let y = tableY; y < tableY + tableH; y++) {
  const pos = { x: tableX - 1, y };
  if (inBounds(pos.x, pos.y)) {
    sides.west.push(pos);
  }
}
// East side (column right of table)
for (let y = tableY; y < tableY + tableH; y++) {
  const pos = { x: tableX + tableW, y };
  if (inBounds(pos.x, pos.y)) {
    sides.east.push(pos);
  }
}

// Place chairs on ALL 4 sides of the table
let totalChairs = 0;
const sidesUsed = [];
for (const [sideName, candidates] of Object.entries(sides)) {
  if (candidates.length > 0) {
    sidesUsed.push(sideName);
    for (const pos of candidates) {
      // Verify it's inside the meeting room interior
      if (pos.x >= meetingRoom.ix && pos.x < meetingRoom.ix + meetingRoom.w &&
          pos.y >= meetingRoom.iy && pos.y < meetingRoom.iy + meetingRoom.h) {
        setObjectsTiles(pos.x, pos.y, TILE.CHAIR);
        meetingChairPositions.push(pos);
        totalChairs++;
      }
    }
  }
}

// === DOOR TILES: open doors at every 2-tile-wide doorway on ObjectsTiles layer (open by default) ===
// Tiled flipped-diagonal bit for 90° clockwise rotation (bit 29)
const FLIPPED_DIAG = 0x20000000;

const allDoorTiles = [];
for (const room of rooms) {
  for (const dt of room.doorTiles) {
    // Determine if this door tile is on an east/west wall (needs rotation)
    // or on a north/south wall (plain GID, no rotation)
    let doorGid = gid(TILE.OPEN_DOOR);
    let isEastWest = false;

    if (room.doorSide === 'east' || room.doorSide === 'west') {
      // All door tiles in east/west-facing rooms are on east/west walls
      isEastWest = true;
    } else if (room.doorSide === 'all') {
      // Meeting room: determine wall orientation by position
      // East/west wall doors have x == wl or x == wr
      if (dt.x === room.wl || dt.x === room.wr) {
        isEastWest = true;
      }
    }

    if (isEastWest) {
      doorGid = gid(TILE.OPEN_DOOR) | FLIPPED_DIAG;
    }

    // Place each door tile in its own 32×32 cell (no overlap)
    if (inBounds(dt.x, dt.y)) {
      objectsTiles[idx(dt.x, dt.y)] = doorGid;
    }
    allDoorTiles.push(dt);
  }
}

// === SPACE WINDOWS: on back wall of each private room (Top layer) ===
for (const room of privateRooms) {
  // Back wall = wall opposite doorway. Center tile of that wall.
  let winX, winY;
  switch (room.doorSide) {
    case 'south': // back wall is north (top wall)
      winX = room.ix + Math.floor(room.w / 2);
      winY = room.wt; // top wall row
      break;
    case 'north': // back wall is south (bottom wall)
      winX = room.ix + Math.floor(room.w / 2);
      winY = room.wb; // bottom wall row
      break;
    case 'east': // back wall is west (left wall)
      winX = room.wl;
      winY = room.iy + Math.floor(room.h / 2);
      break;
    case 'west': // back wall is east (right wall)
      winX = room.wr;
      winY = room.iy + Math.floor(room.h / 2);
      break;
  }
  setTop(winX, winY, TILE.SPACE_WINDOW);
}

// === DECORATIVE OBJECTS IN CORRIDORS ===
// Place 8+ decoratives in corridors, max 3 per corridor segment
// Corridor segments: horizontal corridors between room rows, vertical corridors between columns

// Identify corridor tiles (not in rooms, not walls, not doorway tiles)
const corridorTiles = [];
for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    const physGid = physics[idx(x, y)];
    if (physGid === 0 && !roomInteriors.has(`${x},${y}`)) {
      // It's a corridor tile - check it's not a doorway
      const isDoorway = allDoorTiles.some(d => d.x === x && d.y === y);
      if (!isDoorway) {
        corridorTiles.push({ x, y });
      }
    }
  }
}

// Define corridor segments based on layout geometry
// Segment 1: Top horizontal corridor (y=7-8, between top rooms and left/right rooms)
// Segment 2: Bottom horizontal corridor (y=33-32, between bottom rooms and left/right rooms)
// Segment 3: Central horizontal corridor (y=8-9, upper area)
// Segment 4: Central area between rooms

const decorativeTypes = [
  TILE.CONTROL_PANEL,  // collide
  TILE.SERVER_RACK,    // collide
  TILE.HOLOGRAM,       // no collide
  TILE.SPACE_PLANT,    // no collide
  TILE.ANTENNA,        // collide
  TILE.ENERGY_CONDUIT, // no collide
];

// Collision set for decoratives
const collidingDecorative = new Set([TILE.CONTROL_PANEL, TILE.SERVER_RACK, TILE.ANTENNA]);

// Place decoratives strategically in corridor areas
// Define corridor segments by y-range for grouping
function getCorridorSegment(x, y) {
  if (y >= 7 && y <= 9 && x > 7 && x < 43) return 'top-corridor';
  if (y >= 31 && y <= 33 && x > 7 && x < 43) return 'bottom-corridor';
  if (x >= 7 && x <= 9 && y > 9 && y < 31) return 'left-corridor';
  if (x >= 41 && x <= 43 && y > 9 && y < 31) return 'right-corridor';
  if (y >= 10 && y <= 15 && x >= 10 && x <= 17) return 'upper-left-area';
  if (y >= 10 && y <= 15 && x >= 32 && x <= 42) return 'upper-right-area';
  if (y >= 25 && y <= 31 && x >= 10 && x <= 17) return 'lower-left-area';
  if (y >= 25 && y <= 31 && x >= 32 && x <= 42) return 'lower-right-area';
  return 'other';
}

const decorativePlacements = [];
const segmentCounts = {};

// Strategic positions for decoratives (avoiding blocking paths)
const decorativePositions = [
  // Top corridor
  { x: 9, y: 8 }, { x: 18, y: 8 }, { x: 36, y: 8 },
  // Bottom corridor
  { x: 9, y: 32 }, { x: 18, y: 32 }, { x: 36, y: 32 },
  // Left corridor
  { x: 8, y: 15 }, { x: 8, y: 24 },
  // Right corridor
  { x: 42, y: 15 }, { x: 42, y: 24 },
  // Central area
  { x: 12, y: 12 }, { x: 37, y: 12 },
];

let decorCount = 0;
for (const pos of decorativePositions) {
  if (decorCount >= 12) break; // don't over-decorate

  // Verify it's a valid corridor tile
  if (!inBounds(pos.x, pos.y)) continue;
  const physGid = physics[idx(pos.x, pos.y)];
  if (physGid !== 0) continue; // already has something on physics
  if (roomInteriors.has(`${pos.x},${pos.y}`)) continue; // inside a room
  if (objectsTiles[idx(pos.x, pos.y)] !== 0) continue; // already has objects tile

  const segment = getCorridorSegment(pos.x, pos.y);
  segmentCounts[segment] = (segmentCounts[segment] || 0);
  if (segmentCounts[segment] >= 3) continue; // max 3 per segment

  // Pick a decorative type (cycle through)
  const decType = decorativeTypes[decorCount % decorativeTypes.length];

  // If colliding decorative, place on Physics layer; otherwise on ObjectsTiles
  if (collidingDecorative.has(decType)) {
    setPhysics(pos.x, pos.y, decType);
  } else {
    setObjectsTiles(pos.x, pos.y, decType);
  }

  segmentCounts[segment]++;
  decorativePlacements.push({ x: pos.x, y: pos.y, type: decType });
  decorCount++;
}

// === BFS REACHABILITY VERIFICATION ===
// Verify all doorways are reachable from each other via non-collision floor tiles

function isWalkable(x, y) {
  if (!inBounds(x, y)) return false;
  const pGid = physics[idx(x, y)];
  // Physics layer: wall (3), desk (13), meeting table (15) block
  // colliding decoratives also block
  if (pGid === gid(TILE.WALL) || pGid === gid(TILE.DESK) ||
      pGid === gid(TILE.MEETING_TABLE) || pGid === gid(TILE.CONTROL_PANEL) ||
      pGid === gid(TILE.SERVER_RACK) || pGid === gid(TILE.ANTENNA)) {
    return false;
  }
  // ObjectsTiles layer: check for colliding tiles (currently only decoratives on Physics)
  // Chairs, doors, hologram, plant, conduit are passthrough
  return true;
}

function bfsReachable(startX, startY) {
  const visited = new Set();
  const queue = [{ x: startX, y: startY }];
  visited.add(`${startX},${startY}`);

  while (queue.length > 0) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = x + dx, ny = y + dy;
      const key = `${nx},${ny}`;
      if (!visited.has(key) && isWalkable(nx, ny)) {
        visited.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return visited;
}

// Collect all doorway positions
const allDoorwayPositions = [];
for (const room of rooms) {
  for (const dt of room.doorTiles) {
    allDoorwayPositions.push(dt);
  }
}

// BFS from first doorway and check all others are reachable
if (allDoorwayPositions.length > 0) {
  const reachable = bfsReachable(allDoorwayPositions[0].x, allDoorwayPositions[0].y);
  let allReachable = true;
  for (let i = 1; i < allDoorwayPositions.length; i++) {
    const dt = allDoorwayPositions[i];
    if (!reachable.has(`${dt.x},${dt.y}`)) {
      console.error(`ERROR: Doorway at (${dt.x},${dt.y}) is NOT reachable from doorway at (${allDoorwayPositions[0].x},${allDoorwayPositions[0].y})`);
      allReachable = false;
    }
  }
  if (allReachable) {
    console.log('BFS verification: All doorways are mutually reachable ✓');
  } else {
    console.error('BFS verification FAILED: Some doorways are unreachable!');
    process.exit(1);
  }
}

// === OBJECTS LAYER (objectgroup): zone definitions unchanged ===
const objects = [];
let nextId = 1;
function addZone(name, x, y, w, h) {
  objects.push({
    id: nextId++,
    name,
    type: 'zone',
    x: x * 32,
    y: y * 32,
    width: w * 32,
    height: h * 32,
    rotation: 0,
    visible: true,
    properties: [{ name: 'jitsiRoom', type: 'string', value: name }],
  });
}

// Top row rooms
for (let i = 0; i < 5; i++) addZone(`sala-${i + 1}`, topRoomXPositions[i], 1, 5, 5);
// Bottom row rooms
for (let i = 0; i < 5; i++) addZone(`sala-${i + 6}`, topRoomXPositions[i], botRowY, 5, 5);
// Left column rooms
for (let i = 0; i < 3; i++) addZone(`sala-${i + 11}`, 1, leftRoomYPositions[i], 5, 5);
// Right column rooms
for (let i = 0; i < 3; i++) addZone(`sala-${i + 14}`, rightColX, rightRoomYPositions[i], 5, 5);
// Meeting room
addZone('sala-reuniao', bigIx, bigIy, bigW, bigH);

// === ASSEMBLE MAP JSON ===
const map = {
  compressionlevel: -1,
  height: HEIGHT,
  infinite: false,
  width: WIDTH,
  tileheight: 32,
  tilewidth: 32,
  orientation: 'orthogonal',
  renderorder: 'right-down',
  type: 'map',
  version: '1.10',
  tiledversion: '1.10.2',
  nextlayerid: 6,
  nextobjectid: nextId,
  layers: [
    {
      data: ground,
      height: HEIGHT,
      id: 1,
      name: 'Ground',
      opacity: 1,
      type: 'tilelayer',
      visible: true,
      width: WIDTH,
      x: 0,
      y: 0,
    },
    {
      data: physics,
      height: HEIGHT,
      id: 2,
      name: 'Physics',
      opacity: 1,
      type: 'tilelayer',
      visible: true,
      width: WIDTH,
      x: 0,
      y: 0,
    },
    {
      data: objectsTiles,
      height: HEIGHT,
      id: 3,
      name: 'ObjectsTiles',
      opacity: 1,
      type: 'tilelayer',
      visible: true,
      width: WIDTH,
      x: 0,
      y: 0,
    },
    {
      draworder: 'topdown',
      id: 4,
      name: 'Objects',
      objects,
      opacity: 1,
      type: 'objectgroup',
      visible: true,
      x: 0,
      y: 0,
    },
    {
      data: top,
      height: HEIGHT,
      id: 5,
      name: 'Top',
      opacity: 1,
      type: 'tilelayer',
      visible: true,
      width: WIDTH,
      x: 0,
      y: 0,
    },
  ],
  tilesets: [
    {
      columns: 8,
      firstgid: 1,
      image: '/maps/tileset.png',
      imageheight: 256,
      imagewidth: 256,
      name: 'tileset',
      tilecount: 64,
      tileheight: 32,
      tilewidth: 32,
      tiles,
    },
  ],
};

// === WRITE OUTPUT ===
const outputPath = path.join(__dirname, '..', 'public', 'maps', 'default.json');
fs.writeFileSync(outputPath, JSON.stringify(map));

// === STATS ===
let walls = 0, zones = 0, desks = 0, tables = 0, open = 0;
physics.forEach(t => {
  if (t === gid(TILE.WALL)) walls++;
  else if (t === gid(TILE.ZONE_DETECT)) zones++;
  else if (t === gid(TILE.DESK)) desks++;
  else if (t === gid(TILE.MEETING_TABLE)) tables++;
  else if (t === 0) open++;
});

let doors = 0, chairs = 0, decoratives = 0;
objectsTiles.forEach(t => {
  // Strip rotation/flip bits to get base GID for comparison
  const baseGid = t & 0x1FFFFFFF;
  if (baseGid === gid(TILE.CLOSED_DOOR) || baseGid === gid(TILE.OPEN_DOOR)) doors++;
  else if (baseGid === gid(TILE.CHAIR)) chairs++;
  else if (t > 0) decoratives++;
});

let windows = 0;
top.forEach(t => { if (t === gid(TILE.SPACE_WINDOW)) windows++; });

console.log(`Map: ${WIDTH}x${HEIGHT} (${WIDTH * HEIGHT} tiles). Output: ${outputPath}`);
console.log(`Physics: Walls=${walls}, Zones=${zones}, Desks=${desks}, Tables=${tables}, Open=${open}`);
console.log(`ObjectsTiles: Doors=${doors}, Chairs=${chairs}, Decoratives=${decoratives}`);
console.log(`Top: Windows=${windows}`);
console.log(`Rooms: ${objects.length} (${privateRooms.length} private + 1 meeting)`);
console.log(`Meeting chairs: ${meetingChairPositions.length} across ${sidesUsed.length} sides`);
