import React, { useMemo, useRef, useState } from 'react';
import { X, Copy, Check, Download, Share2, ScanLine, ArrowRight } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { SafeImage } from './SafeImage';
import { api } from '../services/api';
import { toBase64Image } from '../utils/imageBase64';

function buildZeroWaveBars(seed: string, count = 23): number[] {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    hash ^= i + 0x9e3779b9;
    hash = Math.imul(hash, 16777619);
    const edgeDamp = i === 0 || i === count - 1 ? 0.35 : 1;
    const raw = (Math.abs(hash) % 100) / 100;
    bars.push(Math.max(0.18, Math.min(1, (0.25 + raw * 0.75) * edgeDamp)));
  }
  return bars;
}

export const ZeroCodeModal: React.FC = () => {
  const {
    zeroCodeModalTarget,
    closeZeroCodeModal,
    playTrack,
    navigateTo,
    setFullScreenPlayerOpen,
    showToast,
  } = usePlayer();

  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [jumpInput, setJumpInput] = useState('');
  const [exporting, setExporting] = useState(false);
  const hiddenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const bars = useMemo(
    () => buildZeroWaveBars(zeroCodeModalTarget?.codeValue || 'zero-music', 23),
    [zeroCodeModalTarget?.codeValue]
  );

  if (!zeroCodeModalTarget) return null;

  const handleCopyUrl = () => {
    navigator.clipboard?.writeText(zeroCodeModalTarget.url).catch(() => {});
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(zeroCodeModalTarget.codeValue).catch(() => {});
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleDownloadCard = async () => {
    setExporting(true);
    try {
      const canvas = hiddenCanvasRef.current || document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 1160;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const grad = ctx.createLinearGradient(0, 0, 900, 1160);
      grad.addColorStop(0, '#2a060a');
      grad.addColorStop(0.5, '#0c0c10');
      grad.addColorStop(1, '#050507');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 900, 1160);

      // Card container
      ctx.fillStyle = '#141418';
      ctx.beginPath();
      ctx.roundRect(70, 70, 760, 1020, 44);
      ctx.fill();
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.35)';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Cover artwork
      if (zeroCodeModalTarget.imageUrl) {
        const b64 = await toBase64Image(zeroCodeModalTarget.imageUrl).catch(() => '');
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(150, 130, 600, 600, 28);
            ctx.clip();
            ctx.drawImage(img, 150, 130, 600, 600);
            ctx.restore();
            resolve();
          };
          img.onerror = () => resolve();
          img.src = b64 || zeroCodeModalTarget.imageUrl!;
        });
      }

      // ZeroCode white bar
      ctx.fillStyle = '#09090b';
      ctx.beginPath();
      ctx.roundRect(150, 765, 600, 112, 20);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Zero emblem circle
      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      ctx.arc(210, 821, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(210, 821, 10, 0, Math.PI * 2);
      ctx.fill();

      // Waveform bars
      const startX = 266;
      const barW = 10;
      const gap = 9;
      bars.forEach((h, i) => {
        const bh = Math.round(h * 68);
        ctx.fillStyle = i % 3 === 0 ? '#ef4444' : '#ffffff';
        ctx.beginPath();
        ctx.roundRect(startX + i * (barW + gap), 821 - bh / 2, barW, bh, 5);
        ctx.fill();
      });

      // Title + Subtitle
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 40px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      const titleText =
        zeroCodeModalTarget.title.length > 22
          ? `${zeroCodeModalTarget.title.slice(0, 21)}…`
          : zeroCodeModalTarget.title;
      ctx.fillText(titleText, 450, 950);

      if (zeroCodeModalTarget.subtitle) {
        ctx.fillStyle = '#a3a3a3';
        ctx.font = '500 26px -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.fillText(zeroCodeModalTarget.subtitle.slice(0, 32), 450, 995);
      }

      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, monospace';
      ctx.fillText('zero-musicコード', 450, 1048);

      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.download = `${zeroCodeModalTarget.title.replace(/[\/\\?%*:|"<>]/g, '_')}_zerocode.png`;
      a.href = url;
      a.click();
      showToast('zero-musicコード画像を保存しました', 'success', 2000);
    } finally {
      setExporting(false);
    }
  };

  const handleOpenCodeOrUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = jumpInput.trim();
    if (!raw) return;

    try {
      let targetTrackId = '';
      let targetArtistId = '';

      if (raw.startsWith('zeromusic:track:')) {
        targetTrackId = raw.replace('zeromusic:track:', '').trim();
      } else if (raw.startsWith('zeromusic:artist:')) {
        targetArtistId = raw.replace('zeromusic:artist:', '').trim();
      } else if (raw.includes('?track=')) {
        const u = new URL(raw, window.location.origin);
        targetTrackId = u.searchParams.get('track') || '';
      } else if (raw.includes('?artist=')) {
        const u = new URL(raw, window.location.origin);
        targetArtistId = u.searchParams.get('artist') || '';
      } else if (raw.startsWith('UC')) {
        targetArtistId = raw;
      } else {
        targetTrackId = raw;
      }

      if (targetArtistId) {
        closeZeroCodeModal();
        setFullScreenPlayerOpen(false);
        navigateTo('artist', targetArtistId);
        return;
      }
      if (targetTrackId) {
        const res = await api.getTrack(targetTrackId);
        if (res?.track) {
          playTrack(res.track, undefined, {
            source: 'zero-musicコードから再生中',
            subtitle: res.track.artist,
          });
          closeZeroCodeModal();
          return;
        }
      }
      showToast('該当する楽曲またはアーティストが見つかりませんでした', 'warning', 2500);
    } catch {
      showToast('コードの読み込みに失敗しました', 'warning', 2500);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={closeZeroCodeModal}
    >
      <div
        className="w-full max-w-sm bg-[#121216] border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanLine className="w-4 h-4 text-red-500" />
            <span className="text-sm font-black text-white">zero-musicコード</span>
          </div>
          <button
            type="button"
            onClick={closeZeroCodeModal}
            className="p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-white/10 cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Code Card Preview */}
          <div className="rounded-2xl bg-gradient-to-b from-[#2b070b] via-[#151519] to-[#0c0c0f] border border-red-500/25 p-5 flex flex-col items-center text-center shadow-xl">
            <div className="w-48 h-48 rounded-xl overflow-hidden bg-neutral-900 shadow-2xl mb-4">
              {zeroCodeModalTarget.imageUrl ? (
                <SafeImage
                  src={zeroCodeModalTarget.imageUrl}
                  alt={zeroCodeModalTarget.title}
                  useBase64
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-neutral-800 text-red-500 font-black text-3xl">
                  Z
                </div>
              )}
            </div>

            {/* Scannable Waveform Strip */}
            <div className="w-full px-3 py-2.5 rounded-xl bg-black/80 border border-white/10 flex items-center justify-between gap-2 mb-3">
              <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center shrink-0 shadow">
                <div className="w-2.5 h-2.5 rounded-full bg-white" />
              </div>
              <div className="flex-1 flex items-center justify-between h-8 px-1">
                {bars.map((h, i) => (
                  <span
                    key={i}
                    className={`w-[3px] rounded-full ${i % 3 === 0 ? 'bg-red-500' : 'bg-white'}`}
                    style={{ height: `${Math.round(h * 28)}px` }}
                  />
                ))}
              </div>
            </div>

            <h4 className="text-base font-black text-white line-clamp-1">
              {zeroCodeModalTarget.title}
            </h4>
            {zeroCodeModalTarget.subtitle && (
              <p className="text-xs text-neutral-400 line-clamp-1 mt-0.5">
                {zeroCodeModalTarget.subtitle}
              </p>
            )}
            <span className="mt-2 text-[10px] font-mono text-red-400 bg-red-950/50 border border-red-500/30 px-2 py-0.5 rounded-md">
              {zeroCodeModalTarget.codeValue}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleCopyCode}
              className="py-2.5 px-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-[11px] font-bold text-white flex flex-col items-center gap-1 cursor-pointer"
            >
              {copiedCode ? (
                <Check className="w-4 h-4 text-red-400" />
              ) : (
                <Copy className="w-4 h-4 text-neutral-300" />
              )}
              <span>{copiedCode ? 'コピー済' : 'コードコピー'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyUrl}
              className="py-2.5 px-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-white/10 text-[11px] font-bold text-white flex flex-col items-center gap-1 cursor-pointer"
            >
              {copiedUrl ? (
                <Check className="w-4 h-4 text-red-400" />
              ) : (
                <Share2 className="w-4 h-4 text-neutral-300" />
              )}
              <span>{copiedUrl ? 'URLコピー済' : 'リンクコピー'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadCard}
              disabled={exporting}
              className="py-2.5 px-2 rounded-xl bg-red-600 hover:bg-red-500 text-[11px] font-bold text-white flex flex-col items-center gap-1 cursor-pointer shadow-md shadow-red-600/20"
            >
              <Download className="w-4 h-4" />
              <span>{exporting ? '保存中...' : '画像を保存'}</span>
            </button>
          </div>

          {/* Open pasted ZeroCode / Share URL */}
          <form onSubmit={handleOpenCodeOrUrl} className="pt-2 border-t border-white/10 space-y-2">
            <label className="text-[11px] font-semibold text-neutral-400 block">
              受け取ったコード / URL を入力して開く
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={jumpInput}
                onChange={(e) => setJumpInput(e.target.value)}
                placeholder="zeromusic:track:... または共有URL"
                className="flex-1 bg-neutral-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-red-500"
              />
              <button
                type="submit"
                className="px-3 py-2 rounded-xl bg-white text-black hover:bg-neutral-200 text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
              >
                <span>開く</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        </div>
        <canvas ref={hiddenCanvasRef} className="hidden" />
      </div>
    </div>
  );
};
