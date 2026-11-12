"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ID } from "./types";
import { uid } from "./utils";

/**
 * Auth boundary. The prototype keeps accounts in localStorage with salted
 * SHA-256 password hashes — fine for a demo, NOT real security. To go live,
 * implement AuthService with Supabase:
 *   signUp  -> supabase.auth.signUp({ email, password, options: { data: profile } })
 *   signIn  -> supabase.auth.signInWithPassword({ email, password })
 *   signOut -> supabase.auth.signOut()
 *   session -> supabase.auth.getSession() + onAuthStateChange
 *   oauth   -> supabase.auth.signInWithOAuth({ provider: "apple" | "google" })
 * and store the profile in a `profiles` table keyed by auth.users.id.
 */

export interface Profile {
  id: ID;
  name: string;
  username: string;
  avatar?: string;
  bio?: string;
  follows?: ID[];
}

export interface Session {
  userId: ID;
  email: string;
  createdAt: number;
}

export interface AuthService {
  getSession(): Session | null;
  getProfile(userId: ID): Profile | null;
  signUp(input: { email: string; password: string; profile: Omit<Profile, "id"> }): Promise<Session>;
  signIn(input: { email: string; password: string }): Promise<Session>;
  signOut(): void;
  emailTaken(email: string): boolean;
  usernameTaken(username: string): boolean;
  requestPasswordReset(email: string): Promise<void>;
}

interface Account {
  email: string;
  salt: string;
  hash: string;
  profile: Profile;
  createdAt: number;
}

const ACCOUNTS = "tyche:auth:accounts";
const SESSION = "tyche:auth:session";

/** Seeded demo login. */
export const DEMO = { email: "nate@tyche.app", password: "tyche1234" };

// Usernames already used by seeded people (kept here so auth doesn't depend on the data store).
const RESERVED = ["n8haniel", "marcus.eats", "jordyy", "myamyamya", "chris.ok", "danirae", "kevonthego", "hoopsoracle", "djsol", "tessreviews", "tariqtravels", "tyche", "admin", "support"];

export class AuthError extends Error {
  constructor(public field: "email" | "password" | "username" | "form", message: string) {
    super(message);
  }
}

async function hash(password: string, salt: string) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // non-secure-context fallback (prototype only)
  let h = 0;
  data.forEach((b) => (h = (h * 31 + b) | 0));
  return `fb${h}`;
}

const read = <T,>(k: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (k: string, v: unknown) => {
  try {
    v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
};
const norm = (e: string) => e.trim().toLowerCase();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const accounts = () => read<Account[]>(ACCOUNTS, []);

async function ensureDemo() {
  const list = read<Account[]>(ACCOUNTS, []);
  if (list.some((a) => a.email === DEMO.email)) return;
  const salt = "demo";
  list.push({
    email: DEMO.email, salt, hash: await hash(DEMO.password, salt), createdAt: Date.now(),
    profile: { id: "u_nate", name: "Nate", username: "n8haniel" },
  });
  write(ACCOUNTS, list);
}

export const localAuth: AuthService = {
  getSession: () => read<Session | null>(SESSION, null),
  getProfile: (userId) => accounts().find((a) => a.profile.id === userId)?.profile ?? null,
  emailTaken: (email) => accounts().some((a) => a.email === norm(email)),
  usernameTaken: (u) => {
    const x = u.trim().toLowerCase();
    return RESERVED.includes(x) || accounts().some((a) => a.profile.username.toLowerCase() === x);
  },
  async signUp({ email, password, profile }) {
    await wait(500);
    const e = norm(email);
    if (localAuth.emailTaken(e)) throw new AuthError("email", "An account with this email already exists.");
    if (localAuth.usernameTaken(profile.username)) throw new AuthError("username", "That username is taken.");
    const salt = uid("s");
    const acct: Account = { email: e, salt, hash: await hash(password, salt), createdAt: Date.now(), profile: { ...profile, id: uid("u") } };
    write(ACCOUNTS, [...accounts(), acct]);
    const session = { userId: acct.profile.id, email: e, createdAt: Date.now() };
    write(SESSION, session);
    return session;
  },
  async signIn({ email, password }) {
    await ensureDemo();
    await wait(450);
    const acct = accounts().find((a) => a.email === norm(email));
    if (!acct) throw new AuthError("email", "No account found with that email.");
    if ((await hash(password, acct.salt)) !== acct.hash) throw new AuthError("password", "That password isn’t right.");
    const session = { userId: acct.profile.id, email: acct.email, createdAt: Date.now() };
    write(SESSION, session);
    return session;
  },
  signOut: () => write(SESSION, null),
  async requestPasswordReset() {
    await wait(600);
  },
};

interface AuthCtx {
  session: Session | null;
  ready: boolean;
  service: AuthService;
  signUp: AuthService["signUp"];
  signIn: AuthService["signIn"];
  signOut: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children, service = localAuth }: { children: React.ReactNode; service?: AuthService }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    ensureDemo();
    setSession(service.getSession());
    setReady(true);
  }, [service]);

  const signUp = useCallback<AuthService["signUp"]>(async (i) => {
    const s = await service.signUp(i);
    setSession(s);
    return s;
  }, [service]);
  const signIn = useCallback<AuthService["signIn"]>(async (i) => {
    const s = await service.signIn(i);
    setSession(s);
    return s;
  }, [service]);
  const signOut = useCallback(() => {
    service.signOut();
    setSession(null);
  }, [service]);

  const value = useMemo(() => ({ session, ready, service, signUp, signIn, signOut }), [session, ready, service, signUp, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const a = useContext(Ctx);
  if (!a) throw new Error("useAuth outside AuthProvider");
  return a;
}
