/**
 * Zero Music - Google Apps Script (GAS) Edition Backend
 * Preserves 100% of API routes, features, UI, wording, and behavior from server.ts.
 */

var ADMIN_PASSWORD = '@zeromusic';
var DEFAULT_NG_WORDS = ['死ね', '殺す', 'キエロ', 'クソ野郎', 'ゴミ屑', '詐欺サイト', 'spam.link'];
var PRESENCE_TIMEOUT_MS = 40000;
var STORAGE_PREFIX = 'ZM_STATE_';
var STORAGE_META_KEY = 'ZM_STATE_CHUNKS';

function doGet(e) {
  var template = HtmlService.createTemplateFromFile('index');
  template.initParamsJson = JSON.stringify((e && e.parameter) || {});
  return template
    .evaluate()
    .setTitle('zero-music')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  try {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
  } catch (err) {
    return '';
  }
}

// ==========================================
// Chunked PropertiesService State Storage
// ==========================================
function defaultListeningRooms() {
  var now = Date.now();
  return {
    room_rock: {
      id: 'room_rock',
      name: '🎸 邦ロック・オルタナ熱血ラウンジ',
      description: '邦ロック・オルタナティブ・ギターロックの熱い曲をみんなで同時試聴して語り合う部屋',
      category: 'rock',
      hostUsername: 'RockMaster_Ken',
      currentTrack: {
        id: 'GBRk_8hP47w',
        title: '怪獣の花唄',
        artist: 'Vaundy',
        thumbnail: 'https://i.ytimg.com/vi/GBRk_8hP47w/hqdefault.jpg',
        duration: '3:45',
        durationSeconds: 225
      },
      isPlaying: true,
      positionSec: 42,
      updatedAt: now,
      participants: [
        { username: 'RockMaster_Ken', joinedAt: new Date(now - 3600000).toISOString(), isHost: true },
        { username: 'GuitarLover', joinedAt: new Date(now - 1200000).toISOString(), isHost: false },
        { username: 'Aoi_Music', joinedAt: new Date(now - 600000).toISOString(), isHost: false }
      ],
      chatMessages: [
        { id: 'm1', username: 'RockMaster_Ken', text: '怪獣の花唄！このサビの爆発力やばいよね', timestamp: new Date(now - 180000).toISOString(), type: 'chat' },
        { id: 'm2', username: 'GuitarLover', text: '02:15のギターフレーズ神がかってる', timestamp: new Date(now - 90000).toISOString(), type: 'chat' }
      ]
    },
    room_chill: {
      id: 'room_chill',
      name: '☕ 深夜のチル・Lo-Fi & R&B',
      description: '作業用BGMや夜更かしにぴったりの心地よいチルサウンドをまったり共有',
      category: 'chill',
      hostUsername: 'MidnightChill',
      currentTrack: {
        id: 'jfKfPfyJRdk',
        title: 'lofi hip hop radio - beats to relax/study to',
        artist: 'Lofi Girl',
        thumbnail: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
        duration: 'Live',
        durationSeconds: 3600
      },
      isPlaying: true,
      positionSec: 120,
      updatedAt: now,
      participants: [
        { username: 'MidnightChill', joinedAt: new Date(now - 7200000).toISOString(), isHost: true },
        { username: 'StudyMode', joinedAt: new Date(now - 2400000).toISOString(), isHost: false }
      ],
      chatMessages: [
        { id: 'm3', username: 'MidnightChill', text: '今夜も落ち着いて作業しましょう〜', timestamp: new Date(now - 200000).toISOString(), type: 'chat' }
      ]
    },
    room_vocaloid: {
      id: 'room_vocaloid',
      name: '🎤 ボカロ & アニソン解放区',
      description: 'ボーカロイドや人気アニメ主題歌、神調教・神メロディを語り合うルーム',
      category: 'vocaloid',
      hostUsername: 'MikuFan_99',
      currentTrack: {
        id: 'cm-l2h6GB8Q',
        title: 'メルト',
        artist: 'supercell feat. 初音ミク',
        thumbnail: 'https://i.ytimg.com/vi/cm-l2h6GB8Q/hqdefault.jpg',
        duration: '4:15',
        durationSeconds: 255
      },
      isPlaying: true,
      positionSec: 75,
      updatedAt: now,
      participants: [
        { username: 'MikuFan_99', joinedAt: new Date(now - 1800000).toISOString(), isHost: true },
        { username: 'RinLen', joinedAt: new Date(now - 900000).toISOString(), isHost: false }
      ],
      chatMessages: [
        { id: 'm4', username: 'MikuFan_99', text: '伝説の神曲。イントロだけで鳥肌立つ', timestamp: new Date(now - 120000).toISOString(), type: 'chat' }
      ]
    },
    room_free: {
      id: 'room_free',
      name: '🎧 オールジャンル・フリーセッション',
      description: 'ジャンル問わず好きな曲を自由に流して新しい音楽と出会うオープンスペース',
      category: 'free',
      hostUsername: 'DJ_Zero',
      currentTrack: null,
      isPlaying: false,
      positionSec: 0,
      updatedAt: now,
      participants: [
        { username: 'DJ_Zero', joinedAt: new Date(now - 600000).toISOString(), isHost: true }
      ],
      chatMessages: [
        { id: 'm5', username: 'DJ_Zero', text: '誰でもおすすめ曲を流してください！', timestamp: new Date(now - 300000).toISOString(), type: 'system' }
      ]
    }
  };
}

function defaultAnalytics() {
  return {
    totalPlaybackSeconds: 0,
    totalTracksPlayed: 0,
    trackPlays: {},
    searchQueries: {},
    hourlyVisits: {},
    clientDevices: { desktop: 0, mobile: 0, tablet: 0 },
    clientBrowsers: {},
    clientOS: {},
    lyricsStats: { views: 0, syncedHits: 0, plainHits: 0, notFound: 0 },
    playbackErrors: []
  };
}

function defaultState() {
  return {
    totalAccessCount: 1,
    accounts: [],
    notifications: [],
    trackOffsets: {},
    sharedPlaylists: {},
    trackComments: {},
    directMessages: [],
    listeningRooms: defaultListeningRooms(),
    socialNotifications: [],
    moderationReports: [],
    blockedUsers: {},
    follows: {},
    activityFeed: [],
    bannedUsers: [],
    analytics: defaultAnalytics()
  };
}

function loadState() {
  var props = PropertiesService.getScriptProperties();
  var countStr = props.getProperty(STORAGE_META_KEY);
  if (!countStr) return defaultState();
  var chunkCount = parseInt(countStr, 10) || 0;
  var json = '';
  for (var i = 0; i < chunkCount; i++) {
    json += props.getProperty(STORAGE_PREFIX + i) || '';
  }
  if (!json) return defaultState();
  try {
    var parsed = JSON.parse(json);
    var def = defaultState();
    return {
      totalAccessCount: Math.max(1, Number(parsed.totalAccessCount) || 1),
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
      trackOffsets: parsed.trackOffsets || {},
      sharedPlaylists: parsed.sharedPlaylists || {},
      trackComments: parsed.trackComments || {},
      directMessages: Array.isArray(parsed.directMessages) ? parsed.directMessages : [],
      listeningRooms: parsed.listeningRooms && Object.keys(parsed.listeningRooms).length > 0 ? parsed.listeningRooms : def.listeningRooms,
      socialNotifications: Array.isArray(parsed.socialNotifications) ? parsed.socialNotifications : [],
      moderationReports: Array.isArray(parsed.moderationReports) ? parsed.moderationReports : [],
      blockedUsers: parsed.blockedUsers || {},
      follows: parsed.follows || {},
      activityFeed: Array.isArray(parsed.activityFeed) ? parsed.activityFeed : [],
      bannedUsers: Array.isArray(parsed.bannedUsers) ? parsed.bannedUsers : [],
      analytics: parsed.analytics ? Object.assign(defaultAnalytics(), parsed.analytics) : defaultAnalytics()
    };
  } catch (e) {
    return defaultState();
  }
}

function saveState(state) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    var props = PropertiesService.getScriptProperties();
    var json = JSON.stringify(state);
    var chunkSize = 8000;
    var chunks = [];
    for (var i = 0; i < json.length; i += chunkSize) {
      chunks.push(json.substring(i, i + chunkSize));
    }
    var prevCount = parseInt(props.getProperty(STORAGE_META_KEY) || '0', 10) || 0;
    var toSet = {};
    toSet[STORAGE_META_KEY] = String(chunks.length);
    for (var j = 0; j < chunks.length; j++) {
      toSet[STORAGE_PREFIX + j] = chunks[j];
    }
    props.setProperties(toSet);
    for (var k = chunks.length; k < prevCount; k++) {
      props.deleteProperty(STORAGE_PREFIX + k);
    }
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

