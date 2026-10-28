import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { CaptureSource, RecordingConfig, RecordingSession, VaultItem } from '../types/ipc';
import {
  startRealCapture,
  pauseRealCapture,
  resumeRealCapture,
  stopRealCapture,
  blobToBase64,
} from '../utils/recorderEngine';

interface RecorderState {
  sources: CaptureSource[];
  selectedSourceId: string | null;
  config: RecordingConfig;
  session: RecordingSession | null;
  isRecording: boolean;
  isPaused: boolean;
  durationMs: number;
  micLevelDb: number;
  latestItem: VaultItem | null;
  error: string | null;
  isLoading: boolean;
  isCameraOn: boolean;

  fetchSources: () => Promise<void>;
  selectSource: (sourceId: string) => void;
  updateConfig: (patch: Partial<RecordingConfig>) => void;
  setIsCameraOn: (val: boolean) => void;
  toggleCamera: () => void;
  setMicLevelDb: (db: number) => void;
  startRecording: () => Promise<void>;
  startVoiceOnlyRecording: () => Promise<void>;
  pauseRecording: () => Promise<void>;
  resumeRecording: () => Promise<void>;
  stopRecording: () => Promise<VaultItem | null>;
  tickDuration: (deltaMs: number) => void;
}

const recorderChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('astral-archivist-recorder')
  : null;

