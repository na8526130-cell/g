import type { Express, Request, Response } from 'express';
import type { Innertube } from 'youtubei.js';
import { kvCache } from './kvCache.js';
import { resolveViaPipedPool, resolveViaInvidiousPool } from './downloadSites.js';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

interface ResolvedAudioStream {
  url: string;
  headers: Record<string, string>;
  mimeType: string;
  codec: string;
  bitrateKbps: number;
  sampleRateHz: number;
  contentLength: number;
  sourceLabel: string;
}

function parseCodecFromMime(mime: string): string {
  const lower = (mime || '').toLowerCase();
  if (lower.includes('opus')) return 'Opus';
  if (lower.includes('flac')) return 'FLAC';
  if (lower.includes('mp4a') || lower.includes('aac')) return 'AAC';
  if (lower.includes('vorbis')) return 'Vorbis';
  if (lower.includes('mp3') || lower.includes('mpeg')) return 'MP3';
  return 'Audio';
}

async function probeAudioUrl(
  url: string,
  headers: Record<string, string>
): Promise<{ ok: boolean; status: number; totalSize: number; contentType: string }> {
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        ...headers,
        Range: 'bytes=0-1023',
      },
      signal: AbortSignal.timeout(4500),
    });
    if (!resp.ok && resp.status !== 206) {
      return { ok: false, status: resp.status, totalSize: 0, contentType: '' };
    }
    const cr = resp.headers.get('content-range') || '';
    const match = cr.match(/\/(\d+)/);
    const totalSize = match ? Number(match[1]) : Number(resp.headers.get('content-length') || 0);
    const contentType = resp.headers.get('content-type') || 'audio/mp4';
    try {
      await resp.body?.cancel();
    } catch {}
    return { ok: true, status: resp.status, totalSize, contentType };
  } catch {
    return { ok: false, status: 0, totalSize: 0, contentType: '' };
  }
}

function selectFormatsByQuality(formats: any[], quality: string): any[] {
  const audioOnly = formats.filter((f) => {
    const url = f?.url;
    const mime = String(f?.mimeType || f?.mime_type || '').toLowerCase();
    return typeof url === 'string' && url.length > 0 && mime.startsWith('audio/');
  });

  if (quality === 'low') {
    return [...audioOnly].sort((a, b) => (Number(a.bitrate) || 0) - (Number(b.bitrate) || 0));
  }
  if (quality === 'normal') {
    // Prefer ~128-160kbps balanced formats
    return [...audioOnly].sort((a, b) => {
      const da = Math.abs((Number(a.bitrate) || 128000) - 140000);
      const db = Math.abs((Number(b.bitrate) || 128000) - 140000);
      return da - db;
    });
  }
  // high / lossless / hires / auto: highest bitrate first, prefer opus/m4a
  return [...audioOnly].sort((a, b) => {
    const brDiff = (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0);
    if (Math.abs(brDiff) > 25000) return brDiff;
    const aM4a = String(a.mimeType || a.mime_type || '').includes('mp4') ? 0 : 1;
    const bM4a = String(b.mimeType || b.mime_type || '').includes('mp4') ? 0 : 1;
    return aM4a - bM4a;
  });
}

async function resolveAudioStreamForVideo(
  videoId: string,
  quality: string,
  getInnertube: () => Promise<Innertube>
): Promise<ResolvedAudioStream | null> {
  const qNorm = quality === 'low' || quality === 'normal' ? quality : 'best';
  const cacheKey = `audio_stream_v1_${videoId}_${qNorm}`;
  const cached = kvCache.get<ResolvedAudioStream>(cacheKey);
  if (cached) return cached;

  const cookie = (process.env.YOUTUBE_COOKIE || '').trim();
  const poToken = (process.env.YOUTUBE_PO_TOKEN || '').trim();

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
  ];

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
        signal: AbortSignal.timeout(4500),
      });
      if (!resp.ok) continue;

      const json = (await resp.json()) as any;
      const adaptive = Array.isArray(json?.streamingData?.adaptiveFormats)
        ? json.streamingData.adaptiveFormats
        : [];
      const streamHeaders: Record<string, string> = cookie
        ? { Cookie: cookie, 'User-Agent': c.ua }
        : { 'User-Agent': c.ua };

      const candidates = selectFormatsByQuality(adaptive, qNorm);
      for (const fmt of candidates.slice(0, 3)) {
        if (!fmt?.url) continue;
        const probe = await probeAudioUrl(fmt.url, streamHeaders);
        if (probe.ok) {
          const mimeType = String(fmt.mimeType || probe.contentType || 'audio/mp4').split(';')[0];
          const resolved: ResolvedAudioStream = {
            url: fmt.url,
            headers: streamHeaders,
            mimeType,
            codec: parseCodecFromMime(String(fmt.mimeType || mimeType)),
            bitrateKbps: Math.round((Number(fmt.bitrate) || 128000) / 1000),
            sampleRateHz: Number(fmt.audioSampleRate) || 48000,
            contentLength: Number(fmt.contentLength) || probe.totalSize || 0,
            sourceLabel: `YouTube Direct (${c.name})`,
          };
          kvCache.set(cacheKey, resolved, 20 * 60);
          return resolved;
        }
      }
    } catch {}
  }

  // Fallback to Innertube decipher
  try {
    const yt = await getInnertube();
    for (const clientKey of ['IOS', 'ANDROID', 'TV_EMBEDDED', 'WEB'] as const) {
      try {
        const info = await yt.getBasicInfo(videoId, { client: clientKey });
        const adaptive = info?.streaming_data?.adaptive_formats || [];
        const sorted = selectFormatsByQuality(adaptive, qNorm);
        for (const fmt of sorted.slice(0, 2)) {
          const deciphered = fmt.url || (await fmt.decipher(yt.session.player));
          if (!deciphered) continue;
          const headers = { 'User-Agent': BROWSER_UA };
          const probe = await probeAudioUrl(deciphered, headers);
          if (probe.ok) {
            const mimeType = String(fmt.mime_type || probe.contentType || 'audio/mp4').split(';')[0];
            const resolved: ResolvedAudioStream = {
              url: deciphered,
              headers,
              mimeType,
              codec: parseCodecFromMime(String(fmt.mime_type || mimeType)),
              bitrateKbps: Math.round((Number(fmt.bitrate) || 128000) / 1000),
              sampleRateHz: Number(fmt.audio_sample_rate) || 48000,
              contentLength: Number(fmt.content_length) || probe.totalSize || 0,
              sourceLabel: `InnerTube (${clientKey})`,
            };
            kvCache.set(cacheKey, resolved, 20 * 60);
            return resolved;
          }
        }
      } catch {}
    }
  } catch {}

  // Fallback to Piped / Invidious pools
  try {
    const piped = await resolveViaPipedPool(
      videoId,
      false,
      async (url, headers) => probeAudioUrl(url, headers),
      Boolean(process.env.VERCEL)
    );
    if (piped?.url) {
      const resolved: ResolvedAudioStream = {
        url: piped.url,
        headers: { 'User-Agent': BROWSER_UA },
        mimeType: 'audio/mp4',
        codec: 'AAC/Opus',
        bitrateKbps: 160,
        sampleRateHz: 48000,
        contentLength: 0,
        sourceLabel: piped.sourceLabel,
      };
      kvCache.set(cacheKey, resolved, 15 * 60);
      return resolved;
    }
  } catch {}

  try {
    const inv = await resolveViaInvidiousPool(
      videoId,
      false,
      async (url, headers) => probeAudioUrl(url, headers),
      Boolean(process.env.VERCEL)
    );
    if (inv?.url) {
      const resolved: ResolvedAudioStream = {
        url: inv.url,
        headers: { 'User-Agent': BROWSER_UA },
        mimeType: 'audio/mp4',
        codec: 'AAC/Opus',
        bitrateKbps: 160,
        sampleRateHz: 48000,
        contentLength: 0,
        sourceLabel: inv.sourceLabel,
      };
      kvCache.set(cacheKey, resolved, 15 * 60);
      return resolved;
    }
  } catch {}

  return null;
}

