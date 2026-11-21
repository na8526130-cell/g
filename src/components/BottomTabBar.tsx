import React from 'react';
import { usePlayer } from '../context/PlayerContext';
import { Home, Search, Library, Radio, Globe } from 'lucide-react';

export const BottomTabBar: React.FC = () => {
  const { activeView, navigateTo, deviceMode, libraryTab, setLibraryTab } = usePlayer();

  if (deviceMode !== 'mobile') {
    return null;
  }

  return (
    <nav
      aria-label="モバイルナビゲーション"
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-[60px] bg-gradient-to-t from-black via-black/95 to-black/85 backdrop-blur-xl border-t border-white/5 z-40 grid grid-cols-5 items-center px-1"
    >
      <button
        type="button"
        onClick={() => navigateTo('home')}
        className={`flex flex-col items-center justify-center gap-1 min-h-[44px] py-1 px-1 transition-colors cursor-pointer ${
          activeView === 'home' ? 'text-white' : 'text-neutral-400 hover:text-neutral-200'
        }`}
      >
        <Home
          className={`w-5 h-5 transition-transform ${
            activeView === 'home' ? 'text-white scale-105 stroke-[2.4]' : 'text-neutral-400 stroke-[1.8]'
          }`}
        />
        <span
          className={`text-[10px] tracking-tight whitespace-nowrap ${
            activeView === 'home' ? 'text-white font-bold' : 'text-neutral-400 font-medium'
          }`}
        >
          ホーム
        </span>
      </button>

      <button
        type="button"
        onClick={() => navigateTo('search')}
        className={`flex flex-col items-center justify-center gap-1 min-h-[44px] py-1 px-1 transition-colors cursor-pointer ${
          activeView === 'search' ? 'text-white' : 'text-neutral-400 hover:text-neutral-200'
        }`}
      >
        <Search
          className={`w-5 h-5 transition-transform ${
            activeView === 'search' ? 'text-white scale-105 stroke-[2.4]' : 'text-neutral-400 stroke-[1.8]'
          }`}
        />
        <span
          className={`text-[10px] tracking-tight whitespace-nowrap ${
            activeView === 'search' ? 'text-white font-bold' : 'text-neutral-400 font-medium'
          }`}
        >
          検索
        </span>
      </button>

      <button
        type="button"
        onClick={() => {
          if (libraryTab === 'shared_offline') setLibraryTab('playlists');
          navigateTo('library');
        }}
        className={`flex flex-col items-center justify-center gap-1 min-h-[44px] py-1 px-1 transition-colors cursor-pointer ${
          activeView === 'library' && libraryTab !== 'shared_offline'
            ? 'text-white'
            : 'text-neutral-400 hover:text-neutral-200'
        }`}
      >
        <Library
          className={`w-5 h-5 transition-transform ${
            activeView === 'library' && libraryTab !== 'shared_offline'
              ? 'text-white scale-105 stroke-[2.4]'
              : 'text-neutral-400 stroke-[1.8]'
          }`}
        />
        <span
          className={`text-[10px] tracking-tight whitespace-nowrap ${
            activeView === 'library' && libraryTab !== 'shared_offline'
              ? 'text-white font-bold'
              : 'text-neutral-400 font-medium'
          }`}
        >
          ライブラリ
        </span>
      </button>

      <button
        type="button"
        onClick={() => {
          setLibraryTab('shared_offline');
          navigateTo('library');
        }}
        className={`flex flex-col items-center justify-center gap-1 min-h-[44px] py-1 px-1 transition-colors cursor-pointer ${
          activeView === 'library' && libraryTab === 'shared_offline'
            ? 'text-emerald-400'
            : 'text-emerald-300/80 hover:text-emerald-300'
        }`}
      >
        <Globe
          className={`w-5 h-5 transition-transform ${
            activeView === 'library' && libraryTab === 'shared_offline'
              ? 'text-emerald-400 scale-105 stroke-[2.4]'
              : 'text-emerald-400/80 stroke-[1.8]'
          }`}
        />
        <span
          className={`text-[10px] tracking-tight whitespace-nowrap ${
            activeView === 'library' && libraryTab === 'shared_offline'
              ? 'text-emerald-400 font-bold'
              : 'text-emerald-300/80 font-medium'
          }`}
        >
          共有オフ
        </span>
      </button>

      <button
        type="button"
        onClick={() => navigateTo('party')}
        className={`flex flex-col items-center justify-center gap-1 min-h-[44px] py-1 px-1 transition-colors cursor-pointer ${
          activeView === 'party' ? 'text-white' : 'text-neutral-400 hover:text-neutral-200'
        }`}
      >
        <Radio
          className={`w-5 h-5 transition-transform ${
            activeView === 'party' ? 'text-white scale-105 stroke-[2.4]' : 'text-neutral-400 stroke-[1.8]'
          }`}
        />
        <span
          className={`text-[10px] tracking-tight whitespace-nowrap ${
            activeView === 'party' ? 'text-white font-bold' : 'text-neutral-400 font-medium'
          }`}
        >
          パーティ
        </span>
      </button>
    </nav>
  );
};
