import { describe, expect, it } from 'vitest';
import { personalize, resolveFirstName } from './personalize';

describe('resolveFirstName', () => {
  /* Ровно те значения, что лежат в instagram_contacts боевого аккаунта: две
     пятых имён настоящие, остальное — ники и стилизованный юникод. */
  it('берёт первое слово настоящего имени', () => {
    expect(resolveFirstName('Кирилл Селиверстов', '_seliverstov')).toBe('Кирилл');
    expect(resolveFirstName('George Novik', 'novikgt')).toBe('George');
  });

  it('отказывается от ников, записанных строчными', () => {
    expect(resolveFirstName('ylua', 'u1k4_')).toBeNull();
    expect(resolveFirstName('officiant', 'agent_jry')).toBeNull();
  });

  it('отказывается от математического юникода', () => {
    expect(resolveFirstName('𝓐𝓭𝓪𝓶 𝓓𝓸𝓻𝓸𝓯𝔂', '_constance11_')).toBeNull();
  });

  it('не принимает ник за имя, даже с большой буквы', () => {
    expect(resolveFirstName('Novikgt', 'novikgt')).toBeNull();
  });

  it('снимает эмодзи и держится границ длины', () => {
    expect(resolveFirstName('Аня 🌸', 'anya')).toBe('Аня');
    expect(resolveFirstName('А', 'a')).toBeNull();
    expect(resolveFirstName('Александринаннадарьямарья', 'x')).toBeNull();
  });

  it('переживает пустое и отсутствующее значение', () => {
    expect(resolveFirstName(null)).toBeNull();
    expect(resolveFirstName('   ')).toBeNull();
    expect(resolveFirstName('123', 'x')).toBeNull();
  });
});

describe('personalize', () => {
  it('подставляет имя', () => {
    expect(personalize('Всё, {имя}, отправил в лс', 'Кирилл'))
      .toBe('Всё, Кирилл, отправил в лс');
    expect(personalize('{имя}, лови ссылку', 'Аня')).toBe('Аня, лови ссылку');
  });

  it('убирает обращение вместе с его запятой', () => {
    expect(personalize('Всё, {имя}, отправил в лс', null)).toBe('Всё, отправил в лс');
  });

  it('поднимает регистр, когда обращение стояло первым', () => {
    expect(personalize('{имя}, лови ссылку', null)).toBe('Лови ссылку');
  });

  it('не оставляет двойных пробелов и висящей пунктуации', () => {
    expect(personalize('Готово, {имя}! Скинул', null)).toBe('Готово! Скинул');
    expect(personalize('Отправил {имя} в Direct', null)).toBe('Отправил в Direct');
  });

  it('оставляет текст без плейсхолдера нетронутым', () => {
    expect(personalize('Отправил в Direct', null)).toBe('Отправил в Direct');
    expect(personalize('Отправил в Direct', 'Аня')).toBe('Отправил в Direct');
  });
});
