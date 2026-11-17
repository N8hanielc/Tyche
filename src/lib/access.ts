import { REMOTE, supabase } from "@/lib/supabase";

/**
 * Invite-only mode. Turned on/off and passwords managed in /admin → Access.
 * The password someone entered is remembered on their device and re-checked
 * (without counting a use) every time the app opens, so a disabled password
 * locks the app again.
 */
const KEY = "tyche:invite";
/** Demo (offline preview) only. */
export const DEMO_INVITE_PASSWORD = "tyche";

export function storedInvite(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function store(code: string | null) {
  try {
    if (code) localStorage.setItem(KEY, code);
    else localStorage.removeItem(KEY);
  } catch {}
}

/** Is the app currently invite-only? Fails open: sign-ups are still checked by the database. */
export async function inviteOnly(): Promise<boolean> {
  if (!REMOTE || !supabase) return true;
  const { data, error } = await supabase.rpc("access_status");
  if (error) return false;
  return !!(data as { inviteOnly?: boolean } | null)?.inviteOnly;
}

/** Checks a password. Throws with a readable message (e.g. too many tries). */
export async function checkInvite(code: string, countUse = true): Promise<boolean> {
  const clean = code.trim();
  let ok: boolean;
  if (!REMOTE || !supabase) ok = clean.toLowerCase() === DEMO_INVITE_PASSWORD;
  else {
    const { data, error } = await supabase.rpc("access_check", { code: clean, count_use: countUse });
    if (error) throw new Error(error.message);
    ok = data === true;
  }
  store(ok ? clean : countUse ? storedInvite() : null);
  return ok;
}

/** Already unlocked on this device with a password that still works? */
export async function hasAccess(): Promise<boolean> {
  if (!(await inviteOnly())) return true;
  const code = storedInvite();
  if (!code) return false;
  try {
    return await checkInvite(code, false);
  } catch {
    return false;
  }
}

export async function requestInvite(name: string, email: string, note: string): Promise<void> {
  if (!REMOTE || !supabase) return;
  const { error } = await supabase.rpc("request_invite", { full_name: name, email_addr: email, msg: note || null });
  if (error) throw new Error(error.message);
}
