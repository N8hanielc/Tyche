"use client";

import { useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import type { User } from "@/lib/types";
import { cx } from "@/lib/utils";
import { LOGO_MARK } from "@/lib/brand";

export function Avatar({ user, size = 36, ring = false, className }: { user?: User; size?: number; ring?: boolean; className?: string }) {
  const [broken, setBroken] = useState(false);
  const initials = (user?.name ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const hue = user?.hue ?? 260;
  return (
    <div
      className={cx("relative shrink-0 overflow-hidden rounded-full", ring && "ring-2 ring-brand ring-offset-2 ring-offset-ink", className)}
      style={{ width: size, height: size, background: `linear-gradient(135deg, hsl(${hue} 70% 58%), hsl(${(hue + 40) % 360} 65% 38%))` }}
    >
      {user?.avatar && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.avatar} alt={user.name} className="h-full w-full object-cover" onError={() => setBroken(true)} loading="lazy" />
      ) : (
        <span className="grid h-full w-full place-items-center font-semibold text-white/95" style={{ fontSize: size * 0.38 }}>
          {initials}
        </span>
      )}
    </div>
  );
}

export function AvatarStack({ users, size = 22, max = 4 }: { users: (User | undefined)[]; size?: number; max?: number }) {
  const shown = users.filter(Boolean).slice(0, max) as User[];
  const extra = users.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((u, i) => (
        <div key={u.id} className="rounded-full ring-2 ring-card" style={{ marginLeft: i ? -size * 0.3 : 0 }}>
          <Avatar user={u} size={size} />
        </div>
      ))}
      {extra > 0 && (
        <div className="grid place-items-center rounded-full bg-surface text-[10px] font-semibold text-muted ring-2 ring-card" style={{ width: size, height: size, marginLeft: -size * 0.3 }}>
          +{extra}
        </div>
      )}
    </div>
  );
}

export function LogoMark({ size = 26, className }: { size?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={LOGO_MARK} alt="" width={size} height={size} className={cx("shrink-0 select-none drop-shadow-[0_4px_14px_rgba(130,71,255,0.45)]", className)} draggable={false} />;
}

export function Logo({ size = 26, mark = true }: { size?: number; mark?: boolean }) {
  return (
    <div className="flex items-center gap-1.5" aria-label="Tyche">
      {mark && <LogoMark size={Math.round(size * 1.15)} />}
      <span className="font-display font-extrabold leading-none tracking-[-0.04em]" style={{ fontSize: size }}>
        tyche
      </span>
    </div>
  );
}

export function Pill({ active, children, onClick, className }: { active?: boolean; children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all duration-200 active:scale-95",
        active ? "bg-white text-ink" : "bg-card text-muted hairline hover:text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Button({
  children, onClick, variant = "primary", className, disabled, size = "md", type = "button",
}: {
  children: React.ReactNode; onClick?: () => void; variant?: "primary" | "ghost" | "soft" | "white" | "danger"; className?: string; disabled?: boolean; size?: "sm" | "md" | "lg"; type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition-all duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40",
        size === "sm" && "h-9 px-3.5 text-[13px]",
        size === "md" && "h-11 px-5 text-[15px]",
        size === "lg" && "h-14 px-6 text-base",
        variant === "primary" && "bg-brand text-white glow hover:bg-[#8f5aff]",
        variant === "ghost" && "text-muted hover:text-white",
        variant === "soft" && "bg-surface text-white hover:bg-raised",
        variant === "white" && "bg-white text-ink",
        variant === "danger" && "bg-loss/15 text-loss",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, className }: { value: T; options: { id: T; label: React.ReactNode }[]; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx("flex gap-1 rounded-2xl bg-card p-1 hairline", className)}>
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cx(
            "flex-1 rounded-xl py-2 text-[13px] font-semibold transition-all duration-200",
            value === o.id ? "bg-surface text-white shadow-[0_1px_0_rgba(255,255,255,0.06)_inset]" : "text-dim hover:text-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TopBar({ title, onBack, right, sub }: { title?: React.ReactNode; onBack?: () => void; right?: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 bg-ink/80 px-3 pb-2 pt-[max(env(safe-area-inset-top),12px)] backdrop-blur-xl">
      {onBack && (
        <button onClick={onBack} className="grid h-10 w-10 place-items-center rounded-full text-white hover:bg-card active:scale-90" aria-label="Back">
          <ChevronLeft size={24} />
        </button>
      )}
      <div className={cx("min-w-0 flex-1", !onBack && "pl-2")}>
        {title && <div className="truncate font-display text-[19px] font-bold tracking-tight">{title}</div>}
        {sub && <div className="truncate text-xs text-muted">{sub}</div>}
      </div>
      {right}
    </header>
  );
}

export function BottomSheet({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: React.ReactNode; title?: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div className="absolute inset-0 animate-fade bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative max-h-[92dvh] w-full max-w-[440px] animate-sheet overflow-y-auto rounded-t-[28px] bg-card pb-[max(env(safe-area-inset-bottom),20px)] hairline no-scrollbar">
        <div className="sticky top-0 z-10 bg-card/95 px-5 pb-2 pt-3 backdrop-blur">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
          {title && (
            <div className="flex items-center justify-between">
              <div className="font-display text-lg font-bold">{title}</div>
              <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-surface text-muted" aria-label="Close">
                <X size={16} />
              </button>
            </div>
          )}
        </div>
        <div className="px-5">{children}</div>
      </div>
    </div>
  );
}

export function CategoryTag({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-lav">{children}</span>;
}

export function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    Live: "bg-loss text-white",
    Open: "bg-win/15 text-win",
    Locked: "bg-white/10 text-muted",
    Confirming: "bg-gold/15 text-gold",
    Voting: "bg-lav/15 text-lav",
    Settled: "bg-white/10 text-muted",
  };
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", map[status])}>
      {status === "Live" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
      {status}
    </span>
  );
}

export function Empty({ icon, title, body, action }: { icon: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-card text-lav hairline">{icon}</div>
      <div className="font-display text-lg font-bold">{title}</div>
      {body && <p className="mt-1 text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
