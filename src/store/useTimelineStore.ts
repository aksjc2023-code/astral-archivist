import { create } from 'zustand';
import type { ProjectEdl, ClipSegment, TimelineTrack } from '../types/ipc';
import type { BRollClip, KineticTitleClip, AudioDuckingConfig, WordToken } from '../editor/core/types';
import { deriveAnchoredBounds } from '../editor/core/types';

export interface TimelineState {
  edl: ProjectEdl | null;
  activePlayheadMs: number;
  activePlayheadSec: number;
  selectedSegmentId: string | null;
  isPlaying: boolean;

  // Multi-Track Overlays bound to Word Token IDs (Phase 2)
  bRollClips: BRollClip[];
  titleClips: KineticTitleClip[];
  duckingConfig: AudioDuckingConfig;
  activeSpeechRanges: { start: number; end: number }[];

  // Actions
  initEdl: (projectId: string, title: string, durationMs: number) => void;
  clearEdl: () => void;
  cutInterval: (startMs: number, endMs: number) => void;
  setPlayhead: (posMs: number) => void;
  setPlayheadSec: (posSec: number) => void;
  togglePlay: () => void;
  setIsPlaying: (playing: boolean) => void;
  toggleSegmentMute: (segmentId: string) => void;

  // Phase 2: B-Roll Actions
  addBRollClip: (clip: Omit<BRollClip, 'id'>) => string;
  updateBRollClip: (id: string, patch: Partial<BRollClip>) => void;
  removeBRollClip: (id: string) => void;

  // Phase 2: Kinetic Title Actions
  addTitleClip: (clip: Omit<KineticTitleClip, 'id'>) => string;
  updateTitleClip: (id: string, patch: Partial<KineticTitleClip>) => void;
  removeTitleClip: (id: string) => void;

  // Phase 2: Audio Ducking Actions
  setDuckingConfig: (patch: Partial<AudioDuckingConfig>) => void;
  addDuckingSpan: (span: { start: number; end: number; anchorWordIdStart?: string; anchorWordIdEnd?: string }) => string;
  removeDuckingSpan: (spanId: string) => void;

  // Phase 2: Re-anchor Multi-Track Bounds when preceding words are purged
  syncAnchoredOverlays: (tokens: readonly WordToken[]) => void;
}

const DEFAULT_DUCKING_CONFIG: AudioDuckingConfig = {
  id: 'duck_cfg_default',
  baseVolume: 0.75,
  duckedVolume: 0.15,
  rampDownTime: 0.2,
  rampUpTime: 0.4,
  duckOnSpeech: true,
  duckKeywords: [],
  duckSpans: [],
};

