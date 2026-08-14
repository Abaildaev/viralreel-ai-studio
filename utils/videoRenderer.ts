import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { ViralVariation } from '../types';
import {
  generateUniquifierParams,
  applyUniquifierFilters,
  applyUniquifierNoise,
  processAudioUniquifier,
  stripMediaMetadata,
  UniquifierParams,
} from './uniquifier';
import { ensureRenderFontsLoaded } from './renderFonts';

const CANVAS_WIDTH = 720;
const CANVAS_HEIGHT = 1280;
const TARGET_FPS = 30;
const MAX_DURATION_S = 60;

export const renderVideoWithOverlay = async (
  videoFile: File,
  variation: ViralVariation,
  audioUrl: string | null = null
): Promise<Blob> => {
  // The user-selectable families are no longer in the document head, so they
  // have to be requested before `fonts.ready` can mean anything for them.
  await ensureRenderFontsLoaded();
  await Promise.all([document.fonts.ready, preloadShowcaseImages(variation)]);

  // AudioEncoder is optional: MP4 rendering must still work when the browser
  // can encode H.264 but cannot encode AAC or the source has no soundtrack.
  if (typeof VideoEncoder !== 'undefined') {
    try {
      return await renderMP4(videoFile, variation, audioUrl);
    } catch (e) {
      console.warn('MP4 render failed, using WebM fallback:', e);
    }
  }

  return renderWebM(videoFile, variation, audioUrl);
};

export function assertMp4Video(blob: Blob): void {
  if (!blob.type.toLowerCase().startsWith('video/mp4')) {
    throw new Error(
      'Браузер не смог создать MP4. Откройте приложение в актуальном Chrome или Safari и повторите попытку.'
    );
  }
}

async function loadVideo(file: File): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.src = URL.createObjectURL(file);
  video.crossOrigin = 'anonymous';
  video.playsInline = true;
  video.muted = true;

  await new Promise<void>((res, rej) => {
    video.onloadeddata = () => res();
    video.onerror = () => rej(new Error('Video load error'));
  });

  return video;
}

async function decodeAudio(source: File | string): Promise<AudioBuffer | null> {
  try {
    let arrayBuffer: ArrayBuffer;
    if (typeof source === 'string') {
      arrayBuffer = await fetch(source).then(r => r.arrayBuffer());
    } else {
      arrayBuffer = await source.arrayBuffer();
    }
    const ctx = new AudioContext();
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    await ctx.close();
    return buffer;
  } catch {
    return null;
  }
}

async function applyAudioUniquification(
  audioBuffer: AudioBuffer,
  uniquifier: UniquifierParams
): Promise<AudioBuffer> {
  if (!uniquifier.enabled) return audioBuffer;

  const context = new AudioContext();
  try {
    return processAudioUniquifier(audioBuffer, context, uniquifier);
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function findSupportedVideoCodec(): Promise<string | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  const codecs = [
    'avc1.42001f',
    'avc1.4d001f',
    'avc1.640028',
  ];
  for (const codec of codecs) {
    try {
      const result = await VideoEncoder.isConfigSupported({
        codec,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        bitrate: 6_000_000,
        framerate: TARGET_FPS,
      });
      if (result.supported) return codec;
    } catch { /* continue */ }
  }
  return null;
}

async function isAudioCodecSupported(sampleRate: number, channels: number): Promise<boolean> {
  if (typeof AudioEncoder === 'undefined') return false;
  try {
    const result = await AudioEncoder.isConfigSupported({
      codec: 'mp4a.40.2',
      sampleRate,
      numberOfChannels: channels,
      bitrate: 128_000,
    });
    return result.supported === true;
  } catch {
    return false;
  }
}

function createCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  // @ts-ignore
  if (ctx.letterSpacing !== undefined) {
    // @ts-ignore
    ctx.letterSpacing = '1.5px';
  }
  return { canvas, ctx };
}

async function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(video.currentTime - time) < 0.01) return;
  return new Promise<void>((resolve) => {
    const handler = () => {
      video.removeEventListener('seeked', handler);
      resolve();
    };
    video.addEventListener('seeked', handler);
    video.currentTime = time;
  });
}

