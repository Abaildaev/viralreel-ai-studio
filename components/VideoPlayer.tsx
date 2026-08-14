import React, { useRef, useEffect, useState } from 'react';
import { FontFamily, TextAlign, BgStyle, FontWeight, AiShowcaseStyle } from '../types';

interface VideoPlayerProps {
  src: string;
  audioSrc?: string;
  audioVolume?: number;
  hookText?: string;
  isPlaying?: boolean;
  font?: FontFamily;
  fontSize?: number;
  fontWeight?: FontWeight;
  textAlign?: TextAlign;
  textShadow?: boolean;
  bgStyle?: BgStyle;
  bgOpacity?: number;
  posX?: number;
  posY?: number;
  videoScale?: number;
  videoPanX?: number;
  videoPanY?: number;
  showCarouselBait?: boolean;
  carouselBaitPosY?: number;
  bankAmount?: string;
  aiModel?: 'claude' | 'chatgpt' | 'gemini' | 'none';
  showcaseStyle?: AiShowcaseStyle;
  showcaseEmoji?: string;
  textRotation?: number;
  showSafeZones?: boolean;
  onPositionChange?: (x: number, y: number) => void;
  onCarouselBaitPositionChange?: (y: number) => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  audioSrc,
  audioVolume = 0.8,
  hookText,
  isPlaying = true,
  font = 'Inter',
  fontSize = 24,
  fontWeight = '700',
  textAlign = 'center',
  textShadow = true,
  bgStyle = 'none',
  bgOpacity = 80,
  posX = 50,
  posY = 25,
  videoScale = 1,
  videoPanX = 0,
  videoPanY = 0,
  showCarouselBait = false,
  carouselBaitPosY = 90,
  bankAmount = '1 777 807,23 ₽',
  aiModel = 'claude',
  showcaseStyle,
  showcaseEmoji,
  textRotation = 0,
  showSafeZones: initialSafeZones = false,
  onPositionChange,
  onCarouselBaitPositionChange
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(isPlaying);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isDraggingText, setIsDraggingText] = useState(false);
  const [isDraggingBait, setIsDraggingBait] = useState(false);
  const [safeZonesActive, setSafeZonesActive] = useState(initialSafeZones);

  useEffect(() => {
    setPlaying(isPlaying);
  }, [isPlaying]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isAudioMuted ? 0 : audioVolume;
    }
  }, [audioVolume, isAudioMuted]);

  useEffect(() => {
    if (videoRef.current) {
      if (playing) {
        videoRef.current.play().catch(() => setPlaying(false));
        if (audioRef.current && audioSrc) {
          audioRef.current.play().catch(() => {});
        }
      } else {
        videoRef.current.pause();
        if (audioRef.current) {
          audioRef.current.pause();
        }
      }
    }
  }, [playing, audioSrc]);

  const togglePlayPause = () => {
    if (!isDraggingText && !isDraggingBait) {
      setPlaying(!playing);
    }
  };

  const handleTextMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDraggingText(true);
  };

  const handleTextTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    setIsDraggingText(true);
  };

  const handleBaitMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDraggingBait(true);
  };

  const handleBaitTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    setIsDraggingBait(true);
  };

  useEffect(() => {
    const handleTextMove = (clientX: number, clientY: number) => {
      if (isDraggingText && containerRef.current && onPositionChange) {
        const rect = containerRef.current.getBoundingClientRect();
        let newX = ((clientX - rect.left) / rect.width) * 100;
        let newY = ((clientY - rect.top) / rect.height) * 100;
        newX = Math.max(0, Math.min(100, newX));
        newY = Math.max(0, Math.min(100, newY));
        if (Math.abs(newX - 50) < 2) newX = 50;
        if (Math.abs(newY - 50) < 2) newY = 50;
        onPositionChange(newX, newY);
      }
    };

    const handleBaitMove = (clientY: number) => {
      if (isDraggingBait && containerRef.current && onCarouselBaitPositionChange) {
        const rect = containerRef.current.getBoundingClientRect();
        let newY = ((clientY - rect.top) / rect.height) * 100;
        newY = Math.max(50, Math.min(98, newY));
        onCarouselBaitPositionChange(newY);
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (isDraggingText) handleTextMove(e.clientX, e.clientY);
      if (isDraggingBait) handleBaitMove(e.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) {
        if (isDraggingText) handleTextMove(e.touches[0].clientX, e.touches[0].clientY);
        if (isDraggingBait) handleBaitMove(e.touches[0].clientY);
      }
    };

    const onUp = () => {
      setIsDraggingText(false);
      setIsDraggingBait(false);
    };

    if (isDraggingText || isDraggingBait) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onUp);
      window.addEventListener('touchmove', onTouchMove);
      window.addEventListener('touchend', onUp);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [isDraggingText, isDraggingBait, onPositionChange, onCarouselBaitPositionChange]);

  const getFontFamily = (f: string) => {
    switch (f) {
      case 'GenShinGothic': return "'M PLUS 1p', 'GenShinGothic', sans-serif";
      case 'OpenSerif': return "'Noto Serif', 'OpenSerif', serif";
      case 'Georgia': return "'Georgia', serif";
      case 'Merriweather': return "'Merriweather', serif";
      default: return "'Inter', sans-serif";
    }
  };

  const isSerifFont = (f: string) => f === 'Georgia' || f === 'Merriweather' || f === 'OpenSerif';

  const splitIntoLines = (text: string, maxChars: number): string[] => {
    const words = text.split(' ');
    const result: string[] = [];
    let current = '';
    for (const word of words) {
      if (current && (current + ' ' + word).length > maxChars) {
        result.push(current);
        current = word;
      } else {
        current = current ? current + ' ' + word : word;
      }
    }
    if (current) result.push(current);
    return result;
  };

  const getContainerStyles = () => {
    let base = bgStyle === 'none' ? `p-1 rounded-xl transition-all duration-200` : `p-3 rounded-xl transition-all duration-200`;
    const drag = isDraggingText ? 'ring-2 ring-teal-500/50' : 'hover:ring-1 hover:ring-white/20';
    const op = bgOpacity / 100;
    const styles: React.CSSProperties = {};

    if (bgStyle === 'glass') {
      base += ' backdrop-blur-md shadow-lg';
      styles.backgroundColor = `rgba(255, 255, 255, ${op * 0.7})`;
      styles.border = '1px solid rgba(255, 255, 255, 0.3)';
    } else if (bgStyle === 'solid-black') {
      styles.backgroundColor = `rgba(0, 0, 0, ${op})`;
    } else if (bgStyle === 'solid-white') {
      styles.backgroundColor = `rgba(255, 255, 255, ${op})`;
    } else if (bgStyle === 'quote-white') {
      styles.backgroundColor = `rgba(255, 255, 255, ${op})`;
      styles.padding = '8px 12px 12px';
    } else if (bgStyle === 'white-badge') {
      styles.backgroundColor = `rgba(255, 255, 255, ${op})`;
      styles.borderRadius = '18px';
      styles.boxShadow = '0 10px 30px -5px rgba(0, 0, 0, 0.4)';
    } else if (bgStyle === 'ai-showcase') {
      styles.backgroundColor = `rgba(15, 23, 42, ${op})`;
      styles.borderRadius = '18px';
      styles.boxShadow = '0 10px 30px -5px rgba(0, 0, 0, 0.4)';
      styles.border = '1px solid rgba(255, 255, 255, 0.1)';
    } else {
      base += isDraggingText ? ' bg-white/10' : ' hover:bg-white/5';
    }

    if (bgStyle !== 'none') {
      styles.width = 'fit-content';
      styles.maxWidth = '100%';
      styles.marginLeft = textAlign === 'left' ? 0 : 'auto';
      styles.marginRight = textAlign === 'right' ? 0 : 'auto';
    }

    return { className: `${base} ${drag}`, style: styles };
  };

  const getTextStyles = () => {
    const base: React.CSSProperties = {
      fontFamily: getFontFamily(font),
      fontSize: `${fontSize}px`,
      textAlign: textAlign,
      fontWeight: Number(fontWeight),
      fontStyle: isSerifFont(font) ? 'italic' : 'normal',
      lineHeight: 1.25,
      color: '#ffffff',
    };

    const isLightBg = bgStyle === 'solid-white' || bgStyle === 'glass' || bgStyle === 'quote-white' || bgStyle === 'white-badge';

    if (isLightBg) {
      base.color = '#0f172a';
    }

    if (bgStyle === 'quote-white') {
      base.textDecoration = 'underline';
    }

    if (textShadow) {
      if (isLightBg) {
        base.textShadow = '0 2px 8px rgba(0,0,0,0.3)';
      } else {
        base.textShadow = '0px 0px 8px rgba(0,0,0,0.8), 0px 2px 4px rgba(0,0,0,0.9)';
      }
    }

    return base;
  };

  const containerProps = getContainerStyles();
  const isDragging = isDraggingText || isDraggingBait;
  const isCenteredX = Math.abs((posX || 0) - 50) < 0.5;
  const isCenteredY = Math.abs((posY || 0) - 50) < 0.5;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black overflow-hidden rounded-lg shadow-xl aspect-[9/16] cursor-pointer group select-none"
      onClick={togglePlayPause}
    >
      <video
        ref={videoRef}
        src={src}
        className="absolute inset-0 w-full h-full object-contain pointer-events-none transition-transform duration-100 ease-out"
        style={{
          transform: `scale(${videoScale}) translate(${videoPanX}%, ${videoPanY}%)`
        }}
        loop
        muted
        playsInline
      />

      {audioSrc && (
        <audio
          ref={audioRef}
          src={audioSrc}
          loop
        />
      )}

      {audioSrc && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsAudioMuted(!isAudioMuted);
          }}
          className="absolute bottom-3 right-3 z-40 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white p-2 rounded-full border border-white/20 transition-all"
          title={isAudioMuted ? "Включить звук" : "Выключить звук"}
        >
          {isAudioMuted ? (
            <span className="text-xs">🔇</span>
          ) : (
            <span className="text-xs animate-pulse">🔊</span>
          )}
        </button>
      )}

      {/* Safe Zones Toggle Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setSafeZonesActive(!safeZonesActive);
        }}
        className={`absolute top-3 left-3 z-40 px-2.5 py-1 rounded-full text-[11px] font-semibold backdrop-blur-md border transition-all flex items-center gap-1.5 shadow-lg ${
          safeZonesActive
            ? 'bg-cyan-500 text-slate-950 border-cyan-300 ring-2 ring-cyan-400/40 font-bold'
            : 'bg-black/60 hover:bg-black/80 text-white/90 border-white/20'
        }`}
        title="Показать / скрыть безопасные зоны Instagram Reels"
      >
        <span>📐</span>
        <span>{safeZonesActive ? 'Сетка Reels: ВКЛ' : 'Сетка Reels'}</span>
      </button>

      {/* Realistic Instagram Reels Safe Zones Overlay */}
      {safeZonesActive && (
        <div className="absolute inset-0 pointer-events-none z-30 flex flex-col justify-between p-3 select-none">
          {/* Top Header UI */}
          <div className="flex items-center justify-between text-white drop-shadow-md pt-1 px-1">
            <span className="font-bold text-sm tracking-tight">Reels</span>
            <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs">
              📷
            </div>
          </div>

          {/* Safe Area Box */}
          <div className="absolute inset-x-4 top-[14%] bottom-[27%] border-2 border-dashed border-cyan-400/80 rounded-2xl bg-cyan-500/5 flex flex-col items-center justify-between py-2 px-3 shadow-[0_0_20px_rgba(34,211,238,0.15)]">
            <div className="bg-cyan-950/90 backdrop-blur-sm text-cyan-300 border border-cyan-500/40 text-[9px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow">
              ✓ 100% Безопасная зона текста
            </div>
            <div className="text-[9px] text-cyan-200/80 font-medium text-center bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded-md">
              Здесь текст не перекрывается кнопками Instagram
            </div>
          </div>

          {/* Right Sidebar Action Icons */}
          <div className="absolute right-2 bottom-16 flex flex-col items-center gap-3 text-white">
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-sm shadow">
                ❤️
              </div>
              <span className="text-[9px] font-semibold text-white/90">24.5K</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-sm shadow">
                💬
              </div>
              <span className="text-[9px] font-semibold text-white/90">382</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <div className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-sm shadow">
                ✈️
              </div>
              <span className="text-[9px] font-semibold text-white/90">1.2K</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-xs shadow">
              ⋯
            </div>
            <div className="w-7 h-7 rounded-full border-2 border-white/60 bg-gradient-to-tr from-pink-500 to-amber-500 flex items-center justify-center text-[10px] mt-1 shadow">
              🎵
            </div>
          </div>

          {/* Bottom Profile & Caption Simulation */}
          <div className="w-4/5 text-white drop-shadow pb-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-400 to-fuchsia-600 p-0.5 flex-shrink-0">
                <div className="w-full h-full rounded-full bg-black flex items-center justify-center text-[10px] font-bold">
                  IG
                </div>
              </div>
              <span className="text-xs font-bold truncate">@username</span>
              <span className="px-2 py-0.5 bg-white/20 backdrop-blur-sm text-[10px] font-semibold rounded-lg border border-white/30">
                Подписаться
              </span>
            </div>
            <div className="text-[10px] text-white/90 line-clamp-2 leading-tight">
              Описание ролика и призыв к действию... <span className="text-white/60 font-semibold">ещё</span>
            </div>
            <div className="flex items-center gap-1 text-[9px] text-white/80">
              <span>🎵</span>
              <span className="truncate">Оригинальный звук — автор</span>
            </div>
          </div>
        </div>
      )}

      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none" />

      {isDragging && (
        <>
          <div
            className={`absolute top-0 bottom-0 w-px transition-colors duration-200 z-40 ${isCenteredX ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'bg-indigo-500/50'}`}
            style={{ left: '50%' }}
          />
          <div
            className={`absolute left-0 right-0 h-px transition-colors duration-200 z-40 ${isCenteredY ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'bg-indigo-500/50'}`}
            style={{ top: '50%' }}
          />
        </>
      )}

      {!playing && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/20 backdrop-blur-[1px] pointer-events-none">
          <div className="bg-white/20 p-3 rounded-full backdrop-blur-md border border-white/30">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-white">
              <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      )}

      {hookText && (
        <div
          className={`absolute z-30 cursor-grab active:cursor-grabbing transition-shadow duration-150 ${
            isDraggingText ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-black/50 shadow-2xl scale-[1.01]' : 'hover:outline hover:outline-2 hover:outline-cyan-400/60'
          }`}
          style={{
            left: `${posX}%`,
            top: `${posY}%`,
            transform: `translate(-50%, -50%) rotate(${textRotation}deg)`,
            width: '90%',
            maxWidth: '90%'
          }}
          onMouseDown={handleTextMouseDown}
          onTouchStart={handleTextTouchStart}
          title="Зажмите и перетащите для смены позиции"
        >
          {isDraggingText && (
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-cyan-500 text-slate-950 font-bold text-[10px] px-2 py-0.5 rounded-full shadow-lg pointer-events-none flex items-center gap-1 animate-pulse">
              <span>🖐️ {Math.round(posX)}%, {Math.round(posY)}%</span>
            </div>
          )}
          {showcaseStyle === 'emoji-white' && showcaseEmoji && (
            <div
              aria-hidden="true"
              style={{
                color: '#ffffff',
                fontSize: `${Math.max(24, fontSize * 1.6)}px`,
                lineHeight: 1,
                textAlign: 'center',
                marginBottom: '6px',
                filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.65))',
                pointerEvents: 'none',
              }}
            >
              {showcaseEmoji}
            </div>
          )}
          {bgStyle === 'ai-showcase' && aiModel !== 'none' && showcaseStyle !== 'figma-ai' && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2px', pointerEvents: 'none' }}>
              <img
                src={`/assets/logos/${aiModel || 'claude'}.svg`}
                alt="AI Logo"
                style={{ width: '38px', height: '38px', objectFit: 'contain', filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.4))' }}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
          )}

          {bgStyle === 'bank-transfer' ? (
            <div style={{ textAlign: textAlign }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '6px 12px',
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  marginBottom: '8px',
                  gap: '8px',
                  transform: 'translateX(0)',
                }}
              >
                <div
                  style={{
                    width: '27px',
                    height: '27px',
                    backgroundColor: '#3b82f6',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="white" style={{ width: '15px', height: '15px' }}>
                    <path d="M19 7h-1V6a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V10a3 3 0 0 0-3-3Zm-4-2h-3v2h3V5Zm2 12H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h1v12a3 3 0 0 0 3 3h8v-2a1 1 0 0 1-1-1Z"/>
                  </svg>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flexShrink: 0 }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b', lineHeight: 1.1 }}>{bankAmount}</span>
                  <span style={{ fontSize: '8px', fontWeight: 500, color: '#64748b', marginTop: '2px' }}>Счет для бизнеса</span>
                </div>
              </div>
              <div>
                <span
                  style={{
                    fontFamily: getFontFamily(font),
                    fontSize: `${fontSize}px`,
                    fontWeight: Number(fontWeight),
                    fontStyle: 'normal',
                    color: '#ffffff',
                    display: 'inline',
                    lineHeight: 1.35,
                    WebkitTextStroke: '1.5px #000000',
                    paintOrder: 'stroke fill',
                    textShadow: 'none',
                  } as React.CSSProperties}
                >
                  {hookText}
                </span>
              </div>
            </div>
          ) : bgStyle === 'quote-white' ? (
            <div style={{ textAlign: textAlign }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: `${fontSize * 0.3}px ${fontSize * 0.8}px`,
                  background: 'linear-gradient(to right, rgba(94, 187, 169, 0.95), rgba(58, 139, 124, 0.95))',
                  borderBottom: `${Math.max(2, fontSize * 0.15)}px solid rgba(42, 107, 95, 0.95)`,
                  borderRadius: `${fontSize * 0.15}px`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  marginBottom: `${fontSize * 0.5}px`,
                }}
              >
                <svg
                  viewBox="0 0 30 20"
                  fill="white"
                  style={{ width: `${fontSize * 1.3}px`, height: `${fontSize * 0.85}px` }}
                >
                  <path d="M12 20H0V10L4 0H14L9 10H12V20ZM28 20H16V10L20 0H30L25 10H28V20Z" />
                </svg>
              </div>
              <div>
                <span
                  style={{
                    fontFamily: getFontFamily(font),
                    fontSize: `${fontSize}px`,
                    fontWeight: Number(fontWeight),
                    fontStyle: isSerifFont(font) ? 'italic' : 'normal',
                    color: '#1a1a1a',
                    backgroundColor: '#ffffff',
                    display: 'inline',
                    lineHeight: 1.5,
                    padding: '0.15em 0.3em',
                    boxDecorationBreak: 'clone' as any,
                    WebkitBoxDecorationBreak: 'clone' as any,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                  }}
                >
                  {hookText}
                </span>
              </div>
            </div>
          ) : (
            <div
              className={containerProps.className}
              style={containerProps.style}
            >
              <h2
                className="leading-tight tracking-wide"
                style={getTextStyles()}
              >
                {hookText}
              </h2>
            </div>
          )}
          {showcaseStyle === 'figma-ai' && aiModel !== 'none' && (
            <div
              aria-label={'Figma + ' + aiModel}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                marginTop: '12px',
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '14px',
                  background: 'rgba(10,10,12,0.92)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 6px 18px rgba(0,0,0,0.36)',
                }}
              >
                <img src="/assets/logos/figma.svg" alt="Figma" style={{ width: '22px', height: '33px' }} />
              </div>
              <span style={{ color: '#ffffff', fontSize: '28px', fontWeight: 400, textShadow: '0 3px 6px rgba(0,0,0,0.7)' }}>+</span>
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '14px',
                  background: aiModel === 'claude'
                    ? 'rgba(213,125,89,0.96)'
                    : aiModel === 'chatgpt'
                      ? 'rgba(15,23,42,0.96)'
                      : 'rgba(255,255,255,0.96)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 6px 18px rgba(0,0,0,0.36)',
                }}
              >
                <img
                  src={'/assets/logos/' + aiModel + '.svg'}
                  alt={aiModel}
                  style={{
                    width: '27px',
                    height: '27px',
                    objectFit: 'contain',
                    filter: aiModel === 'claude' ? 'brightness(0) invert(1)' : 'none',
                  }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {showCarouselBait && (
        <div
          className={`absolute left-0 right-0 z-20 cursor-move ${isDraggingBait ? 'ring-2 ring-teal-500/50' : ''}`}
          style={{ top: `${carouselBaitPosY}%`, transform: 'translateY(-50%)' }}
          onMouseDown={handleBaitMouseDown}
          onTouchStart={handleBaitTouchStart}
        >
          <div className="flex justify-center gap-1.5 mb-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-white' : 'bg-white/50'}`}
              />
            ))}
          </div>
          <div className="text-center">
            <span
              className="text-white"
              style={{
                fontFamily: getFontFamily(font),
                fontSize: '17px',
                fontWeight: Number(fontWeight),
                fontStyle: isSerifFont(font) ? 'italic' : 'normal',
                textShadow: textShadow ? '0px 0px 8px rgba(0,0,0,0.8), 0px 2px 4px rgba(0,0,0,0.9)' : 'none'
              }}
            >
              Читай описание
            </span>
            <span
              className="text-white ml-1"
              style={{
                fontSize: '17px',
                textShadow: textShadow ? '0px 0px 8px rgba(0,0,0,0.8)' : 'none'
              }}
            >
              ↓
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default VideoPlayer;
