import { TRIAL_DAYS, blockedRegion, dbSelect, dbUpsert, json, missingConfig, priceFor, stripe, userFromRequest, type Plan } from "@/server/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Starts a Stripe Checkout session for Tyche+ and returns its URL. */
export async function POST(req: Request) {
  if (missingConfig().length) return json({ error: "Billing isn’t set up yet." }, 503);
  const user = await userFromRequest(req);
  if (!user) return json({ error: "Sign in to subscribe." }, 401);
  if (blockedRegion(req)) return json({ error: "Tyche+ isn’t available in your state yet." }, 451);

  const { plan } = (await req.json().catch(() => ({}))) as { plan?: Plan };
  const price = plan ? priceFor(plan) : undefined;
  if (!plan || !price) return json({ error: plan === "crew" ? "Crew plans are coming soon." : "Unknown plan." }, 400);

  const [profile] = await dbSelect<{ trial_used: boolean; plus: { renewsAt?: number } | null }>("profiles", `id=eq.${user.id}&select=trial_used,plus`);
  if (profile?.plus?.renewsAt && profile.plus.renewsAt > Date.now()) return json({ error: "You’re already on Tyche+." }, 409);

  // one Stripe customer per Tyche user
  const [existing] = await dbSelect<{ stripe_customer_id: string }>("billing_customers", `user_id=eq.${user.id}&select=stripe_customer_id`);
  let customer = existing?.stripe_customer_id;
  if (!customer) {
    const c = await stripe("POST", "/customers", { email: user.email, metadata: { user_id: user.id } });
    customer = c.id as string;
    await dbUpsert("billing_customers", { user_id: user.id, stripe_customer_id: customer }, "user_id");
  }

  const origin = req.headers.get("origin") || new URL(req.url).origin;
  const session = await stripe("POST", "/checkout/sessions", {
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ price, quantity: 1 }],
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { user_id: user.id, plan },
      ...(profile && !profile.trial_used ? { trial_period_days: TRIAL_DAYS } : {}),
    },
    metadata: { user_id: user.id, plan },
    success_url: `${origin}/?plus=success`,
    cancel_url: `${origin}/?plus=canceled`,
  });
  return json({ url: session.url });
}