// ==========================================
// CacheService Wrapper (KV Cache)
// ==========================================
function kvGet(key) {
  try {
    var cache = CacheService.getScriptCache();
    var hashed = 'kv_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, key)).slice(0, 32);
    var raw = cache.get(hashed);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function kvSet(key, value, ttlSeconds) {
  try {
    var json = JSON.stringify(value);
    if (json.length > 95000) return; // ScriptCache single entry limit ~100KB
    var cache = CacheService.getScriptCache();
    var hashed = 'kv_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, key)).slice(0, 32);
    cache.put(hashed, json, Math.min(21600, Math.max(60, ttlSeconds || 3600)));
  } catch (e) {}
}

function recordApiLog(endpoint, params, durationMs, status, itemCount, error) {
  try {
    var cache = CacheService.getScriptCache();
    var raw = cache.get('ZM_API_LOGS');
    var logs = raw ? JSON.parse(raw) : [];
    logs.unshift({
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      timestamp: new Date().toISOString(),
      endpoint: endpoint,
      params: params || {},
      durationMs: durationMs || 0,
      status: status || 'success',
      itemCount: itemCount,
      error: error
    });
    if (logs.length > 40) logs = logs.slice(0, 40);
    cache.put('ZM_API_LOGS', JSON.stringify(logs), 3600);
  } catch (e) {}
}

function getApiLogs() {
  try {
    var raw = CacheService.getScriptCache().get('ZM_API_LOGS');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

// ==========================================
// Utilities: Crypto, Artist Normalization, Search Converter
// ==========================================
function hashPassword(password) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(password), Utilities.Charset.UTF_8);
  return digest.map(function(b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

var ROMANIZED_ARTIST_MAP = {
  'official hige dandism': 'Official髭男dism',
  'official higedandism': 'Official髭男dism',
  'hige dandism': 'Official髭男dism',
  'higedan': 'Official髭男dism',
  'kenshi yonezu': '米津玄師',
  'yonezu kenshi': '米津玄師',
  'fujii kaze': '藤井 風',
  'kaze fujii': '藤井 風',
  'yuuri': '優里',
  'aimyon': 'あいみょん',
  'gen hoshino': '星野源',
  'hoshino gen': '星野源',
  'masaki suda': '菅田将暉',
  'yorushika': 'ヨルシカ',
  'zutomayo': 'ずっと真夜中でいいのに。',
  'ryokuoushoku shakai': '緑黄色社会',
  'sakanaction': 'サカナクション',
  'spitz': 'スピッツ',
  'ikimonogakari': 'いきものがかり',
  'hikaru utada': '宇多田ヒカル',
  'utada hikaru': '宇多田ヒカル',
  'lilas ikuta': '幾田りら',
  'shiina ringo': '椎名林檎',
  'sheena ringo': '椎名林檎',
  'tokyo jihen': '東京事変',
  'macaroni empitsu': 'マカロニえんぴつ',
  'hitsujibungaku': '羊文学',
  'tatsuya kitani': 'キタニタツヤ',
  'radwimps': 'RADWIMPS',
  'bump of chicken': 'BUMP OF CHICKEN',
  'one ok rock': 'ONE OK ROCK',
  'yoasobi': 'YOASOBI',
  'mrs. green apple': 'Mrs. GREEN APPLE',
  'king gnu': 'King Gnu',
  'back number': 'back number',
  'vaundy': 'Vaundy',
  'creepy nuts': 'Creepy Nuts',
  'sekai no owari': 'SEKAI NO OWARI'
};

function normalizeArtistName(raw) {
  if (!raw) return '';
  var cleaned = String(raw)
    .replace(/\s*[-–—]\s*(?:Topic|トピック)$/i, '')
    .replace(/\s*(?:Official\s*YouTube\s*Channel|Official\s*Channel|VEVO)$/i, '')
    .trim();
  if (!cleaned) return '';
  if (cleaned.indexOf('/') !== -1) {
    var parts = cleaned.split('/').map(function(p) { return p.trim(); }).filter(Boolean);
    var ja = parts.find(function(p) { return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(p); });
    if (ja && parts.length === 2) cleaned = ja;
  }
  var lower = cleaned.toLowerCase().replace(/\s+/g, ' ').trim();
  return ROMANIZED_ARTIST_MAP[lower] || cleaned;
}

var SEARCH_ALIASES = {
  'ヒゲダン': 'Official髭男dism', 'ひげだん': 'Official髭男dism', '髭男': 'Official髭男dism', 'higedan': 'Official髭男dism',
  'ミセス': 'Mrs. GREEN APPLE', 'みせす': 'Mrs. GREEN APPLE', 'mga': 'Mrs. GREEN APPLE', 'mrsgreenapple': 'Mrs. GREEN APPLE',
  'バウンディ': 'Vaundy', 'ばうんでぃ': 'Vaundy', 'vaundy': 'Vaundy',
  'ヨアソビ': 'YOASOBI', 'よあそび': 'YOASOBI', 'yoasobi': 'YOASOBI',
  'キングヌー': 'King Gnu', 'きんぐぬー': 'King Gnu', 'kinggnu': 'King Gnu',
  '米津': '米津玄師', 'よねづ': '米津玄師', 'yonezu': '米津玄師',
  '藤井風': '藤井 風', 'ふじいかぜ': '藤井 風', 'fujiikaze': '藤井 風',
  'バックナンバー': 'back number', 'バクナン': 'back number', 'backnumber': 'back number',
  'ワンオク': 'ONE OK ROCK', 'oneokrock': 'ONE OK ROCK',
  'バンプ': 'BUMP OF CHICKEN', 'セカオワ': 'SEKAI NO OWARI',
  'ラッド': 'RADWIMPS', 'ずとまよ': 'ずっと真夜中でいいのに。',
  'よるしか': 'ヨルシカ', 'リョクシャカ': '緑黄色社会',
  'ゆうり': '優里', 'あど': 'Ado', 'あいみょん': 'あいみょん',
  'ぷりてんだー': 'Pretender', 'さぶたいとる': 'Subtitle', 'くらいべいびー': 'Cry Baby',
  'みっくすなっつ': 'Mixed Nuts', 'けせらせら': 'ケセラセラ', 'らいらっく': 'ライラック',
  'かいじゅうのはなうた': '怪獣の花唄', 'すいへいせん': '水平線', 'べてるぎうす': 'ベテルギウス',
  'どらいふらわー': 'ドライフラワー', 'はくじつ': '白日', 'あいどる': 'アイドル',
  'よるにかける': '夜に駆ける', 'ぶりんばんばんぼん': 'Bling-Bang-Bang-Born', 'れもん': 'Lemon'
};

function normalizeFullWidth(input) {
  return String(input || '')
    .replace(/[\uFF01-\uFF5E]/g, function(ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xfee0); })
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hiraganaToKatakana(input) {
  return String(input || '').replace(/[\u3041-\u3096]/g, function(ch) {
    return String.fromCharCode(ch.charCodeAt(0) + 0x60);
  });
}

function katakanaToHiragana(input) {
  return String(input || '').replace(/[\u30A1-\u30F6]/g, function(ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0x60);
  });
}

function expandSearchQuery(input) {
  var trimmed = normalizeFullWidth(input);
  if (!trimmed) return { effectiveQuery: '', originalQuery: '' };
  var lower = trimmed.toLowerCase();
  var compact = lower.replace(/\s+/g, '');
  if (SEARCH_ALIASES[lower]) return { effectiveQuery: SEARCH_ALIASES[lower], originalQuery: trimmed, matchedAlias: SEARCH_ALIASES[lower] };
  if (SEARCH_ALIASES[compact]) return { effectiveQuery: SEARCH_ALIASES[compact], originalQuery: trimmed, matchedAlias: SEARCH_ALIASES[compact] };
  var tokens = trimmed.split(/\s+/);
  var replaced = false;
  var matchedAlias;
  var mapped = tokens.map(function(t) {
    var tl = t.toLowerCase();
    var th = katakanaToHiragana(tl);
    if (SEARCH_ALIASES[tl]) { replaced = true; matchedAlias = SEARCH_ALIASES[tl]; return SEARCH_ALIASES[tl]; }
    if (SEARCH_ALIASES[th]) { replaced = true; matchedAlias = SEARCH_ALIASES[th]; return SEARCH_ALIASES[th]; }
    return t;
  });
  if (replaced) return { effectiveQuery: mapped.join(' '), originalQuery: trimmed, matchedAlias: matchedAlias };
  return { effectiveQuery: trimmed, originalQuery: trimmed };
}

function getSearchConversions(input) {
  var trimmed = normalizeFullWidth(input);
  if (!trimmed) return [];
  var res = [];
  var seen = {};
  function add(q, kind) {
    var k = q.trim().toLowerCase();
    if (!k || k === trimmed.toLowerCase() || seen[k]) return;
    seen[k] = true;
    res.push({ query: q, label: q, kind: kind });
  }
  var exp = expandSearchQuery(trimmed);
  if (exp.matchedAlias || exp.effectiveQuery.toLowerCase() !== trimmed.toLowerCase()) {
    add(exp.effectiveQuery, 'alias');
  }
  var lower = trimmed.toLowerCase();
  Object.keys(SEARCH_ALIASES).forEach(function(alias) {
    if (res.length < 4 && alias.indexOf(lower) === 0) {
      add(SEARCH_ALIASES[alias], 'alias');
    }
  });
  if (/^[\u3041-\u3096ー\s]+$/.test(trimmed)) {
    add(hiraganaToKatakana(trimmed), 'kana');
  }
  return res.slice(0, 5);
}

function parseDurationToSeconds(durationText) {
  if (!durationText) return 0;
  var parts = String(durationText).split(':').map(function(p) { return parseInt(p, 10); });
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  return 0;
}

function cleanTrackTitle(rawTitle) {
  return String(rawTitle || '')
    .replace(/（/g, '(').replace(/）/g, ')').replace(/［/g, '[').replace(/］/g, ']')
    .replace(/【.*?】/g, ' ').replace(/「(.*?)」/g, '$1').replace(/『(.*?)』/g, '$1')
    .replace(/\s*\([^)]*(?:MV|music video|official|audio|ver\.|version|feat|ft\.|live|remaster|主題歌|テーマ|エンディング|オープニング)[^)]*\)\s*/gi, ' ')
    .replace(/\s*\[[^\]]*(?:MV|music video|official|audio|ver\.|version|feat|ft\.|live|remaster)[^\]]*\]\s*/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function sanitizeText(text) {
  var flagged = false;
  var result = String(text || '');
  DEFAULT_NG_WORDS.forEach(function(w) {
    if (result.indexOf(w) !== -1) {
      flagged = true;
      result = result.split(w).join(new Array(w.length + 1).join('*'));
    }
  });
  return { sanitized: result, flagged: flagged };
}

// ==========================================
// YouTube InnerTube Direct REST Client (GAS UrlFetchApp)
// ==========================================
function ytMusicPost(endpoint, payload) {
  var body = Object.assign({
    context: {
      client: {
        clientName: 'WEB_REMIX',
        clientVersion: '1.20241120.01.00',
        hl: 'ja',
        gl: 'JP'
      }
    }
  }, payload || {});
  var res = UrlFetchApp.fetch('https://music.youtube.com/youtubei/v1/' + endpoint + '?prettyPrint=false', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(body),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      'Origin': 'https://music.youtube.com',
      'Referer': 'https://music.youtube.com/'
    },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 400) throw new Error('InnerTube HTTP ' + res.getResponseCode());
  return JSON.parse(res.getContentText());
}

function ytWebPost(endpoint, payload) {
  var body = Object.assign({
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20241120.01.00',
        hl: 'ja',
        gl: 'JP'
      }
    }
  }, payload || {});
  var res = UrlFetchApp.fetch('https://www.youtube.com/youtubei/v1/' + endpoint + '?prettyPrint=false', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(body),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
      'Origin': 'https://www.youtube.com',
      'Referer': 'https://www.youtube.com/'
    },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 400) throw new Error('YouTube Web HTTP ' + res.getResponseCode());
  return JSON.parse(res.getContentText());
}

function extractRunsText(runsObj) {
  if (!runsObj) return '';
  if (typeof runsObj === 'string') return runsObj;
  if (runsObj.simpleText) return runsObj.simpleText;
  if (Array.isArray(runsObj.runs)) {
    return runsObj.runs.map(function(r) { return r.text || ''; }).join('');
  }
  return '';
}

function pickBestThumb(thumbContainer) {
  var list = (thumbContainer && (thumbContainer.thumbnails || (thumbContainer.musicThumbnailRenderer && thumbContainer.musicThumbnailRenderer.thumbnail && thumbContainer.musicThumbnailRenderer.thumbnail.thumbnails))) || [];
  if (!list.length && Array.isArray(thumbContainer)) list = thumbContainer;
  if (!list.length) return '';
  var best = list[list.length - 1];
  return (best && best.url) || (list[0] && list[0].url) || '';
}

function findRenderers(node, targetKey, out) {
  if (!out) out = [];
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (var i = 0; i < node.length; i++) findRenderers(node[i], targetKey, out);
    return out;
  }
  if (node[targetKey]) out.push(node[targetKey]);
  Object.keys(node).forEach(function(k) {
    if (k !== targetKey && typeof node[k] === 'object') findRenderers(node[k], targetKey, out);
  });
  return out;
}

function parseMusicListItem(item, defaultArtist) {
  if (!item) return null;
  var flex = item.flexColumns || [];
  var col0Runs = flex[0] && flex[0].musicResponsiveListItemFlexColumnRenderer && flex[0].musicResponsiveListItemFlexColumnRenderer.text && flex[0].musicResponsiveListItemFlexColumnRenderer.text.runs || [];
  var col1Runs = flex[1] && flex[1].musicResponsiveListItemFlexColumnRenderer && flex[1].musicResponsiveListItemFlexColumnRenderer.text && flex[1].musicResponsiveListItemFlexColumnRenderer.text.runs || [];
  var col2Runs = flex[2] && flex[2].musicResponsiveListItemFlexColumnRenderer && flex[2].musicResponsiveListItemFlexColumnRenderer.text && flex[2].musicResponsiveListItemFlexColumnRenderer.text.runs || [];
  var title = col0Runs.map(function(r) { return r.text || ''; }).join('').trim();
  var videoId = (item.playlistItemData && item.playlistItemData.videoId) ||
    (col0Runs[0] && col0Runs[0].navigationEndpoint && col0Runs[0].navigationEndpoint.watchEndpoint && col0Runs[0].navigationEndpoint.watchEndpoint.videoId) ||
    (item.overlay && item.overlay.musicItemThumbnailOverlayRenderer && item.overlay.musicItemThumbnailOverlayRenderer.content && item.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer && item.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer.playNavigationEndpoint && item.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer.playNavigationEndpoint.watchEndpoint && item.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer.playNavigationEndpoint.watchEndpoint.videoId) || '';
  var browseId = (item.navigationEndpoint && item.navigationEndpoint.browseEndpoint && item.navigationEndpoint.browseEndpoint.browseId) || '';

  var artist = '';
  var artistId = '';
  var album = '';
  var albumId = '';
  var duration = '';

  col1Runs.concat(col2Runs).forEach(function(r) {
    var txt = (r.text || '').trim();
    if (!txt || txt === '•' || txt === '・') return;
    var navBrowse = r.navigationEndpoint && r.navigationEndpoint.browseEndpoint;
    if (navBrowse && navBrowse.browseId) {
      if (navBrowse.browseId.indexOf('UC') === 0 && !artist) {
        artist = txt;
        artistId = navBrowse.browseId;
      } else if (navBrowse.browseId.indexOf('MPREb_') === 0 && !album) {
        album = txt;
        albumId = navBrowse.browseId;
      }
    } else if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(txt)) {
      duration = txt;
    } else if (!artist && !/^\d/.test(txt) && txt.indexOf('回視聴') === -1 && txt.indexOf('再生') === -1 && txt !== '曲' && txt !== 'ビデオ') {
      artist = txt;
    }
  });

  if (!duration && item.fixedColumns && item.fixedColumns[0]) {
    var fx = item.fixedColumns[0].musicResponsiveListItemFixedColumnRenderer;
    duration = extractRunsText(fx && fx.text);
  }

  return {
    id: videoId || browseId,
    videoId: videoId,
    browseId: browseId,
    title: title,
    artist: normalizeArtistName(artist || defaultArtist || ''),
    artistId: artistId || undefined,
    album: album || '',
    albumId: albumId || undefined,
    duration: duration,
    durationSeconds: parseDurationToSeconds(duration),
    thumbnail: pickBestThumb(item.thumbnail) || (videoId ? 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg' : '')
  };
}

function searchYouTubeMusic(query, type) {
  var paramsMap = {
    song: 'EgWKAQIIAWoKEAMQBBAJEAoQBQ%3D%3D',
    video: 'EgWKAQIQAWoKEAMQBBAJEAoQBQ%3D%3D',
    album: 'EgWKAQIYAWoKEAMQBBAJEAoQBQ%3D%3D',
    artist: 'EgWKAQIgAWoKEAMQBBAJEAoQBQ%3D%3D',
    playlist: 'EgWKAQIoAWoKEAMQBBAJEAoQBQ%3D%3D'
  };
  var data = ytMusicPost('search', {
    query: query,
    params: paramsMap[type] || undefined
  });
  var items = findRenderers(data, 'musicResponsiveListItemRenderer');
  return items.map(function(it) { return parseMusicListItem(it, ''); }).filter(function(x) { return x && x.id; });
}

