import type { CustomTemplate, Format, Night, NightGame, Option, PropMeta, Resolver } from "@/lib/types";

/** A ready-to-create prop, built from a template for a specific game/round. */
export interface PropSpec {
  key: string;
  question: string;
  format: Format;
  options: Option[];
  line?: number;
  unit?: string;
  meta: PropMeta;
}

export interface PropTemplate {
  key: string;
  label: string; // chip text
  emoji: string;
  scope: "round" | "game";
  /** Returns one or more props (e.g. "Will X make its bid?" makes one per team). */
  build: (g: NightGame, night: Night, round: number) => PropSpec[];
}

export interface GameTemplate {
  id: string;
  name: string;
  emoji: string;
  rounds: boolean; // round-by-round scoring (Spades/Uno) vs. events (Monopoly)
  roundLabel: string; // "Round" / "Hand"
  sides: "pairs" | "players";
  blurb: string;
  /** numeric per-player inputs the host enters each round */
  inputs: { key: string; label: string; max?: number }[];
  /** single choices per round (player picks) */
  picks: { key: string; label: string; allowNone?: boolean }[];
  /** yes/no toggles per round */
  flags: { key: string; label: string }[];
  /** game-long events (Monopoly) */
  events: { key: string; label: string; emoji: string }[];
  /** running per-player totals the host keeps updated (Monopoly properties) */
  totals: { key: string; label: string }[];
  /** what an over/under can be set on */
  ouMetrics: { key: string; label: string; scope: "round" | "game"; defaultLine: number }[];
  props: PropTemplate[];
}

// ---------------- option helpers ----------------

const userIdsOf = (night: Night, playerIds: string[]) =>
  playerIds.map((id) => night.players.find((p) => p.id === id)?.userId).filter((x): x is string => !!x);

export const playerName = (night: Night, id: string) => night.players.find((p) => p.id === id)?.name ?? "Someone";

export function sideOptions(g: NightGame, night: Night, allowSelf: boolean): Option[] {
  return g.sides.map((s) => ({ id: s.id, label: s.name, ...(allowSelf ? {} : { subjects: userIdsOf(night, s.playerIds) }) }));
}

export function playerOptions(g: NightGame, night: Night, allowSelf: boolean): Option[] {
  const ids = [...new Set(g.sides.flatMap((s) => s.playerIds))];
  return ids.map((id) => {
    const p = night.players.find((x) => x.id === id);
    return { id, label: p?.name ?? "Player", ...(!allowSelf && p?.userId ? { subjects: [p.userId] } : {}) };
  });
}

const NOBODY: Option = { id: "none", label: "Nobody" };
const YES_NO: Option[] = [{ id: "yes", label: "YES" }, { id: "no", label: "NO" }];

function spec(key: string, question: string, format: Format, options: Option[], resolver: Resolver, extra: Partial<PropMeta> = {}, more: Partial<PropSpec> = {}): PropSpec {
  return { key, question, format, options, meta: { kind: "game", key, resolver, allowSelf: false, ...extra }, ...more };
}

// ---------------- built-in games ----------------

