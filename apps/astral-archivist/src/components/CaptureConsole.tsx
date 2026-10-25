import React, { useEffect, useRef, useState, useCallback } from 'react';
import { saveCaptureSession, PermissionPreflight } from '../services/tauriClient';

export type CaptureSource = 'screen' | 'window' | 'webcam';
export type PipAnchor = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

interface CaptureConsoleProps {
  preflight: PermissionPreflight | null;
  onSessionArchived: () => void;
}

export const CaptureConsole: React.FC<CaptureConsoleProps> = ({ preflight, onSessionArchived }) => {
  const [recorderState, setRecorderState] = useState<'idle' | 'recording' | 'paused' | 'saving'>('idle');
  const [sourceType, setSourceType] = useState<CaptureSource>('screen');
  const [micEnabled, setMicEnabled] = useState<boolean>(true);
  const [webcamPipEnabled, setWebcamPipEnabled] = useState<boolean>(false);
  const [pipAnchor, setPipAnchor] = useState<PipAnchor>('bottom-right');
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Notes window toggle (A3 Invisible Grimoire)
  const [notesOpen, setNotesOpen] = useState<boolean>(false);
  const [notesContent, setNotesContent] = useState<string>('## Speaker Notes\n- Introduce Astral Archivist workflow\n- Walk through capture and vault management\n- Explain non-destructive timeline operations');

  const mainVideoRef = useRef<HTMLVideoElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const cleanupStreams = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((t) => t.stop());
      webcamStreamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    setRecorderState('idle');
    setElapsedSec(0);
  }, []);

  useEffect(() => {
    return () => cleanupStreams();
  }, [cleanupStreams]);

  // Audio level monitoring setup
  const attachAudioAnalyser = (stream: MediaStream) => {
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
        animFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
    } catch (e) {
      console.warn('[CaptureConsole] Audio analyzer init failed:', e);
    }
  };

  // Pre-initialize webcam preview when PIP is toggled
  useEffect(() => {
    if (webcamPipEnabled && !webcamStreamRef.current) {
      navigator.mediaDevices
        .getUserMedia({ video: { width: 480, height: 320, frameRate: 30 }, audio: false })
        .then((stream) => {
          webcamStreamRef.current = stream;
          if (pipVideoRef.current) {
            pipVideoRef.current.srcObject = stream;
            pipVideoRef.current.play().catch(() => {});
          }
        })
        .catch((err) => {
          console.warn('[CaptureConsole] Webcam PIP init failed:', err);
          setWebcamPipEnabled(false);
          setStatusMessage('Could not acquire webcam for PIP overlay.');
        });
    } else if (!webcamPipEnabled && webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach((t) => t.stop());
      webcamStreamRef.current = null;
      if (pipVideoRef.current) pipVideoRef.current.srcObject = null;
    }
  }, [webcamPipEnabled]);

  const handleStartRecording = async () => {
    setStatusMessage(null);
    recordedChunksRef.current = [];
    setElapsedSec(0);

    try {
      let captureStream: MediaStream;

      if (sourceType === 'webcam') {
        captureStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1920, height: 1080, frameRate: 30 },
          audio: micEnabled ? { echoCancellation: true, noiseSuppression: true } : false,
        });
      } else {
        // Screen or Window capture via getDisplayMedia
        captureStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30, max: 60 } },
          audio: true, // system audio if available
        });

        // If mic is enabled, acquire microphone and merge audio track
        if (micEnabled) {
          try {
            const micStream = await navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: true, noiseSuppression: true },
              video: false,
            });
            micStream.getAudioTracks().forEach((track) => {
              captureStream.addTrack(track);
            });
          } catch (micErr) {
            console.warn('[CaptureConsole] Microphone acquisition failed, continuing with display stream:', micErr);
          }
        }
      }

      screenStreamRef.current = captureStream;
      if (mainVideoRef.current) {
        mainVideoRef.current.srcObject = captureStream;
        mainVideoRef.current.play().catch(() => {});
      }

      // Handle user terminating stream via OS/browser native floating share bar
      captureStream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (recorderState === 'recording' || recorderState === 'paused') {
          handleStopRecording();
        }
      });

      attachAudioAnalyser(captureStream);

      // Setup MediaRecorder with best supported webm codec
      const mimeCandidates = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ];
      let selectedMime = '';
      for (const m of mimeCandidates) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) {
          selectedMime = m;
          break;
        }
      }

      const recorder = new MediaRecorder(captureStream, selectedMime ? { mimeType: selectedMime } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        setRecorderState('saving');
        const blob = new Blob(recordedChunksRef.current, { type: selectedMime || 'video/webm' });
        const sessionId = Date.now().toString(36);
        const title = `Capture Session ${new Date().toLocaleTimeString()}`;

        try {
          // Read chunk as base64 string to transfer safely to Rust vault
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64Data = (reader.result as string)?.split(',')[1] || '';
            await saveCaptureSession({
              id: sessionId,
              title,
              duration_seconds: elapsedSec,
              source_type: sourceType,
              video_bytes_base64: base64Data,
            });
            setStatusMessage(`Recording safely archived to vault: ${title}`);
            cleanupStreams();
            onSessionArchived();
          };
          reader.readAsDataURL(blob);
        } catch (saveErr) {
          console.error('[CaptureConsole] Failed to save session:', saveErr);
          setStatusMessage('Failed to persist session to vault.');
          setRecorderState('idle');
        }
      };

      recorder.start(1000); // 1-second timeslices for stream resilience
      setRecorderState('recording');

      timerRef.current = setInterval(() => {
        setElapsedSec((prev) => prev + 1);
      }, 1000);
    } catch (err: unknown) {
      console.error('[CaptureConsole] Recording start failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMessage(`Capture canceled or failed: ${msg}`);
      cleanupStreams();
    }
  };

  const handlePauseResume = () => {
    if (!mediaRecorderRef.current) return;
    if (recorderState === 'recording') {
      mediaRecorderRef.current.pause();
      if (timerRef.current) clearInterval(timerRef.current);
      setRecorderState('paused');
    } else if (recorderState === 'paused') {
      mediaRecorderRef.current.resume();
      timerRef.current = setInterval(() => {
        setElapsedSec((prev) => prev + 1);
      }, 1000);
      setRecorderState('recording');
    }
  };

  const handleStopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const formatTime = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getPipPositionStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute',
      width: '180px',
      height: '110px',
      borderRadius: '8px',
      border: '2px solid #6366f1',
      overflow: 'hidden',
      background: '#020617',
      boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
      zIndex: 10,
    };
    switch (pipAnchor) {
      case 'bottom-right':
        return { ...base, bottom: '16px', right: '16px' };
      case 'bottom-left':
        return { ...base, bottom: '16px', left: '16px' };
      case 'top-right':
        return { ...base, top: '16px', right: '16px' };
      case 'top-left':
        return { ...base, top: '16px', left: '16px' };
    }
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Preflight & Status Bar */}
      <div style={{ padding: '12px 18px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '16px', fontSize: '13px' }}>
          <div>
            <span style={{ color: '#64748b' }}>Platform: </span>
            <strong style={{ color: '#38bdf8' }}>{preflight?.platform || 'Detecting...'}</strong>
          </div>
          <div>
            <span style={{ color: '#64748b' }}>FFmpeg: </span>
            <strong style={{ color: preflight?.ffmpeg_available ? '#4ade80' : '#f87171' }}>
              {preflight?.ffmpeg_available ? 'Available' : 'Missing'}
            </strong>
          </div>
          <div>
            <span style={{ color: '#64748b' }}>Vault: </span>
            <strong style={{ color: '#a5b4fc', fontSize: '12px' }}>{preflight?.vault_directory || 'Ready'}</strong>
          </div>
        </div>
        {statusMessage && (
          <div style={{ fontSize: '12px', color: '#f59e0b', maxWidth: '350px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {statusMessage}
          </div>
        )}
      </div>

      {/* Main Console Workspace */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px' }}>
        {/* Left: Live View & Active Canvas */}
        <div style={{ background: '#020617', border: '1px solid #1e293b', borderRadius: '12px', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column', minHeight: '440px' }}>
          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {recorderState === 'idle' ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                <div style={{ fontSize: '40px', marginBottom: '10px' }}>🎥</div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: '#94a3b8' }}>Recording Console Standby</div>
                <div style={{ fontSize: '13px', marginTop: '6px' }}>
                  Choose sources and press <strong>Start Recording</strong> to initiate capture stream.
                </div>
              </div>
            ) : (
              <video
                ref={mainVideoRef}
                muted
                autoPlay
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            )}

            {/* Webcam Picture-In-Picture Overlay (B2) */}
            {webcamPipEnabled && (
              <div style={getPipPositionStyle()}>
                <video
                  ref={pipVideoRef}
                  muted
                  autoPlay
                  playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            )}
          </div>

          {/* Bottom Stream Info Bar */}
          <div style={{ padding: '12px 18px', background: '#090d16', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: recorderState === 'recording' ? '#ef4444' : recorderState === 'paused' ? '#f59e0b' : '#64748b',
                    boxShadow: recorderState === 'recording' ? '0 0 10px #ef4444' : 'none',
                  }}
                />
                <span style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase' }}>
                  {recorderState}
                </span>
              </div>
              <span style={{ fontFamily: 'monospace', fontSize: '15px', color: '#e2e8f0', fontWeight: 700 }}>
                {formatTime(elapsedSec)}
              </span>
            </div>

            {/* Audio level meter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#64748b' }}>Mic:</span>
              <div style={{ width: '80px', height: '8px', background: '#1e293b', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${audioLevel}%`,
                    height: '100%',
                    background: audioLevel > 80 ? '#ef4444' : audioLevel > 50 ? '#f59e0b' : '#10b981',
                    transition: 'width 0.1s ease',
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Controls & Source Selectors */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Source Selector (B1) */}
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '16px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>Capture Source</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="sourceType"
                  value="screen"
                  checked={sourceType === 'screen'}
                  disabled={recorderState !== 'idle'}
                  onChange={() => setSourceType('screen')}
                />
                Entire Screen / Display
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="sourceType"
                  value="window"
                  checked={sourceType === 'window'}
                  disabled={recorderState !== 'idle'}
                  onChange={() => setSourceType('window')}
                />
                Application Window
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="sourceType"
                  value="webcam"
                  checked={sourceType === 'webcam'}
                  disabled={recorderState !== 'idle'}
                  onChange={() => setSourceType('webcam')}
                />
                Webcam Solo Studio
              </label>
            </div>
          </div>

          {/* Audio & PIP Settings (B2) */}
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '16px' }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>Media Overlay</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={micEnabled}
                  disabled={recorderState !== 'idle'}
                  onChange={(e) => setMicEnabled(e.target.checked)}
                />
                Microphone Voice Capture
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={webcamPipEnabled}
                  onChange={(e) => setWebcamPipEnabled(e.target.checked)}
                />
                Webcam PIP Overlay
              </label>

              {webcamPipEnabled && (
                <div style={{ marginTop: '6px' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>PIP Anchor Position:</span>
                  <select
                    value={pipAnchor}
                    onChange={(e) => setPipAnchor(e.target.value as PipAnchor)}
                    style={{
                      width: '100%',
                      marginTop: '4px',
                      background: '#1e293b',
                      color: '#e2e8f0',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '6px 8px',
                      fontSize: '12px',
                    }}
                  >
                    <option value="bottom-right">Bottom Right</option>
                    <option value="bottom-left">Bottom Left</option>
                    <option value="top-right">Top Right</option>
                    <option value="top-left">Top Left</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Primary Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {recorderState === 'idle' ? (
              <button
                onClick={handleStartRecording}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  background: '#e11d48',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(225,29,72,0.4)',
                }}
              >
                ● Start Recording (B1-B2)
              </button>
            ) : (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={handlePauseResume}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '8px',
                    background: recorderState === 'paused' ? '#10b981' : '#f59e0b',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  {recorderState === 'paused' ? '▶ Resume' : '⏸ Pause'}
                </button>
                <button
                  onClick={handleStopRecording}
                  style={{
                    flex: 1,
                    padding: '12px',
                    borderRadius: '8px',
                    background: '#e11d48',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  ■ Stop & Vault
                </button>
              </div>
            )}

            {/* Invisible Grimoire Trigger (A3) */}
            <button
              onClick={() => setNotesOpen(!notesOpen)}
              style={{
                padding: '10px',
                borderRadius: '8px',
                background: notesOpen ? '#3730a3' : '#1e293b',
                color: '#c7d2fe',
                border: '1px solid #4338ca',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              📜 {notesOpen ? 'Hide Speaker Notes (A3)' : 'Open Invisible Notes (A3)'}
            </button>
          </div>
        </div>
      </div>

      {/* Invisible Grimoire / Speaker Notes Modal Drawer (A3) */}
      {notesOpen && (
        <div
          style={{
            background: '#090d16',
            border: '1px solid #312e81',
            borderRadius: '12px',
            padding: '18px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.8)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h4 style={{ margin: 0, fontSize: '14px', color: '#c7d2fe' }}>
              Invisible Grimoire — Teleprompter & Speaker Notes
            </h4>
            <span style={{ fontSize: '11px', color: '#818cf8', background: '#1e1b4b', padding: '3px 8px', borderRadius: '4px' }}>
              Excluded from Composited Video
            </span>
          </div>
          <textarea
            value={notesContent}
            onChange={(e) => setNotesContent(e.target.value)}
            rows={5}
            style={{
              width: '100%',
              background: '#020617',
              color: '#e2e8f0',
              border: '1px solid #1e293b',
              borderRadius: '8px',
              padding: '10px',
              fontFamily: 'monospace',
              fontSize: '13px',
              boxSizing: 'border-box',
              resize: 'vertical',
            }}
          />
        </div>
      )}
    </div>
  );
};
