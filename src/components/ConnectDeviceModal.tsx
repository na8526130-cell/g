import React, { useState, useEffect } from 'react';
import {
  X,
  Smartphone,
  Laptop,
  Bluetooth,
  Radio,
  Volume2,
  Check,
  Wifi,
  Speaker,
  Headphones,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ArrowDownToLine,
  Cast,
  RefreshCw,
  Copy,
  Sliders,
  Watch,
  Gamepad2,
  Car,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { AudioQualityMode } from '../types/music';
import { ConnectDeviceInfo } from '../types/social';

export const ConnectDeviceModal: React.FC = () => {
  const {
    connectModalOpen,
    setConnectModalOpen,
    currentTrack,
    queue,
    progress,
    isPlaying,
    pause,
    playTrack,
    seekTo,
    deviceMode,
    audioQuality,
    setAudioQuality,
    setDspModalOpen,
    onlineCount,
    navigateTo,
    setFullScreenPlayerOpen,
    showToast,
    deviceId,
    deviceName,
    setDeviceName,
    pairingCode,
    setPairingCode,
    connectDevices,
    refreshConnectDevices,
    sendRemoteCommand,
    setCompanionModalOpen,
    setCompanionMode,
    setCarModeOpen,
  } = usePlayer();

  const [selectedOutputLabel, setSelectedOutputLabel] = useState<string>('');
  const [audioOutputs, setAudioOutputs] = useState<{ deviceId: string; label: string }[]>([]);
  const [scanningBt, setScanningBt] = useState(false);
  const [editingName, setEditingName] = useState(deviceName);
  const [joinCodeInput, setJoinCodeInput] = useState(pairingCode);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null);

  useEffect(() => {
    setEditingName(deviceName);
  }, [deviceName]);

  useEffect(() => {
    setJoinCodeInput(pairingCode);
  }, [pairingCode]);

  useEffect(() => {
    if (!connectModalOpen) return;
    refreshConnectDevices();
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const outs = devices
            .filter((d) => d.kind === 'audiooutput' && d.label)
            .map((d) => ({ deviceId: d.deviceId, label: d.label }));
          setAudioOutputs(outs);
        })
        .catch(() => {});
    }
  }, [connectModalOpen, refreshConnectDevices]);

  if (!connectModalOpen) return null;

  const isMobile = deviceMode === 'mobile';
  const qualityLabels: Record<AudioQualityMode, string> = {
    auto: '自動',
    low: '節約',
    normal: '標準',
    high: '高音質',
    lossless: 'ロスレス',
    hires: 'ハイレゾ',
  };

  const remoteDevices = connectDevices.filter((d) => d.deviceId !== deviceId);

  const handleSelectAudioOutput = async () => {
    setScanningBt(true);
    try {
      const md = typeof navigator !== 'undefined' ? (navigator.mediaDevices as any) : null;
      if (md && typeof md.selectAudioOutput === 'function') {
        const device = await md.selectAudioOutput();
        if (device?.label) {
          setSelectedOutputLabel(device.label);
          showToast(`出力先を「${device.label}」に切り替えました`, 'success', 2400);
        }
      } else {
        showToast(
          '端末のコントロールセンター・Bluetooth設定からスピーカーやイヤホンを切り替えできます',
          'info',
          3500
        );
      }
    } catch {
      // User cancelled browser output picker
    } finally {
      setScanningBt(false);
    }
  };

  const handleSaveDeviceName = () => {
    const clean = editingName.trim().slice(0, 40);
    if (!clean || clean === deviceName) return;
    setDeviceName(clean);
    showToast(`この端末名を「${clean}」に変更しました`, 'success', 2000);
  };

  const handleCopyPairingCode = () => {
    navigator.clipboard?.writeText(pairingCode).catch(() => {});
    setCopiedCode(true);
    showToast(`ペアリングコード ${pairingCode} をコピーしました`, 'success', 2000);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  const handleCopyPairingUrl = () => {
    const url = `${window.location.origin}/?connect=${encodeURIComponent(pairingCode)}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopiedUrl(true);
    showToast('別端末で開くだけで接続できるURLをコピーしました', 'success', 2400);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleApplyPairing = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = joinCodeInput.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
    const code = /^\d{4}$/.test(raw) ? `ZM-${raw}` : raw.slice(0, 16);
    if (!code) return;
    setPairingCode(code);
    setJoinCodeInput(code);
    showToast(`ペアリングコードを ${code} に切り替えました`, 'success', 2200);
    setTimeout(() => refreshConnectDevices(), 350);
    setTimeout(() => refreshConnectDevices(), 900);
  };

  const sendActionWithRefresh = async (
    dev: ConnectDeviceInfo,
    action: 'play' | 'pause' | 'next' | 'prev' | 'volume',
    extra?: { volume?: number }
  ) => {
    setBusyDeviceId(dev.deviceId);
    try {
      await sendRemoteCommand({
        targetDeviceId: dev.deviceId,
        action,
        ...(extra || {}),
      });
      setTimeout(() => refreshConnectDevices(), 450);
      setTimeout(() => refreshConnectDevices(), 1100);
    } catch {
      showToast('端末への操作送信に失敗しました', 'warning', 2200);
    } finally {
      setTimeout(() => setBusyDeviceId((cur) => (cur === dev.deviceId ? null : cur)), 350);
    }
  };

  const handleCastToDevice = async (target: ConnectDeviceInfo) => {
    if (!currentTrack) {
      showToast('送信する曲が再生されていません', 'info', 2000);
      return;
    }
    setBusyDeviceId(target.deviceId);
    try {
      await sendRemoteCommand({
        targetDeviceId: target.deviceId,
        action: 'transfer',
        track: currentTrack,
        queue: queue.slice(0, 25),
        positionSec: Math.floor(progress || 0),
      });
      if (isPlaying) pause();
      showToast(`「${target.name}」へ再生を送信しました`, 'success', 2400);
      setTimeout(() => refreshConnectDevices(), 500);
    } catch {
      showToast('端末への送信に失敗しました', 'warning', 2200);
    } finally {
      setBusyDeviceId(null);
    }
  };

  const handlePullFromDevice = async (source: ConnectDeviceInfo) => {
    if (!source.currentTrack) {
      showToast('相手端末で曲が選択されていません', 'info', 2000);
      return;
    }
    setBusyDeviceId(source.deviceId);
    try {
      const elapsedSec =
        source.isPlaying && source.lastSeen
          ? Math.max(0, Math.floor((Date.now() - source.lastSeen) / 1000))
          : 0;
      const targetPos = Math.max(0, (source.positionSec || 0) + elapsedSec);

      await playTrack(
        source.currentTrack,
        source.queue && source.queue.length > 0 ? source.queue : undefined,
        {
          source: `Zero Connect (${source.name}から引継)`,
          subtitle: source.currentTrack.artist,
        }
      );
      if (targetPos > 1) {
        setTimeout(() => seekTo(targetPos), 500);
      }
      await sendRemoteCommand({
        targetDeviceId: source.deviceId,
        action: 'pause',
      });
      showToast(`「${source.name}」からこの端末に引き継ぎました`, 'success', 2400);
      setTimeout(() => refreshConnectDevices(), 500);
    } catch {
      showToast('再生の引き継ぎに失敗しました', 'warning', 2200);
    } finally {
      setBusyDeviceId(null);
    }
  };

  const formatSec = (sec?: number) => {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r < 10 ? '0' : ''}${r}`;
  };

  return (
    <div
      className="fixed inset-0 z-[75] bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150"
      onClick={() => setConnectModalOpen(false)}
    >
      <div
        className="w-full sm:max-w-lg bg-[#16161b] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle (Mobile) */}
        <div className="pt-3 pb-1 flex justify-center sm:hidden">
          <div className="w-10 h-1 rounded-full bg-neutral-600" />
        </div>

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-white/5">
          <div>
            <h3 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
              <span>Zero Connect</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                マルチ端末遠隔操作
              </span>
            </h3>
            <p className="text-[11px] text-neutral-400">
              スマホ・PC間で再生コントロール＆ワンタップ引継ぎ
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConnectModalOpen(false)}
            className="p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto">
          {/* Active Device Card */}
          <div className="p-4 rounded-2xl bg-[#222229] border border-red-500/35 space-y-3 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={handleSaveDeviceName}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.currentTarget.blur();
                      }
                    }}
                    className="bg-transparent text-base font-black text-white border-b border-white/15 focus:border-red-500 focus:outline-none w-44"
                    aria-label="この端末の名前"
                  />
                  <span className="px-2 py-0.5 rounded bg-neutral-700/80 text-[11px] font-bold text-neutral-200">
                    {qualityLabels[audioQuality]}
                  </span>
                </div>
                {currentTrack ? (
                  <p className="text-xs font-semibold text-red-400 truncate">
                    {currentTrack.title} - {currentTrack.artist}
                  </p>
                ) : (
                  <p className="text-xs text-neutral-400">再生待機中</p>
                )}
              </div>
              <div className="w-11 h-11 rounded-2xl bg-red-600/15 border border-red-500/40 flex items-center justify-center text-red-500 shrink-0">
                {selectedOutputLabel ? (
                  <Headphones className="w-6 h-6" />
                ) : isMobile ? (
                  <Smartphone className="w-6 h-6" />
                ) : (
                  <Laptop className="w-6 h-6" />
                )}
              </div>
            </div>

            {/* Pairing Code & Share URL */}
            <form onSubmit={handleApplyPairing} className="pt-2.5 border-t border-white/10 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-neutral-400">コード:</span>
                  <input
                    type="text"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    placeholder="ZM-1234"
                    className="w-24 px-2 py-1 rounded-lg bg-neutral-900 border border-neutral-700 text-xs font-mono font-bold text-emerald-300 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-[11px] font-bold text-white cursor-pointer"
                  >
                    接続 / 切替
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleCopyPairingCode}
                    className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-[11px] font-bold text-neutral-200 flex items-center gap-1 cursor-pointer"
                  >
                    {copiedCode ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCode ? 'コピー済み' : 'コード'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyPairingUrl}
                    className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-[11px] font-bold text-sky-300 flex items-center gap-1 cursor-pointer"
                  >
                    {copiedUrl ? <Check className="w-3 h-3 text-emerald-400" /> : <Wifi className="w-3 h-3" />}
                    <span>{copiedUrl ? 'URLコピー済み' : '接続URL'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Connected Remote Devices */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-300">
                連携中の他の端末 ({remoteDevices.length}台)
              </span>
              <button
                type="button"
                onClick={refreshConnectDevices}
                className="text-[11px] font-bold text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>更新</span>
              </button>
            </div>

            {remoteDevices.length === 0 ? (
              <div className="p-4 rounded-2xl bg-neutral-900/60 border border-white/5 text-center space-y-1.5">
                <p className="text-xs font-semibold text-neutral-300">
                  他の端末が見つかりません
                </p>
                <p className="text-[11px] text-neutral-500 leading-relaxed">
                  別端末（スマホ・PC・別ブラウザタブ）で「接続URL」を開くか、同じコード{' '}
                  <span className="font-mono text-emerald-300">{pairingCode}</span>{' '}
                  を入力するとここから再生操作・引継ぎができます
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {remoteDevices.map((dev) => {
                  const elapsed =
                    dev.isPlaying && dev.lastSeen
                      ? Math.max(0, Math.floor((Date.now() - dev.lastSeen) / 1000))
                      : 0;
                  const livePos = (dev.positionSec || 0) + elapsed;
                  const totalDur = dev.durationSec || dev.currentTrack?.durationSeconds || 0;
                  const pct = totalDur > 0 ? Math.min(100, (livePos / totalDur) * 100) : 0;
                  const isBusy = busyDeviceId === dev.deviceId;

                  return (
                    <div
                      key={dev.deviceId}
                      className="p-3.5 rounded-2xl bg-neutral-900/80 border border-white/10 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                            {dev.deviceType === 'mobile' ? (
                              <Smartphone className="w-4 h-4" />
                            ) : (
                              <Laptop className="w-4 h-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                              <span>{dev.name}</span>
                              {dev.isPlaying && (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              )}
                            </p>
                            <p className="text-[11px] text-neutral-400 truncate">
                              {dev.currentTrack
                                ? `${dev.currentTrack.title} — ${dev.currentTrack.artist}`
                                : '待機中'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => sendActionWithRefresh(dev, 'prev')}
                            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-200 cursor-pointer"
                            title="前の曲"
                          >
                            <SkipBack className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              sendActionWithRefresh(dev, dev.isPlaying ? 'pause' : 'play')
                            }
                            className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white cursor-pointer"
                            title={dev.isPlaying ? '一時停止' : '再生'}
                          >
                            {dev.isPlaying ? (
                              <Pause className="w-3.5 h-3.5 fill-current" />
                            ) : (
                              <Play className="w-3.5 h-3.5 fill-current" />
                            )}
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => sendActionWithRefresh(dev, 'next')}
                            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-200 cursor-pointer"
                            title="次の曲"
                          >
                            <SkipForward className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {dev.currentTrack && totalDur > 0 && (
                        <div className="space-y-1">
                          <div className="h-1 rounded-full bg-neutral-800 overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500">
                            <span>{formatSec(livePos)}</span>
                            <span>{formatSec(totalDur)}</span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-[11px] text-neutral-400">
                        <Volume2 className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        <input
                          type="range"
                          min={0}
                          max={100}
                          defaultValue={dev.volume ?? 100}
                          onChange={(e) =>
                            sendRemoteCommand({
                              targetDeviceId: dev.deviceId,
                              action: 'volume',
                              volume: Number(e.target.value),
                            })
                          }
                          className="w-full h-1 accent-emerald-500 bg-neutral-800 rounded-lg cursor-pointer"
                          aria-label={`${dev.name}の音量`}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleCastToDevice(dev)}
                          disabled={!currentTrack || isBusy}
                          className="py-1.5 px-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Cast className="w-3.5 h-3.5 text-sky-400" />
                          <span>この端末から送信</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePullFromDevice(dev)}
                          disabled={!dev.currentTrack || isBusy}
                          className="py-1.5 px-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <ArrowDownToLine className="w-3.5 h-3.5 text-emerald-400" />
                          <span>この端末に引継ぐ</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Audio Quality Switcher (including Lossless / Hi-Res) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-neutral-300">
              <span className="flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-red-400" />
                <span>ストリーミング音質</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setConnectModalOpen(false);
                  setDspModalOpen(true);
                }}
                className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
              >
                <Sliders className="w-3 h-3" />
                <span>DSPスタジオを開く</span>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'auto', label: '自動' },
                  { id: 'low', label: '節約' },
                  { id: 'normal', label: '標準' },
                  { id: 'high', label: '高音質' },
                  { id: 'lossless', label: 'ロスレス' },
                  { id: 'hires', label: 'ハイレゾ' },
                ] as const
              ).map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setAudioQuality(q.id)}
                  className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    audioQuality === q.id
                      ? 'bg-red-600 text-white border-red-400 shadow-md shadow-red-600/20'
                      : 'bg-neutral-900 text-neutral-300 border-white/10 hover:bg-neutral-800'
                  }`}
                >
                  {audioQuality === q.id && <Check className="w-3 h-3" />}
                  <span>{q.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Network Devices / Listen Party Jam */}
          <div className="space-y-2.5">
            {audioOutputs.length > 0 && (
              <div className="space-y-1.5">
                {audioOutputs.map((out) => (
                  <button
                    key={out.deviceId}
                    type="button"
                    onClick={() => {
                      setSelectedOutputLabel(out.label);
                      showToast(`オーディオ出力: ${out.label}`, 'info', 2000);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-2.5 text-xs font-semibold text-neutral-200 truncate">
                      <Speaker className="w-4 h-4 text-neutral-400 shrink-0" />
                      <span className="truncate">{out.label}</span>
                    </span>
                    {selectedOutputLabel === out.label && (
                      <Check className="w-4 h-4 text-red-500 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setConnectModalOpen(false);
                  setCompanionMode('watch');
                  setCompanionModalOpen(true);
                }}
                className="min-h-[48px] p-2.5 rounded-xl bg-sky-950/35 hover:bg-sky-950/60 border border-sky-500/30 flex flex-col items-center justify-center gap-1 text-center transition-colors cursor-pointer"
              >
                <Watch className="w-4 h-4 text-sky-400" />
                <span className="text-[11px] font-bold text-white">ウォッチUI</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setConnectModalOpen(false);
                  setCompanionMode('console');
                  setCompanionModalOpen(true);
                }}
                className="min-h-[48px] p-2.5 rounded-xl bg-indigo-950/35 hover:bg-indigo-950/60 border border-indigo-500/30 flex flex-col items-center justify-center gap-1 text-center transition-colors cursor-pointer"
              >
                <Gamepad2 className="w-4 h-4 text-indigo-400" />
                <span className="text-[11px] font-bold text-white">ゲーム機/TV UI</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setConnectModalOpen(false);
                  setCarModeOpen(true);
                }}
                className="min-h-[48px] p-2.5 rounded-xl bg-emerald-950/35 hover:bg-emerald-950/60 border border-emerald-500/30 flex flex-col items-center justify-center gap-1 text-center transition-colors cursor-pointer"
              >
                <Car className="w-4 h-4 text-emerald-400" />
                <span className="text-[11px] font-bold text-white">ドライブモード</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setConnectModalOpen(false);
                setFullScreenPlayerOpen(false);
                navigateTo('party');
              }}
              className="w-full p-3.5 rounded-2xl bg-neutral-900/80 hover:bg-neutral-800 border border-white/10 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-400 shrink-0">
                  <Radio className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white">Jam / リスニングパーティに参加</p>
                  <p className="text-[11px] text-neutral-400 truncate">
                    現在 {onlineCount}人がオンライン・友達と同時再生
                  </p>
                </div>
              </div>
              <Wifi className="w-4 h-4 text-red-400 shrink-0" />
            </button>
          </div>

          {/* Bluetooth Device Picker Button */}
          <button
            type="button"
            onClick={handleSelectAudioOutput}
            disabled={scanningBt}
            className="w-full py-3.5 px-4 rounded-2xl bg-[#222229] hover:bg-[#2a2a33] border border-white/10 flex flex-col items-center justify-center gap-1.5 text-center transition-colors cursor-pointer"
          >
            <Bluetooth className="w-5 h-5 text-white" />
            <span className="text-xs font-bold text-white">
              {scanningBt ? '出力デバイスを確認中...' : 'Bluetoothデバイス・出力先を探す'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
