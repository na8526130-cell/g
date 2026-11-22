import express, { Express, Request, Response } from 'express';
import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Transform } from 'stream';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const MAX_UPLOAD_BYTES = 150 * 1024 * 1024; // 150 MiB
const CHUNK_SIZE_BYTES = 1024 * 1024; // 1 MiB
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const XOR_KEY = crypto
  .createHash('sha256')
  .update('zero-music-shared-offline-xor-obfuscation-key-v1')
  .digest();

export interface SharedOfflineTrackMeta {
  id: string;
  shareToken?: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  durationSeconds: number;
  fileName: string;
  fileExt: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: string;
  expiresAt?: string | null;
  retentionMinutes?: number | null;
  allowExtension?: boolean;
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

function generateShareToken(): string {
  return crypto.randomBytes(12).toString('base64url');
}

function computeExpiresAt(retentionMinutesInput: unknown): {
  retentionMinutes: number | null;
  expiresAt: string | null;
} {
  if (retentionMinutesInput === null || retentionMinutesInput === undefined || retentionMinutesInput === '') {
    return { retentionMinutes: null, expiresAt: null };
  }
  const mins = Number(retentionMinutesInput);
  if (!Number.isFinite(mins) || mins <= 0) {
    return { retentionMinutes: null, expiresAt: null };
  }
  const clamped = Math.min(Math.max(Math.round(mins), 1), 365 * 24 * 60);
  return {
    retentionMinutes: clamped,
    expiresAt: new Date(Date.now() + clamped * 60 * 1000).toISOString(),
  };
}

function isTrackExpired(item: SharedOfflineTrackMeta, nowMs = Date.now()): boolean {
  if (!item.expiresAt) return false;
  const expMs = new Date(item.expiresAt).getTime();
  return Number.isFinite(expMs) && expMs <= nowMs;
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

async function probeDurationSeconds(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        filePath,
      ],
      { timeout: 10000 }
    );
    const parsed = parseFloat(String(stdout || '').trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed);
    }
  } catch {}
  return 0;
}

interface UploadSessionMeta {
  uploadId: string;
  filename: string;
  mimeType: string;
  ext: string;
  fileSize: number;
  chunkCount: number;
  retentionMinutes: number | null;
  allowExtension: boolean;
  title?: string;
  artist?: string;
  album?: string;
  uploadedBy?: string;
  durationSeconds?: number;
  duration?: string;
  createdAt: number;
}

