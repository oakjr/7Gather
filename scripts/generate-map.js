/**
 * Generate default.json - Virtual Office Map for 7Gather
 * Layout: Centralized office floor plan with larger rooms, minimal corridors
 * 
 * Design:
 * - Outer walls with open lobby in the center
 * - 15 private rooms (5x5 interior) around the perimeter
 * - 1 large meeting room (12x8 interior) at the bottom center
 * - Single central corridor connecting everything
 * - Rooms have 2-tile wide doors for easier access
 */
const fs = require('fs');
const path = require('path');

const WIDTH = 55;
const HEIGHT = 42;

const FLOOR = 1;
const WALL = 3;
const ZONE = 11;
const EMPTY = 0;

const ground = new Array(WIDTH * HEIGHT).fill(FLOOR);
const physics = new Array(WIDTH * HEIGHT).fill(EMPTY);
const top = new Array(WIDTH * HEIGHT).fill(0);

function set(x, y, val) {
  if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) physics[y * WIDTH + x] = val;
}

function hWall(x1, x2, y) { for (let x = x1; x <= x2; x++) set(x, y, WALL); }
function vWall(y1, y2, x) { for (let y = y1; y <= y2; y++) set(x, y, WALL); }

function fillZone(x1, y1, x2, y2) {
  for (let y = y1; y <= y2; y++)
    for (let x = x1; x <= x2; x++) set(x, y, ZONE);
}

/**
 * Draw a room with 5x5 interior.
 * @param {number} ix - interior top-left X
 * @param {number} iy - interior top-left Y
 * @param {string} doorSide - 'north'|'south'|'east'|'west'
 */
function drawRoom(ix, iy, doorSide) {
  const w = 5, h = 5;
  const wl = ix - 1, wr = ix + w, wt = iy - 1, wb = iy + h;

  hWall(wl, wr, wt);
  hWall(wl, wr, wb);
  vWall(wt, wb, wl);
  vWall(wt, wb, wr);

  // 2-tile door opening
  const midX = ix + 2;
  const midY = iy + 2;
  if (doorSide === 'south') { set(midX, wb, EMPTY); set(midX + 1, wb, EMPTY); }
  if (doorSide === 'north') { set(midX, wt, EMPTY); set(midX + 1, wt, EMPTY); }
  if (doorSide === 'east')  { set(wr, midY, EMPTY); set(wr, midY + 1, EMPTY); }
  if (doorSide === 'west')  { set(wl, midY, EMPTY); set(wl, midY + 1, EMPTY); }

  fillZone(ix, iy, ix + w - 1, iy + h - 1);
}

// === OUTER BORDER ===
hWall(0, WIDTH - 1, 0);
hWall(0, WIDTH - 1, HEIGHT - 1);
vWall(0, HEIGHT - 1, 0);
vWall(0, HEIGHT - 1, WIDTH - 1);

// === LAYOUT (centered) ===
// Map is 55x42. Center is at ~(27, 21).
// We'll place rooms around the edges of a central open area.
//
// TOP ROW: 5 rooms (door facing south into central area)
// Rooms start at y=2, spaced 10 apart starting at x=2
const topRowY = 2;
const topRoomXPositions = [3, 13, 23, 33, 43];

for (let i = 0; i < 5; i++) {
  drawRoom(topRoomXPositions[i], topRowY, 'south');
}

// BOTTOM ROW: 5 rooms (door facing north into central area)  
const botRowY = 35;
const botRoomXPositions = [3, 13, 23, 33, 43];

for (let i = 0; i < 5; i++) {
  drawRoom(botRoomXPositions[i], botRowY, 'north');
}

// LEFT COLUMN: 3 rooms (door facing east into central area)
const leftColX = 3;
const leftRoomYPositions = [11, 19, 27];

for (let i = 0; i < 3; i++) {
  drawRoom(leftColX, leftRoomYPositions[i], 'east');
}

// RIGHT COLUMN: 3 rooms (door facing west into central area)
const rightColX = 43;
const rightRoomYPositions = [11, 19, 27];

for (let i = 0; i < 3; i++) {
  drawRoom(rightColX, rightRoomYPositions[i], 'west');
}

// === LARGE MEETING ROOM (centered, 12x8 interior, door north) ===
const bigIx = 21, bigIy = 20, bigW = 12, bigH = 8;
const bigWl = bigIx - 1, bigWr = bigIx + bigW, bigWt = bigIy - 1, bigWb = bigIy + bigH;

