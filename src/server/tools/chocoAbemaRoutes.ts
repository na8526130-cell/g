import express, { type Express, type Request, type Response } from 'express';
import { assertSafeHttpUrl } from './ssrfGuard.js';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const MOUNT_PREFIX = '/api/tools-app/choco-abema';
const MOUNT_BASE = `${MOUNT_PREFIX}/`;
const WORKER_LIST_URL =
  'https://raw.githubusercontent.com/kuru-bana/Link-list/refs/heads/main/proxy/worker/abema.json';
const WORKER_DECRYPT_KEY = Buffer.from('choco', 'utf8');
const WORKER_REFRESH_MS = 15 * 60 * 1000;
const WORKER_COOLDOWN_MS = 5 * 60 * 1000;

const FALLBACK_WORKERS = [
  'https://abema3.kuru-api-a64.workers.dev',
  'https://crimson-mouse-52ee.kuru-api-a64.workers.dev',
  'https://cf-all.a0966a-4e1.workers.dev',
];

const DROP_REQ_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'accept-encoding',
  'forwarded',
  'via',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-port',
  'x-real-ip',
  'content-length',
]);

const DROP_RES_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-encoding',
  'content-length',
  'strict-transport-security',
  'x-frame-options',
  'set-cookie',
]);

const REWRITE_CONTENT_RE =
  /text\/html|application\/xhtml\+xml|javascript|ecmascript|text\/css|application\/json|mpegurl|dash\+xml|application\/xml|text\/xml/i;
const REQ_TEXT_RE = /json|x-www-form-urlencoded|text\/plain/i;

interface WorkerEntry {
  origin: string;
  limitedUntil: number;
}

let workerPool: WorkerEntry[] = FALLBACK_WORKERS.map((origin) => ({
  origin,
  limitedUntil: 0,
}));
let lastPoolFetchAt = 0;
let refreshInFlight: Promise<WorkerEntry[]> | null = null;
let preferredWorkerOrigin: string = FALLBACK_WORKERS[0];

function decryptWorkerUrl(encoded: string): string {
  const clean = encoded.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padded = clean.padEnd(clean.length + ((4 - (clean.length % 4)) % 4), '=');
  const raw = Buffer.from(padded, 'base64');
  const out = Buffer.alloc(raw.length);
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw[i] ^ WORKER_DECRYPT_KEY[i % WORKER_DECRYPT_KEY.length];
  }
  const decoded = out.toString('utf8').trim();
  const parsed = assertSafeHttpUrl(decoded, ['workers.dev']);
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Unexpected worker URL shape');
  }
  return parsed.origin;
}

async function refreshWorkerPool(force = false): Promise<WorkerEntry[]> {
  if (!force && Date.now() - lastPoolFetchAt < WORKER_REFRESH_MS && workerPool.length > 0) {
    return workerPool;
  }
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const resp = await fetch(WORKER_LIST_URL, {
        headers: { 'User-Agent': BROWSER_UA },
        signal: AbortSignal.timeout(8000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = (await resp.json()) as unknown;
      const list = Array.isArray(json)
        ? json
        : json && typeof json === 'object' && Array.isArray((json as any).workers)
          ? (json as any).workers
          : [];

      const existingMap = new Map(workerPool.map((w) => [w.origin, w]));
      const next: WorkerEntry[] = [];
      const seen = new Set<string>();

      for (const item of list) {
        if (typeof item !== 'string' || !item.trim()) continue;
        try {
          const origin = item.startsWith('http')
            ? assertSafeHttpUrl(item, ['workers.dev']).origin
            : decryptWorkerUrl(item);
          if (seen.has(origin)) continue;
          seen.add(origin);
          const prev = existingMap.get(origin);
          next.push({ origin, limitedUntil: prev ? prev.limitedUntil : 0 });
        } catch {
          // Ignore malformed/disallowed worker entries
        }
      }

      if (next.length > 0) {
        // Prefer known non-429 fallback order first when none have been probed yet
        next.sort((a, b) => {
          const ai = FALLBACK_WORKERS.indexOf(a.origin);
          const bi = FALLBACK_WORKERS.indexOf(b.origin);
          const ar = ai === -1 ? 99 : ai;
          const br = bi === -1 ? 99 : bi;
          return ar - br;
        });
        workerPool = next;
        lastPoolFetchAt = Date.now();
        if (!next.some((w) => w.origin === preferredWorkerOrigin)) {
          preferredWorkerOrigin = next[0].origin;
        }
      }
    } catch {
      lastPoolFetchAt = Date.now();
    } finally {
      refreshInFlight = null;
    }
    return workerPool;
  })();

  return refreshInFlight;
}

