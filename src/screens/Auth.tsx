"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, AtSign, Camera, Check, ChevronLeft, Eye, EyeOff, Lock, Mail, Sparkles, User as UserIcon } from "lucide-react";
import { AuthError, DEMO, useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { useNav } from "@/lib/nav";
import { readImage } from "@/lib/media";
import { cx } from "@/lib/utils";
import { Avatar, BottomSheet, Button, Logo } from "@/components/ui";

type View = "welcome" | "signin" | "signup";

export function AuthScreens() {
  const [view, setView] = useState<View>("welcome");
  return (
    <div className="relative mx-auto min-h-dvh max-w-[440px] overflow-hidden bg-ink md:border-x md:border-white/[0.05]">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-brand/30 blur-[120px]" />
      <div key={view} className="relative animate-rise">
        {view === "welcome" && <Welcome go={setView} />}
        {view === "signin" && <SignIn go={setView} />}
        {view === "signup" && <SignUp go={setView} />}
      </div>
    </div>
  );
}

// ---------------- Welcome ----------------

function Welcome({ go }: { go: (v: View) => void }) {
  const { db } = useStore();
  const nav = useNav();
  const u = (id: string) => db.users[id];
  const cards = [
    { who: u("u_jordan"), cat: "🍽️ DINNER", q: "How many plates will Marcus eat?", a: "OVER", b: "UNDER", p: 68, rot: "-rotate-6", pos: "left-1 top-2" },
    { who: u("u_mya"), cat: "🃏 GAME NIGHT", q: "Who wins tonight’s Spades game?", a: "Nate & Mya", b: "Chris & Jordan", p: 49, rot: "rotate-3", pos: "right-0 top-[108px]" },
    { who: u("u_marcus"), cat: "🪩 NIGHTLIFE", q: "Will everyone make it to the club?", a: "YES", b: "NO", p: 40, rot: "-rotate-2", pos: "left-5 top-[212px]" },
  ];
  return (
    <div className="flex min-h-dvh flex-col px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-[max(env(safe-area-inset-top),20px)]">
      <Logo size={26} />
      <div className="relative mb-4 mt-5 h-[350px]">
        {cards.map((c, i) => (
          <div
            key={i}
            className={cx("absolute w-[78%] rounded-[24px] bg-card/95 p-4 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] hairline backdrop-blur", c.rot, c.pos)}
            style={{ animation: `rise .6s ${0.12 * i}s cubic-bezier(.2,.8,.2,1) both` }}
          >
            <div className="mb-2 flex items-center gap-2">
              <Avatar user={c.who} size={24} />
              <span className="text-[12px] font-semibold">@{c.who?.username}</span>
              <span className="ml-auto text-[10px] font-bold tracking-[0.12em] text-lav">{c.cat}</span>
            </div>
            <div className="mb-3 font-display text-[17px] font-bold leading-tight">{c.q}</div>
            <div className="grid grid-cols-2 gap-1.5 text-[12px] font-bold">
              <div className="truncate rounded-xl bg-brand/20 px-2.5 py-2 text-white">{c.a}</div>
              <div className="truncate rounded-xl bg-surface px-2.5 py-2 text-muted">{c.b}</div>
            </div>
            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-lav/20">
              <div className="h-full rounded-full bg-brand" style={{ width: `${c.p}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto">
        <h1 className="font-display text-[40px] font-extrabold leading-[1.02] tracking-[-0.04em]">
          Somebody disagrees?
          <br />
          <span className="bg-gradient-to-r from-lav to-brand bg-clip-text text-transparent">Put it on Tyche.</span>
        </h1>
        <p className="mb-6 mt-3 text-[15px] leading-relaxed text-muted">Make a challenge about anything, send it to the group chat, and settle it in the Room.</p>
        <Button size="lg" className="w-full" onClick={() => go("signup")}>
          Create account <ArrowRight size={18} />
        </Button>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <Button size="lg" variant="soft" onClick={() => nav.toast("Apple sign-in arrives with Supabase Auth")}>
            Apple
          </Button>
          <Button size="lg" variant="soft" onClick={() => nav.toast("Google sign-in arrives with Supabase Auth")}>
            Google
          </Button>
        </div>
        <p className="mt-5 text-center text-[14px] text-muted">
          Already on Tyche?{" "}
          <button onClick={() => go("signin")} className="font-semibold text-white underline-offset-4 hover:underline">
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}

// ---------------- Shared ----------------

function AuthHeader({ onBack, title, sub, step }: { onBack: () => void; title: string; sub?: string; step?: [number, number] }) {
  return (
    <div className="mb-7">
      <div className="mb-6 flex items-center justify-between">
        <button onClick={onBack} className="grid h-10 w-10 place-items-center rounded-full bg-card hairline active:scale-90" aria-label="Back">
          <ChevronLeft size={22} />
        </button>
        {step && (
          <div className="flex gap-1">
            {Array.from({ length: step[1] }).map((_, i) => (
              <span key={i} className={cx("h-1 rounded-full transition-all duration-500", i < step[0] ? "w-7 bg-brand" : "w-3 bg-surface")} />
            ))}
          </div>
        )}
        <div className="w-10" />
      </div>
      <h1 className="font-display text-[30px] font-extrabold leading-tight tracking-[-0.03em]">{title}</h1>
      {sub && <p className="mt-1.5 text-[15px] text-muted">{sub}</p>}
    </div>
  );
}

function Field({
  icon, label, error, hint, right, ...input
}: { icon: React.ReactNode; label: string; error?: string; hint?: React.ReactNode; right?: React.ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.12em] text-dim">{label}</span>
      <span className={cx("flex h-14 items-center gap-3 rounded-2xl bg-card px-4 hairline transition focus-within:shadow-[0_0_0_1.5px_#8247ff]", error && "shadow-[0_0_0_1.5px_#ff5d73]")}>
        <span className="text-dim">{icon}</span>
        <input {...input} className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-dim" />
        {right}
      </span>
      {error ? <span className="mt-1.5 block text-[13px] text-loss">{error}</span> : hint ? <span className="mt-1.5 block text-[13px] text-muted">{hint}</span> : null}
    </label>
  );
}

function PasswordField({ value, onChange, error, label = "Password", autoComplete }: { value: string; onChange: (v: string) => void; error?: string; label?: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <Field
      icon={<Lock size={18} />}
      label={label}
      type={show ? "text" : "password"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="••••••••"
      autoComplete={autoComplete}
      error={error}
      right={
        <button type="button" onClick={() => setShow(!show)} className="text-dim hover:text-white" aria-label={show ? "Hide password" : "Show password"}>
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      }
    />
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ---------------- Sign in ----------------

function SignIn({ go }: { go: (v: View) => void }) {
  const auth = useAuth();
  const nav = useNav();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<{ field: string; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  useEffect(() => setErr(null), [email, password]);

  const submit = async (e?: React.FormEvent, creds = { email, password }) => {
    e?.preventDefault();
    if (!EMAIL_RE.test(creds.email.trim())) return setErr({ field: "email", msg: "Enter a valid email." });
    if (!creds.password) return setErr({ field: "password", msg: "Enter your password." });
    setBusy(true);
    setErr(null);
    try {
      await auth.signIn(creds);
    } catch (x) {
      setErr(x instanceof AuthError ? { field: x.field, msg: x.message } : { field: "form", msg: "Something went wrong. Try again." });
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex min-h-dvh flex-col px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-[max(env(safe-area-inset-top),16px)]">
      <AuthHeader onBack={() => go("welcome")} title="Welcome back" sub="Your Rooms missed you." />
      <Field icon={<Mail size={18} />} label="Email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" error={err?.field === "email" ? err.msg : undefined} />
      <PasswordField value={password} onChange={setPassword} autoComplete="current-password" error={err?.field === "password" ? err.msg : undefined} />
      <button type="button" onClick={() => setForgot(true)} className="-mt-1 mb-6 self-end text-[13px] font-semibold text-lav">
        Forgot password?
      </button>
      {err?.field === "form" && <p className="mb-3 text-[13px] text-loss">{err.msg}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? <Spinner /> : "Sign in"}
      </Button>

      <button
        type="button"
        onClick={() => {
          setEmail(DEMO.email);
          setPassword(DEMO.password);
          submit(undefined, DEMO);
        }}
        className="mt-4 flex items-center gap-3 rounded-2xl bg-brand/10 p-3.5 text-left hairline transition active:scale-[0.99]"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-white">
          <Sparkles size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold">Use the demo account</span>
          <span className="block truncate text-[12px] text-muted">
            {DEMO.email} · {DEMO.password}
          </span>
        </span>
        <ArrowRight size={17} className="text-lav" />
      </button>

      <p className="mt-auto pt-8 text-center text-[14px] text-muted">
        New here?{" "}
        <button type="button" onClick={() => go("signup")} className="font-semibold text-white">
          Create an account
        </button>
      </p>
      <ForgotSheet open={forgot} onClose={() => setForgot(false)} initial={email} onSent={(m) => nav.toast(`Reset link sent to ${m}`)} />
    </form>
  );
}

function ForgotSheet({ open, onClose, initial, onSent }: { open: boolean; onClose: () => void; initial: string; onSent: (email: string) => void }) {
  const auth = useAuth();
  const [email, setEmail] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <BottomSheet open={open} onClose={onClose} title="Reset password">
      <p className="mb-4 text-[14px] text-muted">We’ll email you a link to set a new password.</p>
      <Field icon={<Mail size={18} />} label="Email" type="email" value={email || initial} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
      <Button
        size="lg"
        className="w-full"
        disabled={busy || !EMAIL_RE.test((email || initial).trim())}
        onClick={async () => {
          setBusy(true);
          await auth.service.requestPasswordReset(email || initial);
          setBusy(false);
          onClose();
          onSent(email || initial);
        }}
      >
        {busy ? <Spinner /> : "Send reset link"}
      </Button>
      <p className="mt-2 text-center text-[11px] text-dim">Prototype: no email is actually sent.</p>
    </BottomSheet>
  );
}

// ---------------- Sign up ----------------

function SignUp({ go }: { go: (v: View) => void }) {
  const auth = useAuth();
  const { db } = useStore();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState<string | undefined>();
  const [bio, setBio] = useState("");
  const [follows, setFollows] = useState<string[]>(["u_nate", "u_marcus", "u_mya"]);
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState<{ field: string; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => setErr(null), [email, password, agree, name, username]);

  const strength = [password.length >= 8, /[A-Z]/.test(password) || /[^a-zA-Z0-9]/.test(password), /\d/.test(password)].filter(Boolean).length;
  const uname = username.trim().toLowerCase();
  const unameValid = /^[a-z0-9._]{3,20}$/.test(uname);
  const unameTaken = unameValid && (auth.service.usernameTaken(uname) || Object.values(db.users).some((u) => u.username.toLowerCase() === uname));

  const step1 = () => {
    if (!EMAIL_RE.test(email.trim())) return setErr({ field: "email", msg: "Enter a valid email." });
    if (auth.service.emailTaken(email)) return setErr({ field: "email", msg: "That email already has an account. Sign in instead." });
    if (password.length < 8) return setErr({ field: "password", msg: "Use at least 8 characters." });
    if (!agree) return setErr({ field: "agree", msg: "Please confirm you’re 18+ and accept the terms." });
    setErr(null);
    setStep(2);
  };
  const step2 = () => {
    if (name.trim().length < 2) return setErr({ field: "name", msg: "Add your name." });
    if (!unameValid) return setErr({ field: "username", msg: "3–20 characters: letters, numbers, . or _" });
    if (unameTaken) return setErr({ field: "username", msg: "That username is taken." });
    setErr(null);
    setStep(3);
  };
  const finish = async () => {
    setBusy(true);
    try {
      await auth.signUp({ email, password, profile: { name: name.trim(), username: uname, avatar, bio: bio.trim() || undefined, follows } });
    } catch (x) {
      setBusy(false);
      if (x instanceof AuthError) {
        setErr({ field: x.field, msg: x.message });
        setStep(x.field === "email" || x.field === "password" ? 1 : 2);
      }
    }
  };

  const people = Object.values(db.users).filter((u) => !u.id.startsWith("c"));

  return (
    <div className="flex min-h-dvh flex-col px-5 pb-[max(env(safe-area-inset-bottom),20px)] pt-[max(env(safe-area-inset-top),16px)]">
      {step === 1 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            step1();
          }}
          className="flex flex-1 flex-col"
        >
          <AuthHeader onBack={() => go("welcome")} title="Create your account" sub="Takes 30 seconds. Way less than settling a debate." step={[1, 3]} />
          <Field icon={<Mail size={18} />} label="Email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" error={err?.field === "email" ? err.msg : undefined} />
          <PasswordField value={password} onChange={setPassword} autoComplete="new-password" error={err?.field === "password" ? err.msg : undefined} />
          {password && (
            <div className="-mt-2 mb-4 flex items-center gap-2">
              {[0, 1, 2].map((i) => (
                <span key={i} className={cx("h-1 flex-1 rounded-full transition", i < strength ? (strength === 3 ? "bg-win" : strength === 2 ? "bg-gold" : "bg-loss") : "bg-surface")} />
              ))}
              <span className="w-14 text-right text-[12px] text-muted">{["Weak", "Weak", "Okay", "Strong"][strength]}</span>
            </div>
          )}
          <button type="button" onClick={() => setAgree(!agree)} className="mb-1 flex items-start gap-3 text-left text-[13px] leading-snug text-muted">
            <span className={cx("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md transition", agree ? "bg-brand" : "border border-white/20")}>{agree && <Check size={13} strokeWidth={3} />}</span>
            I’m 18 or older and agree to the Terms and Privacy Policy. Tyche uses points only — no real money.
          </button>
          {err?.field === "agree" && <p className="mb-2 text-[13px] text-loss">{err.msg}</p>}
          <div className="mt-auto pt-8">
            <Button type="submit" size="lg" className="w-full">
              Continue
            </Button>
            <p className="mt-4 text-center text-[14px] text-muted">
              Have an account?{" "}
              <button type="button" onClick={() => go("signin")} className="font-semibold text-white">
                Sign in
              </button>
            </p>
          </div>
        </form>
      )}

      {step === 2 && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            step2();
          }}
          className="flex flex-1 flex-col"
        >
          <AuthHeader onBack={() => setStep(1)} title="Set up your profile" sub="This is how friends find you." step={[2, 3]} />
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={async (e) => e.target.files?.[0] && setAvatar(await readImage(e.target.files[0], 400))} />
          <button type="button" onClick={() => file.current?.click()} className="relative mx-auto mb-6 block">
            <Avatar user={{ id: "new", name: name || "?", username: uname, avatar, hue: 268, followers: 0, following: 0, baseWins: 0, baseLosses: 0, points: 0 }} size={96} className="ring-4 ring-card" />
            <span className="absolute bottom-0 right-0 grid h-9 w-9 place-items-center rounded-full bg-brand text-white ring-4 ring-ink">
              <Camera size={16} />
            </span>
          </button>
          <Field icon={<UserIcon size={18} />} label="Name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" error={err?.field === "name" ? err.msg : undefined} />
          <Field
            icon={<AtSign size={18} />}
            label="Username"
            autoComplete="username"
            autoCapitalize="none"
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/\s/g, "").toLowerCase())}
            placeholder="username"
            error={err?.field === "username" ? err.msg : undefined}
            hint={uname.length >= 3 ? (unameTaken ? <span className="text-loss">@{uname} is taken</span> : unameValid ? <span className="text-win">@{uname} is available</span> : "Letters, numbers, . or _") : undefined}
            right={uname.length >= 3 && unameValid && !unameTaken ? <Check size={18} className="text-win" /> : undefined}
          />
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.12em] text-dim">
              Bio <span className="normal-case tracking-normal text-dim/70">· optional</span>
            </span>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={120} rows={2} placeholder="UNDER merchant. Always." className="w-full resize-none rounded-2xl bg-card p-4 text-[15px] outline-none hairline placeholder:text-dim focus:shadow-[0_0_0_1.5px_#8247ff]" />
          </label>
          <div className="mt-auto pt-8">
            <Button type="submit" size="lg" className="w-full">
              Continue
            </Button>
          </div>
        </form>
      )}

      {step === 3 && (
        <div className="flex flex-1 flex-col">
          <AuthHeader onBack={() => setStep(2)} title="Find your people" sub="Follow friends to see their challenges in your feed." step={[3, 3]} />
          <div className="-mx-1 mb-6 space-y-1">
            {people.map((u) => {
              const on = follows.includes(u.id);
              return (
                <div key={u.id} className="flex items-center gap-3 rounded-2xl px-1 py-2">
                  <Avatar user={u} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold">{u.name}</div>
                    <div className="truncate text-[13px] text-muted">
                      @{u.username} · {u.followers.toLocaleString()} followers
                    </div>
                  </div>
                  <button
                    onClick={() => setFollows(on ? follows.filter((x) => x !== u.id) : [...follows, u.id])}
                    className={cx("h-9 w-24 shrink-0 rounded-xl text-[13px] font-semibold transition active:scale-95", on ? "bg-surface text-white" : "bg-white text-ink")}
                  >
                    {on ? "Following" : "Follow"}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="sticky bottom-0 mt-auto bg-gradient-to-t from-ink via-ink to-transparent pb-1 pt-6">
            <Button size="lg" className="w-full" disabled={busy} onClick={finish}>
              {busy ? <Spinner /> : `Join Tyche${follows.length ? ` · following ${follows.length}` : ""}`}
            </Button>
            {err?.field === "form" && <p className="mt-2 text-center text-[13px] text-loss">{err.msg}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />;
}
