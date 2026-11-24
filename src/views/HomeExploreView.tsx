import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { api } from '../services/api';
import { ExploreData, Track, OriconTrack, Artist } from '../types/music';
import { SafeImage } from '../components/SafeImage';
import { MoodRecommendationSection } from '../components/MoodRecommendationSection';
import { getOfflineMeta, saveOfflineMeta } from '../services/offlineStorage';
import { getApiCacheEntry, setApiCacheEntry } from '../services/apiCacheDb';
import {
  Play,
  Plus,
  Heart,
  Loader2,
  WifiOff,
  FolderDown,
  Settings,
  Radio,
  ListMusic,
  Tv,
  ChevronLeft,
  ChevronRight,
  ListStart,
  Sparkles,
  Info,
  EyeOff,
  BookmarkPlus,
  Shuffle,
  X,
  Download,
  Globe,
  RefreshCw,
  History,
  Podcast,
  Sliders,
} from 'lucide-react';

interface MadeForYouMix {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  gradient: string;
  tracks: Track[];
  coverUrl?: string;
}

interface FavoriteArtistChip {
  id: string;
  name: string;
  thumbnail: string;
  hasChannelId: boolean;
}

const ARTIST_META_CACHE_KEY = 'yt_music_home_artists_v1';

interface CachedArtistMeta {
  id?: string;
  thumbnail?: string;
  track?: Track;
}

const DEFAULT_ARTISTS: FavoriteArtistChip[] = [
  {
    id: 'UC84Rm0a3gimYXPtqp5O_JRw',
    name: 'Official髭男dism',
    thumbnail:
      'https://yt3.googleusercontent.com/zZy89DQBNNe9nMoOeR-xiJKiINPI1Y1YzePRO2Fwt4pj20Tm_FkBHnQODMAoxapzaT_tiSacaKR3TiVb=w544-h544-s-l90-rj',
    hasChannelId: true,
  },
  {
    id: 'artist-mrs-green-apple',
    name: 'Mrs. GREEN APPLE',
    thumbnail: '',
    hasChannelId: false,
  },
  {
    id: 'artist-vaundy',
    name: 'Vaundy',
    thumbnail: '',
    hasChannelId: false,
  },
  {
    id: 'artist-yoasobi',
    name: 'YOASOBI',
    thumbnail: '',
    hasChannelId: false,
  },
  {
    id: 'artist-king-gnu',
    name: 'King Gnu',
    thumbnail: '',
    hasChannelId: false,
  },
  {
    id: 'artist-radwimps',
    name: 'RADWIMPS',
    thumbnail: '',
    hasChannelId: false,
  },
  {
    id: 'artist-back-number',
    name: 'back number',
    thumbnail: '',
    hasChannelId: false,
  },
];

type HigedanAlbumCategory = 'all' | 'studio' | 'ep' | 'live' | 'instrumental';

interface HomeAlbumItem {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  year?: string;
  category: Exclude<HigedanAlbumCategory, 'all'>;
  categoryLabel: string;
}

const HIGEDAN_CHANNEL_ID = 'UC84Rm0a3gimYXPtqp5O_JRw';

const HIGEDAN_ALL_ALBUMS: HomeAlbumItem[] = [
  // スタジオ・フルアルバム
  {
    id: 'MPREb_KVsxzaWluhH',
    title: 'Rejoice',
    artist: 'Official髭男dism',
    thumbnail: '/assets/covers/rejoice.jpg',
    year: '2024',
    category: 'studio',
    categoryLabel: 'アルバム',
  },
  {
    id: 'MPREb_QCAGO0Lbeum',
    title: 'Editorial',
    artist: 'Official髭男dism',
    thumbnail: '/assets/covers/editorial.jpg',
    year: '2021',
    category: 'studio',
    categoryLabel: 'アルバム',
  },
  {
    id: 'MPREb_9XoC3Flm4Rv',
    title: 'Traveler',
    artist: 'Official髭男dism',
    thumbnail: '/assets/covers/traveler.jpg',
    year: '2019',
    category: 'studio',
    categoryLabel: 'アルバム',
  },
  {
    id: 'MPREb_YzLb9pRbx9F',
    title: 'エスカパレード',
    artist: 'Official髭男dism',
    thumbnail:
      'https://yt3.googleusercontent.com/u-fn9CV7q-hRd8C1HDtZaXO1_ALKhP6PnpduWucUEtt36BLBd7tGf6LWut7sEXSyOt5sjWXiOn2DZi2J=w544-h544-l90-rj',
    year: '2018',
    category: 'studio',
    categoryLabel: 'アルバム',
  },
  // ミニアルバム
  {
    id: 'MPREb_aXDLR6CYO4T',
    title: 'レポート',
    artist: 'Official髭男dism',
    thumbnail:
      'https://yt3.googleusercontent.com/XLQus3qol8pPLwuKkaAq6-QKs1lPH17QeJaoqupluaShpEDnYtmDbZ0-e5xr7-qHUQjD5ej3bb3gtF4=w544-h544-s-l90-rj',
    year: '2017',
    category: 'studio',
    categoryLabel: 'ミニアルバム',
  },
  {
    id: 'MPREb_mcPLWbEQM8y',
    title: 'MAN IN THE MIRROR',
    artist: 'Official髭男dism',
    thumbnail:
      'https://yt3.googleusercontent.com/H1ZIqxKiFEWcbSg5x_5pDXmyyJiEhBw4qEUmiUkIA9_wZ_wdAjni5Y6fDXbFOsNxeoIR6SxIipiFDhu2=w544-h544-l90-rj',
    year: '2016',
    category: 'studio',
    categoryLabel: 'ミニアルバム',
  },
  {
    id: 'MPREb_lvUlrlxInIt',
    title: 'ラブとピースは君の中',
    artist: 'Official髭男dism',
    thumbnail: '/assets/covers/love_peace.jpg',
    year: '2015',
    category: 'studio',
    categoryLabel: 'ミニアルバム',
  },
  // EP
  {
    id: 'MPREb_5ZALdIZMcms',
    title: 'ミックスナッツEP',
    artist: 'Official髭男dism',
    thumbnail:
      'https://yt3.googleusercontent.com/sHzfH8LR7ybsBpPCxF8h2wQYQc5Lj1ki_X5Uc7DpK19lUBMTKX0QrEiVKuEXuBBolpnBL_gfmln6Mhqp=w544-h544-l90-rj',
    year: '2022',
    category: 'ep',
    categoryLabel: 'EP',
  },
  {
    id: 'MPREb_ATFaBvGwqjc',
    title: 'HELLO EP',
    artist: 'Official髭男dism',
    thumbnail:
      'https://yt3.googleusercontent.com/sI7_9lx2mav0Fod45Qf1RTMvqZJJbjOFbV7jnSunl4Vrh8Ept83YL7C4QMyd5njAafv5WmuR-R7CPZX0-Q=w544-h544-l90-rj',
    year: '2020',
    category: 'ep',
    categoryLabel: 'EP',
  },
  {
    id: 'MPREb_jBGGslW7Dc1',
    title: 'Stand By You EP',
    artist: 'Official髭男dism',
    thumbnail:
      'https://yt3.googleusercontent.com/aeGT2ozpn6E-BdrW00KxU3BT25f87QndfXzsuy8Y_nQ7Df7Yn6d5sxryuNOV8DRsKnMueUZRLGjsKKA=w544-h544-l90-rj',
    year: '2018',
    category: 'ep',
    categoryLabel: 'EP',
  },
  {
    id: 'MPREb_C5oM1XPI8wm',
    title: 'LADY',
    artist: 'Official髭男dism',
    thumbnail:
      'https://yt3.googleusercontent.com/pPVNoFKqNsXUO8HxD5UHpYN1PgwXy9rD3dzWF_ET2Pa2BelZsrd8kTLxeMi6WPStsVanohFCxiX18n2F=w544-h544-l90-rj',
    year: '2017',
    category: 'ep',
    categoryLabel: 'EP',
  },
  {
    id: 'MPREb_IRrBxLWvXCc',
    title: "What's Going On?",
    artist: 'Official髭男dism',
    thumbnail:
      'https://yt3.googleusercontent.com/ht0Sx8rSlphwJ1t796h_XopU92BjiEmXo0sV8yvwknJjAgDW0CRQExBNuqHc_Eo11liv61YbRjNMn2zY=w544-h544-l90-rj',
    year: '2016',
    category: 'ep',
    categoryLabel: 'EP',
  },
  // ライブアルバム
  {
    id: 'MPREb_tEj9ZUiT8om',
    title: 'OFFICIAL HIGE DANDISM LIVE at STADIUM 2025',
    artist: 'Official髭男dism',
    thumbnail:
      'https://yt3.googleusercontent.com/WSbzf8dQJofD6MWOBS9SlcP1EHGmNrBUuWjFAJSikzI9IeuvujGaOUrPbHm7_0ljssFwRukmQJ6wPRs=w544-h544-l90-rj',
    year: '2025',
    category: 'live',
    categoryLabel: 'ライブアルバム',
  },
  {
    id: 'MPREb_4QKRdv5JG9J',
    title: 'Official髭男dism Arena Tour 2024 - Rejoice - (Live)',
    artist: 'Official髭男dism',
    thumbnail:
      'https://yt3.googleusercontent.com/VUpaSAAx-BPvT3zz79GZ5ucqNSfw8bQPYbLKB4aG2hudT2zbCID0HEXwThOQmvRgNKcJgFq27pFQXyekvg=w544-h544-l90-rj',
    year: '2024',
    category: 'live',
    categoryLabel: 'ライブアルバム',
  },
  {
    id: 'MPREb_PkQZnvvlozt',
    title: 'one-man tour 2021-2022 -Editorial-@さいたまスーパーアリーナ',
    artist: 'Official髭男dism',
    thumbnail:
      'https://yt3.googleusercontent.com/YknVLazXVK9znDn4PCm_Mrqt-VjGZLNL1eKdXXK588u-N_U7H3TcF6t42yfqCcr6ZJAUbYD11L9SeutdzQ=w544-h544-l90-rj',
    year: '2022',
    category: 'live',
    categoryLabel: 'ライブアルバム',
  },
  {
    id: 'MPREb_WDKYjtNdDlW',
    title: 'Official髭男dism ONLINE LIVE 2020 - Arena Travelers - (Live)',
    artist: 'Official髭男dism',
    thumbnail:
      'https://yt3.googleusercontent.com/Z2f8QUf4xnFhlR0gGmlbuJmlk1yLUjB-u68u9qooOHshhiTMvlyVYTiXEZxOdugTDblrHPTArgi3R-Y=w544-h544-l90-rj',
    year: '2020',
    category: 'live',
    categoryLabel: 'ライブアルバム',
  },
  {
    id: 'MPREb_3VLGsScgzZH',
    title: 'Official髭男dism one-man tour 2019@日本武道館',
    artist: 'Official髭男dism',
    thumbnail:
      'https://yt3.googleusercontent.com/PXleIRlQfniKVnPNrKJu6DLuvvZPgkgZdY0icaOBr3I9tTjUixNMu_iHM9lp37OYOxMLV2qd2BRb4JQ=w544-h544-s-l90-rj',
    year: '2019',
    category: 'live',
    categoryLabel: 'ライブアルバム',
  },
  // インストゥルメンタル
  {
    id: 'MPREb_fLP2Rrrqytc',
    title: 'Editorial (Instrumental)',
    artist: 'Official髭男dism',
    thumbnail:
      'https://yt3.googleusercontent.com/Q8KWq_USjuJ7VaGDqAs4v7xJp21cy2ZTJg9afVhXKtRvdYaRoDd9v6JxLQPbHo_hGNqEfoQLFVhT1YwmWg=w544-h544-l90-rj',
    year: '2021',
    category: 'instrumental',
    categoryLabel: 'インスト',
  },
  {
    id: 'MPREb_wHkCT0jtfeX',
    title: 'Traveler-Instrumentals-',
    artist: 'Official髭男dism',
    thumbnail:
      'https://yt3.googleusercontent.com/hg5g9EE_VedOBeGS9dPpII3E8GCgaj6MfL465wh7U4hBkIZqvPkpQqMpTkC8LAf08V6aTeiuUKspE-P0=w544-h544-s-l90-rj',
    year: '2019',
    category: 'instrumental',
    categoryLabel: 'インスト',
  },
];

