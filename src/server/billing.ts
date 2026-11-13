import crypto from "node:crypto";

/**
 * Server-only Stripe + Supabase helpers for Tyche+ billing.
 * Uses Stripe's REST API directly (no SDK) and Supabase's REST API with the
 * service-role key. Never import this file from client components.
 *
 * Required env vars (Vercel → Settings → Environment Variables):
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY,
 *   SUPABASE_SERVICE_ROLE_KEY
 * Optional: BILLING_BLOCKED_REGIONS (default "US-WA"), STRIPE_PRICE_CREW
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://xezjxqwatubyzxqwnibp.supabase.co";
export const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_Z7D1K294UZ1GZJj3M-zf_g_0dbE8ngp";

export type Plan = "monthly" | "yearly" | "crew";
export const TRIAL_DAYS = 7;

export function priceFor(plan: Plan): string | undefined {
  return { monthly: process.env.STRIPE_PRICE_MONTHLY, yearly: process.env.STRIPE_PRICE_YEARLY, crew: process.env.STRIPE_PRICE_CREW }[plan];
}
export function planForPrice(priceId: string | undefined): Plan {
  if (priceId && priceId === process.env.STRIPE_PRICE_YEARLY) return "yearly";
  if (priceId && priceId === process.env.STRIPE_PRICE_CREW) return "crew";
  return "monthly";
}

export function missingConfig(): string[] {
  return ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_MONTHLY", "STRIPE_PRICE_YEARLY", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !process.env[k]);
}

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// ---------------- Stripe ----------------

function form(params: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === "object" ? out.push(...form(item as Record<string, unknown>, `${key}[${i}]`)) : out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`)));
    else if (typeof v === "object") out.push(...form(v as Record<string, unknown>, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

export async function stripe<T = Record<string, any>>(method: "GET" | "POST", path: string, params?: Record<string, unknown>): Promise<T> {
  const body = params && method === "POST" ? form(params).join("&") : undefined;
  const qs = params && method === "GET" ? `?${form(params).join("&")}` : "";
  const res = await fetch(`https://api.stripe.com/v1${path}${qs}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe error ${res.status}`);
  return data as T;
}

/** Verifies a Stripe-Signature header (v1 scheme, 5-minute tolerance). */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, toleranceSec = 300, now = Date.now()): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]).filter((x) => x.length === 2).map(([k, v]) => [k.trim(), v]));
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const sigs = header.split(",").filter((p) => p.trim().startsWith("v1=")).map((p) => p.trim().slice(3));
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

// ---------------- Supabase (service role) ----------------

/** Service-role headers. New-style keys (sb_secret_…) go in `apikey` only; legacy JWT keys also go in Authorization. */
const admin = (): Record<string, string> => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return key.startsWith("sb_secret_")
    ? { apikey: key, "Content-Type": "application/json" }
    : { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
};

/** Returns the signed-in user for a Supabase access token, or null. */
export async function userFromRequest(req: Request): Promise<{ id: string; email: string } | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const u = await res.json();
  return u?.id ? { id: u.id, email: u.email ?? "" } : null;
}

export async function dbSelect<T = Record<string, any>>(table: string, query: string): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: admin() });
  if (!res.ok) throw new Error(`Supabase ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function dbUpsert(table: string, row: Record<string, unknown>, onConflict: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST",
    headers: { ...admin(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`Supabase upsert ${table}: ${res.status} ${await res.text()}`);
}

export async function dbRpc(fn: string, args: Record<string, unknown>) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: admin(), body: JSON.stringify(args) });
  if (!res.ok) throw new Error(`Supabase rpc ${fn}: ${res.status} ${await res.text()}`);
}

// ---------------- Subscription → Plus state ----------------

type StripeSub = {
  id: string;
  customer: string;
  status: string;
  start_date?: number;
  trial_end?: number | null;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data: { price?: { id: string }; current_period_end?: number }[] };
};

/** Maps a Stripe subscription to the `plus` JSON the app reads (null = not Plus). */
export function plusFromSubscription(sub: StripeSub) {
  const live = ["active", "trialing", "past_due"].includes(sub.status);
  if (!live) return null;
  const item = sub.items?.data?.[0];
  // Newer Stripe API versions moved current_period_end onto the subscription item.
  const periodEnd = sub.current_period_end ?? item?.current_period_end ?? 0;
  const graceMs = sub.status === "past_due" ? 3 * 86_400_000 : 0;
  return {
    plan: planForPrice(item?.price?.id),
    startedAt: (sub.start_date ?? 0) * 1000,
    ...(sub.status === "trialing" && sub.trial_end ? { trialEndsAt: sub.trial_end * 1000 } : {}),
    renewsAt: periodEnd * 1000 + graceMs,
    canceled: !!sub.cancel_at_period_end,
    status: sub.status,
  };
}

export async function userIdForSubscription(sub: StripeSub): Promise<string | null> {
  if (sub.metadata?.user_id) return sub.metadata.user_id;
  const rows = await dbSelect<{ user_id: string }>("billing_customers", `stripe_customer_id=eq.${encodeURIComponent(sub.customer)}&select=user_id`);
  return rows[0]?.user_id ?? null;
}

export async function syncSubscription(sub: StripeSub) {
  const userId = await userIdForSubscription(sub);
  if (!userId) return;
  await dbUpsert("billing_customers", { user_id: userId, stripe_customer_id: sub.customer, stripe_subscription_id: sub.id, updated_at: new Date().toISOString() }, "user_id");
  await dbRpc("apply_billing", { uid: userId, plus_state: plusFromSubscription(sub) });
}

/** Blocks checkout in regions you choose (default: Washington State). */
export function blockedRegion(req: Request): boolean {
  const country = req.headers.get("x-vercel-ip-country") ?? "";
  const region = req.headers.get("x-vercel-ip-country-region") ?? "";
  const blocked = (process.env.BILLING_BLOCKED_REGIONS ?? "US-WA").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  return blocked.includes(`${country}-${region}`.toUpperCase()) || blocked.includes(country.toUpperCase());
}
