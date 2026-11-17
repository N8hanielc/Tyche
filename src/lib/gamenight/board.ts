import type { Challenge, DB, Night } from "@/lib/types";
import { sideRound } from "./engine";

/** Champion score = points won ÷ 10 + 5 per correct pick + 5 × best streak (game props only). */
export const SCORE_FORMULA = "Points won ÷ 10 + 5 per correct pick + 5 × best streak";
export const TEAM_GAME_WIN_BONUS = 20;

export interface PlayerLine {
  userId: string;
  name: string;
  gameNet: number;
  wildNet: number;
  correct: number;
  picks: number;
  accuracy: number;
  bestStreak: number;
  created: number;
  score: number;
}

export interface Award {
  key: string;
  label: string;
  emoji: string;
  who: string;
  detail: string;
}

export function nightProps(db: DB, night: Night): Challenge[] {
  return db.challenges.filter((c) => c.nightId === night.id);
}

export function predictorLines(db: DB, night: Night): PlayerLine[] {
  const props = nightProps(db, night);
  const settled = props.filter((c) => c.status === "settled" && c.result).sort((a, b) => (a.result!.settledAt ?? 0) - (b.result!.settledAt ?? 0));
  const ids = [...new Set([night.hostId, ...night.memberIds])];
  return ids
    .map((uid) => {
      let gameNet = 0, wildNet = 0, correct = 0, picks = 0, streak = 0, best = 0;
      settled.forEach((c) => {
        const e = c.entries.find((x) => x.userId === uid);
        if (!e) return;
        const net = c.result!.payouts?.[uid] ?? 0;
        if (c.prop?.kind === "wild") {
          wildNet += net;
          return;
        }
        gameNet += net;
        if (c.result!.optionId === "__tie") return;
        picks++;
        if (e.optionId === c.result!.optionId) {
          correct++;
          streak++;
          best = Math.max(best, streak);
        } else streak = 0;
      });
      const created = props.filter((c) => c.creatorId === uid).length;
      const score = Math.round(gameNet / 10) + 5 * correct + 5 * best;
      const u = db.users[uid];
      const player = night.players.find((p) => p.userId === uid);
      return { userId: uid, name: player?.name ?? u?.name ?? "Player", gameNet, wildNet, correct, picks, accuracy: picks ? correct / picks : 0, bestStreak: best, created, score };
    })
    .sort((a, b) => b.score - a.score || b.gameNet - a.gameNet);
}

export interface TeamLine {
  teamId: string;
  name: string;
  emoji: string;
  memberScore: number;
  gameWins: number;
  total: number;
}

/** Team score = sum of members' champion scores + 20 per game won by a side with a team member. */
export function teamLines(db: DB, night: Night): TeamLine[] {
  const lines = predictorLines(db, night);
  return night.teams
    .map((t) => {
      const members = night.players.filter((p) => p.teamId === t.id);
      const memberScore = members.reduce((a, p) => a + (lines.find((l) => l.userId === p.userId)?.score ?? 0), 0);
      const gameWins = night.games.filter((g) => {
        const side = g.sides.find((s) => s.id === g.winnerSideId);
        return g.status === "done" && side?.playerIds.some((pid) => members.some((m) => m.id === pid));
      }).length;
      return { teamId: t.id, name: t.name, emoji: t.emoji, memberScore, gameWins, total: memberScore + gameWins * TEAM_GAME_WIN_BONUS };
    })
    .sort((a, b) => b.total - a.total);
}

