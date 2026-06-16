// Generate a 256x256 PNG tileset with space-themed tiles (8x8 grid of 32x32 tiles)
// Uses raw PNG encoding without external dependencies
const fs = require('fs');
const zlib = require('zlib');

const WIDTH = 256;
const HEIGHT = 256;
const TILE_SIZE = 32;

// --- Space Theme Palette ---
const PALETTE = {
  // Backgrounds
  spaceBlack: [10, 10, 25],
  spaceDarkBlue: [15, 15, 40],
  // Corridor
  corridorBase: [20, 25, 35],
  corridorLine: [50, 60, 75],
  // Walls (cool-tone metallic)
  wallBase: [60, 65, 80],
  wallDark: [40, 45, 60],
  wallLight: [90, 95, 110],
  wallRivet: [120, 125, 130],
  wallAccent: [80, 130, 180],
  // Private zone (purple/violet)
  zonePurpleBase: [100, 75, 160],
  zonePurpleEdge: [85, 60, 140],
  zonePurpleCenter: [120, 95, 180],
  // Furniture
  deskSurface: [70, 75, 90],
  deskEdge: [45, 50, 65],
  notebookBase: [30, 35, 50],
  notebookScreen: [60, 180, 200],
  // Chair
  chairBase: [50, 55, 70],
  chairSeat: [80, 85, 100],
  chairAccent: [100, 160, 200],
  // Meeting table
  tableBase: [55, 60, 75],
  tableEdge: [35, 40, 55],
  tableAccent: [70, 120, 150],
  // Doors
  doorPanel: [80, 85, 100],
  doorFrame: [50, 55, 70],
  doorAccent: [100, 180, 220],
  doorGap: [10, 10, 25],
  // Window
  windowFrame: [70, 75, 90],
  windowSpace: [5, 5, 20],
  windowStar: [255, 255, 230],
  // Decoratives
  controlPanelBase: [40, 45, 60],
  controlPanelScreen: [30, 200, 150],
  serverRackBase: [50, 52, 60],
  serverLight: [0, 255, 100],
  serverLightOff: [80, 20, 20],
  hologramBase: [20, 20, 40],
  hologramGlow: [100, 200, 255],
  plantPot: [60, 50, 40],
  plantLeaf: [30, 180, 100],
  antennaBase: [70, 70, 80],
  antennaGlow: [255, 100, 50],
  // Stars
  starWhite: [255, 255, 255],
  starBlue: [180, 200, 255],
};

// Seeded random for deterministic output
let seed = 42;
function seededRandom() {
  seed = (seed * 1664525 + 1013904223) & 0xFFFFFFFF;
  return (seed >>> 0) / 0xFFFFFFFF;
}

function randomInt(min, max) {
  return Math.floor(seededRandom() * (max - min + 1)) + min;
}

// Create raw pixel data (RGBA)
const pixels = Buffer.alloc(WIDTH * HEIGHT * 4);

function setPixel(x, y, r, g, b, a = 255) {
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
  const offset = (y * WIDTH + x) * 4;
  pixels[offset] = r;
  pixels[offset + 1] = g;
  pixels[offset + 2] = b;
  pixels[offset + 3] = a;
}

function fillTile(col, row, r, g, b) {
  const startX = col * TILE_SIZE;
  const startY = row * TILE_SIZE;
  for (let ty = 0; ty < TILE_SIZE; ty++) {
    for (let tx = 0; tx < TILE_SIZE; tx++) {
      setPixel(startX + tx, startY + ty, r, g, b);
    }
  }
}

function setTilePixel(col, row, tx, ty, r, g, b) {
  setPixel(col * TILE_SIZE + tx, row * TILE_SIZE + ty, r, g, b);
}

function drawLine(col, row, x1, y1, x2, y2, r, g, b) {
  // Bresenham's line for horizontal/vertical lines within a tile
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;
  let x = x1, y = y1;
  while (true) {
    setTilePixel(col, row, x, y, r, g, b);
    if (x === x2 && y === y2) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

function drawRect(col, row, x, y, w, h, r, g, b) {
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setTilePixel(col, row, x + dx, y + dy, r, g, b);
    }
  }
}

// --- Tile Generators ---

