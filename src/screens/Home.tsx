"use client";

import { useMemo, useState } from "react";
import { Bell, Radio, Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";
import { useNav } from "@/lib/nav";
import { PILL_CATEGORIES, canSee, heat, myNotifications } from "@/lib/utils";
import { Avatar, Empty, Logo, Pill, Segmented } from "@/components/ui";
import { ChallengeCard } from "@/components/challenge/ChallengeCard";
import { DailyClaimCard } from "@/screens/Plus";

const PILLS = Object.keys(PILL_CATEGORIES);
type Feed = "foryou" | "friends" | "live";

export function HomeScreen() {
  const { db, me } = useStore();
  const nav = useNav();
  const [pill, setPill] = useState<string | null>(null);
  const [feed, setFeed] = useState<Feed>("foryou");
  const unread = myNotifications(db).filter((n) => !n.read).length;

  const list = useMemo(() => {
    const circle = new Set([...db.following, db.meId]);
    const friendIds = new Set(db.groups.filter((g) => g.memberIds.includes(db.meId)).flatMap((g) => g.memberIds));
    const isFriend = (id: string) => friendIds.has(id) || (circle.has(id) && db.users[id]?.followers < 3000);
    let l = db.challenges.filter((c) => c.status !== "settled" && canSee(db, c));
    if (feed === "friends") l = l.filter((c) => isFriend(c.creatorId));
    if (feed === "live") l = l.filter((c) => c.status === "live" || c.status === "review" || c.status === "vote");
    if (pill === "Friends") l = l.filter((c) => isFriend(c.creatorId));
    const cats = pill ? PILL_CATEGORIES[pill] : null;
    if (cats) l = l.filter((c) => cats.includes(c.category));
    if (pill === "Trending") return [...l].sort((a, b) => heat(b, db) - heat(a, db));
    // For You: live first, then freshness blended with heat
    return [...l].sort((a, b) => {
      const s = (c: typeof a) => c.createdAt + heat(c, db) * 60_000;
      return s(b) - s(a);
    });
  }, [db, feed, pill]);

  return (
    <div>
      <header className="sticky top-0 z-30 bg-ink/80 px-4 pb-3 pt-[max(env(safe-area-inset-top),14px)] backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <Logo size={26} />
          <div className="flex items-center gap-2">
            <button onClick={() => nav.push({ kind: "notifications" })} className="relative grid h-10 w-10 place-items-center rounded-full bg-card hairline active:scale-90" aria-label="Notifications">
              <Bell size={19} />
              {unread > 0 && <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[9px] font-bold ring-2 ring-ink">{unread}</span>}
            </button>
            <button onClick={() => nav.setTab("profile")} aria-label="Profile">
              <Avatar user={me} size={38} />
            </button>
          </div>
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 no-scrollbar">
          {PILLS.map((p) => (
            <Pill key={p} active={pill === p} onClick={() => setPill(pill === p ? null : p)}>
              {p === "Trending" ? "🔥 " : ""}
              {p}
            </Pill>
          ))}
        </div>
      </header>

      <div className="px-4">
        <button onClick={() => nav.push({ kind: "create" })} className="group mb-4 mt-1 flex w-full items-center gap-3 rounded-[22px] bg-[linear-gradient(120deg,rgba(130,71,255,0.22),rgba(130,71,255,0.04)_60%)] p-3 pr-4 text-left hairline transition active:scale-[0.99]">
          <Avatar user={me} size={40} />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold">Somebody disagree with you?</div>
            <div className="truncate text-[13px] text-muted">Put it on Tyche in 15 seconds</div>
          </div>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-brand text-white glow transition group-hover:rotate-12">
            <Sparkles size={17} />
          </span>
        </button>

        <DailyClaimCard />

        <Segmented
          value={feed}
          onChange={setFeed}
          className="mb-4"
          options={[
            { id: "foryou", label: "For You" },
            { id: "friends", label: "Friends" },
            {
              id: "live",
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-loss animate-pulse-ring" /> Live
                </span>
              ),
            },
          ]}
        />

        <div className="space-y-3">
          {list.map((c, i) => (
            <ChallengeCard key={c.id} c={c} index={i} />
          ))}
          {!list.length && (
            <Empty
              icon={<Radio size={24} />}
              title={feed === "live" ? "Nothing live right now" : "No challenges here yet"}
              body="Start one and send it to the group chat."
              action={
                <button onClick={() => nav.push({ kind: "create" })} className="rounded-2xl bg-brand px-5 py-3 text-sm font-semibold glow">
                  Create a challenge
                </button>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
