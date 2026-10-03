import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ?? "";

export const isSupabaseConfigured = Boolean(url && publishableKey);

// Capture the redirect before the auth client consumes and clears its fragment.
const redirectParams = typeof window === "undefined"
  ? new URLSearchParams()
  : new URLSearchParams(window.location.hash.slice(1));
export const authLinkType = redirectParams.get("type");
export const authLinkError = redirectParams.has("error") || redirectParams.has("error_code");

export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  publishableKey || "placeholder",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
