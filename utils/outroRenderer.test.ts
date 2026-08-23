import { describe, expect, it } from 'vitest';
import {
  OUTRO_BACKGROUNDS,
  OUTRO_CARD_WINDOW_S,
  OUTRO_TEXT_POSITIONS,
  crimsonKeywordMeasure,
  musicEntryPoint,
  musicGainUnder,
  outroDriftCover,
  isOutroTimedToSound,
  resolveOutroDuration,
} from './outroRenderer';

describe('CTA outro text positions', () => {
  it('uses only centre and slightly upper layouts for new renders', () => {
    expect(OUTRO_TEXT_POSITIONS).toEqual(['center', 'center', 'upper']);
    expect(OUTRO_TEXT_POSITIONS).not.toContain('lower');
    expect(OUTRO_TEXT_POSITIONS).not.toContain('lower-right');
  });
});

describe('CTA outro length', () => {
  it('takes the length of the sound, minus the lead-in it starts early', () => {
    // A 3s sting starts 0.25s before the cut, so the card holds for 2.75s and
    // the Reel ends on the last beat rather than on silence.
    expect(resolveOutroDuration(2.2, 3)).toBeCloseTo(2.75, 5);
  });

  it('keeps the preset length when there is no sound', () => {
    expect(resolveOutroDuration(2.2, 0)).toBeCloseTo(2.2, 5);
  });

  it('keeps the preset length when matching is turned off', () => {
    expect(resolveOutroDuration(2, 6, false)).toBeCloseTo(2, 5);
  });

  it('only ever shortens a card timed to the music', () => {
    // The tail is what the fade-out already covers; stretching past the last
    // beat would end the Reel on silence.
    expect(resolveOutroDuration(2.2, 3, true, 0.2)).toBeCloseTo(2.55, 5);
    expect(resolveOutroDuration(2.2, 3, true, -0.2)).toBeCloseTo(2.55, 5);
  });

  it('jitters a card without sound in either direction', () => {
    expect(resolveOutroDuration(2.2, 0, true, 0.2)).toBeCloseTo(2.4, 5);
    expect(resolveOutroDuration(2.2, 0, true, -0.2)).toBeCloseTo(2.0, 5);
  });

  it('never leaves a card shorter than a second or longer than ten', () => {
    expect(resolveOutroDuration(2.2, 0.5)).toBe(1);
    expect(resolveOutroDuration(2.2, 0, true, -5)).toBe(1);
    expect(resolveOutroDuration(30, 0)).toBe(10);
  });

  it('leaves the card alone when the sound is a whole track, not a sting', () => {
    // Batch presets pick from the same audio library the Reels use, so the
    // choice can be a three-minute song. It plays under a normal card.
    expect(isOutroTimedToSound(3)).toBe(true);
    expect(isOutroTimedToSound(45)).toBe(false);
    expect(resolveOutroDuration(2.2, 45)).toBeCloseTo(2.2, 5);
    expect(resolveOutroDuration(2.2, 180)).toBeCloseTo(2.2, 5);
  });
});

describe('crimson CTA card', () => {
  const preset = OUTRO_BACKGROUNDS.find((item) => item.id === 'crimson-gothic')!;

  it('is a two-colour poster: one cream ink on one red ground', () => {
    // The whole preset rests on this pair. A picker that quietly recoloured
    // one of the three lines would leave it unreadable on its own background.
    expect(preset.previewColor).toBe('#bb1817');
    expect(preset.defaultActionColor).toBe('#e7e2d6');
    expect(preset.defaultKeywordColor).toBe('#e7e2d6');
    expect(preset.defaultSubtitleColor).toBe('#e7e2d6');
  });

  it('holds a five-letter code word to the measure of the reference', () => {
    expect(crimsonKeywordMeasure(720, 5)).toBeCloseTo(720 * 0.58, 5);
    expect(crimsonKeywordMeasure(720, 3)).toBeCloseTo(720 * 0.58, 5);
  });

  it('lets a longer word run wider instead of losing headline height', () => {
    expect(crimsonKeywordMeasure(720, 6)).toBeCloseTo(720 * 0.63, 5);
    expect(crimsonKeywordMeasure(720, 8)).toBeCloseTo(720 * 0.73, 5);
  });

  it('stops widening before the code word reaches the safe area', () => {
    expect(crimsonKeywordMeasure(720, 12)).toBeCloseTo(720 * 0.78, 5);
    expect(crimsonKeywordMeasure(720, 40)).toBeCloseTo(720 * 0.78, 5);
  });
});

