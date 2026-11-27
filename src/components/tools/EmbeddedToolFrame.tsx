import React, { useEffect, useState } from 'react';
import { Maximize2, Minimize2, RotateCw } from 'lucide-react';
import type { ToolCatalogItem } from '../../data/toolsCatalog';

interface EmbeddedToolFrameProps {
  tool: ToolCatalogItem;
}

export const EmbeddedToolFrame: React.FC<EmbeddedToolFrameProps> = ({ tool }) => {
  const defaultPath = tool.presets?.[0]?.path || tool.mountPath || '/';
  const [framePath, setFramePath] = useState(defaultPath);
  const [reloadSeq, setReloadSeq] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setFramePath(tool.presets?.[0]?.path || tool.mountPath || '/');
    setReloadSeq((n) => n + 1);
  }, [tool.id, tool.mountPath, tool.presets]);

  const frameUrl = `${framePath}${framePath.includes('?') ? '&' : '?'}_v=${reloadSeq}`;

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-[70] bg-[#070708] flex flex-col p-2 sm:p-3'
          : 'flex flex-col rounded-2xl border border-neutral-800/90 bg-[#0d0d10] overflow-hidden'
      }
    >
      {/* Compact Frame Controls Bar */}
      <div className="px-3 py-2 bg-[#121216] border-b border-neutral-800/90 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-white truncate">{tool.name}</span>
          <span className="hidden md:inline text-[11px] text-neutral-400 truncate">
            {tool.subtitle}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {tool.presets && tool.presets.length > 0 && (
            <div className="flex items-center gap-1 bg-neutral-950 p-0.5 rounded-lg border border-neutral-800 mr-1">
              {tool.presets.map((p) => {
                const active = framePath === p.path;
                return (
                  <button
                    key={p.path}
                    type="button"
                    onClick={() => {
                      setFramePath(p.path);
                      setReloadSeq((n) => n + 1);
                    }}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                      active
                        ? 'bg-red-600 text-white'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => setReloadSeq((n) => n + 1)}
            className="px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-medium text-neutral-200 flex items-center gap-1.5 cursor-pointer transition-colors"
            title="ツールを再読み込み"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">再読込</span>
          </button>

          <button
            type="button"
            onClick={() => setIsFullscreen((f) => !f)}
            className="px-2.5 py-1 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-xs font-medium text-neutral-200 flex items-center gap-1.5 cursor-pointer transition-colors"
            title={isFullscreen ? '全画面を終了' : '全画面表示'}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-red-400" />
                <span>縮小</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">全画面</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Embedded Viewport */}
      <div className={isFullscreen ? 'flex-1 min-h-0 mt-2 rounded-xl overflow-hidden bg-black' : 'w-full h-[68vh] min-h-[480px] bg-black'}>
        <iframe
          key={`${tool.id}-${reloadSeq}-${framePath}`}
          src={frameUrl}
          title={tool.name}
          className="w-full h-full border-0 bg-black"
          allow="autoplay; fullscreen; gamepad; clipboard-read; clipboard-write"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-modals"
        />
      </div>
    </div>
  );
};
