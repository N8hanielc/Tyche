"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { compact, n, shortDate } from "./ui";

/**
 * Small, dependency-free SVG charts for the admin panel.
 * Palette validated for the dark plum surface (#1a1322): violet, copper, green.
 * One y-axis per chart, legend for 2+ series, hover tooltip on every chart.
 */
export const SERIES = ["#9277f5", "#d2702a", "#1fa77a"] as const;

export interface Series { name: string; values: number[]; color?: string; format?: (v: number) => string }

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceMax(v: number) {
  if (v <= 0) return 4;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#c9c1d6]">
      {series.map((s, i) => (
        <span key={s.name} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color ?? SERIES[i] }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

function Tooltip({ x, w, label, rows }: { x: number; w: number; label: string; rows: { name: string; color: string; value: string }[] }) {
  const left = Math.min(Math.max(x + 12, 0), w - 170);
  return (
    <div className="pointer-events-none absolute top-1 z-10 w-[160px] rounded-xl border border-white/[0.08] bg-[#1d1626]/95 px-3 py-2 text-[12px] shadow-xl backdrop-blur" style={{ left }}>
      <div className="mb-1 text-[11px] text-[#a79db5]">{label}</div>
      {rows.map((r) => (
        <div key={r.name} className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[#c9c1d6]"><span className="h-2 w-2 rounded-[2px]" style={{ background: r.color }} />{r.name}</span>
          <span className="tabular font-semibold text-white">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function Axes({ w, h, pad, max, labels, fmt }: { w: number; h: number; pad: { l: number; r: number; t: number; b: number }; max: number; labels: string[]; fmt: (v: number) => string }) {
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const step = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor((w - pad.l - pad.r) / 72))));
  const iw = w - pad.l - pad.r;
  return (
    <g>
      {ticks.map((t) => {
        const y = pad.t + (h - pad.t - pad.b) * (1 - t / max);
        return (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray={t === 0 ? undefined : "2 4"} />
            <text x={pad.l - 8} y={y + 4} textAnchor="end" fontSize="11" fill="#8a8099">{fmt(t)}</text>
          </g>
        );
      })}
      {labels.map((l, i) =>
        i % step === 0 || i === labels.length - 1 ? (
          i !== labels.length - 1 && labels.length - 1 - i < step ? null : (
            <text key={i} x={pad.l + (labels.length === 1 ? iw / 2 : (iw * i) / (labels.length - 1))} y={h - 6} fontSize="11" fill="#8a8099"
              textAnchor={labels.length > 1 && i === 0 ? "start" : labels.length > 1 && i === labels.length - 1 ? "end" : "middle"}>{l}</text>
          )
        ) : null,
      )}
    </g>
  );
}

/** Line chart (area fill when there's one series). x = days. */
export function LineChart({ days, series, height = 220, fmt = compact, area = true }: { days: string[]; series: Series[]; height?: number; fmt?: (v: number) => string; area?: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 44, r: 12, t: 12, b: 26 };
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (days.length <= 1 ? iw / 2 : (iw * i) / (days.length - 1));
  const y = (v: number) => pad.t + ih * (1 - v / max);
  const labels = days.map((d) => shortDate(d + "T12:00:00"));
  const gid = useMemo(() => `g${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Legend series={series} />
      <div ref={ref} className="relative min-w-0 overflow-hidden" onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - r.left - pad.l) / Math.max(1, iw)) * (days.length - 1));
          setHover(Math.max(0, Math.min(days.length - 1, i)));
        }}>
        <svg width={w} height={height} role="img" aria-label={series.map((s) => s.name).join(", ") + " over time"}>
          <defs>
            {series.map((s, si) => (
              <linearGradient key={si} id={`${gid}-${si}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={s.color ?? SERIES[si]} stopOpacity="0.35" />
                <stop offset="100%" stopColor={s.color ?? SERIES[si]} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          <Axes w={w} h={height} pad={pad} max={max} labels={labels} fmt={fmt} />
          {series.map((s, si) => {
            const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
            return (
              <g key={s.name}>
                {area && series.length === 1 && s.values.length > 1 && (
                  <polygon points={`${x(0)},${y(0)} ${pts} ${x(s.values.length - 1)},${y(0)}`} fill={`url(#${gid}-${si})`} />
                )}
                <polyline points={pts} fill="none" stroke={s.color ?? SERIES[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              </g>
            );
          })}
          {hover != null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={height - pad.b} stroke="rgba(255,255,255,0.25)" />
              {series.map((s, si) => (
                <circle key={si} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={4.5} fill={s.color ?? SERIES[si]} stroke="#140f1b" strokeWidth={2} />
              ))}
            </g>
          )}
        </svg>
        {hover != null && (
          <Tooltip x={x(hover)} w={w} label={shortDate(days[hover] + "T12:00:00")}
            rows={series.map((s, si) => ({ name: s.name, color: s.color ?? SERIES[si], value: (s.format ?? n)(s.values[hover] ?? 0) }))} />
        )}
      </div>
    </div>
  );
}

/** Column chart; 1–2 series side by side per day. highlight = index drawn brighter (e.g. today). */
export function BarChart({ days, series, height = 220, fmt = compact, highlightLast = true }: { days: string[]; series: Series[]; height?: number; fmt?: (v: number) => string; highlightLast?: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 44, r: 12, t: 12, b: 26 };
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const slot = iw / Math.max(1, days.length);
  const gap = 2;
  const bw = Math.max(1.5, Math.min(22, (slot - 4) / series.length - gap));
  const y = (v: number) => pad.t + ih * (1 - v / max);
  const labels = days.map((d) => shortDate(d + "T12:00:00"));
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Legend series={series} />
      <div ref={ref} className="relative min-w-0 overflow-hidden" onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.floor((e.clientX - r.left - pad.l) / slot);
          setHover(i >= 0 && i < days.length ? i : null);
        }}>
        <svg width={w} height={height} role="img" aria-label={series.map((s) => s.name).join(", ") + " per day"}>
          <defs>
            <linearGradient id="bar-hi" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#c4b0ff" />
              <stop offset="100%" stopColor="#8247ff" />
            </linearGradient>
          </defs>
          <Axes w={w} h={height} pad={{ ...pad, l: pad.l + slot / 2, r: pad.r + slot / 2 }} max={max} labels={labels} fmt={fmt} />
          {hover != null && <rect x={pad.l + hover * slot} y={pad.t} width={slot} height={ih} fill="rgba(255,255,255,0.04)" rx={6} />}
          {days.map((_, i) =>
            series.map((s, si) => {
              const v = s.values[i] ?? 0;
              if (v <= 0) return null;
              const bx = pad.l + i * slot + (slot - (bw + gap) * series.length + gap) / 2 + si * (bw + gap);
              const top = y(v);
              const hgt = Math.max(2, pad.t + ih - top);
              const r = Math.min(4, bw / 2, hgt);
              const hi = highlightLast && series.length === 1 && i === days.length - 1;
              return (
                <path key={`${i}-${si}`} fill={hi ? "url(#bar-hi)" : s.color ?? SERIES[si]} opacity={hover == null || hover === i ? 1 : 0.55}
                  d={`M${bx},${pad.t + ih} V${top + r} Q${bx},${top} ${bx + r},${top} H${bx + bw - r} Q${bx + bw},${top} ${bx + bw},${top + r} V${pad.t + ih} Z`} />
              );
            }),
          )}
        </svg>
        {hover != null && (
          <Tooltip x={pad.l + hover * slot + slot / 2} w={w} label={shortDate(days[hover] + "T12:00:00")}
            rows={series.map((s, si) => ({ name: s.name, color: s.color ?? SERIES[si], value: (s.format ?? n)(s.values[hover] ?? 0) }))} />
        )}
      </div>
    </div>
  );
}

/** Tiny trend line for stat tiles. */
export function Sparkline({ values, color = SERIES[0], width = 96, height = 28 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(width * i) / (values.length - 1)},${height - 2 - ((height - 4) * v) / max}`).join(" ");
  return (
    <svg width={width} height={height} aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
