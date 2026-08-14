import React, { useState, useEffect, useRef } from 'react';
import {
  ScissorsIcon,
  PlayIcon,
  PauseIcon,
  ArrowPathIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

interface VideoTrimmerProps {
  videoFile: File | null;
  videoUrl: string | null;
  duration?: number;
  trimStart: number;
  trimEnd: number;
  onChange: (start: number, end: number) => void;
  className?: string;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins > 0 ? `${mins}:` : ''}${secs.toString().padStart(mins > 0 ? 2 : 1, '0')}.${ms}с`;
}

export const VideoTrimmer: React.FC<VideoTrimmerProps> = ({
  videoFile,
  videoUrl,
  duration: initialDuration = 0,
  trimStart,
  trimEnd,
  onChange,
  className = '',
}) => {
  const [totalDuration, setTotalDuration] = useState(initialDuration);
  const [isPlayingSegment, setIsPlayingSegment] = useState(false);
  const [currentTime, setCurrentTime] = useState(trimStart);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDraggingHandle, setIsDraggingHandle] = useState<'start' | 'end' | 'range' | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragInitialStart, setDragInitialStart] = useState(0);
  const [dragInitialEnd, setDragInitialEnd] = useState(0);

  // Load duration when video loads
  useEffect(() => {
    if (videoUrl) {
      const v = document.createElement('video');
      v.src = videoUrl;
      v.onloadedmetadata = () => {
        const d = v.duration || 10;
        setTotalDuration(d);
        if (trimEnd === 0 || trimEnd > d) {
          onChange(0, Math.min(d, 10)); // Default to first 10s or full
        }
      };
    }
  }, [videoUrl]);

  // Loop preview between trimStart and trimEnd
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.currentTime >= trimEnd) {
        video.currentTime = trimStart;
        video.play().catch(() => {});
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [trimStart, trimEnd]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlayingSegment) {
      video.pause();
      setIsPlayingSegment(false);
    } else {
      video.currentTime = trimStart;
      video.play().then(() => setIsPlayingSegment(true)).catch(() => {});
    }
  };

  const segmentDuration = Math.max(0.5, trimEnd - trimStart);

  // Quick Preset Durations
  const applyPresetDuration = (targetSecs: number) => {
    if (totalDuration <= 0) return;
    const newEnd = Math.min(totalDuration, trimStart + targetSecs);
    const newStart = Math.max(0, newEnd - targetSecs);
    onChange(Number(newStart.toFixed(1)), Number(newEnd.toFixed(1)));
    if (videoRef.current) {
      videoRef.current.currentTime = newStart;
    }
  };

  // Timeline Mouse / Drag Scrubbing
  const handleTimelineMouseDown = (e: React.MouseEvent, type: 'start' | 'end' | 'range') => {
    e.stopPropagation();
    setIsDraggingHandle(type);
    setDragStartX(e.clientX);
    setDragInitialStart(trimStart);
    setDragInitialEnd(trimEnd);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingHandle || !timelineRef.current || totalDuration <= 0) return;

      const rect = timelineRef.current.getBoundingClientRect();
      const deltaPercent = (e.clientX - dragStartX) / rect.width;
      const deltaTime = deltaPercent * totalDuration;

      if (isDraggingHandle === 'start') {
        const newStart = Math.max(0, Math.min(trimEnd - 1, dragInitialStart + deltaTime));
        onChange(Number(newStart.toFixed(1)), trimEnd);
        if (videoRef.current) videoRef.current.currentTime = newStart;
      } else if (isDraggingHandle === 'end') {
        const newEnd = Math.max(trimStart + 1, Math.min(totalDuration, dragInitialEnd + deltaTime));
        onChange(trimStart, Number(newEnd.toFixed(1)));
        if (videoRef.current) videoRef.current.currentTime = newEnd;
      } else if (isDraggingHandle === 'range') {
        const span = dragInitialEnd - dragInitialStart;
        let newStart = dragInitialStart + deltaTime;
        let newEnd = dragInitialEnd + deltaTime;

        if (newStart < 0) {
          newStart = 0;
          newEnd = span;
        } else if (newEnd > totalDuration) {
          newEnd = totalDuration;
          newStart = totalDuration - span;
        }

        onChange(Number(newStart.toFixed(1)), Number(newEnd.toFixed(1)));
        if (videoRef.current) videoRef.current.currentTime = newStart;
      }
    };

    const handleMouseUp = () => {
      setIsDraggingHandle(null);
    };

    if (isDraggingHandle) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingHandle, dragStartX, dragInitialStart, dragInitialEnd, totalDuration, trimStart, trimEnd, onChange]);

  if (!videoUrl || totalDuration <= 0) {
    return null;
  }

  const startPercent = (trimStart / totalDuration) * 100;
  const endPercent = (trimEnd / totalDuration) * 100;
  const widthPercent = endPercent - startPercent;
  const currentPercent = (currentTime / totalDuration) * 100;

  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-2xl p-4 text-white shadow-xl ${className}`}>
      {/* Hidden preview video instance for time scrubbing */}
      <video ref={videoRef} src={videoUrl} className="hidden" muted playsInline />

      {/* Header Info */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center">
            <ScissorsIcon className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-200">
              Обрезка видео (Trimmer)
            </h4>
            <p className="text-[11px] text-gray-400">
              Исходник: {formatTime(totalDuration)} • Выбрано: <span className="text-brand-300 font-bold">{formatTime(segmentDuration)}</span>
            </p>
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            segmentDuration <= 10
              ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40'
              : segmentDuration <= 20
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
          }`}>
            {segmentDuration <= 10 ? '⚡ Вирусная длина (до 10с)' : 'Стандарт (10-30с)'}
          </span>

          <button
            type="button"
            onClick={togglePlay}
            className="px-3 py-1 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow"
          >
            {isPlayingSegment ? (
              <>
                <PauseIcon className="w-3.5 h-3.5" /> Пауза
              </>
            ) : (
              <>
                <PlayIcon className="w-3.5 h-3.5" /> Тест отрезка
              </>
            )}
          </button>
        </div>
      </div>

      {/* Timeline Scrubber */}
      <div className="relative my-4 select-none">
        <div
          ref={timelineRef}
          className="relative h-12 bg-gray-800 rounded-xl overflow-hidden cursor-pointer border border-gray-700/80"
        >
          {/* Filmstrip faux frames */}
          <div className="absolute inset-0 flex items-center justify-between px-2 opacity-20 pointer-events-none">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="w-4 h-8 bg-gray-600 rounded-sm border border-gray-500" />
            ))}
          </div>

          {/* Dimmed Left Unselected Area */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-black/70 pointer-events-none"
            style={{ width: `${startPercent}%` }}
          />

          {/* Dimmed Right Unselected Area */}
          <div
            className="absolute top-0 bottom-0 right-0 bg-black/70 pointer-events-none"
            style={{ width: `${100 - endPercent}%` }}
          />

          {/* Selected Active Range Box */}
          <div
            onMouseDown={(e) => handleTimelineMouseDown(e, 'range')}
            className="absolute top-0 bottom-0 border-y-2 border-brand-400 bg-brand-500/20 cursor-grab active:cursor-grabbing group transition-colors"
            style={{
              left: `${startPercent}%`,
              width: `${widthPercent}%`,
            }}
          >
            {/* Center Drag Label */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-[10px] font-bold text-brand-200 bg-black/50 px-2 py-0.5 rounded-full backdrop-blur-sm shadow">
                ↔ {formatTime(segmentDuration)}
              </span>
            </div>
          </div>

          {/* Left Trim Handle */}
          <div
            onMouseDown={(e) => handleTimelineMouseDown(e, 'start')}
            className="absolute top-0 bottom-0 w-3.5 bg-brand-500 hover:bg-brand-400 rounded-l-md cursor-ew-resize flex items-center justify-center z-10 shadow-lg"
            style={{ left: `calc(${startPercent}% - 3px)` }}
            title="Зажмите для изменения начала"
          >
            <div className="w-0.5 h-4 bg-gray-900 rounded-full" />
          </div>

          {/* Right Trim Handle */}
          <div
            onMouseDown={(e) => handleTimelineMouseDown(e, 'end')}
            className="absolute top-0 bottom-0 w-3.5 bg-brand-500 hover:bg-brand-400 rounded-r-md cursor-ew-resize flex items-center justify-center z-10 shadow-lg"
            style={{ left: `calc(${endPercent}% - 11px)` }}
            title="Зажмите для изменения конца"
          >
            <div className="w-0.5 h-4 bg-gray-900 rounded-full" />
          </div>

          {/* Current Playhead Line */}
          {isPlayingSegment && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_white] z-20 pointer-events-none"
              style={{ left: `${currentPercent}%` }}
            />
          )}
        </div>

        {/* Time markers under timeline */}
        <div className="flex justify-between text-[10px] text-gray-500 font-mono mt-1 px-1">
          <span>0:00</span>
          <span className="text-brand-400 font-bold">Старт: {formatTime(trimStart)}</span>
          <span className="text-brand-400 font-bold">Финиш: {formatTime(trimEnd)}</span>
          <span>{formatTime(totalDuration)}</span>
        </div>
      </div>

      {/* Quick Length Presets */}
      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-gray-800">
        <span className="text-[11px] text-gray-400 mr-1 flex items-center gap-1">
          <SparklesIcon className="w-3.5 h-3.5 text-brand-400" /> Быстрая длина:
        </span>
        {[
          { label: '5 сек', secs: 5 },
          { label: '7 сек (Рекомендуем)', secs: 7 },
          { label: '10 сек', secs: 10 },
          { label: '15 сек', secs: 15 },
        ].map((preset) => (
          <button
            key={preset.secs}
            type="button"
            onClick={() => applyPresetDuration(preset.secs)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
              Math.abs(segmentDuration - preset.secs) < 0.3
                ? 'bg-brand-500 text-gray-950 font-bold shadow'
                : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
            }`}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange(0, totalDuration)}
          className="ml-auto text-[11px] text-gray-400 hover:text-white underline"
        >
          Сбросить (Все видео)
        </button>
      </div>
    </div>
  );
};

export default VideoTrimmer;