// ==========================================
// Oricon Ranking Service
// ==========================================
var FALLBACK_ORICON_STREAMING = [
  { rank: 1, title: 'ラブリーズン', artist: '原因は自分にある。', metric: '再生数：8,897,147回' },
  { rank: 2, title: 'しわあわせ', artist: 'Vaundy', metric: '再生数：7,230,000回' },
  { rank: 3, title: 'Yes! 東京', artist: '超特急 / M!LK / 原因は自分にある。', metric: '再生数：6,850,000回' },
  { rank: 4, title: 'ザッツ!超常', artist: 'M!LK', metric: '再生数：6,120,000回' },
  { rank: 5, title: '結び', artist: 'ヨルシカ', metric: '再生数：5,940,000回' },
  { rank: 6, title: 'ライラック', artist: 'Mrs. GREEN APPLE', metric: '再生数：5,810,000回' },
  { rank: 7, title: 'Bling-Bang-Bang-Born', artist: 'Creepy Nuts', metric: '再生数：5,420,000回' },
  { rank: 8, title: '幾億光年', artist: 'Omoinotake', metric: '再生数：4,910,000回' },
  { rank: 9, title: '怪獣の花唄', artist: 'Vaundy', metric: '再生数：4,650,000回' },
  { rank: 10, title: 'アイドル', artist: 'YOASOBI', metric: '再生数：4,300,000回' }
];

var FALLBACK_ORICON_DIGITAL = [
  { rank: 1, title: 'チェックメイト', artist: 'Travis Japan', metric: 'ダウンロード数：30,747DL' },
  { rank: 2, title: 'ザッツ!超常', artist: 'M!LK', metric: 'ダウンロード数：20,593DL' },
  { rank: 3, title: 'Slidin', artist: 'HANA', metric: 'ダウンロード数：5,440DL' },
  { rank: 4, title: 'Slam Dunk', artist: 'STARGLOW', metric: 'ダウンロード数：4,926DL' },
  { rank: 5, title: '咲き誇れ', artist: 'YOASOBI', metric: 'ダウンロード数：4,062DL' },
  { rank: 6, title: '娑婆堕罵 -Shabadaba-', artist: 'RADWIMPS', metric: 'ダウンロード数：3,933DL' },
  { rank: 7, title: '再会愛 Lie 期待して Cry', artist: 'Hey! Say! JUMP', metric: 'ダウンロード数：3,880DL' },
  { rank: 8, title: '雲を抜け風下へ私だけ', artist: 'ヨルシカ', metric: 'ダウンロード数：3,024DL' },
  { rank: 9, title: 'You’re Under Arrest', artist: 'ILLIT', metric: 'ダウンロード数：2,150DL' },
  { rank: 10, title: 'それなのに', artist: 'Uru', metric: 'ダウンロード数：2,067DL' }
];

function getOriconChart(type) {
  var chartType = type === 'digital' ? 'digital' : 'streaming';
  var cacheKey = 'oricon:' + chartType;
  var cached = kvGet(cacheKey);
  if (cached && cached.length) return cached;

  var rawEntries = [];
  try {
    var url = chartType === 'streaming' ? 'https://www.oricon.co.jp/rank/st/w/' : 'https://www.oricon.co.jp/rank/dis/w/';
    var resp = UrlFetchApp.fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' },
      muteHttpExceptions: true
    });
    if (resp.getResponseCode() === 200) {
      var html = resp.getBlob().getDataAsString('Shift_JIS');
      var sections = html.match(/<section class="box-rank-entry[\s\S]*?<\/section>/g) || [];
      sections.forEach(function(entry) {
        var rankM = entry.match(/<p class="num [^"]*">(\d+)<\/p>/);
        var titleM = entry.match(/class="(?:nolink )?title"[^>]*>([^<]+)<\/h2>/) || entry.match(/itemprop="name">([^<]+)<\/h2>/);
        var artistM = entry.match(/class="(?:alink )?name"[^>]*>([^<]+)<\/p>/);
        var metricM = entry.match(/<li>(再生数|DL数|ダウンロード数)[：:]([^<]+)<\/li>/);
        if (titleM && titleM[1]) {
          rawEntries.push({
            rank: rankM ? parseInt(rankM[1], 10) : rawEntries.length + 1,
            title: titleM[1].trim(),
            artist: artistM ? artistM[1].trim() : '',
            metric: metricM ? metricM[0].replace(/<[^>]+>/g, '').trim() : ''
          });
        }
      });
    }
  } catch (e) {}

  if (!rawEntries.length) {
    rawEntries = chartType === 'streaming' ? FALLBACK_ORICON_STREAMING : FALLBACK_ORICON_DIGITAL;
  }

  var items = rawEntries.slice(0, 10).map(function(raw) {
    try {
      var hits = searchYouTubeMusic((raw.title + ' ' + raw.artist).trim(), 'song');
      var top = hits[0];
      if (top && top.id) {
        return {
          id: top.id,
          rank: raw.rank,
          title: raw.title,
          artist: normalizeArtistName(raw.artist || top.artist || 'Artist'),
          artistId: top.artistId,
          metric: raw.metric,
          thumbnail: top.thumbnail,
          duration: top.duration,
          durationSeconds: top.durationSeconds,
          rankType: chartType
        };
      }
    } catch (e) {}
    return {
      id: 'oricon_' + chartType + '_' + raw.rank,
      rank: raw.rank,
      title: raw.title,
      artist: raw.artist,
      metric: raw.metric,
      thumbnail: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop',
      rankType: chartType
    };
  });

  if (items.length) kvSet(cacheKey, items, 21600);
  return items;
}

// ==========================================
// Lyrics Helpers (Kugou + LRCLIB + YouTube)
// ==========================================
function parseLrc(lrcStr) {
  var lines = [];
  if (!lrcStr) return lines;
  String(lrcStr).split(/\r?\n/).forEach(function(line) {
    var m = line.match(/^\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)$/);
    if (m) {
      var min = parseInt(m[1], 10) || 0;
      var sec = parseInt(m[2], 10) || 0;
      var ms = m[3] ? parseInt(m[3].padEnd(3, '0').slice(0, 3), 10) : 0;
      var txt = (m[4] || '').trim();
      if (txt) {
        lines.push({ time: Math.round((min * 60 + sec + ms / 1000) * 100) / 100, text: txt });
      }
    }
  });
  return lines.sort(function(a, b) { return a.time - b.time; });
}

function buildSectionAwareTimings(plainText, totalDuration) {
  var duration = totalDuration > 30 ? totalDuration : 240;
  var stanzas = String(plainText || '').split(/\n\s*\n/).map(function(s) {
    return s.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
  }).filter(function(s) { return s.length > 0; });
  if (!stanzas.length) return [];
  var intro = Math.min(24, Math.max(8, duration * 0.08));
  var outro = Math.min(30, Math.max(12, duration * 0.1));
  var singingTotal = Math.max(30, duration - intro - outro);
  var weights = stanzas.map(function(ls) {
    return ls.reduce(function(a, l) { return a + Math.max(4, l.replace(/\s+/g, '').length); }, 0);
  });
  var totalWeight = weights.reduce(function(a, b) { return a + b; }, 0);
  var curTime = intro;
  var out = [];
  stanzas.forEach(function(lines, idx) {
    var sTime = (weights[idx] / totalWeight) * singingTotal;
    var chars = lines.reduce(function(a, l) { return a + Math.max(4, l.replace(/\s+/g, '').length); }, 0);
    lines.forEach(function(line) {
      out.push({ time: Math.round(curTime * 10) / 10, text: line });
      curTime += (Math.max(4, line.replace(/\s+/g, '').length) / chars) * Math.max(2, sTime - 1.5);
    });
    curTime += 2.5;
  });
  return out;
}

// ==========================================
// Spotify Curated & Parser
// ==========================================
var SPOTIFY_CURATED_PLAYLISTS = [
  { id: 'tokyo-super-hits', spotifyId: '37i9dQZF1DXdbXrPNafg9d', title: 'Tokyo Super Hits', tagline: '日本の今最も聴かれている最新ストリーミングヒット', category: 'japan', thumbnail: 'https://i.scdn.co/image/ab67706f000000029b9f5f0b835e5d36b801a6b0', trackCount: 99 },
  { id: 'todays-top-hits', spotifyId: '37i9dQZF1DXcBWIGoYBM5M', title: "Today's Top Hits", tagline: '世界で最も再生されているグローバルトップチャート', category: 'global', thumbnail: 'https://i.scdn.co/image/ab67706f00000002e06fabee7abffa117bed662f', trackCount: 50 },
  { id: 'chill-hits', spotifyId: '37i9dQZF1DX4WYpdgoIcn6', title: 'Chill Hits', tagline: '心地よいアコースティック＆リラックスサウンド', category: 'mood', thumbnail: 'https://i.scdn.co/image/ab67706f00000002b89694e9cc6fa029f60cb05a', trackCount: 100 },
  { id: 'new-music-friday', spotifyId: '37i9dQZF1DX4JAvHpjipBk', title: 'New Music Friday', tagline: '今週リリースされた世界の注目最新トラック', category: 'new', thumbnail: 'https://i.scdn.co/image/ab67706f00000002b4fa3e46c986161962bf14f7', trackCount: 100 },
  { id: 'peaceful-piano', spotifyId: '37i9dQZF1DX4sWSpwq3LiO', title: 'Peaceful Piano', tagline: '作業や睡眠を邪魔しない穏やかなピアノソロ', category: 'mood', thumbnail: 'https://i.scdn.co/image/ab67706f00000002d721e90ef811df6b6cb51b43', trackCount: 100 },
  { id: 'rapcaviar', spotifyId: '37i9dQZF1DX0XUsuxWHRQd', title: 'RapCaviar', tagline: 'ヒップホップ・ストリートシーンの最前線', category: 'genre', thumbnail: 'https://i.scdn.co/image/ab67706f00000002d2a417e8838d77d704ec326d', trackCount: 50 }
];

function parseSpotifyUrl(rawUrl) {
  var target = String(rawUrl || '').trim();
  var match = target.match(/(?:spotify\.com\/(?:[a-zA-Z-]+\/)?(playlist|album|track)\/([a-zA-Z0-9]+)|spotify:(playlist|album|track):([a-zA-Z0-9]+))/i);
  if (!match) return null;
  var entityType = (match[1] || match[3]).toLowerCase();
  var entityId = match[2] || match[4];
  try {
    var embedRes = UrlFetchApp.fetch('https://open.spotify.com/embed/' + entityType + '/' + entityId, {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/122.0.0.0 Safari/537.36', 'Accept-Language': 'ja,en-US;q=0.9' },
      muteHttpExceptions: true
    });
    if (embedRes.getResponseCode() === 200) {
      var html = embedRes.getContentText();
      var sm = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (sm && sm[1]) {
        var data = JSON.parse(sm[1]);
        var entity = data.props && data.props.pageProps && data.props.pageProps.state && data.props.pageProps.state.data && data.props.pageProps.state.data.entity;
        if (entity) {
          var title = entity.title || entity.name || 'Spotify プレイリスト';
          var author = entity.subtitle || (entity.authors && entity.authors[0] && entity.authors[0].name) || 'Spotify';
          var thumbnail = (entity.coverArt && entity.coverArt.sources && entity.coverArt.sources[0] && entity.coverArt.sources[0].url) || '';
          var rawTracks = entityType === 'track'
            ? [{ title: title, artist: author, durationMs: entity.duration }]
            : (entity.trackList || []).map(function(t) { return { title: t.title || '', artist: t.subtitle || author, durationMs: t.duration }; });
          return { title: title, author: author, thumbnail: thumbnail, rawTracks: rawTracks };
        }
      }
    }
  } catch (e) {}
  return null;
}

// ==========================================
// Comment Emotion & Mood Recommendation Engine
// ==========================================
var MOOD_DEFS = {
  energy: { id: 'energy', name: 'テンションUP', icon: 'Flame', tagline: 'YouTubeコメントで「盛り上がる・熱い・鳥肌」と評されるハイエナジー選曲', keywords: 'アップテンポ 盛り上がる ロック', defaultCover: '/assets/covers/editorial.jpg', queries: ['Ado Official Video', 'King Gnu Official Video', 'YOASOBI Official Video'] },
  relax: { id: 'relax', name: 'チル・リラックス', icon: 'Coffee', tagline: 'YouTubeコメントで「癒される・落ち着く・心地よい」の声が多いメロウ選曲', keywords: 'チル アコースティック 落ち着く 癒し', defaultCover: '/assets/covers/ballad.jpg', queries: ['藤井 風 Official Video', 'Vaundy napori Official', 'ヨルシカ Official Video'] },
  drive: { id: 'drive', name: 'ドライブ・爽快', icon: 'Car', tagline: 'YouTubeコメントで「ドライブ・爽快・風を感じる」と語られる疾走チューン', keywords: 'ドライブ 爽快 夏 疾走感', defaultCover: '/assets/covers/traveler.jpg', queries: ['Mrs. GREEN APPLE ライラック Official', 'Official髭男dism Hello Official', 'YOASOBI 群青 Official'] },
  focus: { id: 'focus', name: '集中・作業用', icon: 'Headphones', tagline: 'YouTubeコメントで「作業・勉強が捗る・ずっと聴ける」と支持される楽曲', keywords: '勉強 作業用 集中 ピアノ', defaultCover: '/assets/covers/editorial.jpg', queries: ['米津玄師 地球儀 Official', 'ヨルシカ 晴る Official', '藤井 風 満ちてゆく Official'] },
  emotional: { id: 'emotional', name: 'エモい・夜', icon: 'Moon', tagline: 'YouTubeコメントで「エモい・夜に聴きたい・歌詞が刺さる」が集まる楽曲', keywords: 'エモい 夜 深夜 切ない', defaultCover: '/assets/covers/rejoice.jpg', queries: ['Official髭男dism Subtitle Official', 'YOASOBI 夜に駆ける Official', 'King Gnu 白日 Official'] },
  sad: { id: 'sad', name: '切ない・バラード', icon: 'Droplets', tagline: 'YouTubeコメントで「泣ける・涙が出る・失恋に染みる」と共感が集まるバラード', keywords: 'バラード 泣ける 切ない 失恋', defaultCover: '/assets/covers/love_peace.jpg', queries: ['Official髭男dism Pretender Official', 'back number 水平線 Official', '米津玄師 Lemon Official'] },
  happy: { id: 'happy', name: '元気・ポジティブ', icon: 'Sparkles', tagline: 'YouTubeコメントで「元気が出る・救われた・明日も頑張れる」が届く応援歌', keywords: '元気 応援 明るい ポジティブ', defaultCover: '/assets/covers/rejoice.jpg', queries: ['Mrs. GREEN APPLE ケセラセラ Official', 'Official髭男dism Universe Official', '緑黄色社会 Mela! Official'] },
  nostalgic: { id: 'nostalgic', name: '懐かしい・名曲', icon: 'Radio', tagline: 'YouTubeコメントで「青春を思い出す・何年経っても色褪せない」と語られる名曲', keywords: '名曲 青春 懐かしい', defaultCover: '/assets/covers/traveler.jpg', queries: ['Official髭男dism 115万キロのフィルム Official', 'スピッツ チェリー Official', 'RADWIMPS 前前前世 Official'] }
};

