import express, { Express, Request, Response } from 'express';
import { execFile, spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import type { Innertube } from 'youtubei.js';
import {
  FREEMAKE_DOWNLOAD_SITES,
  FreemakeDownloadSiteId,
  resolveViaPipedPool,
  resolveViaInvidiousPool,
  searchMultiSiteCandidates,
  SearchHelpers,
} from './downloadSites.js';
import {
  assertSafePublicHttpUrl,
  CoverImageAsset,
  embedMetadataAndCoverFile,
  fetchBestCoverImage,
  fetchSafeExternalImage,
} from './coverEmbed.js';

const execFileAsync = promisify(execFile);

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const IS_VERCEL = Boolean(process.env.VERCEL);

export type FreemakeFormatId =
  | 'mp3_320'
  | 'mp3_192'
  | 'mp3_128'
  | 'm4a_256'
  | 'flac'
  | 'wav'
  | 'ogg'
  | 'mp4'
  | 'mkv'
  | 'avi'
  | 'webm';

export type FreemakeVideoQualityId = 'best' | '2160' | '1080' | '720' | '480' | '360';

function parseQualityMaxHeight(q?: string): number {
  const clean = String(q || '').trim().toLowerCase();
  if (clean === '2160' || clean === '4k') return 2160;
  if (clean === '1080' || clean === '1080p') return 1080;
  if (clean === '720' || clean === '720p') return 720;
  if (clean === '480' || clean === '480p') return 480;
  if (clean === '360' || clean === '360p') return 360;
  return 0;
}

export interface FreemakeFormatSpec {
  id: FreemakeFormatId;
  label: string;
  ext: string;
  mimeType: string;
  isVideo: boolean;
  bitrateLabel: string;
  ffmpegArgs: string[];
}

export const FREEMAKE_FORMATS: Record<FreemakeFormatId, FreemakeFormatSpec> = {
  mp3_320: {
    id: 'mp3_320',
    label: 'MP3 最高音質 (320kbps)',
    ext: 'mp3',
    mimeType: 'audio/mpeg',
    isVideo: false,
    bitrateLabel: '320 kbps',
    ffmpegArgs: ['-vn', '-c:a', 'libmp3lame', '-b:a', '320k', '-ar', '44100'],
  },
  mp3_192: {
    id: 'mp3_192',
    label: 'MP3 標準高音質 (192kbps)',
    ext: 'mp3',
    mimeType: 'audio/mpeg',
    isVideo: false,
    bitrateLabel: '192 kbps',
    ffmpegArgs: ['-vn', '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100'],
  },
  mp3_128: {
    id: 'mp3_128',
    label: 'MP3 軽量 (128kbps)',
    ext: 'mp3',
    mimeType: 'audio/mpeg',
    isVideo: false,
    bitrateLabel: '128 kbps',
    ffmpegArgs: ['-vn', '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100'],
  },
  m4a_256: {
    id: 'm4a_256',
    label: 'M4A / AAC 高音質 (256kbps)',
    ext: 'm4a',
    mimeType: 'audio/mp4',
    isVideo: false,
    bitrateLabel: '256 kbps',
    ffmpegArgs: ['-vn', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart'],
  },
  flac: {
    id: 'flac',
    label: 'FLAC ロスレス (Lossless)',
    ext: 'flac',
    mimeType: 'audio/flac',
    isVideo: false,
    bitrateLabel: 'Lossless',
    ffmpegArgs: ['-vn', '-c:a', 'flac'],
  },
  wav: {
    id: 'wav',
    label: 'WAV 非圧縮 (16-bit PCM)',
    ext: 'wav',
    mimeType: 'audio/wav',
    isVideo: false,
    bitrateLabel: '1411 kbps',
    ffmpegArgs: ['-vn', '-c:a', 'pcm_s16le', '-ar', '44100'],
  },
  ogg: {
    id: 'ogg',
    label: 'OGG Vorbis (高効率)',
    ext: 'ogg',
    mimeType: 'audio/ogg',
    isVideo: false,
    bitrateLabel: '~192 kbps',
    ffmpegArgs: ['-vn', '-c:a', 'libvorbis', '-q:a', '6'],
  },
  mp4: {
    id: 'mp4',
    label: 'MP4 動画 / MV (汎用高画質)',
    ext: 'mp4',
    mimeType: 'video/mp4',
    isVideo: true,
    bitrateLabel: 'H.264 + AAC',
    ffmpegArgs: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'],
  },
  mkv: {
    id: 'mkv',
    label: 'MKV 動画 (Matroska HD)',
    ext: 'mkv',
    mimeType: 'video/x-matroska',
    isVideo: true,
    bitrateLabel: 'H.264 + AAC',
    ffmpegArgs: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-c:a', 'aac', '-b:a', '192k'],
  },
  avi: {
    id: 'avi',
    label: 'AVI 動画 (互換フォーマット)',
    ext: 'avi',
    mimeType: 'video/x-msvideo',
    isVideo: true,
    bitrateLabel: 'MPEG-4 + MP3',
    ffmpegArgs: ['-c:v', 'mpeg4', '-q:v', '4', '-c:a', 'libmp3lame', '-b:a', '192k'],
  },
  webm: {
    id: 'webm',
    label: 'WebM 動画 (VP8 / Vorbis)',
    ext: 'webm',
    mimeType: 'video/webm',
    isVideo: true,
    bitrateLabel: 'VP8 + Vorbis',
    ffmpegArgs: ['-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '5', '-crf', '22', '-b:v', '1500k', '-c:a', 'libvorbis', '-q:a', '5'],
  },
};

// ---------- FFmpeg / FFprobe Availability Cache ----------

let cachedFfmpegStatus: Promise<{ available: boolean; version: string }> | null = null;
let cachedFfprobeAvailable: Promise<boolean> | null = null;

async function getFfmpegStatus(): Promise<{ available: boolean; version: string }> {
  if (!cachedFfmpegStatus) {
    cachedFfmpegStatus = (async () => {
      try {
        const { stdout } = await execFileAsync('ffmpeg', ['-version'], { timeout: 3000 });
        return {
          available: true,
          version: stdout.split('\n')[0]?.trim() || 'ffmpeg available',
        };
      } catch {
        return { available: false, version: '' };
      }
    })();
  }
  return cachedFfmpegStatus;
}

async function getFfprobeAvailable(): Promise<boolean> {
  if (!cachedFfprobeAvailable) {
    cachedFfprobeAvailable = (async () => {
      try {
        await execFileAsync('ffprobe', ['-version'], { timeout: 3000 });
        return true;
      } catch {
        return false;
      }
    })();
  }
  return cachedFfprobeAvailable;
}

function sanitizeFilenameBase(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || 'zero-music-track').slice(0, 120);
}

function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase();
    if (host.includes('youtu.be')) {
      const id = u.pathname.replace(/^\//, '').slice(0, 11);
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      const v = u.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const embedMatch = u.pathname.match(/\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})/);
      if (embedMatch?.[1]) return embedMatch[1];
    }
  } catch {}
  return null;
}

function extractYouTubePlaylistId(input: string): string | null {
  const trimmed = input.trim();
  try {
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase();
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      const list = u.searchParams.get('list');
      if (list && /^[a-zA-Z0-9_-]{8,128}$/.test(list) && list !== 'WL' && list !== 'LL') {
        return list;
      }
    }
  } catch {}
  return null;
}

interface ResolvedPlaylistItem {
  videoId: string;
  title: string;
  artist: string;
  thumbnail?: string;
  duration?: string;
  durationSeconds?: number;
}

async function resolveYouTubePlaylist(
  listId: string,
  getInnertube: () => Promise<Innertube>
): Promise<{ playlistTitle: string; items: ResolvedPlaylistItem[] } | null> {
  try {
    const yt = await getInnertube();
    let playlistTitle = 'YouTube プレイリスト';
    const out: ResolvedPlaylistItem[] = [];
    const seen = new Set<string>();

    const pushItem = (raw: any) => {
      const id = String(raw?.id || raw?.video_id || '').trim();
      if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id) || seen.has(id)) return;
      seen.add(id);
      const itemTitle = String(raw?.title?.toString?.() || raw?.title || '').trim();
      if (!itemTitle) return;
      const artist = String(
        raw?.artists?.[0]?.name || raw?.author?.name || raw?.channel?.name || 'YouTube'
      )
        .replace(/\s*-\s*Topic$/i, '')
        .trim();
      const durSec = Number(raw?.duration?.seconds) || parseDurationTextToSec(raw?.duration?.text);
      const durText =
        typeof raw?.duration?.text === 'string' && raw.duration.text
          ? raw.duration.text
          : durSec > 0
          ? formatSecLabel(durSec)
          : undefined;
      const thumb =
        raw?.thumbnails?.[0]?.url ||
        raw?.thumbnail?.contents?.[0]?.url ||
        `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
      out.push({
        videoId: id,
        title: itemTitle,
        artist,
        thumbnail: thumb,
        duration: durText,
        durationSeconds: durSec > 0 ? durSec : undefined,
      });
    };

    try {
      const musicPl: any = await yt.music.getPlaylist(listId);
      if (musicPl?.header?.title) {
        playlistTitle = String(musicPl.header.title.toString?.() || musicPl.header.title).trim();
      }
      const items = Array.isArray(musicPl?.contents) ? musicPl.contents : [];
      for (const item of items) pushItem(item);
    } catch {}

    if (out.length === 0) {
      try {
        const pl: any = await yt.getPlaylist(listId);
        if (pl?.info?.title) {
          playlistTitle = String(pl.info.title).trim();
        }
        const items = Array.isArray(pl?.items) ? pl.items : Array.isArray(pl?.videos) ? pl.videos : [];
        for (const item of items) pushItem(item);
      } catch {}
    }

    if (out.length === 0) return null;
    return { playlistTitle, items: out.slice(0, 40) };
  } catch {
    return null;
  }
}

function stripHtmlTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function cleanSearchTitle(title: string, artist = ''): string {
  let cleaned = title
    .replace(/[\[【（(][^\]】）)]*(official|music\s*video|lyric\s*video|audio|mv|m\/v|pv|hd|4k|公式|歌詞|hi-?res|flac|无损|中字)[^\]】）)]*[\]】）)]/gi, ' ')
    .replace(/\b(official\s*(music\s*video|video|audio|lyric\s*video)|music\s*video|lyric\s*video)\b/gi, ' ')
    .replace(/[「」『』]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (artist.trim()) {
    const escapedArtist = artist.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned
      .replace(new RegExp(`^${escapedArtist}\\s*[-–—:/|]\\s*`, 'i'), '')
      .replace(new RegExp(`\\s*[-–—:/|]\\s*${escapedArtist}$`, 'i'), '')
      .trim();
  }

  return cleaned;
}

function normalizeMatchText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactMatchText(s: string): string {
  return normalizeMatchText(s).replace(/\s+/g, '');
}

const ARTIST_ALIAS_GROUPS: string[][] = [
  ['official髭男dism', 'officialhigedandism', '髭男', '胡子男', 'higedan'],
  ['yoasobi', '夜遊び'],
  ['mrsgreenapple', 'ミセスグリーンアップル', 'ミセス'],
  ['vaundy', 'バウンディ'],
  ['kenshiyonezu', '米津玄師', 'hachi'],
  ['kinggnu', 'キングヌー'],
  ['aimyon', 'あいみょん'],
  ['ado', 'アド'],
  ['backnumber', 'バックナンバー'],
  ['radwimps', 'ラッドウィンプス'],
  ['spitz', 'スピッツ'],
  ['bumpofchicken', 'バンプオブチキン'],
  ['yorushika', 'ヨルシカ'],
  ['zutomayo', 'ずっと真夜中でいいのに'],
  ['oneokrock', 'ワンオクロック', 'ワンオク'],
  ['sekainoowari', '世界の終わり', 'セカオワ'],
  ['perfume', 'パフューム'],
  ['creepy nuts', 'creepynuts', 'クリーピーナッツ'],
  ['fujii kaze', 'fujiikaze', '藤井風'],
  ['tani yuuki', 'taniyuuki'],
  ['yuuri', '優里'],
  ['imase', 'イマセ'],
  ['rize', 'lisa', 'リサ'],
  ['aimer', 'エメ'],
];

function getArtistMatchVariants(artist: string): string[] {
  const norm = normalizeMatchText(artist);
  const compact = compactMatchText(artist);
  if (!compact) return [];
  const variants = new Set<string>([norm, compact]);
  for (const group of ARTIST_ALIAS_GROUPS) {
    const compactedGroup = group.map((g) => compactMatchText(g));
    if (compactedGroup.some((g) => compact.includes(g) || g.includes(compact))) {
      for (const alias of compactedGroup) {
        if (alias.length >= 2) variants.add(alias);
      }
    }
  }
  return [...variants].filter(Boolean);
}

function checkArtistMatch(haystack: string, targetArtist: string): boolean {
  if (!targetArtist.trim()) return true;
  const hayNorm = normalizeMatchText(haystack);
  const hayCompact = compactMatchText(haystack);
  const variants = getArtistMatchVariants(targetArtist);
  for (const v of variants) {
    if (v.length >= 2 && (hayNorm.includes(v) || hayCompact.includes(v))) {
      return true;
    }
  }
  const tokens = normalizeMatchText(targetArtist)
    .split(' ')
    .filter((t) => t.length >= 2);
  if (tokens.length > 1) {
    const matchedCount = tokens.filter((t) => hayNorm.includes(t) || hayCompact.includes(t)).length;
    if (matchedCount >= Math.ceil(tokens.length * 0.6)) return true;
  }
  return false;
}

function parseDurationTextToSec(dur: string | number | undefined): number {
  if (typeof dur === 'number' && Number.isFinite(dur)) return Math.round(dur);
  const str = String(dur || '').trim();
  if (!str) return 0;
  const parts = str.split(':').map((p) => Number(p.trim()));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] || 0;
}

function formatSecLabel(sec: number): string {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface VariantIntent {
  wantsLive: boolean;
  wantsInst: boolean;
  wantsCover: boolean;
  wantsRemix: boolean;
  wantsDigestOrAlbum: boolean;
  wantsSoloInst: boolean;
}

function detectTargetIntent(targetTitle: string): VariantIntent {
  return {
    wantsLive: /\b(live|tour|concert|acoustic|unplugged|fancam)\b|ライブ|ツアー|武道館|アリーナ|ドーム|弾き語り|生演奏|コンサート|フェス|现场/i.test(
      targetTitle
    ),
    wantsInst: /\b(instrumental|off\s*vocal|karaoke|inst\.?)\b|カラオケ|ニコカラ|伴奏|インスト|纯k/i.test(
      targetTitle
    ),
    wantsCover: /\b(cover|acapella)\b|歌ってみた|弾いてみた|叩いてみた|翻唱|アカペラ/i.test(
      targetTitle
    ),
    wantsRemix: /\b(remix|nightcore|slowed|sped\s*up|8d|rearrange)\b|リミックス|リアレンジ/i.test(
      targetTitle
    ),
    wantsDigestOrAlbum: /\b(digest|medley|teaser|trailer|crossfade|full\s*album|summary)\b|摘要|ダイジェスト|メドレー|試聴|试听|全曲|予告|高光|合集|发售纪念|発売記念|インタビュー|interview|采访/i.test(
      targetTitle
    ),
    wantsSoloInst: /\b(piano|guitar|bass|drum|music\s*box|orchestra)\b|ピアノ|ギター|ベース|ドラム|オルゴール|钢琴|吉他/i.test(
      targetTitle
    ),
  };
}

function hasDisallowedVariantMarker(text: string, intent: VariantIntent): boolean {
  if (
    !intent.wantsLive &&
    /(\blive\b|\btour\b|\bconcert\b|\barena\b|\bdome\b|\bbudokan\b|\bfes\b|free\s*live|online\s*live|one-?man\s*tour|ライブ|ツアー|コンサート|武道館|アリーナ|ドーム|フェス|現場|现场|巡演|演唱会|弹唱|弾き語り)/i.test(
      text
    )
  ) {
    return true;
  }
  if (
    !intent.wantsInst &&
    /(\boff\s*vocal\b|\boffvocal\b|\binstrumental\b|\bkaraoke\b|\binst\.?\b|インスト|カラオケ|ニコカラ|纯k|伴奏|和声伴奏|纯伴奏|消音)/i.test(
      text
    )
  ) {
    return true;
  }
  if (
    !intent.wantsCover &&
    /(\bcover\b|\bcovered\b|\bacapella\b|\barrange\b|歌ってみた|弾いてみた|叩いてみた|翻唱|声真似|アカペラ|唱见|歌枠|the\s*first\s*take|vtuber|にじさんじ|nijisanji|ホロライブ|hololive|原唱[:：])/i.test(
      text
    )
  ) {
    return true;
  }
  if (
    !intent.wantsRemix &&
    /(\bremix\b|\bnightcore\b|\bslowed\b|\bsped\s*up\b|8d\s*audio|リアレンジ|替え歌)/i.test(
      text
    )
  ) {
    return true;
  }
  if (
    !intent.wantsDigestOrAlbum &&
    /(\bdigest\b|\bsummary\b|\bteaser\b|\btrailer\b|\bcrossfade\b|\bmedley\b|\bfull\s*album\b|\binterview\b|\bmaking\b|\bblu-?ray\b|\bbd\/?dvd\b|\bdvd\b|摘要|ダイジェスト|发售纪念|発売記念|リリース記念|高光|采访|インタビュー|蓝光|专辑试听|试听|試聴|全曲|予告|メイキング|特典|附赠|クロスフェード|メドレー|作業用|bgm耐久|1時間|10時間|リアクション|\breaction\b|解説|考察|切り抜き|\bshorts\b|\bmad\b|光遇|鬼畜)/i.test(
      text
    )
  ) {
    return true;
  }
  if (
    !intent.wantsSoloInst &&
    /(\bpiano\b|\bguitar\b|\bbass\b|\bdrum\b|\btab\b|music\s*box|tab谱|曲谱|鼓谱|乐谱|教程|教学|教你唱|练习用|模唱|ピアノ|ギター|ベース|ドラム|オルゴール|钢琴|吉他|口琴|二胡|古筝|萨克斯|小提琴|大提琴|架子鼓|演奏|独奏)/i.test(
      text
    )
  ) {
    return true;
  }
  return false;
}

function isHarmlessBracketTag(inner: string, targetTitle: string, targetArtist: string): boolean {
  const trimmed = inner.trim();
  if (!trimmed) return true;
  if (targetArtist.trim() && checkArtistMatch(trimmed, targetArtist)) return true;
  const normTarget = normalizeMatchText(targetTitle);
  if (normTarget && normalizeMatchText(trimmed) === normTarget) return true;
  return /^[\s/|·\-_,]*(official(\s*(music\s*video|video|audio|mv))?|music\s*video|lyric\s*video|official\s*audio|mv|m\/v|pv|hd|4k|8k|1080p|60fps|hi-?res|lossless|flac|mp3|full|audio|sub|cc|公式|歌詞|歌詞付き|高音質|高音质|完整版|原曲|无损|纯享|中文字?幕?|中日双?语?字幕?|双语字幕?|中字\s*mv|高清版?\s*mv|高清版?|专辑|单曲|cd|ep|dts|5\.1声道|杜比全景声)[\s/|·\-_,]*$/i.test(
    trimmed
  );
}

function stripParenthesesIfPlainTarget(
  candidateTitle: string,
  targetTitle: string,
  targetArtist = ''
): { cleaned: string; hasUnknownBracketTag: boolean } {
  const targetHasParens = /[()（）]/.test(targetTitle);
  let hasUnknownBracketTag = false;

  const replaceBracket = (_m: string, inner: string) => {
    if (isHarmlessBracketTag(inner, targetTitle, targetArtist)) {
      return ' ';
    }
    hasUnknownBracketTag = true;
    return ` ${inner} `;
  };

  let cleaned = candidateTitle
    .replace(/\[([^\]]*)\]/g, replaceBracket)
    .replace(/【([^】]*)】/g, replaceBracket)
    .replace(/[「」『』]/g, ' ');

  if (!targetHasParens) {
    cleaned = cleaned.replace(/\(([^)]*)\)/g, ' ').replace(/（([^）]*)）/g, ' ');
  }
  return { cleaned: cleaned.replace(/\s+/g, ' ').trim(), hasUnknownBracketTag };
}

function extractCoreSongTitle(candidateTitle: string, targetTitle: string, targetArtist: string): string {
  let { cleaned: s } = stripParenthesesIfPlainTarget(candidateTitle, targetTitle, targetArtist);
  for (const variant of getArtistMatchVariants(targetArtist)) {
    if (variant.length >= 2) {
      const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      s = s.replace(new RegExp(escaped, 'gi'), ' ');
    }
  }
  if (targetArtist.trim()) {
    const escapedRaw = targetArtist.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(escapedRaw, 'gi'), ' ');
  }
  s = s
    .replace(/\b(official|music\s*video|lyric\s*video|official\s*audio|audio|mv|hd|4k|hi-?res|flac|mp3|full|ver\.?)\b/gi, ' ')
    .replace(/(公式|歌詞付き|歌詞|高音質|高音质|完整版|原曲|无损|中文字?幕?|中日双?语?字幕?|高清版?)/gi, ' ');
  return normalizeMatchText(s);
}

function scoreCandidateTrack(params: {
  candidateTitle: string;
  candidateAuthor?: string;
  collectionTitle?: string;
  durationSec: number;
  playCount?: number;
  targetTitle: string;
  targetArtist: string;
  expectedDurationSec?: number;
}): number {
  const {
    candidateTitle,
    candidateAuthor = '',
    collectionTitle = '',
    durationSec,
    playCount = 0,
    targetTitle,
    targetArtist,
    expectedDurationSec = 0,
  } = params;

  if (durationSec > 0 && durationSec < 45) return -999;
  const maxAllowedSec = expectedDurationSec > 900 ? expectedDurationSec + 180 : 960;
  if (durationSec > maxAllowedSec) return -999;

  const intent = detectTargetIntent(targetTitle);
  const fullContextText = `${candidateTitle} ${candidateAuthor}`;
  if (hasDisallowedVariantMarker(fullContextText, intent)) {
    return -999;
  }

  if (expectedDurationSec > 45 && durationSec > 0) {
    const minAcceptable = expectedDurationSec - Math.max(15, Math.round(expectedDurationSec * 0.12));
    const maxAcceptable = expectedDurationSec + Math.max(35, Math.round(expectedDurationSec * 0.25));
    if (durationSec < minAcceptable || durationSec > maxAcceptable) {
      return -999;
    }
  }

  const artistHaystack = `${candidateTitle} ${candidateAuthor} ${collectionTitle}`;
  const artistMatched = checkArtistMatch(artistHaystack, targetArtist);
  if (targetArtist.trim() && !artistMatched) {
    return -999;
  }

  const cleanedTarget = cleanSearchTitle(targetTitle, targetArtist) || targetTitle;
  const normTargetTitle = normalizeMatchText(cleanedTarget);
  const { cleaned: strippedCandTitle, hasUnknownBracketTag } = stripParenthesesIfPlainTarget(
    candidateTitle,
    cleanedTarget,
    targetArtist
  );
  const normStrippedCand = normalizeMatchText(strippedCandTitle);
  const normCoreCand = extractCoreSongTitle(candidateTitle, cleanedTarget, targetArtist);
  const compactTarget = normTargetTitle.replace(/\s+/g, '');
  const compactCore = normCoreCand.replace(/\s+/g, '');

  let score = 0;

  if (normTargetTitle) {
    if (normCoreCand === normTargetTitle || compactCore === compactTarget) {
      score += 85;
    } else if (
      normStrippedCand === normTargetTitle ||
      (normCoreCand.includes(normTargetTitle) &&
        normCoreCand.split(' ').filter(Boolean).length <= normTargetTitle.split(' ').filter(Boolean).length + 2)
    ) {
      score += 65;
    } else if (normStrippedCand.includes(normTargetTitle)) {
      const extraWords =
        normCoreCand.split(' ').filter(Boolean).length -
        normTargetTitle.split(' ').filter(Boolean).length;
      if (extraWords > 3) {
        return -999;
      }
      score += 48;
    } else {
      const tokens = normTargetTitle.split(' ').filter((t) => t.length >= 2);
      if (tokens.length === 0) return -999;
      const matched = tokens.filter((t) => normStrippedCand.includes(t)).length;
      const ratio = matched / tokens.length;
      if (ratio < 0.75) return -999;
      score += Math.round(ratio * 45);
    }
  }

  if (hasUnknownBracketTag) {
    score -= 40;
  }

  if (artistMatched && targetArtist.trim()) {
    score += 30;
  }

  if (expectedDurationSec > 45 && durationSec > 0) {
    const absDiff = Math.abs(durationSec - expectedDurationSec);
    if (absDiff <= 6) score += 50;
    else if (absDiff <= 14) score += 32;
    else if (absDiff <= 25) score += 12;
    else score -= 20;
  } else if (durationSec >= 100 && durationSec <= 420) {
    score += 10;
  }

  if (/official|music\s*video|\bmv\b|hi-?res|flac|完整版|高音质|原曲|公式|full|无损/i.test(candidateTitle)) {
    score += 12;
  }

  if (playCount > 0) {
    score += Math.min(18, Math.log10(playCount + 1) * 3);
  }

  return score;
}

const MIN_CANDIDATE_SCORE = 75;

function isYtimgWideThumb(url?: string | null): boolean {
  if (!url) return false;
  return /https?:\/\/(?:i\d*|img)\.ytimg\.com\//i.test(url);
}

function upgradeItunesArtworkUrl(url?: string | null): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  return url.replace(/\/\d+x\d+bb\.(jpg|png|webp)(\?.*)?$/i, '/1000x1000bb.jpg');
}

async function resolveMetadataForTrack(params: {
  videoId?: string | null;
  title?: string;
  artist?: string;
  album?: string;
  thumbnail?: string;
  duration?: string;
  durationSeconds?: number;
  getInnertube?: () => Promise<Innertube>;
}): Promise<{
  title: string;
  artist: string;
  album?: string;
  thumbnailUrl?: string;
  coverCandidates: string[];
  expectedDurationSec: number;
  officialPreviewUrl?: string;
  officialPreviewSource?: string;
}> {
  let title = String(params.title || '').trim();
  let artist = String(params.artist || '').trim();
  let album = String(params.album || '').trim();
  const clientThumb = String(params.thumbnail || '').trim();
  let ytOembedThumb = '';
  let expectedDurationSec =
    Number(params.durationSeconds) || parseDurationTextToSec(params.duration) || 0;

  if (params.videoId && (!title || !artist || !clientThumb)) {
    try {
      const oeRes = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(
          `https://www.youtube.com/watch?v=${params.videoId}`
        )}&format=json`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (oeRes.ok) {
        const oe = (await oeRes.json()) as any;
        if (!title && oe?.title) title = String(oe.title).trim();
        if (!artist && oe?.author_name) {
          artist = String(oe.author_name).replace(/\s*-\s*Topic$/i, '').trim();
        }
        if (oe?.thumbnail_url) ytOembedThumb = String(oe.thumbnail_url).trim();
      }
    } catch {}
  }

  // If duration is still unknown and we have a YouTube videoId, try lightweight lookup
  if (params.videoId && expectedDurationSec <= 0 && params.getInnertube) {
    try {
      const yt = await params.getInnertube();
      const sRes: any = await yt.search(params.videoId, { type: 'video' });
      const exactVid = (sRes?.videos || []).find((v: any) => v?.id === params.videoId);
      if (exactVid) {
        const durSec = Number(exactVid?.duration?.seconds) || parseDurationTextToSec(exactVid?.duration?.text);
        if (durSec > 0) expectedDurationSec = durSec;
        if (!title && exactVid?.title) title = exactVid.title.toString().trim();
        if (!artist && exactVid?.author?.name) {
          artist = String(exactVid.author.name).replace(/\s*-\s*Topic$/i, '').trim();
        }
      }
    } catch {}
  }

  // Clean up oEmbed titles like "Artist - Song Title [Official Video]"
  if (title) {
    const cleaned = cleanSearchTitle(title, artist);
    if (cleaned) {
      if (!artist && cleaned.includes(' - ')) {
        const parts = cleaned.split(' - ');
        if (parts[0].trim() && parts.slice(1).join(' - ').trim()) {
          artist = parts[0].trim();
          title = parts.slice(1).join(' - ').trim();
        }
      } else {
        title = cleaned;
      }
    }
  }

  let officialPreviewUrl: string | undefined;
  let officialPreviewSource: string | undefined;
  let itunesArtworkUrl: string | undefined;

  const q = [cleanSearchTitle(title, artist), artist].filter(Boolean).join(' ').trim();
  if (q) {
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&country=JP&media=music&limit=8`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (res.ok) {
        const data = (await res.json()) as any;
        const intent = detectTargetIntent(title);
        const normTargetTitle = normalizeMatchText(cleanSearchTitle(title, artist) || title);
        const compactTargetTitle = normTargetTitle.replace(/\s+/g, '');

        const scoredHits = (data?.results || [])
          .filter((r: any) => typeof r?.previewUrl === 'string' && r.previewUrl)
          .map((r: any) => {
            const rTitle = String(r.trackName || '');
            const rArtist = String(r.artistName || '');
            const rDur = Math.round(Number(r.trackTimeMillis || 0) / 1000);
            if (hasDisallowedVariantMarker(rTitle, intent)) return { r, score: -999 };
            if (artist && !checkArtistMatch(rArtist, artist)) return { r, score: -999 };

            const normRTitle = normalizeMatchText(cleanSearchTitle(rTitle, artist) || rTitle);
            const strippedRTitle = normalizeMatchText(
              stripParenthesesIfPlainTarget(rTitle, title, artist).cleaned
            );
            const compactRTitle = strippedRTitle.replace(/\s+/g, '');

            let s = 0;
            if (compactRTitle === compactTargetTitle || normRTitle === normTargetTitle) {
              s += 80;
            } else if (strippedRTitle.includes(normTargetTitle)) {
              s += 50;
            } else {
              return { r, score: -999 };
            }

            if (expectedDurationSec > 45 && rDur > 0) {
              const diff = Math.abs(rDur - expectedDurationSec);
              if (diff <= 10) s += 30;
              else if (diff > 35) s -= 60;
            }
            return { r, score: s };
          })
          .filter((x: any) => x.score >= 50)
          .sort((a: any, b: any) => b.score - a.score);

        const hit = scoredHits[0]?.r;
        if (hit) {
          officialPreviewUrl = hit.previewUrl;
          officialPreviewSource = 'Apple iTunes 公式30秒プレビュー';
          if (!expectedDurationSec && hit.trackTimeMillis) {
            expectedDurationSec = Math.round(Number(hit.trackTimeMillis) / 1000);
          }
          if (!title && hit.trackName) title = hit.trackName;
          if (!artist && hit.artistName) artist = hit.artistName;
          if (!album && hit.collectionName) album = String(hit.collectionName).trim();
          itunesArtworkUrl = upgradeItunesArtworkUrl(hit.artworkUrl100 || hit.artworkUrl60);
        }
      }
    } catch {}
  }

  const ytCandidates = params.videoId
    ? [
        `https://i.ytimg.com/vi/${params.videoId}/sddefault.jpg`,
        `https://i.ytimg.com/vi/${params.videoId}/hqdefault.jpg`,
      ]
    : [];

  // Prefer crisp 1:1 square artwork (custom album cover or 1000x1000 iTunes jacket) over wide 16:9 ytimg
  const orderedCandidates: string[] = [];
  if (clientThumb && !isYtimgWideThumb(clientThumb)) {
    orderedCandidates.push(clientThumb);
  }
  if (itunesArtworkUrl) {
    orderedCandidates.push(itunesArtworkUrl);
  }
  if (clientThumb) {
    orderedCandidates.push(clientThumb);
  }
  if (ytOembedThumb) {
    orderedCandidates.push(ytOembedThumb);
  }
  orderedCandidates.push(...ytCandidates);

  const uniqueCandidates = [...new Set(orderedCandidates.filter(Boolean))];
  const thumbnailUrl = uniqueCandidates[0];

  return {
    title,
    artist,
    album: album || undefined,
    thumbnailUrl,
    coverCandidates: uniqueCandidates,
    expectedDurationSec,
    officialPreviewUrl,
    officialPreviewSource,
  };
}

