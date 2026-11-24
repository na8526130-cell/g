import React, { useEffect, useState } from 'react';
import { WifiOff, HardDrive, Globe, Play } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { usePlayer } from '../context/PlayerContext';
import {
  getAllOfflineTracks,
  getAllCachedSharedTracks,
  OFFLINE_TRACKS_CHANGED_EVENT,
  SHARED_OFFLINE_CHANGED_EVENT,
} from '../services/offlineStorage';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const { navigateTo, setLibraryTab, cachedOfflineIds, playAllOfflineSavedTracks } = usePlayer();
  const [localCount, setLocalCount] = useState(0);
  const [sharedCount, setSharedCount] = useState(0);

  useEffect(() => {
    if (isOnline) return;
    let active = true;
    const loadCounts = async () => {
      const [loc, sh] = await Promise.all([
        getAllOfflineTracks().catch(() => []),
        getAllCachedSharedTracks().catch(() => []),
      ]);
      if (active) {
        setLocalCount(loc.length);
        setSharedCount(sh.length);
      }
    };
    loadCounts();
    window.addEventListener(OFFLINE_TRACKS_CHANGED_EVENT, loadCounts);
    window.addEventListener(SHARED_OFFLINE_CHANGED_EVENT, loadCounts);
    return () => {
      active = false;
      window.removeEventListener(OFFLINE_TRACKS_CHANGED_EVENT, loadCounts);
      window.removeEventListener(SHARED_OFFLINE_CHANGED_EVENT, loadCounts);
    };
  }, [isOnline]);

  if (isOnline) return null;

  const totalPlayable = localCount + cachedOfflineIds.size + sharedCount;

  return (
    <aside
      aria-label="オフライン状態通知"
      className="fixed top-18 sm:top-20 left-1/2 -translate-x-1/2 z-40 max-w-2xl w-[94%] sm:w-auto animate-in slide-in-from-top-3 duration-300 pointer-events-auto"
    >
      <div className="bg-amber-950/92 backdrop-blur-xl border border-amber-600/50 text-amber-100 px-3.5 py-2 rounded-2xl shadow-2xl flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm font-medium ring-1 ring-amber-500/30">
        <div className="flex items-center gap-2">
          <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            オフラインモード
            {totalPlayable > 0 ? `（${totalPlayable}曲が再生可能）` : '（キャッシュ動作中）'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          {totalPlayable > 0 && (
            <button
              type="button"
              onClick={() => playAllOfflineSavedTracks(true)}
              className="min-h-[34px] px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 shadow"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>オフライン再生</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setLibraryTab('local');
              navigateTo('library');
            }}
            className="min-h-[34px] px-2.5 py-1 bg-amber-600/40 hover:bg-amber-600/60 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
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
            className="min-h-[34px] px-2.5 py-1 bg-emerald-600/45 hover:bg-emerald-600/70 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>共有オフライン</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
