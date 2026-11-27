import { saveOfflineTrack } from './offlineStorage';
import { recordDownloadHistory } from './downloadHistory';
import { Track } from '../types/music';

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

export interface FreemakeFormatOption {
  id: FreemakeFormatId;
  label: string;
  ext: string;
  mimeType: string;
  isVideo: boolean;
  bitrateLabel: string;
}

export interface FreemakeDownloadSiteInfo {
  id: string;
  name: string;
  category: 'youtube-mirror' | 'full-track-search';
  supportsVideo: boolean;
  badge: string;
  description: string;
}

export interface FreemakeProbeSiteMatch {
  siteId: string;
  siteName: string;
  title: string;
  durationSec: number;
  score: number;
}

export interface FreemakePlaylistItem {
  videoId: string;
  title: string;
  artist: string;
  thumbnail?: string;
  duration?: string;
  durationSeconds?: number;
}

export interface FreemakeFormatsResponse {
  engine: string;
  ffmpegAvailable: boolean;
  ffmpegVersion: string;
  isVercel?: boolean;
  downloadSites?: FreemakeDownloadSiteInfo[];
  formats: FreemakeFormatOption[];
}

export interface FreemakeProbeResponse {
  videoId: string | null;
  resolvedSiteName?: string | null;
  resolvedUrl?: string | null;
  resolvedArtist?: string | null;
  thumbnailUrl?: string | null;
  album?: string | null;
  playlistId?: string | null;
  playlistTitle?: string | null;
  playlistItems?: FreemakePlaylistItem[];
  fullTrackAvailable?: boolean;
  fullTrackSource?: string | null;
  fullTrackTitle?: string | null;
  fullTrackDurationSec?: number | null;
  matchedSites?: FreemakeProbeSiteMatch[];
  officialPreviewAvailable: boolean;
  officialPreviewSource: string | null;
  hasServerCookie: boolean;
  hasCobaltServer: boolean;
}

export interface FreemakeOneClickConfig {
  enabled: boolean;
  format: FreemakeFormatId;
  quality: FreemakeVideoQualityId;
  saveTarget: 'device' | 'offline' | 'shared';
}

export interface FreemakeAdvancedConfig {
  cobaltApiUrl: string;
  youtubeCookie: string;
}

export type FreemakeProgressStage =
  | 'idle'
  | 'resolving'
  | 'searching'
  | 'fetching'
  | 'uploading'
  | 'converting'
  | 'downloading'
  | 'saving'
  | 'done'
  | 'error';

export interface FreemakeProgressState {
  active: boolean;
  mode: 'download' | 'convert';
  jobId?: string;
  title: string;
  artist?: string;
  formatExt: string;
  stage: FreemakeProgressStage;
  percent: number;
  message: string;
  receivedBytes?: number;
  totalBytes?: number;
  processedSec?: number;
  durationSec?: number;
  sourceLabel?: string;
  error?: string;
}

const INITIAL_PROGRESS_STATE: FreemakeProgressState = {
  active: false,
  mode: 'download',
  title: '',
  formatExt: 'mp3',
  stage: 'idle',
  percent: 0,
  message: '',
};

let currentProgressState: FreemakeProgressState = { ...INITIAL_PROGRESS_STATE };
const progressListeners = new Set<(state: FreemakeProgressState) => void>();
let cachedEngineCaps: { ffmpegAvailable: boolean; isVercel: boolean } | null = null;

function updateFreemakeProgress(patch: Partial<FreemakeProgressState>) {
  currentProgressState = {
    ...currentProgressState,
    ...patch,
    percent: Math.max(0, Math.min(100, Math.round(patch.percent ?? currentProgressState.percent))),
  };
  for (const cb of progressListeners) {
    try {
      cb(currentProgressState);
    } catch {}
  }
}

export function getFreemakeProgressState(): FreemakeProgressState {
  return currentProgressState;
}

export function subscribeFreemakeProgress(
  listener: (state: FreemakeProgressState) => void
): () => void {
  progressListeners.add(listener);
  listener(currentProgressState);
  return () => {
    progressListeners.delete(listener);
  };
}

export function resetFreemakeProgress() {
  currentProgressState = { ...INITIAL_PROGRESS_STATE };
  for (const cb of progressListeners) {
    try {
      cb(currentProgressState);
    } catch {}
  }
}

const ADV_CONFIG_KEY = 'zero_music_freemake_adv_v1';
const ONE_CLICK_CONFIG_KEY = 'zero_music_freemake_oneclick_v1';

export function loadFreemakeOneClickConfig(): FreemakeOneClickConfig {
  try {
    const raw = localStorage.getItem(ONE_CLICK_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: Boolean(parsed.enabled),
        format: typeof parsed.format === 'string' ? (parsed.format as FreemakeFormatId) : 'mp3_320',
        quality: typeof parsed.quality === 'string' ? (parsed.quality as FreemakeVideoQualityId) : 'best',
        saveTarget:
          parsed.saveTarget === 'offline' || parsed.saveTarget === 'shared'
            ? parsed.saveTarget
            : 'device',
      };
    }
  } catch {}
  return { enabled: false, format: 'mp3_320', quality: 'best', saveTarget: 'device' };
}

