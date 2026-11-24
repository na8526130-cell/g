const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export type FreemakeDownloadSiteId =
  | 'youtube-direct'
  | 'cobalt'
  | 'piped'
  | 'invidious'
  | 'bilibili-full'
  | 'niconico-full'
  | 'soundcloud-full'
  | 'dailymotion-full'
  | 'vimeo-full'
  | 'jiosaavn-full'
  | 'audius-full'
  | 'hearthis-full'
  | 'odysee-full'
  | 'peertube-full'
  | 'archive-full';

export interface FreemakeDownloadSiteSpec {
  id: FreemakeDownloadSiteId;
  name: string;
  category: 'youtube-mirror' | 'full-track-search';
  supportsVideo: boolean;
  badge: string;
  description: string;
}

export const FREEMAKE_DOWNLOAD_SITES: FreemakeDownloadSiteSpec[] = [
  {
    id: 'youtube-direct',
    name: 'YouTube Direct',
    category: 'youtube-mirror',
    supportsVideo: true,
    badge: 'InnerTube',
    description: 'YouTube 公式マルチクライアント直接抽出',
  },
  {
    id: 'cobalt',
    name: 'Cobalt Network',
    category: 'youtube-mirror',
    supportsVideo: true,
    badge: 'Cobalt API',
    description: 'Cobalt インスタンス経由の高速取得',
  },
  {
    id: 'piped',
    name: 'Piped Network',
    category: 'youtube-mirror',
    supportsVideo: true,
    badge: 'Mirror Pool',
    description: '公開 Piped API ノード群からのミラー取得',
  },
  {
    id: 'invidious',
    name: 'Invidious Mirrors',
    category: 'youtube-mirror',
    supportsVideo: true,
    badge: 'Mirror Pool',
    description: '公開 Invidious API ノード群からのミラー取得',
  },
  {
    id: 'bilibili-full',
    name: 'Bilibili',
    category: 'full-track-search',
    supportsVideo: true,
    badge: 'Music / MV',
    description: '高音質 DASH 音声・公式 MV・URL直接解析対応',
  },
  {
    id: 'niconico-full',
    name: 'ニコニコ動画',
    category: 'full-track-search',
    supportsVideo: true,
    badge: 'URL / Watch',
    description: 'nicovideo.jp / nico.ms URLメタデータ＆音声・動画解決',
  },
  {
    id: 'soundcloud-full',
    name: 'SoundCloud',
    category: 'full-track-search',
    supportsVideo: false,
    badge: 'MP3 / HLS',
    description: 'フル尺 Progressive / HLS オーディオ・URL直接取得',
  },
  {
    id: 'dailymotion-full',
    name: 'Dailymotion',
    category: 'full-track-search',
    supportsVideo: true,
    badge: 'MV / HD MP4',
    description: '公式 MV HD MP4 / HLS ストリーム・URL直接取得',
  },
  {
    id: 'vimeo-full',
    name: 'Vimeo',
    category: 'full-track-search',
    supportsVideo: true,
    badge: 'URL / HD MP4',
    description: 'Vimeo URL 直接解析・高画質 MP4 取得',
  },
  {
    id: 'jiosaavn-full',
    name: 'JioSaavn',
    category: 'full-track-search',
    supportsVideo: false,
    badge: '320k AAC',
    description: '最大320kbps AAC 公式フル音源エンジン',
  },
  {
    id: 'audius-full',
    name: 'Audius',
    category: 'full-track-search',
    supportsVideo: false,
    badge: 'MP3 Stream',
    description: 'オープン音楽プラットフォーム直接 MP3 配信',
  },
  {
    id: 'hearthis-full',
    name: 'Hearthis.at',
    category: 'full-track-search',
    supportsVideo: false,
    badge: 'HD Audio',
    description: 'DJ Mix / Remix / オリジナル音源',
  },
  {
    id: 'odysee-full',
    name: 'Odysee / LBRY',
    category: 'full-track-search',
    supportsVideo: true,
    badge: 'P2P Media',
    description: 'LBRY 分散ネットワーク直接メディア取得',
  },
  {
    id: 'peertube-full',
    name: 'PeerTube',
    category: 'full-track-search',
    supportsVideo: true,
    badge: 'Fediverse',
    description: 'SepiaSearch 横断の連合動画/音楽ノード',
  },
  {
    id: 'archive-full',
    name: 'Internet Archive',
    category: 'full-track-search',
    supportsVideo: false,
    badge: 'MP3 / FLAC',
    description: 'archive.org 公開音楽アーカイブ',
  },
];

