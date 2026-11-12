"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Link2, MessageSquare, Share } from "lucide-react";
import { useStore } from "@/lib/store";
import { useNav } from "@/lib/nav";
import type { Challenge } from "@/lib/types";
import { cx, estimateReturn, fmtLine, isSelf, multiplier, totalPool } from "@/lib/utils";
import { Avatar, BottomSheet, Button, Logo } from "@/components/ui";
import { CARD_THEMES, DAILY, MIN_STAKE, claimState, daysToMinimum, isPlus, type CardTheme } from "@/lib/plus";
import { Lock } from "lucide-react";

const PRESETS = [50, 100, 150, 250, 500];

export function JoinSheet() {
  const { db, me, actions } = useStore();
  const nav = useNav();
  const sheet = nav.sheet?.kind === "join" ? nav.sheet : null;
  const c = sheet ? db.challenges.find((x) => x.id === sheet.challengeId) : undefined;
  const existing = c?.entries.find((e) => e.userId === db.meId);
  const [opt, setOpt] = useState<string | undefined>();
  const [stake, setStake] = useState(MIN_STAKE);

  useEffect(() => {
    if (sheet) {
      const pre = sheet.optionId ?? existing?.optionId;
      const cc = db.challenges.find((x) => x.id === sheet.challengeId);
      setOpt(isSelf(cc?.options.find((o) => o.id === pre), db.meId) ? undefined : pre);
      setStake(Math.max(MIN_STAKE, existing?.points ?? 0));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet?.challengeId, sheet?.optionId]);

  if (!c) return null;
  const bragging = c.stakeMode === "bragging";
  const balance = me.points + (existing?.points ?? 0);
  const short = !bragging && balance < MIN_STAKE;
  const s = Math.max(MIN_STAKE, Math.min(stake, balance));
  const claim = claimState(me);
  const days = daysToMinimum(me, balance);
  const ret = opt ? estimateReturn(c, opt, s, db.meId) : 0;
  const mult = opt ? multiplier(c, opt, s, db.meId) : 0;
  const label = c.options.find((o) => o.id === opt)?.label;
  const top = Math.max(MIN_STAKE, Math.min(balance, 500));
  const pct = top > MIN_STAKE ? Math.round(((s - MIN_STAKE) / (top - MIN_STAKE)) * 100) : 100;

  const confirm = () => {
    if (!opt || short) return;
    actions.join(c.id, opt, bragging ? 0 : s);
    nav.closeSheet();
    nav.toast(existing ? `Position updated · ${label}` : `You’re on ${label}${bragging ? "" : ` · ${s} pts`}`);
  };

  return (
    <BottomSheet open onClose={nav.closeSheet} title={existing ? "Change your position" : "Take a side"}>
      <p className="mb-4 font-display text-[17px] font-semibold leading-snug text-white/90">{c.question}</p>
      {c.line != null && <div className="-mt-2 mb-4 text-[13px] text-muted">Line · <span className="font-semibold text-white">{fmtLine(c)}</span></div>}

      <div className={cx("mb-5 grid gap-2", c.options.length === 2 ? "grid-cols-2" : c.format === "exact" ? "grid-cols-7" : "grid-cols-2")}>
        {c.options.map((o) => (
          <button
            key={o.id}
            disabled={isSelf(o, db.meId)}
            onClick={() => setOpt(o.id)}
            className={cx(
              "rounded-2xl px-3 py-3 text-left transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-35",
              c.format === "exact" && "px-0 text-center",
              opt === o.id ? "bg-brand text-white glow" : "bg-surface text-white",
            )}
          >
            <div className="font-display text-[16px] font-extrabold leading-tight">{o.label}</div>
            {o.sub && <div className={cx("mt-0.5 text-[11px]", opt === o.id ? "text-white/75" : "text-muted")}>{o.sub}</div>}
            {isSelf(o, db.meId) && <div className="mt-0.5 text-[11px] text-muted">You can’t bet on yourself</div>}
          </button>
        ))}
      </div>

      {bragging ? (
        <div className="mb-5 rounded-2xl bg-gold/10 p-4 text-[14px] text-gold">
          <div className="font-semibold">No points on this one 👑</div>
          <div className="mt-0.5 text-gold/80">{c.forfeit ?? "Bragging rights only."}</div>
        </div>
      ) : short ? (
        <div className="mb-5 rounded-2xl bg-surface/70 p-4">
          <div className="mb-1 font-semibold">You need {MIN_STAKE} pts to join</div>
          <p className="mb-3 text-[13px] leading-relaxed text-muted">
            You have <b className="text-white">{balance} pts</b>. Every points challenge takes at least {MIN_STAKE}.{" "}
            {days === 0 ? "Claim today’s refill and you’re in." : `Free refills get you there in ${days} day${days === 1 ? "" : "s"}.`}
          </p>
          <div className="flex gap-2">
            {claim.ready && (
              <Button size="sm" variant="white" className="flex-1" onClick={() => actions.claimDaily((amt) => nav.toast(`+${amt} pts claimed`))}>
                Claim +{claim.amount}
              </Button>
            )}
            {!isPlus(me) && (
              <Button size="sm" className="flex-1" onClick={() => { nav.closeSheet(); nav.push({ kind: "plus", reason: "daily" }); }}>
                ✦ Get {DAILY.plus}/day
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-end justify-between">
            <div className="text-[12px] font-bold uppercase tracking-[0.12em] text-dim">Your stake · min {MIN_STAKE}</div>
            <div className="text-[12px] text-muted tabular">Balance {balance.toLocaleString()} pts</div>
          </div>
          <div className="mb-3 font-display text-[44px] font-extrabold leading-none tracking-tight tabular">
            {s}
            <span className="ml-1.5 text-lg font-semibold text-muted">pts</span>
          </div>
          <input
            type="range"
            className="tyche-range mb-3 w-full"
            min={MIN_STAKE}
            max={top}
            step={5}
            value={s}
            style={{ ["--p" as string]: `${pct}%` } as React.CSSProperties}
            onChange={(e) => setStake(+e.target.value)}
          />
          <div className="mb-5 flex gap-1.5">
            {PRESETS.map((p) => (
              <button key={p} onClick={() => setStake(p)} disabled={p > balance} className={cx("flex-1 rounded-xl py-2 text-[13px] font-semibold transition disabled:opacity-30", s === p ? "bg-white text-ink" : "bg-surface text-muted")}>
                {p}
              </button>
            ))}
          </div>

          <div className="mb-5 space-y-2 rounded-2xl bg-surface/70 p-4 text-[14px]">
            <Row k="Pool after you join" v={`${(totalPool(c) - (existing?.points ?? 0) + s).toLocaleString()} pts`} />
            <Row k={c.stakeMode === "odds" ? "Creator’s odds" : "Even pool multiplier"} v={opt ? `${mult.toFixed(2)}x` : "—"} />
            <Row k="Profit if you win" v={opt ? `+${Math.max(0, ret - s)} pts` : "—"} accent />
            <div className="border-t border-white/5 pt-2">
              <Row k="Total return" v={opt ? `${ret} pts` : "—"} strong />
            </div>
            <p className="pt-1 text-[11px] leading-relaxed text-dim">
              {c.stakeMode === "odds" ? "Fixed odds set by the creator." : "Even pool: winners split the whole pot in proportion to their stake. Estimate moves as people join."} Points only — no real money.
            </p>
          </div>
        </>
      )}

      <Button size="lg" className="w-full" disabled={!opt || short} onClick={confirm}>
        {short ? `Need ${MIN_STAKE} pts to join` : opt ? `${existing ? "Update" : "Take"} ${label}${bragging ? "" : ` · ${s} pts`}` : "Pick a side"}
      </Button>
    </BottomSheet>
  );
}

function Row({ k, v, accent, strong }: { k: string; v: string; accent?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{k}</span>
      <span className={cx("font-semibold tabular", accent && "text-win", strong && "font-display text-lg font-extrabold")}>{v}</span>
    </div>
  );
}

export function ShareCard({ c, theme }: { c: Challenge; theme?: CardTheme }) {
  const { db, me } = useStore();
  const t = theme ?? ((isPlus(me) && (me.cardTheme as CardTheme)) || "classic");
  const creator = db.users[c.creatorId];
  const creatorEntry = c.entries.find((e) => e.userId === c.creatorId);
  const pick = c.options.find((o) => o.id === creatorEntry?.optionId);
  return (
    <div className="relative overflow-hidden rounded-[24px] p-5 transition-[background] duration-500 hairline" style={{ background: CARD_THEMES[t]?.bg ?? CARD_THEMES.classic.bg }}>
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full border-[18px] border-white/[0.06]" />
      <div className="mb-6 flex items-center justify-between">
        <Logo size={20} />
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/80">{c.category}</span>
      </div>
      <div className="mb-1 text-[12px] font-medium text-white/60">{c.title ?? "Challenge"}</div>
      <div className="mb-4 font-display text-[24px] font-extrabold leading-[1.1] tracking-tight">{c.question}</div>
      <div className="mb-5 flex items-center gap-2.5">
        <Avatar user={creator} size={30} />
        <div className="text-[13px] leading-tight">
          <div className="font-semibold">@{creator?.username}</div>
          <div className="text-white/60">
            {pick ? `took ${pick.label}${c.line != null ? ` ${fmtLine(c)}` : ""}` : "set the line"}
            {creatorEntry?.points ? ` · ${creatorEntry.points} pts` : ""}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between rounded-2xl bg-black/30 p-1.5 pl-4 backdrop-blur">
        <span className="text-[12px] text-white/70 tabular">
          {c.stakeMode === "bragging" ? "Bragging rights" : `${totalPool(c)} pts pool`} · {c.entries.length} in
        </span>
        <span className="rounded-xl bg-white px-4 py-2 text-[13px] font-bold text-ink">Join on Tyche</span>
      </div>
    </div>
  );
}

const TARGETS = [
  { id: "messages", label: "Messages", bg: "#34C759", icon: <MessageSquare size={22} /> },
  { id: "whatsapp", label: "WhatsApp", bg: "#25D366", icon: <span className="text-lg font-black">W</span> },
  { id: "instagram", label: "Stories", bg: "linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)", icon: <span className="text-lg font-black">IG</span> },
  { id: "x", label: "X", bg: "#000", icon: <span className="text-lg font-black">𝕏</span> },
  { id: "more", label: "More", bg: "#202331", icon: <Share size={20} /> },
];

export function ShareSheet() {
  const { db, me, actions } = useStore();
  const nav = useNav();
  const sheet = nav.sheet?.kind === "share" ? nav.sheet : null;
  const plus = isPlus(me);
  const theme: CardTheme = (plus && (me.cardTheme as CardTheme)) || "classic";
  const c = sheet ? db.challenges.find((x) => x.id === sheet.challengeId) : undefined;
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [sheet?.challengeId]);
  if (!c || !sheet) return null;
  const link = `https://tyche.app/c/${c.id.replace(/^ch_/, "")}`;
  const text = `${c.question} — I’m putting it on Tyche. Pick a side:`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${text} ${link}`);
    } catch {
      /* clipboard blocked; still show the link */
    }
    setCopied(true);
    actions.shared(c.id);
    nav.toast("Link copied — drop it in the group chat");
  };
  const shareTo = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Tyche", text, url: link });
        actions.shared(c.id);
        return;
      }
    } catch {
      return;
    }
    copy();
  };

  return (
    <BottomSheet open onClose={nav.closeSheet} title={sheet.justPublished ? "It’s on Tyche 🎉" : "Share challenge"}>
      {sheet.justPublished && <p className="-mt-1 mb-4 text-[14px] text-muted">Your challenge is live. Send it to the people who disagree with you.</p>}
      <ShareCard c={c} theme={theme} />
      <div className="mt-3 flex gap-1.5">
        {(Object.keys(CARD_THEMES) as CardTheme[]).map((k) => {
          const locked = CARD_THEMES[k].plus && !plus;
          return (
            <button
              key={k}
              onClick={() => {
                if (locked) {
                  nav.closeSheet();
                  nav.push({ kind: "plus", reason: "theme" });
                } else actions.setCardTheme(k);
              }}
              className={cx("flex flex-1 items-center justify-center gap-1 rounded-xl py-2 text-[12px] font-semibold transition", theme === k ? "bg-white text-ink" : "bg-surface text-muted")}
            >
              <span className="h-3 w-3 rounded-full" style={{ background: CARD_THEMES[k].bg }} />
              {CARD_THEMES[k].label}
              {locked && <Lock size={11} />}
            </button>
          );
        })}
      </div>
      <div className="my-5 flex justify-between">
        {TARGETS.map((t) => (
          <button key={t.id} onClick={shareTo} className="flex w-14 flex-col items-center gap-1.5 active:scale-90">
            <span className="grid h-14 w-14 place-items-center rounded-2xl text-white" style={{ background: t.bg }}>
              {t.icon}
            </span>
            <span className="text-[11px] text-muted">{t.label}</span>
          </button>
        ))}
      </div>
      <div className="mb-4 flex items-center gap-2 rounded-2xl bg-surface p-1.5 pl-3.5">
        <Link2 size={16} className="shrink-0 text-dim" />
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{link}</span>
        <Button size="sm" variant={copied ? "soft" : "white"} onClick={copy}>
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div className="flex gap-2">
        <Button
          variant="soft"
          className="flex-1"
          onClick={() => {
            nav.closeSheet();
          }}
        >
          Done
        </Button>
        <Button
          className="flex-1"
          onClick={() => {
            nav.closeSheet();
            nav.push({ kind: "room", id: c.id });
          }}
        >
          Open Room
        </Button>
      </div>
    </BottomSheet>
  );
}
