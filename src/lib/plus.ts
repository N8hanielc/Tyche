import type { DB, ID, Plan, User } from "./types";

/**
 * Tyche+ rules in one place. Billing is simulated in the prototype; in
 * production this maps to App Store / Play subscriptions via RevenueCat,
 * with entitlement checks done server-side.
 *
 * Note: paid accounts receive larger daily point refills. Points never have
 * cash value and can't be redeemed or transferred for anything of value.
 * Get a gaming attorney's sign-off on this before launch (see README).
 */

export const PLANS: Record<Plan, { label: string; price: string; per: string; note?: string; monthly: string }> = {
  monthly: { label: "Monthly", price: "$4.99", per: "/month", monthly: "$4.99/mo" },
  yearly: { label: "Yearly", price: "$39.99", per: "/year", note: "Save 33%", monthly: "$3.33/mo" },
  crew: { label: "Crew", price: "$9.99", per: "/month", note: "Up to 8 people", monthly: "$1.25/person" },
};

export const DAILY = { free: 10, plus: 100 };
/** Minimum points to take a side on a points challenge (bragging-rights challenges are always free to join). */
export const MIN_STAKE = 50;

/** Days of free refills until `balance` reaches the minimum stake. */
export function daysToMinimum(u: User | undefined, balance: number, now = Date.now()) {
  const need = MIN_STAKE - balance;
  if (need <= 0) return 0;
  const per = isPlus(u) ? DAILY.plus : DAILY.free;
  const claims = Math.ceil(need / per);
  return claimState(u, now).ready ? claims - 1 : claims;
}
export const LIMITS = { openChallenges: 5, groups: 2 };
export const TRIAL_DAYS = 7;

export const isPlus = (u?: User) => !!u?.plus && u.plus.renewsAt > Date.now();

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function claimState(u: User | undefined, now = Date.now()) {
  const today = startOfDay(now);
  const ready = !u?.lastClaimAt || u.lastClaimAt < today;
  return { ready, amount: isPlus(u) ? DAILY.plus : DAILY.free, nextAt: today + 24 * 3_600_000 };
}

export function openChallenges(db: DB, userId: ID) {
  return db.challenges.filter((c) => c.creatorId === userId && c.status !== "settled").length;
}

export function ownedGroups(db: DB, userId: ID) {
  return db.groups.filter((g) => (g.ownerId ?? g.memberIds[0]) === userId).length;
}

/** Record between two users across settled challenges where they took different sides. */
export function headToHead(db: DB, a: ID, b: ID) {
  let wins = 0;
  let losses = 0;
  db.challenges.forEach((c) => {
    if (c.status !== "settled" || !c.result) return;
    const ea = c.entries.find((e) => e.userId === a);
    const eb = c.entries.find((e) => e.userId === b);
    if (!ea || !eb || ea.optionId === eb.optionId) return;
    if (ea.optionId === c.result.optionId) wins++;
    else if (eb.optionId === c.result.optionId) losses++;
  });
  return { wins, losses };
}

export type CardTheme = "classic" | "gold" | "neon" | "midnight";
export const CARD_THEMES: Record<CardTheme, { label: string; plus: boolean; bg: string }> = {
  classic: { label: "Classic", plus: false, bg: "radial-gradient(120% 90% at 100% 0%, #8247ff 0%, #3b1d8f 38%, #151720 75%)" },
  gold: { label: "Gold", plus: true, bg: "radial-gradient(120% 90% at 100% 0%, #ffc85c 0%, #8a5a12 40%, #17130b 78%)" },
  neon: { label: "Neon", plus: true, bg: "linear-gradient(135deg, #ff3d9a 0%, #8247ff 45%, #00d1ff 100%)" },
  midnight: { label: "Midnight", plus: true, bg: "radial-gradient(120% 90% at 0% 0%, #1e3a8a 0%, #0b1024 55%, #05060a 100%)" },
};
