import express, { Express, Request, Response } from 'express';
import { execFile, spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import type { Innertube } from 'youtubei.js';

const execFileAsync = promisify(execFile);

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export type FreemakeFormatId =
  | 'mp3_320'
  | 'mp3_192'
  | 'mp3_128'
  | 'm4a_256'
  | 'flac'
  | 'wav'
  | 'ogg'
  | 'mp4';

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
    label: 'MP4 動画 / MV',
    ext: 'mp4',
    mimeType: 'video/mp4',
    isVideo: true,
    bitrateLabel: 'H.264 + AAC',
    ffmpegArgs: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'],
  },
};

export interface FreemakeEqPayload {
  enabled?: boolean;
  gains?: number[];
  bassBoost?: number;
  normalize?: boolean;
}

export function buildFfmpegEqFilter(eq?: FreemakeEqPayload | null): string | null {
  if (!eq || eq.enabled === false) return null;

  const filters: string[] = [];
  const bassBoost = Math.max(0, Math.min(12, Number(eq.bassBoost) || 0));
  let hasPositiveGain = bassBoost > 0;

  if (bassBoost >= 0.2) {
    filters.push(`lowshelf=f=65:g=${bassBoost.toFixed(1)}`);
  }

  const gains = Array.isArray(eq.gains) ? eq.gains : [];
  EQ_FREQUENCIES.forEach((freq, idx) => {
    const raw = Number(gains[idx]) || 0;
    const clamped = Math.max(-12, Math.min(12, raw));
    if (Math.abs(clamped) >= 0.2) {
      if (clamped > 0) hasPositiveGain = true;
      filters.push(`equalizer=f=${freq}:t=q:w=1.4:g=${clamped.toFixed(1)}`);
    }
  });

  if (eq.normalize) {
    filters.push('dynaudnorm=f=150:g=15:p=0.92');
    hasPositiveGain = true;
  }

  if (filters.length === 0) return null;

  if (hasPositiveGain) {
    filters.push('alimiter=limit=0.96');
  }

  return filters.join(',');
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
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace(/^\//, '').slice(0, 11);
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    const v = u.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
    const embedMatch = u.pathname.match(/\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})/);
    if (embedMatch?.[1]) return embedMatch[1];
  } catch {}
  return null;
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

