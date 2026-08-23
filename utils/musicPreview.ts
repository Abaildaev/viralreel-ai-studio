/*
  What the music slider will actually sound like.

  Built from the same mixer, the same looping and the same gain rule the render
  uses — the preview is a short render of the audio, not an imitation of one.
  A preview assembled separately would agree with the output on the day it was
  written and quietly stop agreeing the first time either side changed, which
  is worse than having no preview at all: the author would trust it.
*/

import { AudioLayer, decodeAudio, loopedLayers, mixAudioLayers } from './render/media';
import { resolveMusicGain } from './outroRenderer';

/* Long enough to hear a voice sit under music, short enough that trying
   another number costs nothing. */
export const MUSIC_PREVIEW_SECONDS = 12;

export interface MusicPreviewRequest {
  /** The Reel whose own audio — the voiceover — the music has to sit under. */
  referenceUrl?: string;
  musicUrl: string;
  /** Undefined means the level is decided by listening to the reference. */
  volume?: number;
}

export interface MusicPreview {
  buffer: AudioBuffer;
  /** The level the music ended up at, for showing next to the slider. */
  gain: number;
  /** False when the reference had no audio, so nothing was there to duck under. */
  hasReferenceAudio: boolean;
}

/**
 * Mixes a few seconds of the reference and the track exactly as the render
 * would, so the author can hear the balance before spending a render on it.
 */
export async function buildMusicPreview(
  request: MusicPreviewRequest,
): Promise<MusicPreview | null> {
  const [reference, music] = await Promise.all([
    request.referenceUrl ? decodeAudio(request.referenceUrl) : Promise.resolve(null),
    decodeAudio(request.musicUrl),
  ]);

  if (!music) return null;

  const seconds = MUSIC_PREVIEW_SECONDS;
  const gain = resolveMusicGain(request.volume, reference, seconds);

  const layers: AudioLayer[] = [];
  if (reference) {
    /* At its own level, never touched by the slider — the same as in the
       render, where the reference layer carries no gain at all. */
    layers.push({
      buffer: reference,
      startTime: 0,
      duration: Math.min(reference.duration, seconds),
    });
  }

  layers.push(...loopedLayers(music, {
    totalDuration: seconds,
    gain,
    startFade: 0.2,
    endFade: 0.6,
  }));

  const buffer = await mixAudioLayers(layers, seconds);
  if (!buffer) return null;

  return { buffer, gain, hasReferenceAudio: Boolean(reference) };
}

export interface PreviewPlayback {
  stop: () => void;
  /** Resolves when the clip finishes on its own or is stopped. */
  finished: Promise<void>;
}

/** Plays a mixed preview and hands back the way to stop it early. */
export function playPreview(buffer: AudioBuffer): PreviewPlayback {
  const context = new AudioContext();
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);

  let settle: () => void = () => undefined;
  const finished = new Promise<void>((resolve) => {
    settle = resolve;
  });

  const close = () => {
    settle();
    void context.close().catch(() => undefined);
  };

  source.onended = close;
  source.start();

  return {
    stop: () => {
      try {
        source.stop();
      } catch {
        // Already finished; `onended` has closed the context.
      }
      close();
    },
    finished,
  };
}
