"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Compass, Home, Pause, Pencil, Play, Plus, Search, User, XCircle } from "lucide-react";
import { SponsoredCardView, AdBannerView } from "@/components/ads/Ads";
import type { Ad } from "@/lib/ads";
import { api, type Advertiser, type Campaign, type Priority } from "../api";
import { useAdmin } from "../AdminApp";
import { BarChart } from "../charts";
import {
  Button, Card, ConfirmDialog, DeliveryMeter, DiffRows, Drawer, Empty, ErrorBox, Field, Input, Modal, Pill, PriorityPill, Select, Spinner, StatePill,
  Table, Tabs, Td, TextArea, Th, cx, date, dateTime, n, pct, shortDate, useDebounced, useLoad, useToast, type ConfirmSpec,
} from "../ui";

export const TYPE_LABEL = { banner: "Banner", card: "Sponsored card", both: "Banner + card" } as const;
export const toAd = (c: Pick<Campaign, "id" | "advertiser" | "logo" | "tint" | "url" | "domain" | "question" | "options" | "cta" | "banner">): Ad => ({
  id: c.id, sponsor: c.advertiser, logo: c.logo || "📣", tint: c.tint || "#8247FF", url: c.url, domain: c.domain,
  question: c.question, options: (c.options ?? []).map((o) => ({ label: o.label, sub: o.sub ?? "" })), cta: c.cta, banner: c.banner,
});

// ---------------------------------------------------------------- preview --