export const SPADES: GameTemplate = {
  id: "spades",
  name: "Spades",
  emoji: "♠️",
  rounds: true,
  roundLabel: "Round",
  sides: "pairs",
  blurb: "Partners bid books each round. Make it or get set.",
  inputs: [
    { key: "bid", label: "Bid", max: 13 },
    { key: "books", label: "Books", max: 13 },
  ],
  picks: [],
  flags: [],
  events: [],
  totals: [],
  ouMetrics: [{ key: "books", label: "books", scope: "round", defaultLine: 3.5 }],
  props: [
    {
      key: "round_winner", label: "Who wins the round", emoji: "🏆", scope: "round",
      build: (g, n, r) => [spec("round_winner", `Who wins round ${r}?`, "pick_one", sideOptions(g, n, true), { type: "round_max", metric: "roundScore", scope: "side" }, { round: r, repeat: true, allowSelf: true })],
    },
    {
      key: "gets_set", label: "Who gets set", emoji: "💥", scope: "round",
      build: (g, n, r) => [spec("gets_set", `Who gets set in round ${r}?`, "pick_one",
        [...sideOptions(g, n, false), NOBODY, ...(g.sides.length === 2 ? [{ id: "both", label: "Both teams" }] : [])],
        { type: "round_flag", metric: "set", scope: "side" }, { round: r, repeat: true })],
    },
    {
      key: "made_bid", label: "Will a team make its bid", emoji: "🎯", scope: "round",
      build: (g, _n, r) => g.sides.map((s) => spec(`made_bid:${s.id}`, `Will ${s.name} make their bid in round ${r}?`, "yes_no", YES_NO, { type: "made_bid", sideId: s.id }, { round: r, repeat: true, allowSelf: true })),
    },
    {
      key: "most_books", label: "Who gets the most books", emoji: "📚", scope: "round",
      build: (g, n, r) => [spec("most_books", `Who gets the most books in round ${r}?`, "pick_one", playerOptions(g, n, true), { type: "round_max", metric: "books", scope: "player" }, { round: r, repeat: true, allowSelf: true })],
    },
    {
      key: "game_winner", label: "Which team wins the game", emoji: "👑", scope: "game",
      build: (g, n) => [spec("game_winner", "Which team wins Spades?", "pick_one", sideOptions(g, n, true), { type: "game_winner" }, { allowSelf: true })],
    },
  ],
};

export const UNO: GameTemplate = {
  id: "uno",
  name: "Uno",
  emoji: "🃏",
  rounds: true,
  roundLabel: "Hand",
  sides: "players",
  blurb: "Every hand: who goes out, who forgets to say Uno, who eats the cards.",
  inputs: [{ key: "drawn", label: "Cards drawn", max: 60 }],
  picks: [
    { key: "winner", label: "Who went out first" },
    { key: "caught", label: "Caught without saying Uno", allowNone: true },
  ],
  flags: [{ key: "wd4", label: "A Wild Draw Four was played" }],
  events: [],
  totals: [],
  ouMetrics: [{ key: "drawn", label: "cards drawn", scope: "round", defaultLine: 4.5 }],
  props: [
    {
      key: "hand_winner", label: "Who wins first", emoji: "🥇", scope: "round",
      build: (g, n, r) => [spec("hand_winner", `Who goes out first in hand ${r}?`, "pick_one", playerOptions(g, n, true), { type: "round_pick", field: "winner" }, { round: r, repeat: true, allowSelf: true })],
    },
    {
      key: "caught", label: "Who gets caught without saying Uno", emoji: "🫢", scope: "round",
      build: (g, n, r) => [spec("caught", `Who gets caught without saying Uno in hand ${r}?`, "pick_one", [...playerOptions(g, n, false), NOBODY], { type: "round_pick", field: "caught" }, { round: r, repeat: true })],
    },
    {
      key: "draws_most", label: "Who draws the most cards", emoji: "🫠", scope: "round",
      build: (g, n, r) => [spec("draws_most", `Who draws the most cards in hand ${r}?`, "pick_one", playerOptions(g, n, false), { type: "round_max", metric: "drawn", scope: "player" }, { round: r, repeat: true })],
    },
    {
      key: "wd4", label: "Will someone play a Wild Draw Four", emoji: "➕", scope: "round",
      build: (_g, _n, r) => [spec("wd4", `Will someone play a Wild Draw Four in hand ${r}?`, "yes_no", YES_NO, { type: "round_any", metric: "wd4" }, { round: r, repeat: true, allowSelf: true })],
    },
    {
      key: "game_winner", label: "Who wins the most hands", emoji: "👑", scope: "game",
      build: (g, n) => [spec("game_winner", "Who wins the most Uno hands tonight?", "pick_one", sideOptions(g, n, true), { type: "game_winner" }, { allowSelf: true })],
    },
  ],
};

