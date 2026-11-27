import express, { type Express, type Request, type Response } from 'express';
import path from 'node:path';
import { assertSafeHttpUrl, sanitizeToolRelPath } from './ssrfGuard.js';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

interface StaticGitHubAppConfig {
  slug: string;
  owner: string;
  repo: string;
  branch: string;
  baseDir: string; // e.g. 'Win_game/www' or ''
  defaultEntry: string;
  routeAliases?: Record<string, string>;
  rewriteRootPaths?: boolean;
}

const STATIC_GITHUB_APPS: StaticGitHubAppConfig[] = [
  {
    slug: 'kankin',
    owner: 'na8526130-cell',
    repo: 'kankin',
    branch: 'main',
    baseDir: 'Win_game/www',
    defaultEntry: 'index.html',
  },
  {
    slug: 'aaaao',
    owner: 'na8526130-cell',
    repo: 'Aaaao',
    branch: 'main',
    baseDir: 'GameDataFiles',
    defaultEntry: 'index.html',
  },
  {
    slug: 'kinokonun',
    owner: 'na8526130-cell',
    repo: 'kinokonun',
    branch: 'main',
    baseDir: 'www',
    defaultEntry: 'index.html',
  },
  {
    slug: 'kawaiihakowaseru',
    owner: 'renrender0209',
    repo: 'kawaiihakowaseru',
    branch: 'main',
    baseDir: 'www',
    defaultEntry: 'index.html',
  },
  {
    slug: 'aaaa',
    owner: 'renrender0209',
    repo: 'aaaa',
    branch: 'main',
    baseDir: '',
    defaultEntry: 'index.html',
  },
  {
    slug: 'cloudmoon-io',
    owner: 'na8526130-cell',
    repo: 'cloudmoonapp.github.io',
    branch: 'main',
    baseDir: '',
    defaultEntry: 'ja/index.html',
    rewriteRootPaths: true,
    routeAliases: {
      '': 'ja/index.html',
      ja: 'ja/index.html',
      en: 'index.html',
      'index.html': 'index.html',
      game: 'game/index.html',
    },
  },
  {
    slug: 'cloudmoon-web',
    owner: 'myproxy0108-prog',
    repo: 'cloudmoon',
    branch: 'main',
    baseDir: '',
    defaultEntry: 'index.html',
    rewriteRootPaths: true,
    routeAliases: {
      '': 'index.html',
      play: 'play-260605.html',
      'play.html': 'play-260605.html',
      portal: 'portal-260605.html',
      'portal.html': 'portal-260605.html',
    },
  },
];

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

function getMimeType(filePath: string): string {
  const ext = path.posix.extname(filePath.toLowerCase());
  return MIME_MAP[ext] || 'application/octet-stream';
}

// Bounded in-memory LRU cache for HTML/JS/CSS/JSON static assets (up to 150 entries)
const textAssetCache = new Map<string, { body: string; contentType: string; ts: number }>();
function setTextCache(key: string, body: string, contentType: string) {
  if (textAssetCache.size >= 150) {
    const oldestKey = textAssetCache.keys().next().value;
    if (oldestKey) textAssetCache.delete(oldestKey);
  }
  textAssetCache.set(key, { body, contentType, ts: Date.now() });
}