async function renderMP4(
  videoFile: File,
  variation: ViralVariation,
  audioUrl: string | null
): Promise<Blob> {
  const videoCodec = await findSupportedVideoCodec();
  if (!videoCodec) throw new Error('No supported H.264 codec');

  const video = await loadVideo(videoFile);
  const { canvas, ctx } = createCanvas();
  const uniquifier = generateUniquifierParams(
    variation.uniquifierIntensity || 'medium',
    variation.uniquifierEnabled !== false
  );
  const decodedAudio = await decodeAudio(audioUrl || videoFile);
  const audioBuffer = decodedAudio
    ? await applyAudioUniquification(decodedAudio, uniquifier)
    : null;
  const audioDuration = audioBuffer ? audioBuffer.duration : 0;
  
  // Calculate trimmed video bounds
  const rawVideoDuration = video.duration || 10;
  const trimStart = Math.max(0, variation.trimStart || 0);
  const trimEnd = variation.trimEnd && variation.trimEnd > trimStart
    ? Math.min(rawVideoDuration, variation.trimEnd)
    : Math.min(rawVideoDuration, MAX_DURATION_S);
  const trimmedVideoDuration = Math.max(0.5, trimEnd - trimStart);

  // Audio start offset
  const audioStartOffset = Math.max(0, variation.audioStartOffset || 0);
  const remainingAudioDuration = Math.max(0, audioDuration - audioStartOffset);

  // Use the SHORTER of trimmed video and remaining audio
  const duration = audioUrl && audioDuration > 0
    ? Math.min(trimmedVideoDuration, remainingAudioDuration, MAX_DURATION_S)
    : Math.min(trimmedVideoDuration, MAX_DURATION_S);
  const totalFrames = Math.ceil(duration * TARGET_FPS);

  const audioChannels = audioBuffer ? Math.min(audioBuffer.numberOfChannels, 2) : 0;
  const audioRate = audioBuffer ? audioBuffer.sampleRate : 0;
  const audioSupported = audioBuffer
    ? await isAudioCodecSupported(audioRate, audioChannels)
    : false;

  const target = new ArrayBufferTarget();
  const muxerConfig: ConstructorParameters<typeof Muxer>[0] = {
    target,
    video: { codec: 'avc', width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    fastStart: 'in-memory',
  };

  if (audioBuffer && audioSupported) {
    muxerConfig.audio = {
      codec: 'aac',
      numberOfChannels: audioChannels,
      sampleRate: audioRate,
    };
  }

  const muxer = new Muxer(muxerConfig);

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error('VideoEncoder error:', e),
  });

  videoEncoder.configure({
    codec: videoCodec,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    bitrate: 6_000_000,
    framerate: TARGET_FPS,
  });

  let audioEncoder: AudioEncoder | null = null;
  if (audioBuffer && audioSupported) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => console.error('AudioEncoder error:', e),
    });
    audioEncoder.configure({
      codec: 'mp4a.40.2',
      numberOfChannels: audioChannels,
      sampleRate: audioRate,
      bitrate: 128_000,
    });
  }

  for (let i = 0; i < totalFrames; i++) {
    const relativeTime = i / TARGET_FPS;
    const seekTime = trimStart + relativeTime;
    await seekTo(video, seekTime);

    drawFrame(ctx, video, variation, CANVAS_WIDTH, CANVAS_HEIGHT, uniquifier);

    const frame = new VideoFrame(canvas, {
      timestamp: Math.round(relativeTime * 1_000_000),
    });
    videoEncoder.encode(frame, { keyFrame: i % 60 === 0 });
    frame.close();

    if (i % 30 === 0) {
      await new Promise(r => setTimeout(r, 0));
    }
  }

  if (audioBuffer && audioEncoder && audioSupported) {
    const channels = audioChannels;
    const sampleRate = audioRate;
    const audioSampleStart = Math.floor(audioStartOffset * sampleRate);
    const maxSamples = Math.min(audioBuffer.length - audioSampleStart, Math.ceil(duration * sampleRate));
    const CHUNK = 1024;

    for (let offset = 0; offset < maxSamples; offset += CHUNK) {
      const count = Math.min(CHUNK, maxSamples - offset);
      const data = new Float32Array(count * channels);

      for (let ch = 0; ch < channels; ch++) {
        const src = audioBuffer.getChannelData(ch);
        data.set(src.subarray(audioSampleStart + offset, audioSampleStart + offset + count), ch * count);
      }

      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate,
        numberOfFrames: count,
        numberOfChannels: channels,
        timestamp: Math.round((offset / sampleRate) * 1_000_000),
        data,
      });

      audioEncoder.encode(audioData);
      audioData.close();
    }
  }

  await videoEncoder.flush();
  if (audioEncoder) await audioEncoder.flush();
  videoEncoder.close();
  if (audioEncoder) audioEncoder.close();
  muxer.finalize();

  URL.revokeObjectURL(video.src);
  video.remove();
  canvas.remove();

  const output = uniquifier.stripMetadata
    ? stripMediaMetadata(target.buffer)
    : target.buffer;

  return new Blob([output], { type: 'video/mp4' });
}

