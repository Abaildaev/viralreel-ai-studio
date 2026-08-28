/*
  One matching implementation, shared by the live webhook and the "test this
  automation" endpoint. If these ever diverge, the test panel starts lying about
  what will actually happen.
*/

export type TriggerType = "dm" | "comment";
export type MatchMode = "exact" | "contains";

export interface LeadMagnetRow {
  id: string;
  instagram_account_id: string | null;
  title: string;
  description: string;
  codeword: string;
  keywords: string[];
  reply_text: string;
  direct_reply_variants: string[];
  /* Button titles for those variants, aligned by index. Shorter than the
     variants, or empty, is normal: a gap falls back to `button_text`. */
  direct_reply_buttons: string[];
  response_url: string;
  button_text: string;
  match_mode: MatchMode;
  trigger_dm: boolean;
  trigger_comments: boolean;
  public_reply_enabled: boolean;
  public_reply_variants: string[];
  media_scope: "all" | "selected";
  media_ids: string[];
  repeat_delay_hours: number;
  reply_delay_seconds: number;
  ab_quick_reply_percent: number;
  ab_quick_reply_text: string;
  ab_quick_reply_button: string;
  ab_profile_reply_percent: number;
  ab_profile_reply_text: string;
  /* Писать ли текст Direct моделью под каждого человека. */
  direct_ai_personalize: boolean;
  /* The file sent after the Direct message. Declared inline rather than
     imported so this module stays dependency-free; the shape is the one in
     _shared/attachment.ts and `readAttachment` accepts it structurally. */
  attachment_type: string;
  attachment_path: string;
  attachment_name: string;
}

export const LEAD_MAGNET_COLUMNS =
  "id,instagram_account_id,title,description,codeword,keywords,reply_text,direct_reply_variants," +
  "direct_reply_buttons,response_url," +
  "button_text,match_mode,trigger_dm,trigger_comments,public_reply_enabled," +
  "public_reply_variants,media_scope,media_ids,repeat_delay_hours,reply_delay_seconds," +
  "ab_quick_reply_percent,ab_quick_reply_text,ab_quick_reply_button," +
  "ab_profile_reply_percent,ab_profile_reply_text,direct_ai_personalize," +
  "attachment_type,attachment_path,attachment_name";

export type CommentExperimentVariant = "control" | "quick_reply" | "profile_link";

const QUICK_REPLY_PAYLOAD_PREFIX = "lead_ab:";

/**
 * A stable, non-cryptographic bucket. The sender id is preferred by callers,
 * so one person stays in the same arm even when they comment on several Reels.
 */
