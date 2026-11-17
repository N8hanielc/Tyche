"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronsUp } from "lucide-react";
import { api, type Campaign, type CampaignState, type Priority } from "../api";
import { useAdmin } from "../AdminApp";
import {
  Button, Card, ConfirmDialog, DeliveryMeter, DiffRows, Empty, ErrorBox, Input, Select, Spinner, STATE_META, StatePill, Table, Td, Th,
  cx, n, pct, shortDate, useLoad, type ConfirmSpec,
} from "../ui";
import { CampaignDrawer, TYPE_LABEL } from "./Campaigns";

const ORDER: CampaignState[] = ["underdelivering", "slightly_behind", "on_track", "scheduled", "paused", "completed", "expired", "canceled"];
const NEXT: Record<Priority, Priority | null> = { normal: "high", high: "urgent", urgent: null };

export function PerformanceSection() {
  const { params, go, bump } = useAdmin();
  const [inner, setInner] = useState(0);
  const { data, error, reload } = useLoad(() => api.campaigns(), [bump, inner]);
  const [state, setState] = useState<string>(params.state ?? "");
  const [type, setType] = useState("");
  const [adv, setAdv] = useState("");
  const [minPct, setMinPct] = useState("");
  const [maxPct, setMaxPct] = useState("");
  const [endBefore, setEndBefore] = useState("");
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const counts = useMemo(() => Object.fromEntries(ORDER.map((s) => [s, (data ?? []).filter((c) => c.state === s).length])), [data]);
  const advertisers = useMemo(() => [...new Set((data ?? []).map((c) => c.advertiser))].sort(), [data]);
  const rows = useMemo(() => (data ?? [])
    .filter((c) => (!state || c.state === state) && (!type || c.type === type || (type !== "both" && c.type === "both")) && (!adv || c.advertiser === adv)
      && (minPct === "" || c.deliveryPct >= Number(minPct)) && (maxPct === "" || c.deliveryPct <= Number(maxPct))
      && (!endBefore || new Date(c.endsAt) <= new Date(endBefore + "T23:59:59")))
    .sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state) || (a.pacePct ?? 999) - (b.pacePct ?? 999)), [data, state, type, adv, minPct, maxPct, endBefore]);

  const boost = (c: Campaign): ConfirmSpec => {
    const to = NEXT[c.priority]!;
    return {
      title: `Raise priority to ${to}?`,
      body: (
        <div className="flex flex-col gap-3">
          <DiffRows rows={[{ label: "Campaign", after: c.question ?? c.banner ?? c.id }, { label: "Pace", after: pct(c.pacePct, 0) }, { label: "Priority", before: c.priority, after: to, emphasize: true }]} />
          <p className="text-[12.5px] text-[#a79db5]">Higher priority wins more of the placements this campaign is already eligible for. It can’t exceed anyone’s frequency caps, run past its dates, or deliver more than was purchased, so if the shortfall is from too little inventory, priority alone may not close it.</p>
        </div>
      ),
      confirmLabel: `Set ${to}`, reason: "optional", reasonPresets: ["Underdelivering", "Make-good"], done: "Priority raised",
      run: (r) => api.setCampaignPriority(c.id, to, r || "Underdelivering"),
    };
  };

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {ORDER.map((s) => (
          <button key={s} onClick={() => setState(state === s ? "" : s)}
            className={cx("rounded-[18px] border p-3.5 text-left transition", state === s ? "border-[#8247ff]/60 bg-[#8247ff]/12" : "border-white/[0.06] bg-[#140f1b] hover:border-white/[0.12]")}>
            <StatePill state={s} />
            <div className="tabular mt-2 font-display text-[24px] font-bold leading-none">{counts[s] ?? 0}</div>
          </button>
        ))}
      </div>
      <Card>
        <div className="flex flex-wrap items-end gap-3 p-5">
          <Select label="Type" value={type} onChange={setType} options={[{ value: "", label: "All types" }, { value: "banner", label: "Banner" }, { value: "card", label: "Sponsored card" }, { value: "both", label: "Banner + card only" }]} />
          <Select label="Advertiser" value={adv} onChange={setAdv} options={[{ value: "", label: "All advertisers" }, ...advertisers.map((a) => ({ value: a, label: a }))]} />
          <Select label="Status" value={state} onChange={setState} options={[{ value: "", label: "All statuses" }, ...ORDER.map((s) => ({ value: s, label: STATE_META[s].label }))]} />
          <div className="flex items-center gap-1.5 text-[12px] text-[#8a8099]">Delivery
            <Input inputMode="numeric" placeholder="min %" value={minPct} onChange={(e) => setMinPct(e.target.value.replace(/\D/g, ""))} className="w-[76px]" />–
            <Input inputMode="numeric" placeholder="max %" value={maxPct} onChange={(e) => setMaxPct(e.target.value.replace(/\D/g, ""))} className="w-[76px]" />
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-[#8a8099]">Ends by <Input type="date" value={endBefore} onChange={(e) => setEndBefore(e.target.value)} className="w-[150px]" /></div>
          {(state || type || adv || minPct || maxPct || endBefore) && <Button tone="ghost" size="sm" onClick={() => { setState(""); setType(""); setAdv(""); setMinPct(""); setMaxPct(""); setEndBefore(""); }}>Clear</Button>}
        </div>
        <p className="px-5 pb-3 text-[12px] text-[#8a8099]">
          Expected by now = purchased × share of the run elapsed. On track ≥ 95% of expected · Slightly behind 85–94% · Underdelivering &lt; 85%.
        </p>
        {error ? <ErrorBox error={error} retry={reload} /> : !data ? <Spinner /> : !rows.length ? <Empty>No campaigns match these filters.</Empty> : (
          <Table className="[&_table]:min-w-[1320px]">
            <thead><tr>
              <Th>Campaign</Th><Th>Status</Th><Th>Type</Th><Th>Run</Th><Th right>Purchased</Th><Th right>Expected now</Th><Th right>Delivered</Th><Th right>Remaining</Th>
              <Th right>Delivery</Th><Th right>Pace</Th><Th right>Daily avg</Th><Th right>Needed/day</Th><Th>Est. completion</Th><Th />
            </tr></thead>
            <tbody>
              {rows.map((c) => {
                const late = c.estCompletion && c.remaining > 0 && new Date(c.estCompletion) > new Date(c.endsAt);
                const warn = c.state === "underdelivering";
                return (
                  <tr key={c.id} className={cx("cursor-pointer hover:bg-white/[0.025]", warn && "bg-[#ff5d73]/[0.035]")} onClick={() => setOpen(c.id)}>
                    <Td className="max-w-[240px]">
                      <div className="flex items-center gap-2">
                        {warn && <AlertTriangle size={15} className="shrink-0 text-[#ff8a9a]" aria-label="Significantly behind" />}
                        <div className="min-w-0 max-w-[220px]"><div className="truncate font-medium">{c.advertiser}</div><div className="truncate text-[12px] text-[#8a8099]">{c.question ?? c.banner}</div></div>
                      </div>
                    </Td>
                    <Td><StatePill state={c.state} /></Td>
                    <Td className="whitespace-nowrap text-[#c9c1d6]">{TYPE_LABEL[c.type]}</Td>
                    <Td className="whitespace-nowrap text-[#c9c1d6]">{shortDate(c.startsAt)} – {shortDate(c.endsAt)}<div className="text-[11.5px] text-[#8a8099]">{Math.round((new Date(c.endsAt).getTime() - new Date(c.startsAt).getTime()) / 86400000)} days</div></Td>
                    <Td right>{n(c.purchased)}</Td>
                    <Td right className="text-[#c9c1d6]">{n(c.expectedNow)}</Td>
                    <Td right className="font-semibold">{n(c.delivered)}</Td>
                    <Td right>{n(c.remaining)}</Td>
                    <Td right className="min-w-[110px]">
                      <div>{pct(c.deliveryPct, 1)} <span className={cx("text-[11.5px]", c.diffPct < 0 ? "text-[#ff8a9a]" : "text-[#7beab8]")}>{c.diffPct >= 0 ? "+" : ""}{c.diffPct.toFixed(1)}</span></div>
                      <div className="mt-1"><DeliveryMeter delivered={c.delivered} purchased={c.purchased} expectedPct={c.expectedPct} state={c.state} /></div>
                    </Td>
                    <Td right className={cx(c.state === "underdelivering" ? "text-[#ff8a9a]" : c.state === "slightly_behind" ? "text-[#ffd889]" : "")}>{pct(c.pacePct, 0)}</Td>
                    <Td right>{n(c.dailyAvg)}</Td>
                    <Td right>{n(c.requiredDaily)}</Td>
                    <Td className={cx("whitespace-nowrap", late ? "text-[#ff8a9a]" : "text-[#c9c1d6]")}>{c.remaining === 0 ? "Done" : c.estCompletion ? shortDate(c.estCompletion) : "—"}{late && <div className="text-[11px]">after end date</div>}</Td>
                    <Td>
                      <div onClick={(e) => e.stopPropagation()}>
                        {(c.state === "underdelivering" || c.state === "slightly_behind") && NEXT[c.priority] && (
                          <Button size="sm" tone="primary" onClick={() => setConfirm(boost(c))} title="Raise priority"><ChevronsUp size={14} /> Boost</Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} onDone={() => setInner((x) => x + 1)} />
      <CampaignDrawer id={open} onClose={() => setOpen(null)} onChanged={() => setInner((x) => x + 1)} onEdit={() => go("campaigns", { id: open ?? "" })} />
    </>
  );
}