async function renderWebM(
  videoFile: File,
  variation: ViralVariation,
  audioUrl: string | null
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(videoFile);
    video.crossOrigin = 'anonymous';
    video.playsInline = true;

    let audioElement: HTMLAudioElement | null = null;
    if (audioUrl) {
      audioElement = new Audio(audioUrl);
      audioElement.crossOrigin = 'anonymous';
    }

    const { canvas, ctx } = createCanvas();

    const startRendering = async () => {
      try {
        video.currentTime = 0;
        await new Promise(r => { video.onseeked = r; });

        const videoStream = canvas.captureStream(30);
        const audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();

        if (audioUrl && audioElement) {
          const audioSource = audioContext.createMediaElementSource(audioElement);
          audioSource.connect(destination);
          audioSource.connect(audioContext.destination);
        } else {
          const videoSource = audioContext.createMediaElementSource(video);
          videoSource.connect(destination);
          videoSource.connect(audioContext.destination);
        }

        const combinedStream = new MediaStream([
          ...videoStream.getVideoTracks(),
          ...destination.stream.getAudioTracks()
        ]);

        let mimeType = 'video/webm;codecs=vp9,opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm;codecs=vp8,opus';
        }
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm';
        }

        const recorder = new MediaRecorder(combinedStream, {
          mimeType,
          videoBitsPerSecond: 4500000,
          audioBitsPerSecond: 128000
        });

        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };

        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
          resolve(blob);
          URL.revokeObjectURL(video.src);
          video.remove();
          canvas.remove();
          audioContext.close();
          if (audioElement) {
            audioElement.pause();
            audioElement = null;
          }
        };

        const uniquifier = generateUniquifierParams(
          variation.uniquifierIntensity || 'medium',
          variation.uniquifierEnabled !== false
        );

        const renderLoop = () => {
          if (video.paused || video.ended) {
            recorder.stop();
            if (audioElement) audioElement.pause();
            return;
          }
          drawFrame(ctx, video, variation, CANVAS_WIDTH, CANVAS_HEIGHT, uniquifier);
          requestAnimationFrame(renderLoop);
        };

        drawFrame(ctx, video, variation, CANVAS_WIDTH, CANVAS_HEIGHT, uniquifier);
        recorder.start();

        if (audioUrl && audioElement) {
          video.muted = true;
          audioElement.currentTime = 0;
          await audioElement.play();
        } else {
          video.muted = false;
          video.volume = 1;
        }

        // Use the SHORTER of video and audio
        const targetDurationMs = audioUrl && audioElement
          ? Math.min(video.duration, audioElement.duration) * 1000
          : video.duration * 1000;
        const cappedDurationMs = Math.min(targetDurationMs, MAX_DURATION_S * 1000);

        await video.play();
        renderLoop();

        setTimeout(() => {
          if (recorder.state === 'recording') {
            video.pause();
            video.loop = false;
            if (audioElement) audioElement.pause();
          }
        }, cappedDurationMs);

      } catch (e) {
        reject(e);
      }
    };

    video.onloadeddata = () => {
      if (audioUrl && audioElement) {
        audioElement.oncanplaythrough = () => startRendering();
        audioElement.onerror = () => {
          audioElement = null;
          startRendering();
        };
        audioElement.load();
      } else {
        startRendering();
      }
    };

    video.onerror = () => reject(new Error('Video load error'));
  });
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  variation: ViralVariation,
  width: number,
  height: number,
  uniquifier?: UniquifierParams
) {
  ctx.save();
  ctx.filter = 'none';

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(width / 2, height / 2);

  if (uniquifier && uniquifier.enabled) {
    ctx.rotate((uniquifier.rotateDeg * Math.PI) / 180);
    ctx.translate(uniquifier.panX, uniquifier.panY);
    ctx.scale(uniquifier.scale, uniquifier.scale);
  }

  ctx.translate(
    (variation.videoPanX / 100) * width,
    (variation.videoPanY / 100) * height
  );
  ctx.scale(variation.videoScale, variation.videoScale);

  const vRatio = video.videoWidth / video.videoHeight;
  const cRatio = width / height;

  let renderW, renderH;
  if (vRatio > cRatio) {
    renderW = width;
    renderH = width / vRatio;
  } else {
    renderH = height;
    renderW = height * vRatio;
  }

  if (uniquifier && uniquifier.enabled) {
    applyUniquifierFilters(ctx, uniquifier);
  }

  ctx.drawImage(
    video,
    0, 0, video.videoWidth, video.videoHeight,
    -renderW / 2, -renderH / 2,
    renderW, renderH
  );

  ctx.restore();

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(0,0,0,0.4)');
  gradient.addColorStop(0.5, 'transparent');
  gradient.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  if (uniquifier && uniquifier.enabled) {
    applyUniquifierNoise(ctx, uniquifier, width, height);
  }

  drawText(ctx, variation, width, height);

  if (variation.showCarouselBait) {
    drawCarouselBait(ctx, variation, width, height);
  }

  ctx.restore();
}

