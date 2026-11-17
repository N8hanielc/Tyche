import { dbRpc, dbUpsert, json, missingConfig, stripe, syncSubscription, userIdForSubscription, verifyStripeSignature } from "@/server/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe → Tyche. Turns Tyche+ on/off. Subscribe this endpoint to:
 * checkout.session.completed, customer.subscription.created,
 * customer.subscription.updated, customer.subscription.deleted,
 * invoice.paid, invoice.payment_failed, customer.subscription.trial_will_end
 *
 * Stripe can deliver events late or out of order, so every handler re-reads the
 * subscription from Stripe and applies its *current* state, never the payload's.
 */
export async function POST(req: Request) {
  if (missingConfig().length) return json({ error: `Billing isn’t set up yet. Missing on the server: ${missingConfig().join(", ")}` }, 503);
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
        await syncSubscription(await stripe("GET", `/subscriptions/${obj.id}`));
        break;
      case "customer.subscription.trial_will_end": {
        // Stripe sends this 3 days before a trial ends: remind the member in the app
        const sub = await stripe("GET", `/subscriptions/${obj.id}`);
        const userId = await userIdForSubscription(sub as never);
        if (userId && sub.status === "trialing" && !sub.cancel_at_period_end && sub.trial_end) {
          const when = new Date(sub.trial_end * 1000).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" });
          const amount = sub.items?.data?.[0]?.price;
          const price = amount?.unit_amount != null ? `$${(amount.unit_amount / 100).toFixed(2)}/${amount.recurring?.interval ?? "period"}` : "the Tyche+ price";
          await dbRpc("billing_notice", { uid: userId, body: `Heads up: your Tyche+ free trial ends ${when}. You’ll be charged ${price} unless you cancel before then in Profile → Settings → Manage Tyche+.` });
        }
        break;
      }
      case "invoice.paid": // renewal: extends Plus to the new period end
      case "invoice.payment_failed": { // card declined: status becomes past_due (3-day grace), then Stripe retries
        const subId = obj.parent?.subscription_details?.subscription ?? obj.subscription;
        if (subId) await syncSubscription(await stripe("GET", `/subscriptions/${subId}`));
        break;
      }
    }
  } catch (e) {
    console.error("Tyche billing webhook failed", event.type, e);
    return json({ error: "Webhook handler failed" }, 500); // Stripe retries
  }
  return json({ received: true });
}
