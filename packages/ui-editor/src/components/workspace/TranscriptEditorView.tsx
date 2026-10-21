import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WordToken } from '@astral/core';
import { ScarletButton } from '../common/ScarletButton';
import { IconLightning, IconSparkles } from '../common/ScarletIcons';

export interface TranscriptEditorViewProps {
  tokens: WordToken[];
  currentTime: number;
  onToggleDeleteToken: (tokenId: string) => void;
  onToggleDeleteMultipleTokens?: (tokenIds: string[]) => void;
  onPurgeFillers: () => void;
  onRestoreAllTokens: () => void;
  onEditTokenText?: (tokenId: string, newText: string) => void;
  onSeekToTime?: (time: number) => void;
  onTranscribeCurrentMedia?: () => void;
  isTranscribing?: boolean;
}

export const TranscriptEditorView: React.FC<TranscriptEditorViewProps> = ({
  tokens,
  currentTime,
  onToggleDeleteToken,
  onToggleDeleteMultipleTokens,
  onPurgeFillers,
  onRestoreAllTokens,
  onEditTokenText,
  onSeekToTime,
  onTranscribeCurrentMedia,
  isTranscribing = false,
}) => {
  const [editingTokenId, setEditingTokenId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [selectedTokenIds, setSelectedTokenIds] = useState<Set<string>>(new Set());
  const lastSelectedIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeToken = tokens.find(t => !t.deleted && currentTime >= t.start && currentTime <= t.end);
  const deletedCount = tokens.filter(t => t.deleted).length;
  const fillerCount = tokens.filter(t => t.isFiller || t.isPause).length;
  const discourseCount = tokens.filter(t => t.isDiscourseMarker && !t.isFiller).length;

  // Handle Token Click (Selection & Playhead Seek)
  const handleTokenClick = (token: WordToken, e: React.MouseEvent) => {
    e.stopPropagation();

    if (token.deleted) {
      // Clicking a deleted token restores it
      onToggleDeleteToken(token.id);
      return;
    }

    if (e.shiftKey && lastSelectedIdRef.current) {
      // Range selection
      const idx1 = tokens.findIndex(t => t.id === lastSelectedIdRef.current);
      const idx2 = tokens.findIndex(t => t.id === token.id);
      if (idx1 !== -1 && idx2 !== -1) {
        const start = Math.min(idx1, idx2);
        const end = Math.max(idx1, idx2);
        const newSet = new Set(selectedTokenIds);
        for (let i = start; i <= end; i++) {
          const t = tokens[i];
          if (t) newSet.add(t.id);
        }
        setSelectedTokenIds(newSet);
      }
    } else if (e.ctrlKey || e.metaKey) {
      // Toggle single selection
      const newSet = new Set(selectedTokenIds);
      if (newSet.has(token.id)) {
        newSet.delete(token.id);
      } else {
        newSet.add(token.id);
      }
      setSelectedTokenIds(newSet);
      lastSelectedIdRef.current = token.id;
    } else {
      // Normal click: select this token & seek playhead
      setSelectedTokenIds(new Set([token.id]));
      lastSelectedIdRef.current = token.id;
      if (onSeekToTime) {
        onSeekToTime(token.start);
      }
    }
  };

  // Keyboard shortcut: Backspace or Delete to ripple-cut selected tokens
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (editingTokenId) return; // Don't cut while editing text

      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (selectedTokenIds.size > 0) {
          e.preventDefault();
          const idsToCut = Array.from(selectedTokenIds);
          if (onToggleDeleteMultipleTokens) {
            onToggleDeleteMultipleTokens(idsToCut);
          } else {
            idsToCut.forEach(id => onToggleDeleteToken(id));
          }
          setSelectedTokenIds(new Set());
        }
      } else if (e.key === 'Escape') {
        setSelectedTokenIds(new Set());
      }
    },
    [editingTokenId, selectedTokenIds, onToggleDeleteMultipleTokens, onToggleDeleteToken]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleStartEdit = (token: WordToken, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTokenId(token.id);
    setEditText(token.text);
  };

  const handleSaveEdit = (tokenId: string) => {
    if (onEditTokenText && editText.trim()) {
      onEditTokenText(tokenId, editText.trim());
    }
    setEditingTokenId(null);
  };

  const handleCutSelected = () => {
    if (selectedTokenIds.size === 0) return;
    const idsToCut = Array.from(selectedTokenIds);
    if (onToggleDeleteMultipleTokens) {
      onToggleDeleteMultipleTokens(idsToCut);
    } else {
      idsToCut.forEach(id => onToggleDeleteToken(id));
    }
    setSelectedTokenIds(new Set());
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onClick={() => setSelectedTokenIds(new Set())}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#181B20',
        padding: '16px 20px',
        overflowY: 'auto',
        outline: 'none',
      }}
    >
      {/* Top Action Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          paddingBottom: '12px',
          borderBottom: '1px solid #2B303A',
          flexWrap: 'wrap',
          gap: '10px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#FFFFFF', margin: 0 }}>
              Scarlet Transcript Editor
            </h2>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                backgroundColor: '#168BFF',
                color: '#FFFFFF',
                borderRadius: '9999px',
                padding: '2px 8px',
              }}
            >
              Zero-SSR Ripple Engine
            </span>
          </div>
          <span style={{ fontSize: '11px', color: '#8A96A6', marginTop: '3px', display: 'block' }}>
            Select words and press <kbd style={{ backgroundColor: '#2B303A', padding: '1px 5px', borderRadius: '4px' }}>Backspace</kbd> to ripple-cut video in &lt;0.4ms. Double-click to AI overdub.
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {onTranscribeCurrentMedia && (
            <ScarletButton
              variant="secondary"
              size="sm"
              icon={<IconSparkles size={13} color="#2ED573" />}
              onClick={onTranscribeCurrentMedia}
              disabled={isTranscribing}
            >
              {isTranscribing ? 'Transcribing (WebGPU)...' : 'Run WebGPU Whisper'}
            </ScarletButton>
          )}

          {selectedTokenIds.size > 0 && (
            <ScarletButton
              variant="additional-v2"
              size="sm"
              onClick={handleCutSelected}
              style={{ color: '#FF4757', borderColor: '#FF4757' }}
            >
              Cut Selected ({selectedTokenIds.size})
            </ScarletButton>
          )}

          {deletedCount > 0 && (
            <ScarletButton
              variant="secondary"
              size="sm"
              onClick={onRestoreAllTokens}
            >
              Restore All ({deletedCount})
            </ScarletButton>
          )}

          <ScarletButton
            variant="additional-v1"
            size="sm"
            icon={<IconLightning size={14} color="#FFA502" />}
            onClick={onPurgeFillers}
          >
            Purge Fillers &amp; Pauses ({fillerCount})
          </ScarletButton>
        </div>
      </div>

      {/* Filler & Discourse Legend Strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          marginBottom: '12px',
          fontSize: '11px',
          color: '#8A96A6',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '8px', height: '8px', backgroundColor: '#FFA502', borderRadius: '50%' }} />
          Hard Filler ({fillerCount - tokens.filter(t => t.isPause).length})
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '8px', height: '8px', backgroundColor: '#ECCC68', borderRadius: '50%' }} />
          Discourse Marker ({discourseCount})
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '8px', height: '8px', backgroundColor: '#70A1FF', borderRadius: '50%' }} />
          Silence Pause &gt;0.5s ({tokens.filter(t => t.isPause).length})
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '8px', height: '8px', backgroundColor: '#8854D0', borderRadius: '50%' }} />
          AI TTS Overdub
        </span>
      </div>

      {/* Interactive Word Token Flow */}
      <div
        style={{
          backgroundColor: '#14171C',
          borderRadius: '14px',
          padding: '22px',
          border: '1px solid #2B303A',
          lineHeight: '2.5',
          fontSize: '15px',
          userSelect: 'none',
          minHeight: '200px',
        }}
      >
        {tokens.map((token) => {
          const isKaraokeActive = activeToken?.id === token.id;
          const isSelected = selectedTokenIds.has(token.id);
          const isDeleted = token.deleted;

          if (editingTokenId === token.id) {
            return (
              <span
                key={token.id}
                onClick={e => e.stopPropagation()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  backgroundColor: '#2A313C',
                  borderRadius: '6px',
                  padding: '2px 6px',
                  margin: '0 3px',
                }}
              >
                <input
                  type="text"
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSaveEdit(token.id);
                    if (e.key === 'Escape') setEditingTokenId(null);
                  }}
                  autoFocus
                  style={{
                    backgroundColor: '#14171C',
                    color: '#FFFFFF',
                    border: '1px solid #8854D0',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontSize: '13px',
                    outline: 'none',
                    width: '100px',
                  }}
                />
                <button
                  type="button"
                  onClick={() => handleSaveEdit(token.id)}
                  style={{
                    backgroundColor: '#8854D0',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Save
                </button>
              </span>
            );
          }

          // Synthetic Silence Pause Token
          if (token.isPause) {
            return (
              <span
                key={token.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleDeleteToken(token.id);
                }}
                title={isDeleted ? 'Cut silence pause (Click to restore)' : 'Click or Backspace to cut silence pause'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  fontSize: '11px',
                  fontFamily: "'JetBrains Mono', monospace",
                  backgroundColor: isDeleted ? 'rgba(255, 71, 87, 0.15)' : 'rgba(112, 161, 255, 0.15)',
                  color: isDeleted ? '#FF4757' : '#70A1FF',
                  border: isDeleted ? '1px dashed #FF4757' : '1px solid #3B4250',
                  textDecoration: isDeleted ? 'line-through' : 'none',
                  borderRadius: '6px',
                  padding: '1px 8px',
                  margin: '0 4px',
                  cursor: 'pointer',
                  opacity: isDeleted ? 0.4 : 0.9,
                  transition: 'all 0.12s ease',
                }}
              >
                ⏱ {token.text}
              </span>
            );
          }

          return (
            <span
              key={token.id}
              onClick={e => handleTokenClick(token, e)}
              onDoubleClick={e => handleStartEdit(token, e)}
              title={`[${token.start.toFixed(2)}s - ${token.end.toFixed(2)}s] ${
                token.isFiller ? '(Hard Filler) ' : token.isDiscourseMarker ? '(Discourse Marker) ' : ''
              }Click to select/seek, Backspace to cut, Double-click to AI overdub`}
              style={{
                position: 'relative',
                display: 'inline-block',
                padding: '2px 6px',
                margin: '0 2px',
                borderRadius: '6px',
                cursor: 'pointer',
                transition: 'all 0.12s ease',
                backgroundColor: isKaraokeActive
                  ? '#168BFF'
                  : isSelected
                  ? '#2B5278'
                  : isDeleted
                  ? 'rgba(255, 71, 87, 0.12)'
                  : token.isEdited
                  ? 'rgba(136, 84, 208, 0.2)'
                  : 'transparent',
                color: isKaraokeActive
                  ? '#FFFFFF'
                  : isDeleted
                  ? '#FF4757'
                  : token.isFiller
                  ? '#FFA502'
                  : token.isDiscourseMarker
                  ? '#ECCC68'
                  : '#FFFFFF',
                textDecoration: isDeleted ? 'line-through' : 'none',
                opacity: isDeleted ? 0.35 : 1,
                border: isKaraokeActive
                  ? '1px solid #329AFF'
                  : isSelected
                  ? '1px solid #168BFF'
                  : isDeleted
                  ? '1px dashed #FF4757'
                  : token.isEdited
                  ? '1px solid #8854D0'
                  : '1px solid transparent',
                boxShadow: isKaraokeActive
                  ? '0 0 10px rgba(22, 139, 255, 0.55)'
                  : isSelected
                  ? '0 0 8px rgba(22, 139, 255, 0.35)'
                  : 'none',
                fontWeight: isKaraokeActive ? 600 : isSelected ? 500 : 400,
              }}
            >
              {token.text}

              {/* Hard Filler Indicator */}
              {token.isFiller && !isDeleted && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: '0',
                    left: '6px',
                    right: '6px',
                    height: '2px',
                    backgroundColor: '#FFA502',
                    borderRadius: '1px',
                  }}
                />
              )}

              {/* Discourse Marker Indicator */}
              {token.isDiscourseMarker && !token.isFiller && !isDeleted && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: '0',
                    left: '6px',
                    right: '6px',
                    height: '2px',
                    backgroundColor: '#ECCC68',
                    borderRadius: '1px',
                  }}
                />
              )}

              {/* AI Overdub Badge (Softablitz A2) */}
              {token.isEdited && (
                <span
                  style={{
                    marginLeft: '4px',
                    fontSize: '9px',
                    backgroundColor: '#8854D0',
                    color: '#FFFFFF',
                    borderRadius: '4px',
                    padding: '0 4px',
                  }}
                >
                  TTS
                </span>
              )}

              {/* B-Roll Keyword Badge */}
              {token.brollKeyword && !isDeleted && (
                <span
                  style={{
                    marginLeft: '4px',
                    fontSize: '9px',
                    backgroundColor: '#2ED573',
                    color: '#111317',
                    fontWeight: 700,
                    borderRadius: '4px',
                    padding: '0 4px',
                  }}
                >
                  B-ROLL
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
};
