"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, Check, ChevronDown, FastForward, Flag, ImagePlus, Play, Reply, Send, Share2, Smile, Square, ThumbsUp, Trophy, Users, X } from "lucide-react";
import { DISPUTES_TO_FREEZE, REQUIRED, resultDueAt, tallyVotes, useNow, useStore, voteChoices, voters } from "@/lib/store";
import { useNav } from "@/lib/nav";
import { readImage } from "@/lib/media";
import type { Challenge, Message } from "@/lib/types";
import { CATEGORY_EMOJI, ago, clock, countdown, cx, fmtLine, fmtMinutes, myEntry, statusLabel, timeOfDay, totalPool, winnerFromValue } from "@/lib/utils";
import { Avatar, AvatarStack, BottomSheet, Button, CategoryTag, Segmented, StatusDot, TopBar } from "@/components/ui";
import { LineBadge, Outcomes } from "@/components/challenge/Outcomes";

const REACTIONS = ["😂", "🔥", "💯", "💀", "👀", "❤️"];

export function RoomScreen({ id }: { id: string }) {
  const { db, actions } = useStore();
  const nav = useNav();
  const now = useNow(1000);
  const c = db.challenges.find((x) => x.id === id);
  const [tab, setTab] = useState<"all" | "activity" | "positions">("all");
  const [resultOpen, setResultOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const messages = useMemo(() => db.messages.filter((m) => m.challengeId === id).sort((a, b) => a.at - b.at), [db.messages, id]);
  const count = useRef(messages.length);

  useEffect(() => {
    actions.readRoom(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, messages.length]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    const nearBottom = bottom.current ? bottom.current.getBoundingClientRect().top < window.innerHeight + 220 : false;
    if (messages.length > count.current && ((last?.kind === "chat" && last.userId === db.meId) || nearBottom))
      bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    count.current = messages.length;
  }, [messages.length]);

  if (!c) return null;
  const creator = db.users[c.creatorId];
  const isCreator = c.creatorId === db.meId;
  const status = statusLabel(c, now);
  const mine = myEntry(c, db.meId);
  const shown = tab === "activity" ? messages.filter((m) => m.kind === "system") : messages;

  return (
    <div className="flex min-h-full flex-col">
      <TopBar
        onBack={nav.pop}
        title={c.title ?? c.question}
        sub={
          <span className="inline-flex items-center gap-1.5">
            {CATEGORY_EMOJI[c.category]} {status} · {c.entries.length} in the Room
          </span>
        }
        right={
          <button onClick={() => nav.openSheet({ kind: "share", challengeId: c.id })} className="grid h-10 w-10 place-items-center rounded-full bg-card hairline active:scale-90" aria-label="Share">
            <Share2 size={17} />
          </button>
        }
      />

      <div className="flex-1 px-4">
        {/* ---------- Overview ---------- */}
        <section className="mb-4 rounded-[26px] bg-card p-4 hairline">
          <div className="mb-3 flex items-center gap-2">
            <button onClick={() => nav.push({ kind: "user", id: c.creatorId })} className="flex min-w-0 items-center gap-2">
              <Avatar user={creator} size={28} />
              <span className="truncate text-[13px] font-semibold">@{creator?.username}</span>
            </button>
            <span className="text-[12px] text-dim">· {ago(c.createdAt, now)}</span>
            <div className="ml-auto">
              <StatusDot status={status} />
            </div>
          </div>
          <CategoryTag>{c.category}</CategoryTag>
          <h1 className="mb-2 mt-1 font-display text-[23px] font-extrabold leading-[1.12] tracking-[-0.02em]">{c.question}</h1>
          {c.description && <p className="mb-3 text-[14px] leading-relaxed text-white/70">{c.description}</p>}
          {c.media && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.media} alt="" className="mb-3 max-h-60 w-full rounded-2xl object-cover" />
          )}
          <LineBadge c={c} />
          <Outcomes c={c} db={db} onPick={(o) => status === "Open" && nav.openSheet({ kind: "join", challengeId: c.id, optionId: o.id })} />

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Mini label={c.stakeMode === "bragging" ? "Stakes" : "Total pool"} value={c.stakeMode === "bragging" ? "👑" : `${totalPool(c)}`} />
            <Mini label="Participants" value={c.entries.length} />
            <Mini label={status === "Open" ? "Closes in" : "Status"} value={status === "Open" ? countdown(c.closesAt, now) : status} tone={status === "Live" ? "text-loss" : undefined} />
          </div>
          {c.forfeit && <div className="mt-3 rounded-xl bg-gold/10 px-3 py-2 text-[13px] text-gold">On the line: {c.forfeit}</div>}

          {status === "Open" && (
            <div className="mt-4 flex gap-2">
              {mine ? (
                <button onClick={() => nav.openSheet({ kind: "join", challengeId: c.id, optionId: mine.optionId })} className="flex h-12 flex-1 items-center justify-between rounded-2xl bg-brand/15 px-4 text-left">
                  <span className="text-[13px] text-lav">
                    You’re on <b className="text-white">{c.options.find((o) => o.id === mine.optionId)?.label}</b>
                    {mine.points ? ` · ${mine.points} pts` : ""}
                  </span>
                  <span className="text-[13px] font-semibold text-lav">Change</span>
                </button>
              ) : (
                <Button size="lg" className="flex-1" onClick={() => nav.openSheet({ kind: "join", challengeId: c.id })}>
                  Join challenge
                </Button>
              )}
              {isCreator && (
                <Button size="lg" variant="white" onClick={() => actions.start(c.id)}>
                  <Play size={16} fill="currentColor" /> Start
                </Button>
              )}
            </div>
          )}
          {c.status === "open" && c.startsAt && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-surface/70 px-3 py-2 text-[13px] text-muted">
              <span>⏱</span>
              <span>
                Starts automatically at <b className="text-white">{timeOfDay(c.startsAt)}</b> · in {countdown(c.startsAt, now)}
              </span>
            </div>
          )}
          {c.verifier === "vote" && c.status !== "settled" && c.status !== "vote" && (
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-lav/10 px-3 py-2 text-[13px] text-lav">
              <span>🗳️</span>
              <span>Everyone votes {c.voteAt ? `at ${timeOfDay(c.voteAt)}` : "when the night ends"}. You can’t bet or vote on yourself.</span>
            </div>
          )}
          {status === "Locked" && isCreator && (
            <Button size="lg" className="mt-4 w-full" onClick={() => actions.start(c.id)}>
              <Play size={16} fill="currentColor" /> Start the event
            </Button>
          )}
          <details className="group mt-3">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-[12px] font-semibold text-dim">
              Rules & resolution <ChevronDown size={14} className="transition group-open:rotate-180" />
            </summary>
            <div className="mt-2 space-y-1.5 text-[13px] text-muted">
              <p>
                <b className="text-white/80">Outcome:</b> {c.resolution}
              </p>
              <p>
                <b className="text-white/80">Verified by:</b> {{ creator: "Creator", group: `Group confirmation (${REQUIRED} sign-offs)`, vote: "Everyone votes (end of night)", source: "Verified source" }[c.verifier]}
              </p>
              <p>
                <b className="text-white/80">Ties:</b> {{ refund: "Everyone gets refunded", split: "Pool is split", rematch: "Run it back" }[c.tieRule]}
              </p>
              <p>
                <b className="text-white/80">Closes:</b> {new Date(c.closesAt).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}
              </p>
            </div>
          </details>
        </section>

        {c.status === "live" && <LivePanel c={c} isCreator={isCreator} onSubmit={() => setResultOpen(true)} />}
        {c.status === "review" && <ReviewPanel c={c} onResubmit={() => setResultOpen(true)} />}
        {c.status === "vote" && <VotePanel c={c} onResubmit={() => setResultOpen(true)} />}
        {c.status === "settled" && <RecapPanel c={c} />}

        {/* ---------- Chat & activity ---------- */}
        <Segmented
          value={tab}
          onChange={setTab}
          className="mb-3"
          options={[
            { id: "all", label: "Chat" },
            { id: "activity", label: "Activity" },
            { id: "positions", label: `Positions ${c.entries.length}` },
          ]}
        />

        {tab === "positions" ? (
          <Positions c={c} />
        ) : (
          <div className="pb-4">
            {shown.map((m, i) => (
              <MessageRow key={m.id} m={m} prev={shown[i - 1]} all={messages} />
            ))}
          </div>
        )}
        <div ref={bottom} />
      </div>

      {tab !== "positions" && <Composer challengeId={c.id} />}
      {resultOpen && <ResultSheet c={c} onClose={() => setResultOpen(false)} />}
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-2xl bg-surface/70 px-2 py-2.5">
      <div className={cx("font-display text-[17px] font-extrabold tabular", tone)}>{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}

