import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { WordToken, MediaAsset } from '@astral/core';
import { ScarletButton } from '../common/ScarletButton';
import { IconSparkles, IconWand } from '../common/ScarletIcons';
import { AutoCleanButton } from './AutoCleanButton';

export interface TranscriptEditorViewProps {
  tokens: WordToken[];
  currentTime: number;
  mediaAssets?: MediaAsset[];
  activeMediaId?: string;
  onSelectMediaId?: (mediaId: string) => void;
  onToggleDeleteToken: (tokenId: string) => void;
  onToggleDeleteMultipleTokens?: (tokenIds: string[]) => void;
  onRestoreAllTokens: () => void;
  onEditTokenText?: (tokenId: string, newText: string) => void;
  onSeekToTime?: (time: number) => void;
  onTranscribeCurrentMedia?: () => void;
  onFastGenerateTranscript?: (mediaId: string) => void;
  isTranscribing?: boolean;
  whisperModel?: string;
  onSelectWhisperModel?: (model: string) => void;
  webGpuDeviceName?: string | null;
  transcriptionError?: string | null;
  onClearTranscriptionError?: () => void;
  onSummarizeKeyPoints?: () => void;
  onAutoClean?: () => Promise<void>;
  onOpenAudioEnhancement?: () => void;
}

