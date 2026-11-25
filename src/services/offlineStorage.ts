import { AudioQualityMode, Track } from '../types/music';
import { toBase64Image } from '../utils/imageBase64';

const DB_NAME = 'ZeroMusicOfflineDB';
const DB_VERSION = 3;
const STORE_TRACKS = 'offline_tracks';
const STORE_META = 'cached_meta';
const STORE_SHARED = 'shared_offline_tracks';
const STORE_CACHED_YT = 'cached_yt_audio';

export const OFFLINE_TRACKS_CHANGED_EVENT = 'zero-offline-tracks-changed';
export const SHARED_OFFLINE_CHANGED_EVENT = 'zero-shared-offline-changed';
export const CACHED_YT_CHANGED_EVENT = 'zero-cached-yt-changed';

export interface StoredCachedYtAudio {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  album: string;
  albumId?: string;
  duration: string;
  durationSeconds: number;
  thumbnail: string;
  blob: Blob;
  fileType: string;
  fileSize: number;
  quality: AudioQualityMode;
  cachedAt: number;
}

export interface StoredOfflineTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  durationSeconds: number;
  thumbnail: string;
  blob: Blob;
  fileName?: string;
  fileType: string;
  addedAt: number;
}

export interface StoredSharedOfflineTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: string;
  durationSeconds: number;
  thumbnail: string;
  blob: Blob;
  fileName?: string;
  fileType: string;
  fileSize: number;
  uploadedBy: string;
  uploadedAt: string;
  cachedAt: number;
}

export const DEFAULT_OFFLINE_ICON_THUMB = '/pwa-512x512.png';

const LEGACY_PLACEHOLDER_THUMB_RE =
  /https:\/\/images\.unsplash\.com\/(?:photo-1470225620780-dba8ba36b745|photo-1511671782779-c97d3d27a1d4)/i;

export function isLegacyPlaceholderThumbnail(url?: string): boolean {
  if (!url) return true;
  const trimmed = url.trim();
  if (!trimmed) return true;
  return LEGACY_PLACEHOLDER_THUMB_RE.test(trimmed);
}

// Active blob URLs, Blob references, and in-memory offline thumbnail data URLs
const activeBlobUrls = new Map<string, string>();
const activeBlobs = new Map<string, Blob>();
const activeSharedThumbs = new Map<string, string>();

let dbPromise: Promise<IDBDatabase> | null = null;

function notifyOfflineTracksChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OFFLINE_TRACKS_CHANGED_EVENT));
  }
}

export function notifySharedOfflineChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SHARED_OFFLINE_CHANGED_EVENT));
  }
}

export function notifyCachedYtChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CACHED_YT_CHANGED_EVENT));
  }
}

export function getActiveOfflineBlobUrl(id: string): string | undefined {
  return activeBlobUrls.get(id);
}

export function getActiveOfflineBlob(id: string): Blob | undefined {
  return activeBlobs.get(id);
}

export function getActiveSharedThumb(id: string): string | undefined {
  return activeSharedThumbs.get(id);
}

export function buildSharedCoverUrl(id: string): string {
  return `/api/shared-offline/cover/${encodeURIComponent(id)}`;
}

const AUDIO_EXT_MIME_MAP: Record<string, string> = {
  mp3: 'audio/mpeg',
  mpga: 'audio/mpeg',
  mpeg: 'audio/mpeg',
  m4a: 'audio/mp4',
  m4b: 'audio/mp4',
  m4r: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/opus',
  webm: 'audio/webm',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  aif: 'audio/aiff',
  aiff: 'audio/aiff',
  wma: 'audio/x-ms-wma',
  caf: 'audio/x-caf',
  amr: 'audio/amr',
};

export function inferAudioMimeType(fileType?: string, fileName?: string): string {
  const cleanType = (fileType || '').split(';')[0].trim().toLowerCase();
  if (
    cleanType &&
    cleanType !== 'application/octet-stream' &&
    (cleanType.startsWith('audio/') || cleanType.startsWith('video/'))
  ) {
    return cleanType;
  }
  const ext = (fileName?.split('.').pop() || '').replace(/^\./, '').toLowerCase();
  if (ext && AUDIO_EXT_MIME_MAP[ext]) {
    return AUDIO_EXT_MIME_MAP[ext];
  }
  return 'audio/mpeg';
}

export function normalizeAudioBlob(blob: Blob, fileType?: string, fileName?: string): Blob {
  const targetMime = inferAudioMimeType(fileType || blob.type, fileName);
  if (blob instanceof File || !blob.type || blob.type === 'application/octet-stream') {
    return blob.slice(0, blob.size, targetMime);
  }
  return blob;
}

