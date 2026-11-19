import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  X,
  Download,
  Share2,
  Link2,
  Check,
  Pencil,
  MoreHorizontal,
  QrCode,
} from 'lucide-react';
import { Track, LyricsData, SyncedLine, Artist } from '../types/music';
import { toBase64Image } from '../utils/imageBase64';
import { usePlayer, VisualShareTarget } from '../context/PlayerContext';

interface StoryCardGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  track: Track | null;
  lyrics: LyricsData | null;
  target?: VisualShareTarget | null;
}

type CardTab = 'song' | 'lyrics';

interface BgSwatch {
  id: string;
  label: string;
  type: 'blur' | 'solid' | 'gradient';
  primary: string;
  secondary?: string;
  textColor: string;
}

const SONG_SWATCHES: BgSwatch[] = [
  { id: 'blur', label: 'アート背景', type: 'blur', primary: '#18181b', textColor: '#ffffff' },
  { id: 'crimson', label: 'レッド', type: 'solid', primary: '#dc2626', textColor: '#0a0a0a' },
  {
    id: 'crimson_grad',
    label: 'ダークレッド',
    type: 'gradient',
    primary: '#7f1d1d',
    secondary: '#09090b',
    textColor: '#ffffff',
  },
  { id: 'obsidian', label: 'ブラック', type: 'solid', primary: '#18181b', textColor: '#ffffff' },
];

const LYRICS_SWATCHES: BgSwatch[] = [
  { id: 'vivid_red', label: 'スカーレット', type: 'solid', primary: '#e11d48', textColor: '#09090b' },
  { id: 'red_classic', label: 'クリムゾン', type: 'solid', primary: '#dc2626', textColor: '#ffffff' },
  { id: 'amber', label: 'ゴールド', type: 'solid', primary: '#d97706', textColor: '#09090b' },
  {
    id: 'night_grad',
    label: 'ナイト',
    type: 'gradient',
    primary: '#450a0a',
    secondary: '#09090b',
    textColor: '#ffffff',
  },
];

const ARTIST_SWATCHES: BgSwatch[] = [
  { id: 'amber', label: 'アンバー', type: 'solid', primary: '#c88a04', textColor: '#ffffff' },
  {
    id: 'crimson_grad',
    label: 'クリムゾン',
    type: 'gradient',
    primary: '#991b1b',
    secondary: '#12080a',
    textColor: '#ffffff',
  },
  { id: 'black', label: 'ブラック', type: 'solid', primary: '#111114', textColor: '#ffffff' },
];

