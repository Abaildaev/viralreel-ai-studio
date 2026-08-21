/*
  Decoding, codec negotiation and canvas setup.

  The plumbing between a file the user picked and something a renderer can draw
  from: loading the video element, decoding audio, asking the browser which
  codecs it will actually accept, and seeking frame by frame.

  Separated from drawing and from muxing because it is the part that answers to
  the browser rather than to the design — what works here is decided by the
  platform, not by us.
*/

import {
  processAudioUniquifier,
  UniquifierParams,
} from '../uniquifier';

/* Output geometry and frame rate. Defined beside the code that negotiates
   codecs against them, so a change here cannot drift from what the encoder
   is told. */
export const CANVAS_WIDTH = 720;
export const CANVAS_HEIGHT = 1280;
export const TARGET_FPS = 30;
export const MAX_DURATION_S = 60;

export function assertMp4Video(blob: Blob): void {
  if (!blob.type.toLowerCase().startsWith('video/mp4')) {
    throw new Error(
      'Браузер не смог создать MP4. Откройте приложение в актуальном Chrome или Safari и повторите попытку.'
    );
  }
}

export async function loadVideo(file: File): Promise<HTMLVideoElement> {
  const video = document.createElement('video');
  video.src = URL.createObjectURL(file);
  video.crossOrigin = 'anonymous';
  video.playsInline = true;
  video.muted = true;
  video.preload = 'auto';

  await new Promise<void>((res, rej) => {
    video.onloadeddata = () => res();
    video.onerror = () => rej(new Error('Video load error'));
  });

  return video;
}

export async function decodeAudio(source: File | string): Promise<AudioBuffer | null> {
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

export async function applyAudioUniquification(
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

export async function findSupportedVideoCodec(width: number, height: number): Promise<string | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  const cacheKey = `${width}x${height}`;
  const cached = supportedVideoCodecCache.get(cacheKey);
  if (cached) return cached;

  const pending = findSupportedVideoCodecUncached(width, height);
  supportedVideoCodecCache.set(cacheKey, pending);
  return pending;
}

const supportedVideoCodecCache = new Map<string, Promise<string | null>>();

async function findSupportedVideoCodecUncached(width: number, height: number): Promise<string | null> {
  const codecs = [
    'avc1.42001f',
    'avc1.4d001f',
    'avc1.640028',
  ];
  for (const codec of codecs) {
    try {
      const result = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate: 6_000_000,
        framerate: TARGET_FPS,
      });
      if (result.supported) return codec;
    } catch { /* continue */ }
  }
  return null;
}

export async function isAudioCodecSupported(sampleRate: number, channels: number): Promise<boolean> {
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

export function createCanvas(
  width: number = CANVAS_WIDTH,
  height: number = CANVAS_HEIGHT,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  // @ts-ignore
  if (ctx.letterSpacing !== undefined) {
    // @ts-ignore
    ctx.letterSpacing = '1.5px';
  }
  return { canvas, ctx };
}

/*
  How long one frame may take to arrive before the seek is written off.

  The timeout is what keeps a single stubborn frame from stalling a render, but
  a source that never seeks would otherwise burn it on every frame — 1.5s each,
  three quarters of an hour for a minute of video, and every frame a duplicate
  of the last one that did land. So the result is reported rather than
  swallowed, and callers count the misses.
*/
const SEEK_TIMEOUT_MS = 1500;
const MAX_MISSED_SEEKS = 8;

/** Resolves true when the frame actually arrived, false on the timeout. */
export async function seekTo(video: HTMLVideoElement, time: number): Promise<boolean> {
  const maxTime = Number.isFinite(video.duration)
    ? Math.max(0, video.duration - 0.001)
    : Math.max(0, time);
  const safeTime = Math.min(Math.max(0, time), maxTime);
  if (Math.abs(video.currentTime - safeTime) < 0.01) return true;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (seeked: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      video.removeEventListener('seeked', handler);
      resolve(seeked);
    };
    const timeoutId = window.setTimeout(() => finish(false), SEEK_TIMEOUT_MS);
    const handler = () => {
      finish(true);
    };
    video.addEventListener('seeked', handler);
    try {
      video.currentTime = safeTime;
    } catch {
      finish(false);
    }
  });
}

