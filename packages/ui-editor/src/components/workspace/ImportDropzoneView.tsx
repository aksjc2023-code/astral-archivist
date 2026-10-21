import React, { useRef } from 'react';
import { ScarletButton } from '../common/ScarletButton';
import {
  IconWebcam,
  IconScreencast,
  IconMicrophone,
  IconSparkles,
} from '../common/ScarletIcons';

export interface ImportDropzoneViewProps {
  onFilesAdded?: (files: File[]) => void;
  onQuickAction?: (action: 'record-video' | 'capture-screen' | 'record-audio' | 'quick-video') => void;
}

export const ImportDropzoneView: React.FC<ImportDropzoneViewProps> = ({
  onFilesAdded,
  onQuickAction,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && onFilesAdded) {
      onFilesAdded(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0 && onFilesAdded) {
      onFilesAdded(files);
    }
    // Reset file input value so re-selecting same file fires change
    e.target.value = '';
  };

  const captureCards = [
    {
      id: 'record-video' as const,
      title: 'Record Video',
      icon: <IconWebcam size={26} color="#168BFF" />,
      subtext: 'Webcam capture (Preview)',
    },
    {
      id: 'capture-screen' as const,
      title: 'Capture Screencast',
      icon: <IconScreencast size={26} color="#2ED573" />,
      subtext: 'Screen & App window (Preview)',
    },
    {
      id: 'record-audio' as const,
      title: 'Record Audio',
      icon: <IconMicrophone size={26} color="#FFA502" />,
      subtext: 'Mic vocal purifier (Preview)',
    },
    {
      id: 'quick-video' as const,
      title: 'Quick Video',
      icon: <IconSparkles size={26} color="#8854D0" />,
      subtext: 'AI auto-montage (Preview)',
    },
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
      <h2 style={{ fontSize: '18px', fontWeight: 500, color: '#FFFFFF', marginBottom: '14px', margin: 0 }}>
        Import
      </h2>

      {/* Hidden Native File Input for real file picking */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="video/*,audio/*,image/*"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      {/* Main Dashed Dropzone Well (Page 2 & 10) */}
      <div
        role="region"
        aria-label="Media File Dropzone"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: '2px dashed #343B48',
          borderRadius: '16px',
          backgroundColor: 'rgba(20, 23, 28, 0.7)',
          padding: '36px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.borderColor = '#168BFF';
          (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(22, 139, 255, 0.05)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.borderColor = '#343B48';
          (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(20, 23, 28, 0.7)';
        }}
      >
        <ScarletButton
          variant="additional-v2"
          size="lg"
          onClick={e => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          onDropdownClick={e => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
        >
          + Add Files
        </ScarletButton>

        <p style={{ fontSize: '13px', color: '#A4B0BE', margin: 0, marginTop: '4px' }}>
          Drop files or folders here, or click to browse
        </p>
        <span style={{ fontSize: '11px', color: '#636E7B' }}>
          Supported: MP4, MOV, WebM, MP3, WAV, PNG, JPEG
        </span>
      </div>

      {/* 4 Quick-Capture Square Cards (Page 10 - Mock Controls) */}
      <div style={{ marginTop: '20px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: 500, color: '#A4B0BE', marginBottom: '12px', margin: 0 }}>
          Quick Capture & Studio Tools (Prototype Controls)
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: '12px',
            marginTop: '10px',
          }}
        >
          {captureCards.map(card => (
            <div
              key={card.id}
              role="button"
              tabIndex={0}
              aria-label={`${card.title} tool`}
              onClick={() => onQuickAction?.(card.id)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') onQuickAction?.(card.id);
              }}
              style={{
                backgroundColor: '#22262E',
                borderRadius: '12px',
                padding: '16px 12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                gap: '8px',
                cursor: 'pointer',
                border: '1px solid #2B303A',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLElement).style.borderColor = '#168BFF';
                (e.currentTarget as HTMLElement).style.backgroundColor = '#2A313C';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLElement).style.borderColor = '#2B303A';
                (e.currentTarget as HTMLElement).style.backgroundColor = '#22262E';
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  backgroundColor: '#181B20',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {card.icon}
              </div>
              <span style={{ fontSize: '12px', fontWeight: 500, color: '#FFFFFF' }}>
                {card.title}
              </span>
              <span style={{ fontSize: '10px', color: '#636E7B' }}>
                {card.subtext}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
