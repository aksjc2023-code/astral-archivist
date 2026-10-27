import type { RecordingConfig } from '../types/ipc';

let activeStream: MediaStream | null = null;
let activeRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];

// Resources for canvas compositor & audio mixer
let displayStreamRef: MediaStream | null = null;
let cameraStreamRef: MediaStream | null = null;
let micStreamRef: MediaStream | null = null;
let screenVideoEl: HTMLVideoElement | null = null;
let cameraVideoEl: HTMLVideoElement | null = null;
let animFrameId: number | null = null;
let audioContext: AudioContext | null = null;

export const isMediaRecordingSupported = (): boolean => {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices;
};

export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const commaIdx = dataUrl.lastIndexOf(',');
      const base64 = commaIdx !== -1 ? dataUrl.substring(commaIdx + 1) : dataUrl;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const startRealCapture = async (
  config: RecordingConfig,
  isCameraOn: boolean = false,
  onEndedCallback?: () => void,
): Promise<boolean> => {
  try {
    recordedChunks = [];
    cleanupAllStreams();

    const isAudioOnly = config.target_type === 'audio_only';

    if (isAudioOnly) {
      // ==========================================
      // 1. PURE AUDIO / VOICE-ONLY RECORDING MODE
      // ==========================================
      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
      } catch (advancedErr) {
        console.warn('Advanced audio constraints failed, trying basic audio: true', advancedErr);
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
      }

      if (!micStream || micStream.getAudioTracks().length === 0) {
        throw new Error('No audio tracks found from microphone.');
      }

      micStreamRef = micStream;
      activeStream = micStream;

      // Select best supported audio container
      const audioTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/aac',
        'audio/ogg;codecs=opus',
      ];
      let supportedAudioMime: string | undefined = undefined;
      for (const t of audioTypes) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
          supportedAudioMime = t;
          break;
        }
      }

      activeRecorder = supportedAudioMime
        ? new MediaRecorder(activeStream, { mimeType: supportedAudioMime })
        : new MediaRecorder(activeStream);

    } else {
      // ==========================================
      // 2. SCREEN / DISPLAY RECORDING MODE
      // ==========================================
      const targetFps = config.fps || 30;

      // Capture display video & system audio (if requested)
      displayStreamRef = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: targetFps, max: targetFps },
        },
        audio: config.include_system_audio ? true : false,
      });

      if (onEndedCallback) {
        const vTrack = displayStreamRef.getVideoTracks()[0];
        if (vTrack) {
          vTrack.onended = () => onEndedCallback();
        }
      }

      // Capture microphone audio (if requested)
      if (config.include_microphone) {
        try {
          micStreamRef = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });
        } catch {
          try {
            micStreamRef = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: false,
            });
          } catch (micErr) {
            console.warn('Microphone permission not granted or unavailable:', micErr);
          }
        }
      }

      // MIX AUDIO TRACKS (System Audio + Microphone)
      const sysAudioTracks = displayStreamRef.getAudioTracks();
      const micAudioTracks = micStreamRef ? micStreamRef.getAudioTracks() : [];
      let mixedAudioTrack: MediaStreamTrack | null = null;

      if (sysAudioTracks.length > 0 && micAudioTracks.length > 0) {
        // Both system audio AND microphone audio are active -> Mix them using Web Audio API
        try {
          audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
          if (audioContext.state === 'suspended') {
            await audioContext.resume();
          }
          const destination = audioContext.createMediaStreamDestination();
          const sysSource = audioContext.createMediaStreamSource(new MediaStream([sysAudioTracks[0]]));
          const micSource = audioContext.createMediaStreamSource(new MediaStream([micAudioTracks[0]]));
          sysSource.connect(destination);
          micSource.connect(destination);
          mixedAudioTrack = destination.stream.getAudioTracks()[0] || null;
        } catch (mixErr) {
          console.warn('Web Audio API mixing error, falling back to mic track:', mixErr);
          mixedAudioTrack = micAudioTracks[0] || sysAudioTracks[0] || null;
        }
      } else if (micAudioTracks.length > 0) {
        mixedAudioTrack = micAudioTracks[0];
      } else if (sysAudioTracks.length > 0) {
        mixedAudioTrack = sysAudioTracks[0];
      }

      // 3. Camera PiP Overlay Compositing (if enabled)
      if (isCameraOn) {
        try {
          cameraStreamRef = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 640 },
              frameRate: { ideal: 30 },
            },
            audio: false,
          });
        } catch (camErr) {
          console.warn('Camera access for recording overlay failed:', camErr);
        }
      }

      // If camera is ON, composite with offscreen canvas
      if (cameraStreamRef && isCameraOn) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        screenVideoEl = document.createElement('video');
        screenVideoEl.srcObject = displayStreamRef;
        screenVideoEl.muted = true;
        screenVideoEl.playsInline = true;
        await screenVideoEl.play();

        cameraVideoEl = document.createElement('video');
        cameraVideoEl.srcObject = cameraStreamRef;
        cameraVideoEl.muted = true;
        cameraVideoEl.playsInline = true;
        await cameraVideoEl.play();

        canvas.width = screenVideoEl.videoWidth || 1920;
        canvas.height = screenVideoEl.videoHeight || 1080;

        const renderCompositeFrame = () => {
          if (!ctx || !screenVideoEl || !cameraVideoEl) return;
          const w = canvas.width;
          const h = canvas.height;

          // A) Draw base screen capture
          ctx.drawImage(screenVideoEl, 0, 0, w, h);

          // B) Draw circular camera PiP overlay in recommended position (Bottom-Right, 0.5x size)
          if (cameraVideoEl.readyState >= 2) {
            const diameter = Math.round(Math.min(Math.max(w * 0.08, 100), 140));
            const radius = diameter / 2;
            const margin = 24;
            const cx = w - radius - margin;
            const cy = h - radius - margin;

            ctx.save();
            ctx.shadowColor = 'rgba(245, 158, 11, 0.45)';
            ctx.shadowBlur = 14;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();

            ctx.translate(cx, cy);
            ctx.scale(-1, 1);
            ctx.drawImage(cameraVideoEl, -radius, -radius, diameter, diameter);
            ctx.restore();

            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#f59e0b';
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(cx, cy, radius - 3, 0, Math.PI * 2);
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
            ctx.stroke();
            ctx.restore();
          }

          animFrameId = requestAnimationFrame(renderCompositeFrame);
        };

        renderCompositeFrame();

        const canvasStream = canvas.captureStream(targetFps);
        if (mixedAudioTrack) {
          canvasStream.addTrack(mixedAudioTrack);
        }
        activeStream = canvasStream;
      } else {
        // Direct display stream with mixed audio track
        const tracks: MediaStreamTrack[] = [displayStreamRef.getVideoTracks()[0]];
        if (mixedAudioTrack) {
          tracks.push(mixedAudioTrack);
        }
        activeStream = new MediaStream(tracks);
      }

      // Determine optimal supported video MIME type
      let mimeType: string | undefined = undefined;
      const videoTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4',
      ];
      for (const t of videoTypes) {
        if (MediaRecorder.isTypeSupported(t)) {
          mimeType = t;
          break;
        }
      }

      const videoBitsPerSecond = targetFps >= 60 ? 8_000_000 : 4_500_000;
      activeRecorder = mimeType
        ? new MediaRecorder(activeStream, { mimeType, videoBitsPerSecond })
        : new MediaRecorder(activeStream, { videoBitsPerSecond });
    }

    if (!activeRecorder) {
      throw new Error('Failed to initialize MediaRecorder');
    }

    activeRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };

    activeRecorder.start(250);
    return true;
  } catch (err) {
    console.warn('Real screen/audio capture start failed:', err);
    cleanupAllStreams();
    return false;
  }
};