/** Phone-sized preview using the app's own ad components (same markup the feed and Discover render). */
export function AdPreview({ ad, show = "both" }: { ad: Ad; show?: "card" | "banner" | "both" }) {
  const card = show !== "banner" && !!ad.question;
  const banner = show !== "card" && !!ad.banner;
  return (
    <div className="mx-auto w-[300px] shrink-0 rounded-[42px] bg-[#05040a] p-2.5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9),inset_0_0_0_1px_rgba(255,255,255,0.08)]">
      <div className="relative h-[580px] overflow-hidden rounded-[34px] bg-[#090a0f]">
        <div className="flex items-center justify-between px-6 pb-2 pt-3 text-[11px] font-semibold text-white/80"><span>9:41</span><span className="h-5 w-20 rounded-full bg-black" /><span>100%</span></div>
        <div className="flex flex-col gap-3 px-3 pt-1">
          <div className="flex items-center gap-2 px-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.png" alt="" className="h-6 w-6 rounded-md" />
            <span className="font-display text-[15px] font-bold">For you</span>
          </div>
          {card ? <div className="pointer-events-none"><SponsoredCardView ad={ad} /></div> : <div className="rounded-[22px] border border-dashed border-white/10 p-6 text-center text-[11px] text-white/40">No sponsored card in this campaign</div>}
          <SkeletonPost />
        </div>
        <div className="absolute inset-x-0 bottom-[62px] px-2.5">
          {banner ? <div className="pointer-events-none"><AdBannerView ad={ad} /></div> : <div className="rounded-2xl border border-dashed border-white/10 py-3 text-center text-[11px] text-white/40">No banner in this campaign</div>}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex h-[58px] items-center justify-around border-t border-white/[0.06] bg-[#0d0e14] text-white/45">
          <Home size={19} className="text-white" /><Compass size={19} /><Plus size={19} /><User size={19} />
        </div>
      </div>
    </div>
  );
}
function SkeletonPost() {
  return (
    <div className="rounded-[22px] bg-[#151720] p-3.5 opacity-60">
      <div className="mb-2.5 flex items-center gap-2"><span className="h-7 w-7 rounded-full bg-white/10" /><span className="h-2.5 w-24 rounded bg-white/10" /></div>
      <div className="mb-1.5 h-3 w-[85%] rounded bg-white/15" /><div className="mb-3 h-3 w-[60%] rounded bg-white/15" />
      <div className="grid grid-cols-2 gap-2"><span className="h-10 rounded-xl bg-white/[0.06]" /><span className="h-10 rounded-xl bg-white/[0.06]" /></div>
    </div>
  );
}

// ------------------------------------------------------------------ table --

export function CampaignTable({ rows, onOpen, showAdvertiser = true }: { rows: Campaign[]; onOpen: (c: Campaign) => void; showAdvertiser?: boolean }) {
  if (!rows.length) return <Empty>No campaigns.</Empty>;
  return (
    <Table>
      <thead><tr>
        <Th>Campaign</Th>{showAdvertiser && <Th>Advertiser</Th>}<Th>Type</Th><Th>Dates</Th><Th>Status</Th><Th>Priority</Th>
        <Th right>Purchased</Th><Th right>Delivered</Th><Th right>Remaining</Th><Th right>Clicks</Th><Th right>CTR</Th><Th>Delivery</Th>
      </tr></thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.id} onClick={() => onOpen(c)} className="cursor-pointer hover:bg-white/[0.025]">
            <Td><div className="max-w-[260px] truncate font-medium">{c.question ?? c.banner}</div><div className="font-mono text-[11px] text-[#6f6680]">{c.id.slice(0, 8)}</div></Td>
            {showAdvertiser && <Td className="whitespace-nowrap"><span className="mr-1.5">{c.logo.startsWith("http") ? "▣" : c.logo}</span>{c.advertiser}</Td>}
            <Td className="whitespace-nowrap text-[#c9c1d6]">{TYPE_LABEL[c.type]}</Td>
            <Td className="whitespace-nowrap text-[#c9c1d6]">{shortDate(c.startsAt)} – {shortDate(c.endsAt)}</Td>
            <Td><StatePill state={c.state} /></Td>
            <Td><PriorityPill p={c.priority} /></Td>
            <Td right>{n(c.purchased)}</Td>
            <Td right>{n(c.delivered)}</Td>
            <Td right>{n(c.remaining)}</Td>
            <Td right>{n(c.clicks)}</Td>
            <Td right>{pct(c.ctr, 2)}</Td>
            <Td className="min-w-[130px]">
              <div className="mb-1 tabular text-[11.5px] text-[#c9c1d6]">{pct(c.deliveryPct, 0)}</div>
              <DeliveryMeter delivered={c.delivered} purchased={c.purchased} expectedPct={c.expectedPct} state={c.state} />
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

// ---------------------------------------------------------------- section --

export function CampaignsSection() {
  const { params, go, bump } = useAdmin();
  const [type, setType] = useState<"all" | "banner" | "card">("all");
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 150);
  const [inner, setInner] = useState(0);
  const { data, error, reload } = useLoad(() => api.campaigns(), [bump, inner]);
  const [editing, setEditing] = useState<Campaign | "new" | null>(null);
  const rows = useMemo(() => (data ?? []).filter((c) =>
    (type === "all" || c.type === type || c.type === "both") &&
    (!dq || `${c.advertiser} ${c.question ?? ""} ${c.banner ?? ""} ${c.id}`.toLowerCase().includes(dq.toLowerCase()))), [data, type, dq]);
  const openId = params.id ?? null;
  const count = (t: "banner" | "card") => (data ?? []).filter((c) => c.type === t || c.type === "both").length;

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-3 p-5">
          <Tabs value={type} onChange={setType} items={[
            { value: "all", label: "All", count: data?.length }, { value: "banner", label: "Banner", count: count("banner") }, { value: "card", label: "Sponsored cards", count: count("card") }]} />
          <Input icon={<Search size={15} />} placeholder="Search campaigns" value={q} onChange={(e) => setQ(e.target.value)} className="w-full max-w-[280px]" />
          <div className="flex-1" />
          <Button tone="primary" onClick={() => setEditing("new")}><Plus size={15} /> New campaign</Button>
        </div>
        {error ? <ErrorBox error={error} retry={reload} /> : !data ? <Spinner /> : <CampaignTable rows={rows} onOpen={(c) => go("campaigns", { id: c.id })} />}
      </Card>
      <CampaignDrawer id={openId} onClose={() => go("campaigns")} onChanged={() => setInner((x) => x + 1)} onEdit={(c) => setEditing(c)} />
      {editing && <CampaignEditor campaign={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={(id) => { setInner((x) => x + 1); go("campaigns", { id }); }} />}
    </>
  );
}

export function CampaignDrawer({ id, onClose, onChanged, onEdit }: { id: string | null; onClose: () => void; onChanged?: () => void; onEdit?: (c: Campaign) => void }) {
  return <Drawer open={!!id} onClose={onClose} width={900}>{id && <CampaignDetail key={id} id={id} onChanged={onChanged} onEdit={onEdit} />}</Drawer>;
}

function CampaignDetail({ id, onChanged, onEdit }: { id: string; onChanged?: () => void; onEdit?: (c: Campaign) => void }) {
  const { bump } = useAdmin();
  const [v, setV] = useState(0);
  const all = useLoad(() => api.campaigns(), [bump, v]);
  const daily = useLoad(() => api.campaignDaily(id, 30), [id, bump, v]);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [dates, setDates] = useState(false);
  const c = all.data?.find((x) => x.id === id);
  const changed = () => { setV((x) => x + 1); onChanged?.(); };

  if (all.error) return <ErrorBox error={all.error} retry={all.reload} />;
  if (!all.data) return <Spinner />;
  if (!c) return <Empty>Campaign not found.</Empty>;
  const canceled = c.status === "canceled";
  const title = c.question ?? c.banner ?? "Campaign";

  const status = (s: Campaign["status"]): ConfirmSpec => ({
    title: s === "active" ? "Resume this campaign?" : s === "paused" ? "Pause this campaign?" : "Cancel this campaign?",
    body: <p>{s === "active" ? "It becomes eligible for placements again right away (dates, caps and pacing still apply)." : s === "paused" ? "It stops showing immediately. Delivered impressions and history are kept, and you can resume it any time." : "Canceling is permanent: the campaign stops for good and can’t be resumed. Its history and reporting are kept."}</p>,
    confirmLabel: s === "active" ? "Resume" : s === "paused" ? "Pause campaign" : "Cancel campaign",
    tone: s === "canceled" ? "danger" : s === "paused" ? "warn" : "primary",
    reason: s === "active" ? "optional" : "required",
    done: s === "active" ? "Campaign resumed" : s === "paused" ? "Campaign paused" : "Campaign canceled",
    run: (r) => api.setCampaignStatus(c.id, s, r || null),
  });
  const priority = (p: Priority): ConfirmSpec => ({
    title: `Set priority to ${p}?`,
    body: (
      <div className="flex flex-col gap-3">
        <DiffRows rows={[{ label: "Priority", before: c.priority, after: p, emphasize: true }]} />
        <p className="text-[12.5px] text-[#a79db5]">Priority gives this campaign {p === "urgent" ? "4×" : p === "high" ? "2×" : "normal"} weight when several eligible campaigns compete for the same placement. It never overrides dates, remaining impressions, even pacing, advertiser status or anyone’s frequency caps. The purchased campaign is unchanged.</p>
      </div>
    ),
    confirmLabel: "Change priority", reason: "optional", done: "Priority updated",
    run: (r) => api.setCampaignPriority(c.id, p, r || null),
  });

  return (
    <div>
      <div className="border-b border-white/[0.06] px-7 pb-5 pt-8">
        <div className="flex items-center gap-2 text-[12.5px] text-[#a79db5]"><span>{c.logo.startsWith("http") ? "▣" : c.logo}</span>{c.advertiser} · {TYPE_LABEL[c.type]}</div>
        <h2 className="mt-1 pr-10 font-display text-[22px] font-bold leading-tight tracking-[-0.02em]">{title}</h2>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <StatePill state={c.state} /><PriorityPill p={c.priority} />
          {c.advertiserStatus !== "active" && <Pill tone="warn">Advertiser {c.advertiserStatus}</Pill>}
        </div>
        {!canceled && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {c.status === "active"
              ? <Button size="sm" tone="warn" onClick={() => setConfirm(status("paused"))}><Pause size={14} /> Pause</Button>
              : <Button size="sm" tone="primary" onClick={() => setConfirm(status("active"))}><Play size={14} /> Resume</Button>}
            <Button size="sm" onClick={() => setDates(true)}><CalendarDays size={14} /> Edit dates</Button>
            <Button size="sm" onClick={() => onEdit?.(c)}><Pencil size={14} /> Edit creative</Button>
            <Button size="sm" tone="danger" onClick={() => setConfirm(status("canceled"))}><XCircle size={14} /> Cancel</Button>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[12px] text-[#8a8099]">Priority</span>
              <Tabs value={c.priority} onChange={(p) => p !== c.priority && setConfirm(priority(p))}
                items={[{ value: "normal" as Priority, label: "Normal" }, { value: "high" as Priority, label: "High" }, { value: "urgent" as Priority, label: "Urgent" }]} />
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 px-7 py-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div>
          <AdPreview ad={toAd(c)} />
          <p className="mt-3 text-center text-[11.5px] text-[#8a8099]">Rendered with the app’s own ad components.</p>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Metric k="Purchased" v={n(c.purchased)} />
            <Metric k="Delivered" v={n(c.delivered)} s={`${n(c.cardImpressions)} card · ${n(c.bannerImpressions)} banner`} />
            <Metric k="Remaining" v={n(c.remaining)} />
            <Metric k="Expected by now" v={n(c.expectedNow)} s={`${pct(c.expectedPct, 0)} of the run elapsed`} />
            <Metric k="Pace" v={pct(c.pacePct, 0)} s={c.diffPct >= 0 ? `${c.diffPct.toFixed(1)} pts ahead` : `${Math.abs(c.diffPct).toFixed(1)} pts behind`} />
            <Metric k="Clicks · CTR" v={n(c.clicks)} s={pct(c.ctr, 2)} />
            <Metric k="Daily average" v={n(c.dailyAvg)} />
            <Metric k="Needed per day" v={n(c.requiredDaily)} s={c.daysLeft ? `${c.daysLeft} days left` : "Ended"} />
            <Metric k="Est. completion" v={c.remaining === 0 ? "Done" : c.estCompletion ? shortDate(c.estCompletion) : "—"} s={c.estCompletion && new Date(c.estCompletion) > new Date(c.endsAt) ? "After the end date" : undefined} />
          </div>
          <div>
            <div className="mb-1.5 flex justify-between text-[12px] text-[#a79db5]"><span>Delivery {pct(c.deliveryPct, 1)}</span><span>{date(c.startsAt)} – {date(c.endsAt)}</span></div>
            <DeliveryMeter delivered={c.delivered} purchased={c.purchased} expectedPct={c.expectedPct} state={c.state} />
          </div>
          <div className="rounded-2xl border border-white/[0.06] p-4">
            <div className="mb-2 text-[13px] font-semibold">Last 30 days</div>
            {daily.data ? <BarChart height={170} days={daily.data.map((d) => d.day)} series={[
              ...(c.type !== "banner" ? [{ name: "Card impressions", values: daily.data.map((d) => d.cardImpressions) }] : []),
              ...(c.type !== "card" ? [{ name: "Banner impressions", values: daily.data.map((d) => d.bannerImpressions), color: "#d2702a" }] : []),
            ]} /> : <Spinner />}
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px]">
            <KV k="Campaign ID" v={c.id} mono /><KV k="Created" v={dateTime(c.createdAt)} />
            <KV k="Link" v={c.url || "—"} /><KV k="Reach" v={`${n(c.reach)} ${c.reach === 1 ? "person" : "people"}`} />
          </div>
        </div>
      </div>
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} onDone={changed} />
      {dates && <DatesDialog c={c} onClose={() => setDates(false)} onDone={changed} />}
    </div>
  );
}

const Metric = ({ k, v, s }: { k: string; v: string; s?: string }) => (
  <div className="rounded-2xl bg-white/[0.03] p-3 ring-1 ring-inset ring-white/[0.05]">
    <div className="text-[11.5px] text-[#a79db5]">{k}</div>
    <div className="tabular font-display text-[20px] font-bold leading-tight">{v}</div>
    {s && <div className="truncate text-[11.5px] text-[#8a8099]">{s}</div>}
  </div>
);
const KV = ({ k, v, mono }: { k: string; v: string; mono?: boolean }) => (
  <div className="flex min-w-0 justify-between gap-2 border-b border-white/[0.04] py-1.5"><span className="shrink-0 text-[#8a8099]">{k}</span><span className={cx("truncate text-right text-[#e7dfef]", mono && "font-mono text-[11.5px]")}>{v}</span></div>
);

const toLocal = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

function DatesDialog({ c, onClose, onDone }: { c: Campaign; onClose: () => void; onDone: () => void }) {
  const [start, setStart] = useState(toLocal(c.startsAt));
  const [end, setEnd] = useState(toLocal(c.endsAt));
  const [spec, setSpec] = useState<ConfirmSpec | null>(null);
  const s = new Date(start), e = new Date(end);
  const days = (e.getTime() - s.getTime()) / 86400000;
  const bad = !(days >= 1) ? "The campaign has to run at least a day" : days > 120 ? "Campaigns can run at most 120 days" : null;
  if (spec) return <ConfirmDialog spec={spec} onClose={onClose} onDone={onDone} />;
  return (
    <Modal open onClose={onClose} title="Edit campaign dates" sub="Purchased impressions stay the same; pacing spreads them over the new dates."
      footer={<><Button tone="ghost" onClick={onClose}>Cancel</Button><Button tone="primary" disabled={!!bad} onClick={() => setSpec({
        title: "Change campaign dates?",
        body: <DiffRows rows={[{ label: "Starts", before: dateTime(c.startsAt), after: dateTime(s.toISOString()) }, { label: "Ends", before: dateTime(c.endsAt), after: dateTime(e.toISOString()), emphasize: true }]} />,
        confirmLabel: "Save dates", done: "Dates updated", reasonPresets: ["Make-good extension", "Advertiser request", "Launch moved"],
        run: (r) => api.setCampaignDates(c.id, s.toISOString(), e.toISOString(), r),
      })}>Review</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start"><Input type="datetime-local" value={start} onChange={(ev) => setStart(ev.target.value)} /></Field>
        <Field label="End"><Input type="datetime-local" value={end} onChange={(ev) => setEnd(ev.target.value)} /></Field>
      </div>
      <p className={cx("mt-3 text-[12.5px]", bad ? "text-[#ffd889]" : "text-[#a79db5]")}>{bad ?? `${days.toFixed(1)} days · ${n(c.remaining)} impressions left to deliver`}</p>
    </Modal>
  );
}

// ----------------------------------------------------------------- editor --

export function CampaignEditor({ campaign, advertiserId, onClose, onSaved }: { campaign: Campaign | null; advertiserId?: string; onClose: () => void; onSaved: (id: string) => void }) {
  const { isSuper } = useAdmin();
  const toast = useToast();
  const advs = useLoad(() => api.advertisers(), []);
  const [f, setF] = useState(() => ({
    advertiserId: campaign?.advertiserId ?? advertiserId ?? "",
    logo: campaign?.logo ?? "📣", tint: campaign?.tint ?? "#8247FF", url: campaign?.url ?? "", domain: campaign?.domain ?? "",
    hasCard: campaign ? !!campaign.question : true, hasBanner: campaign ? !!campaign.banner : true,
    question: campaign?.question ?? "", o1: campaign?.options?.[0]?.label ?? "", s1: campaign?.options?.[0]?.sub ?? "",
    o2: campaign?.options?.[1]?.label ?? "", s2: campaign?.options?.[1]?.sub ?? "", cta: campaign?.cta ?? "Learn more", banner: campaign?.banner ?? "",
    purchased: String(campaign?.purchased ?? 1000), durationDays: String(campaign?.durationDays ?? 7),
    startsAt: campaign ? toLocal(campaign.startsAt) : toLocal(new Date().toISOString()),
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  useEffect(() => {
    if (!f.advertiserId && advs.data?.length) setF((x) => ({ ...x, advertiserId: advs.data![0].id }));
  }, [advs.data, f.advertiserId]);
  const adv = advs.data?.find((a) => a.id === f.advertiserId);
  const termsLocked = !!campaign && !isSuper;
  const ad: Ad = {
    id: "preview", sponsor: adv?.name ?? "Advertiser", logo: f.logo || "📣", tint: f.tint, url: f.url, domain: f.domain,
    question: f.hasCard ? f.question || "Your question here" : null, options: [{ label: f.o1 || "Option A", sub: f.s1 }, { label: f.o2 || "Option B", sub: f.s2 }],
    cta: f.cta, banner: f.hasBanner ? f.banner || "Your banner line here" : null,
  };
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const id = await api.saveCampaign({
        id: campaign?.id, advertiserId: f.advertiserId, logo: f.logo, tint: f.tint, url: f.url, domain: f.domain,
        question: f.hasCard ? f.question : null, options: f.hasCard ? [{ label: f.o1, sub: f.s1 }, { label: f.o2, sub: f.s2 }] : [],
        cta: f.cta, banner: f.hasBanner ? f.banner : null, purchased: Number(f.purchased), durationDays: Number(f.durationDays),
        ...(campaign ? {} : { startsAt: new Date(f.startsAt).toISOString() }),
      });
      toast("ok", campaign ? "Campaign updated" : "Campaign created");
      onSaved(id);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <Modal open wide onClose={() => !busy && onClose()} title={campaign ? "Edit campaign creative" : "New campaign"} sub="The preview on the right is the app’s real ad component."
      footer={<><Button tone="ghost" onClick={onClose} disabled={busy}>Cancel</Button><Button tone="primary" onClick={save} busy={busy}>{campaign ? "Save changes" : "Create campaign"}</Button></>}>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px_90px]">
            <Field label="Advertiser"><Select value={f.advertiserId} onChange={(v) => setF((x) => ({ ...x, advertiserId: v }))} options={(advs.data ?? []).map((a: Advertiser) => ({ value: a.id, label: a.name + (a.status !== "active" ? ` (${a.status})` : "") }))} /></Field>
            <Field label="Logo"><Input value={f.logo} onChange={set("logo")} placeholder="emoji or https://" /></Field>
            <Field label="Tint"><input type="color" value={f.tint} onChange={set("tint")} className="h-10 w-full cursor-pointer rounded-xl bg-white/[0.04] p-1 ring-1 ring-inset ring-white/[0.07]" /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Link (https://…)"><Input value={f.url} onChange={set("url")} placeholder="https://" /></Field>
            <Field label="Domain shown on the card"><Input value={f.domain} onChange={set("domain")} placeholder="example.com" /></Field>
          </div>
          <Toggle label="Sponsored feed card" on={f.hasCard} onChange={(v) => setF((x) => ({ ...x, hasCard: v }))} />
          {f.hasCard && (
            <div className="flex flex-col gap-3 rounded-2xl bg-white/[0.025] p-3.5 ring-1 ring-inset ring-white/[0.05]">
              <Field label="Headline question"><TextArea className="min-h-[56px]" value={f.question} onChange={set("question")} maxLength={120} placeholder="Front door this season: wreath or bare?" /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Option 1"><Input value={f.o1} onChange={set("o1")} placeholder="Label" /><Input value={f.s1} onChange={set("s1")} placeholder="Description" /></Field>
                <Field label="Option 2"><Input value={f.o2} onChange={set("o2")} placeholder="Label" /><Input value={f.s2} onChange={set("s2")} placeholder="Description" /></Field>
              </div>
              <Field label="Call-to-action button"><Input value={f.cta} onChange={set("cta")} maxLength={24} /></Field>
            </div>
          )}
          <Toggle label="Discover banner" on={f.hasBanner} onChange={(v) => setF((x) => ({ ...x, hasBanner: v }))} />
          {f.hasBanner && <Field label="Banner line" hint={`${f.banner.length}/90`}><Input value={f.banner} onChange={set("banner")} maxLength={90} placeholder="One line for the Discover banner" /></Field>}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Impressions purchased"><Select value={f.purchased} onChange={(v) => !termsLocked && setF((x) => ({ ...x, purchased: v }))} options={["1000", "3000", "5000", "10000"].map((v) => ({ value: v, label: n(Number(v)) }))} className={termsLocked ? "opacity-50" : ""} /></Field>
            <Field label="Duration"><Select value={f.durationDays} onChange={(v) => !termsLocked && setF((x) => ({ ...x, durationDays: v }))} options={["7", "14", "30"].map((v) => ({ value: v, label: `${v} days` }))} className={termsLocked ? "opacity-50" : ""} /></Field>
            {!campaign && <Field label="Starts"><Input type="datetime-local" value={f.startsAt} onChange={set("startsAt")} /></Field>}
          </div>
          {termsLocked && <p className="text-[12px] text-[#8a8099]">Only a super admin can change purchased impressions or duration on an existing campaign. Use Edit dates to move the schedule.</p>}
          <p className="text-[12px] text-[#8a8099]">The app’s ad slots show a logo (emoji or image URL), a headline, two options and a button; there’s no separate ad image slot today.</p>
          {err && <p className="rounded-xl bg-[#ff5d73]/10 p-3 text-[12.5px] text-[#ffb3be] ring-1 ring-inset ring-[#ff5d73]/25">{err}</p>}
        </div>
        <div className="md:sticky md:top-0 md:self-start"><AdPreview ad={ad} /></div>
      </div>
    </Modal>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3.5 py-2.5 text-[13px] ring-1 ring-inset ring-white/[0.06]">
      <span className="font-medium">{label}</span>
      <span className={cx("relative h-6 w-10 rounded-full transition", on ? "bg-[#8247ff]" : "bg-white/[0.12]")}><span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all", on ? "left-[18px]" : "left-0.5")} /></span>
    </button>
  );
}

