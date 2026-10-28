import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, CameraOff, SwitchCamera, FlipHorizontal, Shapes, LayoutGrid } from 'lucide-react';
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
  const [pos, setPos] = useState(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const h = typeof window !== 'undefined' ? window.innerHeight : 800;
    return {
      x: Math.max(20, Math.round(w * normX - DEFAULT_SIZE / 2)),
      y: Math.max(20, Math.round(h * normY - DEFAULT_SIZE / 2)),
    };
  });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [isHoverBoundary, setIsHoverBoundary] = useState<boolean>(false);

  const dragStartRef = useRef({ startX: 0, startY: 0, posX: 0, posY: 0 });
  const resizeStartRef = useRef({ centerX: 0, centerY: 0, startDist: 0, startSize: DEFAULT_SIZE });

  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then((devList) => {
      const videoDevs = devList.filter((d) => d.kind === 'videoinput');
      setDevices(videoDevs);
      const preferred = videoDevs.find((d) => !d.label.toLowerCase().includes('droidcam')) ?? videoDevs[0];
      if (preferred) setSelectedDeviceId(preferred.deviceId);
    }).catch(console.warn);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const stopHardware = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    if (isCameraOn) {
      const constraints = {
        video: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : { width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false,
      };
      navigator.mediaDevices?.getUserMedia(constraints).then((stream) => {
        if (!isMounted) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }).catch(console.warn);
    } else {
      stopHardware();
    }
    return () => { isMounted = false; stopHardware(); };
  }, [isCameraOn, selectedDeviceId]);

  const cycleCamera = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (devices.length <= 1) return;
    const idx = devices.findIndex((d) => d.deviceId === selectedDeviceId);
    setSelectedDeviceId(devices[(idx + 1) % devices.length].deviceId);
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
          y: Math.min(maxH, Math.max(10, dragStartRef.current.posY + (e.clientY - dragStartRef.current.startY))),
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
    let nextX = pos.x;
    let nextY = pos.y;
    if (preset === 'top-left') { nextX = 24; nextY = 24; }
    else if (preset === 'top-right') { nextX = w - s - 24; nextY = 24; }
    else if (preset === 'bottom-left') { nextX = 24; nextY = h - s - 24; }
    else if (preset === 'bottom-right') { nextX = w - s - 24; nextY = h - s - 24; }
    else if (preset === 'center') { nextX = Math.round((w - s) / 2); nextY = Math.round((h - s) / 2); }
    setPos({ x: nextX, y: nextY });
    setShowSnapMenu(false);
  };

  const cycleMaskShape = (e: React.MouseEvent) => {
    e.stopPropagation();
    const shapes: ProjectionMaskShape[] = ['mandala', 'hexagon', 'rounded'];
    const nextIdx = (shapes.indexOf(maskShape) + 1) % shapes.length;
    setMaskShape(shapes[nextIdx]);
  };

  // When recording is active and camera is OFF, omit overlay completely from screen capture
  if (isRecording && !isCameraOn) {
    return null;
  }

  const cursorClass = isResizing || isHoverBoundary ? 'cursor-nwse-resize' : isDragging ? 'cursor-grabbing' : 'cursor-grab';
  const shapeClass = maskShape === 'rounded' ? 'rounded-3xl' : 'rounded-full';

  return (
    <div style={{ left: `${pos.x}px`, top: `${pos.y}px` }} className="fixed z-50 flex flex-col items-center select-none">
      <div className="group relative flex items-center justify-center">
        <div
          onMouseMove={handlePointerHover}
          onMouseDown={handleMouseDown}
          style={{ width: `${size}px`, height: `${size}px`, backgroundImage: `url(${mandalaBg})` }}
          className={`relative flex items-center justify-center overflow-hidden ${shapeClass} bg-cover bg-center shadow-2xl transition-transform hover:scale-[1.01] ${cursorClass}`}
          title={isHoverBoundary ? 'Drag boundary to resize' : 'Drag inside boundary to move'}
        >
          <div className={`absolute inset-0 ${shapeClass} transition-all pointer-events-none ${
            isHoverBoundary || isResizing ? 'border-4 border-dashed border-amber-400 scale-[0.98]' : 'border-4 border-amber-500/80 ring-4 ring-amber-500/30'
          }`} />
          {maskShape === 'mandala' && (
            <div className="absolute inset-0 rounded-full border-2 border-amber-400/30 animate-spin-slow pointer-events-none" />
          )}

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

        {/* Floating Astral Dock */}
        <div
          className="absolute -top-5 z-30 flex items-center gap-1.5 rounded-full border border-amber-500/60 bg-slate-950/95 px-3 py-1 text-xs text-slate-200 opacity-0 group-hover:opacity-100 transition-opacity shadow-2xl backdrop-blur-md"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Quick Corner Snap Dropdown / Button */}
          <div className="relative">
            <button
              onClick={() => setShowSnapMenu(!showSnapMenu)}
              className="p-1 hover:text-astral-amber rounded transition-colors"
              title="Snap to corner preset"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            {showSnapMenu && (
              <div className="absolute top-7 left-0 z-40 flex flex-col gap-1 rounded-xl border border-amber-500/40 bg-slate-950/95 p-1.5 shadow-2xl backdrop-blur-lg w-28 text-[11px]">
                <button onClick={() => snapTo('top-left')} className="px-2 py-1 text-left rounded hover:bg-amber-500/20 hover:text-astral-amber">Top-Left</button>
                <button onClick={() => snapTo('top-right')} className="px-2 py-1 text-left rounded hover:bg-amber-500/20 hover:text-astral-amber">Top-Right</button>
                <button onClick={() => snapTo('bottom-left')} className="px-2 py-1 text-left rounded hover:bg-amber-500/20 hover:text-astral-amber">Bottom-Left</button>
                <button onClick={() => snapTo('bottom-right')} className="px-2 py-1 text-left rounded hover:bg-amber-500/20 hover:text-astral-amber">Bottom-Right</button>
                <button onClick={() => snapTo('center')} className="px-2 py-1 text-left rounded hover:bg-amber-500/20 hover:text-astral-amber">Center</button>
              </div>
            )}
          </div>

          {/* Mask Shape Toggle */}
          <button
            onClick={cycleMaskShape}
            className="p-1 hover:text-astral-amber rounded transition-colors"
            title={`Cycle shape (current: ${maskShape})`}
          >
            <Shapes className="h-3.5 w-3.5" />
          </button>

          {/* Mirror Flip Toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); toggleMirror(); }}
            className={`p-1 rounded transition-colors ${isMirrored ? 'text-astral-amber' : 'text-slate-400 hover:text-slate-200'}`}
            title="Toggle horizontal mirror"
          >
            <FlipHorizontal className="h-3.5 w-3.5" />
          </button>

          {/* Device Cycle */}
          {devices.length > 1 && (
            <button onClick={cycleCamera} className="p-1 hover:text-astral-amber" title="Switch camera">
              <SwitchCamera className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Camera ON/OFF */}
          <button
            onClick={(e) => { e.stopPropagation(); setIsCameraOn(!isCameraOn); }}
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
