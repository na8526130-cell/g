import React, { useState, useRef, useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';
import {
  Heart,
  History,
  ListPlus,
  Play,
  Shuffle,
  Trash2,
  Library,
  Plus,
  Link2,
  Share2,
  FolderDown,
  UploadCloud,
  Music,
  FileAudio,
  Sparkles,
  Disc,
  ListMusic,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Check,
  ListStart,
  Pencil,
  Info,
  EyeOff,
  Ban,
  ImagePlus,
  RefreshCw,
  RotateCcw,
  Loader2,
  X,
  Users,
  FolderPlus,
  Folder,
  FolderOpen,
  LayoutGrid,
  List,
  Pin,
  Search,
  Disc3,
  QrCode,
  Download,
  Globe,
  WifiOff,
  CheckCircle2,
  Cloud,
  HardDrive,
  Copy,
  Clock,
  CalendarPlus,
  Shield,
} from 'lucide-react';
import { api } from '../services/api';
import { parseLocalAudioFile } from '../services/localTracks';
import {
  getAllOfflineTracks,
  deleteOfflineTrack,
  seedDemoOfflineTrack,
  OFFLINE_TRACKS_CHANGED_EVENT,
  SHARED_OFFLINE_CHANGED_EVENT,
} from '../services/offlineStorage';
import {
  loadSharedOfflineTracks,
  uploadSharedOfflineFile,
  publishOfflineTrackToShared,
  syncSharedTracksForOffline,
  copySharedTrackToMyOffline,
  SHARED_RETENTION_OPTIONS,
  SHARED_RETENTION_LABELS,
  buildSharedOfflineUrl,
  getSharedOfflineDownloadUrl,
  formatFileSizeLabel,
  formatRemainingExpiry,
  fetchSharedOfflineItem,
  extendSharedOfflineTrack,
} from '../services/sharedOffline';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { Track } from '../types/music';
import { SafeImage } from '../components/SafeImage';

export const LibraryView: React.FC = () => {
  const {
    likedTracks,
    likedAlbums,
    likedPlaylists,
    followedArtists,
    toggleFollowArtist,
    recentTracks,
    userPlaylists,
    userFolders,
    createFolder,
    renameFolder,
    deleteFolder,
    assignPlaylistToFolder,
    togglePinUserPlaylist,
    playTrack,
    addToQueue,
    playNext,
    showToast,
    toggleLikeTrack,
    toggleLikeAlbum,
    toggleLikePlaylist,
    toggleLikeUserPlaylist,
    createUserPlaylist,
    addToUserPlaylist,
    deleteUserPlaylist,
    removeFromUserPlaylist,
    reorderUserPlaylists,
    sortUserPlaylists,
    reorderUserPlaylistTracks,
    sortUserPlaylistTracks,
    updateUserPlaylist,
    hiddenTracks,
    blockedArtists,
    unhideTrack,
    unblockArtist,
    isTrackBlocked,
    openTrackDetailModal,
    currentTrack,
    setImportModalOpen,
    openAddToPlaylistModal,
    openShareModal,
    openVisualShareCard,
    openZeroCodeModal,
    setCollabModalOpen,
    setMatchModalOpen,
    navigateTo,
    libraryTab: activeTab,
    setLibraryTab: setActiveTab,
    libraryResetSeq,
    openFreemakeModal,
    freemakeModalOpen,
    currentUser,
    isAdmin,
  } = usePlayer();

  const isOnline = useOnlineStatus();

  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [isReorderingPlaylists, setIsReorderingPlaylists] = useState(false);
  const [isReorderingTracks, setIsReorderingTracks] = useState(false);
  const [dragPlaylistIdx, setDragPlaylistIdx] = useState<number | null>(null);
  const [dragOverPlaylistIdx, setDragOverPlaylistIdx] = useState<number | null>(null);
  const [dragTrackIdx, setDragTrackIdx] = useState<number | null>(null);
  const [dragOverTrackIdx, setDragOverTrackIdx] = useState<number | null>(null);

  // Playlist edit modal state
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCoverImage, setEditCoverImage] = useState('');
  const coverFileInputRef = useRef<HTMLInputElement>(null);

  // Recommended tracks for selected playlist
  const [playlistSuggestions, setPlaylistSuggestions] = useState<Track[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionsRefreshKey, setSuggestionsRefreshKey] = useState(0);

  // Hidden/Blocked manager modal/panel
  const [showBlockedManager, setShowBlockedManager] = useState(false);

  // Library UI state: Create bottom sheet, Folders, Grid/List toggle, Search filter, Sub-views (Albums/Artists/Folders)
  const [createSheetOpen, setCreateSheetOpen] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [searchFilterOpen, setSearchFilterOpen] = useState(false);
  const [libraryFilterQuery, setLibraryFilterQuery] = useState('');
  const [subCategory, setSubCategory] = useState<'none' | 'albums' | 'artists' | 'folders'>('none');

  useEffect(() => {
    if (libraryResetSeq > 0) {
      setSelectedPlaylistId(null);
      setSelectedFolderId(null);
      setSubCategory('none');
    }
  }, [libraryResetSeq]);

  // Local tracks state & IndexedDB persistence
  const [localTracks, setLocalTracks] = useState<Track[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isAddingDemo, setIsAddingDemo] = useState(false);
  const [publishingTrackId, setPublishingTrackId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Shared Offline (共有オフライン) state
  const [sharedTracks, setSharedTracks] = useState<Track[]>([]);
  const [sharedFromOfflineCache, setSharedFromOfflineCache] = useState(false);
  const [loadingShared, setLoadingShared] = useState(false);
  const [syncingShared, setSyncingShared] = useState(false);
  const [sharedSyncProgress, setSharedSyncProgress] = useState<{ cached: number; total: number } | null>(null);
  const [isDraggingShared, setIsDraggingShared] = useState(false);
  const [isUploadingShared, setIsUploadingShared] = useState(false);
  const [sharedUploadProgress, setSharedUploadProgress] = useState<number | null>(null);
  const [sharedUploadStage, setSharedUploadStage] = useState<string>('準備中…');
  const [sharedUploadError, setSharedUploadError] = useState<string | null>(null);
  const [sharedMetaOpen, setSharedMetaOpen] = useState(false);
  const [sharedPickedFile, setSharedPickedFile] = useState<File | null>(null);
  const [sharedUploadTitle, setSharedUploadTitle] = useState('');
  const [sharedUploadArtist, setSharedUploadArtist] = useState('');
  const [sharedUploadBy, setSharedUploadBy] = useState('');
  const [sharedRetentionIdx, setSharedRetentionIdx] = useState<number>(2); // Default: 24時間
  const [sharedAllowExtension, setSharedAllowExtension] = useState<boolean>(true);
  const [sharedResultTrack, setSharedResultTrack] = useState<Track | null>(null);
  const [sharedResultFeedback, setSharedResultFeedback] = useState<string>('');
  const [sharedLinkedTrack, setSharedLinkedTrack] = useState<Track | null>(null);
  const [sharedLinkedLoading, setSharedLinkedLoading] = useState(false);
  const [sharedLinkedError, setSharedLinkedError] = useState<string | null>(null);
  const [extendingTrackId, setExtendingTrackId] = useState<string | null>(null);
  const sharedFileInputRef = useRef<HTMLInputElement>(null);
  const sharedUploadAbortRef = useRef<AbortController | null>(null);
  const sharedShareUrlInputRef = useRef<HTMLInputElement>(null);

  const refreshLocalTracks = () => {
    getAllOfflineTracks()
      .then((stored) => setLocalTracks(stored))
      .catch((err) => console.warn('[LibraryView] Could not load offline tracks:', err));
  };

  const refreshSharedTracks = async (autoSync = true) => {
    setLoadingShared(true);
    try {
      const res = await loadSharedOfflineTracks();
      setSharedTracks(res.tracks);
      setSharedFromOfflineCache(res.fromOfflineCache);
      if (autoSync && navigator.onLine && res.tracks.some((t) => !t.isCachedOffline)) {
        setSyncingShared(true);
        syncSharedTracksForOffline(res.tracks, (cached, total) => {
          setSharedSyncProgress({ cached, total });
        })
          .then(async () => {
            const updated = await loadSharedOfflineTracks();
            setSharedTracks(updated.tracks);
            setSharedFromOfflineCache(updated.fromOfflineCache);
          })
          .finally(() => setSyncingShared(false));
      }
    } finally {
      setLoadingShared(false);
    }
  };

  // Load persistently stored tracks from IndexedDB on mount and whenever updated
  useEffect(() => {
    refreshLocalTracks();
    const onOfflineChange = () => refreshLocalTracks();
    window.addEventListener(OFFLINE_TRACKS_CHANGED_EVENT, onOfflineChange);
    return () => {
      window.removeEventListener(OFFLINE_TRACKS_CHANGED_EVENT, onOfflineChange);
    };
  }, [freemakeModalOpen]);

  // Load Shared Offline catalog & keep synced with changes
  useEffect(() => {
    refreshSharedTracks(activeTab === 'shared_offline');
    const onSharedChange = () => {
      loadSharedOfflineTracks().then((res) => {
        setSharedTracks(res.tracks);
        setSharedFromOfflineCache(res.fromOfflineCache);
      });
    };
    window.addEventListener(SHARED_OFFLINE_CHANGED_EVENT, onSharedChange);
    return () => {
      window.removeEventListener(SHARED_OFFLINE_CHANGED_EVENT, onSharedChange);
    };
  }, [activeTab, isOnline]);

  // Handle deep-linked ?shared_file=<token> shared offline URLs
  useEffect(() => {
    const loadPendingSharedToken = async (token?: string | null) => {
      let target = token;
      if (!target) {
        try {
          target = sessionStorage.getItem('zero_music_pending_shared_file');
          if (target) sessionStorage.removeItem('zero_music_pending_shared_file');
        } catch {}
      }
      if (!target) return;
      setSharedLinkedLoading(true);
      setSharedLinkedError(null);
      try {
        const item = await fetchSharedOfflineItem(target);
        setSharedLinkedTrack(item);
      } catch (err: any) {
        setSharedLinkedTrack(null);
        setSharedLinkedError(err?.message || '共有ファイルの読み込みに失敗しました');
      } finally {
        setSharedLinkedLoading(false);
      }
    };

    loadPendingSharedToken();

    const onOpenSharedFile = (ev: Event) => {
      const customEv = ev as CustomEvent<{ token?: string }>;
      if (customEv.detail?.token) {
        try {
          sessionStorage.removeItem('zero_music_pending_shared_file');
        } catch {}
        loadPendingSharedToken(customEv.detail.token);
      }
    };
    window.addEventListener('zero-shared-file-open', onOpenSharedFile);
    return () => {
      window.removeEventListener('zero-shared-file-open', onOpenSharedFile);
    };
  }, []);

  useEffect(() => {
    if (currentUser?.username && !sharedUploadBy) {
      setSharedUploadBy(currentUser.username);
    }
  }, [currentUser?.username]);

  const handleAudioFiles = async (files: FileList | File[]) => {
    const audioFiles = Array.from(files).filter(
      (f) => f.type.startsWith('audio/') || /\.(mp3|wav|flac|m4a|aac|ogg|opus|mp4|webm)$/i.test(f.name)
    );
    if (audioFiles.length === 0) return;

    setIsProcessingFiles(true);
    const parsed: Track[] = [];
    for (const file of audioFiles) {
      try {
        const track = await parseLocalAudioFile(file);
        parsed.push(track);
      } catch (err) {
        console.warn('Failed to parse audio file:', file.name, err);
      }
    }
    setLocalTracks((prev) => [...parsed, ...prev]);
    setIsProcessingFiles(false);
  };

  const isValidSharedFile = (f: File) =>
    f.type.startsWith('audio/') ||
    f.type.startsWith('video/') ||
    f.type === 'application/octet-stream' ||
    f.type === '' ||
    /\.(mp3|wav|flac|m4a|m4b|m4r|aac|ogg|oga|opus|webm|mp4|m4v|mov|mkv|avi|3gp|wma|aif|aiff|caf|amr|mpeg|mpga|ts)$/i.test(
      f.name
    );

  const handleSharedFilePick = (file: File | null | undefined) => {
    if (!file) return;
    if (isUploadingShared) {
      setSharedUploadError('アップロード中は別のファイルを選択できません。');
      return;
    }
    if (!isValidSharedFile(file)) {
      const msg = '音声・動画ファイル（MP3 / WAV / FLAC / M4A / OGG / MP4 / MOV 等）を選択してください';
      setSharedUploadError(msg);
      showToast(msg, 'warning');
      return;
    }
    if (file.size > 150 * 1024 * 1024) {
      setSharedPickedFile(null);
      const msg = 'ファイルサイズは150 MiB以下にしてください。';
      setSharedUploadError(msg);
      showToast(msg, 'warning');
      return;
    }
    setSharedResultTrack(null);
    setSharedResultFeedback('');
    setSharedUploadError(null);
    setSharedPickedFile(file);
    const base = file.name.replace(/\.[^/.]+$/, '');
    if (base.includes(' - ')) {
      const parts = base.split(' - ');
      setSharedUploadArtist(parts[0].trim());
      setSharedUploadTitle(parts.slice(1).join(' - ').trim());
    } else {
      setSharedUploadArtist('');
      setSharedUploadTitle(base);
    }
  };

  const handleSharedResetPanel = () => {
    setSharedPickedFile(null);
    setSharedResultTrack(null);
    setSharedResultFeedback('');
    setSharedUploadTitle('');
    setSharedUploadArtist('');
    setSharedUploadError(null);
    setSharedUploadProgress(null);
    setSharedUploadStage('準備中…');
    if (sharedFileInputRef.current) {
      sharedFileInputRef.current.value = '';
    }
  };

  const handleSharedFilesUpload = async (files: FileList | File[]) => {
    const pickedList = Array.from(files);
    const validFiles = pickedList.filter(isValidSharedFile);
    if (validFiles.length === 0) {
      const msg = '音声・動画ファイル（MP3 / WAV / FLAC / M4A / OGG / MP4 / MOV 等）を選択してください';
      setSharedUploadError(msg);
      showToast(msg, 'warning');
      return;
    }
    if (!navigator.onLine) {
      const msg = 'オフライン中は共有サーバーへアップロードできません（オンライン接続時に実行してください）';
      setSharedUploadError(msg);
      showToast(msg, 'warning');
      return;
    }

    const snapshots = validFiles.map((f) => ({
      blob: f.slice(0, f.size, f.type || 'audio/mpeg'),
      name: f.name,
    }));

    const retentionMinutes = SHARED_RETENTION_OPTIONS[sharedRetentionIdx] ?? 24 * 60;
    const abortController = new AbortController();
    sharedUploadAbortRef.current = abortController;

    setSharedUploadError(null);
    setSharedResultTrack(null);
    setSharedResultFeedback('');
    setSharedUploadProgress(0);
    setSharedUploadStage('準備中…');
    setIsUploadingShared(true);

    let successCount = 0;
    let lastUploaded: Track | null = null;
    try {
      for (let i = 0; i < snapshots.length; i++) {
        const snap = snapshots[i];
        const isSingle = snapshots.length === 1;
        const uploaded = await uploadSharedOfflineFile(snap.blob, {
          filename: snap.name,
          title: isSingle && sharedUploadTitle.trim() ? sharedUploadTitle.trim() : undefined,
          artist: isSingle && sharedUploadArtist.trim() ? sharedUploadArtist.trim() : undefined,
          uploadedBy: sharedUploadBy.trim() || currentUser?.username || 'ゲスト',
          retentionMinutes,
          allowExtension: sharedAllowExtension,
          signal: abortController.signal,
          onProgress: (pct, stageLabel) => {
            const overall = Math.round(((i + pct / 100) / snapshots.length) * 100);
            setSharedUploadProgress(overall);
            if (stageLabel) {
              setSharedUploadStage(
                snapshots.length > 1
                  ? `(${i + 1}/${snapshots.length}) ${stageLabel}`
                  : stageLabel
              );
            }
          },
        });
        lastUploaded = uploaded;
        setSharedTracks((prev) => [uploaded, ...prev.filter((t) => t.id !== uploaded.id)]);
        successCount++;
      }
      setSharedPickedFile(null);
      setSharedUploadTitle('');
      setSharedUploadArtist('');
      if (lastUploaded) {
        setSharedResultTrack(lastUploaded);
      }
      showToast(
        `${successCount}曲を「共有オフライン」に公開＆共有URLを発行しました`,
        'success',
        3800
      );
    } catch (err: any) {
      const errMsg = err?.message || '共有オフラインへのアップロードに失敗しました';
      setSharedUploadError(errMsg);
      showToast(errMsg, 'warning', 4500);
    } finally {
      sharedUploadAbortRef.current = null;
      setIsUploadingShared(false);
      setSharedUploadProgress(null);
      if (sharedFileInputRef.current) {
        sharedFileInputRef.current.value = '';
      }
    }
  };

  const handleCopySharedUrl = async (track: Track, isResultPanel = false) => {
    const url = buildSharedOfflineUrl(track);
    try {
      await navigator.clipboard.writeText(url);
      if (isResultPanel) {
        setSharedResultFeedback('共有URLをコピーしました。');
      } else {
        showToast('共有URLをコピーしました', 'success', 2400);
      }
    } catch {
      if (isResultPanel && sharedShareUrlInputRef.current) {
        sharedShareUrlInputRef.current.focus();
        sharedShareUrlInputRef.current.select();
        const copied = document.execCommand('copy');
        setSharedResultFeedback(
          copied ? '共有URLをコピーしました。' : 'URLを選択しました。コピーしてください。'
        );
      } else {
        showToast(url, 'info', 4000);
      }
    }
  };

  const handleExtendSharedTrack = async (track: Track) => {
    if (!navigator.onLine) {
      showToast('オフライン中は有効期限を延長できません', 'warning');
      return;
    }
    setExtendingTrackId(track.id);
    try {
      const updated = await extendSharedOfflineTrack(track.shareToken || track.id);
      setSharedTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      if (sharedResultTrack?.id === updated.id) {
        setSharedResultTrack(updated);
      }
      if (sharedLinkedTrack?.id === updated.id) {
        setSharedLinkedTrack(updated);
      }
      showToast(
        `有効期限を7日間延長しました（${
          updated.expiresAt ? new Date(updated.expiresAt).toLocaleString('ja-JP') : '無期限'
        }）`,
        'success',
        3400
      );
    } catch (err: any) {
      showToast(err?.message || '有効期限の延長に失敗しました', 'warning');
    } finally {
      setExtendingTrackId(null);
    }
  };

  const handlePublishLocalToShared = async (track: Track) => {
    if (!navigator.onLine) {
      showToast('オフライン中は共有公開できません', 'warning');
      return;
    }
    setPublishingTrackId(track.id);
    try {
      const uploaded = await publishOfflineTrackToShared(
        track,
        currentUser?.username || sharedUploadBy.trim() || 'ゲスト'
      );
      setSharedTracks((prev) => [uploaded, ...prev.filter((t) => t.id !== uploaded.id)]);
      showToast(`「${track.title}」を共有オフラインに公開しました`, 'success', 3400, {
        label: '共有オフラインを開く',
        onClick: () => setActiveTab('shared_offline'),
      });
    } catch (err: any) {
      showToast(err?.message || '共有公開に失敗しました', 'warning');
    } finally {
      setPublishingTrackId(null);
    }
  };

  const handleManualSyncShared = async () => {
    if (!navigator.onLine) {
      showToast('現在オフラインのため同期できません', 'warning');
      return;
    }
    setSyncingShared(true);
    try {
      const fresh = await loadSharedOfflineTracks();
      setSharedTracks(fresh.tracks);
      const res = await syncSharedTracksForOffline(fresh.tracks, (cached, total) => {
        setSharedSyncProgress({ cached, total });
      });
      const after = await loadSharedOfflineTracks();
      setSharedTracks(after.tracks);
      showToast(
        `共有オフライン同期完了（${res.cached} / ${res.total}曲がオフライン再生可能）`,
        'success',
        3200
      );
    } finally {
      setSyncingShared(false);
    }
  };

  const handleSeedDemo = async () => {
    setIsAddingDemo(true);
    try {
      const demo = await seedDemoOfflineTrack();
      setLocalTracks((prev) => [demo, ...prev.filter((t) => t.id !== demo.id)]);
    } catch (err) {
      console.warn('Failed to seed demo track:', err);
    } finally {
      setIsAddingDemo(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleAudioFiles(e.dataTransfer.files);
    }
  };

  const handleSharedDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingShared(false);
    if (isUploadingShared) return;
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;
    if (files.length === 1) {
      handleSharedFilePick(files[0]);
    } else {
      handleSharedFilesUpload(files);
    }
  };

  const removeLocalTrack = async (id: string) => {
    await deleteOfflineTrack(id).catch(() => {});
    setLocalTracks((prev) => prev.filter((t) => t.id !== id));
  };

  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    const created = createUserPlaylist(newPlaylistName.trim());
    setNewPlaylistName('');
    setIsCreatingPlaylist(false);
    if (created && selectedFolderId) {
      assignPlaylistToFolder(created.id, selectedFolderId);
    }
  };

  const handleCreateFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const folder = createFolder(newFolderName.trim());
    setNewFolderName('');
    setIsCreatingFolder(false);
    if (folder) {
      setActiveTab('playlists');
      setSubCategory('none');
      setSelectedFolderId(folder.id);
    }
  };

  const normalizedFilter = libraryFilterQuery.trim().toLowerCase();
  const matchesQuery = (text?: string) =>
    !normalizedFilter || (text || '').toLowerCase().includes(normalizedFilter);

  const currentSelectedPlaylist = userPlaylists.find((p) => p.id === selectedPlaylistId);
  const currentSelectedFolder = userFolders.find((f) => f.id === selectedFolderId);

  const displayedPlaylists = [...userPlaylists]
    .filter((pl) => {
      if (selectedFolderId && currentSelectedFolder) {
        if (!currentSelectedFolder.playlistIds.includes(pl.id)) return false;
      }
      return matchesQuery(pl.name) || matchesQuery(pl.description);
    })
    .sort((a, b) => {
      if (isReorderingPlaylists) return 0;
      const pinDiff = (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0);
      return pinDiff;
    });

  const filteredLikedTracks = likedTracks.filter(
    (t) => matchesQuery(t.title) || matchesQuery(t.artist) || matchesQuery(t.album)
  );
  const filteredLikedAlbums = likedAlbums.filter(
    (a) => matchesQuery(a.title) || matchesQuery(a.artist)
  );
  const filteredFollowedArtists = followedArtists.filter((a) => matchesQuery(a.name));
  const filteredRecentTracks = recentTracks.filter(
    (t) => matchesQuery(t.title) || matchesQuery(t.artist)
  );

  // Fetch recommended tracks for the selected playlist
  useEffect(() => {
    if (!currentSelectedPlaylist || activeTab !== 'playlists') {
      setPlaylistSuggestions([]);
      return;
    }

    let cancelled = false;
    setLoadingSuggestions(true);

    const existingIds = new Set(currentSelectedPlaylist.tracks.map((t) => t.id));
    const seedTracks = currentSelectedPlaylist.tracks;

    const loadSuggestions = async () => {
      const collected: Track[] = [];
      const seen = new Set<string>(existingIds);
      const pushCandidate = (t?: Track) => {
        if (!t || !t.id || seen.has(t.id) || isTrackBlocked(t)) return;
        seen.add(t.id);
        collected.push(t);
      };

      try {
        if (seedTracks.length > 0) {
          const seedIdx = suggestionsRefreshKey % seedTracks.length;
          const seed = seedTracks[seedIdx] || seedTracks[0];
          const relRes = await api.getRelated(seed.id).catch(() => []);
          (Array.isArray(relRes) ? relRes : []).forEach(pushCandidate);

          if (collected.length < 6 && seed.artist) {
            const artRes = await api.search(`${seed.artist} 人気曲`, 'song').catch(() => null);
            ((artRes?.results || artRes?.songs || []) as Track[]).forEach(pushCandidate);
          }
        } else {
          const q = currentSelectedPlaylist.name?.trim() || 'J-Pop ヒット曲';
          const searchRes = await api.search(q, 'song').catch(() => null);
          ((searchRes?.results || searchRes?.songs || []) as Track[]).forEach(pushCandidate);
        }
      } catch {}

      if (!cancelled) {
        setPlaylistSuggestions(collected.slice(0, 8));
        setLoadingSuggestions(false);
      }
    };

    loadSuggestions();
    return () => {
      cancelled = true;
    };
  }, [currentSelectedPlaylist?.id, activeTab, suggestionsRefreshKey, isTrackBlocked]);

  const openPlaylistEditor = (pl: typeof userPlaylists[number]) => {
    setEditingPlaylistId(pl.id);
    setEditName(pl.name);
    setEditDescription(pl.description || '');
    setEditCoverImage(pl.coverImage || '');
  };

  const handleCoverImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        const maxSide = 360;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const compressed = canvas.toDataURL('image/jpeg', 0.8);
          setEditCoverImage(compressed);
        } else {
          setEditCoverImage(dataUrl);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSavePlaylistEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlaylistId) return;
    updateUserPlaylist(editingPlaylistId, {
      name: editName.trim() || undefined,
      description: editDescription.trim(),
      coverImage: editCoverImage.trim(),
    });
    setEditingPlaylistId(null);
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="border-b border-neutral-800/80 pb-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-red-600/25 shrink-0">
              ZM
            </div>
            <div className="min-w-0">
              <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider">
                マイ コレクション
              </span>
              <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight">
                マイライブラリ
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSearchFilterOpen((v) => !v);
                if (searchFilterOpen) setLibraryFilterQuery('');
              }}
              className={`w-9 h-9 rounded-full flex items-center justify-center border transition-colors cursor-pointer ${
                searchFilterOpen || libraryFilterQuery
                  ? 'bg-red-600/20 border-red-500/50 text-red-400'
                  : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-neutral-300'
              }`}
              title="ライブラリ内を検索"
              aria-label="ライブラリ内を検索"
            >
              <Search className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setCreateSheetOpen(true)}
              className="w-9 h-9 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-600/25 active:scale-95 transition-all cursor-pointer"
              title="プレイリスト・コラボ・Blend・フォルダを作成"
              aria-label="新規作成"
            >
              <Plus className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => setShowBlockedManager((v) => !v)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full flex items-center gap-1.5 border transition-colors shrink-0 cursor-pointer ${
                showBlockedManager
                  ? 'bg-red-600/20 border-red-500/50 text-red-300'
                  : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-800 text-neutral-300'
              }`}
              title="非表示にした曲・ブロック中のアーティストを管理"
            >
              <EyeOff className="w-3.5 h-3.5 text-neutral-400" />
              <span className="hidden sm:inline">
                非表示・ブロック ({hiddenTracks.length + blockedArtists.length})
              </span>
              <span className="sm:hidden">
                {hiddenTracks.length + blockedArtists.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setImportModalOpen(true)}
              className="px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-white font-semibold text-xs rounded-full flex items-center gap-1.5 active:scale-95 transition-all shrink-0 cursor-pointer"
            >
              <Link2 className="w-3.5 h-3.5 text-red-400" />
              <span className="hidden sm:inline">URLインポート</span>
            </button>
          </div>
        </div>

        {/* Inline Library Search Bar */}
        {searchFilterOpen && (
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={libraryFilterQuery}
              onChange={(e) => setLibraryFilterQuery(e.target.value)}
              placeholder="プレイリスト、アルバム、アーティスト、曲名で絞り込み..."
              autoFocus
              className="w-full bg-neutral-900 border border-neutral-800 focus:border-red-500 text-xs sm:text-sm text-white rounded-xl pl-10 pr-9 py-2.5 focus:outline-none"
            />
            {libraryFilterQuery && (
              <button
                type="button"
                onClick={() => setLibraryFilterQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white cursor-pointer"
                aria-label="クリア"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-0.5">
          <button
            type="button"
            onClick={() => {
              setActiveTab('shared_offline');
              setSubCategory('none');
              setSelectedPlaylistId(null);
            }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'shared_offline' && subCategory === 'none'
                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                : 'bg-neutral-900 hover:bg-neutral-800 text-emerald-300 border border-emerald-500/30'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            <span>共有オフライン ({sharedTracks.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('local');
              setSubCategory('none');
              setSelectedPlaylistId(null);
            }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'local' && subCategory === 'none'
                ? 'bg-cyan-600 text-white shadow-sm shadow-cyan-600/30'
                : 'bg-neutral-900 hover:bg-neutral-800 text-cyan-300 border border-cyan-500/30'
            }`}
          >
            <FolderDown className="w-3.5 h-3.5 text-cyan-400" />
            <span>オフライン ({localTracks.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('playlists');
              setSubCategory('none');
              setSelectedPlaylistId(null);
            }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'playlists' && subCategory === 'none'
                ? 'bg-red-600 text-white shadow-sm shadow-red-600/30'
                : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800'
            }`}
          >
            <Library className="w-3.5 h-3.5" />
            <span>プレイリスト ({userPlaylists.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('liked');
              setSubCategory('none');
              setSelectedPlaylistId(null);
            }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'liked' && subCategory === 'none'
                ? 'bg-red-600 text-white shadow-sm shadow-red-600/30'
                : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800'
            }`}
          >
            <Heart className="w-3.5 h-3.5 fill-current" />
            <span>
              お気に入り ({likedTracks.length + likedAlbums.length + likedPlaylists.length + userPlaylists.filter((p) => p.isLiked).length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSubCategory('albums');
              setSelectedPlaylistId(null);
            }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
              subCategory === 'albums'
                ? 'bg-red-600 text-white shadow-sm shadow-red-600/30'
                : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800'
            }`}
          >
            <Disc3 className="w-3.5 h-3.5" />
            <span>アルバム ({likedAlbums.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSubCategory('artists');
              setSelectedPlaylistId(null);
            }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
              subCategory === 'artists'
                ? 'bg-red-600 text-white shadow-sm shadow-red-600/30'
                : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>アーティスト ({followedArtists.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSubCategory('folders');
              setSelectedPlaylistId(null);
            }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
              subCategory === 'folders'
                ? 'bg-red-600 text-white shadow-sm shadow-red-600/30'
                : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800'
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            <span>フォルダ ({userFolders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('history');
              setSubCategory('none');
              setSelectedPlaylistId(null);
            }}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer ${
              activeTab === 'history' && subCategory === 'none'
                ? 'bg-red-600 text-white shadow-sm shadow-red-600/30'
                : 'bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>最近の再生 ({recentTracks.length})</span>
          </button>
        </div>
      </div>

      {/* Create Action Bottom Sheet ("+" button: プレイリスト / コラボプレイリスト / Blend / フォルダ) */}
      {createSheetOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setCreateSheetOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md bg-neutral-900 border-t sm:border border-neutral-800 rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:pb-6 space-y-2 shadow-2xl"
          >
            <div className="w-10 h-1 rounded-full bg-neutral-700 mx-auto mb-3 sm:hidden" />
            <div className="flex items-center justify-between px-1 pb-2">
              <h3 className="text-sm font-bold text-white">新規作成</h3>
              <button
                type="button"
                onClick={() => setCreateSheetOpen(false)}
                className="p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer"
                aria-label="閉じる"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setCreateSheetOpen(false);
                setActiveTab('playlists');
                setSubCategory('none');
                setIsCreatingPlaylist(true);
              }}
              className="w-full flex items-center gap-3.5 p-3 rounded-2xl hover:bg-neutral-800/80 transition-colors text-left cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center text-white shrink-0">
                <Music className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">プレイリスト</p>
                <p className="text-xs text-neutral-400">楽曲やエピソードでプレイリストを作成します</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setCreateSheetOpen(false);
                setCollabModalOpen(true);
              }}
              className="w-full flex items-center gap-3.5 p-3 rounded-2xl hover:bg-neutral-800/80 transition-colors text-left cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center text-white shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">コラボプレイリスト</p>
                <p className="text-xs text-neutral-400">友達と一緒にプレイリストを作成できます</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setCreateSheetOpen(false);
                setMatchModalOpen(true);
              }}
              className="w-full flex items-center gap-3.5 p-3 rounded-2xl hover:bg-neutral-800/80 transition-colors text-left cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center text-red-400 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Blend</p>
                <p className="text-xs text-neutral-400">友達と音楽の好みを組み合わせてプレイリストを作成</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setCreateSheetOpen(false);
                setActiveTab('playlists');
                setSubCategory('none');
                setIsCreatingFolder(true);
              }}
              className="w-full flex items-center gap-3.5 p-3 rounded-2xl hover:bg-neutral-800/80 transition-colors text-left cursor-pointer"
            >
              <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center text-white shrink-0">
                <FolderPlus className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">フォルダ</p>
                <p className="text-xs text-neutral-400">プレイリストを整理できます</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Hidden Tracks & Blocked Artists Management Panel */}
      {showBlockedManager && (
        <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-4 sm:p-5 space-y-5 shadow-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <EyeOff className="w-4 h-4 text-red-500" />
              <h2 className="text-sm font-bold text-white">
                非表示の曲・再生しないアーティストの管理
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowBlockedManager(false)}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer"
              aria-label="閉じる"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-neutral-400">
            非表示にした曲や再生しないアーティストは、自動キュー補充やおすすめから自動的に除外・スキップされます。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Blocked Artists */}
            <div className="bg-neutral-950/60 border border-neutral-800/80 rounded-xl p-3.5 space-y-2.5">
              <h3 className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                <Ban className="w-3.5 h-3.5 text-red-400" />
                <span>再生しないアーティスト ({blockedArtists.length})</span>
              </h3>
              {blockedArtists.length === 0 ? (
                <p className="text-xs text-neutral-500 py-3">
                  ブロック中のアーティストはありません。
                </p>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {blockedArtists.map((artistName) => (
                    <div
                      key={artistName}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-neutral-900/90 border border-neutral-800/70"
                    >
                      <span className="text-xs font-medium text-white truncate">
                        {artistName}
                      </span>
                      <button
                        type="button"
                        onClick={() => unblockArtist(artistName)}
                        className="px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-[11px] font-semibold text-neutral-200 flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>解除</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Hidden Tracks */}
            <div className="bg-neutral-950/60 border border-neutral-800/80 rounded-xl p-3.5 space-y-2.5">
              <h3 className="text-xs font-bold text-neutral-300 flex items-center gap-1.5">
                <EyeOff className="w-3.5 h-3.5 text-red-400" />
                <span>非表示の曲 ({hiddenTracks.length})</span>
              </h3>
              {hiddenTracks.length === 0 ? (
                <p className="text-xs text-neutral-500 py-3">
                  非表示にした曲はありません。
                </p>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {hiddenTracks.map((track) => (
                    <div
                      key={track.id}
                      className="flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg bg-neutral-900/90 border border-neutral-800/70"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <SafeImage
                          src={track.thumbnail}
                          alt={track.title}
                          useBase64
                          className="w-8 h-8 rounded object-cover bg-neutral-800 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-white truncate">{track.title}</p>
                          <p className="text-[11px] text-neutral-400 truncate">{track.artist}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => unhideTrack(track.id)}
                        className="px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-[11px] font-semibold text-neutral-200 flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>再表示</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Subcategory: Saved Albums */}
      {subCategory === 'albums' && !selectedPlaylistId && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Disc3 className="w-4 h-4 text-red-500" />
              <span>保存済みアルバム ({filteredLikedAlbums.length})</span>
            </h2>
            <button
              type="button"
              onClick={() => setViewMode((m) => (m === 'list' ? 'grid' : 'list'))}
              className="p-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white cursor-pointer"
              title={viewMode === 'list' ? 'グリッド表示に切替' : 'リスト表示に切替'}
            >
              {viewMode === 'list' ? <LayoutGrid className="w-4 h-4" /> : <List className="w-4 h-4" />}
            </button>
          </div>
          {filteredLikedAlbums.length === 0 ? (
            <div className="py-16 text-center text-xs text-neutral-500">
              お気に入りのアルバムがありません。
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
              {filteredLikedAlbums.map((album) => (
                <div
                  key={album.id}
                  onClick={() => navigateTo('album', album.id)}
                  className="group p-3 bg-neutral-900/50 hover:bg-neutral-800/70 border border-neutral-800/80 hover:border-red-600/40 rounded-2xl cursor-pointer flex flex-col gap-2 transition-all"
                >
                  <div className="aspect-square rounded-xl overflow-hidden bg-neutral-800 relative">
                    <SafeImage
                      src={album.thumbnail}
                      alt={album.title}
                      useBase64
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-white truncate">{album.title}</h4>
                    <p className="text-[11px] text-neutral-400 truncate">アルバム • {album.artist}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredLikedAlbums.map((album) => (
                <div
                  key={album.id}
                  onClick={() => navigateTo('album', album.id)}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-neutral-900/40 hover:bg-neutral-800/70 border border-neutral-800/60 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <SafeImage
                      src={album.thumbnail}
                      alt={album.title}
                      useBase64
                      className="w-12 h-12 rounded-lg object-cover bg-neutral-800 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{album.title}</p>
                      <p className="text-xs text-neutral-400 truncate">アルバム • {album.artist}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLikeAlbum(album);
                    }}
                    className="p-2 text-red-500 hover:text-neutral-400 cursor-pointer"
                    title="お気に入り解除"
                  >
                    <Heart className="w-4 h-4 fill-current" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Subcategory: Followed Artists */}
      {subCategory === 'artists' && !selectedPlaylistId && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-red-500" />
              <span>フォロー中のアーティスト ({filteredFollowedArtists.length})</span>
            </h2>
            <button
              type="button"
              onClick={() => setViewMode((m) => (m === 'list' ? 'grid' : 'list'))}
              className="p-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white cursor-pointer"
              title={viewMode === 'list' ? 'グリッド表示に切替' : 'リスト表示に切替'}
            >
              {viewMode === 'list' ? <LayoutGrid className="w-4 h-4" /> : <List className="w-4 h-4" />}
            </button>
          </div>
          {filteredFollowedArtists.length === 0 ? (
            <div className="py-16 text-center text-xs text-neutral-500">
              フォロー中のアーティストはまだいません。
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {filteredFollowedArtists.map((artist) => (
                <div
                  key={artist.id}
                  onClick={() => navigateTo('artist', artist.id)}
                  className="group p-3.5 bg-neutral-900/50 hover:bg-neutral-800/70 border border-neutral-800/80 hover:border-red-600/40 rounded-2xl cursor-pointer flex flex-col items-center text-center gap-2.5 transition-all"
                >
                  <div className="w-24 h-24 rounded-full overflow-hidden bg-neutral-800 shadow-lg">
                    <SafeImage
                      src={artist.thumbnail}
                      alt={artist.name}
                      useBase64
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <div className="min-w-0 w-full">
                    <h4 className="text-xs font-bold text-white truncate">{artist.name}</h4>
                    <p className="text-[11px] text-neutral-400">アーティスト</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredFollowedArtists.map((artist) => (
                <div
                  key={artist.id}
                  onClick={() => navigateTo('artist', artist.id)}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-neutral-900/40 hover:bg-neutral-800/70 border border-neutral-800/60 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <SafeImage
                      src={artist.thumbnail}
                      alt={artist.name}
                      useBase64
                      className="w-12 h-12 rounded-full object-cover bg-neutral-800 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{artist.name}</p>
                      <p className="text-xs text-neutral-400">アーティスト</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openVisualShareCard({ type: 'artist', artist });
                      }}
                      className="p-2 text-neutral-400 hover:text-white cursor-pointer"
                      title="アーティストカードをシェア"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFollowArtist(artist);
                      }}
                      className="px-3 py-1 rounded-full bg-neutral-800 hover:bg-neutral-700 text-[11px] font-semibold text-neutral-200 cursor-pointer"
                    >
                      フォロー中
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Subcategory: Folders Manager */}
      {subCategory === 'folders' && !selectedPlaylistId && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Folder className="w-4 h-4 text-red-500" />
              <span>プレイリストフォルダ ({userFolders.length})</span>
            </h2>
            <button
              type="button"
              onClick={() => setIsCreatingFolder(true)}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              <span>フォルダを作成</span>
            </button>
          </div>

          {isCreatingFolder && (
            <form
              onSubmit={handleCreateFolderSubmit}
              className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl flex items-center gap-3"
            >
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="フォルダ名を入力..."
                className="flex-1 bg-neutral-950 border border-neutral-800 text-xs text-white rounded-lg px-3 py-2 focus:outline-none focus:border-red-500"
                autoFocus
              />
              <button
                type="submit"
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg"
              >
                作成
              </button>
              <button
                type="button"
                onClick={() => setIsCreatingFolder(false)}
                className="px-3 py-2 text-neutral-400 hover:text-white text-xs"
              >
                キャンセル
              </button>
            </form>
          )}

          {userFolders.length === 0 ? (
            <div className="py-16 text-center space-y-2 text-neutral-500">
              <Folder className="w-10 h-10 mx-auto text-neutral-600" />
              <p className="text-xs">フォルダを作成してプレイリストを整理できます。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              {userFolders.map((folder) => {
                const count = userPlaylists.filter((p) => folder.playlistIds.includes(p.id)).length;
                return (
                  <div
                    key={folder.id}
                    onClick={() => {
                      setSelectedFolderId(folder.id);
                      setActiveTab('playlists');
                      setSubCategory('none');
                    }}
                    className="p-4 bg-neutral-900/50 hover:bg-neutral-800/70 border border-neutral-800 rounded-2xl cursor-pointer flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-neutral-800 flex items-center justify-center text-red-400 shrink-0">
                        <FolderOpen className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        {editingFolderId === folder.id ? (
                          <input
                            type="text"
                            value={editFolderName}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setEditFolderName(e.target.value)}
                            onBlur={() => {
                              if (editFolderName.trim()) renameFolder(folder.id, editFolderName.trim());
                              setEditingFolderId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                if (editFolderName.trim()) renameFolder(folder.id, editFolderName.trim());
                                setEditingFolderId(null);
                              }
                            }}
                            autoFocus
                            className="bg-neutral-950 border border-red-500 text-xs text-white rounded px-2 py-1 w-36 focus:outline-none"
                          />
                        ) : (
                          <p className="text-sm font-bold text-white truncate">{folder.name}</p>
                        )}
                        <p className="text-xs text-neutral-400">{count}個のプレイリスト</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingFolderId(folder.id);
                          setEditFolderName(folder.name);
                        }}
                        className="p-1.5 text-neutral-400 hover:text-white cursor-pointer"
                        title="フォルダ名を変更"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteFolder(folder.id);
                        }}
                        className="p-1.5 text-neutral-500 hover:text-red-400 cursor-pointer"
                        title="フォルダを削除"
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
      )}

      {/* Liked Tracks View */}
      {subCategory === 'none' && activeTab === 'liked' && !selectedPlaylistId && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-gradient-to-r from-red-950/40 to-neutral-900/60 border border-red-500/20 rounded-2xl">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-red-600 flex items-center justify-center text-white shadow-xl shadow-red-600/30">
                <Heart className="w-8 h-8 fill-current" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">お気に入りの曲</h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  ハートを付けたお気に入りのトラック ({likedTracks.length}曲)
                </p>
              </div>
            </div>

            {likedTracks.length > 0 && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => playTrack(likedTracks[0], likedTracks)}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-lg shadow-red-600/20"
                >
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                  <span>すべて再生</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const shuffled = [...likedTracks].sort(() => Math.random() - 0.5);
                    playTrack(shuffled[0], shuffled);
                  }}
                  className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium rounded-xl flex items-center gap-1.5"
                >
                  <Shuffle className="w-4 h-4" />
                  <span>シャッフル</span>
                </button>
              </div>
            )}
          </div>

          {/* Liked Albums Section */}
          {likedAlbums.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Disc className="w-4 h-4 text-red-500" />
                <span>お気に入りのアルバム ({likedAlbums.length})</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
                {likedAlbums.map((album) => (
                  <div
                    key={album.id}
                    onClick={() => navigateTo('album', album.id)}
                    className="group p-3 bg-neutral-900/50 hover:bg-neutral-800/70 border border-neutral-800/80 hover:border-red-600/40 rounded-2xl cursor-pointer flex flex-col gap-2 transition-all"
                  >
                    <div className="aspect-square rounded-xl overflow-hidden bg-neutral-800 relative">
                      <SafeImage
                        src={album.thumbnail}
                        alt={album.title}
                        useBase64
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLikeAlbum(album);
                        }}
                        className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/75 text-red-500 flex items-center justify-center cursor-pointer"
                        title="お気に入り解除"
                      >
                        <Heart className="w-4 h-4 fill-red-500 text-red-500" />
                      </button>
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white truncate">{album.title}</h4>
                      <p className="text-[11px] text-neutral-400 truncate">{album.artist}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Liked Playlists Section */}
          {(likedPlaylists.length > 0 || userPlaylists.some((p) => p.isLiked)) && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ListMusic className="w-4 h-4 text-red-500" />
                <span>
                  お気に入りのプレイリスト ({likedPlaylists.length + userPlaylists.filter((p) => p.isLiked).length})
                </span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
                {userPlaylists
                  .filter((p) => p.isLiked)
                  .map((pl) => (
                    <div
                      key={pl.id}
                      onClick={() => {
                        setActiveTab('playlists');
                        setSelectedPlaylistId(pl.id);
                      }}
                      className="group p-3 bg-neutral-900/50 hover:bg-neutral-800/70 border border-neutral-800/80 hover:border-red-600/40 rounded-2xl cursor-pointer flex flex-col gap-2 transition-all"
                    >
                      <div className="aspect-square rounded-xl overflow-hidden bg-neutral-800 relative flex items-center justify-center">
                        {(pl.coverImage || pl.tracks[0]?.thumbnail) ? (
                          <SafeImage
                            src={pl.coverImage || pl.tracks[0]?.thumbnail || ''}
                            alt={pl.name}
                            useBase64={!pl.coverImage?.startsWith('data:')}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <ListPlus className="w-8 h-8 text-red-500" />
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLikeUserPlaylist(pl.id);
                          }}
                          className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/75 text-red-500 flex items-center justify-center cursor-pointer"
                          title="お気に入り解除"
                        >
                          <Heart className="w-4 h-4 fill-red-500 text-red-500" />
                        </button>
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-white truncate">{pl.name}</h4>
                        <p className="text-[11px] text-neutral-400 truncate">マイプレイリスト • {pl.tracks.length}曲</p>
                      </div>
                    </div>
                  ))}
                {likedPlaylists.map((pl) => (
                  <div
                    key={pl.id}
                    onClick={() => navigateTo('album', pl.id)}
                    className="group p-3 bg-neutral-900/50 hover:bg-neutral-800/70 border border-neutral-800/80 hover:border-red-600/40 rounded-2xl cursor-pointer flex flex-col gap-2 transition-all"
                  >
                    <div className="aspect-square rounded-xl overflow-hidden bg-neutral-800 relative">
                      <SafeImage
                        src={pl.thumbnail}
                        alt={pl.title}
                        useBase64
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLikePlaylist(pl);
                        }}
                        className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/75 text-red-500 flex items-center justify-center cursor-pointer"
                        title="お気に入り解除"
                      >
                        <Heart className="w-4 h-4 fill-red-500 text-red-500" />
                      </button>
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white truncate">{pl.title}</h4>
                      <p className="text-[11px] text-neutral-400 truncate">{pl.author || 'プレイリスト'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {likedTracks.length === 0 &&
          likedAlbums.length === 0 &&
          likedPlaylists.length === 0 &&
          !userPlaylists.some((p) => p.isLiked) ? (
            <div className="py-20 text-center space-y-2 text-neutral-400">
              <Heart className="w-10 h-10 mx-auto text-neutral-600" />
              <p className="text-sm font-medium text-neutral-300">お気に入りがまだありません</p>
              <p className="text-xs text-neutral-500">
                楽曲・アルバム・プレイリストのハートアイコンをクリックすると、ここに追加されます。
              </p>
            </div>
          ) : likedTracks.length > 0 ? (
            <div className="bg-neutral-900/40 border border-neutral-800/80 rounded-2xl overflow-hidden divide-y divide-neutral-800/60 shadow-xl">
              {filteredLikedTracks.map((track, idx) => {
                const isCurrent = currentTrack?.id === track.id;
                return (
                  <div
                    key={track.id}
                    className={`flex items-center gap-3.5 px-4 py-3 hover:bg-neutral-800/50 group transition-colors ${
                      isCurrent ? 'bg-red-950/20' : ''
                    }`}
                  >
                    <span className="w-6 text-center text-xs font-mono font-bold text-neutral-500">
                      {idx + 1}
                    </span>
                    <div className="relative shrink-0">
                      <SafeImage
                        src={track.thumbnail}
                        alt={track.title}
                        useBase64
                        className="w-11 h-11 rounded-lg object-cover bg-neutral-800"
                      />
                      <button
                        type="button"
                        onClick={() => playTrack(track, likedTracks)}
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center text-white transition-opacity"
                      >
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </button>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p
                        onClick={() => playTrack(track, likedTracks)}
                        className={`text-sm font-semibold truncate cursor-pointer hover:underline ${
                          isCurrent ? 'text-red-400' : 'text-white'
                        }`}
                      >
                        {track.title}
                      </p>
                      <p className="text-xs text-neutral-400 truncate">{track.artist}</p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        type="button"
                        onClick={() => toggleLikeTrack(track)}
                        className="p-1.5 text-red-500 hover:text-neutral-400"
                        title="お気に入りから削除"
                      >
                        <Heart className="w-4 h-4 fill-current" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openAddToPlaylistModal(track)}
                        className="p-1.5 text-neutral-400 hover:text-white"
                        title="プレイリストに追加"
                      >
                        <ListPlus className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => playNext(track)}
                        className="p-1.5 text-neutral-400 hover:text-red-400 cursor-pointer"
                        title="次に再生"
                        aria-label="次に再生"
                      >
                        <ListStart className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          addToQueue(track);
                          showToast(`「${track.title}」をキューの末尾に追加しました`, 'info', 2000);
                        }}
                        className="p-1.5 text-neutral-400 hover:text-white cursor-pointer"
                        title="キューの最後に追加"
                        aria-label="キューの最後に追加"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openFreemakeModal(track)}
                        className="p-1.5 text-neutral-400 hover:text-sky-400 cursor-pointer"
                        title="ダウンロード・保存"
                        aria-label="ダウンロード・保存"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openTrackDetailModal(track)}
                        className="p-1.5 text-neutral-400 hover:text-white cursor-pointer"
                        title="楽曲の詳細"
                        aria-label="楽曲の詳細"
                      >
                        <Info className="w-4 h-4" />
                      </button>
                      <span className="text-xs font-mono text-neutral-400 tabular-nums hidden sm:inline">
                        {track.duration}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      )}

      {/* Play History View */}
      {subCategory === 'none' && activeTab === 'history' && !selectedPlaylistId && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <History className="w-4 h-4 text-red-500" />
              <span>再生履歴 (直近{recentTracks.length}曲)</span>
            </h2>
          </div>

          {filteredRecentTracks.length === 0 ? (
            <div className="py-20 text-center text-xs text-neutral-500">
              再生履歴はまだありません。
            </div>
          ) : (
            <div className="bg-neutral-900/40 border border-neutral-800/80 rounded-2xl overflow-hidden divide-y divide-neutral-800/60 shadow-xl">
              {filteredRecentTracks.map((track, idx) => (
                <div
                  key={`${track.id}-${idx}`}
                  className="flex items-center gap-3.5 px-4 py-3 hover:bg-neutral-800/50 group transition-colors"
                >
                  <span className="w-6 text-center text-xs font-mono text-neutral-500">
                    {idx + 1}
                  </span>
                  <SafeImage
                    src={track.thumbnail}
                    alt={track.title}
                    useBase64
                    className="w-10 h-10 rounded-lg object-cover bg-neutral-800 shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      onClick={() => playTrack(track)}
                      className="text-sm font-medium text-white truncate cursor-pointer hover:underline"
                    >
                      {track.title}
                    </p>
                    <p className="text-xs text-neutral-400 truncate">{track.artist}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => playNext(track)}
                      className="p-1.5 text-neutral-400 hover:text-red-400 cursor-pointer"
                      title="次に再生"
                      aria-label="次に再生"
                    >
                      <ListStart className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        addToQueue(track);
                        showToast(`「${track.title}」をキューの末尾に追加しました`, 'info', 2000);
                      }}
                      className="p-1.5 text-neutral-400 hover:text-white cursor-pointer"
                      title="キューの最後に追加"
                      aria-label="キューの最後に追加"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openAddToPlaylistModal(track)}
                      className="p-1.5 text-neutral-400 hover:text-white cursor-pointer"
                      title="プレイリストに追加"
                    >
                      <ListPlus className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openFreemakeModal(track)}
                      className="p-1.5 text-neutral-400 hover:text-sky-400 cursor-pointer"
                      title="ダウンロード・保存"
                      aria-label="ダウンロード・保存"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openTrackDetailModal(track)}
                      className="p-1.5 text-neutral-400 hover:text-white cursor-pointer"
                      title="楽曲の詳細"
                      aria-label="楽曲の詳細"
                    >
                      <Info className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => playTrack(track)}
                      className="p-1.5 text-neutral-300 hover:text-white cursor-pointer"
                      title="再生"
                    >
                      <Play className="w-4 h-4 fill-current" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Playlists View */}
      {subCategory === 'none' && activeTab === 'playlists' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {selectedFolderId && currentSelectedFolder ? (
                <button
                  type="button"
                  onClick={() => setSelectedFolderId(null)}
                  className="px-2.5 py-1 rounded-full bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-red-400" />
                  <span>{currentSelectedFolder.name}</span>
                  <X className="w-3 h-3 text-neutral-400" />
                </button>
              ) : (
                <h2 className="text-base font-bold text-white">マイコレクション</h2>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {userPlaylists.length > 1 && (
                <>
                  <select
                    aria-label="プレイリスト一覧の並び替え"
                    defaultValue=""
                    onChange={(e) => {
                      const val = e.target.value as
                        | 'liked'
                        | 'newest'
                        | 'oldest'
                        | 'name'
                        | 'tracksDesc'
                        | '';
                      if (val) {
                        sortUserPlaylists(val);
                        e.target.value = '';
                      }
                    }}
                    className="px-2.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 text-xs font-medium rounded-lg border border-neutral-700/80 focus:outline-none focus:border-red-500 cursor-pointer"
                  >
                    <option value="" disabled>
                      一括並び替え...
                    </option>
                    <option value="liked">お気に入り優先</option>
                    <option value="name">名前順 (あいうえお/A-Z)</option>
                    <option value="tracksDesc">曲数が多い順</option>
                    <option value="newest">新しい順</option>
                    <option value="oldest">古い順</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setIsReorderingPlaylists((v) => !v)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 border transition-colors cursor-pointer ${
                      isReorderingPlaylists
                        ? 'bg-red-600/20 border-red-500/50 text-red-300'
                        : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border-white/10'
                    }`}
                    title="ドラッグまたは矢印ボタンでプレイリストの表示順を手動変更"
                  >
                    {isReorderingPlaylists ? (
                      <Check className="w-3.5 h-3.5 text-red-400" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-neutral-300" />
                    )}
                    <span>{isReorderingPlaylists ? '並び替え完了' : '順番入替'}</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => setViewMode((m) => (m === 'list' ? 'grid' : 'list'))}
                className="p-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 rounded-lg border border-neutral-700/80 cursor-pointer"
                title={viewMode === 'list' ? 'グリッド表示に切替' : 'リスト表示に切替'}
                aria-label="表示モード切替"
              >
                {viewMode === 'list' ? (
                  <LayoutGrid className="w-4 h-4" />
                ) : (
                  <List className="w-4 h-4" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsCreatingFolder(true)}
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 border border-white/10 shadow transition-colors cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5 text-red-400" />
                <span className="hidden sm:inline">フォルダ</span>
              </button>
              <button
                type="button"
                onClick={() => setIsCreatingPlaylist(true)}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 shadow transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新規作成</span>
              </button>
            </div>
          </div>

          {/* New Folder input form */}
          {isCreatingFolder && (
            <form
              onSubmit={handleCreateFolderSubmit}
              className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl flex items-center gap-3"
            >
              <FolderPlus className="w-4 h-4 text-red-500 shrink-0" />
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="新しいフォルダ名を入力..."
                className="flex-1 bg-neutral-950 border border-neutral-800 text-xs text-white rounded-lg px-3 py-2 focus:outline-none focus:border-red-500"
                autoFocus
              />
              <button
                type="submit"
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg"
              >
                作成
              </button>
              <button
                type="button"
                onClick={() => setIsCreatingFolder(false)}
                className="px-3 py-2 text-neutral-400 hover:text-white text-xs"
              >
                キャンセル
              </button>
            </form>
          )}

          {/* New Playlist input form */}
          {isCreatingPlaylist && (
            <form
              onSubmit={handleCreatePlaylist}
              className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl flex items-center gap-3"
            >
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="プレイリスト名を入力..."
                className="flex-1 bg-neutral-950 border border-neutral-800 text-xs text-white rounded-lg px-3 py-2 focus:outline-none focus:border-red-500"
                autoFocus
              />
              <button
                type="submit"
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg"
              >
                作成
              </button>
              <button
                type="button"
                onClick={() => setIsCreatingPlaylist(false)}
                className="px-3 py-2 text-neutral-400 hover:text-white text-xs"
              >
                キャンセル
              </button>
            </form>
          )}

          {/* Pinned お気に入りの曲 + Folders quick strip */}
          {!selectedFolderId && (
            <div className="space-y-2.5">
              {/* Pinned Liked Songs Entry (Spotify IMG_0283 style) */}
              {matchesQuery('お気に入りの曲') && (
                <div
                  onClick={() => {
                    setActiveTab('liked');
                    setSelectedPlaylistId(null);
                  }}
                  className="p-3 bg-neutral-900/50 hover:bg-neutral-800/70 border border-neutral-800/80 hover:border-red-500/40 rounded-xl cursor-pointer flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-indigo-600 via-rose-600 to-red-500 flex items-center justify-center text-white shadow-md shrink-0">
                      <Heart className="w-5 h-5 fill-current" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white truncate">お気に入りの曲</p>
                      <p className="text-xs text-neutral-400 flex items-center gap-1.5 mt-0.5">
                        <Pin className="w-3 h-3 text-red-500 fill-red-500 shrink-0" />
                        <span>プレイリスト • {likedTracks.length}曲</span>
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Folders Strip */}
              {userFolders.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {userFolders
                    .filter((f) => matchesQuery(f.name))
                    .map((folder) => {
                      const count = userPlaylists.filter((p) =>
                        folder.playlistIds.includes(p.id)
                      ).length;
                      return (
                        <div
                          key={folder.id}
                          onClick={() => setSelectedFolderId(folder.id)}
                          className="px-3 py-2 rounded-xl bg-neutral-900/70 hover:bg-neutral-800 border border-neutral-800 flex items-center gap-2 cursor-pointer transition-colors"
                        >
                          <Folder className="w-4 h-4 text-red-400 shrink-0" />
                          <span className="text-xs font-semibold text-white">{folder.name}</span>
                          <span className="text-[11px] text-neutral-400">({count})</span>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* Playlists List or Grid */}
          <div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4'
                : 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5'
            }
          >
            {displayedPlaylists.map((pl) => {
              const plIdx = userPlaylists.findIndex((p) => p.id === pl.id);
              const assignedFolder = userFolders.find((f) => f.playlistIds.includes(pl.id));
              if (viewMode === 'grid') {
                return (
                  <div
                    key={pl.id}
                    onClick={() => setSelectedPlaylistId(pl.id)}
                    className={`group p-3 bg-neutral-900/50 hover:bg-neutral-800/70 border rounded-2xl cursor-pointer flex flex-col gap-2.5 transition-all ${
                      selectedPlaylistId === pl.id
                        ? 'border-red-500/60 bg-neutral-800/50'
                        : 'border-neutral-800'
                    }`}
                  >
                    <div className="aspect-square rounded-xl overflow-hidden bg-neutral-800 relative flex items-center justify-center">
                      {(pl.coverImage || pl.tracks[0]?.thumbnail) ? (
                        <SafeImage
                          src={pl.coverImage || pl.tracks[0]?.thumbnail || ''}
                          alt={pl.name}
                          useBase64={!pl.coverImage?.startsWith('data:')}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <ListPlus className="w-10 h-10 text-red-500" />
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePinUserPlaylist(pl.id);
                        }}
                        className={`absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center transition-opacity cursor-pointer ${
                          pl.isPinned
                            ? 'bg-red-600 text-white'
                            : 'bg-black/65 text-neutral-300 opacity-0 group-hover:opacity-100'
                        }`}
                        title={pl.isPinned ? 'ピン留め解除' : 'ピン留め'}
                      >
                        <Pin className={`w-3.5 h-3.5 ${pl.isPinned ? 'fill-current' : ''}`} />
                      </button>
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-red-400">
                        {pl.name}
                      </h3>
                      <p className="text-[11px] text-neutral-400 truncate flex items-center gap-1 mt-0.5">
                        {pl.isPinned && <Pin className="w-3 h-3 text-red-500 fill-red-500 shrink-0" />}
                        {pl.isCollab && <Users className="w-3 h-3 text-red-400 shrink-0" />}
                        <span>{pl.tracks.length}曲</span>
                      </p>
                    </div>
                  </div>
                );
              }
              return (
                <div
                  key={pl.id}
                  draggable={userPlaylists.length > 1}
                  onDragStart={() => setDragPlaylistIdx(plIdx)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragPlaylistIdx !== null && dragOverPlaylistIdx !== plIdx) {
                      setDragOverPlaylistIdx(plIdx);
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverPlaylistIdx === plIdx) setDragOverPlaylistIdx(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragPlaylistIdx !== null && dragPlaylistIdx !== plIdx) {
                      reorderUserPlaylists(dragPlaylistIdx, plIdx);
                    }
                    setDragPlaylistIdx(null);
                    setDragOverPlaylistIdx(null);
                  }}
                  onDragEnd={() => {
                    setDragPlaylistIdx(null);
                    setDragOverPlaylistIdx(null);
                  }}
                  onClick={() => setSelectedPlaylistId(pl.id)}
                  className={`p-3.5 bg-neutral-900/40 hover:bg-neutral-800/60 border rounded-xl cursor-pointer flex items-center justify-between gap-2 group transition-all ${
                    dragOverPlaylistIdx === plIdx
                      ? 'border-red-500 bg-red-950/20 scale-[1.01]'
                      : selectedPlaylistId === pl.id
                      ? 'border-red-500/50 bg-neutral-800/50'
                      : 'border-neutral-800'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {isReorderingPlaylists && (
                      <GripVertical className="w-4 h-4 text-neutral-500 shrink-0 cursor-grab active:cursor-grabbing" />
                    )}
                    <div className="w-12 h-12 rounded-lg bg-neutral-800 flex items-center justify-center text-red-500 shrink-0 overflow-hidden">
                      {(pl.coverImage || pl.tracks[0]?.thumbnail) ? (
                        <SafeImage
                          src={pl.coverImage || pl.tracks[0]?.thumbnail || ''}
                          alt={pl.name}
                          useBase64={!pl.coverImage?.startsWith('data:')}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <ListPlus className="w-6 h-6" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {pl.isPinned && (
                          <Pin className="w-3 h-3 text-red-500 fill-red-500 shrink-0" />
                        )}
                        <h3 className="text-sm font-semibold text-white truncate group-hover:text-red-400">
                          {pl.name}
                        </h3>
                      </div>
                      <p className="text-xs text-neutral-400 truncate flex items-center gap-1.5">
                        <span>{pl.tracks.length}曲</span>
                        {pl.isCollab && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-600/20 text-red-300 font-semibold">
                            コラボ
                          </span>
                        )}
                        {assignedFolder && (
                          <span className="text-[10px] text-neutral-500 truncate">
                            • {assignedFolder.name}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {isReorderingPlaylists ? (
                      <>
                        <button
                          type="button"
                          disabled={plIdx === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            reorderUserPlaylists(plIdx, plIdx - 1);
                          }}
                          className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 text-neutral-200 cursor-pointer disabled:cursor-not-allowed"
                          title="前へ移動"
                          aria-label="前へ移動"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={plIdx === userPlaylists.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            reorderUserPlaylists(plIdx, plIdx + 1);
                          }}
                          className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 text-neutral-200 cursor-pointer disabled:cursor-not-allowed"
                          title="後ろへ移動"
                          aria-label="後ろへ移動"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePinUserPlaylist(pl.id);
                          }}
                          className={`p-1.5 transition-colors cursor-pointer ${
                            pl.isPinned
                              ? 'text-red-500'
                              : 'text-neutral-400 hover:text-white sm:opacity-0 sm:group-hover:opacity-100'
                          }`}
                          title={pl.isPinned ? 'ピン留め解除' : 'トップにピン留め'}
                        >
                          <Pin className={`w-3.5 h-3.5 ${pl.isPinned ? 'fill-current' : ''}`} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLikeUserPlaylist(pl.id);
                          }}
                          className={`p-1.5 transition-colors cursor-pointer ${
                            pl.isLiked
                              ? 'text-red-500'
                              : 'text-neutral-400 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100'
                          }`}
                          title={pl.isLiked ? 'お気に入り解除' : 'お気に入りに追加'}
                        >
                          <Heart className={`w-4 h-4 ${pl.isLiked ? 'fill-red-500 text-red-500' : ''}`} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openShareModal('playlist', { name: pl.name, tracks: pl.tracks });
                          }}
                          className="p-1.5 text-neutral-400 hover:text-blue-400 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                          title="共有リンクを発行"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteUserPlaylist(pl.id);
                          }}
                          className="p-1.5 text-neutral-500 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                          title="削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* External / Liked Playlists */}
          {likedPlaylists.length > 0 && (
            <div className="space-y-3 pt-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Heart className="w-4 h-4 text-red-500 fill-red-500" />
                <span>いいねしたプレイリスト ({likedPlaylists.length})</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
                {likedPlaylists.map((pl) => (
                  <div
                    key={pl.id}
                    onClick={() => navigateTo('album', pl.id)}
                    className="group p-3 bg-neutral-900/40 hover:bg-neutral-800/70 border border-neutral-800 rounded-2xl cursor-pointer flex flex-col gap-2 transition-all"
                  >
                    <div className="aspect-square rounded-xl overflow-hidden bg-neutral-800 relative">
                      <SafeImage
                        src={pl.thumbnail}
                        alt={pl.title}
                        useBase64
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLikePlaylist(pl);
                        }}
                        className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/75 text-red-500 flex items-center justify-center cursor-pointer"
                        title="お気に入り解除"
                      >
                        <Heart className="w-4 h-4 fill-red-500 text-red-500" />
                      </button>
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white truncate">{pl.title}</h4>
                      <p className="text-[11px] text-neutral-400 truncate">{pl.author || 'プレイリスト'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Selected playlist tracks detail view */}
          {currentSelectedPlaylist && (
            <div className="pt-6 border-t border-neutral-800 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4 min-w-0">
                  <div
                    onClick={() => openPlaylistEditor(currentSelectedPlaylist)}
                    className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-neutral-800 border border-neutral-700/60 overflow-hidden shrink-0 flex items-center justify-center relative group cursor-pointer shadow-lg"
                    title="クリックしてカバーや詳細を編集"
                  >
                    {(currentSelectedPlaylist.coverImage || currentSelectedPlaylist.tracks[0]?.thumbnail) ? (
                      <SafeImage
                        src={
                          currentSelectedPlaylist.coverImage ||
                          currentSelectedPlaylist.tracks[0]?.thumbnail ||
                          ''
                        }
                        alt={currentSelectedPlaylist.name}
                        useBase64={!currentSelectedPlaylist.coverImage?.startsWith('data:')}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ListMusic className="w-9 h-9 text-neutral-500" />
                    )}
                    <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Pencil className="w-5 h-5 text-white" />
                    </div>
                  </div>
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-lg sm:text-xl font-bold text-white truncate">
                      {currentSelectedPlaylist.name}
                    </h3>
                    {currentSelectedPlaylist.description && (
                      <p className="text-xs text-neutral-300 line-clamp-2 max-w-xl">
                        {currentSelectedPlaylist.description}
                      </p>
                    )}
                    <p className="text-xs text-neutral-400">
                      {currentSelectedPlaylist.tracks.length}曲
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {userFolders.length > 0 && (
                    <select
                      aria-label="フォルダに移動"
                      value={
                        userFolders.find((f) =>
                          f.playlistIds.includes(currentSelectedPlaylist.id)
                        )?.id || ''
                      }
                      onChange={(e) =>
                        assignPlaylistToFolder(
                          currentSelectedPlaylist.id,
                          e.target.value || null
                        )
                      }
                      className="px-2.5 py-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 text-xs font-medium rounded-lg border border-neutral-700 focus:outline-none focus:border-red-500 cursor-pointer"
                    >
                      <option value="">フォルダ未設定</option>
                      {userFolders.map((f) => (
                        <option key={f.id} value={f.id}>
                          📁 {f.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() => togglePinUserPlaylist(currentSelectedPlaylist.id)}
                    className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                      currentSelectedPlaylist.isPinned
                        ? 'bg-red-600/20 border-red-500/40 text-red-400'
                        : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-white'
                    }`}
                    title={currentSelectedPlaylist.isPinned ? 'ピン留め解除' : 'ピン留め'}
                  >
                    <Pin className={`w-4 h-4 ${currentSelectedPlaylist.isPinned ? 'fill-current' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => openPlaylistEditor(currentSelectedPlaylist)}
                    className="px-3 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="プレイリスト名・説明・カバー画像を編集"
                  >
                    <Pencil className="w-3.5 h-3.5 text-neutral-300" />
                    <span>編集</span>
                  </button>
                  {currentSelectedPlaylist.tracks.length > 1 && (
                    <>
                      <select
                        aria-label="曲順を並び替え"
                        defaultValue=""
                        onChange={(e) => {
                          const val = e.target.value as
                            | 'title'
                            | 'artist'
                            | 'durationDesc'
                            | 'reverse'
                            | '';
                          if (val) {
                            sortUserPlaylistTracks(currentSelectedPlaylist.id, val);
                            e.target.value = '';
                          }
                        }}
                        className="px-2.5 py-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 text-xs font-medium rounded-lg border border-neutral-700 focus:outline-none focus:border-red-500 cursor-pointer"
                      >
                        <option value="" disabled>
                          曲順を一括整理...
                        </option>
                        <option value="title">曲名順 (あいうえお/A-Z)</option>
                        <option value="artist">アーティスト順</option>
                        <option value="durationDesc">再生時間が長い順</option>
                        <option value="reverse">現在の逆順</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setIsReorderingTracks((v) => !v)}
                        className={`px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-1.5 border transition-colors cursor-pointer ${
                          isReorderingTracks
                            ? 'bg-red-600/20 border-red-500/50 text-red-300'
                            : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-200'
                        }`}
                        title="ドラッグまたは矢印ボタンで曲順を手動入替"
                      >
                        {isReorderingTracks ? (
                          <Check className="w-3.5 h-3.5 text-red-400" />
                        ) : (
                          <ArrowUpDown className="w-3.5 h-3.5" />
                        )}
                        <span>{isReorderingTracks ? '入替完了' : '曲順入替'}</span>
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleLikeUserPlaylist(currentSelectedPlaylist.id)}
                    className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                      currentSelectedPlaylist.isLiked
                        ? 'bg-red-600/20 border-red-500/40 text-red-500'
                        : 'bg-neutral-900 hover:bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-red-400'
                    }`}
                    title={currentSelectedPlaylist.isLiked ? 'お気に入り解除' : 'お気に入りに追加'}
                  >
                    <Heart className={`w-4 h-4 ${currentSelectedPlaylist.isLiked ? 'fill-red-500 text-red-500' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      openZeroCodeModal({
                        type: 'playlist',
                        title: currentSelectedPlaylist.name,
                        subtitle: `${currentSelectedPlaylist.tracks.length}曲 • zero-music プレイリスト`,
                        imageUrl:
                          currentSelectedPlaylist.coverImage ||
                          currentSelectedPlaylist.tracks[0]?.thumbnail,
                        url: `${window.location.origin}/?collab=${encodeURIComponent(
                          currentSelectedPlaylist.collabCode || currentSelectedPlaylist.id
                        )}`,
                        codeValue: `zeromusic:playlist:${currentSelectedPlaylist.id}`,
                      })
                    }
                    className="p-2 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 hover:text-white transition-colors cursor-pointer"
                    title="zero-musicコードを表示"
                  >
                    <QrCode className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      openShareModal('playlist', {
                        name: currentSelectedPlaylist.name,
                        tracks: currentSelectedPlaylist.tracks,
                      })
                    }
                    className="px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="このプレイリストの共有リンクを発行"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>共有</span>
                  </button>
                  {currentSelectedPlaylist.tracks.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        playTrack(
                          currentSelectedPlaylist.tracks[0],
                          currentSelectedPlaylist.tracks,
                          {
                            source: 'プレイリストから再生中',
                            subtitle: currentSelectedPlaylist.name,
                          }
                        )
                      }
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>再生</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Edit Playlist Form Modal/Panel */}
              {editingPlaylistId === currentSelectedPlaylist.id && (
                <form
                  onSubmit={handleSavePlaylistEdit}
                  className="bg-neutral-900 border border-neutral-700/80 rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xl"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Pencil className="w-4 h-4 text-red-500" />
                      <span>プレイリスト情報を編集</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => setEditingPlaylistId(null)}
                      className="p-1 text-neutral-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex flex-col items-center gap-2 shrink-0">
                      <div className="w-24 h-24 rounded-xl bg-neutral-950 border border-neutral-800 overflow-hidden flex items-center justify-center">
                        {(editCoverImage || currentSelectedPlaylist.tracks[0]?.thumbnail) ? (
                          <SafeImage
                            src={editCoverImage || currentSelectedPlaylist.tracks[0]?.thumbnail || ''}
                            alt="カバープレビュー"
                            useBase64={!editCoverImage.startsWith('data:')}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ImagePlus className="w-7 h-7 text-neutral-500" />
                        )}
                      </div>
                      <input
                        ref={coverFileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleCoverImageUpload}
                        className="hidden"
                      />
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => coverFileInputRef.current?.click()}
                          className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-[11px] font-medium rounded-lg flex items-center gap-1 cursor-pointer"
                        >
                          <ImagePlus className="w-3 h-3" />
                          <span>画像選択</span>
                        </button>
                        {editCoverImage && (
                          <button
                            type="button"
                            onClick={() => setEditCoverImage('')}
                            className="px-2 py-1 bg-neutral-800 hover:bg-red-950/60 text-neutral-400 hover:text-red-400 text-[11px] rounded-lg cursor-pointer"
                          >
                            リセット
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex-1 space-y-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-400 mb-1">
                          プレイリスト名
                        </label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="プレイリスト名..."
                          required
                          className="w-full bg-neutral-950 border border-neutral-800 text-xs text-white rounded-lg px-3 py-2 focus:outline-none focus:border-red-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-400 mb-1">
                          説明文
                        </label>
                        <textarea
                          rows={2}
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          placeholder="気分やシーン、メモなど自由に入力..."
                          className="w-full bg-neutral-950 border border-neutral-800 text-xs text-white rounded-lg px-3 py-2 focus:outline-none focus:border-red-500 resize-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-400 mb-1">
                          カバー画像URL（任意・空欄で1曲目のアートワーク）
                        </label>
                        <input
                          type="text"
                          value={editCoverImage.startsWith('data:') ? '(ローカル画像を適用中)' : editCoverImage}
                          onChange={(e) => setEditCoverImage(e.target.value)}
                          readOnly={editCoverImage.startsWith('data:')}
                          placeholder="https://..."
                          className="w-full bg-neutral-950 border border-neutral-800 text-xs text-neutral-300 rounded-lg px-3 py-1.5 focus:outline-none focus:border-red-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditingPlaylistId(null)}
                      className="px-3.5 py-2 text-xs text-neutral-400 hover:text-white cursor-pointer"
                    >
                      キャンセル
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      保存する
                    </button>
                  </div>
                </form>
              )}

              {currentSelectedPlaylist.tracks.length === 0 ? (
                <div className="py-10 text-center text-xs text-neutral-500">
                  このプレイリストにはまだ曲がありません。検索画面やお気に入りから曲を追加できます。
                </div>
              ) : (
                <div className="bg-neutral-900/40 border border-neutral-800/80 rounded-2xl overflow-hidden divide-y divide-neutral-800/60">
                  {currentSelectedPlaylist.tracks.map((track, idx) => (
                    <div
                      key={track.id}
                      draggable={currentSelectedPlaylist.tracks.length > 1}
                      onDragStart={() => setDragTrackIdx(idx)}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (dragTrackIdx !== null && dragOverTrackIdx !== idx) {
                          setDragOverTrackIdx(idx);
                        }
                      }}
                      onDragLeave={() => {
                        if (dragOverTrackIdx === idx) setDragOverTrackIdx(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragTrackIdx !== null && dragTrackIdx !== idx) {
                          reorderUserPlaylistTracks(currentSelectedPlaylist.id, dragTrackIdx, idx);
                        }
                        setDragTrackIdx(null);
                        setDragOverTrackIdx(null);
                      }}
                      onDragEnd={() => {
                        setDragTrackIdx(null);
                        setDragOverTrackIdx(null);
                      }}
                      className={`flex items-center gap-3 px-4 py-3 hover:bg-neutral-800/50 group transition-colors ${
                        dragOverTrackIdx === idx ? 'bg-red-950/30 border-t-2 border-red-500' : ''
                      }`}
                    >
                      {currentSelectedPlaylist.tracks.length > 1 && (
                        <GripVertical
                          className={`w-4 h-4 text-neutral-600 hover:text-neutral-300 shrink-0 cursor-grab active:cursor-grabbing ${
                            isReorderingTracks ? 'text-neutral-400' : 'opacity-40 group-hover:opacity-100'
                          }`}
                        />
                      )}
                      <span className="w-6 text-center text-xs font-mono text-neutral-500 shrink-0">
                        {idx + 1}
                      </span>
                      <SafeImage
                        src={track.thumbnail}
                        alt={track.title}
                        useBase64
                        className="w-10 h-10 rounded-lg object-cover bg-neutral-800 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          onClick={() => playTrack(track, currentSelectedPlaylist.tracks)}
                          className="text-sm font-semibold text-white truncate cursor-pointer hover:underline"
                        >
                          {track.title}
                        </p>
                        <p className="text-xs text-neutral-400 truncate">{track.artist}</p>
                      </div>

                      {isReorderingTracks ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() =>
                              reorderUserPlaylistTracks(currentSelectedPlaylist.id, idx, idx - 1)
                            }
                            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 text-neutral-200 cursor-pointer disabled:cursor-not-allowed"
                            title="1つ上へ"
                            aria-label="1つ上へ"
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === currentSelectedPlaylist.tracks.length - 1}
                            onClick={() =>
                              reorderUserPlaylistTracks(currentSelectedPlaylist.id, idx, idx + 1)
                            }
                            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 text-neutral-200 cursor-pointer disabled:cursor-not-allowed"
                            title="1つ下へ"
                            aria-label="1つ下へ"
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              removeFromUserPlaylist(currentSelectedPlaylist.id, track.id)
                            }
                            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-red-950/60 text-neutral-400 hover:text-red-400 cursor-pointer"
                            title="プレイリストから削除"
                            aria-label="プレイリストから削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => playNext(track)}
                            className="p-1.5 text-neutral-400 hover:text-red-400 transition-colors cursor-pointer"
                            title="次に再生"
                            aria-label="次に再生"
                          >
                            <ListStart className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openFreemakeModal(track)}
                            className="p-1.5 text-neutral-400 hover:text-sky-400 transition-colors cursor-pointer"
                            title="ダウンロード・保存"
                            aria-label="ダウンロード・保存"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openTrackDetailModal(track)}
                            className="p-1.5 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                            title="楽曲の詳細"
                            aria-label="楽曲の詳細"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                          <span className="text-xs font-mono text-neutral-400 hidden sm:inline">
                            {track.duration}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              removeFromUserPlaylist(currentSelectedPlaylist.id, track.id)
                            }
                            className="p-1 text-neutral-500 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                            title="プレイリストから削除"
                            aria-label="プレイリストから削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* おすすめの曲（1タップで追加） */}
              <div className="pt-4 border-t border-neutral-800/70 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-red-500" />
                      <span>おすすめの曲（1タップで追加）</span>
                    </h4>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      {currentSelectedPlaylist.tracks.length > 0
                        ? 'このプレイリストの収録曲をもとに提案しています'
                        : 'プレイリスト名をもとに提案しています'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSuggestionsRefreshKey((k) => k + 1)}
                    disabled={loadingSuggestions}
                    className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {loadingSuggestions ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    <span>更新</span>
                  </button>
                </div>

                {loadingSuggestions && playlistSuggestions.length === 0 ? (
                  <div className="py-8 text-center text-xs text-neutral-500 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                    <span>おすすめ曲を探しています...</span>
                  </div>
                ) : playlistSuggestions.length === 0 ? (
                  <p className="text-xs text-neutral-500 py-4">
                    現在提案できる曲がありません。「更新」を押して再検索できます。
                  </p>
                ) : (
                  <div className="bg-neutral-900/30 border border-neutral-800/70 rounded-2xl divide-y divide-neutral-800/50 overflow-hidden">
                    {playlistSuggestions.map((track) => {
                      const alreadyIn = currentSelectedPlaylist.tracks.some(
                        (t) => t.id === track.id
                      );
                      return (
                        <div
                          key={`sug-${track.id}`}
                          className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800/40 transition-colors"
                        >
                          <div
                            onClick={() => playTrack(track, playlistSuggestions)}
                            className="relative w-10 h-10 rounded-lg overflow-hidden bg-neutral-800 shrink-0 cursor-pointer group"
                          >
                            <SafeImage
                              src={track.thumbnail}
                              alt={track.title}
                              useBase64
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <Play className="w-3.5 h-3.5 fill-white text-white ml-0.5" />
                            </div>
                          </div>

                          <div
                            onClick={() => playTrack(track, playlistSuggestions)}
                            className="flex-1 min-w-0 cursor-pointer"
                          >
                            <p className="text-xs sm:text-sm font-semibold text-white truncate hover:underline">
                              {track.title}
                            </p>
                            <p className="text-[11px] text-neutral-400 truncate">
                              {track.artist}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => openFreemakeModal(track)}
                              className="p-1.5 text-neutral-400 hover:text-sky-400 cursor-pointer"
                              title="ダウンロード・保存"
                              aria-label="ダウンロード・保存"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openTrackDetailModal(track)}
                              className="p-1.5 text-neutral-400 hover:text-white cursor-pointer"
                              title="楽曲の詳細"
                              aria-label="楽曲の詳細"
                            >
                              <Info className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              disabled={alreadyIn}
                              onClick={() => {
                                addToUserPlaylist(currentSelectedPlaylist.id, track);
                                setPlaylistSuggestions((prev) =>
                                  prev.filter((t) => t.id !== track.id)
                                );
                              }}
                              className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                alreadyIn
                                  ? 'bg-neutral-800 text-neutral-500 cursor-default'
                                  : 'bg-white/10 hover:bg-red-600 text-white border border-white/15 hover:border-red-500'
                              }`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>{alreadyIn ? '追加済み' : '追加'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Offline & Local Tracks View */}
      {subCategory === 'none' && activeTab === 'local' && (
        <div className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 bg-gradient-to-r from-cyan-950/40 via-neutral-900 to-blue-950/40 border border-cyan-500/20 rounded-2xl shadow-xl">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-cyan-600 flex items-center justify-center text-white shadow-xl shadow-cyan-600/30 shrink-0">
                <HardDrive className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">オフライン音源</h2>
                <p className="text-xs text-neutral-300 mt-0.5">
                  {localTracks.length}曲 • ダウンロードした曲は自動でここに追加され、オフラインでも再生できます
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,video/*,.mp3,.wav,.flac,.m4a,.aac,.ogg,.opus,.mp4,.webm"
                multiple
                onChange={(e) => e.target.files && handleAudioFiles(e.target.files)}
                className="hidden"
              />

              {/* Instant sample audio generator for offline testing */}
              <button
                type="button"
                onClick={handleSeedDemo}
                disabled={isAddingDemo}
                className="px-3.5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-cyan-300 border border-cyan-500/30 text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow transition-all active:scale-95 cursor-pointer"
                title="音源ファイルが手元にない場合でも、ブラウザ内で直接Lo-Fiサウンドを自動合成してオフライン再生を即座に試せます"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>{isAddingDemo ? '生成中...' : 'サンプル音源を追加'}</span>
              </button>

              <button
                type="button"
                onClick={() => openFreemakeModal(currentTrack)}
                className="px-3.5 py-2.5 bg-sky-600/20 hover:bg-sky-600/35 text-sky-300 border border-sky-500/40 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow transition-all active:scale-95 cursor-pointer"
                title="Freemakeでダウンロード・変換した曲は自動でここに追加されます"
              >
                <Download className="w-3.5 h-3.5 text-sky-400" />
                <span>Freemake ダウンロード</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessingFiles}
                className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-lg shadow-cyan-600/20 transition-transform active:scale-95 cursor-pointer"
              >
                <UploadCloud className="w-4 h-4" />
                <span>{isProcessingFiles ? '保存中...' : 'ファイルを追加'}</span>
              </button>

              {localTracks.length > 0 && (
                <button
                  type="button"
                  onClick={() => playTrack(localTracks[0], localTracks)}
                  className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold rounded-xl flex items-center gap-2 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>すべて再生</span>
                </button>
              )}
            </div>
          </div>

          {/* Drag & Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-7 sm:p-9 text-center transition-all cursor-pointer ${
              isDragging
                ? 'border-cyan-400 bg-cyan-950/30 scale-[1.01]'
                : 'border-neutral-700/60 hover:border-neutral-600 bg-neutral-900/30'
            }`}
          >
            <div className="max-w-md mx-auto space-y-2.5">
              <div className="w-12 h-12 rounded-2xl bg-cyan-950/60 border border-cyan-500/30 flex items-center justify-center mx-auto text-cyan-400 shadow-inner">
                <FileAudio className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white">
                  ここに音声ファイルをドラッグ＆ドロップして自分専用オフラインへ保存
                </h3>
                <p className="text-xs text-neutral-400 mt-1">
                  みんなに共有したい曲は「共有オフライン」タブか、下の公開ボタンから公開できます
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {['.MP3', '.WAV', '.FLAC', '.M4A', '.AAC', '.OGG'].map((ext) => (
                  <span
                    key={ext}
                    className="text-[10px] font-mono px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700/50"
                  >
                    {ext}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Local Tracks List */}
          {localTracks.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Music className="w-4 h-4 text-cyan-400" />
                  <span>保存済みのオフライン曲 ({localTracks.length})</span>
                </h3>
              </div>

              <div className="bg-neutral-900/40 border border-neutral-800/80 rounded-2xl overflow-hidden divide-y divide-neutral-800/60 shadow-xl">
                {localTracks
                  .filter((t) => matchesQuery(t.title) || matchesQuery(t.artist))
                  .map((track) => {
                    const isCurrent = currentTrack?.id === track.id;
                    const isPublishing = publishingTrackId === track.id;
                    return (
                      <div
                        key={track.id}
                        className={`flex items-center gap-3 px-4 py-3 hover:bg-neutral-800/50 group transition-colors ${
                          isCurrent ? 'bg-cyan-950/20' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => playTrack(track, localTracks)}
                          className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-400 hover:text-cyan-400 hover:bg-neutral-700 transition-colors shrink-0 cursor-pointer"
                        >
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        </button>

                        <div className="w-10 h-10 rounded-lg bg-cyan-950/80 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                          <FileAudio className="w-5 h-5" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <p
                            onClick={() => playTrack(track, localTracks)}
                            className={`text-sm font-semibold truncate cursor-pointer hover:underline ${
                              isCurrent ? 'text-cyan-400 font-bold' : 'text-white'
                            }`}
                          >
                            {track.title}
                          </p>
                          <p className="text-xs text-neutral-400 truncate">
                            {track.artist} • {track.album || 'オフライン保存'}
                          </p>
                        </div>

                        <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-950/70 border border-cyan-500/30 text-cyan-300 text-[10px] font-semibold shrink-0">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>オフラインOK</span>
                        </span>

                        <span className="text-xs font-mono text-neutral-400 shrink-0">
                          {track.duration}
                        </span>

                        <button
                          type="button"
                          disabled={isPublishing}
                          onClick={() => handlePublishLocalToShared(track)}
                          title="この曲を「共有オフライン」に公開して全員で聴けるようにする"
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
                        >
                          {isPublishing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Globe className="w-3.5 h-3.5" />
                          )}
                          <span className="hidden md:inline">共有に公開</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => playNext(track)}
                          title="次に再生"
                          aria-label="次に再生"
                          className="p-2 text-neutral-400 hover:text-red-400 transition-colors cursor-pointer"
                        >
                          <ListStart className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => openAddToPlaylistModal(track)}
                          title="プレイリストに追加"
                          className="p-2 text-neutral-500 hover:text-white transition-colors cursor-pointer"
                        >
                          <ListPlus className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => removeLocalTrack(track.id)}
                          title="削除"
                          className="p-2 text-neutral-500 hover:text-red-400 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Shared Offline Library (FileUp! lite 参照: 期限付き共有リンク・1MBチャンク送信・XOR難読化・オフライン自動同期) */}
      {subCategory === 'none' && activeTab === 'shared_offline' && (
        <div className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 bg-gradient-to-r from-emerald-950/45 via-neutral-900 to-teal-950/45 border border-emerald-500/25 rounded-2xl shadow-xl">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-xl shadow-emerald-600/30 shrink-0">
                <Globe className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-white">共有オフライン</h2>
                  {(!isOnline || sharedFromOfflineCache) && (
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold flex items-center gap-1">
                      <WifiOff className="w-3 h-3" />
                      オフライン再生モード
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-300">
                  ファイルを1つ選択して共有リンク（有効期限・延長許可設定可）を発行でき、自動キャッシュ後はオフラインでも再生・ダウンロードできます
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-neutral-800/90 text-neutral-300 font-mono">
                    共有曲数: {sharedTracks.length}曲
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/35 text-emerald-300 font-mono">
                    オフライン再生可能: {sharedTracks.filter((t) => t.isCachedOffline).length} / {sharedTracks.length}曲
                  </span>
                  {syncingShared && sharedSyncProgress && (
                    <span className="px-2 py-0.5 rounded bg-sky-950/80 border border-sky-500/35 text-sky-300 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      自動同期中 ({sharedSyncProgress.cached}/{sharedSyncProgress.total})
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <input
                ref={sharedFileInputRef}
                type="file"
                accept="audio/*,video/*,.mp3,.wav,.flac,.m4a,.m4b,.m4r,.aac,.ogg,.oga,.opus,.webm,.mp4,.m4v,.mov,.mkv,.avi,.3gp,.wma,.aif,.aiff,.caf,.amr"
                multiple
                onChange={(e) => {
                  const files = e.target.files ? Array.from(e.target.files) : [];
                  if (files.length === 1) {
                    handleSharedFilePick(files[0]);
                  } else if (files.length > 1) {
                    handleSharedFilesUpload(files);
                  }
                }}
                className="hidden"
              />

              <button
                type="button"
                disabled={!isOnline || syncingShared}
                onClick={handleManualSyncShared}
                className="px-3.5 py-2.5 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-45 text-emerald-300 border border-emerald-500/30 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
                title="みんながアップロードした曲を端末のオフライン領域へすべて同期します"
              >
                {syncingShared ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                <span>オフライン同期</span>
              </button>

              <button
                type="button"
                disabled={isUploadingShared}
                onClick={() => {
                  if (sharedFileInputRef.current) sharedFileInputRef.current.value = '';
                  sharedFileInputRef.current?.click();
                }}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-45 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-600/25 transition-all active:scale-95 cursor-pointer"
              >
                {isUploadingShared ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <UploadCloud className="w-4 h-4" />
                )}
                <span>
                  {isUploadingShared
                    ? `アップロード中${sharedUploadProgress !== null ? ` (${sharedUploadProgress}%)` : '...'}`
                    : 'ファイルを選択'}
                </span>
              </button>

              {sharedTracks.length > 0 && (
                <button
                  type="button"
                  onClick={() => playTrack(sharedTracks[0], sharedTracks)}
                  className="px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold rounded-xl flex items-center gap-2 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>すべて再生</span>
                </button>
              )}
            </div>
          </div>

          {/* Deep-Linked Shared File Card (?shared_file=token) */}
          {(sharedLinkedLoading || sharedLinkedError || sharedLinkedTrack) && (
            <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/60 to-neutral-900 border border-emerald-500/40 shadow-xl space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold">
                  <Link2 className="w-4 h-4" />
                  <span>共有URLから開いたファイル</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSharedLinkedTrack(null);
                    setSharedLinkedError(null);
                  }}
                  className="text-neutral-400 hover:text-white cursor-pointer"
                  aria-label="閉じる"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {sharedLinkedLoading ? (
                <div className="py-4 flex items-center gap-2 text-xs text-neutral-300">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>共有ファイル情報を取得中…</span>
                </div>
              ) : sharedLinkedError ? (
                <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-xs text-red-200">
                  {sharedLinkedError}
                </div>
              ) : (
                sharedLinkedTrack && (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <h3 className="text-base font-bold text-white truncate">
                          {sharedLinkedTrack.title}
                        </h3>
                        <p className="text-xs text-neutral-300 truncate">
                          {sharedLinkedTrack.artist} • 投稿: {sharedLinkedTrack.uploadedBy || 'ゲスト'}
                          {sharedLinkedTrack.fileSize
                            ? ` • ${formatFileSizeLabel(sharedLinkedTrack.fileSize)}`
                            : ''}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-emerald-300">
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            有効期限:{' '}
                            {sharedLinkedTrack.expiresAt
                              ? `${new Date(sharedLinkedTrack.expiresAt).toLocaleString('ja-JP')}（${formatRemainingExpiry(
                                  sharedLinkedTrack.expiresAt
                                )}）`
                              : '無期限'}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => playTrack(sharedLinkedTrack, sharedTracks.length ? sharedTracks : [sharedLinkedTrack])}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>再生</span>
                        </button>
                        <a
                          href={getSharedOfflineDownloadUrl(sharedLinkedTrack)}
                          download
                          className="px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-100 text-xs font-semibold flex items-center gap-1.5 border border-neutral-700"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>ダウンロード</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => handleCopySharedUrl(sharedLinkedTrack)}
                          className="px-3 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>URLコピー</span>
                        </button>
                        {sharedLinkedTrack.allowExtension && sharedLinkedTrack.expiresAt && (
                          <button
                            type="button"
                            disabled={extendingTrackId === sharedLinkedTrack.id || !isOnline}
                            onClick={() => handleExtendSharedTrack(sharedLinkedTrack)}
                            className="px-3 py-2 rounded-xl bg-amber-600/20 hover:bg-amber-600/35 border border-amber-500/40 text-amber-200 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-45 cursor-pointer"
                          >
                            {extendingTrackId === sharedLinkedTrack.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CalendarPlus className="w-3.5 h-3.5" />
                            )}
                            <span>有効期限を7日延長</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {/* FileUp! lite Style Selection -> Retention Config -> Progress -> Result Panel */}
          <div className="p-5 sm:p-6 rounded-2xl bg-neutral-900/60 border border-neutral-800/90 shadow-xl space-y-5">
            {sharedResultTrack ? (
              /* Result Panel (アップロード完了・共有URL発行結果) */
              <div className="space-y-4">
                <div className="text-center space-y-1">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto text-emerald-400">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-emerald-400">
                    アップロードが完了しました
                  </h3>
                  <p className="text-xs text-neutral-300">
                    有効期限:{' '}
                    {sharedResultTrack.expiresAt
                      ? new Date(sharedResultTrack.expiresAt).toLocaleString('ja-JP')
                      : '無期限'}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="block text-[11px] font-semibold text-neutral-400">
                    共有URL（リンクを知っている人は再生・ダウンロード可能）
                  </label>
                  <input
                    ref={sharedShareUrlInputRef}
                    type="text"
                    readOnly
                    value={buildSharedOfflineUrl(sharedResultTrack)}
                    onClick={(e) => e.currentTarget.select()}
                    aria-label="共有URL"
                    className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono text-emerald-300 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleCopySharedUrl(sharedResultTrack, true)}
                    className="flex-1 min-h-[42px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Copy className="w-4 h-4" />
                    <span>URLをコピー</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSharedResetPanel}
                    className="flex-1 min-h-[42px] px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-200 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>別のファイルをアップロード</span>
                  </button>
                </div>

                {sharedResultFeedback && (
                  <p
                    role="status"
                    aria-live="polite"
                    className="text-xs text-emerald-400 font-semibold text-center"
                  >
                    {sharedResultFeedback}
                  </p>
                )}
              </div>
            ) : (
              /* Selection & Retention Settings State */
              <>
                <div
                  role="group"
                  tabIndex={0}
                  aria-label="共有オフライン ファイル選択エリア"
                  onDragEnter={(e) => {
                    e.preventDefault();
                    if (!isUploadingShared) setIsDraggingShared(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!isUploadingShared) setIsDraggingShared(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDraggingShared(false);
                  }}
                  onDrop={handleSharedDrop}
                  onClick={() => {
                    if (isUploadingShared) return;
                    if (sharedFileInputRef.current) sharedFileInputRef.current.value = '';
                    sharedFileInputRef.current?.click();
                  }}
                  onKeyDown={(e) => {
                    if (isUploadingShared) return;
                    if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
                      e.preventDefault();
                      if (sharedFileInputRef.current) sharedFileInputRef.current.value = '';
                      sharedFileInputRef.current?.click();
                    }
                  }}
                  className={`border-2 rounded-2xl p-6 text-center transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400/60 ${
                    isDraggingShared
                      ? 'border-dashed border-emerald-400 bg-emerald-950/35 scale-[1.01]'
                      : sharedPickedFile
                      ? 'border-solid border-emerald-500/50 bg-emerald-950/20'
                      : 'border-dashed border-emerald-700/45 hover:border-emerald-500/75 bg-neutral-950/40'
                  }`}
                >
                  <div className="max-w-lg mx-auto space-y-2.5">
                    <div className="w-11 h-11 rounded-2xl bg-emerald-950/80 border border-emerald-500/35 flex items-center justify-center mx-auto text-emerald-400">
                      {isUploadingShared ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Cloud className="w-5 h-5" />
                      )}
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-white break-all">
                      {sharedPickedFile
                        ? sharedPickedFile.name
                        : 'ファイルをここにドロップ'}
                    </h3>
                    <p className="text-xs text-neutral-400">
                      {sharedPickedFile
                        ? formatFileSizeLabel(sharedPickedFile.size)
                        : 'または音声・動画ファイルを選択してください（複数ドロップで一括アップロード可）'}
                    </p>
                    <button
                      type="button"
                      disabled={isUploadingShared}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (sharedFileInputRef.current) sharedFileInputRef.current.value = '';
                        sharedFileInputRef.current?.click();
                      }}
                      className="mt-1 px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-semibold text-neutral-100 disabled:opacity-50 cursor-pointer"
                    >
                      {sharedPickedFile ? 'ほかのファイルに変更' : 'ファイルを選択'}
                    </button>
                  </div>
                </div>

                {/* Retention Slider & Extension Permission (FileUp! lite inspired) */}
                {!isUploadingShared && (
                  <div className="space-y-3 pt-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <label
                        htmlFor="sharedRetentionSlider"
                        className="text-xs sm:text-sm font-bold text-neutral-200"
                      >
                        共有リンクの有効期間
                      </label>
                      <output
                        htmlFor="sharedRetentionSlider"
                        className="text-xs sm:text-sm font-bold text-emerald-400"
                      >
                        {SHARED_RETENTION_LABELS[sharedRetentionIdx]}
                      </output>
                    </div>

                    <input
                      id="sharedRetentionSlider"
                      type="range"
                      min={0}
                      max={SHARED_RETENTION_OPTIONS.length - 1}
                      step={1}
                      value={sharedRetentionIdx}
                      onChange={(e) => setSharedRetentionIdx(Number(e.target.value))}
                      className="w-full accent-emerald-500 cursor-pointer"
                    />

                    <div
                      aria-hidden="true"
                      className="flex justify-between gap-1 text-[11px] text-neutral-400"
                    >
                      {SHARED_RETENTION_LABELS.map((label, idx) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setSharedRetentionIdx(idx)}
                          className={`cursor-pointer transition-colors ${
                            sharedRetentionIdx === idx
                              ? 'text-emerald-400 font-bold'
                              : 'hover:text-neutral-200'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <p className="text-[11px] text-neutral-400">
                      選択した期間が過ぎると、共有リスト・共有URLから再生やダウンロードができなくなります。
                    </p>

                    <label className="flex items-start gap-2.5 pt-1 text-xs text-neutral-300 leading-relaxed cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={sharedAllowExtension}
                        onChange={(e) => setSharedAllowExtension(e.target.checked)}
                        className="mt-0.5 w-4 h-4 accent-emerald-500 rounded shrink-0 cursor-pointer"
                      />
                      <span>
                        共有URLを知っている人による有効期限の延長を許可する（1回につき7日、回数制限なし）
                      </span>
                    </label>
                  </div>
                )}

                {/* Optional Metadata Inputs */}
                {!isUploadingShared && (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => setSharedMetaOpen((v) => !v)}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>
                        {sharedMetaOpen
                          ? '曲名・投稿者名の編集を閉じる'
                          : '曲名・アーティスト・投稿者名を編集する（任意）'}
                      </span>
                    </button>

                    {sharedMetaOpen && (
                      <div className="p-4 rounded-xl bg-neutral-950/70 border border-neutral-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                            曲名 (任意)
                          </label>
                          <input
                            type="text"
                            value={sharedUploadTitle}
                            onChange={(e) => setSharedUploadTitle(e.target.value)}
                            placeholder="空欄ならファイル名から自動設定"
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                            アーティスト名 (任意)
                          </label>
                          <input
                            type="text"
                            value={sharedUploadArtist}
                            onChange={(e) => setSharedUploadArtist(e.target.value)}
                            placeholder="アーティスト名"
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                            投稿者名 (ニックネーム)
                          </label>
                          <input
                            type="text"
                            value={sharedUploadBy}
                            onChange={(e) => setSharedUploadBy(e.target.value)}
                            placeholder="ゲスト"
                            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Upload Button or Progress Bar */}
                {isUploadingShared ? (
                  <div className="space-y-2.5">
                    <div
                      role="progressbar"
                      aria-label="アップロード進捗"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={sharedUploadProgress ?? 0}
                      className="relative h-12 rounded-xl bg-neutral-800 overflow-hidden flex items-center justify-center"
                    >
                      <div
                        className="absolute inset-y-0 left-0 bg-emerald-600 transition-all duration-200"
                        style={{ width: `${sharedUploadProgress ?? 0}%` }}
                      />
                      <span className="relative z-10 text-xs sm:text-sm font-bold text-white">
                        {sharedUploadStage} ({sharedUploadProgress ?? 0}%)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => sharedUploadAbortRef.current?.abort()}
                      className="w-full py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-300 cursor-pointer"
                    >
                      アップロードを中止
                    </button>
                  </div>
                ) : (
                  sharedPickedFile && (
                    <button
                      type="button"
                      disabled={!isOnline}
                      onClick={() => handleSharedFilesUpload([sharedPickedFile])}
                      className="w-full min-h-[52px] px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-45 text-white text-sm font-bold flex items-center justify-center gap-2.5 shadow-lg shadow-emerald-600/25 active:scale-[0.99] transition-all cursor-pointer"
                    >
                      <UploadCloud className="w-5 h-5" />
                      <span>アップロードして共有URLを発行</span>
                    </button>
                  )
                )}

                {sharedUploadError && (
                  <div className="flex items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-red-950/60 border border-red-500/40 text-xs text-red-200">
                    <span>エラー: {sharedUploadError}</span>
                    <button
                      type="button"
                      onClick={() => setSharedUploadError(null)}
                      className="text-red-300 hover:text-white cursor-pointer"
                      aria-label="閉じる"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <p className="text-[11px] text-neutral-500 flex items-start gap-1.5 leading-relaxed">
                  <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5 text-neutral-500" />
                  <span>
                    最大150 MiB（1 MiBチャンク分割送信）。保存データには固定キーによる単純なXOR難読化を施しますが、これは暗号化ではなく、機密情報の保護には使えません。
                  </span>
                </p>
              </>
            )}
          </div>

          {/* Shared Offline Tracks List */}
          {loadingShared && sharedTracks.length === 0 ? (
            <div className="py-16 text-center text-xs text-neutral-400 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              <span>共有オフライン楽曲を読み込み中...</span>
            </div>
          ) : sharedTracks.length === 0 ? (
            <div className="py-16 text-center space-y-2 text-neutral-400 bg-neutral-900/30 border border-neutral-800/70 rounded-2xl">
              <Globe className="w-10 h-10 mx-auto text-neutral-600" />
              <p className="text-sm font-semibold text-neutral-300">
                まだ共有オフラインに曲がありません
              </p>
              <p className="text-xs text-neutral-500">
                上のエリアから音声ファイルを選択してアップロードすると、共有URL発行とオフライン自動キャッシュが有効になります。
              </p>
            </div>
          ) : (
            <div className="bg-neutral-900/40 border border-neutral-800/80 rounded-2xl overflow-hidden divide-y divide-neutral-800/60 shadow-xl">
              {sharedTracks
                .filter(
                  (t) =>
                    matchesQuery(t.title) ||
                    matchesQuery(t.artist) ||
                    matchesQuery(t.uploadedBy)
                )
                .map((track) => {
                  const isCurrent = currentTrack?.id === track.id;
                  const canPlayNow = Boolean(track.isCachedOffline || isOnline);
                  const sizeLabel = track.fileSize ? formatFileSizeLabel(track.fileSize) : '';
                  const expiryLabel = formatRemainingExpiry(track.expiresAt);
                  return (
                    <div
                      key={track.id}
                      className={`flex items-center gap-3 px-4 py-3 hover:bg-neutral-800/50 group transition-colors ${
                        isCurrent ? 'bg-emerald-950/25' : ''
                      } ${!canPlayNow ? 'opacity-60' : ''}`}
                    >
                      <button
                        type="button"
                        disabled={!canPlayNow}
                        onClick={() => playTrack(track, sharedTracks)}
                        className="w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-neutral-300 hover:text-emerald-400 hover:bg-neutral-700 disabled:opacity-40 transition-colors shrink-0 cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-current ml-0.5" />
                      </button>

                      <div className="w-10 h-10 rounded-lg bg-emerald-950/80 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shrink-0">
                        <FileAudio className="w-5 h-5" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p
                          onClick={() => canPlayNow && playTrack(track, sharedTracks)}
                          className={`text-sm font-semibold truncate cursor-pointer hover:underline ${
                            isCurrent ? 'text-emerald-400 font-bold' : 'text-white'
                          }`}
                        >
                          {track.title}
                        </p>
                        <p className="text-xs text-neutral-400 truncate">
                          {track.artist} • 投稿: {track.uploadedBy || 'ゲスト'}
                          {sizeLabel ? ` • ${sizeLabel}` : ''}
                        </p>
                      </div>

                      <span
                        title={
                          track.expiresAt
                            ? `有効期限: ${new Date(track.expiresAt).toLocaleString('ja-JP')}`
                            : '有効期限なし'
                        }
                        className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-neutral-800/90 text-neutral-300 text-[10px] font-mono shrink-0"
                      >
                        <Clock className="w-3 h-3 text-neutral-400" />
                        <span>{expiryLabel}</span>
                      </span>

                      {track.isCachedOffline ? (
                        <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/35 text-emerald-300 text-[10px] font-bold shrink-0">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>オフライン再生OK</span>
                        </span>
                      ) : (
                        <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 text-[10px] shrink-0">
                          {isOnline ? 'オンライン/要同期' : '未キャッシュ'}
                        </span>
                      )}

                      <span className="text-xs font-mono text-neutral-400 shrink-0">
                        {track.duration}
                      </span>

                      {track.allowExtension && track.expiresAt && (
                        <button
                          type="button"
                          disabled={extendingTrackId === track.id || !isOnline}
                          onClick={() => handleExtendSharedTrack(track)}
                          title="有効期限を7日間延長"
                          aria-label="有効期限を7日間延長"
                          className="p-2 text-amber-300 hover:text-amber-200 disabled:opacity-40 transition-colors cursor-pointer"
                        >
                          {extendingTrackId === track.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CalendarPlus className="w-4 h-4" />
                          )}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleCopySharedUrl(track)}
                        title="共有URLをコピー"
                        aria-label="共有URLをコピー"
                        className="p-2 text-neutral-400 hover:text-emerald-400 transition-colors cursor-pointer"
                      >
                        <Copy className="w-4 h-4" />
                      </button>

                      <a
                        href={getSharedOfflineDownloadUrl(track)}
                        download
                        title="ファイルをダウンロード"
                        aria-label="ファイルをダウンロード"
                        className="p-2 text-neutral-400 hover:text-sky-400 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </a>

                      <button
                        type="button"
                        onClick={() => playNext(track)}
                        title="次に再生"
                        aria-label="次に再生"
                        className="p-2 text-neutral-400 hover:text-red-400 transition-colors cursor-pointer"
                      >
                        <ListStart className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await copySharedTrackToMyOffline(track);
                            showToast(`「${track.title}」をマイ・オフラインにも保存しました`, 'success');
                          } catch {
                            showToast('マイ・オフラインへの保存に失敗しました', 'warning');
                          }
                        }}
                        title="マイ・オフラインにも複製保存"
                        className="p-2 text-neutral-400 hover:text-cyan-400 transition-colors cursor-pointer"
                      >
                        <FolderDown className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
