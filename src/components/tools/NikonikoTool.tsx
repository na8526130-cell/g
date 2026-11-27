import React, { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Eye,
  Flame,
  Loader2,
  MessageSquare,
  Play,
  Search,
  Tv,
} from 'lucide-react';
import { usePlayer } from '../../context/PlayerContext';

interface NicoVideoItem {
  id: string;
  title: string;
  channel: string;
  channelAvatar?: string;
  thumbnail: string;
  duration: string;
  views: number;
  commentCount: number;
  mylistCount: number;
  uploadedAt?: string;
  description?: string;
  tags?: string[];
}

interface NicoCommentItem {
  id: string;
  text: string;
  timeMs: number;
  color: string;
  position: 'naka' | 'ue' | 'shita';
  size: 'medium' | 'big' | 'small';
}

const GENRES = [
  { id: 'all', label: '総合' },
  { id: 'music_sound', label: '音楽・サウンド' },
  { id: 'game', label: 'ゲーム' },
  { id: 'anime', label: 'アニメ' },
  { id: 'entertainment', label: 'エンタメ' },
  { id: 'dance', label: '踊ってみた' },
];

export const NikonikoTool: React.FC = () => {
  const { isPlaying: mainIsPlaying, togglePlay: toggleMainPlay } = usePlayer();
  const [genre, setGenre] = useState('all');
  const [term, setTerm] = useState<'24h' | 'hour' | 'week'>('24h');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<NicoVideoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedVideo, setSelectedVideo] = useState<NicoVideoItem | null>(null);
  const [comments, setComments] = useState<NicoCommentItem[]>([]);
  const [showDanmaku, setShowDanmaku] = useState(true);
  const [quality, setQuality] = useState('720');
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [videoLoading, setVideoLoading] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const loadRanking = async (targetGenre = genre, targetTerm = term) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(
        `/api/tools/nikoniko/ranking?genre=${encodeURIComponent(targetGenre)}&term=${encodeURIComponent(targetTerm)}`
      );
      const data = await resp.json();
      if (!data.success) throw new Error(data.error || 'ランキング取得失敗');
      setItems(data.items || []);
    } catch (e: any) {
      setError(e?.message || '読み込みエラー');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRanking(genre, term);
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      await loadRanking(genre, term);
      return;
    }
    if (/^(sm|so|nm)\d+$/i.test(q)) {
      await openVideo({
        id: q,
        title: `動画 ${q}`,
        channel: 'ニコニコ動画',
        thumbnail: '',
        duration: '',
        views: 0,
        commentCount: 0,
        mylistCount: 0,
      });
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/tools/nikoniko/search?q=${encodeURIComponent(q)}&sort=v`);
      const data = await resp.json();
      if (!data.success) throw new Error(data.error || '検索失敗');
      setItems(data.items || []);
    } catch (e: any) {
      setError(e?.message || '検索エラー');
    } finally {
      setLoading(false);
    }
  };

  const attachHls = (videoId: string, q: string) => {
    const el = videoRef.current;
    if (!el) return;
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const streamUrl = `/api/tools/nikoniko/hls/${encodeURIComponent(videoId)}/master.m3u8?quality=${encodeURIComponent(q)}`;
    if (Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(el);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setVideoLoading(false);
        el.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          setVideoLoading(false);
          setError('HLSストリームの再生に失敗しました（有料/限定動画の可能性があります）');
        }
      });
    } else if (el.canPlayType('application/vnd.apple.mpegurl')) {
      el.src = streamUrl;
      el.play().catch(() => {});
      setVideoLoading(false);
    }
  };

  const openVideo = async (item: NicoVideoItem) => {
    if (mainIsPlaying) toggleMainPlay();
    setSelectedVideo(item);
    setComments([]);
    setError(null);
    setVideoLoading(true);
    setCurrentTimeMs(0);

    try {
      const [metaRes, comRes] = await Promise.all([
        fetch(`/api/tools/nikoniko/video/${encodeURIComponent(item.id)}`).then((r) => r.json()).catch(() => null),
        fetch(`/api/tools/nikoniko/comments/${encodeURIComponent(item.id)}`).then((r) => r.json()).catch(() => null),
      ]);
      if (metaRes?.success && metaRes.video) {
        setSelectedVideo(metaRes.video);
      }
      if (comRes?.success && Array.isArray(comRes.comments)) {
        setComments(comRes.comments);
      }
    } finally {
      setTimeout(() => attachHls(item.id, quality), 40);
    }
  };

  const visibleDanmaku = useMemo(() => {
    if (!showDanmaku || comments.length === 0) return [];
    const windowStart = currentTimeMs - 3600;
    const windowEnd = currentTimeMs + 300;
    return comments
      .filter((c) => c.timeMs >= windowStart && c.timeMs <= windowEnd)
      .slice(-18);
  }, [comments, currentTimeMs, showDanmaku]);

  return (
    <div className="flex flex-col gap-4">
      {/* Top Search & Genre Controls */}
      <div className="flex flex-col gap-2.5 bg-[#101014] border border-neutral-800/90 rounded-2xl p-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <form onSubmit={handleSearch} className="flex-1 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="キーワード または sm123456 などの動画IDを入力..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-red-500"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors cursor-pointer shrink-0"
            >
              検索
            </button>
          </form>

          <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-xl border border-neutral-800 shrink-0">
            {(
              [
                { id: 'hour', label: '毎時' },
                { id: '24h', label: '24時間' },
                { id: 'week', label: '週間' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTerm(t.id);
                  loadRanking(genre, t.id);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                  term === t.id ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {GENRES.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                setGenre(g.id);
                setQuery('');
                loadRanking(g.id, term);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                genre === g.id
                  ? 'bg-white text-black'
                  : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-950/60 border border-red-800/60 text-xs text-red-200">
          {error}
        </div>
      )}

      {/* Selected Video Player + Danmaku Overlay + Comment Drawer */}
      {selectedVideo && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 bg-[#0d0d10] border border-neutral-800 rounded-2xl p-3 sm:p-4">
          <div className="lg:col-span-2 flex flex-col gap-3">
            <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-neutral-800">
              <video
                ref={videoRef}
                controls
                playsInline
                onTimeUpdate={(e) => setCurrentTimeMs(e.currentTarget.currentTime * 1000)}
                className="w-full h-full object-contain"
              />
              {videoLoading && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center gap-2 text-xs text-neutral-200 pointer-events-none">
                  <Loader2 className="w-5 h-5 animate-spin text-red-500" />
                  <span>ニコニコ動画ストリーム読込中...</span>
                </div>
              )}
              {showDanmaku && visibleDanmaku.length > 0 && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  {visibleDanmaku.map((c, idx) => {
                    const progress = Math.min(1, Math.max(0, (currentTimeMs - c.timeMs) / 3600));
                    const topPct =
                      c.position === 'ue'
                        ? 8 + (idx % 3) * 7
                        : c.position === 'shita'
                        ? 75 - (idx % 3) * 7
                        : 10 + ((idx * 17) % 72);
                    const style: React.CSSProperties =
                      c.position === 'naka'
                        ? {
                            top: `${topPct}%`,
                            left: `${100 - progress * 125}%`,
                            color: c.color,
                            textShadow: '0 1px 3px rgba(0,0,0,0.95)',
                          }
                        : {
                            top: `${topPct}%`,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            color: c.color,
                            textShadow: '0 1px 3px rgba(0,0,0,0.95)',
                          };
                    return (
                      <span
                        key={c.id}
                        style={style}
                        className="absolute whitespace-nowrap font-bold text-sm sm:text-base"
                      >
                        {c.text}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-white leading-snug">{selectedVideo.title}</h3>
                <div className="text-xs text-neutral-400 mt-1 flex flex-wrap items-center gap-3">
                  <span>{selectedVideo.channel}</span>
                  <span>再生 {selectedVideo.views.toLocaleString()}</span>
                  <span>コメント {selectedVideo.commentCount.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowDanmaku((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                    showDanmaku
                      ? 'bg-red-600/20 border-red-500/50 text-red-200'
                      : 'bg-neutral-900 border-neutral-800 text-neutral-400'
                  }`}
                >
                  弾幕 {showDanmaku ? 'ON' : 'OFF'}
                </button>
                <select
                  value={quality}
                  onChange={(e) => {
                    const q = e.target.value;
                    setQuality(q);
                    attachHls(selectedVideo.id, q);
                  }}
                  className="bg-neutral-900 border border-neutral-800 text-xs text-white rounded-lg px-2 py-1.5"
                >
                  <option value="1080">1080p</option>
                  <option value="720">720p</option>
                  <option value="480">480p</option>
                  <option value="360">360p</option>
                </select>
              </div>
            </div>

            {selectedVideo.description && (
              <p className="text-xs text-neutral-400 leading-relaxed whitespace-pre-line line-clamp-4 bg-neutral-950/70 p-3 rounded-xl border border-neutral-800/70">
                {selectedVideo.description}
              </p>
            )}
          </div>

          {/* Comment List */}
          <div className="bg-neutral-950 border border-neutral-800/80 rounded-xl p-3 flex flex-col max-h-[380px]">
            <div className="text-xs font-bold text-neutral-200 pb-2 mb-2 border-b border-neutral-800 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-neutral-400" />
                コメント ({comments.length})
              </span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {comments.length === 0 ? (
                <div className="text-xs text-neutral-500 py-8 text-center">コメントはありません</div>
              ) : (
                comments.slice(0, 200).map((c) => {
                  const sec = Math.floor(c.timeMs / 1000);
                  const mm = Math.floor(sec / 60);
                  const ss = String(sec % 60).padStart(2, '0');
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        if (videoRef.current) videoRef.current.currentTime = c.timeMs / 1000;
                      }}
                      className="w-full text-left text-xs px-2 py-1 rounded hover:bg-neutral-900 flex items-start gap-2 cursor-pointer"
                    >
                      <span className="font-mono text-[10px] text-neutral-500 shrink-0 mt-0.5">
                        {mm}:{ss}
                      </span>
                      <span className="text-neutral-200 break-words">{c.text}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Ranking / Search Grid */}
      {loading ? (
        <div className="py-16 flex items-center justify-center gap-2 text-neutral-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-red-500" />
          <span>ニコニコ動画から読み込み中...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {items.map((item, idx) => (
            <button
              key={`${item.id}-${idx}`}
              type="button"
              onClick={() => openVideo(item)}
              className={`group text-left rounded-xl border overflow-hidden transition-all cursor-pointer flex flex-col ${
                selectedVideo?.id === item.id
                  ? 'bg-red-950/20 border-red-500/60'
                  : 'bg-[#101014] border-neutral-800/90 hover:border-neutral-700'
              }`}
            >
              <div className="relative aspect-video bg-neutral-900 overflow-hidden">
                {item.thumbnail ? (
                  <img
                    src={item.thumbnail}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Tv className="w-6 h-6 text-neutral-700" />
                  </div>
                )}
                {item.duration && (
                  <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/85 text-[11px] font-mono text-white">
                    {item.duration}
                  </span>
                )}
                <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-red-600/95 text-white flex items-center justify-center">
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </div>
                </div>
              </div>
              <div className="p-2.5 flex flex-col gap-1 flex-1">
                <div className="text-xs font-semibold text-white line-clamp-2 leading-snug">
                  {item.title}
                </div>
                <div className="text-[11px] text-neutral-400 truncate mt-auto">{item.channel}</div>
                <div className="text-[10px] text-neutral-500 flex items-center gap-2.5">
                  <span className="flex items-center gap-0.5">
                    <Eye className="w-3 h-3" />
                    {item.views.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Flame className="w-3 h-3" />
                    {item.commentCount.toLocaleString()}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
