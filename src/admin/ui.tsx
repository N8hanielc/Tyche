"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, BadgeCheck, Ban, CheckCircle2, Clock, Flag, Loader2, Lock, PauseCircle, X, XCircle } from "lucide-react";
import type { CampaignState, UserStatus } from "./api";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// ------------------------------------------------------------------ format --

const nf = new Intl.NumberFormat("en-US");
export const n = (v: number | null | undefined) => (v == null ? "—" : nf.format(Math.round(v)));
export const compact = (v: number | null | undefined) =>
  v == null ? "—" : Math.abs(v) >= 10_000 ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v) : nf.format(Math.round(v));
export const pct = (v: number | null | undefined, digits = 1) => (v == null ? "—" : `${v.toFixed(digits)}%`);
export const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf.format(Math.abs(v))}`;
export const date = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
export const shortDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");
export const dateTime = (s?: string | null) =>
  s ? new Date(s).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
export function ago(s?: string | null) {
  if (!s) return "never";
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : date(s);
}
export const shortId = (id: string) => id.slice(0, 8);

// -------------------------------------------------------------------- data --

/** Loads data with a function; reload() refetches. Keeps the old data on screen while refreshing. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const run = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const d = await fn();
      if (id === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (id === seq.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => void run(), [run]);
  return { data, error, loading, reload: run };
}

export function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

// ------------------------------------------------------------------- toast --

type Toast = { id: number; tone: "ok" | "error"; text: string };
const ToastCtx = createContext<(tone: Toast["tone"], text: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast["tone"], text: string) => {
    const id = Date.now() + Math.random();
    setItems((t) => [...t, { id, tone, text }]);
    setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), tone === "error" ? 7000 : 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[80] flex w-[min(380px,calc(100vw-40px))] flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx("pointer-events-auto flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-[13px] shadow-2xl backdrop-blur-xl animate-rise",
            t.tone === "ok" ? "border-[#3ddc97]/25 bg-[#132019]/95" : "border-[#ff5d73]/30 bg-[#24121a]/95")}>
            {t.tone === "ok" ? <CheckCircle2 size={16} className="mt-px shrink-0 text-[#3ddc97]" /> : <AlertTriangle size={16} className="mt-px shrink-0 text-[#ff5d73]" />}
            <span className="leading-snug">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ------------------------------------------------------------- primitives --

export function Card({ className, children, glow }: { className?: string; children: React.ReactNode; glow?: "plum" | "copper" }) {
  return (
    <section className={cx("relative overflow-hidden rounded-[22px] border border-white/[0.06] bg-[#140f1b]", className)}>
      {glow && (
        <div aria-hidden className="pointer-events-none absolute inset-0"
          style={{ background: glow === "plum"
            ? "radial-gradient(120% 90% at 85% 0%, rgba(130,71,255,0.28), transparent 55%), radial-gradient(80% 60% at 0% 100%, rgba(91,43,224,0.18), transparent 60%)"
            : "radial-gradient(110% 90% at 90% 0%, rgba(210,112,42,0.30), transparent 55%), radial-gradient(70% 60% at 0% 100%, rgba(130,71,255,0.18), transparent 60%)" }} />
      )}
      <div className="relative">{children}</div>
    </section>
  );
}

export function CardHeader({ title, sub, right }: { title: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{title}</h2>
        {sub && <p className="mt-0.5 text-[12.5px] text-[#a79db5]">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Button({
  children, onClick, tone = "default", size = "md", disabled, busy, type = "button", className, title,
}: {
  children: React.ReactNode; onClick?: () => void; tone?: "default" | "primary" | "danger" | "ghost" | "warn"; size?: "sm" | "md";
  disabled?: boolean; busy?: boolean; type?: "button" | "submit"; className?: string; title?: string;
}) {
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled || busy}
      className={cx("inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" ? "h-8 px-3 text-[12.5px]" : "h-10 px-4 text-[13.5px]",
        tone === "primary" && "bg-[#8247ff] text-white shadow-[0_8px_24px_-10px_rgba(130,71,255,0.9)] hover:bg-[#9160ff]",
        tone === "danger" && "bg-[#ff5d73]/15 text-[#ff8a9a] ring-1 ring-inset ring-[#ff5d73]/30 hover:bg-[#ff5d73]/25",
        tone === "warn" && "bg-[#ffc85c]/12 text-[#ffd889] ring-1 ring-inset ring-[#ffc85c]/25 hover:bg-[#ffc85c]/20",
        tone === "default" && "bg-white/[0.06] text-white ring-1 ring-inset ring-white/[0.07] hover:bg-white/[0.1]",
        tone === "ghost" && "text-[#c9c1d6] hover:bg-white/[0.06] hover:text-white",
        className)}>
      {busy && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { icon?: React.ReactNode }) {
  const { icon, className, ...rest } = props;
  return (
    <label className={cx("flex h-10 items-center gap-2 rounded-xl bg-white/[0.04] px-3 ring-1 ring-inset ring-white/[0.07] focus-within:ring-[#8247ff]/70", className)}>
      {icon && <span className="shrink-0 text-[#8a8099]">{icon}</span>}
      <input {...rest} className="h-full min-w-0 flex-1 bg-transparent text-[13.5px] text-white outline-none placeholder:text-[#6f6680]" />
    </label>
  );
}

export function Select({ value, onChange, options, className, label }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string; label?: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
      className={cx("h-10 rounded-xl bg-white/[0.04] px-3 text-[13px] text-white outline-none ring-1 ring-inset ring-white/[0.07] focus:ring-[#8247ff]/70 [&>option]:bg-[#1c1525]", className)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-[#c9c1d6]">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] text-[#8a8099]">{hint}</span>}
    </div>
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx("min-h-[76px] w-full resize-y rounded-xl bg-white/[0.04] px-3 py-2.5 text-[13.5px] text-white outline-none ring-1 ring-inset ring-white/[0.07] placeholder:text-[#6f6680] focus:ring-[#8247ff]/70", props.className)} />;
}

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: React.ReactNode; count?: number }[]; className?: string }) {
  return (
    <div role="tablist" className={cx("inline-flex flex-wrap gap-1 rounded-2xl bg-white/[0.035] p-1 ring-1 ring-inset ring-white/[0.05]", className)}>
      {items.map((i) => (
        <button key={i.value} role="tab" aria-selected={value === i.value} onClick={() => onChange(i.value)}
          className={cx("inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-[12.5px] font-medium transition",
            value === i.value ? "bg-[#2a2036] text-white shadow-[inset_0_0_0_1px_rgba(182,154,255,0.18)]" : "text-[#a79db5] hover:text-white")}>
          {i.label}
          {i.count != null && <span className="tabular rounded-md bg-white/[0.07] px-1.5 text-[11px] text-[#c9c1d6]">{compact(i.count)}</span>}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ name, src, hue = 270, size = 32 }: { name: string; src?: string | null; hue?: number; size?: number }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(140deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 65% 38%))` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials}
    </span>
  );
}

