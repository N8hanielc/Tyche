// Domain model. Shapes mirror the tables a Supabase backend would hold
// (users, challenges, entries, messages, notifications, groups).

export type ID = string;

export type Category =
  | "Road Trip"
  | "Game Night"
  | "Dinner"
  | "Night Out"
  | "Sports"
  | "Music"
  | "Entertainment"
  | "Nightlife"
  | "Travel"
  | "Custom";

export type Format = "over_under" | "yes_no" | "pick_one" | "exact";

export type Visibility = "friends" | "link" | "group" | "public" | "night";

export type Verifier = "creator" | "group" | "vote" | "source";

export type TieRule = "refund" | "split" | "rematch";

export type StakeMode = "even" | "odds" | "bragging";

export type Status = "open" | "live" | "review" | "vote" | "settled";

export interface User {
  id: ID;
  username: string;
  name: string;
  avatar?: string;
  hue: number; // fallback avatar gradient
  bio?: string;
  followers: number;
  following: number;
  baseWins: number; // historical record not represented by seed challenges
  baseLosses: number;
  points: number;
  badges?: string[];
  plus?: Subscription;
  lastClaimAt?: number;
  claimStreak?: number;
  trialUsed?: boolean;
  cardTheme?: string;
  verified?: boolean; // blue-check style badge, set by Tyche admins only
  onboarded?: boolean; // false for new Google/Apple accounts until they confirm their profile
}

export type Plan = "monthly" | "yearly" | "crew";

export interface Subscription {
  plan: Plan;
  startedAt: number;
  trialEndsAt?: number;
  renewsAt: number;
  canceled?: boolean;
}

export interface Option {
  id: ID;
  label: string;
  sub?: string;
  subjects?: ID[]; // people this option is about — they can't bet or vote on it
}

export interface Entry {
  userId: ID;
  optionId: ID;
  points: number;
  at: number;
}

export interface LiveState {
  startedAt?: number;
  endedAt?: number;
  resultDueAt?: number; // creator must submit by this time or it goes to a vote
  counter?: number; // for count-based over/under (plates, threes…)
}

export interface Result {
  optionId: ID;
  value?: number; // measured value (minutes, plates…)
  submittedBy: ID;
  submittedAt: number;
  confirmations: ID[];
  disputes: ID[];
  evidence?: string; // data URL in the prototype; storage URL later
  settledAt?: number;
  payouts?: Record<ID, number>; // userId -> net points
}

export interface Vote {
  reason: "deadline" | "dispute" | "participants";
  round?: number; // 2 = runoff between tied options
  choices?: ID[]; // restrict to these options (runoff)
  opensAt: number;
  endsAt: number;
  votes: Record<ID, ID>; // userId -> optionId or "__tie"
  proposed?: ID; // the disputed result, if any
}

export interface Challenge {
  id: ID;
  creatorId: ID;
  createdAt: number;
  category: Category;
  question: string;
  title?: string;
  description?: string;
  media?: string;
  format: Format;
  line?: number;
  unit?: string; // "time" means minutes rendered as h/m
  options: Option[];
  entries: Entry[];
  stakeMode: StakeMode;
  odds?: Record<ID, number>;
  forfeit?: string;
  visibility: Visibility;
  groupId?: ID;
  closesAt: number;
  startsAt?: number;
  resolution: string;
  tieRule: TieRule;
  verifier: Verifier;
  status: Status;
  live?: LiveState;
  result?: Result;
  vote?: Vote;
  nightId?: ID; // Game Night prop
  gameId?: ID; // which game in the night (none = night-wide prop)
  prop?: PropMeta;
  lockedAt?: number; // when joining closed (system message posted)
  voteAt?: number; // participant-vote challenges: when voting opens automatically
  likes: ID[];
  shares: number;
}

export interface Message {
  id: ID;
  challengeId: ID;
  kind: "chat" | "system";
  userId?: ID;
  text: string;
  icon?: string; // emoji for system rows
  image?: string;
  replyTo?: ID;
  reactions: Record<string, ID[]>;
  at: number;
}

export type NotificationKind =
  | "joined"
  | "invite"
  | "reply"
  | "created"
  | "closing"
  | "started"
  | "confirmed"
  | "won"
  | "lost"
  | "follow";

