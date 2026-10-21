import React, { useState } from 'react';
import { SubNavSection } from '@astral/core';
import { ScarletButton } from '../common/ScarletButton';
import { IconChevronDown } from '../common/ScarletIcons';

export interface CustomFolder {
  id: string;
  name: string;
}

export interface SubNavSidebarProps {
  activeSection: SubNavSection | string;
  onSectionChange: (section: SubNavSection | string) => void;
  onDownloadAll?: () => void;
  customFolders?: CustomFolder[];
  onAddFolder?: (name: string) => void;
}

export const SubNavSidebar: React.FC<SubNavSidebarProps> = ({
  activeSection,
  onSectionChange,
  onDownloadAll,
  customFolders = [],
  onAddFolder,
}) => {
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const getItemStyle = (id: string): React.CSSProperties => {
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

  const commitNewFolder = () => {
    const trimmed = newFolderName.trim();
    if (trimmed && onAddFolder) {
      onAddFolder(trimmed);
      setNewFolderName('');
      setIsAddingFolder(false);
    } else if (!trimmed) {
      setIsAddingFolder(false);
      setNewFolderName('');
    }
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
          id="subnav-import"
          data-testid="subnav-import"
          title="Import Media"
          style={getItemStyle('import')}
          onClick={() => onSectionChange('import')}
        >
          <span>Import Media</span>
        </div>

        {/* My Files / All Files */}
        <div
          id="subnav-my-files"
          data-testid="subnav-my-files"
          style={getItemStyle('my-files')}
          onClick={() => onSectionChange('my-files')}
        >
          <span>My Files</span>
        </div>

        {/* Nested Folders */}
        <div style={{ paddingLeft: '14px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div
            id="subnav-folder-all"
            data-testid="subnav-folder-all"
            style={getItemStyle('my-files')}
            onClick={() => onSectionChange('my-files')}
          >
            <span>📁 All Files</span>
          </div>
          <div
            id="subnav-folder-landscape"
            data-testid="subnav-folder-landscape"
            style={getItemStyle('folder-landscape')}
            onClick={() => onSectionChange('folder-landscape')}
          >
            <span>📁 Landscape</span>
          </div>
          <div
            id="subnav-folder-nature"
            data-testid="subnav-folder-nature"
            style={getItemStyle('folder-nature')}
            onClick={() => onSectionChange('folder-nature')}
          >
            <span>📁 Nature</span>
          </div>
          {customFolders.map(folder => (
            <div
              key={folder.id}
              id={`subnav-folder-${folder.id}`}
              data-testid={`subnav-folder-${folder.id}`}
              style={getItemStyle(folder.id)}
              onClick={() => onSectionChange(folder.id)}
            >
              <span>📁 {folder.name}</span>
            </div>
          ))}
          {isAddingFolder ? (
            <div style={{ padding: '4px 8px', display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input
                id="input-add-folder"
                data-testid="input-add-folder"
                autoFocus
                type="text"
                value={newFolderName}
                placeholder="Folder name"
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitNewFolder();
                  if (e.key === 'Escape') {
                    setIsAddingFolder(false);
                    setNewFolderName('');
                  }
                }}
                onBlur={commitNewFolder}
                style={{
                  flex: 1,
                  backgroundColor: '#14171C',
                  border: '1px solid #168BFF',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  color: '#FFFFFF',
                  fontSize: '11px',
                  outline: 'none',
                }}
              />
            </div>
          ) : (
            <div
              id="btn-add-folder"
              data-testid="btn-add-folder"
              role="button"
              tabIndex={0}
              style={{
                padding: '6px 14px',
                fontSize: '11px',
                color: '#636E7B',
                cursor: 'pointer',
              }}
              onClick={() => setIsAddingFolder(true)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') setIsAddingFolder(true);
              }}
            >
              <span>+ Add Folder...</span>
            </div>
          )}
        </div>

        {/* Webster PS #09: Scarlet Transcript Tab */}
        <div
          id="subnav-transcript"
          data-testid="subnav-transcript"
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
          id="btn-download-all"
          data-testid="btn-download-all"
          variant="secondary"
          size="sm"
          style={{ width: '100%', fontSize: '11px' }}
          onClick={() => onDownloadAll?.()}
        >
          Download all
        </ScarletButton>
      </div>
    </nav>
  );
};