// Tile 0: Space ground with stars
function generateSpaceGround(col, row) {
  const [r, g, b] = PALETTE.spaceBlack;
  fillTile(col, row, r, g, b);

  // Add subtle variation
  for (let ty = 0; ty < TILE_SIZE; ty++) {
    for (let tx = 0; tx < TILE_SIZE; tx++) {
      if (seededRandom() < 0.05) {
        const variation = randomInt(-3, 3);
        setTilePixel(col, row, tx, ty, r + variation, g + variation, b + variation + 2);
      }
    }
  }

  // Add 3-10 star dots
  const starCount = randomInt(3, 10);
  for (let i = 0; i < starCount; i++) {
    const sx = randomInt(1, 30);
    const sy = randomInt(1, 30);
    const isBlue = seededRandom() > 0.6;
    const [sr, sg, sb] = isBlue ? PALETTE.starBlue : PALETTE.starWhite;
    setTilePixel(col, row, sx, sy, sr, sg, sb);
    // Some stars are 2x2
    if (seededRandom() > 0.7) {
      setTilePixel(col, row, sx + 1, sy, sr, sg, sb);
      setTilePixel(col, row, sx, sy + 1, sr, sg, sb);
      setTilePixel(col, row, sx + 1, sy + 1, sr, sg, sb);
    }
  }
}

// Tile 1: Corridor floor with grid-line pattern
function generateCorridorFloor(col, row) {
  const [r, g, b] = PALETTE.corridorBase;
  fillTile(col, row, r, g, b);

  const spacing = 6; // lines spaced 6px apart (within 4-8 range)
  const [lr, lg, lb] = PALETTE.corridorLine;

  // Horizontal grid lines
  for (let ty = 0; ty < TILE_SIZE; ty += spacing) {
    for (let tx = 0; tx < TILE_SIZE; tx++) {
      setTilePixel(col, row, tx, ty, lr, lg, lb);
    }
  }
  // Vertical grid lines
  for (let tx = 0; tx < TILE_SIZE; tx += spacing) {
    for (let ty = 0; ty < TILE_SIZE; ty++) {
      setTilePixel(col, row, tx, ty, lr, lg, lb);
    }
  }
}

// Tile 2: Wall tile with panel seams and rivets (seamless, cool-tone)
function generateWallTile(col, row) {
  const [r, g, b] = PALETTE.wallBase;
  fillTile(col, row, r, g, b);

  // Panel seams - horizontal lines (≥2)
  const [dr, dg, db] = PALETTE.wallDark;
  // Seam at row 10
  for (let tx = 0; tx < TILE_SIZE; tx++) {
    setTilePixel(col, row, tx, 10, dr, dg, db);
  }
  // Seam at row 21
  for (let tx = 0; tx < TILE_SIZE; tx++) {
    setTilePixel(col, row, tx, 21, dr, dg, db);
  }
  // Vertical seam at col 16 (for panel division)
  for (let ty = 0; ty < TILE_SIZE; ty++) {
    setTilePixel(col, row, 16, ty, dr, dg, db);
  }

  // Light edge highlights for 3D effect
  const [lr, lg, lb] = PALETTE.wallLight;
  for (let tx = 0; tx < TILE_SIZE; tx++) {
    setTilePixel(col, row, tx, 11, lr, lg, lb);
    setTilePixel(col, row, tx, 22, lr, lg, lb);
  }

  // Rivets (≥4 dots) - placed at panel intersections
  const [rr, rg, rb] = PALETTE.wallRivet;
  const rivetPositions = [
    [4, 5], [28, 5], [4, 15], [28, 15], [4, 26], [28, 26]
  ];
  for (const [rx, ry] of rivetPositions) {
    setTilePixel(col, row, rx, ry, rr, rg, rb);
  }

  // Accent pixel (max 2 per tile)
  const [ar, ag, ab] = PALETTE.wallAccent;
  setTilePixel(col, row, 15, 5, ar, ag, ab);
  setTilePixel(col, row, 17, 26, ar, ag, ab);
}

