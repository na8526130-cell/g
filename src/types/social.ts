import { Track } from './music';

export interface TrackComment {
  id: string;
  videoId: string;
  timestampSec: number;
  formattedTime: string;
  text: string;
  username: string;
  userAvatar?: string;
  createdAt: string;
  likes: number;
  likedBy: string[];
  color?: string;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  sender: string;
  recipient: string;
  content?: string;
  trackCard?: {
    videoId: string;
    title: string;
    artist: string;
    thumbnail: string;
    duration?: string;
  };
  playlistCard?: {
    id: string;
    name: string;
    author: string;
    trackCount: number;
    thumbnail?: string;
    tracks: Track[];
  };
  timestamp: string;
  read: boolean;
  reactions: Record<string, string[]>;
}

export interface ConversationSummary {
  withUser: string;
  lastMessage: DirectMessage;
  unreadCount: number;
  isOnline: boolean;
  nowPlaying?: {
    title: string;
    artist: string;
    videoId: string;
  };
}

export interface ListeningPartyRoom {
  id: string;
  name: string;
  description: string;
  category: 'rock' | 'chill' | 'vocaloid' | 'free' | 'custom';
  hostUsername: string;
  currentTrack: Track | null;
  isPlaying: boolean;
  positionSec: number;
  updatedAt: number;
  queue?: Track[];
  allowGuestControl?: boolean;
  participants: {
    username: string;
    joinedAt: string;
    isHost: boolean;
    nowPlaying?: string;
  }[];
  chatMessages: {
    id: string;
    username: string;
    text: string;
    timestamp: string;
    type: 'chat' | 'system' | 'track_change';
  }[];
}

export interface ConnectDeviceInfo {
  deviceId: string;
  name: string;
  deviceType: 'mobile' | 'pc' | 'tablet';
  username?: string;
  pairingCode: string;
  lastSeen: number;
  currentTrack?: Track | null;
  queue?: Track[];
  isPlaying?: boolean;
  positionSec?: number;
  durationSec?: number;
  volume?: number;
}

export interface ConnectCommandPayload {
  cmdId?: string;
  targetDeviceId: string;
  fromDeviceId?: string;
  fromDeviceName?: string;
  pairingCode?: string;
  username?: string;
  action: 'play' | 'pause' | 'toggle' | 'next' | 'prev' | 'seek' | 'volume' | 'playTrack' | 'transfer';
  positionSec?: number;
  seekSec?: number;
  volume?: number;
  track?: Track;
  queue?: Track[];
}

export interface CollabPlaylistRoom {
  code: string;
  title: string;
  description?: string;
  hostUsername: string;
  members: string[];
  tracks: Track[];
  updatedAt: string;
}

export interface SocialNotification {
  id: string;
  recipient: string;
  sender: string;
  type: 'dm' | 'comment_like' | 'room_invite' | 'follow' | 'broadcast';
  title: string;
  body: string;
  data?: any;
  timestamp: string;
  read: boolean;
}

export interface ActivityFeedItem {
  id: string;
  username: string;
  action: 'played' | 'commented' | 'created_playlist' | 'liked';
  targetTitle: string;
  targetSubtitle?: string;
  targetId?: string;
  thumbnail?: string;
  timestamp: string;
}

export interface ModerationReport {
  id: string;
  reporter: string;
  reportedUser: string;
  targetType: 'comment' | 'message' | 'room';
  targetId: string;
  reason: string;
  contentSnippet?: string;
  timestamp: string;
  status: 'pending' | 'resolved' | 'dismissed';
}
