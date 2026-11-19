import React, { useState, useEffect } from 'react';
import {
  X,
  Users,
  Check,
  Plus,
  Play,
  Music,
  Share2,
  Trash2,
  Search,
  Loader2,
  Save,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { Track } from '../types/music';
import { SafeImage } from './SafeImage';
import { api } from '../services/api';

interface CollabPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CollabMember {
  name: string;
  isHost?: boolean;
}

const COLLAB_STORAGE_KEY = 'zero_music_collab_draft_v1';

export const CollabPlaylistModal: React.FC<CollabPlaylistModalProps> = ({ isOpen, onClose }) => {
  const {
    currentTrack,
    likedTracks,
    recentTracks,
    playTrack,
    currentUser,
    createUserPlaylist,
    updateUserPlaylist,
    userPlaylists,
    showToast,
    setLibraryTab,
    navigateTo,
  } = usePlayer();

  const [roomCode, setRoomCode] = useState<string>(
    () => `COLLAB-${Math.floor(1000 + Math.random() * 9000)}`
  );
  const [copied, setCopied] = useState<boolean>(false);
  const [playlistTitle, setPlaylistTitle] = useState<string>('共同編集プレイリスト');
  const [linkedPlaylistId, setLinkedPlaylistId] = useState<string | null>(null);
  const [members, setMembers] = useState<CollabMember[]>([
    { name: currentUser?.username || 'あなた', isHost: true },
  ]);
  const [newMemberName, setNewMemberName] = useState('');
  const [collabTracks, setCollabTracks] = useState<Track[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let pendingCode: string | null = null;
    try {
      pendingCode = sessionStorage.getItem('zero_music_pending_collab_code');
      if (pendingCode) {
        sessionStorage.removeItem('zero_music_pending_collab_code');
      }
    } catch {}

    if (pendingCode) {
      setRoomCode(pendingCode);
      const matched = userPlaylists.find((p) => p.collabCode === pendingCode);
      if (matched) {
        setLinkedPlaylistId(matched.id);
        setPlaylistTitle(matched.name);
        setCollabTracks(matched.tracks);
        setMembers(
          (matched.collabMembers || [currentUser?.username || 'あなた']).map((n, i) => ({
            name: n,
            isHost: i === 0,
          }))
        );
        return;
      }
    }

    try {
      const savedRaw = localStorage.getItem(COLLAB_STORAGE_KEY);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        if (parsed && Array.isArray(parsed.tracks) && parsed.tracks.length > 0) {
          setPlaylistTitle(parsed.title || '共同編集プレイリスト');
          if (!pendingCode && parsed.roomCode) setRoomCode(parsed.roomCode);
          setCollabTracks(parsed.tracks);
          if (Array.isArray(parsed.members) && parsed.members.length > 0) {
            setMembers(parsed.members);
          }
          if (parsed.linkedPlaylistId) setLinkedPlaylistId(parsed.linkedPlaylistId);
          return;
        }
      }
    } catch {}

    // Seed with real tracks from current playback / favorites / history
    const seedPool = [
      ...(currentTrack ? [currentTrack] : []),
      ...likedTracks,
      ...recentTracks,
    ];
    const unique: Track[] = [];
    const seen = new Set<string>();
    for (const t of seedPool) {
      if (t?.id && !seen.has(t.id)) {
        seen.add(t.id);
        unique.push(t);
        if (unique.length >= 4) break;
      }
    }
    setCollabTracks(unique);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    try {
      localStorage.setItem(
        COLLAB_STORAGE_KEY,
        JSON.stringify({
          roomCode,
          title: playlistTitle,
          members,
          tracks: collabTracks,
          linkedPlaylistId,
        })
      );
    } catch {}
  }, [isOpen, roomCode, playlistTitle, members, collabTracks, linkedPlaylistId]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    const shareUrl = `${window.location.origin}/?collab=${encodeURIComponent(roomCode)}`;
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    setCopied(true);
    showToast('共同編集の招待URLをコピーしました', 'success', 2200);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddTrack = (track: Track) => {
    if (collabTracks.some((t) => t.id === track.id)) {
      showToast('すでに追加されています', 'info', 1600);
      return;
    }
    setCollabTracks((prev) => [...prev, track]);
    showToast(`「${track.title}」を追加しました`, 'success', 1600);
  };

  const handleRemoveTrack = (id: string) => {
    setCollabTracks((prev) => prev.filter((t) => t.id !== id));
  };

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newMemberName.trim();
    if (!name) return;
    if (members.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      setNewMemberName('');
      return;
    }
    setMembers((prev) => [...prev, { name }]);
    setNewMemberName('');
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchTerm.trim();
    if (!q) return;
    setSearching(true);
    try {
      const res = await api.search(q, 'song');
      const list: Track[] = res?.results || res?.songs || [];
      setSearchResults(list.slice(0, 6));
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSaveToLibrary = () => {
    const title = playlistTitle.trim() || '共同編集プレイリスト';
    const memberNames = members.map((m) => m.name);

    const existing = linkedPlaylistId
      ? userPlaylists.find((p) => p.id === linkedPlaylistId)
      : null;

    if (existing) {
      updateUserPlaylist(existing.id, {
        name: title,
        isCollab: true,
        collabCode: roomCode,
        collabMembers: memberNames,
      });
    } else {
      const created = createUserPlaylist(title, {
        description: `コラボ招待コード: ${roomCode} · メンバー ${memberNames.length}人`,
        tracks: collabTracks,
        isCollab: true,
        collabCode: roomCode,
        collabMembers: memberNames,
      });
      if (created) {
        setLinkedPlaylistId(created.id);
      }
    }
    showToast(`コラボプレイリスト「${title}」をライブラリに保存しました`, 'success', 2600, {
      label: 'ライブラリへ',
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
        className="bg-[#121216] border border-white/10 rounded-3xl w-full max-w-xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>コラボプレイリスト</span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-red-600/20 text-red-300 border border-red-500/40 font-bold">
                  共同編集
                </span>
              </h3>
              <p className="text-xs text-neutral-400">
                友達と一緒に1つのプレイリストを作成・共有
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
          {/* Room Banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-red-950/50 to-neutral-900 border border-red-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <input
                type="text"
                value={playlistTitle}
                onChange={(e) => setPlaylistTitle(e.target.value)}
                placeholder="プレイリスト名..."
                className="w-full bg-transparent font-bold text-sm sm:text-base text-white focus:outline-none border-b border-white/10 focus:border-red-500 pb-0.5"
              />
              <p className="text-xs text-neutral-400 mt-1.5">
                招待コード: <span className="font-mono text-red-400 font-bold">{roomCode}</span>
              </p>
            </div>

            <button
              type="button"
              onClick={handleCopyLink}
              className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-100 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors shrink-0 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-red-400" />
                  <span className="text-red-300">コピー済み</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 text-red-400" />
                  <span>招待リンクをコピー</span>
                </>
              )}
            </button>
          </div>

          {/* Collaborators */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-neutral-400">
                参加メンバー ({members.length}人)
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {members.map((m) => (
                <div
                  key={m.name}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-800 border border-white/10 text-xs text-neutral-200"
                >
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="font-medium">{m.name}</span>
                  {m.isHost && (
                    <span className="text-[9px] px-1 bg-red-600/30 text-red-300 rounded font-bold">
                      HOST
                    </span>
                  )}
                </div>
              ))}
              <form onSubmit={handleAddMember} className="flex items-center gap-1">
                <input
                  type="text"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="+ メンバー名を追加"
                  className="bg-neutral-950 border border-white/10 rounded-full px-3 py-1 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500 w-36"
                />
                {newMemberName.trim() && (
                  <button
                    type="submit"
                    className="px-2.5 py-1 rounded-full bg-red-600 text-white text-xs font-bold cursor-pointer"
                  >
                    追加
                  </button>
                )}
              </form>
            </div>
          </div>

          {/* Search Songs to Add */}
          <div className="space-y-2.5">
            <form onSubmit={handleSearch} className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="曲名やアーティストで検索して追加..."
                  className="w-full bg-neutral-950 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-red-500"
                />
              </div>
              <button
                type="submit"
                disabled={searching}
                className="px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold cursor-pointer shrink-0"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : '検索'}
              </button>
            </form>

            {searchResults.length > 0 && (
              <div className="bg-neutral-950 border border-white/10 rounded-2xl divide-y divide-white/5 max-h-44 overflow-y-auto">
                {searchResults.map((tr) => (
                  <div
                    key={tr.id}
                    className="flex items-center justify-between gap-2.5 px-3 py-2 hover:bg-white/5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <SafeImage
                        src={tr.thumbnail}
                        alt={tr.title}
                        useBase64
                        className="w-8 h-8 rounded object-cover bg-neutral-800 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{tr.title}</p>
                        <p className="text-[11px] text-neutral-400 truncate">{tr.artist}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddTrack(tr)}
                      className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>追加</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Collaborative Track List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-xs font-bold text-neutral-300 flex items-center gap-2">
                <Music className="w-4 h-4 text-red-400" />
                <span>楽曲リスト ({collabTracks.length}曲)</span>
              </h4>

              <div className="flex items-center gap-2">
                {currentTrack && (
                  <button
                    type="button"
                    onClick={() => handleAddTrack(currentTrack)}
                    className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-white/10 text-[11px] font-semibold rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3 text-red-400" />
                    <span>再生中の曲を追加</span>
                  </button>
                )}
                {collabTracks.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      playTrack(collabTracks[0], collabTracks, {
                        source: 'コラボプレイリストから再生中',
                        subtitle: playlistTitle,
                      })
                    }
                    className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>再生</span>
                  </button>
                )}
              </div>
            </div>

            {collabTracks.length === 0 ? (
              <div className="py-8 text-center text-xs text-neutral-500 bg-neutral-950/60 border border-white/5 rounded-2xl">
                上の検索バーや「再生中の曲を追加」から曲を追加できます
              </div>
            ) : (
              <div className="bg-neutral-950/70 border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/5 max-h-56 overflow-y-auto">
                {collabTracks.map((track, idx) => (
                  <div
                    key={track.id}
                    className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-white/5 transition-colors group"
                  >
                    <span className="w-5 text-center text-xs font-mono text-neutral-500">
                      {idx + 1}
                    </span>
                    <SafeImage
                      src={track.thumbnail}
                      alt={track.title}
                      useBase64
                      className="w-9 h-9 rounded-lg object-cover bg-neutral-900 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p
                        onClick={() =>
                          playTrack(track, collabTracks, {
                            source: 'コラボプレイリストから再生中',
                            subtitle: playlistTitle,
                          })
                        }
                        className="text-xs font-semibold text-white truncate cursor-pointer hover:underline"
                      >
                        {track.title}
                      </p>
                      <p className="text-[11px] text-neutral-400 truncate">{track.artist}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveTrack(track.id)}
                      className="p-1.5 text-neutral-500 hover:text-red-400 rounded transition-colors cursor-pointer"
                      title="リストから削除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/10 bg-[#0d0d10] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-neutral-400 hover:text-white cursor-pointer"
          >
            閉じる
          </button>
          <button
            type="button"
            onClick={handleSaveToLibrary}
            className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-red-600/20 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>マイライブラリに保存</span>
          </button>
        </div>
      </div>
    </div>
  );
};
