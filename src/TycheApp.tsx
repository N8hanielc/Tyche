"use client";

import { useEffect, useState } from "react";
import { REMOTE } from "@/lib/supabase";
import { cx } from "@/lib/utils";
import { DEMO_INVITE_PASSWORD, checkInvite, hasAccess, requestInvite } from "@/lib/access";
import { StoreProvider, useStore } from "@/lib/store";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AuthScreens, Onboarding } from "@/screens/Auth";
import { NavProvider, useNav, type Screen } from "@/lib/nav";
import { BottomNav, Toast } from "@/components/layout/AppShell";
import { BottomSheet, Button, LogoMark } from "@/components/ui";
import { JoinSheet, ShareSheet } from "@/components/challenge/Sheets";
import { HomeScreen } from "@/screens/Home";
import { DiscoverScreen } from "@/screens/Discover";
import { RoomsScreen, GroupScreen } from "@/screens/Rooms";
import { ProfileScreen } from "@/screens/Profile";
import { RoomScreen } from "@/screens/Room";
import { CreateScreen } from "@/screens/Create";
import { NotificationsScreen } from "@/screens/Notifications";
import { LeaderboardScreen } from "@/screens/Leaderboard";
import { PlusScreen } from "@/screens/Plus";
import { NewNightScreen, NightScreen } from "@/screens/GameNight";
import { FollowsScreen } from "@/screens/Follows";

function Overlay({ s, index }: { s: Screen; index: number }) {
  let node: React.ReactNode = null;
  switch (s.kind) {
    case "room":
      node = <RoomScreen id={s.id} />;
      break;
    case "user":
      node = <ProfileScreen userId={s.id} />;
      break;
    case "notifications":
      node = <NotificationsScreen />;
      break;
    case "create":
      node = <CreateScreen prefill={s.prefill} />;
      break;
    case "group":
      node = <GroupScreen id={s.id} />;
      break;
    case "leaderboard":
      node = <LeaderboardScreen />;
      break;
    case "plus":
      node = <PlusScreen reason={s.reason} />;
      break;
    case "night":
      node = <NightScreen id={s.id} />;
      break;
    case "nightNew":
      node = <NewNightScreen />;
      break;
    case "follows":
      node = <FollowsScreen tab={s.tab} />;
      break;
  }
  return (
    <div className="fixed inset-0 flex justify-center" style={{ zIndex: 45 + index }}>
      <div className={`relative h-dvh w-full max-w-[440px] overflow-y-auto tyche-aurora no-scrollbar ${s.kind === "create" ? "animate-sheet" : "animate-slide"}`}>{node}</div>
    </div>
  );
}

function Shell() {
  const nav = useNav();
  return (
    <div className="min-h-dvh bg-ink">
      <div aria-hidden className="tyche-aurora pointer-events-none fixed inset-0 mx-auto max-w-[440px]" />
      <main className="relative mx-auto min-h-dvh max-w-[440px] pb-28 md:border-x md:border-white/[0.05]">
        {nav.tab === "home" && <HomeScreen />}
        {nav.tab === "discover" && <DiscoverScreen />}
        {nav.tab === "rooms" && <RoomsScreen />}
        {nav.tab === "profile" && <ProfileScreen />}
      </main>
      <BottomNav />
      {nav.stack.map((s, i) => (
        <Overlay key={`${s.kind}-${"id" in s ? s.id : ""}-${i}`} s={s} index={i} />
      ))}
      {nav.sheet?.kind === "join" && <JoinSheet />}
      {nav.sheet?.kind === "share" && <ShareSheet />}
      <Toast />
    </div>
  );
}