export function saveFreemakeOneClickConfig(cfg: FreemakeOneClickConfig) {
  try {
    localStorage.setItem(ONE_CLICK_CONFIG_KEY, JSON.stringify(cfg));
  } catch {}
}

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
  const data = (await res.json()) as FreemakeFormatsResponse;
  cachedEngineCaps = {
    ffmpegAvailable: Boolean(data.ffmpegAvailable),
    isVercel: Boolean(data.isVercel),
  };
  return data;
}

export async function probeFreemakeTrack(params: {
  videoId?: string;
  url?: string;
  title?: string;
  artist?: string;
  duration?: string;
  durationSeconds?: number;
}): Promise<FreemakeProbeResponse> {
  const qs = new URLSearchParams();
  if (params.videoId) qs.set('videoId', params.videoId);
  if (params.url) qs.set('url', params.url);
  if (params.title) qs.set('title', params.title);
  if (params.artist) qs.set('artist', params.artist);
  if (params.duration) qs.set('duration', params.duration);
  if (params.durationSeconds && params.durationSeconds > 0) {
    qs.set('durationSeconds', String(Math.round(params.durationSeconds)));
  }
  const res = await fetch(`/api/freemake/probe?${qs.toString()}`);
  if (!res.ok) {
    let errMsg = 'プローブに失敗しました';
    try {
      const j = await res.json();
      if (j?.error) errMsg = j.error;
    } catch {}
    throw new Error(errMsg);
  }
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

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isIosStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    isIosDevice() &&
    (Boolean(nav.standalone) || window.matchMedia?.('(display-mode: standalone)').matches)
  );
}

export async function shareBlobFile(blob: Blob, filename: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return false;
  }
  try {
    const file = new File([blob], filename, { type: blob.type || 'audio/mpeg' });
    if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
      return false;
    }
    await navigator.share({
      files: [file],
      title: filename,
    });
    return true;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return true;
    }
    return false;
  }
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}

export async function createSquareArtworkBlob(imageUrl: string, targetSize = 1200): Promise<Blob | null> {
  const cleanUrl = String(imageUrl || '').trim();
  if (!cleanUrl) return null;

  try {
    const fetchUrl = /^https?:\/\//i.test(cleanUrl)
      ? `/api/freemake/artwork?url=${encodeURIComponent(cleanUrl)}`
      : cleanUrl;

    const resp = await fetch(fetchUrl);
    if (!resp.ok) return null;
    const rawBlob = await resp.blob();
    if (!rawBlob || rawBlob.size < 64) return null;

    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      return rawBlob;
    }

    const objUrl = URL.createObjectURL(rawBlob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Image decode failed'));
        el.src = objUrl;
      });

      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      if (!iw || !ih) return rawBlob;

      const side = Math.min(iw, ih);
      const sx = Math.floor((iw - side) / 2);
      const sy = Math.floor((ih - side) / 2);
      const outSize = side >= 256 ? Math.min(targetSize, side) : Math.max(side, 256);

      const canvas = document.createElement('canvas');
      canvas.width = outSize;
      canvas.height = outSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) return rawBlob;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, side, side, 0, 0, outSize, outSize);

      const croppedBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.94);
      });
      return croppedBlob || rawBlob;
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  } catch {
    return null;
  }
}

export async function fetchFullResArtworkBlob(
  imageUrl: string
): Promise<{ blob: Blob; resolvedUrl?: string } | null> {
  const cleanUrl = String(imageUrl || '').trim();
  if (!cleanUrl) return null;

  try {
    const fetchUrl = /^https?:\/\//i.test(cleanUrl)
      ? `/api/freemake/artwork?url=${encodeURIComponent(cleanUrl)}`
      : cleanUrl;

    const resp = await fetch(fetchUrl);
    if (!resp.ok) return null;
    const resolvedUrl = resp.headers.get('X-Artwork-Source-Url') || undefined;
    const rawBlob = await resp.blob();
    if (!rawBlob || rawBlob.size < 64) return null;

    const mime = rawBlob.type.toLowerCase();
    if (mime === 'image/jpeg' || mime === 'image/jpg' || mime === 'image/png') {
      return { blob: rawBlob, resolvedUrl };
    }

    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      return { blob: rawBlob, resolvedUrl };
    }

    const objUrl = URL.createObjectURL(rawBlob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Image decode failed'));
        el.src = objUrl;
      });

      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      if (!iw || !ih) return { blob: rawBlob, resolvedUrl };

      const canvas = document.createElement('canvas');
      canvas.width = iw;
      canvas.height = ih;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { blob: rawBlob, resolvedUrl };

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, iw, ih);

      const encodedBlob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.96);
      });
      return { blob: encodedBlob || rawBlob, resolvedUrl };
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  } catch {
    return null;
  }
}