// ---------- Bilibili Full-Track / Official MV Engine ----------

let cachedBiliCookie: { buvid3: string; expiresAt: number } | null = null;

async function getBilibiliCookie(): Promise<string> {
  if (cachedBiliCookie && cachedBiliCookie.expiresAt > Date.now()) {
    return cachedBiliCookie.buvid3;
  }
  try {
    const res = await fetch('https://api.bilibili.com/x/frontend/finger/spi', {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = (await res.json()) as any;
      const b3 = String(data?.data?.b_3 || '');
      if (b3) {
        cachedBiliCookie = { buvid3: b3, expiresAt: Date.now() + 6 * 60 * 60 * 1000 };
        return b3;
      }
    }
  } catch {}
  return '';
}

interface BiliCandidate {
  bvid: string;
  cid?: number;
  title: string;
  author: string;
  durationSec: number;
  playCount: number;
  score: number;
}

async function searchBilibiliCandidates(
  title: string,
  artist: string,
  expectedDurationSec: number
): Promise<BiliCandidate[]> {
  const cleanTitle = cleanSearchTitle(title, artist) || title;
  const keyword = [artist, cleanTitle].filter(Boolean).join(' ').trim();
  if (!keyword) return [];

  const buvid3 = await getBilibiliCookie();
  const headers: Record<string, string> = {
    'User-Agent': BROWSER_UA,
    Referer: 'https://www.bilibili.com/',
    ...(buvid3 ? { Cookie: `buvid3=${buvid3}` } : {}),
  };

  const seen = new Map<string, any>();

  const runQuery = async (kw: string, order: 'click' | 'totalrank') => {
    try {
      const url = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&order=${order}&keyword=${encodeURIComponent(
        kw
      )}`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
      if (!res.ok) return;
      const text = await res.text();
      if (!text.startsWith('{')) return;
      const json = JSON.parse(text);
      const list = Array.isArray(json?.data?.result) ? json.data.result : [];
      for (const item of list.slice(0, 20)) {
        if (item?.bvid && !seen.has(item.bvid)) {
          seen.set(item.bvid, item);
        }
      }
    } catch {}
  };

  await Promise.all([runQuery(keyword, 'click'), runQuery(keyword, 'totalrank')]);
  if (seen.size === 0 && artist && cleanTitle && keyword !== cleanTitle) {
    await runQuery(cleanTitle, 'totalrank');
  }

  const intent = detectTargetIntent(title);
  const maxAllowedSec = expectedDurationSec > 900 ? expectedDurationSec + 180 : 960;
  const candidates: BiliCandidate[] = [];
  const collectionChecks: Array<{ bvid: string; rawTitle: string; rawAuthor: string; playCount: number }> = [];

  for (const item of seen.values()) {
    const rawTitle = stripHtmlTags(String(item.title || ''));
    const rawAuthor = stripHtmlTags(String(item.author || ''));
    const durSec = parseDurationTextToSec(item.duration);
    const playCount = Number(item.play) || 0;

    if (durSec > maxAllowedSec) {
      const isArtistMatched = !artist.trim() || checkArtistMatch(`${rawTitle} ${rawAuthor}`, artist);
      const isBadCollection =
        (!intent.wantsLive && /(\blive\b|\btour\b|ライブ|ツアー|演唱会|巡演|武道館|アリーナ)/i.test(rawTitle)) ||
        (!intent.wantsInst && /(\binstrumental\b|伴奏|カラオケ|和声伴奏)/i.test(rawTitle));
      if (isArtistMatched && !isBadCollection) {
        collectionChecks.push({ bvid: item.bvid, rawTitle, rawAuthor, playCount });
      }
      continue;
    }

    const score = scoreCandidateTrack({
      candidateTitle: rawTitle,
      candidateAuthor: rawAuthor,
      durationSec: durSec,
      playCount,
      targetTitle: title,
      targetArtist: artist,
      expectedDurationSec,
    });
    if (score >= MIN_CANDIDATE_SCORE) {
      candidates.push({
        bvid: item.bvid,
        title: rawTitle,
        author: rawAuthor,
        durationSec: durSec,
        playCount,
        score,
      });
    }
  }

  if (collectionChecks.length > 0 && cleanTitle) {
    const topCollections = collectionChecks
      .sort((a, b) => {
        const aScore = /合集|无损|hi-?res|专辑|album|collection|全集/i.test(a.rawTitle) ? 1 : 0;
        const bScore = /合集|无损|hi-?res|专辑|album|collection|全集/i.test(b.rawTitle) ? 1 : 0;
        return bScore - aScore || b.playCount - a.playCount;
      })
      .slice(0, 4);

    await Promise.allSettled(
      topCollections.map(async (col) => {
        try {
          const viewRes = await fetch(
            `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(col.bvid)}`,
            { headers, signal: AbortSignal.timeout(4500) }
          );
          if (!viewRes.ok) return;
          const viewJson = (await viewRes.json()) as any;
          const pages = Array.isArray(viewJson?.data?.pages) ? viewJson.data.pages : [];
          if (pages.length <= 1) return;

          const ownerName = String(viewJson?.data?.owner?.name || col.rawAuthor || '');
          const viewTitle = String(viewJson?.data?.title || col.rawTitle || '');
          for (const p of pages) {
            const partTitle = String(p?.part || '').trim();
            const partCid = Number(p?.cid) || 0;
            const partDur = Number(p?.duration) || 0;
            if (!partTitle || !partCid) continue;

            const score = scoreCandidateTrack({
              candidateTitle: partTitle,
              candidateAuthor: ownerName,
              collectionTitle: viewTitle,
              durationSec: partDur,
              playCount: col.playCount,
              targetTitle: title,
              targetArtist: artist,
              expectedDurationSec,
            });
            if (score >= MIN_CANDIDATE_SCORE) {
              candidates.push({
                bvid: col.bvid,
                cid: partCid,
                title: partTitle,
                author: ownerName,
                durationSec: partDur,
                playCount: col.playCount,
                score,
              });
            }
          }
        } catch {}
      })
    );
  }

  return candidates.sort((a, b) => b.score - a.score);
}

function prioritizeAkamaiUrls(urls: Array<string | undefined>): string[] {
  const clean = urls.filter((u): u is string => typeof u === 'string' && u.startsWith('http'));
  const unique = [...new Set(clean)];
  return unique.sort((a, b) => {
    const aAkamai = a.includes('akamaized.net') ? 0 : 1;
    const bAkamai = b.includes('akamaized.net') ? 0 : 1;
    return aAkamai - bAkamai;
  });
}

async function probeRemoteStream(
  url: string,
  headers: Record<string, string>
): Promise<{ ok: boolean; totalSize: number }> {
  try {
    const probe = await fetch(url, {
      method: 'GET',
      headers: { ...headers, Range: 'bytes=0-1023' },
      signal: AbortSignal.timeout(4500),
    });
    if (!probe.ok && probe.status !== 206) {
      return { ok: false, totalSize: 0 };
    }
    let totalSize = 0;
    const cr = probe.headers.get('content-range') || '';
    const m = cr.match(/\/(\d+)$/);
    if (m?.[1]) {
      totalSize = Number(m[1]) || 0;
    } else {
      const cl = Number(probe.headers.get('content-length') || 0) || 0;
      if (probe.status === 200 && cl > 1024) totalSize = cl;
    }
    try {
      await probe.body?.cancel();
    } catch {}
    return { ok: true, totalSize };
  } catch {
    return { ok: false, totalSize: 0 };
  }
}

async function resolveBilibiliStreamForCandidate(
  candidate: BiliCandidate,
  wantsVideo: boolean,
  maxVideoHeight = 0
): Promise<{
  url: string;
  headers: Record<string, string>;
  durationSec: number;
  title: string;
  hasVideo: boolean;
} | null> {
  const buvid3 = await getBilibiliCookie();
  const apiHeaders: Record<string, string> = {
    'User-Agent': BROWSER_UA,
    Referer: 'https://www.bilibili.com/',
    ...(buvid3 ? { Cookie: `buvid3=${buvid3}` } : {}),
  };

  try {
    let cid = candidate.cid;
    let realDuration = candidate.durationSec;

    if (!cid) {
      const viewRes = await fetch(
        `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(candidate.bvid)}`,
        { headers: apiHeaders, signal: AbortSignal.timeout(5000) }
      );
      if (!viewRes.ok) return null;
      const viewJson = (await viewRes.json()) as any;
      cid = viewJson?.data?.cid;
      realDuration = Number(viewJson?.data?.duration) || candidate.durationSec;
    }
    if (!cid || realDuration < 15) return null;

    const streamHeaders = {
      'User-Agent': BROWSER_UA,
      Referer: 'https://www.bilibili.com/',
    };

    const tryDurlQuality = async (qn: number): Promise<{ url: string; size: number } | null> => {
      try {
        const playRes = await fetch(
          `https://api.bilibili.com/x/player/playurl?bvid=${encodeURIComponent(
            candidate.bvid
          )}&cid=${cid}&fnval=1&qn=${qn}`,
          { headers: apiHeaders, signal: AbortSignal.timeout(5000) }
        );
        if (!playRes.ok) return null;
        const playJson = (await playRes.json()) as any;
        const durl = playJson?.data?.durl?.[0];
        const declaredSize = Number(durl?.size) || 0;
        const urls = prioritizeAkamaiUrls([durl?.url, ...(durl?.backup_url || [])]);
        for (const u of urls) {
          const probe = await probeRemoteStream(u, streamHeaders);
          if (probe.ok) {
            return { url: u, size: probe.totalSize || declaredSize };
          }
        }
      } catch {}
      return null;
    };

    const tryDashAudio = async (): Promise<string | null> => {
      try {
        const dashRes = await fetch(
          `https://api.bilibili.com/x/player/playurl?bvid=${encodeURIComponent(
            candidate.bvid
          )}&cid=${cid}&fnval=16`,
          { headers: apiHeaders, signal: AbortSignal.timeout(5000) }
        );
        if (!dashRes.ok) return null;
        const dashJson = (await dashRes.json()) as any;
        const rawStreams: any[] = Array.isArray(dashJson?.data?.dash?.audio)
          ? [...dashJson.data.dash.audio]
          : [];
        const audioStreams = rawStreams.sort((a: any, b: any) =>
          IS_VERCEL
            ? (a.bandwidth || 0) - (b.bandwidth || 0)
            : (b.bandwidth || 0) - (a.bandwidth || 0)
        );
        for (const stream of audioStreams.slice(0, 3)) {
          const urls = prioritizeAkamaiUrls([
            stream.baseUrl,
            stream.base_url,
            ...(stream.backupUrl || []),
            ...(stream.backup_url || []),
          ]);
          for (const u of urls) {
            const probe = await probeRemoteStream(u, streamHeaders);
            if (probe.ok) {
              if (IS_VERCEL && probe.totalSize > 4_300_000) continue;
              return u;
            }
          }
        }
      } catch {}
      return null;
    };

    if (wantsVideo) {
      const qnOrder =
        maxVideoHeight > 0 && maxVideoHeight <= 360
          ? [16, 32]
          : maxVideoHeight > 0 && maxVideoHeight <= 480
          ? [32, 16]
          : maxVideoHeight > 0 && maxVideoHeight <= 720
          ? [64, 32]
          : [80, 64, 32];

      for (const qn of qnOrder) {
        const picked = await tryDurlQuality(qn);
        if (picked && (!IS_VERCEL || picked.size === 0 || picked.size <= 36 * 1024 * 1024)) {
          return {
            url: picked.url,
            headers: streamHeaders,
            durationSec: realDuration,
            title: candidate.title,
            hasVideo: true,
          };
        }
      }

      const dashAudioUrl = await tryDashAudio();
      if (dashAudioUrl) {
        return {
          url: dashAudioUrl,
          headers: streamHeaders,
          durationSec: realDuration,
          title: candidate.title,
          hasVideo: false,
        };
      }
    } else {
      const dashAudioUrl = await tryDashAudio();
      if (dashAudioUrl) {
        return {
          url: dashAudioUrl,
          headers: streamHeaders,
          durationSec: realDuration,
          title: candidate.title,
          hasVideo: false,
        };
      }

      const qn32 = await tryDurlQuality(32);
      if (qn32 && (!IS_VERCEL || qn32.size === 0 || qn32.size <= 4_300_000)) {
        return {
          url: qn32.url,
          headers: streamHeaders,
          durationSec: realDuration,
          title: candidate.title,
          hasVideo: true,
        };
      }
    }
  } catch {}
  return null;
}

// ---------- SoundCloud Full-Track Engine ----------

let cachedScClientId: { id: string; expiresAt: number } | null = null;

async function getSoundCloudClientId(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedScClientId && cachedScClientId.expiresAt > Date.now()) {
    return cachedScClientId.id;
  }
  try {
    const res = await fetch('https://soundcloud.com', {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return '';
    const html = await res.text();
    const scripts = [
      ...html.matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g),
    ].map((m) => m[1]);

    for (const scriptUrl of scripts.slice(-5).reverse()) {
      try {
        const jsRes = await fetch(scriptUrl, {
          headers: { 'User-Agent': BROWSER_UA },
          signal: AbortSignal.timeout(4000),
        });
        const jsText = await jsRes.text();
        const match = jsText.match(/client_id:"([a-zA-Z0-9]{32})"/);
        if (match?.[1]) {
          cachedScClientId = {
            id: match[1],
            expiresAt: Date.now() + 6 * 60 * 60 * 1000,
          };
          return match[1];
        }
      } catch {}
    }
  } catch {}
  return '';
}

interface ScTranscodingOption {
  url: string;
  protocol: string;
  mimeType: string;
}

interface ScCandidate {
  id: number;
  title: string;
  author: string;
  durationSec: number;
  transcodings: ScTranscodingOption[];
  score: number;
}

async function searchSoundCloudCandidates(
  title: string,
  artist: string,
  expectedDurationSec: number
): Promise<ScCandidate[]> {
  const cleanTitle = cleanSearchTitle(title, artist) || title;
  const keyword = [artist, cleanTitle].filter(Boolean).join(' ').trim();
  if (!keyword) return [];

  let clientId = await getSoundCloudClientId(false);
  if (!clientId) return [];

  const doSearch = async (cid: string, queryText: string) => {
    const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(
      queryText
    )}&client_id=${encodeURIComponent(cid)}&limit=12`;
    return fetch(url, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(5000),
    });
  };

  let res = await doSearch(clientId, keyword);
  if (res.status === 401 || res.status === 403) {
    clientId = await getSoundCloudClientId(true);
    if (!clientId) return [];
    res = await doSearch(clientId, keyword);
  }
  if (!res.ok) return [];

  let data = (await res.json()) as any;
  let items: any[] = Array.isArray(data?.collection) ? data.collection : [];

  if (items.length === 0 && artist && cleanTitle && keyword !== cleanTitle) {
    const fallbackRes = await doSearch(clientId, cleanTitle);
    if (fallbackRes.ok) {
      data = (await fallbackRes.json()) as any;
      items = Array.isArray(data?.collection) ? data.collection : [];
    }
  }

  const results: ScCandidate[] = [];

  for (const t of items) {
    if (!t || t.policy === 'BLOCK') continue;
    const durSec = Math.round((Number(t.duration) || 0) / 1000);
    // Reject 30s Go+ previews / truncated entries strictly
    if (durSec > 0 && durSec < 45) continue;

    const transcodings: any[] = Array.isArray(t.media?.transcodings) ? t.media.transcodings : [];
    const usable = transcodings
      .filter((tr) => tr?.url && !tr.snipped && tr.format?.protocol !== 'encrypted-hls')
      .sort((a, b) => {
        const aProg = a.format?.protocol === 'progressive' ? 0 : 1;
        const bProg = b.format?.protocol === 'progressive' ? 0 : 1;
        return aProg - bProg;
      })
      .map((tr) => ({
        url: String(tr.url),
        protocol: String(tr.format?.protocol || 'hls'),
        mimeType: String(tr.format?.mime_type || ''),
      }));
    if (usable.length === 0) continue;

    const candTitle = String(t.title || '');
    const candAuthor = String(t.user?.username || '');
    const score = scoreCandidateTrack({
      candidateTitle: candTitle,
      candidateAuthor: candAuthor,
      durationSec: durSec,
      playCount: Number(t.playback_count) || 0,
      targetTitle: title,
      targetArtist: artist,
      expectedDurationSec,
    });

    if (score >= MIN_CANDIDATE_SCORE) {
      results.push({
        id: t.id,
        title: candTitle,
        author: candAuthor,
        durationSec: durSec,
        transcodings: usable,
        score,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

async function resolveSoundCloudStreamForCandidate(
  cand: ScCandidate,
  preferProgressiveOnly = false
): Promise<{
  url: string;
  protocol: string;
  durationSec: number;
  title: string;
} | null> {
  const clientId = await getSoundCloudClientId(false);
  if (!clientId) return null;

  const list = preferProgressiveOnly
    ? cand.transcodings.filter((t) => t.protocol === 'progressive')
    : cand.transcodings;
  const ordered = list.length > 0 ? list : cand.transcodings;

  for (const tr of ordered) {
    try {
      const sep = tr.url.includes('?') ? '&' : '?';
      const res = await fetch(`${tr.url}${sep}client_id=${encodeURIComponent(clientId)}`, {
        headers: { 'User-Agent': BROWSER_UA },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as any;
      if (typeof data?.url === 'string' && data.url) {
        return {
          url: data.url,
          protocol: tr.protocol,
          durationSec: cand.durationSec,
          title: cand.title,
        };
      }
    } catch {}
  }
  return null;
}

// ---------- SSRF-Safe Multi-Site External URL Resolver (Bilibili / Niconico / Dailymotion / SoundCloud / Vimeo / Cobalt / OG) ----------

interface ResolvedExternalPage {
  siteId: FreemakeDownloadSiteId;
  siteName: string;
  pageUrl: string;
  title: string;
  artist: string;
  album?: string;
  thumbnailUrl?: string;
  durationSec: number;
  directStreamUrl?: string;
  directProtocol?: 'direct' | 'hls';
  directHeaders?: Record<string, string>;
  directHasVideo?: boolean;
  directQualityLabel?: string;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const cp = parseInt(hex, 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : '';
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const cp = parseInt(dec, 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : '';
    })
    .trim();
}

function extractXmlTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m?.[1] ? decodeHtmlEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')) : '';
}

function extractHtmlMetaContent(html: string, names: string[]): string {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const r1 = html.match(
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i')
    );
    if (r1?.[1]) return decodeHtmlEntities(r1[1]);
    const r2 = html.match(
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i')
    );
    if (r2?.[1]) return decodeHtmlEntities(r2[1]);
  }
  return '';
}

async function fetchSafePublicWithRedirects(
  rawUrl: string,
  opts?: { headers?: Record<string, string>; timeoutMs?: number; maxBytes?: number }
): Promise<{ finalUrl: string; contentType: string; text: string } | null> {
  let current = rawUrl;
  const timeoutMs = opts?.timeoutMs ?? 4800;
  const maxBytes = opts?.maxBytes ?? 196 * 1024;
  for (let hop = 0; hop <= 3; hop++) {
    const safeUrl = await assertSafePublicHttpUrl(current);
    const resp = await fetch(safeUrl.toString(), {
      headers: { 'User-Agent': BROWSER_UA, ...(opts?.headers || {}) },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get('location');
      if (!loc || hop === 3) return null;
      current = new URL(loc, safeUrl).toString();
      continue;
    }
    if (!resp.ok) return null;
    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    const reader = resp.body?.getReader();
    if (!reader) {
      const txt = (await resp.text()).slice(0, maxBytes);
      return { finalUrl: safeUrl.toString(), contentType: ct, text: txt };
    }
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      while (total < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          const take = value.subarray(0, Math.max(0, maxBytes - total));
          chunks.push(Buffer.from(take));
          total += take.byteLength;
          if (total >= maxBytes) break;
        }
      }
      await reader.cancel().catch(() => {});
    } catch {}
    return {
      finalUrl: safeUrl.toString(),
      contentType: ct,
      text: Buffer.concat(chunks).toString('utf8'),
    };
  }
  return null;
}

async function resolveCobaltUniversalUrl(
  targetUrl: string,
  wantsVideo: boolean,
  maxVideoHeight: number,
  cobaltApiUrl?: string
): Promise<{ url: string; label: string } | null> {
  const endpointRaw = (cobaltApiUrl || process.env.COBALT_API_URL || '').trim();
  if (!endpointRaw) return null;
  try {
    await assertSafePublicHttpUrl(targetUrl);
    const endpoint = endpointRaw.replace(/\/+$/, '');
    const videoQuality =
      maxVideoHeight >= 2160
        ? '2160'
        : maxVideoHeight >= 1080
        ? '1080'
        : maxVideoHeight >= 720
        ? '720'
        : maxVideoHeight >= 480
        ? '480'
        : maxVideoHeight >= 360
        ? '360'
        : '1080';
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: targetUrl,
        downloadMode: wantsVideo ? 'auto' : 'audio',
        audioFormat: 'best',
        videoQuality,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const data = (await r.json()) as any;
    const outUrl =
      typeof data?.url === 'string'
        ? data.url
        : Array.isArray(data?.picker)
        ? data.picker.find((p: any) => typeof p?.url === 'string')?.url
        : '';
    if (outUrl) {
      await assertSafePublicHttpUrl(outUrl);
      const probe = await probeRemoteStream(outUrl, { 'User-Agent': BROWSER_UA });
      if (probe.ok) {
        return { url: outUrl, label: 'Cobalt ダイレクト抽出' };
      }
    }
  } catch {}
  return null;
}

async function resolveExternalPageUrl(
  rawUrl: string,
  wantsVideo: boolean,
  maxVideoHeight: number,
  opts?: {
    cobaltApiUrl?: string;
    enabledSiteSet?: Set<string> | null;
    resolveStreams?: boolean;
  }
): Promise<ResolvedExternalPage | null> {
  const safeParsed = await assertSafePublicHttpUrl(rawUrl);
  let targetUrl = safeParsed.toString();
  let host = safeParsed.hostname.toLowerCase();
  const resolveStreams = opts?.resolveStreams !== false;
  const allowSite = (id: FreemakeDownloadSiteId) =>
    !opts?.enabledSiteSet || opts.enabledSiteSet.has(id);

  // Follow b23.tv / nico.ms / dai.ly short links safely (SSRF-checked per hop)
  if (host === 'b23.tv' || host === 'nico.ms' || host === 'dai.ly') {
    let cur = targetUrl;
    for (let hop = 0; hop < 3; hop++) {
      try {
        const uCheck = await assertSafePublicHttpUrl(cur);
        const r = await fetch(uCheck.toString(), {
          method: 'GET',
          headers: { 'User-Agent': BROWSER_UA },
          redirect: 'manual',
          signal: AbortSignal.timeout(4000),
        });
        if (r.status >= 300 && r.status < 400) {
          const loc = r.headers.get('location');
          if (!loc) break;
          cur = new URL(loc, uCheck).toString();
        } else {
          break;
        }
      } catch {
        break;
      }
    }
    const resolvedParsed = await assertSafePublicHttpUrl(cur);
    targetUrl = resolvedParsed.toString();
    host = resolvedParsed.hostname.toLowerCase();
  }

  // 1. Bilibili URL (BV... / av...)
  if (host.includes('bilibili.com') && allowSite('bilibili-full')) {
    const bvMatch = targetUrl.match(/\/video\/(BV[a-zA-Z0-9]+)/i);
    const avMatch = targetUrl.match(/\/video\/av(\d+)/i);
    const paramQuery = bvMatch?.[1]
      ? `bvid=${encodeURIComponent(bvMatch[1])}`
      : avMatch?.[1]
      ? `aid=${encodeURIComponent(avMatch[1])}`
      : '';
    if (paramQuery) {
      try {
        const buvid3 = await getBilibiliCookie();
        const viewRes = await fetch(`https://api.bilibili.com/x/web-interface/view?${paramQuery}`, {
          headers: {
            'User-Agent': BROWSER_UA,
            Referer: 'https://www.bilibili.com/',
            ...(buvid3 ? { Cookie: `buvid3=${buvid3}` } : {}),
          },
          signal: AbortSignal.timeout(5000),
        });
        if (viewRes.ok) {
          const viewJson = (await viewRes.json()) as any;
          const d = viewJson?.data;
          if (d?.bvid && d?.cid) {
            const pageTitle = String(d.title || '').trim();
            const author = String(d.owner?.name || 'Bilibili').trim();
            const thumb = typeof d.pic === 'string' ? d.pic.replace(/^http:\/\//i, 'https://') : undefined;
            const durSec = Number(d.duration) || 0;
            let directStreamUrl: string | undefined;
            let directHeaders: Record<string, string> | undefined;
            let directHasVideo = wantsVideo;
            if (resolveStreams) {
              const stream = await resolveBilibiliStreamForCandidate(
                {
                  bvid: d.bvid,
                  cid: Number(d.cid),
                  title: pageTitle,
                  author,
                  durationSec: durSec,
                  playCount: Number(d.stat?.view) || 0,
                  score: 100,
                },
                wantsVideo,
                maxVideoHeight
              );
              if (stream) {
                directStreamUrl = stream.url;
                directHeaders = stream.headers;
                directHasVideo = stream.hasVideo;
              }
            }
            return {
              siteId: 'bilibili-full',
              siteName: 'Bilibili',
              pageUrl: targetUrl,
              title: pageTitle,
              artist: author,
              album: 'Bilibili URL取得',
              thumbnailUrl: thumb,
              durationSec: durSec,
              directStreamUrl,
              directProtocol: directStreamUrl ? 'direct' : undefined,
              directHeaders,
              directHasVideo,
            };
          }
        }
      } catch {}
    }
  }

  // 2. Niconico URL (nicovideo.jp/watch/sm... or nm... or so...)
  if ((host.includes('nicovideo.jp') || host === 'nico.ms') && allowSite('niconico-full')) {
    const idMatch = targetUrl.match(/\/(?:watch\/)?((?:sm|nm|so)\d+)/i);
    if (idMatch?.[1]) {
      const nicoId = idMatch[1];
      let title = '';
      let artist = 'ニコニコ動画';
      let thumbnailUrl: string | undefined;
      let durationSec = 0;

      try {
        const xmlRes = await fetch(`https://ext.nicovideo.jp/api/getthumbinfo/${encodeURIComponent(nicoId)}`, {
          headers: { 'User-Agent': BROWSER_UA },
          signal: AbortSignal.timeout(4800),
        });
        if (xmlRes.ok) {
          const xml = await xmlRes.text();
          title = extractXmlTag(xml, 'title');
          artist = extractXmlTag(xml, 'user_nickname') || extractXmlTag(xml, 'ch_name') || artist;
          const rawThumb = extractXmlTag(xml, 'thumbnail_url');
          if (rawThumb) thumbnailUrl = rawThumb.replace(/^http:\/\//i, 'https://');
          const lenStr = extractXmlTag(xml, 'length');
          if (lenStr) durationSec = parseDurationTextToSec(lenStr);
        }
      } catch {}

      let directStreamUrl: string | undefined;
      if (resolveStreams && allowSite('cobalt')) {
        const cb = await resolveCobaltUniversalUrl(targetUrl, wantsVideo, maxVideoHeight, opts?.cobaltApiUrl);
        if (cb) directStreamUrl = cb.url;
      }

      if (title) {
        return {
          siteId: 'niconico-full',
          siteName: 'ニコニコ動画',
          pageUrl: targetUrl,
          title,
          artist,
          album: 'ニコニコ動画 URL取得',
          thumbnailUrl,
          durationSec,
          directStreamUrl,
          directProtocol: directStreamUrl ? 'direct' : undefined,
          directHasVideo: wantsVideo,
        };
      }
    }
  }

  // 3. Dailymotion URL (dailymotion.com/video/x...)
  if (host.includes('dailymotion.com') && allowSite('dailymotion-full')) {
    const dmMatch = targetUrl.match(/\/video\/([a-zA-Z0-9]+)/i);
    if (dmMatch?.[1]) {
      const dmId = dmMatch[1];
      try {
        const metaRes = await fetch(
          `https://www.dailymotion.com/player/metadata/video/${encodeURIComponent(dmId)}`,
          {
            headers: { 'User-Agent': BROWSER_UA },
            signal: AbortSignal.timeout(5000),
          }
        );
        if (metaRes.ok) {
          const data = (await metaRes.json()) as any;
          const title = String(data?.title || '').trim();
          const artist = String(data?.owner?.screenname || data?.owner?.username || 'Dailymotion').trim();
          const durSec = Number(data?.duration) || 0;
          const thumb =
            data?.posters?.['720'] || data?.posters?.['480'] || data?.posters?.['360'] || undefined;

          let directStreamUrl: string | undefined;
          let directProtocol: 'direct' | 'hls' | undefined;
          if (resolveStreams && data?.qualities && typeof data.qualities === 'object') {
            const qKeys = Object.keys(data.qualities)
              .map((k) => ({ key: k, num: k === 'auto' ? 0 : parseInt(k, 10) || 0 }))
              .sort((a, b) => {
                if (maxVideoHeight > 0) {
                  const aOk = a.num > 0 && a.num <= maxVideoHeight ? 0 : 1;
                  const bOk = b.num > 0 && b.num <= maxVideoHeight ? 0 : 1;
                  if (aOk !== bOk) return aOk - bOk;
                  if (aOk === 0) return b.num - a.num;
                }
                return b.num - a.num;
              });

            const candidates: Array<{ url: string; protocol: 'direct' | 'hls' }> = [];
            for (const qk of qKeys) {
              const list: any[] = Array.isArray(data.qualities[qk.key]) ? data.qualities[qk.key] : [];
              for (const item of list) {
                if (typeof item?.url === 'string' && item.url.startsWith('http')) {
                  const isMp4 = String(item.type || '').includes('mp4') || item.url.includes('.mp4');
                  candidates.push({ url: item.url, protocol: isMp4 ? 'direct' : 'hls' });
                }
              }
            }
            // Prefer direct MP4 if available, otherwise HLS
            candidates.sort((a, b) => (a.protocol === 'direct' ? 0 : 1) - (b.protocol === 'direct' ? 0 : 1));
            for (const c of candidates.slice(0, 4)) {
              try {
                await assertSafePublicHttpUrl(c.url);
                const probe = await probeRemoteStream(c.url, { 'User-Agent': BROWSER_UA });
                if (probe.ok) {
                  directStreamUrl = c.url;
                  directProtocol = c.protocol;
                  break;
                }
              } catch {}
            }
          }

          if (title) {
            return {
              siteId: 'dailymotion-full',
              siteName: 'Dailymotion',
              pageUrl: targetUrl,
              title,
              artist,
              album: 'Dailymotion URL取得',
              thumbnailUrl: thumb,
              durationSec: durSec,
              directStreamUrl,
              directProtocol,
              directHasVideo: true,
            };
          }
        }
      } catch {}
    }
  }

  // 4. SoundCloud URL (soundcloud.com/artist/track)
  if (host.includes('soundcloud.com') && allowSite('soundcloud-full')) {
    try {
      let clientId = await getSoundCloudClientId(false);
      if (clientId) {
        let res = await fetch(
          `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(targetUrl)}&client_id=${encodeURIComponent(
            clientId
          )}`,
          { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(5000) }
        );
        if (res.status === 401 || res.status === 403) {
          clientId = await getSoundCloudClientId(true);
          if (clientId) {
            res = await fetch(
              `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(targetUrl)}&client_id=${encodeURIComponent(
                clientId
              )}`,
              { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(5000) }
            );
          }
        }
        if (res.ok) {
          const t = (await res.json()) as any;
          if (t?.kind === 'track' && t?.title) {
            const durSec = Math.round((Number(t.duration) || 0) / 1000);
            const thumb =
              typeof t.artwork_url === 'string'
                ? t.artwork_url.replace(/-large\./, '-t500x500.')
                : typeof t.user?.avatar_url === 'string'
                ? t.user.avatar_url
                : undefined;
            const transcodings: any[] = Array.isArray(t.media?.transcodings) ? t.media.transcodings : [];
            const usable = transcodings
              .filter((tr) => tr?.url && !tr.snipped && tr.format?.protocol !== 'encrypted-hls')
              .sort((a, b) =>
                (a.format?.protocol === 'progressive' ? 0 : 1) -
                (b.format?.protocol === 'progressive' ? 0 : 1)
              );
            let directStreamUrl: string | undefined;
            let directProtocol: 'direct' | 'hls' | undefined;
            if (resolveStreams && usable.length > 0) {
              const cand: ScCandidate = {
                id: t.id,
                title: String(t.title),
                author: String(t.user?.username || ''),
                durationSec: durSec,
                transcodings: usable.map((tr) => ({
                  url: String(tr.url),
                  protocol: String(tr.format?.protocol || 'hls'),
                  mimeType: String(tr.format?.mime_type || ''),
                })),
                score: 100,
              };
              const scStream = await resolveSoundCloudStreamForCandidate(cand, IS_VERCEL);
              if (scStream) {
                directStreamUrl = scStream.url;
                directProtocol = scStream.protocol === 'progressive' ? 'direct' : 'hls';
              }
            }
            return {
              siteId: 'soundcloud-full',
              siteName: 'SoundCloud',
              pageUrl: targetUrl,
              title: String(t.title),
              artist: String(t.user?.username || 'SoundCloud'),
              album: 'SoundCloud URL取得',
              thumbnailUrl: thumb,
              durationSec: durSec,
              directStreamUrl,
              directProtocol,
              directHasVideo: false,
            };
          }
        }
      }
    } catch {}
  }

  // 5. Vimeo URL (vimeo.com/123456)
  if (host.includes('vimeo.com') && allowSite('vimeo-full')) {
    const vmMatch = targetUrl.match(/vimeo\.com\/(?:video\/|channels\/[^/]+\/|)(\d{5,12})/);
    if (vmMatch?.[1]) {
      const vmId = vmMatch[1];
      let title = '';
      let artist = 'Vimeo';
      let thumbnailUrl: string | undefined;
      let durationSec = 0;
      let directStreamUrl: string | undefined;

      try {
        const oeRes = await fetch(
          `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${vmId}`)}`,
          { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(4500) }
        );
        if (oeRes.ok) {
          const oe = (await oeRes.json()) as any;
          title = String(oe?.title || '').trim();
          artist = String(oe?.author_name || artist).trim();
          thumbnailUrl = oe?.thumbnail_url || undefined;
          durationSec = Number(oe?.duration) || 0;
        }
      } catch {}

      if (resolveStreams) {
        try {
          const cfgRes = await fetch(`https://player.vimeo.com/video/${vmId}/config`, {
            headers: { 'User-Agent': BROWSER_UA, Referer: 'https://vimeo.com/' },
            signal: AbortSignal.timeout(4800),
          });
          if (cfgRes.ok) {
            const cfg = (await cfgRes.json()) as any;
            if (!title && cfg?.video?.title) title = String(cfg.video.title).trim();
            if (!durationSec && cfg?.video?.duration) durationSec = Number(cfg.video.duration) || 0;
            const prog: any[] = Array.isArray(cfg?.request?.files?.progressive)
              ? cfg.request.files.progressive
              : [];
            const sortedProg = [...prog]
              .filter((p) => typeof p?.url === 'string' && p.url.startsWith('http'))
              .sort((a, b) => {
                const ha = Number(a.height) || 0;
                const hb = Number(b.height) || 0;
                if (maxVideoHeight > 0) {
                  const aOk = ha > 0 && ha <= maxVideoHeight ? 0 : 1;
                  const bOk = hb > 0 && hb <= maxVideoHeight ? 0 : 1;
                  if (aOk !== bOk) return aOk - bOk;
                  if (aOk === 0) return hb - ha;
                }
                return hb - ha;
              });
            if (sortedProg[0]?.url) {
              await assertSafePublicHttpUrl(sortedProg[0].url);
              const probe = await probeRemoteStream(sortedProg[0].url, { 'User-Agent': BROWSER_UA });
              if (probe.ok) {
                directStreamUrl = sortedProg[0].url;
              }
            }
          }
        } catch {}

        if (!directStreamUrl && allowSite('cobalt')) {
          const cb = await resolveCobaltUniversalUrl(targetUrl, wantsVideo, maxVideoHeight, opts?.cobaltApiUrl);
          if (cb) directStreamUrl = cb.url;
        }
      }

      if (title || directStreamUrl) {
        return {
          siteId: 'vimeo-full',
          siteName: 'Vimeo',
          pageUrl: targetUrl,
          title: title || `Vimeo ${vmId}`,
          artist,
          album: 'Vimeo URL取得',
          thumbnailUrl,
          durationSec,
          directStreamUrl,
          directProtocol: directStreamUrl ? 'direct' : undefined,
          directHasVideo: true,
        };
      }
    }
  }

  // 6. Universal Public HTTP(S) URL: Try Cobalt first, then inspect OpenGraph metadata safely
  let cobaltDirectUrl: string | undefined;
  if (resolveStreams && allowSite('cobalt')) {
    const cb = await resolveCobaltUniversalUrl(targetUrl, wantsVideo, maxVideoHeight, opts?.cobaltApiUrl);
    if (cb) cobaltDirectUrl = cb.url;
  }

  // If URL points directly to a media file (.mp4 / .mp3 / .m4a / .webm / .m3u8)
  if (/\.(mp4|mp3|m4a|webm|mkv|avi|ogg|flac|wav|m3u8)(\?.*)?$/i.test(targetUrl)) {
    const isHls = /\.m3u8(\?.*)?$/i.test(targetUrl);
    const baseName = decodeURIComponent(safeParsed.pathname.split('/').pop() || 'Media')
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim();
    return {
      siteId: 'cobalt',
      siteName: host,
      pageUrl: targetUrl,
      title: baseName || host,
      artist: host,
      album: `${host} 直接URL`,
      durationSec: 0,
      directStreamUrl: cobaltDirectUrl || targetUrl,
      directProtocol: cobaltDirectUrl ? 'direct' : isHls ? 'hls' : 'direct',
      directHasVideo: /\.(mp4|webm|mkv|avi|m3u8)/i.test(targetUrl),
    };
  }

  const page = await fetchSafePublicWithRedirects(targetUrl).catch(() => null);
  if (page && page.contentType.includes('html')) {
    const html = page.text;
    const ogTitle =
      extractHtmlMetaContent(html, ['og:title', 'twitter:title']) ||
      decodeHtmlEntities(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '');
    const ogImage = extractHtmlMetaContent(html, ['og:image', 'twitter:image', 'thumbnail']);
    const ogSite = extractHtmlMetaContent(html, ['og:site_name']) || host;
    const ogVideo = extractHtmlMetaContent(html, [
      'og:video:secure_url',
      'og:video:url',
      'og:video',
      'twitter:player:stream',
    ]);

    let directMediaUrl: string | undefined = cobaltDirectUrl;
    let directProtocol: 'direct' | 'hls' | undefined = cobaltDirectUrl ? 'direct' : undefined;
    if (!directMediaUrl && ogVideo && /^https?:\/\//i.test(ogVideo)) {
      if (/\.(mp4|webm|m4a|mp3|m3u8)(\?.*)?$/i.test(ogVideo)) {
        try {
          await assertSafePublicHttpUrl(ogVideo);
          const probe = await probeRemoteStream(ogVideo, { 'User-Agent': BROWSER_UA });
          if (probe.ok) {
            directMediaUrl = ogVideo;
            directProtocol = /\.m3u8/i.test(ogVideo) ? 'hls' : 'direct';
          }
        } catch {}
      }
    }

    if (ogTitle || directMediaUrl) {
      let safeThumb = ogImage;
      if (safeThumb && !safeThumb.startsWith('http')) {
        try {
          safeThumb = new URL(safeThumb, page.finalUrl).toString();
        } catch {
          safeThumb = '';
        }
      }
      return {
        siteId: cobaltDirectUrl ? 'cobalt' : 'youtube-direct',
        siteName: ogSite || host,
        pageUrl: page.finalUrl,
        title: (ogTitle || host).replace(/\s*[|｜\-–—]\s*(?:YouTube|ニコニコ動画|Vimeo|Dailymotion|FC2動画).*$/i, '').trim() || host,
        artist: ogSite || host,
        album: `${ogSite || host} URL取得`,
        thumbnailUrl: safeThumb || undefined,
        durationSec: 0,
        directStreamUrl: directMediaUrl,
        directProtocol,
        directHasVideo: true,
      };
    }
  } else if (cobaltDirectUrl) {
    return {
      siteId: 'cobalt',
      siteName: host,
      pageUrl: targetUrl,
      title: host,
      artist: host,
      album: `${host} Cobalt抽出`,
      durationSec: 0,
      directStreamUrl: cobaltDirectUrl,
      directProtocol: 'direct',
      directHasVideo: wantsVideo,
    };
  }

  return null;
}

// ---------- YouTube Direct / Cobalt / Alternate Resolver ----------

function sortFormatsByTargetHeight(formatsList: any[], maxVideoHeight = 0): any[] {
  return [...formatsList].sort((a: any, b: any) => {
    const ha = Number(a?.height) || parseInt(String(a?.qualityLabel || ''), 10) || 0;
    const hb = Number(b?.height) || parseInt(String(b?.qualityLabel || ''), 10) || 0;
    if (maxVideoHeight > 0) {
      const aFits = ha > 0 && ha <= maxVideoHeight ? 0 : 1;
      const bFits = hb > 0 && hb <= maxVideoHeight ? 0 : 1;
      if (aFits !== bFits) return aFits - bFits;
      if (aFits === 0 && ha !== hb) return hb - ha;
      if (ha !== hb) return ha - hb;
    } else if (ha !== hb) {
      return hb - ha;
    }
    return (Number(b?.bitrate) || 0) - (Number(a?.bitrate) || 0);
  });
}

async function resolveYouTubeDirectStream(
  videoId: string,
  wantsVideo: boolean,
  getInnertube: () => Promise<Innertube>,
  opts?: {
    youtubeCookie?: string;
    poToken?: string;
    cobaltApiUrl?: string;
    enabledSiteSet?: Set<string> | null;
    maxVideoHeight?: number;
    allowMuxedAdaptive?: boolean;
  }
): Promise<
  | {
      url: string;
      secondaryAudioUrl?: string;
      headers?: Record<string, string>;
      sourceKind: 'youtube-direct' | 'cobalt' | 'piped' | 'invidious';
      sourceLabel: string;
      durationSec?: number;
    }
  | { error: string }
> {
  const allowSite = (id: FreemakeDownloadSiteId) =>
    !opts?.enabledSiteSet || opts.enabledSiteSet.has(id);
  const cookie = (opts?.youtubeCookie || process.env.YOUTUBE_COOKIE || '').trim();
  const poToken = (opts?.poToken || process.env.YOUTUBE_PO_TOKEN || '').trim();
  const cobaltUrl = (opts?.cobaltApiUrl || process.env.COBALT_API_URL || '').trim();
  const maxVideoHeight = opts?.maxVideoHeight || 0;
  const allowMuxedAdaptive = Boolean(opts?.allowMuxedAdaptive) && !IS_VERCEL;

  if (cobaltUrl && allowSite('cobalt')) {
    try {
      const endpoint = cobaltUrl.replace(/\/+$/, '');
      const cobaltQuality =
        maxVideoHeight >= 2160
          ? '2160'
          : maxVideoHeight >= 1080
          ? '1080'
          : maxVideoHeight >= 720
          ? '720'
          : maxVideoHeight >= 480
          ? '480'
          : maxVideoHeight >= 360
          ? '360'
          : '1080';
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: `https://www.youtube.com/watch?v=${videoId}`,
          downloadMode: wantsVideo ? 'auto' : 'audio',
          audioFormat: 'best',
          videoQuality: cobaltQuality,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) {
        const data = (await r.json()) as any;
        if (data?.url && typeof data.url === 'string') {
          const probe = await probeRemoteStream(data.url, { 'User-Agent': BROWSER_UA });
          if (probe.ok) {
            return {
              url: data.url,
              sourceKind: 'cobalt',
              sourceLabel: 'Cobalt YouTube フルストリーム',
            };
          }
        }
      }
    } catch {}
  }

  const pickBestFormats = (formatsList: any[], isCombinedFallback = false): any[] => {
    if (wantsVideo) {
      const mp4s = formatsList.filter(
        (f: any) => typeof f?.url === 'string' && f.mimeType?.startsWith('video/mp4')
      );
      return sortFormatsByTargetHeight(mp4s, maxVideoHeight);
    }
    const audioOnly = formatsList
      .filter((f: any) => typeof f?.url === 'string' && f.mimeType?.startsWith('audio/'))
      .sort((a: any, b: any) => {
        if (IS_VERCEL) {
          const aLen = Number(a.contentLength) || 0;
          const bLen = Number(b.contentLength) || 0;
          const aFits = aLen > 0 && aLen <= 4_200_000 ? 0 : 1;
          const bFits = bLen > 0 && bLen <= 4_200_000 ? 0 : 1;
          if (aFits !== bFits) return aFits - bFits;
          return (a.bitrate || 0) - (b.bitrate || 0);
        }
        const aM4a = String(a.mimeType || '').includes('mp4') ? 0 : 1;
        const bM4a = String(b.mimeType || '').includes('mp4') ? 0 : 1;
        if (aM4a !== bM4a) return aM4a - bM4a;
        return (b.bitrate || 0) - (a.bitrate || 0);
      });
    if (audioOnly.length > 0 || !isCombinedFallback) return audioOnly;
    return formatsList.filter((f: any) => typeof f?.url === 'string');
  };

  const clients: Array<{
    name: string;
    client: Record<string, any>;
    ua: string;
    thirdParty?: Record<string, any>;
  }> = [
    {
      name: 'ANDROID_VR',
      client: {
        clientName: 'ANDROID_VR',
        clientVersion: '1.60.19',
        deviceMake: 'Oculus',
        deviceModel: 'Quest 3',
        androidSdkVersion: 32,
        osName: 'Android',
        osVersion: '12L',
        hl: 'ja',
        gl: 'JP',
      },
      ua: 'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    },
    {
      name: 'IOS',
      client: {
        clientName: 'IOS',
        clientVersion: '19.45.4',
        deviceMake: 'Apple',
        deviceModel: 'iPhone16,2',
        osName: 'iPhone',
        osVersion: '18.1.0.22B83',
        hl: 'ja',
        gl: 'JP',
      },
      ua: 'com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 18_1_0 like Mac OS X;)',
    },
    {
      name: 'ANDROID',
      client: {
        clientName: 'ANDROID',
        clientVersion: '19.44.38',
        androidSdkVersion: 34,
        osName: 'Android',
        osVersion: '14',
        hl: 'ja',
        gl: 'JP',
      },
      ua: 'com.google.android.youtube/19.44.38 (Linux; U; Android 14) gzip',
    },
    {
      name: 'TV_EMBEDDED',
      client: {
        clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER',
        clientVersion: '2.0',
        hl: 'ja',
        gl: 'JP',
      },
      thirdParty: { embedUrl: `https://www.youtube.com/watch?v=${videoId}` },
      ua: BROWSER_UA,
    },
    {
      name: 'WEB',
      client: {
        clientName: 'WEB',
        clientVersion: '2.20250101.00.00',
        hl: 'ja',
        gl: 'JP',
      },
      ua: BROWSER_UA,
    },
  ];

  let lastReason = '';
  if (allowSite('youtube-direct')) {
    for (const c of clients) {
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'User-Agent': c.ua,
        };
        if (cookie) headers.Cookie = cookie;

        const body: Record<string, any> = {
          context: {
            client: c.client,
            ...(c.thirdParty ? { thirdParty: c.thirdParty } : {}),
          },
          videoId,
          contentCheckOk: true,
          racyCheckOk: true,
        };
        if (poToken) {
          body.serviceIntegrityDimensions = { poToken };
        }

        const resp = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(5000),
        });
        if (!resp.ok) continue;
        const json = (await resp.json()) as any;
        if (json?.playabilityStatus?.reason) {
          lastReason = String(json.playabilityStatus.reason);
        }

        const declaredDur = Number(json?.videoDetails?.lengthSeconds) || 0;
        const adaptive = Array.isArray(json?.streamingData?.adaptiveFormats)
          ? json.streamingData.adaptiveFormats
          : [];
        const combined = Array.isArray(json?.streamingData?.formats)
          ? json.streamingData.formats
          : [];

        const streamHeaders: Record<string, string> = cookie
          ? { Cookie: cookie, 'User-Agent': c.ua }
          : { 'User-Agent': c.ua };

        // High-resolution HD/4K dual-stream muxing (video-only MP4/WebM + adaptive audio) when FFmpeg is present
        if (wantsVideo && allowMuxedAdaptive && (maxVideoHeight === 0 || maxVideoHeight >= 1080)) {
          const adaptiveVideo = sortFormatsByTargetHeight(
            adaptive.filter(
              (f: any) =>
                typeof f?.url === 'string' &&
                (f.mimeType?.startsWith('video/mp4') || f.mimeType?.startsWith('video/webm')) &&
                (Number(f.height) || 0) >= 1080
            ),
            maxVideoHeight
          );
          const adaptiveAudio = adaptive
            .filter((f: any) => typeof f?.url === 'string' && f.mimeType?.startsWith('audio/'))
            .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

          if (adaptiveVideo[0]?.url && adaptiveAudio[0]?.url) {
            const [vProbe, aProbe] = await Promise.all([
              probeRemoteStream(adaptiveVideo[0].url, streamHeaders),
              probeRemoteStream(adaptiveAudio[0].url, streamHeaders),
            ]);
            if (vProbe.ok && aProbe.ok) {
              const hLabel = adaptiveVideo[0].height ? ` ${adaptiveVideo[0].height}p` : ' HD';
              return {
                url: adaptiveVideo[0].url,
                secondaryAudioUrl: adaptiveAudio[0].url,
                headers: streamHeaders,
                sourceKind: 'youtube-direct',
                sourceLabel: `YouTube 直接${hLabel} (${c.name})`,
                durationSec: declaredDur || undefined,
              };
            }
          }
        }

        const candidates = wantsVideo
          ? pickBestFormats(combined, true)
          : [
              ...pickBestFormats(adaptive, false),
              ...pickBestFormats(combined, true),
            ];

        for (const picked of candidates.slice(0, 3)) {
          if (!picked?.url) continue;
          const probe = await probeRemoteStream(picked.url, streamHeaders);
          if (probe.ok) {
            if (IS_VERCEL && !wantsVideo && probe.totalSize > 4_350_000) continue;
            return {
              url: picked.url,
              headers: streamHeaders,
              sourceKind: 'youtube-direct',
              sourceLabel: `YouTube 直接フルストリーム (${c.name})`,
              durationSec: declaredDur || undefined,
            };
          }
        }
      } catch (e: any) {
        lastReason = e?.message || lastReason;
      }
    }

    // Try youtubei.js built-in deciphering across multiple InnerTube clients (even without cookies!)
    const innertubeClients = ['IOS', 'ANDROID', 'TV_EMBEDDED', 'WEB_EMBEDDED', 'WEB'] as const;
    try {
      const yt = await getInnertube();
      for (const clientKey of innertubeClients) {
        try {
          const info = await yt.getBasicInfo(videoId, { client: clientKey });
          const declaredDur = Number((info as any)?.basic_info?.duration) || 0;
          const adaptive = info?.streaming_data?.adaptive_formats || [];
          const formats = info?.streaming_data?.formats || [];

          if (wantsVideo && allowMuxedAdaptive && (maxVideoHeight === 0 || maxVideoHeight >= 1080)) {
            const hdVid = sortFormatsByTargetHeight(
              adaptive.filter((f: any) => f.mime_type?.includes('mp4') && (Number(f.height) || 0) >= 1080),
              maxVideoHeight
            );
            const hdAud = adaptive
              .filter((f: any) => f.mime_type?.startsWith('audio/'))
              .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
            if (hdVid[0] && hdAud[0]) {
              const vUrl = hdVid[0].url || (await hdVid[0].decipher(yt.session.player));
              const aUrl = hdAud[0].url || (await hdAud[0].decipher(yt.session.player));
              if (vUrl && aUrl) {
                const [vProbe, aProbe] = await Promise.all([
                  probeRemoteStream(vUrl, { 'User-Agent': BROWSER_UA }),
                  probeRemoteStream(aUrl, { 'User-Agent': BROWSER_UA }),
                ]);
                if (vProbe.ok && aProbe.ok) {
                  const hLabel = hdVid[0].height ? ` ${hdVid[0].height}p` : ' HD';
                  return {
                    url: vUrl,
                    secondaryAudioUrl: aUrl,
                    sourceKind: 'youtube-direct',
                    sourceLabel: `YouTube InnerTube${hLabel} (${clientKey})`,
                    durationSec: declaredDur || undefined,
                  };
                }
              }
            }
          }

          const rawList = wantsVideo
            ? formats.filter((f: any) => f.mime_type?.includes('mp4'))
            : [...adaptive.filter((f: any) => f.mime_type?.startsWith('audio/')), ...formats];

          const sorted = wantsVideo
            ? sortFormatsByTargetHeight(rawList, maxVideoHeight)
            : rawList.sort((a: any, b: any) =>
                IS_VERCEL
                  ? (a.bitrate || 0) - (b.bitrate || 0)
                  : (b.bitrate || 0) - (a.bitrate || 0)
              );

          for (const fmt of sorted.slice(0, 3)) {
            try {
              const deciphered = fmt.url || (await fmt.decipher(yt.session.player));
              if (!deciphered) continue;
              const probe = await probeRemoteStream(deciphered, { 'User-Agent': BROWSER_UA });
              if (probe.ok) {
                if (IS_VERCEL && !wantsVideo && probe.totalSize > 4_350_000) continue;
                return {
                  url: deciphered,
                  sourceKind: 'youtube-direct',
                  sourceLabel: `YouTube InnerTube フルストリーム (${clientKey})`,
                  durationSec: declaredDur || undefined,
                };
              }
            } catch {}
          }
        } catch {}
      }
    } catch {}
  }

  if (allowSite('piped')) {
    const piped = await resolveViaPipedPool(videoId, wantsVideo, probeRemoteStream, IS_VERCEL, maxVideoHeight);
    if (piped) return piped;
  }

  if (allowSite('invidious')) {
    const inv = await resolveViaInvidiousPool(videoId, wantsVideo, probeRemoteStream, IS_VERCEL, maxVideoHeight);
    if (inv) return inv;
  }

  return {
    error: lastReason || 'YouTube直接ストリームが制限されています',
  };
}