// ------------------------------------------------------------------- status --

type Tone = "good" | "warn" | "bad" | "neutral" | "plum" | "info";
const toneCls: Record<Tone, string> = {
  good: "bg-[#3ddc97]/12 text-[#7beab8] ring-[#3ddc97]/25",
  warn: "bg-[#ffc85c]/12 text-[#ffd889] ring-[#ffc85c]/25",
  bad: "bg-[#ff5d73]/12 text-[#ff8a9a] ring-[#ff5d73]/25",
  neutral: "bg-white/[0.06] text-[#c9c1d6] ring-white/[0.08]",
  plum: "bg-[#8247ff]/15 text-[#c7b2ff] ring-[#8247ff]/30",
  info: "bg-[#5ea8ff]/12 text-[#9ccaff] ring-[#5ea8ff]/25",
};
export function Pill({ tone = "neutral", icon, children, title }: { tone?: Tone; icon?: React.ReactNode; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2 text-[11.5px] font-semibold ring-1 ring-inset", toneCls[tone])}>
      {icon}
      {children}
    </span>
  );
}

export function UserStatusPill({ status }: { status: UserStatus }) {
  if (status === "verified") return <Pill tone="plum" icon={<BadgeCheck size={13} />}>Verified</Pill>;
  if (status === "suspended") return <Pill tone="bad" icon={<Ban size={13} />}>Suspended</Pill>;
  return <Pill tone="neutral">Unverified</Pill>;
}
export const RestrictedPill = () => <Pill tone="warn" icon={<Lock size={12} />}>Restricted</Pill>;
export const FlaggedPill = ({ reason }: { reason?: string | null }) => <Pill tone="warn" icon={<Flag size={12} />} title={reason ?? undefined}>Flagged</Pill>;

