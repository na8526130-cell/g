import {
  Track,
  Album,
  Artist,
  Playlist,
  LyricsData,
  ExploreData,
  InnerTubeLog,
  OriconTrack,
  AudioQualityMode,
  SpatialAudioPreset,
  PodcastShow,
  PodcastEpisode,
  CatalogRegion,
  BpmRangePreset,
  ClassicalComposer,
  LyricsTranslationLine,
  ListeningLogEntry,
} from '../types/music';
import { CollabPlaylistRoom, ConnectCommandPayload, ConnectDeviceInfo } from '../types/social';
import { toBase64Image } from '../utils/imageBase64';
import { saveOfflineMeta } from './offlineStorage';
import { getApiCacheEntry, setApiCacheEntry } from './apiCacheDb';

// Admin session Bearer token kept strictly in JS memory (never persisted in localStorage/sessionStorage)
let adminSessionToken: string | null = null;
let onAdminAuthExpiredCb: (() => void) | null = null;

function buildAdminHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {};
  if (extra && typeof extra === 'object' && !Array.isArray(extra) && !(extra instanceof Headers)) {
    Object.assign(headers, extra);
  }
  if (adminSessionToken) {
    headers['Authorization'] = `Bearer ${adminSessionToken}`;
  }
  return headers;
}

async function adminFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: buildAdminHeaders(init.headers),
  });
  if (res.status === 401) {
    adminSessionToken = null;
    if (onAdminAuthExpiredCb) {
      try {
        onAdminAuthExpiredCb();
      } catch {}
    }
  }
  return res;
}

export interface SiteSettings {
  announcement: {
    active: boolean;
    message: string;
    level: 'info' | 'warning' | 'alert';
    updatedAt: string;
  };
  allowNewRegistrations: boolean;
  sharedOfflineUploadEnabled: boolean;
  commentsEnabled: boolean;
  dmsEnabled: boolean;
}

export interface SyncedAccountLibrary {
  playlists?: any[];
  likedTracks?: Track[];
  likedAlbums?: Album[];
  likedPlaylists?: Playlist[];
  followedArtists?: Artist[];
  recentTracks?: Track[];
  recentSearches?: string[];
  userFolders?: any[];
  hiddenTracks?: Track[];
  blockedArtists?: string[];
  pinnedBestTracks?: Track[];
  listeningHistory?: any[];
  listeningLogs?: ListeningLogEntry[];
  subscribedPodcasts?: PodcastShow[];
  catalogRegion?: CatalogRegion;
  settings?: {
    audioQuality?: AudioQualityMode;
    vocalLevel?: number;
    spatialAudio?: SpatialAudioPreset;
    djEqSweep?: boolean;
    floatingLyricsOverlay?: boolean;
    canvasEnabled?: boolean;
    backgroundPlaybackEnabled?: boolean;
    dmUiVisible?: boolean;
  };
}

interface ApiMemoEntry<T = any> {
  promise: Promise<T>;
  expiresAt: number;
}

const apiMemoCache = new Map<string, ApiMemoEntry>();
let bootPrefetchTriggered = false;

const PERSIST_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours automatic cache in IndexedDB

interface MemoOptions<T> {
  bypass?: boolean;
  persist?: boolean;
  shouldPersist?: (val: T) => boolean;
}

function withApiMemo<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  optionsOrBypass: boolean | MemoOptions<T> = false
): Promise<T> {
  const opts: MemoOptions<T> =
    typeof optionsOrBypass === 'boolean' ? { bypass: optionsOrBypass } : optionsOrBypass;
  const now = Date.now();
  if (!opts.bypass) {
    const existing = apiMemoCache.get(key);
    if (existing && existing.expiresAt > now) {
      return existing.promise;
    }
  }

  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

  const promise = (async () => {
    if (opts.persist && isOffline) {
      const offlineCached = await getApiCacheEntry<T>(key, { allowExpired: true });
      if (offlineCached !== null) {
        return offlineCached;
      }
    }
    if (!opts.bypass && opts.persist) {
      const persisted = await getApiCacheEntry<T>(key);
      if (persisted !== null) {
        return persisted;
      }
    }
    try {
      const val = await fetcher();
      if (opts.persist && (!opts.shouldPersist || opts.shouldPersist(val))) {
        setApiCacheEntry(key, val, ttlMs).catch(() => {});
      }
      return val;
    } catch (fetchErr) {
      if (opts.persist) {
        const staleFallback = await getApiCacheEntry<T>(key, { allowExpired: true });
        if (staleFallback !== null) {
          return staleFallback;
        }
      }
      throw fetchErr;
    }
  })().catch((err) => {
    const cur = apiMemoCache.get(key);
    if (cur && cur.promise === promise) {
      apiMemoCache.delete(key);
    }
    throw err;
  });

  apiMemoCache.set(key, { promise, expiresAt: now + ttlMs });
  return promise;
}