// ---------------- Live ----------------

const TRIP_UPDATES = [
  ["📍", "Entered South Carolina"],
  ["📍", "Entered North Carolina"],
  ["📍", "Entered Virginia"],
  ["⛽", "Gas stop"],
  ["🚧", "Hit traffic"],
  ["🧇", "Waffle House stop"],
];

function LivePanel({ c, isCreator, onSubmit }: { c: Challenge; isCreator: boolean; onSubmit: () => void }) {
  const { db, actions } = useStore();
  const now = useNow(1000);
  const [note, setNote] = useState("");
  const started = c.live?.startedAt ?? now;
  const ended = c.live?.endedAt;
  const elapsed = (ended ?? now) - started;
  const timed = c.format === "over_under" && c.unit === "time" && c.line != null;
  const counted = c.format === "over_under" && c.unit !== "time" && c.line != null;
  const creator = db.users[c.creatorId];

  let leader: string | null = null;
  if (timed) leader = elapsed >= c.line! * 60_000 ? "OVER" : "UNDER";
  if (counted) leader = (c.live?.counter ?? 0) >= c.line! ? "OVER" : "UNDER";

  return (
    <section className="relative mb-4 overflow-hidden rounded-[26px] bg-[radial-gradient(120%_120%_at_100%_0%,rgba(255,93,115,0.18),#151720_55%)] p-4 hairline">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-loss px-2 py-0.5 text-[10px] font-black uppercase tracking-wider">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> {ended ? "Ended" : "Live"}
        </span>
        <span className="text-[12px] text-muted">Started {timeOfDay(started)}</span>
        {leader && (
          <span className={cx("ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold", leader === "OVER" ? "bg-brand/25 text-lav" : "bg-white/10 text-white")}>
            {ended ? `${leader} wins` : leader === "OVER" && (timed || counted) ? "OVER has hit" : `${leader} on pace`}
          </span>
        )}
      </div>

      {counted ? (
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display text-[56px] font-extrabold leading-none tabular">{c.live?.counter ?? 0}</div>
            <div className="mt-1 text-[13px] text-muted">
              {c.unit} · line {fmtLine(c)}
            </div>
          </div>
          {isCreator && !ended && (
            <div className="flex gap-2">
              <button onClick={() => actions.bump(c.id, -1)} className="grid h-14 w-14 place-items-center rounded-2xl bg-surface text-2xl font-bold active:scale-90">−</button>
              <button onClick={() => actions.bump(c.id, 1)} className="grid h-14 w-14 place-items-center rounded-2xl bg-brand text-2xl font-bold glow active:scale-90">+</button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="font-display text-[48px] font-extrabold leading-none tracking-tight tabular">{clock(elapsed)}</div>
          <div className="mt-1 text-[13px] text-muted">{timed ? `elapsed · line ${fmtLine(c)}` : "elapsed"}</div>
          {timed && (
            <>
              <div className="relative mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div className={cx("absolute inset-y-0 left-0 rounded-full transition-all duration-1000", leader === "OVER" ? "bg-gradient-to-r from-brand to-loss" : "bg-gradient-to-r from-brand to-lav")} style={{ width: `${Math.min(100, (elapsed / (c.line! * 60_000)) * 100)}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-dim tabular">
                <span>{timeOfDay(started)}</span>
                <span>Line hits {timeOfDay(started + c.line! * 60_000)}</span>
              </div>
            </>
          )}
        </>
      )}

      <div className="mt-4 flex items-center gap-2">
        <AvatarStack users={c.entries.map((e) => db.users[e.userId])} size={22} max={7} />
        <span className="text-[12px] text-muted">{c.entries.length} watching</span>
      </div>

      {isCreator ? (
        <div className="mt-4 border-t border-white/5 pt-4">
          {!ended && (
            <>
              <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 no-scrollbar">
                {(c.category === "Road Trip" ? TRIP_UPDATES : [["📣", "Update"], ["🔥", "It’s getting close"], ["😬", "Momentum shift"]]).map(([i, t]) => (
                  <button key={t} onClick={() => actions.update(c.id, i, t)} className="shrink-0 rounded-full bg-surface px-3 py-1.5 text-[12px] font-medium active:scale-95">
                    {i} {t}
                  </button>
                ))}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!note.trim()) return;
                  actions.update(c.id, "📣", note.trim());
                  setNote("");
                }}
                className="mb-3 flex gap-2"
              >
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Post a live update…" className="h-10 min-w-0 flex-1 rounded-xl bg-surface px-3 text-[14px] outline-none placeholder:text-dim" />
                <Button size="sm" variant="soft" type="submit" className="h-10">Post</Button>
              </form>
            </>
          )}
          <div className="flex gap-2">
            {timed && !ended && (
              <Button variant="soft" size="md" onClick={() => actions.fastForward(c.id, 60)} className="shrink-0">
                <FastForward size={15} /> 1h
              </Button>
            )}
            {timed && !ended ? (
              <Button size="md" variant="white" className="flex-1" onClick={() => actions.stop(c.id)}>
                <Square size={14} fill="currentColor" /> {c.category === "Road Trip" ? "We’ve arrived — stop" : "Stop timer"}
              </Button>
            ) : (
              c.verifier === "vote" ? (
                <Button size="md" className="flex-1" onClick={() => actions.openVoting(c.id)}>
                  🌙 End the night — open voting
                </Button>
              ) : (
                <Button size="md" className="flex-1" onClick={onSubmit}>
                  <Flag size={15} /> Submit result
                </Button>
              )
            )}
          </div>
          {timed && !ended && <p className="mt-2 text-[11px] text-dim">⏩ 1h is a demo control to simulate time passing.</p>}
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-3 border-t border-white/5 pt-4">
          <Avatar user={creator} size={30} />
          <span className="flex-1 text-[13px] text-muted">{c.verifier === "vote" ? `Waiting on @${creator?.username} to open voting${c.voteAt ? ` (opens automatically ${timeOfDay(c.voteAt)})` : ""}` : `Waiting on @${creator?.username} to submit the result`}</span>
          <Button size="sm" variant="soft" onClick={() => actions.nudge(c.id)}>
            👋 Nudge
          </Button>
        </div>
      )}
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2 text-[12px] text-muted">
        <span className="flex-1">
          Result due by <b className="text-white">{new Date(resultDueAt(c)).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}</b> ({countdown(resultDueAt(c), now)}). After that, participants vote.
        </span>
        <button onClick={() => actions.demoDeadline(c.id)} className="shrink-0 rounded-lg bg-surface px-2 py-1 text-[11px] font-semibold text-lav" title="Demo control">
          ⏩ Skip
        </button>
      </div>
    </section>
  );
}

