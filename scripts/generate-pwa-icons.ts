import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createCRC32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[n] = c >>> 0;
  }
  return table;
}

const crcTable = createCRC32Table();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

interface WaveArcSpec {
  topYNorm: number; // Top apex y relative to circle center (in units of R, negative = above center)
  arcRNorm: number; // Radius of arc in units of R
  halfAngleRad: number; // Angular half-span
  halfThickNorm: number; // Half stroke thickness in units of R
}

const WAVE_ARCS: WaveArcSpec[] = [
  { topYNorm: -0.32, arcRNorm: 2.1, halfAngleRad: 0.285, halfThickNorm: 0.084 },
  { topYNorm: -0.02, arcRNorm: 1.95, halfAngleRad: 0.252, halfThickNorm: 0.070 },
  { topYNorm: 0.25, arcRNorm: 1.8, halfAngleRad: 0.215, halfThickNorm: 0.058 },
];

const TILT_RAD = (8.5 * Math.PI) / 180;
const COS_TILT = Math.cos(TILT_RAD);
const SIN_TILT = Math.sin(TILT_RAD);

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function distanceToWaveArc(rx: number, ry: number, R: number, spec: WaveArcSpec): number {
  const arcR = spec.arcRNorm * R;
  const arcCenterY = spec.topYNorm * R + arcR;
  const halfThick = spec.halfThickNorm * R;

  const vx = rx;
  const vy = arcCenterY - ry;
  const angle = Math.atan2(vx, vy);

  let distToCenterline: number;
  if (Math.abs(angle) <= spec.halfAngleRad) {
    distToCenterline = Math.abs(Math.hypot(vx, vy) - arcR);
  } else {
    const clampedAngle = angle >= 0 ? spec.halfAngleRad : -spec.halfAngleRad;
    const ex = arcR * Math.sin(clampedAngle);
    const ey = arcR * Math.cos(clampedAngle);
    distToCenterline = Math.hypot(vx - ex, vy - ey);
  }

  return distToCenterline - halfThick;
}

function generatePng(size: number, options?: { isMaskable?: boolean; roundedBackground?: boolean }): Buffer {
  const width = size;
  const height = size;
  const rawBytes = Buffer.alloc(height * (1 + width * 4));

  const cx = width / 2;
  const cy = height / 2;
  const isMaskable = Boolean(options?.isMaskable);
  const roundedBackground = Boolean(options?.roundedBackground);
  const radius = isMaskable ? width * 0.325 : width * 0.375;
  const aaWidth = Math.max(0.75, width / 512);

  // Spotify Red & Black Palette
  const redR = 239; // #EF1D36
  const redG = 29;
  const redB = 54;
  const bgR = 0;
  const bgG = 0;
  const bgB = 0;

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawBytes[offset++] = 0; // Filter byte: None

    for (let x = 0; x < width; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.hypot(dx, dy);

      // Alpha coverage for optional rounded squircle background (favicon)
      let bgAlpha = 255;
      if (roundedBackground) {
        const halfBox = width * 0.48;
        const cornerR = width * 0.22;
        const qx = Math.abs(dx) - (halfBox - cornerR);
        const qy = Math.abs(dy) - (halfBox - cornerR);
        const sdfBox =
          Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
          Math.min(Math.max(qx, qy), 0) -
          cornerR;
        bgAlpha = Math.round((1 - smoothstep(-aaWidth, aaWidth, sdfBox)) * 255);
      }

      // Circle coverage (1 inside, 0 outside)
      const circleCov = 1 - smoothstep(-aaWidth, aaWidth, dist - radius);

      let redMask = 0;
      if (circleCov > 0) {
        // Inverse-rotate sample around center so wave arcs tilt clockwise by TILT_RAD
        const rx = dx * COS_TILT + dy * SIN_TILT;
        const ry = -dx * SIN_TILT + dy * COS_TILT;

        // Cut out each wave arc in black (#000000)
        let waveCutout = 0;
        for (const arc of WAVE_ARCS) {
          const sdfArc = distanceToWaveArc(rx, ry, radius, arc);
          const cov = 1 - smoothstep(-aaWidth, aaWidth, sdfArc);
          if (cov > waveCutout) waveCutout = cov;
        }
        redMask = circleCov * (1 - waveCutout);
      }

      const r = Math.round(bgR * (1 - redMask) + redR * redMask);
      const g = Math.round(bgG * (1 - redMask) + redG * redMask);
      const b = Math.round(bgB * (1 - redMask) + redB * redMask);

      rawBytes[offset++] = r;
      rawBytes[offset++] = g;
      rawBytes[offset++] = b;
      rawBytes[offset++] = bgAlpha;
    }
  }

  // PNG Signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8-bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // Deflate
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // No interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // IDAT
  const compressed = zlib.deflateSync(rawBytes, { level: 9 });
  const idatChunk = makeChunk('IDAT', compressed);

  // IEND
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function buildWaveArcSvgPath(R: number, cx: number, cy: number, spec: WaveArcSpec): string {
  const arcR = spec.arcRNorm * R;
  const arcCenterY = cy + spec.topYNorm * R + arcR;
  const x1 = cx - arcR * Math.sin(spec.halfAngleRad);
  const y1 = arcCenterY - arcR * Math.cos(spec.halfAngleRad);
  const x2 = cx + arcR * Math.sin(spec.halfAngleRad);
  const y2 = arcCenterY - arcR * Math.cos(spec.halfAngleRad);
  const strokeWidth = (spec.halfThickNorm * 2 * R).toFixed(2);
  return `<path d="M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${arcR.toFixed(2)} ${arcR.toFixed(2)} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}" fill="none" stroke="#000000" stroke-width="${strokeWidth}" stroke-linecap="round"/>`;
}

const publicDir = path.resolve(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Generate PWA icons (Spotify-inspired Red & Black theme)
console.log('Generating Spotify-style Red & Black PWA Icons...');
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), generatePng(192));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), generatePng(512));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), generatePng(512, { isMaskable: true }));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), generatePng(180));
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), generatePng(32, { roundedBackground: true }));

// SVG Icon matching exact geometry
const R = 192;
const wavePaths = WAVE_ARCS.map((spec) => buildWaveArcSvgPath(R, 256, 256, spec)).join('\n    ');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#000000"/>
  <circle cx="256" cy="256" r="${R}" fill="#EF1D36"/>
  <g transform="rotate(8.5 256 256)">
    ${wavePaths}
  </g>
</svg>
`;
fs.writeFileSync(path.join(publicDir, 'icon.svg'), svg, 'utf-8');

console.log('Spotify-style Red & Black PWA icons created successfully in public/');
