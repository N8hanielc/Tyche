"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Flame, Search, Trophy, Users, X } from "lucide-react";
import { useStore, useNow } from "@/lib/store";
import { useNav } from "@/lib/nav";
import type { Challenge } from "@/lib/types";
import { CATEGORIES, CATEGORY_EMOJI, canSee, clock, heat, totalPool, userRecord, isCrowd } from "@/lib/utils";
import { Avatar, CategoryTag, Empty, Pill } from "@/components/ui";
import { ChallengeCard } from "@/components/challenge/ChallengeCard";

function MiniCard({ c, live }: { c: Challenge; live?: boolean }) {
  const { db } = useStore();
  const nav = useNav();
  const now = useNow(1000);
  const creator = db.users[c.creatorId];
  return (
    <button onClick={() => nav.push({ kind: "room", id: c.id })} className="relative flex w-[232px] shrink-0 flex-col overflow-hidden rounded-[22px] bg-card p-4 text-left hairline transition active:scale-[0.98]">
      {live && <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-loss/20 blur-2xl" />}
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-[13px]">{CATEGORY_EMOJI[c.category]}</span>
        <CategoryTag>{c.category}</CategoryTag>
        {live && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-loss px-1.5 py-0.5 text-[9px] font-black uppercase">
            <span className="h-1 w-1 animate-pulse rounded-full bg-white" /> Live
          </span>
        )}
      </div>
      <div className="mb-3 line-clamp-3 font-display text-[16px] font-bold leading-snug">{c.question}</div>
      <div className="mt-auto flex items-center gap-2 text-[12px] text-muted">
        <Avatar user={creator} size={20} />
        <span className="truncate">@{creator?.username}</span>
        <span className="ml-auto shrink-0 font-semibold text-white tabular">{live && c.live?.startedAt ? clock(now - c.live.startedAt) : `${c.entries.length} in`}</span>
      </div>
    </button>
  );
}

function Section({ title, icon, children, action }: { title: string; icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mb-7">
      <div className="mb-3 flex items-center gap-2 px-4">
        {icon}
        <h2 className="font-display text-[19px] font-bold tracking-tight">{title}</h2>
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </section>
  );
}