function getFontName(font: string): { fontName: string; fallback: string } {
  if (font === 'GenShinGothic') {
    return { fontName: 'M PLUS 1p', fallback: 'sans-serif' };
  } else if (font === 'OpenSerif') {
    return { fontName: 'Noto Serif', fallback: 'serif' };
  } else if (font === 'Georgia' || font === 'Merriweather') {
    return { fontName: font, fallback: 'serif' };
  }
  return { fontName: font || 'Roboto', fallback: 'sans-serif' };
}

const logoImageCache: Record<string, HTMLImageElement> = {};

function getLogoImage(path: string): HTMLImageElement {
  let img = logoImageCache[path];
  if (!img) {
    img = new Image();
    img.src = path;
    logoImageCache[path] = img;
  }
  return img;
}

function preloadLogoImage(path: string): Promise<void> {
  const img = getLogoImage(path);
  if (img.complete) return Promise.resolve();

  return new Promise((resolve) => {
    img.addEventListener('load', () => resolve(), { once: true });
    img.addEventListener('error', () => resolve(), { once: true });
  });
}

async function preloadShowcaseImages(v: ViralVariation): Promise<void> {
  const assets: string[] = [];
  if (v.showcaseStyle === 'figma-ai' && v.aiModel && v.aiModel !== 'none') {
    assets.push('/assets/logos/figma.svg', `/assets/logos/${v.aiModel}.svg`);
  } else if (v.bgStyle === 'ai-showcase' && v.aiModel && v.aiModel !== 'none') {
    assets.push(`/assets/logos/${v.aiModel}.svg`);
  }

  await Promise.all(assets.map(preloadLogoImage));
}

