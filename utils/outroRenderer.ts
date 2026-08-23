/*
  The CTA outro: a still card appended to a finished clip, asking for a comment.

  The layout, the timing and the ornaments here are measured from the reference
  reel rather than invented — a scene that scales up out of the centre over
  ~1s and then holds, a viewfinder grid, two chrome sparkles and a script
  keyword sitting on a diagonal between two light italic lines. Values in
  REF_* units are pixels in that 720x1280 reference and are scaled to whatever
  the output canvas is, so the card survives a change of output size.
*/

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  TARGET_FPS,
  MAX_DURATION_S,
  loadVideo,
  decodeAudio,
  applyAudioUniquification,
  mixAudioLayers,
  audioRms,
  loopedLayers,
  AudioLayer,
  findSupportedVideoCodec,
  isAudioCodecSupported,
  createCanvas,
  createSeekWatch,
  seekTo,
  sourceDurationOf,
} from './render/media';
import { drawFrame, preloadShowcaseImages } from './render/canvasDraw';
import { OutroPresetId, ViralVariation } from '../types';
import {
  generateUniquifierParams,
  applyUniquifierFilters,
  applyUniquifierNoise,
  stripMediaMetadata,
  UniquifierIntensity,
  UniquifierParams,
} from './uniquifier';
import { ensureRenderFontsLoaded } from './renderFonts';

/* Re-exported so the pickers and the batch service can keep taking the id
   from the module that draws it. */
export type { OutroPresetId };

export type KeywordFontType = 'cursive' | 'serif' | 'sans';
export type OutroTextPosition = 'center' | 'upper' | 'lower' | 'upper-left' | 'lower-right';

/* New CTA cards stay around the visual centre. Centre is intentionally
   weighted twice; the only variation is a small upward shift. Legacy saved
   positions remain valid through OutroTextPosition, but are no longer picked
   for newly rendered Reels. */
export const OUTRO_TEXT_POSITIONS: OutroTextPosition[] = [
  'center',
  'center',
  'upper',
];

export interface OutroRenderOptions {
  actionText: string;
  keywordText: string;
  subtitleText?: string;
  backgroundStyle: OutroPresetId;
  customBgUrl?: string;
  outroDurationSec: number;
  fontFamily?: string;
  keywordFontType?: KeywordFontType;
  actionColor?: string;
  keywordColor?: string;
  subtitleColor?: string;
  /** Safe-zone layout for the whole CTA copy group. */
  textPosition?: OutroTextPosition;
  showQuotes?: boolean;
  showGrid?: boolean;
  showSparkles?: boolean;
  /** Small pill above the headline on the modern card. Empty hides it. */
  badgeText?: string;
  // Sound under the outro card
  outroSoundUrl?: string;
  outroSoundVolume?: number;
  /* Take the length of the card from the sound instead of `outroDurationSec`,
     so the Reel ends on the last beat rather than on silence or a cut. On by
     default; a card without a sound keeps the preset length. */
  matchOutroToSound?: boolean;
  /** Optional decoded buffers reused by a batch render. */
  sourceAudioBuffer?: AudioBuffer | null;
  outroSoundBuffer?: AudioBuffer | null;
  /*
    Draw this variation's hook overlay onto the main segment.

    Without it the main segment is a plain copy of the source, which is what a
    CTA-only preset wants. With it, the hook and the card are produced by one
    encoder pass — the batch used to encode the whole Reel, then encode the
    result a second time just to append the card, paying twice the time and a
    second generation of compression for it.

    The trims and `variantKind` a Studio variation can carry are not honoured
    here: the batch never sets them, and the card is laid out for 720x1280.
  */
  overlayVariation?: ViralVariation;
  /** Library music, mixed under whatever audio the source came with. */
  mainAudioUrl?: string;
  mainAudioBuffer?: AudioBuffer | null;
  /* How loud that music plays, 0…1. Left undefined the level is taken from
     the reference: quiet under a voiceover, full over silence. */
  mainAudioVolume?: number;
  // Uniquifier options
  uniquifierEnabled?: boolean;
  uniquifierIntensity?: UniquifierIntensity;
  abortSignal?: AbortSignal;
  onProgress?: (progress: number, statusText: string) => void;
}

/*
  The sound starts just before the cut so the two tracks overlap instead of
  leaving a hole where the card begins. A card timed to the music is therefore
  one lead-in shorter than the sound itself.
*/
const OUTRO_SOUND_LEAD_IN = 0.25;

/*
  Anything above this on the reference is something worth hearing — a
  voiceover, in the workflow this exists for — and the library track drops
  under it. Below it the reference is silent and the track is the soundtrack.
  Roughly -40 dBFS, which is above room tone and well below speech.
*/
const VOICE_RMS_THRESHOLD = 0.01;

/* Under a voice, the music sits about 13 dB down: present, but not something
   the viewer has to listen past. Exported because it is also the number a
   preset starts from when its owner takes the level off automatic. */
export const MUSIC_UNDER_VOICE_GAIN = 0.22;

/* A track has to be this much longer than the Reel before its entry point is
   allowed to rove — otherwise the roving is what forces it to loop. */
const MUSIC_ROVING_HEADROOM_S = 5;

/*
  Where in a library track this render starts playing.

  A track with room to spare is entered at a different point every time, so
  two Reels cut from the same one do not open on the same bar — and the point
  is chosen from the room the track actually has, never past it, so a long
  track still covers the Reel in a single pass instead of looping to make up
  for its own head start. A track that barely covers the Reel has no room to
  give and starts at the beginning. An offset set by hand in the Studio wins
  over both.
*/
export function musicEntryPoint(
  trackDuration: number,
  totalDuration: number,
  manualOffset: number,
  fraction: number,
): number {
  if (manualOffset > 0) return manualOffset;
  const spare = trackDuration - totalDuration;
  if (spare <= MUSIC_ROVING_HEADROOM_S) return 0;
  return spare * Math.min(1, Math.max(0, fraction));
}

/** How loud a library track sits under the audio the reference came with. */
export function musicGainUnder(referenceRms: number): number {
  return referenceRms > VOICE_RMS_THRESHOLD ? MUSIC_UNDER_VOICE_GAIN : 1;
}

/*
  The level the music actually plays at.

  A number set on the preset is used as given — including over a silent
  reference, where the automatic rule would have chosen full. Somebody who
  moved the slider meant the number they left on it.

  Exported because the audition button has to answer the same question, and a
  preview that worked this out for itself would start lying the first time
  either side changed.
*/
export function resolveMusicGain(
  requested: number | undefined,
  reference: AudioBuffer | null,
  referenceSeconds: number,
): number {
  if (requested !== undefined) return Math.min(1, Math.max(0, requested));
  return musicGainUnder(reference ? audioRms(reference, 0, referenceSeconds) : 0);
}

/*
  How long a card holds when no sound decides it for it.

  The length is asked for as "two and a half to three seconds", so the number
  below is the middle of that window and the uniquifier's jitter spreads
  renders across it — no two Reels end on exactly the same beat, and none of
  them is long enough to be scrolled past.

  It is shared by every card style. Typography is what makes those styles
  different; how long the viewer is given to read them is one decision.
*/
export const DEFAULT_OUTRO_DURATION_S = 2.65;

/** The window that number sits in the middle of. */
export const OUTRO_CARD_WINDOW_S = { min: 2.3, max: 3 };

/* Bounds for the card. A shorter one reads as a glitch; a longer one would let
   a whole track swallow the Reel it was supposed to close. */
const MIN_OUTRO_S = 1;
const MAX_OUTRO_S = 10;

const clampOutro = (seconds: number) =>
  Math.min(MAX_OUTRO_S, Math.max(MIN_OUTRO_S, seconds));

/*
  Whether the card should take its length from the sound at all.

  A sting is written to close a Reel and the card should last exactly as long
  as it plays. A whole track is background music — it plays under a card of the
  usual length and is faded out with it, rather than stretching the ending into
  a third of the video.
*/
export function isOutroTimedToSound(soundDurationSec: number): boolean {
  return soundDurationSec > 0 && soundDurationSec - OUTRO_SOUND_LEAD_IN <= MAX_OUTRO_S;
}

/*
  How long the card stays on screen.

  Timed to a sting it lasts exactly as long as that sting, lead-in included.
  The uniquifier then shaves a fraction of a second off it, so ten renders of
  one source are ten different durations — and the trim comes off the tail the
  fade-out already covers. Otherwise the preset value is jittered in either
  direction instead.
*/
export function resolveOutroDuration(
  requestedSec: number,
  soundDurationSec: number,
  matchToSound = true,
  jitterSec = 0,
): number {
  if (matchToSound && isOutroTimedToSound(soundDurationSec)) {
    const musicLength = clampOutro(soundDurationSec - OUTRO_SOUND_LEAD_IN);
    return clampOutro(musicLength - Math.abs(jitterSec));
  }
  return clampOutro(Math.max(1, requestedSec || 2.2) + jitterSec);
}

function throwIfRenderAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('Генерация остановлена');
  error.name = 'AbortError';
  throw error;
}

async function withRenderTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  abortSignal?: AbortSignal,
): Promise<T> {
  let timeoutId = 0;
  let abortHandler: (() => void) | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
      new Promise<never>((_, reject) => {
        abortHandler = () => {
          const error = new Error('Генерация остановлена');
          error.name = 'AbortError';
          reject(error);
        };
        if (abortSignal?.aborted) abortHandler();
        else abortSignal?.addEventListener('abort', abortHandler, { once: true });
      }),
    ]);
  } finally {
    window.clearTimeout(timeoutId);
    if (abortHandler) abortSignal?.removeEventListener('abort', abortHandler);
  }
}

/* Reference frame the layout was measured in. */
const REF_W = 720;

/*
  The zoom a drifting card needs for its own edges to stay outside the frame.

  Footage is drawn larger than the canvas and cropped, so the uniquifier can
  shift it freely. The card is drawn to the edges of the frame instead, and a
  shift alone would expose a strip of whatever was behind it. It is therefore
  zoomed by at least the drift it is about to take, in both directions, plus a
  fraction of a per cent against rounding at the boundary.
*/
export function outroDriftCover(
  scale: number,
  panX: number,
  panY: number,
  width: number,
  height: number,
): number {
  const needed = 1 + 2 * Math.max(Math.abs(panX) / width, Math.abs(panY) / height) + 0.004;
  return Math.max(scale, needed);
}

/*
  Scene timeline, in seconds from the first outro frame. Taken from the
  reference: the grid is collapsed at the centre at +0.05s, halfway out at
  +0.45s, settled at +1.05s, and nothing moves after that.
*/
export const OUTRO_TIMELINE = {
  sceneIn: 1.05,
  sceneFrom: 0.06,
  textDelay: 0.42,
  textFade: 0.3,
  sparkleDelay: 0.6,
  sparkleIn: 0.45,
};

/* The light italic lines that flank the keyword. */
const LIGHT_ITALIC_STACK = '"Inter", "Helvetica Neue", Arial, sans-serif';

export interface OutroSound {
  id: string;
  name: string;
  url: string;
  description?: string;
}

/*
  Sounds that play under the card. Drop files into
  public/assets/outro-sounds/ and add one entry each — the picker reads this
  list, and an entry that fails to decode falls back to silence rather than
  failing the render.
*/
export const OUTRO_SOUNDS: OutroSound[] = [];

/*
  The crimson card is a two-colour poster: one flat red ground and one warm
  off-white for every line on it. Both are sampled from the reference frame,
  and the whole preset falls apart if they drift towards pure red and pure
  white — that combination reads as a system alert, not as print.
*/
const CRIMSON_BG = '#bb1817';
const CRIMSON_INK = '#e7e2d6';

export const OUTRO_BACKGROUNDS = [
  {
    id: 'editorial-grid-blue',
    name: 'Editorial Grid',
    description: 'Светлый градиент, сетка видоискателя, 3D-звёзды и каллиграфия',
    previewColor: '#e0f2fe',
    defaultActionText: 'Повтори этот визуал — ПИШИ',
    defaultSubtitleText: 'и получи 1000+ готовых промптов для визуала',
    defaultBadgeText: '',
    defaultDuration: DEFAULT_OUTRO_DURATION_S,
    defaultActionColor: '#1f2937',
    defaultKeywordColor: '#0a0a0a',
    defaultSubtitleColor: '#1f2937',
    defaultFontType: 'cursive' as const,
    defaultShowQuotes: false,
    defaultShowGrid: true,
    defaultShowSparkles: true,
  },
  {
    id: 'modern-violet',
    name: 'Modern Violet',
    description: 'Точечная сетка, жирный градиентный заголовок и фиолетовый росчерк',
    previewColor: '#f7f7f9',
    defaultActionText: 'НЕ ТРАТЬ ЛИМИТЫ — ПИШИ',
    defaultSubtitleText: 'и получи 1000+ готовых промптов для визуала',
    defaultBadgeText: '#нейросети',
    defaultDuration: DEFAULT_OUTRO_DURATION_S,
    /* The headline is filled with a gradient; this is its dark end, which is
       also what the picker shows as the accent. */
    defaultActionColor: '#14161a',
    defaultKeywordColor: '#8b5cf6',
    defaultSubtitleColor: '#4b5058',
    defaultFontType: 'sans' as const,
    defaultShowQuotes: false,
    defaultShowGrid: false,
    defaultShowSparkles: false,
  },
  {
    id: 'crimson-gothic',
    name: 'Crimson Gothic',
    description: 'Алый экран, готическое кодовое слово и моноширинная подпись',
    previewColor: CRIMSON_BG,
    defaultActionText: 'ПИШИ',
    defaultSubtitleText: 'и я пришлю подборку промптов в Direct',
    defaultBadgeText: '',
    defaultDuration: DEFAULT_OUTRO_DURATION_S,
    defaultActionColor: CRIMSON_INK,
    defaultKeywordColor: CRIMSON_INK,
    defaultSubtitleColor: CRIMSON_INK,
    defaultFontType: 'sans' as const,
    defaultShowQuotes: false,
    defaultShowGrid: false,
    defaultShowSparkles: false,
  },
] as const;

export function outroBackgroundUrl(options: OutroRenderOptions): string {
  return options.customBgUrl || '';
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  if (!url) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/* Overshoots slightly, which is what gives the sparkles their pop. */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/*
  A four-point sparkle with concave sides — the arms are quadratic curves
  pulled in towards the centre, not straight edges to an inner radius, which
  is what separates this shape from a shuriken.
*/
function drawSparkle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  colorFrom: string,
  colorTo: string,
  rotation: number,
  pop: number,
) {
  if (pop <= 0.01) return;

  const rx = radius;
  const ry = radius * 1.12;
  const waist = 0.18;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.scale(pop, pop);

  ctx.beginPath();
  ctx.moveTo(0, -ry);
  ctx.quadraticCurveTo(rx * waist, -ry * waist, rx, 0);
  ctx.quadraticCurveTo(rx * waist, ry * waist, 0, ry);
  ctx.quadraticCurveTo(-rx * waist, ry * waist, -rx, 0);
  ctx.quadraticCurveTo(-rx * waist, -ry * waist, 0, -ry);
  ctx.closePath();

  const grad = ctx.createLinearGradient(-rx, -ry, rx, ry);
  grad.addColorStop(0, colorFrom);
  grad.addColorStop(1, colorTo);
  ctx.fillStyle = grad;
  ctx.shadowColor = 'rgba(15, 23, 42, 0.18)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 3;
  ctx.fill();

  ctx.restore();
}

/*
  Viewfinder grid. Positions are the reference's, not rule-of-thirds.

  The lines converge on the centre as the scene scales in, but they are always
  drawn edge to edge: in the reference the collapsed grid still crosses the
  whole frame, which it would not do if the strokes themselves were scaled.
*/
function drawGridLines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scale: number,
) {
  const s = width / REF_W;
  const midX = width / 2;
  const midY = height / 2;
  const atX = (ratio: number) => midX + (width * ratio - midX) * scale;
  const atY = (ratio: number) => midY + (height * ratio - midY) * scale;

  ctx.save();
  ctx.strokeStyle = 'rgba(120, 132, 145, 0.55)';
  ctx.lineWidth = Math.max(1, 1.5 * s);
  ctx.setLineDash([10 * s, 7 * s]);

  ctx.beginPath();
  for (const ratio of [0.133, 0.847]) {
    const x = atX(ratio);
    ctx.moveTo(x, 0); ctx.lineTo(x, height);
  }
  for (const ratio of [0.34, 0.72]) {
    const y = atY(ratio);
    ctx.moveTo(0, y); ctx.lineTo(width, y);
  }
  ctx.stroke();
  ctx.restore();
}

let grainTile: HTMLCanvasElement | null = null;

/* A 128px noise tile, built once and tiled. Cheap enough to run on every
   frame, and it keeps a smooth dark gradient from posterising into visible
   rings after the platform re-encodes the video. */