function getOrderedWorkers(requestedIdx?: number): WorkerEntry[] {
  const now = Date.now();
  const available = workerPool.filter((w) => w.limitedUntil <= now);
  const pool = available.length > 0 ? available : workerPool;

  if (
    typeof requestedIdx === 'number' &&
    !Number.isNaN(requestedIdx) &&
    requestedIdx >= 0 &&
    requestedIdx < pool.length
  ) {
    const picked = pool[requestedIdx];
    return [picked, ...pool.filter((w) => w.origin !== picked.origin)];
  }

  const pref = pool.find((w) => w.origin === preferredWorkerOrigin);
  if (pref) {
    return [pref, ...pool.filter((w) => w.origin !== pref.origin)];
  }
  return pool;
}

function markWorkerLimited(origin: string, retryAfterHeader?: string | null) {
  const sec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
  const cooldown = Number.isFinite(sec) && sec > 0 ? Math.min(sec * 1000, 15 * 60 * 1000) : WORKER_COOLDOWN_MS;
  const entry = workerPool.find((w) => w.origin === origin);
  if (entry) {
    entry.limitedUntil = Date.now() + cooldown;
  }
}

function resolvePublicMount(req: Request): { httpMount: string; wsMount: string } {
  const rawProto = String(req.get('x-forwarded-proto') || req.protocol || 'https')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const proto = rawProto === 'http' ? 'http' : 'https';
  const rawHost = String(req.get('x-forwarded-host') || req.get('host') || 'localhost:3000')
    .split(',')[0]
    .trim();
  const safeHost = /^[a-z0-9.-]+(?::\d{1,5})?$/i.test(rawHost) ? rawHost : 'localhost:3000';
  const wsProto = proto === 'https' ? 'wss' : 'ws';
  return {
    httpMount: `${proto}://${safeHost}${MOUNT_PREFIX}`,
    wsMount: `${wsProto}://${safeHost}${MOUNT_PREFIX}`,
  };
}

function swapWorkerStrings(text: string, fromOrigin: string, toOrigin: string): string {
  if (!text || !fromOrigin || !toOrigin || fromOrigin === toOrigin) return text;
  const fromUrl = new URL(fromOrigin);
  const toIsWs = toOrigin.startsWith('ws');
  const wsTo = toIsWs ? toOrigin : toOrigin.replace(/^http/i, 'ws');
  const httpFrom = fromUrl.origin;
  const wsFrom = httpFrom.replace(/^http/i, 'ws');

  let out = text;
  if (out.includes(httpFrom)) {
    out = out.split(httpFrom).join(toOrigin);
  }
  if (out.includes(wsFrom)) {
    out = out.split(wsFrom).join(wsTo);
  }
  return out;
}