export const useRecorderStore = create<RecorderState>((set, get) => {
  if (recorderChannel) {
    recorderChannel.onmessage = (event) => {
      const { type, payload } = event.data || {};
      if (type === 'SYNC_RECORDER_STATE') {
        set((state) => ({ ...state, ...payload }));
      } else if (type === 'CMD_START_RECORDING') {
        get().startRecording();
      } else if (type === 'CMD_PAUSE_RECORDING') {
        get().pauseRecording();
      } else if (type === 'CMD_RESUME_RECORDING') {
        get().resumeRecording();
      } else if (type === 'CMD_STOP_RECORDING') {
        get().stopRecording();
      } else if (type === 'CMD_TOGGLE_CAMERA') {
        get().toggleCamera();
      }
    };
  }

  const broadcastState = (patch: Partial<RecorderState>) => {
    try {
      const serializable: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (typeof v !== 'function') {
          serializable[k] = v;
        }
      }
      recorderChannel?.postMessage({
        type: 'SYNC_RECORDER_STATE',
        payload: serializable,
      });
    } catch (err) {
      console.warn('BroadcastChannel recorder sync error:', err);
    }
  };

  return {
    sources: [],
    selectedSourceId: 'monitor_0',
    config: {
      source_id: 'monitor_0',
      target_type: 'monitor',
      include_microphone: true,
      include_system_audio: true,
      fps: 60,
      resolution_scale: 1.0,
      output_format: 'mp4',
      video_bitrate_bps: 12000000,
    },
    session: null,
    isRecording: false,
    isPaused: false,
    durationMs: 0,
    micLevelDb: -42,
    latestItem: null,
    error: null,
    isLoading: false,
    isCameraOn: false,

  fetchSources: async () => {
    try {
      set({ isLoading: true, error: null });
      const sources = await invoke<CaptureSource[]>('get_capture_sources');
      set({
        sources,
        selectedSourceId: sources[0]?.id ?? 'monitor_0',
        isLoading: false,
      });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  selectSource: (sourceId: string) => {
    const src = get().sources.find((s) => s.id === sourceId);
    set((state) => ({
      selectedSourceId: sourceId,
      config: {
        ...state.config,
        source_id: sourceId,
        target_type: src?.target_type ?? 'monitor',
      },
    }));
  },

  updateConfig: (patch) => {
    set((state) => ({ config: { ...state.config, ...patch } }));
  },

  setIsCameraOn: (val: boolean) => {
    set({ isCameraOn: val });
    broadcastState({ isCameraOn: val });
  },

  toggleCamera: () => {
    const next = !get().isCameraOn;
    set({ isCameraOn: next });
    broadcastState({ isCameraOn: next });
  },

  setMicLevelDb: (db: number) => {
    set({ micLevelDb: db });
    broadcastState({ micLevelDb: db });
  },

  startRecording: async () => {
    try {
      set({ isLoading: true, error: null });
      const currentConfig = {
        ...get().config,
        target_type: get().config.target_type === 'audio_only' ? 'monitor' : get().config.target_type,
      };

      // 1. Prompt user for real capture popup FIRST with camera overlay flag
      const success = await startRealCapture(currentConfig, get().isCameraOn, () => {
        get().stopRecording();
      });

      // If user cancelled the popup or closed it, abort recording cleanly
      if (!success) {
        set({ isLoading: false, isRecording: false });
        broadcastState({ isRecording: false, isLoading: false });
        return;
      }

      // 2. Only if user accepted and stream started, create backend session
      const session = await invoke<RecordingSession>('start_recording', {
        config: currentConfig,
      });

      set({
        config: currentConfig,
        session,
        isRecording: true,
        isPaused: false,
        durationMs: 0,
        isLoading: false,
      });
      broadcastState({ isRecording: true, isPaused: false, durationMs: 0, isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false, isRecording: false });
      broadcastState({ error: String(err), isLoading: false, isRecording: false });
    }
  },

  startVoiceOnlyRecording: async () => {
    try {
      set({ isLoading: true, error: null });
      const voiceConfig: RecordingConfig = {
        ...get().config,
        source_id: 'microphone_voice',
        target_type: 'audio_only',
        include_microphone: true,
      };

      const success = await startRealCapture(voiceConfig, false, () => {
        get().stopRecording();
      });

      if (!success) {
        set({
          isLoading: false,
          isRecording: false,
          error: 'Microphone recording could not start. Please check microphone permissions in Windows Settings.',
        });
        broadcastState({ isRecording: false, isLoading: false });
        return;
      }

      const session = await invoke<RecordingSession>('start_recording', {
        config: voiceConfig,
      });

      set({
        config: voiceConfig,
        session,
        isRecording: true,
        isPaused: false,
        durationMs: 0,
        isLoading: false,
      });
      broadcastState({ isRecording: true, isPaused: false, durationMs: 0, isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false, isRecording: false });
      broadcastState({ error: String(err), isLoading: false, isRecording: false });
    }
  },

  pauseRecording: async () => {
    set({ isPaused: true });
    broadcastState({ isPaused: true });
    pauseRealCapture();
    try {
      await invoke('pause_recording');
    } catch (err) {
      console.warn('pause_recording IPC error:', err);
    }
  },

  resumeRecording: async () => {
    set({ isPaused: false });
    broadcastState({ isPaused: false });
    resumeRealCapture();
    try {
      await invoke('resume_recording');
    } catch (err) {
      console.warn('resume_recording IPC error:', err);
    }
  },

  stopRecording: async () => {
    try {
      set({ isRecording: false, isPaused: false, isLoading: true, error: null });
      broadcastState({ isRecording: false, isPaused: false, isLoading: true });
      const session = get().session;
      const durationMs = get().durationMs;
      const isAudioOnly = get().config.target_type === 'audio_only';

      const realBlob = await stopRealCapture();
      let item: VaultItem;

      if (realBlob && session) {
        const buffer = await realBlob.arrayBuffer();
        item = await invoke<VaultItem>('save_captured_recording', {
          sessionId: session.session_id,
          bytes: new Uint8Array(buffer),
          durationMs,
          isAudioOnly,
          fps: isAudioOnly ? 0 : (get().config.fps || 60),
        });
      } else {
        item = await invoke<VaultItem>('stop_recording');
      }

      set({
        session: null,
        durationMs: 0,
        latestItem: item,
        isLoading: false,
      });
      broadcastState({ session: null, durationMs: 0, isRecording: false, isLoading: false });
      return item;
    } catch (err) {
      set({ error: String(err), isLoading: false, isRecording: false, session: null });
      broadcastState({ isRecording: false, isLoading: false, session: null });
      return null;
    }
  },

  tickDuration: (deltaMs: number) => {
    if (get().isRecording && !get().isPaused) {
      const next = get().durationMs + deltaMs;
      set({ durationMs: next });
      broadcastState({ durationMs: next });
    }
  },
};
});

export const dispatchRecorderCommand = (command: 'START' | 'PAUSE' | 'RESUME' | 'STOP' | 'TOGGLE_CAMERA') => {
  if (recorderChannel) {
    if (command === 'TOGGLE_CAMERA') {
      recorderChannel.postMessage({ type: 'CMD_TOGGLE_CAMERA' });
    } else {
      recorderChannel.postMessage({ type: `CMD_${command}_RECORDING` });
    }
  }
};

