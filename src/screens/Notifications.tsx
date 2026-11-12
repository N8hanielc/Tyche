"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useStore } from "@/lib/store";
import { useNav } from "@/lib/nav";
import type { NotificationKind } from "@/lib/types";
import { ago, cx, myNotifications } from "@/lib/utils";
import { Avatar, Empty, TopBar } from "@/components/ui";

const ICON: Record<NotificationKind, string> = {
  joined: "🟣", invite: "📨", reply: "💬", created: "✨", closing: "⏳", started: "▶️", confirmed: "✅", won: "🏆", lost: "💀", follow: "👋",
};

export function NotificationsScreen() {
  const { db, actions } = useStore();
  const nav = useNav();
  // remember what was unread when the screen opened so dots stay visible
  const mine = myNotifications(db);
  const [unread] = useState(() => new Set(mine.filter((n) => !n.read).map((n) => n.id)));
  useEffect(() => {
    const t = setTimeout(actions.readNotifications, 600);
    return () => clearTimeout(t);
  }, [actions]);

  const DAY = 24 * 3_600_000;
  const today = mine.filter((n) => Date.now() - n.at < DAY);
  const earlier = mine.filter((n) => Date.now() - n.at >= DAY);

  const Group = ({ title, list }: { title: string; list: typeof today }) =>
    list.length ? (
      <div className="mb-4">
        <div className="mb-1 px-4 text-[12px] font-bold uppercase tracking-[0.12em] text-dim">{title}</div>
        {list.map((n) => {
          const actor = n.actorId ? db.users[n.actorId] : undefined;
          const isNew = unread.has(n.id) || !n.read;
          return (
            <button
              key={n.id}
              onClick={() => (n.challengeId ? nav.push({ kind: "room", id: n.challengeId }) : n.actorId && nav.push({ kind: "user", id: n.actorId }))}
              className={cx("flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-card", isNew && "bg-brand/[0.06]")}
            >
              <div className="relative">
                {actor ? <Avatar user={actor} size={44} /> : <div className="grid h-11 w-11 place-items-center rounded-full bg-surface text-xl">{ICON[n.kind]}</div>}
                {actor && <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-ink text-[11px]">{ICON[n.kind]}</span>}
              </div>
              <div className="min-w-0 flex-1 text-[14px] leading-snug">
                {actor && <span className="font-semibold">{actor.name} </span>}
                <span className="text-white/80">{n.text}</span>
                <div className="mt-0.5 text-[12px] text-dim">{ago(n.at)}</div>
              </div>
              {isNew && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand shadow-[0_0_8px_#8247ff]" />}
            </button>
          );
        })}
      </div>
    ) : null;

  return (
    <div className="pb-10">
      <TopBar onBack={nav.pop} title="Notifications" sub={unread.size ? `${unread.size} new` : "You’re all caught up"} />
      <Group title="Today" list={today} />
      <Group title="Earlier" list={earlier} />
      {!mine.length && <Empty icon={<Bell size={22} />} title="No notifications yet" />}
    </div>
  );
}