export async function cacheSquareArtworkDataUrl(imageUrl?: string): Promise<string | undefined> {
  if (!imageUrl) return undefined;
  const blob = await createSquareArtworkBlob(imageUrl, 1400);
  if (!blob) {
    return imageUrl.startsWith('data:image/') || imageUrl.startsWith('/') ? imageUrl : undefined;
  }
  return await new Promise<string | undefined>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(typeof reader.result === 'string' ? reader.result : undefined);
    };
    reader.onerror = () => resolve(undefined);
    reader.readAsDataURL(blob);
  });
}

export async function downloadArtworkImageFile(imageUrl: string, filenameBase: string): Promise<boolean> {
  const result = await fetchFullResArtworkBlob(imageUrl);
  if (!result) return false;

  const isPng = result.blob.type.toLowerCase() === 'image/png';
  const ext = isPng ? 'png' : 'jpg';
  const mimeType = isPng ? 'image/png' : 'image/jpeg';

  const cleanBase =
    filenameBase
      .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100) || 'artwork';
  const outName = `${cleanBase}_cover.${ext}`;

  if (isIosStandalonePwa()) {
    const shared = await shareBlobFile(result.blob, outName);
    if (!shared) {
      triggerBlobDownload(result.blob, outName);
    }
  } else {
    triggerBlobDownload(result.blob, outName);
  }

  recordDownloadHistory({
    title: filenameBase || 'ジャケット画像',
    artist: '高画質アートワーク保存',
    filename: outName,
    formatExt: ext,
    mimeType,
    fileSize: result.blob.size,
    thumbnail: result.resolvedUrl || imageUrl,
    sourceLabel: '高画質サムネ保存',
    target: 'artwork',
  });
  return true;
}

export interface FreemakeDownloadResult {
  blob: Blob;
  filename: string;
  sourceKind: string;
  sourceLabel: string;
  durationSec?: number;
  passthrough?: boolean;
  artworkUrl?: string;
  album?: string;
  savedOfflineTrack?: Track;
}

interface ServerJobProgress {
  jobId: string;
  stage: 'resolving' | 'searching' | 'fetching' | 'converting' | 'ready' | 'error';
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

class FreemakeStatelessFallbackError extends Error {
  constructor() {
    super('STATELESS_SERVER_FALLBACK');
    this.name = 'FreemakeStatelessFallbackError';
  }
}

function waitForServerJobCompletion(
  jobId: string,
  onServerUpdate: (p: ServerJobProgress) => void
): Promise<ServerJobProgress> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let pollTimer: number | null = null;
    let es: EventSource | null = null;
    let consecutive404 = 0;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (pollTimer !== null) window.clearInterval(pollTimer);
      if (es) {
        try {
          es.close();
        } catch {}
      }
      fn();
    };

    const handleUpdate = (p: ServerJobProgress) => {
      onServerUpdate(p);
      if (p.stage === 'ready') {
        finish(() => resolve(p));
      } else if (p.stage === 'error') {
        finish(() => reject(new Error(p.error || p.message || 'ダウンロードに失敗しました')));
      }
    };

    const pollOnce = async () => {
      if (settled) return;
      try {
        const r = await fetch(`/api/freemake/jobs/${encodeURIComponent(jobId)}`);
        if (r.ok) {
          consecutive404 = 0;
          const data = (await r.json()) as ServerJobProgress;
          handleUpdate(data);
        } else if (r.status === 404) {
          consecutive404++;
          if (consecutive404 >= 2) {
            finish(() => reject(new FreemakeStatelessFallbackError()));
          }
        }
      } catch {}
    };

    if (typeof EventSource !== 'undefined') {
      try {
        es = new EventSource(`/api/freemake/jobs/${encodeURIComponent(jobId)}/events`);
        es.onmessage = (ev) => {
          try {
            const parsed = JSON.parse(ev.data) as ServerJobProgress;
            handleUpdate(parsed);
          } catch {}
        };
        es.onerror = () => {
          // Fall back silently to interval polling
        };
      } catch {}
    }

    pollTimer = window.setInterval(pollOnce, 650);
  });
}

async function readResponseBlobWithProgress(
  resp: Response,
  mimeTypeFallback: string,
  onBytes: (receivedBytes: number, totalBytes: number) => void
): Promise<Blob> {
  const totalBytes = Number(resp.headers.get('Content-Length') || 0) || 0;
  if (!resp.body) {
    const blob = await resp.blob();
    onBytes(blob.size, totalBytes || blob.size);
    return blob;
  }

  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value && value.byteLength > 0) {
      chunks.push(value);
      received += value.byteLength;
      onBytes(received, totalBytes);
    }
  }

  const contentType = resp.headers.get('Content-Type') || mimeTypeFallback || 'application/octet-stream';
  return new Blob(chunks as BlobPart[], { type: contentType });
}

const RANGE_CHUNK_SIZE = 6 * 1024 * 1024; // 6MB chunks safely under Cloud Run 32MB limit
const RANGE_THRESHOLD_BYTES = 20 * 1024 * 1024;