export const TranscriptEditorView: React.FC<TranscriptEditorViewProps> = ({
  tokens,
  currentTime,
  mediaAssets,
  activeMediaId,
  onSelectMediaId,
  onToggleDeleteToken,
  onToggleDeleteMultipleTokens,
  onRestoreAllTokens,
  onEditTokenText,
  onSeekToTime,
  onTranscribeCurrentMedia,
  onFastGenerateTranscript,
  isTranscribing = false,
  whisperModel = 'Xenova/whisper-tiny.en',
  onSelectWhisperModel,
  webGpuDeviceName,
  transcriptionError,
  onClearTranscriptionError,
  onSummarizeKeyPoints,
  onAutoClean,
  onOpenAudioEnhancement,
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

  // Throttle active token evaluation to ~10Hz (every 100ms) instead of 60Hz to prevent 60fps React re-render thrashing
  const [activeTokenId, setActiveTokenId] = useState<string | null>(null);
  const lastActiveCheckTimeRef = useRef(0);

  useEffect(() => {
    const now = performance.now();
    // Throttle checks during high-frequency playback updates to 100ms
    if (now - lastActiveCheckTimeRef.current < 100) {
      return;
    }
    lastActiveCheckTimeRef.current = now;

    const match = tokens.find(t => !t.deleted && currentTime >= t.start && currentTime <= t.end);
    const newId = match ? match.id : null;
    setActiveTokenId(prev => prev === newId ? prev : newId);
  }, [currentTime, tokens]);

  const activeToken = useMemo(() => {
    if (!activeTokenId) return null;
    return tokens.find(t => t.id === activeTokenId && !t.deleted) ?? null;
  }, [activeTokenId, tokens]);

  const deletedTokens = useMemo(() => tokens.filter(t => t.deleted), [tokens]);
  const deletedCount = deletedTokens.length;
  const deletedDurationSec = useMemo(
    () => deletedTokens.reduce((sum: number, t: WordToken) => sum + Math.max(0, t.end - t.start), 0),
    [deletedTokens]
  );
  const hardFillerCount = useMemo(() => tokens.filter(t => t.isFiller && !t.isPause).length, [tokens]);
  const discourseCount = useMemo(() => tokens.filter(t => t.isDiscourseMarker && !t.isFiller).length, [tokens]);
  const pauseCount = useMemo(() => tokens.filter(t => t.isPause).length, [tokens]);

  // Mouse Drag-to-Select State (Page 2 & Whisper text-editor precision)
  const [isMouseSelecting, setIsMouseSelecting] = useState(false);
  const dragStartIndexRef = useRef<number | null>(null);

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

  // Mouse Drag-to-Select handlers across transcript tokens
  const handleTokenMouseDown = (token: WordToken, e: React.MouseEvent) => {
    if (e.button !== 0 || editingTokenId) return;
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      // Let handleTokenClick handle multi-select modifier clicks
      return;
    }
    const idx = tokens.findIndex(t => t.id === token.id);
    if (idx !== -1) {
      setIsMouseSelecting(true);
      dragStartIndexRef.current = idx;
      setSelectedTokenIds(new Set([token.id]));
      lastSelectedIdRef.current = token.id;
    }
  };

  const handleTokenMouseEnter = (token: WordToken) => {
    if (!isMouseSelecting || dragStartIndexRef.current === null) return;
    const currentIdx = tokens.findIndex(t => t.id === token.id);
    if (currentIdx !== -1) {
      const start = Math.min(dragStartIndexRef.current, currentIdx);
      const end = Math.max(dragStartIndexRef.current, currentIdx);
      const newSet = new Set<string>();
      for (let i = start; i <= end; i++) {
        const t = tokens[i];
        if (t) newSet.add(t.id);
      }
      setSelectedTokenIds(newSet);
    }
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isMouseSelecting) {
        setIsMouseSelecting(false);
        dragStartIndexRef.current = null;
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isMouseSelecting]);

  // Keyboard shortcut: Backspace or Delete to ripple-cut selected tokens (BUG-22 Fix: ignore when focused in input/textarea)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (editingTokenId) return; // Don't cut while editing text
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

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

            {/* Hardware Telemetry Badge */}
            <span
              id="badge-whisper-hardware"
              style={{
                fontSize: '10px',
                fontWeight: 600,
                backgroundColor: webGpuDeviceName ? '#054429' : '#3D2A00',
                color: webGpuDeviceName ? '#34D399' : '#FBBF24',
                border: `1px solid ${webGpuDeviceName ? '#10B981' : '#F59E0B'}`,
                borderRadius: '9999px',
                padding: '2px 8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title={webGpuDeviceName ? `WebGPU Accelerated (${webGpuDeviceName})` : 'WebAssembly Multi-threaded SIMD CPU'}
            >
              <span style={{ fontSize: '8px' }}>{webGpuDeviceName ? '🟢' : '🟡'}</span>
              <span>{webGpuDeviceName ? `WebGPU: ${webGpuDeviceName.slice(0, 18)}` : 'WASM SIMD'}</span>
            </span>

            {/* Ripple Time Saved Telemetry Badge */}
            {deletedDurationSec > 0 && (
              <span
                id="badge-time-saved"
                data-testid="badge-time-saved"
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  backgroundColor: '#3B1219',
                  color: '#FF6B81',
                  border: '1px solid #FF4757',
                  borderRadius: '9999px',
                  padding: '2px 8px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title="Total video time cut via transcript ripple edits"
              >
                <span>✂️ Saved: {deletedDurationSec.toFixed(1)}s ({deletedCount} words)</span>
              </span>
            )}

            {/* Whisper Model Selector Dropdown */}
            {onSelectWhisperModel && (
              <select
                id="select-whisper-model"
                data-testid="select-whisper-model"
                value={whisperModel}
                onChange={e => onSelectWhisperModel(e.target.value)}
                style={{
                  backgroundColor: '#22262E',
                  border: '1px solid #3B4F6B',
                  color: '#FFFFFF',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 500,
                  outline: 'none',
                  cursor: 'pointer',
                }}
                title="Select Whisper Model for Speech-to-Text"
              >
                <option value="Xenova/whisper-tiny.en">Whisper Tiny (English, ~39MB) ⚡</option>
                <option value="Xenova/whisper-tiny">Whisper Tiny (Multilingual, ~39MB) 🌐</option>
                <option value="Xenova/whisper-base.en">Whisper Base (English, ~73MB) 🎯</option>
              </select>
            )}

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

          {onTranscribeCurrentMedia && (
            <ScarletButton
              id="btn-run-webgpu-whisper"
              variant="primary"
              size="sm"
              icon={<IconSparkles size={13} color="#FFFFFF" />}
              onClick={onTranscribeCurrentMedia}
              disabled={isTranscribing}
            >
              {isTranscribing ? 'Transcribing...' : 'Run Whisper Speech-to-Text'}
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

          {onAutoClean && (
            <AutoCleanButton
              wordCount={tokens.filter(t => !t.deleted).length}
              onAutoClean={onAutoClean}
            />
          )}

          {onOpenAudioEnhancement && (
            <ScarletButton
              id="btn-open-audio-enhancement"
              data-testid="btn-open-audio-enhancement"
              variant="primary"
              size="sm"
              icon={<IconWand size={14} color="#FFFFFF" />}
              onClick={onOpenAudioEnhancement}
              style={{
                background: 'linear-gradient(135deg, #168BFF 0%, #0052CC 100%)',
                boxShadow: '0 2px 8px rgba(22, 139, 255, 0.35)',
              }}
              title="5-Stage Speech Cleansing: DeepFilterNet3 + Silero VAD + fdt-disfluency-tiny-4m"
            >
              Audio Enhancement
            </ScarletButton>
          )}
        </div>
      </div>

      {/* Transcription Error Banner */}
      {transcriptionError && (
        <div
          id="transcription-error-banner"
          style={{
            backgroundColor: '#3B1219',
            border: '1px solid #FF4757',
            borderRadius: '8px',
            padding: '10px 14px',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#FF6B81', fontSize: '12px' }}>
            <span style={{ fontSize: '15px' }}>⚠️</span>
            <span>{transcriptionError}</span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {onTranscribeCurrentMedia && (
              <button
                type="button"
                onClick={onTranscribeCurrentMedia}
                style={{
                  backgroundColor: '#FF4757',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            )}
            {onClearTranscriptionError && (
              <button
                type="button"
                onClick={onClearTranscriptionError}
                style={{
                  backgroundColor: 'transparent',
                  color: '#A4B0BE',
                  border: '1px solid #57606F',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}

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
          Hard Filler ({hardFillerCount})
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '8px', height: '8px', backgroundColor: '#ECCC68', borderRadius: '50%' }} />
          Discourse Marker ({discourseCount})
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '8px', height: '8px', backgroundColor: '#70A1FF', borderRadius: '50%' }} />
          Silence Pause &gt;0.5s ({pauseCount})
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
            {onTranscribeCurrentMedia && (
              <ScarletButton
                variant="primary"
                size="sm"
                icon={<IconSparkles size={14} color="#FFFFFF" />}
                onClick={onTranscribeCurrentMedia}
                disabled={isTranscribing}
              >
                {isTranscribing ? 'Transcribing with Whisper...' : 'Transcribe with WebGPU Whisper'}
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
            const pauseDuration = Math.max(0, token.end - token.start);
            const pauseLabel = `⏸ ${pauseDuration.toFixed(1)}s`;
            return (
              <span
                key={token.id}
                id={`word-token-${token.id}`}
                data-testid={`word-token-${token.id}`}
                data-token-text={pauseLabel}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleDeleteToken(token.id);
                  setSelectedTokenIds(new Set([token.id]));
                  lastSelectedIdRef.current = token.id;
                }}
                onMouseDown={e => handleTokenMouseDown(token, e)}
                onMouseEnter={() => handleTokenMouseEnter(token)}
                title={isDeleted ? 'Cut silence pause (Click to restore)' : 'Silence pause (Click to toggle cut, or select & Backspace)'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  fontSize: '11px',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 500,
                  backgroundColor: isDeleted ? 'rgba(239, 68, 68, 0.2)' : '#27272a',
                  color: isDeleted ? '#f87171' : '#a1a1aa',
                  border: isDeleted ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                  textDecoration: isDeleted ? 'line-through' : 'none',
                  borderRadius: '9999px',
                  padding: '2px 8px',
                  margin: '0 4px',
                  cursor: 'pointer',
                  opacity: isDeleted ? 0.6 : 0.95,
                  boxShadow: isSelected ? '0 0 0 2px #168BFF' : 'none',
                  transition: 'all 0.12s ease',
                  userSelect: 'none',
                }}
              >
                {pauseLabel}
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
              onMouseDown={e => handleTokenMouseDown(token, e)}
              onMouseEnter={() => handleTokenMouseEnter(token)}
              onDoubleClick={e => handleStartEdit(token, e)}
              title={`[${token.start.toFixed(2)}s - ${token.end.toFixed(2)}s] ${
                token.isFiller ? '(Hard Filler) ' : token.isDiscourseMarker ? '(Discourse Marker) ' : ''
              }Click to select/seek, Drag to range-select, Backspace to cut, Double-click to AI overdub`}
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
