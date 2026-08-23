import { describe, expect, it } from 'vitest';
import { createSeekWatch, loopedLayers, sourceDurationOf } from './media';

describe('seek watch', () => {
  it('tolerates a stubborn frame here and there', () => {
    const watch = createSeekWatch();
    for (let i = 0; i < 50; i++) {
      // One miss, then a frame that lands: a slow decoder, not a broken file.
      expect(() => watch(false)).not.toThrow();
      expect(() => watch(true)).not.toThrow();
    }
  });

  it('gives up after eight misses in a row', () => {
    const watch = createSeekWatch();
    for (let i = 0; i < 7; i++) expect(() => watch(false)).not.toThrow();
    expect(() => watch(false)).toThrow(/не перематывается/);
  });

  it('counts the run, not the total', () => {
    const watch = createSeekWatch();
    for (let i = 0; i < 7; i++) watch(false);
    watch(true);
    for (let i = 0; i < 7; i++) expect(() => watch(false)).not.toThrow();
  });
});

describe('source duration', () => {
  const video = (duration: number) => ({ duration }) as HTMLVideoElement;

  it('accepts a length the browser could read', () => {
    expect(sourceDurationOf(video(31.5))).toBe(31.5);
  });

  it('refuses a file whose length cannot be read', () => {
    // A fragmented or streaming MP4 reports Infinity, and the renderers used
    // to fall back to a made-up ten seconds.
    expect(() => sourceDurationOf(video(Infinity))).toThrow(/длительность/);
    expect(() => sourceDurationOf(video(NaN))).toThrow(/длительность/);
    expect(() => sourceDurationOf(video(0))).toThrow(/длительность/);
    expect(() => sourceDurationOf(video(-1))).toThrow(/длительность/);
  });
});

describe('looping a library track', () => {
  /* Only the length of the buffer matters to the layout; the samples are the
     mixer's business. */
  const track = (seconds: number) => ({ duration: seconds }) as AudioBuffer;

  it('covers a timeline longer than the track, crossfading the seams', () => {
    const layers = loopedLayers(track(3), { totalDuration: 12.6, seamFade: 0.25 });

    expect(layers.map((l) => l.startTime)).toEqual([0, 2.75, 5.5, 8.25, 11]);
    // Each pass but the first opens under the tail of the one before it.
    expect(layers[0].fadeIn).toBe(0);
    expect(layers.slice(1).every((l) => l.fadeIn === 0.25)).toBe(true);
    // The last pass is cut to the timeline rather than running past it.
    const last = layers[layers.length - 1];
    expect(last.startTime! + last.duration!).toBeCloseTo(12.6, 5);
  });

  it('plays a track that already covers the timeline exactly once', () => {
    const layers = loopedLayers(track(180), { totalDuration: 32, endFade: 0.6 });

    expect(layers).toHaveLength(1);
    expect(layers[0].duration).toBeCloseTo(32, 5);
    expect(layers[0].fadeOut).toBe(0.6);
  });

  it('counts the offset against the first pass only', () => {
    const layers = loopedLayers(track(10), { totalDuration: 25, offset: 6 });

    expect(layers[0].offset).toBe(6);
    expect(layers[0].duration).toBeCloseTo(4, 5);
    expect(layers.slice(1).every((l) => l.offset === 0)).toBe(true);
  });

  it('ignores an offset that would leave nothing to play', () => {
    // Otherwise the first pass is silence and the loop never advances.
    const layers = loopedLayers(track(10), { totalDuration: 20, offset: 9.8 });

    expect(layers[0].offset).toBe(0);
    expect(layers.length).toBeGreaterThan(0);
  });

  it('refuses a buffer too short to be a loop', () => {
    expect(loopedLayers(track(0.4), { totalDuration: 30 })).toEqual([]);
  });
});
