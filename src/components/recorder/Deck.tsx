import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Square, RefreshCw, AlertCircle, Camera, CameraOff, Mic, Volume2 } from 'lucide-react';
import { useRecorderStore } from '../../store/useRecorderStore';
import { useVaultStore } from '../../store/useVaultStore';
import { SourceSelector } from './SourceSelector';
import { getMicLevelDb } from '../../utils/recorderEngine';

export const Deck: React.FC = () => {
  const {
    sources, selectedSourceId, selectSource, fetchSources,
    config, isRecording, isPaused, durationMs, error, isLoading,
    isCameraOn, toggleCamera, updateConfig, setMicLevelDb,
    startRecording, startVoiceOnlyRecording, pauseRecording, resumeRecording, stopRecording, tickDuration,
  } = useRecorderStore();

  const fetchRecordings = useVaultStore((s) => s.fetchRecordings);
  const timerRef = useRef<number | null>(null);
  const [micDb, setMicDb] = useState<number>(-100);

  // Fetch capture sources on mount
  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  // Duration timer & live mic level polling during recording
  useEffect(() => {
    let micPollId: number | null = null;

    if (isRecording && !isPaused) {
      timerRef.current = window.setInterval(() => {
        tickDuration(200);
      }, 200);

      micPollId = window.setInterval(() => {
        const level = getMicLevelDb();
        setMicDb(level);
        setMicLevelDb(level);
      }, 80);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (micPollId) {
        clearInterval(micPollId);
        micPollId = null;
      }
      setMicDb(-100);
      setMicLevelDb(-100);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (micPollId) clearInterval(micPollId);
    };
  }, [isRecording, isPaused, tickDuration]);

  const handleStop = async () => {
    await stopRecording();
    await fetchRecordings();
  };

  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const tenths = Math.floor((ms % 1000) / 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${tenths}`;
  };

  // Compute 0-100% normalized mic volume for meter
  const micNormalizedPercent = Math.max(0, Math.min(100, Math.round(((micDb + 60) / 60) * 100)));

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-amber-500/25 bg-black/20 p-5 backdrop-blur-md shadow-2xl">
      {/* Top Deck Title & Real-Time Status Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-astral-amber">
            Astrolabe Capture Deck
          </span>
          {isRecording && (
            <span
              className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                config.target_type === 'audio_only'
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                  : 'bg-red-500/20 text-red-300 border-red-500/40'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full animate-ping ${
                  config.target_type === 'audio_only' ? 'bg-purple-400' : 'bg-red-500'
                }`}
              />
              {config.target_type === 'audio_only'
                ? isPaused
                  ? 'VOICE PAUSED'
                  : 'VOICE REC'
                : isPaused
                ? 'PAUSED'
                : 'REC'}
            </span>
          )}
        </div>

        {/* Live Mic Activity Visualizer */}
        {isRecording && config.include_microphone && (
          <div className="flex items-center gap-1.5 bg-black/40 border border-slate-800 px-2 py-1 rounded-md text-[10px]">
            <Volume2 className="h-3 w-3 text-astral-amber animate-pulse" />
            <span className="text-slate-400 font-mono">Mic:</span>
            <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-amber-500 transition-all duration-75"
                style={{ width: `${micNormalizedPercent}%` }}
              />
            </div>
            <span className="text-slate-400 font-mono text-[9px] w-6 text-right">
              {micDb > -90 ? `${Math.round(micDb)}dB` : 'mute'}
            </span>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-950/60 border border-red-800/80 p-2.5 text-xs text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Capture Source Selector (Entire Screen vs Specific Windows) */}
      <SourceSelector
        sources={sources}
        selectedSourceId={selectedSourceId}
        isRecording={isRecording}
        onSelectSource={selectSource}
        onRefresh={fetchSources}
      />

      {/* Controls: Audio + Camera Overlay Toggle + FPS */}
      <div className="flex items-center justify-between border-t border-slate-700/40 pt-3 text-xs text-slate-200">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={config.include_microphone}
              disabled={isRecording}
              onChange={(e) => updateConfig({ include_microphone: e.target.checked })}
              className="accent-astral-amber rounded"
            />
            <span>Microphone Audio</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={config.include_system_audio}
              disabled={isRecording}
              onChange={(e) => updateConfig({ include_system_audio: e.target.checked })}
              className="accent-astral-amber rounded"
            />
            <span>System Audio</span>
          </label>
          <button
            type="button"
            onClick={toggleCamera}
            className={`flex items-center gap-1 px-2.5 py-1 rounded border text-[11px] font-semibold transition-all ${
              isCameraOn
                ? 'border-amber-500/80 bg-amber-500/20 text-astral-amber shadow-sm'
                : 'border-slate-700/60 bg-black/20 text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Webcam Overlay inclusion in recording"
          >
            {isCameraOn ? <Camera className="h-3 w-3" /> : <CameraOff className="h-3 w-3" />}
            <span>Webcam {isCameraOn ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        {/* Configurable Visual Fidelity: Framerate & Quality Presets */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Framerate Selector */}
          <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-lg border border-slate-700/50 backdrop-blur-sm">
            <span className="text-[10px] text-slate-400 uppercase font-mono px-1">FPS:</span>
            {([24, 30, 60, 120] as const).map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => updateConfig({ fps: rate })}
                disabled={isRecording}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                  config.fps === rate
                    ? 'bg-amber-500/20 text-astral-amber border border-amber-500/50 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={`Record at ${rate} FPS`}
              >
                {rate}
              </button>
            ))}
          </div>

          {/* Quality Bitrate Preset Selector */}
          <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-lg border border-slate-700/50 backdrop-blur-sm">
            <span className="text-[10px] text-slate-400 uppercase font-mono px-1">Fidelity:</span>
            {[
              { label: 'Draft', bps: 3_000_000 },
              { label: 'Std', bps: 8_000_000 },
              { label: 'High', bps: 16_000_000 },
              { label: 'Master', bps: 32_000_000 },
            ].map((tier) => {
              const active = (config.video_bitrate_bps || 12_000_000) === tier.bps;
              return (
                <button
                  key={tier.label}
                  type="button"
                  onClick={() => updateConfig({ video_bitrate_bps: tier.bps })}
                  disabled={isRecording}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                    active
                      ? 'bg-amber-500/20 text-astral-amber border border-amber-500/50 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title={`${tier.label} encoding bitrate (${tier.bps / 1_000_000} Mbps)`}
                >
                  {tier.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Action Transport Bar */}
      <div className="flex items-center justify-between border-t border-slate-700/40 pt-3">
        <div className="font-mono text-lg font-bold tracking-wider text-slate-100">
          {formatTime(durationMs)}
        </div>

        <div className="flex items-center gap-2">
          {!isRecording ? (
            <>
              {/* Separate Button for Voice Only Record */}
              <button
                type="button"
                onClick={startVoiceOnlyRecording}
                disabled={isLoading}
                className="flex items-center gap-2 rounded-lg border border-purple-500/50 bg-purple-950/40 px-3.5 py-2 text-xs font-semibold text-purple-200 hover:bg-purple-900/60 hover:border-purple-400 hover:text-white transition-all shadow-md shadow-purple-950/30 active:scale-95 disabled:opacity-50"
                title="Record Microphone Audio Only (Podcasting / Voice notes)"
              >
                <Mic className="h-4 w-4 text-purple-400" />
                <span>Voice Only</span>
              </button>

              {/* Primary Screen / Window Record Button */}
              <button
                type="button"
                onClick={startRecording}
                disabled={isLoading}
                className="flex items-center gap-2 rounded-lg bg-astral-amber px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-all shadow-lg shadow-astral-amber/20 active:scale-95 disabled:opacity-50"
                title="Record Selected Screen or Window"
              >
                <Play className="h-4 w-4 fill-slate-950" />
                <span>
                  {config.target_type === 'window' ? 'Record Window' : 'Record Screen'}
                </span>
              </button>
            </>
          ) : (
            <>
              {isPaused ? (
                <button
                  type="button"
                  onClick={resumeRecording}
                  className="flex items-center gap-1.5 rounded-lg border border-astral-amber/40 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-astral-amber hover:bg-slate-800/80 transition-all"
                >
                  <Play className="h-3.5 w-3.5 fill-astral-amber" />
                  <span>Resume</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={pauseRecording}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-900/60 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800/80 transition-all"
                >
                  <Pause className="h-3.5 w-3.5" />
                  <span>Pause</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleStop}
                disabled={isLoading}
                className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 transition-all shadow-lg shadow-red-600/20 active:scale-95 disabled:opacity-70"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Square className="h-3.5 w-3.5 fill-white" />
                    <span>Stop & Vault</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
