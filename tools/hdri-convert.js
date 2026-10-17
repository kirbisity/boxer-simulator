// Turn Radiance .hdr panoramas (Poly Haven, CC0) into the small data module the
// photo-hdri look embeds: each is box-downscaled in linear light to a given
// width (equirectangular, 2:1), re-encoded as RGBE with a few mantissa bits
// dropped, laid out in planes (exponent, then R, G, B: smooth planes deflate
// well) and deflated; the module holds them as base64.
//
// Standard library only (node:fs, node:zlib).
//
//   node tools/hdri-convert.js src/looks/photo-hdri-data.js sky=sky_1k.hdr:512 hall=hall_1k.hdr:256
//   node tools/hdri-convert.js --preview out.png sky_1k.hdr      a tone-mapped look at one file
//
// Run once; the output is committed. The browser side is src/looks/photo-hdri.js.

import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

/** Radiance .hdr (new-style RLE or flat) to { width, height, data: Float32Array rgb }. */
export function readRadiance(buffer) {
  let position = 0;
  const line = () => {
    const start = position;
    while (buffer[position] !== 10) position += 1;
    position += 1;
    return buffer.toString('latin1', start, position - 1);
  };
  if (!line().startsWith('#?')) throw new Error('not a Radiance file');
  while (line() !== '');
  const [, height, , width] = line().split(' ');
  const w = Number(width);
  const h = Number(height);
  const data = new Float32Array(w * h * 3);
  const scan = new Uint8Array(w * 4);
  for (let y = 0; y < h; y += 1) {
    if (buffer[position] === 2 && buffer[position + 1] === 2 && !(buffer[position + 2] & 128)) {
      position += 4;
      for (let channel = 0; channel < 4; channel += 1) {
        let x = 0;
        while (x < w) {
          let count = buffer[position++];
          if (count > 128) {
            count -= 128;
            const value = buffer[position++];
            for (let i = 0; i < count; i += 1) scan[(x++) * 4 + channel] = value;
          } else {
            for (let i = 0; i < count; i += 1) scan[(x++) * 4 + channel] = buffer[position++];
          }
        }
      }
    } else {
      for (let i = 0; i < w * 4; i += 1) scan[i] = buffer[position++];
    }
    for (let x = 0; x < w; x += 1) {
      const e = scan[x * 4 + 3];
      const scale = e === 0 ? 0 : 2 ** (e - 136);
      for (let c = 0; c < 3; c += 1) data[(y * w + x) * 3 + c] = scan[x * 4 + c] * scale;
    }
  }
  return { width: w, height: h, data };
}

/** Box average down to a width (a whole factor of the source width). */
export function downscale({ width, height, data }, targetWidth) {
  const factor = Math.round(width / targetWidth);
  const w = Math.floor(width / factor);
  const h = Math.floor(height / factor);
  const out = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      for (let c = 0; c < 3; c += 1) {
        let sum = 0;
        for (let j = 0; j < factor; j += 1) for (let i = 0; i < factor; i += 1) sum += data[((y * factor + j) * width + x * factor + i) * 3 + c];
        out[(y * w + x) * 3 + c] = sum / (factor * factor);
      }
    }
  }
  return { width: w, height: h, data: out };
}

function encodeRgbe(r, g, b, dropBits) {
  const peak = Math.max(r, g, b);
  if (peak < 1e-32) return [0, 0, 0, 0];
  const exponent = Math.ceil(Math.log2(peak + 1e-12));
  let e = exponent;
  let scale = 256 / 2 ** e;
  if (peak * scale >= 256) {
    e += 1;
    scale = 256 / 2 ** e;
  }
  const q = (v) => (Math.min(255, Math.round(v * scale)) >> dropBits) << dropBits;
  return [q(r), q(g), q(b), e + 128];
}

function planar({ width, height, data }, dropBits) {
  const count = width * height;
  const out = Buffer.alloc(count * 4);
  for (let i = 0; i < count; i += 1) {
    const [r, g, b, e] = encodeRgbe(data[i * 3], data[i * 3 + 1], data[i * 3 + 2], dropBits);
    out[i] = e;
    out[count + i] = r;
    out[2 * count + i] = g;
    out[3 * count + i] = b;
  }
  return out;
}

// ---- A tone-mapped PNG, to look at an HDRI --------------------------------------

function crcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}
const CRC = crcTable();
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, payload) {
  const out = Buffer.alloc(12 + payload.length);
  out.writeUInt32BE(payload.length, 0);
  out.write(type, 4, 'latin1');
  payload.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + payload.length)), 8 + payload.length);
  return out;
}
export function previewPng({ width, height, data }, exposure = 1) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let c = 0; c < 3; c += 1) {
        const v = data[(y * width + x) * 3 + c] * exposure;
        // Reinhard-ish then sRGB
        const t = v / (1 + v);
        raw[y * (width * 3 + 1) + 1 + x * 3 + c] = Math.round(255 * t ** (1 / 2.2));
      }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---- main ---------------------------------------------------------------------

const DROP_BITS = 1;

if (process.argv[2] === '--preview') {
  const image = readRadiance(readFileSync(process.argv[4]));
  let peak = 0;
  for (const v of image.data) peak = Math.max(peak, v);
  console.log(`${image.width}x${image.height}, peak ${peak.toFixed(1)}`);
  writeFileSync(process.argv[3], previewPng(image, Number(process.argv[5] ?? 1)));
} else if (process.argv[1].endsWith('hdri-convert.js')) {
  const [out, ...specs] = process.argv.slice(2);
  const entries = specs.map((spec) => {
    const [name, rest] = spec.split('=');
    const [file, widthText] = rest.split(':');
    const small = downscale(readRadiance(readFileSync(file)), Number(widthText));
    const packed = deflateSync(planar(small, DROP_BITS), { level: 9 });
    console.log(`${name}: ${small.width}x${small.height}, ${packed.length} bytes deflated, ${Math.ceil(packed.length / 3) * 4} base64`);
    return `  ${name}: { width: ${small.width}, height: ${small.height}, deflated: '${packed.toString('base64')}' },`;
  });
  const header = [
    '// Generated by tools/hdri-convert.js from Poly Haven HDRIs (CC0, see docs/credits-photo-hdri.md). Do not edit.',
    '// Each: an equirectangular panorama as RGBE planes (exponent, R, G, B), zlib-deflated, base64.',
  ];
  writeFileSync(out, `${header.join('\n')}\nexport const PHOTO_HDRI_DATA = {\n${entries.join('\n')}\n};\n`);
}
