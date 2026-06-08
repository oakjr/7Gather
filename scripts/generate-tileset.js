// Generate a minimal 256x256 PNG tileset with colored tiles
// Uses raw PNG encoding without external dependencies
const fs = require('fs');
const zlib = require('zlib');

const WIDTH = 256;
const HEIGHT = 256;
const TILE_SIZE = 32;

// Colors for each tile index (RGB)
const COLORS = {
  0: [74, 124, 89],    // grass green (Ground tile 1)
  2: [85, 85, 85],     // gray (Wall/Physics tile 3)
  10: [91, 74, 158],   // purple (Private zone tile 11)
};
const DEFAULT_COLOR = [61, 107, 79]; // darker green

function getTileColor(tileIndex) {
  return COLORS[tileIndex] || DEFAULT_COLOR;
}

// Create raw pixel data (RGBA)
const pixels = Buffer.alloc(WIDTH * HEIGHT * 4);

for (let row = 0; row < 8; row++) {
  for (let col = 0; col < 8; col++) {
    const tileIndex = row * 8 + col;
    const [r, g, b] = getTileColor(tileIndex);

    for (let ty = 0; ty < TILE_SIZE; ty++) {
      for (let tx = 0; tx < TILE_SIZE; tx++) {
        const px = col * TILE_SIZE + tx;
        const py = row * TILE_SIZE + ty;
        const offset = (py * WIDTH + px) * 4;

        // Add a subtle border
        const isBorder = tx === 0 || ty === 0 || tx === 31 || ty === 31;
        const darken = isBorder ? 20 : 0;

        pixels[offset] = Math.max(0, r - darken);
        pixels[offset + 1] = Math.max(0, g - darken);
        pixels[offset + 2] = Math.max(0, b - darken);
        pixels[offset + 3] = 255; // alpha
      }
    }
  }
}

// Encode as PNG
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

const png = createPNG(WIDTH, HEIGHT, pixels);
fs.writeFileSync('public/maps/tileset.png', png);
console.log('Generated public/maps/tileset.png (256x256, 8x8 tiles)');
