import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  IconWebcam,
  IconScreencast,
  IconMicrophone,
  IconSparkles,
  IconPlay,
  IconPause,
} from '../common/ScarletIcons';

export type StudioCaptureType = 'record-video' | 'capture-screen' | 'record-audio' | 'quick-video';

export interface StudioCaptureModalProps {
  isOpen: boolean;
  captureType: StudioCaptureType;
  onClose: () => void;
  onComplete: (file: File, options?: { durationSec: number }) => void;
}

export const StudioCaptureModal: React.FC<StudioCaptureModalProps> = ({
  isOpen,
  captureType,
  onClose,
  onComplete,
}) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recorderState, setRecorderState] = useState<'idle' | 'recording' | 'paused' | 'stopped'>('idle');
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const titles: Record<StudioCaptureType, { title: string; subtitle: string; icon: React.ReactNode; color: string }> = {
    'record-video': {
      title: 'Webcam Studio Recording',
      subtitle: 'HD Camera and microphone video capture',
      icon: <IconWebcam size={22} color="#168BFF" />,
      color: '#168BFF',
    },
    'capture-screen': {
      title: 'Screen & Window Recording',
      subtitle: 'Capture application, display, or browser tab with system audio',
      icon: <IconScreencast size={22} color="#2ED573" />,
      color: '#2ED573',
    },
    'record-audio': {
      title: 'Voice & Microphone Recording',
      subtitle: 'Clean studio voiceover and audio capture',
      icon: <IconMicrophone size={22} color="#FFA502" />,
      color: '#FFA502',
    },
    'quick-video': {
      title: 'Quick Video Clip',
      subtitle: 'Fast webcam snippet ready for instant timeline slicing',
      icon: <IconSparkles size={22} color="#8854D0" />,
      color: '#8854D0',
    },
  };

  const meta = titles[captureType];

  const streamRef = useRef<MediaStream | null>(null);

  // Stop all active stream tracks and audio analyzers
  const cleanupStream = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    setStream(null);
  }, []);

  // Initialize camera/screen/microphone stream
  const initMedia = useCallback(async () => {
    setErrorMsg(null);
    setElapsedSec(0);
    setRecorderState('idle');
    recordedChunksRef.current = [];

    // Clean up previous stream tracks before creating new ones
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    try {
      let mediaStream: MediaStream;
      if (captureType === 'capture-screen') {
        mediaStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30, max: 60 } },
          audio: true,
        });
        // Listen if user clicked "Stop sharing" from browser floating bar
        mediaStream.getVideoTracks()[0]?.addEventListener('ended', () => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
        });
      } else if (captureType === 'record-audio') {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
      } else {
        // 'record-video' or 'quick-video'
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
      }

      streamRef.current = mediaStream;
      setStream(mediaStream);

      // Attach to live preview video
      if (videoRef.current && captureType !== 'record-audio') {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(() => {});
      }

      // Live Audio Level Analyser
      const audioTracks = mediaStream.getAudioTracks();
      if (audioTracks.length > 0) {
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioContextClass();
          audioContextRef.current = ctx;
          const source = ctx.createMediaStreamSource(mediaStream);
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
              sum += dataArray[i]!;
            }
            const avg = sum / dataArray.length;
            setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
            animFrameRef.current = requestAnimationFrame(updateLevel);
          };
          updateLevel();
        } catch (e) {
          console.warn('[StudioCapture] Audio level analyzer init skipped:', e);
        }
      }
    } catch (err: any) {
      console.error('[StudioCapture] Stream init failed:', err);
      setErrorMsg(err.name === 'NotAllowedError' ? 'Permission denied by user.' : (err.message || 'Failed to start media device.'));
    }
  }, [captureType]);

  useEffect(() => {
    if (isOpen) {
      initMedia();
    } else {
      cleanupStream();
    }
    return () => {
      cleanupStream();
    };
  }, [isOpen, captureType]);

  const elapsedSecRef = useRef<number>(0);

  // Start recording
  const handleStartRecording = () => {
    if (!streamRef.current) return;
    recordedChunksRef.current = [];

    const mimeCandidates = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'audio/webm;codecs=opus',
      'audio/webm',
    ];
    let selectedMime = '';
    for (const m of mimeCandidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) {
        if (captureType === 'record-audio' && !m.startsWith('audio')) continue;
        selectedMime = m;
        break;
      }
    }

    try {
      const rec = new MediaRecorder(streamRef.current, selectedMime ? { mimeType: selectedMime } : undefined);
      mediaRecorderRef.current = rec;

      rec.ondataavailable = e => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      rec.onstop = () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setRecorderState('stopped');

        const isAudio = captureType === 'record-audio';
        const finalType = isAudio ? 'audio/webm' : (selectedMime || 'video/webm');
        const finalBlob = new Blob(recordedChunksRef.current, { type: finalType });

        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const nameMap: Record<StudioCaptureType, string> = {
          'record-video': `Camera_${stamp}.webm`,
          'capture-screen': `Screen_${stamp}.webm`,
          'record-audio': `Voice_${stamp}.webm`,
          'quick-video': `Quick_${stamp}.webm`,
        };

        const finalDuration = elapsedSecRef.current;
        const file = new File([finalBlob], nameMap[captureType], { type: finalType });
        cleanupStream();
        onComplete(file, { durationSec: finalDuration });
      };

      rec.start(200);
      setRecorderState('recording');
      elapsedSecRef.current = 0;
      setElapsedSec(0);

      timerRef.current = setInterval(() => {
        elapsedSecRef.current += 1;
        setElapsedSec(elapsedSecRef.current);
      }, 1000);
    } catch (err: any) {
      setErrorMsg(`Failed to start recorder: ${err.message}`);
    }
  };

  // Pause recording
  const handlePauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      setRecorderState('paused');
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  // Resume recording
  const handleResumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      setRecorderState('recording');
      timerRef.current = setInterval(() => {
        elapsedSecRef.current += 1;
        setElapsedSec(elapsedSecRef.current);
      }, 1000);
    }
  };

  // Stop recording & finalize
  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  if (!isOpen) return null;

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(5, 7, 10, 0.85)',
        backdropFilter: 'blur(12px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
      onClick={e => {
        if (e.target === e.currentTarget && recorderState !== 'recording') {
          cleanupStream();
          onClose();
        }
      }}
    >
      <div
        style={{
          width: '740px',
          maxWidth: '96vw',
          backgroundColor: '#181B20',
          borderRadius: '16px',
          border: '1px solid #2B303A',
          boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 22px',
            borderBottom: '1px solid #2B303A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#1C2027',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255,255,255,0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {meta.icon}
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }}>{meta.title}</div>
              <div style={{ fontSize: '11px', color: '#A4B0BE' }}>{meta.subtitle}</div>
            </div>
          </div>

          {/* Close button (disabled during active recording) */}
          <button
            type="button"
            disabled={recorderState === 'recording'}
            onClick={() => {
              cleanupStream();
              onClose();
            }}
            style={{
              background: 'none',
              border: 'none',
              color: recorderState === 'recording' ? '#4A5568' : '#A4B0BE',
              fontSize: '20px',
              cursor: recorderState === 'recording' ? 'not-allowed' : 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Viewport Area */}
        <div
          style={{
            position: 'relative',
            height: '380px',
            backgroundColor: '#0F1115',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {errorMsg ? (
            <div style={{ textAlign: 'center', padding: '24px', maxWidth: '400px' }}>
              <div style={{ fontSize: '14px', color: '#FF6B81', fontWeight: 600, marginBottom: '8px' }}>
                Capture Device Error
              </div>
              <div style={{ fontSize: '12px', color: '#A4B0BE', marginBottom: '16px' }}>{errorMsg}</div>
              <button
                type="button"
                onClick={initMedia}
                style={{
                  backgroundColor: '#168BFF',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Retry Device Permission
              </button>
            </div>
          ) : captureType === 'record-audio' ? (
            /* Dedicated Audio Waveform Display */
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '18px',
                width: '100%',
              }}
            >
              <div
                style={{
                  width: '90px',
                  height: '90px',
                  borderRadius: '50%',
                  backgroundColor: recorderState === 'recording' ? 'rgba(235, 59, 90, 0.2)' : 'rgba(255, 165, 2, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  border: `2px solid ${recorderState === 'recording' ? '#EB3B5A' : '#FFA502'}`,
                  boxShadow: recorderState === 'recording' ? '0 0 24px rgba(235, 59, 90, 0.4)' : 'none',
                }}
              >
                <IconMicrophone size={44} color={recorderState === 'recording' ? '#EB3B5A' : '#FFA502'} />
              </div>

              {/* Dynamic VU Meter Bar */}
              <div style={{ width: '280px', height: '6px', backgroundColor: '#22262E', borderRadius: '3px', overflow: 'hidden' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${audioLevel}%`,
                    backgroundColor: audioLevel > 80 ? '#EB3B5A' : audioLevel > 50 ? '#FFA502' : '#2ED573',
                    transition: 'width 0.08s ease',
                  }}
                />
              </div>
              <span style={{ fontSize: '12px', color: '#A4B0BE' }}>
                {recorderState === 'recording' ? 'Microphone Active — Speaking...' : 'Microphone Ready — Press Record'}
              </span>
            </div>
          ) : (
            /* Live Camera or Screencast View */
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                backgroundColor: '#0B0D11',
              }}
            />
          )}

          {/* Top Overlays: Recording Badge & Timer */}
          {recorderState !== 'idle' && (
            <div
              style={{
                position: 'absolute',
                top: '14px',
                left: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'rgba(15, 17, 21, 0.85)',
                backdropFilter: 'blur(8px)',
                padding: '6px 14px',
                borderRadius: '9999px',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: recorderState === 'recording' ? '#EB3B5A' : '#FFA502',
                  boxShadow: recorderState === 'recording' ? '0 0 8px #EB3B5A' : 'none',
                }}
              />
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#FFFFFF', letterSpacing: '0.5px' }}>
                {recorderState === 'recording' ? 'REC' : 'PAUSED'}
              </span>
              <span style={{ fontSize: '12px', color: '#A4B0BE', marginLeft: '4px', fontFamily: 'monospace' }}>
                {formatTimer(elapsedSec)} ({elapsedSec}s)
              </span>
            </div>
          )}

          {/* Quick Video Auto-Stop Notice */}
          {captureType === 'quick-video' && recorderState === 'idle' && (
            <div
              style={{
                position: 'absolute',
                bottom: '12px',
                backgroundColor: 'rgba(24, 27, 32, 0.9)',
                padding: '4px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                color: '#A4B0BE',
                border: '1px solid #2B303A',
              }}
            >
              ⚡ Quick Video mode: Click Record to capture a quick clip with live second timer
            </div>
          )}
        </div>

        {/* Footer Controls Toolbar */}
        <div
          style={{
            padding: '16px 24px',
            backgroundColor: '#1C2027',
            borderTop: '1px solid #2B303A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Audio Visualizer Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#636E7B', fontWeight: 600 }}>MIC INPUT:</span>
            <div style={{ width: '80px', height: '6px', backgroundColor: '#111317', borderRadius: '3px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${audioLevel}%`,
                  backgroundColor: '#2ED573',
                  transition: 'width 0.05s ease',
                }}
              />
            </div>
          </div>

          {/* Main Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {recorderState === 'idle' ? (
              <button
                id="btn-start-studio-capture"
                data-testid="btn-start-studio-capture"
                type="button"
                onClick={handleStartRecording}
                disabled={!stream || !!errorMsg}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: '#EB3B5A',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 24px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: !stream || !!errorMsg ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 14px rgba(235, 59, 90, 0.4)',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#FFFFFF' }} />
                Start Recording
              </button>
            ) : (
              <>
                {recorderState === 'recording' ? (
                  <button
                    id="btn-pause-studio-capture"
                    data-testid="btn-pause-studio-capture"
                    type="button"
                    onClick={handlePauseRecording}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      backgroundColor: '#2B303A',
                      color: '#FFFFFF',
                      border: '1px solid #3E4654',
                      borderRadius: '8px',
                      padding: '10px 18px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <IconPause size={14} color="#FFA502" />
                    Pause
                  </button>
                ) : (
                  <button
                    id="btn-resume-studio-capture"
                    data-testid="btn-resume-studio-capture"
                    type="button"
                    onClick={handleResumeRecording}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      backgroundColor: '#2B303A',
                      color: '#FFFFFF',
                      border: '1px solid #3E4654',
                      borderRadius: '8px',
                      padding: '10px 18px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <IconPlay size={14} color="#2ED573" />
                    Resume
                  </button>
                )}

                <button
                  id="btn-stop-studio-capture"
                  data-testid="btn-stop-studio-capture"
                  type="button"
                  onClick={handleStopRecording}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    backgroundColor: '#168BFF',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 22px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(22, 139, 255, 0.4)',
                  }}
                >
                  <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#FFFFFF' }} />
                  Done & Ingest ({elapsedSec}s)
                </button>
              </>
            )}
          </div>

          {/* Cancel button */}
          <button
            type="button"
            onClick={() => {
              cleanupStream();
              onClose();
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#A4B0BE',
              fontSize: '13px',
              cursor: 'pointer',
              padding: '8px 12px',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