export async function recoverSharedBlobFromSwCache(id: string): Promise<Blob | null> {
  if (typeof window === 'undefined' || !('caches' in window)) return null;
  try {
    const url = `/api/shared-offline/file/${encodeURIComponent(id)}`;
    const matched = await window.caches.match(url);
    if (!matched || !matched.ok || matched.status === 206) return null;
    const headerType = matched.headers.get('content-type') || '';
    if (headerType.includes('text/html') || headerType.includes('application/json')) {
      return null;
    }
    const blob = await matched.blob();
    if (!blob || blob.size < 32 || blob.type.includes('text/html')) return null;
    return normalizeAudioBlob(blob, headerType || blob.type);
  } catch {
    return null;
  }
}

async function resolveInlineCoverDataUrl(candidateUrl?: string, fallbackApiUrl?: string): Promise<string> {
  const candidates = [candidateUrl, fallbackApiUrl].filter(
    (u): u is string => Boolean(u && u.trim() && !isLegacyPlaceholderThumbnail(u))
  );
  for (const cand of candidates) {
    if (cand.startsWith('data:image/')) {
      return cand;
    }
    if (typeof navigator === 'undefined' || navigator.onLine) {
      try {
        const b64 = await toBase64Image(cand);
        if (b64 && b64.startsWith('data:image/')) {
          return b64;
        }
      } catch {}
    }
  }
  const bestNonPlaceholder = candidates.find((c) => !c.startsWith('blob:'));
  return bestNonPlaceholder || DEFAULT_OFFLINE_ICON_THUMB;
}

export function resolveSharedTrackDisplayThumbnail(
  id: string,
  ...candidates: Array<string | undefined | null>
): string {
  const mem = activeSharedThumbs.get(id);
  if (mem && !isLegacyPlaceholderThumbnail(mem)) {
    if (mem.startsWith('data:image/') || typeof navigator === 'undefined' || navigator.onLine) {
      return mem;
    }
  }
  for (const raw of candidates) {
    const c = typeof raw === 'string' ? raw.trim() : '';
    if (!c || isLegacyPlaceholderThumbnail(c)) continue;
    if (c.startsWith('data:image/') || c.startsWith('/')) {
      return c;
    }
    if (typeof navigator === 'undefined' || navigator.onLine) {
      return c;
    }
  }
  return typeof navigator === 'undefined' || navigator.onLine
    ? buildSharedCoverUrl(id)
    : DEFAULT_OFFLINE_ICON_THUMB;
}

export function openOfflineDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      dbPromise = null;
      reject(new Error('IndexedDB not supported in this environment'));
      return;
    }

    let settled = false;
    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        dbPromise = null;
        reject(new Error('IndexedDB open timed out'));
      }
    }, 5000);

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_TRACKS)) {
        db.createObjectStore(STORE_TRACKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_SHARED)) {
        db.createObjectStore(STORE_SHARED, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_CACHED_YT)) {
        db.createObjectStore(STORE_CACHED_YT, { keyPath: 'id' });
      }
    };

    request.onblocked = () => {
      console.warn('[OfflineDB] Upgrade blocked by an open connection');
    };

    request.onsuccess = () => {
      if (settled) {
        try {
          request.result.close();
        } catch {}
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      const db = request.result;
      db.onversionchange = () => {
        try {
          db.close();
        } catch {}
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      dbPromise = null;
      reject(request.error || new Error('IndexedDB open failed'));
    };
  });

  return dbPromise;
}

/**
 * Save an audio file (File or Blob) to IndexedDB for offline playback
 */
