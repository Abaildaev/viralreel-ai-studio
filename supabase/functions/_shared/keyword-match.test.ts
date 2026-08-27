import { describe, expect, it } from 'vitest';
import {
  buildQuickReplyMessage,
  experimentBucket,
  type LeadMagnetRow,
  quickReplyParentEventId,
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
    ab_quick_reply_percent: 20,
    ab_quick_reply_text: 'Материал готов. Нажмите кнопку.',
    ab_quick_reply_button: 'Забрать базу',
    attachment_type: 'none',
    attachment_path: '',
    attachment_name: '',
    ...overrides,
  };
}

describe('comment Quick Reply experiment', () => {
  it('keeps the same person in a stable bucket', () => {
    expect(experimentBucket('instagram-user-42')).toBe(experimentBucket('instagram-user-42'));
    expect(selectCommentExperimentVariant(rule(), 'instagram-user-42'))
      .toBe(selectCommentExperimentVariant(rule(), 'instagram-user-42'));
  });

  it('honours zero, full rollout and missing-link safeguards', () => {
    expect(selectCommentExperimentVariant(rule({ ab_quick_reply_percent: 0 }), 'person'))
      .toBe('control');
    expect(selectCommentExperimentVariant(rule({ ab_quick_reply_percent: 100 }), 'person'))
      .toBe('quick_reply');
    expect(selectCommentExperimentVariant(rule({ ab_quick_reply_percent: 100, response_url: '' }), 'person'))
      .toBe('control');
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
});