export const MONOPOLY: GameTemplate = {
  id: "monopoly",
  name: "Monopoly",
  emoji: "🎩",
  rounds: false,
  roundLabel: "Turn",
  sides: "players",
  blurb: "Log the big moments as they happen. Props settle the second they hit.",
  inputs: [],
  picks: [],
  flags: [],
  events: [
    { key: "bankrupt", label: "Went bankrupt", emoji: "💸" },
    { key: "hotel", label: "Built a hotel", emoji: "🏨" },
    { key: "boardwalk", label: "Landed on Boardwalk", emoji: "🛣️" },
  ],
  totals: [{ key: "properties", label: "Properties owned" }],
  ouMetrics: [{ key: "properties", label: "properties", scope: "game", defaultLine: 6.5 }],
  props: [
    {
      key: "bankrupt_first", label: "Who goes bankrupt first", emoji: "💸", scope: "game",
      build: (g, n) => [spec("bankrupt_first", "Who goes bankrupt first?", "pick_one", [...playerOptions(g, n, false), NOBODY], { type: "event_first", event: "bankrupt" })],
    },
    {
      key: "most_properties", label: "Who owns the most properties", emoji: "🏘️", scope: "game",
      build: (g, n) => [spec("most_properties", "Who owns the most properties at the end?", "pick_one", playerOptions(g, n, true), { type: "final_max", metric: "properties" }, { allowSelf: true })],
    },
    {
      key: "boardwalk", label: "Will someone land on Boardwalk", emoji: "🛣️", scope: "game",
      build: () => [spec("boardwalk", "Will someone land on Boardwalk?", "yes_no", YES_NO, { type: "event_any", event: "boardwalk" }, { allowSelf: true })],
    },
    {
      key: "first_hotel", label: "Who builds the first hotel", emoji: "🏨", scope: "game",
      build: (g, n) => [spec("first_hotel", "Who builds the first hotel?", "pick_one", [...playerOptions(g, n, true), NOBODY], { type: "event_first", event: "hotel" }, { allowSelf: true })],
    },
    {
      key: "game_winner", label: "Who wins Monopoly", emoji: "👑", scope: "game",
      build: (g, n) => [spec("game_winner", "Who wins Monopoly?", "pick_one", sideOptions(g, n, true), { type: "game_winner" }, { allowSelf: true })],
    },
  ],
};

/** A host-made game: one number per player per round (points, rings, cups…). */
export function customGame(t: CustomTemplate): GameTemplate {
  return {
    id: t.id,
    name: t.name,
    emoji: t.emoji,
    rounds: true,
    roundLabel: "Round",
    sides: t.teams ? "pairs" : "players",
    blurb: `Track ${t.metric} each round.`,
    inputs: [{ key: "score", label: t.metric[0].toUpperCase() + t.metric.slice(1) }],
    picks: [],
    flags: [],
    events: [],
    totals: [],
    ouMetrics: [{ key: "score", label: t.metric, scope: "round", defaultLine: 9.5 }],
    props: [
      {
        key: "round_winner", label: "Who wins the round", emoji: "🏆", scope: "round",
        build: (g, n, r) => [spec("round_winner", `Who wins round ${r}?`, "pick_one", sideOptions(g, n, true), { type: "round_max", metric: "score", scope: "side" }, { round: r, repeat: true, allowSelf: true })],
      },
      {
        key: "game_winner", label: `Who wins ${t.name}`, emoji: "👑", scope: "game",
        build: (g, n) => [spec("game_winner", `Who wins ${t.name}?`, "pick_one", sideOptions(g, n, true), { type: "game_winner" }, { allowSelf: true })],
      },
    ],
  };
}

export const BUILT_IN = [SPADES, UNO, MONOPOLY];

export function templateFor(night: Night, templateId: string): GameTemplate | undefined {
  const b = BUILT_IN.find((t) => t.id === templateId);
  if (b) return b;
  const c = night.customTemplates?.find((t) => t.id === templateId);
  return c ? customGame(c) : undefined;
}

