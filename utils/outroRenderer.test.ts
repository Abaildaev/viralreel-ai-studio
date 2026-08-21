import { describe, expect, it } from 'vitest';
import { OUTRO_TEXT_POSITIONS, isOutroTimedToSound, resolveOutroDuration } from './outroRenderer';

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
