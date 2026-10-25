import { invoke } from '@tauri-apps/api/core';

export interface PermissionPreflight {
  platform: string;
  display_capture_supported: boolean;
  microphone_supported: boolean;
  camera_supported: boolean;
  vault_directory: string;
  ffmpeg_available: boolean;
  ffprobe_available: boolean;
}

export interface VaultItem {
  id: string;
  title: string;
  created_at: string;
  duration_seconds: number;
  source_type: string;
  file_path: string;
  thumb_path?: string | null;
  file_size_bytes: number;
}

export interface SaveSessionPayload {
  id: string;
  title: string;
  duration_seconds: number;
  source_type: string;
  video_bytes_base64?: string;
}

export async function checkPreflight(): Promise<PermissionPreflight> {
  try {
    return await invoke<PermissionPreflight>('check_preflight');
  } catch (err) {
    console.warn('[tauriClient] check_preflight fallback:', err);
    return {
      platform: navigator.userAgent.includes('Windows') ? 'windows' : 'browser',
      display_capture_supported: !!navigator.mediaDevices?.getDisplayMedia,
      microphone_supported: !!navigator.mediaDevices?.getUserMedia,
      camera_supported: !!navigator.mediaDevices?.getUserMedia,
      vault_directory: 'IndexedDB/LocalStorage',
      ffmpeg_available: true,
      ffprobe_available: true,
    };
  }
}

export async function listVaultItems(): Promise<VaultItem[]> {
  try {
    return await invoke<VaultItem[]>('list_vault_items');
  } catch (err) {
    console.warn('[tauriClient] list_vault_items fallback to localStorage:', err);
    const raw = localStorage.getItem('astral_vault_items');
    return raw ? JSON.parse(raw) : [];
  }
}

export async function saveCaptureSession(payload: SaveSessionPayload): Promise<VaultItem> {
  try {
    return await invoke<VaultItem>('save_capture_session', { payload });
  } catch (err) {
    console.warn('[tauriClient] save_capture_session fallback to local storage:', err);
    const fallbackItem: VaultItem = {
      id: payload.id,
      title: payload.title,
      created_at: Math.floor(Date.now() / 1000).toString(),
      duration_seconds: payload.duration_seconds,
      source_type: payload.source_type,
      file_path: `virtual_vault://${payload.id}.webm`,
      thumb_path: null,
      file_size_bytes: payload.video_bytes_base64 ? payload.video_bytes_base64.length : 0,
    };
    const items = await listVaultItems();
    const updated = [fallbackItem, ...items.filter(i => i.id !== fallbackItem.id)];
    localStorage.setItem('astral_vault_items', JSON.stringify(updated));
    return fallbackItem;
  }
}

export async function renameVaultItem(id: string, newTitle: string): Promise<boolean> {
  try {
    return await invoke<boolean>('rename_vault_item', { id, newTitle });
  } catch {
    const items = await listVaultItems();
    const target = items.find(i => i.id === id);
    if (target) {
      target.title = newTitle;
      localStorage.setItem('astral_vault_items', JSON.stringify(items));
      return true;
    }
    return false;
  }
}

export async function deleteVaultItem(id: string): Promise<boolean> {
  try {
    return await invoke<boolean>('delete_vault_item', { id });
  } catch {
    const items = await listVaultItems();
    const updated = items.filter(i => i.id !== id);
    localStorage.setItem('astral_vault_items', JSON.stringify(updated));
    return true;
  }
}
