import { SyncedAccountLibrary } from '../services/api';
import {
  Album,
  Artist,
  CatalogRegion,
  ListeningLogEntry,
  Playlist,
  PodcastShow,
  Track,
} from '../types/music';

export interface BackupSharedOfflineTrack {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: string;
  durationSeconds?: number;
  fileName?: string;
  fileExt?: string;
  mimeType?: string;
  fileSize?: number;
  uploadedBy?: string;
  uploadedAt?: string;
  thumbnailDataUrl?: string;
  audioBase64?: string;
}

export interface UserBackupEnvelope {
  app: 'ZeroMusic';
  version: 1;
  exportedAt: string;
  username: string;
  library: SyncedAccountLibrary;
  sharedOfflineTracks?: BackupSharedOfflineTrack[];
}

export interface UserBackupPreview {
  exportedAt: string | null;
  sourceUsername: string | null;
  playlistsCount: number;
  likedTracksCount: number;
  likedAlbumsCount: number;
  likedPlaylistsCount: number;
  followedArtistsCount: number;
  recentTracksCount: number;
  listeningLogsCount: number;
  sharedOfflineCount: number;
  sharedOfflineWithAudioCount: number;
  hasSettings: boolean;
  normalizedLibrary: SyncedAccountLibrary;
  sharedOfflineTracks: BackupSharedOfflineTrack[];
}

export const MAX_USER_BACKUP_JSON_BYTES = 150 * 1024 * 1024; // 150 MiB (for optional shared offline audio)
const MAX_SINGLE_AUDIO_B64_CHARS = 60 * 1024 * 1024; // ~45 MiB raw per track
const VALID_REGIONS: CatalogRegion[] = ['JP', 'US', 'KR', 'GB', 'GLOBAL'];

function safeStr(val: unknown, maxLen = 400): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLen);
}

function safeUrl(val: unknown, fallback = ''): string {
  const s = safeStr(val, 250000);
  if (!s) return fallback;
  const lower = s.toLowerCase().replace(/\s+/g, '');
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:text/html')
  ) {
    return fallback;
  }
  return s;
}

function isPlainRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function sanitizeTrack(raw: unknown): Track | null {
  if (!isPlainRecord(raw)) return null;
  const id = safeStr(raw.id, 160);
  const title = safeStr(raw.title, 300);
  if (!id || !title) return null;

  const track: Track = {
    id,
    title,
    artist: safeStr(raw.artist, 200) || '不明なアーティスト',
    artistId: safeStr(raw.artistId, 160) || undefined,
    album: safeStr(raw.album, 200) || undefined,
    albumId: safeStr(raw.albumId, 160) || undefined,
    thumbnail: safeUrl(raw.thumbnail),
    duration: safeStr(raw.duration, 32) || undefined,
    durationSeconds:
      typeof raw.durationSeconds === 'number' && Number.isFinite(raw.durationSeconds)
        ? Math.max(0, Math.min(86400, raw.durationSeconds))
        : undefined,
    trackType:
      raw.trackType === 'music' || raw.trackType === 'podcast'
        ? raw.trackType
        : undefined,
    isLocal: typeof raw.isLocal === 'boolean' ? raw.isLocal : undefined,
  };
  if (typeof raw.bpm === 'number' && Number.isFinite(raw.bpm)) {
    track.bpm = Math.max(20, Math.min(350, raw.bpm));
  }
  if (typeof raw.composerName === 'string') {
    track.composerName = safeStr(raw.composerName, 200);
  }
  if (typeof raw.opusNumber === 'string') {
    track.opusNumber = safeStr(raw.opusNumber, 120);
  }
  if (typeof raw.isSharedOffline === 'boolean') {
    track.isSharedOffline = raw.isSharedOffline;
  }
  if (typeof raw.isCachedOffline === 'boolean') {
    track.isCachedOffline = raw.isCachedOffline;
  }
  if (typeof raw.uploadedBy === 'string') {
    track.uploadedBy = safeStr(raw.uploadedBy, 80) || undefined;
  }
  if (typeof raw.uploadedAt === 'string') {
    track.uploadedAt = safeStr(raw.uploadedAt, 64) || undefined;
  }
  if (typeof raw.fileSize === 'number' && Number.isFinite(raw.fileSize)) {
    track.fileSize = Math.max(0, Math.round(raw.fileSize));
  }
  if (typeof raw.fileName === 'string') {
    track.fileName = safeStr(raw.fileName, 220) || undefined;
  }
  if (typeof raw.fileExt === 'string') {
    track.fileExt = safeStr(raw.fileExt, 20) || undefined;
  }
  if (typeof raw.audioMimeType === 'string') {
    track.audioMimeType = safeStr(raw.audioMimeType, 80) || undefined;
  }
  return track;
}

