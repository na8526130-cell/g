import React, { useEffect, useState } from 'react';
import {
  X,
  Search,
  Play,
  Plus,
  Heart,
  Loader2,
  Music2,
  Sparkles,
  ListPlus,
  ListStart,
  Disc,
  Globe,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { api } from '../services/api';
import { ClassicalComposer, Track } from '../types/music';
import { SafeImage } from './SafeImage';

const ERA_TABS: { id: string; label: string; years: string }[] = [
  { id: 'all', label: 'すべて', years: 'All Eras' },
  { id: 'baroque', label: 'バロック', years: '1600–1750' },
  { id: 'classical', label: '古典派', years: '1750–1820' },
  { id: 'romantic', label: 'ロマン派', years: '1820–1910' },
  { id: 'modern', label: '近現代・現代', years: '1900–現在' },
];

export const ClassicalExplorerModal: React.FC = () => {
  const {
    classicalModalOpen,
    setClassicalModalOpen,
    catalogRegion,
    playTrack,
    playNext,
    addToQueue,
    likedTrackIds,
    toggleLikeTrack,
    saveTracksAsPlaylist,
    currentTrack,
    isPlaying,
    showToast,
  } = usePlayer();

  const [era, setEra] = useState<string>('all');
  const [selectedComposerId, setSelectedComposerId] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');
  const [submittedQuery, setSubmittedQuery] = useState<string>('');

  const [composers, setComposers] = useState<ClassicalComposer[]>([]);
  const [activeComposer, setActiveComposer] = useState<ClassicalComposer | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!classicalModalOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setClassicalModalOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [classicalModalOpen, setClassicalModalOpen]);

  useEffect(() => {
    if (!classicalModalOpen) return;
    let active = true;
    setLoading(true);
    setErrorMsg(null);

    api
      .getClassicalCatalog({
        era,
        composer: selectedComposerId || undefined,
        q: submittedQuery || undefined,
        gl: catalogRegion,
      })
      .then((res) => {
        if (!active) return;
        setComposers(res.composers || []);
        setActiveComposer(res.activeComposer || null);
        setTracks(res.tracks || []);
        if (res.error && (!res.tracks || res.tracks.length === 0)) {
          setErrorMsg(res.error);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setErrorMsg(err?.message || 'クラシックカタログの取得に失敗しました');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [classicalModalOpen, era, selectedComposerId, submittedQuery, catalogRegion]);

  if (!classicalModalOpen) return null;

  const handleSelectComposer = (compId: string) => {
    setSubmittedQuery('');
    setSearchInput('');
    setSelectedComposerId((prev) => (prev === compId ? '' : compId));
  };

  const handleWorkChipClick = (workTitle: string, composerName?: string) => {
    const query = composerName ? `${composerName} ${workTitle}` : workTitle;
    setSearchInput(query);
    setSubmittedQuery(query);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedQuery(searchInput.trim());
  };

  const handleSaveAsPlaylist = () => {
    if (tracks.length === 0) return;
    const plName = activeComposer
      ? `Classical · ${activeComposer.name}`
      : submittedQuery
      ? `Classical · ${submittedQuery}`
      : `Classical · ${ERA_TABS.find((t) => t.id === era)?.label || 'Selection'}`;
    saveTracksAsPlaylist(
      plName,
      tracks,
      'Zero Music Classical 専門カタログから作成'
    );
    showToast(`「${plName}」をプレイリストに保存しました`, 'success', 2400);
  };

  return (
    <div
      className="fixed inset-0 z-[75] bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-150"
      onClick={() => setClassicalModalOpen(false)}
    >
      <div
        className="w-full sm:max-w-3xl bg-[#0e0c0b] border-t sm:border border-amber-500/25 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="classical-modal-title"
      >
        {/* Drag Handle (Mobile) */}
        <div className="pt-3 pb-1 flex justify-center sm:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-neutral-700" />
        </div>

        {/* Header */}
        <div className="px-5 sm:px-6 py-4 bg-gradient-to-r from-[#231911] via-[#171310] to-[#0e0c0b] border-b border-amber-500/20 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/35 flex items-center justify-center text-amber-300 shrink-0">
              <Music2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  id="classical-modal-title"
                  className="text-lg font-black text-white tracking-tight"
                >
                  Zero Classical 専門館
                </h2>
                <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/35 text-[10px] font-bold text-amber-200">
                  作品番号・楽章・時代別
                </span>
                <span className="px-2 py-0.5 rounded bg-neutral-800 text-[10px] font-mono text-neutral-300 flex items-center gap-1">
                  <Globe className="w-3 h-3 text-amber-300" />
                  {catalogRegion}
                </span>
              </div>
              <p className="text-xs text-neutral-400 truncate">
                作曲家・Opus/BWV/K.番号・演奏団体でクラシック音源を検索・連続再生
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setClassicalModalOpen(false)}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-neutral-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* Search Bar (Composer / Opus / Movement / Conductor) */}
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="作品番号・作曲家・指揮者で検索 (例: Chopin Nocturne Op.9-2, BWV 1007)"
                className="w-full h-11 bg-[#181513] border border-amber-500/25 focus:border-amber-400 rounded-xl pl-10 pr-9 text-xs sm:text-sm text-white placeholder-neutral-500 outline-none"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    setSubmittedQuery('');
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white p-1 cursor-pointer"
                  aria-label="クリア"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="submit"
              className="px-4 h-11 rounded-xl bg-amber-600 hover:bg-amber-500 text-neutral-950 font-black text-xs sm:text-sm shrink-0 transition-colors cursor-pointer"
            >
              作品検索
            </button>
          </form>

          {/* Era Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {ERA_TABS.map((tab) => {
              const active = era === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setEra(tab.id);
                    setSelectedComposerId('');
                    setSubmittedQuery('');
                  }}
                  className={`px-3.5 py-2 rounded-xl border text-left transition-all shrink-0 cursor-pointer ${
                    active
                      ? 'bg-amber-500/20 border-amber-400 text-white shadow-sm'
                      : 'bg-[#171412] border-neutral-800 text-neutral-300 hover:border-amber-500/40'
                  }`}
                >
                  <div className="text-xs font-bold">{tab.label}</div>
                  <div className="text-[10px] font-mono text-amber-300/80">{tab.years}</div>
                </button>
              );
            })}
          </div>

          {/* Composer Shelf */}
          {composers.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-amber-200/90 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>主要作曲家・名曲プログラム</span>
                </h3>
                {selectedComposerId && (
                  <button
                    type="button"
                    onClick={() => setSelectedComposerId('')}
                    className="text-[11px] font-bold text-amber-300 hover:underline cursor-pointer"
                  >
                    選択解除
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {composers.map((comp) => {
                  const isSelected = selectedComposerId === comp.id;
                  return (
                    <button
                      key={comp.id}
                      type="button"
                      onClick={() => handleSelectComposer(comp.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-amber-600/25 border-amber-400 text-white ring-1 ring-amber-400/50'
                          : 'bg-[#171412] hover:bg-[#201b18] border-neutral-800 text-neutral-200'
                      }`}
                    >
                      <p className="text-xs font-extrabold truncate">{comp.name}</p>
                      <p className="text-[10px] text-amber-300/80 truncate mt-0.5">{comp.eraLabel}</p>
                    </button>
                  );
                })}
              </div>

              {/* Active Composer Representative Opus Chips */}
              {activeComposer && activeComposer.sampleWorks?.length > 0 && (
                <div className="p-3.5 rounded-xl bg-[#181411] border border-amber-500/25 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <span className="text-xs font-black text-white">{activeComposer.name}</span>
                      <span className="text-[11px] text-neutral-400 ml-2">
                        {activeComposer.eraLabel} • 代表作品番号をクリックして検索
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activeComposer.sampleWorks.map((work) => (
                      <button
                        key={work.query || work.title}
                        type="button"
                        onClick={() => handleWorkChipClick(work.query)}
                        className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/30 border border-amber-500/30 text-[11px] font-semibold text-amber-200 transition-colors cursor-pointer"
                      >
                        {work.title}
                        {work.opus ? ` (${work.opus})` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tracklist Actions & Results */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Disc className="w-4 h-4 text-amber-400" />
                <span>
                  演奏・録音ラインナップ ({tracks.length}件)
                </span>
              </h3>
              {tracks.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => playTrack(tracks[0], tracks, { source: 'Zero Classical', subtitle: activeComposer?.name || ERA_TABS.find((t) => t.id === era)?.label || 'クラシック' })}
                    className="px-3.5 py-1.5 rounded-full bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>すべて再生</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAsPlaylist}
                    className="px-3 py-1.5 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ListPlus className="w-3.5 h-3.5 text-amber-400" />
                    <span>プレイリスト保存</span>
                  </button>
                </div>
              )}
            </div>

            {loading ? (
              <div className="py-16 flex flex-col items-center justify-center gap-2.5 text-neutral-400">
                <Loader2 className="w-7 h-7 animate-spin text-amber-400" />
                <p className="text-xs">クラシックカタログを取得中...</p>
              </div>
            ) : errorMsg ? (
              <div className="p-4 rounded-xl bg-red-950/30 border border-red-800/40 text-xs text-red-200">
                {errorMsg}
              </div>
            ) : tracks.length === 0 ? (
              <div className="py-14 text-center text-xs text-neutral-400">
                一致するクラシック楽曲が見つかりませんでした。別の作曲家や作品番号をお試しください。
              </div>
            ) : (
              <div className="bg-[#141110] border border-neutral-800/80 rounded-xl divide-y divide-neutral-800/60 overflow-hidden">
                {tracks.map((track, idx) => {
                  const isCurrent = currentTrack?.id === track.id;
                  const isLiked = likedTrackIds.has(track.id);
                  return (
                    <div
                      key={`${track.id}-${idx}`}
                      onClick={() =>
                        playTrack(track, tracks, {
                          source: 'Zero Classical',
                          subtitle: track.composerName || activeComposer?.name || 'クラシック',
                        })
                      }
                      className={`flex items-center gap-3 px-3 sm:px-4 py-2.5 hover:bg-white/[0.04] transition-colors cursor-pointer ${
                        isCurrent ? 'bg-amber-950/30' : ''
                      }`}
                    >
                      <div className="w-6 text-center text-xs font-mono text-neutral-500 shrink-0">
                        {isCurrent && isPlaying ? (
                          <span className="text-amber-400 font-bold">▶</span>
                        ) : (
                          idx + 1
                        )}
                      </div>

                      <SafeImage
                        src={track.thumbnail}
                        alt={track.title}
                        useBase64
                        className="w-11 h-11 rounded-lg object-cover bg-neutral-800 shrink-0"
                      />

                      <div className="flex-1 min-w-0">
                        <p className={`text-xs sm:text-sm font-bold truncate ${isCurrent ? 'text-amber-300' : 'text-white'}`}>
                          {track.title}
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span className="text-[11px] text-neutral-400 truncate">
                            {track.artist}
                          </span>
                          {track.opusNumber && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-500/15 border border-amber-500/30 text-[10px] font-mono text-amber-300 shrink-0">
                              {track.opusNumber}
                            </span>
                          )}
                          {track.composerName && (
                            <span className="text-[10px] text-neutral-500 hidden sm:inline">
                              · {track.composerName}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLikeTrack(track);
                          }}
                          className="min-w-[36px] min-h-[36px] flex items-center justify-center text-neutral-400 hover:text-red-500 cursor-pointer"
                          title="お気に入り"
                        >
                          <Heart className={`w-4 h-4 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            playNext(track);
                          }}
                          className="min-w-[36px] min-h-[36px] flex items-center justify-center text-neutral-400 hover:text-amber-300 cursor-pointer"
                          title="次に再生"
                        >
                          <ListStart className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            addToQueue(track);
                            showToast(`「${track.title}」をキューに追加しました`, 'info', 2000);
                          }}
                          className="min-w-[36px] min-h-[36px] flex items-center justify-center text-neutral-400 hover:text-white cursor-pointer"
                          title="キューに追加"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        {track.duration && (
                          <span className="text-[11px] font-mono text-neutral-500 w-11 text-right hidden sm:inline-block">
                            {track.duration}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
