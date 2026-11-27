import dns from 'dns/promises';
import fs from 'fs';
import net from 'net';
import path from 'path';

export interface CoverImageAsset {
  buffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png';
  ext: 'jpg' | 'png';
  sourceUrl: string;
}

export interface AudioTagMetadata {
  title?: string;
  artist?: string;
  album?: string;
  comment?: string;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_COVER_BYTES = 10 * 1024 * 1024;
const PUBLIC_ROOT = path.resolve(process.cwd(), 'public');

export function isPrivateOrReservedIp(ipRaw: string): boolean {
  const ip = ipRaw.trim().toLowerCase();
  if (!ip) return true;

  if (ip === '::1' || ip === '::') return true;
  if (ip.startsWith('::ffff:')) {
    return isPrivateOrReservedIp(ip.slice(7));
  }
  if (ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) {
    return true;
  }

  const ipv4Match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
  }

  return false;
}

export async function assertSafePublicHttpUrl(rawUrl: string): Promise<URL> {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http/https URLs are allowed');
  }
  const host = parsed.hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new Error('Private or local hostnames are not allowed');
  }

  if (net.isIP(host)) {
    if (isPrivateOrReservedIp(host)) {
      throw new Error('Private IP addresses are not allowed');
    }
    return parsed;
  }

  try {
    const records = await dns.lookup(host, { all: true });
    if (!records || records.length === 0) {
      throw new Error('Host resolution failed');
    }
    for (const rec of records) {
      if (isPrivateOrReservedIp(rec.address)) {
        throw new Error('Resolved private IP addresses are not allowed');
      }
    }
  } catch (err: any) {
    if (err?.message?.includes('not allowed') || err?.message?.includes('failed')) {
      throw err;
    }
    throw new Error('Unable to verify target host safety');
  }

  return parsed;
}

export function detectImageBufferType(buf: Buffer): { mimeType: 'image/jpeg' | 'image/png'; ext: 'jpg' | 'png' } | null {
  if (!Buffer.isBuffer(buf) || buf.length < 32 || buf.length > MAX_COVER_BYTES) {
    return null;
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mimeType: 'image/jpeg', ext: 'jpg' };
  }
  if (buf.subarray(0, 8).equals(PNG_MAGIC)) {
    return { mimeType: 'image/png', ext: 'png' };
  }
  return null;
}

export async function fetchSafeExternalImage(rawUrl: string, timeoutMs = 4500): Promise<CoverImageAsset | null> {
  let currentUrl = rawUrl;
  for (let hop = 0; hop <= 3; hop++) {
    const safeUrl = await assertSafePublicHttpUrl(currentUrl);
    const resp = await fetch(safeUrl.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'image/jpeg,image/png;q=0.95,image/*;q=0.5',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get('location');
      if (!location || hop === 3) return null;
      currentUrl = new URL(location, safeUrl).toString();
      continue;
    }

    if (!resp.ok) return null;

    const declaredLen = Number(resp.headers.get('content-length') || 0) || 0;
    if (declaredLen > MAX_COVER_BYTES) return null;

    const buf = Buffer.from(await resp.arrayBuffer());
    const detected = detectImageBufferType(buf);
    if (!detected) return null;

    return {
      buffer: buf,
      mimeType: detected.mimeType,
      ext: detected.ext,
      sourceUrl: safeUrl.toString(),
    };
  }
  return null;
}

