import { create } from 'zustand';
import type { ProjectEdl, ClipSegment, TimelineTrack } from '../types/ipc';

interface TimelineState {
  edl: ProjectEdl | null;
  activePlayheadMs: number;
  selectedSegmentId: string | null;
  isPlaying: boolean;

  // Actions
  initEdl: (projectId: string, title: string, durationMs: number) => void;
  clearEdl: () => void;
  cutInterval: (startMs: number, endMs: number) => void;
  setPlayhead: (posMs: number) => void;
  togglePlay: () => void;
  toggleSegmentMute: (segmentId: string) => void;
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  edl: null,
  activePlayheadMs: 0,
  selectedSegmentId: null,
  isPlaying: false,

  clearEdl: () => {
    set({
      edl: null,
      activePlayheadMs: 0,
      selectedSegmentId: null,
      isPlaying: false,
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
    set({ activePlayheadMs: Math.max(0, posMs) });
  },

  togglePlay: () => {
    set((state) => ({ isPlaying: !state.isPlaying }));
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
}));