function getGrainTile(): HTMLCanvasElement {
  if (grainTile) return grainTile;

  const tile = document.createElement('canvas');
  tile.width = 128;
  tile.height = 128;
  const tctx = tile.getContext('2d')!;
  const image = tctx.createImageData(128, 128);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = 110 + Math.random() * 90;
    image.data[i] = v;
    image.data[i + 1] = v;
    image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  tctx.putImageData(image, 0, 0);
  grainTile = tile;
  return tile;
}

function applyGrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  alpha: number,
) {
  const pattern = ctx.createPattern(getGrainTile(), 'repeat');
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function fillRadial(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  inner: string,
  outer: string,
  width: number,
  height: number,
) {
  const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
}

/*
  Backgrounds are drawn rather than loaded.

  A jpg cannot follow the accent colours, costs half a megabyte, and — as the
  first version of this feature showed — quietly bakes in whatever was on
  screen when it was captured. Gradients cost nothing, stay sharp at any
  output size, and can bloom with the intro.
*/
function drawBackground(
  ctx: CanvasRenderingContext2D,
  options: OutroRenderOptions,
  bgImage: HTMLImageElement | null,
  width: number,
  height: number,
  drift: number,
) {
  if (bgImage) {
    const scale = 1.0 + drift * 0.03;
    const bgW = width * scale;
    const bgH = height * scale;
    ctx.drawImage(bgImage, (width - bgW) / 2, (height - bgH) / 2, bgW, bgH);

    if (options.backgroundStyle === 'custom') {
      const vignette = ctx.createRadialGradient(
        width / 2, height / 2, width * 0.2,
        width / 2, height / 2, width * 0.85,
      );
      vignette.addColorStop(0, 'rgba(0, 0, 0, 0.25)');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0.65)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
    } else {
      /* Uploaded art is the background, while the selected preset still owns
         typography. A veil in the preset's own ground keeps its text readable
         over photographs without forcing users to tune three colour pickers —
         which means a dark red one where the type is cream, since a white
         veil would leave the crimson card's copy invisible. */
      const veils: Partial<Record<OutroPresetId, string>> = {
        'modern-violet': 'rgba(248, 247, 252, 0.7)',
        'crimson-gothic': 'rgba(150, 15, 16, 0.74)',
      };
      ctx.fillStyle = veils[options.backgroundStyle] ?? 'rgba(255, 255, 255, 0.64)';
      ctx.fillRect(0, 0, width, height);
    }
    return;
  }

  const bloom = 0.55 + 0.45 * drift;

  if (options.backgroundStyle === 'modern-violet') {
    const s = width / REF_W;

    const base = ctx.createLinearGradient(0, 0, 0, height);
    base.addColorStop(0, '#fcfcfd');
    base.addColorStop(0.6, '#f6f6f8');
    base.addColorStop(1, '#eeeef2');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);

    /* The dot grid every deck like this has. Drawn in screen space so it
       stays a background, and drifting half a cell as the card settles. */
    const step = 26 * s;
    const radius = 1.7 * s;
    const shift = (1 - drift) * step * 0.5;
    ctx.save();
    ctx.fillStyle = 'rgba(23, 25, 35, 0.09)';
    for (let y = -step + shift; y < height + step; y += step) {
      for (let x = -step + shift; x < width + step; x += step) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // Violet bloom behind the script line, and a cooler one low in the frame
    fillRadial(ctx, width * 0.5, height * 0.47, width * 0.85,
      `rgba(139, 92, 246, ${0.16 * bloom})`, 'rgba(139, 92, 246, 0)', width, height);
    fillRadial(ctx, width * 0.18, height * 0.86, width * 0.7,
      `rgba(56, 189, 248, ${0.1 * bloom})`, 'rgba(56, 189, 248, 0)', width, height);

    applyGrain(ctx, width, height, 0.025);
    return;
  }

  if (options.backgroundStyle === 'crimson-gothic') {
    /* Flat, not graded: every pixel of the reference ground measures the same
       red. A vertical ramp would turn it into a different, softer style, so
       the depth comes from grain and a corner shadow instead — which is also
       what keeps a full-frame flat colour from banding once Instagram
       re-encodes it. */
    ctx.fillStyle = CRIMSON_BG;
    ctx.fillRect(0, 0, width, height);

    /* Barely there on purpose: a few points of shade in the corners, not a
       vignette. Anything stronger and the ground stops reading as one flat
       colour, which is the whole of this card's design. */
    fillRadial(
      ctx, width * 0.5, height * 0.42, width * 1.05,
      `rgba(255, 96, 74, ${0.03 * bloom})`, 'rgba(112, 6, 10, 0.09)', width, height,
    );

    applyGrain(ctx, width, height, 0.03);
    return;
  }

  /* Editorial: white down to ~58% of the frame, then into light blue —
     sampled from the reference rather than eyeballed. */
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.56, '#fdfefe');
  gradient.addColorStop(0.72, '#e6f4fc');
  gradient.addColorStop(0.86, '#c7e8fd');
  gradient.addColorStop(1, '#9bd6fd');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/* The canvas the encoder draws into carries a global letterSpacing, which
   pulls script glyphs apart at their joins. Text here sets its own. */
function setTracking(ctx: CanvasRenderingContext2D, value: string) {
  // @ts-ignore - letterSpacing is not in every lib.dom yet
  if (ctx.letterSpacing !== undefined) {
    // @ts-ignore
    ctx.letterSpacing = value;
  }
}

/*
  Three lines on a diagonal: the action sits above the script's left shoulder,
  the subtitle hangs off its right descender. Both are placed against the
  measured width of the script itself, so a long keyword moves them apart
  instead of running them over.
*/
/*
  The formal scripts that carry the reference look — Style Script, Parisienne,
  Great Vibes — have no Cyrillic at all, so a Russian keyword in them silently
  falls back to whatever the browser has. The alphabet of the word picks the
  stack instead: latin gets the reference face, Cyrillic gets the handwriting
  faces that actually cover it.
*/
const CYRILLIC_RE = /[\u0400-\u04FF]/;
const SCRIPT_LATIN =
  '"Style Script", "Parisienne", "Pinyon Script", "Great Vibes", cursive';
const SCRIPT_CYRILLIC =
  '"Marck Script", "Caveat", "Bad Script", "Dancing Script", cursive';
const SCRIPT_STACK =
  '"Style Script", "Parisienne", "Great Vibes", "Marck Script", "Caveat", "Bad Script", cursive';

export function scriptStackFor(text: string): string {
  return CYRILLIC_RE.test(text) ? SCRIPT_CYRILLIC : SCRIPT_LATIN;
}

/* Prata is a display didone with Cyrillic; Unbounded is a wide geometric
   display sans, also with Cyrillic. Both read as designed rather than as a
   system default, which Georgia and Arial Black do not. */
const SERIF_STACK =
  '"Prata", "Playfair Display", "Cormorant Garamond", "Noto Serif", Georgia, serif';
const SANS_STACK =
  '"Unbounded", "Manrope", "Montserrat", "Inter", system-ui, -apple-system, sans-serif';
/* The quiet lines above and below the keyword. */
const UI_SANS_STACK = '"Manrope", "Inter", "Helvetica Neue", Arial, sans-serif';

const FONT_STACKS: Record<KeywordFontType, string> = {
  cursive: SCRIPT_STACK,
  serif: SERIF_STACK,
  sans: SANS_STACK,
};

/* Per-line entrance for the centred layouts: a rule that opens from the
   middle, then the three lines lifting in one after another. */
const DARK_STAGGER = {
  rule: { at: 0.34, dur: 0.55 },
  action: { at: 0.44, dur: 0.32, rise: 18 },
  keyword: { at: 0.56, dur: 0.38, rise: 26 },
  subtitle: { at: 0.8, dur: 0.32, rise: 14 },
};

function mixHex(hex: string, target: [number, number, number], amount: number): string {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  const channels: [number, number, number] = [
    (num >> 16) & 255,
    (num >> 8) & 255,
    num & 255,
  ];
  const out = channels.map((c, i) => Math.round(c + (target[i] - c) * amount));
  return `rgb(${out[0]}, ${out[1]}, ${out[2]})`;
}

/* A headline filled with one flat grey reads as a system default. The ramp
   runs left to right, light into near-black, the way these covers are set. */
function headlineFill(
  ctx: CanvasRenderingContext2D,
  left: number,
  right: number,
  base: string,
): CanvasGradient {
  const grad = ctx.createLinearGradient(left, 0, right, 0);
  grad.addColorStop(0, mixHex(base, [255, 255, 255], 0.72));
  grad.addColorStop(0.42, mixHex(base, [255, 255, 255], 0.3));
  grad.addColorStop(1, base);
  return grad;
}

/* The script accent: violet into magenta across the word, brightest where it
   crosses the bloom in the background. */