export const STATE_META: Record<CampaignState, { label: string; tone: Tone; icon: React.ReactNode }> = {
  on_track: { label: "On track", tone: "good", icon: <CheckCircle2 size={13} /> },
  slightly_behind: { label: "Slightly behind", tone: "warn", icon: <Clock size={13} /> },
  underdelivering: { label: "Underdelivering", tone: "bad", icon: <AlertTriangle size={13} /> },
  completed: { label: "Completed", tone: "plum", icon: <CheckCircle2 size={13} /> },
  paused: { label: "Paused", tone: "neutral", icon: <PauseCircle size={13} /> },
  expired: { label: "Expired", tone: "neutral", icon: <Clock size={13} /> },
  scheduled: { label: "Scheduled", tone: "info", icon: <Clock size={13} /> },
  canceled: { label: "Canceled", tone: "neutral", icon: <XCircle size={13} /> },
};
export function StatePill({ state }: { state: CampaignState }) {
  const m = STATE_META[state];
  return <Pill tone={m.tone} icon={m.icon}>{m.label}</Pill>;
}

export function AdvertiserStatusPill({ status }: { status: "active" | "paused" | "suspended" }) {
  return status === "active" ? <Pill tone="good" icon={<CheckCircle2 size={13} />}>Active</Pill>
    : status === "paused" ? <Pill tone="warn" icon={<PauseCircle size={13} />}>Paused</Pill>
    : <Pill tone="bad" icon={<Ban size={13} />}>Suspended</Pill>;
}

export function PriorityPill({ p }: { p: "normal" | "high" | "urgent" }) {
  return p === "normal" ? <Pill tone="neutral">Normal</Pill> : p === "high" ? <Pill tone="plum">High</Pill> : <Pill tone="warn">Urgent</Pill>;
}

// ------------------------------------------------------------- feedback --

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-14 text-[13px] text-[#8a8099]">
      <Loader2 size={16} className="animate-spin" /> {label}…
    </div>
  );
}
export function ErrorBox({ error, retry }: { error: string; retry?: () => void }) {
  return (
    <div className="m-5 flex items-start gap-3 rounded-2xl bg-[#ff5d73]/10 p-4 text-[13px] text-[#ffb3be] ring-1 ring-inset ring-[#ff5d73]/25">
      <AlertTriangle size={16} className="mt-px shrink-0" />
      <div className="flex-1">{error}</div>
      {retry && <Button size="sm" onClick={retry}>Retry</Button>}
    </div>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-12 text-center text-[13px] text-[#8a8099]">{children}</div>;
}

// ------------------------------------------------------------------ table --

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("overflow-x-auto", className)}>
      <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left text-[13px]">{children}</table>
    </div>
  );
}
export function Th({ children, className, right }: { children?: React.ReactNode; className?: string; right?: boolean }) {
  return <th className={cx("sticky top-0 z-[1] border-b border-white/[0.06] bg-[#140f1b] px-4 py-2.5 text-[11.5px] font-medium uppercase tracking-[0.06em] text-[#8a8099]", right && "text-right", className)}>{children}</th>;
}
export function Td({ children, className, right }: { children?: React.ReactNode; className?: string; right?: boolean }) {
  return <td className={cx("border-b border-white/[0.04] px-4 py-3 align-middle", right && "tabular text-right", className)}>{children}</td>;
}

