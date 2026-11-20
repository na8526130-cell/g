import express, { Express, Request, Response } from 'express';
import { execFile, spawn } from 'child_process';
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
    .replace(/[\[【（(][^\]】）)]*(official|music\s*video|lyric\s*video|audio|mv|hd|4k|公式|歌詞)[^\]】）)]*[\]】）)]/gi, ' ')
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

const UNWANTED_VARIANT_KEYWORDS = [
  'off vocal',
  'offvocal',
  'on/off vocal',
  'instrumental',
  'インスト',
  'カラオケ',
  'ニコカラ',
  '伴奏',
  '纯伴奏',
  '消音',
  'drum cover',
  '鼓谱',
  'bass tab',
  'tab谱',
  '曲谱',
  '吉他',
  '弾いてみた',
  '歌ってみた',
  '翻唱',
  'cover',
  'nightcore',
  'slowed',
  'sped up',
  '8d audio',
  'リアクション',
  'reaction',
  '解説',
  '考察',
  'teaser',
  '予告',
  '1時間',
  '作業用',
  'bgm耐久',
  'remix',
  'リアレンジ',
  '替え歌',
  'mad',
  'shorts',
  '切り抜き',
  '模唱',
  '练习用',
  '教你唱',
  '教学',
  '教程',
  '弾唱',
  '叩いてみた',
  'ピアノ',
  'にじさんじ',
  'nijisanji',
  'ホロライブ',
  'hololive',
  'vtuber',
  '唱见',
  '歌枠',
  'the first take',
  '声真似',
];

function scoreCandidateTrack(params: {
  candidateTitle: string;
  candidateAuthor?: string;
  durationSec: number;
  playCount?: number;
  targetTitle: string;
  targetArtist: string;
  expectedDurationSec?: number;
}): number {
  const {
    candidateTitle,
    candidateAuthor = '',
    durationSec,
    playCount = 0,
    targetTitle,
    targetArtist,
    expectedDurationSec = 0,
  } = params;

  // Reject short previews/clips (< 45s) and overly long compilations (> 20m unless requested track is long)
  if (durationSec > 0 && durationSec < 45) return -999;
  const maxAllowedSec = expectedDurationSec > 900 ? expectedDurationSec + 180 : 960;
  if (durationSec > maxAllowedSec) return -999;

  const normCand = normalizeMatchText(`${candidateTitle} ${candidateAuthor}`);
  const normCandTitle = normalizeMatchText(candidateTitle);
  const normTargetTitle = normalizeMatchText(cleanSearchTitle(targetTitle) || targetTitle);
  const normTargetArtist = normalizeMatchText(targetArtist);

  let score = 0;

  // Check title match
  if (normTargetTitle) {
    if (normCandTitle.includes(normTargetTitle)) {
      score += 55;
    } else {
      const tokens = normTargetTitle.split(' ').filter((t) => t.length >= 2);
      if (tokens.length > 0) {
        const matched = tokens.filter((t) => normCandTitle.includes(t)).length;
        const ratio = matched / tokens.length;
        if (ratio === 0) return -500;
        score += Math.round(ratio * 42);
      }
    }
  }

  // Check artist match
  if (normTargetArtist) {
    const artistTokens = normTargetArtist.split(' ').filter((t) => t.length >= 2);
    if (normCand.includes(normTargetArtist)) {
      score += 30;
    } else if (artistTokens.some((t) => normCand.includes(t))) {
      score += 18;
    }
  }

  // Penalize unwanted variants unless the user specifically asked for them
  const rawReqLower = `${targetTitle} ${targetArtist}`.toLowerCase();
  const candLower = `${candidateTitle} ${candidateAuthor}`.toLowerCase();
  for (const kw of UNWANTED_VARIANT_KEYWORDS) {
    if (candLower.includes(kw) && !rawReqLower.includes(kw)) {
      score -= 85;
    }
  }

  // Duration closeness to true studio duration
  if (expectedDurationSec > 45 && durationSec > 0) {
    const diff = Math.abs(durationSec - expectedDurationSec);
    if (diff <= 10) score += 45;
    else if (diff <= 22) score += 28;
    else if (diff <= 45) score += 10;
    else if (diff > 90) score -= 45;
  } else if (durationSec >= 120 && durationSec <= 420) {
    // Typical full song length range
    score += 12;
  }

  // Official / Hi-Res / Original markers
  if (
    /official|music\s*video|\bmv\b|hi-res|flac|完整版|高音质|原曲|公式|full/i.test(candidateTitle)
  ) {
    score += 16;
  }

  // Popularity boost
  if (playCount > 0) {
    score += Math.min(26, Math.log10(playCount + 1) * 4);
  }

  return score;
}

