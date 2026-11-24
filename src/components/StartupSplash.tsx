import React, { useCallback, useEffect, useRef, useState } from 'react';

const STARTUP_SPLASH_STORAGE_KEY = 'zm_startup_splash_enabled';
const REPLAY_SPLASH_EVENT = 'zero-music:replay-splash';

export function isStartupSplashEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(STARTUP_SPLASH_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setStartupSplashEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STARTUP_SPLASH_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage restriction errors
  }
}

export function triggerStartupSplashReplay(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(REPLAY_SPLASH_EVENT));
}

export const StartupSplash: React.FC = () => {
  const [visible, setVisible] = useState<boolean>(() => isStartupSplashEnabled());
  const [exiting, setExiting] = useState<boolean>(false);
  const [runKey, setRunKey] = useState<number>(0);
  const [isOffline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  const exitTimerRef = useRef<number | null>(null);
  const unmountTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    if (unmountTimerRef.current !== null) {
      window.clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimers();
    setExiting(true);
    unmountTimerRef.current = window.setTimeout(() => {
      setVisible(false);
      setExiting(false);
    }, 280);
  }, [clearTimers]);

  const scheduleAutoDismiss = useCallback(() => {
    clearTimers();
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const holdDuration = prefersReducedMotion ? 520 : 1420;
    exitTimerRef.current = window.setTimeout(() => {
      dismiss();
    }, holdDuration);
  }, [clearTimers, dismiss]);

  useEffect(() => {
    if (!visible) return;
    scheduleAutoDismiss();
    return clearTimers;
  }, [visible, runKey, scheduleAutoDismiss, clearTimers]);

  useEffect(() => {
    const handleReplay = () => {
      clearTimers();
      setExiting(false);
      setRunKey((k) => k + 1);
      setVisible(true);
    };

    window.addEventListener(REPLAY_SPLASH_EVENT, handleReplay);
    return () => window.removeEventListener(REPLAY_SPLASH_EVENT, handleReplay);
  }, [clearTimers]);

  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        dismiss();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, dismiss]);

  if (!visible) return null;

  return (
    <div
      key={runKey}
      role="dialog"
      aria-modal="true"
      aria-label="ZeroMusic 起動画面"
      onClick={dismiss}
      className={`fixed inset-0 z-[120] bg-[#070708] text-neutral-100 flex flex-col items-center justify-between px-6 pt-[max(env(safe-area-inset-top),24px)] pb-[max(env(safe-area-inset-bottom),28px)] select-none overflow-hidden transition-[opacity,transform] duration-300 ease-out ${
        exiting ? 'opacity-0 scale-[1.02] pointer-events-none' : 'opacity-100 scale-100 cursor-pointer'
      }`}
    >
      {/* Top spacer for balanced vertical optical centering */}
      <div className="h-8 shrink-0" aria-hidden="true" />

      {/* Center Stage: Acoustic Halo + Brand Disc + Wordmark */}
      <div className="relative flex flex-col items-center justify-center text-center">
        {/* Ambient Radial Glow */}
        <div
          aria-hidden="true"
          className="zm-splash-halo pointer-events-none absolute -top-20 w-72 h-72 sm:w-96 sm:h-96 rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(239,29,54,0.22) 0%, rgba(239,29,54,0.06) 46%, rgba(7,7,8,0) 74%)',
          }}
        />

        {/* Expanding Resonance Ring */}
        <div className="relative flex items-center justify-center">
          <div
            aria-hidden="true"
            className="zm-splash-ring pointer-events-none absolute w-28 h-28 sm:w-32 sm:h-32 rounded-[32px] border border-[#EF1D36]/45"
          />

          {/* Brand Icon Tile */}
          <div className="zm-splash-badge relative w-[84px] h-[84px] sm:w-24 sm:h-24 rounded-[22px] sm:rounded-[26px] bg-black ring-1 ring-white/15 flex items-center justify-center shadow-[0_24px_60px_rgba(239,29,54,0.28)]">
            <svg viewBox="0 0 64 64" className="w-[66px] h-[66px] sm:w-[76px] sm:h-[76px]" aria-hidden="true">
              <circle cx="32" cy="32" r="28" fill="#EF1D36" />
              <g transform="rotate(8.5 32 32)" fill="none" stroke="#000000" strokeLinecap="round">
                <path
                  d="M 15.47 25.41 A 58.8 58.8 0 0 1 48.53 25.41"
                  strokeWidth="4.7"
                  pathLength={1}
                  className="zm-splash-wave-1"
                />
                <path
                  d="M 18.39 33.17 A 54.6 54.6 0 0 1 45.61 33.17"
                  strokeWidth="3.9"
                  pathLength={1}
                  className="zm-splash-wave-2"
                />
                <path
                  d="M 21.25 40.16 A 50.4 50.4 0 0 1 42.75 40.16"
                  strokeWidth="3.25"
                  pathLength={1}
                  className="zm-splash-wave-3"
                />
              </g>
            </svg>
          </div>
        </div>

        {/* Display Wordmark */}
        <h1 className="zm-splash-wordmark mt-6 text-3xl sm:text-4xl font-black tracking-tight text-white">
          zero<span className="text-[#EF1D36]">-music</span>
        </h1>

        {/* Concise Restrained Tagline */}
        <p className="zm-splash-subtitle mt-2 text-xs sm:text-sm font-medium tracking-wide text-neutral-400">
          {isOffline ? 'オフラインライブラリ準備完了' : '音楽を、もっと自由に'}
        </p>
      </div>

      {/* Bottom Progress Sweep & Accessible Skip Action */}
      <div className="w-full max-w-[200px] flex flex-col items-center gap-3 shrink-0">
        <div
          aria-hidden="true"
          className="w-36 h-[2px] rounded-full bg-white/10 overflow-hidden"
        >
          <div className="zm-splash-progress h-full w-full bg-gradient-to-r from-[#EF1D36] to-rose-400" />
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          className="min-h-[44px] px-4 inline-flex items-center justify-center text-[11px] font-medium tracking-wide text-neutral-500 hover:text-neutral-200 transition-colors cursor-pointer focus:outline-none focus-visible:text-white"
        >
          タップしてスキップ
        </button>
      </div>
    </div>
  );
};
