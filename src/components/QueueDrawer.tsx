import React, { useState, useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { api } from '../services/api';
import { Track } from '../types/music';
import {
  X,
  Trash2,
  Play,
  Plus,
  Sparkles,
  Music,
  Radio,
  ListStart,
  ChevronUp,
  ChevronDown,
  GripVertical,
  History,
  Loader2,
  Info,
  EyeOff,
} from 'lucide-react';
import { SafeImage } from './SafeImage';

export const QueueDrawer: React.FC = () => {
  const {
    queue,
    queueIndex,
    currentTrack,
    queueOpen,
    setQueueOpen,
    playTrack,
    removeFromQueue,
    clearQueue,
    addToQueue,
    playNext,
    moveQueueItem,
    moveToPlayNext,
    endlessRadioActive,
    toggleEndlessRadio,
    emotionRadioMood,
    isAutoSelectingQueue,
    replenishQueueNow,
    openTrackDetailModal,
    hideTrack,
    isTrackBlocked,
    showToast,
  } = usePlayer();

  const [relatedTracks, setRelatedTracks] = useState<Track[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [showPastTracks, setShowPastTracks] = useState(false);
  const [dragQueueIdx, setDragQueueIdx] = useState<number | null>(null);
  const [dragOverQueueIdx, setDragOverQueueIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!queueOpen || !currentTrack) return;
    setLoadingRelated(true);
    api
      .getRelated(currentTrack.id)
      .then((res) => {
        setRelatedTracks(res.slice(0, 20));
        setLoadingRelated(false);
      })
      .catch(() => {
        setLoadingRelated(false);
      });
  }, [queueOpen, currentTrack?.id]);

  if (!queueOpen) return null;

  const upcomingItems = queue
    .map((track, idx) => ({ track, idx }))
    .filter(({ idx }) => idx > queueIndex);

  const pastItems = queue
    .map((track, idx) => ({ track, idx }))
    .filter(({ idx }) => idx < queueIndex);

  return (
    <aside
      className="fixed inset-y-0 right-0 w-full sm:w-96 md:w-[430px] z-50 bg-[#0d0d10] border-l border-neutral-800 shadow-2xl flex flex-col backdrop-blur-2xl transition-transform"
      aria-label="キュー管理パネル"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800/80 bg-[#121215]">
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-red-500" />
          <h3 className="text-sm font-bold text-white tracking-wide">
            再生キュー ({upcomingItems.length > 0 ? `あと${upcomingItems.length}曲` : `${queue.length}曲`})
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {queue.length > 1 && (
            <button
              type="button"
              onClick={clearQueue}
              className="text-xs text-neutral-400 hover:text-red-400 flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-neutral-800 cursor-pointer"
              title="キューをクリア"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>クリア</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setQueueOpen(false)}
            className="p-1.5 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer"
            aria-label="キューを閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-28 space-y-6">
        {/* Now Playing */}
        {currentTrack && (
          <div>
            <span className="text-[11px] font-bold text-red-500 uppercase tracking-wider block mb-2 px-2">
              再生中
            </span>
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-red-600/10 border border-red-500/25">
              <SafeImage
                src={currentTrack.thumbnail}
                alt={currentTrack.title}
                useBase64
                className="w-12 h-12 rounded-lg object-cover shadow shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{currentTrack.title}</p>
                <p className="text-xs text-neutral-300 truncate">{currentTrack.artist}</p>
              </div>
              <button
                type="button"
                onClick={() => openTrackDetailModal(currentTrack)}
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                title="楽曲の詳細を見る"
                aria-label="楽曲の詳細を見る"
              >
                <Info className="w-4 h-4" />
              </button>
              <span className="text-xs text-neutral-400 font-mono pr-1">{currentTrack.duration}</span>
            </div>
          </div>
        )}

        {/* Next Up in Queue */}
        <div>
          <div className="flex flex-wrap items-center justify-between mb-2 px-2 gap-2">
            <span className="text-[11px] font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
              <ListStart className="w-3.5 h-3.5 text-red-500" />
              <span>次に再生 ({upcomingItems.length})</span>
              {isAutoSelectingQueue && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-400 normal-case">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>自動選曲中...</span>
                </span>
              )}
            </span>
            <div className="flex items-center gap-1.5">
              {currentTrack && !currentTrack.isLocal && (
                <button
                  type="button"
                  disabled={isAutoSelectingQueue}
                  onClick={() => replenishQueueNow()}
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 bg-red-600/20 hover:bg-red-600/35 border border-red-500/35 text-red-300 disabled:opacity-50 transition-colors cursor-pointer"
                  title="今の曲や雰囲気に合う曲を自動で大量追加"
                >
                  <Sparkles className="w-3 h-3 text-red-400" />
                  <span>＋自動選曲</span>
                </button>
              )}
              <button
                type="button"
                onClick={toggleEndlessRadio}
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 border transition-colors cursor-pointer ${
                  endlessRadioActive
                    ? 'bg-red-950/70 border-red-700/50 text-red-300'
                    : 'bg-neutral-900 border-neutral-800 text-neutral-500 hover:text-white'
                }`}
                title="曲が減ると自動で次の曲を補充します"
              >
                <Radio className="w-3 h-3 text-red-400" />
                <span>
                  {endlessRadioActive
                    ? `自動選曲ON: ${emotionRadioMood?.name || '連続補充'}`
                    : '自動選曲 OFF'}
                </span>
              </button>
            </div>
          </div>

          {upcomingItems.length === 0 ? (
            <div className="text-center py-6 text-xs text-neutral-500 px-4 bg-neutral-900/40 border border-neutral-800/60 rounded-xl">
              次に再生する曲はありません。下の「おすすめ曲」や楽曲リストの「次に再生」から追加できます。
            </div>
          ) : (
            <div className="space-y-1">
              {upcomingItems.map(({ track, idx }, upPos) => {
                const isImmediateNext = upPos === 0;
                return (
                  <div
                    key={`${track.id}-${idx}`}
                    draggable={upcomingItems.length > 1}
                    onDragStart={() => setDragQueueIdx(idx)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (dragQueueIdx !== null && dragOverQueueIdx !== idx) {
                        setDragOverQueueIdx(idx);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverQueueIdx === idx) setDragOverQueueIdx(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragQueueIdx !== null && dragQueueIdx !== idx) {
                        moveQueueItem(dragQueueIdx, idx);
                      }
                      setDragQueueIdx(null);
                      setDragOverQueueIdx(null);
                    }}
                    onDragEnd={() => {
                      setDragQueueIdx(null);
                      setDragOverQueueIdx(null);
                    }}
                    className={`flex items-center gap-2 p-2 rounded-xl hover:bg-neutral-800/60 group transition-colors ${
                      isImmediateNext
                        ? 'bg-red-950/20 border border-red-500/25'
                        : 'border border-transparent'
                    } ${dragOverQueueIdx === idx ? 'border-t-2 border-t-red-500 bg-red-950/30' : ''}`}
                  >
                    {upcomingItems.length > 1 && (
                      <GripVertical className="w-3.5 h-3.5 text-neutral-600 hover:text-neutral-300 shrink-0 cursor-grab active:cursor-grabbing hidden sm:block" />
                    )}

                    <div className="w-6 flex items-center justify-center shrink-0">
                      {isImmediateNext ? (
                        <span className="px-1.5 py-0.5 rounded bg-red-600 text-white text-[10px] font-black leading-none">
                          次
                        </span>
                      ) : (
                        <span className="text-xs font-mono text-neutral-500">{upPos + 1}</span>
                      )}
                    </div>

                    <SafeImage
                      src={track.thumbnail}
                      alt={track.title}
                      useBase64
                      className="w-10 h-10 rounded-lg object-cover shrink-0 cursor-pointer"
                      onClick={() => playTrack(track, queue)}
                    />
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => playTrack(track, queue)}
                    >
                      <p
                        className={`text-xs font-semibold truncate ${
                          isImmediateNext ? 'text-red-200' : 'text-white'
                        }`}
                      >
                        {track.title}
                      </p>
                      <p className="text-[11px] text-neutral-400 truncate">{track.artist}</p>
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0">
                      {!isImmediateNext && (
                        <button
                          type="button"
                          onClick={() => moveToPlayNext(idx)}
                          className="p-1.5 text-red-400 hover:text-white hover:bg-red-600/30 rounded-lg transition-colors cursor-pointer"
                          title="一番次に移動（次に再生）"
                          aria-label="一番次に移動"
                        >
                          <ListStart className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {upcomingItems.length > 1 && (
                        <>
                          <button
                            type="button"
                            disabled={upPos === 0}
                            onClick={() => moveQueueItem(idx, idx - 1)}
                            className="p-1 text-neutral-400 hover:text-white disabled:opacity-25 rounded hover:bg-neutral-700 cursor-pointer disabled:cursor-not-allowed"
                            title="1つ上へ"
                            aria-label="1つ上へ"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={upPos === upcomingItems.length - 1}
                            onClick={() => moveQueueItem(idx, idx + 1)}
                            className="p-1 text-neutral-400 hover:text-white disabled:opacity-25 rounded hover:bg-neutral-700 cursor-pointer disabled:cursor-not-allowed"
                            title="1つ下へ"
                            aria-label="1つ下へ"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => playTrack(track, queue)}
                        className="p-1.5 text-neutral-300 hover:text-white rounded hover:bg-neutral-700 cursor-pointer"
                        title="今すぐ再生"
                        aria-label="今すぐ再生"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFromQueue(idx)}
                        className="p-1.5 text-neutral-400 hover:text-red-400 rounded hover:bg-neutral-700 cursor-pointer"
                        title="キューから削除"
                        aria-label="キューから削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recommended Tracks (InnerTube Related API) */}
        <div>
          <div className="flex items-center justify-between mb-2 px-2">
            <span className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-red-500" />
              <span>おすすめ曲</span>
            </span>
          </div>

          {loadingRelated ? (
            <div className="text-center py-4 text-xs text-neutral-500">
              おすすめ曲を取得中...
            </div>
          ) : (
            <div className="space-y-1">
              {relatedTracks
                .filter((rel) => !isTrackBlocked(rel))
                .map((rel) => (
                <div
                  key={rel.id}
                  className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-neutral-800/50 group transition-colors"
                >
                  <SafeImage
                    src={rel.thumbnail}
                    alt={rel.title}
                    useBase64
                    className="w-9 h-9 rounded object-cover shrink-0 cursor-pointer"
                    onClick={() => playTrack(rel)}
                  />
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => playTrack(rel)}
                  >
                    <p className="text-xs font-medium text-white truncate">{rel.title}</p>
                    <p className="text-[11px] text-neutral-400 truncate">{rel.artist}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => playNext(rel)}
                      className="px-2 py-1 bg-red-600/20 hover:bg-red-600/35 text-red-300 border border-red-500/30 text-[11px] font-semibold rounded-md flex items-center gap-1 transition-colors cursor-pointer"
                      title="今の曲のすぐ次に再生"
                    >
                      <ListStart className="w-3 h-3" />
                      <span>次に再生</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        addToQueue(rel);
                        showToast(`「${rel.title}」をキューの末尾に追加しました`, 'info', 2000);
                      }}
                      className="p-1.5 text-neutral-400 hover:text-white rounded-md hover:bg-neutral-800 transition-colors cursor-pointer"
                      title="キューの最後に追加"
                      aria-label="キューの最後に追加"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openTrackDetailModal(rel)}
                      className="p-1.5 text-neutral-500 hover:text-white rounded-md hover:bg-neutral-800 transition-colors cursor-pointer"
                      title="楽曲の詳細"
                      aria-label="楽曲の詳細"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => hideTrack(rel)}
                      className="p-1.5 text-neutral-500 hover:text-red-400 rounded-md hover:bg-neutral-800 transition-colors cursor-pointer"
                      title="この曲を非表示"
                      aria-label="この曲を非表示"
                    >
                      <EyeOff className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Past Played Tracks in Current Queue */}
        {pastItems.length > 0 && (
          <div className="pt-2 border-t border-neutral-800/80">
            <button
              type="button"
              onClick={() => setShowPastTracks((v) => !v)}
              className="w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-bold text-neutral-500 hover:text-neutral-300 uppercase tracking-wider cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                <span>再生済みの曲 ({pastItems.length})</span>
              </span>
              {showPastTracks ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {showPastTracks && (
              <div className="space-y-1 mt-1.5">
                {pastItems.map(({ track, idx }) => (
                  <div
                    key={`past-${track.id}-${idx}`}
                    className="flex items-center gap-2.5 p-2 rounded-lg opacity-65 hover:opacity-100 hover:bg-neutral-800/40 transition-all"
                  >
                    <SafeImage
                      src={track.thumbnail}
                      alt={track.title}
                      useBase64
                      className="w-8 h-8 rounded object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-neutral-200 truncate">{track.title}</p>
                      <p className="text-[11px] text-neutral-500 truncate">{track.artist}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => playNext(track)}
                      className="px-2 py-1 bg-neutral-800 hover:bg-red-600/30 text-neutral-300 hover:text-red-200 text-[11px] rounded flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                      title="もう一度次に再生"
                    >
                      <ListStart className="w-3 h-3" />
                      <span>次に再生</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