/** Shows auth screens when signed out; points the store at the signed-in account. */
function Gate() {
  const { session, ready, service } = useAuth();
  const { db, actions } = useStore();
  const uid = session?.userId;
  const synced = !!uid && db.meId === uid && !!db.users[uid];

  useEffect(() => {
    if (REMOTE || !uid || synced) return; // Supabase creates the profile at sign-up
    const p = service.getProfile(uid);
    actions.becomeUser(p ?? { id: uid, name: "New player", username: `player${uid.slice(-4)}` });
  }, [uid, synced, service, actions]);

  if (!ready || (uid && !synced))
    return (
      <div className="grid min-h-dvh place-items-center bg-ink">
        <LogoMark size={72} className="animate-pulse" />
      </div>
    );
  return (
    <NavProvider key={uid ?? "signed-out"}>
      {uid ? (REMOTE && db.users[uid]?.onboarded === false ? <Onboarding /> : <Shell />) : <AuthScreens />}
      {!uid && <Toast />}
      <ErrorToasts />
      {uid && <BillingReturn />}
      <RecoverySheet />
    </NavProvider>
  );
}

/** Surfaces server errors (e.g. “Minimum stake is 50 pts”) as toasts. */
function ErrorToasts() {
  const nav = useNav();
  useEffect(() => {
    const on = (e: Event) => nav.toast(String((e as CustomEvent).detail ?? "Something went wrong"));
    window.addEventListener("tyche:toast", on);
    return () => window.removeEventListener("tyche:toast", on);
  }, [nav]);
  return null;
}

/** Back from Stripe Checkout (?plus=success|canceled): confirm and refresh until the webhook lands. */
function BillingReturn() {
  const nav = useNav();
  const { actions } = useStore();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("plus");
    if (!status) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (status === "canceled") return nav.toast("Checkout canceled — no charge made");
    nav.toast("✦ Payment received — turning on Tyche+…");
    const timers = [1500, 4000, 8000, 15000].map((ms) => setTimeout(() => actions.reset(), ms));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/** After tapping a password-reset email link, set a new password. */
function RecoverySheet() {
  const { recovering, doneRecovering, service } = useAuth();
  const nav = useNav();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!recovering || !service.updatePassword) return null;
  return (
    <BottomSheet open onClose={doneRecovering} title="Set a new password">
      <input
        type="password"
        autoComplete="new-password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        placeholder="At least 8 characters"
        className="mb-2 h-14 w-full rounded-2xl bg-surface px-4 text-[16px] outline-none placeholder:text-dim focus:shadow-[0_0_0_1.5px_#8247ff]"
      />
      {err && <p className="mb-2 text-[13px] text-loss">{err}</p>}
      <Button
        size="lg"
        className="mt-2 w-full"
        disabled={busy || pw.length < 8}
        onClick={async () => {
          setBusy(true);
          try {
            await service.updatePassword!(pw);
            doneRecovering();
            nav.toast("Password updated");
          } catch (x) {
            setErr((x as Error).message);
          }
          setBusy(false);
        }}
      >
        Save password
      </Button>
    </BottomSheet>
  );
}

/**
 * Opening screen: the logo for 3 seconds while the app loads underneath.
 * When Tyche is invite-only (set in /admin → Access) and this device hasn't
 * been unlocked, it stays up and asks for an invite password instead.
 */
function Splash() {
  const [phase, setPhase] = useState<"show" | "gate" | "fade" | "gone">("show");
  const [access, setAccess] = useState<boolean | null>(null);
  const [minDone, setMinDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMinDone(true), 3000);
    void hasAccess().then(setAccess);
    return () => clearTimeout(t);
  }, []);

  const leave = () => {
    setPhase("fade");
    setTimeout(() => setPhase("gone"), 400);
  };
  useEffect(() => {
    if (!minDone || access === null || phase !== "show") return;
    if (access) leave();
    else setPhase("gate");
  }, [minDone, access, phase]);

  if (phase === "gone") return null;
  return (
    <div className={cx("fixed inset-0 z-[100] overflow-y-auto bg-ink transition-opacity duration-[400ms] ease-out", phase === "fade" && "pointer-events-none opacity-0")}>
      <div className="mx-auto flex min-h-full max-w-[400px] flex-col items-center justify-center px-6 py-[max(env(safe-area-inset-top),24px)]">
        <div className={cx("relative grid place-items-center transition-transform duration-500", phase === "gate" && "-translate-y-2")}>
          <div className="absolute h-44 w-44 rounded-full bg-brand/25 blur-3xl" />
          <LogoMark size={phase === "gate" ? 76 : 96} className="relative animate-pop transition-all duration-500" />
        </div>
        {phase === "gate" && <InviteGate onUnlock={leave} />}
      </div>
    </div>
  );
}

