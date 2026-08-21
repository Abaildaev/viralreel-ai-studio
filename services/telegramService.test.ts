import { describe, expect, it } from 'vitest';
import { funnelSlugFromLink } from './telegramService';

describe('reading a funnel deep link', () => {
  it('finds the slug in a plain link', () => {
    expect(funnelSlugFromLink('https://t.me/my_bot?start=prompts')).toBe('prompts');
  });

  it('finds it in a link that already carries an event id', () => {
    expect(
      funnelSlugFromLink('https://t.me/my_bot?start=prompts_123e4567-e89b-12d3-a456-426614174000'),
    ).toBe('prompts');
  });

  it('accepts the other spellings of the host', () => {
    expect(funnelSlugFromLink('https://telegram.me/my_bot?start=guide')).toBe('guide');
    expect(funnelSlugFromLink('https://www.t.me/my_bot?start=guide')).toBe('guide');
  });

  it('says nothing about links that are not funnels', () => {
    // A material link straight to a PDF is a legitimate rule, not a mistake,
    // so the editor must not warn about it.
    expect(funnelSlugFromLink('https://example.com/guide.pdf')).toBe('');
    expect(funnelSlugFromLink('https://t.me/my_bot')).toBe('');
    expect(funnelSlugFromLink('t.me/my_bot?start=x')).toBe('');
    expect(funnelSlugFromLink('')).toBe('');
  });
});
