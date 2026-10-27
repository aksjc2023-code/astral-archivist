import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, SwitchCamera } from 'lucide-react';
import { useRecorderStore } from '../../store/useRecorderStore';
import mandalaBg from '../../assets/camera_mandala.jpg';

export const Webcam: React.FC = () => {
  const { isCameraOn, setIsCameraOn, isRecording } = useRecorderStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const DEFAULT_SIZE = 180; // 0.5 times the original 360px size
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [size, setSize] = useState<number>(DEFAULT_SIZE);
  const [pos, setPos] = useState(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const h = typeof window !== 'undefined' ? window.innerHeight : 800;
    return {
      x: Math.max(20, w - DEFAULT_SIZE - 32),
      y: Math.max(20, h - DEFAULT_SIZE - 32),
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
    const onUp = () => { setIsDragging(false); setIsResizing(false); };
    if (isDragging || isResizing) {
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    }
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDragging, isResizing, size]);

  // When recording is active and camera is OFF, omit overlay completely from screen capture
  if (isRecording && !isCameraOn) {
    return null;
  }

  const cursorClass = isResizing || isHoverBoundary ? 'cursor-nwse-resize' : isDragging ? 'cursor-grabbing' : 'cursor-grab';

  return (
    <div style={{ left: `${pos.x}px`, top: `${pos.y}px` }} className="fixed z-50 flex flex-col items-center select-none">
      <div className="group relative flex items-center justify-center">
        <div
          onMouseMove={handlePointerHover}
          onMouseDown={handleMouseDown}
          style={{ width: `${size}px`, height: `${size}px`, backgroundImage: `url(${mandalaBg})` }}
          className={`relative flex items-center justify-center overflow-hidden rounded-full bg-cover bg-center shadow-2xl transition-transform hover:scale-[1.01] ${cursorClass}`}
          title={isHoverBoundary ? 'Drag boundary to resize' : 'Drag inside boundary to move'}
        >
          <div className={`absolute inset-0 rounded-full transition-all pointer-events-none ${
            isHoverBoundary || isResizing ? 'border-4 border-dashed border-amber-400 scale-[0.98]' : 'border-4 border-amber-500/80 ring-4 ring-amber-500/30'
          }`} />
          <div className="absolute inset-0 rounded-full border-2 border-amber-400/30 animate-spin-slow pointer-events-none" />

          {isCameraOn && (
            <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover -scale-x-100 pointer-events-none" />
          )}
        </div>

        {/* Floating dock */}
        <div
          className="absolute -top-4 z-30 flex items-center gap-2 rounded-full border border-amber-500/60 bg-slate-950/90 px-4 py-1.5 text-xs text-slate-200 opacity-0 group-hover:opacity-100 transition-opacity shadow-2xl backdrop-blur-md"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {devices.length > 1 && (
            <button onClick={cycleCamera} className="p-1 hover:text-astral-amber" title="Switch camera">
              <SwitchCamera className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setIsCameraOn(!isCameraOn); }}
            className="p-1 hover:text-astral-amber flex items-center gap-1 font-semibold"
            title={isCameraOn ? 'Turn Camera Off' : 'Turn Camera On'}
          >
            {isCameraOn ? (
              <>
                <Camera className="h-4 w-4 text-astral-amber" />
                <span className="text-[11px] text-astral-amber">Cam ON</span>
              </>
            ) : (
              <>
                <CameraOff className="h-4 w-4 text-slate-400" />
                <span className="text-[11px] text-slate-400">Cam OFF</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