export async function saveOfflineTrack(
  file: File | Blob,
  title: string,
  artist = 'ローカル音源',
  album = 'オフライン保存',
  durationSeconds = 180,
  durationText = '3:00',
  thumbnail?: string,
  fileExt = 'mp3'
): Promise<Track> {
  const db = await openOfflineDB();
  const id = `offline_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const extMimeMap: Record<string, string> = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    wav: 'audio/wav',
    flac: 'audio/flac',
    ogg: 'audio/ogg',
    mp4: 'video/mp4',
  };
  const fileType = file.type || extMimeMap[fileExt.toLowerCase()] || 'audio/mpeg';

  const resolvedThumb =
    thumbnail && !isLegacyPlaceholderThumbnail(thumbnail)
      ? thumbnail
      : DEFAULT_OFFLINE_ICON_THUMB;

  const stored: StoredOfflineTrack = {
    id,
    title,
    artist,
    album,
    duration: durationText,
    durationSeconds,
    thumbnail: resolvedThumb,
    blob: file,
    fileName: file instanceof File ? file.name : `${title}.${fileExt}`,
    fileType,
    addedAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_TRACKS], 'readwrite');
    const store = tx.objectStore(STORE_TRACKS);
    const req = store.put(stored);

    req.onsuccess = () => {
      const audioUrl = URL.createObjectURL(file);
      activeBlobUrls.set(id, audioUrl);
      activeBlobs.set(id, file);
      notifyOfflineTracksChanged();

      resolve({
        id: stored.id,
        title: stored.title,
        artist: stored.artist,
        album: stored.album,
        duration: stored.duration,
        durationSeconds: stored.durationSeconds,
        thumbnail: stored.thumbnail,
        fileSize: file.size,
        isLocal: true,
        audioUrl,
      });
    };

    req.onerror = () => reject(req.error);
  });
}

/**
 * Retrieve raw stored offline track (including Blob) by ID
 */
export async function getStoredOfflineTrackRecord(id: string): Promise<StoredOfflineTrack | null> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_TRACKS], 'readonly');
      const store = tx.objectStore(STORE_TRACKS);
      const req = store.get(id);
      req.onsuccess = () => resolve((req.result as StoredOfflineTrack) || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Retrieve all offline tracks stored in IndexedDB (sorted newest first)
 */
export async function getAllOfflineTracks(): Promise<Track[]> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_TRACKS], 'readonly');
      const store = tx.objectStore(STORE_TRACKS);
      const req = store.getAll();

      req.onsuccess = () => {
        const results = ((req.result as StoredOfflineTrack[]) || []).sort(
          (a, b) => (b.addedAt || 0) - (a.addedAt || 0)
        );
        const tracks: Track[] = results.map((s) => {
          let audioUrl = activeBlobUrls.get(s.id);
          if (!audioUrl) {
            try {
              audioUrl = URL.createObjectURL(s.blob);
              activeBlobUrls.set(s.id, audioUrl);
            } catch {
              audioUrl = '';
            }
          }

          return {
            id: s.id,
            title: s.title,
            artist: s.artist,
            album: s.album,
            duration: s.duration,
            durationSeconds: s.durationSeconds,
            thumbnail: s.thumbnail,
            fileSize: s.blob?.size || 0,
            isLocal: true,
            audioUrl,
          };
        });
        resolve(tracks);
      };

      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[OfflineDB] Error fetching offline tracks:', err);
    return [];
  }
}

/**
 * Save a Shared Offline track Blob to IndexedDB so it plays completely offline
 */
export async function saveSharedOfflineBlob(
  meta: {
    id: string;
    title: string;
    artist: string;
    album?: string;
    duration?: string;
    durationSeconds?: number;
    thumbnail?: string;
    fileName?: string;
    fileType?: string;
    fileSize?: number;
    uploadedBy?: string;
    uploadedAt?: string;
  },
  blob: Blob
): Promise<string> {
  const db = await openOfflineDB();
  if (!db.objectStoreNames.contains(STORE_SHARED)) {
    throw new Error('Shared offline store not initialized');
  }
  // Normalize File / missing MIME -> valid audio Blob so Safari/WebKit/Chrome always decode cleanly
  const safeBlob = normalizeAudioBlob(blob, meta.fileType, meta.fileName);

  const inlineThumbnail = await resolveInlineCoverDataUrl(
    meta.thumbnail,
    buildSharedCoverUrl(meta.id)
  ).catch(() => DEFAULT_OFFLINE_ICON_THUMB);

  const stored: StoredSharedOfflineTrack = {
    id: meta.id,
    title: meta.title,
    artist: meta.artist || '共有アップロード',
    album: meta.album || '共有オフライン',
    duration: meta.duration || '3:00',
    durationSeconds: meta.durationSeconds || 180,
    thumbnail: inlineThumbnail,
    blob: safeBlob,
    fileName: meta.fileName || `${meta.title}.mp3`,
    fileType: meta.fileType || safeBlob.type || 'audio/mpeg',
    fileSize: meta.fileSize || safeBlob.size,
    uploadedBy: meta.uploadedBy || 'ゲスト',
    uploadedAt: meta.uploadedAt || new Date().toISOString(),
    cachedAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_SHARED], 'readwrite');
    const store = tx.objectStore(STORE_SHARED);
    const req = store.put(stored);
    req.onsuccess = () => {
      if (activeBlobUrls.has(meta.id)) {
        try {
          URL.revokeObjectURL(activeBlobUrls.get(meta.id)!);
        } catch {}
      }
      const url = URL.createObjectURL(safeBlob);
      activeBlobUrls.set(meta.id, url);
      activeBlobs.set(meta.id, safeBlob);
      if (stored.thumbnail && !isLegacyPlaceholderThumbnail(stored.thumbnail)) {
        activeSharedThumbs.set(meta.id, stored.thumbnail);
      }
      notifySharedOfflineChanged();
      resolve(url);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function refreshSharedOfflineThumbnailCache(
  id: string,
  coverUrl?: string
): Promise<string | undefined> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return undefined;
  try {
    const b64 = await toBase64Image(coverUrl || buildSharedCoverUrl(id));
    if (!b64 || !b64.startsWith('data:image/')) return undefined;
    activeSharedThumbs.set(id, b64);
    const db = await openOfflineDB();
    if (!db.objectStoreNames.contains(STORE_SHARED)) return b64;
    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE_SHARED], 'readwrite');
      const store = tx.objectStore(STORE_SHARED);
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const rec = getReq.result as StoredSharedOfflineTrack | undefined;
        if (rec) {
          rec.thumbnail = b64;
          store.put(rec);
        }
        resolve();
      };
      getReq.onerror = () => resolve();
    });
    notifySharedOfflineChanged();
    return b64;
  } catch {
    return undefined;
  }
}

export async function getCachedSharedOfflineIds(): Promise<Set<string>> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_SHARED], 'readonly');
      const store = tx.objectStore(STORE_SHARED);
      const req = store.getAllKeys();
      req.onsuccess = () => {
        const keys = (req.result || []).map((k) => String(k));
        resolve(new Set(keys));
      };
      req.onerror = () => resolve(new Set());
    });
  } catch {
    return new Set();
  }
}

export async function getCachedSharedOfflineTrack(id: string): Promise<StoredSharedOfflineTrack | null> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_SHARED], 'readonly');
      const store = tx.objectStore(STORE_SHARED);
      const req = store.get(id);
      req.onsuccess = () => resolve((req.result as StoredSharedOfflineTrack) || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function getAllCachedSharedTracks(): Promise<Track[]> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_SHARED], 'readonly');
      const store = tx.objectStore(STORE_SHARED);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = ((req.result as StoredSharedOfflineTrack[]) || []).sort(
          (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
        );
        const validList = list.filter((s) => Boolean(s?.id && s?.blob && s.blob.size > 0));
        resolve(
          validList.map((s) => {
            const safeBlob = normalizeAudioBlob(s.blob, s.fileType, s.fileName);
            activeBlobs.set(s.id, safeBlob);
            let audioUrl = activeBlobUrls.get(s.id);
            if (!audioUrl) {
              try {
                audioUrl = URL.createObjectURL(safeBlob);
                activeBlobUrls.set(s.id, audioUrl);
              } catch {
                audioUrl = '';
              }
            }
            const resolvedThumb = resolveSharedTrackDisplayThumbnail(s.id, s.thumbnail);
            if (s.thumbnail && !isLegacyPlaceholderThumbnail(s.thumbnail)) {
              activeSharedThumbs.set(s.id, s.thumbnail);
            }
            return {
              id: s.id,
              title: s.title,
              artist: s.artist,
              album: s.album,
              duration: s.duration,
              durationSeconds: s.durationSeconds,
              thumbnail: resolvedThumb,
              isLocal: true,
              isSharedOffline: true,
              isCachedOffline: true,
              uploadedBy: s.uploadedBy,
              uploadedAt: s.uploadedAt,
              fileSize: s.fileSize || safeBlob.size || 0,
              fileName: s.fileName,
              fileExt: (s.fileName?.split('.').pop() || '').toLowerCase() || undefined,
              audioMimeType: safeBlob.type || s.fileType,
              audioUrl,
            };
          })
        );
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function warmSharedOfflineBlobUrls(): Promise<void> {
  try {
    const db = await openOfflineDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE_SHARED], 'readonly');
      const store = tx.objectStore(STORE_SHARED);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result as StoredSharedOfflineTrack[]) || [];
        for (const s of list) {
          if (s?.id && s?.blob && s.blob.size > 0) {
            const safeBlob = normalizeAudioBlob(s.blob, s.fileType, s.fileName);
            activeBlobs.set(s.id, safeBlob);
            if (s.thumbnail && !isLegacyPlaceholderThumbnail(s.thumbnail)) {
              activeSharedThumbs.set(s.id, s.thumbnail);
            }
            if (!activeBlobUrls.has(s.id)) {
              try {
                activeBlobUrls.set(s.id, URL.createObjectURL(safeBlob));
              } catch {}
            }
          }
        }
        resolve();
      };
      req.onerror = () => resolve();
    });
  } catch {}
}

export async function forceRefreshSharedBlobUrl(id: string): Promise<string | null> {
  try {
    const prevUrl = activeBlobUrls.get(id);
    if (prevUrl) {
      try {
        URL.revokeObjectURL(prevUrl);
      } catch {}
      activeBlobUrls.delete(id);
    }
    const cached = await getCachedSharedOfflineTrack(id);
    if (cached?.blob && cached.blob.size > 0) {
      const safeBlob = normalizeAudioBlob(cached.blob, cached.fileType, cached.fileName);
      activeBlobs.set(id, safeBlob);
      const nextUrl = URL.createObjectURL(safeBlob);
      activeBlobUrls.set(id, nextUrl);
      return nextUrl;
    }
    const swBlob = await recoverSharedBlobFromSwCache(id);
    if (swBlob && swBlob.size > 0) {
      activeBlobs.set(id, swBlob);
      const nextUrl = URL.createObjectURL(swBlob);
      activeBlobUrls.set(id, nextUrl);
      return nextUrl;
    }
  } catch {}
  return null;
}

export async function deleteCachedSharedOfflineTrack(id: string): Promise<void> {
  try {
    const db = await openOfflineDB();
    if (activeBlobUrls.has(id)) {
      try {
        URL.revokeObjectURL(activeBlobUrls.get(id)!);
      } catch {}
      activeBlobUrls.delete(id);
    }
    activeBlobs.delete(id);
    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE_SHARED], 'readwrite');
      const store = tx.objectStore(STORE_SHARED);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {}
}

export async function removeDeletedSharedOfflineCaches(id: string): Promise<void> {
  activeSharedThumbs.delete(id);
  await deleteCachedSharedOfflineTrack(id);
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const fileUrl = `/api/shared-offline/file/${encodeURIComponent(id)}`;
      const coverUrl = `/api/shared-offline/cover/${encodeURIComponent(id)}`;
      const cacheNames = await window.caches.keys();
      await Promise.all(
        cacheNames.map(async (name) => {
          try {
            const cache = await window.caches.open(name);
            await cache.delete(fileUrl);
            await cache.delete(coverUrl);
          } catch {}
        })
      );
    } catch {}
  }
  notifySharedOfflineChanged();
}

/**
 * Save a downloaded streaming/YouTube track's audio Blob into IndexedDB keyed by its original track.id
 */
export async function saveCachedTrackAudio(
  track: Track,
  blob: Blob,
  quality: AudioQualityMode = 'high'
): Promise<string> {
  const db = await openOfflineDB();
  if (!db.objectStoreNames.contains(STORE_CACHED_YT)) {
    throw new Error('Cached YT audio store not initialized');
  }
  const safeBlob =
    blob instanceof File
      ? blob.slice(0, blob.size, blob.type || track.audioMimeType || 'audio/mp4')
      : blob;

  const inlineYtThumb = await resolveInlineCoverDataUrl(track.thumbnail).catch(
    () => DEFAULT_OFFLINE_ICON_THUMB
  );

  const stored: StoredCachedYtAudio = {
    id: track.id,
    title: track.title,
    artist: track.artist || '不明なアーティスト',
    artistId: track.artistId,
    album: track.album || 'オフライン保存曲',
    albumId: track.albumId,
    duration: track.duration || '0:00',
    durationSeconds: track.durationSeconds || 0,
    thumbnail: inlineYtThumb,
    blob: safeBlob,
    fileType: safeBlob.type || track.audioMimeType || 'audio/mp4',
    fileSize: safeBlob.size,
    quality,
    cachedAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_CACHED_YT], 'readwrite');
    const store = tx.objectStore(STORE_CACHED_YT);
    const req = store.put(stored);
    req.onsuccess = () => {
      if (activeBlobUrls.has(track.id)) {
        try {
          URL.revokeObjectURL(activeBlobUrls.get(track.id)!);
        } catch {}
      }
      const url = URL.createObjectURL(safeBlob);
      activeBlobUrls.set(track.id, url);
      activeBlobs.set(track.id, safeBlob);
      notifyCachedYtChanged();
      resolve(url);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getCachedTrackAudioRecord(id: string): Promise<StoredCachedYtAudio | null> {
  try {
    const db = await openOfflineDB();
    if (!db.objectStoreNames.contains(STORE_CACHED_YT)) return null;
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_CACHED_YT], 'readonly');
      const store = tx.objectStore(STORE_CACHED_YT);
      const req = store.get(id);
      req.onsuccess = () => resolve((req.result as StoredCachedYtAudio) || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function getCachedTrackAudioIds(): Promise<Set<string>> {
  try {
    const db = await openOfflineDB();
    if (!db.objectStoreNames.contains(STORE_CACHED_YT)) return new Set();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_CACHED_YT], 'readonly');
      const store = tx.objectStore(STORE_CACHED_YT);
      const req = store.getAllKeys();
      req.onsuccess = () => resolve(new Set((req.result || []).map((k) => String(k))));
      req.onerror = () => resolve(new Set());
    });
  } catch {
    return new Set();
  }
}

export async function getAllCachedTrackAudios(): Promise<Track[]> {
  try {
    const db = await openOfflineDB();
    if (!db.objectStoreNames.contains(STORE_CACHED_YT)) return [];
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_CACHED_YT], 'readonly');
      const store = tx.objectStore(STORE_CACHED_YT);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = ((req.result as StoredCachedYtAudio[]) || []).sort(
          (a, b) => (b.cachedAt || 0) - (a.cachedAt || 0)
        );
        resolve(
          list.map((s) => {
            if (s.blob) {
              activeBlobs.set(s.id, s.blob);
            }
            let audioUrl = activeBlobUrls.get(s.id);
            if (!audioUrl && s.blob) {
              try {
                audioUrl = URL.createObjectURL(s.blob);
                activeBlobUrls.set(s.id, audioUrl);
              } catch {
                audioUrl = '';
              }
            }
            return {
              id: s.id,
              title: s.title,
              artist: s.artist,
              artistId: s.artistId,
              album: s.album,
              albumId: s.albumId,
              duration: s.duration,
              durationSeconds: s.durationSeconds,
              thumbnail: s.thumbnail,
              isCachedOffline: true,
              audioUrl,
              audioMimeType: s.fileType,
              fileSize: s.fileSize || s.blob?.size || 0,
            };
          })
        );
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function deleteCachedTrackAudio(id: string): Promise<void> {
  try {
    const db = await openOfflineDB();
    if (!db.objectStoreNames.contains(STORE_CACHED_YT)) return;
    if (activeBlobUrls.has(id)) {
      try {
        URL.revokeObjectURL(activeBlobUrls.get(id)!);
      } catch {}
      activeBlobUrls.delete(id);
    }
    activeBlobs.delete(id);
    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE_CACHED_YT], 'readwrite');
      const store = tx.objectStore(STORE_CACHED_YT);
      const req = store.delete(id);
      req.onsuccess = () => {
        notifyCachedYtChanged();
        resolve();
      };
      req.onerror = () => resolve();
    });
  } catch {}
}

export async function clearAllCachedTrackAudios(): Promise<void> {
  try {
    const db = await openOfflineDB();
    if (!db.objectStoreNames.contains(STORE_CACHED_YT)) return;
    const ids = await getCachedTrackAudioIds();
    ids.forEach((id) => {
      if (activeBlobUrls.has(id)) {
        try {
          URL.revokeObjectURL(activeBlobUrls.get(id)!);
        } catch {}
        activeBlobUrls.delete(id);
      }
      activeBlobs.delete(id);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE_CACHED_YT], 'readwrite');
      const store = tx.objectStore(STORE_CACHED_YT);
      const req = store.clear();
      req.onsuccess = () => {
        notifyCachedYtChanged();
        resolve();
      };
      req.onerror = () => resolve();
    });
  } catch {}
}

export interface OfflineStorageStats {
  localCount: number;
  localBytes: number;
  cachedYtCount: number;
  cachedYtBytes: number;
  sharedCount: number;
  sharedBytes: number;
  totalOfflineBytes: number;
  quotaUsageBytes?: number;
  quotaTotalBytes?: number;
  persisted: boolean;
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
      return await navigator.storage.persist();
    }
  } catch {}
  return false;
}

export async function getOfflineStorageStats(): Promise<OfflineStorageStats> {
  const stats: OfflineStorageStats = {
    localCount: 0,
    localBytes: 0,
    cachedYtCount: 0,
    cachedYtBytes: 0,
    sharedCount: 0,
    sharedBytes: 0,
    totalOfflineBytes: 0,
    persisted: false,
  };
  try {
    const db = await openOfflineDB();
    const readStoreSizes = (storeName: string): Promise<{ count: number; bytes: number }> =>
      new Promise((resolve) => {
        if (!db.objectStoreNames.contains(storeName)) {
          resolve({ count: 0, bytes: 0 });
          return;
        }
        const tx = db.transaction([storeName], 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => {
          const rows = (req.result as any[]) || [];
          let bytes = 0;
          for (const r of rows) {
            bytes += Number(r?.fileSize || r?.blob?.size || 0);
          }
          resolve({ count: rows.length, bytes });
        };
        req.onerror = () => resolve({ count: 0, bytes: 0 });
      });

    const [loc, yt, sh] = await Promise.all([
      readStoreSizes(STORE_TRACKS),
      readStoreSizes(STORE_CACHED_YT),
      readStoreSizes(STORE_SHARED),
    ]);
    stats.localCount = loc.count;
    stats.localBytes = loc.bytes;
    stats.cachedYtCount = yt.count;
    stats.cachedYtBytes = yt.bytes;
    stats.sharedCount = sh.count;
    stats.sharedBytes = sh.bytes;
    stats.totalOfflineBytes = loc.bytes + yt.bytes + sh.bytes;
  } catch {}

  try {
    if (typeof navigator !== 'undefined' && navigator.storage) {
      if (typeof navigator.storage.estimate === 'function') {
        const est = await navigator.storage.estimate();
        stats.quotaUsageBytes = est.usage;
        stats.quotaTotalBytes = est.quota;
      }
      if (typeof navigator.storage.persisted === 'function') {
        stats.persisted = await navigator.storage.persisted();
      }
    }
  } catch {}

  return stats;
}

/**
 * Prepare an offline track, cached YT track, or shared offline track for active playback,
 * preferring IndexedDB blob URLs so playback works seamlessly even offline.
 */
export async function getPlayableOfflineTrack(track: Track): Promise<Track> {
  const existingUrl = activeBlobUrls.get(track.id);
  const existingBlob = activeBlobs.get(track.id);
  if (existingUrl && existingBlob && existingBlob.size > 0) {
    const isShared = Boolean(track.isSharedOffline || track.id.startsWith('shared_'));
    const isLocal = isShared || Boolean(track.isLocal);
    return {
      ...track,
      thumbnail: isShared
        ? resolveSharedTrackDisplayThumbnail(track.id, track.thumbnail)
        : track.thumbnail,
      isLocal,
      ...(isShared ? { isSharedOffline: true } : {}),
      isCachedOffline: true,
      audioUrl: existingUrl,
      audioMimeType: track.audioMimeType || existingBlob.type || undefined,
    };
  }

  // Handle Shared Offline tracks (shared_*)
  if (track.isSharedOffline || track.id.startsWith('shared_')) {
    const cached = await getCachedSharedOfflineTrack(track.id);
    if (cached?.blob && cached.blob.size > 0) {
      const safeBlob = normalizeAudioBlob(cached.blob, cached.fileType, cached.fileName);
      activeBlobs.set(track.id, safeBlob);
      let url = activeBlobUrls.get(track.id);
      if (!url) {
        url = URL.createObjectURL(safeBlob);
        activeBlobUrls.set(track.id, url);
      }
      if (cached.thumbnail && !isLegacyPlaceholderThumbnail(cached.thumbnail)) {
        activeSharedThumbs.set(track.id, cached.thumbnail);
      }
      if (
        (typeof navigator === 'undefined' || navigator.onLine) &&
        (!cached.thumbnail ||
          isLegacyPlaceholderThumbnail(cached.thumbnail) ||
          !cached.thumbnail.startsWith('data:image/'))
      ) {
        refreshSharedOfflineThumbnailCache(track.id, track.thumbnail).catch(() => {});
      }
      return {
        ...track,
        thumbnail: resolveSharedTrackDisplayThumbnail(track.id, cached.thumbnail, track.thumbnail),
        isLocal: true,
        isSharedOffline: true,
        isCachedOffline: true,
        audioMimeType: safeBlob.type || cached.fileType,
        audioUrl: url,
      };
    }

    // Fallback to Service Worker CacheStorage if it was cached by Workbox before IndexedDB sync finished
    const swBlob = await recoverSharedBlobFromSwCache(track.id);
    if (swBlob && swBlob.size > 0) {
      const coverUrl = resolveSharedTrackDisplayThumbnail(track.id, track.thumbnail);
      const blobUrl = await saveSharedOfflineBlob(
        {
          id: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album,
          duration: track.duration,
          durationSeconds: track.durationSeconds,
          thumbnail: coverUrl,
          fileName: track.fileName || `${track.title}.${track.fileExt || 'mp3'}`,
          fileType: swBlob.type,
          fileSize: track.fileSize || swBlob.size,
          uploadedBy: track.uploadedBy,
          uploadedAt: track.uploadedAt,
        },
        swBlob
      ).catch(() => {
        const fallbackUrl = URL.createObjectURL(swBlob);
        activeBlobs.set(track.id, swBlob);
        activeBlobUrls.set(track.id, fallbackUrl);
        return fallbackUrl;
      });
      return {
        ...track,
        thumbnail: resolveSharedTrackDisplayThumbnail(track.id, track.thumbnail, coverUrl),
        isLocal: true,
        isSharedOffline: true,
        isCachedOffline: true,
        audioMimeType: swBlob.type,
        audioUrl: blobUrl,
      };
    }

    // If online and not cached yet, download & cache in IndexedDB on-the-fly
    if (typeof navigator === 'undefined' || navigator.onLine) {
      try {
        const res = await fetch(`/api/shared-offline/file/${encodeURIComponent(track.id)}`);
        if (res.ok) {
          const rawBlob = await res.blob();
          if (rawBlob && rawBlob.size >= 32 && !rawBlob.type.includes('text/html')) {
            const coverUrl = resolveSharedTrackDisplayThumbnail(track.id, track.thumbnail);
            const blobUrl = await saveSharedOfflineBlob(
              {
                id: track.id,
                title: track.title,
                artist: track.artist,
                album: track.album,
                duration: track.duration,
                durationSeconds: track.durationSeconds,
                thumbnail: coverUrl,
                fileName: track.fileName || `${track.title}.${track.fileExt || 'mp3'}`,
                fileType: rawBlob.type || res.headers.get('content-type') || undefined,
                fileSize: track.fileSize || rawBlob.size,
                uploadedBy: track.uploadedBy,
                uploadedAt: track.uploadedAt,
              },
              rawBlob
            );
            return {
              ...track,
              thumbnail: resolveSharedTrackDisplayThumbnail(track.id, track.thumbnail, coverUrl),
              isLocal: true,
              isSharedOffline: true,
              isCachedOffline: true,
              audioMimeType: inferAudioMimeType(rawBlob.type, track.fileName),
              audioUrl: blobUrl,
            };
          }
        }
      } catch {}
    }

    // Offline and genuinely uncached: clear dead network audioUrl so callers handle gracefully
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    return {
      ...track,
      thumbnail: resolveSharedTrackDisplayThumbnail(track.id, track.thumbnail),
      isLocal: true,
      isSharedOffline: true,
      isCachedOffline: false,
      audioUrl: isOffline ? undefined : track.audioUrl,
    };
  }

  // Standard local offline track (offline_*)
  if (track.isLocal) {
    if (track.audioUrl && activeBlobUrls.has(track.id)) {
      return track;
    }

    try {
      const db = await openOfflineDB();
      return await new Promise((resolve) => {
        const tx = db.transaction([STORE_TRACKS], 'readonly');
        const store = tx.objectStore(STORE_TRACKS);
        const req = store.get(track.id);

        req.onsuccess = () => {
          const item = req.result as StoredOfflineTrack;
          if (item && item.blob) {
            const url = URL.createObjectURL(item.blob);
            activeBlobUrls.set(track.id, url);
            activeBlobs.set(track.id, item.blob);
            resolve({ ...track, isCachedOffline: true, audioUrl: url });
          } else {
            resolve(track);
          }
        };

        req.onerror = () => resolve(track);
      });
    } catch {
      return track;
    }
  }

  // Cached streaming/YouTube track by original track.id
  const cachedYt = await getCachedTrackAudioRecord(track.id);
  if (cachedYt?.blob) {
    activeBlobs.set(track.id, cachedYt.blob);
    let url = activeBlobUrls.get(track.id);
    if (!url) {
      url = URL.createObjectURL(cachedYt.blob);
      activeBlobUrls.set(track.id, url);
    }
    return {
      ...track,
      isCachedOffline: true,
      audioUrl: url,
      audioMimeType: cachedYt.fileType || track.audioMimeType,
      fileSize: cachedYt.fileSize || cachedYt.blob.size,
    };
  }

  return track;
}

/**
 * Delete a track from IndexedDB offline storage
 */
export async function deleteOfflineTrack(id: string): Promise<void> {
  const db = await openOfflineDB();
  if (activeBlobUrls.has(id)) {
    try {
      URL.revokeObjectURL(activeBlobUrls.get(id)!);
    } catch {}
    activeBlobUrls.delete(id);
  }
  activeBlobs.delete(id);

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_TRACKS], 'readwrite');
    const store = tx.objectStore(STORE_TRACKS);
    const req = store.delete(id);

    req.onsuccess = () => {
      notifyOfflineTracksChanged();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Persistent metadata cache in IndexedDB (for explore feeds, chart backups, lyrics, shared offline catalog)
 */
export async function saveOfflineMeta(key: string, data: any): Promise<void> {
  try {
    const db = await openOfflineDB();
    const tx = db.transaction([STORE_META], 'readwrite');
    const store = tx.objectStore(STORE_META);
    store.put({ key, data, updatedAt: Date.now() });
  } catch (err) {
    console.warn('[OfflineDB] Failed to save meta:', key, err);
  }
}

export async function getOfflineMeta<T>(key: string): Promise<T | null> {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_META], 'readonly');
      const store = tx.objectStore(STORE_META);
      const req = store.get(key);
      req.onsuccess = () => {
        if (req.result && req.result.data) {
          resolve(req.result.data as T);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Generate a clean, synthesized 16-bit 44.1kHz stereo Lofi Chill Loop in pure WAV format
 * Allows instant offline testing without needing external audio files.
 */
export function generateLofiWavBlob(): Blob {
  const sampleRate = 44100;
  const durationSec = 14;
  const numChannels = 2;
  const numSamples = sampleRate * durationSec;
  const blockAlign = numChannels * 2;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const chordFreqs = [
    [146.83, 220.0, 261.63, 329.63],
    [196.0, 246.94, 329.63, 392.0],
    [130.81, 196.0, 246.94, 329.63],
    [220.0, 261.63, 329.63, 392.0],
  ];

  let offset = 44;
  const chordDuration = durationSec / 4;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const chordIndex = Math.floor(t / chordDuration) % chordFreqs.length;
    const currentChord = chordFreqs[chordIndex];
    const chordTime = t % chordDuration;

    const env = Math.sin((chordTime / chordDuration) * Math.PI) * 0.45;

    let sampleL = 0;
    let sampleR = 0;

    for (let c = 0; c < currentChord.length; c++) {
      const freq = currentChord[c];
      const tone =
        Math.sin(2 * Math.PI * freq * t) * 0.35 +
        Math.sin(4 * Math.PI * freq * t) * 0.12;
      const pan = (c / (currentChord.length - 1)) * 0.4 - 0.2;
      sampleL += tone * env * (0.5 - pan);
      sampleR += tone * env * (0.5 + pan);
    }

    const bassFreq = currentChord[0] / 2;
    const bass = Math.sin(2 * Math.PI * bassFreq * t) * 0.35 * env;
    sampleL += bass;
    sampleR += bass;

    const crackle = (Math.random() * 2 - 1) * 0.008;
    sampleL += crackle;
    sampleR += crackle;

    const intSampleL = Math.max(-1, Math.min(1, sampleL)) * 32767;
    const intSampleR = Math.max(-1, Math.min(1, sampleR)) * 32767;

    view.setInt16(offset, intSampleL, true);
    view.setInt16(offset + 2, intSampleR, true);
    offset += 4;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Seed a demo offline track so users can test offline playback immediately
 */
export async function seedDemoOfflineTrack(): Promise<Track> {
  const wavBlob = generateLofiWavBlob();
  return saveOfflineTrack(
    wavBlob,
    'Midnight Tokyo (オフライン試聴デモ)',
    'Zero Music Audio Lab',
    'オフライン・パック Vol.1',
    14,
    '0:14'
  );
}
