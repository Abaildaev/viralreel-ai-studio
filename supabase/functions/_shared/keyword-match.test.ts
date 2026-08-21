import { describe, expect, it } from 'vitest';
import {
  buildDirectMessage,
  type LeadMagnetRow,
  withAutomationEventId,
} from './keyword-match';

const eventId = '123e4567-e89b-12d3-a456-426614174000';

const leadMagnet: LeadMagnetRow = {
  id: 'rule-1',
  instagram_account_id: null,
  title: 'Пак промптов',
  description: '',
  codeword: 'промпт',
  keywords: ['промпт'],
  reply_text: 'Забирайте пак',
  direct_reply_variants: ['Забирайте пак'],
  response_url: 'https://t.me/daily_prompt_hub_bot?start=prompts',
  button_text: 'Открыть бот',
  match_mode: 'contains',
  trigger_dm: true,
  trigger_comments: true,
  public_reply_enabled: true,
  public_reply_variants: ['Отправил в Direct'],
  media_scope: 'all',
  media_ids: [],
  repeat_delay_hours: 24,
  reply_delay_seconds: 5,
  attachment_type: 'none',
  attachment_path: '',
  attachment_name: '',
};

describe('Instagram to Telegram attribution', () => {
  it('appends the automation event id to a Telegram start payload', () => {
    expect(withAutomationEventId(leadMagnet.response_url, eventId)).toBe(
      `https://t.me/daily_prompt_hub_bot?start=prompts_${eventId}`,
    );
  });

  it('replaces the UI attribution placeholder when present', () => {
    expect(
      withAutomationEventId(
        'https://t.me/daily_prompt_hub_bot?start=prompts_{{event_id}}',
        eventId,
      ),
    ).toBe(`https://t.me/daily_prompt_hub_bot?start=prompts_${eventId}`);
  });

  it('leaves a payload the bot already treats as tracked alone', () => {
    /* `parseStartPayload` accepts any hex in this shape, so a stricter test
       here would append a second id and produce a payload the bot then
       refuses to attribute at all. */
    const tracked =
      'https://t.me/daily_prompt_hub_bot?start=prompts_00000000-0000-0000-0000-000000000000';
    expect(withAutomationEventId(tracked, eventId)).toBe(tracked);
  });

  it('does not alter non-Telegram material links', () => {
    expect(withAutomationEventId('https://example.com/guide.pdf', eventId)).toBe(
      'https://example.com/guide.pdf',
    );
  });

  it('uses the tracked URL in the Instagram button template', () => {
    const message = buildDirectMessage(leadMagnet, 'Забирайте пак', eventId) as {
      attachment: { payload: { buttons: Array<{ url: string }> } };
    };

    expect(message.attachment.payload.buttons[0].url).toBe(
      `https://t.me/daily_prompt_hub_bot?start=prompts_${eventId}`,
    );
  });
});