function sanitizeBackupSharedOfflineTrack(raw: unknown): BackupSharedOfflineTrack | null {
  if (!isPlainRecord(raw)) return null;
  const id = safeStr(raw.id, 80);
  const title = safeStr(raw.title, 200);
  if (!id || !title || !/^[a-zA-Z0-9_-]{3,80}$/.test(id)) return null;

  let thumbnailDataUrl: string | undefined;
  if (typeof raw.thumbnailDataUrl === 'string') {
    const t = raw.thumbnailDataUrl.trim();
    if (t.startsWith('data:image/') && t.length <= 2 * 1024 * 1024) {
      thumbnailDataUrl = t;
    } else {
      const cleaned = safeUrl(t);
      if (cleaned && cleaned.length <= 1500) {
        thumbnailDataUrl = cleaned;
      }
    }
  } else if (typeof raw.thumbnail === 'string') {
    const cleaned = safeUrl(raw.thumbnail);
    if (cleaned && cleaned.length <= 2 * 1024 * 1024) {
      thumbnailDataUrl = cleaned;
    }
  }

  let audioBase64: string | undefined;
  if (typeof raw.audioBase64 === 'string' && raw.audioBase64.length > 0) {
    const compact = raw.audioBase64.replace(/\s+/g, '');
    if (compact.length <= MAX_SINGLE_AUDIO_B64_CHARS && /^[A-Za-z0-9+/=]+$/.test(compact)) {
      audioBase64 = compact;
    }
  }

  return {
    id,
    title,
    artist: safeStr(raw.artist, 120) || '共有アップロード',
    album: safeStr(raw.album, 120) || '共有オフライン',
    duration: safeStr(raw.duration, 24) || '3:00',
    durationSeconds:
      typeof raw.durationSeconds === 'number' && Number.isFinite(raw.durationSeconds)
        ? Math.max(0, Math.min(86400, Math.round(raw.durationSeconds)))
        : 180,
    fileName: safeStr(raw.fileName, 220) || `${title}.mp3`,
    fileExt: safeStr(raw.fileExt, 16) || 'mp3',
    mimeType: safeStr(raw.mimeType, 80) || 'audio/mpeg',
    fileSize:
      typeof raw.fileSize === 'number' && Number.isFinite(raw.fileSize)
        ? Math.max(0, Math.round(raw.fileSize))
        : undefined,
    uploadedBy: safeStr(raw.uploadedBy, 60) || 'ゲスト',
    uploadedAt: safeStr(raw.uploadedAt, 64) || undefined,
    thumbnailDataUrl,
    audioBase64,
  };
}

function sanitizeAlbum(raw: unknown): Album | null {
  if (!isPlainRecord(raw)) return null;
  const id = safeStr(raw.id, 160);
  const title = safeStr(raw.title, 300);
  if (!id || !title) return null;
  return {
    id,
    title,
    artist: safeStr(raw.artist, 200) || '不明なアーティスト',
    artistId: safeStr(raw.artistId, 160) || undefined,
    thumbnail: safeUrl(raw.thumbnail),
    year: safeStr(raw.year, 32) || undefined,
    trackCount:
      typeof raw.trackCount === 'number' && Number.isFinite(raw.trackCount)
        ? Math.max(0, Math.round(raw.trackCount))
        : undefined,
  };
}

function sanitizePlaylistCard(raw: unknown): Playlist | null {
  if (!isPlainRecord(raw)) return null;
  const id = safeStr(raw.id, 160);
  const title = safeStr(raw.title, 300);
  if (!id || !title) return null;
  return {
    id,
    title,
    author: safeStr(raw.author, 200) || undefined,
    thumbnail: safeUrl(raw.thumbnail),
    itemCount: safeStr(raw.itemCount, 64) || undefined,
  };
}