function drawAiModelLogo(
  ctx: CanvasRenderingContext2D,
  aiModel: string | undefined,
  centerX: number,
  topY: number,
  fontSize: number
) {
  const model = aiModel || 'claude';
  if (model === 'none') return;

  const img = getLogoImage(`/assets/logos/${model}.svg`);

  const logoSize = Math.max(36, fontSize * 2.2);

  if (img.complete && img.naturalWidth !== 0) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 10;
    ctx.drawImage(img, centerX - logoSize / 2, topY - logoSize - 16, logoSize, logoSize);
    ctx.restore();
  }
}

function drawShowcaseEmoji(
  ctx: CanvasRenderingContext2D,
  emoji: string,
  centerX: number,
  topY: number,
  fontSize: number
) {
  ctx.save();
  ctx.font = `${Math.max(fontSize * 1.35, 34)}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(emoji, centerX, topY - fontSize * 0.35);
  ctx.restore();
}

function drawFigmaAiPair(
  ctx: CanvasRenderingContext2D,
  aiModel: string | undefined,
  centerX: number,
  topY: number,
  fontSize: number
) {
  if (!aiModel || aiModel === 'none') return;

  const figma = getLogoImage('/assets/logos/figma.svg');
  const model = getLogoImage(`/assets/logos/${aiModel}.svg`);
  if (!figma.complete || !figma.naturalWidth || !model.complete || !model.naturalWidth) return;

  const iconSize = Math.max(fontSize * 2.45, 72);
  const gap = iconSize * 0.38;
  const plusWidth = iconSize * 0.36;
  const pairWidth = iconSize * 2 + gap * 2 + plusWidth;
  const startX = centerX - pairWidth / 2;
  const tileY = topY + fontSize * 0.65;
  const radius = iconSize * 0.28;

  const drawTile = (
    x: number,
    background: string,
    image: HTMLImageElement,
    scale: number,
    filter = 'none'
  ) => {
    ctx.save();
    ctx.fillStyle = background;
    ctx.shadowColor = 'rgba(0,0,0,0.38)';
    ctx.shadowBlur = iconSize * 0.28;
    ctx.shadowOffsetY = iconSize * 0.1;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, tileY, iconSize, iconSize, radius);
    } else {
      ctx.rect(x, tileY, iconSize, iconSize);
    }
    ctx.fill();
    const imageW = iconSize * scale;
    const imageH = iconSize * scale;
    ctx.shadowColor = 'transparent';
    ctx.filter = filter;
    ctx.drawImage(image, x + (iconSize - imageW) / 2, tileY + (iconSize - imageH) / 2, imageW, imageH);
    ctx.restore();
  };

  drawTile(startX, 'rgba(10,10,12,0.94)', figma, 0.56);
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.font = `400 ${iconSize * 0.56}px "Inter", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.75)';
  ctx.shadowBlur = iconSize * 0.12;
  ctx.fillText('+', startX + iconSize + gap + plusWidth / 2, tileY + iconSize / 2);
  ctx.restore();
  const modelBackground = aiModel === 'claude'
    ? 'rgba(213,125,89,0.98)'
    : aiModel === 'chatgpt'
      ? 'rgba(15,23,42,0.98)'
      : 'rgba(255,255,255,0.98)';
  drawTile(
    startX + iconSize + gap * 2 + plusWidth,
    modelBackground,
    model,
    0.62,
    aiModel === 'claude' ? 'brightness(0) invert(1)' : 'none'
  );
}

