import React, { useEffect, useRef } from 'react';
import {
  X,
  Sliders,
  Disc3,
  Mic2,
  Waves,
  Sparkles,
  Volume2,
  Activity,
  Radio,
  Check,
  Tv,
  RotateCcw,
  BarChart3,
  Gauge,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { audioDspEngine } from '../services/audioDspEngine';
import {
  AudioQualityMode,
  EQ_PRESETS,
  EqualizerBands,
  EqPresetId,
  SpatialAudioPreset,
} from '../types/music';

const QUALITY_OPTIONS: {
  id: AudioQualityMode;
  label: string;
  badge: string;
  desc: string;
}[] = [
  { id: 'auto', label: '自動', badge: 'Auto', desc: '回線・端末に応じて最適切替' },
  { id: 'low', label: 'データ節約', badge: '96kbps', desc: '低通信量で安定再生' },
  { id: 'normal', label: '標準', badge: '160kbps', desc: 'バランスの良い標準音質' },
  { id: 'high', label: '高音質', badge: '256kbps', desc: 'AAC/Opus 高解像ストリーミング' },
  { id: 'lossless', label: 'ロスレス', badge: 'CD 16/44.1', desc: '非圧縮PCM相当・Web Audio明瞭化' },
  { id: 'hires', label: 'ハイレゾ対応', badge: 'Hi-Res 24/96', desc: '空気感・低域拡張DSPマスタリング' },
];

const SPATIAL_OPTIONS: {
  id: SpatialAudioPreset;
  label: string;
  tag: string;
  desc: string;
}[] = [
  { id: 'off', label: 'ステレオ標準', tag: 'OFF', desc: '原曲のままのダイレクトな定位' },
  { id: 'studio', label: 'スタジオ立体', tag: 'Studio', desc: 'ボーカルの輪郭と程よい音響空間' },
  { id: 'cinema', label: 'Dolby Atmos風 3D', tag: 'Atmos 3D', desc: 'M/S音場拡張＋立体残響シミュレーション' },
  { id: 'concert', label: 'ライブアリーナ', tag: 'Concert', desc: '会場にいるような臨場感ある空間響き' },
];

const EQ_BAND_META: {
  key: keyof EqualizerBands;
  freq: string;
  name: string;
}[] = [
  { key: 'b60', freq: '60Hz', name: 'サブベース' },
  { key: 'b170', freq: '170Hz', name: '重低音' },
  { key: 'b450', freq: '450Hz', name: '中低域' },
  { key: 'b1200', freq: '1.2kHz', name: 'ボーカル帯' },
  { key: 'b3600', freq: '3.6kHz', name: 'プレゼンス' },
  { key: 'b10000', freq: '10kHz', name: 'エアー高音' },
];

const CROSSFADE_PRESETS = [0, 2, 4, 6, 8, 12];

export const AudioDspModal: React.FC = () => {
  const {
    dspModalOpen,
    setDspModalOpen,
    audioQuality,
    setAudioQuality,
    spatialAudio,
    setSpatialAudio,
    vocalLevel,
    setVocalLevel,
    crossfadeDuration,
    setCrossfadeDuration,
    djEqSweep,
    setDjEqSweep,
    eqPreset,
    eqBands,
    setEqPreset,
    setEqBandGain,
    resetEq,
    loudnessNormalize,
    setLoudnessNormalize,
    audioStreamMeta,
    shouldUseDirectDsp,
    isPlaying,
    playerMode,
    togglePlayerMode,
    currentTrack,
  } = usePlayer();

  const spectrumCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!dspModalOpen) return;
    const canvas = spectrumCanvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    let rafId = 0;
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const draw = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx2d.clearRect(0, 0, w, h);

      const barsCount = 32;
      const bars =
        isPlaying && audioStreamMeta?.usingDirectDsp
          ? audioDspEngine.getSpectrumBars(barsCount)
          : new Array(barsCount).fill(0);

      const gap = 3;
      const barW = Math.max(2, (w - gap * (barsCount - 1)) / barsCount);
      for (let i = 0; i < barsCount; i++) {
        const amp = Math.max(0.06, bars[i] || 0);
        const barH = Math.max(2, amp * (h - 4));
        const x = i * (barW + gap);
        const y = h - barH;

        const grad = ctx2d.createLinearGradient(0, y, 0, h);
        grad.addColorStop(0, '#f43f5e');
        grad.addColorStop(0.55, '#ef4444');
        grad.addColorStop(1, '#7f1d1d');
        ctx2d.fillStyle = amp > 0.08 ? grad : 'rgba(255,255,255,0.12)';
        ctx2d.beginPath();
        ctx2d.roundRect(x, y, barW, barH, 2);
        ctx2d.fill();
      }

      if (!prefersReducedMotion && isPlaying && audioStreamMeta?.usingDirectDsp) {
        rafId = requestAnimationFrame(draw);
      }
    };

    draw();
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [dspModalOpen, isPlaying, audioStreamMeta?.usingDirectDsp, eqBands, spatialAudio, vocalLevel]);

  if (!dspModalOpen) return null;

  const isSingActive = vocalLevel < 100;
  const hasEqOffset = Object.values(eqBands).some((v) => Math.abs(v) > 0.05);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
      onClick={() => setDspModalOpen(false)}
    >
      <div
        className="w-full max-w-2xl bg-[#0e0e13] border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-800/80 flex items-center justify-between bg-[#14141b]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-red-400">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                イコライザー・高音質DSP・Singスタジオ
              </h2>
              <p className="text-xs text-neutral-400">
                6バンドEQ / 音量均一化 / 空間オーディオ / カラオケ / DJクロスフェード
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDspModalOpen(false)}
            className="w-9 h-9 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Live Telemetry + Real-time FFT Spectrum Banner */}
          <div className="p-3.5 rounded-xl bg-[#14141d] border border-neutral-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Activity
                  className={`w-4 h-4 shrink-0 ${
                    audioStreamMeta?.usingDirectDsp ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white flex items-center gap-2 flex-wrap">
                    <span>
                      {audioStreamMeta?.usingDirectDsp
                        ? 'Web Audio DSP エンジン稼働中'
                        : playerMode === 'video'
                        ? 'MV動画モード再生中'
                        : shouldUseDirectDsp
                        ? 'ダイレクト高音質再生（待機）'
                        : 'YouTube Embed再生中'}
                    </span>
                    {audioStreamMeta && (
                      <span className="text-[11px] font-mono tabular-nums text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                        {audioStreamMeta.codec} ·{' '}
                        {Math.round((audioStreamMeta.sampleRateHz || 48000) / 100) / 10}kHz ·{' '}
                        {audioStreamMeta.bitrateKbps}kbps
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-0.5 truncate">
                    {currentTrack
                      ? `対象トラック: ${currentTrack.title} — ${currentTrack.artist}`
                      : '曲やポッドキャストを再生するとリアルタイムDSPが適用されます'}
                  </p>
                </div>
              </div>

              {playerMode === 'video' && currentTrack && (
                <button
                  type="button"
                  onClick={togglePlayerMode}
                  className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Tv className="w-3.5 h-3.5" />
                  <span>音声モードへ戻す</span>
                </button>
              )}
            </div>

            {!shouldUseDirectDsp && currentTrack && (
              <p className="text-[11px] text-amber-300/80 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5 leading-snug">
                ※ イコライザー・空間オーディオ・Sing減衰は共有オフライン・ローカル音源・オフライン保存済み曲の再生時にリアルタイム適用されます。
              </p>
            )}

            <div className="pt-1">
              <canvas
                ref={spectrumCanvasRef}
                width={520}
                height={42}
                className="w-full h-10 rounded-lg bg-black/40 border border-white/5"
              />
            </div>
          </div>

          {/* Section 0: 6-Band Graphic Equalizer + Loudness Normalization */}
          <section className="p-4 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-red-400" />
                  <span>6バンド グラフィックイコライザー</span>
                </h3>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  音域ごとに -12dB 〜 +12dB までリアルタイム調整（プリセット選択可）
                </p>
              </div>
              <button
                type="button"
                onClick={resetEq}
                disabled={!hasEqOffset && eqPreset === 'flat'}
                className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-xs font-semibold text-neutral-200 flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>リセット</span>
              </button>
            </div>

            {/* Preset Selector */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(EQ_PRESETS) as Exclude<EqPresetId, 'custom'>[]).map((pid) => {
                const preset = EQ_PRESETS[pid];
                const active = eqPreset === pid;
                return (
                  <button
                    key={pid}
                    type="button"
                    onClick={() => setEqPreset(pid)}
                    title={preset.desc}
                    className={`px-2.5 py-2 rounded-xl border text-left transition-colors cursor-pointer ${
                      active
                        ? 'bg-red-600/20 border-red-500/70 text-white'
                        : 'bg-neutral-950/60 border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:text-white'
                    }`}
                  >
                    <div className="text-xs font-bold truncate">{preset.label}</div>
                    <div className="text-[10px] text-neutral-400 truncate mt-0.5">{preset.desc}</div>
                  </button>
                );
              })}
            </div>

            {/* 6 Band Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {EQ_BAND_META.map((band) => {
                const val = eqBands[band.key] ?? 0;
                const formatted = val > 0 ? `+${val.toFixed(1)} dB` : `${val.toFixed(1)} dB`;
                return (
                  <div
                    key={band.key}
                    className="p-2.5 rounded-xl bg-black/35 border border-white/5 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-white">{band.freq}</span>
                        <span className="text-[11px] text-neutral-400">{band.name}</span>
                      </div>
                      <span
                        className={`font-mono tabular-nums text-xs font-bold ${
                          val > 0 ? 'text-red-400' : val < 0 ? 'text-sky-400' : 'text-neutral-400'
                        }`}
                      >
                        {formatted}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={0.5}
                      value={val}
                      onChange={(e) => setEqBandGain(band.key, Number(e.target.value))}
                      className="w-full accent-red-500 h-2 bg-neutral-800 rounded-lg cursor-pointer"
                      aria-label={`${band.freq} ${band.name}`}
                    />
                  </div>
                );
              })}
            </div>

            {/* Loudness Normalization Switch */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-neutral-800">
              <div>
                <p className="text-xs font-bold text-neutral-100 flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-amber-400" />
                  <span>音量均一化（ラウドネス補正）</span>
                </p>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  曲ごとの録音音量のバラつきを抑えて聴きやすい音量感に自動調整します
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLoudnessNormalize(!loudnessNormalize)}
                className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                  loudnessNormalize ? 'bg-red-500' : 'bg-neutral-700'
                }`}
                aria-label="音量均一化"
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    loudnessNormalize ? 'left-5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          </section>

          {/* Section 1: Lossless / Hi-Res Quality */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Disc3 className="w-4 h-4 text-sky-400" />
                <span>音質・ロスレス / ハイレゾ設定</span>
              </h3>
              {(audioQuality === 'lossless' || audioQuality === 'hires') && (
                <span className="text-[11px] font-bold text-sky-300 bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 rounded-md">
                  {audioQuality === 'hires' ? 'Hi-Res DSP Active' : 'Lossless Active'}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {QUALITY_OPTIONS.map((opt) => {
                const active = audioQuality === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setAudioQuality(opt.id)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      active
                        ? 'bg-sky-500/15 border-sky-400/60 ring-1 ring-sky-400/40'
                        : 'bg-neutral-900/70 border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-white">{opt.label}</span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          active ? 'bg-sky-500 text-white font-bold' : 'bg-neutral-800 text-neutral-300'
                        }`}
                      >
                        {opt.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-400 mt-1.5 leading-snug">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Section 2: Spatial Audio (Dolby Atmos-style) */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Waves className="w-4 h-4 text-purple-400" />
                <span>空間オーディオ（立体音響）</span>
              </h3>
              {spatialAudio !== 'off' && (
                <span className="text-[11px] font-bold text-purple-300 bg-purple-500/15 border border-purple-500/30 px-2 py-0.5 rounded-md">
                  Dolby Atmos風 立体音響 ON
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {SPATIAL_OPTIONS.map((opt) => {
                const active = spatialAudio === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSpatialAudio(opt.id)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start justify-between gap-3 ${
                      active
                        ? 'bg-purple-500/15 border-purple-400/60 ring-1 ring-purple-400/30'
                        : 'bg-neutral-900/70 border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <span>{opt.label}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-purple-300">
                          {opt.tag}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-1">{opt.desc}</p>
                    </div>
                    {active && <Check className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Section 3: Apple Music Sing / Karaoke Vocal Attenuation */}
          <section className="p-4 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Mic2 className="w-4 h-4 text-rose-400" />
                  <span>ボーカル音量調整（カラオケ / Sing機能）</span>
                </h3>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  中央定位のボーカル帯域（240Hz〜4.2kHz）をリアルタイム減衰し、伴奏を残します
                </p>
              </div>
              <span
                className={`text-sm font-mono tabular-nums font-extrabold px-2.5 py-1 rounded-lg ${
                  isSingActive
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    : 'bg-neutral-800 text-neutral-200'
                }`}
              >
                {vocalLevel}%
              </span>
            </div>

            <div className="flex items-center gap-3">
              <Volume2 className="w-4 h-4 text-neutral-500 shrink-0" />
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={vocalLevel}
                onChange={(e) => setVocalLevel(Number(e.target.value))}
                className="w-full accent-rose-500 cursor-pointer h-2 bg-neutral-800 rounded-lg"
                aria-label="ボーカル音量"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setVocalLevel(100)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                  vocalLevel === 100
                    ? 'bg-white text-black border-white'
                    : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700'
                }`}
              >
                原曲 (100%)
              </button>
              <button
                type="button"
                onClick={() => setVocalLevel(35)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                  vocalLevel === 35
                    ? 'bg-rose-500 text-white border-rose-400'
                    : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700'
                }`}
              >
                ガイド控えめ (35%)
              </button>
              <button
                type="button"
                onClick={() => setVocalLevel(0)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                  vocalLevel === 0
                    ? 'bg-rose-600 text-white border-rose-500'
                    : 'bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700'
                }`}
              >
                オフボーカル / カラオケ (0%)
              </button>
            </div>
          </section>

          {/* Section 4: Dual-Deck DJ Crossfade & EQ Sweep */}
          <section className="p-4 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Radio className="w-4 h-4 text-emerald-400" />
                  <span>DJ風クロスフェード（デュアルデッキ・リアルタイムミックス）</span>
                </h3>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  前の曲と次の曲を同時に再生して滑らかにオーバーラップ遷移させます
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums font-bold px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                {crossfadeDuration === 0 ? 'OFF' : `${crossfadeDuration}秒`}
              </span>
            </div>

            <div className="grid grid-cols-6 gap-2">
              {CROSSFADE_PRESETS.map((sec) => {
                const active = crossfadeDuration === sec;
                return (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setCrossfadeDuration(sec)}
                    className={`py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                      active
                        ? 'bg-emerald-600 border-emerald-500 text-white'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                    }`}
                  >
                    {sec === 0 ? 'OFF' : `${sec}s`}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-neutral-800">
              <div>
                <p className="text-xs font-bold text-neutral-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>DJ ハイパスEQスイープ遷移</span>
                </p>
                <p className="text-[11px] text-neutral-500">
                  曲の切り替わり時に前曲の低音を滑らかにカットして次の曲のビートを際立たせます
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDjEqSweep((v) => !v)}
                className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 ${
                  djEqSweep ? 'bg-emerald-500' : 'bg-neutral-700'
                }`}
                aria-label="DJハイパスEQスイープ"
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    djEqSweep ? 'left-5' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
