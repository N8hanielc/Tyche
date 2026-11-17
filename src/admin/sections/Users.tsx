"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Ban, Coins, Copy, Flag, Lock, Search, ShieldCheck, Unlock } from "lucide-react";
import { api, type UserDetail, type UserRow } from "../api";
import { useAdmin } from "../AdminApp";
import {
  Avatar, Button, Card, ConfirmDialog, Drawer, Empty, ErrorBox, FlaggedPill, Input, Pager, Pill, RestrictedPill, Select, Spinner, Stat, Table, Tabs, Td, Th,
  UserStatusPill, ago, date, dateTime, n, shortId, signed, useDebounced, useLoad, useToast, type ConfirmSpec,
} from "../ui";
import { AdjustPointsDialog, LedgerTable } from "./Points";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "verified", label: "Verified" },
  { value: "unverified", label: "Unverified" },
  { value: "suspended", label: "Suspended" },
  { value: "restricted", label: "Restricted" },
  { value: "flagged", label: "Flagged" },
  { value: "admins", label: "Admins" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

export function UsersSection() {
  const { params, go, bump } = useAdmin();
  const [q, setQ] = useState(params.q ?? "");
  const [filter, setFilter] = useState<Filter>((params.filter as Filter) ?? "all");
  const [sort, setSort] = useState("newest");
  const [off, setOff] = useState(0);
  const dq = useDebounced(q);
  const lim = 25;
  const [inner, setInner] = useState(0);
  const { data, error, loading, reload } = useLoad(() => api.users(dq, filter, sort, lim, off), [dq, filter, sort, off, bump, inner]);
  const open = params.id ?? null;

  useEffect(() => setOff(0), [dq, filter, sort]);
  useEffect(() => { if (params.q != null) setQ(params.q); }, [params.q]);

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-3 p-5">
          <Input icon={<Search size={15} />} placeholder="Search name, @username, email or user ID" value={q} onChange={(e) => setQ(e.target.value)} className="w-full max-w-[380px]" />
          <Tabs value={filter} onChange={setFilter} items={FILTERS.map((f) => ({ value: f.value, label: f.label }))} />
          <div className="flex-1" />
          <Select label="Sort" value={sort} onChange={setSort} options={[
            { value: "newest", label: "Newest first" }, { value: "active", label: "Recently active" }, { value: "points", label: "Most points" }, { value: "name", label: "Name A–Z" }]} />
        </div>
        {error ? <ErrorBox error={error} retry={reload} /> : !data ? <Spinner /> : !data.rows.length ? <Empty>No users match.</Empty> : (
          <div className={loading ? "opacity-70" : ""}>
            <Table>
              <thead><tr><Th>User</Th><Th>Email</Th><Th>Status</Th><Th right>Points</Th><Th>Joined</Th><Th>Last active</Th></tr></thead>
              <tbody>
                {data.rows.map((u) => <UserRowView key={u.id} u={u} onOpen={() => go("users", { ...params, id: u.id })} />)}
              </tbody>
            </Table>
            <Pager total={data.total} lim={lim} off={off} onChange={setOff} />
          </div>
        )}
      </Card>
      <UserDrawer id={open} onClose={() => { const { id: _id, ...rest } = params; void _id; go("users", rest); }} onChanged={() => setInner((x) => x + 1)} />
    </>
  );
}

function UserRowView({ u, onOpen }: { u: UserRow; onOpen: () => void }) {
  return (
    <tr onClick={onOpen} className="cursor-pointer transition hover:bg-white/[0.025]">
      <Td>
        <div className="flex items-center gap-3">
          <Avatar name={u.name} src={u.avatar} hue={u.hue} size={34} />
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-1.5 font-medium">
              <span className="truncate">{u.name}</span>
              {u.verified && <BadgeCheck size={14} className="shrink-0 text-[#b69aff]" aria-label="Verified" />}
              {u.role && <ShieldCheck size={14} className="shrink-0 text-[#ffc85c]" aria-label="Admin" />}
            </div>
            <div className="text-[12px] text-[#8a8099]">@{u.username}</div>
          </div>
        </div>
      </Td>
      <Td className="text-[#c9c1d6]">{u.email ?? "—"}</Td>
      <Td>
        <div className="flex flex-wrap gap-1.5">
          <UserStatusPill status={u.status} />
          {u.restricted && <RestrictedPill />}
          {u.flagged && <FlaggedPill reason={u.flaggedReason} />}
          {u.plus && <Pill tone="plum">Plus</Pill>}
        </div>
      </Td>
      <Td right className="font-semibold">{n(u.points)}</Td>
      <Td className="text-[#c9c1d6]">{date(u.createdAt)}</Td>
      <Td className="text-[#c9c1d6]">{ago(u.lastActiveAt)}</Td>
    </tr>
  );
}

export function UserDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged?: () => void }) {
  return (
    <Drawer open={!!id} onClose={onClose} width={760}>
      {id && <UserDetailView key={id} id={id} onChanged={onChanged} />}
    </Drawer>
  );
}

