import type { DB, ID, Night, Option, Plan } from "./types";
import type { Draft, PropSpecLite } from "./store";
import { supabase } from "@/lib/supabase";
import { uploadImage } from "@/lib/upload";

type Mutator = (db: DB) => void;

/** Shows a toast through NavProvider (see nav.tsx). */
export function toastError(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("tyche:toast", { detail: message.replace(/^.*?: /, "") }));
}

/** The part of a Night stored in nights.data (everything except its own columns). */
function nightData(n: Night) {
  const { id: _i, hostId: _h, name: _n, createdAt: _c, status: _s, endedAt: _e, champion: _ch, memberIds: _m, ...data } = n;
  return data;
}

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(16)}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`);

/**
 * Same action surface as the local store, but every write goes through a
 * Supabase RPC (rules enforced server-side), then the state is reloaded.
 * A few cheap actions update the screen optimistically first.
 */
export function makeRemoteActions(mutate: (fn: Mutator) => void, reload: () => Promise<void>) {
  const call = async (fn: string, args: Record<string, unknown> = {}, refresh = true) => {
    const { data, error } = await supabase!.rpc(fn, args);
    if (error) {
      toastError(error.message);
      if (refresh) await reload();
      return null;
    }
    if (refresh) await reload();
    return data ?? true;
  };

  return {
    join(challengeId: ID, optionId: ID, points: number) {
      void call("join_challenge", { cid: challengeId, oid: optionId, pts: points });
    },
    toggleLike(challengeId: ID) {
      mutate((db) => {
        const c = db.challenges.find((x) => x.id === challengeId);
        if (c) c.likes = c.likes.includes(db.meId) ? c.likes.filter((x) => x !== db.meId) : [...c.likes, db.meId];
      });
      void call("toggle_like", { cid: challengeId });
    },
    shared(challengeId: ID) {
      void call("add_share", { cid: challengeId }, false);
    },
    create(d: Draft): ID {
      const id = newId();
      const now = Date.now();
      void (async () => {
      const media = (await uploadImage(d.media, "challenge")) ?? "";
      await call("create_challenge", {
        p: {
          id,
          question: d.question,
          title: d.title,
          description: d.description,
          media,
          category: d.category,
          format: d.format,
          line: d.format === "over_under" ? d.line : null,
          unit: d.format === "over_under" ? d.unit : "",
          options: d.options,
          stakeMode: d.stakeMode,
          odds: d.odds,
          forfeit: d.forfeit,
          visibility: d.visibility,
          groupId: d.groupId ?? null,
          closesAt: d.closesAtExact ?? now + d.closesInMin * 60_000,
          startsAt: d.startsInMin == null ? null : now + d.startsInMin * 60_000,
          voteAt: d.verifier === "vote" && d.voteInMin != null ? now + d.voteInMin * 60_000 : null,
          resolution: d.resolution,
          tieRule: d.tieRule,
          verifier: d.verifier,
          myOptionId: d.myOptionId ?? null,
          stake: d.stake,
          invited: d.invited,
        },
      });
      })();
      return id;
    },
    send(challengeId: ID, text: string, opts: { replyTo?: ID; image?: string } = {}) {
      if (!text.trim() && !opts.image) return;
      const id = newId();
      mutate((db) => {
        db.messages.push({ id, challengeId, kind: "chat", userId: db.meId, text: text.trim(), image: opts.image, replyTo: opts.replyTo, reactions: {}, at: Date.now() });
        db.lastRead[challengeId] = Date.now() + 1;
      });
      void (async () => {
        const img = await uploadImage(opts.image, "chat");
        await call("send_message", { cid: challengeId, mid: id, body: text, reply: opts.replyTo ?? null, img: img ?? null });
      })();
    },
    react(messageId: ID, emoji: string) {
      mutate((db) => {
        const m = db.messages.find((x) => x.id === messageId);
        if (!m) return;
        const list = m.reactions[emoji] ?? [];
        m.reactions[emoji] = list.includes(db.meId) ? list.filter((x) => x !== db.meId) : [...list, db.meId];
        if (!m.reactions[emoji].length) delete m.reactions[emoji];
      });
      void call("react_message", { mid: messageId, emoji });
    },
    start(challengeId: ID) {
      void call("start_event", { cid: challengeId });
    },
    update(challengeId: ID, icon: string, text: string) {
      void call("post_update", { cid: challengeId, icon, body: text });
    },
    fastForward(_challengeId: ID, _mins: number) {
      /* demo-only control; hidden when connected to Supabase */
    },
    bump(challengeId: ID, delta: number) {
      mutate((db) => {
        const c = db.challenges.find((x) => x.id === challengeId);
        if (c?.live) c.live.counter = Math.max(0, (c.live.counter ?? 0) + delta);
      });
      void call("bump_counter", { cid: challengeId, delta });
    },
    stop(challengeId: ID) {
      void call("stop_timer", { cid: challengeId });
    },
    submit(challengeId: ID, optionId: ID | "__tie", value?: number, evidence?: string) {
      void (async () => {
        const url = await uploadImage(evidence, "evidence");
        await call("submit_result", { cid: challengeId, oid: optionId, val: value ?? null, evidence: url ?? null });
      })();
    },
    nudge(challengeId: ID) {
      void call("nudge", { cid: challengeId });
    },
    openVoting(challengeId: ID) {
      void call("open_voting", { cid: challengeId });
    },
    confirm(challengeId: ID) {
      void call("confirm_result", { cid: challengeId });
    },
    dispute(challengeId: ID, reason: string) {
      void call("dispute_result", { cid: challengeId, reason });
    },
    vote(challengeId: ID, optionId: ID) {
      void call("cast_vote", { cid: challengeId, oid: optionId });
    },
    demoDeadline(_challengeId: ID) {
      /* demo-only */
    },
    demoEndVote(_challengeId: ID) {
      /* demo-only */
    },
    async saveProfile(p: { name: string; username: string; bio: string; avatar?: string }): Promise<string | null> {
      // a new photo arrives as a data: URL; upload it and store the public URL
      const avatar = p.avatar?.startsWith("data:") ? ((await uploadImage(p.avatar, "avatar")) ?? undefined) : p.avatar;
      if (p.avatar?.startsWith("data:") && !avatar) return "Couldn’t upload that photo. Try another one.";
      const { error } = await supabase!.rpc("update_profile", {
        p: { name: p.name.trim(), username: p.username.trim().toLowerCase(), bio: p.bio.trim(), ...(avatar !== undefined ? { avatar } : {}) },
      });
      await reload();
      return error ? error.message : null;
    },
    follow(userId: ID) {
      mutate((db) => {
        const on = db.following.includes(userId);
        const asked = (db.requested ?? []).includes(userId);
        if (!on && asked) db.requested = (db.requested ?? []).filter((x) => x !== userId);
        else if (!on && db.users[userId]?.private) db.requested = [...(db.requested ?? []), userId];
        else db.following = on ? db.following.filter((x) => x !== userId) : [...db.following, userId];
      });
      void call("follow_toggle", { target: userId });
    },
    respondFollow(requester: ID, accept: boolean) {
      mutate((db) => {
        db.followRequests = (db.followRequests ?? []).filter((x) => x !== requester);
        db.notifications = db.notifications.filter((n) => !(n.kind === "follow_request" && n.actorId === requester));
        if (accept) db.followerIds = [requester, ...(db.followerIds ?? []).filter((x) => x !== requester)];
      });
      void call("respond_follow_request", { requester, accept });
    },
    setPrivate(on: boolean) {
      mutate((db) => {
        db.users[db.meId].private = on;
      });
      void call("set_private", { on_off: on });
    },
    removeFollower(id: ID) {
      mutate((db) => {
        db.followerIds = (db.followerIds ?? []).filter((x) => x !== id);
      });
      void call("remove_follower", { follower_id: id });
    },
    becomeUser(_p: { id: ID; name: string; username: string; avatar?: string; bio?: string; follows?: ID[] }) {
      /* not used with Supabase: the profile row is created at sign-up */
    },
    claimDaily(onDone?: (amount: number, streak: number) => void) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      void call("claim_daily", { tz }).then((r) => {
        if (r && typeof r === "object" && "amount" in (r as object)) {
          const { amount, streak } = r as { amount: number; streak: number };
          onDone?.(amount, streak);
        }
      });
    },
    subscribe(plan: Plan) {
      void call("subscribe_plus", { plan });
    },
    setCardTheme(theme: string) {
      mutate((db) => {
        db.users[db.meId].cardTheme = theme;
      });
      void call("set_card_theme", { theme }, false);
    },
    cancelPlus() {
      void call("set_plus_canceled", { canceled: true });
    },
    resumePlus() {
      void call("set_plus_canceled", { canceled: false });
    },
    readNotifications() {
      mutate((db) => db.notifications.forEach((n) => (n.read = true)));
      void call("read_notifications", {}, false);
    },
    readRoom(challengeId: ID) {
      mutate((db) => {
        db.lastRead[challengeId] = Date.now();
      });
      void call("read_room", { cid: challengeId }, false);
    },
    createGroup(name: string, emoji: string, memberIds: ID[]) {
      const id = newId();
      mutate((db) => {
        db.groups.unshift({ id, ownerId: db.meId, name, emoji, memberIds: [db.meId, ...memberIds], createdAt: Date.now() });
      });
      void call("create_group", { gid: id, gname: name, gemoji: emoji, members: memberIds });
      return id;
    },
    reset() {
      void reload();
    },

    // ---------------- Game Night ----------------

    createNight(n: Night): ID {
      mutate((db) => {
        db.nights = [n, ...(db.nights ?? [])];
      });
      void call("create_night", { nid: n.id, nname: n.name, ndata: nightData(n), members: n.memberIds });
      return n.id;
    },
    saveNight(n: Night) {
      mutate((db) => {
        db.nights = (db.nights ?? []).map((x) => (x.id === n.id ? structuredClone(n) : x));
      });
      void call("update_night", { nid: n.id, ndata: nightData(n) });
    },
    inviteToNight(nightId: ID, userIds: ID[]) {
      void call("night_invite", { nid: nightId, members: userIds });
    },
    createProps(nightId: ID, gameId: ID | undefined, specs: PropSpecLite[]): ID[] {
      const ids = specs.map(() => newId());
      void (async () => {
        const now = Date.now();
        for (let i = 0; i < specs.length; i++) {
          const s = specs[i];
          const { error } = await supabase!.rpc("create_challenge", {
            p: {
              id: ids[i], nightId, gameId: gameId ?? "", question: s.question, format: s.format, category: "Game Night",
              line: s.line ?? null, unit: s.unit ?? "", options: s.options, stakeMode: "even", visibility: "night",
              closesAt: now + 24 * 3_600_000, resolution: "Settled from the Game Night scoreboard by the host.", tieRule: "refund",
              verifier: "creator", prop: s.meta, invited: [],
            },
          });
          if (error) toastError(error.message);
        }
        await reload();
      })();
      return ids;
    },
    approveProp(cid: ID) {
      void call("night_approve_prop", { cid });
    },
    editProp(cid: ID, question: string, options?: Option[], line?: number) {
      void call("night_edit_prop", { cid, q: question, opts: options ?? null, new_line: line ?? null });
    },
    removeProp(cid: ID) {
      mutate((db) => {
        db.challenges = db.challenges.filter((x) => x.id !== cid);
      });
      void call("night_remove_prop", { cid });
    },
    lockProps(cids: ID[]) {
      if (cids.length) void call("night_lock", { cids });
    },
    settleProps(items: { cid: ID; optionId: ID; value?: number }[]) {
      if (items.length) void call("night_settle", { items });
    },
    resettleProp(cid: ID, optionId: ID) {
      void call("night_resettle", { cid, oid: optionId });
    },
    disputeProp(cid: ID, reason: string) {
      void call("night_dispute", { cid, reason });
    },
    endNight(n: Night, champion: NonNullable<Night["champion"]> & { name: string }) {
      mutate((db) => {
        const x = db.nights?.find((y) => y.id === n.id);
        if (x) Object.assign(x, structuredClone(n), { status: "ended", endedAt: Date.now(), champion });
      });
      void call("end_night", { nid: n.id, champ: champion, ndata: nightData(n) });
    },
  };
}
