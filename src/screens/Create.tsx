"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowUpDown, Check, Globe, Hash, ImagePlus, Link2, ListChecks, Lock, Minus, Plus, ToggleLeft, Users, X } from "lucide-react";
import { useStore, type Draft } from "@/lib/store";
import { useNav } from "@/lib/nav";
import { readImage } from "@/lib/media";
import type { Challenge, Format, Option, TieRule, Verifier, Visibility } from "@/lib/types";
import { CATEGORIES, CATEGORY_EMOJI, FORMAT_META, buildExact, buildOverUnder, cx, fmtMinutes } from "@/lib/utils";
import { Avatar, Button } from "@/components/ui";
import { ShareCard } from "@/components/challenge/Sheets";
import { Outcomes } from "@/components/challenge/Outcomes";
import { DAILY, LIMITS, MIN_STAKE, daysToMinimum, isPlus, openChallenges } from "@/lib/plus";
import { LimitSheet } from "@/screens/Plus";
import { CreateGroupSheet } from "@/screens/Rooms";
import { ownedGroups } from "@/lib/plus";

const STEPS = ["Question", "Format", "Position", "Stakes", "Who", "Rules", "Publish"];

const IDEAS = [
  { q: "How long will it take us to get there?", cat: "Road Trip" as const },
  { q: "Who will be the last person to arrive?", cat: "Night Out" as const },
  { q: "Will the food arrive before 8:30 PM?", cat: "Dinner" as const },
  { q: "Who wins tonight’s game night?", cat: "Game Night" as const },
];

const UNITS = [
  { id: "time", label: "Time" },
  { id: "plates", label: "Plates" },
  { id: "points", label: "Points" },
  { id: "people", label: "People" },
  { id: "drinks", label: "Drinks" },
  { id: "", label: "Number" },
];

const FORMAT_ICON: Record<Format, React.ReactNode> = {
  over_under: <ArrowUpDown size={20} />,
  yes_no: <ToggleLeft size={20} />,
  pick_one: <ListChecks size={20} />,
  exact: <Hash size={20} />,
};

function guessFormat(q: string): { format: Format; unit?: string } | null {
  const s = q.trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith("how long")) return { format: "over_under", unit: "time" };
  if (/^how many (plates)/.test(s)) return { format: "over_under", unit: "plates" };
  if (s.startsWith("how many")) return { format: "exact" };
  if (/^(who|which|what)/.test(s)) return { format: "pick_one" };
  if (/^(will|is|does|do|can|are)/.test(s)) return { format: "yes_no" };
  return null;
}