function cleanSearchTitle(title: string): string {
  return title
    .replace(/[\[【（(][^\]】）)]*(official|music\s*video|lyric\s*video|audio|mv|hd|4k|公式|歌詞|hi-?res|flac|无损|中字)[^\]】）)]*[\]】）)]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
    /(\bcover\b|\bacapella\b|\barrange\b|歌ってみた|弾いてみた|叩いてみた|翻唱|声真似|アカペラ|唱见|歌枠|the\s*first\s*take|vtuber|にじさんじ|nijisanji|ホロライブ|hololive|原唱[:：])/i.test(
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
  // Known technical/subtitle/quality/official release tags only (NOT cover artist names)
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
    .replace(/【([^】]*)】/g, replaceBracket);

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
  // Also remove raw targetArtist (with spaces/punctuation)
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

  // Reject short clips/previews (< 45s) and long unsplit compilations (> 16m unless requested track is long)
  if (durationSec > 0 && durationSec < 45) return -999;
  const maxAllowedSec = expectedDurationSec > 900 ? expectedDurationSec + 180 : 960;
  if (durationSec > maxAllowedSec) return -999;

  const intent = detectTargetIntent(targetTitle);
  const fullContextText = `${candidateTitle} ${candidateAuthor}`;
  if (hasDisallowedVariantMarker(fullContextText, intent)) {
    return -999;
  }

  // Strictly enforce duration closeness when expected studio duration is known
  if (expectedDurationSec > 45 && durationSec > 0) {
    const minAcceptable = expectedDurationSec - Math.max(15, Math.round(expectedDurationSec * 0.12));
    const maxAcceptable = expectedDurationSec + Math.max(35, Math.round(expectedDurationSec * 0.25));
    if (durationSec < minAcceptable || durationSec > maxAcceptable) {
      return -999;
    }
  }

  // Strictly require artist match when targetArtist is provided
  const artistHaystack = `${candidateTitle} ${candidateAuthor} ${collectionTitle}`;
  const artistMatched = checkArtistMatch(artistHaystack, targetArtist);
  if (targetArtist.trim() && !artistMatched) {
    return -999;
  }

  const normTargetTitle = normalizeMatchText(cleanSearchTitle(targetTitle) || targetTitle);
  const { cleaned: strippedCandTitle, hasUnknownBracketTag } = stripParenthesesIfPlainTarget(
    candidateTitle,
    targetTitle,
    targetArtist
  );
  const normStrippedCand = normalizeMatchText(strippedCandTitle);
  const normCoreCand = extractCoreSongTitle(candidateTitle, targetTitle, targetArtist);
  const compactTarget = normTargetTitle.replace(/\s+/g, '');
  const compactCore = normCoreCand.replace(/\s+/g, '');

  let score = 0;

  if (normTargetTitle) {
    if (normCoreCand === normTargetTitle || compactCore === compactTarget) {
      // Exact core title match (e.g. "Editorial - Official髭男dism" -> "editorial")
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
        // Likely an event/compilation/unrelated title mentioning the album/track name
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

  // Unknown bracket tag (often a cover artist like 【犬山玉姬】 or 【まふまふ】)
  if (hasUnknownBracketTag) {
    score -= 40;
  }

  if (artistMatched && targetArtist.trim()) {
    score += 30;
  }

  // Duration closeness bonus
  if (expectedDurationSec > 45 && durationSec > 0) {
    const absDiff = Math.abs(durationSec - expectedDurationSec);
    if (absDiff <= 6) score += 50;
    else if (absDiff <= 14) score += 32;
    else if (absDiff <= 25) score += 12;
    else score -= 20;
  } else if (durationSec >= 100 && durationSec <= 420) {
    score += 10;
  }

  // Official / Hi-Res / Original markers
  if (/official|music\s*video|\bmv\b|hi-?res|flac|完整版|高音质|原曲|公式|full|无损/i.test(candidateTitle)) {
    score += 12;
  }

  // Popularity tie-breaker
  if (playCount > 0) {
    score += Math.min(18, Math.log10(playCount + 1) * 3);
  }

  return score;
}

const MIN_CANDIDATE_SCORE = 75;

async function resolveMetadataForTrack(params: {
  videoId?: string | null;
  title?: string;
  artist?: string;
  duration?: string;
  durationSeconds?: number;
  getInnertube?: () => Promise<Innertube>;
}): Promise<{
  title: string;
  artist: string;
  expectedDurationSec: number;
  officialPreviewUrl?: string;
  officialPreviewSource?: string;
}> {
  let title = String(params.title || '').trim();
  let artist = String(params.artist || '').trim();
  let expectedDurationSec =
    Number(params.durationSeconds) || parseDurationTextToSec(params.duration) || 0;

  if (params.videoId && (!title || !artist)) {
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
      }
    } catch {}
  }

  // If duration is still unknown and we have a YouTube videoId, try lightweight search metadata lookup
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

  let officialPreviewUrl: string | undefined;
  let officialPreviewSource: string | undefined;

  const q = [cleanSearchTitle(title), artist].filter(Boolean).join(' ').trim();
  if (q) {
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&country=JP&media=music&limit=8`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (res.ok) {
        const data = (await res.json()) as any;
        const intent = detectTargetIntent(title);
        const normTargetTitle = normalizeMatchText(cleanSearchTitle(title) || title);
        const compactTargetTitle = normTargetTitle.replace(/\s+/g, '');

        const scoredHits = (data?.results || [])
          .filter((r: any) => typeof r?.previewUrl === 'string' && r.previewUrl)
          .map((r: any) => {
            const rTitle = String(r.trackName || '');
            const rArtist = String(r.artistName || '');
            const rDur = Math.round(Number(r.trackTimeMillis || 0) / 1000);
            if (hasDisallowedVariantMarker(rTitle, intent)) return { r, score: -999 };
            if (artist && !checkArtistMatch(rArtist, artist)) return { r, score: -999 };

            const normRTitle = normalizeMatchText(cleanSearchTitle(rTitle) || rTitle);
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
        }
      }
    } catch {}
  }

  return {
    title,
    artist,
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
  const cleanTitle = cleanSearchTitle(title) || title;
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
      // Potentially a multi-part album / discography collection (e.g. "【无损音乐】...歌曲合集")
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

  // Inspect top 4 multi-part album/discography collections for an exact track page match
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
    return { ok: true, totalSize };
  } catch {
    return { ok: false, totalSize: 0 };
  }
}

async function resolveBilibiliStreamForCandidate(
  candidate: BiliCandidate,
  wantsVideo: boolean
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
    if (!cid) return null;

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
        const audioStreams = Array.isArray(dashJson?.data?.dash?.audio)
          ? [...dashJson.data.dash.audio].sort(
              (a: any, b: any) => (b.bandwidth || 0) - (a.bandwidth || 0)
            )
          : [];
        for (const stream of audioStreams.slice(0, 2)) {
          const urls = prioritizeAkamaiUrls([
            stream.baseUrl,
            stream.base_url,
            ...(stream.backupUrl || []),
            ...(stream.backup_url || []),
          ]);
          for (const u of urls) {
            const probe = await probeRemoteStream(u, streamHeaders);
            if (probe.ok) return u;
          }
        }
      } catch {}
      return null;
    };

    if (wantsVideo) {
      // Try 720p single-container MP4 first if <= 36MB, else prefer faster 480p (qn=32), then oversized qn=64, then DASH audio
      const qn64 = await tryDurlQuality(64);
      if (qn64 && (qn64.size === 0 || qn64.size <= 36 * 1024 * 1024)) {
        return {
          url: qn64.url,
          headers: streamHeaders,
          durationSec: realDuration,
          title: candidate.title,
          hasVideo: true,
        };
      }

      const qn32 = await tryDurlQuality(32);
      if (qn32) {
        return {
          url: qn32.url,
          headers: streamHeaders,
          durationSec: realDuration,
          title: candidate.title,
          hasVideo: true,
        };
      }

      if (qn64) {
        return {
          url: qn64.url,
          headers: streamHeaders,
          durationSec: realDuration,
          title: candidate.title,
          hasVideo: true,
        };
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
      if (qn32) {
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

interface ScCandidate {
  id: number;
  title: string;
  author: string;
  durationSec: number;
  transcodingUrl: string;
  protocol: string;
  score: number;
}

async function searchSoundCloudCandidates(
  title: string,
  artist: string,
  expectedDurationSec: number
): Promise<ScCandidate[]> {
  const cleanTitle = cleanSearchTitle(title) || title;
  const keyword = [artist, cleanTitle].filter(Boolean).join(' ').trim();
  if (!keyword) return [];

  let clientId = await getSoundCloudClientId(false);
  if (!clientId) return [];

  const doSearch = async (cid: string) => {
    const url = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(
      keyword
    )}&client_id=${encodeURIComponent(cid)}&limit=10`;
    return fetch(url, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(5000),
    });
  };

  let res = await doSearch(clientId);
  if (res.status === 401 || res.status === 403) {
    clientId = await getSoundCloudClientId(true);
    if (!clientId) return [];
    res = await doSearch(clientId);
  }
  if (!res.ok) return [];

  const data = (await res.json()) as any;
  const items = Array.isArray(data?.collection) ? data.collection : [];
  const results: ScCandidate[] = [];

  for (const t of items) {
    if (!t || t.policy === 'BLOCK') continue;
    const durSec = Math.round((Number(t.duration) || 0) / 1000);
    const transcodings: any[] = Array.isArray(t.media?.transcodings) ? t.media.transcodings : [];
    const usable = transcodings.filter((tr) => tr?.url && !tr.snipped);
    if (usable.length === 0) continue;

    // Prefer progressive direct MP3 over HLS, else HLS AAC/MP3
    const chosen =
      usable.find((tr) => tr.format?.protocol === 'progressive') ||
      usable.find((tr) => tr.format?.mime_type?.includes('mp4')) ||
      usable[0];

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
        transcodingUrl: chosen.url,
        protocol: chosen.format?.protocol || 'hls',
        score,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

async function resolveSoundCloudStreamForCandidate(cand: ScCandidate): Promise<{
  url: string;
  protocol: string;
  durationSec: number;
  title: string;
} | null> {
  const clientId = await getSoundCloudClientId(false);
  if (!clientId) return null;
  try {
    const sep = cand.transcodingUrl.includes('?') ? '&' : '?';
    const res = await fetch(`${cand.transcodingUrl}${sep}client_id=${encodeURIComponent(clientId)}`, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    if (typeof data?.url === 'string' && data.url) {
      return {
        url: data.url,
        protocol: cand.protocol,
        durationSec: cand.durationSec,
        title: cand.title,
      };
    }
  } catch {}
  return null;
}

// ---------- YouTube Direct / Cobalt Resolver ----------

async function resolveYouTubeDirectStream(
  videoId: string,
  wantsVideo: boolean,
  getInnertube: () => Promise<Innertube>,
  opts?: {
    youtubeCookie?: string;
    poToken?: string;
    cobaltApiUrl?: string;
  }
): Promise<
  | {
      url: string;
      headers?: Record<string, string>;
      sourceKind: 'youtube-direct' | 'cobalt';
      sourceLabel: string;
    }
  | { error: string }
> {
  const cookie = (opts?.youtubeCookie || process.env.YOUTUBE_COOKIE || '').trim();
  const poToken = (opts?.poToken || process.env.YOUTUBE_PO_TOKEN || '').trim();
  const cobaltUrl = (opts?.cobaltApiUrl || process.env.COBALT_API_URL || '').trim();

  if (cobaltUrl) {
    try {
      const endpoint = cobaltUrl.replace(/\/+$/, '');
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
          videoQuality: '720',
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) {
        const data = (await r.json()) as any;
        if (data?.url && typeof data.url === 'string') {
          return {
            url: data.url,
            sourceKind: 'cobalt',
            sourceLabel: 'Cobalt YouTube フルストリーム',
          };
        }
      }
    } catch {}
  }

  const clients: Array<{
    name: string;
    client: Record<string, any>;
    ua: string;
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
  for (const c of clients) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': c.ua,
      };
      if (cookie) headers.Cookie = cookie;

      const body: Record<string, any> = {
        context: { client: c.client },
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

      const adaptive = Array.isArray(json?.streamingData?.adaptiveFormats)
        ? json.streamingData.adaptiveFormats
        : [];
      const combined = Array.isArray(json?.streamingData?.formats)
        ? json.streamingData.formats
        : [];

      const candidates = wantsVideo
        ? [...combined, ...adaptive].filter(
            (f: any) => typeof f?.url === 'string' && f.mimeType?.startsWith('video/mp4')
          )
        : adaptive
            .filter((f: any) => typeof f?.url === 'string' && f.mimeType?.startsWith('audio/'))
            .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));

      const picked = candidates[0] || combined.find((f: any) => typeof f?.url === 'string');
      if (picked?.url) {
        return {
          url: picked.url,
          headers: cookie ? { Cookie: cookie, 'User-Agent': c.ua } : { 'User-Agent': c.ua },
          sourceKind: 'youtube-direct',
          sourceLabel: `YouTube 直接フルストリーム (${c.name})`,
        };
      }
    } catch (e: any) {
      lastReason = e?.message || lastReason;
    }
  }

  // Only invoke youtubei.js decipher if Cookie/PO token present (otherwise skip straight to fast full-track fallback)
  if (cookie || poToken) {
    try {
      const yt = await getInnertube();
      const info = await yt.getBasicInfo(videoId);
      const adaptive = info?.streaming_data?.adaptive_formats || [];
      const formats = info?.streaming_data?.formats || [];
      const list = wantsVideo
        ? [...formats, ...adaptive].filter((f: any) => f.mime_type?.includes('mp4'))
        : adaptive.filter((f: any) => f.mime_type?.startsWith('audio/'));
      if (list.length > 0) {
        const deciphered = await list[0].decipher(yt.session.player);
        if (deciphered) {
          return {
            url: deciphered,
            sourceKind: 'youtube-direct',
            sourceLabel: 'YouTube InnerTube フルストリーム',
          };
        }
      }
    } catch {}
  }

  return {
    error: lastReason || 'YouTube直接ストリームが制限されています',
  };
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
  eqApplied?: boolean;
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
  hasAudio: boolean;
}> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration:stream=codec_type,codec_name',
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
      hasAudio: Boolean(audioStream),
    };
  } catch {
    return { durationSec: 0, hasVideo: false, videoCodec: null, hasAudio: true };
  }
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
  outputPath: string;
  format: FreemakeFormatSpec;
  eq?: FreemakeEqPayload | null;
  title?: string;
  artist?: string;
  album?: string;
  isAudioOnlyInput?: boolean;
  inputVideoCodec?: string | null;
  expectedDurationSec?: number;
  onProgress?: (info: { processedSec: number; durationSec: number; ratio: number }) => void;
}): Promise<void> {
  const {
    inputSource,
    inputHeaders,
    outputPath,
    format,
    eq,
    title,
    artist,
    album,
    isAudioOnlyInput,
    inputVideoCodec,
    expectedDurationSec = 0,
    onProgress,
  } = options;

  const buildArgs = (videoStrategy: 'copy' | 'ultrafast' | 'still' | 'formatDefault') => {
    const args: string[] = ['-y', '-progress', 'pipe:1', '-nostats'];
    if (inputSource.startsWith('http') && inputHeaders && Object.keys(inputHeaders).length > 0) {
      const hdrLines = Object.entries(inputHeaders)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\r\n');
      args.push('-headers', `${hdrLines}\r\n`);
    }
    args.push('-i', inputSource);

    if (format.isVideo && isAudioOnlyInput) {
      // Fast 1fps dark canvas so audio-only -> MP4 encodes in ~2-3s and stays lightweight
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

    const eqFilter = buildFfmpegEqFilter(eq);
    if (eqFilter) {
      args.push('-af', eqFilter);
    }

    if (format.isVideo) {
      if (videoStrategy === 'copy') {
        args.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart');
      } else if (videoStrategy === 'still') {
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
          '192k',
          '-movflags',
          '+faststart'
        );
      } else if (videoStrategy === 'ultrafast') {
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
          '192k',
          '-movflags',
          '+faststart'
        );
      } else {
        args.push(...format.ffmpegArgs);
      }
    } else {
      args.push(...format.ffmpegArgs);
    }

    if (title) args.push('-metadata', `title=${title}`);
    if (artist) args.push('-metadata', `artist=${artist}`);
    if (album) args.push('-metadata', `album=${album}`);
    args.push('-metadata', 'comment=Converted by Zero Music x Freemake Audio Engine');
    args.push(outputPath);
    return args;
  };

  if (format.isVideo) {
    if (isAudioOnlyInput) {
      await spawnFfmpegWithProgress(buildArgs('still'), expectedDurationSec, onProgress);
      return;
    }
    if (inputVideoCodec === 'h264') {
      try {
        await spawnFfmpegWithProgress(buildArgs('copy'), expectedDurationSec, onProgress);
        return;
      } catch {
        // Fallback to fast re-encode if stream copy fails on non-standard container
      }
    }
    await spawnFfmpegWithProgress(buildArgs('ultrafast'), expectedDurationSec, onProgress);
    return;
  }

  await spawnFfmpegWithProgress(buildArgs('formatDefault'), expectedDurationSec, onProgress);
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

