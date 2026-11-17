import { SUPABASE_URL, dbRpc, dbSelect, json, stripe, userFromRequest } from "@/server/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const admin = (): Record<string, string> => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return key.startsWith("sb_secret_") ? { apikey: key, "Content-Type": "application/json" } : { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
};

/** Lists every file under a storage folder, recursing into sub-folders. */
async function listFiles(prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/media`, {
      method: "POST",
      headers: admin(),
      body: JSON.stringify({ prefix, limit: 1000, offset }),
    });
    if (!res.ok) throw new Error(`Storage list: ${res.status} ${await res.text()}`);
    const items = (await res.json()) as { name: string; id: string | null }[];
    for (const it of items) {
      // folders come back with id = null
      if (it.id === null) out.push(...(await listFiles(`${prefix}/${it.name}`)));
      else out.push(`${prefix}/${it.name}`);
    }
    if (items.length < 1000) return out;
  }
}

/**
 * Permanently deletes the signed-in user's account:
 * cancels Tyche+, refunds stakes on their open challenges, removes every
 * uploaded photo, then deletes the login (which cascades to all their rows).
 */
export async function POST(req: Request) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Account deletion isn’t set up yet. Missing on the server: SUPABASE_SERVICE_ROLE_KEY" }, 503);
    const user = await userFromRequest(req);
    if (!user) return json({ error: "Sign in first." }, 401);

    // 1. stop billing right away
    if (process.env.STRIPE_SECRET_KEY) {
      const [row] = await dbSelect<{ stripe_customer_id: string; stripe_subscription_id: string | null }>(
        "billing_customers",
        `user_id=eq.${user.id}&select=stripe_customer_id,stripe_subscription_id`,
      ).catch(() => []);
      if (row?.stripe_customer_id) {
        const subs = await stripe<{ data: { id: string; status: string }[] }>("GET", "/subscriptions", { customer: row.stripe_customer_id, status: "all", limit: 20 });
        for (const s of subs.data) if (!["canceled", "incomplete_expired"].includes(s.status)) await stripe("DELETE", `/subscriptions/${s.id}`);
      }
    }

    // 2. give everyone else their points back on challenges that are about to disappear
    await dbRpc("delete_account_prepare", { uid: user.id });

    // 3. remove uploaded photos
    const files = await listFiles(user.id);
    for (let i = 0; i < files.length; i += 100) {
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/media`, { method: "DELETE", headers: admin(), body: JSON.stringify({ prefixes: files.slice(i, i + 100) }) });
      if (!res.ok) throw new Error(`Storage delete: ${res.status} ${await res.text()}`);
    }

    // 4. delete the login; the database cascades to the profile and everything they made
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, { method: "DELETE", headers: admin() });
    if (!res.ok) throw new Error(`Auth delete: ${res.status} ${await res.text()}`);

    return json({ deleted: true });
  } catch (e) {
    console.error("Tyche account delete failed", e);
    return json({ error: `Couldn’t delete your account: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
}