// Tile 10: Private zone floor (purple/violet with lighter center gradient)
function generateZoneFloor(col, row) {
  const [er, eg, eb] = PALETTE.zonePurpleEdge;
  const [cr, cg, cb] = PALETTE.zonePurpleCenter;

  for (let ty = 0; ty < TILE_SIZE; ty++) {
    for (let tx = 0; tx < TILE_SIZE; tx++) {
      // Distance from center (normalized 0-1)
      const dx = Math.abs(tx - 15.5) / 15.5;
      const dy = Math.abs(ty - 15.5) / 15.5;
      const dist = Math.sqrt(dx * dx + dy * dy) / Math.sqrt(2);

      // Interpolate between center and edge colors
      const t = Math.min(1, dist * 1.2);
      const pr = Math.round(cr + (er - cr) * t);
      const pg = Math.round(cg + (eg - cg) * t);
      const pb = Math.round(cb + (eb - cb) * t);
      setTilePixel(col, row, tx, ty, pr, pg, pb);
    }
  }
}

// Tile 11: Zone detection tile (invisible/same as zone floor for physics detection)
function generateZoneDetection(col, row) {
  // Similar to zone floor but slightly different shade to differentiate
  const [r, g, b] = PALETTE.zonePurpleBase;
  fillTile(col, row, r, g, b);
}

// Tile 12: Desk with notebook
function generateDesk(col, row) {
  const [br, bg, bb] = PALETTE.spaceBlack;
  fillTile(col, row, br, bg, bb);

  // Desk surface
  const [sr, sg, sb] = PALETTE.deskSurface;
  const [er, eg, eb] = PALETTE.deskEdge;
  // Desk body
  drawRect(col, row, 2, 8, 28, 20, sr, sg, sb);
  // Desk edge (top)
  drawRect(col, row, 2, 8, 28, 2, er, eg, eb);
  // Desk legs (bottom corners)
  drawRect(col, row, 3, 28, 3, 3, er, eg, eb);
  drawRect(col, row, 26, 28, 3, 3, er, eg, eb);

  // Notebook/laptop on desk
  const [nr, ng, nb] = PALETTE.notebookBase;
  const [scr, scg, scb] = PALETTE.notebookScreen;
  // Laptop base
  drawRect(col, row, 10, 16, 14, 8, nr, ng, nb);
  // Laptop screen
  drawRect(col, row, 11, 10, 12, 6, scr, scg, scb);
  // Screen border
  drawRect(col, row, 11, 10, 12, 1, nr, ng, nb);
  drawRect(col, row, 11, 15, 12, 1, nr, ng, nb);
  drawRect(col, row, 11, 10, 1, 6, nr, ng, nb);
  drawRect(col, row, 22, 10, 1, 6, nr, ng, nb);
}

// Tile 13: Futuristic chair (no collision)
function generateChair(col, row) {
  const [br, bg, bb] = PALETTE.spaceBlack;
  fillTile(col, row, br, bg, bb);

  // Chair back
  const [cr, cg, cb] = PALETTE.chairBase;
  const [sr, sg, sb] = PALETTE.chairSeat;
  const [ar, ag, ab] = PALETTE.chairAccent;

  // Backrest
  drawRect(col, row, 10, 4, 12, 3, cr, cg, cb);
  drawRect(col, row, 11, 5, 10, 1, ar, ag, ab); // accent stripe

  // Back support
  drawRect(col, row, 14, 7, 4, 6, cr, cg, cb);

  // Seat
  drawRect(col, row, 8, 13, 16, 8, sr, sg, sb);
  drawRect(col, row, 9, 14, 14, 6, cr, cg, cb);

  // Chair legs (X-shape base)
  drawRect(col, row, 9, 22, 2, 6, cr, cg, cb);
  drawRect(col, row, 21, 22, 2, 6, cr, cg, cb);
  drawRect(col, row, 14, 21, 4, 2, cr, cg, cb);
  // Wheels
  setTilePixel(col, row, 9, 28, ar, ag, ab);
  setTilePixel(col, row, 22, 28, ar, ag, ab);
}

// Tile 14: Meeting table segment
function generateMeetingTable(col, row) {
  const [br, bg, bb] = PALETTE.spaceBlack;
  fillTile(col, row, br, bg, bb);

  const [tr, tg, tb] = PALETTE.tableBase;
  const [er, eg, eb] = PALETTE.tableEdge;
  const [ar, ag, ab] = PALETTE.tableAccent;

  // Table surface (fills most of the tile for seamless tiling)
  drawRect(col, row, 0, 4, 32, 24, tr, tg, tb);
  // Edge highlight top
  drawRect(col, row, 0, 4, 32, 2, er, eg, eb);
  // Edge highlight bottom
  drawRect(col, row, 0, 26, 32, 2, er, eg, eb);
  // Accent line in center
  drawRect(col, row, 0, 15, 32, 2, ar, ag, ab);
}