async function searchYouTubeAlternateVideoIds(
  title: string,
  artist: string,
  excludeVideoId: string | null,
  expectedDurationSec: number,
  getInnertube: () => Promise<Innertube>
): Promise<Array<{ videoId: string; title: string; durationSec: number }>> {
  const cleanTitle = cleanSearchTitle(title, artist) || title;
  if (!cleanTitle) return [];

  const results: Array<{ videoId: string; title: string; durationSec: number; score: number }> = [];
  const seen = new Set<string>();
  if (excludeVideoId) seen.add(excludeVideoId);

  try {
    const yt = await getInnertube();
    const queries = [
      `${cleanTitle} ${artist} official audio`.trim(),
      `${cleanTitle} ${artist}`.trim(),
    ];

    for (const q of queries) {
      try {
        const musicRes: any = await yt.music.search(q, { type: 'song' });
        const shelves = Array.isArray(musicRes?.results) ? musicRes.results : [];
        for (const shelf of shelves) {
          const items = Array.isArray(shelf?.contents) ? shelf.contents : [];
          for (const item of items) {
            const id = String(item?.id || '').trim();
            if (!id || seen.has(id)) continue;
            seen.add(id);
            const candTitle = String(item?.title?.toString?.() || item?.title || '');
            const candArtist = String(item?.artists?.[0]?.name || item?.author?.name || '');
            const durSec = Number(item?.duration?.seconds) || parseDurationTextToSec(item?.duration?.text);
            const score = scoreCandidateTrack({
              candidateTitle: candTitle,
              candidateAuthor: candArtist,
              durationSec: durSec,
              targetTitle: cleanTitle,
              targetArtist: artist,
              expectedDurationSec,
            });
            if (score >= MIN_CANDIDATE_SCORE) {
              results.push({ videoId: id, title: candTitle, durationSec: durSec, score });
            }
          }
        }
      } catch {}
      if (results.length >= 4) break;
    }

    if (results.length === 0) {
      try {
        const vidRes: any = await yt.search(`${cleanTitle} ${artist} audio`.trim(), { type: 'video' });
        const videos = Array.isArray(vidRes?.videos) ? vidRes.videos : [];
        for (const v of videos.slice(0, 10)) {
          const id = String(v?.id || '').trim();
          if (!id || seen.has(id)) continue;
          seen.add(id);
          const candTitle = String(v?.title?.toString?.() || v?.title || '');
          const candArtist = String(v?.author?.name || '').replace(/\s*-\s*Topic$/i, '').trim();
          const durSec = Number(v?.duration?.seconds) || parseDurationTextToSec(v?.duration?.text);
          const score = scoreCandidateTrack({
            candidateTitle: candTitle,
            candidateAuthor: candArtist,
            durationSec: durSec,
            targetTitle: cleanTitle,
            targetArtist: artist,
            expectedDurationSec,
          });
          if (score >= MIN_CANDIDATE_SCORE) {
            results.push({ videoId: id, title: candTitle, durationSec: durSec, score });
          }
        }
      } catch {}
    }
  } catch {}

  return results.sort((a, b) => b.score - a.score).slice(0, 4);
}