function accentFill(
  ctx: CanvasRenderingContext2D,
  left: number,
  top: number,
  right: number,
  bottom: number,
  base: string,
): CanvasGradient {
  const grad = ctx.createLinearGradient(left, top, right, bottom);
  grad.addColorStop(0, mixHex(base, [255, 255, 255], 0.35));
  grad.addColorStop(0.5, base);
  grad.addColorStop(1, mixHex(base, [217, 70, 239], 0.65));
  return grad;
}

/* Grows a small word and shrinks a long one so the keyword always occupies a
   deliberate share of the frame. */
function fitToWidth(
  size: number,
  measured: number,
  target: number,
  max: number,
  cap: number,
): number {
  let next = size;
  if (measured < target) next = size * (target / measured);
  if (measured > max) next = size * (max / measured);
  return Math.min(next, cap);
}

function stagger(t: number, at: number, dur: number) {
  const p = clamp01((t - at) / dur);
  return { alpha: p, eased: easeOutCubic(p) };
}

/*
  Three lines on a diagonal for editorial / light layouts.
  Places action, keyword and subtitle relative to measured keyword width.
*/
function drawEditorialText(
  ctx: CanvasRenderingContext2D,
  options: OutroRenderOptions,
  width: number,
  height: number,
  keyword: string,
  action: string,
  subtitle: string,
) {
  const s = width / REF_W;
  const cx = width * 0.47;
  const cy = height * 0.545;
  const fontType = options.keywordFontType || 'cursive';
  const keywordFontFam =
    fontType === 'cursive' ? scriptStackFor(keyword) : FONT_STACKS[fontType];

  setTracking(ctx, fontType === 'sans' ? '-1px' : '0px');

  const getFont = (px: number) => {
    if (fontType === 'sans') return `800 ${px}px ${keywordFontFam}`;
    return `400 ${px}px ${keywordFontFam}`;
  };

  /* Script faces disagree wildly about how much of an em a letter uses, so the
     keyword is sized by the width it actually lands on — in the reference it
     covers ~43% of the frame — instead of by a px value that only suits one
     family. */
  let size = (fontType === 'cursive' ? 120 : fontType === 'sans' ? 62 : 86) * s;
  ctx.font = getFont(size);
  let scriptWidth = ctx.measureText(keyword).width;

  if (scriptWidth > 0) {
    size = fitToWidth(size, scriptWidth, width * 0.42, width * 0.72, 260 * s);
    ctx.font = getFont(size);
    scriptWidth = ctx.measureText(keyword).width;
  }

  const left = cx - scriptWidth / 2;
  const right = cx + scriptWidth / 2;

  ctx.textBaseline = 'middle';

  /* The quiet lines clear the script by its own ink, not by a fixed offset:
     a taller face or a longer word would otherwise run straight through
     them. */
  const metrics = ctx.measureText(keyword);
  /* Floored against the design size: a word with no ascenders and no
     descenders — «стиль» is both — measures almost nothing, and the lines
     placed off that measurement land straight on top of the keyword. */
  const ascent = Math.max(metrics.actualBoundingBoxAscent || 0, size * 0.54);
  const descent = Math.max(metrics.actualBoundingBoxDescent || 0, size * 0.36);

  // Action line, left-aligned to the keyword
  ctx.save();
  let actionSize = 40 * s;
  ctx.font = `italic 300 ${actionSize}px ${LIGHT_ITALIC_STACK}`;
  const actionWidth = ctx.measureText(action).width;
  if (actionWidth > width * 0.68) {
    actionSize *= (width * 0.68) / actionWidth;
    ctx.font = `italic 300 ${actionSize}px ${LIGHT_ITALIC_STACK}`;
  }
  ctx.fillStyle = options.actionColor || '#1f2937';
  ctx.textAlign = 'left';
  ctx.fillText(action, left + 4 * s, cy - ascent - 6 * s);
  ctx.restore();

  // Keyword
  ctx.save();
  ctx.font = getFont(size);
  ctx.fillStyle = options.keywordColor || '#0a0a0a';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(15, 23, 42, 0.12)';
  ctx.shadowBlur = 12 * s;
  ctx.shadowOffsetY = 2 * s;
  ctx.fillText(keyword, cx, cy);
  ctx.restore();

  // Subtitle, hanging past the right edge
  if (subtitle) {
    ctx.save();
    let subtitleSize = 35 * s;
    ctx.font = `italic 300 ${subtitleSize}px ${LIGHT_ITALIC_STACK}`;
    const subtitleWidth = ctx.measureText(subtitle).width;
    if (subtitleWidth > width * 0.78) {
      subtitleSize *= (width * 0.78) / subtitleWidth;
      ctx.font = `italic 300 ${subtitleSize}px ${LIGHT_ITALIC_STACK}`;
    }
    ctx.fillStyle = options.subtitleColor || '#1f2937';
    ctx.textAlign = 'right';
    ctx.fillText(subtitle, right + 75 * s, cy + descent + 4 * s);
    ctx.restore();
  }
}

