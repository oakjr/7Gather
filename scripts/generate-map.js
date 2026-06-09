/**
 * Generate default.json - Virtual Office Map for 7Gather
 * Compact layout: room back walls merge with workspace border (no outer corridors)
 */
const fs = require('fs');
const path = require('path');

// Tight layout: rooms touching the edges
const WIDTH = 50;
const HEIGHT = 40;

const FLOOR = 1, WALL = 3, ZONE = 11, EMPTY = 0;

const ground = new Array(WIDTH * HEIGHT).fill(FLOOR);
const physics = new Array(WIDTH * HEIGHT).fill(EMPTY);
const top = new Array(WIDTH * HEIGHT).fill(0);

function set(x, y, val) { if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) physics[y * WIDTH + x] = val; }
function hWall(x1, x2, y) { for (let x = x1; x <= x2; x++) set(x, y, WALL); }
function vWall(y1, y2, x) { for (let y = y1; y <= y2; y++) set(x, y, WALL); }
function fillZone(x1, y1, x2, y2) { for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) set(x, y, ZONE); }

// Room: 5x5 interior. Back wall is the border wall itself.
function drawRoom(ix, iy, doorSide) {
  const w = 5, h = 5;
  const wl = ix - 1, wr = ix + w, wt = iy - 1, wb = iy + h;
  hWall(wl, wr, wt); hWall(wl, wr, wb);
  vWall(wt, wb, wl); vWall(wt, wb, wr);
  const midX = ix + 2, midY = iy + 2;
  if (doorSide === 'south') { set(midX, wb, EMPTY); set(midX + 1, wb, EMPTY); }
  if (doorSide === 'north') { set(midX, wt, EMPTY); set(midX + 1, wt, EMPTY); }
  if (doorSide === 'east')  { set(wr, midY, EMPTY); set(wr, midY + 1, EMPTY); }
  if (doorSide === 'west')  { set(wl, midY, EMPTY); set(wl, midY + 1, EMPTY); }
  fillZone(ix, iy, ix + w - 1, iy + h - 1);
}

// === NO separate outer border — room walls ARE the border ===
// Just fill top row (y=0) and bottom row (y=HEIGHT-1) with walls to close gaps
hWall(0, WIDTH - 1, 0);
hWall(0, WIDTH - 1, HEIGHT - 1);
vWall(0, HEIGHT - 1, 0);
vWall(0, HEIGHT - 1, WIDTH - 1);

// === TOP ROW: 5 rooms, back wall = top border (y=0) ===
// Interior starts at y=1, so top wall of room at y=0 merges with border
const topRoomXPositions = [2, 11, 20, 29, 38];
for (let i = 0; i < 5; i++) {
  drawRoom(topRoomXPositions[i], 1, 'south');
}

// === BOTTOM ROW: 5 rooms, back wall = bottom border ===
// Interior ends at y=HEIGHT-2, bottom wall merges with border at y=HEIGHT-1
const botRowY = HEIGHT - 6; // interior at y=34 for HEIGHT=40
for (let i = 0; i < 5; i++) {
  drawRoom(topRoomXPositions[i], botRowY, 'north');
}

// === LEFT COLUMN: 3 rooms, back wall = left border (x=0) ===
const leftRoomYPositions = [10, 18, 26];
for (let i = 0; i < 3; i++) {
  drawRoom(1, leftRoomYPositions[i], 'east');
}

// === RIGHT COLUMN: 3 rooms, back wall = right border ===
const rightColX = WIDTH - 6; // interior at x=44 for WIDTH=50
const rightRoomYPositions = [10, 18, 26];
for (let i = 0; i < 3; i++) {
  drawRoom(rightColX, rightRoomYPositions[i], 'west');
}

