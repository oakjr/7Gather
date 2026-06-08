// Generate a simple 32x32 avatar sprite PNG (colored circle on transparent background)
const fs = require('fs');
const zlib = require('zlib');

const SIZE = 32;

function createPNG(width, height, rgbaData) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
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
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return crc ^ 0xFFFFFFFF;
}

// Generate 20 avatar sprites with different colors
const COLORS = [
  [255, 87, 87], [255, 150, 50], [255, 215, 0], [100, 220, 100], [50, 200, 150],
  [50, 180, 255], [100, 100, 255], [150, 80, 220], [220, 80, 180], [255, 120, 150],
  [200, 200, 200], [150, 100, 50], [80, 200, 200], [220, 180, 50], [100, 150, 50],
  [50, 100, 200], [200, 50, 100], [150, 200, 50], [100, 50, 150], [50, 150, 100],
];

for (let i = 0; i < 20; i++) {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  const [r, g, b] = COLORS[i];
  const cx = SIZE / 2, cy = SIZE / 2, radius = 12;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const offset = (y * SIZE + x) * 4;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist <= radius) {
        pixels[offset] = r;
        pixels[offset + 1] = g;
        pixels[offset + 2] = b;
        pixels[offset + 3] = 255;
        // Add a darker border
        if (dist > radius - 2) {
          pixels[offset] = Math.floor(r * 0.6);
          pixels[offset + 1] = Math.floor(g * 0.6);
          pixels[offset + 2] = Math.floor(b * 0.6);
        }
      } else {
        pixels[offset + 3] = 0; // transparent
      }
    }
  }

  const png = createPNG(SIZE, SIZE, pixels);
  fs.writeFileSync(`public/sprites/avatar_${i + 1}.png`, png);
}

console.log('Generated 20 avatar sprites in public/sprites/');
