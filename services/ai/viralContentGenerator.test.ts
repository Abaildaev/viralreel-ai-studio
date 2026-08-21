import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCtaOutroCaption,
  buildReelsCaptionCta,
  buildReelsCaptionCtaVariant,
  CTA_OUTRO_SUBTITLE,
  generateCtaOutroCopyVariants,
  normalizeCtaOutroAction,
  REELS_PROMPT_PACK_OFFER,
} from './viralContentGenerator';

describe('generateCtaOutroCopyVariants fallback', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps ПИШИ in every unique batch CTA', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const variants = await generateCtaOutroCopyVariants({
      keyword: 'ПРОМПТ',
      offer: 'пак готовых промптов',
      count: 10,
    });

    expect(variants).toHaveLength(10);
    expect(new Set(variants.map((item) => `${item.actionText}|${item.subtitleText}`)).size).toBe(10);
    for (const variant of variants) {
      expect(variant.actionText).toMatch(/ПИШИ/u);
      expect(variant.subtitleText).toBe(CTA_OUTRO_SUBTITLE);
    }
  });

  it('keeps exactly one Cyrillic ПИШИ when AI already returned it', () => {
    expect(normalizeCtaOutroAction('Ускорь генерацию — ПИШИ — ПИШИ'))
      .toBe('Ускорь генерацию — ПИШИ');
    expect(normalizeCtaOutroAction('Сделай так же — напиши'))
      .toBe('Сделай так же — ПИШИ');
  });

  it('keeps one Пиши in a caption even when the action is duplicated', () => {
    const caption = buildCtaOutroCaption({
      action: 'Ускорь генерацию — ПИШИ — ПИШИ',
      keyword: 'промт',
      subtitle: 'и получи пак промтов в Direct',
      count: 1,
    }, 0);

    expect(caption.match(/пиши/giu)).toHaveLength(1);
    expect(caption).toContain(buildReelsCaptionCta('промт'));
    expect(caption.split('\n')).toHaveLength(5);
    expect(caption.split('\n')[2]).not.toContain('ПИШИ');
  });

  it('uses the short 1000+ pack CTA for Reels captions, not the funnel offer', () => {
    const caption = buildCtaOutroCaption({
      action: 'Не трать лимиты — ПИШИ',
      keyword: 'промпт',
      subtitle: 'и получи 2 генерации бесплатно',
      topic: 'оффер воронки с двумя бесплатными генерациями',
      count: 1,
    }, 0);

    expect(caption).toContain(`ПИШИ «промпт» — и получи ${REELS_PROMPT_PACK_OFFER}.`);
    expect(caption).not.toMatch(/2 генерац|две генерац|бесплатн\w*\s+генерац/iu);
  });

  it('rewrites the caption CTA while keeping the keyword and offer', () => {
    const variants = Array.from({ length: 8 }, (_, index) =>
      buildReelsCaptionCtaVariant('промпт', index),
    );

    expect(new Set(variants).size).toBe(8);
    expect(variants.every((value) =>
      value.toLowerCase().includes('промпт')
      && value.includes('1000+')
      && value.toLowerCase().includes('визуал'),
    )).toBe(true);
  });

  it('builds different fallback openings for a Reels batch', () => {
    const captions = Array.from({ length: 8 }, (_, index) => buildCtaOutroCaption({
      action: 'ПИШИ',
      keyword: 'промпт',
      count: 1,
    }, index));

    expect(new Set(captions.map((caption) => caption.split('\n')[0])).size).toBe(8);
    expect(captions.every((caption) =>
      caption.includes('1000+')
      && caption.toLowerCase().includes('промпт')
      && caption.toLowerCase().includes('визуал'),
    )).toBe(true);
    expect(new Set(captions.map((caption) => caption.split('\n')[3])).size).toBeGreaterThan(1);
  });
});
