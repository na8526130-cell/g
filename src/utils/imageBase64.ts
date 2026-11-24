const MAX_CLIENT_CACHE = 400;
const base64Cache = new Map<string, string>();
const inFlightRequests = new Map<string, Promise<string | undefined>>();

function setCache(key: string, value: string) {
  if (base64Cache.size >= MAX_CLIENT_CACHE) {
    const oldestKey = base64Cache.keys().next().value;
    if (oldestKey) {
      base64Cache.delete(oldestKey);
    }
  }
  base64Cache.set(key, value);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:')) {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert blob to base64 data URL'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}

export function getCachedBase64Image(rawSrc?: string): string | undefined {
  if (!rawSrc) return undefined;
  if (rawSrc.startsWith('data:') || rawSrc.startsWith('blob:')) {
    return rawSrc;
  }
  if (typeof window !== 'undefined') {
    const gasAssets = (window as any).__GAS_LOCAL_ASSETS__;
    if (gasAssets && gasAssets[rawSrc]) {
      return gasAssets[rawSrc];
    }
  }
  return base64Cache.get(rawSrc);
}

export async function toBase64Image(rawSrc?: string): Promise<string | undefined> {
  if (!rawSrc) return undefined;
  const trimmed = rawSrc.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  if (typeof window !== 'undefined') {
    const gasAssets = (window as any).__GAS_LOCAL_ASSETS__;
    if (gasAssets && gasAssets[trimmed]) {
      setCache(trimmed, gasAssets[trimmed]);
      return gasAssets[trimmed];
    }
  }

  const cached = base64Cache.get(trimmed);
  if (cached) {
    return cached;
  }

  const existingPromise = inFlightRequests.get(trimmed);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = (async (): Promise<string | undefined> => {
    try {
      // Local or same-origin assets: fetch directly and convert Blob -> base64 data URL
      const isLocal =
        trimmed.startsWith('/') ||
        trimmed.startsWith('./') ||
        (typeof window !== 'undefined' && trimmed.startsWith(window.location.origin));

      if (isLocal && !trimmed.startsWith('/api/proxy/image')) {
        const res = await fetch(trimmed, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const blob = await res.blob();
          const dataUrl = await blobToDataUrl(blob);
          setCache(trimmed, dataUrl);
          return dataUrl;
        }
      }

      // External HTTP/HTTPS URLs (or fallback): fetch Base64 via backend proxy
      const targetUrl = trimmed.startsWith('/api/proxy/image')
        ? trimmed.includes('format=base64')
          ? trimmed
          : `${trimmed}${trimmed.includes('?') ? '&' : '?'}format=base64`
        : `/api/proxy/image?url=${encodeURIComponent(trimmed)}&format=base64`;

      const proxyRes = await fetch(targetUrl, { signal: AbortSignal.timeout(5000) });
      if (proxyRes.ok) {
        const contentType = proxyRes.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await proxyRes.json();
          if (typeof data?.base64 === 'string' && data.base64.startsWith('data:')) {
            setCache(trimmed, data.base64);
            return data.base64;
          }
        } else {
          const blob = await proxyRes.blob();
          const dataUrl = await blobToDataUrl(blob);
          setCache(trimmed, dataUrl);
          return dataUrl;
        }
      }

      return undefined;
    } catch {
      return undefined;
    } finally {
      inFlightRequests.delete(trimmed);
    }
  })();

  inFlightRequests.set(trimmed, promise);
  return promise;
}