describe('CTA card uniquification', () => {
  /* The card is drawn to the edges of the frame, so its drift has to be paid
     for with zoom or it exposes the frame behind it. */
  const covers = (scale: number, panX: number, panY: number) => {
    const cover = outroDriftCover(scale, panX, panY, 720, 1280);
    const spareX = (720 * (cover - 1)) / 2;
    const spareY = (1280 * (cover - 1)) / 2;
    return spareX >= Math.abs(panX) && spareY >= Math.abs(panY);
  };

  it('covers the drift at every intensity the uniquifier generates', () => {
    // The generator pairs its smallest zoom with its largest shift often
    // enough that the worst case is the only one worth checking.
    expect(covers(1.01, 8, -8)).toBe(true);
    expect(covers(1.01, -8, 8)).toBe(true);
    expect(covers(1.05, 8, 8)).toBe(true);
    expect(covers(1.01, 0.5, 0.5)).toBe(true);
  });

  it('leaves a card that does not drift at the zoom it was given', () => {
    expect(outroDriftCover(1.03, 0, 0, 720, 1280)).toBeCloseTo(1.03, 5);
    expect(outroDriftCover(1, 0, 0, 720, 1280)).toBeCloseTo(1.004, 5);
  });

  it('never zooms out', () => {
    expect(outroDriftCover(1.05, 1, 1, 720, 1280)).toBeCloseTo(1.05, 5);
  });
});

describe('music under the reference', () => {
  it('drops the track under a reference that has a voice on it', () => {
    // Speech sits far above this; the level is measured rather than declared
    // so twenty uploads do not each need a checkbox.
    expect(musicGainUnder(0.35)).toBeLessThan(0.3);
    expect(musicGainUnder(0.02)).toBeLessThan(0.3);
  });

  it('lets the track be the soundtrack when the reference is silent', () => {
    expect(musicGainUnder(0)).toBe(1);
    expect(musicGainUnder(0.005)).toBe(1);
  });
});

describe('where a library track starts', () => {
  // A 22.6s Reel: 20s of reference plus the card.
  const reel = 22.6;

  it('roves through the room a long track has to spare', () => {
    // Two minutes of music behind a 22.6s Reel: 97.4s of room, and the render
    // may enter anywhere in it.
    expect(musicEntryPoint(120, reel, 0, 0)).toBeCloseTo(0, 5);
    expect(musicEntryPoint(120, reel, 0, 0.5)).toBeCloseTo(48.7, 5);
    expect(musicEntryPoint(120, reel, 0, 1)).toBeCloseTo(97.4, 5);
  });

  it('never enters so late that the track runs out', () => {
    // The latest entry still leaves exactly the Reel's length to play.
    const latest = musicEntryPoint(120, reel, 0, 1);
    expect(120 - latest).toBeCloseTo(reel, 5);
  });

  it('starts a track that barely covers the Reel at the beginning', () => {
    expect(musicEntryPoint(25, reel, 0, 0.9)).toBe(0);
    expect(musicEntryPoint(10, reel, 0, 0.9)).toBe(0);
  });

  it('keeps an offset set by hand', () => {
    expect(musicEntryPoint(120, reel, 12, 0.5)).toBe(12);
    expect(musicEntryPoint(25, reel, 12, 0.5)).toBe(12);
  });
});

describe('how long a card holds', () => {
  it('keeps every style inside the window the card is asked to land in', () => {
    for (const preset of OUTRO_BACKGROUNDS) {
      expect(preset.defaultDuration).toBeGreaterThanOrEqual(OUTRO_CARD_WINDOW_S.min);
      expect(preset.defaultDuration).toBeLessThanOrEqual(OUTRO_CARD_WINDOW_S.max);
    }
  });

  it('stays inside it at the widest jitter any intensity produces', () => {
    // The strongest setting reaches half the window either way, and stops.
    const widest = (OUTRO_CARD_WINDOW_S.max - OUTRO_CARD_WINDOW_S.min) / 2;
    for (const preset of OUTRO_BACKGROUNDS) {
      const shortest = resolveOutroDuration(preset.defaultDuration, 0, true, -widest);
      const longest = resolveOutroDuration(preset.defaultDuration, 0, true, widest);
      expect(shortest).toBeGreaterThanOrEqual(OUTRO_CARD_WINDOW_S.min);
      expect(longest).toBeLessThanOrEqual(OUTRO_CARD_WINDOW_S.max);
    }
  });
});
