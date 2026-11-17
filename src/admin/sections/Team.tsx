"use client";

import { useState } from "react";
import { Search, ShieldCheck, UserPlus } from "lucide-react";
import { api, type Role, type TeamMember, type UserRow } from "../api";
import { useAdmin } from "../AdminApp";
import { Avatar, Button, Card, CardHeader, ConfirmDialog, DiffRows, Empty, ErrorBox, Input, Pill, Spinner, Table, Td, Th, date, useDebounced, useLoad, type ConfirmSpec } from "../ui";

const roleLabel = (r: Role | null) => (r === "super_admin" ? "Super admin" : r === "admin" ? "Admin" : "No access");

export function TeamSection() {
  const { isSuper, me, bump, go } = useAdmin();
  const [v, setV] = useState(0);
  const { data, error, reload } = useLoad(() => api.team(), [bump, v]);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const found = useLoad(() => (isSuper && dq.trim().length >= 2 ? api.users(dq, "all", "name", 6, 0) : Promise.resolve(null)), [dq, isSuper]);

  const change = (u: { id: string; username: string }, from: Role | null, to: Role | null): ConfirmSpec => ({
    title: to ? `Make @${u.username} ${roleLabel(to).toLowerCase()}?` : `Remove @${u.username}’s admin access?`,
    body: (
      <div className="flex flex-col gap-3">
        <DiffRows rows={[{ label: "Role", before: roleLabel(from), after: roleLabel(to), emphasize: true }]} />
        <p className="text-[12.5px] text-[#a79db5]">
          Admins can manage users, points (up to 10,000 per adjustment), advertisers and campaigns. Super admins can also change global ad settings, grant or remove admin access, change campaign purchase terms, and make larger point adjustments.
        </p>
      </div>
    ),
    confirmLabel: to ? "Grant access" : "Remove access", tone: to ? "primary" : "danger", done: "Team updated",
    run: (r) => api.setRole(u.id, to, r),
  });

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card>
        <CardHeader title="Admins" sub="People who can sign in to this panel" />
        {error ? <ErrorBox error={error} retry={reload} /> : !data ? <Spinner /> : !data.length ? <Empty>No admins.</Empty> : (
          <Table className="mt-3">
            <thead><tr><Th>Person</Th><Th>Role</Th><Th>Since</Th><Th>Granted by</Th>{isSuper && <Th />}</tr></thead>
            <tbody>
              {data.map((m: TeamMember) => (
                <tr key={m.id}>
                  <Td>
                    <button onClick={() => go("users", { id: m.id })} className="flex items-center gap-3 text-left">
                      <Avatar name={m.name} src={m.avatar} hue={m.hue} size={34} />
                      <div className="leading-tight"><div className="font-medium">{m.name}{m.id === me.id && <span className="ml-1.5 text-[11.5px] text-[#8a8099]">(you)</span>}</div><div className="text-[12px] text-[#8a8099]">@{m.username}</div></div>
                    </button>
                  </Td>
                  <Td><Pill tone={m.role === "super_admin" ? "warn" : "plum"} icon={<ShieldCheck size={12} />}>{roleLabel(m.role)}</Pill></Td>
                  <Td className="text-[#c9c1d6]">{date(m.grantedAt)}</Td>
                  <Td className="text-[#c9c1d6]">{m.grantedBy ? `@${m.grantedBy}` : "SQL setup"}</Td>
                  {isSuper && (
                    <Td>
                      {m.id !== me.id && (
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" onClick={() => setConfirm(change(m, m.role, m.role === "admin" ? "super_admin" : "admin"))}>{m.role === "admin" ? "Make super admin" : "Make admin"}</Button>
                          <Button size="sm" tone="danger" onClick={() => setConfirm(change(m, m.role, null))}>Remove</Button>
                        </div>
                      )}
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <Card glow="plum" className="self-start">
        <CardHeader title="Add an admin" sub={isSuper ? "They sign in with their normal Tyche account." : "Only super admins can grant access."} />
        <div className="flex flex-col gap-3 p-5">
          {isSuper ? (
            <>
              <Input icon={<Search size={15} />} placeholder="Search @username or email" value={q} onChange={(e) => setQ(e.target.value)} />
              {found.data?.rows.map((u: UserRow) => (
                <div key={u.id} className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-2.5 ring-1 ring-inset ring-white/[0.06]">
                  <Avatar name={u.name} src={u.avatar} hue={u.hue} size={30} />
                  <div className="min-w-0 flex-1 leading-tight"><div className="truncate text-[13px] font-medium">{u.name}</div><div className="text-[12px] text-[#8a8099]">@{u.username}</div></div>
                  {u.role ? <Pill tone="plum">{roleLabel(u.role)}</Pill> : <Button size="sm" tone="primary" onClick={() => setConfirm(change(u, null, "admin"))}><UserPlus size={14} /> Add</Button>}
                </div>
              ))}
            </>
          ) : (
            <p className="text-[12.5px] text-[#a79db5]">Ask a super admin if someone on your team needs access.</p>
          )}
        </div>
      </Card>
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} onDone={() => { setV((x) => x + 1); setQ(""); }} />
    </div>
  );
}
