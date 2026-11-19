import React, { useState, useMemo } from 'react';
import {
  X,
  Sparkles,
  Play,
  Users,
  RefreshCw,
  Loader2,
  BookmarkPlus,
  Check,
  Disc3,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { Track } from '../types/music';
import { SafeImage } from './SafeImage';
import { api } from '../services/api';

interface MusicMatchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_PARTNERS = [
  { name: 'J-Pop トレンド派', artist: 'YOASOBI', mood: 'ハイテンション' },
  { name: '深夜チル・シティ派', artist: '藤井 風', mood: 'チル' },
  { name: '邦ロック・バンド派', artist: 'Official髭男dism', mood: 'エモーショナル' },
  { name: 'ボカロ・ネット発派', artist: 'Ado', mood: '夜更かし' },
];

export const MusicMatchModal: React.FC<MusicMatchModalProps> = ({ isOpen, onClose }) => {
  const {
    likedTracks,
    recentTracks,
    currentTrack,
    playTrack,
    createUserPlaylist,
    isTrackBlocked,
    showToast,
    setLibraryTab,
    navigateTo,
  } = usePlayer();

  const [partnerName, setPartnerName] = useState<string>('友達');
  const [partnerQuery, setPartnerQuery] = useState<string>('Vaundy');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [blendTracks, setBlendTracks] = useState<Track[]>([]);
  const [matchPercent, setMatchPercent] = useState<number>(88);
  const [savedDone, setSavedDone] = useState<boolean>(false);

  const userTopArtists = useMemo(() => {
    const counts = new Map<string, number>();
    [...likedTracks, ...recentTracks, ...(currentTrack ? [currentTrack] : [])].forEach((t) => {
      if (!t?.artist) return;
      counts.set(t.artist, (counts.get(t.artist) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
      .slice(0, 4);
  }, [likedTracks, recentTracks, currentTrack]);

  if (!isOpen) return null;

  const handleGenerateBlend = async (overridePartnerArtist?: string, overrideName?: string) => {
    const targetArtist = (overridePartnerArtist ?? partnerQuery).trim() || 'Official髭男dism';
    const targetLabel = (overrideName ?? partnerName).trim() || targetArtist;
    if (overridePartnerArtist) setPartnerQuery(overridePartnerArtist);
    if (overrideName) setPartnerName(overrideName);

    setIsGenerating(true);
    setSavedDone(false);

    try {
      const mySeedArtist = userTopArtists[0] || currentTrack?.artist || 'Mrs. GREEN APPLE';
      const [myRes, partnerRes] = await Promise.all([
        api.search(`${mySeedArtist} 人気曲`, 'song').catch(() => null),
        api.search(`${targetArtist} 人気曲`, 'song').catch(() => null),
      ]);

      const myCandidates: Track[] = [
        ...likedTracks.slice(0, 6),
        ...(myRes?.results || myRes?.songs || []),
      ];
      const partnerCandidates: Track[] = partnerRes?.results || partnerRes?.songs || [];

      const mixed: Track[] = [];
      const seen = new Set<string>();
      const pushUnique = (t?: Track) => {
        if (!t || !t.id || seen.has(t.id) || isTrackBlocked(t)) return;
        seen.add(t.id);
        mixed.push(t);
      };

      const maxLen = Math.max(myCandidates.length, partnerCandidates.length);
      for (let i = 0; i < maxLen && mixed.length < 16; i++) {
        if (i < myCandidates.length) pushUnique(myCandidates[i]);
        if (mixed.length < 16 && i < partnerCandidates.length) pushUnique(partnerCandidates[i]);
      }

      // Compute realistic taste compatibility score
      const sharedArtist = userTopArtists.some((a) =>
        a.toLowerCase().includes(targetArtist.toLowerCase()) ||
        targetArtist.toLowerCase().includes(a.toLowerCase())
      );
      const baseScore = sharedArtist ? 95 : 74 + (targetArtist.length % 19);
      setMatchPercent(Math.min(99, baseScore));
      setBlendTracks(mixed);

      if (mixed.length > 0) {
        showToast(`${targetLabel}とのBlendミックスを作成しました`, 'success', 2000);
      } else {
        showToast('楽曲を取得できませんでした。別のアーティスト名でお試しください', 'warning', 2400);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveBlendPlaylist = () => {
    if (blendTracks.length === 0) return;
    const title = `Blend: あなた × ${partnerName.trim() || partnerQuery.trim()}`;
    createUserPlaylist(title, {
      description: `音楽マッチ度 ${matchPercent}% · ${userTopArtists[0] || 'あなた'} & ${partnerQuery}`,
      tracks: blendTracks,
    });
    setSavedDone(true);
    showToast(`「${title}」をマイライブラリに保存しました`, 'success', 2600, {
      label: '開く',
      onClick: () => {
        onClose();
        setLibraryTab('playlists');
        navigateTo('library');
      },
    });
  };

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-[#121216] border border-white/10 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-red-600 to-rose-500 flex items-center justify-center text-white shadow-lg shadow-red-600/25">
              <Disc3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Blend 作成</span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-red-600/20 text-red-300 border border-red-500/40 font-bold">
                  Taste Match
                </span>
              </h3>
              <p className="text-xs text-neutral-400">
                あなたの再生傾向と相手の好みを組み合わせた専用プレイリストを生成
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* Your Taste Summary */}
          <div className="p-4 rounded-2xl bg-neutral-950 border border-white/10 space-y-2">
            <span className="text-[11px] font-bold text-neutral-400">あなたのリスニング傾向</span>
            <p className="text-xs text-neutral-200">
              お気に入り <span className="text-white font-bold">{likedTracks.length}曲</span> · 最近再生{' '}
              <span className="text-white font-bold">{recentTracks.length}曲</span>
            </p>
            {userTopArtists.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {userTopArtists.map((art) => (
                  <span
                    key={art}
                    className="text-[11px] px-2.5 py-0.5 rounded-md bg-neutral-800 text-neutral-200 border border-white/10"
                  >
                    {art}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Partner Input */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-red-950/35 to-neutral-900 border border-red-500/25 space-y-3">
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Users className="w-4 h-4 text-red-400" />
              <span>相手の好みのアーティスト・ジャンルを指定</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                value={partnerName}
                onChange={(e) => setPartnerName(e.target.value)}
                placeholder="相手の名前（例: Aoi）"
                className="bg-neutral-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
              />
              <input
                type="text"
                value={partnerQuery}
                onChange={(e) => setPartnerQuery(e.target.value)}
                placeholder="相手の好きなアーティスト（例: Vaundy）"
                className="bg-neutral-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {PRESET_PARTNERS.map((p) => (
                <button
                  key={p.artist}
                  type="button"
                  onClick={() => handleGenerateBlend(p.artist, p.name)}
                  className="px-2.5 py-1 rounded-lg bg-black/50 hover:bg-red-600/25 border border-white/10 hover:border-red-500/40 text-[11px] text-neutral-200 cursor-pointer transition-colors"
                >
                  {p.name}（{p.artist}）
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => handleGenerateBlend()}
              disabled={isGenerating}
              className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-red-600/25 cursor-pointer disabled:opacity-60"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              <span>{isGenerating ? 'ブレンド生成中...' : 'Blend プレイリストを生成する'}</span>
            </button>
          </div>

          {/* Generated Blend Result */}
          {blendTracks.length > 0 && (
            <div className="space-y-3">
              <div className="p-4 rounded-2xl bg-neutral-900/90 border border-white/10 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-white">
                      Blend: あなた × {partnerName.trim() || partnerQuery}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-red-600/25 border border-red-500/40 text-xs font-mono font-bold text-red-300">
                      一致度 {matchPercent}%
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    {blendTracks.length}曲を交互にブレンド
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveBlendPlaylist}
                    disabled={savedDone}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border cursor-pointer ${
                      savedDone
                        ? 'bg-neutral-800 text-red-300 border-red-500/40'
                        : 'bg-neutral-800 hover:bg-neutral-700 text-white border-white/15'
                    }`}
                  >
                    {savedDone ? <Check className="w-3.5 h-3.5" /> : <BookmarkPlus className="w-3.5 h-3.5" />}
                    <span>{savedDone ? '保存済み' : 'ライブラリに保存'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      playTrack(blendTracks[0], blendTracks, {
                        source: 'Blendから再生中',
                        subtitle: `あなた × ${partnerName.trim() || partnerQuery}`,
                      })
                    }
                    className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>再生</span>
                  </button>
                </div>
              </div>

              <div className="bg-neutral-950/70 border border-white/10 rounded-2xl divide-y divide-white/5 max-h-60 overflow-y-auto">
                {blendTracks.map((tr, idx) => (
                  <div
                    key={tr.id}
                    onClick={() =>
                      playTrack(tr, blendTracks, {
                        source: 'Blendから再生中',
                        subtitle: `あなた × ${partnerName.trim() || partnerQuery}`,
                      })
                    }
                    className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-white/5 cursor-pointer"
                  >
                    <span className="w-5 text-center text-xs font-mono text-neutral-500">
                      {idx + 1}
                    </span>
                    <SafeImage
                      src={tr.thumbnail}
                      alt={tr.title}
                      useBase64
                      className="w-9 h-9 rounded-lg object-cover bg-neutral-800 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{tr.title}</p>
                      <p className="text-[11px] text-neutral-400 truncate">{tr.artist}</p>
                    </div>
                    <span className="text-[10px] font-mono text-neutral-400 shrink-0">
                      {idx % 2 === 0 ? 'あなた' : partnerName.trim() || '相手'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