function drawText(
  ctx: CanvasRenderingContext2D,
  v: ViralVariation,
  canvasW: number,
  canvasH: number
) {
  const scaleFactor = canvasW / 300;
  const fontSize = v.fontSize * scaleFactor;
  const padding = 16 * scaleFactor;
  const cornerRadius = 12 * scaleFactor;

  const x = (v.posX / 100) * canvasW;
  const y = (v.posY / 100) * canvasH;

  ctx.save();
  if (v.textRotation) {
    ctx.translate(x, y);
    ctx.rotate((v.textRotation * Math.PI) / 180);
    ctx.translate(-x, -y);
  }

  const isSerif = v.font === 'Georgia' || v.font === 'Merriweather' || v.font === 'OpenSerif';
  const fontStyle = isSerif ? 'italic ' : '';

  const { fontName, fallback } = getFontName(v.font);

  ctx.font = `${fontStyle}${v.fontWeight} ${fontSize}px "${fontName}", ${fallback}`;
  ctx.textAlign = v.textAlign;
  ctx.textBaseline = 'middle';

  const lineHeight = fontSize * 1.25;
  const containerWidth = canvasW * 0.90;
  const maxWidth = containerWidth - (padding * 2);

  const words = v.hookText.split(' ');
  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + ' ' + word).width;
    if (width < maxWidth) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);

  const totalTextHeight = lines.length * lineHeight;

  let maxLineWidth = 0;
  lines.forEach(line => {
    const m = ctx.measureText(line);
    if (m.width > maxLineWidth) maxLineWidth = m.width;
  });

  const bgW = maxLineWidth + (padding * 2);
  const bgH = totalTextHeight + (padding * 2);
  const bgY = y - (bgH / 2);
  let bgX = x - (bgW / 2);

  let drawX = x;
  if (v.textAlign === 'left') {
    drawX = bgX + padding;
  } else if (v.textAlign === 'right') {
    drawX = bgX + bgW - padding;
  } else {
    drawX = bgX + (bgW / 2);
  }

  if (v.bgStyle === 'ai-showcase' && v.aiModel !== 'none' && v.showcaseStyle !== 'figma-ai') {
    const activeModel = v.aiModel || 'claude';
    drawAiModelLogo(ctx, activeModel, drawX, bgY, fontSize);
  }

  if (v.showcaseStyle === 'emoji-white' && v.showcaseEmoji) {
    drawShowcaseEmoji(ctx, v.showcaseEmoji, x, bgY, fontSize);
  }

  if (v.bgStyle === 'quote-white') {
    const linePadH = fontSize * 0.15;
    const linePadW = fontSize * 0.3;
    const quoteLineHeight = fontSize * 1.5;
    const lineBlockH = quoteLineHeight;

    const badgePadX = fontSize * 0.8;
    const badgePadY = fontSize * 0.3;
    const iconW = fontSize * 1.3;
    const iconH = fontSize * 0.85;
    const badgeW = iconW + badgePadX * 2;
    const badgeH = iconH + badgePadY * 2;
    const borderH = Math.max(2, fontSize * 0.15);
    const badgeGap = fontSize * 0.5;

    const totalH = badgeH + borderH + badgeGap + (lines.length * lineBlockH);
    const startY = y - totalH / 2;

    const leftEdge = x - (containerWidth / 2);

    let badgeX = leftEdge;
    if (v.textAlign === 'center') {
      badgeX = x - badgeW / 2;
    } else if (v.textAlign === 'right') {
      badgeX = x + (containerWidth / 2) - badgeW;
    }

    ctx.save();
    const grad = ctx.createLinearGradient(badgeX, startY, badgeX + badgeW, startY);
    grad.addColorStop(0, 'rgba(94, 187, 169, 0.95)');
    grad.addColorStop(1, 'rgba(58, 139, 124, 0.95)');
    ctx.fillStyle = grad;
    const badgeR = fontSize * 0.15;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(badgeX, startY, badgeW, badgeH, badgeR);
      ctx.fill();
    } else {
      ctx.fillRect(badgeX, startY, badgeW, badgeH);
    }
    ctx.fillStyle = 'rgba(42, 107, 95, 0.95)';
    ctx.fillRect(badgeX, startY + badgeH, badgeW, borderH);
    ctx.restore();

    ctx.save();
    const iconScale = iconW / 30;
    const iconCX = badgeX + badgeW / 2;
    const iconCY = startY + badgeH / 2;
    ctx.translate(iconCX, iconCY);
    ctx.scale(iconScale, iconScale);
    ctx.translate(-15, -10);
    ctx.fillStyle = '#ffffff';
    const quotePath = new Path2D('M12 20H0V10L4 0H14L9 10H12V20ZM28 20H16V10L20 0H30L25 10H28V20Z');
    ctx.fill(quotePath);
    ctx.restore();

    const textStartY = startY + badgeH + borderH + badgeGap;

    const fw = v.fontWeight ? Number(v.fontWeight) : 700;
    const fStyle = isSerif ? 'italic ' : '';
    ctx.font = `${fStyle}${fw} ${fontSize}px "${fontName}", ${fallback}`;
    ctx.textBaseline = 'middle';

    lines.forEach((line, index) => {
      const blockY = textStartY + index * lineBlockH;
      const lm = ctx.measureText(line);
      const lineW = lm.width + linePadW * 2;

      let lineX = leftEdge;
      if (v.textAlign === 'center') {
        lineX = x - lineW / 2;
      } else if (v.textAlign === 'right') {
        lineX = x + (containerWidth / 2) - lineW;
      }

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.15)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(lineX, blockY, lineW, lineBlockH - linePadH);
      ctx.restore();

      ctx.save();
      ctx.textAlign = 'left';
      ctx.fillStyle = '#1a1a1a';
      ctx.fillText(line, lineX + linePadW, blockY + (lineBlockH - linePadH) / 2);
      ctx.restore();
    });
  } else {
    if (v.bgStyle === 'bank-transfer') {
      // Fixed-size banner (independent of text fontSize)
      const scaleFactor = canvasW / 300;
      const iconPx = 15 * scaleFactor;
      const circlePx = 27 * scaleFactor;
      const bPadX = 12 * scaleFactor;
      const bPadY = 6 * scaleFactor;
      const bGap = 8 * scaleFactor;
      const titleFontSize = 13.5 * scaleFactor;
      const subFontSize = 8 * scaleFactor;
      const bRadius = 12 * scaleFactor;
      
      const title = v.bankAmount || '1 777 807,23 ₽';
      const sub = 'Счет для бизнеса';
      
      ctx.save();
      ctx.font = `bold ${titleFontSize}px "Inter", sans-serif`;
      const titleW = ctx.measureText(title).width;
      ctx.restore();
      
      const bannerW = bPadX + circlePx + bGap + titleW + bPadX;
      const bannerH = circlePx + bPadY * 2;
      
      const bannerGapY = 8 * scaleFactor;
      const bannerY = bgY - bannerH - bannerGapY;
      
      let bannerX = drawX - bannerW / 2;
      if (v.textAlign === 'left') {
        bannerX = drawX;
      } else if (v.textAlign === 'right') {
        bannerX = drawX - bannerW;
      }
      
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.15)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 4;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(bannerX, bannerY, bannerW, bannerH, bRadius);
        ctx.fill();
      } else {
        ctx.fillRect(bannerX, bannerY, bannerW, bannerH);
      }
      
      const iconX = bannerX + bPadX;
      const iconY = bannerY + bPadY;
      
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(iconX + circlePx/2, iconY + circlePx/2, circlePx/2, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.translate(iconX + circlePx/2, iconY + circlePx/2);
      ctx.scale(iconPx/24, iconPx/24);
      ctx.translate(-12, -12);
      ctx.fillStyle = '#ffffff';
      const walletPath = new Path2D("M19 7h-1V6a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V10a3 3 0 0 0-3-3Zm-4-2h-3v2h3V5Zm2 12H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h1v12a3 3 0 0 0 3 3h8v-2a1 1 0 0 1-1-1Z");
      ctx.fill(walletPath);
      ctx.restore();
      
      ctx.save();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#1e293b';
      ctx.font = `bold ${titleFontSize}px "Inter", sans-serif`;
      ctx.fillText(title, iconX + circlePx + bGap, bannerY + bPadY + 1 * scaleFactor);
      
      ctx.fillStyle = '#64748b';
      ctx.font = `500 ${subFontSize}px "Inter", sans-serif`;
      ctx.fillText(sub, iconX + circlePx + bGap, bannerY + bPadY + titleFontSize + 2 * scaleFactor);
      ctx.restore();
    } else if (v.bgStyle !== 'none') {
      ctx.save();
      if (v.bgStyle === 'glass') {
        ctx.fillStyle = `rgba(255,255,255, ${v.bgOpacity * 0.007})`;
        ctx.shadowColor = 'rgba(0,0,0,0.1)';
        ctx.shadowBlur = 10;
      } else if (v.bgStyle === 'solid-black' || v.bgStyle === 'ai-showcase') {
        ctx.fillStyle = `rgba(15, 23, 42, ${v.bgOpacity / 100})`;
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 12;
      } else if (v.bgStyle === 'solid-white' || v.bgStyle === 'white-badge') {
        ctx.fillStyle = `rgba(255,255,255, ${v.bgOpacity / 100})`;
        ctx.shadowColor = 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = 16;
        ctx.shadowOffsetY = 4;
      }

      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(bgX, bgY, bgW, bgH, cornerRadius);
      } else {
        ctx.rect(bgX, bgY, bgW, bgH);
      }
      ctx.fill();
      ctx.restore();
    }

    lines.forEach((line, index) => {
      const lineY = bgY + padding + (index * lineHeight) + (lineHeight / 2);
      const isLightBg = v.bgStyle === 'solid-white' || v.bgStyle === 'glass' || v.bgStyle === 'white-badge';
      const isBankTransfer = v.bgStyle === 'bank-transfer';

      if (isBankTransfer) {
        // Bank style: white text with black outline stroke
        const fw = v.fontWeight ? Number(v.fontWeight) : 500;
        ctx.save();
        ctx.font = `${fw} ${fontSize}px "${fontName}", ${fallback}`;
        ctx.lineWidth = Math.max(2, fontSize * 0.1);
        ctx.strokeStyle = '#000000';
        ctx.fillStyle = '#ffffff';
        ctx.lineJoin = 'round';
        ctx.strokeText(line, drawX, lineY);
        ctx.fillText(line, drawX, lineY);
        ctx.restore();
      } else if (v.textShadow) {
        ctx.save();
        if (isLightBg) {
          ctx.shadowColor = 'rgba(0,0,0,0.3)';
          ctx.shadowBlur = 8;
          ctx.shadowOffsetY = 2;
        } else {
          ctx.shadowColor = 'rgba(0,0,0,0.9)';
          ctx.shadowBlur = 20;
        }
        ctx.fillStyle = isLightBg ? '#0f172a' : '#ffffff';
        ctx.fillText(line, drawX, lineY);
        ctx.restore();
      } else {
        ctx.fillStyle = isLightBg ? '#0f172a' : '#ffffff';
        ctx.fillText(line, drawX, lineY);
      }
    });
  }

  if (v.showcaseStyle === 'figma-ai') {
    drawFigmaAiPair(ctx, v.aiModel, x, bgY + bgH, fontSize);
  }

  ctx.restore();
}

