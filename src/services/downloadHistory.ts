import { getAllOfflineTracks } from './offlineStorage';

export type DownloadTargetKind = 'device' | 'offline' | 'shared' | 'both' | 'artwork';

export interface DownloadHistoryItem {
  id: string;
  title: string;
  artist: string;
  album?: string;
  filename: string;
  formatExt: string;
  mimeType?: string;
  fileSize?: number;
  thumbnail?: string;
  sourceLabel: string;
  target: DownloadTargetKind;
  downloadedAt: string;
  videoId?: string;
  offlineTrackId?: string;
  sharedTrackId?: string;
  duration?: string;
  durationSeconds?: number;
}

const HISTORY_STORAGE_KEY = 'zero_music_download_history_v1';
const HISTORY_INIT_FLAG_KEY = 'zero_music_download_history_init_v1';
const MAX_HISTORY_ITEMS = 200;

export const DOWNLOAD_HISTORY_CHANGED_EVENT = 'zero-download-history-changed';

function dispatchHistoryChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DOWNLOAD_HISTORY_CHANGED_EVENT));
  }
}

export function getDownloadHistory(): DownloadHistoryItem[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => x && typeof x.id === 'string' && typeof x.title === 'string');
  } catch {
    return [];
  }
}

function saveHistoryList(items: DownloadHistoryItem[]) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items.slice(0, MAX_HISTORY_ITEMS)));
    localStorage.setItem(HISTORY_INIT_FLAG_KEY, '1');
  } catch {
    // If localStorage is full (e.g. too many data URLs), strip heavy thumbnails on older items
    try {
      const trimmed = items.slice(0, 80).map((item, idx) =>
        idx > 20 && item.thumbnail?.startsWith('data:')
          ? { ...item, thumbnail: undefined }
          : item
      );
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
      localStorage.setItem(HISTORY_INIT_FLAG_KEY, '1');
    } catch {}
  }
}

export function recordDownloadHistory(
  entry: Omit<DownloadHistoryItem, 'id' | 'downloadedAt'> & {
    id?: string;
    downloadedAt?: string;
  }
): DownloadHistoryItem {
  const newItem: DownloadHistoryItem = {
    ...entry,
    id: entry.id || `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    downloadedAt: entry.downloadedAt || new Date().toISOString(),
    formatExt: (entry.formatExt || 'mp3').replace(/^\./, '').toLowerCase(),
  };

  const current = getDownloadHistory();
  const next = [newItem, ...current].slice(0, MAX_HISTORY_ITEMS);
  saveHistoryList(next);
  dispatchHistoryChanged();
  return newItem;
}

export function removeDownloadHistoryItem(id: string): void {
  const next = getDownloadHistory().filter((item) => item.id !== id);
  saveHistoryList(next);
  dispatchHistoryChanged();
}

export function clearDownloadHistory(): void {
  saveHistoryList([]);
  dispatchHistoryChanged();
}

export async function syncInitialDownloadHistoryFromOffline(): Promise<DownloadHistoryItem[]> {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
  const existing = getDownloadHistory();
  const alreadyInit = localStorage.getItem(HISTORY_INIT_FLAG_KEY) === '1';
  if (alreadyInit || existing.length > 0) {
    return existing;
  }

  try {
    const offlineTracks = await getAllOfflineTracks();
    localStorage.setItem(HISTORY_INIT_FLAG_KEY, '1');
    if (!offlineTracks || offlineTracks.length === 0) {
      return [];
    }

    const seeded: DownloadHistoryItem[] = offlineTracks.slice(0, MAX_HISTORY_ITEMS).map((t) => {
      const ext = (t.fileExt || t.fileName?.split('.').pop() || 'mp3').replace(/^\./, '').toLowerCase();
      return {
        id: `dl_seed_${t.id}`,
        title: t.title || 'Downloaded Track',
        artist: t.artist || 'オフライン保存',
        album: t.album,
        filename: t.fileName || `${t.title || 'track'}.${ext}`,
        formatExt: ext,
        fileSize: t.fileSize,
        thumbnail: t.thumbnail,
        sourceLabel: t.album?.includes('共有オフライン')
          ? '共有オフライン保存'
          : 'Freemake / オフライン保存',
        target: 'offline',
        downloadedAt: t.uploadedAt || new Date().toISOString(),
        offlineTrackId: t.id,
        duration: t.duration,
        durationSeconds: t.durationSeconds,
      };
    });

    saveHistoryList(seeded);
    dispatchHistoryChanged();
    return seeded;
  } catch {
    return existing;
  }
}

export function formatDownloadTargetLabel(target: DownloadTargetKind): string {
  switch (target) {
    case 'both':
      return '端末 + オフライン';
    case 'device':
      return '端末へ保存';
    case 'offline':
      return 'オフライン保存';
    case 'shared':
      return '共有オフライン';
    case 'artwork':
      return 'ジャケット保存';
    default:
      return '保存済み';
  }
}

export function formatDownloadTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
