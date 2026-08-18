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
  seekTo,
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

async function renderMP4(
  videoFile: File,
  variation: ViralVariation,
  audioUrl: string | null
): Promise<Blob> {
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
  const rawVideoDuration = video.duration || 10;
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

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => console.error('VideoEncoder error:', e),
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
    const seekTime = effectiveTrimStart + relativeTime;
    await seekTo(video, seekTime);

    drawFrame(ctx, video, variation, outputWidth, outputHeight, uniquifier);

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

    const startRendering = async () => {
      try {
        const uniquifier = generateUniquifierParams(
          variation.uniquifierIntensity || 'medium',
          variation.uniquifierEnabled !== false
        );
        const rawVideoDuration = video.duration || 10;
        const trimStart = Math.max(0, variation.trimStart || 0);
        const trimEnd = variation.trimEnd && variation.trimEnd > trimStart
          ? Math.min(rawVideoDuration, variation.trimEnd)
          : Math.min(rawVideoDuration, MAX_DURATION_S);
        const uniqueTimeOffset = Math.min(
          uniquifier.timeOffsetSeconds,
          Math.max(0, trimEnd - trimStart - 0.5)
        );
        const effectiveTrimStart = trimStart + uniqueTimeOffset;
        const preserveSourceDimensions = variation.variantKind === 'clean';
        const outputWidth = preserveSourceDimensions ? video.videoWidth : CANVAS_WIDTH;
        const outputHeight = preserveSourceDimensions ? video.videoHeight : CANVAS_HEIGHT;
        const { canvas, ctx } = createCanvas(outputWidth, outputHeight);

        await seekTo(video, effectiveTrimStart);

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

        const renderLoop = () => {
          if (video.paused || video.ended) {
            recorder.stop();
            if (audioElement) audioElement.pause();
            return;
          }
          drawFrame(ctx, video, variation, outputWidth, outputHeight, uniquifier);
          requestAnimationFrame(renderLoop);
        };

        drawFrame(ctx, video, variation, outputWidth, outputHeight, uniquifier);
        recorder.start();

        if (audioUrl && audioElement) {
          video.muted = true;
          audioElement.currentTime = Math.max(0, variation.audioStartOffset || 0);
          await audioElement.play();
        } else {
          video.muted = false;
          video.volume = 1;
        }

        // Use the SHORTER of video and audio
        const trimmedVideoDuration = Math.max(0.5, trimEnd - effectiveTrimStart);
        const remainingAudioDuration = audioUrl && audioElement
          ? Math.max(0, audioElement.duration - (variation.audioStartOffset || 0))
          : trimmedVideoDuration;
        const targetDurationMs = Math.min(trimmedVideoDuration, remainingAudioDuration) * 1000;
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