function ResultSheet({ c, onClose }: { c: Challenge; onClose: () => void }) {
  const { actions } = useStore();
  const nav = useNav();
  const measured = c.unit === "time" && c.live?.startedAt ? Math.max(1, Math.round(((c.live.endedAt ?? Date.now()) - c.live.startedAt) / 60000)) : c.live?.counter;
  const suggested = measured != null ? winnerFromValue(c, measured) : null;
  const [pick, setPick] = useState<string | undefined>(suggested ?? undefined);
  const [evidence, setEvidence] = useState<string | undefined>();
  const file = useRef<HTMLInputElement>(null);
  return (
    <BottomSheet open onClose={onClose} title="Submit the result">
      {measured != null && (
        <div className="mb-4 rounded-2xl bg-surface p-4">
          <div className="text-[12px] text-muted">{c.unit === "time" ? "Final time" : "Final count"}</div>
          <div className="font-display text-[32px] font-extrabold tabular">{c.unit === "time" ? fmtMinutes(measured) : measured}</div>
          <div className="text-[13px] text-muted">Line {fmtLine(c)} → <b className="text-white">{c.options.find((o) => o.id === suggested)?.label ?? "—"}</b></div>
        </div>
      )}
      <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-dim">Winning outcome</div>
      <div className={cx("mb-4 grid gap-2", c.format === "exact" ? "grid-cols-4" : "grid-cols-2")}>
        {c.options.map((o) => (
          <button key={o.id} onClick={() => setPick(o.id)} className={cx("rounded-2xl px-3 py-3 font-display font-bold", pick === o.id ? "bg-brand glow" : "bg-surface")}>
            {o.label}
          </button>
        ))}
        <button onClick={() => setPick("__tie")} className={cx("rounded-2xl px-3 py-3 text-[14px] font-semibold", pick === "__tie" ? "bg-white text-ink" : "bg-surface text-muted")}>
          Tie / Push
        </button>
      </div>
      <input ref={file} type="file" accept="image/*" className="hidden" onChange={async (e) => e.target.files?.[0] && setEvidence(await readImage(e.target.files[0]))} />
      {evidence ? (
        <div className="relative mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={evidence} alt="Evidence" className="max-h-44 w-full rounded-2xl object-cover" />
          <button onClick={() => setEvidence(undefined)} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/60" aria-label="Remove"><X size={15} /></button>
        </div>
      ) : (
        <button onClick={() => file.current?.click()} className="mb-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 text-[14px] text-muted">
          <Camera size={17} /> Add photo evidence (optional)
        </button>
      )}
      <Button
        size="lg"
        className="w-full"
        disabled={!pick}
        onClick={() => {
          actions.submit(c.id, pick!, measured ?? undefined, evidence);
          onClose();
          nav.toast(c.verifier === "creator" ? "Result final — payouts sent" : "Result submitted for confirmation");
        }}
      >
        Submit {pick === "__tie" ? "tie" : c.options.find((o) => o.id === pick)?.label ?? ""}
      </Button>
      <p className="mt-2 text-center text-[11px] text-dim">{c.verifier === "creator" ? "You verify this one — it settles immediately." : `Needs ${REQUIRED} confirmations from participants.`}</p>
    </BottomSheet>
  );
}

