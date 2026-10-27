import { create } from 'zustand';
import type { VaultItem } from '../types/ipc';

interface EditorBridgeState {
  pendingImportItem: VaultItem | null;
  setPendingImportItem: (item: VaultItem | null) => void;
}

export const useEditorBridgeStore = create<EditorBridgeState>((set) => ({
  pendingImportItem: null,
  setPendingImportItem: (item) => set({ pendingImportItem: item }),
}));
