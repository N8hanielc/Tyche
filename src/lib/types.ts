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

export type Visibility = "friends" | "link" | "group" | "public";

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

export interface DB {
  version: number;
  meId: ID;
  users: Record<ID, User>;
  following: ID[]; // who "me" follows
  challenges: Challenge[];
  messages: Message[];
  notifications: Notification[];
  groups: Group[];
  lastRead: Record<ID, number>; // challengeId -> timestamp the room was last opened
  // per-account copies of `following` / `lastRead`, swapped in when the signed-in user changes
  saved?: Record<ID, { following: ID[]; lastRead: Record<ID, number> }>;
}
