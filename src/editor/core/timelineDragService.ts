export interface TimelineDragPayload {
  type: 'filters' | 'transitions' | 'titles' | 'stickers' | 'asset';
  name: string;
  color?: string;
  sub?: string;
  category?: string;
  data?: any;
}

let activeDragPayload: TimelineDragPayload | null = null;

export const setTimelineDragPayload = (payload: TimelineDragPayload | null): void => {
  activeDragPayload = payload;
  if (typeof window !== 'undefined') {
    (window as any).__timelineDragPayload = payload;
  }
};

export const getTimelineDragPayload = (): TimelineDragPayload | null => {
  if (activeDragPayload) return activeDragPayload;
  if (typeof window !== 'undefined' && (window as any).__timelineDragPayload) {
    return (window as any).__timelineDragPayload;
  }
  return null;
};
