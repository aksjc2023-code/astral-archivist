import React from 'react';
import { Monitor, AppWindow } from 'lucide-react';
import type { CaptureSource } from '../../types/ipc';

interface SourceSelectorProps {
  sources: CaptureSource[];
  selectedSourceId: string | null;
  isRecording: boolean;
  onSelectSource: (sourceId: string) => void;
}

export const SourceSelector: React.FC<SourceSelectorProps> = ({
  sources,
  selectedSourceId,
  isRecording,
  onSelectSource,
}) => {
  const visualSources = sources.filter((s) => s.target_type !== 'audio_only');

  return (
    <div className="grid grid-cols-2 gap-2">
      {visualSources.slice(0, 4).map((source) => {
        const isSelected = selectedSourceId === source.id;
        const Icon = source.target_type === 'monitor' ? Monitor : AppWindow;

        return (
          <button
            key={source.id}
            onClick={() => onSelectSource(source.id)}
            disabled={isRecording}
            className={`flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-all backdrop-blur-sm ${
              isSelected
                ? 'border-amber-500/70 bg-amber-500/20 text-slate-100 shadow-md shadow-amber-500/10'
                : 'border-slate-800/50 bg-black/20 text-slate-400 hover:bg-black/30 hover:text-slate-200'
            } disabled:opacity-40`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${isSelected ? 'text-astral-amber' : 'text-slate-500'}`} />
            <div className="truncate text-xs">
              <div className="font-medium truncate">{source.name}</div>
              <div className="text-[10px] text-slate-500 capitalize">
                {source.target_type.replace('_', ' ')}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};