export function expandHighResCoverCandidates(rawUrl?: string | null): string[] {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('data:image/') || trimmed.startsWith('/assets/')) {
    return [trimmed];
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return [trimmed];
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return [trimmed];
  }

  const host = parsed.hostname.toLowerCase();
  const candidates: string[] = [];

  // 1. YouTube thumbnails: strictly prioritize maxresdefault (1280x720) -> sddefault (640x480) -> hqdefault (480x360)
  if (/(?:^|\.)ytimg\.com$/i.test(host)) {
    const ytMatch = parsed.pathname.match(
      /\/vi(?:_webp)?\/([A-Za-z0-9_-]{11})\/([a-z0-9_]+)\.(?:jpg|jpeg|webp)/i
    );
    if (ytMatch?.[1]) {
      const vid = ytMatch[1];
      const variant = ytMatch[2].toLowerCase();
      candidates.push(`https://i.ytimg.com/vi/${vid}/maxresdefault.jpg`);
      if (
        variant !== 'maxresdefault' &&
        variant !== 'sddefault' &&
        variant !== 'hqdefault' &&
        variant !== 'mqdefault' &&
        variant !== 'default'
      ) {
        candidates.push(trimmed);
      }
      candidates.push(`https://i.ytimg.com/vi/${vid}/sddefault.jpg`);
      candidates.push(`https://i.ytimg.com/vi/${vid}/hqdefault.jpg`);
      return [...new Set(candidates)];
    }
  }

  // 2. Apple / iTunes artwork: upgrade 60/100px URLs up to 3000x3000 / 1400x1400 / 1000x1000 masters
  if (/mzstatic\.com$/i.test(host)) {
    const itunesPattern = /\/\d+x\d+bb(?:-\d+)?\.(?:jpg|jpeg|png|webp)(\?.*)?$/i;
    if (itunesPattern.test(trimmed)) {
      candidates.push(
        trimmed.replace(itunesPattern, '/3000x3000bb.jpg'),
        trimmed.replace(itunesPattern, '/1400x1400bb.jpg'),
        trimmed.replace(itunesPattern, '/1000x1000bb.jpg'),
        trimmed
      );
      return [...new Set(candidates)];
    }
  }

  // 3. Google / YouTube Music artwork: upgrade =w120-h120 / =s176 sizes up to 1600px
  if (/(?:^|\.)(?:googleusercontent\.com|ggpht\.com)$/i.test(host)) {
    if (/=w\d+-h\d+[^/?&]*/i.test(trimmed)) {
      candidates.push(
        trimmed.replace(/=w\d+-h\d+[^/?&]*/i, '=w1600-h1600-l95-rj'),
        trimmed.replace(/=w\d+-h\d+[^/?&]*/i, '=w1200-h1200-l90-rj')
      );
    }
    if (/=s\d+[^/?&]*/i.test(trimmed)) {
      candidates.push(
        trimmed.replace(/=s\d+([^/?&]*)/i, '=s1600$1'),
        trimmed.replace(/=s\d+[^/?&]*/i, '=s1600')
      );
    }
    candidates.push(trimmed);
    return [...new Set(candidates)];
  }

  // 4. SoundCloud artwork: upgrade small/large thumbnails to -original / -t500x500
  if (/sndcdn\.com$/i.test(host)) {
    const scPattern = /-(?:tiny|small|badge|t67x67|large|t300x300|crop|t500x500)\.(?:jpg|jpeg|png|webp)(\?.*)?$/i;
    if (scPattern.test(trimmed)) {
      candidates.push(
        trimmed.replace(scPattern, '-original.jpg'),
        trimmed.replace(scPattern, '-t500x500.jpg'),
        trimmed
      );
      return [...new Set(candidates)];
    }
  }

  // 5. Bilibili artwork: strip resize suffix (@...w_...h) to fetch original high-res image
  if (/hdslb\.com$/i.test(host)) {
    const biliPattern = /\.(jpg|jpeg|png|webp)@\d+w.*$/i;
    if (biliPattern.test(trimmed)) {
      candidates.push(trimmed.replace(biliPattern, '.$1'), trimmed);
      return [...new Set(candidates)];
    }
  }

  return [trimmed];
}

export async function fetchBestCoverImage(
  candidates: Array<string | undefined | null>,
  timeoutMs = 4500
): Promise<CoverImageAsset | null> {
  const seen = new Set<string>();
  for (const rawCandidate of candidates) {
    const candidate = String(rawCandidate || '').trim();
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);

    try {
      if (candidate.startsWith('data:image/')) {
        const match = candidate.match(/^data:image\/(?:jpeg|jpg|png);base64,([A-Za-z0-9+/=]+)$/i);
        if (match?.[1]) {
          const buf = Buffer.from(match[1], 'base64');
          const detected = detectImageBufferType(buf);
          if (detected) {
            return {
              buffer: buf,
              mimeType: detected.mimeType,
              ext: detected.ext,
              sourceUrl: candidate.slice(0, 64),
            };
          }
        }
        continue;
      }

      if (candidate.startsWith('/assets/')) {
        const rel = candidate.replace(/^\/+/, '');
        const resolvedPath = path.resolve(PUBLIC_ROOT, rel);
        if (resolvedPath.startsWith(PUBLIC_ROOT + path.sep) && fs.existsSync(resolvedPath)) {
          const buf = await fs.promises.readFile(resolvedPath);
          const detected = detectImageBufferType(buf);
          if (detected) {
            return {
              buffer: buf,
              mimeType: detected.mimeType,
              ext: detected.ext,
              sourceUrl: candidate,
            };
          }
        }
        continue;
      }

      if (/^https?:\/\//i.test(candidate)) {
        const fetched = await fetchSafeExternalImage(candidate, timeoutMs);
        if (fetched) return fetched;
      }
    } catch {
      // Try next cover candidate
    }
  }
  return null;
}

