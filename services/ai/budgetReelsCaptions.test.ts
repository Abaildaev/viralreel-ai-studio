import { describe, expect, it } from 'vitest';
import { buildBudgetReelsCaption, normalizeBudgetCodeword } from './budgetReelsCaptions';

describe('budget Reels captions', () => {
  it('uses the selected codeword and never emits gender placeholders', () => {
    for (let index = 0; index < 10; index += 1) {
      const caption = buildBudgetReelsCaption('промпт', index);
      expect(caption).toContain('«ПРОМПТ»');
      expect(caption).not.toMatch(/\([а-яё]+\)|\/[а-яё]+/i);
      expect(caption).not.toContain('ТАБЛИЦА');
    }
  });

  it('normalizes quotes and whitespace without inventing another word', () => {
    expect(normalizeBudgetCodeword('  «Мой бюджет»\n')).toBe('МОЙ БЮДЖЕТ');
  });
});