function InviteGate({ onUnlock }: { onUnlock: () => void }) {
  const [mode, setMode] = useState<"password" | "request" | "sent">("password");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const input = "h-12 w-full rounded-2xl bg-surface px-4 text-[16px] outline-none ring-1 ring-inset ring-white/[0.06] placeholder:text-dim focus:ring-brand/60";

  const unlock = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setErr("");
    try {
      if (await checkInvite(code)) onUnlock();
      else setErr("That password didn’t work. Check it and try again.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    setBusy(true);
    setErr("");
    try {
      await requestInvite(name, email, note);
      setMode("sent");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-8 w-full animate-rise">
      {mode === "password" && (
        <form onSubmit={(e) => { e.preventDefault(); void unlock(); }}>
          <h1 className="text-center font-display text-[24px] font-extrabold tracking-[-0.02em]">Tyche is invite-only</h1>
          <p className="mb-6 mt-1.5 text-center text-[14px] text-muted">Enter your invite password to get in.</p>
          <input value={code} onChange={(e) => { setCode(e.target.value); setErr(""); }} type="password" autoComplete="off" autoCapitalize="none" autoCorrect="off" placeholder="Invite password" aria-label="Invite password" className={input} autoFocus />
          {err && <p className="mt-2 text-center text-[13px] text-loss">{err}</p>}
          <Button type="submit" size="lg" className="mt-3 w-full" disabled={busy || !code.trim()}>{busy ? "Checking…" : "Enter"}</Button>
          <button type="button" onClick={() => { setMode("request"); setErr(""); }} className="mt-4 w-full py-2 text-[14px] text-muted">
            Don’t have one? <span className="font-semibold text-white">Request an invite</span>
          </button>
          {!REMOTE && <p className="mt-2 text-center text-[12px] text-dim">Demo password: {DEMO_INVITE_PASSWORD}</p>}
        </form>
      )}
      {mode === "request" && (
        <form onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <h1 className="text-center font-display text-[24px] font-extrabold tracking-[-0.02em]">Request an invite</h1>
          <p className="mb-6 mt-1.5 text-center text-[14px] text-muted">We’ll email you an invite password when a spot opens up.</p>
          <div className="space-y-2.5">
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your name" aria-label="Your name" className={input} />
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" autoCapitalize="none" placeholder="Email" aria-label="Email" className={input} />
            <input value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} placeholder="Who invited you? (optional)" aria-label="Note" className={input} />
          </div>
          {err && <p className="mt-2 text-center text-[13px] text-loss">{err}</p>}
          <Button type="submit" size="lg" className="mt-3 w-full" disabled={busy || name.trim().length < 2 || !email.includes("@")}>{busy ? "Sending…" : "Request invite"}</Button>
          <button type="button" onClick={() => { setMode("password"); setErr(""); }} className="mt-4 w-full py-2 text-[14px] text-muted">
            Have a password? <span className="font-semibold text-white">Enter it</span>
          </button>
        </form>
      )}
      {mode === "sent" && (
        <div className="text-center">
          <div className="mb-3 text-[36px]">💌</div>
          <h1 className="font-display text-[24px] font-extrabold tracking-[-0.02em]">You’re on the list</h1>
          <p className="mx-auto mt-1.5 max-w-[280px] text-[14px] text-muted">We’ll email {email.trim()} an invite password when you’re in.</p>
          <button type="button" onClick={() => setMode("password")} className="mt-6 w-full py-2 text-[14px] font-semibold text-white">I have a password</button>
        </div>
      )}
    </div>
  );
}

export function TycheApp() {
  return (
    <AuthProvider>
      <StoreProvider>
        <Gate />
        <Splash />
      </StoreProvider>
    </AuthProvider>
  );
}
