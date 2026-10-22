/**
 * Generates the myWorld launcher icons for Android.
 *
 * Android 8 and older (API 24-25) cannot use the adaptive icon, so they need
 * real PNG files. They are drawn here from the same colours and the same moon
 * and stars as the vector icon, so the app looks the same everywhere.
 *
 * Run with: node scripts/generate-android-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RES = join(ROOT, 'android', 'app', 'src', 'main', 'res');

const DENSITIES = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];

/** The canvas the vector icon uses. */
const CANVAS = 108;

/** Moon: outer circle minus the inner circle, in canvas units. */
const MOON = { x: 48, y: 56, r: 25, cutX: 57, cutY: 49, cutR: 23 };
/** Four pointed stars, drawn as astroids. */
const STARS = [
  { x: 71, y: 40, r: 10, color: [252, 211, 77] },
  { x: 33, y: 37, r: 4.5, color: [245, 243, 255], alpha: 0.92 },
  { x: 75, y: 66, r: 3.2, color: [125, 211, 252], alpha: 0.85 },
];

const BACKGROUND_STOPS = [
  { at: 0, color: [42, 31, 74] },
  { at: 0.55, color: [22, 22, 42] },
  { at: 1, color: [18, 18, 31] },
];
const MOON_STOPS = [
  { at: 0, color: [233, 213, 255] },
  { at: 0.5, color: [196, 181, 253] },
  { at: 1, color: [167, 139, 250] },
];

function gradientAt(stops, t) {
  const clamped = Math.min(1, Math.max(0, t));
  let lower = stops[0];
  let upper = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i += 1) {
    if (clamped >= stops[i].at && clamped <= stops[i + 1].at) {
      lower = stops[i];
      upper = stops[i + 1];
      break;
    }
  }
  const span = upper.at - lower.at;
  const ratio = span === 0 ? 0 : (clamped - lower.at) / span;
  return [
    Math.round(lower.color[0] + (upper.color[0] - lower.color[0]) * ratio),
    Math.round(lower.color[1] + (upper.color[1] - lower.color[1]) * ratio),
    Math.round(lower.color[2] + (upper.color[2] - lower.color[2]) * ratio),
  ];
}

/** A four pointed star: |x|^0.5 + |y|^0.5 <= 1 in star space. */
function insideStar(star, x, y) {
  const dx = Math.abs(x - star.x) / star.r;
  const dy = Math.abs(y - star.y) / star.r;
  if (dx > 1 || dy > 1) return false;
  return Math.sqrt(dx) + Math.sqrt(dy) <= 1;
}

function insideMoon(x, y) {
  const outer = Math.hypot(x - MOON.x, y - MOON.y) <= MOON.r;
  if (!outer) return false;
  const cut = Math.hypot(x - MOON.cutX, y - MOON.cutY) <= MOON.cutR;
  return !cut;
}

/** Rounded square used by the square launcher icon. */
function insideSquare(x, y, size, radius) {
  const dx = Math.max(Math.abs(x - size / 2) - (size / 2 - radius), 0);
  const dy = Math.max(Math.abs(y - size / 2) - (size / 2 - radius), 0);
  return Math.hypot(dx, dy) <= radius;
}

function insideCircle(x, y, size) {
  return Math.hypot(x - size / 2, y - size / 2) <= size / 2;
}

/**
 * Draws one icon.
 *
 * shape: 'square' for the normal launcher icon, 'circle' for the round one and
 * 'foreground' for the transparent foreground that themes pick up.
 */
function draw(size, shape) {
  const pixels = Buffer.alloc(size * size * 4);
  const samples = 3;
  // The art is drawn a little larger on the old icons, because there is no
  // launcher mask that crops them.
  const artScale = shape === 'foreground' ? 1 : 1.32;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const x = px + (sx + 0.5) / samples;
          const y = py + (sy + 0.5) / samples;

          let sample = [0, 0, 0, 0];

          if (shape !== 'foreground') {
            const inside =
              shape === 'circle'
                ? insideCircle(x, y, size)
                : insideSquare(x, y, size, size * 0.22);
            if (inside) {
              sample = [...gradientAt(BACKGROUND_STOPS, (x + y) / (2 * size)), 1];
            }
          }

          // Art space: the 108 unit canvas, scaled around its centre.
          const artX = CANVAS / 2 + ((x - size / 2) / size) * CANVAS * artScale;
          const artY = CANVAS / 2 + ((y - size / 2) / size) * CANVAS * artScale;

          let art = null;
          if (insideMoon(artX, artY)) {
            art = [...gradientAt(MOON_STOPS, (artX + artY - 60) / 90), 1];
          } else {
            for (const star of STARS) {
              if (insideStar(star, artX, artY)) {
                art = [...star.color, star.alpha ?? 1];
                break;
              }
            }
          }

          if (art) {
            const alpha = art[3];
            sample = [
              Math.round(art[0] * alpha + sample[0] * (1 - alpha)),
              Math.round(art[1] * alpha + sample[1] * (1 - alpha)),
              Math.round(art[2] * alpha + sample[2] * (1 - alpha)),
              Math.max(sample[3], alpha),
            ];
          }

          r += sample[0];
          g += sample[1];
          b += sample[2];
          a += sample[3];
        }
      }

      const total = samples * samples;
      const index = (py * size + px) * 4;
      pixels[index] = Math.round(r / total);
      pixels[index + 1] = Math.round(g / total);
      pixels[index + 2] = Math.round(b / total);
      pixels[index + 3] = Math.round((a / total) * 255);
    }
  }

  return pixels;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // truecolour with alpha
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [density, size] of DENSITIES) {
  const folder = join(RES, `mipmap-${density}`);
  mkdirSync(folder, { recursive: true });

  writeFileSync(join(folder, 'ic_launcher.png'), encodePng(size, size, draw(size, 'square')));
  writeFileSync(join(folder, 'ic_launcher_round.png'), encodePng(size, size, draw(size, 'circle')));
  writeFileSync(
    join(folder, 'ic_launcher_foreground.png'),
    encodePng(Math.round(size * 1.5), Math.round(size * 1.5), draw(Math.round(size * 1.5), 'foreground')),
  );

  console.log(`mipmap-${density}: ${size}x${size}`);
}