export function CreateScreen({ prefill }: { prefill?: Partial<Draft> }) {
  const { db, me, actions } = useStore();
  const nav = useNav();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>(() => ({
    question: "", title: "", description: "", category: "Custom", format: "over_under", line: 60, unit: "time", options: [],
    stake: MIN_STAKE, stakeMode: "even", odds: {}, forfeit: "", visibility: "friends", invited: [], closesInMin: 60, startsInMin: null,
    resolution: "", tieRule: "refund", verifier: "group", ...prefill,
  }));
  const [choices, setChoices] = useState<string[]>(() =>
    prefill?.format === "pick_one" && prefill.options ? prefill.options.map((o) => o.label) : ["", ""],
  );
  const [range, setRange] = useState<[number, number]>([0, 6]);
  const [hosting, setHosting] = useState(false);
  const [formatTouched, setFormatTouched] = useState(!!prefill?.format);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  const options: Option[] = useMemo(() => {
    if (d.format === "over_under") return buildOverUnder(d.line, d.unit);
    if (d.format === "yes_no") return [{ id: "yes", label: "YES" }, { id: "no", label: "NO" }];
    if (d.format === "exact") return buildExact(range[0], range[1]);
    // link options that name a person (you or someone you follow) so they can't bet or vote on themselves
    const people = [me, ...Object.values(db.users).filter((u) => db.following.includes(u.id))];
    const who = (label: string) => people.filter((u) => u.name.split(" ")[0].toLowerCase() === label.toLowerCase() || u.username.toLowerCase() === label.toLowerCase().replace(/^@/, "")).map((u) => u.id);
    return choices
      .filter((c) => c.trim())
      .map((c, i) => {
        const subjects = who(c.trim());
        return { id: `o${i}`, label: c.trim(), ...(subjects.length ? { subjects } : {}) };
      });
  }, [d.format, d.line, d.unit, choices, range, me, db.users, db.following]);

  const friends = Object.values(db.users).filter((u) => db.following.includes(u.id) && u.followers < 3000);

  const preview: Challenge = {
    id: "preview", creatorId: db.meId, createdAt: Date.now(), category: d.category, question: d.question || "Your question", title: d.title || undefined,
    format: d.format, line: d.format === "over_under" ? d.line : undefined, unit: d.unit, options,
    entries: !hosting && d.myOptionId ? [{ userId: db.meId, optionId: d.myOptionId, points: d.stakeMode === "bragging" ? 0 : d.stake, at: Date.now() }] : [],
    stakeMode: d.stakeMode, odds: d.odds, forfeit: d.forfeit || undefined, visibility: d.visibility, closesAt: d.closesAtExact ?? Date.now() + d.closesInMin * 60_000,
    resolution: d.resolution, tieRule: d.tieRule, verifier: d.verifier, status: "open", likes: [], shares: 0,
  };

  const closeMin = d.closesAtExact ? Math.max(1, Math.round((d.closesAtExact - Date.now()) / 60_000)) : d.closesInMin;
  const exactOk = !d.closesAtExact || d.closesAtExact > Date.now() + 60_000;

  const valid = [
    d.question.trim().length >= 5,
    d.format === "pick_one" ? options.length >= 2 && new Set(options.map((o) => o.label.toLowerCase())).size === options.length : d.format === "over_under" ? d.line > 0 : d.format === "exact" ? range[1] > range[0] : true,
    hosting || !!d.myOptionId,
    d.stakeMode === "bragging" ? d.forfeit.trim().length > 0 : hosting || (me.points >= MIN_STAKE && d.stake >= MIN_STAKE),
    d.visibility !== "group" || !!d.groupId,
    exactOk,
    true,
  ];

  const next = () => {
    if (step === 1 && !options.some((o) => o.id === d.myOptionId)) set("myOptionId", undefined);
    if (step === 1 && !d.resolution) set("resolution", defaultResolution(d.format, d.unit));
    if (step < STEPS.length - 1) setStep(step + 1);
  };
  const [limit, setLimit] = useState(false);
  const [groupSheet, setGroupSheet] = useState(false);
  const [groupLimit, setGroupLimit] = useState(false);
  const newGroup = () => (!isPlus(me) && ownedGroups(db, db.meId) >= LIMITS.groups ? setGroupLimit(true) : setGroupSheet(true));
  const publish = () => {
    if (!isPlus(me) && openChallenges(db, db.meId) >= LIMITS.openChallenges) return setLimit(true);
    const id = actions.create({ ...d, options, myOptionId: hosting ? undefined : d.myOptionId, resolution: d.resolution || defaultResolution(d.format, d.unit) });
    nav.pop();
    nav.setTab("home");
    setTimeout(() => nav.openSheet({ kind: "share", challengeId: id, justPublished: true }), 60);
  };

  const onQuestion = (q: string) => {
    setD((p) => {
      const g = !formatTouched ? guessFormat(q) : null;
      return { ...p, question: q, ...(g ? { format: g.format, ...(g.unit != null ? { unit: g.unit, line: g.unit === "time" ? p.line : Math.max(0.5, p.unit === "time" ? 3.5 : p.line) } : {}) } : {}) };
    });
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 bg-ink/85 px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)] backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <button onClick={nav.pop} className="grid h-10 w-10 place-items-center rounded-full bg-card hairline" aria-label="Close">
            <X size={18} />
          </button>
          <div className="text-center">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-dim">
              Step {step + 1} of {STEPS.length}
            </div>
            <div className="font-display text-[16px] font-bold">{STEPS[step]}</div>
          </div>
          <div className="w-10" />
        </div>
        <div className="flex gap-1">
          {STEPS.map((_, i) => (
            <button key={i} onClick={() => i < step && setStep(i)} className="h-1 flex-1 overflow-hidden rounded-full bg-surface">
              <div className={cx("h-full rounded-full bg-brand transition-all duration-500", i <= step ? "w-full" : "w-0")} />
            </button>
          ))}
        </div>
      </header>

      <div key={step} className="flex-1 animate-rise px-4 pb-32 pt-3">
        {step === 0 && (
          <>
            <h2 className="mb-1 font-display text-[28px] font-extrabold leading-tight tracking-[-0.03em]">What are you betting on?</h2>
            <p className="mb-5 text-[14px] text-muted">If you can disagree about it, you can put it on Tyche.</p>
            <textarea
              autoFocus
              value={d.question}
              onChange={(e) => onQuestion(e.target.value)}
              placeholder="Will Marcus eat more than 3 plates tonight?"
              rows={3}
              maxLength={140}
              className="mb-1 w-full resize-none rounded-[22px] bg-card p-4 font-display text-[22px] font-bold leading-snug outline-none hairline placeholder:font-semibold placeholder:text-dim focus:shadow-[0_0_0_1.5px_#8247ff]"
            />
            <div className="mb-4 flex justify-between text-[12px] text-dim">
              <span>{guessFormat(d.question) && !formatTouched ? `Looks like ${FORMAT_META[guessFormat(d.question)!.format].label}` : " "}</span>
              <span className="tabular">{d.question.length}/140</span>
            </div>
            {!d.question && (
              <div className="mb-5 flex flex-wrap gap-2">
                {IDEAS.map((i) => (
                  <button key={i.q} onClick={() => { onQuestion(i.q); set("category", i.cat); }} className="rounded-full bg-card px-3 py-1.5 text-[13px] text-muted hairline hover:text-white">
                    {i.q}
                  </button>
                ))}
              </div>
            )}

            <Label>Category</Label>
            <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 no-scrollbar">
              {CATEGORIES.map((c) => (
                <button key={c} onClick={() => set("category", c)} className={cx("shrink-0 rounded-full px-3.5 py-2 text-[13px] font-medium transition", d.category === c ? "bg-white text-ink" : "bg-card text-muted hairline")}>
                  {CATEGORY_EMOJI[c]} {c}
                </button>
              ))}
            </div>

            <Label>Title <Opt /></Label>
            <input value={d.title} onChange={(e) => set("title", e.target.value)} placeholder="ATL → DC Road Trip" className={inputCls} />
            <Label>Description <Opt /></Label>
            <textarea value={d.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Context, house rules, trash talk…" className={cx(inputCls, "h-auto resize-none py-3")} />
            <Label>Photo or video <Opt /></Label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) set("media", await readImage(f));
              }}
            />
            {d.media ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.media} alt="" className="max-h-48 w-full rounded-2xl object-cover" />
                <button onClick={() => set("media", undefined)} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/60" aria-label="Remove">
                  <X size={15} />
                </button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} className="flex h-20 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 text-[14px] text-muted hover:text-white">
                <ImagePlus size={18} /> Add media
              </button>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="mb-4 font-display text-[24px] font-extrabold leading-tight tracking-tight">How should people bet?</h2>
            <div className="mb-6 grid grid-cols-2 gap-2">
              {(Object.keys(FORMAT_META) as Format[]).map((f) => (
                <button
                  key={f}
                  onClick={() => { set("format", f); setFormatTouched(true); }}
                  className={cx("rounded-[22px] p-4 text-left transition active:scale-[0.98]", d.format === f ? "bg-brand/15 glow-soft" : "bg-card hairline")}
                >
                  <div className={cx("mb-3 grid h-10 w-10 place-items-center rounded-2xl", d.format === f ? "bg-brand text-white" : "bg-surface text-lav")}>{FORMAT_ICON[f]}</div>
                  <div className="font-display text-[16px] font-bold">{FORMAT_META[f].label}</div>
                  <div className="mt-0.5 text-[12px] leading-snug text-muted">{FORMAT_META[f].blurb}</div>
                </button>
              ))}
            </div>

            {d.format === "over_under" && (
              <div className="rounded-[22px] bg-card p-4 hairline">
                <Label>Unit</Label>
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {UNITS.map((u) => (
                    <button key={u.id} onClick={() => setD((p) => ({ ...p, unit: u.id, line: u.id === "time" ? (p.unit === "time" ? p.line : 60) : p.unit === "time" ? 3.5 : p.line }))} className={cx("rounded-xl px-3 py-1.5 text-[13px] font-medium", d.unit === u.id ? "bg-white text-ink" : "bg-surface text-muted")}>
                      {u.label}
                    </button>
                  ))}
                </div>
                <Label>Line</Label>
                {d.unit === "time" ? (
                  <div className="flex items-center gap-3">
                    <Stepper value={Math.floor(d.line / 60)} suffix="h" onChange={(h) => set("line", Math.max(1, h * 60 + (d.line % 60)))} />
                    <Stepper value={d.line % 60} suffix="m" step={1} max={59} onChange={(m) => set("line", Math.max(1, Math.floor(d.line / 60) * 60 + m))} />
                  </div>
                ) : (
                  <Stepper value={d.line} step={0.5} suffix={d.unit} wide onChange={(v) => set("line", Math.max(0.5, v))} />
                )}
                <p className="mt-3 text-[13px] text-muted">
                  OVER wins at <b className="text-white">{d.unit === "time" ? fmtMinutes(d.line) : d.line}</b>
                  {d.unit === "time" ? " or longer" : Number.isInteger(d.line) ? " or more" : "+"}. Use a .5 line to avoid ties.
                </p>
              </div>
            )}

            {d.format === "yes_no" && (
              <div className="rounded-[22px] bg-card p-4 text-[14px] text-muted hairline">
                Two sides: <b className="text-white">YES</b> and <b className="text-white">NO</b>. Make sure your question has a clear deadline, like “before 8 PM”.
              </div>
            )}

            {d.format === "pick_one" && (
              <div className="rounded-[22px] bg-card p-4 hairline">
                <Label>Answer choices</Label>
                <div className="mb-3 space-y-2">
                  {choices.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-5 text-center text-[13px] font-bold text-dim">{String.fromCharCode(65 + i)}</span>
                      <input value={c} onChange={(e) => setChoices(choices.map((x, j) => (j === i ? e.target.value : x)))} placeholder={i === 0 ? "Nate & Mya" : i === 1 ? "Chris & Jordan" : "Another option"} className={cx(inputCls, "mb-0 flex-1")} />
                      {choices.length > 2 && (
                        <button onClick={() => setChoices(choices.filter((_, j) => j !== i))} className="grid h-9 w-9 place-items-center rounded-xl bg-surface text-muted" aria-label="Remove">
                          <X size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {choices.length < 8 && (
                  <button onClick={() => setChoices([...choices, ""])} className="mb-4 flex items-center gap-1.5 text-[13px] font-semibold text-lav">
                    <Plus size={15} /> Add choice
                  </button>
                )}
                <Label>Quick add friends</Label>
                <div className="flex flex-wrap gap-1.5">
                  {[me, ...friends].map((u) => {
                    const first = u.name.split(" ")[0];
                    const on = choices.includes(first);
                    return (
                      <button
                        key={u.id}
                        onClick={() => {
                          if (on) {
                            const rest = choices.filter((x) => x !== first);
                            return setChoices(rest.length >= 2 ? rest : [...rest, ...Array(2 - rest.length).fill("")]);
                          }
                          const empty = choices.findIndex((x) => !x.trim());
                          setChoices(empty >= 0 ? choices.map((x, j) => (j === empty ? first : x)) : [...choices, first]);
                        }}
                        className={cx("flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-[13px]", on ? "bg-brand/20 text-white" : "bg-surface text-muted")}
                      >
                        <Avatar user={u} size={22} /> {first}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {d.format === "exact" && (
              <div className="rounded-[22px] bg-card p-4 hairline">
                <Label>Number range</Label>
                <div className="mb-4 flex items-center gap-3">
                  <Stepper value={range[0]} prefix="From" onChange={(v) => setRange([Math.max(0, Math.min(v, range[1] - 1)), range[1]])} />
                  <Stepper value={range[1]} prefix="To" onChange={(v) => setRange([range[0], Math.min(range[0] + 13, Math.max(v, range[0] + 1))])} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {options.map((o) => (
                    <span key={o.id} className="grid h-10 min-w-10 place-items-center rounded-xl bg-surface px-2 font-display font-bold">{o.label}</span>
                  ))}
                </div>
                <p className="mt-3 text-[12px] text-muted">The top value covers anything higher.</p>
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="mb-1 font-display text-[24px] font-extrabold leading-tight tracking-tight">What’s your call?</h2>
            <p className="mb-5 text-[14px] text-muted">{d.question}</p>
            {options.some((o) => o.subjects?.includes(db.meId)) && <p className="-mt-3 mb-4 text-[12px] text-dim">You’re one of the options, so you can’t bet on yourself.</p>}
            <div className={cx("mb-4", hosting && "pointer-events-none opacity-40")}>
              <Outcomes c={{ ...preview, entries: d.myOptionId ? [{ userId: db.meId, optionId: d.myOptionId, points: 0, at: 0 }] : [] }} db={db} onPick={(o) => { set("myOptionId", o.id); setHosting(false); }} />
            </div>
            <button onClick={() => { setHosting(!hosting); set("myOptionId", undefined); }} className="flex items-center gap-2 text-[13px] text-muted">
              <span className={cx("grid h-5 w-5 place-items-center rounded-md", hosting ? "bg-brand" : "border border-white/20")}>{hosting && <Check size={13} strokeWidth={3} />}</span>
              I’m just hosting — no position for me
            </button>
          </>
        )}

        {step === 3 && <StakesStep d={d} set={set} options={options} hosting={hosting} balance={me.points} />}

        {step === 4 && (
          <>
            <h2 className="mb-4 font-display text-[24px] font-extrabold leading-tight tracking-tight">Who can join?</h2>
            <div className="mb-5 space-y-2">
              {(
                [
                  ["friends", <Users size={19} key="f" />, "Friends only", "People you follow back"],
                  ["link", <Link2 size={19} key="l" />, "Invite by link", "Anyone with the link"],
                  ["group", <Lock size={19} key="g" />, "Private group", "Only members of one group"],
                  ["public", <Globe size={19} key="p" />, "Public challenge", "Shows up in Discover"],
                ] as [Visibility, React.ReactNode, string, string][]
              ).map(([v, icon, label, sub]) => (
                <button key={v} onClick={() => set("visibility", v)} className={cx("flex w-full items-center gap-3 rounded-[20px] p-3.5 text-left transition", d.visibility === v ? "bg-brand/15 glow-soft" : "bg-card hairline")}>
                  <span className={cx("grid h-10 w-10 place-items-center rounded-2xl", d.visibility === v ? "bg-brand" : "bg-surface text-lav")}>{icon}</span>
                  <span className="flex-1">
                    <span className="block font-semibold">{label}</span>
                    <span className="block text-[12px] text-muted">{sub}</span>
                  </span>
                  <span className={cx("grid h-5 w-5 place-items-center rounded-full", d.visibility === v ? "bg-brand" : "border border-white/20")}>{d.visibility === v && <Check size={12} strokeWidth={3} />}</span>
                </button>
              ))}
            </div>
            {d.visibility === "group" && (
              <>
                <Label>Group</Label>
                <div className="mb-5 flex flex-wrap gap-2">
                  {db.groups.filter((g) => g.memberIds.includes(db.meId)).map((g) => (
                    <button key={g.id} onClick={() => set("groupId", g.id)} className={cx("rounded-full px-3.5 py-2 text-[13px] font-medium", d.groupId === g.id ? "bg-white text-ink" : "bg-card text-muted hairline")}>
                      {g.emoji} {g.name}
                    </button>
                  ))}
                  <button onClick={newGroup} className="flex items-center gap-1 rounded-full border border-dashed border-lav/40 px-3.5 py-2 text-[13px] font-semibold text-lav active:scale-95">
                    <Plus size={14} /> New group
                  </button>
                </div>
              </>
            )}
            <Label>Invite friends</Label>
            <div className="grid grid-cols-4 gap-2">
              {friends.map((u) => {
                const on = d.invited.includes(u.id);
                return (
                  <button key={u.id} onClick={() => set("invited", on ? d.invited.filter((x) => x !== u.id) : [...d.invited, u.id])} className="flex flex-col items-center gap-1.5 rounded-2xl py-2">
                    <div className="relative">
                      <Avatar user={u} size={52} ring={on} />
                      {on && <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-brand ring-2 ring-ink animate-pop"><Check size={11} strokeWidth={3} /></span>}
                    </div>
                    <span className={cx("w-full truncate text-center text-[12px]", on ? "text-white" : "text-muted")}>{u.name.split(" ")[0]}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <h2 className="mb-4 font-display text-[24px] font-extrabold leading-tight tracking-tight">Rules & resolution</h2>
            <Label>Participation closes</Label>
            <Chips
              value={d.closesAtExact ? -2 : d.closesInMin}
              onChange={(v) =>
                v === -2
                  ? set("closesAtExact", d.closesAtExact ?? defaultExact())
                  : setD((p) => ({ ...p, closesInMin: v, closesAtExact: undefined }))
              }
              options={[[15, "15 min"], [60, "1 hour"], [180, "3 hours"], [minutesUntilTonight(), "Tonight"], [1440, "24 hours"], [4320, "3 days"], [-2, "🗓 Exact time"]]}
            />
            {d.closesAtExact && (
              <div className="-mt-2 mb-5 animate-rise">
                <input
                  type="datetime-local"
                  value={toLocalInput(d.closesAtExact)}
                  min={toLocalInput(Date.now() + 5 * 60_000)}
                  onChange={(e) => {
                    const t = fromLocalInput(e.target.value);
                    if (t) set("closesAtExact", t);
                  }}
                  className="h-12 w-full rounded-2xl bg-card px-4 text-[15px] text-white outline-none [color-scheme:dark] hairline focus:shadow-[0_0_0_1.5px_#8247ff]"
                />
                <p className={cx("mt-1.5 text-[12px]", exactOk ? "text-muted" : "text-loss")}>
                  {exactOk
                    ? `Closes ${new Date(d.closesAtExact).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · in ${fmtMinutes(closeMin)}`
                    : "Pick a time in the future."}
                </p>
              </div>
            )}
            <Label>Event begins</Label>
            <Chips value={d.startsInMin ?? -1} onChange={(v) => set("startsInMin", v < 0 ? null : v)} options={[[-1, "When I start it"], [5, "In 5 min"], [30, "In 30 min"], [120, "In 2 hours"], [closeMin, "When it closes"]]} />
            <Label>How the outcome is decided</Label>
            <textarea value={d.resolution} onChange={(e) => set("resolution", e.target.value)} rows={2} placeholder={defaultResolution(d.format, d.unit)} className={cx(inputCls, "h-auto resize-none py-3")} />
            {d.verifier === "vote" && (
              <>
                <Label>Voting opens</Label>
                <Chips value={d.voteInMin ?? -1} onChange={(v) => set("voteInMin", v < 0 ? null : v)} options={[[-1, "When I end the night"], [180, "In 3 hours"], [minutesUntil(2), "At 2 AM"]]} />
              </>
            )}
            <Label>If it’s a tie</Label>
            <Chips<TieRule> value={d.tieRule} onChange={(v) => set("tieRule", v)} options={[["refund", "Refund everyone"], ["split", "Split the pool"], ["rematch", "Run it back"]]} />
            <Label>Who verifies the result</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["creator", "Me (creator)", "Fastest — you call it"],
                  ["group", "Group confirms", "2 participants sign off"],
                  ["vote", "Everyone votes", "End-of-night vote · no self-votes"],
                  ["source", "Verified source", "Box score, flight data…"],
                ] as [Verifier, string, string][]
              ).map(([v, l, s]) => (
                <button key={v} onClick={() => set("verifier", v)} className={cx("rounded-2xl p-3 text-left", d.verifier === v ? "bg-brand/15 glow-soft" : "bg-card hairline")}>
                  <div className="text-[14px] font-semibold">{l}</div>
                  <div className="text-[11px] text-muted">{s}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 6 && (
          <>
            <h2 className="mb-4 font-display text-[24px] font-extrabold leading-tight tracking-tight">Ready to put it on Tyche?</h2>
            <ShareCard c={preview} />
            <div className="mt-4 divide-y divide-white/[0.05] rounded-[22px] bg-card px-4 hairline">
              {[
                ["Format", FORMAT_META[d.format].label + (d.format === "over_under" ? ` · ${d.unit === "time" ? fmtMinutes(d.line) : `${d.line} ${d.unit}`}` : "")],
                ["Your position", hosting ? "Hosting" : options.find((o) => o.id === d.myOptionId)?.label ?? "—"],
                ["Stakes", d.stakeMode === "bragging" ? `👑 ${d.forfeit}` : `${d.stake} pts · ${d.stakeMode === "odds" ? "custom odds" : "even pool"}`],
                ["Who", { friends: "Friends only", link: "Anyone with link", group: db.groups.find((g) => g.id === d.groupId)?.name ?? "Group", public: "Public" }[d.visibility] + (d.invited.length ? ` · ${d.invited.length} invited` : "")],
                ["Closes", d.closesAtExact ? new Date(d.closesAtExact).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : d.closesInMin >= 1440 ? `${Math.round(d.closesInMin / 1440)} day(s)` : fmtMinutes(d.closesInMin)],
                ["Verified by", { creator: "You", group: "Group confirmation", vote: "Everyone votes (end of night)", source: "Verified source" }[d.verifier]],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4 py-3 text-[14px]">
                  <span className="text-muted">{k}</span>
                  <span className="truncate text-right font-semibold">{v}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <CreateGroupSheet
        open={groupSheet}
        onClose={() => setGroupSheet(false)}
        onCreate={(name, emoji, members) => {
          const id = actions.createGroup(name, emoji, members);
          setD((p) => ({ ...p, visibility: "group", groupId: id, invited: [...new Set([...p.invited, ...members])] }));
          setGroupSheet(false);
          nav.toast(`${emoji} ${name} created`);
        }}
      />
      <LimitSheet
        open={groupLimit}
        onClose={() => setGroupLimit(false)}
        reason="groups"
        title={`${LIMITS.groups} private groups max`}
        body={`Free accounts can run ${LIMITS.groups} private groups. Pick an existing group, or go unlimited with Tyche+.`}
      />
      <LimitSheet
        open={limit}
        onClose={() => setLimit(false)}
        reason="challenges"
        title={`${LIMITS.openChallenges} open challenges max`}
        body={`Free accounts can host ${LIMITS.openChallenges} open challenges at a time. Settle one, or go unlimited with Tyche+.`}
      />
      <footer className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[440px] gap-2 bg-gradient-to-t from-ink via-ink to-transparent px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-6">
        {step > 0 && (
          <Button variant="soft" size="lg" onClick={() => setStep(step - 1)} className="w-28">
            Back
          </Button>
        )}
        {step < STEPS.length - 1 ? (
          <Button size="lg" className="flex-1" disabled={!valid[step]} onClick={next}>
            Continue
          </Button>
        ) : (
          <Button size="lg" className="flex-1" onClick={publish}>
            Publish challenge
          </Button>
        )}
      </footer>
    </div>
  );
}

function StakesStep({ d, set, options, hosting, balance }: { d: Draft; set: <K extends keyof Draft>(k: K, v: Draft[K]) => void; options: Option[]; hosting: boolean; balance: number }) {
  const { me } = useStore();
  const nav = useNav();
  const mine = options.find((o) => o.id === d.myOptionId);
  const odds = mine ? d.odds[mine.id] ?? 2 : 2;
  return (
    <>
      <h2 className="mb-4 font-display text-[24px] font-extrabold leading-tight tracking-tight">Set the stakes</h2>
      <div className="mb-5 grid grid-cols-3 gap-1.5 rounded-2xl bg-card p-1 hairline">
        {(
          [
            ["even", "Even pool"],
            ["odds", "Custom odds"],
            ["bragging", "Bragging rights"],
          ] as const
        ).map(([m, l]) => (
          <button key={m} onClick={() => set("stakeMode", m)} className={cx("rounded-xl py-2.5 text-[12px] font-semibold", d.stakeMode === m ? "bg-surface text-white" : "text-dim")}>
            {l}
          </button>
        ))}
      </div>

      {d.stakeMode === "bragging" ? (
        <>
          <Label>What’s on the line?</Label>
          <input value={d.forfeit} onChange={(e) => set("forfeit", e.target.value)} placeholder="Loser buys the first round" className={inputCls} />
          <div className="flex flex-wrap gap-1.5">
            {["Loser buys the first round 🍻", "Loser drives next time 🚗", "Loser posts an embarrassing pic 📸", "Loser picks up the tab 🧾"].map((f) => (
              <button key={f} onClick={() => set("forfeit", f)} className="rounded-full bg-card px-3 py-1.5 text-[12px] text-muted hairline hover:text-white">
                {f}
              </button>
            ))}
          </div>
        </>
      ) : !hosting && balance < MIN_STAKE ? (
        <div className="rounded-[22px] bg-card p-4 hairline">
          <div className="mb-1 font-semibold">You need {MIN_STAKE} pts to stake</div>
          <p className="mb-4 text-[13px] leading-relaxed text-muted">
            You have {balance} pts.{" "}
            {daysToMinimum(me, balance) === 0 ? "Claim today’s refill on Home and you’re set." : `Free refills get you there in ${daysToMinimum(me, balance)} day${daysToMinimum(me, balance) === 1 ? "" : "s"}.`} Until then, make it for bragging rights, or host without a position.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="white" className="flex-1" onClick={() => set("stakeMode", "bragging")}>
              👑 Bragging rights
            </Button>
            {!isPlus(me) && (
              <Button size="sm" className="flex-1" onClick={() => nav.push({ kind: "plus", reason: "daily" })}>
                ✦ Get {DAILY.plus}/day
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          {!hosting && (
            <>
              <div className="mb-2 flex items-end justify-between">
                <Label>Your points · min {MIN_STAKE}</Label>
                <span className="mb-2 text-[12px] text-muted tabular">Balance {balance.toLocaleString()}</span>
              </div>
              <div className="mb-3 font-display text-[48px] font-extrabold leading-none tracking-tight tabular">
                {d.stake}
                <span className="ml-1.5 text-lg font-semibold text-muted">pts</span>
              </div>
              <input type="range" className="tyche-range mb-3 w-full" min={MIN_STAKE} max={Math.max(MIN_STAKE, Math.min(balance, 500))} step={5} value={d.stake} style={{ ["--p" as string]: `${Math.min(balance, 500) > MIN_STAKE ? ((d.stake - MIN_STAKE) / (Math.min(balance, 500) - MIN_STAKE)) * 100 : 100}%` } as React.CSSProperties} onChange={(e) => set("stake", +e.target.value)} />
              <div className="mb-5 flex gap-1.5">
                {[50, 100, 150, 250, 500].map((p) => (
                  <button key={p} onClick={() => set("stake", p)} disabled={p > balance} className={cx("flex-1 rounded-xl py-2 text-[13px] font-semibold disabled:opacity-30", d.stake === p ? "bg-white text-ink" : "bg-surface text-muted")}>
                    {p}
                  </button>
                ))}
              </div>
            </>
          )}

          {d.stakeMode === "odds" && (
            <div className="mb-5 rounded-[22px] bg-card p-4 hairline">
              <Label>Proposed payout per side</Label>
              <div className="space-y-2">
                {options.slice(0, 8).map((o) => (
                  <div key={o.id} className="flex items-center justify-between">
                    <span className="text-[14px] font-semibold">{o.label}</span>
                    <Stepper value={d.odds[o.id] ?? 2} step={0.1} suffix="x" onChange={(v) => set("odds", { ...d.odds, [o.id]: Math.max(1.1, Math.round(v * 10) / 10) })} />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-[22px] bg-surface/60 p-4">
            <div className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-dim">Potential returns{mine ? ` · ${mine.label}` : ""}</div>
            {hosting ? (
              <p className="text-[14px] text-muted">You’re hosting, so you won’t win or lose points. Everyone else plays the pool.</p>
            ) : d.stakeMode === "odds" ? (
              <div className="space-y-2 text-[14px]">
                <Row k="You stake" v={`${d.stake} pts`} />
                <Row k={`Payout at ${odds.toFixed(1)}x`} v={`${Math.round(d.stake * odds)} pts`} strong />
                <Row k="Profit" v={`+${Math.round(d.stake * odds) - d.stake} pts`} accent />
              </div>
            ) : (
              <div className="space-y-2 text-[14px]">
                {[1, 3, 5].map((n) => (
                  <Row key={n} k={`If ${n} ${n === 1 ? "person takes" : "people take"} the other side`} v={`${d.stake * (n + 1)} pts`} strong={n === 3} />
                ))}
                <p className="pt-1 text-[11px] leading-relaxed text-dim">Even pool: winners split the whole pot by stake size. Assumes others match your {d.stake} pts.</p>
              </div>
            )}
          </div>
          <p className="mt-3 text-center text-[11px] text-dim">Points only. Tyche doesn’t handle real money in this version.</p>
        </>
      )}
    </>
  );
}

function Row({ k, v, accent, strong }: { k: string; v: string; accent?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{k}</span>
      <span className={cx("shrink-0 font-semibold tabular", accent && "text-win", strong && "font-display text-[17px] font-extrabold")}>{v}</span>
    </div>
  );
}

function Stepper({ value, onChange, step = 1, suffix, prefix, max, wide }: { value: number; onChange: (v: number) => void; step?: number; suffix?: string; prefix?: string; max?: number; wide?: boolean }) {
  const clamp = (v: number) => (max != null ? Math.min(max, v) : v);
  return (
    <div className={cx("flex items-center gap-1 rounded-2xl bg-surface p-1", wide && "w-full justify-between")}>
      <button onClick={() => onChange(clamp(Math.max(0, +(value - step).toFixed(2))))} className="grid h-9 w-9 place-items-center rounded-xl bg-raised active:scale-90" aria-label="Decrease">
        <Minus size={16} />
      </button>
      <div className="min-w-16 px-1 text-center font-display text-[18px] font-extrabold tabular">
        {prefix && <span className="mr-1 text-[11px] font-semibold text-muted">{prefix}</span>}
        {step < 1 ? value.toFixed(1).replace(/\.0$/, step === 0.5 ? "" : ".0") : value}
        {suffix && <span className="ml-1 text-[12px] font-semibold text-muted">{suffix}</span>}
      </div>
      <button onClick={() => onChange(clamp(+(value + step).toFixed(2)))} className="grid h-9 w-9 place-items-center rounded-xl bg-raised active:scale-90" aria-label="Increase">
        <Plus size={16} />
      </button>
    </div>
  );
}

function Chips<T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="mb-5 flex flex-wrap gap-1.5">
      {options.map(([v, l]) => (
        <button key={l} onClick={() => onChange(v)} className={cx("rounded-full px-3.5 py-2 text-[13px] font-medium transition", value === v ? "bg-white text-ink" : "bg-card text-muted hairline")}>
          {l}
        </button>
      ))}
    </div>
  );
}

const inputCls = "mb-4 h-12 w-full rounded-2xl bg-card px-4 text-[15px] outline-none hairline placeholder:text-dim focus:shadow-[0_0_0_1.5px_#8247ff]";
const Label = ({ children }: { children: React.ReactNode }) => <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-dim">{children}</div>;
const Opt = () => <span className="normal-case tracking-normal text-dim/70">· optional</span>;

const pad = (n: number) => String(n).padStart(2, "0");
function toLocalInput(t: number) {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string) {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : undefined;
}
/** Two hours out, rounded up to the next quarter hour. */
function defaultExact() {
  const q = 15 * 60_000;
  return Math.ceil((Date.now() + 2 * 3_600_000) / q) * q;
}

function minutesUntil(hour: number) {
  const now = new Date();
  const t = new Date(now);
  t.setHours(hour, 0, 0, 0);
  if (t <= now) t.setDate(t.getDate() + 1);
  return Math.round((t.getTime() - now.getTime()) / 60000);
}

function minutesUntilTonight() {
  const d = new Date();
  const end = new Date(d);
  end.setHours(23, 59, 0, 0);
  return Math.max(30, Math.round((end.getTime() - d.getTime()) / 60000));
}

function defaultResolution(f: Format, unit: string) {
  if (f === "over_under" && unit === "time") return "Creator starts the timer at departure and stops it on arrival.";
  if (f === "over_under") return "Creator keeps the live count. Group confirms the final number.";
  if (f === "pick_one") return "Final result as agreed by the group.";
  if (f === "exact") return "Creator counts. Exact match wins.";
  return "Creator submits, group confirms.";
}