// ---------- Pure-Node ID3v2.3 Tag + APIC Embedder (for .mp3) ----------

function encodeSynchsafeInt(value: number): Buffer {
  const b = Buffer.alloc(4);
  b[0] = (value >> 21) & 0x7f;
  b[1] = (value >> 14) & 0x7f;
  b[2] = (value >> 7) & 0x7f;
  b[3] = value & 0x7f;
  return b;
}

function decodeSynchsafeInt(buf: Buffer, offset: number): number {
  return (
    ((buf[offset] & 0x7f) << 21) |
    ((buf[offset + 1] & 0x7f) << 14) |
    ((buf[offset + 2] & 0x7f) << 7) |
    (buf[offset + 3] & 0x7f)
  );
}

function makeId3v23Frame(frameId: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(10);
  header.write(frameId.slice(0, 4), 0, 4, 'ascii');
  header.writeUInt32BE(payload.length, 4);
  header.writeUInt16BE(0, 8);
  return Buffer.concat([header, payload]);
}

function makeId3TextFrame(frameId: string, text: string): Buffer {
  const bom = Buffer.from([0x01, 0xff, 0xfe]); // UTF-16 LE with BOM (ID3v2.3 compatible everywhere including iOS/macOS)
  const encoded = Buffer.from(text, 'utf16le');
  return makeId3v23Frame(frameId, Buffer.concat([bom, encoded]));
}

function makeId3ApicFrame(cover: CoverImageAsset): Buffer {
  const encoding = Buffer.from([0x00]); // ISO-8859-1 MIME + description
  const mime = Buffer.from(`${cover.mimeType}\0`, 'ascii');
  const picTypeAndDesc = Buffer.from([0x03, 0x00]); // Front Cover (0x03) + empty description NUL
  return makeId3v23Frame('APIC', Buffer.concat([encoding, mime, picTypeAndDesc, cover.buffer]));
}

export function embedCoverIntoMp3Buffer(
  mp3Buffer: Buffer,
  meta: AudioTagMetadata,
  cover: CoverImageAsset | null
): Buffer {
  if (!Buffer.isBuffer(mp3Buffer) || mp3Buffer.length < 16) return mp3Buffer;

  let audioStart = 0;
  if (
    mp3Buffer.length >= 10 &&
    mp3Buffer[0] === 0x49 && // 'I'
    mp3Buffer[1] === 0x44 && // 'D'
    mp3Buffer[2] === 0x33 && // '3'
    mp3Buffer[6] < 0x80 &&
    mp3Buffer[7] < 0x80 &&
    mp3Buffer[8] < 0x80 &&
    mp3Buffer[9] < 0x80
  ) {
    const tagSize = decodeSynchsafeInt(mp3Buffer, 6);
    const hasFooter = (mp3Buffer[5] & 0x10) !== 0;
    const endOffset = 10 + tagSize + (hasFooter ? 10 : 0);
    if (endOffset > 10 && endOffset < mp3Buffer.length) {
      audioStart = endOffset;
    }
  }

  const frames: Buffer[] = [];
  if (meta.title?.trim()) frames.push(makeId3TextFrame('TIT2', meta.title.trim()));
  if (meta.artist?.trim()) frames.push(makeId3TextFrame('TPE1', meta.artist.trim()));
  if (meta.album?.trim()) frames.push(makeId3TextFrame('TALB', meta.album.trim()));
  if (cover) frames.push(makeId3ApicFrame(cover));

  if (frames.length === 0) return mp3Buffer;

  const body = Buffer.concat(frames);
  const tagHeader = Buffer.concat([
    Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]), // ID3v2.3.0
    encodeSynchsafeInt(body.length),
  ]);

  return Buffer.concat([tagHeader, body, mp3Buffer.subarray(audioStart)]);
}

// ---------- Pure-Node MP4 / M4A `moov/udta/meta/ilst` Tag + `covr` Embedder ----------

interface Mp4Box {
  type: string;
  start: number;
  headerSize: number;
  size: number;
}