// ---------- FFmpeg Conversion & Download Utilities ----------

export type FreemakeJobStage =
  | 'resolving'
  | 'searching'
  | 'fetching'
  | 'converting'
  | 'ready'
  | 'error';

export interface FreemakeJobProgress {
  jobId: string;
  stage: FreemakeJobStage;
  percent: number;
  stagePercent?: number;
  message: string;
  receivedBytes?: number;
  totalBytes?: number;
  processedSec?: number;
  durationSec?: number;
  sourceKind?: string;
  sourceLabel?: string;
  filename?: string;
  error?: string;
}

interface FreemakeJobRecord {
  progress: FreemakeJobProgress;
  tmpDir?: string;
  outputPath?: string;
  outputFilename?: string;
  mimeType?: string;
  sizeBytes?: number;
  sourceKind?: string;
  sourceLabel?: string;
  durationSec?: number;
  artworkUrl?: string;
  album?: string;
  listeners: Set<(p: FreemakeJobProgress) => void>;
  cleanupTimer?: NodeJS.Timeout;
  consumed?: boolean;
}

const freemakeJobs = new Map<string, FreemakeJobRecord>();

function createFreemakeJob(jobId?: string): FreemakeJobRecord {
  const id = jobId || `fm_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const existing = freemakeJobs.get(id);
  if (existing) return existing;
  const record: FreemakeJobRecord = {
    progress: {
      jobId: id,
      stage: 'resolving',
      percent: 2,
      message: 'ダウンロード準備中...',
    },
    listeners: new Set(),
  };
  freemakeJobs.set(id, record);
  scheduleJobCleanup(id, 10 * 60 * 1000);
  return record;
}

function scheduleJobCleanup(jobId: string, delayMs: number) {
  const rec = freemakeJobs.get(jobId);
  if (!rec) return;
  if (rec.cleanupTimer) clearTimeout(rec.cleanupTimer);
  rec.cleanupTimer = setTimeout(() => {
    const cur = freemakeJobs.get(jobId);
    if (!cur) return;
    if (cur.tmpDir) {
      fs.promises.rm(cur.tmpDir, { recursive: true, force: true }).catch(() => {});
    }
    cur.listeners.clear();
    freemakeJobs.delete(jobId);
  }, delayMs);
}

function emitJobProgress(job: FreemakeJobRecord | null | undefined, patch: Partial<FreemakeJobProgress>) {
  if (!job) return;
  job.progress = {
    ...job.progress,
    ...patch,
    percent: Math.max(0, Math.min(100, Math.round(patch.percent ?? job.progress.percent))),
  };
  for (const listener of job.listeners) {
    try {
      listener(job.progress);
    } catch {}
  }
}

function parseHmsToSec(hms: string): number {
  const m = hms.trim().match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

async function probeMediaFile(filePath: string): Promise<{
  durationSec: number;
  hasVideo: boolean;
  videoCodec: string | null;
  videoHeight: number;
  hasAudio: boolean;
}> {
  const ffprobeOk = await getFfprobeAvailable();
  if (!ffprobeOk) {
    return { durationSec: 0, hasVideo: false, videoCodec: null, videoHeight: 0, hasAudio: true };
  }
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration:stream=codec_type,codec_name,height',
        '-of',
        'json',
        filePath,
      ],
      { timeout: 8000 }
    );
    const parsed = JSON.parse(String(stdout || '{}')) as any;
    const streams = Array.isArray(parsed?.streams) ? parsed.streams : [];
    const videoStream = streams.find((s: any) => s?.codec_type === 'video');
    const audioStream = streams.find((s: any) => s?.codec_type === 'audio');
    const rawDur = parseFloat(String(parsed?.format?.duration || '0'));
    return {
      durationSec: Number.isFinite(rawDur) && rawDur > 0 ? Math.round(rawDur) : 0,
      hasVideo: Boolean(videoStream),
      videoCodec: videoStream?.codec_name ? String(videoStream.codec_name).toLowerCase() : null,
      videoHeight: Number(videoStream?.height) || 0,
      hasAudio: Boolean(audioStream),
    };
  } catch {
    return { durationSec: 0, hasVideo: false, videoCodec: null, videoHeight: 0, hasAudio: true };
  }
}

async function detectMediaContainerFromFile(
  filePath: string,
  contentType: string,
  wantsVideo: boolean
): Promise<{ ext: string; mimeType: string; isAudioOnly: boolean }> {
  try {
    const fh = await fs.promises.open(filePath, 'r');
    const buf = Buffer.alloc(64);
    const { bytesRead } = await fh.read(buf, 0, 64, 0);
    await fh.close();

    if (bytesRead >= 4) {
      const ascii4 = buf.subarray(0, 4).toString('ascii');
      if (ascii4 === 'fLaC') return { ext: 'flac', mimeType: 'audio/flac', isAudioOnly: true };
      if (ascii4 === 'OggS') return { ext: 'ogg', mimeType: 'audio/ogg', isAudioOnly: true };
      if (ascii4 === 'RIFF' && bytesRead >= 12) {
        const sub4 = buf.subarray(8, 12).toString('ascii');
        if (sub4 === 'WAVE') return { ext: 'wav', mimeType: 'audio/wav', isAudioOnly: true };
        if (sub4 === 'AVI ') return { ext: 'avi', mimeType: 'video/x-msvideo', isAudioOnly: false };
      }
      if (buf.subarray(0, 3).toString('ascii') === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) {
        return { ext: 'mp3', mimeType: 'audio/mpeg', isAudioOnly: true };
      }
      if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
        const headerStr = buf.subarray(0, bytesRead).toString('latin1').toLowerCase();
        if (headerStr.includes('matroska')) {
          return { ext: 'mkv', mimeType: 'video/x-matroska', isAudioOnly: false };
        }
        return wantsVideo
          ? { ext: 'webm', mimeType: 'video/webm', isAudioOnly: false }
          : { ext: 'webm', mimeType: 'audio/webm', isAudioOnly: true };
      }
      if (bytesRead >= 12 && buf.subarray(4, 8).toString('ascii') === 'ftyp') {
        const brand = buf.subarray(8, 12).toString('ascii').toLowerCase();
        if (brand.includes('m4a')) {
          return { ext: 'm4a', mimeType: 'audio/mp4', isAudioOnly: true };
        }
        if (wantsVideo || contentType.includes('video/')) {
          return { ext: 'mp4', mimeType: 'video/mp4', isAudioOnly: false };
        }
        return { ext: 'm4a', mimeType: 'audio/mp4', isAudioOnly: true };
      }
    }
  } catch {}

  const ct = (contentType || '').toLowerCase();
  if (ct.includes('mpeg') || ct.includes('mp3')) return { ext: 'mp3', mimeType: 'audio/mpeg', isAudioOnly: true };
  if (ct.includes('flac')) return { ext: 'flac', mimeType: 'audio/flac', isAudioOnly: true };
  if (ct.includes('wav')) return { ext: 'wav', mimeType: 'audio/wav', isAudioOnly: true };
  if (ct.includes('ogg')) return { ext: 'ogg', mimeType: 'audio/ogg', isAudioOnly: true };
  if (ct.includes('matroska') || ct.includes('mkv')) return { ext: 'mkv', mimeType: 'video/x-matroska', isAudioOnly: false };
  if (ct.includes('msvideo') || ct.includes('avi')) return { ext: 'avi', mimeType: 'video/x-msvideo', isAudioOnly: false };
  if (ct.includes('webm')) {
    return wantsVideo
      ? { ext: 'webm', mimeType: 'video/webm', isAudioOnly: false }
      : { ext: 'webm', mimeType: 'audio/webm', isAudioOnly: true };
  }
  if (ct.includes('video/mp4')) return { ext: 'mp4', mimeType: 'video/mp4', isAudioOnly: false };
  if (ct.includes('mp4') || ct.includes('aac') || ct.includes('m4a')) {
    return { ext: 'm4a', mimeType: 'audio/mp4', isAudioOnly: true };
  }
  return { ext: 'm4a', mimeType: 'audio/mp4', isAudioOnly: true };
}

async function spawnFfmpegWithProgress(
  args: string[],
  expectedDurationSec: number,
  onProgress?: (info: { processedSec: number; durationSec: number; ratio: number }) => void
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdoutBuf = '';
    let detectedDurationSec = expectedDurationSec > 0 ? expectedDurationSec : 0;
    let lastEmitAt = 0;

    const reportTime = (processedSec: number) => {
      if (!onProgress || processedSec < 0) return;
      const now = Date.now();
      if (now - lastEmitAt < 120) return;
      lastEmitAt = now;
      const denom = detectedDurationSec > 0 ? detectedDurationSec : Math.max(processedSec + 10, 180);
      const ratio = Math.max(0, Math.min(0.99, processedSec / denom));
      onProgress({
        processedSec,
        durationSec: detectedDurationSec,
        ratio,
      });
    };

    proc.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('out_time_us=')) {
          const us = Number(trimmed.slice('out_time_us='.length));
          if (Number.isFinite(us) && us >= 0) {
            reportTime(us / 1_000_000);
          }
        } else if (trimmed.startsWith('out_time=')) {
          const sec = parseHmsToSec(trimmed.slice('out_time='.length));
          if (sec > 0) reportTime(sec);
        }
      }
    });

    proc.stderr.on('data', (chunk) => {
      const str = chunk.toString();
      stderr += str;
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
      if (detectedDurationSec <= 0) {
        const durMatch = stderr.match(/Duration:\s*(\d+:\d{2}:\d{2}(?:\.\d+)?)/);
        if (durMatch?.[1]) {
          const parsed = parseHmsToSec(durMatch[1]);
          if (parsed > 0) detectedDurationSec = parsed;
        }
      }
      const timeMatch = str.match(/time=(\d+:\d{2}:\d{2}(?:\.\d+)?)/);
      if (timeMatch?.[1]) {
        const sec = parseHmsToSec(timeMatch[1]);
        if (sec > 0) reportTime(sec);
      }
    });

    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) {
        if (onProgress && detectedDurationSec > 0) {
          onProgress({
            processedSec: detectedDurationSec,
            durationSec: detectedDurationSec,
            ratio: 1,
          });
        }
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-400)}`));
      }
    });
  });
}