function rewriteRootUrlsInHtml(html: string, mountBase: string, extraOriginPattern?: RegExp): string {
  let out = html;
  if (extraOriginPattern) {
    out = out.replace(extraOriginPattern, mountBase.replace(/\/$/, ''));
  }

  // Rewrite root-relative attributes like href="/foo", src="/bar", action="/baz" (avoid // and already rewritten)
  out = out.replace(
    /(\b(?:href|src|action|poster|data-src)\s*=\s*["'])\/(?!\/|api\/tools-app\/)/gi,
    `$1${mountBase}`
  );
  // Rewrite CSS url('/...') inside inline styles
  out = out.replace(/url\(\s*(['"]?)\/(?!\/|api\/tools-app\/)/gi, `url($1${mountBase}`);

  const baseTag = `<base href="${mountBase}">`;
  const patchScript = `<script>
(function(){
  try {
    var base = ${JSON.stringify(mountBase)};
    var rawFetch = window.fetch;
    if (typeof rawFetch === 'function') {
      window.fetch = function(input, init) {
        if (typeof input === 'string' && input.startsWith('/') && !input.startsWith('//') && !input.startsWith(base) && !input.startsWith('/api/')) {
          input = base + input.replace(/^\\/+/, '');
        }
        return rawFetch.call(this, input, init);
      };
    }
    var origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !url.startsWith(base) && !url.startsWith('/api/')) {
        arguments[1] = base + url.replace(/^\\/+/, '');
      }
      return origOpen.apply(this, arguments);
    };
  } catch(e){}
})();
</script>`;

  if (/<head[^>]*>/i.test(out)) {
    out = out.replace(/<head[^>]*>/i, (m) => `${m}\n${baseTag}\n${patchScript}`);
  } else {
    out = `${baseTag}\n${patchScript}\n${out}`;
  }
  return out;
}

async function fetchGitHubFile(cfg: StaticGitHubAppConfig, relPath: string): Promise<globalThis.Response> {
  const fullRel = [cfg.baseDir, relPath].filter(Boolean).join('/');
  const encodedRel = fullRel
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');

  const rawUrl = `https://raw.githubusercontent.com/${cfg.owner}/${cfg.repo}/${cfg.branch}/${encodedRel}`;
  let resp = await fetch(rawUrl, {
    headers: { 'User-Agent': BROWSER_UA },
    signal: AbortSignal.timeout(12000),
  });
  if (resp.ok) return resp;

  const cdnUrl = `https://cdn.jsdelivr.net/gh/${cfg.owner}/${cfg.repo}@${cfg.branch}/${encodedRel}`;
  resp = await fetch(cdnUrl, {
    headers: { 'User-Agent': BROWSER_UA },
    signal: AbortSignal.timeout(12000),
  });
  return resp;
}

function resolveStaticAlias(cfg: StaticGitHubAppConfig, relPath: string): string {
  if (cfg.routeAliases && relPath in cfg.routeAliases) {
    return cfg.routeAliases[relPath];
  }
  if (!relPath) return cfg.defaultEntry;
  if (cfg.slug === 'cloudmoon-web') {
    if (/^play(-\d+)?(\.html)?$/i.test(relPath)) return 'play-260605.html';
    if (/^portal(-\d+)?(\.html)?$/i.test(relPath)) return 'portal-260605.html';
  }
  if (cfg.slug === 'cloudmoon-io' && !path.posix.extname(relPath)) {
    return `${relPath.replace(/\/+$/, '')}/index.html`;
  }
  return relPath;
}

function registerStaticGitHubApp(app: Express, cfg: StaticGitHubAppConfig) {
  const mountBase = `/api/tools-app/${cfg.slug}/`;

  app.get([`/api/tools-app/${cfg.slug}`, `/api/tools-app/${cfg.slug}/*`], async (req: Request, res: Response) => {
    if (req.path === `/api/tools-app/${cfg.slug}`) {
      const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      return res.redirect(`${mountBase}${qs}`);
    }
    try {
      const rawTail = req.params[0] || '';
      const cleanRel = sanitizeToolRelPath(rawTail);
      const targetRel = resolveStaticAlias(cfg, cleanRel);
      const mime = getMimeType(targetRel);
      const isText =
        mime.startsWith('text/') ||
        mime.includes('javascript') ||
        mime.includes('json') ||
        mime.includes('svg+xml');

      const cacheKey = `${cfg.slug}:${targetRel}`;
      if (isText) {
        const cached = textAssetCache.get(cacheKey);
        if (cached && Date.now() - cached.ts < 15 * 60 * 1000) {
          res.setHeader('Content-Type', cached.contentType);
          res.setHeader('Cache-Control', 'public, max-age=300');
          return res.send(cached.body);
        }
      }

      let upstream = await fetchGitHubFile(cfg, targetRel);
      // Fallback for extensionless sub-routes in SvelteKit/SPA
      if (!upstream.ok && !path.posix.extname(targetRel)) {
        upstream = await fetchGitHubFile(cfg, cfg.defaultEntry);
      }
      if (!upstream.ok) {
        return res.status(upstream.status).send(`Asset not found (${targetRel})`);
      }

      if (isText) {
        let text = await upstream.text();
        if (mime.includes('text/html')) {
          text = rewriteRootUrlsInHtml(text, mountBase);
          if (cfg.slug === 'aaaa') {
            text += `<script>
(function(){
  window.addEventListener('error', function(e) {
    if (e && e.target && e.target.tagName === 'SCRIPT' && String(e.target.src || '').indexOf('js/main.js') !== -1) {
      var box = document.createElement('div');
      box.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#09090b;color:#f4f4f5;font-family:system-ui,sans-serif;padding:24px;text-align:center;';
      box.innerHTML = '<div style="max-width:460px;background:#111114;border:1px solid #27272a;border-radius:16px;padding:24px;"><div style="font-size:16px;font-weight:700;margin-bottom:8px;">aaaa (RPG Maker MZ)</div><p style="font-size:13px;line-height:1.6;color:#a1a1aa;margin:0;">GitHubリポジトリ（renrender0209/aaaa）にゲーム本体（js/main.js・data・img・audio）が含まれていないため起動できません。リポジトリ側へ追加されると自動で再生できます。</p></div>';
      document.body.appendChild(box);
    }
  }, true);
})();
</script>`;
          }
        } else if (cfg.rewriteRootPaths && mime.includes('css')) {
          text = text.replace(/url\(\s*(['"]?)\/(?!\/|api\/tools-app\/)/gi, `url($1${mountBase}`);
        } else if (cfg.slug === 'cloudmoon-io' && mime.includes('javascript')) {
          text = text
            .replace(/(["'`])\/_app\//g, `$1${mountBase}_app/`)
            .replace(/(["'`])\/images\//g, `$1${mountBase}images/`)
            .replace(/(["'`])\/data\//g, `$1${mountBase}data/`);
        }

        setTextCache(cacheKey, text, mime);
        res.setHeader('Content-Type', mime);
        res.setHeader('Cache-Control', 'public, max-age=300');
        return res.send(text);
      }

      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(buf);
    } catch (err: any) {
      return res.status(400).send(err?.message || 'Invalid asset request');
    }
  });
}

// ==========================================
// Reverse-Proxy Sub-Apps:
// - mangarw (na8526130-cell/mangarw-v2)
// - momonga (na8526130-cell/Momon-ga)
// - choco-abema (kuru-bana/Choco-Abema)
// - garticphone (na8526130-cell/Garticphone)
// ==========================================

interface ProxyAppSpec {
  slug: string;
  label: string;
  origins: string[];
  hostPattern: RegExp;
  refererOrigin?: string;
  adCleanMode?: 'mangarw';
  isMangaBase64?: boolean;
}

const PROXY_APPS: ProxyAppSpec[] = [
  {
    slug: 'mangarw',
    label: 'MangaRW v2',
    origins: ['https://mangarw.com'],
    hostPattern: /https?:\/\/[a-z0-9.-]*mangarw\.com/gi,
    refererOrigin: 'https://mangarw.com',
    adCleanMode: 'mangarw',
    isMangaBase64: true,
  },
  {
    slug: 'momonga',
    label: 'Momon-ga',
    origins: [
      'https://api-memenga.myproxy0108.workers.dev',
      'https://momon-ga.myproxy0107.workers.dev',
    ],
    hostPattern: /https?:\/\/(?:api-memenga\.72016\.workers\.dev|api-memenga\.myproxy0108\.workers\.dev|momon-ga\.myproxy0107\.workers\.dev)/gi,
    refererOrigin: 'https://momon-ga.com',
    isMangaBase64: true,
  },
  {
    slug: 'choco-abema',
    label: 'Choco-Abema',
    origins: ['https://abema.tv'],
    hostPattern: /https?:\/\/abema\.tv/gi,
    refererOrigin: 'https://abema.tv',
  },
  {
    slug: 'garticphone',
    label: 'Gartic Phone',
    origins: [
      'https://grt-ph0n.nemu0001.workers.dev',
      'https://grt-nemu.myproxy0108.workers.dev',
      'https://garticphone.com',
    ],
    hostPattern: /https?:\/\/(?:grt-ph0n\.nemu0001\.workers\.dev|grt-nemu\.myproxy0108\.workers\.dev|grt\.72016\.workers\.dev|garticphone\.com)/gi,
  },
];

const BLANK_GIF_B64 = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const MAX_MANGA_IMAGE_BYTES = 8 * 1024 * 1024;
const mangaBase64Cache = new Map<string, { dataUri: string; ts: number }>();

function setMangaB64Cache(urlKey: string, dataUri: string) {
  if (dataUri.length > 3_500_000) return;
  if (mangaBase64Cache.size >= 150) {
    const oldest = mangaBase64Cache.keys().next().value;
    if (oldest) mangaBase64Cache.delete(oldest);
  }
  mangaBase64Cache.set(urlKey, { dataUri, ts: Date.now() });
}

async function fetchImageAsBase64DataUri(
  rawImgUrl: string,
  referer: string,
  userAgent?: string,
  timeoutMs = 7500
): Promise<string | null> {
  const safeUrl = assertSafeHttpUrl(rawImgUrl);
  const cacheKey = `${referer}:${safeUrl.toString()}`;
  const cached = mangaBase64Cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 20 * 60 * 1000) {
    return cached.dataUri;
  }

  const tryFetchToDataUri = async (fetchUrl: string, headers: Record<string, string>): Promise<string | null> => {
    try {
      const resp = await fetch(fetchUrl, {
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!resp.ok) return null;
      const rawCt = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!rawCt.startsWith('image/') || rawCt === 'image/svg+xml') {
        return null;
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length === 0 || buf.length > MAX_MANGA_IMAGE_BYTES) return null;
      return `data:${rawCt};base64,${buf.toString('base64')}`;
    } catch {
      return null;
    }
  };

  let dataUri = await tryFetchToDataUri(safeUrl.toString(), {
    Referer: referer,
    'User-Agent': userAgent || BROWSER_UA,
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  });

  if (!dataUri) {
    const wsrvUrl = `https://wsrv.nl/?url=${encodeURIComponent(safeUrl.toString())}&w=960&output=webp&q=75`;
    dataUri = await tryFetchToDataUri(wsrvUrl, {
      'User-Agent': userAgent || BROWSER_UA,
    });
  }

  if (dataUri) {
    setMangaB64Cache(cacheKey, dataUri);
  }
  return dataUri;
}

function getHtmlAttr(tag: string, attrName: string): string | null {
  const re = new RegExp(`\\b${attrName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i');
  const m = tag.match(re);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}

function setHtmlAttr(tag: string, attrName: string, value: string): string {
  const safeVal = value.replace(/"/g, '&quot;');
  const re = new RegExp(`\\b${attrName}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'>]+)`, 'i');
  if (re.test(tag)) {
    return tag.replace(re, `${attrName}="${safeVal}"`);
  }
  return tag.replace(/\/?>$/, (end) => ` ${attrName}="${safeVal}"${end}`);
}

function removeHtmlAttr(tag: string, attrName: string): string {
  const re = new RegExp(`\\s*\\b${attrName}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'>]+)`, 'gi');
  return tag.replace(re, '');
}

async function inlineMangaImagesAsBase64(
  html: string,
  slug: string,
  originBase: string,
  referer: string,
  userAgent?: string
): Promise<string> {
  const mountBase = `/api/tools-app/${slug}/`;
  const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)];
  if (imgTags.length === 0) return html;

  const resolvedUrls: Array<{ index: number; rawTag: string; absUrl: string | null }> = [];
  const uniqueUrls: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < imgTags.length; i++) {
    const tag = imgTags[i][0];
    const cand =
      getHtmlAttr(tag, 'data-src') ||
      getHtmlAttr(tag, 'data-original') ||
      getHtmlAttr(tag, 'data-lazy-src') ||
      getHtmlAttr(tag, 'src');

    let absUrl: string | null = null;
    if (cand && !cand.startsWith('data:') && !cand.includes('/_img_b64_/')) {
      try {
        const u = cand.startsWith('http://') || cand.startsWith('https://')
          ? new URL(cand)
          : new URL(cand.startsWith('/') ? cand : `/${cand}`, originBase);
        absUrl = u.toString();
      } catch {
        absUrl = null;
      }
    }

    resolvedUrls.push({ index: i, rawTag: tag, absUrl });
    if (absUrl && !seen.has(absUrl) && uniqueUrls.length < 24) {
      seen.add(absUrl);
      uniqueUrls.push(absUrl);
    }
  }

  const resolvedMap = new Map<string, string>();
  await Promise.allSettled(
    uniqueUrls.map(async (u) => {
      const dataUri = await fetchImageAsBase64DataUri(u, referer, userAgent, 4500);
      if (dataUri) resolvedMap.set(u, dataUri);
    })
  );

  let cursor = 0;
  let result = '';
  for (let i = 0; i < imgTags.length; i++) {
    const match = imgTags[i];
    const start = match.index ?? 0;
    const rawTag = match[0];
    result += html.slice(cursor, start);

    const absUrl = resolvedUrls[i].absUrl;
    if (absUrl) {
      let nextTag = rawTag;
      nextTag = removeHtmlAttr(nextTag, 'data-src');
      nextTag = removeHtmlAttr(nextTag, 'data-original');
      nextTag = removeHtmlAttr(nextTag, 'data-lazy-src');
      nextTag = removeHtmlAttr(nextTag, 'srcset');
      nextTag = removeHtmlAttr(nextTag, 'loading');

      const cls = getHtmlAttr(nextTag, 'class');
      if (cls) {
        const cleanedCls = cls
          .replace(/\bopacity-0\b/g, '')
          .replace(/\blazy\b/g, '')
          .trim();
        nextTag = setHtmlAttr(nextTag, 'class', cleanedCls);
      }

      const b64 = resolvedMap.get(absUrl);
      if (b64) {
        nextTag = setHtmlAttr(nextTag, 'src', b64);
      } else {
        nextTag = setHtmlAttr(nextTag, 'src', BLANK_GIF_B64);
        nextTag = setHtmlAttr(nextTag, 'data-b64-src', `${mountBase}_img_b64_/?url=${encodeURIComponent(absUrl)}`);
      }
      result += nextTag;
    } else {
      result += rawTag;
    }

    cursor = start + rawTag.length;
  }
  result += html.slice(cursor);
  return result;
}

function buildMangaBase64ClientSnippet(slug: string, upstreamOrigin: string, adClean: boolean): string {
  const mountBase = `/api/tools-app/${slug}/`;
  const endpointBase = `${mountBase}_img_b64_/?url=`;
  const adStyles = adClean
    ? `<style>
  iframe[src*="ad"], .pop--excl, .bg-ssp-11557, [id*="bg-ssp"], [class*="ad-"], #toast,
  a[href*="adexchangerapid"], a[href*="university"] { display: none !important; pointer-events: none !important; }
</style>`
    : '';

  return `${adStyles}
<script>
(function(){
  try {
    ${adClean ? 'window.open = function() { return null; };' : ''}
    var ENDPOINT = ${JSON.stringify(endpointBase)};
    var MOUNT_BASE = ${JSON.stringify(mountBase)};
    var UPSTREAM = ${JSON.stringify(upstreamOrigin)};
    var queue = [];
    var active = 0;
    var seen = new WeakSet();

    function toUpstreamUrl(cand) {
      if (cand.startsWith('http://') || cand.startsWith('https://')) return cand;
      if (cand.startsWith('//')) return 'https:' + cand;
      if (cand.startsWith(MOUNT_BASE)) {
        return UPSTREAM + '/' + cand.slice(MOUNT_BASE.length).replace(/^\\/+/, '');
      }
      return UPSTREAM + (cand.startsWith('/') ? cand : '/' + cand);
    }

    function pump() {
      while (active < 6 && queue.length > 0) {
        var job = queue.shift();
        active++;
        fetch(job.apiUrl)
          .then(function(r){ return r.ok ? r.json() : null; })
          .then(function(d){
            if (d && d.dataUri) {
              job.img.setAttribute('src', d.dataUri);
              job.img.removeAttribute('srcset');
              job.img.removeAttribute('data-b64-src');
              job.img.classList.remove('opacity-0', 'lazy');
            }
          })
          .catch(function(){})
          .finally(function(){
            active--;
            pump();
          });
      }
    }

    function enqueueImg(img) {
      if (!img || seen.has(img)) return;
      var preset = img.getAttribute('data-b64-src');
      if (preset) {
        seen.add(img);
        queue.push({ img: img, apiUrl: preset });
        pump();
        return;
      }
      var curSrc = img.getAttribute('src') || '';
      var cand = img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('data-lazy-src') || curSrc;
      if (!cand || cand.startsWith('data:')) return;
      if (cand.indexOf('/_img_b64_/') !== -1) return;
      seen.add(img);
      var absUrl = toUpstreamUrl(cand);
      img.classList.remove('opacity-0', 'lazy');
      queue.push({ img: img, apiUrl: ENDPOINT + encodeURIComponent(absUrl) });
      pump();
    }

    function scanAll() {
      document.querySelectorAll('img').forEach(enqueueImg);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scanAll);
    else scanAll();

    new MutationObserver(function() { scanAll(); }).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  } catch(e){}
})();
</script>`;
}

function buildMirrorBlockedFallbackHtml(spec: ProxyAppSpec, mountBase: string, status: number): string {
  const safeMirrors = spec.origins
    .map(
      (origin, idx) =>
        `<a href="${origin}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:10px;background:#18181b;color:#f4f4f5;border:1px solid #3f3f46;text-decoration:none;font-weight:600;font-size:13px;">ミラー ${idx + 1} (${new URL(origin).hostname}) ↗</a>`
    )
    .join('');

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${spec.label}</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#09090b;color:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;padding:24px;box-sizing:border-box;">
  <div style="max-width:520px;width:100%;background:#111114;border:1px solid #27272a;border-radius:16px;padding:24px;text-align:center;">
    <div style="font-size:18px;font-weight:700;margin-bottom:8px;">${spec.label} ミラー接続案内</div>
    <p style="font-size:13px;line-height:1.65;color:#a1a1aa;margin:0 0 18px;">
      上流プロキシ/Workerがサーバー経由アクセスに一時的な保護制限（HTTP ${status}）を返しています。別ミラーでの再試行、またはお使いのブラウザから直接ミラーを開くことができます。
    </p>
    <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-bottom:16px;">
      <a href="${mountBase}?mirror=1" style="display:inline-flex;align-items:center;padding:10px 16px;border-radius:10px;background:#ef1d36;color:#fff;text-decoration:none;font-weight:700;font-size:13px;">別ミラーで再試行</a>
      ${safeMirrors}
    </div>
  </div>
</body>
</html>`;
}

function registerProxyApp(app: Express, spec: ProxyAppSpec) {
  const mountBase = `/api/tools-app/${spec.slug}/`;

  // Manga Base64 image endpoint (/api/tools-app/:slug/_img_b64_/?url=...)
  if (spec.isMangaBase64) {
    app.get(`${mountBase}_img_b64_/`, async (req: Request, res: Response) => {
      const rawImg = String(req.query.url || '').trim();
      if (!rawImg) return res.status(400).json({ error: 'Missing url' });
      try {
        const referer = spec.refererOrigin ? `${spec.refererOrigin}/` : `${spec.origins[0]}/`;
        const dataUri = await fetchImageAsBase64DataUri(rawImg, referer, req.get('user-agent'), 9000);
        if (!dataUri) return res.status(502).json({ error: 'Image unavailable' });
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.json({ dataUri });
      } catch (err: any) {
        return res.status(400).json({ error: err?.message || 'Blocked image URL' });
      }
    });
  }

  // MangaRW compressed image proxy fallback (/api/tools-app/mangarw/_img_/?url=...)
  if (spec.slug === 'mangarw') {
    app.get(`${mountBase}_img_/`, async (req: Request, res: Response) => {
      const rawImg = String(req.query.url || '').trim();
      if (!rawImg) return res.status(400).end();
      try {
        const safeImg = assertSafeHttpUrl(rawImg);
        const cdnUrl = `https://wsrv.nl/?url=${encodeURIComponent(safeImg.toString())}&w=720&output=webp&q=45`;
        const cdnRes = await fetch(cdnUrl, {
          headers: { 'User-Agent': req.get('user-agent') || BROWSER_UA },
          signal: AbortSignal.timeout(10000),
        });
        res.setHeader('Cache-Control', 'public, max-age=86400');
        if (cdnRes.ok) {
          res.setHeader('Content-Type', 'image/webp');
          return res.send(Buffer.from(await cdnRes.arrayBuffer()));
        }
        const directRes = await fetch(safeImg.toString(), {
          headers: {
            Referer: 'https://mangarw.com/',
            'User-Agent': req.get('user-agent') || BROWSER_UA,
          },
          signal: AbortSignal.timeout(10000),
        });
        if (!directRes.ok) return res.status(directRes.status).end();
        res.setHeader('Content-Type', directRes.headers.get('content-type') || 'image/jpeg');
        return res.send(Buffer.from(await directRes.arrayBuffer()));
      } catch (err: any) {
        return res.status(400).json({ error: err?.message || 'Blocked image URL' });
      }
    });
  }

  app.all(
    [`/api/tools-app/${spec.slug}`, `/api/tools-app/${spec.slug}/*`],
    express.raw({ type: '*/*', limit: '15mb' }),
    async (req: Request, res: Response) => {
      if (req.path === `/api/tools-app/${spec.slug}`) {
        const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        return res.redirect(`${mountBase}${qs}`);
      }
      const mirrorIdx = Math.max(
        0,
        Math.min(spec.origins.length - 1, parseInt(String(req.query.mirror || '0'), 10) || 0)
      );
      let relPath = '';
      try {
        relPath = sanitizeToolRelPath(req.params[0] || '');
      } catch {
        return res.status(400).send('Invalid path');
      }

      // Preserve query string except internal `mirror`
      const urlObj = new URL(req.originalUrl, 'http://localhost');
      urlObj.searchParams.delete('mirror');
      const querySuffix = urlObj.search ? urlObj.search : '';

      const orderedOrigins = [
        spec.origins[mirrorIdx],
        ...spec.origins.filter((_, i) => i !== mirrorIdx),
      ];

      let lastStatus = 502;
      for (const origin of orderedOrigins) {
        try {
          const safeOrigin = assertSafeHttpUrl(origin);
          const targetUrl = `${safeOrigin.origin}/${relPath}${querySuffix}`;

          const reqHeaders: Record<string, string> = {
            'User-Agent': req.get('user-agent') || BROWSER_UA,
            Accept: req.get('accept') || '*/*',
            'Accept-Language': req.get('accept-language') || 'ja,en-US;q=0.9,en;q=0.8',
            'Accept-Encoding': 'identity',
          };
          if (spec.refererOrigin) {
            reqHeaders.Origin = spec.refererOrigin;
            reqHeaders.Referer = `${spec.refererOrigin}/`;
          }
          if (req.headers['content-type']) {
            reqHeaders['Content-Type'] = String(req.headers['content-type']);
          }

          const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
          const upstream = await fetch(targetUrl, {
            method: req.method,
            headers: reqHeaders,
            redirect: 'manual',
            body: hasBody && Buffer.isBuffer(req.body) && req.body.length > 0 ? new Uint8Array(req.body) : undefined,
            signal: AbortSignal.timeout(12000),
          });

          lastStatus = upstream.status;

          // If Cloudflare challenges with 403/503 on server fetch, try next mirror
          if ((upstream.status === 403 || upstream.status === 503) && orderedOrigins.length > 1) {
            continue;
          }

          const ct = upstream.headers.get('content-type') || '';
          const loc = upstream.headers.get('location');
          if (loc && upstream.status >= 300 && upstream.status < 400) {
            let rewrittenLoc = loc.replace(spec.hostPattern, '');
            if (rewrittenLoc.startsWith('/')) {
              rewrittenLoc = `${mountBase}${rewrittenLoc.replace(/^\/+/, '')}`;
            }
            return res.redirect(upstream.status, rewrittenLoc);
          }

          upstream.headers.forEach((v, k) => {
            const lk = k.toLowerCase();
            if (
              ![
                'content-encoding',
                'transfer-encoding',
                'content-length',
                'content-security-policy',
                'x-frame-options',
                'strict-transport-security',
                'set-cookie',
              ].includes(lk)
            ) {
              res.setHeader(k, v);
            }
          });

          if (ct.includes('text/html')) {
            let html = await upstream.text();
            if (upstream.status === 403) {
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              return res.status(200).send(buildMirrorBlockedFallbackHtml(spec, mountBase, 403));
            }
            if (spec.adCleanMode === 'mangarw') {
              const badDomains = [
                'universityshocksooner\\.com',
                'adexchangerapid\\.com',
                'gomuraw\\.js',
                'platform\\.pubadx\\.one',
              ];
              for (const d of badDomains) {
                html = html.replace(new RegExp(`<script[^>]*${d}[^>]*><\\/script>`, 'gi'), '');
              }
              html = html.replace(/<a[^>]*adexchangerapid\.com[^>]*>[\s\S]*?<\/a>/gi, '');
            }
            if (spec.isMangaBase64) {
              const imgReferer = spec.refererOrigin ? `${spec.refererOrigin}/` : `${safeOrigin.origin}/`;
              html = await inlineMangaImagesAsBase64(
                html,
                spec.slug,
                safeOrigin.origin,
                imgReferer,
                req.get('user-agent')
              );
            }
            html = rewriteRootUrlsInHtml(html, mountBase, spec.hostPattern);
            if (spec.isMangaBase64) {
              const snippet = buildMangaBase64ClientSnippet(
                spec.slug,
                safeOrigin.origin,
                spec.adCleanMode === 'mangarw'
              );
              html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${snippet}`);
            }
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            return res.status(upstream.status).send(html);
          }

          if (ct.includes('text/css')) {
            let css = await upstream.text();
            css = css.replace(spec.hostPattern, mountBase.replace(/\/$/, ''));
            css = css.replace(/url\(\s*(['"]?)\/(?!\/|api\/tools-app\/)/gi, `url($1${mountBase}`);
            res.setHeader('Content-Type', ct);
            return res.status(upstream.status).send(css);
          }

          const buf = Buffer.from(await upstream.arrayBuffer());
          if (ct.includes('image') || relPath.includes('_p_')) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
          }
          return res.status(upstream.status).send(buf);
        } catch {
          // try next mirror
        }
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(buildMirrorBlockedFallbackHtml(spec, mountBase, lastStatus));
    }
  );
}

export function registerEmbeddedToolApps(app: Express) {
  for (const cfg of STATIC_GITHUB_APPS) {
    registerStaticGitHubApp(app, cfg);
  }
  for (const spec of PROXY_APPS) {
    registerProxyApp(app, spec);
  }
}
