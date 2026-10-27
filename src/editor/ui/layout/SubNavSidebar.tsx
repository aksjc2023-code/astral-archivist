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
  onDeleteFolder?: (folderId: string) => void;
}

export const SubNavSidebar: React.FC<SubNavSidebarProps> = ({
  activeSection,
  onSectionChange,
  onDownloadAll,
  customFolders = [],
  onAddFolder,
  onDeleteFolder,
}) => {
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; folderId: string } | null>(null);

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

  const handleFolderContextMenu = (e: React.MouseEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, folderId });
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
        position: 'relative',
      }}
      onClick={() => setContextMenu(null)}
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

        {/* My Files (Default Single Folder) */}
        <div
          id="subnav-my-files"
          data-testid="subnav-my-files"
          style={getItemStyle('my-files')}
          onClick={() => onSectionChange('my-files')}
        >
          <span>📁 My Files</span>
        </div>

        {/* User-created Nested Folders */}
        <div style={{ paddingLeft: '14px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {customFolders.map(folder => (
            <div
              key={folder.id}
              id={`subnav-folder-${folder.id}`}
              data-testid={`subnav-folder-${folder.id}`}
              style={getItemStyle(folder.id)}
              onClick={() => onSectionChange(folder.id)}
              onContextMenu={(e) => handleFolderContextMenu(e, folder.id)}
              title="Click to open • Right-click to delete folder"
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

        {/* Scarlet Transcript Tab */}
        <div
          id="subnav-transcript"
          data-testid="subnav-transcript"
          style={{
            ...getItemStyle('transcript'),
            marginTop: '8px',
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
      </div>

      {/* Context Menu for Folder Deletion */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            backgroundColor: '#181B20',
            border: '1px solid #343B48',
            borderRadius: '8px',
            padding: '4px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            zIndex: 99999,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              if (onDeleteFolder) {
                onDeleteFolder(contextMenu.folderId);
              }
              setContextMenu(null);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'transparent',
              border: 'none',
              color: '#FF6B81',
              padding: '6px 12px',
              fontSize: '12px',
              borderRadius: '6px',
              cursor: 'pointer',
              width: '100%',
              textAlign: 'left',
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(255, 107, 129, 0.15)')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.backgroundColor = 'transparent')}
          >
            <span>🗑️ Delete Folder</span>
          </button>
        </div>
      )}

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
