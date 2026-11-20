import { equalizer, EqualizerSettings } from './equalizer';
import { saveOfflineTrack } from './offlineStorage';
import { Track } from '../types/music';

export type FreemakeFormatId =
  | 'mp3_320'
  | 'mp3_192'
  | 'mp3_128'
  | 'm4a_256'
  | 'flac'
  | 'wav'
  | 'ogg'
  | 'mp4';

export interface FreemakeFormatOption {
  id: FreemakeFormatId;
  label: string;
  ext: string;
  mimeType: string;
  isVideo: boolean;
  bitrateLabel: string;
}

export interface FreemakeFormatsResponse {
  engine: string;
  ffmpegAvailable: boolean;
  ffmpegVersion: string;
  formats: FreemakeFormatOption[];
}

export interface FreemakeProbeResponse {
  videoId: string | null;
  fullTrackAvailable?: boolean;
  fullTrackSource?: string | null;
  fullTrackTitle?: string | null;
  fullTrackDurationSec?: number | null;
  officialPreviewAvailable: boolean;
  officialPreviewSource: string | null;
  hasServerCookie: boolean;
  hasCobaltServer: boolean;
}

export interface FreemakeAdvancedConfig {
  cobaltApiUrl: string;
  youtubeCookie: string;
}

const ADV_CONFIG_KEY = 'zero_music_freemake_adv_v1';

export function loadFreemakeAdvancedConfig(): FreemakeAdvancedConfig {
  try {
    const raw = localStorage.getItem(ADV_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        cobaltApiUrl: typeof parsed.cobaltApiUrl === 'string' ? parsed.cobaltApiUrl : '',
        youtubeCookie: typeof parsed.youtubeCookie === 'string' ? parsed.youtubeCookie : '',
      };
    }
  } catch {}
  return { cobaltApiUrl: '', youtubeCookie: '' };
}

export function saveFreemakeAdvancedConfig(cfg: FreemakeAdvancedConfig) {
  try {
    localStorage.setItem(ADV_CONFIG_KEY, JSON.stringify(cfg));
  } catch {}
}

export async function fetchFreemakeFormats(): Promise<FreemakeFormatsResponse> {
  const res = await fetch('/api/freemake/formats');
  if (!res.ok) throw new Error('Freemakeエンジン情報の取得に失敗しました');
  return res.json();
}

export async function probeFreemakeTrack(params: {
  videoId?: string;
  url?: string;
  title?: string;
  artist?: string;
  durationSeconds?: number;
}): Promise<FreemakeProbeResponse> {
  const qs = new URLSearchParams();
  if (params.videoId) qs.set('videoId', params.videoId);
  if (params.url) qs.set('url', params.url);
  if (params.title) qs.set('title', params.title);
  if (params.artist) qs.set('artist', params.artist);
  if (params.durationSeconds && params.durationSeconds > 0) {
    qs.set('durationSeconds', String(Math.round(params.durationSeconds)));
  }
  const res = await fetch(`/api/freemake/probe?${qs.toString()}`);
  if (!res.ok) throw new Error('プローブに失敗しました');
  return res.json();
}

function extractFilenameFromDisposition(headerVal: string | null, fallbackName: string): string {
  if (!headerVal) return fallbackName;
  const utfMatch = headerVal.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch {}
  }
  const plainMatch = headerVal.match(/filename="([^"]+)"/i);
  if (plainMatch?.[1]) return plainMatch[1];
  return fallbackName;
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
}

export interface FreemakeDownloadResult {
  blob: Blob;
  filename: string;
  sourceKind: string;
  sourceLabel: string;
  durationSec?: number;
  eqApplied: boolean;
  savedOfflineTrack?: Track;
}

