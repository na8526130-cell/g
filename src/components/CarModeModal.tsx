import React, { useEffect, useState, useRef } from 'react';
import {
  X,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Heart,
  Car,
  Sparkles,
  MonitorSpeaker,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { api } from '../services/api';
import { SafeImage } from './SafeImage';

function formatSecs(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const CarModeModal: React.FC = () => {
  const {
    carModeOpen,
    setCarModeOpen,
    currentTrack,
    isPlaying,
    togglePlay,
    nextTrack,
    prevTrack,
    progress,
    duration,
    seekTo,
    likedTrackIds,
    toggleLikeTrack,
    playTrack,
    setConnectModalOpen,
    catalogRegion,
    showToast,
  } = usePlayer();

  const [generatingDriveMix, setGeneratingDriveMix] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const wakeLockRef = useRef<any>(null);

  // Acquire WakeLock while Drive Mode is active so the screen never dims on car mount
  useEffect(() => {
    if (!carModeOpen) return;
    let mounted = true;
    const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;

    const acquire = async () => {
      try {
        if (nav?.wakeLock?.request) {
          const sentinel = await nav.wakeLock.request('screen');
          if (!mounted) {
            sentinel.release?.().catch(() => {});
            return;
          }
          wakeLockRef.current = sentinel;
          setWakeLockActive(true);
        }
      } catch {
        setWakeLockActive(false);
      }
    };
    acquire();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCarModeOpen(false);
    };
    window.addEventListener('keydown', handleKey);

    return () => {
      mounted = false;
      window.removeEventListener('keydown', handleKey);
      if (wakeLockRef.current) {
        wakeLockRef.current.release?.().catch(() => {});
        wakeLockRef.current = null;
      }
      setWakeLockActive(false);
    };
  }, [carModeOpen, setCarModeOpen]);

  if (!carModeOpen) return null;

  const isLiked = currentTrack ? likedTrackIds.has(currentTrack.id) : false;

  const handleAiDriveMix = async () => {
    if (generatingDriveMix) return;
    setGeneratingDriveMix(true);
    try {
      const res = await api.generateAiPlaylist({
        prompt: '夜景ドライブ・高速道路で爽快に聴けるアップテンポな人気邦楽・洋楽ミックス',
        mode: 'playlist',
        trackCount: 12,
      });
      if (res?.tracks && res.tracks.length > 0) {
        playTrack(res.tracks[0], res.tracks, {
          source: 'CarPlay / Drive AI選曲',
          subtitle: res.playlistTitle || 'ドライブミックス',
        });
        showToast(`AIドライブ選曲（${res.tracks.length}曲）を開始しました`, 'success', 2400);
      }
    } catch {
      try {
        const fallback = await api.searchByMoodBpm({
          mood: 'drive',
          bpmRange: 'upbeat',
          gl: catalogRegion,
        });
        if (fallback?.tracks && fallback.tracks.length > 0) {
          playTrack(fallback.tracks[0], fallback.tracks, {
            source: 'Drive ミックス',
            subtitle: '爽快ドライブ選曲',
          });
          showToast('ドライブ向けプレイリストを再生します', 'success', 2200);
        }
      } catch {
        showToast('ドライブ選曲の取得に失敗しました', 'warning', 2200);
      }
    } finally {
      setGeneratingDriveMix(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[85] bg-black text-white flex flex-col justify-between p-5 sm:p-8 select-none animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="車載ドライブモード"
    >
      {/* Top Car Status Bar */}
      <header className="flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400">
            <Car className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black tracking-tight">ドライブモード</h2>
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/35 text-[11px] font-bold text-emerald-300 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{wakeLockActive ? '常時表示ON' : 'CarPlay / Android Auto 対応'}</span>
              </span>
            </div>
            <p className="text-xs text-neutral-400">
              ステアリング・MediaSessionボタン対応・大型タッチUI
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCarModeOpen(false)}
          className="min-w-[56px] min-h-[56px] rounded-2xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 flex items-center justify-center text-white cursor-pointer"
          aria-label="ドライブモードを終了"
        >
          <X className="w-7 h-7" />
        </button>
      </header>

      {/* Center Track Display */}
      <div className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10 max-w-4xl w-full mx-auto py-4 min-h-0">
        <div className="w-44 h-44 sm:w-64 sm:h-64 rounded-3xl overflow-hidden bg-neutral-900 border border-white/15 shadow-2xl shrink-0">
          {currentTrack?.thumbnail ? (
            <SafeImage
              src={currentTrack.thumbnail}
              alt={currentTrack.title}
              useBase64
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-neutral-600">
              <Car className="w-16 h-16" />
            </div>
          )}
        </div>

        <div className="w-full max-w-lg space-y-5 text-center sm:text-left">
          <div>
            <p className="text-2xl sm:text-4xl font-black text-white leading-tight line-clamp-2">
              {currentTrack?.title || '再生中の曲がありません'}
            </p>
            <p className="text-lg sm:text-xl font-bold text-neutral-300 mt-1.5 truncate">
              {currentTrack?.artist || '曲を選ぶか下の「AIドライブ選曲」をタップ'}
            </p>
          </div>

          {/* Large Touch-Friendly Seek Slider */}
          <div className="space-y-1.5">
            <input
              type="range"
              min={0}
              max={Math.max(1, duration || 100)}
              step={1}
              value={Math.min(progress, duration || 100)}
              onChange={(e) => seekTo(Number(e.target.value))}
              className="w-full h-3 bg-neutral-800 rounded-full accent-red-500 cursor-pointer"
              aria-label="再生位置"
            />
            <div className="flex items-center justify-between text-sm font-mono font-bold text-neutral-300">
              <span>{formatSecs(progress)}</span>
              <span>{formatSecs(duration)}</span>
            </div>
          </div>

          {/* Primary Large Controls (>= 68px touch targets) */}
          <div className="flex items-center justify-center sm:justify-start gap-4 sm:gap-6">
            <button
              type="button"
              onClick={prevTrack}
              className="w-[72px] h-[72px] sm:w-20 sm:h-20 rounded-2xl bg-neutral-900 hover:bg-neutral-800 active:scale-95 border border-neutral-700 flex items-center justify-center text-white transition-transform cursor-pointer"
              aria-label="前の曲"
            >
              <SkipBack className="w-9 h-9 fill-current" />
            </button>

            <button
              type="button"
              onClick={togglePlay}
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-white hover:bg-neutral-200 active:scale-95 text-black flex items-center justify-center shadow-2xl transition-transform cursor-pointer"
              aria-label={isPlaying ? '一時停止' : '再生'}
            >
              {isPlaying ? (
                <Pause className="w-11 h-11 fill-current" />
              ) : (
                <Play className="w-11 h-11 fill-current ml-1" />
              )}
            </button>

            <button
              type="button"
              onClick={() => nextTrack(true)}
              className="w-[72px] h-[72px] sm:w-20 sm:h-20 rounded-2xl bg-neutral-900 hover:bg-neutral-800 active:scale-95 border border-neutral-700 flex items-center justify-center text-white transition-transform cursor-pointer"
              aria-label="次の曲"
            >
              <SkipForward className="w-9 h-9 fill-current" />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Safe-Touch Quick Actions (NO Sleep Timer) */}
      <footer className="grid grid-cols-3 gap-3 max-w-4xl w-full mx-auto shrink-0">
        <button
          type="button"
          disabled={!currentTrack}
          onClick={() => currentTrack && toggleLikeTrack(currentTrack)}
          className={`min-h-[64px] rounded-2xl border font-black text-sm sm:text-base flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-40 ${
            isLiked
              ? 'bg-red-600/25 border-red-500 text-red-300'
              : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-white'
          }`}
        >
          <Heart className={`w-5 h-5 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
          <span>お気に入り</span>
        </button>

        <button
          type="button"
          disabled={generatingDriveMix}
          onClick={handleAiDriveMix}
          className="min-h-[64px] rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-colors cursor-pointer disabled:opacity-60"
        >
          {generatingDriveMix ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Sparkles className="w-5 h-5" />
          )}
          <span>AIドライブ選曲</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setCarModeOpen(false);
            setConnectModalOpen(true);
          }}
          className="min-h-[64px] rounded-2xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-white font-black text-sm sm:text-base flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <MonitorSpeaker className="w-5 h-5 text-emerald-400" />
          <span>Zero Connect</span>
        </button>
      </footer>
    </div>
  );
};
