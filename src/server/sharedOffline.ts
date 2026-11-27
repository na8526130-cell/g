import express, { Express, Request, Response } from 'express';
import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Transform } from 'stream';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { detectImageBufferType, fetchBestCoverImage } from './coverEmbed.js';

const execFileAsync = promisify(execFile);

const MAX_UPLOAD_BYTES = 150 * 1024 * 1024; // 150 MiB
const CHUNK_SIZE_BYTES = 2 * 1024 * 1024; // 2 MiB
const isVercelRuntime = Boolean(process.env.VERCEL);
const hasVercelBlobStorage = Boolean((process.env.BLOB_READ_WRITE_TOKEN || '').trim());
const XOR_KEY = crypto
  .createHash('sha256')
  .update('zero-music-shared-offline-xor-obfuscation-key-v1')
  .digest();

export interface SharedOfflineTrackMeta {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  durationSeconds: number;
  thumbnail?: string;
  fileName: string;
  fileExt: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: string;
  isObfuscated?: boolean;
  plays: number;
}

const ALLOWED_EXTENSIONS = new Set([
  '.mp3',
  '.wav',
  '.flac',
  '.m4a',
  '.m4b',
  '.m4r',
  '.aac',
  '.ogg',
  '.oga',
  '.opus',
  '.webm',
  '.mp4',
  '.m4v',
  '.mov',
  '.mkv',
  '.avi',
  '.3gp',
  '.wma',
  '.aif',
  '.aiff',
  '.caf',
  '.amr',
  '.mpeg',
  '.mpga',
  '.ts',
]);

const EXT_TO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.mpga': 'audio/mpeg',
  '.mpeg': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.m4b': 'audio/mp4',
  '.m4r': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/opus',
  '.webm': 'audio/webm',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.3gp': 'video/3gpp',
  '.wma': 'audio/x-ms-wma',
  '.aif': 'audio/aiff',
  '.aiff': 'audio/aiff',
  '.caf': 'audio/x-caf',
  '.amr': 'audio/amr',
  '.ts': 'video/mp2t',
};

function xorBufferAtOffset(buf: Buffer, startOffset = 0): Buffer {
  const out = Buffer.allocUnsafe(buf.length);
  const keyLen = XOR_KEY.length;
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[i] ^ XOR_KEY[(startOffset + i) % keyLen];
  }
  return out;
}

function createXorTransformStream(startOffset = 0): Transform {
  let offset = startOffset;
  const keyLen = XOR_KEY.length;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      const out = Buffer.allocUnsafe(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        out[i] = chunk[i] ^ XOR_KEY[(offset + i) % keyLen];
      }
      offset += chunk.length;
      callback(null, out);
    },
  });
}

function formatDurationLabel(sec: number): string {
  const safe = Math.max(0, Math.round(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function sanitizeText(val: unknown, fallback = '', maxLen = 120): string {
  const s = String(val ?? '')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .trim();
  if (!s) return fallback;
  return s.slice(0, maxLen);
}

function resolveExtension(rawFilename: string, rawMime: string): string | null {
  const ext = path.extname(rawFilename).toLowerCase();
  if (ALLOWED_EXTENSIONS.has(ext)) return ext;

  const mime = (rawMime || '').toLowerCase();
  if (mime.includes('mpeg') || mime.includes('mp3')) return '.mp3';
  if (mime.includes('wav')) return '.wav';
  if (mime.includes('flac')) return '.flac';
  if (mime.includes('x-m4a') || mime.includes('m4a') || mime.includes('mp4')) {
    return mime.startsWith('video/') ? '.mp4' : '.m4a';
  }
  if (mime.includes('aac')) return '.aac';
  if (mime.includes('opus')) return '.opus';
  if (mime.includes('ogg')) return '.ogg';
  if (mime.includes('webm')) return '.webm';
  if (mime.includes('quicktime')) return '.mov';
  if (mime.includes('matroska')) return '.mkv';
  if (mime.includes('aiff')) return '.aiff';
  if (mime.includes('wma')) return '.wma';
  if (mime.includes('caf')) return '.caf';
  if (mime.includes('amr')) return '.amr';
  if (mime.includes('3gpp')) return '.3gp';
  if (mime.startsWith('audio/')) return '.mp3';
  if (mime.startsWith('video/')) return '.mp4';
  if (mime === 'application/octet-stream' || !mime) {
    return '.mp3';
  }
  return null;
}

interface ProbedMediaMeta {
  durationSeconds: number;
  title?: string;
  artist?: string;
  album?: string;
  hasMediaStream: boolean;
}

async function probeMediaMetaWithFfprobe(filePath: string): Promise<ProbedMediaMeta> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        filePath,
      ],
      { timeout: 12000 }
    );
    const parsed = JSON.parse(String(stdout || '{}'));
    const fmt = parsed?.format || {};
    const streams = Array.isArray(parsed?.streams) ? parsed.streams : [];
    const rawDur = parseFloat(String(fmt.duration || '0'));
    const durationSeconds = Number.isFinite(rawDur) && rawDur > 0 ? Math.round(rawDur) : 0;

    const tagsRaw = fmt.tags && typeof fmt.tags === 'object' ? fmt.tags : {};
    const tagsLower: Record<string, string> = {};
    for (const [k, v] of Object.entries(tagsRaw)) {
      if (typeof v === 'string' && v.trim()) {
        tagsLower[k.toLowerCase()] = v.trim();
      }
    }

    const title = tagsLower.title || tagsLower.tit2 || undefined;
    const artist = tagsLower.artist || tagsLower.tpe1 || tagsLower.album_artist || undefined;
    const album = tagsLower.album || tagsLower.talb || undefined;
    const hasMediaStream = streams.some(
      (s: any) => s?.codec_type === 'audio' || s?.codec_type === 'video'
    );

    return {
      durationSeconds,
      title,
      artist,
      album,
      hasMediaStream,
    };
  } catch {
    return { durationSeconds: 0, hasMediaStream: false };
  }
}

async function probeDurationSeconds(filePath: string): Promise<number> {
  const probed = await probeMediaMetaWithFfprobe(filePath);
  return probed.durationSeconds;
}

async function extractEmbeddedCoverWithFfmpeg(
  plainAudioPath: string,
  outJpgPath: string
): Promise<Buffer | null> {
  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-v',
        'error',
        '-i',
        plainAudioPath,
        '-map',
        '0:v:0',
        '-frames:v',
        '1',
        '-vf',
        'scale=600:600:force_original_aspect_ratio=decrease',
        '-q:v',
        '3',
        outJpgPath,
      ],
      { timeout: 12000 }
    );
    if (fs.existsSync(outJpgPath)) {
      const buf = await fs.promises.readFile(outJpgPath);
      if (detectImageBufferType(buf)) {
        return buf;
      }
    }
  } catch {}
  return null;
}