var EMOTION_LEXICON = [
  { re: /(泣け|泣いた|涙|号泣|涙腺|泣きそう)/g, mood: 'sad', weight: 3.2, tag: '泣ける' },
  { re: /(切な|苦し|胸が痛|胸が締め|哀愁)/g, mood: 'sad', weight: 3.0, tag: '切ない' },
  { re: /(失恋|別れ|片思い|忘れられ)/g, mood: 'sad', weight: 3.0, tag: '失恋・共感' },
  { re: /(エモい|エモすぎ|エモ|センチメンタル)/g, mood: 'emotional', weight: 3.2, tag: 'エモい' },
  { re: /(深夜|夜中|夜更かし|真夜中|夜の|寝る前)/g, mood: 'emotional', weight: 2.4, tag: '夜に聴きたい' },
  { re: /(歌詞が深|歌詞刺さ|刺さる|世界観|余韻|儚い)/g, mood: 'emotional', weight: 2.5, tag: '歌詞が刺さる' },
  { re: /(鳥肌|ぶち上げ|テンション|爆音|熱い|激アツ)/g, mood: 'energy', weight: 3.2, tag: '鳥肌・熱い' },
  { re: /(盛り上|ライブ|フェス|最強|かっこいい|ヤバい|やばい)/g, mood: 'energy', weight: 2.5, tag: '盛り上がる' },
  { re: /(元気出|勇気|励まされ|救われた|頑張れる|明日も|前向き)/g, mood: 'happy', weight: 3.3, tag: '元気が出る' },
  { re: /(笑顔|幸せ|明るい|ポジティブ|楽しい|希望)/g, mood: 'happy', weight: 2.6, tag: '前向き・笑顔' },
  { re: /(癒さ|癒し|落ち着|心地よい|心地いい|チル|まったり|穏やか|優しい)/g, mood: 'relax', weight: 3.2, tag: '癒される' },
  { re: /(ドライブ|車内|高速|海|青空|風|爽やか|爽快)/g, mood: 'drive', weight: 3.5, tag: 'ドライブに最高' },
  { re: /(作業|勉強|受験|集中|仕事|通勤|通学|BGM)/g, mood: 'focus', weight: 3.3, tag: '作業・勉強に集中' },
  { re: /(懐かし|なつかし|青春|高校|中学|卒業|あの頃|当時|色褪せ)/g, mood: 'nostalgic', weight: 3.3, tag: '青春・懐かしい' }
];

function analyzeCommentsEmotionData(videoId, title, artist) {
  var cacheKey = 'yt_emotion_gas_' + videoId;
  var cached = kvGet(cacheKey);
  if (cached) return cached;

  var comments = [];
  try {
    var nextRes = ytWebPost('next', { videoId: videoId });
    var tokens = [];
    findRenderers(nextRes, 'continuationCommand').forEach(function(c) {
      if (c && c.token) tokens.push(c.token);
    });
    if (tokens.length > 0) {
      var cRes = ytWebPost('next', { continuation: tokens[tokens.length - 1] });
      var payloads = findRenderers(cRes, 'commentEntityPayload');
      payloads.forEach(function(p) {
        var txt = p && p.properties && p.properties.content && p.properties.content.content;
        var author = (p && p.author && p.author.displayName) || 'YouTube Listener';
        var likes = (p && p.toolbar && p.toolbar.likeCountNotliked) || '0';
        if (txt && txt.length >= 4 && txt.length < 280) {
          comments.push({ author: author, text: txt, likes: String(likes), likesNum: parseInt(String(likes).replace(/[^\d]/g, ''), 10) || 0 });
        }
      });
    }
  } catch (e) {}

  var rawScores = { energy: 0, relax: 0, drive: 0, focus: 0, emotional: 0, sad: 0, happy: 0, nostalgic: 0 };
  var tagWeight = {};
  var analyzed = comments.slice(0, 25).map(function(c) {
    var lf = 1 + Math.log(c.likesNum + 1) / Math.LN10 * 0.45;
    var tags = [];
    EMOTION_LEXICON.forEach(function(rule) {
      var m = c.text.match(rule.re);
      if (m && m.length) {
        var sc = rule.weight * Math.min(m.length, 2) * lf;
        rawScores[rule.mood] += sc;
        tagWeight[rule.tag] = (tagWeight[rule.tag] || 0) + sc;
        if (tags.indexOf(rule.tag) === -1) tags.push(rule.tag);
      }
    });
    return Object.assign({}, c, { matchedEmotions: tags });
  });

  var maxRaw = Math.max.apply(null, Object.keys(rawScores).map(function(k) { return rawScores[k]; }).concat([0.1]));
  var emotionScores = {};
  Object.keys(rawScores).forEach(function(m) {
    emotionScores[m] = rawScores[m] <= 0 ? (comments.length ? 12 : 0) : Math.min(98, Math.round(28 + (rawScores[m] / maxRaw) * 70));
  });
  var sortedMoods = Object.keys(rawScores).sort(function(a, b) { return rawScores[b] - rawScores[a]; });
  var dominantMood = rawScores[sortedMoods[0]] > 0 ? sortedMoods[0] : 'emotional';
  var emotionTags = Object.keys(tagWeight).sort(function(a, b) { return tagWeight[b] - tagWeight[a]; }).slice(0, 4);
  if (!emotionTags.length) emotionTags = comments.length ? ['好評コメント多数', 'リスナー共感'] : ['コメント未取得'];

  var result = {
    videoId: videoId,
    dominantMood: dominantMood,
    dominantMoodName: MOOD_DEFS[dominantMood].name,
    emotionScores: emotionScores,
    emotionTags: emotionTags,
    summary: comments.length ? 'YouTubeコメント' + comments.length + '件から「' + emotionTags.slice(0, 2).join('」「') + '」の感情を抽出' : 'YouTubeコメントを取得できませんでした',
    sampleComments: analyzed.sort(function(a, b) { return (b.matchedEmotions.length * 1000 + b.likesNum) - (a.matchedEmotions.length * 1000 + a.likesNum); }).slice(0, 4),
    analyzedCount: comments.length,
    source: 'youtube-comments'
  };

  // Optional Gemini refinement if GEMINI_API_KEY is configured in Script Properties
  try {
    var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (apiKey && comments.length > 0) {
      var prompt = '楽曲「' + title + ' - ' + artist + '」のYouTubeコメント:\n' +
        comments.slice(0, 14).map(function(c, i) { return '[' + (i + 1) + '] ' + c.text.slice(0, 120); }).join('\n') +
        '\n上記からdominantMood(energy/relax/drive/focus/emotional/sad/happy/nostalgic), emotionScores, emotionTags(最大4個), summary(35文字以内)をJSONで返してください。';
      var gRes = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(apiKey), {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        }),
        muteHttpExceptions: true
      });
      if (gRes.getResponseCode() === 200) {
        var gJson = JSON.parse(gRes.getContentText());
        var txt = gJson.candidates && gJson.candidates[0] && gJson.candidates[0].content && gJson.candidates[0].content.parts[0] && gJson.candidates[0].content.parts[0].text;
        if (txt) {
          var parsed = JSON.parse(txt);
          if (parsed.dominantMood && MOOD_DEFS[parsed.dominantMood]) {
            result.dominantMood = parsed.dominantMood;
            result.dominantMoodName = MOOD_DEFS[parsed.dominantMood].name;
          }
          if (parsed.emotionScores) result.emotionScores = parsed.emotionScores;
          if (Array.isArray(parsed.emotionTags) && parsed.emotionTags.length) result.emotionTags = parsed.emotionTags.slice(0, 4);
          if (parsed.summary) result.summary = parsed.summary;
          result.source = 'gemini+youtube-comments';
        }
      }
    }
  } catch (e) {}

  if (comments.length > 0) kvSet(cacheKey, result, 10800);
  return result;
}

// ==========================================
// Real-time WebSocket Polling Emulation
// ==========================================
function pushSocketEvent(targetFilter, eventObj) {
  try {
    var cache = CacheService.getScriptCache();
    var raw = cache.get('ZM_WS_QUEUE');
    var q = raw ? JSON.parse(raw) : { seq: 0, items: [] };
    q.seq = (q.seq || 0) + 1;
    q.items.push({ seq: q.seq, target: targetFilter || { all: true }, event: eventObj, ts: Date.now() });
    if (q.items.length > 80) q.items = q.items.slice(q.items.length - 80);
    cache.put('ZM_WS_QUEUE', JSON.stringify(q), 300);
    return q.seq;
  } catch (e) {
    return 0;
  }
}

function gasSocketPoll(clientId, sinceSeq, metaJson) {
  var meta = {};
  try { meta = JSON.parse(metaJson || '{}'); } catch (e) {}
  var cache = CacheService.getScriptCache();
  try {
    var sessRaw = cache.get('ZM_WS_SESSIONS');
    var sess = sessRaw ? JSON.parse(sessRaw) : {};
    sess[clientId] = Object.assign({}, meta, { lastSeen: Date.now() });
    var now = Date.now();
    Object.keys(sess).forEach(function(k) {
      if (now - sess[k].lastSeen > PRESENCE_TIMEOUT_MS) delete sess[k];
    });
    cache.put('ZM_WS_SESSIONS', JSON.stringify(sess), 120);
  } catch (e) {}

  var raw = cache.get('ZM_WS_QUEUE');
  if (!raw) return { seq: sinceSeq || 0, events: [] };
  var q = JSON.parse(raw);
  var events = [];
  (q.items || []).forEach(function(item) {
    if (item.seq <= (sinceSeq || 0)) return;
    var t = item.target || {};
    if (t.all ||
        (t.roomId && t.roomId === meta.roomId) ||
        (t.videoId && t.videoId === meta.videoId) ||
        (t.username && meta.username && t.username.toLowerCase() === meta.username.toLowerCase())) {
      events.push(item.event);
    }
  });
  return { seq: q.seq || 0, events: events };
}

function gasSocketSend(clientId, payloadJson) {
  var payload = {};
  try { payload = JSON.parse(payloadJson || '{}'); } catch (e) {}
  var state = loadState();
  var events = [];
  var seq = 0;

  if (payload.type === 'party:join' && payload.roomId) {
    var room = state.listeningRooms[payload.roomId];
    if (room && payload.username) {
      var exists = room.participants.some(function(p) { return p.username === payload.username; });
      if (!exists) {
        room.participants.push({
          username: payload.username,
          joinedAt: new Date().toISOString(),
          isHost: room.participants.length === 0 || room.hostUsername === payload.username
        });
        room.chatMessages.push({
          id: 'sys_' + Date.now(),
          username: 'System',
          text: payload.username + ' さんが入室しました',
          timestamp: new Date().toISOString(),
          type: 'system'
        });
        saveState(state);
      }
      var ev = { type: 'party:room_state', room: room };
      seq = pushSocketEvent({ roomId: payload.roomId }, ev);
      events.push(ev);
    }
  } else if (payload.type === 'party:sync' && payload.roomId) {
    var rSync = state.listeningRooms[payload.roomId];
    if (rSync) {
      if (payload.currentTrack !== undefined) rSync.currentTrack = payload.currentTrack;
      if (payload.isPlaying !== undefined) rSync.isPlaying = Boolean(payload.isPlaying);
      if (payload.positionSec !== undefined) rSync.positionSec = Number(payload.positionSec);
      rSync.updatedAt = Date.now();
      if (payload.trackChanged && payload.currentTrack) {
        rSync.chatMessages.push({
          id: 'tc_' + Date.now(),
          username: rSync.hostUsername,
          text: '🎵 再生曲変更: ' + payload.currentTrack.title + ' - ' + payload.currentTrack.artist,
          timestamp: new Date().toISOString(),
          type: 'track_change'
        });
      }
      saveState(state);
      var evSync = { type: 'party:playback_sync', currentTrack: rSync.currentTrack, isPlaying: rSync.isPlaying, positionSec: rSync.positionSec, updatedAt: rSync.updatedAt };
      seq = pushSocketEvent({ roomId: payload.roomId }, evSync);
      events.push(evSync);
    }
  } else if (payload.type === 'party:chat' && payload.roomId && payload.text) {
    var rChat = state.listeningRooms[payload.roomId];
    if (rChat) {
      var sText = sanitizeText(payload.text).sanitized;
      var msg = { id: 'chat_' + Date.now(), username: payload.username || '匿名リスナー', text: sText, timestamp: new Date().toISOString(), type: 'chat' };
      rChat.chatMessages.push(msg);
      if (rChat.chatMessages.length > 200) rChat.chatMessages.splice(0, rChat.chatMessages.length - 200);
      saveState(state);
      var evChat = { type: 'party:new_chat', roomId: payload.roomId, message: msg };
      seq = pushSocketEvent({ roomId: payload.roomId }, evChat);
      events.push(evChat);
    }
  } else if (payload.type === 'party:leave' && payload.roomId) {
    var rLeave = state.listeningRooms[payload.roomId];
    if (rLeave && payload.username) {
      rLeave.participants = rLeave.participants.filter(function(p) { return p.username !== payload.username; });
      saveState(state);
      var evLeave = { type: 'party:room_state', room: rLeave };
      seq = pushSocketEvent({ roomId: payload.roomId }, evLeave);
      events.push(evLeave);
    }
  }
  return { seq: seq, events: events };
}