function parseMp4Boxes(buf: Buffer, start: number, end: number): Mp4Box[] | null {
  const boxes: Mp4Box[] = [];
  let pos = start;
  while (pos + 8 <= end) {
    const rawSize = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    let headerSize = 8;
    let size = rawSize;

    if (rawSize === 1) {
      if (pos + 16 > end) return null;
      const bigSize = Number(buf.readBigUInt64BE(pos + 8));
      if (!Number.isFinite(bigSize) || bigSize < 16) return null;
      size = bigSize;
      headerSize = 16;
    } else if (rawSize === 0) {
      size = end - pos;
    } else if (rawSize < 8) {
      return null;
    }

    if (pos + size > end) return null;
    boxes.push({ type, start: pos, headerSize, size });
    pos += size;
  }
  return pos === end ? boxes : null;
}

function makeMp4Box(typeBytes: string | Buffer, payload: Buffer): Buffer {
  const typeBuf =
    typeof typeBytes === 'string' ? Buffer.from(typeBytes, 'latin1').subarray(0, 4) : typeBytes.subarray(0, 4);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + payload.length, 0);
  typeBuf.copy(header, 4);
  return Buffer.concat([header, payload]);
}

function makeMp4FullBox(type: string, versionFlags: number, payload: Buffer): Buffer {
  const vf = Buffer.alloc(4);
  vf.writeUInt32BE(versionFlags, 0);
  return makeMp4Box(type, Buffer.concat([vf, payload]));
}

function makeIlstTextAtom(atomType: Buffer, text: string): Buffer {
  const dataHeader = Buffer.alloc(8);
  dataHeader.writeUInt32BE(1, 0); // Well-known type 1 = UTF-8 text
  dataHeader.writeUInt32BE(0, 4);
  const dataBox = makeMp4Box('data', Buffer.concat([dataHeader, Buffer.from(text, 'utf8')]));
  return makeMp4Box(atomType, dataBox);
}

function makeIlstCoverAtom(cover: CoverImageAsset): Buffer {
  const dataHeader = Buffer.alloc(8);
  dataHeader.writeUInt32BE(cover.mimeType === 'image/png' ? 14 : 13, 0); // 13 = JPEG, 14 = PNG
  dataHeader.writeUInt32BE(0, 4);
  const dataBox = makeMp4Box('data', Buffer.concat([dataHeader, cover.buffer]));
  return makeMp4Box('covr', dataBox);
}

const MP4_CONTAINER_TYPES = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);

function shiftChunkOffsetsInContainer(buf: Buffer, start: number, end: number, delta: number): boolean {
  const boxes = parseMp4Boxes(buf, start, end);
  if (!boxes) return false;
  for (const box of boxes) {
    const contentStart = box.start + box.headerSize;
    const contentEnd = box.start + box.size;
    if (MP4_CONTAINER_TYPES.has(box.type)) {
      if (!shiftChunkOffsetsInContainer(buf, contentStart, contentEnd, delta)) {
        return false;
      }
    } else if (box.type === 'stco') {
      if (contentEnd - contentStart < 8) return false;
      const entryCount = buf.readUInt32BE(contentStart + 4);
      if (contentStart + 8 + entryCount * 4 > contentEnd) return false;
      for (let i = 0; i < entryCount; i++) {
        const off = contentStart + 8 + i * 4;
        const val = buf.readUInt32BE(off);
        const nextVal = val + delta;
        if (nextVal < 0 || nextVal > 0xffffffff) return false;
        buf.writeUInt32BE(nextVal, off);
      }
    } else if (box.type === 'co64') {
      if (contentEnd - contentStart < 8) return false;
      const entryCount = buf.readUInt32BE(contentStart + 4);
      if (contentStart + 8 + entryCount * 8 > contentEnd) return false;
      const bigDelta = BigInt(delta);
      for (let i = 0; i < entryCount; i++) {
        const off = contentStart + 8 + i * 8;
        const val = buf.readBigUInt64BE(off);
        const nextVal = val + bigDelta;
        if (nextVal < 0n) return false;
        buf.writeBigUInt64BE(nextVal, off);
      }
    }
  }
  return true;
}

