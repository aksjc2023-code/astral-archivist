import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, SwitchCamera, FlipHorizontal, Shapes, LayoutGrid, Check } from 'lucide-react';
import { useRecorderStore } from '../../store/useRecorderStore';
import { useProjectionStore } from '../../store/useProjectionStore';
import type { ProjectionMaskShape, ProjectionSnapPreset } from '../../types/ipc';
import mandalaBg from '../../assets/camera_mandala.jpg';

export const Webcam: React.FC = () => {
  const { isCameraOn, setIsCameraOn, isRecording } = useRecorderStore();
  const {
    normX, normY, normDiameter, isMirrored, maskShape,
    updateProjection, setSnapPreset, setMaskShape, toggleMirror,
  } = useProjectionStore();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const DEFAULT_SIZE = 180;
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [size, setSize] = useState<number>(DEFAULT_SIZE);
  const [showSnapMenu, setShowSnapMenu] = useState<boolean>(false);
  const [showCameraMenu, setShowCameraMenu] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [pos, setPos] = useState(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const h = typeof window !== 'undefined' ? window.innerHeight : 800;
    return {
      x: Math.max(20, Math.round(w * normX - DEFAULT_SIZE / 2)),
      y: Math.max(72, Math.round(h * normY - DEFAULT_SIZE / 2)),
    };
  });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [isHoverBoundary, setIsHoverBoundary] = useState<boolean>(false);

  const dragStartRef = useRef({ startX: 0, startY: 0, posX: 0, posY: 0 });
  const resizeStartRef = useRef({ centerX: 0, centerY: 0, startDist: 0, startSize: DEFAULT_SIZE });
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = window.setTimeout(() => setToastMessage(null), 2000);
  };

  const refreshDevices = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devList = await navigator.mediaDevices.enumerateDevices();
      const videoDevs = devList.filter((d) => d.kind === 'videoinput');
      setDevices(videoDevs);
      if (videoDevs.length > 0 && !selectedDeviceId) {
        const preferred = videoDevs.find((d) => !d.label.toLowerCase().includes('droidcam')) ?? videoDevs[0];
        setSelectedDeviceId(preferred.deviceId);
      }
    } catch (err) {
      console.warn('Enumerate video devices error:', err);
    }
  };

  useEffect(() => {
    refreshDevices();
  }, []);

  useEffect(() => {
    let isMounted = true;
    const stopHardware = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    if (isCameraOn) {
      refreshDevices();
      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId
          ? { deviceId: { ideal: selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      };

      navigator.mediaDevices?.getUserMedia(constraints).then((stream) => {
        if (!isMounted) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        refreshDevices();
      }).catch((err) => {
        console.warn('Camera access error:', err);
        // Fallback to basic video constraint if ideal device failed
        navigator.mediaDevices?.getUserMedia({ video: true, audio: false }).then((stream) => {
          if (!isMounted) return stream.getTracks().forEach((t) => t.stop());
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => {});
          }
        }).catch(console.warn);
      });
    } else {
      stopHardware();
    }
    return () => { isMounted = false; stopHardware(); };
  }, [isCameraOn, selectedDeviceId]);

  const cycleCamera = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isCameraOn) {
      setIsCameraOn(true);
    }

    if (devices.length <= 1) {
      showToast('Camera active (Single device found)');
      return;
    }

    const currentIdx = devices.findIndex((d) => d.deviceId === selectedDeviceId);
    const nextIdx = (currentIdx + 1) % devices.length;
    const nextDev = devices[nextIdx];
    setSelectedDeviceId(nextDev.deviceId);
    showToast(`Switched: ${nextDev.label || `Camera ${nextIdx + 1}`}`);
  };

  const handlePointerHover = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDragging || isResizing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dist = Math.hypot(e.clientX - (rect.left + rect.width / 2), e.clientY - (rect.top + rect.height / 2));
    setIsHoverBoundary(dist >= rect.width / 2 - 24);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dist = Math.hypot(e.clientX - centerX, e.clientY - centerY);

    if (dist >= rect.width / 2 - 24) {
      setIsResizing(true);
      resizeStartRef.current = { centerX, centerY, startDist: dist, startSize: size };
    } else {
      setIsDragging(true);
      dragStartRef.current = { startX: e.clientX, startY: e.clientY, posX: pos.x, posY: pos.y };
    }
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (isResizing) {
        const curDist = Math.hypot(e.clientX - resizeStartRef.current.centerX, e.clientY - resizeStartRef.current.centerY);
        const delta = (curDist - resizeStartRef.current.startDist) * 2;
        const maxLimit = Math.min(window.innerWidth - 40, window.innerHeight - 40, 520);
        setSize(Math.round(Math.min(maxLimit, Math.max(90, resizeStartRef.current.startSize + delta))));
      } else if (isDragging) {
        const maxW = window.innerWidth - size - 10;
        const maxH = window.innerHeight - size - 10;
        setPos({
          x: Math.min(maxW, Math.max(10, dragStartRef.current.posX + (e.clientX - dragStartRef.current.startX))),
          y: Math.min(maxH, Math.max(64, dragStartRef.current.posY + (e.clientY - dragStartRef.current.startY))),
        });
      }
    };
    const onUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      const w = window.innerWidth;
      const h = window.innerHeight;
      updateProjection({
        normX: (pos.x + size / 2) / w,
        normY: (pos.y + size / 2) / h,
        normDiameter: size / w,
      });
    };
    if (isDragging || isResizing) {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDragging, isResizing, size, pos.x, pos.y, updateProjection]);

  const snapTo = (preset: ProjectionSnapPreset) => {
    setSnapPreset(preset);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const s = size;
    const margin = 24;
    const topMargin = 72; // Below the top navbar

    let nextX = pos.x;
    let nextY = pos.y;
    if (preset === 'top-left') {
      nextX = margin;
      nextY = topMargin;
    } else if (preset === 'top-right') {
      nextX = w - s - margin;
      nextY = topMargin;
    } else if (preset === 'bottom-left') {
      nextX = margin;
      nextY = h - s - margin;
    } else if (preset === 'bottom-right') {
      nextX = w - s - margin;
      nextY = h - s - margin;
    } else if (preset === 'center') {
      nextX = Math.round((w - s) / 2);
      nextY = Math.round((h - s) / 2);
    }

    setPos({ x: nextX, y: nextY });
    updateProjection({
      normX: (nextX + s / 2) / w,
      normY: (nextY + s / 2) / h,
      normDiameter: s / w,
      snapPreset: preset,
    });
    setShowSnapMenu(false);
    showToast(`Snapped to ${preset.replace('-', ' ').toUpperCase()}`);
  };

  const cycleMaskShape = (e: React.MouseEvent) => {
    e.stopPropagation();
    const shapes: ProjectionMaskShape[] = ['mandala', 'hexagon', 'rounded'];
    const nextIdx = (shapes.indexOf(maskShape) + 1) % shapes.length;
    const nextShape = shapes[nextIdx];
    setMaskShape(nextShape);

    const labels: Record<ProjectionMaskShape, string> = {
      mandala: 'Shape: Mandala Circle',
      hexagon: 'Shape: Hexagonal Ward',
      rounded: 'Shape: Rounded Screen',
    };
    showToast(labels[nextShape]);
  };

  // When recording is active and camera is OFF, omit overlay completely from screen capture
  if (isRecording && !isCameraOn) {
    return null;
  }

  const cursorClass = isResizing || isHoverBoundary ? 'cursor-nwse-resize' : isDragging ? 'cursor-grabbing' : 'cursor-grab';

  // Geometry styles for shapes
  const isHexagon = maskShape === 'hexagon';
  const isRounded = maskShape === 'rounded';

  const shapeWrapperStyle: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    clipPath: isHexagon
      ? 'polygon(50% 0%, 93.3% 25%, 93.3% 75%, 50% 100%, 6.7% 75%, 6.7% 25%)'
      : undefined,
  };

  const shapeBorderRadius = isHexagon
    ? undefined
    : isRounded
    ? 'rounded-3xl'
    : 'rounded-full';

  return (
    <div style={{ left: `${pos.x}px`, top: `${pos.y}px` }} className="fixed z-50 flex flex-col items-center select-none">
      <div className="group relative flex items-center justify-center">
        {/* Main Astral Projection Display */}
        <div
          onMouseMove={handlePointerHover}
          onMouseDown={handleMouseDown}
          style={{ ...shapeWrapperStyle, backgroundImage: `url(${mandalaBg})` }}
          className={`relative flex items-center justify-center overflow-hidden ${shapeBorderRadius ?? ''} bg-cover bg-center shadow-2xl transition-all hover:scale-[1.01] ${cursorClass}`}
          title={isHoverBoundary ? 'Drag boundary to resize' : 'Drag inside boundary to move'}
        >
          {/* Hexagon Border SVG Overlay */}
          {isHexagon ? (
            <svg
              className="absolute inset-0 h-full w-full pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <polygon
                points="50,1 93.3,25 93.3,75 50,99 6.7,75 6.7,25"
                fill="none"
                stroke="#f59e0b"
                strokeWidth="3.5"
                className="drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]"
              />
              <polygon
                points="50,4 90.3,27 90.3,73 50,96 9.7,73 9.7,27"
                fill="none"
                stroke="rgba(251,191,36,0.4)"
                strokeWidth="1"
              />
            </svg>
          ) : (
            <div className={`absolute inset-0 ${shapeBorderRadius} transition-all pointer-events-none ${
              isHoverBoundary || isResizing
                ? 'border-4 border-dashed border-amber-400 scale-[0.98]'
                : 'border-4 border-amber-500/80 ring-4 ring-amber-500/30'
            }`} />
          )}

          {/* Spinning golden runes for Mandala mode */}
          {maskShape === 'mandala' && (
            <div className="absolute inset-0 rounded-full border-2 border-amber-400/30 animate-spin-slow pointer-events-none" />
          )}

          {/* Live Video Feed */}
          {isCameraOn && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 h-full w-full object-cover pointer-events-none ${
                isMirrored ? '-scale-x-100' : 'scale-x-100'
              }`}
            />
          )}
        </div>

        {/* Temporary Notification Toast */}
        {toastMessage && (
          <div className="absolute -bottom-8 z-40 whitespace-nowrap rounded-full border border-amber-500/60 bg-slate-950/95 px-3 py-0.5 text-[10px] font-bold text-astral-amber shadow-xl backdrop-blur-md animate-fadeIn">
            {toastMessage}
          </div>
        )}

        {/* Floating Astral Dock Toolbar */}
        <div
          className="absolute -top-6 z-30 flex items-center gap-1.5 rounded-full border border-amber-500/60 bg-slate-950/95 px-3 py-1 text-xs text-slate-200 opacity-0 group-hover:opacity-100 transition-opacity shadow-2xl backdrop-blur-md"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* 1. Quick Corner Snap Menu */}
          <div className="relative">
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setShowCameraMenu(false);
                setShowSnapMenu(!showSnapMenu);
              }}
              className={`p-1 rounded transition-colors ${showSnapMenu ? 'text-astral-amber bg-amber-500/20' : 'hover:text-astral-amber'}`}
              title="Snap to corner preset"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            {showSnapMenu && (
              <div
                className="absolute top-8 left-0 z-50 flex flex-col gap-1 rounded-xl border border-amber-500/50 bg-slate-950/95 p-1.5 shadow-2xl backdrop-blur-xl w-32 text-[11px]"
                onMouseDown={(e) => e.stopPropagation()}
              >
                {(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      snapTo(preset);
                    }}
                    className="flex items-center justify-between px-2 py-1 text-left rounded hover:bg-amber-500/20 hover:text-astral-amber transition-colors"
                  >
                    <span className="capitalize">{preset.replace('-', ' ')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 2. Mask Shape Toggle */}
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={cycleMaskShape}
            className="p-1 hover:text-astral-amber rounded transition-colors"
            title={`Cycle shape (Current: ${maskShape})`}
          >
            <Shapes className="h-3.5 w-3.5" />
          </button>

          {/* 3. Mirror Flip Toggle */}
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              toggleMirror();
              showToast(isMirrored ? 'Mirror: Normal' : 'Mirror: Flipped');
            }}
            className={`p-1 rounded transition-colors ${isMirrored ? 'text-astral-amber' : 'text-slate-400 hover:text-slate-200'}`}
            title="Toggle horizontal mirror"
          >
            <FlipHorizontal className="h-3.5 w-3.5" />
          </button>

          {/* 4. Camera Switcher / Device Cycle */}
          <div className="relative">
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={cycleCamera}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowSnapMenu(false);
                setShowCameraMenu(!showCameraMenu);
              }}
              className="p-1 hover:text-astral-amber rounded transition-colors"
              title={devices.length > 1 ? 'Switch camera (Left-click cycle, Right-click list)' : 'Switch camera / turn on'}
            >
              <SwitchCamera className="h-3.5 w-3.5" />
            </button>

            {/* Optional Camera List Menu on Right Click or Multiple Devices */}
            {showCameraMenu && devices.length > 0 && (
              <div
                className="absolute top-8 right-0 z-50 flex flex-col gap-1 rounded-xl border border-amber-500/50 bg-slate-950/95 p-1.5 shadow-2xl backdrop-blur-xl w-48 text-[11px]"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="px-2 py-0.5 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-800">
                  Select Video Input
                </div>
                {devices.map((d, idx) => {
                  const isCurrent = d.deviceId === selectedDeviceId;
                  return (
                    <button
                      key={d.deviceId || idx}
                      type="button"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDeviceId(d.deviceId);
                        if (!isCameraOn) setIsCameraOn(true);
                        setShowCameraMenu(false);
                        showToast(`Camera: ${d.label || `Device ${idx + 1}`}`);
                      }}
                      className={`flex items-center justify-between px-2 py-1 text-left rounded hover:bg-amber-500/20 hover:text-astral-amber transition-colors ${
                        isCurrent ? 'text-astral-amber font-semibold' : 'text-slate-300'
                      }`}
                    >
                      <span className="truncate">{d.label || `Camera ${idx + 1}`}</span>
                      {isCurrent && <Check className="h-3 w-3 text-astral-amber shrink-0 ml-1" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 5. Camera ON/OFF */}
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              const next = !isCameraOn;
              setIsCameraOn(next);
              showToast(next ? 'Webcam Activated' : 'Webcam Deactivated');
            }}
            className="p-1 hover:text-astral-amber flex items-center gap-1 font-semibold"
            title={isCameraOn ? 'Turn Camera Off' : 'Turn Camera On'}
          >
            {isCameraOn ? (
              <>
                <Camera className="h-3.5 w-3.5 text-astral-amber" />
                <span className="text-[10px] text-astral-amber">Cam ON</span>
              </>
            ) : (
              <>
                <CameraOff className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-[10px] text-slate-400">Cam OFF</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