export const HomeExploreView: React.FC = () => {
  const {
    playTrack,
    addToQueue,
    playNext,
    toggleLikeTrack,
    likedTrackIds,
    likedTracks,
    likedAlbumIds,
    toggleLikeAlbum,
    likedPlaylistIds,
    toggleLikePlaylist,
    followedArtists,
    recentTracks,
    userPlaylists,
    currentTrack,
    navigateTo,
    openFavoritesView,
    setSearchQuery,
    startRadioForTrack,
    setPlayerMode,
    setVideoLayout,
    showToast,
    listeningStats,
    openTrackDetailModal,
    hideTrack,
    isTrackBlocked,
    saveTracksAsPlaylist,
    setSettingsModalOpen,
    openFreemakeModal,
    setLibraryTab,
    setAiPlaylistModalOpen,
    setDspModalOpen,
    audioQuality,
    spatialAudio,
    vocalLevel,
  } = usePlayer();

  const [data, setData] = useState<ExploreData | null>(null);
  const [higedanData, setHigedanData] = useState<{
    artist: string;
    tagline: string;
    songs: Track[];
  } | null>(null);
  const [albumCategory, setAlbumCategory] = useState<HigedanAlbumCategory>('all');
  const [extraHigedanAlbums, setExtraHigedanAlbums] = useState<HomeAlbumItem[]>([]);
  const albumShelfRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFromCache, setIsFromCache] = useState(false);
  const [exploreReloadSeq, setExploreReloadSeq] = useState(0);

  // Personalized Mixes (Daylist / Daily Mix / Release Radar)
  const [madeForYouMixes, setMadeForYouMixes] = useState<MadeForYouMix[]>([]);
  const [loadingMixes, setLoadingMixes] = useState(false);
  const [activeMixModal, setActiveMixModal] = useState<MadeForYouMix | null>(null);
  const mixSeedSignatureRef = useRef<string>('');

  const scrollAlbumShelf = (direction: 'left' | 'right') => {
    const el = albumShelfRef.current;
    if (!el) return;
    const offset = Math.max(280, el.clientWidth * 0.72);
    el.scrollBy({
      left: direction === 'right' ? offset : -offset,
      behavior: 'smooth',
    });
  };

  // Oricon Chart States
  const [oriconList, setOriconList] = useState<OriconTrack[]>([]);
  const [artistMetaMap, setArtistMetaMap] = useState<Record<string, CachedArtistMeta>>({});
  const [artistMetaLoaded, setArtistMetaLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      let initialMap = (await getApiCacheEntry<Record<string, CachedArtistMeta>>(ARTIST_META_CACHE_KEY)) || {};
      try {
        const legacyRaw = localStorage.getItem(ARTIST_META_CACHE_KEY);
        if (legacyRaw) {
          const parsed = JSON.parse(legacyRaw);
          if (!Object.keys(initialMap).length && parsed?.data && parsed?.ts && Date.now() - parsed.ts < 12 * 60 * 60 * 1000) {
            initialMap = parsed.data;
            await setApiCacheEntry(ARTIST_META_CACHE_KEY, initialMap, 12 * 60 * 60 * 1000);
          }
          localStorage.removeItem(ARTIST_META_CACHE_KEY);
        }
      } catch {}
      if (active) {
        if (Object.keys(initialMap).length > 0) {
          setArtistMetaMap(initialMap);
        }
        setArtistMetaLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!artistMetaLoaded) return;
    const targets = ['Mrs. GREEN APPLE', 'Vaundy', 'YOASOBI', 'King Gnu', 'RADWIMPS', 'back number'];
    const missing = targets.filter((name) => !artistMetaMap[name]?.thumbnail);
    if (missing.length === 0) return;

    let active = true;
    Promise.all(
      missing.map(async (name) => {
        try {
          const [artistRes, songRes] = await Promise.all([
            api.search(name, 'artist').catch(() => null),
            api.search(name, 'song').catch(() => null),
          ]);
          const firstArtist = artistRes?.results?.[0] || artistRes?.artists?.[0];
          const firstSong = songRes?.results?.[0] || songRes?.songs?.[0];
          const thumb = firstArtist?.thumbnail || firstSong?.thumbnail;
          const channelId = firstArtist?.id?.startsWith('UC') ? firstArtist.id : firstSong?.artistId;
          if (!thumb && !firstSong) return null;
          return [
            name,
            {
              id: channelId,
              thumbnail: thumb,
              track: firstSong,
            } as CachedArtistMeta,
          ] as const;
        } catch {
          return null;
        }
      })
    ).then((entries) => {
      if (!active) return;
      const next = { ...artistMetaMap };
      let changed = false;
      entries.forEach((entry) => {
        if (entry) {
          next[entry[0]] = entry[1];
          changed = true;
        }
      });
      if (changed) {
        setArtistMetaMap(next);
        setApiCacheEntry(ARTIST_META_CACHE_KEY, next, 12 * 60 * 60 * 1000).catch(() => {});
      }
    });

    return () => {
      active = false;
    };
  }, [artistMetaLoaded, artistMetaMap]);

  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    setLoading(true);
    setError(null);

    const fetchExploreWithColdStartRetry = async (): Promise<ExploreData> => {
      try {
        return await api.getExplore();
      } catch (firstErr) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          throw firstErr;
        }
        await new Promise((resolve) => {
          retryTimer = setTimeout(resolve, 1200);
        });
        if (!active) throw firstErr;
        return await api.getExplore();
      }
    };

    Promise.all([
      fetchExploreWithColdStartRetry(),
      api.getHigedanSpotlight().catch(() => null),
      api.getArtist(HIGEDAN_CHANNEL_ID).catch(() => null),
    ])
      .then(([res, higedan, artistProfile]) => {
        if (!active) return;
        setData(res);
        saveOfflineMeta('cached_explore', res).catch(() => {});
        if (res.oriconRanking) {
          setOriconList(res.oriconRanking);
        }
        if (higedan) {
          setHigedanData(higedan);
          saveOfflineMeta('cached_higedan', higedan).catch(() => {});
        }
        if (artistProfile?.albums && Array.isArray(artistProfile.albums)) {
          const knownIds = new Set(HIGEDAN_ALL_ALBUMS.map((a) => a.id));
          const knownTitles = new Set(HIGEDAN_ALL_ALBUMS.map((a) => a.title.toLowerCase()));
          const additions: HomeAlbumItem[] = artistProfile.albums
            .filter(
              (a) =>
                a.id &&
                a.title &&
                !knownIds.has(a.id) &&
                !knownTitles.has(a.title.trim().toLowerCase())
            )
            .map((a) => {
              const lower = a.title.toLowerCase();
              const isInst = lower.includes('instrumental');
              const isLive = lower.includes('live') || lower.includes('tour') || lower.includes('武道館') || lower.includes('アリーナ');
              return {
                id: a.id,
                title: a.title,
                artist: 'Official髭男dism',
                thumbnail: a.thumbnail,
                year: a.year || '',
                category: isInst ? 'instrumental' : isLive ? 'live' : 'studio',
                categoryLabel: isInst ? 'インスト' : isLive ? 'ライブアルバム' : 'アルバム',
              };
            });
          if (additions.length > 0) {
            setExtraHigedanAlbums(additions);
          }
        }
        setIsFromCache(false);
        setLoading(false);
      })
      .catch(async (err) => {
        if (!active) return;
        console.warn('[HomeExploreView] Loading offline cache:', err);
        const cachedExplore = await getOfflineMeta<ExploreData>('cached_explore');
        const cachedHigedan = await getOfflineMeta<any>('cached_higedan');
        if (cachedExplore && active) {
          setData(cachedExplore);
          if (cachedExplore.oriconRanking) {
            setOriconList(cachedExplore.oriconRanking);
          }
          if (cachedHigedan) {
            setHigedanData(cachedHigedan);
          }
          setIsFromCache(true);
          setError(null);
        } else if (active) {
          setError(err.message || '読み込みに失敗しました');
        }
        setLoading(false);
      });

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [exploreReloadSeq]);

  // Generate Personalized Auto-Mixes (Daylist / Daily Mix 1 & 2 / Release Radar)
  useEffect(() => {
    if (loading) return;

    const hour = new Date().getHours();
    const daylistSlot =
      hour >= 5 && hour < 11
        ? {
            title: '朝の爽快 Daylist',
            subtitle: '爽やかな朝にぴったりのアップテンポ＆ポップ',
            moodId: 'happy',
            gradient: 'from-amber-500 via-orange-600 to-rose-800',
          }
        : hour >= 11 && hour < 17
        ? {
            title: '日中の集中 Daylist',
            subtitle: '作業・通学にちょうどいい心地よいフロー',
            moodId: 'focus',
            gradient: 'from-cyan-600 via-blue-700 to-slate-900',
          }
        : hour >= 17 && hour < 23
        ? {
            title: '夜のエモい Daylist',
            subtitle: '夕方〜夜の帰り道に響くエモーショナル選曲',
            moodId: 'emo',
            gradient: 'from-rose-600 via-red-700 to-neutral-950',
          }
        : {
            title: '深夜のチル Daylist',
            subtitle: '深夜リラックスに寄り添うチル＆スロー',
            moodId: 'chill',
            gradient: 'from-indigo-700 via-purple-900 to-neutral-950',
          };

    const topArtistNames: string[] = [];
    const pushArtist = (name?: string) => {
      const clean = name?.trim();
      if (!clean) return;
      if (!topArtistNames.some((n) => n.toLowerCase() === clean.toLowerCase())) {
        topArtistNames.push(clean);
      }
    };
    listeningStats.topArtists.forEach((a) => pushArtist(a.artist));
    followedArtists.forEach((a) => pushArtist(a.name));
    likedTracks.forEach((t) => pushArtist(t.artist));
    recentTracks.forEach((t) => pushArtist(t.artist));
    pushArtist('Official髭男dism');
    pushArtist('Mrs. GREEN APPLE');
    pushArtist('Vaundy');

    const artist1 = topArtistNames[0] || 'Official髭男dism';
    const artist2 = topArtistNames[1] || 'Vaundy';
    const radarArtists = topArtistNames.slice(0, 3);
    const sig = `${daylistSlot.moodId}|${artist1}|${artist2}|${radarArtists.join(',')}`;
    if (mixSeedSignatureRef.current === sig && madeForYouMixes.length > 0) return;
    mixSeedSignatureRef.current = sig;

    let cancelled = false;
    setLoadingMixes(true);

    const filterMixTracks = (list: Track[]): Track[] => {
      const seen = new Set<string>();
      return list.filter((t) => {
        if (!t || !t.id || seen.has(t.id) || isTrackBlocked(t)) return false;
        seen.add(t.id);
        return true;
      });
    };

    const buildMixes = async () => {
      const localPool = filterMixTracks([
        ...likedTracks,
        ...recentTracks,
        ...(higedanData?.songs || []),
        ...(data?.trending || []),
      ]);

      const [moodRes, artist1Res, artist2Res, radarResList] = await Promise.all([
        api.getMoodRecommendation(daylistSlot.moodId, artist1).catch(() => null),
        api.search(`${artist1} 人気曲`, 'song').catch(() => null),
        api.search(`${artist2} 人気曲`, 'song').catch(() => null),
        Promise.all(
          radarArtists.map((name) =>
            api.search(`${name} 新曲`, 'song').catch(() => null)
          )
        ),
      ]);

      if (cancelled) return;

      const daylistTracks = filterMixTracks([
        ...((moodRes?.tracks || []) as Track[]),
        ...localPool.slice(0, 6),
      ]).slice(0, 15);

      const mix1Tracks = filterMixTracks([
        ...localPool.filter(
          (t) => t.artist?.toLowerCase().includes(artist1.toLowerCase())
        ),
        ...((artist1Res?.results || artist1Res?.songs || []) as Track[]),
      ]).slice(0, 15);

      const mix2Tracks = filterMixTracks([
        ...localPool.filter(
          (t) => t.artist?.toLowerCase().includes(artist2.toLowerCase())
        ),
        ...((artist2Res?.results || artist2Res?.songs || []) as Track[]),
      ]).slice(0, 15);

      const radarSearchTracks = radarResList.flatMap(
        (res) => (res?.results || res?.songs || []) as Track[]
      );
      const radarTracks = filterMixTracks([
        ...radarSearchTracks,
        ...(data?.trending || []),
      ]).slice(0, 15);

      const nextMixes: MadeForYouMix[] = [
        {
          id: `daylist-${daylistSlot.moodId}`,
          badge: 'DAYLIST',
          title: daylistSlot.title,
          subtitle: daylistSlot.subtitle,
          gradient: daylistSlot.gradient,
          tracks: daylistTracks,
          coverUrl: daylistTracks[0]?.thumbnail,
        },
        {
          id: 'daily-mix-1',
          badge: 'DAILY MIX 1',
          title: `${artist1} ミックス`,
          subtitle: `${artist1} とよく聴くスタイルを中心に編成`,
          gradient: 'from-red-600 via-rose-800 to-neutral-950',
          tracks: mix1Tracks,
          coverUrl: mix1Tracks[0]?.thumbnail,
        },
        {
          id: 'daily-mix-2',
          badge: 'DAILY MIX 2',
          title: `${artist2} ミックス`,
          subtitle: `${artist2} ほかお気に入り傾向から生成`,
          gradient: 'from-emerald-600 via-teal-800 to-neutral-950',
          tracks: mix2Tracks,
          coverUrl: mix2Tracks[0]?.thumbnail,
        },
        {
          id: 'release-radar',
          badge: 'RELEASE RADAR',
          title: '新譜レーダー',
          subtitle: `${radarArtists.join('・')} などの注目・新着セレクション`,
          gradient: 'from-fuchsia-600 via-purple-800 to-neutral-950',
          tracks: radarTracks,
          coverUrl: radarTracks[0]?.thumbnail,
        },
      ].filter((m) => m.tracks.length > 0);

      setMadeForYouMixes(nextMixes);
      setLoadingMixes(false);
    };

    buildMixes();
    return () => {
      cancelled = true;
    };
  }, [
    loading,
    listeningStats.topArtists,
    followedArtists,
    likedTracks,
    recentTracks,
    higedanData,
    data,
    isTrackBlocked,
  ]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'おはよう';
    if (hour >= 12 && hour < 18) return 'こんにちは';
    return 'こんばんは';
  };

  const allHigedanAlbums = useMemo<HomeAlbumItem[]>(() => {
    return [...HIGEDAN_ALL_ALBUMS, ...extraHigedanAlbums];
  }, [extraHigedanAlbums]);

  const visibleHigedanAlbums = useMemo<HomeAlbumItem[]>(() => {
    if (albumCategory === 'all') return allHigedanAlbums;
    return allHigedanAlbums.filter((a) => a.category === albumCategory);
  }, [allHigedanAlbums, albumCategory]);

  // Spotify Style Popular Radio Stations
  const popularRadios = [
    {
      id: 'radio-higedan',
      title: 'Official髭男dism Radio',
      subtitle: 'Official髭男dism, Vaundy, YOASOBI',
      thumbnail:
        higedanData?.songs[0]?.thumbnail ||
        'https://yt3.googleusercontent.com/zZy89DQBNNe9nMoOeR-xiJKiINPI1Y1YzePRO2Fwt4pj20Tm_FkBHnQODMAoxapzaT_tiSacaKR3TiVb=w544-h544-s-l90-rj',
      track: higedanData?.songs[0],
    },
    {
      id: 'radio-vaundy',
      title: 'Vaundy Radio',
      subtitle: 'Vaundy, King Gnu, 藤井 風',
      thumbnail: artistMetaMap['Vaundy']?.thumbnail || '',
      track: artistMetaMap['Vaundy']?.track,
    },
    {
      id: 'radio-yoasobi',
      title: 'YOASOBI Radio',
      subtitle: 'YOASOBI, ヨルシカ, ずっと真夜中でいいのに。',
      thumbnail: artistMetaMap['YOASOBI']?.thumbnail || '',
      track: artistMetaMap['YOASOBI']?.track,
    },
    {
      id: 'radio-kinggnu',
      title: 'King Gnu Radio',
      subtitle: 'King Gnu, millennium parade, back number',
      thumbnail: artistMetaMap['King Gnu']?.thumbnail || '',
      track: artistMetaMap['King Gnu']?.track,
    },
    {
      id: 'radio-backnumber',
      title: 'back number Radio',
      subtitle: 'back number, 優里, DISH//',
      thumbnail: artistMetaMap['back number']?.thumbnail || '',
      track: artistMetaMap['back number']?.track,
    },
  ];

  // Combine followed artists + artists from user history/likes + defaults
  const favoriteArtistsShelf = useMemo<FavoriteArtistChip[]>(() => {
    const map = new Map<string, FavoriteArtistChip>();
    const addChip = (chip: FavoriteArtistChip) => {
      const key = chip.name.trim().toLowerCase();
      if (!key) return;
      const existing = map.get(key);
      if (!existing || (!existing.hasChannelId && chip.hasChannelId)) {
        map.set(key, chip);
      }
    };

    followedArtists.forEach((a: Artist) => {
      addChip({
        id: a.id,
        name: a.name,
        thumbnail: a.thumbnail,
        hasChannelId: Boolean(a.id && a.id.startsWith('UC')),
      });
    });

    [...recentTracks, ...likedTracks].forEach((t) => {
      if (t.artist && t.artistId && t.artistId.startsWith('UC')) {
        addChip({
          id: t.artistId,
          name: t.artist,
          thumbnail: t.thumbnail,
          hasChannelId: true,
        });
      }
    });

    DEFAULT_ARTISTS.forEach((d) => {
      const cached = artistMetaMap[d.name];
      const realId = cached?.id && cached.id.startsWith('UC') ? cached.id : d.id;
      addChip({
        id: realId,
        name: d.name,
        thumbnail: cached?.thumbnail || d.thumbnail,
        hasChannelId: Boolean(realId && realId.startsWith('UC')),
      });
    });
    return Array.from(map.values()).slice(0, 10);
  }, [followedArtists, recentTracks, likedTracks, artistMetaMap]);

  const handleOpenArtistChip = (artist: FavoriteArtistChip) => {
    if (artist.hasChannelId && artist.id) {
      navigateTo('artist', artist.id);
    } else {
      setSearchQuery(artist.name);
      navigateTo('search');
    }
  };

  const handlePlayChart = async (
    chartType: 'japan' | 'global' | 'viral' | 'hothits',
    label: string
  ) => {
    if (chartType === 'japan' && oriconList.length > 0) {
      playTrack(oriconList[0], oriconList);
      showToast(`「${label}」を再生中`, 'success', 2200);
      const el = document.getElementById('oricon-ranking-section');
      el?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    if (chartType === 'viral' && data?.trending && data.trending.length > 0) {
      playTrack(data.trending[0], data.trending);
      showToast(`「${label}」を再生中`, 'success', 2200);
      return;
    }
    const query =
      chartType === 'global'
        ? 'Global Top 50 hits 2026'
        : chartType === 'viral'
        ? '急上昇 J-Pop ヒット'
        : chartType === 'hothits'
        ? 'Hot Hits Japan J-Pop'
        : '日本 トップ50 ヒット曲';
    try {
      showToast(`「${label}」を読み込み中...`, 'info', 1800);
      const res = await api.search(query, 'song');
      const tracks: Track[] = res?.results || res?.songs || [];
      if (tracks.length > 0) {
        playTrack(tracks[0], tracks);
      }
    } catch {
      showToast('チャートの読み込みに失敗しました', 'warning', 2200);
    }
  };

  const handlePlayThisIs = async (artistName: string) => {
    try {
      showToast(`「This Is ${artistName}」を読み込み中...`, 'info', 1800);
      const res = await api.search(`${artistName} 人気曲`, 'song');
      const tracks: Track[] = res?.results || res?.songs || [];
      if (tracks.length > 0) {
        playTrack(tracks[0], tracks);
        return;
      }
    } catch {}
    setSearchQuery(artistName);
    navigateTo('search');
  };

  const chartCards = [
    {
      id: 'chart-jp',
      heading: 'Top 50',
      subHeading: 'JAPAN',
      title: 'トップ50 - 日本',
      gradient: 'from-[#f45b43] via-[#d93a32] to-[#8e1416]',
      type: 'japan' as const,
    },
    {
      id: 'chart-global',
      heading: 'Top 50',
      subHeading: 'GLOBAL',
      title: 'トップ50 - グローバル',
      gradient: 'from-[#206b76] via-[#1c3d6e] to-[#131836]',
      type: 'global' as const,
    },
    {
      id: 'chart-viral',
      heading: 'Viral 50',
      subHeading: 'JAPAN',
      title: 'バイラル 50 - 日本',
      gradient: 'from-[#d946ef] via-[#9333ea] to-[#3b0764]',
      type: 'viral' as const,
    },
    {
      id: 'chart-hothits',
      heading: 'HOT HITS',
      subHeading: 'JAPAN',
      title: 'Hot Hits Japan',
      gradient: 'from-[#b91c1c] via-[#7f1d1d] to-[#180608]',
      type: 'hothits' as const,
    },
  ];

  const thisIsCards = [
    {
      name: 'Official髭男dism',
      bandColor: 'bg-[#d4a574] text-neutral-950',
      thumbnail:
        'https://yt3.googleusercontent.com/zZy89DQBNNe9nMoOeR-xiJKiINPI1Y1YzePRO2Fwt4pj20Tm_FkBHnQODMAoxapzaT_tiSacaKR3TiVb=w544-h544-s-l90-rj',
    },
    {
      name: 'Mrs. GREEN APPLE',
      bandColor: 'bg-[#73d2b0] text-neutral-950',
      thumbnail: artistMetaMap['Mrs. GREEN APPLE']?.thumbnail || '',
    },
    {
      name: 'Vaundy',
      bandColor: 'bg-[#ef4444] text-white',
      thumbnail: artistMetaMap['Vaundy']?.thumbnail || '',
    },
    {
      name: 'YOASOBI',
      bandColor: 'bg-[#e11d48] text-white',
      thumbnail: artistMetaMap['YOASOBI']?.thumbnail || '',
    },
    {
      name: 'back number',
      bandColor: 'bg-[#e5c1a1] text-neutral-950',
      thumbnail: artistMetaMap['back number']?.thumbnail || '',
    },
    {
      name: 'King Gnu',
      bandColor: 'bg-[#f59e0b] text-neutral-950',
      thumbnail: artistMetaMap['King Gnu']?.thumbnail || '',
    },
  ];

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3 text-neutral-400">
        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
        <p className="text-xs font-medium text-neutral-300">読み込み中...</p>
      </div>
    );
  }

  if (error && !data) {
    const isBrowserOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6 space-y-4 max-w-sm mx-auto">
        <div className="w-12 h-12 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-red-500">
          <WifiOff className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-white">
            {isBrowserOffline ? 'ネットワークに接続できません' : 'サーバーに接続できませんでした'}
          </p>
          {!isBrowserOffline && (
            <p className="text-xs text-neutral-400">
              一時的な読み込みエラーが発生しました。再試行するかオフライン機能をご利用ください。
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            onClick={() => setExploreReloadSeq((s) => s + 1)}
            className="min-h-[44px] px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold rounded-xl border border-neutral-700 flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>再読み込み</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setLibraryTab('local');
              navigateTo('library');
            }}
            className="min-h-[44px] px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-red-600/30 cursor-pointer"
          >
            <FolderDown className="w-4 h-4" />
            <span>オフライン曲</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setLibraryTab('shared_offline');
              navigateTo('library');
            }}
            className="min-h-[44px] px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-600/30 cursor-pointer"
          >
            <Globe className="w-4 h-4" />
            <span>共有オフライン</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setLibraryTab('downloads');
              navigateTo('library');
            }}
            className="min-h-[44px] px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-sky-300 text-xs font-bold rounded-xl border border-sky-500/35 flex items-center gap-2 cursor-pointer"
          >
            <History className="w-4 h-4" />
            <span>ダウンロード履歴</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-24">
      {/* Offline banner */}
      {isFromCache && (
        <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-neutral-900/90 border border-neutral-800 rounded-xl text-neutral-300 text-xs">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-red-500 shrink-0" />
            <span>オフラインモードで表示しています</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setLibraryTab('shared_offline');
              navigateTo('library');
            }}
            className="px-2.5 py-1 rounded-lg bg-emerald-600/25 border border-emerald-500/40 text-emerald-300 font-bold text-[11px] flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <Globe className="w-3 h-3" />
            <span>共有オフラインを開く</span>
          </button>
        </div>
      )}

      {/* 1. Greeting + Compact Horizontal-Scroll Official髭男dism Albums Shelf */}
      <section className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight truncate">
            {getGreeting()}
          </h1>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setLibraryTab('shared_offline');
                navigateTo('library');
              }}
              className="px-3 py-1.5 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/35 text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              title="誰でも投稿＆オフライン再生できる共有オフラインを開く"
            >
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <span>共有オフライン</span>
            </button>
            <button
              type="button"
              onClick={() => setSettingsModalOpen(true)}
              className="w-10 h-10 -mr-2 flex items-center justify-center text-neutral-300 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
              title="設定"
              aria-label="設定を開く"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Compact Studio Launcher Row (Mobile & PC 1-tap access) */}
        <div className="grid grid-cols-3 gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => setAiPlaylistModalOpen(true)}
            className="p-2.5 sm:p-3 rounded-xl bg-[#13131b] hover:bg-neutral-900 border border-amber-500/25 flex items-center gap-2 text-left transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-white truncate">AI選曲</p>
              <p className="text-[10px] text-neutral-400 truncate">プレイリスト/ラジオ</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => navigateTo('podcasts')}
            className="p-2.5 sm:p-3 rounded-xl bg-[#13131b] hover:bg-neutral-900 border border-emerald-500/25 flex items-center gap-2 text-left transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
              <Podcast className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-white truncate">ポッドキャスト</p>
              <p className="text-[10px] text-neutral-400 truncate">音声・動画番組</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setDspModalOpen(true)}
            className="p-2.5 sm:p-3 rounded-xl bg-[#13131b] hover:bg-neutral-900 border border-sky-500/25 flex items-center gap-2 text-left transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-sky-500/15 flex items-center justify-center text-sky-400 shrink-0">
              <Sliders className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-white truncate">音質 / Sing</p>
              <p className="text-[10px] text-neutral-400 truncate">
                {vocalLevel < 100
                  ? `Sing ${vocalLevel}%`
                  : spatialAudio !== 'off'
                  ? '空間オーディオ'
                  : audioQuality === 'hires'
                  ? 'ハイレゾDSP'
                  : audioQuality === 'lossless'
                  ? 'ロスレス'
                  : '空間・カラオケ'}
              </p>
            </div>
          </button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2 min-w-0">
            <h2 className="text-base sm:text-lg font-black text-white tracking-tight truncate">
              Official髭男dism アルバム
            </h2>
            <span className="text-[11px] font-bold text-neutral-400 shrink-0 tabular-nums">
              {visibleHigedanAlbums.length}作品
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <div className="hidden md:flex items-center gap-1 mr-1">
              <button
                type="button"
                onClick={() => scrollAlbumShelf('left')}
                className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                aria-label="左へスクロール"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollAlbumShelf('right')}
                className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                aria-label="右へスクロール"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => navigateTo('artist', HIGEDAN_CHANNEL_ID)}
              className="text-xs font-bold text-neutral-400 hover:text-white flex items-center gap-0.5 py-1 cursor-pointer shrink-0"
            >
              <span>アーティスト</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Compact Category Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none -mx-3 px-3 sm:mx-0 sm:px-0">
          {(
            [
              { id: 'all', label: `すべて (${allHigedanAlbums.length})` },
              {
                id: 'studio',
                label: `フル・ミニ (${allHigedanAlbums.filter((a) => a.category === 'studio').length})`,
              },
              {
                id: 'ep',
                label: `EP (${allHigedanAlbums.filter((a) => a.category === 'ep').length})`,
              },
              {
                id: 'live',
                label: `ライブ (${allHigedanAlbums.filter((a) => a.category === 'live').length})`,
              },
              {
                id: 'instrumental',
                label: `インスト (${allHigedanAlbums.filter((a) => a.category === 'instrumental').length})`,
              },
            ] as const
          ).map((tab) => {
            const active = albumCategory === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setAlbumCategory(tab.id);
                  albumShelfRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                  active
                    ? 'bg-red-600 text-white shadow-sm shadow-red-600/30'
                    : 'bg-[#18181d] hover:bg-[#222228] text-neutral-300'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Horizontal Scrollable Compact Album Cards */}
        <div
          ref={albumShelfRef}
          className="flex gap-3 overflow-x-auto pb-1.5 -mx-3 px-3 md:mx-0 md:px-0 scrollbar-none snap-x snap-mandatory"
        >
          {visibleHigedanAlbums.map((album) => {
            const isPl =
              album.id.startsWith('VL') ||
              album.id.startsWith('PL') ||
              album.id.startsWith('RD');
            const isLikedItem = isPl
              ? likedPlaylistIds.has(album.id)
              : likedAlbumIds.has(album.id);
            return (
              <div
                key={album.id}
                onClick={() => navigateTo('album', album.id)}
                className="w-[116px] sm:w-[132px] md:w-[142px] shrink-0 snap-start group cursor-pointer flex flex-col gap-1.5"
              >
                <div className="aspect-square rounded-md overflow-hidden bg-neutral-900 relative shadow-md">
                  <SafeImage
                    src={album.thumbnail}
                    alt={album.title}
                    useBase64
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isPl) {
                        toggleLikePlaylist({
                          id: album.id,
                          title: album.title,
                          author: album.artist,
                          thumbnail: album.thumbnail,
                        });
                      } else {
                        toggleLikeAlbum({
                          id: album.id,
                          title: album.title,
                          artist: album.artist,
                          thumbnail: album.thumbnail,
                        });
                      }
                    }}
                    className={`absolute top-1 right-1 z-10 w-7 h-7 rounded-full backdrop-blur-md flex items-center justify-center transition-all cursor-pointer ${
                      isLikedItem
                        ? 'bg-black/75 text-red-500 opacity-100'
                        : 'bg-black/55 text-white/85 hover:text-red-400 opacity-100 md:opacity-0 md:group-hover:opacity-100'
                    }`}
                    title={isLikedItem ? 'お気に入り解除' : 'お気に入りに追加'}
                  >
                    <Heart
                      className={`w-3.5 h-3.5 ${isLikedItem ? 'fill-red-500 text-red-500' : ''}`}
                    />
                  </button>
                  <div className="hidden md:flex absolute bottom-2 right-2 w-9 h-9 rounded-full bg-red-600 text-white items-center justify-center shadow-xl shadow-black/60 opacity-0 translate-y-1.5 group-hover:opacity-100 group-hover:translate-y-0 transition-all pointer-events-none">
                    <Play className="w-4 h-4 fill-white ml-0.5" />
                  </div>
                </div>

                <div className="min-w-0">
                  <h3 className="text-xs sm:text-[13px] font-bold text-white truncate leading-snug group-hover:text-red-400 transition-colors">
                    {album.title}
                  </h3>
                  <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                    {[album.year, album.categoryLabel].filter(Boolean).join(' • ') || album.artist}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 2. あなた専用ミックス (Daily Mix / Daylist / 新譜レーダー) */}
      {(loadingMixes || madeForYouMixes.length > 0) && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl sm:text-[22px] font-black text-white tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-red-500" />
              <span>あなた専用ミックス</span>
            </h2>
            {loadingMixes && (
              <span className="text-[11px] text-neutral-400 flex items-center gap-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-red-500" />
                <span>生成中...</span>
              </span>
            )}
          </div>

          <div className="flex md:grid md:grid-cols-4 gap-3.5 md:gap-4 overflow-x-auto md:overflow-visible pb-2 md:pb-0 -mx-3 px-3 md:mx-0 md:px-0 scrollbar-none snap-x snap-mandatory">
            {madeForYouMixes.map((mix) => (
              <div
                key={mix.id}
                onClick={() => setActiveMixModal(mix)}
                className="w-[152px] sm:w-[168px] md:w-auto shrink-0 snap-start group cursor-pointer flex flex-col gap-2"
              >
                <div
                  className={`aspect-square rounded-md overflow-hidden bg-gradient-to-br ${mix.gradient} relative shadow-lg`}
                >
                  {mix.coverUrl && (
                    <SafeImage
                      src={mix.coverUrl}
                      alt={mix.title}
                      useBase64
                      className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-300"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/30 pointer-events-none" />
                  <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/75 text-[9px] font-black tracking-wider text-white border border-white/15">
                    {mix.badge}
                  </div>
                  <div className="absolute bottom-2.5 left-2.5 right-12 pointer-events-none">
                    <p className="text-xs font-black text-white leading-tight line-clamp-2 drop-shadow">
                      {mix.title}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (mix.tracks.length > 0) {
                        playTrack(mix.tracks[0], mix.tracks);
                        showToast(`「${mix.title}」を再生中`, 'success', 2000);
                      }
                    }}
                    className="absolute bottom-2 right-2 w-9 h-9 md:w-10 md:h-10 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-xl shadow-black/60 md:opacity-0 md:translate-y-1.5 md:group-hover:opacity-100 md:group-hover:translate-y-0 transition-all cursor-pointer"
                    title="今すぐ再生"
                    aria-label={`${mix.title} を再生`}
                  >
                    <Play className="w-4 h-4 fill-white ml-0.5" />
                  </button>
                </div>

                <div className="min-w-0">
                  <h3 className="text-[13px] sm:text-sm font-bold text-white line-clamp-1 group-hover:text-red-400 transition-colors">
                    {mix.title}
                  </h3>
                  <p className="text-xs text-neutral-400 line-clamp-2 mt-0.5">
                    {mix.subtitle}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 2.5 おすすめステーション (Spotify Radio Shelf) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl sm:text-[22px] font-black text-white tracking-tight">
            おすすめステーション
          </h2>
        </div>

        <div className="flex md:grid md:grid-cols-5 gap-3.5 md:gap-4 overflow-x-auto md:overflow-visible pb-2 md:pb-0 -mx-3 px-3 md:mx-0 md:px-0 scrollbar-none snap-x snap-mandatory">
          {popularRadios.map((station) => (
            <div
              key={station.id}
              onClick={() => {
                if (station.track) {
                  startRadioForTrack(station.track);
                } else if (higedanData?.songs?.[0]) {
                  startRadioForTrack(higedanData.songs[0]);
                }
              }}
              className="w-[144px] sm:w-[164px] md:w-auto shrink-0 snap-start group cursor-pointer flex flex-col gap-2"
            >
              <div className="aspect-square rounded-md overflow-hidden bg-gradient-to-br from-neutral-800 to-neutral-950 relative shadow-lg">
                <SafeImage
                  src={station.thumbnail}
                  alt={station.title}
                  useBase64
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/35 pointer-events-none" />
                <div className="absolute top-2 left-2 flex items-center gap-1 text-[10px] font-black tracking-wider text-white bg-black/70 px-1.5 py-0.5 rounded">
                  <Radio className="w-3 h-3 text-red-500" />
                  <span>RADIO</span>
                </div>
                <div className="hidden md:flex absolute bottom-2.5 right-2.5 w-11 h-11 rounded-full bg-red-600 text-white items-center justify-center shadow-xl shadow-black/60 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all pointer-events-none">
                  <Play className="w-5 h-5 fill-white ml-0.5" />
                </div>
              </div>

              <div className="min-w-0">
                <h3 className="text-[13px] sm:text-sm font-bold text-white line-clamp-2 leading-snug group-hover:text-red-400 transition-colors">
                  {station.title}
                </h3>
                <p className="text-xs text-neutral-400 line-clamp-2 mt-0.5">{station.subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3. 最近再生したコンテンツ (Liked Songs Tile + Recent Tracks) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl sm:text-[22px] font-black text-white tracking-tight">
            最近再生したコンテンツ
          </h2>
          {recentTracks.length > 0 && (
            <button
              type="button"
              onClick={() => navigateTo('library')}
              className="text-xs font-bold text-neutral-400 hover:text-white flex items-center gap-0.5 py-1.5 cursor-pointer"
            >
              <span>すべて表示</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex gap-3.5 overflow-x-auto pb-2 -mx-3 px-3 scrollbar-none snap-x snap-mandatory">
          {/* お気に入りの曲 Shortcut Card (Red & Black Gradient matching IMG_0205) */}
          <button
            type="button"
            onClick={openFavoritesView}
            className="w-[144px] sm:w-[160px] shrink-0 snap-start group text-left cursor-pointer flex flex-col gap-2"
          >
            <div className="aspect-square w-full rounded-md overflow-hidden bg-gradient-to-br from-red-600 via-rose-700 to-[#14080b] flex items-center justify-center shadow-lg relative">
              <Heart className="w-12 h-12 text-white fill-white drop-shadow-md group-hover:scale-110 transition-transform" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[13px] sm:text-sm font-bold text-white truncate group-hover:text-red-400 transition-colors">
                お気に入りの曲
              </h3>
              <p className="text-xs text-neutral-400 truncate mt-0.5">
                {likedTracks.length}曲
              </p>
            </div>
          </button>

          {recentTracks
            .filter((t) => !isTrackBlocked(t))
            .slice(0, 12)
            .map((track) => {
            const isCurrent = currentTrack?.id === track.id;
            return (
              <div
                key={`recent-${track.id}`}
                onClick={() => playTrack(track, recentTracks)}
                className="w-[144px] sm:w-[160px] shrink-0 snap-start group cursor-pointer flex flex-col gap-2"
              >
                <div className="aspect-square rounded-md overflow-hidden bg-neutral-900 relative shadow-lg">
                  <SafeImage
                    src={track.thumbnail}
                    alt={track.title}
                    useBase64
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openFreemakeModal(track);
                      }}
                      className="w-7 h-7 rounded-full bg-black/70 hover:bg-sky-600 text-white/90 hover:text-white backdrop-blur-md flex items-center justify-center shadow cursor-pointer"
                      title="ダウンロード・保存"
                      aria-label="ダウンロード・保存"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openTrackDetailModal(track);
                      }}
                      className="w-7 h-7 rounded-full bg-black/70 hover:bg-neutral-800 text-white/90 hover:text-white backdrop-blur-md flex items-center justify-center shadow cursor-pointer"
                      title="楽曲の詳細"
                      aria-label="楽曲の詳細"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        playNext(track);
                      }}
                      className="w-7 h-7 rounded-full bg-black/70 hover:bg-red-600 text-white/90 hover:text-white backdrop-blur-md flex items-center justify-center shadow cursor-pointer"
                      title="次に再生"
                      aria-label="次に再生"
                    >
                      <ListStart className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div
                    className={`hidden md:flex absolute bottom-2.5 right-2.5 w-10 h-10 rounded-full bg-red-600 text-white items-center justify-center shadow-xl transition-all pointer-events-none ${
                      isCurrent
                        ? 'opacity-100 translate-y-0'
                        : 'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0'
                    }`}
                  >
                    <Play className="w-4 h-4 fill-white ml-0.5" />
                  </div>
                </div>
                <div className="min-w-0">
                  <h3
                    className={`text-[13px] sm:text-sm font-bold line-clamp-2 leading-snug transition-colors ${
                      isCurrent ? 'text-red-400' : 'text-white group-hover:text-red-400'
                    }`}
                  >
                    {track.title}
                  </h3>
                  <p className="text-xs text-neutral-400 truncate mt-0.5">{track.artist}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. 自分のプレイリスト (when user has created playlists) */}
      {userPlaylists.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl sm:text-[22px] font-black text-white tracking-tight">
              自分のプレイリスト
            </h2>
            <button
              type="button"
              onClick={() => navigateTo('library')}
              className="text-xs font-bold text-neutral-400 hover:text-white flex items-center gap-0.5 py-1.5 cursor-pointer"
            >
              <span>ライブラリ</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-3.5 overflow-x-auto pb-2 -mx-3 px-3 scrollbar-none snap-x snap-mandatory">
            {userPlaylists.map((pl) => {
              const cover = pl.coverImage || pl.tracks[0]?.thumbnail;
              return (
                <div
                  key={pl.id}
                  onClick={() => {
                    if (pl.tracks.length > 0) {
                      playTrack(pl.tracks[0], pl.tracks);
                    } else {
                      navigateTo('library');
                    }
                  }}
                  className="w-[144px] sm:w-[160px] shrink-0 snap-start group cursor-pointer flex flex-col gap-2"
                >
                  <div className="aspect-square rounded-md overflow-hidden bg-neutral-900 relative shadow-lg flex items-center justify-center">
                    {cover ? (
                      <SafeImage
                        src={cover}
                        alt={pl.name}
                        useBase64={!cover.startsWith('data:')}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <ListMusic className="w-10 h-10 text-neutral-600" />
                    )}
                    <div className="hidden md:flex absolute bottom-2.5 right-2.5 w-10 h-10 rounded-full bg-red-600 text-white items-center justify-center shadow-xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all pointer-events-none">
                      <Play className="w-4 h-4 fill-white ml-0.5" />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[13px] sm:text-sm font-bold text-white line-clamp-2 leading-snug group-hover:text-red-400 transition-colors">
                      {pl.name}
                    </h3>
                    <p className="text-xs text-neutral-400 truncate mt-0.5">
                      {pl.tracks.length}曲
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 5. あなたのお気に入りアーティスト (Circular Portraits matching IMG_0209) */}
      <section className="space-y-3">
        <h2 className="text-xl sm:text-[22px] font-black text-white tracking-tight">
          あなたのお気に入りアーティスト
        </h2>

        <div className="flex gap-4 overflow-x-auto pb-2 -mx-3 px-3 scrollbar-none snap-x snap-mandatory">
          {favoriteArtistsShelf.map((artist) => (
            <button
              key={artist.id}
              type="button"
              onClick={() => handleOpenArtistChip(artist)}
              className="w-[124px] sm:w-[144px] shrink-0 snap-start group flex flex-col items-center text-center gap-2.5 cursor-pointer"
            >
              <div className="w-[124px] h-[124px] sm:w-[144px] sm:h-[144px] rounded-full overflow-hidden bg-neutral-900 shadow-lg ring-1 ring-white/5 group-hover:ring-red-500/60 transition-all">
                <SafeImage
                  src={artist.thumbnail}
                  alt={artist.name}
                  useBase64
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <span className="text-[13px] font-bold text-white line-clamp-1 group-hover:text-red-400 transition-colors w-full">
                {artist.name}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* 5.5 チャート (Top 50 Japan / Global / Viral / Hot Hits matching IMG_0210) */}
      <section className="space-y-3">
        <h2 className="text-xl sm:text-[22px] font-black text-white tracking-tight">
          チャート
        </h2>

        <div className="flex md:grid md:grid-cols-4 gap-3.5 md:gap-4 overflow-x-auto md:overflow-visible pb-2 md:pb-0 -mx-3 px-3 md:mx-0 md:px-0 scrollbar-none snap-x snap-mandatory">
          {chartCards.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => handlePlayChart(card.type, card.title)}
              className="w-[144px] sm:w-[164px] md:w-auto shrink-0 snap-start group text-left cursor-pointer flex flex-col gap-2"
            >
              <div
                className={`aspect-square w-full rounded-md overflow-hidden bg-gradient-to-br ${card.gradient} relative shadow-lg flex flex-col items-center justify-center p-4`}
              >
                <span className="text-xl sm:text-2xl font-black text-white tracking-tight text-center leading-none">
                  {card.heading}
                </span>
                <div className="w-12 h-px bg-white/35 my-2.5" />
                <span className="text-[11px] font-bold tracking-[0.22em] text-white/90 uppercase">
                  {card.subHeading}
                </span>
                <div className="hidden md:flex absolute bottom-2.5 right-2.5 w-11 h-11 rounded-full bg-red-600 text-white items-center justify-center shadow-xl shadow-black/60 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all pointer-events-none">
                  <Play className="w-5 h-5 fill-white ml-0.5" />
                </div>
              </div>
              <span className="text-[13px] sm:text-sm font-bold text-white line-clamp-2 leading-snug group-hover:text-red-400 transition-colors">
                {card.title}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* 5.6 アーティスト特集 (THIS IS ... matching IMG_0210 & IMG_0211) */}
      <section className="space-y-3">
        <h2 className="text-xl sm:text-[22px] font-black text-white tracking-tight">
          アーティスト特集
        </h2>

        <div className="flex md:grid md:grid-cols-6 gap-3.5 md:gap-4 overflow-x-auto md:overflow-visible pb-2 md:pb-0 -mx-3 px-3 md:mx-0 md:px-0 scrollbar-none snap-x snap-mandatory">
          {thisIsCards.map((item) => (
            <button
              key={item.name}
              type="button"
              onClick={() => handlePlayThisIs(item.name)}
              className="w-[144px] sm:w-[164px] md:w-auto shrink-0 snap-start group text-left cursor-pointer flex flex-col gap-2"
            >
              <div className="aspect-square w-full rounded-md overflow-hidden bg-white relative shadow-lg flex flex-col">
                <div className="bg-white px-2.5 pt-2 pb-1 text-center shrink-0">
                  <span className="text-[11px] font-black tracking-[0.18em] text-neutral-950 uppercase">
                    THIS IS
                  </span>
                </div>
                <div className={`relative flex-1 flex flex-col justify-end ${item.bandColor}`}>
                  <div className="absolute inset-x-3 -top-0.5 bottom-6 rounded-sm overflow-hidden shadow-md bg-neutral-900">
                    <SafeImage
                      src={item.thumbnail}
                      alt={item.name}
                      useBase64
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <div className="relative z-10 px-2 pb-1 pt-0.5 text-center">
                    <span className="text-[11px] font-black tracking-tight truncate block">
                      {item.name}
                    </span>
                  </div>
                </div>
                <div className="hidden md:flex absolute bottom-7 right-2.5 w-10 h-10 rounded-full bg-red-600 text-white items-center justify-center shadow-xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all pointer-events-none z-20">
                  <Play className="w-4 h-4 fill-white ml-0.5" />
                </div>
              </div>
              <span className="text-[13px] sm:text-sm font-bold text-white line-clamp-2 leading-snug group-hover:text-red-400 transition-colors">
                This Is {item.name}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* 6. 今の気分 × アーティスト レコメンドセクション */}
      <MoodRecommendationSection />

      {/* 7. 人気の曲 (Oricon / Top Songs Ranking) */}
      {oriconList.length > 0 && (
        <section id="oricon-ranking-section" className="space-y-3 scroll-mt-20">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl sm:text-[22px] font-black text-white tracking-tight">
              人気の曲
            </h2>
            <button
              type="button"
              onClick={() => playTrack(oriconList[0], oriconList)}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-full inline-flex items-center gap-1.5 shadow-md shadow-red-600/30 cursor-pointer shrink-0"
            >
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
              <span>全曲再生</span>
            </button>
          </div>

          <div className="divide-y divide-white/5">
            {oriconList
              .filter((t) => !isTrackBlocked(t))
              .slice(0, 10)
              .map((track, idx) => {
              const isCurrent = currentTrack?.id === track.id;
              const isLiked = likedTrackIds.has(track.id);

              return (
                <div
                  key={track.id || idx}
                  onClick={() => playTrack(track, oriconList)}
                  className={`flex items-center gap-3 px-2 sm:px-3 py-2.5 rounded-lg hover:bg-white/5 group transition-colors cursor-pointer ${
                    isCurrent ? 'bg-red-950/20' : ''
                  }`}
                >
                  <span
                    className={`w-6 text-center text-sm font-mono font-bold tabular-nums shrink-0 ${
                      isCurrent ? 'text-red-500' : 'text-neutral-400'
                    }`}
                  >
                    {idx + 1}
                  </span>

                  <div className="relative shrink-0 w-12 h-12 rounded overflow-hidden bg-neutral-900">
                    <SafeImage
                      src={track.thumbnail}
                      alt={track.title}
                      useBase64
                      className="w-full h-full object-cover"
                    />
                    <div
                      className={`absolute inset-0 bg-black/50 flex items-center justify-center text-white transition-opacity ${
                        isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-semibold truncate ${
                        isCurrent ? 'text-red-400 font-bold' : 'text-white'
                      }`}
                    >
                      {track.title}
                    </p>
                    <p className="text-xs text-neutral-400 truncate mt-0.5">{track.artist}</p>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLikeTrack(track);
                      }}
                      className="w-9 h-9 flex items-center justify-center text-neutral-400 hover:text-red-500 transition-colors cursor-pointer"
                      title={isLiked ? 'お気に入り解除' : 'お気に入りに追加'}
                    >
                      <Heart
                        className={`w-4 h-4 ${isLiked ? 'fill-red-500 text-red-500' : ''}`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        playNext(track);
                      }}
                      className="w-9 h-9 flex items-center justify-center text-neutral-400 hover:text-red-400 transition-colors cursor-pointer"
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
                        showToast(`「${track.title}」をキューの末尾に追加しました`, 'info', 2000);
                      }}
                      className="w-9 h-9 flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
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
                      className="w-9 h-9 flex items-center justify-center text-neutral-400 hover:text-sky-400 transition-colors cursor-pointer"
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
                      className="w-9 h-9 flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
                      title="楽曲の詳細"
                      aria-label="楽曲の詳細"
                    >
                      <Info className="w-4 h-4" />
                    </button>
                    {track.duration && (
                      <span className="hidden sm:inline-block w-11 text-right text-xs font-mono text-neutral-400 tabular-nums">
                        {track.duration}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 8. 注目のリリース (New Releases Shelf) */}
      {data?.newReleases && data.newReleases.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl sm:text-[22px] font-black text-white tracking-tight">
            注目のリリース
          </h2>

          <div className="flex md:grid md:grid-cols-6 gap-3.5 md:gap-4 overflow-x-auto md:overflow-visible pb-2 md:pb-0 -mx-3 px-3 md:mx-0 md:px-0 scrollbar-none snap-x snap-mandatory">
            {data.newReleases.slice(0, 12).map((item) => {
              const isLikedItem = item.id ? likedAlbumIds.has(item.id) : false;
              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (item.id) {
                      navigateTo('album', item.id);
                    }
                  }}
                  className="w-[136px] sm:w-[152px] md:w-auto shrink-0 snap-start group cursor-pointer flex flex-col gap-2"
                >
                  <div className="aspect-square rounded-md overflow-hidden bg-neutral-900 relative shadow-lg">
                    <SafeImage
                      src={item.thumbnail}
                      alt={item.title}
                      useBase64
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    {item.id && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLikeAlbum(item);
                        }}
                        className={`absolute top-1.5 right-1.5 z-10 w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center transition-all cursor-pointer ${
                          isLikedItem
                            ? 'bg-black/75 text-red-500 opacity-100'
                            : 'bg-black/55 text-white/85 hover:text-red-400 opacity-100 md:opacity-0 md:group-hover:opacity-100'
                        }`}
                        title={isLikedItem ? 'お気に入り解除' : 'お気に入りに追加'}
                      >
                        <Heart
                          className={`w-4 h-4 ${isLikedItem ? 'fill-red-500 text-red-500' : ''}`}
                        />
                      </button>
                    )}
                    <div className="hidden md:flex absolute bottom-2 right-2 w-10 h-10 rounded-full bg-red-600 text-white items-center justify-center shadow-xl opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all pointer-events-none">
                      <Play className="w-4 h-4 fill-white ml-0.5" />
                    </div>
                  </div>

                  <div className="min-w-0">
                    <h4 className="text-[13px] font-bold text-white line-clamp-2 leading-snug group-hover:text-red-400 transition-colors">
                      {item.title}
                    </h4>
                    <p className="text-xs text-neutral-400 truncate mt-0.5">{item.artist}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 9. 注目のミュージックビデオ (Music Videos Shelf) */}
      {data?.musicVideos && data.musicVideos.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Tv className="w-5 h-5 text-red-500" />
            <h2 className="text-xl sm:text-[22px] font-black text-white tracking-tight">
              注目のミュージックビデオ
            </h2>
          </div>

          <div className="flex md:grid md:grid-cols-4 gap-3.5 md:gap-4 overflow-x-auto md:overflow-visible pb-2 md:pb-0 -mx-3 px-3 md:mx-0 md:px-0 scrollbar-none snap-x snap-mandatory">
            {data.musicVideos.slice(0, 8).map((vid) => (
              <div
                key={vid.id}
                onClick={() => {
                  playTrack(vid);
                  setPlayerMode('video');
                  setVideoLayout('theater');
                }}
                className="w-[220px] sm:w-[240px] md:w-auto shrink-0 snap-start group cursor-pointer flex flex-col gap-2"
              >
                <div className="aspect-video rounded-md overflow-hidden bg-neutral-900 relative shadow-lg">
                  <SafeImage
                    src={vid.thumbnail}
                    alt={vid.title}
                    useBase64
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="hidden md:flex absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 items-center justify-center transition-opacity">
                    <div className="w-11 h-11 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg">
                      <Play className="w-4 h-4 fill-white ml-0.5" />
                    </div>
                  </div>
                  {vid.duration && (
                    <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/85 text-[10px] font-mono text-white">
                      {vid.duration}
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <h4 className="text-[13px] font-bold text-white line-clamp-2 leading-snug group-hover:text-red-400 transition-colors">
                    {vid.title}
                  </h4>
                  <p className="text-xs text-neutral-400 truncate mt-0.5">{vid.artist}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Made For You Mix Preview Modal */}
      {activeMixModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setActiveMixModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-2xl max-h-[88vh] bg-[#111114] border border-white/10 rounded-t-3xl sm:rounded-2xl overflow-hidden flex flex-col shadow-2xl"
          >
            <div className={`p-5 sm:p-6 bg-gradient-to-br ${activeMixModal.gradient} relative`}>
              <button
                type="button"
                onClick={() => setActiveMixModal(null)}
                className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/50 hover:bg-black/75 text-white flex items-center justify-center cursor-pointer"
                aria-label="閉じる"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-end gap-4 pr-10">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden bg-black/30 shadow-xl shrink-0">
                  {activeMixModal.coverUrl && (
                    <SafeImage
                      src={activeMixModal.coverUrl}
                      alt={activeMixModal.title}
                      useBase64
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 space-y-1">
                  <span className="inline-block px-2 py-0.5 rounded bg-black/50 text-[10px] font-black tracking-wider text-white">
                    {activeMixModal.badge}
                  </span>
                  <h3 className="text-xl sm:text-2xl font-black text-white leading-tight">
                    {activeMixModal.title}
                  </h3>
                  <p className="text-xs text-white/85 line-clamp-2">
                    {activeMixModal.subtitle} · {activeMixModal.tracks.length}曲
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const playable = activeMixModal.tracks.filter((t) => !isTrackBlocked(t));
                    if (playable.length > 0) {
                      playTrack(playable[0], playable);
                      setActiveMixModal(null);
                    }
                  }}
                  className="px-4 py-2 rounded-full bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>すべて再生</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const playable = activeMixModal.tracks
                      .filter((t) => !isTrackBlocked(t))
                      .sort(() => Math.random() - 0.5);
                    if (playable.length > 0) {
                      playTrack(playable[0], playable);
                      setActiveMixModal(null);
                    }
                  }}
                  className="px-4 py-2 rounded-full bg-black/50 hover:bg-black/70 text-white text-xs font-bold flex items-center gap-1.5 border border-white/15 cursor-pointer"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  <span>シャッフル</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const playable = activeMixModal.tracks.filter((t) => !isTrackBlocked(t));
                    if (playable.length > 0) {
                      saveTracksAsPlaylist(activeMixModal.title, playable);
                      showToast(`「${activeMixModal.title}」をマイプレイリストに保存しました`, 'success', 2500);
                    }
                  }}
                  className="px-3.5 py-2 rounded-full bg-black/50 hover:bg-black/70 text-white text-xs font-bold flex items-center gap-1.5 border border-white/15 cursor-pointer"
                >
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  <span>プレイリストに保存</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-white/5 p-2 sm:p-3">
              {activeMixModal.tracks
                .filter((t) => !isTrackBlocked(t))
                .map((track, idx) => (
                  <div
                    key={`mix-row-${track.id}-${idx}`}
                    onClick={() => playTrack(track, activeMixModal.tracks)}
                    className="flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors"
                  >
                    <span className="w-5 text-center text-xs font-mono text-neutral-500 shrink-0">
                      {idx + 1}
                    </span>
                    <SafeImage
                      src={track.thumbnail}
                      alt={track.title}
                      useBase64
                      className="w-10 h-10 rounded object-cover bg-neutral-800 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{track.title}</p>
                      <p className="text-xs text-neutral-400 truncate">{track.artist}</p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          playNext(track);
                        }}
                        className="p-2 text-neutral-400 hover:text-red-400 cursor-pointer"
                        title="次に再生"
                      >
                        <ListStart className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openFreemakeModal(track);
                        }}
                        className="p-2 text-neutral-400 hover:text-sky-400 cursor-pointer"
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
                        className="p-2 text-neutral-400 hover:text-white cursor-pointer"
                        title="楽曲の詳細"
                      >
                        <Info className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          hideTrack(track);
                        }}
                        className="p-2 text-neutral-400 hover:text-red-400 cursor-pointer"
                        title="この曲を非表示"
                      >
                        <EyeOff className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
