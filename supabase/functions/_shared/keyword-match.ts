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
}

export const LEAD_MAGNET_COLUMNS =
  "id,instagram_account_id,title,description,codeword,keywords,reply_text,direct_reply_variants,response_url," +
  "button_text,match_mode,trigger_dm,trigger_comments,public_reply_enabled," +
  "public_reply_variants,media_scope,media_ids,repeat_delay_hours,reply_delay_seconds";

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

export function buildReplyText(leadMagnet: LeadMagnetRow): string {
  const variants = (leadMagnet.direct_reply_variants ?? [])
    .map((value) => value.trim())
    .filter(Boolean);
  const fallback = leadMagnet.description
    ? `Вот ваш материал «${leadMagnet.title}».\n\n${leadMagnet.description}`
    : `Вот ваш материал «${leadMagnet.title}».`;
  const selected = variants.length
    ? variants[Math.floor(Math.random() * variants.length)]
    : leadMagnet.reply_text.trim() || fallback;
  return truncateUtf8(selected, 640);
}

export function buildDirectMessage(leadMagnet: LeadMagnetRow, replyText = buildReplyText(leadMagnet)): Record<string, unknown> {
  const text = replyText;
  const url = leadMagnet.response_url.trim();
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
          title: truncateUtf8(leadMagnet.button_text.trim() || "Получить материал", 20),
        }],
      },
    },
  };
}