async function runFfmpegConvert(options: {
  inputSource: string; // local file path OR HLS m3u8 URL
  inputHeaders?: Record<string, string>;
  secondaryAudioSource?: string; // optional separate adaptive audio track for HD/4K muxing
  outputPath: string;
  format: FreemakeFormatSpec;
  title?: string;
  artist?: string;
  album?: string;
  coverImagePath?: string;
  isAudioOnlyInput?: boolean;
  inputVideoCodec?: string | null;
  inputVideoHeight?: number;
  maxVideoHeight?: number;
  expectedDurationSec?: number;
  onProgress?: (info: { processedSec: number; durationSec: number; ratio: number }) => void;
}): Promise<void> {
  const {
    inputSource,
    inputHeaders,
    secondaryAudioSource,
    outputPath,
    format,
    title,
    artist,
    album,
    coverImagePath,
    isAudioOnlyInput,
    inputVideoCodec,
    inputVideoHeight = 0,
    maxVideoHeight = 0,
    expectedDurationSec = 0,
    onProgress,
  } = options;

  const canAttachAudioCover =
    Boolean(coverImagePath) &&
    !format.isVideo &&
    (format.ext === 'mp3' || format.ext === 'm4a' || format.ext === 'flac' || format.ext === 'ogg');

  const needsDownscale =
    Boolean(format.isVideo) &&
    !isAudioOnlyInput &&
    maxVideoHeight > 0 &&
    (inputVideoHeight <= 0 || inputVideoHeight > maxVideoHeight);

  const buildArgs = (
    videoStrategy: 'copy' | 'ultrafast' | 'still' | 'formatDefault',
    withCover: boolean
  ) => {
    const args: string[] = ['-y', '-progress', 'pipe:1', '-nostats'];
    if (inputSource.startsWith('http') && inputHeaders && Object.keys(inputHeaders).length > 0) {
      const hdrLines = Object.entries(inputHeaders)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\r\n');
      args.push('-headers', `${hdrLines}\r\n`);
    }
    args.push('-i', inputSource);

    if (secondaryAudioSource) {
      args.push('-i', secondaryAudioSource);
    }

    if (format.isVideo && isAudioOnlyInput) {
      const stillSize = maxVideoHeight > 0 && maxVideoHeight <= 480 ? 480 : 720;
      if (withCover && coverImagePath) {
        args.push(
          '-loop',
          '1',
          '-i',
          coverImagePath,
          '-map',
          '1:v:0',
          '-map',
          '0:a:0',
          '-vf',
          `scale=${stillSize}:${stillSize}:force_original_aspect_ratio=increase,crop=${stillSize}:${stillSize},format=yuv420p`,
          '-shortest'
        );
      } else {
        const durParam = expectedDurationSec > 0 ? `:d=${Math.ceil(expectedDurationSec + 1)}` : '';
        args.push(
          '-f',
          'lavfi',
          '-i',
          `color=c=#09090d:s=640x360:r=1${durParam}`,
          '-map',
          '1:v:0',
          '-map',
          '0:a:0',
          '-fflags',
          '+shortest',
          '-shortest'
        );
      }
    } else if (!format.isVideo && withCover && coverImagePath && canAttachAudioCover) {
      args.push('-i', coverImagePath);
    } else if (secondaryAudioSource) {
      args.push('-map', '0:v:0', '-map', '1:a:0', '-shortest');
    }

    if (format.isVideo) {
      if (needsDownscale && videoStrategy !== 'copy') {
        args.push('-vf', `scale=-2:'min(ih,${maxVideoHeight})'`);
      }
      if (videoStrategy === 'copy') {
        args.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k');
        if (format.ext === 'mp4') args.push('-movflags', '+faststart');
      } else if (videoStrategy === 'still') {
        if (format.ext === 'avi') {
          args.push('-c:v', 'mpeg4', '-q:v', '5', '-r', '1', '-c:a', 'libmp3lame', '-b:a', '192k');
        } else if (format.ext === 'webm') {
          args.push(
            '-c:v',
            'libvpx',
            '-deadline',
            'realtime',
            '-cpu-used',
            '5',
            '-b:v',
            '500k',
            '-r',
            '1',
            '-c:a',
            'libvorbis',
            '-q:a',
            '5'
          );
        } else {
          args.push(
            '-c:v',
            'libx264',
            '-preset',
            'ultrafast',
            '-tune',
            'stillimage',
            '-pix_fmt',
            'yuv420p',
            '-crf',
            '28',
            '-r',
            '1',
            '-c:a',
            'aac',
            '-b:a',
            '192k'
          );
          if (format.ext === 'mp4') args.push('-movflags', '+faststart');
        }
      } else if (videoStrategy === 'ultrafast') {
        if (format.ext === 'avi' || format.ext === 'webm') {
          args.push(...format.ffmpegArgs);
        } else {
          args.push(
            '-c:v',
            'libx264',
            '-preset',
            'ultrafast',
            '-pix_fmt',
            'yuv420p',
            '-crf',
            '24',
            '-c:a',
            'aac',
            '-b:a',
            '192k'
          );
          if (format.ext === 'mp4') args.push('-movflags', '+faststart');
        }
      } else {
        args.push(...format.ffmpegArgs);
      }
    } else if (withCover && coverImagePath && canAttachAudioCover) {
      const audioArgs = format.ffmpegArgs.filter((a) => a !== '-vn');
      args.push(
        '-map',
        '0:a:0',
        '-map',
        '1:v:0',
        ...audioArgs,
        '-vf',
        "crop='min(iw,ih)':'min(iw,ih)',scale=1000:1000",
        '-c:v',
        'mjpeg',
        '-disposition:v:0',
        'attached_pic'
      );
      if (format.ext === 'mp3') {
        args.push(
          '-id3v2_version',
          '3',
          '-metadata:s:v',
          'title=Album cover',
          '-metadata:s:v',
          'comment=Cover (front)'
        );
      }
    } else {
      args.push(...format.ffmpegArgs);
    }

    if (title) args.push('-metadata', `title=${title}`);
    if (artist) args.push('-metadata', `artist=${artist}`);
    if (album) args.push('-metadata', `album=${album}`);
    args.push('-metadata', 'comment=Converted by Zero Music x Freemake Engine');
    args.push(outputPath);
    return args;
  };

  if (format.isVideo) {
    if (isAudioOnlyInput) {
      if (coverImagePath) {
        try {
          await spawnFfmpegWithProgress(buildArgs('still', true), expectedDurationSec, onProgress);
          return;
        } catch {}
      }
      await spawnFfmpegWithProgress(buildArgs('still', false), expectedDurationSec, onProgress);
      return;
    }

    const canCopyContainer =
      (format.ext === 'mp4' || format.ext === 'mkv') &&
      inputVideoCodec === 'h264' &&
      !needsDownscale;
    const canCopyWebm =
      format.ext === 'webm' &&
      (inputVideoCodec === 'vp8' || inputVideoCodec === 'vp9') &&
      !needsDownscale;

    if (canCopyContainer || canCopyWebm) {
      try {
        await spawnFfmpegWithProgress(buildArgs('copy', false), expectedDurationSec, onProgress);
        return;
      } catch {}
    }

    await spawnFfmpegWithProgress(buildArgs('ultrafast', false), expectedDurationSec, onProgress);
    return;
  }

  if (canAttachAudioCover) {
    try {
      await spawnFfmpegWithProgress(buildArgs('formatDefault', true), expectedDurationSec, onProgress);
      return;
    } catch {
      // Fallback safely to audio-only conversion if container rejects attached_pic
    }
  }

  await spawnFfmpegWithProgress(buildArgs('formatDefault', false), expectedDurationSec, onProgress);
}

