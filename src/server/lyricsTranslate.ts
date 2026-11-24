import type { Express, Request, Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { kvCache } from './kvCache.js';

export interface TranslatedLyricLine {
  original: string;
  translation: string;
  pronunciation: string;
}

const LANG_LABELS: Record<string, string> = {
  ja: '自然な日本語（歌詞のニュアンスを大切にした意訳＋正確な意味）',
  en: 'Natural English poetic translation matching the lyrics meaning',
  ko: '자연스러운 한국어 가사 번역',
  zh: '自然流畅的简体中文歌词翻译',
};

const PRONUNCIATION_LABELS: Record<string, string> = {
  romaji:
    'Romanized pronunciation guide (Romaji for Japanese, Revised Romanization for Korean, Pinyin for Chinese, phonetic syllable guide for English)',
  furigana:
    'Japanese reading guide in Hiragana/Katakana (漢字にはひらがな読み、英語・韓国語には読みやすいカタカナ発音ガイド)',
  katakana:
    'Katakana phonetic reading guide readable for Japanese speakers (すべての外国語・難読漢字にカタカナ発音表記)',
};

export function registerLyricsTranslateRoutes(app: Express) {
  app.post('/api/lyrics/translate-guide', async (req: Request, res: Response) => {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY が設定されていないため、歌詞翻訳・発音ガイドを利用できません',
      });
    }

    const videoId = String(req.body?.videoId || '').trim();
    const rawLines = Array.isArray(req.body?.lines) ? req.body.lines : [];
    const targetLang = String(req.body?.targetLang || 'ja').toLowerCase();
    const pronunciationMode = String(req.body?.pronunciationMode || 'romaji').toLowerCase();
    const trackTitle = String(req.body?.trackTitle || '').trim();
    const artist = String(req.body?.artist || '').trim();

    const cleanedLines = rawLines
      .map((l: unknown) => String(l || '').trim())
      .filter(Boolean)
      .slice(0, 90);

    if (cleanedLines.length === 0) {
      return res.status(400).json({ error: '翻訳対象の歌詞行がありません' });
    }

    const langKey = LANG_LABELS[targetLang] ? targetLang : 'ja';
    const pronKey = PRONUNCIATION_LABELS[pronunciationMode] ? pronunciationMode : 'romaji';
    const signature = `${videoId || trackTitle}_${langKey}_${pronKey}_${cleanedLines.length}_${cleanedLines[0]?.slice(0, 24)}_${cleanedLines[cleanedLines.length - 1]?.slice(0, 24)}`;
    const cacheKey = `lyrics_translate_v1:${signature}`.toLowerCase();

    const cached = kvCache.get<{
      lines: TranslatedLyricLine[];
      targetLang: string;
      pronunciationMode: string;
    }>(cacheKey);
    if (cached && Array.isArray(cached.lines) && cached.lines.length > 0) {
      return res.json({ ...cached, fromCache: true });
    }

    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const numberedInput = cleanedLines
        .map((line: string, idx: number) => `${idx}: ${line}`)
        .join('\n');

      const prompt = `You are a music linguist and vocal coach translating song lyrics line-by-line and creating accurate singing pronunciation guides.

Song: "${trackTitle || 'Unknown'}" by "${artist || 'Unknown'}"
Target translation language: ${LANG_LABELS[langKey]}
Pronunciation guide format: ${PRONUNCIATION_LABELS[pronKey]}

Instructions:
1. Return an array of objects with exact length ${cleanedLines.length}, preserving the exact 0..${cleanedLines.length - 1} line order.
2. Each object has:
   - "index": integer line index
   - "translation": natural translation into target language. If the line is already in the target language, provide a brief poetic/clear Japanese paraphrase or keep empty string "" if redundant.
   - "pronunciation": clear phonetic reading / pronunciation guide in the requested format so a singer can sing along accurately.
3. Never omit lines or merge lines.

Lyrics lines:
${numberedInput}`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    index: { type: Type.INTEGER },
                    translation: { type: Type.STRING },
                    pronunciation: { type: Type.STRING },
                  },
                  required: ['index', 'translation', 'pronunciation'],
                },
              },
            },
            required: ['items'],
          },
        },
      });

      const text = (response.text || '').trim();
      if (!text) {
        return res.status(502).json({ error: '翻訳AIからの応答が空でした' });
      }

      const parsed = JSON.parse(text) as {
        items?: Array<{ index?: number; translation?: string; pronunciation?: string }>;
      };
      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      if (items.length === 0) {
        return res.status(502).json({ error: '翻訳結果の解析に失敗しました' });
      }

      const itemByIdx = new Map<number, { translation: string; pronunciation: string }>();
      items.forEach((it, arrIdx) => {
        const idx = typeof it.index === 'number' ? it.index : arrIdx;
        itemByIdx.set(idx, {
          translation: String(it.translation || '').trim(),
          pronunciation: String(it.pronunciation || '').trim(),
        });
      });

      const mappedLines: TranslatedLyricLine[] = cleanedLines.map((original: string, idx: number) => {
        const hit = itemByIdx.get(idx);
        return {
          original,
          translation: hit?.translation || '',
          pronunciation: hit?.pronunciation || '',
        };
      });

      const payload = {
        lines: mappedLines,
        targetLang: langKey,
        pronunciationMode: pronKey,
      };
      kvCache.set(cacheKey, payload, 7 * 24 * 3600);
      return res.json(payload);
    } catch (err: any) {
      console.error('[LyricsTranslate] Gemini error:', err?.message || err);
      return res.status(502).json({
        error: err?.message || '歌詞の翻訳・発音ガイド生成中にエラーが発生しました',
      });
    }
  });
}
