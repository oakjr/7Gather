const fs = require('fs');
const zlib = require('zlib');
const W = 32, H = 32;
const px = Buffer.alloc(W * H * 4);
const cx = 16, cy = 16, r = 13;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    if (d <= r) { px[o] = 108; px[o+1] = 99; px[o+2] = 255; px[o+3] = 255; }
  }
}
function c32(b){let c=0xFFFFFFFF;for(let i=0;i<b.length;i++){c^=b[i];for(let j=0;j<8;j++)c=(c>>>1)^(c&1?0xEDB88320:0)}return(c^0xFFFFFFFF)>>>0}
function ch(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const tb=Buffer.from(t);const cd=Buffer.concat([tb,d]);const cr=Buffer.alloc(4);cr.writeUInt32BE(c32(cd));return Buffer.concat([l,tb,d,cr])}
const sig = Buffer.from([137,80,78,71,13,10,26,10]);
const ih = Buffer.alloc(13); ih.writeUInt32BE(W,0); ih.writeUInt32BE(H,4); ih[8]=8; ih[9]=6;
const raw = Buffer.alloc(H*(1+W*4));
for(let y=0;y<H;y++){raw[y*(1+W*4)]=0;px.copy(raw,y*(1+W*4)+1,y*W*4,(y+1)*W*4)}
const comp = zlib.deflateSync(raw);
fs.writeFileSync('public/favicon.png', Buffer.concat([sig, ch('IHDR',ih), ch('IDAT',comp), ch('IEND',Buffer.alloc(0))]));
console.log('Generated public/favicon.png');
