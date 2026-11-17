"use client";

import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Lock, Search } from "lucide-react";
import { api, type AdminLogRow } from "../api";
import { useAdmin } from "../AdminApp";
import { Card, Empty, ErrorBox, Input, Pager, Pill, Select, Spinner, Table, Td, Th, cx, dateTime, useDebounced, useLoad } from "../ui";

const ACTIONS = [
  { value: "", label: "All actions" },
  { value: "user.verify", label: "Verified" },
  { value: "user.unverify", label: "Verification removed" },
  { value: "user.suspend", label: "Suspended" },
  { value: "user.reactivate", label: "Reactivated" },
  { value: "user.restrict", label: "Restricted" },
  { value: "user.unrestrict", label: "Restriction lifted" },
  { value: "user.flag", label: "Flagged" },
  { value: "points.", label: "Points issued or deducted" },
  { value: "advertiser.", label: "Advertiser changes" },
  { value: "campaign.pause", label: "Campaign paused" },
  { value: "campaign.resume", label: "Campaign resumed" },
  { value: "campaign.cancel", label: "Campaign canceled" },
  { value: "campaign.priority", label: "Priority changes" },
  { value: "campaign.", label: "All campaign changes" },
  { value: "settings.", label: "Ad setting changes" },
  { value: "admin.", label: "Admin role changes" },
];

const LABEL: Record<string, string> = {
  "user.verify": "Verified account", "user.unverify": "Removed verification", "user.suspend": "Suspended account", "user.reactivate": "Reactivated account",
  "user.restrict": "Restricted from games", "user.unrestrict": "Lifted game restriction", "user.flag": "Flagged account", "user.unflag": "Cleared flag",
  "points.issue": "Issued points", "points.deduct": "Deducted points",
  "advertiser.create": "Added advertiser", "advertiser.update": "Edited advertiser", "advertiser.pause": "Paused advertiser", "advertiser.suspend": "Suspended advertiser", "advertiser.reactivate": "Reactivated advertiser",
  "campaign.create": "Created campaign", "campaign.update": "Edited campaign", "campaign.pause": "Paused campaign", "campaign.resume": "Resumed campaign", "campaign.cancel": "Canceled campaign",
  "campaign.priority": "Changed priority", "campaign.dates": "Changed dates", "settings.update": "Changed ad settings",
  "admin.grant": "Granted admin", "admin.revoke": "Revoked admin", "admin.change": "Changed admin role",
};
const tone = (a: string) =>
  /suspend|deduct|cancel|revoke|unverify/.test(a) ? "bad" : /restrict|flag|pause|settings/.test(a) ? "warn" : /verify|issue|grant|reactivate|resume|create/.test(a) ? "good" : "plum";

const fmt = (v: unknown): string =>
  v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : typeof v === "number" ? v.toLocaleString("en-US")
  : typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) ? dateTime(v) : String(v);
function Change({ r }: { r: AdminLogRow }) {
  const keys = [...new Set([...Object.keys(r.before ?? {}), ...Object.keys(r.after ?? {})])].filter((k) => k !== "transactionId");
  if (!keys.length) return <span className="text-[#8a8099]">—</span>;
  return (
    <div className="flex max-w-[240px] flex-col gap-0.5 text-[12px]">
      {keys.slice(0, 3).map((k) => (
        <div key={k} className="truncate">
          <span className="text-[#8a8099]">{k}: </span>
          {r.before && k in r.before && <><span className="text-[#a79db5]">{fmt(r.before[k])}</span><span className="mx-1 text-[#6f6680]">→</span></>}
          <span className="text-white">{fmt(r.after?.[k])}</span>
        </div>
      ))}
      {keys.length > 3 && <span className="text-[#8a8099]">+{keys.length - 3} more</span>}
    </div>
  );
}

