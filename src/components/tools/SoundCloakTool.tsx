import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Disc3,
  Download,
  Loader2,
  Pause,
  Play,
  Radio,
  Search,
  Sparkles,
  User,
} from 'lucide-react';
import { usePlayer } from '../../context/PlayerContext';

interface ScTrack {
  id: string;
  title: string;
  artist: string;
  artwork: string;
  genre: string;
  durationMs: number;
  playbackCount: number;
  likesCount: number;
  policy: string;
  trackAuthorization: string;
  transcodingUrl: string;
  transcodingProtocol: string;
}

function formatMs(ms: number): string {
  const sec = Math.max(0, Math.floor((ms || 0) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const SoundCloakTool: React.FC = () => {
  const { isPlaying: mainIsPlaying, togglePlay: toggleMainPlay } = usePlayer();
  const [query, setQuery] = useState('');
  const [searchKind, setSearchKind] = useState<'tracks' | 'playlists' | 'users'>('tracks');
  const [tracks, setTracks] = useState<ScTrack[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTrack, setActiveTrack] = useState<ScTrack | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isScPlaying, setIsScPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const loadDiscover = async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/tools/soundcloak/discover');
      const data = await resp.json();
      if (!data.success) throw new Error(data.error || 'SoundCloudフィードを取得できませんでした');
      setTracks(data.tracks || []);
      setSearchKind('tracks');
    } catch (e: any) {
      setError(e?.message || '読み込みエラー');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDiscover();
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      await loadDiscover();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(
        `/api/tools/soundcloak/search?q=${encodeURIComponent(trimmed)}&kind=${searchKind}`
      );
      const data = await resp.json();
      if (!data.success) throw new Error(data.error || '検索に失敗しました');
      if (searchKind === 'tracks') setTracks(data.tracks || []);
      else if (searchKind === 'users') setUsers(data.users || []);
      else setPlaylists(data.playlists || []);
    } catch (e: any) {
      setError(e?.message || '検索エラー');
    } finally {
      setLoading(false);
    }
  };

  const downloadTrack = async (track: ScTrack) => {
    if (downloadingId) return;
    setDownloadingId(track.id);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (track.id) params.set('id', track.id);
      if (track.transcodingUrl) params.set('transcodingUrl', track.transcodingUrl);
      if (track.trackAuthorization) params.set('auth', track.trackAuthorization);
      if (track.transcodingProtocol) params.set('protocol', track.transcodingProtocol);
      if (track.title) params.set('title', track.title);
      if (track.artist) params.set('artist', track.artist);

      const resp = await fetch(`/api/tools/soundcloak/download?${params.toString()}`);
      if (!resp.ok) {
        const errData = await resp.json().catch(() => null);
        throw new Error(errData?.error || `ダウンロードに失敗しました (HTTP ${resp.status})`);
      }

      const blob = await resp.blob();
      const ct = (resp.headers.get('content-type') || blob.type || '').toLowerCase();
      const ext = ct.includes('mp4') || ct.includes('aac') ? 'm4a' : ct.includes('ogg') ? 'ogg' : 'mp3';
      const safeName = `${track.artist ? `${track.artist} - ` : ''}${track.title || 'soundcloak-track'}`
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .trim();

      const objUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objUrl;
      link.download = `${safeName}.${ext}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
    } catch (e: any) {
      setError(e?.message || 'ダウンロードに失敗しました');
    } finally {
      setDownloadingId(null);
    }
  };

  const playScTrack = async (track: ScTrack) => {
    if (activeTrack?.id === track.id && audioRef.current) {
      if (audioRef.current.paused) {
        if (mainIsPlaying) toggleMainPlay();
        await audioRef.current.play().catch(() => {});
      } else {
        audioRef.current.pause();
      }
      return;
    }

    setResolvingId(track.id);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (track.transcodingUrl) params.set('transcodingUrl', track.transcodingUrl);
      if (track.trackAuthorization) params.set('auth', track.trackAuthorization);
      if (track.transcodingProtocol) params.set('protocol', track.transcodingProtocol);
      if (track.id) params.set('id', track.id);

      const resp = await fetch(`/api/tools/soundcloak/stream?${params.toString()}`);
      const data = await resp.json();
      if (!data.success || !data.playUrl) {
        throw new Error(data.error || 'ストリームを解決できませんでした');
      }

      if (mainIsPlaying) {
        toggleMainPlay();
      }

      setActiveTrack(track);

      const audio = audioRef.current;
      if (!audio) return;

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      if (data.isHls && Hls.isSupported()) {
        const hls = new Hls();
        hlsRef.current = hls;
        hls.loadSource(data.playUrl);
        hls.attachMedia(audio);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          audio.play().catch(() => {});
        });
      } else {
        audio.src = data.playUrl;
        await audio.play().catch(() => {});
      }
    } catch (e: any) {
      setError(e?.message || '再生に失敗しました');
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Search & Kind Switcher */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-[#101014] border border-neutral-800/90 rounded-2xl p-3">
        <form onSubmit={handleSearch} className="flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="SoundCloudの楽曲・リミックス・アーティストを検索..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-orange-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors cursor-pointer shrink-0"
          >
            検索
          </button>
        </form>

        <div className="flex items-center gap-1.5 bg-neutral-950 p-1 rounded-xl border border-neutral-800 shrink-0">
          {(
            [
              { id: 'tracks', label: '楽曲' },
              { id: 'playlists', label: 'プレイリスト' },
              { id: 'users', label: 'ユーザー' },
            ] as const
          ).map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setSearchKind(k.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                searchKind === k.id
                  ? 'bg-neutral-800 text-white'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              {k.label}
            </button>
          ))}
          <button
            type="button"
            onClick={loadDiscover}
            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-orange-400 hover:bg-orange-500/10 transition-colors cursor-pointer flex items-center gap-1"
            title="注目トラックを更新"
          >
            <Sparkles className="w-3.5 h-3.5" />
            注目
          </button>
        </div>
      </div>

      {/* Inline SoundCloak Audio Deck */}
      <audio
        ref={audioRef}
        onPlay={() => setIsScPlaying(true)}
        onPause={() => setIsScPlaying(false)}
        onEnded={() => setIsScPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
      />

      {activeTrack && (
        <div className="bg-gradient-to-r from-[#181210] to-[#111115] border border-orange-500/30 rounded-2xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
            {activeTrack.artwork ? (
              <img
                src={activeTrack.artwork}
                alt={activeTrack.title}
                className="w-12 h-12 rounded-xl object-cover shrink-0 bg-neutral-900"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-neutral-800 flex items-center justify-center shrink-0">
                <Disc3 className="w-6 h-6 text-orange-400" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-white truncate">{activeTrack.title}</div>
              <div className="text-xs text-neutral-400 truncate">
                {activeTrack.artist} {activeTrack.genre ? `• ${activeTrack.genre}` : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto sm:min-w-[280px]">
            <button
              type="button"
              onClick={() => playScTrack(activeTrack)}
              className="w-9 h-9 rounded-full bg-orange-500 hover:bg-orange-400 text-black flex items-center justify-center shrink-0 cursor-pointer"
            >
              {isScPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
            </button>
            <input
              type="range"
              min={0}
              max={duration || Math.max(1, activeTrack.durationMs / 1000)}
              value={currentTime}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (audioRef.current) audioRef.current.currentTime = v;
                setCurrentTime(v);
              }}
              className="flex-1 accent-orange-500 cursor-pointer"
            />
            <span className="text-[11px] font-mono text-neutral-400 shrink-0">
              {formatMs(currentTime * 1000)}
            </span>
            <button
              type="button"
              onClick={() => downloadTrack(activeTrack)}
              disabled={downloadingId === activeTrack.id}
              className="px-2.5 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-60 text-neutral-100 text-xs font-semibold transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
              title="音声ファイルをダウンロード"
            >
              {downloadingId === activeTrack.id ? (
                <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
              ) : (
                <Download className="w-4 h-4 text-orange-400" />
              )}
              <span className="hidden sm:inline">保存</span>
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-950/60 border border-red-800/60 text-xs text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-16 flex items-center justify-center gap-2 text-neutral-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
          <span>SoundCloud から読み込み中...</span>
        </div>
      ) : searchKind === 'users' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {users.map((u) => (
            <div
              key={u.id}
              className="p-3 rounded-xl bg-[#101014] border border-neutral-800 flex items-center gap-3"
            >
              {u.avatar ? (
                <img src={u.avatar} alt={u.username} className="w-12 h-12 rounded-full object-cover bg-neutral-900" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center">
                  <User className="w-5 h-5 text-neutral-400" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-white truncate">{u.username}</div>
                <div className="text-xs text-neutral-400">
                  {u.trackCount} 曲 • {u.followersCount.toLocaleString()} フォロワー
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setQuery(u.username);
                  setSearchKind('tracks');
                }}
                className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs text-white cursor-pointer"
              >
                楽曲検索
              </button>
            </div>
          ))}
        </div>
      ) : searchKind === 'playlists' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {playlists.map((pl) => (
            <div key={pl.id} className="p-3 rounded-xl bg-[#101014] border border-neutral-800 space-y-2.5">
              <div className="flex items-center gap-3">
                <img
                  src={pl.artwork || ''}
                  alt={pl.title}
                  className="w-12 h-12 rounded-lg object-cover bg-neutral-900 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-white truncate">{pl.title}</div>
                  <div className="text-xs text-neutral-400 truncate">
                    {pl.artist} • {pl.trackCount} 曲
                  </div>
                </div>
              </div>
              {Array.isArray(pl.tracks) && pl.tracks.length > 0 && (
                <div className="space-y-1 border-t border-neutral-800/80 pt-2">
                  {pl.tracks.slice(0, 4).map((t: ScTrack) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-neutral-800/70"
                    >
                      <button
                        type="button"
                        onClick={() => playScTrack(t)}
                        className="flex-1 min-w-0 text-left text-xs text-neutral-200 flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <span className="truncate">{t.title}</span>
                        <span className="text-neutral-500 shrink-0">{formatMs(t.durationMs)}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadTrack(t)}
                        disabled={downloadingId === t.id}
                        className="p-1 rounded-md text-neutral-400 hover:text-orange-400 hover:bg-neutral-800 cursor-pointer shrink-0"
                        title="ダウンロード"
                      >
                        {downloadingId === t.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-400" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tracks.map((track) => {
            const isCurrent = activeTrack?.id === track.id;
            const isLoadingThis = resolvingId === track.id;
            const isDownloadingThis = downloadingId === track.id;
            return (
              <div
                key={track.id}
                className={`group p-2.5 rounded-xl border transition-all flex items-center gap-2.5 ${
                  isCurrent
                    ? 'bg-orange-950/25 border-orange-500/60'
                    : 'bg-[#101014] border-neutral-800/90 hover:border-neutral-700 hover:bg-[#15151a]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => playScTrack(track)}
                  className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer"
                >
                  <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-neutral-900 shrink-0">
                    {track.artwork ? (
                      <img src={track.artwork} alt={track.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Radio className="w-5 h-5 text-neutral-600" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      {isLoadingThis ? (
                        <Loader2 className="w-4 h-4 text-white animate-spin" />
                      ) : isCurrent && isScPlaying ? (
                        <Pause className="w-4 h-4 text-white fill-current" />
                      ) : (
                        <Play className="w-4 h-4 text-white fill-current ml-0.5" />
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white truncate">{track.title}</div>
                    <div className="text-xs text-neutral-400 truncate">{track.artist}</div>
                    <div className="text-[11px] text-neutral-500 flex items-center gap-2 mt-0.5">
                      <span>{formatMs(track.durationMs)}</span>
                      {track.playbackCount > 0 && (
                        <span>{track.playbackCount.toLocaleString()} 回</span>
                      )}
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => downloadTrack(track)}
                  disabled={isDownloadingThis}
                  className="p-2 rounded-lg bg-neutral-900 hover:bg-orange-600/20 border border-neutral-800 hover:border-orange-500/50 text-neutral-300 hover:text-orange-400 transition-colors cursor-pointer shrink-0"
                  title="音声をダウンロード"
                  aria-label={`${track.title} をダウンロード`}
                >
                  {isDownloadingThis ? (
                    <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
