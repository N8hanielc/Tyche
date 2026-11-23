"use client";

import { Compass, House, MessagesSquare, Plus, User as UserIcon } from "lucide-react";
import { useNav, type Tab } from "@/lib/nav";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/utils";
import { Avatar } from "@/components/ui";
import type { DB } from "@/lib/types";

export function unreadRooms(db: DB) {
  let n = 0;
  db.challenges.forEach((c) => {
    const involved = c.creatorId === db.meId || c.entries.some((e) => e.userId === db.meId);
    if (!involved || c.nightId) return; // night props live in the Game Night screen
    const last = db.lastRead[c.id] ?? 0;
    n += db.messages.filter((m) => m.challengeId === c.id && m.at > last && m.userId !== db.meId).length;
  });
  return n;
}

export function BottomNav() {
  const nav = useNav();
  const { db, me } = useStore();
  const rooms = unreadRooms(db);
  const item = (t: Tab, label: string, icon: React.ReactNode, badge?: number) => {
    const active = nav.tab === t;
    return (
      <button
        onClick={() => nav.setTab(t)}
        aria-current={active ? "page" : undefined}
        className={cx(
          "relative flex h-[54px] flex-1 flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-semibold transition-[background-color,color,transform] duration-200 ease-out active:scale-95",
          active ? "bg-white/[0.14] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]" : "text-white/70 hover:text-white",
        )}
      >
        <span>{icon}</span>
        {label}
        {!!badge && <span className="absolute left-1/2 top-1 ml-1.5 min-w-4 rounded-full bg-brand px-1 text-[9px] font-bold leading-4 text-white">{badge > 99 ? "99+" : badge}</span>}
      </button>
    );
  };
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[440px] px-3 pb-[max(env(safe-area-inset-bottom),12px)]">
      <div className="glass pointer-events-auto flex h-[66px] items-center rounded-full px-1.5">
        {item("home", "Feed", <House size={22} strokeWidth={nav.tab === "home" ? 2.4 : 2} />)}
        {item("discover", "Discover", <Compass size={22} strokeWidth={nav.tab === "discover" ? 2.4 : 2} />)}
        <div className="flex flex-1 justify-center">
          <button
            onClick={() => nav.push({ kind: "create" })}
            className="grid h-[50px] w-[50px] place-items-center rounded-full bg-brand text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_8px_20px_-6px_rgba(0,0,0,0.6)] transition active:scale-90"
            aria-label="Create challenge"
          >
            <Plus size={26} strokeWidth={2.6} />
          </button>
        </div>
        {item("rooms", "Rooms", <MessagesSquare size={22} strokeWidth={nav.tab === "rooms" ? 2.4 : 2} />, rooms)}
        {item(
          "profile",
          "You",
          nav.tab === "profile" ? <Avatar user={me} size={22} ring /> : <UserIcon size={22} />,
        )}
      </div>
    </nav>
  );
}

export function Toast() {
  const { toastMsg } = useNav();
  if (!toastMsg) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),14px)] z-[80] flex justify-center px-4">
      <div key={toastMsg.id} className="animate-rise rounded-full bg-white px-4 py-2.5 text-[13px] font-semibold text-ink shadow-2xl">
        {toastMsg.msg}
      </div>
    </div>
  );
}
