export interface YouTubeCommentSample {
  author: string;
  text: string;
  likes: string;
  likesNum?: number;
  matchedEmotions?: string[];
}

export interface CommentEmotionData {
  videoId: string;
  dominantMood: string;
  dominantMoodName: string;
  emotionScores: Record<string, number>;
  emotionTags: string[];
  summary: string;
  sampleComments: YouTubeCommentSample[];
  analyzedCount: number;
  source?: string;
}

export type AudioQualityMode = 'auto' | 'low' | 'normal' | 'high' | 'lossless' | 'hires';
export type SpatialAudioPreset = 'off' | 'cinema' | 'concert' | 'studio';

export interface AudioStreamMetadata {
  videoId?: string;
  quality?: AudioQualityMode;
  codec?: string;
  bitrateKbps?: number;
  sampleRateHz?: number;
  channels?: number;
  mimeType?: string;
  qualityMode?: string;
  sourceLabel?: string;
  usingDirectDsp?: boolean;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  duration?: string;
  durationSeconds?: number;
  thumbnail: string;
  views?: string;
  isLocal?: boolean;
  audioUrl?: string;
  isSharedOffline?: boolean;
  uploadedBy?: string;
  uploadedAt?: string;
  fileSize?: number;
  fileName?: string;
  fileExt?: string;
  isCachedOffline?: boolean;
  savedLocalFallback?: boolean;
  commentEmotion?: CommentEmotionData;
  // Podcast & AI & Jam extensions
  trackType?: 'music' | 'podcast';
  podcastShowId?: string;
  podcastShowTitle?: string;
  podcastFeedUrl?: string;
  podcastVideoId?: string;
  publishDate?: string;
  description?: string;
  audioMimeType?: string;
  addedBy?: string;
  aiReason?: string;
  // Discovery & Catalog extensions
  bpm?: number;
  moodTag?: string;
  isUnofficial?: boolean;
  unofficialKind?: string;
  composerName?: string;
  era?: string;
  opusNumber?: string;
}

export type CatalogRegion = 'JP' | 'US' | 'KR' | 'GB' | 'GLOBAL';
export type BpmRangePreset = 'all' | 'slow' | 'mid' | 'upbeat' | 'fast';
export type RecapPeriod = 'year' | 'season' | 'month';

export interface LyricsTranslationLine {
  original: string;
  translation: string;
  pronunciation: string;
}

export interface ClassicalComposer {
  id: string;
  name: string;
  nameEn: string;
  era: 'baroque' | 'classical' | 'romantic' | 'modern';
  eraLabel: string;
  years: string;
  signatureQuery: string;
  sampleWorks: Array<{ title: string; opus: string; query: string }>;
}

export interface ListeningLogEntry {
  id: string;
  track: Track;
  timestamp: string;
  seconds: number;
  moodTag?: string;
}

export interface PodcastEpisode {
  id: string;
  showId: string;
  showTitle: string;
  title: string;
  artist: string;
  description: string;
  publishDate: string;
  duration: string;
  durationSeconds: number;
  thumbnail: string;
  audioUrl?: string;
  videoId?: string;
  isVideo: boolean;
  feedUrl?: string;
}

export interface PodcastShow {
  id: string;
  title: string;
  author: string;
  description?: string;
  thumbnail: string;
  feedUrl?: string;
  genre?: string;
  episodeCount?: number;
  isVideoShow?: boolean;
  episodes?: PodcastEpisode[];
}

export interface Artist {
  id: string;
  name: string;
  subscribers?: string;
  thumbnail: string;
  description?: string;
}

export interface Album {
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  year?: string;
  thumbnail: string;
  trackCount?: number;
}

export interface Playlist {
  id: string;
  title: string;
  author?: string;
  itemCount?: string;
  thumbnail: string;
}

export interface InnerTubeLog {
  id: string;
  timestamp: string;
  endpoint: string;
  params: any;
  durationMs: number;
  status: 'success' | 'error';
  itemCount?: number;
  error?: string;
  sampleResponse?: any;
}

export interface SyncedLine {
  time: number;
  text: string;
}

export interface LyricsData {
  available: boolean;
  isSynced: boolean;
  isApproximate?: boolean;
  syncedLyrics?: SyncedLine[];
  lyrics: string;
  footer?: string;
  source?: string;
  matchedTrackName?: string;
  matchedTitle?: string;
  matchedArtist?: string;
  error?: string;
  globalOffset?: number;
}

