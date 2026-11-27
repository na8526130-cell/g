export type ToolCategoryId = 'all' | 'media' | 'games' | 'manga';

export type ToolId =
  | 'soundcloak'
  | 'nikoniko'
  | 'choco-abema'
  | 'cloudmoon-web'
  | 'cloudmoon-io'
  | 'garticphone'
  | 'kankin'
  | 'aaaao'
  | 'kinokonun'
  | 'kawaiihakowaseru'
  | 'aaaa'
  | 'mangarw'
  | 'momonga';

export interface ToolPreset {
  label: string;
  path: string;
}

export interface ToolCatalogItem {
  id: ToolId;
  name: string;
  shortName: string;
  category: Exclude<ToolCategoryId, 'all'>;
  subtitle: string;
  mode: 'native' | 'iframe';
  mountPath?: string;
  presets?: ToolPreset[];
  repoSlug: string;
}

export const TOOL_CATEGORIES: Array<{ id: ToolCategoryId; label: string }> = [
  { id: 'all', label: 'すべて' },
  { id: 'media', label: '音楽・動画' },
  { id: 'games', label: 'ゲーム' },
  { id: 'manga', label: 'マンガ' },
];

export const TOOLS_CATALOG: ToolCatalogItem[] = [
  {
    id: 'soundcloak',
    name: 'SoundCloak',
    shortName: 'SoundCloak',
    category: 'media',
    subtitle: 'SoundCloud 検索・発見・内蔵再生フロントエンド',
    mode: 'native',
    repoSlug: 'na8526130-cell/soundcloak',
  },
  {
    id: 'nikoniko',
    name: 'ニコニコ動画',
    shortName: 'ニコニコ',
    category: 'media',
    subtitle: 'ランキング・検索・弾幕コメント付きHLS再生',
    mode: 'native',
    repoSlug: 'h4534470-cell/nikoniko',
  },
  {
    id: 'choco-abema',
    name: 'Choco-Abema',
    shortName: 'Abema',
    category: 'media',
    subtitle: 'ABEMA TV ビューア（サイト内蔵プロキシ）',
    mode: 'iframe',
    mountPath: '/api/tools-app/choco-abema/',
    repoSlug: 'kuru-bana/Choco-Abema',
  },
  {
    id: 'cloudmoon-web',
    name: 'CloudMoon Web',
    shortName: 'CloudMoon Web',
    category: 'games',
    subtitle: 'CloudMoon All-in-One クラウドゲームポータル',
    mode: 'iframe',
    mountPath: '/api/tools-app/cloudmoon-web/',
    presets: [
      { label: 'ホーム', path: '/api/tools-app/cloudmoon-web/' },
      { label: 'Play', path: '/api/tools-app/cloudmoon-web/play' },
      { label: 'Portal', path: '/api/tools-app/cloudmoon-web/portal' },
    ],
    repoSlug: 'myproxy0108-prog/cloudmoon',
  },
  {
    id: 'cloudmoon-io',
    name: 'CloudMoon.io',
    shortName: 'CloudMoon.io',
    category: 'games',
    subtitle: 'CloudMoon SvelteKit クラウドゲームポータル',
    mode: 'iframe',
    mountPath: '/api/tools-app/cloudmoon-io/',
    presets: [
      { label: '日本語版', path: '/api/tools-app/cloudmoon-io/ja' },
      { label: 'English', path: '/api/tools-app/cloudmoon-io/en' },
    ],
    repoSlug: 'na8526130-cell/cloudmoonapp.github.io',
  },
  {
    id: 'garticphone',
    name: 'Gartic Phone',
    shortName: 'Gartic Phone',
    category: 'games',
    subtitle: 'お絵描き伝言ゲーム マルチミラー内蔵',
    mode: 'iframe',
    mountPath: '/api/tools-app/garticphone/',
    presets: [
      { label: 'ミラー 1', path: '/api/tools-app/garticphone/?mirror=0' },
      { label: 'ミラー 2', path: '/api/tools-app/garticphone/?mirror=1' },
      { label: '本家', path: '/api/tools-app/garticphone/?mirror=2' },
    ],
    repoSlug: 'na8526130-cell/Garticphone',
  },
  {
    id: 'kankin',
    name: '監禁',
    shortName: '監禁',
    category: 'games',
    subtitle: 'ホラー脱出 RPG（ブラウザ直接プレイ）',
    mode: 'iframe',
    mountPath: '/api/tools-app/kankin/',
    repoSlug: 'na8526130-cell/kankin',
  },
  {
    id: 'aaaao',
    name: 'メンヘラちゃん家からの脱出',
    shortName: 'メンヘラ脱出',
    category: 'games',
    subtitle: '脱出アドベンチャー RPG（ブラウザ直接プレイ）',
    mode: 'iframe',
    mountPath: '/api/tools-app/aaaao/',
    repoSlug: 'na8526130-cell/Aaaao',
  },
  {
    id: 'kinokonun',
    name: 'きのこぬん',
    shortName: 'きのこぬん',
    category: 'games',
    subtitle: 'RPG Maker ブラウザゲーム',
    mode: 'iframe',
    mountPath: '/api/tools-app/kinokonun/',
    repoSlug: 'na8526130-cell/kinokonun',
  },
  {
    id: 'kawaiihakowaseru',
    name: 'かわいいは壊せる',
    shortName: 'かわいいは壊せる',
    category: 'games',
    subtitle: 'フリーゲーム（ブラウザ直接プレイ）',
    mode: 'iframe',
    mountPath: '/api/tools-app/kawaiihakowaseru/',
    repoSlug: 'renrender0209/kawaiihakowaseru',
  },
  {
    id: 'aaaa',
    name: 'aaaa (RMMZ)',
    shortName: 'aaaa',
    category: 'games',
    subtitle: 'RPG Maker MZ ゲーム枠（renrender0209/aaaa）',
    mode: 'iframe',
    mountPath: '/api/tools-app/aaaa/',
    repoSlug: 'renrender0209/aaaa',
  },
  {
    id: 'mangarw',
    name: 'MangaRW v2',
    shortName: 'MangaRW',
    category: 'manga',
    subtitle: '軽量WebP画像圧縮・広告除去マンガリーダー',
    mode: 'iframe',
    mountPath: '/api/tools-app/mangarw/',
    repoSlug: 'na8526130-cell/mangarw-v2',
  },
  {
    id: 'momonga',
    name: 'Momon-ga',
    shortName: 'Momon-ga',
    category: 'manga',
    subtitle: '高速マンガリーダー（ミラー切替内蔵）',
    mode: 'iframe',
    mountPath: '/api/tools-app/momonga/',
    presets: [
      { label: 'サーバー 1', path: '/api/tools-app/momonga/?mirror=0' },
      { label: 'サーバー 2', path: '/api/tools-app/momonga/?mirror=1' },
    ],
    repoSlug: 'na8526130-cell/Momon-ga',
  },
];
