"use client";

import { useEffect, useMemo, useState } from "react";
import { Layers, LayoutPanelTop, Lock, Megaphone, Minus, Plus, RotateCcw } from "lucide-react";
import { api, type AdSetting } from "../api";
import { useAdmin } from "../AdminApp";
import { Button, Card, CardHeader, ConfirmDialog, DiffRows, ErrorBox, Spinner, ago, cx, n, useLoad, type ConfirmSpec } from "../ui";

const GROUPS = [
  { id: "banner", title: "Banner ads", sub: "The rotating banner on Discover", icon: LayoutPanelTop },
  { id: "card", title: "Sponsored feed cards", sub: "Sponsored cards in the Home feed", icon: Megaphone },
  { id: "combined", title: "Combined limits", sub: "Across both placements", icon: Layers },
] as const;

const show = (s: AdSetting, v: number) => (s.unit === "toggle" ? (v >= 1 ? "On" : "Off") : s.zeroUnlimited && v === 0 ? (s.more === "down" ? "None" : "No limit") : `${n(v)} ${s.unit}`);

/** Does going from a → b show people more ads? And is it a big jump? */
function impact(s: AdSetting, a: number, b: number): { more: boolean; big: boolean } {
  if (s.unit === "toggle") return { more: b > a, big: b > a };
  if (s.more === "up") {
    if (s.zeroUnlimited && b === 0 && a > 0) return { more: true, big: true };
    if (s.zeroUnlimited && a === 0) return { more: false, big: false };
    return { more: b > a, big: b > a && (b - a) / Math.max(a, 1) >= 0.25 };
  }
  // "down": smaller = more ads (gaps, intervals)
  return { more: b < a, big: b < a && (a - b) / Math.max(a, 1) >= 0.25 };
}

