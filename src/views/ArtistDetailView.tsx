import React, { useEffect, useState } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { api } from '../services/api';
import { Artist, Track, Album, Playlist, ArtistLiveSetlist } from '../types/music';
import { SafeImage } from '../components/SafeImage';
import {
  ArrowLeft,
  Play,
  Pause,
  Heart,
  Plus,
  Loader2,
  Radio,
  ListMusic,
  BookmarkPlus,
  Check,
  Mic2,
  Share2,
  ExternalLink,
  Youtube,
  Search,
  ListStart,
  Info,
  Ban,
  MoreHorizontal,
  Shuffle,
  Users,
  QrCode,
  Film,
  X,
  UserMinus,
  UserPlus,
  Sparkles,
  Download,
} from 'lucide-react';

const RELATED_FALLBACK_NAMES = [
  'Vaundy',
  'Mrs. GREEN APPLE',
  'YOASOBI',
  'King Gnu',
  'back number',
  '緑黄色社会',
  'RADWIMPS',
];

export const ArtistDetailView: React.FC = () => {
  const {
    selectedEntityId,
    navigateTo,
    playTrack,
    togglePlay,
    isPlaying,
    addToQueue,
    playNext,
    toggleLikeTrack,
    likedTrackIds,
    likedAlbumIds,
    toggleLikeAlbum,
    followedArtistIds,
    toggleFollowArtist,
    currentTrack,
    startRadioForTrack,
    saveTracksAsPlaylist,
    showToast,
    openVisualShareCard,
    openZeroCodeModal,
    setSearchQuery,
    openTrackDetailModal,
    openFreemakeModal,
    blockArtist,
    unblockArtist,
    isArtistBlocked,
    isTrackBlocked,
  } = usePlayer();

  const [header, setHeader] = useState<Artist | null>(null);
  const [topSongs, setTopSongs] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [singles, setSingles] = useState<Album[]>([]);
  const [relatedArtists, setRelatedArtists] = useState<Artist[]>([]);
  const [featuredPlaylists, setFeaturedPlaylists] = useState<Playlist[]>([]);
  const [liveSetlists, setLiveSetlists] = useState<ArtistLiveSetlist[]>([]);
  const [artistClips, setArtistClips] = useState<Track[]>([]);
  const [clipsLoading, setClipsLoading] = useState(false);
  const [activeClip, setActiveClip] = useState<Track | null>(null);
  const [artistTab, setArtistTab] = useState<'music' | 'clips'>('music');
  const [artistMenuOpen, setArtistMenuOpen] = useState(false);

  const [setlistsLoading, setSetlistsLoading] = useState(false);
  const [savedSetlistIds, setSavedSetlistIds] = useState<Set<string>>(new Set());
  const [bioExpanded, setBioExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedEntityId) return;
    let active = true;
    setLoading(true);
    setLiveSetlists([]);
    setRelatedArtists([]);
    setFeaturedPlaylists([]);
    setArtistClips([]);
    setActiveClip(null);
    setArtistTab('music');
    setArtistMenuOpen(false);
    setBioExpanded(false);

    api
      .getArtist(selectedEntityId)
      .then((res) => {
        if (!active) return;
        const normalizedHeader = res.header?.id
          ? res.header
          : { ...res.header, id: selectedEntityId };
        setHeader(normalizedHeader);
        setTopSongs(res.topSongs || []);
        setAlbums(res.albums || []);
        setSingles(res.singles || []);
        setFeaturedPlaylists(res.featuredPlaylists || []);
        const apiRelated = res.relatedArtists || [];
        setRelatedArtists(apiRelated);
        setLoading(false);

        if (apiRelated.length === 0 && normalizedHeader?.name) {
          const candidates = RELATED_FALLBACK_NAMES.filter(
            (n) => n.toLowerCase() !== normalizedHeader.name.toLowerCase()
          ).slice(0, 6);
          Promise.all(
            candidates.map(async (name) => {
              try {
                const sRes = await api.search(name, 'artist');
                const a = sRes?.results?.[0] || sRes?.artists?.[0];
                if (a?.name && a?.thumbnail) {
                  return {
                    id: a.id || `rel-${name}`,
                    name: a.name,
                    thumbnail: a.thumbnail,
                    subscribers: a.subscribers,
                  } as Artist;
                }
                return null;
              } catch {
                return null;
              }
            })
          ).then((list) => {
            if (!active) return;
            const valid = list.filter((x): x is Artist => Boolean(x));
            if (valid.length > 0) {
              setRelatedArtists(valid);
            }
          });
        }

        if (normalizedHeader?.name) {
          setSetlistsLoading(true);
          api
            .getArtistSetlists(normalizedHeader.name)
            .then((setRes) => {
              if (!active) return;
              setLiveSetlists(setRes.setlists || []);
            })
            .catch(() => {})
            .finally(() => {
              if (active) setSetlistsLoading(false);
            });

          setClipsLoading(true);
          api
            .search(`${normalizedHeader.name} Live MV Shorts`, 'video')
            .then((vidRes) => {
              if (!active) return;
              const vids: Track[] = vidRes?.results || vidRes?.videos || [];
              setArtistClips(vids.slice(0, 12));
            })
            .catch(() => {})
            .finally(() => {
              if (active) setClipsLoading(false);
            });
        }
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedEntityId]);

  const handleSaveSetlist = (setlist: ArtistLiveSetlist) => {
    saveTracksAsPlaylist(setlist.title, setlist.tracks);
    setSavedSetlistIds((prev) => new Set(prev).add(setlist.id));
    showToast(`セットリスト「${setlist.title}」を保存しました`, 'success', 2500);
  };

  if (loading) {
    return (
      <div className="py-32 flex flex-col items-center justify-center gap-3 text-neutral-400">
        <Loader2 className="w-8 h-8 animate-spin text-red-500" />
        <p className="text-xs">アーティスト情報を読み込み中...</p>
      </div>
    );
  }

  if (error || !header) {
    return (
      <div className="py-20 text-center space-y-3">
        <p className="text-neutral-400 text-sm">アーティスト情報の読み込みに失敗しました</p>
        <button
          type="button"
          onClick={() => navigateTo('home')}
          className="px-5 py-2 bg-neutral-800 text-white text-xs font-bold rounded-full cursor-pointer"
        >
          ホームに戻る
        </button>
      </div>
    );
  }

  const isFollowed = followedArtistIds.has(header.id);
  const isBlocked = isArtistBlocked(header.name);
  const isArtistPlaying = isPlaying && topSongs.some((t) => t.id === currentTrack?.id);

  const handlePlayArtist = () => {
    if (topSongs.length === 0) return;
    if (topSongs.some((t) => t.id === currentTrack?.id)) {
      togglePlay();
    } else {
      playTrack(topSongs[0], topSongs, {
        source: 'アーティストから再生中',
        subtitle: header.name,
      });
    }
  };

  const handleShuffleArtist = () => {
    if (topSongs.length === 0) return;
    const shuffled = [...topSongs].sort(() => Math.random() - 0.5);
    playTrack(shuffled[0], shuffled, {
      source: 'アーティストからシャッフル再生',
      subtitle: header.name,
    });
  };

  const leadClip = artistClips[0] || topSongs[0];
  const latestAlbum = albums[0] || singles[0];
  const featuredSetlist = liveSetlists[0];

  return (
    <div className="space-y-7 pb-24">
      {/* Artist Header (IMG_0286 style) */}
      <div className="-mx-4 sm:-mx-6 md:-mx-8 -mt-6 px-4 sm:px-6 md:px-8 pt-4 pb-2 bg-gradient-to-b from-[#5a1219] via-[#26090d] to-[#070708]">
        <button
          type="button"
          onClick={() => navigateTo('home')}
          className="min-w-[44px] min-h-[44px] -ml-2 inline-flex items-center justify-center text-white/85 hover:text-white transition-colors cursor-pointer"
          aria-label="戻る"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>

        <div className="mt-2 flex flex-col sm:flex-row sm:items-end gap-5 sm:gap-7">
          <div className="w-40 h-40 sm:w-48 sm:h-48 mx-auto sm:mx-0 rounded-full overflow-hidden shadow-[0_18px_50px_rgba(0,0,0,0.7)] bg-neutral-800 shrink-0 ring-1 ring-white/10">
            <SafeImage
              src={header.thumbnail}
              alt={header.name}
              useBase64
              className="w-full h-full object-cover"
            />
          </div>

          <div className="flex-1 min-w-0 space-y-1.5 text-left">
            <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
              {header.name}
            </h1>
            {header.subscribers && (
              <p className="text-xs sm:text-sm text-neutral-300 font-medium tabular-nums">
                {header.subscribers}
              </p>
            )}
          </div>
        </div>

        {/* Action Row: Tiny Clips Thumbnail + Follow + (...) Menu on left, Shuffle + Big Play on right */}
        <div className="mt-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {leadClip && (
              <button
                type="button"
                onClick={() => {
                  if (artistClips.length > 0) {
                    setActiveClip(artistClips[0]);
                  } else {
                    setArtistTab('clips');
                  }
                }}
                title="Clipsを見る"
                className="relative w-9 h-12 rounded-md overflow-hidden border-2 border-white/75 bg-neutral-900 shadow-md shrink-0 cursor-pointer hover:scale-105 transition-transform"
              >
                <SafeImage
                  src={leadClip.thumbnail}
                  alt="Clips"
                  useBase64
                  className="w-full h-full object-cover"
                />
              </button>
            )}

            <button
              type="button"
              onClick={() => toggleFollowArtist(header)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                isFollowed
                  ? 'border-white text-white bg-white/10'
                  : 'border-white/40 text-white hover:border-white'
              }`}
            >
              {isFollowed ? 'フォロー中' : 'フォローする'}
            </button>

            <button
              type="button"
              onClick={() => setArtistMenuOpen(true)}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center text-neutral-300 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
              title="アーティストメニュー"
              aria-label="アーティストメニュー"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>

            {isBlocked && (
              <span className="px-2.5 py-1 rounded-full bg-red-600/25 text-red-300 border border-red-500/40 text-[11px] font-bold">
                ブロック中
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {topSongs.length > 0 && (
              <button
                type="button"
                onClick={handleShuffleArtist}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center text-neutral-200 hover:text-red-400 transition-colors cursor-pointer"
                title="シャッフル再生"
                aria-label="シャッフル再生"
              >
                <Shuffle className="w-5 h-5" />
              </button>
            )}
            {topSongs.length > 0 && (
              <button
                type="button"
                onClick={handlePlayArtist}
                className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-xl shadow-red-600/30 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                title={isArtistPlaying ? '一時停止' : '全曲再生'}
                aria-label={isArtistPlaying ? '一時停止' : '全曲再生'}
              >
                {isArtistPlaying ? (
                  <Pause className="w-6 h-6 fill-white" />
                ) : (
                  <Play className="w-6 h-6 fill-white ml-0.5" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* 音楽 | Clips Tab Switcher (IMG_0286 / IMG_0290) */}
        <div className="mt-5 flex items-center gap-6 border-b border-white/10">
          <button
            type="button"
            onClick={() => setArtistTab('music')}
            className={`pb-2.5 text-sm font-black transition-colors relative cursor-pointer ${
              artistTab === 'music' ? 'text-white' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <span>音楽</span>
            {artistTab === 'music' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500 rounded-full" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setArtistTab('clips')}
            className={`pb-2.5 text-sm font-black transition-colors relative flex items-center gap-1.5 cursor-pointer ${
              artistTab === 'clips' ? 'text-white' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <span>Clips</span>
            {artistClips.length > 0 && (
              <span className="text-[10px] font-mono text-neutral-400">
                ({artistClips.length})
              </span>
            )}
            {artistTab === 'clips' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-500 rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* Artist More Actions Bottom Sheet (IMG_0287 parity) */}
      {artistMenuOpen && (
        <div
          className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150"
          onClick={() => setArtistMenuOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-[#16161b] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pt-3 pb-1 flex justify-center sm:hidden">
              <div className="w-10 h-1 rounded-full bg-neutral-600" />
            </div>

            <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3.5">
              <SafeImage
                src={header.thumbnail}
                alt={header.name}
                useBase64
                className="w-12 h-12 rounded-full object-cover bg-neutral-800 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-white truncate">{header.name}</h3>
                {header.subscribers && (
                  <p className="text-xs text-neutral-400 truncate">{header.subscribers}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setArtistMenuOpen(false)}
                className="p-1.5 rounded-full text-neutral-400 hover:text-white cursor-pointer"
                aria-label="閉じる"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  setArtistMenuOpen(false);
                  openVisualShareCard({ type: 'artist', artist: header });
                }}
                className="w-full px-3 py-3.5 rounded-xl text-left text-[15px] font-semibold text-white hover:bg-white/5 flex items-center gap-4 transition-colors cursor-pointer"
              >
                <Share2 className="w-5 h-5 text-neutral-300" />
                <span>シェア（アーティストカード・リンク）</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  toggleFollowArtist(header);
                  setArtistMenuOpen(false);
                }}
                className="w-full px-3 py-3.5 rounded-xl text-left text-[15px] font-semibold text-white hover:bg-white/5 flex items-center gap-4 transition-colors cursor-pointer"
              >
                {isFollowed ? (
                  <UserMinus className="w-5 h-5 text-neutral-300" />
                ) : (
                  <UserPlus className="w-5 h-5 text-neutral-300" />
                )}
                <span>{isFollowed ? 'フォローを解除' : 'フォローする'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isBlocked) {
                    unblockArtist(header.name);
                  } else {
                    blockArtist(header.name);
                  }
                  setArtistMenuOpen(false);
                }}
                className="w-full px-3 py-3.5 rounded-xl text-left text-[15px] font-semibold text-white hover:bg-white/5 flex items-center gap-4 transition-colors cursor-pointer"
              >
                <Ban className={`w-5 h-5 ${isBlocked ? 'text-red-500' : 'text-neutral-300'}`} />
                <span>
                  {isBlocked ? '再生ブロックを解除' : 'このアーティストは再生しない'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setArtistMenuOpen(false);
                  navigateTo('party');
                }}
                className="w-full px-3 py-3.5 rounded-xl text-left text-[15px] font-semibold text-white hover:bg-white/5 flex items-center gap-4 transition-colors cursor-pointer"
              >
                <Users className="w-5 h-5 text-neutral-300" />
                <span>Jamを開始</span>
              </button>

              {topSongs.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setArtistMenuOpen(false);
                    startRadioForTrack(topSongs[0]);
                  }}
                  className="w-full px-3 py-3.5 rounded-xl text-left text-[15px] font-semibold text-white hover:bg-white/5 flex items-center gap-4 transition-colors cursor-pointer"
                >
                  <Radio className="w-5 h-5 text-neutral-300" />
                  <span>アーティストラジオに移動</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setArtistMenuOpen(false);
                  openZeroCodeModal({
                    type: 'artist',
                    title: header.name,
                    subtitle: header.subscribers || 'アーティスト',
                    imageUrl: header.thumbnail,
                    url: `${window.location.origin}/?artist=${encodeURIComponent(header.id)}`,
                    codeValue: `zeromusic:artist:${header.id}`,
                    artistId: header.id,
                  });
                }}
                className="w-full px-3 py-3.5 rounded-xl text-left text-[15px] font-semibold text-white hover:bg-white/5 flex items-center gap-4 transition-colors cursor-pointer"
              >
                <QrCode className="w-5 h-5 text-neutral-300" />
                <span>zero-musicコードを表示</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vertical Clips Player Modal (IMG_0288) */}
      {activeClip && (
        <div
          className="fixed inset-0 z-[80] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setActiveClip(null)}
        >
          <div
            className="w-full max-w-md bg-[#121216] border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Film className="w-4 h-4 text-red-500 shrink-0" />
                <span className="text-xs font-bold text-white truncate">{activeClip.title}</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveClip(null)}
                className="p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 cursor-pointer"
                aria-label="閉じる"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative w-full aspect-[9/14] sm:aspect-video bg-black">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${activeClip.id}?autoplay=1&rel=0&playsinline=1`}
                title={activeClip.title}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>

            <div className="p-4 flex items-center justify-between gap-3 bg-[#141418]">
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">{activeClip.title}</p>
                <p className="text-[11px] text-neutral-400 truncate">{header.name}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  playTrack(activeClip, artistClips, {
                    source: 'Clipsから再生中',
                    subtitle: header.name,
                  });
                  setActiveClip(null);
                }}
                className="px-3.5 py-2 rounded-full bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>音声プレイヤーで聴く</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CLIPS TAB VIEW */}
      {artistTab === 'clips' && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
              {header.name}のClips
            </h2>
            {clipsLoading && (
              <span className="text-xs text-neutral-400 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-red-500" />
                <span>読み込み中...</span>
              </span>
            )}
          </div>

          {artistClips.length === 0 && !clipsLoading ? (
            <div className="py-16 text-center text-xs text-neutral-500 bg-neutral-900/40 border border-white/5 rounded-2xl">
              利用可能なClips・ショート動画が見つかりませんでした。
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
              {artistClips.map((clip) => (
                <button
                  key={clip.id}
                  type="button"
                  onClick={() => setActiveClip(clip)}
                  className="group relative aspect-[9/14] rounded-2xl overflow-hidden bg-neutral-900 border border-white/10 text-left shadow-lg cursor-pointer"
                >
                  <SafeImage
                    src={clip.thumbnail}
                    alt={clip.title}
                    useBase64
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                  <div className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full bg-black/65 backdrop-blur flex items-center justify-center text-white">
                    <Play className="w-4 h-4 fill-white ml-0.5" />
                  </div>
                  <div className="absolute bottom-3 left-3 right-3">
                    <p className="text-xs font-bold text-white line-clamp-2 leading-snug">
                      {clip.title}
                    </p>
                    {clip.duration && (
                      <span className="inline-block mt-1 text-[10px] font-mono text-neutral-300">
                        {clip.duration}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* MUSIC TAB VIEW */}
      {artistTab === 'music' && (
        <>
          {/* 人気の曲 (Top Songs) */}
          {topSongs.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                人気の曲
              </h2>
              <div className="space-y-0.5">
                {topSongs.map((track, idx) => {
                  const isCurrent = currentTrack?.id === track.id;
                  const isLiked = likedTrackIds.has(track.id);
                  const trackBlocked = isTrackBlocked(track);

                  return (
                    <div
                      key={track.id || idx}
                      onClick={() =>
                        playTrack(track, topSongs, {
                          source: 'アーティストから再生中',
                          subtitle: header.name,
                        })
                      }
                      className={`flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 group transition-colors cursor-pointer ${
                        isCurrent ? 'bg-white/5' : ''
                      } ${trackBlocked ? 'opacity-45' : ''}`}
                    >
                      <span className="w-5 text-center text-xs font-mono font-bold text-neutral-400 tabular-nums shrink-0">
                        {idx + 1}
                      </span>

                      <SafeImage
                        src={track.thumbnail}
                        alt={track.title}
                        useBase64
                        className="w-12 h-12 rounded object-cover bg-neutral-800 shrink-0"
                      />

                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm sm:text-[15px] font-semibold truncate ${
                            isCurrent ? 'text-red-500 font-bold' : 'text-white'
                          }`}
                        >
                          {track.title}
                        </p>
                        <p className="text-xs text-neutral-400 truncate mt-0.5">
                          {track.views || track.album || track.artist}
                        </p>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLikeTrack(track);
                          }}
                          className={`min-w-[36px] min-h-[36px] flex items-center justify-center transition-colors cursor-pointer ${
                            isLiked ? 'text-red-500' : 'text-neutral-400 hover:text-white'
                          }`}
                          title={isLiked ? 'お気に入り解除' : 'お気に入りに追加'}
                          aria-label={isLiked ? 'お気に入り解除' : 'お気に入りに追加'}
                        >
                          <Heart className={`w-4.5 h-4.5 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            playNext(track);
                          }}
                          className="min-w-[36px] min-h-[36px] flex items-center justify-center text-neutral-400 hover:text-red-400 transition-colors cursor-pointer"
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
                          className="min-w-[36px] min-h-[36px] flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
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
                          className="min-w-[36px] min-h-[36px] flex items-center justify-center text-neutral-400 hover:text-sky-400 transition-colors cursor-pointer"
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
                          className="min-w-[36px] min-h-[36px] flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
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

          {/* アーティストからのおすすめ (Artist Pick, IMG_0290) */}
          {(featuredSetlist || latestAlbum) && (
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                アーティストからのおすすめ
              </h2>
              <div
                onClick={() => {
                  if (featuredSetlist && featuredSetlist.tracks.length > 0) {
                    playTrack(featuredSetlist.tracks[0], featuredSetlist.tracks, {
                      source: 'アーティストのおすすめから再生中',
                      subtitle: featuredSetlist.title,
                    });
                  } else if (latestAlbum) {
                    navigateTo('album', latestAlbum.id);
                  }
                }}
                className="flex items-center gap-3.5 p-3 rounded-2xl bg-[#141419] hover:bg-[#1a1a22] border border-white/10 transition-colors cursor-pointer group"
              >
                <SafeImage
                  src={featuredSetlist?.thumbnail || latestAlbum?.thumbnail || header.thumbnail}
                  alt={featuredSetlist?.title || latestAlbum?.title || header.name}
                  useBase64
                  className="w-20 h-20 rounded-xl object-cover bg-neutral-800 shrink-0 shadow-md"
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white text-black text-[11px] font-bold max-w-full shadow">
                    <img
                      src={header.thumbnail}
                      alt=""
                      className="w-4 h-4 rounded-full object-cover shrink-0"
                    />
                    <span className="truncate">
                      {featuredSetlist
                        ? `${header.name} ピックアップセットリスト ✨`
                        : `${header.name} 最新ピックアップ ✨`}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white truncate group-hover:text-red-400 transition-colors">
                    {featuredSetlist?.title || latestAlbum?.title}
                  </h3>
                  <p className="text-xs text-neutral-400">
                    {featuredSetlist
                      ? `プレイリスト · ${featuredSetlist.tracks.length}曲`
                      : `アルバム${latestAlbum?.year ? ` · ${latestAlbum.year}` : ''}`}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* ディスコグラフィ / アルバム (最新リリース強調付き, IMG_0290) */}
          {albums.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                  ディスコグラフィ
                </h2>
              </div>

              <div className="flex md:grid md:grid-cols-4 lg:grid-cols-6 gap-3.5 overflow-x-auto md:overflow-visible pb-2 scrollbar-none snap-x">
                {albums.map((album, aIdx) => {
                  const isLikedAlbum = likedAlbumIds.has(album.id);
                  return (
                    <div
                      key={album.id}
                      onClick={() => navigateTo('album', album.id)}
                      className="group w-36 sm:w-40 md:w-auto shrink-0 snap-start cursor-pointer flex flex-col gap-2"
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
                            toggleLikeAlbum({
                              ...album,
                              artist: album.artist || header.name,
                              artistId: header.id,
                            });
                          }}
                          className={`absolute top-2 right-2 z-10 w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center transition-all cursor-pointer ${
                            isLikedAlbum
                              ? 'bg-black/75 text-red-500 opacity-100'
                              : 'bg-black/60 text-white/80 hover:text-red-400 opacity-90 sm:opacity-0 sm:group-hover:opacity-100'
                          }`}
                          title={isLikedAlbum ? 'お気に入り解除' : 'お気に入りに追加'}
                        >
                          <Heart
                            className={`w-4 h-4 ${isLikedAlbum ? 'fill-red-500 text-red-500' : ''}`}
                          />
                        </button>
                      </div>
                      <div className="min-w-0">
                        {aIdx === 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-400 uppercase tracking-wider mb-0.5">
                            <Sparkles className="w-2.5 h-2.5" />
                            <span>最新リリース</span>
                          </span>
                        )}
                        <h4 className="text-xs sm:text-sm font-bold text-white line-clamp-2 leading-snug group-hover:underline">
                          {album.title}
                        </h4>
                        <p className="text-[11px] text-neutral-400 mt-0.5">
                          アルバム{album.year ? ` · ${album.year}` : ''}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* シングルと EP */}
          {singles.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                シングルと EP
              </h2>

              <div className="flex md:grid md:grid-cols-4 lg:grid-cols-6 gap-3.5 overflow-x-auto md:overflow-visible pb-2 scrollbar-none snap-x">
                {singles.map((single) => {
                  const isLikedSingle = likedAlbumIds.has(single.id);
                  return (
                    <div
                      key={single.id}
                      onClick={() => navigateTo('album', single.id)}
                      className="group w-36 sm:w-40 md:w-auto shrink-0 snap-start cursor-pointer flex flex-col gap-2"
                    >
                      <div className="aspect-square rounded-md overflow-hidden bg-neutral-900 relative shadow-md">
                        <SafeImage
                          src={single.thumbnail}
                          alt={single.title}
                          useBase64
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLikeAlbum({
                              ...single,
                              artist: single.artist || header.name,
                              artistId: header.id,
                            });
                          }}
                          className={`absolute top-2 right-2 z-10 w-8 h-8 rounded-full backdrop-blur-md flex items-center justify-center transition-all cursor-pointer ${
                            isLikedSingle
                              ? 'bg-black/75 text-red-500 opacity-100'
                              : 'bg-black/60 text-white/80 hover:text-red-400 opacity-90 sm:opacity-0 sm:group-hover:opacity-100'
                          }`}
                          title={isLikedSingle ? 'お気に入り解除' : 'お気に入りに追加'}
                        >
                          <Heart
                            className={`w-4 h-4 ${isLikedSingle ? 'fill-red-500 text-red-500' : ''}`}
                          />
                        </button>
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs sm:text-sm font-bold text-white line-clamp-2 leading-snug group-hover:underline">
                          {single.title}
                        </h4>
                        <p className="text-[11px] text-neutral-400 mt-0.5">
                          シングル{single.year ? ` · ${single.year}` : ''}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* {header.name}のClips Horizontal Carousel (IMG_0288) */}
          {artistClips.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                  {header.name}のClips
                </h2>
                <button
                  type="button"
                  onClick={() => setArtistTab('clips')}
                  className="text-xs font-bold text-neutral-400 hover:text-white cursor-pointer"
                >
                  すべて表示
                </button>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none snap-x">
                {artistClips.slice(0, 8).map((clip) => (
                  <button
                    key={clip.id}
                    type="button"
                    onClick={() => setActiveClip(clip)}
                    className="group relative w-36 sm:w-44 aspect-[9/14] shrink-0 snap-start rounded-2xl overflow-hidden bg-neutral-900 border border-white/10 text-left shadow-lg cursor-pointer"
                  >
                    <SafeImage
                      src={clip.thumbnail}
                      alt={clip.title}
                      useBase64
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-transparent" />
                    <div className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/65 flex items-center justify-center text-white">
                      <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
                    </div>
                    <div className="absolute bottom-2.5 left-2.5 right-2.5">
                      <p className="text-xs font-bold text-white line-clamp-2 leading-snug">
                        {clip.title}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ここでも聴ける {artist} */}
          <section className="space-y-3">
            <h2 className="text-lg sm:text-xl font-black text-white tracking-tight truncate">
              ここでも聴ける {header.name}
            </h2>

            <div className="flex md:grid md:grid-cols-4 lg:grid-cols-6 gap-3.5 overflow-x-auto md:overflow-visible pb-2 scrollbar-none snap-x">
              {topSongs.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    playTrack(topSongs[0], topSongs, {
                      source: 'アーティストから再生中',
                      subtitle: `This Is ${header.name}`,
                    })
                  }
                  className="group w-36 sm:w-40 md:w-auto shrink-0 snap-start text-left cursor-pointer flex flex-col gap-2"
                >
                  <div className="aspect-square w-full rounded-md overflow-hidden bg-white relative shadow-md flex flex-col">
                    <div className="bg-white px-2 pt-1.5 pb-1 text-center shrink-0">
                      <span className="text-[10px] font-black tracking-[0.18em] text-neutral-950 uppercase">
                        THIS IS
                      </span>
                    </div>
                    <div className="relative flex-1 bg-red-600/90 flex flex-col justify-end">
                      <div className="absolute inset-x-3 -top-0.5 bottom-5 rounded-sm overflow-hidden shadow bg-neutral-900">
                        <SafeImage
                          src={header.thumbnail}
                          alt={header.name}
                          useBase64
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                      <div className="relative z-10 px-2 pb-1 text-center">
                        <span className="text-[10px] font-black text-white truncate block">
                          {header.name}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-white line-clamp-2 leading-snug group-hover:underline">
                    This Is {header.name}
                  </span>
                </button>
              )}

              {topSongs.length > 0 && (
                <button
                  type="button"
                  onClick={() => startRadioForTrack(topSongs[0])}
                  className="group w-36 sm:w-40 md:w-auto shrink-0 snap-start text-left cursor-pointer flex flex-col gap-2"
                >
                  <div className="aspect-square w-full rounded-md overflow-hidden bg-neutral-900 relative shadow-md">
                    <SafeImage
                      src={header.thumbnail}
                      alt={`${header.name} Radio`}
                      useBase64
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/35" />
                    <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-black tracking-wider text-white flex items-center gap-1">
                      <Radio className="w-3 h-3 text-red-500" />
                      RADIO
                    </span>
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-white line-clamp-2 leading-snug group-hover:underline">
                    {header.name} Radio
                  </span>
                </button>
              )}

              {featuredPlaylists.map((pl) => (
                <div
                  key={pl.id}
                  onClick={() => navigateTo('album', pl.id)}
                  className="group w-36 sm:w-40 md:w-auto shrink-0 snap-start cursor-pointer flex flex-col gap-2"
                >
                  <div className="aspect-square rounded-md overflow-hidden bg-neutral-900 relative shadow-md">
                    <SafeImage
                      src={pl.thumbnail}
                      alt={pl.title}
                      useBase64
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-white line-clamp-2 leading-snug group-hover:underline">
                    {pl.title}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* ファンの間で人気 */}
          {relatedArtists.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                ファンの間で人気
              </h2>

              <div className="flex gap-4 overflow-x-auto pb-2 -mx-3 px-3 scrollbar-none snap-x snap-mandatory">
                {relatedArtists.map((rel) => (
                  <button
                    key={rel.id}
                    type="button"
                    onClick={() => {
                      if (rel.id.startsWith('UC')) {
                        navigateTo('artist', rel.id);
                      } else {
                        setSearchQuery(rel.name);
                        navigateTo('search');
                      }
                    }}
                    className="w-[124px] sm:w-[144px] shrink-0 snap-start group flex flex-col items-center text-center gap-2.5 cursor-pointer"
                  >
                    <div className="w-[124px] h-[124px] sm:w-[144px] sm:h-[144px] rounded-full overflow-hidden bg-neutral-900 shadow-lg ring-1 ring-white/5 group-hover:ring-red-500/60 transition-all">
                      <SafeImage
                        src={rel.thumbnail}
                        alt={rel.name}
                        useBase64
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                    <span className="text-[13px] font-bold text-white line-clamp-1 group-hover:text-red-400 transition-colors w-full">
                      {rel.name}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ライブ・セットリスト再現 */}
          {(setlistsLoading || liveSetlists.length > 0) && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
                  <Mic2 className="w-5 h-5 text-red-500" />
                  <span>ライブ・セットリスト再現</span>
                </h2>
                {setlistsLoading && (
                  <span className="text-xs text-neutral-400 flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-red-500" />
                    <span>検索中...</span>
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {liveSetlists.map((setlist) => {
                  const isSaved = savedSetlistIds.has(setlist.id);
                  return (
                    <div
                      key={setlist.id}
                      className="rounded-xl bg-[#121216] border border-white/10 overflow-hidden flex flex-col"
                    >
                      <div className="p-4 flex items-center justify-between gap-3 border-b border-white/5">
                        <div className="flex items-center gap-3 min-w-0">
                          <SafeImage
                            src={setlist.thumbnail}
                            alt={setlist.title}
                            useBase64
                            className="w-12 h-12 rounded object-cover bg-neutral-800 shrink-0"
                          />
                          <div className="min-w-0">
                            <span className="text-[11px] font-bold text-red-400 flex items-center gap-1">
                              <ListMusic className="w-3 h-3" />
                              <span>{setlist.tracks.length}曲</span>
                            </span>
                            <h3 className="text-sm font-bold text-white truncate">
                              {setlist.title}
                            </h3>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleSaveSetlist(setlist)}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 border transition-colors cursor-pointer ${
                              isSaved
                                ? 'bg-neutral-800 text-red-400 border-red-700/50'
                                : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border-white/15'
                            }`}
                          >
                            {isSaved ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <BookmarkPlus className="w-3.5 h-3.5" />
                            )}
                            <span className="hidden sm:inline">{isSaved ? '保存済み' : '保存'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (setlist.tracks.length > 0) {
                                playTrack(setlist.tracks[0], setlist.tracks, {
                                  source: 'セットリストから再生中',
                                  subtitle: setlist.title,
                                });
                              }
                            }}
                            className="px-3.5 py-1.5 rounded-full bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>再生</span>
                          </button>
                        </div>
                      </div>

                      <div className="divide-y divide-white/5 max-h-60 overflow-y-auto">
                        {setlist.tracks.map((tr, tIdx) => {
                          const active = currentTrack?.id === tr.id;
                          return (
                            <div
                              key={`${tr.id}-${tIdx}`}
                              role="button"
                              tabIndex={0}
                              onClick={() =>
                                playTrack(tr, setlist.tracks, {
                                  source: 'セットリストから再生中',
                                  subtitle: setlist.title,
                                })
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  playTrack(tr, setlist.tracks, {
                                    source: 'セットリストから再生中',
                                    subtitle: setlist.title,
                                  });
                                }
                              }}
                              className={`w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-white/5 transition-colors cursor-pointer ${
                                active ? 'bg-white/5' : ''
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="w-5 text-xs font-mono font-bold text-red-400 shrink-0 tabular-nums">
                                  {String(tr.setlistIndex || tIdx + 1).padStart(2, '0')}
                                </span>
                                <span
                                  className={`text-xs font-semibold truncate ${
                                    active ? 'text-red-400' : 'text-neutral-200'
                                  }`}
                                >
                                  {tr.title}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openFreemakeModal(tr);
                                  }}
                                  className="p-1 text-neutral-400 hover:text-sky-400 transition-colors cursor-pointer"
                                  title="ダウンロード・保存"
                                  aria-label="ダウンロード・保存"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                                {tr.duration && (
                                  <span className="text-[11px] font-mono text-neutral-500 shrink-0 tabular-nums">
                                    {tr.duration}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* 詳細情報 + フォロワー数・SNSリンク */}
          <section className="space-y-4">
            <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">詳細情報</h2>
            <div className="rounded-xl bg-[#121216] p-5 space-y-5">
              {header.subscribers && (
                <div className="text-lg sm:text-xl font-black text-white tabular-nums">
                  {header.subscribers}
                </div>
              )}

              {header.description && (
                <div>
                  <p
                    className={`text-sm text-neutral-300 leading-relaxed whitespace-pre-line ${
                      bioExpanded ? '' : 'line-clamp-4'
                    }`}
                  >
                    {header.description}
                  </p>
                  <button
                    type="button"
                    onClick={() => setBioExpanded((prev) => !prev)}
                    className="mt-2 text-xs font-bold text-white hover:underline cursor-pointer"
                  >
                    {bioExpanded ? '詳細を閉じる' : '...もっと見る'}
                  </button>
                </div>
              )}

              <div className="pt-4 border-t border-white/10 space-y-4">
                {header.subscribers && (
                  <div>
                    <div className="text-2xl font-black text-white tracking-tight tabular-nums">
                      {header.subscribers}
                    </div>
                    <div className="text-xs text-neutral-400 font-medium mt-0.5">
                      フォロワー・登録者
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  {header.id?.startsWith('UC') && (
                    <a
                      href={`https://music.youtube.com/channel/${header.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-lg text-sm font-semibold text-white hover:bg-white/5 transition-colors"
                    >
                      <span className="flex items-center gap-3">
                        <Youtube className="w-5 h-5 text-red-500" />
                        <span>YouTube Music 公式ページ</span>
                      </span>
                      <ExternalLink className="w-4 h-4 text-neutral-400" />
                    </a>
                  )}
                  <a
                    href={`https://x.com/search?q=${encodeURIComponent(header.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-lg text-sm font-semibold text-white hover:bg-white/5 transition-colors"
                  >
                    <span className="flex items-center gap-3">
                      <span className="w-5 h-5 flex items-center justify-center font-black text-sm text-white">
                        𝕏
                      </span>
                      <span>X で「{header.name}」を探す</span>
                    </span>
                    <ExternalLink className="w-4 h-4 text-neutral-400" />
                  </a>
                  <a
                    href={`https://www.instagram.com/explore/tags/${encodeURIComponent(
                      header.name.replace(/\s+/g, '')
                    )}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-lg text-sm font-semibold text-white hover:bg-white/5 transition-colors"
                  >
                    <span className="flex items-center gap-3">
                      <Search className="w-5 h-5 text-neutral-300" />
                      <span>Instagram で関連投稿を見る</span>
                    </span>
                    <ExternalLink className="w-4 h-4 text-neutral-400" />
                  </a>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
