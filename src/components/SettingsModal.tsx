import React, { useEffect } from 'react';
import {
  X,
  Settings,
  Smartphone,
  Monitor,
  MessageSquare,
  Subtitles,
  Film,
  MessageCircle,
  Volume2,
  AudioLines,
  Radio,
  Download,
  User,
  FolderHeart,
  FileText,
  ChevronRight,
  HelpCircle,
  Sliders,
  Globe,
  Music2,
  Disc3,
  Car,
  Watch,
  Award,
  HardDrive,
  Play,
  Sparkles,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { CatalogRegion } from '../types/music';
import {
  isStartupSplashEnabled,
  setStartupSplashEnabled,
  triggerStartupSplashReplay,
} from './StartupSplash';
import { UserBackupJsonPanel } from './UserBackupJsonPanel';

export const SettingsModal: React.FC = () => {
  const {
    settingsModalOpen,
    setSettingsModalOpen,
    deviceMode,
    setDeviceMode,
    dmUiVisible,
    toggleDmUiVisible,
    floatingLyricsOverlay,
    setFloatingLyricsOverlay,
    canvasEnabled,
    setCanvasEnabled,
    danmakuEnabled,
    setDanmakuEnabled,
    audioQuality,
    setAudioQuality,
    crossfadeDuration,
    setCrossfadeDuration,
    djEqSweep,
    setDjEqSweep,
    setDspModalOpen,
    backgroundPlaybackEnabled,
    toggleBackgroundPlayback,
    setBgGuideOpen,
    openFreemakeModal,
    currentTrack,
    currentUser,
    setAccountModalOpen,
    hiddenTracks,
    blockedArtists,
    navigateTo,
    setTermsModalOpen,
    showToast,
    catalogRegion,
    setCatalogRegion,
    setClassicalModalOpen,
    setDjMixerOpen,
    setCarModeOpen,
    setCompanionModalOpen,
    setCompanionMode,
    setWrappedModalOpen,
    offlinePreferCache,
    setOfflinePreferCache,
    cachedOfflineIds,
    setLibraryTab,
  } = usePlayer();

  const [splashEnabled, setSplashEnabled] = React.useState<boolean>(() => isStartupSplashEnabled());

  useEffect(() => {
    if (!settingsModalOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsModalOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [settingsModalOpen, setSettingsModalOpen]);

  if (!settingsModalOpen) return null;

  const isPC = deviceMode === 'pc';

  const closeAndRun = (fn: () => void) => {
    setSettingsModalOpen(false);
    fn();
  };

  return (
    <div
      className="fixed inset-0 z-[75] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150"
      onClick={() => setSettingsModalOpen(false)}
    >
      <div
        className="w-full sm:max-w-lg bg-[#111116] border-t sm:border border-neutral-800 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
      >
        {/* Drag Handle (Mobile) */}
        <div className="pt-3 pb-1 flex justify-center sm:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-neutral-700" />
        </div>

        {/* Header */}
        <div className="px-5 sm:px-6 py-4 flex items-center justify-between border-b border-neutral-800/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center text-white">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 id="settings-modal-title" className="text-lg font-black text-white tracking-tight">
                設定
              </h2>
              <p className="text-xs text-neutral-400">表示・再生・音質・アカウント</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSettingsModalOpen(false)}
            className="p-2 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 sm:p-6 space-y-6 overflow-y-auto">
          {/* Section 1: 表示・インターフェース */}
          <section className="space-y-2.5">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 px-1">
              表示・インターフェース
            </h3>

            {/* Layout Mode (スマホ版 / パソコン版) */}
            <div className="p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {isPC ? (
                    <Monitor className="w-4 h-4 text-red-400 shrink-0" />
                  ) : (
                    <Smartphone className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-bold text-white">画面レイアウト</p>
                    <p className="text-xs text-neutral-400">スマホ向け・PC向けの表示を切り替え</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDeviceMode('mobile')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    !isPC
                      ? 'bg-red-600 text-white border-red-400 shadow-sm shadow-red-600/30'
                      : 'bg-neutral-950/60 text-neutral-300 border-neutral-800 hover:bg-neutral-800'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>スマホ版</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeviceMode('pc')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    isPC
                      ? 'bg-red-600 text-white border-red-400 shadow-sm shadow-red-600/30'
                      : 'bg-neutral-950/60 text-neutral-300 border-neutral-800 hover:bg-neutral-800'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  <span>パソコン版</span>
                </button>
              </div>
            </div>

            {/* Startup Splash Toggle & Preview */}
            <div className="p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Sparkles className="w-4 h-4 text-red-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white">起動画面（スプラッシュ演出）</p>
                    <p className="text-xs text-neutral-400 truncate">
                      アプリ起動時にロゴ＆サウンドウェーブ演出を表示
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={splashEnabled}
                  onClick={() => {
                    const next = !splashEnabled;
                    setSplashEnabled(next);
                    setStartupSplashEnabled(next);
                  }}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${
                    splashEnabled ? 'bg-red-600' : 'bg-neutral-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      splashEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <button
                type="button"
                onClick={() => closeAndRun(() => triggerStartupSplashReplay())}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400 hover:text-red-300 transition-colors cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>起動画面を今すぐプレビュー再生</span>
              </button>
            </div>

            {/* DM UI Toggle */}
            <div className="p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <MessageSquare className="w-4 h-4 text-cyan-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">DM（ダイレクトメッセージ）UI</p>
                  <p className="text-xs text-neutral-400 truncate">
                    ナビバー・通知内のDMボタンを表示
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={dmUiVisible}
                onClick={toggleDmUiVisible}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${
                  dmUiVisible ? 'bg-cyan-500' : 'bg-neutral-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    dmUiVisible ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Floating Lyrics Overlay */}
            <div className="p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Subtitles className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">フローティング歌詞</p>
                  <p className="text-xs text-neutral-400 truncate">
                    画面移動中もシンク歌詞をオーバーレイ表示
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={floatingLyricsOverlay}
                onClick={() => setFloatingLyricsOverlay((prev) => !prev)}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${
                  floatingLyricsOverlay ? 'bg-red-600' : 'bg-neutral-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    floatingLyricsOverlay ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Canvas MV Background */}
            <div className="p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Film className="w-4 h-4 text-rose-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">背景MV Canvas演出</p>
                  <p className="text-xs text-neutral-400 truncate">
                    再生画面の背後に14秒サビMVループを表示
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={canvasEnabled}
                onClick={() => setCanvasEnabled((prev) => !prev)}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${
                  canvasEnabled ? 'bg-red-600' : 'bg-neutral-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    canvasEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Danmaku */}
            <div className="p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white">コメント弾幕</p>
                  <p className="text-xs text-neutral-400 truncate">
                    楽曲のタイムスタンプコメントを画面に流す
                  </p>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={danmakuEnabled}
                onClick={() => setDanmakuEnabled((prev) => !prev)}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${
                  danmakuEnabled ? 'bg-red-600' : 'bg-neutral-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    danmakuEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </section>

          {/* Section 2: オーディオ・再生・Freemake */}
          <section className="space-y-2.5">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 px-1">
              再生・音質・Freemake
            </h3>

            {/* Audio Quality (including Lossless & Hi-Res) */}
            <div className="p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <Volume2 className="w-4 h-4 text-red-400 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-white">ストリーミング音質・ロスレス</p>
                    <p className="text-xs text-neutral-400">CD音質ロスレス / ハイレゾ対応DSPを選択可能</p>
                  </div>
                </div>
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
                    className={`py-2 px-2 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      audioQuality === q.id
                        ? 'bg-red-600 text-white border-red-400 shadow-sm shadow-red-600/20'
                        : 'bg-neutral-950/60 text-neutral-300 border-neutral-800 hover:bg-neutral-800'
                    }`}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>

            {/* DSP Studio Quick Launcher */}
            <button
              type="button"
              onClick={() => closeAndRun(() => setDspModalOpen(true))}
              className="w-full p-3.5 rounded-xl bg-gradient-to-r from-sky-950/40 to-purple-950/30 hover:from-sky-950/60 hover:to-purple-950/50 border border-sky-500/30 flex items-center justify-between gap-2 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Sliders className="w-4 h-4 text-sky-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">
                    空間オーディオ・カラオケ（Sing）DSPスタジオ
                  </p>
                  <p className="text-[11px] text-neutral-400 truncate">
                    立体音響プリセット・ボーカル音量調整・DJクロスフェード設定
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
            </button>

            {/* Crossfade & DJ EQ Sweep */}
            <div className="p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <AudioLines className="w-4 h-4 text-purple-400 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-white">DJ風クロスフェード</p>
                    <p className="text-xs text-neutral-400">曲のつなぎ目をデュアルデッキでオーバーラップ</p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-purple-300">
                  {crossfadeDuration === 0 ? 'OFF' : `${crossfadeDuration}秒`}
                </span>
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {[0, 2, 4, 6, 8, 12].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setCrossfadeDuration(sec)}
                    className={`py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                      crossfadeDuration === sec
                        ? 'bg-purple-600 text-white border-purple-400'
                        : 'bg-neutral-950/60 text-neutral-300 border-neutral-800 hover:bg-neutral-800'
                    }`}
                  >
                    {sec === 0 ? 'OFF' : `${sec}s`}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-neutral-800/80">
                <span className="text-xs font-semibold text-neutral-300">
                  DJ ハイパスEQスイープ遷移
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={djEqSweep}
                  onClick={() => setDjEqSweep((v) => !v)}
                  className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
                    djEqSweep ? 'bg-purple-500' : 'bg-neutral-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                      djEqSweep ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Background Playback */}
            <div className="p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Radio className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white">バックグラウンド再生強化</p>
                    <p className="text-xs text-neutral-400 truncate">
                      画面消灯や別アプリ切り替え時の再生を維持
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={backgroundPlaybackEnabled}
                  onClick={toggleBackgroundPlayback}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${
                    backgroundPlaybackEnabled ? 'bg-emerald-500' : 'bg-neutral-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      backgroundPlaybackEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <button
                type="button"
                onClick={() => closeAndRun(() => setBgGuideOpen(true))}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-300 hover:text-white transition-colors cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5 text-neutral-400" />
                <span>バックグラウンド再生の安定化ガイドを開く</span>
              </button>
            </div>

            {/* Offline Prefer Cache & Storage Link */}
            <div className="p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <HardDrive className="w-4 h-4 text-cyan-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white">保存済み曲はオフラインキャッシュ優先</p>
                    <p className="text-xs text-neutral-400 truncate">
                      オンライン時も端末内の保存音源から高速再生（通信量節約）
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={offlinePreferCache}
                  onClick={() => setOfflinePreferCache(!offlinePreferCache)}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${
                    offlinePreferCache ? 'bg-cyan-500' : 'bg-neutral-700'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      offlinePreferCache ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <button
                type="button"
                onClick={() =>
                  closeAndRun(() => {
                    setLibraryTab('local');
                    navigateTo('library');
                  })
                }
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 hover:text-cyan-200 transition-colors cursor-pointer"
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>オフラインストレージ管理を開く（保存済み配信曲 {cachedOfflineIds.size}曲）</span>
              </button>
            </div>

            {/* Overseas / Regional Catalog Selector */}
            <div className="p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Globe className="w-4 h-4 text-sky-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white">海外・地域カタログ (サービス対象外地域対応)</p>
                    <p className="text-xs text-neutral-400 truncate">
                      Explore / 検索 / クラシックの取得地域を切り替え
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-mono font-bold text-sky-300 shrink-0">
                  {catalogRegion}
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {(
                  [
                    { id: 'JP', label: '🇯🇵 日本' },
                    { id: 'US', label: '🇺🇸 米国' },
                    { id: 'KR', label: '🇰🇷 韓国' },
                    { id: 'GB', label: '🇬🇧 英国' },
                    { id: 'GLOBAL', label: '🌐 世界' },
                  ] as { id: CatalogRegion; label: string }[]
                ).map((reg) => (
                  <button
                    key={reg.id}
                    type="button"
                    onClick={() => {
                      setCatalogRegion(reg.id);
                      showToast(`カタログ地域を ${reg.label} に切り替えました`, 'info', 2000);
                    }}
                    className={`py-2 px-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer truncate ${
                      catalogRegion === reg.id
                        ? 'bg-sky-600 text-white border-sky-400'
                        : 'bg-neutral-950/60 text-neutral-300 border-neutral-800 hover:bg-neutral-800'
                    }`}
                  >
                    {reg.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Freemake Download & Converter */}
            <button
              type="button"
              onClick={() => closeAndRun(() => openFreemakeModal(currentTrack))}
              className="w-full p-3.5 rounded-xl bg-neutral-900/70 hover:bg-neutral-800/80 border border-neutral-800 flex items-center justify-between gap-2 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Download className="w-4 h-4 text-sky-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">Freemake 保存・変換</p>
                  <p className="text-[11px] text-neutral-400 truncate">MP3 / M4A / FLAC / MP4</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-neutral-500 shrink-0" />
            </button>
          </section>

          {/* Section 2.5: 専門館・DJ・車載・コンパニオン・振り返り */}
          <section className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 px-1">
              専門館・コンパニオン・振り返り
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => closeAndRun(() => setClassicalModalOpen(true))}
                className="p-3 rounded-xl bg-amber-950/25 hover:bg-amber-950/45 border border-amber-500/25 flex items-center gap-2.5 text-left transition-colors cursor-pointer"
              >
                <Music2 className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">Zero Classical 専門館</p>
                  <p className="text-[10px] text-neutral-400 truncate">作曲家・時代・作品番号</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => closeAndRun(() => setDjMixerOpen(true))}
                className="p-3 rounded-xl bg-purple-950/25 hover:bg-purple-950/45 border border-purple-500/25 flex items-center gap-2.5 text-left transition-colors cursor-pointer"
              >
                <Disc3 className="w-4 h-4 text-purple-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">DJ ミキサー & ソフト連携</p>
                  <p className="text-[10px] text-neutral-400 truncate">2デッキ & M3U8/CUE 出力</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => closeAndRun(() => setCarModeOpen(true))}
                className="p-3 rounded-xl bg-emerald-950/25 hover:bg-emerald-950/45 border border-emerald-500/25 flex items-center gap-2.5 text-left transition-colors cursor-pointer"
              >
                <Car className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">車載ドライブモード</p>
                  <p className="text-[10px] text-neutral-400 truncate">CarPlay / Android Auto風UI</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  closeAndRun(() => {
                    setCompanionMode('watch');
                    setCompanionModalOpen(true);
                  })
                }
                className="p-3 rounded-xl bg-sky-950/25 hover:bg-sky-950/45 border border-sky-500/25 flex items-center gap-2.5 text-left transition-colors cursor-pointer"
              >
                <Watch className="w-4 h-4 text-sky-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">Watch / ゲーム機コンパニオン</p>
                  <p className="text-[10px] text-neutral-400 truncate">ウォッチ & PS5/Xbox/TV 操作</p>
                </div>
              </button>
            </div>

            <button
              type="button"
              onClick={() => closeAndRun(() => setWrappedModalOpen(true))}
              className="w-full p-3.5 rounded-xl bg-gradient-to-r from-red-950/35 to-amber-950/25 hover:from-red-950/55 hover:to-amber-950/45 border border-red-500/30 flex items-center justify-between gap-2 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Award className="w-4 h-4 text-red-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">年間・季節・月別 Recap (Wrapped)</p>
                  <p className="text-[11px] text-neutral-400 truncate">再生時間・トップアーティストを振り返り</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
            </button>
          </section>

          {/* Section 3: アカウント・データ・規約 */}
          <section className="space-y-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-400 px-1">
              アカウント・ライブラリ管理
            </h3>

            <button
              type="button"
              onClick={() => closeAndRun(() => setAccountModalOpen(true))}
              className="w-full p-3.5 rounded-xl bg-neutral-900/70 hover:bg-neutral-800/80 border border-neutral-800 flex items-center justify-between gap-3 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <User className="w-4 h-4 text-red-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">
                    {currentUser ? `アカウント (${currentUser.username})` : 'アカウント・クラウド同期'}
                  </p>
                  <p className="text-xs text-neutral-400 truncate">
                    {currentUser
                      ? 'ログイン中・端末間データ同期とプロフィール設定'
                      : 'ログイン / 新規登録でスマホ・PC間のデータを同期'}
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-neutral-500 shrink-0" />
            </button>

            <button
              type="button"
              onClick={() => closeAndRun(() => navigateTo('library'))}
              className="w-full p-3.5 rounded-xl bg-neutral-900/70 hover:bg-neutral-800/80 border border-neutral-800 flex items-center justify-between gap-3 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <FolderHeart className="w-4 h-4 text-neutral-300 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">マイライブラリ・非表示管理</p>
                  <p className="text-xs text-neutral-400 truncate">
                    非表示の曲 {hiddenTracks.length}件 / ブロック中のアーティスト {blockedArtists.length}組
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-neutral-500 shrink-0" />
            </button>

            <UserBackupJsonPanel />

            <button
              type="button"
              onClick={() => closeAndRun(() => setTermsModalOpen(true))}
              className="w-full p-3.5 rounded-xl bg-neutral-900/70 hover:bg-neutral-800/80 border border-neutral-800 flex items-center justify-between gap-3 transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText className="w-4 h-4 text-neutral-400 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">利用規約・プライバシーポリシー</p>
                  <p className="text-xs text-neutral-400 truncate">サービスの利用条件と規約を確認</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-neutral-500 shrink-0" />
            </button>
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3.5 border-t border-neutral-800/80 bg-[#0d0d11] flex justify-end shrink-0">
          <button
            type="button"
            onClick={() => setSettingsModalOpen(false)}
            className="px-5 py-2 rounded-xl bg-white text-black hover:bg-neutral-200 text-xs font-bold transition-colors cursor-pointer"
          >
            完了
          </button>
        </div>
      </div>
    </div>
  );
};
