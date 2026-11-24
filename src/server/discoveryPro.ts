import type { Express, Request, Response } from 'express';
import { Innertube, UniversalCache } from 'youtubei.js';
import { kvCache } from './kvCache.js';
import { normalizeArtistName } from '../utils/artistNames.js';

export type SupportedRegionCode = 'JP' | 'US' | 'KR' | 'GB' | 'GLOBAL';

const REGION_CONFIG: Record<SupportedRegionCode, { lang: string; location: string; label: string }> = {
  JP: { lang: 'ja', location: 'JP', label: '日本 (JP)' },
  US: { lang: 'en', location: 'US', label: 'アメリカ (US)' },
  KR: { lang: 'ko', location: 'KR', label: '韓国 (KR)' },
  GB: { lang: 'en', location: 'GB', label: 'イギリス (GB)' },
  GLOBAL: { lang: 'en', location: 'US', label: 'グローバル (制限なし)' },
};

const regionalInnertubeCache = new Map<SupportedRegionCode, Innertube>();
const regionalInitPromises = new Map<SupportedRegionCode, Promise<Innertube>>();

export function normalizeRegionCode(raw?: unknown): SupportedRegionCode {
  const upper = String(raw || 'JP').trim().toUpperCase();
  if (upper === 'US' || upper === 'KR' || upper === 'GB' || upper === 'GLOBAL') {
    return upper;
  }
  return 'JP';
}

export async function getInnertubeForRegion(
  region: SupportedRegionCode,
  defaultGetInnertube: () => Promise<Innertube>
): Promise<Innertube> {
  if (region === 'JP') {
    return defaultGetInnertube();
  }
  const existing = regionalInnertubeCache.get(region);
  if (existing) return existing;

  let pending = regionalInitPromises.get(region);
  if (!pending) {
    const cfg = REGION_CONFIG[region];
    pending = Innertube.create({
      cache: new UniversalCache(false),
      lang: cfg.lang,
      location: cfg.location,
      generate_session_locally: true,
    })
      .then((yt) => {
        regionalInnertubeCache.set(region, yt);
        return yt;
      })
      .catch((err) => {
        regionalInitPromises.delete(region);
        throw err;
      });
    regionalInitPromises.set(region, pending);
  }
  return pending;
}

function getBestThumbnail(thumbnails: any): string {
  if (!thumbnails) return '';
  if (typeof thumbnails === 'string') return thumbnails;
  if (thumbnails?.contents && Array.isArray(thumbnails.contents)) {
    thumbnails = thumbnails.contents;
  }
  if (!Array.isArray(thumbnails)) {
    if (thumbnails?.url) return thumbnails.url;
    return '';
  }
  const flat = thumbnails.flat(Infinity).filter(Boolean);
  if (!flat.length) return '';
  let best = flat[0];
  let maxW = best?.width || 0;
  for (const t of flat) {
    if (typeof t === 'string') return t;
    const w = t?.width || 0;
    if (w > maxW) {
      maxW = w;
      best = t;
    }
  }
  return best?.url || (flat[0] && typeof flat[0] === 'object' ? flat[0]?.url : '') || '';
}

function parseDurationToSeconds(durationText: string): number {
  if (!durationText) return 0;
  const parts = durationText.split(':').map((p) => parseInt(p, 10));
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  return 0;
}

function extractShelfItems(res: any, key: 'songs' | 'videos'): any[] {
  return res?.[key]?.contents || res?.contents?.[0]?.contents || [];
}

function extractArtist(item: any, fallback = 'Artist'): string {
  const direct =
    (item?.artists && item.artists[0]?.name) ||
    (item?.authors && item.authors[0]?.name) ||
    item?.author?.name ||
    '';
  return normalizeArtistName(direct || fallback);
}

// Curated Classical Composers & Works metadata (Apple Music Classical style)
export interface ClassicalComposerPreset {
  id: string;
  name: string;
  nameEn: string;
  era: 'baroque' | 'classical' | 'romantic' | 'modern';
  eraLabel: string;
  years: string;
  signatureQuery: string;
  sampleWorks: Array<{ title: string; opus: string; query: string }>;
}

