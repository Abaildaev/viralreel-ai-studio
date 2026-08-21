import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { ViralVariation } from '../types';
import { generateUniquifierParams, stripMediaMetadata } from './uniquifier';
import { ensureRenderFontsLoaded } from './renderFonts';
import {
  loadVideo,
  decodeAudio,
  applyAudioUniquification,
  findSupportedVideoCodec,
  isAudioCodecSupported,
  createCanvas,
  createSeekWatch,
  seekTo,
  sourceDurationOf,
} from './render/media';
import { drawFrame, preloadShowcaseImages } from './render/canvasDraw';

import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  TARGET_FPS,
  MAX_DURATION_S,
} from './render/media';

/* Re-exported so the split stays invisible to callers: hooks and services have
   always imported this from here. */
export { assertMp4Video } from './render/media';

function abortRenderError(): Error {
  const error = new Error('Генерация остановлена');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortRenderError();
}

/* Called with 0-100 and a line to show under it. A batch renders two passes
   back to back, and without this the second one looked like a hang. */
export type RenderProgress = (percent: number, statusText: string) => void;

export const renderVideoWithOverlay = async (
  videoFile: File,
  variation: ViralVariation,
  audioUrl: string | null = null,
  abortSignal?: AbortSignal,
  onProgress?: RenderProgress,
): Promise<Blob> => {
  throwIfAborted(abortSignal);
  /*
    There is no fallback path any more. The one that used to be here recorded
    the clip through MediaRecorder — in real time, a minute of waiting for a
    minute of video — and handed back a WebM that every caller then rejected
    through `assertMp4Video`. Saying so immediately is the whole of what it
    achieved, at none of the cost.
  */
  if (typeof VideoEncoder === 'undefined') {
    throw new Error(
      'Браузер не умеет кодировать MP4. Откройте приложение в актуальном Chrome или Safari.',
    );
  }

  // The user-selectable families are no longer in the document head, so they
  // have to be requested before `fonts.ready` can mean anything for them.
  await ensureRenderFontsLoaded();
  await Promise.all([document.fonts.ready, preloadShowcaseImages(variation)]);

  // AudioEncoder stays optional: an MP4 render must still work when the
  // browser can encode H.264 but not AAC, or the source has no soundtrack.
  return renderMP4(videoFile, variation, audioUrl, abortSignal, onProgress);
};

async function renderMP4(
  videoFile: File,
  variation: ViralVariation,
  audioUrl: string | null,
  abortSignal?: AbortSignal,
  onProgress?: RenderProgress,
): Promise<Blob> {
  throwIfAborted(abortSignal);
  const video = await loadVideo(videoFile);
  const preserveSourceDimensions = variation.variantKind === 'clean';
  const outputWidth = preserveSourceDimensions ? video.videoWidth : CANVAS_WIDTH;
  const outputHeight = preserveSourceDimensions ? video.videoHeight : CANVAS_HEIGHT;
  const videoCodec = await findSupportedVideoCodec(outputWidth, outputHeight);
  if (!videoCodec) throw new Error('No supported H.264 codec');

  const { canvas, ctx } = createCanvas(outputWidth, outputHeight);
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
  const rawVideoDuration = sourceDurationOf(video);
  const trimStart = Math.max(0, variation.trimStart || 0);
  const trimEnd = variation.trimEnd && variation.trimEnd > trimStart
    ? Math.min(rawVideoDuration, variation.trimEnd)
    : Math.min(rawVideoDuration, MAX_DURATION_S);
  const uniqueTimeOffset = Math.min(
    uniquifier.timeOffsetSeconds,
    Math.max(0, trimEnd - trimStart - 0.5)
  );
  const effectiveTrimStart = trimStart + uniqueTimeOffset;
  const trimmedVideoDuration = Math.max(0.5, trimEnd - effectiveTrimStart);

  // Audio start offset
  const audioStartOffset = Math.max(
    0,
    audioUrl ? variation.audioStartOffset || 0 : effectiveTrimStart
  );
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
    video: { codec: 'avc', width: outputWidth, height: outputHeight },
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

  /* An encoder reports failures on its own callback rather than on the call
     that queued the frame. Logging them left the render "successful" around a
     truncated file, which the batch then uploaded as a finished draft. */
  let encodeError: Error | null = null;
  const captureError = (label: string) => (e: unknown) => {
    console.error(`${label} error:`, e);
    encodeError = encodeError || (e instanceof Error ? e : new Error(String(e)));
  };

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: captureError('VideoEncoder'),
  });

  videoEncoder.configure({
    codec: videoCodec,
    width: outputWidth,
    height: outputHeight,
    bitrate: 6_000_000,
    framerate: TARGET_FPS,
  });

  let audioEncoder: AudioEncoder | null = null;
  if (audioBuffer && audioSupported) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: captureError('AudioEncoder'),
    });
    audioEncoder.configure({
      codec: 'mp4a.40.2',
      numberOfChannels: audioChannels,
      sampleRate: audioRate,
      bitrate: 128_000,
    });
  }

  const watchSeek = createSeekWatch();

  try {
    for (let i = 0; i < totalFrames; i++) {
      throwIfAborted(abortSignal);
      if (encodeError) throw encodeError;
      const relativeTime = i / TARGET_FPS;
      const seekTime = effectiveTrimStart + relativeTime;
      watchSeek(await seekTo(video, seekTime));

      drawFrame(ctx, video, variation, outputWidth, outputHeight, uniquifier);

      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(relativeTime * 1_000_000),
      });
      videoEncoder.encode(frame, { keyFrame: i % 60 === 0 });
      frame.close();

      if (i % 30 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }

      if (i % 20 === 0) {
        onProgress?.(
          Math.round((i / Math.max(1, totalFrames)) * 90),
          `Рендер видео (${Math.round(relativeTime)}с / ${Math.round(duration)}с)...`,
        );
      }
    }

    if (audioBuffer && audioEncoder && audioSupported) {
      onProgress?.(92, 'Обработка звуковой дорожки...');
      const channels = audioChannels;
      const sampleRate = audioRate;
      const audioSampleStart = Math.floor(audioStartOffset * sampleRate);
      const maxSamples = Math.min(audioBuffer.length - audioSampleStart, Math.ceil(duration * sampleRate));
      const CHUNK = 1024;

      for (let offset = 0; offset < maxSamples; offset += CHUNK) {
        throwIfAborted(abortSignal);
        if (encodeError) throw encodeError;
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

    throwIfAborted(abortSignal);
    onProgress?.(96, 'Финализация MP4 файла...');
    await videoEncoder.flush();
    if (audioEncoder) await audioEncoder.flush();
    throwIfAborted(abortSignal);
    if (encodeError) throw encodeError;
    muxer.finalize();
  } finally {
    if (videoEncoder.state !== 'closed') videoEncoder.close();
    if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
    URL.revokeObjectURL(video.src);
    video.remove();
    canvas.remove();
  }

  const output = uniquifier.stripMetadata
    ? stripMediaMetadata(target.buffer)
    : target.buffer;

  onProgress?.(100, 'Готово!');
  return new Blob([output], { type: 'video/mp4' });
}
