import { describe, expect, it } from 'vitest';
import { createSeekWatch, sourceDurationOf } from './media';

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
