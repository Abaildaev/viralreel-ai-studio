import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getAuthenticatedUser } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "POST request required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const user = await getAuthenticatedUser(req);
    if (!user) {
      return new Response(JSON.stringify({ valid: false, error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { ig_user_id, access_token } = body;

    if (!ig_user_id || !access_token) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: "Missing ig_user_id or access_token"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = access_token.startsWith("IGAA")
      ? "https://graph.instagram.com/v25.0"
      : "https://graph.facebook.com/v25.0";

    const response = await fetch(
      `${baseUrl}/${ig_user_id}?fields=id,username,name,profile_picture_url,followers_count,media_count&access_token=${access_token}`
    );

    const data = await response.json();

    if (data.error) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: data.error.message,
          error_code: data.error.code,
          error_type: data.error.type
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        valid: true,
        account_info: {
          id: data.id,
          username: data.username,
          name: data.name,
          profile_picture_url: data.profile_picture_url,
          followers_count: data.followers_count,
          media_count: data.media_count
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Verification error:", error);
    return new Response(
      JSON.stringify({
        valid: false,
        error: error.message
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