async function downloadUrlToFile(
  url: string,
  destPath: string,
  headers?: Record<string, string>,
  onProgress?: (receivedBytes: number, totalBytes: number) => void
): Promise<{ contentType: string; bytes: number }> {
  const controller = new AbortController();
  const totalTimeout = setTimeout(() => controller.abort(new Error('Stream download timeout')), 120000);
  let stallTimeout: NodeJS.Timeout | null = null;
  const resetStall = () => {
    if (stallTimeout) clearTimeout(stallTimeout);
    stallTimeout = setTimeout(() => controller.abort(new Error('Stream stalled')), 22000);
  };

  try {
    resetStall();
    const resp = await fetch(url, {
      headers: {
        'User-Agent': headers?.['User-Agent'] || BROWSER_UA,
        ...(headers || {}),
      },
      signal: controller.signal,
    });
    if (!resp.ok) {
      throw new Error(`Stream fetch failed with HTTP ${resp.status}`);
    }

    const totalBytes = Number(resp.headers.get('content-length') || 0) || 0;
    const contentType = resp.headers.get('content-type') || 'application/octet-stream';

    if (resp.body) {
      const reader = resp.body.getReader();
      const ws = fs.createWriteStream(destPath);
      let receivedBytes = 0;
      let lastReportAt = 0;

      try {
        while (true) {
          resetStall();
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.byteLength > 0) {
            const b = Buffer.from(value);
            receivedBytes += b.byteLength;
            if (!ws.write(b)) {
              await new Promise<void>((resolve, reject) => {
                ws.once('drain', resolve);
                ws.once('error', reject);
              });
            }
            const now = Date.now();
            if (onProgress && (now - lastReportAt >= 90 || (totalBytes > 0 && receivedBytes >= totalBytes))) {
              lastReportAt = now;
              onProgress(receivedBytes, totalBytes);
            }
          }
        }
        await new Promise<void>((resolve, reject) => {
          ws.on('finish', resolve);
          ws.on('error', reject);
          ws.end();
        });
      } catch (err) {
        try {
          ws.destroy();
          await fs.promises.unlink(destPath);
        } catch {}
        throw err;
      }

      if (receivedBytes < 1024) {
        await fs.promises.unlink(destPath).catch(() => {});
        throw new Error('Fetched media stream was empty or truncated');
      }
      if (onProgress) onProgress(receivedBytes, totalBytes || receivedBytes);
      return { contentType, bytes: receivedBytes };
    }

    const arrayBuf = await resp.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    if (buf.length < 1024) {
      throw new Error('Fetched media stream was empty or truncated');
    }
    if (onProgress) onProgress(buf.length, totalBytes || buf.length);
    await fs.promises.writeFile(destPath, buf);
    return { contentType, bytes: buf.length };
  } finally {
    clearTimeout(totalTimeout);
    if (stallTimeout) clearTimeout(stallTimeout);
  }
}

