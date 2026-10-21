import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WordToken, MediaAsset } from '@astral/core';
import { ScarletButton } from '../common/ScarletButton';
import { IconLightning, IconSparkles } from '../common/ScarletIcons';

export interface TranscriptEditorViewProps {
  tokens: WordToken[];
  currentTime: number;
  mediaAssets?: MediaAsset[];
  activeMediaId?: string;
  onSelectMediaId?: (mediaId: string) => void;
  onToggleDeleteToken: (tokenId: string) => void;
  onToggleDeleteMultipleTokens?: (tokenIds: string[]) => void;
  onPurgeFillers: () => void;
  onRestoreAllTokens: () => void;
  onEditTokenText?: (tokenId: string, newText: string) => void;
  onSeekToTime?: (time: number) => void;
  onTranscribeCurrentMedia?: () => void;
  onFastGenerateTranscript?: (mediaId: string) => void;
  isTranscribing?: boolean;
}

export const TranscriptEditorView: React.FC<TranscriptEditorViewProps> = ({
  tokens,
  currentTime,
  mediaAssets,
  activeMediaId,
  onSelectMediaId,
  onToggleDeleteToken,
  onToggleDeleteMultipleTokens,
  onPurgeFillers,
  onRestoreAllTokens,
  onEditTokenText,
  onSeekToTime,
  onTranscribeCurrentMedia,
  onFastGenerateTranscript,
  isTranscribing = false,
}) => {
  const [showMediaDropdown, setShowMediaDropdown] = useState(false);
  const activeAsset = mediaAssets?.find(a => a.id === activeMediaId);
  const [editingTokenId, setEditingTokenId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [selectedTokenIds, setSelectedTokenIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMatchIndex, setSearchMatchIndex] = useState(0);
  const lastSelectedIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const searchMatches = searchQuery.trim()
    ? tokens.filter(t => t.text.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : [];

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
    setEditText(token.replacementText ?? token.text);
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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

            {/* Media Asset Selector Dropdown */}
            {mediaAssets && mediaAssets.length > 0 && (
              <div style={{ position: 'relative' }}>
                <button
                  id="btn-transcript-asset-dropdown"
                  data-testid="btn-transcript-asset-dropdown"
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    setShowMediaDropdown(!showMediaDropdown);
                  }}
                  style={{
                    backgroundColor: '#22262E',
                    border: '1px solid #3B4F6B',
                    color: '#FFFFFF',
                    padding: '3px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                  }}
                  title="Switch Active Media File Transcript"
                >
                  <span style={{ fontSize: '12px' }}>🎬</span>
                  <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {activeAsset?.name ?? 'Select Media'}
                  </span>
                  <span style={{ fontSize: '8px', color: '#168BFF' }}>▼</span>
                </button>

                {showMediaDropdown && (
                  <div
                    onClick={e => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: '4px',
                      backgroundColor: '#1E222B',
                      border: '1px solid #168BFF',
                      borderRadius: '8px',
                      zIndex: 9999,
                      minWidth: '220px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.85)',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ padding: '6px 10px', fontSize: '10px', fontWeight: 600, color: '#8A96A6', borderBottom: '1px solid #2B303A' }}>
                      SELECT MEDIA FILE TO EDIT
                    </div>
                    {mediaAssets
                      .filter(a => a.type === 'video' || a.type === 'audio')
                      .map(asset => (
                        <div
                          key={asset.id}
                          id={`opt-transcript-asset-${asset.id}`}
                          data-testid={`opt-transcript-asset-${asset.id}`}
                          onClick={() => {
                            onSelectMediaId?.(asset.id);
                            setShowMediaDropdown(false);
                          }}
                          style={{
                            padding: '8px 12px',
                            fontSize: '11px',
                            color: asset.id === activeMediaId ? '#168BFF' : '#FFFFFF',
                            backgroundColor: asset.id === activeMediaId ? '#1A2A44' : 'transparent',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
                            {asset.name}
                          </span>
                          <span style={{ fontSize: '10px', color: '#8A96A6' }}>{asset.duration}s</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <span style={{ fontSize: '11px', color: '#8A96A6', marginTop: '3px', display: 'block' }}>
            Select words and press <kbd style={{ backgroundColor: '#2B303A', padding: '1px 5px', borderRadius: '4px' }}>Backspace</kbd> to ripple-cut video in &lt;0.4ms. Double-click to AI overdub.
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {onFastGenerateTranscript && (
            <ScarletButton
              id="btn-fast-generate-tokens"
              variant="secondary"
              size="sm"
              icon={<IconLightning size={13} color="#FFA502" />}
              onClick={() => onFastGenerateTranscript(activeMediaId ?? 'asset_1')}
              title="Instantly generate mock speech tokens for this clip"
            >
              Fast Generate Tokens
            </ScarletButton>
          )}

          {onTranscribeCurrentMedia && (
            <ScarletButton
              id="btn-run-webgpu-whisper"
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
              id="btn-cut-selected-tokens"
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
              id="btn-restore-all-tokens"
              variant="secondary"
              size="sm"
              onClick={onRestoreAllTokens}
            >
              Restore All ({deletedCount})
            </ScarletButton>
          )}

          <ScarletButton
            id="btn-purge-fillers"
            variant="additional-v1"
            size="sm"
            icon={<IconLightning size={14} color="#FFA502" />}
            onClick={onPurgeFillers}
          >
            Purge Fillers &amp; Pauses ({fillerCount})
          </ScarletButton>
        </div>
      </div>

      {/* Transcript Search Filter */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '12px',
        }}
      >
        <input
          id="input-transcript-search"
          data-testid="input-transcript-search"
          type="search"
          placeholder="Filter transcript words…"
          value={searchQuery}
          onChange={e => {
            setSearchQuery(e.target.value);
            setSearchMatchIndex(0);
          }}
          onClick={e => e.stopPropagation()}
          style={{
            flex: 1,
            maxWidth: '280px',
            backgroundColor: '#111317',
            border: '1px solid #2B303A',
            borderRadius: '9999px',
            padding: '6px 14px',
            color: '#FFFFFF',
            fontSize: '12px',
            outline: 'none',
          }}
        />
        {searchMatches.length > 0 && (
          <>
            <span style={{ fontSize: '11px', color: '#A4B0BE' }}>
              {Math.min(searchMatchIndex + 1, searchMatches.length)} / {searchMatches.length}
            </span>
            <button
              id="btn-transcript-search-prev"
              type="button"
              onClick={e => {
                e.stopPropagation();
                const next = (searchMatchIndex - 1 + searchMatches.length) % searchMatches.length;
                setSearchMatchIndex(next);
                const token = searchMatches[next];
                if (token && onSeekToTime) onSeekToTime(token.start);
              }}
              style={{
                backgroundColor: '#22262E',
                border: '1px solid #2B303A',
                color: '#FFFFFF',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              ↑
            </button>
            <button
              id="btn-transcript-search-next"
              type="button"
              onClick={e => {
                e.stopPropagation();
                const next = (searchMatchIndex + 1) % searchMatches.length;
                setSearchMatchIndex(next);
                const token = searchMatches[next];
                if (token && onSeekToTime) onSeekToTime(token.start);
              }}
              style={{
                backgroundColor: '#22262E',
                border: '1px solid #2B303A',
                color: '#FFFFFF',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              ↓
            </button>
          </>
        )}
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

      {/* Empty State Card if no tokens loaded */}
      {tokens.length === 0 && (
        <div
          style={{
            backgroundColor: '#14171C',
            border: '1px dashed #3B4F6B',
            borderRadius: '12px',
            padding: '36px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            margin: '20px 0',
          }}
        >
          <div style={{ fontSize: '32px' }}>🎙️</div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>
            No Transcript Loaded for "{activeAsset?.name ?? 'Current Media'}"
          </div>
          <div style={{ fontSize: '12px', color: '#8A96A6', maxWidth: '420px' }}>
            Generate speech tokens to enable instantaneous ripple cuts, backspace cuts, and overdubbing on this clip.
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
            {onFastGenerateTranscript && (
              <ScarletButton
                variant="primary"
                size="sm"
                icon={<IconLightning size={14} color="#FFFFFF" />}
                onClick={() => onFastGenerateTranscript(activeMediaId ?? 'asset_1')}
              >
                Fast Generate Instant Transcript (0ms)
              </ScarletButton>
            )}
            {onTranscribeCurrentMedia && (
              <ScarletButton
                variant="secondary"
                size="sm"
                icon={<IconSparkles size={14} color="#2ED573" />}
                onClick={onTranscribeCurrentMedia}
                disabled={isTranscribing}
              >
                Transcribe with WebGPU Whisper
              </ScarletButton>
            )}
          </div>
        </div>
      )}

      {/* Interactive Word Token Flow */}
      {tokens.length > 0 && (
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
          const isSearchMatch = searchQuery.trim().length > 0
            && token.text.toLowerCase().includes(searchQuery.trim().toLowerCase());
          const isCurrentSearchHit = isSearchMatch
            && searchMatches[searchMatchIndex]?.id === token.id;

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
                  id="input-inline-word-edit"
                  data-testid="input-inline-word-edit"
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
                  id="btn-save-inline-word-edit"
                  data-testid="btn-save-inline-word-edit"
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
                id={`word-token-${token.id}`}
                data-testid={`word-token-${token.id}`}
                data-token-text={token.text}
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
              id={`word-token-${token.id}`}
              data-testid={`word-token-${token.id}`}
              data-token-text={token.text}
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
                  : isCurrentSearchHit
                  ? 'rgba(46, 213, 115, 0.45)'
                  : isSearchMatch
                  ? 'rgba(46, 213, 115, 0.2)'
                  : isSelected
                  ? '#2B5278'
                  : isDeleted
                  ? 'rgba(255, 71, 87, 0.12)'
                  : token.isEdited
                  ? 'rgba(136, 84, 208, 0.2)'
                  : 'transparent',
                outline: isCurrentSearchHit ? '1px solid #2ED573' : undefined,
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
              {token.replacementText ?? token.text}

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
      )}
    </div>
  );
};
