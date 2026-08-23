import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildDirectMessage,
  type LeadMagnetRow,
  pickDirectReply,
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
  direct_reply_buttons: [],
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
    const message = buildDirectMessage(
      leadMagnet,
      { text: 'Забирайте пак', buttonText: 'Открыть бот' },
      eventId,
    ) as {
      attachment: { payload: { buttons: Array<{ url: string }> } };
    };

    expect(message.attachment.payload.buttons[0].url).toBe(
      `https://t.me/daily_prompt_hub_bot?start=prompts_${eventId}`,
    );
  });
});

describe('a Direct variant and its button', () => {
  const withVariants = (variants: string[], buttons: string[]): LeadMagnetRow => ({
    ...leadMagnet,
    direct_reply_variants: variants,
    direct_reply_buttons: buttons,
    button_text: 'Кнопка правила',
  });

  /* Forces the pick to land on `index` of `total` non-blank variants. */
  const choose = (index: number, total: number) => {
    vi.spyOn(Math, 'random').mockReturnValue((index + 0.5) / total);
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the button that belongs to the variant it picked', () => {
    choose(1, 2);
    const reply = pickDirectReply(
      withVariants(['Первый', 'Второй'], ['Кнопка один', 'Кнопка два']),
    );

    expect(reply.text).toBe('Второй');
    expect(reply.buttonText).toBe('Кнопка два');
  });

  it('falls back to the rule button where a variant has none of its own', () => {
    choose(0, 2);
    const reply = pickDirectReply(
      withVariants(['Первый', 'Второй'], ['', 'Кнопка два']),
    );

    expect(reply.buttonText).toBe('Кнопка правила');
  });

  it('keeps the pairing when a variant in the middle is blank', () => {
    /*
      The blank one is skipped for the draw but still holds its place in the
      stored array. Renumbering around it would caption the third variant with
      the second one's button.
    */
    choose(1, 2);
    const reply = pickDirectReply(
      withVariants(
        ['Первый', '   ', 'Третий'],
        ['Кнопка один', 'Кнопка два', 'Кнопка три'],
      ),
    );

    expect(reply.text).toBe('Третий');
    expect(reply.buttonText).toBe('Кнопка три');
  });

  it('serves a rule saved before per-variant buttons existed', () => {
    const reply = pickDirectReply(withVariants(['Первый'], []));

    expect(reply.buttonText).toBe('Кнопка правила');
  });

  it('puts the chosen button on the message it builds', () => {
    const message = buildDirectMessage(
      withVariants(['Первый'], ['Кнопка один']),
    ) as { attachment: { payload: { buttons: Array<{ title: string }> } } };

    expect(message.attachment.payload.buttons[0].title).toBe('Кнопка один');
  });
});

describe('the button title Meta receives', () => {
  const withButton = (title: string): LeadMagnetRow => ({
    ...leadMagnet,
    direct_reply_variants: ['Забирайте пак'],
    direct_reply_buttons: [title],
  });
  const titleOf = (row: LeadMagnetRow) =>
    (buildDirectMessage(row) as {
      attachment: { payload: { buttons: Array<{ title: string }> } };
    }).attachment.payload.buttons[0].title;

  it('lets a Russian title through whole', () => {
    // Nineteen letters is thirty-five bytes: a byte cap would have halved it.
    expect(titleOf(withButton('Забрать базу и тест'))).toBe('Забрать базу и тест');
  });

  it('cuts at twenty characters, which is what Meta counts', () => {
    expect(titleOf(withButton('Забрать базу и тест прямо сейчас'))).toBe('Забрать базу и тест ');
  });

  it('never splits an emoji in half', () => {
    const title = titleOf(withButton('Забрать промпты 🔥🚀'));
    expect(title).toBe('Забрать промпты 🔥🚀');
    expect(Array.from(title)).toHaveLength(18);
  });
});