/** Over/under on one player's number, e.g. "Dad over 4.5 books in round 3". */
export function overUnderSpec(night: Night, g: NightGame, playerId: string, metric: GameTemplate["ouMetrics"][number], line: number, round: number): PropSpec {
  const name = playerName(night, playerId);
  const userId = night.players.find((p) => p.id === playerId)?.userId;
  const when = metric.scope === "round" ? ` in ${g.templateId === "uno" ? "hand" : "round"} ${round}` : "";
  return {
    key: `ou:${playerId}:${metric.key}`,
    question: `${name}: over or under ${line} ${metric.label}${when}?`,
    format: "over_under",
    line,
    unit: metric.label,
    // betting OVER on yourself is fine (you're trying anyway); UNDER on yourself is blocked
    options: [
      { id: "over", label: "OVER", sub: `${Math.ceil(line)}+ ${metric.label}` },
      { id: "under", label: "UNDER", sub: `${Math.floor(line)} or fewer`, ...(userId ? { subjects: [userId] } : {}) },
    ],
    meta: { kind: "game", key: `ou:${metric.key}`, resolver: { type: "ou", subject: playerId, metric: metric.key, line, scope: metric.scope }, round: metric.scope === "round" ? round : undefined, allowSelf: false },
  };
}

export function nightTeamSpec(night: Night): PropSpec {
  return {
    key: "night_team",
    question: "Which team wins the night?",
    format: "pick_one",
    options: night.teams.map((t) => ({ id: t.id, label: `${t.emoji} ${t.name}` })),
    meta: { kind: "game", key: "night_team", resolver: { type: "night_team" }, allowSelf: true },
  };
}

// ---------------- Wild Props ----------------

export interface WildTemplate {
  key: string;
  emoji: string;
  /** "{p}" is replaced with a player's name; questions without it are about the whole table */
  text: string;
  type: "yes_no" | "pick";
}

export const WILD: WildTemplate[] = [
  { key: "complain", emoji: "😤", text: "Will {p} complain about the rules?", type: "yes_no" },
  { key: "cheating", emoji: "🕵️", text: "Will {p} accuse someone of cheating?", type: "yes_no" },
  { key: "food", emoji: "🍗", text: "Will someone get up for food mid-game?", type: "yes_no" },
  { key: "two_in_row", emoji: "🔥", text: "Will {p} win 2 games in a row?", type: "yes_no" },
  { key: "quit", emoji: "🚪", text: "Will someone quit before the night is over?", type: "yes_no" },
  { key: "trash_talk", emoji: "🗣️", text: "Who will talk the most trash?", type: "pick" },
  { key: "sore_loser", emoji: "😾", text: "Who will be the sorest loser?", type: "pick" },
  { key: "phone", emoji: "📱", text: "Who checks their phone the most?", type: "pick" },
];

/** Wild props never let someone bet on a prop about themselves. */
export function wildSpec(night: Night, t: WildTemplate, playerId?: string): PropSpec {
  const p = playerId ? night.players.find((x) => x.id === playerId) : undefined;
  const question = t.text.replace("{p}", p?.name ?? "someone");
  if (t.type === "pick") {
    return {
      key: `wild:${t.key}`,
      question,
      format: "pick_one",
      options: night.players.map((x) => ({ id: x.id, label: x.name, ...(x.userId ? { subjects: [x.userId] } : {}) })),
      meta: { kind: "wild", key: t.key, allowSelf: false },
    };
  }
  return {
    key: `wild:${t.key}`,
    question,
    format: "yes_no",
    options: YES_NO.map((o) => ({ ...o, ...(p?.userId ? { subjects: [p.userId] } : {}) })),
    meta: { kind: "wild", key: t.key, allowSelf: false },
  };
}

/** Free-form wild prop typed by anyone at the table. */
export function customWildSpec(question: string, aboutPlayerId?: string, night?: Night): PropSpec {
  const userId = aboutPlayerId && night ? night.players.find((x) => x.id === aboutPlayerId)?.userId : undefined;
  return {
    key: "wild:custom",
    question,
    format: "yes_no",
    options: YES_NO.map((o) => ({ ...o, ...(userId ? { subjects: [userId] } : {}) })),
    meta: { kind: "wild", key: "custom", allowSelf: false },
  };
}

export const WILD_STAKE = 20;
