"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useNav } from "@/lib/nav";
import { cx, userRecord } from "@/lib/utils";
import { Avatar, Segmented, TopBar } from "@/components/ui";

export function LeaderboardScreen() {
  const { db } = useStore();
  const nav = useNav();
  const [scope, setScope] = useState<"friends" | "global">("friends");
  const circle = new Set([db.meId, ...db.groups.flatMap((g) => g.memberIds)]);
  const rows = Object.values(db.users)
    .filter((u) => (scope === "friends" ? circle.has(u.id) : !u.id.startsWith("c") || u.baseWins > 0))
    .map((u) => ({ u, r: userRecord(db, u.id) }))
    .sort((a, b) => b.r.wins - a.r.wins || b.r.pct - a.r.pct);
  const podium = rows.slice(0, 3);
  const order = [1, 0, 2];

  return (
    <div className="pb-10">
      <TopBar onBack={nav.pop} title="Leaderboard" sub="Ranked by wins" />
      <div className="px-4">
        <Segmented value={scope} onChange={setScope} className="mb-6" options={[{ id: "friends", label: "Friends" }, { id: "global", label: "Everyone" }]} />
        <div className="mb-6 grid grid-cols-3 items-end gap-2">
          {order.map((i) => {
            const row = podium[i];
            if (!row) return <div key={i} />;
            return (
              <button key={row.u.id} onClick={() => nav.push({ kind: "user", id: row.u.id })} className="flex flex-col items-center">
                <Avatar user={row.u} size={i === 0 ? 72 : 56} ring={i === 0} />
                <div className="mt-2 w-full truncate text-center text-[13px] font-semibold">{row.u.name.split(" ")[0]}</div>
                <div className="text-[11px] text-muted tabular">{row.r.wins}W · {row.r.pct}%</div>
                <div
                  className={cx(
                    "mt-2 grid w-full place-items-center rounded-t-2xl font-display text-2xl font-extrabold",
                    i === 0 ? "h-24 bg-[linear-gradient(180deg,#8247ff,#3b1d8f)] glow" : i === 1 ? "h-16 bg-surface" : "h-12 bg-card hairline",
                  )}
                >
                  {i + 1}
                </div>
              </button>
            );
          })}
        </div>
        <div className="overflow-hidden rounded-[22px] bg-card hairline">
          {rows.slice(3).map(({ u, r }, i) => (
            <button key={u.id} onClick={() => nav.push({ kind: "user", id: u.id })} className={cx("flex w-full items-center gap-3 border-b border-white/[0.04] px-4 py-3 text-left last:border-0", u.id === db.meId && "bg-brand/10")}>
              <span className="w-6 font-display font-extrabold text-dim tabular">{i + 4}</span>
              <Avatar user={u} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">{u.id === db.meId ? "You" : u.name}</div>
                <div className="text-[12px] text-muted">@{u.username}</div>
              </div>
              <div className="text-right text-[13px] tabular">
                <div className="font-semibold">{r.wins}–{r.losses}</div>
                <div className="text-[11px] text-muted">{r.pct}%</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
