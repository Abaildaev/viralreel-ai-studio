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

export async function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
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

