"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BadgeCheck, Coins, Minus, Plus, Search } from "lucide-react";
import { api, newRequestId, type UserRow } from "../api";
import { useAdmin } from "../AdminApp";
import {
  Avatar, Button, Card, CardHeader, DiffRows, Empty, ErrorBox, Field, Input, Modal, Pager, Pill, Select, Spinner, Table, Td, TextArea, Th,
  cx, dateTime, n, signed, useDebounced, useLoad, useToast,
} from "../ui";

export const SOURCE_LABEL: Record<string, string> = {
  admin_issue: "Admin issue",
  admin_deduct: "Admin deduction",
  stake: "Stake",
  settle: "Settlement",
  refund: "Refund",
  resettle: "Re-settlement",
  daily_claim: "Daily refill",
  plus_topup: "Tyche+ top-up",
  signup: "Sign-up bonus",
  opening_balance: "Opening balance",
  app: "Other",
};

const REASONS = ["Promotional reward", "Contest prize", "Bug compensation", "Support goodwill", "Balance correction", "Abuse reversal"];

type Target = { id: string; username: string; name: string; points: number };

/** Two-step issue/deduct flow: enter → review → confirm. Safe to retry (request id). */
export function AdjustPointsDialog({ user, onClose, onDone }: { user: Target; onClose: () => void; onDone?: () => void }) {
  const { isSuper } = useAdmin();
  const toast = useToast();
  const [mode, setMode] = useState<"issue" | "deduct">("issue");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [notify, setNotify] = useState(true);
  const [step, setStep] = useState<"form" | "review">("form");
  const [requestId, setRequestId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const max = isSuper ? 1_000_000 : 10_000;
  const amt = Math.floor(Number(amount.replace(/[, ]/g, "")) || 0);
  const delta = mode === "issue" ? amt : -amt;
  const after = user.points + delta;
  const problem =
    amt <= 0 ? "Enter an amount" : amt > max ? `Limit for your role is ${n(max)} pts per adjustment` : after < 0 ? `Balance can’t go below 0 (current ${n(user.points)})` : reason.trim().length < 3 ? "Add a reason" : null;

  const review = () => {
    setRequestId(newRequestId()); // one id per reviewed adjustment: retries and double-clicks can't apply it twice
    setErr(null);
    setStep("review");
  };
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.adjustPoints(user.id, delta, reason.trim(), requestId, notify);
      toast("ok", r.duplicate ? "Already applied, nothing changed." : `${mode === "issue" ? "Issued" : "Deducted"} ${n(amt)} pts · @${user.username} now has ${n(r.after)}`);
      onDone?.();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={() => !busy && onClose()} title={step === "form" ? "Adjust points" : "Review adjustment"} sub={`@${user.username} · ${user.name}`}
      footer={step === "form" ? (
        <>
          <Button tone="ghost" onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={!!problem} onClick={review}>Review</Button>
        </>
      ) : (
        <>
          <Button tone="ghost" onClick={() => setStep("form")} disabled={busy}><ArrowLeft size={14} /> Back</Button>
          <Button tone={mode === "issue" ? "primary" : "danger"} onClick={submit} busy={busy}>{mode === "issue" ? `Issue ${n(amt)} pts` : `Deduct ${n(amt)} pts`}</Button>
        </>
      )}>
      {step === "form" ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            {(["issue", "deduct"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={cx("flex h-11 items-center justify-center gap-2 rounded-xl text-[13.5px] font-semibold ring-1 ring-inset transition",
                mode === m ? (m === "issue" ? "bg-[#8247ff]/20 text-white ring-[#8247ff]/60" : "bg-[#ff5d73]/15 text-white ring-[#ff5d73]/50") : "bg-white/[0.03] text-[#a79db5] ring-white/[0.07] hover:text-white")}>
                {m === "issue" ? <Plus size={15} /> : <Minus size={15} />} {m === "issue" ? "Issue points" : "Deduct points"}
              </button>
            ))}
          </div>
          <Field label="Amount" hint={`Whole points, up to ${n(max)} per adjustment for your role.`}>
            <Input inputMode="numeric" autoFocus placeholder="e.g. 5,000" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d,]/g, ""))} icon={<Coins size={15} />} />
          </Field>
          <Field label="Reason (internal, saved to the ledger and activity log)">
            <div className="flex flex-wrap gap-1.5">
              {REASONS.map((r) => (
                <button key={r} onClick={() => setReason(r)} className={cx("rounded-lg px-2.5 py-1 text-[12px] ring-1 ring-inset", reason === r ? "bg-[#8247ff]/20 text-white ring-[#8247ff]/50" : "bg-white/[0.04] text-[#c9c1d6] ring-white/[0.07] hover:text-white")}>{r}</button>
              ))}
            </div>
            <TextArea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Why this adjustment" />
          </Field>
          <label className="flex items-center gap-2 text-[13px] text-[#c9c1d6]">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4 accent-[#8247ff]" />
            Send @{user.username} an in-app notification (the reason stays internal)
          </label>
          <DiffRows rows={[{ label: "Current balance", after: `${n(user.points)} pts` }, { label: "New balance", after: amt ? `${n(Math.max(0, after))} pts` : "—", emphasize: true }]} />
          {problem && amt > 0 && <p className="text-[12.5px] text-[#ffd889]">{problem}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <DiffRows rows={[
            { label: "User", after: `@${user.username}` },
            { label: "Action", after: mode === "issue" ? "Issue points" : "Deduct points" },
            { label: "Amount", after: `${signed(delta)} pts`, emphasize: true },
            { label: "Balance", before: n(user.points), after: `${n(after)} pts`, emphasize: true },
            { label: "Reason", after: reason.trim() },
            { label: "Notify user", after: notify ? "Yes" : "No" },
          ]} />
          <p className="text-[12px] text-[#8a8099]">Points are free, virtual and have no cash value. This change is written to the permanent points ledger and the activity log.</p>
          {err && <p className="rounded-xl bg-[#ff5d73]/10 p-3 text-[12.5px] text-[#ffb3be] ring-1 ring-inset ring-[#ff5d73]/25">{err}</p>}
        </div>
      )}
    </Modal>
  );
}