async function downloadUnencryptedHlsToFile(
  m3u8Url: string,
  destPath: string,
  headers?: Record<string, string>,
  onProgress?: (receivedBytes: number, totalBytes: number) => void,
  depth = 0
): Promise<{ contentType: string; bytes: number }> {
  const res = await fetch(m3u8Url, {
    headers: { 'User-Agent': BROWSER_UA, ...(headers || {}) },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HLS playlist failed with HTTP ${res.status}`);
  const text = await res.text();
  if (text.includes('#EXT-X-KEY') && !text.includes('METHOD=NONE')) {
    throw new Error('Encrypted HLS stream requires FFmpeg');
  }

  // Handle HLS Master Playlist (#EXT-X-STREAM-INF / #EXT-X-MEDIA:TYPE=AUDIO)
  if (text.includes('#EXT-X-STREAM-INF') && depth < 2) {
    const rawLines = text.split(/\r?\n/).map((l) => l.trim());
    const audioMatch = text.match(/#EXT-X-MEDIA:TYPE=AUDIO[^\n]*URI="([^"]+)"/);
    if (audioMatch?.[1]) {
      const audioPlaylistUrl = new URL(audioMatch[1], m3u8Url).toString();
      try {
        return await downloadUnencryptedHlsToFile(audioPlaylistUrl, destPath, headers, onProgress, depth + 1);
      } catch {}
    }

    const variants: Array<{ url: string; bandwidth: number }> = [];
    for (let i = 0; i < rawLines.length; i++) {
      if (rawLines[i].startsWith('#EXT-X-STREAM-INF')) {
        const bwMatch = rawLines[i].match(/BANDWIDTH=(\d+)/);
        const bw = bwMatch ? Number(bwMatch[1]) : 0;
        const nextUri = rawLines.slice(i + 1).find((l) => l && !l.startsWith('#'));
        if (nextUri) {
          variants.push({ url: new URL(nextUri, m3u8Url).toString(), bandwidth: bw });
        }
      }
    }
    if (variants.length > 0) {
      // Pick lightest/medium variant so response stays compact on serverless & fast everywhere
      variants.sort((a, b) => a.bandwidth - b.bandwidth);
      const chosen = IS_VERCEL ? variants[0] : variants[Math.min(1, variants.length - 1)];
      return downloadUnencryptedHlsToFile(chosen.url, destPath, headers, onProgress, depth + 1);
    }
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  if (lines.length === 0) throw new Error('Empty HLS playlist');

  const initMatch = text.match(/#EXT-X-MAP:URI="([^"]+)"/);
  const segmentUrls: string[] = [];
  if (initMatch?.[1]) {
    segmentUrls.push(new URL(initMatch[1], m3u8Url).toString());
  }
  for (const line of lines.slice(0, 220)) {
    segmentUrls.push(new URL(line, m3u8Url).toString());
  }

  const ws = fs.createWriteStream(destPath);
  let totalWritten = 0;
  let contentType = 'audio/mpeg';

  try {
    for (let i = 0; i < segmentUrls.length; i++) {
      const segRes = await fetch(segmentUrls[i], {
        headers: { 'User-Agent': BROWSER_UA, ...(headers || {}) },
        signal: AbortSignal.timeout(15000),
      });
      if (!segRes.ok) throw new Error(`HLS segment ${i + 1} failed (${segRes.status})`);
      if (i === 0) {
        const ct = segRes.headers.get('content-type');
        if (ct) contentType = ct;
      }
      const segBuf = Buffer.from(await segRes.arrayBuffer());
      totalWritten += segBuf.byteLength;
      if (!ws.write(segBuf)) {
        await new Promise<void>((resolve, reject) => {
          ws.once('drain', resolve);
          ws.once('error', reject);
        });
      }
      onProgress?.(totalWritten, Math.round((totalWritten / (i + 1)) * segmentUrls.length));
    }
    await new Promise<void>((resolve, reject) => {
      ws.on('finish', resolve);
      ws.on('error', reject);
      ws.end();
    });
  } catch (err) {
    try {
      ws.destroy();
      await fs.promises.unlink(destPath);
    } catch {}
    throw err;
  }

  if (totalWritten < 1024) {
    await fs.promises.unlink(destPath).catch(() => {});
    throw new Error('HLS stream too small');
  }
  return { contentType, bytes: totalWritten };
}

interface DownloadPipelineResult {
  tmpDir: string;
  outputPath: string;
  outputFilename: string;
  mimeType: string;
  sizeBytes: number;
  sourceKind: string;
  sourceLabel: string;
  durationSec: number;
  passthrough: boolean;
  artworkUrl?: string;
  album?: string;
}

async function executeFreemakeDownloadPipeline(
  body: any,
  getInnertube: () => Promise<Innertube>,
  job?: FreemakeJobRecord
): Promise<DownloadPipelineResult> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'freemake-dl-'));
  try {
    const {
      videoId: rawId,
      url: rawUrl,
      title = '',
      artist = '',
      album = '',
      thumbnail = '',
      duration = '',
      durationSeconds = 0,
      format: rawFormat = 'mp3_320',
      quality: rawQuality = 'best',
      youtubeCookie,
      poToken,
      cobaltApiUrl,
      allowPreviewFallback = false,
      enabledSites,
    } = body || {};

    const enabledSiteSet =
      Array.isArray(enabledSites) && enabledSites.length > 0
        ? new Set(enabledSites.map((s: any) => String(s || '').trim()).filter(Boolean))
        : null;
    const allowSite = (id: FreemakeDownloadSiteId) => !enabledSiteSet || enabledSiteSet.has(id);

    const ffmpegStatus = await getFfmpegStatus();
    const format = FREEMAKE_FORMATS[rawFormat as FreemakeFormatId] || FREEMAKE_FORMATS.mp3_320;
    const maxVideoHeight = parseQualityMaxHeight(String(rawQuality || 'best'));
    const cleanRawUrl = String(rawUrl || '').trim();
    const videoId = extractYouTubeVideoId(cleanRawUrl || String(rawId || ''));
    const isNonYtHttpUrl = !videoId && /^https?:\/\//i.test(cleanRawUrl);

    emitJobProgress(job, {
      stage: 'resolving',
      percent: 6,
      stagePercent: 25,
      message: isNonYtHttpUrl
        ? '外部サイトURLのメディア情報とストリームを解析中...'
        : '楽曲メタデータとジャケット画像を取得中...',
    });

    let extPage: ResolvedExternalPage | null = null;
    if (isNonYtHttpUrl) {
      extPage = await resolveExternalPageUrl(cleanRawUrl, format.isVideo, maxVideoHeight, {
        cobaltApiUrl,
        enabledSiteSet,
        resolveStreams: true,
      });
    }

    const meta = await resolveMetadataForTrack({
      videoId,
      title: String(title || extPage?.title || ''),
      artist: String(artist || extPage?.artist || ''),
      album: String(album || extPage?.album || ''),
      thumbnail: String(thumbnail || extPage?.thumbnailUrl || ''),
      duration: String(duration || ''),
      durationSeconds: Number(durationSeconds) || extPage?.durationSec || 0,
      getInnertube,
    });

    const coverPromise: Promise<CoverImageAsset | null> = fetchBestCoverImage(
      meta.coverCandidates
    ).catch(() => null);

    let inputSource = path.join(tmpDir, 'input.media');
    let secondaryAudioSource: string | undefined;
    let inputHeaders: Record<string, string> | undefined;
    let downloadedContentType = 'audio/mpeg';
    let sourceKind: FreemakeDownloadSiteId | 'official-preview-30s' = 'youtube-direct';
    let sourceLabel = '';
    let isAudioOnlyInput = true;
    let resolvedDurationSec = meta.expectedDurationSec || 0;
    const resolvedTitle = meta.title || extPage?.title || String(title || '').trim();
    const resolvedArtist = meta.artist || extPage?.artist || String(artist || '').trim();
    const resolvedAlbum = String(album || '').trim() || extPage?.album || meta.album || '';

    let resolved = false;

    const tryDownloadStream = async (
      targetUrl: string,
      headers: Record<string, string> | undefined,
      kind: typeof sourceKind,
      label: string,
      candDurationSec: number,
      optionalAudioUrl?: string
    ): Promise<boolean> => {
      try {
        emitJobProgress(job, {
          stage: 'fetching',
          percent: 25,
          stagePercent: 0,
          sourceKind: kind,
          sourceLabel: label,
          message: optionalAudioUrl ? `${label} (映像+音声) を取得中...` : `${label} からストリームを取得中...`,
        });
        const dl = await downloadUrlToFile(
          targetUrl,
          inputSource,
          headers,
          (receivedBytes, totalBytes) => {
            const ratio = totalBytes > 0 ? Math.min(1, receivedBytes / totalBytes) : 0.4;
            emitJobProgress(job, {
              stage: 'fetching',
              percent: 25 + ratio * (optionalAudioUrl ? 24 : 33),
              stagePercent: Math.round(ratio * 100),
              receivedBytes,
              totalBytes,
              sourceKind: kind,
              sourceLabel: label,
              message: 'メディアデータをダウンロード中...',
            });
          }
        );

        if (optionalAudioUrl) {
          const audioDest = path.join(tmpDir, 'input.audio.media');
          try {
            await downloadUrlToFile(optionalAudioUrl, audioDest, headers);
            secondaryAudioSource = audioDest;
          } catch {
            await fs.promises.unlink(inputSource).catch(() => {});
            await fs.promises.unlink(audioDest).catch(() => {});
            secondaryAudioSource = undefined;
            return false;
          }
        }

        // Verify full-length duration if ffprobe is present and expected track > 60s
        const probed = await probeMediaFile(inputSource);
        if (probed.durationSec > 0 && probed.durationSec < 45 && meta.expectedDurationSec > 60) {
          await fs.promises.unlink(inputSource).catch(() => {});
          if (secondaryAudioSource) await fs.promises.unlink(secondaryAudioSource).catch(() => {});
          secondaryAudioSource = undefined;
          return false;
        }

        downloadedContentType = dl.contentType;
        sourceKind = kind;
        sourceLabel = label;
        if (probed.durationSec > 0) {
          resolvedDurationSec = probed.durationSec;
        } else if (candDurationSec > 0) {
          resolvedDurationSec = candDurationSec;
        }
        isAudioOnlyInput = !probed.hasVideo && !dl.contentType.includes('video') && !optionalAudioUrl && !format.isVideo;
        return true;
      } catch {
        await fs.promises.unlink(inputSource).catch(() => {});
        if (secondaryAudioSource) await fs.promises.unlink(secondaryAudioSource).catch(() => {});
        secondaryAudioSource = undefined;
        return false;
      }
    };

    const tryHlsStream = async (
      m3u8Url: string,
      headers: Record<string, string> | undefined,
      kind: typeof sourceKind,
      label: string,
      candDurationSec: number,
      hasVideoStream = false
    ): Promise<boolean> => {
      if (!ffmpegStatus.available) {
        try {
          emitJobProgress(job, {
            stage: 'fetching',
            percent: 30,
            stagePercent: 20,
            sourceKind: kind,
            sourceLabel: label,
            message: `${label} (HLS) を取得中...`,
          });
          const dl = await downloadUnencryptedHlsToFile(
            m3u8Url,
            inputSource,
            headers || { 'User-Agent': BROWSER_UA },
            (receivedBytes, totalBytes) => {
              const ratio = totalBytes > 0 ? Math.min(1, receivedBytes / totalBytes) : 0.4;
              emitJobProgress(job, {
                stage: 'fetching',
                percent: 30 + ratio * 28,
                stagePercent: Math.round(ratio * 100),
                receivedBytes,
                totalBytes,
                sourceKind: kind,
                sourceLabel: label,
              });
            }
          );
          downloadedContentType = dl.contentType;
          sourceKind = kind;
          resolvedDurationSec = candDurationSec || resolvedDurationSec;
          sourceLabel = label;
          isAudioOnlyInput = !hasVideoStream;
          return true;
        } catch {
          await fs.promises.unlink(inputSource).catch(() => {});
          return false;
        }
      }

      inputSource = m3u8Url;
      inputHeaders = headers || { 'User-Agent': BROWSER_UA };
      sourceKind = kind;
      resolvedDurationSec = candDurationSec || resolvedDurationSec;
      sourceLabel = label;
      isAudioOnlyInput = !hasVideoStream && !format.isVideo;
      emitJobProgress(job, {
        stage: 'fetching',
        percent: 55,
        stagePercent: 100,
        sourceKind: kind,
        sourceLabel: label,
        message: `${label} ストリーム接続完了 — 変換準備中...`,
      });
      return true;
    };

    // Strategy A0: Direct external URL stream (Bilibili / Niconico / Dailymotion / SoundCloud / Vimeo / Cobalt)
    if (!resolved && extPage?.directStreamUrl) {
      const extLabel = `${extPage.siteName} URL直接抽出`;
      if (extPage.directProtocol === 'hls' || extPage.directStreamUrl.includes('.m3u8')) {
        resolved = await tryHlsStream(
          extPage.directStreamUrl,
          extPage.directHeaders,
          extPage.siteId,
          extLabel,
          extPage.durationSec || resolvedDurationSec,
          Boolean(extPage.directHasVideo)
        );
      } else {
        resolved = await tryDownloadStream(
          extPage.directStreamUrl,
          extPage.directHeaders,
          extPage.siteId,
          extLabel,
          extPage.durationSec || resolvedDurationSec
        );
      }
    }

    // Strategy A: Direct YouTube / Cobalt / Piped / Invidious (exact videoId)
    if (!resolved && videoId) {
      emitJobProgress(job, {
        stage: 'searching',
        percent: 12,
        stagePercent: 30,
        message: 'YouTube・Piped・Invidious・Cobalt を確認中...',
      });
      const directResult = await resolveYouTubeDirectStream(
        videoId,
        format.isVideo,
        getInnertube,
        {
          youtubeCookie,
          poToken,
          cobaltApiUrl,
          enabledSiteSet,
          maxVideoHeight,
          allowMuxedAdaptive: ffmpegStatus.available,
        }
      );
      if ('url' in directResult) {
        resolved = await tryDownloadStream(
          directResult.url,
          directResult.headers,
          directResult.sourceKind,
          directResult.sourceLabel,
          directResult.durationSec || resolvedDurationSec,
          directResult.secondaryAudioUrl
        );
      }
    }

    // Strategy B1: Multi-Site FULL-TRACK Pipeline (9 external search sites in parallel)
    if (!resolved && (resolvedTitle || resolvedArtist)) {
      emitJobProgress(job, {
        stage: 'searching',
        percent: 18,
        stagePercent: 55,
        message: '10サイト以上のフル尺音源エンジンを横断検索中...',
      });

      const helpers: SearchHelpers = {
        cleanSearchTitle,
        stripHtmlTags,
        scoreCandidateTrack,
        probeRemoteStream,
        minCandidateScore: MIN_CANDIDATE_SCORE,
        isVercel: IS_VERCEL,
      };

      const [biliRes, scRes, multiRes] = await Promise.allSettled([
        allowSite('bilibili-full')
          ? searchBilibiliCandidates(resolvedTitle, resolvedArtist, meta.expectedDurationSec)
          : Promise.resolve([]),
        allowSite('soundcloud-full')
          ? searchSoundCloudCandidates(resolvedTitle, resolvedArtist, meta.expectedDurationSec)
          : Promise.resolve([]),
        searchMultiSiteCandidates({
          title: resolvedTitle,
          artist: resolvedArtist,
          expectedDurationSec: meta.expectedDurationSec,
          enabledSiteSet,
          helpers,
        }),
      ]);

      const biliCandidates = biliRes.status === 'fulfilled' ? biliRes.value : [];
      const scCandidates = scRes.status === 'fulfilled' ? scRes.value : [];
      const extCandidates = multiRes.status === 'fulfilled' ? multiRes.value : [];

      interface UnifiedAttempt {
        score: number;
        hasVideo: boolean;
        exec: () => Promise<boolean>;
      }

      const unified: UnifiedAttempt[] = [];

      for (const cand of biliCandidates.slice(0, 3)) {
        unified.push({
          score: cand.score,
          hasVideo: true,
          exec: async () => {
            const stream = await resolveBilibiliStreamForCandidate(cand, format.isVideo, maxVideoHeight);
            if (!stream) return false;
            const label = `Bilibili フル音源 (${formatSecLabel(stream.durationSec || resolvedDurationSec) || 'Full'})`;
            return tryDownloadStream(
              stream.url,
              stream.headers,
              'bilibili-full',
              label,
              stream.durationSec || resolvedDurationSec
            );
          },
        });
      }

      for (const cand of scCandidates.slice(0, 3)) {
        unified.push({
          score: cand.score,
          hasVideo: false,
          exec: async () => {
            const stream = await resolveSoundCloudStreamForCandidate(cand, !ffmpegStatus.available);
            if (!stream) return false;
            const label = `SoundCloud フル音源 (${formatSecLabel(stream.durationSec || resolvedDurationSec) || 'Full'})`;
            if (stream.protocol === 'hls' || stream.url.includes('.m3u8')) {
              return tryHlsStream(
                stream.url,
                { 'User-Agent': BROWSER_UA },
                'soundcloud-full',
                label,
                stream.durationSec || resolvedDurationSec,
                false
              );
            }
            return tryDownloadStream(
              stream.url,
              { 'User-Agent': BROWSER_UA },
              'soundcloud-full',
              label,
              stream.durationSec || resolvedDurationSec
            );
          },
        });
      }

      for (const cand of extCandidates.slice(0, 12)) {
        unified.push({
          score: cand.score,
          hasVideo: cand.hasVideo,
          exec: async () => {
            const stream = await cand.resolveStream();
            if (!stream) return false;
            const label = `${cand.siteName} フル音源 (${formatSecLabel(stream.durationSec || resolvedDurationSec) || 'Full'})`;
            if (stream.protocol === 'hls' || stream.url.includes('.m3u8')) {
              return tryHlsStream(
                stream.url,
                stream.headers,
                cand.siteId,
                label,
                stream.durationSec || resolvedDurationSec,
                Boolean(stream.hasVideo)
              );
            }
            return tryDownloadStream(
              stream.url,
              stream.headers,
              cand.siteId,
              label,
              stream.durationSec || resolvedDurationSec
            );
          },
        });
      }

      unified.sort((a, b) => {
        if (format.isVideo && a.hasVideo !== b.hasVideo) {
          return a.hasVideo ? -1 : 1;
        }
        return b.score - a.score;
      });

      for (const attempt of unified) {
        const ok = await attempt.exec();
        if (ok) {
          resolved = true;
          break;
        }
      }

      // Strategy B2: Alternate YouTube Music / YouTube Video search (e.g. - Topic / Official Audio)
      if (!resolved) {
        emitJobProgress(job, {
          stage: 'searching',
          percent: 22,
          stagePercent: 80,
          message: 'YouTube 代替公式オーディオ・ミラーを検索中...',
        });
        const alternates = await searchYouTubeAlternateVideoIds(
          resolvedTitle,
          resolvedArtist,
          videoId,
          meta.expectedDurationSec,
          getInnertube
        );
        for (const alt of alternates) {
          const altStream = await resolveYouTubeDirectStream(
            alt.videoId,
            format.isVideo,
            getInnertube,
            {
              youtubeCookie,
              poToken,
              cobaltApiUrl,
              enabledSiteSet,
              maxVideoHeight,
              allowMuxedAdaptive: ffmpegStatus.available,
            }
          );
          if ('url' in altStream) {
            const ok = await tryDownloadStream(
              altStream.url,
              altStream.headers,
              altStream.sourceKind,
              altStream.sourceLabel,
              altStream.durationSec || alt.durationSec || resolvedDurationSec
            );
            if (ok) {
              resolved = true;
              break;
            }
          }
        }
      }
    }

    // Strategy C: 30s official preview ONLY if explicitly opted in via allowPreviewFallback === true
    if (!resolved) {
      if (allowPreviewFallback !== true || !meta.officialPreviewUrl) {
        const err = new Error(
          meta.officialPreviewUrl
            ? 'フル尺音源の取得に失敗しました（30秒プレビューの自動保存は誤保存防止のため停止しています）。詳細設定でYouTube Cookie / Cobalt URLを設定するか、別の検索キーワードでお試しください。'
            : 'フル尺音源の取得に失敗しました。詳細設定からYouTube Cookie / Cobalt API URLを指定するか、別のキーワードでお試しください。'
        ) as Error & { statusCode?: number; requiresCookieOrCobalt?: boolean; previewAvailable?: boolean };
        err.statusCode = 422;
        err.requiresCookieOrCobalt = true;
        err.previewAvailable = Boolean(meta.officialPreviewUrl);
        throw err;
      }
      emitJobProgress(job, {
        stage: 'fetching',
        percent: 35,
        stagePercent: 30,
        sourceKind: 'official-preview-30s',
        sourceLabel: meta.officialPreviewSource || 'Apple iTunes 公式30秒プレビュー',
        message: '公式30秒プレビュー音源を取得中...',
      });
      const dl = await downloadUrlToFile(
        meta.officialPreviewUrl,
        inputSource,
        undefined,
        (receivedBytes, totalBytes) => {
          const ratio = totalBytes > 0 ? Math.min(1, receivedBytes / totalBytes) : 0.5;
          emitJobProgress(job, {
            stage: 'fetching',
            percent: 35 + ratio * 23,
            stagePercent: Math.round(ratio * 100),
            receivedBytes,
            totalBytes,
          });
        }
      );
      downloadedContentType = dl.contentType;
      sourceKind = 'official-preview-30s';
      sourceLabel = meta.officialPreviewSource || 'Apple iTunes 公式30秒プレビュー';
      resolvedDurationSec = 30;
      isAudioOnlyInput = true;
    }

    const safeBase = sanitizeFilenameBase(
      resolvedArtist && resolvedTitle
        ? `${resolvedArtist} - ${resolvedTitle}`
        : resolvedTitle || videoId || 'track'
    );

    const coverImage = await coverPromise;
    const resolvedArtworkUrl =
      (coverImage?.sourceUrl && /^https?:\/\//i.test(coverImage.sourceUrl)
        ? coverImage.sourceUrl
        : undefined) ||
      meta.thumbnailUrl ||
      undefined;

    if (!ffmpegStatus.available) {
      // Zero-FFmpeg Direct Passthrough Mode (e.g., Vercel serverless without ffmpeg binary)
      const detected = await detectMediaContainerFromFile(
        inputSource,
        downloadedContentType,
        format.isVideo
      );
      const outputFilename = `${safeBase}.${detected.ext}`;
      const outputPath = path.join(tmpDir, `output.${detected.ext}`);

      emitJobProgress(job, {
        stage: 'converting',
        percent: 78,
        stagePercent: 80,
        durationSec: resolvedDurationSec || undefined,
        sourceKind,
        sourceLabel,
        filename: outputFilename,
        message: `ジャケット画像・タグ埋め込み＆ダイレクト保存準備中 (.${detected.ext.toUpperCase()})...`,
      });

      await fs.promises.rename(inputSource, outputPath);
      await embedMetadataAndCoverFile(
        outputPath,
        detected.ext,
        {
          title: resolvedTitle || safeBase,
          artist: resolvedArtist,
          album: resolvedAlbum,
        },
        coverImage
      );
      const outStat = await fs.promises.stat(outputPath);

      return {
        tmpDir,
        outputPath,
        outputFilename,
        mimeType: detected.mimeType,
        sizeBytes: outStat.size,
        sourceKind,
        sourceLabel: `${sourceLabel} (無変換ダイレクト)`,
        durationSec: resolvedDurationSec,
        passthrough: true,
        artworkUrl: resolvedArtworkUrl,
        album: resolvedAlbum || undefined,
      };
    }

    // Standard FFmpeg transcoding path
    let inputVideoCodec: string | null = null;
    let inputVideoHeight = 0;
    if (!inputSource.startsWith('http')) {
      const probedInput = await probeMediaFile(inputSource);
      isAudioOnlyInput = !probedInput.hasVideo;
      inputVideoCodec = probedInput.videoCodec;
      inputVideoHeight = probedInput.videoHeight;
      if (probedInput.durationSec > 0 && sourceKind !== 'official-preview-30s') {
        resolvedDurationSec = probedInput.durationSec;
      }
    } else {
      isAudioOnlyInput = true;
    }

    let coverImagePath: string | undefined;
    if (coverImage) {
      coverImagePath = path.join(tmpDir, `cover.${coverImage.ext}`);
      await fs.promises.writeFile(coverImagePath, coverImage.buffer);
    }

    const outputFilename = `${safeBase}.${format.ext}`;
    const outputPath = path.join(tmpDir, `output.${format.ext}`);

    emitJobProgress(job, {
      stage: 'converting',
      percent: 58,
      stagePercent: 0,
      durationSec: resolvedDurationSec || undefined,
      sourceKind,
      sourceLabel,
      filename: outputFilename,
      message: coverImagePath
        ? `FFmpeg でジャケット画像埋め込み＆ .${format.ext.toUpperCase()} 変換中...`
        : `FFmpeg で .${format.ext.toUpperCase()} へ変換中...`,
    });

    await runFfmpegConvert({
      inputSource,
      inputHeaders,
      secondaryAudioSource,
      outputPath,
      format,
      title: resolvedTitle || safeBase,
      artist: resolvedArtist,
      album: resolvedAlbum,
      coverImagePath,
      isAudioOnlyInput,
      inputVideoCodec,
      inputVideoHeight,
      maxVideoHeight,
      expectedDurationSec: resolvedDurationSec,
      onProgress: ({ processedSec, durationSec, ratio }) => {
        emitJobProgress(job, {
          stage: 'converting',
          percent: 58 + ratio * 32,
          stagePercent: Math.round(ratio * 100),
          processedSec,
          durationSec: durationSec || resolvedDurationSec || undefined,
          message: `FFmpeg で .${format.ext.toUpperCase()} へ変換中...`,
        });
      },
    });

    const outStat = await fs.promises.stat(outputPath);
    const probedOut = await probeMediaFile(outputPath);
    if (probedOut.durationSec > 0 && sourceKind !== 'official-preview-30s') {
      resolvedDurationSec = probedOut.durationSec;
    }

    return {
      tmpDir,
      outputPath,
      outputFilename,
      mimeType: format.mimeType,
      sizeBytes: outStat.size,
      sourceKind,
      sourceLabel,
      durationSec: resolvedDurationSec,
      passthrough: false,
      artworkUrl: resolvedArtworkUrl,
      album: resolvedAlbum || undefined,
    };
  } catch (err) {
    fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

function setDownloadResponseHeaders(
  res: Response,
  result: DownloadPipelineResult,
  contentLengthOverride?: number
) {
  const asciiFallback =
    result.outputFilename.replace(/[^\x20-\x7e]/g, '_') || `track${path.extname(result.outputFilename)}`;
  const encodedName = encodeURIComponent(result.outputFilename);

  res.setHeader('Content-Type', result.mimeType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Length', String(contentLengthOverride ?? result.sizeBytes));
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`
  );
  res.setHeader('X-Freemake-Source-Kind', result.sourceKind);
  res.setHeader('X-Freemake-Source-Label', encodeURIComponent(result.sourceLabel));
  res.setHeader('X-Freemake-Duration-Sec', String(result.durationSec || 0));
  res.setHeader('X-Freemake-Passthrough', result.passthrough ? '1' : '0');
  if (result.artworkUrl) {
    res.setHeader('X-Freemake-Artwork-Url', encodeURIComponent(result.artworkUrl));
  }
  if (result.album) {
    res.setHeader('X-Freemake-Album', encodeURIComponent(result.album));
  }
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Accept-Ranges, Content-Range, Content-Length, Content-Disposition, X-Freemake-Source-Kind, X-Freemake-Source-Label, X-Freemake-Duration-Sec, X-Freemake-Passthrough, X-Freemake-Artwork-Url, X-Freemake-Album'
  );
}

// ---------- Express Route Registration ----------

