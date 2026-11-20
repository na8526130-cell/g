import React from 'react';
import { WifiOff, HardDrive, Globe } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { usePlayer } from '../context/PlayerContext';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const { navigateTo, setLibraryTab } = usePlayer();

  if (isOnline) return null;

  return (
    <aside
      aria-label="オフライン状態通知"
      className="fixed top-18 sm:top-20 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[94%] sm:w-auto animate-in slide-in-from-top-3 duration-300 pointer-events-auto"
    >
      <div className="bg-amber-950/90 backdrop-blur-xl border border-amber-600/50 text-amber-200 px-3.5 py-2 rounded-2xl shadow-2xl flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm font-medium ring-1 ring-amber-500/30">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
          <span>オフライン動作中（保存・同期済みの曲を再生可能）</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setLibraryTab('local');
              navigateTo('library');
            }}
            className="px-2.5 py-1 bg-amber-600/40 hover:bg-amber-600/60 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>オフライン</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setLibraryTab('shared_offline');
              navigateTo('library');
            }}
            className="px-2.5 py-1 bg-emerald-600/45 hover:bg-emerald-600/70 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>共有オフライン</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