const CLASSICAL_COMPOSERS: ClassicalComposerPreset[] = [
  {
    id: 'bach',
    name: 'J.S.バッハ',
    nameEn: 'Johann Sebastian Bach',
    era: 'baroque',
    eraLabel: 'バロック',
    years: '1685–1750',
    signatureQuery: 'Bach Goldberg Variations Glenn Gould Cello Suite',
    sampleWorks: [
      { title: '無伴奏チェロ組曲 第1番 ト長調', opus: 'BWV 1007', query: 'Bach Cello Suite No.1 BWV 1007' },
      { title: 'G線上のアリア', opus: 'BWV 1068', query: 'Bach Air on the G String BWV 1068' },
      { title: 'ゴルトベルク変奏曲 アリア', opus: 'BWV 988', query: 'Bach Goldberg Variations Aria BWV 988' },
    ],
  },
  {
    id: 'vivaldi',
    name: 'ヴィヴァルディ',
    nameEn: 'Antonio Vivaldi',
    era: 'baroque',
    eraLabel: 'バロック',
    years: '1678–1741',
    signatureQuery: 'Vivaldi Four Seasons Spring Winter concerto',
    sampleWorks: [
      { title: 'ヴァイオリン協奏曲集「四季」春', opus: 'Op. 8 No. 1', query: 'Vivaldi Four Seasons Spring' },
      { title: 'ヴァイオリン協奏曲集「四季」冬', opus: 'Op. 8 No. 4', query: 'Vivaldi Four Seasons Winter' },
    ],
  },
  {
    id: 'mozart',
    name: 'モーツァルト',
    nameEn: 'Wolfgang Amadeus Mozart',
    era: 'classical',
    eraLabel: '古典派',
    years: '1756–1791',
    signatureQuery: 'Mozart Piano Concerto Symphony 40 Requiem',
    sampleWorks: [
      { title: 'アイネ・クライネ・ナハトムジーク', opus: 'K. 525', query: 'Mozart Eine kleine Nachtmusik K 525' },
      { title: 'ピアノ協奏曲第21番 ハ長調 第2楽章', opus: 'K. 467', query: 'Mozart Piano Concerto 21 K 467 Andante' },
      { title: '交響曲第40番 ト短調', opus: 'K. 550', query: 'Mozart Symphony 40 K 550' },
    ],
  },
  {
    id: 'beethoven',
    name: 'ベートーヴェン',
    nameEn: 'Ludwig van Beethoven',
    era: 'classical',
    eraLabel: '古典派',
    years: '1770–1827',
    signatureQuery: 'Beethoven Moonlight Sonata Symphony 9 Symphony 5',
    sampleWorks: [
      { title: 'ピアノソナタ第14番「月光」第1楽章', opus: 'Op. 27 No. 2', query: 'Beethoven Moonlight Sonata 1st movement' },
      { title: '交響曲第5番「運命」', opus: 'Op. 67', query: 'Beethoven Symphony 5 Berlin Philharmonic' },
      { title: '交響曲第9番「合唱」第4楽章', opus: 'Op. 125', query: 'Beethoven Symphony 9 Ode to Joy' },
    ],
  },
  {
    id: 'chopin',
    name: 'ショパン',
    nameEn: 'Frédéric Chopin',
    era: 'romantic',
    eraLabel: 'ロマン派',
    years: '1810–1849',
    signatureQuery: 'Chopin Nocturne Op 9 No 2 Ballade No 1',
    sampleWorks: [
      { title: 'ノクターン 第2番 変ホ長調', opus: 'Op. 9 No. 2', query: 'Chopin Nocturne Op 9 No 2' },
      { title: 'バラード 第1番 ト短調', opus: 'Op. 23', query: 'Chopin Ballade No 1 Op 23' },
      { title: '英雄ポロネーズ 変イ長調', opus: 'Op. 53', query: 'Chopin Polonaise Op 53' },
    ],
  },
  {
    id: 'tchaikovsky',
    name: 'チャイコフスキー',
    nameEn: 'Pyotr Ilyich Tchaikovsky',
    era: 'romantic',
    eraLabel: 'ロマン派',
    years: '1840–1893',
    signatureQuery: 'Tchaikovsky Swan Lake Piano Concerto 1 Waltz of the Flowers',
    sampleWorks: [
      { title: 'ピアノ協奏曲第1番 変ロ短調', opus: 'Op. 23', query: 'Tchaikovsky Piano Concerto 1' },
      { title: 'バレエ組曲「白鳥の湖」情景', opus: 'Op. 20', query: 'Tchaikovsky Swan Lake Scene' },
      { title: '「くるみ割り人形」花のワルツ', opus: 'Op. 71a', query: 'Tchaikovsky Waltz of the Flowers' },
    ],
  },
  {
    id: 'rachmaninoff',
    name: 'ラフマニノフ',
    nameEn: 'Sergei Rachmaninoff',
    era: 'romantic',
    eraLabel: 'ロマン派',
    years: '1873–1943',
    signatureQuery: 'Rachmaninoff Piano Concerto 2 Vocalise',
    sampleWorks: [
      { title: 'ピアノ協奏曲第2番 ハ短調 第1楽章', opus: 'Op. 18', query: 'Rachmaninoff Piano Concerto 2' },
      { title: 'パガニーニの主題による狂詩曲 第18変奏', opus: 'Op. 43', query: 'Rachmaninoff Rhapsody Paganini 18' },
    ],
  },
  {
    id: 'debussy',
    name: 'ドビュッシー',
    nameEn: 'Claude Debussy',
    era: 'modern',
    eraLabel: '近現代・印象派',
    years: '1862–1918',
    signatureQuery: 'Debussy Clair de Lune Arabesque La Mer',
    sampleWorks: [
      { title: 'ベルガマスク組曲「月の光」', opus: 'L. 75', query: 'Debussy Clair de Lune' },
      { title: '2つのアラベスク 第1番', opus: 'L. 66', query: 'Debussy Arabesque No 1' },
    ],
  },
  {
    id: 'satie',
    name: 'エリック・サティ',
    nameEn: 'Erik Satie',
    era: 'modern',
    eraLabel: '近現代・印象派',
    years: '1866–1925',
    signatureQuery: 'Erik Satie Gymnopédie No 1 Gnossienne',
    sampleWorks: [
      { title: 'ジムノペディ 第1番', opus: 'Gymnopédies No. 1', query: 'Erik Satie Gymnopedie No 1' },
      { title: 'グノシエンヌ 第1番', opus: 'Gnossiennes No. 1', query: 'Erik Satie Gnossienne No 1' },
    ],
  },
  {
    id: 'hisaishi',
    name: '久石譲 / 現代オーケストラ',
    nameEn: 'Joe Hisaishi & Contemporary',
    era: 'modern',
    eraLabel: '近現代・映画音楽',
    years: '1950–',
    signatureQuery: '久石譲 Summer 交響組曲 オーケストラ クラシック',
    sampleWorks: [
      { title: 'Summer (オーケストラ/ピアノ)', opus: 'Modern', query: 'Joe Hisaishi Summer Orchestra' },
      { title: 'Merry Go Round of Life (人生のメリーゴーランド)', opus: 'Symphonic', query: 'Joe Hisaishi Merry Go Round of Life' },
    ],
  },
];