export function LedgerTable({ uid, compact: small }: { uid?: string; compact?: boolean }) {
  const { bump, go } = useAdmin();
  const [src, setSrc] = useState("");
  const [off, setOff] = useState(0);
  const lim = small ? 15 : 25;
  const { data, error, loading, reload } = useLoad(() => api.ledger(uid ?? null, src || null, lim, off), [uid, src, off, bump]);
  useEffect(() => setOff(0), [src]);
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <span className="text-[12px] text-[#8a8099]">{uid ? "Every change to this balance" : "Every change to every balance"}</span>
        <Select label="Source" value={src} onChange={setSrc} className="h-8 text-[12.5px]" options={[
          { value: "", label: "All sources" }, { value: "admin", label: "Admin adjustments" },
          ...Object.entries(SOURCE_LABEL).filter(([k]) => !k.startsWith("admin")).map(([value, label]) => ({ value, label }))]} />
      </div>
      {error ? <ErrorBox error={error} retry={reload} /> : !data ? <Spinner /> : !data.rows.length ? <Empty>No transactions.</Empty> : (
        <div className={loading ? "opacity-70" : ""}>
          <Table>
            <thead><tr><Th>When</Th>{!uid && <Th>User</Th>}<Th>Source</Th><Th right>Change</Th><Th right>Balance</Th><Th>Detail</Th></tr></thead>
            <tbody>
              {data.rows.map((t) => (
                <tr key={t.id}>
                  <Td className="whitespace-nowrap text-[#c9c1d6]">{dateTime(t.at)}</Td>
                  {!uid && <Td><button onClick={() => go("users", { id: t.userId })} className="text-[#e7dfef] hover:text-white">@{t.username ?? "deleted"}</button></Td>}
                  <Td><Pill tone={t.source.startsWith("admin") ? "plum" : "neutral"}>{SOURCE_LABEL[t.source] ?? t.source}</Pill></Td>
                  <Td right className={cx("font-semibold", t.delta > 0 ? "text-[#7beab8]" : "text-[#ff8a9a]")}>{signed(t.delta)}</Td>
                  <Td right className="text-[#c9c1d6]"><span className="text-[#8a8099]">{n(t.before)} →</span> {n(t.after)}</Td>
                  <Td className="text-[12.5px] text-[#c9c1d6]">
                    <div className="max-w-[280px] truncate">{t.reason ?? t.challenge ?? "—"}</div>
                    {t.admin && <div className="text-[11.5px] text-[#8a8099]">by @{t.admin}</div>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pager total={data.total} lim={lim} off={off} onChange={setOff} />
        </div>
      )}
    </div>
  );
}

export function PointsSection() {
  const { params, go, bump, refresh } = useAdmin();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [picked, setPicked] = useState<UserRow | null>(null);
  const [adjust, setAdjust] = useState(false);
  const results = useLoad(() => (dq.trim().length >= 2 ? api.users(dq, "all", "name", 8, 0) : Promise.resolve(null)), [dq]);
  const pickedFresh = useLoad(() => (picked ? api.user(picked.id) : Promise.resolve(null)), [picked?.id, bump]);
  const balance = pickedFresh.data?.points ?? picked?.points ?? 0;
  const target = useMemo(() => (picked ? { id: picked.id, username: picked.username, name: picked.name, points: balance } : null), [picked, balance]);

  useEffect(() => {
    if (params.user) void api.user(params.user).then((u) => setPicked({ ...u, status: u.status, restricted: !!u.restrictedAt, flagged: !!u.flaggedAt, plus: !!u.plus } as UserRow), () => {});
  }, [params.user]);

  return (
    <div className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
      <Card glow="plum" className="self-start">
        <CardHeader title="Issue or deduct points" sub="Find the account, then review before anything changes." />
        <div className="flex flex-col gap-4 p-5">
          <Input icon={<Search size={15} />} placeholder="Search @username, name or email" value={q} onChange={(e) => setQ(e.target.value)} />
          {results.data && dq.trim().length >= 2 && !picked && (
            <div className="overflow-hidden rounded-xl ring-1 ring-inset ring-white/[0.07]">
              {results.data.rows.length ? results.data.rows.map((u) => (
                <button key={u.id} onClick={() => { setPicked(u); setQ(""); }} className="flex w-full items-center gap-3 border-b border-white/[0.04] px-3 py-2.5 text-left last:border-0 hover:bg-white/[0.04]">
                  <Avatar name={u.name} src={u.avatar} hue={u.hue} size={30} />
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="truncate text-[13px] font-medium">{u.name}</div>
                    <div className="text-[12px] text-[#8a8099]">@{u.username}</div>
                  </div>
                  <span className="tabular text-[12.5px] text-[#c9c1d6]">{n(u.points)}</span>
                </button>
              )) : <div className="px-3 py-3 text-[12.5px] text-[#8a8099]">No matches.</div>}
            </div>
          )}
          {picked ? (
            <div className="rounded-2xl bg-white/[0.04] p-4 ring-1 ring-inset ring-white/[0.07]">
              <div className="flex items-center gap-3">
                <Avatar name={picked.name} src={picked.avatar} hue={picked.hue} size={44} />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="flex items-center gap-1.5 font-semibold">{picked.name}{picked.verified && <BadgeCheck size={15} className="text-[#b69aff]" />}</div>
                  <div className="text-[12.5px] text-[#8a8099]">@{picked.username}</div>
                </div>
                <button onClick={() => setPicked(null)} className="text-[12px] text-[#a79db5] hover:text-white">Change</button>
              </div>
              <div className="mt-4 text-[12px] text-[#a79db5]">Current balance</div>
              <div className="tabular font-display text-[34px] font-bold leading-tight">{n(balance)} <span className="text-[15px] font-medium text-[#a79db5]">pts</span></div>
              <div className="mt-4 flex gap-2">
                <Button tone="primary" className="flex-1" onClick={() => setAdjust(true)}><Coins size={15} /> Adjust points</Button>
                <Button onClick={() => go("users", { id: picked.id })}>Profile</Button>
              </div>
            </div>
          ) : (
            <p className="text-[12.5px] leading-relaxed text-[#8a8099]">
              Every adjustment needs a reason, goes through a review step, and is written to the permanent ledger with the before and after balance. The same reviewed adjustment can’t be applied twice.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Points ledger" sub={picked ? `Showing @${picked.username}` : "All accounts"}
          right={picked && <button onClick={() => setPicked(null)} className="text-[12.5px] text-[#b69aff] hover:text-white">Show all</button>} />
        <div className="mt-2"><LedgerTable uid={picked?.id} key={picked?.id ?? "all"} /></div>
      </Card>
      {adjust && target && <AdjustPointsDialog user={target} onClose={() => setAdjust(false)} onDone={refresh} />}
    </div>
  );
}
