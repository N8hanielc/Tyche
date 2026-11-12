"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Category, Challenge, DB, Format, ID, Message, Notification, Option, Plan, StakeMode, TieRule, Verifier, Visibility } from "./types";
import { localRepository } from "./repository";
import { LogoMark } from "@/components/ui";
import { DAILY, MIN_STAKE, TRIAL_DAYS, claimState, isPlus } from "./plus";
import { computePayouts, fmtLine, fmtMinutes, isSelf, totalPool, uid, winnerFromValue } from "./utils";

export interface Draft {
  question: string;
  title: string;
  description: string;
  media?: string;
  category: Category;
  format: Format;
  line: number;
  unit: string;
  options: Option[];
  myOptionId?: ID;
  stake: number;
  stakeMode: StakeMode;
  odds: Record<ID, number>;
  forfeit: string;
  visibility: Visibility;
  groupId?: ID;
  invited: ID[];
  closesInMin: number;
  closesAtExact?: number; // exact close time (overrides closesInMin)
  startsInMin: number | null;
  resolution: string;
  tieRule: TieRule;
  verifier: Verifier;
  voteInMin?: number | null; // participant vote: open voting automatically after this many minutes
}

type Mutator = (db: DB) => void;

/** Confirmations needed to settle a group-verified result. */
export const REQUIRED = 2;

const CANNED = [
  "nahhh this is mine 😤", "y’all are not ready", "screenshot this", "I’m feeling real good about my pick",
  "who let Marcus set the line 💀", "this the one", "we’ll see 👀", "lock it in", "bet.", "I’m doubling down next time",
];

function sysMsg(db: DB, challengeId: ID, icon: string, text: string, at = Date.now()) {
  db.messages.push({ id: uid("m"), challengeId, kind: "system", icon, text, at, reactions: {} });
}
function notify(db: DB, n: Omit<Notification, "id" | "at" | "read">) {
  db.notifications.unshift({ ...n, id: uid("n"), at: Date.now(), read: false, to: db.meId });
}
const first = (db: DB, id: ID) => (id === db.meId ? "You" : db.users[id]?.name.split(" ")[0] ?? "Someone");
const optLabel = (c: Challenge, id: ID) => c.options.find((o) => o.id === id)?.label ?? id;
const sideIcon = (c: Challenge, optionId: ID) => (c.options[0]?.id === optionId ? "🟣" : "🔵");

function settle(db: DB, c: Challenge) {
  if (!c.result) return;
  const winning = c.result.optionId === "__tie" ? null : c.result.optionId;
  const payouts = computePayouts(c, winning);
  c.result.payouts = payouts;
  c.result.settledAt = Date.now();
  c.status = "settled";
  if (!c.live) c.live = {};
  c.live.endedAt ??= Date.now();
  // credit balances (stake back + winnings; refunds on ties)
  c.entries.forEach((e) => {
    const u = db.users[e.userId];
    if (!u) return;
    const net = payouts[e.userId] ?? 0;
    if (net >= 0) u.points += e.points + net;
  });
  const winners = c.entries.filter((e) => e.optionId === winning);
  sysMsg(db, c.id, "✅", `Result confirmed by ${c.result.confirmations.map((id) => first(db, id)).join(", ") || "the creator"}`);
  if (winning) {
    sysMsg(db, c.id, "🏆", `Winner: ${optLabel(c, winning)} · ${winners.length} winner${winners.length === 1 ? "" : "s"} split ${totalPool(c)} pts`);
  } else {
    sysMsg(db, c.id, "🤝", c.tieRule === "rematch" ? "Tie — rematch called. Stakes refunded." : "Tie — all stakes refunded.");
  }
  const mine = c.entries.find((e) => e.userId === db.meId);
  if (mine) {
    const net = payouts[db.meId] ?? 0;
    notify(db, {
      kind: net > 0 ? "won" : net < 0 ? "lost" : "confirmed",
      challengeId: c.id,
      text: net > 0 ? `You won “${c.title || c.question}” · +${net} pts` : net < 0 ? `Result confirmed: “${c.title || c.question}” · ${net} pts` : `Result confirmed: “${c.title || c.question}” · stake refunded`,
    });
  }
}

// ---------- Lifecycle automation ----------

export const RESULT_DEADLINE_H = 24; // creator must submit within this many hours of the start
export const VOTE_WINDOW_H = 12; // how long a fallback vote stays open
export const DISPUTES_TO_FREEZE = 2; // disputes that freeze a submitted result
export const VOTE_QUORUM = 3; // votes needed to decide early (or everyone, if fewer play)
const H = 3_600_000;

