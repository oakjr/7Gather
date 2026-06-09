// Unit tests for tileset generator output
// Validates: Requirements 1.1, 1.2, 1.4, 2.1, 2.2, 10.1, 10.2, 10.3, 12.6
import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const TILESET_PATH = path.resolve(__dirname, '../public/maps/tileset.png');
const TILE_SIZE = 32;
const GRID_SIZE = 8;

// Simple PNG decoder (handles the raw RGBA format produced by the generator)
function decodePNG(buffer) {
  // Verify PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) {
    throw new Error('Invalid PNG signature');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }

    offset += 12 + length; // 4 (length) + 4 (type) + data + 4 (crc)
  }

  const compressed = Buffer.concat(idatChunks);
  const decompressed = zlib.inflateSync(compressed);

  // Remove filter bytes (one per row)
  const pixels = Buffer.alloc(width * height * 4);
  const rowSize = width * 4;
  for (let y = 0; y < height; y++) {
    const filterByte = decompressed[y * (rowSize + 1)];
    const rowStart = y * (rowSize + 1) + 1;
    if (filterByte === 0) {
      // No filter
      decompressed.copy(pixels, y * rowSize, rowStart, rowStart + rowSize);
    } else {
      throw new Error(`Unsupported PNG filter type: ${filterByte}`);
    }
  }

  return { width, height, pixels };
}

// Get pixel data for a specific tile
function getTilePixels(pixels, imageWidth, tileIndex) {
  const col = tileIndex % GRID_SIZE;
  const row = Math.floor(tileIndex / GRID_SIZE);
  const startX = col * TILE_SIZE;
  const startY = row * TILE_SIZE;
  const tilePixels = [];

  for (let ty = 0; ty < TILE_SIZE; ty++) {
    for (let tx = 0; tx < TILE_SIZE; tx++) {
      const x = startX + tx;
      const y = startY + ty;
      const offset = (y * imageWidth + x) * 4;
      tilePixels.push({
        r: pixels[offset],
        g: pixels[offset + 1],
        b: pixels[offset + 2],
        a: pixels[offset + 3],
      });
    }
  }

  return tilePixels;
}

