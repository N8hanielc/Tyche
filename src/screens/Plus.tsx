"use client";

import { useState } from "react";
import { BarChart3, CalendarClock, Clock, Check, Coins, Crown, Gift, Infinity as InfinityIcon, Lock, Palette, Sparkles, Users, X } from "lucide-react";
import { useNow, useStore } from "@/lib/store";
import { useNav } from "@/lib/nav";
import { DAILY, LIMITS, MIN_STAKE, PLANS, TRIAL_DAYS, claimState, isPlus } from "@/lib/plus";
import type { Plan, User } from "@/lib/types";
import { cx } from "@/lib/utils";
import { BottomSheet, Button, TopBar } from "@/components/ui";

export function PlusBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-0.5 rounded-full bg-[linear-gradient(110deg,#ffc85c,#b69aff_55%,#8247ff)] font-black uppercase tracking-wider text-ink",
        size === "sm" ? "px-1.5 py-[1px] text-[9px]" : "px-2 py-0.5 text-[11px]",
      )}
    >
      ✦ Plus
    </span>
  );
}

/** Home-screen daily refill card. */
export function DailyClaimCard() {
  const { me, actions } = useStore();
  const nav = useNav();
  const now = useNow(30_000);
  const st = claimState(me, now);
  const plus = isPlus(me);
  const [burst, setBurst] = useState<number | null>(null);

  if (!st.ready && !burst) {
    if (plus) return null;
    const h = Math.max(1, Math.round((st.nextAt - now) / 3_600_000));
    return (
      <button onClick={() => nav.push({ kind: "plus", reason: "daily" })} className="mb-4 flex w-full items-center gap-3 rounded-[20px] bg-card p-3 pr-4 text-left hairline">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface text-dim">
          <Coins size={17} />
        </span>
        <span className="min-w-0 flex-1 text-[13px] text-muted">
          Next {DAILY.free} pts in {h}h · <span className="font-semibold text-lav">Get {DAILY.plus}/day with Tyche+</span>
        </span>
      </button>
    );
  }

  return (
    <div className={cx("relative mb-4 overflow-hidden rounded-[22px] p-4 hairline", plus ? "bg-[linear-gradient(120deg,rgba(255,200,92,0.2),rgba(130,71,255,0.18)_55%,#151720)]" : "bg-[linear-gradient(120deg,rgba(255,200,92,0.14),#151720_60%)]")}>
      <div className="flex items-center gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gold/15 text-gold">
          <Gift size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[15px] font-semibold">
            {burst ? `+${burst} points added` : "Daily points are ready"}
            {plus && <PlusBadge />}
          </div>
          <div className="text-[12px] text-muted">
            {burst ? `Streak: ${me.claimStreak ?? 1} day${(me.claimStreak ?? 1) === 1 ? "" : "s"} 🔥` : plus ? `Tyche+ refill · ${DAILY.plus} pts` : `Free refill · ${DAILY.free} pts`}
          </div>
        </div>
        {burst ? (
          <button onClick={() => setBurst(null)} className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-muted" aria-label="Dismiss">
            <X size={15} />
          </button>
        ) : (
          <Button size="sm" variant="white" onClick={() => actions.claimDaily((amt) => setBurst(amt))}>
            Claim +{st.amount}
          </Button>
        )}
      </div>
      {burst && <div className="pointer-events-none absolute right-16 top-2 animate-pop font-display text-2xl font-extrabold text-gold">+{burst}</div>}
      {!plus && !burst && (
        <button onClick={() => nav.push({ kind: "plus", reason: "daily" })} className="mt-3 w-full rounded-xl bg-black/25 px-3 py-2 text-left text-[12px] text-muted">
          ✦ Tyche+ members get <b className="text-white">{DAILY.plus} pts</b> every day — 10x more
        </button>
      )}
    </div>
  );
}

const FEATURES: { icon: React.ReactNode; title: string; free: string; plus: string }[] = [
  { icon: <Coins size={18} />, title: "Daily points", free: `${DAILY.free} / day`, plus: `${DAILY.plus} / day` },
  { icon: <Clock size={18} />, title: `Back in after going broke (${MIN_STAKE} pt min)`, free: `${Math.ceil(MIN_STAKE / DAILY.free)} days`, plus: "Same day" },
  { icon: <InfinityIcon size={18} />, title: "Open challenges", free: `${LIMITS.openChallenges} at a time`, plus: "Unlimited" },
  { icon: <Users size={18} />, title: "Private groups", free: `${LIMITS.groups}`, plus: "Unlimited" },
  { icon: <Palette size={18} />, title: "Share-card themes", free: "Classic", plus: "Gold, Neon, Midnight" },
  { icon: <BarChart3 size={18} />, title: "Head-to-head records", free: "—", plus: "vs. every friend" },
  { icon: <Crown size={18} />, title: "Plus badge on your profile", free: "—", plus: "✓" },
];

