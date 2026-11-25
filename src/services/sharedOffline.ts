import { Track } from '../types/music';
import {
  buildSharedCoverUrl,
  getActiveOfflineBlobUrl,
  getAllCachedSharedTracks,
  getCachedSharedOfflineIds,
  getCachedSharedOfflineTrack,
  getOfflineMeta,
  getStoredOfflineTrackRecord,
  isLegacyPlaceholderThumbnail,
  notifySharedOfflineChanged,
  recoverSharedBlobFromSwCache,
  refreshSharedOfflineThumbnailCache,
  removeDeletedSharedOfflineCaches,
  resolveSharedTrackDisplayThumbnail,
  saveOfflineMeta,
  saveOfflineTrack,
  saveSharedOfflineBlob,
  warmSharedOfflineBlobUrls,
} from './offlineStorage';
import { isIosStandalonePwa, shareBlobFile, triggerBlobDownload } from './freemake';
import { recordDownloadHistory } from './downloadHistory';
import { BackupSharedOfflineTrack } from '../utils/userBackupJson';
import { toBase64Image } from '../utils/imageBase64';

export interface ServerSharedOfflineItem {
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
  plays: number;
}

const SHARED_CATALOG_META_KEY = 'shared_offline_catalog_v1';

const CHUNK_THRESHOLD_BYTES = 1024 * 1024; // 1 MiB
const CHUNK_SIZE_BYTES = 1024 * 1024; // 1 MiB per chunk
const MAX_UPLOAD_BYTES = 150 * 1024 * 1024; // 150 MiB max

let activeSyncPromise: Promise<{ cached: number; total: number }> | null = null;

function mapServerItemToTrack(item: ServerSharedOfflineItem, cachedIds: Set<string>): Track {
  const activeBlobUrl = getActiveOfflineBlobUrl(item.id);
  const isCached = cachedIds.has(item.id) || Boolean(activeBlobUrl);
  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
  const cleanExt = (item.fileExt || item.fileName?.split('.').pop() || 'mp3')
    .replace(/^\./, '')
    .toLowerCase();
  const resolvedThumb = resolveSharedTrackDisplayThumbnail(
    item.id,
    item.thumbnail,
    buildSharedCoverUrl(item.id)
  );
  return {
    id: item.id,
    title: item.title,
    artist: item.artist,
    album: item.album || '共有オフライン',
    duration: item.duration || '3:00',
    durationSeconds: item.durationSeconds || 180,
    thumbnail: resolvedThumb,
    isLocal: true,
    isSharedOffline: true,
    isCachedOffline: isCached,
    uploadedBy: item.uploadedBy || 'ゲスト',
    uploadedAt: item.uploadedAt,
    fileSize: item.fileSize,
    fileName: item.fileName,
    fileExt: cleanExt,
    audioMimeType: item.mimeType || undefined,
    audioUrl: activeBlobUrl || (isOffline && !isCached ? undefined : `/api/shared-offline/file/${encodeURIComponent(item.id)}`),
  };
}

export function formatFileSizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function readAudioDuration(file: Blob): Promise<number> {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return 0;
  const tempUrl = URL.createObjectURL(file);
  try {
    return await new Promise<number>((resolve) => {
      const audio = new Audio(tempUrl);
      const timer = setTimeout(() => resolve(0), 2500);
      audio.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve(Number.isFinite(audio.duration) ? Math.round(audio.duration) : 0);
      };
      audio.onerror = () => {
        clearTimeout(timer);
        resolve(0);
      };
    });
  } finally {
    try {
      URL.revokeObjectURL(tempUrl);
    } catch {}
  }
}

