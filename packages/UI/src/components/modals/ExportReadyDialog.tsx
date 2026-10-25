import React from 'react';
import { ScarletButton } from '../common/ScarletButton';

export interface ExportReadyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  outputPath?: string;
  downloadUrl?: string | null;
  fileName?: string;
}

export const ExportReadyDialog: React.FC<ExportReadyDialogProps> = ({
  isOpen,
  onClose,
  outputPath = 'ScarletCut_Export.mp4',
  downloadUrl,
  fileName = 'ScarletCut_Export_2026.mp4',
}) => {
  if (!isOpen) return null;

  const triggerDownload = () => {
    if (!downloadUrl) return;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

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
        zIndex: 110,
        userSelect: 'none',
      }}
    >
      <div
        style={{
          width: '440px',
          backgroundColor: '#1E2229',
          border: '1px solid #2B303A',
          borderRadius: '16px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '14px',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'rgba(22, 139, 255, 0.15)',
            border: '2px solid #168BFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#168BFF',
            fontSize: '22px',
            fontWeight: 700,
          }}
        >
          i
        </div>

        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#FFFFFF', margin: 0, marginBottom: '6px' }}>
            Your video is ready!
          </h2>
          <p style={{ fontSize: '12px', color: '#A4B0BE', lineHeight: '1.5', margin: 0 }}>
            The video file has been saved successfully. Don&apos;t forget to save your project in case you want to edit it later.
          </p>
        </div>

        <div
          id="btn-download-export-ready"
          data-testid="btn-download-export-ready"
          role="button"
          tabIndex={0}
          onClick={triggerDownload}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') triggerDownload();
          }}
          style={{
            fontSize: '11px',
            color: downloadUrl ? '#168BFF' : '#636E7B',
            cursor: downloadUrl ? 'pointer' : 'default',
            backgroundColor: '#14171C',
            padding: '8px 14px',
            borderRadius: '6px',
            border: `1px solid ${downloadUrl ? '#168BFF' : '#2B303A'}`,
            width: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: 600,
          }}
          title={downloadUrl ? 'Click to download exported file' : 'Export blob unavailable'}
        >
          {downloadUrl ? `⬇ Download Exported File: ${fileName}` : `Saved path: ${outputPath}`}
        </div>

        <div style={{ display: 'flex', gap: '10px', width: '100%', justifyContent: 'center', marginTop: '6px' }}>
          <ScarletButton
            variant="secondary"
            size="md"
            onClick={onClose}
            style={{ minWidth: '100px' }}
          >
            Close
          </ScarletButton>

          <ScarletButton
            variant="primary"
            size="md"
            onClick={() => {
              triggerDownload();
              onClose();
            }}
            disabled={!downloadUrl}
            style={{ minWidth: '120px' }}
          >
            Download &amp; Close
          </ScarletButton>
        </div>
      </div>
    </div>
  );
};