export function Pager({ total, lim, off, onChange }: { total: number; lim: number; off: number; onChange: (off: number) => void }) {
  if (total <= lim) return <div className="px-5 py-3 text-[12px] text-[#8a8099]">{n(total)} {total === 1 ? "result" : "results"}</div>;
  return (
    <div className="flex items-center justify-between px-5 py-3 text-[12px] text-[#8a8099]">
      <span className="tabular">{n(off + 1)}–{n(Math.min(off + lim, total))} of {n(total)}</span>
      <div className="flex gap-1.5">
        <Button size="sm" tone="ghost" disabled={off === 0} onClick={() => onChange(Math.max(0, off - lim))}>Previous</Button>
        <Button size="sm" tone="ghost" disabled={off + lim >= total} onClick={() => onChange(off + lim)}>Next</Button>
      </div>
    </div>
  );
}

/** Meter: delivered vs purchased, with a tick where delivery should be by now. */
export function DeliveryMeter({ delivered, purchased, expectedPct, state }: { delivered: number; purchased: number; expectedPct?: number; state?: CampaignState }) {
  const p = Math.min(100, (delivered / Math.max(1, purchased)) * 100);
  const color = state === "underdelivering" ? "#ff5d73" : state === "slightly_behind" ? "#ffc85c" : "#9277f5";
  return (
    <div className="relative h-1.5 w-full rounded-full bg-white/[0.07]" role="meter" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full" style={{ width: `${p}%`, background: color }} />
      {expectedPct != null && expectedPct > 0 && expectedPct < 100 && (
        <div title={`Expected by now: ${expectedPct.toFixed(0)}%`} className="absolute -top-1 h-3.5 w-[2px] rounded bg-white/70" style={{ left: `calc(${expectedPct}% - 1px)` }} />
      )}
    </div>
  );
}

// ----------------------------------------------------------------- dialogs --

