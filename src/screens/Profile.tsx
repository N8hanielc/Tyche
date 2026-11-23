"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Coins, FileText, Lock, LogOut, RotateCcw, Settings, Share, Shield, Swords, Trash2, Trophy } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { REMOTE } from "@/lib/supabase";
import { DAILY, headToHead, isPlus } from "@/lib/plus";
import { PlusBadge } from "@/screens/Plus";
import { useStore } from "@/lib/store";
import { useNav } from "@/lib/nav";
import type { Category } from "@/lib/types";
import { CATEGORY_EMOJI, ago, cx, userRecord } from "@/lib/utils";
import { Avatar, BottomSheet, Button, Segmented, TopBar, Verified } from "@/components/ui";
import { RoomRow } from "./Rooms";
import { DeleteAccountSheet, EditProfileSheet } from "./EditProfile";

const BADGES: Record<string, { icon: string; name: string; desc: string }> = {
  early: { icon: "🌅", name: "Early Believer", desc: "Joined in the first week" },
  streak: { icon: "🔥", name: "Hot Streak", desc: "3 wins in a row" },
  host: { icon: "🎙️", name: "Room Host", desc: "Hosted 10+ Rooms" },
  road: { icon: "🚗", name: "Road Warrior", desc: "5 road trip challenges" },
  first: { icon: "🏆", name: "First Blood", desc: "Won a challenge" },
  oracle: { icon: "🔮", name: "Oracle", desc: "60%+ win rate" },
  crowd: { icon: "📣", name: "Crowd Puller", desc: "10+ people joined your challenge" },
};

type Tab = "activity" | "created" | "joined";

