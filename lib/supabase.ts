import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function getAuthenticatedHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Требуется авторизация');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  };
}

export interface Profile {
  id: string;
  email: string;
  ig_user_id: string | null;
  ig_access_token: string | null;
  timezone: string;
  publish_start_hour: number;
  publish_end_hour: number;
  created_at: string;
  updated_at: string;
  deepseek_api_key?: string;
  gemini_api_key?: string;
}

export interface PublishWindow {
  timezone: string;
  startHour: number;
  endHour: number;
}
