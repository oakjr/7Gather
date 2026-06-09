/**
 * Generate 18 space-themed avatar SVGs for 7Gather
 * Each avatar is a 64x64 SVG rendered as PNG for Phaser
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 64;
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'sprites');

// 18 space-themed avatars organized in 3 rows of 6
const AVATARS = [
  // Row 1: Astronauts & Crew
  { id: 1, name: 'Astronauta', color: '#ffffff', accent: '#4a90d9', shape: 'astronaut' },
  { id: 2, name: 'Comandante', color: '#ffd700', accent: '#8b6914', shape: 'commander' },
  { id: 3, name: 'Piloto', color: '#90ee90', accent: '#2e8b57', shape: 'pilot' },
  { id: 4, name: 'Engenheiro', color: '#ff8c00', accent: '#8b4513', shape: 'engineer' },
  { id: 5, name: 'Cientista', color: '#87ceeb', accent: '#4682b4', shape: 'scientist' },
  { id: 6, name: 'Médico', color: '#ff6b6b', accent: '#8b0000', shape: 'medic' },
  // Row 2: Aliens & Creatures
  { id: 7, name: 'Alien Verde', color: '#00ff88', accent: '#006644', shape: 'alien' },
  { id: 8, name: 'Alien Roxo', color: '#bb77ff', accent: '#6600cc', shape: 'alien' },
  { id: 9, name: 'Alien Azul', color: '#00ccff', accent: '#005577', shape: 'alien' },
  { id: 10, name: 'Robô', color: '#c0c0c0', accent: '#505050', shape: 'robot' },
  { id: 11, name: 'Andróide', color: '#66ccff', accent: '#003366', shape: 'robot' },
  { id: 12, name: 'Cyborg', color: '#ff4444', accent: '#660000', shape: 'robot' },
  // Row 3: Ships & Vehicles  
  { id: 13, name: 'Nave', color: '#e0e0e0', accent: '#4a90d9', shape: 'ship' },
  { id: 14, name: 'UFO', color: '#aaffaa', accent: '#33aa33', shape: 'ufo' },
  { id: 15, name: 'Satélite', color: '#ffdd44', accent: '#aa8800', shape: 'satellite' },
  { id: 16, name: 'Estrela', color: '#ffffaa', accent: '#ffaa00', shape: 'star' },
  { id: 17, name: 'Planeta', color: '#6688ff', accent: '#2244aa', shape: 'planet' },
  { id: 18, name: 'Cometa', color: '#ff88ff', accent: '#aa00aa', shape: 'comet' },
];

function createPNG(width, height, rgbaData) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const ihdrChunk = createChunk('IHDR', ihdr);
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0;
    rgbaData.copy(rawData, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);
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
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function dist(x1, y1, x2, y2) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

function drawAvatar(avatar) {
  const px = Buffer.alloc(SIZE * SIZE * 4);
  const [r, g, b] = hexToRgb(avatar.color);
  const [ar, ag, ab] = hexToRgb(avatar.accent);
  const cx = SIZE / 2, cy = SIZE / 2;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const o = (y * SIZE + x) * 4;
      const d = dist(x, y, cx, cy);

      if (avatar.shape === 'astronaut' || avatar.shape === 'commander' ||
          avatar.shape === 'pilot' || avatar.shape === 'engineer' ||
          avatar.shape === 'scientist' || avatar.shape === 'medic') {
        // Humanoid: helmet (circle) with visor
        if (d <= 24) {
          // Helmet body
          px[o] = r; px[o+1] = g; px[o+2] = b; px[o+3] = 255;
          // Visor (darker center area)
          if (d <= 16 && y > cy - 10 && y < cy + 8) {
            px[o] = ar; px[o+1] = ag; px[o+2] = ab;
          }
          // Helmet rim
          if (d > 22) {
            px[o] = Math.floor(r * 0.7);
            px[o+1] = Math.floor(g * 0.7);
            px[o+2] = Math.floor(b * 0.7);
          }
          // Visor shine
          if (dist(x, y, cx - 5, cy - 5) < 4) {
            px[o] = Math.min(255, r + 80);
            px[o+1] = Math.min(255, g + 80);
            px[o+2] = Math.min(255, b + 80);
          }
        }
      } else if (avatar.shape === 'alien') {
        // Alien: oval head with big eyes
        const headD = Math.sqrt(((x - cx) / 20) ** 2 + ((y - cy) / 26) ** 2);
        if (headD <= 1) {
          px[o] = r; px[o+1] = g; px[o+2] = b; px[o+3] = 255;
          // Eyes
          if ((dist(x, y, cx - 8, cy - 4) < 5) || (dist(x, y, cx + 8, cy - 4) < 5)) {
            px[o] = 0; px[o+1] = 0; px[o+2] = 0;
          }
          // Eye shine
          if ((dist(x, y, cx - 6, cy - 6) < 2) || (dist(x, y, cx + 10, cy - 6) < 2)) {
            px[o] = 255; px[o+1] = 255; px[o+2] = 255;
          }
          // Border
          if (headD > 0.9) {
            px[o] = ar; px[o+1] = ag; px[o+2] = ab;
          }
        }
      } else if (avatar.shape === 'robot') {
        // Robot: square head with antenna
        const inHead = x >= cx - 18 && x <= cx + 18 && y >= cy - 16 && y <= cy + 20;
        const inAntenna = x >= cx - 2 && x <= cx + 2 && y >= cy - 26 && y < cy - 16;
        const antennaTop = dist(x, y, cx, cy - 28) < 4;
        if (inHead || inAntenna || antennaTop) {
          px[o] = r; px[o+1] = g; px[o+2] = b; px[o+3] = 255;
          // Eyes (LED style)
          if ((dist(x, y, cx - 8, cy - 2) < 4) || (dist(x, y, cx + 8, cy - 2) < 4)) {
            px[o] = ar; px[o+1] = ag; px[o+2] = ab;
          }
          // Mouth
          if (y >= cy + 8 && y <= cy + 10 && x >= cx - 10 && x <= cx + 10) {
            px[o] = ar; px[o+1] = ag; px[o+2] = ab;
          }
          // Border
          if (inHead && (x <= cx - 16 || x >= cx + 16 || y <= cy - 14 || y >= cy + 18)) {
            px[o] = Math.floor(r * 0.6);
            px[o+1] = Math.floor(g * 0.6);
            px[o+2] = Math.floor(b * 0.6);
          }
        }
      } else if (avatar.shape === 'ship') {
        // Spaceship: triangular pointing up
        const relY = y - (cy + 10);
        const halfWidth = Math.max(0, (-relY / 40) * 20);
        if (relY <= 0 && relY >= -40 && Math.abs(x - cx) <= halfWidth) {
          px[o] = r; px[o+1] = g; px[o+2] = b; px[o+3] = 255;
          if (Math.abs(x - cx) > halfWidth - 3) { px[o] = ar; px[o+1] = ag; px[o+2] = ab; }
          // Window
          if (dist(x, y, cx, cy - 8) < 5) { px[o] = ar; px[o+1] = ag; px[o+2] = ab; }
        }
        // Engine flames
        if (relY > 0 && relY < 10 && Math.abs(x - cx) < 6) {
          px[o] = 255; px[o+1] = 150; px[o+2] = 0; px[o+3] = Math.max(0, 255 - relY * 25);
        }
      } else if (avatar.shape === 'ufo') {
        // UFO: disc shape
        const discD = Math.sqrt(((x - cx) / 26) ** 2 + ((y - cy) / 10) ** 2);
        const domeD = dist(x, y, cx, cy - 6);
        if (domeD <= 14 && y <= cy) {
          px[o] = r; px[o+1] = g; px[o+2] = b; px[o+3] = 255;
          if (domeD > 12) { px[o] = ar; px[o+1] = ag; px[o+2] = ab; }
        }
        if (discD <= 1 && y >= cy - 4) {
          px[o] = Math.floor(r * 0.8); px[o+1] = Math.floor(g * 0.8); px[o+2] = Math.floor(b * 0.8); px[o+3] = 255;
          if (discD > 0.85) { px[o] = ar; px[o+1] = ag; px[o+2] = ab; }
          // Lights
          if (y >= cy + 2 && y <= cy + 5 && x % 8 < 3) {
            px[o] = 255; px[o+1] = 255; px[o+2] = 100;
          }
        }
      } else if (avatar.shape === 'satellite') {
        // Satellite: body + solar panels
        const inBody = Math.abs(x - cx) <= 6 && Math.abs(y - cy) <= 8;
        const inPanelL = x >= cx - 26 && x <= cx - 8 && Math.abs(y - cy) <= 5;
        const inPanelR = x >= cx + 8 && x <= cx + 26 && Math.abs(y - cy) <= 5;
        if (inBody) {
          px[o] = r; px[o+1] = g; px[o+2] = b; px[o+3] = 255;
        } else if (inPanelL || inPanelR) {
          px[o] = ar; px[o+1] = ag; px[o+2] = ab; px[o+3] = 255;
          // Panel grid
          if ((x % 4 === 0) || (y % 4 === 0)) {
            px[o] = Math.floor(ar * 0.6); px[o+1] = Math.floor(ag * 0.6); px[o+2] = Math.floor(ab * 0.6);
          }
        }
      } else if (avatar.shape === 'star') {
        // 5-pointed star
        const angle = Math.atan2(y - cy, x - cx);
        const starR = 22 + 8 * Math.cos(5 * angle);
        if (d <= starR) {
          px[o] = r; px[o+1] = g; px[o+2] = b; px[o+3] = 255;
          if (d > starR - 3) { px[o] = ar; px[o+1] = ag; px[o+2] = ab; }
          // Glow center
          if (d < 8) {
            px[o] = 255; px[o+1] = 255; px[o+2] = 220;
          }
        }
      } else if (avatar.shape === 'planet') {
        // Planet with ring
        if (d <= 20) {
          px[o] = r; px[o+1] = g; px[o+2] = b; px[o+3] = 255;
          // Bands
          if (Math.abs(y - cy) % 6 < 2) {
            px[o] = Math.floor(r * 0.8); px[o+1] = Math.floor(g * 0.8); px[o+2] = Math.floor(b * 0.8);
          }
        }
        // Ring
        const ringD = Math.sqrt(((x - cx) / 30) ** 2 + ((y - cy - 2) / 8) ** 2);
        if (ringD >= 0.7 && ringD <= 1 && (d > 20 || y > cy)) {
          px[o] = ar; px[o+1] = ag; px[o+2] = ab; px[o+3] = 200;
        }
      } else if (avatar.shape === 'comet') {
        // Comet: bright head with tail
        if (d <= 12) {
          px[o] = r; px[o+1] = g; px[o+2] = b; px[o+3] = 255;
          if (d < 6) { px[o] = 255; px[o+1] = 255; px[o+2] = 255; }
        }
        // Tail going right and down
        const tailDist = Math.sqrt(((x - cx + 15) / 30) ** 2 + ((y - cy + 5) / 8) ** 2);
        if (x > cx - 5 && tailDist < 1 && d > 10) {
          const alpha = Math.max(0, 200 - (x - cx) * 6);
          px[o] = r; px[o+1] = g; px[o+2] = b; px[o+3] = alpha;
        }
      }
    }
  }

  return px;
}

// Generate all 18 avatars
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

for (const avatar of AVATARS) {
  const pixels = drawAvatar(avatar);
  const png = createPNG(SIZE, SIZE, pixels);
  fs.writeFileSync(path.join(OUTPUT_DIR, `avatar_${avatar.id}.png`), png);
}

// Also generate remaining 19, 20 as copies of 17, 18 for backwards compat
fs.copyFileSync(path.join(OUTPUT_DIR, 'avatar_17.png'), path.join(OUTPUT_DIR, 'avatar_19.png'));
fs.copyFileSync(path.join(OUTPUT_DIR, 'avatar_18.png'), path.join(OUTPUT_DIR, 'avatar_20.png'));

console.log(`Generated ${AVATARS.length} space-themed avatars in ${OUTPUT_DIR}`);
console.log('Avatars: ' + AVATARS.map(a => `${a.id}:${a.name}`).join(', '));