// === LARGE MEETING ROOM (centered, 12x8 interior, 4 doors) ===
const bigIx = 19, bigIy = 17, bigW = 12, bigH = 8;
const bigWl = bigIx - 1, bigWr = bigIx + bigW, bigWt = bigIy - 1, bigWb = bigIy + bigH;
hWall(bigWl, bigWr, bigWt); hWall(bigWl, bigWr, bigWb);
vWall(bigWt, bigWb, bigWl); vWall(bigWt, bigWb, bigWr);
// 4 doors (north, south, east, west)
const bigDoorX = bigIx + 4, bigDoorY = bigIy + 3;
set(bigDoorX, bigWt, EMPTY); set(bigDoorX + 1, bigWt, EMPTY); set(bigDoorX + 2, bigWt, EMPTY);
set(bigDoorX, bigWb, EMPTY); set(bigDoorX + 1, bigWb, EMPTY); set(bigDoorX + 2, bigWb, EMPTY);
set(bigWl, bigDoorY, EMPTY); set(bigWl, bigDoorY + 1, EMPTY);
set(bigWr, bigDoorY, EMPTY); set(bigWr, bigDoorY + 1, EMPTY);
fillZone(bigIx, bigIy, bigIx + bigW - 1, bigIy + bigH - 1);

// === OBJECTS (zone definitions) ===
const objects = [];
let nextId = 1;
function addZone(name, x, y, w, h) {
  objects.push({ id: nextId++, name, type: "zone", x: x*32, y: y*32, width: w*32, height: h*32, rotation: 0, visible: true, properties: [{ name: "jitsiRoom", type: "string", value: name }] });
}
for (let i = 0; i < 5; i++) addZone(`sala-${i + 1}`, topRoomXPositions[i], 1, 5, 5);
for (let i = 0; i < 5; i++) addZone(`sala-${i + 6}`, topRoomXPositions[i], botRowY, 5, 5);
for (let i = 0; i < 3; i++) addZone(`sala-${i + 11}`, 1, leftRoomYPositions[i], 5, 5);
for (let i = 0; i < 3; i++) addZone(`sala-${i + 14}`, rightColX, rightRoomYPositions[i], 5, 5);
addZone("sala-reuniao", bigIx, bigIy, bigW, bigH);

// === WRITE ===
const map = {
  compressionlevel: -1, height: HEIGHT, infinite: false, width: WIDTH,
  tileheight: 32, tilewidth: 32, orientation: "orthogonal", renderorder: "right-down",
  type: "map", version: "1.10", tiledversion: "1.10.2", nextlayerid: 5, nextobjectid: nextId,
  layers: [
    { data: ground, height: HEIGHT, id: 1, name: "Ground", opacity: 1, type: "tilelayer", visible: true, width: WIDTH, x: 0, y: 0 },
    { data: physics, height: HEIGHT, id: 2, name: "Physics", opacity: 1, type: "tilelayer", visible: true, width: WIDTH, x: 0, y: 0 },
    { draworder: "topdown", id: 3, name: "Objects", objects, opacity: 1, type: "objectgroup", visible: true, x: 0, y: 0 },
    { data: top, height: HEIGHT, id: 4, name: "Top", opacity: 1, type: "tilelayer", visible: true, width: WIDTH, x: 0, y: 0 },
  ],
  tilesets: [{ columns: 8, firstgid: 1, image: "/maps/tileset.png", imageheight: 256, imagewidth: 256, name: "tileset", tilecount: 64, tileheight: 32, tilewidth: 32, tiles: [{ id: 2, properties: [{ name: "collide", type: "bool", value: true }] }, { id: 10, properties: [{ name: "jitsiRoom", type: "string", value: "" }] }] }]
};

const outputPath = path.join(__dirname, '..', 'public', 'maps', 'default.json');
fs.writeFileSync(outputPath, JSON.stringify(map));
let walls = 0, zones = 0, empty = 0;
physics.forEach(t => { if (t === WALL) walls++; else if (t === ZONE) zones++; else empty++; });
console.log(`Map: ${WIDTH}x${HEIGHT} (${WIDTH*HEIGHT} tiles). Walls: ${walls}, Zones: ${zones}, Open: ${empty}`);
console.log(`Rooms: ${objects.length}. Output: ${outputPath}`);
