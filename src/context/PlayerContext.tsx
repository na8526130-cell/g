import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Track,
  Album,
  Artist,
  Playlist,
  ViewType,
  PlayerMode,
  VideoLayout,
  RepeatMode,
  LyricsData,
  TrackTimestampsData,
  AudioQualityMode,
  SpatialAudioPreset,
  AudioStreamMetadata,
  PodcastShow,
} from '../types/music';
import { ConnectDeviceInfo, ConnectCommandPayload } from '../types/social';
import { api, SyncedAccountLibrary } from '../services/api';
import { socialSocket } from '../services/socialSocket';
import { audioDspEngine } from '../services/audioDspEngine';
import { getPlayableOfflineTrack } from '../services/offlineStorage';
import { syncSharedTracksForOffline } from '../services/sharedOffline';
import { normalizeArtistName } from '../utils/artistNames';

const normalizeTrack = (t: Track): Track =>
  t?.artist ? { ...t, artist: normalizeArtistName(t.artist) || t.artist } : t;

export interface UserPlaylist {
  id: string;
  name: string;
  description?: string;
  coverImage?: string;
  createdAt: string;
  tracks: Track[];
  isLiked?: boolean;
  isPinned?: boolean;
  isCollab?: boolean;
  collabCode?: string;
  collabMembers?: string[];
}

export interface PlaylistFolder {
  id: string;
  name: string;
  playlistIds: string[];
  createdAt: string;
}

export interface VisualShareTarget {
  type: 'track' | 'artist' | 'playlist';
  track?: Track;
  artist?: Artist;
  playlist?: { name: string; tracks: Track[] };
}

export interface ZeroCodeTarget {
  type: 'track' | 'artist' | 'playlist';
  title: string;
  subtitle?: string;
  imageUrl?: string;
  url: string;
  codeValue: string;
  artistId?: string;
  trackId?: string;
}

export type LibraryTabType = 'liked' | 'history' | 'playlists' | 'local' | 'shared_offline' | 'downloads';
export type DeviceMode = 'mobile' | 'pc';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastNotificationPayload {
  message: string;
  type: 'info' | 'success' | 'warning';
  action?: ToastAction;
}

interface PlayerContextType {
  currentTrack: Track | null;
  queue: Track[];
  queueIndex: number;
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playerMode: PlayerMode;
  togglePlayerMode: () => void;
  videoLayout: VideoLayout;
  setVideoLayout: React.Dispatch<React.SetStateAction<VideoLayout>>;
  repeatMode: RepeatMode;
  isShuffle: boolean;
  lyricsOpen: boolean;
  queueOpen: boolean;
  fullScreenPlayerOpen: boolean;
  setFullScreenPlayerOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // Spotify Features: Playback Speed, Smart Shuffle, Audio Quality & Wrapped
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;

  shuffleMode: 'off' | 'on' | 'smart';
  cycleShuffleMode: () => void;

  audioQuality: AudioQualityMode;
  setAudioQuality: (q: AudioQualityMode) => void;

  // Audio DSP (Lossless/Hi-Res, Spatial Audio, Apple Music Sing Vocal Control, DJ EQ Sweep)
  vocalLevel: number;
  setVocalLevel: (level: number) => void;
  spatialAudio: SpatialAudioPreset;
  setSpatialAudio: (preset: SpatialAudioPreset) => void;
  djEqSweep: boolean;
  setDjEqSweep: React.Dispatch<React.SetStateAction<boolean>>;
  audioStreamMeta: AudioStreamMetadata | null;
  setAudioStreamMeta: React.Dispatch<React.SetStateAction<AudioStreamMetadata | null>>;
  shouldUseDirectDsp: boolean;
  markDspFallback: (trackId: string) => void;
  clearDspFallback: (trackId: string) => void;
  dspModalOpen: boolean;
  setDspModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  aiPlaylistModalOpen: boolean;
  setAiPlaylistModalOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // Podcasts
  subscribedPodcasts: PodcastShow[];
  toggleSubscribePodcast: (show: PodcastShow) => void;
  isPodcastSubscribed: (showId: string) => boolean;
  skipBySeconds: (delta: number) => void;

  // Zero Connect (Multi-device remote control)
  deviceId: string;
  deviceName: string;
  setDeviceName: (name: string) => void;
  pairingCode: string;
  setPairingCode: (code: string) => void;
  connectDevices: ConnectDeviceInfo[];
  refreshConnectDevices: () => Promise<void>;
  sendRemoteCommand: (payload: Omit<ConnectCommandPayload, 'fromDeviceId'>) => Promise<void>;

  wrappedModalOpen: boolean;
  setWrappedModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  listeningStats: {
    totalMinutes: number;
    totalMinutesListened: number;
    totalPlayedTracks: number;
    topTracks: { track: Track; count: number; seconds: number }[];
    topArtists: { artist: string; count: number }[];
    timeOfDay: string;
  };
  inspectorOpen: boolean;
  activeView: ViewType;
  selectedEntityId: string | null;
  searchQuery: string;
  likedTrackIds: Set<string>;
  likedTracks: Track[];
  likedAlbumIds: Set<string>;
  likedAlbums: Album[];
  likedPlaylistIds: Set<string>;
  likedPlaylists: Playlist[];
  followedArtistIds: Set<string>;
  followedArtists: Artist[];
  recentSearches: string[];
  recentTracks: Track[];
  userPlaylists: UserPlaylist[];

  // Background Playback & WakeLock & Guide
  backgroundPlaybackEnabled: boolean;
  setBackgroundPlaybackEnabled: (val: boolean) => void;
  toggleBackgroundPlayback: () => void;
  wakeLockActive: boolean;
  toggleWakeLock: () => void;
  bgGuideOpen: boolean;
  setBgGuideOpen: React.Dispatch<React.SetStateAction<boolean>>;
  triggerDocumentPiP: () => Promise<boolean>;

