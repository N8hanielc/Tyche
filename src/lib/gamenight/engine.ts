import type { Challenge, GameRound, GameSide, Night, NightGame } from "@/lib/types";
import { templateFor } from "./templates";

// ---------------- scoring ----------------

export interface SideRound {
  bid: number;
  books: number;
  made: boolean;
  set: boolean;
  roundScore: number;
  score: number; // generic metric sum (custom games)
}

/** Per-side numbers for one round. Spades: made = books ≥ bid; score = 10×bid + bags, set = −10×bid. */
export function sideRound(g: NightGame, side: GameSide, r: GameRound): SideRound {
  const sum = (k: string) => side.playerIds.reduce((a, p) => a + (r.values[p]?.[k] ?? 0), 0);
  const bid = sum("bid");
  const books = sum("books");
  if (g.templateId === "spades") {
    const made = books >= bid;
    return { bid, books, made, set: !made, roundScore: made ? 10 * bid + (books - bid) : -10 * bid, score: 0 };
  }
  if (g.templateId === "uno") {
    const won = side.playerIds.includes(r.picks.winner ?? "") ? 1 : 0;
    return { bid: 0, books: 0, made: true, set: false, roundScore: won, score: won };
  }
  const score = sum("score");
  return { bid: 0, books: 0, made: true, set: false, roundScore: score, score };
}

/** Running game totals per side (spades points, Uno hands won, custom score). */
export function sideTotals(g: NightGame, upToRound = Infinity): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(g.sides.map((s) => [s.id, 0]));
  g.rounds
    .filter((r) => r.status === "final" && r.n <= upToRound)
    .forEach((r) => g.sides.forEach((s) => (out[s.id] += sideRound(g, s, r).roundScore)));
  return out;
}

export function leader(totals: Record<string, number>): string | null {
  const e = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (!e.length || (e[1] && e[0][1] === e[1][1])) return null;
  return e[0][0];
}

export const currentRound = (g: NightGame) => g.rounds[g.rounds.length - 1];

// ---------------- auto-settle ----------------

export interface Outcome {
  optionId: string; // option id, or "__tie"
  value?: number;
}

const has = (c: Challenge, id: string) => c.options.some((o) => o.id === id);

function argmax(values: Record<string, number>): string {
  const e = Object.entries(values).sort((a, b) => b[1] - a[1]);
  if (!e.length) return "__tie";
  if (e[1] && e[0][1] === e[1][1]) return "__tie";
  return e[0][0];
}

/**
 * Decides a prop from the scoreboard. `live` = use the in-progress round too
 * (for "currently winning"); otherwise only final rounds / finished games.
 * Returns null when it can't be decided yet.
 */