// BPM estimation & mood search presets
type BpmBand = 'all' | 'slow' | 'mid' | 'upbeat' | 'fast';

const MOOD_BPM_QUERIES: Record<string, { label: string; baseQuery: string; defaultBpm: number }> = {
  workout: { label: 'ワークアウト・運動', baseQuery: 'ワークアウト ランニング ハイテンポ', defaultBpm: 138 },
  energy: { label: 'テンションUP・ライブ熱量', baseQuery: 'アップテンポ J-POP ロック 人気', defaultBpm: 132 },
  drive: { label: 'ドライブ・疾走感', baseQuery: 'ドライブ 爽快 邦楽 ヒット', defaultBpm: 124 },
  party: { label: 'パーティー・クラブ', baseQuery: 'EDM J-POP ダンス ビート', defaultBpm: 128 },
  happy: { label: '元気・ポジティブ', baseQuery: '元気 ポップ 明るい 邦楽', defaultBpm: 120 },
  focus: { label: '集中・作業用 Lo-Fi', baseQuery: 'Lo-Fi Beats 作業用 集中 Instrumental', defaultBpm: 88 },
  relax: { label: 'チル・リラックス', baseQuery: 'チル リラックス アコースティック 邦楽', defaultBpm: 82 },
  night: { label: '深夜・ミッドナイト', baseQuery: '深夜 シティポップ チル 夜', defaultBpm: 94 },
  emotional: { label: 'エモい・切ない夜', baseQuery: 'エモい 夜 バラード 邦楽', defaultBpm: 84 },
  sad: { label: '泣ける・スローバラード', baseQuery: 'バラード 泣ける 邦楽 スロー', defaultBpm: 72 },
  nostalgic: { label: '懐かしい・青春名曲', baseQuery: '平成 名曲 J-POP 懐メロ', defaultBpm: 106 },
};