  // Crossfade & Endless Emotion Radio & Digest Mode & Playlist Import
  crossfadeDuration: number;
  setCrossfadeDuration: (sec: number) => void;
  endlessRadioActive: boolean;
  toggleEndlessRadio: () => void;
  emotionRadioMood: { id: string; name: string } | null;
  startRadioForTrack: (seedTrack: Track) => Promise<void>;
  isAutoSelectingQueue: boolean;
  replenishQueueNow: () => Promise<number>;
  digestMode: boolean;
  toggleDigestMode: () => void;
  digestRemainingSec: number;
  trackTimestamps: TrackTimestampsData | null;
  importModalOpen: boolean;
  setImportModalOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // Action Handlers
  playTrack: (
    track: Track,
    customQueue?: Track[],
    contextOverride?: { source: string; subtitle: string }
  ) => void;
  playbackContextLabel: { source: string; subtitle: string };
  setPlaybackContextLabel: React.Dispatch<React.SetStateAction<{ source: string; subtitle: string }>>;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  seekTo: (seconds: number) => void;
  nextTrack: (isManualSkip?: boolean) => void;
  prevTrack: () => void;
  setVolume: (val: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setPlayerMode: (mode: PlayerMode) => void;
  setLyricsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setQueueOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setInspectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveView: (view: ViewType) => void;
  navigateTo: (view: ViewType, entityId?: string) => void;
  libraryTab: LibraryTabType;
  setLibraryTab: React.Dispatch<React.SetStateAction<LibraryTabType>>;
  libraryResetSeq: number;
  openFavoritesView: () => void;
  setSearchQuery: (query: string) => void;
  toggleLikeTrack: (track: Track) => void;
  toggleLikeAlbum: (album: Album) => void;
  toggleLikePlaylist: (playlist: Playlist) => void;
  toggleLikeUserPlaylist: (playlistId: string) => void;
  toggleFollowArtist: (artist: Artist) => void;
  addRecentSearch: (query: string) => void;
  removeRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  moveQueueItem: (fromIndex: number, toIndex: number) => void;
  moveToPlayNext: (index: number) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  createUserPlaylist: (
    name: string,
    options?: {
      description?: string;
      coverImage?: string;
      tracks?: Track[];
      isCollab?: boolean;
      collabCode?: string;
      collabMembers?: string[];
      isPinned?: boolean;
    }
  ) => UserPlaylist | null;
  saveTracksAsPlaylist: (name: string, tracks: Track[], description?: string) => void;
  addToUserPlaylist: (playlistId: string, trackTrack: Track) => void;
  removeFromUserPlaylist: (playlistId: string, trackId: string) => void;
  deleteUserPlaylist: (playlistId: string) => void;
  togglePinUserPlaylist: (playlistId: string) => void;
  reorderUserPlaylists: (fromIndex: number, toIndex: number) => void;
  sortUserPlaylists: (criteria: 'liked' | 'newest' | 'oldest' | 'name' | 'tracksDesc') => void;
  reorderUserPlaylistTracks: (playlistId: string, fromIndex: number, toIndex: number) => void;
  sortUserPlaylistTracks: (
    playlistId: string,
    criteria: 'title' | 'artist' | 'durationDesc' | 'reverse'
  ) => void;
  updateUserPlaylist: (
    playlistId: string,
    updates: {
      name?: string;
      description?: string;
      coverImage?: string;
      tracks?: Track[];
      isPinned?: boolean;
      isCollab?: boolean;
      collabCode?: string;
      collabMembers?: string[];
    }
  ) => void;

  // Playlist Folders ("マイライブラリ > + > フォルダ")
  userFolders: PlaylistFolder[];
  createFolder: (name: string) => PlaylistFolder | null;
  renameFolder: (folderId: string, name: string) => void;
  deleteFolder: (folderId: string) => void;
  assignPlaylistToFolder: (playlistId: string, folderId: string | null) => void;

  // Hide Track / Block Artist ("この曲を非表示 / このアーティストを再生しない")
  hiddenTracks: Track[];
  hiddenTrackIds: Set<string>;
  blockedArtists: string[];
  isTrackBlocked: (track?: Track | null) => boolean;
  isArtistBlocked: (artistName?: string) => boolean;
  hideTrack: (track: Track) => void;
  unhideTrack: (trackId: string) => void;
  blockArtist: (artistName: string) => void;
  unblockArtist: (artistName: string) => void;

  // Track Detail / Credits Modal
  trackDetailModalTrack: Track | null;
  openTrackDetailModal: (track: Track) => void;
  closeTrackDetailModal: () => void;

  // Account & Real Stats System + Cross-device Cloud Sync
  currentUser: { username: string; email?: string } | null;
  accountEmail: string | null;
  accountModalOpen: boolean;
  setAccountModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  registerUserAccount: (username: string, password: string, email?: string) => Promise<any>;
  loginUserAccount: (identifier: string, password: string) => Promise<any>;
  logoutAccount: () => void;
  pinnedBestTracks: Track[];
  setPinnedBestTracks: (tracks: Track[]) => void;
  lastCloudSyncAt: string | null;
  isSyncingCloud: boolean;
  syncAccountNow: () => Promise<boolean>;
  stats: { totalAccessCount: number; totalAccountsCount: number; onlineCount: number };
  onlineCount: number;
  refreshStats: () => Promise<void>;

  // Admin Master Control (パスワード: @zeromusic)
  isAdmin: boolean;
  adminModalOpen: boolean;
  setAdminModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  adminLoginWithPassword: (password: string) => Promise<any>;
  trackOffsets: Record<string, { offsetSec: number; title?: string }>;
  refreshTrackOffsets: () => Promise<void>;

  // Add to Playlist Modal
  addToPlaylistModalOpen: boolean;
  setAddToPlaylistModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  trackToAddToPlaylist: Track | null;
  openAddToPlaylistModal: (track: Track) => void;

  // Real-time Synced Lyrics for Mini Player & Components
  currentLyrics: LyricsData | null;
  lyricsLoading: boolean;
  activeSyncedLyricText: string;
  hasManualLyricsOverride: boolean;
  overrideCurrentLyrics: (videoId: string, lyrics: LyricsData) => void;
  clearLyricsOverride: (videoId: string) => void;
  lyricsSwitcherTrigger: number;
  openLyricsSwitcher: () => void;

  // Share Modal & URL Sharing
  shareModalOpen: boolean;
  setShareModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  shareModalPayload: { type: 'track' | 'playlist'; playlist?: { name: string; tracks: Track[] } } | null;
  openShareModal: (type?: 'track' | 'playlist', playlist?: { name: string; tracks: Track[] }) => void;

  // Mini Floating Player
  floatingPlayerVisible: boolean;
  setFloatingPlayerVisible: React.Dispatch<React.SetStateAction<boolean>>;
  floatingPlayerCollapsed: boolean;
  setFloatingPlayerCollapsed: React.Dispatch<React.SetStateAction<boolean>>;

  // Social, Comments, DM, Listening Party & Notifications
  danmakuEnabled: boolean;
  setDanmakuEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  commentsModalOpen: boolean;
  setCommentsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  dmModalOpen: boolean;
  setDmModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  dmUiVisible: boolean;
  setDmUiVisible: React.Dispatch<React.SetStateAction<boolean>>;
  toggleDmUiVisible: () => void;
  dmTargetUser: string | null;
  openDmWithUser: (username?: string) => void;
  freemakeModalOpen: boolean;
  setFreemakeModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  freemakeTargetTrack: Track | null;
  openFreemakeModal: (track?: Track | null) => void;
  notificationDrawerOpen: boolean;
  setNotificationDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  unreadNotificationCount: number;
  refreshNotifications: () => Promise<void>;

  // Terms of Service & Privacy Policy (利用規約 & プライバシーポリシー)
  termsModalOpen: boolean;
  setTermsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // App Settings Modal (設定)
  settingsModalOpen: boolean;
  setSettingsModalOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // Creative & Community Modals
  storyModalOpen: boolean;
  setStoryModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  visualShareTarget: VisualShareTarget | null;
  openVisualShareCard: (target: VisualShareTarget) => void;
  zeroCodeModalTarget: ZeroCodeTarget | null;
  openZeroCodeModal: (target: ZeroCodeTarget) => void;
  closeZeroCodeModal: () => void;
  connectModalOpen: boolean;
  setConnectModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  floatingLyricsOverlay: boolean;
  setFloatingLyricsOverlay: React.Dispatch<React.SetStateAction<boolean>>;
  canvasEnabled: boolean;
  setCanvasEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  quizModalOpen: boolean;
  setQuizModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  matchModalOpen: boolean;
  setMatchModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  collabModalOpen: boolean;
  setCollabModalOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // Toast notifications & Playback error auto-fallback
  toastNotification: ToastNotificationPayload | null;
  setToastNotification: React.Dispatch<React.SetStateAction<ToastNotificationPayload | null>>;
  showToast: (
    message: string,
    type?: 'info' | 'success' | 'warning',
    duration?: number,
    action?: ToastAction
  ) => void;
  onPlayerError: (errorCode: number, errorMsg?: string) => Promise<void>;

  // Device Edition Mode Selection (スマホ版 / パソコン版)
  deviceMode: DeviceMode | null;
  setDeviceMode: (mode: DeviceMode | null) => void;
  toggleDeviceMode: () => void;

  // Internal bridge with YouTube player
  userIntendedPlayingRef: React.MutableRefObject<boolean>;
  onPlayerTimeUpdate: (current: number, total: number) => void;
  onPlayerStateChange: (isPlayingState: boolean) => void;
  onPlayerTrackEnded: () => void;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

const STORAGE_KEYS = {
  LIKED: 'yt_music_liked_tracks_v1',
  LIKED_ALBUMS: 'yt_music_liked_albums_v1',
  LIKED_PLAYLISTS: 'yt_music_liked_playlists_v1',
  FOLLOWED_ARTISTS: 'yt_music_followed_artists_v1',
  RECENT_SEARCHES: 'yt_music_recent_searches_v1',
  HISTORY: 'yt_music_recent_tracks_v1',
  PLAYLISTS: 'yt_music_user_playlists_v1',
  BG_PLAY: 'yt_music_background_playback_v1',
  DEVICE_MODE: 'zero_music_device_mode_v1',
  HIDDEN_TRACKS: 'yt_music_hidden_tracks_v1',
  BLOCKED_ARTISTS: 'yt_music_blocked_artists_v1',
  FOLDERS: 'yt_music_folders_v1',
  FLOATING_LYRICS: 'yt_music_floating_lyrics_v1',
  CANVAS_ENABLED: 'yt_music_canvas_enabled_v1',
  PINNED_BEST4: 'yt_music_pinned_best4_v1',
  LAST_CLOUD_SYNC_PREFIX: 'yt_music_last_cloud_sync_v1:',
  VOCAL_LEVEL: 'zero_vocal_level_v1',
  SPATIAL_AUDIO: 'zero_spatial_audio_v1',
  DJ_EQ_SWEEP: 'zero_dj_eq_sweep_v1',
  SUBSCRIBED_PODCASTS: 'zero_subscribed_podcasts_v1',
  CONNECT_DEVICE_ID: 'zero_connect_device_id_v1',
  CONNECT_DEVICE_NAME: 'zero_connect_device_name_v1',
  CONNECT_PAIRING_CODE: 'zero_connect_pairing_code_v1',
};

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolumeState] = useState<number>(80);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playerMode, setPlayerMode] = useState<PlayerMode>('cover');
  const [videoLayout, setVideoLayout] = useState<VideoLayout>('theater');

  const [deviceMode, setDeviceModeState] = useState<DeviceMode | null>(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEYS.DEVICE_MODE);
      return saved === 'mobile' || saved === 'pc' ? saved : null;
    } catch {
      return null;
    }
  });

  const setDeviceMode = useCallback((mode: DeviceMode | null) => {
    setDeviceModeState(mode);
    try {
      if (mode) {
        sessionStorage.setItem(STORAGE_KEYS.DEVICE_MODE, mode);
      } else {
        sessionStorage.removeItem(STORAGE_KEYS.DEVICE_MODE);
      }
    } catch {}
  }, []);

  const toggleDeviceMode = useCallback(() => {
    setDeviceModeState((prev) => {
      const next: DeviceMode = prev === 'pc' ? 'mobile' : 'pc';
      try {
        sessionStorage.setItem(STORAGE_KEYS.DEVICE_MODE, next);
      } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.deviceMode = deviceMode || '';
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) {
      const isNarrowScreen = typeof window !== 'undefined' && window.screen.width < 1024;
      if (deviceMode === 'pc' && isNarrowScreen) {
        viewportMeta.setAttribute('content', 'width=1180');
      } else {
        viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0');
      }
    }
  }, [deviceMode]);

  const togglePlayerMode = useCallback(() => {
    setPlayerMode((prev) => {
      const next = prev === 'cover' ? 'video' : 'cover';
      if (next === 'video') {
        setVideoLayout('theater');
      }
      return next;
    });
  }, []);

  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [lyricsOpen, setLyricsOpen] = useState<boolean>(false);
  const [queueOpen, setQueueOpen] = useState<boolean>(false);
  const forcedNextIdsRef = useRef<Set<string>>(new Set());
  const [fullScreenPlayerOpen, setFullScreenPlayerOpen] = useState<boolean>(false);
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(false);
  const [bgGuideOpen, setBgGuideOpen] = useState<boolean>(false);

  // Crossfade duration in seconds (0 = off, 2, 4, 6, 8)
  const [crossfadeDuration, setCrossfadeDuration] = useState<number>(4);
  // Endless emotion radio station mode
  const [endlessRadioActive, setEndlessRadioActive] = useState<boolean>(true);
  const [emotionRadioMood, setEmotionRadioMood] = useState<{ id: string; name: string } | null>(null);
  // Digest 25s highlight mode
  const [digestMode, setDigestMode] = useState<boolean>(false);
  const [digestRemainingSec, setDigestRemainingSec] = useState<number>(25);
  const [trackTimestamps, setTrackTimestamps] = useState<TrackTimestampsData | null>(null);
  // Playlist Import Modal open
  const [importModalOpen, setImportModalOpen] = useState<boolean>(false);


  const [playbackRate, setPlaybackRateState] = useState<number>(1.0);
  const [shuffleMode, setShuffleMode] = useState<'off' | 'on' | 'smart'>('off');

  const [audioQuality, setAudioQualityState] = useState<AudioQualityMode>(() => {
    try {
      return (localStorage.getItem('yt_audio_quality') as AudioQualityMode) || 'high';
    } catch {
      return 'high';
    }
  });

  const [vocalLevel, setVocalLevelState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.VOCAL_LEVEL);
      return saved !== null ? Math.max(0, Math.min(100, Number(saved))) : 100;
    } catch {
      return 100;
    }
  });

  const [spatialAudio, setSpatialAudioState] = useState<SpatialAudioPreset>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SPATIAL_AUDIO);
      if (saved === 'studio' || saved === 'cinema' || saved === 'concert' || saved === 'off') return saved;
    } catch {}
    return 'off';
  });

  const [djEqSweep, setDjEqSweep] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.DJ_EQ_SWEEP);
      return saved === 'false' ? false : true;
    } catch {
      return true;
    }
  });

  const [audioStreamMeta, setAudioStreamMeta] = useState<AudioStreamMetadata | null>(null);
  const [dspFallbackIds, setDspFallbackIds] = useState<Set<string>>(() => new Set());

  const markDspFallback = useCallback((trackId: string) => {
    if (!trackId) return;
    setDspFallbackIds((prev) => {
      if (prev.has(trackId)) return prev;
      const next = new Set(prev);
      next.add(trackId);
      return next;
    });
  }, []);

  const clearDspFallback = useCallback((trackId: string) => {
    if (!trackId) return;
    setDspFallbackIds((prev) => {
      if (!prev.has(trackId)) return prev;
      const next = new Set(prev);
      next.delete(trackId);
      return next;
    });
  }, []);

  const shouldUseDirectDsp = useMemo(() => {
    if (!currentTrack) return false;
    if (dspFallbackIds.has(currentTrack.id)) return false;
    if (currentTrack.isLocal) return true;
    if (currentTrack.trackType === 'podcast' && Boolean(currentTrack.audioUrl)) return true;
    if (
      playerMode === 'cover' &&
      (audioQuality === 'lossless' ||
        audioQuality === 'hires' ||
        vocalLevel < 100 ||
        spatialAudio !== 'off' ||
        djEqSweep ||
        crossfadeDuration > 0)
    ) {
      return true;
    }
    return false;
  }, [currentTrack, dspFallbackIds, playerMode, audioQuality, vocalLevel, spatialAudio, djEqSweep, crossfadeDuration]);

  const shouldUseDirectDspRef = useRef<boolean>(shouldUseDirectDsp);
  shouldUseDirectDspRef.current = shouldUseDirectDsp;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.DJ_EQ_SWEEP, String(djEqSweep));
    } catch {}
  }, [djEqSweep]);

  const setVocalLevel = useCallback((level: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(level)));
    setVocalLevelState(clamped);
    audioDspEngine.setVocalLevel(clamped);
    try {
      localStorage.setItem(STORAGE_KEYS.VOCAL_LEVEL, String(clamped));
    } catch {}
  }, []);

  const setSpatialAudio = useCallback((preset: SpatialAudioPreset) => {
    setSpatialAudioState(preset);
    audioDspEngine.setSpatialPreset(preset);
    try {
      localStorage.setItem(STORAGE_KEYS.SPATIAL_AUDIO, preset);
    } catch {}
  }, []);

  useEffect(() => {
    audioDspEngine.setVocalLevel(vocalLevel);
    audioDspEngine.setSpatialPreset(spatialAudio);
    audioDspEngine.setAudioQuality(audioQuality);
    audioDspEngine.setVolume(volume, isMuted);
    audioDspEngine.setPlaybackRate(playbackRate);
  }, []);

  const [subscribedPodcasts, setSubscribedPodcasts] = useState<PodcastShow[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SUBSCRIBED_PODCASTS);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SUBSCRIBED_PODCASTS, JSON.stringify(subscribedPodcasts));
    } catch {}
  }, [subscribedPodcasts]);

  const isPodcastSubscribed = useCallback(
    (showId: string) => subscribedPodcasts.some((s) => s.id === showId),
    [subscribedPodcasts]
  );

  const [wrappedModalOpen, setWrappedModalOpen] = useState<boolean>(false);
  const [historyStats, setHistoryStats] = useState<Record<string, { track: Track; count: number; seconds: number }>>(() => {
    try {
      const saved = localStorage.getItem('yt_listening_history_v1');
      if (!saved) return {};
      const parsed = JSON.parse(saved);
      const out: Record<string, { track: Track; count: number; seconds: number }> = {};
      for (const [k, v] of Object.entries<any>(parsed || {})) {
        out[k] = v?.track ? { ...v, track: normalizeTrack(v.track) } : v;
      }
      return out;
    } catch {
      return {};
    }
  });

  const targetVolumeRef = useRef<number>(80);
  const isTransitioningEarlyRef = useRef<boolean>(false);
  const isFetchingRadioRef = useRef<boolean>(false);
  const lastAutoEmptyAtRef = useRef<number>(0);
  const [isAutoSelectingQueue, setIsAutoSelectingQueue] = useState<boolean>(false);

  // Intent tracker: true when user actively intends playback, false ONLY when user pressed pause
  const userIntendedPlayingRef = useRef<boolean>(false);

  // Background playback & Wakelock state
  const [backgroundPlaybackEnabled, setBackgroundPlaybackEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.BG_PLAY);
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });
  const [wakeLockActive, setWakeLockActive] = useState<boolean>(false);
  const wakeLockRef = useRef<any>(null);

  const [activeView, setActiveView] = useState<ViewType>('home');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [libraryTab, setLibraryTab] = useState<LibraryTabType>('liked');
  const [libraryResetSeq, setLibraryResetSeq] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Persisted state
  const [likedTracks, setLikedTracks] = useState<Track[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LIKED);
      const list = saved ? JSON.parse(saved) : [];
      return Array.isArray(list) ? list.map(normalizeTrack) : [];
    } catch {
      return [];
    }
  });

  const [recentTracks, setRecentTracks] = useState<Track[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.HISTORY);
      const list = saved ? JSON.parse(saved) : [];
      return Array.isArray(list) ? list.map(normalizeTrack) : [];
    } catch {
      return [];
    }
  });

  const [userPlaylists, setUserPlaylists] = useState<UserPlaylist[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PLAYLISTS);
      const pls = saved ? JSON.parse(saved) : [
        {
          id: 'favorites',
          name: 'My Best Hits',
          createdAt: new Date().toISOString(),
          tracks: [],
        },
      ];
      return Array.isArray(pls)
        ? pls.map((p: any) => ({ ...p, tracks: Array.isArray(p?.tracks) ? p.tracks.map(normalizeTrack) : [] }))
        : [];
    } catch {
      return [];
    }
  });

  const [likedAlbums, setLikedAlbums] = useState<Album[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LIKED_ALBUMS);
      const list = saved ? JSON.parse(saved) : [];
      return Array.isArray(list)
        ? list.map((a: Album) => ({ ...a, artist: normalizeArtistName(a.artist) || a.artist }))
        : [];
    } catch {
      return [];
    }
  });

  const [likedPlaylists, setLikedPlaylists] = useState<Playlist[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.LIKED_PLAYLISTS);
      const list = saved ? JSON.parse(saved) : [];
      return Array.isArray(list)
        ? list.map((p: Playlist) => ({
            ...p,
            author: p.author ? normalizeArtistName(p.author) || p.author : p.author,
          }))
        : [];
    } catch {
      return [];
    }
  });

  const [followedArtists, setFollowedArtists] = useState<Artist[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.FOLLOWED_ARTISTS);
      const list = saved ? JSON.parse(saved) : [];
      return Array.isArray(list)
        ? list.map((a: Artist) => ({ ...a, name: normalizeArtistName(a.name) || a.name }))
        : [];
    } catch {
      return [];
    }
  });

  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.RECENT_SEARCHES);
      const list = saved ? JSON.parse(saved) : [];
      return Array.isArray(list) ? list.filter((s) => typeof s === 'string' && s.trim()) : [];
    } catch {
      return [];
    }
  });

  const [hiddenTracks, setHiddenTracks] = useState<Track[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.HIDDEN_TRACKS);
      const list = saved ? JSON.parse(saved) : [];
      return Array.isArray(list) ? list.map(normalizeTrack) : [];
    } catch {
      return [];
    }
  });

  const [blockedArtists, setBlockedArtists] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.BLOCKED_ARTISTS);
      const list = saved ? JSON.parse(saved) : [];
      return Array.isArray(list) ? list.filter((s) => typeof s === 'string' && s.trim()) : [];
    } catch {
      return [];
    }
  });

  const [trackDetailModalTrack, setTrackDetailModalTrack] = useState<Track | null>(null);
  const openTrackDetailModal = useCallback((track: Track) => {
    setTrackDetailModalTrack(normalizeTrack(track));
  }, []);
  const closeTrackDetailModal = useCallback(() => {
    setTrackDetailModalTrack(null);
  }, []);

  const [userFolders, setUserFolders] = useState<PlaylistFolder[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.FOLDERS);
      const list = saved ? JSON.parse(saved) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(userFolders));
    } catch {}
  }, [userFolders]);

  const [pinnedBestTracks, setPinnedBestTracksState] = useState<Track[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PINNED_BEST4);
      const list = saved ? JSON.parse(saved) : [];
      return Array.isArray(list) ? list.map(normalizeTrack).slice(0, 4) : [];
    } catch {
      return [];
    }
  });

  const setPinnedBestTracks = useCallback((tracks: Track[]) => {
    const clean = Array.isArray(tracks) ? tracks.map(normalizeTrack).slice(0, 4) : [];
    setPinnedBestTracksState(clean);
    try {
      localStorage.setItem(STORAGE_KEYS.PINNED_BEST4, JSON.stringify(clean));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PINNED_BEST4, JSON.stringify(pinnedBestTracks));
    } catch {}
  }, [pinnedBestTracks]);

  const [playbackContextLabel, setPlaybackContextLabel] = useState<{
    source: string;
    subtitle: string;
  }>({
    source: '再生中の曲',
    subtitle: 'zero-music',
  });

  const [floatingLyricsOverlay, setFloatingLyricsOverlay] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.FLOATING_LYRICS);
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.FLOATING_LYRICS, JSON.stringify(floatingLyricsOverlay));
    } catch {}
  }, [floatingLyricsOverlay]);

  const [canvasEnabled, setCanvasEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CANVAS_ENABLED);
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CANVAS_ENABLED, JSON.stringify(canvasEnabled));
    } catch {}
  }, [canvasEnabled]);

  const hiddenTrackIds = useMemo(
    () => new Set(hiddenTracks.map((t) => t.id)),
    [hiddenTracks]
  );

  const normalizeArtistKey = useCallback((name?: string) => {
    if (!name) return '';
    return normalizeArtistName(name).trim().toLowerCase();
  }, []);

  const blockedArtistKeySet = useMemo(
    () => new Set(blockedArtists.map((a) => normalizeArtistKey(a)).filter(Boolean)),
    [blockedArtists, normalizeArtistKey]
  );

  const hiddenTrackIdsRef = useRef<Set<string>>(hiddenTrackIds);
  const blockedArtistKeySetRef = useRef<Set<string>>(blockedArtistKeySet);

  useEffect(() => {
    hiddenTrackIdsRef.current = hiddenTrackIds;
    try {
      localStorage.setItem(STORAGE_KEYS.HIDDEN_TRACKS, JSON.stringify(hiddenTracks));
    } catch {}
  }, [hiddenTracks, hiddenTrackIds]);

  useEffect(() => {
    blockedArtistKeySetRef.current = blockedArtistKeySet;
    try {
      localStorage.setItem(STORAGE_KEYS.BLOCKED_ARTISTS, JSON.stringify(blockedArtists));
    } catch {}
  }, [blockedArtists, blockedArtistKeySet]);

  const isArtistBlocked = useCallback(
    (artistName?: string) => {
      const key = normalizeArtistKey(artistName);
      if (!key) return false;
      return blockedArtistKeySetRef.current.has(key);
    },
    [normalizeArtistKey]
  );

  const isTrackBlocked = useCallback(
    (track?: Track | null) => {
      if (!track) return false;
      if (track.id && hiddenTrackIdsRef.current.has(track.id)) return true;
      return isArtistBlocked(track.artist);
    },
    [isArtistBlocked]
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.LIKED, JSON.stringify(likedTracks));
    } catch (e) {
      console.warn('Storage save failed:', e);
    }
  }, [likedTracks]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.LIKED_ALBUMS, JSON.stringify(likedAlbums));
    } catch (e) {
      console.warn('Storage save failed:', e);
    }
  }, [likedAlbums]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.LIKED_PLAYLISTS, JSON.stringify(likedPlaylists));
    } catch (e) {
      console.warn('Storage save failed:', e);
    }
  }, [likedPlaylists]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.FOLLOWED_ARTISTS, JSON.stringify(followedArtists));
    } catch (e) {
      console.warn('Storage save failed:', e);
    }
  }, [followedArtists]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.RECENT_SEARCHES, JSON.stringify(recentSearches.slice(0, 15)));
    } catch (e) {
      console.warn('Storage save failed:', e);
    }
  }, [recentSearches]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(recentTracks.slice(0, 50)));
    } catch (e) {
      console.warn('Storage save failed:', e);
    }
  }, [recentTracks]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(userPlaylists));
    } catch (e) {
      console.warn('Storage save failed:', e);
    }
  }, [userPlaylists]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.BG_PLAY, JSON.stringify(backgroundPlaybackEnabled));
    } catch (e) {
      console.warn('Storage save failed:', e);
    }
  }, [backgroundPlaybackEnabled]);

  // Real Stats & Account Session persistence (偽はいらん)
  const [currentUser, setCurrentUser] = useState<{ username: string; email?: string } | null>(() => {
    try {
      const saved = localStorage.getItem('yt_music_user_session_v1');
      if (saved) return JSON.parse(saved);
      const email = localStorage.getItem('yt_music_user_email_v1');
      if (email) return { username: email.split('@')[0], email };
      return null;
    } catch {
      return null;
    }
  });

  const [stats, setStats] = useState<{ totalAccessCount: number; totalAccountsCount: number; onlineCount: number }>({
    totalAccessCount: 1,
    totalAccountsCount: 0,
    onlineCount: 1,
  });
  const [onlineCount, setOnlineCount] = useState<number>(1);
  const sessionIdRef = useRef<string>('');

  const [accountModalOpen, setAccountModalOpen] = useState<boolean>(false);

  // Fetch real stats from server
  const refreshStats = useCallback(async () => {
    try {
      const s = await api.getStats();
      if (s && typeof s.totalAccessCount === 'number') {
        setStats(s);
        if (typeof s.onlineCount === 'number') {
          setOnlineCount(s.onlineCount);
        }
      }
    } catch (e) {
      console.warn('Failed to refresh stats:', e);
    }
  }, []);

  // Record real visit on startup and initialize real stats
  useEffect(() => {
    api
      .recordVisit()
      .then((s) => {
        if (s && typeof s.totalAccessCount === 'number') {
          setStats(s);
          if (typeof s.onlineCount === 'number') {
            setOnlineCount(s.onlineCount);
          }
        }
      })
      .catch(() => {});

    const interval = setInterval(refreshStats, 30000);
    return () => clearInterval(interval);
  }, [refreshStats]);

  // Real-time Active Presence Heartbeat (Every 15s, with instant leave on window close)
  useEffect(() => {
    if (!sessionIdRef.current) {
      try {
        let id = sessionStorage.getItem('zm_presence_session_id');
        if (!id) {
          id = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          sessionStorage.setItem('zm_presence_session_id', id);
        }
        sessionIdRef.current = id;
      } catch {
        sessionIdRef.current = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      }
    }

    const currentSessionId = sessionIdRef.current;

    const sendHeartbeat = async () => {
      try {
        const res = await api.sendPresenceHeartbeat(currentSessionId, currentUser?.username);
        if (res && typeof res.onlineCount === 'number') {
          setOnlineCount(res.onlineCount);
          setStats((prev) => ({ ...prev, onlineCount: res.onlineCount }));
        }
      } catch {}
    };

    // Immediate initial heartbeat
    sendHeartbeat();

    // 15 seconds heartbeat loop
    const heartbeatTimer = setInterval(sendHeartbeat, 15000);

    // Immediate update when returning to tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        sendHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Instant leave beacon when tab or browser closes
    const handleUnload = () => {
      api.sendPresenceLeave(currentSessionId);
    };
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);

    return () => {
      clearInterval(heartbeatTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
    };
  }, [currentUser?.username]);

  // Add to Playlist modal state
  const [addToPlaylistModalOpen, setAddToPlaylistModalOpen] = useState<boolean>(false);
  const [trackToAddToPlaylist, setTrackToAddToPlaylist] = useState<Track | null>(null);

  const openAddToPlaylistModal = useCallback((track: Track) => {
    setTrackToAddToPlaylist(track);
    setAddToPlaylistModalOpen(true);
  }, []);

  // Track Offsets for lyrics sync adjustment
  const [trackOffsets, setTrackOffsets] = useState<Record<string, { offsetSec: number; title?: string }>>({});

  const refreshTrackOffsets = useCallback(async () => {
    try {
      const res = await api.getTrackOffsets();
      setTrackOffsets(res.trackOffsets || {});
    } catch {}
  }, []);

  useEffect(() => {
    refreshTrackOffsets();
  }, [refreshTrackOffsets]);

  // Real-time Lyrics for Floating Player and general consumers (with persistent per-track manual overrides)
  const [currentLyrics, setCurrentLyrics] = useState<LyricsData | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState<boolean>(false);
  const [lyricsSwitcherTrigger, setLyricsSwitcherTrigger] = useState<number>(0);
  const [lyricsOverrides, setLyricsOverrides] = useState<Record<string, LyricsData>>(() => {
    try {
      const saved = localStorage.getItem('yt_music_lyrics_overrides_v1');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const lyricsOverridesRef = useRef<Record<string, LyricsData>>(lyricsOverrides);
  useEffect(() => {
    lyricsOverridesRef.current = lyricsOverrides;
    try {
      const entries = Object.entries(lyricsOverrides);
      const trimmed = entries.length > 25 ? Object.fromEntries(entries.slice(-25)) : lyricsOverrides;
      localStorage.setItem('yt_music_lyrics_overrides_v1', JSON.stringify(trimmed));
    } catch {}
  }, [lyricsOverrides]);

  const overrideCurrentLyrics = useCallback((videoId: string, lyrics: LyricsData) => {
    setLyricsOverrides((prev) => ({ ...prev, [videoId]: lyrics }));
    if (currentTrack?.id === videoId) {
      setCurrentLyrics(lyrics);
    }
  }, [currentTrack?.id]);

  const clearLyricsOverride = useCallback((videoId: string) => {
    setLyricsOverrides((prev) => {
      const next = { ...prev };
      delete next[videoId];
      return next;
    });
    if (currentTrack?.id === videoId) {
      setLyricsLoading(true);
      api
        .getLyrics(
          currentTrack.id,
          currentTrack.title,
          currentTrack.artist,
          currentTrack.durationSeconds || duration
        )
        .then((res) => {
          setCurrentLyrics(res);
          setLyricsLoading(false);
        })
        .catch(() => {
          setLyricsLoading(false);
        });
    }
  }, [currentTrack, duration]);

  const openLyricsSwitcher = useCallback(() => {
    setLyricsOpen(true);
    setLyricsSwitcherTrigger((n) => n + 1);
  }, []);

  const hasManualLyricsOverride = Boolean(currentTrack && lyricsOverrides[currentTrack.id]);

  useEffect(() => {
    if (!currentTrack) {
      setCurrentLyrics(null);
      setLyricsLoading(false);
      return;
    }
    const overridden = lyricsOverridesRef.current[currentTrack.id];
    if (overridden) {
      setCurrentLyrics(overridden);
      setLyricsLoading(false);
      return;
    }
    let cancelled = false;
    setLyricsLoading(true);
    setCurrentLyrics(null);
    api
      .getLyrics(
        currentTrack.id,
        currentTrack.title,
        currentTrack.artist,
        currentTrack.durationSeconds || duration
      )
      .then((res) => {
        if (!cancelled) {
          setCurrentLyrics(res);
          setLyricsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentLyrics(null);
          setLyricsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentTrack?.id]);

  // Auto-fetch real YouTube timestamps & comment heatmap for active track
  useEffect(() => {
    if (!currentTrack || currentTrack.isLocal) {
      setTrackTimestamps(null);
      return;
    }
    let cancelled = false;
    setTrackTimestamps(null);
    api
      .getTrackTimestamps(
        currentTrack.id,
        currentTrack.title,
        currentTrack.artist,
        currentTrack.durationSeconds || 0
      )
      .then((res) => {
        if (!cancelled && res && res.success) {
          setTrackTimestamps(res);
        }
      })
      .catch(() => {
        if (!cancelled) setTrackTimestamps(null);
      });
    return () => {
      cancelled = true;
    };
  }, [currentTrack?.id]);

  // Share Modal state & helper
  const [shareModalOpen, setShareModalOpen] = useState<boolean>(false);
  const [shareModalPayload, setShareModalPayload] = useState<{
    type: 'track' | 'playlist';
    playlist?: { name: string; tracks: Track[] };
  } | null>(null);

  const openShareModal = useCallback(
    (type: 'track' | 'playlist' = 'track', playlist?: { name: string; tracks: Track[] }) => {
      setShareModalPayload({ type, playlist });
      setShareModalOpen(true);
    },
    []
  );

  // Floating Mini Player state
  const [floatingPlayerVisible, setFloatingPlayerVisible] = useState<boolean>(true);
  const [floatingPlayerCollapsed, setFloatingPlayerCollapsed] = useState<boolean>(false);

  // Social, Comments, DM, Listening Party & Notifications
  const [danmakuEnabled, setDanmakuEnabled] = useState<boolean>(true);
  const [commentsModalOpen, setCommentsModalOpen] = useState<boolean>(false);
  const [dmModalOpen, setDmModalOpen] = useState<boolean>(false);
  const [dmUiVisible, setDmUiVisible] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('yt_music_dm_ui_visible_v1');
      return saved === 'false' ? false : true;
    } catch {
      return true;
    }
  });
  const [dmTargetUser, setDmTargetUser] = useState<string | null>(null);
  const [freemakeModalOpen, setFreemakeModalOpen] = useState<boolean>(false);
  const [freemakeTargetTrack, setFreemakeTargetTrack] = useState<Track | null>(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState<boolean>(false);

  useEffect(() => {
    try {
      localStorage.setItem('yt_music_dm_ui_visible_v1', String(dmUiVisible));
    } catch {}
    if (!dmUiVisible) {
      setDmModalOpen(false);
    }
  }, [dmUiVisible]);

  const [toastNotification, setToastNotification] = useState<ToastNotificationPayload | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const showToast = useCallback(
    (
      message: string,
      type: 'info' | 'success' | 'warning' = 'info',
      duration = 4000,
      action?: ToastAction
    ) => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      const payload: ToastNotificationPayload = { message, type, action };
      setToastNotification(payload);
      toastTimerRef.current = setTimeout(() => {
        setToastNotification((prev) => (prev === payload ? null : prev));
        toastTimerRef.current = null;
      }, duration);
    },
    []
  );

  const toggleDmUiVisible = useCallback(() => {
    const next = !dmUiVisible;
    setDmUiVisible(next);
    showToast(
      next
        ? 'DM（ダイレクトメッセージ）UIを表示しました'
        : 'DM（ダイレクトメッセージ）UIを非表示にしました（アカウント設定からいつでも再表示できます）',
      'info',
      3000
    );
  }, [dmUiVisible, showToast]);

  const openFreemakeModal = useCallback((track?: Track | null) => {
    setFreemakeTargetTrack(track || null);
    setFreemakeModalOpen(true);
  }, []);

  const [notificationDrawerOpen, setNotificationDrawerOpen] = useState<boolean>(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState<number>(0);
  const [termsModalOpen, setTermsModalOpen] = useState<boolean>(false);
  const [storyModalOpen, setStoryModalOpen] = useState<boolean>(false);
  const [visualShareTarget, setVisualShareTarget] = useState<VisualShareTarget | null>(null);
  const openVisualShareCard = useCallback((target: VisualShareTarget) => {
    setVisualShareTarget(target);
    setStoryModalOpen(true);
  }, []);
  const [zeroCodeModalTarget, setZeroCodeModalTarget] = useState<ZeroCodeTarget | null>(null);
  const openZeroCodeModal = useCallback((target: ZeroCodeTarget) => {
    setZeroCodeModalTarget(target);
  }, []);
  const closeZeroCodeModal = useCallback(() => {
    setZeroCodeModalTarget(null);
  }, []);
  const [connectModalOpen, setConnectModalOpen] = useState<boolean>(false);
  const [dspModalOpen, setDspModalOpen] = useState<boolean>(false);
  const [aiPlaylistModalOpen, setAiPlaylistModalOpen] = useState<boolean>(false);
  const [quizModalOpen, setQuizModalOpen] = useState<boolean>(false);
  const [matchModalOpen, setMatchModalOpen] = useState<boolean>(false);
  const [collabModalOpen, setCollabModalOpen] = useState<boolean>(false);

  const toggleSubscribePodcast = useCallback(
    (show: PodcastShow) => {
      setSubscribedPodcasts((prev) => {
        const exists = prev.some((s) => s.id === show.id);
        if (exists) {
          showToast(`「${show.title}」のポッドキャスト登録を解除しました`, 'info', 2200);
          return prev.filter((s) => s.id !== show.id);
        }
        showToast(`「${show.title}」をポッドキャスト登録しました`, 'success', 2400);
        return [show, ...prev];
      });
    },
    [showToast]
  );

  // Zero Connect (Multi-device & multi-tab remote control)
  const [deviceId] = useState<string>(() => {
    try {
      const existingSession = sessionStorage.getItem(STORAGE_KEYS.CONNECT_DEVICE_ID);
      if (existingSession) return existingSession;
      const created = `dev_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
      sessionStorage.setItem(STORAGE_KEYS.CONNECT_DEVICE_ID, created);
      return created;
    } catch {
      return `dev_${Math.random().toString(36).slice(2, 10)}`;
    }
  });

  const [deviceName, setDeviceNameState] = useState<string>(() => {
    try {
      const tabSaved = sessionStorage.getItem(STORAGE_KEYS.CONNECT_DEVICE_NAME);
      if (tabSaved) return tabSaved;
      const saved = localStorage.getItem(STORAGE_KEYS.CONNECT_DEVICE_NAME);
      if (saved) return saved;
    } catch {}
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isMobileUa = /iPhone|iPad|iPod|Android|Mobile/i.test(ua);
    const osLabel = /iPhone|iPad/i.test(ua)
      ? 'iOS'
      : /Android/i.test(ua)
      ? 'Android'
      : /Mac/i.test(ua)
      ? 'Mac'
      : /Windows/i.test(ua)
      ? 'Windows'
      : 'Web';
    return `${isMobileUa ? 'スマホ' : 'PC'} (${osLabel})`;
  });

  const setDeviceName = useCallback((name: string) => {
    const trimmed = name.trim().slice(0, 40) || 'Zero Player';
    setDeviceNameState(trimmed);
    try {
      sessionStorage.setItem(STORAGE_KEYS.CONNECT_DEVICE_NAME, trimmed);
      localStorage.setItem(STORAGE_KEYS.CONNECT_DEVICE_NAME, trimmed);
    } catch {}
  }, []);

  const [pairingCode, setPairingCodeState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CONNECT_PAIRING_CODE);
      if (saved && saved.trim()) return saved.trim().toUpperCase();
      const code = `ZM-${Math.floor(1000 + Math.random() * 9000)}`;
      localStorage.setItem(STORAGE_KEYS.CONNECT_PAIRING_CODE, code);
      return code;
    } catch {
      return `ZM-${Math.floor(1000 + Math.random() * 9000)}`;
    }
  });

  const setPairingCode = useCallback(
    (code: string) => {
      const trimmed = code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
      const clean =
        (/^\d{4}$/.test(trimmed) ? `ZM-${trimmed}` : trimmed.slice(0, 16)) ||
        `ZM-${Math.floor(1000 + Math.random() * 9000)}`;
      setPairingCodeState(clean);
      try {
        localStorage.setItem(STORAGE_KEYS.CONNECT_PAIRING_CODE, clean);
      } catch {}
      socialSocket.bindDevice(deviceId, clean, currentUser?.username);
    },
    [deviceId, currentUser?.username]
  );

  const [connectDevices, setConnectDevices] = useState<ConnectDeviceInfo[]>([]);

  const refreshConnectDevices = useCallback(async () => {
    try {
      const res = await api.getConnectDevices({ username: currentUser?.username, pairingCode });
      if (Array.isArray(res.devices)) {
        setConnectDevices(res.devices);
      }
    } catch {}
  }, [currentUser?.username, pairingCode]);

  const sendRemoteCommand = useCallback(
    async (payload: Omit<ConnectCommandPayload, 'fromDeviceId'>) => {
      await api.sendConnectCommand({
        ...payload,
        fromDeviceId: deviceId,
        fromDeviceName: deviceName,
        pairingCode: payload.pairingCode || pairingCode,
        username: currentUser?.username,
      });
    },
    [deviceId, deviceName, pairingCode, currentUser?.username]
  );

  const openDmWithUser = useCallback(
    (username?: string) => {
      if (!dmUiVisible) {
        showToast('DMのUIは現在非表示です（アカウント設定から再表示できます）', 'info', 2800);
        return;
      }
      if (username) setDmTargetUser(username);
      setDmModalOpen(true);
    },
    [dmUiVisible, showToast]
  );

  const refreshNotifications = useCallback(async () => {
    if (!currentUser) {
      setUnreadNotificationCount(0);
      return;
    }
    try {
      const res = await api.getSocialNotifications(currentUser.username);
      setUnreadNotificationCount(res.unreadCount || 0);
    } catch {}
  }, [currentUser]);

  // Sync user presence and nowPlaying over WebSocket
  useEffect(() => {
    socialSocket.setUser(currentUser ? currentUser.username : null);
    refreshNotifications();
  }, [currentUser, refreshNotifications]);

  useEffect(() => {
    socialSocket.setNowPlaying(
      currentTrack
        ? { title: currentTrack.title, artist: currentTrack.artist, videoId: currentTrack.id }
        : null
    );
  }, [currentTrack]);

  useEffect(() => {
    const unsub = socialSocket.on('notification:new', () => {
      refreshNotifications();
    });
    const unsubShared = socialSocket.on('shared_offline:added', () => {
      if (navigator.onLine) {
        syncSharedTracksForOffline().catch(() => {});
      }
    });
    return () => {
      unsub();
      unsubShared();
    };
  }, [refreshNotifications]);

  // Background auto-sync of Shared Offline tracks into IndexedDB while online
  useEffect(() => {
    const timer = setTimeout(() => {
      if (navigator.onLine) {
        syncSharedTracksForOffline().catch(() => {});
      }
    }, 2500);
    const onOnline = () => {
      syncSharedTracksForOffline().catch(() => {});
    };
    window.addEventListener('online', onOnline);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  // Live active synced lyric line
  const activeSyncedLyricText = useMemo(() => {
    if (!currentLyrics?.syncedLyrics || currentLyrics.syncedLyrics.length === 0) {
      return '';
    }
    const offset =
      currentTrack && trackOffsets[currentTrack.id]
        ? trackOffsets[currentTrack.id].offsetSec
        : currentLyrics.globalOffset || 0;
    const effProgress = progress + offset;
    const lines = currentLyrics.syncedLyrics;

    if (effProgress < lines[0].time - 0.1) {
      return '';
    }

    for (let i = lines.length - 1; i >= 0; i--) {
      if (effProgress >= lines[i].time - 0.1) {
        return lines[i].text;
      }
    }
    return '';
  }, [currentLyrics, progress, currentTrack?.id, trackOffsets]);

  // URL parameters handler on mount (?track=xxx, ?share_pl=xxx, ?artist=xxx, ?collab=xxx, ?connect=ZM-XXXX)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const trackId = params.get('track');
    const sharePlId = params.get('share_pl');
    const artistParam = params.get('artist');
    const collabParam = params.get('collab');
    const connectParam = params.get('connect');

    if (connectParam) {
      const norm = connectParam.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
      const cleanConnect = /^\d{4}$/.test(norm) ? `ZM-${norm}` : norm.slice(0, 16);
      if (cleanConnect) {
        setPairingCode(cleanConnect);
        setConnectModalOpen(true);
        showToast(`Zero Connect (${cleanConnect}) でペアリングしました`, 'success', 2600);
      }
      window.history.replaceState({}, '', window.location.pathname);
    } else if (trackId) {
      api
        .getTrack(trackId)
        .then((res) => {
          if (res.track) {
            playTrack(res.track, undefined, {
              source: '共有リンクから再生中',
              subtitle: res.track.album || res.track.artist,
            });
            window.history.replaceState({}, '', window.location.pathname);
          }
        })
        .catch((e) => {
          console.warn('[Share] Failed to load shared track from URL:', e);
        });
    } else if (artistParam) {
      setActiveView('artist');
      setSelectedEntityId(artistParam);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (collabParam) {
      try {
        sessionStorage.setItem('zero_music_pending_collab_code', collabParam);
      } catch {}
      setCollabModalOpen(true);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (sharePlId) {
      api
        .getSharedPlaylist(sharePlId)
        .then((res) => {
          if (res.playlist && Array.isArray(res.playlist.tracks)) {
            const imported: UserPlaylist = {
              id: `shared_${sharePlId}_${Date.now()}`,
              name: res.playlist.name,
              createdAt: new Date().toISOString(),
              tracks: res.playlist.tracks,
            };
            setUserPlaylists((prev) => [imported, ...prev]);
            if (res.playlist.tracks.length > 0) {
              playTrack(res.playlist.tracks[0], res.playlist.tracks, {
                source: '共有プレイリストから再生中',
                subtitle: res.playlist.name,
              });
            }
            window.history.replaceState({}, '', window.location.pathname);
          }
        })
        .catch((e) => {
          console.warn('[Share] Failed to load shared playlist from URL:', e);
        });
    }
  }, []);

  // Cross-device Library Cloud Sync helpers & state
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<string | null>(() => {
    try {
      if (currentUser?.username) {
        return localStorage.getItem(`${STORAGE_KEYS.LAST_CLOUD_SYNC_PREFIX}${currentUser.username.toLowerCase()}`);
      }
    } catch {}
    return null;
  });
  const [isSyncingCloud, setIsSyncingCloud] = useState<boolean>(false);
  const lastCloudSyncAtRef = useRef<string | null>(lastCloudSyncAt);
  const applyingRemoteSyncRef = useRef<boolean>(false);
  const syncBootMountedRef = useRef<boolean>(false);
  const hasPendingLocalPushRef = useRef<boolean>(false);
  const pushDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const recordSyncTimestamp = useCallback((username: string, ts?: string | null) => {
    const val = ts || new Date().toISOString();
    lastCloudSyncAtRef.current = val;
    setLastCloudSyncAt(val);
    try {
      localStorage.setItem(`${STORAGE_KEYS.LAST_CLOUD_SYNC_PREFIX}${username.toLowerCase()}`, val);
    } catch {}
  }, []);

  const buildLibrarySnapshot = useCallback((): SyncedAccountLibrary => {
    const listeningArr = Object.values(historyStats)
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .slice(0, 150);
    return {
      playlists: userPlaylists,
      likedTracks,
      likedAlbums,
      likedPlaylists,
      followedArtists,
      recentTracks: recentTracks.slice(0, 50),
      recentSearches: recentSearches.slice(0, 15),
      userFolders,
      hiddenTracks,
      blockedArtists,
      pinnedBestTracks: pinnedBestTracks.slice(0, 4),
      listeningHistory: listeningArr,
      subscribedPodcasts,
      settings: {
        audioQuality,
        vocalLevel,
        spatialAudio,
        djEqSweep,
        floatingLyricsOverlay,
        canvasEnabled,
        backgroundPlaybackEnabled,
        dmUiVisible,
      },
    };
  }, [
    userPlaylists,
    likedTracks,
    likedAlbums,
    likedPlaylists,
    followedArtists,
    recentTracks,
    recentSearches,
    userFolders,
    hiddenTracks,
    blockedArtists,
    pinnedBestTracks,
    historyStats,
    subscribedPodcasts,
    audioQuality,
    vocalLevel,
    spatialAudio,
    djEqSweep,
    floatingLyricsOverlay,
    canvasEnabled,
    backgroundPlaybackEnabled,
    dmUiVisible,
  ]);

  const snapshotRef = useRef<SyncedAccountLibrary>(buildLibrarySnapshot());
  snapshotRef.current = buildLibrarySnapshot();

  const applyLibrarySnapshot = useCallback((lib: SyncedAccountLibrary) => {
    if (!lib || typeof lib !== 'object') return;
    applyingRemoteSyncRef.current = true;

    if (Array.isArray(lib.playlists)) {
      setUserPlaylists(
        lib.playlists.map((p: any) => ({
          ...p,
          tracks: Array.isArray(p?.tracks) ? p.tracks.map(normalizeTrack) : [],
        }))
      );
    }
    if (Array.isArray(lib.likedTracks)) {
      setLikedTracks(lib.likedTracks.map(normalizeTrack));
    }
    if (Array.isArray(lib.likedAlbums)) {
      setLikedAlbums(
        lib.likedAlbums.map((a: Album) => ({
          ...a,
          artist: normalizeArtistName(a.artist) || a.artist,
        }))
      );
    }
    if (Array.isArray(lib.likedPlaylists)) {
      setLikedPlaylists(
        lib.likedPlaylists.map((p: Playlist) => ({
          ...p,
          author: p.author ? normalizeArtistName(p.author) || p.author : p.author,
        }))
      );
    }
    if (Array.isArray(lib.followedArtists)) {
      setFollowedArtists(
        lib.followedArtists.map((a: Artist) => ({
          ...a,
          name: normalizeArtistName(a.name) || a.name,
        }))
      );
    }
    if (Array.isArray(lib.recentTracks)) {
      setRecentTracks(lib.recentTracks.slice(0, 50).map(normalizeTrack));
    }
    if (Array.isArray(lib.recentSearches)) {
      setRecentSearches(lib.recentSearches.filter((s) => typeof s === 'string' && s.trim()).slice(0, 15));
    }
    if (Array.isArray(lib.userFolders)) {
      setUserFolders(lib.userFolders);
    }
    if (Array.isArray(lib.hiddenTracks)) {
      setHiddenTracks(lib.hiddenTracks.map(normalizeTrack));
    }
    if (Array.isArray(lib.blockedArtists)) {
      setBlockedArtists(lib.blockedArtists.filter((s) => typeof s === 'string' && s.trim()));
    }
    if (Array.isArray(lib.pinnedBestTracks)) {
      setPinnedBestTracksState(lib.pinnedBestTracks.slice(0, 4).map(normalizeTrack));
    }
    if (Array.isArray(lib.listeningHistory)) {
      const nextHist: Record<string, { track: Track; count: number; seconds: number }> = {};
      lib.listeningHistory.forEach((entry: any) => {
        if (entry?.track?.id) {
          nextHist[entry.track.id] = {
            track: normalizeTrack(entry.track),
            count: Number(entry.count) || 1,
            seconds: Number(entry.seconds) || 0,
          };
        }
      });
      setHistoryStats(nextHist);
      try {
        localStorage.setItem('yt_listening_history_v1', JSON.stringify(nextHist));
      } catch {}
    }
    if (Array.isArray(lib.subscribedPodcasts)) {
      setSubscribedPodcasts(lib.subscribedPodcasts);
    }
    if (lib.settings && typeof lib.settings === 'object') {
      if (lib.settings.audioQuality) {
        setAudioQualityState(lib.settings.audioQuality);
        audioDspEngine.setAudioQuality(lib.settings.audioQuality);
        try {
          localStorage.setItem('yt_audio_quality', lib.settings.audioQuality);
        } catch {}
      }
      if (typeof lib.settings.vocalLevel === 'number') {
        setVocalLevelState(lib.settings.vocalLevel);
        audioDspEngine.setVocalLevel(lib.settings.vocalLevel);
      }
      if (lib.settings.spatialAudio) {
        setSpatialAudioState(lib.settings.spatialAudio);
        audioDspEngine.setSpatialPreset(lib.settings.spatialAudio);
      }
      if (typeof lib.settings.djEqSweep === 'boolean') {
        setDjEqSweep(lib.settings.djEqSweep);
      }
      if (typeof lib.settings.floatingLyricsOverlay === 'boolean') {
        setFloatingLyricsOverlay(lib.settings.floatingLyricsOverlay);
      }
      if (typeof lib.settings.canvasEnabled === 'boolean') {
        setCanvasEnabled(lib.settings.canvasEnabled);
      }
      if (typeof lib.settings.backgroundPlaybackEnabled === 'boolean') {
        setBackgroundPlaybackEnabled(lib.settings.backgroundPlaybackEnabled);
      }
      if (typeof lib.settings.dmUiVisible === 'boolean') {
        setDmUiVisible(lib.settings.dmUiVisible);
      }
    }

    setTimeout(() => {
      applyingRemoteSyncRef.current = false;
    }, 50);
  }, []);

  const mergeCloudAndLocalLibrary = useCallback(
    (localLib: SyncedAccountLibrary, cloudLib: SyncedAccountLibrary): { merged: SyncedAccountLibrary; localHadExtra: boolean } => {
      let localHadExtra = false;

      const mergeById = <T extends { id?: string }>(cloudArr: T[] = [], localArr: T[] = [], maxLen?: number): T[] => {
        const out: T[] = [];
        const seen = new Set<string>();
        cloudArr.forEach((item) => {
          if (item?.id && !seen.has(item.id)) {
            seen.add(item.id);
            out.push(item);
          }
        });
        localArr.forEach((item) => {
          if (item?.id && !seen.has(item.id)) {
            seen.add(item.id);
            out.push(item);
            localHadExtra = true;
          }
        });
        return maxLen ? out.slice(0, maxLen) : out;
      };

      const mergeStrings = (cloudArr: string[] = [], localArr: string[] = [], maxLen?: number): string[] => {
        const out: string[] = [];
        const seen = new Set<string>();
        cloudArr.forEach((s) => {
          const clean = String(s || '').trim();
          const k = clean.toLowerCase();
          if (clean && !seen.has(k)) {
            seen.add(k);
            out.push(clean);
          }
        });
        localArr.forEach((s) => {
          const clean = String(s || '').trim();
          const k = clean.toLowerCase();
          if (clean && !seen.has(k)) {
            seen.add(k);
            out.push(clean);
            localHadExtra = true;
          }
        });
        return maxLen ? out.slice(0, maxLen) : out;
      };

      // Merge playlists carefully: skip default empty 'favorites' placeholder on guest device if cloud already has playlists
      const cloudPls = Array.isArray(cloudLib.playlists) ? cloudLib.playlists : [];
      const localPls = Array.isArray(localLib.playlists) ? localLib.playlists : [];
      const mergedPlsMap = new Map<string, any>();
      cloudPls.forEach((pl) => {
        if (pl?.id) mergedPlsMap.set(pl.id, pl);
      });
      localPls.forEach((pl) => {
        if (!pl?.id) return;
        const isEmptyDefaultFav = pl.id === 'favorites' && (!pl.tracks || pl.tracks.length === 0);
        if (isEmptyDefaultFav && cloudPls.length > 0) return;
        const existing = mergedPlsMap.get(pl.id);
        if (!existing) {
          mergedPlsMap.set(pl.id, pl);
          localHadExtra = true;
        } else {
          const mergedTracks = mergeById(existing.tracks || [], pl.tracks || []);
          mergedPlsMap.set(pl.id, { ...existing, tracks: mergedTracks });
        }
      });

      // Merge listeningHistory
      const histMap = new Map<string, { track: Track; count: number; seconds: number }>();
      (cloudLib.listeningHistory || []).forEach((h: any) => {
        if (h?.track?.id) histMap.set(h.track.id, h);
      });
      (localLib.listeningHistory || []).forEach((h: any) => {
        if (!h?.track?.id) return;
        const cur = histMap.get(h.track.id);
        if (!cur) {
          histMap.set(h.track.id, h);
          localHadExtra = true;
        } else if ((h.count || 0) > (cur.count || 0) || (h.seconds || 0) > (cur.seconds || 0)) {
          histMap.set(h.track.id, {
            track: cur.track,
            count: Math.max(cur.count || 0, h.count || 0),
            seconds: Math.max(cur.seconds || 0, h.seconds || 0),
          });
          localHadExtra = true;
        }
      });

      const merged: SyncedAccountLibrary = {
        playlists: Array.from(mergedPlsMap.values()),
        likedTracks: mergeById(cloudLib.likedTracks || [], localLib.likedTracks || []),
        likedAlbums: mergeById(cloudLib.likedAlbums || [], localLib.likedAlbums || []),
        likedPlaylists: mergeById(cloudLib.likedPlaylists || [], localLib.likedPlaylists || []),
        followedArtists: mergeById(cloudLib.followedArtists || [], localLib.followedArtists || []),
        recentTracks: mergeById(localLib.recentTracks || [], cloudLib.recentTracks || [], 50),
        recentSearches: mergeStrings(localLib.recentSearches || [], cloudLib.recentSearches || [], 15),
        userFolders: mergeById(cloudLib.userFolders || [], localLib.userFolders || []),
        hiddenTracks: mergeById(cloudLib.hiddenTracks || [], localLib.hiddenTracks || []),
        blockedArtists: mergeStrings(cloudLib.blockedArtists || [], localLib.blockedArtists || []),
        pinnedBestTracks: mergeById(cloudLib.pinnedBestTracks || [], localLib.pinnedBestTracks || [], 4),
        listeningHistory: Array.from(histMap.values())
          .sort((a, b) => (b.count || 0) - (a.count || 0))
          .slice(0, 150),
        subscribedPodcasts: mergeById(cloudLib.subscribedPodcasts || [], localLib.subscribedPodcasts || []),
        settings: cloudLib.settings || localLib.settings,
      };

      return { merged, localHadExtra };
    },
    []
  );

  // Register account with username, password, arbitrary email (no example)
  const registerUserAccount = useCallback(
    async (username: string, password: string, email?: string) => {
      const snapshot = snapshotRef.current;
      const res = await api.registerAccount({
        username: username.trim(),
        password: password.trim(),
        email: email?.trim() || undefined,
        playlists: snapshot.playlists,
        library: snapshot,
      });

      const user = {
        username: res.account.username,
        email: res.account.email || '',
      };
      setCurrentUser(user);
      recordSyncTimestamp(user.username, res.account?.libraryUpdatedAt || new Date().toISOString());

      if (res.stats) {
        setStats(res.stats);
      }

      try {
        localStorage.setItem('yt_music_user_session_v1', JSON.stringify(user));
        if (user.email) {
          localStorage.setItem('yt_music_user_email_v1', user.email);
        }
      } catch {}

      return res;
    },
    [recordSyncTimestamp]
  );

  // Login account & merge/hydrate cross-device library
  const loginUserAccount = useCallback(
    async (identifier: string, password: string) => {
      const res = await api.loginAccount({
        identifier: identifier.trim(),
        password: password.trim(),
      });

      const user = {
        username: res.account.username,
        email: res.account.email || '',
      };
      setCurrentUser(user);

      const cloudLib: SyncedAccountLibrary = res.account.library || {
        playlists: Array.isArray(res.account.playlists) ? res.account.playlists : [],
      };
      const localLib = snapshotRef.current;
      const { merged, localHadExtra } = mergeCloudAndLocalLibrary(localLib, cloudLib);
      applyLibrarySnapshot(merged);

      if (localHadExtra || !res.account.library) {
        try {
          const syncRes = await api.syncAccountLibrary(user.username, merged);
          recordSyncTimestamp(user.username, syncRes?.libraryUpdatedAt || res.account.libraryUpdatedAt);
        } catch {
          recordSyncTimestamp(user.username, res.account.libraryUpdatedAt);
        }
      } else {
        recordSyncTimestamp(user.username, res.account.libraryUpdatedAt);
      }

      if (res.isAdmin || res.account?.role === 'admin') {
        setIsAdmin(true);
        try {
          localStorage.setItem('yt_music_is_admin_v1', 'true');
        } catch {}
      }

      if (res.stats) {
        setStats(res.stats);
      }

      try {
        localStorage.setItem('yt_music_user_session_v1', JSON.stringify(user));
        if (user.email) {
          localStorage.setItem('yt_music_user_email_v1', user.email);
        }
      } catch {}

      return res;
    },
    [mergeCloudAndLocalLibrary, applyLibrarySnapshot, recordSyncTimestamp]
  );

  // Admin Master Login with password @zeromusic
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    try {
      return localStorage.getItem('yt_music_is_admin_v1') === 'true';
    } catch {
      return false;
    }
  });
  const [adminModalOpen, setAdminModalOpen] = useState<boolean>(false);

  const adminLoginWithPassword = useCallback(async (password: string) => {
    const res = await api.adminLogin(password);
    if (res.success) {
      setIsAdmin(true);
      setCurrentUser({ username: 'admin', email: 'admin@zeromusic.local' });
      try {
        localStorage.setItem('yt_music_is_admin_v1', 'true');
        localStorage.setItem('yt_music_user_session_v1', JSON.stringify({ username: 'admin', email: 'admin@zeromusic.local' }));
      } catch {}
    }
    return res;
  }, []);

  const logoutAccount = useCallback(() => {
    if (pushDebounceTimerRef.current) {
      clearTimeout(pushDebounceTimerRef.current);
      pushDebounceTimerRef.current = null;
    }
    hasPendingLocalPushRef.current = false;
    lastCloudSyncAtRef.current = null;
    setLastCloudSyncAt(null);
    setCurrentUser(null);
    setIsAdmin(false);
    try {
      localStorage.removeItem('yt_music_user_session_v1');
      localStorage.removeItem('yt_music_user_email_v1');
      localStorage.removeItem('yt_music_is_admin_v1');
    } catch {}
  }, []);

  // Pull newer cloud library updates from another device (or merge once if first time syncing this browser)
  const pullCloudLibraryIfNewer = useCallback(async (): Promise<boolean> => {
    const uname = currentUser?.username;
    if (!uname || uname === 'admin') return false;
    try {
      const profile = await api.getAccountProfile(uname);
      if (!profile?.exists || !profile.account) return false;
      const serverUpdatedAt: string | undefined = profile.account.libraryUpdatedAt;
      const cloudLib: SyncedAccountLibrary = profile.account.library || {
        playlists: profile.account.playlists || [],
      };

      const savedLocalSyncTs = (() => {
        try {
          return localStorage.getItem(`${STORAGE_KEYS.LAST_CLOUD_SYNC_PREFIX}${uname.toLowerCase()}`);
        } catch {
          return lastCloudSyncAtRef.current;
        }
      })();

      if (!savedLocalSyncTs) {
        const { merged, localHadExtra } = mergeCloudAndLocalLibrary(snapshotRef.current, cloudLib);
        applyLibrarySnapshot(merged);
        if (localHadExtra || !profile.account.library) {
          const pushRes = await api.syncAccountLibrary(uname, merged);
          recordSyncTimestamp(uname, pushRes?.libraryUpdatedAt || serverUpdatedAt);
        } else {
          recordSyncTimestamp(uname, serverUpdatedAt);
        }
        return true;
      }

      if (hasPendingLocalPushRef.current) {
        return false;
      }

      if (serverUpdatedAt && new Date(serverUpdatedAt).getTime() > new Date(savedLocalSyncTs).getTime() + 500) {
        applyLibrarySnapshot(cloudLib);
        recordSyncTimestamp(uname, serverUpdatedAt);
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }, [currentUser?.username, mergeCloudAndLocalLibrary, applyLibrarySnapshot, recordSyncTimestamp]);

  const syncAccountNow = useCallback(async (): Promise<boolean> => {
    const uname = currentUser?.username;
    if (!uname || uname === 'admin') return false;
    setIsSyncingCloud(true);
    try {
      const pulled = await pullCloudLibraryIfNewer();
      if (!pulled || hasPendingLocalPushRef.current) {
        const res = await api.syncAccountLibrary(uname, snapshotRef.current);
        hasPendingLocalPushRef.current = false;
        recordSyncTimestamp(uname, res?.libraryUpdatedAt);
      }
      return true;
    } catch {
      return false;
    } finally {
      setIsSyncingCloud(false);
    }
  }, [currentUser?.username, pullCloudLibraryIfNewer, recordSyncTimestamp]);

  // Debounced auto-push whenever local library/favorites/history/settings change while logged in
  useEffect(() => {
    if (!syncBootMountedRef.current) {
      syncBootMountedRef.current = true;
      return;
    }
    const uname = currentUser?.username;
    if (!uname || uname === 'admin' || applyingRemoteSyncRef.current) return;

    hasPendingLocalPushRef.current = true;
    if (pushDebounceTimerRef.current) {
      clearTimeout(pushDebounceTimerRef.current);
    }
    pushDebounceTimerRef.current = setTimeout(async () => {
      pushDebounceTimerRef.current = null;
      if (applyingRemoteSyncRef.current) return;
      setIsSyncingCloud(true);
      try {
        const res = await api.syncAccountLibrary(uname, snapshotRef.current);
        hasPendingLocalPushRef.current = false;
        recordSyncTimestamp(uname, res?.libraryUpdatedAt);
      } catch {
      } finally {
        setIsSyncingCloud(false);
      }
    }, 900);

    return () => {
      if (pushDebounceTimerRef.current) {
        clearTimeout(pushDebounceTimerRef.current);
      }
    };
  }, [
    currentUser?.username,
    userPlaylists,
    likedTracks,
    likedAlbums,
    likedPlaylists,
    followedArtists,
    recentTracks,
    recentSearches,
    userFolders,
    hiddenTracks,
    blockedArtists,
    pinnedBestTracks,
    historyStats,
    subscribedPodcasts,
    audioQuality,
    vocalLevel,
    spatialAudio,
    djEqSweep,
    floatingLyricsOverlay,
    canvasEnabled,
    backgroundPlaybackEnabled,
    recordSyncTimestamp,
  ]);

  // Auto-pull on startup, tab return, window focus, and periodic 25s polling across devices
  useEffect(() => {
    const uname = currentUser?.username;
    if (!uname || uname === 'admin') return;

    pullCloudLibraryIfNewer();

    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        pullCloudLibraryIfNewer();
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    const pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        pullCloudLibraryIfNewer();
      }
    }, 25000);

    return () => {
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
      clearInterval(pollTimer);
    };
  }, [currentUser?.username, pullCloudLibraryIfNewer]);

  const accountEmail = currentUser?.email || null;

  const likedTrackIds = new Set(likedTracks.map((t) => t.id));
  const likedAlbumIds = useMemo(() => new Set(likedAlbums.map((a) => a.id)), [likedAlbums]);
  const likedPlaylistIds = useMemo(() => new Set(likedPlaylists.map((p) => p.id)), [likedPlaylists]);

  const toggleBackgroundPlayback = useCallback(() => {
    setBackgroundPlaybackEnabled((prev) => !prev);
  }, []);

  const toggleWakeLock = useCallback(async () => {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      if (wakeLockActive && wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
        } catch {
          // ignore
        }
        wakeLockRef.current = null;
        setWakeLockActive(false);
      } else {
        try {
          const lock = await (navigator as any).wakeLock.request('screen');
          wakeLockRef.current = lock;
          setWakeLockActive(true);
          lock.addEventListener('release', () => setWakeLockActive(false));
        } catch (err) {
          console.warn('Wake Lock request error:', err);
        }
      }
    }
  }, [wakeLockActive]);

  const navigateTo = useCallback((view: ViewType, entityId?: string) => {
    setActiveView(view);
    if (entityId !== undefined) {
      setSelectedEntityId(entityId);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const openFavoritesView = useCallback(() => {
    setFullScreenPlayerOpen(false);
    setLyricsOpen(false);
    setQueueOpen(false);
    setLibraryTab('liked');
    setLibraryResetSeq((prev) => prev + 1);
    navigateTo('library');
  }, [navigateTo]);

  // Send raw commands to active player engine (AudioDspEngine or YouTube iframe)
  const dispatchPlayCommand = useCallback(() => {
    const win = window as any;
    if (shouldUseDirectDspRef.current) {
      audioDspEngine.play();
      if (win.__ytPlayer && typeof win.__ytPlayer.pauseVideo === 'function') {
        try {
          win.__ytPlayer.pauseVideo();
        } catch {}
      }
      return;
    }
    if (win.__localAudio) {
      try {
        win.__localAudio.play().catch(() => {});
      } catch {}
    }
    if (win.__ytPlayer && typeof win.__ytPlayer.playVideo === 'function') {
      win.__ytPlayer.playVideo();
    }
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach((ifr) => {
      try {
        ifr.contentWindow?.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
      } catch {
        // ignore
      }
    });
  }, []);

  const dispatchPauseCommand = useCallback(() => {
    const win = window as any;
    audioDspEngine.pause();
    if (win.__localAudio) {
      try {
        win.__localAudio.pause();
      } catch {}
    }
    if (win.__ytPlayer && typeof win.__ytPlayer.pauseVideo === 'function') {
      win.__ytPlayer.pauseVideo();
    }
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach((ifr) => {
      try {
        ifr.contentWindow?.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
      } catch {
        // ignore
      }
    });
  }, []);

  const fetchAutoSelectedTracks = useCallback(
    async (
      seedTrack: Track,
      excludeIds: Set<string>,
      desiredCount = 18,
      forceRefresh = false
    ): Promise<Track[]> => {
      const seen = new Set<string>(excludeIds);
      const picked: Track[] = [];
      const addCandidate = (raw?: Track | null) => {
        if (!raw || !raw.id || seen.has(raw.id)) return;
        const normalized = normalizeTrack(raw);
        if (isTrackBlocked(normalized)) return;
        seen.add(normalized.id);
        picked.push(normalized);
      };

      try {
        const [emotionRes, primaryRelated] = await Promise.all([
          api
            .getTrackCommentEmotions(seedTrack.id, seedTrack.title, seedTrack.artist)
            .catch(() => null),
          api.getRelated(seedTrack.id).catch(() => []),
        ]);

        const domMood = emotionRes?.dominantMood || 'emotional';
        if (emotionRes?.dominantMood) {
          setEmotionRadioMood({
            id: domMood,
            name: emotionRes?.dominantMoodName || '感情マッチ',
          });
        }

        const [moodByArtist, moodGlobal] = await Promise.all([
          seedTrack.artist
            ? api.getMoodRecommendation(domMood, seedTrack.artist, forceRefresh).catch(() => null)
            : Promise.resolve(null),
          api.getMoodRecommendation(domMood, undefined, forceRefresh).catch(() => null),
        ]);

        const relList = Array.isArray(primaryRelated) ? primaryRelated : [];
        const moodTracks = [
          ...(moodByArtist?.tracks || []),
          ...(moodGlobal?.tracks || []),
        ];
        const maxLen = Math.max(relList.length, moodTracks.length);
        for (let i = 0; i < maxLen && picked.length < desiredCount; i++) {
          if (i < relList.length) addCandidate(relList[i]);
          if (picked.length < desiredCount && i < moodTracks.length) addCandidate(moodTracks[i]);
        }

        if (picked.length < desiredCount) {
          const hopSeed = relList[Math.min(2, relList.length - 1)] || picked[picked.length - 1];
          const [hopRelated, artistSearch] = await Promise.all([
            hopSeed?.id && hopSeed.id !== seedTrack.id
              ? api.getRelated(hopSeed.id).catch(() => [])
              : Promise.resolve([]),
            seedTrack.artist
              ? api.search(`${seedTrack.artist} おすすめ`, 'song').catch(() => null)
              : Promise.resolve(null),
          ]);

          for (const tr of hopRelated || []) {
            if (picked.length >= desiredCount) break;
            addCandidate(tr);
          }
          const searchSongs: Track[] = artistSearch?.songs || artistSearch?.results || [];
          for (const tr of searchSongs) {
            if (picked.length >= desiredCount) break;
            addCandidate(tr);
          }
        }
      } catch (err) {
        console.warn('fetchAutoSelectedTracks error:', err);
      }

      return picked.slice(0, desiredCount);
    },
    []
  );

  const activeViewRef = useRef<ViewType>(activeView);
  const searchQueryRef = useRef<string>(searchQuery);
  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);
  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  const playTrack = useCallback(
    async (
      track: Track,
      customQueue?: Track[],
      contextOverride?: { source: string; subtitle: string }
    ) => {
      userIntendedPlayingRef.current = true;
      isTransitioningEarlyRef.current = false;

      let resolvedTrack = normalizeTrack(track);
      if (track.isLocal || track.isSharedOffline) {
        resolvedTrack = normalizeTrack(await getPlayableOfflineTrack(track));
        if (resolvedTrack.isSharedOffline && navigator.onLine) {
          fetch(`/api/shared-offline/${encodeURIComponent(resolvedTrack.id)}/play`, {
            method: 'POST',
          }).catch(() => {});
        }
      }

      if (contextOverride) {
        setPlaybackContextLabel(contextOverride);
      } else {
        const view = activeViewRef.current;
        const sq = searchQueryRef.current.trim();
        if (view === 'search') {
          setPlaybackContextLabel({
            source: '検索から再生中',
            subtitle: sq ? `「${sq}」の検索結果` : resolvedTrack.album || resolvedTrack.artist,
          });
        } else if (view === 'artist') {
          setPlaybackContextLabel({
            source: 'アーティストから再生中',
            subtitle: resolvedTrack.artist || resolvedTrack.title,
          });
        } else if (view === 'album') {
          setPlaybackContextLabel({
            source: 'アルバムから再生中',
            subtitle: resolvedTrack.album || resolvedTrack.title,
          });
        } else if (view === 'library') {
          setPlaybackContextLabel({
            source: 'マイライブラリから再生中',
            subtitle: resolvedTrack.album || resolvedTrack.artist || 'マイコレクション',
          });
        } else if (view === 'party') {
          setPlaybackContextLabel({
            source: 'Jam / パーティから再生中',
            subtitle: 'リスニングパーティ',
          });
        } else {
          setPlaybackContextLabel({
            source: 'ホームから再生中',
            subtitle: resolvedTrack.album || resolvedTrack.artist || 'あなたへのおすすめ',
          });
        }
      }

      setCurrentTrack(resolvedTrack);
      setProgress(0);
      setIsPlaying(true);

      // Record genuine telemetry (skip when offline or for local tracks)
      if (!resolvedTrack.isLocal && navigator.onLine) {
        try {
          api.recordPlaybackTelemetry({
            videoId: resolvedTrack.id,
            title: resolvedTrack.title,
            artist: resolvedTrack.artist,
            thumbnail: resolvedTrack.thumbnail,
            durationSeconds: resolvedTrack.durationSeconds,
          }).catch(() => {});
        } catch {}
      }

      // Reset volume to target volume when new track begins
      const win = window as any;
      if (win.__ytPlayer && typeof win.__ytPlayer.setVolume === 'function') {
        win.__ytPlayer.setVolume(targetVolumeRef.current);
      }

      // Update history & stats
      setRecentTracks((prev) => {
        const filtered = prev.filter((t) => t.id !== resolvedTrack.id);
        return [resolvedTrack, ...filtered];
      });

      setHistoryStats((prev) => {
        const existing = prev[resolvedTrack.id] || { track: resolvedTrack, count: 0, seconds: 0 };
        const updated = {
          ...prev,
          [resolvedTrack.id]: {
            track: resolvedTrack,
            count: existing.count + 1,
            seconds: existing.seconds + (resolvedTrack.durationSeconds || 180),
          },
        };
        try {
          localStorage.setItem('yt_listening_history_v1', JSON.stringify(updated));
        } catch {}
        return updated;
      });

      if (customQueue && customQueue.length > 0) {
        const cleanQueue = customQueue.map(normalizeTrack);
        setQueue(cleanQueue);
        const idx = cleanQueue.findIndex((t) => t.id === resolvedTrack.id);
        setQueueIndex(idx >= 0 ? idx : 0);
      } else {
        setQueue((prevQueue) => {
          const existingIdx = prevQueue.findIndex((t) => t.id === resolvedTrack.id);
          if (existingIdx >= 0) {
            setQueueIndex(existingIdx);
            return prevQueue;
          } else {
            const newQueue = [...prevQueue, resolvedTrack];
            setQueueIndex(newQueue.length - 1);
            return newQueue;
          }
        });
      }

      digestJumpedTrackRef.current = null;
      digestStartPlaySecRef.current = null;

      // Auto-fetch emotion-matched & related songs in background so queue stays richly populated (20+ tracks)
      if (
        endlessRadioActive &&
        !resolvedTrack.isLocal &&
        resolvedTrack.trackType !== 'podcast' &&
        navigator.onLine &&
        (!customQueue || customQueue.length <= 12)
      ) {
        fetchAutoSelectedTracks(resolvedTrack, new Set([resolvedTrack.id]), 22, false)
          .then((picked) => {
            if (picked.length > 0) {
              setQueue((curr) => {
                if (curr.length <= 18) {
                  const existingIds = new Set(curr.map((t) => t.id));
                  const fresh = picked.filter((r) => r.id && !existingIds.has(r.id)).slice(0, 22);
                  return fresh.length > 0 ? [...curr, ...fresh] : curr;
                }
                return curr;
              });
            }
          })
          .catch(() => {});
      }
    },
    [endlessRadioActive, fetchAutoSelectedTracks]
  );

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      userIntendedPlayingRef.current = false;
      setIsPlaying(false);
      dispatchPauseCommand();
    } else {
      userIntendedPlayingRef.current = true;
      setIsPlaying(true);
      dispatchPlayCommand();
    }
  }, [isPlaying, dispatchPauseCommand, dispatchPlayCommand]);

  const pause = useCallback(() => {
    userIntendedPlayingRef.current = false;
    setIsPlaying(false);
    dispatchPauseCommand();
  }, [dispatchPauseCommand]);

  const resume = useCallback(() => {
    userIntendedPlayingRef.current = true;
    setIsPlaying(true);
    dispatchPlayCommand();
  }, [dispatchPlayCommand]);

  const seekTo = useCallback((seconds: number) => {
    const clamped = Math.max(0, seconds);
    setProgress(clamped);
    if (digestStartPlaySecRef.current !== null) {
      digestStartPlaySecRef.current = clamped;
      setDigestRemainingSec(25);
    }
    audioDspEngine.seekTo(clamped);
    const win = window as any;
    if (win.__localAudio) {
      try {
        win.__localAudio.currentTime = clamped;
      } catch {}
    }
    if (!shouldUseDirectDspRef.current && win.__ytPlayer && typeof win.__ytPlayer.seekTo === 'function') {
      win.__ytPlayer.seekTo(clamped, true);
    }
  }, []);

  const skipBySeconds = useCallback((delta: number) => {
    const cur = audioDspEngine.getCurrentElement()?.currentTime ?? progressRef.current;
    const maxDur = durationRef.current > 0 ? durationRef.current : 999999;
    seekTo(Math.max(0, Math.min(maxDur, cur + delta)));
  }, [seekTo]);

  const repeatCurrentTrack = useCallback(() => {
    if (!currentTrack) return;
    isTransitioningEarlyRef.current = false;
    setProgress(0);
    userIntendedPlayingRef.current = true;
    setIsPlaying(true);

    const win = window as any;
    if (win.__ytPlayer) {
      if (typeof win.__ytPlayer.setVolume === 'function') {
        win.__ytPlayer.setVolume(targetVolumeRef.current);
      }
      if (typeof win.__ytPlayer.seekTo === 'function') {
        win.__ytPlayer.seekTo(0, true);
      }
      if (typeof win.__ytPlayer.playVideo === 'function') {
        win.__ytPlayer.playVideo();
      }
    }
    dispatchPlayCommand();
  }, [currentTrack, dispatchPlayCommand]);

  const nextTrack = useCallback(
    (isManualSkip = false) => {
      if (queue.length === 0) return;
      isTransitioningEarlyRef.current = false;
      digestJumpedTrackRef.current = null;
      digestStartPlaySecRef.current = null;

      if (repeatMode === 'one' && !isManualSkip && currentTrack) {
        repeatCurrentTrack();
        return;
      }

      let nextIdx = queueIndex + 1;
      const immediateNext = queue[nextIdx];
      if (immediateNext && forcedNextIdsRef.current.has(immediateNext.id)) {
        forcedNextIdsRef.current.delete(immediateNext.id);
      } else if (isShuffle) {
        nextIdx = Math.floor(Math.random() * queue.length);
      }

      // Skip past any hidden tracks or blocked artists automatically
      if (!isShuffle) {
        while (nextIdx < queue.length && isTrackBlocked(queue[nextIdx])) {
          nextIdx++;
        }
      } else if (queue[nextIdx] && isTrackBlocked(queue[nextIdx])) {
        const unblockedIndices = queue
          .map((t, i) => (!isTrackBlocked(t) ? i : -1))
          .filter((i) => i >= 0);
        if (unblockedIndices.length > 0) {
          nextIdx = unblockedIndices[Math.floor(Math.random() * unblockedIndices.length)];
        } else {
          nextIdx = queue.length;
        }
      }

      if (nextIdx < queue.length) {
        const rawNext = queue[nextIdx];
        setQueueIndex(nextIdx);
        setProgress(0);
        userIntendedPlayingRef.current = true;
        setIsPlaying(true);

        if (rawNext.isLocal || rawNext.isSharedOffline) {
          getPlayableOfflineTrack(rawNext).then((resolved) => {
            setCurrentTrack(resolved);
            dispatchPlayCommand();
          });
        } else {
          setCurrentTrack(rawNext);
          if (!shouldUseDirectDspRef.current) {
            const win = window as any;
            if (win.__ytPlayer) {
              if (typeof win.__ytPlayer.setVolume === 'function') {
                win.__ytPlayer.setVolume(targetVolumeRef.current);
              }
              if (typeof win.__ytPlayer.loadVideoById === 'function') {
                win.__ytPlayer.loadVideoById(rawNext.podcastVideoId || rawNext.id);
              }
            }
          }
          dispatchPlayCommand();
        }
      } else if (repeatMode === 'all' && queue.length > 0) {
        const rawFirst = queue[0];
        setQueueIndex(0);
        setProgress(0);
        userIntendedPlayingRef.current = true;
        setIsPlaying(true);

        if (rawFirst.isLocal || rawFirst.isSharedOffline) {
          getPlayableOfflineTrack(rawFirst).then((resolved) => {
            setCurrentTrack(resolved);
            dispatchPlayCommand();
          });
        } else {
          setCurrentTrack(rawFirst);
          if (!shouldUseDirectDspRef.current) {
            const win = window as any;
            if (win.__ytPlayer) {
              if (typeof win.__ytPlayer.setVolume === 'function') {
                win.__ytPlayer.setVolume(targetVolumeRef.current);
              }
              if (typeof win.__ytPlayer.loadVideoById === 'function') {
                win.__ytPlayer.loadVideoById(rawFirst.podcastVideoId || rawFirst.id);
              } else if (typeof win.__ytPlayer.seekTo === 'function') {
                win.__ytPlayer.seekTo(0, true);
                win.__ytPlayer.playVideo();
              }
            }
          }
          dispatchPlayCommand();
        }
      } else if (
        endlessRadioActive &&
        currentTrack &&
        !currentTrack.isLocal &&
        currentTrack.trackType !== 'podcast' &&
        navigator.onLine
      ) {
        // Endless Emotion Radio: immediately fetch 18+ matching tracks when hitting queue end
        (async () => {
          try {
            const existingIds = new Set(queue.map((t) => t.id));
            const fresh = await fetchAutoSelectedTracks(currentTrack, existingIds, 18, true);
            if (fresh.length > 0) {
              const nextItem = fresh[0];
              const newQueue = [...queue, ...fresh];
              setQueue(newQueue);
              setQueueIndex(queue.length);
              setProgress(0);
              digestJumpedTrackRef.current = null;
              digestStartPlaySecRef.current = null;
              setCurrentTrack(nextItem);
              userIntendedPlayingRef.current = true;
              setIsPlaying(true);
              const win = window as any;
              if (win.__ytPlayer && typeof win.__ytPlayer.loadVideoById === 'function') {
                win.__ytPlayer.loadVideoById(nextItem.id);
              }
              dispatchPlayCommand();
              return;
            }
          } catch {}
          userIntendedPlayingRef.current = false;
          setIsPlaying(false);
        })();
      } else {
        userIntendedPlayingRef.current = false;
        setIsPlaying(false);
      }
    },
    [
      queue,
      queueIndex,
      repeatMode,
      isShuffle,
      currentTrack,
      endlessRadioActive,
      repeatCurrentTrack,
      dispatchPlayCommand,
      fetchAutoSelectedTracks,
    ]
  );

  const prevTrack = useCallback(() => {
    isTransitioningEarlyRef.current = false;
    digestJumpedTrackRef.current = null;
    digestStartPlaySecRef.current = null;
    if (progress > 3) {
      seekTo(0);
      return;
    }
    if (queueIndex > 0) {
      const prevIdx = queueIndex - 1;
      const rawPrev = queue[prevIdx];
      setQueueIndex(prevIdx);
      setProgress(0);
      userIntendedPlayingRef.current = true;
      setIsPlaying(true);

      if (rawPrev.isLocal || rawPrev.isSharedOffline) {
        getPlayableOfflineTrack(rawPrev).then((resolved) => {
          setCurrentTrack(resolved);
          dispatchPlayCommand();
        });
      } else {
        setCurrentTrack(rawPrev);
        if (!shouldUseDirectDspRef.current) {
          const win = window as any;
          if (win.__ytPlayer) {
            if (typeof win.__ytPlayer.setVolume === 'function') {
              win.__ytPlayer.setVolume(targetVolumeRef.current);
            }
            if (typeof win.__ytPlayer.loadVideoById === 'function') {
              win.__ytPlayer.loadVideoById(rawPrev.podcastVideoId || rawPrev.id);
            }
          }
        }
        dispatchPlayCommand();
      }
    } else {
      seekTo(0);
    }
  }, [progress, queueIndex, queue, seekTo, dispatchPlayCommand]);

  // Refs for stable MediaSession callbacks (prevents 80ms handler churn on iOS/Android)
  const progressRef = useRef<number>(0);
  const durationRef = useRef<number>(0);
  const playbackRateRef = useRef<number>(1.0);
  const lastPositionSyncRef = useRef<number>(0);
  const digestJumpedTrackRef = useRef<string | null>(null);
  const digestStartPlaySecRef = useRef<number | null>(null);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);
  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);
  useEffect(() => {
    playbackRateRef.current = playbackRate;
  }, [playbackRate]);

  // 1) MediaSession Metadata (only updates when track identity/artwork changes)
  const mediaArtworkBlobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (mediaArtworkBlobUrlRef.current) {
      try {
        URL.revokeObjectURL(mediaArtworkBlobUrlRef.current);
      } catch {}
      mediaArtworkBlobUrlRef.current = null;
    }

    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    if (!currentTrack) return;

    const toBlobUrlFromDataUri = (dataUri: string): { url: string; mime: string } | null => {
      const m = dataUri.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (!m?.[1] || !m?.[2]) return null;
      try {
        const binStr = atob(m[2]);
        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) {
          bytes[i] = binStr.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: m[1] });
        const objUrl = URL.createObjectURL(blob);
        mediaArtworkBlobUrlRef.current = objUrl;
        return { url: objUrl, mime: m[1] };
      } catch {
        return null;
      }
    };

    const resolveAbsUrl = (url?: string): { src: string; type: string } | null => {
      if (!url) return null;
      if (url.startsWith('data:image/')) {
        const converted = toBlobUrlFromDataUri(url);
        if (converted) return { src: converted.url, type: converted.mime };
        return { src: url, type: 'image/jpeg' };
      }
      if (/^(?:https?:|blob:)/i.test(url)) {
        return { src: url, type: url.includes('.png') ? 'image/png' : 'image/jpeg' };
      }
      if (typeof window !== 'undefined') {
        const abs = `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
        return { src: abs, type: url.includes('.png') ? 'image/png' : 'image/jpeg' };
      }
      return { src: url, type: 'image/jpeg' };
    };

    const ytId = !currentTrack.isLocal && /^[a-zA-Z0-9_-]{11}$/.test(currentTrack.id) ? currentTrack.id : null;
    const resolvedThumb = resolveAbsUrl(currentTrack.thumbnail);
    const isYtimgThumb = Boolean(resolvedThumb?.src && /https?:\/\/(?:i\d*|img)\.ytimg\.com\//i.test(resolvedThumb.src));

    const artworkList: MediaImage[] = [];
    if (resolvedThumb && (!isYtimgThumb || !ytId)) {
      artworkList.push(
        { src: resolvedThumb.src, sizes: '600x600', type: resolvedThumb.type },
        { src: resolvedThumb.src, sizes: '512x512', type: resolvedThumb.type },
        { src: resolvedThumb.src, sizes: '192x192', type: resolvedThumb.type }
      );
    }
    if (ytId) {
      artworkList.push(
        { src: `https://i.ytimg.com/vi/${ytId}/sddefault.jpg`, sizes: '640x480', type: 'image/jpeg' },
        { src: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' },
        { src: `https://i.ytimg.com/vi/${ytId}/mqdefault.jpg`, sizes: '320x180', type: 'image/jpeg' }
      );
    }

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist || 'Unknown Artist',
        album: currentTrack.album || 'Zero Music',
        artwork: artworkList,
      });
    } catch {
      // ignore
    }

    return () => {
      if (mediaArtworkBlobUrlRef.current) {
        try {
          URL.revokeObjectURL(mediaArtworkBlobUrlRef.current);
        } catch {}
        mediaArtworkBlobUrlRef.current = null;
      }
    };
  }, [
    currentTrack?.id,
    currentTrack?.title,
    currentTrack?.artist,
    currentTrack?.album,
    currentTrack?.thumbnail,
  ]);

  // 2) MediaSession Action Handlers (stable refs so AirPods / lock screen buttons stay responsive)
  const mediaActionsRef = useRef({
    play: () => {},
    pause: () => {},
    prev: () => {},
    next: () => {},
    seekTo: (_sec: number) => {},
  });

  useEffect(() => {
    mediaActionsRef.current = {
      play: () => {
        userIntendedPlayingRef.current = true;
        setIsPlaying(true);
        dispatchPlayCommand();
      },
      pause: () => {
        userIntendedPlayingRef.current = false;
        setIsPlaying(false);
        dispatchPauseCommand();
      },
      prev: () => prevTrack(),
      next: () => nextTrack(true),
      seekTo: (sec: number) => seekTo(sec),
    };
  }, [dispatchPlayCommand, dispatchPauseCommand, prevTrack, nextTrack, seekTo]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const safeBind = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // unsupported action on this browser
      }
    };

    safeBind('play', () => mediaActionsRef.current.play());
    safeBind('pause', () => mediaActionsRef.current.pause());
    safeBind('previoustrack', () => mediaActionsRef.current.prev());
    safeBind('nexttrack', () => mediaActionsRef.current.next());
    safeBind('seekto', (details) => {
      if (details.seekTime !== undefined) {
        mediaActionsRef.current.seekTo(details.seekTime);
        if (
          typeof ms.setPositionState === 'function' &&
          durationRef.current > 0
        ) {
          try {
            ms.setPositionState({
              duration: durationRef.current,
              playbackRate: playbackRateRef.current || 1,
              position: Math.min(durationRef.current, Math.max(0, details.seekTime)),
            });
          } catch {}
        }
      }
    });
    safeBind('seekbackward', (details) => {
      const offset = details.seekOffset || 10;
      mediaActionsRef.current.seekTo(Math.max(0, progressRef.current - offset));
    });
    safeBind('seekforward', (details) => {
      const offset = details.seekOffset || 10;
      const maxDur = durationRef.current || 0;
      mediaActionsRef.current.seekTo(
        maxDur > 0 ? Math.min(maxDur, progressRef.current + offset) : progressRef.current + offset
      );
    });
    safeBind('stop', () => mediaActionsRef.current.pause());

    return () => {
      (['play', 'pause', 'previoustrack', 'nexttrack', 'seekto', 'seekbackward', 'seekforward', 'stop'] as MediaSessionAction[]).forEach(
        (act) => safeBind(act, null)
      );
    };
  }, []);

  // 3) Sync playbackState & throttled setPositionState (every ~1s or on state change)
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    if (duration > 0 && typeof navigator.mediaSession.setPositionState === 'function') {
      try {
        navigator.mediaSession.setPositionState({
          duration: Math.max(0, duration),
          playbackRate: playbackRate || 1,
          position: Math.min(duration, Math.max(0, progressRef.current)),
        });
        lastPositionSyncRef.current = Date.now();
      } catch {}
    }
  }, [isPlaying, duration, playbackRate]);

  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      !('mediaSession' in navigator) ||
      duration <= 0 ||
      typeof navigator.mediaSession.setPositionState !== 'function'
    ) {
      return;
    }
    const now = Date.now();
    if (now - lastPositionSyncRef.current >= 950) {
      lastPositionSyncRef.current = now;
      try {
        navigator.mediaSession.setPositionState({
          duration: Math.max(0, duration),
          playbackRate: playbackRate || 1,
          position: Math.min(duration, Math.max(0, progress)),
        });
      } catch {}
    }
  }, [progress, duration, playbackRate]);

  // Document Picture-in-Picture trigger (for desktop Chrome / Edge)
  const triggerDocumentPiP = useCallback(async (): Promise<boolean> => {
    if (typeof window !== 'undefined' && 'documentPictureInPicture' in window) {
      try {
        const pipWindow = await (window as any).documentPictureInPicture.requestWindow({
          width: 360,
          height: 180,
        });

        const container = document.createElement('div');
        container.style.cssText =
          'background:#0d0d10;color:#fff;font-family:sans-serif;padding:12px;display:flex;flex-direction:column;gap:8px;height:100%;box-sizing:border-box;justify-content:center;align-items:center;text-align:center;';

        const titleEl = document.createElement('div');
        titleEl.style.cssText = 'font-weight:bold;font-size:13px;max-width:90%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        titleEl.textContent = currentTrack?.title || 'YouTube Music';

        const artistEl = document.createElement('div');
        artistEl.style.cssText = 'font-size:11px;color:#aaa;';
        artistEl.textContent = currentTrack?.artist || '';

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:12px;margin-top:6px;';

        const prevBtn = document.createElement('button');
        prevBtn.textContent = '⏮';
        prevBtn.style.cssText = 'background:#222;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;';
        prevBtn.onclick = () => prevTrack();

        const playBtn = document.createElement('button');
        playBtn.textContent = isPlaying ? '⏸' : '▶';
        playBtn.style.cssText = 'background:#dc2626;color:#fff;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-weight:bold;';
        playBtn.onclick = () => togglePlay();

        const nextBtn = document.createElement('button');
        nextBtn.textContent = '⏭';
        nextBtn.style.cssText = 'background:#222;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;';
        nextBtn.onclick = () => nextTrack();

        btnRow.appendChild(prevBtn);
        btnRow.appendChild(playBtn);
        btnRow.appendChild(nextBtn);

        container.appendChild(titleEl);
        container.appendChild(artistEl);
        container.appendChild(btnRow);

        pipWindow.document.body.style.margin = '0';
        pipWindow.document.body.appendChild(container);
        return true;
      } catch (err) {
        console.warn('PiP window failed:', err);
        return false;
      }
    }
    return false;
  }, [currentTrack, isPlaying, prevTrack, nextTrack, togglePlay]);

  const setVolume = useCallback((val: number) => {
    const clamped = Math.max(0, Math.min(100, val));
    targetVolumeRef.current = clamped;
    setVolumeState(clamped);
    const nextMuted = clamped > 0 ? false : isMuted;
    if (clamped > 0 && isMuted) {
      setIsMuted(false);
    }
    audioDspEngine.setVolume(clamped, nextMuted);
    const win = window as any;
    if (win.__ytPlayer && typeof win.__ytPlayer.setVolume === 'function') {
      win.__ytPlayer.setVolume(clamped);
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      audioDspEngine.setVolume(targetVolumeRef.current, next);
      const win = window as any;
      if (win.__ytPlayer) {
        if (next && typeof win.__ytPlayer.mute === 'function') {
          win.__ytPlayer.mute();
        } else if (!next && typeof win.__ytPlayer.unMute === 'function') {
          win.__ytPlayer.unMute();
        }
      }
      return next;
    });
  }, []);

  const cycleShuffleMode = useCallback(async () => {
    setShuffleMode((prev) => {
      if (prev === 'off') {
        setIsShuffle(true);
        showToast('🔀 シャッフル再生: ON', 'info', 1500);
        return 'on';
      }
      if (prev === 'on') {
        setIsShuffle(true);
        if (currentTrack) {
          api.getRelated(currentTrack.id).then((related) => {
            if (related && related.length > 0) {
              setQueue((curr) => {
                const newItems = related.slice(0, 5).filter((r) => !curr.some((c) => c.id === r.id));
                return [...curr, ...newItems];
              });
              showToast('✨ スマートシャッフル: おすすめ曲をキューに追加しました', 'success', 2500);
            }
          }).catch(() => {});
        }
        return 'smart';
      }
      setIsShuffle(false);
      showToast('シャッフル再生: OFF', 'info', 1500);
      return 'off';
    });
  }, [currentTrack, showToast]);

  const toggleShuffle = useCallback(() => {
    cycleShuffleMode();
  }, [cycleShuffleMode]);

  const setPlaybackRate = useCallback((rate: number) => {
    setPlaybackRateState(rate);
    audioDspEngine.setPlaybackRate(rate);
    try {
      const win = window as any;
      if (win.__ytPlayer && typeof win.__ytPlayer.setPlaybackRate === 'function') {
        win.__ytPlayer.setPlaybackRate(rate);
      }
      const localAudio = document.querySelector('audio#local-audio-element') as HTMLAudioElement;
      if (localAudio) {
        localAudio.playbackRate = rate;
      }
    } catch {}
    showToast(`再生速度: ${rate}x`, 'info', 1500);
  }, [showToast]);

  const setAudioQuality = useCallback((q: AudioQualityMode) => {
    setAudioQualityState(q);
    audioDspEngine.setAudioQuality(q);
    try {
      localStorage.setItem('yt_audio_quality', q);
    } catch {}
    const labels: Record<AudioQualityMode, string> = {
      auto: '自動',
      low: '低音質 (データ節約)',
      normal: '標準 (160kbps)',
      high: '高音質 (256kbps AAC/Opus)',
      lossless: 'ロスレス CD音質 (16bit/44.1kHz DSP)',
      hires: 'ハイレゾ対応 (24bit/96kHz DSP)',
    };
    showToast(`音質設定: ${labels[q]}`, 'success', 2200);
  }, [showToast]);

  // Zero Connect Device Registration Heartbeat & Remote Command Listener
  const connectActionRefs = useRef({
    playTrack,
    pause,
    resume,
    togglePlay,
    nextTrack,
    prevTrack,
    seekTo,
    setVolume,
    setQueue,
    setQueueIndex,
    currentTrack,
    queue,
    isPlaying,
    progress,
    duration,
    volume,
    deviceMode,
    deviceName,
    pairingCode,
    username: currentUser?.username,
  });
  connectActionRefs.current = {
    playTrack,
    pause,
    resume,
    togglePlay,
    nextTrack,
    prevTrack,
    seekTo,
    setVolume,
    setQueue,
    setQueueIndex,
    currentTrack,
    queue,
    isPlaying,
    progress,
    duration,
    volume,
    deviceMode,
    deviceName,
    pairingCode,
    username: currentUser?.username,
  };

  const handledConnectCmdIdsRef = useRef<Set<string>>(new Set());

  const pushConnectStateNow = useCallback(() => {
    const snap = connectActionRefs.current;
    api
      .registerConnectDevice({
        deviceId,
        name: snap.deviceName,
        deviceType: snap.deviceMode || 'pc',
        username: snap.username,
        pairingCode: snap.pairingCode,
        isPlaying: snap.isPlaying,
        positionSec: Math.floor(progressRef.current || snap.progress || 0),
        durationSec: Math.floor(durationRef.current || snap.duration || snap.currentTrack?.durationSeconds || 0),
        volume: snap.volume,
        currentTrack: snap.currentTrack,
        queue: snap.queue.slice(0, 25),
      })
      .then((res) => {
        if (Array.isArray(res.devices)) setConnectDevices(res.devices);
        if (Array.isArray(res.pendingCommands) && res.pendingCommands.length > 0) {
          res.pendingCommands.forEach((cmd) => executeConnectCommandRef.current(cmd));
        }
      })
      .catch(() => {});
    socialSocket.bindDevice(deviceId, snap.pairingCode, snap.username);
  }, [deviceId]);

  const executeConnectCommandRef = useRef<(cmd: ConnectCommandPayload) => void>(() => {});
  executeConnectCommandRef.current = (cmd: ConnectCommandPayload) => {
    if (!cmd || (cmd.targetDeviceId && cmd.targetDeviceId !== deviceId)) return;
    if (cmd.fromDeviceId === deviceId && !cmd.targetDeviceId) return;
    if (cmd.cmdId) {
      if (handledConnectCmdIdsRef.current.has(cmd.cmdId)) return;
      handledConnectCmdIdsRef.current.add(cmd.cmdId);
      if (handledConnectCmdIdsRef.current.size > 120) {
        const first = handledConnectCmdIdsRef.current.values().next().value;
        if (first) handledConnectCmdIdsRef.current.delete(first);
      }
    }

    const snap = connectActionRefs.current;
    const fromLabel = cmd.fromDeviceName || '別の端末';

    if (cmd.action === 'play') {
      snap.resume();
      showToast(`${fromLabel} から再生を開始しました`, 'info', 2000);
    } else if (cmd.action === 'pause') {
      snap.pause();
      showToast(`${fromLabel} から一時停止しました`, 'info', 2000);
    } else if (cmd.action === 'toggle') {
      snap.togglePlay();
    } else if (cmd.action === 'next') {
      snap.nextTrack(true);
      showToast(`${fromLabel} から次の曲へスキップ`, 'info', 2000);
    } else if (cmd.action === 'prev') {
      snap.prevTrack();
      showToast(`${fromLabel} から前の曲へ戻しました`, 'info', 2000);
    } else if (cmd.action === 'seek') {
      const targetSec = typeof cmd.positionSec === 'number' ? cmd.positionSec : cmd.seekSec;
      if (typeof targetSec === 'number') snap.seekTo(targetSec);
    } else if (cmd.action === 'volume' && typeof cmd.volume === 'number') {
      snap.setVolume(cmd.volume);
    } else if (cmd.action === 'playTrack' && cmd.track) {
      snap.playTrack(cmd.track, cmd.queue, {
        source: `Zero Connect (${fromLabel}から再生)`,
        subtitle: cmd.track.artist,
      });
      showToast(`${fromLabel} から「${cmd.track.title}」を再生`, 'success', 2400);
    } else if (cmd.action === 'transfer' && cmd.track) {
      const seekTarget = typeof cmd.positionSec === 'number' ? cmd.positionSec : 0;
      snap
        .playTrack(cmd.track, cmd.queue, {
          source: `${fromLabel}から引き継ぎ再生`,
          subtitle: cmd.track.artist,
        })
        .then(() => {
          if (seekTarget > 1) {
            setTimeout(() => snap.seekTo(seekTarget), 500);
          }
        });
      showToast(`${fromLabel} から「${cmd.track.title}」を引き継ぎました`, 'success', 2800);
    }

    // Push updated device snapshot quickly back to server so remote controller updates immediately
    setTimeout(() => pushConnectStateNow(), 280);
    setTimeout(() => pushConnectStateNow(), 950);
  };

  useEffect(() => {
    pushConnectStateNow();
    const intervalMs = connectModalOpen ? 3000 : 10000;
    const timer = setInterval(pushConnectStateNow, intervalMs);
    return () => clearInterval(timer);
  }, [
    pushConnectStateNow,
    deviceName,
    pairingCode,
    currentUser?.username,
    currentTrack?.id,
    isPlaying,
    volume,
    connectModalOpen,
  ]);

  useEffect(() => {
    const handleDevicesPayload = (payload: any) => {
      if (Array.isArray(payload?.devices)) {
        setConnectDevices(payload.devices);
      }
    };
    const unsubDevices = socialSocket.on('connect:devices', handleDevicesPayload);
    const unsubDevicesUpdate = socialSocket.on('connect:devices_update', handleDevicesPayload);
    const unsubCmd = socialSocket.on('connect:command', (cmd: ConnectCommandPayload) => {
      executeConnectCommandRef.current(cmd);
    });
    return () => {
      unsubDevices();
      unsubDevicesUpdate();
      unsubCmd();
    };
  }, [deviceId]);


  // Calculate Spotify Wrapped listening stats
  const listeningStats = useMemo(() => {
    const items = Object.values(historyStats);
    const totalSecs = items.reduce((acc, curr) => acc + (curr.seconds || 0), 0);
    const sortedTracks = [...items].sort((a, b) => b.count - a.count);

    const artistCounts: Record<string, number> = {};
    items.forEach((item) => {
      const art = item.track.artist || 'Unknown';
      artistCounts[art] = (artistCounts[art] || 0) + item.count;
    });
    const sortedArtists = Object.entries(artistCounts)
      .map(([artist, count]) => ({ artist, count }))
      .sort((a, b) => b.count - a.count);

    const hr = new Date().getHours();
    let timeOfDay = '深夜型リスナー 🌙';
    if (hr >= 5 && hr < 11) timeOfDay = '朝活・爽快リスナー 🌅';
    else if (hr >= 11 && hr < 17) timeOfDay = '日中・作業集中リスナー ☀️';
    else if (hr >= 17 && hr < 23) timeOfDay = '夜のリラックスリスナー 🌆';

    const totalMins = Math.round(totalSecs / 60);
    return {
      totalMinutes: totalMins,
      totalMinutesListened: totalMins,
      totalPlayedTracks: sortedTracks.length,
      topTracks: sortedTracks,
      topArtists: sortedArtists,
      timeOfDay,
    };
  }, [historyStats]);

  const cycleRepeat = useCallback(() => {
    setRepeatMode((prev) => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
    });
  }, []);

  const toggleEndlessRadio = useCallback(() => {
    setEndlessRadioActive((prev) => !prev);
  }, []);

  const toggleDigestMode = useCallback(() => {
    setDigestMode((prev) => {
      const next = !prev;
      digestJumpedTrackRef.current = null;
      digestStartPlaySecRef.current = null;
      setDigestRemainingSec(25);
      if (next && currentTrack && duration > 45) {
        const targetHighlight =
          trackTimestamps?.highlightStartSec && trackTimestamps.highlightStartSec > 5
            ? trackTimestamps.highlightStartSec
            : Math.round(duration * 0.32);
        digestJumpedTrackRef.current = currentTrack.id;
        digestStartPlaySecRef.current = targetHighlight;
        seekTo(targetHighlight);
        showToast('⚡ ダイジェスト再生 ON（サビ・見どころ25秒連続再生）', 'info', 2500);
      } else if (!next) {
        showToast('ダイジェスト再生 OFF', 'info', 1500);
      }
      return next;
    });
  }, [currentTrack, duration, trackTimestamps, seekTo, showToast]);

  const replenishQueueInternal = useCallback(
    async (manual = false): Promise<number> => {
      if (!currentTrack || currentTrack.isLocal || !navigator.onLine) return 0;
      if (isFetchingRadioRef.current) return 0;
      if (!manual && Date.now() - lastAutoEmptyAtRef.current < 20000) return 0;

      isFetchingRadioRef.current = true;
      setIsAutoSelectingQueue(true);
      let addedCount = 0;

      try {
        const existingIds = new Set<string>();
        queue.forEach((t) => existingIds.add(t.id));
        recentTracks.slice(0, 10).forEach((t) => existingIds.add(t.id));

        // Seed from the tail of upcoming queue so continuous auto-selection keeps evolving
        const tailTrack = queue[queue.length - 1];
        const seed =
          tailTrack && !tailTrack.isLocal && tailTrack.id !== currentTrack.id
            ? tailTrack
            : currentTrack;

        const batchSize = manual ? 15 : 18;
        const fresh = await fetchAutoSelectedTracks(seed, existingIds, batchSize, manual);
        if (fresh.length > 0) {
          addedCount = fresh.length;
          lastAutoEmptyAtRef.current = 0;
          setQueue((curr) => {
            const currIds = new Set(curr.map((t) => t.id));
            const uniqueFresh = fresh.filter((t) => t.id && !currIds.has(t.id));
            if (uniqueFresh.length === 0) return curr;
            return [...curr, ...uniqueFresh];
          });
        } else if (!manual) {
          lastAutoEmptyAtRef.current = Date.now();
        }

        if (manual) {
          if (addedCount > 0) {
            showToast(`✨ 自動選曲で${addedCount}曲をキューに追加しました`, 'success', 2400);
          } else {
            showToast('新しい候補曲が見つかりませんでした', 'info', 2000);
          }
        }
      } finally {
        setIsAutoSelectingQueue(false);
        setTimeout(() => {
          isFetchingRadioRef.current = false;
        }, manual ? 800 : 2500);
      }
      return addedCount;
    },
    [currentTrack, queue, recentTracks, fetchAutoSelectedTracks, showToast]
  );

  const replenishQueueNow = useCallback(
    () => replenishQueueInternal(true),
    [replenishQueueInternal]
  );

  // Reactive auto-replenishment: keep at least 12-30 upcoming tracks whenever endless radio is ON
  useEffect(() => {
    lastAutoEmptyAtRef.current = 0;
  }, [currentTrack?.id]);

  useEffect(() => {
    if (!endlessRadioActive || !currentTrack || currentTrack.isLocal || !navigator.onLine) return;
    const remainingTracksInQueue = queue.length - 1 - queueIndex;
    if (remainingTracksInQueue < 12 && !isFetchingRadioRef.current) {
      replenishQueueInternal(false);
    }
  }, [endlessRadioActive, currentTrack?.id, queue.length, queueIndex, replenishQueueInternal]);

  const startRadioForTrack = useCallback(
    async (seedTrack: Track) => {
      setEndlessRadioActive(true);
      playTrack(seedTrack, [seedTrack]);
      try {
        const picked = await fetchAutoSelectedTracks(seedTrack, new Set([seedTrack.id]), 22, true);
        if (picked.length > 0) {
          setQueue([seedTrack, ...picked]);
          setQueueIndex(0);
        }
      } catch (e) {
        console.warn('Failed to start radio:', e);
      }
    },
    [playTrack, fetchAutoSelectedTracks]
  );

  const likedTracksRef = useRef<Track[]>(likedTracks);
  const likedAlbumsRef = useRef<Album[]>(likedAlbums);
  const likedPlaylistsRef = useRef<Playlist[]>(likedPlaylists);
  const userPlaylistsRef = useRef<UserPlaylist[]>(userPlaylists);

  useEffect(() => {
    likedTracksRef.current = likedTracks;
  }, [likedTracks]);

  useEffect(() => {
    likedAlbumsRef.current = likedAlbums;
  }, [likedAlbums]);

  useEffect(() => {
    likedPlaylistsRef.current = likedPlaylists;
  }, [likedPlaylists]);

  useEffect(() => {
    userPlaylistsRef.current = userPlaylists;
  }, [userPlaylists]);

  const toggleLikeTrack = useCallback(
    (track: Track) => {
      if (!track?.id) return;
      const current = likedTracksRef.current;
      const existingIdx = current.findIndex((t) => t.id === track.id);

      if (existingIdx !== -1) {
        const removed = current[existingIdx];
        setLikedTracks((prev) => prev.filter((t) => t.id !== track.id));
        showToast(`「${removed.title}」のお気に入りを解除しました`, 'info', 5000, {
          label: '元に戻す',
          onClick: () => {
            setLikedTracks((curr) => {
              if (curr.some((t) => t.id === removed.id)) return curr;
              const next = [...curr];
              next.splice(Math.min(existingIdx, next.length), 0, removed);
              return next;
            });
            showToast('元に戻しました', 'success', 1800);
          },
        });
      } else {
        const cleanTrack = normalizeTrack(track);
        setLikedTracks((prev) =>
          prev.some((t) => t.id === cleanTrack.id) ? prev : [cleanTrack, ...prev]
        );
        showToast(`「${cleanTrack.title}」をお気に入りに追加しました`, 'success', 4500, {
          label: 'お気に入り一覧を開く',
          onClick: openFavoritesView,
        });
      }
    },
    [showToast, openFavoritesView]
  );

  const toggleLikeAlbum = useCallback(
    (album: Album) => {
      if (!album?.id) return;
      const current = likedAlbumsRef.current;
      const existingIdx = current.findIndex((a) => a.id === album.id);

      if (existingIdx !== -1) {
        const removed = current[existingIdx];
        setLikedAlbums((prev) => prev.filter((a) => a.id !== album.id));
        showToast(`「${removed.title}」のお気に入りを解除しました`, 'info', 5000, {
          label: '元に戻す',
          onClick: () => {
            setLikedAlbums((curr) => {
              if (curr.some((a) => a.id === removed.id)) return curr;
              const next = [...curr];
              next.splice(Math.min(existingIdx, next.length), 0, removed);
              return next;
            });
            showToast('元に戻しました', 'success', 1800);
          },
        });
      } else {
        const normalized: Album = {
          ...album,
          artist: normalizeArtistName(album.artist) || album.artist,
        };
        setLikedAlbums((prev) =>
          prev.some((a) => a.id === normalized.id) ? prev : [normalized, ...prev]
        );
        showToast(`「${normalized.title}」をお気に入りに追加しました`, 'success', 4500, {
          label: 'お気に入り一覧を開く',
          onClick: openFavoritesView,
        });
      }
    },
    [showToast, openFavoritesView]
  );

  const toggleLikePlaylist = useCallback(
    (playlist: Playlist) => {
      if (!playlist?.id) return;
      const current = likedPlaylistsRef.current;
      const existingIdx = current.findIndex((p) => p.id === playlist.id);

      if (existingIdx !== -1) {
        const removed = current[existingIdx];
        setLikedPlaylists((prev) => prev.filter((p) => p.id !== playlist.id));
        showToast(`「${removed.title}」のお気に入りを解除しました`, 'info', 5000, {
          label: '元に戻す',
          onClick: () => {
            setLikedPlaylists((curr) => {
              if (curr.some((p) => p.id === removed.id)) return curr;
              const next = [...curr];
              next.splice(Math.min(existingIdx, next.length), 0, removed);
              return next;
            });
            showToast('元に戻しました', 'success', 1800);
          },
        });
      } else {
        const normalized: Playlist = {
          ...playlist,
          author: playlist.author ? normalizeArtistName(playlist.author) || playlist.author : playlist.author,
        };
        setLikedPlaylists((prev) =>
          prev.some((p) => p.id === normalized.id) ? prev : [normalized, ...prev]
        );
        showToast(`「${normalized.title}」をお気に入りに追加しました`, 'success', 4500, {
          label: 'お気に入り一覧を開く',
          onClick: openFavoritesView,
        });
      }
    },
    [showToast, openFavoritesView]
  );

  const toggleLikeUserPlaylist = useCallback(
    (playlistId: string) => {
      const target = userPlaylistsRef.current.find((pl) => pl.id === playlistId);
      if (!target) return;
      const willLike = !target.isLiked;

      setUserPlaylists((prev) =>
        prev.map((pl) => (pl.id === playlistId ? { ...pl, isLiked: willLike } : pl))
      );

      if (willLike) {
        showToast(`「${target.name}」をお気に入りに追加しました`, 'success', 4500, {
          label: 'お気に入り一覧を開く',
          onClick: openFavoritesView,
        });
      } else {
        showToast(`「${target.name}」のお気に入りを解除しました`, 'info', 5000, {
          label: '元に戻す',
          onClick: () => {
            setUserPlaylists((curr) =>
              curr.map((pl) => (pl.id === playlistId ? { ...pl, isLiked: true } : pl))
            );
            showToast('元に戻しました', 'success', 1800);
          },
        });
      }
    },
    [showToast, openFavoritesView]
  );

  const followedArtistIds = useMemo(
    () => new Set(followedArtists.map((a) => a.id)),
    [followedArtists]
  );

  const followedArtistsRef = useRef<Artist[]>(followedArtists);
  useEffect(() => {
    followedArtistsRef.current = followedArtists;
  }, [followedArtists]);

  const toggleFollowArtist = useCallback(
    (artist: Artist) => {
      if (!artist?.id) return;
      const current = followedArtistsRef.current;
      const existingIdx = current.findIndex((a) => a.id === artist.id);
      if (existingIdx !== -1) {
        const removed = current[existingIdx];
        setFollowedArtists((prev) => prev.filter((a) => a.id !== artist.id));
        showToast(`「${removed.name}」のフォローを解除しました`, 'info', 4500, {
          label: '元に戻す',
          onClick: () => {
            setFollowedArtists((curr) => {
              if (curr.some((a) => a.id === removed.id)) return curr;
              const next = [...curr];
              next.splice(Math.min(existingIdx, next.length), 0, removed);
              return next;
            });
            showToast('元に戻しました', 'success', 1800);
          },
        });
      } else {
        const normalized: Artist = {
          ...artist,
          name: normalizeArtistName(artist.name) || artist.name,
        };
        setFollowedArtists((prev) =>
          prev.some((a) => a.id === normalized.id) ? prev : [normalized, ...prev]
        );
        showToast(`「${normalized.name}」をフォローしました`, 'success', 3000);
      }
    },
    [showToast]
  );

  const addRecentSearch = useCallback((query: string) => {
    const clean = query.trim();
    if (!clean) return;
    setRecentSearches((prev) => [clean, ...prev.filter((q) => q !== clean)].slice(0, 12));
  }, []);

  const removeRecentSearch = useCallback((query: string) => {
    setRecentSearches((prev) => prev.filter((q) => q !== query));
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
  }, []);

  const addToQueue = useCallback((track: Track) => {
    const clean = normalizeTrack(track);
    setQueue((prev) => [...prev, clean]);
  }, []);

  const playNext = useCallback(
    (track: Track) => {
      const clean = normalizeTrack(track);
      if (!currentTrack || queue.length === 0) {
        playTrack(clean);
        showToast(`「${clean.title}」を再生します`, 'success', 2500, {
          label: 'キューを見る',
          onClick: () => setQueueOpen(true),
        });
        return;
      }

      forcedNextIdsRef.current.add(clean.id);
      setQueue((prev) => {
        const insertPos = Math.min(prev.length, Math.max(0, queueIndex + 1));
        const before = prev.slice(0, insertPos);
        const after = prev.slice(insertPos).filter((t) => t.id !== clean.id);
        return [...before, clean, ...after];
      });
      showToast(`「${clean.title}」を次に再生します`, 'success', 2800, {
        label: 'キューを見る',
        onClick: () => setQueueOpen(true),
      });
    },
    [currentTrack, queue.length, queueIndex, playTrack, showToast]
  );

  const moveQueueItem = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setQueue((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setQueueIndex((curr) => {
      if (fromIndex === curr) return toIndex;
      if (fromIndex < curr && toIndex >= curr) return curr - 1;
      if (fromIndex > curr && toIndex <= curr) return curr + 1;
      return curr;
    });
  }, []);

  const moveToPlayNext = useCallback(
    (index: number) => {
      if (index < 0 || index >= queue.length || index === queueIndex) return;
      const target = queue[index];
      if (!target) return;
      forcedNextIdsRef.current.add(target.id);

      if (index > queueIndex) {
        const targetIdx = queueIndex + 1;
        if (index !== targetIdx) {
          moveQueueItem(index, targetIdx);
        }
      } else {
        setQueue((prev) => {
          const insertPos = Math.min(prev.length, Math.max(0, queueIndex + 1));
          const before = prev.slice(0, insertPos);
          const after = prev.slice(insertPos).filter((t) => t.id !== target.id);
          return [...before, target, ...after];
        });
      }
      showToast(`「${target.title}」を次の曲に設定しました`, 'success', 2200);
    },
    [queue, queueIndex, moveQueueItem, showToast]
  );

  const removeFromQueue = useCallback((index: number) => {
    setQueue((prev) => prev.filter((_, idx) => idx !== index));
    setQueueIndex((curr) => {
      if (index < curr) return curr - 1;
      return curr;
    });
  }, []);

  const clearQueue = useCallback(() => {
    forcedNextIdsRef.current.clear();
    if (currentTrack) {
      setQueue([currentTrack]);
      setQueueIndex(0);
    } else {
      setQueue([]);
      setQueueIndex(0);
    }
  }, [currentTrack]);

  const createUserPlaylist = useCallback(
    (
      name: string,
      options?: {
        description?: string;
        coverImage?: string;
        tracks?: Track[];
        isCollab?: boolean;
        collabCode?: string;
        collabMembers?: string[];
        isPinned?: boolean;
      }
    ): UserPlaylist | null => {
      if (!name.trim()) return null;
      const newPl: UserPlaylist = {
        id: `pl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: name.trim(),
        description: options?.description?.trim() || undefined,
        coverImage: options?.coverImage?.trim() || undefined,
        createdAt: new Date().toISOString(),
        tracks: (options?.tracks || []).map(normalizeTrack),
        isCollab: options?.isCollab,
        collabCode: options?.collabCode,
        collabMembers: options?.collabMembers,
        isPinned: options?.isPinned,
      };
      setUserPlaylists((prev) => [newPl, ...prev]);
      return newPl;
    },
    []
  );

  const saveTracksAsPlaylist = useCallback((name: string, tracks: Track[], description?: string) => {
    if (!name.trim() || !tracks || tracks.length === 0) return;
    const newPl: UserPlaylist = {
      id: `pl_${Date.now()}`,
      name: name.trim(),
      description: description?.trim() || undefined,
      createdAt: new Date().toISOString(),
      tracks: tracks.map(normalizeTrack),
    };
    setUserPlaylists((prev) => [newPl, ...prev]);
  }, []);

  const addToUserPlaylist = useCallback((playlistId: string, track: Track) => {
    const cleanTrack = normalizeTrack(track);
    setUserPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id === playlistId) {
          const exists = pl.tracks.some((t) => t.id === cleanTrack.id);
          if (exists) return pl;
          return { ...pl, tracks: [...pl.tracks, cleanTrack] };
        }
        return pl;
      })
    );
  }, []);

  const removeFromUserPlaylist = useCallback((playlistId: string, trackId: string) => {
    setUserPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id === playlistId) {
          return { ...pl, tracks: pl.tracks.filter((t) => t.id !== trackId) };
        }
        return pl;
      })
    );
  }, []);

  const updateUserPlaylist = useCallback(
    (
      playlistId: string,
      updates: {
        name?: string;
        description?: string;
        coverImage?: string;
        tracks?: Track[];
        isPinned?: boolean;
        isCollab?: boolean;
        collabCode?: string;
        collabMembers?: string[];
      }
    ) => {
      setUserPlaylists((prev) =>
        prev.map((pl) => {
          if (pl.id !== playlistId) return pl;
          return {
            ...pl,
            name: updates.name !== undefined ? updates.name.trim() || pl.name : pl.name,
            description:
              updates.description !== undefined ? updates.description.trim() : pl.description,
            coverImage:
              updates.coverImage !== undefined
                ? updates.coverImage.trim() || undefined
                : pl.coverImage,
            tracks: updates.tracks !== undefined ? updates.tracks.map(normalizeTrack) : pl.tracks,
            isPinned: updates.isPinned !== undefined ? updates.isPinned : pl.isPinned,
            isCollab: updates.isCollab !== undefined ? updates.isCollab : pl.isCollab,
            collabCode: updates.collabCode !== undefined ? updates.collabCode : pl.collabCode,
            collabMembers:
              updates.collabMembers !== undefined ? updates.collabMembers : pl.collabMembers,
          };
        })
      );
      showToast('プレイリスト情報を更新しました', 'success', 2000);
    },
    [showToast]
  );

  const togglePinUserPlaylist = useCallback(
    (playlistId: string) => {
      const target = userPlaylistsRef.current.find((p) => p.id === playlistId);
      if (!target) return;
      const nextPin = !target.isPinned;
      setUserPlaylists((prev) =>
        prev.map((pl) => (pl.id === playlistId ? { ...pl, isPinned: nextPin } : pl))
      );
      showToast(
        nextPin ? `「${target.name}」をピン留めしました` : `「${target.name}」のピン留めを解除しました`,
        'info',
        2000
      );
    },
    [showToast]
  );

  const createFolder = useCallback(
    (name: string): PlaylistFolder | null => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      const folder: PlaylistFolder = {
        id: `folder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: trimmed,
        playlistIds: [],
        createdAt: new Date().toISOString(),
      };
      setUserFolders((prev) => [folder, ...prev]);
      showToast(`フォルダ「${trimmed}」を作成しました`, 'success', 2200);
      return folder;
    },
    [showToast]
  );

  const renameFolder = useCallback((folderId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setUserFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, name: trimmed } : f))
    );
  }, []);

  const deleteFolder = useCallback(
    (folderId: string) => {
      setUserFolders((prev) => prev.filter((f) => f.id !== folderId));
      showToast('フォルダを削除しました（プレイリストは残ります）', 'info', 2200);
    },
    [showToast]
  );

  const assignPlaylistToFolder = useCallback(
    (playlistId: string, folderId: string | null) => {
      setUserFolders((prev) =>
        prev.map((f) => {
          const filtered = f.playlistIds.filter((id) => id !== playlistId);
          if (folderId && f.id === folderId) {
            return { ...f, playlistIds: [...filtered, playlistId] };
          }
          return { ...f, playlistIds: filtered };
        })
      );
      showToast(
        folderId ? 'フォルダにプレイリストを追加しました' : 'フォルダから外しました',
        'success',
        1800
      );
    },
    [showToast]
  );

  const unhideTrack = useCallback((trackId: string) => {
    setHiddenTracks((prev) => prev.filter((t) => t.id !== trackId));
  }, []);

  const hideTrack = useCallback(
    (track: Track) => {
      const clean = normalizeTrack(track);
      hiddenTrackIdsRef.current = new Set([...hiddenTrackIdsRef.current, clean.id]);
      setHiddenTracks((prev) => {
        if (prev.some((t) => t.id === clean.id)) return prev;
        return [clean, ...prev];
      });

      // Remove from upcoming queue (after queueIndex)
      setQueue((prev) =>
        prev.filter((t, idx) => idx <= queueIndex || t.id !== clean.id)
      );

      if (currentTrack?.id === clean.id) {
        nextTrack(true);
      }

      showToast(`「${clean.title}」を非表示にしました`, 'info', 4500, {
        label: '元に戻す',
        onClick: () => {
          unhideTrack(clean.id);
          showToast('非表示を解除しました', 'success', 1800);
        },
      });
    },
    [currentTrack?.id, queueIndex, nextTrack, unhideTrack, showToast]
  );

  const unblockArtist = useCallback(
    (artistName: string) => {
      const targetKey = normalizeArtistKey(artistName);
      setBlockedArtists((prev) => prev.filter((a) => normalizeArtistKey(a) !== targetKey));
    },
    [normalizeArtistKey]
  );

  const blockArtist = useCallback(
    (artistName: string) => {
      const display = normalizeArtistName(artistName).trim() || artistName.trim();
      const targetKey = normalizeArtistKey(display);
      if (!targetKey) return;

      blockedArtistKeySetRef.current = new Set([...blockedArtistKeySetRef.current, targetKey]);
      setBlockedArtists((prev) => {
        if (prev.some((a) => normalizeArtistKey(a) === targetKey)) return prev;
        return [display, ...prev];
      });

      // Remove matching upcoming tracks from queue
      setQueue((prev) =>
        prev.filter((t, idx) => idx <= queueIndex || normalizeArtistKey(t.artist) !== targetKey)
      );

      if (currentTrack && normalizeArtistKey(currentTrack.artist) === targetKey) {
        nextTrack(true);
      }

      showToast(`「${display}」を再生しない設定にしました`, 'info', 4500, {
        label: '元に戻す',
        onClick: () => {
          unblockArtist(display);
          showToast('ブロックを解除しました', 'success', 1800);
        },
      });
    },
    [currentTrack, queueIndex, normalizeArtistKey, nextTrack, unblockArtist, showToast]
  );

  const deleteUserPlaylist = useCallback((playlistId: string) => {
    setUserPlaylists((prev) => prev.filter((pl) => pl.id !== playlistId));
  }, []);

  const reorderUserPlaylists = useCallback((fromIndex: number, toIndex: number) => {
    setUserPlaylists((prev) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= prev.length ||
        toIndex >= prev.length
      ) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const sortUserPlaylists = useCallback(
    (criteria: 'liked' | 'newest' | 'oldest' | 'name' | 'tracksDesc') => {
      setUserPlaylists((prev) => {
        const next = [...prev];
        switch (criteria) {
          case 'liked':
            next.sort((a, b) => Number(Boolean(b.isLiked)) - Number(Boolean(a.isLiked)));
            break;
          case 'newest':
            next.sort(
              (a, b) =>
                new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
            );
            break;
          case 'oldest':
            next.sort(
              (a, b) =>
                new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
            );
            break;
          case 'name':
            next.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
            break;
          case 'tracksDesc':
            next.sort((a, b) => b.tracks.length - a.tracks.length);
            break;
        }
        return next;
      });
    },
    []
  );

  const reorderUserPlaylistTracks = useCallback(
    (playlistId: string, fromIndex: number, toIndex: number) => {
      setUserPlaylists((prev) =>
        prev.map((pl) => {
          if (pl.id !== playlistId) return pl;
          if (
            fromIndex === toIndex ||
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= pl.tracks.length ||
            toIndex >= pl.tracks.length
          ) {
            return pl;
          }
          const nextTracks = [...pl.tracks];
          const [moved] = nextTracks.splice(fromIndex, 1);
          nextTracks.splice(toIndex, 0, moved);
          return { ...pl, tracks: nextTracks };
        })
      );
    },
    []
  );

  const sortUserPlaylistTracks = useCallback(
    (playlistId: string, criteria: 'title' | 'artist' | 'durationDesc' | 'reverse') => {
      setUserPlaylists((prev) =>
        prev.map((pl) => {
          if (pl.id !== playlistId) return pl;
          const nextTracks = [...pl.tracks];
          switch (criteria) {
            case 'title':
              nextTracks.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ja'));
              break;
            case 'artist':
              nextTracks.sort((a, b) => (a.artist || '').localeCompare(b.artist || '', 'ja'));
              break;
            case 'durationDesc':
              nextTracks.sort((a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0));
              break;
            case 'reverse':
              nextTracks.reverse();
              break;
          }
          return { ...pl, tracks: nextTracks };
        })
      );
    },
    []
  );

  // Internal listeners from YouTube player with Crossfade & Endless Radio
  const onPlayerTimeUpdate = useCallback(
    (current: number, total: number) => {
      setProgress(current);
      if (total > 0) setDuration(total);

      const targetVol = targetVolumeRef.current;
      const win = window as any;

      // 1. Crossfade volume modulation (YT fallback only — audioDspEngine handles dual-deck crossfade directly)
      if (!shouldUseDirectDspRef.current && crossfadeDuration > 0 && total > crossfadeDuration * 2 && targetVol > 0 && !isMuted) {
        // Fade in during initial seconds only during continuous playlist transition
        if (isTransitioningEarlyRef.current && current < crossfadeDuration) {
          const fadeInFactor = Math.min(1, Math.max(0.4, current / crossfadeDuration));
          const fadeVol = Math.round(targetVol * fadeInFactor);
          if (win.__ytPlayer && typeof win.__ytPlayer.setVolume === 'function') {
            win.__ytPlayer.setVolume(fadeVol);
          }
        } else if (current >= crossfadeDuration && isTransitioningEarlyRef.current) {
          isTransitioningEarlyRef.current = false;
        }
        // Fade out near end of track
        else if (total - current <= crossfadeDuration) {
          const remaining = Math.max(0, total - current);
          const fadeOutFactor = Math.max(0, remaining / crossfadeDuration);
          const fadeVol = Math.round(targetVol * fadeOutFactor);
          if (win.__ytPlayer && typeof win.__ytPlayer.setVolume === 'function') {
            win.__ytPlayer.setVolume(fadeVol);
          }
        }
      }

      // 2. Digest Highlight Mode (25s highlight clip per track)
      if (digestMode && currentTrack && total > 35 && userIntendedPlayingRef.current) {
        if (digestJumpedTrackRef.current !== currentTrack.id) {
          const targetStart =
            trackTimestamps?.highlightStartSec &&
            trackTimestamps.highlightStartSec > 4 &&
            trackTimestamps.highlightStartSec < total - 12
              ? trackTimestamps.highlightStartSec
              : Math.round(total * 0.32);
          digestJumpedTrackRef.current = currentTrack.id;
          digestStartPlaySecRef.current = targetStart;
          setDigestRemainingSec(25);
          if (Math.abs(current - targetStart) > 3) {
            seekTo(targetStart);
            return;
          }
        } else if (digestStartPlaySecRef.current !== null) {
          const elapsedClip = current - digestStartPlaySecRef.current;
          const remainingClip = Math.max(0, Math.ceil(25 - elapsedClip));
          setDigestRemainingSec(remainingClip);
          if (elapsedClip >= 25 && !isTransitioningEarlyRef.current) {
            isTransitioningEarlyRef.current = true;
            nextTrack(true);
            return;
          }
        }
      }

      // 3. Early gapless / dual-deck crossfade trigger
      const earlyCutoff = shouldUseDirectDspRef.current && crossfadeDuration > 1
        ? Math.min(crossfadeDuration, Math.max(1.5, total * 0.18))
        : crossfadeDuration > 0
        ? Math.min(1.0, crossfadeDuration * 0.25)
        : 0.4;
      if (
        total > 15 &&
        total - current <= earlyCutoff &&
        !isTransitioningEarlyRef.current &&
        userIntendedPlayingRef.current
      ) {
        isTransitioningEarlyRef.current = true;
        nextTrack();
      }

      // 4. Endless Emotion Radio auto-replenish queue (keep 12-30+ upcoming tracks ready)
      if (
        endlessRadioActive &&
        currentTrack &&
        !currentTrack.isLocal &&
        currentTrack.trackType !== 'podcast' &&
        !isFetchingRadioRef.current
      ) {
        const remainingTracksInQueue = queue.length - 1 - queueIndex;
        if (remainingTracksInQueue < 12) {
          replenishQueueInternal(false);
        }
      }
    },
    [
      crossfadeDuration,
      isMuted,
      nextTrack,
      endlessRadioActive,
      currentTrack,
      queue.length,
      queueIndex,
      digestMode,
      trackTimestamps,
      seekTo,
      replenishQueueInternal,
    ]
  );

  // State change from YouTube player
  const onPlayerStateChange = useCallback(
    (isPlayingState: boolean) => {
      if (!isPlayingState) {
        // Check if user actually pressed pause vs YouTube automatically pausing on background/blur
        if (userIntendedPlayingRef.current && (document.hidden || !document.hasFocus())) {
          // Overrule auto-pause on background tab
          dispatchPlayCommand();
          setTimeout(dispatchPlayCommand, 100);
          setTimeout(dispatchPlayCommand, 300);
          return;
        }
        setIsPlaying(false);
      } else {
        setIsPlaying(true);
      }
    },
    [dispatchPlayCommand]
  );

  const fallbackInProgressRef = useRef<boolean>(false);
  const triedIdsRef = useRef<Set<string>>(new Set());

  const onPlayerError = useCallback(
    async (errorCode: number, _errorMsg?: string) => {
      if (!currentTrack) return;

      // Error 101/150: The owner has disabled embedding on other websites
      // Error 100: Video not found/removed
      // Error 2: Invalid parameter
      if (errorCode === 101 || errorCode === 150 || errorCode === 100 || errorCode === 2) {
        if (fallbackInProgressRef.current) return;
        fallbackInProgressRef.current = true;
        triedIdsRef.current.add(currentTrack.id);

        showToast(`⚠️ 埋め込み制限（エラー${errorCode}）を検知。代替の公式音源へ自動切替中...`, 'warning', 3500);

        try {
          const excludeParam = encodeURIComponent(Array.from(triedIdsRef.current).join(','));
          const res = await fetch(
            `/api/music/fallback?title=${encodeURIComponent(currentTrack.title)}&artist=${encodeURIComponent(
              currentTrack.artist
            )}&exclude=${excludeParam}`
          );
          const data = await res.json();

          if (data.success && data.track && data.track.id) {
            const alternate = data.track;
            const updatedTrack: Track = {
              ...currentTrack,
              id: alternate.id,
              title: alternate.title || currentTrack.title,
              artist: alternate.artist || currentTrack.artist,
              thumbnail: alternate.thumbnail || currentTrack.thumbnail,
              duration: alternate.duration || currentTrack.duration,
              durationSeconds: alternate.durationSeconds || currentTrack.durationSeconds,
            };

            // Update in queue
            setQueue((prev) =>
              prev.map((t, idx) => (idx === queueIndex || t.id === currentTrack.id ? updatedTrack : t))
            );
            setCurrentTrack(updatedTrack);
            setIsPlaying(true);
            userIntendedPlayingRef.current = true;

            showToast(`✅ 埋め込み可能な代替音源（公式トピック版）へ自動切替しました`, 'success', 4000);

            setTimeout(() => {
              fallbackInProgressRef.current = false;
            }, 1500);
            return;
          }
        } catch (err) {
          console.warn('[AutoFallback] Failed to fetch alternative:', err);
        }

        // If fallback fails, skip to next track in queue smoothly
        showToast(`⚠️ 再生可能な代替音源が見つからないため、次の曲へスキップします`, 'info', 3000);
        setTimeout(() => {
          fallbackInProgressRef.current = false;
          nextTrack();
        }, 1200);
      }
    },
    [currentTrack, queueIndex, nextTrack, showToast]
  );

  const onPlayerTrackEnded = useCallback(() => {
    nextTrack();
  }, [nextTrack]);

  return (
    <PlayerContext.Provider
      value={{
        toastNotification,
        setToastNotification,
        showToast,
        onPlayerError,

        currentTrack,
        queue,
        queueIndex,
        isPlaying,
        progress,
        duration,
        volume,
        isMuted,
        playerMode,
        repeatMode,
        isShuffle,
        shuffleMode,
        cycleShuffleMode,
        playbackRate,
        setPlaybackRate,
        audioQuality,
        setAudioQuality,
        vocalLevel,
        setVocalLevel,
        spatialAudio,
        setSpatialAudio,
        djEqSweep,
        setDjEqSweep,
        audioStreamMeta,
        setAudioStreamMeta,
        shouldUseDirectDsp,
        markDspFallback,
        clearDspFallback,
        dspModalOpen,
        setDspModalOpen,
        aiPlaylistModalOpen,
        setAiPlaylistModalOpen,
        subscribedPodcasts,
        toggleSubscribePodcast,
        isPodcastSubscribed,
        skipBySeconds,
        deviceId,
        deviceName,
        setDeviceName,
        pairingCode,
        setPairingCode,
        connectDevices,
        refreshConnectDevices,
        sendRemoteCommand,
        wrappedModalOpen,
        setWrappedModalOpen,
        listeningStats,
        lyricsOpen,
        queueOpen,
        fullScreenPlayerOpen,
        setFullScreenPlayerOpen,
        inspectorOpen,
        activeView,
        selectedEntityId,
        searchQuery,
        likedTrackIds,
        likedTracks,
        likedAlbumIds,
        likedAlbums,
        likedPlaylistIds,
        likedPlaylists,
        followedArtistIds,
        followedArtists,
        recentSearches,
        recentTracks,
        userPlaylists,

        backgroundPlaybackEnabled,
        setBackgroundPlaybackEnabled,
        toggleBackgroundPlayback,
        wakeLockActive,
        toggleWakeLock,
        bgGuideOpen,
        setBgGuideOpen,
        triggerDocumentPiP,

        crossfadeDuration,
        setCrossfadeDuration,
        endlessRadioActive,
        toggleEndlessRadio,
        emotionRadioMood,
        startRadioForTrack,
        isAutoSelectingQueue,
        replenishQueueNow,
        digestMode,
        toggleDigestMode,
        digestRemainingSec,
        trackTimestamps,
        importModalOpen,
        setImportModalOpen,

        playTrack,
        playbackContextLabel,
        setPlaybackContextLabel,
        togglePlay,
        pause,
        resume,
        seekTo,
        nextTrack,
        prevTrack,
        setVolume,
        toggleMute,
        toggleShuffle,
        cycleRepeat,
        setPlayerMode,
        togglePlayerMode,
        videoLayout,
        setVideoLayout,
        setLyricsOpen,
        setQueueOpen,
        setInspectorOpen,
        setActiveView,
        navigateTo,
        libraryTab,
        setLibraryTab,
        libraryResetSeq,
        openFavoritesView,
        setSearchQuery,
        toggleLikeTrack,
        toggleLikeAlbum,
        toggleLikePlaylist,
        toggleLikeUserPlaylist,
        toggleFollowArtist,
        addRecentSearch,
        removeRecentSearch,
        clearRecentSearches,
        addToQueue,
        playNext,
        moveQueueItem,
        moveToPlayNext,
        removeFromQueue,
        clearQueue,
        createUserPlaylist,
        saveTracksAsPlaylist,
        addToUserPlaylist,
        removeFromUserPlaylist,
        deleteUserPlaylist,
        togglePinUserPlaylist,
        reorderUserPlaylists,
        sortUserPlaylists,
        reorderUserPlaylistTracks,
        sortUserPlaylistTracks,
        updateUserPlaylist,
        userFolders,
        createFolder,
        renameFolder,
        deleteFolder,
        assignPlaylistToFolder,

        hiddenTracks,
        hiddenTrackIds,
        blockedArtists,
        isTrackBlocked,
        isArtistBlocked,
        hideTrack,
        unhideTrack,
        blockArtist,
        unblockArtist,

        trackDetailModalTrack,
        openTrackDetailModal,
        closeTrackDetailModal,

        currentUser,
        accountEmail,
        accountModalOpen,
        setAccountModalOpen,
        registerUserAccount,
        loginUserAccount,
        logoutAccount,
        pinnedBestTracks,
        setPinnedBestTracks,
        lastCloudSyncAt,
        isSyncingCloud,
        syncAccountNow,
        stats,
        onlineCount,
        refreshStats,

        isAdmin,
        adminModalOpen,
        setAdminModalOpen,
        adminLoginWithPassword,
        trackOffsets,
        refreshTrackOffsets,

        addToPlaylistModalOpen,
        setAddToPlaylistModalOpen,
        trackToAddToPlaylist,
        openAddToPlaylistModal,

        currentLyrics,
        lyricsLoading,
        activeSyncedLyricText,
        hasManualLyricsOverride,
        overrideCurrentLyrics,
        clearLyricsOverride,
        lyricsSwitcherTrigger,
        openLyricsSwitcher,

        shareModalOpen,
        setShareModalOpen,
        shareModalPayload,
        openShareModal,

        floatingPlayerVisible,
        setFloatingPlayerVisible,
        floatingPlayerCollapsed,
        setFloatingPlayerCollapsed,

        danmakuEnabled,
        setDanmakuEnabled,
        commentsModalOpen,
        setCommentsModalOpen,
        dmModalOpen,
        setDmModalOpen,
        dmUiVisible,
        setDmUiVisible,
        toggleDmUiVisible,
        dmTargetUser,
        openDmWithUser,
        freemakeModalOpen,
        setFreemakeModalOpen,
        freemakeTargetTrack,
        openFreemakeModal,
        notificationDrawerOpen,
        setNotificationDrawerOpen,
        unreadNotificationCount,
        refreshNotifications,
        termsModalOpen,
        setTermsModalOpen,
        settingsModalOpen,
        setSettingsModalOpen,
        storyModalOpen,
        setStoryModalOpen,
        visualShareTarget,
        openVisualShareCard,
        zeroCodeModalTarget,
        openZeroCodeModal,
        closeZeroCodeModal,
        connectModalOpen,
        setConnectModalOpen,
        floatingLyricsOverlay,
        setFloatingLyricsOverlay,
        canvasEnabled,
        setCanvasEnabled,
        quizModalOpen,
        setQuizModalOpen,
        matchModalOpen,
        setMatchModalOpen,
        collabModalOpen,
        setCollabModalOpen,

        deviceMode,
        setDeviceMode,
        toggleDeviceMode,

        userIntendedPlayingRef,
        onPlayerTimeUpdate,
        onPlayerStateChange,
        onPlayerTrackEnded,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within PlayerProvider');
  }
  return context;
};
