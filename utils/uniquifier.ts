export type UniquifierIntensity = 'low' | 'medium' | 'high';

export interface UniquifierParams {
  enabled: boolean;
  intensity: UniquifierIntensity;
  scale: number;
  rotateDeg: number;
  panX: number;
  panY: number;
  brightness: number;
  contrast: number;
  saturate: number;
  hueRotate: number;
  noiseOpacity: number;
  timeOffsetSeconds: number;
  /* Seconds shaved off (or added to) the CTA card. Two renders of the same
     source then differ in length as well as in pixels, which is the cheapest
     signal a duplicate check has. */
  outroDurationJitterSec: number;
  /* Where in a library track this render starts, as a share of the room the
     track has to spare. Two Reels cut from the same track then carry
     different audio rather than the same opening bars. */
  musicStartFraction: number;
  // Audio Uniquifier Parameters
  audioPitchShift: number; // Pitch multiplier shift e.g. 0.9985 to 1.0015 (+/- 0.15%)
  subNoiseLevel: number;   // Amplitude of sub-audible high-freq noise (0.0001 - 0.001)
  stripMetadata: boolean;  // Strip ID3 / MP4 metadata boxes
}

/* `outroJitterMax` tops out at half the width of the card's own window
   (OUTRO_CARD_WINDOW_S): the strongest setting should spread the card across
   every length it is allowed to have, and not one frame past them. */
const intensityMultipliers = {
  low: { scaleMax: 0.015, rotateMax: 0.3, panMax: 2, filterMax: 1.5, noiseMax: 0.015, pitchShiftMax: 0.001, noiseAudioMax: 0.0004, timeOffsetMax: 0.08, outroJitterMax: 0.12 },
  medium: { scaleMax: 0.03, rotateMax: 0.6, panMax: 4, filterMax: 3.0, noiseMax: 0.025, pitchShiftMax: 0.0015, noiseAudioMax: 0.0008, timeOffsetMax: 0.16, outroJitterMax: 0.25 },
  high: { scaleMax: 0.05, rotateMax: 1.2, panMax: 8, filterMax: 5.0, noiseMax: 0.04, pitchShiftMax: 0.0025, noiseAudioMax: 0.0015, timeOffsetMax: 0.28, outroJitterMax: 0.35 },
};

export function generateUniquifierParams(
  intensity: UniquifierIntensity = 'medium',
  enabled: boolean = true
): UniquifierParams {
  if (!enabled) {
    return {
      enabled: false,
      intensity,
      scale: 1,
      rotateDeg: 0,
      panX: 0,
      panY: 0,
      brightness: 100,
      contrast: 100,
      saturate: 100,
      hueRotate: 0,
      noiseOpacity: 0,
      timeOffsetSeconds: 0,
      outroDurationJitterSec: 0,
      musicStartFraction: 0,
      audioPitchShift: 1.0,
      subNoiseLevel: 0,
      stripMetadata: false,
    };
  }

  const mult = intensityMultipliers[intensity] || intensityMultipliers.medium;

  const randRange = (min: number, max: number) => min + Math.random() * (max - min);
  const randSign = () => (Math.random() > 0.5 ? 1 : -1);

  return {
    enabled: true,
    intensity,
    // Scale slightly up (e.g. 1.015 to 1.045)
    scale: 1 + randRange(0.01, mult.scaleMax),
    rotateDeg: randRange(0.1, mult.rotateMax) * randSign(),
    panX: randRange(0.5, mult.panMax) * randSign(),
    panY: randRange(0.5, mult.panMax) * randSign(),
    brightness: 100 + randRange(0.5, mult.filterMax) * randSign(),
    contrast: 100 + randRange(0.5, mult.filterMax) * randSign(),
    saturate: 100 + randRange(0.5, mult.filterMax) * randSign(),
    hueRotate: randRange(0.2, mult.filterMax * 0.5) * randSign(),
    noiseOpacity: randRange(0.01, mult.noiseMax),
    // A tiny fresh seek offset changes the frame sequence without becoming visible.
    timeOffsetSeconds: randRange(0.02, mult.timeOffsetMax),
    outroDurationJitterSec: randRange(0.04, mult.outroJitterMax) * randSign(),
    musicStartFraction: Math.random(),
    // Audio pitch shift +/- 0.15% to 0.25%
    audioPitchShift: 1.0 + randRange(0.0005, mult.pitchShiftMax) * randSign(),
    subNoiseLevel: randRange(0.0002, mult.noiseAudioMax),
    stripMetadata: true,
  };
}