// Tile 15: Closed door (single panel filling full 32×32 tile)
function generateClosedDoor(col, row) {
  const [br, bg, bb] = PALETTE.doorFrame;
  fillTile(col, row, br, bg, bb);

  const [pr, pg, pb] = PALETTE.doorPanel;
  const [ar, ag, ab] = PALETTE.doorAccent;

  // Single panel filling the tile (with frame border)
  drawRect(col, row, 2, 2, 28, 28, pr, pg, pb);

  // Panel detail lines (vertical accents)
  drawRect(col, row, 8, 4, 1, 24, ar, ag, ab);
  drawRect(col, row, 23, 4, 1, 24, ar, ag, ab);

  // Handle on right side of panel
  setTilePixel(col, row, 25, 15, ar, ag, ab);
  setTilePixel(col, row, 25, 16, ar, ag, ab);
  setTilePixel(col, row, 26, 15, ar, ag, ab);
  setTilePixel(col, row, 26, 16, ar, ag, ab);
}

// Tile 16: Open door (single panel retracted to left edge, open space right)
function generateOpenDoor(col, row) {
  const [br, bg, bb] = PALETTE.doorFrame;
  fillTile(col, row, br, bg, bb);

  const [pr, pg, pb] = PALETTE.doorPanel;
  const [ar, ag, ab] = PALETTE.doorAccent;
  const [gr, gg, gb] = PALETTE.doorGap;

  // Open space (right side of tile — passable area)
  drawRect(col, row, 8, 2, 22, 28, gr, gg, gb);

  // Single panel retracted to left edge
  drawRect(col, row, 2, 2, 6, 28, pr, pg, pb);
  drawRect(col, row, 4, 4, 1, 24, ar, ag, ab);
}

// Tile 17: Space window (frame with stars/celestial elements)
function generateSpaceWindow(col, row) {
  const [fr, fg, fb] = PALETTE.windowFrame;
  fillTile(col, row, fr, fg, fb);

  const [sr, sg, sb] = PALETTE.windowSpace;
  const [wr, wg, wb] = PALETTE.windowStar;

  // Window opening (inner area)
  drawRect(col, row, 4, 4, 24, 24, sr, sg, sb);

  // Frame border (inner edge highlight)
  const [lr, lg, lb] = PALETTE.wallLight;
  for (let i = 3; i < 29; i++) {
    setTilePixel(col, row, i, 3, lr, lg, lb);
    setTilePixel(col, row, i, 28, lr, lg, lb);
    setTilePixel(col, row, 3, i, lr, lg, lb);
    setTilePixel(col, row, 28, i, lr, lg, lb);
  }

  // Stars visible through window (at least 2)
  setTilePixel(col, row, 8, 8, wr, wg, wb);
  setTilePixel(col, row, 9, 8, wr, wg, wb);
  setTilePixel(col, row, 20, 12, wr, wg, wb);
  setTilePixel(col, row, 14, 20, wr, wg, wb);
  setTilePixel(col, row, 24, 22, wr, wg, wb);

  // Small nebula/celestial element
  setTilePixel(col, row, 16, 10, 100, 80, 180);
  setTilePixel(col, row, 17, 10, 100, 80, 180);
  setTilePixel(col, row, 16, 11, 120, 90, 200);
  setTilePixel(col, row, 17, 11, 120, 90, 200);
}

// Tile 18: Control panel (collide: true)
function generateControlPanel(col, row) {
  const [br, bg, bb] = PALETTE.spaceBlack;
  fillTile(col, row, br, bg, bb);

  const [cr, cg, cb] = PALETTE.controlPanelBase;
  const [sr, sg, sb] = PALETTE.controlPanelScreen;

  // Panel body
  drawRect(col, row, 4, 6, 24, 22, cr, cg, cb);
  // Screen
  drawRect(col, row, 7, 8, 18, 10, sr, sg, sb);
  // Buttons row
  for (let i = 0; i < 4; i++) {
    const bx = 8 + i * 5;
    drawRect(col, row, bx, 21, 3, 3, 0, 200 - i * 40, 100 + i * 30);
  }
  // Indicator lights
  setTilePixel(col, row, 8, 26, 255, 50, 50);
  setTilePixel(col, row, 12, 26, 50, 255, 50);
  setTilePixel(col, row, 16, 26, 50, 50, 255);
}

