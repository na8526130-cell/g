import React, { useMemo } from 'react';
import { Smartphone, Monitor, ArrowRight, Check } from 'lucide-react';
import { DeviceMode, usePlayer } from '../context/PlayerContext';

export const DeviceModeSelector: React.FC = () => {
  const { setDeviceMode } = usePlayer();

  const recommendedMode = useMemo<DeviceMode>(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return 'mobile';
    }
    return 'pc';
  }, []);

  const handleSelect = (mode: DeviceMode) => {
    setDeviceMode(mode);
  };

  return (
    <div className="min-h-screen bg-[#070708] text-neutral-100 flex flex-col items-center justify-center px-4 py-10 relative overflow-hidden">
      {/* Ambient subtle red glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[520px] h-[520px] rounded-full bg-red-600/12 blur-[120px]" />
      </div>

      <div className="relative z-10 w-full max-w-2xl flex flex-col items-center">
        {/* Brand Emblem + Wordmark */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-black ring-1 ring-white/15 flex items-center justify-center shadow-2xl shadow-red-600/30">
            <svg viewBox="0 0 64 64" className="w-10 h-10" aria-hidden="true">
              <circle cx="32" cy="32" r="28" fill="#EF1D36" />
              <g transform="rotate(8.5 32 32)" fill="none" stroke="#000000" strokeLinecap="round">
                <path d="M 15.47 25.41 A 58.8 58.8 0 0 1 48.53 25.41" strokeWidth="4.7" />
                <path d="M 18.39 33.17 A 54.6 54.6 0 0 1 45.61 33.17" strokeWidth="3.9" />
                <path d="M 21.25 40.16 A 50.4 50.4 0 0 1 42.75 40.16" strokeWidth="3.25" />
              </g>
            </svg>
          </div>
          <span className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            zero<span className="text-red-500">-music</span>
          </span>
        </div>

        <h1 className="text-xl sm:text-2xl font-extrabold text-white text-center tracking-tight">
          表示モードを選択してスタート
        </h1>
        <p className="text-xs sm:text-sm text-neutral-400 text-center mt-2 max-w-md leading-relaxed">
          スマホ版・パソコン版のどちらで使うか選んでください。起動後も上部のボタンからいつでも切り替えられます。
        </p>

        {/* Selection Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full mt-7">
          {/* Mobile Edition Card */}
          <button
            type="button"
            onClick={() => handleSelect('mobile')}
            className={`group relative text-left rounded-2xl p-5 sm:p-6 border transition-all duration-200 cursor-pointer flex flex-col justify-between bg-[#101014]/95 hover:bg-[#15151b] active:scale-[0.99] ${
              recommendedMode === 'mobile'
                ? 'border-red-500/60 ring-1 ring-red-500/30 shadow-xl shadow-red-950/30'
                : 'border-neutral-800 hover:border-red-500/50'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="w-11 h-11 rounded-xl bg-red-600/15 border border-red-500/30 flex items-center justify-center text-red-400 group-hover:scale-105 transition-transform">
                  <Smartphone className="w-6 h-6" />
                </div>
                {recommendedMode === 'mobile' && (
                  <span className="px-2.5 py-1 rounded-full bg-red-600/20 border border-red-500/40 text-red-300 text-[10px] font-bold">
                    この端末におすすめ
                  </span>
                )}
              </div>

              <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                スマホ版
                <span className="text-[11px] font-semibold text-neutral-500">Mobile</span>
              </h2>
              <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
                片手で操作しやすいコンパクトUIと下部タブバー構成
              </p>

              <ul className="mt-4 space-y-1.5 text-xs text-neutral-300">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span>下部ナビゲーション＆ミニプレイヤー</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span>フルスクリーン再生画面へワンタップ</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span>縦画面・片手操作に最適化</span>
                </li>
              </ul>
            </div>

            <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between text-xs font-bold text-red-400 group-hover:text-red-300">
              <span>スマホ版でスタート</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>

          {/* PC Edition Card */}
          <button
            type="button"
            onClick={() => handleSelect('pc')}
            className={`group relative text-left rounded-2xl p-5 sm:p-6 border transition-all duration-200 cursor-pointer flex flex-col justify-between bg-[#101014]/95 hover:bg-[#15151b] active:scale-[0.99] ${
              recommendedMode === 'pc'
                ? 'border-red-500/60 ring-1 ring-red-500/30 shadow-xl shadow-red-950/30'
                : 'border-neutral-800 hover:border-red-500/50'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="w-11 h-11 rounded-xl bg-red-600/15 border border-red-500/30 flex items-center justify-center text-red-400 group-hover:scale-105 transition-transform">
                  <Monitor className="w-6 h-6" />
                </div>
                {recommendedMode === 'pc' && (
                  <span className="px-2.5 py-1 rounded-full bg-red-600/20 border border-red-500/40 text-red-300 text-[10px] font-bold">
                    この端末におすすめ
                  </span>
                )}
              </div>

              <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                パソコン版
                <span className="text-[11px] font-semibold text-neutral-500">Desktop</span>
              </h2>
              <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
                全機能を一覧できるデスクトップ画面＆フルプレイヤーバー
              </p>

              <ul className="mt-4 space-y-1.5 text-xs text-neutral-300">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span>上部メニュー＆常時表示の検索バー</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span>音量・EQ・歌詞・速度調整付きバー</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <span>ワイド画面でゆったり一覧表示</span>
                </li>
              </ul>
            </div>

            <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between text-xs font-bold text-red-400 group-hover:text-red-300">
              <span>パソコン版でスタート</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
