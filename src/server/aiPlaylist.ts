import type { Express, Request, Response } from 'express';
import type { Innertube } from 'youtubei.js';
import { GoogleGenAI, Type } from '@google/genai';
import { normalizeArtistName } from '../utils/artistNames.js';

interface AiCuratedQueryItem {
  query: string;
  reason: string;
}

interface AiPlanResult {
  playlistTitle: string;
  description: string;
  moodTag: string;
  queries: AiCuratedQueryItem[];
  aiPowered: boolean;
}

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim().length < 10) {
    return null;
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

function parseDurationSeconds(text: string): number {
  if (!text) return 0;
  const parts = String(text)
    .split(':')
    .map((p) => parseInt(p, 10));
  if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
  if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  return 0;
}

function buildSmartFallbackPlan(
  prompt: string,
  mode: 'playlist' | 'radio',
  trackCount: number,
  seedTrack?: { title?: string; artist?: string },
  contextArtists: string[] = []
): AiPlanResult {
  const cleanPrompt = prompt.trim();
  const lower = cleanPrompt.toLowerCase();

  let moodTag = 'AIキュレーション';
  const queries: AiCuratedQueryItem[] = [];

  if (seedTrack?.title) {
    queries.push({
      query: `${seedTrack.artist || ''} ${seedTrack.title} Official`,
      reason: `「${seedTrack.title}」の世界観に連動`,
    });
    if (seedTrack.artist) {
      queries.push({
        query: `${seedTrack.artist} 人気曲 Official`,
        reason: `${seedTrack.artist} の代表チューン`,
      });
    }
  }

  if (/夜|深夜|エモ|雨|月|moon|night|chill|眠|寝/.test(lower)) {
    moodTag = 'ミッドナイト・エモーショナル';
    queries.push(
      { query: `${cleanPrompt} 邦楽 名曲`, reason: '夜の空気に溶け込むメロウな質感' },
      { query: 'Vaundy 踊り子 napori Official', reason: '深夜のリラックス＆グルーヴ' },
      { query: 'Official髭男dism Subtitle Official', reason: '心に刺さる感情的なメロディ' },
      { query: '藤井 風 満ちてゆく Official', reason: '穏やかで深みのあるサウンド' },
      { query: 'ヨルシカ 晴る Official', reason: '夜〜明け方に聴きたい透明感' }
    );
  } else if (/ドライブ|車|夏|爽快|海|風|drive|morning|朝|通学|通勤/.test(lower)) {
    moodTag = 'ドライブ・爽快ミックス';
    queries.push(
      { query: `${cleanPrompt} ドライブ`, reason: '爽快な疾走感と開放感' },
      { query: 'Mrs. GREEN APPLE ライラック 青と夏 Official', reason: '風を感じるアップテンポ' },
      { query: 'Official髭男dism Hello Official', reason: '前向きで晴れやかなイントロ' },
      { query: 'サカナクション 新宝島 Official', reason: '運転中に映えるダンスロック' },
      { query: 'YOASOBI 群青 Official', reason: '高揚感のあるサビ展開' }
    );
  } else if (/ワークアウト|運動|走|ジム|テンション|フェス|ロック|rock|gym|up/.test(lower)) {
    moodTag = 'ハイエナジー・ブースター';
    queries.push(
      { query: `${cleanPrompt} ロック 盛り上がる`, reason: 'テンションを一気に引き上げるビート' },
      { query: 'King Gnu SPECIALZ 一途 Official', reason: '重厚でスリリングなアンサンブル' },
      { query: 'Ado 唱 新時代 Official', reason: '圧倒的なエネルギーと推進力' },
      { query: 'ONE OK ROCK The Beginning Official', reason: '疾走するロックサウンド' },
      { query: 'Creepy Nuts Bling-Bang-Bang-Born Official', reason: '中毒性の高いリズム' }
    );
  } else if (/勉強|作業|集中|カフェ|ピアノ|lo-fi|lofi|focus|study|cafe/.test(lower)) {
    moodTag = 'ディープ・フォーカス';
    queries.push(
      { query: `${cleanPrompt} 作業用`, reason: '集中力を保てる心地よいテンポ' },
      { query: '久石譲 ピアノ 名曲', reason: '思考を邪魔しない美しい旋律' },
      { query: 'ずっと真夜中でいいのに。 あいつら全員同窓会 Official', reason: '洗練されたリズムで作業が捗る' },
      { query: 'Nujabes Luv(sic) Official', reason: '集中＆チルに最適なLo-Fiビート' },
      { query: '星野源 恋 POP VIRUS Official', reason: '心地よいポップグルーヴ' }
    );
  } else if (/泣|失恋|バラード|切な|悲|sad|ballad/.test(lower)) {
    moodTag = '泣ける・バラード選曲';
    queries.push(
      { query: `${cleanPrompt} バラード`, reason: '感情に寄り添う叙情的な楽曲' },
      { query: 'back number 水平線 Official', reason: '優しく胸に染みる歌詞' },
      { query: 'Official髭男dism Pretender Official', reason: '切ない恋心を描く名バラード' },
      { query: '米津玄師 Lemon Official', reason: '深い余韻を残すサウンド' },
      { query: '優里 ドライフラワー Official', reason: 'エモーショナルなボーカル表現' }
    );
  } else {
    queries.push(
      { query: `${cleanPrompt} Official Audio`, reason: `リクエスト「${cleanPrompt}」に一致` },
      { query: `${cleanPrompt} 公式`, reason: `テーマに沿った実在トラック` },
      { query: `${cleanPrompt} 人気曲`, reason: `関連度の高いヒット曲` }
    );
  }

  for (const artist of contextArtists.slice(0, 3)) {
    if (artist.trim()) {
      queries.push({
        query: `${artist.trim()} ${cleanPrompt} Official`.trim(),
        reason: `あなたの好み (${artist.trim()}) に合わせた選曲`,
      });
    }
  }

  const shortTitle =
    cleanPrompt.length > 26 ? `${cleanPrompt.slice(0, 26)}…` : cleanPrompt || 'パーソナル選曲';

  return {
    playlistTitle: mode === 'radio' ? `AIラジオ: ${shortTitle}` : `AIミックス: ${shortTitle}`,
    description:
      mode === 'radio'
        ? `「${cleanPrompt || seedTrack?.title || 'あなたのお気に入り'}」をテーマに自動選曲されたAIラジオ`
        : `プロンプト「${cleanPrompt}」からリアルタイムに構成された${trackCount}曲のプレイリスト`,
    moodTag,
    queries,
    aiPowered: false,
  };
}

async function generatePlanWithGemini(
  prompt: string,
  mode: 'playlist' | 'radio',
  trackCount: number,
  seedTrack?: { title?: string; artist?: string },
  contextArtists: string[] = [],
  likedTitles: string[] = []
): Promise<AiPlanResult | null> {
  const ai = getGeminiClient();
  if (!ai) return null;

  try {
    const seedHint = seedTrack?.title
      ? `\n基準トラック: ${seedTrack.title} - ${seedTrack.artist || ''}`
      : '';
    const tasteHint =
      contextArtists.length > 0
        ? `\nユーザーの好きなアーティスト例: ${contextArtists.slice(0, 6).join(', ')}`
        : '';
    const likedHint =
      likedTitles.length > 0 ? `\n最近のお気に入り曲例: ${likedTitles.slice(0, 6).join(', ')}` : '';

    const fullPrompt = `あなたは日本・世界の音楽に精通したプロの音楽キュレーターAIです。
ユーザーのリクエスト: 「${prompt}」
モード: ${mode === 'radio' ? 'AIラジオ（似た雰囲気や次に流れたい名曲を連続選曲）' : 'AIプレイリスト（テーマに沿った構成）'}
目標曲数: ${trackCount}曲${seedHint}${tasteHint}${likedHint}

YouTube Musicで実際に検索して見つかる「実在の公式楽曲（曲名 + アーティスト名）」を検索クエリとして${Math.min(20, Math.max(8, trackCount))}個提案してください。
カバー・歌ってみた・1時間作業用BGMまとめではなく、必ず単体の公式楽曲にしてください。`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: fullPrompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            playlistTitle: { type: Type.STRING },
            description: { type: Type.STRING },
            moodTag: { type: Type.STRING },
            queries: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  query: { type: Type.STRING },
                  reason: { type: Type.STRING },
                },
                required: ['query', 'reason'],
              },
            },
          },
          required: ['playlistTitle', 'description', 'moodTag', 'queries'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    if (Array.isArray(parsed.queries) && parsed.queries.length > 0) {
      return {
        playlistTitle: String(parsed.playlistTitle || 'AIプレイリスト').trim(),
        description: String(parsed.description || '').trim(),
        moodTag: String(parsed.moodTag || 'AI厳選').trim(),
        queries: parsed.queries
          .filter((q: any) => typeof q?.query === 'string' && q.query.trim().length > 0)
          .slice(0, 20),
        aiPowered: true,
      };
    }
  } catch (err: any) {
    console.warn('[AI Playlist] Gemini generation fallback:', err?.message);
  }
  return null;
}

