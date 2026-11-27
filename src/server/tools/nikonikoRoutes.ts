import crypto from 'node:crypto';
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
}
