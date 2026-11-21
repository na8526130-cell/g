import { Track } from '../types/music';
import {
  getActiveOfflineBlobUrl,
  getAllCachedSharedTracks,
  getCachedSharedOfflineIds,
  getCachedSharedOfflineTrack,
  getOfflineMeta,
  getStoredOfflineTrackRecord,
  notifySharedOfflineChanged,
  saveOfflineMeta,
  saveOfflineTrack,
  saveSharedOfflineBlob,
} from './offlineStorage';

export interface ServerSharedOfflineItem {
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

const SHARED_CATALOG_META_KEY = 'shared_offline_catalog_v1';
const DEFAULT_SHARED_THUMB =
  'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&h=400&fit=crop';

const CHUNK_THRESHOLD_BYTES = 3 * 1024 * 1024; // 3MB
const CHUNK_SIZE_BYTES = 2 * 1024 * 1024; // 2MB per chunk (always well below Cloud Run 32MB limit)
const MAX_UPLOAD_BYTES = 150 * 1024 * 1024; // 150MB max

let activeSyncPromise: Promise<{ cached: number; total: number }> | null = null;

function mapServerItemToTrack(item: ServerSharedOfflineItem, cachedIds: Set<string>): Track {
  const isCached = cachedIds.has(item.id);
  const activeBlobUrl = getActiveOfflineBlobUrl(item.id);
  return {
    id: item.id,
    title: item.title,
    artist: item.artist,
    album: item.album || '共有オフライン',
    duration: item.duration || '3:00',
    durationSeconds: item.durationSeconds || 180,
    thumbnail: DEFAULT_SHARED_THUMB,
    isLocal: true,
    isSharedOffline: true,
    isCachedOffline: isCached,
    uploadedBy: item.uploadedBy || 'ゲスト',
    uploadedAt: item.uploadedAt,
    fileSize: item.fileSize,
    audioUrl: activeBlobUrl || `/api/shared-offline/file/${encodeURIComponent(item.id)}`,
  };
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

  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      const res = await fetch('/api/shared-offline', {
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        const data = await res.json();
        const items: ServerSharedOfflineItem[] = Array.isArray(data?.tracks) ? data.tracks : [];
        await saveOfflineMeta(SHARED_CATALOG_META_KEY, items).catch(() => {});
        return {
          tracks: items.map((item) => mapServerItemToTrack(item, cachedIds)),
          fromOfflineCache: false,
        };
      }
    } catch {}
  }

  // Offline / fallback path: reconstruct from IndexedDB cached blobs & catalog metadata
  const [cachedCatalog, cachedBlobTracks] = await Promise.all([
    getOfflineMeta<ServerSharedOfflineItem[]>(SHARED_CATALOG_META_KEY),
    getAllCachedSharedTracks(),
  ]);

