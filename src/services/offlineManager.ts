import { AudioQualityMode, Track } from '../types/music';
import { api } from './api';
import {
  getCachedTrackAudioIds,
  getCachedTrackAudioRecord,
  getPlayableOfflineTrack,
  saveCachedTrackAudio,
} from './offlineStorage';
import { recordDownloadHistory } from './downloadHistory';

function warmArtworkCache(url?: string): void {
  if (!url || typeof window === 'undefined') return;
  if (url.startsWith('data:') || url.startsWith('blob:')) return;
  fetch(url, { mode: 'no-cors' }).catch(() => {});
}

export async function downloadTrackForOffline(
  track: Track,
  quality: AudioQualityMode = 'high',
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<Track> {
  if (!track || !track.id) {
    throw new Error('楽曲情報が見つかりません');
  }

  // Local or Shared Offline track: ensure blob is cached locally
  if (track.isLocal || track.isSharedOffline || track.id.startsWith('shared_')) {
    const playable = await getPlayableOfflineTrack(track);
    onProgress?.(100);
    return playable;
  }

  // Already cached in IndexedDB? Return hydrated track immediately
  const existing = await getCachedTrackAudioRecord(track.id);
  if (existing?.blob && existing.blob.size > 2048) {
    onProgress?.(100);
    return getPlayableOfflineTrack(track);
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('オフライン中は新しい楽曲をダウンロードできません');
  }

  const targetYtId = track.podcastVideoId || track.id;
  const effectiveQuality: AudioQualityMode =
    quality === 'hires' || quality === 'lossless' ? 'high' : quality;

  let streamUrl = `/api/music/audio-stream/${encodeURIComponent(targetYtId)}?quality=${encodeURIComponent(effectiveQuality)}`;
  if (track.trackType === 'podcast' && track.audioUrl && !track.podcastVideoId) {
    streamUrl = `/api/podcasts/proxy-audio?url=${encodeURIComponent(track.audioUrl)}`;
  }

  onProgress?.(5);

  const response = await fetch(streamUrl, { signal });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      errText && errText.length < 180
        ? `音声の取得に失敗しました (${response.status}): ${errText}`
        : `音声の取得に失敗しました (HTTP ${response.status})`
    );
  }

  const contentType = response.headers.get('content-type') || 'audio/mp4';
  if (contentType.includes('text/html') || contentType.includes('application/json')) {
    throw new Error('音声ストリームではなく無効なレスポンスが返されました');
  }

  const totalBytes = Number(response.headers.get('content-length') || '0');
  let blob: Blob;

  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        received += value.byteLength;
        if (totalBytes > 0) {
          onProgress?.(Math.min(95, Math.max(8, Math.round((received / totalBytes) * 90) + 5)));
        } else {
          onProgress?.(Math.min(90, 15 + Math.round(received / (1024 * 120))));
        }
      }
    }

    const blobParts = chunks.map((chunk) => new Uint8Array(chunk));
    blob = new Blob(blobParts, { type: contentType });
  } else {
    blob = await response.blob();
  }

  if (!blob || blob.size < 2048) {
    throw new Error('音声データが小さすぎるため保存を中断しました');
  }

  const audioUrl = await saveCachedTrackAudio(track, blob, effectiveQuality);
  onProgress?.(100);

  // Pre-warm lyrics, artwork, and track details non-blockingly so offline playback has full metadata
  api.getLyrics(track.id, track.title, track.artist, track.durationSeconds).catch(() => {});
  warmArtworkCache(track.thumbnail);

  const formatExt = contentType.includes('webm')
    ? 'webm'
    : contentType.includes('mpeg') || contentType.includes('mp3')
      ? 'mp3'
      : 'm4a';
  const qualityLabel =
    effectiveQuality === 'low' ? '節約' : effectiveQuality === 'normal' ? '標準' : '高音質';

  recordDownloadHistory({
    title: track.title,
    artist: track.artist,
    album: track.album,
    filename: `${track.title || track.id}.${formatExt}`,
    formatExt,
    mimeType: contentType,
    fileSize: blob.size,
    thumbnail: track.thumbnail,
    sourceLabel: `オフライン保存 (${qualityLabel})`,
    target: 'offline',
    videoId: track.id,
    duration: track.duration,
    durationSeconds: track.durationSeconds,
  });

  return {
    ...track,
    isCachedOffline: true,
    audioUrl,
    audioMimeType: contentType,
    fileSize: blob.size,
  };
}

export async function downloadCollectionForOffline(
  tracks: Track[],
  quality: AudioQualityMode = 'high',
  onProgress?: (done: number, total: number, currentTitle: string) => void,
  signal?: AbortSignal
): Promise<{ saved: number; skipped: number; failed: number }> {
  const uniqueTracks: Track[] = [];
  const seen = new Set<string>();
  for (const t of tracks) {
    if (!t?.id || seen.has(t.id)) continue;
    seen.add(t.id);
    uniqueTracks.push(t);
  }

  const cachedIds = await getCachedTrackAudioIds();
  let saved = 0;
  let skipped = 0;
  let failed = 0;
  const total = uniqueTracks.length;

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) break;
    const tr = uniqueTracks[i];
    onProgress?.(i, total, tr.title);

    if (tr.isLocal || cachedIds.has(tr.id)) {
      if (tr.isSharedOffline && !tr.audioUrl) {
        await getPlayableOfflineTrack(tr).catch(() => {});
      }
      skipped++;
      continue;
    }

    try {
      await downloadTrackForOffline(tr, quality, undefined, signal);
      cachedIds.add(tr.id);
      saved++;
    } catch {
      failed++;
    }
  }

  onProgress?.(total, total, '');
  return { saved, skipped, failed };
}
