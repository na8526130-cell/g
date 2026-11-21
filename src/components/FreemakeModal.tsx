import React, { useEffect, useState, useRef } from 'react';
import {
  X,
  Download,
  Sliders,
  FileAudio,
  Sparkles,
  CheckCircle2,
  Loader2,
  Zap,
  Music,
  Film,
  HardDriveDownload,
  FolderDown,
  Settings2,
  ChevronDown,
  ChevronUp,
  UploadCloud,
  RotateCcw,
  Activity,
  AlertTriangle,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import {
  equalizer,
  EqualizerSettings,
  EQ_FREQUENCIES,
  EQ_PRESETS,
  EqPresetKey,
} from '../services/equalizer';
import {
  fetchFreemakeFormats,
  probeFreemakeTrack,
  downloadWithFreemake,
  convertLocalFileWithFreemake,
  loadFreemakeAdvancedConfig,
  saveFreemakeAdvancedConfig,
  subscribeFreemakeProgress,
  getFreemakeProgressState,
  FreemakeFormatId,
  FreemakeFormatOption,
  FreemakeProbeResponse,
  FreemakeProgressState,
} from '../services/freemake';
import { SpectrumVisualizer } from './SpectrumVisualizer';
import { SafeImage } from './SafeImage';

const DEFAULT_FORMATS: FreemakeFormatOption[] = [
  { id: 'mp3_320', label: 'MP3 最高音質 (320kbps)', ext: 'mp3', mimeType: 'audio/mpeg', isVideo: false, bitrateLabel: '320 kbps' },
  { id: 'mp3_192', label: 'MP3 標準高音質 (192kbps)', ext: 'mp3', mimeType: 'audio/mpeg', isVideo: false, bitrateLabel: '192 kbps' },
  { id: 'mp3_128', label: 'MP3 軽量 (128kbps)', ext: 'mp3', mimeType: 'audio/mpeg', isVideo: false, bitrateLabel: '128 kbps' },
  { id: 'm4a_256', label: 'M4A / AAC 高音質 (256kbps)', ext: 'm4a', mimeType: 'audio/mp4', isVideo: false, bitrateLabel: '256 kbps' },
  { id: 'flac', label: 'FLAC ロスレス (Lossless)', ext: 'flac', mimeType: 'audio/flac', isVideo: false, bitrateLabel: 'Lossless' },
  { id: 'wav', label: 'WAV 非圧縮 (16-bit PCM)', ext: 'wav', mimeType: 'audio/wav', isVideo: false, bitrateLabel: '1411 kbps' },
  { id: 'ogg', label: 'OGG Vorbis (高効率)', ext: 'ogg', mimeType: 'audio/ogg', isVideo: false, bitrateLabel: '~192 kbps' },
  { id: 'mp4', label: 'MP4 動画 / MV', ext: 'mp4', mimeType: 'video/mp4', isVideo: true, bitrateLabel: 'H.264 + AAC' },
];

export const FreemakeModal: React.FC = () => {
  const {
    freemakeModalOpen,
    setFreemakeModalOpen,
    freemakeTargetTrack,
    currentTrack,
    showToast,
    navigateTo,
    setLibraryTab,
  } = usePlayer();

  const targetTrack = freemakeTargetTrack || currentTrack;

  const [activeTab, setActiveTab] = useState<'download' | 'equalizer' | 'convert'>('download');
  const [formats, setFormats] = useState<FreemakeFormatOption[]>(DEFAULT_FORMATS);
  const [ffmpegVersion, setFfmpegVersion] = useState<string>('');
  const [selectedFormat, setSelectedFormat] = useState<FreemakeFormatId>('mp3_320');
  const [applyEqOnExport, setApplyEqOnExport] = useState<boolean>(true);
  const [customUrlInput, setCustomUrlInput] = useState<string>('');
  const [eqSettings, setEqSettings] = useState<EqualizerSettings>(equalizer.getSettings());

  const [probeInfo, setProbeInfo] = useState<FreemakeProbeResponse | null>(null);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [statusNotice, setStatusNotice] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [progressState, setProgressState] = useState<FreemakeProgressState>(getFreemakeProgressState);

  // Advanced YouTube Cookie / Cobalt config
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(false);
  const [advConfig, setAdvConfig] = useState(loadFreemakeAdvancedConfig);

  // Local file converter state
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [convertTitle, setConvertTitle] = useState<string>('');
  const [convertArtist, setConvertArtist] = useState<string>('');
  const [isConverting, setIsConverting] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return equalizer.subscribe((next) => setEqSettings(next));
  }, []);

  useEffect(() => {
    return subscribeFreemakeProgress((next) => setProgressState(next));
  }, []);

  useEffect(() => {
    if (!freemakeModalOpen) return;
    setStatusNotice(null);
    if (freemakeTargetTrack) {
      setActiveTab('download');
      setCustomUrlInput('');
    }
    fetchFreemakeFormats()
      .then((res) => {
        if (Array.isArray(res.formats) && res.formats.length > 0) {
          setFormats(res.formats);
        }
        if (res.ffmpegVersion) {
          setFfmpegVersion(res.ffmpegVersion);
        }
      })
      .catch(() => {});
  }, [freemakeModalOpen, freemakeTargetTrack?.id]);

  useEffect(() => {
    if (!freemakeModalOpen) return;
    const cleanUrl = customUrlInput.trim();
    const urlOrId = cleanUrl || targetTrack?.id || '';
    if (!urlOrId && !targetTrack?.title) {
      setProbeInfo(null);
      return;
    }
    const timer = setTimeout(() => {
      probeFreemakeTrack(
        cleanUrl
          ? { url: cleanUrl }
          : {
              videoId: targetTrack?.id,
              title: targetTrack?.title,
              artist: targetTrack?.artist,
              duration: targetTrack?.duration,
              durationSeconds: targetTrack?.durationSeconds,
            }
      )
        .then(setProbeInfo)
        .catch(() => setProbeInfo(null));
    }, 250);
    return () => clearTimeout(timer);
  }, [freemakeModalOpen, customUrlInput, targetTrack?.id, targetTrack?.title, targetTrack?.artist, targetTrack?.duration, targetTrack?.durationSeconds]);

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '';
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
  };

  const formatSec = (sec?: number) => {
    if (sec === undefined || sec < 0) return '';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  if (!freemakeModalOpen) {
    if (!progressState.active) return null;
    return (
      <button
        type="button"
        onClick={() => setFreemakeModalOpen(true)}
        className="fixed top-16 right-4 z-[60] flex items-center gap-3 px-3.5 py-2.5 rounded-2xl bg-[#0e1420]/95 hover:bg-[#141d2e] border border-sky-400/40 shadow-2xl backdrop-blur-md text-left transition-all cursor-pointer max-w-[260px]"
        title="クリックしてダウンロード進捗を開く"
      >
        <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-white">
            <span className="truncate">{progressState.title || 'ダウンロード中'}</span>
            <span className="text-sky-300 font-mono tabular-nums shrink-0">{progressState.percent}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-neutral-800 overflow-hidden mt-1">
            <div
              className="h-full bg-gradient-to-r from-sky-500 via-cyan-400 to-emerald-400 transition-all duration-200"
              style={{ width: `${progressState.percent}%` }}
            />
          </div>
        </div>
      </button>
    );
  }

  const busy = isDownloading || isConverting || progressState.active;
  const formatFreq = (freq: number) => (freq >= 1000 ? `${freq / 1000}k` : `${freq}`);

  const handleSaveAdvConfig = () => {
    saveFreemakeAdvancedConfig(advConfig);
    setStatusNotice({ type: 'success', text: 'Freemake 外部ソース設定（Cobalt / Cookie）を保存しました' });
  };

  const handleExecuteDownload = async (saveTarget: 'device' | 'offline' | 'both') => {
    const cleanUrl = customUrlInput.trim();
    if (!cleanUrl && !targetTrack) {
      setStatusNotice({ type: 'error', text: '再生中の楽曲を選ぶか、YouTube URLを入力してください' });
      return;
    }

    setIsDownloading(true);
    setStatusNotice({
      type: 'info',
      text: 'Freemake Engine (FFmpeg) で音声取得・EQ処理・エンコードを実行中...',
    });

    const effectiveTarget = saveTarget === 'device' ? 'both' : saveTarget;

    try {
      const res = await downloadWithFreemake({
        videoId: cleanUrl ? undefined : targetTrack?.id,
        url: cleanUrl || undefined,
        title: cleanUrl ? (probeInfo?.fullTrackTitle || '') : (targetTrack?.title || 'YouTube Audio'),
        artist: cleanUrl ? '' : (targetTrack?.artist || ''),
        album: cleanUrl ? '' : (targetTrack?.album || ''),
        thumbnail: cleanUrl ? undefined : targetTrack?.thumbnail,
        duration: cleanUrl ? undefined : targetTrack?.duration,
        durationSeconds: cleanUrl ? undefined : targetTrack?.durationSeconds,
        format: selectedFormat,
        applyEq: applyEqOnExport,
        saveTarget: effectiveTarget,
        allowPreviewFallback: true,
      });

      const eqMsg = res.eqApplied ? '（Freemake EQ適用済み）' : '';
      const kindMsg =
        res.sourceKind === 'official-preview-30s'
          ? '※フル尺音源が見つからなかったため公式30秒プレビュー版を保存しました'
          : `フル尺音源取得: ${res.sourceLabel}`;

      if (effectiveTarget === 'both') {
        showToast(
          `「${res.filename}」を端末に保存＆オフラインへ自動追加しました ${eqMsg}`,
          'success',
          4000,
          {
            label: 'オフラインを開く',
            onClick: () => {
              setFreemakeModalOpen(false);
              setLibraryTab('local');
              navigateTo('library');
            },
          }
        );
      } else {
        showToast(
          `「${res.filename}」をオフライン保存しました ${eqMsg}`,
          'success',
          3800
        );
      }

      setStatusNotice({
        type: 'success',
        text: `完了: ${res.filename} ${eqMsg}（オフラインライブラリに自動追加済み） — ${kindMsg}`,
      });
    } catch (err: any) {
      setStatusNotice({
        type: 'error',
        text: err?.message || 'ダウンロードに失敗しました',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleExecuteLocalConvert = async (saveTarget: 'device' | 'offline' | 'both') => {
    if (!pickedFile) {
      setStatusNotice({ type: 'error', text: '変換したいローカルファイルを選択してください' });
      return;
    }
    setIsConverting(true);
    setStatusNotice({
      type: 'info',
      text: 'Freemake FFmpeg 変換と10バンドEQ焼き込みを実行中...',
    });
    const effectiveTarget = saveTarget === 'device' ? 'both' : saveTarget;
    try {
      const res = await convertLocalFileWithFreemake({
        file: pickedFile,
        format: selectedFormat,
        applyEq: applyEqOnExport,
        title: convertTitle.trim() || undefined,
        artist: convertArtist.trim() || undefined,
        saveTarget: effectiveTarget,
      });
      setStatusNotice({
        type: 'success',
        text: `変換完了: ${res.filename}${res.eqApplied ? '（EQ焼き込み済み）' : ''} — オフラインライブラリに自動保存済み`,
      });
      showToast(`Freemake変換完了＆オフライン追加: ${res.filename}`, 'success', 3400);
    } catch (err: any) {
      setStatusNotice({ type: 'error', text: err?.message || 'ファイル変換に失敗しました' });
    } finally {
      setIsConverting(false);
    }
  };

  const selectedSpec = formats.find((f) => f.id === selectedFormat) || formats[0];
  const freemakePresets = (Object.keys(EQ_PRESETS) as EqPresetKey[]).filter(
    (k) => EQ_PRESETS[k].isFreemake
  );
  const standardPresets = (Object.keys(EQ_PRESETS) as EqPresetKey[]).filter(
    (k) => !EQ_PRESETS[k].isFreemake
  );

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-150"
      onClick={() => setFreemakeModalOpen(false)}
    >
      <div
        className="w-full max-w-3xl bg-[#0d0f14] border border-sky-500/25 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-white/10 bg-gradient-to-r from-[#0e1522] via-[#111520] to-[#17111a]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center shadow-lg shadow-sky-900/40 shrink-0">
              <HardDriveDownload className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-black text-white tracking-wide">
                  Freemake Studio
                </h2>
                <span className="px-2 py-0.5 rounded bg-sky-500/20 border border-sky-400/30 text-sky-300 text-[10px] font-bold">
                  FFmpeg 実変換エンジン搭載
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                高音質ダウンロード・MP3/FLAC/WAV/MP4変換・10バンドイコライザー焼き込み
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setFreemakeModalOpen(false)}
            className="p-2 text-neutral-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 px-5 pt-3 pb-2 border-b border-white/5 bg-[#101219]">
          <button
            type="button"
            onClick={() => setActiveTab('download')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'download'
                ? 'bg-sky-600 text-white shadow-md shadow-sky-900/40'
                : 'bg-neutral-900/70 text-neutral-400 hover:text-white'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>楽曲ダウンロード</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('equalizer')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'equalizer'
                ? 'bg-gradient-to-r from-red-600 to-amber-600 text-white shadow-md shadow-red-900/40'
                : 'bg-neutral-900/70 text-neutral-400 hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Freemake イコライザー</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('convert')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'convert'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40'
                : 'bg-neutral-900/70 text-neutral-400 hover:text-white'
            }`}
          >
            <FileAudio className="w-3.5 h-3.5" />
            <span>ローカル変換 + EQ</span>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Live Progress Panel */}
          {progressState.active && (
            <div className="p-4 rounded-2xl bg-gradient-to-br from-sky-950/60 via-[#0e1523] to-emerald-950/40 border border-sky-400/35 shadow-lg space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Loader2 className="w-4.5 h-4.5 text-sky-400 animate-spin shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {progressState.title}
                      <span className="ml-1.5 text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">
                        .{progressState.formatExt}
                      </span>
                    </div>
                    <p className="text-[11px] text-sky-200/90 truncate mt-0.5">
                      {progressState.message}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xl font-black text-white font-mono tabular-nums leading-none">
                    {progressState.percent}%
                  </div>
                  <div className="text-[10px] text-neutral-400 font-mono mt-1 tabular-nums">
                    {progressState.stage === 'converting' && progressState.processedSec !== undefined
                      ? `${formatSec(progressState.processedSec)}${
                          progressState.durationSec ? ` / ${formatSec(progressState.durationSec)}` : ''
                        }`
                      : progressState.receivedBytes
                      ? `${formatBytes(progressState.receivedBytes)}${
                          progressState.totalBytes ? ` / ${formatBytes(progressState.totalBytes)}` : ''
                        }`
                      : ''}
                  </div>
                </div>
              </div>

              <div className="w-full h-2.5 rounded-full bg-neutral-900/90 border border-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-500 via-cyan-400 to-emerald-400 transition-all duration-200"
                  style={{ width: `${Math.max(3, progressState.percent)}%` }}
                />
              </div>

              <div className="grid grid-cols-4 gap-1.5 text-[10px] font-semibold">
                {[
                  {
                    label: progressState.mode === 'convert' ? '1. アップロード' : '1. 音源照合',
                    done: !['idle', 'resolving', 'searching', 'uploading'].includes(progressState.stage),
                    current: ['resolving', 'searching', 'uploading'].includes(progressState.stage),
                  },
                  {
                    label: progressState.mode === 'convert' ? '2. サーバー受信' : '2. 音声取得',
                    done: ['converting', 'downloading', 'saving', 'done'].includes(progressState.stage),
                    current: progressState.stage === 'fetching',
                  },
                  {
                    label: '3. FFmpeg変換',
                    done: ['downloading', 'saving', 'done'].includes(progressState.stage),
                    current: progressState.stage === 'converting',
                  },
                  {
                    label: '4. 保存完了',
                    done: progressState.stage === 'done',
                    current: ['downloading', 'saving'].includes(progressState.stage),
                  },
                ].map((step) => (
                  <div
                    key={step.label}
                    className={`px-2 py-1 rounded-lg text-center truncate border ${
                      step.done
                        ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                        : step.current
                        ? 'bg-sky-500/25 border-sky-400/50 text-white'
                        : 'bg-neutral-900/60 border-white/5 text-neutral-500'
                    }`}
                  >
                    {step.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status Banner */}
          {statusNotice && !(progressState.active && statusNotice.type === 'info') && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                statusNotice.type === 'success'
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                  : statusNotice.type === 'error'
                  ? 'bg-rose-950/50 border-rose-500/40 text-rose-200'
                  : 'bg-sky-950/50 border-sky-500/40 text-sky-200'
              }`}
            >
              {statusNotice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : statusNotice.type === 'error' ? (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              ) : (
                <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed break-all">{statusNotice.text}</span>
            </div>
          )}

          {/* TAB 1: DOWNLOAD & SAVE */}
          {activeTab === 'download' && (
            <div className="space-y-5">
              {/* Target Track Card or URL Input */}
              <div className="p-4 rounded-2xl bg-neutral-900/70 border border-white/10 space-y-3">
                {targetTrack && !customUrlInput.trim() && (
                  <div className="flex items-center gap-3.5">
                    <SafeImage
                      src={targetTrack.thumbnail}
                      alt={targetTrack.title}
                      className="w-14 h-14 rounded-xl object-cover bg-neutral-800 shrink-0 shadow"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                        ダウンロード対象トラック
                      </span>
                      <h3 className="text-sm font-bold text-white truncate">{targetTrack.title}</h3>
                      <p className="text-xs text-neutral-400 truncate">
                        {targetTrack.artist}
                        {targetTrack.duration ? ` • ${targetTrack.duration}` : ''}
                      </p>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 mb-1.5">
                    YouTube URL / 動画ID（空欄なら現在選択中の曲を使用）
                  </label>
                  <input
                    type="text"
                    value={customUrlInput}
                    onChange={(e) => setCustomUrlInput(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=... または空欄"
                    className="w-full bg-neutral-950 border border-neutral-800 focus:border-sky-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none"
                  />
                </div>

                {probeInfo && (
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400 pt-1">
                    <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 font-mono">
                      FFmpeg: {ffmpegVersion ? '稼働中' : '待機中'}
                    </span>
                    {probeInfo.fullTrackAvailable && (
                      <span
                        className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-semibold truncate max-w-full"
                        title={probeInfo.fullTrackTitle || undefined}
                      >
                        {probeInfo.fullTrackSource || 'フル尺音源エンジン対応'}
                        {probeInfo.fullTrackTitle ? ` — ${probeInfo.fullTrackTitle}` : ''}
                      </span>
                    )}
                    {!probeInfo.fullTrackAvailable && probeInfo.officialPreviewAvailable && (
                      <span className="px-2 py-0.5 rounded bg-amber-950/60 border border-amber-600/30 text-amber-300">
                        {probeInfo.officialPreviewSource} (フォールバック待機)
                      </span>
                    )}
                    {(advConfig.cobaltApiUrl || advConfig.youtubeCookie || probeInfo.hasCobaltServer || probeInfo.hasServerCookie) && (
                      <span className="px-2 py-0.5 rounded bg-sky-950/60 border border-sky-500/30 text-sky-300">
                        YouTube直リンクルート有効
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Format Grid */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-neutral-200 flex items-center gap-1.5">
                    <Music className="w-3.5 h-3.5 text-sky-400" />
                    出力フォーマット選択
                  </span>
                  <span className="text-[11px] text-neutral-400 font-mono">
                    {selectedSpec.bitrateLabel}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {formats.map((fmt) => {
                    const active = selectedFormat === fmt.id;
                    return (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={() => setSelectedFormat(fmt.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          active
                            ? 'bg-sky-600/20 border-sky-400 text-white shadow-md shadow-sky-950/40'
                            : 'bg-neutral-900/60 border-white/5 text-neutral-300 hover:bg-neutral-800/80'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-black uppercase">.{fmt.ext}</span>
                          {fmt.isVideo ? (
                            <Film className="w-3.5 h-3.5 text-rose-400" />
                          ) : (
                            <Music className="w-3.5 h-3.5 text-sky-400" />
                          )}
                        </div>
                        <div className="text-[11px] font-semibold truncate mt-0.5">
                          {fmt.label.split(' ')[0]} {fmt.bitrateLabel}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Apply Freemake Equalizer Switch */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-red-950/30 via-neutral-900 to-amber-950/30 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                    <Sliders className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">
                        Freemake イコライザーを音声に焼き込んで保存
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono font-bold">
                        {EQ_PRESETS[eqSettings.preset]?.label.split(' ')[0] || 'Custom'}
                      </span>
                    </div>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      重低音 +{eqSettings.bassBoost}dB・10バンドEQ・ラウドネス補正をFFmpegで直接ファイルへ反映します
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveTab('equalizer')}
                    className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px] font-semibold cursor-pointer"
                  >
                    EQ調整
                  </button>
                  <button
                    type="button"
                    onClick={() => setApplyEqOnExport((v) => !v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                      applyEqOnExport
                        ? 'bg-amber-500 text-black'
                        : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    {applyEqOnExport ? '適用 ON' : '原音のまま'}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleExecuteDownload('device')}
                  className="py-3 px-4 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-sky-900/40 transition-all cursor-pointer"
                >
                  {busy ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>進行中 {progressState.active ? `${progressState.percent}%` : '...'}</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>ダウンロード (.{selectedSpec.ext.toUpperCase()} ＋ オフライン追加)</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleExecuteDownload('offline')}
                  title="端末ストレージにはダウンロードせず、アプリ内のオフラインライブラリのみに保存します"
                  className="py-3 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-white font-bold text-xs sm:text-sm border border-cyan-500/35 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <FolderDown className="w-4 h-4 text-cyan-400" />
                  <span>{busy ? `保存中 ${progressState.active ? `${progressState.percent}%` : ''}` : 'アプリ内オフラインのみ保存'}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-400">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setFreemakeModalOpen(false);
                      setLibraryTab('local');
                      navigateTo('library');
                    }}
                    className="text-cyan-400 hover:underline cursor-pointer"
                  >
                    オフライン一覧を開く →
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFreemakeModalOpen(false);
                      setLibraryTab('shared_offline');
                      navigateTo('library');
                    }}
                    className="text-emerald-400 hover:underline cursor-pointer"
                  >
                    共有オフラインを開く →
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((v) => !v)}
                  className="flex items-center gap-1 text-neutral-400 hover:text-white cursor-pointer"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  <span>フル尺YouTube取得設定 (Cobalt / Cookie)</span>
                  {advancedOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>

              {advancedOpen && (
                <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-3 text-xs">
                  <p className="text-[11px] text-neutral-400 leading-relaxed">
                    通常はフル尺音源エンジンが自動で1曲まるごと取得しますが、YouTube動画そのもののストリームを直接取得したい場合のみ Cobalt API URL または YouTube Cookie を設定してください。
                  </p>
                  <div>
                    <label className="block text-[11px] text-neutral-300 font-semibold mb-1">
                      Cobalt API エンドポイント URL (任意)
                    </label>
                    <input
                      type="text"
                      value={advConfig.cobaltApiUrl}
                      onChange={(e) => setAdvConfig({ ...advConfig, cobaltApiUrl: e.target.value })}
                      placeholder="https://your-cobalt-instance.example/"
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-neutral-300 font-semibold mb-1">
                      YouTube Cookie ヘッダー (任意)
                    </label>
                    <input
                      type="password"
                      value={advConfig.youtubeCookie}
                      onChange={(e) => setAdvConfig({ ...advConfig, youtubeCookie: e.target.value })}
                      placeholder="CONSENT=...; SAPISID=..."
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveAdvConfig}
                      className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs cursor-pointer"
                    >
                      設定を保存
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: FREEMAKE EQUALIZER */}
          {activeTab === 'equalizer' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-2xl bg-neutral-900/70 border border-white/10">
                <div>
                  <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-sky-400" />
                    Freemake Audio Engine DSP
                  </h3>
                  <p className="text-[11px] text-neutral-400">
                    オフライン再生のリアルタイム音質補正 ＆ ダウンロード時のFFmpegマスタリングに連動
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => equalizer.setFreemakeNormalize(!eqSettings.freemakeNormalize)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                      eqSettings.freemakeNormalize
                        ? 'bg-sky-600/25 border-sky-400 text-sky-200'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                    }`}
                  >
                    音量均一化: {eqSettings.freemakeNormalize ? 'ON' : 'OFF'}
                  </button>
                  <button
                    type="button"
                    onClick={() => equalizer.setEnabled(!eqSettings.enabled)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                      eqSettings.enabled ? 'bg-red-600 text-white' : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    {eqSettings.enabled ? 'EQ ON' : 'バイパス'}
                  </button>
                </div>
              </div>

              {/* Freemake Exclusive Presets */}
              <div>
                <p className="text-[11px] font-bold text-sky-300 mb-2">Freemake 専用サウンドプロファイル</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {freemakePresets.map((key) => {
                    const p = EQ_PRESETS[key];
                    const active = eqSettings.preset === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => equalizer.setPreset(key)}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          active
                            ? 'bg-gradient-to-r from-sky-600/80 to-blue-700/80 border-sky-400 text-white shadow'
                            : 'bg-neutral-900/70 border-white/5 text-neutral-300 hover:bg-neutral-800'
                        }`}
                      >
                        <div className="text-xs font-bold truncate">{p.label.replace('Freemake ', '')}</div>
                        <div className="text-[10px] text-neutral-300/80 truncate">Freemake DSP</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Standard Presets */}
              <div>
                <p className="text-[11px] font-bold text-neutral-400 mb-2">標準プリセット</p>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {standardPresets.map((key) => {
                    const p = EQ_PRESETS[key];
                    const active = eqSettings.preset === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => equalizer.setPreset(key)}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold truncate transition-all cursor-pointer ${
                          active
                            ? 'bg-red-600 border-red-400 text-white'
                            : 'bg-neutral-900/60 border-white/5 text-neutral-300 hover:bg-neutral-800'
                        }`}
                      >
                        {p.label.split(' ')[0]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Spectrum */}
              <div className="p-3 rounded-2xl bg-black/50 border border-white/5">
                <div className="flex items-center justify-between text-[10px] text-neutral-400 font-mono mb-1.5">
                  <span className="flex items-center gap-1">
                    <Activity className="w-3 h-3 text-sky-400" />
                    Freemake リアルタイムスペクトラム
                  </span>
                  <span>{EQ_PRESETS[eqSettings.preset]?.label}</span>
                </div>
                <SpectrumVisualizer height={48} barCount={44} mode="bars" />
              </div>

              {/* Bass Boost */}
              <div className="p-3.5 rounded-2xl bg-neutral-900/60 border border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <div>
                    <span className="text-xs font-bold text-white">重低音ブースト (65Hz Lowshelf)</span>
                    <span className="ml-2 text-xs font-mono text-amber-400 font-bold">
                      +{eqSettings.bassBoost} dB
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="12"
                  step="0.5"
                  value={eqSettings.bassBoost}
                  onChange={(e) => equalizer.setBassBoost(parseFloat(e.target.value))}
                  className="w-full sm:w-56 accent-amber-500 h-1.5 bg-neutral-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* 10-Band Sliders */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-neutral-300">10バンド・イコライザー (-12dB 〜 +12dB)</span>
                  <button
                    type="button"
                    onClick={() => equalizer.resetToFlat()}
                    className="text-[11px] text-neutral-400 hover:text-white flex items-center gap-1 px-2 py-1 rounded bg-neutral-900 border border-white/5 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>フラット</span>
                  </button>
                </div>
                <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 p-3 rounded-2xl bg-[#090b0f] border border-white/5">
                  {EQ_FREQUENCIES.map((freq, idx) => {
                    const gain = eqSettings.gains[idx] || 0;
                    return (
                      <div key={freq} className="flex flex-col items-center gap-1.5">
                        <span
                          className={`text-[10px] font-mono font-bold ${
                            gain > 0 ? 'text-red-400' : gain < 0 ? 'text-cyan-400' : 'text-neutral-500'
                          }`}
                        >
                          {gain > 0 ? `+${gain}` : gain}
                        </span>
                        <div className="relative h-36 flex items-center justify-center">
                          <div className="absolute top-1/2 left-0 right-0 h-px bg-white/15 pointer-events-none" />
                          <input
                            type="range"
                            min="-12"
                            max="12"
                            step="0.5"
                            value={gain}
                            onChange={(e) => equalizer.setBandGain(idx, parseFloat(e.target.value))}
                            onDoubleClick={() => equalizer.setBandGain(idx, 0)}
                            style={{ transform: 'rotate(-90deg)', width: '124px' }}
                            className="accent-sky-500 bg-neutral-800 rounded-lg cursor-pointer h-1.5"
                          />
                        </div>
                        <span className="text-[10px] font-mono text-neutral-300 font-semibold">
                          {formatFreq(freq)}Hz
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: LOCAL FILE CONVERTER + EQ */}
          {activeTab === 'convert' && (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,video/*,.mp3,.wav,.flac,.m4a,.aac,.ogg,.opus,.mp4,.webm,.mov"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setPickedFile(f);
                    setConvertTitle(f.name.replace(/\.[^.]+$/, ''));
                  }
                }}
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-neutral-700 hover:border-emerald-400 rounded-2xl p-6 text-center cursor-pointer bg-neutral-900/40 transition-colors"
              >
                <UploadCloud className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                {pickedFile ? (
                  <div>
                    <p className="text-sm font-bold text-white">{pickedFile.name}</p>
                    <p className="text-xs text-emerald-400 font-mono mt-1">
                      {(pickedFile.size / (1024 * 1024)).toFixed(2)} MB — クリックで別ファイルに変更
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-bold text-white">
                      端末内の音声・動画ファイルを選択 (MP3 / WAV / FLAC / M4A / MP4 / WEBM)
                    </p>
                    <p className="text-xs text-neutral-400 mt-1">
                      Freemake FFmpeg エンジンで高音質変換 ＋ 現在のEQカーブを直接焼き込みます
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 mb-1">曲名タグ</label>
                  <input
                    type="text"
                    value={convertTitle}
                    onChange={(e) => setConvertTitle(e.target.value)}
                    placeholder="タイトル"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-300 mb-1">アーティスト名タグ</label>
                  <input
                    type="text"
                    value={convertArtist}
                    onChange={(e) => setConvertArtist(e.target.value)}
                    placeholder="アーティスト名"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-neutral-300 mb-1.5">変換後のフォーマット</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {formats.map((fmt) => (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => setSelectedFormat(fmt.id)}
                      className={`p-2 rounded-xl border text-left text-xs cursor-pointer ${
                        selectedFormat === fmt.id
                          ? 'bg-emerald-600/20 border-emerald-400 text-white font-bold'
                          : 'bg-neutral-900/60 border-white/5 text-neutral-300'
                      }`}
                    >
                      .{fmt.ext.toUpperCase()} ({fmt.bitrateLabel})
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-900/70 border border-white/10 text-xs">
                <span>
                  Freemake EQ焼き込み ({EQ_PRESETS[eqSettings.preset]?.label.split(' ')[0]} / Bass +{eqSettings.bassBoost}dB)
                </span>
                <button
                  type="button"
                  onClick={() => setApplyEqOnExport((v) => !v)}
                  className={`px-3 py-1 rounded-lg font-bold cursor-pointer ${
                    applyEqOnExport ? 'bg-amber-500 text-black' : 'bg-neutral-800 text-neutral-400'
                  }`}
                >
                  {applyEqOnExport ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={busy || !pickedFile}
                  onClick={() => handleExecuteLocalConvert('device')}
                  className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>{busy && progressState.active ? `変換中 ${progressState.percent}%` : '変換して保存（＋オフライン自動追加）'}</span>
                </button>
                <button
                  type="button"
                  disabled={busy || !pickedFile}
                  onClick={() => handleExecuteLocalConvert('offline')}
                  className="py-3 px-4 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-white font-bold text-xs sm:text-sm border border-cyan-500/35 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <FolderDown className="w-4 h-4 text-cyan-400" />
                  <span>{busy && progressState.active ? `進行中 ${progressState.percent}%` : 'オフラインのみ保存'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
