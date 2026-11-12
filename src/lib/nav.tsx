"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ID } from "./types";
import type { Draft } from "./store";

export type Tab = "home" | "discover" | "rooms" | "profile";

export type Screen =
  | { kind: "room"; id: ID }
  | { kind: "user"; id: ID }
  | { kind: "notifications" }
  | { kind: "create"; prefill?: Partial<Draft> }
  | { kind: "group"; id: ID }
  | { kind: "leaderboard" }
  | { kind: "plus"; reason?: string };

export type Sheet =
  | { kind: "join"; challengeId: ID; optionId?: ID }
  | { kind: "share"; challengeId: ID; justPublished?: boolean }
  | null;

interface Nav {
  tab: Tab;
  stack: Screen[];
  sheet: Sheet;
  setTab: (t: Tab) => void;
  push: (s: Screen) => void;
  pop: () => void;
  replace: (s: Screen) => void;
  openSheet: (s: Sheet) => void;
  closeSheet: () => void;
  toast: (msg: string) => void;
  toastMsg: { id: number; msg: string } | null;
}

const Ctx = createContext<Nav | null>(null);

/**
 * In-app navigation stack (tabs + pushed screens + bottom sheets) so the
 * prototype behaves like a native app. Each Screen maps 1:1 to a future
 * Next.js route: /c/[id], /u/[id], /notifications, /create, /g/[id].
 */
export function NavProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTabState] = useState<Tab>("home");
  const [stack, setStack] = useState<Screen[]>([]);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toastMsg, setToast] = useState<{ id: number; msg: string } | null>(null);

  const toast = useCallback((msg: string) => {
    const id = Date.now();
    setToast({ id, msg });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 2200);
  }, []);

  const value = useMemo<Nav>(
    () => ({
      tab,
      stack,
      sheet,
      setTab: (t) => {
        setStack([]);
        setTabState(t);
        window.scrollTo({ top: 0 });
      },
      push: (s) => setStack((st) => [...st, s]),
      pop: () => setStack((st) => st.slice(0, -1)),
      replace: (s) => setStack((st) => [...st.slice(0, -1), s]),
      openSheet: setSheet,
      closeSheet: () => setSheet(null),
      toast,
      toastMsg,
    }),
    [tab, stack, sheet, toast, toastMsg],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNav() {
  const n = useContext(Ctx);
  if (!n) throw new Error("useNav outside NavProvider");
  return n;
}