function cleanSongTitle(raw: string): string {
  return raw
    .replace(/\[[^\]]*Official[^\]]*\]/gi, '')
    .replace(/［[^］]*Official[^］]*］/gi, '')
    .replace(/\([^)]*Official[^)]*\)/gi, '')
    .replace(/【[^】]*歌詞[^】]*】/gi, '')
    .replace(/Music Video|Official Video|Official Audio/gi, '')
    .trim();
}

export function registerAiPlaylistRoutes(app: Express, getInnertube: () => Promise<Innertube>) {
  app.post('/api/ai/playlist', async (req: Request, res: Response) => {
    const prompt = String(req.body?.prompt || '').trim();
    const mode = req.body?.mode === 'radio' ? 'radio' : 'playlist';
    const trackCount = Math.max(6, Math.min(20, Number(req.body?.trackCount) || 12));
    const seedTrack = req.body?.seedTrack || undefined;
    const contextArtists: string[] = Array.isArray(req.body?.contextArtists)
      ? req.body.contextArtists.map((a: any) => String(a || '').trim()).filter(Boolean)
      : [];
    const likedTitles: string[] = Array.isArray(req.body?.likedTitles)
      ? req.body.likedTitles.map((t: any) => String(t || '').trim()).filter(Boolean)
      : [];

    if (!prompt && !seedTrack?.title) {
      return res.status(400).json({ error: '作成したい気分・シチュエーション・プロンプトを入力してください' });
    }

    const effectivePrompt =
      prompt || `${seedTrack?.title || ''} ${seedTrack?.artist || ''} に合うラジオミックス`.trim();

    try {
      const yt = await getInnertube();
      const geminiPlan = await generatePlanWithGemini(
        effectivePrompt,
        mode,
        trackCount,
        seedTrack,
        contextArtists,
        likedTitles
      );
      const plan =
        geminiPlan ||
        buildSmartFallbackPlan(effectivePrompt, mode, trackCount, seedTrack, contextArtists);

      const tracks: any[] = [];
      const seenIds = new Set<string>();
      const seenTitleKeys = new Set<string>();

      const blacklist = /(歌ってみた|弾いてみた|karaoke|カラオケ|off\s*vocal|1時間|耐久|メドレー|medley|cover|カバー|reaction|リアクション|解説)/i;

      const resolvedBatches = await Promise.all(
        plan.queries.slice(0, 14).map(async (qItem) => {
          try {
            // Try YouTube Music song search first for clean official studio audio
            const musicRes: any = await yt.music.search(qItem.query, { type: 'song' });
            const shelves = Array.isArray(musicRes?.results) ? musicRes.results : [];
            for (const shelf of shelves) {
              const items = Array.isArray(shelf?.contents) ? shelf.contents : [];
              for (const item of items.slice(0, 3)) {
                const id = String(item?.id || '').trim();
                const title = String(item?.title?.toString?.() || item?.title || '').trim();
                const artist = normalizeArtistName(
                  String(item?.artists?.[0]?.name || item?.author?.name || '').trim()
                );
                if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id) || !title) continue;
                if (blacklist.test(title)) continue;
                const durSec =
                  Number(item?.duration?.seconds) || parseDurationSeconds(item?.duration?.text || '');
                if (durSec > 0 && (durSec < 60 || durSec > 600)) continue;
                const thumb =
                  item?.thumbnails?.[0]?.url ||
                  item?.thumbnail?.contents?.[0]?.url ||
                  `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
                return {
                  id,
                  title: cleanSongTitle(title) || title,
                  artist: artist || 'Artist',
                  duration: item?.duration?.text || '3:45',
                  durationSeconds: durSec || 225,
                  thumbnail: thumb,
                  aiReason: qItem.reason,
                };
              }
            }

            // Fallback to general video search
            const vidRes: any = await yt.search(`${qItem.query} Official`, { type: 'video' });
            for (const v of (vidRes?.videos || []).slice(0, 4)) {
              const id = String(v?.id || '').trim();
              const rawTitle = String(v?.title?.text || v?.title?.toString?.() || '').trim();
              if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id) || !rawTitle) continue;
              if (blacklist.test(rawTitle)) continue;
              const durSec = parseDurationSeconds(v?.duration?.text || '');
              if (durSec > 0 && (durSec < 65 || durSec > 540)) continue;
              const artist = normalizeArtistName(
                String(v?.author?.name || '').replace(/\s*-\s*Topic$/i, '').trim()
              );
              return {
                id,
                title: cleanSongTitle(rawTitle) || rawTitle,
                artist: artist || 'Artist',
                duration: v?.duration?.text || '4:00',
                durationSeconds: durSec || 240,
                thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
                aiReason: qItem.reason,
              };
            }
          } catch {}
          return null;
        })
      );

      for (const cand of resolvedBatches) {
        if (!cand) continue;
        const titleKey = `${cand.title.toLowerCase().replace(/\s+/g, '')}`;
        if (seenIds.has(cand.id) || seenTitleKeys.has(titleKey)) continue;
        seenIds.add(cand.id);
        seenTitleKeys.add(titleKey);
        tracks.push(cand);
        if (tracks.length >= trackCount) break;
      }

      // If more tracks are needed to meet trackCount, fetch one broader search
      if (tracks.length < trackCount) {
        try {
          const extraRes: any = await yt.music.search(effectivePrompt, { type: 'song' });
          const shelves = Array.isArray(extraRes?.results) ? extraRes.results : [];
          for (const shelf of shelves) {
            for (const item of shelf?.contents || []) {
              if (tracks.length >= trackCount) break;
              const id = String(item?.id || '').trim();
              const title = String(item?.title?.toString?.() || item?.title || '').trim();
              if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id) || !title || seenIds.has(id)) continue;
              if (blacklist.test(title)) continue;
              const titleKey = title.toLowerCase().replace(/\s+/g, '');
              if (seenTitleKeys.has(titleKey)) continue;
              seenIds.add(id);
              seenTitleKeys.add(titleKey);
              const artist = normalizeArtistName(
                String(item?.artists?.[0]?.name || item?.author?.name || 'Artist').trim()
              );
              const durSec =
                Number(item?.duration?.seconds) || parseDurationSeconds(item?.duration?.text || '');
              tracks.push({
                id,
                title: cleanSongTitle(title) || title,
                artist,
                duration: item?.duration?.text || '3:45',
                durationSeconds: durSec || 225,
                thumbnail:
                  item?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
                aiReason: `「${plan.moodTag}」テーマに連動`,
              });
            }
          }
        } catch {}
      }

      res.json({
        success: true,
        playlistTitle: plan.playlistTitle,
        description: plan.description,
        moodTag: plan.moodTag,
        aiPowered: plan.aiPowered,
        coverUrl: tracks[0]?.thumbnail || '/assets/covers/rejoice.jpg',
        tracks,
      });
    } catch (err: any) {
      console.error('[AI Playlist] Error:', err?.message || err);
      res.status(500).json({ error: 'AIプレイリストの生成に失敗しました' });
    }
  });
}
