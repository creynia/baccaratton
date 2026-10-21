// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';

const ICONS: Record<string, number> = {
  'icon-192.png': 192,
  'icon-512.png': 512,
  'icon-maskable-512.png': 512,
  'apple-touch-icon.png': 180,
};

describe('gen-icons', () => {
  beforeAll(() => {
    execFileSync('node', ['scripts/gen-icons.mjs'], { stdio: 'pipe' });
  });

  for (const [name, size] of Object.entries(ICONS)) {
    it(`${name} is a ${size}x${size} PNG`, () => {
      const buf = readFileSync(`public/icons/${name}`);
      expect([...buf.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(buf.subarray(12, 16).toString('ascii')).toBe('IHDR');
      expect(buf.readUInt32BE(16)).toBe(size);
      expect(buf.readUInt32BE(20)).toBe(size);
    });
  }
});

/** First pixel (RGBA) of a PNG written by gen-icons (filter type 0 on every row). */
function firstPixel(file: string): number[] {
  const buf = readFileSync(file);
  const idat: Buffer[] = [];
  for (let at = 8; at < buf.length;) {
    const len = buf.readUInt32BE(at);
    if (buf.subarray(at + 4, at + 8).toString('ascii') === 'IDAT')
      idat.push(buf.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  return [...raw.subarray(1, 5)];
}

describe('icon colours (D10)', () => {
  it('the full-bleed maskable icon is burgundy #5c1a2b', () => {
    expect(firstPixel('public/icons/icon-maskable-512.png')).toEqual([0x5c, 0x1a, 0x2b, 255]);
  });
  it('the rounded icons are transparent in the corner', () => {
    expect(firstPixel('public/icons/icon-512.png')[3]).toBe(0);
  });
});

describe('manifest', () => {
  const m = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8')) as {
    short_name: string;
    theme_color: string;
    background_color: string;
    display: string;
    icons: { src: string; purpose: string }[];
  };
  it('has the burgundy theme and standalone display', () => {
    expect(m.short_name).toBe('baccaratton');
    expect(m.theme_color).toBe('#5c1a2b');
    expect(m.background_color).toBe('#5c1a2b');
    expect(m.display).toBe('standalone');
  });
  it('lists a maskable icon and files that exist', () => {
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const i of m.icons) {
      expect(() => readFileSync(`public/${i.src}`)).not.toThrow();
    }
  });
});
