import type { Challenge, Entry, Message, Night, NightGame } from "@/lib/types";
import { computePayouts } from "@/lib/utils";
import { SPADES, UNO, WILD, overUnderSpec, wildSpec, nightTeamSpec, type PropSpec } from "./templates";

/** Demo data for the offline preview: a Thanksgiving game night in progress. */
export function seedNight(T: number, ME: string): { night: Night; challenges: Challenge[]; messages: Message[] } {
  const MIN = 60_000;
  const night: Night = {
    id: "night_thanksgiving",
    hostId: ME,
    name: "Thanksgiving Game Night",
    createdAt: T - 150 * MIN,
    status: "live",
    memberIds: [ME, "u_mya", "u_marcus", "u_jordan"],
    teams: [
      { id: "t1", name: "Mom’s Team", emoji: "👩" },
      { id: "t2", name: "Dad’s Team", emoji: "👨" },
    ],
    players: [
      { id: "p1", name: "Nate", userId: ME, teamId: "t1" },
      { id: "p2", name: "Mom", teamId: "t1" },
      { id: "p3", name: "Mya", userId: "u_mya", teamId: "t1" },
      { id: "p4", name: "Dad", teamId: "t2" },
      { id: "p5", name: "Marcus", userId: "u_marcus", teamId: "t2" },
      { id: "p6", name: "Jordan", userId: "u_jordan", teamId: "t2" },
    ],
    games: [],
  };
  const uno: NightGame = {
    id: "g_uno", templateId: "uno", name: "Uno", emoji: "🃏", status: "done", startedAt: T - 140 * MIN, endedAt: T - 75 * MIN,
    sides: night.players.map((p) => ({ id: p.id, name: p.name, playerIds: [p.id] })),
    rounds: [
      { n: 1, status: "final", values: { p4: { drawn: 9 }, p1: { drawn: 2 } }, picks: { winner: "p3", caught: "p4" }, flags: { wd4: 1 } },
      { n: 2, status: "final", values: { p2: { drawn: 6 } }, picks: { winner: "p2", caught: "none" }, flags: { wd4: 0 } },
      { n: 3, status: "final", values: { p5: { drawn: 11 } }, picks: { winner: "p3", caught: "p4" }, flags: { wd4: 1 } },
    ],
    events: [], totals: {}, winnerSideId: "p3",
  };
  const spades: NightGame = {
    id: "g_spades", templateId: "spades", name: "Spades", emoji: "♠️", status: "live", startedAt: T - 70 * MIN,
    sides: [
      { id: "s1", name: "Nate & Mom", playerIds: ["p1", "p2"] },
      { id: "s2", name: "Dad & Marcus", playerIds: ["p4", "p5"] },
    ],
    rounds: [
      { n: 1, status: "final", values: { p1: { bid: 3, books: 4 }, p2: { bid: 2, books: 2 }, p4: { bid: 4, books: 5 }, p5: { bid: 2, books: 2 } }, picks: {}, flags: {} },
      { n: 2, status: "final", values: { p1: { bid: 2, books: 1 }, p2: { bid: 2, books: 2 }, p4: { bid: 5, books: 6 }, p5: { bid: 2, books: 4 } }, picks: {}, flags: {} },
      { n: 3, status: "open", values: {}, picks: {}, flags: {} },
    ],
    events: [], totals: {},
  };
  night.games = [uno, spades];
  night.currentGameId = "g_spades";

  const challenges: Challenge[] = [];
  const messages: Message[] = [];
  let k = 0;
  const E = (userId: string, optionId: string, points: number, minsAgo: number): Entry => ({ userId, optionId, points, at: T - minsAgo * MIN });
  const make = (s: PropSpec, gameId: string | undefined, creatorId: string, minsAgo: number, entries: Entry[], result?: { optionId: string; value?: number; minsAgo: number }, pending = false): Challenge => {
    const c: Challenge = {
      id: `np_${++k}`, creatorId, createdAt: T - minsAgo * MIN, category: "Game Night", question: s.question, format: s.format, line: s.line, unit: s.unit,
      options: s.options, entries, stakeMode: "even", visibility: "night", closesAt: result ? T - result.minsAgo * MIN : T + 20 * 60 * MIN,
      resolution: "Settled from the Game Night scoreboard by the host.", tieRule: "refund", verifier: "creator", status: result ? "settled" : "open",
      likes: [], shares: 0, nightId: night.id, gameId, prop: { ...s.meta, pending },
    };
    if (result) {
      c.result = { optionId: result.optionId, value: result.value, submittedBy: ME, submittedAt: T - result.minsAgo * MIN, confirmations: [ME], disputes: [], settledAt: T - result.minsAgo * MIN };
      c.result.payouts = computePayouts(c, result.optionId === "__tie" ? null : result.optionId);
      messages.push({ id: `nm_${k}a`, challengeId: c.id, kind: "system", icon: "🎲", text: `Settled from the scoreboard: ${c.options.find((o) => o.id === result.optionId)?.label ?? "Tie"}`, at: T - result.minsAgo * MIN, reactions: {} });
    }
    messages.push({ id: `nm_${k}`, challengeId: c.id, kind: "system", icon: s.meta.kind === "wild" ? "🃏" : "🎲", text: `Prop added${pending ? " · waiting for host approval" : ""}`, at: T - minsAgo * MIN, reactions: {} });
    challenges.push(c);
    return c;
  };
  const prop = (t: typeof SPADES | typeof UNO, key: string, g: NightGame, round: number) => t.props.find((p) => p.key === key)!.build(g, night, round);

  // Uno (finished)
  make(prop(UNO, "hand_winner", uno, 1)[0], uno.id, ME, 140, [E(ME, "p3", 50, 139), E("u_marcus", "p5", 50, 139), E("u_jordan", "p3", 50, 138)], { optionId: "p3", minsAgo: 125 });
  make(prop(UNO, "caught", uno, 1)[0], uno.id, ME, 140, [E(ME, "p4", 50, 139), E("u_mya", "p4", 50, 138), E("u_marcus", "none", 50, 137)], { optionId: "p4", minsAgo: 125 });
  make(prop(UNO, "hand_winner", uno, 2)[0], uno.id, ME, 124, [E(ME, "p3", 50, 123), E("u_mya", "p2", 50, 123), E("u_jordan", "p6", 50, 122)], { optionId: "p2", minsAgo: 105 });
  make(prop(UNO, "wd4", uno, 3)[0], uno.id, ME, 104, [E(ME, "yes", 50, 103), E("u_marcus", "no", 50, 103), E("u_mya", "yes", 50, 102)], { optionId: "yes", minsAgo: 80 });
  make(prop(UNO, "game_winner", uno, 1)[0], uno.id, ME, 140, [E(ME, "p3", 50, 139), E("u_jordan", "p5", 50, 138), E("u_marcus", "p5", 50, 137)], { optionId: "p3", minsAgo: 75 });

  // Spades rounds 1–2 (settled)
  make(prop(SPADES, "round_winner", spades, 1)[0], spades.id, ME, 69, [E(ME, "s1", 50, 68), E("u_mya", "s1", 50, 68), E("u_jordan", "s2", 100, 67)], { optionId: "s2", minsAgo: 55 });
  make(prop(SPADES, "most_books", spades, 1)[0], spades.id, ME, 69, [E(ME, "p1", 50, 68), E("u_marcus", "p4", 50, 67)], { optionId: "p4", minsAgo: 55 });
  make(prop(SPADES, "gets_set", spades, 2)[0], spades.id, ME, 54, [E("u_mya", "none", 50, 53), E("u_jordan", "s1", 50, 52), E("u_marcus", "s1", 50, 51)], { optionId: "s1", minsAgo: 30 });
  prop(SPADES, "made_bid", spades, 2).forEach((s) => make(s, spades.id, ME, 54, s.key.endsWith("s2") ? [E(ME, "no", 50, 53), E("u_mya", "yes", 50, 52)] : [E("u_marcus", "no", 50, 52), E(ME, "yes", 50, 53)], { optionId: s.key.endsWith("s2") ? "yes" : "no", minsAgo: 30 }));

  // Spades round 3 + game (open)
  const r3 = make(prop(SPADES, "round_winner", spades, 3)[0], spades.id, ME, 28, [E("u_mya", "s1", 50, 27), E("u_marcus", "s2", 75, 26), E("u_jordan", "s2", 50, 25)]);
  make(prop(SPADES, "gets_set", spades, 3)[0], spades.id, ME, 28, [E("u_jordan", "s1", 50, 24)]);
  make(overUnderSpec(night, spades, "p4", SPADES.ouMetrics[0], 4.5, 3), spades.id, "u_marcus", 26, [E("u_marcus", "over", 50, 25), E("u_mya", "under", 50, 22)]);
  make(prop(SPADES, "game_winner", spades, 1)[0], spades.id, ME, 69, [E("u_jordan", "s2", 100, 66), E("u_mya", "s1", 50, 65), E("u_marcus", "s2", 50, 64)]);

  // Night-wide + wild
  make(nightTeamSpec(night), undefined, ME, 145, [E("u_mya", "t1", 50, 144), E("u_jordan", "t2", 50, 143), E("u_marcus", "t2", 50, 142)]);
  make(wildSpec(night, WILD.find((w) => w.key === "complain")!, "p4"), undefined, "u_mya", 120, [E(ME, "yes", 20, 119), E("u_mya", "yes", 20, 118), E("u_jordan", "no", 20, 117)]);
  make(wildSpec(night, WILD.find((w) => w.key === "trash_talk")!), undefined, ME, 100, [E("u_mya", "p5", 20, 99), E("u_jordan", "p1", 20, 98)]);
  make(wildSpec(night, WILD.find((w) => w.key === "food")!), undefined, "u_marcus", 90, [E(ME, "yes", 20, 89), E("u_marcus", "yes", 20, 88)], { optionId: "yes", minsAgo: 60 });
  make(wildSpec(night, WILD.find((w) => w.key === "cheating")!, "p2"), undefined, "u_jordan", 10, [], undefined, true);

  messages.push(
    { id: "nm_chat1", challengeId: r3.id, kind: "chat", userId: "u_marcus", text: "Dad is about to run the table, watch", at: T - 24 * MIN, reactions: { "😂": ["u_mya"] } },
    { id: "nm_chat2", challengeId: r3.id, kind: "chat", userId: "u_mya", text: "Mom has not been set ONE time tonight. Respect.", at: T - 21 * MIN, reactions: {} },
  );
  return { night, challenges, messages };
}