export function registerFreemakeRoutes(
  app: Express,
  getInnertube: () => Promise<Innertube>
) {
  // 1. Freemake Engine capabilities & formats
  app.get('/api/freemake/formats', async (_req: Request, res: Response) => {
    const ffmpegStatus = await getFfmpegStatus();

    res.json({
      engine: ffmpegStatus.available
        ? 'Freemake Audio & Video Engine (FFmpeg Powered)'
        : 'Freemake Audio & Video Engine (Direct Stream Mode)',
      ffmpegAvailable: ffmpegStatus.available,
      ffmpegVersion: ffmpegStatus.version,
      isVercel: IS_VERCEL,
      downloadSites: FREEMAKE_DOWNLOAD_SITES,
      formats: Object.values(FREEMAKE_FORMATS).map((f) => ({
        id: f.id,
        label: f.label,
        ext: f.ext,
        mimeType: f.mimeType,
        isVideo: f.isVideo,
        bitrateLabel: f.bitrateLabel,
      })),
    });
  });

  // 2. Probe available FULL-TRACK / VIDEO download sources across all sites for a track/URL/playlist
  app.get('/api/freemake/probe', async (req: Request, res: Response) => {
    const rawIdOrUrl = String(req.query.videoId || req.query.url || '').trim();
    const rawTitle = String(req.query.title || '').trim();
    const rawArtist = String(req.query.artist || '').trim();
    const rawDuration = String(req.query.duration || '').trim();
    const rawDurSec = Number(req.query.durationSeconds) || 0;
    const videoId = extractYouTubeVideoId(rawIdOrUrl);
    const playlistId = extractYouTubePlaylistId(rawIdOrUrl);
    const isNonYtHttpUrl = !videoId && /^https?:\/\//i.test(rawIdOrUrl);

    let extPage: ResolvedExternalPage | null = null;
    if (isNonYtHttpUrl) {
      try {
        await assertSafePublicHttpUrl(rawIdOrUrl);
      } catch (err: any) {
        return res.status(400).json({ error: err?.message || '不正または許可されていないURLです' });
      }
      if (!playlistId) {
        extPage = await resolveExternalPageUrl(rawIdOrUrl, true, 0, { resolveStreams: false }).catch(
          () => null
        );
      }
    }

    const [playlistData, meta] = await Promise.all([
      playlistId ? resolveYouTubePlaylist(playlistId, getInnertube) : Promise.resolve(null),
      resolveMetadataForTrack({
        videoId,
        title: rawTitle || extPage?.title || '',
        artist: rawArtist || extPage?.artist || '',
        album: extPage?.album || '',
        thumbnail: extPage?.thumbnailUrl || '',
        duration: rawDuration,
        durationSeconds: rawDurSec || extPage?.durationSec || 0,
        getInnertube,
      }),
    ]);

    const helpers: SearchHelpers = {
      cleanSearchTitle,
      stripHtmlTags,
      scoreCandidateTrack,
      probeRemoteStream,
      minCandidateScore: MIN_CANDIDATE_SCORE,
      isVercel: IS_VERCEL,
    };

    const [biliRes, scRes, multiRes] = await Promise.allSettled([
      searchBilibiliCandidates(meta.title, meta.artist, meta.expectedDurationSec),
      searchSoundCloudCandidates(meta.title, meta.artist, meta.expectedDurationSec),
      searchMultiSiteCandidates({
        title: meta.title,
        artist: meta.artist,
        expectedDurationSec: meta.expectedDurationSec,
        helpers,
      }),
    ]);

    const topBili = biliRes.status === 'fulfilled' ? biliRes.value[0] : undefined;
    const topSc = scRes.status === 'fulfilled' ? scRes.value[0] : undefined;
    const extList = multiRes.status === 'fulfilled' ? multiRes.value : [];

    const matchedBySite = new Map<
      string,
      { siteId: string; siteName: string; title: string; durationSec: number; score: number }
    >();

    if (extPage) {
      matchedBySite.set(extPage.siteId, {
        siteId: extPage.siteId,
        siteName: extPage.siteName,
        title: extPage.title,
        durationSec: extPage.durationSec || meta.expectedDurationSec || 0,
        score: 200,
      });
    }

    if (topBili && !matchedBySite.has('bilibili-full')) {
      matchedBySite.set('bilibili-full', {
        siteId: 'bilibili-full',
        siteName: 'Bilibili',
        title: topBili.title,
        durationSec: topBili.durationSec,
        score: topBili.score,
      });
    }
    if (topSc && !matchedBySite.has('soundcloud-full')) {
      matchedBySite.set('soundcloud-full', {
        siteId: 'soundcloud-full',
        siteName: 'SoundCloud',
        title: topSc.title,
        durationSec: topSc.durationSec,
        score: topSc.score,
      });
    }
    for (const c of extList) {
      const existing = matchedBySite.get(c.siteId);
      if (!existing || c.score > existing.score) {
        matchedBySite.set(c.siteId, {
          siteId: c.siteId,
          siteName: c.siteName,
          title: c.title,
          durationSec: c.durationSec,
          score: c.score,
        });
      }
    }

    const matchedSites = [...matchedBySite.values()].sort((a, b) => b.score - a.score);
    const bestMatch = matchedSites[0];

    res.json({
      videoId,
      resolvedSiteName: extPage?.siteName || (videoId ? 'YouTube' : bestMatch?.siteName || null),
      resolvedUrl: extPage?.pageUrl || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null),
      resolvedArtist: meta.artist || extPage?.artist || null,
      thumbnailUrl: meta.thumbnailUrl || extPage?.thumbnailUrl || null,
      album: meta.album || extPage?.album || null,
      playlistId: playlistId || null,
      playlistTitle: playlistData?.playlistTitle || null,
      playlistItems: playlistData?.items || [],
      fullTrackAvailable: Boolean(
        extPage || bestMatch || videoId || playlistData || process.env.YOUTUBE_COOKIE || process.env.COBALT_API_URL
      ),
      fullTrackSource: extPage
        ? `${extPage.siteName} URL直接対応`
        : bestMatch
        ? `フル音源 (${bestMatch.siteName} / ${formatSecLabel(bestMatch.durationSec) || 'Full'})`
        : null,
      fullTrackTitle: extPage?.title || bestMatch?.title || meta.title || null,
      fullTrackDurationSec: extPage?.durationSec || bestMatch?.durationSec || meta.expectedDurationSec || null,
      matchedSites,
      officialPreviewAvailable: Boolean(meta.officialPreviewUrl),
      officialPreviewSource: meta.officialPreviewSource || null,
      hasServerCookie: Boolean(process.env.YOUTUBE_COOKIE),
      hasCobaltServer: Boolean(process.env.COBALT_API_URL),
    });
  });

  // 2b. SSRF-safe artwork image proxy so client canvas can crop & save square album jackets offline
  app.get('/api/freemake/artwork', async (req: Request, res: Response) => {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) {
      return res.status(400).json({ error: 'Missing url parameter' });
    }
    try {
      const asset = await fetchSafeExternalImage(rawUrl, 6000);
      if (!asset) {
        return res.status(404).json({ error: 'Artwork image unavailable' });
      }
      res.setHeader('Content-Type', asset.mimeType);
      res.setHeader('Content-Length', String(asset.buffer.length));
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(asset.buffer);
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Invalid artwork URL' });
    }
  });

  // 3a. Start Async Download + Convert Job (for non-serverless stateful servers)
  app.post('/api/freemake/download/start', (req: Request, res: Response) => {
    const job = createFreemakeJob();
    res.status(202).json({ jobId: job.progress.jobId, isVercel: IS_VERCEL });

    executeFreemakeDownloadPipeline(req.body, getInnertube, job)
      .then((result) => {
        job.tmpDir = result.tmpDir;
        job.outputPath = result.outputPath;
        job.outputFilename = result.outputFilename;
        job.mimeType = result.mimeType;
        job.sizeBytes = result.sizeBytes;
        job.sourceKind = result.sourceKind;
        job.sourceLabel = result.sourceLabel;
        job.durationSec = result.durationSec;
        job.artworkUrl = result.artworkUrl;
        job.album = result.album;

        emitJobProgress(job, {
          stage: 'ready',
          percent: 90,
          stagePercent: 100,
          totalBytes: result.sizeBytes,
          receivedBytes: result.sizeBytes,
          sourceKind: result.sourceKind,
          sourceLabel: result.sourceLabel,
          filename: result.outputFilename,
          message: '準備完了 — 端末へダウンロード中...',
        });
        scheduleJobCleanup(job.progress.jobId, 5 * 60 * 1000);
      })
      .catch((err: any) => {
        console.error('[Freemake] Async download/convert error:', err?.message || err);
        emitJobProgress(job, {
          stage: 'error',
          percent: 0,
          message: err?.message || 'ダウンロードに失敗しました',
          error: err?.message || 'Freemakeダウンロード中にエラーが発生しました',
        });
        scheduleJobCleanup(job.progress.jobId, 60 * 1000);
      });
  });

  // 3b. SSE live progress stream for a job
  app.get('/api/freemake/jobs/:jobId/events', (req: Request, res: Response) => {
    const jobId = String(req.params.jobId || '');
    const job = freemakeJobs.get(jobId) || createFreemakeJob(jobId);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const sendEvent = (p: FreemakeJobProgress) => {
      res.write(`data: ${JSON.stringify(p)}\n\n`);
      if (p.stage === 'ready' || p.stage === 'error') {
        cleanup();
        res.end();
      }
    };

    const listener = (p: FreemakeJobProgress) => {
      sendEvent(p);
    };

    const heartbeat = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {}
    }, 10000);

    const cleanup = () => {
      clearInterval(heartbeat);
      job.listeners.delete(listener);
    };

    req.on('close', cleanup);
    job.listeners.add(listener);
    sendEvent(job.progress);
  });

  // 3c. JSON snapshot fallback for job progress
  app.get('/api/freemake/jobs/:jobId', (req: Request, res: Response) => {
    const job = freemakeJobs.get(String(req.params.jobId || ''));
    if (!job) {
      return res.status(404).json({ error: 'ダウンロードジョブが見つかりません' });
    }
    res.json(job.progress);
  });

  // 3d. Stream completed job output file with HTTP Range (206) support
  const serveJobFile = async (req: Request, res: Response) => {
    const jobId = String(req.params.jobId || '');
    const job = freemakeJobs.get(jobId);
    if (!job || job.progress.stage !== 'ready' || !job.outputPath || !job.outputFilename) {
      return res.status(404).json({ error: 'ダウンロードファイルが準備できていません' });
    }
    try {
      const stat = await fs.promises.stat(job.outputPath);
      const totalSize = stat.size;
      job.sizeBytes = totalSize;

      const baseResult: DownloadPipelineResult = {
        tmpDir: job.tmpDir || '',
        outputPath: job.outputPath,
        outputFilename: job.outputFilename,
        mimeType: job.mimeType || 'application/octet-stream',
        sizeBytes: totalSize,
        sourceKind: job.sourceKind || 'youtube-direct',
        sourceLabel: job.sourceLabel || '',
        durationSec: job.durationSec || 0,
        passthrough: false,
        artworkUrl: job.artworkUrl,
        album: job.album,
      };

      const rangeHeader = req.headers.range;
      if (rangeHeader && totalSize > 0) {
        const match = String(rangeHeader).match(/bytes=(\d*)-(\d*)/);
        if (!match) {
          res.status(416).setHeader('Content-Range', `bytes */${totalSize}`);
          return res.end();
        }
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const requestedEnd = match[2] ? parseInt(match[2], 10) : totalSize - 1;
        const end = Math.min(requestedEnd, totalSize - 1);

        if (isNaN(start) || isNaN(end) || start < 0 || start >= totalSize || start > end) {
          res.status(416).setHeader('Content-Range', `bytes */${totalSize}`);
          return res.end();
        }

        const chunkSize = end - start + 1;
        setDownloadResponseHeaders(res, baseResult, chunkSize);
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${totalSize}`);

        if (req.method === 'HEAD') {
          return res.end();
        }

        scheduleJobCleanup(jobId, end >= totalSize - 1 ? 30000 : 3 * 60 * 1000);

        const stream = fs.createReadStream(job.outputPath, { start, end });
        stream.on('error', (err) => {
          if (!res.headersSent) {
            res.status(500).json({ error: err.message });
          } else {
            res.end();
          }
        });
        res.on('finish', () => {
          if (end >= totalSize - 1) {
            job.consumed = true;
            scheduleJobCleanup(jobId, 20000);
          }
        });
        stream.pipe(res);
        return;
      }

      setDownloadResponseHeaders(res, baseResult, totalSize);
      if (req.method === 'HEAD') {
        scheduleJobCleanup(jobId, 3 * 60 * 1000);
        return res.end();
      }

      const stream = fs.createReadStream(job.outputPath);
      stream.on('error', (err) => {
        if (!res.headersSent) {
          res.status(500).json({ error: err.message });
        } else {
          res.end();
        }
      });
      res.on('finish', () => {
        job.consumed = true;
        scheduleJobCleanup(jobId, 20000);
      });
      stream.pipe(res);
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: err?.message || 'ファイル送信エラー' });
      }
    }
  };

  app.head('/api/freemake/jobs/:jobId/file', serveJobFile);
  app.get('/api/freemake/jobs/:jobId/file', serveJobFile);

  app.delete('/api/freemake/jobs/:jobId', (req: Request, res: Response) => {
    const jobId = String(req.params.jobId || '');
    scheduleJobCleanup(jobId, 1000);
    res.json({ success: true });
  });

  // 3e. Synchronous Single-Request Download FULL Track / URL (Primary path for Vercel Serverless)
  app.post('/api/freemake/download', async (req: Request, res: Response) => {
    let result: DownloadPipelineResult | null = null;
    try {
      result = await executeFreemakeDownloadPipeline(req.body, getInnertube);
      setDownloadResponseHeaders(res, result);
      await new Promise<void>((resolve, reject) => {
        const stream = fs.createReadStream(result!.outputPath);
        stream.on('error', reject);
        res.on('finish', resolve);
        stream.pipe(res);
      });
    } catch (err: any) {
      console.error('[Freemake] Download error:', err?.message || err);
      if (!res.headersSent) {
        const status = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(status).json({
          error: err?.message || 'Freemakeダウンロード中にエラーが発生しました',
          ...(err?.requiresCookieOrCobalt ? { requiresCookieOrCobalt: true } : {}),
          ...(err?.previewAvailable ? { previewAvailable: true } : {}),
        });
      }
    } finally {
      if (result?.tmpDir) {
        fs.promises.rm(result.tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  });

  // 4. Local Audio/Video File Conversion (Requires FFmpeg binary)
  app.post(
    '/api/freemake/convert-upload',
    express.raw({ type: '*/*', limit: '64mb' }),
    async (req: Request, res: Response) => {
      const ffmpegStatus = await getFfmpegStatus();
      if (!ffmpegStatus.available) {
        return res.status(501).json({
          error:
            '現在のサーバー環境 (Vercel等) にはFFmpegが搭載されていないため、ファイル形式変換は利用できません。「楽曲ダウンロード」タブのダイレクト取得をご利用ください。',
        });
      }

      const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'freemake-conv-'));
      let keepTmpDir = false;
      const jobId = req.query.jobId ? String(req.query.jobId).trim() : '';
      const job = jobId ? createFreemakeJob(jobId) : null;
      try {
        const bodyBuf = req.body as Buffer;
        if (!Buffer.isBuffer(bodyBuf) || bodyBuf.length < 128) {
          return res.status(400).json({ error: '変換する音声・動画ファイルデータが空です' });
        }

        const rawName = String(req.query.filename || 'audio.mp3');
        const rawFormat = String(req.query.format || 'mp3_320') as FreemakeFormatId;
        const title = String(req.query.title || path.parse(rawName).name || 'Converted Track');
        const artist = String(req.query.artist || '');
        const allowRangeResult = req.query.allowRangeResult === '1';

        const format = FREEMAKE_FORMATS[rawFormat] || FREEMAKE_FORMATS.mp3_320;
        const inputExt = (path.extname(rawName) || '.bin').replace(/[^a-zA-Z0-9.]/g, '');
        const inputPath = path.join(tmpDir, `upload${inputExt || '.bin'}`);
        const outputPath = path.join(tmpDir, `converted.${format.ext}`);

        await fs.promises.writeFile(inputPath, bodyBuf);
        const probedInput = await probeMediaFile(inputPath);
        const isAudioOnlyInput =
          probedInput.durationSec > 0 || probedInput.hasVideo
            ? !probedInput.hasVideo
            : !/\.(mp4|mov|mkv|webm|avi)$/i.test(rawName);

        emitJobProgress(job, {
          stage: 'converting',
          percent: 45,
          stagePercent: 0,
          durationSec: probedInput.durationSec || undefined,
          message: `FFmpeg で .${format.ext.toUpperCase()} へ変換中...`,
        });

        await runFfmpegConvert({
          inputSource: inputPath,
          outputPath,
          format,
          title,
          artist,
          isAudioOnlyInput,
          inputVideoCodec: probedInput.videoCodec,
          expectedDurationSec: probedInput.durationSec,
          onProgress: ({ processedSec, durationSec, ratio }) => {
            emitJobProgress(job, {
              stage: 'converting',
              percent: 45 + ratio * 45,
              stagePercent: Math.round(ratio * 100),
              processedSec,
              durationSec: durationSec || probedInput.durationSec || undefined,
              message: `FFmpeg で .${format.ext.toUpperCase()} へ変換中...`,
            });
          },
        });

        const outStat = await fs.promises.stat(outputPath);
        const probedOut = await probeMediaFile(outputPath);
        const resolvedDurationSec = probedOut.durationSec || probedInput.durationSec || 0;
        const safeBase = sanitizeFilenameBase(title);
        const outputFilename = `${safeBase}_freemake.${format.ext}`;

        if (allowRangeResult && outStat.size > 20 * 1024 * 1024) {
          const activeJob = job || createFreemakeJob();
          activeJob.tmpDir = tmpDir;
          activeJob.outputPath = outputPath;
          activeJob.outputFilename = outputFilename;
          activeJob.mimeType = format.mimeType;
          activeJob.sizeBytes = outStat.size;
          activeJob.sourceKind = 'local-convert';
          activeJob.sourceLabel = 'ローカル変換 (FFmpeg)';
          activeJob.durationSec = resolvedDurationSec;
          keepTmpDir = true;

          emitJobProgress(activeJob, {
            stage: 'ready',
            percent: 90,
            stagePercent: 100,
            totalBytes: outStat.size,
            receivedBytes: outStat.size,
            durationSec: resolvedDurationSec || undefined,
            sourceKind: 'local-convert',
            sourceLabel: 'ローカル変換 (FFmpeg)',
            filename: outputFilename,
            message: '変換完了 — 分割受信を開始中...',
          });
          scheduleJobCleanup(activeJob.progress.jobId, 5 * 60 * 1000);

          return res.json({
            useJobFile: true,
            jobId: activeJob.progress.jobId,
            totalBytes: outStat.size,
            filename: outputFilename,
            mimeType: format.mimeType,
            durationSec: resolvedDurationSec,
          });
        }

        emitJobProgress(job, {
          stage: 'ready',
          percent: 90,
          stagePercent: 100,
          totalBytes: outStat.size,
          receivedBytes: outStat.size,
          durationSec: resolvedDurationSec || undefined,
          message: '変換完了 — ファイルを受信中...',
        });
        if (job) scheduleJobCleanup(job.progress.jobId, 30000);

        const asciiFallback =
          outputFilename.replace(/[^\x20-\x7e]/g, '_') || `converted.${format.ext}`;

        res.setHeader('Content-Type', format.mimeType);
        res.setHeader('Content-Length', String(outStat.size));
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(
            outputFilename
          )}`
        );
        res.setHeader('X-Freemake-Duration-Sec', String(resolvedDurationSec || 0));
        res.setHeader(
          'Access-Control-Expose-Headers',
          'Content-Disposition, X-Freemake-Duration-Sec'
        );

        await new Promise<void>((resolve, reject) => {
          const stream = fs.createReadStream(outputPath);
          stream.on('error', reject);
          res.on('finish', resolve);
          stream.pipe(res);
        });
      } catch (err: any) {
        console.error('[Freemake] Upload convert error:', err?.message || err);
        emitJobProgress(job, {
          stage: 'error',
          percent: 0,
          message: err?.message || 'ファイル変換中にエラーが発生しました',
          error: err?.message || 'ファイル変換中にエラーが発生しました',
        });
        if (!res.headersSent) {
          res.status(500).json({
            error: err?.message || 'ファイル変換中にエラーが発生しました',
          });
        }
      } finally {
        if (!keepTmpDir) {
          fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        }
      }
    }
  );
}