export function registerSharedOfflineRoutes(
  app: Express,
  dataDir: string,
  onTrackAdded?: (track: SharedOfflineTrackMeta) => void
) {
  const filesDir = path.resolve(dataDir, 'shared_offline_files');
  const tmpDir = path.resolve(dataDir, 'shared_offline_tmp');
  const indexFile = path.resolve(dataDir, 'shared_offline_index.json');

  const ensureDirs = () => {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(filesDir)) {
      fs.mkdirSync(filesDir, { recursive: true });
    }
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
  };

  const getTrackDiskPath = (item: Pick<SharedOfflineTrackMeta, 'id' | 'fileExt'>) =>
    path.join(filesDir, `${item.id}${item.fileExt || '.mp3'}`);

  const loadIndex = (): SharedOfflineTrackMeta[] => {
    try {
      ensureDirs();
      if (fs.existsSync(indexFile)) {
        const raw = fs.readFileSync(indexFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const now = Date.now();
          return parsed.filter((item) => {
            if (!item || typeof item.id !== 'string') return false;
            const filePath = getTrackDiskPath(item);
            if (!fs.existsSync(filePath)) return false;
            if (isTrackExpired(item, now)) {
              fs.promises.unlink(filePath).catch(() => {});
              return false;
            }
            return true;
          });
        }
      }
    } catch (err) {
      console.warn('[SharedOffline] Failed to load index:', err);
    }
    return [];
  };

  let sharedTracks: SharedOfflineTrackMeta[] = loadIndex();

  const saveIndex = () => {
    try {
      ensureDirs();
      fs.writeFileSync(indexFile, JSON.stringify(sharedTracks, null, 2), 'utf8');
    } catch (err) {
      console.warn('[SharedOffline] Failed to save index:', err);
    }
  };

  const purgeExpiredAndMissing = () => {
    const now = Date.now();
    let changed = false;
    const kept: SharedOfflineTrackMeta[] = [];
    for (const item of sharedTracks) {
      const filePath = getTrackDiskPath(item);
      const exists = fs.existsSync(filePath);
      const expired = isTrackExpired(item, now);
      if (!exists || expired) {
        changed = true;
        if (exists) {
          fs.promises.unlink(filePath).catch(() => {});
        }
        continue;
      }
      kept.push(item);
    }
    if (changed) {
      sharedTracks = kept;
      saveIndex();
    }
  };

  // Periodic cleanup of expired shared files every 5 minutes
  const expiryTimer = setInterval(() => {
    purgeExpiredAndMissing();
  }, 5 * 60 * 1000);
  if (typeof expiryTimer.unref === 'function') {
    expiryTimer.unref();
  }

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

  const findTrackByTokenOrId = (tokenOrId: string): SharedOfflineTrackMeta | undefined => {
    const key = String(tokenOrId || '').trim();
    if (!key) return undefined;
    return sharedTracks.find((t) => t.id === key || t.shareToken === key);
  };

  const finalizeTrackFromDisk = async (params: {
    id: string;
    diskPath: string;
    rawFilename: string;
    ext: string;
    headerMime: string;
    fileSize: number;
    isObfuscated: boolean;
    retentionMinutes?: unknown;
    allowExtension?: unknown;
    titleInput?: unknown;
    artistInput?: unknown;
    albumInput?: unknown;
    uploadedByInput?: unknown;
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
    if (durationSeconds <= 0 && !params.isObfuscated) {
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
    const { retentionMinutes, expiresAt } = computeExpiresAt(params.retentionMinutes);
    const allowExtension =
      params.allowExtension === true || params.allowExtension === 'true' || params.allowExtension === '1';

    const meta: SharedOfflineTrackMeta = {
      id: params.id,
      shareToken: generateShareToken(),
      title,
      artist,
      album,
      duration,
      durationSeconds,
      fileName: params.rawFilename,
      fileExt: params.ext,
      mimeType,
      fileSize: params.fileSize,
      uploadedBy,
      uploadedAt: new Date().toISOString(),
      expiresAt,
      retentionMinutes,
      allowExtension,
      isObfuscated: params.isObfuscated,
      plays: 0,
    };

    sharedTracks.unshift(meta);
    if (sharedTracks.length > 200) {
      const removed = sharedTracks.splice(200);
      for (const old of removed) {
        const oldPath = getTrackDiskPath(old);
        fs.promises.unlink(oldPath).catch(() => {});
      }
    }
    saveIndex();

    if (onTrackAdded) {
      try {
        onTrackAdded(meta);
      } catch {}
    }

    return meta;
  };

  // 1. List all active (non-expired) shared offline tracks
  app.get('/api/shared-offline', (_req: Request, res: Response) => {
    purgeExpiredAndMissing();
    const sorted = [...sharedTracks].sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
    const totalBytes = sorted.reduce((acc, t) => acc + (t.fileSize || 0), 0);
    res.json({
      tracks: sorted,
      totalCount: sorted.length,
      totalBytes,
    });
  });

  // 1b. Fetch single shared item metadata by shareToken or id (for ?shared_file= links)
  app.get('/api/shared-offline/item/:tokenOrId', (req: Request, res: Response) => {
    const key = String(req.params.tokenOrId || '').trim();
    const item = findTrackByTokenOrId(key);
    if (!item) {
      return res.status(404).json({ error: '共有ファイルが見つかりません。削除されたかURLが正しくありません。' });
    }
    const filePath = getTrackDiskPath(item);
    if (!fs.existsSync(filePath) || isTrackExpired(item)) {
      purgeExpiredAndMissing();
      return res.status(410).json({ error: 'この共有リンクは有効期限が切れています。' });
    }
    res.json({ track: item });
  });

  // 1c. Extend shared file expiration by +7 days (unlimited times if allowExtension is enabled)
  app.post('/api/shared-offline/:tokenOrId/extend', (req: Request, res: Response) => {
    purgeExpiredAndMissing();
    const key = String(req.params.tokenOrId || '').trim();
    const item = findTrackByTokenOrId(key);
    if (!item) {
      return res.status(404).json({ error: '共有ファイルが見つからないか、既に期限切れです。' });
    }
    if (!item.allowExtension) {
      return res.status(403).json({ error: 'このファイルは有効期限の延長が許可されていません。' });
    }
    if (!item.expiresAt) {
      return res.json({ success: true, track: item });
    }
    const currentExpMs = new Date(item.expiresAt).getTime();
    const baseMs = Number.isFinite(currentExpMs) ? Math.max(Date.now(), currentExpMs) : Date.now();
    item.expiresAt = new Date(baseMs + SEVEN_DAYS_MS).toISOString();
    saveIndex();
    res.json({ success: true, track: item });
  });

  // 2a. Single-request Upload (fast path for files <= 1 MiB) with fixed-key XOR obfuscation
  app.post(
    '/api/shared-offline/upload',
    express.raw({ type: '*/*', limit: '25mb' }),
    async (req: Request, res: Response) => {
      try {
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
        const id = `shared_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const diskPath = path.join(filesDir, `${id}${ext}`);
        const obfuscated = xorBufferAtOffset(bodyBuf, 0);
        await fs.promises.writeFile(diskPath, obfuscated);

        const meta = await finalizeTrackFromDisk({
          id,
          diskPath,
          rawFilename,
          ext,
          headerMime,
          fileSize: bodyBuf.length,
          isObfuscated: true,
          retentionMinutes: req.query.retentionMinutes,
          allowExtension: req.query.allowExtension,
          titleInput: req.query.title,
          artistInput: req.query.artist,
          albumInput: req.query.album,
          uploadedByInput: req.query.uploadedBy,
          durationSecondsInput: req.query.durationSeconds,
          durationInput: req.query.duration,
        });

        res.json({ success: true, track: meta });
      } catch (err: any) {
        console.error('[SharedOffline] Upload error:', err);
        res.status(500).json({ error: err?.message || 'アップロードに失敗しました' });
      }
    }
  );

  // 2b. Chunked Upload Step 0: Begin upload session (validates size, retention, extension, creates session)
  app.post('/api/shared-offline/upload-begin', async (req: Request, res: Response) => {
    try {
      const body = req.body || {};
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

      const { retentionMinutes } = computeExpiresAt(body.retentionMinutes);
      const sessionMeta: UploadSessionMeta = {
        uploadId,
        filename: rawFilename,
        mimeType: headerMime,
        ext,
        fileSize,
        chunkCount,
        retentionMinutes,
        allowExtension: Boolean(body.allowExtension),
        title: typeof body.title === 'string' ? body.title : undefined,
        artist: typeof body.artist === 'string' ? body.artist : undefined,
        album: typeof body.album === 'string' ? body.album : undefined,
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

      const id = `shared_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const diskPath = path.join(filesDir, `${id}${ext}`);
      const writeStream = fs.createWriteStream(diskPath);

      let totalSize = 0;
      try {
        for (let i = 0; i < totalChunks; i++) {
          const chunkPath = path.join(sessionDir, `chunk_${String(i).padStart(6, '0')}.part`);
          if (!fs.existsSync(chunkPath)) {
            throw new Error(`分割データ(${i + 1}/${totalChunks})が不足しています`);
          }
          const chunkData = await fs.promises.readFile(chunkPath);
          const xorData = xorBufferAtOffset(chunkData, totalSize);
          totalSize += chunkData.length;
          if (!writeStream.write(xorData)) {
            await new Promise<void>((resolve) => writeStream.once('drain', resolve));
          }
        }
        await new Promise<void>((resolve, reject) => {
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
          writeStream.end();
        });
      } catch (assembleErr) {
        try {
          writeStream.destroy();
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
        rawFilename,
        ext,
        headerMime,
        fileSize: totalSize,
        isObfuscated: true,
        retentionMinutes: body.retentionMinutes ?? sessionMeta.retentionMinutes,
        allowExtension: body.allowExtension ?? sessionMeta.allowExtension,
        titleInput: body.title ?? sessionMeta.title,
        artistInput: body.artist ?? sessionMeta.artist,
        albumInput: body.album ?? sessionMeta.album,
        uploadedByInput: body.uploadedBy ?? sessionMeta.uploadedBy,
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

  // 3. Stream / Download shared offline file with HTTP Range & XOR de-obfuscation support
  app.get('/api/shared-offline/file/:id', (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    const item = findTrackByTokenOrId(id);
    if (!item) {
      return res.status(404).json({ error: '共有オフライン音源が見つかりません' });
    }

    const filePath = getTrackDiskPath(item);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '音声ファイルが存在しません' });
    }
    if (isTrackExpired(item)) {
      purgeExpiredAndMissing();
      return res.status(410).json({ error: 'この共有ファイルの有効期限は終了しました' });
    }

    const stat = fs.statSync(filePath);
    const totalSize = stat.size;
    const range = req.headers.range;
    const isDownload = req.query.download === '1' || req.query.download === 'true';

    res.setHeader('Content-Type', item.mimeType || 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', item.expiresAt ? 'private, max-age=300' : 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const safeAscii = `${item.id}${item.fileExt || '.mp3'}`;
    const downloadName = item.fileName || `${item.artist} - ${item.title}${item.fileExt || '.mp3'}`;
    const encoded = encodeURIComponent(downloadName);
    res.setHeader(
      'Content-Disposition',
      `${isDownload ? 'attachment' : 'inline'}; filename="${safeAscii}"; filename*=UTF-8''${encoded}`
    );

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
      if (item.isObfuscated) {
        readStream.pipe(createXorTransformStream(start)).pipe(res);
      } else {
        readStream.pipe(res);
      }
    } else {
      res.setHeader('Content-Length', String(totalSize));
      const readStream = fs.createReadStream(filePath);
      if (item.isObfuscated) {
        readStream.pipe(createXorTransformStream(0)).pipe(res);
      } else {
        readStream.pipe(res);
      }
    }
  });

  // 4. Increment play count
  app.post('/api/shared-offline/:id/play', (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    const item = findTrackByTokenOrId(id);
    if (item) {
      item.plays = (item.plays || 0) + 1;
      saveIndex();
    }
    res.json({ success: true });
  });

  // 5. Shared post deletion disabled
  app.delete('/api/shared-offline/:id', (_req: Request, res: Response) => {
    return res.status(403).json({ error: '共有投稿の削除は無効化されています' });
  });
}