export function resolveProp(c: Challenge, night: Night, live = false): Outcome | null {
  const res = c.prop?.resolver;
  if (!res) return null;
  if (res.type === "night_team") return null; // decided when the night ends
  const g = night.games.find((x) => x.id === c.gameId);
  if (!g) return null;
  const round = c.prop?.round != null ? g.rounds.find((r) => r.n === c.prop!.round) : undefined;
  // "winning now" only once the host has saved something for the round
  const hasData = (r: GameRound) => Object.keys(r.values).length > 0 || Object.keys(r.picks).length > 0 || Object.keys(r.flags).length > 0;
  const roundReady = round && (round.status === "final" || (live && hasData(round)));
  const done = g.status === "done";

  switch (res.type) {
    case "round_max": {
      if (!round || !roundReady) return null;
      if (res.scope === "side") {
        const vals = Object.fromEntries(g.sides.map((s) => [s.id, sideRound(g, s, round)[res.metric as keyof SideRound] as number]));
        return { optionId: argmax(vals) };
      }
      const vals = Object.fromEntries(c.options.map((o) => [o.id, round.values[o.id]?.[res.metric] ?? 0]));
      return { optionId: argmax(vals) };
    }
    case "round_pick": {
      if (!round || !roundReady) return null;
      const pick = round.picks[res.field];
      if (!pick) return null;
      return has(c, pick) ? { optionId: pick } : { optionId: "__tie" };
    }
    case "round_flag": {
      if (!round || !roundReady) return null;
      const flagged = g.sides.filter((s) => sideRound(g, s, round)[res.metric as "set"]);
      if (!flagged.length) return { optionId: has(c, "none") ? "none" : "__tie" };
      if (flagged.length === 1) return { optionId: flagged[0].id };
      return { optionId: has(c, "both") ? "both" : "__tie" };
    }
    case "round_any": {
      if (!round || !roundReady) return null;
      return { optionId: (round.flags[res.metric] ?? 0) > 0 ? "yes" : "no" };
    }
    case "made_bid": {
      if (!round || !roundReady) return null;
      const side = g.sides.find((s) => s.id === res.sideId);
      if (!side) return null;
      return { optionId: sideRound(g, side, round).made ? "yes" : "no" };
    }
    case "ou": {
      if (res.scope === "round") {
        if (!round || !roundReady) return null;
        const v = round.values[res.subject]?.[res.metric] ?? 0;
        return { optionId: v > res.line ? "over" : "under", value: v };
      }
      const v = g.totals[res.subject]?.[res.metric] ?? 0;
      if (v > res.line) return { optionId: "over", value: v }; // over can hit early
      return done || live ? { optionId: "under", value: v } : null;
    }
    case "event_first": {
      const first = g.events.filter((e) => e.type === res.event).sort((a, b) => a.at - b.at)[0];
      if (first) return { optionId: has(c, first.playerId) ? first.playerId : "__tie" };
      return done ? { optionId: has(c, "none") ? "none" : "__tie" } : null;
    }
    case "event_any": {
      if (g.events.some((e) => e.type === res.event)) return { optionId: "yes" };
      return done ? { optionId: "no" } : live ? { optionId: "no" } : null;
    }
    case "final_max": {
      if (!done && !live) return null;
      const vals = Object.fromEntries(c.options.map((o) => [o.id, g.totals[o.id]?.[res.metric] ?? 0]));
      return { optionId: argmax(vals) };
    }
    case "game_winner": {
      if (done) return g.winnerSideId ? { optionId: g.winnerSideId } : { optionId: "__tie" };
      if (!live) return null;
      const l = leader(sideTotals(g));
      return l ? { optionId: l } : null;
    }
  }
  return null;
}

/** Props that can be settled right now, given the scoreboard. */
export function settleable(night: Night, challenges: Challenge[]): { cid: string; optionId: string; value?: number }[] {
  return challenges
    .filter((c) => c.nightId === night.id && c.status !== "settled" && c.prop?.resolver && !c.prop.pending)
    .map((c) => ({ c, o: resolveProp(c, night) }))
    .filter((x): x is { c: Challenge; o: Outcome } => !!x.o)
    .map(({ c, o }) => ({ cid: c.id, optionId: o.optionId, value: o.value }));
}

/** Sensible starting sides: spades pairs by night team when possible, otherwise everyone solo. */
export function defaultSides(night: Night, templateId: string, playerIds: string[]): GameSide[] {
  const t = templateFor(night, templateId);
  const players = playerIds.map((id) => night.players.find((p) => p.id === id)!).filter(Boolean);
  if (t?.sides === "pairs") {
    const byTeam = night.teams.map((tm) => players.filter((p) => p.teamId === tm.id)).filter((x) => x.length);
    if (byTeam.length >= 2 && byTeam.every((x) => x.length >= 1)) {
      return byTeam.map((ps, i) => ({ id: `s${i + 1}`, name: night.teams.find((tm) => tm.id === ps[0].teamId)?.name ?? `Team ${i + 1}`, playerIds: ps.map((p) => p.id) }));
    }
    const out: GameSide[] = [];
    for (let i = 0; i < players.length; i += 2) {
      const pair = players.slice(i, i + 2);
      out.push({ id: `s${out.length + 1}`, name: pair.map((p) => p.name).join(" & "), playerIds: pair.map((p) => p.id) });
    }
    return out;
  }
  return players.map((p) => ({ id: p.id, name: p.name, playerIds: [p.id] }));
}