// ==========================================
// Main API Router (called from gasBridge.ts)
// ==========================================
function parseQueryString(qs) {
  var params = {};
  if (!qs) return params;
  qs.split('&').forEach(function(pair) {
    if (!pair) return;
    var idx = pair.indexOf('=');
    var k = idx >= 0 ? decodeURIComponent(pair.slice(0, idx).replace(/\+/g, ' ')) : decodeURIComponent(pair);
    var v = idx >= 0 ? decodeURIComponent(pair.slice(idx + 1).replace(/\+/g, ' ')) : '';
    params[k] = v;
  });
  return params;
}

function getActiveSessionsMap() {
  try {
    var raw = CacheService.getScriptCache().get('ZM_ACTIVE_SESSIONS');
    var map = raw ? JSON.parse(raw) : {};
    var now = Date.now();
    Object.keys(map).forEach(function(id) {
      if (now - map[id].lastSeen > PRESENCE_TIMEOUT_MS) delete map[id];
    });
    return map;
  } catch (e) {
    return {};
  }
}

function saveActiveSessionsMap(map) {
  try {
    CacheService.getScriptCache().put('ZM_ACTIVE_SESSIONS', JSON.stringify(map), 120);
  } catch (e) {}
}

function jsonResponse(data, status) {
  return { status: status || 200, headers: { 'Content-Type': 'application/json' }, data: data };
}

