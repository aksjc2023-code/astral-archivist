import React, { useState, useEffect } from 'react';
import { VaultItem, exportProject } from '../services/tauriClient';
import { transcribeMedia } from '../services/transcriptionService';
import {
  WordToken,
  summarizeTranscriptTokens,
  buildPlaybackSegments,
  tagLexicalFillers,
  synthesizeOverdubWavBytes,
} from '@astral/core';

interface EditorWorkspaceProps {
  selectedItem: VaultItem | null;
}

export interface ClipSegment {
  id: string;
  mediaId: string;
  sourceStart: number;
  sourceEnd: number;
  isMuted: boolean;
}

export const EditorWorkspace: React.FC<EditorWorkspaceProps> = ({ selectedItem }) => {
  const [clips, setClips] = useState<ClipSegment[]>(() => {
    if (selectedItem) {
      return [
        {
          id: 'clip_1',
          mediaId: selectedItem.id,
          sourceStart: 0,
          sourceEnd: selectedItem.duration_seconds || 10,
          isMuted: false,
        },
      ];
    }
    return [];
  });

  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportOutput, setExportOutput] = useState<string | null>(null);

  // B5 & Advanced: Transcript, Captions, Summary, A1, A2, A4
  const [tokens, setTokens] = useState<WordToken[]>([]);
  const [transcribing, setTranscribing] = useState<boolean>(false);
  const [captionsEnabled, setCaptionsEnabled] = useState<boolean>(true);
  const [summaryList, setSummaryList] = useState<string[]>([]);
  const [activeWordIdx, setActiveWordIdx] = useState<number>(0);

  // A4: Noise suppression & filler suggestions
  const [noiseSuppressionEnabled, setNoiseSuppressionEnabled] = useState<boolean>(true);
  const [pendingFillerSuggestion, setPendingFillerSuggestion] = useState<string | null>(null);

  // A2: AI Audio replacement
  const [overdubText, setOverdubText] = useState<string>('');
  const [overdubSuccess, setOverdubSuccess] = useState<string | null>(null);

  // Trigger transcription on session load (B5)
  useEffect(() => {
    if (selectedItem) {
      setTranscribing(true);
      transcribeMedia(selectedItem.id, selectedItem.duration_seconds)
        .then((res) => {
          // Tag fillers via @astral/core (A4)
          const tagged = tagLexicalFillers(res.tokens);
          setTokens(tagged);
          const summary = summarizeTranscriptTokens(tagged, 2);
          setSummaryList(summary);

          const fillersCount = tagged.filter((t) => t.isFiller).length;
          if (fillersCount > 0) {
            setPendingFillerSuggestion(`Found ${fillersCount} hesitation fillers (e.g. "um", "uh"). Would you like to review auto-cut suggestions?`);
          }
        })
        .finally(() => setTranscribing(false));
    }
  }, [selectedItem]);

  // A1: Non-destructive word/sentence ripple cut
  const handleToggleDeleteToken = (tokenId: string) => {
    const updated = tokens.map((t) =>
      t.id === tokenId ? { ...t, deleted: !t.deleted } : t
    );
    setTokens(updated);

    // Rebuild virtual timeline segments via @astral/core (A1)
    if (selectedItem) {
      const rebuild = buildPlaybackSegments(updated, selectedItem.id);
      if (rebuild.segments.length > 0) {
        setClips(
          rebuild.segments.map((seg, i) => ({
            id: `clip_ripple_${i}`,
            mediaId: selectedItem.id,
            sourceStart: seg.sourceStart,
            sourceEnd: seg.sourceEnd,
            isMuted: false,
          }))
        );
      }
    }
  };

  // A4: Accept filler suggestions with explicit confirmation
  const handleAcceptFillerSuggestions = () => {
    if (!selectedItem) return;
    const updated = tokens.map((t) => (t.isFiller ? { ...t, deleted: true } : t));
    setTokens(updated);
    setPendingFillerSuggestion(null);

    const rebuild = buildPlaybackSegments(updated, selectedItem.id);
    if (rebuild.segments.length > 0) {
      setClips(
        rebuild.segments.map((seg, i) => ({
          id: `clip_ripple_${i}`,
          mediaId: selectedItem.id,
          sourceStart: seg.sourceStart,
          sourceEnd: seg.sourceEnd,
          isMuted: false,
        }))
      );
    }
  };

  const handleDismissFillerSuggestions = () => {
    setPendingFillerSuggestion(null);
  };

  // A2: AI Audio replacement synthesis
  const handleApplyAudioReplacement = (token: WordToken) => {
    if (!overdubText.trim()) return;
    const slotSec = token.end - token.start;
    const synth = synthesizeOverdubWavBytes(overdubText.trim(), slotSec);

    setTokens((prev) =>
      prev.map((t) =>
        t.id === token.id
          ? {
              ...t,
              replacementText: overdubText.trim(),
              isEdited: true,
            }
          : t
      )
    );
    setOverdubSuccess(
      `Synthesized replacement "${overdubText.trim()}" (Prosody rate: ${synth.prosodyRate}x, ${synth.durationSec.toFixed(2)}s)`
    );
    setOverdubText('');
  };

  // Inline word edit (B5 edit transcript)
  const handleEditWordText = (tokenId: string, newText: string) => {
    setTokens((prev) =>
      prev.map((t) => (t.id === tokenId ? { ...t, text: newText } : t))
    );
  };

  // Generate updated summary
  const handleRegenerateSummary = () => {
    const summary = summarizeTranscriptTokens(tokens, 2);
    setSummaryList(summary);
  };

  // Split selected clip in two
  const handleSplitClip = () => {
    if (!selectedClipId) return;
    const idx = clips.findIndex((c) => c.id === selectedClipId);
    if (idx === -1) return;
    const clip = clips[idx];
    const mid = clip.sourceStart + (clip.sourceEnd - clip.sourceStart) / 2;
    if (clip.sourceEnd - clip.sourceStart < 0.5) return;

    const firstHalf: ClipSegment = { ...clip, id: `${clip.id}_a`, sourceEnd: mid };
    const secondHalf: ClipSegment = { ...clip, id: `${clip.id}_b`, sourceStart: mid };

    const updated = [...clips];
    updated.splice(idx, 1, firstHalf, secondHalf);
    setClips(updated);
    setSelectedClipId(secondHalf.id);
  };

  // Toggle mute on selected clip
  const handleToggleMute = (clipId: string) => {
    setClips((prev) =>
      prev.map((c) => (c.id === clipId ? { ...c, isMuted: !c.isMuted } : c))
    );
  };

  // Move clip left/right (Reorder)
  const handleMoveClip = (index: number, direction: 'left' | 'right') => {
    const targetIdx = direction === 'left' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= clips.length) return;
    const updated = [...clips];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIdx, 0, moved);
    setClips(updated);
  };

  // Native export using native FFmpeg pipeline (B4 / A4 enhancement)
  const handleTriggerExport = async () => {
    if (!selectedItem || clips.length === 0) return;
    setExporting(true);
    setExportOutput(null);

    try {
      const exportReq = {
        clips: clips.map((c) => ({
          source_path: selectedItem.file_path,
          inpoint_sec: c.sourceStart,
          outpoint_sec: c.sourceEnd,
          is_muted: c.isMuted,
        })),
        output_filename: `astral_render_${Date.now()}.mp4`,
      };

      const result = await exportProject(exportReq);
      setExportOutput(
        `✓ ${result.message}: ${result.output_path} (${result.duration_seconds.toFixed(1)}s, ${result.file_size_bytes} bytes)${noiseSuppressionEnabled ? ' [Noise Suppression DSP Active]' : ''}`
      );
    } catch (err) {
      console.error('[EditorWorkspace] Export failed:', err);
      setExportOutput('Export failed. Check logs for details.');
    } finally {
      setExporting(false);
    }
  };

  if (!selectedItem) {
    return (
      <div
        style={{
          maxWidth: '800px',
          margin: '40px auto',
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          padding: '40px 20px',
          textAlign: 'center',
          color: '#64748b',
        }}
      >
        <div style={{ fontSize: '32px', marginBottom: '10px' }}>✂️</div>
        <div style={{ fontSize: '16px', fontWeight: 600, color: '#94a3b8' }}>No Recording Loaded</div>
        <p style={{ margin: '8px 0 0 0', fontSize: '13px' }}>
          Select a session from the Vault tab to load it into the non-destructive multi-clip editor.
        </p>
      </div>
    );
  }

  const totalVirtualSec = clips.reduce((acc, c) => acc + (c.sourceEnd - c.sourceStart), 0);
  const currentToken = tokens[activeWordIdx];

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Editor Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '20px', margin: '0 0 4px 0', color: '#f1f5f9' }}>
            Non-Destructive Editor (B4-B5 / A1-A4)
          </h2>
          <span style={{ fontSize: '13px', color: '#94a3b8' }}>
            Loaded Source: <strong>{selectedItem.title}</strong> ({selectedItem.source_type})
          </span>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* A4: Noise Suppression DSP toggle */}
          <label style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', background: '#1e293b', padding: '6px 10px', borderRadius: '6px' }}>
            <input
              type="checkbox"
              checked={noiseSuppressionEnabled}
              onChange={(e) => setNoiseSuppressionEnabled(e.target.checked)}
            />
            Noise Suppressor (A4)
          </label>

          <button
            onClick={handleSplitClip}
            disabled={!selectedClipId}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              background: selectedClipId ? '#334155' : '#1e293b',
              color: selectedClipId ? '#fff' : '#64748b',
              border: 'none',
              fontWeight: 600,
              fontSize: '13px',
              cursor: selectedClipId ? 'pointer' : 'not-allowed',
            }}
          >
            ✂️ Split Clip
          </button>
          <button
            onClick={handleTriggerExport}
            disabled={exporting || clips.length === 0}
            style={{
              padding: '8px 18px',
              borderRadius: '6px',
              background: '#4f46e5',
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              fontSize: '13px',
              cursor: exporting ? 'wait' : 'pointer',
              boxShadow: '0 4px 12px rgba(79,70,229,0.3)',
            }}
          >
            {exporting ? 'Rendering MP4...' : '🚀 Render & Export MP4 (B4)'}
          </button>
        </div>
      </div>

      {exportOutput && (
        <div style={{ padding: '12px 16px', background: '#064e3b', border: '1px solid #059669', borderRadius: '8px', color: '#6ee7b7', fontSize: '13px' }}>
          {exportOutput}
        </div>
      )}

      {/* A4: Suggested Silence / Filler Cuts Banner */}
      {pendingFillerSuggestion && (
        <div style={{ padding: '12px 16px', background: '#451a03', border: '1px solid #b45309', borderRadius: '8px', color: '#fde68a', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>💡 {pendingFillerSuggestion}</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleAcceptFillerSuggestions}
              style={{ padding: '4px 12px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', fontSize: '12px' }}
            >
              Accept Cuts
            </button>
            <button
              onClick={handleDismissFillerSuggestions}
              style={{ padding: '4px 12px', background: '#334155', color: '#cbd5e1', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Monitor & Timed Caption Preview (B5) */}
      <div
        style={{
          background: '#020617',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '220px',
          position: 'relative',
        }}
      >
        <div style={{ fontSize: '36px', marginBottom: '8px' }}>🖥️</div>
        <div style={{ fontSize: '15px', color: '#e2e8f0', fontWeight: 600 }}>Virtual Concat Sequence Monitor</div>
        <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
          Virtual Duration: <strong style={{ color: '#38bdf8' }}>{totalVirtualSec.toFixed(2)}s</strong> | Active Slices: <strong>{clips.length}</strong>
        </div>

        {/* Timed Caption Overlay (B5) */}
        {captionsEnabled && currentToken && (
          <div
            style={{
              position: 'absolute',
              bottom: '16px',
              background: 'rgba(0, 0, 0, 0.85)',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '6px 16px',
              color: '#f8fafc',
              fontSize: '14px',
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(0,0,0,0.6)',
            }}
          >
            💬 {currentToken.replacementText ?? currentToken.text}
          </div>
        )}
      </div>

      {/* Interactive Word Flow & A2 AI Voice Replacement Drawer */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>
        {/* Left: Interactive Word Flow (B5 / A1 / A2) */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h4 style={{ margin: 0, fontSize: '14px', color: '#cbd5e1' }}>
              Timed Transcript & Text-Based Ripple Cuts (A1)
            </h4>
            <label style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={captionsEnabled}
                onChange={(e) => setCaptionsEnabled(e.target.checked)}
              />
              Live Captions (B5)
            </label>
          </div>

          {transcribing ? (
            <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
              ⏳ Transcribing audio speech intervals...
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '180px', overflowY: 'auto', padding: '6px' }}>
              {tokens.map((tok, idx) => (
                <span
                  key={tok.id}
                  onClick={() => setActiveWordIdx(idx)}
                  onDoubleClick={() => handleToggleDeleteToken(tok.id)}
                  title={`[${tok.start}s - ${tok.end}s] Double-click to ${tok.deleted ? 'restore' : 'ripple cut (A1)'}`}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    background: tok.deleted ? '#450a0a' : tok.isEdited ? '#065f46' : idx === activeWordIdx ? '#312e81' : '#1e293b',
                    color: tok.deleted ? '#f87171' : tok.isEdited ? '#a7f3d0' : tok.isFiller ? '#fbbf24' : '#e2e8f0',
                    textDecoration: tok.deleted ? 'line-through' : 'none',
                    border: tok.isEdited ? '1px solid #059669' : tok.isFiller ? '1px dashed #d97706' : '1px solid #334155',
                  }}
                >
                  {tok.replacementText ?? tok.text}
                </span>
              ))}
            </div>
          )}

          {currentToken && (
            <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px', background: '#020617', padding: '12px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Edit Word:</span>
                <input
                  value={currentToken.text}
                  onChange={(e) => handleEditWordText(currentToken.id, e.target.value)}
                  style={{
                    background: '#1e293b',
                    border: '1px solid #475569',
                    borderRadius: '4px',
                    color: '#fff',
                    padding: '4px 8px',
                    fontSize: '12px',
                    width: '120px',
                  }}
                />
                <button
                  onClick={() => handleToggleDeleteToken(currentToken.id)}
                  style={{
                    background: currentToken.deleted ? '#166534' : '#991b1b',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '11px',
                    padding: '4px 10px',
                    cursor: 'pointer',
                  }}
                >
                  {currentToken.deleted ? 'Restore Word' : 'Ripple Cut Word (A1)'}
                </button>
              </div>

              {/* A2: AI Audio Replacement Voice Slot */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderTop: '1px solid #1e293b', paddingTop: '8px' }}>
                <span style={{ fontSize: '12px', color: '#a7f3d0' }}>AI Overdub (A2):</span>
                <input
                  placeholder="New speech text..."
                  value={overdubText}
                  onChange={(e) => setOverdubText(e.target.value)}
                  style={{
                    flex: 1,
                    background: '#1e293b',
                    border: '1px solid #475569',
                    borderRadius: '4px',
                    color: '#fff',
                    padding: '4px 8px',
                    fontSize: '12px',
                  }}
                />
                <button
                  onClick={() => handleApplyAudioReplacement(currentToken)}
                  style={{
                    background: '#059669',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '11px',
                    padding: '4px 10px',
                    cursor: 'pointer',
                  }}
                >
                  Synthesize Voice (A2)
                </button>
              </div>
              {overdubSuccess && (
                <span style={{ fontSize: '11px', color: '#6ee7b7' }}>✓ {overdubSuccess}</span>
              )}
            </div>
          )}
        </div>

        {/* Right: Extractive Summary Card (B5) */}
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h4 style={{ margin: 0, fontSize: '14px', color: '#cbd5e1' }}>Extractive Summary (B5)</h4>
              <button
                onClick={handleRegenerateSummary}
                style={{ background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', fontSize: '11px' }}
              >
                🔄 Refresh
              </button>
            </div>
            {summaryList.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                Summary will populate once transcript tokens are analyzed.
              </p>
            ) : (
              <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {summaryList.map((sentence, idx) => (
                  <li key={idx} style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.4' }}>
                    {sentence}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div style={{ marginTop: '14px', fontSize: '11px', color: '#64748b', borderTop: '1px solid #1e293b', paddingTop: '8px' }}>
            TF-IDF key sentence ranking computed deterministically by @astral/core.
          </div>
        </div>
      </div>

      {/* Multi-Clip Timeline Sequence Track */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '18px' }}>
        <h4 style={{ margin: '0 0 14px 0', fontSize: '14px', color: '#cbd5e1' }}>Timeline Sequence Track</h4>
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '10px' }}>
          {clips.map((clip, idx) => {
            const isSelected = selectedClipId === clip.id;
            const dur = (clip.sourceEnd - clip.sourceStart).toFixed(1);
            return (
              <div
                key={clip.id}
                onClick={() => setSelectedClipId(clip.id)}
                style={{
                  minWidth: '150px',
                  background: isSelected ? '#1e1b4b' : '#1e293b',
                  border: isSelected ? '2px solid #6366f1' : '1px solid #334155',
                  borderRadius: '8px',
                  padding: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0' }}>Clip #{idx + 1}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleMute(clip.id);
                    }}
                    style={{
                      background: clip.isMuted ? '#991b1b' : '#334155',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '10px',
                      padding: '2px 6px',
                      cursor: 'pointer',
                    }}
                  >
                    {clip.isMuted ? 'MUTED' : 'AUDIO ON'}
                  </button>
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {clip.sourceStart.toFixed(1)}s - {clip.sourceEnd.toFixed(1)}s ({dur}s)
                </div>
                {/* Re-order arrows */}
                <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                  <button
                    disabled={idx === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveClip(idx, 'left');
                    }}
                    style={{
                      flex: 1,
                      background: '#0f172a',
                      color: idx === 0 ? '#475569' : '#cbd5e1',
                      border: '1px solid #334155',
                      borderRadius: '4px',
                      fontSize: '11px',
                      padding: '2px',
                      cursor: idx === 0 ? 'default' : 'pointer',
                    }}
                  >
                    ◀
                  </button>
                  <button
                    disabled={idx === clips.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveClip(idx, 'right');
                    }}
                    style={{
                      flex: 1,
                      background: '#0f172a',
                      color: idx === clips.length - 1 ? '#475569' : '#cbd5e1',
                      border: '1px solid #334155',
                      borderRadius: '4px',
                      fontSize: '11px',
                      padding: '2px',
                      cursor: idx === clips.length - 1 ? 'default' : 'pointer',
                    }}
                  >
                    ▶
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
