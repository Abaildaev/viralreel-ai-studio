import { describe, expect, it } from 'vitest';
import {
  describeInstagramError,
  getGraphBaseUrl,
  InstagramApiError,
  isVideoProcessingFailure,
} from './instagram';

/*
  Разбор ответов Graph решает, что показать владельцу аккаунта и стоит ли
  повторять запрос. Ошибиться здесь дорого в обе стороны: истёкший токен,
  принятый за временный сбой, крутится в повторах до упора, а лимит запросов,
  принятый за окончательный отказ, теряет лид, который дошёл бы через минуту.
*/

describe('getGraphBaseUrl', () => {
  /* Токены Instagram Login и токены страницы Facebook живут на разных хостах,
     и различает их только префикс. */
  it('разводит токены по их хостам', () => {
    expect(getGraphBaseUrl('IGAAxxxx')).toContain('graph.instagram.com');
    expect(getGraphBaseUrl('EAAxxxx')).toContain('graph.facebook.com');
  });
});

describe('describeInstagramError', () => {
  it('узнаёт истёкший токен по коду и по тексту', () => {
    expect(describeInstagramError(new InstagramApiError('boom', 190)))
      .toContain('Токен Instagram истёк');
    expect(describeInstagramError(new Error('Session has expired')))
      .toContain('Токен Instagram истёк');
  });

  it('отделяет закрытую личку от удалённого получателя', () => {
    expect(describeInstagramError(new InstagramApiError('x', 551)))
      .toContain('закрыл личные сообщения');
    expect(describeInstagramError(new InstagramApiError('x', undefined, 2534022)))
      .toContain('не нашёл получателя');
  });

  it('распознаёт окно в 24 часа', () => {
    expect(describeInstagramError(new Error('outside of allowed window')))
      .toContain('больше 24 часов');
    expect(describeInstagramError(new InstagramApiError('x', undefined, 2534014)))
      .toContain('больше 24 часов');
  });

  /* Instagram отвечает на языке аккаунта: эта строка пришла с боевого
     аккаунта в японской локали и без явной проверки читалась как «неизвестная
     ошибка». */
  it('понимает отказ приватного ответа, пришедший не по-английски', () => {
    expect(describeInstagramError(new Error('プライベート返信には無効なコメントです')))
      .toContain('не разрешает приватный ответ');
  });

  it('собирает все коды лимита запросов в одно объяснение', () => {
    for (const code of [4, 17, 32, 613]) {
      expect(describeInstagramError(new InstagramApiError('x', code)))
        .toContain('лимит запросов');
    }
  });

  it('не подменяет собой незнакомую ошибку', () => {
    expect(describeInstagramError(new Error('Что-то совсем новое')))
      .toBe('Что-то совсем новое');
    expect(describeInstagramError('строка вместо ошибки')).toBe('строка вместо ошибки');
  });

  /* Порядок проверок — часть поведения: у ошибки может совпасть и код, и
     текст, и владелец должен увидеть более конкретную причину. */
  it('ставит код выше совпадения по тексту', () => {
    const both = new InstagramApiError('rate limit reached', 190);
    expect(describeInstagramError(both)).toContain('Токен Instagram истёк');
  });
});

describe('isVideoProcessingFailure', () => {
  it('узнаёт отказ обработки на обоих языках', () => {
    expect(isVideoProcessingFailure(new Error('Video processing failed'))).toBe(true);
    expect(isVideoProcessingFailure(new Error('Видео не прошло обработку'))).toBe(true);
  });

  it('не принимает за него прочие ошибки', () => {
    expect(isVideoProcessingFailure(new Error('rate limit'))).toBe(false);
    expect(isVideoProcessingFailure(null)).toBe(false);
  });
});