export interface SearchHelpers {
  cleanSearchTitle: (title: string, artist?: string) => string;
  stripHtmlTags: (s: string) => string;
  scoreCandidateTrack: (params: {
    candidateTitle: string;
    candidateAuthor?: string;
    collectionTitle?: string;
    durationSec: number;
    playCount?: number;
    targetTitle: string;
    targetArtist: string;
    expectedDurationSec?: number;
  }) => number;
  probeRemoteStream: (
    url: string,
    headers: Record<string, string>
  ) => Promise<{ ok: boolean; totalSize: number }>;
  minCandidateScore: number;
  isVercel: boolean;
}

export interface ExternalSiteCandidate {
  siteId: FreemakeDownloadSiteId;
  siteName: string;
  title: string;
  author: string;
  durationSec: number;
  score: number;
  hasVideo: boolean;
  resolveStream: () => Promise<{
    url: string;
    protocol: 'direct' | 'hls';
    headers?: Record<string, string>;
    durationSec: number;
    hasVideo?: boolean;
  } | null>;
}

// ---------- Pure-TS DES-ECB Decryption (for JioSaavn encrypted_media_url) ----------

const DES_IP = [
  58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4,
  62, 54, 46, 38, 30, 22, 14, 6, 64, 56, 48, 40, 32, 24, 16, 8,
  57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3,
  61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7,
];
const DES_FP = [
  40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31,
  38, 6, 46, 14, 54, 22, 62, 30, 37, 5, 45, 13, 53, 21, 61, 29,
  36, 4, 44, 12, 52, 20, 60, 28, 35, 3, 43, 11, 51, 19, 59, 27,
  34, 2, 42, 10, 50, 18, 58, 26, 33, 1, 41, 9, 49, 17, 57, 25,
];
const DES_PC1 = [
  57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18,
  10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60, 52, 44, 36,
  63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22,
  14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 28, 20, 12, 4,
];
const DES_PC2 = [
  14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10, 23, 19, 12, 4,
  26, 8, 16, 7, 27, 20, 13, 2, 41, 52, 31, 37, 47, 55, 30, 40,
  51, 45, 33, 48, 44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32,
];
const DES_SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];
const DES_E = [
  32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9, 8, 9, 10, 11,
  12, 13, 12, 13, 14, 15, 16, 17, 16, 17, 18, 19, 20, 21, 20, 21,
  22, 23, 24, 25, 24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32, 1,
];
const DES_P = [
  16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10,
  2, 8, 24, 14, 32, 27, 3, 9, 19, 13, 30, 6, 22, 11, 4, 25,
];
const DES_S = [
  [
    14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7,
    0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8,
    4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0,
    15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13,
  ],
  [
    15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10,
    3, 13, 4, 7, 15, 2, 8, 14, 12, 0, 1, 10, 6, 9, 11, 5,
    0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15,
    13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9,
  ],
  [
    10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8,
    13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1,
    13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7,
    1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12,
  ],
  [
    7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15,
    13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9,
    10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4,
    3, 15, 0, 6, 10, 1, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14,
  ],
  [
    2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9,
    14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6,
    4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14,
    11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3,
  ],
  [
    12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11,
    10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8,
    9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6,
    4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13,
  ],
  [
    4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1,
    13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6,
    1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2,
    6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12,
  ],
  [
    13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7,
    1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2,
    7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8,
    2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11,
  ],
];

function desPermute(bits: number[], table: number[]): number[] {
  return table.map((p) => bits[p - 1]);
}

function bytesToBits(buf: Uint8Array): number[] {
  const out: number[] = [];
  for (const b of buf) {
    for (let i = 7; i >= 0; i--) out.push((b >> i) & 1);
  }
  return out;
}

function bitsToBuffer(bits: number[]): Buffer {
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    out.push(v);
  }
  return Buffer.from(out);
}

