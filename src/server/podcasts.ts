import type { Express, Request, Response } from 'express';
import type { Innertube } from 'youtubei.js';
import { kvCache } from './kvCache.js';
import { assertSafePublicHttpUrl } from './coverEmbed.js';

export interface ServerPodcastEpisode {
  id: string;
  showId: string;
  showTitle: string;
  title: string;
  artist: string;
  description: string;
  publishDate: string;
  duration: string;
  durationSeconds: number;
  thumbnail: string;
  audioUrl?: string;
  videoId?: string;
  isVideo: boolean;
  feedUrl?: string;
}

export interface ServerPodcastShow {
  id: string;
  title: string;
  author: string;
  description?: string;
  thumbnail: string;
  feedUrl?: string;
  genre?: string;
  episodeCount?: number;
  isVideoShow?: boolean;
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function decodeXmlEntities(raw: string): string {
  return (raw || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseItunesDuration(raw: string): { label: string; seconds: number } {
  const s = String(raw || '').trim();
  if (!s) return { label: '25:00', seconds: 1500 };
  if (/^\d+$/.test(s)) {
    const sec = Math.max(0, parseInt(s, 10));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const rem = sec % 60;
    const label =
      h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`
        : `${m}:${String(rem).padStart(2, '0')}`;
    return { label, seconds: sec };
  }
  const parts = s.split(':').map((n) => parseInt(n, 10) || 0);
  if (parts.length === 2) {
    return { label: s, seconds: parts[0] * 60 + parts[1] };
  }
  if (parts.length === 3) {
    return { label: s, seconds: parts[0] * 3600 + parts[1] * 60 + parts[2] };
  }
  return { label: '25:00', seconds: 1500 };
}

function extractXmlTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = block.match(re);
  return m ? decodeXmlEntities(m[1]) : '';
}

function extractXmlAttr(block: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}\\s[^>]*${attr}=["']([^"']+)["'][^>]*>`, 'i');
  const m = block.match(re);
  return m ? m[1].replace(/&amp;/g, '&').trim() : '';
}

function parseRssPodcastFeed(
  xml: string,
  showFallback: { id: string; title: string; author: string; thumbnail: string; feedUrl: string }
): { show: ServerPodcastShow; episodes: ServerPodcastEpisode[] } {
  const channelSplit = xml.split(/<item[\s>]/i);
  const channelHeader = channelSplit[0] || '';

  const showTitle = extractXmlTag(channelHeader, 'title') || showFallback.title;
  const showAuthor =
    extractXmlTag(channelHeader, 'itunes:author') ||
    extractXmlTag(channelHeader, 'author') ||
    showFallback.author;
  const showDesc =
    extractXmlTag(channelHeader, 'itunes:summary') || extractXmlTag(channelHeader, 'description');
  const showImg =
    extractXmlAttr(channelHeader, 'itunes:image', 'href') ||
    extractXmlTag(channelHeader, 'url') ||
    showFallback.thumbnail;

  const episodes: ServerPodcastEpisode[] = [];
  const itemMatches = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];

  itemMatches.slice(0, 35).forEach((itemXml, idx) => {
    const title = extractXmlTag(itemXml, 'title');
    const enclosureUrl = extractXmlAttr(itemXml, 'enclosure', 'url');
    if (!title || !enclosureUrl) return;
    if (!/^https?:\/\//i.test(enclosureUrl)) return;

    const guid = extractXmlTag(itemXml, 'guid') || `${showFallback.id}_ep_${idx}`;
    const desc =
      extractXmlTag(itemXml, 'itunes:summary') || extractXmlTag(itemXml, 'description') || '';
    const pubRaw = extractXmlTag(itemXml, 'pubDate');
    let publishDate = '';
    if (pubRaw) {
      const d = new Date(pubRaw);
      if (!Number.isNaN(d.getTime())) {
        publishDate = d.toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
      }
    }
    const durRaw = extractXmlTag(itemXml, 'itunes:duration');
    const { label, seconds } = parseItunesDuration(durRaw);
    const epImg = extractXmlAttr(itemXml, 'itunes:image', 'href') || showImg || showFallback.thumbnail;
    const epId = `pod_rss_${Buffer.from(guid).toString('base64url').slice(0, 20)}`;

    episodes.push({
      id: epId,
      showId: showFallback.id,
      showTitle,
      title,
      artist: showAuthor || showTitle,
      description: desc.slice(0, 280),
      publishDate,
      duration: label,
      durationSeconds: seconds,
      thumbnail: epImg,
      audioUrl: `/api/podcasts/proxy-audio?url=${encodeURIComponent(enclosureUrl)}`,
      isVideo: false,
      feedUrl: showFallback.feedUrl,
    });
  });

  return {
    show: {
      id: showFallback.id,
      title: showTitle,
      author: showAuthor,
      description: showDesc.slice(0, 320),
      thumbnail: showImg,
      feedUrl: showFallback.feedUrl,
      episodeCount: episodes.length,
      isVideoShow: false,
    },
    episodes,
  };
}

async function searchItunesPodcasts(term: string, limit = 16): Promise<ServerPodcastShow[]> {
  const cacheKey = `itunes_pod_search_${term.toLowerCase()}_${limit}`;
  const cached = kvCache.get<ServerPodcastShow[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=podcast&entity=podcast&country=JP&lang=ja_jp&limit=${limit}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) return [];
    const data = (await resp.json()) as any;
    const list: ServerPodcastShow[] = (data?.results || [])
      .filter((r: any) => r?.feedUrl && r?.collectionName)
      .map((r: any) => ({
        id: `itunes_${r.collectionId}`,
        title: String(r.collectionName),
        author: String(r.artistName || 'Podcast'),
        thumbnail: String(r.artworkUrl600 || r.artworkUrl100 || ''),
        feedUrl: String(r.feedUrl),
        genre: String(r.primaryGenreName || 'ポッドキャスト'),
        episodeCount: Number(r.trackCount) || undefined,
        isVideoShow: false,
      }));
    if (list.length > 0) {
      kvCache.set(cacheKey, list, 6 * 3600);
    }
    return list;
  } catch {
    return [];
  }
}

async function searchYouTubeVideoPodcasts(
  yt: Innertube,
  query: string,
  limit = 10
): Promise<ServerPodcastEpisode[]> {
  const cacheKey = `yt_vpod_search_${query.toLowerCase()}_${limit}`;
  const cached = kvCache.get<ServerPodcastEpisode[]>(cacheKey);
  if (cached) return cached;

  try {
    const res: any = await yt.search(`${query} ポッドキャスト ラジオ`, { type: 'video' });
    const list: ServerPodcastEpisode[] = [];
    for (const v of (res?.videos || []).slice(0, limit * 2)) {
      const id = String(v?.id || '').trim();
      const title = String(v?.title?.text || v?.title?.toString?.() || '').trim();
      if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id) || !title) continue;
      const author = String(v?.author?.name || 'YouTube Podcast').trim();
      const durText = String(v?.duration?.text || '').trim();
      const { seconds } = parseItunesDuration(durText);
      if (seconds > 0 && seconds < 180) continue; // Skip short teasers
      list.push({
        id,
        showId: `ytpod_${author.toLowerCase().replace(/\s+/g, '_')}`,
        showTitle: author,
        title,
        artist: author,
        description: String(v?.description_snippet?.text || '').slice(0, 220),
        publishDate: String(v?.published?.text || ''),
        duration: durText || '30:00',
        durationSeconds: seconds || 1800,
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        videoId: id,
        isVideo: true,
      });
      if (list.length >= limit) break;
    }
    if (list.length > 0) {
      kvCache.set(cacheKey, list, 3 * 3600);
    }
    return list;
  } catch {
    return [];
  }
}

