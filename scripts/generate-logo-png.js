/**
 * Generate a placeholder logo.png from the SVG concept
 * In production, replace public/logo.png with the actual brand image
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;
const px = Buffer.alloc(SIZE * SIZE * 4);

function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
}

function dist(x1,y1,x2,y2) { return Math.sqrt((x1-x2)**2+(y1-y2)**2); }

const cx = SIZE/2, cy = SIZE/2;

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const o = (y * SIZE + x) * 4;
    const d = dist(x, y, cx, cy);
    
    // Rounded square background
    const margin = 15;
    const radius = 30;
    const inSquare = x >= margin && x <= SIZE-margin && y >= margin && y <= SIZE-margin;
    
    if (inSquare) {
      // Dark space background
      const grad = 0.3 + (d / SIZE) * 0.2;
      px[o] = Math.floor(45 * grad);
      px[o+1] = Math.floor(55 * grad); 
      px[o+2] = Math.floor(70 * grad);
      px[o+3] = 255;
      
      // Inner circle (planet)
      const planetD = dist(x, y, cx, cy - 10);
      if (planetD < 70) {
        const pGrad = planetD / 70;
        px[o] = Math.floor(20 + 30 * (1 - pGrad));
        px[o+1] = Math.floor(50 + 40 * (1 - pGrad));
        px[o+2] = Math.floor(90 + 50 * (1 - pGrad));
      }
      
      // Orbit ring
      const ringD = Math.sqrt(((x-cx)/95)**2 + ((y-cy+10)/35)**2);
      if (Math.abs(ringD - 1) < 0.02) {
        px[o] = 150; px[o+1] = 180; px[o+2] = 200;
      }
      
      // "7" shape
      if (y >= cy - 40 && y <= cy + 30) {
        // Horizontal bar of 7
        if (y >= cy - 40 && y <= cy - 30 && x >= cx - 25 && x <= cx + 15) {
          px[o] = 200; px[o+1] = 220; px[o+2] = 232; px[o+3] = 230;
        }
        // Diagonal stroke of 7
        const expectedX = cx + 15 - (y - (cy - 30)) * 0.6;
        if (Math.abs(x - expectedX) < 5 && y > cy - 30) {
          px[o] = 200; px[o+1] = 220; px[o+2] = 232; px[o+3] = 230;
        }
      }
      
      // Stars (small dots)
      const stars = [[90,90],[100,100],[85,110],[95,85],[110,95],[88,95],[105,110],[92,105]];
      for (const [sx, sy] of stars) {
        if (dist(x, y, sx, sy) < 2) {
          px[o] = 255; px[o+1] = 255; px[o+2] = 255; px[o+3] = 200;
        }
      }
      
      // White border
      if (x <= margin + 3 || x >= SIZE - margin - 3 || y <= margin + 3 || y >= SIZE - margin - 3) {
        px[o] = 220; px[o+1] = 225; px[o+2] = 230; px[o+3] = 255;
      }
      
      // "7Gather" text area (bottom)
      if (y >= cy + 50 && y <= cy + 65 && x >= cx - 40 && x <= cx + 40) {
        px[o] = 180; px[o+1] = 200; px[o+2] = 220; px[o+3] = 200;
      }
    }
  }
}

function createPNG(width, height, rgbaData) {
  const signature = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width,0); ihdr.writeUInt32BE(height,4); ihdr[8]=8; ihdr[9]=6;
  const ihdrChunk = createChunk('IHDR',ihdr);
  const rawData = Buffer.alloc(height*(1+width*4));
  for(let y=0;y<height;y++){rawData[y*(1+width*4)]=0;rgbaData.copy(rawData,y*(1+width*4)+1,y*width*4,(y+1)*width*4)}
  const compressed = zlib.deflateSync(rawData);
  return Buffer.concat([signature,ihdrChunk,createChunk('IDAT',compressed),createChunk('IEND',Buffer.alloc(0))]);
}
function createChunk(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const tb=Buffer.from(t);const cd=Buffer.concat([tb,d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc32(cd));return Buffer.concat([l,tb,d,c])}
function crc32(b){let c=0xFFFFFFFF;for(let i=0;i<b.length;i++){c^=b[i];for(let j=0;j<8;j++)c=(c>>>1)^(c&1?0xEDB88320:0)}return(c^0xFFFFFFFF)>>>0}

const png = createPNG(SIZE, SIZE, px);
const outputPath = path.join(__dirname, '..', 'public', 'logo.png');
fs.writeFileSync(outputPath, png);
console.log('Generated placeholder logo.png (256x256)');
console.log('Replace with actual brand image at: public/logo.png');
