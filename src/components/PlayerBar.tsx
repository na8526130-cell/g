import React, { useState, useEffect, useRef } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { SafeImage } from './SafeImage';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Heart,
  ListMusic,
  FileText,
  Tv,
  Music,
  ShieldCheck,
  Sun,
  HelpCircle,
  Radio,
  Sparkles,
  ListPlus,
  Share2,
  AppWindow,
  MessageSquare,
  Maximize2,
  Gauge,
  Zap,
  Info,
  MonitorSpeaker,
  Download,
  MoreHorizontal,
  X,
} from 'lucide-react';

function formatSeconds(secs: number): string {
  if (isNaN(secs) || secs < 0) return '0:00';
  const total = Math.floor(secs);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

export const PlayerBar: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    togglePlay,
    progress,
    duration,
    seekTo,
    nextTrack,
    prevTrack,
    volume,
    setVolume,
    isMuted,
    toggleMute,
    repeatMode,
    cycleRepeat,
    shuffleMode,
    cycleShuffleMode,
    playbackRate,
    setPlaybackRate,
    playerMode,
    setPlayerMode,
    setVideoLayout,
    lyricsOpen,
    setLyricsOpen,
    queueOpen,
    setQueueOpen,
    likedTrackIds,
    toggleLikeTrack,
    navigateTo,
    queue,
    queueIndex,
    backgroundPlaybackEnabled,
    toggleBackgroundPlayback,
    wakeLockActive,
    toggleWakeLock,
    setBgGuideOpen,
    crossfadeDuration,
    setCrossfadeDuration,
    endlessRadioActive,
    toggleEndlessRadio,
    emotionRadioMood,
    startRadioForTrack,
    digestMode,
    toggleDigestMode,
    digestRemainingSec,
    trackTimestamps,
    openAddToPlaylistModal,
    openShareModal,
    floatingPlayerVisible,
    setFloatingPlayerVisible,
    setFloatingPlayerCollapsed,
    commentsModalOpen,
    setCommentsModalOpen,
    setStoryModalOpen,
    openVisualShareCard,
    setConnectModalOpen,
    setFullScreenPlayerOpen,
    deviceMode,
    openTrackDetailModal,
    openFreemakeModal,
  } = usePlayer();

  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  const [isHoveringProgress, setIsHoveringProgress] = useState(false);
  const [hoverPositionSec, setHoverPositionSec] = useState(0);

  useEffect(() => {
    if (!toolsMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setToolsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [toolsMenuOpen]);

  if (!currentTrack) {
    return null;
  }

  const isLiked = likedTrackIds.has(currentTrack.id);
  const percent = duration > 0 ? Math.min(100, Math.max(0, (progress / duration) * 100)) : 0;
  const upcomingCount = Math.max(0, queue.length - 1 - queueIndex);
  const upNextTrack = queue[queueIndex + 1];

  const hasActiveToolMode =
    backgroundPlaybackEnabled ||
    digestMode ||
    endlessRadioActive ||
    crossfadeDuration > 0 ||
    playbackRate !== 1 ||
    wakeLockActive;

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(pos * duration);
  };

  const handleProgressMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverPositionSec(pos * duration);
  };

  const isMobileMode = deviceMode === 'mobile';

  return (
    <>
      {/* MOBILE MINI-PLAYER (Spotify-style floating card docked above BottomTabBar) */}
      {isMobileMode && (
        <div
          onClick={() => setFullScreenPlayerOpen(true)}
          className="fixed bottom-[64px] left-1/2 -translate-x-1/2 w-[calc(100%-16px)] max-w-lg z-40 bg-[#231215]/95 backdrop-blur-xl border border-white/10 rounded-lg px-2.5 py-2 shadow-2xl flex items-center justify-between gap-2.5 cursor-pointer active:scale-[0.99] transition-transform overflow-hidden"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <SafeImage
              src={currentTrack.thumbnail}
              alt={currentTrack.title}
              useBase64
              className="w-10 h-10 rounded object-cover bg-neutral-800 shrink-0 shadow"
            />
            <div className="min-w-0 flex-1">
              <h4 className="text-[13px] font-bold text-white truncate leading-tight">
                {currentTrack.title}
              </h4>
              <p className="text-[11px] text-neutral-300 truncate leading-tight mt-0.5">
                {currentTrack.artist}
              </p>
            </div>
          </div>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConnectModalOpen(true);
              }}
              className="min-w-[36px] min-h-[40px] flex items-center justify-center text-neutral-300 hover:text-white transition-colors cursor-pointer"
              title="デバイスに接続 (Connect)"
              aria-label="デバイスに接続"
            >
              <MonitorSpeaker className="w-4.5 h-4.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setQueueOpen((prev) => !prev);
              }}
              className={`relative min-w-[36px] min-h-[40px] flex items-center justify-center transition-colors cursor-pointer ${
                queueOpen ? 'text-red-400' : 'text-neutral-300 hover:text-white'
              }`}
              title={upNextTrack ? `次の曲: ${upNextTrack.title}` : '再生キュー / 次に再生'}
              aria-label="再生キュー / 次に再生"
            >
              <ListMusic className="w-5 h-5" />
              {upcomingCount > 0 && (
                <span className="absolute top-1.5 right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-red-600 text-[9px] font-black text-white flex items-center justify-center leading-none">
                  {upcomingCount > 99 ? '99+' : upcomingCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleLikeTrack(currentTrack);
              }}
              className="min-w-[38px] min-h-[40px] flex items-center justify-center text-neutral-300 hover:text-red-500 transition-colors cursor-pointer"
              title={isLiked ? 'お気に入りから削除' : 'お気に入りに追加'}
              aria-label={isLiked ? 'お気に入りから削除' : 'お気に入りに追加'}
            >
              <Heart
                className={`w-5 h-5 ${isLiked ? 'fill-red-500 text-red-500' : 'text-neutral-300'}`}
              />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="min-w-[38px] min-h-[40px] flex items-center justify-center text-white hover:text-red-400 transition-colors cursor-pointer"
              title={isPlaying ? '一時停止' : '再生'}
              aria-label={isPlaying ? '一時停止' : '再生'}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>
          </div>

          <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-white/15 rounded-full overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-100"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      {/* DESKTOP / TABLET PLAYER BAR (Spacious 3-Column Grid — Zero Overlap) */}
      {!isMobileMode && (
        <footer className="fixed bottom-0 left-0 right-0 z-40 bg-[#0a0a0c]/96 backdrop-blur-xl border-t border-white/10 px-4 md:px-6 py-2.5 shadow-2xl">
          {/* Thin Interactive Top Scrub Line */}
          <div
            className="absolute top-0 left-0 right-0 h-1 bg-neutral-800/80 cursor-pointer group"
            onClick={handleProgressClick}
            onMouseMove={handleProgressMouseMove}
            onMouseEnter={() => setIsHoveringProgress(true)}
            onMouseLeave={() => setIsHoveringProgress(false)}
          >
            {trackTimestamps?.heatMarkers?.map((m, idx) => (
              <div
                key={idx}
                className="absolute top-0 bottom-0 w-1 bg-red-500 rounded-full pointer-events-none z-10"
                style={{
                  left: `${m.percent}%`,
                  opacity: 0.35 + m.heat * 0.65,
                }}
              />
            ))}
            <div
              className="h-full bg-red-600 transition-all duration-100 relative group-hover:bg-red-500 z-20"
              style={{ width: `${percent}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-2.5 bg-white rounded-full shadow scale-0 group-hover:scale-100 transition-transform" />
            </div>
            {isHoveringProgress && duration > 0 && (
              <div
                className="absolute -top-7 -translate-x-1/2 px-2 py-0.5 rounded bg-neutral-900 border border-neutral-700 text-[11px] text-white font-mono tabular-nums pointer-events-none whitespace-nowrap z-30"
                style={{ left: `${(hoverPositionSec / duration) * 100}%` }}
              >
                {formatSeconds(hoverPositionSec)}
              </div>
            )}
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 md:gap-5">
            {/* LEFT: Artwork, Track Info, Heart & Playlist Add */}
            <div className="min-w-0 flex items-center gap-2.5 md:gap-3">
              <div
                className="relative group shrink-0 cursor-pointer"
                onClick={() => setFullScreenPlayerOpen(true)}
                title="フルスクリーン表示"
              >
                <SafeImage
                  src={currentTrack.thumbnail}
                  alt={currentTrack.title}
                  useBase64
                  className="w-11 h-11 md:w-12 md:h-12 rounded-md object-cover bg-neutral-800 shadow group-hover:opacity-90 transition-opacity"
                />
              </div>

              <div className="flex flex-col min-w-0 flex-1">
                <h4
                  className="text-xs sm:text-sm font-semibold text-white truncate hover:text-red-400 cursor-pointer transition-colors"
                  title={currentTrack.title}
                  onClick={() => setFullScreenPlayerOpen(true)}
                >
                  {currentTrack.title}
                </h4>
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-neutral-400 truncate">
                  <button
                    type="button"
                    onClick={() => {
                      if (currentTrack.artistId) {
                        navigateTo('artist', currentTrack.artistId);
                      }
                    }}
                    className="hover:text-white truncate hover:underline cursor-pointer"
                  >
                    {currentTrack.artist || 'Unknown Artist'}
                  </button>
                  {currentTrack.album && (
                    <>
                      <span aria-hidden="true" className="hidden xl:inline text-neutral-600">
                        ·
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const albumTarget = currentTrack.albumId || currentTrack.album;
                          if (albumTarget) {
                            navigateTo('album', albumTarget);
                          }
                        }}
                        className="truncate hidden xl:inline text-neutral-500 hover:text-white hover:underline cursor-pointer"
                        title="アルバムの曲一覧を表示"
                      >
                        {currentTrack.album}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => toggleLikeTrack(currentTrack)}
                  title={isLiked ? 'お気に入りから削除' : 'お気に入りに追加'}
                  aria-label={isLiked ? 'お気に入りから削除' : 'お気に入りに追加'}
                  className="p-1.5 text-neutral-400 hover:text-red-500 transition-colors cursor-pointer"
                >
                  <Heart
                    className={`w-4 h-4 ${isLiked ? 'fill-red-500 text-red-500' : ''}`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => openAddToPlaylistModal(currentTrack)}
                  title="プレイリストに追加"
                  aria-label="プレイリストに追加"
                  className="hidden sm:inline-flex p-1.5 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                >
                  <ListPlus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* CENTER: Transport Controls & Timeline */}
            <div className="w-[230px] sm:w-[300px] md:w-[340px] lg:w-[400px] xl:w-[460px] flex flex-col items-center justify-center gap-1 shrink-0">
              <div className="flex items-center gap-2.5 sm:gap-4">
                <button
                  type="button"
                  onClick={cycleShuffleMode}
                  title={
                    shuffleMode === 'smart'
                      ? 'スマートシャッフル: ON (類似おすすめ曲を自動注入)'
                      : shuffleMode === 'on'
                      ? '通常シャッフル: ON'
                      : 'シャッフル: OFF'
                  }
                  className={`relative p-1.5 transition-colors cursor-pointer ${
                    shuffleMode !== 'off' ? 'text-red-500' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  <Shuffle className="w-4 h-4" />
                  {shuffleMode === 'smart' && (
                    <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-red-400" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={prevTrack}
                  title="前の曲"
                  aria-label="前の曲"
                  className="p-1.5 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                >
                  <SkipBack className="w-4 h-4 md:w-5 md:h-5" />
                </button>

                <button
                  type="button"
                  onClick={togglePlay}
                  title={isPlaying ? '一時停止' : '再生'}
                  aria-label={isPlaying ? '一時停止' : '再生'}
                  className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-lg cursor-pointer"
                >
                  {isPlaying ? (
                    <Pause className="w-4.5 h-4.5 fill-current" />
                  ) : (
                    <Play className="w-4.5 h-4.5 fill-current ml-0.5" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => nextTrack(true)}
                  title="次の曲"
                  aria-label="次の曲"
                  className="p-1.5 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                >
                  <SkipForward className="w-4 h-4 md:w-5 md:h-5" />
                </button>

                <button
                  type="button"
                  onClick={cycleRepeat}
                  title={`リピート: ${repeatMode}`}
                  aria-label="リピート切替"
                  className={`p-1.5 transition-colors cursor-pointer ${
                    repeatMode !== 'off' ? 'text-red-500' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {repeatMode === 'one' ? (
                    <Repeat1 className="w-4 h-4" />
                  ) : (
                    <Repeat className="w-4 h-4" />
                  )}
                </button>
              </div>

              <div className="w-full hidden sm:flex items-center gap-2 text-[11px] font-mono tabular-nums text-neutral-400">
                <span className="w-9 text-right shrink-0">{formatSeconds(progress)}</span>
                <div
                  className="relative flex-1 h-1.5 bg-neutral-800 rounded-full cursor-pointer overflow-hidden group"
                  onClick={handleProgressClick}
                >
                  {trackTimestamps?.heatMarkers?.map((m, idx) => (
                    <span
                      key={idx}
                      title={`${m.timeLabel} ${m.topLabel}`}
                      className="absolute top-0 bottom-0 w-1.5 -translate-x-1/2 bg-red-500 rounded-full z-10 pointer-events-none"
                      style={{ left: `${m.percent}%`, opacity: 0.4 + m.heat * 0.6 }}
                    />
                  ))}
                  <div
                    className="h-full bg-neutral-300 group-hover:bg-red-500 transition-colors rounded-full relative z-20"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="w-9 text-left shrink-0">{formatSeconds(duration)}</span>
              </div>
            </div>

            {/* RIGHT: Clean Essential Controls + Organized Tools Menu */}
            <div className="min-w-0 flex items-center justify-end gap-1">
              {/* Song / MV switch (shown on wide screens; also accessible inside Tools menu) */}
              <div className="hidden xl:flex items-center bg-neutral-900 border border-neutral-800 rounded-lg p-0.5 text-xs mr-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setPlayerMode('cover')}
                  className={`px-2 py-1 rounded flex items-center gap-1 font-medium transition-colors cursor-pointer ${
                    playerMode === 'cover'
                      ? 'bg-neutral-800 text-white shadow-sm'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                  title="カバーアート / 音声モード"
                >
                  <Music className="w-3.5 h-3.5" />
                  <span>曲</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlayerMode('video');
                    setVideoLayout('theater');
                  }}
                  className={`px-2 py-1 rounded flex items-center gap-1 font-medium transition-colors cursor-pointer ${
                    playerMode === 'video'
                      ? 'bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-sm'
                      : 'text-neutral-400 hover:text-red-400'
                  }`}
                  title="YouTube ミュージックビデオ（MV）モード"
                >
                  <Tv className="w-3.5 h-3.5" />
                  <span>MV</span>
                </button>
              </div>

              {/* Lyrics */}
              <button
                type="button"
                onClick={() => setLyricsOpen((prev) => !prev)}
                title="歌詞を表示"
                aria-label="歌詞を表示"
                className={`p-2 rounded-lg transition-colors shrink-0 cursor-pointer ${
                  lyricsOpen
                    ? 'bg-red-600/20 text-red-400'
                    : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <FileText className="w-4 h-4" />
              </button>

              {/* Queue */}
              <button
                type="button"
                onClick={() => setQueueOpen((prev) => !prev)}
                title={upNextTrack ? `次の曲: ${upNextTrack.title}` : '再生キュー'}
                aria-label="再生キュー"
                className={`relative p-2 rounded-lg transition-colors shrink-0 cursor-pointer ${
                  queueOpen
                    ? 'bg-red-600/20 text-red-400'
                    : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <ListMusic className="w-4 h-4" />
                {upcomingCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-red-600 text-[9px] font-black text-white flex items-center justify-center leading-none">
                    {upcomingCount > 99 ? '99+' : upcomingCount}
                  </span>
                )}
              </button>

              {/* Download */}
              <button
                type="button"
                onClick={() => openFreemakeModal(currentTrack)}
                title="Freemake ダウンロード & 変換"
                aria-label="ダウンロード"
                className="hidden md:inline-flex p-2 rounded-lg text-neutral-400 hover:text-sky-400 hover:bg-white/5 transition-colors shrink-0 cursor-pointer"
              >
                <Download className="w-4 h-4" />
              </button>

              {/* More Tools Popover Trigger */}
              <div className="relative shrink-0" ref={toolsMenuRef}>
                <button
                  type="button"
                  onClick={() => setToolsMenuOpen((prev) => !prev)}
                  title="再生ツール・各種設定メニュー"
                  aria-label="プレイヤーメニュー"
                  className={`relative p-2 rounded-lg transition-colors cursor-pointer ${
                    toolsMenuOpen
                      ? 'bg-white/15 text-white'
                      : 'text-neutral-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <MoreHorizontal className="w-4 h-4" />
                  {hasActiveToolMode && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />
                  )}
                </button>

                {toolsMenuOpen && (
                  <div className="absolute bottom-full right-0 mb-3 w-80 max-w-[calc(100vw-24px)] max-h-[75vh] overflow-y-auto p-3.5 rounded-2xl bg-[#14141a]/98 backdrop-blur-xl border border-white/10 shadow-2xl z-50 space-y-3.5 text-xs">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <span className="font-bold text-white text-xs">プレイヤー詳細ツール</span>
                      <button
                        type="button"
                        onClick={() => setToolsMenuOpen(false)}
                        className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-white/10 cursor-pointer"
                        aria-label="閉じる"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Quick Volume (helpful on tablet/narrow screens) */}
                    <div className="flex items-center gap-2.5 bg-neutral-900/80 border border-neutral-800 rounded-xl px-3 py-2 xl:hidden">
                      <button
                        type="button"
                        onClick={toggleMute}
                        className="text-neutral-300 hover:text-white cursor-pointer"
                        aria-label={isMuted ? 'ミュート解除' : 'ミュート'}
                      >
                        {isMuted || volume === 0 ? (
                          <VolumeX className="w-4 h-4" />
                        ) : (
                          <Volume2 className="w-4 h-4" />
                        )}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={isMuted ? 0 : volume}
                        onChange={(e) => setVolume(Number(e.target.value))}
                        className="flex-1 accent-red-600 h-1 bg-neutral-700 rounded-lg cursor-pointer"
                      />
                      <span className="w-8 text-right font-mono tabular-nums text-[11px] text-neutral-400">
                        {isMuted ? 0 : volume}%
                      </span>
                    </div>

                    {/* Playback Mode Switches */}
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-neutral-400 px-1">再生モード</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={toggleBackgroundPlayback}
                          className={`px-2.5 py-2 rounded-xl border flex items-center justify-between transition-colors cursor-pointer ${
                            backgroundPlaybackEnabled
                              ? 'bg-red-950/60 border-red-700/60 text-red-200'
                              : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                            <span>BG再生</span>
                          </span>
                          <span className="text-[10px] font-bold">
                            {backgroundPlaybackEnabled ? 'ON' : 'OFF'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={toggleDigestMode}
                          className={`px-2.5 py-2 rounded-xl border flex items-center justify-between transition-colors cursor-pointer ${
                            digestMode
                              ? 'bg-red-600 border-red-400 text-white'
                              : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <Zap className="w-3.5 h-3.5 shrink-0" />
                            <span>ダイジェスト</span>
                          </span>
                          <span className="text-[10px] font-bold tabular-nums">
                            {digestMode ? `${digestRemainingSec}s` : 'OFF'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={toggleEndlessRadio}
                          className={`px-2.5 py-2 rounded-xl border flex items-center justify-between transition-colors cursor-pointer ${
                            endlessRadioActive
                              ? 'bg-red-950/60 border-red-700/60 text-red-200'
                              : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <Radio className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">
                              {endlessRadioActive && emotionRadioMood
                                ? emotionRadioMood.name
                                : '感情ラジオ'}
                            </span>
                          </span>
                          <span className="text-[10px] font-bold">
                            {endlessRadioActive ? 'ON' : 'OFF'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={toggleWakeLock}
                          className={`px-2.5 py-2 rounded-xl border flex items-center justify-between transition-colors cursor-pointer ${
                            wakeLockActive
                              ? 'bg-red-950/60 border-red-700/60 text-red-200'
                              : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <Sun className="w-3.5 h-3.5 shrink-0" />
                            <span>常時点灯</span>
                          </span>
                          <span className="text-[10px] font-bold">
                            {wakeLockActive ? 'ON' : 'OFF'}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Playback Speed */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-semibold text-neutral-400 flex items-center gap-1">
                          <Gauge className="w-3.5 h-3.5" />
                          <span>再生速度</span>
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-white font-bold">
                          {playbackRate}x
                        </span>
                      </div>
                      <div className="grid grid-cols-6 gap-1">
                        {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => setPlaybackRate(rate)}
                            className={`py-1.5 rounded-lg text-[11px] font-mono tabular-nums transition-colors cursor-pointer ${
                              playbackRate === rate
                                ? 'bg-red-600 text-white font-bold'
                                : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800'
                            }`}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Crossfade */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-semibold text-neutral-400">
                          曲間クロスフェード
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-white font-bold">
                          {crossfadeDuration > 0 ? `${crossfadeDuration}秒` : 'OFF'}
                        </span>
                      </div>
                      <div className="grid grid-cols-5 gap-1">
                        {[0, 2, 4, 6, 8].map((sec) => (
                          <button
                            key={sec}
                            type="button"
                            onClick={() => setCrossfadeDuration(sec)}
                            className={`py-1.5 rounded-lg text-[11px] font-mono tabular-nums transition-colors cursor-pointer ${
                              crossfadeDuration === sec
                                ? 'bg-red-600 text-white font-bold'
                                : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800'
                            }`}
                          >
                            {sec === 0 ? 'OFF' : `${sec}s`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="space-y-1 border-t border-white/10 pt-2.5">
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setToolsMenuOpen(false);
                            setCommentsModalOpen(true);
                          }}
                          className={`px-2.5 py-2 rounded-xl flex items-center gap-2 transition-colors cursor-pointer ${
                            commentsModalOpen
                              ? 'bg-red-600/20 text-red-300'
                              : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-200'
                          }`}
                        >
                          <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">弾幕コメント</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setToolsMenuOpen(false);
                            setConnectModalOpen(true);
                          }}
                          className="px-2.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-200 flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <MonitorSpeaker className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">デバイス接続</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setToolsMenuOpen(false);
                            openTrackDetailModal(currentTrack);
                          }}
                          className="px-2.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-200 flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <Info className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">楽曲詳細</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setToolsMenuOpen(false);
                            openShareModal('track');
                          }}
                          className="px-2.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-200 flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <Share2 className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">URLシェア</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setToolsMenuOpen(false);
                            if (currentTrack) {
                              openVisualShareCard({ type: 'track', track: currentTrack });
                            } else {
                              setStoryModalOpen(true);
                            }
                          }}
                          className="px-2.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-200 flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">シェアカード</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setFloatingPlayerVisible((prev) => !prev);
                            setFloatingPlayerCollapsed(false);
                          }}
                          className={`px-2.5 py-2 rounded-xl flex items-center gap-2 transition-colors cursor-pointer ${
                            floatingPlayerVisible
                              ? 'bg-red-950/60 text-red-200 border border-red-800/50'
                              : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-200'
                          }`}
                        >
                          <AppWindow className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">
                            ミニプレイヤー {floatingPlayerVisible ? 'ON' : 'OFF'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setToolsMenuOpen(false);
                            startRadioForTrack(currentTrack);
                          }}
                          className="px-2.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-200 flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <Radio className="w-3.5 h-3.5 shrink-0 text-red-400" />
                          <span className="truncate">類似曲ラジオ</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setToolsMenuOpen(false);
                            openFreemakeModal(currentTrack);
                          }}
                          className="px-2.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-sky-300 flex items-center gap-2 transition-colors cursor-pointer md:hidden"
                        >
                          <Download className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">ダウンロード</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setToolsMenuOpen(false);
                            setBgGuideOpen(true);
                          }}
                          className="px-2.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-300 flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">BG再生ガイド</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Volume Control (Desktop xl+) */}
              <div className="hidden xl:flex items-center gap-1.5 ml-1 shrink-0">
                <button
                  type="button"
                  onClick={toggleMute}
                  title={isMuted ? 'ミュート解除' : 'ミュート'}
                  aria-label={isMuted ? 'ミュート解除' : 'ミュート'}
                  className="text-neutral-400 hover:text-white p-1.5 cursor-pointer"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="w-16 accent-red-600 h-1 bg-neutral-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Full Screen Player Maximize */}
              <button
                type="button"
                onClick={() => setFullScreenPlayerOpen(true)}
                title="フルスクリーン再生画面を開く"
                aria-label="フルスクリーン再生画面を開く"
                className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </footer>
      )}
    </>
  );
};
