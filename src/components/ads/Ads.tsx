"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, MoreHorizontal, X } from "lucide-react";
import { AD_RULES, openAd, pickAd, recordAd, type Ad, type AdFormat } from "@/lib/ads";
import { cx } from "@/lib/utils";

/**
 * Calls onView once the element has been at least 50% on screen for 1 second
 * (the standard "viewable impression"), while the app is in the foreground.
 */
export function useViewable(ref: React.RefObject<HTMLElement | null>, onView: () => void, key: unknown, ms = AD_RULES.viewableMs) {
  const cb = useRef(onView);
  cb.current = onView;
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let done = false;
    const io = new IntersectionObserver(
      ([e]) => {
        clearTimeout(timer);
        if (done || !e.isIntersecting || e.intersectionRatio < 0.5) return;
        timer = setTimeout(() => {
          if (document.visibilityState !== "visible") return;
          done = true;
          io.disconnect();
          cb.current();
        }, ms);
      },
      { threshold: [0, 0.5, 1] },
    );
    io.observe(el);
    return () => {
      clearTimeout(timer);
      io.disconnect();
    };
  }, [ref, key, ms]);
}

function Logo({ ad, size }: { ad: Ad; size: number }) {
  const img = ad.logo.startsWith("http");
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-[10px]"
      style={{ width: size, height: size, background: `linear-gradient(140deg, ${ad.tint}33, ${ad.tint}14)`, boxShadow: `inset 0 0 0 1px ${ad.tint}40` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {img ? <img src={ad.logo} alt="" className="h-full w-full object-cover" /> : <span style={{ fontSize: size * 0.52 }}>{ad.logo}</span>}
    </span>
  );
}

function useImpression(ad: Ad, fmt: AdFormat) {
  const ref = useRef<HTMLDivElement>(null);
  useViewable(ref, () => void recordAd(ad, fmt, "impression"), ad.id);
  return ref;
}

/** Sponsored post in the Home feed. Built like a prop card, clearly labeled. */
export function SponsoredCard({ ad, onHide }: { ad: Ad; onHide?: () => void }) {
  const [menu, setMenu] = useState(false);
  const ref = useImpression(ad, "card");
  return (
    <article ref={ref} onClick={() => openAd(ad, "card")} className="relative cursor-pointer rounded-[26px] bg-card p-4 hairline transition-colors hover:bg-[#171a24]">
      <header className="mb-3 flex items-center gap-2.5">
        <Logo ad={ad} size={34} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[14px] font-semibold">{ad.sponsor}</div>
          <div className="text-[12px] text-dim">Sponsored</div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenu(!menu);
          }}
          className="grid h-8 w-8 place-items-center rounded-full text-dim hover:bg-surface hover:text-white"
          aria-label="Ad options"
        >
          <MoreHorizontal size={18} />
        </button>
      </header>

      <h3 className="mb-3 font-display text-[21px] font-bold leading-[1.15] tracking-[-0.02em] text-balance">{ad.question}</h3>

      <div className="grid grid-cols-2 gap-2">
        {(ad.options ?? []).map((o) => (
          <div key={o.label} className="rounded-2xl bg-surface/80 px-3.5 py-3">
            <div className="font-display text-[17px] font-bold leading-tight">{o.label}</div>
            <div className="mt-1 text-[12px] text-muted">{o.sub}</div>
          </div>
        ))}
      </div>

      <footer className="mt-3.5 flex items-center gap-2 border-t border-white/[0.05] pt-3">
        <span className="min-w-0 flex-1 truncate text-[12px] text-dim">{ad.domain}</span>
        <span className="inline-flex h-9 items-center gap-1 rounded-xl bg-white px-3.5 text-[13px] font-semibold text-ink">
          {ad.cta ?? "Learn more"} <ArrowUpRight size={15} />
        </span>
      </footer>

      {menu && (
        <div onClick={(e) => e.stopPropagation()} className="absolute right-3 top-12 z-10 w-56 overflow-hidden rounded-2xl bg-raised text-[14px] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)] hairline">
          <button onClick={() => { setMenu(false); onHide?.(); }} className="block w-full px-4 py-3 text-left hover:bg-surface">Hide this ad</button>
          <div className="border-t border-white/[0.06] px-4 py-3 text-[12px] leading-snug text-muted">
            Ads on Tyche are from sponsors we work with directly. They don’t use your data or follow you around the web.
          </div>
        </div>
      )}
    </article>
  );
}