export const api = {
  async getHealth() {
    const res = await fetch('/api/health');
    return res.json();
  },

  getExplore(gl: CatalogRegion = 'JP'): Promise<ExploreData> {
    const region = gl || 'JP';
    return withApiMemo(
      `explore:${region}`,
      PERSIST_CACHE_TTL_MS,
      async () => {
        const res = await fetch(`/api/music/explore?gl=${encodeURIComponent(region)}`);
        if (!res.ok) throw new Error('Failed to fetch explore');
        return res.json();
      },
      { persist: true }
    );
  },

  getOriconRanking(type: 'streaming' | 'digital' = 'streaming'): Promise<OriconTrack[]> {
    return withApiMemo(
      `oricon:${type}`,
      PERSIST_CACHE_TTL_MS,
      async () => {
        try {
          const res = await fetch(`/api/music/oricon?type=${type}`);
          if (!res.ok) return [];
          const data = await res.json();
          return data.items || [];
        } catch {
          return [];
        }
      },
      { persist: true, shouldPersist: (items) => Array.isArray(items) && items.length > 0 }
    );
  },

  async getSuggestions(query: string, forceRefresh = false): Promise<string[]> {
    const clean = query.trim();
    if (!clean) return [];
    const data = await this.getSuggestionsWithConversions(clean, forceRefresh);
    return data.suggestions || [];
  },

  getSuggestionsWithConversions(
    query: string,
    forceRefresh = false
  ): Promise<{
    suggestions: string[];
    conversions: { query: string; label: string; kind: 'alias' | 'kana' | 'romaji' }[];
  }> {
    const clean = query.trim();
    if (!clean) return Promise.resolve({ suggestions: [], conversions: [] });
    return withApiMemo(
      `suggest:${clean.toLowerCase()}`,
      PERSIST_CACHE_TTL_MS,
      async () => {
        try {
          const refreshQs = forceRefresh ? '&refresh=1' : '';
          const res = await fetch(`/api/music/suggestions?q=${encodeURIComponent(clean)}${refreshQs}`);
          if (!res.ok) return { suggestions: [], conversions: [] };
          const data = await res.json();
          return {
            suggestions: data.suggestions || [],
            conversions: data.conversions || [],
          };
        } catch {
          return { suggestions: [], conversions: [] };
        }
      },
      {
        bypass: forceRefresh,
        persist: true,
        shouldPersist: (d) =>
          (Array.isArray(d?.suggestions) && d.suggestions.length > 0) ||
          (Array.isArray(d?.conversions) && d.conversions.length > 0),
      }
    );
  },

  search(
    query: string,
    type: 'all' | 'song' | 'video' | 'album' | 'artist' | 'playlist' | 'unofficial' = 'all',
    raw = false,
    forceRefresh = false,
    gl: CatalogRegion = 'JP'
  ) {
    const rawQs = raw ? '&raw=1' : '';
    const refreshQs = forceRefresh ? '&refresh=1' : '';
    const region = gl || 'JP';
    const normQ = query.trim().toLowerCase();
    const key = `search:${region}:${type}:${raw ? '1' : '0'}:${normQ}`;
    return withApiMemo(
      key,
      PERSIST_CACHE_TTL_MS,
      async () => {
        const res = await fetch(
          `/api/music/search?q=${encodeURIComponent(query)}&type=${type}&gl=${encodeURIComponent(region)}${rawQs}${refreshQs}`
        );
        if (!res.ok) throw new Error('Failed to execute search');
        return res.json();
      },
      {
        bypass: forceRefresh,
        persist: true,
        shouldPersist: (d: any) =>
          Boolean(
            d &&
              ((Array.isArray(d.results) && d.results.length > 0) ||
                (Array.isArray(d.songs) && d.songs.length > 0) ||
                (Array.isArray(d.artists) && d.artists.length > 0) ||
                (Array.isArray(d.albums) && d.albums.length > 0) ||
                (Array.isArray(d.playlists) && d.playlists.length > 0))
          ),
      }
    );
  },

  getMvCanvas(
    videoId: string,
    title?: string,
    artist?: string
  ): Promise<{
    hasMv: boolean;
    videoId: string | null;
    title?: string;
    chorusStartSec?: number;
    mvDurationSec?: number;
    fromServer?: boolean;
  }> {
    const key = `mv-canvas-v3:${videoId}:${(title || '').toLowerCase()}:${(artist || '').toLowerCase()}`;
    return withApiMemo(
      key,
      PERSIST_CACHE_TTL_MS,
      async () => {
        try {
          const params = new URLSearchParams();
          if (videoId) params.append('id', videoId);
          if (title) params.append('title', title);
          if (artist) params.append('artist', artist);
          const res = await fetch(`/api/music/mv-canvas?${params.toString()}`);
          if (!res.ok) throw new Error('mv-canvas unavailable');
          const data = await res.json();
          return { ...data, fromServer: true };
        } catch {
          return { hasMv: false, videoId: null, fromServer: false };
        }
      },
      { persist: true, shouldPersist: (d) => Boolean(d?.fromServer) }
    );
  },

  searchSpotify(
    query: string,
    raw = false,
    forceRefresh = false,
    gl: CatalogRegion = 'JP'
  ): Promise<{
    tracks: Track[];
    query: string;
    originalQuery?: string;
    effectiveQuery?: string;
    matchedAlias?: string;
    fromCache?: boolean;
  }> {
    const normQ = query.trim().toLowerCase();
    if (!normQ) return Promise.resolve({ tracks: [], query });
    const rawQs = raw ? '&raw=1' : '';
    const refreshQs = forceRefresh ? '&refresh=1' : '';
    const region = gl || 'JP';
    return withApiMemo(
      `spotify-search:${region}:${raw ? '1' : '0'}:${normQ}`,
      PERSIST_CACHE_TTL_MS,
      async () => {
        try {
          const res = await fetch(
            `/api/music/spotify/search?q=${encodeURIComponent(query)}&gl=${encodeURIComponent(region)}${rawQs}${refreshQs}`
          );
          if (!res.ok) return { tracks: [], query };
          return res.json();
        } catch {
          return { tracks: [], query };
        }
      },
      {
        bypass: forceRefresh,
        persist: true,
        shouldPersist: (d) => Array.isArray(d?.tracks) && d.tracks.length > 0,
      }
    );
  },

  getMoodRecommendation(mood: string, artist?: string, forceRefresh = false): Promise<{
    success: boolean;
    mood: { id: string; name: string; icon: string; tagline: string };
    artist: string | null;
    title: string;
    tagline: string;
    cover: string;
    analyzedTotalComments?: number;
    topEmotionTags?: string[];
    tracks: Track[];
  }> {
    const cleanArtist = artist && artist !== '指定なし' && artist !== 'all' ? artist : '';
    const key = `mood-rec:${mood}:${cleanArtist.toLowerCase()}`;
    return withApiMemo(
      key,
      PERSIST_CACHE_TTL_MS,
      async () => {
        const params = new URLSearchParams();
        if (mood) params.append('mood', mood);
        if (cleanArtist) params.append('artist', cleanArtist);
        if (forceRefresh) params.append('refresh', '1');
        const res = await fetch(`/api/music/mood-recommend?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch mood recommendation');
        return res.json();
      },
      { bypass: forceRefresh, persist: true, shouldPersist: (d) => Array.isArray(d?.tracks) && d.tracks.length > 0 }
    );
  },

  async getTrackCommentEmotions(
    videoId: string,
    title?: string,
    artist?: string
  ): Promise<import('../types/music').CommentEmotionData & { success: boolean }> {
    const params = new URLSearchParams();
    if (title) params.append('title', title);
    if (artist) params.append('artist', artist);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/music/comment-emotions/${encodeURIComponent(videoId)}${qs}`);
    if (!res.ok) throw new Error('Failed to analyze YouTube comments');
    return res.json();
  },

  getTrackTimestamps(
    videoId: string,
    title?: string,
    artist?: string,
    duration?: number
  ): Promise<import('../types/music').TrackTimestampsData & { success: boolean }> {
    const key = `timestamps:${videoId}`;
    return withApiMemo(
      key,
      PERSIST_CACHE_TTL_MS,
      async () => {
        const params = new URLSearchParams();
        if (title) params.append('title', title);
        if (artist) params.append('artist', artist);
        if (duration && duration > 0) params.append('duration', String(Math.floor(duration)));
        const qs = params.toString() ? `?${params.toString()}` : '';
        const res = await fetch(`/api/music/timestamps/${encodeURIComponent(videoId)}${qs}`);
        if (!res.ok) throw new Error('Failed to fetch track timestamps');
        return res.json();
      },
      { persist: true, shouldPersist: (d) => Boolean(d?.success) }
    );
  },

  async getArtistSetlists(artistName: string): Promise<{
    success: boolean;
    artist: string;
    setlists: import('../types/music').ArtistLiveSetlist[];
  }> {
    try {
      const res = await fetch(`/api/music/artist-setlists?artist=${encodeURIComponent(artistName)}`);
      if (!res.ok) return { success: false, artist: artistName, setlists: [] };
      return res.json();
    } catch {
      return { success: false, artist: artistName, setlists: [] };
    }
  },

  getSpotifyCurated(): Promise<{
    playlists: {
      id: string;
      spotifyId: string;
      title: string;
      tagline: string;
      category: string;
      thumbnail: string;
      trackCount: number;
    }[];
  }> {
    return withApiMemo(
      'spotify-curated',
      5 * 60 * 1000,
      async () => {
        try {
          const res = await fetch('/api/music/spotify/curated');
          if (!res.ok) throw new Error('Failed to fetch curated playlists');
          return res.json();
        } catch (err) {
          throw err;
        }
      },
      {
        persist: true,
        shouldPersist: (d) => Array.isArray(d?.playlists) && d.playlists.length > 0,
      }
    ).catch(() => ({ playlists: [] }));
  },

  getSpotifyCuratedPlaylist(id: string): Promise<{
    id: string;
    spotifyId: string;
    title: string;
    tagline: string;
    thumbnail: string;
    tracks: Track[];
    totalTracks: number;
  } | null> {
    return withApiMemo(
      `spotify-curated:${id}`,
      PERSIST_CACHE_TTL_MS,
      async () => {
        try {
          const res = await fetch(`/api/music/spotify/curated/${id}`);
          if (!res.ok) return null;
          return res.json();
        } catch {
          return null;
        }
      },
      { persist: true, shouldPersist: (d) => Boolean(d && Array.isArray(d.tracks) && d.tracks.length > 0) }
    );
  },

  getLyrics(
    videoId: string,
    title?: string,
    artist?: string,
    duration?: number
  ): Promise<LyricsData> {
    const key = `lyrics:${videoId}:${duration || ''}`;
    return withApiMemo(
      key,
      PERSIST_CACHE_TTL_MS,
      async () => {
        try {
          const params = new URLSearchParams();
          if (title) params.append('title', title);
          if (artist) params.append('artist', artist);
          if (duration) params.append('duration', String(duration));
          const queryStr = params.toString() ? `?${params.toString()}` : '';

          const res = await fetch(`/api/music/lyrics/${videoId}${queryStr}`);
          if (!res.ok) return { available: false, isSynced: false, lyrics: '' };
          return res.json();
        } catch (err: any) {
          return { available: false, isSynced: false, lyrics: '', error: err.message };
        }
      },
      { persist: true, shouldPersist: (d) => !d?.error }
    );
  },

  getRelated(videoId: string): Promise<Track[]> {
    const key = `related:${videoId}`;
    return withApiMemo(
      key,
      PERSIST_CACHE_TTL_MS,
      async () => {
        try {
          const res = await fetch(`/api/music/related/${videoId}`);
          if (!res.ok) return [];
          const data = await res.json();
          return data.related || [];
        } catch {
          return [];
        }
      },
      { persist: true, shouldPersist: (arr) => Array.isArray(arr) && arr.length > 0 }
    );
  },

  getArtist(artistId: string): Promise<{
    header: Artist;
    topSongs: Track[];
    albums: Album[];
    singles: Album[];
    relatedArtists?: Artist[];
    featuredPlaylists?: Playlist[];
  }> {
    return withApiMemo(
      `artist:${artistId}`,
      PERSIST_CACHE_TTL_MS,
      async () => {
        const res = await fetch(`/api/music/artist/${artistId}`);
        if (!res.ok) throw new Error('Failed to fetch artist');
        return res.json();
      },
      { persist: true }
    );
  },

  getAlbum(albumId: string): Promise<{
    header: Album;
    tracks: (Track & { index: number })[];
  }> {
    return withApiMemo(
      `album:${albumId}`,
      PERSIST_CACHE_TTL_MS,
      async () => {
        const res = await fetch(`/api/music/album/${albumId}`);
        if (!res.ok) throw new Error('Failed to fetch album');
        return res.json();
      },
      { persist: true }
    );
  },

  getPlaylist(playlistId: string): Promise<{
    header: Playlist;
    tracks: (Track & { index: number })[];
  }> {
    return withApiMemo(
      `playlist:${playlistId}`,
      PERSIST_CACHE_TTL_MS,
      async () => {
        const res = await fetch(`/api/music/playlist/${playlistId}`);
        if (!res.ok) throw new Error('Failed to fetch playlist');
        return res.json();
      },
      { persist: true }
    );
  },

  getTrackDetails(videoId: string): Promise<{
    track: Track;
    details?: {
      publishedDate?: string;
      viewCount?: number;
      viewCountText?: string;
      likeCount?: number;
      description?: string;
      category?: string;
      keywords?: string[];
      channelId?: string;
      albumTitle?: string;
      albumId?: string;
      relatedArtists?: { id?: string; name: string; thumbnail?: string }[];
    };
  } | null> {
    return withApiMemo(
      `track-details:${videoId}`,
      PERSIST_CACHE_TTL_MS,
      async () => {
        try {
          const res = await fetch(`/api/music/track/${encodeURIComponent(videoId)}?rich=1`);
          if (!res.ok) return null;
          return res.json();
        } catch {
          return null;
        }
      },
      { persist: true, shouldPersist: (d) => Boolean(d) }
    );
  },

  async getInnerTubeLogs(): Promise<{ logs: InnerTubeLog[] }> {
    const res = await fetch('/api/innertube/logs');
    if (!res.ok) return { logs: [] };
    return res.json();
  },

  async executeInnerTube(body: { action: string; query?: string; id?: string; type?: string }) {
    const res = await fetch('/api/music/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  },

  getHigedanSpotlight(): Promise<{
    artist: string;
    tagline: string;
    songs: Track[];
  }> {
    return withApiMemo(
      'higedan-spotlight',
      PERSIST_CACHE_TTL_MS,
      async () => {
        const res = await fetch('/api/music/featured/higedan');
        if (!res.ok) throw new Error('Failed to fetch Higedan spotlight');
        return res.json();
      },
      { persist: true }
    );
  },

  /**
   * Prefetch core Home data, mixes, artist metadata, and YouTube IFrame script
   * while the user is choosing between Mobile and PC mode.
   */
  prefetchBootData(options?: { currentTrack?: Track | null; topArtists?: string[] }) {
    if (bootPrefetchTriggered) return;
    bootPrefetchTriggered = true;

    // 1. Preload YouTube IFrame API script so player initializes immediately
    if (typeof document !== 'undefined' && !(window as any).YT?.Player) {
      if (!document.getElementById('yt-iframe-api-script')) {
        const tag = document.createElement('script');
        tag.id = 'yt-iframe-api-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    }

    // 2. Core Home Explore + Official髭男dism spotlight + Artist albums + Curated + Default mood
    this.getExplore()
      .then((res) => saveOfflineMeta('cached_explore', res).catch(() => {}))
      .catch(() => {});
    this.getHigedanSpotlight()
      .then((res) => saveOfflineMeta('cached_higedan', res).catch(() => {}))
      .catch(() => {});
    this.getArtist('UC84Rm0a3gimYXPtqp5O_JRw').catch(() => {});
    this.getSpotifyCurated().catch(() => {});
    this.getMoodRecommendation('energy').catch(() => {});

    // 3. Time-of-day Daylist + Personalized Daily Mix & Release Radar seeds
    const hour = new Date().getHours();
    const daylistMoodId =
      hour >= 5 && hour < 11
        ? 'happy'
        : hour >= 11 && hour < 17
        ? 'focus'
        : hour >= 17 && hour < 23
        ? 'emo'
        : 'chill';

    const artistSeeds: string[] = [];
    const pushSeed = (name?: string) => {
      const clean = name?.trim();
      if (!clean) return;
      if (!artistSeeds.some((a) => a.toLowerCase() === clean.toLowerCase())) {
        artistSeeds.push(clean);
      }
    };
    (options?.topArtists || []).forEach(pushSeed);
    pushSeed('Official髭男dism');
    pushSeed('Mrs. GREEN APPLE');
    pushSeed('Vaundy');

    const artist1 = artistSeeds[0] || 'Official髭男dism';
    const artist2 = artistSeeds[1] || 'Vaundy';
    const radarArtists = artistSeeds.slice(0, 3);

    this.getMoodRecommendation(daylistMoodId, artist1).catch(() => {});
    this.search(`${artist1} 人気曲`, 'song').catch(() => {});
    this.search(`${artist2} 人気曲`, 'song').catch(() => {});
    radarArtists.forEach((name) => {
      this.search(`${name} 新曲`, 'song').catch(() => {});
    });

    // 4. Warm missing home artist avatar chips and store in IndexedDB (freeing localStorage)
    (async () => {
      try {
        const ARTIST_CACHE_KEY = 'yt_music_home_artists_v1';
        let cachedMap: Record<string, any> = (await getApiCacheEntry<Record<string, any>>(ARTIST_CACHE_KEY)) || {};
        // Clean legacy localStorage cache entry if present
        try {
          const legacyRaw = localStorage.getItem(ARTIST_CACHE_KEY);
          if (legacyRaw) {
            const parsed = JSON.parse(legacyRaw);
            if (!Object.keys(cachedMap).length && parsed?.data && parsed?.ts && Date.now() - parsed.ts < 12 * 60 * 60 * 1000) {
              cachedMap = parsed.data;
              await setApiCacheEntry(ARTIST_CACHE_KEY, cachedMap, 12 * 60 * 60 * 1000);
            }
            localStorage.removeItem(ARTIST_CACHE_KEY);
          }
        } catch {}
        const chipTargets = ['Mrs. GREEN APPLE', 'Vaundy', 'YOASOBI', 'King Gnu', 'RADWIMPS', 'back number'];
        const missingChips = chipTargets.filter((name) => !cachedMap[name]?.thumbnail);
        if (missingChips.length > 0) {
          const entries = await Promise.all(
            missingChips.map(async (name) => {
              try {
                const [artistRes, songRes] = await Promise.all([
                  this.search(name, 'artist').catch(() => null),
                  this.search(name, 'song').catch(() => null),
                ]);
                const firstArtist = artistRes?.results?.[0] || artistRes?.artists?.[0];
                const firstSong = songRes?.results?.[0] || songRes?.songs?.[0];
                const thumb = firstArtist?.thumbnail || firstSong?.thumbnail;
                const channelId = firstArtist?.id?.startsWith('UC') ? firstArtist.id : firstSong?.artistId;
                if (!thumb && !firstSong) return null;
                return [name, { id: channelId, thumbnail: thumb, track: firstSong }] as const;
              } catch {
                return null;
              }
            })
          );
          let changed = false;
          const nextMap = { ...cachedMap };
          entries.forEach((entry) => {
            if (entry) {
              nextMap[entry[0]] = entry[1];
              changed = true;
            }
          });
          if (changed) {
            await setApiCacheEntry(ARTIST_CACHE_KEY, nextMap, 12 * 60 * 60 * 1000);
          }
        }
      } catch {}
    })();

    // 5. If a track was restored from previous session, warm its lyrics/timestamps/related/MV Canvas
    const track = options?.currentTrack;
    if (track && track.id && !track.isLocal) {
      this.getLyrics(track.id, track.title, track.artist, track.durationSeconds).catch(() => {});
      this.getTrackTimestamps(track.id, track.title, track.artist, track.durationSeconds).catch(() => {});
      this.getRelated(track.id).catch(() => {});
      this.getMvCanvas(track.id, track.title, track.artist).catch(() => {});
    }
  },

  async importPlaylist(url: string): Promise<{
    title: string;
    author: string;
    thumbnail: string;
    tracks: Track[];
    source: string;
  }> {
    const res = await fetch('/api/music/playlist/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'プレイリストのインポートに失敗しました');
    }
    return res.json();
  },

  async searchLyrics(query: string): Promise<any[]> {
    const res = await fetch(`/api/music/lyrics/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  },

  async getImageBase64(url: string): Promise<string> {
    const base64 = await toBase64Image(url);
    return base64 || url;
  },

  async getStats(): Promise<{ totalAccessCount: number; totalAccountsCount: number; onlineCount: number }> {
    try {
      const res = await fetch('/api/stats');
      if (!res.ok) return { totalAccessCount: 1, totalAccountsCount: 0, onlineCount: 1 };
      return res.json();
    } catch {
      return { totalAccessCount: 1, totalAccountsCount: 0, onlineCount: 1 };
    }
  },

  async recordVisit(): Promise<{ totalAccessCount: number; totalAccountsCount: number; onlineCount: number }> {
    try {
      const res = await fetch('/api/stats/visit', { method: 'POST' });
      if (!res.ok) return { totalAccessCount: 1, totalAccountsCount: 0, onlineCount: 1 };
      return res.json();
    } catch {
      return { totalAccessCount: 1, totalAccountsCount: 0, onlineCount: 1 };
    }
  },

  // Real-time Presence API
  async sendPresenceHeartbeat(sessionId: string, username?: string): Promise<{ onlineCount: number; sessionId: string }> {
    try {
      const res = await fetch('/api/presence/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, username }),
      });
      if (!res.ok) return { onlineCount: 1, sessionId };
      return res.json();
    } catch {
      return { onlineCount: 1, sessionId };
    }
  },

  sendPresenceLeave(sessionId: string) {
    try {
      const payload = JSON.stringify({ sessionId });
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon('/api/presence/leave', blob);
      } else {
        fetch('/api/presence/leave', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {}
  },

  async getOnlinePresence(): Promise<{ onlineCount: number; activeSessions: any[] }> {
    try {
      const res = await fetch('/api/presence/online');
      if (!res.ok) return { onlineCount: 1, activeSessions: [] };
      return res.json();
    } catch {
      return { onlineCount: 1, activeSessions: [] };
    }
  },

  async getAccountProfile(username: string) {
    const res = await fetch(`/api/account/profile?username=${encodeURIComponent(username)}`);
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      const err: any = new Error(payload.error || 'Failed to fetch profile');
      if (payload.banned || res.status === 403) err.banned = true;
      if (payload.deleted || res.status === 404) err.deleted = true;
      throw err;
    }
    return res.json();
  },

  async registerAccount(data: {
    username: string;
    password: string;
    email?: string;
    playlists?: any[];
    library?: SyncedAccountLibrary;
  }) {
    const res = await fetch('/api/account/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '登録に失敗しました');
    }
    return res.json();
  },

  async loginAccount(data: { identifier: string; password: string }) {
    const res = await fetch('/api/account/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'ログインに失敗しました');
    }
    const json = await res.json();
    if (json?.adminToken && typeof json.adminToken === 'string') {
      adminSessionToken = json.adminToken;
    }
    return json;
  },

  async syncAccountPlaylists(username: string, playlists: any[]) {
    const res = await fetch('/api/account/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, playlists }),
    });
    return res.json();
  },

  async syncAccountLibrary(username: string, library: SyncedAccountLibrary) {
    const res = await fetch('/api/account/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, playlists: library.playlists, library }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      const err: any = new Error(payload.error || 'ライブラリ同期に失敗しました');
      if (payload.banned || res.status === 403) err.banned = true;
      if (payload.deleted || res.status === 404) err.deleted = true;
      throw err;
    }
    return res.json();
  },

  async sendNotification(data: {
    username?: string;
    email?: string;
    subject?: string;
    body?: string;
    type?: string;
  }) {
    const res = await fetch('/api/account/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '通知送信に失敗しました');
    }
    return res.json();
  },

  async getAccountNotifications(query: string) {
    const res = await fetch(`/api/account/notifications?username=${encodeURIComponent(query)}`);
    if (!res.ok) return { notifications: [] };
    return res.json();
  },

  // Admin Master API methods (Bearer token held strictly in memory)
  setOnAdminAuthExpired(cb: (() => void) | null) {
    onAdminAuthExpiredCb = cb;
  },

  clearAdminSession() {
    const token = adminSessionToken;
    adminSessionToken = null;
    if (token) {
      fetch('/api/admin/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  },

  hasAdminSession(): boolean {
    return Boolean(adminSessionToken);
  },

  async adminLogin(password: string) {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '管理者パスワードが正しくありません');
    }
    const json = await res.json();
    if (json?.token && typeof json.token === 'string') {
      adminSessionToken = json.token;
    }
    return json;
  },

  async getAdminOverview() {
    const res = await adminFetch('/api/admin/overview');
    if (!res.ok) throw new Error('管理者情報の取得に失敗しました');
    return res.json();
  },

  async deleteUser(username: string) {
    const res = await adminFetch('/api/admin/users/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'ユーザー削除に失敗しました');
    }
    return res.json();
  },

  async resetUserPassword(username: string, newPassword: string) {
    const res = await adminFetch('/api/admin/users/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, newPassword }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'パスワードリセットに失敗しました');
    }
    return res.json();
  },

  // Telemetry & Real Usage Analytics
  async recordPlaybackTelemetry(data: {
    videoId: string;
    title?: string;
    artist?: string;
    thumbnail?: string;
    durationSeconds?: number;
  }) {
    fetch('/api/telemetry/playback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).catch(() => {});
  },

  async recordSearchTelemetry(query: string) {
    fetch('/api/telemetry/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    }).catch(() => {});
  },

  async recordLyricsTelemetry(data: { isSynced: boolean; isAvailable: boolean }) {
    fetch('/api/telemetry/lyrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).catch(() => {});
  },

  async recordErrorTelemetry(data: { videoId?: string; title?: string; error: string }) {
    fetch('/api/telemetry/error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).catch(() => {});
  },

  async setTrackOffset(data: { videoId: string; offsetSec: number; title?: string; remove?: boolean }) {
    const res = await adminFetch('/api/admin/track-offset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'オフセット設定に失敗しました');
    }
    return res.json();
  },

  async getTrackOffsets() {
    const res = await fetch('/api/track-offsets');
    if (!res.ok) return { trackOffsets: {} };
    return res.json();
  },

  async broadcastNotification(subject: string, body: string) {
    const res = await adminFetch('/api/admin/broadcast-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, body }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '一斉配信に失敗しました');
    }
    return res.json();
  },

  async clearLyricsCache() {
    const res = await adminFetch('/api/admin/cache/clear', { method: 'POST' });
    if (!res.ok) throw new Error('キャッシュ消去に失敗しました');
    return res.json();
  },

  async getTrack(videoId: string): Promise<{ track: Track }> {
    const res = await fetch(`/api/music/track/${videoId}`);
    if (!res.ok) throw new Error('楽曲の取得に失敗しました');
    return res.json();
  },

  async sharePlaylist(payload: { name: string; author?: string; tracks: Track[] }) {
    const res = await fetch('/api/share/playlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'プレイリストの共有に失敗しました');
    }
    return res.json();
  },

  async getSharedPlaylist(shareId: string): Promise<{
    playlist: {
      id: string;
      name: string;
      author?: string;
      tracks: Track[];
      createdAt: string;
      viewCount: number;
    };
  }> {
    const res = await fetch(`/api/share/playlist/${shareId}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '共有プレイリストが見つかりません');
    }
    return res.json();
  },

  async getRecentSharedPlaylists() {
    const res = await fetch('/api/share/recent');
    if (!res.ok) return { playlists: [] };
    return res.json();
  },

  // --- Track Comments & Danmaku ---
  async getComments(videoId: string) {
    const res = await fetch(`/api/comments/${videoId}`);
    if (!res.ok) return { comments: [] };
    return res.json();
  },

  async postComment(
    videoId: string,
    payload: {
      text: string;
      timestampSec: number;
      formattedTime: string;
      username: string;
      color?: string;
      trackTitle?: string;
    }
  ) {
    const res = await fetch(`/api/comments/${videoId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'コメントの投稿に失敗しました');
    }
    return res.json();
  },

  async likeComment(videoId: string, commentId: string, username: string) {
    const res = await fetch(`/api/comments/${videoId}/${commentId}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    if (!res.ok) throw new Error('いいねに失敗しました');
    return res.json();
  },

  async deleteComment(videoId: string, commentId: string, username: string, _isAdmin?: boolean) {
    const res = await fetch(`/api/comments/${videoId}/${commentId}`, {
      method: 'DELETE',
      headers: buildAdminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ username }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'コメント削除に失敗しました');
    }
    return res.json();
  },

  // --- Direct Messaging (DM) ---
  async getConversations(username: string) {
    const res = await fetch(`/api/dm/conversations?username=${encodeURIComponent(username)}`);
    if (!res.ok) return { conversations: [] };
    return res.json();
  },

  async getMessages(user1: string, user2: string) {
    const res = await fetch(
      `/api/dm/messages?user1=${encodeURIComponent(user1)}&user2=${encodeURIComponent(user2)}`
    );
    if (!res.ok) return { messages: [] };
    return res.json();
  },

  async sendDirectMessage(payload: {
    sender: string;
    recipient: string;
    content?: string;
    trackCard?: any;
    playlistCard?: any;
  }) {
    const res = await fetch('/api/dm/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'メッセージの送信に失敗しました');
    }
    return res.json();
  },

  async reactDirectMessage(messageId: string, emoji: string, username: string) {
    const res = await fetch('/api/dm/react', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId, emoji, username }),
    });
    return res.json();
  },

  async markDirectMessageRead(conversationId: string, reader: string, sender?: string) {
    const res = await fetch('/api/dm/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, reader, sender }),
    });
    return res.json();
  },

  // --- Listening Party & Lounges ---
  async getPartyRooms() {
    const res = await fetch('/api/party/rooms');
    if (!res.ok) return { rooms: [] };
    return res.json();
  },

  async createPartyRoom(payload: {
    name: string;
    description?: string;
    category?: string;
    hostUsername: string;
    initialTrack?: any;
  }) {
    const res = await fetch('/api/party/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'ルーム作成に失敗しました');
    }
    return res.json();
  },

  async getPartyRoom(roomId: string) {
    const res = await fetch(`/api/party/room/${roomId}`);
    if (!res.ok) throw new Error('ルームが見つかりません');
    return res.json();
  },

  // --- Social Notifications & Activity Feed ---
  async getSocialNotifications(username: string) {
    const res = await fetch(`/api/social/notifications?username=${encodeURIComponent(username)}`);
    if (!res.ok) return { notifications: [], unreadCount: 0 };
    return res.json();
  },

  async markSocialNotificationsRead(username: string) {
    const res = await fetch('/api/social/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    return res.json();
  },

  async getActivityFeed() {
    const res = await fetch('/api/social/feed');
    if (!res.ok) return { feed: [] };
    return res.json();
  },

  async getSocialUsers() {
    const res = await fetch('/api/social/users');
    if (!res.ok) return { users: [] };
    return res.json();
  },

  async followUser(follower: string, targetUser: string) {
    const res = await fetch('/api/social/follow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ follower, targetUser }),
    });
    return res.json();
  },

  async blockUser(user: string, targetUser: string) {
    const res = await fetch('/api/social/block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, targetUser }),
    });
    return res.json();
  },

  async unblockUser(user: string, targetUser: string) {
    const res = await fetch('/api/social/unblock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, targetUser }),
    });
    return res.json();
  },

  async sendModerationReport(payload: {
    reporter: string;
    reportedUser: string;
    targetType: string;
    targetId: string;
    reason: string;
    contentSnippet?: string;
  }) {
    const res = await fetch('/api/social/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('通報の送信に失敗しました');
    return res.json();
  },

  // --- Admin Moderation & Community Control ---
  async getModerationOverview() {
    const res = await adminFetch('/api/admin/moderation/overview');
    if (!res.ok) throw new Error('モデレーション情報の取得に失敗しました');
    return res.json();
  },

  async resolveModerationReport(reportId: string, status: 'resolved' | 'dismissed') {
    const res = await adminFetch('/api/admin/moderation/resolve-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId, status }),
    });
    if (!res.ok) throw new Error('通報の更新に失敗しました');
    return res.json();
  },

  async toggleBanUser(username: string) {
    const res = await adminFetch('/api/admin/moderation/toggle-ban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    if (!res.ok) throw new Error('アカウント状態の更新に失敗しました');
    return res.json();
  },

  // --- Admin All Direct Messages Inspection (全ユーザー間DM監視・監査) ---
  async getAdminAllDms() {
    const res = await adminFetch('/api/admin/dm/all');
    if (!res.ok) throw new Error('DMログの取得に失敗しました');
    return res.json();
  },

  async deleteAdminDmMessage(messageId: string) {
    const res = await adminFetch(`/api/admin/dm/message/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'メッセージの削除に失敗しました');
    }
    return res.json();
  },

  // --- Admin Shared Offline Management ---
  async getAdminSharedOfflineTracks() {
    const res = await adminFetch('/api/admin/shared-offline');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '共有オフライン一覧の取得に失敗しました');
    }
    return res.json();
  },

  async deleteAdminSharedOfflineTrack(trackId: string) {
    const res = await adminFetch(`/api/admin/shared-offline/${encodeURIComponent(trackId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '共有オフライン曲の削除に失敗しました');
    }
    return res.json();
  },

  // --- Site Settings, Feature Gates & Push Broadcasts ---
  async getSiteSettings(): Promise<{ settings: SiteSettings }> {
    const res = await fetch('/api/site-settings');
    if (!res.ok) throw new Error('サイト設定の取得に失敗しました');
    return res.json();
  },

  async getAdminSiteSettings(): Promise<{ settings: SiteSettings }> {
    const res = await adminFetch('/api/admin/site-settings');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '管理者設定の取得に失敗しました');
    }
    return res.json();
  },

  async updateAdminSiteSettings(payload: {
    announcement?: Partial<SiteSettings['announcement']>;
    allowNewRegistrations?: boolean;
    sharedOfflineUploadEnabled?: boolean;
    commentsEnabled?: boolean;
    dmsEnabled?: boolean;
  }): Promise<{ success: boolean; settings: SiteSettings; message: string }> {
    const res = await adminFetch('/api/admin/site-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '設定の保存に失敗しました');
    }
    return res.json();
  },

  async sendAdminPushToast(
    message: string,
    toastType: 'info' | 'warning' | 'success' = 'info'
  ): Promise<{ success: boolean; onlineCount: number; message: string }> {
    const res = await adminFetch('/api/admin/push-toast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, toastType }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'リアルタイム通知の送信に失敗しました');
    }
    return res.json();
  },

  // --- Admin Custom NG Words ---
  async addAdminNgWord(word: string): Promise<{
    success: boolean;
    ngWords: string[];
    customNgWords: string[];
    message: string;
  }> {
    const res = await adminFetch('/api/admin/moderation/ng-words', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'NGワードの追加に失敗しました');
    }
    return res.json();
  },

  async removeAdminNgWord(word: string): Promise<{
    success: boolean;
    ngWords: string[];
    customNgWords: string[];
    message: string;
  }> {
    const res = await adminFetch(`/api/admin/moderation/ng-words?word=${encodeURIComponent(word)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'NGワードの削除に失敗しました');
    }
    return res.json();
  },

  // --- Admin Content Overview (Listening Rooms, Shared Playlists, Collab Playlists) ---
  async getAdminContentOverview(): Promise<{
    rooms: Array<{
      id: string;
      name: string;
      description?: string;
      category?: string;
      hostUsername: string;
      isPlaying: boolean;
      currentTrack: { title?: string; artist?: string } | null;
      participantCount: number;
      chatCount: number;
      queueCount: number;
    }>;
    sharedPlaylists: Array<{
      id: string;
      name: string;
      author: string;
      trackCount: number;
      createdAt: string;
      views: number;
    }>;
    collabPlaylists: Array<{
      code: string;
      name: string;
      owner: string;
      trackCount: number;
      memberCount: number;
      createdAt: string;
      updatedAt: string;
    }>;
  }> {
    const res = await adminFetch('/api/admin/content/overview');
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'コンテンツ管理一覧の取得に失敗しました');
    }
    return res.json();
  },

  async clearAdminRoomChat(roomId: string) {
    const res = await adminFetch(`/api/admin/rooms/${encodeURIComponent(roomId)}/clear-chat`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'チャットの消去に失敗しました');
    }
    return res.json();
  },

  async deleteAdminRoom(roomId: string) {
    const res = await adminFetch(`/api/admin/rooms/${encodeURIComponent(roomId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'ルームの削除に失敗しました');
    }
    return res.json();
  },

  async deleteAdminSharedPlaylist(id: string) {
    const res = await adminFetch(`/api/admin/shared-playlists/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '共有プレイリストの削除に失敗しました');
    }
    return res.json();
  },

  async deleteAdminCollabPlaylist(code: string) {
    const res = await adminFetch(`/api/admin/collab-playlists/${encodeURIComponent(code)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'コラボプレイリストの削除に失敗しました');
    }
    return res.json();
  },

  // --- Admin Maintenance & Security Session Tools ---
  async clearAdminKvCache() {
    const res = await adminFetch('/api/admin/cache/clear-kv', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'InnerTubeキャッシュの消去に失敗しました');
    }
    return res.json();
  },

  async clearAdminPlaybackErrors() {
    const res = await adminFetch('/api/admin/logs/clear-errors', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'エラーログの消去に失敗しました');
    }
    return res.json();
  },

  async clearAdminApiLogs() {
    const res = await adminFetch('/api/admin/logs/clear-api', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'APIログの消去に失敗しました');
    }
    return res.json();
  },

  async revokeOtherAdminSessions() {
    const res = await adminFetch('/api/admin/sessions/revoke-others', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '他セッションの無効化に失敗しました');
    }
    return res.json();
  },

  // --- Audio Stream Info (Lossless / Hi-Res / DSP) ---
  async getAudioStreamInfo(videoId: string, quality: AudioQualityMode = 'high'): Promise<{
    available: boolean;
    codec?: string;
    bitrateKbps?: number;
    sampleRateHz?: number;
    mimeType?: string;
    sourceLabel?: string;
  }> {
    try {
      const res = await fetch(
        `/api/music/audio-stream/info/${encodeURIComponent(videoId)}?quality=${encodeURIComponent(quality)}`
      );
      if (!res.ok) return { available: false };
      return res.json();
    } catch {
      return { available: false };
    }
  },

  async getAudioStreamCapability(): Promise<{ available: boolean; reason?: string }> {
    try {
      const res = await fetch('/api/music/audio-stream/capability');
      if (!res.ok) return { available: false };
      return res.json();
    } catch {
      return { available: false };
    }
  },

  // --- AI Playlist & AI Radio ---
  async generateAiPlaylist(payload: {
    prompt: string;
    mode?: 'playlist' | 'radio';
    trackCount?: number;
    seedTrack?: Track | null;
    contextArtists?: string[];
    likedTitles?: string[];
  }): Promise<{
    success: boolean;
    playlistTitle: string;
    description: string;
    moodTag: string;
    aiPowered: boolean;
    coverUrl: string;
    tracks: Track[];
  }> {
    const res = await fetch('/api/ai/playlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'AIプレイリストの生成に失敗しました');
    }
    return res.json();
  },

  // --- Podcasts (Audio RSS + YouTube Video Podcasts) ---
  async discoverPodcasts(): Promise<{ shows: PodcastShow[]; videoEpisodes: PodcastEpisode[] }> {
    const res = await fetch('/api/podcasts/discover');
    if (!res.ok) return { shows: [], videoEpisodes: [] };
    return res.json();
  },

  async searchPodcasts(q: string): Promise<{ shows: PodcastShow[]; videoEpisodes: PodcastEpisode[] }> {
    const res = await fetch(`/api/podcasts/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return { shows: [], videoEpisodes: [] };
    return res.json();
  },

  async getPodcastShow(show: PodcastShow): Promise<{ show: PodcastShow; episodes: PodcastEpisode[] }> {
    const params = new URLSearchParams({
      feedUrl: show.feedUrl || '',
      showId: show.id,
      title: show.title,
      author: show.author,
      thumbnail: show.thumbnail,
    });
    const res = await fetch(`/api/podcasts/show?${params.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'エピソードの取得に失敗しました');
    }
    return res.json();
  },

  // --- Zero Connect (Cross-Device Remote Control) ---
  async registerConnectDevice(payload: {
    deviceId: string;
    name: string;
    deviceType: 'mobile' | 'pc' | 'tablet';
    username?: string;
    pairingCode: string;
    currentTrack?: Track | null;
    queue?: Track[];
    isPlaying?: boolean;
    positionSec?: number;
    durationSec?: number;
    volume?: number;
  }): Promise<{
    success: boolean;
    device: ConnectDeviceInfo;
    devices: ConnectDeviceInfo[];
    pendingCommands?: ConnectCommandPayload[];
  }> {
    const res = await fetch('/api/connect/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { success: false, device: payload as any, devices: [], pendingCommands: [] };
    return res.json();
  },

  async getConnectDevices(params: {
    username?: string;
    pairingCode?: string;
  }): Promise<{ devices: ConnectDeviceInfo[] }> {
    const qs = new URLSearchParams();
    if (params.username) qs.set('username', params.username);
    if (params.pairingCode) qs.set('pairingCode', params.pairingCode);
    const res = await fetch(`/api/connect/devices?${qs.toString()}`);
    if (!res.ok) return { devices: [] };
    return res.json();
  },

  async sendConnectCommand(payload: ConnectCommandPayload) {
    const res = await fetch('/api/connect/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('端末への操作送信に失敗しました');
    return res.json();
  },

  // --- Real-Time Collaborative Playlists & Friend Blend ---
  async getCollabPlaylist(code: string): Promise<{ success: boolean; playlist: CollabPlaylistRoom } | null> {
    const res = await fetch(`/api/collab/playlists/${encodeURIComponent(code)}`);
    if (!res.ok) return null;
    return res.json();
  },

  async mutateCollabPlaylist(
    code: string,
    payload: {
      action: 'create' | 'join' | 'rename' | 'add_track' | 'remove_track' | 'reorder' | 'sync_all';
      title?: string;
      description?: string;
      username?: string;
      track?: Track;
      trackId?: string;
      fromIndex?: number;
      toIndex?: number;
      seedTracks?: Track[];
      tracks?: Track[];
    }
  ): Promise<{ success: boolean; playlist: CollabPlaylistRoom }> {
    const res = await fetch(`/api/collab/playlists/${encodeURIComponent(code)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('共同プレイリストの同期に失敗しました');
    return res.json();
  },

  async createFriendBlend(payload: {
    userAName: string;
    userATracks: Track[];
    friendUsername?: string;
    userBName?: string;
  }): Promise<{
    success: boolean;
    blendTitle: string;
    userA: string;
    userB: string;
    tasteMatchPercent: number;
    sharedArtistsCount: number;
    friendFoundInCloud: boolean;
    tracks: Track[];
  }> {
    const res = await fetch('/api/blend/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Blendの作成に失敗しました');
    }
    return res.json();
  },

  async translateLyricsGuide(params: {
    videoId?: string;
    trackTitle?: string;
    artist?: string;
    lines: string[];
    targetLang: 'ja' | 'en' | 'ko' | 'zh';
    pronunciationMode: 'romaji' | 'furigana' | 'katakana';
  }): Promise<{
    lines: LyricsTranslationLine[];
    targetLang: string;
    pronunciationMode: string;
    fromCache?: boolean;
  }> {
    const res = await fetch('/api/lyrics/translate-guide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '歌詞翻訳・発音ガイドの取得に失敗しました');
    }
    return res.json();
  },

  getClassicalCatalog(params?: {
    era?: string;
    composer?: string;
    q?: string;
    gl?: CatalogRegion;
  }): Promise<{
    era: string;
    composers: ClassicalComposer[];
    activeComposer: ClassicalComposer | null;
    tracks: Track[];
    region: CatalogRegion;
    error?: string;
    fromCache?: boolean;
  }> {
    const era = params?.era || 'all';
    const composer = params?.composer || '';
    const q = (params?.q || '').trim();
    const gl = params?.gl || 'JP';
    const key = `classical:${gl}:${era}:${composer}:${q.toLowerCase()}`;
    return withApiMemo(
      key,
      PERSIST_CACHE_TTL_MS,
      async () => {
        const qs = new URLSearchParams();
        if (era) qs.set('era', era);
        if (composer) qs.set('composer', composer);
        if (q) qs.set('q', q);
        if (gl) qs.set('gl', gl);
        const res = await fetch(`/api/music/classical?${qs.toString()}`);
        if (!res.ok) throw new Error('クラシック楽曲の取得に失敗しました');
        return res.json();
      },
      { persist: true, shouldPersist: (d) => Array.isArray(d?.tracks) && d.tracks.length > 0 }
    );
  },

  searchByMoodBpm(params?: {
    mood?: string;
    bpmRange?: BpmRangePreset;
    minBpm?: number;
    maxBpm?: number;
    q?: string;
    gl?: CatalogRegion;
    forceRefresh?: boolean;
  }): Promise<{
    mood: string;
    moodLabel: string;
    bpmRange: BpmRangePreset;
    minBpm: number;
    maxBpm: number;
    region: CatalogRegion;
    tracks: Track[];
    fromCache?: boolean;
  }> {
    const mood = params?.mood || 'all';
    const bpmRange = params?.bpmRange || 'all';
    const minBpm = params?.minBpm || 0;
    const maxBpm = params?.maxBpm || 0;
    const q = (params?.q || '').trim();
    const gl = params?.gl || 'JP';
    const key = `mood-bpm:${gl}:${mood}:${bpmRange}:${minBpm}:${maxBpm}:${q.toLowerCase()}`;
    return withApiMemo(
      key,
      PERSIST_CACHE_TTL_MS,
      async () => {
        const qs = new URLSearchParams();
        if (mood) qs.set('mood', mood);
        if (bpmRange) qs.set('bpmRange', bpmRange);
        if (minBpm > 0) qs.set('minBpm', String(minBpm));
        if (maxBpm > 0) qs.set('maxBpm', String(maxBpm));
        if (q) qs.set('q', q);
        if (gl) qs.set('gl', gl);
        const res = await fetch(`/api/music/mood-bpm?${qs.toString()}`);
        if (!res.ok) throw new Error('BPM・ムード検索に失敗しました');
        return res.json();
      },
      {
        bypass: Boolean(params?.forceRefresh),
        persist: true,
        shouldPersist: (d) => Array.isArray(d?.tracks) && d.tracks.length > 0,
      }
    );
  },
};


