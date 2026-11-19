import React, { useEffect, useState } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { api } from '../services/api';
import { CommentEmotionData, Track } from '../types/music';
import { SafeImage } from './SafeImage';
import {
  X,
  Play,
  ListStart,
  ListPlus,
  Share2,
  Calendar,
  Eye,
  ThumbsUp,
  Disc,
  Users,
  Sparkles,
  EyeOff,
  Ban,
  CheckCircle2,
  Loader2,
  FileText,
  ExternalLink,
  Clock,
} from 'lucide-react';

interface RichTrackDetails {
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
}

export const TrackDetailModal: React.FC = () => {
  const {
    trackDetailModalTrack: track,
    closeTrackDetailModal,
    playTrack,
    playNext,
    openAddToPlaylistModal,
    openShareModal,
    navigateTo,
    setSearchQuery,
    hideTrack,
    unhideTrack,
    hiddenTrackIds,
    blockArtist,
    unblockArtist,
    isArtistBlocked,
    showToast,
  } = usePlayer();

  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<RichTrackDetails | null>(null);
  const [emotions, setEmotions] = useState<CommentEmotionData | null>(null);
  const [fallbackRelatedArtists, setFallbackRelatedArtists] = useState<
    { id?: string; name: string; thumbnail?: string }[]
  >([]);

  useEffect(() => {
    if (!track) return;
    let cancelled = false;
    setLoading(true);
    setDetails(null);
    setEmotions(null);
    setFallbackRelatedArtists([]);

    if (track.isLocal) {
      setLoading(false);
      return;
    }

    (async () => {
      const [detailRes, emoRes, relRes] = await Promise.all([
        api.getTrackDetails(track.id).catch(() => null),
        api.getTrackCommentEmotions(track.id, track.title, track.artist).catch(() => null),
        api.getRelated(track.id).catch(() => [] as Track[]),
      ]);

      if (cancelled) return;
      if (detailRes?.details) {
        setDetails(detailRes.details);
      }
      if (emoRes) {
        setEmotions(emoRes);
      }

      // Build fallback related artists from related tracks & artist endpoint
      const artistMap = new Map<string, { id?: string; name: string; thumbnail?: string }>();
      const primaryName = (track.artist || '').toLowerCase();

      const resolvedArtistId = track.artistId || detailRes?.details?.channelId;
      if (resolvedArtistId) {
        const artistData = await api.getArtist(resolvedArtistId).catch(() => null);
        if (!cancelled && artistData?.relatedArtists) {
          for (const ra of artistData.relatedArtists) {
            if (ra?.name && ra.name.toLowerCase() !== primaryName && !artistMap.has(ra.name.toLowerCase())) {
              artistMap.set(ra.name.toLowerCase(), {
                id: ra.id,
                name: ra.name,
                thumbnail: ra.thumbnail,
              });
            }
          }
        }
      }

      if (!cancelled) {
        for (const rt of detailRes?.details?.relatedArtists || []) {
          if (rt?.name && rt.name.toLowerCase() !== primaryName && !artistMap.has(rt.name.toLowerCase())) {
            artistMap.set(rt.name.toLowerCase(), rt);
          }
        }
        for (const rel of relRes || []) {
          if (
            rel?.artist &&
            rel.artist.toLowerCase() !== primaryName &&
            !artistMap.has(rel.artist.toLowerCase())
          ) {
            artistMap.set(rel.artist.toLowerCase(), {
              id: rel.artistId,
              name: rel.artist,
              thumbnail: rel.thumbnail,
            });
          }
          if (artistMap.size >= 8) break;
        }
        setFallbackRelatedArtists(Array.from(artistMap.values()).slice(0, 8));
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [track?.id]);

  if (!track) return null;

  const isHidden = hiddenTrackIds.has(track.id);
  const artistBlocked = isArtistBlocked(track.artist);
  const resolvedArtistId = track.artistId || details?.channelId;
  const resolvedAlbumTitle = track.album || details?.albumTitle;
  const resolvedAlbumId = track.albumId || details?.albumId;
  const displayViews = details?.viewCountText || track.views || '集計中';
  const displayLikes =
    details?.likeCount && details.likeCount > 0
      ? details.likeCount.toLocaleString()
      : '—';

  const handleOpenArtist = (name: string, id?: string) => {
    closeTrackDetailModal();
    if (id && (id.startsWith('UC') || id.startsWith('MP'))) {
      navigateTo('artist', id);
    } else {
      setSearchQuery(name);
      navigateTo('search');
    }
  };

  const handleOpenAlbum = () => {
    if (!resolvedAlbumTitle && !resolvedAlbumId) return;
    closeTrackDetailModal();
    if (resolvedAlbumId) {
      navigateTo('album', resolvedAlbumId);
    } else if (resolvedAlbumTitle) {
      setSearchQuery(`${track.artist} ${resolvedAlbumTitle}`);
      navigateTo('search');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[75] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={closeTrackDetailModal}
    >
      <div
        className="w-full sm:max-w-lg max-h-[90vh] bg-[#121216] border border-white/10 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-[#16161b]">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-bold text-white tracking-wide">
              楽曲の詳細・クレジット
            </h2>
          </div>
          <button
            type="button"
            onClick={closeTrackDetailModal}
            className="p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Track Hero */}
          <div className="flex items-center gap-4">
            <SafeImage
              src={track.thumbnail}
              alt={track.title}
              useBase64
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl object-cover bg-neutral-800 shadow-xl shrink-0"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="text-base sm:text-lg font-black text-white leading-snug line-clamp-2">
                {track.title}
              </h3>
              <button
                type="button"
                onClick={() => handleOpenArtist(track.artist, resolvedArtistId)}
                className="text-sm font-semibold text-red-400 hover:text-red-300 hover:underline flex items-center gap-1 truncate cursor-pointer"
              >
                <span className="truncate">{track.artist}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </button>
              {resolvedAlbumTitle && (
                <button
                  type="button"
                  onClick={handleOpenAlbum}
                  className="text-xs text-neutral-400 hover:text-white flex items-center gap-1.5 truncate cursor-pointer"
                >
                  <Disc className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  <span className="truncate">{resolvedAlbumTitle}</span>
                </button>
              )}
              <div className="flex items-center gap-2 pt-0.5 text-[11px] text-neutral-500 font-mono">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {track.duration || '—'}
                </span>
                {details?.category && (
                  <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 font-sans">
                    {details.category}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => {
                playTrack(track);
                closeTrackDetailModal();
              }}
              className="py-2.5 px-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex flex-col items-center gap-1 transition-colors cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>今すぐ再生</span>
            </button>
            <button
              type="button"
              onClick={() => {
                playNext(track);
              }}
              className="py-2.5 px-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold flex flex-col items-center gap-1 transition-colors cursor-pointer"
            >
              <ListStart className="w-4 h-4 text-red-400" />
              <span>次に再生</span>
            </button>
            <button
              type="button"
              onClick={() => {
                openAddToPlaylistModal(track);
              }}
              className="py-2.5 px-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold flex flex-col items-center gap-1 transition-colors cursor-pointer"
            >
              <ListPlus className="w-4 h-4 text-neutral-300" />
              <span>プレイリスト</span>
            </button>
            <button
              type="button"
              onClick={() => {
                openShareModal('track');
              }}
              className="py-2.5 px-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold flex flex-col items-center gap-1 transition-colors cursor-pointer"
            >
              <Share2 className="w-4 h-4 text-neutral-300" />
              <span>共有</span>
            </button>
          </div>

          {/* Stats Grid */}
          {loading ? (
            <div className="py-8 flex items-center justify-center gap-2 text-xs text-neutral-400">
              <Loader2 className="w-4 h-4 animate-spin text-red-500" />
              <span>楽曲詳細を取得中...</span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div className="p-3 rounded-xl bg-neutral-900/80 border border-white/5 space-y-1">
                  <span className="text-[11px] text-neutral-500 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-red-400" />
                    投稿日・公開日
                  </span>
                  <p className="text-xs sm:text-sm font-bold text-white truncate">
                    {details?.publishedDate || '情報なし'}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-neutral-900/80 border border-white/5 space-y-1">
                  <span className="text-[11px] text-neutral-500 flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5 text-red-400" />
                    再生回数
                  </span>
                  <p className="text-xs sm:text-sm font-bold text-white truncate">
                    {displayViews || '—'}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-neutral-900/80 border border-white/5 space-y-1 col-span-2 sm:col-span-1">
                  <span className="text-[11px] text-neutral-500 flex items-center gap-1">
                    <ThumbsUp className="w-3.5 h-3.5 text-red-400" />
                    高評価 / ムード
                  </span>
                  <p className="text-xs sm:text-sm font-bold text-white truncate">
                    {displayLikes !== '—'
                      ? `${displayLikes}`
                      : emotions?.dominantMoodName || '標準'}
                  </p>
                </div>
              </div>

              {/* Comment Emotion Tags */}
              {emotions && (emotions.emotionTags?.length > 0 || emotions.summary) && (
                <div className="p-3.5 rounded-xl bg-red-950/20 border border-red-500/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-red-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      ムード・リスナーの感想 ({emotions.dominantMoodName})
                    </span>
                  </div>
                  {emotions.summary && (
                    <p className="text-xs text-neutral-300 leading-relaxed">{emotions.summary}</p>
                  )}
                  {emotions.emotionTags?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {emotions.emotionTags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-full bg-black/50 border border-red-500/30 text-[11px] text-red-200 font-medium"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Related Artists */}
              {fallbackRelatedArtists.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-red-500" />
                    <span>関連アーティスト</span>
                  </h4>
                  <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
                    {fallbackRelatedArtists.map((ra) => (
                      <button
                        key={ra.name}
                        type="button"
                        onClick={() => handleOpenArtist(ra.name, ra.id)}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-neutral-900 hover:bg-neutral-800 border border-white/10 shrink-0 transition-colors cursor-pointer"
                      >
                        {ra.thumbnail && (
                          <SafeImage
                            src={ra.thumbnail}
                            alt={ra.name}
                            useBase64
                            className="w-6 h-6 rounded-full object-cover shrink-0"
                          />
                        )}
                        <span className="text-xs font-semibold text-white whitespace-nowrap">
                          {ra.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Description / Credits */}
              {details?.description && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-neutral-400" />
                    <span>概要・クレジット</span>
                  </h4>
                  <div className="p-3 rounded-xl bg-neutral-900/60 border border-white/5 text-xs text-neutral-300 whitespace-pre-line leading-relaxed max-h-40 overflow-y-auto">
                    {details.description}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Hide / Block Artist Controls */}
          <div className="pt-3 border-t border-white/10 space-y-2">
            <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider block">
              好みに合わせて除外・非表示
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  if (isHidden) {
                    unhideTrack(track.id);
                    showToast(`「${track.title}」の非表示を解除しました`, 'success', 2000);
                  } else {
                    hideTrack(track);
                    closeTrackDetailModal();
                  }
                }}
                className={`px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition-colors cursor-pointer ${
                  isHidden
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/60'
                    : 'bg-neutral-900 hover:bg-red-950/40 border-white/10 hover:border-red-500/40 text-neutral-200 hover:text-red-300'
                }`}
              >
                {isHidden ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>この曲の非表示を解除</span>
                  </>
                ) : (
                  <>
                    <EyeOff className="w-4 h-4" />
                    <span>この曲を非表示にする</span>
                  </>
                )}
              </button>

              {track.artist && (
                <button
                  type="button"
                  onClick={() => {
                    if (artistBlocked) {
                      unblockArtist(track.artist);
                      showToast(`「${track.artist}」のブロックを解除しました`, 'success', 2000);
                    } else {
                      blockArtist(track.artist);
                      closeTrackDetailModal();
                    }
                  }}
                  className={`px-3 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition-colors cursor-pointer ${
                    artistBlocked
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/60'
                      : 'bg-neutral-900 hover:bg-red-950/40 border-white/10 hover:border-red-500/40 text-neutral-200 hover:text-red-300'
                  }`}
                >
                  {artistBlocked ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>アーティスト除外を解除</span>
                    </>
                  ) : (
                    <>
                      <Ban className="w-4 h-4" />
                      <span>このアーティストを再生しない</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
