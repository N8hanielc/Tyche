"use client";

import { useState } from "react";
import { Check, MessagesSquare, Plus, Users } from "lucide-react";
import { useStore, useNow } from "@/lib/store";
import { useNav } from "@/lib/nav";
import type { Challenge, DB } from "@/lib/types";
import { CATEGORY_EMOJI, ago, canSee, cx, statusLabel } from "@/lib/utils";
import { Avatar, AvatarStack, BottomSheet, Button, Empty, Segmented, StatusDot, TopBar } from "@/components/ui";
import { ChallengeCard } from "@/components/challenge/ChallengeCard";
import { LIMITS, isPlus, ownedGroups } from "@/lib/plus";
import { LimitSheet } from "@/screens/Plus";

type Tab = "active" | "friends" | "done" | "groups";

function lastMessage(db: DB, c: Challenge) {
  const ms = db.messages.filter((m) => m.challengeId === c.id);
  return ms[ms.length - 1];
}

export function RoomRow({ c }: { c: Challenge }) {
  const { db } = useStore();
  const nav = useNav();
  const now = useNow(30_000);
  const last = lastMessage(db, c);
  const unread = db.messages.filter((m) => m.challengeId === c.id && m.at > (db.lastRead[c.id] ?? 0) && m.userId !== db.meId).length;
  const who = last?.userId ? (last.userId === db.meId ? "You" : db.users[last.userId]?.name.split(" ")[0]) : null;
  const status = statusLabel(c, now);
  return (
    <button onClick={() => nav.push({ kind: "room", id: c.id })} className="flex w-full items-center gap-3 rounded-[20px] px-2 py-2.5 text-left transition hover:bg-card active:scale-[0.99]">
      <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-[18px] bg-gradient-to-br from-surface to-card text-2xl hairline">
        {CATEGORY_EMOJI[c.category]}
        {status === "Live" && <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full bg-loss ring-[3px] ring-ink animate-pulse-ring" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cx("truncate text-[15px]", unread ? "font-bold" : "font-semibold")}>{c.title ?? c.question}</span>
          <span className="ml-auto shrink-0 text-[11px] text-dim">{last ? ago(last.at, now) : ""}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className={cx("truncate text-[13px]", unread ? "text-white" : "text-muted")}>
            {last ? (last.kind === "system" ? `${last.icon ?? ""} ${last.text}` : `${who}: ${last.text || "📷 Photo"}`) : "No messages yet"}
          </span>
          {unread > 0 && <span className="ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-bold">{unread}</span>}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <AvatarStack users={c.entries.map((e) => db.users[e.userId])} size={18} max={5} />
          <StatusDot status={status} />
        </div>
      </div>
    </button>
  );
}

export function RoomsScreen() {
  const { db, me, actions } = useStore();
  const nav = useNav();
  const [tab, setTab] = useState<Tab>("active");
  const [creatingRaw, setCreating] = useState(false);
  const [limit, setLimit] = useState(false);
  const atLimit = !isPlus(me) && ownedGroups(db, db.meId) >= LIMITS.groups;
  const creating = creatingRaw && !atLimit;
  const startGroup = () => (atLimit ? setLimit(true) : setCreating(true));

  const involved = (c: Challenge) => c.creatorId === db.meId || c.entries.some((e) => e.userId === db.meId);
  const byActivity = (a: Challenge, b: Challenge) => (lastMessage(db, b)?.at ?? b.createdAt) - (lastMessage(db, a)?.at ?? a.createdAt);
  const active = db.challenges.filter((c) => involved(c) && c.status !== "settled").sort(byActivity);
  const friends = db.challenges.filter((c) => !involved(c) && c.status !== "settled" && c.visibility !== "public" && canSee(db, c)).sort(byActivity);
  const done = db.challenges.filter((c) => c.status === "settled" && involved(c)).sort(byActivity);
  const list = tab === "active" ? active : tab === "friends" ? friends : done;

  return (
    <div>
      <header className="sticky top-0 z-30 bg-ink/80 px-4 pb-3 pt-[max(env(safe-area-inset-top),14px)] backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="font-display text-[30px] font-extrabold tracking-[-0.03em]">Rooms</h1>
          <button onClick={startGroup} className="flex h-9 items-center gap-1.5 rounded-full bg-card px-3.5 text-[13px] font-semibold hairline active:scale-95">
            <Plus size={15} /> New group
          </button>
        </div>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { id: "active", label: `Active${active.length ? ` ${active.length}` : ""}` },
            { id: "friends", label: "Friends’" },
            { id: "done", label: "Completed" },
            { id: "groups", label: "Groups" },
          ]}
        />
      </header>

      <div className="px-2">
        {tab === "groups" ? (
          <div className="space-y-2 px-2 pt-1">
            {db.groups.filter((g) => g.memberIds.includes(db.meId)).map((g) => {
              const count = db.challenges.filter((c) => c.groupId === g.id).length;
              const liveCount = db.challenges.filter((c) => c.groupId === g.id && c.status === "live").length;
              return (
                <button key={g.id} onClick={() => nav.push({ kind: "group", id: g.id })} className="flex w-full items-center gap-3 rounded-[22px] bg-card p-3.5 text-left hairline active:scale-[0.99]">
                  <div className="grid h-14 w-14 place-items-center rounded-[18px] bg-[linear-gradient(135deg,#8247ff,#3b1d8f)] text-2xl">{g.emoji}</div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{g.name}</div>
                    <div className="mb-1.5 text-[12px] text-muted">
                      {g.memberIds.length} members · {count} challenges{liveCount ? ` · ${liveCount} live` : ""}
                    </div>
                    <AvatarStack users={g.memberIds.map((id) => db.users[id])} size={20} max={6} />
                  </div>
                </button>
              );
            })}
            <button onClick={startGroup} className="flex w-full items-center justify-center gap-2 rounded-[22px] border border-dashed border-white/10 p-5 text-[14px] font-semibold text-muted hover:text-white">
              <Plus size={16} /> Create a private group
            </button>
          </div>
        ) : (
          <div className="pt-1">
            {list.map((c) => (
              <RoomRow key={c.id} c={c} />
            ))}
            {!list.length && <Empty icon={<MessagesSquare size={22} />} title="No rooms here" body={tab === "done" ? "Settled challenges land here with their recap." : "Join a challenge to unlock its Room."} />}
          </div>
        )}
      </div>

      <LimitSheet
        open={limit}
        onClose={() => setLimit(false)}
        reason="groups"
        title={`${LIMITS.groups} private groups max`}
        body={`Free accounts can run ${LIMITS.groups} private groups. Tyche+ makes them unlimited — every crew gets its own home.`}
      />
      <CreateGroupSheet
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={(name, emoji, members) => {
          const id = actions.createGroup(name, emoji, members);
          setCreating(false);
          nav.toast(`${emoji} ${name} created`);
          nav.push({ kind: "group", id });
        }}
      />
    </div>
  );
}

