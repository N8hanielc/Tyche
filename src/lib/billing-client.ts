import { supabase } from "@/lib/supabase";
import type { Plan } from "./types";

async function post(path: string, body: unknown): Promise<string> {
  const { data } = await supabase!.auth.getSession();
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(body),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.url) throw new Error(out.error || "Something went wrong. Try again.");
  return out.url as string;
}

/** Sends the user to Stripe Checkout for Tyche+. */
export async function startCheckout(plan: Plan) {
  window.location.href = await post("/api/billing/checkout", { plan });
}

/** Opens Stripe's billing portal (change plan, card, cancel). */
export async function openBillingPortal() {
  window.location.href = await post("/api/billing/portal", {});
}
