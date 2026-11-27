import type { Express, Request, Response } from 'express';
import { assertSafeHttpUrl } from './ssrfGuard.js';

const SC_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const SOUNDCLOUD_HOST_ALLOWLIST = [
  'soundcloud.com',
  'sndcdn.com',
  'akamaized.net',
  'cloudfront.net',
];

let cachedClientId: { value: string; expiresAt: number } | null = null;
let clientIdPromise: Promise<string> | null = null;

async function fetchSoundCloudClientId(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedClientId && Date.now() < cachedClientId.expiresAt) {
    return cachedClientId.value;
  }
  if (!forceRefresh && clientIdPromise) {
    return clientIdPromise;
  }

  clientIdPromise = (async () => {
    const homeResp = await fetch('https://soundcloud.com/discover', {
      headers: {
        'User-Agent': SC_USER_AGENT,
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!homeResp.ok) {
      throw new Error(`SoundCloud returned HTTP ${homeResp.status}`);
    }
    const html = await homeResp.text();

    // 1. Check __sc_hydration inline JSON (matches SoundCloak init.go)
    const hydrationMatch = html.match(/"hydratable":"apiClient","data":\{"id":"([A-Za-z0-9]{32})"/);
    if (hydrationMatch?.[1]) {
      cachedClientId = { value: hydrationMatch[1], expiresAt: Date.now() + 6 * 3600 * 1000 };
      return hydrationMatch[1];
    }

    // 2. Scan linked asset bundles (a-v2.sndcdn.com/assets/*.js)
    const scriptMatches = [...html.matchAll(/<script[^>]+src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g)]
      .map((m) => m[1])
      .reverse();

    for (const scriptUrl of scriptMatches.slice(0, 8)) {
      try {
        const jsResp = await fetch(scriptUrl, {
          headers: { 'User-Agent': SC_USER_AGENT },
          signal: AbortSignal.timeout(6000),
        });
        if (!jsResp.ok) continue;
        const jsText = await jsResp.text();
        const cidMatch =
          jsText.match(/client_id\s*:\s*"([A-Za-z0-9]{32})"/) ||
          jsText.match(/client_id=([A-Za-z0-9]{32})/);
        if (cidMatch?.[1]) {
          cachedClientId = { value: cidMatch[1], expiresAt: Date.now() + 6 * 3600 * 1000 };
          return cidMatch[1];
        }
      } catch {
        // try next bundle
      }
    }

    throw new Error('Could not resolve SoundCloud client_id');
  })().finally(() => {
    clientIdPromise = null;
  });

  return clientIdPromise;
}

async function scApiFetch(pathAndQuery: string): Promise<any> {
  const clientId = await fetchSoundCloudClientId(false);
  const sep = pathAndQuery.includes('?') ? '&' : '?';
  const url = `https://api-v2.soundcloud.com${pathAndQuery}${sep}client_id=${encodeURIComponent(clientId)}`;
  let resp = await fetch(url, {
    headers: {
      'User-Agent': SC_USER_AGENT,
      Origin: 'https://soundcloud.com',
      Referer: 'https://soundcloud.com/',
    },
    signal: AbortSignal.timeout(8000),
  });

  if (resp.status === 401 || resp.status === 403) {
    const freshId = await fetchSoundCloudClientId(true);
    const retryUrl = `https://api-v2.soundcloud.com${pathAndQuery}${sep}client_id=${encodeURIComponent(freshId)}`;
    resp = await fetch(retryUrl, {
      headers: {
        'User-Agent': SC_USER_AGENT,
        Origin: 'https://soundcloud.com',
        Referer: 'https://soundcloud.com/',
      },
      signal: AbortSignal.timeout(8000),
    });
  }

  if (!resp.ok) {
    throw new Error(`SoundCloud API HTTP ${resp.status}`);
  }
  return resp.json();
}

function mapScTrack(raw: any) {
  if (!raw) return null;
  const rawArt = String(raw.artwork_url || raw.user?.avatar_url || '');
  const artwork = rawArt
    ? rawArt.replace('-large.', '-t500x500.').replace('-t50x50.', '-t500x500.')
    : '';
  const transcodings: any[] = Array.isArray(raw.media?.transcodings) ? raw.media.transcodings : [];
  const progressive = transcodings.find((t) => t?.format?.protocol === 'progressive');
  const hlsAudio =
    transcodings.find((t) => t?.format?.protocol === 'hls' && String(t?.format?.mime_type || '').includes('mpeg')) ||
    transcodings.find((t) => t?.format?.protocol === 'hls');
  const chosen = progressive || hlsAudio || transcodings[0] || null;

  return {
    id: String(raw.id || ''),
    title: String(raw.title || 'Untitled'),
    artist: String(raw.user?.username || raw.user?.full_name || 'Unknown Artist'),
    artistPermalink: String(raw.user?.permalink_url || ''),
    permalinkUrl: String(raw.permalink_url || ''),
    artwork,
    genre: String(raw.genre || ''),
    durationMs: Number(raw.duration || raw.full_duration || 0),
    playbackCount: Number(raw.playback_count || 0),
    likesCount: Number(raw.likes_count || 0),
    waveformUrl: String(raw.waveform_url || ''),
    policy: String(raw.policy || 'ALLOW'),
    trackAuthorization: String(raw.track_authorization || ''),
    transcodingUrl: chosen?.url ? String(chosen.url) : '',
    transcodingProtocol: chosen?.format?.protocol ? String(chosen.format.protocol) : '',
    transcodingMime: chosen?.format?.mime_type ? String(chosen.format.mime_type) : '',
  };
}

export function registerSoundCloakRoutes(app: Express) {
  // Trending / Discover mixed selections & fallback charts
  app.get('/api/tools/soundcloak/discover', async (_req: Request, res: Response) => {
    try {
      const tracks: any[] = [];
      const seen = new Set<string>();

      try {
        const data = await scApiFetch('/mixed-selections?limit=8&offset=0');
        const collections = Array.isArray(data?.collection) ? data.collection : [];
        for (const col of collections) {
          const playlists = col?.items?.collection || [];
          for (const pl of playlists) {
            for (const t of pl?.tracks || []) {
              if (t?.title && t?.media?.transcodings?.length && !seen.has(String(t.id))) {
                seen.add(String(t.id));
                tracks.push(mapScTrack(t));
              }
            }
            if (tracks.length >= 24) break;
          }
          if (tracks.length >= 24) break;
        }
      } catch {
        // fallback to charts
      }

      if (tracks.length === 0) {
        try {
          const chart = await scApiFetch('/charts?kind=top&genre=soundcloud%3Agenres%3Aall-music&limit=24');
          for (const entry of chart?.collection || []) {
            const t = entry?.track || entry;
            if (t?.id && t?.media?.transcodings?.length && !seen.has(String(t.id))) {
              seen.add(String(t.id));
              tracks.push(mapScTrack(t));
            }
          }
        } catch {
          // fallback to popular search
        }
      }

      if (tracks.length === 0) {
        const searchFallback = await scApiFetch('/search/tracks?q=jpop%20electronic&limit=24&offset=0');
        for (const t of searchFallback?.collection || []) {
          if (t?.id && t?.media?.transcodings?.length && !seen.has(String(t.id))) {
            seen.add(String(t.id));
            tracks.push(mapScTrack(t));
          }
        }
      }

      return res.json({ success: true, tracks });
    } catch (err: any) {
      return res.status(502).json({ success: false, error: err?.message || 'SoundCloak discover failed', tracks: [] });
    }
  });

  // Search tracks / playlists / users
  app.get('/api/tools/soundcloak/search', async (req: Request, res: Response) => {
    const q = String(req.query.q || '').trim();
    const kind = String(req.query.kind || 'tracks').trim();
    if (!q) {
      return res.json({ success: true, tracks: [], users: [], playlists: [] });
    }

    try {
      const safeKind = ['tracks', 'users', 'playlists'].includes(kind) ? kind : 'tracks';
      const data = await scApiFetch(`/search/${safeKind}?q=${encodeURIComponent(q)}&limit=24&offset=0`);
      const collection = Array.isArray(data?.collection) ? data.collection : [];

      if (safeKind === 'tracks') {
        const tracks = collection.map(mapScTrack).filter(Boolean);
        return res.json({ success: true, kind: 'tracks', tracks });
      }
      if (safeKind === 'users') {
        const users = collection.map((u: any) => ({
          id: String(u.id || ''),
          username: String(u.username || ''),
          avatar: String(u.avatar_url || '').replace('-large.', '-t500x500.'),
          followersCount: Number(u.followers_count || 0),
          trackCount: Number(u.track_count || 0),
          permalinkUrl: String(u.permalink_url || ''),
        }));
        return res.json({ success: true, kind: 'users', users });
      }
      const playlists = collection.map((pl: any) => ({
        id: String(pl.id || ''),
        title: String(pl.title || ''),
        artist: String(pl.user?.username || ''),
        artwork: String(pl.artwork_url || pl.user?.avatar_url || '').replace('-large.', '-t500x500.'),
        trackCount: Number(pl.track_count || 0),
        tracks: Array.isArray(pl.tracks) ? pl.tracks.map(mapScTrack).filter(Boolean) : [],
      }));
      return res.json({ success: true, kind: 'playlists', playlists });
    } catch (err: any) {
      return res.status(502).json({ success: false, error: err?.message || 'SoundCloak search failed' });
    }
  });

  // Resolve stream URL (handles progressive MP3 and HLS m3u8)
  app.get('/api/tools/soundcloak/stream', async (req: Request, res: Response) => {
    const rawTranscoding = String(req.query.transcodingUrl || '').trim();
    const trackAuth = String(req.query.auth || '').trim();
    const trackId = String(req.query.id || '').trim();

    try {
      let transcodingUrl = rawTranscoding;
      let authorization = trackAuth;
      let protocol = String(req.query.protocol || '');

      if (!transcodingUrl && trackId) {
        const trackData = await scApiFetch(`/tracks/${encodeURIComponent(trackId)}`);
        const mapped = mapScTrack(trackData);
        if (!mapped?.transcodingUrl) {
          return res.status(404).json({ success: false, error: 'Stream not available for this track' });
        }
        transcodingUrl = mapped.transcodingUrl;
        authorization = mapped.trackAuthorization;
        protocol = mapped.transcodingProtocol;
      }

      const safeUrl = assertSafeHttpUrl(transcodingUrl, SOUNDCLOUD_HOST_ALLOWLIST);
      const clientId = await fetchSoundCloudClientId(false);
      safeUrl.searchParams.set('client_id', clientId);
      if (authorization) {
        safeUrl.searchParams.set('track_authorization', authorization);
      }

      const resolveResp = await fetch(safeUrl.toString(), {
        headers: {
          'User-Agent': SC_USER_AGENT,
          Origin: 'https://soundcloud.com',
          Referer: 'https://soundcloud.com/',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!resolveResp.ok) {
        return res.status(resolveResp.status).json({ success: false, error: 'Failed to resolve SoundCloud media URL' });
      }
      const resolveJson: any = await resolveResp.json();
      const mediaUrl = String(resolveJson?.url || '');
      if (!mediaUrl) {
        return res.status(404).json({ success: false, error: 'No media URL returned' });
      }

      const isHls = protocol === 'hls' || mediaUrl.includes('.m3u8');
      return res.json({
        success: true,
        isHls,
        playUrl: isHls
          ? `/api/tools/soundcloak/hls?url=${encodeURIComponent(mediaUrl)}`
          : `/api/tools/soundcloak/audio?url=${encodeURIComponent(mediaUrl)}`,
        downloadUrl: !isHls ? `/api/tools/soundcloak/audio?url=${encodeURIComponent(mediaUrl)}&download=1` : undefined,
      });
    } catch (err: any) {
      return res.status(502).json({ success: false, error: err?.message || 'SoundCloak stream resolution failed' });
    }
  });

  // Rewrites SoundCloud HLS playlist segments through our proxy
  app.get('/api/tools/soundcloak/hls', async (req: Request, res: Response) => {
    const rawUrl = String(req.query.url || '').trim();
    try {
      const safeUrl = assertSafeHttpUrl(rawUrl, SOUNDCLOUD_HOST_ALLOWLIST);
      const upstream = await fetch(safeUrl.toString(), {
        headers: { 'User-Agent': SC_USER_AGENT },
        signal: AbortSignal.timeout(8000),
      });
      if (!upstream.ok) {
        return res.status(upstream.status).send('HLS upstream error');
      }
      let m3u8 = await upstream.text();
      m3u8 = m3u8.replace(/(URI=")([^"]+)(")/g, (_m, p1, uri, p3) => {
        const abs = new URL(uri, safeUrl.toString()).toString();
        return `${p1}/api/tools/soundcloak/audio?url=${encodeURIComponent(abs)}${p3}`;
      });
      m3u8 = m3u8
        .split(/\r?\n/)
        .map((line) => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const abs = new URL(trimmed, safeUrl.toString()).toString();
            return `/api/tools/soundcloak/audio?url=${encodeURIComponent(abs)}`;
          }
          return line;
        })
        .join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache');
      return res.send(m3u8);
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Invalid HLS URL' });
    }
  });

  // Proxies SoundCloud MP3 / HLS segments with Range support
  app.get('/api/tools/soundcloak/audio', async (req: Request, res: Response) => {
    const rawUrl = String(req.query.url || '').trim();
    try {
      const safeUrl = assertSafeHttpUrl(rawUrl, SOUNDCLOUD_HOST_ALLOWLIST);
      const headers: Record<string, string> = { 'User-Agent': SC_USER_AGENT };
      if (req.headers.range) {
        headers.Range = String(req.headers.range);
      }

      const upstream = await fetch(safeUrl.toString(), {
        headers,
        signal: AbortSignal.timeout(15000),
      });
      if (!upstream.ok && upstream.status !== 206) {
        return res.status(upstream.status).end();
      }

      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg');
      res.setHeader('Accept-Ranges', 'bytes');
      const cl = upstream.headers.get('content-length');
      const cr = upstream.headers.get('content-range');
      if (cl) res.setHeader('Content-Length', cl);
      if (cr) res.setHeader('Content-Range', cr);
      if (req.query.download === '1') {
        res.setHeader('Content-Disposition', 'attachment; filename="soundcloak-track.mp3"');
      }

      const buf = Buffer.from(await upstream.arrayBuffer());
      return res.status(upstream.status).send(buf);
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Invalid audio URL' });
    }
  });
}
