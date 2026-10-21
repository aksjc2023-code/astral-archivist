import React, { useState } from 'react';
import { SubNavSection } from '@astral/core';
import { ScarletButton } from '../common/ScarletButton';
import { IconChevronDown } from '../common/ScarletIcons';

export interface SubNavSidebarProps {
  activeSection: SubNavSection;
  onSectionChange: (section: SubNavSection) => void;
  onDownloadAll?: () => void;
}

export const SubNavSidebar: React.FC<SubNavSidebarProps> = ({
  activeSection,
  onSectionChange,
  onDownloadAll,
}) => {
  const [libraryOpen, setLibraryOpen] = useState(true);

  const getItemStyle = (id: SubNavSection): React.CSSProperties => {
    const isActive = activeSection === id;
    return {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '7px 14px',
      fontSize: '12px',
      color: isActive ? '#FFFFFF' : '#A4B0BE',
      backgroundColor: isActive ? '#2A344B' : 'transparent',
      borderRadius: '8px',
      cursor: 'pointer',
      userSelect: 'none',
      transition: 'background-color 0.1s ease',
      fontWeight: isActive ? 500 : 400,
    };
  };

  return (
    <nav
      style={{
        width: '208px',
        backgroundColor: '#1E2229',
        borderRight: '1px solid #2B303A',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '14px 10px 12px 10px',
        overflowY: 'auto',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {/* Import */}
        <div
          style={getItemStyle('import')}
          onClick={() => onSectionChange('import')}
        >
          <span>Import</span>
        </div>

        {/* My Files */}
        <div
          style={getItemStyle('my-files')}
          onClick={() => onSectionChange('my-files')}
        >
          <span>My Files</span>
        </div>

        {/* Nested Folders */}
        <div style={{ paddingLeft: '14px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div
            style={getItemStyle('folder-landscape')}
            onClick={() => onSectionChange('folder-landscape')}
          >
            <span>📁 Landscape</span>
          </div>
          <div
            style={getItemStyle('folder-nature')}
            onClick={() => onSectionChange('folder-nature')}
          >
            <span>📁 Nature</span>
          </div>
          <div
            style={{
              padding: '6px 14px',
              fontSize: '11px',
              color: '#636E7B',
              cursor: 'pointer',
            }}
            onClick={() => alert('Folder creation simulated in local project bin')}
          >
            <span>+ Add Folder...</span>
          </div>
        </div>

        {/* Webster PS #09: Scarlet Transcript Tab */}
        <div
          style={{
            ...getItemStyle('transcript'),
            marginTop: '6px',
            marginBottom: '6px',
            border: activeSection === 'transcript' ? '1px solid #168BFF' : '1px dashed rgba(22, 139, 255, 0.4)',
            backgroundColor: activeSection === 'transcript' ? '#1A2942' : 'rgba(22, 139, 255, 0.05)',
          }}
          onClick={() => onSectionChange('transcript')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>✨ Scarlet Transcript</span>
          </div>
          <span
            style={{
              fontSize: '9px',
              fontWeight: 700,
              backgroundColor: '#168BFF',
              color: '#FFFFFF',
              borderRadius: '9999px',
              padding: '1px 6px',
              letterSpacing: '0.5px',
            }}
          >
            AI
          </span>
        </div>

        {/* Collapsible Library */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 10px 4px 10px',
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            color: '#636E7B',
            cursor: 'pointer',
            letterSpacing: '0.6px',
          }}
          onClick={() => setLibraryOpen(!libraryOpen)}
        >
          <span>Library</span>
          <div style={{ transform: libraryOpen ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s ease' }}>
            <IconChevronDown size={12} color="#636E7B" />
          </div>
        </div>

        {libraryOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: '4px' }}>
            <div style={getItemStyle('sample-video')} onClick={() => onSectionChange('sample-video')}>
              <span>Sample video</span>
            </div>
            <div style={getItemStyle('sample-audio')} onClick={() => onSectionChange('sample-audio')}>
              <span>Sample audio</span>
            </div>
            <div style={getItemStyle('sample-music')} onClick={() => onSectionChange('sample-music')}>
              <span>Sample music</span>
            </div>
            <div style={getItemStyle('backgrounds')} onClick={() => onSectionChange('backgrounds')}>
              <span>Backgrounds</span>
            </div>
            <div style={getItemStyle('stock-photos')} onClick={() => onSectionChange('stock-photos')}>
              <span>Stock photos</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Download All Pill */}
      <div style={{ paddingTop: '12px', display: 'flex', justifyContent: 'center' }}>
        <ScarletButton
          variant="secondary"
          size="sm"
          style={{ width: '100%', fontSize: '11px' }}
          onClick={onDownloadAll ?? (() => alert('Downloading all project assets archive...'))}
        >
          Download all
        </ScarletButton>
      </div>
    </nav>
  );
};
