export type FontFamily = 'Inter' | 'Merriweather' | 'Georgia' | 'GenShinGothic' | 'OpenSerif' | 'Roboto';
export type TextAlign = 'left' | 'center' | 'right';
export type AiModelType = 'claude' | 'chatgpt' | 'gemini' | 'none';
export type AiShowcaseStyle = 'white-badge' | 'emoji-white' | 'figma-ai' | 'dark-card' | 'plain-white' | 'ai-card';
export type BgStyle = 'none' | 'glass' | 'solid-black' | 'solid-white' | 'quote-white' | 'bank-transfer' | 'ai-showcase' | 'white-badge';
export type FontWeight = '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900';
export type CtaType = 'codeword' | 'telegram' | 'instagram';

export interface InstagramAccount {
  id: string;
  user_id: string;
  account_name: string;
  username: string;
  ig_user_id: string;
  access_token: string;
  profile_picture_url: string;
  is_active: boolean;
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

export type AppView = 'generator' | 'scheduler' | 'accounts' | 'audio' | 'settings' | 'templates' | 'batch' | 'history' | 'budget' | 'aishowcase';

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
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeadMagnetInfo {
  id: string;
  title: string;
  description: string;
  codeword: string;
}