const BPM_BAND_RANGES: Record<Exclude<BpmBand, 'all'>, { min: number; max: number; label: string; queryHint: string }> = {
  slow: { min: 55, max: 89, label: 'Slow (~89 BPM)', queryHint: 'バラード スロー チル Lo-Fi' },
  mid: { min: 90, max: 115, label: 'Mid (90-115 BPM)', queryHint: 'ミドルテンポ シティポップ R&B' },
  upbeat: { min: 116, max: 135, label: 'Upbeat (116-135 BPM)', queryHint: 'アップテンポ ダンス ポップ' },
  fast: { min: 136, max: 200, label: 'Fast (136+ BPM)', queryHint: 'ハイテンポ ロック BPM140 BPM160' },
};

function estimateTrackBpm(
  track: { id: string; title: string; artist: string; durationSeconds?: number },
  moodHint: string,
  bandHint: BpmBand
): number {
  const lower = `${track.title} ${track.artist}`.toLowerCase();

  // Explicit BPM in title if present (e.g. "140 BPM" / "BPM 128")
  const explicitMatch = lower.match(/(?:bpm\s*[:=]?\s*(\d{2,3})|(\d{2,3})\s*bpm)/i);
  if (explicitMatch) {
    const val = Number(explicitMatch[1] || explicitMatch[2]);
    if (val >= 55 && val <= 210) return val;
  }

  let base = MOOD_BPM_QUERIES[moodHint]?.defaultBpm || 110;
  if (/バラード|ballad|slow|piano|acoustic|lullaby|piano solo|nocturne|月の光|gymnop/.test(lower)) {
    base = 76;
  } else if (/lo-fi|lofi|chill|study|relax|ambient|眠|夜/.test(lower)) {
    base = 86;
  } else if (/city pop|シティポップ|groove|r&b|funk/.test(lower)) {
    base = 104;
  } else if (/rock|punk|metal|hardcore|drum|idol|アイドル|nightcore|edm|eurobeat|ランニング/.test(lower)) {
    base = 148;
  } else if (/dance|pop|disco|house|workout|drive|爽快/.test(lower)) {
    base = 124;
  }

  // Deterministic spread per video ID so identical queries keep natural BPM variance
  let hash = 0;
  for (let i = 0; i < track.id.length; i++) {
    hash = (hash * 31 + track.id.charCodeAt(i)) % 1000;
  }
  const jitter = (hash % 19) - 9; // -9..+9

  let bpm = Math.max(58, Math.min(188, base + jitter));
  if (bandHint !== 'all') {
    const range = BPM_BAND_RANGES[bandHint];
    if (bpm < range.min || bpm > range.max) {
      const span = Math.max(4, range.max - range.min);
      bpm = range.min + (Math.abs(hash) % span);
    }
  }
  return bpm;
}