hWall(bigWl, bigWr, bigWt);
hWall(bigWl, bigWr, bigWb);
vWall(bigWt, bigWb, bigWl);
vWall(bigWt, bigWb, bigWr);

// 3-tile door opening on north wall
const bigDoorX = bigIx + 4;
set(bigDoorX, bigWt, EMPTY);
set(bigDoorX + 1, bigWt, EMPTY);
set(bigDoorX + 2, bigWt, EMPTY);

// Additional doors on south, east, west walls
// South door (center)
set(bigDoorX, bigWb, EMPTY);
set(bigDoorX + 1, bigWb, EMPTY);
set(bigDoorX + 2, bigWb, EMPTY);
// West door (center)
const bigDoorY = bigIy + 3;
set(bigWl, bigDoorY, EMPTY);
set(bigWl, bigDoorY + 1, EMPTY);
// East door (center)
set(bigWr, bigDoorY, EMPTY);
set(bigWr, bigDoorY + 1, EMPTY);

fillZone(bigIx, bigIy, bigIx + bigW - 1, bigIy + bigH - 1);

// === BUILD OBJECTS (zone definitions) ===
const objects = [];
let nextId = 1;

function addZoneObj(name, x, y, w, h) {
  objects.push({
    id: nextId++, name, type: "zone",
    x: x * 32, y: y * 32, width: w * 32, height: h * 32,
    rotation: 0, visible: true,
    properties: [{ name: "jitsiRoom", type: "string", value: name }]
  });
}

// Top row rooms
for (let i = 0; i < 5; i++) addZoneObj(`sala-${i + 1}`, topRoomXPositions[i], topRowY, 5, 5);
// Bottom row rooms
for (let i = 0; i < 5; i++) addZoneObj(`sala-${i + 6}`, botRoomXPositions[i], botRowY, 5, 5);
// Left column rooms
for (let i = 0; i < 3; i++) addZoneObj(`sala-${i + 11}`, leftColX, leftRoomYPositions[i], 5, 5);
// Right column rooms
for (let i = 0; i < 3; i++) addZoneObj(`sala-${i + 14}`, rightColX, rightRoomYPositions[i], 5, 5);
// Large meeting room
addZoneObj("sala-reuniao", bigIx, bigIy, bigW, bigH);

// === WRITE JSON ===
const map = {
  compressionlevel: -1, height: HEIGHT, infinite: false, width: WIDTH,
  tileheight: 32, tilewidth: 32,
  orientation: "orthogonal", renderorder: "right-down",
  type: "map", version: "1.10", tiledversion: "1.10.2",
  nextlayerid: 5, nextobjectid: nextId,
  layers: [
    { data: ground, height: HEIGHT, id: 1, name: "Ground", opacity: 1, type: "tilelayer", visible: true, width: WIDTH, x: 0, y: 0 },
    { data: physics, height: HEIGHT, id: 2, name: "Physics", opacity: 1, type: "tilelayer", visible: true, width: WIDTH, x: 0, y: 0 },
    { draworder: "topdown", id: 3, name: "Objects", objects, opacity: 1, type: "objectgroup", visible: true, x: 0, y: 0 },
    { data: top, height: HEIGHT, id: 4, name: "Top", opacity: 1, type: "tilelayer", visible: true, width: WIDTH, x: 0, y: 0 },
  ],
  tilesets: [{
    columns: 8, firstgid: 1, image: "/maps/tileset.png",
    imageheight: 256, imagewidth: 256, name: "tileset",
    tilecount: 64, tileheight: 32, tilewidth: 32,
    tiles: [
      { id: 2, properties: [{ name: "collide", type: "bool", value: true }] },
      { id: 10, properties: [{ name: "jitsiRoom", type: "string", value: "" }] }
    ]
  }]
};

const outputPath = path.join(__dirname, '..', 'public', 'maps', 'default.json');
fs.writeFileSync(outputPath, JSON.stringify(map));

let walls = 0, zones = 0, empty = 0;
physics.forEach(t => { if (t === WALL) walls++; else if (t === ZONE) zones++; else empty++; });
console.log(`Map: ${WIDTH}x${HEIGHT} = ${WIDTH * HEIGHT} tiles`);
console.log(`Physics: ${walls} walls, ${zones} zones, ${empty} walkable`);
console.log(`Rooms: ${objects.length} (15 private + 1 large meeting)`);
console.log(`Output: ${outputPath}`);