  const byId = new Map<string, Track>();
  for (const t of cachedBlobTracks) {
    byId.set(t.id, t);
  }
  if (Array.isArray(cachedCatalog)) {
    for (const item of cachedCatalog) {
      if (!byId.has(item.id)) {
        byId.set(item.id, mapServerItemToTrack(item, cachedIds));
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

/**
 * Upload an audio/video file to Shared Offline so anyone can access & cache it for offline playback.
 * Automatically uses 2MB chunked upload for files > 3MB (bypassing proxy 32MB limits).
 * Also caches the file locally in IndexedDB when available.
 */
export async function uploadSharedOfflineFile(
  file: File | Blob,
  options?: {
    filename?: string;
    title?: string;
    artist?: string;
    album?: string;
    uploadedBy?: string;
    durationSeconds?: number;
    duration?: string;
    onProgress?: (percent: number) => void;
  }
): Promise<Track> {
  if (!file || file.size < 32) {
    throw new Error('音声ファイルが空、または小さすぎます');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('ファイルサイズが上限（150MB）を超えています');
  }

  const filename =
    options?.filename || (file instanceof File ? file.name : `shared_track_${Date.now()}.mp3`);
  const mimeType = file.type || 'audio/mpeg';
  // Snapshot standalone Blob immediately so clearing <input type="file"> cannot invalidate File handles
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

  let durationSeconds = options?.durationSeconds || 0;
  if (durationSeconds <= 0) {
    durationSeconds = await readAudioDuration(standaloneBlob);
  }
  const duration =
    options?.duration || (durationSeconds > 0 ? formatDurationLabel(durationSeconds) : '');

  options?.onProgress?.(5);

  let serverTrack: ServerSharedOfflineItem;

  if (standaloneBlob.size <= CHUNK_THRESHOLD_BYTES) {
    // Fast single-request upload for files <= 3MB
    const qs = new URLSearchParams({
      filename,
      title: finalTitle,
      artist: finalArtist,
      album: finalAlbum,
      uploadedBy: finalUploadedBy,
      mime: mimeType,
    });
    if (durationSeconds > 0) qs.set('durationSeconds', String(durationSeconds));
    if (duration) qs.set('duration', duration);

    const buf = await standaloneBlob.arrayBuffer();
    const resp = await fetch(`/api/shared-offline/upload?${qs.toString()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      body: buf,
    });

    if (!resp.ok) {
      throw new Error(await extractErrorMessage(resp, 'アップロードに失敗しました'));
    }

    const data = await resp.json();
    if (!data?.track) {
      throw new Error('サーバーからの応答が不正です');
    }
    serverTrack = data.track;
    options?.onProgress?.(90);
  } else {
    // Chunked upload (2MB chunks) — works reliably for any large WAV/FLAC/MP4 up to 150MB on Cloud Run
    const uploadId = `up_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const totalChunks = Math.ceil(standaloneBlob.size / CHUNK_SIZE_BYTES);

    for (let idx = 0; idx < totalChunks; idx++) {
      const start = idx * CHUNK_SIZE_BYTES;
      const end = Math.min(standaloneBlob.size, start + CHUNK_SIZE_BYTES);
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
      });

      if (!chunkResp.ok) {
        throw new Error(
          await extractErrorMessage(
            chunkResp,
            `分割アップロード (${idx + 1}/${totalChunks}) に失敗しました`
          )
        );
      }

      const pct = Math.min(88, Math.round(((idx + 1) / totalChunks) * 82) + 6);
      options?.onProgress?.(pct);
    }

    const completeResp = await fetch('/api/shared-offline/upload-complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uploadId,
        totalChunks,
        filename,
        mimeType,
        title: finalTitle,
        artist: finalArtist,
        album: finalAlbum,
        uploadedBy: finalUploadedBy,
        durationSeconds,
        duration,
      }),
    });

    if (!completeResp.ok) {
      throw new Error(await extractErrorMessage(completeResp, 'アップロード結合に失敗しました'));
    }

    const completeData = await completeResp.json();
    if (!completeData?.track) {
      throw new Error('サーバーからの応答が不正です');
    }
    serverTrack = completeData.track;
    options?.onProgress?.(92);
  }

  // Cache locally in IndexedDB for instant offline playback (non-fatal if local storage quota fails)
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
        thumbnail: DEFAULT_SHARED_THUMB,
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

  options?.onProgress?.(100);
  notifySharedOfflineChanged();

  return {
    id: serverTrack.id,
    title: serverTrack.title,
    artist: serverTrack.artist,
    album: serverTrack.album,
    duration: serverTrack.duration,
    durationSeconds: serverTrack.durationSeconds,
    thumbnail: DEFAULT_SHARED_THUMB,
    isLocal: true,
    isSharedOffline: true,
    isCachedOffline,
    uploadedBy: serverTrack.uploadedBy,
    uploadedAt: serverTrack.uploadedAt,
    fileSize: serverTrack.fileSize,
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
    uploadedBy: uploadedBy || 'ゲスト',
    durationSeconds: record.durationSeconds,
    duration: record.duration,
  });
}

/**
 * Automatically cache all (or uncached) Shared Offline tracks into IndexedDB while online
 * so everyone can listen to uploaded tracks even when offline.
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
        if (cachedIds.has(track.id)) continue;
        if (track.fileSize && track.fileSize > MAX_FILE_BYTES) continue;
        if (sessionBytes > MAX_SESSION_BYTES) break;

        try {
          const resp = await fetch(`/api/shared-offline/file/${encodeURIComponent(track.id)}`, {
            signal: AbortSignal.timeout(45000),
          });
          if (!resp.ok) continue;
          const blob = await resp.blob();
          sessionBytes += blob.size;
          await saveSharedOfflineBlob(
            {
              id: track.id,
              title: track.title,
              artist: track.artist,
              album: track.album,
              duration: track.duration,
              durationSeconds: track.durationSeconds,
              thumbnail: track.thumbnail,
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
  return saveOfflineTrack(
    blob,
    track.title,
    track.artist,
    '共有オフラインから保存',
    track.durationSeconds || 180,
    track.duration || '3:00',
    track.thumbnail
  );
}