export function embedCoverIntoMp4Buffer(
  mp4Buffer: Buffer,
  meta: AudioTagMetadata,
  cover: CoverImageAsset | null
): Buffer {
  try {
    if (!Buffer.isBuffer(mp4Buffer) || mp4Buffer.length < 32) return mp4Buffer;

    const topBoxes = parseMp4Boxes(mp4Buffer, 0, mp4Buffer.length);
    if (!topBoxes) return mp4Buffer;

    const moovBox = topBoxes.find((b) => b.type === 'moov');
    const mdatBox = topBoxes.find((b) => b.type === 'mdat');
    if (!moovBox || !mdatBox) return mp4Buffer;

    const ilstItems: Buffer[] = [];
    if (meta.title?.trim()) {
      ilstItems.push(makeIlstTextAtom(Buffer.from([0xa9, 0x6e, 0x61, 0x6d]), meta.title.trim())); // ©nam
    }
    if (meta.artist?.trim()) {
      ilstItems.push(makeIlstTextAtom(Buffer.from([0xa9, 0x41, 0x52, 0x54]), meta.artist.trim())); // ©ART
    }
    if (meta.album?.trim()) {
      ilstItems.push(makeIlstTextAtom(Buffer.from([0xa9, 0x61, 0x6c, 0x62]), meta.album.trim())); // ©alb
    }
    if (cover) {
      ilstItems.push(makeIlstCoverAtom(cover));
    }

    if (ilstItems.length === 0) return mp4Buffer;

    const hdlrPayload = Buffer.concat([
      Buffer.alloc(4), // pre_defined
      Buffer.from('mdir', 'ascii'),
      Buffer.from('appl', 'ascii'),
      Buffer.alloc(12), // reserved
      Buffer.from([0x00]),
    ]);
    const hdlrBox = makeMp4FullBox('hdlr', 0, hdlrPayload);
    const ilstBox = makeMp4Box('ilst', Buffer.concat(ilstItems));
    const metaBox = makeMp4FullBox('meta', 0, Buffer.concat([hdlrBox, ilstBox]));

    const moovInnerStart = moovBox.start + moovBox.headerSize;
    const moovInnerEnd = moovBox.start + moovBox.size;
    const moovChildren = parseMp4Boxes(mp4Buffer, moovInnerStart, moovInnerEnd);
    if (!moovChildren) return mp4Buffer;

    const keptMoovChildren: Buffer[] = [];
    let udtaNonMetaChildren: Buffer[] = [];

    for (const child of moovChildren) {
      if (child.type === 'udta') {
        const udtaChildren = parseMp4Boxes(
          mp4Buffer,
          child.start + child.headerSize,
          child.start + child.size
        );
        if (udtaChildren) {
          udtaNonMetaChildren = udtaChildren
            .filter((uc) => uc.type !== 'meta')
            .map((uc) => mp4Buffer.subarray(uc.start, uc.start + uc.size));
        }
      } else {
        keptMoovChildren.push(mp4Buffer.subarray(child.start, child.start + child.size));
      }
    }

    const newUdtaBox = makeMp4Box('udta', Buffer.concat([...udtaNonMetaChildren, metaBox]));
    const newMoovBox = makeMp4Box('moov', Buffer.concat([...keptMoovChildren, newUdtaBox]));
    const delta = newMoovBox.length - moovBox.size;

    const outParts: Buffer[] = [];
    for (const top of topBoxes) {
      if (top === moovBox) {
        outParts.push(newMoovBox);
      } else {
        outParts.push(mp4Buffer.subarray(top.start, top.start + top.size));
      }
    }

    const rebuilt = Buffer.concat(outParts);

    // If moov appeared before mdat, mdat and chunk offsets shifted by delta
    if (moovBox.start < mdatBox.start && delta !== 0) {
      let newMoovStart = 0;
      for (const top of topBoxes) {
        if (top === moovBox) break;
        newMoovStart += top.size;
      }
      const ok = shiftChunkOffsetsInContainer(
        rebuilt,
        newMoovStart + 8,
        newMoovStart + newMoovBox.length,
        delta
      );
      if (!ok) return mp4Buffer;
    }

    return rebuilt;
  } catch {
    return mp4Buffer;
  }
}

export async function embedMetadataAndCoverFile(
  filePath: string,
  ext: string,
  meta: AudioTagMetadata,
  cover: CoverImageAsset | null
): Promise<boolean> {
  const lower = ext.toLowerCase();
  if (lower !== 'mp3' && lower !== 'm4a' && lower !== 'mp4') {
    return false;
  }

  try {
    const raw = await fs.promises.readFile(filePath);
    let updated: Buffer | null = null;
    if (lower === 'mp3') {
      updated = embedCoverIntoMp3Buffer(raw, meta, cover);
    } else if (lower === 'm4a' || lower === 'mp4') {
      updated = embedCoverIntoMp4Buffer(raw, meta, cover);
    }

    if (updated && updated !== raw && updated.length > 0) {
      await fs.promises.writeFile(filePath, updated);
      return true;
    }
  } catch {
    // Keep original file untouched if tagging fails
  }
  return false;
}