export function experimentBucket(subject: string): number {
  let hash = 2166136261;
  for (const character of subject) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

export function selectCommentExperimentVariant(
  leadMagnet: LeadMagnetRow,
  subject: string,
): CommentExperimentVariant {
  const quickReplyPercent = leadMagnet.response_url.trim()
    ? Math.max(0, Math.min(100, leadMagnet.ab_quick_reply_percent ?? 0))
    : 0;
  const profilePercent = Math.max(
    0,
    Math.min(100 - quickReplyPercent, leadMagnet.ab_profile_reply_percent ?? 0),
  );
  const bucket = experimentBucket(subject);
  if (bucket < quickReplyPercent) return "quick_reply";
  if (bucket < quickReplyPercent + profilePercent) return "profile_link";
  return "control";
}

export function buildQuickReplyMessage(
  leadMagnet: LeadMagnetRow,
  automationEventId: string,
  /* Позволяет отправить эту же форму со своим текстом — так первое сообщение
     от ИИ уходит без ссылки, ровно как вариант A/B. */
  overrides: { text?: string; title?: string } = {},
): Record<string, unknown> {
  const text = overrides.text?.trim() || leadMagnet.ab_quick_reply_text.trim() ||
    "Материал готов 🙌 Нажмите кнопку ниже — и я сразу пришлю доступ.";
  const title = truncateChars(
    overrides.title?.trim() || leadMagnet.ab_quick_reply_button.trim() || "Забрать базу",
    BUTTON_TITLE_CHARS,
  );

  return {
    text: truncateUtf8(text, 640),
    quick_replies: [{
      content_type: "text",
      title,
      payload: `${QUICK_REPLY_PAYLOAD_PREFIX}${automationEventId}`,
    }],
  };
}

export function buildProfileLinkMessage(leadMagnet: LeadMagnetRow): Record<string, unknown> {
  const text = leadMagnet.ab_profile_reply_text.trim() ||
    "Вижу твой комментарий 👊\n\nСсылка на базу промптов — в шапке моего профиля.";
  return { text: truncateUtf8(text, 640) };
}

export function quickReplyParentEventId(rawEvent: Record<string, unknown>): string | null {
  const message = rawEvent?.message;
  if (!message || typeof message !== "object") return null;
  const quickReply = (message as Record<string, unknown>).quick_reply;
  if (!quickReply || typeof quickReply !== "object") return null;
  const payload = (quickReply as Record<string, unknown>).payload;
  if (typeof payload !== "string" || !payload.startsWith(QUICK_REPLY_PAYLOAD_PREFIX)) return null;

  const eventId = payload.slice(QUICK_REPLY_PAYLOAD_PREFIX.length);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(eventId)
    ? eventId
    : null;
}

export function normalizeText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleUpperCase("ru-RU");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Russian comments inflect the keyword — «гайд» arrives as «гайдом», «гайды»,
 * «#гайд». A strict word boundary drops all of those, so `contains` allows a
 * short grammatical suffix after the keyword. The prefix must still start a
 * word, otherwise «гайд» would fire on unrelated words that merely contain it.
 */
const MAX_INFLECTION_SUFFIX = 3;

export function matchesKeyword(text: string, keyword: string, mode: MatchMode): boolean {
  const normalizedText = normalizeText(text);
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedText || !normalizedKeyword) return false;
  if (mode === "exact") return normalizedText === normalizedKeyword;

  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}_])${escapeRegExp(normalizedKeyword)}\\p{L}{0,${MAX_INFLECTION_SUFFIX}}($|[^\\p{L}\\p{N}_])`,
    "u",
  );
  return pattern.test(normalizedText);
}

export function keywordsOf(leadMagnet: LeadMagnetRow): string[] {
  return leadMagnet.keywords?.length ? leadMagnet.keywords : [leadMagnet.codeword];
}

export interface MatchInput {
  triggerType: TriggerType;
  text: string;
  mediaId?: string;
}

export interface MatchResult {
  leadMagnet: LeadMagnetRow;
  keyword: string;
}

/**
 * Rules bound to a specific account win over account-agnostic ones; within the
 * same tier the first declared match wins.
 */
export function selectLeadMagnet(
  leadMagnets: LeadMagnetRow[],
  input: MatchInput,
): MatchResult | null {
  const ordered = [...leadMagnets].sort((left, right) =>
    Number(Boolean(right.instagram_account_id)) - Number(Boolean(left.instagram_account_id))
  );

  for (const leadMagnet of ordered) {
    const triggerEnabled = input.triggerType === "dm"
      ? leadMagnet.trigger_dm
      : leadMagnet.trigger_comments;
    if (!triggerEnabled) continue;

    // Media scoping only constrains comments; a DM is not tied to a post.
    const mediaEnabled = input.triggerType !== "comment" ||
      leadMagnet.media_scope !== "selected" ||
      Boolean(input.mediaId && leadMagnet.media_ids?.includes(input.mediaId));
    if (!mediaEnabled) continue;

    const keyword = keywordsOf(leadMagnet).find((candidate) =>
      matchesKeyword(input.text, candidate, leadMagnet.match_mode)
    );
    if (keyword) return { leadMagnet, keyword };
  }

  return null;
}

export function pickPublicReply(leadMagnet: LeadMagnetRow): string {
  const variants = (leadMagnet.public_reply_variants ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
  if (variants.length === 0) return "Отправил в Direct 🙌";
  return variants[Math.floor(Math.random() * variants.length)];
}

export function truncateUtf8(value: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  let result = "";
  let bytes = 0;
  for (const character of value) {
    const characterBytes = encoder.encode(character).length;
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return result;
}

export interface DirectReply {
  text: string;
  buttonText: string;
}

function defaultButtonText(leadMagnet: LeadMagnetRow): string {
  return leadMagnet.button_text.trim() || "Получить материал";
}

/**
 * The second message in the Quick Reply path must be unambiguous. Reusing a
 * random control-arm ad made a single click look like another broadcast and
 * hid the fact that the link was now available underneath it.
 */
export function quickReplyFollowup(leadMagnet: LeadMagnetRow): DirectReply {
  const materialTitle = truncateUtf8(
    leadMagnet.title.trim() || "Обещанный материал",
    120,
  );
  const buttonText = defaultButtonText(leadMagnet);

  return {
    text: truncateUtf8(
      `Готово 🙌\n\nВот обещанный материал «${materialTitle}».\n\nНажми кнопку «${buttonText}» ниже — доступ откроется сразу.`,
      640,
    ),
    buttonText,
  };
}

/**
 * Picks one Direct variant together with the button that belongs to it.
 *
 * The words and the button are chosen in one call rather than read separately,
 * because a caller that picked the text and then reached for `button_text`
 * would show one variant's promise under another variant's button — and the
 * test panel, which does exactly that, would report a message nobody will
 * receive.
 *
 * The two are stored as parallel arrays instead of one column of pairs: the
 * variants were there first, and a rule whose author never opened the button
 * fields has to keep working with the single one it already has. So an index
 * with nothing in it falls back to the rule's own button, and a list that has
 * drifted out of step costs one variant its button rather than failing.
 */
export function pickDirectReply(leadMagnet: LeadMagnetRow): DirectReply {
  /*
    The index is the one in the stored array, not in the filtered list.
    Dropping the blanks first would renumber everything after them and pair a
    variant with the button of whichever one happened to be blank.
  */
  const candidates = (leadMagnet.direct_reply_variants ?? [])
    .map((value, index) => ({ text: value.trim(), index }))
    .filter((candidate) => Boolean(candidate.text));

  if (candidates.length === 0) {
    const fallback = leadMagnet.description
      ? `Вот ваш материал «${leadMagnet.title}».\n\n${leadMagnet.description}`
      : `Вот ваш материал «${leadMagnet.title}».`;
    return {
      text: truncateUtf8(leadMagnet.reply_text.trim() || fallback, 640),
      buttonText: defaultButtonText(leadMagnet),
    };
  }

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];
  const paired = (leadMagnet.direct_reply_buttons ?? [])[chosen.index]?.trim();

  return {
    text: truncateUtf8(chosen.text, 640),
    buttonText: paired || defaultButtonText(leadMagnet),
  };
}

/*
  Meta counts a button title in characters, not in bytes.

  It used to be cut with `truncateUtf8`, which counts bytes — so a Cyrillic
  title, at two bytes a letter, lost half of itself before it ever left here:
  «Забрать базу и тест» arrived as «Забрать ба». The message text keeps its
  byte cap, which is a deliberate limit of our own well under Meta's, but the
  button has to be measured the way the platform measures it.

  Split with `Array.from` rather than by index, so an emoji is one character
  and never half of a surrogate pair.
*/
const BUTTON_TITLE_CHARS = 20;

export function truncateChars(value: string, maxChars: number): string {
  const characters = Array.from(value);
  return characters.length <= maxChars ? value : characters.slice(0, maxChars).join("");
}

const TELEGRAM_HOSTS = new Set(["t.me", "www.t.me", "telegram.me", "www.telegram.me"]);

/**
 * Carries the Instagram automation event through the Telegram deep link.
 *
 * The bot accepts `<slug>_<event uuid>`, but rules intentionally store only
 * the stable `<slug>` URL. Appending the id while the Direct message is built
 * gives every click its own attribution without rewriting the saved rule.
 */
export function withAutomationEventId(rawUrl: string, eventId?: string): string {
  const value = rawUrl.trim();
  if (!value || !eventId) return value;

  try {
    const url = new URL(value);
    if (!TELEGRAM_HOSTS.has(url.hostname.toLowerCase())) return value;

    const start = url.searchParams.get("start")?.trim();
    if (!start) return value;

    /* The editor no longer writes the placeholder form, but rules saved when
       it did are still out there, and leaving `{{event_id}}` in a start
       payload would break the link outright — Telegram accepts nothing but
       letters, digits, `_` and `-` after `?start=`. */
    const withoutPlaceholder = start.replace(/_\{\{event_id\}\}$/i, "");

    /* Deliberately the same loose shape `parseStartPayload` accepts on the
       other side. A stricter test here would append a second id to a payload
       the bot already considers tracked. */
    const alreadyTracked = /_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(withoutPlaceholder);
    if (alreadyTracked) return value;

    url.searchParams.set("start", `${withoutPlaceholder}_${eventId}`);
    return url.toString();
  } catch {
    return value;
  }
}

export function buildDirectMessage(
  leadMagnet: LeadMagnetRow,
  reply: DirectReply = pickDirectReply(leadMagnet),
  automationEventId?: string,
): Record<string, unknown> {
  const text = reply.text;
  const url = withAutomationEventId(leadMagnet.response_url, automationEventId);
  if (!url) return { text };

  return {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text,
        buttons: [{
          type: "web_url",
          url,
          title: truncateChars(reply.buttonText, BUTTON_TITLE_CHARS),
        }],
      },
    },
  };
}
