"use client";

import { useEffect, useRef, useState } from "react";
import { AtSign, Camera, Check, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { useNav } from "@/lib/nav";
import { readImage } from "@/lib/media";
import { deleteAccount } from "@/lib/account-client";
import { REMOTE } from "@/lib/supabase";
import { cx } from "@/lib/utils";
import { Avatar, BottomSheet, Button } from "@/components/ui";

const USERNAME = /^[a-z0-9._]{3,20}$/;

/** Edit your name, username, bio and photo. */
export function EditProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, actions } = useStore();
  const auth = useAuth();
  const nav = useNav();
  const me = db.users[db.meId];
  const [name, setName] = useState(me.name);
  const [username, setUsername] = useState(me.username);
  const [bio, setBio] = useState(me.bio ?? "");
  const [avatar, setAvatar] = useState<string | undefined>(me.avatar);
  const [taken, setTaken] = useState<Record<string, boolean | null>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const file = useRef<HTMLInputElement>(null);

  // start fresh from the saved profile every time the sheet opens
  useEffect(() => {
    if (!open) return;
    setName(me.name);
    setUsername(me.username);
    setBio(me.bio ?? "");
    setAvatar(me.avatar);
    setErr("");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const uname = username.trim().toLowerCase();
  const valid = USERNAME.test(uname);
  const changedName = uname !== me.username;
  const isTaken = changedName && taken[uname] === true;

  useEffect(() => {
    if (!open || !valid || !changedName || uname in taken) return;
    const t = setTimeout(async () => {
      const avail = auth.service.usernameAvailable;
      const ok = avail ? await avail(uname) : !Object.values(db.users).some((u) => u.id !== me.id && u.username === uname);
      setTaken((m) => ({ ...m, [uname]: ok === null ? null : !ok }));
    }, 350);
    return () => clearTimeout(t);
  }, [open, uname, valid, changedName, taken, auth.service, db.users, me.id]);

  const dirty = name.trim() !== me.name || changedName || bio.trim() !== (me.bio ?? "") || avatar !== me.avatar;

  const save = async () => {
    if (name.trim().length < 2) return setErr("Add your name.");
    if (!valid) return setErr("Usernames are 3–20 letters, numbers, . or _");
    if (isTaken) return setErr(`@${uname} is taken.`);
    setBusy(true);
    setErr("");
    const error = await actions.saveProfile({ name, username: uname, bio, ...(avatar !== me.avatar ? { avatar: avatar ?? "" } : {}) });
    setBusy(false);
    if (error) return setErr(error);
    nav.toast("Profile saved");
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Edit profile">
      <input
        ref={file}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) setAvatar(await readImage(f, 400));
          e.target.value = "";
        }}
      />
      <div className="mb-5 flex flex-col items-center gap-2">
        <button type="button" onClick={() => file.current?.click()} className="relative" aria-label="Change photo">
          <Avatar user={{ ...me, name: name || me.name, avatar }} size={88} className="ring-4 ring-card" />
          <span className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full bg-brand text-white ring-4 ring-raised">
            <Camera size={14} />
          </span>
        </button>
        <div className="flex gap-4 text-[13px] font-semibold">
          <button type="button" onClick={() => file.current?.click()} className="text-lav">Change photo</button>
          {avatar && (
            <button type="button" onClick={() => setAvatar(undefined)} className="flex items-center gap-1 text-muted">
              <Trash2 size={12} /> Remove
            </button>
          )}
        </div>
      </div>

      <label className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.12em] text-dim">Name</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value.slice(0, 60))}
        autoComplete="name"
        placeholder="Your name"
        className="mb-4 h-12 w-full rounded-2xl bg-surface px-4 text-[16px] outline-none placeholder:text-dim"
      />

      <label className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.12em] text-dim">Username</label>
      <div className={cx("flex h-12 items-center gap-2 rounded-2xl bg-surface px-4", isTaken && "ring-1 ring-loss/60")}>
        <AtSign size={16} className="text-dim" />
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value.replace(/\s/g, "").toLowerCase().slice(0, 20))}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="username"
          className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-dim"
        />
        {valid && changedName && taken[uname] === false && <Check size={18} className="text-win" />}
      </div>
      <p className="mb-4 mt-1.5 text-[12px] text-dim">
        {!valid ? "3–20 letters, numbers, . or _" : isTaken ? <span className="text-loss">@{uname} is taken</span> : changedName && taken[uname] === false ? <span className="text-win">@{uname} is available</span> : "Friends find you by this"}
      </p>

      <label className="mb-1.5 flex items-center justify-between text-[12px] font-bold uppercase tracking-[0.12em] text-dim">
        Bio <span className="font-medium normal-case tracking-normal tabular">{bio.length}/160</span>
      </label>
      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value.slice(0, 160))}
        rows={3}
        placeholder="Undefeated at Spades. Ask anyone."
        className="mb-4 w-full resize-none rounded-2xl bg-surface p-4 text-[15px] leading-relaxed outline-none placeholder:text-dim"
      />

      {err && <p className="mb-2 text-center text-[13px] text-loss">{err}</p>}
      <Button size="lg" className="w-full" disabled={busy || !dirty || isTaken} onClick={save}>
        {busy ? "Saving…" : "Save"}
      </Button>
    </BottomSheet>
  );
}

/** Permanent account deletion, behind a typed confirmation. */
export function DeleteAccountSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { db, actions } = useStore();
  const auth = useAuth();
  const nav = useNav();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const plus = !!db.users[db.meId]?.plus;
  useEffect(() => {
    if (open) {
      setTyped("");
      setErr("");
    }
  }, [open]);

  const go = async () => {
    setBusy(true);
    setErr("");
    try {
      await deleteAccount();
      if (!REMOTE) actions.reset();
      onClose();
      await auth.signOut();
      nav.toast("Your account was deleted");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Delete your account?">
      <p className="mb-3 text-[14px] text-muted">This can’t be undone. We’ll permanently delete:</p>
      <ul className="mb-4 space-y-1.5 text-[14px] text-white/85">
        <li>• Your profile, points and record</li>
        <li>• Challenges and Game Nights you created (others get their points back)</li>
        <li>• Your picks, messages and notifications</li>
        <li>• Every photo you uploaded</li>
        {plus && <li>• Your Tyche+ subscription (cancelled now, no more charges)</li>}
      </ul>
      <label className="mb-1.5 block text-[12px] font-bold uppercase tracking-[0.12em] text-dim">Type DELETE to confirm</label>
      <input
        value={typed}
        onChange={(e) => setTyped(e.target.value.toUpperCase())}
        autoCapitalize="characters"
        autoCorrect="off"
        placeholder="DELETE"
        className="mb-4 h-12 w-full rounded-2xl bg-surface px-4 text-[16px] font-semibold tracking-[0.1em] outline-none placeholder:text-dim"
      />
      {err && <p className="mb-2 text-center text-[13px] text-loss">{err}</p>}
      <Button size="lg" variant="danger" className="w-full" disabled={busy || typed !== "DELETE"} onClick={go}>
        {busy ? "Deleting…" : "Delete my account"}
      </Button>
      <button onClick={onClose} className="mt-2 w-full py-2 text-[14px] font-semibold text-muted">Keep my account</button>
    </BottomSheet>
  );
}