function sanitizeArtist(raw: unknown): Artist | null {
  if (!isPlainRecord(raw)) return null;
  const id = safeStr(raw.id, 160);
  const name = safeStr(raw.name, 200);
  if (!id || !name) return null;
  return {
    id,
    name,
    thumbnail: safeUrl(raw.thumbnail),
    subscribers: safeStr(raw.subscribers, 64) || undefined,
  };
}

function sanitizeUserPlaylist(raw: unknown): any | null {
  if (!isPlainRecord(raw)) return null;
  const id = safeStr(raw.id, 160);
  const name = safeStr(raw.name, 200);
  if (!id || !name) return null;
  const tracksRaw = Array.isArray(raw.tracks) ? raw.tracks.slice(0, 500) : [];
  const tracks = tracksRaw.map(sanitizeTrack).filter((t): t is Track => t !== null);
  return {
    id,
    name,
    description: safeStr(raw.description, 500) || undefined,
    createdAt: safeStr(raw.createdAt, 64) || new Date().toISOString(),
    folderId: safeStr(raw.folderId, 160) || undefined,
    tracks,
  };
}

function sanitizeFolder(raw: unknown): any | null {
  if (!isPlainRecord(raw)) return null;
  const id = safeStr(raw.id, 160);
  const name = safeStr(raw.name, 120);
  if (!id || !name) return null;
  return {
    id,
    name,
    createdAt: safeStr(raw.createdAt, 64) || new Date().toISOString(),
  };
}

function sanitizePodcast(raw: unknown): PodcastShow | null {
  if (!isPlainRecord(raw)) return null;
  const id = safeStr(raw.id, 160);
  const title = safeStr(raw.title, 300);
  if (!id || !title) return null;
  return {
    id,
    title,
    author: safeStr(raw.author, 200) || '',
    thumbnail: safeUrl(raw.thumbnail),
    description: safeStr(raw.description, 500) || undefined,
    genre: safeStr(raw.genre, 80) || undefined,
    feedUrl: safeUrl(raw.feedUrl) || undefined,
  };
}

