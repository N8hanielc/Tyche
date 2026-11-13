import { dbUpsert, json, missingConfig, stripe, syncSubscription, verifyStripeSignature } from "@/server/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe → Tyche. Turns Tyche+ on/off. Subscribe this endpoint to:
 * checkout.session.completed, customer.subscription.created,
 * customer.subscription.updated, customer.subscription.deleted
 */
export async function POST(req: Request) {
  if (missingConfig().length) return json({ error: "Billing isn’t set up yet." }, 503);
  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET!)) {
    return json({ error: "Bad signature" }, 400);
  }
  const event = JSON.parse(raw) as { type: string; data: { object: Record<string, any> } };
  const obj = event.data.object;
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const userId = obj.client_reference_id || obj.metadata?.user_id;
        if (userId && obj.customer) await dbUpsert("billing_customers", { user_id: userId, stripe_customer_id: obj.customer, stripe_subscription_id: obj.subscription ?? null }, "user_id");
        if (obj.subscription) await syncSubscription(await stripe("GET", `/subscriptions/${obj.subscription}`));
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(obj as never);
        break;
    }
  } catch (e) {
    console.error("Tyche billing webhook failed", event.type, e);
    return json({ error: "Webhook handler failed" }, 500); // Stripe retries
  }
  return json({ received: true });
}
