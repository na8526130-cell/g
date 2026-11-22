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
  plays: number;
}

export const SHARED_RETENTION_OPTIONS: ReadonlyArray<number | null> = [
  30,
  60,
  24 * 60,
  3 * 24 * 60,
  7 * 24 * 60,
  null,
];
export const SHARED_RETENTION_LABELS: ReadonlyArray<string> = [
  '30分',
  '1時間',
  '24時間',
  '3日',
  '1週間',
  '無期限',
];

const SHARED_CATALOG_META_KEY = 'shared_offline_catalog_v1';
const DEFAULT_SHARED_THUMB =
  'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&h=400&fit=crop';

const CHUNK_THRESHOLD_BYTES = 1024 * 1024; // 1 MiB
const CHUNK_SIZE_BYTES = 1024 * 1024; // 1 MiB per chunk
const MAX_UPLOAD_BYTES = 150 * 1024 * 1024; // 150 MiB max

let activeSyncPromise: Promise<{ cached: number; total: number }> | null = null;

function mapServerItemToTrack(item: ServerSharedOfflineItem, cachedIds: Set<string>): Track {
  const isCached = cachedIds.has(item.id);
  const activeBlobUrl = getActiveOfflineBlobUrl(item.id);
  return {
    id: item.id,
    shareToken: item.shareToken,
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
    expiresAt: item.expiresAt ?? null,
    allowExtension: Boolean(item.allowExtension),
    audioUrl: activeBlobUrl || `/api/shared-offline/file/${encodeURIComponent(item.id)}`,
  };
}

export function buildSharedOfflineUrl(track: Pick<Track, 'id' | 'shareToken'>): string {
  const token = track.shareToken || track.id;
  if (typeof window === 'undefined') {
    return `/?shared_file=${encodeURIComponent(token)}`;
  }
  return `${window.location.origin}/?shared_file=${encodeURIComponent(token)}`;
}

export function getSharedOfflineDownloadUrl(track: Pick<Track, 'id' | 'shareToken'>): string {
  return `/api/shared-offline/file/${encodeURIComponent(track.id)}?download=1`;
}