interface DownloadPipelineResult {
  tmpDir: string;
  outputPath: string;
  outputFilename: string;
  mimeType: string;
  sizeBytes: number;
  sourceKind: string;
  sourceLabel: string;
  durationSec: number;
  eqApplied: boolean;
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
      duration = '',
      durationSeconds = 0,
      format: rawFormat = 'mp3_320',
      eq,
      youtubeCookie,
      poToken,
      cobaltApiUrl,
      allowPreviewFallback = true,
    } = body || {};

    const format = FREEMAKE_FORMATS[rawFormat as FreemakeFormatId] || FREEMAKE_FORMATS.mp3_320;
    const videoId = extractYouTubeVideoId(String(rawUrl || rawId || ''));

    emitJobProgress(job, {
      stage: 'resolving',
      percent: 6,
      stagePercent: 25,
      message: '楽曲メタデータと再生時間を確認中...',
    });

    const meta = await resolveMetadataForTrack({
      videoId,
      title: String(title || ''),
      artist: String(artist || ''),
      duration: String(duration || ''),
      durationSeconds: Number(durationSeconds) || 0,
      getInnertube,
    });

    let inputSource = path.join(tmpDir, 'input.media');
    let inputHeaders: Record<string, string> | undefined;
    let sourceKind:
      | 'youtube-direct'
      | 'cobalt'
      | 'bilibili-full'
      | 'soundcloud-full'
      | 'official-preview-30s' = 'youtube-direct';
    let sourceLabel = '';
    let isAudioOnlyInput = true;
    let resolvedDurationSec = meta.expectedDurationSec || 0;
    const resolvedTitle = meta.title || String(title || '').trim();
    const resolvedArtist = meta.artist || String(artist || '').trim();

    let resolved = false;

    // Strategy A: Direct YouTube / Cobalt (exact videoId)
    if (videoId) {
      emitJobProgress(job, {
        stage: 'searching',
        percent: 14,
        stagePercent: 30,
        message: 'YouTube 直接ストリームを確認中...',
      });
      const directResult = await resolveYouTubeDirectStream(
        videoId,
        format.isVideo,
        getInnertube,
        { youtubeCookie, poToken, cobaltApiUrl }
      );
      if ('url' in directResult) {
        try {
          emitJobProgress(job, {
            stage: 'fetching',
            percent: 25,
            stagePercent: 0,
            sourceKind: directResult.sourceKind,
            sourceLabel: directResult.sourceLabel,
            message: `${directResult.sourceLabel} から音声を取得中...`,
          });
          const downloaded = await downloadUrlToFile(
            directResult.url,
            inputSource,
            directResult.headers,
            (receivedBytes, totalBytes) => {
              const ratio = totalBytes > 0 ? Math.min(1, receivedBytes / totalBytes) : 0.4;
              emitJobProgress(job, {
                stage: 'fetching',
                percent: 25 + ratio * 33,
                stagePercent: Math.round(ratio * 100),
                receivedBytes,
                totalBytes,
                sourceKind: directResult.sourceKind,
                sourceLabel: directResult.sourceLabel,
                message: `音声データをダウンロード中...`,
              });
            }
          );
          sourceKind = directResult.sourceKind;
          sourceLabel = directResult.sourceLabel;
          isAudioOnlyInput = !downloaded.contentType.includes('video') && !format.isVideo;
          resolved = true;
        } catch {}
      }
    }

    // Strategy B: Multi-Engine FULL-TRACK Pipeline (Bilibili Akamai + SoundCloud Full)
    if (!resolved && (resolvedTitle || resolvedArtist)) {
      emitJobProgress(job, {
        stage: 'searching',
        percent: 18,
        stagePercent: 60,
        message: 'フル尺音源エンジンを検索・照合中...',
      });
      const [biliCandidatesRes, scCandidatesRes] = await Promise.allSettled([
        searchBilibiliCandidates(resolvedTitle, resolvedArtist, meta.expectedDurationSec),
        searchSoundCloudCandidates(resolvedTitle, resolvedArtist, meta.expectedDurationSec),
      ]);

      const biliCandidates =
        biliCandidatesRes.status === 'fulfilled' ? biliCandidatesRes.value : [];
      const scCandidates =
        scCandidatesRes.status === 'fulfilled' ? scCandidatesRes.value : [];

      const topBiliScore = biliCandidates[0]?.score ?? -999;
      const topScScore = scCandidates[0]?.score ?? -999;

      const tryBilibili = async () => {
        for (const cand of biliCandidates.slice(0, 3)) {
          const stream = await resolveBilibiliStreamForCandidate(cand, format.isVideo);
          if (!stream) continue;
          const label = `フル音源 (${formatSecLabel(stream.durationSec || resolvedDurationSec) || 'Full'})`;
          try {
            emitJobProgress(job, {
              stage: 'fetching',
              percent: 25,
              stagePercent: 0,
              sourceKind: 'bilibili-full',
              sourceLabel: label,
              message: `${label} を取得中...`,
            });
            const dl = await downloadUrlToFile(
              stream.url,
              inputSource,
              stream.headers,
              (receivedBytes, totalBytes) => {
                const ratio = totalBytes > 0 ? Math.min(1, receivedBytes / totalBytes) : 0.4;
                emitJobProgress(job, {
                  stage: 'fetching',
                  percent: 25 + ratio * 33,
                  stagePercent: Math.round(ratio * 100),
                  receivedBytes,
                  totalBytes,
                  sourceKind: 'bilibili-full',
                  sourceLabel: label,
                  message: `フル音源データを取得中...`,
                });
              }
            );
            sourceKind = 'bilibili-full';
            resolvedDurationSec = stream.durationSec || resolvedDurationSec;
            sourceLabel = `フル音源 (${formatSecLabel(resolvedDurationSec) || 'Full'})`;
            isAudioOnlyInput = !dl.contentType.includes('video') && !format.isVideo;
            return true;
          } catch {}
        }
        return false;
      };

      const trySoundCloud = async () => {
        for (const cand of scCandidates.slice(0, 3)) {
          const stream = await resolveSoundCloudStreamForCandidate(cand);
          if (!stream) continue;
          const label = `SoundCloud フル音源 (${formatSecLabel(stream.durationSec || resolvedDurationSec) || 'Full'})`;
          if (stream.protocol === 'hls' || stream.url.includes('.m3u8')) {
            inputSource = stream.url;
            inputHeaders = { 'User-Agent': BROWSER_UA };
            sourceKind = 'soundcloud-full';
            resolvedDurationSec = stream.durationSec || resolvedDurationSec;
            sourceLabel = label;
            isAudioOnlyInput = true;
            emitJobProgress(job, {
              stage: 'fetching',
              percent: 55,
              stagePercent: 100,
              sourceKind: 'soundcloud-full',
              sourceLabel: label,
              message: `SoundCloud ストリーム接続完了 — 変換準備中...`,
            });
            return true;
          } else {
            try {
              emitJobProgress(job, {
                stage: 'fetching',
                percent: 25,
                stagePercent: 0,
                sourceKind: 'soundcloud-full',
                sourceLabel: label,
                message: `${label} を取得中...`,
              });
              await downloadUrlToFile(
                stream.url,
                inputSource,
                { 'User-Agent': BROWSER_UA },
                (receivedBytes, totalBytes) => {
                  const ratio = totalBytes > 0 ? Math.min(1, receivedBytes / totalBytes) : 0.4;
                  emitJobProgress(job, {
                    stage: 'fetching',
                    percent: 25 + ratio * 33,
                    stagePercent: Math.round(ratio * 100),
                    receivedBytes,
                    totalBytes,
                    sourceKind: 'soundcloud-full',
                    sourceLabel: label,
                    message: `SoundCloud フル音源を取得中...`,
                  });
                }
              );
              sourceKind = 'soundcloud-full';
              resolvedDurationSec = stream.durationSec || resolvedDurationSec;
              sourceLabel = label;
              isAudioOnlyInput = true;
              return true;
            } catch {}
          }
        }
        return false;
      };

      if (format.isVideo || topBiliScore >= topScScore) {
        resolved = await tryBilibili();
        if (!resolved) {
          resolved = await trySoundCloud();
        }
      } else {
        resolved = await trySoundCloud();
        if (!resolved) {
          resolved = await tryBilibili();
        }
      }
    }

    // Strategy C: Last-resort 30s official preview fallback ONLY if both full-track engines failed
    if (!resolved) {
      if (!allowPreviewFallback || !meta.officialPreviewUrl) {
        const err = new Error(
          'フル尺音源の取得に失敗しました。詳細設定からYouTube Cookie / Cobalt API URLを指定するか、別のキーワードでお試しください。'
        ) as Error & { statusCode?: number; requiresCookieOrCobalt?: boolean };
        err.statusCode = 422;
        err.requiresCookieOrCobalt = true;
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
      await downloadUrlToFile(
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
      sourceKind = 'official-preview-30s';
      sourceLabel = meta.officialPreviewSource || 'Apple iTunes 公式30秒プレビュー';
      resolvedDurationSec = 30;
      isAudioOnlyInput = true;
    }

    let inputVideoCodec: string | null = null;
    if (!inputSource.startsWith('http')) {
      const probedInput = await probeMediaFile(inputSource);
      isAudioOnlyInput = !probedInput.hasVideo;
      inputVideoCodec = probedInput.videoCodec;
      if (probedInput.durationSec > 0 && sourceKind !== 'official-preview-30s') {
        resolvedDurationSec = probedInput.durationSec;
      }
    } else {
      isAudioOnlyInput = true;
    }

    const safeBase = sanitizeFilenameBase(
      resolvedArtist && resolvedTitle
        ? `${resolvedArtist} - ${resolvedTitle}`
        : resolvedTitle || videoId || 'track'
    );
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
      message: `FFmpeg で .${format.ext.toUpperCase()} へ変換中...`,
    });

    await runFfmpegConvert({
      inputSource,
      inputHeaders,
      outputPath,
      format,
      eq,
      title: resolvedTitle || safeBase,
      artist: resolvedArtist,
      album: String(album || ''),
      isAudioOnlyInput,
      inputVideoCodec,
      expectedDurationSec: resolvedDurationSec,
      onProgress: ({ processedSec, durationSec, ratio }) => {
        emitJobProgress(job, {
          stage: 'converting',
          percent: 58 + ratio * 32,
          stagePercent: Math.round(ratio * 100),
          processedSec,
          durationSec: durationSec || resolvedDurationSec || undefined,
          message: `FFmpeg で .${format.ext.toUpperCase()} へ変換・EQ適用中...`,
        });
      },
    });

    const outStat = await fs.promises.stat(outputPath);
    const probedOut = await probeMediaFile(outputPath);
    if (probedOut.durationSec > 0) {
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
      eqApplied: Boolean(buildFfmpegEqFilter(eq)),
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
  res.setHeader('X-Freemake-Eq-Applied', result.eqApplied ? '1' : '0');
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Accept-Ranges, Content-Range, Content-Length, Content-Disposition, X-Freemake-Source-Kind, X-Freemake-Source-Label, X-Freemake-Duration-Sec, X-Freemake-Eq-Applied'
  );
}

