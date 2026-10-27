import React from 'react';
import { FailureMode, TelemetryState } from '@astral/core';
import { ScarletButton } from '../common/ScarletButton';

export interface FaultSimulatorBarProps {
  isOpen: boolean;
  onClose: () => void;
  telemetry: TelemetryState;
  onTriggerFailureMode: (mode: FailureMode) => void;
}

export const FaultSimulatorBar: React.FC<FaultSimulatorBarProps> = ({
  isOpen,
  onClose,
  telemetry,
  onTriggerFailureMode,
}) => {
  if (!isOpen) return null;

  const failureModes: Array<{
    id: FailureMode;
    title: string;
    symptom: string;
    healingPath: string;
  }> = [
    {
      id: 'seek-lock',
      title: '1. Decoder Seek Thrashing & Audio Crackle',
      symptom: 'Continuous 60FPS playhead polls spam video.currentTime during hardware decoder seeks.',
      healingPath: 'Enforces isSeekingRef mutex lock; frame ticks skip seek logic until native onSeeked fires or 400ms timeout.',
    },
    {
      id: 'heap-guard',
      title: '2. Emscripten 2GB MEMFS Heap Exhaustion',
      symptom: 'Intermediate slice buffers and .ass files exceed 750MB in WASM heap.',
      healingPath: 'Pre-flight file ceiling rejects >750MB inputs; deterministic finally block unlinks all virtual file descriptors.',
    },
    {
      id: 'webgpu-loss',
      title: '3. WebGPU Context Loss During Whisper Inference',
      symptom: 'VRAM pressure or low-end GPU causes GPUAdapter.lost or WebGPU device lost event.',
      healingPath: 'OfflineWhisper engine catches device loss and falls back to ONNX CPU execution via WASM SIMD (4 threads).',
    },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '36px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '760px',
        backgroundColor: '#1E2229',
        border: '1px solid #168BFF',
        borderRadius: '16px',
        boxShadow: '0 16px 40px rgba(0,0,0,0.8)',
        padding: '16px 20px',
        zIndex: 90,
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>
            ⚡ Webster 2026 Fault Injection &amp; Self-Healing Simulator
          </span>
          <span style={{ fontSize: '10px', backgroundColor: '#2ED573', color: '#111317', fontWeight: 700, padding: '1px 6px', borderRadius: '4px' }}>
            VICTORY TIER
          </span>
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#636E7B', cursor: 'pointer', fontSize: '14px' }}
        >
          ✕
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
        {failureModes.map(f => {
          const isActive = telemetry.activeFailureMode === f.id;
          return (
            <div
              key={f.id}
              onClick={() => onTriggerFailureMode(f.id)}
              style={{
                backgroundColor: isActive ? '#1A2942' : '#14171C',
                border: isActive ? '1px solid #168BFF' : '1px solid #2B303A',
                borderRadius: '10px',
                padding: '10px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 600, color: isActive ? '#168BFF' : '#FFFFFF', marginBottom: '4px' }}>
                {f.title}
              </div>
              <div style={{ fontSize: '10px', color: '#A4B0BE', marginBottom: '6px', lineHeight: '1.3' }}>
                <strong style={{ color: '#FF4757' }}>Breakdown:</strong> {f.symptom}
              </div>
              <div style={{ fontSize: '10px', color: '#2ED573', lineHeight: '1.3' }}>
                <strong>Self-Healing:</strong> {f.healingPath}
              </div>
            </div>
          );
        })}
      </div>

      {/* Recovery Log Telemetry */}
      {telemetry.recoveryLog && (
        <div
          style={{
            marginTop: '12px',
            backgroundColor: '#111317',
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: '11px',
            fontFamily: "'JetBrains Mono', monospace",
            color: '#2ED573',
            border: '1px solid #2ED57333',
          }}
        >
          {telemetry.recoveryLog}
        </div>
      )}
    </div>
  );
};
