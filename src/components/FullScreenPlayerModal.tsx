import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { api } from '../services/api';
import { SafeImage } from './SafeImage';
import { SyncedLine, Track } from '../types/music';
import { isSameArtist } from '../utils/artistNames';
import {
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  Share2,
  ListMusic,
  FileText,
  ListPlus,
  Radio,
  ExternalLink,
  Sparkles,
  X,
  Disc,
  Gauge,
  Volume2,
  Award,
  Zap,
  Clock,
  Flame,
  ArrowLeftRight,
  AlertTriangle,
  UserCheck,
  Info,
  EyeOff,
  Ban,
  MonitorSpeaker,
  Users,
  QrCode,
  Link2,
  Film,
  Download,
  Sliders,
  RotateCcw,
  RotateCw,
} from 'lucide-react';

interface MvCanvasMeta {
  videoId: string | null;
  chorusStartSec?: number;
  mvDurationSec?: number;
}

const mvCanvasCache = new Map<string, MvCanvasMeta>();

function normalizeTitleCore(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/[\(\[【（].*?[\)\]】）]/g, ' ')
    .replace(/\b(official|music|video|mv|m\/v|pv|audio|lyric|lyrics|full|ver\.?)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function normalizeLyricForChorus(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Detect the 1st chorus (サビ) timestamp from synced lyrics by finding the earliest
 * repeating lyric phrase/block in the 18%-48% window that recurs >=28s later.
 */
function detectSyncedLyricsChorusSec(syncedLines?: SyncedLine[], totalDur = 0): number | null {
  if (!syncedLines || syncedLines.length < 6) return null;
  const maxTime = totalDur > 30 ? totalDur : syncedLines[syncedLines.length - 1]?.time || 220;
  const minWindow = Math.max(22, maxTime * 0.18);
  const maxWindow = maxTime * 0.48;
  const normLines = syncedLines.map((l) => normalizeLyricForChorus(l.text));

  for (let i = 0; i < syncedLines.length - 1; i++) {
    const t = syncedLines[i].time;
    if (t < minWindow || t > maxWindow) continue;
    const cur = normLines[i];
    const next = normLines[i + 1];
    if (cur.length < 5) continue;

    for (let j = i + 2; j < syncedLines.length - 1; j++) {
      if (syncedLines[j].time - t < 28) continue;
      if (normLines[j] === cur && (next.length < 4 || normLines[j + 1] === next)) {
        return Math.floor(t);
      }
      if (cur.length >= 9 && (normLines[j].includes(cur) || cur.includes(normLines[j]))) {
        return Math.floor(t);
      }
    }
  }
  return null;
}

function formatSeconds(secs: number): string {
  if (isNaN(secs) || secs < 0) return '0:00';
  const total = Math.floor(secs);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

export const FullScreenPlayerModal: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    togglePlay,
    progress,
    duration,
    seekTo,
    nextTrack,
    prevTrack,
    repeatMode,
    cycleRepeat,
    likedTrackIds,
    toggleLikeTrack,
    fullScreenPlayerOpen,
    setFullScreenPlayerOpen,
    navigateTo,
    openAddToPlaylistModal,
    openShareModal,
    openVisualShareCard,
    openZeroCodeModal,
    setConnectModalOpen,
    floatingLyricsOverlay,
    setFloatingLyricsOverlay,
    canvasEnabled,
    setCanvasEnabled,
    playbackContextLabel,
    setQueueOpen,
    currentLyrics,
    activeSyncedLyricText,
    openLyricsSwitcher,
    startRadioForTrack,
    playbackRate,
    setPlaybackRate,
    shuffleMode,
    cycleShuffleMode,
    audioQuality,
    setAudioQuality,
    setWrappedModalOpen,
    digestMode,
    toggleDigestMode,
    digestRemainingSec,
    trackTimestamps,
    endlessRadioActive,
    toggleEndlessRadio,
    emotionRadioMood,
    queue,
    queueIndex,
    openTrackDetailModal,
    hideTrack,
    blockArtist,
    isTrackBlocked,
    showToast,
    openFreemakeModal,
    setDspModalOpen,
    vocalLevel,
    spatialAudio,
    skipBySeconds,
  } = usePlayer();

  const [menuOpen, setMenuOpen] = useState(false);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [inlineLyricsExpanded, setInlineLyricsExpanded] = useState(false);
  const [timestampsExpanded, setTimestampsExpanded] = useState(false);
  const lyricsSheetRef = useRef<HTMLDivElement>(null);

  // Canvas MV background state (null = no MV found -> show jacket image)
  const [canvasVideoId, setCanvasVideoId] = useState<string | null>(null);
  const [canvasChorusSec, setCanvasChorusSec] = useState<number | undefined>(undefined);
  const [canvasMvDurationSec, setCanvasMvDurationSec] = useState<number | undefined>(undefined);
  const [canvasReady, setCanvasReady] = useState(false);
  const [canvasHudClear, setCanvasHudClear] = useState(false);
  const [canvasActivated, setCanvasActivated] = useState(false);
  const [canvasPlayerPaused, setCanvasPlayerPaused] = useState(false);
  const [checkingMv, setCheckingMv] = useState(false);
  const canvasIframeRef = useRef<HTMLIFrameElement>(null);
  const hudRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopCycleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canvasHudClearRef = useRef(false);
  canvasHudClearRef.current = canvasHudClear;

  const clearCanvasTimers = useCallback(() => {
    if (hudRevealTimerRef.current) {
      clearTimeout(hudRevealTimerRef.current);
      hudRevealTimerRef.current = null;
    }
    if (loopCycleTimerRef.current) {
      clearTimeout(loopCycleTimerRef.current);
      loopCycleTimerRef.current = null;
    }
    if (seekDelayTimerRef.current) {
      clearTimeout(seekDelayTimerRef.current);
      seekDelayTimerRef.current = null;
    }
  }, []);

  const clearHudRevealTimer = useCallback(() => {
    if (hudRevealTimerRef.current) {
      clearTimeout(hudRevealTimerRef.current);
      hudRevealTimerRef.current = null;
    }
  }, []);

  const scheduleHudReveal = useCallback(
    (delayMs: number) => {
      clearHudRevealTimer();
      hudRevealTimerRef.current = setTimeout(() => {
        hudRevealTimerRef.current = null;
        setCanvasHudClear(true);
      }, delayMs);
    },
    [clearHudRevealTimer]
  );

  useEffect(() => () => clearCanvasTimers(), [clearCanvasTimers]);

  const showMvCanvas = Boolean(
    fullScreenPlayerOpen && canvasEnabled && currentTrack && !currentTrack.isLocal && canvasVideoId
  );
  const isCanvasVisualActive = Boolean(
    showMvCanvas && canvasReady && canvasHudClear && !canvasPlayerPaused
  );
  const isCanvasLayoutActive = Boolean(
    showMvCanvas && (canvasActivated || isCanvasVisualActive)
  );

  useEffect(() => {
    if (isCanvasVisualActive) {
      setCanvasActivated(true);
    }
  }, [isCanvasVisualActive]);

  const lyricsChorusSec = useMemo(
    () => detectSyncedLyricsChorusSec(currentLyrics?.syncedLyrics, duration),
    [currentLyrics?.syncedLyrics, duration]
  );

  // Align audio-based chorus estimate to MV timeline if MV has a cinematic intro
  const mvIntroOffset =
    canvasMvDurationSec && duration > 45 && canvasMvDurationSec > duration + 6 && canvasMvDurationSec < duration + 90
      ? Math.round((canvasMvDurationSec - duration) * 0.7)
      : 0;

  const effectiveDur = canvasMvDurationSec || duration || 220;
  const clipStartSec =
    canvasChorusSec && canvasChorusSec > 18
      ? Math.floor(canvasChorusSec)
      : lyricsChorusSec && lyricsChorusSec > 18
      ? Math.floor(lyricsChorusSec + mvIntroOffset)
      : trackTimestamps?.highlightStartSec &&
        trackTimestamps.highlightStartSec >= Math.max(25, effectiveDur * 0.16)
      ? Math.floor(trackTimestamps.highlightStartSec + mvIntroOffset)
      : effectiveDur > 60
      ? Math.round(effectiveDur * 0.30)
      : 12;
  const clipStartSecRef = useRef(clipStartSec);
  clipStartSecRef.current = clipStartSec;
  const getPreloadStart = (startSec: number) => (startSec > 4 ? startSec - 4 : startSec);

  // Keep the iframe mount start time fixed per video ID so async duration/highlight updates seek instead of remounting
  const [canvasMountStart, setCanvasMountStart] = useState<number>(60);
  const lastHighlightSeekTrackRef = useRef<string | null>(null);
  useEffect(() => {
    setCanvasMountStart(getPreloadStart(clipStartSec));
    lastHighlightSeekTrackRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasVideoId]);

  // Resolve official MV video ID for Canvas background; keep null when no MV exists
  useEffect(() => {
    clearCanvasTimers();
    if (!fullScreenPlayerOpen || !canvasEnabled || !currentTrack?.id || currentTrack.isLocal) {
      setCanvasVideoId(null);
      setCanvasChorusSec(undefined);
      setCanvasMvDurationSec(undefined);
      setCanvasReady(false);
      setCanvasHudClear(false);
      setCanvasActivated(false);
      setCheckingMv(false);
      return;
    }

    let cancelled = false;
    setCanvasReady(false);
    setCanvasHudClear(false);
    setCanvasActivated(false);
    setCanvasPlayerPaused(false);

    if (mvCanvasCache.has(currentTrack.id)) {
      const cached = mvCanvasCache.get(currentTrack.id);
      setCanvasVideoId(cached?.videoId ?? null);
      setCanvasChorusSec(cached?.chorusStartSec);
      setCanvasMvDurationSec(cached?.mvDurationSec);
      setCheckingMv(false);
      return;
    }

    setCanvasVideoId(null);
    setCanvasChorusSec(undefined);
    setCanvasMvDurationSec(undefined);
    setCheckingMv(true);

    const resolveMv = async () => {
      try {
        const mvRes = await api.getMvCanvas(
          currentTrack.id,
          currentTrack.title,
          currentTrack.artist
        );
        let chosenId: string | null =
          mvRes?.hasMv && mvRes.videoId ? mvRes.videoId : null;
        const serverChorus = mvRes?.chorusStartSec;
        const serverMvDur = mvRes?.mvDurationSec;

        // Fallback for static/GAS mode if mv-canvas endpoint isn't available
        if (!chosenId && !mvRes?.fromServer) {
          const origCore = normalizeTitleCore(currentTrack.title);
          const origLower = currentTrack.title.toLowerCase();
          const allowCover = /cover|歌ってみた|弾いてみた|remix|リミックス/i.test(origLower);
          const allowLive = /\blive\b|ライブ|tour|stadium|arena/i.test(origLower);

          const isExcludedTitle = (t: string) => {
            if (
              /karaoke|カラオケ|off\s*vocal|instrumental|inst\.|reaction|リアクション|解説|弾き語り|full\s*album|bgm|作業用|audio\s*only|official\s*audio|lyric\s*video|lyrics|歌詞動画|歌詞付き|和訳|日本語字幕|発音|자막|静止画|ノンクレジット|creditless/i.test(
                t
              )
            ) {
              return true;
            }
            if (!allowCover && /歌ってみた|弾いてみた|叩いてみた|踊ってみた|covered\s*by|\bcover\b/i.test(t)) {
              return true;
            }
            if (!allowLive && /\blive\b|ライブ映像|official\s*live|live\s*video|arena\s*tour|stadium/i.test(t)) {
              return true;
            }
            return false;
          };

          const selfIsMv =
            !isExcludedTitle(origLower) &&
            /(\bmv\b|m\/v|music\s*video|official\s*(music\s*)?video|公式\s*mv|\bpv\b|［official\s*video］|\[official\s*video\])/i.test(
              origLower
            );
          if (selfIsMv) {
            chosenId = currentTrack.id;
          } else {
            const q = `${currentTrack.title} ${currentTrack.artist || ''}`.trim();
            const res = await api.search(q, 'video').catch(() => null);
            const videoCandidates: Track[] = [
              ...(Array.isArray(res?.videos) ? res.videos : []),
              ...(Array.isArray(res?.results) ? res.results : []),
            ];
            const cleanMatch = videoCandidates.find((c) => {
              if (!c?.id || isTrackBlocked(c)) return false;
              const t = (c.title || '').toLowerCase();
              if (isExcludedTitle(t)) return false;
              const candCore = normalizeTitleCore(c.title || '');
              if (!origCore || candCore !== origCore) return false;
              if (c.artist && currentTrack.artist && !isSameArtist(c.artist, currentTrack.artist)) {
                return false;
              }
              return true;
            });
            if (cleanMatch?.id) {
              chosenId = cleanMatch.id;
            }
          }
        }

        const meta: MvCanvasMeta = {
          videoId: chosenId,
          chorusStartSec: serverChorus,
          mvDurationSec: serverMvDur,
        };
        mvCanvasCache.set(currentTrack.id, meta);
        if (!cancelled) {
          setCanvasVideoId(chosenId);
          setCanvasChorusSec(serverChorus);
          setCanvasMvDurationSec(serverMvDur);
          setCheckingMv(false);
        }
      } catch {
        mvCanvasCache.set(currentTrack.id, { videoId: null });
        if (!cancelled) {
          setCanvasVideoId(null);
          setCanvasChorusSec(undefined);
          setCanvasMvDurationSec(undefined);
          setCheckingMv(false);
        }
      }
    };

    resolveMv();
    return () => {
      cancelled = true;
    };
  }, [
    fullScreenPlayerOpen,
    canvasEnabled,
    currentTrack?.id,
    currentTrack?.title,
    currentTrack?.artist,
    currentTrack?.isLocal,
    isTrackBlocked,
  ]);

  const sendCanvasCommand = useCallback((func: string, args: unknown = '') => {
    try {
      canvasIframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func, args, id: 999001, channel: 'widget' }),
        '*'
      );
    } catch {}
  }, []);

  // Listen to Canvas MV embed events: fall back on error, wait for YT mobile HUD to fade before revealing,
  // and immediately hide & resume if ever paused so YT's || / |> buttons never appear
  useEffect(() => {
    if (!showMvCanvas || !currentTrack?.id) return;
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== canvasIframeRef.current?.contentWindow) return;
      try {
        const data = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
        if (data?.event === 'onError') {
          clearHudRevealTimer();
          mvCanvasCache.set(currentTrack.id, { videoId: null });
          setCanvasVideoId(null);
          setCanvasReady(false);
          setCanvasHudClear(false);
          return;
        }
        const state =
          data?.event === 'onStateChange' && typeof data.info === 'number'
            ? data.info
            : (data?.event === 'infoDelivery' || data?.event === 'initialDelivery') &&
              typeof data?.info?.playerState === 'number'
            ? data.info.playerState
            : null;
        if (state === 1) {
          setCanvasPlayerPaused(false);
          if (!canvasHudClearRef.current) {
            scheduleHudReveal(4200);
          }
        } else if (state === 3) {
          if (!canvasHudClearRef.current) {
            // Delay reveal while initial buffering completes so YT HUD timer starts after playback begins
            scheduleHudReveal(5500);
          }
        } else if (state === 2) {
          // Never show YT's paused/play overlay UI; hide & immediately resume muted background playback
          clearCanvasTimers();
          setCanvasPlayerPaused(true);
          setCanvasHudClear(false);
          sendCanvasCommand('mute');
          sendCanvasCommand('playVideo');
          scheduleHudReveal(3900);
        } else if (state === 0) {
          clearCanvasTimers();
          setCanvasHudClear(false);
          sendCanvasCommand('mute');
          sendCanvasCommand('seekTo', [getPreloadStart(clipStartSec), true]);
          sendCanvasCommand('playVideo');
          scheduleHudReveal(4100);
        }
      } catch {}
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [showMvCanvas, currentTrack?.id, clipStartSec, sendCanvasCommand, clearCanvasTimers, scheduleHudReveal]);

  // Loop strictly a 14-second MV clip cleanly: fade out to blurred artwork, seek 4s before clip start while hidden,
  // wait for YouTube's HUD overlay to fade completely, then fade back in for the next 14 seconds
  useEffect(() => {
    if (!isCanvasVisualActive) return;
    loopCycleTimerRef.current = setTimeout(() => {
      loopCycleTimerRef.current = null;
      setCanvasHudClear(false);
      seekDelayTimerRef.current = setTimeout(() => {
        seekDelayTimerRef.current = null;
        const preloadSec = getPreloadStart(clipStartSecRef.current);
        sendCanvasCommand('mute');
        sendCanvasCommand('seekTo', [preloadSec, true]);
        sendCanvasCommand('playVideo');
        scheduleHudReveal(4100);
      }, 550);
    }, 14000);

    return () => {
      if (loopCycleTimerRef.current) {
        clearTimeout(loopCycleTimerRef.current);
        loopCycleTimerRef.current = null;
      }
    };
  }, [isCanvasVisualActive, sendCanvasCommand, scheduleHudReveal]);

  // Seek smoothly ONLY while still hidden behind opacity-0 if better chorus timestamp arrives right after mount
  useEffect(() => {
    if (!showMvCanvas || !canvasReady || !currentTrack?.id || canvasHudClearRef.current) return;
    const seekKey = `${currentTrack.id}:${canvasVideoId}:${clipStartSec}`;
    if (lastHighlightSeekTrackRef.current === seekKey) return;
    const preloadTarget = getPreloadStart(clipStartSec);
    if (Math.abs(preloadTarget - canvasMountStart) > 4) {
      lastHighlightSeekTrackRef.current = seekKey;
      setCanvasHudClear(false);
      sendCanvasCommand('mute');
      sendCanvasCommand('seekTo', [preloadTarget, true]);
      sendCanvasCommand('playVideo');
      scheduleHudReveal(4100);
    }
  }, [
    showMvCanvas,
    canvasReady,
    currentTrack?.id,
    canvasVideoId,
    clipStartSec,
    canvasMountStart,
    sendCanvasCommand,
    scheduleHudReveal,
  ]);

  if (!fullScreenPlayerOpen || !currentTrack) return null;

  const isLiked = likedTrackIds.has(currentTrack.id);
  const percent = duration > 0 ? Math.min(100, Math.max(0, (progress / duration) * 100)) : 0;

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(pos * duration);
  };

  // Find active line of synced lyrics
  const activeLyricIndex = currentLyrics?.syncedLyrics
    ? currentLyrics.syncedLyrics.findIndex((line: SyncedLine, i: number) => {
        const nextLine = currentLyrics.syncedLyrics![i + 1];
        if (nextLine) {
          return progress >= line.time && progress < nextLine.time;
        }
        return progress >= line.time;
      })
    : -1;

  const floatingLine =
    activeSyncedLyricText ||
    (currentLyrics?.syncedLyrics?.[0]?.text ?? '');

  const handleOpenPeekingLyrics = () => {
    setTimestampsExpanded(false);
    setInlineLyricsExpanded((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => {
          lyricsSheetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 60);
      }
      return next;
    });
  };

  const originParam =
    typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null'
      ? `&origin=${encodeURIComponent(window.location.origin)}`
      : '';
  const canvasEmbedSrc =
    showMvCanvas && canvasVideoId
      ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(
          canvasVideoId
        )}?autoplay=1&mute=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&modestbranding=1&playsinline=1&rel=0&enablejsapi=1&widgetid=999001&start=${canvasMountStart}${originParam}`
      : '';

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-b from-[#2b0407] via-[#110103] to-[#040001] text-white overflow-y-auto flex flex-col justify-between animate-in slide-in-from-bottom duration-300">
      {/* Ambient Canvas Backdrop (Blurred Artwork base + Looping MV Canvas overlay) */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {currentTrack.thumbnail && (
          <img
            src={currentTrack.thumbnail}
            alt=""
            className={`w-full h-full object-cover opacity-30 blur-3xl scale-125 transition-transform duration-[12000ms] ease-linear ${
              isPlaying ? 'scale-[1.35]' : 'scale-125'
            }`}
          />
        )}

        {canvasEmbedSrc && (
          <div className="absolute inset-0 overflow-hidden">
            <iframe
              key={canvasVideoId}
              ref={canvasIframeRef}
              src={canvasEmbedSrc}
              title={`${currentTrack.title} MV Canvas`}
              tabIndex={-1}
              aria-hidden="true"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              onLoad={() => {
                setCanvasReady(true);
                setCanvasHudClear(false);
                scheduleHudReveal(4400);
                try {
                  canvasIframeRef.current?.contentWindow?.postMessage(
                    JSON.stringify({ event: 'listening', id: 999001, channel: 'widget' }),
                    '*'
                  );
                } catch {}
                sendCanvasCommand('addEventListener', ['onStateChange']);
                sendCanvasCommand('mute');
                sendCanvasCommand('playVideo');
              }}
              className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[max(100vw,177.78vh)] h-[max(100vh,56.25vw)] scale-[1.18] pointer-events-none border-0 transition-opacity duration-700 ${
                isCanvasVisualActive ? 'opacity-80' : 'opacity-0'
              }`}
            />
          </div>
        )}

        {/* Cinematic Dark Vignettes for Contrast & Red/Black Tone */}
        <div
          className={`absolute inset-0 ${
            isCanvasVisualActive
              ? 'bg-gradient-to-b from-black/75 via-black/15 to-[#040001]'
              : 'bg-gradient-to-b from-black/65 via-[#160205]/70 to-[#040001]/95'
          }`}
        />
        <div className="absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-[#040001] via-[#090103]/80 to-transparent" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-red-600/12 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-lg w-full mx-auto min-h-full flex flex-col justify-between p-5 sm:p-8 pb-6">
        {/* Top Context Header Bar */}
        <header className="flex items-center justify-between gap-4 py-1.5">
          <button
            type="button"
            onClick={() => setFullScreenPlayerOpen(false)}
            className="p-2 -ml-2 text-neutral-300 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
            title="閉じる"
          >
            <ChevronDown className="w-6 h-6" />
          </button>

          <div className="text-center min-w-0 flex-1 px-2">
            <span className="text-[11px] font-bold text-neutral-300/80 tracking-wide block truncate">
              {playbackContextLabel.source}
            </span>
            <button
              type="button"
              onClick={() => {
                const targetAlbum = currentTrack.albumId || currentTrack.album || currentTrack.title;
                if (targetAlbum) {
                  navigateTo('album', targetAlbum);
                  setFullScreenPlayerOpen(false);
                }
              }}
              className="text-xs sm:text-sm font-bold text-white truncate hover:text-red-400 hover:underline transition-colors block mx-auto max-w-full cursor-pointer"
              title="アルバムを表示"
            >
              {playbackContextLabel.subtitle || currentTrack.album || currentTrack.title}
            </button>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center text-neutral-300 hover:text-white rounded-full hover:bg-white/10 transition-colors cursor-pointer"
              title="メニュー"
              aria-label="メニュー"
            >
              <MoreHorizontal className="w-6 h-6" />
            </button>
          </div>
        </header>

        {/* Redesigned Track Action Sheet (IMG_0280 parity, NO Sleep Timer) */}
        {menuOpen && (
          <div
            className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-2xl flex flex-col justify-between p-5 sm:p-8 overflow-y-auto animate-in fade-in duration-150"
            onClick={() => setMenuOpen(false)}
          >
            <div
              className="max-w-md w-full mx-auto flex-1 flex flex-col justify-center space-y-5 py-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Track identity header */}
              <div className="flex items-center gap-4 pb-3 border-b border-white/10">
                <SafeImage
                  src={currentTrack.thumbnail}
                  alt={currentTrack.title}
                  useBase64
                  className="w-14 h-14 rounded-md object-cover bg-neutral-800 shadow-lg shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-white truncate">{currentTrack.title}</h3>
                  <p className="text-xs text-neutral-400 truncate mt-0.5">
                    {currentTrack.artist}
                    {currentTrack.album ? ` · ${currentTrack.album}` : ''}
                  </p>
                </div>
              </div>

              <div className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    openVisualShareCard({ type: 'track', track: currentTrack });
                  }}
                  className="w-full py-2.5 text-left text-[15px] font-semibold text-white hover:text-red-400 flex items-center gap-4 transition-colors cursor-pointer"
                >
                  <Share2 className="w-5 h-5 text-neutral-300" />
                  <span>シェア（カード画像・リンク）</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFloatingLyricsOverlay((prev) => {
                      const next = !prev;
                      showToast(
                        next ? 'フローティング歌詞をオンにしました' : 'フローティング歌詞をオフにしました',
                        'info',
                        1800
                      );
                      return next;
                    });
                    setMenuOpen(false);
                  }}
                  className="w-full py-2.5 text-left text-[15px] font-semibold text-white hover:text-red-400 flex items-center justify-between gap-4 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-4">
                    <FileText
                      className={`w-5 h-5 ${floatingLyricsOverlay ? 'text-red-500' : 'text-neutral-300'}`}
                    />
                    <span>{floatingLyricsOverlay ? '歌詞・オン' : '歌詞・オフ'}</span>
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      floatingLyricsOverlay
                        ? 'bg-red-600/25 text-red-400 border border-red-500/40'
                        : 'bg-white/10 text-neutral-400'
                    }`}
                  >
                    {floatingLyricsOverlay ? 'ON' : 'OFF'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCanvasEnabled((prev) => {
                      const next = !prev;
                      showToast(
                        next ? 'Canvas（MV背景演出）をオンにしました' : 'Canvas（MV背景演出）をオフにしました',
                        'info',
                        1800
                      );
                      return next;
                    });
                    setMenuOpen(false);
                  }}
                  className="w-full py-2.5 text-left text-[15px] font-semibold text-white hover:text-red-400 flex items-center justify-between gap-4 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-4">
                    <Film
                      className={`w-5 h-5 ${canvasEnabled ? 'text-red-500' : 'text-neutral-300'}`}
                    />
                    <span>Canvas（MV背景演出）</span>
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      canvasEnabled
                        ? 'bg-red-600/25 text-red-400 border border-red-500/40'
                        : 'bg-white/10 text-neutral-400'
                    }`}
                  >
                    {canvasEnabled ? 'ON' : 'OFF'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    openAddToPlaylistModal(currentTrack);
                  }}
                  className="w-full py-2.5 text-left text-[15px] font-semibold text-white hover:text-red-400 flex items-center gap-4 transition-colors cursor-pointer"
                >
                  <ListPlus className="w-5 h-5 text-neutral-300" />
                  <span>プレイリストに追加</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const targetAlbum = currentTrack.albumId || currentTrack.album || currentTrack.title;
                    setMenuOpen(false);
                    if (targetAlbum) {
                      navigateTo('album', targetAlbum);
                      setFullScreenPlayerOpen(false);
                    }
                  }}
                  className="w-full py-2.5 text-left text-[15px] font-semibold text-white hover:text-red-400 flex items-center gap-4 transition-colors cursor-pointer"
                >
                  <Disc className="w-5 h-5 text-neutral-300" />
                  <span>アルバムに移動</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    if (currentTrack.artistId) {
                      navigateTo('artist', currentTrack.artistId);
                      setFullScreenPlayerOpen(false);
                    } else if (currentTrack.artist) {
                      navigateTo('search');
                      setFullScreenPlayerOpen(false);
                    }
                  }}
                  className="w-full py-2.5 text-left text-[15px] font-semibold text-white hover:text-red-400 flex items-center gap-4 transition-colors cursor-pointer"
                >
                  <ExternalLink className="w-5 h-5 text-neutral-300" />
                  <span>アーティストに移動</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    navigateTo('party');
                    setFullScreenPlayerOpen(false);
                  }}
                  className="w-full py-2.5 text-left text-[15px] font-semibold text-white hover:text-red-400 flex items-center gap-4 transition-colors cursor-pointer"
                >
                  <Users className="w-5 h-5 text-neutral-300" />
                  <span>Jamを開始（リスニングパーティ）</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    startRadioForTrack(currentTrack);
                  }}
                  className="w-full py-2.5 text-left text-[15px] font-semibold text-white hover:text-red-400 flex items-center gap-4 transition-colors cursor-pointer"
                >
                  <Radio className="w-5 h-5 text-neutral-300" />
                  <span>ソングラジオに移動</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    openTrackDetailModal(currentTrack);
                  }}
                  className="w-full py-2.5 text-left text-[15px] font-semibold text-white hover:text-red-400 flex items-center gap-4 transition-colors cursor-pointer"
                >
                  <Info className="w-5 h-5 text-neutral-300" />
                  <span>楽曲クレジットを表示</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    openZeroCodeModal({
                      type: 'track',
                      title: currentTrack.title,
                      subtitle: currentTrack.artist,
                      imageUrl: currentTrack.thumbnail,
                      url: `${window.location.origin}/?track=${encodeURIComponent(currentTrack.id)}`,
                      codeValue: `zeromusic:track:${currentTrack.id}`,
                      trackId: currentTrack.id,
                    });
                  }}
                  className="w-full py-2.5 text-left text-[15px] font-semibold text-white hover:text-red-400 flex items-center gap-4 transition-colors cursor-pointer"
                >
                  <QrCode className="w-5 h-5 text-neutral-300" />
                  <span>zero-musicコードを表示</span>
                </button>

                <div className="my-1.5 border-t border-white/10" />

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    openShareModal('track');
                  }}
                  className="w-full py-2 text-left text-sm font-medium text-neutral-300 hover:text-white flex items-center gap-4 transition-colors cursor-pointer"
                >
                  <Link2 className="w-4 h-4 text-neutral-400" />
                  <span>URLコピー / YouTube埋め込み</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    openFreemakeModal(currentTrack);
                  }}
                  className="w-full py-2 text-left text-sm font-semibold text-sky-300 hover:text-sky-200 flex items-center gap-4 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4 text-sky-400" />
                  <span>Freemake ダウンロード / 形式変換</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const nextQ =
                      audioQuality === 'hires'
                        ? 'lossless'
                        : audioQuality === 'lossless'
                        ? 'high'
                        : audioQuality === 'high'
                        ? 'normal'
                        : audioQuality === 'normal'
                        ? 'low'
                        : audioQuality === 'low'
                        ? 'auto'
                        : 'hires';
                    setAudioQuality(nextQ);
                  }}
                  className="w-full py-2 text-left text-sm font-medium text-neutral-300 hover:text-white flex items-center gap-4 transition-colors cursor-pointer"
                >
                  <Volume2 className="w-4 h-4 text-neutral-400" />
                  <span>
                    音質:{' '}
                    {audioQuality === 'hires'
                      ? 'ハイレゾ DSP (24/96)'
                      : audioQuality === 'lossless'
                      ? 'ロスレス (CD 16/44.1)'
                      : audioQuality === 'high'
                      ? '高音質 (256kbps)'
                      : audioQuality === 'normal'
                      ? '標準 (160kbps)'
                      : audioQuality === 'low'
                      ? '低音質 (節約)'
                      : '自動'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setDspModalOpen(true);
                  }}
                  className="w-full py-2 text-left text-sm font-semibold text-sky-300 hover:text-sky-200 flex items-center gap-4 transition-colors cursor-pointer"
                >
                  <Sliders className="w-4 h-4 text-sky-400" />
                  <span>空間オーディオ・カラオケ(Sing)・DSP</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setWrappedModalOpen(true);
                  }}
                  className="w-full py-2 text-left text-sm font-medium text-neutral-300 hover:text-white flex items-center gap-4 transition-colors cursor-pointer"
                >
                  <Award className="w-4 h-4 text-neutral-400" />
                  <span>リスニング記録 (Wrapped)</span>
                </button>

                <div className="my-1.5 border-t border-white/10" />

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    hideTrack(currentTrack);
                  }}
                  className="w-full py-2 text-left text-sm font-semibold text-neutral-300 hover:text-red-400 flex items-center gap-4 transition-colors cursor-pointer"
                >
                  <EyeOff className="w-4 h-4 text-neutral-400" />
                  <span>この曲を非表示にする</span>
                </button>

                {currentTrack.artist && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      blockArtist(currentTrack.artist);
                    }}
                    className="w-full py-2 text-left text-sm font-semibold text-neutral-300 hover:text-red-400 flex items-center gap-4 transition-colors cursor-pointer"
                  >
                    <Ban className="w-4 h-4 text-neutral-400" />
                    <span>「{currentTrack.artist}」を再生しない</span>
                  </button>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="max-w-md w-full mx-auto py-3 text-center text-base font-bold text-white hover:text-neutral-300 transition-colors cursor-pointer"
            >
              閉じる
            </button>
          </div>
        )}

        {/* Center Artwork (Shown when there is NO MV or Canvas is OFF/loading; hidden once MV Canvas is playing) */}
        {isCanvasLayoutActive ? (
          <div className="flex-1 min-h-[180px] sm:min-h-[240px]" />
        ) : (
          <div className="my-auto py-4 flex items-center justify-center">
            <div className="relative w-full aspect-square max-w-[310px] sm:max-w-[350px] rounded-xl overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.85)] bg-neutral-900 ring-1 ring-white/10">
              <SafeImage
                src={currentTrack.thumbnail}
                alt={currentTrack.title}
                useBase64
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        )}

        {/* Floating Live Synced Lyric Line + Track Title, Artist & Controls */}
        <div className="space-y-4 pt-1">
          {floatingLyricsOverlay && floatingLine && (
            <button
              type="button"
              onClick={handleOpenPeekingLyrics}
              className="w-full text-left px-1 py-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer group"
              title="歌詞カードを展開"
            >
              <p className="text-base sm:text-lg font-black text-white/95 leading-snug drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)] line-clamp-2 group-hover:text-red-300 transition-colors">
                {floatingLine}
              </p>
            </button>
          )}

          {/* Compact Track Row + Like + Info */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <SafeImage
                src={currentTrack.thumbnail}
                alt={currentTrack.title}
                useBase64
                className={`w-12 h-12 rounded-md object-cover bg-neutral-800 shadow-lg ring-1 ring-white/15 shrink-0 ${
                  isCanvasLayoutActive ? '' : 'sm:hidden'
                }`}
              />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg sm:text-2xl font-black text-white tracking-tight truncate">
                  {currentTrack.title}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    if (currentTrack.artistId) {
                      navigateTo('artist', currentTrack.artistId);
                      setFullScreenPlayerOpen(false);
                    }
                  }}
                  className="text-sm sm:text-base text-neutral-300 hover:text-white font-normal truncate block mt-0.5 transition-colors cursor-pointer"
                >
                  {currentTrack.artist}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => openTrackDetailModal(currentTrack)}
                className="min-w-[38px] min-h-[38px] flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
                title="楽曲クレジット・詳細"
                aria-label="楽曲クレジット・詳細"
              >
                <Info className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => toggleLikeTrack(currentTrack)}
                className="min-w-[42px] min-h-[42px] -mr-1.5 flex items-center justify-center text-neutral-300 hover:text-red-500 transition-transform active:scale-125 cursor-pointer shrink-0"
                title={isLiked ? 'お気に入り解除' : 'お気に入りに追加'}
                aria-label={isLiked ? 'お気に入り解除' : 'お気に入りに追加'}
              >
                <Heart
                  className={`w-6 h-6 transition-colors ${
                    isLiked ? 'text-red-500 fill-red-500' : 'text-neutral-300 hover:text-white'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Scrubber Timeline */}
          <div className="space-y-1.5">
            <div
              className="relative h-1.5 bg-white/25 hover:h-2 rounded-full cursor-pointer group transition-all"
              onClick={handleProgressClick}
            >
              {trackTimestamps?.heatMarkers?.map((m, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    seekTo(m.timeSeconds);
                  }}
                  title={`${m.timeLabel} ${m.topLabel} (${m.mentions}件の言及)`}
                  className="absolute -top-0.5 -bottom-0.5 w-1.5 -translate-x-1/2 rounded-full bg-red-500 z-10 cursor-pointer hover:scale-125 transition-transform"
                  style={{
                    left: `${m.percent}%`,
                    opacity: 0.45 + m.heat * 0.55,
                    boxShadow: m.heat > 0.6 ? '0 0 8px rgba(239,68,68,0.95)' : undefined,
                  }}
                />
              ))}
              <div
                className="h-full bg-white rounded-full relative group-hover:bg-red-500 transition-colors z-20 pointer-events-none"
                style={{ width: `${percent}%` }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md" />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs font-mono text-neutral-400 tabular-nums">
              <span>{formatSeconds(progress)}</span>
              {trackTimestamps && trackTimestamps.heatMarkers.length > 0 && (
                <button
                  type="button"
                  onClick={() => seekTo(trackTimestamps.highlightStartSec)}
                  className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer"
                  title="一番盛り上がっているポイントへジャンプ"
                >
                  <Flame className="w-3 h-3" />
                  <span>見どころ {formatSeconds(trackTimestamps.highlightStartSec)}</span>
                </button>
              )}
              <span>{formatSeconds(duration)}</span>
            </div>
          </div>

          {/* Primary Controls Row */}
          <div className="flex items-center justify-between pt-0.5">
            <div className="relative flex flex-col items-center">
              <button
                type="button"
                onClick={cycleShuffleMode}
                className={`min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors cursor-pointer relative ${
                  shuffleMode !== 'off' ? 'text-red-500' : 'text-neutral-300 hover:text-white'
                }`}
                title={
                  shuffleMode === 'smart'
                    ? 'スマートシャッフル: おすすめ曲を織り交ぜて再生中'
                    : shuffleMode === 'on'
                    ? 'シャッフル再生: ON'
                    : 'シャッフル再生: OFF'
                }
              >
                <Shuffle className="w-5 h-5" />
                {shuffleMode === 'smart' && (
                  <span className="absolute top-1 right-1 text-[10px] font-black text-red-400">
                    ✨
                  </span>
                )}
              </button>
              {shuffleMode !== 'off' && <span className="w-1 h-1 rounded-full bg-red-500 -mt-1.5" />}
            </div>

            {currentTrack.trackType === 'podcast' && (
              <button
                type="button"
                onClick={() => skipBySeconds(-15)}
                className="min-w-[44px] min-h-[44px] flex flex-col items-center justify-center text-emerald-300 hover:text-white transition-transform active:scale-90 cursor-pointer"
                title="15秒戻る"
              >
                <RotateCcw className="w-5 h-5" />
                <span className="text-[10px] font-mono font-bold leading-none mt-0.5">-15s</span>
              </button>
            )}

            <button
              type="button"
              onClick={prevTrack}
              className="min-w-[48px] min-h-[48px] flex items-center justify-center text-white hover:text-neutral-200 transition-transform active:scale-90 cursor-pointer"
              title="前の曲"
            >
              <SkipBack className="w-8 h-8 fill-current" />
            </button>

            <button
              type="button"
              onClick={togglePlay}
              className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-2xl cursor-pointer"
              title={isPlaying ? '一時停止' : '再生'}
            >
              {isPlaying ? (
                <Pause className="w-7 h-7 fill-black" />
              ) : (
                <Play className="w-7 h-7 fill-black ml-1" />
              )}
            </button>

            <button
              type="button"
              onClick={() => nextTrack(true)}
              className="min-w-[48px] min-h-[48px] flex items-center justify-center text-white hover:text-neutral-200 transition-transform active:scale-90 cursor-pointer"
              title="次の曲"
            >
              <SkipForward className="w-8 h-8 fill-current" />
            </button>

            {currentTrack.trackType === 'podcast' && (
              <button
                type="button"
                onClick={() => skipBySeconds(30)}
                className="min-w-[44px] min-h-[44px] flex flex-col items-center justify-center text-emerald-300 hover:text-white transition-transform active:scale-90 cursor-pointer"
                title="30秒進む"
              >
                <RotateCw className="w-5 h-5" />
                <span className="text-[10px] font-mono font-bold leading-none mt-0.5">+30s</span>
              </button>
            )}

            <div className="relative flex flex-col items-center">
              <button
                type="button"
                onClick={cycleRepeat}
                className={`min-w-[44px] min-h-[44px] flex items-center justify-center transition-colors cursor-pointer ${
                  repeatMode !== 'off' ? 'text-red-500' : 'text-neutral-300 hover:text-white'
                }`}
                title={`リピート: ${repeatMode}`}
              >
                {repeatMode === 'one' ? (
                  <Repeat1 className="w-5 h-5" />
                ) : (
                  <Repeat className="w-5 h-5" />
                )}
              </button>
              {repeatMode !== 'off' && <span className="w-1 h-1 rounded-full bg-red-500 -mt-1.5" />}
            </div>
          </div>

          {/* Connect Device / Share / Queue Row (IMG_0277 bottom icons) */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setConnectModalOpen(true)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              title="デバイスに接続 (Connect)"
            >
              <MonitorSpeaker className="w-5 h-5" />
              <span className="text-[11px] font-semibold">デバイス</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDspModalOpen(true)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer border ${
                  vocalLevel < 100 || spatialAudio !== 'off' || audioQuality === 'lossless' || audioQuality === 'hires'
                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                    : 'bg-white/5 text-neutral-300 border-white/10 hover:text-white hover:bg-white/10'
                }`}
                title="高音質DSP / 空間オーディオ / Singカラオケ"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>
                  {vocalLevel < 100
                    ? `Sing ${vocalLevel}%`
                    : spatialAudio !== 'off'
                    ? '空間3D'
                    : audioQuality === 'hires'
                    ? 'Hi-Res'
                    : audioQuality === 'lossless'
                    ? 'Lossless'
                    : 'DSP/Sing'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => openFreemakeModal(currentTrack)}
                className="p-2 text-sky-300 hover:text-white rounded-lg hover:bg-sky-500/20 transition-colors cursor-pointer"
                title="Freemakeでダウンロード・変換"
              >
                <Download className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => openVisualShareCard({ type: 'track', track: currentTrack })}
                className="p-2 text-neutral-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                title="シェアカードを作成・共有"
              >
                <Share2 className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setQueueOpen(true)}
                className="relative p-2 text-neutral-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                title="再生キュー"
              >
                <ListMusic className="w-5 h-5" />
                {queue.length - 1 - queueIndex > 0 && (
                  <span className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-red-600 text-[9px] font-black text-white flex items-center justify-center leading-none">
                    {queue.length - 1 - queueIndex > 99 ? '99+' : queue.length - 1 - queueIndex}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Secondary Utility Pills (Speed, Digest, Emotion Radio, Timestamps) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-neutral-400 border-t border-white/10 relative">
            <div className="relative">
              <button
                type="button"
                onClick={() => setSpeedMenuOpen((prev) => !prev)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer ${
                  playbackRate !== 1.0
                    ? 'bg-red-600/30 text-red-300 border border-red-500/40'
                    : 'bg-white/10 text-neutral-300 hover:text-white'
                }`}
                title="再生速度"
              >
                <Gauge className="w-3.5 h-3.5" />
                <span>{playbackRate}x</span>
              </button>

              {speedMenuOpen && (
                <div
                  className="absolute bottom-full left-0 mb-2 w-32 p-1 bg-[#18181e] border border-neutral-800 rounded-xl shadow-2xl z-50 text-xs space-y-0.5"
                  onClick={() => setSpeedMenuOpen(false)}
                >
                  <div className="px-2 py-1 text-[10px] font-bold text-neutral-500 uppercase">
                    再生速度
                  </div>
                  {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setPlaybackRate(rate)}
                      className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-mono flex items-center justify-between transition-colors ${
                        playbackRate === rate
                          ? 'bg-red-600 text-white font-bold'
                          : 'text-neutral-300 hover:bg-white/5'
                      }`}
                    >
                      <span>{rate}x</span>
                      {playbackRate === rate && <span>✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={toggleDigestMode}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                digestMode
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                  : 'bg-white/10 text-neutral-300 hover:text-white'
              }`}
              title="サビ・盛り上がり箇所を25秒連続再生"
            >
              <Zap className={`w-3.5 h-3.5 ${digestMode ? 'fill-white' : ''}`} />
              <span>{digestMode ? `ダイジェスト ${digestRemainingSec}s` : 'ダイジェスト'}</span>
            </button>

            <button
              type="button"
              onClick={toggleEndlessRadio}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                endlessRadioActive
                  ? 'bg-red-950/80 text-red-300 border border-red-700/50'
                  : 'bg-white/10 text-neutral-400 hover:text-white'
              }`}
              title="YouTubeコメント感情に合う曲を自動補充"
            >
              <Radio className="w-3.5 h-3.5" />
              <span className="max-w-[78px] truncate">
                {endlessRadioActive && emotionRadioMood ? emotionRadioMood.name : '感情ラジオ'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setCanvasEnabled((v) => !v)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                canvasEnabled && canvasVideoId
                  ? 'bg-red-600/30 text-red-200 border border-red-500/40'
                  : canvasEnabled
                  ? 'bg-white/10 text-neutral-300 border border-white/10'
                  : 'bg-white/10 text-neutral-400 hover:text-white'
              }`}
              title="MVがある曲は背景でMVループ再生・MVがない曲はジャケット画像を表示"
            >
              <Film className="w-3.5 h-3.5" />
              <span>
                {!canvasEnabled
                  ? 'MV背景 OFF'
                  : currentTrack.isLocal || (!checkingMv && !canvasVideoId)
                  ? '画像表示 (MVなし)'
                  : 'MV背景'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setTimestampsExpanded((prev) => !prev);
                setInlineLyricsExpanded(false);
              }}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                timestampsExpanded
                  ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                  : 'bg-white/10 text-neutral-300 hover:text-white'
              }`}
              title="見どころ・タイムスタンプ"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>
                見どころ
                {trackTimestamps?.timestamps?.length
                  ? ` (${trackTimestamps.timestamps.length})`
                  : ''}
              </span>
            </button>
          </div>

          {queue[queueIndex + 1] && (
            <button
              type="button"
              onClick={() => setQueueOpen(true)}
              className="w-full px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-black shrink-0">
                  次の曲
                </span>
                <span className="text-xs font-medium text-neutral-200 truncate">
                  {queue[queueIndex + 1].title}
                </span>
              </div>
              <span className="text-[11px] font-semibold text-red-400 shrink-0">
                キュー ({Math.max(0, queue.length - 1 - queueIndex)})
              </span>
            </button>
          )}

          {/* Bottom Peeking Colored Lyrics Drawer Handle (IMG_0277〜0279) */}
          <button
            type="button"
            onClick={handleOpenPeekingLyrics}
            className="w-full px-4 py-3 rounded-2xl bg-gradient-to-r from-[#b91c1c] to-[#991b1b] hover:from-[#dc2626] hover:to-[#b91c1c] text-white flex items-center justify-between gap-3 shadow-xl transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="text-sm font-black tracking-tight shrink-0">歌詞</span>
              {floatingLine && (
                <span className="text-xs text-white/85 truncate font-medium">
                  {floatingLine}
                </span>
              )}
            </div>
            <span className="flex items-center gap-1 text-[11px] font-bold text-white/90 shrink-0">
              <span>{inlineLyricsExpanded ? '閉じる' : '表示'}</span>
              {inlineLyricsExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </span>
          </button>
        </div>

        {/* Inline Timestamps / Setlist Jump Sheet */}
        {timestampsExpanded && (
          <div className="mt-4 p-4 rounded-2xl bg-gradient-to-b from-red-950/60 to-black/90 border border-red-500/20 shadow-2xl space-y-3 animate-in slide-in-from-bottom-4 duration-200">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>曲中の見どころ・タイムスタンプ</span>
              </span>
              <button
                type="button"
                onClick={() => setTimestampsExpanded(false)}
                className="text-neutral-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {trackTimestamps && trackTimestamps.timestamps.length > 0 ? (
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {trackTimestamps.timestamps.map((item, idx) => (
                  <button
                    key={`${item.timeSeconds}-${idx}`}
                    type="button"
                    onClick={() => seekTo(item.timeSeconds)}
                    className="w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl bg-black/50 hover:bg-red-950/50 border border-white/5 hover:border-red-600/40 text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="px-2 py-0.5 rounded bg-red-600/25 border border-red-500/40 text-red-400 font-mono text-xs font-bold shrink-0">
                        {item.timeLabel}
                      </span>
                      <span className="text-xs text-neutral-100 font-medium truncate">
                        {item.label}
                      </span>
                    </div>
                    <span className="text-[10px] text-neutral-500 shrink-0">
                      {item.source === 'description' ? '概要欄' : `👍 ${item.likes || '0'}`}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-400 py-4 text-center">
                タイムスタンプ付きコメント・概要欄チャプターは見つかりませんでした
              </p>
            )}
          </div>
        )}

        {/* Inline Lyrics Preview Card */}
        {inlineLyricsExpanded && (() => {
          const matchedArtist = currentLyrics?.matchedArtist?.trim() || '';
          const isMismatch = Boolean(
            currentTrack?.artist && matchedArtist && !isSameArtist(matchedArtist, currentTrack.artist)
          );
          return (
            <div
              ref={lyricsSheetRef}
              className="mt-4 p-5 rounded-2xl bg-gradient-to-b from-[#991b1b]/90 via-[#450a0a]/95 to-black border border-red-500/30 shadow-2xl space-y-3 animate-in slide-in-from-bottom-4 duration-200"
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 shrink-0">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>歌詞</span>
                  </span>
                  {matchedArtist && (
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold max-w-full truncate ${
                        isMismatch
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-white/10 text-neutral-200 border border-white/10'
                      }`}
                    >
                      {isMismatch ? (
                        <AlertTriangle className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                      ) : (
                        <UserCheck className="w-2.5 h-2.5 text-red-300 shrink-0" />
                      )}
                      <span className="truncate">{matchedArtist}</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => openVisualShareCard({ type: 'track', track: currentTrack })}
                    className="px-2.5 py-1 rounded-lg bg-white text-black hover:bg-neutral-200 text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Share2 className="w-2.5 h-2.5" />
                    <span>歌詞カード</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openLyricsSwitcher()}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors border ${
                      isMismatch
                        ? 'bg-amber-500 hover:bg-amber-400 text-neutral-950 border-amber-400'
                        : 'bg-white/10 hover:bg-white/20 text-neutral-200 border-white/15'
                    }`}
                    title="違う歌詞の場合は別の候補に変更"
                  >
                    <ArrowLeftRight className="w-2.5 h-2.5" />
                    <span>歌詞変更</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setInlineLyricsExpanded(false)}
                    className="text-neutral-300 hover:text-white p-1 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {currentLyrics?.syncedLyrics && currentLyrics.syncedLyrics.length > 0 ? (
                <div className="space-y-3 max-h-64 overflow-y-auto pr-2 scrollbar-thin">
                  {currentLyrics.syncedLyrics.map((line: SyncedLine, idx: number) => {
                    const isActive = idx === activeLyricIndex;
                    return (
                      <p
                        key={idx}
                        onClick={() => seekTo(line.time)}
                        className={`text-sm sm:text-base font-bold transition-all cursor-pointer ${
                          isActive
                            ? 'text-white text-lg font-black drop-shadow-[0_0_12px_rgba(255,255,255,0.6)]'
                            : 'text-white/55 hover:text-white/85'
                        }`}
                      >
                        {line.text}
                      </p>
                    );
                  })}
                </div>
              ) : currentLyrics?.lyrics ? (
                <div className="max-h-64 overflow-y-auto pr-2 text-xs sm:text-sm text-neutral-200 whitespace-pre-wrap leading-relaxed">
                  {currentLyrics.lyrics}
                </div>
              ) : (
                <p className="text-xs text-neutral-300 py-4 text-center">
                  歌詞情報を読み込み中、または未登録です
                </p>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
};