const COMING = [
  { icon: <CalendarClock size={16} />, t: "Seasons & league tables for your groups" },
  { icon: <Sparkles size={16} />, t: "Auto-tracked road trips and live scoreboards" },
];

export function PlusScreen({ reason }: { reason?: string }) {
  const { me, actions } = useStore();
  const nav = useNav();
  const [plan, setPlan] = useState<Plan>("yearly");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [manage, setManage] = useState(false);
  const plus = isPlus(me);

  const headline: Record<string, string> = {
    daily: `Get ${DAILY.plus} points every day`,
    challenges: "Host as many challenges as you want",
    groups: "Unlimited private groups",
    theme: "Make your share cards stand out",
    h2h: "See your record against every friend",
  };

  const buy = () => {
    setBusy(true);
    setTimeout(() => {
      actions.subscribe(plan);
      setBusy(false);
      setDone(true);
    }, 900);
  };

  if (plus && !done) return <ManagePlus user={me} onOpen={() => setManage(true)} manageOpen={manage} onClose={() => setManage(false)} />;

  return (
    <div className="relative min-h-full pb-40">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(70%_60%_at_50%_0%,rgba(255,200,92,0.28),rgba(130,71,255,0.25)_45%,transparent_75%)]" />
      <TopBar onBack={nav.pop} />
      <div className="relative px-5">
        {done ? (
          <div className="flex flex-col items-center pt-10 text-center">
            <div className="mb-5 grid h-24 w-24 animate-pop place-items-center rounded-[30px] bg-[linear-gradient(135deg,#ffc85c,#8247ff)] text-4xl shadow-[0_20px_60px_-15px_rgba(130,71,255,0.8)]">✦</div>
            <h1 className="font-display text-[32px] font-extrabold tracking-tight">You’re on Tyche+</h1>
            <p className="mt-2 max-w-[300px] text-[15px] text-muted">
              {me.plus?.trialEndsAt ? `Your ${TRIAL_DAYS}-day free trial has started. ` : ""}Your daily refill is now {DAILY.plus} points, and every Plus perk is unlocked.
            </p>
            <Button size="lg" className="mt-8 w-full" onClick={nav.pop}>
              Let’s go
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-1 pt-2">
              <PlusBadge size="md" />
            </div>
            <h1 className="mb-2 font-display text-[34px] font-extrabold leading-[1.05] tracking-[-0.03em]">{headline[reason ?? ""] ?? "More points. More Rooms. More flex."}</h1>
            <p className="mb-6 text-[15px] text-muted">Tyche+ is for the friend who always starts the debate.</p>

            <div className="mb-6 overflow-hidden rounded-[22px] bg-card hairline">
              <div className="grid grid-cols-[1fr_76px_92px] items-center border-b border-white/5 px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-dim">
                <span />
                <span className="text-center">Free</span>
                <span className="text-center text-gold">Plus</span>
              </div>
              {FEATURES.map((f) => (
                <div key={f.title} className="grid grid-cols-[1fr_76px_92px] items-center border-b border-white/[0.04] px-4 py-3 last:border-0">
                  <span className="flex items-center gap-2.5 text-[14px] font-medium">
                    <span className="text-lav">{f.icon}</span>
                    {f.title}
                  </span>
                  <span className="text-center text-[12px] text-muted">{f.free}</span>
                  <span className="text-center text-[12px] font-semibold text-white">{f.plus}</span>
                </div>
              ))}
            </div>

            <div className="mb-6 space-y-2">
              {(Object.keys(PLANS) as Plan[]).map((p) => {
                const P = PLANS[p];
                const on = plan === p;
                return (
                  <button key={p} onClick={() => setPlan(p)} className={cx("flex w-full items-center gap-3 rounded-[20px] p-4 text-left transition", on ? "bg-brand/15 glow-soft" : "bg-card hairline")}>
                    <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full", on ? "bg-brand" : "border border-white/20")}>{on && <Check size={14} strokeWidth={3} />}</span>
                    <span className="flex-1">
                      <span className="flex items-center gap-2 font-semibold">
                        {P.label}
                        {P.note && <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">{P.note}</span>}
                      </span>
                      <span className="text-[12px] text-muted">{p === "crew" ? "Everyone in one group gets Plus" : P.monthly}</span>
                    </span>
                    <span className="text-right">
                      <span className="font-display text-[18px] font-extrabold">{P.price}</span>
                      <span className="block text-[11px] text-muted">{P.per}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mb-4 text-[12px] font-bold uppercase tracking-[0.12em] text-dim">Coming to Tyche+</div>
            <div className="space-y-2">
              {COMING.map((c) => (
                <div key={c.t} className="flex items-center gap-2.5 text-[14px] text-muted">
                  <span className="text-lav">{c.icon}</span>
                  {c.t}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {!done && (
        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[440px] bg-gradient-to-t from-ink via-ink to-transparent px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-8">
          <Button size="lg" className="w-full" disabled={busy} onClick={buy}>
            {busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : me.trialUsed ? `Subscribe · ${PLANS[plan].price}${PLANS[plan].per}` : `Start ${TRIAL_DAYS}-day free trial`}
          </Button>
          <p className="mt-2 text-center text-[11px] leading-relaxed text-dim">
            {me.trialUsed ? "" : `Then ${PLANS[plan].price}${PLANS[plan].per}. `}Cancel anytime. Prototype: no payment is taken. Points have no cash value and can’t be redeemed for money or prizes.
          </p>
        </div>
      )}
    </div>
  );
}

function ManagePlus({ user, manageOpen, onOpen, onClose }: { user: User; manageOpen: boolean; onOpen: () => void; onClose: () => void }) {
  const { actions } = useStore();
  const nav = useNav();
  const s = user.plus!;
  const date = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  const inTrial = !!s.trialEndsAt && s.trialEndsAt > Date.now();
  return (
    <div className="pb-10">
      <TopBar onBack={nav.pop} title="Tyche+" />
      <div className="px-4">
        <div className="mb-4 rounded-[26px] bg-[linear-gradient(130deg,rgba(255,200,92,0.25),rgba(130,71,255,0.3)_50%,#151720)] p-5 hairline">
          <PlusBadge size="md" />
          <div className="mt-2 font-display text-[26px] font-extrabold">{PLANS[s.plan].label} plan</div>
          <div className="text-[14px] text-white/75">
            {inTrial ? `Free trial until ${date(s.trialEndsAt!)}` : `${PLANS[s.plan].price}${PLANS[s.plan].per}`}
          </div>
          <div className="mt-4 rounded-2xl bg-black/25 px-4 py-3 text-[13px] text-white/80">
            {s.canceled ? `Canceled — Plus stays on until ${date(s.renewsAt)}.` : `Renews ${date(s.renewsAt)}`}
          </div>
        </div>
        <div className="mb-4 overflow-hidden rounded-[22px] bg-card hairline">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex items-center gap-3 border-b border-white/[0.04] px-4 py-3 last:border-0">
              <span className="text-gold">{f.icon}</span>
              <span className="flex-1 text-[14px]">{f.title}</span>
              <span className="text-[13px] font-semibold">{f.plus}</span>
            </div>
          ))}
        </div>
        {s.canceled ? (
          <Button className="w-full" onClick={() => { actions.resumePlus(); nav.toast("Tyche+ will renew"); }}>
            Resume subscription
          </Button>
        ) : (
          <Button variant="soft" className="w-full" onClick={onOpen}>
            Cancel subscription
          </Button>
        )}
        <p className="mt-3 text-center text-[11px] text-dim">In the App Store build, this opens Apple’s subscription settings.</p>
      </div>
      <BottomSheet open={manageOpen} onClose={onClose} title="Cancel Tyche+?">
        <p className="mb-5 text-[14px] text-muted">
          You’ll keep Plus until {date(s.renewsAt)}. After that your daily refill drops to {DAILY.free} points and limits return to {LIMITS.openChallenges} open challenges and {LIMITS.groups} groups.
        </p>
        <div className="flex gap-2">
          <Button variant="soft" className="flex-1" onClick={onClose}>
            Keep Plus
          </Button>
          <Button variant="danger" className="flex-1" onClick={() => { actions.cancelPlus(); onClose(); nav.toast("Subscription canceled"); }}>
            Cancel
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}

/** Shown when a free user hits a limit. */
export function LimitSheet({ open, onClose, title, body, reason }: { open: boolean; onClose: () => void; title: string; body: string; reason: string }) {
  const nav = useNav();
  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="flex flex-col items-center pb-2 pt-2 text-center">
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[linear-gradient(135deg,#ffc85c,#8247ff)] text-white">
          <Lock size={24} />
        </div>
        <div className="mb-1 font-display text-[22px] font-extrabold">{title}</div>
        <p className="mb-6 text-[14px] text-muted">{body}</p>
        <Button size="lg" className="w-full" onClick={() => { onClose(); nav.push({ kind: "plus", reason }); }}>
          ✦ Try Tyche+ free for {TRIAL_DAYS} days
        </Button>
        <button onClick={onClose} className="mt-3 text-[14px] text-muted">
          Not now
        </button>
      </div>
    </BottomSheet>
  );
}
