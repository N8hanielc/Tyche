import type { Challenge, Category, DB, Format, ID, Option } from "./types";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export const uid = (p = "id") => `${p}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;

export const MIN = 60_000;
export const HOUR = 60 * MIN;

export function fmtMinutes(m: number) {
  const h = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  if (h === 0) return `${mm}m`;
  return mm === 0 ? `${h}h` : `${h}h ${mm}m`;
}

export function fmtLine(c: Pick<Challenge, "line" | "unit">) {
  if (c.line == null) return "";
  if (c.unit === "time") return fmtMinutes(c.line);
  return `${c.line}${c.unit ? ` ${c.unit}` : ""}`;
}

export function ago(ts: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return "now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function countdown(ts: number, now = Date.now()) {
  const ms = ts - now;
  if (ms <= 0) return "Closed";
  const m = Math.floor(ms / MIN);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${h}:${pad(m)}:${pad(sec)}`;
}

export function timeOfDay(ts: number) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export const pts = (n: number) => `${n.toLocaleString()} pts`;

// ---------- Pools & payouts ----------

export function poolFor(c: Challenge, optionId: ID) {
  return c.entries.filter((e) => e.optionId === optionId).reduce((a, e) => a + e.points, 0);
}
export function countFor(c: Challenge, optionId: ID) {
  return c.entries.filter((e) => e.optionId === optionId).length;
}
export function totalPool(c: Challenge) {
  return c.entries.reduce((a, e) => a + e.points, 0);
}
export function share(c: Challenge, optionId: ID) {
  const t = totalPool(c);
  if (t === 0) {
    const n = c.entries.length;
    return n ? countFor(c, optionId) / n : 1 / c.options.length;
  }
  return poolFor(c, optionId) / t;
}

/** Estimated gross return for staking `stake` on `optionId` (includes stake). */
export function estimateReturn(c: Challenge, optionId: ID, stake: number, excludeUser?: ID) {
  if (stake <= 0) return 0;
  if (c.stakeMode === "odds" && c.odds?.[optionId]) return Math.round(stake * c.odds[optionId]);
  const entries = excludeUser ? c.entries.filter((e) => e.userId !== excludeUser) : c.entries;
  const side = entries.filter((e) => e.optionId === optionId).reduce((a, e) => a + e.points, 0) + stake;
  const total = entries.reduce((a, e) => a + e.points, 0) + stake;
  return Math.round((stake / side) * total);
}

export function multiplier(c: Challenge, optionId: ID, stake: number, excludeUser?: ID) {
  if (stake <= 0) return 0;
  return estimateReturn(c, optionId, stake, excludeUser) / stake;
}

/** Net points per user once a winner is known. */
export function computePayouts(c: Challenge, winning: ID | null): Record<ID, number> {
  const out: Record<ID, number> = {};
  if (winning == null) {
    c.entries.forEach((e) => (out[e.userId] = 0));
    return out;
  }
  const total = totalPool(c);
  const winPool = poolFor(c, winning);
  c.entries.forEach((e) => {
    if (e.optionId !== winning) out[e.userId] = -e.points;
    else if (c.stakeMode === "odds" && c.odds?.[winning]) out[e.userId] = Math.round(e.points * c.odds[winning]) - e.points;
    else out[e.userId] = winPool ? Math.round((e.points / winPool) * total) - e.points : 0;
  });
  return out;
}

// ---------- Formats ----------

export const FORMAT_META: Record<Format, { label: string; blurb: string; example: string }> = {
  over_under: { label: "Over / Under", blurb: "For anything you can measure", example: "Will the trip take more than 9h 36m?" },
  yes_no: { label: "Yes / No", blurb: "Two outcomes, pick a side", example: "Will everyone arrive before 8 PM?" },
  pick_one: { label: "Pick One", blurb: "Several possible outcomes", example: "Who will win tonight’s Spades game?" },
  exact: { label: "Exact Number", blurb: "Call the precise result", example: "How many plates will Marcus eat?" },
};

export function buildOverUnder(line: number, unit: string): Option[] {
  const l = unit === "time" ? fmtMinutes(line) : `${line}${unit ? " " + unit : ""}`;
  const overSub = unit === "time" ? `${l} or longer` : Number.isInteger(line) ? `${l} or more` : `More than ${l}`;
  return [
    { id: "over", label: "OVER", sub: overSub },
    { id: "under", label: "UNDER", sub: `Less than ${l}` },
  ];
}

