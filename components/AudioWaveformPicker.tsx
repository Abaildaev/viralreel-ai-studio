import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ArrowPathIcon,
  MusicalNoteIcon,
  PlayIcon,
  PauseIcon,
  SparklesIcon,
  SpeakerWaveIcon,
} from '@heroicons/react/24/outline';

interface AudioWaveformPickerProps {
  audioUrl: string;
  audioName?: string;
  duration?: number;
  startOffset: number;
  onChangeOffset: (offset: number) => void;
  className?: string;
}

function formatAudioTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const AudioWaveformPicker: React.FC<AudioWaveformPickerProps> = ({
  audioUrl,
  audioName = 'Аудиотрек',
  duration: propDuration = 0,
  startOffset,
  onChangeOffset,
  className = '',
}) => {
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [totalDuration, setTotalDuration] = useState(propDuration);
  const [isLoadingBuffer, setIsLoadingBuffer] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(startOffset);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch and decode audio to get raw PCM data for waveform
  useEffect(() => {
    let isCancelled = false;
    if (!audioUrl) return;

    const loadAudioWaveform = async () => {
      setIsLoadingBuffer(true);
      try {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);
        if (!isCancelled) {
          setAudioBuffer(decoded);
          setTotalDuration(decoded.duration);
        }
        await audioCtx.close().catch(() => {});
      } catch (err) {
        console.warn('Failed to decode waveform, fallback to simulated peaks:', err);
      } finally {
        if (!isCancelled) setIsLoadingBuffer(false);
      }
    };

    loadAudioWaveform();
    return () => {
      isCancelled = true;
    };
  }, [audioUrl]);

  // Compute 100 peak bars for waveform rendering
  const waveformPeaks = useMemo(() => {
    const BAR_COUNT = 100;
    if (!audioBuffer) {
      // Fallback pseudo-random aesthetic peaks
      return Array.from({ length: BAR_COUNT }, (_, i) => {
        const sin = Math.sin(i * 0.15);
        const cos = Math.cos(i * 0.3);
        return Math.max(0.15, Math.min(0.95, 0.4 + sin * 0.3 + cos * 0.2));
      });
    }

    const channelData = audioBuffer.getChannelData(0);
    const blockSize = Math.floor(channelData.length / BAR_COUNT);
    const peaks: number[] = [];

    for (let i = 0; i < BAR_COUNT; i++) {
      let sum = 0;
      for (let j = 0; j < blockSize; j++) {
        sum += Math.abs(channelData[i * blockSize + j]);
      }
      const avg = sum / blockSize;
      peaks.push(Math.min(1, avg * 3.5)); // Normalized with boost
    }

    // Normalize peaks so highest is ~0.95
    const maxVal = Math.max(...peaks, 0.1);
    return peaks.map(p => Math.max(0.08, p / maxVal));
  }, [audioBuffer]);

  // Draw waveform on HTML5 Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const barCount = waveformPeaks.length;
    const barSpacing = width / barCount;
    const barWidth = Math.max(2, barSpacing - 1.5);
    const middleY = height / 2;

    const activeX = totalDuration > 0 ? (startOffset / totalDuration) * width : 0;
    const playX = totalDuration > 0 ? (playbackTime / totalDuration) * width : 0;

    waveformPeaks.forEach((peak, i) => {
      const x = i * barSpacing;
      const barH = peak * (height - 12);
      const topY = middleY - barH / 2;

      // Color based on whether it's before or after start point
      if (x < activeX) {
        ctx.fillStyle = '#475569'; // Muted dark slate before start
      } else {
        const grad = ctx.createLinearGradient(0, topY, 0, topY + barH);
        grad.addColorStop(0, '#2dd4bf'); // Teal 400
        grad.addColorStop(1, '#0d9488'); // Teal 600
        ctx.fillStyle = grad;
      }

      ctx.beginPath();
      // Rounded pill bar
      const r = barWidth / 2;
      ctx.roundRect(x, topY, barWidth, barH, r);
      ctx.fill();
    });

    // Draw Start Point Marker Line
    ctx.strokeStyle = '#38bdf8'; // Sky 400 glow
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(activeX, 0);
    ctx.lineTo(activeX, height);
    ctx.stroke();

    // Draw Playhead line if playing
    if (isPlaying) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, height);
      ctx.stroke();
    }
  }, [waveformPeaks, startOffset, playbackTime, isPlaying, totalDuration]);

  // Audio Playback Listener
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setPlaybackTime(audio.currentTime);
      if (audio.ended) {
        setIsPlaying(false);
        setPlaybackTime(startOffset);
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    return () => audio.removeEventListener('timeupdate', handleTimeUpdate);
  }, [startOffset]);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.currentTime = startOffset;
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  // Bound to the wrapper div, not the canvas, and it measures the wrapper —
  // the element type in the signature was simply wrong.
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || totalDuration <= 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newOffset = Math.max(0, Math.min(totalDuration - 5, (clickX / rect.width) * totalDuration));
    const rounded = Number(newOffset.toFixed(1));
    onChangeOffset(rounded);
    setPlaybackTime(rounded);
    if (audioRef.current && isPlaying) {
      audioRef.current.currentTime = rounded;
    }
  };

  return (
    <div className={`bg-gray-900 border border-gray-800 rounded-2xl p-4 text-white shadow-xl ${className}`}>
      {/* Hidden audio element for preview */}
      <audio ref={audioRef} src={audioUrl} preload="auto" />

      {/* Header Info */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center flex-shrink-0">
            <MusicalNoteIcon className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-gray-100 truncate max-w-[200px] sm:max-w-xs">
              {audioName}
            </h4>
            <div className="flex items-center gap-2 text-[11px] text-gray-400">
              <span>Длительность: {formatAudioTime(totalDuration)}</span>
              <span>•</span>
              <span className="text-brand-300 font-bold flex items-center gap-1">
                <SpeakerWaveIcon className="w-3.5 h-3.5" /> Старт: {formatAudioTime(startOffset)}
              </span>
            </div>
          </div>
        </div>

        {/* Play Preview Button */}
        <button
          type="button"
          onClick={togglePlayback}
          className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95"
        >
          {isPlaying ? (
            <>
              <PauseIcon className="w-4 h-4" /> Стоп
            </>
          ) : (
            <>
              <PlayIcon className="w-4 h-4" /> Слышать со старта
            </>
          )}
        </button>
      </div>

      {/* Waveform Canvas Area */}
      <div
        ref={containerRef}
        onClick={handleCanvasClick}
        className="relative h-20 bg-gray-950/80 rounded-xl p-2 cursor-pointer border border-gray-800 hover:border-brand-500/50 transition-colors group select-none"
        title="Кликните на звуковую дорожку для выбора момента старта"
      >
        <canvas ref={canvasRef} className="w-full h-full block" />

        {/*
          Decoding a track takes a noticeable moment, and until it finishes the
          canvas draws simulated peaks — which look like a real waveform. The
          loading flag was already being set correctly; nothing was showing it,
          so the placeholder passed for the real thing.
        */}
        {isLoadingBuffer && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-gray-950/60">
            <span className="flex items-center gap-2 text-[10px] font-semibold text-gray-300">
              <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
              Читаю дорожку…
            </span>
          </div>
        )}

        {/* Start Point Badge on hover / marker */}
        <div
          className="absolute -top-3.5 -translate-x-1/2 bg-sky-500 text-gray-950 font-extrabold text-[9px] px-2 py-0.5 rounded-full shadow-lg pointer-events-none transition-all"
          style={{
            left: `${totalDuration > 0 ? (startOffset / totalDuration) * 100 : 0}%`,
          }}
        >
          ▶ Старт: {formatAudioTime(startOffset)}
        </div>
      </div>

      {/* Quick Jump Hot-spots */}
      <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-2.5 border-t border-gray-800/80">
        <span className="text-[11px] text-gray-400 mr-1 flex items-center gap-1">
          <SparklesIcon className="w-3.5 h-3.5 text-brand-400" /> Момент:
        </span>
        {[
          { label: '0:00 (Начало)', secs: 0 },
          { label: '0:10 (Вступление)', secs: 10 },
          { label: '0:15 (Куплет)', secs: 15 },
          { label: '0:30 (Дроп / Припев)', secs: 30 },
          { label: '0:45 (Кульминация)', secs: 45 },
        ].filter(preset => preset.secs < totalDuration).map((preset) => (
          <button
            key={preset.secs}
            type="button"
            onClick={() => {
              onChangeOffset(preset.secs);
              setPlaybackTime(preset.secs);
              if (audioRef.current && isPlaying) {
                audioRef.current.currentTime = preset.secs;
              }
            }}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
              Math.abs(startOffset - preset.secs) < 1
                ? 'bg-sky-500 text-gray-950 font-bold shadow'
                : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default AudioWaveformPicker;