export function SettingsSection() {
  const { isSuper, bump } = useAdmin();
  const [v, setV] = useState(0);
  const { data, error, reload } = useLoad(() => api.adSettings(), [bump, v]);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  useEffect(() => setDraft({}), [data]);

  const changes = useMemo(() => (data ?? []).filter((s) => draft[s.key] != null && draft[s.key] !== s.value), [data, draft]);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Spinner />;

  const setVal = (s: AdSetting, val: number) => setDraft((d) => ({ ...d, [s.key]: Math.max(s.min, Math.min(s.max, Math.round(val))) }));
  const review = () => {
    const effects = changes.map((s) => ({ s, ...impact(s, s.value, draft[s.key]) }));
    const bigOnes = effects.filter((e) => e.big);
    setConfirm({
      title: `Apply ${changes.length} setting change${changes.length === 1 ? "" : "s"}?`,
      body: (
        <div className="flex flex-col gap-3">
          <DiffRows rows={changes.map((s) => ({ label: s.label, before: show(s, s.value), after: show(s, draft[s.key]), emphasize: true }))} />
          <p className="text-[12.5px] text-[#a79db5]">Applies to new ad decisions right away. Open apps pick up spacing and rotation changes on their next launch. No deploy needed.</p>
        </div>
      ),
      warning: bigOnes.length ? (
        <>
          <b>This significantly increases how often people see ads:</b>
          <ul className="mt-1 list-disc pl-4">{bigOnes.map((e) => <li key={e.s.key}>{e.s.label}: {show(e.s, e.s.value)} → {show(e.s, draft[e.s.key])}</li>)}</ul>
        </>
      ) : effects.some((e) => e.more) ? "This increases ad frequency slightly." : undefined,
      confirmLabel: "Apply settings", tone: bigOnes.length ? "warn" : "primary", done: "Ad settings saved",
      run: (r) => api.saveAdSettings(Object.fromEntries(changes.map((s) => [s.key, draft[s.key]])), r),
    });
  };

  return (
    <div className="pb-24">
      {!isSuper && (
        <div className="mb-5 flex items-center gap-2.5 rounded-2xl bg-white/[0.04] px-4 py-3 text-[13px] text-[#c9c1d6] ring-1 ring-inset ring-white/[0.07]">
          <Lock size={15} className="text-[#ffc85c]" /> Only super admins can change global ad settings. You can see the current values.
        </div>
      )}
      <div className="grid gap-5 xl:grid-cols-3">
        {GROUPS.map((g) => {
          const Icon = g.icon;
          return (
            <Card key={g.id} className="self-start">
              <CardHeader title={<span className="inline-flex items-center gap-2"><Icon size={16} className="text-[#b69aff]" />{g.title}</span>} sub={g.sub} />
              <div className="mt-3 divide-y divide-white/[0.05]">
                {data.filter((s) => s.group === g.id).map((s) => {
                  const val = draft[s.key] ?? s.value;
                  const dirty = draft[s.key] != null && draft[s.key] !== s.value;
                  const eff = impact(s, s.value, val);
                  return (
                    <div key={s.key} className={cx("px-5 py-4", dirty && "bg-[#8247ff]/[0.06]")}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[13.5px] font-medium">{s.label}</div>
                          <div className="mt-0.5 text-[12px] leading-snug text-[#8a8099]">{s.help}</div>
                        </div>
                        {s.unit === "toggle" ? (
                          <button disabled={!isSuper} onClick={() => setVal(s, val >= 1 ? 0 : 1)} aria-pressed={val >= 1} aria-label={s.label}
                            className={cx("relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50", val >= 1 ? "bg-[#8247ff]" : "bg-white/[0.12]")}>
                            <span className={cx("absolute top-1 h-5 w-5 rounded-full bg-white transition-all", val >= 1 ? "left-6" : "left-1")} />
                          </button>
                        ) : (
                          <div className="flex shrink-0 items-center rounded-xl bg-white/[0.04] ring-1 ring-inset ring-white/[0.07]">
                            <button disabled={!isSuper || val <= s.min} onClick={() => setVal(s, val - 1)} className="grid h-9 w-8 place-items-center text-[#c9c1d6] disabled:opacity-30" aria-label="Decrease"><Minus size={14} /></button>
                            <input disabled={!isSuper} inputMode="numeric" value={val} aria-label={s.label}
                              onChange={(e) => { const x = Number(e.target.value.replace(/\D/g, "")); if (!Number.isNaN(x)) setDraft((d) => ({ ...d, [s.key]: x })); }}
                              onBlur={() => setVal(s, val)}
                              className="tabular h-9 w-14 bg-transparent text-center text-[14px] font-semibold outline-none disabled:opacity-60" />
                            <button disabled={!isSuper || val >= s.max} onClick={() => setVal(s, val + 1)} className="grid h-9 w-8 place-items-center text-[#c9c1d6] disabled:opacity-30" aria-label="Increase"><Plus size={14} /></button>
                          </div>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-[#8a8099]">
                        <span>{s.unit !== "toggle" && `${s.unit} · `}range {s.zeroUnlimited ? (s.more === "down" ? "0 (none)" : "0 (no limit)") : n(s.min)}–{n(s.max)}</span>
                        <span>default {show(s, s.default)}</span>
                        {s.updatedBy && <span>changed {ago(s.updatedAt)} by @{s.updatedBy}</span>}
                        {dirty && eff.more && <span className={eff.big ? "font-semibold text-[#ffd889]" : "text-[#ffd889]"}>↑ more ads</span>}
                        {dirty && !eff.more && <span className="text-[#7beab8]">↓ fewer ads</span>}
                        {isSuper && val !== s.default && <button onClick={() => setVal(s, s.default)} className="inline-flex items-center gap-1 text-[#b69aff] hover:text-white"><RotateCcw size={11} /> default</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>
      {changes.length > 0 && (
        <div className="fixed inset-x-0 bottom-5 z-40 mx-auto flex w-[min(620px,calc(100vw-40px))] items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#1b1424]/95 px-4 py-3 shadow-2xl backdrop-blur-xl animate-rise">
          <span className="flex-1 text-[13px]"><b>{changes.length}</b> unsaved change{changes.length === 1 ? "" : "s"}</span>
          <Button tone="ghost" size="sm" onClick={() => setDraft({})}>Discard</Button>
          <Button tone="primary" size="sm" onClick={review}>Review & apply</Button>
        </div>
      )}
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} onDone={() => setV((x) => x + 1)} />
    </div>
  );
}
