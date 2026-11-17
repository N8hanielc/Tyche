"use client";

import { useState } from "react";
import { Ban, Copy, Globe, Mail, Pause, Pencil, Phone, Play, Plus, Search } from "lucide-react";
import { api, type Advertiser, type Campaign } from "../api";
import { useAdmin } from "../AdminApp";
import {
  AdvertiserStatusPill, Button, Card, ConfirmDialog, DeliveryMeter, Drawer, Empty, ErrorBox, Field, Input, Modal, Spinner, Stat, Table, Td, TextArea, Th,
  compact, date, n, pct, shortId, useLoad, useToast, type ConfirmSpec,
} from "../ui";
import { CampaignEditor, CampaignTable } from "./Campaigns";

export function AdvertisersSection() {
  const { params, go, bump } = useAdmin();
  const [q, setQ] = useState("");
  const [inner, setInner] = useState(0);
  const { data, error, loading, reload } = useLoad(() => api.advertisers(), [bump, inner]);
  const [editing, setEditing] = useState<Advertiser | "new" | null>(null);
  const rows = (data ?? []).filter((a) => !q || `${a.name} ${a.contactName ?? ""} ${a.contactEmail ?? ""} ${a.id}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-3 p-5">
          <Input icon={<Search size={15} />} placeholder="Search advertisers" value={q} onChange={(e) => setQ(e.target.value)} className="w-full max-w-[320px]" />
          <div className="flex-1" />
          <Button tone="primary" onClick={() => setEditing("new")}><Plus size={15} /> New advertiser</Button>
        </div>
        {error ? <ErrorBox error={error} retry={reload} /> : !data ? <Spinner /> : !rows.length ? <Empty>No advertisers yet.</Empty> : (
          <div className={loading ? "opacity-70" : ""}>
            <Table>
              <thead><tr><Th>Company</Th><Th>Contact</Th><Th>Status</Th><Th right>Campaigns</Th><Th right>Purchased</Th><Th right>Delivered</Th><Th right>Clicks</Th><Th right>CTR</Th><Th>Delivery</Th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} onClick={() => go("advertisers", { id: a.id })} className="cursor-pointer hover:bg-white/[0.025]">
                    <Td>
                      <div className="flex items-center gap-3">
                        <Logo a={a} />
                        <div className="leading-tight"><div className="font-medium">{a.name}</div><div className="font-mono text-[11px] text-[#6f6680]">{shortId(a.id)}</div></div>
                      </div>
                    </Td>
                    <Td className="text-[#c9c1d6]"><div>{a.contactName ?? "—"}</div><div className="text-[12px] text-[#8a8099]">{a.contactEmail ?? ""}</div></Td>
                    <Td><AdvertiserStatusPill status={a.status} /></Td>
                    <Td right>{a.running} live · {a.campaigns}</Td>
                    <Td right>{compact(a.purchased)}</Td>
                    <Td right>{compact(a.delivered)}</Td>
                    <Td right>{n(a.clicks)}</Td>
                    <Td right>{pct(a.delivered ? (100 * a.clicks) / a.delivered : null, 2)}</Td>
                    <Td className="min-w-[120px]"><DeliveryMeter delivered={a.delivered} purchased={a.purchased} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>
      <Drawer open={!!params.id} onClose={() => go("advertisers")} width={1000}>
        {params.id && <AdvertiserDetail key={params.id} id={params.id} onEdit={setEditing} onChanged={() => setInner((x) => x + 1)} />}
      </Drawer>
      {editing && <AdvertiserEditor advertiser={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={(id) => { setInner((x) => x + 1); go("advertisers", { id }); }} />}
    </>
  );
}

function Logo({ a, size = 36 }: { a: Advertiser; size?: number }) {
  const t = a.tint ?? "#8247FF";
  const img = a.logo?.startsWith("http");
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-xl" style={{ width: size, height: size, background: `linear-gradient(140deg, ${t}33, ${t}14)`, boxShadow: `inset 0 0 0 1px ${t}40` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {img ? <img src={a.logo!} alt="" className="h-full w-full object-cover" /> : <span style={{ fontSize: size * 0.5 }}>{a.logo ?? a.name[0]}</span>}
    </span>
  );
}

function AdvertiserDetail({ id, onEdit, onChanged }: { id: string; onEdit: (a: Advertiser) => void; onChanged: () => void }) {
  const { bump, go } = useAdmin();
  const toast = useToast();
  const [v, setV] = useState(0);
  const advs = useLoad(() => api.advertisers(), [bump, v]);
  const camps = useLoad(() => api.campaigns(), [bump, v]);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [newCampaign, setNewCampaign] = useState(false);
  const a = advs.data?.find((x) => x.id === id);
  if (advs.error) return <ErrorBox error={advs.error} retry={advs.reload} />;
  if (!advs.data) return <Spinner />;
  if (!a) return <Empty>Advertiser not found.</Empty>;
  const list: Campaign[] = (camps.data ?? []).filter((c) => c.advertiserId === id);
  const changed = () => { setV((x) => x + 1); onChanged(); };

  const status = (s: Advertiser["status"]): ConfirmSpec => ({
    title: s === "active" ? `Reactivate ${a.name}?` : s === "paused" ? `Pause ${a.name}?` : `Suspend ${a.name}?`,
    body: <p>{s === "active"
      ? "Its active campaigns become eligible to show again right away (dates, pacing and caps still apply)."
      : s === "paused"
        ? "None of its ads will show anywhere in the app until you reactivate it. Campaigns and their performance history are kept."
        : "Suspends the account: none of its ads show anywhere, and it stays suspended until a person reactivates it. Campaigns and history are kept."}</p>,
    confirmLabel: s === "active" ? "Reactivate" : s === "paused" ? "Pause advertiser" : "Suspend advertiser",
    tone: s === "active" ? "primary" : s === "paused" ? "warn" : "danger",
    reason: s === "active" ? "optional" : "required",
    reasonPresets: s === "active" ? undefined : ["Invoice overdue", "Creative under review", "Advertiser request", "Policy violation"],
    done: s === "active" ? "Advertiser reactivated" : s === "paused" ? "Advertiser paused" : "Advertiser suspended",
    run: (r) => api.setAdvertiserStatus(a.id, s, r || null),
  });

  return (
    <div>
      <div className="border-b border-white/[0.06] px-7 pb-6 pt-8">
        <div className="flex flex-wrap items-start gap-4 pr-10">
          <Logo a={a} size={56} />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[24px] font-bold tracking-[-0.02em]">{a.name}</h2>
            <button onClick={() => { void navigator.clipboard?.writeText(a.id); toast("ok", "Advertiser ID copied"); }} className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-[11.5px] text-[#8a8099] hover:text-white"><Copy size={11} />{a.id}</button>
            <div className="mt-2.5 flex flex-wrap items-center gap-2"><AdvertiserStatusPill status={a.status} />{a.statusReason && <span className="text-[12.5px] text-[#c9c1d6]">“{a.statusReason}”</span>}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-[#c9c1d6]">
          {a.contactName && <span>{a.contactName}</span>}
          {a.contactEmail && <a href={`mailto:${a.contactEmail}`} className="inline-flex items-center gap-1.5 hover:text-white"><Mail size={13} />{a.contactEmail}</a>}
          {a.contactPhone && <span className="inline-flex items-center gap-1.5"><Phone size={13} />{a.contactPhone}</span>}
          {a.website && <a href={a.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-white"><Globe size={13} />{a.website.replace(/^https?:\/\//, "")}</a>}
          <span className="text-[#8a8099]">Added {date(a.createdAt)}</span>
        </div>
        {a.notes && <p className="mt-3 max-w-2xl text-[12.5px] text-[#a79db5]">{a.notes}</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          {a.status === "active" ? (
            <>
              <Button size="sm" tone="warn" onClick={() => setConfirm(status("paused"))}><Pause size={14} /> Pause</Button>
              <Button size="sm" tone="danger" onClick={() => setConfirm(status("suspended"))}><Ban size={14} /> Suspend</Button>
            </>
          ) : (
            <Button size="sm" tone="primary" onClick={() => setConfirm(status("active"))}><Play size={14} /> Reactivate</Button>
          )}
          <Button size="sm" onClick={() => onEdit(a)}><Pencil size={14} /> Edit details</Button>
          <Button size="sm" onClick={() => setNewCampaign(true)}><Plus size={14} /> New campaign</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 px-7 pt-6 md:grid-cols-4">
        <Stat label="Live campaigns" value={`${a.running}`} sub={`${a.campaigns} total`} />
        <Stat label="Purchased" value={compact(a.purchased)} sub="impressions, not canceled" />
        <Stat label="Delivered" value={compact(a.delivered)} sub={pct(a.purchased ? (100 * a.delivered) / a.purchased : null, 1)} />
        <Stat label="Clicks" value={n(a.clicks)} sub={`CTR ${pct(a.delivered ? (100 * a.clicks) / a.delivered : null, 2)}`} />
      </div>
      <div className="px-7 pb-8 pt-6">
        <div className="mb-3 text-[14px] font-semibold">Campaigns</div>
        <div className="overflow-hidden rounded-2xl border border-white/[0.06]">
          {camps.data ? <CampaignTable rows={list} showAdvertiser={false} onOpen={(c) => go("campaigns", { id: c.id })} /> : <Spinner />}
        </div>
      </div>
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} onDone={changed} />
      {newCampaign && <CampaignEditor campaign={null} advertiserId={a.id} onClose={() => setNewCampaign(false)} onSaved={(cid) => { changed(); go("campaigns", { id: cid }); }} />}
    </div>
  );
}

function AdvertiserEditor({ advertiser, onClose, onSaved }: { advertiser: Advertiser | null; onClose: () => void; onSaved: (id: string) => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: advertiser?.name ?? "", contactName: advertiser?.contactName ?? "", contactEmail: advertiser?.contactEmail ?? "",
    contactPhone: advertiser?.contactPhone ?? "", website: advertiser?.website ?? "", notes: advertiser?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const id = await api.saveAdvertiser({ id: advertiser?.id, ...f });
      toast("ok", advertiser ? "Advertiser updated" : "Advertiser added");
      onSaved(id);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={() => !busy && onClose()} title={advertiser ? `Edit ${advertiser.name}` : "New advertiser"}
      footer={<><Button tone="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button tone="primary" onClick={save} busy={busy} disabled={!f.name.trim()}>{advertiser ? "Save" : "Add advertiser"}</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label="Company name" hint={advertiser ? "Renaming updates every campaign for this company. Frequency caps group ads by company." : undefined}><Input value={f.name} onChange={set("name")} maxLength={80} autoFocus /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Contact name"><Input value={f.contactName} onChange={set("contactName")} /></Field>
          <Field label="Contact email"><Input type="email" value={f.contactEmail} onChange={set("contactEmail")} /></Field>
          <Field label="Phone"><Input value={f.contactPhone} onChange={set("contactPhone")} /></Field>
          <Field label="Website"><Input value={f.website} onChange={set("website")} placeholder="https://" /></Field>
        </div>
        <Field label="Internal notes"><TextArea value={f.notes} onChange={set("notes")} /></Field>
        {err && <p className="rounded-xl bg-[#ff5d73]/10 p-3 text-[12.5px] text-[#ffb3be] ring-1 ring-inset ring-[#ff5d73]/25">{err}</p>}
      </div>
    </Modal>
  );
}
