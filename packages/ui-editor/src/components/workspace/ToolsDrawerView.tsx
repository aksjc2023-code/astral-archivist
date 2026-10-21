import React, { useState } from 'react';
import { ToolDrawerTab, ToolSettings } from '@astral/core';
import { ScarletButton } from '../common/ScarletButton';

export interface ToolsDrawerViewProps {
  settings: ToolSettings;
  onUpdateSettings: (updater: (prev: ToolSettings) => ToolSettings) => void;
}

export const ToolsDrawerView: React.FC<ToolsDrawerViewProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const [activeTab, setActiveTab] = useState<ToolDrawerTab>('chroma');

  const tabs: Array<{ id: ToolDrawerTab; label: string }> = [
    { id: 'chroma', label: 'Chroma Key' },
    { id: 'color', label: 'Color Adjustments' },
    { id: 'animation', label: 'Animation' },
    { id: 'equalizer', label: 'Equalizer' },
    { id: 'overlay', label: 'Overlay' },
    { id: 'highlight', label: 'Highlight & Conceal' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#181B20',
        padding: '16px 20px',
        overflowY: 'auto',
      }}
    >
      {/* Top Tool Category Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          borderBottom: '1px solid #2B303A',
          paddingBottom: '10px',
          marginBottom: '16px',
          overflowX: 'auto',
        }}
      >
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                backgroundColor: isActive ? '#168BFF' : '#22262E',
                color: isActive ? '#FFFFFF' : '#A4B0BE',
                border: 'none',
                borderRadius: '9999px',
                padding: '5px 14px',
                fontSize: '11px',
                fontWeight: 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Chroma Key (Page 7) */}
      {activeTab === 'chroma' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 500, color: '#FFFFFF', margin: 0 }}>
              Chroma Key Settings
            </h3>
            <ScarletButton
              variant="secondary"
              size="sm"
              onClick={() =>
                onUpdateSettings(prev => ({
                  ...prev,
                  chromaKey: { color: 'green', tolerance: 60, noise: 16, edges: 10, opacity: 85 },
                }))
              }
            >
              Reset
            </ScarletButton>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#A4B0BE' }}>Key Color:</span>
            <button
              type="button"
              onClick={() =>
                onUpdateSettings(prev => ({
                  ...prev,
                  chromaKey: { ...prev.chromaKey, color: 'green' },
                }))
              }
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                backgroundColor: '#2ED573',
                border: settings.chromaKey.color === 'green' ? '2px solid #FFFFFF' : 'none',
                cursor: 'pointer',
              }}
            />
            <button
              type="button"
              onClick={() =>
                onUpdateSettings(prev => ({
                  ...prev,
                  chromaKey: { ...prev.chromaKey, color: 'blue' },
                }))
              }
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                backgroundColor: '#168BFF',
                border: settings.chromaKey.color === 'blue' ? '2px solid #FFFFFF' : 'none',
                cursor: 'pointer',
              }}
            />
          </div>

          {/* Tolerance */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#A4B0BE', marginBottom: '4px' }}>
              <span>Tolerance</span>
              <span>{settings.chromaKey.tolerance}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={settings.chromaKey.tolerance}
              onChange={e =>
                onUpdateSettings(prev => ({
                  ...prev,
                  chromaKey: { ...prev.chromaKey, tolerance: Number(e.target.value) },
                }))
              }
              style={{ width: '100%', accentColor: '#168BFF' }}
            />
          </div>

          {/* Noise */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#A4B0BE', marginBottom: '4px' }}>
              <span>Noise</span>
              <span>{settings.chromaKey.noise}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={settings.chromaKey.noise}
              onChange={e =>
                onUpdateSettings(prev => ({
                  ...prev,
                  chromaKey: { ...prev.chromaKey, noise: Number(e.target.value) },
                }))
              }
              style={{ width: '100%', accentColor: '#168BFF' }}
            />
          </div>

          {/* Edges */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#A4B0BE', marginBottom: '4px' }}>
              <span>Edges</span>
              <span>{settings.chromaKey.edges}px</span>
            </div>
            <input
              type="range"
              min="0"
              max="50"
              value={settings.chromaKey.edges}
              onChange={e =>
                onUpdateSettings(prev => ({
                  ...prev,
                  chromaKey: { ...prev.chromaKey, edges: Number(e.target.value) },
                }))
              }
              style={{ width: '100%', accentColor: '#168BFF' }}
            />
          </div>

          {/* Opacity */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#A4B0BE', marginBottom: '4px' }}>
              <span>Opacity</span>
              <span>{settings.chromaKey.opacity}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={settings.chromaKey.opacity}
              onChange={e =>
                onUpdateSettings(prev => ({
                  ...prev,
                  chromaKey: { ...prev.chromaKey, opacity: Number(e.target.value) },
                }))
              }
              style={{ width: '100%', accentColor: '#168BFF' }}
            />
          </div>
        </div>
      )}

      {/* Tab 2: Color Adjustments (Page 7) */}
      {activeTab === 'color' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 500, color: '#FFFFFF', margin: 0 }}>
              Color Grading &amp; LUTs
            </h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#A4B0BE', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.colorAdjustments.whitebalance}
                onChange={e =>
                  onUpdateSettings(prev => ({
                    ...prev,
                    colorAdjustments: { ...prev.colorAdjustments, whitebalance: e.target.checked },
                  }))
                }
              />
              White Balance
            </label>
          </div>

          {(['brightness', 'contrast', 'saturation', 'highlights', 'gamma', 'shadows'] as const).map(param => (
            <div key={param}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#A4B0BE', textTransform: 'capitalize' }}>
                <span>{param}</span>
                <span>{settings.colorAdjustments[param]}</span>
              </div>
              <input
                type="range"
                min="-100"
                max="100"
                value={settings.colorAdjustments[param]}
                onChange={e => {
                  const val = Number(e.target.value);
                  onUpdateSettings(prev => ({
                    ...prev,
                    colorAdjustments: { ...prev.colorAdjustments, [param]: val },
                  }));
                }}
                style={{ width: '100%', accentColor: '#168BFF' }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Tab 3: Animation Presets (Page 7) */}
      {activeTab === 'animation' && (
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 500, color: '#FFFFFF', marginBottom: '12px', margin: 0 }}>
            Motion Presets
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {['Zoom in', 'Move left', 'Spin 1', 'Zoom out', 'Bounce', 'Drop'].map(preset => {
              const isSelected = settings.animation.selectedPreset === preset;
              return (
                <div
                  key={preset}
                  onClick={() =>
                    onUpdateSettings(prev => ({
                      ...prev,
                      animation: { selectedPreset: preset },
                    }))
                  }
                  style={{
                    backgroundColor: isSelected ? '#1A2A44' : '#22262E',
                    border: isSelected ? '1px solid #168BFF' : '1px solid #2B303A',
                    borderRadius: '8px',
                    padding: '16px 8px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    fontSize: '11px',
                    color: isSelected ? '#168BFF' : '#FFFFFF',
                    fontWeight: isSelected ? 600 : 400,
                  }}
                >
                  {preset}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 4: 10-Band Equalizer & Vocal Purifier (Page 7) */}
      {activeTab === 'equalizer' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 500, color: '#FFFFFF', margin: 0 }}>
              10-Band Graphic Equalizer
            </h3>
            <span style={{ fontSize: '11px', color: '#168BFF' }}>
              Preset: {settings.equalizer.preset}
            </span>
          </div>

          {/* Softablitz Vocal Purifier Badge Toggle */}
          <div
            style={{
              backgroundColor: settings.equalizer.vocalPurifierEnabled ? 'rgba(46, 213, 115, 0.1)' : '#22262E',
              border: settings.equalizer.vocalPurifierEnabled ? '1px solid #2ED573' : '1px solid #2B303A',
              borderRadius: '8px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#FFFFFF' }}>
                Vocal Purifier Chain (85Hz HPF + Gate)
              </div>
              <div style={{ fontSize: '10px', color: '#A4B0BE' }}>
                Removes microphone rumble and suppresses ambient room noise
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                onUpdateSettings(prev => ({
                  ...prev,
                  equalizer: {
                    ...prev.equalizer,
                    vocalPurifierEnabled: !prev.equalizer.vocalPurifierEnabled,
                  },
                }))
              }
              style={{
                backgroundColor: settings.equalizer.vocalPurifierEnabled ? '#2ED573' : '#3B4250',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '9999px',
                padding: '4px 12px',
                fontSize: '10px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {settings.equalizer.vocalPurifierEnabled ? 'ENABLED' : 'DISABLED'}
            </button>
          </div>

          {/* 10 Vertical Faders */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: '110px', padding: '10px 0' }}>
            {['31Hz', '62Hz', '125Hz', '250Hz', '500Hz', '1kHz', '2kHz', '4kHz', '8kHz', '16kHz'].map((freq, idx) => {
              const val = settings.equalizer.bands[idx] ?? 0;
              return (
                <div key={freq} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '9px', color: '#A4B0BE' }}>{val > 0 ? `+${val}` : val}</span>
                  <input
                    type="range"
                    min="-10"
                    max="10"
                    value={val}
                    onChange={e => {
                      const newBands = [...settings.equalizer.bands];
                      newBands[idx] = Number(e.target.value);
                      onUpdateSettings(prev => ({
                        ...prev,
                        equalizer: { ...prev.equalizer, bands: newBands },
                      }));
                    }}
                    style={{
                      writingMode: 'vertical-lr',
                      direction: 'rtl',
                      width: '18px',
                      height: '65px',
                      accentColor: '#168BFF',
                    }}
                  />
                  <span style={{ fontSize: '9px', color: '#636E7B' }}>{freq}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 5: Overlay / B-Roll Modes (Page 7) */}
      {activeTab === 'overlay' && (
        <div>
          <h3 style={{ fontSize: '14px', fontWeight: 500, color: '#FFFFFF', marginBottom: '12px', margin: 0 }}>
            Picture in Picture &amp; Split Screen
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {[
              { id: 'pip' as const, label: 'Picture in picture' },
              { id: 'logo' as const, label: 'Logo Corner' },
              { id: 'triplet' as const, label: 'Triplet Split' },
              { id: 'side-left' as const, label: 'Side by side — left' },
              { id: 'side-right' as const, label: 'Side by side — right' },
              { id: 'top-bottom' as const, label: 'Top and bottom' },
            ].map(m => {
              const isSelected = settings.overlay.mode === m.id;
              return (
                <div
                  key={m.id}
                  onClick={() =>
                    onUpdateSettings(prev => ({
                      ...prev,
                      overlay: { mode: m.id },
                    }))
                  }
                  style={{
                    backgroundColor: isSelected ? '#1A2A44' : '#22262E',
                    border: isSelected ? '1px solid #168BFF' : '1px solid #2B303A',
                    borderRadius: '8px',
                    padding: '14px 6px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    fontSize: '11px',
                    color: isSelected ? '#168BFF' : '#FFFFFF',
                  }}
                >
                  {m.label}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 6: Highlight and Conceal (Page 7) */}
      {activeTab === 'highlight' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 500, color: '#FFFFFF', margin: 0 }}>
              Highlight &amp; Conceal Blur
            </h3>
            <ScarletButton
              variant="secondary"
              size="sm"
              onClick={() =>
                onUpdateSettings(prev => ({
                  ...prev,
                  highlightConceal: { mode: 'highlight', opacity: 100, feathering: 35, outline: true },
                }))
              }
            >
              Reset
            </ScarletButton>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() =>
                onUpdateSettings(prev => ({
                  ...prev,
                  highlightConceal: { ...prev.highlightConceal, mode: 'highlight' },
                }))
              }
              style={{
                flex: 1,
                padding: '6px',
                borderRadius: '6px',
                backgroundColor: settings.highlightConceal.mode === 'highlight' ? '#168BFF' : '#22262E',
                color: '#FFFFFF',
                border: 'none',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              Highlight
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateSettings(prev => ({
                  ...prev,
                  highlightConceal: { ...prev.highlightConceal, mode: 'conceal' },
                }))
              }
              style={{
                flex: 1,
                padding: '6px',
                borderRadius: '6px',
                backgroundColor: settings.highlightConceal.mode === 'conceal' ? '#168BFF' : '#22262E',
                color: '#FFFFFF',
                border: 'none',
                cursor: 'pointer',
                fontSize: '11px',
              }}
            >
              Conceal (Blur)
            </button>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#A4B0BE', marginBottom: '4px' }}>
              <span>Feathering</span>
              <span>{settings.highlightConceal.feathering}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={settings.highlightConceal.feathering}
              onChange={e =>
                onUpdateSettings(prev => ({
                  ...prev,
                  highlightConceal: { ...prev.highlightConceal, feathering: Number(e.target.value) },
                }))
              }
              style={{ width: '100%', accentColor: '#168BFF' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
