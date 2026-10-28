import { create } from 'zustand';
import type { AstralProjectionConfig, ProjectionMaskShape, ProjectionSnapPreset } from '../types/ipc';

interface ProjectionState extends AstralProjectionConfig {
  updateProjection: (patch: Partial<AstralProjectionConfig>) => void;
  setSnapPreset: (preset: ProjectionSnapPreset) => void;
  setMaskShape: (shape: ProjectionMaskShape) => void;
  toggleMirror: () => void;
}

const DEFAULT_STATE: AstralProjectionConfig = {
  isEnabled: false,
  deviceId: '',
  normX: 0.88,
  normY: 0.84,
  normDiameter: 0.14,
  isMirrored: true,
  maskShape: 'mandala',
  snapPreset: 'bottom-right',
};

// Cross-window sync channel
const channel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('astral-archivist-projection')
  : null;

export const useProjectionStore = create<ProjectionState>((set, get) => {
  if (channel) {
    channel.onmessage = (event) => {
      if (event.data?.type === 'SYNC_PROJECTION') {
        set(event.data.payload);
      }
    };
  }

  const broadcast = (state: Partial<AstralProjectionConfig>) => {
    channel?.postMessage({
      type: 'SYNC_PROJECTION',
      payload: state,
    });
  };

  return {
    ...DEFAULT_STATE,

    updateProjection: (patch) => {
      set((state) => {
        const next = { ...state, ...patch };
        broadcast(next);
        return next;
      });
    },

    setSnapPreset: (preset: ProjectionSnapPreset) => {
      set((state) => {
        let normX = state.normX;
        let normY = state.normY;

        switch (preset) {
          case 'top-left':
            normX = 0.12;
            normY = 0.16;
            break;
          case 'top-right':
            normX = 0.88;
            normY = 0.16;
            break;
          case 'bottom-left':
            normX = 0.12;
            normY = 0.84;
            break;
          case 'bottom-right':
            normX = 0.88;
            normY = 0.84;
            break;
          case 'center':
            normX = 0.50;
            normY = 0.50;
            break;
          case 'custom':
          default:
            break;
        }

        const next = { ...state, snapPreset: preset, normX, normY };
        broadcast(next);
        return next;
      });
    },

    setMaskShape: (maskShape: ProjectionMaskShape) => {
      set((state) => {
        const next = { ...state, maskShape };
        broadcast(next);
        return next;
      });
    },

    toggleMirror: () => {
      set((state) => {
        const next = { ...state, isMirrored: !state.isMirrored };
        broadcast(next);
        return next;
      });
    },
  };
});

/**
 * Direct synchronous accessor for offscreen canvas compositing loop
 */
export const getProjectionSnapshot = (): AstralProjectionConfig => {
  return useProjectionStore.getState();
};
