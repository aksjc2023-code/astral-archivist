import React, { useState } from 'react';
import { ScarletButton } from '../common/ScarletButton';
import { IconSparkles } from '../common/ScarletIcons';

export interface AutoCleanButtonProps {
  /** Total word count in the active transcript (disabled when 0) */
  wordCount: number;
  /** Callback fired with the LLM-flagged token IDs to soft-delete */
  onAutoClean: () => Promise<void>;
}

/**
 * "Auto-Clean Fumbles" button for the Transcript Editor action bar.
 *
 * Triggers the speech disfluency detection pipeline (local LLM or built-in
 * deterministic speech analyzer) to ripple-clean stutters, false starts,
 * fillers, and hesitations with full undo support.
 */
export const AutoCleanButton: React.FC<AutoCleanButtonProps> = ({
  wordCount,
  onAutoClean,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    try {
      setLoading(true);
      setError(null);
      await onAutoClean();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Disfluency analysis failed';
      setError(msg);
      console.error('[AutoCleanButton]', err);
      setTimeout(() => setError(null), 4000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <ScarletButton
        id="btn-auto-clean-fumbles"
        variant="additional-v1"
        size="sm"
        icon={<IconSparkles size={14} color="#D97706" />}
        onClick={handleClick}
        disabled={loading || wordCount === 0}
      >
        {loading ? 'Analyzing Speech…' : 'Auto-Clean Fumbles (AI)'}
      </ScarletButton>

      {error && (
        <span
          style={{
            fontSize: '10px',
            color: '#FF6B81',
            maxWidth: '200px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={error}
        >
          ⚠ {error}
        </span>
      )}
    </div>
  );
};