function decryptDesEcbBase64(b64: string, keyStr = '38346591'): string {
  const keyBits = desPermute(bytesToBits(Buffer.from(keyStr, 'utf8')), DES_PC1);
  let C = keyBits.slice(0, 28);
  let D = keyBits.slice(28);
  const subkeys: number[][] = [];
  for (let r = 0; r < 16; r++) {
    const s = DES_SHIFTS[r];
    C = C.slice(s).concat(C.slice(0, s));
    D = D.slice(s).concat(D.slice(0, s));
    subkeys.push(desPermute(C.concat(D), DES_PC2));
  }

  const cipher = Buffer.from(b64, 'base64');
  const outBufs: Buffer[] = [];
  for (let off = 0; off + 8 <= cipher.length; off += 8) {
    const block = desPermute(bytesToBits(cipher.subarray(off, off + 8)), DES_IP);
    let L = block.slice(0, 32);
    let R = block.slice(32);
    for (let r = 15; r >= 0; r--) {
      const exp = desPermute(R, DES_E);
      const x = exp.map((b, i) => b ^ subkeys[r][i]);
      const sb: number[] = [];
      for (let k = 0; k < 8; k++) {
        const chunk = x.slice(k * 6, k * 6 + 6);
        const row = (chunk[0] << 1) | chunk[5];
        const col = (chunk[1] << 3) | (chunk[2] << 2) | (chunk[3] << 1) | chunk[4];
        const val = DES_S[k][row * 16 + col];
        sb.push((val >> 3) & 1, (val >> 2) & 1, (val >> 1) & 1, val & 1);
      }
      const f = desPermute(sb, DES_P);
      const nextR = L.map((b, i) => b ^ f[i]);
      L = R;
      R = nextR;
    }
    outBufs.push(bitsToBuffer(desPermute(R.concat(L), DES_FP)));
  }

  const res = Buffer.concat(outBufs);
  if (res.length === 0) return '';
  const pad = res[res.length - 1];
  const unpadded = pad >= 1 && pad <= 8 ? res.subarray(0, res.length - pad) : res;
  return unpadded.toString('utf8');
}

// ---------- Piped & Invidious Mirror Pools ----------

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.private.coffee',
  'https://pipedapi.r4fo.com',
  'https://pipedapi.darkness.services',
];

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://invidious.jing.rocks',
  'https://iv.datura.network',
];

function extractStreamHeight(raw: any): number {
  if (typeof raw?.height === 'number' && raw.height > 0) return raw.height;
  const qStr = String(raw?.quality || raw?.qualityLabel || '');
  const m = qStr.match(/(\d{3,4})p/i);
  return m?.[1] ? Number(m[1]) || 0 : 0;
}

function sortVideoStreamsByHeight(streams: any[], maxVideoHeight = 0): any[] {
  return [...streams].sort((a, b) => {
    const ha = extractStreamHeight(a);
    const hb = extractStreamHeight(b);
    if (maxVideoHeight > 0) {
      const aFits = ha > 0 && ha <= maxVideoHeight ? 0 : 1;
      const bFits = hb > 0 && hb <= maxVideoHeight ? 0 : 1;
      if (aFits !== bFits) return aFits - bFits;
      if (aFits === 0 && ha !== hb) return hb - ha;
      if (ha !== hb) return ha - hb;
    } else if (ha !== hb) {
      return hb - ha;
    }
    return (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0);
  });
}

