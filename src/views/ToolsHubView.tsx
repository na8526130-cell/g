import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Gamepad2,
  Headphones,
  Layers,
  Wrench,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import {
  TOOL_CATEGORIES,
  TOOLS_CATALOG,
  type ToolCategoryId,
  type ToolId,
} from '../data/toolsCatalog';
import { SoundCloakTool } from '../components/tools/SoundCloakTool';
import { NikonikoTool } from '../components/tools/NikonikoTool';
import { EmbeddedToolFrame } from '../components/tools/EmbeddedToolFrame';

export const ToolsHubView: React.FC = () => {
  const { navigateTo } = usePlayer();
  const [selectedCategory, setSelectedCategory] = useState<ToolCategoryId>('all');
  const [activeToolId, setActiveToolId] = useState<ToolId>('soundcloak');

  const filteredTools = useMemo(() => {
    if (selectedCategory === 'all') return TOOLS_CATALOG;
    return TOOLS_CATALOG.filter((item) => item.category === selectedCategory);
  }, [selectedCategory]);

  const activeTool = useMemo(
    () => TOOLS_CATALOG.find((item) => item.id === activeToolId) || TOOLS_CATALOG[0],
    [activeToolId]
  );

  const handleCategoryChange = (cat: ToolCategoryId) => {
    setSelectedCategory(cat);
    if (cat !== 'all') {
      const firstInCat = TOOLS_CATALOG.find((t) => t.category === cat);
      if (firstInCat && activeTool.category !== cat) {
        setActiveToolId(firstInCat.id);
      }
    }
  };

  const getCategoryIcon = (cat: Exclude<ToolCategoryId, 'all'>) => {
    if (cat === 'media') return <Headphones className="w-3.5 h-3.5" />;
    if (cat === 'games') return <Gamepad2 className="w-3.5 h-3.5" />;
    return <BookOpen className="w-3.5 h-3.5" />;
  };

  return (
    <section className="space-y-4">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-800/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-600/15 border border-red-500/30 flex items-center justify-center shrink-0">
            <Wrench className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
              ツール
              <span className="text-xs font-mono font-semibold text-neutral-400 bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded-md">
                {TOOLS_CATALOG.length} サイト内蔵
              </span>
            </h1>
            <p className="text-xs text-neutral-400">
              zero-music の音楽プレイヤーを残したまま、動画・音楽・ゲーム・マンガをタブで切り替えできます
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigateTo('home')}
          className="self-start sm:self-auto px-3 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-semibold text-neutral-200 flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-red-400" />
          <span>音楽ホームに戻る</span>
        </button>
      </div>

      {/* Category Filter Row + Direct 11-Site Tab Strip */}
      <div className="space-y-2.5 bg-[#0c0c0f] border border-neutral-800/80 rounded-2xl p-3">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="text-[11px] font-semibold text-neutral-500 mr-1 flex items-center gap-1 shrink-0">
            <Layers className="w-3.5 h-3.5" />
            カテゴリ:
          </span>
          {TOOL_CATEGORIES.map((cat) => {
            const count =
              cat.id === 'all'
                ? TOOLS_CATALOG.length
                : TOOLS_CATALOG.filter((t) => t.category === cat.id).length;
            const active = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategoryChange(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-1.5 ${
                  active
                    ? 'bg-red-600 text-white'
                    : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                <span>{cat.label}</span>
                <span
                  className={`text-[10px] font-mono px-1 rounded ${
                    active ? 'bg-black/25 text-white' : 'bg-neutral-800 text-neutral-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* All Matching Site Tabs */}
        <div
          role="tablist"
          aria-label="内蔵ツールサイト一覧"
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1 border-t border-neutral-800/70"
        >
          {filteredTools.map((tool) => {
            const isActive = activeTool.id === tool.id;
            return (
              <button
                key={tool.id}
                role="tab"
                aria-selected={isActive}
                type="button"
                onClick={() => setActiveToolId(tool.id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 border shrink-0 ${
                  isActive
                    ? 'bg-white text-black border-white shadow-sm'
                    : 'bg-neutral-950 text-neutral-300 border-neutral-800 hover:border-neutral-700 hover:text-white'
                }`}
              >
                <span className={isActive ? 'text-red-600' : 'text-neutral-400'}>
                  {getCategoryIcon(tool.category)}
                </span>
                <span>{tool.shortName}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Tool Workspace */}
      <div>
        {activeTool.id === 'soundcloak' ? (
          <SoundCloakTool />
        ) : activeTool.id === 'nikoniko' ? (
          <NikonikoTool />
        ) : (
          <EmbeddedToolFrame tool={activeTool} />
        )}
      </div>
    </section>
  );
};