function startChallenge(db: DB, c: Challenge, auto = false) {
  const now = Date.now();
  c.status = "live";
  c.closesAt = Math.min(c.closesAt, now);
  c.lockedAt ??= now;
  c.live = { startedAt: now, resultDueAt: now + RESULT_DEADLINE_H * H, counter: c.format === "over_under" && c.unit !== "time" ? 0 : undefined };
  sysMsg(db, c.id, "🔒", `Challenge locked · ${c.entries.length} participants · ${totalPool(c)} pts in the pool`);
  const t = new Date(now).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const label = c.category === "Road Trip" ? `Trip started — ${t}` : `Event started — ${t}`;
  sysMsg(db, c.id, c.category === "Road Trip" ? "🚗" : "▶️", auto ? `${label} · started automatically` : label);
  if (c.entries.some((e) => e.userId === db.meId) || c.creatorId === db.meId)
    notify(db, { kind: "started", challengeId: c.id, actorId: c.creatorId === db.meId ? undefined : c.creatorId, text: `“${c.title || c.question}” is live${auto ? " — it started on schedule" : ""}` });
}

export const resultDueAt = (c: Challenge) => c.live?.resultDueAt ?? (c.live?.startedAt ? c.live.startedAt + RESULT_DEADLINE_H * H : Infinity);

export const PARTICIPANT_VOTE_H = 3; // end-of-night vote window
export const RUNOFF_MIN = 30;

/** Everyone who can vote: participants plus the creator. */
export const voters = (c: Challenge) => [...new Set([c.creatorId, ...c.entries.map((e) => e.userId)])];

/** Options a user may vote for (never one that's about themselves). */
export function voteChoices(c: Challenge, userId?: ID): ID[] {
  const base = c.vote?.choices ?? c.options.map((o) => o.id);
  const list = c.vote?.reason === "participants" ? base : [...base, "__tie"];
  return userId ? list.filter((id) => !isSelf(c.options.find((o) => o.id === id), userId)) : list;
}

function openVote(db: DB, c: Challenge, reason: "deadline" | "dispute" | "participants", runoff?: ID[]) {
  const now = Date.now();
  if (c.live && !c.live.endedAt) c.live.endedAt = now;
  c.status = "vote";
  const window = runoff ? RUNOFF_MIN * 60_000 : reason === "participants" ? PARTICIPANT_VOTE_H * H : VOTE_WINDOW_H * H;
  c.vote = { reason, opensAt: now, endsAt: now + window, votes: {}, proposed: reason === "dispute" ? c.result?.optionId : undefined, round: runoff ? 2 : 1, choices: runoff };
  const text = runoff
    ? `Tie between ${runoff.map((id) => optLabel(c, id)).join(" and ")} — ${RUNOFF_MIN}-minute runoff vote.`
    : reason === "participants"
      ? "🌙 Voting is open. Everyone votes — you can’t vote for yourself. Votes stay hidden until it closes."
      : reason === "deadline"
        ? `No result after ${RESULT_DEADLINE_H}h — it’s up to a vote. Majority wins; if nobody votes, everyone is refunded.`
        : `Result frozen after ${DISPUTES_TO_FREEZE} disputes — participants vote to decide.`;
  sysMsg(db, c.id, "🗳️", text);
  if (voters(c).includes(db.meId))
    notify(db, {
      kind: "confirmed",
      challengeId: c.id,
      text: runoff ? `Runoff vote: “${c.title || c.question}”` : reason === "participants" ? `Time to vote: “${c.question}”` : reason === "deadline" ? `“${c.title || c.question}” is overdue — vote on the result` : `The result for “${c.title || c.question}” was disputed — vote now`,
    });
}

export function tallyVotes(c: Challenge) {
  const counts: Record<ID, number> = {};
  Object.values(c.vote?.votes ?? {}).forEach((o) => (counts[o] = (counts[o] ?? 0) + 1));
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((a, [, n]) => a + n, 0);
  return { counts, ranked, total, quorum: Math.min(VOTE_QUORUM, Math.max(1, c.entries.length)) };
}

