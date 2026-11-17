import { dbSelect, json, missingConfig, stripe, userFromRequest } from "@/server/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Opens Stripe's customer portal (change plan, update card, cancel). */
export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    console.error("Tyche billing portal failed", e);
    return json({ error: `Billing error: ${e instanceof Error ? e.message : String(e)}` }, 500);
  }
}

async function handle(req: Request) {
  if (missingConfig().length) return json({ error: `Billing isn’t set up yet. Missing on the server: ${missingConfig().join(", ")}` }, 503);
  const user = await userFromRequest(req);
  if (!user) return json({ error: "Sign in first." }, 401);
  const [row] = await dbSelect<{ stripe_customer_id: string }>("billing_customers", `user_id=eq.${user.id}&select=stripe_customer_id`);
  if (!row) return json({ error: "No subscription found." }, 404);
  const origin = req.headers.get("origin") || new URL(req.url).origin;
  const session = await stripe("POST", "/billing_portal/sessions", { customer: row.stripe_customer_id, return_url: `${origin}/` });
  return json({ url: session.url });
}