function ReviewPanel({ c, onResubmit }: { c: Challenge; onResubmit: () => void }) {
  const { db, actions } = useStore();
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");
  const r = c.result!;
  const isIn = c.entries.some((e) => e.userId === db.meId) || c.creatorId === db.meId;
  const confirmed = r.confirmations.includes(db.meId);
  const disputed = r.disputes.includes(db.meId);
  const label = r.optionId === "__tie" ? "Tie" : c.options.find((o) => o.id === r.optionId)?.label;
  const isCreator = c.creatorId === db.meId;
  return (
    <section className="mb-4 rounded-[26px] bg-[radial-gradient(120%_120%_at_100%_0%,rgba(255,200,92,0.16),#151720_55%)] p-4 hairline">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-gold">Awaiting confirmation</div>
      <div className="font-display text-[26px] font-extrabold tracking-tight">
        {label} {r.optionId !== "__tie" && "wins"}
        {r.value != null && <span className="ml-2 text-[16px] font-semibold text-muted">{c.unit === "time" ? fmtMinutes(r.value) : `${r.value} ${c.unit ?? ""}`}</span>}
      </div>
      <div className="mb-3 text-[13px] text-muted">Submitted by @{db.users[r.submittedBy]?.username ?? "vote"} · {ago(r.submittedAt)}</div>
      {r.evidence && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.evidence} alt="Evidence" className="mb-3 max-h-48 w-full rounded-2xl object-cover" />
      )}
      <div className="mb-4 flex items-center gap-2">
        <div className="flex gap-1">
          {Array.from({ length: REQUIRED }).map((_, i) => (
            <span key={i} className={cx("h-1.5 w-8 rounded-full", i < r.confirmations.length ? "bg-gold" : "bg-white/10")} />
          ))}
        </div>
        <span className="text-[12px] text-muted">
          {Math.min(r.confirmations.length, REQUIRED)}/{REQUIRED} confirmations
        </span>
        <div className="ml-auto">
          <AvatarStack users={r.confirmations.map((id) => db.users[id])} size={20} />
        </div>
      </div>
      {r.disputes.length > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-loss/10 px-3 py-2 text-[12px] text-loss">
          <AlertTriangle size={14} />
          <span className="flex-1">
            {r.disputes.length}/{DISPUTES_TO_FREEZE} disputes · at {DISPUTES_TO_FREEZE} the result freezes and goes to a vote
          </span>
        </div>
      )}
      {isIn && !confirmed && !disputed && !disputing && (
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => actions.confirm(c.id)}>
            <ThumbsUp size={16} /> {c.verifier === "vote" ? "Vote: agree" : "Confirm"}
          </Button>
          <Button variant="danger" onClick={() => setDisputing(true)}>
            <AlertTriangle size={16} /> Dispute
          </Button>
        </div>
      )}
      {disputing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            actions.dispute(c.id, reason.trim());
            setDisputing(false);
          }}
          className="flex gap-2"
        >
          <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What’s wrong with this result?" className="h-11 min-w-0 flex-1 rounded-xl bg-surface px-3 text-[14px] outline-none placeholder:text-dim" />
          <Button variant="danger" type="submit">Send</Button>
        </form>
      )}
      {confirmed && <div className="flex items-center gap-2 text-[13px] text-win"><Check size={16} /> {isCreator ? "Submitted. Waiting on the group to confirm." : "You confirmed. Waiting on the group."}</div>}
      {disputed && <div className="text-[13px] text-loss">You disputed this result. One more dispute sends it to a vote, or the creator can resubmit.</div>}
      {isCreator && (
        <Button variant="soft" size="sm" className="mt-3 w-full" onClick={onResubmit}>
          <Camera size={15} /> Resubmit with evidence
        </Button>
      )}
    </section>
  );
}