let cachedNoiseCanvas: HTMLCanvasElement | null = null;

function getNoiseCanvas(width: number = 720, height: number = 1280): HTMLCanvasElement {
  if (cachedNoiseCanvas && cachedNoiseCanvas.width === width && cachedNoiseCanvas.height === height) {
    return cachedNoiseCanvas;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() * 255) | 0;
      data[i] = noise;
      data[i + 1] = noise;
      data[i + 2] = noise;
      data[i + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
  }

  cachedNoiseCanvas = canvas;
  return canvas;
}

export function applyUniquifierFilters(ctx: CanvasRenderingContext2D, params: UniquifierParams): void {
  if (!params.enabled) return;

  const filters: string[] = [];
  if (params.brightness !== 100) filters.push(`brightness(${params.brightness.toFixed(1)}%)`);
  if (params.contrast !== 100) filters.push(`contrast(${params.contrast.toFixed(1)}%)`);
  if (params.saturate !== 100) filters.push(`saturate(${params.saturate.toFixed(1)}%)`);
  if (params.hueRotate !== 0) filters.push(`hue-rotate(${params.hueRotate.toFixed(1)}deg)`);

  if (filters.length > 0) {
    ctx.filter = filters.join(' ');
  }
}

export function applyUniquifierNoise(
  ctx: CanvasRenderingContext2D,
  params: UniquifierParams,
  width: number,
  height: number
): void {
  if (!params.enabled || params.noiseOpacity <= 0) return;

  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = params.noiseOpacity;

  const noiseCanvas = getNoiseCanvas(width, height);
  // Introduce small random offset per frame for dynamic grain
  const offsetX = Math.floor(Math.random() * 50);
  const offsetY = Math.floor(Math.random() * 50);

  ctx.drawImage(noiseCanvas, -offsetX, -offsetY, width + 50, height + 50);
  ctx.restore();
}

/**
 * Applies audio uniquification (pitch shift & sub-audible high-freq noise injection)
 * to an AudioBuffer via Web Audio API.
 */
export function processAudioUniquifier(
  audioBuffer: AudioBuffer,
  audioContext: AudioContext,
  params: UniquifierParams
): AudioBuffer {
  if (!params.enabled) return audioBuffer;

  const numberOfChannels = audioBuffer.numberOfChannels;
  const originalSampleRate = audioBuffer.sampleRate;
  const originalLength = audioBuffer.length;

  // Calculate new length based on pitch shift multiplier
  const pitchMultiplier = params.audioPitchShift || 1.0;
  const newLength = Math.round(originalLength / pitchMultiplier);

  const outputBuffer = audioContext.createBuffer(numberOfChannels, newLength, originalSampleRate);
  const subNoiseAmp = params.subNoiseLevel || 0.0005;

  for (let channel = 0; channel < numberOfChannels; channel++) {
    const inputData = audioBuffer.getChannelData(channel);
    const outputData = outputBuffer.getChannelData(channel);

    for (let i = 0; i < newLength; i++) {
      // Linear interpolation for smooth micro pitch shift
      const origPos = i * pitchMultiplier;
      const index = Math.floor(origPos);
      const frac = origPos - index;

      let sample = 0;
      if (index < originalLength - 1) {
        sample = inputData[index] * (1 - frac) + inputData[index + 1] * frac;
      } else if (index < originalLength) {
        sample = inputData[index];
      }

      // Add high-frequency sub-audible noise (amplitude ~0.0005)
      const noise = (Math.random() * 2 - 1) * subNoiseAmp;
      outputData[i] = Math.max(-1, Math.min(1, sample + noise));
    }
  }

  return outputBuffer;
}

/**
 * Strips metadata boxes (such as udta, meta, and ID3 tags) from MP4 / media ArrayBuffers.
 */
export function stripMediaMetadata(buffer: ArrayBuffer): ArrayBuffer {
  const view = new DataView(buffer);
  const resultBytes = new Uint8Array(buffer.slice(0));

  // Search for 'udta' or 'meta' MP4 atoms and zero out non-essential metadata header bytes
  let offset = 0;
  while (offset < view.byteLength - 8) {
    const size = view.getUint32(offset);
    if (size < 8 || offset + size > view.byteLength) break;

    const type = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7)
    );

    if (type === 'udta' || type === 'meta') {
      // Clear out metadata payload bytes to erase camera/software metadata signatures
      for (let i = offset + 8; i < offset + size; i++) {
        resultBytes[i] = 0;
      }
    }
    offset += size;
  }

  return resultBytes.buffer;
}
