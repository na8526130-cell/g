import React, { useState } from 'react';
import {
  X,
  Sparkles,
  Wand2,
  Radio,
  Play,
  Shuffle,
  BookmarkPlus,
  Loader2,
  Music,
  Check,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { api } from '../services/api';
import { Track } from '../types/music';

const QUICK_PROMPTS = [
  { label: '深夜の首都高ドライブ', prompt: '深夜の首都高ドライブに合う疾走感ある邦ロック・エレクトロ' },
  { label: '朝の通勤を爽快に', prompt: '朝の通勤や通学が前向きになる爽快J-POPとアップテンポ曲' },
  { label: '雨の日に聴くチル', prompt: '雨の日に落ち着いて聴けるローファイ・ピアノ・メロウな曲' },
  { label: 'ワークアウト全開', prompt: '筋トレ・ランニングでテンションが上がるハイエナジーなビート' },
  { label: '泣けるエモい夜', prompt: '切なくて歌詞が心に刺さる深夜のバラード＆エモい曲' },
];

export const AiPlaylistModal: React.FC = () => {
  const {
    aiPlaylistModalOpen,
    setAiPlaylistModalOpen,
    currentTrack,
    likedTracks,
    recentTracks,
    playTrack,
    saveTracksAsPlaylist,
    showToast,
  } = usePlayer();

  const [mode, setMode] = useState<'playlist' | 'radio'>('playlist');
  const [prompt, setPrompt] = useState<string>('');
  const [trackCount, setTrackCount] = useState<number>(12);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [result, setResult] = useState<{
    title: string;
    description: string;
    moodTag: string;
    tracks: Track[];
  } | null>(null);

  if (!aiPlaylistModalOpen) return null;

  const handleGenerate = async (customPrompt?: string) => {
    const q = (customPrompt !== undefined ? customPrompt : prompt).trim();
    if (!q && !currentTrack) {
      setErrorMsg('作りたいプレイリストの雰囲気やテーマを入力してください');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSavedSuccess(false);

    try {
      const contextArtists = Array.from(
        new Set([
          ...(currentTrack ? [currentTrack.artist] : []),
          ...likedTracks.slice(0, 6).map((t) => t.artist),
          ...recentTracks.slice(0, 6).map((t) => t.artist),
        ].filter(Boolean))
      ).slice(0, 8);

      const likedTitles = likedTracks.slice(0, 8).map((t) => `${t.title} - ${t.artist}`);

      const res = await api.generateAiPlaylist({
        prompt: q || (currentTrack ? `${currentTrack.title} (${currentTrack.artist}) に合うラジオ選曲` : 'おすすめミックス'),
        mode,
        trackCount,
        seedTrack: currentTrack,
        contextArtists,
        likedTitles,
      });

      setResult({
        title: res.playlistTitle,
        description: res.description,
        moodTag: res.moodTag,
        tracks: res.tracks || [],
      });

      if (!res.tracks || res.tracks.length === 0) {
        setErrorMsg('該当する曲が見つかりませんでした。別の表現をお試しください。');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'AIプレイリストの生成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handlePlayAll = (shuffled = false) => {
    if (!result || result.tracks.length === 0) return;
    const list = shuffled
      ? [...result.tracks].sort(() => Math.random() - 0.5)
      : result.tracks;
    playTrack(list[0], list, {
      source: mode === 'radio' ? 'AIラジオ生成' : 'AIプレイリスト',
      subtitle: result.title,
    });
    setAiPlaylistModalOpen(false);
  };

  const handleSaveToLibrary = () => {
    if (!result || result.tracks.length === 0) return;
    saveTracksAsPlaylist(result.title, result.tracks, result.description);
    setSavedSuccess(true);
    showToast(`「${result.title}」をマイプレイリストに保存しました`, 'success', 2600);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
      onClick={() => setAiPlaylistModalOpen(false)}
    >
      <div
        className="w-full max-w-2xl bg-[#0e0e13] border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-800/80 flex items-center justify-between bg-[#14141b]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                AI プレイリスト ＆ AI ラジオ生成
              </h2>
              <p className="text-xs text-neutral-400">
                気分・シーン・好きな曲を入力するだけで専用ミックスをリアルタイム選曲
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAiPlaylistModalOpen(false)}
            className="w-8 h-8 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Mode Selector */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-neutral-900 rounded-xl border border-neutral-800">
            <button
              type="button"
              onClick={() => setMode('playlist')}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                mode === 'playlist' ? 'bg-amber-500 text-black' : 'text-neutral-300 hover:text-white'
              }`}
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>AI プレイリスト作成</span>
            </button>
            <button
              type="button"
              onClick={() => setMode('radio')}
              className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                mode === 'radio' ? 'bg-red-600 text-white' : 'text-neutral-300 hover:text-white'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>AI ラジオ生成</span>
            </button>
          </div>

          {/* Prompt Input */}
          <div className="space-y-2.5">
            <label className="block text-xs font-bold text-neutral-300">
              どんな音楽を聴きたいですか？
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              placeholder={
                currentTrack
                  ? `例: 「${currentTrack.title}」みたいな夜のドライブに合う疾走感ある曲`
                  : '例: 雨のカフェで集中できるアコースティック＆ローファイ、または90年代JPOP名曲'
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-amber-500/60 resize-none"
            />

            {/* Quick Presets */}
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    setPrompt(item.prompt);
                    handleGenerate(item.prompt);
                  }}
                  disabled={loading}
                  className="px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-[11px] font-medium text-neutral-300 hover:text-white cursor-pointer transition-colors disabled:opacity-50"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Track Count & Submit */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-neutral-400 mr-1">曲数:</span>
              {[8, 12, 18, 24].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => setTrackCount(cnt)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${
                    trackCount === cnt
                      ? 'bg-neutral-100 text-black border-white'
                      : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                  }`}
                >
                  {cnt}曲
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => handleGenerate()}
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs sm:text-sm flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>AI選曲中...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>{mode === 'radio' ? 'AIラジオを生成' : 'プレイリストを生成'}</span>
                </>
              )}
            </button>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-950/50 border border-red-700/40 text-xs text-red-300">
              {errorMsg}
            </div>
          )}

          {/* Generated Result */}
          {result && result.tracks.length > 0 && (
            <div className="rounded-2xl bg-[#13131b] border border-neutral-800 overflow-hidden">
              <div className="p-4 border-b border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-amber-500/10 to-red-600/10">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {result.moodTag}
                    </span>
                    <span className="text-[11px] text-neutral-400 font-mono">
                      {result.tracks.length}曲
                    </span>
                  </div>
                  <h3 className="text-base font-extrabold text-white mt-1 truncate">{result.title}</h3>
                  <p className="text-xs text-neutral-400 mt-0.5 line-clamp-2">{result.description}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handlePlayAll(false)}
                    className="px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>再生</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePlayAll(true)}
                    className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    title="シャッフル再生"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveToLibrary}
                    className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer border transition-colors ${
                      savedSuccess
                        ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-neutral-800 hover:bg-neutral-700 text-white border-neutral-700'
                    }`}
                  >
                    {savedSuccess ? <Check className="w-3.5 h-3.5" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
                    <span>{savedSuccess ? '保存済み' : '保存'}</span>
                  </button>
                </div>
              </div>

              <div className="divide-y divide-neutral-800/70 max-h-72 overflow-y-auto">
                {result.tracks.map((tr, idx) => (
                  <button
                    key={`${tr.id}-${idx}`}
                    type="button"
                    onClick={() => {
                      playTrack(tr, result.tracks, {
                        source: mode === 'radio' ? 'AIラジオ生成' : 'AIプレイリスト',
                        subtitle: result.title,
                      });
                      setAiPlaylistModalOpen(false);
                    }}
                    className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-neutral-800/50 text-left transition-colors cursor-pointer"
                  >
                    <span className="w-5 text-center text-xs font-mono text-neutral-500 shrink-0">
                      {idx + 1}
                    </span>
                    {tr.thumbnail ? (
                      <img
                        src={tr.thumbnail}
                        alt={tr.title}
                        className="w-10 h-10 rounded-lg object-cover bg-neutral-800 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-neutral-800 flex items-center justify-center shrink-0">
                        <Music className="w-4 h-4 text-neutral-500" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs sm:text-sm font-bold text-white truncate">{tr.title}</p>
                      <p className="text-[11px] text-neutral-400 truncate">
                        {tr.artist}
                        {tr.aiReason ? ` · ${tr.aiReason}` : ''}
                      </p>
                    </div>
                    <span className="text-[11px] font-mono text-neutral-500 shrink-0">
                      {tr.duration || '--:--'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