export function registerDiscoveryProRoutes(
  app: Express,
  getInnertube: () => Promise<Innertube>
) {
  // 1. Apple Music Classical-style Explorer
  app.get('/api/music/classical', async (req: Request, res: Response) => {
    const era = String(req.query.era || 'all').toLowerCase();
    const composerId = String(req.query.composer || '').toLowerCase().trim();
    const q = String(req.query.q || '').trim();
    const region = normalizeRegionCode(req.query.gl);

    const filteredComposers =
      era === 'all'
        ? CLASSICAL_COMPOSERS
        : CLASSICAL_COMPOSERS.filter((c) => c.era === era);

    const selectedComposer = composerId
      ? CLASSICAL_COMPOSERS.find((c) => c.id === composerId)
      : undefined;

    const searchQuery = q
      ? `${q} classical`
      : selectedComposer
      ? selectedComposer.signatureQuery
      : era === 'baroque'
      ? 'Bach Vivaldi Baroque classical orchestra'
      : era === 'classical'
      ? 'Mozart Beethoven Classical period symphony sonata'
      : era === 'romantic'
      ? 'Chopin Rachmaninoff Tchaikovsky Romantic classical piano orchestra'
      : era === 'modern'
      ? 'Debussy Satie Joe Hisaishi modern classical piano'
      : 'Classical masterpieces Beethoven Chopin Mozart Bach orchestra piano';

    const cacheKey = `classical_v1:${region}:${era}:${composerId}:${searchQuery.toLowerCase()}`;
    const cached = kvCache.get<any>(cacheKey);
    if (cached) {
      return res.json({ ...cached, fromCache: true });
    }

    try {
      const yt = await getInnertubeForRegion(region, getInnertube);
      const [songRes, videoRes] = await Promise.all([
        yt.music.search(searchQuery, { type: 'song' }).catch(() => null),
        yt.music.search(searchQuery, { type: 'video' }).catch(() => null),
      ]);

      const rawItems = [
        ...extractShelfItems(songRes, 'songs'),
        ...extractShelfItems(videoRes, 'videos'),
      ];

      const seen = new Set<string>();
      const works: any[] = [];

      for (const item of rawItems) {
        const id = item?.id || item?.video_id;
        if (!id || seen.has(id)) continue;
        seen.add(id);

        const title = String(item?.title?.toString?.() || '').trim();
        if (!title) continue;
        const artist = extractArtist(item, selectedComposer?.name || 'Classical Ensemble');

        // Extract Opus / BWV / K. catalog reference if present in title
        const opusMatch = title.match(/\b(Op\.?\s*\d+(?:\s*No\.?\s*\d+)?|BWV\s*\d+|K\.?\s*\d+|RV\s*\d+|S\.?\s*\d+|L\.?\s*\d+)/i);
        const composerMatch =
          selectedComposer ||
          CLASSICAL_COMPOSERS.find((c) => {
            const lowerTitle = `${title} ${artist}`.toLowerCase();
            return (
              lowerTitle.includes(c.id) ||
              lowerTitle.includes(c.name.toLowerCase()) ||
              lowerTitle.includes(c.nameEn.toLowerCase().split(' ').pop() || '')
            );
          });

        works.push({
          id,
          title,
          artist,
          album: item?.album?.name || composerMatch?.eraLabel || 'Classical Masterworks',
          duration: item?.duration?.text || '',
          durationSeconds: parseDurationToSeconds(item?.duration?.text || ''),
          thumbnail: getBestThumbnail(item?.thumbnails || [item?.thumbnail]),
          composerName: composerMatch?.name || undefined,
          era: composerMatch?.eraLabel || (era !== 'all' ? era : 'クラシック'),
          opusNumber: opusMatch ? opusMatch[1] : undefined,
        });

        if (works.length >= 24) break;
      }

      const payload = {
        era,
        composers: filteredComposers,
        activeComposer: selectedComposer || null,
        tracks: works,
        region,
      };
      kvCache.set(cacheKey, payload, 6 * 3600);
      return res.json(payload);
    } catch (err: any) {
      console.error('[Classical] Search failed:', err?.message || err);
      return res.json({
        era,
        composers: filteredComposers,
        activeComposer: selectedComposer || null,
        tracks: [],
        region,
        error: err?.message || 'クラシック楽曲の取得に失敗しました',
      });
    }
  });

  // 2. BPM & Mood Filtering Discovery Endpoint
  app.get('/api/music/mood-bpm', async (req: Request, res: Response) => {
    const mood = String(req.query.mood || 'all').toLowerCase().trim();
    const bpmBand = (String(req.query.bpmRange || 'all').toLowerCase().trim() as BpmBand) || 'all';
    const customQ = String(req.query.q || '').trim();
    const minBpmParam = Number(req.query.minBpm || 0);
    const maxBpmParam = Number(req.query.maxBpm || 0);
    const region = normalizeRegionCode(req.query.gl);

    const moodCfg = MOOD_BPM_QUERIES[mood];
    const bandCfg = bpmBand !== 'all' && BPM_BAND_RANGES[bpmBand] ? BPM_BAND_RANGES[bpmBand] : null;

    const minBpm = minBpmParam > 0 ? minBpmParam : bandCfg ? bandCfg.min : 0;
    const maxBpm = maxBpmParam > 0 ? maxBpmParam : bandCfg ? bandCfg.max : 999;

    const queryParts: string[] = [];
    if (customQ) queryParts.push(customQ);
    if (moodCfg) queryParts.push(moodCfg.baseQuery);
    if (bandCfg) queryParts.push(bandCfg.queryHint);
    if (queryParts.length === 0) queryParts.push('J-POP ヒット チャート 人気曲');
    const combinedQuery = queryParts.join(' ');

    const cacheKey = `mood_bpm_v1:${region}:${mood}:${bpmBand}:${minBpm}:${maxBpm}:${customQ.toLowerCase()}`;
    const cached = kvCache.get<any>(cacheKey);
    if (cached) {
      return res.json({ ...cached, fromCache: true });
    }

    try {
      const yt = await getInnertubeForRegion(region, getInnertube);
      const songRes = await yt.music.search(combinedQuery, { type: 'song' });
      const rawSongs = extractShelfItems(songRes, 'songs');

      const seen = new Set<string>();
      const tracks: any[] = [];
      for (const item of rawSongs) {
        const id = item?.id;
        if (!id || seen.has(id)) continue;
        seen.add(id);

        const title = String(item?.title?.toString?.() || '').trim();
        if (!title) continue;
        const artist = extractArtist(item);
        const durationSeconds = parseDurationToSeconds(item?.duration?.text || '');
        const bpm = estimateTrackBpm({ id, title, artist, durationSeconds }, mood, bpmBand);

        if (bpm < minBpm || bpm > maxBpm) continue;

        tracks.push({
          id,
          title,
          artist,
          artistId: item?.artists?.[0]?.id,
          album: item?.album?.name || '',
          duration: item?.duration?.text || '',
          durationSeconds,
          thumbnail: getBestThumbnail(item?.thumbnails || []),
          bpm,
          moodTag: moodCfg?.label || undefined,
        });
        if (tracks.length >= 24) break;
      }

      const payload = {
        mood,
        moodLabel: moodCfg?.label || 'すべて',
        bpmRange: bpmBand,
        minBpm,
        maxBpm,
        region,
        tracks,
      };
      kvCache.set(cacheKey, payload, 3 * 3600);
      return res.json(payload);
    } catch (err: any) {
      console.error('[MoodBPM] Search failed:', err?.message || err);
      return res.status(500).json({ error: err?.message || 'BPM・ムード検索に失敗しました' });
    }
  });
}
