import React from 'react';
import { ScarletButton } from '../common/ScarletButton';

export interface ExportReadyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  outputPath?: string;
}

export const ExportReadyDialog: React.FC<ExportReadyDialogProps> = ({
  isOpen,
  onClose,
  outputPath = 'C:\\Users\\movavi\\Desktop\\ScarletCut_Export.mp4',
}) => {
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
        {/* Blue Info Icon Circle (Page 7) */}
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

        {/* Heading & Body (Page 7) */}
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#FFFFFF', margin: 0, marginBottom: '6px' }}>
            Your video is ready!
          </h2>
          <p style={{ fontSize: '12px', color: '#A4B0BE', lineHeight: '1.5', margin: 0 }}>
            The video file has been saved successfully. Don't forget to save your project in case you want to edit it later.
          </p>
        </div>

        {/* Output Path Link */}
        <div
          onClick={() => alert(`Saved to: ${outputPath}`)}
          style={{
            fontSize: '11px',
            color: '#168BFF',
            cursor: 'pointer',
            backgroundColor: '#14171C',
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid #2B303A',
            width: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={outputPath}
        >
          Explore the output folder 📁 {outputPath}
        </div>

        {/* Actions (Page 7: Cancel & OK) */}
        <div style={{ display: 'flex', gap: '10px', width: '100%', justifyContent: 'center', marginTop: '6px' }}>
          <ScarletButton
            variant="secondary"
            size="md"
            onClick={onClose}
            style={{ minWidth: '100px' }}
          >
            Cancel
          </ScarletButton>

          <ScarletButton
            variant="primary"
            size="md"
            onClick={onClose}
            style={{ minWidth: '100px' }}
          >
            OK
          </ScarletButton>
        </div>
      </div>
    </div>
  );
};
