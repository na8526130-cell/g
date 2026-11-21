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

function waitForServerJobCompletion(
  jobId: string,
  onServerUpdate: (p: ServerJobProgress) => void
): Promise<ServerJobProgress> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let pollTimer: number | null = null;
    let es: EventSource | null = null;

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
          const data = (await r.json()) as ServerJobProgress;
          handleUpdate(data);
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
  eqApplied: boolean;
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

  const parseMeta = (headers: Headers) => {
    const filename = extractFilenameFromDisposition(headers.get('Content-Disposition'), fallbackFilename);
    const sourceKind = headers.get('X-Freemake-Source-Kind') || 'youtube-direct';
    const rawLabel = headers.get('X-Freemake-Source-Label') || '';
    const sourceLabel = rawLabel ? decodeURIComponent(rawLabel) : sourceKind;
    const durationSec = Number(headers.get('X-Freemake-Duration-Sec') || 0) || 0;
    const eqApplied = headers.get('X-Freemake-Eq-Applied') === '1';
    const mimeType = headers.get('Content-Type') || fallbackMimeType;
    return { filename, sourceKind, sourceLabel, durationSec, eqApplied, mimeType };
  };

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
    let meta: ReturnType<typeof parseMeta> | null = null;

    while (total <= 0 || offset < total) {
      const end = total > 0 ? Math.min(offset + RANGE_CHUNK_SIZE - 1, total - 1) : offset + RANGE_CHUNK_SIZE - 1;
      const chunkResp = await fetch(fileUrl, {
        headers: { Range: `bytes=${offset}-${end}` },
      });
      if (!chunkResp.ok && chunkResp.status !== 206) {
        let errMsg = '変換済みファイルの分割受信に失敗しました';
        try {
          const errJson = await chunkResp.json();
          if (errJson?.error) errMsg = errJson.error;
        } catch {}
        throw new Error(errMsg);
      }

      if (!meta) {
        meta = parseMeta(chunkResp.headers);
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
      eqApplied: false,
      mimeType: fallbackMimeType,
    };

    return {
      blob: new Blob(partBlobs, { type: resolvedMeta.mimeType }),
      filename: resolvedMeta.filename,
      sourceKind: resolvedMeta.sourceKind,
      sourceLabel: resolvedMeta.sourceLabel,
      durationSec: resolvedMeta.durationSec,
      eqApplied: resolvedMeta.eqApplied,
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

    const meta = parseMeta(fileResp.headers);
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
      eqApplied: meta.eqApplied,
    };
  } catch (err) {
    if (totalBytes > 0) {
      return downloadViaRanges(totalBytes);
    }
    throw err;
  }
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
  onProgress?: (state: FreemakeProgressState) => void;
}): Promise<FreemakeDownloadResult> {
  const adv = loadFreemakeAdvancedConfig();
  const eqSettings = params.eqOverride || equalizer.getSettings();
  const ext = params.format.startsWith('mp3')
    ? 'mp3'
    : params.format.startsWith('m4a')
    ? 'm4a'
    : params.format;

  const eqPayload = params.applyEq
    ? {
        enabled: true,
        gains: eqSettings.gains,
        bassBoost: eqSettings.bassBoost,
        normalize: Boolean(eqSettings.freemakeNormalize),
      }
    : { enabled: false };

  const emit = (patch: Partial<FreemakeProgressState>) => {
    updateFreemakeProgress(patch);
    params.onProgress?.(getFreemakeProgressState());
  };

  emit({
    active: true,
    mode: 'download',
    jobId: undefined,
    title: params.title || 'YouTube Audio',
    artist: params.artist || '',
    formatExt: ext,
    stage: 'resolving',
    percent: 3,
    message: 'ダウンロードジョブを開始しています...',
    receivedBytes: undefined,
    totalBytes: undefined,
    processedSec: undefined,
    durationSec: params.durationSeconds,
    sourceLabel: undefined,
    error: undefined,
  });

  try {
    const startResp = await fetch('/api/freemake/download/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId: params.videoId,
        url: params.url,
        title: params.title,
        artist: params.artist,
        album: params.album || '',
        duration: params.duration || '',
        durationSeconds: params.durationSeconds || 0,
        format: params.format,
        eq: eqPayload,
        cobaltApiUrl: adv.cobaltApiUrl || undefined,
        youtubeCookie: adv.youtubeCookie || undefined,
        allowPreviewFallback: params.allowPreviewFallback !== false,
      }),
    });

    if (!startResp.ok) {
      let errMsg = 'ダウンロードの開始に失敗しました';
      try {
        const errJson = await startResp.json();
        if (errJson?.error) errMsg = errJson.error;
      } catch {}
      throw new Error(errMsg);
    }

    const { jobId } = (await startResp.json()) as { jobId: string };
    emit({ jobId });

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
      message: '変換済みファイルを端末へ受信中...',
      receivedBytes: 0,
      totalBytes: readyProgress.totalBytes,
    });

    const fallbackName = `${params.artist ? `${params.artist} - ` : ''}${params.title || 'track'}.${ext}`;
    const fetched = await fetchJobFileWithProgress({
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
          message: '変換済みファイルを端末へ受信中...',
        });
      },
    });

    const { blob, filename, sourceKind, sourceLabel, durationSec: headerDurSec, eqApplied } = fetched;

    const resolvedDurSec =
      sourceKind === 'official-preview-30s'
        ? 30
        : headerDurSec > 0
        ? Math.round(headerDurSec)
        : params.durationSeconds || 180;

    emit({
      stage: 'saving',
      percent: 98,
      message: 'オフラインライブラリに保存中...',
      sourceLabel,
    });

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

    emit({
      active: false,
      stage: 'done',
      percent: 100,
      message: `完了: ${filename}`,
      sourceLabel,
    });

    return {
      blob,
      filename,
      sourceKind,
      sourceLabel,
      durationSec: resolvedDurSec,
      eqApplied,
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
  applyEq: boolean;
  title?: string;
  artist?: string;
  saveTarget: 'device' | 'offline' | 'both';
  onProgress?: (state: FreemakeProgressState) => void;
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
    eq: JSON.stringify(eqPayload),
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
          eqApplied: boolean;
        }
      | {
          useJobFile: false;
          blob: Blob;
          disposition: string | null;
          durationSec: number;
          eqApplied: boolean;
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
          message: `FFmpeg で .${ext.toUpperCase()} へ変換・EQ焼き込み中...`,
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
                    eqApplied: Boolean(parsed.eqApplied),
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
            eqApplied: xhr.getResponseHeader('X-Freemake-Eq-Applied') === '1',
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
    let eqApplied: boolean;
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
      eqApplied = xhrResult.eqApplied;
      durationSec = fetched.durationSec || xhrResult.durationSec;
    } else {
      finalBlob = xhrResult.blob;
      filename = extractFilenameFromDisposition(xhrResult.disposition, `${baseName}_freemake.${ext}`);
      eqApplied = xhrResult.eqApplied;
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
        ext
      );
    } catch (err) {
      console.warn('[Freemake] Auto-save converted track failed:', err);
    }

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
      sourceLabel: 'ローカル変換 (FFmpeg + Freemake EQ)',
      durationSec,
      eqApplied,
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
