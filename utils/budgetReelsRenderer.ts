import * as Mp4Muxer from 'mp4-muxer';
import { toCanvas } from 'html-to-image';
import {
  applyUniquifierFilters,
  applyUniquifierNoise,
  generateUniquifierParams,
  processAudioUniquifier,
  stripMediaMetadata,
  type UniquifierIntensity,
  type UniquifierParams,
} from './uniquifier';
import { ensureRenderFontsLoaded } from './renderFonts';

// === Типы ===

export interface BudgetRenderOptions {
  containerElement: HTMLElement;
  sequence: (string | number)[];
  setInputValue: (v: string | number) => void;
  setBudgetTitle: (title: string) => void;
  title: string;
  audioUrl: string | null;
  uniquifierEnabled?: boolean;
  uniquifierIntensity?: UniquifierIntensity;
  onProgress?: (current: number, total: number) => void;
}

// === Декодирование аудио ===

async function decodeAudio(url: string): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const ctx = new AudioContext();
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    await ctx.close();
    return buffer;
  } catch (e) {
    console.warn('Ошибка декодирования аудио:', e);
    return null;
  }
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

function applyBudgetVisualUniquification(
  source: HTMLCanvasElement,
  uniquifier: UniquifierParams
): HTMLCanvasElement {
  if (!uniquifier.enabled) return source;

  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return source;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((uniquifier.rotateDeg * Math.PI) / 180);
  ctx.translate(uniquifier.panX, uniquifier.panY);
  ctx.scale(uniquifier.scale, uniquifier.scale);
  applyUniquifierFilters(ctx, uniquifier);
  ctx.drawImage(source, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
  ctx.restore();
  applyUniquifierNoise(ctx, uniquifier, canvas.width, canvas.height);

  return canvas;
}

// === Главная функция рендера ===

export async function renderBudgetReelsVideo(options: BudgetRenderOptions): Promise<Blob> {
  const {
    containerElement,
    sequence,
    setInputValue,
    setBudgetTitle,
    title,
    audioUrl,
    uniquifierEnabled = true,
    uniquifierIntensity = 'medium',
    onProgress,
  } = options;
  const uniquifier = generateUniquifierParams(uniquifierIntensity, uniquifierEnabled);

  // The user-selectable families load on demand, so the DOM snapshot below
  // would otherwise be rasterised with a fallback face.
  await ensureRenderFontsLoaded();

  // Устанавливаем заголовок
  setBudgetTitle(title);
  await new Promise(r => setTimeout(r, 100));

  // === Декодируем аудио (если есть) ===
  let audioBuffer: AudioBuffer | null = null;
  let audioSupported = false;
  let audioChannels = 0;
  let audioRate = 0;

  if (audioUrl) {
    const decodedAudio = await decodeAudio(audioUrl);
    audioBuffer = decodedAudio
      ? await applyAudioUniquification(decodedAudio, uniquifier)
      : null;
    if (audioBuffer) {
      audioChannels = Math.min(audioBuffer.numberOfChannels, 2);
      audioRate = audioBuffer.sampleRate;
      audioSupported = await isAudioCodecSupported(audioRate, audioChannels);
    }
  }

  // === Настройка Muxer ===
  const muxerConfig: ConstructorParameters<typeof Mp4Muxer.Muxer>[0] = {
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: 'avc', width: 1080, height: 1920 },
    fastStart: 'in-memory',
  };

  if (audioBuffer && audioSupported) {
    muxerConfig.audio = {
      codec: 'aac',
      numberOfChannels: audioChannels,
      sampleRate: audioRate,
    };
  }

  const muxer = new Mp4Muxer.Muxer(muxerConfig);

  // === VideoEncoder ===
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => console.error('VideoEncoder error:', e),
  });
  videoEncoder.configure({
    codec: 'avc1.640032',
    width: 1080,
    height: 1920,
    bitrate: 10_000_000,
    framerate: 60,
  });

  // === AudioEncoder ===
  let audioEncoder: AudioEncoder | null = null;
  if (audioBuffer && audioSupported) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: e => console.error('AudioEncoder error:', e),
    });
    audioEncoder.configure({
      codec: 'mp4a.40.2',
      numberOfChannels: audioChannels,
      sampleRate: audioRate,
      bitrate: 128_000,
    });
  }

  // === Тайминги ===
  const fps = 60;
  const framesPerStep = 12; // 200мс × 60fps
  const holdFrames = 120;   // 2 сек × 60fps
  let frameCount = 0;

  // === Основной цикл: максимально быстро ===
  for (let i = 0; i < sequence.length; i++) {
    setInputValue(sequence[i]);
    await new Promise(r => setTimeout(r, 50));

    const canvas = await toCanvas(containerElement, {
      pixelRatio: 3,
      backgroundColor: '#ffffff',
      skipFonts: true,
    });
    const uniqueCanvas = applyBudgetVisualUniquification(canvas, uniquifier);

    for (let f = 0; f < framesPerStep; f++) {
      const frame = new VideoFrame(uniqueCanvas, { timestamp: (frameCount * 1_000_000) / fps });
      videoEncoder.encode(frame, { keyFrame: frameCount % 60 === 0 });
      frame.close();
      frameCount++;
    }

    if (onProgress) {
      onProgress(i + 1, sequence.length);
    }
  }

  // === Hold — 2 сек финальный кадр ===
  const lastCanvas = await toCanvas(containerElement, {
    pixelRatio: 3,
    backgroundColor: '#ffffff',
    skipFonts: true,
  });
  const uniqueLastCanvas = applyBudgetVisualUniquification(lastCanvas, uniquifier);
  for (let f = 0; f < holdFrames; f++) {
    const frame = new VideoFrame(uniqueLastCanvas, { timestamp: (frameCount * 1_000_000) / fps });
    videoEncoder.encode(frame, { keyFrame: frameCount % 60 === 0 });
    frame.close();
    frameCount++;
  }

  // === Кодируем аудио (если есть) ===
  if (audioBuffer && audioEncoder && audioSupported) {
    const totalVideoDurationSec = frameCount / fps;
    const maxSamples = Math.min(
      audioBuffer.length,
      Math.ceil(totalVideoDurationSec * audioRate)
    );
    const CHUNK = 1024;

    for (let offset = 0; offset < maxSamples; offset += CHUNK) {
      const count = Math.min(CHUNK, maxSamples - offset);
      const data = new Float32Array(count * audioChannels);

      for (let ch = 0; ch < audioChannels; ch++) {
        const src = audioBuffer.getChannelData(ch);
        data.set(src.subarray(offset, offset + count), ch * count);
      }

      const audioData = new AudioData({
        format: 'f32-planar',
        sampleRate: audioRate,
        numberOfFrames: count,
        numberOfChannels: audioChannels,
        timestamp: Math.round((offset / audioRate) * 1_000_000),
        data,
      });

      audioEncoder.encode(audioData);
      audioData.close();
    }
  }

  // === Финализация ===
  await videoEncoder.flush();
  if (audioEncoder) await audioEncoder.flush();
  videoEncoder.close();
  if (audioEncoder) audioEncoder.close();
  muxer.finalize();

  const buffer = (muxer.target as Mp4Muxer.ArrayBufferTarget).buffer;
  const output = uniquifier.stripMetadata ? stripMediaMetadata(buffer) : buffer;
  return new Blob([output], { type: 'video/mp4' });
}
