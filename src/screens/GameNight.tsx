"use client";

import { useMemo, useState } from "react";
import { Check, ChevronRight, Crown, Lock, Minus, Plus, Shuffle, Sparkles, Trash2, Trophy, UserPlus, X } from "lucide-react";
import { useNow, useStore } from "@/lib/store";
import { useNav } from "@/lib/nav";
import type { Challenge, GameRound, Night, NightGame, NightPlayer, NightTeam, Option } from "@/lib/types";
import { ago, computePayouts, cx, uid } from "@/lib/utils";
import { Avatar, AvatarStack, BottomSheet, Button, Segmented, TopBar } from "@/components/ui";
import {
  BUILT_IN, WILD, WILD_STAKE, customWildSpec, nightTeamSpec, overUnderSpec, playerName, templateFor, wildSpec,
  type GameTemplate, type PropSpec,
} from "@/lib/gamenight/templates";
import { currentRound, defaultSides, resolveProp, settleable, sideRound, sideTotals } from "@/lib/gamenight/engine";
import { SCORE_FORMULA, TEAM_GAME_WIN_BONUS, awards, predictorLines, teamLines } from "@/lib/gamenight/board";

// ============================================================ helpers ====

const TEAM_PRESETS: [string, string, string, string][] = [
  ["👩", "Mom’s Team", "👨", "Dad’s Team"],
  ["🧓", "Parents", "🧒", "Kids"],
  ["👯", "Siblings", "🧑‍🤝‍🧑", "Cousins"],
  ["🦃", "Turkeys", "🥧", "Pies"],
];

function useNight(id: string) {
  const { db, actions } = useStore();
  const night = db.nights?.find((n) => n.id === id);
  const props = useMemo(() => db.challenges.filter((c) => c.nightId === id), [db.challenges, id]);
  const isHost = night?.hostId === db.meId;
  const game = night?.games.find((g) => g.id === night.currentGameId);
  /** Clone → edit → save (host only). Returns the saved night. */
  const save = (fn: (n: Night) => void) => {
    if (!night) return night;
    const n2 = structuredClone(night);
    fn(n2);
    actions.saveNight(n2);
    return n2;
  };
  return { night, props, isHost, game, save };
}

export function PlayerAvatar({ night, playerId, size = 28 }: { night: Night; playerId: string; size?: number }) {
  const { db } = useStore();
  const p = night.players.find((x) => x.id === playerId);
  const u = p?.userId ? db.users[p.userId] : undefined;
  const hue = [...(p?.name ?? "?")].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 360;
  return <Avatar user={u ?? { id: playerId, name: p?.name ?? "?", username: "", hue, followers: 0, following: 0, baseWins: 0, baseLosses: 0, points: 0 }} size={size} />;
}

const Label = ({ children }: { children: React.ReactNode }) => <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-dim">{children}</div>;

// ============================================================ entry points ====

/** Home: jump back into a live night, or start one. */
export function NightBanner() {
  const { db } = useStore();
  const nav = useNav();
  const live = (db.nights ?? []).find((n) => n.status === "live");
  const g = live?.games.find((x) => x.id === live.currentGameId);
  const r = g ? currentRound(g) : undefined;
  return (
    <button
      onClick={() => (live ? nav.push({ kind: "night", id: live.id }) : nav.push({ kind: "nightNew" }))}
      className="mb-4 flex w-full items-center gap-3 overflow-hidden rounded-[22px] bg-[linear-gradient(115deg,rgba(255,200,92,0.18),rgba(130,71,255,0.22)_55%,#151720)] p-3.5 text-left hairline active:scale-[0.99]"
    >
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-black/30 text-2xl">{live ? g?.emoji ?? "🎲" : "🎲"}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[15px] font-semibold">
          {live ? live.name : "Game Night"}
          {live && <span className="rounded-full bg-loss px-1.5 py-[1px] text-[9px] font-black uppercase">Live</span>}
        </span>
        <span className="block truncate text-[12px] text-muted">
          {live ? (g ? `${g.name}${r && g.rounds.length ? ` · ${templateFor(live, g.templateId)?.roundLabel ?? "Round"} ${r.n}` : ""}` : "Pick the first game") : "Spades, Uno, Monopoly · live scores, props, a champion"}
        </span>
      </span>
      <ChevronRight size={18} className="text-dim" />
    </button>
  );
}

