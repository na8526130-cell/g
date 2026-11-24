import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  X,
  Play,
  Pause,
  RotateCcw,
  Disc3,
  Download,
  Sliders,
  Music,
  Volume2,
  Loader2,
  Check,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { audioDspEngine, DjDeckSnapshot } from '../services/audioDspEngine';
import { getAllOfflineTracks, getPlayableOfflineTrack } from '../services/offlineStorage';
import { Track } from '../types/music';
import { SafeImage } from './SafeImage';

function formatTimeSec(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const DjMixerModal: React.FC = () => {
  const {
    djMixerOpen,
    setDjMixerOpen,
    currentTrack,
    queue,
    likedTracks,
    recentTracks,
    isPlaying,
    pause,
    showToast,
  } = usePlayer();

  const [deckTracks, setDeckTracks] = useState<[Track | null, Track | null]>([null, null]);
  const [deckLoading, setDeckLoading] = useState<[boolean, boolean]>([false, false]);
  const [offlineTracks, setOfflineTracks] = useState<Track[]>([]);
  const [djState, setDjState] = useState<{
    decks: [DjDeckSnapshot, DjDeckSnapshot];
    crossfader: number;
  }>(() => audioDspEngine.getDjState());

  // Build deduplicated pool of candidate tracks for Deck A & Deck B pickers
  const trackPool = useMemo(() => {
    const map = new Map<string, Track>();
    const add = (t?: Track | null) => {
      if (t?.id && !map.has(t.id)) {
        map.set(t.id, t);
      }
    };
    add(currentTrack);
    queue.forEach(add);
    likedTracks.forEach(add);
    recentTracks.forEach(add);
    offlineTracks.forEach(add);
    return Array.from(map.values()).slice(0, 60);
  }, [currentTrack, queue, likedTracks, recentTracks, offlineTracks]);

  const resolveDeckAudioUrl = useCallback(async (track: Track): Promise<string> => {
    if (track.isLocal || track.id.startsWith('local_') || track.id.startsWith('shared_')) {
      const resolved = await getPlayableOfflineTrack(track);
      if (resolved?.audioUrl) return resolved.audioUrl;
    }
    return `/api/music/audio-stream/${encodeURIComponent(track.id)}?quality=high`;
  }, []);

  const loadTrackToDeck = useCallback(
    async (deckIdx: 0 | 1, track: Track) => {
      setDeckLoading((prev) => {
        const next: [boolean, boolean] = [...prev] as [boolean, boolean];
        next[deckIdx] = true;
        return next;
      });
      setDeckTracks((prev) => {
        const next: [Track | null, Track | null] = [...prev] as [Track | null, Track | null];
        next[deckIdx] = track;
        return next;
      });

      try {
        const src = await resolveDeckAudioUrl(track);
        await audioDspEngine.loadDjDeckTrack(deckIdx, src, track.id);
      } catch {
        showToast(`Deck ${deckIdx === 0 ? 'A' : 'B'} の音源読込に失敗しました`, 'warning', 2200);
      } finally {
        setDeckLoading((prev) => {
          const next: [boolean, boolean] = [...prev] as [boolean, boolean];
          next[deckIdx] = false;
          return next;
        });
      }
    },
    [resolveDeckAudioUrl, showToast]
  );

  // Activate DJ Mixer Mode cleanly on open, deactivate on close
  useEffect(() => {
    if (!djMixerOpen) return;

    if (isPlaying) {
      pause();
    }
    audioDspEngine.setDjMixerActive(true);
    setDjState(audioDspEngine.getDjState());

    getAllOfflineTracks()
      .then((list) => setOfflineTracks(list || []))
      .catch(() => {});

    const unsub = audioDspEngine.onDjStateChange(() => {
      setDjState(audioDspEngine.getDjState());
    });
    const timer = setInterval(() => {
      setDjState(audioDspEngine.getDjState());
    }, 250);

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDjMixerOpen(false);
    };
    window.addEventListener('keydown', handleKey);

    return () => {
      unsub();
      clearInterval(timer);
      window.removeEventListener('keydown', handleKey);
      audioDspEngine.setDjMixerActive(false);
    };
  }, [djMixerOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-populate Deck A & Deck B on first open if empty
  useEffect(() => {
    if (!djMixerOpen || trackPool.length === 0) return;
    if (!deckTracks[0]) {
      loadTrackToDeck(0, currentTrack || trackPool[0]);
    }
    if (!deckTracks[1]) {
      const alt = trackPool.find((t) => t.id !== (currentTrack?.id || trackPool[0]?.id)) || trackPool[0];
      if (alt) loadTrackToDeck(1, alt);
    }
  }, [djMixerOpen, trackPool, currentTrack, deckTracks, loadTrackToDeck]);

  const exportTracksList = useMemo(() => {
    const out: Track[] = [];
    const seen = new Set<string>();
    [deckTracks[0], deckTracks[1], ...queue].forEach((t) => {
      if (t?.id && !seen.has(t.id)) {
        seen.add(t.id);
        out.push(t);
      }
    });
    return out;
  }, [deckTracks, queue]);

  if (!djMixerOpen) return null;

  const handleExportM3u8 = () => {
    if (exportTracksList.length === 0) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const lines = ['#EXTM3U', '#PLAYLIST:Zero Music DJ Set'];
    exportTracksList.forEach((t) => {
      const dur = t.durationSeconds && t.durationSeconds > 0 ? Math.round(t.durationSeconds) : 210;
      const bpmTag = t.bpm ? ` [${t.bpm} BPM]` : '';
      lines.push(`#EXTINF:${dur},${t.artist} - ${t.title}${bpmTag}`);
      if (t.isLocal) {
        lines.push(`${t.title}.audio`);
      } else {
        lines.push(`${origin}/api/music/audio-stream/${encodeURIComponent(t.id)}?quality=high`);
      }
    });
    const blob = new Blob([lines.join('\n')], { type: 'audio/x-mpegurl;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zero-music-dj-set-${new Date().toISOString().slice(0, 10)}.m3u8`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('djay / rekordbox / Serato 対応 M3U8 セットリストを書き出しました', 'success', 2600);
  };

  const handleExportCue = () => {
    if (exportTracksList.length === 0) return;
    const lines = [
      'REM GENRE "Zero Music DJ Mix"',
      `REM DATE ${new Date().getFullYear()}`,
      'TITLE "Zero Music DJ Mix Session"',
      'PERFORMER "Zero Music"',
    ];
    let offsetSec = 0;
    exportTracksList.slice(0, 20).forEach((t, idx) => {
      const mm = String(Math.floor(offsetSec / 60)).padStart(2, '0');
      const ss = String(Math.floor(offsetSec % 60)).padStart(2, '0');
      const num = String(idx + 1).padStart(2, '0');
      lines.push(`  TRACK ${num} AUDIO`);
      lines.push(`    TITLE "${(t.title || '').replace(/"/g, "'")}"`);
      lines.push(`    PERFORMER "${(t.artist || '').replace(/"/g, "'")}"`);
      lines.push(`    INDEX 01 ${mm}:${ss}:00`);
      offsetSec += t.durationSeconds && t.durationSeconds > 30 ? Math.round(t.durationSeconds) : 180;
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zero-music-dj-cue-${new Date().toISOString().slice(0, 10)}.cue`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('DJソフト用 .CUE ファイルを書き出しました', 'success', 2400);
  };

  const renderDeck = (deckIdx: 0 | 1) => {
    const label = deckIdx === 0 ? 'DECK A' : 'DECK B';
    const accent = deckIdx === 0 ? 'sky' : 'rose';
    const snap = djState.decks[deckIdx];
    const track = deckTracks[deckIdx];
    const loading = deckLoading[deckIdx];

    return (
      <div
        className={`rounded-2xl bg-[#14141b] border p-4 space-y-3.5 ${
          deckIdx === 0 ? 'border-sky-500/35' : 'border-rose-500/35'
        }`}
      >
        {/* Deck Header + Track Selector */}
        <div className="flex items-center justify-between gap-2">
          <span
            className={`px-2.5 py-0.5 rounded-md text-[11px] font-black tracking-wider ${
              accent === 'sky'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
            }`}
          >
            {label}
          </span>
          <select
            value={track?.id || ''}
            onChange={(e) => {
              const found = trackPool.find((t) => t.id === e.target.value);
              if (found) loadTrackToDeck(deckIdx, found);
            }}
            className="flex-1 max-w-[230px] bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-white/40 truncate"
            aria-label={`${label} の楽曲を選択`}
          >
            {trackPool.length === 0 && <option value="">曲がありません</option>}
            {trackPool.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} — {t.artist}
              </option>
            ))}
          </select>
        </div>

        {/* Turntable / Track Info */}
        <div className="flex items-center gap-3">
          <div
            className={`w-14 h-14 rounded-full overflow-hidden border-2 shrink-0 bg-neutral-900 flex items-center justify-center ${
              accent === 'sky' ? 'border-sky-500/60' : 'border-rose-500/60'
            } ${snap.playing ? 'animate-spin' : ''}`}
            style={snap.playing ? { animationDuration: '5s' } : undefined}
          >
            {track?.thumbnail ? (
              <SafeImage src={track.thumbnail} alt={track.title} className="w-full h-full object-cover" />
            ) : (
              <Disc3 className="w-7 h-7 text-neutral-500" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-white truncate">
              {track?.title || '楽曲を選択してください'}
            </p>
            <p className="text-xs text-neutral-400 truncate mt-0.5">
              {track?.artist || '—'}
              {track?.bpm ? ` · ~${track.bpm} BPM` : ''}
            </p>
            <div className="flex items-center gap-2 mt-1 text-[11px] font-mono text-neutral-400">
              <span>{formatTimeSec(snap.currentTime)}</span>
              <span>/</span>
              <span>{formatTimeSec(snap.duration)}</span>
              <span className="ml-auto font-bold text-neutral-200">
                {snap.playbackRate.toFixed(2)}x
              </span>
            </div>
          </div>
        </div>

        {/* Seek Bar */}
        <input
          type="range"
          min={0}
          max={Math.max(1, snap.duration || track?.durationSeconds || 240)}
          step={0.5}
          value={Math.min(snap.currentTime, snap.duration || 240)}
          onChange={(e) => audioDspEngine.seekDjDeck(deckIdx, Number(e.target.value))}
          className={`w-full h-1.5 rounded-lg cursor-pointer ${
            accent === 'sky' ? 'accent-sky-400' : 'accent-rose-500'
          } bg-neutral-800`}
          aria-label={`${label} シークバー`}
        />

        {/* Transport Controls: Play/Pause, Cue, Nudge */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!track || loading}
            onClick={() => audioDspEngine.toggleDjDeckPlay(deckIdx)}
            className={`flex-1 min-h-[44px] rounded-xl font-black text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-40 ${
              snap.playing
                ? accent === 'sky'
                  ? 'bg-sky-500 text-neutral-950'
                  : 'bg-rose-500 text-white'
                : 'bg-white text-black hover:bg-neutral-200'
            }`}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : snap.playing ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current" />
            )}
            <span>{snap.playing ? 'PAUSE' : 'PLAY'}</span>
          </button>

          <button
            type="button"
            disabled={!track}
            onClick={() => audioDspEngine.seekDjDeck(deckIdx, 0)}
            className="min-h-[44px] px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-neutral-200 flex items-center gap-1 cursor-pointer disabled:opacity-40"
            title="頭出し (CUE)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>CUE</span>
          </button>

          <button
            type="button"
            disabled={!track}
            onClick={() => audioDspEngine.seekDjDeck(deckIdx, snap.currentTime + 5)}
            className="min-h-[44px] px-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-[11px] font-mono font-bold text-neutral-300 cursor-pointer disabled:opacity-40"
            title="5秒先へ"
          >
            +5s
          </button>
        </div>

        {/* Tempo / Pitch Slider */}
        <div className="space-y-1 pt-1 border-t border-white/5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-neutral-400 font-semibold">TEMPO / PITCH</span>
            <button
              type="button"
              onClick={() => audioDspEngine.setDjDeckRate(deckIdx, 1)}
              className="font-mono text-neutral-300 hover:text-white cursor-pointer"
            >
              {snap.playbackRate === 1
                ? '±0.0%'
                : `${snap.playbackRate > 1 ? '+' : ''}${((snap.playbackRate - 1) * 100).toFixed(1)}% (リセット)`}
            </button>
          </div>
          <input
            type="range"
            min={0.84}
            max={1.16}
            step={0.01}
            value={snap.playbackRate}
            onChange={(e) => audioDspEngine.setDjDeckRate(deckIdx, Number(e.target.value))}
            className="w-full h-1.5 bg-neutral-800 rounded-lg cursor-pointer accent-amber-400"
            aria-label={`${label} テンポ`}
          />
        </div>

        {/* 3-Band EQ */}
        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/5">
          {(
            [
              { key: 'low', label: 'LOW', val: snap.eqLow },
              { key: 'mid', label: 'MID', val: snap.eqMid },
              { key: 'high', label: 'HIGH', val: snap.eqHigh },
            ] as const
          ).map((band) => (
            <div key={band.key} className="bg-neutral-900/80 rounded-xl p-2 text-center space-y-1">
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-neutral-400 font-bold">{band.label}</span>
                <span className="text-neutral-200">{band.val > 0 ? `+${band.val}` : band.val}dB</span>
              </div>
              <input
                type="range"
                min={-18}
                max={9}
                step={1}
                value={band.val}
                onChange={(e) =>
                  audioDspEngine.setDjDeckEq(deckIdx, { [band.key]: Number(e.target.value) })
                }
                className="w-full h-1 bg-neutral-700 rounded cursor-pointer accent-white"
                aria-label={`${label} ${band.label} EQ`}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150"
      onClick={() => setDjMixerOpen(false)}
    >
      <div
        className="w-full sm:max-w-4xl bg-[#0b0b10] border-t sm:border border-purple-500/30 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dj-mixer-title"
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 bg-gradient-to-r from-[#1c1028] via-[#12121a] to-[#0b0b10] border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-300 shrink-0">
              <Sliders className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="dj-mixer-title" className="text-lg font-black text-white tracking-tight">
                DJ ミキサー & ソフト連携
              </h2>
              <p className="text-xs text-neutral-400 truncate">
                2デッキ手動クロスフェード・3バンドEQ・djay / rekordbox / Serato セット出力
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDjMixerOpen(false)}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-white/10 cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Console */}
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderDeck(0)}
            {renderDeck(1)}
          </div>

          {/* Center Crossfader */}
          <div className="p-4 rounded-2xl bg-[#15151f] border border-white/10 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-black">
              <span className="text-sky-400">DECK A ({Math.round((1 - djState.crossfader) * 100)}%)</span>
              <span className="text-neutral-300">CROSSFADER</span>
              <span className="text-rose-400">DECK B ({Math.round(djState.crossfader * 100)}%)</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={djState.crossfader}
              onChange={(e) => audioDspEngine.setDjManualCrossfader(Number(e.target.value))}
              className="w-full h-2.5 bg-gradient-to-r from-sky-600/40 via-neutral-700 to-rose-600/40 rounded-lg cursor-pointer accent-white"
              aria-label="DJクロスフェーダー"
            />
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => audioDspEngine.setDjManualCrossfader(0)}
                className="px-3 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/30 text-sky-300 text-[11px] font-bold cursor-pointer"
              >
                Deck A 100%
              </button>
              <button
                type="button"
                onClick={() => audioDspEngine.setDjManualCrossfader(0.5)}
                className="px-3 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px] font-bold cursor-pointer"
              >
                Center (50/50)
              </button>
              <button
                type="button"
                onClick={() => audioDspEngine.setDjManualCrossfader(1)}
                className="px-3 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 text-[11px] font-bold cursor-pointer"
              >
                Deck B 100%
              </button>
            </div>
          </div>

          {/* External DJ Software Export Section */}
          <div className="p-4 rounded-2xl bg-neutral-900/70 border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black text-white flex items-center gap-1.5">
                <Music className="w-4 h-4 text-purple-400 shrink-0" />
                <span>外部DJソフト連携エクスポート (djay / rekordbox / Serato)</span>
              </p>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Deck A/B と現在の再生キュー ({exportTracksList.length}曲) を .M3U8 / .CUE 形式で書き出します
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={exportTracksList.length === 0}
                onClick={handleExportM3u8}
                className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>.M3U8 出力</span>
              </button>
              <button
                type="button"
                disabled={exportTracksList.length === 0}
                onClick={handleExportCue}
                className="px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-neutral-200 text-xs font-bold flex items-center gap-1.5 border border-neutral-700 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>.CUE 出力</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
