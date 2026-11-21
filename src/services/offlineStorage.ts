import { Track } from '../types/music';

const DB_NAME = 'ZeroMusicOfflineDB';
const DB_VERSION = 2;
const STORE_TRACKS = 'offline_tracks';
const STORE_META = 'cached_meta';
const STORE_SHARED = 'shared_offline_tracks';

export const OFFLINE_TRACKS_CHANGED_EVENT = 'zero-offline-tracks-changed';
export const SHARED_OFFLINE_CHANGED_EVENT = 'zero-shared-offline-changed';

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

const DEFAULT_OFFLINE_THUMB =
  'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&h=400&fit=crop&crop=faces';

// Active blob URLs cache to prevent memory leaks and reuse existing URLs
const activeBlobUrls = new Map<string, string>();

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

export function getActiveOfflineBlobUrl(id: string): string | undefined {
  return activeBlobUrls.get(id);
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

  const stored: StoredOfflineTrack = {
    id,
    title,
    artist,
    album,
    duration: durationText,
    durationSeconds,
    thumbnail: thumbnail || DEFAULT_OFFLINE_THUMB,
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
  // Normalize File -> plain Blob so WebKit/Safari never throws DataCloneError/NotReadableError
  const safeBlob =
    blob instanceof File
      ? blob.slice(0, blob.size, blob.type || meta.fileType || 'audio/mpeg')
      : blob;

  const stored: StoredSharedOfflineTrack = {
    id: meta.id,
    title: meta.title,
    artist: meta.artist || '共有アップロード',
    album: meta.album || '共有オフライン',
    duration: meta.duration || '3:00',
    durationSeconds: meta.durationSeconds || 180,
    thumbnail: meta.thumbnail || DEFAULT_OFFLINE_THUMB,
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
      let url = activeBlobUrls.get(meta.id);
      if (!url) {
        url = URL.createObjectURL(safeBlob);
        activeBlobUrls.set(meta.id, url);
      }
      notifySharedOfflineChanged();
      resolve(url);
    };
    req.onerror = () => reject(req.error);
  });
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
        resolve(
          list.map((s) => {
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
              isLocal: true,
              isSharedOffline: true,
              isCachedOffline: true,
              uploadedBy: s.uploadedBy,
              uploadedAt: s.uploadedAt,
              fileSize: s.fileSize || s.blob?.size || 0,
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

export async function deleteCachedSharedOfflineTrack(id: string): Promise<void> {
  try {
    const db = await openOfflineDB();
    if (activeBlobUrls.has(id)) {
      try {
        URL.revokeObjectURL(activeBlobUrls.get(id)!);
      } catch {}
      activeBlobUrls.delete(id);
    }
    await new Promise<void>((resolve) => {
      const tx = db.transaction([STORE_SHARED], 'readwrite');
      const store = tx.objectStore(STORE_SHARED);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {}
}

/**
 * Prepare an offline track (or shared offline track) for active playback,
 * preferring IndexedDB blob URLs so playback works seamlessly even offline.
 */
export async function getPlayableOfflineTrack(track: Track): Promise<Track> {
  if (!track.isLocal && !track.isSharedOffline) return track;

  const existingUrl = activeBlobUrls.get(track.id);
  if (existingUrl && track.audioUrl === existingUrl) {
    return track;
  }

  // Handle Shared Offline tracks (shared_*)
  if (track.isSharedOffline || track.id.startsWith('shared_')) {
    const cached = await getCachedSharedOfflineTrack(track.id);
    if (cached?.blob) {
      let url = activeBlobUrls.get(track.id);
      if (!url) {
        url = URL.createObjectURL(cached.blob);
        activeBlobUrls.set(track.id, url);
      }
      return {
        ...track,
        isLocal: true,
        isSharedOffline: true,
        isCachedOffline: true,
        audioUrl: url,
      };
    }

    // If online and not cached yet, download & cache in IndexedDB on-the-fly
    if (typeof navigator === 'undefined' || navigator.onLine) {
      try {
        const res = await fetch(`/api/shared-offline/file/${encodeURIComponent(track.id)}`);
        if (res.ok) {
          const blob = await res.blob();
          const blobUrl = await saveSharedOfflineBlob(
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
          return {
            ...track,
            isLocal: true,
            isSharedOffline: true,
            isCachedOffline: true,
            audioUrl: blobUrl,
          };
        }
      } catch {}
    }

    return track;
  }

  // Standard local offline track
  if (track.audioUrl && activeBlobUrls.has(track.id)) {
    return track;
  }

  try {
    const db = await openOfflineDB();
    return new Promise((resolve) => {
      const tx = db.transaction([STORE_TRACKS], 'readonly');
      const store = tx.objectStore(STORE_TRACKS);
      const req = store.get(track.id);

      req.onsuccess = () => {
        const item = req.result as StoredOfflineTrack;
        if (item && item.blob) {
          const url = URL.createObjectURL(item.blob);
          activeBlobUrls.set(track.id, url);
          resolve({ ...track, audioUrl: url });
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