/*
  Fails a render whose source has stopped answering, instead of letting it
  grind out an hour of duplicated frames. A slow decoder recovers between
  misses; a broken file never does.
*/
export function createSeekWatch(): (seeked: boolean) => void {
  let missed = 0;
  return (seeked: boolean) => {
    missed = seeked ? 0 : missed + 1;
    if (missed < MAX_MISSED_SEEKS) return;
    throw new Error(
      'Исходное видео не перематывается — браузер не отдаёт кадры. '
      + 'Пересохраните файл как MP4 (H.264) и повторите.',
    );
  };
}

/*
  A file whose length the browser cannot state is one the renderers cannot
  time. Guessing produced a ten-second clip out of an hour-long upload, or a
  card appended to a minute of nothing.
*/
export function sourceDurationOf(video: HTMLVideoElement): number {
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(
      'Не удалось прочитать длительность исходного видео. '
      + 'Пересохраните файл как MP4 (H.264) и повторите.',
    );
  }
  return duration;
}


/* One audio layer on the output timeline. Times are in seconds and refer to
   the finished video, not to the buffer the samples came from. */
export interface AudioLayer {
  buffer: AudioBuffer;
  /** When the layer starts on the output timeline. */
  startTime?: number;
  /** How far into the source buffer playback begins. */
  offset?: number;
  /** How much of the source buffer to play. Defaults to the rest of it. */
  duration?: number;
  gain?: number;
  fadeIn?: number;
  fadeOut?: number;
}

/*
  Flattens several sources onto one timeline of a known length.

  A soundtrack that has to survive a cut — the source audio running out where
  the outro begins — is easier to describe as overlapping layers with fades
  than as sample arithmetic, and OfflineAudioContext already resamples buffers
  that disagree about their rate. The result is a single buffer of exactly the
  requested duration, which is also what the encoder wants.
*/
export async function mixAudioLayers(
  layers: AudioLayer[],
  totalDuration: number,
): Promise<AudioBuffer | null> {
  const usable = layers.filter((l) => l.buffer && l.buffer.length > 0);
  if (usable.length === 0 || totalDuration <= 0) return null;

  const sampleRate = Math.max(...usable.map((l) => l.buffer.sampleRate));
  const channels = Math.min(2, Math.max(...usable.map((l) => l.buffer.numberOfChannels)));
  const frames = Math.ceil(totalDuration * sampleRate);

  const ctx = new OfflineAudioContext(channels, frames, sampleRate);

  for (const layer of usable) {
    const start = Math.max(0, layer.startTime || 0);
    if (start >= totalDuration) continue;

    const offset = Math.max(0, layer.offset || 0);
    const available = Math.max(0, layer.buffer.duration - offset);
    const duration = Math.min(
      layer.duration ?? available,
      available,
      totalDuration - start,
    );
    if (duration <= 0) continue;

    const source = ctx.createBufferSource();
    source.buffer = layer.buffer;

    const gainNode = ctx.createGain();
    const gain = layer.gain ?? 1;
    const fadeIn = Math.min(layer.fadeIn || 0, duration / 2);
    const fadeOut = Math.min(layer.fadeOut || 0, duration / 2);

    gainNode.gain.setValueAtTime(fadeIn > 0 ? 0.0001 : gain, start);
    if (fadeIn > 0) gainNode.gain.linearRampToValueAtTime(gain, start + fadeIn);
    if (fadeOut > 0) {
      gainNode.gain.setValueAtTime(gain, start + duration - fadeOut);
      gainNode.gain.linearRampToValueAtTime(0.0001, start + duration);
    }

    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(start, offset, duration);
  }

  return ctx.startRendering();
}