interface FetchedJobFile {
  blob: Blob;
  filename: string;
  sourceKind: string;
  sourceLabel: string;
  durationSec: number;
  passthrough: boolean;
  artworkUrl?: string;
  album?: string;
}

function decodeHeaderParam(val: string | null): string {
  if (!val) return '';
  try {
    return decodeURIComponent(val);
  } catch {
    return val;
  }
}

function parseDownloadHeaders(
  headers: Headers,
  fallbackFilename: string,
  fallbackMimeType = 'application/octet-stream'
) {
  const filename = extractFilenameFromDisposition(headers.get('Content-Disposition'), fallbackFilename);
  const sourceKind = headers.get('X-Freemake-Source-Kind') || 'youtube-direct';
  const sourceLabel = decodeHeaderParam(headers.get('X-Freemake-Source-Label')) || sourceKind;
  const durationSec = Number(headers.get('X-Freemake-Duration-Sec') || 0) || 0;
  const passthrough = headers.get('X-Freemake-Passthrough') === '1';
  const artworkUrl = decodeHeaderParam(headers.get('X-Freemake-Artwork-Url')) || undefined;
  const album = decodeHeaderParam(headers.get('X-Freemake-Album')) || undefined;
  const mimeType = headers.get('Content-Type') || fallbackMimeType;
  return { filename, sourceKind, sourceLabel, durationSec, passthrough, artworkUrl, album, mimeType };
}

