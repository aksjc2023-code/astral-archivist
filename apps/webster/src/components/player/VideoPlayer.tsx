import React, { useEffect, useRef } from 'react';
import { useTimelineStore } from '../../store/useTimelineStore';

export interface VideoPlayerProps {
  src: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ src }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isPlaying = useTimelineStore((state) => state.isPlaying);
  const skipRanges = useTimelineStore((state) => state.skipRanges);
  const setCurrentTime = useTimelineStore((state) => state.setCurrentTime);
  const setSourceDuration = useTimelineStore((state) => state.setSourceDuration);

  // Synchronize play/pause
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying && video.paused) {
      video.play().catch(() => {});
    } else if (!isPlaying && !video.paused) {
      video.pause();
    }
  }, [isPlaying]);

  // Monitor playback and skip over deleted ranges automatically
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let animFrame: number;

    const onFrame = () => {
      if (!video.paused && !video.seeking) {
        const time = video.currentTime;

        for (const range of skipRanges) {
          // If the playhead enters a skipped section, skip directly to its end
          if (time >= range.start && time < range.end) {
            video.currentTime = range.end;
            break;
          }
        }
        setCurrentTime(video.currentTime);
      }
      animFrame = requestAnimationFrame(onFrame);
    };

    animFrame = requestAnimationFrame(onFrame);
    return () => cancelAnimationFrame(animFrame);
  }, [skipRanges, setCurrentTime]);

  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center">
      <video
        ref={videoRef}
        src={src}
        playsInline
        preload="auto"
        onLoadedMetadata={(e) => {
          setSourceDuration(e.currentTarget.duration);
        }}
        className="w-full h-full object-contain"
      />
    </div>
  );
};
