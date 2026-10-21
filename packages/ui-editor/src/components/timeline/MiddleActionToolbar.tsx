import React from 'react';
import { TelemetryState } from '@astral/core';
import { ScarletButton } from '../common/ScarletButton';
import {
  IconUndo,
  IconRedo,
  IconTrash,
  IconScissors,
  IconRotate,
  IconCrop,
  IconColorAdjust,
  IconEqualizer,
  IconSubtitles,
  IconMarker,
  IconLightning,
} from '../common/ScarletIcons';

export interface MiddleActionToolbarProps {
  telemetry: TelemetryState;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDeleteSelected: () => void;
  onSplitClip: () => void;
  onRotateClip: () => void;
  onOpenColorTool: () => void;
  onOpenEqualizerTool: () => void;
  onToggleSubtitles: () => void;
  onAddMarker: () => void;
  onOpenExportModal: () => void;
  onToggleFaultSimulator: () => void;
}

export const MiddleActionToolbar: React.FC<MiddleActionToolbarProps> = ({
  telemetry,
  canUndo = true,
  canRedo = false,
  onUndo,
  onRedo,
  onDeleteSelected,
  onSplitClip,
  onRotateClip,
  onOpenColorTool,
  onOpenEqualizerTool,
  onToggleSubtitles,
  onAddMarker,
  onOpenExportModal,
  onToggleFaultSimulator,
}) => {
  return (
    <div
      style={{
        height: '46px',
        backgroundColor: '#181B20',
        borderTop: '1px solid #2B303A',
        borderBottom: '1px solid #2B303A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {/* Left Action Buttons (Page 1 & 2 Exact Order) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button
          type="button"
          title="Undo (Ctrl+Z)"
          onClick={onUndo}
          disabled={!canUndo}
          style={btnStyle(canUndo)}
        >
          <IconUndo size={18} />
        </button>

        <button
          type="button"
          title="Redo (Ctrl+Y)"
          onClick={onRedo}
          disabled={!canRedo}
          style={btnStyle(canRedo)}
        >
          <IconRedo size={18} />
        </button>

        <button
          type="button"
          title="Delete Selection (Del/Backspace)"
          onClick={onDeleteSelected}
          style={btnStyle(true)}
        >
          <IconTrash size={18} />
        </button>

        {/* Vertical Divider */}
        <div style={{ width: '1px', height: '20px', backgroundColor: '#2B303A', margin: '0 6px' }} />

        <button
          type="button"
          title="Split Clip at Playhead (Ctrl+B / Scissors)"
          onClick={onSplitClip}
          style={btnStyle(true)}
        >
          <IconScissors size={18} color="#FFD32A" />
        </button>

        <button
          type="button"
          title="Rotate 90°"
          onClick={onRotateClip}
          style={btnStyle(true)}
        >
          <IconRotate size={18} />
        </button>

        <button
          type="button"
          title="Crop & Zoom"
          onClick={onRotateClip}
          style={btnStyle(true)}
        >
          <IconCrop size={18} />
        </button>

        <button
          type="button"
          title="Color Adjustments"
          onClick={onOpenColorTool}
          style={btnStyle(true)}
        >
          <IconColorAdjust size={18} />
        </button>

        <button
          type="button"
          title="Audio Equalizer & Ducking"
          onClick={onOpenEqualizerTool}
          style={btnStyle(true)}
        >
          <IconEqualizer size={18} />
        </button>

        <button
          type="button"
          title="Burned-In Subtitles Preview"
          onClick={onToggleSubtitles}
          style={btnStyle(true)}
        >
          <IconSubtitles size={18} />
        </button>

        <button
          type="button"
          title="Add Marker Flag at Playhead"
          onClick={onAddMarker}
          style={btnStyle(true)}
        >
          <IconMarker size={18} color="#2ED573" />
        </button>
      </div>

      {/* Center Live Telemetry Status Pill (Webster Victory Tier Mandate) */}
      <div
        onClick={onToggleFaultSimulator}
        title="Click to open Webster 2026 Self-Healing Fault Simulator"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backgroundColor: '#111317',
          border: '1px solid #2B303A',
          borderRadius: '9999px',
          padding: '4px 14px',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          fontSize: '11px',
          fontFamily: "'JetBrains Mono', monospace",
          color: '#A4B0BE',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.borderColor = '#168BFF';
          (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(22, 139, 255, 0.08)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.borderColor = '#2B303A';
          (e.currentTarget as HTMLElement).style.backgroundColor = '#111317';
        }}
      >
        <IconLightning size={13} color="#2ED573" />
        <span style={{ color: '#2ED573', fontWeight: 600 }}>
          Coalesce: {telemetry.rippleRebuildMs}ms
        </span>
        <span style={{ color: '#636E7B' }}>|</span>
        <span>Jump: O(log N)</span>
        <span style={{ color: '#636E7B' }}>|</span>
        <span style={{ color: '#168BFF' }}>
          MEMFS: {telemetry.memfsHeapMb}MB
        </span>
        <span style={{ color: '#636E7B' }}>|</span>
        <span style={{ color: '#FFA502' }}>
          Saved: {telemetry.timeSavedSec}s
        </span>
      </div>

      {/* Right: Primary Export Action Button (Page 1) */}
      <div>
        <ScarletButton
          variant="primary"
          size="md"
          onClick={onOpenExportModal}
        >
          Export
        </ScarletButton>
      </div>
    </div>
  );
};

const btnStyle = (active: boolean): React.CSSProperties => ({
  width: '32px',
  height: '32px',
  borderRadius: '8px',
  backgroundColor: 'transparent',
  color: active ? '#D2DAE2' : '#454D5B',
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: active ? 'pointer' : 'not-allowed',
  transition: 'background-color 0.12s ease',
});