/** Decides a vote if there is a clear majority (or, when `force`, a plurality). Returns true if settled. */
function maybeResolveVote(db: DB, c: Challenge, force = false) {
  if (c.status !== "vote" || !c.vote) return false;
  const { ranked, total, quorum } = tallyVotes(c);
  const [lead, second] = ranked;
  const clear = !!lead && (!second || lead[1] > second[1]);
  const anonymous = c.vote.reason === "participants";
  const everyone = total >= voters(c).length;
  let winner: ID | null = null;
  if (anonymous) {
    // hidden ballot: decide only when everyone has voted or the window closes
    if (!force && !everyone) return false;
    if (total && !clear) {
      const tied = ranked.filter(([, n]) => n === lead[1]).map(([id]) => id);
      if (c.tieRule === "rematch" && (c.vote.round ?? 1) < 2) {
        openVote(db, c, "participants", tied);
        return true;
      }
    }
    winner = total && clear ? lead[0] : "__tie";
  } else if (force) winner = total && clear ? lead[0] : "__tie";
  else if (total >= quorum && clear && lead[1] > total / 2) winner = lead[0];
  if (!winner) return false;
  const backers = Object.entries(c.vote.votes).filter(([, o]) => o === winner).map(([u]) => u);
  const prev = c.result;
  c.result = {
    optionId: winner,
    value: prev && prev.optionId === winner ? prev.value : undefined,
    submittedBy: prev?.submittedBy ?? "vote",
    submittedAt: prev?.submittedAt ?? Date.now(),
    confirmations: backers,
    disputes: prev?.disputes ?? [],
    evidence: prev?.evidence,
  };
  const score = ranked.map(([, n]) => n).join("–");
  sysMsg(db, c.id, "🗳️", total ? `Vote decided: ${winner === "__tie" ? "Tie" : optLabel(c, winner)}${score ? ` (${score})` : ""}` : "Vote closed with no votes — everyone is refunded.");
  settle(db, c);
  return true;
}

/** Time-based transitions. Runs on load and every few seconds; returns true if anything changed. */
function tick(db: DB, now = Date.now()) {
  let changed = false;
  db.challenges.forEach((c) => {
    if (c.status === "open" && c.startsAt && c.startsAt <= now) {
      startChallenge(db, c, true);
      changed = true;
    } else if (c.status === "open" && !c.lockedAt && c.closesAt <= now) {
      c.lockedAt = now;
      sysMsg(db, c.id, "🔒", `Joining closed · ${c.entries.length} in · ${totalPool(c)} pts in the pool`);
      changed = true;
    } else if (c.status === "live" && c.verifier === "vote" && c.voteAt && c.voteAt <= now && !c.vote) {
      openVote(db, c, "participants");
      changed = true;
    } else if (c.status === "live" && !c.result && resultDueAt(c) <= now) {
      openVote(db, c, "deadline");
      changed = true;
    } else if (c.status === "vote" && c.vote && c.vote.endsAt <= now) {
      maybeResolveVote(db, c, true);
      changed = true;
    }
  });
  return changed;
}

interface Store {
  db: DB;
  me: DB["users"][string];
  actions: ReturnType<typeof makeActions>;
}

const Ctx = createContext<Store | null>(null);

