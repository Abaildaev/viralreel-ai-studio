import { describe, expect, it } from 'vitest';
import { buildOpenerPrompt, type OpenerBrief } from './direct-opener';

function brief(overrides: Partial<OpenerBrief> = {}): OpenerBrief {
  return {
    title: 'Каталог 1000+ промптов',
    description: 'Формулы под рекламу, людей и свет',
    examples: ['Забирай 1000+ готовых промптов!\n\nЖми кнопку ниже 👇'],
    name: 'Кирилл',
    comment: 'промпт',
    ...overrides,
  };
}

describe('buildOpenerPrompt', () => {
  it('передаёт имя и просит обратиться один раз', () => {
    const prompt = buildOpenerPrompt(brief());
    expect(prompt).toContain('Обратись по имени: Кирилл');
    expect(prompt).toContain('Ровно один раз');
  });

  /* Без этого запрета модель здоровается с «другом» и придумывает имена. */
  it('прямо запрещает выдумывать имя, когда его нет', () => {
    const prompt = buildOpenerPrompt(brief({ name: null }));
    expect(prompt).toContain('не выдумывай');
    expect(prompt).not.toContain('Обратись по имени');
  });

  it('кладёт в промпт материал и комментарий человека', () => {
    const prompt = buildOpenerPrompt(brief({ comment: 'хочу промпты' }));
    expect(prompt).toContain('Каталог 1000+ промптов');
    expect(prompt).toContain('«хочу промпты»');
  });

  it('запрещает ссылку в тексте — под сообщением уже есть кнопка', () => {
    expect(buildOpenerPrompt(brief())).toContain('Не вставляй ссылок');
  });

  it('переживает пустое описание и отсутствие комментария', () => {
    const prompt = buildOpenerPrompt(brief({ description: '  ', comment: '' }));
    expect(prompt).not.toContain('Подробности:');
    expect(prompt).not.toContain('Его комментарий:');
  });

  it('сворачивает примеры в одну строку, чтобы не рвать инструкцию', () => {
    const prompt = buildOpenerPrompt(brief());
    expect(prompt).toContain('— Забирай 1000+ готовых промптов! Жми кнопку ниже 👇');
  });
});
