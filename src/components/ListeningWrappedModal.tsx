import React, { useState, useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { SafeImage } from './SafeImage';
import { RecapPeriod } from '../types/music';
import {
  Sparkles,
  Play,
  Heart,
  X,
  Trophy,
  Flame,
  Clock,
  Music,
  Share2,
  Calendar,
} from 'lucide-react';

const PERIOD_TABS: { id: RecapPeriod; label: string }[] = [
  { id: 'year', label: '年間' },
  { id: 'season', label: '季節ごと' },
  { id: 'month', label: '月別' },
];

export const ListeningWrappedModal: React.FC = () => {
  const {
    wrappedModalOpen,
    setWrappedModalOpen,
    getRecapStats,
    playTrack,
    likedTracks,
    setStoryModalOpen,
  } = usePlayer();

  const [period, setPeriod] = useState<RecapPeriod>('year');
  const [selectedKey, setSelectedKey] = useState<string>('');

  const recap = getRecapStats(period, selectedKey || undefined);

  useEffect(() => {
    if (recap.periodKey && selectedKey !== recap.periodKey) {
      setSelectedKey(recap.periodKey);
    }
  }, [period, recap.periodKey, selectedKey]);

  if (!wrappedModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200 overflow-y-auto"
      onClick={() => setWrappedModalOpen(false)}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl bg-gradient-to-b from-[#240306] via-[#120103] to-black border border-red-900/50 p-6 sm:p-7 shadow-2xl text-white space-y-5 my-auto animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center text-white shadow-lg shadow-red-600/30 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-black text-white tracking-tight">
                  年間・季節・月別 Recap
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-red-600/20 text-red-300 border border-red-500/30 uppercase">
                  RECAP
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                {recap.label} のリスニング振り返りランキング
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setWrappedModalOpen(false)}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Period Switcher Tabs + Specific Period Dropdown */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-black/60 border border-red-900/40">
            {PERIOD_TABS.map((tab) => {
              const active = period === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setPeriod(tab.id);
                    setSelectedKey('');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    active
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-neutral-300 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <select
            value={recap.periodKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            className="bg-neutral-900 border border-red-900/40 rounded-xl px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-red-500"
            aria-label="集計期間を選択"
          >
            {recap.availableKeys.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </div>

        {/* 3-Stat Metric Cards */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3 text-center">
          <div className="p-3 rounded-xl bg-red-950/30 border border-red-900/30 space-y-1">
            <Clock className="w-4 h-4 text-red-400 mx-auto" />
            <p className="text-lg sm:text-xl font-black text-white font-mono">
              {recap.totalMinutes}
              <span className="text-xs text-neutral-400 font-sans ml-1">分</span>
            </p>
            <p className="text-[10px] text-neutral-400">再生時間</p>
          </div>

          <div className="p-3 rounded-xl bg-red-950/30 border border-red-900/30 space-y-1">
            <Flame className="w-4 h-4 text-red-400 mx-auto" />
            <p className="text-lg sm:text-xl font-black text-white font-mono">
              {recap.totalPlays}
              <span className="text-xs text-neutral-400 font-sans ml-1">回</span>
            </p>
            <p className="text-[10px] text-neutral-400">{recap.totalPlayedTracks}曲再生</p>
          </div>

          <div className="p-3 rounded-xl bg-red-950/30 border border-red-900/30 space-y-1">
            <Heart className="w-4 h-4 text-red-400 mx-auto fill-red-500" />
            <p className="text-lg sm:text-xl font-black text-white font-mono">
              {likedTracks.length}
              <span className="text-xs text-neutral-400 font-sans ml-1">曲</span>
            </p>
            <p className="text-[10px] text-neutral-400">お気に入り</p>
          </div>
        </div>

        {/* Listening Personality Tag */}
        <div className="p-3.5 rounded-xl bg-gradient-to-r from-red-950/50 via-neutral-900 to-black border border-red-500/25 flex items-center justify-between gap-3 text-xs flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-red-400" />
            <span>
              リスニング傾向: <strong className="text-red-300">{recap.timeOfDay}</strong>
            </span>
          </div>
          {recap.topMood ? (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-600/25 text-red-200 border border-red-500/30">
              よく聴いたムード: #{recap.topMood}
            </span>
          ) : (
            <span className="text-[10px] font-mono text-neutral-400">ログ自動集計</span>
          )}
        </div>

        {/* Top 5 Songs Podium */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-red-400" />
            <span>{recap.label} トップ5楽曲</span>
          </h3>

          {recap.topTracks.length > 0 ? (
            <div className="space-y-1.5 divide-y divide-neutral-900/80">
              {recap.topTracks.slice(0, 5).map((item, idx) => (
                <div
                  key={item.track.id || idx}
                  onClick={() => playTrack(item.track)}
                  className="flex items-center justify-between gap-3 py-2 px-2 hover:bg-neutral-900/80 rounded-xl transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span
                      className={`w-6 text-center text-xs font-mono font-bold ${
                        idx === 0
                          ? 'text-red-400 text-sm font-black'
                          : 'text-neutral-500'
                      }`}
                    >
                      #{idx + 1}
                    </span>

                    <div className="w-9 h-9 rounded-lg overflow-hidden bg-neutral-800 shrink-0">
                      <SafeImage
                        src={item.track.thumbnail}
                        alt={item.track.title}
                        useBase64
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-white truncate group-hover:text-red-400 transition-colors">
                        {item.track.title}
                      </p>
                      <p className="text-[11px] text-neutral-400 truncate">
                        {item.track.artist}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-red-400 bg-red-950/40 px-2 py-0.5 rounded-full border border-red-900/40">
                      {item.count}回 再生
                    </span>
                    <div className="w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-400 py-4 text-center">
              この期間の再生履歴はまだありません。曲を再生すると自動で振り返りが作成されます。
            </p>
          )}
        </div>

        {/* Top Artists */}
        {recap.topArtists.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5 text-red-400" />
              <span>トップアーティスト</span>
            </h3>

            <div className="flex flex-wrap gap-2">
              {recap.topArtists.slice(0, 4).map((art, i) => (
                <div
                  key={art.artist}
                  className="px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center gap-2 text-xs"
                >
                  <span className="w-4 text-center font-mono font-bold text-red-400">
                    #{i + 1}
                  </span>
                  <span className="font-semibold text-white">{art.artist}</span>
                  <span className="text-[10px] font-mono text-neutral-500">
                    {art.count}回
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Share Button (Story Generator integration) */}
        <div className="pt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setWrappedModalOpen(false);
              setStoryModalOpen(true);
            }}
            className="flex-1 py-3 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all active:scale-95 cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
            <span>Recapカードを画像保存・共有</span>
          </button>
          <button
            type="button"
            onClick={() => setWrappedModalOpen(false)}
            className="px-4 py-3 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 font-bold text-xs rounded-xl border border-neutral-800 transition-colors cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

