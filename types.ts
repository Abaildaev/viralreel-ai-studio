export type FontFamily = 'Inter' | 'Merriweather' | 'Georgia' | 'GenShinGothic' | 'OpenSerif' | 'Roboto';
export type TextAlign = 'left' | 'center' | 'right';
export type AiModelType = 'claude' | 'chatgpt' | 'gemini' | 'none';
export type AiShowcaseStyle = 'white-badge' | 'emoji-white' | 'figma-ai' | 'dark-card' | 'plain-white' | 'ai-card';
export type BgStyle = 'none' | 'glass' | 'solid-black' | 'solid-white' | 'quote-white' | 'bank-transfer' | 'ai-showcase' | 'white-badge';
export type FontWeight = '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
export type CtaType = 'codeword' | 'telegram' | 'instagram';
export type ReelFormat = 'ai-story';
export type ReelOutputMode = 'both' | 'headline' | 'clean';

/**
 * Shape returned to the browser. `access_token` is intentionally missing — the
 * database does not grant it to the `authenticated` role, only Edge Functions
 * running with the service role can read it.
 */
export interface InstagramAccount {
  id: string;
  user_id: string;
  account_name: string;
  username: string;
  ig_user_id: string;
  profile_picture_url: string;
  is_active: boolean;
  webhook_subscribed_at?: string | null;
  webhook_error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduledPost {
  id: string;
  user_id: string;
  instagram_account_id: string | null;
  video_path: string | null;
  caption: string;
  hook_text: string;
  font_settings: Record<string, unknown>;
  scheduled_at: string | null;
  status: 'draft' | 'pending' | 'publishing' | 'published' | 'failed';
  instagram_media_id: string | null;
  error_message: string | null;
  created_at: string;
  published_at: string | null;
  instagram_accounts?: InstagramAccount;
}

export interface ViralVariation {
  id: string;
  hookText: string;
  captionText: string;
  status: 'pending' | 'approved' | 'rejected' | 'sent';
  font: FontFamily;
  fontSize: number;
  fontWeight: FontWeight;
  textAlign: TextAlign;
  textShadow: boolean;
  bgStyle: BgStyle;
  bgOpacity: number;
  posX: number;
  posY: number;
  videoScale: number;
  videoPanX: number;
  videoPanY: number;
  showCarouselBait: boolean;
  carouselBaitPosY: number;
  bankAmount?: string;
  aiModel?: AiModelType;
  showcaseStyle?: AiShowcaseStyle;
  showcaseEmoji?: string;
  textRotation?: number;
  uniquifierEnabled?: boolean;
  uniquifierIntensity?: 'low' | 'medium' | 'high';
  trimStart?: number;
  trimEnd?: number;
  audioStartOffset?: number;
  reelFormat?: ReelFormat;
  variantKind?: 'headline' | 'clean';
}

export interface GeneratedContentResponse {
  variations: {
    hook: string;
    caption: string;
  }[];
}

export enum AppState {
  UPLOAD = 'UPLOAD',
  CONFIG = 'CONFIG',
  PREVIEW = 'PREVIEW',
}

export type AppView = 'generator' | 'scheduler' | 'accounts' | 'automations' | 'telegram' | 'audio' | 'settings' | 'templates' | 'batch' | 'history' | 'budget' | 'aishowcase';

export type AudioMode = 'from_video' | 'random' | 'specific';

export interface VideoTemplate {
  id: string;
  user_id: string;
  instagram_account_id: string | null;
  name: string;
  file_path: string;
  duration: number;
  file_size: number;
  has_audio: boolean;
  is_active: boolean;
  created_at: string;
}

export interface TextStylePreset {
  font: FontFamily;
  fontSize: number;
  fontWeight: FontWeight;
  textAlign: TextAlign;
  textShadow: boolean;
  bgStyle: BgStyle;
  bgOpacity: number;
  posX: number;
  posY: number;
  videoScale: number;
  videoPanX: number;
  videoPanY: number;
  showCarouselBait: boolean;
  carouselBaitPosY: number;
  bankAmount?: string;
  textRotation?: number;
  presetType?: 'standard' | 'ai_showcase';
  aiModel?: AiModelType;
  uniquifierEnabled?: boolean;
  uniquifierIntensity?: 'low' | 'medium' | 'high';
}

export interface BatchPreset {
  id: string;
  user_id: string;
  instagram_account_id: string | null;
  name: string;
  topics: string[];
  tone: string;
  cta_type: CtaType;
  audio_mode: AudioMode;
  audio_file_id: string | null;
  variations_count: number;
  text_style: TextStylePreset;
  schedule_interval_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  instagram_accounts?: InstagramAccount;
  audio_files?: AudioFile;
}

export interface AudioFile {
  id: string;
  user_id: string;
  name: string;
  file_path: string;
  duration: number;
  file_size: number;
  created_at: string;
}

export interface LeadMagnet {
  id: string;
  user_id: string;
  instagram_account_id: string | null;
  title: string;
  description: string;
  codeword: string;
  keywords: string[];
  reply_text: string;
  direct_reply_variants: string[];
  response_url: string;
  button_text: string;
  match_mode: 'exact' | 'contains';
  trigger_dm: boolean;
  trigger_comments: boolean;
  public_reply_enabled: boolean;
  public_reply_variants: string[];
  media_scope: 'all' | 'selected';
  media_ids: string[];
  repeat_delay_hours: number;
  reply_delay_seconds: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Aggregated per rule by the `lead_magnet_stats` view. */
export interface LeadMagnetStats {
  lead_magnet_id: string;
  sent_count: number;
  failed_count: number;
  ignored_count: number;
  last_sent_at: string | null;
}

/**
 * Per-account state of the comment/DM queue, from `instagram_queue_health`.
 *
 * Since processing moved out of the webhook, a backlog is a state the account
 * can sit in — throttled by Meta, expired token, stopped worker — and all of
 * those look the same from the outside: events simply stop appearing.
 */
export interface InstagramQueueHealth {
  instagram_account_id: string;
  username: string;
  pending_count: number;
  /** Pending but not yet due — a reply delay or a backoff, not a stall. */
  waiting_count: number;
  next_due_at: string | null;
  oldest_pending_at: string | null;
  failed_24h: number;
  sent_last_hour: number;
  sent_24h: number;
  max_attempts_pending: number | null;
}

export interface LeadMagnetInfo {
  id: string;
  title: string;
  description: string;
  codeword: string;
}

export interface ProductItem {
  id: string;
  name: string;
  price: string;
  description: string;
  features: string[];
  link?: string;
}

export interface ObjectionScript {
  id: string;
  objection: string; // e.g. "Дорого", "Нет времени", "Подумаю"
  suggestedAnswer: string;
}

export type SalesAgentGoal = 'consultation' | 'direct_sale' | 'collect_contact' | 'lead_qualification';
export type SalesAgentTone = 'friendly_expert' | 'energetic_mentor' | 'concise_consultant' | 'premium_concierge';

export interface AiSalesAgentConfig {
  id: string;
  instagram_account_id?: string | null;
  agentName: string;
  tone: SalesAgentTone;
  goal: SalesAgentGoal;
  customInstructions: string;
  businessDescription: string;
  products: ProductItem[];
  objections: ObjectionScript[];
  targetActionPrompt: string; // e.g. "Предложи записаться на бесплатный разбор в Telegram: @my_telegram"
  handoffKeywords: string[]; // e.g. "человек", "менеджер", "оператор", "позови человека"
  maxConsecutiveReplies: number;
  isEnabled: boolean;
}

export interface AiSalesMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: string;
  detectedIntent?: 'question' | 'objection' | 'ready_to_buy' | 'handoff_request' | 'greeting';
}

/* -------------------------------------------------------------------------- */
/* Telegram                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Shape returned to the browser. `bot_token_encrypted` and `webhook_secret` are
 * intentionally missing — column-level grants hide them from `authenticated`,
 * so `select('*')` fails and every query goes through TELEGRAM_BOT_COLUMNS.
 */
export interface TelegramBot {
  id: string;
  user_id: string;
  bot_username: string;
  bot_name: string;
  channel_id: string;
  channel_title: string;
  channel_username: string;
  channel_invite_url: string;
  is_active: boolean;
  webhook_set_at: string | null;
  last_error: string | null;
  subscriber_goal: number;
  created_at: string;
  updated_at: string;
}

export interface TelegramFunnel {
  id: string;
  user_id: string;
  telegram_bot_id: string;
  lead_magnet_id: string | null;
  name: string;
  /** Deep-link prefix: `t.me/<bot>?start=<slug>_<automation_event_id>`. */
  slug: string;
  welcome_text: string;
  require_subscription: boolean;
  subscribe_button_text: string;
  check_button_text: string;
  not_subscribed_text: string;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  lead_magnets?: LeadMagnetInfo | null;
}

/**
 * One message in a funnel's sequence.
 *
 * Everything the funnel says after the subscription gate is a step, which is
 * what lets one funnel be a single lead magnet and another a week-long course.
 */
export interface TelegramFunnelStep {
  id: string;
  user_id: string;
  funnel_id: string;
  position: number;
  /** Internal label. Never sent. */
  title: string;
  body: string;
  button_text: string;
  button_url: string;
  /** Wait before this step, counted from the previous one. */
  delay_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type TelegramSubscriberSource = 'instagram' | 'link' | 'channel';

export interface TelegramSubscriber {
  id: string;
  telegram_bot_id: string;
  funnel_id: string | null;
  automation_event_id: string | null;
  instagram_sender_igsid: string | null;
  telegram_user_id: string;
  username: string;
  first_name: string;
  source: TelegramSubscriberSource;
  started_at: string;
  subscribed_at: string | null;
  delivered_at: string | null;
  signed_up_at: string | null;
  /** Reached the end of the funnel's sequence. */
  sequence_done_at: string | null;
  unsubscribed_at: string | null;
  /** Left the channel. Distinct from `unsubscribed_at`, which means left the bot. */
  channel_left_at: string | null;
  is_blocked: boolean;
  last_message_at: string | null;
  created_at: string;
  telegram_funnels?: { name: string; slug: string } | null;
}

/* Defined next to the filters it selects, so a new segment cannot be added to
   one and forgotten in the other. Imported as well as re-exported, because the
   interfaces below refer to it by name. */
import type { BroadcastSegment } from './supabase/functions/_shared/broadcast-segments';

export type { BroadcastSegment };

export type BroadcastStatus =
  | 'draft'
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'cancelled';

export interface TelegramBroadcast {
  id: string;
  user_id: string;
  telegram_bot_id: string;
  title: string;
  message_text: string;
  button_text: string;
  button_url: string;
  disable_notification: boolean;
  segment: BroadcastSegment;
  segment_funnel_id: string | null;
  scheduled_at: string | null;
  status: BroadcastStatus;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/** Aggregated per funnel by the `telegram_funnel_stats` view. */
export interface TelegramFunnelStats {
  funnel_id: string;
  name: string;
  slug: string;
  started_count: number;
  subscribed_count: number;
  delivered_count: number;
  signed_up_count: number;
  from_instagram_count: number;
  blocked_count: number;
  channel_left_count: number;
  last_subscriber_at: string | null;
}