export function ActivitySection() {
  const { bump, go } = useAdmin();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [act, setAct] = useState("");
  const [ttype, setTtype] = useState("");
  const [admin, setAdmin] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [off, setOff] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const lim = 40;
  const { data, error, loading, reload } = useLoad(
    () => api.log({ q: dq, act, ttype, admin: admin || null, since: since ? new Date(since + "T00:00:00").toISOString() : null, until: until ? new Date(until + "T23:59:59").toISOString() : null, lim, off }),
    [dq, act, ttype, admin, since, until, off, bump],
  );
  useEffect(() => setOff(0), [dq, act, ttype, admin, since, until]);

  const openTarget = (r: AdminLogRow) => {
    if (!r.targetId) return;
    if (r.targetType === "user" || r.targetType === "admin") go("users", { id: r.targetId });
    else if (r.targetType === "campaign") go("campaigns", { id: r.targetId });
    else if (r.targetType === "advertiser") go("advertisers", { id: r.targetId });
    else if (r.targetType === "setting") go("settings");
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3 p-5">
        <Input icon={<Search size={15} />} placeholder="Search target, reason or admin" value={q} onChange={(e) => setQ(e.target.value)} className="w-full max-w-[300px]" />
        <Select label="Action" value={act} onChange={setAct} options={ACTIONS} />
        <Select label="Target" value={ttype} onChange={setTtype} options={[{ value: "", label: "All targets" }, { value: "user", label: "Accounts" }, { value: "advertiser", label: "Advertisers" }, { value: "campaign", label: "Campaigns" }, { value: "setting", label: "Settings" }, { value: "admin", label: "Admin roles" }]} />
        <Select label="Admin" value={admin} onChange={setAdmin} options={[{ value: "", label: "All admins" }, ...(data?.admins ?? []).map((a) => ({ value: a.id, label: `@${a.username}` }))]} />
        <div className="flex items-center gap-1.5 text-[12px] text-[#8a8099]">
          <Input type="date" value={since} onChange={(e) => setSince(e.target.value)} className="w-[148px]" aria-label="From" /> to
          <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="w-[148px]" aria-label="To" />
        </div>
      </div>
      <div className="flex items-center gap-2 px-5 pb-3 text-[12px] text-[#8a8099]"><Lock size={12} /> Entries are permanent. They can’t be edited or deleted, from this panel or the database.</div>
      {error ? <ErrorBox error={error} retry={reload} /> : !data ? <Spinner /> : !data.rows.length ? <Empty>No activity matches.</Empty> : (
        <div className={loading ? "opacity-70" : ""}>
          <Table>
            <thead><tr><Th className="w-8" /><Th>When</Th><Th>Admin</Th><Th>Action</Th><Th>Target</Th><Th>Change</Th><Th>Reason</Th></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <Fragment key={r.id}>
                  <tr className="cursor-pointer hover:bg-white/[0.025]" onClick={() => setOpen(open === r.id ? null : r.id)}>
                    <Td className="text-[#8a8099]">{open === r.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</Td>
                    <Td className="whitespace-nowrap text-[#c9c1d6]">{dateTime(r.at)}</Td>
                    <Td className="whitespace-nowrap">@{r.admin}<div className="text-[11px] text-[#8a8099]">{r.role === "super_admin" ? "Super admin" : "Admin"}</div></Td>
                    <Td><Pill tone={tone(r.action)}>{LABEL[r.action] ?? r.action}</Pill></Td>
                    <Td><button onClick={(e) => { e.stopPropagation(); openTarget(r); }} title={r.target ?? r.targetId} className="block max-w-[190px] truncate text-left text-[#e7dfef] hover:text-white">{r.target ?? r.targetId}</button></Td>
                    <Td><Change r={r} /></Td>
                    <Td className={cx("text-[12.5px]", r.reason ? "text-[#c9c1d6]" : "text-[#6f6680]")}><div className="line-clamp-2 min-w-[140px] max-w-[220px]" title={r.reason ?? undefined}>{r.reason ?? "—"}</div></Td>
                  </tr>
                  {open === r.id && (
                    <tr><td colSpan={7} className="border-b border-white/[0.04] bg-white/[0.02] px-6 py-4">
                      <div className="grid gap-4 text-[12px] md:grid-cols-3">
                        <div><div className="mb-1 text-[#8a8099]">Entry</div><div className="font-mono text-[11.5px] text-[#c9c1d6]">#{r.id} · {r.action}<br />{r.targetType}:{r.targetId}<br />admin {r.adminId}</div></div>
                        <div><div className="mb-1 text-[#8a8099]">Previous value</div><pre className="whitespace-pre-wrap break-all font-mono text-[11.5px] text-[#c9c1d6]">{JSON.stringify(r.before, null, 2) ?? "—"}</pre></div>
                        <div><div className="mb-1 text-[#8a8099]">New value</div><pre className="whitespace-pre-wrap break-all font-mono text-[11.5px] text-white">{JSON.stringify(r.after, null, 2) ?? "—"}</pre></div>
                      </div>
                      {r.reason && <p className="mt-3 text-[12.5px] text-[#e7dfef]">Reason: {r.reason}</p>}
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </Table>
          <Pager total={data.total} lim={lim} off={off} onChange={setOff} />
        </div>
      )}
    </Card>
  );
}