export interface Notification {
  id: ID;
  kind: NotificationKind;
  actorId?: ID;
  challengeId?: ID;
  text: string;
  at: number;
  read: boolean;
  to?: ID; // recipient; seed rows without it belong to the demo user
}

export interface Group {
  id: ID;
  ownerId?: ID;
  name: string;
  emoji: string;
  memberIds: ID[];
  createdAt: number;
}

// ---------------- Game Night ----------------

/** How a prop settles itself from the scoreboard. */
export type Resolver =
  | { type: "round_max"; metric: string; scope: "player" | "side" } // most X this round
  | { type: "round_pick"; field: string } // host picks a player each round (e.g. who went out first)
  | { type: "round_flag"; metric: string; scope: "side" } // which side(s) had the flag (e.g. set)
  | { type: "round_any"; metric: string } // did anyone… this round (yes/no)
  | { type: "made_bid"; sideId: string } // spades: did this side make its bid (yes/no)
  | { type: "ou"; subject: string; metric: string; line: number; scope: "round" | "game" } // over/under
  | { type: "event_first"; event: string } // first player to… (monopoly)
  | { type: "event_any"; event: string } // will anyone… during the game (yes/no)
  | { type: "final_max"; metric: string } // most X at the end of the game
  | { type: "game_winner" } // which side wins the game
  | { type: "night_team" }; // which night team wins the night

export interface PropMeta {
  kind: "game" | "wild";
  key?: string; // template prop key
  resolver?: Resolver; // absent = host settles by hand
  round?: number; // round props settle when that round is entered
  repeat?: boolean; // re-offer every round
  pending?: boolean; // proposed by a guest of the night, waiting for host approval
  allowSelf?: boolean;
}

export interface NightPlayer {
  id: ID;
  name: string;
  userId?: ID; // app user; guests have none
  teamId?: ID;
}

export interface NightTeam {
  id: ID;
  name: string;
  emoji: string;
}

/** A side in one game: a spades partnership, or one player in Uno/Monopoly. */
export interface GameSide {
  id: ID;
  name: string;
  playerIds: ID[];
}

export interface GameRound {
  n: number;
  status: "open" | "locked" | "final";
  /** per player numbers, e.g. { p1: { bid: 3, books: 4 } } */
  values: Record<ID, Record<string, number>>;
  /** single picks for the round, e.g. { winner: "p2", caught: "none" } */
  picks: Record<string, string>;
  /** yes/no facts for the round, e.g. { wd4: 1 } */
  flags: Record<string, number>;
}

export interface GameEvent {
  type: string; // bankrupt | hotel | boardwalk
  playerId: ID;
  at: number;
}

export interface NightGame {
  id: ID;
  templateId: string;
  name: string;
  emoji: string;
  status: "live" | "done";
  startedAt: number;
  endedAt?: number;
  sides: GameSide[];
  rounds: GameRound[];
  events: GameEvent[];
  totals: Record<ID, Record<string, number>>; // per player running totals (e.g. properties owned)
  winnerSideId?: ID;
}

export interface CustomTemplate {
  id: string;
  name: string;
  emoji: string;
  metric: string; // what gets counted each round, e.g. "points"
  teams: boolean;
}

export interface Night {
  id: ID;
  hostId: ID;
  name: string;
  createdAt: number;
  status: "live" | "ended";
  memberIds: ID[];
  players: NightPlayer[];
  teams: NightTeam[];
  games: NightGame[];
  currentGameId?: ID;
  customTemplates?: CustomTemplate[];
  endedAt?: number;
  champion?: { userId: ID; score: number; awards: { key: string; label: string; emoji: string; who: string; detail: string }[] };
}

export interface DB {
  version: number;
  meId: ID;
  users: Record<ID, User>;
  following: ID[]; // who "me" follows
  followerIds?: ID[]; // who follows "me" (newest first)
  challenges: Challenge[];
  messages: Message[];
  notifications: Notification[];
  groups: Group[];
  lastRead: Record<ID, number>; // challengeId -> timestamp the room was last opened
  nights?: Night[];
  // per-account copies of `following` / `lastRead`, swapped in when the signed-in user changes
  saved?: Record<ID, { following: ID[]; lastRead: Record<ID, number>; followerIds?: ID[] }>;
}
