import { invoke, convertFileSrc } from '@tauri-apps/api/core';

export const loadThumbnailSrc = async (filePath: string): Promise<string> => {
  if (!filePath) return '';
  try {
    const direct = convertFileSrc(filePath);
    if (direct) return direct;
  } catch {
    // Fall back to IPC
  }
  try {
    const dataUrl = await invoke<string>('read_thumbnail_base64', { path: filePath });
    return dataUrl;
  } catch (err) {
    console.warn('loadThumbnailSrc failed for:', filePath, err);
    return '';
  }
};

export const formatDurationMs = (ms: number): string => {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const formatSizeBytes = (bytes: number): string => {
  if (bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatCreationDate = (dateStr: string): string => {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const dateFormatted = d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const timeFormatted = d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${dateFormatted} • ${timeFormatted}`;
  } catch {
    return dateStr;
  }
};
