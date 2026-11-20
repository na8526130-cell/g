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
  Sliders,
  Download,
  User,
  FolderHeart,
  FileText,
  ChevronRight,
  HelpCircle,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

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
    backgroundPlaybackEnabled,
    toggleBackgroundPlayback,
    setBgGuideOpen,
    setEqModalOpen,
    openFreemakeModal,
    currentTrack,
    currentUser,
    setAccountModalOpen,
    hiddenTracks,
    blockedArtists,
    navigateTo,
    setTermsModalOpen,
    showToast,
  } = usePlayer();

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

            {/* Audio Quality */}
            <div className="p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-2.5">
              <div className="flex items-center gap-2.5">
                <Volume2 className="w-4 h-4 text-red-400 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-white">ストリーミング音質</p>
                  <p className="text-xs text-neutral-400">回線状況や好みに合わせて音質を選択</p>
                </div>
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
                      showToast(`音質を「${q.label}」に変更しました`, 'success', 1800);
                    }}
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

            {/* Crossfade */}
            <div className="p-3.5 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <AudioLines className="w-4 h-4 text-purple-400 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-white">クロスフェード</p>
                    <p className="text-xs text-neutral-400">曲の切り替えを滑らかにフェード</p>
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

            {/* Freemake Equalizer & Download */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => closeAndRun(() => setEqModalOpen(true))}
                className="p-3.5 rounded-xl bg-neutral-900/70 hover:bg-neutral-800/80 border border-neutral-800 flex items-center justify-between gap-2 transition-colors text-left cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Sliders className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">Freemake イコライザー</p>
                    <p className="text-[11px] text-neutral-400 truncate">10バンド音質補正</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-neutral-500 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => closeAndRun(() => openFreemakeModal(currentTrack))}
                className="p-3.5 rounded-xl bg-neutral-900/70 hover:bg-neutral-800/80 border border-neutral-800 flex items-center justify-between gap-2 transition-colors text-left cursor-pointer"
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
            </div>
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
