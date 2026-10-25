import React, { useState } from 'react';
import { formatTimecode } from '@astral/core';

export interface StatusFooterProps {
  scale: number;
  onScaleChange: (scale: number) => void;
  projectDuration: number;
  statusText?: string;
}

export const StatusFooter: React.FC<StatusFooterProps> = ({
  scale,
  onScaleChange,
  projectDuration,
  statusText = 'Ready',
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const timecode = formatTimecode(projectDuration);

  const notifications = [
    'Webster PS #09: 85ms ripple coalescing active.',
    'Movavi 2020 layout initialized with 4-zone dark geometry.',
    'Seek-Lock Mutex: Zero audio crackle across micro-cuts.',
    'MEMFS Heap Guard: 2GB buffer boundary protected.',
  ];

  return (
    <footer
      style={{
        height: '28px',
        backgroundColor: '#14171C',
        borderTop: '1px solid #2B303A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        fontSize: '11px',
        color: '#A4B0BE',
        userSelect: 'none',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* Left: Interactive Timeline Zoom Slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>Scale:</span>
        <button
          type="button"
          onClick={() => onScaleChange(Math.max(0.5, scale - 0.25))}
          style={{ background: 'none', border: 'none', color: '#A4B0BE', cursor: 'pointer', fontSize: '13px' }}
        >
          —
        </button>
        <input
          type="range"
          min="0.5"
          max="3.0"
          step="0.1"
          value={scale}
          onChange={e => onScaleChange(Number(e.target.value))}
          style={{ width: '90px', accentColor: '#168BFF', height: '4px' }}
        />
        <button
          type="button"
          onClick={() => onScaleChange(Math.min(3.0, scale + 0.25))}
          style={{ background: 'none', border: 'none', color: '#A4B0BE', cursor: 'pointer', fontSize: '13px' }}
        >
          +
        </button>
        <span style={{ fontSize: '10px', color: '#636E7B' }}>{scale.toFixed(1)}x</span>
      </div>

      {/* Center: Dynamic Project Length */}
      <div style={{ fontFamily: "'JetBrains Mono', monospace", color: '#FFFFFF' }}>
        <span>Project length: </span>
        <span style={{ fontWeight: 600 }}>{timecode.main}</span>
        <span style={{ color: '#636E7B', marginLeft: '2px' }}>{timecode.ms.slice(0, 2)}</span>
      </div>

      {/* Right: Status Indicator & Notifications Popover */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#2ED573' }} />
          <span>{statusText}</span>
        </div>

        <button
          type="button"
          onClick={() => setShowNotifications(!showNotifications)}
          style={{
            background: 'none',
            border: 'none',
            color: '#FFA502',
            cursor: 'pointer',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span>🔔</span>
          <span>4 Notifications</span>
        </button>
      </div>

      {/* Notifications Popover */}
      {showNotifications && (
        <div
          style={{
            position: 'absolute',
            bottom: '32px',
            right: '16px',
            width: '280px',
            backgroundColor: '#1E2229',
            border: '1px solid #2B303A',
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            padding: '12px',
            zIndex: 50,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontWeight: 600, color: '#FFFFFF' }}>Recent System Events</span>
            <button
              type="button"
              onClick={() => setShowNotifications(false)}
              style={{ background: 'none', border: 'none', color: '#636E7B', cursor: 'pointer', fontSize: '12px' }}
            >
              ✕
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {notifications.map((note, idx) => (
              <div key={idx} style={{ fontSize: '10px', color: '#A4B0BE', lineHeight: '1.4' }}>
                • {note}
              </div>
            ))}
          </div>
        </div>
      )}
    </footer>
  );
};
