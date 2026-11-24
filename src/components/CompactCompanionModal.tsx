import React, { useEffect, useState, useCallback } from 'react';
import {
  X,
  Watch,
  Gamepad2,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Heart,
  Copy,
  Check,
  Volume2,
  Wifi,
  HardDrive,
  RefreshCw,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { getAllOfflineTracks, getAllCachedSharedTracks } from '../services/offlineStorage';
import { ConnectDeviceInfo } from '../types/social';
import { SafeImage } from './SafeImage';

export const CompactCompanionModal: React.FC = () => {
  const {
    companionModalOpen,
    setCompanionModalOpen,
    companionMode,
    setCompanionMode,
    currentTrack,
    isPlaying,
    togglePlay,
    nextTrack,
    prevTrack,
    likedTrackIds,
    toggleLikeTrack,
    volume,
    setVolume,
    deviceId,
    pairingCode,
    connectDevices,
    refreshConnectDevices,
    sendRemoteCommand,
    showToast,
  } = usePlayer();

  const [offlineCount, setOfflineCount] = useState<number>(0);
  const [targetDeviceId, setTargetDeviceId] = useState<string>('local');
  const [copiedModeUrl, setCopiedModeUrl] = useState<'watch' | 'console' | null>(null);
  const [sendingCmd, setSendingCmd] = useState<boolean>(false);

  const remoteDevices = connectDevices.filter((d) => d.deviceId !== deviceId);
  const selectedRemote: ConnectDeviceInfo | undefined =
    targetDeviceId !== 'local'
      ? remoteDevices.find((d) => d.deviceId === targetDeviceId)
      : undefined;

  useEffect(() => {
    if (!companionModalOpen) return;
    refreshConnectDevices();
    Promise.all([getAllOfflineTracks(), getAllCachedSharedTracks()])
      .then(([loc, shared]) => {
        setOfflineCount((loc?.length || 0) + (shared?.length || 0));
      })
      .catch(() => {});
  }, [companionModalOpen, refreshConnectDevices]);

  const dispatchAction = useCallback(
    async (action: 'play' | 'pause' | 'next' | 'prev') => {
      if (selectedRemote) {
        setSendingCmd(true);
        try {
          await sendRemoteCommand({
            targetDeviceId: selectedRemote.deviceId,
            action,
          });
          setTimeout(() => refreshConnectDevices(), 450);
        } catch {
          showToast('Zero Connect 送信に失敗しました', 'warning', 2000);
        } finally {
          setSendingCmd(false);
        }
        return;
      }

      if (action === 'play' || action === 'pause') togglePlay();
      else if (action === 'next') nextTrack(true);
      else if (action === 'prev') prevTrack();
    },
    [selectedRemote, sendRemoteCommand, refreshConnectDevices, showToast, togglePlay, nextTrack, prevTrack]
  );

  // Console / TV D-pad keyboard navigation
  useEffect(() => {
    if (!companionModalOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCompanionModalOpen(false);
        return;
      }
      if (companionMode === 'console') {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          dispatchAction('next');
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          dispatchAction('prev');
        } else if (e.key === ' ' || e.key === 'Enter') {
          const activePlayState = selectedRemote ? selectedRemote.isPlaying : isPlaying;
          e.preventDefault();
          dispatchAction(activePlayState ? 'pause' : 'play');
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [companionModalOpen, companionMode, dispatchAction, selectedRemote, isPlaying, setCompanionModalOpen]);

  if (!companionModalOpen) return null;

  const displayTrack = selectedRemote?.currentTrack || currentTrack;
  const displayPlaying = selectedRemote ? Boolean(selectedRemote.isPlaying) : isPlaying;
  const displayTitle = displayTrack?.title || '待機中';
  const displayArtist = displayTrack?.artist || 'Zero Music';

  const handleCopyCompanionUrl = (mode: 'watch' | 'console') => {
    const url = `${window.location.origin}/?connect=${encodeURIComponent(pairingCode)}&mode=${mode}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopiedModeUrl(mode);
    showToast(
      mode === 'watch'
        ? 'スマートウォッチ用コンパクト画面URLをコピーしました'
        : 'ゲーム機 / TV ブラウザ用URLをコピーしました',
      'success',
      2400
    );
    setTimeout(() => setCopiedModeUrl(null), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-[82] bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150"
      onClick={() => setCompanionModalOpen(false)}
    >
      <div
        className={`w-full ${
          companionMode === 'console' ? 'sm:max-w-3xl' : 'sm:max-w-lg'
        } bg-[#101016] border-t sm:border border-white/15 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 transition-all`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="スマートウォッチ・ゲーム機コンパニオン"
      >
        {/* Header + Mode Switcher */}
        <div className="px-5 py-4 border-b border-white/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-neutral-900 border border-neutral-800">
            <button
              type="button"
              onClick={() => setCompanionMode('watch')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                companionMode === 'watch'
                  ? 'bg-emerald-600 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Watch className="w-3.5 h-3.5" />
              <span>スマートウォッチ UI</span>
            </button>
            <button
              type="button"
              onClick={() => setCompanionMode('console')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                companionMode === 'console'
                  ? 'bg-sky-600 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Gamepad2 className="w-3.5 h-3.5" />
              <span>ゲーム機 / TV 10-ft</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setCompanionModalOpen(false)}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-white/10 cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          {/* Target Device Selector via Zero Connect */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-neutral-900/80 border border-neutral-800 text-xs">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-neutral-300 font-semibold shrink-0">操作対象:</span>
              <select
                value={targetDeviceId}
                onChange={(e) => setTargetDeviceId(e.target.value)}
                className="bg-neutral-950 border border-neutral-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none truncate max-w-[200px]"
              >
                <option value="local">この端末（ローカル再生）</option>
                {remoteDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.name} ({d.pairingCode})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={refreshConnectDevices}
              className="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[11px] flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>再読込</span>
            </button>
          </div>

          {companionMode === 'watch' ? (
            /* 1:1 Wearable Watch Frame */
            <div className="flex flex-col items-center space-y-4">
              <div className="w-64 h-64 rounded-[2.6rem] bg-gradient-to-b from-[#171920] to-[#08080b] border-[6px] border-neutral-800 shadow-2xl p-4 flex flex-col justify-between items-center text-center relative overflow-hidden">
                <div className="flex items-center justify-between w-full px-1 text-[10px] font-mono text-neutral-400">
                  <span className="text-emerald-400 font-bold">{pairingCode}</span>
                  <span className="flex items-center gap-1">
                    <HardDrive className="w-3 h-3 text-cyan-400" />
                    {offlineCount}曲キャッシュ
                  </span>
                </div>

                <div className="flex items-center gap-2.5 w-full px-1">
                  <div className="w-11 h-11 rounded-xl overflow-hidden bg-neutral-800 shrink-0">
                    {displayTrack?.thumbnail ? (
                      <SafeImage src={displayTrack.thumbnail} alt={displayTitle} className="w-full h-full object-cover" />
                    ) : (
                      <Watch className="w-6 h-6 m-2.5 text-neutral-500" />
                    )}
                  </div>
                  <div className="min-w-0 text-left flex-1">
                    <p className="text-xs font-black text-white truncate">{displayTitle}</p>
                    <p className="text-[10px] text-neutral-400 truncate">{displayArtist}</p>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    disabled={sendingCmd}
                    onClick={() => dispatchAction('prev')}
                    className="w-11 h-11 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-white cursor-pointer"
                    aria-label="前の曲"
                  >
                    <SkipBack className="w-5 h-5 fill-current" />
                  </button>
                  <button
                    type="button"
                    disabled={sendingCmd}
                    onClick={() => dispatchAction(displayPlaying ? 'pause' : 'play')}
                    className="w-14 h-14 rounded-full bg-emerald-500 hover:bg-emerald-400 text-neutral-950 flex items-center justify-center shadow-lg cursor-pointer"
                    aria-label={displayPlaying ? '一時停止' : '再生'}
                  >
                    {displayPlaying ? (
                      <Pause className="w-6 h-6 fill-current" />
                    ) : (
                      <Play className="w-6 h-6 fill-current ml-0.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={sendingCmd}
                    onClick={() => dispatchAction('next')}
                    className="w-11 h-11 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-white cursor-pointer"
                    aria-label="次の曲"
                  >
                    <SkipForward className="w-5 h-5 fill-current" />
                  </button>
                </div>

                <div className="flex items-center justify-between w-full px-2">
                  <button
                    type="button"
                    disabled={!displayTrack}
                    onClick={() => displayTrack && toggleLikeTrack(displayTrack)}
                    className="p-1.5 text-neutral-400 hover:text-red-500 cursor-pointer"
                    aria-label="お気に入り"
                  >
                    <Heart
                      className={`w-4 h-4 ${
                        displayTrack && likedTrackIds.has(displayTrack.id)
                          ? 'fill-red-500 text-red-500'
                          : ''
                      }`}
                    />
                  </button>
                  <span className="text-[10px] font-bold text-neutral-400">
                    PWA オフライン再生対応
                  </span>
                </div>
              </div>

              <div className="text-center space-y-2 max-w-sm">
                <p className="text-xs text-neutral-300 leading-relaxed">
                  Wear OS / スマートウォッチやサブ端末のブラウザから下記専用URLを開くと、Zero Connect 経由で母艦端末を遠隔操作できます。PWAキャッシュ済み {offlineCount}曲のオフライン再生にも対応。
                </p>
                <button
                  type="button"
                  onClick={() => handleCopyCompanionUrl('watch')}
                  className="px-4 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/35 border border-emerald-500/40 text-emerald-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedModeUrl === 'watch' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>ウォッチ用コンパクトURLをコピー</span>
                </button>
              </div>
            </div>
          ) : (
            /* Console / TV 10-ft Big-Screen Remote UI */
            <div className="space-y-4">
              <div className="rounded-2xl bg-gradient-to-br from-[#121826] via-[#0e1017] to-black border border-sky-500/30 p-5 sm:p-6 flex flex-col sm:flex-row items-center gap-5">
                <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl overflow-hidden bg-neutral-900 border border-white/10 shadow-xl shrink-0">
                  {displayTrack?.thumbnail ? (
                    <SafeImage src={displayTrack.thumbnail} alt={displayTitle} useBase64 className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-600">
                      <Gamepad2 className="w-12 h-12" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0 text-center sm:text-left space-y-4 w-full">
                  <div>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-sky-500/20 border border-sky-500/35 text-[11px] font-bold text-sky-300 mb-1.5">
                      <Gamepad2 className="w-3.5 h-3.5" />
                      <span>Console / Smart TV Webコントローラ</span>
                    </span>
                    <h3 className="text-xl sm:text-2xl font-black text-white truncate">{displayTitle}</h3>
                    <p className="text-sm font-semibold text-neutral-300 truncate">{displayArtist}</p>
                  </div>

                  <div className="flex items-center justify-center sm:justify-start gap-3">
                    <button
                      type="button"
                      disabled={sendingCmd}
                      onClick={() => dispatchAction('prev')}
                      className="min-w-[56px] min-h-[56px] rounded-2xl bg-neutral-800 hover:bg-neutral-700 focus:ring-2 focus:ring-sky-400 flex items-center justify-center text-white cursor-pointer"
                    >
                      <SkipBack className="w-6 h-6 fill-current" />
                    </button>
                    <button
                      type="button"
                      disabled={sendingCmd}
                      onClick={() => dispatchAction(displayPlaying ? 'pause' : 'play')}
                      className="min-w-[72px] min-h-[56px] px-6 rounded-2xl bg-sky-500 hover:bg-sky-400 focus:ring-2 focus:ring-white text-neutral-950 font-black flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {displayPlaying ? (
                        <Pause className="w-6 h-6 fill-current" />
                      ) : (
                        <Play className="w-6 h-6 fill-current" />
                      )}
                      <span>{displayPlaying ? 'PAUSE' : 'PLAY'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={sendingCmd}
                      onClick={() => dispatchAction('next')}
                      className="min-w-[56px] min-h-[56px] rounded-2xl bg-neutral-800 hover:bg-neutral-700 focus:ring-2 focus:ring-sky-400 flex items-center justify-center text-white cursor-pointer"
                    >
                      <SkipForward className="w-6 h-6 fill-current" />
                    </button>
                  </div>

                  {!selectedRemote && (
                    <div className="flex items-center gap-2.5 max-w-xs mx-auto sm:mx-0">
                      <Volume2 className="w-4 h-4 text-neutral-400 shrink-0" />
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={volume}
                        onChange={(e) => setVolume(Number(e.target.value))}
                        className="w-full h-1.5 accent-sky-400 bg-neutral-800 rounded-lg cursor-pointer"
                        aria-label="音量"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 text-xs">
                <p className="text-neutral-300 leading-relaxed">
                  ゲーム機・TV内蔵ブラウザやキーボードから操作できます（十字キー <span className="font-mono text-sky-300">← / →</span> で曲送り、<span className="font-mono text-sky-300">Space / Enter</span> で再生・停止）。
                </p>
                <button
                  type="button"
                  onClick={() => handleCopyCompanionUrl('console')}
                  className="px-3.5 py-2 rounded-xl bg-sky-600/20 hover:bg-sky-600/35 border border-sky-500/40 text-sky-200 font-bold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {copiedModeUrl === 'console' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>ゲーム機/TV用URLをコピー</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
