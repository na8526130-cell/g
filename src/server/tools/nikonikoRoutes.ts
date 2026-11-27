import crypto from 'node:crypto';
import WebSocket from 'ws';
import type { Express, Request, Response } from 'express';
import { assertSafeHttpUrl } from './ssrfGuard.js';

const NICO_API_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'X-Frontend-Id': '6',
  'X-Frontend-Version': '0',
  Referer: 'https://www.nicovideo.jp/',
  Origin: 'https://www.nicovideo.jp',
};

const NICO_MEDIA_HOST_ALLOWLIST = [
  'dmc.nico',
  'nicovideo.jp',
  'nimg.jp',
  'akamaized.net',
  'cloudfront.net',
  'edgesuite.net',
];

const NICO_COLOR_MAP: Record<string, string> = {
  white: '#FFFFFF',
  red: '#FF0000',
  pink: '#FF8080',
  orange: '#FFC000',
  yellow: '#FFFF00',
  green: '#00FF00',
  cyan: '#00FFFF',
  blue: '#0000FF',
  purple: '#C000FF',
  black: '#000000',
};

function sanitizeNicoId(raw: string): string {
  return String(raw || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'sm9';
}

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

function stripHtmlTags(str: string): string {
  return String(str || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function parseNicoCommands(commands: string[]) {
  let color = '#FFFFFF';
  let position: 'naka' | 'ue' | 'shita' = 'naka';
  let size: 'medium' | 'big' | 'small' = 'medium';
  for (const cmd of commands || []) {
    const lower = String(cmd || '').toLowerCase();
    if (lower === 'ue') position = 'ue';
    else if (lower === 'shita') position = 'shita';
    else if (lower === 'big') size = 'big';
    else if (lower === 'small') size = 'small';
    else if (/^#[0-9a-f]{6}$/i.test(lower)) color = lower;
    else if (NICO_COLOR_MAP[lower]) color = NICO_COLOR_MAP[lower];
  }
  return { color, position, size };
}

function mapNvapiItem(item: any) {
  const v = item?.essential || item?.video || item;
  const id = String(v?.id || '');
  const owner = v?.owner || item?.owner;
  return {
    id,
    title: String(v?.title || ''),
    channel: String(owner?.name || 'ニコニコユーザー'),
    channelAvatar: String(owner?.iconUrl || ''),
    thumbnail: String(v?.thumbnail?.largeUrl || v?.thumbnail?.middleUrl || v?.thumbnail?.url || ''),
    duration: formatDuration(Number(v?.duration || 0)),
    durationSeconds: Number(v?.duration || 0),
    views: Number(v?.count?.view || 0),
    commentCount: Number(v?.count?.comment || 0),
    mylistCount: Number(v?.count?.mylist || 0),
    likeCount: Number(v?.count?.like || 0),
    uploadedAt: v?.registeredAt ? String(v.registeredAt).slice(0, 10).replace(/-/g, '/') : '',
    shortDescription: stripHtmlTags(v?.shortDescription || ''),
  };
}

interface HlsSession {
  m3u8Url: string;
  cookieHeader: string;
  timestamp: number;
}

const watchV3Cache = new Map<string, { data: any; timestamp: number }>();
const nicoHlsSessionCache = new Map<string, HlsSession>();

async function fetchNicoWatchV3Guest(id: string): Promise<any | null> {
  const cleanId = sanitizeNicoId(id);
  const cached = watchV3Cache.get(cleanId);
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    return cached.data;
  }
  const trackId = `${crypto.randomBytes(5).toString('hex')}_${Date.now()}`;
  try {
    const resp = await fetch(
      `https://www.nicovideo.jp/api/watch/v3_guest/${encodeURIComponent(cleanId)}?actionTrackId=${encodeURIComponent(trackId)}`,
      { headers: NICO_API_HEADERS, signal: AbortSignal.timeout(7000) }
    );
    if (!resp.ok) return null;
    const json: any = await resp.json();
    if (json?.meta?.status === 200 && json?.data) {
      watchV3Cache.set(cleanId, { data: json.data, timestamp: Date.now() });
      return json.data;
    }
  } catch {
    // ignore
  }
  return null;
}

async function getLiveNicoStream(id: string, quality = '720', forceRefresh = false): Promise<HlsSession | null> {
  const cleanId = sanitizeNicoId(id);
  const qKey = String(quality || '720').replace(/\D/g, '') || '720';
  const cacheKey = `${cleanId}:${qKey}`;
  if (!forceRefresh) {
    const cached = nicoHlsSessionCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
      return cached;
    }
  }

  try {
    const htmlRes = await fetch(`https://www.nicovideo.jp/watch/${encodeURIComponent(cleanId)}`, {
      headers: {
        'User-Agent': NICO_API_HEADERS['User-Agent'],
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(8000),
    });
    const htmlCookies = typeof htmlRes.headers.getSetCookie === 'function' ? htmlRes.headers.getSetCookie() : [];
    const cookieHeader = htmlCookies.map((c) => c.split(';')[0]).join('; ');
    const html = await htmlRes.text();
    const m =
      html.match(/name="server-response"[^>]*content="([^"]+)"/) ||
      html.match(/content="([^"]+)"[^>]*name="server-response"/);
    if (!m?.[1]) return null;

    const parsed = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    const w = parsed?.data?.response?.['$watchV4'];
    const media = w?.data?.media;
    const accessRightKey = media?.accessRightKey;
    const trackId = w?.data?.client?.watchTrackId;
    if (!accessRightKey || !trackId || !media?.contents?.videos?.length) return null;

    const videos = media.contents.videos.filter((v: any) => v.isAvailable);
    const targetH = parseInt(qKey, 10) || 720;
    const getH = (vidId: string) => {
      const hm = String(vidId || '').match(/(\d+)p/);
      return hm ? parseInt(hm[1], 10) : 360;
    };
    const sorted = [...(videos.length ? videos : media.contents.videos)].sort(
      (a: any, b: any) => getH(b.id) - getH(a.id)
    );
    const vChoice = sorted.find((v: any) => getH(v.id) <= targetH) || sorted[sorted.length - 1];
    const aChoice = media.contents.audios?.find((a: any) => a.isAvailable) || media.contents.audios?.[0];

    const postRes = await fetch(
      `https://nvapi.nicovideo.jp/v1/watch/${encodeURIComponent(cleanId)}/access-rights/hls?actionTrackId=${encodeURIComponent(trackId)}`,
      {
        method: 'POST',
        headers: {
          ...NICO_API_HEADERS,
          Accept: 'application/json;charset=utf-8',
          'Content-Type': 'application/json',
          'X-Access-Right-Key': accessRightKey,
          'X-Request-With': 'https://www.nicovideo.jp',
          Cookie: cookieHeader,
          Referer: `https://www.nicovideo.jp/watch/${cleanId}`,
        },
        body: JSON.stringify({ outputs: [[vChoice.id, aChoice?.id].filter(Boolean)] }),
        signal: AbortSignal.timeout(7000),
      }
    );
    if (!postRes.ok) return null;
    const postCookies = typeof postRes.headers.getSetCookie === 'function' ? postRes.headers.getSetCookie() : [];
    const allCookies = [...htmlCookies, ...postCookies].map((c) => c.split(';')[0]).join('; ');
    const json: any = await postRes.json();
    const m3u8Url = json?.data?.contentUrl;
    if (!m3u8Url) return null;

    const session = { m3u8Url, cookieHeader: allCookies, timestamp: Date.now() };
    nicoHlsSessionCache.set(cacheKey, session);
    return session;
  } catch {
    return null;
  }
}

export function registerNikonikoRoutes(app: Express) {
  app.get('/api/tools/nikoniko/ranking', async (req: Request, res: Response) => {
    const genre = String(req.query.genre || 'all').trim();
    const term = String(req.query.term || '24h').trim();
    const allowedGenres = new Set(['all', 'game', 'anime', 'music_sound', 'entertainment', 'dance']);
    const allowedTerms = new Set(['hour', '24h', 'week', 'month', 'total']);
    const safeGenre = allowedGenres.has(genre) ? genre : 'all';
    const safeTerm = allowedTerms.has(term) ? term : '24h';

    try {
      const resp = await fetch(
        `https://nvapi.nicovideo.jp/v1/ranking/genre/${encodeURIComponent(safeGenre)}?term=${encodeURIComponent(safeTerm)}`,
        { headers: NICO_API_HEADERS, signal: AbortSignal.timeout(7000) }
      );
      if (resp.ok) {
        const json: any = await resp.json();
        const items = (json?.data?.items || []).slice(0, 24).map(mapNvapiItem);
        if (items.length > 0) {
          return res.json({ success: true, items, genre: safeGenre, term: safeTerm });
        }
      }
    } catch {
      // fallback below
    }

    try {
      const snap = await fetch(
        `https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?q=&targets=title&_sort=-viewCounter&_limit=20&fields=contentId,title,viewCounter,commentCounter,mylistCounter,thumbnailUrl,lengthSeconds,startTime`,
        { headers: { 'User-Agent': NICO_API_HEADERS['User-Agent'] }, signal: AbortSignal.timeout(6000) }
      );
      if (snap.ok) {
        const snapJson: any = await snap.json();
        const items = (snapJson?.data || []).map((x: any) => ({
          id: String(x.contentId || ''),
          title: String(x.title || ''),
          channel: 'ニコニコ動画',
          thumbnail: String(x.thumbnailUrl || ''),
          duration: formatDuration(Number(x.lengthSeconds || 0)),
          durationSeconds: Number(x.lengthSeconds || 0),
          views: Number(x.viewCounter || 0),
          commentCount: Number(x.commentCounter || 0),
          mylistCount: Number(x.mylistCounter || 0),
          uploadedAt: x.startTime ? String(x.startTime).slice(0, 10).replace(/-/g, '/') : '',
        }));
        return res.json({ success: true, items, genre: safeGenre, term: safeTerm });
      }
    } catch {
      // ignore
    }

    return res.status(502).json({ success: false, items: [], error: 'ランキングを取得できませんでした' });
  });

  app.get('/api/tools/nikoniko/search', async (req: Request, res: Response) => {
    const q = String(req.query.q || '').trim();
    const sort = String(req.query.sort || 'v').trim();
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    if (!q) return res.json({ success: true, items: [], total: 0 });

    const sortKeyMap: Record<string, string> = {
      v: 'viewCount',
      f: 'registeredAt',
      r: 'commentCount',
      m: 'mylistCount',
      l: 'likeCount',
    };
    const sortKey = sortKeyMap[sort] || 'viewCount';

    try {
      const resp = await fetch(
        `https://nvapi.nicovideo.jp/v2/search/video?keyword=${encodeURIComponent(q)}&sortKey=${sortKey}&sortOrder=desc&pageSize=24&page=${page}`,
        { headers: NICO_API_HEADERS, signal: AbortSignal.timeout(7000) }
      );
      if (resp.ok) {
        const json: any = await resp.json();
        const items = (json?.data?.items || []).map(mapNvapiItem);
        return res.json({
          success: true,
          items,
          total: Number(json?.data?.totalCount || items.length),
          hasNext: Boolean(json?.data?.hasNext),
        });
      }
    } catch {
      // fallback to snapshot
    }

    try {
      const snap = await fetch(
        `https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?q=${encodeURIComponent(q)}&targets=title,tags&_sort=-viewCounter&_limit=24&fields=contentId,title,viewCounter,commentCounter,mylistCounter,thumbnailUrl,lengthSeconds,startTime`,
        { headers: { 'User-Agent': NICO_API_HEADERS['User-Agent'] }, signal: AbortSignal.timeout(6000) }
      );
      if (snap.ok) {
        const snapJson: any = await snap.json();
        const items = (snapJson?.data || []).map((x: any) => ({
          id: String(x.contentId || ''),
          title: String(x.title || ''),
          channel: 'ニコニコ動画',
          thumbnail: String(x.thumbnailUrl || ''),
          duration: formatDuration(Number(x.lengthSeconds || 0)),
          durationSeconds: Number(x.lengthSeconds || 0),
          views: Number(x.viewCounter || 0),
          commentCount: Number(x.commentCounter || 0),
          mylistCount: Number(x.mylistCounter || 0),
          uploadedAt: x.startTime ? String(x.startTime).slice(0, 10).replace(/-/g, '/') : '',
        }));
        return res.json({ success: true, items, total: items.length, hasNext: false });
      }
    } catch {
      // ignore
    }

    return res.status(502).json({ success: false, items: [], error: '検索に失敗しました' });
  });

  app.get('/api/tools/nikoniko/video/:id', async (req: Request, res: Response) => {
    const id = sanitizeNicoId(req.params.id);
    const d = await fetchNicoWatchV3Guest(id);
    if (!d?.video) {
      return res.status(404).json({ success: false, error: '動画メタデータの取得に失敗しました' });
    }
    const v = d.video;
    const owner = d.owner;
    const ch = d.channel;
    return res.json({
      success: true,
      video: {
        id,
        title: String(v.title || id),
        channel: String(owner?.nickname || ch?.name || 'ニコニコ動画'),
        channelAvatar: String(owner?.iconUrl || ch?.thumbnail?.url || ''),
        thumbnail: String(v.thumbnail?.ogp || v.thumbnail?.player || v.thumbnail?.largeUrl || v.thumbnail?.url || ''),
        duration: formatDuration(Number(v.duration || 0)),
        durationSeconds: Number(v.duration || 0),
        views: Number(v.count?.view || 0),
        commentCount: Number(v.count?.comment || 0),
        mylistCount: Number(v.count?.mylist || 0),
        likeCount: Number(v.count?.like || 0),
        description: stripHtmlTags(v.description || ''),
        uploadedAt: v.registeredAt ? String(v.registeredAt).slice(0, 10).replace(/-/g, '/') : '',
        tags: Array.isArray(d.tag?.items) ? d.tag.items.map((t: any) => String(t.name)) : [],
      },
    });
  });

  app.get('/api/tools/nikoniko/comments/:id', async (req: Request, res: Response) => {
    const id = sanitizeNicoId(req.params.id);
    try {
      const v3 = await fetchNicoWatchV3Guest(id);
      const nvc = v3?.comment?.nvComment;
      if (!nvc?.server || !nvc?.threadKey || !nvc?.params) {
        return res.json({ success: true, comments: [] });
      }
      const safeServer = assertSafeHttpUrl(String(nvc.server), ['nicovideo.jp', 'nvcomment.nicovideo.jp']);
      const cResp = await fetch(`${safeServer.origin}/v1/threads`, {
        method: 'POST',
        headers: {
          ...NICO_API_HEADERS,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          params: nvc.params,
          threadKey: nvc.threadKey,
          additionals: {},
        }),
        signal: AbortSignal.timeout(6000),
      });
      if (!cResp.ok) {
        return res.json({ success: true, comments: [] });
      }
      const cJson: any = await cResp.json();
      const threads: any[] = Array.isArray(cJson?.data?.threads) ? cJson.data.threads : [];
      const raw: any[] = [];
      for (const th of threads) {
        for (const c of th?.comments || []) {
          if (typeof c.score === 'number' && c.score <= -10000) continue;
          if (!c.body) continue;
          raw.push(c);
        }
      }
      raw.sort((a, b) => Number(a.vposMs || 0) - Number(b.vposMs || 0));
      const comments = raw.slice(0, 800).map((c) => {
        const parsed = parseNicoCommands(Array.isArray(c.commands) ? c.commands : []);
        return {
          id: String(c.id || `${c.vposMs}-${c.body}`),
          text: String(c.body),
          timeMs: Number(c.vposMs || 0),
          color: parsed.color,
          position: parsed.position,
          size: parsed.size,
        };
      });
      return res.json({ success: true, comments });
    } catch {
      return res.json({ success: true, comments: [] });
    }
  });

  app.get('/api/tools/nikoniko/hls/:id/master.m3u8', async (req: Request, res: Response) => {
    const id = sanitizeNicoId(req.params.id);
    const quality = String(req.query.quality || req.query.q || '720');
    let session = await getLiveNicoStream(id, quality);
    if (!session) {
      return res.status(502).json({ error: '動画ストリームを取得できませんでした' });
    }

    try {
      let resp = await fetch(session.m3u8Url, {
        headers: {
          'User-Agent': NICO_API_HEADERS['User-Agent'],
          Referer: 'https://www.nicovideo.jp/',
          Cookie: session.cookieHeader,
        },
        signal: AbortSignal.timeout(8000),
      });
      if (resp.status === 403 || resp.status === 410) {
        session = await getLiveNicoStream(id, quality, true);
        if (!session) return res.status(502).send('Stream refresh failed');
        resp = await fetch(session.m3u8Url, {
          headers: {
            'User-Agent': NICO_API_HEADERS['User-Agent'],
            Referer: 'https://www.nicovideo.jp/',
            Cookie: session.cookieHeader,
          },
          signal: AbortSignal.timeout(8000),
        });
      }
      if (!resp.ok) return res.status(resp.status).send('Upstream playlist error');

      let text = await resp.text();
      text = text.replace(/(URI=")([^"]+)(")/g, (_m, p1, uri, p3) => {
        const abs = new URL(uri, session!.m3u8Url).toString();
        return `${p1}/api/tools/nikoniko/hls/segment?id=${encodeURIComponent(id)}&q=${encodeURIComponent(quality)}&url=${encodeURIComponent(abs)}${p3}`;
      });
      text = text
        .split(/\r?\n/)
        .map((line) => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const abs = new URL(trimmed, session!.m3u8Url).toString();
            return `/api/tools/nikoniko/hls/segment?id=${encodeURIComponent(id)}&q=${encodeURIComponent(quality)}&url=${encodeURIComponent(abs)}`;
          }
          return line;
        })
        .join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache');
      return res.send(text);
    } catch (err: any) {
      return res.status(502).send(err?.message || 'HLS playlist error');
    }
  });

  app.get('/api/tools/nikoniko/hls/segment', async (req: Request, res: Response) => {
    const rawUrl = String(req.query.url || '').trim();
    const id = sanitizeNicoId(String(req.query.id || 'sm9'));
    const quality = String(req.query.q || '720');
    try {
      const safeUrl = assertSafeHttpUrl(rawUrl, NICO_MEDIA_HOST_ALLOWLIST);
      const session = nicoHlsSessionCache.get(`${id}:${quality.replace(/\D/g, '') || '720'}`);
      const headers: Record<string, string> = {
        'User-Agent': NICO_API_HEADERS['User-Agent'],
        Referer: 'https://www.nicovideo.jp/',
      };
      if (session?.cookieHeader) headers.Cookie = session.cookieHeader;
      if (req.headers.range) headers.Range = String(req.headers.range);

      const upstream = await fetch(safeUrl.toString(), {
        headers,
        signal: AbortSignal.timeout(12000),
      });
      if (!upstream.ok && upstream.status !== 206) {
        return res.status(upstream.status).end();
      }

      const ct = upstream.headers.get('content-type') || 'video/mp4';
      res.setHeader('Content-Type', ct);
      const cr = upstream.headers.get('content-range');
      if (cr) res.setHeader('Content-Range', cr);

      if (ct.includes('mpegurl') || safeUrl.pathname.endsWith('.m3u8')) {
        let subText = await upstream.text();
        subText = subText.replace(/(URI=")([^"]+)(")/g, (_m, p1, uri, p3) => {
          const abs = new URL(uri, safeUrl.toString()).toString();
          return `${p1}/api/tools/nikoniko/hls/segment?id=${encodeURIComponent(id)}&q=${encodeURIComponent(quality)}&url=${encodeURIComponent(abs)}${p3}`;
        });
        subText = subText
          .split(/\r?\n/)
          .map((line) => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
              const abs = new URL(trimmed, safeUrl.toString()).toString();
              return `/api/tools/nikoniko/hls/segment?id=${encodeURIComponent(id)}&q=${encodeURIComponent(quality)}&url=${encodeURIComponent(abs)}`;
            }
            return line;
          })
          .join('\n');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        return res.send(subText);
      }

      const buf = Buffer.from(await upstream.arrayBuffer());
      return res.status(upstream.status).send(buf);
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Invalid segment URL' });
    }
  });

  // ==========================================
  // Niconico Live (ニコニコ生放送) Support
  // ==========================================
  interface LiveCookieItem {
    name: string;
    value: string;
    path?: string;
    domain?: string;
  }

  interface LiveStreamSession {
    lvId: string;
    qualityMode: 'high' | 'audio_only';
    streamUri: string;
    messageServerViewUri?: string;
    cookies: LiveCookieItem[];
    ws: WebSocket | null;
    keepTimer: NodeJS.Timeout | null;
    lastActive: number;
    title: string;
    status: string;
    providerName: string;
    providerAvatar: string;
    thumbnail: string;
    watchCount: number;
    commentCount: number;
  }

  const nicoLiveSessions = new Map<string, LiveStreamSession>();
  const nicoLivePending = new Map<string, Promise<LiveStreamSession | null>>();

  function assertSafeNicoLiveWsUrl(rawWsUrl: string): string {
    const parsed = new URL(String(rawWsUrl || '').trim());
    if (parsed.protocol !== 'wss:' && parsed.protocol !== 'ws:') {
      throw new Error('Invalid WebSocket protocol');
    }
    const host = parsed.hostname.toLowerCase();
    if (host !== 'nicovideo.jp' && !host.endsWith('.nicovideo.jp')) {
      throw new Error(`Disallowed Live WebSocket host: ${host}`);
    }
    return parsed.toString();
  }

  function closeLiveSessionByKey(key: string) {
    const old = nicoLiveSessions.get(key);
    if (old) {
      if (old.keepTimer) clearInterval(old.keepTimer);
      try {
        old.ws?.close();
      } catch {
        // ignore
      }
      nicoLiveSessions.delete(key);
    }
  }

  function buildLiveCookieHeader(cookies: LiveCookieItem[], targetUrlStr: string): string {
    let pathname = '/';
    try {
      pathname = new URL(targetUrlStr).pathname;
    } catch {
      // ignore
    }
    const pairs: string[] = [];
    for (const c of cookies) {
      if (!c.path || pathname.startsWith(c.path)) {
        pairs.push(`${c.name}=${c.value}`);
      }
    }
    return pairs.join('; ');
  }

  async function getOrCreateNicoLiveSession(
    lvId: string,
    forceRefresh = false,
    qualityMode: 'high' | 'audio_only' = 'high'
  ): Promise<LiveStreamSession | null> {
    const cleanId = sanitizeNicoId(lvId).toLowerCase();
    if (!/^lv\d+$/.test(cleanId)) return null;

    const sessionKey = `${cleanId}:${qualityMode}`;
    const oppositeKey = `${cleanId}:${qualityMode === 'audio_only' ? 'high' : 'audio_only'}`;
    closeLiveSessionByKey(oppositeKey);

    if (!forceRefresh) {
      const existing = nicoLiveSessions.get(sessionKey);
      if (
        existing &&
        existing.streamUri &&
        Date.now() - existing.lastActive < 180000 &&
        existing.ws?.readyState === WebSocket.OPEN
      ) {
        existing.lastActive = Date.now();
        return existing;
      }
      const pending = nicoLivePending.get(sessionKey);
      if (pending) return pending;
    } else {
      closeLiveSessionByKey(sessionKey);
    }

    const work = (async (): Promise<LiveStreamSession | null> => {
      try {
        const pageRes = await fetch(`https://live.nicovideo.jp/watch/${encodeURIComponent(cleanId)}`, {
          headers: {
            'User-Agent': NICO_API_HEADERS['User-Agent'],
            'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
          },
          signal: AbortSignal.timeout(8000),
        });
        if (!pageRes.ok) return null;
        const html = await pageRes.text();
        const m =
          html.match(/id="embedded-data"[^>]*data-props="([^"]+)"/) ||
          html.match(/data-props="([^"]+)"[^>]*id="embedded-data"/);
        if (!m?.[1]) return null;

        const props = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
        const prog = props.program || {};
        const wsUrl = props.site?.relive?.webSocketUrl;
        const title = String(prog.title || `ニコニコ生放送 ${cleanId}`);
        const status = String(prog.status || 'ON_AIR');
        const providerName = String(
          props.programBroadcaster?.name || props.socialGroup?.name || prog.supplier?.name || '放送主'
        );
        const providerAvatar = String(
          props.programBroadcaster?.iconUrl || props.socialGroup?.thumbnailUrl || ''
        );
        const watchCount = Number(prog.statistics?.watchCount || 0);
        const commentCount = Number(prog.statistics?.commentCount || 0);
        const thumbnail = String(prog.thumbnail?.large || prog.thumbnail?.small || '');

        if (!wsUrl || status === 'ENDED') {
          return {
            lvId: cleanId,
            qualityMode,
            streamUri: '',
            cookies: [],
            ws: null,
            keepTimer: null,
            lastActive: Date.now(),
            title,
            status,
            providerName,
            providerAvatar,
            thumbnail,
            watchCount,
            commentCount,
          };
        }

        const safeWsUrl = assertSafeNicoLiveWsUrl(String(wsUrl));
        const session = await new Promise<LiveStreamSession | null>((resolve) => {
          const ws = new WebSocket(safeWsUrl, {
            headers: {
              'User-Agent': NICO_API_HEADERS['User-Agent'],
              Origin: 'https://live.nicovideo.jp',
            },
          });
          let resolved = false;
          let keepTimer: NodeJS.Timeout | null = null;
          let pendingViewUri = '';
          let liveSessRef: LiveStreamSession | null = null;

          const timeout = setTimeout(() => {
            if (!resolved) {
              resolved = true;
              try {
                ws.close();
              } catch {
                // ignore
              }
              resolve(null);
            }
          }, 8000);

          ws.on('open', () => {
            ws.send(
              JSON.stringify({
                type: 'startWatching',
                data: {
                  stream: { quality: qualityMode, protocol: 'hls', latency: 'low', chasePlay: false },
                  room: { protocol: 'webSocket', commentable: false },
                  reconnect: false,
                },
              })
            );
          });

          ws.on('message', (raw) => {
            try {
              const msg = JSON.parse(raw.toString());
              if (msg.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong' }));
              } else if (msg.type === 'seat') {
                const intervalMs = Math.max(15000, Number(msg.data?.keepIntervalSec || 30) * 1000);
                if (!keepTimer) {
                  keepTimer = setInterval(() => {
                    const cur = nicoLiveSessions.get(sessionKey);
                    if (!cur || Date.now() - cur.lastActive > 90000 || ws.readyState !== WebSocket.OPEN) {
                      if (keepTimer) clearInterval(keepTimer);
                      try {
                        ws.close();
                      } catch {
                        // ignore
                      }
                      nicoLiveSessions.delete(sessionKey);
                      return;
                    }
                    try {
                      ws.send(JSON.stringify({ type: 'keepSeat' }));
                    } catch {
                      // ignore
                    }
                  }, intervalMs);
                  keepTimer.unref?.();
                }
              } else if (msg.type === 'messageServer' && msg.data?.viewUri) {
                pendingViewUri = String(msg.data.viewUri);
                if (liveSessRef) {
                  liveSessRef.messageServerViewUri = pendingViewUri;
                }
              } else if (msg.type === 'stream' && msg.data?.uri) {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeout);
                  const sess: LiveStreamSession = {
                    lvId: cleanId,
                    qualityMode,
                    streamUri: String(msg.data.uri),
                    messageServerViewUri: pendingViewUri || undefined,
                    cookies: Array.isArray(msg.data.cookies) ? msg.data.cookies : [],
                    ws,
                    keepTimer,
                    lastActive: Date.now(),
                    title,
                    status,
                    providerName,
                    providerAvatar,
                    thumbnail,
                    watchCount,
                    commentCount,
                  };
                  liveSessRef = sess;
                  nicoLiveSessions.set(sessionKey, sess);
                  resolve(sess);
                }
              } else if (msg.type === 'error' || msg.type === 'disconnect') {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeout);
                  if (keepTimer) clearInterval(keepTimer);
                  resolve(null);
                }
              }
            } catch {
              // ignore parse error
            }
          });

          ws.on('error', () => {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              if (keepTimer) clearInterval(keepTimer);
              resolve(null);
            }
          });

          ws.on('close', () => {
            if (keepTimer) clearInterval(keepTimer);
            const cur = nicoLiveSessions.get(sessionKey);
            if (cur?.ws === ws) nicoLiveSessions.delete(sessionKey);
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              resolve(null);
            }
          });
        });
        return session;
      } catch {
        return null;
      } finally {
        nicoLivePending.delete(sessionKey);
      }
    })();

    nicoLivePending.set(sessionKey, work);
    return work;
  }

  // Zero-dependency Protobuf wire decoder for Niconico Live v4 message server
  interface ProtoField {
    fn: number;
    wt: number;
    val: number | Uint8Array;
  }

  function readProtoVarint(buf: Uint8Array, offset: number): { val: number; next: number } {
    let res = 0n;
    let shift = 0n;
    let pos = offset;
    while (pos < buf.length) {
      const b = buf[pos++];
      res |= BigInt(b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7n;
      if (shift > 63n) break;
    }
    return { val: Number(res), next: pos };
  }

  function parseProtoWire(buf: Uint8Array): ProtoField[] {
    const out: ProtoField[] = [];
    let pos = 0;
    while (pos < buf.length) {
      const tag = readProtoVarint(buf, pos);
      pos = tag.next;
      const fn = Math.floor(tag.val / 8);
      const wt = tag.val % 8;
      if (fn <= 0) break;
      if (wt === 0) {
        const v = readProtoVarint(buf, pos);
        pos = v.next;
        out.push({ fn, wt, val: v.val });
      } else if (wt === 2) {
        const len = readProtoVarint(buf, pos);
        pos = len.next;
        const end = Math.min(buf.length, pos + Math.max(0, len.val));
        out.push({ fn, wt, val: buf.subarray(pos, end) });
        pos = end;
      } else if (wt === 1) {
        pos = Math.min(buf.length, pos + 8);
      } else if (wt === 5) {
        pos = Math.min(buf.length, pos + 4);
      } else {
        break;
      }
    }
    return out;
  }

  function decodeProtoStreamChunks(buf: Uint8Array): Uint8Array[] {
    const chunks: Uint8Array[] = [];
    let pos = 0;
    while (pos < buf.length) {
      const len = readProtoVarint(buf, pos);
      pos = len.next;
      if (len.val <= 0 || pos + len.val > buf.length) break;
      chunks.push(buf.subarray(pos, pos + len.val));
      pos += len.val;
    }
    return chunks;
  }

  const NICO_LIVE_COLOR_MAP: Record<number, string> = {
    0: '#ffffff',
    1: '#ff0000',
    2: '#ff8080',
    3: '#ffc000',
    4: '#ffff00',
    5: '#00ff00',
    6: '#00ffff',
    7: '#0000ff',
    8: '#c000ff',
    9: '#000000',
    10: '#cccc99',
    11: '#cc0033',
    12: '#ff33cc',
    13: '#ff6600',
    14: '#999900',
    15: '#00cc66',
    16: '#00cccc',
    17: '#3399ff',
    18: '#6633cc',
    19: '#666666',
  };

  interface DecodedLiveChatComment {
    id: string;
    no?: number;
    text: string;
    name?: string;
    color?: string;
    position?: 'ue' | 'shita' | 'naka';
    size?: 'big' | 'small' | 'medium';
    atMs: number;
    isSystem?: boolean;
  }

  function decodeNicoLiveChatMessages(buf: Uint8Array): DecodedLiveChatComment[] {
    const td = new TextDecoder('utf-8', { fatal: false });
    const comments: DecodedLiveChatComment[] = [];
    const chunks = decodeProtoStreamChunks(buf);
    for (let idx = 0; idx < chunks.length; idx++) {
      const topFields = parseProtoWire(chunks[idx]);
      let msgId = '';
      let atMs = Date.now();
      let msgBytes: Uint8Array | null = null;
      for (const f of topFields) {
        if (f.fn === 1 && f.wt === 2 && f.val instanceof Uint8Array) {
          for (const mf of parseProtoWire(f.val)) {
            if (mf.fn === 1 && mf.wt === 2 && mf.val instanceof Uint8Array) {
              msgId = td.decode(mf.val);
            } else if (mf.fn === 2 && mf.wt === 2 && mf.val instanceof Uint8Array) {
              let sec = 0;
              let nanos = 0;
              for (const tf of parseProtoWire(mf.val)) {
                if (tf.fn === 1 && tf.wt === 0 && typeof tf.val === 'number') sec = tf.val;
                else if (tf.fn === 2 && tf.wt === 0 && typeof tf.val === 'number') nanos = tf.val;
              }
              if (sec > 0) atMs = sec * 1000 + Math.floor(nanos / 1e6);
            }
          }
        } else if (f.fn === 2 && f.wt === 2 && f.val instanceof Uint8Array) {
          msgBytes = f.val;
        }
      }
      if (!msgBytes) continue;
      for (const nf of parseProtoWire(msgBytes)) {
        if (nf.fn === 1 && nf.wt === 2 && nf.val instanceof Uint8Array) {
          let content = '';
          let name = '';
          let no: number | undefined;
          let color = '#ffffff';
          let position: 'ue' | 'shita' | 'naka' = 'naka';
          let size: 'big' | 'small' | 'medium' = 'medium';
          for (const cf of parseProtoWire(nf.val)) {
            if (cf.fn === 1 && cf.wt === 2 && cf.val instanceof Uint8Array) {
              content = td.decode(cf.val);
            } else if (cf.fn === 2 && cf.wt === 2 && cf.val instanceof Uint8Array) {
              name = td.decode(cf.val);
            } else if (cf.fn === 8 && cf.wt === 0 && typeof cf.val === 'number') {
              no = cf.val;
            } else if (cf.fn === 7 && cf.wt === 2 && cf.val instanceof Uint8Array) {
              for (const modf of parseProtoWire(cf.val)) {
                if (modf.fn === 1 && modf.wt === 0 && typeof modf.val === 'number') {
                  position = modf.val === 2 ? 'ue' : modf.val === 1 ? 'shita' : 'naka';
                } else if (modf.fn === 2 && modf.wt === 0 && typeof modf.val === 'number') {
                  size = modf.val === 2 ? 'big' : modf.val === 1 ? 'small' : 'medium';
                } else if (modf.fn === 3 && modf.wt === 0 && typeof modf.val === 'number') {
                  color = NICO_LIVE_COLOR_MAP[modf.val] || '#ffffff';
                } else if (modf.fn === 4 && modf.wt === 2 && modf.val instanceof Uint8Array) {
                  let r = 255;
                  let g = 255;
                  let b = 255;
                  for (const rgbf of parseProtoWire(modf.val)) {
                    if (rgbf.fn === 1 && typeof rgbf.val === 'number') r = rgbf.val & 0xff;
                    else if (rgbf.fn === 2 && typeof rgbf.val === 'number') g = rgbf.val & 0xff;
                    else if (rgbf.fn === 3 && typeof rgbf.val === 'number') b = rgbf.val & 0xff;
                  }
                  color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                }
              }
            }
          }
          if (content.trim()) {
            comments.push({
              id: msgId || `${atMs}-${no ?? idx}`,
              no,
              text: content,
              name: name || undefined,
              color,
              position,
              size,
              atMs,
            });
          }
        } else if (nf.fn === 23 && nf.wt === 2 && nf.val instanceof Uint8Array) {
          let sysText = '';
          for (const sf of parseProtoWire(nf.val)) {
            if ((sf.fn === 2 || sf.fn === 1 || sf.fn === 3) && sf.wt === 2 && sf.val instanceof Uint8Array) {
              const decoded = td.decode(sf.val).trim();
              if (decoded) {
                sysText = decoded;
                if (sf.fn === 2) break;
              }
            }
          }
          if (sysText) {
            comments.push({
              id: msgId || `sys-${atMs}-${idx}`,
              text: sysText,
              color: '#93c5fd',
              atMs,
              isSystem: true,
            });
          }
        }
      }
    }
    return comments;
  }

  const liveSegmentCache = new Map<string, DecodedLiveChatComment[]>();

  app.get('/api/tools/nikoniko/live', async (req: Request, res: Response) => {
    const q = String(req.query.q || '').trim();
    const sortRaw = String(req.query.sort || 'viewCountDesc');
    const tabRaw = String(req.query.tab || 'all').toLowerCase();
    const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);
    const limit = Math.min(60, Math.max(1, parseInt(String(req.query.limit || '32'), 10) || 32));

    try {
      const lvMatch = q.match(/\b(lv\d+)\b/i);
      if (lvMatch && /^lv\d+$/i.test(q.replace(/^https?:\/\/[^/]+\/watch\//i, '').split(/[?#]/)[0].trim())) {
        const cleanId = lvMatch[1].toLowerCase();
        const r = await fetch(`https://live.nicovideo.jp/watch/${encodeURIComponent(cleanId)}`, {
          headers: {
            'User-Agent': NICO_API_HEADERS['User-Agent'],
            'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
          },
          signal: AbortSignal.timeout(6000),
        });
        if (r.ok) {
          const html = await r.text();
          const m =
            html.match(/id="embedded-data"[^>]*data-props="([^"]+)"/) ||
            html.match(/data-props="([^"]+)"[^>]*id="embedded-data"/);
          if (m?.[1]) {
            const props = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
            const prog = props.program || {};
            const items = [
              {
                id: cleanId,
                title: String(prog.title || `ニコニコ生放送 (${cleanId})`),
                thumbnail: String(prog.thumbnail?.large || prog.thumbnail?.small || ''),
                providerName: String(
                  props.programBroadcaster?.name || props.socialGroup?.name || prog.supplier?.name || '放送主'
                ),
                providerAvatar: String(
                  props.programBroadcaster?.iconUrl || props.socialGroup?.thumbnailUrl || ''
                ),
                watchCount: Number(prog.statistics?.watchCount || 0),
                commentCount: Number(prog.statistics?.commentCount || 0),
                liveCycle: String(prog.status || 'ON_AIR'),
              },
            ];
            return res.json({ success: true, items, total: items.length });
          }
        }
      }

      if (q) {
        const searchSort =
          sortRaw === 'commentCountDesc' || sortRaw === 'commentCount'
            ? 'commentCountDesc'
            : sortRaw === 'recentDesc' || sortRaw === 'recent'
            ? 'recentDesc'
            : 'viewCountDesc';
        const url = `https://live.nicovideo.jp/front/api/pages/search/v1/programs?keyword=${encodeURIComponent(q)}&status=onair&sortOrder=${encodeURIComponent(searchSort)}&offset=${offset}&limit=${limit}`;
        const resp = await fetch(url, { headers: NICO_API_HEADERS, signal: AbortSignal.timeout(6000) });
        if (!resp.ok) return res.status(resp.status).json({ success: false, items: [] });
        const json: any = await resp.json();
        const rawPrograms: any[] = Array.isArray(json?.data?.programs) ? json.data.programs : [];
        const items = rawPrograms
          .filter((p) => !p?.status || String(p.status).toUpperCase() === 'ON_AIR')
          .map((p: any) => {
            const pid = String(p.nicoliveProgramId || p.id || '').toLowerCase();
            return {
              id: pid,
              title: String(p.title || '生放送'),
              thumbnail: String(p.listingThumbnail || ''),
              providerName: String(
                p.programProvider?.name || p.supplier?.name || p.socialGroup?.name || '放送主'
              ),
              providerAvatar: String(p.programProvider?.icon || p.socialGroup?.thumbnailUrl || ''),
              watchCount: Number(p.statistics?.watchCount || 0),
              commentCount: Number(p.statistics?.commentCount || 0),
              liveCycle: 'ON_AIR',
            };
          })
          .filter((p) => Boolean(p.id));
        return res.json({ success: true, items, total: Number(json?.data?.totalCount ?? items.length) });
      }

      const recentSort =
        sortRaw === 'commentCountDesc' || sortRaw === 'commentCount'
          ? 'commentCount'
          : sortRaw === 'recentDesc' || sortRaw === 'recent'
          ? 'recent'
          : 'viewCount';
      const validTabs = new Set(['common', 'game', 'try', 'official', 'face']);
      const tabParam = validTabs.has(tabRaw) ? `&tab=${encodeURIComponent(tabRaw)}` : '';
      const resp = await fetch(
        `https://live.nicovideo.jp/front/api/pages/recent/v1/programs?offset=${offset}&limit=${limit}&sortOrder=${encodeURIComponent(recentSort)}${tabParam}`,
        { headers: NICO_API_HEADERS, signal: AbortSignal.timeout(6000) }
      );
      if (!resp.ok) return res.status(resp.status).json({ success: false, items: [] });
      const json: any = await resp.json();
      const items = (json?.data || [])
        .filter((p: any) => !p?.liveCycle || String(p.liveCycle).toUpperCase() === 'ON_AIR')
        .map((p: any) => ({
          id: String(p.id).toLowerCase(),
          title: String(p.title || '生放送'),
          thumbnail: String(p.listingThumbnail || ''),
          providerName: String(p.programProvider?.name || '放送主'),
          providerAvatar: String(p.programProvider?.icon || ''),
          watchCount: Number(p.statistics?.watchCount || 0),
          commentCount: Number(p.statistics?.commentCount || 0),
          liveCycle: String(p.liveCycle || 'ON_AIR'),
        }));
      return res.json({ success: true, items, total: Number(json?.meta?.totalCount || items.length) });
    } catch (err: any) {
      return res.status(502).json({ success: false, items: [], error: err?.message || 'Live search failed' });
    }
  });

  app.get('/api/tools/nikoniko/live/info/:id', async (req: Request, res: Response) => {
    const cleanId = sanitizeNicoId(req.params.id).toLowerCase();
    if (!/^lv\d+$/.test(cleanId)) {
      return res.status(400).json({ success: false, error: '有効な生放送ID (lv...) を指定してください' });
    }
    try {
      const pageRes = await fetch(`https://live.nicovideo.jp/watch/${encodeURIComponent(cleanId)}`, {
        headers: NICO_API_HEADERS,
        signal: AbortSignal.timeout(6000),
      });
      if (!pageRes.ok) {
        return res.status(pageRes.status).json({ success: false, error: '生放送番組が見つかりません' });
      }
      const html = await pageRes.text();
      const m =
        html.match(/id="embedded-data"[^>]*data-props="([^"]+)"/) ||
        html.match(/data-props="([^"]+)"[^>]*id="embedded-data"/);
      if (!m?.[1]) {
        return res.status(404).json({ success: false, error: '番組データを解析できませんでした' });
      }
      const props = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
      const prog = props.program || {};
      return res.json({
        success: true,
        program: {
          id: cleanId,
          title: String(prog.title || cleanId),
          description: stripHtmlTags(prog.description || ''),
          status: String(prog.status || 'ON_AIR'),
          providerName: String(props.programBroadcaster?.name || props.socialGroup?.name || '放送主'),
          providerAvatar: String(props.programBroadcaster?.iconUrl || props.socialGroup?.thumbnailUrl || ''),
          thumbnail: String(prog.thumbnail?.large || prog.thumbnail?.small || ''),
          watchCount: Number(prog.statistics?.watchCount || 0),
          commentCount: Number(prog.statistics?.commentCount || 0),
        },
      });
    } catch (err: any) {
      return res.status(502).json({ success: false, error: err?.message || '生放送情報の取得に失敗しました' });
    }
  });

  app.post('/api/tools/nikoniko/live/stop/:id', (req: Request, res: Response) => {
    const cleanId = sanitizeNicoId(req.params.id).toLowerCase();
    closeLiveSessionByKey(`${cleanId}:high`);
    closeLiveSessionByKey(`${cleanId}:audio_only`);
    return res.json({ success: true });
  });

  app.get('/api/tools/nikoniko/live/comments/:id', async (req: Request, res: Response) => {
    const cleanId = sanitizeNicoId(req.params.id).toLowerCase();
    if (!/^lv\d+$/.test(cleanId)) {
      return res.status(400).json({ success: false, comments: [] });
    }
    const sinceRaw = Number(req.query.since || 0);
    const hasSince = Number.isFinite(sinceRaw) && sinceRaw > 0;
    const nowSec = Math.floor(Date.now() / 1000);

    let sess =
      nicoLiveSessions.get(`${cleanId}:high`) ||
      nicoLiveSessions.get(`${cleanId}:audio_only`) ||
      null;
    if (!sess) {
      const pending =
        nicoLivePending.get(`${cleanId}:high`) ||
        nicoLivePending.get(`${cleanId}:audio_only`) ||
        null;
      if (pending) sess = await pending;
    }
    if (!sess) {
      sess = await getOrCreateNicoLiveSession(cleanId, false, 'high');
    }
    if (!sess) {
      return res.json({ success: false, comments: [], serverTime: nowSec });
    }
    sess.lastActive = Date.now();
    if (!sess.messageServerViewUri) {
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 100));
        if (sess.messageServerViewUri) break;
      }
    }
    if (!sess.messageServerViewUri) {
      return res.json({ success: true, comments: [], serverTime: nowSec });
    }

    try {
      const safeViewUri = assertSafeHttpUrl(sess.messageServerViewUri, ['nicovideo.jp']);
      const atParam = hasSince
        ? Math.min(nowSec - 22, Math.max(nowSec - 45, Math.floor(sinceRaw) - 20))
        : nowSec - 45;
      safeViewUri.searchParams.set('at', String(atParam));
      const viewResp = await fetch(safeViewUri.toString(), {
        headers: {
          'User-Agent': NICO_API_HEADERS['User-Agent'],
          Referer: 'https://live.nicovideo.jp/',
        },
        signal: AbortSignal.timeout(4500),
      });
      if (!viewResp.ok) {
        return res.json({ success: true, comments: [], serverTime: nowSec });
      }
      const viewBuf = new Uint8Array(await viewResp.arrayBuffer());
      const entries = decodeProtoStreamChunks(viewBuf);
      const segments: Array<{ uri: string; until: number }> = [];
      let snapshotUri = '';
      const td = new TextDecoder('utf-8', { fatal: false });
      for (const entry of entries) {
        for (const f of parseProtoWire(entry)) {
          if ((f.fn === 1 || f.fn === 3) && f.wt === 2 && f.val instanceof Uint8Array) {
            let uri = '';
            let until = nowSec;
            for (const sf of parseProtoWire(f.val)) {
              if (sf.fn === 2 && sf.wt === 0 && typeof sf.val === 'number') until = sf.val;
              else if (sf.fn === 3 && sf.wt === 2 && sf.val instanceof Uint8Array) uri = td.decode(sf.val);
            }
            if (uri) segments.push({ uri, until });
          } else if (f.fn === 2 && f.wt === 2 && f.val instanceof Uint8Array) {
            for (const bf of parseProtoWire(f.val)) {
              if (bf.fn === 3 && bf.wt === 2 && bf.val instanceof Uint8Array) {
                for (const ssf of parseProtoWire(bf.val)) {
                  if (ssf.fn === 1 && ssf.wt === 2 && ssf.val instanceof Uint8Array) {
                    snapshotUri = td.decode(ssf.val);
                  }
                }
              }
            }
          }
        }
      }

      const targets = hasSince ? segments.slice(-2) : segments.slice(-4);
      if (!hasSince && targets.length === 0 && snapshotUri) {
        targets.push({ uri: snapshotUri, until: nowSec });
      }

      const segResults = await Promise.all(
        targets.map(async (seg) => {
          const cached = liveSegmentCache.get(seg.uri);
          if (cached) return cached;
          try {
            const safeSeg = assertSafeHttpUrl(seg.uri, NICO_MEDIA_HOST_ALLOWLIST);
            const sr = await fetch(safeSeg.toString(), {
              headers: {
                'User-Agent': NICO_API_HEADERS['User-Agent'],
                Referer: 'https://live.nicovideo.jp/',
              },
              signal: AbortSignal.timeout(4000),
            });
            if (!sr.ok) return [];
            const decoded = decodeNicoLiveChatMessages(new Uint8Array(await sr.arrayBuffer()));
            if (seg.until > 0 && seg.until < nowSec - 3) {
              if (liveSegmentCache.size > 200) {
                const firstKey = liveSegmentCache.keys().next().value;
                if (firstKey) liveSegmentCache.delete(firstKey);
              }
              liveSegmentCache.set(seg.uri, decoded);
            }
            return decoded;
          } catch {
            return [];
          }
        })
      );

      const deduped = new Map<string, DecodedLiveChatComment>();
      for (const list of segResults) {
        for (const c of list) {
          if (!deduped.has(c.id)) deduped.set(c.id, c);
        }
      }
      const sorted = Array.from(deduped.values())
        .sort((a, b) => a.atMs - b.atMs)
        .slice(-120);
      return res.json({
        success: true,
        comments: sorted,
        serverTime: Math.floor(Date.now() / 1000),
      });
    } catch {
      return res.json({ success: true, comments: [], serverTime: nowSec });
    }
  });

  app.get('/api/tools/nikoniko/live/hls/:id/master.m3u8', async (req: Request, res: Response) => {
    const cleanId = sanitizeNicoId(req.params.id).toLowerCase();
    const qualityMode = req.query.quality === 'audio_only' ? 'audio_only' : 'high';
    let sess = await getOrCreateNicoLiveSession(cleanId, false, qualityMode);
    if (!sess || !sess.streamUri) {
      return res.status(502).json({ error: '生放送ストリームを取得できませんでした（配信終了または非公開の可能性があります）' });
    }
    sess.lastActive = Date.now();
    try {
      const safeStreamUrl = assertSafeHttpUrl(sess.streamUri, NICO_MEDIA_HOST_ALLOWLIST);
      let cookieHeader = buildLiveCookieHeader(sess.cookies, safeStreamUrl.toString());
      let resp = await fetch(safeStreamUrl.toString(), {
        headers: {
          'User-Agent': NICO_API_HEADERS['User-Agent'],
          Referer: 'https://live.nicovideo.jp/',
          Cookie: cookieHeader,
        },
        signal: AbortSignal.timeout(8000),
      });
      if (resp.status === 403 || resp.status === 410) {
        sess = await getOrCreateNicoLiveSession(cleanId, true, qualityMode);
        if (!sess || !sess.streamUri) return res.status(502).send('Live stream expired');
        const retryUrl = assertSafeHttpUrl(sess.streamUri, NICO_MEDIA_HOST_ALLOWLIST);
        cookieHeader = buildLiveCookieHeader(sess.cookies, retryUrl.toString());
        resp = await fetch(retryUrl.toString(), {
          headers: {
            'User-Agent': NICO_API_HEADERS['User-Agent'],
            Referer: 'https://live.nicovideo.jp/',
            Cookie: cookieHeader,
          },
          signal: AbortSignal.timeout(8000),
        });
      }
      if (!resp.ok) return res.status(resp.status).send('Upstream live playlist error');
      let text = await resp.text();
      const base = sess.streamUri;
      text = text.replace(/(URI=")([^"]+)(")/g, (_m, p1, uri, p3) => {
        const abs = new URL(uri, base).toString();
        return `${p1}/api/tools/nikoniko/live/hls/proxy?id=${encodeURIComponent(cleanId)}&quality=${qualityMode}&url=${encodeURIComponent(abs)}${p3}`;
      });
      text = text
        .split(/\r?\n/)
        .map((line) => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const abs = new URL(trimmed, base).toString();
            return `/api/tools/nikoniko/live/hls/proxy?id=${encodeURIComponent(cleanId)}&quality=${qualityMode}&url=${encodeURIComponent(abs)}`;
          }
          return line;
        })
        .join('\n');
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache');
      return res.send(text);
    } catch (err: any) {
      return res.status(500).send(err?.message || 'Live HLS error');
    }
  });

  app.get('/api/tools/nikoniko/live/hls/proxy', async (req: Request, res: Response) => {
    const cleanId = sanitizeNicoId(String(req.query.id || '')).toLowerCase();
    const targetUrl = String(req.query.url || '').trim();
    const qualityMode = req.query.quality === 'audio_only' ? 'audio_only' : 'high';
    if (!cleanId || !targetUrl) return res.status(400).send('Missing params');

    try {
      const safeTarget = assertSafeHttpUrl(targetUrl, NICO_MEDIA_HOST_ALLOWLIST);
      const sess = await getOrCreateNicoLiveSession(cleanId, false, qualityMode);
      if (!sess) return res.status(502).send('No live session');
      sess.lastActive = Date.now();

      const headers: Record<string, string> = {
        'User-Agent': NICO_API_HEADERS['User-Agent'],
        Referer: 'https://live.nicovideo.jp/',
        Cookie: buildLiveCookieHeader(sess.cookies, safeTarget.toString()),
      };
      if (req.headers.range) {
        headers.Range = String(req.headers.range);
      }
      const resp = await fetch(safeTarget.toString(), { headers, signal: AbortSignal.timeout(10000) });
      const ct = resp.headers.get('content-type') || '';
      if (ct.includes('mpegurl') || safeTarget.pathname.endsWith('.m3u8')) {
        if (!resp.ok) return res.status(resp.status).send('Upstream live subplaylist error');
        let text = await resp.text();
        text = text.replace(/(URI=")([^"]+)(")/g, (_m, p1, uri, p3) => {
          const abs = new URL(uri, safeTarget.toString()).toString();
          return `${p1}/api/tools/nikoniko/live/hls/proxy?id=${encodeURIComponent(cleanId)}&quality=${qualityMode}&url=${encodeURIComponent(abs)}${p3}`;
        });
        text = text
          .split(/\r?\n/)
          .map((line) => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
              const abs = new URL(trimmed, safeTarget.toString()).toString();
              return `/api/tools/nikoniko/live/hls/proxy?id=${encodeURIComponent(cleanId)}&quality=${qualityMode}&url=${encodeURIComponent(abs)}`;
            }
            return line;
          })
          .join('\n');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Cache-Control', 'no-cache');
        return res.send(text);
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      res.status(resp.status);
      res.setHeader('Content-Type', ct || 'video/mp2t');
      res.setHeader('Accept-Ranges', 'bytes');
      const cr = resp.headers.get('content-range');
      if (cr) res.setHeader('Content-Range', cr);
      return res.end(buf);
    } catch (err: any) {
      return res.status(400).send(err?.message || 'Live proxy error');
    }
  });
}
