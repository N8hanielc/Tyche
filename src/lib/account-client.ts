import { REMOTE, supabase } from "@/lib/supabase";

/** Permanently deletes the signed-in account on the server. Throws with a readable message on failure. */
export async function deleteAccount(): Promise<void> {
  if (!REMOTE || !supabase) return; // offline demo: nothing on a server to delete
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/account/delete", {
    method: "POST",
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || "Couldn’t delete your account. Try again.");
  await supabase.auth.signOut().catch(() => {});
}
