import type { RecordingConfig } from '../types/ipc';
import { getProjectionSnapshot } from '../store/useProjectionStore';

let activeStream: MediaStream | null = null;
let activeRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];

// Persistent media resources & element handles
let displayStreamRef: MediaStream | null = null;
let cameraStreamRef: MediaStream | null = null;
let micStreamRef: MediaStream | null = null;
let screenVideoEl: HTMLVideoElement | null = null;
let cameraVideoEl: HTMLVideoElement | null = null;
let animFrameId: number | null = null;

// Persistent Web Audio Graph (Prevents V8 Garbage Collection of live mixer streams)
let audioContext: AudioContext | null = null;
let sysStreamWrapper: MediaStream | null = null;
let micStreamWrapper: MediaStream | null = null;
let sysAudioSourceNode: MediaStreamAudioSourceNode | null = null;
let micAudioSourceNode: MediaStreamAudioSourceNode | null = null;
let audioDestinationNode: MediaStreamAudioDestinationNode | null = null;
let micGainNode: GainNode | null = null;
let sysGainNode: GainNode | null = null;
let micAnalyserNode: AnalyserNode | null = null;

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

/**
 * Returns current microphone audio level in dB (-100 to 0) for UI metering
 */
export const getMicLevelDb = (): number => {
  if (!micAnalyserNode) return -100;
  try {
    const pcmData = new Float32Array(micAnalyserNode.fftSize);
    micAnalyserNode.getFloatTimeDomainData(pcmData);
    let sumSquares = 0;
    for (let i = 0; i < pcmData.length; i++) {
      sumSquares += pcmData[i] * pcmData[i];
    }
    const rms = Math.sqrt(sumSquares / pcmData.length);
    if (rms <= 0.00001) return -100;
    return Math.max(-100, Math.min(0, 20 * Math.log10(rms)));
  } catch {
    return -100;
  }
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
      // ==============================================================
      // 1. PURE AUDIO / VOICE-ONLY RECORDING MODE
      // ==============================================================
      let micStream: MediaStream | null = null;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: 48000,
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
        throw new Error('No audio tracks found from microphone. Please check microphone permissions in Windows Settings.');
      }

      micStreamRef = micStream;

      // Set up persistent AudioContext for live metering and gain normalization
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioContext = new AudioCtx();
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }

        micStreamWrapper = new MediaStream([micStream.getAudioTracks()[0]]);
        micAudioSourceNode = audioContext.createMediaStreamSource(micStreamWrapper);
        micAnalyserNode = audioContext.createAnalyser();
        micAnalyserNode.fftSize = 512;
        micAudioSourceNode.connect(micAnalyserNode);

        audioDestinationNode = audioContext.createMediaStreamDestination();
        micAudioSourceNode.connect(audioDestinationNode);
        activeStream = audioDestinationNode.stream;
      } catch (ctxErr) {
        console.warn('AudioContext routing failed, using direct mic stream:', ctxErr);
        activeStream = micStream;
      }

      // Best supported audio container
      const audioTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/aac',
      ];
      let supportedAudioMime: string | undefined = undefined;
      for (const t of audioTypes) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
          supportedAudioMime = t;
          break;
        }
      }

      activeRecorder = supportedAudioMime
        ? new MediaRecorder(activeStream, { mimeType: supportedAudioMime, audioBitsPerSecond: 192000 })
        : new MediaRecorder(activeStream);

    } else {
      // ==============================================================
      // 2. SCREEN / DISPLAY RECORDING MODE (Entire Screen & Windows)
      // ==============================================================
      const targetFps = config.fps || 60;
      const targetSurface = config.target_type === 'window' ? 'window' : 'monitor';

      // Tiered DisplayMedia Request with Surface & Audio Fallbacks
      try {
        // Tier 1: Modern Chromium display constraints
        displayStreamRef = await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: targetSurface,
            frameRate: { ideal: targetFps },
          } as MediaTrackConstraints,
          audio: config.include_system_audio
            ? ({
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                systemAudio: 'include',
              } as unknown as boolean)
            : false,
        });
      } catch (tier1Err) {
        console.warn('Tier 1 getDisplayMedia failed, falling back to standard display request...', tier1Err);
        try {
          // Tier 2: Standard video + audio boolean
          displayStreamRef = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: { ideal: targetFps } },
            audio: config.include_system_audio ? true : false,
          });
        } catch (tier2Err) {
          console.warn('Tier 2 getDisplayMedia failed, falling back to video only...', tier2Err);
          // Tier 3: Basic video only (prevents system audio refusal from aborting screen share)
          displayStreamRef = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false,
          });
        }
      }

      if (!displayStreamRef || displayStreamRef.getVideoTracks().length === 0) {
        throw new Error('No video track returned from screen capture prompt.');
      }

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

      // MIX AUDIO TRACKS (System Audio + Microphone) with persistent node storage
      const sysAudioTracks = displayStreamRef.getAudioTracks();
      const micAudioTracks = micStreamRef ? micStreamRef.getAudioTracks() : [];
      let mixedAudioTrack: MediaStreamTrack | null = null;

      if (sysAudioTracks.length > 0 || micAudioTracks.length > 0) {
        try {
          const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          audioContext = new AudioCtx();
          if (audioContext.state === 'suspended') {
            await audioContext.resume();
          }

          audioDestinationNode = audioContext.createMediaStreamDestination();

          // Connect System Audio if present
          if (sysAudioTracks.length > 0) {
            sysStreamWrapper = new MediaStream([sysAudioTracks[0]]);
            sysAudioSourceNode = audioContext.createMediaStreamSource(sysStreamWrapper);
            sysGainNode = audioContext.createGain();
            sysGainNode.gain.value = 1.0;
            sysAudioSourceNode.connect(sysGainNode);
            sysGainNode.connect(audioDestinationNode);
          }

          // Connect Microphone Audio if present
          if (micAudioTracks.length > 0) {
            micStreamWrapper = new MediaStream([micAudioTracks[0]]);
            micAudioSourceNode = audioContext.createMediaStreamSource(micStreamWrapper);
            micGainNode = audioContext.createGain();
            micGainNode.gain.value = 1.15; // Subtle boost for spoken clarity

            micAnalyserNode = audioContext.createAnalyser();
            micAnalyserNode.fftSize = 512;

            micAudioSourceNode.connect(micAnalyserNode);
            micAudioSourceNode.connect(micGainNode);
            micGainNode.connect(audioDestinationNode);
          }

          mixedAudioTrack = audioDestinationNode.stream.getAudioTracks()[0] || null;
        } catch (mixErr) {
          console.warn('Web Audio API mixing error, falling back to direct track:', mixErr);
          mixedAudioTrack = micAudioTracks[0] || sysAudioTracks[0] || null;
        }
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

        // Ensure video dimensions are loaded before sizing canvas (prevents 0x0 canvas bug)
        if (screenVideoEl.videoWidth === 0) {
          await new Promise<void>((resolve) => {
            screenVideoEl!.onloadedmetadata = () => resolve();
            setTimeout(resolve, 500);
          });
        }

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

          // B) Draw flexible Astral Projection camera overlay with dynamic coordinates & mask
          if (cameraVideoEl.readyState >= 2) {
            const proj = getProjectionSnapshot();
            const diameter = Math.round(
              Math.min(Math.max(w * (proj.normDiameter || 0.14), 100), Math.min(w * 0.45, 520))
            );
            const radius = diameter / 2;
            const cx = Math.max(radius + 12, Math.min(w - radius - 12, Math.round(w * proj.normX)));
            const cy = Math.max(radius + 12, Math.min(h - radius - 12, Math.round(h * proj.normY)));

            ctx.save();
            ctx.shadowColor = 'rgba(245, 158, 11, 0.45)';
            ctx.shadowBlur = 14;

            // Shape path based on maskShape
            ctx.beginPath();
            if (proj.maskShape === 'hexagon') {
              for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i - Math.PI / 6;
                const hx = cx + radius * Math.cos(angle);
                const hy = cy + radius * Math.sin(angle);
                if (i === 0) ctx.moveTo(hx, hy);
                else ctx.lineTo(hx, hy);
              }
            } else if (proj.maskShape === 'rounded') {
              const rx = cx - radius;
              const ry = cy - radius;
              ctx.roundRect(rx, ry, diameter, diameter, 18);
            } else {
              // Mandala circle
              ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            }
            ctx.closePath();
            ctx.clip();

            // Draw video with optional horizontal mirror
            ctx.translate(cx, cy);
            if (proj.isMirrored) {
              ctx.scale(-1, 1);
            }
            ctx.drawImage(cameraVideoEl, -radius, -radius, diameter, diameter);
            ctx.restore();

            // Arcane golden border
            ctx.save();
            ctx.beginPath();
            if (proj.maskShape === 'hexagon') {
              for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i - Math.PI / 6;
                const hx = cx + radius * Math.cos(angle);
                const hy = cy + radius * Math.sin(angle);
                if (i === 0) ctx.moveTo(hx, hy);
                else ctx.lineTo(hx, hy);
              }
            } else if (proj.maskShape === 'rounded') {
              ctx.roundRect(cx - radius, cy - radius, diameter, diameter, 18);
            } else {
              ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            }
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#f59e0b';
            ctx.stroke();

            // Mandala inner mystical aura ring
            if (proj.maskShape === 'mandala') {
              ctx.beginPath();
              ctx.arc(cx, cy, radius - 3, 0, Math.PI * 2);
              ctx.lineWidth = 1;
              ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
              ctx.stroke();
            }
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

      // User-configured visual fidelity bitrate with smart framerate defaults
      const videoBitsPerSecond = config.video_bitrate_bps || (targetFps >= 60 ? 12_000_000 : 6_000_000);
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

    activeRecorder.start(150); // Flush chunks every 150ms to ensure no trailing audio loss
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

  // Disconnect audio nodes before closing context
  try {
    if (sysAudioSourceNode) {
      sysAudioSourceNode.disconnect();
      sysAudioSourceNode = null;
    }
    if (micAudioSourceNode) {
      micAudioSourceNode.disconnect();
      micAudioSourceNode = null;
    }
    if (sysGainNode) {
      sysGainNode.disconnect();
      sysGainNode = null;
    }
    if (micGainNode) {
      micGainNode.disconnect();
      micGainNode = null;
    }
    if (micAnalyserNode) {
      micAnalyserNode.disconnect();
      micAnalyserNode = null;
    }
  } catch {}

  sysStreamWrapper = null;
  micStreamWrapper = null;
  audioDestinationNode = null;

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