// ---------- Express Route Registration ----------

export function registerFreemakeRoutes(
  app: Express,
  getInnertube: () => Promise<Innertube>
) {
  // 1. Freemake Engine capabilities & formats
  app.get('/api/freemake/formats', async (_req: Request, res: Response) => {
    let ffmpegAvailable = false;
    let ffmpegVersion = '';
    try {
      const { stdout } = await execFileAsync('ffmpeg', ['-version']);
      ffmpegAvailable = true;
      ffmpegVersion = stdout.split('\n')[0]?.trim() || 'ffmpeg available';
    } catch {}

    res.json({
      engine: 'Freemake Audio & Video Engine (FFmpeg Powered)',
      ffmpegAvailable,
      ffmpegVersion,
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

  // 2. Probe available FULL-TRACK download sources for a track/URL
  app.get('/api/freemake/probe', async (req: Request, res: Response) => {
    const rawIdOrUrl = String(req.query.videoId || req.query.url || '').trim();
    const rawTitle = String(req.query.title || '').trim();
    const rawArtist = String(req.query.artist || '').trim();
    const rawDuration = String(req.query.duration || '').trim();
    const rawDurSec = Number(req.query.durationSeconds) || 0;
    const videoId = extractYouTubeVideoId(rawIdOrUrl);

    const meta = await resolveMetadataForTrack({
      videoId,
      title: rawTitle,
      artist: rawArtist,
      duration: rawDuration,
      durationSeconds: rawDurSec,
      getInnertube,
    });

    const [biliRes, scRes] = await Promise.allSettled([
      searchBilibiliCandidates(meta.title, meta.artist, meta.expectedDurationSec),
      searchSoundCloudCandidates(meta.title, meta.artist, meta.expectedDurationSec),
    ]);

    const topBili = biliRes.status === 'fulfilled' ? biliRes.value[0] : undefined;
    const topSc = scRes.status === 'fulfilled' ? scRes.value[0] : undefined;

    let bestEngine: string | null = null;
    let bestTitle: string | null = null;
    let bestDurSec: number | null = null;

    if (topBili && (!topSc || topBili.score >= topSc.score)) {
      bestEngine = `フル音源エンジン (Bilibili / ${formatSecLabel(topBili.durationSec) || 'Full'})`;
      bestTitle = topBili.title;
      bestDurSec = topBili.durationSec;
    } else if (topSc) {
      bestEngine = `フル音源エンジン (SoundCloud / ${formatSecLabel(topSc.durationSec) || 'Full'})`;
      bestTitle = topSc.title;
      bestDurSec = topSc.durationSec;
    }

    res.json({
      videoId,
      fullTrackAvailable: Boolean(bestEngine || process.env.YOUTUBE_COOKIE || process.env.COBALT_API_URL),
      fullTrackSource: bestEngine,
      fullTrackTitle: bestTitle,
      fullTrackDurationSec: bestDurSec,
      officialPreviewAvailable: Boolean(meta.officialPreviewUrl),
      officialPreviewSource: meta.officialPreviewSource || null,
      hasServerCookie: Boolean(process.env.YOUTUBE_COOKIE),
      hasCobaltServer: Boolean(process.env.COBALT_API_URL),
    });
  });

  // 3a. Start Async Download + Convert Job (supports real-time progress)
  app.post('/api/freemake/download/start', (req: Request, res: Response) => {
    const job = createFreemakeJob();
    res.status(202).json({ jobId: job.progress.jobId });

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
        job.eqApplied = result.eqApplied;

        emitJobProgress(job, {
          stage: 'ready',
          percent: 90,
          stagePercent: 100,
          totalBytes: result.sizeBytes,
          receivedBytes: result.sizeBytes,
          sourceKind: result.sourceKind,
          sourceLabel: result.sourceLabel,
          filename: result.outputFilename,
          message: '変換完了 — 端末へダウンロード中...',
        });
        scheduleJobCleanup(job.progress.jobId, 5 * 60 * 1000);
      })
      .catch((err: any) => {
        console.error('[Freemake] Async download/convert error:', err?.message || err);
        emitJobProgress(job, {
          stage: 'error',
          percent: 0,
          message: err?.message || 'ダウンロードに失敗しました',
          error: err?.message || 'Freemakeダウンロード変換中にエラーが発生しました',
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

  // 3d. Stream completed job output file with full HTTP Range (206) support for >32MB WAV/FLAC/MP4
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
        eqApplied: Boolean(job.eqApplied),
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

  // 3e. Synchronous Download & Convert FULL Track / URL (Backwards Compatible)
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
      console.error('[Freemake] Download/convert error:', err?.message || err);
      if (!res.headersSent) {
        const status = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        res.status(status).json({
          error: err?.message || 'Freemakeダウンロード変換中にエラーが発生しました',
          ...(err?.requiresCookieOrCobalt ? { requiresCookieOrCobalt: true } : {}),
        });
      }
    } finally {
      if (result?.tmpDir) {
        fs.promises.rm(result.tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  });

  // 4. Local Audio/Video File Conversion + Freemake EQ Baking (Raw binary upload)
  app.post(
    '/api/freemake/convert-upload',
    express.raw({ type: '*/*', limit: '64mb' }),
    async (req: Request, res: Response) => {
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
        const eqJson = req.query.eq ? String(req.query.eq) : '';
        let eq: FreemakeEqPayload | null = null;
        if (eqJson) {
          try {
            eq = JSON.parse(eqJson);
          } catch {}
        }

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
          eq,
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
              message: `FFmpeg で .${format.ext.toUpperCase()} へ変換・EQ焼き込み中...`,
            });
          },
        });

        const outStat = await fs.promises.stat(outputPath);
        const probedOut = await probeMediaFile(outputPath);
        const resolvedDurationSec = probedOut.durationSec || probedInput.durationSec || 0;
        const eqApplied = Boolean(buildFfmpegEqFilter(eq));
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
          activeJob.sourceLabel = 'ローカル変換 (FFmpeg + Freemake EQ)';
          activeJob.durationSec = resolvedDurationSec;
          activeJob.eqApplied = eqApplied;
          keepTmpDir = true;

          emitJobProgress(activeJob, {
            stage: 'ready',
            percent: 90,
            stagePercent: 100,
            totalBytes: outStat.size,
            receivedBytes: outStat.size,
            durationSec: resolvedDurationSec || undefined,
            sourceKind: 'local-convert',
            sourceLabel: 'ローカル変換 (FFmpeg + Freemake EQ)',
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
            eqApplied,
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
        res.setHeader('X-Freemake-Eq-Applied', eqApplied ? '1' : '0');
        res.setHeader(
          'Access-Control-Expose-Headers',
          'Content-Disposition, X-Freemake-Duration-Sec, X-Freemake-Eq-Applied'
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