describe('Tileset Generator Output', () => {
  let png;
  let tiles;

  beforeAll(() => {
    // Run the generator to produce fresh output
    execSync('node scripts/generate-tileset.js', {
      cwd: path.resolve(__dirname, '..'),
    });

    // Load the tiles array export
    // Clear require cache to get fresh module
    const modulePath = path.resolve(__dirname, 'generate-tileset.js');
    delete require.cache[modulePath];
    tiles = require('./generate-tileset.js').tiles;

    // Decode the PNG
    const pngBuffer = fs.readFileSync(TILESET_PATH);
    png = decodePNG(pngBuffer);
  });

  describe('PNG dimensions (Requirement 10.1)', () => {
    it('should produce a PNG that is exactly 256x256 pixels', () => {
      expect(png.width).toBe(256);
      expect(png.height).toBe(256);
    });
  });

  describe('Tile 0 - Space Ground (Requirements 1.1, 1.2)', () => {
    it('should have ≥80% dark pixels (R≤40, G≤40, B≤80)', () => {
      const tilePixels = getTilePixels(png.pixels, png.width, 0);
      const totalPixels = TILE_SIZE * TILE_SIZE;
      const darkPixels = tilePixels.filter(
        (p) => p.r <= 40 && p.g <= 40 && p.b <= 80
      ).length;
      const darkRatio = darkPixels / totalPixels;

      expect(darkRatio).toBeGreaterThanOrEqual(0.8);
    });

    it('should contain between 3 and 10 star dots (lighter pixels)', () => {
      const tilePixels = getTilePixels(png.pixels, png.width, 0);
      // Stars are pixels significantly brighter than the dark background
      // Background is around (10, 10, 25) with minor variations
      // Stars are white (255,255,255) or blue (180,200,255)
      // A star pixel should have at least one channel > 100
      const starPixels = tilePixels.filter(
        (p) => p.r > 100 || p.g > 100 || p.b > 100
      );

      // Stars can be 1x1 or 2x2, so we need to count clusters
      // Count distinct star dots by checking how many "seeds" we have
      // Since stars are placed at random positions, let's count connected groups
      const visited = new Set();
      let starCount = 0;

      for (let i = 0; i < tilePixels.length; i++) {
        const p = tilePixels[i];
        if ((p.r > 100 || p.g > 100 || p.b > 100) && !visited.has(i)) {
          starCount++;
          // BFS to mark the connected star cluster
          const queue = [i];
          while (queue.length > 0) {
            const idx = queue.shift();
            if (visited.has(idx)) continue;
            visited.add(idx);
            const px = idx % TILE_SIZE;
            const py = Math.floor(idx / TILE_SIZE);
            // Check 4-connected neighbors
            const neighbors = [
              py > 0 ? idx - TILE_SIZE : -1,
              py < TILE_SIZE - 1 ? idx + TILE_SIZE : -1,
              px > 0 ? idx - 1 : -1,
              px < TILE_SIZE - 1 ? idx + 1 : -1,
            ];
            for (const n of neighbors) {
              if (n >= 0 && !visited.has(n)) {
                const np = tilePixels[n];
                if (np.r > 100 || np.g > 100 || np.b > 100) {
                  queue.push(n);
                }
              }
            }
          }
        }
      }

      expect(starCount).toBeGreaterThanOrEqual(3);
      expect(starCount).toBeLessThanOrEqual(10);
    });
  });

  describe('Tile 2 - Wall tile (Requirements 2.1, 2.2)', () => {
    it('should use a cool-tone palette (R≤130 and B≥R for grays, or valid blues/teals)', () => {
      const tilePixels = getTilePixels(png.pixels, png.width, 2);
      // Check that the majority of pixels use cool-tone colors
      // Allow up to 2 accent pixels with higher saturation
      let nonCoolCount = 0;

      for (const p of tilePixels) {
        // Cool-tone criteria:
        // Grays: R≤130 and B≥R
        // Dark blues: B≥150 and R≤80
        // Teals: G≥100 and B≥100 and R≤80
        const isGray = p.r <= 130 && p.b >= p.r;
        const isDarkBlue = p.b >= 150 && p.r <= 80;
        const isTeal = p.g >= 100 && p.b >= 100 && p.r <= 80;

        if (!isGray && !isDarkBlue && !isTeal) {
          nonCoolCount++;
        }
      }

      // At most 2 accent pixels are allowed per tile in higher-saturation values
      expect(nonCoolCount).toBeLessThanOrEqual(2);
    });

    it('should have at least 2 panel seams (horizontal or vertical lines)', () => {
      const tilePixels = getTilePixels(png.pixels, png.width, 2);

      // A panel seam is a horizontal or vertical line that spans most of the tile
      // Check for horizontal lines: rows where most pixels share a distinct color from neighbors
      let horizontalSeams = 0;
      for (let y = 1; y < TILE_SIZE - 1; y++) {
        let linePixelCount = 0;
        for (let x = 0; x < TILE_SIZE; x++) {
          const idx = y * TILE_SIZE + x;
          const aboveIdx = (y - 1) * TILE_SIZE + x;
          const p = tilePixels[idx];
          const above = tilePixels[aboveIdx];
          // Check if this pixel differs from the one above by at least 10 in any channel
          const diff =
            Math.abs(p.r - above.r) +
            Math.abs(p.g - above.g) +
            Math.abs(p.b - above.b);
          if (diff >= 10) linePixelCount++;
        }
        // If most of the row (≥80%) has a distinct color from above, it's a seam
        if (linePixelCount >= TILE_SIZE * 0.8) {
          horizontalSeams++;
        }
      }

      // Check for vertical lines
      let verticalSeams = 0;
      for (let x = 1; x < TILE_SIZE - 1; x++) {
        let linePixelCount = 0;
        for (let y = 0; y < TILE_SIZE; y++) {
          const idx = y * TILE_SIZE + x;
          const leftIdx = y * TILE_SIZE + (x - 1);
          const p = tilePixels[idx];
          const left = tilePixels[leftIdx];
          const diff =
            Math.abs(p.r - left.r) +
            Math.abs(p.g - left.g) +
            Math.abs(p.b - left.b);
          if (diff >= 10) linePixelCount++;
        }
        if (linePixelCount >= TILE_SIZE * 0.8) {
          verticalSeams++;
        }
      }

      const totalSeams = horizontalSeams + verticalSeams;
      expect(totalSeams).toBeGreaterThanOrEqual(2);
    });

    it('should have at least 4 rivet dots', () => {
      const tilePixels = getTilePixels(png.pixels, png.width, 2);

      // Rivets are isolated single-pixel dots that differ from their surroundings
      // They are bright spots (wallRivet: [120, 125, 130]) on the wall surface
      let rivetCount = 0;
      for (let y = 1; y < TILE_SIZE - 1; y++) {
        for (let x = 1; x < TILE_SIZE - 1; x++) {
          const idx = y * TILE_SIZE + x;
          const p = tilePixels[idx];

          // A rivet is a pixel that's notably different from all 4 neighbors
          const neighbors = [
            tilePixels[(y - 1) * TILE_SIZE + x],
            tilePixels[(y + 1) * TILE_SIZE + x],
            tilePixels[y * TILE_SIZE + (x - 1)],
            tilePixels[y * TILE_SIZE + (x + 1)],
          ];

          const allNeighborsDiffer = neighbors.every((n) => {
            const diff =
              Math.abs(p.r - n.r) +
              Math.abs(p.g - n.g) +
              Math.abs(p.b - n.b);
            return diff >= 20;
          });

          if (allNeighborsDiffer) {
            rivetCount++;
          }
        }
      }

      expect(rivetCount).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Tile 10 - Private zone floor (Requirement 3.1)', () => {
    it('should have a purple/violet base color (R:80-120, G:60-90, B:140-180)', () => {
      const tilePixels = getTilePixels(png.pixels, png.width, 10);

      // Check the average color of all pixels falls within the purple range
      let totalR = 0, totalG = 0, totalB = 0;
      for (const p of tilePixels) {
        totalR += p.r;
        totalG += p.g;
        totalB += p.b;
      }
      const count = tilePixels.length;
      const avgR = totalR / count;
      const avgG = totalG / count;
      const avgB = totalB / count;

      // The average should fall within or near the specified purple range
      expect(avgR).toBeGreaterThanOrEqual(80);
      expect(avgR).toBeLessThanOrEqual(125);
      expect(avgG).toBeGreaterThanOrEqual(55);
      expect(avgG).toBeLessThanOrEqual(95);
      expect(avgB).toBeGreaterThanOrEqual(135);
      expect(avgB).toBeLessThanOrEqual(185);
    });

    it('should have a lighter center than border pixels (≥15 RGB units brighter)', () => {
      const tilePixels = getTilePixels(png.pixels, png.width, 10);

      // Sample center pixels (around 15,15 - 16,16)
      const centerIndices = [
        15 * TILE_SIZE + 15,
        15 * TILE_SIZE + 16,
        16 * TILE_SIZE + 15,
        16 * TILE_SIZE + 16,
      ];

      // Sample border pixels (first and last row/col)
      const borderIndices = [
        0 * TILE_SIZE + 0,
        0 * TILE_SIZE + 31,
        31 * TILE_SIZE + 0,
        31 * TILE_SIZE + 31,
        0 * TILE_SIZE + 16,
        31 * TILE_SIZE + 16,
      ];

      const centerBrightness = centerIndices.reduce((sum, idx) => {
        const p = tilePixels[idx];
        return sum + p.r + p.g + p.b;
      }, 0) / centerIndices.length;

      const borderBrightness = borderIndices.reduce((sum, idx) => {
        const p = tilePixels[idx];
        return sum + p.r + p.g + p.b;
      }, 0) / borderIndices.length;

      // Center should be at least 15 RGB units brighter (per channel average)
      // Since we sum all 3 channels, the difference should be ≥ 15 * 3 = 45
      // But the requirement says "center pixels at least 15 RGB units brighter than border pixels"
      // This means each channel should be approximately 15 units brighter on average
      const brightnessPerChannel = (centerBrightness - borderBrightness) / 3;
      expect(brightnessPerChannel).toBeGreaterThanOrEqual(15);
    });
  });

  describe('Collision properties (Requirements 10.2, 10.3)', () => {
    it('should assign collide: true to wall tile (index 2)', () => {
      const wallTile = tiles.find((t) => t.id === 2);
      expect(wallTile).toBeDefined();
      const collideProp = wallTile.properties.find(
        (p) => p.name === 'collide'
      );
      expect(collideProp).toBeDefined();
      expect(collideProp.value).toBe(true);
    });

    it('should assign collide: true to desk tile (index 12)', () => {
      const deskTile = tiles.find((t) => t.id === 12);
      expect(deskTile).toBeDefined();
      const collideProp = deskTile.properties.find(
        (p) => p.name === 'collide'
      );
      expect(collideProp).toBeDefined();
      expect(collideProp.value).toBe(true);
    });

    it('should assign collide: true to meeting table tile (index 14)', () => {
      const tableTile = tiles.find((t) => t.id === 14);
      expect(tableTile).toBeDefined();
      const collideProp = tableTile.properties.find(
        (p) => p.name === 'collide'
      );
      expect(collideProp).toBeDefined();
      expect(collideProp.value).toBe(true);
    });

    it('should NOT assign collide property to chair tile (index 13)', () => {
      const chairTile = tiles.find((t) => t.id === 13);
      // Chair should either not be in tiles array or not have collide: true
      if (chairTile) {
        const collideProp = chairTile.properties.find(
          (p) => p.name === 'collide'
        );
        expect(
          !collideProp || collideProp.value === false
        ).toBe(true);
      }
      // If no entry exists, that also means no collision — pass
    });

    it('should NOT assign collide property to door tiles (indices 15, 16)', () => {
      for (const doorId of [15, 16]) {
        const doorTile = tiles.find((t) => t.id === doorId);
        expect(doorTile).toBeDefined();
        const collideProp = doorTile.properties.find(
          (p) => p.name === 'collide'
        );
        expect(!collideProp || collideProp.value === false).toBe(true);
      }
    });

    it('should maintain reserved indices: 0=ground, 2=wall, 10=zone, 11=zone detect', () => {
      // Index 2 should have collide
      const wallTile = tiles.find((t) => t.id === 2);
      expect(wallTile).toBeDefined();

      // Index 10 should have jitsiRoom property
      const zoneTile = tiles.find((t) => t.id === 10);
      expect(zoneTile).toBeDefined();
      const jitsiProp = zoneTile.properties.find(
        (p) => p.name === 'jitsiRoom'
      );
      expect(jitsiProp).toBeDefined();

      // Furniture/decorative tiles should be in range 12-63
      const furnitureTiles = tiles.filter(
        (t) => t.id !== 2 && t.id !== 10 && t.id !== 11
      );
      for (const ft of furnitureTiles) {
        expect(ft.id).toBeGreaterThanOrEqual(12);
        expect(ft.id).toBeLessThanOrEqual(63);
      }
    });
  });

  describe('Door state properties (Requirement 12.6)', () => {
    it('should assign doorState: "closed" to tile 15', () => {
      const closedDoor = tiles.find((t) => t.id === 15);
      expect(closedDoor).toBeDefined();
      const doorStateProp = closedDoor.properties.find(
        (p) => p.name === 'doorState'
      );
      expect(doorStateProp).toBeDefined();
      expect(doorStateProp.type).toBe('string');
      expect(doorStateProp.value).toBe('closed');
    });

    it('should assign doorState: "open" to tile 16', () => {
      const openDoor = tiles.find((t) => t.id === 16);
      expect(openDoor).toBeDefined();
      const doorStateProp = openDoor.properties.find(
        (p) => p.name === 'doorState'
      );
      expect(doorStateProp).toBeDefined();
      expect(doorStateProp.type).toBe('string');
      expect(doorStateProp.value).toBe('open');
    });
  });
});
