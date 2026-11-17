"use client";

import { useState } from "react";
import {
  Activity, AlertTriangle, ArrowUpRight, BadgeCheck, Building2, Coins, Eye, LayoutPanelTop, Megaphone, MousePointerClick, Sparkles, Users, UserCheck,
} from "lucide-react";
import { api } from "../api";
import { useAdmin } from "../AdminApp";
import { BarChart, LineChart, SERIES, Sparkline } from "../charts";
import { Card, CardHeader, DeliveryMeter, Empty, ErrorBox, Spinner, Stat, StatePill, Tabs, compact, date, n, pct, useLoad } from "../ui";

export function Overview() {
  const { bump, go } = useAdmin();
  const [days, setDays] = useState<"30" | "90">("30");
  const { data, error, loading, reload } = useLoad(() => api.overview(Number(days)), [days, bump]);
  const [pointsView, setPointsView] = useState<"admin" | "claims">("admin");

  if (error && !data) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Spinner />;
  const k = data.kpis;
  const s = data.series;
  const dayKeys = s.map((d) => d.day);
  const last7 = s.slice(-7);
  const imp7 = last7.reduce((a, d) => a + d.bannerImpressions + d.cardImpressions, 0);
  const clicks7 = last7.reduce((a, d) => a + d.clicks, 0);
  const ctr = k.impressions ? (100 * k.clicks) / k.impressions : null;
  const circulation = k.pointsBalances + k.pointsStaked;

  return (
    <div className={loading ? "opacity-80 transition-opacity" : "transition-opacity"}>
      {/* hero row */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card glow="plum" className="min-h-[340px]">
          <div className="flex flex-wrap items-start justify-between gap-4 px-6 pt-6">
            <div>
              <div className="text-[13px] text-[#c9c1d6]">Registered users</div>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="font-display text-[44px] font-bold leading-none tracking-[-0.03em]">{n(k.users)}</span>
                <span className="inline-flex items-center gap-1 rounded-lg bg-[#3ddc97]/12 px-2 py-0.5 text-[12.5px] font-semibold text-[#7beab8]">
                  <ArrowUpRight size={14} /> {n(k.usersNew7d)} this week
                </span>
              </div>
              <div className="mt-2 text-[12.5px] text-[#a79db5]">
                <span className="text-white">{n(k.dau)}</span> active today · <span className="text-white">{n(k.mau)}</span> in the last 30 days
              </div>
            </div>
            <Tabs value={days} onChange={setDays} items={[{ value: "30", label: "30 days" }, { value: "90", label: "90 days" }]} />
          </div>
          <div className="px-4 pb-4 pt-3">
            <LineChart days={dayKeys} series={[{ name: "Total users", values: s.map((d) => d.totalUsers) }]} height={230} />
          </div>
        </Card>

        <Card glow="copper" className="flex flex-col">
          <CardHeader title="Advertising" sub="All-time delivery"
            right={<button onClick={() => go("performance")} className="rounded-lg bg-white/[0.07] px-2.5 py-1 text-[12px] text-[#e7dfef] hover:bg-white/[0.12]">Performance</button>} />
          <div className="grid grid-cols-2 gap-3 px-5 pt-4">
            <div>
              <div className="text-[12px] text-[#c9c1d6]">Impressions</div>
              <div className="tabular font-display text-[28px] font-bold leading-tight">{compact(k.impressions)}</div>
              <div className="text-[11.5px] text-[#a79db5]">{compact(imp7)} last 7 days</div>
            </div>
            <div>
              <div className="text-[12px] text-[#c9c1d6]">Clicks · CTR</div>
              <div className="tabular font-display text-[28px] font-bold leading-tight">{compact(k.clicks)}</div>
              <div className="text-[11.5px] text-[#a79db5]">{pct(ctr, 2)} · {compact(clicks7)} last 7 days</div>
            </div>
          </div>
          {k.underdelivering > 0 ? (
            <button onClick={() => go("performance", { state: "underdelivering" })}
              className="mx-5 mt-4 flex items-center gap-2.5 rounded-2xl bg-[#ff5d73]/12 px-3.5 py-2.5 text-left text-[12.5px] text-[#ffb3be] ring-1 ring-inset ring-[#ff5d73]/25 hover:bg-[#ff5d73]/18">
              <AlertTriangle size={16} className="shrink-0" />
              <span className="flex-1"><b className="text-white">{k.underdelivering}</b> campaign{k.underdelivering === 1 ? " is" : "s are"} underdelivering</span>
              <ArrowUpRight size={15} />
            </button>
          ) : (
            <div className="mx-5 mt-4 flex items-center gap-2.5 rounded-2xl bg-[#3ddc97]/10 px-3.5 py-2.5 text-[12.5px] text-[#a9f0cf] ring-1 ring-inset ring-[#3ddc97]/20">
              <Sparkles size={16} /> Every running campaign is on pace{k.slightlyBehind ? ` (${k.slightlyBehind} slightly behind)` : ""}
            </div>
          )}
          <div className="mt-4 flex-1 px-5 pb-5">
            <div className="mb-2 flex items-center justify-between text-[12px] text-[#a79db5]">
              <span>Running campaigns</span><span>{data.campaigns.length}</span>
            </div>
            <div className="flex flex-col gap-3">
              {data.campaigns.slice(0, 4).map((c) => (
                <button key={c.id} onClick={() => go("campaigns", { id: c.id })} className="flex flex-col gap-1.5 text-left">
                  <div className="flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="truncate"><span className="mr-1.5">{c.logo.startsWith("http") ? "▣" : c.logo}</span>{c.advertiser}</span>
                    <span className="tabular shrink-0 text-[#c9c1d6]">{pct(c.deliveryPct, 0)}</span>
                  </div>
                  <DeliveryMeter delivered={c.delivered} purchased={c.purchased} expectedPct={c.expectedPct} state={c.state} />
                </button>
              ))}
              {!data.campaigns.length && <div className="text-[12.5px] text-[#8a8099]">No campaigns running.</div>}
            </div>
          </div>
        </Card>
      </div>

      {/* KPI tiles */}
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <Stat label="Total users" value={n(k.users)} sub={`+${n(k.usersNew7d)} in 7 days`} icon={<Users size={15} />} />
        <Stat label="Daily active" value={n(k.dau)} sub={<Sparkline values={s.slice(-14).map((d) => d.dau)} width={90} height={18} />} icon={<Activity size={15} />} />
        <Stat label="Monthly active" value={n(k.mau)} sub={`${pct(k.users ? (100 * k.mau) / k.users : null, 0)} of users`} icon={<UserCheck size={15} />} />
        <Stat label="Points in circulation" value={compact(circulation)} sub={`${compact(k.pointsBalances)} in balances · ${compact(k.pointsStaked)} staked`} icon={<Coins size={15} />} />
        <Stat label="Issued by admins" value={compact(k.pointsAdminIssued)} sub={`${compact(k.pointsAdminDeducted)} deducted`} icon={<Sparkles size={15} />} />
        <Stat label="Verified accounts" value={n(k.verified)} sub={`${n(k.suspended)} suspended · ${n(k.flagged)} flagged`} icon={<BadgeCheck size={15} />} />
        <Stat label="Active advertisers" value={n(k.advertisersActive)} sub={`${n(k.advertisersTotal)} total`} icon={<Building2 size={15} />} />
        <Stat label="Banner campaigns live" value={n(k.bannerCampaignsActive)} icon={<LayoutPanelTop size={15} />} />
        <Stat label="Card campaigns live" value={n(k.cardCampaignsActive)} icon={<Megaphone size={15} />} />
        <Stat label="Ad impressions" value={compact(k.impressions)} sub="Viewable, all time" icon={<Eye size={15} />} />
        <Stat label="Ad clicks" value={compact(k.clicks)} sub={`CTR ${pct(ctr, 2)}`} icon={<MousePointerClick size={15} />} />
        <Stat label="Underdelivering" value={n(k.underdelivering)} sub={`${n(k.slightlyBehind)} slightly behind`} icon={<AlertTriangle size={15} />} tone={k.underdelivering ? "bad" : undefined} />
      </div>

      {/* charts */}
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Daily and monthly active users" sub="People who opened the app (UTC days)" />
          <div className="p-4 pt-3">
            <LineChart days={dayKeys} series={[{ name: "Daily active", values: s.map((d) => d.dau) }, { name: "Monthly active (rolling 30d)", values: s.map((d) => d.mau) }]} area={false} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Points issued" sub={pointsView === "admin" ? "Issued by admins per day" : "Daily refills claimed per day"}
            right={<Tabs value={pointsView} onChange={setPointsView} items={[{ value: "admin", label: "Admin" }, { value: "claims", label: "Daily refills" }]} />} />
          <div className="p-4 pt-3">
            <BarChart days={dayKeys} series={[pointsView === "admin"
              ? { name: "Issued by admins", values: s.map((d) => d.adminIssued) }
              : { name: "Daily refills", values: s.map((d) => d.dailyClaims), color: SERIES[2] }]} />
            {k.ledgerStartedAt && <p className="mt-2 text-[11.5px] text-[#8a8099]">The points ledger started {date(k.ledgerStartedAt)}; earlier days have no point history.</p>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Ad impressions" sub="Viewable impressions per day by placement" />
          <div className="p-4 pt-3">
            <BarChart days={dayKeys} series={[{ name: "Banner", values: s.map((d) => d.bannerImpressions) }, { name: "Sponsored card", values: s.map((d) => d.cardImpressions) }]} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Clicks and click-through rate" sub="Clicks per day, and clicks ÷ impressions" />
          <div className="grid grid-cols-1 gap-2 p-4 pt-3">
            <BarChart days={dayKeys} height={140} series={[{ name: "Clicks", values: s.map((d) => d.clicks), color: SERIES[1] }]} highlightLast={false} />
            <LineChart days={dayKeys} height={120} fmt={(v) => `${v.toFixed(1)}%`}
              series={[{ name: "CTR", values: s.map((d) => { const i = d.bannerImpressions + d.cardImpressions; return i ? (100 * d.clicks) / i : 0; }), color: SERIES[2], format: (v) => `${v.toFixed(2)}%` }]} />
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Campaign delivery progress" sub="Delivered vs purchased. The white tick marks where each campaign should be by now."
          right={<button onClick={() => go("campaigns")} className="text-[12.5px] text-[#b69aff] hover:text-white">All campaigns →</button>} />
        {data.campaigns.length ? (
          <div className="grid gap-x-8 gap-y-4 p-5 md:grid-cols-2">
            {data.campaigns.map((c) => (
              <button key={c.id} onClick={() => go("campaigns", { id: c.id })} className="flex flex-col gap-2 rounded-xl text-left">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{c.advertiser} <span className="text-[#8a8099]">· {c.question ?? c.banner}</span></div>
                    <div className="tabular text-[11.5px] text-[#8a8099]">{n(c.delivered)} of {n(c.purchased)} · {c.daysLeft}d left</div>
                  </div>
                  <StatePill state={c.state} />
                </div>
                <DeliveryMeter delivered={c.delivered} purchased={c.purchased} expectedPct={c.expectedPct} state={c.state} />
              </button>
            ))}
          </div>
        ) : <Empty>No campaigns are running.</Empty>}
      </Card>
    </div>
  );
}
