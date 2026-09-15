import { deflateSync } from 'node:zlib';

import { keccak256 } from 'viem';

const PNG_SIG = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

export type MediaAsset = {
  name: string;
  width: number;
  height: number;
  bytes: Uint8Array;
  hash: `0x${string}`;
};

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeB = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcSrc = Buffer.concat([typeB, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcSrc));
  return Buffer.concat([len, typeB, data, crc]);
}

/** Deterministic truecolor PNG (filter-none scanlines). PIL/sniff compatible. */
export function encodePng(width: number, height: number, seed: number): Uint8Array {
  let a = seed >>> 0;
  const rng = (): number => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = Math.floor(rng() * 180) + 40;
  const g = Math.floor(rng() * 180) + 40;
  const b = Math.floor(rng() * 80) + 160;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 3;
      const t = x / Math.max(1, width);
      raw[i] = r;
      raw[i + 1] = Math.min(255, g + Math.floor(t * 50));
      raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    PNG_SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const SIZES: Array<[number, number]> = [
  [300, 250],
  [728, 90],
  [970, 250],
  [160, 600],
];

export function buildCatalog(seed: number): MediaAsset[] {
  const items: MediaAsset[] = [];
  let i = 0;
  for (const [width, height] of SIZES) {
    for (let v = 0; v < 3; v++) {
      const bytes = encodePng(width, height, seed + i * 17 + v);
      const name = `${width}x${height}-${v}.png`;
      items.push({
        name,
        width,
        height,
        bytes,
        hash: keccak256(bytes),
      });
      i += 1;
    }
  }
  return items;
}

export function assetForSize(catalog: MediaAsset[], width: number, height: number): MediaAsset {
  const match = catalog.find((a) => a.width === width && a.height === height);
  if (match) return match;
  const fallback = catalog[0];
  if (!fallback) throw new Error('empty media catalog');
  return fallback;
}

export function pngSignatureOk(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 137 &&
    bytes[1] === 80 &&
    bytes[2] === 78 &&
    bytes[3] === 71 &&
    bytes[4] === 13 &&
    bytes[5] === 10 &&
    bytes[6] === 26 &&
    bytes[7] === 10
  );
}

export function pngIhdrSize(bytes: Uint8Array): { width: number; height: number } {
  // signature 8 + len 4 + 'IHDR' 4 = 16, then width/height
  const buf = Buffer.from(bytes);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