/** Per-game records, including guests (they don't pick, but they play). */
export function gameRecords(night: Night): Award[] {
  const out: Award[] = [];
  const name = (pid: string) => night.players.find((p) => p.id === pid)?.name ?? "Someone";
  night.games.forEach((g) => {
    if (g.templateId === "spades") {
      let best = { pid: "", books: -1, round: 0 };
      g.rounds.filter((r) => r.status === "final").forEach((r) =>
        Object.entries(r.values).forEach(([pid, v]) => (v.books ?? 0) > best.books && (best = { pid, books: v.books ?? 0, round: r.n })),
      );
      if (best.pid) out.push({ key: `rec:${g.id}:books`, label: "Most books in a round", emoji: "📚", who: name(best.pid), detail: `${best.books} books · round ${best.round}` });
      const sets = Object.fromEntries(g.sides.map((s) => [s.id, g.rounds.filter((r) => r.status === "final" && sideRound(g, s, r).set).length]));
      const worst = Object.entries(sets).sort((a, b) => b[1] - a[1])[0];
      if (worst && worst[1] > 0) out.push({ key: `rec:${g.id}:set`, label: "Set the most", emoji: "💥", who: g.sides.find((s) => s.id === worst[0])?.name ?? "", detail: `${worst[1]}× in ${g.name}` });
    }
    if (g.templateId === "uno") {
      const wins: Record<string, number> = {};
      g.rounds.filter((r) => r.status === "final").forEach((r) => r.picks.winner && (wins[r.picks.winner] = (wins[r.picks.winner] ?? 0) + 1));
      const top = Object.entries(wins).sort((a, b) => b[1] - a[1])[0];
      if (top) out.push({ key: `rec:${g.id}:hands`, label: "Most Uno hands won", emoji: "🃏", who: name(top[0]), detail: `${top[1]} hands` });
      const caught: Record<string, number> = {};
      g.rounds.filter((r) => r.status === "final").forEach((r) => r.picks.caught && r.picks.caught !== "none" && (caught[r.picks.caught] = (caught[r.picks.caught] ?? 0) + 1));
      const c = Object.entries(caught).sort((a, b) => b[1] - a[1])[0];
      if (c) out.push({ key: `rec:${g.id}:caught`, label: "Forgot to say Uno", emoji: "🫢", who: name(c[0]), detail: `caught ${c[1]}×` });
    }
    if (g.templateId === "monopoly") {
      const bk = g.events.filter((e) => e.type === "bankrupt").sort((a, b) => a.at - b.at)[0];
      if (bk) out.push({ key: `rec:${g.id}:bankrupt`, label: "First to go broke", emoji: "💸", who: name(bk.playerId), detail: "Monopoly" });
    }
    if (g.status === "done" && g.winnerSideId) {
      const side = g.sides.find((s) => s.id === g.winnerSideId);
      if (side) out.push({ key: `rec:${g.id}:win`, label: `${g.emoji} ${g.name} winner`, emoji: "🏅", who: side.name, detail: "" });
    }
  });
  return out;
}

export function awards(db: DB, night: Night): Award[] {
  const lines = predictorLines(db, night);
  const withPicks = lines.filter((l) => l.picks > 0);
  const top = <T,>(arr: T[], f: (x: T) => number) => [...arr].sort((a, b) => f(b) - f(a))[0];
  const out: Award[] = [];
  const champ = lines[0];
  if (champ && (champ.score > 0 || champ.picks > 0)) out.push({ key: "champion", label: "Champion", emoji: "👑", who: champ.name, detail: `${champ.score} pts` });
  const sharp = top(withPicks.filter((l) => l.picks >= 3), (l) => l.accuracy);
  if (sharp) out.push({ key: "sharp", label: "Most accurate", emoji: "🎯", who: sharp.name, detail: `${Math.round(sharp.accuracy * 100)}% · ${sharp.correct}/${sharp.picks}` });
  const hot = top(withPicks, (l) => l.bestStreak);
  if (hot && hot.bestStreak >= 2) out.push({ key: "streak", label: "Hot hand", emoji: "🔥", who: hot.name, detail: `${hot.bestStreak} in a row` });
  const earner = top(withPicks, (l) => l.gameNet);
  if (earner && earner.gameNet > 0) out.push({ key: "earner", label: "Big earner", emoji: "💰", who: earner.name, detail: `+${earner.gameNet} pts` });
  const maker = top(lines, (l) => l.created);
  if (maker && maker.created > 0) out.push({ key: "maker", label: "Prop master", emoji: "🧠", who: maker.name, detail: `${maker.created} props` });
  const wild = top(lines, (l) => l.wildNet);
  if (wild && wild.wildNet > 0) out.push({ key: "wild", label: "Wild Card", emoji: "🃏", who: wild.name, detail: `+${wild.wildNet} wild pts` });
  return [...out, ...gameRecords(night)];
}
