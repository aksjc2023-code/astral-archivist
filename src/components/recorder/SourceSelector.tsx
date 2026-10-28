import React, { useState, useMemo } from 'react';
import { Monitor, AppWindow, RefreshCw, Search } from 'lucide-react';
import type { CaptureSource } from '../../types/ipc';

export interface SourceSelectorProps {
  sources: CaptureSource[];
  selectedSourceId: string | null;
  isRecording: boolean;
  onSelectSource: (sourceId: string) => void;
  onRefresh?: () => void;
}

export const SourceSelector: React.FC<SourceSelectorProps> = ({
  sources,
  selectedSourceId,
  isRecording,
  onSelectSource,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'monitor' | 'window'>('monitor');
  const [searchQuery, setSearchQuery] = useState('');

  const monitorSources = useMemo(
    () => sources.filter((s) => s.target_type === 'monitor'),
    [sources]
  );

  const windowSources = useMemo(
    () =>
      sources
        .filter((s) => s.target_type === 'window')
        .filter((s) =>
          searchQuery
            ? s.name.toLowerCase().includes(searchQuery.toLowerCase())
            : true
        ),
    [sources, searchQuery]
  );

  const currentTabSources = activeTab === 'monitor' ? monitorSources : windowSources;

  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-slate-800/80 bg-black/40 p-3 backdrop-blur-md">
      {/* Tab Switcher & Controls */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('monitor')}
            disabled={isRecording}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
              activeTab === 'monitor'
                ? 'bg-amber-500/20 text-astral-amber border border-amber-500/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Monitor className="h-3.5 w-3.5" />
            <span>Entire Screen ({monitorSources.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('window')}
            disabled={isRecording}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-semibold transition-all ${
              activeTab === 'window'
                ? 'bg-amber-500/20 text-astral-amber border border-amber-500/50 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <AppWindow className="h-3.5 w-3.5" />
            <span>Windows ({sources.filter((s) => s.target_type === 'window').length})</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {activeTab === 'window' && (
            <div className="relative">
              <Search className="absolute left-2 top-1.5 h-3 w-3 text-slate-500" />
              <input
                type="text"
                placeholder="Search windows..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={isRecording}
                className="w-36 rounded-md bg-slate-900/80 border border-slate-700/60 pl-6 pr-2 py-0.5 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
              />
            </div>
          )}

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRecording}
              className="p-1 rounded text-slate-400 hover:text-astral-amber hover:bg-slate-800/60 transition-colors"
              title="Refresh available screens and windows"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Sources Grid / Scrollable List */}
      <div className="max-h-48 overflow-y-auto pr-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {currentTabSources.length === 0 ? (
          <div className="col-span-2 py-4 text-center text-xs text-slate-500">
            {activeTab === 'window'
              ? searchQuery
                ? `No open windows match "${searchQuery}"`
                : 'No open application windows detected. Click Refresh or open an app.'
              : 'No monitors detected.'}
          </div>
        ) : (
          currentTabSources.map((source) => {
            const isSelected = selectedSourceId === source.id;
            const Icon = source.target_type === 'monitor' ? Monitor : AppWindow;

            return (
              <button
                key={source.id}
                type="button"
                onClick={() => onSelectSource(source.id)}
                disabled={isRecording}
                className={`flex items-center gap-2.5 rounded-lg border p-2 text-left transition-all ${
                  isSelected
                    ? 'border-amber-500/80 bg-amber-500/20 text-slate-100 shadow-md shadow-amber-500/10'
                    : 'border-slate-800/60 bg-black/30 text-slate-400 hover:bg-slate-900/60 hover:text-slate-200'
                } disabled:opacity-40`}
                title={`${source.name} (${source.width}x${source.height})`}
              >
                <div
                  className={`p-1.5 rounded-md ${
                    isSelected ? 'bg-amber-500/30 text-astral-amber' : 'bg-slate-800/40 text-slate-400'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-slate-200">
                    {source.name}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span>{source.width}x{source.height}</span>
                    {source.is_primary && (
                      <span className="text-astral-amber font-semibold">Primary</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
