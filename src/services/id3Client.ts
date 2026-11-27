export interface ClientId3Metadata {
  title?: string;
  artist?: string;
  album?: string;
  coverDataUrl?: string;
}

function readSynchsafeInt(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) >>> 0) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  );
}

function decodeId3Text(bytes: Uint8Array): string {
  if (!bytes || bytes.length === 0) return '';
  const enc = bytes[0];
  const payload = bytes.subarray(1);
  try {
    if (enc === 1 || enc === 2) {
      const encoding = enc === 1 ? 'utf-16' : 'utf-16be';
      return new TextDecoder(encoding).decode(payload).replace(/\0/g, '').trim();
    }
    if (enc === 3) {
      return new TextDecoder('utf-8').decode(payload).replace(/\0/g, '').trim();
    }
    // enc === 0: ISO-8859-1 / Shift-JIS fallback
    return new TextDecoder('utf-8', { fatal: false }).decode(payload).replace(/\0/g, '').trim();
  } catch {
    return '';
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Lightweight browser-side ID3v2 parser (v2.3 / v2.4) for extracting title, artist, album,
 * and embedded APIC cover art from the header slice of MP3 files without server ffmpeg.
 */
export async function extractClientId3Metadata(blob: Blob): Promise<ClientId3Metadata> {
  try {
    const headerSlice = blob.slice(0, Math.min(blob.size, 2 * 1024 * 1024));
    const buf = new Uint8Array(await headerSlice.arrayBuffer());
    if (buf.length < 10) return {};
    if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) {
      return {};
    }

    const versionMajor = buf[3];
    if (versionMajor < 3 || versionMajor > 4) return {};
    const flags = buf[5];
    const tagSize = readSynchsafeInt(buf, 6);
    const limit = Math.min(buf.length, 10 + tagSize);

    let offset = 10;
    // Skip extended header if present (bit 6)
    if ((flags & 0x40) !== 0 && offset + 4 <= limit) {
      const extSize =
        versionMajor === 4 ? readSynchsafeInt(buf, offset) : readUint32BE(buf, offset);
      offset += versionMajor === 4 ? extSize : extSize + 4;
    }

    const result: ClientId3Metadata = {};

    while (offset + 10 <= limit) {
      const frameId = String.fromCharCode(
        buf[offset],
        buf[offset + 1],
        buf[offset + 2],
        buf[offset + 3]
      );
      if (!/^[A-Z0-9]{4}$/.test(frameId)) break;

      const frameSize =
        versionMajor === 4 ? readSynchsafeInt(buf, offset + 4) : readUint32BE(buf, offset + 4);
      offset += 10;
      if (frameSize <= 0 || offset + frameSize > buf.length) break;

      const frameData = buf.subarray(offset, offset + frameSize);
      offset += frameSize;

      if (frameId === 'TIT2' && !result.title) {
        const txt = decodeId3Text(frameData);
        if (txt) result.title = txt;
      } else if (frameId === 'TPE1' && !result.artist) {
        const txt = decodeId3Text(frameData);
        if (txt) result.artist = txt;
      } else if (frameId === 'TALB' && !result.album) {
        const txt = decodeId3Text(frameData);
        if (txt) result.album = txt;
      } else if (frameId === 'APIC' && !result.coverDataUrl && frameData.length > 16) {
        try {
          const textEnc = frameData[0];
          let p = 1;
          while (p < frameData.length && frameData[p] !== 0) p++;
          const mimeRaw = new TextDecoder('ascii')
            .decode(frameData.subarray(1, p))
            .trim()
            .toLowerCase();
          p += 1; // null terminator
          if (p >= frameData.length) continue;
          p += 1; // picture type byte
          // Skip description string (UTF-16 terminates on 0x00 0x00, Latin1/UTF-8 on 0x00)
          if (textEnc === 1 || textEnc === 2) {
            while (p + 1 < frameData.length && !(frameData[p] === 0 && frameData[p + 1] === 0)) {
              p += 2;
            }
            p += 2;
          } else {
            while (p < frameData.length && frameData[p] !== 0) p++;
            p += 1;
          }
          if (p < frameData.length) {
            const imgBytes = frameData.subarray(p);
            if (imgBytes.length > 64 && imgBytes.length <= 2 * 1024 * 1024) {
              const mime =
                mimeRaw === 'image/png' || (imgBytes[0] === 0x89 && imgBytes[1] === 0x50)
                  ? 'image/png'
                  : 'image/jpeg';
              result.coverDataUrl = `data:${mime};base64,${bytesToBase64(imgBytes)}`;
            }
          }
        } catch {}
      }

      if (result.title && result.artist && result.album && result.coverDataUrl) {
        break;
      }
    }

    return result;
  } catch {
    return {};
  }
}