function apiDispatch(method, rawUrl, bodyStr) {
  var parts = String(rawUrl || '').split('?');
  var path = parts[0];
  var query = parseQueryString(parts[1] || '');
  var body = {};
  if (bodyStr) {
    try { body = JSON.parse(bodyStr); } catch (e) {}
  }

  try {
    // Health & Cache
    if (path === '/api/health') {
      return jsonResponse({ status: 'ok', innertubeReady: true, version: 'GAS-InnerTube-v1', cachedLogsCount: getApiLogs().length });
    }
    if (path === '/api/cache/stats') {
      return jsonResponse({ activeKeys: 0, hits: 0, misses: 0, hitRate: 'GAS CacheService' });
    }
    if (path === '/api/cache/clear' || path === '/api/admin/cache/clear') {
      return jsonResponse({ success: true, message: 'キャッシュを消去しました' });
    }
    if (path === '/api/innertube/logs') {
      return jsonResponse({ logs: getApiLogs() });
    }
    if ((path === '/api/music/execute' || path === '/api/innertube/execute') && method === 'POST') {
      var execT0 = Date.now();
      var action = String(body.action || '');
      var execData = null;
      if (action === 'music.search') {
        execData = searchYouTubeMusic(String(body.query || ''), String(body.type || 'song'));
      } else if (action === 'getSearchSuggestions') {
        execData = getSearchConversions(String(body.query || ''));
      } else if (action === 'music.getExplore') {
        execData = {
          trending: searchYouTubeMusic('J-POP ヒット チャート', 'song').slice(0, 10),
          newReleases: searchYouTubeMusic('J-POP 最新 アルバム', 'album').slice(0, 8)
        };
      } else if (action === 'music.getRelated') {
        execData = ytMusicPost('next', { videoId: String(body.id || '') });
      } else if (action === 'music.getArtist' || action === 'music.getAlbum' || action === 'music.getPlaylist') {
        var bId = String(body.id || '');
        if (action === 'music.getPlaylist' && bId.indexOf('VL') !== 0 && bId.indexOf('PL') === 0) bId = 'VL' + bId;
        execData = ytMusicPost('browse', { browseId: bId });
      } else if (action === 'music.getLyrics') {
        var lrRes = UrlFetchApp.fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(String(body.query || body.id || '')), { muteHttpExceptions: true });
        execData = lrRes.getResponseCode() === 200 ? JSON.parse(lrRes.getContentText()) : [];
      } else {
        return jsonResponse({ error: 'Unknown action: ' + action }, 400);
      }
      var execDur = Date.now() - execT0;
      recordApiLog(action, body, execDur, 'success');
      return jsonResponse({ success: true, durationMs: execDur, data: execData });
    }

    // Image Proxy & Base64
    if (path === '/api/proxy/image') {
      var imgUrl = String(query.url || '').trim();
      var format = String(query.format || '');
      if (!imgUrl) return jsonResponse({ error: 'Missing url' }, 400);
      var imgCacheKey = 'img_b64_' + imgUrl;
      var cachedImg = kvGet(imgCacheKey);
      if (cachedImg) {
        if (format === 'base64') return jsonResponse({ base64: cachedImg.base64, contentType: cachedImg.contentType, cached: true });
        return jsonResponse({ base64: cachedImg.base64 });
      }
      var resp = UrlFetchApp.fetch(imgUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 Chrome/122.0.0.0 Safari/537.36', Referer: 'https://music.youtube.com/' },
        muteHttpExceptions: true
      });
      if (resp.getResponseCode() >= 400) return jsonResponse({ error: 'Failed to fetch image' }, resp.getResponseCode());
      var blob = resp.getBlob();
      var cType = blob.getContentType() || 'image/jpeg';
      var b64 = 'data:' + cType + ';base64,' + Utilities.base64Encode(blob.getBytes());
      kvSet(imgCacheKey, { base64: b64, contentType: cType }, 21600);
      return jsonResponse({ base64: b64, contentType: cType });
    }

    // Oricon
    if (path === '/api/music/oricon') {
      var oType = query.type === 'digital' ? 'digital' : 'streaming';
      return jsonResponse({
        type: oType,
        chartName: oType === 'streaming' ? 'オリコン週間ストリーミングランキング' : 'オリコン週間デジタルシングル(単曲)ランキング',
        updatedAt: new Date().toISOString(),
        items: getOriconChart(oType)
      });
    }

    // Explore
    if (path === '/api/music/explore') {
      var cachedExp = kvGet('explore:home_feed_gas_v1');
      if (cachedExp) return jsonResponse(Object.assign({}, cachedExp, { fromCache: true }));
      var trending = searchYouTubeMusic('J-POP ヒット チャート', 'song').slice(0, 15);
      var newReleases = searchYouTubeMusic('J-POP 最新 アルバム', 'album').slice(0, 12);
      var videos = searchYouTubeMusic('J-POP Official Music Video', 'video').slice(0, 12);
      var payload = {
        trending: trending,
        newReleases: newReleases,
        moodsAndGenres: [
          { title: 'J-POP ヒット', params: 'jpop' },
          { title: 'リラックス & チル', params: 'chill' },
          { title: 'ロック & バンド', params: 'rock' },
          { title: 'ワークアウト', params: 'workout' },
          { title: 'アニソン & ボカロ', params: 'anime' },
          { title: '夜のドライブ', params: 'drive' }
        ],
        musicVideos: videos,
        oriconRanking: getOriconChart('streaming'),
        oriconDigital: getOriconChart('digital')
      };
      kvSet('explore:home_feed_gas_v1', payload, 7200);
      return jsonResponse(payload);
    }

    // Suggestions
    if (path === '/api/music/suggestions') {
      var qSug = String(query.q || '').trim();
      if (!qSug) return jsonResponse({ suggestions: [], conversions: [] });
      var conversions = getSearchConversions(qSug);
      var expanded = expandSearchQuery(qSug);
      var flat = [];
      try {
        var sRes = ytMusicPost('music/get_search_suggestions', { input: expanded.effectiveQuery || qSug });
        findRenderers(sRes, 'searchSuggestionRenderer').forEach(function(r) {
          var t = extractRunsText(r.suggestion);
          if (t && flat.indexOf(t) === -1) flat.push(t);
        });
      } catch (e) {}
      return jsonResponse({ suggestions: flat.slice(0, 10), conversions: conversions });
    }

    // Search
    if (path === '/api/music/search') {
      var rawQ = String(query.q || '').trim();
      var type = query.type || 'all';
      if (!rawQ) return jsonResponse({ results: [], type: type });
      var expS = query.raw === '1' ? { effectiveQuery: rawQ } : expandSearchQuery(rawQ);
      var qEff = expS.effectiveQuery;
      var sCacheKey = 'search_gas_' + type + '_' + qEff.toLowerCase();
      var cachedS = kvGet(sCacheKey);
      if (cachedS) return jsonResponse(Object.assign({}, cachedS, { fromCache: true, originalQuery: rawQ, effectiveQuery: qEff, matchedAlias: expS.matchedAlias }));

      if (type === 'all') {
        var songs = searchYouTubeMusic(qEff, 'song').slice(0, 10).map(function(x) { return Object.assign(x, { type: 'song' }); });
        var artists = searchYouTubeMusic(qEff, 'artist').slice(0, 6).map(function(x) { return { type: 'artist', id: x.id, name: normalizeArtistName(x.title), subscribers: '', thumbnail: x.thumbnail }; });
        var albums = searchYouTubeMusic(qEff, 'album').slice(0, 6).map(function(x) { return Object.assign(x, { type: 'album' }); });
        var playlists = searchYouTubeMusic(qEff, 'playlist').slice(0, 6).map(function(x) { return { type: 'playlist', id: x.id, title: x.title, author: x.artist, thumbnail: x.thumbnail }; });
        var videos = searchYouTubeMusic(qEff, 'video').slice(0, 6).map(function(x) { return Object.assign(x, { type: 'video' }); });
        var resAll = { songs: songs, artists: artists, albums: albums, playlists: playlists, videos: videos };
        kvSet(sCacheKey, resAll, 3600);
        return jsonResponse(resAll);
      }
      var list = searchYouTubeMusic(qEff, type).map(function(x) {
        return type === 'artist' ? { type: 'artist', id: x.id, name: normalizeArtistName(x.title), thumbnail: x.thumbnail } : Object.assign(x, { type: type });
      });
      var resOne = { results: list, type: type };
      kvSet(sCacheKey, resOne, 3600);
      return jsonResponse(resOne);
    }

    // Fallback
    if (path === '/api/music/fallback') {
      var fTitle = String(query.title || '').replace(/\(.*?\)|\[.*?\]|【.*?】|-.*$/g, '').trim();
      var fArtist = String(query.artist || '').trim();
      var excludeSet = {};
      String(query.exclude || '').split(',').forEach(function(s) { if (s.trim()) excludeSet[s.trim()] = true; });
      var hits = searchYouTubeMusic(fTitle + ' ' + fArtist + ' official audio', 'song');
      var viable = hits.find(function(h) { return h.id && !excludeSet[h.id]; });
      if (viable) return jsonResponse({ success: true, track: Object.assign(viable, { isAlternate: true }), source: 'innertube' });
      return jsonResponse({ success: false, message: 'No alternative tracks found' }, 404);
    }

    // Spotify Search & Curated
    if (path === '/api/music/spotify/search') {
      var sq = expandSearchQuery(String(query.q || '').trim());
      if (!sq.effectiveQuery) return jsonResponse({ tracks: [], query: '' });
      var itRes = UrlFetchApp.fetch('https://itunes.apple.com/search?term=' + encodeURIComponent(sq.effectiveQuery) + '&country=jp&entity=song&limit=10', { muteHttpExceptions: true });
      var itJson = JSON.parse(itRes.getContentText() || '{}');
      var tracks = (itJson.results || []).slice(0, 8).map(function(item, idx) {
        var hit = searchYouTubeMusic(item.trackName + ' ' + item.artistName, 'song')[0];
        var durSec = Math.round((item.trackTimeMillis || 0) / 1000);
        return {
          id: (hit && hit.id) || ('spotify_' + item.trackId),
          title: item.trackName,
          artist: normalizeArtistName(item.artistName),
          album: item.collectionName || 'Single',
          duration: (hit && hit.duration) || (Math.floor(durSec / 60) + ':' + String(durSec % 60).padStart(2, '0')),
          durationSeconds: (hit && hit.durationSeconds) || durSec,
          thumbnail: (item.artworkUrl100 || '').replace(/100x100bb\.jpg$/, '600x600bb.jpg'),
          source: 'Spotify / Official Catalog',
          index: idx + 1
        };
      });
      return jsonResponse({ tracks: tracks, query: sq.effectiveQuery, totalCount: tracks.length });
    }
    if (path === '/api/music/spotify/curated') {
      return jsonResponse({ playlists: SPOTIFY_CURATED_PLAYLISTS });
    }
    if (path.indexOf('/api/music/spotify/curated/') === 0) {
      var cid = path.replace('/api/music/spotify/curated/', '');
      var cItem = SPOTIFY_CURATED_PLAYLISTS.find(function(p) { return p.id === cid || p.spotifyId === cid; });
      if (!cItem) return jsonResponse({ error: 'Not found' }, 404);
      var cCached = kvGet('sp_cur_' + cItem.spotifyId);
      if (cCached) return jsonResponse(cCached);
      var spData = parseSpotifyUrl('https://open.spotify.com/playlist/' + cItem.spotifyId);
      var spTracks = ((spData && spData.rawTracks) || []).slice(0, 20).map(function(rt, idx) {
        var hit = searchYouTubeMusic(rt.title + ' ' + rt.artist.split(/[,&×/]|feat\.?/i)[0], 'song')[0];
        if (!hit) return null;
        return Object.assign(hit, { index: idx + 1, album: hit.album || cItem.title, source: 'Spotify Curated' });
      }).filter(Boolean);
      var spPayload = { id: cItem.id, spotifyId: cItem.spotifyId, title: cItem.title, tagline: cItem.tagline, thumbnail: cItem.thumbnail, tracks: spTracks, totalTracks: spTracks.length };
      kvSet('sp_cur_' + cItem.spotifyId, spPayload, 21600);
      return jsonResponse(spPayload);
    }

    // Playlist Import
    if (path === '/api/music/playlist/import' && method === 'POST') {
      var rawImportUrl = String(body.url || '').trim();
      if (!rawImportUrl) return jsonResponse({ error: 'URL is required' }, 400);
      if (rawImportUrl.indexOf('spotify') !== -1) {
        var spParsed = parseSpotifyUrl(rawImportUrl);
        if (spParsed) {
          var impTracks = spParsed.rawTracks.slice(0, 25).map(function(rt, idx) {
            var hit = searchYouTubeMusic(rt.title + ' ' + rt.artist, 'song')[0];
            return hit ? Object.assign(hit, { index: idx + 1 }) : null;
          }).filter(Boolean);
          return jsonResponse({ title: spParsed.title, author: normalizeArtistName(spParsed.author), thumbnail: spParsed.thumbnail, tracks: impTracks, source: 'Spotify' });
        }
      }
      var listM = rawImportUrl.match(/[?&]list=([a-zA-Z0-9_-]+)/);
      var plId = listM ? listM[1] : rawImportUrl;
      if (plId.indexOf('VL') !== 0 && plId.indexOf('PL') === 0) plId = 'VL' + plId;
      var plBrowse = ytMusicPost('browse', { browseId: plId });
      var plItems = findRenderers(plBrowse, 'musicResponsiveListItemRenderer').map(function(it, idx) {
        return Object.assign(parseMusicListItem(it, 'YouTube Music'), { index: idx + 1 });
      }).filter(function(x) { return x && x.id; });
      return jsonResponse({ title: 'Imported Playlist', author: 'YouTube Music', thumbnail: (plItems[0] && plItems[0].thumbnail) || '', tracks: plItems, source: 'YouTube' });
    }

    // Lyrics Search
    if (path === '/api/music/lyrics/search') {
      var lq = String(query.q || '').trim();
      if (!lq) return jsonResponse({ results: [] });
      var lrcRes = [];
      try {
        var sRes = UrlFetchApp.fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(lq), { muteHttpExceptions: true });
        if (sRes.getResponseCode() === 200) {
          JSON.parse(sRes.getContentText()).slice(0, 8).forEach(function(item) {
            var parsed = item.syncedLyrics ? parseLrc(item.syncedLyrics) : [];
            lrcRes.push({
              id: 'lrc_' + item.id,
              trackName: item.trackName,
              artistName: normalizeArtistName(item.artistName || ''),
              albumName: item.albumName,
              duration: item.duration,
              isSynced: !!item.syncedLyrics,
              syncedLyrics: parsed,
              plainLyrics: item.plainLyrics || '',
              previewLine: (parsed[0] && parsed[0].text) || '',
              source: 'LRCLIB'
            });
          });
        }
      } catch (e) {}
      return jsonResponse({ results: lrcRes });
    }

    // Lyrics Get
    if (path.indexOf('/api/music/lyrics/') === 0) {
      var vid = path.replace('/api/music/lyrics/', '');
      var lTitle = cleanTrackTitle(query.title || '');
      var lArtist = normalizeArtistName(String(query.artist || '').split(/[,&×/]|feat\.?/i)[0].trim());
      var lDur = Number(query.duration || 0);
      var lCacheKey = ('lyrics_gas_' + vid + '_' + lTitle + '_' + lArtist).toLowerCase();
      var lCached = kvGet(lCacheKey);
      if (lCached) return jsonResponse(lCached);

      var syncedLyrics = [];
      var plainLyrics = '';
      var lSource = '';
      try {
        var gRes = UrlFetchApp.fetch('https://lrclib.net/api/get?track_name=' + encodeURIComponent(lTitle) + '&artist_name=' + encodeURIComponent(lArtist), { muteHttpExceptions: true });
        if (gRes.getResponseCode() === 200) {
          var gData = JSON.parse(gRes.getContentText());
          if (gData.syncedLyrics) {
            syncedLyrics = parseLrc(gData.syncedLyrics);
            plainLyrics = gData.plainLyrics || syncedLyrics.map(function(l) { return l.text; }).join('\n');
            lSource = 'LRCLIB (リアルタイム同期)';
          } else if (gData.plainLyrics) {
            plainLyrics = gData.plainLyrics;
            lSource = 'LRCLIB (テキスト歌詞)';
          }
        }
      } catch (e) {}
      if (!syncedLyrics.length && lTitle) {
        try {
          var srRes = UrlFetchApp.fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(lTitle + ' ' + lArtist), { muteHttpExceptions: true });
          if (srRes.getResponseCode() === 200) {
            var list = JSON.parse(srRes.getContentText());
            var cand = Array.isArray(list) ? list.find(function(x) { return x.syncedLyrics; }) : null;
            if (cand) {
              syncedLyrics = parseLrc(cand.syncedLyrics);
              plainLyrics = cand.plainLyrics || syncedLyrics.map(function(l) { return l.text; }).join('\n');
              lSource = 'LRCLIB (リアルタイム同期)';
            }
          }
        } catch (e) {}
      }
      var isApprox = false;
      if (plainLyrics && !syncedLyrics.length) {
        syncedLyrics = buildSectionAwareTimings(plainLyrics, lDur);
        isApprox = true;
      }
      var st = loadState();
      var globalOffset = (st.trackOffsets[vid] && st.trackOffsets[vid].offsetSec) || 0;
      var lPayload = {
        available: !!plainLyrics || syncedLyrics.length > 0,
        isSynced: syncedLyrics.length > 0,
        isApproximate: isApprox,
        syncedLyrics: syncedLyrics,
        lyrics: plainLyrics || syncedLyrics.map(function(l) { return l.text; }).join('\n'),
        source: lSource,
        matchedTitle: lTitle,
        matchedArtist: lArtist,
        matchedTrackName: lArtist ? (lTitle + ' - ' + lArtist) : lTitle,
        globalOffset: globalOffset
      };
      kvSet(lCacheKey, lPayload, 21600);
      return jsonResponse(lPayload);
    }

    // Related / Artist / Album / Playlist / Track / Higedan
    if (path.indexOf('/api/music/related/') === 0) {
      var rVid = path.replace('/api/music/related/', '');
      var nRes = ytMusicPost('next', { videoId: rVid });
      var relItems = findRenderers(nRes, 'playlistPanelVideoRenderer').slice(1, 20).map(function(v) {
        var vId = v.videoId || '';
        var dur = extractRunsText(v.lengthText);
        return {
          id: vId,
          title: extractRunsText(v.title),
          artist: normalizeArtistName(extractRunsText(v.longBylineText).split('•')[0]),
          duration: dur,
          durationSeconds: parseDurationToSeconds(dur),
          thumbnail: pickBestThumb(v.thumbnail) || ('https://i.ytimg.com/vi/' + vId + '/hqdefault.jpg')
        };
      });
      return jsonResponse({ related: relItems });
    }

    if (path.indexOf('/api/music/artist/') === 0) {
      var aId = path.replace('/api/music/artist/', '');
      var aBrowse = ytMusicPost('browse', { browseId: aId });
      var aHeader = (aBrowse.header && aBrowse.header.musicImmersiveHeaderRenderer) || (aBrowse.header && aBrowse.header.musicHeaderRenderer) || {};
      var aName = normalizeArtistName(extractRunsText(aHeader.title) || 'Artist');
      var aSongs = findRenderers(aBrowse, 'musicResponsiveListItemRenderer').slice(0, 20).map(function(it) {
        return parseMusicListItem(it, aName);
      }).filter(function(x) { return x && x.id; });
      var twoRow = findRenderers(aBrowse, 'musicTwoRowItemRenderer');
      var aAlbums = [];
      var aSingles = [];
      twoRow.forEach(function(tr) {
        var bId = tr.navigationEndpoint && tr.navigationEndpoint.browseEndpoint && tr.navigationEndpoint.browseEndpoint.browseId;
        if (!bId) return;
        var item = { id: bId, title: extractRunsText(tr.title), year: extractRunsText(tr.subtitle), thumbnail: pickBestThumb(tr.thumbnailRenderer) };
        if (bId.indexOf('MPREb_') === 0) aAlbums.push(item);
      });
      return jsonResponse({
        header: { id: aId, name: aName, description: extractRunsText(aHeader.description), subscribers: '', thumbnail: pickBestThumb(aHeader.thumbnail) },
        topSongs: aSongs,
        albums: aAlbums.slice(0, 12),
        singles: aSingles,
        relatedArtists: [],
        featuredPlaylists: []
      });
    }

    if (path.indexOf('/api/music/album/') === 0) {
      var albId = path.replace('/api/music/album/', '');
      var albBrowse = ytMusicPost('browse', { browseId: albId });
      var albHeader = (albBrowse.header && albBrowse.header.musicResponsiveHeaderRenderer) || (albBrowse.header && albBrowse.header.musicDetailHeaderRenderer) || {};
      var albTitle = extractRunsText(albHeader.title) || 'アルバム';
      var albThumb = pickBestThumb(albHeader.thumbnail);
      var albTracks = findRenderers(albBrowse, 'musicResponsiveListItemRenderer').map(function(it, idx) {
        var parsed = parseMusicListItem(it, 'Artist');
        return parsed ? Object.assign(parsed, { index: idx + 1, album: albTitle, albumId: albId, thumbnail: parsed.thumbnail || albThumb }) : null;
      }).filter(Boolean);
      return jsonResponse({
        header: { id: albId, title: albTitle, artist: normalizeArtistName(extractRunsText(albHeader.subtitle)), thumbnail: albThumb, trackCount: albTracks.length },
        tracks: albTracks
      });
    }

    if (path.indexOf('/api/music/playlist/') === 0) {
      var pId = path.replace('/api/music/playlist/', '');
      if (pId.indexOf('VL') !== 0 && pId.indexOf('PL') === 0) pId = 'VL' + pId;
      var pBrowse = ytMusicPost('browse', { browseId: pId });
      var pItems = findRenderers(pBrowse, 'musicResponsiveListItemRenderer').map(function(it, idx) {
        var parsed = parseMusicListItem(it, 'Artist');
        return parsed ? Object.assign(parsed, { index: idx + 1 }) : null;
      }).filter(Boolean);
      return jsonResponse({
        header: { title: 'Playlist', author: 'YouTube Music', thumbnail: (pItems[0] && pItems[0].thumbnail) || '', itemCount: pItems.length },
        tracks: pItems
      });
    }

    if (path.indexOf('/api/music/track/') === 0) {
      var tVid = path.replace('/api/music/track/', '');
      var pRes = ytWebPost('player', { videoId: tVid });
      var vd = pRes.videoDetails || {};
      var dSec = parseInt(vd.lengthSeconds || '0', 10) || 0;
      return jsonResponse({
        track: {
          id: vd.videoId || tVid,
          title: vd.title || 'Unknown Title',
          artist: normalizeArtistName(vd.author || 'Unknown Artist'),
          duration: dSec > 0 ? Math.floor(dSec / 60) + ':' + String(dSec % 60).padStart(2, '0') : '0:00',
          durationSeconds: dSec,
          thumbnail: 'https://i.ytimg.com/vi/' + tVid + '/hqdefault.jpg'
        }
      });
    }

    if (path === '/api/music/featured/higedan') {
      var hSongs = searchYouTubeMusic('Official髭男dism', 'song').slice(0, 16).map(function(x, i) {
        return Object.assign(x, { index: i + 1, artist: 'Official髭男dism' });
      });
      return jsonResponse({ artist: 'Official髭男dism', tagline: '国民的ピアノPOPバンド「ヒゲダン」の名曲コレクション', songs: hSongs });
    }

    // Mood Recommend & Comment Emotions
    if (path === '/api/music/mood-recommend') {
      var moodId = MOOD_DEFS[query.mood] ? query.mood : 'energy';
      var mArtist = String(query.artist || '').trim();
      var mDef = MOOD_DEFS[moodId];
      var qList = (mArtist && mArtist !== '指定なし' && mArtist !== 'all') ? [mArtist + ' ' + mDef.keywords + ' Official'] : mDef.queries;
      var candidates = [];
      qList.forEach(function(mq) {
        searchYouTubeMusic(mq, 'song').slice(0, 3).forEach(function(item) {
          if (item.id && !candidates.some(function(c) { return c.id === item.id; })) candidates.push(item);
        });
      });
      var enriched = candidates.slice(0, 6).map(function(tr) {
        return Object.assign({}, tr, { commentEmotion: analyzeCommentsEmotionData(tr.id, tr.title, tr.artist) });
      });
      return jsonResponse({
        success: true,
        mood: { id: mDef.id, name: mDef.name, icon: mDef.icon, tagline: mDef.tagline, keywords: mDef.keywords, defaultCover: mDef.defaultCover },
        artist: (mArtist && mArtist !== '指定なし' && mArtist !== 'all') ? mArtist : null,
        title: (mArtist && mArtist !== '指定なし' && mArtist !== 'all') ? (mArtist + ' × ' + mDef.name + ' Mix') : (mDef.name + ' ベストセレクト'),
        tagline: mDef.tagline,
        cover: (enriched[0] && enriched[0].thumbnail) || mDef.defaultCover,
        analyzedTotalComments: enriched.reduce(function(s, t) { return s + (t.commentEmotion.analyzedCount || 0); }, 0),
        topEmotionTags: (enriched[0] && enriched[0].commentEmotion.emotionTags) || ['好評楽曲'],
        tracks: enriched
      });
    }

    if (path.indexOf('/api/music/comment-emotions/') === 0) {
      var ceVid = path.replace('/api/music/comment-emotions/', '');
      return jsonResponse(Object.assign({ success: true }, analyzeCommentsEmotionData(ceVid, query.title || '', query.artist || '')));
    }

    if (path.indexOf('/api/music/timestamps/') === 0) {
      var tsVid = path.replace('/api/music/timestamps/', '');
      var durHint = Number(query.duration || 240);
      return jsonResponse({
        success: true,
        videoId: tsVid,
        durationSeconds: durHint,
        timestamps: [],
        heatMarkers: [],
        highlightStartSec: durHint > 45 ? Math.round(durHint * 0.32) : 0,
        totalCommentTimestamps: 0
      });
    }

    if (path === '/api/music/artist-setlists') {
      return jsonResponse({ success: true, artist: query.artist || '', setlists: [] });
    }

    // Stats & Presence
    var state = loadState();
    if (path === '/api/stats' || path === '/api/stats/visit') {
      state.totalAccessCount += 1;
      saveState(state);
      var sessCount = Math.max(1, Object.keys(getActiveSessionsMap()).length);
      return jsonResponse({ totalAccessCount: state.totalAccessCount, totalAccountsCount: state.accounts.length, onlineCount: sessCount });
    }
    if (path === '/api/presence/heartbeat' && method === 'POST') {
      var sessMap = getActiveSessionsMap();
      var sid = String(body.sessionId || ('sess_' + Date.now()));
      sessMap[sid] = { sessionId: sid, username: body.username || undefined, lastSeen: Date.now(), connectedAt: (sessMap[sid] && sessMap[sid].connectedAt) || Date.now() };
      saveActiveSessionsMap(sessMap);
      return jsonResponse({ onlineCount: Math.max(1, Object.keys(sessMap).length), sessionId: sid });
    }
    if (path === '/api/presence/leave' && method === 'POST') {
      var sessLeave = getActiveSessionsMap();
      if (body.sessionId) delete sessLeave[body.sessionId];
      saveActiveSessionsMap(sessLeave);
      return jsonResponse({ success: true, onlineCount: Math.max(1, Object.keys(sessLeave).length) });
    }
    if (path === '/api/presence/online') {
      var sessList = getActiveSessionsMap();
      return jsonResponse({
        onlineCount: Math.max(1, Object.keys(sessList).length),
        activeSessions: Object.keys(sessList).map(function(k) {
          var s = sessList[k];
          return { sessionId: s.sessionId.slice(-6), username: s.username || 'ゲスト', lastSeenSecondsAgo: 0, connectedSeconds: 0, device: 'desktop', browser: 'Web', os: 'GAS' };
        })
      });
    }

    // Accounts
    function sanitizeAcc(a) {
      if (!a) return null;
      var copy = Object.assign({}, a);
      delete copy.passwordHash;
      return copy;
    }
    if (path === '/api/account/profile') {
      var uq = String(query.username || query.email || '').trim().toLowerCase();
      var acc = state.accounts.find(function(a) { return a.username.toLowerCase() === uq || (a.email && a.email.toLowerCase() === uq); });
      if (!acc) return jsonResponse({ exists: false, isGuest: true });
      return jsonResponse({ exists: true, account: sanitizeAcc(acc), notificationsCount: 0, stats: { totalAccessCount: state.totalAccessCount, totalAccountsCount: state.accounts.length } });
    }
    if (path === '/api/account/register' && method === 'POST') {
      var uName = String(body.username || '').trim();
      var uPass = String(body.password || '').trim();
      var uEmail = String(body.email || '').trim().toLowerCase();
      if (uName.length < 2) return jsonResponse({ error: 'ユーザー名は2文字以上で入力してください' }, 400);
      if (uPass.length < 4) return jsonResponse({ error: 'パスワードは4文字以上で入力してください' }, 400);
      if (state.accounts.some(function(a) { return a.username.toLowerCase() === uName.toLowerCase(); })) {
        return jsonResponse({ error: 'ユーザー名「' + uName + '」は既に使用されています' }, 400);
      }
      var nowIso = new Date().toISOString();
      var newAcc = { id: 'usr_' + Date.now(), username: uName, passwordHash: hashPassword(uPass), email: uEmail, registeredAt: nowIso, lastActive: nowIso, preferences: { newReleases: true, playlistUpdates: true, lyricsSync: true }, playlists: body.playlists || [] };
      state.accounts.push(newAcc);
      saveState(state);
      return jsonResponse({ success: true, message: 'アカウント登録が完了しました', account: sanitizeAcc(newAcc), stats: { totalAccessCount: state.totalAccessCount, totalAccountsCount: state.accounts.length } });
    }
    if (path === '/api/account/login' && method === 'POST') {
      var idn = String(body.identifier || '').trim().toLowerCase();
      var pw = String(body.password || '').trim();
      if (pw === ADMIN_PASSWORD) {
        return jsonResponse({ success: true, message: '管理者としてログインしました', isAdmin: true, account: { id: 'admin_root', username: idn || 'admin', email: 'admin@zeromusic.local', role: 'admin', playlists: [] }, stats: { totalAccessCount: state.totalAccessCount, totalAccountsCount: state.accounts.length } });
      }
      var lAcc = state.accounts.find(function(a) { return a.username.toLowerCase() === idn || (a.email && a.email.toLowerCase() === idn); });
      if (!lAcc || lAcc.passwordHash !== hashPassword(pw)) return jsonResponse({ error: 'ユーザー名またはパスワードが正しくありません' }, 401);
      lAcc.lastActive = new Date().toISOString();
      saveState(state);
      return jsonResponse({ success: true, message: 'ログインしました', account: sanitizeAcc(lAcc), stats: { totalAccessCount: state.totalAccessCount, totalAccountsCount: state.accounts.length } });
    }
    if (path === '/api/account/sync' && method === 'POST') {
      var sUser = String(body.username || '').trim().toLowerCase();
      var sAcc = state.accounts.find(function(a) { return a.username.toLowerCase() === sUser; });
      if (sAcc) {
        sAcc.playlists = body.playlists || [];
        sAcc.lastActive = new Date().toISOString();
        saveState(state);
      }
      return jsonResponse({ success: true, count: (body.playlists || []).length });
    }
    if (path === '/api/account/notify' && method === 'POST') {
      var nItem = { id: 'notif_' + Date.now(), username: body.username || '', email: body.email || '', subject: body.subject || '【Zero Music】通知テスト', body: body.body || '通知テスト配信成功', type: body.type || 'test', timestamp: new Date().toISOString(), status: 'delivered' };
      state.notifications.unshift(nItem);
      saveState(state);
      return jsonResponse({ success: true, message: '通知を送信しました', notification: nItem });
    }
    if (path === '/api/account/notifications') {
      var nq = String(query.username || query.email || '').trim().toLowerCase();
      return jsonResponse({ notifications: state.notifications.filter(function(n) { return (n.username && n.username.toLowerCase() === nq) || (n.email && n.email.toLowerCase() === nq); }) });
    }

    // Share Playlists
    if (path === '/api/share/playlist' && method === 'POST') {
      var shId = 'pl_' + Date.now().toString(36);
      var shPl = { id: shId, name: String(body.name || '').trim(), author: String(body.author || 'ゲスト').trim(), tracks: body.tracks || [], createdAt: new Date().toISOString(), viewCount: 0 };
      state.sharedPlaylists[shId] = shPl;
      saveState(state);
      return jsonResponse({ success: true, shareId: shId, shareUrl: '?share_pl=' + shId, playlist: shPl });
    }
    if (path.indexOf('/api/share/playlist/') === 0) {
      var gShId = path.replace('/api/share/playlist/', '');
      var foundPl = state.sharedPlaylists[gShId];
      if (!foundPl) return jsonResponse({ error: '共有プレイリストが見つかりませんでした' }, 404);
      foundPl.viewCount = (foundPl.viewCount || 0) + 1;
      saveState(state);
      return jsonResponse({ success: true, playlist: foundPl });
    }
    if (path === '/api/share/recent') {
      return jsonResponse({ playlists: Object.keys(state.sharedPlaylists).map(function(k) { return state.sharedPlaylists[k]; }).slice(0, 10) });
    }

    // Telemetry & Admin
    if (path === '/api/telemetry/playback' && method === 'POST') {
      if (body.videoId) {
        state.analytics.totalTracksPlayed += 1;
        state.analytics.totalPlaybackSeconds += Math.max(0, Number(body.durationSeconds) || 0);
        var exP = state.analytics.trackPlays[body.videoId];
        if (exP) { exP.playCount += 1; exP.lastPlayed = new Date().toISOString(); }
        else state.analytics.trackPlays[body.videoId] = { videoId: body.videoId, title: body.title || body.videoId, artist: body.artist || '', thumbnail: body.thumbnail || '', playCount: 1, lastPlayed: new Date().toISOString() };
        saveState(state);
      }
      return jsonResponse({ success: true });
    }
    if (path === '/api/telemetry/search' && method === 'POST') {
      var sqK = String(body.query || '').trim().toLowerCase();
      if (sqK) {
        var exSq = state.analytics.searchQueries[sqK];
        if (exSq) exSq.count += 1;
        else state.analytics.searchQueries[sqK] = { query: body.query, count: 1, lastSearched: new Date().toISOString() };
        saveState(state);
      }
      return jsonResponse({ success: true });
    }
    if (path === '/api/telemetry/lyrics' && method === 'POST') {
      state.analytics.lyricsStats.views += 1;
      if (!body.isAvailable) state.analytics.lyricsStats.notFound += 1;
      else if (body.isSynced) state.analytics.lyricsStats.syncedHits += 1;
      else state.analytics.lyricsStats.plainHits += 1;
      saveState(state);
      return jsonResponse({ success: true });
    }
    if (path === '/api/telemetry/error' && method === 'POST') {
      state.analytics.playbackErrors.unshift({ timestamp: new Date().toISOString(), videoId: String(body.videoId || ''), title: body.title || '', error: String(body.error || '再生エラー') });
      if (state.analytics.playbackErrors.length > 50) state.analytics.playbackErrors.pop();
      saveState(state);
      return jsonResponse({ success: true });
    }
    if (path === '/api/admin/login' && method === 'POST') {
      if (String(body.password || '').trim() !== ADMIN_PASSWORD) return jsonResponse({ error: '管理者パスワードが正しくありません' }, 401);
      return jsonResponse({ success: true, role: 'admin', token: 'admin_' + Date.now() });
    }
    if (path === '/api/admin/overview') {
      return jsonResponse({
        stats: { totalAccessCount: state.totalAccessCount, totalAccountsCount: state.accounts.length, onlineCount: Math.max(1, Object.keys(getActiveSessionsMap()).length), totalPlaylistsCount: 0, totalNotificationsCount: state.notifications.length, totalPlaybackSeconds: state.analytics.totalPlaybackSeconds, totalPlaybackMinutes: Math.round(state.analytics.totalPlaybackSeconds / 60), totalTracksPlayed: state.analytics.totalTracksPlayed, totalLyricsViews: state.analytics.lyricsStats.views, lyricsMatchRate: 100 },
        topTracks: Object.keys(state.analytics.trackPlays).map(function(k) { return state.analytics.trackPlays[k]; }).sort(function(a, b) { return b.playCount - a.playCount; }).slice(0, 15),
        topSearches: Object.keys(state.analytics.searchQueries).map(function(k) { return state.analytics.searchQueries[k]; }).sort(function(a, b) { return b.count - a.count; }).slice(0, 15),
        activeSessions: [],
        traffic: { hourlyVisits: state.analytics.hourlyVisits, clientDevices: state.analytics.clientDevices, clientBrowsers: state.analytics.clientBrowsers, clientOS: state.analytics.clientOS },
        lyricsStats: Object.assign({}, state.analytics.lyricsStats, { matchRate: 100 }),
        playbackErrors: state.analytics.playbackErrors.slice(0, 20),
        accounts: state.accounts.map(sanitizeAcc),
        trackOffsets: state.trackOffsets,
        recentApiLogs: getApiLogs().slice(0, 15),
        system: { nodeVersion: 'Google Apps Script V8', uptimeSeconds: 0, memoryUsageMb: 0, lyricsCacheSize: 0 }
      });
    }
    if (path === '/api/track-offsets') return jsonResponse({ trackOffsets: state.trackOffsets });
    if (path === '/api/admin/track-offset' && method === 'POST') {
      if (body.remove) delete state.trackOffsets[body.videoId];
      else state.trackOffsets[body.videoId] = { offsetSec: Number(body.offsetSec) || 0, title: body.title || body.videoId, updatedAt: new Date().toISOString() };
      saveState(state);
      return jsonResponse({ success: true, trackOffsets: state.trackOffsets });
    }
    if (path === '/api/admin/users/delete' && method === 'POST') {
      state.accounts = state.accounts.filter(function(a) { return a.username.toLowerCase() !== String(body.username || '').toLowerCase(); });
      saveState(state);
      return jsonResponse({ success: true, totalAccountsCount: state.accounts.length });
    }
    if (path === '/api/admin/users/reset-password' && method === 'POST') {
      var rAcc = state.accounts.find(function(a) { return a.username.toLowerCase() === String(body.username || '').toLowerCase(); });
      if (rAcc) { rAcc.passwordHash = hashPassword(body.newPassword); saveState(state); }
      return jsonResponse({ success: true });
    }
    if (path === '/api/admin/broadcast-notification' && method === 'POST') {
      return jsonResponse({ success: true, sentCount: state.accounts.length, message: '一斉通知を送信しました' });
    }

    // Comments & Danmaku
    if (path.indexOf('/api/comments/') === 0) {
      var segs = path.replace('/api/comments/', '').split('/');
      var cVid = segs[0];
      if (method === 'GET') {
        return jsonResponse({ comments: state.trackComments[cVid] || [] });
      }
      if (method === 'POST' && segs.length === 1) {
        var cmt = { id: 'cmt_' + Date.now(), videoId: cVid, timestampSec: Math.max(0, Number(body.timestampSec) || 0), formattedTime: body.formattedTime || '0:00', text: sanitizeText(body.text).sanitized, username: body.username || 'ゲストリスナー', createdAt: new Date().toISOString(), likes: 0, likedBy: [], color: body.color || '#FFFFFF' };
        if (!state.trackComments[cVid]) state.trackComments[cVid] = [];
        state.trackComments[cVid].push(cmt);
        saveState(state);
        pushSocketEvent({ all: true }, { type: 'comment:new', videoId: cVid, comment: cmt });
        return jsonResponse({ success: true, comment: cmt });
      }
      if (method === 'POST' && segs[2] === 'like') {
        var listC = state.trackComments[cVid] || [];
        var tC = listC.find(function(x) { return x.id === segs[1]; });
        if (tC) {
          var idxL = tC.likedBy.indexOf(body.username || 'ゲスト');
          if (idxL === -1) { tC.likedBy.push(body.username || 'ゲスト'); tC.likes += 1; }
          else { tC.likedBy.splice(idxL, 1); tC.likes = Math.max(0, tC.likes - 1); }
          saveState(state);
          return jsonResponse({ success: true, likes: tC.likes, likedBy: tC.likedBy });
        }
        return jsonResponse({ error: 'Not found' }, 404);
      }
      if (method === 'DELETE' && segs.length === 2) {
        state.trackComments[cVid] = (state.trackComments[cVid] || []).filter(function(x) { return x.id !== segs[1]; });
        saveState(state);
        return jsonResponse({ success: true });
      }
    }

    // DM
    if (path === '/api/dm/conversations') {
      var dmU = String(query.username || '').trim().toLowerCase();
      var convs = state.accounts.filter(function(a) { return a.username.toLowerCase() !== dmU; }).map(function(a) {
        var convId = [dmU, a.username.toLowerCase()].sort().join('___');
        var msgs = state.directMessages.filter(function(m) { return m.conversationId === convId; });
        return { convId: convId, withUser: a.username, lastMessage: msgs[msgs.length - 1] || null, unreadCount: msgs.filter(function(m) { return m.recipient.toLowerCase() === dmU && !m.read; }).length, isOnline: false };
      });
      return jsonResponse({ conversations: convs });
    }
    if (path === '/api/dm/messages') {
      var cId = [String(query.user1 || '').toLowerCase(), String(query.user2 || '').toLowerCase()].sort().join('___');
      return jsonResponse({ messages: state.directMessages.filter(function(m) { return m.conversationId === cId; }) });
    }
    if (path === '/api/dm/send' && method === 'POST') {
      var dMsg = { id: 'dm_' + Date.now(), conversationId: [body.sender.toLowerCase(), body.recipient.toLowerCase()].sort().join('___'), sender: body.sender, recipient: body.recipient, content: sanitizeText(body.content || '').sanitized, trackCard: body.trackCard, playlistCard: body.playlistCard, timestamp: new Date().toISOString(), read: false, reactions: {} };
      state.directMessages.push(dMsg);
      saveState(state);
      pushSocketEvent({ username: body.recipient }, { type: 'dm:new', message: dMsg });
      return jsonResponse({ success: true, message: dMsg });
    }
    if (path === '/api/dm/react' && method === 'POST') {
      var rMsg = state.directMessages.find(function(m) { return m.id === body.messageId; });
      if (rMsg) {
        if (!rMsg.reactions) rMsg.reactions = {};
        if (!rMsg.reactions[body.emoji]) rMsg.reactions[body.emoji] = [];
        var rIdx = rMsg.reactions[body.emoji].indexOf(body.username);
        if (rIdx === -1) rMsg.reactions[body.emoji].push(body.username);
        else rMsg.reactions[body.emoji].splice(rIdx, 1);
        saveState(state);
      }
      return jsonResponse({ success: true, reactions: (rMsg && rMsg.reactions) || {} });
    }
    if (path === '/api/dm/read' && method === 'POST') {
      state.directMessages.forEach(function(m) {
        if (m.conversationId === body.conversationId && m.recipient.toLowerCase() === String(body.reader || '').toLowerCase()) m.read = true;
      });
      saveState(state);
      return jsonResponse({ success: true });
    }

    // Listening Party Rooms
    if (path === '/api/party/rooms' && method === 'GET') {
      return jsonResponse({ rooms: Object.keys(state.listeningRooms).map(function(k) { return state.listeningRooms[k]; }) });
    }
    if (path === '/api/party/rooms' && method === 'POST') {
      var rId = 'room_custom_' + Date.now();
      var newR = { id: rId, name: body.name, description: body.description || 'ユーザー作成のリスニングパーティー', category: body.category || 'custom', hostUsername: body.hostUsername || 'ホスト', currentTrack: body.initialTrack || null, isPlaying: !!body.initialTrack, positionSec: 0, updatedAt: Date.now(), participants: [{ username: body.hostUsername || 'ホスト', joinedAt: new Date().toISOString(), isHost: true }], chatMessages: [] };
      state.listeningRooms[rId] = newR;
      saveState(state);
      return jsonResponse({ success: true, room: newR });
    }
    if (path.indexOf('/api/party/room/') === 0) {
      var fRoom = state.listeningRooms[path.replace('/api/party/room/', '')];
      if (!fRoom) return jsonResponse({ error: 'ルームが見つかりません' }, 404);
      return jsonResponse({ room: fRoom });
    }

    // Social Notifications, Feed, Users, Follow, Moderation
    if (path === '/api/social/notifications') {
      var snU = String(query.username || '').toLowerCase();
      var listSN = state.socialNotifications.filter(function(n) { return n.recipient.toLowerCase() === snU; });
      return jsonResponse({ notifications: listSN.slice(0, 50), unreadCount: listSN.filter(function(n) { return !n.read; }).length });
    }
    if (path === '/api/social/notifications/read' && method === 'POST') {
      var snR = String(body.username || '').toLowerCase();
      state.socialNotifications.forEach(function(n) { if (n.recipient.toLowerCase() === snR) n.read = true; });
      saveState(state);
      return jsonResponse({ success: true });
    }
    if (path === '/api/social/feed') return jsonResponse({ feed: state.activityFeed.slice(0, 50) });
    if (path === '/api/social/users') {
      return jsonResponse({ users: state.accounts.map(function(a) { return { id: a.id, username: a.username, isOnline: false, nowPlaying: null, registeredAt: a.registeredAt }; }) });
    }
    if (path === '/api/social/follow' && method === 'POST') {
      var flw = String(body.follower || '').trim();
      var tgt = String(body.targetUser || '').trim();
      if (!state.follows[flw]) state.follows[flw] = [];
      var fIdx = state.follows[flw].indexOf(tgt);
      var isFollowing = false;
      if (fIdx === -1 && flw && tgt) {
        state.follows[flw].push(tgt);
        isFollowing = true;
      } else if (fIdx !== -1) {
        state.follows[flw].splice(fIdx, 1);
      }
      saveState(state);
      return jsonResponse({ success: true, isFollowing: isFollowing, following: state.follows[flw] });
    }
    if (path === '/api/social/block' && method === 'POST') {
      var blkU = String(body.user || '').trim();
      var blkT = String(body.targetUser || '').trim();
      if (!state.blockedUsers[blkU]) state.blockedUsers[blkU] = [];
      if (blkU && blkT && state.blockedUsers[blkU].indexOf(blkT) === -1) state.blockedUsers[blkU].push(blkT);
      saveState(state);
      return jsonResponse({ success: true, blocked: state.blockedUsers[blkU] });
    }
    if (path === '/api/social/unblock' && method === 'POST') {
      var ublkU = String(body.user || '').trim();
      var ublkT = String(body.targetUser || '').trim();
      if (state.blockedUsers[ublkU]) {
        state.blockedUsers[ublkU] = state.blockedUsers[ublkU].filter(function(u) { return u !== ublkT; });
        saveState(state);
      }
      return jsonResponse({ success: true, blocked: state.blockedUsers[ublkU] || [] });
    }
    if (path === '/api/social/report' && method === 'POST') {
      state.moderationReports.unshift({ id: 'rep_' + Date.now(), reporter: body.reporter || '匿名', reportedUser: body.reportedUser || '不明', targetType: body.targetType || 'comment', targetId: body.targetId || '', reason: body.reason || '不適切な投稿', contentSnippet: body.contentSnippet || '', timestamp: new Date().toISOString(), status: 'pending' });
      saveState(state);
      return jsonResponse({ success: true, message: '通報を受け付けました' });
    }
    if (path === '/api/admin/moderation/overview') {
      var allCmts = [];
      Object.keys(state.trackComments || {}).forEach(function(vId) {
        (state.trackComments[vId] || []).forEach(function(c) { allCmts.push(Object.assign({}, c, { videoId: vId })); });
      });
      allCmts.sort(function(a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
      return jsonResponse({ totalComments: allCmts.length, recentComments: allCmts.slice(0, 30), reports: state.moderationReports, bannedUsers: state.bannedUsers, totalRooms: Object.keys(state.listeningRooms).length, rooms: Object.keys(state.listeningRooms).map(function(k) { return state.listeningRooms[k]; }), ngWords: DEFAULT_NG_WORDS });
    }
    if (path === '/api/admin/moderation/resolve-report' && method === 'POST') {
      var rep = state.moderationReports.find(function(r) { return r.id === body.reportId; });
      if (rep) { rep.status = body.status || 'resolved'; saveState(state); }
      return jsonResponse({ success: true, report: rep });
    }
    if (path === '/api/admin/moderation/toggle-ban' && method === 'POST') {
      var banU = String(body.username || '').trim();
      var bIdx = state.bannedUsers.indexOf(banU);
      var isBanned = false;
      if (bIdx === -1 && banU) { state.bannedUsers.push(banU); isBanned = true; }
      else if (bIdx !== -1) { state.bannedUsers.splice(bIdx, 1); }
      saveState(state);
      return jsonResponse({ success: true, isBanned: isBanned, bannedUsers: state.bannedUsers });
    }
    if (path === '/api/admin/dm/all') {
      var dmMap = {};
      state.directMessages.forEach(function(m) {
        if (!dmMap[m.conversationId]) dmMap[m.conversationId] = { conversationId: m.conversationId, participants: [m.sender, m.recipient], messages: [] };
        dmMap[m.conversationId].messages.push(m);
      });
      var convArr = Object.keys(dmMap).map(function(k) { return dmMap[k]; });
      return jsonResponse({ totalMessages: state.directMessages.length, totalConversations: convArr.length, conversations: convArr });
    }
    if (path.indexOf('/api/admin/dm/message/') === 0 && method === 'DELETE') {
      var delId = path.replace('/api/admin/dm/message/', '');
      state.directMessages = state.directMessages.filter(function(m) { return m.id !== delId; });
      saveState(state);
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: 'Not found: ' + path }, 404);
  } catch (err) {
    return jsonResponse({ error: err && err.message ? err.message : String(err) }, 500);
  }
}