async function resolveMetadataForTrack(params: {
  videoId?: string | null;
  title?: string;
  artist?: string;
  durationSeconds?: number;
}): Promise<{
  title: string;
  artist: string;
  expectedDurationSec: number;
  officialPreviewUrl?: string;
  officialPreviewSource?: string;
}> {
  let title = String(params.title || '').trim();
  let artist = String(params.artist || '').trim();
  let expectedDurationSec = Number(params.durationSeconds) || 0;

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

  let officialPreviewUrl: string | undefined;
  let officialPreviewSource: string | undefined;

  const q = [cleanSearchTitle(title), artist].filter(Boolean).join(' ').trim();
  if (q) {
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&country=JP&media=music&limit=5`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (res.ok) {
        const data = (await res.json()) as any;
        const hit = (data?.results || []).find(
          (r: any) => typeof r?.previewUrl === 'string' && r.previewUrl
        );
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
      for (const item of list.slice(0, 12)) {
        if (item?.bvid && !seen.has(item.bvid)) {
          seen.set(item.bvid, item);
        }
      }
    } catch {}
  };

  await Promise.all([runQuery(keyword, 'click'), runQuery(keyword, 'totalrank')]);

  const candidates: BiliCandidate[] = [];
  for (const item of seen.values()) {
    const rawTitle = stripHtmlTags(String(item.title || ''));
    const rawAuthor = stripHtmlTags(String(item.author || ''));
    const durSec = parseDurationTextToSec(item.duration);
    const playCount = Number(item.play) || 0;
    const score = scoreCandidateTrack({
      candidateTitle: rawTitle,
      candidateAuthor: rawAuthor,
      durationSec: durSec,
      playCount,
      targetTitle: title,
      targetArtist: artist,
      expectedDurationSec,
    });
    if (score >= 10) {
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

async function resolveBilibiliStreamForCandidate(
  candidate: BiliCandidate,
  wantsVideo: boolean
): Promise<{
  url: string;
  headers: Record<string, string>;
  durationSec: number;
  title: string;
} | null> {
  const buvid3 = await getBilibiliCookie();
  const apiHeaders: Record<string, string> = {
    'User-Agent': BROWSER_UA,
    Referer: 'https://www.bilibili.com/',
    ...(buvid3 ? { Cookie: `buvid3=${buvid3}` } : {}),
  };

  try {
    const viewRes = await fetch(
      `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(candidate.bvid)}`,
      { headers: apiHeaders, signal: AbortSignal.timeout(5000) }
    );
    if (!viewRes.ok) return null;
    const viewJson = (await viewRes.json()) as any;
    const cid = viewJson?.data?.cid;
    const realDuration = Number(viewJson?.data?.duration) || candidate.durationSec;
    if (!cid) return null;

    const streamHeaders = {
      'User-Agent': BROWSER_UA,
      Referer: 'https://www.bilibili.com/',
    };

    if (wantsVideo) {
      // Single-container MP4 (fnval=1) is fastest and includes video+audio
      const playRes = await fetch(
        `https://api.bilibili.com/x/player/playurl?bvid=${encodeURIComponent(
          candidate.bvid
        )}&cid=${cid}&fnval=1&qn=64`,
        { headers: apiHeaders, signal: AbortSignal.timeout(5000) }
      );
      if (playRes.ok) {
        const playJson = (await playRes.json()) as any;
        const durl = playJson?.data?.durl?.[0];
        const urls = prioritizeAkamaiUrls([durl?.url, ...(durl?.backup_url || [])]);
        for (const u of urls) {
          try {
            const probe = await fetch(u, {
              method: 'GET',
              headers: { ...streamHeaders, Range: 'bytes=0-1023' },
              signal: AbortSignal.timeout(4500),
            });
            if (probe.ok || probe.status === 206) {
              return {
                url: u,
                headers: streamHeaders,
                durationSec: realDuration,
                title: candidate.title,
              };
            }
          } catch {}
        }
      }
    } else {
      // High-bitrate DASH audio (fnval=16)
      const dashRes = await fetch(
        `https://api.bilibili.com/x/player/playurl?bvid=${encodeURIComponent(
          candidate.bvid
        )}&cid=${cid}&fnval=16`,
        { headers: apiHeaders, signal: AbortSignal.timeout(5000) }
      );
      if (dashRes.ok) {
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
            try {
              const probe = await fetch(u, {
                method: 'GET',
                headers: { ...streamHeaders, Range: 'bytes=0-1023' },
                signal: AbortSignal.timeout(4500),
              });
              if (probe.ok || probe.status === 206) {
                return {
                  url: u,
                  headers: streamHeaders,
                  durationSec: realDuration,
                  title: candidate.title,
                };
              }
            } catch {}
          }
        }
      }

      // Fallback to fnval=1 MP4 if DASH failed
      const mp4Res = await fetch(
        `https://api.bilibili.com/x/player/playurl?bvid=${encodeURIComponent(
          candidate.bvid
        )}&cid=${cid}&fnval=1&qn=32`,
        { headers: apiHeaders, signal: AbortSignal.timeout(5000) }
      );
      if (mp4Res.ok) {
        const mp4Json = (await mp4Res.json()) as any;
        const durl = mp4Json?.data?.durl?.[0];
        const urls = prioritizeAkamaiUrls([durl?.url, ...(durl?.backup_url || [])]);
        for (const u of urls) {
          try {
            const probe = await fetch(u, {
              method: 'GET',
              headers: { ...streamHeaders, Range: 'bytes=0-1023' },
              signal: AbortSignal.timeout(4500),
            });
            if (probe.ok || probe.status === 206) {
              return {
                url: u,
                headers: streamHeaders,
                durationSec: realDuration,
                title: candidate.title,
              };
            }
          } catch {}
        }
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

    if (score >= 10) {
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
  } = options;

  const args: string[] = ['-y'];
  if (inputSource.startsWith('http') && inputHeaders && Object.keys(inputHeaders).length > 0) {
    const hdrLines = Object.entries(inputHeaders)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\r\n');
    args.push('-headers', `${hdrLines}\r\n`);
  }
  args.push('-i', inputSource);

  // If MP4 requested on audio-only input, synthesize sleek dark canvas
  if (format.isVideo && isAudioOnlyInput) {
    args.push(
      '-f',
      'lavfi',
      '-i',
      'color=c=#09090d:s=1280x720:r=24',
      '-map',
      '1:v:0',
      '-map',
      '0:a:0',
      '-shortest'
    );
  }

  const eqFilter = buildFfmpegEqFilter(eq);
  if (eqFilter) {
    args.push('-af', eqFilter);
  }

  args.push(...format.ffmpegArgs);

  if (title) args.push('-metadata', `title=${title}`);
  if (artist) args.push('-metadata', `artist=${artist}`);
  if (album) args.push('-metadata', `album=${album}`);
  args.push('-metadata', 'comment=Converted by Zero Music x Freemake Audio Engine');

  args.push(outputPath);

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 8000) stderr = stderr.slice(-8000);
    });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-400)}`));
      }
    });
  });
}