export function DiscoverScreen() {
  const { db, actions } = useStore();
  const nav = useNav();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);

  const visible = db.challenges.filter((c) => canSee(db, c));
  const active = visible.filter((c) => c.status !== "settled" && (!cat || c.category === cat));
  const live = active.filter((c) => c.status === "live");
  const trending = [...active].sort((a, b) => heat(b, db) - heat(a, db));
  const popular = [...active].sort((a, b) => b.entries.length - a.entries.length).slice(0, 5);
  const following = active.filter((c) => db.following.includes(c.creatorId) && c.visibility === "public");
  const publicFeed = trending.filter((c) => c.visibility === "public" || c.creatorId === db.meId).slice(0, 4);

  const leaders = useMemo(
    () =>
      Object.values(db.users)
        .filter((u) => !isCrowd(u.id))
        .map((u) => ({ u, r: userRecord(db, u.id) }))
        .sort((a, b) => b.r.wins - a.r.wins)
        .slice(0, 5),
    [db],
  );
  const suggested = Object.values(db.users).filter((u) => !isCrowd(u.id) && u.id !== db.meId && !db.following.includes(u.id));

  const term = q.trim().toLowerCase().replace(/^@/, "");
  const results = term
    ? visible.filter((c) => {
        const u = db.users[c.creatorId];
        return [c.question, c.title, c.category, c.description, u?.username, u?.name].some((s) => s?.toLowerCase().includes(term));
      })
    : [];
  const people = term ? Object.values(db.users).filter((u) => u.username.toLowerCase().includes(term) || u.name.toLowerCase().includes(term)).slice(0, 6) : [];

  return (
    <div>
      <header className="sticky top-0 z-30 bg-ink/80 px-4 pb-3 pt-[max(env(safe-area-inset-top),14px)] backdrop-blur-xl">
        <h1 className="mb-3 font-display text-[30px] font-extrabold tracking-[-0.03em]">Discover</h1>
        <label className="flex h-12 items-center gap-2.5 rounded-2xl bg-card px-4 hairline focus-within:shadow-[0_0_0_1.5px_#8247ff]">
          <Search size={18} className="text-dim" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, challenges, categories" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-dim" />
          {q && (
            <button onClick={() => setQ("")} className="text-dim" aria-label="Clear">
              <X size={16} />
            </button>
          )}
        </label>
        {!term && (
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 no-scrollbar">
            <Pill active={!cat} onClick={() => setCat(null)}>All</Pill>
            {CATEGORIES.map((c) => (
              <Pill key={c} active={cat === c} onClick={() => setCat(cat === c ? null : c)}>
                {CATEGORY_EMOJI[c]} {c}
              </Pill>
            ))}
          </div>
        )}
      </header>

      {term ? (
        <div className="px-4 pt-2">
          {people.length > 0 && (
            <div className="mb-5">
              <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-dim">People</div>
              <div className="space-y-1">
                {people.map((u) => (
                  <button key={u.id} onClick={() => nav.push({ kind: "user", id: u.id })} className="flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-card">
                    <Avatar user={u} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{u.name}</div>
                      <div className="text-[13px] text-muted">@{u.username}</div>
                    </div>
                    <ChevronRight size={18} className="text-dim" />
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-dim">Challenges · {results.length}</div>
          <div className="space-y-3">
            {results.map((c, i) => (
              <ChallengeCard key={c.id} c={c} index={i} />
            ))}
          </div>
          {!results.length && !people.length && <Empty icon={<Search size={22} />} title={`Nothing for “${q}”`} body="Try a username, category or keyword." />}
        </div>
      ) : (
        <div className="pt-2">
          {live.length > 0 && (
            <Section title="Live now" icon={<span className="h-2 w-2 rounded-full bg-loss animate-pulse-ring" />}>
              <div className="flex gap-3 overflow-x-auto px-4 no-scrollbar">
                {live.map((c) => (
                  <MiniCard key={c.id} c={c} live />
                ))}
              </div>
            </Section>
          )}

          <Section title="Trending" icon={<Flame size={19} className="text-[#ff8a4c]" />}>
            <div className="flex gap-3 overflow-x-auto px-4 no-scrollbar">
              {trending.slice(0, 6).map((c) => (
                <MiniCard key={c.id} c={c} />
              ))}
            </div>
          </Section>

          <Section title="Most participants" icon={<Users size={18} className="text-lav" />}>
            <div className="mx-4 overflow-hidden rounded-[22px] bg-card hairline">
              {popular.map((c, i) => (
                <button key={c.id} onClick={() => nav.push({ kind: "room", id: c.id })} className="flex w-full items-center gap-3 border-b border-white/[0.04] px-4 py-3 text-left last:border-0 hover:bg-white/[0.02]">
                  <span className="w-5 font-display text-lg font-extrabold text-dim tabular">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold">{c.question}</div>
                    <div className="text-[12px] text-muted">
                      {CATEGORY_EMOJI[c.category]} {c.category} · {totalPool(c)} pts
                    </div>
                  </div>
                  <span className="rounded-full bg-surface px-2 py-1 text-[12px] font-semibold tabular">{c.entries.length}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section
            title="Leaderboard"
            icon={<Trophy size={18} className="text-gold" />}
            action={
              <button onClick={() => nav.push({ kind: "leaderboard" })} className="text-[13px] font-semibold text-lav">
                See all
              </button>
            }
          >
            <div className="mx-4 flex gap-2 overflow-x-auto no-scrollbar">
              {leaders.map(({ u, r }, i) => (
                <button key={u.id} onClick={() => nav.push({ kind: "user", id: u.id })} className="flex w-[96px] shrink-0 flex-col items-center rounded-[20px] bg-card px-2 py-3 hairline">
                  <div className="relative mb-2">
                    <Avatar user={u} size={52} ring={i === 0} />
                    <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-surface text-[10px] font-black ring-2 ring-card">{i + 1}</span>
                  </div>
                  <div className="w-full truncate text-center text-[12px] font-semibold">{u.name.split(" ")[0]}</div>
                  <div className="text-[11px] text-muted tabular">{r.wins}W · {r.pct}%</div>
                </button>
              ))}
            </div>
          </Section>

          {following.length > 0 && (
            <Section title="From people you follow">
              <div className="space-y-3 px-4">
                {following.slice(0, 2).map((c, i) => (
                  <ChallengeCard key={c.id} c={c} index={i} />
                ))}
              </div>
            </Section>
          )}

          {suggested.length > 0 && (
            <Section title="Creators to follow">
              <div className="flex gap-3 overflow-x-auto px-4 no-scrollbar">
                {suggested.map((u) => (
                  <div key={u.id} className="flex w-[150px] shrink-0 flex-col items-center rounded-[22px] bg-card p-4 text-center hairline">
                    <button onClick={() => nav.push({ kind: "user", id: u.id })}>
                      <Avatar user={u} size={56} />
                    </button>
                    <div className="mt-2 w-full truncate text-[14px] font-semibold">{u.name}</div>
                    <div className="mb-3 w-full truncate text-[12px] text-muted">{u.followers.toLocaleString()} followers</div>
                    <button onClick={() => actions.follow(u.id)} className="h-8 w-full rounded-xl bg-white text-[13px] font-semibold text-ink active:scale-95">
                      Follow
                    </button>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="Popular right now">
            <div className="space-y-3 px-4">
              {publicFeed.map((c, i) => (
                <ChallengeCard key={c.id} c={c} index={i} />
              ))}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
