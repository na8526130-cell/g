import React, { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Eye,
  Flame,
  Loader2,
  MessageSquare,
  Play,
  Radio,
  Search,
  Square,
  Tv,
  Users,
  Video,
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

interface NicoLiveItem {
  id: string;
  title: string;
  thumbnail: string;
  providerName: string;
  providerAvatar?: string;
  watchCount: number;
  commentCount: number;
  liveCycle?: string;
  description?: string;
}

interface NicoLiveCommentItem {
  id: string;
  text: string;
  name?: string;
  color?: string;
  position?: 'ue' | 'shita' | 'naka';
  atMs: number;
  isSystem?: boolean;
}

interface ActiveLiveDanmaku extends NicoLiveCommentItem {
  lane: number;
  spawnedAt: number;
}

const GENRES = [
  { id: 'all', label: '総合' },
  { id: 'music_sound', label: '音楽・サウンド' },
  { id: 'game', label: 'ゲーム' },
  { id: 'anime', label: 'アニメ' },
  { id: 'entertainment', label: 'エンタメ' },
  { id: 'dance', label: '踊ってみた' },
];

const LIVE_TABS = [
  { id: 'all', label: 'すべて' },
  { id: 'common', label: '一般' },
  { id: 'game', label: 'ゲーム' },
  { id: 'try', label: 'やってみた' },
  { id: 'official', label: '公式' },
  { id: 'face', label: '顔出し' },
];

export const NikonikoTool: React.FC = () => {
  const { isPlaying: mainIsPlaying, togglePlay: toggleMainPlay } = usePlayer();

  // Mode: VOD vs Live
  const [mode, setMode] = useState<'vod' | 'live'>('vod');

  // VOD state
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

  // Live state
  const [liveTab, setLiveTab] = useState('all');
  const [liveSort, setLiveSort] = useState<'viewCountDesc' | 'commentCountDesc' | 'recentDesc'>('viewCountDesc');
  const [liveQuery, setLiveQuery] = useState('');
  const [liveItems, setLiveItems] = useState<NicoLiveItem[]>([]);
  const [liveListLoading, setLiveListLoading] = useState(false);
  const [selectedLive, setSelectedLive] = useState<NicoLiveItem | null>(null);
  const [liveQuality, setLiveQuality] = useState<'high' | 'audio_only'>('high');
  const [liveVideoLoading, setLiveVideoLoading] = useState(false);
  const [liveComments, setLiveComments] = useState<NicoLiveCommentItem[]>([]);
  const [liveDanmakuQueue, setLiveDanmakuQueue] = useState<ActiveLiveDanmaku[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveHlsRef = useRef<Hls | null>(null);
  const activeLiveIdRef = useRef<string | null>(null);
  const seenLiveCommentIdsRef = useRef<Set<string>>(new Set());
  const liveSinceRef = useRef<number>(0);

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

  const loadLivePrograms = async (targetQuery = liveQuery, targetTab = liveTab, targetSort = liveSort) => {
    setLiveListLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (targetQuery.trim()) params.set('q', targetQuery.trim());
      params.set('tab', targetTab);
      params.set('sort', targetSort);
      const resp = await fetch(`/api/tools/nikoniko/live?${params.toString()}`);
      const data = await resp.json();
      if (!data.success) throw new Error(data.error || '生放送一覧を取得できませんでした');
      setLiveItems(data.items || []);
    } catch (e: any) {
      setError(e?.message || '生放送読み込みエラー');
    } finally {
      setLiveListLoading(false);
    }
  };

  const stopLiveSession = (liveId?: string | null) => {
    if (liveHlsRef.current) {
      liveHlsRef.current.destroy();
      liveHlsRef.current = null;
    }
    const target = liveId || activeLiveIdRef.current;
    if (target) {
      fetch(`/api/tools/nikoniko/live/stop/${encodeURIComponent(target)}`, { method: 'POST' }).catch(() => {});
    }
    activeLiveIdRef.current = null;
  };

  useEffect(() => {
    loadRanking(genre, term);
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      stopLiveSession();
    };
  }, []);

  // Poll live comments when watching a live program
  useEffect(() => {
    if (mode !== 'live' || !selectedLive?.id) return;
    const liveId = selectedLive.id;
    let cancelled = false;

    const pollComments = async () => {
      try {
        const qs = liveSinceRef.current > 0 ? `?since=${liveSinceRef.current}` : '';
        const resp = await fetch(`/api/tools/nikoniko/live/comments/${encodeURIComponent(liveId)}${qs}`);
        const data = await resp.json();
        if (cancelled || !data?.success) return;
        if (data.serverTime) liveSinceRef.current = Number(data.serverTime);
        const incoming: NicoLiveCommentItem[] = Array.isArray(data.comments) ? data.comments : [];
        if (incoming.length === 0) return;

        const newlyArrived: NicoLiveCommentItem[] = [];
        for (const c of incoming) {
          if (!seenLiveCommentIdsRef.current.has(c.id)) {
            seenLiveCommentIdsRef.current.add(c.id);
            newlyArrived.push(c);
          }
        }
        if (seenLiveCommentIdsRef.current.size > 500) {
          const arr = Array.from(seenLiveCommentIdsRef.current).slice(-300);
          seenLiveCommentIdsRef.current = new Set(arr);
        }

        if (newlyArrived.length > 0) {
          setLiveComments((prev) => [...prev, ...newlyArrived].slice(-120));
          const now = Date.now();
          const danmakuBatch: ActiveLiveDanmaku[] = newlyArrived
            .filter((c) => !c.isSystem)
            .slice(-14)
            .map((c, idx) => ({
              ...c,
              lane: idx % 8,
              spawnedAt: now + idx * 140,
            }));
          if (danmakuBatch.length > 0) {
            setLiveDanmakuQueue((prev) => [...prev.filter((d) => now - d.spawnedAt < 6200), ...danmakuBatch].slice(-28));
          }
        }
      } catch {
        // ignore transient poll error
      }
    };

    pollComments();
    const timer = setInterval(pollComments, 2600);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [mode, selectedLive?.id]);

  const handleModeSwitch = (nextMode: 'vod' | 'live') => {
    setError(null);
    if (nextMode === 'live') {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (videoRef.current) videoRef.current.pause();
      setMode('live');
      if (liveItems.length === 0) {
        loadLivePrograms('', liveTab, liveSort);
      }
    } else {
      stopLiveSession();
      setSelectedLive(null);
      setMode('vod');
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      await loadRanking(genre, term);
      return;
    }
    if (/^lv\d+$/i.test(q)) {
      setMode('live');
      await openLive({
        id: q.toLowerCase(),
        title: `生放送 ${q}`,
        thumbnail: '',
        providerName: 'ニコニコ生放送',
        watchCount: 0,
        commentCount: 0,
      });
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

  const handleLiveSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = liveQuery.trim();
    const lvMatch = q.match(/\b(lv\d+)\b/i);
    if (lvMatch && /^lv\d+$/i.test(q.replace(/^https?:\/\/[^/]+\/watch\//i, '').split(/[?#]/)[0].trim())) {
      await openLive({
        id: lvMatch[1].toLowerCase(),
        title: `生放送 ${lvMatch[1].toLowerCase()}`,
        thumbnail: '',
        providerName: 'ニコニコ生放送',
        watchCount: 0,
        commentCount: 0,
      });
      return;
    }
    await loadLivePrograms(q, liveTab, liveSort);
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

  const attachLiveHls = (liveId: string, qMode: 'high' | 'audio_only') => {
    const el = liveVideoRef.current;
    if (!el) return;
    if (liveHlsRef.current) {
      liveHlsRef.current.destroy();
      liveHlsRef.current = null;
    }
    const streamUrl = `/api/tools/nikoniko/live/hls/${encodeURIComponent(liveId)}/master.m3u8?quality=${qMode}`;
    if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 8,
      });
      liveHlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(el);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLiveVideoLoading(false);
        el.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          setLiveVideoLoading(false);
          setError('生放送ストリームの再生に失敗しました（配信終了・会員限定・接続混雑の可能性があります）');
        }
      });
    } else if (el.canPlayType('application/vnd.apple.mpegurl')) {
      el.src = streamUrl;
      el.play().catch(() => {});
      setLiveVideoLoading(false);
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

  const openLive = async (item: NicoLiveItem) => {
    if (mainIsPlaying) toggleMainPlay();
    if (activeLiveIdRef.current && activeLiveIdRef.current !== item.id) {
      stopLiveSession(activeLiveIdRef.current);
    }
    activeLiveIdRef.current = item.id;
    seenLiveCommentIdsRef.current.clear();
    liveSinceRef.current = 0;

    setSelectedLive(item);
    setLiveComments([]);
    setLiveDanmakuQueue([]);
    setError(null);
    setLiveVideoLoading(true);

    try {
      const infoRes = await fetch(`/api/tools/nikoniko/live/info/${encodeURIComponent(item.id)}`)
        .then((r) => r.json())
        .catch(() => null);
      if (infoRes?.success && infoRes.program) {
        setSelectedLive(infoRes.program);
        if (infoRes.program.status === 'ENDED') {
          setLiveVideoLoading(false);
          setError('この生放送はすでに終了しています');
          return;
        }
      }
    } catch {
      // ignore info failure and try stream
    }

    setTimeout(() => attachLiveHls(item.id, liveQuality), 40);
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
      {/* Mode Switcher: 動画 vs 生放送ライブ */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#101014] border border-neutral-800/90 rounded-2xl p-2.5">
        <div className="flex items-center gap-1.5 bg-neutral-950 p-1 rounded-xl border border-neutral-800">
          <button
            type="button"
            onClick={() => handleModeSwitch('vod')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              mode === 'vod'
                ? 'bg-white text-black'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>動画</span>
          </button>
          <button
            type="button"
            onClick={() => handleModeSwitch('live')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
              mode === 'live'
                ? 'bg-red-600 text-white'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>生放送ライブ</span>
          </button>
        </div>

        <span className="text-[11px] text-neutral-400 px-1">
          {mode === 'live' ? '放送中ライブ・lvID直指定・リアルタイム弾幕対応' : 'ランキング・検索・smID指定・弾幕再生対応'}
        </span>
      </div>

      {mode === 'vod' ? (
        <>
          {/* VOD Search & Genre Controls */}
          <div className="flex flex-col gap-2.5 bg-[#101014] border border-neutral-800/90 rounded-2xl p-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <form onSubmit={handleSearch} className="flex-1 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="キーワード または sm123456 / lv123456 を入力..."
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

          {/* VOD Ranking / Search Grid */}
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
        </>
      ) : (
        <>
          {/* Live Search & Category Controls */}
          <div className="flex flex-col gap-2.5 bg-[#101014] border border-neutral-800/90 rounded-2xl p-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <form onSubmit={handleLiveSearch} className="flex-1 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={liveQuery}
                    onChange={(e) => setLiveQuery(e.target.value)}
                    placeholder="生放送キーワード または lv351897954 を入力..."
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
                    { id: 'viewCountDesc', label: '視聴者順' },
                    { id: 'commentCountDesc', label: 'コメント順' },
                    { id: 'recentDesc', label: '新着順' },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setLiveSort(s.id);
                      loadLivePrograms(liveQuery, liveTab, s.id);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      liveSort === s.id ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              {LIVE_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setLiveTab(t.id);
                    setLiveQuery('');
                    loadLivePrograms('', t.id, liveSort);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                    liveTab === t.id
                      ? 'bg-red-600 text-white'
                      : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-950/60 border border-red-800/60 text-xs text-red-200">
              {error}
            </div>
          )}

          {/* Active Live Player + Real-time Protobuf Danmaku */}
          {selectedLive && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 bg-[#0d0d10] border border-red-500/30 rounded-2xl p-3 sm:p-4">
              <div className="lg:col-span-2 flex flex-col gap-3">
                <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-neutral-800">
                  <video
                    ref={liveVideoRef}
                    controls
                    playsInline
                    className="w-full h-full object-contain"
                  />
                  {liveVideoLoading && (
                    <div className="absolute inset-0 bg-black/65 flex items-center justify-center gap-2 text-xs text-neutral-200 pointer-events-none">
                      <Loader2 className="w-5 h-5 animate-spin text-red-500" />
                      <span>生放送ストリーム接続中...</span>
                    </div>
                  )}
                  <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-extrabold tracking-wider flex items-center gap-1 pointer-events-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    LIVE
                  </div>
                  {showDanmaku && liveDanmakuQueue.length > 0 && (
                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                      <style>{`
                        @keyframes nicoLiveScroll {
                          0% { transform: translateX(100%); left: 100%; }
                          100% { transform: translateX(-110%); left: 0%; }
                        }
                      `}</style>
                      {liveDanmakuQueue.map((c) => (
                        <span
                          key={c.id}
                          style={{
                            top: `${8 + c.lane * 10}%`,
                            color: c.color || '#ffffff',
                            textShadow: '0 1px 3px rgba(0,0,0,0.95)',
                            animation: 'nicoLiveScroll 5.8s linear forwards',
                          }}
                          className="absolute whitespace-nowrap font-bold text-sm sm:text-base"
                        >
                          {c.text}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-white leading-snug">{selectedLive.title}</h3>
                    <div className="text-xs text-neutral-400 mt-1 flex flex-wrap items-center gap-3">
                      <span>{selectedLive.providerName}</span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {selectedLive.watchCount.toLocaleString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-3.5 h-3.5" />
                        {selectedLive.commentCount.toLocaleString()}
                      </span>
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
                      value={liveQuality}
                      onChange={(e) => {
                        const qm = e.target.value === 'audio_only' ? 'audio_only' : 'high';
                        setLiveQuality(qm);
                        setLiveVideoLoading(true);
                        attachLiveHls(selectedLive.id, qm);
                      }}
                      className="bg-neutral-900 border border-neutral-800 text-xs text-white rounded-lg px-2 py-1.5"
                    >
                      <option value="high">高画質</option>
                      <option value="audio_only">音声のみ</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        stopLiveSession(selectedLive.id);
                        setSelectedLive(null);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-xs text-neutral-200 flex items-center gap-1 cursor-pointer"
                    >
                      <Square className="w-3 h-3 fill-current" />
                      <span>終了</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Live Comments Feed */}
              <div className="bg-neutral-950 border border-neutral-800/80 rounded-xl p-3 flex flex-col max-h-[380px]">
                <div className="text-xs font-bold text-neutral-200 pb-2 mb-2 border-b border-neutral-800 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-red-400" />
                    ライブコメント ({liveComments.length})
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                  {liveComments.length === 0 ? (
                    <div className="text-xs text-neutral-500 py-8 text-center">コメント受信待機中...</div>
                  ) : (
                    liveComments.map((c) => (
                      <div
                        key={c.id}
                        className={`text-xs px-2 py-1 rounded ${
                          c.isSystem ? 'bg-blue-950/30 text-blue-300' : 'text-neutral-200'
                        }`}
                      >
                        {c.name && (
                          <span className="text-[10px] text-neutral-500 mr-1.5">{c.name}:</span>
                        )}
                        <span className="break-words">{c.text}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Live Programs Grid */}
          {liveListLoading ? (
            <div className="py-16 flex items-center justify-center gap-2 text-neutral-400 text-sm">
              <Loader2 className="w-5 h-5 animate-spin text-red-500" />
              <span>放送中のニコニコ生放送を取得中...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {liveItems.map((item, idx) => (
                <button
                  key={`${item.id}-${idx}`}
                  type="button"
                  onClick={() => openLive(item)}
                  className={`group text-left rounded-xl border overflow-hidden transition-all cursor-pointer flex flex-col ${
                    selectedLive?.id === item.id
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
                        <Radio className="w-6 h-6 text-neutral-700" />
                      </div>
                    )}
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-red-600 text-[10px] font-extrabold text-white">
                      LIVE
                    </span>
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
                    <div className="text-[11px] text-neutral-400 truncate mt-auto">
                      {item.providerName}
                    </div>
                    <div className="text-[10px] text-neutral-500 flex items-center gap-2.5">
                      <span className="flex items-center gap-0.5">
                        <Users className="w-3 h-3" />
                        {item.watchCount.toLocaleString()}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <MessageSquare className="w-3 h-3" />
                        {item.commentCount.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
