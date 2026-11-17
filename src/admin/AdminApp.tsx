"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Building2, Coins, Gauge, LayoutDashboard, Loader2, LogOut, Megaphone, PanelLeftClose, PanelLeftOpen,
  RefreshCw, ScrollText, Search, ShieldCheck, SlidersHorizontal, Users,
} from "lucide-react";
import { REMOTE, supabase } from "@/lib/supabase";
import { api, type Me } from "./api";
import { Avatar, Button, Input, ToastProvider, cx } from "./ui";
import { Overview } from "./sections/Overview";
import { UsersSection } from "./sections/Users";
import { PointsSection } from "./sections/Points";
import { AdvertisersSection } from "./sections/Advertisers";
import { CampaignsSection } from "./sections/Campaigns";
import { PerformanceSection } from "./sections/Performance";
import { SettingsSection } from "./sections/Settings";
import { ActivitySection } from "./sections/Activity";
import { TeamSection } from "./sections/Team";

export type Section = "overview" | "users" | "points" | "advertisers" | "campaigns" | "performance" | "settings" | "activity" | "team";

const NAV: { id: Section; label: string; icon: React.ComponentType<{ size?: number }>; group: string }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, group: "Platform" },
  { id: "users", label: "Users", icon: Users, group: "Platform" },
  { id: "points", label: "Points", icon: Coins, group: "Platform" },
  { id: "advertisers", label: "Advertisers", icon: Building2, group: "Advertising" },
  { id: "campaigns", label: "Campaigns", icon: Megaphone, group: "Advertising" },
  { id: "performance", label: "Performance", icon: Gauge, group: "Advertising" },
  { id: "settings", label: "Ad settings", icon: SlidersHorizontal, group: "Advertising" },
  { id: "activity", label: "Activity log", icon: ScrollText, group: "Admin" },
  { id: "team", label: "Team", icon: ShieldCheck, group: "Admin" },
];
const TITLES: Record<Section, { title: string; sub: string }> = {
  overview: { title: "Overview", sub: "Platform activity across Tyche" },
  users: { title: "Users", sub: "Accounts, verification and status" },
  points: { title: "Points", sub: "Issue, deduct and audit virtual points" },
  advertisers: { title: "Advertisers", sub: "Companies buying placements" },
  campaigns: { title: "Campaigns", sub: "Banner and sponsored card campaigns" },
  performance: { title: "Performance", sub: "Delivery pacing and underdelivery" },
  settings: { title: "Ad settings", sub: "How often people see ads" },
  activity: { title: "Activity log", sub: "Every sensitive admin action, permanently recorded" },
  team: { title: "Team", sub: "Who can use this panel" },
};

// ---------------------------------------------------------------- context --

interface Nav { section: Section; params: Record<string, string>; go: (s: Section, params?: Record<string, string>) => void; me: Me; isSuper: boolean; bump: number; refresh: () => void }
const NavCtx = createContext<Nav | null>(null);
export const useAdmin = () => useContext(NavCtx)!;

