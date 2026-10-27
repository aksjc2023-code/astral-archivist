import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { VaultItem } from '../types/ipc';

import { useTimelineStore } from './useTimelineStore';

interface VaultState {
  recordings: VaultItem[];
  selectedItem: VaultItem | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchRecordings: () => Promise<void>;
  selectRecording: (item: VaultItem | null) => void;
  renameRecording: (id: string, newTitle: string) => Promise<void>;
  deleteRecording: (id: string) => Promise<void>;
}

export const useVaultStore = create<VaultState>((set) => ({
  recordings: [],
  selectedItem: null,
  isLoading: false,
  error: null,

  fetchRecordings: async () => {
    try {
      set({ isLoading: true, error: null });
      const recordings = await invoke<VaultItem[]>('get_vault_recordings');
      set({
        recordings,
        isLoading: false,
      });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  selectRecording: (item) => {
    set({ selectedItem: item });
  },

  renameRecording: async (id, newTitle) => {
    try {
      await invoke('rename_recording', { id, newTitle });
      set((state) => ({
        recordings: state.recordings.map((r) =>
          r.id === id ? { ...r, title: newTitle } : r,
        ),
        selectedItem:
          state.selectedItem?.id === id
            ? { ...state.selectedItem, title: newTitle }
            : state.selectedItem,
      }));
    } catch (err) {
      set({ error: String(err) });
    }
  },

  deleteRecording: async (id) => {
    try {
      await invoke('delete_recording', { id });
      set((state) => {
        const nextRecordings = state.recordings.filter((r) => r.id !== id);
        return {
          recordings: nextRecordings,
          selectedItem:
            state.selectedItem?.id === id
              ? null
              : state.selectedItem,
        };
      });

      // Permanently erase recording from timeline if it was currently loaded
      const timelineState = useTimelineStore.getState();
      if (timelineState.edl?.project_id === id) {
        timelineState.clearEdl();
      }
    } catch (err) {
      set({ error: String(err) });
    }
  },
}));
