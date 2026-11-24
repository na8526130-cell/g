import React, { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { api } from '../services/api';
import { getApiCacheEntry, setApiCacheEntry } from '../services/apiCacheDb';
import { Track, Album, Artist, Playlist } from '../types/music';
import { SafeImage } from '../components/SafeImage';
import {
  Play,
  Plus,
  Heart,
  Loader2,
  Music,
  Tv,
  Disc,
  Users,
  ListMusic,
  Search,
  ListPlus,
  X,
  Clock,
  Sparkles,
  Guitar,
  Car,
  Flame,
  Moon,
  ArrowRightLeft,
  ListStart,
  Info,
  RefreshCw,
  Download,
  Globe,
  Activity,
  Music2,
  SlidersHorizontal,
  WifiOff,
  CheckCircle2,
  ArrowDownToLine,
} from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { getAllCachedSharedTracks, getAllOfflineTracks } from '../services/offlineStorage';
import {
  getSearchConversions,
  SearchConversionCandidate,
} from '../utils/searchConverter';
import { BpmRangePreset, CatalogRegion } from '../types/music';

type SearchFilterType = 'all' | 'song' | 'unofficial' | 'video' | 'album' | 'artist' | 'playlist';

const REGION_OPTIONS: { id: CatalogRegion; label: string; flag: string }[] = [
  { id: 'JP', label: '日本 (JP)', flag: '🇯🇵' },
  { id: 'US', label: '米国 (US)', flag: '🇺🇸' },
  { id: 'KR', label: '韓国 (KR)', flag: '🇰🇷' },
  { id: 'GB', label: '英国 (GB)', flag: '🇬🇧' },
  { id: 'GLOBAL', label: 'Global', flag: '🌍' },
];

const UNOFFICIAL_SUBCHIPS: { id: string; label: string; append: string }[] = [
  { id: 'utattemita', label: '歌ってみた', append: '歌ってみた' },
  { id: 'cover', label: 'カバー', append: 'cover' },
  { id: 'live', label: 'ライブ音源', append: 'live ライブ' },
  { id: 'acoustic', label: '弾き語り', append: '弾き語り' },
  { id: 'remix', label: 'Remix', append: 'remix' },
];

const BPM_PRESETS: { id: BpmRangePreset; label: string }[] = [
  { id: 'all', label: 'すべて' },
  { id: 'slow', label: 'Slow (<90)' },
  { id: 'mid', label: 'Mid (90-115)' },
  { id: 'upbeat', label: 'Upbeat (116-135)' },
  { id: 'fast', label: 'Fast (136+)' },
];

const MOOD_PRESETS: { id: string; label: string }[] = [
  { id: 'all', label: 'すべてのムード' },
  { id: 'energy', label: 'テンションUP' },
  { id: 'drive', label: 'ドライブ' },
  { id: 'relax', label: 'チル・リラックス' },
  { id: 'focus', label: '集中・作業用' },
  { id: 'emotional', label: 'エモい・夜' },
  { id: 'sad', label: '切ない・バラード' },
  { id: 'happy', label: '元気・ポジティブ' },
];

const GENRE_COVERS_CACHE_KEY = 'yt_music_genre_covers_v1';

interface BrowseCategory {
  id: string;
  title: string;
  query: string;
  color: string;
  defaultCover?: string;
  icon: React.ElementType;
}

const BROWSE_CATEGORIES: BrowseCategory[] = [
  {
    id: 'jpop',
    title: '音楽・J-Pop',
    query: 'J-Pop ヒット曲',
    color: 'bg-[#dc148c]',
    defaultCover: '/assets/images/genre_tokyo_nightpop_1793266768910.jpg',
    icon: Music,
  },
  {
    id: 'new-releases',
    title: 'ニューリリース',
    query: '最新曲 J-Pop 2026',
    color: 'bg-[#608108]',
    defaultCover: '/assets/images/hero_ytmusic_curated_1793266769181.jpg',
    icon: Sparkles,
  },
  {
    id: 'ballad',
    title: 'バラード・切ない',
    query: 'back number 水平線',
    color: 'bg-[#b02897]',
    icon: Heart,
  },
  {
    id: 'rock',
    title: 'ロック・バンド',
    query: 'Vaundy 怪獣の花唄',
    color: 'bg-[#1e3264]',
    icon: Guitar,
  },
  {
    id: 'chill',
    title: 'チル・深夜',
    query: '夜 チル 邦楽 Lo-Fi',
    color: 'bg-[#006450]',
    defaultCover: '/assets/images/genre_cyber_lofi_1793266769512.jpg',
    icon: Moon,
  },
  {
    id: 'anime',
    title: 'アニメ・ボカロ',
    query: 'YOASOBI アイドル',
    color: 'bg-[#8400e7]',
    icon: Tv,
  },
  {
    id: 'drive',
    title: 'ドライブ・爽快',
    query: 'Mrs. GREEN APPLE ライラック',
    color: 'bg-[#bc5900]',
    icon: Car,
  },
  {
    id: 'kpop',
    title: 'K-Pop',
    query: 'ILLIT Magnetic K-Pop',
    color: 'bg-[#e8115b]',
    icon: Flame,
  },
];

export const SearchView: React.FC = () => {
  const {
    searchQuery,
    setSearchQuery,
    recentSearches,
    addRecentSearch,
    removeRecentSearch,
    clearRecentSearches,
    playTrack,
    addToQueue,
    playNext,
    toggleLikeTrack,
    likedTrackIds,
    likedAlbumIds,
    toggleLikeAlbum,
    likedPlaylistIds,
    toggleLikePlaylist,
    navigateTo,
    currentTrack,
    openAddToPlaylistModal,
    openTrackDetailModal,
    openFreemakeModal,
    isTrackBlocked,
    showToast,
    catalogRegion,
    setCatalogRegion,
    setClassicalModalOpen,
    likedTracks,
    recentTracks,
    userPlaylists,
    cachedOfflineTracks,
    cachedOfflineIds,
    downloadingOfflineIds,
    downloadTrackOffline,
    removeTrackOfflineCache,
  } = usePlayer();

  const isOnline = useOnlineStatus();
  const [offlineLocalMatchesBanner, setOfflineLocalMatchesBanner] = useState(false);

  const [inputVal, setInputVal] = useState(searchQuery);
  const [provider, setProvider] = useState<'innertube' | 'spotify'>('innertube');
  const [filter, setFilter] = useState<SearchFilterType>('all');
  const [loading, setLoading] = useState(false);
  const [resultsAll, setResultsAll] = useState<{
    songs: Track[];
    artists: Artist[];
    albums: Album[];
    playlists: Playlist[];
    videos: Track[];
  }>({ songs: [], artists: [], albums: [], playlists: [], videos: [] });
  const [resultsFiltered, setResultsFiltered] = useState<any[]>([]);
  const [spotifyTracks, setSpotifyTracks] = useState<Track[]>([]);
  const [matchedAlias, setMatchedAlias] = useState<string | null>(null);
  const [effectiveQuery, setEffectiveQuery] = useState<string | null>(null);
  const [rawMode, setRawMode] = useState(false);
  const [isSuggestOpen, setIsSuggestOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [localConversions, setLocalConversions] = useState<SearchConversionCandidate[]>([]);
  const [genreCovers, setGenreCovers] = useState<Record<string, string>>({});
  const [genreCoversLoaded, setGenreCoversLoaded] = useState(false);
  const [refreshSeq, setRefreshSeq] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [resultFromCache, setResultFromCache] = useState(false);
  const forceRefreshPendingRef = useRef(false);

  // BPM & Mood inline filter panel state
  const [bpmPanelOpen, setBpmPanelOpen] = useState(false);
  const [bpmMood, setBpmMood] = useState<string>('all');
  const [bpmRange, setBpmRange] = useState<BpmRangePreset>('upbeat');
  const [customMinBpm, setCustomMinBpm] = useState<string>('');
  const [customMaxBpm, setCustomMaxBpm] = useState<string>('');
  const [bpmResults, setBpmResults] = useState<Track[] | null>(null);
  const [bpmLoading, setBpmLoading] = useState(false);

  useEffect(() => {
    setInputVal(searchQuery);
  }, [searchQuery]);

  // Load genre cover cache from IndexedDB (migrating and cleaning legacy localStorage key)
  useEffect(() => {
    let active = true;
    (async () => {
      let initialCovers = (await getApiCacheEntry<Record<string, string>>(GENRE_COVERS_CACHE_KEY)) || {};
      try {
        const legacyRaw = localStorage.getItem(GENRE_COVERS_CACHE_KEY);
        if (legacyRaw) {
          const parsed = JSON.parse(legacyRaw);
          if (!Object.keys(initialCovers).length && parsed?.data && parsed?.ts && Date.now() - parsed.ts < 12 * 60 * 60 * 1000) {
            initialCovers = parsed.data;
            await setApiCacheEntry(GENRE_COVERS_CACHE_KEY, initialCovers, 12 * 60 * 60 * 1000);
          }
          localStorage.removeItem(GENRE_COVERS_CACHE_KEY);
        }
      } catch {}
      if (active) {
        if (Object.keys(initialCovers).length > 0) {
          setGenreCovers(initialCovers);
        }
        setGenreCoversLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Instant local conversions + debounced InnerTube autocomplete suggestions
  useEffect(() => {
    const clean = inputVal.trim();
    if (!clean) {
      setLocalConversions([]);
      setSuggestions([]);
      return;
    }

    setLocalConversions(getSearchConversions(clean));

    const timer = setTimeout(async () => {
      try {
        const res = await api.getSuggestionsWithConversions(clean);
        setSuggestions(res.suggestions || []);
        if (res.conversions && res.conversions.length > 0) {
          setLocalConversions(res.conversions);
        }
      } catch {}
    }, 180);

    return () => clearTimeout(timer);
  }, [inputVal]);

  // Fetch genuine thumbnails for genre cards that don't have local bespoke art
  useEffect(() => {
    if (!genreCoversLoaded) return;
    const missing = BROWSE_CATEGORIES.filter((c) => !c.defaultCover && !genreCovers[c.id]);
    if (missing.length === 0) return;

    let active = true;
    Promise.all(
      missing.map(async (cat) => {
        try {
          const res = await api.search(cat.query, 'song');
          const thumb = res?.results?.[0]?.thumbnail || res?.songs?.[0]?.thumbnail;
          return thumb ? [cat.id, thumb] : null;
        } catch {
          return null;
        }
      })
    ).then((entries) => {
      if (!active) return;
      const next: Record<string, string> = { ...genreCovers };
      let changed = false;
      entries.forEach((pair) => {
        if (pair && pair[1]) {
          next[pair[0]] = pair[1];
          changed = true;
        }
      });
      if (changed) {
        setGenreCovers(next);
        setApiCacheEntry(GENRE_COVERS_CACHE_KEY, next, 12 * 60 * 60 * 1000).catch(() => {});
      }
    });

    return () => {
      active = false;
    };
  }, [genreCoversLoaded, genreCovers]);

  // InnerTube search (with offline local search fallback)
  useEffect(() => {
    if (!searchQuery.trim() || provider !== 'innertube') return;
    let active = true;
    const shouldForce = forceRefreshPendingRef.current;
    forceRefreshPendingRef.current = false;
    setLoading(true);
    setOfflineLocalMatchesBanner(false);
    if (shouldForce) setIsRefreshing(true);

    const runLocalOfflineSearch = async (): Promise<Track[]> => {
      const qLower = searchQuery.trim().toLowerCase();
      const [loc, sh] = await Promise.all([
        getAllOfflineTracks().catch(() => [] as Track[]),
        getAllCachedSharedTracks().catch(() => [] as Track[]),
      ]);
      const playlistTracks = userPlaylists.flatMap((p) => p.tracks || []);
      const pool = [
        ...cachedOfflineTracks,
        ...loc,
        ...sh,
        ...likedTracks,
        ...recentTracks,
        ...playlistTracks,
      ];
      const seen = new Set<string>();
      const matched: Track[] = [];
      for (const tr of pool) {
        if (!tr?.id || seen.has(tr.id)) continue;
        seen.add(tr.id);
        const hay = `${tr.title} ${tr.artist} ${tr.album || ''}`.toLowerCase();
        if (hay.includes(qLower)) {
          matched.push(tr);
        }
      }
      return matched;
    };

    api
      .search(searchQuery, filter, rawMode, shouldForce, catalogRegion)
      .then(async (res) => {
        if (!active) return;
        const hasAny =
          (res.songs?.length || 0) +
            (res.artists?.length || 0) +
            (res.albums?.length || 0) +
            (res.playlists?.length || 0) +
            (res.videos?.length || 0) +
            (res.results?.length || 0) >
          0;
        if (!isOnline && !hasAny) {
          const localMatches = await runLocalOfflineSearch();
          if (!active) return;
          if (filter === 'all') {
            setResultsAll({ songs: localMatches, artists: [], albums: [], playlists: [], videos: [] });
          } else {
            setResultsFiltered(localMatches);
          }
          setOfflineLocalMatchesBanner(true);
        } else if (filter === 'all') {
          setResultsAll({
            songs: res.songs || [],
            artists: res.artists || [],
            albums: res.albums || [],
            playlists: res.playlists || [],
            videos: res.videos || [],
          });
        } else {
          setResultsFiltered(res.results || []);
        }
        setMatchedAlias(res.matchedAlias || null);
        setEffectiveQuery(res.effectiveQuery || null);
        setResultFromCache(Boolean(res.fromCache));
        setLoading(false);
        setIsRefreshing(false);
        if (shouldForce) {
          showToast('最新の検索結果を再取得しました');
        }
      })
      .catch(async (err) => {
        console.error('Search error:', err);
        if (!active) return;
        if (!isOnline) {
          const localMatches = await runLocalOfflineSearch();
          if (!active) return;
          if (filter === 'all') {
            setResultsAll({ songs: localMatches, artists: [], albums: [], playlists: [], videos: [] });
          } else {
            setResultsFiltered(localMatches);
          }
          setOfflineLocalMatchesBanner(true);
        }
        if (active) {
          setLoading(false);
          setIsRefreshing(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    searchQuery,
    filter,
    provider,
    rawMode,
    refreshSeq,
    catalogRegion,
    showToast,
    isOnline,
    cachedOfflineTracks,
    likedTracks,
    recentTracks,
    userPlaylists,
  ]);

  // Spotify search
  useEffect(() => {
    if (!searchQuery.trim() || provider !== 'spotify') return;
    let active = true;
    const shouldForce = forceRefreshPendingRef.current;
    forceRefreshPendingRef.current = false;
    setLoading(true);
    if (shouldForce) setIsRefreshing(true);

    api
      .searchSpotify(searchQuery, rawMode, shouldForce, catalogRegion)
      .then((res) => {
        if (!active) return;
        setSpotifyTracks(res.tracks || []);
        setMatchedAlias(res.matchedAlias || null);
        setEffectiveQuery(res.effectiveQuery || null);
        setResultFromCache(Boolean(res.fromCache));
        setLoading(false);
        setIsRefreshing(false);
        if (shouldForce) {
          showToast('最新の検索結果を再取得しました');
        }
      })
      .catch((err) => {
        console.error('Spotify search error:', err);
        if (active) {
          setLoading(false);
          setIsRefreshing(false);
        }
      });

    return () => {
      active = false;
    };
  }, [searchQuery, provider, rawMode, refreshSeq, catalogRegion, showToast]);

  const handleForceRefresh = () => {
    const clean = (searchQuery || inputVal).trim();
    if (!clean || isRefreshing) return;
    forceRefreshPendingRef.current = true;
    setRefreshSeq((n) => n + 1);
    api.getSuggestionsWithConversions(clean, true).then((res) => {
      setSuggestions(res.suggestions || []);
      if (res.conversions && res.conversions.length > 0) {
        setLocalConversions(res.conversions);
      }
    }).catch(() => {});
  };

  const executeSearch = (q: string, useRaw = false) => {
    const clean = q.trim();
    if (!clean) return;
    const isSameQuery =
      clean.toLowerCase() === searchQuery.trim().toLowerCase() && useRaw === rawMode;
    setRawMode(useRaw);
    setIsSuggestOpen(false);
    setInputVal(clean);
    if (isSameQuery) {
      forceRefreshPendingRef.current = true;
      setRefreshSeq((n) => n + 1);
      api.getSuggestionsWithConversions(clean, true).catch(() => {});
    } else {
      setSearchQuery(clean);
    }
    addRecentSearch(clean);
    api.recordSearchTelemetry(clean);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(inputVal, false);
  };

  const handleRunMoodBpmSearch = async (forceRefresh = false) => {
    setBpmLoading(true);
    try {
      const minBpm = parseInt(customMinBpm, 10) || undefined;
      const maxBpm = parseInt(customMaxBpm, 10) || undefined;
      const res = await api.searchByMoodBpm({
        mood: bpmMood,
        bpmRange: minBpm || maxBpm ? 'all' : bpmRange,
        minBpm,
        maxBpm,
        q: inputVal.trim() || searchQuery.trim() || undefined,
        gl: catalogRegion,
        forceRefresh,
      });
      setBpmResults(res.tracks || []);
    } catch {
      showToast('BPM・ムード検索に失敗しました', 'warning', 2200);
    } finally {
      setBpmLoading(false);
    }
  };

  const filterOptions: { id: SearchFilterType; label: string }[] = [
    { id: 'all', label: 'すべて' },
    { id: 'song', label: '楽曲' },
    { id: 'unofficial', label: '歌ってみた・ライブ' },
    { id: 'artist', label: 'アーティスト' },
    { id: 'album', label: 'アルバム' },
    { id: 'playlist', label: 'プレイリスト' },
    { id: 'video', label: '動画' },
  ];

  const hasQuery = searchQuery.trim().length > 0;

  return (
    <div className="space-y-6 pb-24">
      {/* Spotify-style Search Header & White Input Bar (IMG_0222, IMG_0223) */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">検索</h1>
            <button
              type="button"
              onClick={() => setBpmPanelOpen((v) => !v)}
              className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 transition-colors cursor-pointer ${
                bpmPanelOpen || bpmResults !== null
                  ? 'bg-red-600/20 border-red-500/50 text-red-300'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:text-white'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-red-400" />
              <span>BPM・ムード</span>
            </button>
            <button
              type="button"
              onClick={() => setClassicalModalOpen(true)}
              className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-200 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Music2 className="w-3.5 h-3.5 text-amber-400" />
              <span>クラシック専門館</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Catalog Region Selector (Overseas / Non-resident region switch) */}
            <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 rounded-full px-2 py-1">
              <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0 ml-1" />
              <select
                value={catalogRegion}
                onChange={(e) => {
                  const nextGl = e.target.value as CatalogRegion;
                  setCatalogRegion(nextGl);
                  showToast(`カタログ地域を ${nextGl} に切り替えました（海外利用モード）`, 'info', 2200);
                }}
                className="bg-transparent text-xs font-bold text-neutral-200 focus:outline-none pr-1 cursor-pointer"
                aria-label="海外・地域カタログ切替"
              >
                {REGION_OPTIONS.map((r) => (
                  <option key={r.id} value={r.id} className="bg-neutral-900 text-white">
                    {r.flag} {r.label}
                  </option>
                ))}
              </select>
            </div>

            {hasQuery && (
              <>
                <button
                  type="button"
                  onClick={handleForceRefresh}
                  disabled={loading || isRefreshing}
                  title="キャッシュを使わず最新の検索結果を即時再取得"
                  className="px-3 py-1.5 rounded-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/80 hover:border-red-500/50 text-xs font-bold text-neutral-200 hover:text-white flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-red-400' : ''}`} />
                  <span>再取得</span>
                  {resultFromCache && !isRefreshing && (
                    <span className="text-[10px] font-normal text-neutral-400 hidden sm:inline">
                      (キャッシュ)
                    </span>
                  )}
                </button>
                <div className="flex items-center gap-1 p-1 bg-neutral-900 rounded-full">
                  <button
                    type="button"
                    onClick={() => setProvider('innertube')}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                      provider === 'innertube' ? 'bg-red-600 text-white' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    YouTube Music
                  </button>
                  <button
                    type="button"
                    onClick={() => setProvider('spotify')}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                      provider === 'spotify' ? 'bg-emerald-600 text-white' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Spotify
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="relative">
          <form onSubmit={handleFormSubmit} className="relative">
            <Search className="w-5 h-5 text-neutral-800 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={inputVal}
              onFocus={() => setIsSuggestOpen(true)}
              onChange={(e) => {
                setInputVal(e.target.value);
                setIsSuggestOpen(true);
                if (!e.target.value.trim()) {
                  setSearchQuery('');
                  setRawMode(false);
                }
              }}
              placeholder="何を聴きたいですか？（ひらがな・略称・ローマ字OK）"
              className="w-full h-11 sm:h-12 bg-white text-neutral-950 placeholder-neutral-600 pl-11 pr-10 rounded-md text-sm sm:text-base font-medium focus:outline-none focus:ring-2 focus:ring-red-500 shadow-lg"
            />
            {inputVal && (
              <button
                type="button"
                onClick={() => {
                  setInputVal('');
                  setSearchQuery('');
                  setRawMode(false);
                  setIsSuggestOpen(false);
                }}
                aria-label="検索をクリア"
                className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center text-neutral-600 hover:text-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </form>

          {/* Live Search Conversions & Autocomplete Dropdown */}
          {isSuggestOpen && inputVal.trim().length > 0 && (localConversions.length > 0 || suggestions.length > 0) && (
            <div className="mt-2 bg-[#141418] border border-white/10 rounded-xl shadow-2xl overflow-hidden divide-y divide-white/5">
              {localConversions.map((conv) => (
                <button
                  key={`conv-${conv.query}`}
                  type="button"
                  onClick={() => executeSearch(conv.query, false)}
                  className="w-full px-4 py-3 text-left hover:bg-white/10 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-full bg-red-600/20 text-red-400 flex items-center justify-center shrink-0">
                      <ArrowRightLeft className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <span className="text-sm font-bold text-white truncate block">
                        {conv.label}
                      </span>
                      <span className="text-[11px] text-neutral-400">
                        {conv.kind === 'alias'
                          ? 'アーティスト・曲名に変換'
                          : conv.kind === 'kana'
                          ? 'カタカナに変換'
                          : 'ローマ字から変換'}
                      </span>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-red-400 shrink-0">
                    変換検索
                  </span>
                </button>
              ))}

              {suggestions
                .filter((s) => !localConversions.some((c) => c.query.toLowerCase() === s.toLowerCase()))
                .slice(0, 6)
                .map((s) => (
                  <button
                    key={`sug-${s}`}
                    type="button"
                    onClick={() => executeSearch(s, false)}
                    className="w-full px-4 py-2.5 text-left hover:bg-white/5 flex items-center gap-3 text-sm text-neutral-200 hover:text-white transition-colors cursor-pointer"
                  >
                    <Search className="w-4 h-4 text-neutral-500 shrink-0" />
                    <span className="truncate">{s}</span>
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Active Search Conversion Notice */}
        {hasQuery &&
          !rawMode &&
          effectiveQuery &&
          effectiveQuery.toLowerCase() !== searchQuery.trim().toLowerCase() && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-lg bg-red-950/30 border border-red-800/40 text-xs">
              <div className="flex items-center gap-2 text-neutral-200 min-w-0">
                <ArrowRightLeft className="w-3.5 h-3.5 text-red-400 shrink-0" />
                <span className="truncate">
                  「<strong className="text-white">{effectiveQuery}</strong>」に変換して検索結果を表示中
                </span>
              </div>
              <button
                type="button"
                onClick={() => executeSearch(searchQuery, true)}
                className="text-[11px] font-bold text-red-400 hover:text-red-300 underline cursor-pointer shrink-0"
              >
                変換せず「{searchQuery}」で検索
              </button>
            </div>
          )}

        {/* BPM & Mood Inline Filter Panel */}
        {bpmPanelOpen && (
          <div className="p-4 rounded-2xl bg-[#13131b] border border-red-500/25 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-red-400" />
                <span className="text-xs font-black text-white">曲のBPM・ムードで絞り込み検索</span>
              </div>
              {bpmResults !== null && (
                <button
                  type="button"
                  onClick={() => setBpmResults(null)}
                  className="text-[11px] font-bold text-neutral-400 hover:text-white cursor-pointer"
                >
                  絞り込み結果を閉じる
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              {MOOD_PRESETS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setBpmMood(m.id)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold cursor-pointer transition-colors ${
                    bpmMood === m.id
                      ? 'bg-red-600 text-white'
                      : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {BPM_PRESETS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setBpmRange(b.id);
                    setCustomMinBpm('');
                    setCustomMaxBpm('');
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                    bpmRange === b.id && !customMinBpm && !customMaxBpm
                      ? 'bg-amber-500 text-neutral-950'
                      : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800'
                  }`}
                >
                  {b.label}
                </button>
              ))}
              <div className="flex items-center gap-1.5 text-[11px] text-neutral-300">
                <input
                  type="number"
                  value={customMinBpm}
                  onChange={(e) => setCustomMinBpm(e.target.value)}
                  placeholder="最小BPM"
                  className="w-20 px-2 py-1 rounded-lg bg-neutral-900 border border-neutral-700 text-xs text-white"
                />
                <span>〜</span>
                <input
                  type="number"
                  value={customMaxBpm}
                  onChange={(e) => setCustomMaxBpm(e.target.value)}
                  placeholder="最大BPM"
                  className="w-20 px-2 py-1 rounded-lg bg-neutral-900 border border-neutral-700 text-xs text-white"
                />
              </div>
              <button
                type="button"
                onClick={() => handleRunMoodBpmSearch(false)}
                disabled={bpmLoading}
                className="ml-auto px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                {bpmLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                <span>このBPM/ムードで探す</span>
              </button>
            </div>

            {bpmResults && (
              <div className="pt-2 border-t border-white/10 space-y-1 max-h-80 overflow-y-auto">
                {bpmResults.length === 0 ? (
                  <p className="text-xs text-neutral-400 py-4 text-center">
                    条件に一致する楽曲が見つかりませんでした。
                  </p>
                ) : (
                  bpmResults
                    .filter((t) => !isTrackBlocked(t))
                    .map((track, idx) => (
                      <div
                        key={`${track.id}-bpm-${idx}`}
                        onClick={() => playTrack(track, bpmResults)}
                        className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 cursor-pointer"
                      >
                        <SafeImage src={track.thumbnail} alt={track.title} className="w-10 h-10 rounded object-cover shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-white truncate">{track.title}</p>
                            {track.bpm && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-500/35 text-[10px] font-mono text-amber-300 shrink-0">
                                ~{track.bpm} BPM
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-neutral-400 truncate">{track.artist}</p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            addToQueue(track);
                            showToast(`「${track.title}」をキューに追加しました`, 'info', 1800);
                          }}
                          className="p-2 text-neutral-400 hover:text-white cursor-pointer"
                          title="キューに追加"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Empty Search Query -> Spotify Recent Searches (IMG_0223) + Browse Categories Grid (IMG_0222) */}
      {!hasQuery ? (
        <div className="space-y-8">
          {/* 最近の検索 (Recent Searches matching IMG_0223) */}
          {recentSearches.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-base sm:text-lg font-black text-white">最近の検索</h2>
              <div className="space-y-1">
                {recentSearches.map((q) => (
                  <div
                    key={q}
                    onClick={() => executeSearch(q)}
                    className="flex items-center justify-between gap-3 py-2 px-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-md bg-neutral-800 flex items-center justify-center text-neutral-400 shrink-0">
                        <Clock className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{q}</p>
                        <p className="text-xs text-neutral-400 mt-0.5">最近の検索</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRecentSearch(q);
                      }}
                      aria-label={`${q} を履歴から削除`}
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center text-neutral-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex justify-center pt-1">
                <button
                  type="button"
                  onClick={clearRecentSearches}
                  className="px-5 py-2 rounded-full border border-neutral-600 hover:border-white text-xs font-bold text-white transition-colors cursor-pointer"
                >
                  検索履歴を削除
                </button>
              </div>
            </section>
          )}

          {/* すべてのジャンル (Browse Categories Grid matching IMG_0222) */}
          <section className="space-y-3">
            <h2 className="text-base sm:text-lg font-black text-white">すべてのジャンル</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
              {BROWSE_CATEGORIES.map((cat) => {
                const coverSrc = genreCovers[cat.id] || cat.defaultCover;
                const CatIcon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => executeSearch(cat.query)}
                    className={`${cat.color} relative h-24 sm:h-28 rounded-lg p-3.5 text-left overflow-hidden shadow-md hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer`}
                  >
                    <span className="relative z-10 text-sm sm:text-base font-black text-white leading-tight block max-w-[68%] drop-shadow-sm">
                      {cat.title}
                    </span>
                    <div className="absolute -bottom-1 -right-2 w-16 h-16 sm:w-20 sm:h-20 rounded shadow-2xl overflow-hidden rotate-[25deg] bg-black/25 flex items-center justify-center">
                      {coverSrc ? (
                        <SafeImage
                          src={coverSrc}
                          alt={cat.title}
                          useBase64={coverSrc.startsWith('http')}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <CatIcon className="w-8 h-8 text-white/80" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      ) : (
        /* Active Search Results */
        <div className="space-y-5">
          {/* Segmented Horizontal Filter Chips (YouTube Music mode) */}
          {provider === 'innertube' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {filterOptions.map((opt) => {
                  const isActive = filter === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setFilter(opt.id)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-red-600 text-white'
                          : 'bg-[#232329] text-neutral-200 hover:bg-neutral-700'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                {matchedAlias && (
                  <span className="text-xs text-neutral-400 whitespace-nowrap pl-1">
                    · {matchedAlias}
                  </span>
                )}
              </div>

              {filter === 'unofficial' && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-neutral-400 font-semibold mr-1">
                    公式以外の音源タグ:
                  </span>
                  {UNOFFICIAL_SUBCHIPS.map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => {
                        const base = (inputVal || searchQuery)
                          .replace(/\s*(歌ってみた|cover|live|ライブ|弾き語り|remix)\b/gi, '')
                          .trim();
                        const nextQ = base ? `${base} ${sub.append}` : sub.append;
                        executeSearch(nextQ, false);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/30 border border-amber-500/35 text-[11px] font-bold text-amber-200 cursor-pointer transition-colors"
                    >
                      + {sub.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {(!isOnline || offlineLocalMatchesBanner) && (
            <div className="mb-3 px-3.5 py-2.5 rounded-xl bg-amber-950/50 border border-amber-500/35 text-xs text-amber-200 flex items-center gap-2">
              <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                {offlineLocalMatchesBanner
                  ? 'オフライン検索モード — 端末内の保存済み楽曲・お気に入り・履歴から一致した結果を表示しています'
                  : 'オフライン中 — 保存済みキャッシュデータから検索結果を表示しています'}
              </span>
            </div>
          )}

          {loading ? (
            <div className="py-24 flex flex-col items-center justify-center gap-3 text-neutral-400">
              <Loader2 className={`w-8 h-8 animate-spin ${provider === 'spotify' ? 'text-emerald-500' : 'text-red-500'}`} />
              <p className="text-xs">検索中...</p>
            </div>
          ) : provider === 'spotify' ? (
            <div className="space-y-4">
              {spotifyTracks.length === 0 ? (
                <div className="py-20 text-center space-y-2 text-neutral-400">
                  <p className="text-sm font-medium text-neutral-300">該当する楽曲が見つかりませんでした</p>
                  <p className="text-xs text-neutral-500">キーワードを変えるか、YouTube Music検索をお試しください。</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {spotifyTracks
                    .filter((track) => !isTrackBlocked(track))
                    .map((track, idx) => {
                    const isCurrent = currentTrack?.id === track.id;
                    const isLiked = likedTrackIds.has(track.id);
                    return (
                      <div
                        key={track.id || idx}
                        onClick={() => playTrack(track, spotifyTracks)}
                        className={`flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors ${
                          isCurrent ? 'bg-white/5' : ''
                        }`}
                      >
                        <SafeImage
                          src={track.thumbnail}
                          alt={track.title}
                          className="w-12 h-12 rounded object-cover bg-neutral-800 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold truncate ${isCurrent ? 'text-emerald-400' : 'text-white'}`}>
                            {track.title}
                          </p>
                          <p className="text-xs text-neutral-400 truncate mt-0.5">
                            楽曲 · {track.artist}
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleLikeTrack(track);
                            }}
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center text-neutral-400 hover:text-red-500 cursor-pointer"
                          >
                            <Heart className={`w-4.5 h-4.5 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              playNext(track);
                            }}
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center text-neutral-400 hover:text-red-400 cursor-pointer"
                            title="次に再生"
                            aria-label="次に再生"
                          >
                            <ListStart className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              addToQueue(track);
                              showToast(`「${track.title}」をキューに追加しました`, 'info', 2000);
                            }}
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center text-neutral-400 hover:text-white cursor-pointer"
                            title="キューの最後に追加"
                            aria-label="キューの最後に追加"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openFreemakeModal(track);
                            }}
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center text-neutral-400 hover:text-sky-400 cursor-pointer"
                            title="ダウンロード・保存"
                            aria-label="ダウンロード・保存"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openTrackDetailModal(track);
                            }}
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center text-neutral-400 hover:text-white cursor-pointer"
                            title="楽曲の詳細"
                            aria-label="楽曲の詳細"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : filter === 'all' ? (
            resultsAll.songs.length === 0 &&
            resultsAll.artists.length === 0 &&
            resultsAll.albums.length === 0 &&
            resultsAll.videos.length === 0 &&
            resultsAll.playlists.length === 0 ? (
              <div className="py-24 text-center space-y-3">
                <p className="text-base font-semibold text-neutral-300">
                  「{searchQuery}」の検索結果が見つかりませんでした
                </p>
                <p className="text-xs text-neutral-500">別のキーワードでお試しください。</p>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Artists row (Circular Spotify cards) */}
                {resultsAll.artists.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                        <Users className="w-4 h-4 text-red-500" />
                        <span>アーティスト</span>
                      </h2>
                      <button
                        type="button"
                        onClick={() => setFilter('artist')}
                        className="text-xs font-bold text-neutral-400 hover:text-white cursor-pointer"
                      >
                        すべて見る
                      </button>
                    </div>
                    <div className="flex sm:grid sm:grid-cols-4 md:grid-cols-5 gap-3.5 overflow-x-auto sm:overflow-visible pb-2 scrollbar-none">
                      {resultsAll.artists.slice(0, 5).map((artist) => (
                        <div
                          key={artist.id}
                          onClick={() => navigateTo('artist', artist.id)}
                          className="w-32 sm:w-auto shrink-0 cursor-pointer text-center flex flex-col items-center gap-2 group"
                        >
                          <SafeImage
                            src={artist.thumbnail}
                            alt={artist.name}
                            useBase64
                            className="w-28 h-28 rounded-full object-cover bg-neutral-800 shadow-lg group-hover:scale-105 transition-transform"
                          />
                          <h4 className="text-xs sm:text-sm font-bold text-white truncate w-full">
                            {artist.name}
                          </h4>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* Songs */}
                {resultsAll.songs.length > 0 && (
                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                        <Music className="w-4 h-4 text-red-500" />
                        <span>楽曲</span>
                      </h2>
                      <button
                        type="button"
                        onClick={() => setFilter('song')}
                        className="text-xs font-bold text-neutral-400 hover:text-white cursor-pointer"
                      >
                        すべて見る
                      </button>
                    </div>
                    <div className="space-y-0.5">
                      {resultsAll.songs
                        .filter((track) => !isTrackBlocked(track))
                        .slice(0, 6)
                        .map((track) => {
                        const isCurrent = currentTrack?.id === track.id;
                        const isLiked = likedTrackIds.has(track.id);
                        return (
                          <div
                            key={track.id}
                            onClick={() => playTrack(track, resultsAll.songs)}
                            className={`flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors ${
                              isCurrent ? 'bg-white/5' : ''
                            }`}
                          >
                            <SafeImage
                              src={track.thumbnail}
                              alt={track.title}
                              useBase64
                              className="w-12 h-12 rounded object-cover bg-neutral-800 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-semibold truncate ${isCurrent ? 'text-red-500' : 'text-white'}`}>
                                {track.title}
                              </p>
                              <p className="text-xs text-neutral-400 truncate mt-0.5">
                                曲 · {track.artist}
                              </p>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleLikeTrack(track);
                                }}
                                className="min-w-[36px] min-h-[36px] flex items-center justify-center text-neutral-400 hover:text-red-500 cursor-pointer"
                                title="お気に入り"
                              >
                                <Heart className={`w-4.5 h-4.5 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openAddToPlaylistModal(track);
                                }}
                                className="hidden sm:flex min-w-[36px] min-h-[36px] items-center justify-center text-neutral-400 hover:text-white cursor-pointer"
                                title="プレイリストに追加"
                              >
                                <ListPlus className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playNext(track);
                                }}
                                className="min-w-[36px] min-h-[36px] flex items-center justify-center text-neutral-400 hover:text-red-400 cursor-pointer"
                                title="次に再生"
                                aria-label="次に再生"
                              >
                                <ListStart className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addToQueue(track);
                                  showToast(`「${track.title}」をキューに追加しました`, 'info', 2000);
                                }}
                                className="min-w-[36px] min-h-[36px] flex items-center justify-center text-neutral-400 hover:text-white cursor-pointer"
                                title="キューの最後に追加"
                                aria-label="キューの最後に追加"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (downloadingOfflineIds.has(track.id) || track.isLocal) return;
                                  if (cachedOfflineIds.has(track.id) || track.isCachedOffline) {
                                    removeTrackOfflineCache(track.id);
                                  } else {
                                    downloadTrackOffline(track);
                                  }
                                }}
                                className={`min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer ${
                                  cachedOfflineIds.has(track.id) || track.isCachedOffline || track.isLocal
                                    ? 'text-emerald-400 hover:text-emerald-300'
                                    : 'text-neutral-400 hover:text-emerald-300'
                                }`}
                                title={
                                  cachedOfflineIds.has(track.id) || track.isCachedOffline || track.isLocal
                                    ? 'オフライン保存済み'
                                    : '1タップでオフライン保存'
                                }
                                aria-label="オフライン保存"
                              >
                                {downloadingOfflineIds.has(track.id) ? (
                                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                                ) : cachedOfflineIds.has(track.id) || track.isCachedOffline || track.isLocal ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                ) : (
                                  <ArrowDownToLine className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openFreemakeModal(track);
                                }}
                                className="min-w-[36px] min-h-[36px] flex items-center justify-center text-neutral-400 hover:text-sky-400 cursor-pointer"
                                title="ダウンロード・保存"
                                aria-label="ダウンロード・保存"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openTrackDetailModal(track);
                                }}
                                className="min-w-[36px] min-h-[36px] flex items-center justify-center text-neutral-400 hover:text-white cursor-pointer"
                                title="楽曲の詳細"
                                aria-label="楽曲の詳細"
                              >
                                <Info className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* Albums */}
                {resultsAll.albums.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                        <Disc className="w-4 h-4 text-red-500" />
                        <span>アルバム</span>
                      </h2>
                      <button
                        type="button"
                        onClick={() => setFilter('album')}
                        className="text-xs font-bold text-neutral-400 hover:text-white cursor-pointer"
                      >
                        すべて見る
                      </button>
                    </div>
                    <div className="flex md:grid md:grid-cols-4 lg:grid-cols-6 gap-3.5 overflow-x-auto md:overflow-visible pb-2 scrollbar-none">
                      {resultsAll.albums.map((album) => {
                        const isLikedAlbum = likedAlbumIds.has(album.id);
                        return (
                          <div
                            key={album.id}
                            onClick={() => navigateTo('album', album.id)}
                            className="group w-36 sm:w-40 md:w-auto shrink-0 cursor-pointer flex flex-col gap-2"
                          >
                            <div className="aspect-square rounded-md overflow-hidden bg-neutral-800 relative">
                              <SafeImage
                                src={album.thumbnail}
                                alt={album.title}
                                useBase64
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleLikeAlbum(album);
                                }}
                                className={`absolute top-2 right-2 z-10 w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center transition-all cursor-pointer ${
                                  isLikedAlbum
                                    ? 'bg-black/75 text-red-500 opacity-100'
                                    : 'bg-black/60 text-white/80 hover:text-red-400 opacity-90 sm:opacity-0 sm:group-hover:opacity-100'
                                }`}
                                title={isLikedAlbum ? 'お気に入り解除' : 'お気に入りに追加'}
                              >
                                <Heart className={`w-4 h-4 ${isLikedAlbum ? 'fill-red-500 text-red-500' : ''}`} />
                              </button>
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-xs sm:text-sm font-bold text-white truncate">{album.title}</h4>
                              <p className="text-[11px] text-neutral-400 truncate">アルバム · {album.artist}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* Playlists */}
                {resultsAll.playlists.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                        <ListMusic className="w-4 h-4 text-red-500" />
                        <span>プレイリスト</span>
                      </h2>
                      <button
                        type="button"
                        onClick={() => setFilter('playlist')}
                        className="text-xs font-bold text-neutral-400 hover:text-white cursor-pointer"
                      >
                        すべて見る
                      </button>
                    </div>
                    <div className="flex md:grid md:grid-cols-4 lg:grid-cols-6 gap-3.5 overflow-x-auto md:overflow-visible pb-2 scrollbar-none">
                      {resultsAll.playlists.map((pl) => {
                        const isLikedPl = likedPlaylistIds.has(pl.id);
                        return (
                          <div
                            key={pl.id}
                            onClick={() => navigateTo('album', pl.id)}
                            className="group w-36 sm:w-40 md:w-auto shrink-0 cursor-pointer flex flex-col gap-2"
                          >
                            <div className="aspect-square rounded-md overflow-hidden bg-neutral-800 relative">
                              <SafeImage
                                src={pl.thumbnail}
                                alt={pl.title}
                                useBase64
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                              />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleLikePlaylist(pl);
                                }}
                                className={`absolute top-2 right-2 z-10 w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center transition-all cursor-pointer ${
                                  isLikedPl
                                    ? 'bg-black/75 text-red-500 opacity-100'
                                    : 'bg-black/60 text-white/80 hover:text-red-400 opacity-90 sm:opacity-0 sm:group-hover:opacity-100'
                                }`}
                                title={isLikedPl ? 'お気に入り解除' : 'お気に入りに追加'}
                              >
                                <Heart className={`w-4 h-4 ${isLikedPl ? 'fill-red-500 text-red-500' : ''}`} />
                              </button>
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-xs sm:text-sm font-bold text-white truncate">{pl.title}</h4>
                              <p className="text-[11px] text-neutral-400 truncate">
                                {pl.author || 'プレイリスト'}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* Videos */}
                {resultsAll.videos.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                        <Tv className="w-4 h-4 text-red-500" />
                        <span>ミュージックビデオ</span>
                      </h2>
                      <button
                        type="button"
                        onClick={() => setFilter('video')}
                        className="text-xs font-bold text-neutral-400 hover:text-white cursor-pointer"
                      >
                        すべて見る
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                      {resultsAll.videos.map((vid) => (
                        <div
                          key={vid.id}
                          onClick={() => playTrack(vid)}
                          className="cursor-pointer flex flex-col gap-2 group"
                        >
                          <div className="aspect-video rounded-md overflow-hidden bg-neutral-800 relative">
                            <SafeImage
                              src={vid.thumbnail}
                              alt={vid.title}
                              useBase64
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Play className="w-7 h-7 fill-white text-white" />
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openFreemakeModal(vid);
                              }}
                              className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/70 hover:bg-sky-600 text-white backdrop-blur-md flex items-center justify-center opacity-95 sm:opacity-0 sm:group-hover:opacity-100 transition-all cursor-pointer shadow"
                              title="ダウンロード・保存"
                              aria-label="ダウンロード・保存"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-white truncate">{vid.title}</h4>
                            <p className="text-[11px] text-neutral-400 truncate">{vid.artist}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )
          ) : (
            /* Filtered Mode */
            <div>
              {resultsFiltered.length === 0 ? (
                <div className="py-20 text-center text-sm text-neutral-500">
                  該当する結果が見つかりませんでした。
                </div>
              ) : filter === 'song' || filter === 'unofficial' ? (
                <div className="space-y-0.5">
                  {resultsFiltered
                    .filter((track) => !isTrackBlocked(track))
                    .map((track) => {
                    const isCurrent = currentTrack?.id === track.id;
                    const isLiked = likedTrackIds.has(track.id);
                    return (
                      <div
                        key={track.id}
                        onClick={() => playTrack(track, resultsFiltered)}
                        className={`flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors ${
                          isCurrent ? 'bg-white/5' : ''
                        }`}
                      >
                        <SafeImage
                          src={track.thumbnail}
                          alt={track.title}
                          useBase64
                          className="w-12 h-12 rounded object-cover bg-neutral-800 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className={`text-sm font-semibold truncate ${isCurrent ? 'text-red-500' : 'text-white'}`}>
                              {track.title}
                            </p>
                            {track.isUnofficial && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-500/20 border border-amber-500/40 text-[10px] font-bold text-amber-200 shrink-0">
                                {track.unofficialKind === 'live'
                                  ? 'ライブ音源'
                                  : track.unofficialKind === 'remix'
                                  ? 'Remix'
                                  : track.unofficialKind === 'cover'
                                  ? '歌ってみた・カバー'
                                  : '動画音源'}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-neutral-400 truncate mt-0.5">{track.artist}</p>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleLikeTrack(track);
                            }}
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center text-neutral-400 hover:text-red-500 cursor-pointer"
                          >
                            <Heart className={`w-4.5 h-4.5 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              playNext(track);
                            }}
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center text-neutral-400 hover:text-red-400 cursor-pointer"
                            title="次に再生"
                            aria-label="次に再生"
                          >
                            <ListStart className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              addToQueue(track);
                              showToast(`「${track.title}」をキューに追加しました`, 'info', 2000);
                            }}
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center text-neutral-400 hover:text-white cursor-pointer"
                            title="キューの最後に追加"
                            aria-label="キューの最後に追加"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (downloadingOfflineIds.has(track.id) || track.isLocal) return;
                              if (cachedOfflineIds.has(track.id) || track.isCachedOffline) {
                                removeTrackOfflineCache(track.id);
                              } else {
                                downloadTrackOffline(track);
                              }
                            }}
                            className={`min-w-[36px] min-h-[36px] flex items-center justify-center cursor-pointer ${
                              cachedOfflineIds.has(track.id) || track.isCachedOffline || track.isLocal
                                ? 'text-emerald-400 hover:text-emerald-300'
                                : 'text-neutral-400 hover:text-emerald-300'
                            }`}
                            title={
                              cachedOfflineIds.has(track.id) || track.isCachedOffline || track.isLocal
                                ? 'オフライン保存済み'
                                : '1タップでオフライン保存'
                            }
                            aria-label="オフライン保存"
                          >
                            {downloadingOfflineIds.has(track.id) ? (
                              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                            ) : cachedOfflineIds.has(track.id) || track.isCachedOffline || track.isLocal ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            ) : (
                              <ArrowDownToLine className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openFreemakeModal(track);
                            }}
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center text-neutral-400 hover:text-sky-400 cursor-pointer"
                            title="ダウンロード・保存"
                            aria-label="ダウンロード・保存"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openTrackDetailModal(track);
                            }}
                            className="min-w-[36px] min-h-[36px] flex items-center justify-center text-neutral-400 hover:text-white cursor-pointer"
                            title="楽曲の詳細"
                            aria-label="楽曲の詳細"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : filter === 'artist' ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-5">
                  {resultsFiltered.map((artist) => (
                    <div
                      key={artist.id}
                      onClick={() => navigateTo('artist', artist.id)}
                      className="cursor-pointer text-center flex flex-col items-center gap-2.5 group"
                    >
                      <SafeImage
                        src={artist.thumbnail}
                        alt={artist.name}
                        useBase64
                        className="w-28 h-28 rounded-full object-cover shadow-lg bg-neutral-800 group-hover:scale-105 transition-transform"
                      />
                      <h4 className="text-sm font-bold text-white truncate w-full">{artist.name}</h4>
                      {artist.subscribers && (
                        <p className="text-xs text-neutral-400 truncate">{artist.subscribers}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {resultsFiltered.map((item) => {
                    const isPl = filter === 'playlist';
                    const isAlbum = filter === 'album';
                    const isLikedCard = isPl
                      ? likedPlaylistIds.has(item.id)
                      : isAlbum
                      ? likedAlbumIds.has(item.id)
                      : false;

                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          if (isAlbum || isPl) navigateTo('album', item.id);
                          else if (filter === 'video') playTrack(item);
                        }}
                        className="cursor-pointer flex flex-col gap-2 group"
                      >
                        <div className="aspect-square rounded-md overflow-hidden bg-neutral-800 relative">
                          <SafeImage
                            src={item.thumbnail}
                            alt={item.title}
                            useBase64
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          {(isAlbum || isPl) ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isPl) toggleLikePlaylist(item);
                                else toggleLikeAlbum(item);
                              }}
                              className={`absolute top-2 right-2 z-10 w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center transition-all cursor-pointer ${
                                isLikedCard
                                  ? 'bg-black/75 text-red-500 opacity-100'
                                  : 'bg-black/60 text-white/80 hover:text-red-400 opacity-90 sm:opacity-0 sm:group-hover:opacity-100'
                              }`}
                              title={isLikedCard ? 'お気に入り解除' : 'お気に入りに追加'}
                            >
                              <Heart className={`w-4 h-4 ${isLikedCard ? 'fill-red-500 text-red-500' : ''}`} />
                            </button>
                          ) : filter === 'video' ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openFreemakeModal(item);
                              }}
                              className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/70 hover:bg-sky-600 text-white backdrop-blur-md flex items-center justify-center opacity-95 sm:opacity-0 sm:group-hover:opacity-100 transition-all cursor-pointer shadow"
                              title="ダウンロード・保存"
                              aria-label="ダウンロード・保存"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs sm:text-sm font-bold text-white truncate">{item.title}</h4>
                          <p className="text-[11px] text-neutral-400 truncate">{item.artist || item.author}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