export function ProfileScreen({ userId }: { userId?: string }) {
  const { db, actions } = useStore();
  const nav = useNav();
  const id = userId ?? db.meId;
  const u = db.users[id];
  const isMe = id === db.meId;
  const [tab, setTab] = useState<Tab>("activity");
  const [confirmReset, setConfirmReset] = useState(false);
  const [settings, setSettings] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const auth = useAuth();
  const rec = userRecord(db, id);
  const following = db.following.includes(id);
  const requested = (db.requested ?? []).includes(id);
  // a private account's stats and challenges are only for its followers
  const locked = !isMe && !!u?.private && !following;

  const created = db.challenges.filter((c) => c.creatorId === id);
  const joined = db.challenges.filter((c) => c.entries.some((e) => e.userId === id));
  const totalChallenges = new Set([...created, ...joined].map((c) => c.id)).size;

  const favorites = useMemo(() => {
    const m = new Map<Category, number>();
    joined.forEach((c) => m.set(c.category, (m.get(c.category) ?? 0) + 1));
    created.forEach((c) => m.set(c.category, (m.get(c.category) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [joined, created]);

  const badges = [...(u.badges ?? [])];
  if (rec.wins > 0 && !badges.includes("first")) badges.push("first");
  if (rec.pct >= 60) badges.push("oracle");
  if (created.some((c) => c.entries.length >= 10)) badges.push("crowd");

  const activity = useMemo(() => {
    type A = { at: number; icon: string; text: React.ReactNode; cid: string };
    const out: A[] = [];
    created.forEach((c) => out.push({ at: c.createdAt, icon: "✨", text: <>Created <b>{c.title ?? c.question}</b></>, cid: c.id }));
    joined.forEach((c) => {
      const e = c.entries.find((x) => x.userId === id)!;
      if (c.creatorId !== id) out.push({ at: e.at, icon: "🟣", text: <>Took <b>{c.options.find((o) => o.id === e.optionId)?.label}</b> on {c.question}</>, cid: c.id });
      if (c.status === "settled" && c.result?.settledAt) {
        const net = c.result.payouts?.[id] ?? 0;
        out.push({
          at: c.result.settledAt,
          icon: net > 0 ? "🏆" : net < 0 ? "💀" : "🤝",
          text: (
            <>
              {net > 0 ? "Won" : net < 0 ? "Lost" : "Pushed"} <b>{c.title ?? c.question}</b>{" "}
              <span className={net > 0 ? "text-win" : net < 0 ? "text-loss" : "text-muted"}>{net > 0 ? `+${net}` : net} pts</span>
            </>
          ),
          cid: c.id,
        });
      }
    });
    return out.sort((a, b) => b.at - a.at).slice(0, 25);
  }, [created, joined, id]);

  if (!u) return null;

  return (
    <div className="pb-10">
      {isMe && !userId ? (
        <header className="flex items-center justify-between px-4 pb-1 pt-[max(env(safe-area-inset-top),14px)]">
          <h1 className="font-display text-[30px] font-extrabold tracking-[-0.03em]">Profile</h1>
          <button onClick={() => setSettings(true)} className="grid h-10 w-10 place-items-center rounded-full bg-card text-muted hairline" aria-label="Settings">
            <Settings size={18} />
          </button>
        </header>
      ) : (
        <TopBar onBack={nav.pop} title={`@${u.username}`} />
      )}

      <BottomSheet open={settings} onClose={() => { setSettings(false); setConfirmReset(false); }} title="Settings">
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-surface/70 p-3">
          <Avatar user={u} size={44} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{u.name}</div>
            <div className="truncate text-[13px] text-muted">{auth.session?.email}</div>
          </div>
        </div>
        <button onClick={() => { setSettings(false); nav.push({ kind: "plus" }); }} className="mb-1 flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left text-[15px] hover:bg-surface">
          <span className="grid h-[18px] w-[18px] place-items-center text-gold">✦</span>
          <span className="flex-1">{isPlus(u) ? "Manage Tyche+" : "Upgrade to Tyche+"}</span>
          {isPlus(u) ? <PlusBadge /> : <ChevronRight size={17} className="text-dim" />}
        </button>
        <button
          onClick={() => {
            actions.setPrivate(!u.private);
            nav.toast(u.private ? "Your account is public" : "Your account is private");
          }}
          className="mb-1 flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left text-[15px] hover:bg-surface"
          role="switch"
          aria-checked={!!u.private}
        >
          <Lock size={18} className="text-muted" />
          <span className="flex-1">
            Private account
            <span className="block text-[12px] leading-snug text-dim">
              {u.private ? "You approve new followers. Your Public challenges only reach followers." : "Anyone can follow you and see your Public challenges."}
            </span>
          </span>
          <span className={cx("relative h-7 w-12 shrink-0 rounded-full transition", u.private ? "bg-brand" : "bg-white/15")}>
            <span className={cx("absolute top-1 h-5 w-5 rounded-full bg-white transition-all", u.private ? "left-6" : "left-1")} />
          </span>
        </button>
        {REMOTE ? null : confirmReset ? (
          <div className="mb-2 rounded-2xl bg-card p-3 text-[13px] hairline">
            <p className="mb-3 text-muted">Reset all challenges, chats and points to the original sample data? Accounts stay signed up.</p>
            <div className="flex gap-2">
              <Button size="sm" variant="soft" className="flex-1" onClick={() => setConfirmReset(false)}>Cancel</Button>
              <Button size="sm" variant="danger" className="flex-1" onClick={() => { actions.reset(); setSettings(false); setConfirmReset(false); nav.toast("Demo data reset"); }}>Reset</Button>
            </div>
          </div>
        ) : (
          <button onClick={() => setConfirmReset(true)} className="mb-2 flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left text-[15px] hover:bg-surface">
            <RotateCcw size={18} className="text-muted" /> Reset demo data
          </button>
        )}
        <a href="/privacy" target="_blank" rel="noreferrer" className="mb-1 flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left text-[15px] hover:bg-surface">
          <Shield size={18} className="text-muted" /> <span className="flex-1">Privacy Policy</span> <ChevronRight size={17} className="text-dim" />
        </a>
        <a href="/terms" target="_blank" rel="noreferrer" className="mb-1 flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left text-[15px] hover:bg-surface">
          <FileText size={18} className="text-muted" /> <span className="flex-1">Terms of Service</span> <ChevronRight size={17} className="text-dim" />
        </a>
        <button onClick={() => { setSettings(false); auth.signOut(); }} className="flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left text-[15px] font-semibold text-loss hover:bg-loss/10">
          <LogOut size={18} /> Sign out
        </button>
        <button onClick={() => { setSettings(false); setDeleting(true); }} className="mt-1 flex w-full items-center gap-3 rounded-2xl px-2 py-3 text-left text-[13px] text-dim hover:bg-loss/10 hover:text-loss">
          <Trash2 size={16} /> Delete account
        </button>
      </BottomSheet>
      {isMe && <DeleteAccountSheet open={deleting} onClose={() => setDeleting(false)} />}
      {isMe && <EditProfileSheet open={editing} onClose={() => setEditing(false)} />}

      <div className="px-4">
        <div className="relative mb-4 overflow-hidden rounded-[28px] bg-card p-5 hairline">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(80%_100%_at_30%_0%,rgba(130,71,255,0.45),transparent)]" />
          <div className="relative flex items-end gap-4">
            <div className={cx("rounded-full p-[3px]", isPlus(u) ? "bg-[conic-gradient(from_180deg,#ffc85c,#b69aff,#8247ff,#ffc85c)]" : "")}>
              <Avatar user={u} size={84} className="ring-4 ring-card" />
            </div>
            <div className="flex flex-1 justify-around pb-1 text-center">
              {(
                [
                  [(isMe && db.followerIds ? db.followerIds.length : u.followers) === 1 ? "Follower" : "Followers", isMe && db.followerIds ? db.followerIds.length : u.followers, "followers"],
                  ["Following", isMe ? db.following.length : u.following, "following"],
                  ["Challenges", totalChallenges + u.baseWins + u.baseLosses, null],
                ] as [string, number, "followers" | "following" | null][]
              ).map(([k, v, list]) => {
                const inner = (
                  <>
                    <div className="font-display text-[19px] font-extrabold tabular">{v.toLocaleString()}</div>
                    <div className="text-[11px] text-muted">{k}</div>
                  </>
                );
                return isMe && list ? (
                  <button key={k} onClick={() => nav.push({ kind: "follows", tab: list })} className="rounded-xl px-1 active:scale-95">
                    {inner}
                  </button>
                ) : (
                  <div key={k}>{inner}</div>
                );
              })}
            </div>
          </div>
          <div className="relative mt-4">
            <div className="flex items-center gap-2 font-display text-[22px] font-extrabold tracking-tight">
              {u.name} <Verified user={u} size={20} /> {u.private && <Lock size={15} className="text-muted" aria-label="Private account" />} {isPlus(u) && <PlusBadge size="md" />}
            </div>
            <div className="text-[14px] text-lav">@{u.username}</div>
            {u.bio && <p className="mt-2 text-[14px] leading-relaxed text-white/80">{u.bio}</p>}
            {isMe && (db.followRequests ?? []).length > 0 && (
              <button onClick={() => nav.push({ kind: "follows", tab: "requests" })} className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand/15 px-3 py-1.5 text-[13px] font-semibold text-lav ring-1 ring-brand/30">
                <Lock size={13} /> {(db.followRequests ?? []).length} follow request{(db.followRequests ?? []).length === 1 ? "" : "s"}
              </button>
            )}
          </div>
          <div className="relative mt-4 flex gap-2">
            {isMe ? (
              <>
                <Button variant="soft" className="flex-1" onClick={() => setEditing(true)}>
                  Edit profile
                </Button>
                <Button variant="soft" className="flex-1" onClick={() => nav.toast("Profile link copied")}>
                  <Share size={16} /> Share
                </Button>
              </>
            ) : (
              <>
                <Button variant={following || requested ? "soft" : "primary"} className="flex-1" onClick={() => actions.follow(id)}>
                  {following ? "Following" : requested ? "Requested" : (db.followerIds ?? []).includes(id) ? "Follow back" : "Follow"}
                </Button>
                <Button variant="soft" className="flex-1" onClick={() => nav.push({ kind: "create", prefill: { invited: [id], visibility: "friends" } })}>
                  Challenge {u.name.split(" ")[0]}
                </Button>
              </>
            )}
          </div>
        </div>

        {!isMe && <HeadToHead otherId={id} />}

        {locked ? (
          <div className="mt-2 flex flex-col items-center rounded-[24px] bg-card px-6 py-10 text-center hairline">
            <div className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-surface ring-1 ring-white/10">
              <Lock size={22} className="text-white/80" />
            </div>
            <div className="font-display text-[18px] font-bold">This account is private</div>
            <p className="mt-1 max-w-[260px] text-[14px] text-muted">
              {requested ? `You asked to follow ${u.name.split(" ")[0]}. You’ll see their challenges once they approve.` : `Follow ${u.name.split(" ")[0]} to see their record and challenges.`}
            </p>
          </div>
        ) : (
        <>
        <div className="mb-4 grid grid-cols-3 gap-2">
          <Stat label="Wins" value={rec.wins} tone="text-win" />
          <Stat label="Losses" value={rec.losses} tone="text-loss" />
          <Stat label="Win rate" value={`${rec.pct}%`} />
        </div>

        {isMe && (
          <div className="mb-4 flex items-center gap-3 rounded-[22px] bg-[linear-gradient(110deg,rgba(255,200,92,0.14),rgba(21,23,32,1)_65%)] p-4 hairline">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gold/15 text-gold">
              <Coins size={21} />
            </div>
            <div className="flex-1">
              <div className="text-[12px] text-muted">Points balance</div>
              <div className="font-display text-[22px] font-extrabold tabular">{u.points.toLocaleString()}</div>
              <div className="text-[11px] text-muted">{isPlus(u) ? `+${DAILY.plus} every day with Tyche+` : `+${DAILY.free} daily · `}{!isPlus(u) && <button onClick={() => nav.push({ kind: "plus", reason: "daily" })} className="font-semibold text-lav">get {DAILY.plus}/day</button>}</div>
            </div>
            <button onClick={() => nav.push({ kind: "leaderboard" })} className="flex items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-[13px] font-semibold">
              <Trophy size={15} className="text-gold" /> Ranks
            </button>
          </div>
        )}

        <div className="mb-5">
          <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-dim">Badges</div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar">
            {badges.map((b) => (
              <div key={b} className="w-[112px] shrink-0 rounded-[20px] bg-card p-3 hairline">
                <div className="mb-2 grid h-10 w-10 place-items-center rounded-2xl bg-surface text-xl">{BADGES[b].icon}</div>
                <div className="text-[13px] font-semibold leading-tight">{BADGES[b].name}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted">{BADGES[b].desc}</div>
              </div>
            ))}
          </div>
        </div>

        {favorites.length > 0 && (
          <div className="mb-5">
            <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-dim">Favorite categories</div>
            <div className="flex flex-wrap gap-2">
              {favorites.map(([cat, n]) => (
                <span key={cat} className="rounded-full bg-card px-3 py-1.5 text-[13px] hairline">
                  {CATEGORY_EMOJI[cat]} {cat} <span className="text-dim">· {n}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <Segmented
          value={tab}
          onChange={setTab}
          className="mb-3"
          options={[
            { id: "activity", label: "Activity" },
            { id: "created", label: `Created ${created.length}` },
            { id: "joined", label: `Joined ${joined.length}` },
          ]}
        />

        {tab === "activity" ? (
          <div className="space-y-1">
            {activity.map((a, i) => (
              <button key={i} onClick={() => nav.push({ kind: "room", id: a.cid })} className="flex w-full items-start gap-3 rounded-2xl p-2.5 text-left hover:bg-card">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-card text-base hairline">{a.icon}</span>
                <span className="flex-1 text-[14px] leading-snug text-white/85 [&_b]:font-semibold [&_b]:text-white">{a.text}</span>
                <span className="shrink-0 pt-0.5 text-[11px] text-dim">{ago(a.at)}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="-mx-2">
            {(tab === "created" ? created : joined).map((c) => {
              const net = c.status === "settled" ? c.result?.payouts?.[id] : undefined;
              return (
                <div key={c.id} className="relative">
                  <RoomRow c={c} />
                  {net != null && (
                    <span className={cx("pointer-events-none absolute bottom-3 right-3 rounded-full px-2 py-0.5 text-[11px] font-bold", net > 0 ? "bg-win/15 text-win" : net < 0 ? "bg-loss/15 text-loss" : "bg-white/10 text-muted")}>
                      {net > 0 ? `W +${net}` : net < 0 ? `L ${net}` : "Push"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-[20px] bg-card p-3.5 hairline">
      <div className={cx("font-display text-[24px] font-extrabold tabular", tone)}>{value}</div>
      <div className="text-[12px] text-muted">{label}</div>
    </div>
  );
}

function HeadToHead({ otherId }: { otherId: string }) {
  const { db, me } = useStore();
  const nav = useNav();
  const plus = isPlus(me);
  const r = headToHead(db, db.meId, otherId);
  const other = db.users[otherId];
  const total = r.wins + r.losses;
  return (
    <button
      onClick={() => !plus && nav.push({ kind: "plus", reason: "h2h" })}
      className="relative mb-4 flex w-full items-center gap-3 overflow-hidden rounded-[22px] bg-card p-4 text-left hairline"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface text-lav">
        <Swords size={20} />
      </span>
      <span className={cx("min-w-0 flex-1", !plus && "select-none blur-[5px]")}>
        <span className="block text-[12px] text-muted">You vs {other?.name.split(" ")[0]}</span>
        <span className="block font-display text-[22px] font-extrabold tabular">
          <span className="text-win">{r.wins}</span>
          <span className="text-dim"> – </span>
          <span className="text-loss">{r.losses}</span>
        </span>
        <span className="block text-[11px] text-dim">{total ? `${total} head-to-head challenge${total === 1 ? "" : "s"}` : "No head-to-heads yet"}</span>
      </span>
      {plus ? (
        <PlusBadge />
      ) : (
        <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12px] font-bold text-ink">
          <Lock size={12} /> Tyche+
        </span>
      )}
    </button>
  );
}