async function downloadUrlToFile(
  url: string,
  destPath: string,
  headers?: Record<string, string>
): Promise<{ contentType: string; bytes: number }> {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': headers?.['User-Agent'] || BROWSER_UA,
      ...(headers || {}),
    },
    signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) {
    throw new Error(`Stream fetch failed with HTTP ${resp.status}`);
  }
  const arrayBuf = await resp.arrayBuffer();
  const buf = Buffer.from(arrayBuf);
  if (buf.length < 1024) {
    throw new Error('Fetched media stream was empty or truncated');
  }
  await fs.promises.writeFile(destPath, buf);
  return {
    contentType: resp.headers.get('content-type') || 'application/octet-stream',
    bytes: buf.length,
  };
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
    const rawDurSec = Number(req.query.durationSeconds) || 0;
    const videoId = extractYouTubeVideoId(rawIdOrUrl);

    const meta = await resolveMetadataForTrack({
      videoId,
      title: rawTitle,
      artist: rawArtist,
      durationSeconds: rawDurSec,
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

  // 3. Download & Convert FULL Track / URL via Freemake Engine
  app.post('/api/freemake/download', async (req: Request, res: Response) => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'freemake-dl-'));
    try {
      const {
        videoId: rawId,
        url: rawUrl,
        title = '',
        artist = '',
        album = '',
        durationSeconds = 0,
        format: rawFormat = 'mp3_320',
        eq,
        youtubeCookie,
        poToken,
        cobaltApiUrl,
        allowPreviewFallback = true,
      } = req.body || {};

      const format =
        FREEMAKE_FORMATS[rawFormat as FreemakeFormatId] || FREEMAKE_FORMATS.mp3_320;
      const videoId = extractYouTubeVideoId(String(rawUrl || rawId || ''));

      const meta = await resolveMetadataForTrack({
        videoId,
        title: String(title || ''),
        artist: String(artist || ''),
        durationSeconds: Number(durationSeconds) || 0,
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
      let resolvedTitle = meta.title || String(title || '').trim();
      let resolvedArtist = meta.artist || String(artist || '').trim();

      let resolved = false;

      // Strategy A: Direct YouTube / Cobalt (exact videoId)
      if (videoId) {
        const directResult = await resolveYouTubeDirectStream(
          videoId,
          format.isVideo,
          getInnertube,
          { youtubeCookie, poToken, cobaltApiUrl }
        );
        if ('url' in directResult) {
          try {
            const downloaded = await downloadUrlToFile(
              directResult.url,
              inputSource,
              directResult.headers
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
        const [biliCandidatesRes, scCandidatesRes] = await Promise.allSettled([
          searchBilibiliCandidates(resolvedTitle, resolvedArtist, meta.expectedDurationSec),
          searchSoundCloudCandidates(resolvedTitle, resolvedArtist, meta.expectedDurationSec),
        ]);

        const biliCandidates =
          biliCandidatesRes.status === 'fulfilled' ? biliCandidatesRes.value : [];
        const scCandidates =
          scCandidatesRes.status === 'fulfilled' ? scCandidatesRes.value : [];

        // Order engines by highest confidence score; for MP4 video prefer Bilibili first
        const topBiliScore = biliCandidates[0]?.score ?? -999;
        const topScScore = scCandidates[0]?.score ?? -999;

        const tryBilibili = async () => {
          for (const cand of biliCandidates.slice(0, 3)) {
            const stream = await resolveBilibiliStreamForCandidate(cand, format.isVideo);
            if (!stream) continue;
            try {
              const dl = await downloadUrlToFile(stream.url, inputSource, stream.headers);
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
            if (stream.protocol === 'hls' || stream.url.includes('.m3u8')) {
              // FFmpeg natively reads SoundCloud HLS m3u8 streams end-to-end
              inputSource = stream.url;
              inputHeaders = { 'User-Agent': BROWSER_UA };
              sourceKind = 'soundcloud-full';
              resolvedDurationSec = stream.durationSec || resolvedDurationSec;
              sourceLabel = `SoundCloud フル音源 (${formatSecLabel(resolvedDurationSec) || 'Full'})`;
              isAudioOnlyInput = true;
              return true;
            } else {
              try {
                await downloadUrlToFile(stream.url, inputSource, { 'User-Agent': BROWSER_UA });
                sourceKind = 'soundcloud-full';
                resolvedDurationSec = stream.durationSec || resolvedDurationSec;
                sourceLabel = `SoundCloud フル音源 (${formatSecLabel(resolvedDurationSec) || 'Full'})`;
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
          return res.status(422).json({
            error:
              'フル尺音源の取得に失敗しました。詳細設定からYouTube Cookie / Cobalt API URLを指定するか、別のキーワードでお試しください。',
            requiresCookieOrCobalt: true,
          });
        }
        await downloadUrlToFile(meta.officialPreviewUrl, inputSource);
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
      const outputFilename = `${safeBase}.${format.ext}`;
      const outputPath = path.join(tmpDir, `output.${format.ext}`);

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
      });

      const outStat = await fs.promises.stat(outputPath);
      const outBuffer = await fs.promises.readFile(outputPath);

      const asciiFallback = outputFilename.replace(/[^\x20-\x7e]/g, '_') || `track.${format.ext}`;
      const encodedName = encodeURIComponent(outputFilename);

      res.setHeader('Content-Type', format.mimeType);
      res.setHeader('Content-Length', String(outStat.size));
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`
      );
      res.setHeader('X-Freemake-Source-Kind', sourceKind);
      res.setHeader('X-Freemake-Source-Label', encodeURIComponent(sourceLabel));
      res.setHeader('X-Freemake-Duration-Sec', String(resolvedDurationSec || 0));
      res.setHeader('X-Freemake-Eq-Applied', buildFfmpegEqFilter(eq) ? '1' : '0');
      res.setHeader(
        'Access-Control-Expose-Headers',
        'Content-Disposition, X-Freemake-Source-Kind, X-Freemake-Source-Label, X-Freemake-Duration-Sec, X-Freemake-Eq-Applied'
      );
      res.send(outBuffer);
    } catch (err: any) {
      console.error('[Freemake] Download/convert error:', err?.message || err);
      res.status(500).json({
        error: err?.message || 'Freemakeダウンロード変換中にエラーが発生しました',
      });
    } finally {
      fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 4. Local Audio/Video File Conversion + Freemake EQ Baking (Raw binary upload)
  app.post(
    '/api/freemake/convert-upload',
    express.raw({ type: '*/*', limit: '64mb' }),
    async (req: Request, res: Response) => {
      const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'freemake-conv-'));
      try {
        const bodyBuf = req.body as Buffer;
        if (!Buffer.isBuffer(bodyBuf) || bodyBuf.length < 128) {
          return res.status(400).json({ error: '変換する音声・動画ファイルデータが空です' });
        }

        const rawName = String(req.query.filename || 'audio.mp3');
        const rawFormat = String(req.query.format || 'mp3_320') as FreemakeFormatId;
        const title = String(req.query.title || path.parse(rawName).name || 'Converted Track');
        const artist = String(req.query.artist || '');
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

        const isVideoInput = /\.(mp4|mov|mkv|webm|avi)$/i.test(rawName);
        await runFfmpegConvert({
          inputSource: inputPath,
          outputPath,
          format,
          eq,
          title,
          artist,
          isAudioOnlyInput: !isVideoInput,
        });

        const outBuffer = await fs.promises.readFile(outputPath);
        const safeBase = sanitizeFilenameBase(title);
        const outputFilename = `${safeBase}_freemake.${format.ext}`;
        const asciiFallback =
          outputFilename.replace(/[^\x20-\x7e]/g, '_') || `converted.${format.ext}`;

        res.setHeader('Content-Type', format.mimeType);
        res.setHeader('Content-Length', String(outBuffer.length));
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(
            outputFilename
          )}`
        );
        res.setHeader('X-Freemake-Eq-Applied', buildFfmpegEqFilter(eq) ? '1' : '0');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Freemake-Eq-Applied');
        res.send(outBuffer);
      } catch (err: any) {
        console.error('[Freemake] Upload convert error:', err?.message || err);
        res.status(500).json({
          error: err?.message || 'ファイル変換中にエラーが発生しました',
        });
      } finally {
        fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  );
}
