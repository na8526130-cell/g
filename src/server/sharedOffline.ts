import express, { Express, Request, Response } from 'express';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface SharedOfflineTrackMeta {
  id: string;
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
  let ext = path.extname(rawFilename).toLowerCase();
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
    // Allow raw binary upload with unknown extension as fallback .mp3
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

  const loadIndex = (): SharedOfflineTrackMeta[] => {
    try {
      ensureDirs();
      if (fs.existsSync(indexFile)) {
        const raw = fs.readFileSync(indexFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter((item) => {
            if (!item || typeof item.id !== 'string') return false;
            const ext = item.fileExt || '.mp3';
            const filePath = path.join(filesDir, `${item.id}${ext}`);
            return fs.existsSync(filePath);
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

  const finalizeTrackFromDisk = async (params: {
    id: string;
    diskPath: string;
    rawFilename: string;
    ext: string;
    headerMime: string;
    fileSize: number;
    titleInput?: unknown;
    artistInput?: unknown;
    albumInput?: unknown;
    uploadedByInput?: unknown;
    durationSecondsInput?: unknown;
    durationInput?: unknown;
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

    let durationSeconds = Math.max(0, Math.round(Number(params.durationSecondsInput) || 0));
    if (durationSeconds <= 0) {
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

    const meta: SharedOfflineTrackMeta = {
      id: params.id,
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
      plays: 0,
    };

    sharedTracks.unshift(meta);
    if (sharedTracks.length > 200) {
      const removed = sharedTracks.splice(200);
      for (const old of removed) {
        const oldPath = path.join(filesDir, `${old.id}${old.fileExt || '.mp3'}`);
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

  // 1. List all shared offline tracks
  app.get('/api/shared-offline', (_req: Request, res: Response) => {
    const valid = sharedTracks.filter((item) => {
      const filePath = path.join(filesDir, `${item.id}${item.fileExt || '.mp3'}`);
      return fs.existsSync(filePath);
    });
    if (valid.length !== sharedTracks.length) {
      sharedTracks = valid;
      saveIndex();
    }
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

  // 2a. Single-request Upload (fast path for files up to 12MB)
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
        await fs.promises.writeFile(diskPath, bodyBuf);

        const meta = await finalizeTrackFromDisk({
          id,
          diskPath,
          rawFilename,
          ext,
          headerMime,
          fileSize: bodyBuf.length,
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

  // 2b. Chunked Upload Step 1: Receive a single <=6MB chunk (bypasses Cloud Run 32MB limit)
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

  // 2c. Chunked Upload Step 2: Assemble chunks & register Shared Offline track
  app.post('/api/shared-offline/upload-complete', async (req: Request, res: Response) => {
    let sessionDir = '';
    try {
      const body = req.body || {};
      const uploadId = String(body.uploadId || '')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 64);
      const totalChunks = parseInt(String(body.totalChunks ?? '0'), 10);

      if (!uploadId || totalChunks <= 0) {
        return res.status(400).json({ error: '無効なアップロード完了リクエストです' });
      }

      ensureDirs();
      sessionDir = path.join(tmpDir, uploadId);
      if (!fs.existsSync(sessionDir)) {
        return res.status(404).json({ error: 'アップロードセッションが見つかりません' });
      }

      const rawFilename = sanitizeText(body.filename, 'shared_audio.mp3', 180);
      const headerMime = String(body.mimeType || '').toLowerCase();
      const ext = resolveExtension(rawFilename, headerMime);
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
          totalSize += chunkData.length;
          if (!writeStream.write(chunkData)) {
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
        titleInput: body.title,
        artistInput: body.artist,
        albumInput: body.album,
        uploadedByInput: body.uploadedBy,
        durationSecondsInput: body.durationSeconds,
        durationInput: body.duration,
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

  // 3. Stream / Download shared offline file with HTTP Range support
  app.get('/api/shared-offline/file/:id', (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    const item = sharedTracks.find((t) => t.id === id);
    if (!item) {
      return res.status(404).json({ error: '共有オフライン音源が見つかりません' });
    }

    const filePath = path.join(filesDir, `${item.id}${item.fileExt || '.mp3'}`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '音声ファイルが存在しません' });
    }

    const stat = fs.statSync(filePath);
    const totalSize = stat.size;
    const range = req.headers.range;

    res.setHeader('Content-Type', item.mimeType || 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const safeAscii = `${item.id}${item.fileExt || '.mp3'}`;
    const encoded = encodeURIComponent(`${item.artist} - ${item.title}${item.fileExt || '.mp3'}`);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${safeAscii}"; filename*=UTF-8''${encoded}`
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
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', String(totalSize));
      fs.createReadStream(filePath).pipe(res);
    }
  });

  // 4. Increment play count
  app.post('/api/shared-offline/:id/play', (req: Request, res: Response) => {
    const id = String(req.params.id || '').trim();
    const item = sharedTracks.find((t) => t.id === id);
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