async function lookupItunesCoverUrl(title: string, artist: string): Promise<string | null> {
  const cleanTitle = String(title || '')
    .replace(/[\(\[【（].*?[\)\]】）]/g, ' ')
    .replace(/\.(mp3|wav|flac|m4a|aac|ogg|opus|mp4|webm|mov)$/i, '')
    .trim();
  const cleanArtist =
    artist && artist !== '共有アップロード' && artist !== 'ローカル音源' && artist !== 'ゲスト'
      ? artist.trim()
      : '';
  const query = [cleanArtist, cleanTitle].filter(Boolean).join(' ').trim();
  if (!query || query.length < 2) return null;

  try {
    const resp = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&country=JP&media=music&limit=5`,
      { signal: AbortSignal.timeout(4500) }
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as any;
    const results = Array.isArray(data?.results) ? data.results : [];
    const hit = results.find((r: any) => typeof r?.artworkUrl100 === 'string' || typeof r?.artworkUrl60 === 'string');
    const rawArt = String(hit?.artworkUrl100 || hit?.artworkUrl60 || '').trim();
    if (!rawArt) return null;
    return rawArt.replace(/\/\d+x\d+bb(\.\w+)?$/i, '/600x600bb$1');
  } catch {
    return null;
  }
}

interface UploadSessionMeta {
  uploadId: string;
  preserveId?: string;
  uploadedAt?: string;
  filename: string;
  mimeType: string;
  ext: string;
  fileSize: number;
  chunkCount: number;
  title?: string;
  artist?: string;
  album?: string;
  thumbnail?: string;
  uploadedBy?: string;
  durationSeconds?: number;
  duration?: string;
  createdAt: number;
}

function normalizeValidSharedId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || path.basename(trimmed) !== trimmed) return null;
  if (!/^shared_[a-zA-Z0-9_-]{3,80}$/.test(trimmed)) return null;
  return trimmed;
}

function normalizeValidIsoDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 48) return null;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms) || ms < 1500000000000) return null;
  return new Date(ms).toISOString();
}

export function registerSharedOfflineRoutes(
  app: Express,
  dataDir: string,
  onTrackAdded?: (track: SharedOfflineTrackMeta) => void,
  options?: {
    requireAdminAuth?: express.RequestHandler;
    onTrackDeleted?: (trackId: string) => void;
    canUpload?: () => boolean;
  }
) {
  const filesDir = path.resolve(dataDir, 'shared_offline_files');
  const coversDir = path.resolve(dataDir, 'shared_offline_covers');
  const tmpDir = path.resolve(dataDir, 'shared_offline_tmp');
  const indexFile = path.resolve(dataDir, 'shared_offline_index.json');
  const deletedFile = path.resolve(dataDir, 'shared_offline_deleted.json');
  const inFlightCoverResolves = new Map<string, Promise<string | null>>();
  const failedCoverLookupAt = new Map<string, number>();

  const ensureDirs = () => {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(filesDir)) {
      fs.mkdirSync(filesDir, { recursive: true });
    }
    if (!fs.existsSync(coversDir)) {
      fs.mkdirSync(coversDir, { recursive: true });
    }
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  };

  const getTrackDiskPath = (item: Pick<SharedOfflineTrackMeta, 'id' | 'fileExt'>) =>
    path.join(filesDir, `${item.id}${item.fileExt || '.mp3'}`);

  const findExistingCoverPath = (id: string): { filePath: string; mimeType: string } | null => {
    const safeId = path.basename(String(id || '').trim());
    if (!/^[a-zA-Z0-9_-]{3,80}$/.test(safeId)) return null;
    const jpgPath = path.join(coversDir, `${safeId}.jpg`);
    if (fs.existsSync(jpgPath)) return { filePath: jpgPath, mimeType: 'image/jpeg' };
    const pngPath = path.join(coversDir, `${safeId}.png`);
    if (fs.existsSync(pngPath)) return { filePath: pngPath, mimeType: 'image/png' };
    return null;
  };

  const buildCoverApiUrl = (id: string) => `/api/shared-offline/cover/${encodeURIComponent(id)}`;

  const resolveAndSaveCoverForTrack = async (
    item: Pick<SharedOfflineTrackMeta, 'id' | 'title' | 'artist' | 'fileExt' | 'isObfuscated'>,
    options?: {
      thumbnailInput?: unknown;
      plainAudioPath?: string;
    }
  ): Promise<string | null> => {
    ensureDirs();
    const existing = findExistingCoverPath(item.id);
    if (existing) return existing.filePath;

    // 1) Client-supplied thumbnail (HTTP URL or data:image/... base64)
    const rawThumb = typeof options?.thumbnailInput === 'string' ? options.thumbnailInput.trim() : '';
    if (rawThumb && !rawThumb.startsWith('/api/shared-offline/cover/')) {
      const candidateUrls = [rawThumb];
      const fetched = await fetchBestCoverImage(candidateUrls).catch(() => null);
      if (fetched) {
        const outPath = path.join(coversDir, `${item.id}.${fetched.ext}`);
        await fs.promises.writeFile(outPath, fetched.buffer);
        return outPath;
      }
    }

    // 2) Extract embedded cover art (ID3 APIC / MP4 covr / video frame) via ffmpeg
    const tmpCoverOut = path.join(tmpDir, `cover_${item.id}_${Date.now()}.jpg`);
    let tempPlainToDelete: string | null = null;
    try {
      let plainPath = options?.plainAudioPath;
      if (!plainPath) {
        const diskPath = getTrackDiskPath(item);
        if (fs.existsSync(diskPath)) {
          if (item.isObfuscated) {
            const plainTmp = path.join(tmpDir, `plain_${item.id}_${Date.now()}${item.fileExt || '.mp3'}`);
            await new Promise<void>((resolve, reject) => {
              const rs = fs.createReadStream(diskPath);
              const ws = fs.createWriteStream(plainTmp);
              rs.on('error', reject);
              ws.on('error', reject);
              ws.on('finish', resolve);
              rs.pipe(createXorTransformStream(0)).pipe(ws);
            });
            plainPath = plainTmp;
            tempPlainToDelete = plainTmp;
          } else {
            plainPath = diskPath;
          }
        }
      }

      if (plainPath && fs.existsSync(plainPath)) {
        const extractedBuf = await extractEmbeddedCoverWithFfmpeg(plainPath, tmpCoverOut);
        if (extractedBuf) {
          const outPath = path.join(coversDir, `${item.id}.jpg`);
          await fs.promises.writeFile(outPath, extractedBuf);
          return outPath;
        }
      }
    } catch {} finally {
      if (tempPlainToDelete) {
        fs.promises.unlink(tempPlainToDelete).catch(() => {});
      }
      fs.promises.unlink(tmpCoverOut).catch(() => {});
    }

    // 3) Fallback: Look up official album artwork on iTunes Search by title & artist
    try {
      const itunesUrl = await lookupItunesCoverUrl(item.title, item.artist);
      if (itunesUrl) {
        const fetched = await fetchBestCoverImage([itunesUrl]).catch(() => null);
        if (fetched) {
          const outPath = path.join(coversDir, `${item.id}.${fetched.ext}`);
          await fs.promises.writeFile(outPath, fetched.buffer);
          return outPath;
        }
      }
    } catch {}

    return null;
  };

  const seedFromBundledDataIfNeeded = () => {
    try {
      ensureDirs();
      if (fs.existsSync(indexFile)) return;
      const moduleDir = path.dirname(fileURLToPath(import.meta.url));
      const seedCandidates = [
        path.resolve(process.cwd(), 'data'),
        path.resolve(moduleDir, '..', '..', 'data'),
      ];
      const seedDir = seedCandidates.find((dir) =>
        fs.existsSync(path.join(dir, 'shared_offline_index.json'))
      );
      if (!seedDir || path.resolve(dataDir) === path.resolve(seedDir)) return;
      const seedIndex = path.join(seedDir, 'shared_offline_index.json');
      const seedFilesDir = path.join(seedDir, 'shared_offline_files');
      const seedCoversDir = path.join(seedDir, 'shared_offline_covers');
      const raw = fs.readFileSync(seedIndex, 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      for (const item of parsed) {
        if (!item || typeof item.id !== 'string') continue;
        const ext = item.fileExt || '.mp3';
        const srcFile = path.join(seedFilesDir, `${item.id}${ext}`);
        const dstFile = path.join(filesDir, `${item.id}${ext}`);
        if (fs.existsSync(srcFile) && !fs.existsSync(dstFile)) {
          fs.copyFileSync(srcFile, dstFile);
        }
        for (const cExt of ['.jpg', '.png']) {
          const srcCov = path.join(seedCoversDir, `${item.id}${cExt}`);
          const dstCov = path.join(coversDir, `${item.id}${cExt}`);
          if (fs.existsSync(srcCov) && !fs.existsSync(dstCov)) {
            fs.copyFileSync(srcCov, dstCov);
          }
        }
      }
      fs.writeFileSync(indexFile, JSON.stringify(parsed, null, 2), 'utf8');
    } catch {}
  };

  let lastIndexMtimeMs = 0;

  const loadDeletedIds = (): Set<string> => {
    try {
      ensureDirs();
      if (fs.existsSync(deletedFile)) {
        const raw = fs.readFileSync(deletedFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return new Set(
            parsed.filter((id): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{3,80}$/.test(id))
          );
        }
      }
    } catch {}
    return new Set();
  };

  const deletedIds: Set<string> = loadDeletedIds();

  const saveDeletedIds = () => {
    try {
      ensureDirs();
      fs.writeFileSync(deletedFile, JSON.stringify(Array.from(deletedIds), null, 2), 'utf8');
    } catch (err) {
      console.warn('[SharedOffline] Failed to save deleted tombstones:', err);
    }
  };

  const markDeletedId = (id: string) => {
    if (!id) return;
    deletedIds.add(id);
    saveDeletedIds();
  };

  const unmarkDeletedId = (id: string) => {
    if (deletedIds.delete(id)) {
      saveDeletedIds();
    }
  };

  const loadIndex = (): SharedOfflineTrackMeta[] => {
    try {
      seedFromBundledDataIfNeeded();
      ensureDirs();
      if (fs.existsSync(indexFile)) {
        lastIndexMtimeMs = fs.statSync(indexFile).mtimeMs || 0;
        const raw = fs.readFileSync(indexFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter((item) => {
            if (!item || typeof item.id !== 'string') return false;
            return fs.existsSync(getTrackDiskPath(item));
          });
        }
      }
    } catch (err) {
      console.warn('[SharedOffline] Failed to load index:', err);
    }
    return [];
  };

  let sharedTracks: SharedOfflineTrackMeta[] = loadIndex();

  const reloadIndexIfChanged = () => {
    try {
      if (!fs.existsSync(indexFile)) return;
      const mtime = fs.statSync(indexFile).mtimeMs || 0;
      if (mtime > lastIndexMtimeMs) {
        sharedTracks = loadIndex();
      }
    } catch {}
  };

  const saveIndex = () => {
    try {
      ensureDirs();
      fs.writeFileSync(indexFile, JSON.stringify(sharedTracks, null, 2), 'utf8');
      try {
        lastIndexMtimeMs = fs.statSync(indexFile).mtimeMs || Date.now();
      } catch {}
    } catch (err) {
      console.warn('[SharedOffline] Failed to save index:', err);
    }
  };

  const pruneMissingFiles = () => {
    let changed = false;
    const kept: SharedOfflineTrackMeta[] = [];
    for (const item of sharedTracks) {
      if (!fs.existsSync(getTrackDiskPath(item))) {
        changed = true;
        continue;
      }
      kept.push(item);
    }
    if (changed) {
      sharedTracks = kept;
      saveIndex();
    }
  };

  const hasUnindexedDiskFiles = (): boolean => {
    try {
      ensureDirs();
      const entries = fs.readdirSync(filesDir, { withFileTypes: true });
      const indexedIds = new Set(sharedTracks.map((t) => t.id));
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const parsed = path.parse(entry.name);
        const ext = parsed.ext.toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) continue;
        const id = normalizeValidSharedId(parsed.name);
        if (!id) continue;
        if (!indexedIds.has(id) && !deletedIds.has(id)) {
          return true;
        }
      }
    } catch {}
    return false;
  };

  let activeRecoveryPromise: Promise<number> | null = null;

  const recoverOrphanedFilesToIndex = async (includeTombstoned = false): Promise<number> => {
    if (activeRecoveryPromise) return activeRecoveryPromise;
    activeRecoveryPromise = (async () => {
      let recoveredCount = 0;
      try {
        ensureDirs();
        reloadIndexIfChanged();
        const entries = await fs.promises.readdir(filesDir, { withFileTypes: true });
        const indexedIds = new Set(sharedTracks.map((t) => t.id));

        for (const entry of entries) {
          if (!entry.isFile()) continue;
          const parsed = path.parse(entry.name);
          const ext = parsed.ext.toLowerCase();
          if (!ALLOWED_EXTENSIONS.has(ext)) continue;
          const id = normalizeValidSharedId(parsed.name);
          if (!id) continue;
          if (indexedIds.has(id)) continue;
          if (!includeTombstoned && deletedIds.has(id)) continue;

          const diskPath = path.join(filesDir, entry.name);
          let st: fs.Stats;
          try {
            st = await fs.promises.stat(diskPath);
          } catch {
            continue;
          }
          if (!st.isFile() || st.size < 32) continue;

          let plainTmpPath: string | null = null;
          try {
            plainTmpPath = path.join(tmpDir, `recover_${id}_${Date.now()}${ext}`);
            await new Promise<void>((resolve, reject) => {
              const rs = fs.createReadStream(diskPath);
              const ws = fs.createWriteStream(plainTmpPath!);
              rs.on('error', reject);
              ws.on('error', reject);
              ws.on('finish', resolve);
              rs.pipe(createXorTransformStream(0)).pipe(ws);
            });

            let probed = await probeMediaMetaWithFfprobe(plainTmpPath);
            let isObfuscated = true;
            let bestPlainPath = plainTmpPath;

            if (!probed.hasMediaStream && probed.durationSeconds <= 0) {
              const directProbed = await probeMediaMetaWithFfprobe(diskPath);
              if (directProbed.hasMediaStream || directProbed.durationSeconds > 0) {
                probed = directProbed;
                isObfuscated = false;
                bestPlainPath = diskPath;
              }
            }

            let uploadedAt = st.mtime.toISOString();
            const idParts = id.split('_');
            const idTs = Number(idParts[1]);
            if (Number.isFinite(idTs) && idTs > 1500000000000) {
              uploadedAt = new Date(idTs).toISOString();
            }

            const title = sanitizeText(probed.title, id, 120);
            const artist = sanitizeText(probed.artist, '共有アップロード', 80);
            const album = sanitizeText(probed.album, '共有オフライン', 80);
            const durationSeconds = probed.durationSeconds > 0 ? probed.durationSeconds : 180;
            const duration = formatDurationLabel(durationSeconds);
            const mimeType = EXT_TO_MIME[ext] || 'audio/mpeg';

            await resolveAndSaveCoverForTrack(
              {
                id,
                title,
                artist,
                fileExt: ext,
                isObfuscated,
              },
              {
                plainAudioPath: fs.existsSync(bestPlainPath) ? bestPlainPath : undefined,
              }
            ).catch(() => null);

            const cleanFileName = `${
              artist !== '共有アップロード' && title !== id
                ? `${artist} - ${title}`
                : title
            }${ext}`.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_');

            const recoveredMeta: SharedOfflineTrackMeta = {
              id,
              title,
              artist,
              album,
              duration,
              durationSeconds,
              thumbnail: buildCoverApiUrl(id),
              fileName: cleanFileName,
              fileExt: ext,
              mimeType,
              fileSize: st.size,
              uploadedBy: '自動復元',
              uploadedAt,
              isObfuscated,
              plays: 0,
            };

            if (!sharedTracks.some((t) => t.id === id)) {
              sharedTracks.push(recoveredMeta);
              indexedIds.add(id);
              recoveredCount++;
            }
            if (includeTombstoned) {
              unmarkDeletedId(id);
            }
          } catch (err) {
            console.warn(`[SharedOffline] Orphan recovery failed for ${entry.name}:`, err);
          } finally {
            if (plainTmpPath) {
              fs.promises.unlink(plainTmpPath).catch(() => {});
            }
          }
        }

        if (recoveredCount > 0) {
          sharedTracks.sort(
            (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
          );
          saveIndex();
          console.log(`[SharedOffline] Recovered ${recoveredCount} orphaned audio track(s) from disk into index.`);
        }
      } finally {
        activeRecoveryPromise = null;
      }
      return recoveredCount;
    })();
    return activeRecoveryPromise;
  };

  // Run initial orphan scan on server boot so unindexed files are immediately available
  recoverOrphanedFilesToIndex().catch((err) => {
    console.warn('[SharedOffline] Startup recovery error:', err);
  });

  const cleanupStaleTmpDirs = async () => {
    try {
      ensureDirs();
      const entries = await fs.promises.readdir(tmpDir, { withFileTypes: true });
      const cutoff = Date.now() - 60 * 60 * 1000;
      for (const entry of entries) {
        const full = path.join(tmpDir, entry.name);
        try {
          const st = await fs.promises.stat(full);
          if (st.mtimeMs < cutoff) {
            await fs.promises.rm(full, { recursive: true, force: true });
          }
        } catch {}
      }
    } catch {}
  };

  const findTrackById = (id: string): SharedOfflineTrackMeta | undefined => {
    const key = String(id || '').trim();
    if (!key) return undefined;
    reloadIndexIfChanged();
    let found = sharedTracks.find((t) => t.id === key);
    if (!found) {
      sharedTracks = loadIndex();
      found = sharedTracks.find((t) => t.id === key);
    }
    return found;
  };

  const finalizeTrackFromDisk = async (params: {
    id: string;
    diskPath: string;
    plainAudioPath?: string;
    rawFilename: string;
    ext: string;
    headerMime: string;
    fileSize: number;
    isObfuscated: boolean;
    titleInput?: unknown;
    artistInput?: unknown;
    albumInput?: unknown;
    thumbnailInput?: unknown;
    uploadedByInput?: unknown;
    uploadedAtInput?: unknown;
    durationSecondsInput?: unknown;
    durationInput?: unknown;
    probedDurationSeconds?: number;
  }): Promise<SharedOfflineTrackMeta> => {
    const baseName = path.parse(params.rawFilename).name || 'Shared Track';
    let parsedTitle = baseName;
    let parsedArtist = '共有アップロード';
    if (baseName.includes(' - ')) {
      const parts = baseName.split(' - ');
      if (parts[0].trim()) parsedArtist = parts[0].trim();
      if (parts.slice(1).join(' - ').trim()) parsedTitle = parts.slice(1).join(' - ').trim();
    }

    const title = sanitizeText(params.titleInput, parsedTitle, 120);
    const artist = sanitizeText(params.artistInput, parsedArtist, 80);
    const album = sanitizeText(params.albumInput, '共有オフライン', 80);
    const uploadedBy = sanitizeText(params.uploadedByInput, 'ゲスト', 40);

    let durationSeconds = Math.max(
      0,
      Math.round(Number(params.durationSecondsInput) || params.probedDurationSeconds || 0)
    );
    if (durationSeconds <= 0 && params.plainAudioPath && fs.existsSync(params.plainAudioPath)) {
      durationSeconds = await probeDurationSeconds(params.plainAudioPath);
    } else if (durationSeconds <= 0 && !params.isObfuscated) {
      durationSeconds = await probeDurationSeconds(params.diskPath);
    }
    if (durationSeconds <= 0) {
      durationSeconds = 180;
    }
    const duration = sanitizeText(
      params.durationInput,
      formatDurationLabel(durationSeconds),
      16
    );
    const mimeType = EXT_TO_MIME[params.ext] || params.headerMime || 'audio/mpeg';

    await resolveAndSaveCoverForTrack(
      {
        id: params.id,
        title,
        artist,
        fileExt: params.ext,
        isObfuscated: params.isObfuscated,
      },
      {
        thumbnailInput: params.thumbnailInput,
        plainAudioPath: params.plainAudioPath,
      }
    ).catch(() => null);

    const uploadedAt =
      normalizeValidIsoDate(params.uploadedAtInput) || new Date().toISOString();

    const meta: SharedOfflineTrackMeta = {
      id: params.id,
      title,
      artist,
      album,
      duration,
      durationSeconds,
      thumbnail: buildCoverApiUrl(params.id),
      fileName: params.rawFilename,
      fileExt: params.ext,
      mimeType,
      fileSize: params.fileSize,
      uploadedBy,
      uploadedAt,
      isObfuscated: params.isObfuscated,
      plays: 0,
    };

    sharedTracks = [meta, ...sharedTracks.filter((t) => t.id !== meta.id)];
    unmarkDeletedId(meta.id);
    saveIndex();

    if (onTrackAdded) {
      try {
        onTrackAdded(meta);
      } catch {}
    }

    return meta;
  };

  // 1. List all shared offline tracks (stored indefinitely with no expiry)
  app.get('/api/shared-offline', async (_req: Request, res: Response) => {
    reloadIndexIfChanged();
    pruneMissingFiles();
    if (activeRecoveryPromise) {
      await activeRecoveryPromise.catch(() => 0);
    } else if (hasUnindexedDiskFiles()) {
      await recoverOrphanedFilesToIndex().catch(() => 0);
    }
    const sorted = [...sharedTracks]
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
      .map((t) => ({
        ...t,
        thumbnail: t.thumbnail || buildCoverApiUrl(t.id),
      }));
    const totalBytes = sorted.reduce((acc, t) => acc + (t.fileSize || 0), 0);
    res.json({
      tracks: sorted,
      totalCount: sorted.length,
      totalBytes,
      deletedIds: Array.from(deletedIds),
      runtime: isVercelRuntime ? 'vercel-serverless' : 'node-server',
      ephemeralStorage: isVercelRuntime && !hasVercelBlobStorage,
      maxDirectUploadBytes: isVercelRuntime ? 3_670_016 : 25_000_000,
    });
  });

  // 2a. Single-request Upload (fast path for files <= 1 MiB) with fixed-key XOR obfuscation
  app.post(
    '/api/shared-offline/upload',
    express.raw({ type: '*/*', limit: '25mb' }),
    async (req: Request, res: Response) => {
      let plainTmpPath = '';
      try {
        const preserveId = normalizeValidSharedId(req.query.preserveId);
        if (preserveId) {
          const existing = findTrackById(preserveId);
          if (existing && fs.existsSync(getTrackDiskPath(existing))) {
            return res.json({
              success: true,
              track: {
                ...existing,
                thumbnail: existing.thumbnail || buildCoverApiUrl(existing.id),
              },
              alreadyExists: true,
            });
          }
        }

        if (options?.canUpload && !options.canUpload()) {
          return res.status(403).json({
            error: '現在、管理者により共有オフラインへの新規アップロードが一時停止されています',
          });
        }
        const bodyBuf = req.body as Buffer;
        if (!Buffer.isBuffer(bodyBuf) || bodyBuf.length < 32) {
          return res.status(400).json({ error: 'アップロードされた音声ファイルが空です' });
        }

        const rawFilename = sanitizeText(req.query.filename, 'shared_audio.mp3', 180);
        const headerMime = String(req.headers['x-file-mime'] || req.query.mime || '').toLowerCase();
        const ext = resolveExtension(rawFilename, headerMime);

        if (!ext) {
          return res.status(400).json({
            error: '対応形式: MP3 / WAV / FLAC / M4A / AAC / OGG / OPUS / WEBM / MP4 / MOV 等',
          });
        }

        ensureDirs();
        const id =
          preserveId ||
          `shared_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const diskPath = path.join(filesDir, `${id}${ext}`);
        plainTmpPath = path.join(tmpDir, `plain_small_${id}${ext}`);
        await fs.promises.writeFile(plainTmpPath, bodyBuf);

        const obfuscated = xorBufferAtOffset(bodyBuf, 0);
        await fs.promises.writeFile(diskPath, obfuscated);

        const thumbInput =
          typeof req.headers['x-track-thumbnail'] === 'string'
            ? req.headers['x-track-thumbnail']
            : req.query.thumbnail;

        const meta = await finalizeTrackFromDisk({
          id,
          diskPath,
          plainAudioPath: plainTmpPath,
          rawFilename,
          ext,
          headerMime,
          fileSize: bodyBuf.length,
          isObfuscated: true,
          titleInput: req.query.title,
          artistInput: req.query.artist,
          albumInput: req.query.album,
          thumbnailInput: thumbInput,
          uploadedByInput: req.query.uploadedBy,
          uploadedAtInput: req.query.uploadedAt,
          durationSecondsInput: req.query.durationSeconds,
          durationInput: req.query.duration,
        });

        res.json({ success: true, track: meta });
      } catch (err: any) {
        console.error('[SharedOffline] Upload error:', err);
        res.status(500).json({ error: err?.message || 'アップロードに失敗しました' });
      } finally {
        if (plainTmpPath) {
          fs.promises.unlink(plainTmpPath).catch(() => {});
        }
      }
    }
  );

  // 2b. Chunked Upload Step 0: Begin upload session (1 MiB chunk lifecycle)
  app.post('/api/shared-offline/upload-begin', async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const preserveId = normalizeValidSharedId(body.preserveId);
      if (preserveId) {
        const existing = findTrackById(preserveId);
        if (existing && fs.existsSync(getTrackDiskPath(existing))) {
          return res.json({
            success: true,
            alreadyExists: true,
            track: {
              ...existing,
              thumbnail: existing.thumbnail || buildCoverApiUrl(existing.id),
            },
          });
        }
      }

      if (options?.canUpload && !options.canUpload()) {
        return res.status(403).json({
          error: '現在、管理者により共有オフラインへの新規アップロードが一時停止されています',
        });
      }
      const rawFilename = sanitizeText(body.filename || body.fileName, 'shared_audio.mp3', 180);
      const headerMime = String(body.mimeType || '').toLowerCase();
      const fileSize = Number(body.fileSize || 0);

      if (!Number.isFinite(fileSize) || fileSize < 32) {
        return res.status(400).json({ error: '音声ファイルが空、または小さすぎます' });
      }
      if (fileSize > MAX_UPLOAD_BYTES) {
        return res.status(400).json({ error: 'ファイルサイズは150 MiB以下にしてください' });
      }

      const ext = resolveExtension(rawFilename, headerMime);
      if (!ext) {
        return res.status(400).json({
          error: '対応形式: MP3 / WAV / FLAC / M4A / AAC / OGG / OPUS / WEBM / MP4 / MOV 等',
        });
      }

      ensureDirs();
      const uploadId = `up_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const chunkCount = Math.ceil(fileSize / CHUNK_SIZE_BYTES);
      const sessionDir = path.join(tmpDir, uploadId);
      await fs.promises.mkdir(sessionDir, { recursive: true });

      const sessionMeta: UploadSessionMeta = {
        uploadId,
        preserveId: preserveId || undefined,
        uploadedAt: normalizeValidIsoDate(body.uploadedAt) || undefined,
        filename: rawFilename,
        mimeType: headerMime,
        ext,
        fileSize,
        chunkCount,
        title: typeof body.title === 'string' ? body.title : undefined,
        artist: typeof body.artist === 'string' ? body.artist : undefined,
        album: typeof body.album === 'string' ? body.album : undefined,
        thumbnail: typeof body.thumbnail === 'string' ? body.thumbnail : undefined,
        uploadedBy: typeof body.uploadedBy === 'string' ? body.uploadedBy : undefined,
        durationSeconds: Number(body.durationSeconds) || undefined,
        duration: typeof body.duration === 'string' ? body.duration : undefined,
        createdAt: Date.now(),
      };
      await fs.promises.writeFile(
        path.join(sessionDir, 'session.json'),
        JSON.stringify(sessionMeta),
        'utf8'
      );

      res.json({
        success: true,
        uploadId,
        chunkSize: CHUNK_SIZE_BYTES,
        chunkCount,
      });
    } catch (err: any) {
      console.error('[SharedOffline] Begin upload error:', err);
      res.status(500).json({ error: err?.message || 'アップロードの開始に失敗しました' });
    }
  });

  // 2c. Chunked Upload Step 1: Receive a single chunk
  app.post(
    '/api/shared-offline/upload-chunk',
    express.raw({ type: '*/*', limit: '8mb' }),
    async (req: Request, res: Response) => {
      try {
        const bodyBuf = req.body as Buffer;
        if (!Buffer.isBuffer(bodyBuf) || bodyBuf.length === 0) {
          return res.status(400).json({ error: 'チャンクデータが空です' });
        }

        const uploadId = String(req.query.uploadId || '')
          .replace(/[^a-zA-Z0-9_-]/g, '')
          .slice(0, 64);
        const chunkIndex = parseInt(String(req.query.chunkIndex ?? '-1'), 10);
        const totalChunks = parseInt(String(req.query.totalChunks ?? '0'), 10);

        if (!uploadId || isNaN(chunkIndex) || chunkIndex < 0 || totalChunks <= 0 || chunkIndex >= totalChunks) {
          return res.status(400).json({ error: '無効なチャンクパラメータです' });
        }

        ensureDirs();
        const sessionDir = path.join(tmpDir, uploadId);
        await fs.promises.mkdir(sessionDir, { recursive: true });
        const chunkPath = path.join(sessionDir, `chunk_${String(chunkIndex).padStart(6, '0')}.part`);
        await fs.promises.writeFile(chunkPath, bodyBuf);

        res.json({ success: true, uploadId, chunkIndex, receivedBytes: bodyBuf.length });
      } catch (err: any) {
        console.error('[SharedOffline] Chunk upload error:', err);
        res.status(500).json({ error: err?.message || 'チャンク送信に失敗しました' });
      }
    }
  );

  // 2d. Chunked Upload Abort: Clean up temporary chunks when cancelled/failed
  app.post('/api/shared-offline/upload-abort', async (req: Request, res: Response) => {
    try {
      const uploadId = String(req.body?.uploadId || req.query.uploadId || '')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 64);
      if (uploadId) {
        const sessionDir = path.join(tmpDir, uploadId);
        await fs.promises.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
      }
      res.json({ success: true });
    } catch {
      res.json({ success: true });
    }
  });

  // 2e. Chunked Upload Step 2: Assemble chunks with fixed-key XOR obfuscation & register track
  app.post('/api/shared-offline/upload-complete', async (req: Request, res: Response) => {
    let sessionDir = '';
    try {
      const body = req.body || {};
      const uploadId = String(body.uploadId || '')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 64);

      if (!uploadId) {
        return res.status(400).json({ error: '無効なアップロード完了リクエストです' });
      }

      ensureDirs();
      sessionDir = path.join(tmpDir, uploadId);
      if (!fs.existsSync(sessionDir)) {
        if (isVercelRuntime && !hasVercelBlobStorage) {
          return res.status(409).json({
            code: 'VERCEL_EPHEMERAL_CHUNKS_LOST',
            isVercel: true,
            error:
              'Vercelのサーバーレス環境では4.5MB超の分割アップロード一時領域がコンテナ間で共有されません。端末内キャッシュへ直接保存してください。',
          });
        }
        return res.status(404).json({ error: 'アップロードセッションが見つかりません' });
      }

      let sessionMeta: Partial<UploadSessionMeta> = {};
      const sessionJsonPath = path.join(sessionDir, 'session.json');
      if (fs.existsSync(sessionJsonPath)) {
        try {
          sessionMeta = JSON.parse(fs.readFileSync(sessionJsonPath, 'utf8'));
        } catch {}
      }

      const totalChunks = parseInt(String(body.totalChunks ?? sessionMeta.chunkCount ?? '0'), 10);
      if (!totalChunks || totalChunks <= 0) {
        return res.status(400).json({ error: '無効なチャンク数です' });
      }

      const rawFilename = sanitizeText(body.filename || sessionMeta.filename, 'shared_audio.mp3', 180);
      const headerMime = String(body.mimeType || sessionMeta.mimeType || '').toLowerCase();
      const ext = sessionMeta.ext || resolveExtension(rawFilename, headerMime);
      if (!ext) {
        return res.status(400).json({
          error: '対応形式: MP3 / WAV / FLAC / M4A / AAC / OGG / OPUS / WEBM / MP4 / MOV 等',
        });
      }

      const preserveId =
        normalizeValidSharedId(body.preserveId) ||
        normalizeValidSharedId(sessionMeta.preserveId);
      if (preserveId) {
        const existing = findTrackById(preserveId);
        if (existing && fs.existsSync(getTrackDiskPath(existing))) {
          return res.json({
            success: true,
            track: {
              ...existing,
              thumbnail: existing.thumbnail || buildCoverApiUrl(existing.id),
            },
            alreadyExists: true,
          });
        }
      }

      for (let i = 0; i < totalChunks; i++) {
        const chunkPath = path.join(sessionDir, `chunk_${String(i).padStart(6, '0')}.part`);
        if (!fs.existsSync(chunkPath)) {
          if (isVercelRuntime && !hasVercelBlobStorage) {
            return res.status(409).json({
              code: 'VERCEL_EPHEMERAL_CHUNKS_LOST',
              isVercel: true,
              error: `分割データ(${i + 1}/${totalChunks})が見つかりません（Vercel一時ストレージ制限）`,
            });
          }
          return res.status(409).json({
            error: `分割データ(${i + 1}/${totalChunks})が不足しています`,
          });
        }
      }

      const id =
        preserveId ||
        `shared_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      const diskPath = path.join(filesDir, `${id}${ext}`);
      const plainAssembledPath = path.join(sessionDir, `assembled${ext}`);
      const xorWriteStream = fs.createWriteStream(diskPath);
      const plainWriteStream = fs.createWriteStream(plainAssembledPath);

      let totalSize = 0;
      try {
        for (let i = 0; i < totalChunks; i++) {
          const chunkPath = path.join(sessionDir, `chunk_${String(i).padStart(6, '0')}.part`);
          const chunkData = await fs.promises.readFile(chunkPath);
          const xorData = xorBufferAtOffset(chunkData, totalSize);
          totalSize += chunkData.length;
          if (!xorWriteStream.write(xorData)) {
            await new Promise<void>((resolve) => xorWriteStream.once('drain', resolve));
          }
          if (!plainWriteStream.write(chunkData)) {
            await new Promise<void>((resolve) => plainWriteStream.once('drain', resolve));
          }
        }
        await Promise.all([
          new Promise<void>((resolve, reject) => {
            xorWriteStream.on('finish', resolve);
            xorWriteStream.on('error', reject);
            xorWriteStream.end();
          }),
          new Promise<void>((resolve, reject) => {
            plainWriteStream.on('finish', resolve);
            plainWriteStream.on('error', reject);
            plainWriteStream.end();
          }),
        ]);
      } catch (assembleErr) {
        try {
          xorWriteStream.destroy();
          plainWriteStream.destroy();
          if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
        } catch {}
        throw assembleErr;
      }

      if (totalSize < 32) {
        fs.promises.unlink(diskPath).catch(() => {});
        return res.status(400).json({ error: 'アップロードされた音声ファイルが空です' });
      }

      const meta = await finalizeTrackFromDisk({
        id,
        diskPath,
        plainAudioPath: plainAssembledPath,
        rawFilename,
        ext,
        headerMime,
        fileSize: totalSize,
        isObfuscated: true,
        titleInput: body.title ?? sessionMeta.title,
        artistInput: body.artist ?? sessionMeta.artist,
        albumInput: body.album ?? sessionMeta.album,
        thumbnailInput: body.thumbnail ?? sessionMeta.thumbnail,
        uploadedByInput: body.uploadedBy ?? sessionMeta.uploadedBy,
        uploadedAtInput: body.uploadedAt ?? sessionMeta.uploadedAt,
        durationSecondsInput: body.durationSeconds ?? sessionMeta.durationSeconds,
        durationInput: body.duration ?? sessionMeta.duration,
      });

      res.json({ success: true, track: meta });
    } catch (err: any) {
      console.error('[SharedOffline] Upload complete error:', err);
      res.status(500).json({ error: err?.message || 'アップロード結合に失敗しました' });
    } finally {
      if (sessionDir) {
        fs.promises.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
      }
      cleanupStaleTmpDirs().catch(() => {});
    }
  });

  // 3. Stream or download shared offline file with HTTP Range & XOR de-obfuscation support
  app.get('/api/shared-offline/file/:id', (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    const item = findTrackById(id);
    if (!item) {
      return res.status(404).json({ error: '共有オフライン音源が見つかりません' });
    }

    const filePath = getTrackDiskPath(item);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '音声ファイルが存在しません' });
    }

    const stat = fs.statSync(filePath);
    const totalSize = stat.size;
    const range = req.headers.range;
    const isDownload = req.query.download === '1' || req.query.dl === '1';

    const ext = item.fileExt || '.mp3';
    const rawBase =
      item.artist && item.artist !== '共有アップロード'
        ? `${item.artist} - ${item.title}`
        : item.title || path.parse(item.fileName || 'shared_audio').name;
    const cleanBase =
      rawBase
        .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120) || 'shared_audio';
    const downloadFilename = cleanBase.toLowerCase().endsWith(ext.toLowerCase())
      ? cleanBase
      : `${cleanBase}${ext}`;
    const asciiFallback =
      downloadFilename.replace(/[^\x20-\x7e]/g, '_') || `shared_audio${ext}`;

    res.setHeader('Content-Type', item.mimeType || 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader(
      'Cache-Control',
      isDownload ? 'no-store' : 'public, max-age=31536000, immutable'
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Shared-Offline-Filename', encodeURIComponent(downloadFilename));
    res.setHeader(
      'Content-Disposition',
      `${isDownload ? 'attachment' : 'inline'}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(
        downloadFilename
      )}`
    );
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Accept-Ranges, Content-Range, Content-Length, Content-Disposition, X-Shared-Offline-Filename'
    );

    if (req.method === 'HEAD') {
      res.setHeader('Content-Length', String(totalSize));
      return res.end();
    }

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      if (isNaN(start) || isNaN(end) || start >= totalSize || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${totalSize}`);
        return res.end();
      }
      const chunkSize = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);
      res.setHeader('Content-Length', String(chunkSize));
      const readStream = fs.createReadStream(filePath, { start, end });
      readStream.on('error', () => {
        if (!res.headersSent) res.status(500).end();
        else res.end();
      });
      if (item.isObfuscated) {
        readStream.pipe(createXorTransformStream(start)).pipe(res);
      } else {
        readStream.pipe(res);
      }
    } else {
      res.setHeader('Content-Length', String(totalSize));
      const readStream = fs.createReadStream(filePath);
      readStream.on('error', () => {
        if (!res.headersSent) res.status(500).end();
        else res.end();
      });
      if (item.isObfuscated) {
        readStream.pipe(createXorTransformStream(0)).pipe(res);
      } else {
        readStream.pipe(res);
      }
    }
  });

  // 3b. Cover artwork endpoint (extracts ID3/MP4 art or fetches iTunes cover on demand; always returns a crisp fallback)
  app.get('/api/shared-offline/cover/:id', async (req: Request, res: Response) => {
    const rawId = String(req.params.id || '').trim();
    const safeId = path.basename(rawId);
    if (!/^[a-zA-Z0-9_-]{3,80}$/.test(safeId)) {
      return res.status(400).json({ error: '無効なIDです' });
    }

    const sendFallbackAppIcon = () => {
      const publicIcon = path.resolve(process.cwd(), 'public', 'pwa-512x512.png');
      if (fs.existsSync(publicIcon)) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.sendFile(publicIcon);
      }
      const fallbackSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#059669"/><stop offset="100%" stop-color="#0f172a"/></linearGradient></defs><rect width="512" height="512" rx="64" fill="url(#g)"/><circle cx="256" cy="256" r="124" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="18"/><path d="M298 156v146a44 44 0 1 1-24-39V194l92-22v106a44 44 0 1 1-24-39v-95z" fill="#ffffff"/></svg>`;
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(fallbackSvg);
    };

    try {
      const existing = findExistingCoverPath(safeId);
      if (existing) {
        res.setHeader('Content-Type', existing.mimeType);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.sendFile(existing.filePath);
      }

      const item = findTrackById(safeId);
      if (!item) {
        return sendFallbackAppIcon();
      }

      const lastFailed = failedCoverLookupAt.get(safeId) || 0;
      if (Date.now() - lastFailed < 5 * 60 * 1000) {
        return sendFallbackAppIcon();
      }

      let pending = inFlightCoverResolves.get(safeId);
      if (!pending) {
        pending = resolveAndSaveCoverForTrack(item)
          .then((savedPath) => {
            if (!savedPath) {
              failedCoverLookupAt.set(safeId, Date.now());
            } else {
              item.thumbnail = buildCoverApiUrl(safeId);
              saveIndex();
            }
            return savedPath;
          })
          .finally(() => {
            inFlightCoverResolves.delete(safeId);
          });
        inFlightCoverResolves.set(safeId, pending);
      }

      const resolvedPath = await pending;
      if (resolvedPath && fs.existsSync(resolvedPath)) {
        const mime = resolvedPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.sendFile(resolvedPath);
      }
    } catch {}

    return sendFallbackAppIcon();
  });

  // 3c. Attach/update cover image explicitly after upload (e.g., data URI for small uploads)
  app.post('/api/shared-offline/:id/cover', async (req: Request, res: Response) => {
    const safeId = path.basename(String(req.params.id || '').trim());
    if (!/^[a-zA-Z0-9_-]{3,80}$/.test(safeId)) {
      return res.status(400).json({ error: '無効なIDです' });
    }
    const item = findTrackById(safeId);
    if (!item) {
      return res.status(404).json({ error: '共有オフライン音源が見つかりません' });
    }
    const thumb = typeof req.body?.thumbnail === 'string' ? req.body.thumbnail.trim() : '';
    if (!thumb) {
      return res.status(400).json({ error: '画像データが指定されていません' });
    }
    try {
      const savedPath = await resolveAndSaveCoverForTrack(item, { thumbnailInput: thumb });
      if (savedPath) {
        item.thumbnail = buildCoverApiUrl(safeId);
        saveIndex();
        return res.json({ success: true, thumbnail: item.thumbnail });
      }
      return res.status(400).json({ error: '対応形式の画像 (JPEG / PNG) を指定してください' });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || 'カバー画像の保存に失敗しました' });
    }
  });

  // 4. Increment play count
  app.post('/api/shared-offline/:id/play', (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    const item = findTrackById(id);
    if (item) {
      item.plays = (item.plays || 0) + 1;
      saveIndex();
    }
    res.json({ success: true });
  });

  // 5. Shared post deletion (admin-only; disabled for general users)
  app.delete('/api/shared-offline/:id', (_req: Request, res: Response) => {
    return res.status(403).json({ error: '共有投稿の削除は管理者のみ実行できます' });
  });

  const requireAdmin: express.RequestHandler =
    options?.requireAdminAuth ||
    ((_req, res) => {
      res.status(403).json({ error: '管理者権限が必要です' });
    });

  // 6. Admin: list shared offline catalog (also recovers any unindexed disk files)
  app.get('/api/admin/shared-offline', requireAdmin, async (_req: Request, res: Response) => {
    reloadIndexIfChanged();
    pruneMissingFiles();
    if (hasUnindexedDiskFiles()) {
      await recoverOrphanedFilesToIndex().catch(() => 0);
    }
    const sorted = [...sharedTracks]
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
      .map((t) => ({
        ...t,
        thumbnail: t.thumbnail || buildCoverApiUrl(t.id),
      }));
    const totalBytes = sorted.reduce((acc, t) => acc + (t.fileSize || 0), 0);
    res.json({
      tracks: sorted,
      totalCount: sorted.length,
      totalBytes,
      deletedIds: Array.from(deletedIds),
    });
  });

  // 6b. Trigger disk recovery explicitly
  app.post('/api/shared-offline/recover', async (_req: Request, res: Response) => {
    const recoveredCount = await recoverOrphanedFilesToIndex(false).catch(() => 0);
    const sorted = [...sharedTracks]
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
      .map((t) => ({
        ...t,
        thumbnail: t.thumbnail || buildCoverApiUrl(t.id),
      }));
    res.json({
      success: true,
      recoveredCount,
      totalCount: sorted.length,
      tracks: sorted,
    });
  });

  // 7. Admin: delete a shared offline track (removes metadata, encrypted/obfuscated file, cover & adds tombstone)
  app.delete('/api/admin/shared-offline/:id', requireAdmin, (req: Request, res: Response) => {
    const rawId = String(req.params.id || '').trim();
    const safeId = path.basename(rawId);
    if (!/^[a-zA-Z0-9_-]{3,80}$/.test(safeId) || safeId !== rawId) {
      return res.status(400).json({ error: '無効なIDです' });
    }

    reloadIndexIfChanged();
    const idx = sharedTracks.findIndex((t) => t.id === safeId);
    if (idx === -1) {
      return res.status(404).json({ error: '共有オフライン音源が見つかりません' });
    }

    const removed = sharedTracks.splice(idx, 1)[0];
    saveIndex();
    markDeletedId(removed.id);
    failedCoverLookupAt.delete(safeId);

    const candidateAudioPath = path.resolve(filesDir, `${removed.id}${removed.fileExt || '.mp3'}`);
    if (candidateAudioPath.startsWith(filesDir + path.sep) && fs.existsSync(candidateAudioPath)) {
      try {
        fs.unlinkSync(candidateAudioPath);
      } catch (err) {
        console.warn('[SharedOffline] Failed to unlink audio file:', err);
      }
    }

    for (const cExt of ['.jpg', '.png']) {
      const candidateCoverPath = path.resolve(coversDir, `${removed.id}${cExt}`);
      if (candidateCoverPath.startsWith(coversDir + path.sep) && fs.existsSync(candidateCoverPath)) {
        try {
          fs.unlinkSync(candidateCoverPath);
        } catch (err) {
          console.warn('[SharedOffline] Failed to unlink cover file:', err);
        }
      }
    }

    if (options?.onTrackDeleted) {
      try {
        options.onTrackDeleted(removed.id);
      } catch {}
    }

    res.json({
      success: true,
      deletedId: removed.id,
      title: removed.title,
      message: `共有オフライン曲「${removed.title}」を削除しました`,
    });
  });
}
