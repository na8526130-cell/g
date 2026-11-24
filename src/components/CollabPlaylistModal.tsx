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
  Sparkles,
  Blend,
  RefreshCw,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { Track } from '../types/music';
import { SafeImage } from './SafeImage';
import { api } from '../services/api';
import { socialSocket } from '../services/socialSocket';

interface CollabPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CollabMember {
  name: string;
  isHost?: boolean;
}

export const CollabPlaylistModal: React.FC<CollabPlaylistModalProps> = ({ isOpen, onClose }) => {
  const {
    currentTrack,
    likedTracks,
    recentTracks,
    playTrack,
    currentUser,
    createUserPlaylist,
    updateUserPlaylist,
    saveTracksAsPlaylist,
    userPlaylists,
    showToast,
    setLibraryTab,
    navigateTo,
  } = usePlayer();

  const [tab, setTab] = useState<'collab' | 'blend'>('collab');

  // Collab state (live synced to /api/collab/playlists/:code & WS)
  const [roomCode, setRoomCode] = useState<string>(
    () => `COLLAB-${Math.floor(1000 + Math.random() * 9000)}`
  );
  const [joinCodeInput, setJoinCodeInput] = useState('');
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
  const [syncingCollab, setSyncingCollab] = useState(false);

  // Blend state
  const [friendUsername, setFriendUsername] = useState('');
  const [blendLoading, setBlendLoading] = useState(false);
  const [blendResult, setBlendResult] = useState<{
    title: string;
    description: string;
    tasteMatchPercent: number;
    sharedArtistsCount: number;
    tracks: Track[];
  } | null>(null);

  const actorName = currentUser?.username || 'ゲスト';

  const loadCollabFromServer = async (code: string) => {
    setSyncingCollab(true);
    try {
      const res = await api.getCollabPlaylist(code);
      if (res?.playlist) {
        const pl = res.playlist;
        setPlaylistTitle(pl.title || '共同編集プレイリスト');
        setCollabTracks(Array.isArray(pl.tracks) ? pl.tracks : []);
        if (Array.isArray(pl.members) && pl.members.length > 0) {
          setMembers(pl.members.map((m, i) => ({ name: m, isHost: i === 0 })));
        }
        socialSocket.subscribeCollab(code);
        return;
      }
    } catch {
    } finally {
      setSyncingCollab(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    let activeCode = roomCode;
    try {
      const pendingCode = sessionStorage.getItem('zero_music_pending_collab_code');
      if (pendingCode) {
        sessionStorage.removeItem('zero_music_pending_collab_code');
        activeCode = pendingCode.toUpperCase();
        setRoomCode(activeCode);
      }
    } catch {}

    setJoinCodeInput(activeCode);
    loadCollabFromServer(activeCode);

    const unsub = socialSocket.on('collab:updated', (payload: any) => {
      if (!payload?.playlist) return;
      if (payload.playlist.code !== activeCode && payload.playlist.code !== roomCode) return;
      const pl = payload.playlist;
      setPlaylistTitle(pl.title || '共同編集プレイリスト');
      setCollabTracks(Array.isArray(pl.tracks) ? pl.tracks : []);
      if (Array.isArray(pl.members) && pl.members.length > 0) {
        setMembers(pl.members.map((m: string, i: number) => ({ name: m, isHost: i === 0 })));
      }
    });

    return () => {
      unsub();
    };
  }, [isOpen, roomCode]);

  if (!isOpen) return null;

  const handleJoinRoomCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = joinCodeInput.trim().toUpperCase();
    if (!clean) return;
    setRoomCode(clean);
    await api
      .mutateCollabPlaylist(clean, { action: 'join', username: actorName })
      .catch(() => {});
    await loadCollabFromServer(clean);
    showToast(`共同編集ルーム ${clean} に参加しました`, 'success', 2200);
  };

  const handleCopyLink = () => {
    const shareUrl = `${window.location.origin}/?collab=${encodeURIComponent(roomCode)}`;
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    setCopied(true);
    showToast('共同編集の招待URLをコピーしました', 'success', 2200);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddTrack = async (track: Track) => {
    if (collabTracks.some((t) => t.id === track.id)) {
      showToast('すでに追加されています', 'info', 1600);
      return;
    }
    const enriched: Track = { ...track, addedBy: actorName };
    setCollabTracks((prev) => [...prev, enriched]);
    try {
      const res = await api.mutateCollabPlaylist(roomCode, {
        action: 'add_track',
        track: enriched,
        username: actorName,
      });
      if (res?.playlist) {
        setCollabTracks(res.playlist.tracks || []);
      }
    } catch {}
    showToast(`「${track.title}」を共同リストに追加しました`, 'success', 1600);
  };

  const handleRemoveTrack = async (id: string) => {
    setCollabTracks((prev) => prev.filter((t) => t.id !== id));
    try {
      const res = await api.mutateCollabPlaylist(roomCode, {
        action: 'remove_track',
        trackId: id,
        username: actorName,
      });
      if (res?.playlist) {
        setCollabTracks(res.playlist.tracks || []);
      }
    } catch {}
  };

  const handleTitleBlur = async () => {
    const cleanTitle = playlistTitle.trim() || '共同編集プレイリスト';
    try {
      await api.mutateCollabPlaylist(roomCode, {
        action: 'rename',
        title: cleanTitle,
        username: actorName,
      });
    } catch {}
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newMemberName.trim();
    if (!name) return;
    if (!members.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      setMembers((prev) => [...prev, { name }]);
      api.mutateCollabPlaylist(roomCode, { action: 'join', username: name }).catch(() => {});
    }
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
        tracks: collabTracks,
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

  const handleGenerateBlend = async (e: React.FormEvent) => {
    e.preventDefault();
    setBlendLoading(true);
    try {
      const userPool = [
        ...(currentTrack ? [currentTrack] : []),
        ...likedTracks,
        ...recentTracks,
      ].slice(0, 30);

      const res = await api.createFriendBlend({
        userAName: actorName,
        userATracks: userPool,
        friendUsername: friendUsername.trim() || undefined,
      });

      setBlendResult({
        title: res.blendTitle,
        description: `${res.userA} × ${res.userB} の共通アーティスト・好みから自動ブレンド${
          res.friendFoundInCloud ? '' : '（コミュニティ楽曲補完）'
        }`,
        tasteMatchPercent: res.tasteMatchPercent,
        sharedArtistsCount: res.sharedArtistsCount,
        tracks: res.tracks || [],
      });
    } catch (err: any) {
      showToast(err?.message || 'Blendの作成に失敗しました', 'warning', 2500);
    } finally {
      setBlendLoading(false);
    }
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
              {tab === 'collab' ? <Users className="w-5 h-5" /> : <Blend className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>{tab === 'collab' ? 'コラボプレイリスト' : 'フレンド Blend ミックス'}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-red-600/20 text-red-300 border border-red-500/40 font-bold">
                  {tab === 'collab' ? 'リアルタイム共同編集' : '相性マッチ'}
                </span>
              </h3>
              <p className="text-xs text-neutral-400">
                {tab === 'collab'
                  ? '同じコードの友達とリアルタイムで曲を追加・共有'
                  : 'あなたと友達の好きな曲を融合した自動ミックスを生成'}
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

        {/* Mode Tabs */}
        <div className="px-5 pt-3">
          <div className="grid grid-cols-2 gap-2 p-1 bg-neutral-900 rounded-xl border border-neutral-800">
            <button
              type="button"
              onClick={() => setTab('collab')}
              className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                tab === 'collab' ? 'bg-red-600 text-white' : 'text-neutral-300 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>共同編集プレイリスト</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('blend')}
              className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                tab === 'blend' ? 'bg-purple-600 text-white' : 'text-neutral-300 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>フレンド Blend</span>
            </button>
          </div>
        </div>

        {/* Content */}
        {tab === 'collab' ? (
          <div className="p-5 overflow-y-auto space-y-5 flex-1">
            {/* Join Existing Room Code */}
            <form onSubmit={handleJoinRoomCode} className="flex items-center gap-2">
              <input
                type="text"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="友達のコード (例: COLLAB-1234)"
                className="flex-1 bg-neutral-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-neutral-500 focus:outline-none focus:border-red-500"
              />
              <button
                type="submit"
                className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-white cursor-pointer shrink-0"
              >
                コードに参加
              </button>
              <button
                type="button"
                onClick={() => loadCollabFromServer(roomCode)}
                className="p-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 cursor-pointer shrink-0"
                title="同期更新"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingCollab ? 'animate-spin' : ''}`} />
              </button>
            </form>

            {/* Room Banner */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-red-950/50 to-neutral-900 border border-red-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <input
                  type="text"
                  value={playlistTitle}
                  onChange={(e) => setPlaylistTitle(e.target.value)}
                  onBlur={handleTitleBlur}
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
                        <p className="text-[11px] text-neutral-400 truncate">
                          {track.artist}
                          {track.addedBy ? ` · 追加: ${track.addedBy}` : ''}
                        </p>
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
        ) : (
          <div className="p-5 overflow-y-auto space-y-5 flex-1">
            <form onSubmit={handleGenerateBlend} className="space-y-3">
              <label className="block text-xs font-bold text-neutral-300">
                フレンドのユーザー名（空欄なら「あなた × トレンド発見Blend」を生成）
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={friendUsername}
                  onChange={(e) => setFriendUsername(e.target.value)}
                  placeholder="例: friend_name（任意）"
                  className="flex-1 bg-neutral-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500"
                />
                <button
                  type="submit"
                  disabled={blendLoading}
                  className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60 shrink-0"
                >
                  {blendLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>Blendを作成</span>
                </button>
              </div>
            </form>

            {blendResult && (
              <div className="rounded-2xl bg-neutral-950/70 border border-purple-500/30 overflow-hidden">
                <div className="p-4 bg-gradient-to-r from-purple-950/60 to-red-950/40 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-purple-300 bg-purple-500/20 border border-purple-500/30 px-2 py-0.5 rounded-md">
                        音楽テイスト一致度 {blendResult.tasteMatchPercent}%
                      </span>
                      {blendResult.sharedArtistsCount > 0 && (
                        <span className="text-[11px] text-neutral-300">
                          共通アーティスト {blendResult.sharedArtistsCount}組
                        </span>
                      )}
                    </div>
                    <h4 className="text-base font-extrabold text-white mt-1.5">{blendResult.title}</h4>
                    <p className="text-xs text-neutral-300 mt-0.5">{blendResult.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        blendResult.tracks.length > 0 &&
                        playTrack(blendResult.tracks[0], blendResult.tracks, {
                          source: 'フレンド Blend ミックス',
                          subtitle: blendResult.title,
                        })
                      }
                      className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>再生</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        saveTracksAsPlaylist(blendResult.title, blendResult.tracks, blendResult.description);
                        showToast(`「${blendResult.title}」をライブラリに保存しました`, 'success', 2400);
                      }}
                      className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-bold cursor-pointer"
                    >
                      保存
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-white/5 max-h-64 overflow-y-auto">
                  {blendResult.tracks.map((tr, i) => (
                    <button
                      key={`${tr.id}-${i}`}
                      type="button"
                      onClick={() =>
                        playTrack(tr, blendResult.tracks, {
                          source: 'フレンド Blend ミックス',
                          subtitle: blendResult.title,
                        })
                      }
                      className="w-full px-3.5 py-2.5 flex items-center gap-3 hover:bg-white/5 text-left cursor-pointer"
                    >
                      <SafeImage
                        src={tr.thumbnail}
                        alt={tr.title}
                        useBase64
                        className="w-9 h-9 rounded-lg object-cover bg-neutral-900 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white truncate">{tr.title}</p>
                        <p className="text-[11px] text-neutral-400 truncate">
                          {tr.artist}
                          {tr.addedBy ? ` · Pick: ${tr.addedBy}` : ''}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/10 bg-[#0d0d10] flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-neutral-400 hover:text-white cursor-pointer"
          >
            閉じる
          </button>
          {tab === 'collab' && (
            <button
              type="button"
              onClick={handleSaveToLibrary}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-red-600/20 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>マイライブラリに保存</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