export function registerPodcastRoutes(app: Express, getInnertube: () => Promise<Innertube>) {
  // 1. Discover top Audio Shows + Video Podcast Episodes
  app.get('/api/podcasts/discover', async (_req: Request, res: Response) => {
    const cacheKey = 'podcasts_discover_jp_v1';
    const cached = kvCache.get<any>(cacheKey);
    if (cached) return res.json(cached);

    try {
      const yt = await getInnertube();
      const [musicShows, techShows, talkShows, videoEpisodes] = await Promise.all([
        searchItunesPodcasts('音楽 トーク ラジオ', 8),
        searchItunesPodcasts('テクノロジー ニュース 教養', 8),
        searchItunesPodcasts('雑談 コメディ オールナイト', 8),
        searchYouTubeVideoPodcasts(yt, '音楽 トーク 対談', 10),
      ]);

      const seen = new Set<string>();
      const shows: ServerPodcastShow[] = [];
      for (const s of [...musicShows, ...techShows, ...talkShows]) {
        if (!seen.has(s.id)) {
          seen.add(s.id);
          shows.push(s);
        }
      }

      const payload = {
        shows: shows.slice(0, 18),
        videoEpisodes,
      };
      if (shows.length > 0 || videoEpisodes.length > 0) {
        kvCache.set(cacheKey, payload, 2 * 3600);
      }
      res.json(payload);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'ポッドキャスト一覧の取得に失敗しました' });
    }
  });

  // 2. Search Podcasts (Audio RSS shows + Video episodes)
  app.get('/api/podcasts/search', async (req: Request, res: Response) => {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ shows: [], videoEpisodes: [] });

    try {
      const yt = await getInnertube();
      const [shows, videoEpisodes] = await Promise.all([
        searchItunesPodcasts(q, 14),
        searchYouTubeVideoPodcasts(yt, q, 10),
      ]);
      res.json({ shows, videoEpisodes });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'ポッドキャスト検索に失敗しました' });
    }
  });

  // 3. Fetch Show Details & Real RSS Episodes (SSRF-guarded)
  app.get('/api/podcasts/show', async (req: Request, res: Response) => {
    const feedUrl = String(req.query.feedUrl || '').trim();
    const showId = String(req.query.showId || 'podcast_show').trim();
    const title = String(req.query.title || 'Podcast').trim();
    const author = String(req.query.author || 'Creator').trim();
    const thumbnail = String(req.query.thumbnail || '').trim();

    if (!feedUrl) {
      return res.status(400).json({ error: 'feedUrl is required' });
    }

    const cacheKey = `pod_rss_v1_${feedUrl}`;
    const cached = kvCache.get<any>(cacheKey);
    if (cached) return res.json(cached);

    try {
      const safeUrl = await assertSafePublicHttpUrl(feedUrl);
      const resp = await fetch(safeUrl.toString(), {
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'application/rss+xml, application/xml, text/xml, */*',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) {
        return res.status(502).json({ error: `RSS feed returned status ${resp.status}` });
      }
      const xml = await resp.text();
      const parsed = parseRssPodcastFeed(xml, {
        id: showId,
        title,
        author,
        thumbnail,
        feedUrl,
      });
      kvCache.set(cacheKey, parsed, 1800);
      res.json(parsed);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'RSSフィードの読み込みに失敗しました' });
    }
  });

  // 4. SSRF-guarded Podcast Audio Proxy with HTTP Range Support (for DSP + Offline Download)
  app.get('/api/podcasts/proxy-audio', async (req: Request, res: Response) => {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) {
      return res.status(400).json({ error: 'url is required' });
    }

    try {
      let currentUrl = rawUrl;
      let upstream: globalThis.Response | null = null;
      const reqHeaders: Record<string, string> = {
        'User-Agent': BROWSER_UA,
      };
      if (req.headers.range) {
        reqHeaders.Range = String(req.headers.range);
      }

      const controller = new AbortController();
      req.on('close', () => {
        try {
          controller.abort();
        } catch {}
      });

      for (let hop = 0; hop <= 5; hop++) {
        const safeUrl = await assertSafePublicHttpUrl(currentUrl);
        const resp = await fetch(safeUrl.toString(), {
          headers: reqHeaders,
          redirect: 'manual',
          signal: controller.signal,
        });
        if (resp.status >= 300 && resp.status < 400) {
          const loc = resp.headers.get('location');
          if (!loc) break;
          currentUrl = new URL(loc, safeUrl).toString();
          continue;
        }
        upstream = resp;
        break;
      }

      if (!upstream || (!upstream.ok && upstream.status !== 206)) {
        return res.status(502).json({ error: 'Failed to fetch podcast audio stream' });
      }

      res.status(upstream.status === 206 ? 206 : 200);
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg');
      res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
      const len = upstream.headers.get('content-length');
      if (len) res.setHeader('Content-Length', len);
      const cr = upstream.headers.get('content-range');
      if (cr) res.setHeader('Content-Range', cr);
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!upstream.body) return res.end();
      const reader = upstream.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.length > 0) {
            const ok = res.write(Buffer.from(value));
            if (!ok) await new Promise<void>((r) => res.once('drain', r));
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
        res.status(400).json({ error: err?.message || 'Blocked or invalid podcast URL' });
      }
    }
  });
}
