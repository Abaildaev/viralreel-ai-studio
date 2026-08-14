import { createClient } from "npm:@supabase/supabase-js@2";
import { secretEquals } from "./crypto.ts";

export async function getAuthenticatedUser(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });

  const { data, error } = await client.auth.getUser();
  return error ? null : data.user;
}

export function createAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service configuration is missing");
  }
  return createClient(supabaseUrl, serviceRoleKey);
}

export function hasValidCronSecret(req: Request): Promise<boolean> {
  return secretEquals(req.headers.get("X-Cron-Secret"), Deno.env.get("CRON_SECRET"));
}
