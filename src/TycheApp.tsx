"use client";

import { useEffect } from "react";
import { StoreProvider, useStore } from "@/lib/store";
import { AuthProvider, useAuth } from "@/lib/auth";
import { AuthScreens } from "@/screens/Auth";
import { NavProvider, useNav, type Screen } from "@/lib/nav";
import { BottomNav, Toast } from "@/components/layout/AppShell";
import { LogoMark } from "@/components/ui";
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
    if (!uid || synced) return;
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
    </NavProvider>
  );
}

export function TycheApp() {
  return (
    <StoreProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </StoreProvider>
  );
}
