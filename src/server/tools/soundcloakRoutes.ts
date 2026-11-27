import type { Express, Request, Response } from 'express';
import { assertSafeHttpUrl } from './ssrfGuard.js';

const SC_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const SOUNDCLOUD_HOST_ALLOWLIST = [
  'soundcloud.com',
  'soundcloud.cloud',
  'soundcloud.net',
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

function rankTranscodings(transcodings: any[]): any[] {
  const nonDrm = (Array.isArray(transcodings) ? transcodings : []).filter((t) => {
    const proto = String(t?.format?.protocol || '').toLowerCase();
    return Boolean(t?.url) && proto !== 'ctr-encrypted-hls' && proto !== 'cbc-encrypted-hls';
  });

  const score = (t: any): number => {
    const proto = String(t?.format?.protocol || '').toLowerCase();
    const mime = String(t?.format?.mime_type || '').toLowerCase();
    const preset = String(t?.preset || '').toLowerCase();

    if (proto === 'progressive') {
      if (mime === 'audio/mpeg') return 100;
      if (mime.includes('mp4')) return 95;
      return 90;
    }
    if (proto === 'hls') {
      if (mime === 'audio/mpegurl' || preset.startsWith('abr_')) return 10;
      if (preset.includes('aac_256')) return 88;
      if (preset.includes('aac_160')) return 85;
      if (mime.includes('mp4') || preset.includes('aac_')) return 82;
      if (mime === 'audio/mpeg') return 75;
      if (mime.includes('ogg')) return 60;
      return 40;
    }
    return 20;
  };

  return [...nonDrm].sort((a, b) => score(b) - score(a));
}

function mapScTrack(raw: any) {
  if (!raw) return null;
  const rawArt = String(raw.artwork_url || raw.user?.avatar_url || '');
  const artwork = rawArt
    ? rawArt.replace('-large.', '-t500x500.').replace('-t50x50.', '-t500x500.')
    : '';
  const ranked = rankTranscodings(raw.media?.transcodings || []);
  const chosen = ranked[0] || null;

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

  // Resolve stream URL (handles progressive MP3/AAC and HLS m3u8 with automatic transcoding fallback)
  const resolveTrackMedia = async (
    rawTranscoding: string,
    trackAuth: string,
    trackId: string,
    reqProtocol: string
  ): Promise<{ mediaUrl: string; protocol: string; title?: string; artist?: string } | null> => {
    const tryResolveCandidate = async (
      candUrl: string,
      candAuth: string,
      candProto: string
    ): Promise<{ mediaUrl: string; protocol: string } | null> => {
      try {
        const safeUrl = assertSafeHttpUrl(candUrl, SOUNDCLOUD_HOST_ALLOWLIST);
        const callWithClientId = async (cid: string) => {
          const u = new URL(safeUrl.toString());
          u.searchParams.set('client_id', cid);
          if (candAuth) {
            u.searchParams.set('track_authorization', candAuth);
          }
          return fetch(u.toString(), {
            headers: {
              'User-Agent': SC_USER_AGENT,
              Origin: 'https://soundcloud.com',
              Referer: 'https://soundcloud.com/',
            },
            signal: AbortSignal.timeout(8000),
          });
        };

        let resolveResp = await callWithClientId(await fetchSoundCloudClientId(false));
        if (resolveResp.status === 401 || resolveResp.status === 403) {
          resolveResp = await callWithClientId(await fetchSoundCloudClientId(true));
        }
        if (!resolveResp.ok) return null;
        const resolveJson: any = await resolveResp.json();
        const mediaUrl = String(resolveJson?.url || '');
        if (!mediaUrl) return null;
        return { mediaUrl, protocol: candProto };
      } catch {
        return null;
      }
    };

    let resolved: { mediaUrl: string; protocol: string } | null = null;
    let title: string | undefined;
    let artist: string | undefined;

    if (rawTranscoding && !rawTranscoding.includes('/abr_')) {
      resolved = await tryResolveCandidate(rawTranscoding, trackAuth, reqProtocol);
    }

    if (!resolved && trackId) {
      const trackData = await scApiFetch(`/tracks/${encodeURIComponent(trackId)}`);
      title = trackData?.title ? String(trackData.title) : undefined;
      artist = trackData?.user?.username ? String(trackData.user.username) : undefined;
      const freshAuth = String(trackData?.track_authorization || trackAuth || '');
      const candidates = rankTranscodings(trackData?.media?.transcodings || []);
      for (const cand of candidates) {
        resolved = await tryResolveCandidate(
          String(cand.url || ''),
          freshAuth,
          String(cand?.format?.protocol || '')
        );
        if (resolved) break;
      }
    } else if (!resolved && rawTranscoding) {
      resolved = await tryResolveCandidate(rawTranscoding, trackAuth, reqProtocol);
    }

    if (!resolved) return null;
    return { ...resolved, title, artist };
  };

  app.get('/api/tools/soundcloak/stream', async (req: Request, res: Response) => {
    const rawTranscoding = String(req.query.transcodingUrl || '').trim();
    const trackAuth = String(req.query.auth || '').trim();
    const trackId = String(req.query.id || '').trim();
    const reqProtocol = String(req.query.protocol || '').trim();

    try {
      const resolved = await resolveTrackMedia(rawTranscoding, trackAuth, trackId, reqProtocol);
      if (!resolved) {
        return res.status(404).json({
          success: false,
          error: 'このトラックの再生ストリームを取得できませんでした（地域制限またはDRM保護の可能性があります）',
        });
      }

      const { mediaUrl, protocol } = resolved;
      const isHls = protocol === 'hls' || mediaUrl.includes('.m3u8');
      const dlParams = new URLSearchParams();
      if (trackId) dlParams.set('id', trackId);
      if (rawTranscoding) dlParams.set('transcodingUrl', rawTranscoding);
      if (trackAuth) dlParams.set('auth', trackAuth);
      if (protocol) dlParams.set('protocol', protocol);

      return res.json({
        success: true,
        isHls,
        playUrl: isHls
          ? `/api/tools/soundcloak/hls?url=${encodeURIComponent(mediaUrl)}`
          : `/api/tools/soundcloak/audio?url=${encodeURIComponent(mediaUrl)}`,
        downloadUrl: `/api/tools/soundcloak/download?${dlParams.toString()}`,
      });
    } catch (err: any) {
      return res.status(502).json({ success: false, error: err?.message || 'SoundCloak stream resolution failed' });
    }
  });

  // Download full track (supports both progressive MP3/M4A and HLS fMP4/TS concatenation)
  app.get('/api/tools/soundcloak/download', async (req: Request, res: Response) => {
    const rawTranscoding = String(req.query.transcodingUrl || '').trim();
    const trackAuth = String(req.query.auth || '').trim();
    const trackId = String(req.query.id || '').trim();
    const reqProtocol = String(req.query.protocol || '').trim();
    const qTitle = String(req.query.title || '').trim();
    const qArtist = String(req.query.artist || '').trim();

    const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;
    const MAX_HLS_SEGMENTS = 360;

    try {
      const resolved = await resolveTrackMedia(rawTranscoding, trackAuth, trackId, reqProtocol);
      if (!resolved) {
        return res.status(404).json({
          success: false,
          error: 'ダウンロード用ストリームを取得できませんでした（DRM保護または非公開の可能性があります）',
        });
      }

      const baseLabel = [qArtist || resolved.artist, qTitle || resolved.title]
        .filter(Boolean)
        .join(' - ')
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .trim() || `soundcloak-${trackId || 'track'}`;

      const sendAttachment = (buf: Buffer, ext: string, contentType: string) => {
        const asciiFallback = `${baseLabel.replace(/[^\x20-\x7e]/g, '_') || 'soundcloak-track'}.${ext}`;
        const utf8Name = encodeURIComponent(`${baseLabel}.${ext}`);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', String(buf.length));
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Name}`
        );
        return res.send(buf);
      };

      const isHls = resolved.protocol === 'hls' || resolved.mediaUrl.includes('.m3u8');
      if (!isHls) {
        const safeMedia = assertSafeHttpUrl(resolved.mediaUrl, SOUNDCLOUD_HOST_ALLOWLIST);
        const upstream = await fetch(safeMedia.toString(), {
          headers: { 'User-Agent': SC_USER_AGENT },
          signal: AbortSignal.timeout(30000),
        });
        if (!upstream.ok) {
          return res.status(upstream.status).json({ success: false, error: '音声ファイルの取得に失敗しました' });
        }
        const ct = (upstream.headers.get('content-type') || 'audio/mpeg').toLowerCase();
        const buf = Buffer.from(await upstream.arrayBuffer());
        if (buf.length > MAX_DOWNLOAD_BYTES) {
          return res.status(413).json({ success: false, error: 'ファイルサイズが上限（50MB）を超えています' });
        }
        const ext = ct.includes('mp4') || ct.includes('aac') ? 'm4a' : ct.includes('ogg') ? 'ogg' : 'mp3';
        return sendAttachment(buf, ext, ct);
      }

      // Resolve HLS playlist (and follow 1 master->variant hop if needed)
      let playlistUrl = assertSafeHttpUrl(resolved.mediaUrl, SOUNDCLOUD_HOST_ALLOWLIST);
      let plResp = await fetch(playlistUrl.toString(), {
        headers: { 'User-Agent': SC_USER_AGENT },
        signal: AbortSignal.timeout(10000),
      });
      if (!plResp.ok) {
        return res.status(plResp.status).json({ success: false, error: 'HLSプレイリスト取得に失敗しました' });
      }
      let m3u8 = await plResp.text();

      if (m3u8.includes('#EXT-X-STREAM-INF')) {
        const variantLine = m3u8
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find((l) => l && !l.startsWith('#'));
        if (variantLine) {
          playlistUrl = assertSafeHttpUrl(
            new URL(variantLine, playlistUrl.toString()).toString(),
            SOUNDCLOUD_HOST_ALLOWLIST
          );
          plResp = await fetch(playlistUrl.toString(), {
            headers: { 'User-Agent': SC_USER_AGENT },
            signal: AbortSignal.timeout(10000),
          });
          if (!plResp.ok) {
            return res.status(plResp.status).json({ success: false, error: 'HLSバリアント取得に失敗しました' });
          }
          m3u8 = await plResp.text();
        }
      }

      const segmentUrls: string[] = [];
      const mapMatch = m3u8.match(/#EXT-X-MAP:[^\r\n]*URI="([^"]+)"/i);
      if (mapMatch?.[1]) {
        const absMap = assertSafeHttpUrl(
          new URL(mapMatch[1], playlistUrl.toString()).toString(),
          SOUNDCLOUD_HOST_ALLOWLIST
        );
        segmentUrls.push(absMap.toString());
      }

      for (const line of m3u8.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const absSeg = assertSafeHttpUrl(
          new URL(trimmed, playlistUrl.toString()).toString(),
          SOUNDCLOUD_HOST_ALLOWLIST
        );
        segmentUrls.push(absSeg.toString());
        if (segmentUrls.length >= MAX_HLS_SEGMENTS) break;
      }

      if (segmentUrls.length === 0) {
        return res.status(404).json({ success: false, error: 'ダウンロード可能な音声セグメントが見つかりませんでした' });
      }

      const chunks: Buffer[] = new Array(segmentUrls.length);
      let totalBytes = 0;
      const BATCH_SIZE = 8;
      for (let i = 0; i < segmentUrls.length; i += BATCH_SIZE) {
        const batch = segmentUrls.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (segUrl, offset) => {
            const segResp = await fetch(segUrl, {
              headers: { 'User-Agent': SC_USER_AGENT },
              signal: AbortSignal.timeout(15000),
            });
            if (!segResp.ok) {
              throw new Error(`Segment HTTP ${segResp.status}`);
            }
            const segBuf = Buffer.from(await segResp.arrayBuffer());
            totalBytes += segBuf.length;
            if (totalBytes > MAX_DOWNLOAD_BYTES) {
              throw new Error('Download exceeds 50MB limit');
            }
            chunks[i + offset] = segBuf;
          })
        );
      }

      const combined = Buffer.concat(chunks);
      const isFmp4 =
        Boolean(mapMatch) ||
        segmentUrls.some((u) => u.includes('.m4s') || u.includes('.mp4') || u.includes('init.mp4'));
      return sendAttachment(
        combined,
        isFmp4 ? 'm4a' : 'mp3',
        isFmp4 ? 'audio/mp4' : 'audio/mpeg'
      );
    } catch (err: any) {
      return res.status(502).json({ success: false, error: err?.message || 'ダウンロード処理に失敗しました' });
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