function readHash(): { section: Section; params: Record<string, string> } {
  if (typeof window === "undefined") return { section: "overview", params: {} };
  const [path, query] = window.location.hash.replace(/^#\/?/, "").split("?");
  const section = (NAV.some((x) => x.id === path) ? path : "overview") as Section;
  return { section, params: Object.fromEntries(new URLSearchParams(query ?? "")) };
}

// ------------------------------------------------------------------- gate --

export function AdminApp() {
  return (
    <ToastProvider>
      <div className="admin-root min-h-dvh bg-[#0b0810] text-[#f4f1f8]">
        <Gate />
      </div>
    </ToastProvider>
  );
}

function Gate() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [denied, setDenied] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setMe(session === null ? null : undefined);
      return;
    }
    setMe(undefined);
    setDenied(null);
    // the database decides: admin_whoami refuses anyone without an admin role
    api.whoami().then(setMe, (e: Error) => {
      setMe(null);
      setDenied(e.message);
    });
  }, [session?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!REMOTE || !supabase)
    return <Center><p className="max-w-sm text-center text-[13.5px] text-[#a79db5]">The admin panel only works against the live Supabase backend. Unset <code>NEXT_PUBLIC_TYCHE_LOCAL</code> to use it.</p></Center>;
  if (session === undefined || (session && me === undefined)) return <Center><Loader2 className="animate-spin text-[#8a8099]" /></Center>;
  if (!session) return <SignIn />;
  if (!me)
    return (
      <Center>
        <div className="max-w-sm text-center">
          <div className="mb-2 font-display text-[22px] font-bold">Not available</div>
          <p className="mb-6 text-[13.5px] text-[#a79db5]">
            {denied?.includes("suspended") ? denied : "This account doesn’t have access to the Tyche admin panel."}
          </p>
          <Button onClick={() => void supabase!.auth.signOut()}>Sign out</Button>
        </div>
      </Center>
    );
  return <Shell me={me} />;
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-dvh place-items-center px-6">{children}</div>;
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setErr(error.message);
    setBusy(false);
  };
  return (
    <Center>
      <form onSubmit={submit} className="relative w-full max-w-[380px] overflow-hidden rounded-[26px] border border-white/[0.07] bg-[#140f1b] p-7">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(120% 80% at 100% 0%, rgba(130,71,255,0.25), transparent 60%)" }} />
        <div className="relative flex flex-col gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.png" alt="Tyche" className="h-11 w-11 rounded-xl" />
          <div>
            <h1 className="font-display text-[24px] font-bold tracking-[-0.02em]">Tyche Admin</h1>
            <p className="mt-1 text-[13px] text-[#a79db5]">Sign in with your Tyche account. Access is limited to approved admins.</p>
          </div>
          <Input type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {err && <p className="text-[12.5px] text-[#ff8a9a]">{err}</p>}
          <Button type="submit" tone="primary" busy={busy}>Sign in</Button>
          <button type="button" className="text-[12.5px] text-[#a79db5] hover:text-white"
            onClick={() => void supabase!.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/admin` } })}>
            Continue with Google
          </button>
        </div>
      </form>
    </Center>
  );
}

// ------------------------------------------------------------------ shell --

function Shell({ me }: { me: Me }) {
  const [route, setRoute] = useState(readHash);
  const [collapsed, setCollapsed] = useState(false);
  const [bump, setBump] = useState(0);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const on = () => setRoute(readHash());
    window.addEventListener("hashchange", on);
    const mq = window.matchMedia("(max-width: 1180px)");
    setCollapsed(mq.matches);
    const onMq = (e: MediaQueryListEvent) => setCollapsed(e.matches);
    mq.addEventListener("change", onMq);
    return () => {
      window.removeEventListener("hashchange", on);
      mq.removeEventListener("change", onMq);
    };
  }, []);

  const go = useCallback((section: Section, params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    window.location.hash = `/${section}${q ? `?${q}` : ""}`;
  }, []);
  const refresh = useCallback(() => setBump((b) => b + 1), []);
  const isSuper = me.role === "super_admin";
  const t = TITLES[route.section];

  let lastGroup = "";
  return (
    <NavCtx.Provider value={{ ...route, go, me, isSuper, bump, refresh }}>
      <div className="flex min-h-dvh">
        {/* sidebar */}
        <aside className={cx("sticky top-0 flex h-dvh shrink-0 flex-col border-r border-white/[0.05] bg-[#0e0a13] py-4 transition-[width] duration-200", collapsed ? "w-[76px] items-center px-3" : "w-[232px] px-3.5")}>
          <div className={cx("mb-6 flex items-center gap-2.5", collapsed ? "justify-center" : "px-1.5")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.png" alt="" className="h-9 w-9 rounded-[11px] shadow-[0_6px_20px_-6px_rgba(130,71,255,0.8)]" />
            {!collapsed && <div className="leading-tight"><div className="font-display text-[16px] font-bold">Tyche</div><div className="text-[11px] text-[#8a8099]">Admin control panel</div></div>}
          </div>
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
            {NAV.map((item) => {
              const header = !collapsed && item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              const active = route.section === item.id;
              const Icon = item.icon;
              return (
                <div key={item.id}>
                  {header && <div className="mb-1 mt-3 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#6f6680]">{header}</div>}
                  {collapsed && item.group !== NAV[0].group && NAV.find((x) => x.group === item.group)?.id === item.id && <div className="mx-auto my-2 h-px w-6 bg-white/[0.06]" />}
                  <button onClick={() => go(item.id)} title={collapsed ? item.label : undefined} aria-current={active ? "page" : undefined}
                    className={cx("group flex h-11 w-full items-center gap-3 rounded-[14px] text-[13.5px] font-medium transition",
                      collapsed ? "justify-center" : "px-3",
                      active ? "bg-gradient-to-br from-[#8247ff] to-[#5b2be0] text-white shadow-[0_10px_28px_-10px_rgba(130,71,255,0.95)]" : "text-[#a79db5] hover:bg-white/[0.05] hover:text-white")}>
                    <Icon size={19} />
                    {!collapsed && item.label}
                  </button>
                </div>
              );
            })}
          </nav>
          <div className="mt-3 flex flex-col gap-1 border-t border-white/[0.05] pt-3">
            <button onClick={() => setCollapsed((c) => !c)} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={cx("flex h-10 items-center gap-3 rounded-[14px] text-[13px] text-[#a79db5] hover:bg-white/[0.05] hover:text-white", collapsed ? "justify-center" : "px-3")}>
              {collapsed ? <PanelLeftOpen size={18} /> : <><PanelLeftClose size={18} /> Collapse</>}
            </button>
            <button onClick={() => void supabase!.auth.signOut()} title="Sign out"
              className={cx("flex h-10 items-center gap-3 rounded-[14px] text-[13px] text-[#a79db5] hover:bg-white/[0.05] hover:text-white", collapsed ? "justify-center" : "px-3")}>
              <LogOut size={18} />{!collapsed && "Sign out"}
            </button>
          </div>
        </aside>

        {/* main */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/[0.05] bg-[#0b0810]/85 px-5 py-3.5 backdrop-blur-xl lg:px-7">
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-[21px] font-bold tracking-[-0.02em]">{t.title}</h1>
              <p className="truncate text-[12.5px] text-[#8a8099]">{t.sub}</p>
            </div>
            <form className="hidden w-[300px] md:block" onSubmit={(e) => { e.preventDefault(); if (search.trim()) go("users", { q: search.trim() }); }}>
              <Input icon={<Search size={15} />} placeholder="Find a user by name, @username, email or ID" value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-full" />
            </form>
            <button onClick={refresh} title="Refresh data" className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.04] text-[#c9c1d6] ring-1 ring-inset ring-white/[0.07] hover:text-white"><RefreshCw size={16} /></button>
            <div className="flex items-center gap-2.5 rounded-full bg-white/[0.04] py-1 pl-1 pr-3.5 ring-1 ring-inset ring-white/[0.07]">
              <Avatar name={me.name} src={me.avatar} hue={me.hue} size={32} />
              <div className="hidden leading-tight sm:block">
                <div className="text-[13px] font-semibold">{me.name}</div>
                <div className="text-[11px] text-[#b69aff]">{me.role === "super_admin" ? "Super admin" : "Admin"}</div>
              </div>
            </div>
          </header>
          <main key={route.section} className="flex-1 px-5 py-6 animate-fade lg:px-7">
            {route.section === "overview" && <Overview />}
            {route.section === "users" && <UsersSection />}
            {route.section === "points" && <PointsSection />}
            {route.section === "advertisers" && <AdvertisersSection />}
            {route.section === "campaigns" && <CampaignsSection />}
            {route.section === "performance" && <PerformanceSection />}
            {route.section === "settings" && <SettingsSection />}
            {route.section === "activity" && <ActivitySection />}
            {route.section === "team" && <TeamSection />}
          </main>
        </div>
      </div>
    </NavCtx.Provider>
  );
}

