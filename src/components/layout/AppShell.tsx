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
    if (!involved) return;
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
        className={cx("relative flex flex-1 flex-col items-center gap-1 pt-2 text-[10px] font-semibold transition-colors", active ? "text-white" : "text-dim hover:text-muted")}
      >
        <span className={cx("transition-transform duration-200", active && "scale-110")}>{icon}</span>
        {label}
        {active && <span className="absolute -top-px h-[2px] w-6 rounded-full bg-brand shadow-[0_0_12px_#8247ff]" />}
        {!!badge && <span className="absolute left-1/2 top-1 ml-1.5 min-w-4 rounded-full bg-brand px-1 text-[9px] font-bold leading-4 text-white">{badge > 99 ? "99+" : badge}</span>}
      </button>
    );
  };
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[440px] border-t border-white/[0.06] bg-ink/85 pb-[max(env(safe-area-inset-bottom),8px)] backdrop-blur-xl">
      <div className="flex items-end">
        {item("home", "Home", <House size={23} strokeWidth={nav.tab === "home" ? 2.4 : 2} />)}
        {item("discover", "Discover", <Compass size={23} strokeWidth={nav.tab === "discover" ? 2.4 : 2} />)}
        <div className="flex flex-1 justify-center">
          <button
            onClick={() => nav.push({ kind: "create" })}
            className="-mt-5 grid h-[58px] w-[58px] place-items-center rounded-full bg-gradient-to-b from-[#9461ff] to-brand text-white shadow-[0_10px_30px_-6px_rgba(130,71,255,0.8),inset_0_1px_0_rgba(255,255,255,0.3)] ring-4 ring-ink transition active:scale-90"
            aria-label="Create challenge"
          >
            <Plus size={28} strokeWidth={2.6} />
          </button>
        </div>
        {item("rooms", "Rooms", <MessagesSquare size={23} strokeWidth={nav.tab === "rooms" ? 2.4 : 2} />, rooms)}
        {item(
          "profile",
          "Profile",
          nav.tab === "profile" ? <Avatar user={me} size={24} ring /> : <UserIcon size={23} />,
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
