import { describe, expect, it } from 'vitest';

import { buildCatalog, encodePng, pngIhdrSize, pngSignatureOk } from '../src/media.js';
import { keccak256 } from 'viem';

describe('encodePng', () => {
  it('writes a PNG signature and IHDR size', () => {
    const bytes = encodePng(300, 250, 7);
    expect(pngSignatureOk(bytes)).toBe(true);
    expect(pngIhdrSize(bytes)).toEqual({ width: 300, height: 250 });
  });

  it('is deterministic per seed', () => {
    const a = encodePng(160, 600, 3);
    const b = encodePng(160, 600, 3);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(keccak256(a)).toBe(keccak256(b));
  });

  it('builds a catalog covering IAB sizes', () => {
    const cat = buildCatalog(1);
    expect(cat.some((x) => x.width === 300 && x.height === 250)).toBe(true);
    expect(cat.some((x) => x.name.endsWith('.png'))).toBe(true);
  });
});