export function formatFileSizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatRemainingExpiry(expiresAt?: string | null): string {
  if (!expiresAt) return '無期限';
  const expMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expMs)) return '無期限';
  const diffMs = expMs - Date.now();
  if (diffMs <= 0) return '期限切れ';
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `残り ${Math.max(1, diffMins)}分`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `残り ${diffHours}時間`;
  const diffDays = Math.floor(diffHours / 24);
  return `残り ${diffDays}日`;
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

  const now = Date.now();
  const byId = new Map<string, Track>();
  for (const t of cachedBlobTracks) {
    byId.set(t.id, t);
  }
  if (Array.isArray(cachedCatalog)) {
    for (const item of cachedCatalog) {
      if (item.expiresAt && new Date(item.expiresAt).getTime() <= now) continue;
      if (!byId.has(item.id)) {
        byId.set(item.id, mapServerItemToTrack(item, cachedIds));
      } else {
        const existing = byId.get(item.id)!;
        byId.set(item.id, {
          ...existing,
          shareToken: item.shareToken,
          expiresAt: item.expiresAt ?? null,
          allowExtension: Boolean(item.allowExtension),
        });
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
 * Fetch metadata for a single shared file by token or id (used when opening ?shared_file=...).
 */
export async function fetchSharedOfflineItem(tokenOrId: string): Promise<Track> {
  const cachedIds = await getCachedSharedOfflineIds();
  const resp = await fetch(`/api/shared-offline/item/${encodeURIComponent(tokenOrId)}`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) {
    throw new Error(await extractErrorMessage(resp, '共有ファイルの読み込みに失敗しました'));
  }
  const data = await resp.json();
  if (!data?.track) {
    throw new Error('共有ファイル情報が見つかりません');
  }
  return mapServerItemToTrack(data.track, cachedIds);
}

/**
 * Extend the expiration of a shared file by +7 days (if allowExtension is enabled).
 */
export async function extendSharedOfflineTrack(tokenOrId: string): Promise<Track> {
  const cachedIds = await getCachedSharedOfflineIds();
  const resp = await fetch(`/api/shared-offline/${encodeURIComponent(tokenOrId)}/extend`, {
    method: 'POST',
  });
  if (!resp.ok) {
    throw new Error(await extractErrorMessage(resp, '有効期限の延長に失敗しました'));
  }
  const data = await resp.json();
  if (!data?.track) {
    throw new Error('サーバーからの応答が不正です');
  }
  const updated = mapServerItemToTrack(data.track, cachedIds);
  try {
    const existingCatalog =
      (await getOfflineMeta<ServerSharedOfflineItem[]>(SHARED_CATALOG_META_KEY)) || [];
    await saveOfflineMeta(
      SHARED_CATALOG_META_KEY,
      existingCatalog.map((item) => (item.id === data.track.id ? data.track : item))
    );
  } catch {}
  notifySharedOfflineChanged();
  return updated;
}

/**
 * Upload an audio/video file to Shared Offline so anyone can access, download & cache it for offline playback.
 * Uses 1 MiB chunked upload (begin -> chunk -> complete, with abort cleanup) for files > 1 MiB.
 * Server stores file data with fixed-key XOR obfuscation and automatic retention expiry.
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
    retentionMinutes?: number | null;
    allowExtension?: boolean;
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
  const retentionMinutes = options?.retentionMinutes ?? null;
  const allowExtension = Boolean(options?.allowExtension);

  options?.onProgress?.(2, '準備中…');

  let durationSeconds = options?.durationSeconds || 0;
  if (durationSeconds <= 0) {
    durationSeconds = await readAudioDuration(standaloneBlob);
  }
  const duration =
    options?.duration || (durationSeconds > 0 ? formatDurationLabel(durationSeconds) : '');

  let serverTrack: ServerSharedOfflineItem;

  if (standaloneBlob.size <= CHUNK_THRESHOLD_BYTES) {
    // Fast single-request upload for files <= 1 MiB
    const qs = new URLSearchParams({
      filename,
      title: finalTitle,
      artist: finalArtist,
      album: finalAlbum,
      uploadedBy: finalUploadedBy,
      mime: mimeType,
      allowExtension: String(allowExtension),
    });
    if (retentionMinutes !== null && retentionMinutes > 0) {
      qs.set('retentionMinutes', String(retentionMinutes));
    }
    if (durationSeconds > 0) qs.set('durationSeconds', String(durationSeconds));
    if (duration) qs.set('duration', duration);

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
    options?.onProgress?.(94, '仕上げ処理中…');
  } else {
    // Chunked upload lifecycle (begin -> 1 MiB chunks -> complete, abort on error/cancel)
    let uploadId: string | null = null;
    try {
      const beginResp = await fetch('/api/shared-offline/upload-begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          mimeType,
          fileSize: standaloneBlob.size,
          retentionMinutes,
          allowExtension,
          title: finalTitle,
          artist: finalArtist,
          album: finalAlbum,
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
          totalChunks,
          filename,
          mimeType,
          retentionMinutes,
          allowExtension,
          title: finalTitle,
          artist: finalArtist,
          album: finalAlbum,
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

  // Cache locally in IndexedDB for instant offline playback
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

  options?.onProgress?.(100, '完了');
  notifySharedOfflineChanged();

  return {
    id: serverTrack.id,
    shareToken: serverTrack.shareToken,
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
    expiresAt: serverTrack.expiresAt ?? null,
    allowExtension: Boolean(serverTrack.allowExtension),
    audioUrl: blobUrl,
  };
}

/**
 * Publish an already saved local/offline track directly to Shared Offline
 */
export async function publishOfflineTrackToShared(
  track: Track,
  uploadedBy?: string,
  options?: { retentionMinutes?: number | null; allowExtension?: boolean }
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
    retentionMinutes: options?.retentionMinutes ?? 24 * 60,
    allowExtension: options?.allowExtension ?? true,
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