function makeActions(mutate: (fn: Mutator) => void, later: (ms: number, fn: Mutator) => void) {
  const simulateReply = (challengeId: ID, chance = 0.55) => {
    later(1800 + Math.random() * 2200, (db) => {
      const c = db.challenges.find((x) => x.id === challengeId);
      if (!c || Math.random() > chance) return;
      const pool = c.entries.map((e) => e.userId).filter((id) => id !== db.meId && db.users[id]);
      if (!pool.length) return;
      const who = pool[Math.floor(Math.random() * pool.length)];
      db.messages.push({ id: uid("m"), challengeId, kind: "chat", userId: who, text: CANNED[Math.floor(Math.random() * CANNED.length)], at: Date.now(), reactions: {} });
    });
  };

  /** A simulated participant casts a vote: usually with the room's leader, never for themselves. */
  const simVote = (db: DB, c: Challenge, who: ID) => {
    if (!c.vote) return;
    const allowed = voteChoices(c, who);
    if (!allowed.length) return;
    const counts: Record<ID, number> = {};
    Object.values(c.vote.votes).forEach((o) => (counts[o] = (counts[o] ?? 0) + 1));
    const backed = c.entries.reduce<Record<ID, number>>((m, e) => ((m[e.optionId] = (m[e.optionId] ?? 0) + 1), m), {});
    const ranked = [...allowed].filter((id) => id !== "__tie").sort((a, b) => (counts[b] ?? 0) * 2 + (backed[b] ?? 0) - ((counts[a] ?? 0) * 2 + (backed[a] ?? 0)));
    const pick = Math.random() < 0.65 && ranked[0] ? ranked[0] : allowed[Math.floor(Math.random() * allowed.length)];
    c.vote.votes[who] = pick;
    sysMsg(db, c.id, "🗳️", `${first(db, who)} voted`);
    maybeResolveVote(db, c);
  };

  /** Everyone else in the room votes over the next few seconds. */
  const crowdVotes = (challengeId: ID) => {
    for (let i = 0; i < 8; i++)
      later(1600 + i * 1300, (db) => {
        const c = db.challenges.find((x) => x.id === challengeId);
        if (!c?.vote || c.status !== "vote" || c.vote.reason !== "participants") return;
        const who = voters(c).find((u) => u !== db.meId && !(u in c.vote!.votes) && db.users[u]);
        if (who) simVote(db, c, who);
      });
  };

  return {
    join(challengeId: ID, optionId: ID, points: number) {
      mutate((db) => {
        const c = db.challenges.find((x) => x.id === challengeId);
        const me = db.users[db.meId];
        if (!c || c.status !== "open") return;
        const prev = c.entries.find((e) => e.userId === db.meId);
        if (isSelf(c.options.find((o) => o.id === optionId), db.meId)) return;
        if (c.stakeMode !== "bragging" && (points < MIN_STAKE || me.points + (prev?.points ?? 0) < MIN_STAKE)) return;
        if (prev) {
          me.points += prev.points;
          c.entries = c.entries.filter((e) => e !== prev);
        }
        const stake = c.stakeMode === "bragging" ? 0 : Math.min(points, me.points);
        me.points -= stake;
        c.entries.push({ userId: db.meId, optionId, points: stake, at: Date.now() });
        if (prev && prev.optionId !== optionId) sysMsg(db, c.id, "🔁", `${me.name} changed position to ${optLabel(c, optionId)}${stake ? ` · ${stake} pts` : ""}`);
        else if (prev) sysMsg(db, c.id, "➕", `${me.name} updated stake on ${optLabel(c, optionId)} to ${stake} pts`);
        else sysMsg(db, c.id, sideIcon(c, optionId), `${me.name} joined ${optLabel(c, optionId)}${stake ? ` with ${stake} points` : ""}`);
      });
      // someone reacts to your move
      later(2600, (db) => {
        const c = db.challenges.find((x) => x.id === challengeId);
        if (!c) return;
        const others = c.entries.filter((e) => e.userId !== db.meId && db.users[e.userId] && !e.userId.startsWith("c"));
        const o = others[Math.floor(Math.random() * others.length)];
        if (!o) return;
        sysMsg(db, c.id, "❤️", `${first(db, o.userId)} reacted to ${db.users[db.meId].name}’s prediction`);
      });
    },

    toggleLike(challengeId: ID) {
      mutate((db) => {
        const c = db.challenges.find((x) => x.id === challengeId);
        if (!c) return;
        c.likes = c.likes.includes(db.meId) ? c.likes.filter((x) => x !== db.meId) : [...c.likes, db.meId];
      });
    },

    shared(challengeId: ID) {
      mutate((db) => {
        const c = db.challenges.find((x) => x.id === challengeId);
        if (c) c.shares += 1;
      });
    },

    create(d: Draft): ID {
      const id = uid("ch");
      mutate((db) => {
        const now = Date.now();
        const me = db.users[db.meId];
        if (isSelf(d.options.find((o) => o.id === d.myOptionId), db.meId)) d.myOptionId = undefined;
        const stake = d.stakeMode === "bragging" || !d.myOptionId ? 0 : Math.min(d.stake, me.points);
        if (d.myOptionId && d.stakeMode !== "bragging" && stake < MIN_STAKE) d.myOptionId = undefined;
        const c: Challenge = {
          id, creatorId: db.meId, createdAt: now, category: d.category,
          question: d.question.trim(), title: d.title.trim() || undefined, description: d.description.trim() || undefined, media: d.media,
          format: d.format, line: d.format === "over_under" ? d.line : undefined, unit: d.format === "over_under" ? d.unit : undefined,
          options: d.options, entries: d.myOptionId ? [{ userId: db.meId, optionId: d.myOptionId, points: stake, at: now }] : [],
          stakeMode: d.stakeMode, odds: d.stakeMode === "odds" ? d.odds : undefined, forfeit: d.forfeit.trim() || undefined,
          visibility: d.visibility, groupId: d.visibility === "group" ? d.groupId : undefined,
          closesAt: d.closesAtExact ?? now + d.closesInMin * 60_000, startsAt: d.startsInMin == null ? undefined : now + d.startsInMin * 60_000,
          resolution: d.resolution, tieRule: d.tieRule, verifier: d.verifier, status: "open", likes: [], shares: 0,
          voteAt: d.verifier === "vote" && d.voteInMin != null ? now + d.voteInMin * 60_000 : undefined,
        };
        me.points -= stake;
        db.challenges.unshift(c);
        sysMsg(db, id, "✨", `${me.name} created the challenge${c.line != null ? ` · Line set at ${fmtLine(c)}` : ""}`, now);
        if (d.myOptionId) sysMsg(db, id, sideIcon(c, d.myOptionId), `${me.name} joined ${optLabel(c, d.myOptionId)}${stake ? ` with ${stake} points` : ""}`, now + 1);
        if (d.invited.length) sysMsg(db, id, "📨", `Invites sent to ${d.invited.map((u) => first(db, u)).join(", ")}`, now + 2);
        db.lastRead[id] = now + 10;
      });
      // friends pile in
      const joinSim = (delay: number) =>
        later(delay, (db) => {
          const c = db.challenges.find((x) => x.id === id);
          if (!c || c.status !== "open") return;
          const candidates = (d.invited.length ? d.invited : ["u_marcus", "u_jordan", "u_mya", "u_chris"]).filter((u) => !c.entries.some((e) => e.userId === u));
          const who = candidates[0];
          if (!who) return;
          const mine = d.myOptionId;
          const opts = c.options.filter((o) => o.id !== mine && !isSelf(o, who));
          const pick = (opts[Math.floor(Math.random() * opts.length)] ?? c.options[0]).id;
          const pts = c.stakeMode === "bragging" ? 0 : [10, 15, 20, 25, 40][Math.floor(Math.random() * 5)];
          c.entries.push({ userId: who, optionId: pick, points: pts, at: Date.now() });
          sysMsg(db, id, sideIcon(c, pick), `${first(db, who)} joined ${optLabel(c, pick)}${pts ? ` with ${pts} points` : ""}`);
          notify(db, { kind: "joined", actorId: who, challengeId: id, text: `joined ${optLabel(c, pick)} on “${c.title || c.question}”${pts ? ` with ${pts} pts` : ""}` });
        });
      joinSim(4000);
      joinSim(9000);
      later(6500, (db) => {
        const c = db.challenges.find((x) => x.id === id);
        if (!c) return;
        const who = d.invited[0] ?? "u_jordan";
        db.messages.push({ id: uid("m"), challengeId: id, kind: "chat", userId: who, text: "Oh you really put it on Tyche 😂 I’m in", at: Date.now(), reactions: {} });
      });
      return id;
    },

    send(challengeId: ID, text: string, opts: { replyTo?: ID; image?: string } = {}) {
      if (!text.trim() && !opts.image) return;
      mutate((db) => {
        db.messages.push({ id: uid("m"), challengeId, kind: "chat", userId: db.meId, text: text.trim(), image: opts.image, replyTo: opts.replyTo, at: Date.now(), reactions: {} });
        db.lastRead[challengeId] = Date.now() + 1;
      });
      simulateReply(challengeId);
    },

    react(messageId: ID, emoji: string) {
      mutate((db) => {
        const m = db.messages.find((x) => x.id === messageId);
        if (!m) return;
        const list = m.reactions[emoji] ?? [];
        m.reactions[emoji] = list.includes(db.meId) ? list.filter((x) => x !== db.meId) : [...list, db.meId];
        if (!m.reactions[emoji].length) delete m.reactions[emoji];
      });
    },

    start(challengeId: ID) {
      mutate((db) => {
        const c = db.challenges.find((x) => x.id === challengeId);
        if (!c || c.status !== "open") return;
        startChallenge(db, c);
      });
    },

    update(challengeId: ID, icon: string, text: string) {
      mutate((db) => sysMsg(db, challengeId, icon, text));
    },

    /** Demo helper: pretend `mins` minutes have passed on a live timer. */
    fastForward(challengeId: ID, mins: number) {
      mutate((db) => {
        const c = db.challenges.find((x) => x.id === challengeId);
        if (!c?.live?.startedAt || c.live.endedAt) return;
        const before = Math.floor((Date.now() - c.live.startedAt) / 3_600_000);
        c.live.startedAt -= mins * 60_000;
        const after = Math.floor((Date.now() - c.live.startedAt) / 3_600_000);
        if (after > before) sysMsg(db, c.id, "⏱", `${after} hour${after === 1 ? "" : "s"} elapsed`);
      });
    },

    bump(challengeId: ID, delta: number) {
      mutate((db) => {
        const c = db.challenges.find((x) => x.id === challengeId);
        if (!c?.live) return;
        const next = Math.max(0, (c.live.counter ?? 0) + delta);
        c.live.counter = next;
        if (delta > 0) {
          const icon = c.category === "Dinner" ? "🍽️" : c.category === "Sports" ? "🎯" : "➕";
          sysMsg(db, c.id, icon, `${c.unit ? c.unit[0].toUpperCase() + c.unit.slice(1) : "Count"}: ${next}${c.line != null && next > c.line ? " · OVER has hit" : ""}`);
        }
      });
    },

    /** Stops a timed event; returns measured minutes. */
    stop(challengeId: ID) {
      mutate((db) => {
        const c = db.challenges.find((x) => x.id === challengeId);
        if (!c?.live?.startedAt) return;
        c.live.endedAt = Date.now();
        const mins = Math.max(1, Math.round((c.live.endedAt - c.live.startedAt) / 60000));
        sysMsg(db, c.id, c.category === "Road Trip" ? "🏁" : "⏹", `${c.category === "Road Trip" ? "Trip completed" : "Event ended"} — ${c.unit === "time" ? fmtMinutes(mins) : "time to call it"}`);
      });
    },

    submit(challengeId: ID, optionId: ID | "__tie", value?: number, evidence?: string) {
      mutate((db) => {
        const c = db.challenges.find((x) => x.id === challengeId);
        if (!c || c.status === "settled") return;
        if (c.live && !c.live.endedAt) c.live.endedAt = Date.now();
        const resubmit = !!c.result;
        if (resubmit) sysMsg(db, c.id, "🔁", `${first(db, db.meId)} resubmitted the result${evidence ? " with evidence" : ""}`);
        c.status = "review";
        c.vote = undefined;
        c.result = { optionId, value, submittedBy: db.meId, submittedAt: Date.now(), confirmations: [db.meId], disputes: [], evidence };
        if (evidence) sysMsg(db, c.id, "📎", "New evidence uploaded");
        const valueTxt = value != null ? ` (${c.unit === "time" ? fmtMinutes(value) : `${value}${c.unit ? " " + c.unit : ""}`})` : "";
        sysMsg(db, c.id, "🏁", `Result submitted: ${optionId === "__tie" ? "Tie" : optLabel(c, optionId)}${valueTxt}`);
        if (c.verifier === "creator") {
          settle(db, c);
        }
      });
      // another participant confirms shortly after
      later(2600, (db) => {
        const c = db.challenges.find((x) => x.id === challengeId);
        if (!c?.result || c.status !== "review") return;
        const who = c.entries.map((e) => e.userId).find((u) => u !== db.meId && !c.result!.confirmations.includes(u) && !c.result!.disputes.includes(u));
        if (!who) return settle(db, c);
        c.result.confirmations.push(who);
        sysMsg(db, c.id, "👍", `${first(db, who)} confirmed the result`);
        if (c.result.confirmations.length >= REQUIRED) settle(db, c);
      });
    },

    /** Ask a non-you creator to submit (simulated). */
    nudge(challengeId: ID) {
      mutate((db) => {
        const c = db.challenges.find((x) => x.id === challengeId);
        if (c) sysMsg(db, c.id, "👋", `${db.users[db.meId].name} nudged ${first(db, c.creatorId)} to ${c.verifier === "vote" ? "open voting" : "submit the result"}`);
      });
      setTimeout(() => crowdVotes(challengeId), 2600);
      later(2400, (db) => {
        const c = db.challenges.find((x) => x.id === challengeId);
        if (!c || c.status === "settled" || c.status === "review" || c.status === "vote") return;
        if (c.verifier === "vote") {
          if (c.status === "open") startChallenge(db, c);
          openVote(db, c, "participants");
          return;
        }
        if (c.live && !c.live.endedAt) c.live.endedAt = Date.now();
        // weight toward the most-backed option so outcomes feel plausible
        const ranked = [...c.options].sort((a, b) => c.entries.filter((e) => e.optionId === b.id).length - c.entries.filter((e) => e.optionId === a.id).length);
        const optionId = Math.random() < 0.6 ? ranked[0].id : ranked[Math.min(1, ranked.length - 1)].id;
        c.status = "review";
        c.result = { optionId, submittedBy: c.creatorId, submittedAt: Date.now(), confirmations: [c.creatorId], disputes: [] };
        sysMsg(db, c.id, "🏁", `${first(db, c.creatorId)} submitted the result: ${optLabel(c, optionId)}`);
        notify(db, { kind: "confirmed", actorId: c.creatorId, challengeId: c.id, text: `submitted a result for “${c.title || c.question}” — confirm it` });
      });
    },

    /** Creator ends the night and opens the participant vote. */
    openVoting(challengeId: ID) {
      mutate((db) => {
        const c = db.challenges.find((x) => x.id === challengeId);
        if (!c || c.status === "settled" || c.status === "vote") return;
        if (c.status === "open") startChallenge(db, c);
        openVote(db, c, "participants");
      });
      crowdVotes(challengeId);
    },

    confirm(challengeId: ID) {
      mutate((db) => {
        const c = db.challenges.find((x) => x.id === challengeId);
        if (!c?.result || c.status !== "review" || c.result.confirmations.includes(db.meId)) return;
        c.result.confirmations.push(db.meId);
        sysMsg(db, c.id, "👍", `${db.users[db.meId].name} confirmed the result`);
        if (c.result.confirmations.length >= REQUIRED) settle(db, c);
      });
    },

    dispute(challengeId: ID, reason: string) {
      mutate((db) => {
        const c = db.challenges.find((x) => x.id === challengeId);
        if (!c?.result || c.status !== "review") return;
        if (c.result.disputes.includes(db.meId)) return;
        c.result.disputes.push(db.meId);
        c.result.confirmations = c.result.confirmations.filter((x) => x !== db.meId);
        sysMsg(db, c.id, "⚠️", `${db.users[db.meId].name} disputed the result${reason ? `: “${reason}”` : ""}`);
        if (c.result.disputes.length >= DISPUTES_TO_FREEZE) openVote(db, c, "dispute");
      });
      // someone on the losing side backs the dispute
      later(2600, (db) => {
        const c = db.challenges.find((x) => x.id === challengeId);
        if (!c?.result || c.status !== "review") return;
        const r = c.result;
        const who = c.entries.find((e) => e.userId !== db.meId && e.userId !== r.submittedBy && e.optionId !== r.optionId && !r.disputes.includes(e.userId) && !r.confirmations.includes(e.userId))?.userId;
        if (!who) return;
        r.disputes.push(who);
        sysMsg(db, c.id, "⚠️", `${first(db, who)} disputed the result: “that’s not what happened”`);
        if (r.disputes.length >= DISPUTES_TO_FREEZE) openVote(db, c, "dispute");
      });
    },

    vote(challengeId: ID, optionId: ID) {
      mutate((db) => {
        const c = db.challenges.find((x) => x.id === challengeId);
        if (!c?.vote || c.status !== "vote") return;
        if (!voteChoices(c, db.meId).includes(optionId)) return; // can't vote for yourself
        const changed = c.vote.votes[db.meId] && c.vote.votes[db.meId] !== optionId;
        c.vote.votes[db.meId] = optionId;
        sysMsg(db, c.id, "🗳️", `${db.users[db.meId].name} ${changed ? "changed their vote" : "voted"}`);
        maybeResolveVote(db, c);
      });
      crowdVotes(challengeId); // hidden end-of-night ballots: everyone weighs in
      // other vote types: a couple of participants weigh in
      [2000, 3800].forEach((ms) =>
        later(ms, (db) => {
          const c = db.challenges.find((x) => x.id === challengeId);
          if (!c?.vote || c.status !== "vote" || c.vote.reason === "participants") return;
          const who = c.entries.find((e) => e.userId !== db.meId && !(e.userId in c.vote!.votes) && db.users[e.userId])?.userId;
          if (who) simVote(db, c, who);
        }),
      );
    },

    /** Demo: jump a live challenge past its result deadline. */
    demoDeadline(challengeId: ID) {
      mutate((db) => {
        const c = db.challenges.find((x) => x.id === challengeId);
        if (!c?.live || c.status !== "live") return;
        c.live.resultDueAt = Date.now() - 1;
        tick(db);
      });
    },

    /** Demo: close an open vote now. */
    demoEndVote(challengeId: ID) {
      mutate((db) => {
        const c = db.challenges.find((x) => x.id === challengeId);
        if (!c?.vote || c.status !== "vote") return;
        c.vote.endsAt = Date.now() - 1;
        tick(db);
      });
    },

    follow(userId: ID) {
      mutate((db) => {
        const on = db.following.includes(userId);
        db.following = on ? db.following.filter((x) => x !== userId) : [...db.following, userId];
        const u = db.users[userId];
        if (u) u.followers += on ? -1 : 1;
        db.users[db.meId].following += on ? -1 : 1;
      });
    },

    /** Points the app at the signed-in account, creating its profile row on first sign-in. */
    becomeUser(p: { id: ID; name: string; username: string; avatar?: string; bio?: string; follows?: ID[] }) {
      mutate((db) => {
        if (!db.users[p.id]) {
          db.users[p.id] = {
            id: p.id, name: p.name, username: p.username, avatar: p.avatar, bio: p.bio,
            hue: Math.floor(Math.random() * 360), followers: 0, following: p.follows?.length ?? 0, baseWins: 0, baseLosses: 0, points: 1000, badges: ["early"],
          };
          p.follows?.forEach((f) => db.users[f] && (db.users[f].followers += 1));
          db.notifications.unshift({ id: uid("n"), kind: "invite", text: `Welcome to Tyche, ${p.name.split(" ")[0]} 👋 You start with 1,000 points. Find a challenge to join or put your first one on Tyche.`, at: Date.now(), read: false, to: p.id });
        }
        if (db.meId !== p.id) {
          db.saved ??= {};
          db.saved[db.meId] = { following: db.following, lastRead: db.lastRead };
          const next = db.saved[p.id];
          db.following = next?.following ?? p.follows ?? [];
          db.lastRead = next?.lastRead ?? {};
          db.meId = p.id;
        }
      });
    },

    /** Daily refill: 10 pts free, 100 pts Tyche+. Returns the amount via callback. */
    claimDaily(onDone?: (amount: number, streak: number) => void) {
      mutate((db) => {
        const me = db.users[db.meId];
        const st = claimState(me);
        if (!st.ready) return;
        const yesterday = st.nextAt - 48 * 3_600_000;
        me.claimStreak = me.lastClaimAt && me.lastClaimAt >= yesterday ? (me.claimStreak ?? 0) + 1 : 1;
        me.lastClaimAt = Date.now();
        me.points += st.amount;
        onDone?.(st.amount, me.claimStreak);
      });
    },

    /** Simulated purchase. Production: RevenueCat purchasePackage() then a server webhook sets the entitlement. */
    subscribe(plan: Plan) {
      mutate((db) => {
        const me = db.users[db.meId];
        const now = Date.now();
        const wasPlus = isPlus(me);
        const hadTrial = !!me.trialUsed;
        const trialEndsAt = hadTrial ? undefined : now + TRIAL_DAYS * 24 * 3_600_000;
        const period = plan === "yearly" ? 365 : 30;
        me.plus = { plan, startedAt: now, trialEndsAt, renewsAt: (trialEndsAt ?? now) + period * 24 * 3_600_000 };
        me.trialUsed = true;
        // upgrading mid-day tops today's claim up to the Plus amount
        if (!wasPlus && me.lastClaimAt && !claimState({ ...me, plus: undefined }).ready) me.points += DAILY.plus - DAILY.free;
        notify(db, { kind: "invite", text: `Welcome to Tyche+ ✦ ${trialEndsAt ? `Your ${TRIAL_DAYS}-day free trial is on. ` : ""}You now get ${DAILY.plus} points every day.` });
      });
    },

    setCardTheme(theme: string) {
      mutate((db) => {
        db.users[db.meId].cardTheme = theme;
      });
    },

    cancelPlus() {
      mutate((db) => {
        const me = db.users[db.meId];
        if (me.plus) me.plus.canceled = true;
      });
    },

    resumePlus() {
      mutate((db) => {
        const me = db.users[db.meId];
        if (me.plus) me.plus.canceled = false;
      });
    },

    readNotifications() {
      mutate((db) => db.notifications.forEach((n) => (n.to ?? "u_nate") === db.meId && (n.read = true)));
    },

    readRoom(challengeId: ID) {
      mutate((db) => {
        db.lastRead[challengeId] = Date.now();
      });
    },

    createGroup(name: string, emoji: string, memberIds: ID[]) {
      const id = uid("g");
      mutate((db) => {
        db.groups.unshift({ id, ownerId: db.meId, name, emoji, memberIds: [db.meId, ...memberIds], createdAt: Date.now() });
      });
      return id;
    },
  };
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    setDb(localRepository.load());
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (db) localRepository.save(db);
  }, [db]);

  // scheduled transitions: auto-start, join lock, result deadline, vote close
  const loaded = !!db;
  useEffect(() => {
    if (!loaded) return;
    const run = () =>
      setDb((prev) => {
        if (!prev) return prev;
        const next = structuredClone(prev);
        return tick(next) ? next : prev;
      });
    run();
    const t = setInterval(run, 5000);
    return () => clearInterval(t);
  }, [loaded]);

  const mutate = useCallback((fn: Mutator) => {
    setDb((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }, []);
  const later = useCallback(
    (ms: number, fn: Mutator) => {
      timers.current.push(window.setTimeout(() => mutate(fn), ms));
    },
    [mutate],
  );

  const actions = useMemo(() => ({ ...makeActions(mutate, later), reset: () => setDb(localRepository.reset()) }), [mutate, later]);

  if (!db) return <Splash />;
  return <Ctx.Provider value={{ db, me: db.users[db.meId], actions }}>{children}</Ctx.Provider>;
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center bg-ink">
      <LogoMark size={72} className="animate-pulse" />
    </div>
  );
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s as Store & { actions: Store["actions"] & { reset: () => void } };
}

export function useNow(interval = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}

export type { Message };
export { winnerFromValue };