async function fetchJobFileWithProgress(params: {
  jobId: string;
  knownTotalBytes?: number;
  fallbackFilename: string;
  fallbackMimeType?: string;
  onBytes: (receivedBytes: number, totalBytes: number) => void;
}): Promise<FetchedJobFile> {
  const { jobId, knownTotalBytes = 0, fallbackFilename, fallbackMimeType = 'application/octet-stream', onBytes } = params;
  const fileUrl = `/api/freemake/jobs/${encodeURIComponent(jobId)}/file`;

  let totalBytes = knownTotalBytes;
  if (totalBytes <= 0) {
    try {
      const headResp = await fetch(fileUrl, { method: 'HEAD' });
      if (headResp.ok) {
        totalBytes = Number(headResp.headers.get('Content-Length') || 0) || 0;
      }
    } catch {}
  }

  const downloadViaRanges = async (expectedTotal: number): Promise<FetchedJobFile> => {
    const partBlobs: Blob[] = [];
    let offset = 0;
    let total = expectedTotal;
    let meta: ReturnType<typeof parseDownloadHeaders> | null = null;

    while (total <= 0 || offset < total) {
      const end = total > 0 ? Math.min(offset + RANGE_CHUNK_SIZE - 1, total - 1) : offset + RANGE_CHUNK_SIZE - 1;
      const chunkResp = await fetch(fileUrl, {
        headers: { Range: `bytes=${offset}-${end}` },
      });
      if (!chunkResp.ok && chunkResp.status !== 206) {
        let errMsg = 'ファイルの分割受信に失敗しました';
        try {
          const errJson = await chunkResp.json();
          if (errJson?.error) errMsg = errJson.error;
        } catch {}
        throw new Error(errMsg);
      }

      if (!meta) {
        meta = parseDownloadHeaders(chunkResp.headers, fallbackFilename, fallbackMimeType);
      }

      const contentRange = chunkResp.headers.get('Content-Range') || '';
      const rangeMatch = contentRange.match(/bytes\s+\d+-\d+\/(\d+)/i);
      if (rangeMatch?.[1]) {
        total = Number(rangeMatch[1]) || total;
      }

      const chunkBlob = await readResponseBlobWithProgress(
        chunkResp,
        meta.mimeType,
        (chunkReceived) => {
          onBytes(offset + chunkReceived, total || offset + chunkReceived);
        }
      );

      partBlobs.push(chunkBlob);
      offset += chunkBlob.size;
      onBytes(offset, total || offset);

      if (chunkResp.status === 200 || chunkBlob.size === 0 || (total > 0 && offset >= total)) {
        break;
      }
    }

    fetch(`/api/freemake/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' }).catch(() => {});

    const resolvedMeta = meta || {
      filename: fallbackFilename,
      sourceKind: 'youtube-direct',
      sourceLabel: '',
      durationSec: 0,
      passthrough: false,
      artworkUrl: undefined,
      album: undefined,
      mimeType: fallbackMimeType,
    };

    return {
      blob: new Blob(partBlobs, { type: resolvedMeta.mimeType }),
      filename: resolvedMeta.filename,
      sourceKind: resolvedMeta.sourceKind,
      sourceLabel: resolvedMeta.sourceLabel,
      durationSec: resolvedMeta.durationSec,
      passthrough: resolvedMeta.passthrough,
      artworkUrl: resolvedMeta.artworkUrl,
      album: resolvedMeta.album,
    };
  };

  if (totalBytes > RANGE_THRESHOLD_BYTES) {
    return downloadViaRanges(totalBytes);
  }

  try {
    const fileResp = await fetch(fileUrl);
    if (!fileResp.ok) {
      let errMsg = '変換済みファイルの取得に失敗しました';
      try {
        const errJson = await fileResp.json();
        if (errJson?.error) errMsg = errJson.error;
      } catch {}
      throw new Error(errMsg);
    }

    const headerLen = Number(fileResp.headers.get('Content-Length') || 0) || totalBytes;
    if (headerLen > RANGE_THRESHOLD_BYTES) {
      fileResp.body?.cancel().catch(() => {});
      return downloadViaRanges(headerLen);
    }

    const meta = parseDownloadHeaders(fileResp.headers, fallbackFilename, fallbackMimeType);
    const blob = await readResponseBlobWithProgress(fileResp, meta.mimeType, onBytes);
    if (headerLen > 0 && blob.size < headerLen) {
      return downloadViaRanges(headerLen);
    }

    return {
      blob,
      filename: meta.filename,
      sourceKind: meta.sourceKind,
      sourceLabel: meta.sourceLabel,
      durationSec: meta.durationSec,
      passthrough: meta.passthrough,
      artworkUrl: meta.artworkUrl,
      album: meta.album,
    };
  } catch (err) {
    if (totalBytes > 0) {
      return downloadViaRanges(totalBytes);
    }
    throw err;
  }
}

async function executeDirectDownloadRequest(
  payload: Record<string, any>,
  fallbackName: string,
  emit: (patch: Partial<FreemakeProgressState>) => void
): Promise<FetchedJobFile> {
  emit({
    stage: 'fetching',
    percent: 24,
    message: 'サーバーからフル尺音源をダイレクト取得中...',
  });

  const resp = await fetch('/api/freemake/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    let errMsg = 'ダウンロードに失敗しました';
    let previewAvailable = false;
    let requiresCookieOrCobalt = false;
    try {
      const errJson = await resp.json();
      if (errJson?.error) errMsg = errJson.error;
      previewAvailable = Boolean(errJson?.previewAvailable);
      requiresCookieOrCobalt = Boolean(errJson?.requiresCookieOrCobalt);
    } catch {}
    const err = new Error(errMsg) as Error & {
      previewAvailable?: boolean;
      requiresCookieOrCobalt?: boolean;
    };
    err.previewAvailable = previewAvailable;
    err.requiresCookieOrCobalt = requiresCookieOrCobalt;
    throw err;
  }

  const meta = parseDownloadHeaders(resp.headers, fallbackName);
  emit({
    stage: 'downloading',
    percent: 48,
    sourceLabel: meta.sourceLabel,
    durationSec: meta.durationSec || undefined,
    message: meta.passthrough
      ? '音源を受信中 (FFmpegレス・ダイレクト)...'
      : 'ファイルを受信中...',
  });

  const blob = await readResponseBlobWithProgress(resp, meta.mimeType, (receivedBytes, totalBytes) => {
    const ratio = totalBytes > 0 ? Math.min(1, receivedBytes / totalBytes) : 0.5;
    emit({
      stage: 'downloading',
      percent: 48 + ratio * 46,
      receivedBytes,
      totalBytes: totalBytes || undefined,
      message: meta.passthrough ? '音源を受信中 (ダイレクト)...' : 'ファイルを受信中...',
    });
  });

  return {
    blob,
    filename: meta.filename,
    sourceKind: meta.sourceKind,
    sourceLabel: meta.sourceLabel,
    durationSec: meta.durationSec,
    passthrough: meta.passthrough,
    artworkUrl: meta.artworkUrl,
    album: meta.album,
  };
}

const KNOWN_MEDIA_EXTS = new Set([
  'mp3',
  'm4a',
  'aac',
  'flac',
  'wav',
  'ogg',
  'opus',
  'webm',
  'mp4',
  'mkv',
  'avi',
  'ts',
]);

function resolveActualExtension(filename: string, fallbackExt: string): string {
  const raw = filename.split('.').pop()?.toLowerCase().trim() || '';
  return KNOWN_MEDIA_EXTS.has(raw) ? raw : fallbackExt;
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
  quality?: FreemakeVideoQualityId;
  saveTarget: 'device' | 'offline' | 'both';
  allowPreviewFallback?: boolean;
  enabledSites?: string[];
  skipHistoryRecord?: boolean;
  onProgress?: (state: FreemakeProgressState) => void;
}): Promise<FreemakeDownloadResult> {
  const adv = loadFreemakeAdvancedConfig();
  const ext = params.format.startsWith('mp3')
    ? 'mp3'
    : params.format.startsWith('m4a')
    ? 'm4a'
    : params.format;

  const emit = (patch: Partial<FreemakeProgressState>) => {
    updateFreemakeProgress(patch);
    params.onProgress?.(getFreemakeProgressState());
  };

  emit({
    active: true,
    mode: 'download',
    jobId: undefined,
    title: params.title || 'Freemake Media',
    artist: params.artist || '',
    formatExt: ext,
    stage: 'resolving',
    percent: 4,
    message: 'メディア情報を照合中...',
    receivedBytes: undefined,
    totalBytes: undefined,
    processedSec: undefined,
    durationSec: params.durationSeconds,
    sourceLabel: undefined,
    error: undefined,
  });

  const payload = {
    videoId: params.videoId,
    url: params.url,
    title: params.title,
    artist: params.artist,
    album: params.album || '',
    thumbnail: params.thumbnail || '',
    duration: params.duration || '',
    durationSeconds: params.durationSeconds || 0,
    format: params.format,
    quality: params.quality || 'best',
    cobaltApiUrl: adv.cobaltApiUrl || undefined,
    youtubeCookie: adv.youtubeCookie || undefined,
    allowPreviewFallback: Boolean(params.allowPreviewFallback),
    ...(params.enabledSites && params.enabledSites.length > 0
      ? { enabledSites: params.enabledSites }
      : {}),
  };

  const fallbackName = `${params.artist ? `${params.artist} - ` : ''}${params.title || 'track'}.${ext}`;

  try {
    if (!cachedEngineCaps) {
      try {
        await fetchFreemakeFormats();
      } catch {}
    }

    let fetched: FetchedJobFile;

    if (cachedEngineCaps?.isVercel) {
      // Single-request mode for Vercel serverless (stateless functions)
      fetched = await executeDirectDownloadRequest(payload, fallbackName, emit);
    } else {
      const startResp = await fetch('/api/freemake/download/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!startResp.ok) {
        let errMsg = 'ダウンロードの開始に失敗しました';
        try {
          const errJson = await startResp.json();
          if (errJson?.error) errMsg = errJson.error;
        } catch {}
        throw new Error(errMsg);
      }

      const startJson = (await startResp.json()) as { jobId: string; isVercel?: boolean };
      if (startJson.isVercel) {
        if (cachedEngineCaps) cachedEngineCaps.isVercel = true;
        fetched = await executeDirectDownloadRequest(payload, fallbackName, emit);
      } else {
        const jobId = startJson.jobId;
        emit({ jobId });
        try {
          const readyProgress = await waitForServerJobCompletion(jobId, (p) => {
            emit({
              stage: p.stage === 'ready' ? 'downloading' : p.stage,
              percent: p.percent,
              message: p.message,
              receivedBytes: p.receivedBytes,
              totalBytes: p.totalBytes,
              processedSec: p.processedSec,
              durationSec: p.durationSec,
              sourceLabel: p.sourceLabel,
            });
          });

          emit({
            stage: 'downloading',
            percent: 90,
            message: 'ファイルを端末へ受信中...',
            receivedBytes: 0,
            totalBytes: readyProgress.totalBytes,
          });

          fetched = await fetchJobFileWithProgress({
            jobId,
            knownTotalBytes: readyProgress.totalBytes,
            fallbackFilename: fallbackName,
            onBytes: (receivedBytes, totalBytes) => {
              const ratio = totalBytes > 0 ? Math.min(1, receivedBytes / totalBytes) : 0.5;
              emit({
                stage: 'downloading',
                percent: 90 + ratio * 8,
                receivedBytes,
                totalBytes: totalBytes || undefined,
                message: 'ファイルを端末へ受信中...',
              });
            },
          });
        } catch (jobErr: any) {
          if (jobErr instanceof FreemakeStatelessFallbackError) {
            fetched = await executeDirectDownloadRequest(payload, fallbackName, emit);
          } else {
            throw jobErr;
          }
        }
      }
    }

    const {
      blob,
      filename,
      sourceKind,
      sourceLabel,
      durationSec: headerDurSec,
      passthrough,
      artworkUrl: headerArtworkUrl,
      album: headerAlbum,
    } = fetched;
    const actualExt = resolveActualExtension(filename, ext);

    const resolvedDurSec =
      sourceKind === 'official-preview-30s'
        ? 30
        : headerDurSec > 0
        ? Math.round(headerDurSec)
        : params.durationSeconds || 180;

    const bestArtworkUrl = headerArtworkUrl || params.thumbnail || undefined;
    const resolvedAlbum = headerAlbum || params.album || 'Freemake オフライン保存';

    emit({
      stage: 'saving',
      percent: 97,
      formatExt: actualExt,
      message: 'ジャケット画像を正方形に最適化＆オフライン保存中...',
      sourceLabel,
    });

    const cachedSquareThumb = await cacheSquareArtworkDataUrl(bestArtworkUrl);

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
      const fallbackTitle = filename.replace(/\.[^.]+$/, '') || 'Downloaded Track';
      savedOfflineTrack = await saveOfflineTrack(
        blob,
        sourceKind === 'official-preview-30s'
          ? `${params.title || fallbackTitle} (30秒プレビュー)`
          : params.title || fallbackTitle,
        params.artist || 'Freemake保存',
        resolvedAlbum,
        resolvedDurSec,
        durStr,
        cachedSquareThumb || bestArtworkUrl,
        actualExt
      );
    } catch (err) {
      console.warn('[Freemake] Auto-save to offline storage failed:', err);
    }

    if (!params.skipHistoryRecord) {
      const resolvedTitle =
        sourceKind === 'official-preview-30s'
          ? `${params.title || filename.replace(/\.[^.]+$/, '')} (30秒プレビュー)`
          : params.title || filename.replace(/\.[^.]+$/, '') || 'Downloaded Track';
      recordDownloadHistory({
        title: resolvedTitle,
        artist: params.artist || 'Freemake保存',
        album: resolvedAlbum,
        filename,
        formatExt: actualExt,
        mimeType: blob.type || undefined,
        fileSize: blob.size,
        thumbnail: cachedSquareThumb || bestArtworkUrl,
        sourceLabel: sourceLabel || 'Freemake',
        target: params.saveTarget,
        videoId: params.videoId,
        offlineTrackId: savedOfflineTrack?.id,
        duration:
          sourceKind === 'official-preview-30s'
            ? '0:30'
            : headerDurSec > 0
            ? formatDurationLabel(headerDurSec)
            : params.duration || formatDurationLabel(resolvedDurSec),
        durationSeconds: resolvedDurSec,
      });
    }

    emit({
      active: false,
      stage: 'done',
      percent: 100,
      formatExt: actualExt,
      message: `完了: ${filename}`,
      sourceLabel,
    });

    return {
      blob,
      filename,
      sourceKind,
      sourceLabel,
      durationSec: resolvedDurSec,
      passthrough,
      artworkUrl: cachedSquareThumb || bestArtworkUrl,
      album: resolvedAlbum,
      savedOfflineTrack,
    };
  } catch (err: any) {
    emit({
      active: false,
      stage: 'error',
      message: err?.message || 'ダウンロードに失敗しました',
      error: err?.message || 'ダウンロードに失敗しました',
    });
    throw err;
  }
}

export async function convertLocalFileWithFreemake(params: {
  file: File;
  format: FreemakeFormatId;
  title?: string;
  artist?: string;
  saveTarget: 'device' | 'offline' | 'both';
  onProgress?: (state: FreemakeProgressState) => void;
}): Promise<FreemakeDownloadResult> {
  const ext = params.format.startsWith('mp3')
    ? 'mp3'
    : params.format.startsWith('m4a')
    ? 'm4a'
    : params.format;
  const baseName = params.title || params.file.name.replace(/\.[^.]+$/, '') || 'converted';
  const jobId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const emit = (patch: Partial<FreemakeProgressState>) => {
    updateFreemakeProgress(patch);
    params.onProgress?.(getFreemakeProgressState());
  };

  emit({
    active: true,
    mode: 'convert',
    jobId,
    title: baseName,
    artist: params.artist || 'ローカル音源',
    formatExt: ext,
    stage: 'uploading',
    percent: 2,
    message: 'ファイルを変換サーバーへ送信中...',
    receivedBytes: 0,
    totalBytes: params.file.size,
    processedSec: undefined,
    durationSec: undefined,
    error: undefined,
  });

  const qs = new URLSearchParams({
    jobId,
    filename: params.file.name,
    format: params.format,
    title: baseName,
    artist: params.artist || 'ローカル音源',
    allowRangeResult: '1',
  });

  let es: EventSource | null = null;
  if (typeof EventSource !== 'undefined') {
    try {
      es = new EventSource(`/api/freemake/jobs/${encodeURIComponent(jobId)}/events`);
      es.onmessage = (ev) => {
        try {
          const p = JSON.parse(ev.data) as ServerJobProgress;
          if (p.stage === 'converting') {
            emit({
              stage: 'converting',
              percent: p.percent,
              processedSec: p.processedSec,
              durationSec: p.durationSec,
              message: p.message,
            });
          }
        } catch {}
      };
    } catch {}
  }

  try {
    const buf = await params.file.arrayBuffer();
    const xhrResult = await new Promise<
      | {
          useJobFile: true;
          jobId: string;
          totalBytes: number;
          filename: string;
          mimeType: string;
          durationSec: number;
        }
      | {
          useJobFile: false;
          blob: Blob;
          disposition: string | null;
          durationSec: number;
        }
    >((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/freemake/convert-upload?${qs.toString()}`);
      xhr.responseType = 'blob';
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && ev.total > 0) {
          const ratio = Math.min(1, ev.loaded / ev.total);
          emit({
            stage: 'uploading',
            percent: Math.max(2, ratio * 44),
            receivedBytes: ev.loaded,
            totalBytes: ev.total,
            message: '変換ファイルをサーバーへ送信中...',
          });
        }
      };

      xhr.upload.onload = () => {
        emit({
          stage: 'converting',
          percent: 45,
          message: `FFmpeg で .${ext.toUpperCase()} へ変換中...`,
        });
      };

      xhr.onprogress = (ev) => {
        if (ev.lengthComputable && ev.total > 0) {
          const ratio = Math.min(1, ev.loaded / ev.total);
          emit({
            stage: 'downloading',
            percent: 90 + ratio * 8,
            receivedBytes: ev.loaded,
            totalBytes: ev.total,
            message: '変換済みファイルを受信中...',
          });
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const ct = xhr.getResponseHeader('Content-Type') || '';
          const respBlob = xhr.response as Blob;
          if (ct.includes('application/json')) {
            respBlob
              .text()
              .then((txt) => {
                const parsed = JSON.parse(txt);
                if (parsed?.useJobFile && parsed?.jobId) {
                  resolve({
                    useJobFile: true,
                    jobId: parsed.jobId,
                    totalBytes: Number(parsed.totalBytes) || 0,
                    filename: parsed.filename || `${baseName}_freemake.${ext}`,
                    mimeType: parsed.mimeType || 'application/octet-stream',
                    durationSec: Number(parsed.durationSec) || 180,
                  });
                } else {
                  reject(new Error(parsed?.error || '変換に失敗しました'));
                }
              })
              .catch(() => reject(new Error('変換結果の解析に失敗しました')));
            return;
          }
          resolve({
            useJobFile: false,
            blob: respBlob,
            disposition: xhr.getResponseHeader('Content-Disposition'),
            durationSec: Number(xhr.getResponseHeader('X-Freemake-Duration-Sec') || 0) || 180,
          });
        } else {
          const blob = xhr.response as Blob;
          if (blob && typeof blob.text === 'function') {
            blob
              .text()
              .then((txt) => {
                try {
                  const parsed = JSON.parse(txt);
                  reject(new Error(parsed?.error || '変換に失敗しました'));
                } catch {
                  reject(new Error('変換に失敗しました'));
                }
              })
              .catch(() => reject(new Error('変換に失敗しました')));
          } else {
            reject(new Error('変換に失敗しました'));
          }
        }
      };

      xhr.onerror = () => reject(new Error('ネットワークエラーが発生しました'));
      xhr.send(buf);
    });

    if (es) {
      try {
        es.close();
      } catch {}
    }

    let finalBlob: Blob;
    let filename: string;
    let durationSec: number;

    if (xhrResult.useJobFile) {
      const fetched = await fetchJobFileWithProgress({
        jobId: xhrResult.jobId,
        knownTotalBytes: xhrResult.totalBytes,
        fallbackFilename: xhrResult.filename,
        fallbackMimeType: xhrResult.mimeType,
        onBytes: (receivedBytes, totalBytes) => {
          const ratio = totalBytes > 0 ? Math.min(1, receivedBytes / totalBytes) : 0.5;
          emit({
            stage: 'downloading',
            percent: 90 + ratio * 8,
            receivedBytes,
            totalBytes: totalBytes || undefined,
            message: '変換済みファイルを分割受信中...',
          });
        },
      });
      finalBlob = fetched.blob;
      filename = fetched.filename || xhrResult.filename;
      durationSec = fetched.durationSec || xhrResult.durationSec;
    } else {
      finalBlob = xhrResult.blob;
      filename = extractFilenameFromDisposition(xhrResult.disposition, `${baseName}_freemake.${ext}`);
      durationSec = xhrResult.durationSec;
    }

    const formatDurationLabel = (sec: number): string => {
      const safe = Math.max(0, Math.round(sec));
      const m = Math.floor(safe / 60);
      const s = safe % 60;
      return `${m}:${String(s).padStart(2, '0')}`;
    };

    emit({
      stage: 'saving',
      percent: 98,
      message: 'オフラインライブラリに保存中...',
    });

    if (params.saveTarget === 'device' || params.saveTarget === 'both') {
      triggerBlobDownload(finalBlob, filename);
    }

    let savedOfflineTrack: Track | undefined;
    try {
      savedOfflineTrack = await saveOfflineTrack(
        finalBlob,
        `${baseName} (Freemake変換)`,
        params.artist || 'Freemake Audio Engine',
        'Freemake 変換ライブラリ',
        durationSec,
        formatDurationLabel(durationSec),
        undefined,
        resolveActualExtension(filename, ext)
      );
    } catch (err) {
      console.warn('[Freemake] Auto-save converted track failed:', err);
    }

    const convExt = resolveActualExtension(filename, ext);
    recordDownloadHistory({
      title: `${baseName} (Freemake変換)`,
      artist: params.artist || 'ローカル音源',
      album: 'Freemake 変換ライブラリ',
      filename,
      formatExt: convExt,
      mimeType: finalBlob.type || undefined,
      fileSize: finalBlob.size,
      sourceLabel: 'ローカル変換 (FFmpeg)',
      target: params.saveTarget,
      offlineTrackId: savedOfflineTrack?.id,
      duration: formatDurationLabel(durationSec),
      durationSeconds: durationSec,
    });

    emit({
      active: false,
      stage: 'done',
      percent: 100,
      message: `変換完了: ${filename}`,
    });

    return {
      blob: finalBlob,
      filename,
      sourceKind: 'local-convert',
      sourceLabel: 'ローカル変換 (FFmpeg)',
      durationSec,
      savedOfflineTrack,
    };
  } catch (err: any) {
    if (es) {
      try {
        es.close();
      } catch {}
    }
    emit({
      active: false,
      stage: 'error',
      message: err?.message || 'ファイル変換に失敗しました',
      error: err?.message || 'ファイル変換に失敗しました',
    });
    throw err;
  }
}
