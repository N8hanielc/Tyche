"use client";

import { Check } from "lucide-react";
import type { Challenge, DB, Option } from "@/lib/types";
import { countFor, cx, fmtLine, isSelf, poolFor, share } from "@/lib/utils";

interface Props {
  c: Challenge;
  db: DB;
  onPick?: (o: Option) => void;
  compact?: boolean;
}

const inLabel = (c: Challenge, id: string) => {
  const n = countFor(c, id);
  if (c.stakeMode === "bragging") return `${n} ${n === 1 ? "person" : "people"}`;
  return `${poolFor(c, id)} pts · ${n} ${n === 1 ? "person" : "people"}`;
};

export function LineBadge({ c }: { c: Challenge }) {
  if (c.format !== "over_under" || c.line == null) return null;
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-dim">Line</span>
      <span className="font-display text-[22px] font-extrabold tracking-tight tabular">{fmtLine(c)}</span>
    </div>
  );
}

export function Outcomes({ c, db, onPick, compact }: Props) {
  const mine = c.entries.find((e) => e.userId === db.meId)?.optionId;
  const winner = c.status === "settled" ? c.result?.optionId : undefined;

  if (c.options.length === 2) {
    const [a, b] = c.options;
    const pa = Math.round(share(c, a.id) * 100);
    return (
      <div>
        <div className="grid grid-cols-2 gap-2">
          {[a, b].map((o, i) => {
            const selected = mine === o.id;
            const won = winner === o.id;
            const lost = winner && winner !== o.id;
            return (
              <button
                key={o.id}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isSelf(o, db.meId)) onPick?.(o);
                }}
                className={cx(
                  "group relative overflow-hidden rounded-2xl p-3.5 text-left transition-all duration-200 active:scale-[0.98]",
                  selected ? "bg-brand/15 glow-soft" : "bg-surface hover:bg-raised",
                  lost && "opacity-45",
                  isSelf(o, db.meId) && "cursor-not-allowed",
                )}
              >
                {selected && (
                  <span className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-brand text-white animate-pop">
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
                {won && <span className="absolute right-2.5 top-2.5 rounded-full bg-win px-1.5 py-0.5 text-[9px] font-black uppercase text-ink">Won</span>}
                <div className={cx("font-display font-extrabold tracking-tight", c.format === "pick_one" ? "text-[17px] leading-tight" : "text-[20px]", i === 0 ? "text-white" : "text-white")}>
                  {o.label}
                </div>
                {o.sub && !compact && <div className="mt-0.5 text-[12px] text-muted">{o.sub}</div>}
                {isSelf(o, db.meId) && <div className="mt-0.5 text-[11px] font-semibold text-dim">That’s you · can’t bet</div>}
                {c.stakeMode === "odds" && c.odds?.[o.id] && <div className="mt-1 text-[12px] font-semibold text-lav">{c.odds[o.id].toFixed(1)}x payout</div>}
                <div className="mt-2 text-[12px] font-medium text-muted tabular">{inLabel(c, o.id)}</div>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold tabular">
          <span className="w-8 text-white">{pa}%</span>
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-lav/25">
            <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-brand to-[#9b6bff] transition-all duration-700" style={{ width: `${pa}%` }} />
          </div>
          <span className="w-8 text-right text-lav">{100 - pa}%</span>
        </div>
      </div>
    );
  }

  if (c.format === "exact") {
    const max = Math.max(1, ...c.options.map((o) => countFor(c, o.id)));
    return (
      <div className="grid grid-cols-7 gap-1.5">
        {c.options.map((o) => {
          const n = countFor(c, o.id);
          const selected = mine === o.id;
          const won = winner === o.id;
          return (
            <button
              key={o.id}
              onClick={(e) => {
                e.stopPropagation();
                if (!isSelf(o, db.meId)) onPick?.(o);
              }}
              className={cx(
                "relative flex aspect-[3/4] flex-col items-center justify-end overflow-hidden rounded-xl pb-1.5 transition active:scale-95",
                selected ? "bg-brand/20 glow-soft" : "bg-surface",
                won && "ring-2 ring-win",
                winner && !won && "opacity-45",
              )}
            >
              <div className="absolute inset-x-0 bottom-0 bg-brand/25 transition-all duration-700" style={{ height: `${(n / max) * 70}%` }} />
              <span className="relative font-display text-lg font-extrabold">{o.label}</span>
              <span className="relative text-[10px] text-muted">{n}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // pick one, 3+ options
  return (
    <div className="space-y-1.5">
      {c.options.map((o) => {
        const p = Math.round(share(c, o.id) * 100);
        const selected = mine === o.id;
        const won = winner === o.id;
        return (
          <button
            key={o.id}
            onClick={(e) => {
              e.stopPropagation();
              if (!isSelf(o, db.meId)) onPick?.(o);
            }}
            className={cx(
              "relative flex w-full items-center gap-3 overflow-hidden rounded-2xl px-3.5 py-3 text-left transition active:scale-[0.99]",
              selected ? "bg-brand/10 glow-soft" : "bg-surface hover:bg-raised",
              winner && !won && "opacity-45",
              isSelf(o, db.meId) && "cursor-not-allowed",
            )}
          >
            <div className={cx("absolute inset-y-0 left-0 transition-all duration-700", selected ? "bg-brand/25" : "bg-white/[0.05]")} style={{ width: `${p}%` }} />
            <span className="relative flex-1 font-semibold">
              {o.label}
              {isSelf(o, db.meId) && <span className="ml-2 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-dim">You · can’t bet</span>}
            </span>
            {selected && <Check size={15} className="relative text-lav" strokeWidth={3} />}
            {won && <span className="relative rounded-full bg-win px-1.5 py-0.5 text-[9px] font-black uppercase text-ink">Won</span>}
            <span className="relative text-[12px] text-muted tabular">{countFor(c, o.id)}</span>
            <span className="relative w-9 text-right text-[13px] font-bold tabular">{p}%</span>
          </button>
        );
      })}
    </div>
  );
}