export interface OriconTrack extends Track {
  rank: number;
  metric?: string;
  rankType?: 'streaming' | 'digital';
}

export interface ExploreData {
  trending: Track[];
  newReleases: Album[];
  moodsAndGenres: { title: string; params: string }[];
  musicVideos: Track[];
  oriconRanking?: OriconTrack[];
  oriconDigital?: OriconTrack[];
}

export interface TrackTimestampItem {
  timeSeconds: number;
  timeLabel: string;
  label: string;
  source: 'description' | 'comment';
  author?: string;
  likes?: string;
  likesNum?: number;
}

export interface HeatMarker {
  timeSeconds: number;
  timeLabel: string;
  percent: number;
  heat: number; // 0..1
  mentions: number;
  topLabel: string;
}

export interface TrackTimestampsData {
  videoId: string;
  durationSeconds: number;
  timestamps: TrackTimestampItem[];
  heatMarkers: HeatMarker[];
  highlightStartSec: number;
  highlightLabel?: string;
  totalCommentTimestamps: number;
}

export interface ArtistLiveSetlist {
  id: string;
  title: string;
  sourceTitle: string;
  sourceVideoId?: string;
  sourcePlaylistId?: string;
  sourceType: 'live-video' | 'playlist';
  thumbnail: string;
  tracks: (Track & { setlistIndex: number; timestampSec?: number })[];
}

export type ViewType = 'home' | 'search' | 'library' | 'artist' | 'album' | 'playlist' | 'party' | 'podcasts' | 'tools';
export type PlayerMode = 'cover' | 'video';
export type VideoLayout = 'theater' | 'pip';
export type RepeatMode = 'off' | 'all' | 'one';

export type EqPresetId =
  | 'flat'
  | 'bass_boost'
  | 'vocal_boost'
  | 'rock'
  | 'electronic'
  | 'acoustic'
  | 'treble_clear'
  | 'late_night'
  | 'custom';

export interface EqualizerBands {
  b60: number;
  b170: number;
  b450: number;
  b1200: number;
  b3600: number;
  b10000: number;
}

export const DEFAULT_EQ_BANDS: EqualizerBands = {
  b60: 0,
  b170: 0,
  b450: 0,
  b1200: 0,
  b3600: 0,
  b10000: 0,
};

export const EQ_PRESETS: Record<
  Exclude<EqPresetId, 'custom'>,
  { label: string; desc: string; bands: EqualizerBands }
> = {
  flat: {
    label: 'フラット',
    desc: '原音そのままのバランス',
    bands: { b60: 0, b170: 0, b450: 0, b1200: 0, b3600: 0, b10000: 0 },
  },
  bass_boost: {
    label: '重低音',
    desc: 'バスとキックの迫力を強化',
    bands: { b60: 7, b170: 5, b450: 1, b1200: -1, b3600: 1, b10000: 2 },
  },
  vocal_boost: {
    label: 'ボーカル強調',
    desc: '歌声と歌詞を前面にクッキリ',
    bands: { b60: -2, b170: -1, b450: 2, b1200: 5, b3600: 4, b10000: 2 },
  },
  rock: {
    label: 'ロック',
    desc: 'ギターとドラムのライブ感ある音圧',
    bands: { b60: 4, b170: 3, b450: -1, b1200: 2, b3600: 4, b10000: 5 },
  },
  electronic: {
    label: 'EDM / ダンス',
    desc: 'サブベースと高域シンセを際立たせる',
    bands: { b60: 6, b170: 4, b450: -2, b1200: 1, b3600: 3, b10000: 6 },
  },
  acoustic: {
    label: 'アコースティック',
    desc: '生楽器の温かみと自然な空気感',
    bands: { b60: 2, b170: 3, b450: 2, b1200: 2, b3600: 3, b10000: 3 },
  },
  treble_clear: {
    label: 'クリア高音',
    desc: 'こもりを抑え輪郭をシャープに',
    bands: { b60: -1, b170: 0, b450: 0, b1200: 2, b3600: 5, b10000: 6 },
  },
  late_night: {
    label: '深夜・小音量',
    desc: '小音量でも聴き取りやすいバランス',
    bands: { b60: 3, b170: 2, b450: 1, b1200: 3, b3600: 2, b10000: 1 },
  },
};

export interface ABRepeatState {
  a: number | null;
  b: number | null;
}