function UserDetailView({ id, onChanged }: { id: string; onChanged?: () => void }) {
  const { me } = useAdmin();
  const toast = useToast();
  const [v, setV] = useState(0);
  const { data: u, error, reload } = useLoad(() => api.user(id), [id, v]);
  const [tab, setTab] = useState<"ledger" | "activity" | "history">("ledger");
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [adjust, setAdjust] = useState(false);
  const changed = () => { setV((x) => x + 1); onChanged?.(); };

  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!u) return <Spinner />;
  const self = u.id === me.id;
  const suspended = !!u.suspendedAt;
  const restricted = !!u.restrictedAt;
  const flagged = !!u.flaggedAt;

  const flag = (kind: "suspended" | "restricted" | "flagged", on: boolean): ConfirmSpec => {
    const copy = {
      suspended: on
        ? { t: `Suspend @${u.username}?`, b: "They can still sign in, but they’ll only see a “suspended” screen. Every action in the app is blocked until you reactivate them. Nothing is deleted.", c: "Suspend account", tone: "danger" as const, d: "Account suspended" }
        : { t: `Reactivate @${u.username}?`, b: "They get full access back right away.", c: "Reactivate", tone: "primary" as const, d: "Account reactivated" },
      restricted: on
        ? { t: `Restrict @${u.username} from games?`, b: "They can browse and chat, but can’t create, join, vote on or settle challenges or Game Nights. Stakes already placed stay where they are.", c: "Restrict", tone: "warn" as const, d: "Game access restricted" }
        : { t: `Lift the game restriction for @${u.username}?`, b: "They can create and join challenges again.", c: "Lift restriction", tone: "primary" as const, d: "Restriction lifted" },
      flagged: on
        ? { t: `Flag @${u.username} for review?`, b: "Flags are internal only. The user doesn’t see them and nothing changes for them.", c: "Flag account", tone: "warn" as const, d: "Account flagged" }
        : { t: `Clear the flag on @${u.username}?`, b: "Marks the review as done.", c: "Clear flag", tone: "primary" as const, d: "Flag cleared" },
    }[kind];
    return { title: copy.t, body: <p>{copy.b}</p>, confirmLabel: copy.c, tone: copy.tone, done: copy.d, run: (r) => api.setAccountFlag(u.id, kind, on, r) };
  };
  const verify = (on: boolean): ConfirmSpec => ({
    title: on ? `Verify @${u.username}?` : `Remove verification from @${u.username}?`,
    body: <p>{on ? "Adds the verified badge next to their name everywhere in Tyche and notifies them." : "Removes the verified badge from their profile."} Verification is always a manual decision.</p>,
    confirmLabel: on ? "Verify account" : "Remove verification", tone: on ? "primary" : "danger", done: on ? "Account verified" : "Verification removed",
    reasonPresets: on ? ["Known creator", "Public figure", "Brand or business", "Identity confirmed"] : ["Impersonation", "Username changed", "Verified in error"],
    run: (r) => api.setVerified(u.id, on, r),
  });

  return (
    <div>
      <div className="relative overflow-hidden border-b border-white/[0.06] px-7 pb-6 pt-8">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(90% 120% at 0% 0%, hsla(${u.hue},70%,55%,0.22), transparent 60%)` }} />
        <div className="relative flex flex-wrap items-start gap-4">
          <Avatar name={u.name} src={u.avatar} hue={u.hue} size={64} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-[24px] font-bold tracking-[-0.02em]">{u.name}</h2>
              {u.verified && <BadgeCheck size={20} className="text-[#b69aff]" />}
            </div>
            <div className="text-[13px] text-[#a79db5]">@{u.username} · {u.email ?? "no email"} · {u.provider}</div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <UserStatusPill status={u.status} />
              {restricted && <RestrictedPill />}
              {flagged && <FlaggedPill reason={u.flaggedReason} />}
              {u.role && <Pill tone="warn" icon={<ShieldCheck size={12} />}>{u.role === "super_admin" ? "Super admin" : "Admin"}</Pill>}
              {!!u.plus && <Pill tone="plum">Tyche+</Pill>}
            </div>
          </div>
        </div>
        <button onClick={() => { void navigator.clipboard?.writeText(u.id); toast("ok", "User ID copied"); }}
          className="relative mt-4 inline-flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-2.5 py-1 font-mono text-[11.5px] text-[#a79db5] hover:text-white">
          <Copy size={12} /> {u.id}
        </button>
        {(suspended || restricted || flagged) && (
          <div className="relative mt-4 flex flex-col gap-1.5 text-[12.5px]">
            {suspended && <Note tone="bad" label={`Suspended ${dateTime(u.suspendedAt)}`} text={u.suspendedReason} />}
            {restricted && <Note tone="warn" label={`Restricted ${dateTime(u.restrictedAt)}`} text={u.restrictedReason} />}
            {flagged && <Note tone="warn" label={`Flagged ${dateTime(u.flaggedAt)}`} text={u.flaggedReason} />}
          </div>
        )}
        {self ? (
          <p className="relative mt-5 text-[12.5px] text-[#8a8099]">This is your account. Admins can’t change their own status or points.</p>
        ) : (
          <div className="relative mt-5 flex flex-wrap gap-2">
            <Button tone="primary" size="sm" onClick={() => setAdjust(true)}><Coins size={14} /> Adjust points</Button>
            <Button size="sm" onClick={() => setConfirm(verify(!u.verified))}><BadgeCheck size={14} /> {u.verified ? "Remove verification" : "Verify"}</Button>
            <Button size="sm" tone={restricted ? "default" : "warn"} onClick={() => setConfirm(flag("restricted", !restricted))}>{restricted ? <Unlock size={14} /> : <Lock size={14} />} {restricted ? "Lift restriction" : "Restrict games"}</Button>
            <Button size="sm" tone="ghost" onClick={() => setConfirm(flag("flagged", !flagged))}><Flag size={14} /> {flagged ? "Clear flag" : "Flag"}</Button>
            <Button size="sm" tone={suspended ? "primary" : "danger"} onClick={() => setConfirm(flag("suspended", !suspended))}><Ban size={14} /> {suspended ? "Reactivate" : "Suspend"}</Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 px-7 pt-6 md:grid-cols-4">
        <Stat label="Balance" value={n(u.points)} sub={`${n(u.stats.openStakes)} staked in open games`} />
        <Stat label="Earned" value={n(u.stats.earned)} sub={`Admin net ${signed(u.stats.adminNet)}`} />
        <Stat label="Spent" value={n(u.stats.spent)} sub={`${n(u.stats.lifetimeStaked)} staked all-time`} />
        <Stat label="Record" value={`${u.stats.wins}–${u.stats.losses}`} sub={`${u.stats.joined} joined · ${u.stats.created} created`} />
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 px-7 pt-5 text-[12.5px] md:grid-cols-3">
        <Meta k="Joined" v={date(u.createdAt)} />
        <Meta k="Last active" v={ago(u.lastActiveAt)} />
        <Meta k="Last sign-in" v={ago(u.lastSignInAt)} />
        <Meta k="Active days (30d)" v={String(u.activeDays30)} />
        <Meta k="Verified" v={u.verified ? `${date(u.verifiedAt)}${u.verifiedBy ? ` by @${u.verifiedBy}` : ""}` : "No"} />
        <Meta k="Badges" v={u.badges.join(", ") || "—"} />
      </div>

      <div className="px-7 pb-8 pt-6">
        <Tabs value={tab} onChange={setTab} items={[{ value: "ledger", label: "Points history" }, { value: "activity", label: "Activity", count: u.activity.length }, { value: "history", label: "Admin history", count: u.adminHistory.length }]} />
        <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.06]">
          {tab === "ledger" && <LedgerTable uid={u.id} compact key={v} />}
          {tab === "activity" && <ActivityList u={u} />}
          {tab === "history" && (u.adminHistory.length ? (
            <div className="divide-y divide-white/[0.05]">
              {u.adminHistory.map((h) => (
                <div key={h.id} className="px-4 py-3 text-[12.5px]">
                  <div className="flex items-center justify-between gap-2"><span className="font-medium">{h.action}</span><span className="text-[#8a8099]">{dateTime(h.at)} · @{h.admin}</span></div>
                  {h.reason && <div className="mt-0.5 text-[#c9c1d6]">“{h.reason}”</div>}
                </div>
              ))}
            </div>
          ) : <Empty>No admin actions on this account yet.</Empty>)}
        </div>
      </div>

      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} onDone={changed} />
      {adjust && <AdjustPointsDialog user={{ id: u.id, username: u.username, name: u.name, points: u.points }} onClose={() => setAdjust(false)} onDone={changed} />}
    </div>
  );
}

function Note({ tone, label, text }: { tone: "bad" | "warn"; label: string; text?: string | null }) {
  return (
    <div className={tone === "bad" ? "rounded-xl bg-[#ff5d73]/10 px-3 py-2 text-[#ffc2cb] ring-1 ring-inset ring-[#ff5d73]/20" : "rounded-xl bg-[#ffc85c]/8 px-3 py-2 text-[#ffe3ae] ring-1 ring-inset ring-[#ffc85c]/20"}>
      <b className="font-semibold">{label}</b>{text ? ` · ${text}` : ""}
    </div>
  );
}
const Meta = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between gap-2 border-b border-white/[0.04] py-1.5"><span className="text-[#8a8099]">{k}</span><span className="truncate text-right text-[#e7dfef]">{v}</span></div>
);

function ActivityList({ u }: { u: UserDetail }) {
  if (!u.activity.length) return <Empty>No games yet.</Empty>;
  return (
    <div className="divide-y divide-white/[0.05]">
      {u.activity.map((a, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 text-[12.5px]">
          <Pill tone={a.kind === "created" ? "plum" : "neutral"}>{a.kind === "created" ? "Created" : "Joined"}</Pill>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[#e7dfef]">{a.title}</div>
            <div className="text-[#8a8099]">{a.kind === "joined" ? `${a.option ?? "—"} · ${n(a.points ?? 0)} pts · ` : ""}{a.status} · <span title={shortId(a.challengeId)}>{dateTime(a.at)}</span></div>
          </div>
        </div>
      ))}
    </div>
  );
}

