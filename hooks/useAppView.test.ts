import { describe, expect, it } from 'vitest';
import { parseView } from './useAppView';

/*
  The address bar is user-editable and links outlive the code that produced
  them, so this parser reads untrusted input. Every case below is a URL someone
  can actually arrive on.
*/

describe('parseView', () => {
  it('reads a section from the canonical form', () => {
    expect(parseView('#/telegram')).toBe('telegram');
    expect(parseView('#/automations')).toBe('automations');
  });

  it('accepts the shorter spelling people type by hand', () => {
    expect(parseView('#telegram')).toBe('telegram');
  });

  it('falls back to the generator when there is no hash', () => {
    expect(parseView('')).toBe('generator');
    expect(parseView('#')).toBe('generator');
    expect(parseView('#/')).toBe('generator');
  });

  /*
    A link saved before a section was renamed must not leave a blank page —
    the reader should land somewhere real.
  */
  it('falls back when the section no longer exists', () => {
    expect(parseView('#/leadmagnets')).toBe('generator');
    expect(parseView('#/../etc/passwd')).toBe('generator');
    expect(parseView('#/<script>')).toBe('generator');
  });

  it('ignores case and stray whitespace', () => {
    expect(parseView('#/Telegram')).toBe('telegram');
    expect(parseView('#/  telegram  ')).toBe('telegram');
  });

  it('resolves every section the sidebar offers', () => {
    for (const view of [
      'studio', 'generator', 'automations', 'telegram', 'scheduler', 'budget',
      'aishowcase', 'outro', 'templates', 'batch', 'history', 'audio', 'accounts', 'settings',
    ]) {
      expect(parseView(`#/${view}`)).toBe(view);
    }
  });
});