// Tile 19: Server rack (collide: true)
function generateServerRack(col, row) {
  const [br, bg, bb] = PALETTE.spaceBlack;
  fillTile(col, row, br, bg, bb);

  const [sr, sg, sb] = PALETTE.serverRackBase;

  // Rack body
  drawRect(col, row, 6, 2, 20, 28, sr, sg, sb);
  // Rack divisions
  for (let i = 0; i < 5; i++) {
    const ry = 4 + i * 5;
    drawRect(col, row, 8, ry, 16, 4, 35, 38, 48);
    // Status lights
    const [glr, glg, glb] = i % 2 === 0 ? PALETTE.serverLight : PALETTE.serverLightOff;
    setTilePixel(col, row, 22, ry + 1, glr, glg, glb);
    setTilePixel(col, row, 22, ry + 2, glr, glg, glb);
  }
}

// Tile 20: Holographic display (no collision - passthrough)
function generateHologram(col, row) {
  const [br, bg, bb] = PALETTE.spaceBlack;
  fillTile(col, row, br, bg, bb);

  const [hr, hg, hb] = PALETTE.hologramBase;
  const [gr, gg, gb] = PALETTE.hologramGlow;

  // Base pedestal
  drawRect(col, row, 12, 26, 8, 4, hr, hg, hb);
  // Hologram projection (translucent look)
  for (let ty = 8; ty < 25; ty++) {
    for (let tx = 10; tx < 22; tx++) {
      const dist = Math.abs(tx - 16) + Math.abs(ty - 16);
      if (dist < 10) {
        const alpha = Math.max(0, 180 - dist * 20);
        const pr = Math.round(gr * alpha / 255);
        const pg = Math.round(gg * alpha / 255);
        const pb = Math.round(gb * alpha / 255);
        setTilePixel(col, row, tx, ty, pr + 10, pg + 10, pb + 20);
      }
    }
  }
}

// Tile 21: Space plant (no collision - passthrough)
function generateSpacePlant(col, row) {
  const [br, bg, bb] = PALETTE.spaceBlack;
  fillTile(col, row, br, bg, bb);

  const [pr, pg, pb] = PALETTE.plantPot;
  const [lr, lg, lb] = PALETTE.plantLeaf;

  // Pot
  drawRect(col, row, 11, 22, 10, 8, pr, pg, pb);
  drawRect(col, row, 10, 22, 12, 2, pr + 20, pg + 15, pb + 10);

  // Plant leaves (triangular/spiky shapes)
  // Center stem
  drawRect(col, row, 15, 10, 2, 12, lr - 10, lg - 30, lb - 20);
  // Left leaves
  drawRect(col, row, 10, 12, 5, 2, lr, lg, lb);
  drawRect(col, row, 8, 8, 4, 2, lr, lg, lb);
  // Right leaves
  drawRect(col, row, 17, 14, 5, 2, lr, lg, lb);
  drawRect(col, row, 19, 10, 4, 2, lr, lg, lb);
  // Top
  drawRect(col, row, 14, 6, 4, 3, lr + 20, lg + 20, lb + 10);
}

// Tile 22: Antenna/beacon (collide: true)
function generateAntenna(col, row) {
  const [br, bg, bb] = PALETTE.spaceBlack;
  fillTile(col, row, br, bg, bb);

  const [ar, ag, ab] = PALETTE.antennaBase;
  const [gr, gg, gb] = PALETTE.antennaGlow;

  // Base
  drawRect(col, row, 10, 26, 12, 4, ar, ag, ab);
  // Pole
  drawRect(col, row, 14, 6, 4, 20, ar, ag, ab);
  // Dish
  drawRect(col, row, 8, 8, 16, 3, ar + 20, ag + 20, ab + 20);
  // Glowing tip
  drawRect(col, row, 14, 3, 4, 3, gr, gg, gb);
  setTilePixel(col, row, 15, 2, gr, gg, gb);
  setTilePixel(col, row, 16, 2, gr, gg, gb);
}

