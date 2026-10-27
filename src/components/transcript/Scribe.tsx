import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Sparkles, Download, FileText, CheckCircle2 } from 'lucide-react';
import { useTimelineStore } from '../../store/useTimelineStore';
import type { TranscriptData, WordToken } from '../../types/ipc';

interface ScribeProps {
  recordingId: string;
}

export const Scribe: React.FC<ScribeProps> = ({ recordingId }) => {
  const [data, setData] = useState<TranscriptData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { cutInterval, setPlayhead } = useTimelineStore();

  useEffect(() => {
    const fetchTranscript = async () => {
      try {
        setIsLoading(true);
        const res = await invoke<TranscriptData>('run_transcription', { recordingId });
        setData(res);
      } catch (err) {
        console.warn('Transcription error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    if (recordingId) fetchTranscript();
  }, [recordingId]);

  const handleStrikeWord = (token: WordToken) => {
    if (token.is_deleted) return;
    token.is_deleted = true;
    cutInterval(token.start_ms, token.end_ms);
    setData(data ? { ...data } : null);
  };

  const exportSrt = () => {
    if (!data) return;
    let srtContent = '';
    data.segments.forEach((seg, i) => {
      srtContent += `${i + 1}\n00:00:00,000 --> 00:00:05,000\n${seg.text}\n\n`;
    });
    const blob = new Blob([srtContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript_${recordingId}.srt`;
    a.click();
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/40 p-6 text-sm text-amber-400">
        <Sparkles className="h-4 w-4 animate-spin" />
        <span>Inscribing speech through local Whisper engine...</span>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-500/25 bg-black/15 p-5 backdrop-blur-md shadow-xl text-slate-100">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-astral-amber" />
          <span className="text-xs font-semibold uppercase tracking-wider text-astral-amber">
            The Scribe of Kamar-Taj (Transcript-Driven Edit)
          </span>
        </div>
        <button
          onClick={exportSrt}
          className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:text-white border border-slate-700"
          title="Export SubRip Subtitles"
        >
          <Download className="h-3 w-3" />
          <span>Export .SRT</span>
        </button>
      </div>

      {/* Word-by-word token interaction canvas */}
      <div className="flex flex-wrap gap-1.5 p-3 rounded-lg bg-black/25 border border-amber-500/20 text-sm leading-relaxed backdrop-blur-sm">
        {data.segments.flatMap((seg) =>
          seg.words.map((token, idx) => (
            <span
              key={`${token.word}_${idx}`}
              onClick={() => setPlayhead(token.start_ms)}
              onDoubleClick={() => handleStrikeWord(token)}
              title="Click to seek • Double-click to strike & cut from video"
              className={`cursor-pointer rounded px-1.5 py-0.5 transition-all select-none ${
                token.is_deleted
                  ? 'line-through text-red-400/60 bg-red-950/20'
                  : token.is_filler
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'hover:bg-slate-700/60 hover:text-astral-amber text-slate-200'
              }`}
            >
              {token.word}
            </span>
          )),
        )}
      </div>

      {/* Structured Summary Card */}
      <div className="flex flex-col gap-1.5 rounded-lg border border-amber-500/20 bg-black/25 p-3 text-xs text-slate-300 backdrop-blur-sm">
        <div className="flex items-center gap-1.5 text-astral-amber font-semibold">
          <FileText className="h-3.5 w-3.5" />
          <span>Archival Summary</span>
        </div>
        <p className="text-slate-400">{data.summary.overview}</p>
        <div className="flex flex-wrap gap-2 mt-1">
          {data.summary.action_items.map((item, i) => (
            <span key={i} className="flex items-center gap-1 text-[11px] text-slate-300">
              <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
