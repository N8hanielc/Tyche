import { dbSelect, json, missingConfig, stripe, userFromRequest } from "@/server/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Opens Stripe's customer portal (change plan, update card, cancel). */
export async function POST(req: Request) {
  if (missingConfig().length) return json({ error: "Billing isn’t set up yet." }, 503);
  const user = await userFromRequest(req);
  if (!user) return json({ error: "Sign in first." }, 401);
  const [row] = await dbSelect<{ stripe_customer_id: string }>("billing_customers", `user_id=eq.${user.id}&select=stripe_customer_id`);
  if (!row) return json({ error: "No subscription found." }, 404);
  const origin = req.headers.get("origin") || new URL(req.url).origin;
  const session = await stripe("POST", "/billing_portal/sessions", { customer: row.stripe_customer_id, return_url: `${origin}/` });
  return json({ url: session.url });
}
