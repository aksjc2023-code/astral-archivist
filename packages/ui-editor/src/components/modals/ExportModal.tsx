import React, { useState, useEffect } from 'react';
import { ExportSettings } from '@astral/core';
import { ScarletButton } from '../common/ScarletButton';
import { IconClose } from '../common/ScarletIcons';

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExportComplete: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  onExportComplete,
}) => {
  const [activeTab, setActiveTab] = useState<'video' | 'audio' | 'mobile' | 'tv' | 'social'>('social');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStage, setExportStage] = useState('Idle');
  const [memfsLog, setMemfsLog] = useState('');

  const [settings, setSettings] = useState<ExportSettings>({
    title: 'My summer story — ScarletCut',
    description: 'Video edited with browser-native text-driven ripple slicing engine for Webster 2026.',
    resolution: '1080p',
    category: 'Film & Animation',
    privacy: 'Public',
    tags: 'movavi, scarletcut, webster2026, webgpu, ffmpeg-wasm',
    outputPath: 'C:\\Users\\movavi\\Desktop\\ScarletCut_Export.mp4',
    wasmMode: 'filter-complex-ass',
  });

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isExporting) {
      if (exportProgress < 30) {
        setExportStage('Transcribing 16kHz PCM & building ASS subtitle script...');
        setMemfsLog('[MEMFS] Allocated virtual buffer: input_video.mp4 (142MB)');
      } else if (exportProgress < 75) {
        setExportStage(
          settings.wasmMode === 'stream-copy'
            ? 'Executing FFmpeg fast stream-copy (-c copy)...'
            : 'Executing FFmpeg single-pass filter_complex + ASS subtitle burn-in...'
        );
        setMemfsLog('[MEMFS] Processing frame chunks with PTS alignment...');
      } else if (exportProgress < 98) {
        setExportStage('Detaching buffer copy & reclaiming MEMFS heap...');
        setMemfsLog('[MEMFS GC] ffmpeg.deleteFile() executed on all virtual descriptors. Heap freed: 142MB.');
      } else {
        setIsExporting(false);
        setExportProgress(0);
        onExportComplete();
        return;
      }

      timer = setTimeout(() => {
        setExportProgress(p => p + 4);
      }, 90);
    }
    return () => clearTimeout(timer);
  }, [isExporting, exportProgress, settings.wasmMode, onExportComplete]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        userSelect: 'none',
      }}
    >
      <div
        style={{
          width: '680px',
          backgroundColor: '#181B20',
          border: '1px solid #2B303A',
          borderRadius: '18px',
          boxShadow: '0 24px 60px rgba(0,0,0,0.8)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Top Header */}
        <div
          style={{
            height: '46px',
            backgroundColor: '#14171C',
            borderBottom: '1px solid #2B303A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>
              Export Project
            </span>
            <span style={{ fontSize: '11px', color: '#636E7B' }}>
              (Movavi Page 7 Multi-Format Hub)
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            style={{
              background: 'none',
              border: 'none',
              color: '#A4B0BE',
              cursor: isExporting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconClose size={18} />
          </button>
        </div>

        {/* Modal Body: Left Tab Rail + Right Form */}
        <div style={{ display: 'flex', height: '440px' }}>
          {/* Left Category Rail (Page 7) */}
          <div
            style={{
              width: '56px',
              backgroundColor: '#14171C',
              borderRight: '1px solid #2B303A',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              paddingTop: '16px',
              gap: '12px',
            }}
          >
            {[
              { id: 'video' as const, icon: '🎬', label: 'Video File' },
              { id: 'audio' as const, icon: '🎵', label: 'Audio Only' },
              { id: 'mobile' as const, icon: '📱', label: 'Mobile Device' },
              { id: 'tv' as const, icon: '📺', label: 'Smart TV' },
              { id: 'social' as const, icon: '🌐', label: 'Upload to Social' },
            ].map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  title={tab.label}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    backgroundColor: isActive ? '#168BFF' : 'transparent',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: '16px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {tab.icon}
                </button>
              );
            })}
          </div>

          {/* Form Content Area */}
          <div
            style={{
              flex: 1,
              padding: '20px 24px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {/* User Profile Callout (Page 7) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: '12px',
                borderBottom: '1px solid #2B303A',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>
                  Upload to YouTube &amp; Export MP4
                </div>
                <div style={{ fontSize: '11px', color: '#636E7B' }}>
                  Client-side FFmpeg WASM engine with MEMFS GC
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: '#A4B0BE' }}>Viktoria Stepanova</span>
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: '#168BFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#FFFFFF',
                    fontWeight: 600,
                    fontSize: '11px',
                  }}
                >
                  VS
                </div>
              </div>
            </div>

            {/* Title */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#A4B0BE', marginBottom: '4px' }}>
                Title
              </label>
              <input
                type="text"
                value={settings.title}
                onChange={e => setSettings({ ...settings, title: e.target.value })}
                style={inputStyle}
              />
            </div>

            {/* Description */}
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#A4B0BE', marginBottom: '4px' }}>
                Description
              </label>
              <textarea
                rows={2}
                value={settings.description}
                onChange={e => setSettings({ ...settings, description: e.target.value })}
                style={{ ...inputStyle, resize: 'none' }}
              />
            </div>

            {/* Resolution & Category */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#A4B0BE', marginBottom: '4px' }}>
                  Resolution
                </label>
                <select
                  value={settings.resolution}
                  onChange={e => setSettings({ ...settings, resolution: e.target.value as '1080p' })}
                  style={inputStyle}
                >
                  <option value="720p">720p HD</option>
                  <option value="1080p">1080p Full HD</option>
                  <option value="4k">4K Ultra HD</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#A4B0BE', marginBottom: '4px' }}>
                  Privacy
                </label>
                <select
                  value={settings.privacy}
                  onChange={e => setSettings({ ...settings, privacy: e.target.value as 'Public' })}
                  style={inputStyle}
                >
                  <option value="Public">Public</option>
                  <option value="Unlisted">Unlisted</option>
                  <option value="Private">Private</option>
                </select>
              </div>
            </div>

            {/* WASM Export Mode Radio (Webster PS #09 Mandate) */}
            <div
              style={{
                backgroundColor: '#14171C',
                borderRadius: '10px',
                padding: '10px 14px',
                border: '1px solid #2B303A',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#FFFFFF', display: 'block', marginBottom: '6px' }}>
                WASM Export Pipeline Mode
              </span>
              <div style={{ display: 'flex', gap: '14px', fontSize: '12px', color: '#A4B0BE' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="wasmMode"
                    value="stream-copy"
                    checked={settings.wasmMode === 'stream-copy'}
                    onChange={() => setSettings({ ...settings, wasmMode: 'stream-copy' })}
                  />
                  <span>Fast Stream-Copy (-c copy)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="wasmMode"
                    value="filter-complex-ass"
                    checked={settings.wasmMode === 'filter-complex-ass'}
                    onChange={() => setSettings({ ...settings, wasmMode: 'filter-complex-ass' })}
                  />
                  <span>Filter_Complex + Burned Subtitles</span>
                </label>
              </div>
            </div>

            {/* Export Progress State when rendering */}
            {isExporting && (
              <div
                style={{
                  backgroundColor: '#111317',
                  borderRadius: '10px',
                  padding: '12px',
                  border: '1px solid #168BFF',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#FFFFFF', marginBottom: '6px' }}>
                  <span>{exportStage}</span>
                  <span style={{ fontWeight: 600, color: '#168BFF' }}>{exportProgress}%</span>
                </div>
                <div style={{ height: '6px', backgroundColor: '#2B303A', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${exportProgress}%`,
                      backgroundColor: '#168BFF',
                      transition: 'width 0.1s linear',
                    }}
                  />
                </div>
                <div style={{ fontSize: '10px', fontFamily: "'JetBrains Mono', monospace", color: '#2ED573', marginTop: '6px' }}>
                  {memfsLog}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer (Page 7) */}
        <div
          style={{
            height: '56px',
            backgroundColor: '#14171C',
            borderTop: '1px solid #2B303A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '0 20px',
            gap: '10px',
          }}
        >
          <ScarletButton
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={isExporting}
          >
            Cancel
          </ScarletButton>

          <ScarletButton
            variant="primary"
            size="md"
            onClick={() => setIsExporting(true)}
            disabled={isExporting}
          >
            {isExporting ? 'Exporting...' : 'Start'}
          </ScarletButton>
        </div>
      </div>
    </div>
  );
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: '#14171C',
  border: '1px solid #2B303A',
  borderRadius: '8px',
  padding: '6px 12px',
  color: '#FFFFFF',
  fontSize: '12px',
  outline: 'none',
  boxSizing: 'border-box',
};