export async function resolveViaPipedPool(
  videoId: string,
  wantsVideo: boolean,
  probeRemoteStream: SearchHelpers['probeRemoteStream'],
  isVercel: boolean,
  maxVideoHeight = 0
): Promise<{
  url: string;
  sourceKind: 'piped';
  sourceLabel: string;
  durationSec?: number;
} | null> {
  const attempts = PIPED_INSTANCES.map(async (base) => {
    const res = await fetch(`${base}/streams/${encodeURIComponent(videoId)}`, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(3800),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as any;
    const durSec = Number(data?.duration) || 0;
    const streams: any[] = wantsVideo
      ? Array.isArray(data?.videoStreams)
        ? data.videoStreams.filter((s: any) => !s.videoOnly && s.url)
        : []
      : Array.isArray(data?.audioStreams)
      ? data.audioStreams.filter((s: any) => s.url)
      : [];

    const sorted = wantsVideo
      ? sortVideoStreamsByHeight(streams, maxVideoHeight)
      : [...streams].sort((a, b) =>
          isVercel
            ? (Number(a.bitrate) || 0) - (Number(b.bitrate) || 0)
            : (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0)
        );

    for (const st of sorted.slice(0, 3)) {
      const probe = await probeRemoteStream(st.url, { 'User-Agent': BROWSER_UA });
      if (probe.ok) {
        if (isVercel && !wantsVideo && probe.totalSize > 4_350_000) continue;
        const host = base.replace(/^https?:\/\//, '');
        return {
          url: String(st.url),
          sourceKind: 'piped' as const,
          sourceLabel: `Piped ミラー (${host})`,
          durationSec: durSec || undefined,
        };
      }
    }
    throw new Error('No working stream');
  });

  try {
    return await Promise.any(attempts);
  } catch {
    return null;
  }
}

export async function resolveViaInvidiousPool(
  videoId: string,
  wantsVideo: boolean,
  probeRemoteStream: SearchHelpers['probeRemoteStream'],
  isVercel: boolean,
  maxVideoHeight = 0
): Promise<{
  url: string;
  sourceKind: 'invidious';
  sourceLabel: string;
  durationSec?: number;
} | null> {
  const attempts = INVIDIOUS_INSTANCES.map(async (base) => {
    const res = await fetch(`${base}/api/v1/videos/${encodeURIComponent(videoId)}`, {
      headers: { 'User-Agent': BROWSER_UA },
      signal: AbortSignal.timeout(3800),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as any;
    const durSec = Number(data?.lengthSeconds) || 0;
    const rawList: any[] = wantsVideo
      ? Array.isArray(data?.formatStreams)
        ? data.formatStreams
        : []
      : Array.isArray(data?.adaptiveFormats)
      ? data.adaptiveFormats.filter((f: any) => String(f?.type || '').startsWith('audio/'))
      : [];

    const filtered = rawList.filter((f) => typeof f?.url === 'string' && f.url);
    const sorted = wantsVideo
      ? sortVideoStreamsByHeight(filtered, maxVideoHeight)
      : [...filtered].sort((a, b) =>
          isVercel
            ? (Number(a.bitrate) || 0) - (Number(b.bitrate) || 0)
            : (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0)
        );

    for (const fmt of sorted.slice(0, 3)) {
      const probe = await probeRemoteStream(fmt.url, { 'User-Agent': BROWSER_UA });
      if (probe.ok) {
        if (isVercel && !wantsVideo && probe.totalSize > 4_350_000) continue;
        const host = base.replace(/^https?:\/\//, '');
        return {
          url: String(fmt.url),
          sourceKind: 'invidious' as const,
          sourceLabel: `Invidious ミラー (${host})`,
          durationSec: durSec || undefined,
        };
      }
    }
    throw new Error('No working stream');
  });

  try {
    return await Promise.any(attempts);
  } catch {
    return null;
  }
}

// ---------- Individual Full-Track Search Engines ----------

async function searchJioSaavn(
  title: string,
  artist: string,
  expectedDurationSec: number,
  helpers: SearchHelpers
): Promise<ExternalSiteCandidate[]> {
  const cleanTitle = helpers.cleanSearchTitle(title, artist) || title;
  const keyword = [artist, cleanTitle].filter(Boolean).join(' ').trim();
  if (!keyword) return [];

  try {
    const res = await fetch(
      `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&ctx=web6dot0&n=10&q=${encodeURIComponent(
        keyword
      )}`,
      { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(4500) }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    const list: any[] = Array.isArray(data?.results) ? data.results : [];
    const out: ExternalSiteCandidate[] = [];

    for (const item of list) {
      const encUrl = String(item?.more_info?.encrypted_media_url || item?.encrypted_media_url || '').trim();
      if (!encUrl) continue;
      const candTitle = helpers.stripHtmlTags(String(item?.title || item?.song || ''));
      const candArtist = helpers.stripHtmlTags(
        String(
          item?.more_info?.artistMap?.primary_artists?.map((a: any) => a?.name).filter(Boolean).join(', ') ||
            item?.primary_artists ||
            item?.subtitle ||
            ''
        )
      );
      const durSec = Number(item?.more_info?.duration || item?.duration) || 0;
      if (durSec > 0 && durSec < 45) continue;

      const score = helpers.scoreCandidateTrack({
        candidateTitle: candTitle,
        candidateAuthor: candArtist,
        durationSec: durSec,
        playCount: Number(item?.play_count) || 0,
        targetTitle: title,
        targetArtist: artist,
        expectedDurationSec,
      });

      if (score >= helpers.minCandidateScore) {
        out.push({
          siteId: 'jiosaavn-full',
          siteName: 'JioSaavn',
          title: candTitle,
          author: candArtist,
          durationSec: durSec,
          score,
          hasVideo: false,
          resolveStream: async () => {
            try {
              const baseUrl = decryptDesEcbBase64(encUrl).replace(/^http:\/\//i, 'https://');
              if (!baseUrl.startsWith('https://')) return null;
              const suffixes = helpers.isVercel
                ? ['_160.mp4', '_96.mp4', '_320.mp4']
                : ['_320.mp4', '_160.mp4', '_96.mp4'];
              for (const sfx of suffixes) {
                const candUrl = baseUrl.replace(/_(?:96|160|320)\.mp4$/i, sfx);
                const probe = await helpers.probeRemoteStream(candUrl, { 'User-Agent': BROWSER_UA });
                if (probe.ok) {
                  if (helpers.isVercel && probe.totalSize > 4_350_000) continue;
                  return { url: candUrl, protocol: 'direct', durationSec: durSec };
                }
              }
            } catch {}
            return null;
          },
        });
      }
    }
    return out.sort((a, b) => b.score - a.score);
  } catch {
    return [];
  }
}

async function searchAudius(
  title: string,
  artist: string,
  expectedDurationSec: number,
  helpers: SearchHelpers
): Promise<ExternalSiteCandidate[]> {
  const cleanTitle = helpers.cleanSearchTitle(title, artist) || title;
  const keyword = [artist, cleanTitle].filter(Boolean).join(' ').trim();
  if (!keyword) return [];

  try {
    const res = await fetch(
      `https://discoveryprovider.audius.co/v1/tracks/search?query=${encodeURIComponent(
        keyword
      )}&app_name=ZeroMusic`,
      { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(4500) }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    const list: any[] = Array.isArray(data?.data) ? data.data : [];
    const out: ExternalSiteCandidate[] = [];

    for (const t of list.slice(0, 10)) {
      if (!t?.id || t.is_streamable === false) continue;
      const candTitle = String(t.title || '');
      const candAuthor = String(t.user?.name || t.user?.handle || '');
      const durSec = Number(t.duration) || 0;
      if (durSec > 0 && durSec < 45) continue;

      const score = helpers.scoreCandidateTrack({
        candidateTitle: candTitle,
        candidateAuthor: candAuthor,
        durationSec: durSec,
        playCount: Number(t.play_count) || 0,
        targetTitle: title,
        targetArtist: artist,
        expectedDurationSec,
      });

      if (score >= helpers.minCandidateScore) {
        const trackId = String(t.id);
        out.push({
          siteId: 'audius-full',
          siteName: 'Audius',
          title: candTitle,
          author: candAuthor,
          durationSec: durSec,
          score,
          hasVideo: false,
          resolveStream: async () => {
            const url = `https://discoveryprovider.audius.co/v1/tracks/${encodeURIComponent(
              trackId
            )}/stream?app_name=ZeroMusic`;
            const probe = await helpers.probeRemoteStream(url, { 'User-Agent': BROWSER_UA });
            if (!probe.ok) return null;
            if (helpers.isVercel && probe.totalSize > 4_350_000) return null;
            return { url, protocol: 'direct', durationSec: durSec };
          },
        });
      }
    }
    return out.sort((a, b) => b.score - a.score);
  } catch {
    return [];
  }
}

async function searchDailymotion(
  title: string,
  artist: string,
  expectedDurationSec: number,
  helpers: SearchHelpers
): Promise<ExternalSiteCandidate[]> {
  const cleanTitle = helpers.cleanSearchTitle(title, artist) || title;
  const keyword = [artist, cleanTitle].filter(Boolean).join(' ').trim();
  if (!keyword) return [];

  try {
    const res = await fetch(
      `https://api.dailymotion.com/videos?fields=id,title,duration,owner.screenname,views_total&search=${encodeURIComponent(
        keyword
      )}&limit=10`,
      { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(4500) }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    const list: any[] = Array.isArray(data?.list) ? data.list : [];
    const out: ExternalSiteCandidate[] = [];

    for (const v of list) {
      if (!v?.id) continue;
      const candTitle = String(v.title || '');
      const candAuthor = String(v['owner.screenname'] || '');
      const durSec = Number(v.duration) || 0;
      if (durSec > 0 && durSec < 45) continue;

      const score = helpers.scoreCandidateTrack({
        candidateTitle: candTitle,
        candidateAuthor: candAuthor,
        durationSec: durSec,
        playCount: Number(v.views_total) || 0,
        targetTitle: title,
        targetArtist: artist,
        expectedDurationSec,
      });

      if (score >= helpers.minCandidateScore) {
        const videoId = String(v.id);
        out.push({
          siteId: 'dailymotion-full',
          siteName: 'Dailymotion',
          title: candTitle,
          author: candAuthor,
          durationSec: durSec,
          score,
          hasVideo: true,
          resolveStream: async () => {
            try {
              const metaRes = await fetch(
                `https://www.dailymotion.com/player/metadata/video/${encodeURIComponent(videoId)}`,
                { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(4500) }
              );
              if (!metaRes.ok) return null;
              const meta = (await metaRes.json()) as any;
              const m3u8 =
                meta?.qualities?.auto?.[0]?.url ||
                meta?.qualities?.['380']?.[0]?.url ||
                meta?.qualities?.['480']?.[0]?.url;
              if (typeof m3u8 === 'string' && m3u8.startsWith('http')) {
                return {
                  url: m3u8,
                  protocol: 'hls',
                  headers: { 'User-Agent': BROWSER_UA, Referer: 'https://www.dailymotion.com/' },
                  durationSec: durSec,
                  hasVideo: true,
                };
              }
            } catch {}
            return null;
          },
        });
      }
    }
    return out.sort((a, b) => b.score - a.score);
  } catch {
    return [];
  }
}

async function searchHearthis(
  title: string,
  artist: string,
  expectedDurationSec: number,
  helpers: SearchHelpers
): Promise<ExternalSiteCandidate[]> {
  const cleanTitle = helpers.cleanSearchTitle(title, artist) || title;
  const keyword = [artist, cleanTitle].filter(Boolean).join(' ').trim();
  if (!keyword) return [];

  try {
    const res = await fetch(
      `https://api-v2.hearthis.at/search/?t=${encodeURIComponent(keyword)}&count=10`,
      { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(4500) }
    );
    if (!res.ok) return [];
    const list: any[] = (await res.json()) as any[];
    if (!Array.isArray(list)) return [];
    const out: ExternalSiteCandidate[] = [];

    for (const t of list) {
      if (!t || t.private) continue;
      const streamUrl = String(t.download_url || t.stream_url || '').trim();
      if (!streamUrl.startsWith('http')) continue;
      const candTitle = String(t.title || '');
      const candAuthor = String(t.user?.username || '');
      const durSec = Number(t.duration) || 0;
      if (durSec > 0 && durSec < 45) continue;

      const score = helpers.scoreCandidateTrack({
        candidateTitle: candTitle,
        candidateAuthor: candAuthor,
        durationSec: durSec,
        playCount: Number(t.playback_count) || 0,
        targetTitle: title,
        targetArtist: artist,
        expectedDurationSec,
      });

      if (score >= helpers.minCandidateScore) {
        const hdrs = { 'User-Agent': BROWSER_UA, Referer: 'https://hearthis.at/' };
        out.push({
          siteId: 'hearthis-full',
          siteName: 'Hearthis.at',
          title: candTitle,
          author: candAuthor,
          durationSec: durSec,
          score,
          hasVideo: false,
          resolveStream: async () => {
            const probe = await helpers.probeRemoteStream(streamUrl, hdrs);
            if (!probe.ok) return null;
            if (helpers.isVercel && probe.totalSize > 4_350_000) return null;
            return { url: streamUrl, protocol: 'direct', headers: hdrs, durationSec: durSec };
          },
        });
      }
    }
    return out.sort((a, b) => b.score - a.score);
  } catch {
    return [];
  }
}

async function searchOdysee(
  title: string,
  artist: string,
  expectedDurationSec: number,
  helpers: SearchHelpers
): Promise<ExternalSiteCandidate[]> {
  const cleanTitle = helpers.cleanSearchTitle(title, artist) || title;
  const keyword = [artist, cleanTitle].filter(Boolean).join(' ').trim();
  if (!keyword) return [];

  try {
    const res = await fetch(
      `https://lighthouse.lbry.com/search?s=${encodeURIComponent(keyword)}&size=8&mediaType=audio,video`,
      { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(4500) }
    );
    if (!res.ok) return [];
    const list: any[] = (await res.json()) as any[];
    if (!Array.isArray(list) || list.length === 0) return [];

    const uris = list
      .filter((x) => x?.name && x?.claimId)
      .slice(0, 6)
      .map((x) => `lbry://${x.name}#${x.claimId}`);
    if (uris.length === 0) return [];

    const resolveRes = await fetch('https://api.na-backend.odysee.com/api/v1/proxy?m=resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': BROWSER_UA },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'resolve', params: { urls: uris } }),
      signal: AbortSignal.timeout(4500),
    });
    if (!resolveRes.ok) return [];
    const resolvedJson = (await resolveRes.json()) as any;
    const claims = resolvedJson?.result || {};

    const out: ExternalSiteCandidate[] = [];
    for (const uri of uris) {
      const claim = claims[uri];
      if (!claim || claim.error) continue;
      const val = claim.value || {};
      const candTitle = String(val.title || claim.name || '');
      const candAuthor = String(claim.signing_channel?.value?.title || claim.signing_channel?.name || '');
      const durSec = Number(val.audio?.duration || val.video?.duration || 0);
      if (durSec > 0 && durSec < 45) continue;

      const score = helpers.scoreCandidateTrack({
        candidateTitle: candTitle,
        candidateAuthor: candAuthor,
        durationSec: durSec,
        targetTitle: title,
        targetArtist: artist,
        expectedDurationSec,
      });

      if (score >= helpers.minCandidateScore) {
        const hasVideo = val.stream_type === 'video' || Boolean(val.video);
        out.push({
          siteId: 'odysee-full',
          siteName: 'Odysee / LBRY',
          title: candTitle,
          author: candAuthor,
          durationSec: durSec,
          score,
          hasVideo,
          resolveStream: async () => {
            try {
              const gr = await fetch('https://api.na-backend.odysee.com/api/v1/proxy?m=get', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'User-Agent': BROWSER_UA },
                body: JSON.stringify({ jsonrpc: '2.0', method: 'get', params: { uri } }),
                signal: AbortSignal.timeout(4500),
              });
              if (!gr.ok) return null;
              const gj = (await gr.json()) as any;
              const streamUrl = String(gj?.result?.streaming_url || '').trim();
              if (!streamUrl.startsWith('http')) return null;
              const probe = await helpers.probeRemoteStream(streamUrl, { 'User-Agent': BROWSER_UA });
              if (!probe.ok) return null;
              if (helpers.isVercel && !hasVideo && probe.totalSize > 4_350_000) return null;
              return { url: streamUrl, protocol: 'direct', durationSec: durSec, hasVideo };
            } catch {
              return null;
            }
          },
        });
      }
    }
    return out.sort((a, b) => b.score - a.score);
  } catch {
    return [];
  }
}

async function searchPeerTube(
  title: string,
  artist: string,
  expectedDurationSec: number,
  helpers: SearchHelpers
): Promise<ExternalSiteCandidate[]> {
  const cleanTitle = helpers.cleanSearchTitle(title, artist) || title;
  const keyword = [artist, cleanTitle].filter(Boolean).join(' ').trim();
  if (!keyword) return [];

  try {
    const res = await fetch(
      `https://sepiasearch.org/api/v1/search/videos?search=${encodeURIComponent(keyword)}&count=8`,
      { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(4500) }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    const list: any[] = Array.isArray(data?.data) ? data.data : [];
    const out: ExternalSiteCandidate[] = [];

    for (const v of list) {
      const host = String(v?.account?.host || '').trim();
      const uuid = String(v?.uuid || '').trim();
      if (!host || !uuid) continue;
      const candTitle = String(v.name || '');
      const candAuthor = String(v.channel?.displayName || v.account?.displayName || v.account?.name || '');
      const durSec = Number(v.duration) || 0;
      if (durSec > 0 && durSec < 45) continue;

      const score = helpers.scoreCandidateTrack({
        candidateTitle: candTitle,
        candidateAuthor: candAuthor,
        durationSec: durSec,
        playCount: Number(v.views) || 0,
        targetTitle: title,
        targetArtist: artist,
        expectedDurationSec,
      });

      if (score >= helpers.minCandidateScore) {
        out.push({
          siteId: 'peertube-full',
          siteName: 'PeerTube',
          title: candTitle,
          author: candAuthor,
          durationSec: durSec,
          score,
          hasVideo: true,
          resolveStream: async () => {
            try {
              const vr = await fetch(`https://${host}/api/v1/videos/${encodeURIComponent(uuid)}`, {
                headers: { 'User-Agent': BROWSER_UA },
                signal: AbortSignal.timeout(4500),
              });
              if (!vr.ok) return null;
              const vj = (await vr.json()) as any;
              const files: any[] = [
                ...(Array.isArray(vj?.files) ? vj.files : []),
                ...(Array.isArray(vj?.streamingPlaylists?.[0]?.files)
                  ? vj.streamingPlaylists[0].files
                  : []),
              ]
                .filter((f) => typeof (f?.fileDownloadUrl || f?.fileUrl) === 'string')
                .sort((a, b) => (Number(a.size) || 0) - (Number(b.size) || 0));

              for (const f of files) {
                const fUrl = String(f.fileDownloadUrl || f.fileUrl);
                if (helpers.isVercel && Number(f.size) > 4_350_000) continue;
                const probe = await helpers.probeRemoteStream(fUrl, { 'User-Agent': BROWSER_UA });
                if (probe.ok) {
                  if (helpers.isVercel && probe.totalSize > 4_350_000) continue;
                  return { url: fUrl, protocol: 'direct', durationSec: durSec, hasVideo: true };
                }
              }

              const playlistUrl = vj?.streamingPlaylists?.[0]?.playlistUrl;
              if (typeof playlistUrl === 'string' && playlistUrl.startsWith('http')) {
                return { url: playlistUrl, protocol: 'hls', durationSec: durSec, hasVideo: true };
              }
            } catch {}
            return null;
          },
        });
      }
    }
    return out.sort((a, b) => b.score - a.score);
  } catch {
    return [];
  }
}

async function searchInternetArchive(
  title: string,
  artist: string,
  expectedDurationSec: number,
  helpers: SearchHelpers
): Promise<ExternalSiteCandidate[]> {
  const cleanTitle = helpers.cleanSearchTitle(title, artist) || title;
  if (!cleanTitle) return [];

  const qParts = [`title:(${cleanTitle})`, 'mediatype:(audio)'];
  if (artist.trim()) qParts.push(`(${artist.trim()})`);
  const query = qParts.join(' AND ');

  try {
    const res = await fetch(
      `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
        query
      )}&fl[]=identifier,title,creator,downloads&rows=5&output=json`,
      { headers: { 'User-Agent': BROWSER_UA }, signal: AbortSignal.timeout(4500) }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    const docs: any[] = Array.isArray(data?.response?.docs) ? data.response.docs : [];
    if (docs.length === 0) return [];

    const out: ExternalSiteCandidate[] = [];
    await Promise.allSettled(
      docs.slice(0, 4).map(async (doc) => {
        const id = String(doc?.identifier || '').trim();
        if (!id) return;
        const fr = await fetch(`https://archive.org/metadata/${encodeURIComponent(id)}/files`, {
          headers: { 'User-Agent': BROWSER_UA },
          signal: AbortSignal.timeout(4000),
        });
        if (!fr.ok) return;
        const fj = (await fr.json()) as any;
        const files: any[] = Array.isArray(fj?.result) ? fj.result : [];
        const docTitle = Array.isArray(doc.title) ? String(doc.title[0] || '') : String(doc.title || '');
        const docCreator = Array.isArray(doc.creator)
          ? String(doc.creator[0] || '')
          : String(doc.creator || '');

        for (const f of files) {
          const fname = String(f?.name || '');
          if (!/\.(mp3|m4a|ogg|flac)$/i.test(fname)) continue;
          if (/(sample|preview|snippet|_64kb\.mp3$)/i.test(fname)) continue;
          const durSec = Math.round(Number(f?.length) || 0);
          if (durSec > 0 && durSec < 45) continue;
          const sizeBytes = Number(f?.size) || 0;
          if (helpers.isVercel && sizeBytes > 4_350_000) continue;

          const fileTitle = String(f?.title || fname.replace(/\.[^.]+$/, ''));
          const fileArtist = String(f?.artist || f?.creator || docCreator || '');
          const score = helpers.scoreCandidateTrack({
            candidateTitle: fileTitle,
            candidateAuthor: fileArtist,
            collectionTitle: docTitle,
            durationSec: durSec,
            playCount: Number(doc.downloads) || 0,
            targetTitle: title,
            targetArtist: artist,
            expectedDurationSec,
          });

          if (score >= helpers.minCandidateScore) {
            const dlUrl = `https://archive.org/download/${encodeURIComponent(id)}/${fname
              .split('/')
              .map(encodeURIComponent)
              .join('/')}`;
            out.push({
              siteId: 'archive-full',
              siteName: 'Internet Archive',
              title: fileTitle,
              author: fileArtist,
              durationSec: durSec,
              score,
              hasVideo: false,
              resolveStream: async () => {
                const probe = await helpers.probeRemoteStream(dlUrl, { 'User-Agent': BROWSER_UA });
                if (!probe.ok) return null;
                if (helpers.isVercel && probe.totalSize > 4_350_000) return null;
                return { url: dlUrl, protocol: 'direct', durationSec: durSec };
              },
            });
          }
        }
      })
    );

    return out.sort((a, b) => b.score - a.score);
  } catch {
    return [];
  }
}

export async function searchMultiSiteCandidates(params: {
  title: string;
  artist: string;
  expectedDurationSec: number;
  enabledSiteSet?: Set<string> | null;
  helpers: SearchHelpers;
}): Promise<ExternalSiteCandidate[]> {
  const { title, artist, expectedDurationSec, enabledSiteSet, helpers } = params;
  const allow = (id: FreemakeDownloadSiteId) => !enabledSiteSet || enabledSiteSet.has(id);

  const tasks: Promise<ExternalSiteCandidate[]>[] = [];
  if (allow('jiosaavn-full')) tasks.push(searchJioSaavn(title, artist, expectedDurationSec, helpers));
  if (allow('audius-full')) tasks.push(searchAudius(title, artist, expectedDurationSec, helpers));
  if (allow('dailymotion-full')) tasks.push(searchDailymotion(title, artist, expectedDurationSec, helpers));
  if (allow('hearthis-full')) tasks.push(searchHearthis(title, artist, expectedDurationSec, helpers));
  if (allow('odysee-full')) tasks.push(searchOdysee(title, artist, expectedDurationSec, helpers));
  if (allow('peertube-full')) tasks.push(searchPeerTube(title, artist, expectedDurationSec, helpers));
  if (allow('archive-full')) tasks.push(searchInternetArchive(title, artist, expectedDurationSec, helpers));

  if (tasks.length === 0) return [];
  const settled = await Promise.allSettled(tasks);
  const all: ExternalSiteCandidate[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      all.push(...r.value);
    }
  }
  return all.sort((a, b) => b.score - a.score);
}