export function buildExact(min: number, max: number): Option[] {
  const out: Option[] = [];
  for (let n = min; n <= max; n++) out.push({ id: `n${n}`, label: n === max ? `${n}+` : `${n}` });
  return out;
}

export function winnerFromValue(c: Challenge, value: number): ID | null {
  if (c.format === "over_under" && c.line != null) {
    return value >= c.line ? "over" : "under";
  }
  if (c.format === "exact") {
    const last = c.options[c.options.length - 1];
    const maxN = parseInt(last.label, 10);
    if (value >= maxN) return last.id;
    return c.options.find((o) => parseInt(o.label, 10) === value)?.id ?? null;
  }
  return null;
}

// ---------- Categories ----------

export const CATEGORIES: Category[] = [
  "Road Trip", "Game Night", "Dinner", "Night Out", "Sports", "Music", "Entertainment", "Nightlife", "Travel", "Custom",
];

export const CATEGORY_EMOJI: Record<Category, string> = {
  "Road Trip": "🚗",
  "Game Night": "🃏",
  Dinner: "🍽️",
  "Night Out": "🍸",
  Sports: "🏀",
  Music: "🎧",
  Entertainment: "🎬",
  Nightlife: "🪩",
  Travel: "✈️",
  Custom: "✨",
};

/** Maps a feed pill to the categories it includes. */
export const PILL_CATEGORIES: Record<string, Category[] | null> = {
  Friends: null,
  Trending: null,
  Sports: ["Sports"],
  Music: ["Music"],
  Entertainment: ["Entertainment", "Game Night"],
  Nightlife: ["Nightlife", "Night Out"],
  Travel: ["Travel", "Road Trip"],
  Custom: ["Custom", "Dinner"],
};

// ---------- Derived stats ----------

export function heat(c: Challenge, db: DB) {
  const msgs = db.messages.filter((m) => m.challengeId === c.id && m.kind === "chat").length;
  return c.entries.length * 3 + c.likes.length * 2 + msgs + c.shares * 2;
}

export function userRecord(db: DB, userId: ID) {
  const u = db.users[userId];
  let wins = u?.baseWins ?? 0;
  let losses = u?.baseLosses ?? 0;
  let net = 0;
  db.challenges.forEach((c) => {
    if (c.status !== "settled" || !c.result?.payouts) return;
    const p = c.result.payouts[userId];
    if (p == null) return;
    const entry = c.entries.find((e) => e.userId === userId);
    if (!entry) return;
    if (entry.optionId === c.result.optionId) wins++;
    else losses++;
    net += p;
  });
  const total = wins + losses;
  return { wins, losses, net, pct: total ? Math.round((wins / total) * 100) : 0 };
}

export function statusLabel(c: Challenge, now = Date.now()) {
  if (c.status === "settled") return "Settled";
  if (c.status === "review") return "Confirming";
  if (c.status === "vote") return "Voting";
  if (c.status === "live") return "Live";
  if (c.closesAt <= now) return "Locked";
  return "Open";
}

export const SEED_ME = "u_nate";
/** Sample "crowd" accounts in the offline demo (ids c1…c16). */
export const isCrowd = (id: ID) => /^c\d+$/.test(id);
export function myNotifications(db: DB) {
  return db.notifications.filter((n) => (n.to ?? SEED_ME) === db.meId);
}

/** Visibility rules: public/link for all; group for members; friends for people the creator's circle includes. */
export function canSee(db: DB, c: Challenge) {
  if (c.creatorId === db.meId || c.entries.some((e) => e.userId === db.meId)) return true;
  if (c.visibility === "public" || c.visibility === "link") return true;
  if (c.visibility === "group") return !!db.groups.find((g) => g.id === c.groupId)?.memberIds.includes(db.meId);
  return db.following.includes(c.creatorId);
}

/** True when the option is about this user (e.g. "Marcus" in “Who’s the drunkest?”). */
export const isSelf = (o: Option | undefined, userId: ID) => !!o?.subjects?.includes(userId);

export function myEntry(c: Challenge, meId: ID) {
  return c.entries.find((e) => e.userId === meId);
}
