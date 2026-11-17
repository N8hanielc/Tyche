"use client";

import { useState } from "react";
import { Check, Copy, Eye, EyeOff, KeyRound, Lock, Mail, Plus, Trash2, Unlock, X } from "lucide-react";
import { api, type InviteCode, type InviteRequest } from "../api";
import { useAdmin } from "../AdminApp";
import { Button, Card, CardHeader, ConfirmDialog, DiffRows, Empty, ErrorBox, Field, Input, Pill, Spinner, Table, Tabs, Td, Th, ago, cx, date, n, useLoad, useToast, type ConfirmSpec } from "../ui";

/** Random, easy-to-read password suggestion (no 0/O/1/l). */
function suggest() {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  const pick = (k: number) => Array.from(crypto.getRandomValues(new Uint32Array(k)), (x) => a[x % a.length]).join("");
  return `${pick(4)}-${pick(4)}`;
}

export function AccessSection() {
  const { isSuper, bump } = useAdmin();
  const [v, setV] = useState(0);
  const { data, error, reload } = useLoad(() => api.access(), [bump, v]);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [show, setShow] = useState(true);
  const [made, setMade] = useState<{ label: string; code: string } | null>(null);
  const [tab, setTab] = useState<"pending" | "invited" | "dismissed">("pending");
  const toast = useToast();
  const refresh = () => setV((x) => x + 1);

  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Spinner />;
  const active = data.codes.filter((c) => c.active).length;

  const toggle = () =>
    setConfirm({
      title: data.inviteOnly ? "Open Tyche to everyone?" : "Make Tyche invite-only?",
      body: (
        <div className="flex flex-col gap-3">
          <DiffRows rows={[{ label: "Invite-only", before: data.inviteOnly ? "On" : "Off", after: data.inviteOnly ? "Off" : "On", emphasize: true }]} />
          <p className="text-[12.5px] text-[#a79db5]">
            {data.inviteOnly
              ? "Anyone can open the app and create an account. The password screen disappears the next time people open the app."
              : `Everyone, including existing members, will need one of your ${active} active password${active === 1 ? "" : "s"} the next time they open the app. Devices that already entered a working password stay unlocked.`}
          </p>
        </div>
      ),
      warning: !data.inviteOnly && active === 0 ? "Add a password first, or nobody new could get in." : undefined,
      confirmLabel: data.inviteOnly ? "Turn off invite-only" : "Turn on invite-only",
      tone: data.inviteOnly ? "warn" : "primary",
      done: data.inviteOnly ? "Invite-only is off" : "Invite-only is on",
      run: (r) => api.setInviteOnly(!data.inviteOnly, r),
    });

  const create = async () => {
    try {
      await api.createInviteCode(label, code);
      setMade({ label: label.trim(), code: code.trim().toLowerCase() });
      setLabel("");
      setCode("");
      toast("ok", "Password created");
      refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : String(e));
    }
  };

  const setActive = (c: InviteCode, on: boolean): ConfirmSpec => ({
    title: on ? `Turn “${c.label}” back on?` : `Turn off “${c.label}”?`,
    body: <p>{on ? "People can use this password again." : "New people can’t use it, and devices unlocked with it are locked again the next time they open the app."}</p>,
    confirmLabel: on ? "Turn on" : "Turn off", tone: on ? "primary" : "warn", done: "Password updated",
    run: (r) => api.setInviteCodeActive(c.id, on, r),
  });
  const remove = (c: InviteCode): ConfirmSpec => ({
    title: `Delete “${c.label}”?`,
    body: <p>It was used {n(c.uses)} time{c.uses === 1 ? "" : "s"}. Devices unlocked with it are locked again the next time they open the app. This can’t be undone.</p>,
    confirmLabel: "Delete password", tone: "danger", done: "Password deleted",
    run: (r) => api.deleteInviteCode(c.id, r),
  });
  const mark = async (r: InviteRequest, status: InviteRequest["status"]) => {
    try {
      await api.setInviteRequest(r.id, status);
      refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : String(e));
    }
  };
  const copy = (t: string, what: string) => void navigator.clipboard?.writeText(t).then(() => toast("ok", `${what} copied`));

  const reqs = data.requests.filter((r) => r.status === tab);
  const count = (s: InviteRequest["status"]) => data.requests.filter((r) => r.status === s).length;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex flex-col gap-5">
        <Card glow={data.inviteOnly ? "plum" : undefined}>
          <div className="flex flex-wrap items-center gap-4 p-5">
            <div className={cx("grid h-12 w-12 place-items-center rounded-2xl", data.inviteOnly ? "bg-[#8247ff]/20 text-[#c9b6ff]" : "bg-white/[0.05] text-[#a79db5]")}>
              {data.inviteOnly ? <Lock size={22} /> : <Unlock size={22} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[17px] font-semibold">Invite-only is {data.inviteOnly ? "on" : "off"}</div>
              <div className="mt-0.5 text-[12.5px] text-[#a79db5]">
                {data.inviteOnly ? "People need an invite password on the opening screen to use the app." : "Anyone can open Tyche and sign up."}
                {data.updatedAt && <> · changed {ago(data.updatedAt)}{data.updatedBy && <> by @{data.updatedBy}</>}</>}
              </div>
            </div>
            <button
              disabled={!isSuper}
              onClick={toggle}
              aria-pressed={data.inviteOnly}
              aria-label="Invite-only"
              className={cx("relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-50", data.inviteOnly ? "bg-[#8247ff]" : "bg-white/[0.12]")}
            >
              <span className={cx("absolute top-1 h-6 w-6 rounded-full bg-white transition-all", data.inviteOnly ? "left-7" : "left-1")} />
            </button>
          </div>
          {!isSuper && <div className="border-t border-white/[0.05] px-5 py-3 text-[12.5px] text-[#a79db5]">Only super admins can change invite-only mode and passwords. You can handle invite requests.</div>}
        </Card>

        <Card>
          <CardHeader title="Invite passwords" sub={`${active} active · passwords aren’t case-sensitive`} />
          {!data.codes.length ? (
            <Empty>No passwords yet. Create one to turn on invite-only.</Empty>
          ) : (
            <Table className="mt-3">
              <thead><tr><Th>Name</Th><Th>Status</Th><Th right>Used</Th><Th>Last used</Th><Th>Created</Th>{isSuper && <Th />}</tr></thead>
              <tbody>
                {data.codes.map((c) => (
                  <tr key={c.id}>
                    <Td><span className="inline-flex items-center gap-2 font-medium"><KeyRound size={14} className="text-[#b69aff]" />{c.label}</span></Td>
                    <Td>{c.active ? <Pill tone="good">Active</Pill> : <Pill>Off</Pill>}</Td>
                    <Td right className="tabular">{n(c.uses)}</Td>
                    <Td className="text-[#c9c1d6]">{c.lastUsedAt ? ago(c.lastUsedAt) : "Never"}</Td>
                    <Td className="text-[#c9c1d6]">{date(c.createdAt)}{c.createdBy && <span className="text-[#8a8099]"> · @{c.createdBy}</span>}</Td>
                    {isSuper && (
                      <Td>
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" onClick={() => setConfirm(setActive(c, !c.active))}>{c.active ? "Turn off" : "Turn on"}</Button>
                          <Button size="sm" tone="danger" onClick={() => setConfirm(remove(c))} title="Delete"><Trash2 size={13} /></Button>
                        </div>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Invite requests"
            sub="People who asked to join from the opening screen. Email them a password, then mark them invited."
            right={<Tabs value={tab} onChange={setTab} items={[{ value: "pending", label: "Pending", count: count("pending") }, { value: "invited", label: "Invited", count: count("invited") }, { value: "dismissed", label: "Dismissed", count: count("dismissed") }]} />}
          />
          {!reqs.length ? (
            <Empty>{tab === "pending" ? "No pending requests." : `Nobody ${tab} yet.`}</Empty>
          ) : (
            <Table className="mt-3">
              <thead><tr><Th>Person</Th><Th>Note</Th><Th>Requested</Th><Th /></tr></thead>
              <tbody>
                {reqs.map((r) => (
                  <tr key={r.id}>
                    <Td>
                      <div className="leading-tight">
                        <div className="font-medium">{r.name}</div>
                        <button onClick={() => copy(r.email, "Email")} className="inline-flex items-center gap-1 text-[12px] text-[#a79db5] hover:text-white">{r.email} <Copy size={11} /></button>
                      </div>
                    </Td>
                    <Td className="max-w-[260px] text-[#c9c1d6]">{r.note || <span className="text-[#6f6680]">—</span>}</Td>
                    <Td className="text-[#c9c1d6]">{ago(r.createdAt)}{r.handledBy && <div className="text-[11.5px] text-[#8a8099]">{r.status} by @{r.handledBy}</div>}</Td>
                    <Td>
                      <div className="flex justify-end gap-1.5">
                        <a href={`mailto:${r.email}?subject=${encodeURIComponent("Your Tyche invite")}&body=${encodeURIComponent(`Hi ${r.name.split(" ")[0]},\n\nYou're in! Open https://jointyche.app and enter this invite password:\n\n[password]\n\nSee you on Tyche.`)}`}
                          className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-white/[0.06] px-3 text-[12.5px] font-semibold ring-1 ring-inset ring-white/[0.08] hover:bg-white/[0.1]"><Mail size={13} /> Email</a>
                        {r.status !== "invited" && <Button size="sm" tone="primary" onClick={() => mark(r, "invited")}><Check size={13} /> Invited</Button>}
                        {r.status === "pending" && <Button size="sm" tone="ghost" onClick={() => mark(r, "dismissed")} title="Dismiss"><X size={13} /></Button>}
                        {r.status !== "pending" && <Button size="sm" tone="ghost" onClick={() => mark(r, "pending")}>Undo</Button>}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card glow="plum" className="self-start">
        <CardHeader title="New invite password" sub={isSuper ? "Share it with the people you want to let in." : "Only super admins can create passwords."} />
        <div className="flex flex-col gap-3 p-5">
          {isSuper ? (
            <form onSubmit={(e) => { e.preventDefault(); void create(); }} className="flex flex-col gap-3">
              <Field label="Name (only you see this)">
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Family, Launch party, Beta testers" maxLength={40} />
              </Field>
              <Field label="Password" hint="6+ characters, no spaces. Not case-sensitive. You won’t be able to see it again after this, so copy it now.">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\s/g, ""))} type={show ? "text" : "password"} placeholder="e.g. spades-night" maxLength={64} autoComplete="off" />
                    <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#8a8099] hover:text-white" aria-label={show ? "Hide" : "Show"}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                  </div>
                  <Button onClick={() => setCode(suggest())}>Suggest</Button>
                </div>
              </Field>
              <Button type="submit" tone="primary" disabled={label.trim().length < 2 || code.trim().length < 6}><Plus size={14} /> Create password</Button>
              {made && (
                <div className="rounded-xl bg-[#3ddc97]/10 p-3 text-[12.5px] ring-1 ring-inset ring-[#3ddc97]/25">
                  <div className="mb-1.5 text-[#9ff0c9]">“{made.label}” is ready. Copy it now:</div>
                  <button onClick={() => copy(made.code, "Password")} className="inline-flex items-center gap-2 rounded-lg bg-black/30 px-3 py-1.5 font-mono text-[14px] text-white">{made.code} <Copy size={13} /></button>
                </div>
              )}
            </form>
          ) : (
            <p className="text-[12.5px] text-[#a79db5]">Ask a super admin for a password.</p>
          )}
        </div>
      </Card>
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} onDone={refresh} />
    </div>
  );
}
