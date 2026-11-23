"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useStore } from "@/lib/store";
import { useNav } from "@/lib/nav";
import { cx } from "@/lib/utils";
import type { User } from "@/lib/types";
import { Avatar, Segmented, TopBar, Verified } from "@/components/ui";

type Tab = "followers" | "following";

/** Your followers and the people you follow. */
export function FollowsScreen({ tab: initial }: { tab: Tab }) {
  const { db, actions } = useStore();
  const nav = useNav();
  const [tab, setTab] = useState<Tab>(initial);
  const [q, setQ] = useState("");
  const me = db.users[db.meId];

  const followers = (db.followerIds ?? []).map((id) => db.users[id]).filter(Boolean) as User[];
  const following = db.following.map((id) => db.users[id]).filter(Boolean) as User[];
  const list = tab === "followers" ? followers : following;
  const term = q.trim().toLowerCase().replace(/^@/, "");
  const shown = term ? list.filter((u) => u.name.toLowerCase().includes(term) || u.username.includes(term)) : list;

  return (
    <div className="pb-10">
      <TopBar onBack={nav.pop} title={`@${me.username}`} />
      <div className="sticky top-[60px] z-20 space-y-2 glass-bar px-4 pb-2">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { id: "followers", label: `${followers.length.toLocaleString()} ${followers.length === 1 ? "Follower" : "Followers"}` },
            { id: "following", label: `${following.length.toLocaleString()} Following` },
          ]}
        />
        {list.length > 6 && (
          <div className="flex h-11 items-center gap-2 rounded-2xl bg-card px-3 hairline">
            <Search size={16} className="text-dim" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" autoCapitalize="none" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-dim" />
          </div>
        )}
      </div>

      <div className="px-4 pt-2">
        {list.length === 0 && (
          <div className="mt-10 text-center">
            <div className="mb-2 text-[34px]">{tab === "followers" ? "👀" : "🔎"}</div>
            <div className="font-display text-[18px] font-bold">{tab === "followers" ? "No followers yet" : "You’re not following anyone yet"}</div>
            <p className="mx-auto mt-1 max-w-[260px] text-[14px] text-muted">
              {tab === "followers" ? "Share your profile or send a challenge to the group chat to get people on Tyche." : "Follow friends to see their challenges in your feed."}
            </p>
            {tab === "following" && (
              <button onClick={() => nav.setTab("discover")} className="mt-4 rounded-xl bg-brand px-4 py-2.5 text-[14px] font-semibold text-white">
                Find people
              </button>
            )}
          </div>
        )}
        {list.length > 0 && shown.length === 0 && <p className="mt-8 text-center text-[14px] text-muted">No one matches “{q}”.</p>}
        <div className="space-y-1">
          {shown.map((u) => {
            const iFollow = db.following.includes(u.id);
            const followsMe = (db.followerIds ?? []).includes(u.id);
            return (
              <div key={u.id} className="flex items-center gap-3 rounded-2xl px-1 py-2">
                <button onClick={() => nav.push({ kind: "user", id: u.id })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar user={u} size={46} />
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1 text-[15px] font-semibold"><span className="truncate">{u.name}</span><Verified user={u} /></div>
                    <div className="truncate text-[13px] text-muted">
                      @{u.username}
                      {tab === "following" && followsMe && <span className="ml-1.5 rounded-md bg-surface px-1.5 py-0.5 text-[11px] text-white/70">Follows you</span>}
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => actions.follow(u.id)}
                  className={cx("h-9 min-w-[112px] shrink-0 whitespace-nowrap rounded-xl px-3 text-[13px] font-semibold transition active:scale-95", iFollow ? "bg-surface text-white" : "bg-white text-ink")}
                >
                  {iFollow ? "Following" : followsMe ? "Follow back" : "Follow"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