/*
  Centred stack for the dark presets: a rule that opens from the middle with
  the action above it and the keyword under it. The lines arrive in sequence
  rather than together, which is what makes a two-second card feel composed
  instead of pasted on.
*/
function drawCenteredText(
  ctx: CanvasRenderingContext2D,
  options: OutroRenderOptions,
  width: number,
  height: number,
  keyword: string,
  action: string,
  subtitle: string,
  t: number,
) {
  const s = width / REF_W;
  const centerY = height * 0.48;
  const fontType = options.keywordFontType || 'serif';
  const keywordFontFam =
    fontType === 'cursive' ? scriptStackFor(keyword) : FONT_STACKS[fontType];
  const accent = options.actionColor || '#1f2937';
  const lightCard = options.backgroundStyle !== 'custom';

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  /* The action sits between two hairlines that open outwards, the way a
     masthead is set — a single rule stacked above it reads as a divider in a
     slide template. */
  const actionY = centerY - 52 * s;
  const actionIn = stagger(t, DARK_STAGGER.action.at, DARK_STAGGER.action.dur);
  const rule = stagger(t, DARK_STAGGER.rule.at, DARK_STAGGER.rule.dur);

  ctx.save();
  setTracking(ctx, `${8 * s}px`);
  ctx.font = `500 ${25 * s}px ${UI_SANS_STACK}`;
  const actionWidth = ctx.measureText(action).width;
  ctx.restore();

  if (rule.alpha > 0) {
    const gap = actionWidth / 2 + 26 * s;
    const armLength = width * 0.17 * rule.eased;
    ctx.save();
    ctx.globalAlpha = Math.min(1, rule.alpha * 1.3);
    ctx.lineWidth = Math.max(1, 1.5 * s);
    for (const direction of [-1, 1]) {
      const from = width / 2 + direction * gap;
      const to = from + direction * armLength;
      const line = ctx.createLinearGradient(from, 0, to, 0);
      line.addColorStop(0, accent);
      line.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.strokeStyle = line;
      ctx.beginPath();
      ctx.moveTo(from, actionY);
      ctx.lineTo(to, actionY);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (actionIn.alpha > 0) {
    ctx.save();
    ctx.globalAlpha = actionIn.alpha;
    setTracking(ctx, `${8 * s}px`);
    ctx.font = `500 ${25 * s}px ${UI_SANS_STACK}`;
    ctx.fillStyle = accent;
    const rise = DARK_STAGGER.action.rise * s * (1 - actionIn.eased);
    /* Tracking pushes the last letter's spacing onto the right edge, which
       throws a centred line off by half a letter-space. */
    ctx.translate(4 * s, 0);
    ctx.fillText(action, width / 2, actionY + rise);
    ctx.restore();
  }

  // Keyword
  const keyIn = stagger(t, DARK_STAGGER.keyword.at, DARK_STAGGER.keyword.dur);
  if (keyIn.alpha > 0) {
    let size = (fontType === 'cursive' ? 104 : fontType === 'sans' ? 62 : 82) * s;
    const getFont = (px: number) => {
      if (fontType === 'sans') return `800 ${px}px ${keywordFontFam}`;
      return `400 ${px}px ${keywordFontFam}`;
    };

    ctx.save();
    ctx.globalAlpha = keyIn.alpha;
    setTracking(ctx, fontType === 'sans' ? `${-1 * s}px` : '0px');
    ctx.font = getFont(size);

    const measured = ctx.measureText(keyword).width;
    if (measured > 0) {
      size = fitToWidth(size, measured, width * 0.5, width * 0.82, 200 * s);
      ctx.font = getFont(size);
    }

    const rise = DARK_STAGGER.keyword.rise * s * (1 - keyIn.eased);
    const baseline = centerY + 40 * s + rise;

    ctx.fillStyle = options.keywordColor || '#ffffff';
    /* A heavy black glow lifts text off a dark card and muddies a light one,
       and this layout is reachable from both. */
    ctx.shadowColor = lightCard ? 'rgba(15, 23, 42, 0.14)' : 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = (lightCard ? 14 : 30) * s;
    ctx.shadowOffsetY = (lightCard ? 2 : 5) * s;
    ctx.fillText(keyword, width / 2, baseline);
    ctx.restore();
  }

  // Subtitle
  if (subtitle) {
    const subIn = stagger(t, DARK_STAGGER.subtitle.at, DARK_STAGGER.subtitle.dur);
    if (subIn.alpha > 0) {
      ctx.save();
      ctx.globalAlpha = subIn.alpha;
      setTracking(ctx, `${1.5 * s}px`);
      let subtitleSize = 24 * s;
      ctx.font = `400 ${subtitleSize}px ${UI_SANS_STACK}`;
      const subtitleWidth = ctx.measureText(subtitle).width;
      if (subtitleWidth > width * 0.78) {
        subtitleSize *= (width * 0.78) / subtitleWidth;
        ctx.font = `400 ${subtitleSize}px ${UI_SANS_STACK}`;
      }
      ctx.fillStyle = options.subtitleColor || '#b9a273';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 8 * s;
      const rise = DARK_STAGGER.subtitle.rise * s * (1 - subIn.eased);
      ctx.fillText(subtitle, width / 2, centerY + 118 * s + rise);
      ctx.restore();
    }
  }
}

/* Entrance order for the modern card. */
const MODERN_STAGGER = {
  badge: { at: 0.3, dur: 0.3, rise: 16 },
  headline: { at: 0.42, dur: 0.34, rise: 26 },
  accent: { at: 0.58, dur: 0.36, rise: 20 },
  subtitle: { at: 0.78, dur: 0.3, rise: 14 },
};

const MODERN_SCRIPT_STACK =
  '"Pacifico", "Caveat", "Marck Script", "Dancing Script", cursive';

/*
  The modern card: a pill, a heavy sans headline in a light-to-dark ramp, and
  the code word underneath as a violet script that overlaps it. The script
  carries the word people have to type, so it gets the colour and the tilt —
  everything above it is setup.
*/
function drawModernText(
  ctx: CanvasRenderingContext2D,
  options: OutroRenderOptions,
  width: number,
  height: number,
  keyword: string,
  action: string,
  subtitle: string,
  t: number,
) {
  const s = width / REF_W;
  const centerX = width / 2;
  const badge = options.badgeText?.trim();

  // Badge pill
  const badgeIn = stagger(t, MODERN_STAGGER.badge.at, MODERN_STAGGER.badge.dur);
  if (badge && badgeIn.alpha > 0) {
    const fontSize = 23 * s;
    ctx.save();
    ctx.globalAlpha = badgeIn.alpha;
    setTracking(ctx, `${1.2 * s}px`);
    ctx.font = `600 ${fontSize}px ${UI_SANS_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const padX = 26 * s;
    const boxW = ctx.measureText(badge).width + padX * 2;
    const boxH = 52 * s;
    const y = height * 0.3 + MODERN_STAGGER.badge.rise * s * (1 - badgeIn.eased);

    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(centerX - boxW / 2, y - boxH / 2, boxW, boxH, boxH / 2);
    } else {
      ctx.rect(centerX - boxW / 2, y - boxH / 2, boxW, boxH);
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(23, 25, 35, 0.14)';
    ctx.lineWidth = Math.max(1, 1.4 * s);
    ctx.stroke();

    ctx.fillStyle = '#4b5058';
    ctx.fillText(badge, centerX, y + 1 * s);
    ctx.restore();
  }

  // Headline — the call to action, set heavy and tight
  const headIn = stagger(t, MODERN_STAGGER.headline.at, MODERN_STAGGER.headline.dur);
  let headlineWidth = width * 0.6;
  const headlineY = height * 0.4;
  if (headIn.alpha > 0) {
    ctx.save();
    ctx.globalAlpha = headIn.alpha;
    setTracking(ctx, `${-2 * s}px`);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let size = 96 * s;
    const font = (px: number) => `800 ${px}px ${SANS_STACK}`;
    ctx.font = font(size);
    const measured = ctx.measureText(action).width;
    if (measured > 0) {
      size = fitToWidth(size, measured, width * 0.62, width * 0.84, 140 * s);
      ctx.font = font(size);
      headlineWidth = ctx.measureText(action).width;
    }

    const y = headlineY + MODERN_STAGGER.headline.rise * s * (1 - headIn.eased);
    ctx.fillStyle = headlineFill(
      ctx,
      centerX - headlineWidth / 2,
      centerX + headlineWidth / 2,
      options.actionColor || '#14161a',
    );
    ctx.fillText(action, centerX, y);
    ctx.restore();
  }

  // Code word — violet script, tilted, overlapping the headline
  const accentIn = stagger(t, MODERN_STAGGER.accent.at, MODERN_STAGGER.accent.dur);
  if (accentIn.alpha > 0) {
    ctx.save();
    ctx.globalAlpha = accentIn.alpha;
    setTracking(ctx, '0px');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let size = 104 * s;
    const font = (px: number) => `400 ${px}px ${MODERN_SCRIPT_STACK}`;
    ctx.font = font(size);
    let measured = ctx.measureText(keyword).width;
    if (measured > 0) {
      size = fitToWidth(size, measured, width * 0.5, width * 0.78, 150 * s);
      ctx.font = font(size);
      measured = ctx.measureText(keyword).width;
    }

    const y = height * 0.485 + MODERN_STAGGER.accent.rise * s * (1 - accentIn.eased);
    ctx.translate(centerX, y);
    ctx.rotate(-0.045);
    ctx.scale(0.94 + 0.06 * accentIn.eased, 0.94 + 0.06 * accentIn.eased);

    ctx.shadowColor = 'rgba(139, 92, 246, 0.35)';
    ctx.shadowBlur = 26 * s;
    ctx.shadowOffsetY = 6 * s;
    ctx.fillStyle = accentFill(
      ctx,
      -measured / 2,
      -size * 0.5,
      measured / 2,
      size * 0.5,
      options.keywordColor || '#8b5cf6',
    );
    ctx.fillText(keyword, 0, 0);
    ctx.restore();
  }

  // Supporting line
  if (subtitle) {
    const subIn = stagger(t, MODERN_STAGGER.subtitle.at, MODERN_STAGGER.subtitle.dur);
    if (subIn.alpha > 0) {
      ctx.save();
      ctx.globalAlpha = subIn.alpha;
      setTracking(ctx, `${0.5 * s}px`);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let subtitleSize = 30 * s;
      ctx.font = `700 ${subtitleSize}px ${UI_SANS_STACK}`;
      const subtitleWidth = ctx.measureText(subtitle).width;
      if (subtitleWidth > width * 0.8) {
        subtitleSize *= (width * 0.8) / subtitleWidth;
        ctx.font = `700 ${subtitleSize}px ${UI_SANS_STACK}`;
      }
      ctx.fillStyle = options.subtitleColor || '#4b5058';
      const y = height * 0.565 + MODERN_STAGGER.subtitle.rise * s * (1 - subIn.eased);
      ctx.fillText(subtitle, centerX, y);
      ctx.restore();
    }
  }
}

/* Entrance for the crimson card, timed off the reference: the kicker alone
   for a beat, the code word under it, then the two quiet lines. Nothing moves
   after ~1.2s, and nothing slides in from anywhere — the card is a poster
   being lit, not a slide being built. */
const CRIMSON_STAGGER = {
  kicker: { at: 0.18, dur: 0.34, rise: 10 },
  keyword: { at: 0.42, dur: 0.46 },
  subtitle: { at: 0.72, dur: 0.34, rise: 12 },
  handle: { at: 0.88, dur: 0.34, rise: 8 },
};

/*
  Where each line sits, as a share of the frame. The crimson layout is fixed
  rather than measured off the keyword the way the editorial one is: in the
  reference the four lines hold their positions and only the code word changes
  size, which is what makes a series of these cards look like one series.
*/
/* The headline's ink band, as a share of the frame height, and the measure
   a five-letter word like the reference's has to sit inside. */
const CRIMSON_KEYWORD_INK = 0.118;
const CRIMSON_KEYWORD_MEASURE = 0.58;

/* A longer code word is allowed to run wider rather than lose height: holding
   every word to one measure would make a nine-letter card a third shorter in
   the headline than a five-letter one, which is exactly the inconsistency the
   fixed layout exists to avoid. */
export function crimsonKeywordMeasure(width: number, chars: number): number {
  return width * Math.min(0.78, CRIMSON_KEYWORD_MEASURE + Math.max(0, chars - 5) * 0.05);
}
/* Condensing past this stops reading as a condensed cut and starts reading as
   a squashed one. A word too long even for it loses size instead. */
const CRIMSON_MIN_CONDENSE = 0.72;

const CRIMSON_LAYOUT = {
  kickerY: 0.361,
  keywordY: 0.438,
  subtitleY: 0.534,
  subtitleLine: 0.036,
  handleY: 0.812,
};

/*
  Grenze Gotisch carries the reference's blackletter and covers no Cyrillic at
  all, so a Russian code word falls through to the next family in the stack.

  That family is Oswald rather than the one Cyrillic blackletter on offer.
  Ruslan Display is the obvious choice on paper and unusable here: its caps
  are half as tall as its letters are wide, so a six-letter Russian word set
  to the width of this card comes out at a third of the headline height the
  layout is built around. Oswald's proportions are within a few per cent of
  the reference face's, which keeps the two alphabets making the same card
  even though only one of them gets the blackletter.
*/
const GOTHIC_STACK =
  '"Grenze Gotisch", "Oswald", "Unbounded", Impact, sans-serif';

/* The typewriter lines around it. */
const MONO_STACK =
  '"Roboto Mono", "JetBrains Mono", ui-monospace, Menlo, monospace';

/*
  A centred line set with tracking lands half a letter-space to the left: the
  space after the final glyph is measured into the width but has nothing in
  it. Every tracked line here is nudged back by half of it.
*/
function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  y: number,
  tracking: number,
) {
  ctx.fillText(text, centerX + tracking / 2, y);
}

/* The supporting line is a sentence, not a label, so it breaks onto a second
   line the way the reference sets it instead of shrinking to a whisper. */
function wrapToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);

  return lines;
}

/*
  The crimson card: a flat red poster with a tracked kicker, the code word in
  blackletter, one typewritten promise and the account mark at the foot.

  The code word is upper-cased on the way in. The reference sets it that way,
  Instagram matches comment keywords case-insensitively, and a lowercase word
  in this face reads as a mistake rather than as a choice.
*/
function drawCrimsonText(
  ctx: CanvasRenderingContext2D,
  options: OutroRenderOptions,
  width: number,
  height: number,
  keyword: string,
  action: string,
  subtitle: string,
  t: number,
) {
  const s = width / REF_W;
  const centerX = width / 2;
  const ink = options.keywordColor || CRIMSON_INK;
  const handle = options.badgeText?.trim();

  ctx.textAlign = 'center';

  // Kicker — the instruction, small and widely tracked
  const kickerIn = stagger(t, CRIMSON_STAGGER.kicker.at, CRIMSON_STAGGER.kicker.dur);
  if (kickerIn.alpha > 0) {
    const tracking = 9 * s;
    ctx.save();
    ctx.globalAlpha = kickerIn.alpha;
    ctx.textBaseline = 'middle';
    setTracking(ctx, `${tracking}px`);
    ctx.font = `500 ${27 * s}px ${MONO_STACK}`;
    ctx.fillStyle = options.actionColor || CRIMSON_INK;
    const rise = CRIMSON_STAGGER.kicker.rise * s * (1 - kickerIn.eased);
    drawTracked(
      ctx, action.toUpperCase(), centerX,
      height * CRIMSON_LAYOUT.kickerY + rise, tracking,
    );
    ctx.restore();
  }

  // Code word — blackletter, filling most of the width
  const keyIn = stagger(t, CRIMSON_STAGGER.keyword.at, CRIMSON_STAGGER.keyword.dur);
  if (keyIn.alpha > 0) {
    const word = keyword.toUpperCase();
    ctx.save();
    ctx.globalAlpha = keyIn.alpha;
    ctx.textBaseline = 'alphabetic';
    setTracking(ctx, '0px');

    const font = (px: number) => `700 ${px}px ${GOTHIC_STACK}`;
    /*
      Sized by the ink it lays down rather than by its em box or its width.

      The card is built around a headline of one particular height, and the
      two faces behind this stack disagree about both cap height and set
      width, so a fixed pixel size would give a Russian card a different
      headline from an English one. The height is set first, and the word is
      then condensed — never past the point where the strokes go spindly —
      until it fits the measure.
    */
    const probeSize = 200 * s;
    ctx.font = font(probeSize);
    const probe = ctx.measureText(word);
    const probeInk = probe.actualBoundingBoxAscent + probe.actualBoundingBoxDescent;

    let size = probeInk > 0
      ? Math.min(probeSize * ((CRIMSON_KEYWORD_INK * height) / probeInk), 260 * s)
      : probeSize;
    ctx.font = font(size);

    const measure = crimsonKeywordMeasure(width, word.length);
    let advance = ctx.measureText(word).width;
    let condense = 1;
    if (advance > measure) {
      condense = Math.max(CRIMSON_MIN_CONDENSE, measure / advance);
      if (advance * condense > measure) {
        size *= measure / (advance * condense);
        ctx.font = font(size);
        advance = ctx.measureText(word).width;
      }
    }

    /* Centred on the ink too. A blackletter cap has almost no descender, so
       centring the em box instead would hang the word visibly low. */
    const box = ctx.measureText(word);
    const ascent = box.actualBoundingBoxAscent;
    const descent = box.actualBoundingBoxDescent;
    const centreY = height * CRIMSON_LAYOUT.keywordY;
    const baseline = Number.isFinite(ascent) && Number.isFinite(descent)
      ? centreY + (ascent - descent) / 2
      : centreY + size * 0.35;

    /* The one thing that moves: the word settles the last few per cent into
       place, so it lands rather than fades. */
    const pop = 0.96 + 0.04 * keyIn.eased;
    ctx.translate(centerX, baseline);
    ctx.scale(pop * condense, pop);
    ctx.fillStyle = ink;
    ctx.fillText(word, 0, 0);
    ctx.restore();
  }

  // The promise, typewritten, over as many as two lines
  if (subtitle) {
    const subIn = stagger(t, CRIMSON_STAGGER.subtitle.at, CRIMSON_STAGGER.subtitle.dur);
    if (subIn.alpha > 0) {
      ctx.save();
      ctx.globalAlpha = subIn.alpha;
      ctx.textBaseline = 'middle';
      setTracking(ctx, `${0.5 * s}px`);

      let size = 34 * s;
      /* Narrower than the frame allows: the reference breaks this sentence in
         two rather than running one long line under a compact headline. */
      const maxWidth = width * 0.66;
      ctx.font = `400 ${size}px ${MONO_STACK}`;
      let lines = wrapToWidth(ctx, subtitle, maxWidth);
      /* Two lines is the layout; a longer offer loses type size, not the
         line under the keyword. */
      while (lines.length > 2 && size > 22 * s) {
        size *= 0.92;
        ctx.font = `400 ${size}px ${MONO_STACK}`;
        lines = wrapToWidth(ctx, subtitle, maxWidth);
      }

      ctx.fillStyle = options.subtitleColor || CRIMSON_INK;
      const rise = CRIMSON_STAGGER.subtitle.rise * s * (1 - subIn.eased);
      lines.forEach((line, index) => {
        const y = height * (CRIMSON_LAYOUT.subtitleY + index * CRIMSON_LAYOUT.subtitleLine);
        ctx.fillText(line, centerX, y + rise);
      });
      ctx.restore();
    }
  }

  // Account mark, dimmed so it signs the card instead of competing with it
  if (handle) {
    const handleIn = stagger(t, CRIMSON_STAGGER.handle.at, CRIMSON_STAGGER.handle.dur);
    if (handleIn.alpha > 0) {
      const tracking = 6 * s;
      ctx.save();
      ctx.globalAlpha = handleIn.alpha * 0.62;
      ctx.textBaseline = 'middle';
      setTracking(ctx, `${tracking}px`);
      ctx.font = `400 ${22 * s}px ${MONO_STACK}`;
      ctx.fillStyle = options.subtitleColor || CRIMSON_INK;
      const rise = CRIMSON_STAGGER.handle.rise * s * (1 - handleIn.eased);
      drawTracked(
        ctx, handle.toUpperCase(), centerX,
        height * CRIMSON_LAYOUT.handleY + rise, tracking,
      );
      ctx.restore();
    }
  }
}

/**
 * Draws one frame of the outro card. `elapsedSec` is time since the card
 * appeared; anything past OUTRO_TIMELINE.sceneIn is the settled frame.
 */
export function drawOutroFrame(
  ctx: CanvasRenderingContext2D,
  options: OutroRenderOptions,
  bgImage: HTMLImageElement | null,
  width: number = CANVAS_WIDTH,
  height: number = CANVAS_HEIGHT,
  elapsedSec: number = 999,
) {
  const t = Math.max(0, elapsedSec);
  const scriptLayout = (options.keywordFontType || 'cursive') === 'cursive';
  /* The crimson card holds still and is lit line by line. Pulling it out of
     the centre the way the other two arrive would turn a printed poster into
     a title animation. */
  const flatCard = options.backgroundStyle === 'crimson-gothic';

  ctx.save();
  ctx.clearRect(0, 0, width, height);

  const sceneT = easeOutCubic(clamp01(t / OUTRO_TIMELINE.sceneIn));
  drawBackground(ctx, options, bgImage, width, height, sceneT);

  const sceneScale = flatCard
    ? 1
    : OUTRO_TIMELINE.sceneFrom + (1 - OUTRO_TIMELINE.sceneFrom) * sceneT;

  if (options.showGrid) {
    drawGridLines(ctx, width, height, sceneScale);
  }

  // Text and ornaments scale up out of the centre; the grid above only moves.
  ctx.translate(width / 2, height / 2);
  ctx.scale(sceneScale, sceneScale);
  ctx.translate(-width / 2, -height / 2);

  if (options.showSparkles) {
    const pop = clamp01((t - OUTRO_TIMELINE.sparkleDelay) / OUTRO_TIMELINE.sparkleIn);
    const eased = pop <= 0 ? 0 : easeOutBack(pop);
    const s = width / REF_W;

    drawSparkle(
      ctx, width * 0.735, height * 0.348, 38 * s,
      '#c3c7cc', '#0f1216', 0.2 - sceneT * 0.08, eased,
    );
    drawSparkle(
      ctx, width * 0.236, height * 0.716, 30 * s,
      '#8fdcfd', '#1e88d8', -0.15 + sceneT * 0.07, eased,
    );
  }

  const action = options.actionText.trim() || 'Пиши';
  const rawKeyword = options.keywordText.trim() || (scriptLayout ? 'стиль' : 'ПРОМПТ');
  const keyword = options.showQuotes ? `“${rawKeyword}”` : rawKeyword;
  const subtitle = options.subtitleText?.trim() || '';

  /*
    Move the complete copy group, not individual lines, so the hierarchy stays
    intact. Offsets are intentionally modest: even the widest modern headline
    and the editorial subtitle remain inside Instagram's safe area.
  */
  const positionOffsets: Record<OutroTextPosition, { x: number; y: number }> = {
    center: { x: 0, y: 0 },
    upper: { x: 0, y: -0.07 },
    lower: { x: 0, y: 0.13 },
    'upper-left': { x: -0.04, y: -0.08 },
    'lower-right': { x: 0.04, y: 0.08 },
  };
  const textOffset = positionOffsets[options.textPosition || 'center'];
  ctx.save();
  ctx.translate(width * textOffset.x, height * textOffset.y);

  if (options.backgroundStyle === 'modern-violet') {
    /* Its own layout rather than a font swap: the pill, the ramped headline
       and the tilted script are the preset. */
    drawModernText(ctx, options, width, height, keyword, action, subtitle, t);
  } else if (flatCard) {
    drawCrimsonText(ctx, options, width, height, keyword, action, subtitle, t);
  } else if (scriptLayout) {
    const textAlpha = clamp01((t - OUTRO_TIMELINE.textDelay) / OUTRO_TIMELINE.textFade);
    if (textAlpha > 0) {
      ctx.globalAlpha = textAlpha;
      drawEditorialText(ctx, options, width, height, keyword, action, subtitle);
    }
  } else {
    drawCenteredText(ctx, options, width, height, keyword, action, subtitle, t);
  }

  ctx.restore();
  ctx.restore();
}

/**
 * Renders an uploaded video with a CTA Outro attached at the end and optional Uniquifier.
 */
export async function renderVideoWithCtaOutro(
  sourceVideoFile: File,
  options: OutroRenderOptions
): Promise<Blob> {
  const { onProgress } = options;
  throwIfRenderAborted(options.abortSignal);
  onProgress?.(5, 'Подготовка шрифтов и ресурсов...');

  await ensureRenderFontsLoaded();
  await document.fonts.ready;

  const uniquifier: UniquifierParams = generateUniquifierParams(
    options.uniquifierIntensity || 'medium',
    options.uniquifierEnabled !== false
  );

  const video = await loadVideo(sourceVideoFile);
  const overlay = options.overlayVariation;
  if (overlay) await preloadShowcaseImages(overlay);

  /* The card is timed to the music, so the sound has to be decoded before the
     timeline can be laid out. A batch passes the buffer in already decoded. */
  const outroSound = options.outroSoundBuffer !== undefined
    ? options.outroSoundBuffer
    : options.outroSoundUrl
      ? await decodeAudio(options.outroSoundUrl)
      : null;
  if (options.outroSoundUrl && !outroSound) {
    console.warn('Outro sound could not be decoded, rendering without it:', options.outroSoundUrl);
  }

  const outroDuration = resolveOutroDuration(
    options.outroDurationSec,
    outroSound?.duration ?? 0,
    options.matchOutroToSound !== false,
    uniquifier.enabled ? uniquifier.outroDurationJitterSec : 0,
  );

  /* Music from the library. It no longer decides where the Reel ends — a
     track shorter than the footage repeats instead of cutting it. */
  const mainAudio = options.mainAudioBuffer !== undefined
    ? options.mainAudioBuffer
    : options.mainAudioUrl
      ? await decodeAudio(options.mainAudioUrl)
      : null;
  const mainAudioOffset = Math.max(0, overlay?.audioStartOffset || 0);

  /* The card has to fit inside the same ceiling every other renderer honours,
     so a long upload loses its tail rather than the outro. */
  const sourceLimit = Math.max(1, MAX_DURATION_S - outroDuration);
  const sourceDuration = sourceDurationOf(video);
  const rawVideoDuration = Math.max(1, Math.min(sourceDuration, sourceLimit));
  const trimmed = sourceDuration > sourceLimit + 0.05;
  const totalDuration = rawVideoDuration + outroDuration;

  const bgImage = await loadImage(outroBackgroundUrl(options));

  const outputWidth = CANVAS_WIDTH;
  const outputHeight = CANVAS_HEIGHT;
  const videoCodec = await findSupportedVideoCodec(outputWidth, outputHeight);
  if (!videoCodec) {
    throw new Error('H.264 видео-кодек не поддерживается в вашем браузере. Рекомендуется использовать Chrome или Safari.');
  }

  const { canvas, ctx } = createCanvas(outputWidth, outputHeight);

  onProgress?.(8, 'Сведение звуковой дорожки...');

  /*
    The reference, the music and the outro sound live on one timeline.

    The reference keeps its own audio — it is uploaded with a voiceover on it
    and no soundtrack, and the library track goes underneath rather than over
    the top of it. The outro sound starts just before the cut so the two
    overlap instead of leaving a hole where the card begins.
  */
  const sourceAudio = options.sourceAudioBuffer !== undefined
    ? options.sourceAudioBuffer
    : await decodeAudio(sourceVideoFile);

  const layers: AudioLayer[] = [];
  if (sourceAudio) {
    /* Clamped to the footage that survived the trim: a reference longer than
       the ceiling should not go on talking over the card. */
    layers.push({
      buffer: sourceAudio,
      startTime: 0,
      duration: Math.min(sourceAudio.duration, rawVideoDuration),
      fadeOut: outroSound ? 0.45 : 0.3,
    });
  }

  if (mainAudio) {
    const gain = resolveMusicGain(options.mainAudioVolume, sourceAudio, rawVideoDuration);
    const offset = musicEntryPoint(
      mainAudio.duration, totalDuration, mainAudioOffset, uniquifier.musicStartFraction,
    );

    layers.push(...loopedLayers(mainAudio, {
      totalDuration,
      offset,
      gain,
      startFade: 0.3,
      endFade: 0.6,
    }));
  }
  if (outroSound) {
    const leadIn = Math.min(OUTRO_SOUND_LEAD_IN, rawVideoDuration);
    layers.push({
      buffer: outroSound,
      startTime: rawVideoDuration - leadIn,
      duration: outroDuration + leadIn,
      gain: options.outroSoundVolume ?? 0.9,
      fadeIn: 0.2,
      fadeOut: 0.5,
    });
  }

  const mixedAudio = await mixAudioLayers(layers, totalDuration);
  const decodedAudio = mixedAudio
    ? await applyAudioUniquification(mixedAudio, uniquifier)
    : null;

  const audioChannels = decodedAudio ? Math.min(decodedAudio.numberOfChannels, 2) : 0;
  const audioRate = decodedAudio ? decodedAudio.sampleRate : 0;
  const audioSupported = decodedAudio
    ? await isAudioCodecSupported(audioRate, audioChannels)
    : false;

  const target = new ArrayBufferTarget();
  const muxerConfig: ConstructorParameters<typeof Muxer>[0] = {
    target,
    video: { codec: 'avc', width: outputWidth, height: outputHeight },
    fastStart: 'in-memory',
  };

  if (decodedAudio && audioSupported) {
    muxerConfig.audio = {
      codec: 'aac',
      numberOfChannels: audioChannels,
      sampleRate: audioRate,
    };
  }

  const muxer = new Muxer(muxerConfig);

  /* An encoder reports failures on its own callback rather than on the call
     that queued the frame; without this the render finishes "successfully"
     around a broken file. */
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
    bitrate: 6_500_000,
    framerate: TARGET_FPS,
  });

  let audioEncoder: AudioEncoder | null = null;
  if (decodedAudio && audioSupported) {
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

  const mainVideoFrames = Math.ceil(rawVideoDuration * TARGET_FPS);
  const outroFrames = Math.ceil(outroDuration * TARGET_FPS);
  const totalFrames = mainVideoFrames + outroFrames;

  const waitForEncoderRoom = async () => {
    const startedAt = performance.now();
    while (videoEncoder.encodeQueueSize > TARGET_FPS * 2) {
      await new Promise((r) => setTimeout(r, 8));
      throwIfRenderAborted(options.abortSignal);
      if (encodeError) throw encodeError;
      if (performance.now() - startedAt > 15_000) {
        throw new Error('Видеокодировщик не отвечает. Повторите запус.');
      }
    }
  };

  const renderMainFrame = (time: number, frameIndex: number) => {
    if (encodeError) throw encodeError;

    if (overlay) {
      /* The overlay renderer owns the hook, the bait and the uniquifier
         transform for this frame; one encoder pass covers both segments. */
      drawFrame(ctx, video, overlay, outputWidth, outputHeight, uniquifier);

      const overlaid = new VideoFrame(canvas, {
        timestamp: Math.round(time * 1_000_000),
      });
      videoEncoder.encode(overlaid, { keyFrame: frameIndex % 60 === 0 });
      overlaid.close();
      return;
    }

    ctx.save();
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, outputWidth, outputHeight);

    if (uniquifier.enabled) {
      applyUniquifierFilters(ctx, uniquifier);
      ctx.translate(outputWidth / 2, outputHeight / 2);
      ctx.rotate((uniquifier.rotateDeg * Math.PI) / 180);
      ctx.translate(uniquifier.panX, uniquifier.panY);
      ctx.scale(uniquifier.scale, uniquifier.scale);
      ctx.translate(-outputWidth / 2, -outputHeight / 2);
    }

    const vRatio = video.videoWidth / video.videoHeight;
    const cRatio = outputWidth / outputHeight;
    let renderW = outputWidth;
    let renderH = outputHeight;

    if (vRatio > cRatio) {
      renderH = outputHeight;
      renderW = outputHeight * vRatio;
    } else {
      renderW = outputWidth;
      renderH = outputWidth / vRatio;
    }

    const ox = (outputWidth - renderW) / 2;
    const oy = (outputHeight - renderH) / 2;
    ctx.drawImage(video, ox, oy, renderW, renderH);

    if (uniquifier.enabled) {
      applyUniquifierNoise(ctx, uniquifier, outputWidth, outputHeight);
    }

    ctx.restore();

    const frame = new VideoFrame(canvas, {
      timestamp: Math.round(time * 1_000_000),
    });
    videoEncoder.encode(frame, { keyFrame: frameIndex % 60 === 0 });
    frame.close();
  };

  const reportMainProgress = (frameIndex: number) => {
    if (frameIndex % 20 !== 0) return;
    const time = frameIndex / TARGET_FPS;
    const pct = Math.round((frameIndex / totalFrames) * 85);
    const tail = trimmed ? ` — обрезано до ${MAX_DURATION_S}с` : '';
    onProgress?.(pct, `Рендер основного видео (${Math.round(time)}с / ${Math.round(rawVideoDuration)}с)${tail}...`);
  };

  const watchSeek = createSeekWatch();

  try {
    // 1. Render Main Video Segment. Every output frame uses its exact source
    // timestamp. Accelerated playback dropped frames and truncated some Reels.
    for (let renderedMainFrames = 0; renderedMainFrames < mainVideoFrames; renderedMainFrames++) {
      throwIfRenderAborted(options.abortSignal);
      const time = renderedMainFrames / TARGET_FPS;
      watchSeek(await seekTo(video, time));
      renderMainFrame(time, renderedMainFrames);
      reportMainProgress(renderedMainFrames + 1);
      await waitForEncoderRoom();
    }

    /*
      2. Render Outro Segment.

      The card carries the same uniquifier as the footage, minus the tilt.
      Without it every Reel from an account ends in a still that is identical
      to the pixel — the one stretch of the video a duplicate check can match
      outright, and the jittered length alone does not hide it. The rotation
      is left out on purpose: a photograph shifted half a degree reads as a
      hand-held frame, while a poster set half a degree crooked reads as a
      mistake.
    */
    for (let j = 0; j < outroFrames; j++) {
      throwIfRenderAborted(options.abortSignal);
      if (encodeError) throw encodeError;
      const elapsed = j / TARGET_FPS;
      const time = rawVideoDuration + elapsed;

      ctx.save();
      if (uniquifier.enabled) {
        applyUniquifierFilters(ctx, uniquifier);
        const cover = outroDriftCover(
          uniquifier.scale, uniquifier.panX, uniquifier.panY, outputWidth, outputHeight,
        );
        ctx.translate(outputWidth / 2 + uniquifier.panX, outputHeight / 2 + uniquifier.panY);
        ctx.scale(cover, cover);
        ctx.translate(-outputWidth / 2, -outputHeight / 2);
      }

      drawOutroFrame(ctx, options, bgImage, outputWidth, outputHeight, elapsed);

      if (uniquifier.enabled) {
        applyUniquifierNoise(ctx, uniquifier, outputWidth, outputHeight);
      }
      ctx.restore();

      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(time * 1_000_000),
      });
      videoEncoder.encode(frame, { keyFrame: j === 0 || j % 60 === 0 });
      frame.close();

      if (j % 15 === 0) {
        const pct = Math.round(((mainVideoFrames + j) / totalFrames) * 85);
        onProgress?.(pct, `Рендер CTA концовки (${elapsed.toFixed(1)}с)...`);
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    // 3. Audio Track Encoding
    if (decodedAudio && audioEncoder && audioSupported) {
      onProgress?.(90, 'Обработка звуковой дорожки...');
      const channels = audioChannels;
      const sampleRate = audioRate;
      const maxSamples = Math.min(
        decodedAudio.length,
        Math.ceil(totalDuration * sampleRate)
      );
      const CHUNK = 1024;

      for (let offset = 0; offset < maxSamples; offset += CHUNK) {
        throwIfRenderAborted(options.abortSignal);
        if (encodeError) throw encodeError;
        const count = Math.min(CHUNK, maxSamples - offset);
        const data = new Float32Array(count * channels);

        for (let ch = 0; ch < channels; ch++) {
          const src = decodedAudio.getChannelData(ch);
          data.set(src.subarray(offset, offset + count), ch * count);
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

    onProgress?.(95, 'Финализация MP4 файла...');
    await withRenderTimeout(
      videoEncoder.flush(),
      30_000,
      'Не удалось завершить кодирование видео.',
      options.abortSignal,
    );
    if (audioEncoder) {
      await withRenderTimeout(
        audioEncoder.flush(),
        15_000,
        'Не удалось завершить кодирование звука.',
        options.abortSignal,
      );
    }
    if (encodeError) throw encodeError;
    muxer.finalize();
  } finally {
    if (videoEncoder.state !== 'closed') videoEncoder.close();
    if (audioEncoder && audioEncoder.state !== 'closed') audioEncoder.close();
    URL.revokeObjectURL(video.src);
    video.remove();
    canvas.remove();
  }

  onProgress?.(100, 'Готово!');

  const finalBuffer = uniquifier.stripMetadata
    ? stripMediaMetadata(target.buffer)
    : target.buffer;

  return new Blob([finalBuffer], { type: 'video/mp4' });
}
