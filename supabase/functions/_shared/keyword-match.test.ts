import { describe, expect, it } from 'vitest';
import {
  buildProfileLinkMessage,
  buildQuickReplyMessage,
  experimentBucket,
  type LeadMagnetRow,
  quickReplyParentEventId,
  quickReplyFollowup,
  selectCommentExperimentVariant,
} from './keyword-match';

const EVENT_ID = '123e4567-e89b-42d3-a456-426614174000';

function rule(overrides: Partial<LeadMagnetRow> = {}): LeadMagnetRow {
  return {
    id: 'rule-id',
    instagram_account_id: null,
    title: 'База промптов',
    description: '',
    codeword: 'ПРОМПТ',
    keywords: ['ПРОМПТ'],
    reply_text: 'Забирайте базу',
    direct_reply_variants: ['Забирайте базу'],
    direct_reply_buttons: ['Открыть базу'],
    response_url: 'https://t.me/example_bot?start=prompts',
    button_text: 'Открыть базу',
    match_mode: 'contains',
    trigger_dm: true,
    trigger_comments: true,
    public_reply_enabled: true,
    public_reply_variants: ['Отправил в Direct'],
    media_scope: 'all',
    media_ids: [],
    repeat_delay_hours: 24,
    reply_delay_seconds: 5,
    direct_ai_personalize: false,
    ab_quick_reply_percent: 20,
    ab_quick_reply_text: 'Материал готов. Нажмите кнопку.',
    ab_quick_reply_button: 'Забрать базу',
    ab_profile_reply_percent: 0,
    ab_profile_reply_text: 'Вижу комментарий. Ссылка в шапке профиля.',
    attachment_type: 'none',
    attachment_path: '',
    attachment_name: '',
    ...overrides,
  };
}

describe('comment delivery experiment', () => {
  it('keeps the same person in a stable bucket', () => {
    expect(experimentBucket('instagram-user-42')).toBe(experimentBucket('instagram-user-42'));
    expect(selectCommentExperimentVariant(rule(), 'instagram-user-42'))
      .toBe(selectCommentExperimentVariant(rule(), 'instagram-user-42'));
  });

  it('honours all three arms and disables only Quick Reply when the link is missing', () => {
    expect(selectCommentExperimentVariant(rule({ ab_quick_reply_percent: 0 }), 'person'))
      .toBe('control');
    expect(selectCommentExperimentVariant(rule({ ab_quick_reply_percent: 100 }), 'person'))
      .toBe('quick_reply');
    expect(selectCommentExperimentVariant(rule({ ab_quick_reply_percent: 100, response_url: '' }), 'person'))
      .toBe('control');
    expect(selectCommentExperimentVariant(rule({
      ab_quick_reply_percent: 0,
      ab_profile_reply_percent: 100,
      response_url: '',
    }), 'person')).toBe('profile_link');
  });

  it('builds and recognises an attributed Quick Reply payload', () => {
    const message = buildQuickReplyMessage(rule(), EVENT_ID) as {
      text: string;
      quick_replies: Array<{ title: string; payload: string }>;
    };

    expect(message.text).toContain('Материал готов');
    expect(message.quick_replies[0]).toEqual({
      content_type: 'text',
      title: 'Забрать базу',
      payload: `lead_ab:${EVENT_ID}`,
    });
    expect(quickReplyParentEventId({ message: { quick_reply: message.quick_replies[0] } }))
      .toBe(EVENT_ID);
    expect(quickReplyParentEventId({ message: { quick_reply: { payload: 'lead_ab:not-a-uuid' } } }))
      .toBeNull();
  });

  it('uses one clear, button-ready message after a Quick Reply click', () => {
    expect(quickReplyFollowup(rule())).toEqual({
      text:
        'Готово 🙌\n\nВот обещанный материал «База промптов».\n\nНажми кнопку «Открыть базу» ниже — доступ откроется сразу.',
      buttonText: 'Открыть базу',
    });
  });

  it('builds the profile-link arm as plain text without buttons', () => {
    const message = buildProfileLinkMessage(rule()) as { text: string };

    expect(message.text).toContain('Ссылка в шапке профиля');
    expect(message).not.toHaveProperty('quick_replies');
  });
});

describe('buildQuickReplyMessage с подменой текста', () => {
  /* Так уходит персонализированная доставка: слова от модели, но форма
     quick reply — то есть без ссылки в первом сообщении. */
  it('берёт текст и надпись из overrides', () => {
    const message = buildQuickReplyMessage(rule(), EVENT_ID, {
      text: 'Кирилл, лови — собрал каталог формул. Жми кнопку.',
      title: '1000+ схем',
    }) as { text: string; quick_replies: Array<{ title: string }> };

    expect(message.text).toBe('Кирилл, лови — собрал каталог формул. Жми кнопку.');
    expect(message.quick_replies[0].title).toBe('1000+ схем');
    expect(message).not.toHaveProperty('attachment');
  });

  it('падает обратно на текст сценария, когда подмены нет', () => {
    const message = buildQuickReplyMessage(rule(), EVENT_ID, {}) as { text: string };
    expect(message.text).toBe('Материал готов. Нажмите кнопку.');
  });
});