export function registerAudioStreamRoutes(
  app: Express,
  getInnertube: () => Promise<Innertube>
) {
  app.get('/api/music/audio-stream/info/:id', async (req: Request, res: Response) => {
    const videoId = String(req.params.id || '').trim();
    const quality = String(req.query.quality || 'high').trim();
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return res.status(400).json({ error: 'Invalid videoId' });
    }
    const resolved = await resolveAudioStreamForVideo(videoId, quality, getInnertube);
    if (!resolved) {
      return res.status(404).json({ available: false, error: 'Direct audio stream unavailable' });
    }
    res.json({
      available: true,
      codec: resolved.codec,
      bitrateKbps: resolved.bitrateKbps,
      sampleRateHz: resolved.sampleRateHz,
      mimeType: resolved.mimeType,
      sourceLabel: resolved.sourceLabel,
      contentLength: resolved.contentLength,
    });
  });

  app.get('/api/music/audio-stream/:id', async (req: Request, res: Response) => {
    const videoId = String(req.params.id || '').trim();
    const quality = String(req.query.quality || 'high').trim();
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return res.status(400).json({ error: 'Invalid videoId' });
    }

    try {
      const resolved = await resolveAudioStreamForVideo(videoId, quality, getInnertube);
      if (!resolved) {
        return res.status(404).json({ error: 'Audio stream unavailable' });
      }

      const upstreamHeaders: Record<string, string> = {
        ...resolved.headers,
      };
      if (req.headers.range) {
        upstreamHeaders.Range = String(req.headers.range);
      }

      const controller = new AbortController();
      req.on('close', () => {
        try {
          controller.abort();
        } catch {}
      });

      const upstream = await fetch(resolved.url, {
        headers: upstreamHeaders,
        signal: controller.signal,
      });

      if (!upstream.ok && upstream.status !== 206) {
        // Evict stale cache entry on 403/410
        kvCache.delete(`audio_stream_v1_${videoId}_${quality === 'low' || quality === 'normal' ? quality : 'best'}`);
        return res.status(502).json({ error: `Upstream audio status ${upstream.status}` });
      }

      res.status(upstream.status === 206 ? 206 : 200);
      res.setHeader('Content-Type', upstream.headers.get('content-type') || resolved.mimeType);
      res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) res.setHeader('Content-Range', contentRange);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Audio-Codec', resolved.codec);
      res.setHeader('X-Audio-Bitrate', String(resolved.bitrateKbps));
      res.setHeader('X-Sample-Rate', String(resolved.sampleRateHz));
      res.setHeader('X-Quality-Mode', quality);
      res.setHeader(
        'Access-Control-Expose-Headers',
        'X-Audio-Codec, X-Audio-Bitrate, X-Sample-Rate, X-Quality-Mode'
      );

      if (!upstream.body) {
        return res.end();
      }

      const reader = upstream.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.length > 0) {
            const canContinue = res.write(Buffer.from(value));
            if (!canContinue) {
              await new Promise<void>((resolveDrain) => res.once('drain', resolveDrain));
            }
          }
        }
        res.end();
      } catch {
        try {
          reader.cancel();
        } catch {}
        if (!res.writableEnded) res.end();
      }
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(500).json({ error: err?.message || 'Audio proxy failure' });
      }
    }
  });
}
