import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectionStore, getProjectionSnapshot } from '../useProjectionStore';

describe('useProjectionStore & Spatial Positioning Engine', () => {
  beforeEach(() => {
    useProjectionStore.setState({
      isEnabled: false,
      deviceId: '',
      normX: 0.88,
      normY: 0.84,
      normDiameter: 0.14,
      isMirrored: true,
      maskShape: 'mandala',
      snapPreset: 'bottom-right',
    });
  });

  it('initializes with bottom-right mandala defaults', () => {
    const snap = getProjectionSnapshot();
    expect(snap.normX).toBe(0.88);
    expect(snap.normY).toBe(0.84);
    expect(snap.normDiameter).toBe(0.14);
    expect(snap.isMirrored).toBe(true);
    expect(snap.maskShape).toBe('mandala');
    expect(snap.snapPreset).toBe('bottom-right');
  });

  it('snaps accurately to top-left quadrant preset', () => {
    const { setSnapPreset } = useProjectionStore.getState();
    setSnapPreset('top-left');

    const snap = getProjectionSnapshot();
    expect(snap.snapPreset).toBe('top-left');
    expect(snap.normX).toBe(0.12);
    expect(snap.normY).toBe(0.16);
  });

  it('snaps accurately to center stage preset', () => {
    const { setSnapPreset } = useProjectionStore.getState();
    setSnapPreset('center');

    const snap = getProjectionSnapshot();
    expect(snap.snapPreset).toBe('center');
    expect(snap.normX).toBe(0.50);
    expect(snap.normY).toBe(0.50);
  });

  it('cycles through arcane mask shapes', () => {
    const { setMaskShape } = useProjectionStore.getState();
    setMaskShape('hexagon');
    expect(getProjectionSnapshot().maskShape).toBe('hexagon');

    setMaskShape('rounded');
    expect(getProjectionSnapshot().maskShape).toBe('rounded');

    setMaskShape('mandala');
    expect(getProjectionSnapshot().maskShape).toBe('mandala');
  });

  it('toggles horizontal mirror flipping', () => {
    const { toggleMirror } = useProjectionStore.getState();
    expect(getProjectionSnapshot().isMirrored).toBe(true);

    toggleMirror();
    expect(getProjectionSnapshot().isMirrored).toBe(false);

    toggleMirror();
    expect(getProjectionSnapshot().isMirrored).toBe(true);
  });

  it('supports fine-grained free drag coordinates updating synchronous snapshot', () => {
    const { updateProjection } = useProjectionStore.getState();
    updateProjection({
      normX: 0.35,
      normY: 0.72,
      normDiameter: 0.22,
    });

    const snap = getProjectionSnapshot();
    expect(snap.normX).toBe(0.35);
    expect(snap.normY).toBe(0.72);
    expect(snap.normDiameter).toBe(0.22);
  });
});