export const StoryCardGeneratorModal: React.FC<StoryCardGeneratorModalProps> = ({
  isOpen,
  onClose,
  track,
  lyrics,
  target,
}) => {
  const { openZeroCodeModal, showToast } = usePlayer();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const effectiveTarget: VisualShareTarget | null = useMemo(() => {
    if (target) return target;
    if (track) return { type: 'track', track };
    return null;
  }, [target, track]);

  const isArtistMode = effectiveTarget?.type === 'artist' && Boolean(effectiveTarget.artist);
  const activeTrack: Track | null =
    effectiveTarget?.type === 'track'
      ? effectiveTarget.track || track
      : effectiveTarget?.type === 'playlist'
      ? effectiveTarget.playlist?.tracks?.[0] || track
      : track;
  const activeArtist: Artist | undefined = effectiveTarget?.artist;

  const [cardTab, setCardTab] = useState<CardTab>('song');
  const [selectedSwatchIdx, setSelectedSwatchIdx] = useState<number>(0);
  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [selectedQuote, setSelectedQuote] = useState<string>('');
  const [selectedLineIndices, setSelectedLineIndices] = useState<number[]>([]);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [copiedOther, setCopiedOther] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const swatches = isArtistMode
    ? ARTIST_SWATCHES
    : cardTab === 'lyrics'
    ? LYRICS_SWATCHES
    : SONG_SWATCHES;
  const activeSwatch = swatches[selectedSwatchIdx % swatches.length] || swatches[0];

  useEffect(() => {
    setSelectedSwatchIdx(0);
  }, [cardTab, isArtistMode]);

  // Populate initial 3-4 lines from synced lyrics or fallback quote
  useEffect(() => {
    if (!isOpen) return;
    if (lyrics?.syncedLyrics && lyrics.syncedLyrics.length > 0) {
      const validIndices: number[] = [];
      for (let i = 0; i < lyrics.syncedLyrics.length && validIndices.length < 3; i++) {
        if (lyrics.syncedLyrics[i].text.trim().length > 2) {
          validIndices.push(i);
        }
      }
      if (validIndices.length > 0) {
        setSelectedLineIndices(validIndices);
        setSelectedQuote(
          validIndices.map((idx) => lyrics.syncedLyrics![idx].text.trim()).join('\n')
        );
        return;
      }
    }
    if (lyrics?.lyrics) {
      const lines = lyrics.lyrics
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 2)
        .slice(0, 3);
      if (lines.length > 0) {
        setSelectedQuote(lines.join('\n'));
        setSelectedLineIndices([]);
        return;
      }
    }
    setSelectedLineIndices([]);
    setSelectedQuote(
      activeTrack
        ? `${activeTrack.title}\n心に響くサウンドを聴いています`
        : 'お気に入りのサウンドをシェア'
    );
  }, [isOpen, lyrics, activeTrack?.id]);

  const toggleLyricLine = (idx: number) => {
    if (!lyrics?.syncedLyrics) return;
    setSelectedLineIndices((prev) => {
      let next: number[];
      if (prev.includes(idx)) {
        next = prev.filter((i) => i !== idx);
      } else {
        next = [...prev, idx].slice(-4).sort((a, b) => a - b);
      }
      const joined = next.map((i) => lyrics.syncedLyrics![i].text.trim()).join('\n');
      if (joined) setSelectedQuote(joined);
      return next;
    });
  };

  const shareTitle = isArtistMode
    ? activeArtist?.name || 'アーティスト'
    : effectiveTarget?.type === 'playlist'
    ? effectiveTarget.playlist?.name || 'プレイリスト'
    : activeTrack?.title || '';

  const shareSubtitle = isArtistMode
    ? 'zero-musicのアーティスト'
    : effectiveTarget?.type === 'playlist'
    ? `プレイリスト · ${effectiveTarget.playlist?.tracks.length || 0}曲`
    : activeTrack?.artist || '';

  const shareImage = isArtistMode
    ? activeArtist?.thumbnail || ''
    : activeTrack?.thumbnail || '';

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const origin = window.location.origin;
    if (isArtistMode && activeArtist?.id) {
      return `${origin}/?artist=${encodeURIComponent(activeArtist.id)}`;
    }
    if (activeTrack?.id) {
      return `${origin}/?track=${encodeURIComponent(activeTrack.id)}`;
    }
    return origin;
  }, [isArtistMode, activeArtist?.id, activeTrack?.id]);

  // Render high-resolution canvas (900 x 1440)
  useEffect(() => {
    if (!isOpen || !effectiveTarget || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 900;
    const H = 1440;
    canvas.width = W;
    canvas.height = H;

    let cancelled = false;
    const img = new Image();
    if (shareImage) {
      toBase64Image(shareImage)
        .then((b64) => {
          if (cancelled) return;
          img.crossOrigin = 'anonymous';
          img.src = b64 || shareImage;
        })
        .catch(() => {
          if (!cancelled) renderCard();
        });
    }

    const drawZeroLogo = (x: number, y: number, r: number, darkInk: boolean) => {
      ctx.save();
      ctx.fillStyle = darkInk ? '#09090b' : '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = darkInk ? activeSwatch.primary : '#dc2626';
      ctx.lineWidth = Math.max(3, r * 0.22);
      ctx.beginPath();
      ctx.arc(x, y, r * 0.56, -Math.PI * 0.75, Math.PI * 0.25);
      ctx.stroke();

      ctx.fillStyle = darkInk ? activeSwatch.primary : '#dc2626';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const renderCard = () => {
      if (cancelled) return;
      ctx.clearRect(0, 0, W, H);

      // Base background
      if (activeSwatch.type === 'blur' && img.complete && img.naturalWidth > 0) {
        ctx.save();
        ctx.filter = 'blur(42px) brightness(0.45) saturate(1.25)';
        const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight) * 1.15;
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
        ctx.restore();

        const overlay = ctx.createLinearGradient(0, 0, 0, H);
        overlay.addColorStop(0, 'rgba(0,0,0,0.35)');
        overlay.addColorStop(1, 'rgba(10,0,2,0.72)');
        ctx.fillStyle = overlay;
        ctx.fillRect(0, 0, W, H);
      } else if (activeSwatch.type === 'gradient') {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, activeSwatch.primary);
        g.addColorStop(1, activeSwatch.secondary || '#09090b');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      } else {
        ctx.fillStyle = activeSwatch.primary;
        ctx.fillRect(0, 0, W, H);
      }

      if (isArtistMode) {
        // Artist Share Card (IMG_0291 style)
        ctx.fillStyle = 'rgba(10, 10, 12, 0.78)';
        ctx.beginPath();
        ctx.roundRect(78, 175, 744, 960, 28);
        ctx.fill();

        // Circular artist image
        const cx = W / 2;
        const cy = 500;
        const cr = 235;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        if (img.complete && img.naturalWidth > 0) {
          const scale = Math.max((cr * 2) / img.naturalWidth, (cr * 2) / img.naturalHeight);
          const dw = img.naturalWidth * scale;
          const dh = img.naturalHeight * scale;
          ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
        } else {
          ctx.fillStyle = '#262626';
          ctx.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);
        }
        ctx.restore();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 54px -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif';
        ctx.textAlign = 'left';
        const aName = shareTitle.length > 18 ? `${shareTitle.slice(0, 17)}…` : shareTitle;
        ctx.fillText(aName, 130, 845);

        ctx.fillStyle = '#d4d4d8';
        ctx.font = '500 32px -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif';
        ctx.fillText('zero-musicのアーティスト', 130, 902);

        drawZeroLogo(152, 1020, 24, false);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 34px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText('zero-music', 194, 1031);
        return;
      }

      if (cardTab === 'lyrics') {
        // Lyrics Share Card (IMG_0293 style)
        const darkInk = activeSwatch.textColor === '#09090b';
        const ink = activeSwatch.textColor;
        const subInk = darkInk ? 'rgba(9,9,11,0.72)' : 'rgba(255,255,255,0.78)';

        // Top mini track cover + meta
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(72, 84, 104, 104, 14);
        ctx.clip();
        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, 72, 84, 104, 104);
        } else {
          ctx.fillStyle = '#262626';
          ctx.fillRect(72, 84, 104, 104);
        }
        ctx.restore();

        ctx.fillStyle = ink;
        ctx.font = 'bold 34px -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif';
        ctx.textAlign = 'left';
        const tTitle = shareTitle.length > 19 ? `${shareTitle.slice(0, 18)}…` : shareTitle;
        ctx.fillText(tTitle, 200, 128);

        ctx.fillStyle = subInk;
        ctx.font = '600 28px -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif';
        const subTxt = `楽曲 · ${shareSubtitle}`.slice(0, 26);
        ctx.fillText(subTxt, 200, 174);

        // Large bold lyrics lines
        ctx.fillStyle = ink;
        ctx.font = '900 66px -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif';
        const rawLines = (selectedQuote || shareTitle).split('\n').filter((l) => l.trim());
        const wrappedLines: string[] = [];
        for (const raw of rawLines) {
          let curr = '';
          for (const ch of raw) {
            const test = curr + ch;
            if (ctx.measureText(test).width > 740 && curr) {
              wrappedLines.push(curr);
              curr = ch;
            } else {
              curr = test;
            }
          }
          if (curr) wrappedLines.push(curr);
        }
        const displayLines = wrappedLines.slice(0, 8);
        const lineHeight = 96;
        const blockH = displayLines.length * lineHeight;
        let startY = Math.max(330, Math.round((H - 220 - blockH) / 2) + 80);

        displayLines.forEach((line) => {
          ctx.fillText(line, 72, startY);
          startY += lineHeight;
        });

        // Footer branding
        drawZeroLogo(98, H - 96, 26, darkInk);
        ctx.fillStyle = ink;
        ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText('zero-music', 142, H - 83);
        return;
      }

      // Song Share Card (IMG_0292 / IMG_0285 style)
      // Inner rounded card over backdrop
      ctx.fillStyle =
        activeSwatch.type === 'blur' ? 'rgba(18, 18, 22, 0.72)' : 'rgba(12, 12, 16, 0.85)';
      ctx.beginPath();
      ctx.roundRect(74, 150, 752, 1080, 32);
      ctx.fill();

      // Square Artwork
      const artSize = 640;
      const artX = (W - artSize) / 2;
      const artY = 205;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 35;
      ctx.shadowOffsetY = 16;
      ctx.beginPath();
      ctx.roundRect(artX, artY, artSize, artSize, 20);
      ctx.clip();
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, artX, artY, artSize, artSize);
      } else {
        ctx.fillStyle = '#27272a';
        ctx.fillRect(artX, artY, artSize, artSize);
      }
      ctx.restore();

      // Title + Artist
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 50px -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif';
      ctx.textAlign = 'left';
      const sTitle = shareTitle.length > 18 ? `${shareTitle.slice(0, 17)}…` : shareTitle;
      ctx.fillText(sTitle, 130, 945);

      ctx.fillStyle = '#d4d4d8';
      ctx.font = '500 36px -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif';
      const sSub = shareSubtitle.length > 26 ? `${shareSubtitle.slice(0, 25)}…` : shareSubtitle;
      ctx.fillText(sSub, 130, 1005);

      // zero-music badge
      drawZeroLogo(156, 1118, 26, false);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillText('zero-music', 200, 1131);
    };

    if (!shareImage) {
      renderCard();
    } else {
      img.onload = renderCard;
      img.onerror = renderCard;
    }

    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    effectiveTarget,
    cardTab,
    activeSwatch,
    selectedQuote,
    shareImage,
    shareTitle,
    shareSubtitle,
    isArtistMode,
  ]);

  if (!isOpen || !effectiveTarget) return null;

  const handleCopyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard?.writeText(shareUrl).catch(() => {});
    setCopiedLink(true);
    showToast('共有リンクをコピーしました', 'success', 2000);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const handleDownloadPng = () => {
    if (!canvasRef.current) return;
    setIsExporting(true);
    try {
      const dataUrl = canvasRef.current.toDataURL('image/png');
      const a = document.createElement('a');
      a.download = `${shareTitle.replace(/[\/\\?%*:|"<>]/g, '_')}_zeromusic_card.png`;
      a.href = dataUrl;
      a.click();
      showToast('カードをPNG画像として保存しました', 'success', 2200);
    } finally {
      setIsExporting(false);
    }
  };

  const handleNativeOrImageShare = async () => {
    if (!canvasRef.current) return;
    try {
      canvasRef.current.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], 'zeromusic-card.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: `${shareTitle} | zero-music`,
            text: `${shareTitle} - ${shareSubtitle}`,
            url: shareUrl,
            files: [file],
          });
        } else if (navigator.share) {
          await navigator.share({
            title: `${shareTitle} | zero-music`,
            url: shareUrl,
          });
        } else {
          handleDownloadPng();
          setCopiedOther(true);
          setTimeout(() => setCopiedOther(false), 2000);
        }
      });
    } catch {
      handleDownloadPng();
    }
  };

  const handleOpenZeroCode = () => {
    onClose();
    if (isArtistMode && activeArtist) {
      openZeroCodeModal({
        type: 'artist',
        title: activeArtist.name,
        subtitle: 'アーティスト',
        imageUrl: activeArtist.thumbnail,
        url: shareUrl,
        codeValue: `zeromusic:artist:${activeArtist.id}`,
        artistId: activeArtist.id,
      });
    } else if (activeTrack) {
      openZeroCodeModal({
        type: 'track',
        title: activeTrack.title,
        subtitle: activeTrack.artist,
        imageUrl: activeTrack.thumbnail,
        url: shareUrl,
        codeValue: `zeromusic:track:${activeTrack.id}`,
        trackId: activeTrack.id,
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-[#18181c] border-t sm:border border-white/10 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle & close */}
        <div className="pt-3 pb-1 px-5 flex items-center justify-between">
          <div className="w-8" />
          <div className="w-10 h-1 rounded-full bg-neutral-600" />
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Visual Card Preview */}
        <div className="px-6 pt-2 pb-4 flex flex-col items-center">
          <div className="w-56 sm:w-64 aspect-[5/8] rounded-2xl overflow-hidden shadow-[0_24px_60px_rgba(0,0,0,0.85)] border border-white/10 bg-neutral-950">
            <canvas ref={canvasRef} className="w-full h-full object-cover" />
          </div>

          {/* Segmented Toggle: 楽曲 / 歌詞 (only in Track mode) */}
          {!isArtistMode && (
            <div className="mt-5 w-full max-w-xs p-1 rounded-full bg-[#2a2a32] flex items-center">
              <button
                type="button"
                onClick={() => setCardTab('song')}
                className={`flex-1 py-2 rounded-full text-xs font-black transition-all cursor-pointer ${
                  cardTab === 'song'
                    ? 'bg-white text-black shadow'
                    : 'text-neutral-300 hover:text-white'
                }`}
              >
                楽曲
              </button>
              <button
                type="button"
                onClick={() => setCardTab('lyrics')}
                className={`flex-1 py-2 rounded-full text-xs font-black transition-all cursor-pointer ${
                  cardTab === 'lyrics'
                    ? 'bg-white text-black shadow'
                    : 'text-neutral-300 hover:text-white'
                }`}
              >
                歌詞
              </button>
            </div>
          )}

          {/* Color Swatches + Edit Pencil */}
          <div className="mt-4 flex items-center justify-center gap-3.5">
            {swatches.map((sw, idx) => (
              <button
                key={sw.id}
                type="button"
                onClick={() => setSelectedSwatchIdx(idx)}
                title={sw.label}
                aria-label={sw.label}
                className={`w-9 h-9 rounded-full transition-transform cursor-pointer overflow-hidden border-2 ${
                  selectedSwatchIdx === idx
                    ? 'border-white scale-110 shadow-lg'
                    : 'border-white/25 opacity-80 hover:opacity-100'
                }`}
                style={
                  sw.type === 'blur'
                    ? undefined
                    : sw.type === 'gradient'
                    ? { background: `linear-gradient(180deg, ${sw.primary}, ${sw.secondary})` }
                    : { backgroundColor: sw.primary }
                }
              >
                {sw.type === 'blur' && shareImage && (
                  <img
                    src={shareImage}
                    alt=""
                    className="w-full h-full object-cover blur-[2px] scale-125"
                  />
                )}
              </button>
            ))}

            {!isArtistMode && (
              <button
                type="button"
                onClick={() => {
                  setEditorOpen((prev) => !prev);
                  if (cardTab !== 'lyrics') setCardTab('lyrics');
                }}
                title="歌詞テキストをカスタマイズ"
                aria-label="歌詞テキストをカスタマイズ"
                className={`w-9 h-9 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer ${
                  editorOpen
                    ? 'border-red-500 bg-red-600/25 text-white'
                    : 'border-white/30 bg-neutral-800 text-neutral-200 hover:border-white'
                }`}
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Expandable Lyric Line Selector / Customizer */}
          {!isArtistMode && (editorOpen || cardTab === 'lyrics') && (
            <div className="mt-4 w-full bg-neutral-900/90 border border-white/10 rounded-2xl p-3 space-y-2.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-neutral-300">
                <span>歌詞カードに表示するフレーズ（最大4行）</span>
                <button
                  type="button"
                  onClick={() => setEditorOpen((v) => !v)}
                  className="text-red-400 hover:underline cursor-pointer"
                >
                  {editorOpen ? '編集欄を閉じる' : '直接編集'}
                </button>
              </div>

              {editorOpen && (
                <textarea
                  rows={3}
                  value={selectedQuote}
                  onChange={(e) => setSelectedQuote(e.target.value)}
                  placeholder="歌詞フレーズを入力（改行可）..."
                  className="w-full bg-neutral-950 border border-white/15 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-red-500 resize-none"
                />
              )}

              {lyrics?.syncedLyrics && lyrics.syncedLyrics.length > 0 && (
                <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                  {lyrics.syncedLyrics
                    .map((l: SyncedLine, i: number) => ({ l, i }))
                    .filter(({ l }) => l.text.trim().length > 1)
                    .slice(0, 24)
                    .map(({ l, i }) => {
                      const active = selectedLineIndices.includes(i);
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => toggleLyricLine(i)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium truncate transition-colors cursor-pointer ${
                            active
                              ? 'bg-red-600 text-white font-bold'
                              : 'bg-neutral-800/70 text-neutral-300 hover:bg-neutral-700'
                          }`}
                        >
                          {l.text}
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Share Bar (IMG_0291〜0293 style) */}
        <div className="px-6 py-4 border-t border-white/10 bg-[#121216] flex items-center justify-around gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex flex-col items-center gap-1.5 text-neutral-200 hover:text-white cursor-pointer"
          >
            <div className="w-12 h-12 rounded-full bg-[#24242b] hover:bg-[#32323c] flex items-center justify-center transition-colors">
              {copiedLink ? (
                <Check className="w-5 h-5 text-red-500" />
              ) : (
                <Link2 className="w-5 h-5" />
              )}
            </div>
            <span className="text-[11px] font-semibold">
              {copiedLink ? 'コピー済' : 'リンクをコピー'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={isExporting}
            className="flex flex-col items-center gap-1.5 text-neutral-200 hover:text-white cursor-pointer"
          >
            <div className="w-12 h-12 rounded-full bg-red-600 hover:bg-red-500 text-white flex items-center justify-center shadow-lg shadow-red-600/30 transition-colors">
              <Download className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-bold">画像を保存</span>
          </button>

          <button
            type="button"
            onClick={handleOpenZeroCode}
            className="flex flex-col items-center gap-1.5 text-neutral-200 hover:text-white cursor-pointer"
          >
            <div className="w-12 h-12 rounded-full bg-[#24242b] hover:bg-[#32323c] flex items-center justify-center transition-colors">
              <QrCode className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-semibold">ZeroCode</span>
          </button>

          <button
            type="button"
            onClick={handleNativeOrImageShare}
            className="flex flex-col items-center gap-1.5 text-neutral-200 hover:text-white cursor-pointer"
          >
            <div className="w-12 h-12 rounded-full bg-[#24242b] hover:bg-[#32323c] flex items-center justify-center transition-colors">
              {copiedOther ? (
                <Check className="w-5 h-5 text-red-500" />
              ) : (
                <MoreHorizontal className="w-5 h-5" />
              )}
            </div>
            <span className="text-[11px] font-semibold">その他</span>
          </button>
        </div>
      </div>
    </div>
  );
};