function drawCarouselBait(
  ctx: CanvasRenderingContext2D,
  v: ViralVariation,
  canvasW: number,
  canvasH: number
) {
  const scaleFactor = canvasW / 300;
  const fontSize = 17 * scaleFactor;
  const baitY = (v.carouselBaitPosY / 100) * canvasH;

  const dotRadius = 4;
  const dotGap = 10;
  const dotsCount = 4;
  const totalDotsWidth = (dotsCount * dotRadius * 2) + ((dotsCount - 1) * dotGap);
  const dotsStartX = (canvasW - totalDotsWidth) / 2 + dotRadius;
  const dotsY = baitY - 30;

  for (let i = 0; i < dotsCount; i++) {
    const dotX = dotsStartX + (i * (dotRadius * 2 + dotGap));
    ctx.beginPath();
    ctx.arc(dotX, dotsY, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.5)';
    ctx.fill();
  }

  const isSerif = v.font === 'Georgia' || v.font === 'Merriweather' || v.font === 'OpenSerif';
  const fontStyle = isSerif ? 'italic ' : '';
  const { fontName, fallback } = getFontName(v.font);

  ctx.font = `${fontStyle}${v.fontWeight} ${fontSize}px "${fontName}", ${fallback}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';

  if (v.textShadow) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 20;
    ctx.fillText('Читай описание \u2193', canvasW / 2, baitY + 20);
    ctx.restore();
  } else {
    ctx.fillText('Читай описание \u2193', canvasW / 2, baitY + 20);
  }
}