export const pauseRealCapture = (): void => {
  if (activeRecorder && activeRecorder.state === 'recording') {
    activeRecorder.pause();
  }
};

export const resumeRealCapture = (): void => {
  if (activeRecorder && activeRecorder.state === 'paused') {
    activeRecorder.resume();
  }
};

export const stopRealCapture = async (): Promise<Blob | null> => {
  const recorder = activeRecorder;
  if (!recorder) {
    cleanupAllStreams();
    return null;
  }

  return new Promise((resolve) => {
    recorder.onstop = () => {
      const mime = recorder.mimeType || (activeStream?.getVideoTracks().length ? 'video/webm' : 'audio/webm');
      const combinedBlob = recordedChunks.length > 0 ? new Blob(recordedChunks, { type: mime }) : null;
      recordedChunks = [];
      cleanupAllStreams();
      resolve(combinedBlob);
    };

    if (recorder.state !== 'inactive') {
      recorder.stop();
    } else {
      cleanupAllStreams();
      resolve(null);
    }
  });
};

const cleanupAllStreams = (): void => {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  if (screenVideoEl) {
    screenVideoEl.pause();
    screenVideoEl.srcObject = null;
    screenVideoEl = null;
  }

  if (cameraVideoEl) {
    cameraVideoEl.pause();
    cameraVideoEl.srcObject = null;
    cameraVideoEl = null;
  }

  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close().catch(() => {});
    audioContext = null;
  }

  if (cameraStreamRef) {
    cameraStreamRef.getTracks().forEach((t) => t.stop());
    cameraStreamRef = null;
  }

  if (displayStreamRef) {
    displayStreamRef.getTracks().forEach((t) => t.stop());
    displayStreamRef = null;
  }

  if (micStreamRef) {
    micStreamRef.getTracks().forEach((t) => t.stop());
    micStreamRef = null;
  }

  if (activeStream) {
    activeStream.getTracks().forEach((track) => track.stop());
    activeStream = null;
  }

  activeRecorder = null;
};