/** Slim banner pinned above the tab bar on Discover. Rotates between campaigns. */
export function AdBanner() {
  const [ad, setAd] = useState<Ad | null>(null);
  const [closed, setClosed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const recent = useRef<string[]>([]);

  useEffect(() => {
    if (closed) return;
    let alive = true;
    const next = async () => {
      // prefer a different campaign than the last two; fall back to any eligible one
      const a = (await pickAd("banner", 0, recent.current)) ?? (await pickAd("banner", 0, []));
      if (!alive) return;
      if (a) recent.current = [a.id, ...recent.current].slice(0, 2);
      setAd(a);
    };
    void next();
    const t = setInterval(() => document.visibilityState === "visible" && void next(), AD_RULES.bannerRotateMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [closed]);

  // a fresh viewable impression each time a new ad rotates in
  const [shown, setShown] = useState(0);
  useEffect(() => setShown((n) => n + 1), [ad]);
  useViewable(ref, () => ad && void recordAd(ad, "banner", "impression"), `${ad?.id}:${shown}`);

  if (closed || !ad) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),8px)+66px)] z-30 mx-auto max-w-[440px] px-3">
      <div
        ref={ref}
        key={ad.id + shown}
        onClick={() => openAd(ad, "banner")}
        className={cx("pointer-events-auto flex animate-rise cursor-pointer items-center gap-2.5 rounded-2xl bg-[#12141c]/95 py-2 pl-2 pr-1.5 backdrop-blur-xl hairline", "shadow-[0_12px_40px_-12px_rgba(0,0,0,0.9)]")}
      >
        <Logo ad={ad} size={36} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold">
            <span className="truncate">{ad.sponsor}</span>
            <span className="shrink-0 rounded-[5px] bg-white/[0.07] px-1 py-px text-[9px] font-bold uppercase tracking-[0.08em] text-dim">Ad</span>
          </div>
          <div className="truncate text-[12px] text-muted">{ad.banner}</div>
        </div>
        <span className="shrink-0 rounded-lg bg-brand px-2.5 py-1.5 text-[12px] font-semibold text-white">Open</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setClosed(true);
          }}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-dim hover:text-white"
          aria-label="Close ad"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

/**
 * Home feed with sponsored cards woven in.
 * 1. counts organic posts the user actually views
 * 2. when enough have been viewed, asks the server for an ad (daily limit + caps checked there)
 * 3–4. the server picks the campaign most behind its delivery schedule
 * 5. the card logs an impression only once it's viewable
 */
export function useFeedAds(feedKey: string) {
  const [placed, setPlaced] = useState<Record<number, Ad>>({}); // ad shown after organic post #index
  const [hidden, setHidden] = useState<string[]>([]);
  const state = useRef({ viewed: -1, lastAdAt: -1, nextCheck: AD_RULES.cardMinOrganic - 1, busy: false });

  // a different feed (tab/filter) starts the counting over
  useEffect(() => {
    setPlaced({});
    state.current = { viewed: -1, lastAdAt: -1, nextCheck: AD_RULES.cardMinOrganic - 1, busy: false };
  }, [feedKey]);

  const onViewed = async (index: number) => {
    const s = state.current;
    if (index <= s.viewed) return;
    s.viewed = index;
    if (s.busy || index < s.nextCheck) return;
    s.busy = true;
    const organicSeen = index - s.lastAdAt;
    const exclude = Object.values(placed).map((a) => a.id);
    const ad = await pickAd("card", organicSeen, exclude);
    s.busy = false;
    if (ad) {
      setPlaced((p) => ({ ...p, [index]: ad }));
      s.lastAdAt = index;
      s.nextCheck = index + AD_RULES.cardGap;
    } else {
      s.nextCheck = index + AD_RULES.cardGap; // nothing eligible now; try again further down
    }
  };

  return {
    adAfter: (i: number) => {
      const a = placed[i];
      return a && !hidden.includes(a.id) ? a : null;
    },
    hide: (id: string) => setHidden((h) => [...h, id]),
    onViewed,
  };
}

/** Marks an organic post as viewed when half of it has been on screen. */
export function Viewed({ index, onViewed, children }: { index: number; onViewed: (i: number) => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useViewable(ref, () => onViewed(index), index, 300);
  return <div ref={ref}>{children}</div>;
}