// Tile 23: Energy conduit (no collision - passthrough)
function generateEnergyConduit(col, row) {
  const [br, bg, bb] = PALETTE.spaceBlack;
  fillTile(col, row, br, bg, bb);

  // Conduit tube
  const tubeColor = [40, 50, 70];
  drawRect(col, row, 12, 0, 8, 32, tubeColor[0], tubeColor[1], tubeColor[2]);

  // Energy flow (glowing segments)
  for (let i = 0; i < 5; i++) {
    const ey = 2 + i * 6;
    drawRect(col, row, 13, ey, 6, 3, 50, 150, 255);
    drawRect(col, row, 14, ey + 1, 4, 1, 100, 200, 255);
  }

  // Connection nodes
  drawRect(col, row, 10, 0, 12, 2, 60, 65, 80);
  drawRect(col, row, 10, 30, 12, 2, 60, 65, 80);
}

// --- Generate all tiles ---

// Fill entire image with space black first
for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    setPixel(x, y, 10, 10, 25);
  }
}

// Map tile index to grid position (row, col)
function tileToGrid(index) {
  return { col: index % 8, row: Math.floor(index / 8) };
}

// Generate each tile
const { col: c0, row: r0 } = tileToGrid(0);
generateSpaceGround(c0, r0);

const { col: c1, row: r1 } = tileToGrid(1);
generateCorridorFloor(c1, r1);

const { col: c2, row: r2 } = tileToGrid(2);
generateWallTile(c2, r2);

const { col: c10, row: r10 } = tileToGrid(10);
generateZoneFloor(c10, r10);

const { col: c11, row: r11 } = tileToGrid(11);
generateZoneDetection(c11, r11);

const { col: c12, row: r12 } = tileToGrid(12);
generateDesk(c12, r12);

const { col: c13, row: r13 } = tileToGrid(13);
generateChair(c13, r13);

const { col: c14, row: r14 } = tileToGrid(14);
generateMeetingTable(c14, r14);

const { col: c15, row: r15 } = tileToGrid(15);
generateClosedDoor(c15, r15);

const { col: c16, row: r16 } = tileToGrid(16);
generateOpenDoor(c16, r16);

const { col: c17, row: r17 } = tileToGrid(17);
generateSpaceWindow(c17, r17);

const { col: c18, row: r18 } = tileToGrid(18);
generateControlPanel(c18, r18);

const { col: c19, row: r19 } = tileToGrid(19);
generateServerRack(c19, r19);

const { col: c20, row: r20 } = tileToGrid(20);
generateHologram(c20, r20);

const { col: c21, row: r21 } = tileToGrid(21);
generateSpacePlant(c21, r21);

const { col: c22, row: r22 } = tileToGrid(22);
generateAntenna(c22, r22);

const { col: c23, row: r23 } = tileToGrid(23);
generateEnergyConduit(c23, r23);

// --- Tileset tiles array (properties for Tiled JSON) ---
const tiles = [
  { id: 2, properties: [{ name: 'collide', type: 'bool', value: true }] },
  { id: 10, properties: [{ name: 'jitsiRoom', type: 'string', value: '' }] },
  { id: 12, properties: [{ name: 'collide', type: 'bool', value: true }] },
  { id: 14, properties: [{ name: 'collide', type: 'bool', value: true }] },
  { id: 15, properties: [{ name: 'doorState', type: 'string', value: 'closed' }] },
  { id: 16, properties: [{ name: 'doorState', type: 'string', value: 'open' }] },
  { id: 18, properties: [{ name: 'collide', type: 'bool', value: true }] },
  { id: 19, properties: [{ name: 'collide', type: 'bool', value: true }] },
  { id: 22, properties: [{ name: 'collide', type: 'bool', value: true }] },
];

// --- PNG Encoding ---

function createPNG(width, height, rgbaData) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = createChunk('IHDR', ihdr);

  // IDAT chunk - raw image data with filter bytes
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter: None
    rgbaData.copy(rawData, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData) >>> 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return crc ^ 0xFFFFFFFF;
}

// --- Write output ---
const png = createPNG(WIDTH, HEIGHT, pixels);
fs.writeFileSync('public/maps/tileset.png', png);
console.log('Generated public/maps/tileset.png (256x256, 8x8 space-themed tiles)');
console.log('Tile indices: 0=space ground, 1=corridor, 2=wall, 10=zone floor, 11=zone detect');
console.log('              12=desk, 13=chair, 14=meeting table, 15=closed door, 16=open door');
console.log('              17=window, 18=control panel, 19=server rack, 20=hologram');
console.log('              21=space plant, 22=antenna, 23=energy conduit');

// Export tiles array for use by map generator
module.exports = { tiles };