const EMOJIS = ["🃏", "🥂", "🏀", "🚗", "🎮", "🪩", "🍗", "✈️", "🔥", "👑"];

export function CreateGroupSheet({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (n: string, e: string, m: string[]) => void }) {
  const { db } = useStore();
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🔥");
  const [members, setMembers] = useState<string[]>([]);
  const friends = Object.values(db.users).filter((u) => db.following.includes(u.id));
  return (
    <BottomSheet open={open} onClose={onClose} title="New private group">
      <div className="mb-4 flex gap-2 overflow-x-auto no-scrollbar">
        {EMOJIS.map((e) => (
          <button key={e} onClick={() => setEmoji(e)} className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl", emoji === e ? "bg-brand glow" : "bg-surface")}>
            {e}
          </button>
        ))}
      </div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group name (e.g. Sunday League)" className="mb-4 h-12 w-full rounded-2xl bg-surface px-4 text-[15px] outline-none placeholder:text-dim focus:shadow-[0_0_0_1.5px_#8247ff]" />
      <div className="mb-2 text-[12px] font-bold uppercase tracking-[0.12em] text-dim">Add friends</div>
      <div className="mb-5 space-y-1">
        {friends.map((u) => {
          const on = members.includes(u.id);
          return (
            <button key={u.id} onClick={() => setMembers(on ? members.filter((x) => x !== u.id) : [...members, u.id])} className="flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-surface">
              <Avatar user={u} size={36} />
              <span className="flex-1 text-[14px] font-medium">{u.name}</span>
              <span className={cx("grid h-6 w-6 place-items-center rounded-full", on ? "bg-brand" : "border border-white/15")}>{on && <Check size={14} strokeWidth={3} />}</span>
            </button>
          );
        })}
      </div>
      <Button size="lg" className="w-full" disabled={!name.trim() || !members.length} onClick={() => onCreate(name.trim(), emoji, members)}>
        Create group · {members.length + 1} members
      </Button>
    </BottomSheet>
  );
}

export function GroupScreen({ id }: { id: string }) {
  const { db } = useStore();
  const nav = useNav();
  const g = db.groups.find((x) => x.id === id);
  if (!g) return null;
  const list = db.challenges.filter((c) => c.groupId === g.id);
  const open = list.filter((c) => c.status !== "settled");
  const done = list.filter((c) => c.status === "settled");
  return (
    <div className="pb-10">
      <TopBar onBack={nav.pop} title={`${g.emoji} ${g.name}`} sub={`${g.memberIds.length} members · Private group`} />
      <div className="px-4">
        <div className="mb-5 rounded-[24px] bg-[radial-gradient(100%_100%_at_0%_0%,rgba(130,71,255,0.35),#151720_70%)] p-5 hairline">
          <div className="mb-4 flex -space-x-2">
            {g.memberIds.map((m) => (
              <button key={m} onClick={() => nav.push({ kind: "user", id: m })} className="rounded-full ring-[3px] ring-card">
                <Avatar user={db.users[m]} size={40} />
              </button>
            ))}
          </div>
          <div className="mb-4 text-[14px] text-white/75">Everything this crew argues about lives here. Group challenges are only visible to members.</div>
          <Button className="w-full" onClick={() => nav.push({ kind: "create", prefill: { visibility: "group", groupId: g.id } })}>
            <Plus size={17} /> New challenge in {g.name}
          </Button>
        </div>
        <div className="mb-2 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-dim">
          <Users size={13} /> Open challenges · {open.length}
        </div>
        <div className="mb-6 space-y-3">
          {open.map((c, i) => (
            <ChallengeCard key={c.id} c={c} index={i} />
          ))}
          {!open.length && <div className="rounded-2xl bg-card p-5 text-center text-sm text-muted hairline">Nothing open. Start the next debate.</div>}
        </div>
        {done.length > 0 && (
          <>
            <div className="mb-1 text-[12px] font-bold uppercase tracking-[0.12em] text-dim">Completed</div>
            <div className="-mx-2">
              {done.map((c) => (
                <RoomRow key={c.id} c={c} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