export function Modal({ open, onClose, title, sub, children, footer, wide }: {
  open: boolean; onClose: () => void; title: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center bg-[#06040a]/75 p-4 backdrop-blur-sm animate-fade" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" className={cx("flex max-h-[min(860px,calc(100dvh-32px))] w-full flex-col overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#17111f] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] animate-rise", wide ? "max-w-[880px]" : "max-w-[500px]")}>
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.06] px-6 py-4">
          <div>
            <h3 className="text-[16px] font-semibold">{title}</h3>
            {sub && <p className="mt-0.5 text-[12.5px] text-[#a79db5]">{sub}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-[#a79db5] hover:bg-white/[0.06] hover:text-white"><X size={16} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.06] px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export interface ConfirmSpec {
  title: string;
  body?: React.ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger" | "warn";
  reason?: "required" | "optional" | "none";
  reasonPresets?: string[];
  warning?: React.ReactNode;
  run: (reason: string) => Promise<unknown>;
  done?: string;
}

/** Confirmation step for every sensitive action. The reason goes to the audit log. */
export function ConfirmDialog({ spec, onClose, onDone }: { spec: ConfirmSpec | null; onClose: () => void; onDone?: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  useEffect(() => {
    setReason("");
    setErr(null);
    setBusy(false);
  }, [spec]);
  if (!spec) return null;
  const need = spec.reason ?? "required";
  const ok = need !== "required" || reason.trim().length >= 3;
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await spec.run(reason.trim());
      if (spec.done) toast("ok", spec.done);
      onDone?.();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={() => !busy && onClose()} title={spec.title}
      footer={<>
        <Button tone="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button tone={spec.tone ?? "primary"} onClick={submit} disabled={!ok} busy={busy}>{spec.confirmLabel}</Button>
      </>}>
      <div className="flex flex-col gap-4 text-[13.5px] leading-relaxed text-[#d8d1e3]">
        {spec.body}
        {spec.warning && (
          <div className="flex gap-2.5 rounded-xl bg-[#ffc85c]/10 p-3 text-[12.5px] text-[#ffe0a3] ring-1 ring-inset ring-[#ffc85c]/25">
            <AlertTriangle size={16} className="mt-px shrink-0" />
            <div>{spec.warning}</div>
          </div>
        )}
        {need !== "none" && (
          <Field label={need === "required" ? "Reason (saved to the activity log)" : "Note (optional, saved to the activity log)"}>
            {spec.reasonPresets && (
              <div className="flex flex-wrap gap-1.5">
                {spec.reasonPresets.map((r) => (
                  <button key={r} onClick={() => setReason(r)} className={cx("rounded-lg px-2.5 py-1 text-[12px] ring-1 ring-inset transition",
                    reason === r ? "bg-[#8247ff]/20 text-white ring-[#8247ff]/50" : "bg-white/[0.04] text-[#c9c1d6] ring-white/[0.07] hover:text-white")}>{r}</button>
                ))}
              </div>
            )}
            <TextArea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="What happened, and why this action" />
          </Field>
        )}
        {err && <div className="flex gap-2 rounded-xl bg-[#ff5d73]/10 p-3 text-[12.5px] text-[#ffb3be] ring-1 ring-inset ring-[#ff5d73]/25"><AlertTriangle size={15} className="mt-px shrink-0" />{err}</div>}
      </div>
    </Modal>
  );
}

/** Before → after summary rows used in confirmation dialogs. */
export function DiffRows({ rows }: { rows: { label: string; before?: React.ReactNode; after: React.ReactNode; emphasize?: boolean }[] }) {
  return (
    <div className="divide-y divide-white/[0.05] rounded-xl bg-white/[0.03] ring-1 ring-inset ring-white/[0.06]">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 px-3.5 py-2.5 text-[13px]">
          <span className="text-[#a79db5]">{r.label}</span>
          <span className={cx("tabular text-right", r.emphasize && "font-semibold text-white")}>
            {r.before != null && <><span className="text-[#8a8099]">{r.before}</span><span className="mx-1.5 text-[#6f6680]">→</span></>}
            {r.after}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Slide-over panel for details (user, advertiser, campaign). */
export function Drawer({ open, onClose, children, width = 720 }: { open: boolean; onClose: () => void; children: React.ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector('[role="dialog"]') && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-[#06040a]/60 backdrop-blur-[2px] animate-fade" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="relative h-full w-full overflow-y-auto border-l border-white/[0.07] bg-[#110c17] shadow-[-40px_0_120px_-40px_rgba(0,0,0,0.9)] animate-slide" style={{ maxWidth: width }}>
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-xl bg-white/[0.05] text-[#c9c1d6] hover:bg-white/[0.1] hover:text-white"><X size={16} /></button>
        {children}
      </aside>
    </div>,
    document.body,
  );
}

export function Stat({ label, value, sub, icon, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode; tone?: "bad" | "warn" }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[18px] border border-white/[0.06] bg-[#140f1b] p-4">
      <div className="flex items-center justify-between gap-2 text-[12px] text-[#a79db5]">
        <span className="truncate">{label}</span>
        {icon && <span className={cx("grid h-7 w-7 shrink-0 place-items-center rounded-lg", tone === "bad" ? "bg-[#ff5d73]/12 text-[#ff8a9a]" : tone === "warn" ? "bg-[#ffc85c]/12 text-[#ffd889]" : "bg-white/[0.05] text-[#b69aff]")}>{icon}</span>}
      </div>
      <div className="tabular font-display text-[24px] font-bold leading-tight tracking-[-0.02em]">{value}</div>
      {sub && <div className="truncate text-[12px] text-[#8a8099]">{sub}</div>}
    </div>
  );
}
