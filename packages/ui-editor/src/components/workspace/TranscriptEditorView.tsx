import React, { useState } from 'react';
import { WordToken } from '@astral/core';
import { ScarletButton } from '../common/ScarletButton';
import { IconLightning, IconSparkles, IconClose } from '../common/ScarletIcons';

export interface TranscriptEditorViewProps {
  tokens: WordToken[];
  currentTime: number;
  onToggleDeleteToken: (tokenId: string) => void;
  onPurgeFillers: () => void;
  onRestoreAllTokens: () => void;
  onEditTokenText?: (tokenId: string, newText: string) => void;
  onSeekToTime?: (time: number) => void;
}

export const TranscriptEditorView: React.FC<TranscriptEditorViewProps> = ({
  tokens,
  currentTime,
  onToggleDeleteToken,
  onPurgeFillers,
  onRestoreAllTokens,
  onEditTokenText,
  onSeekToTime,
}) => {
  const [editingTokenId, setEditingTokenId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const activeToken = tokens.find(t => !t.deleted && currentTime >= t.start && currentTime <= t.end);
  const deletedCount = tokens.filter(t => t.deleted).length;
  const fillerCount = tokens.filter(t => t.isFiller || t.isPause).length;

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
            <h2 style={{ fontSize: '18px', fontWeight: 500, color: '#FFFFFF', margin: 0 }}>
              Scarlet Transcript
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
              Word-Aligned Ripple Engine
            </span>
          </div>
          <span style={{ fontSize: '11px', color: '#636E7B', marginTop: '2px', display: 'block' }}>
            Click or Backspace words to ripple-cut video in &lt;0.4ms. Double-click to AI overdub.
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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

      {/* Interactive Word Token Flow */}
      <div
        style={{
          backgroundColor: '#14171C',
          borderRadius: '14px',
          padding: '20px',
          border: '1px solid #2B303A',
          lineHeight: '2.4',
          fontSize: '15px',
          userSelect: 'none',
        }}
      >
        {tokens.map((token) => {
          const isKaraokeActive = activeToken?.id === token.id;
          const isDeleted = token.deleted;

          if (editingTokenId === token.id) {
            return (
              <span
                key={token.id}
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
                  OK
                </button>
              </span>
            );
          }

          // Synthetic Silence Pause Token
          if (token.isPause) {
            return (
              <span
                key={token.id}
                onClick={() => onToggleDeleteToken(token.id)}
                title={isDeleted ? 'Cut pause (Click to restore)' : 'Click to cut pause'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  fontSize: '11px',
                  fontFamily: "'JetBrains Mono', monospace",
                  backgroundColor: isDeleted ? 'rgba(255, 71, 87, 0.15)' : 'rgba(99, 110, 123, 0.25)',
                  color: isDeleted ? '#FF4757' : '#A4B0BE',
                  border: isDeleted ? '1px dashed #FF4757' : '1px solid #3B4250',
                  textDecoration: isDeleted ? 'line-through' : 'none',
                  borderRadius: '6px',
                  padding: '1px 7px',
                  margin: '0 4px',
                  cursor: 'pointer',
                  opacity: isDeleted ? 0.45 : 0.85,
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
              onClick={() => {
                onToggleDeleteToken(token.id);
                if (!isDeleted && onSeekToTime) onSeekToTime(token.start);
              }}
              onDoubleClick={e => handleStartEdit(token, e)}
              title={`[${token.start.toFixed(2)}s - ${token.end.toFixed(2)}s] Click to cut/restore, Double-click to AI overdub`}
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
                  : '#FFFFFF',
                textDecoration: isDeleted ? 'line-through' : 'none',
                opacity: isDeleted ? 0.35 : 1,
                border: isKaraokeActive
                  ? '1px solid #329AFF'
                  : isDeleted
                  ? '1px dashed #FF4757'
                  : token.isEdited
                  ? '1px solid #8854D0'
                  : '1px solid transparent',
                fontWeight: isKaraokeActive ? 600 : 400,
              }}
            >
              {token.text}

              {/* Lexical Filler Indicator */}
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
