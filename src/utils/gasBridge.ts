// Google Apps Script (HtmlService) runtime bridge
// No-op when running on standard Node/Express server.

interface GasSocketInstance {
  readyState: number;
  onopen: ((ev: any) => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onerror: ((ev: any) => void) | null;
  onclose: ((ev: any) => void) | null;
  send: (data: string) => void;
  close: () => void;
}

function getGasRunner(): any {
  if (typeof window === 'undefined') return null;
  const g = (window as any).google;
  return g && g.script && g.script.run ? g.script.run : null;
}

function callGasServer<T = any>(fnName: string, ...args: any[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const runner = getGasRunner();
    if (!runner) {
      reject(new Error('GAS runner unavailable'));
      return;
    }
    runner
      .withSuccessHandler((res: T) => resolve(res))
      .withFailureHandler((err: any) => reject(err))
      [fnName](...args);
  });
}

function installGasBridge() {
  if (typeof window === 'undefined') return;
  const runner = getGasRunner();
  if (!runner) return;

  // Prevent double installation
  if ((window as any).__GAS_BRIDGE_INSTALLED__) return;
  (window as any).__GAS_BRIDGE_INSTALLED__ = true;

  // Disable Service Worker registration inside GAS HtmlService (googleusercontent.com sandbox)
  if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
    try {
      Object.defineProperty(navigator.serviceWorker, 'register', {
        value: () => Promise.resolve({}),
        configurable: true,
      });
    } catch {
      // ignore if non-configurable
    }
  }

  // Restore initial URL query parameters passed by doGet(e) if present
  const initParams = (window as any).__GAS_INIT_PARAMS__;
  if (initParams && typeof initParams === 'object' && Object.keys(initParams).length > 0) {
    try {
      const qs = new URLSearchParams(initParams).toString();
      if (qs && !window.location.search) {
        window.history.replaceState({}, '', `${window.location.pathname}?${qs}`);
      }
    } catch {
      // ignore
    }
  }

  // 1. Intercept fetch('/api/...') & fetch('/assets/...')
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

    // Resolve relative paths against origin if needed
    let pathAndQuery = rawUrl;
    if (rawUrl.startsWith(window.location.origin)) {
      pathAndQuery = rawUrl.slice(window.location.origin.length);
    }

    // Serve embedded Base64 local assets when running in GAS
    if (pathAndQuery.startsWith('/assets/') || pathAndQuery.startsWith('./assets/')) {
      const cleanPath = pathAndQuery.replace(/^\./, '');
      const localMap = (window as any).__GAS_LOCAL_ASSETS__ || {};
      const dataUrl: string | undefined = localMap[cleanPath];
      if (dataUrl && dataUrl.startsWith('data:')) {
        const res = await nativeFetch(dataUrl);
        return res;
      }
    }

    // Route /api/* calls to Code.gs apiDispatch()
    if (pathAndQuery.startsWith('/api/')) {
      const method = (init?.method || (typeof input !== 'string' && !(input instanceof URL) ? input.method : 'GET') || 'GET').toUpperCase();
      let bodyStr = '';
      if (init?.body != null) {
        bodyStr = typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
      }

      try {
        const result = await callGasServer<{
          status?: number;
          headers?: Record<string, string>;
          data?: any;
          rawText?: string;
        }>('apiDispatch', method, pathAndQuery, bodyStr);

        const status = result?.status || 200;
        const headers = new Headers(result?.headers || { 'Content-Type': 'application/json' });
        const payload =
          result?.rawText !== undefined
            ? result.rawText
            : JSON.stringify(result?.data !== undefined ? result.data : {});
        return new Response(payload, { status, headers });
      } catch (err: any) {
        return new Response(
          JSON.stringify({ error: err?.message || String(err) || 'GAS API Error' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    return nativeFetch(input, init);
  };

  // 2. Intercept navigator.sendBeacon for /api/presence/leave
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const nativeBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null): boolean => {
      const urlStr = typeof url === 'string' ? url : url.toString();
      if (urlStr.startsWith('/api/')) {
        let bodyStr = '';
        if (typeof data === 'string') {
          bodyStr = data;
        } else if (data instanceof Blob) {
          data.text().then((txt) => {
            callGasServer('apiDispatch', 'POST', urlStr, txt).catch(() => {});
          });
          return true;
        }
        callGasServer('apiDispatch', 'POST', urlStr, bodyStr).catch(() => {});
        return true;
      }
      return nativeBeacon(url, data);
    };
  }

  // 3. Emulate WebSocket for SocialSocketService over GAS polling
  const NativeWebSocket = window.WebSocket;
  const gasClientId = `gas_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  class GasWebSocket implements GasSocketInstance {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    readyState = 0;
    onopen: ((ev: any) => void) | null = null;
    onmessage: ((ev: { data: string }) => void) | null = null;
    onerror: ((ev: any) => void) | null = null;
    onclose: ((ev: any) => void) | null = null;

    private pollTimer: any = null;
    private lastSeq = 0;
    private meta: { username?: string; roomId?: string; videoId?: string; nowPlaying?: any } = {};

    constructor(url: string) {
      if (!url.includes(window.location.host)) {
        return new NativeWebSocket(url) as any;
      }

      setTimeout(() => {
        this.readyState = 1;
        this.onopen?.({});
        this.poll();
        this.pollTimer = setInterval(() => this.poll(), 4000);
      }, 80);
    }

    private emitMessage(data: any) {
      try {
        this.onmessage?.({ data: JSON.stringify(data) });
      } catch {
        // ignore listener errors
      }
    }

    private async poll() {
      if (this.readyState !== 1) return;
      try {
        const res = await callGasServer<{ seq?: number; events?: any[] }>(
          'gasSocketPoll',
          gasClientId,
          this.lastSeq,
          JSON.stringify(this.meta)
        );
        if (typeof res?.seq === 'number') {
          this.lastSeq = res.seq;
        }
        if (Array.isArray(res?.events)) {
          for (const ev of res.events) {
            this.emitMessage(ev);
          }
        }
      } catch {
        // ignore transient polling failures
      }
    }

    send(raw: string) {
      if (this.readyState !== 1) return;
      try {
        const payload = JSON.parse(raw);
        if (payload.type === 'auth' && payload.username) {
          this.meta.username = payload.username;
        } else if (payload.type === 'presence') {
          if (payload.username) this.meta.username = payload.username;
          this.meta.nowPlaying = payload.nowPlaying || null;
          this.meta.videoId = payload.nowPlaying?.videoId || this.meta.videoId;
        } else if (payload.type === 'watch:video') {
          this.meta.videoId = payload.videoId;
        } else if (payload.type === 'party:join') {
          this.meta.roomId = payload.roomId;
          if (payload.username) this.meta.username = payload.username;
        } else if (payload.type === 'party:leave') {
          this.meta.roomId = undefined;
        }

        callGasServer<{ seq?: number; events?: any[] }>(
          'gasSocketSend',
          gasClientId,
          JSON.stringify(payload)
        )
          .then((res) => {
            if (typeof res?.seq === 'number' && res.seq > this.lastSeq) {
              this.lastSeq = res.seq;
            }
            if (Array.isArray(res?.events)) {
              for (const ev of res.events) {
                this.emitMessage(ev);
              }
            }
          })
          .catch(() => {});
      } catch {
        // ignore malformed send
      }
    }

    close() {
      this.readyState = 3;
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      this.onclose?.({});
    }
  }

  (window as any).WebSocket = GasWebSocket;
}

installGasBridge();
export {};
