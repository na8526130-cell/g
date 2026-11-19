const CACHE_DB_NAME = 'ZeroMusicApiCacheDB';
const CACHE_DB_VERSION = 1;
const CACHE_STORE_NAME = 'api_cache';
const MAX_CACHE_ENTRIES = 300;
const LEGACY_PREFIX = 'zm_qc_v1:';
const LEGACY_INDEX_KEY = 'zm_qc_idx_v1';

interface CacheRecord<T = any> {
  key: string;
  data: T;
  exp: number;
  touchedAt: number;
}

let cacheDbPromise: Promise<IDBDatabase> | null = null;
let legacyPurged = false;

function openApiCacheDB(): Promise<IDBDatabase> {
  if (cacheDbPromise) return cacheDbPromise;

  cacheDbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }

    const req = window.indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
        const store = db.createObjectStore(CACHE_STORE_NAME, { keyPath: 'key' });
        store.createIndex('touchedAt', 'touchedAt', { unique: false });
        store.createIndex('exp', 'exp', { unique: false });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      cacheDbPromise = null;
      reject(req.error);
    };
  });

  return cacheDbPromise;
}

/**
 * Clean up legacy localStorage API caches so user library data in localStorage never hits quota limits.
 */
export function purgeLegacyLocalStorageCache(): void {
  if (legacyPurged || typeof window === 'undefined' || !window.localStorage) return;
  legacyPurged = true;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && (k.startsWith(LEGACY_PREFIX) || k === LEGACY_INDEX_KEY)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => {
      try {
        window.localStorage.removeItem(k);
      } catch {}
    });
  } catch {}
}

export async function getApiCacheEntry<T>(key: string): Promise<T | null> {
  purgeLegacyLocalStorageCache();
  try {
    const db = await openApiCacheDB();
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction([CACHE_STORE_NAME], 'readonly');
      const store = tx.objectStore(CACHE_STORE_NAME);
      const req = store.get(key);

      req.onsuccess = () => {
        const rec = req.result as CacheRecord<T> | undefined;
        if (!rec || typeof rec.exp !== 'number') {
          resolve(null);
          return;
        }
        if (rec.exp <= Date.now()) {
          // Expired: delete lazily in background
          deleteApiCacheEntry(key).catch(() => {});
          resolve(null);
          return;
        }
        resolve(rec.data);
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setApiCacheEntry<T>(key: string, data: T, ttlMs: number): Promise<void> {
  purgeLegacyLocalStorageCache();
  try {
    const db = await openApiCacheDB();
    const now = Date.now();
    const record: CacheRecord<T> = {
      key,
      data,
      exp: now + ttlMs,
      touchedAt: now,
    };

    await new Promise<void>((resolve) => {
      const tx = db.transaction([CACHE_STORE_NAME], 'readwrite');
      const store = tx.objectStore(CACHE_STORE_NAME);
      const putReq = store.put(record);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => resolve();
    });

    // Opportunistically prune expired & excess entries beyond MAX_CACHE_ENTRIES
    pruneApiCacheEntries(db, now).catch(() => {});
  } catch {}
}

export async function deleteApiCacheEntry(key: string): Promise<void> {
  try {
    const db = await openApiCacheDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction([CACHE_STORE_NAME], 'readwrite');
      const store = tx.objectStore(CACHE_STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  } catch {}
}

async function pruneApiCacheEntries(db: IDBDatabase, now: number): Promise<void> {
  try {
    const records = await new Promise<CacheRecord[]>((resolve) => {
      const tx = db.transaction([CACHE_STORE_NAME], 'readonly');
      const store = tx.objectStore(CACHE_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as CacheRecord[]) || []);
      req.onerror = () => resolve([]);
    });

    const expiredKeys: string[] = [];
    const liveRecords: CacheRecord[] = [];

    for (const r of records) {
      if (!r || typeof r.exp !== 'number' || r.exp <= now) {
        if (r?.key) expiredKeys.push(r.key);
      } else {
        liveRecords.push(r);
      }
    }

    const keysToDelete = [...expiredKeys];
    if (liveRecords.length > MAX_CACHE_ENTRIES) {
      liveRecords.sort((a, b) => (a.touchedAt || 0) - (b.touchedAt || 0));
      const excess = liveRecords.length - MAX_CACHE_ENTRIES;
      for (let i = 0; i < excess; i++) {
        keysToDelete.push(liveRecords[i].key);
      }
    }

    if (keysToDelete.length > 0) {
      const tx = db.transaction([CACHE_STORE_NAME], 'readwrite');
      const store = tx.objectStore(CACHE_STORE_NAME);
      keysToDelete.forEach((k) => {
        try {
          store.delete(k);
        } catch {}
      });
    }
  } catch {}
}