export async function downloadWithFreemake(params: {
  videoId?: string;
  url?: string;
  title: string;
  artist: string;
  album?: string;
  thumbnail?: string;
  duration?: string;
  durationSeconds?: number;
  format: FreemakeFormatId;
  applyEq: boolean;
  eqOverride?: EqualizerSettings;
  saveTarget: 'device' | 'offline' | 'both';
  allowPreviewFallback?: boolean;
}): Promise<FreemakeDownloadResult> {
  const adv = loadFreemakeAdvancedConfig();
  const eqSettings = params.eqOverride || equalizer.getSettings();

  const eqPayload = params.applyEq
    ? {
        enabled: true,
        gains: eqSettings.gains,
        bassBoost: eqSettings.bassBoost,
        normalize: Boolean(eqSettings.freemakeNormalize),
      }
    : { enabled: false };

  const resp = await fetch('/api/freemake/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
      videoId: params.videoId,
      url: params.url,
      title: params.title,
      artist: params.artist,
      album: params.album || '',
      durationSeconds: params.durationSeconds || 0,
      format: params.format,
      eq: eqPayload,
      cobaltApiUrl: adv.cobaltApiUrl || undefined,
      youtubeCookie: adv.youtubeCookie || undefined,
      allowPreviewFallback: params.allowPreviewFallback !== false,
    }),
  });

  if (!resp.ok) {
    let errMsg = 'ダウンロードに失敗しました';
    try {
      const errJson = await resp.json();
      if (errJson?.error) errMsg = errJson.error;
    } catch {}
    throw new Error(errMsg);
  }

  const blob = await resp.blob();
  const ext = params.format.startsWith('mp3') ? 'mp3' : params.format.startsWith('m4a') ? 'm4a' : params.format;
  const fallbackName = `${params.artist ? `${params.artist} - ` : ''}${params.title || 'track'}.${ext}`;
  const filename = extractFilenameFromDisposition(resp.headers.get('Content-Disposition'), fallbackName);
  const sourceKind = resp.headers.get('X-Freemake-Source-Kind') || 'youtube-direct';
  const rawLabel = resp.headers.get('X-Freemake-Source-Label') || '';
  const sourceLabel = rawLabel ? decodeURIComponent(rawLabel) : sourceKind;
  const headerDurSec = Number(resp.headers.get('X-Freemake-Duration-Sec') || 0);
  const eqApplied = resp.headers.get('X-Freemake-Eq-Applied') === '1';

  const resolvedDurSec =
    sourceKind === 'official-preview-30s'
      ? 30
      : headerDurSec > 0
      ? Math.round(headerDurSec)
      : params.durationSeconds || 180;

  const formatDurationLabel = (sec: number): string => {
    const safe = Math.max(0, Math.round(sec));
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  if (params.saveTarget === 'device' || params.saveTarget === 'both') {
    triggerBlobDownload(blob, filename);
  }

  let savedOfflineTrack: Track | undefined;
  try {
    const durStr =
      sourceKind === 'official-preview-30s'
        ? '0:30'
        : headerDurSec > 0
        ? formatDurationLabel(headerDurSec)
        : params.duration || formatDurationLabel(resolvedDurSec);
    savedOfflineTrack = await saveOfflineTrack(
      blob,
      sourceKind === 'official-preview-30s' ? `${params.title} (プレビュー)` : params.title,
      params.artist || 'Freemake保存',
      params.album || 'Freemake オフライン保存',
      resolvedDurSec,
      durStr,
      params.thumbnail,
      ext
    );
  } catch (err) {
    console.warn('[Freemake] Auto-save to offline storage failed:', err);
  }

  return {
    blob,
    filename,
    sourceKind,
    sourceLabel,
    durationSec: resolvedDurSec,
    eqApplied,
    savedOfflineTrack,
  };
}

export async function convertLocalFileWithFreemake(params: {
  file: File;
  format: FreemakeFormatId;
  applyEq: boolean;
  title?: string;
  artist?: string;
  saveTarget: 'device' | 'offline' | 'both';
}): Promise<FreemakeDownloadResult> {
  const eqSettings = equalizer.getSettings();
  const eqPayload = params.applyEq
    ? {
        enabled: true,
        gains: eqSettings.gains,
        bassBoost: eqSettings.bassBoost,
        normalize: Boolean(eqSettings.freemakeNormalize),
      }
    : { enabled: false };

  const qs = new URLSearchParams({
    filename: params.file.name,
    format: params.format,
    title: params.title || params.file.name.replace(/\.[^.]+$/, ''),
    artist: params.artist || 'ローカル音源',
    eq: JSON.stringify(eqPayload),
  });

  const buf = await params.file.arrayBuffer();
  const resp = await fetch(`/api/freemake/convert-upload?${qs.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: buf,
  });

  if (!resp.ok) {
    let errMsg = '変換に失敗しました';
    try {
      const errJson = await resp.json();
      if (errJson?.error) errMsg = errJson.error;
    } catch {}
    throw new Error(errMsg);
  }

  const blob = await resp.blob();
  const ext = params.format.startsWith('mp3') ? 'mp3' : params.format.startsWith('m4a') ? 'm4a' : params.format;
  const baseName = params.title || params.file.name.replace(/\.[^.]+$/, '') || 'converted';
  const filename = extractFilenameFromDisposition(
    resp.headers.get('Content-Disposition'),
    `${baseName}_freemake.${ext}`
  );
  const eqApplied = resp.headers.get('X-Freemake-Eq-Applied') === '1';

  if (params.saveTarget === 'device' || params.saveTarget === 'both') {
    triggerBlobDownload(blob, filename);
  }

  let savedOfflineTrack: Track | undefined;
  try {
    savedOfflineTrack = await saveOfflineTrack(
      blob,
      `${baseName} (Freemake変換)`,
      params.artist || 'Freemake Audio Engine',
      'Freemake 変換ライブラリ',
      180,
      '3:00',
      undefined,
      ext
    );
  } catch (err) {
    console.warn('[Freemake] Auto-save converted track failed:', err);
  }

  return {
    blob,
    filename,
    sourceKind: 'local-convert',
    sourceLabel: 'ローカル変換 (FFmpeg + Freemake EQ)',
    eqApplied,
    savedOfflineTrack,
  };
}