function formatDurationLabel(sec: number): string {
  const safe = Math.max(0, Math.round(sec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function extractErrorMessage(resp: Response, fallback: string): Promise<string> {
  try {
    const contentType = resp.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const errJson = await resp.json();
      if (errJson?.error) return String(errJson.error);
    } else {
      const text = await resp.text();
      if (resp.status === 413) {
        return 'ファイルサイズがサーバー送信上限を超えました';
      }
      if (text && !text.trim().startsWith('<')) {
        return text.trim().slice(0, 140);
      }
    }
  } catch {}
  return `${fallback} (HTTP ${resp.status})`;
}

/**
 * Load Shared Offline tracks:
 * - Online: fetches from server, saves catalog to IndexedDB, checks offline Blob cache
 * - Offline: returns cached catalog + cached Blob tracks from IndexedDB so playback works offline
 */
export async function loadSharedOfflineTracks(): Promise<{
  tracks: Track[];
  fromOfflineCache: boolean;
}> {
  const cachedIds = await getCachedSharedOfflineIds();
  if (cachedIds.size > 0) {
    await warmSharedOfflineBlobUrls();
  }

  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const res = await fetch('/api/shared-offline', {
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const data = await res.json();
        const items: ServerSharedOfflineItem[] = Array.isArray(data?.tracks) ? data.tracks : [];
        const deletedIds = new Set<string>(
          Array.isArray(data?.deletedIds)
            ? data.deletedIds.filter((id: unknown): id is string => typeof id === 'string')
            : []
        );
        const serverIds = new Set(items.map((item) => item.id));
        for (const cachedId of Array.from(cachedIds)) {
          // Only purge local IndexedDB cache when the server confirms an admin explicitly deleted this track
          if (!serverIds.has(cachedId) && deletedIds.has(cachedId)) {
            cachedIds.delete(cachedId);
            removeDeletedSharedOfflineCaches(cachedId).catch(() => {});
          }
        }
        await saveOfflineMeta(SHARED_CATALOG_META_KEY, items).catch(() => {});

        const mappedTracks = items.map((item) => mapServerItemToTrack(item, cachedIds));
        // Preserve any locally cached shared tracks not yet on server & not admin-deleted
        const hasMissingFromServer = Array.from(cachedIds).some(
          (cid) => !serverIds.has(cid) && !deletedIds.has(cid)
        );
        if (hasMissingFromServer) {
          const cachedBlobTracks = await getAllCachedSharedTracks();
          for (const ct of cachedBlobTracks) {
            if (!serverIds.has(ct.id) && !deletedIds.has(ct.id)) {
              mappedTracks.push(ct);
            }
          }
          mappedTracks.sort((a, b) => {
            const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
            const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
            return tb - ta;
          });
        }

        return {
          tracks: mappedTracks,
          fromOfflineCache: false,
        };
      }
    } catch {}
  }

  // Offline / fallback path: reconstruct from IndexedDB cached blobs, SW cache & catalog metadata
  let cachedCatalog = await getOfflineMeta<ServerSharedOfflineItem[]>(SHARED_CATALOG_META_KEY);
  if ((!cachedCatalog || cachedCatalog.length === 0) && typeof window !== 'undefined' && 'caches' in window) {
    try {
      const swCatalog = await window.caches.match('/api/shared-offline');
      if (swCatalog && swCatalog.ok) {
        const parsed = await swCatalog.json();
        if (Array.isArray(parsed?.tracks)) {
          cachedCatalog = parsed.tracks;
          saveOfflineMeta(SHARED_CATALOG_META_KEY, cachedCatalog).catch(() => {});
        }
      }
    } catch {}
  }

  const cachedBlobTracks = await getAllCachedSharedTracks();

  const byId = new Map<string, Track>();
  for (const t of cachedBlobTracks) {
    byId.set(t.id, t);
  }
  if (Array.isArray(cachedCatalog)) {
    for (const item of cachedCatalog) {
      if (!byId.has(item.id)) {
        const swBlob = await recoverSharedBlobFromSwCache(item.id);
        if (swBlob && swBlob.size > 0) {
          const coverUrl = resolveSharedTrackDisplayThumbnail(
            item.id,
            item.thumbnail,
            buildSharedCoverUrl(item.id)
          );
          const blobUrl = await saveSharedOfflineBlob(
            {
              id: item.id,
              title: item.title,
              artist: item.artist,
              album: item.album,
              duration: item.duration,
              durationSeconds: item.durationSeconds,
              thumbnail: coverUrl,
              fileName: item.fileName,
              fileType: item.mimeType || swBlob.type,
              fileSize: item.fileSize || swBlob.size,
              uploadedBy: item.uploadedBy,
              uploadedAt: item.uploadedAt,
            },
            swBlob
          ).catch(() => URL.createObjectURL(swBlob));
          cachedIds.add(item.id);
          byId.set(item.id, {
            ...mapServerItemToTrack(item, cachedIds),
            isCachedOffline: true,
            audioUrl: blobUrl,
          });
        } else {
          byId.set(item.id, mapServerItemToTrack(item, cachedIds));
        }
      }
    }
  }

  const merged = Array.from(byId.values()).sort((a, b) => {
    const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
    const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
    return tb - ta;
  });

  return {
    tracks: merged,
    fromOfflineCache: true,
  };
}

export async function removeDeletedSharedOfflineTrackLocal(trackId: string): Promise<void> {
  if (!trackId) return;
  try {
    const existingCatalog =
      (await getOfflineMeta<ServerSharedOfflineItem[]>(SHARED_CATALOG_META_KEY)) || [];
    if (Array.isArray(existingCatalog) && existingCatalog.length > 0) {
      const next = existingCatalog.filter((x) => x.id !== trackId);
      if (next.length !== existingCatalog.length) {
        await saveOfflineMeta(SHARED_CATALOG_META_KEY, next);
      }
    }
  } catch {}
  await removeDeletedSharedOfflineCaches(trackId);
}

/**
 * Upload an audio/video file to Shared Offline (persisted indefinitely with no expiration).
 * Uses 1 MiB chunked upload (begin -> chunk -> complete, with abort cleanup) for files > 1 MiB.
 */
export async function uploadSharedOfflineFile(
  file: File | Blob,
  options?: {
    preserveId?: string;
    uploadedAt?: string;
    filename?: string;
    title?: string;
    artist?: string;
    album?: string;
    thumbnail?: string;
    uploadedBy?: string;
    durationSeconds?: number;
    duration?: string;
    signal?: AbortSignal;
    onProgress?: (percent: number, stageLabel?: string) => void;
  }
): Promise<Track> {
  if (!file || file.size < 32) {
    throw new Error('音声ファイルが空、または小さすぎます');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('ファイルサイズは150 MiB以下にしてください');
  }

  const filename =
    options?.filename || (file instanceof File ? file.name : `shared_track_${Date.now()}.mp3`);
  const mimeType = file.type || 'audio/mpeg';
  const standaloneBlob = file.slice(0, file.size, mimeType);

  const baseName = filename.replace(/\.[^/.]+$/, '');
  let defaultTitle = baseName || 'Shared Track';
  let defaultArtist = '共有アップロード';
  if (baseName.includes(' - ')) {
    const parts = baseName.split(' - ');
    if (parts[0].trim()) defaultArtist = parts[0].trim();
    if (parts.slice(1).join(' - ').trim()) defaultTitle = parts.slice(1).join(' - ').trim();
  }

  const finalTitle = options?.title?.trim() || defaultTitle;
  const finalArtist = options?.artist?.trim() || defaultArtist;
  const finalAlbum = options?.album?.trim() || '共有オフライン';
  const finalUploadedBy = options?.uploadedBy?.trim() || 'ゲスト';

  options?.onProgress?.(2, '準備中…');

  let durationSeconds = options?.durationSeconds || 0;
  if (durationSeconds <= 0) {
    durationSeconds = await readAudioDuration(standaloneBlob);
  }
  const duration =
    options?.duration || (durationSeconds > 0 ? formatDurationLabel(durationSeconds) : '');

  const rawInputThumb =
    options?.thumbnail && !isLegacyPlaceholderThumbnail(options.thumbnail)
      ? options.thumbnail.trim()
      : undefined;

  let serverTrack: ServerSharedOfflineItem;

  if (standaloneBlob.size <= CHUNK_THRESHOLD_BYTES) {
    const qs = new URLSearchParams({
      filename,
      title: finalTitle,
      artist: finalArtist,
      album: finalAlbum,
      uploadedBy: finalUploadedBy,
      mime: mimeType,
    });
    if (options?.preserveId) qs.set('preserveId', options.preserveId);
    if (options?.uploadedAt) qs.set('uploadedAt', options.uploadedAt);
    if (durationSeconds > 0) qs.set('durationSeconds', String(durationSeconds));
    if (duration) qs.set('duration', duration);
    if (rawInputThumb && /^https?:\/\//i.test(rawInputThumb) && rawInputThumb.length <= 1024) {
      qs.set('thumbnail', rawInputThumb);
    }

    options?.onProgress?.(35, 'アップロード中…');
    const buf = await standaloneBlob.arrayBuffer();
    const resp = await fetch(`/api/shared-offline/upload?${qs.toString()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: buf,
      signal: options?.signal,
    });

    if (!resp.ok) {
      throw new Error(await extractErrorMessage(resp, 'アップロードに失敗しました'));
    }

    const data = await resp.json();
    if (!data?.track) {
      throw new Error('サーバーからの応答が不正です');
    }
    serverTrack = data.track;
    if (rawInputThumb && rawInputThumb.startsWith('data:image/')) {
      await fetch(`/api/shared-offline/${encodeURIComponent(serverTrack.id)}/cover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thumbnail: rawInputThumb }),
      }).catch(() => {});
    }
    options?.onProgress?.(94, '仕上げ処理中…');
  } else {
    let uploadId: string | null = null;
    try {
      const beginResp = await fetch('/api/shared-offline/upload-begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preserveId: options?.preserveId,
          uploadedAt: options?.uploadedAt,
          filename,
          mimeType,
          fileSize: standaloneBlob.size,
          title: finalTitle,
          artist: finalArtist,
          album: finalAlbum,
          thumbnail: rawInputThumb,
          uploadedBy: finalUploadedBy,
          durationSeconds,
          duration,
        }),
        signal: options?.signal,
      });

      if (!beginResp.ok) {
        throw new Error(await extractErrorMessage(beginResp, 'アップロード開始に失敗しました'));
      }

      const started = await beginResp.json();
      if (started?.alreadyExists && started?.track) {
        serverTrack = started.track;
        options?.onProgress?.(95, '既存曲を確認…');
      } else {
        uploadId = String(started.uploadId);
        const chunkSize = Number(started.chunkSize) || CHUNK_SIZE_BYTES;
        const totalChunks = Number(started.chunkCount) || Math.ceil(standaloneBlob.size / chunkSize);

        for (let idx = 0; idx < totalChunks; idx++) {
          if (options?.signal?.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }
          const start = idx * chunkSize;
          const end = Math.min(standaloneBlob.size, start + chunkSize);
          const chunkBuf = await standaloneBlob.slice(start, end).arrayBuffer();

          const cqs = new URLSearchParams({
            uploadId,
            chunkIndex: String(idx),
            totalChunks: String(totalChunks),
          });

          const chunkResp = await fetch(`/api/shared-offline/upload-chunk?${cqs.toString()}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/octet-stream',
            },
            body: chunkBuf,
            signal: options?.signal,
          });

          if (!chunkResp.ok) {
            throw new Error(
              await extractErrorMessage(
                chunkResp,
                `分割アップロード (${idx + 1}/${totalChunks}) に失敗しました`
              )
            );
          }

          const pct = Math.min(93, Math.round(((idx + 1) / totalChunks) * 88) + 5);
          options?.onProgress?.(pct, `チャンク送信中 (${idx + 1}/${totalChunks})…`);
        }

        options?.onProgress?.(95, '結合・難読化処理中…');
        const completeResp = await fetch('/api/shared-offline/upload-complete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            uploadId,
            preserveId: options?.preserveId,
            uploadedAt: options?.uploadedAt,
            totalChunks,
            filename,
            mimeType,
            title: finalTitle,
            artist: finalArtist,
            album: finalAlbum,
            thumbnail: rawInputThumb,
            uploadedBy: finalUploadedBy,
            durationSeconds,
            duration,
          }),
          signal: options?.signal,
        });

        if (!completeResp.ok) {
          throw new Error(await extractErrorMessage(completeResp, 'アップロード結合に失敗しました'));
        }

        const completeData = await completeResp.json();
        if (!completeData?.track) {
          throw new Error('サーバーからの応答が不正です');
        }
        uploadId = null;
        serverTrack = completeData.track;
      }
    } catch (err: any) {
      if (uploadId) {
        fetch('/api/shared-offline/upload-abort', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uploadId }),
        }).catch(() => {});
      }
      if (err?.name === 'AbortError') {
        throw new Error('アップロードをキャンセルしました');
      }
      throw err;
    }
  }

  const resolvedCoverUrl = resolveSharedTrackDisplayThumbnail(
    serverTrack.id,
    serverTrack.thumbnail,
    rawInputThumb,
    buildSharedCoverUrl(serverTrack.id)
  );

  let blobUrl = `/api/shared-offline/file/${encodeURIComponent(serverTrack.id)}`;
  let isCachedOffline = false;
  try {
    blobUrl = await saveSharedOfflineBlob(
      {
        id: serverTrack.id,
        title: serverTrack.title,
        artist: serverTrack.artist,
        album: serverTrack.album,
        duration: serverTrack.duration,
        durationSeconds: serverTrack.durationSeconds,
        thumbnail: resolvedCoverUrl,
        fileName: serverTrack.fileName,
        fileType: serverTrack.mimeType,
        fileSize: serverTrack.fileSize,
        uploadedBy: serverTrack.uploadedBy,
        uploadedAt: serverTrack.uploadedAt,
      },
      standaloneBlob
    );
    isCachedOffline = true;
  } catch (idbErr) {
    console.warn('[SharedOffline] Local IndexedDB cache skipped after upload:', idbErr);
    try {
      blobUrl = URL.createObjectURL(standaloneBlob);
    } catch {}
  }

  try {
    const existingCatalog =
      (await getOfflineMeta<ServerSharedOfflineItem[]>(SHARED_CATALOG_META_KEY)) || [];
    await saveOfflineMeta(SHARED_CATALOG_META_KEY, [
      serverTrack,
      ...existingCatalog.filter((x) => x.id !== serverTrack.id),
    ]);
  } catch {}

  const finalDisplayThumb = resolveSharedTrackDisplayThumbnail(
    serverTrack.id,
    resolvedCoverUrl
  );

  options?.onProgress?.(100, '完了');
  notifySharedOfflineChanged();

  return {
    id: serverTrack.id,
    title: serverTrack.title,
    artist: serverTrack.artist,
    album: serverTrack.album,
    duration: serverTrack.duration,
    durationSeconds: serverTrack.durationSeconds,
    thumbnail: finalDisplayThumb,
    isLocal: true,
    isSharedOffline: true,
    isCachedOffline,
    uploadedBy: serverTrack.uploadedBy,
    uploadedAt: serverTrack.uploadedAt,
    fileSize: serverTrack.fileSize,
    fileName: serverTrack.fileName,
    fileExt: (serverTrack.fileExt || 'mp3').replace(/^\./, '').toLowerCase(),
    audioUrl: blobUrl,
  };
}

/**
 * Publish an already saved local/offline track directly to Shared Offline
 */
export async function publishOfflineTrackToShared(
  track: Track,
  uploadedBy?: string
): Promise<Track> {
  const record = await getStoredOfflineTrackRecord(track.id);
  if (!record?.blob) {
    throw new Error('ローカル音源データが見つかりませんでした');
  }
  return uploadSharedOfflineFile(record.blob, {
    filename: record.fileName || `${record.title}.mp3`,
    title: record.title,
    artist: record.artist,
    album: record.album || '共有オフライン',
    thumbnail: !isLegacyPlaceholderThumbnail(record.thumbnail) ? record.thumbnail : track.thumbnail,
    uploadedBy: uploadedBy || 'ゲスト',
    durationSeconds: record.durationSeconds,
    duration: record.duration,
  });
}

/**
 * Automatically cache all (or uncached) Shared Offline tracks into IndexedDB while online
 */
export async function syncSharedTracksForOffline(
  tracksInput?: Track[],
  onProgress?: (cachedCount: number, totalCount: number) => void
): Promise<{ cached: number; total: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { cached: 0, total: tracksInput?.length || 0 };
  }
  if (activeSyncPromise) return activeSyncPromise;

  activeSyncPromise = (async () => {
    try {
      const list = tracksInput || (await loadSharedOfflineTracks()).tracks;
      const cachedIds = await getCachedSharedOfflineIds();
      let cachedCount = list.filter((t) => cachedIds.has(t.id)).length;
      const total = list.length;
      onProgress?.(cachedCount, total);

      let sessionBytes = 0;
      const MAX_FILE_BYTES = 100 * 1024 * 1024;
      const MAX_SESSION_BYTES = 400 * 1024 * 1024;

      for (const track of list) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) break;
        if (cachedIds.has(track.id)) {
          // Ensure previously cached tracks also have an offline inline base64 cover image
          getCachedSharedOfflineTrack(track.id)
            .then((rec) => {
              if (
                rec &&
                (!rec.thumbnail ||
                  isLegacyPlaceholderThumbnail(rec.thumbnail) ||
                  !rec.thumbnail.startsWith('data:image/'))
              ) {
                return refreshSharedOfflineThumbnailCache(track.id, track.thumbnail);
              }
            })
            .catch(() => {});
          continue;
        }
        if (track.fileSize && track.fileSize > MAX_FILE_BYTES) continue;
        if (sessionBytes > MAX_SESSION_BYTES) break;

        try {
          const resp = await fetch(`/api/shared-offline/file/${encodeURIComponent(track.id)}`, {
            signal: AbortSignal.timeout(45000),
          });
          if (!resp.ok || resp.status === 206) continue;
          const respType = resp.headers.get('content-type') || '';
          if (respType.includes('text/html') || respType.includes('application/json')) continue;
          const blob = await resp.blob();
          if (!blob || blob.size < 32 || blob.type.includes('text/html')) continue;
          sessionBytes += blob.size;
          await saveSharedOfflineBlob(
            {
              id: track.id,
              title: track.title,
              artist: track.artist,
              album: track.album,
              duration: track.duration,
              durationSeconds: track.durationSeconds,
              thumbnail: track.thumbnail || buildSharedCoverUrl(track.id),
              fileName: track.fileName || `${track.title}.${track.fileExt || 'mp3'}`,
              fileType: blob.type || respType || undefined,
              fileSize: track.fileSize || blob.size,
              uploadedBy: track.uploadedBy,
              uploadedAt: track.uploadedAt,
            },
            blob
          );
          cachedIds.add(track.id);
          cachedCount++;
          onProgress?.(cachedCount, total);
        } catch {}
      }

      return { cached: cachedCount, total };
    } finally {
      activeSyncPromise = null;
    }
  })();

  return activeSyncPromise;
}

export function getSharedOfflineDownloadUrl(trackId: string): string {
  return `/api/shared-offline/file/${encodeURIComponent(trackId)}?download=1`;
}

export function buildSharedDownloadFilename(track: Track, headerFilename?: string | null): string {
  if (headerFilename) {
    try {
      const decoded = decodeURIComponent(headerFilename).trim();
      if (decoded) return decoded;
    } catch {}
  }
  const rawExt =
    track.fileExt ||
    track.fileName?.split('.').pop() ||
    'mp3';
  const ext = rawExt.replace(/^\./, '').toLowerCase() || 'mp3';
  const baseRaw =
    track.artist && track.artist !== '共有アップロード'
      ? `${track.artist} - ${track.title}`
      : track.title || 'shared_audio';
  const cleanBase =
    baseRaw
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'shared_audio';
  return cleanBase.toLowerCase().endsWith(`.${ext}`) ? cleanBase : `${cleanBase}.${ext}`;
}

/**
 * Download a Shared Offline track directly as an audio file to the user's device.
 * Uses local IndexedDB cache when available (works offline), or fetches from the server and caches it.
 */
export async function downloadSharedOfflineTrack(
  track: Track
): Promise<{ filename: string; fromCache: boolean }> {
  const cached = await getCachedSharedOfflineTrack(track.id);
  if (cached?.blob && cached.blob.size > 0) {
    const filename = buildSharedDownloadFilename({
      ...track,
      fileName: track.fileName || cached.fileName,
    });
    recordDownloadHistory({
      title: track.title,
      artist: track.artist,
      album: track.album || '共有オフライン',
      filename,
      formatExt: (track.fileExt || filename.split('.').pop() || 'mp3').replace(/^\./, '').toLowerCase(),
      mimeType: cached.blob.type || undefined,
      fileSize: track.fileSize || cached.blob.size,
      thumbnail: track.thumbnail,
      sourceLabel: '共有オフライン (キャッシュ)',
      target: 'device',
      sharedTrackId: track.id,
      duration: track.duration,
      durationSeconds: track.durationSeconds,
    });
    if (isIosStandalonePwa()) {
      const shared = await shareBlobFile(cached.blob, filename);
      if (shared) return { filename, fromCache: true };
    }
    triggerBlobDownload(cached.blob, filename);
    return { filename, fromCache: true };
  }

  const resp = await fetch(getSharedOfflineDownloadUrl(track.id));
  if (!resp.ok) {
    throw new Error(await extractErrorMessage(resp, '音声ファイルのダウンロードに失敗しました'));
  }

  const headerName = resp.headers.get('X-Shared-Offline-Filename');
  const filename = buildSharedDownloadFilename(track, headerName);
  const blob = await resp.blob();
  if (!blob || blob.size < 32) {
    throw new Error('取得した音声ファイルが空でした');
  }

  // Also cache in IndexedDB so it stays playable offline
  saveSharedOfflineBlob(
    {
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      durationSeconds: track.durationSeconds,
      thumbnail: track.thumbnail,
      fileName: filename,
      fileType: blob.type || resp.headers.get('Content-Type') || 'audio/mpeg',
      fileSize: track.fileSize || blob.size,
      uploadedBy: track.uploadedBy,
      uploadedAt: track.uploadedAt,
    },
    blob
  ).catch(() => {});

  recordDownloadHistory({
    title: track.title,
    artist: track.artist,
    album: track.album || '共有オフライン',
    filename,
    formatExt: (track.fileExt || filename.split('.').pop() || 'mp3').replace(/^\./, '').toLowerCase(),
    mimeType: blob.type || undefined,
    fileSize: track.fileSize || blob.size,
    thumbnail: track.thumbnail,
    sourceLabel: '共有オフライン',
    target: 'device',
    sharedTrackId: track.id,
    duration: track.duration,
    durationSeconds: track.durationSeconds,
  });

  if (isIosStandalonePwa()) {
    const shared = await shareBlobFile(blob, filename);
    if (shared) return { filename, fromCache: false };
  }
  triggerBlobDownload(blob, filename);
  return { filename, fromCache: false };
}

/**
 * Copy a Shared Offline track into the user's own My Offline library as well
 */
export async function copySharedTrackToMyOffline(track: Track): Promise<Track> {
  const cached = await getCachedSharedOfflineTrack(track.id);
  let blob = cached?.blob;
  if (!blob) {
    const resp = await fetch(`/api/shared-offline/file/${encodeURIComponent(track.id)}`);
    if (!resp.ok) throw new Error('音源の取得に失敗しました');
    blob = await resp.blob();
  }
  const fileExt = (
    track.fileExt ||
    cached?.fileName?.split('.').pop() ||
    track.fileName?.split('.').pop() ||
    'mp3'
  )
    .replace(/^\./, '')
    .toLowerCase();

  const saved = await saveOfflineTrack(
    blob,
    track.title,
    track.artist,
    '共有オフラインから保存',
    track.durationSeconds || 180,
    track.duration || '3:00',
    track.thumbnail,
    fileExt
  );

  recordDownloadHistory({
    title: track.title,
    artist: track.artist,
    album: '共有オフラインから保存',
    filename: buildSharedDownloadFilename(track),
    formatExt: fileExt,
    mimeType: blob.type || undefined,
    fileSize: track.fileSize || blob.size,
    thumbnail: track.thumbnail,
    sourceLabel: '共有オフライン → マイ・オフライン',
    target: 'offline',
    offlineTrackId: saved.id,
    sharedTrackId: track.id,
    duration: track.duration || '3:00',
    durationSeconds: track.durationSeconds || 180,
  });

  return saved;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType || 'audio/mpeg' });
}

/**
 * Collect Shared Offline tracks (metadata + inline cover + base64 audio from IndexedDB or server)
 * for user JSON backup export.
 */
export async function exportAllSharedOfflineForBackup(): Promise<{
  tracks: BackupSharedOfflineTrack[];
  omittedForSizeCount: number;
}> {
  const cachedIds = await getCachedSharedOfflineIds();
  const trackMap = new Map<string, Track>();

  const cachedList = await getAllCachedSharedTracks();
  for (const t of cachedList) {
    trackMap.set(t.id, t);
  }

  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const serverLoaded = await loadSharedOfflineTracks();
      for (const t of serverLoaded.tracks) {
        if (!trackMap.has(t.id)) {
          trackMap.set(t.id, t);
        }
      }
    } catch {}
  }

  const ordered = Array.from(trackMap.values()).sort((a, b) => {
    const ta = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
    const tb = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
    return tb - ta;
  });

  const MAX_SINGLE_AUDIO_RAW_BYTES = 35 * 1024 * 1024; // 35 MiB
  const MAX_TOTAL_AUDIO_RAW_BYTES = 85 * 1024 * 1024; // 85 MiB -> ~113 MiB JSON base64
  let accumulatedAudioBytes = 0;
  let omittedForSizeCount = 0;
  const exported: BackupSharedOfflineTrack[] = [];

  for (const track of ordered) {
    let audioBlob: Blob | null = null;
    let inlineThumb: string | undefined = track.thumbnail;

    if (cachedIds.has(track.id)) {
      const rec = await getCachedSharedOfflineTrack(track.id);
      if (rec?.blob && rec.blob.size > 0) {
        audioBlob = rec.blob;
      }
      if (rec?.thumbnail && !isLegacyPlaceholderThumbnail(rec.thumbnail)) {
        inlineThumb = rec.thumbnail;
      }
    } else if (
      (typeof navigator === 'undefined' || navigator.onLine) &&
      (!track.fileSize || track.fileSize <= MAX_SINGLE_AUDIO_RAW_BYTES) &&
      accumulatedAudioBytes < MAX_TOTAL_AUDIO_RAW_BYTES
    ) {
      try {
        const resp = await fetch(`/api/shared-offline/file/${encodeURIComponent(track.id)}`, {
          signal: AbortSignal.timeout(25000),
        });
        if (resp.ok && resp.status !== 206) {
          const b = await resp.blob();
          if (b && b.size >= 32 && !b.type.includes('text/html')) {
            audioBlob = b;
          }
        }
      } catch {}
    }

    if (
      inlineThumb &&
      !inlineThumb.startsWith('data:image/') &&
      (typeof navigator === 'undefined' || navigator.onLine)
    ) {
      try {
        const converted = await toBase64Image(inlineThumb);
        if (converted && converted.startsWith('data:image/')) {
          inlineThumb = converted;
        }
      } catch {}
    }

    let audioBase64: string | undefined;
    if (audioBlob) {
      if (
        audioBlob.size <= MAX_SINGLE_AUDIO_RAW_BYTES &&
        accumulatedAudioBytes + audioBlob.size <= MAX_TOTAL_AUDIO_RAW_BYTES
      ) {
        try {
          audioBase64 = await blobToBase64(audioBlob);
          accumulatedAudioBytes += audioBlob.size;
        } catch {}
      } else {
        omittedForSizeCount++;
      }
    }

    exported.push({
      id: track.id,
      title: track.title,
      artist: track.artist,
      album: track.album || '共有オフライン',
      duration: track.duration || '3:00',
      durationSeconds: track.durationSeconds || 180,
      fileName: track.fileName || `${track.title}.${track.fileExt || 'mp3'}`,
      fileExt: (track.fileExt || 'mp3').replace(/^\./, '').toLowerCase(),
      mimeType: track.audioMimeType || audioBlob?.type || 'audio/mpeg',
      fileSize: track.fileSize || audioBlob?.size || 0,
      uploadedBy: track.uploadedBy || 'ゲスト',
      uploadedAt: track.uploadedAt,
      thumbnailDataUrl:
        inlineThumb && !isLegacyPlaceholderThumbnail(inlineThumb) ? inlineThumb : undefined,
      audioBase64,
    });
  }

  return { tracks: exported, omittedForSizeCount };
}

/**
 * Push any locally cached Shared Offline tracks missing on the server back to the server
 * (unless the track ID was explicitly deleted by an admin).
 */
export async function restoreLocalCachedSharedToServer(): Promise<{
  checked: number;
  restoredCount: number;
}> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { checked: 0, restoredCount: 0 };
  }
  const cachedList = await getAllCachedSharedTracks();
  if (cachedList.length === 0) return { checked: 0, restoredCount: 0 };

  let serverIds = new Set<string>();
  let deletedIds = new Set<string>();
  try {
    const resp = await fetch('/api/shared-offline', { signal: AbortSignal.timeout(6000) });
    if (!resp.ok) return { checked: cachedList.length, restoredCount: 0 };
    const data = await resp.json();
    const items: ServerSharedOfflineItem[] = Array.isArray(data?.tracks) ? data.tracks : [];
    serverIds = new Set(items.map((x) => x.id));
    if (Array.isArray(data?.deletedIds)) {
      deletedIds = new Set(data.deletedIds);
    }
  } catch {
    return { checked: cachedList.length, restoredCount: 0 };
  }

  let restoredCount = 0;
  for (const track of cachedList) {
    if (!/^shared_[a-zA-Z0-9_-]{3,80}$/.test(track.id)) continue;
    if (serverIds.has(track.id) || deletedIds.has(track.id)) continue;
    const rec = await getCachedSharedOfflineTrack(track.id);
    if (!rec?.blob || rec.blob.size < 32) continue;
    try {
      await uploadSharedOfflineFile(rec.blob, {
        preserveId: rec.id,
        uploadedAt: rec.uploadedAt,
        filename: rec.fileName || `${rec.title}.mp3`,
        title: rec.title,
        artist: rec.artist,
        album: rec.album || '共有オフライン',
        thumbnail: !isLegacyPlaceholderThumbnail(rec.thumbnail) ? rec.thumbnail : undefined,
        uploadedBy: rec.uploadedBy || 'ゲスト',
        durationSeconds: rec.durationSeconds,
        duration: rec.duration,
      });
      restoredCount++;
    } catch {}
  }

  if (restoredCount > 0) {
    notifySharedOfflineChanged();
  }
  return { checked: cachedList.length, restoredCount };
}

/**
 * Restore Shared Offline tracks from a user JSON backup into IndexedDB and, when online,
 * re-upload any missing tracks back to the server with their original IDs.
 */
export async function restoreSharedOfflineFromBackup(
  tracks: BackupSharedOfflineTrack[],
  options?: { uploadToServer?: boolean }
): Promise<{ restoredLocalCount: number; restoredServerCount: number }> {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return { restoredLocalCount: 0, restoredServerCount: 0 };
  }

  let restoredLocalCount = 0;
  let restoredServerCount = 0;

  let serverIds = new Set<string>();
  const canUploadOnline =
    options?.uploadToServer !== false &&
    (typeof navigator === 'undefined' || navigator.onLine);

  if (canUploadOnline) {
    try {
      const resp = await fetch('/api/shared-offline', { signal: AbortSignal.timeout(6000) });
      if (resp.ok) {
        const data = await resp.json();
        const items: ServerSharedOfflineItem[] = Array.isArray(data?.tracks) ? data.tracks : [];
        serverIds = new Set(items.map((x) => x.id));
      }
    } catch {}
  }

  const existingCatalog =
    (await getOfflineMeta<ServerSharedOfflineItem[]>(SHARED_CATALOG_META_KEY)) || [];
  const catalogById = new Map<string, ServerSharedOfflineItem>();
  for (const item of existingCatalog) {
    if (item?.id) catalogById.set(item.id, item);
  }

  for (const item of tracks) {
    if (!item?.id || !item?.title) continue;
    const ext = (item.fileExt || item.fileName?.split('.').pop() || 'mp3')
      .replace(/^\./, '')
      .toLowerCase();
    const fileName = item.fileName || `${item.title}.${ext}`;

    let decodedBlob: Blob | null = null;
    if (item.audioBase64) {
      try {
        decodedBlob = base64ToBlob(item.audioBase64, item.mimeType || 'audio/mpeg');
      } catch {
        decodedBlob = null;
      }
    } else {
      const cached = await getCachedSharedOfflineTrack(item.id);
      if (cached?.blob && cached.blob.size >= 32) {
        decodedBlob = cached.blob;
      }
    }

    if (decodedBlob && decodedBlob.size >= 32) {
      try {
        await saveSharedOfflineBlob(
          {
            id: item.id,
            title: item.title,
            artist: item.artist,
            album: item.album || '共有オフライン',
            duration: item.duration || '3:00',
            durationSeconds: item.durationSeconds || 180,
            thumbnail: item.thumbnailDataUrl || buildSharedCoverUrl(item.id),
            fileName,
            fileType: item.mimeType || decodedBlob.type,
            fileSize: item.fileSize || decodedBlob.size,
            uploadedBy: item.uploadedBy || 'ゲスト',
            uploadedAt: item.uploadedAt || new Date().toISOString(),
          },
          decodedBlob
        );
        restoredLocalCount++;
      } catch {}
    }

    const catalogItem: ServerSharedOfflineItem = {
      id: item.id,
      title: item.title,
      artist: item.artist,
      album: item.album || '共有オフライン',
      duration: item.duration || '3:00',
      durationSeconds: item.durationSeconds || 180,
      thumbnail: item.thumbnailDataUrl || buildSharedCoverUrl(item.id),
      fileName,
      fileExt: `.${ext}`,
      mimeType: item.mimeType || decodedBlob?.type || 'audio/mpeg',
      fileSize: item.fileSize || decodedBlob?.size || 0,
      uploadedBy: item.uploadedBy || 'ゲスト',
      uploadedAt: item.uploadedAt || new Date().toISOString(),
      plays: 0,
    };
    if (!catalogById.has(item.id)) {
      catalogById.set(item.id, catalogItem);
    }

    if (
      canUploadOnline &&
      decodedBlob &&
      decodedBlob.size >= 32 &&
      !serverIds.has(item.id) &&
      /^shared_[a-zA-Z0-9_-]{3,80}$/.test(item.id)
    ) {
      try {
        await uploadSharedOfflineFile(decodedBlob, {
          preserveId: item.id,
          uploadedAt: item.uploadedAt,
          filename: fileName,
          title: item.title,
          artist: item.artist,
          album: item.album || '共有オフライン',
          thumbnail: item.thumbnailDataUrl,
          uploadedBy: item.uploadedBy || 'ゲスト',
          durationSeconds: item.durationSeconds,
          duration: item.duration,
        });
        serverIds.add(item.id);
        restoredServerCount++;
      } catch {}
    }
  }

  const mergedCatalog = Array.from(catalogById.values()).sort(
    (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
  );
  await saveOfflineMeta(SHARED_CATALOG_META_KEY, mergedCatalog).catch(() => {});
  notifySharedOfflineChanged();

  return { restoredLocalCount, restoredServerCount };
}