function RecapPanel({ c }: { c: Challenge }) {
  const { db } = useStore();
  const nav = useNav();
  const r = c.result!;
  const tie = r.optionId === "__tie";
  const winner = c.options.find((o) => o.id === r.optionId);
  const losers = c.options.filter((o) => o.id !== r.optionId);
  const myNet = r.payouts?.[db.meId];
  const rows = [...c.entries].sort((a, b) => (r.payouts?.[b.userId] ?? 0) - (r.payouts?.[a.userId] ?? 0));
  const top = rows[0];
  const duration = c.live?.startedAt && c.live?.endedAt ? fmtMinutes(Math.round((c.live.endedAt - c.live.startedAt) / 60000)) : null;

  return (
    <section className="mb-4 overflow-hidden rounded-[26px] bg-card hairline">
      <div className="relative bg-[radial-gradient(100%_120%_at_50%_0%,rgba(130,71,255,0.55),transparent_70%)] px-4 pb-5 pt-6 text-center">
        <div className="mx-auto mb-3 grid h-14 w-14 animate-pop place-items-center rounded-2xl bg-white/10 text-gold">
          <Trophy size={28} />
        </div>
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-lav">Final result</div>
        <div className="font-display text-[34px] font-extrabold leading-tight tracking-tight">{tie ? (c.vote && !Object.keys(c.vote.votes).length ? "Everyone refunded" : "It’s a tie") : `${winner?.label} wins`}</div>
        {r.value != null && <div className="text-[14px] text-muted">{c.unit === "time" ? `Finished in ${fmtMinutes(r.value)}` : `Final: ${r.value} ${c.unit ?? ""}`} · line {fmtLine(c)}</div>}
        {!tie && losers.length > 0 && <div className="mt-1 text-[13px] text-dim">{losers.map((o) => o.label).join(", ")} lost</div>}
        {myNet != null && (
          <div className={cx("mx-auto mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 font-display text-[18px] font-extrabold", myNet > 0 ? "bg-win/15 text-win" : myNet < 0 ? "bg-loss/15 text-loss" : "bg-white/10 text-white")}>
            {myNet > 0 ? `You won +${myNet} pts` : myNet < 0 ? `You lost ${Math.abs(myNet)} pts` : "Stake refunded"}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 border-y border-white/5 text-center">
        <Stat k="Pool" v={c.stakeMode === "bragging" ? "👑" : `${totalPool(c)}`} />
        <Stat k="Players" v={c.entries.length} />
        <Stat k="Duration" v={duration ?? "—"} />
      </div>
      <div className="p-4">
        <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-dim">Final positions</div>
        <div className="space-y-1">
          {rows.map((e) => {
            const u = db.users[e.userId];
            const net = r.payouts?.[e.userId] ?? 0;
            return (
              <div key={e.userId} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
                <Avatar user={u} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold">{e.userId === db.meId ? "You" : u?.name}</div>
                  <div className="text-[12px] text-muted">
                    {c.options.find((o) => o.id === e.optionId)?.label}
                    {e.points ? ` · ${e.points} pts` : ""}
                  </div>
                </div>
                <span className={cx("font-display text-[15px] font-extrabold tabular", net > 0 ? "text-win" : net < 0 ? "text-loss" : "text-muted")}>{net > 0 ? `+${net}` : net}</span>
              </div>
            );
          })}
        </div>
        {c.vote && Object.keys(c.vote.votes).length > 0 && (
          <div className="mt-3 rounded-xl bg-surface/70 px-3 py-2.5">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-dim">The votes{c.vote.round === 2 ? " · runoff" : ""}</div>
            {tallyVotes(c).ranked.map(([id, n]) => (
              <div key={id} className="flex items-center justify-between py-0.5 text-[13px]">
                <span className={id === r.optionId ? "font-semibold text-white" : "text-muted"}>{id === "__tie" ? "Tie / refund" : c.options.find((o) => o.id === id)?.label}</span>
                <span className="font-semibold tabular">{n} vote{n === 1 ? "" : "s"}</span>
              </div>
            ))}
          </div>
        )}
        {top && (r.payouts?.[top.userId] ?? 0) > 0 && (
          <p className="mt-3 rounded-xl bg-surface/70 px-3 py-2 text-[13px] text-muted">
            🏅 Biggest win: <b className="text-white">{top.userId === db.meId ? "You" : db.users[top.userId]?.name.split(" ")[0]}</b> took home +{r.payouts?.[top.userId]} pts.
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <Button variant="soft" className="flex-1" onClick={() => nav.openSheet({ kind: "share", challengeId: c.id })}>
            <Share2 size={16} /> Share result
          </Button>
          <Button
            className="flex-1"
            onClick={() =>
              nav.push({
                kind: "create",
                prefill: { question: c.question, title: c.title ?? "", category: c.category, format: c.format, line: c.line ?? 60, unit: c.unit ?? "time", options: c.options, visibility: c.visibility, groupId: c.groupId },
              })
            }
          >
            Run it back
          </Button>
        </div>
      </div>
    </section>
  );
}

function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="border-r border-white/5 py-3 last:border-0">
      <div className="font-display text-[17px] font-extrabold tabular">{v}</div>
      <div className="text-[11px] text-muted">{k}</div>
    </div>
  );
}

function Positions({ c }: { c: Challenge }) {
  const { db } = useStore();
  const nav = useNav();
  return (
    <div className="space-y-3 pb-8">
      {c.options.map((o) => {
        const list = c.entries.filter((e) => e.optionId === o.id).sort((a, b) => b.points - a.points);
        if (!list.length && c.options.length > 4) return null;
        return (
          <div key={o.id} className="rounded-[22px] bg-card p-4 hairline">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-display text-[17px] font-extrabold">{o.label}</span>
              <span className="text-[12px] text-muted tabular">
                <Users size={12} className="mr-1 inline" />
                {list.length} · {list.reduce((a, e) => a + e.points, 0)} pts
              </span>
            </div>
            {list.length ? (
              list.map((e) => (
                <button key={e.userId} onClick={() => nav.push({ kind: "user", id: e.userId })} className="flex w-full items-center gap-3 py-1.5 text-left">
                  <Avatar user={db.users[e.userId]} size={30} />
                  <span className="flex-1 truncate text-[14px]">{e.userId === db.meId ? "You" : db.users[e.userId]?.name}</span>
                  <span className="text-[12px] text-dim">{ago(e.at)}</span>
                  <span className="w-14 text-right text-[13px] font-semibold tabular">{e.points ? `${e.points}` : "—"}</span>
                </button>
              ))
            ) : (
              <div className="text-[13px] text-dim">Nobody yet.</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------- Chat ----------------

function MessageRow({ m, prev, all }: { m: Message; prev?: Message; all: Message[] }) {
  const { db, actions } = useStore();
  const [menu, setMenu] = useState(false);
  const { setReply } = useReply();

  if (m.kind === "system") {
    return (
      <div className="my-2 flex animate-fade justify-center">
        <div className="inline-flex max-w-[92%] items-start gap-2 rounded-2xl border border-lav/15 bg-lav/[0.06] px-3 py-1.5 text-[12px] leading-snug">
          <span>{m.icon}</span>
          <span className="text-white/80">
            {m.text} <span className="whitespace-nowrap text-dim">· {timeOfDay(m.at)}</span>
          </span>
        </div>
      </div>
    );
  }

  const mine = m.userId === db.meId;
  const u = m.userId ? db.users[m.userId] : undefined;
  const grouped = prev && prev.kind === "chat" && prev.userId === m.userId && m.at - prev.at < 4 * 60_000;
  const replied = m.replyTo ? all.find((x) => x.id === m.replyTo) : undefined;
  const reactions = Object.entries(m.reactions);

  return (
    <div className={cx("flex animate-rise gap-2", mine ? "flex-row-reverse" : "", grouped ? "mt-0.5" : "mt-3")}>
      <div className="w-8 shrink-0">{!mine && !grouped && <Avatar user={u} size={32} />}</div>
      <div className={cx("flex max-w-[76%] flex-col", mine ? "items-end" : "items-start")}>
        {!grouped && (
          <div className={cx("mb-1 flex items-baseline gap-1.5 px-1 text-[12px]", mine && "flex-row-reverse")}>
            <span className="font-semibold text-white/90">{mine ? "You" : u?.name.split(" ")[0]}</span>
            <span className="text-dim">{timeOfDay(m.at)}</span>
          </div>
        )}
        {menu && (
          <div className="mb-1.5 flex animate-pop items-center gap-0.5 rounded-full bg-raised p-1 shadow-xl">
            {REACTIONS.map((r) => (
              <button key={r} onClick={() => { actions.react(m.id, r); setMenu(false); }} className="grid h-8 w-8 place-items-center rounded-full text-lg transition hover:scale-125 hover:bg-white/10">
                {r}
              </button>
            ))}
            <button onClick={() => { setReply(m); setMenu(false); }} className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-white/10" aria-label="Reply">
              <Reply size={16} />
            </button>
          </div>
        )}
        <button
          onClick={() => setMenu(!menu)}
          className={cx(
            "overflow-hidden text-left text-[15px] leading-snug transition active:scale-[0.98]",
            mine ? "rounded-[20px] rounded-br-md bg-brand text-white" : "rounded-[20px] rounded-bl-md bg-surface text-white",
            m.image ? "p-1" : "px-3.5 py-2.5",
          )}
        >
          {replied && (
            <div className={cx("mb-1.5 rounded-xl border-l-2 px-2.5 py-1 text-[12px]", mine ? "border-white/60 bg-white/15 text-white/85" : "border-lav bg-white/5 text-muted", m.image && "mx-2 mt-2")}>
              <b>{replied.userId === db.meId ? "You" : db.users[replied.userId ?? ""]?.name.split(" ")[0]}</b> · <span className="line-clamp-1">{replied.text || "Photo"}</span>
            </div>
          )}
          {m.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.image} alt="" className="max-h-64 rounded-[16px] object-cover" />
          )}
          {m.text && <div className={cx(m.image && "px-2.5 pb-1.5 pt-1.5")}>{m.text}</div>}
        </button>
        {reactions.length > 0 && (
          <div className={cx("-mt-1.5 flex gap-1 px-2", mine && "flex-row-reverse")}>
            {reactions.map(([emoji, ids]) => (
              <button
                key={emoji}
                onClick={() => actions.react(m.id, emoji)}
                className={cx("flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[12px] ring-2 ring-ink transition active:scale-90", ids.includes(db.meId) ? "bg-brand/40" : "bg-raised")}
              >
                {emoji} <span className="text-[11px] font-semibold tabular text-white/80">{ids.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// reply state shared between rows and composer (module-level store keeps it simple)
let replyListeners: ((m: Message | null) => void)[] = [];
let currentReply: Message | null = null;
function useReply() {
  const [reply, setLocal] = useState<Message | null>(currentReply);
  useEffect(() => {
    replyListeners.push(setLocal);
    return () => {
      replyListeners = replyListeners.filter((l) => l !== setLocal);
    };
  }, []);
  const setReply = (m: Message | null) => {
    currentReply = m;
    replyListeners.forEach((l) => l(m));
  };
  return { reply, setReply };
}

const QUICK = ["😂", "💀", "🔥", "💯", "👀", "😤", "🙏", "🏁"];

function Composer({ challengeId }: { challengeId: string }) {
  const { db, actions } = useStore();
  const { reply, setReply } = useReply();
  const [text, setText] = useState("");
  const [emoji, setEmoji] = useState(false);
  const [image, setImage] = useState<string | undefined>();
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => () => setReply(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const send = () => {
    if (!text.trim() && !image) return;
    actions.send(challengeId, text, { replyTo: reply?.id, image });
    setText("");
    setImage(undefined);
    setReply(null);
    setEmoji(false);
  };

  return (
    <div className="sticky bottom-0 z-20 border-t border-white/[0.06] bg-ink/90 px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-2 backdrop-blur-xl">
      {reply && (
        <div className="mb-2 flex items-center gap-2 rounded-xl bg-card px-3 py-2 text-[12px]">
          <Reply size={14} className="text-lav" />
          <span className="min-w-0 flex-1 truncate text-muted">
            Replying to <b className="text-white">{reply.userId === db.meId ? "yourself" : db.users[reply.userId ?? ""]?.name.split(" ")[0]}</b> · {reply.text}
          </span>
          <button onClick={() => setReply(null)} aria-label="Cancel reply"><X size={14} /></button>
        </div>
      )}
      {image && (
        <div className="relative mb-2 inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" className="h-20 rounded-xl object-cover" />
          <button onClick={() => setImage(undefined)} className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-raised" aria-label="Remove"><X size={12} /></button>
        </div>
      )}
      {emoji && (
        <div className="mb-2 flex animate-rise justify-between rounded-2xl bg-card px-2 py-1.5">
          {QUICK.map((e) => (
            <button key={e} onClick={() => setText((t) => t + e)} className="grid h-9 w-9 place-items-center rounded-xl text-xl hover:bg-surface">{e}</button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={async (e) => e.target.files?.[0] && setImage(await readImage(e.target.files[0], 700))} />
        <button onClick={() => file.current?.click()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-card text-muted hairline" aria-label="Attach image">
          <ImagePlus size={18} />
        </button>
        <div className="flex min-h-10 flex-1 items-center rounded-[20px] bg-card pl-4 pr-1 hairline focus-within:shadow-[0_0_0_1.5px_#8247ff]">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Talk your talk…"
            className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-dim"
          />
          <button onClick={() => setEmoji(!emoji)} className={cx("grid h-8 w-8 place-items-center rounded-full", emoji ? "text-lav" : "text-dim")} aria-label="Emoji">
            <Smile size={19} />
          </button>
        </div>
        <button onClick={send} disabled={!text.trim() && !image} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-white glow transition active:scale-90 disabled:opacity-40 disabled:shadow-none" aria-label="Send">
          <Send size={17} />
        </button>
      </div>
    </div>
  );
}


function VotePanel({ c, onResubmit }: { c: Challenge; onResubmit: () => void }) {
  const { db, actions } = useStore();
  const now = useNow(30_000);
  const v = c.vote!;
  const { counts, total, quorum } = tallyVotes(c);
  const mine = v.votes[db.meId];
  const everyone = voters(c);
  const canVote = everyone.includes(db.meId);
  const isCreator = c.creatorId === db.meId;
  const hidden = v.reason === "participants";
  const allowed = new Set(voteChoices(c, db.meId));
  const proposed = v.proposed ? (v.proposed === "__tie" ? "Tie" : c.options.find((o) => o.id === v.proposed)?.label) : null;
  const choices = voteChoices(c).map((id) => (id === "__tie" ? { id, label: "Tie / refund" } : c.options.find((o) => o.id === id)!)).filter(Boolean);
  const voted = Object.keys(v.votes);
  const title = hidden
    ? v.round === 2
      ? "Tie! Runoff vote."
      : c.question
    : v.reason === "deadline"
      ? "No result was submitted. The group decides."
      : `@${db.users[c.result?.submittedBy ?? ""]?.username ?? "creator"} said ${proposed}. Not everyone agrees.`;
  return (
    <section className="mb-4 rounded-[26px] bg-[radial-gradient(120%_120%_at_100%_0%,rgba(182,154,255,0.22),#151720_55%)] p-4 hairline">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-lav">🗳️ {hidden ? (v.round === 2 ? "Runoff" : "End-of-night vote") : v.reason === "deadline" ? "Result overdue" : "Result disputed"}</div>
      <div className="font-display text-[22px] font-extrabold leading-tight tracking-tight">{title}</div>
      <p className="mb-4 mt-1.5 text-[13px] text-muted">
        {hidden
          ? `Votes stay hidden until everyone has voted or time runs out (${countdown(v.endsAt, now)}). Most votes wins. You can’t vote for yourself.`
          : `Majority wins once ${quorum} vote${quorum === 1 ? "" : "s"} are in. Voting closes in ${countdown(v.endsAt, now)}; if nobody votes, everyone is refunded.`}
      </p>
      <div className="mb-4 space-y-1.5">
        {choices.map((o) => {
          const n = counts[o.id] ?? 0;
          const pct = !hidden && total ? Math.round((n / total) * 100) : 0;
          const on = mine === o.id;
          const self = !allowed.has(o.id);
          return (
            <button
              key={o.id}
              disabled={!canVote || self}
              onClick={() => actions.vote(c.id, o.id)}
              className={cx("relative flex w-full items-center gap-3 overflow-hidden rounded-2xl px-3.5 py-3 text-left transition active:scale-[0.99] disabled:cursor-not-allowed", on ? "bg-brand/15 glow-soft" : "bg-surface", self && "opacity-40")}
            >
              <div className={cx("absolute inset-y-0 left-0 transition-all duration-700", on ? "bg-brand/25" : "bg-white/[0.05]")} style={{ width: `${pct}%` }} />
              <span className="relative flex-1 font-semibold">
                {o.label}
                {self && <span className="ml-2 text-[11px] font-medium text-dim">that’s you</span>}
              </span>
              {o.id === v.proposed && <span className="relative rounded-full bg-gold/15 px-1.5 py-0.5 text-[9px] font-black uppercase text-gold">Submitted</span>}
              {on && <Check size={15} className="relative text-lav" strokeWidth={3} />}
              {!hidden && <span className="relative w-6 text-right text-[13px] font-bold tabular">{n}</span>}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2 text-[12px] text-muted">
        <AvatarStack users={voted.map((id) => db.users[id])} size={18} max={6} />
        <span className="flex-1">
          {total} of {hidden ? everyone.length : c.entries.length} voted{mine ? " · tap another to change" : ""}
        </span>
        <button onClick={() => actions.demoEndVote(c.id)} className="shrink-0 rounded-lg bg-surface px-2 py-1 text-[11px] font-semibold text-lav" title="Demo control">
          ⏩ End vote
        </button>
      </div>
      {isCreator && v.reason === "dispute" && (
        <Button variant="soft" size="sm" className="mt-3 w-full" onClick={onResubmit}>
          <Camera size={15} /> Resubmit with evidence instead
        </Button>
      )}
    </section>
  );
}