function patchWorkerClientBootstrap(html: string): string {
  if (!html.includes('window.__px')) return html;

  let out = html;

  // 1. Allow the ABEMA compatibility plugin (Request.url, abm_token reset, responseURL, about:blank block)
  //    to activate inside EmbeddedToolFrame's iframe (`window.top !== window`).
  out = out.replace(
    'if (!ok || window.top !== window) return;',
    'if (!ok) return;'
  );

  // 2. Align virtual pathname for ABEMA's React Router even inside EmbeddedToolFrame's iframe
  //    so ABEMA sees `/` instead of `/api/tools-app/choco-abema/`.
  out = out.replace(
    'var SPOOF = window.top === window;',
    'var SPOOF = /(^|\\.)(abema\\.tv|abema\\.io|ameba\\.jp)$/i.test(new NU(REAL).hostname);'
  );

  // 3. Teach `proxiedPath` to strip `/api/tools-app/choco-abema` prefix before matching `/<base64>/`.
  out = out.replace(
    /function proxiedPath\(p\)\s*\{\s*var m = p\.match\(/,
    `function proxiedPath(p) { var PFX = ${JSON.stringify(MOUNT_PREFIX)}; if (p === PFX) p = '/'; else if (p.indexOf(PFX + '/') === 0) p = p.slice(PFX.length); var m = p.match(`
  );

  // 4. Teach `ownUrl` to strip `/api/tools-app/choco-abema` from `a.pathname` before resolving against REAL.
  out = out.replace(
    /try\s*\{\s*return new NU\(a\.pathname \+ a\.search \+ a\.hash,\s*REAL\)\.href;\s*\}/,
    `try { var __pp = a.pathname; var __pfx = ${JSON.stringify(MOUNT_PREFIX)}; if (__pp === __pfx) __pp = '/'; else if (__pp.indexOf(__pfx + '/') === 0) __pp = __pp.slice(__pfx.length); return new NU(__pp + a.search + a.hash, REAL).href; }`
  );

  // 5. Teach outer `px` to also handle root-relative `/api/tools-app/choco-abema/...` paths without double-wrapping.
  out = out.replace(
    /function px\(u,\s*base\)\s*\{\s*if \(u == null\) return u;\s*var s = String\(u\)\.trim\(\);\s*if \(!s \|\| s\.charAt\(0\) === '#'/g,
    `function px(u, base) { if (u == null) return u; var s = String(u).trim(); var __pfx = ${JSON.stringify(MOUNT_PREFIX)}; if (s.indexOf(__pfx + '/') === 0) { if (proxiedPath(s)) return s; s = s.slice(__pfx.length) || '/'; } if (!s || s.charAt(0) === '#'`
  );

  // 6. Teach `real(u)` to strip `/api/tools-app/choco-abema` and match `a.href.indexOf(PROXY + '/') === 0`
  //    (since `PROXY` now includes `/api/tools-app/choco-abema` while `a.origin` does not).
  out = out.replace(
    /function real\(u\)\s*\{\s*try\s*\{\s*var a = new NU\(String\(u\),\s*location\.href\);\s*var m = a\.pathname\.match\(/,
    `function real(u) { try { var a = new NU(String(u), location.href); var __pfx = ${JSON.stringify(MOUNT_PREFIX)}; var __rp = a.pathname.indexOf(__pfx + '/') === 0 ? a.pathname.slice(__pfx.length) : a.pathname; var m = __rp.match(`
  );
  out = out.replace(
    /if \(m && a\.origin === PROXY\)/g,
    `if (m && (a.href.indexOf(PROXY + '/') === 0 || a.origin === new NU(PROXY).origin))`
  );

  // 7. Patch `wkBoot` inside Web Workers for root-relative `/api/tools-app/choco-abema/...` paths
  out = out.replace(
    /if \(s\.indexOf\(PROXY \+ '\/'\) === 0 \|\| s\.indexOf\(WSP \+ '\/'\) === 0\) return u;/,
    `var __pfx = ${JSON.stringify(MOUNT_PREFIX)}; if (s.indexOf(__pfx + '/') === 0) { return s.indexOf(PROXY + '/') === 0 ? u : (PROXY + s.slice(__pfx.length)); } if (s.indexOf(PROXY + '/') === 0 || s.indexOf(WSP + '/') === 0) return u;`
  );

  return out;
}

function buildChocoAbemaErrorHtml(status: number): string {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Choco-Abema</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#09090b;color:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;padding:24px;box-sizing:border-box;">
  <div style="max-width:480px;width:100%;background:#111114;border:1px solid #27272a;border-radius:16px;padding:24px;text-align:center;">
    <div style="font-size:18px;font-weight:700;margin-bottom:8px;">Choco-Abema 接続待機中</div>
    <p style="font-size:13px;line-height:1.65;color:#a1a1aa;margin:0 0 18px;">
      現在利用可能な中継サーバーが混雑しています（HTTP ${status}）。別のサーバーに切り替えて再接続できます。
    </p>
    <a href="${MOUNT_BASE}?mirror=0" style="display:inline-flex;align-items:center;padding:10px 18px;border-radius:10px;background:#ef1d36;color:#fff;text-decoration:none;font-weight:700;font-size:13px;">別のサーバーで再試行</a>
  </div>
</body>
</html>`;
}

export function registerChocoAbemaRoutes(app: Express) {
  // Warm up worker pool in background on server start
  refreshWorkerPool().catch(() => {});

  app.all(
    [MOUNT_PREFIX, `${MOUNT_PREFIX}/*`],
    express.raw({ type: '*/*', limit: '5mb' }),
    async (req: Request, res: Response) => {
      if (req.path === MOUNT_PREFIX) {
        const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        return res.redirect(`${MOUNT_BASE}${qs}`);
      }

      const rawTail = String(req.params[0] || '');
      if (rawTail.includes('\0') || rawTail.includes('\\') || rawTail.includes('..')) {
        return res.status(400).send('Invalid path');
      }

      await refreshWorkerPool();

      const { httpMount } = resolvePublicMount(req);

      // Parse URL query cleanly and strip internal cache-buster `_v` / `mirror`
      const reqUrlObj = new URL(req.originalUrl, 'http://localhost');
      const mirrorParam = reqUrlObj.searchParams.get('mirror');
      const requestedIdx = mirrorParam !== null ? parseInt(mirrorParam, 10) : undefined;
      reqUrlObj.searchParams.delete('mirror');
      reqUrlObj.searchParams.delete('_v');
      const querySuffix = reqUrlObj.search ? reqUrlObj.search : '';

      // Always keep a single leading slash so `new URL(relPath, workerOrigin)` never changes origin
      const cleanRelPath = '/' + rawTail.replace(/^\/+/, '');
      const workers = getOrderedWorkers(requestedIdx);

      let lastStatus = 502;

      for (const worker of workers) {
        try {
          const safeWorker = assertSafeHttpUrl(worker.origin, ['workers.dev']);
          const targetUrl = new URL(cleanRelPath + querySuffix, safeWorker.origin);
          if (targetUrl.origin !== safeWorker.origin) {
            return res.status(400).send('Invalid upstream target');
          }

          const outHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(req.headers)) {
            const lk = k.toLowerCase();
            if (DROP_REQ_HEADERS.has(lk) || v === undefined) continue;
            outHeaders[lk] = Array.isArray(v) ? v.join(', ') : String(v);
          }

          outHeaders['user-agent'] = req.get('user-agent') || BROWSER_UA;
          outHeaders['accept-encoding'] = 'identity';
          if (outHeaders.referer) {
            outHeaders.referer = swapWorkerStrings(outHeaders.referer, httpMount, safeWorker.origin);
          } else {
            outHeaders.referer = `${safeWorker.origin}/`;
          }
          if (outHeaders.origin) {
            outHeaders.origin = swapWorkerStrings(outHeaders.origin, httpMount, safeWorker.origin);
          } else if (req.method !== 'GET' && req.method !== 'HEAD') {
            outHeaders.origin = safeWorker.origin;
          }

          let outBody: Uint8Array<ArrayBuffer> | undefined;
          const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
          if (hasBody && Buffer.isBuffer(req.body) && req.body.length > 0) {
            const ctype = String(req.headers['content-type'] || '');
            let rawBuf: Buffer = req.body;
            if (REQ_TEXT_RE.test(ctype) && req.body.length <= 262144) {
              const swappedBody = swapWorkerStrings(req.body.toString('utf8'), httpMount, safeWorker.origin);
              rawBuf = Buffer.from(swappedBody, 'utf8');
            }
            const copy = new Uint8Array(new ArrayBuffer(rawBuf.length));
            copy.set(rawBuf);
            outBody = copy;
          }

          const upstream = await fetch(targetUrl.toString(), {
            method: req.method,
            headers: outHeaders,
            redirect: 'manual',
            body: outBody,
            signal: AbortSignal.timeout(15000),
          });

          lastStatus = upstream.status;

          // Rotate immediately if this worker is rate-limited (429) or failing with 5xx
          if (upstream.status === 429 || upstream.status === 502 || upstream.status === 503) {
            if (upstream.status === 429) {
              markWorkerLimited(safeWorker.origin, upstream.headers.get('retry-after'));
            }
            continue;
          }

          const ct = upstream.headers.get('content-type') || '';

          // Handle 3xx redirects cleanly inside /api/tools-app/choco-abema/
          const loc = upstream.headers.get('location');
          if (loc && upstream.status >= 300 && upstream.status < 400) {
            let nextLoc = swapWorkerStrings(loc, safeWorker.origin, httpMount);
            if (nextLoc.startsWith('/') && !nextLoc.startsWith('//') && !nextLoc.startsWith(MOUNT_PREFIX)) {
              nextLoc = `${MOUNT_PREFIX}${nextLoc}`;
            }
            return res.redirect(upstream.status, nextLoc);
          }

          // Forward safe response headers
          upstream.headers.forEach((value, key) => {
            const lk = key.toLowerCase();
            if (DROP_RES_HEADERS.has(lk)) return;
            if (lk === 'content-security-policy') {
              const relaxed = value
                .replace(/;?\s*frame-ancestors[^;]*/gi, '')
                .replace(/^\s*;\s*/, '');
              if (relaxed) res.setHeader(key, relaxed);
              return;
            }
            res.setHeader(key, value);
          });

          // Pin this healthy worker for subsequent asset/API fetches
          preferredWorkerOrigin = safeWorker.origin;

          const canRewrite =
            req.method !== 'HEAD' &&
            upstream.status !== 204 &&
            upstream.status !== 304 &&
            REWRITE_CONTENT_RE.test(ct);

          if (canRewrite) {
            let text = await upstream.text();

            // Check if a worker itself returned ABEMA's geo-block page on root HTML; try next worker if so
            if (
              cleanRelPath === '/' &&
              ct.includes('text/html') &&
              text.includes('このサービスはお住まいの地域からはご利用になれません')
            ) {
              markWorkerLimited(safeWorker.origin);
              continue;
            }

            text = swapWorkerStrings(text, safeWorker.origin, httpMount);
            if (ct.includes('text/html')) {
              text = patchWorkerClientBootstrap(text);
            }

            res.setHeader('Content-Type', ct || 'text/html; charset=utf-8');
            return res.status(upstream.status).send(text);
          }

          const buf = Buffer.from(await upstream.arrayBuffer());
          return res.status(upstream.status).send(buf);
        } catch {
          // Try next worker in pool
        }
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(buildChocoAbemaErrorHtml(lastStatus));
    }
  );
}
