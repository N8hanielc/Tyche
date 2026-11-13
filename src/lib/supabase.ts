import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase connection. The URL and publishable key are public by design
 * (security comes from row-level security + server functions in
 * supabase/schema.sql), so they're safe to ship as defaults.
 * Set NEXT_PUBLIC_TYCHE_LOCAL=1 to run the offline demo mode instead.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://xezjxqwatubyzxqwnibp.supabase.co";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_Z7D1K294UZ1GZJj3M-zf_g_0dbE8ngp";
const URL = SUPABASE_URL;
const KEY = SUPABASE_KEY;
const LOCAL = process.env.NEXT_PUBLIC_TYCHE_LOCAL === "1";

export const supabase: SupabaseClient | null = !LOCAL && URL && KEY ? createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" } }) : null;

/** True when the app talks to Supabase (real accounts, shared data). */
export const REMOTE = !!supabase;