export const useTimelineStore = create<TimelineState>((set, get) => ({
  edl: null,
  activePlayheadMs: 0,
  activePlayheadSec: 0,
  selectedSegmentId: null,
  isPlaying: false,

  bRollClips: [],
  titleClips: [],
  duckingConfig: DEFAULT_DUCKING_CONFIG,
  activeSpeechRanges: [],

  clearEdl: () => {
    set({
      edl: null,
      activePlayheadMs: 0,
      activePlayheadSec: 0,
      selectedSegmentId: null,
      isPlaying: false,
      bRollClips: [],
      titleClips: [],
      activeSpeechRanges: [],
    });
  },

  initEdl: (projectId, title, durationMs) => {
    const videoTrack: TimelineTrack = {
      track_id: 'track_video_main',
      track_type: 'video',
      segments: [
        {
          segment_id: `seg_${Date.now()}_0`,
          source_vault_id: projectId,
          source_start_ms: 0,
          source_end_ms: durationMs,
          timeline_start_ms: 0,
          timeline_end_ms: durationMs,
          is_muted: false,
          speed_ratio: 1.0,
        },
      ],
    };

    set({
      edl: {
        project_id: projectId,
        title,
        duration_ms: durationMs,
        tracks: [videoTrack],
      },
      activePlayheadMs: 0,
      activePlayheadSec: 0,
    });
  },

  cutInterval: (startMs, endMs) => {
    const currentEdl = get().edl;
    if (!currentEdl || startMs >= endMs) return;

    const cutDuration = endMs - startMs;
    const nextTracks = currentEdl.tracks.map((track) => {
      const nextSegments: ClipSegment[] = [];

      for (const seg of track.segments) {
        // Interval is completely before or after this segment
        if (endMs <= seg.source_start_ms || startMs >= seg.source_end_ms) {
          nextSegments.push({ ...seg });
          continue;
        }

        // Subdivide segment
        if (startMs > seg.source_start_ms) {
          nextSegments.push({
            ...seg,
            segment_id: `${seg.segment_id}_a`,
            source_end_ms: startMs,
            timeline_end_ms: seg.timeline_start_ms + (startMs - seg.source_start_ms),
          });
        }

        if (endMs < seg.source_end_ms) {
          nextSegments.push({
            ...seg,
            segment_id: `${seg.segment_id}_b`,
            source_start_ms: endMs,
            timeline_start_ms: seg.timeline_start_ms + (startMs - seg.source_start_ms),
            timeline_end_ms: seg.timeline_end_ms - cutDuration,
          });
        }
      }

      // Re-index timeline monotonically
      let cursorMs = 0;
      const reindexed = nextSegments.map((s) => {
        const segDur = s.source_end_ms - s.source_start_ms;
        const updated = {
          ...s,
          timeline_start_ms: cursorMs,
          timeline_end_ms: cursorMs + segDur,
        };
        cursorMs += segDur;
        return updated;
      });

      return { ...track, segments: reindexed };
    });

    const newDuration = Math.max(0, currentEdl.duration_ms - cutDuration);
    set({
      edl: {
        ...currentEdl,
        duration_ms: newDuration,
        tracks: nextTracks,
      },
    });
  },

  setPlayhead: (posMs) => {
    const clamped = Math.max(0, posMs);
    set({ activePlayheadMs: clamped, activePlayheadSec: clamped / 1000 });
  },

  setPlayheadSec: (posSec) => {
    const clamped = Math.max(0, posSec);
    set({ activePlayheadSec: clamped, activePlayheadMs: Math.round(clamped * 1000) });
  },

  togglePlay: () => {
    set((state) => ({ isPlaying: !state.isPlaying }));
  },

  setIsPlaying: (playing) => {
    set({ isPlaying: playing });
  },

  toggleSegmentMute: (segmentId) => {
    const edl = get().edl;
    if (!edl) return;
    const tracks = edl.tracks.map((t) => ({
      ...t,
      segments: t.segments.map((s) =>
        s.segment_id === segmentId ? { ...s, is_muted: !s.is_muted } : s,
      ),
    }));
    set({ edl: { ...edl, tracks } });
  },

  // Phase 2: B-Roll Actions
  addBRollClip: (clip) => {
    const id = `broll_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const fullClip: BRollClip = { ...clip, id };
    set((state) => ({ bRollClips: [...state.bRollClips, fullClip] }));
    return id;
  },

  updateBRollClip: (id, patch) => {
    set((state) => ({
      bRollClips: state.bRollClips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  },

  removeBRollClip: (id) => {
    set((state) => ({
      bRollClips: state.bRollClips.filter((c) => c.id !== id),
    }));
  },

  // Phase 2: Kinetic Title Actions
  addTitleClip: (clip) => {
    const id = `title_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const fullClip: KineticTitleClip = { ...clip, id };
    set((state) => ({ titleClips: [...state.titleClips, fullClip] }));
    return id;
  },

  updateTitleClip: (id, patch) => {
    set((state) => ({
      titleClips: state.titleClips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  },

  removeTitleClip: (id) => {
    set((state) => ({
      titleClips: state.titleClips.filter((c) => c.id !== id),
    }));
  },

  // Phase 2: Audio Ducking Actions
  setDuckingConfig: (patch) => {
    set((state) => ({ duckingConfig: { ...state.duckingConfig, ...patch } }));
  },

  addDuckingSpan: (span) => {
    const id = `duck_span_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    set((state) => ({
      duckingConfig: {
        ...state.duckingConfig,
        duckSpans: [...(state.duckingConfig.duckSpans || []), { ...span, id }],
      },
    }));
    return id;
  },

  removeDuckingSpan: (spanId) => {
    set((state) => ({
      duckingConfig: {
        ...state.duckingConfig,
        duckSpans: (state.duckingConfig.duckSpans || []).filter((s) => s.id !== spanId),
      },
    }));
  },

  // Phase 2: Re-anchor Multi-Track Bounds when preceding words are purged
  syncAnchoredOverlays: (tokens) => {
    const { bRollClips, titleClips, duckingConfig } = get();

    // Re-derive B-Roll bounds
    const updatedBRolls = bRollClips.map((clip) => {
      const { timelineStart, timelineEnd } = deriveAnchoredBounds(
        clip.anchorWordIdStart,
        clip.anchorWordIdEnd,
        tokens,
        clip.timelineStart,
        clip.timelineEnd
      );
      return { ...clip, timelineStart, timelineEnd };
    });

    // Re-derive Kinetic Title bounds
    const updatedTitles = titleClips.map((clip) => {
      const { timelineStart, timelineEnd } = deriveAnchoredBounds(
        clip.anchorWordIdStart,
        clip.anchorWordIdEnd,
        tokens,
        clip.timelineStart,
        clip.timelineEnd
      );
      return { ...clip, timelineStart, timelineEnd };
    });

    // Re-derive Ducking Spans bounds
    const updatedSpans = (duckingConfig.duckSpans || []).map((span) => {
      if (span.anchorWordIdStart && span.anchorWordIdEnd) {
        const { timelineStart, timelineEnd } = deriveAnchoredBounds(
          span.anchorWordIdStart,
          span.anchorWordIdEnd,
          tokens,
          span.start,
          span.end
        );
        return { ...span, start: timelineStart, end: timelineEnd };
      }
      return span;
    });

    // Compute active speech intervals for auto-ducking on speech
    const activeSpeech: { start: number; end: number }[] = [];
    let curSpan: { start: number; end: number } | null = null;
    for (const t of tokens) {
      if (!t.deleted) {
        if (!curSpan) {
          curSpan = { start: Number(t.start), end: Number(t.end) };
        } else if (Number(t.start) <= curSpan.end + 0.15) {
          curSpan.end = Math.max(curSpan.end, Number(t.end));
        } else {
          activeSpeech.push(curSpan);
          curSpan = { start: Number(t.start), end: Number(t.end) };
        }
      }
    }
    if (curSpan) activeSpeech.push(curSpan);

    set({
      bRollClips: updatedBRolls,
      titleClips: updatedTitles,
      duckingConfig: { ...duckingConfig, duckSpans: updatedSpans },
      activeSpeechRanges: activeSpeech,
    });
  },
}));
