import React, { useEffect, useState } from 'react';
import {
  Podcast,
  Search,
  Play,
  Tv,
  Headphones,
  Download,
  Check,
  Loader2,
  Bookmark,
  BookmarkCheck,
  ArrowLeft,
  Clock,
  Sparkles,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { api } from '../services/api';
import { saveOfflineTrack } from '../services/offlineStorage';
import { recordDownloadHistory } from '../services/downloadHistory';
import { PodcastEpisode, PodcastShow, Track } from '../types/music';

const TOPIC_CHIPS = [
  'テクノロジー',
  'ビジネス',
  'お笑い・トーク',
  'ニュース',
  '英語学習',
  '音楽解説',
  'サイエンス',
];

function episodeToTrack(ep: PodcastEpisode, show: PodcastShow): Track {
  return {
    id: ep.id,
    title: ep.title,
    artist: ep.artist || show.author || show.title,
    album: show.title,
    thumbnail: ep.thumbnail || show.thumbnail,
    duration: ep.duration || '0:00',
    durationSeconds: ep.durationSeconds || 0,
    trackType: 'podcast',
    audioUrl: ep.audioUrl,
    podcastShowId: show.id,
    podcastShowTitle: show.title,
    podcastFeedUrl: show.feedUrl,
    podcastVideoId: ep.videoId,
    publishDate: ep.publishDate,
    description: ep.description,
  };
}

export const PodcastsView: React.FC = () => {
  const {
    playTrack,
    setPlayerMode,
    subscribedPodcasts,
    toggleSubscribePodcast,
    isPodcastSubscribed,
    showToast,
    currentTrack,
    isPlaying,
  } = usePlayer();

  const [query, setQuery] = useState<string>('');
  const [shows, setShows] = useState<PodcastShow[]>([]);
  const [videoEpisodes, setVideoEpisodes] = useState<PodcastEpisode[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searching, setSearching] = useState<boolean>(false);

  const [selectedShow, setSelectedShow] = useState<PodcastShow | null>(null);
  const [showEpisodes, setShowEpisodes] = useState<PodcastEpisode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState<boolean>(false);

  const [savingEpisodeId, setSavingEpisodeId] = useState<string | null>(null);
  const [savedEpisodeIds, setSavedEpisodeIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .discoverPodcasts()
      .then((res) => {
        if (!cancelled) {
          setShows(res.shows || []);
          setVideoEpisodes(res.videoEpisodes || []);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSearch = async (searchTerm?: string) => {
    const q = (searchTerm !== undefined ? searchTerm : query).trim();
    if (!q) {
      setSelectedShow(null);
      setLoading(true);
      try {
        const res = await api.discoverPodcasts();
        setShows(res.shows || []);
        setVideoEpisodes(res.videoEpisodes || []);
      } finally {
        setLoading(false);
      }
      return;
    }

    setSearching(true);
    setSelectedShow(null);
    try {
      const res = await api.searchPodcasts(q);
      setShows(res.shows || []);
      setVideoEpisodes(res.videoEpisodes || []);
    } catch {
      showToast('ポッドキャスト検索に失敗しました', 'warning', 2500);
    } finally {
      setSearching(false);
    }
  };

  const openShowDetail = async (show: PodcastShow) => {
    setSelectedShow(show);
    setShowEpisodes([]);
    setLoadingEpisodes(true);
    try {
      const res = await api.getPodcastShow({
        id: show.id,
        feedUrl: show.feedUrl,
        title: show.title,
        author: show.author,
        thumbnail: show.thumbnail,
        isVideoShow: show.isVideoShow,
      });
      if (res.show) setSelectedShow(res.show);
      setShowEpisodes(res.episodes || []);
    } catch {
      showToast('エピソード一覧の取得に失敗しました', 'warning', 2600);
    } finally {
      setLoadingEpisodes(false);
    }
  };

  const handlePlayEpisode = (ep: PodcastEpisode, show: PodcastShow, forceVideo = false) => {
    const allTracks = showEpisodes.map((e) => episodeToTrack(e, show));
    const target = episodeToTrack(ep, show);
    if (forceVideo && ep.videoId) {
      setPlayerMode('video');
    } else if (!forceVideo && ep.audioUrl) {
      setPlayerMode('cover');
    }
    playTrack(target, allTracks.length > 0 ? allTracks : [target], {
      source: 'ポッドキャスト再生中',
      subtitle: show.title,
    });
  };

  const handlePlayVideoPodcast = (ep: PodcastEpisode, asVideo: boolean) => {
    const virtualShow: PodcastShow = {
      id: `yt_${ep.videoId || ep.id}`,
      title: ep.showTitle || ep.artist || '動画ポッドキャスト',
      author: ep.artist,
      thumbnail: ep.thumbnail,
      isVideoShow: true,
    };
    const allTracks = videoEpisodes.map((e) =>
      episodeToTrack(e, {
        id: `yt_${e.videoId || e.id}`,
        title: e.showTitle || e.artist,
        author: e.artist,
        thumbnail: e.thumbnail,
        isVideoShow: true,
      })
    );
    setPlayerMode(asVideo ? 'video' : 'cover');
    playTrack(episodeToTrack(ep, virtualShow), allTracks, {
      source: asVideo ? '動画ポッドキャスト (MVモード)' : 'ポッドキャスト (音声のみ)',
      subtitle: ep.artist,
    });
  };

  const handleSaveEpisodeOffline = async (ep: PodcastEpisode, show: PodcastShow) => {
    if (!ep.audioUrl) {
      showToast('YouTube動画ポッドキャストの音声保存はFreemakeダウンローダーをご利用ください', 'info', 3000);
      return;
    }
    setSavingEpisodeId(ep.id);
    try {
      const resp = await fetch(`/api/podcasts/proxy-audio?url=${encodeURIComponent(ep.audioUrl)}`);
      if (!resp.ok) throw new Error('音声ファイルのダウンロードに失敗しました');
      const blob = await resp.blob();
      const mime = blob.type || resp.headers.get('content-type') || 'audio/mpeg';
      const ext = mime.includes('m4a') || mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'mp3';
      const saved = await saveOfflineTrack(
        blob,
        ep.title,
        ep.artist || show.author || show.title,
        show.title,
        ep.durationSeconds || 0,
        ep.duration || '0:00',
        ep.thumbnail || show.thumbnail,
        ext
      );
      recordDownloadHistory({
        title: ep.title,
        artist: ep.artist || show.author || show.title,
        album: show.title,
        filename: `${ep.title.slice(0, 60)}.${ext}`,
        formatExt: ext,
        mimeType: mime,
        fileSize: blob.size,
        thumbnail: ep.thumbnail || show.thumbnail,
        sourceLabel: 'ポッドキャスト オフライン保存',
        target: 'offline',
        offlineTrackId: saved.id,
        duration: ep.duration,
        durationSeconds: ep.durationSeconds,
      });
      setSavedEpisodeIds((prev) => new Set(prev).add(ep.id));
      showToast(`「${ep.title}」をオフラインライブラリに保存しました`, 'success', 2800);
    } catch (err: any) {
      showToast(err?.message || 'オフライン保存に失敗しました', 'warning', 3000);
    } finally {
      setSavingEpisodeId(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 pb-32 max-w-6xl mx-auto space-y-6">
      {/* Top Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Podcast className="w-7 h-7 text-emerald-400" />
            <span>ポッドキャスト ＆ ビデオラジオ</span>
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            音声RSS番組の登録・倍速・±15/30秒スキップ・オフライン保存 ＋ YouTube動画ポッドキャスト対応
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSearch();
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="番組名・パーソナリティ・テーマを検索（例: 英語, 雑談, テック）"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500/60"
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold cursor-pointer transition-colors disabled:opacity-60 shrink-0"
        >
          {searching ? '検索中...' : '検索'}
        </button>
      </form>

      {/* Topic Chips */}
      <div className="flex flex-wrap gap-1.5">
        {TOPIC_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => {
              setQuery(chip);
              handleSearch(chip);
            }}
            className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-medium text-neutral-300 hover:text-white cursor-pointer transition-colors"
          >
            #{chip}
          </button>
        ))}
      </div>

      {/* Selected Show Episodes View */}
      {selectedShow && (
        <div className="rounded-2xl bg-[#111117] border border-neutral-800 overflow-hidden animate-in fade-in duration-150">
          <div className="p-4 sm:p-5 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-neutral-900/50">
            <div className="flex items-center gap-4 min-w-0">
              <button
                type="button"
                onClick={() => setSelectedShow(null)}
                className="w-9 h-9 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white flex items-center justify-center cursor-pointer shrink-0"
                title="番組一覧へ戻る"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              {selectedShow.thumbnail && (
                <img
                  src={selectedShow.thumbnail}
                  alt={selectedShow.title}
                  className="w-16 h-16 rounded-xl object-cover bg-neutral-800 shrink-0"
                />
              )}
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-extrabold text-white truncate">
                  {selectedShow.title}
                </h2>
                <p className="text-xs text-neutral-400 truncate">{selectedShow.author}</p>
                {selectedShow.genre && (
                  <span className="inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    {selectedShow.genre}
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => toggleSubscribePodcast(selectedShow)}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border transition-colors shrink-0 ${
                isPodcastSubscribed(selectedShow.id)
                  ? 'bg-emerald-600 text-white border-emerald-500'
                  : 'bg-neutral-800 hover:bg-neutral-700 text-white border-neutral-700'
              }`}
            >
              {isPodcastSubscribed(selectedShow.id) ? (
                <>
                  <BookmarkCheck className="w-4 h-4" />
                  <span>登録済み</span>
                </>
              ) : (
                <>
                  <Bookmark className="w-4 h-4" />
                  <span>番組を登録</span>
                </>
              )}
            </button>
          </div>

          {loadingEpisodes ? (
            <div className="p-10 flex items-center justify-center gap-2 text-neutral-400 text-sm">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
              <span>RSSエピソードを読み込み中...</span>
            </div>
          ) : showEpisodes.length === 0 ? (
            <div className="p-8 text-center text-sm text-neutral-400">
              再生可能なエピソードが見つかりませんでした。
            </div>
          ) : (
            <div className="divide-y divide-neutral-800/70">
              {showEpisodes.map((ep) => {
                const isActive = currentTrack?.id === ep.id;
                const isSaved = savedEpisodeIds.has(ep.id);
                const isSaving = savingEpisodeId === ep.id;
                return (
                  <div
                    key={ep.id}
                    className={`p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-neutral-900/50 transition-colors ${
                      isActive ? 'bg-emerald-950/20' : ''
                    }`}
                  >
                    <div
                      onClick={() => handlePlayEpisode(ep, selectedShow)}
                      className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                    >
                      <button
                        type="button"
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 cursor-pointer ${
                          isActive && isPlaying
                            ? 'bg-emerald-500 text-black'
                            : 'bg-neutral-800 text-white hover:bg-emerald-600'
                        }`}
                      >
                        <Play className="w-4 h-4 fill-current" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-bold text-white truncate">
                          {ep.title}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-neutral-400 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {ep.duration || 'エピソード'}
                          </span>
                          {ep.publishDate && (
                            <span>· {new Date(ep.publishDate).toLocaleDateString('ja-JP')}</span>
                          )}
                        </div>
                        {ep.description && (
                          <p className="text-[11px] text-neutral-500 mt-1 line-clamp-1">
                            {ep.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {ep.videoId && (
                        <button
                          type="button"
                          onClick={() => handlePlayEpisode(ep, selectedShow, true)}
                          className="px-2.5 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Tv className="w-3 h-3" />
                          <span>動画</span>
                        </button>
                      )}
                      {ep.audioUrl && (
                        <button
                          type="button"
                          onClick={() => handleSaveEpisodeOffline(ep, selectedShow)}
                          disabled={isSaving || isSaved}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer border transition-colors ${
                            isSaved
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                              : 'bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-200'
                          }`}
                          title="オフライン再生用にダウンロード保存"
                        >
                          {isSaving ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : isSaved ? (
                            <Check className="w-3.5 h-3.5" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          <span className="hidden sm:inline">
                            {isSaved ? '保存済み' : 'オフライン'}
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Subscribed Shows Shelf */}
      {!selectedShow && subscribedPodcasts.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-extrabold text-white flex items-center gap-2">
            <BookmarkCheck className="w-4 h-4 text-emerald-400" />
            <span>登録中の番組 ({subscribedPodcasts.length})</span>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {subscribedPodcasts.map((show) => (
              <button
                key={show.id}
                type="button"
                onClick={() => openShowDetail(show)}
                className="p-3 rounded-xl bg-neutral-900/80 hover:bg-neutral-800 border border-neutral-800 text-left transition-colors cursor-pointer group"
              >
                <img
                  src={show.thumbnail}
                  alt={show.title}
                  className="w-full aspect-square rounded-lg object-cover bg-neutral-800 mb-2.5"
                />
                <p className="text-xs font-bold text-white truncate group-hover:text-emerald-400">
                  {show.title}
                </p>
                <p className="text-[11px] text-neutral-400 truncate mt-0.5">{show.author}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Audio RSS Shows Grid */}
      {!selectedShow && (
        <section className="space-y-3">
          <h2 className="text-base font-extrabold text-white flex items-center gap-2">
            <Headphones className="w-4 h-4 text-emerald-400" />
            <span>人気＆検索ポッドキャスト番組</span>
          </h2>
          {loading ? (
            <div className="py-12 flex items-center justify-center gap-2 text-neutral-400 text-sm">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
              <span>ポッドキャスト番組を取得中...</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
              {shows.map((show) => (
                <button
                  key={show.id}
                  type="button"
                  onClick={() => openShowDetail(show)}
                  className="p-3 rounded-xl bg-[#111117] hover:bg-neutral-900 border border-neutral-800/80 text-left transition-all cursor-pointer group"
                >
                  <div className="relative">
                    <img
                      src={show.thumbnail}
                      alt={show.title}
                      className="w-full aspect-square rounded-lg object-cover bg-neutral-800 mb-2.5"
                    />
                    {show.genre && (
                      <span className="absolute bottom-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded bg-black/75 text-emerald-300 border border-emerald-500/30">
                        {show.genre}
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-emerald-400">
                    {show.title}
                  </p>
                  <p className="text-[11px] text-neutral-400 truncate mt-0.5">{show.author}</p>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* YouTube Video Podcasts Shelf */}
      {!selectedShow && videoEpisodes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-extrabold text-white flex items-center gap-2">
            <Tv className="w-4 h-4 text-red-400" />
            <span>YouTube 動画ポッドキャスト ＆ ラジオ（音声/動画 切替対応）</span>
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {videoEpisodes.map((ep) => (
              <div
                key={ep.id}
                className="p-3 rounded-xl bg-[#111117] border border-neutral-800/80 flex items-center gap-3"
              >
                <img
                  src={ep.thumbnail}
                  alt={ep.title}
                  className="w-20 h-14 rounded-lg object-cover bg-neutral-800 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-bold text-white line-clamp-1">{ep.title}</p>
                  <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                    {ep.artist} · {ep.duration}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => handlePlayVideoPodcast(ep, false)}
                      className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Headphones className="w-3 h-3 text-emerald-400" />
                      <span>音声で聴く</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePlayVideoPodcast(ep, true)}
                      className="px-2.5 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Tv className="w-3 h-3" />
                      <span>動画で見る</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
