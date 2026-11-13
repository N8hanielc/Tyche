"use client";

import { useEffect, useState } from "react";
import { REMOTE } from "@/lib/supabase";
import { StoreProvider, useStore } from "@/lib/store";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AuthScreens } from "@/screens/Auth";
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
  }
  return (
    <div className="fixed inset-0 flex justify-center" style={{ zIndex: 45 + index }}>
      <div className={`relative h-dvh w-full max-w-[440px] overflow-y-auto bg-ink no-scrollbar ${s.kind === "create" ? "animate-sheet" : "animate-slide"}`}>{node}</div>
    </div>
  );
}

function Shell() {
  const nav = useNav();
  return (
    <div className="min-h-dvh bg-ink md:bg-[radial-gradient(60%_50%_at_50%_0%,rgba(130,71,255,0.12),transparent)]">
      <main className="relative mx-auto min-h-dvh max-w-[440px] bg-ink pb-28 md:border-x md:border-white/[0.05]">
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
      {uid ? <Shell /> : <AuthScreens />}
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

export function TycheApp() {
  return (
    <AuthProvider>
      <StoreProvider>
        <Gate />
      </StoreProvider>
    </AuthProvider>
  );
}