function sanitizeListeningLog(raw: unknown): ListeningLogEntry | null {
  if (!isPlainRecord(raw)) return null;
  const track = sanitizeTrack(raw.track);
  const timestamp = safeStr(raw.timestamp, 64);
  if (!track || !timestamp) return null;
  return {
    id: safeStr(raw.id, 160) || `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    track,
    timestamp,
    seconds:
      typeof raw.seconds === 'number' && Number.isFinite(raw.seconds)
        ? Math.max(0, Math.min(86400, raw.seconds))
        : 0,
  };
}

export function buildUserBackupEnvelope(
  library: SyncedAccountLibrary,
  username?: string | null,
  sharedOfflineTracks?: BackupSharedOfflineTrack[]
): UserBackupEnvelope {
  return {
    app: 'ZeroMusic',
    version: 1,
    exportedAt: new Date().toISOString(),
    username: safeStr(username, 120) || 'guest',
    library,
    sharedOfflineTracks:
      Array.isArray(sharedOfflineTracks) && sharedOfflineTracks.length > 0
        ? sharedOfflineTracks
        : undefined,
  };
}

export function downloadUserBackupJson(
  library: SyncedAccountLibrary,
  username?: string | null,
  sharedOfflineTracks?: BackupSharedOfflineTrack[]
): { filename: string; bytes: number } {
  const envelope = buildUserBackupEnvelope(library, username, sharedOfflineTracks);
  const json = JSON.stringify(envelope, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const dateTag = new Date().toISOString().slice(0, 10);
  const safeUser = (safeStr(username, 40) || 'guest').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `zeromusic_backup_${safeUser}_${dateTag}.json`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { filename, bytes: blob.size };
}

export function inspectUserBackupJson(rawText: string): UserBackupPreview {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw new Error('JSONファイルの内容が空です');
  }
  if (rawText.length > MAX_USER_BACKUP_JSON_BYTES) {
    throw new Error('JSONファイルサイズが大きすぎます（150MB以下にしてください）');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText, (key, value) => {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        return undefined;
      }
      return value;
    });
  } catch {
    throw new Error('JSONの形式が正しくありません。正しいZero MusicのJSONファイルを選択してください');
  }

  if (!isPlainRecord(parsed)) {
    throw new Error('JSONファイルのルート構造が不正です');
  }

  const hasEnvelope = isPlainRecord(parsed.library);
  const sourceLib = hasEnvelope ? (parsed.library as Record<string, unknown>) : parsed;

  const rawSharedSource = Array.isArray(parsed.sharedOfflineTracks)
    ? parsed.sharedOfflineTracks
    : Array.isArray(sourceLib.sharedOfflineTracks)
    ? sourceLib.sharedOfflineTracks
    : [];

  const knownKeys = [
    'playlists',
    'likedTracks',
    'likedAlbums',
    'likedPlaylists',
    'followedArtists',
    'recentTracks',
    'recentSearches',
    'userFolders',
    'hiddenTracks',
    'blockedArtists',
    'pinnedBestTracks',
    'listeningHistory',
    'listeningLogs',
    'subscribedPodcasts',
    'catalogRegion',
    'settings',
  ];
  const hasAnyLibraryField = knownKeys.some((k) => k in sourceLib) || rawSharedSource.length > 0;
  if (!hasAnyLibraryField) {
    throw new Error('Zero Musicのライブラリデータ（プレイリスト・お気に入り・共有オフライン等）が見つかりませんでした');
  }

  const normalizedLibrary: SyncedAccountLibrary = {};

  if (Array.isArray(sourceLib.playlists)) {
    normalizedLibrary.playlists = sourceLib.playlists
      .slice(0, 200)
      .map(sanitizeUserPlaylist)
      .filter((p): p is NonNullable<typeof p> => p !== null);
  }
  if (Array.isArray(sourceLib.likedTracks)) {
    normalizedLibrary.likedTracks = sourceLib.likedTracks
      .slice(0, 3000)
      .map(sanitizeTrack)
      .filter((t): t is Track => t !== null);
  }
  if (Array.isArray(sourceLib.likedAlbums)) {
    normalizedLibrary.likedAlbums = sourceLib.likedAlbums
      .slice(0, 1000)
      .map(sanitizeAlbum)
      .filter((a): a is Album => a !== null);
  }
  if (Array.isArray(sourceLib.likedPlaylists)) {
    normalizedLibrary.likedPlaylists = sourceLib.likedPlaylists
      .slice(0, 1000)
      .map(sanitizePlaylistCard)
      .filter((p): p is Playlist => p !== null);
  }
  if (Array.isArray(sourceLib.followedArtists)) {
    normalizedLibrary.followedArtists = sourceLib.followedArtists
      .slice(0, 1000)
      .map(sanitizeArtist)
      .filter((a): a is Artist => a !== null);
  }
  if (Array.isArray(sourceLib.recentTracks)) {
    normalizedLibrary.recentTracks = sourceLib.recentTracks
      .slice(0, 50)
      .map(sanitizeTrack)
      .filter((t): t is Track => t !== null);
  }
  if (Array.isArray(sourceLib.recentSearches)) {
    normalizedLibrary.recentSearches = sourceLib.recentSearches
      .slice(0, 15)
      .map((s) => safeStr(s, 120))
      .filter(Boolean);
  }
  if (Array.isArray(sourceLib.userFolders)) {
    normalizedLibrary.userFolders = sourceLib.userFolders
      .slice(0, 100)
      .map(sanitizeFolder)
      .filter((f): f is NonNullable<typeof f> => f !== null);
  }
  if (Array.isArray(sourceLib.hiddenTracks)) {
    normalizedLibrary.hiddenTracks = sourceLib.hiddenTracks
      .slice(0, 1000)
      .map(sanitizeTrack)
      .filter((t): t is Track => t !== null);
  }
  if (Array.isArray(sourceLib.blockedArtists)) {
    normalizedLibrary.blockedArtists = sourceLib.blockedArtists
      .slice(0, 500)
      .map((s) => safeStr(s, 200))
      .filter(Boolean);
  }
  if (Array.isArray(sourceLib.pinnedBestTracks)) {
    normalizedLibrary.pinnedBestTracks = sourceLib.pinnedBestTracks
      .slice(0, 4)
      .map(sanitizeTrack)
      .filter((t): t is Track => t !== null);
  }
  if (Array.isArray(sourceLib.listeningHistory)) {
    normalizedLibrary.listeningHistory = sourceLib.listeningHistory
      .slice(0, 150)
      .map((entry) => {
        if (!isPlainRecord(entry)) return null;
        const track = sanitizeTrack(entry.track);
        if (!track) return null;
        return {
          track,
          count:
            typeof entry.count === 'number' && Number.isFinite(entry.count)
              ? Math.max(1, Math.min(1000000, Math.round(entry.count)))
              : 1,
          seconds:
            typeof entry.seconds === 'number' && Number.isFinite(entry.seconds)
              ? Math.max(0, Math.min(100000000, entry.seconds))
              : 0,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
  }
  if (Array.isArray(sourceLib.listeningLogs)) {
    normalizedLibrary.listeningLogs = sourceLib.listeningLogs
      .slice(-1500)
      .map(sanitizeListeningLog)
      .filter((e): e is ListeningLogEntry => e !== null);
  }
  if (Array.isArray(sourceLib.subscribedPodcasts)) {
    normalizedLibrary.subscribedPodcasts = sourceLib.subscribedPodcasts
      .slice(0, 300)
      .map(sanitizePodcast)
      .filter((s): s is PodcastShow => s !== null);
  }
  if (typeof sourceLib.catalogRegion === 'string' && VALID_REGIONS.includes(sourceLib.catalogRegion as CatalogRegion)) {
    normalizedLibrary.catalogRegion = sourceLib.catalogRegion as CatalogRegion;
  }
  if (isPlainRecord(sourceLib.settings)) {
    const s = sourceLib.settings;
    const validQuality =
      s.audioQuality === 'auto' ||
      s.audioQuality === 'low' ||
      s.audioQuality === 'normal' ||
      s.audioQuality === 'high' ||
      s.audioQuality === 'lossless' ||
      s.audioQuality === 'hires'
        ? s.audioQuality
        : undefined;
    const validSpatial =
      s.spatialAudio === 'off' ||
      s.spatialAudio === 'cinema' ||
      s.spatialAudio === 'concert' ||
      s.spatialAudio === 'studio'
        ? s.spatialAudio
        : undefined;
    normalizedLibrary.settings = {
      audioQuality: validQuality,
      vocalLevel:
        typeof s.vocalLevel === 'number' && Number.isFinite(s.vocalLevel)
          ? Math.max(0, Math.min(100, Math.round(s.vocalLevel)))
          : undefined,
      spatialAudio: validSpatial,
      djEqSweep: typeof s.djEqSweep === 'boolean' ? s.djEqSweep : undefined,
      floatingLyricsOverlay:
        typeof s.floatingLyricsOverlay === 'boolean' ? s.floatingLyricsOverlay : undefined,
      canvasEnabled: typeof s.canvasEnabled === 'boolean' ? s.canvasEnabled : undefined,
      backgroundPlaybackEnabled:
        typeof s.backgroundPlaybackEnabled === 'boolean' ? s.backgroundPlaybackEnabled : undefined,
      dmUiVisible: typeof s.dmUiVisible === 'boolean' ? s.dmUiVisible : undefined,
    };
  }

  const sharedOfflineTracks = rawSharedSource
    .slice(0, 100)
    .map(sanitizeBackupSharedOfflineTrack)
    .filter((t): t is BackupSharedOfflineTrack => t !== null);

  return {
    exportedAt: hasEnvelope && typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null,
    sourceUsername: hasEnvelope && typeof parsed.username === 'string' ? parsed.username : null,
    playlistsCount: normalizedLibrary.playlists?.length ?? 0,
    likedTracksCount: normalizedLibrary.likedTracks?.length ?? 0,
    likedAlbumsCount: normalizedLibrary.likedAlbums?.length ?? 0,
    likedPlaylistsCount: normalizedLibrary.likedPlaylists?.length ?? 0,
    followedArtistsCount: normalizedLibrary.followedArtists?.length ?? 0,
    recentTracksCount: normalizedLibrary.recentTracks?.length ?? 0,
    listeningLogsCount: normalizedLibrary.listeningLogs?.length ?? 0,
    sharedOfflineCount: sharedOfflineTracks.length,
    sharedOfflineWithAudioCount: sharedOfflineTracks.filter((t) => Boolean(t.audioBase64)).length,
    hasSettings: Boolean(normalizedLibrary.settings),
    normalizedLibrary,
    sharedOfflineTracks,
  };
}
