import { REMOTE, supabase } from "@/lib/supabase";

/**
 * Sponsored cards (Home feed) and banners (Discover).
 *
 * Live mode: campaigns live in Supabase (`ad_campaigns`), and the server decides
 * what to show (`ad_pick`) and records viewable impressions/clicks (`ad_record`),
 * enforcing pacing and frequency caps. Demo mode runs the same rules locally.
 */
export interface Ad {
  id: string;
  sponsor: string;
  logo: string; // emoji or image URL
  tint: string;
  url: string;
  domain: string;
  question?: string | null;
  options?: { label: string; sub: string }[];
  cta?: string;
  banner?: string | null;
}
export type AdFormat = "card" | "banner";

/** Same numbers as tyche_private.cfg on the server. */
export const AD_RULES = {
  cardMinOrganic: 4, // organic posts viewed before the first sponsored card
  cardGap: 6, // organic posts between sponsored cards
  cardDailyLimit: 6, // sponsored cards per user per day
  companyBannerPerDay: 4,
  companyCardPer24h: 2,
  companyAnyPerDay: 5,
  cardPer24h: 2,
  bannerRotateMs: 20_000,
  viewableMs: 1_000, // ≥50% on screen for 1 second = viewable impression
};

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

// ------------------------------------------------------------ demo mode --

/** Placeholder campaigns (match the rows inserted by schema.sql). */
const DEMO: (Ad & { purchased: number; startsAt: number; days: number })[] = [
  {
    id: "a0000000-0000-4000-8000-000000000001", sponsor: "Conex Card", logo: "🪪", tint: "#8247FF", url: "", domain: "",
    question: "Still handing out paper business cards?",
    options: [{ label: "Paper", sub: "Gets lost by Monday" }, { label: "Conex", sub: "One tap, saved forever" }],
    cta: "Make your card", banner: "Your business card, on everyone’s phone in one tap",
    purchased: 10000, startsAt: Date.now() - 86_400_000, days: 30,
  },
  {
    id: "a0000000-0000-4000-8000-000000000002", sponsor: "Conex Card", logo: "🪪", tint: "#8247FF", url: "", domain: "",
    question: "Who has the better business card at your next event?",
    options: [{ label: "Them", sub: "Paper, plain, forgettable" }, { label: "You", sub: "Digital card, your brand" }],
    cta: "Try Conex free", banner: "Share your brand with a tap. Try Conex free",
    purchased: 10000, startsAt: Date.now() - 86_400_000, days: 30,
  },
  {
    id: "a0000000-0000-4000-8000-000000000003", sponsor: "Les Belle Fleur", logo: "💐", tint: "#E58BA7", url: "", domain: "",
    question: "Front door this season: wreath or bare?",
    options: [{ label: "Custom wreath", sub: "Made to match your home" }, { label: "Bare door", sub: "The neighbors noticed" }],
    cta: "Shop wreaths", banner: "Custom wreaths & floral decor for every season",
    purchased: 10000, startsAt: Date.now() - 86_400_000, days: 30,
  },
];

type Ev = { cid: string; adv: string; fmt: AdFormat; kind: "impression" | "click"; at: number };
const KEY = "tyche:ads:v1";
const load = (): Ev[] => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
};
const save = (e: Ev[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(e.filter((x) => x.at > Date.now() - 3 * 86_400_000)));
  } catch {}
};
const dayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

function underCaps(evs: Ev[], ad: Ad, fmt: AdFormat) {
  const ds = dayStart();
  const h24 = Date.now() - 86_400_000;
  const imp = evs.filter((e) => e.kind === "impression");
  const co = imp.filter((e) => e.adv === ad.sponsor);
  if (fmt === "banner" && co.filter((e) => e.fmt === "banner" && e.at >= ds).length >= AD_RULES.companyBannerPerDay) return false;
  if (fmt === "card" && co.filter((e) => e.fmt === "card" && e.at > h24).length >= AD_RULES.companyCardPer24h) return false;
  if (fmt === "card" && imp.filter((e) => e.cid === ad.id && e.fmt === "card" && e.at > h24).length >= AD_RULES.cardPer24h) return false;
  if (co.filter((e) => e.at >= ds).length >= AD_RULES.companyAnyPerDay) return false;
  return true;
}

function demoPick(fmt: AdFormat, organicSeen: number, exclude: string[]): Ad | null {
  const evs = load();
  if (fmt === "card") {
    const today = evs.filter((e) => e.kind === "impression" && e.fmt === "card" && e.at >= dayStart()).length;
    if (organicSeen < (today ? AD_RULES.cardGap : AD_RULES.cardMinOrganic) || today >= AD_RULES.cardDailyLimit) return null;
  }
  const ok = DEMO.filter((a) => !exclude.includes(a.id) && (fmt === "card" ? !!a.question && a.options?.length === 2 : !!a.banner) && underCaps(evs, a, fmt));
  return ok.length ? ok[Math.floor(Math.random() * ok.length)] : null;
}

function demoRecord(ad: Ad, fmt: AdFormat, kind: Ev["kind"]) {
  const evs = load();
  if (kind === "impression" && !underCaps(evs, ad, fmt)) return false;
  evs.push({ cid: ad.id, adv: ad.sponsor, fmt, kind, at: Date.now() });
  save(evs);
  return true;
}

// ------------------------------------------------------------ public API --

/** Asks for an ad for one placement. null = show nothing. */
export async function pickAd(fmt: AdFormat, organicSeen = 0, exclude: string[] = []): Promise<Ad | null> {
  if (!REMOTE || !supabase) return demoPick(fmt, organicSeen, exclude);
  const { data, error } = await supabase.rpc("ad_pick", { fmt, organic_seen: organicSeen, tz: tz(), exclude });
  if (error) {
    console.warn("Tyche: ad_pick failed", error.message);
    return null;
  }
  return (data as Ad | null) ?? null;
}

/** Records a viewable impression or a click. Returns false if it didn't count (e.g. capped). */
export async function recordAd(ad: Ad, fmt: AdFormat, kind: "impression" | "click"): Promise<boolean> {
  if (!REMOTE || !supabase) return demoRecord(ad, fmt, kind);
  const { data, error } = await supabase.rpc("ad_record", { cid: ad.id, fmt, ev: kind, tz: tz() });
  if (error) {
    console.warn("Tyche: ad_record failed", error.message);
    return false;
  }
  return data === true;
}

/** Click: record it, then open the advertiser's link (if one is set). */
export function openAd(ad: Ad, fmt: AdFormat) {
  void recordAd(ad, fmt, "click");
  if (ad.url) window.open(ad.url, "_blank", "noopener,noreferrer");
}