/** Rooms: list of game nights. */
export function NightsSection() {
  const { db } = useStore();
  const nav = useNav();
  const nights = db.nights ?? [];
  return (
    <div className="mb-3 px-2">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-dim">Game Nights</span>
        <button onClick={() => nav.push({ kind: "nightNew" })} className="flex items-center gap-1 text-[13px] font-semibold text-lav">
          <Plus size={14} /> New
        </button>
      </div>
      {nights.length === 0 && (
        <button onClick={() => nav.push({ kind: "nightNew" })} className="w-full rounded-[20px] border border-dashed border-white/10 p-4 text-left text-[13px] text-muted">
          🎲 Start a Game Night: pick a game, invite the family, bet on every round.
        </button>
      )}
      <div className="space-y-2">
        {nights.map((n) => (
          <button key={n.id} onClick={() => nav.push({ kind: "night", id: n.id })} className="flex w-full items-center gap-3 rounded-[20px] bg-card p-3 text-left hairline">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-surface text-xl">{n.status === "ended" ? "👑" : "🎲"}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{n.name}</span>
              <span className="block truncate text-[12px] text-muted">
                {n.status === "ended" ? `Champion: ${n.champion ? (n.players.find((p) => p.userId === n.champion!.userId)?.name ?? db.users[n.champion.userId]?.name ?? "—") : "—"}` : `${n.players.length} players · ${n.games.length} game${n.games.length === 1 ? "" : "s"}`}
              </span>
            </span>
            {n.status === "live" && <span className="rounded-full bg-loss px-1.5 py-0.5 text-[9px] font-black uppercase">Live</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================ create a night ====

export function NewNightScreen() {
  const { db, me, actions } = useStore();
  const nav = useNav();
  const [name, setName] = useState(new Date().getMonth() === 10 ? "Thanksgiving Game Night" : "Game Night");
  const friends = Object.values(db.users).filter((u) => db.following.includes(u.id) && u.followers < 3000);
  const [invited, setInvited] = useState<string[]>([]);
  const [guests, setGuests] = useState<string[]>([]);
  const [guestName, setGuestName] = useState("");
  const [useTeams, setUseTeams] = useState(true);
  const [preset, setPreset] = useState(0);
  const [teamOf, setTeamOf] = useState<Record<string, number>>({});

  const people = [
    { key: `u:${me.id}`, name: me.name.split(" ")[0], userId: me.id },
    ...invited.map((id) => ({ key: `u:${id}`, name: db.users[id]?.name.split(" ")[0] ?? "Friend", userId: id })),
    ...guests.map((g, i) => ({ key: `g:${i}`, name: g, userId: undefined as string | undefined })),
  ];
  const [e1, n1, e2, n2] = TEAM_PRESETS[preset];
  const team = (k: string, i: number) => teamOf[k] ?? i % 2;

  const create = () => {
    const teams: NightTeam[] = useTeams ? [{ id: "t1", name: n1, emoji: e1 }, { id: "t2", name: n2, emoji: e2 }] : [];
    const players: NightPlayer[] = people.map((p, i) => ({ id: `p${i + 1}`, name: p.name, ...(p.userId ? { userId: p.userId } : {}), ...(useTeams ? { teamId: team(p.key, i) === 0 ? "t1" : "t2" } : {}) }));
    const night: Night = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : uid("night"),
      hostId: db.meId, name: name.trim() || "Game Night", createdAt: Date.now(), status: "live", memberIds: [db.meId, ...invited],
      players, teams, games: [],
    };
    actions.createNight(night);
    nav.replace({ kind: "night", id: night.id });
  };

  return (
    <div className="pb-32">
      <TopBar onBack={nav.pop} title="New Game Night" />
      <div className="px-4">
        <Label>Name</Label>
        <input value={name} onChange={(e) => setName(e.target.value)} className="mb-5 h-12 w-full rounded-2xl bg-card px-4 text-[16px] font-semibold outline-none hairline focus:shadow-[0_0_0_1.5px_#8247ff]" />

        <Label>Invite people with Tyche</Label>
        <div className="mb-5 grid grid-cols-4 gap-2">
          {friends.map((u) => {
            const on = invited.includes(u.id);
            return (
              <button key={u.id} onClick={() => setInvited(on ? invited.filter((x) => x !== u.id) : [...invited, u.id])} className="flex flex-col items-center gap-1 py-1">
                <div className="relative">
                  <Avatar user={u} size={48} ring={on} />
                  {on && <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-brand ring-2 ring-ink"><Check size={11} strokeWidth={3} /></span>}
                </div>
                <span className={cx("w-full truncate text-center text-[12px]", on ? "text-white" : "text-muted")}>{u.name.split(" ")[0]}</span>
              </button>
            );
          })}
          {!friends.length && <div className="col-span-4 text-[13px] text-dim">Follow people to invite them. You can add guests below.</div>}
        </div>

        <Label>Guests without the app</Label>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (guestName.trim()) setGuests([...guests, guestName.trim()]);
            setGuestName("");
          }}
          className="mb-2 flex gap-2"
        >
          <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Dad, Aunt Lisa, Grandma…" className="h-11 min-w-0 flex-1 rounded-2xl bg-card px-4 text-[15px] outline-none hairline placeholder:text-dim" />
          <Button type="submit" variant="soft" className="h-11"><UserPlus size={16} /> Add</Button>
        </form>
        <div className="mb-5 flex flex-wrap gap-1.5">
          {guests.map((g, i) => (
            <span key={i} className="flex items-center gap-1 rounded-full bg-surface py-1 pl-3 pr-1.5 text-[13px]">
              {g}
              <button onClick={() => setGuests(guests.filter((_, j) => j !== i))} className="grid h-5 w-5 place-items-center rounded-full text-dim" aria-label="Remove"><X size={12} /></button>
            </span>
          ))}
          {!guests.length && <span className="text-[12px] text-dim">Guests show up in props, scores and teams. Only app users make picks.</span>}
        </div>

        <div className="mb-2 flex items-center justify-between">
          <Label>Teams</Label>
          <button onClick={() => setUseTeams(!useTeams)} className={cx("mb-2 h-7 rounded-full px-3 text-[12px] font-semibold", useTeams ? "bg-brand text-white" : "bg-surface text-muted")}>{useTeams ? "On" : "Off"}</button>
        </div>
        {useTeams && (
          <>
            <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 no-scrollbar">
              {TEAM_PRESETS.map(([a, b, c, d], i) => (
                <button key={i} onClick={() => setPreset(i)} className={cx("shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium", preset === i ? "bg-white text-ink" : "bg-card text-muted hairline")}>
                  {a} {b} vs {c} {d}
                </button>
              ))}
            </div>
            <p className="mb-2 text-[12px] text-dim">Tap someone to switch their team.</p>
            <div className="mb-6 grid grid-cols-2 gap-2">
              {[0, 1].map((t) => (
                <div key={t} className="rounded-[20px] bg-card p-3 hairline">
                  <div className="mb-2 text-[14px] font-semibold">{t === 0 ? `${e1} ${n1}` : `${e2} ${n2}`}</div>
                  <div className="space-y-1">
                    {people.map((p, i) =>
                      team(p.key, i) === t ? (
                        <button key={p.key} onClick={() => setTeamOf({ ...teamOf, [p.key]: 1 - t })} className="flex w-full items-center justify-between rounded-xl bg-surface px-2.5 py-1.5 text-[13px]">
                          {p.name} {!p.userId && <span className="text-[10px] text-dim">guest</span>}
                        </button>
                      ) : null,
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[440px] bg-gradient-to-t from-ink via-ink to-transparent px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-6">
        <Button size="lg" className="w-full" disabled={people.length < 2} onClick={create}>
          🎲 Start {name || "Game Night"} · {people.length} players
        </Button>
      </div>
    </div>
  );
}

// ============================================================ the night ====

type Tab = "live" | "props" | "wild" | "board" | "crew";

export function NightScreen({ id }: { id: string }) {
  const nav = useNav();
  const { night, isHost, game } = useNight(id);
  const [tab, setTab] = useState<Tab>("live");
  if (!night) return null;
  const ended = night.status === "ended";
  return (
    <div className="pb-16">
      <TopBar
        onBack={nav.pop}
        title={night.name}
        sub={
          <span>
            {ended ? "Ended" : "Live"} · {night.players.length} players{isHost ? " · You’re the host" : ""}
          </span>
        }
      />
      <div className="sticky top-[60px] z-20 glass-bar px-4 pb-2">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { id: "live", label: "Live" },
            { id: "props", label: "Props" },
            { id: "wild", label: "Wild" },
            { id: "board", label: "Board" },
            { id: "crew", label: "Crew" },
          ]}
        />
      </div>
      <div className="px-4 pt-2">
        {ended && <ChampionBanner night={night} />}
        {tab === "live" && <LiveTab id={id} goProps={() => setTab("props")} />}
        {tab === "props" && <PropsTab id={id} />}
        {tab === "wild" && <WildTab id={id} />}
        {tab === "board" && <BoardTab id={id} />}
        {tab === "crew" && <CrewTab id={id} />}
      </div>
    </div>
  );
}

function ChampionBanner({ night }: { night: Night }) {
  const { db } = useStore();
  if (!night.champion) return null;
  const name = night.players.find((p) => p.userId === night.champion!.userId)?.name ?? db.users[night.champion.userId]?.name ?? "Champion";
  return (
    <div className="mb-4 overflow-hidden rounded-[26px] bg-[radial-gradient(100%_120%_at_50%_0%,rgba(255,200,92,0.45),rgba(130,71,255,0.25)_55%,#151720)] p-5 text-center hairline">
      <div className="mx-auto mb-2 grid h-16 w-16 animate-pop place-items-center rounded-full bg-gold/20 text-gold">
        <Crown size={34} />
      </div>
      <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-gold">Champion of the night</div>
      <div className="font-display text-[30px] font-extrabold tracking-tight">{name}</div>
      <div className="text-[13px] text-white/75">{night.champion.score} pts · {SCORE_FORMULA.toLowerCase()}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Live ----

function LiveTab({ id, goProps }: { id: string; goProps: () => void }) {
  const { db, actions } = useStore();
  const { night, props, isHost, game, save } = useNight(id);
  const [picker, setPicker] = useState<string | null>(null);
  const [entry, setEntry] = useState(false);
  const [ending, setEnding] = useState(false);
  const [eventSheet, setEventSheet] = useState<string | null>(null);
  const [totalsSheet, setTotalsSheet] = useState(false);
  if (!night) return null;
  const ended = night.status === "ended";
  const t = game ? templateFor(night, game.templateId) : undefined;
  const r = game ? currentRound(game) : undefined;
  const gameProps = game ? props.filter((c) => c.gameId === game.id) : [];
  const active = gameProps.filter((c) => c.status !== "settled" && (c.prop?.round == null || c.prop.round === r?.n));
  const settled = gameProps.filter((c) => c.status === "settled").sort((a, b) => (b.result?.settledAt ?? 0) - (a.result?.settledAt ?? 0));

  // after any scoreboard change, settle whatever is now decided
  const settleNow = (n2: Night | undefined) => n2 && actions.settleProps(settleable(n2, db.challenges));

  const lockPicks = () => {
    if (!game || !r) return;
    actions.lockProps(active.filter((c) => c.prop?.round === r.n && c.closesAt > Date.now()).map((c) => c.id));
    save((n) => {
      const rr = currentRound(n.games.find((x) => x.id === game.id)!);
      rr.status = "locked";
    });
  };

  if (!game)
    return (
      <div>
        {night.games.filter((g) => g.status === "done").length > 0 && <PastGames night={night} />}
        {!ended && (isHost ? (
          <>
            <div className="mb-3 mt-1 font-display text-[22px] font-extrabold">What are we playing?</div>
            <GamePicker night={night} onPick={setPicker} />
            {picker && <StartGameSheet id={id} templateId={picker} onClose={() => setPicker(null)} />}
          </>
        ) : (
          <div className="rounded-[22px] bg-card p-6 text-center text-[14px] text-muted hairline">Waiting for the host to pick the next game 🎲</div>
        ))}
      </div>
    );

  const totals = sideTotals(game);
  const leaderId = Object.entries(totals).sort((a, b) => b[1] - a[1])[0]?.[0];

  return (
    <div>
      <section className="mb-4 overflow-hidden rounded-[26px] bg-[radial-gradient(120%_120%_at_100%_0%,rgba(130,71,255,0.3),#151720_60%)] p-4 hairline">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-2xl">{game.emoji}</span>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[20px] font-extrabold leading-tight">{game.name}</div>
            <div className="text-[12px] text-muted">
              {t?.rounds && r ? `${t.roundLabel} ${r.n} · ${r.status === "open" ? "picks open" : r.status === "locked" ? "picks locked" : "final"}` : `Started ${ago(game.startedAt)} ago`}
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-loss px-2 py-0.5 text-[10px] font-black uppercase"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />Live</span>
        </div>

        {/* scoreboard */}
        {t?.rounds ? (
          <div className="space-y-1.5">
            {game.sides.map((s) => {
              const last = [...game.rounds].reverse().find((x) => x.status === "final");
              const lr = last ? sideRound(game, s, last) : undefined;
              return (
                <div key={s.id} className={cx("flex items-center gap-3 rounded-2xl px-3 py-2.5", s.id === leaderId && totals[s.id] > 0 ? "bg-white/10" : "bg-black/20")}>
                  <div className="flex -space-x-2">{s.playerIds.map((pid) => <PlayerAvatar key={pid} night={night} playerId={pid} size={26} />)}</div>
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{s.name}</span>
                  {lr && game.templateId === "spades" && (
                    <span className={cx("text-[11px] font-semibold", lr.set ? "text-loss" : "text-win")}>{lr.set ? "set" : `+${lr.roundScore}`}</span>
                  )}
                  <span className="w-12 text-right font-display text-[20px] font-extrabold tabular">{totals[s.id]}</span>
                </div>
              );
            })}
            <div className="pt-1 text-[11px] text-dim">{game.templateId === "spades" ? "Spades scoring: made = 10 × bid + bags · set = −10 × bid" : game.templateId === "uno" ? "Hands won" : "Total"}</div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {game.sides.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-2xl bg-black/20 px-3 py-2.5">
                <PlayerAvatar night={night} playerId={s.playerIds[0]} size={26} />
                <span className="flex-1 truncate text-[14px] font-semibold">{s.name}</span>
                {game.events.filter((e) => e.playerId === s.playerIds[0]).map((e, i) => (
                  <span key={i} title={e.type}>{t?.events.find((x) => x.key === e.type)?.emoji}</span>
                ))}
                <span className="text-[12px] text-muted tabular">{game.totals[s.playerIds[0]]?.properties ?? 0} props</span>
              </div>
            ))}
          </div>
        )}

        {isHost && !ended && (
          <div className="mt-4 space-y-2 border-t border-white/5 pt-4">
            {t?.rounds ? (
              <div className="flex gap-2">
                {r?.status === "open" && (
                  <Button variant="soft" className="flex-1" onClick={lockPicks}>
                    <Lock size={15} /> Lock picks
                  </Button>
                )}
                <Button className="flex-1" onClick={() => setEntry(true)}>
                  Enter {t.roundLabel.toLowerCase()} {r?.n} results
                </Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {t?.events.map((ev) => (
                    <button key={ev.key} onClick={() => setEventSheet(ev.key)} className="rounded-2xl bg-surface px-2 py-2.5 text-[12px] font-semibold active:scale-95">
                      <div className="text-lg">{ev.emoji}</div>
                      {ev.label}
                    </button>
                  ))}
                </div>
                <Button variant="soft" className="w-full" onClick={() => setTotalsSheet(true)}>Update properties owned</Button>
              </>
            )}
            <button onClick={() => setEnding(true)} className="w-full py-1 text-[13px] font-semibold text-muted">End {game.name}</button>
          </div>
        )}
      </section>

      <div className="mb-2 flex items-center justify-between">
        <Label>Active props · {active.length}</Label>
        {!ended && <button onClick={goProps} className="mb-2 text-[13px] font-semibold text-lav">+ Add props</button>}
      </div>
      <div className="mb-5 space-y-2">
        {active.map((c) => <PropRow key={c.id} c={c} night={night} isHost={isHost} />)}
        {!active.length && <div className="rounded-2xl bg-card p-4 text-center text-[13px] text-muted hairline">No props on this {t?.roundLabel.toLowerCase() ?? "game"} yet.</div>}
      </div>

      {settled.length > 0 && (
        <>
          <Label>Settled · {settled.length}</Label>
          <div className="space-y-2">
            {settled.slice(0, 12).map((c) => <PropRow key={c.id} c={c} night={night} isHost={isHost} />)}
          </div>
        </>
      )}

      {t && r && <RoundEntrySheet id={id} open={entry} onClose={() => setEntry(false)} />}
      {eventSheet && (
        <PickPlayerSheet
          title={t?.events.find((e) => e.key === eventSheet)?.label ?? ""}
          night={night}
          playerIds={game.sides.flatMap((s) => s.playerIds)}
          onClose={() => setEventSheet(null)}
          onPick={(pid) => {
            settleNow(save((n) => n.games.find((x) => x.id === game.id)!.events.push({ type: eventSheet, playerId: pid, at: Date.now() })));
            setEventSheet(null);
          }}
        />
      )}
      {totalsSheet && <TotalsSheet id={id} onClose={() => setTotalsSheet(false)} />}
      {ending && <EndGameSheet id={id} onClose={() => setEnding(false)} />}
    </div>
  );
}

function PastGames({ night }: { night: Night }) {
  return (
    <div className="mb-4">
      <Label>Played tonight</Label>
      <div className="space-y-1.5">
        {night.games.filter((g) => g.status === "done").map((g) => (
          <div key={g.id} className="flex items-center gap-3 rounded-2xl bg-card px-3 py-2.5 hairline">
            <span className="text-xl">{g.emoji}</span>
            <span className="flex-1 text-[14px] font-semibold">{g.name}</span>
            <span className="text-[12px] text-muted">🏅 {g.sides.find((s) => s.id === g.winnerSideId)?.name ?? "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GamePicker({ night, onPick }: { night: Night; onPick: (id: string) => void }) {
  const list: GameTemplate[] = [...BUILT_IN, ...(night.customTemplates ?? []).map((c) => templateFor(night, c.id)!)];
  return (
    <div className="mb-5 grid grid-cols-2 gap-2">
      {list.map((t) => (
        <button key={t.id} onClick={() => onPick(t.id)} className="rounded-[22px] bg-card p-4 text-left hairline active:scale-[0.98]">
          <div className="mb-2 text-3xl">{t.emoji}</div>
          <div className="font-display text-[17px] font-bold">{t.name}</div>
          <div className="mt-0.5 text-[12px] leading-snug text-muted">{t.blurb}</div>
        </button>
      ))}
      <button onClick={() => onPick("__custom")} className="rounded-[22px] border border-dashed border-white/15 p-4 text-left active:scale-[0.98]">
        <div className="mb-2 text-3xl">✨</div>
        <div className="font-display text-[17px] font-bold">New game</div>
        <div className="mt-0.5 text-[12px] leading-snug text-muted">Make a template: name + what you count each round.</div>
      </button>
    </div>
  );
}

function StartGameSheet({ id, templateId: pick, onClose }: { id: string; templateId: string; onClose: () => void }) {
  const { actions } = useStore();
  const { night, save } = useNight(id);
  const [custom, setCustom] = useState({ name: "", emoji: "🎯", metric: "points", teams: false });
  const [players, setPlayers] = useState<string[] | null>(null);
  const [sidesSeed, setSidesSeed] = useState(0);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  if (!night) return null;
  const isCustom = pick === "__custom";
  const t = isCustom ? undefined : templateFor(night, pick);
  const pids = players ?? night.players.map((p) => p.id);
  const ordered = sidesSeed ? [...pids].sort((a, b) => ((a.charCodeAt(1) * 7 + sidesSeed) % 11) - ((b.charCodeAt(1) * 7 + sidesSeed) % 11)) : pids;
  const sides = t ? (sidesSeed && t.sides === "pairs" ? defaultSides({ ...night, teams: [] }, t.id, ordered) : defaultSides(night, t.id, pids)) : [];

  const start = () => {
    let templateId = t?.id;
    let n2: Night | undefined;
    if (isCustom) {
      if (!custom.name.trim()) return;
      templateId = `custom_${uid("t")}`;
      n2 = save((n) => {
        n.customTemplates = [...(n.customTemplates ?? []), { id: templateId!, name: custom.name.trim(), emoji: custom.emoji, metric: custom.metric.trim() || "points", teams: custom.teams }];
      });
    }
    const base = n2 ?? night;
    const tmpl = templateFor(base, templateId!)!;
    const gSides = isCustom ? defaultSides(base, templateId!, pids) : sides;
    const g: NightGame = {
      id: uid("g"), templateId: templateId!, name: tmpl.name, emoji: tmpl.emoji, status: "live", startedAt: Date.now(), sides: gSides,
      rounds: tmpl.rounds ? [{ n: 1, status: "open", values: {}, picks: {}, flags: {} }] : [], events: [], totals: {},
    };
    const n3 = structuredClone(base);
    n3.games.push(g);
    n3.currentGameId = g.id;
    actions.saveNight(n3);
    const specs = tmpl.props.filter((p) => chosen[p.key] ?? true).flatMap((p) => p.build(g, n3, 1));
    actions.createProps(night.id, g.id, specs);
    onClose();
  };

  return (
    <BottomSheet open onClose={onClose} title={isCustom ? "New game template" : `${t?.emoji} ${t?.name}`}>
      {isCustom ? (
        <>
          <div className="mb-3 flex gap-2">
            <input value={custom.emoji} onChange={(e) => setCustom({ ...custom, emoji: e.target.value.slice(0, 2) })} className="h-12 w-14 rounded-2xl bg-surface text-center text-2xl outline-none" />
            <input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="Game name (e.g. Dominoes)" className="h-12 min-w-0 flex-1 rounded-2xl bg-surface px-4 text-[15px] outline-none placeholder:text-dim" />
          </div>
          <Label>What do you count each round?</Label>
          <input value={custom.metric} onChange={(e) => setCustom({ ...custom, metric: e.target.value })} placeholder="points" className="mb-3 h-12 w-full rounded-2xl bg-surface px-4 text-[15px] outline-none" />
          <button onClick={() => setCustom({ ...custom, teams: !custom.teams })} className="mb-5 flex items-center gap-2 text-[14px] text-muted">
            <span className={cx("grid h-5 w-5 place-items-center rounded-md", custom.teams ? "bg-brand" : "border border-white/20")}>{custom.teams && <Check size={13} strokeWidth={3} />}</span>
            Played in partnerships (teams of 2)
          </button>
          <p className="mb-4 text-[12px] text-dim">Comes with “Who wins the round?”, “Who wins the game?” and over/unders on {custom.metric || "points"}.</p>
        </>
      ) : (
        <>
          <Label>Who’s playing</Label>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {night.players.map((p) => {
              const on = pids.includes(p.id);
              return (
                <button key={p.id} onClick={() => setPlayers(on ? pids.filter((x) => x !== p.id) : [...pids, p.id])} className={cx("flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-[13px]", on ? "bg-brand/20 text-white" : "bg-surface text-dim")}>
                  <PlayerAvatar night={night} playerId={p.id} size={22} /> {p.name}
                </button>
              );
            })}
          </div>
          {t?.sides === "pairs" && (
            <>
              <div className="mb-2 flex items-center justify-between">
                <Label>Partners</Label>
                <button onClick={() => setSidesSeed(sidesSeed + 1)} className="mb-2 flex items-center gap-1 text-[12px] font-semibold text-lav"><Shuffle size={13} /> Shuffle</button>
              </div>
              <div className="mb-4 space-y-1.5">
                {sides.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-2xl bg-surface px-3 py-2 text-[14px]">
                    <div className="flex -space-x-2">{s.playerIds.map((pid) => <PlayerAvatar key={pid} night={night} playerId={pid} size={24} />)}</div>
                    {s.name}
                  </div>
                ))}
              </div>
            </>
          )}
          <Label>Props to start with</Label>
          <div className="mb-5 space-y-1">
            {t?.props.map((p) => {
              const on = chosen[p.key] ?? true;
              return (
                <button key={p.key} onClick={() => setChosen({ ...chosen, [p.key]: !on })} className="flex w-full items-center gap-3 rounded-xl px-1 py-1.5 text-left">
                  <span className={cx("grid h-5 w-5 shrink-0 place-items-center rounded-md", on ? "bg-brand" : "border border-white/20")}>{on && <Check size={13} strokeWidth={3} />}</span>
                  <span className="flex-1 text-[14px]">{p.emoji} {p.label}</span>
                  <span className="text-[11px] text-dim">{p.scope === "round" ? `every ${t.roundLabel.toLowerCase()}` : "whole game"}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
      <Button size="lg" className="w-full" disabled={pids.length < 2 || (isCustom && !custom.name.trim()) || (t?.sides === "pairs" && sides.length < 2)} onClick={start}>
        Start {isCustom ? custom.name || "game" : t?.name}
      </Button>
    </BottomSheet>
  );
}

function Stepper({ value, onChange, max = 99 }: { value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-surface p-0.5">
      <button onClick={() => onChange(Math.max(0, value - 1))} className="grid h-8 w-8 place-items-center rounded-lg bg-raised active:scale-90" aria-label="Decrease"><Minus size={14} /></button>
      <span className="w-7 text-center font-display text-[16px] font-extrabold tabular">{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} className="grid h-8 w-8 place-items-center rounded-lg bg-raised active:scale-90" aria-label="Increase"><Plus size={14} /></button>
    </div>
  );
}

/** Host enters a round: numbers per player, picks, yes/no facts. "Final" settles props and opens the next round. */
function RoundEntrySheet({ id, open, onClose }: { id: string; open: boolean; onClose: () => void }) {
  const { db, actions } = useStore();
  const { night, props, game, save } = useNight(id);
  const r0 = game ? currentRound(game) : undefined;
  const [vals, setVals] = useState<GameRound["values"]>({});
  const [picks, setPicks] = useState<GameRound["picks"]>({});
  const [flags, setFlags] = useState<GameRound["flags"]>({});
  const [loadedFor, setLoadedFor] = useState("");
  if (!open || !night || !game || !r0) return null;
  const t = templateFor(night, game.templateId)!;
  const key = `${game.id}:${r0.n}`;
  if (loadedFor !== key) {
    setLoadedFor(key);
    setVals(structuredClone(r0.values));
    setPicks({ ...r0.picks });
    setFlags({ ...r0.flags });
  }
  const pids = game.sides.flatMap((s) => s.playerIds);
  const v = (pid: string, k: string) => vals[pid]?.[k] ?? 0;
  const setV = (pid: string, k: string, n: number) => setVals({ ...vals, [pid]: { ...(vals[pid] ?? {}), [k]: n } });
  const booksTotal = pids.reduce((a, p) => a + v(p, "books"), 0);

  const commit = (final: boolean) => {
    const n2 = save((n) => {
      const g = n.games.find((x) => x.id === game.id)!;
      const r = currentRound(g);
      r.values = vals;
      r.picks = picks;
      r.flags = flags;
      if (final) {
        r.status = "final";
        g.rounds.push({ n: r.n + 1, status: "open", values: {}, picks: {}, flags: {} });
      }
    })!;
    if (final) {
      actions.settleProps(settleable(n2, db.challenges));
      // re-offer every-round props for the next round
      const g2 = n2.games.find((x) => x.id === game.id)!;
      const next = r0.n + 1;
      const repeat = props.filter((c) => c.gameId === game.id && c.prop?.round === r0.n && c.prop?.repeat && c.prop.key);
      const keys = new Set(repeat.map((c) => c.prop!.key!));
      const specs: PropSpec[] = t.props.filter((p) => p.scope === "round").flatMap((p) => p.build(g2, n2, next)).filter((s) => keys.has(s.key));
      props
        .filter((c) => c.gameId === game.id && c.prop?.round === r0.n && c.prop?.resolver?.type === "ou")
        .forEach((c) => {
          const res = c.prop!.resolver as Extract<NonNullable<typeof c.prop>["resolver"], { type: "ou" }>;
          const m = t.ouMetrics.find((x) => x.key === res.metric);
          if (m) specs.push(overUnderSpec(n2, g2, res.subject, m, res.line, next));
        });
      if (specs.length) actions.createProps(night.id, game.id, specs);
    }
    onClose();
  };

  return (
    <BottomSheet open onClose={onClose} title={`${t.roundLabel} ${r0.n} results`}>
      {t.inputs.length > 0 && (
        <div className="mb-4 space-y-2">
          {game.sides.map((s) => (
            <div key={s.id} className="rounded-2xl bg-surface/60 p-3">
              {t.sides === "pairs" && <div className="mb-2 text-[13px] font-semibold text-lav">{s.name}</div>}
              {s.playerIds.map((pid) => (
                <div key={pid} className="flex items-center gap-2 py-1">
                  <PlayerAvatar night={night} playerId={pid} size={26} />
                  <span className="min-w-0 flex-1 truncate text-[14px]">{playerName(night, pid)}</span>
                  {t.inputs.map((inp) => (
                    <div key={inp.key} className="flex flex-col items-center">
                      <span className="mb-0.5 text-[10px] uppercase tracking-wider text-dim">{inp.label}</span>
                      <Stepper value={v(pid, inp.key)} max={inp.max} onChange={(n) => setV(pid, inp.key, n)} />
                    </div>
                  ))}
                </div>
              ))}
              {game.templateId === "spades" && (
                <div className="mt-1 text-right text-[11px] text-muted">
                  Team bid {s.playerIds.reduce((a, p) => a + v(p, "bid"), 0)} · books {s.playerIds.reduce((a, p) => a + v(p, "books"), 0)}
                </div>
              )}
            </div>
          ))}
          {game.templateId === "spades" && booksTotal !== 13 && <p className="text-[12px] text-gold">Books add up to {booksTotal}. A full hand is 13.</p>}
        </div>
      )}
      {t.picks.map((pk) => (
        <div key={pk.key} className="mb-4">
          <Label>{pk.label}</Label>
          <div className="flex flex-wrap gap-1.5">
            {pids.map((pid) => (
              <button key={pid} onClick={() => setPicks({ ...picks, [pk.key]: pid })} className={cx("rounded-full px-3 py-1.5 text-[13px] font-medium", picks[pk.key] === pid ? "bg-white text-ink" : "bg-surface text-muted")}>
                {playerName(night, pid)}
              </button>
            ))}
            {pk.allowNone && (
              <button onClick={() => setPicks({ ...picks, [pk.key]: "none" })} className={cx("rounded-full px-3 py-1.5 text-[13px] font-medium", picks[pk.key] === "none" ? "bg-white text-ink" : "bg-surface text-muted")}>Nobody</button>
            )}
          </div>
        </div>
      ))}
      {t.flags.map((f) => (
        <button key={f.key} onClick={() => setFlags({ ...flags, [f.key]: flags[f.key] ? 0 : 1 })} className="mb-4 flex w-full items-center gap-3 rounded-2xl bg-surface/60 p-3 text-left text-[14px]">
          <span className={cx("grid h-6 w-6 place-items-center rounded-md", flags[f.key] ? "bg-brand" : "border border-white/20")}>{flags[f.key] ? <Check size={14} strokeWidth={3} /> : null}</span>
          {f.label}
        </button>
      ))}
      <div className="flex gap-2">
        <Button variant="soft" className="flex-1" onClick={() => commit(false)}>Save live</Button>
        <Button className="flex-[1.4]" disabled={t.picks.some((p) => !p.allowNone && !picks[p.key])} onClick={() => commit(true)}>Final · settle props</Button>
      </div>
      <p className="mt-2 text-center text-[11px] text-dim">“Save live” updates what’s winning. “Final” settles this {t.roundLabel.toLowerCase()}’s props and opens the next one.</p>
    </BottomSheet>
  );
}

function PickPlayerSheet({ title, night, playerIds, onPick, onClose }: { title: string; night: Night; playerIds: string[]; onPick: (pid: string) => void; onClose: () => void }) {
  return (
    <BottomSheet open onClose={onClose} title={title}>
      <div className="mb-2 space-y-1">
        {playerIds.map((pid) => (
          <button key={pid} onClick={() => onPick(pid)} className="flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-surface">
            <PlayerAvatar night={night} playerId={pid} size={36} />
            <span className="text-[15px] font-medium">{playerName(night, pid)}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

function TotalsSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { db, actions } = useStore();
  const { night, game, save } = useNight(id);
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries((game?.sides.flatMap((s) => s.playerIds) ?? []).map((p) => [p, game?.totals[p]?.properties ?? 0])));
  if (!night || !game) return null;
  return (
    <BottomSheet open onClose={onClose} title="Properties owned">
      {Object.keys(vals).map((pid) => (
        <div key={pid} className="flex items-center gap-3 py-1.5">
          <PlayerAvatar night={night} playerId={pid} size={30} />
          <span className="flex-1 text-[15px]">{playerName(night, pid)}</span>
          <Stepper value={vals[pid]} max={28} onChange={(n) => setVals({ ...vals, [pid]: n })} />
        </div>
      ))}
      <Button
        size="lg"
        className="mt-4 w-full"
        onClick={() => {
          const n2 = save((n) => {
            const g = n.games.find((x) => x.id === game.id)!;
            Object.entries(vals).forEach(([pid, v]) => (g.totals[pid] = { ...(g.totals[pid] ?? {}), properties: v }));
          });
          if (n2) actions.settleProps(settleable(n2, db.challenges));
          onClose();
        }}
      >
        Save
      </Button>
    </BottomSheet>
  );
}

function EndGameSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { db, actions } = useStore();
  const { night, props, game, save } = useNight(id);
  const totals = game ? sideTotals(game) : {};
  const lead = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const [winner, setWinner] = useState<string | undefined>(lead[0] && (!lead[1] || lead[0][1] > lead[1][1]) && lead[0][1] > 0 ? lead[0][0] : undefined);
  if (!night || !game) return null;
  const finish = () => {
    // drop the empty next round and its auto-created props (stakes are refunded)
    const lastFinal = Math.max(0, ...game.rounds.filter((r) => r.status === "final").map((r) => r.n));
    props.filter((c) => c.gameId === game.id && c.status !== "settled" && c.prop?.round != null && c.prop.round > lastFinal).forEach((c) => actions.removeProp(c.id));
    const n2 = save((n) => {
      const g = n.games.find((x) => x.id === game.id)!;
      g.status = "done";
      g.endedAt = Date.now();
      g.winnerSideId = winner;
      g.rounds = g.rounds.filter((r) => r.status === "final" || r.n <= lastFinal);
      n.currentGameId = undefined;
    });
    if (n2) actions.settleProps(settleable(n2, db.challenges));
    onClose();
  };
  return (
    <BottomSheet open onClose={onClose} title={`End ${game.name}`}>
      <Label>Who won?</Label>
      <div className="mb-5 space-y-1.5">
        {game.sides.map((s) => (
          <button key={s.id} onClick={() => setWinner(s.id)} className={cx("flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left", winner === s.id ? "bg-brand/20 glow-soft" : "bg-surface")}>
            <div className="flex -space-x-2">{s.playerIds.map((pid) => <PlayerAvatar key={pid} night={night} playerId={pid} size={26} />)}</div>
            <span className="flex-1 text-[14px] font-semibold">{s.name}</span>
            {totals[s.id] != null && game.rounds.length > 0 && <span className="font-display font-extrabold tabular">{totals[s.id]}</span>}
            {winner === s.id && <Trophy size={16} className="text-gold" />}
          </button>
        ))}
      </div>
      <Button size="lg" className="w-full" disabled={!winner} onClick={finish}>Final · settle the game</Button>
      <p className="mt-2 text-center text-[11px] text-dim">Settles whole-game props (winner, most properties, first hotel…) and refunds props for {game.rounds.length ? "the unplayed next round" : "anything undecided"}.</p>
    </BottomSheet>
  );
}

// ------------------------------------------------------------- prop row ----

function PropRow({ c, night, isHost }: { c: Challenge; night: Night; isHost: boolean }) {
  const { db, actions } = useStore();
  const nav = useNav();
  const now = useNow(15_000);
  const [settling, setSettling] = useState(false);
  const [editing, setEditing] = useState(false);
  const live = c.status !== "settled" ? resolveProp(c, night, true) : null;
  const mine = c.entries.find((e) => e.userId === db.meId);
  const settled = c.status === "settled";
  const open = !settled && !c.prop?.pending && c.closesAt > now && night.status === "live";
  const creator = db.users[c.creatorId];
  return (
    <div className={cx("rounded-[20px] bg-card p-3.5 hairline", c.prop?.pending && "border border-dashed border-gold/40")}>
      <button onClick={() => nav.push({ kind: "room", id: c.id })} className="mb-2 flex w-full items-start gap-2 text-left">
        <span className="mt-0.5 text-[15px]">{c.prop?.kind === "wild" ? "🃏" : "🎲"}</span>
        <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug">{c.question}</span>
        {c.prop?.pending && <span className="shrink-0 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-bold uppercase text-gold">Needs approval</span>}
        {!settled && !c.prop?.pending && c.closesAt <= now && <Lock size={13} className="mt-1 shrink-0 text-dim" />}
      </button>
      <div className="space-y-1">
        {c.options.map((o: Option) => {
          const backers = c.entries.filter((e) => e.optionId === o.id);
          const pts = backers.reduce((a, e) => a + e.points, 0);
          const won = settled && c.result?.optionId === o.id;
          const winning = !settled && live?.optionId === o.id;
          const isMine = mine?.optionId === o.id;
          return (
            <button
              key={o.id}
              disabled={!open}
              onClick={() => nav.openSheet({ kind: "join", challengeId: c.id, optionId: o.id })}
              className={cx("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition", isMine ? "bg-brand/20" : "bg-surface", settled && !won && "opacity-45")}
            >
              <span className="flex-1 font-semibold">{o.label}{isMine && <span className="ml-1.5 text-[11px] font-medium text-lav">· you</span>}</span>
              {winning && <span className="rounded-full bg-win/15 px-1.5 py-0.5 text-[9px] font-black uppercase text-win">Winning now</span>}
              {won && <span className="rounded-full bg-win px-1.5 py-0.5 text-[9px] font-black uppercase text-ink">Won</span>}
              <AvatarStack users={backers.map((e) => db.users[e.userId])} size={18} max={4} />
              {pts > 0 && <span className="w-12 text-right text-[11px] text-muted tabular">{pts} pts</span>}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-dim">
        <span className="flex-1 truncate">
          {c.prop?.resolver ? "Auto-settles from the scoreboard" : "Host settles"} · {c.prop?.kind === "wild" ? `${WILD_STAKE} pts flat` : "even pool"} · by {creator?.name.split(" ")[0] ?? "someone"}
        </span>
        {isHost && c.prop?.pending && (
          <>
            <button onClick={() => actions.approveProp(c.id)} className="rounded-lg bg-win/15 px-2 py-1 font-semibold text-win">Approve</button>
            <button onClick={() => setEditing(true)} className="rounded-lg bg-surface px-2 py-1 font-semibold text-white">Edit</button>
          </>
        )}
        {isHost && !settled && !c.prop?.pending && (
          <button onClick={() => setSettling(true)} className="rounded-lg bg-surface px-2 py-1 font-semibold text-white">Settle</button>
        )}
        {isHost && settled && <button onClick={() => setSettling(true)} className="rounded-lg bg-surface px-2 py-1 font-semibold text-white">Fix result</button>}
        {isHost && !settled && (
          <button onClick={() => actions.removeProp(c.id)} className="grid h-6 w-6 place-items-center rounded-lg bg-surface text-muted" aria-label="Remove prop"><Trash2 size={12} /></button>
        )}
        {!isHost && settled && mine && (
          <button onClick={() => { actions.disputeProp(c.id, ""); nav.toast("Host notified"); }} className="rounded-lg bg-surface px-2 py-1 font-semibold text-white">Dispute</button>
        )}
      </div>
      {settling && (
        <BottomSheet open onClose={() => setSettling(false)} title={settled ? "Fix the result" : "Settle this prop"}>
          <p className="mb-3 text-[14px] text-muted">{c.question}</p>
          <div className="mb-3 space-y-1.5">
            {[...c.options, { id: "__tie", label: "Tie / push (refund)" }].map((o) => (
              <button
                key={o.id}
                onClick={() => {
                  if (settled) actions.resettleProp(c.id, o.id);
                  else actions.settleProps([{ cid: c.id, optionId: o.id }]);
                  setSettling(false);
                }}
                className={cx("w-full rounded-2xl px-4 py-3 text-left text-[15px] font-semibold", c.result?.optionId === o.id ? "bg-brand/20" : "bg-surface")}
              >
                {o.label}
              </button>
            ))}
          </div>
          {settled && <p className="text-center text-[11px] text-dim">Re-settling reverses the old payouts first.</p>}
        </BottomSheet>
      )}
      {editing && <EditPropSheet c={c} onClose={() => setEditing(false)} />}
    </div>
  );
}

function EditPropSheet({ c, onClose }: { c: Challenge; onClose: () => void }) {
  const { actions } = useStore();
  const [q, setQ] = useState(c.question);
  const [line, setLine] = useState(c.line ?? 0);
  return (
    <BottomSheet open onClose={onClose} title="Edit prop">
      <textarea value={q} onChange={(e) => setQ(e.target.value)} rows={2} className="mb-3 w-full resize-none rounded-2xl bg-surface p-3 text-[15px] outline-none" />
      {c.format === "over_under" && !c.entries.length && (
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[14px] text-muted">Line</span>
          <div className="flex items-center gap-1 rounded-xl bg-surface p-0.5">
            <button onClick={() => setLine(Math.max(0.5, line - 1))} className="grid h-8 w-8 place-items-center rounded-lg bg-raised"><Minus size={14} /></button>
            <span className="w-12 text-center font-display font-extrabold tabular">{line}</span>
            <button onClick={() => setLine(line + 1)} className="grid h-8 w-8 place-items-center rounded-lg bg-raised"><Plus size={14} /></button>
          </div>
        </div>
      )}
      <Button size="lg" className="w-full" onClick={() => { actions.editProp(c.id, q, undefined, c.format === "over_under" && line !== c.line ? line : undefined); actions.approveProp(c.id); onClose(); }}>
        Save & approve
      </Button>
    </BottomSheet>
  );
}

// ---------------------------------------------------------------- Props ----

function PropsTab({ id }: { id: string }) {
  const { actions } = useStore();
  const nav = useNav();
  const { night, props, isHost, game } = useNight(id);
  const [ouPlayer, setOuPlayer] = useState("");
  const [ouLine, setOuLine] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [customOpts, setCustomOpts] = useState("YES, NO");
  if (!night) return null;
  const ended = night.status === "ended";
  const t = game ? templateFor(night, game.templateId) : undefined;
  const r = game ? currentRound(game) : undefined;
  const pending = props.filter((c) => c.prop?.pending);
  const add = (specs: PropSpec[], gameId = game?.id) => {
    actions.createProps(night.id, gameId, specs);
    nav.toast(isHost ? `Added ${specs.length} prop${specs.length === 1 ? "" : "s"}` : "Sent to the host for approval");
  };
  const metric = t?.ouMetrics[0];
  const players = game ? game.sides.flatMap((s) => s.playerIds) : [];
  const line = ouLine ?? metric?.defaultLine ?? 3.5;
  const hasTeamProp = props.some((c) => c.prop?.resolver?.type === "night_team");

  return (
    <div className="pb-6">
      {!isHost && <p className="mb-3 rounded-2xl bg-surface/60 p-3 text-[13px] text-muted">Props you add go to the host for approval before anyone can pick.</p>}

      {!ended && game && t && (
        <>
          <Label>{game.emoji} {game.name} props{t.rounds && r ? ` · ${t.roundLabel.toLowerCase()} ${r.n}` : ""}</Label>
          <div className="mb-5 flex flex-wrap gap-1.5">
            {t.props.map((p) => (
              <button key={p.key} onClick={() => add(p.build(game, night, r?.n ?? 1))} className="rounded-full bg-card px-3 py-2 text-[13px] font-medium hairline active:scale-95">
                {p.emoji} {p.label}
              </button>
            ))}
          </div>

          {metric && players.length > 0 && (
            <div className="mb-5 rounded-[22px] bg-card p-4 hairline">
              <Label>Over / under on a player</Label>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {players.map((pid) => (
                  <button key={pid} onClick={() => setOuPlayer(pid)} className={cx("rounded-full px-3 py-1.5 text-[13px]", ouPlayer === pid ? "bg-white text-ink" : "bg-surface text-muted")}>{playerName(night, pid)}</button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-xl bg-surface p-0.5">
                  <button onClick={() => setOuLine(Math.max(0.5, line - 1))} className="grid h-9 w-9 place-items-center rounded-lg bg-raised"><Minus size={14} /></button>
                  <span className="w-12 text-center font-display text-[17px] font-extrabold tabular">{line}</span>
                  <button onClick={() => setOuLine(line + 1)} className="grid h-9 w-9 place-items-center rounded-lg bg-raised"><Plus size={14} /></button>
                </div>
                <span className="flex-1 text-[13px] text-muted">{metric.label}{metric.scope === "round" ? ` · ${t.roundLabel.toLowerCase()} ${r?.n ?? 1}` : ""}</span>
                <Button size="sm" disabled={!ouPlayer} onClick={() => add([overUnderSpec(night, game, ouPlayer, metric, line, r?.n ?? 1)])}>Add</Button>
              </div>
              <p className="mt-2 text-[11px] text-dim">Players can take the OVER on themselves, but not the UNDER.</p>
            </div>
          )}
        </>
      )}

      {!ended && night.teams.length >= 2 && !hasTeamProp && (
        <button onClick={() => add([nightTeamSpec(night)], undefined)} className="mb-5 flex w-full items-center gap-3 rounded-[20px] bg-card p-3.5 text-left hairline">
          <span className="text-2xl">🏆</span>
          <span className="flex-1">
            <span className="block text-[14px] font-semibold">Which team wins the night?</span>
            <span className="block text-[12px] text-muted">{night.teams.map((tm) => `${tm.emoji} ${tm.name}`).join(" vs ")} · settles when the night ends</span>
          </span>
          <Plus size={18} className="text-lav" />
        </button>
      )}

      {!ended && (
        <div className="mb-5 rounded-[22px] bg-card p-4 hairline">
          <Label>Custom prop</Label>
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Will Grandma win a hand?" className="mb-2 h-11 w-full rounded-xl bg-surface px-3 text-[15px] outline-none placeholder:text-dim" />
          <input value={customOpts} onChange={(e) => setCustomOpts(e.target.value)} placeholder="Options, comma separated" className="mb-3 h-11 w-full rounded-xl bg-surface px-3 text-[14px] outline-none placeholder:text-dim" />
          <Button
            size="sm"
            className="w-full"
            disabled={custom.trim().length < 5 || customOpts.split(",").filter((x) => x.trim()).length < 2}
            onClick={() => {
              const opts = customOpts.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8);
              const isYN = opts.length === 2 && opts.every((o) => ["yes", "no"].includes(o.toLowerCase()));
              add([{ key: "custom", question: custom.trim(), format: isYN ? "yes_no" : "pick_one", options: isYN ? [{ id: "yes", label: "YES" }, { id: "no", label: "NO" }] : opts.map((o, i) => ({ id: `c${i}`, label: o })), meta: { kind: "game", key: "custom", allowSelf: true } }]);
              setCustom("");
            }}
          >
            {isHost ? "Add prop" : "Send to host"}
          </Button>
        </div>
      )}

      {pending.length > 0 && (
        <>
          <Label>Waiting for approval · {pending.length}</Label>
          <div className="mb-5 space-y-2">{pending.map((c) => <PropRow key={c.id} c={c} night={night} isHost={isHost} />)}</div>
        </>
      )}

      <Label>All props tonight · {props.filter((c) => c.prop?.kind !== "wild").length}</Label>
      <div className="space-y-2">
        {props.filter((c) => c.prop?.kind !== "wild" && !c.prop?.pending).map((c) => <PropRow key={c.id} c={c} night={night} isHost={isHost} />)}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- Wild ----

function WildTab({ id }: { id: string }) {
  const { actions } = useStore();
  const nav = useNav();
  const { night, props, isHost } = useNight(id);
  const [aboutFor, setAboutFor] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  if (!night) return null;
  const wild = props.filter((c) => c.prop?.kind === "wild");
  const ended = night.status === "ended";
  const add = (specs: PropSpec[]) => {
    actions.createProps(night.id, undefined, specs);
    nav.toast(isHost ? "Wild prop added 🃏" : "Sent to the host for approval");
  };
  const tmpl = WILD.find((w) => w.key === aboutFor);
  return (
    <div className="pb-6">
      <div className="mb-4 rounded-[22px] bg-[linear-gradient(120deg,rgba(255,93,115,0.18),#151720_65%)] p-4 hairline">
        <div className="font-display text-[20px] font-extrabold">🃏 Wild Props</div>
        <p className="mt-1 text-[13px] text-muted">Side bets on what happens around the table. {WILD_STAKE} pts each. They win the Wild Card award, not the championship. Nobody can bet on a Wild Prop about themselves.</p>
      </div>
      {!ended && (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {WILD.map((w) => (
              <button key={w.key} onClick={() => (w.text.includes("{p}") ? setAboutFor(w.key) : add([wildSpec(night, w)]))} className="rounded-full bg-card px-3 py-2 text-[13px] hairline active:scale-95">
                {w.emoji} {w.text.replace("{p}", "___")}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (custom.trim().length >= 5) add([customWildSpec(custom.trim())]);
              setCustom("");
            }}
            className="mb-5 flex gap-2"
          >
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Will Uncle Ray fall asleep on the couch?" className="h-11 min-w-0 flex-1 rounded-2xl bg-card px-4 text-[14px] outline-none hairline placeholder:text-dim" />
            <Button type="submit" className="h-11" disabled={custom.trim().length < 5}><Sparkles size={15} /></Button>
          </form>
        </>
      )}
      <div className="space-y-2">
        {wild.map((c) => <PropRow key={c.id} c={c} night={night} isHost={isHost} />)}
        {!wild.length && <div className="rounded-2xl bg-card p-5 text-center text-[13px] text-muted hairline">No wild props yet. Somebody’s definitely complaining about the rules tonight.</div>}
      </div>
      {tmpl && (
        <PickPlayerSheet
          title={tmpl.text.replace("{p}", "…")}
          night={night}
          playerIds={night.players.map((p) => p.id)}
          onClose={() => setAboutFor(null)}
          onPick={(pid) => {
            add([wildSpec(night, tmpl, pid)]);
            setAboutFor(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Board ----

function BoardTab({ id }: { id: string }) {
  const { db, actions } = useStore();
  const { night, props, isHost } = useNight(id);
  const [confirmEnd, setConfirmEnd] = useState(false);
  if (!night) return null;
  const lines = predictorLines(db, night);
  const teams = teamLines(db, night);
  const list = awards(db, night);
  const ended = night.status === "ended";
  const openCount = props.filter((c) => c.status !== "settled" && !c.prop?.pending && c.prop?.resolver?.type !== "night_team").length;

  const endNight = () => {
    // team prop settles from the final standings
    const teamProps = props.filter((c) => c.status !== "settled" && c.prop?.resolver?.type === "night_team");
    const top = teams[0];
    const tie = !top || (teams[1] && teams[1].total === top.total);
    const optionId = tie ? "__tie" : top.teamId;
    if (teamProps.length) actions.settleProps(teamProps.map((c) => ({ cid: c.id, optionId })));
    // crown from the standings as they'll be once the team prop has paid out
    const ids = new Set(teamProps.map((c) => c.id));
    const after: typeof db = {
      ...db,
      challenges: db.challenges.map((c) =>
        ids.has(c.id)
          ? { ...c, status: "settled" as const, result: { optionId, submittedBy: db.meId, submittedAt: Date.now(), confirmations: [], disputes: [], settledAt: Date.now(), payouts: computePayouts(c, optionId === "__tie" ? null : optionId) } }
          : c,
      ),
    };
    const finalLines = predictorLines(after, night);
    const champ = finalLines[0];
    actions.endNight(night, { userId: champ?.userId ?? db.meId, name: champ?.name ?? "—", score: champ?.score ?? 0, awards: awards(after, night) });
    setConfirmEnd(false);
  };

  return (
    <div className="pb-6">
      <div className="mb-2 flex items-end justify-between">
        <div className="font-display text-[20px] font-extrabold">Champion race</div>
      </div>
      <p className="mb-3 text-[12px] text-dim">{SCORE_FORMULA}. Wild Props don’t count.</p>
      <div className="mb-5 overflow-hidden rounded-[22px] bg-card hairline">
        {lines.map((l, i) => (
          <div key={l.userId} className={cx("flex items-center gap-3 border-b border-white/[0.04] px-4 py-3 last:border-0", i === 0 && "bg-gold/[0.07]")}>
            <span className="w-5 font-display text-[16px] font-extrabold text-dim tabular">{i === 0 ? "👑" : i + 1}</span>
            <Avatar user={db.users[l.userId]} size={34} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold">{l.userId === db.meId ? "You" : l.name}</div>
              <div className="text-[11px] text-muted">{l.correct}/{l.picks} correct · 🔥{l.bestStreak} · {l.gameNet >= 0 ? "+" : ""}{l.gameNet} pts</div>
            </div>
            <span className="font-display text-[20px] font-extrabold tabular">{l.score}</span>
          </div>
        ))}
      </div>

      {teams.length > 0 && (
        <>
          <div className="mb-1 font-display text-[18px] font-extrabold">Teams</div>
          <p className="mb-3 text-[12px] text-dim">Members’ scores + {TEAM_GAME_WIN_BONUS} per game won.</p>
          <div className="mb-5 grid grid-cols-2 gap-2">
            {teams.map((t, i) => (
              <div key={t.teamId} className={cx("rounded-[20px] p-4 hairline", i === 0 && t.total > 0 ? "bg-[linear-gradient(135deg,rgba(130,71,255,0.35),#151720)]" : "bg-card")}>
                <div className="text-2xl">{t.emoji}</div>
                <div className="mt-1 text-[14px] font-semibold">{t.name}</div>
                <div className="font-display text-[26px] font-extrabold tabular">{t.total}</div>
                <div className="text-[11px] text-muted">{t.gameWins} game win{t.gameWins === 1 ? "" : "s"}</div>
                <div className="mt-2 flex -space-x-2">{night.players.filter((p) => p.teamId === t.teamId).map((p) => <PlayerAvatar key={p.id} night={night} playerId={p.id} size={22} />)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {list.length > 0 && (
        <>
          <div className="mb-3 font-display text-[18px] font-extrabold">Awards & records</div>
          <div className="mb-6 grid grid-cols-2 gap-2">
            {list.map((a) => (
              <div key={a.key} className="rounded-[20px] bg-card p-3 hairline">
                <div className="text-xl">{a.emoji}</div>
                <div className="mt-1 text-[11px] font-bold uppercase tracking-wider text-dim">{a.label}</div>
                <div className="truncate text-[15px] font-semibold">{a.who}</div>
                {a.detail && <div className="truncate text-[11px] text-muted">{a.detail}</div>}
              </div>
            ))}
          </div>
        </>
      )}

      {isHost && !ended && (
        confirmEnd ? (
          <div className="rounded-[22px] bg-card p-4 hairline">
            <p className="mb-3 text-[14px] text-muted">End the night and crown {lines[0]?.name ?? "the champion"}?{openCount ? ` ${openCount} unsettled prop${openCount === 1 ? "" : "s"} will stay open.` : ""}</p>
            <div className="flex gap-2">
              <Button variant="soft" className="flex-1" onClick={() => setConfirmEnd(false)}>Not yet</Button>
              <Button className="flex-1" onClick={endNight}><Crown size={16} /> Crown champion</Button>
            </div>
          </div>
        ) : (
          <Button size="lg" className="w-full" onClick={() => setConfirmEnd(true)}><Crown size={17} /> End night & crown champion</Button>
        )
      )}
    </div>
  );
}

// ----------------------------------------------------------------- Crew ----

function CrewTab({ id }: { id: string }) {
  const { db, actions } = useStore();
  const { night, isHost, save } = useNight(id);
  const [guest, setGuest] = useState("");
  const [inviting, setInviting] = useState(false);
  if (!night) return null;
  const ended = night.status === "ended";
  const friends = Object.values(db.users).filter((u) => db.following.includes(u.id) && !night.memberIds.includes(u.id) && u.followers < 3000);
  const cycleTeam = (pid: string) =>
    save((n) => {
      const p = n.players.find((x) => x.id === pid)!;
      const i = n.teams.findIndex((t) => t.id === p.teamId);
      p.teamId = n.teams.length ? n.teams[(i + 1) % n.teams.length].id : undefined;
    });
  return (
    <div className="pb-6">
      {(night.teams.length ? night.teams : [{ id: "", name: "Players", emoji: "🎲" }]).map((t) => (
        <div key={t.id} className="mb-4">
          <Label>{t.emoji} {t.name}</Label>
          <div className="space-y-1">
            {night.players.filter((p) => (t.id ? p.teamId === t.id : true)).map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-card px-3 py-2.5 hairline">
                <PlayerAvatar night={night} playerId={p.id} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{p.name}{p.userId === night.hostId && <span className="ml-1.5 text-[11px] font-medium text-gold">host</span>}</span>
                  <span className="block text-[11px] text-muted">{p.userId ? `@${db.users[p.userId]?.username ?? "member"}` : "Guest · in props and scores"}</span>
                </span>
                {isHost && !ended && night.teams.length > 1 && (
                  <button onClick={() => cycleTeam(p.id)} className="rounded-lg bg-surface px-2 py-1 text-[11px] font-semibold text-muted">Switch team</button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      {isHost && !ended && (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!guest.trim()) return;
              save((n) => n.players.push({ id: uid("p"), name: guest.trim(), ...(n.teams[0] ? { teamId: n.teams[n.players.length % n.teams.length].id } : {}) }));
              setGuest("");
            }}
            className="mb-2 flex gap-2"
          >
            <input value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Add a guest (no app needed)" className="h-11 min-w-0 flex-1 rounded-2xl bg-card px-4 text-[14px] outline-none hairline placeholder:text-dim" />
            <Button type="submit" variant="soft" className="h-11"><UserPlus size={16} /></Button>
          </form>
          <Button variant="soft" className="w-full" onClick={() => setInviting(true)}>Invite someone with Tyche</Button>
        </>
      )}
      {inviting && (
        <BottomSheet open onClose={() => setInviting(false)} title="Invite to the night">
          {friends.map((u) => (
            <button
              key={u.id}
              onClick={() => {
                actions.inviteToNight(night.id, [u.id]);
                save((n) => n.players.push({ id: uid("p"), name: u.name.split(" ")[0], userId: u.id, ...(n.teams[0] ? { teamId: n.teams[n.players.length % n.teams.length].id } : {}) }));
                setInviting(false);
              }}
              className="flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-surface"
            >
              <Avatar user={u} size={38} />
              <span className="flex-1 text-[15px]">{u.name}</span>
              <Plus size={16} className="text-lav" />
            </button>
          ))}
          {!friends.length && <p className="pb-4 text-[14px] text-muted">Everyone you follow is already here.</p>}
        </BottomSheet>
      )}
    </div>
  );
}
