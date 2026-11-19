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
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

export const ConnectDeviceModal: React.FC = () => {
  const {
    connectModalOpen,
    setConnectModalOpen,
    currentTrack,
    deviceMode,
    audioQuality,
    setAudioQuality,
    onlineCount,
    navigateTo,
    setFullScreenPlayerOpen,
    showToast,
  } = usePlayer();

  const [selectedOutputLabel, setSelectedOutputLabel] = useState<string>('');
  const [audioOutputs, setAudioOutputs] = useState<{ deviceId: string; label: string }[]>([]);
  const [scanningBt, setScanningBt] = useState(false);

  useEffect(() => {
    if (!connectModalOpen) return;
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
  }, [connectModalOpen]);

  if (!connectModalOpen) return null;

  const isMobile = deviceMode === 'mobile';
  const qualityLabel =
    audioQuality === 'high'
      ? '高音質'
      : audioQuality === 'normal'
      ? '標準音質'
      : audioQuality === 'low'
      ? '節約モード'
      : '自動';

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

  return (
    <div
      className="fixed inset-0 z-[75] bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150"
      onClick={() => setConnectModalOpen(false)}
    >
      <div
        className="w-full sm:max-w-md bg-[#16161b] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle (Mobile) */}
        <div className="pt-3 pb-1 flex justify-center sm:hidden">
          <div className="w-10 h-1 rounded-full bg-neutral-600" />
        </div>

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-white/5">
          <h3 className="text-lg font-black text-white tracking-tight">Connect</h3>
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
          <div className="p-4 rounded-2xl bg-[#222229] border border-red-500/35 flex items-center justify-between gap-3 shadow-lg">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-black text-white">
                  {selectedOutputLabel || (isMobile ? 'このスマホ' : 'このパソコン')}
                </span>
                <span className="px-2 py-0.5 rounded bg-neutral-700/80 text-[11px] font-bold text-neutral-200">
                  {qualityLabel}
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

          {/* Audio Quality Switcher */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-neutral-300">
              <span className="flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-red-400" />
                <span>ストリーミング音質</span>
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'auto', label: '自動' },
                  { id: 'low', label: '節約' },
                  { id: 'normal', label: '標準' },
                  { id: 'high', label: '高音質' },
                ] as const
              ).map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => {
                    setAudioQuality(q.id);
                    showToast(`音質を「${q.label}」に設定しました`, 'success', 1800);
                  }}
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
            <p className="text-xs font-bold text-neutral-400">
              ネットワーク・セッション連携
            </p>
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
