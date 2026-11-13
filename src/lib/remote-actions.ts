import type { DB, ID, Plan } from "./types";
import type { Draft } from "./store";
import { supabase } from "@/lib/supabase";

type Mutator = (db: DB) => void;

/** Shows a toast through NavProvider (see nav.tsx). */
export function toastError(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("tyche:toast", { detail: message.replace(/^.*?: /, "") }));
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
      void call("create_challenge", {
        p: {
          id,
          question: d.question,
          title: d.title,
          description: d.description,
          media: d.media ?? "",
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
      return id;
    },
    send(challengeId: ID, text: string, opts: { replyTo?: ID; image?: string } = {}) {
      if (!text.trim() && !opts.image) return;
      const id = newId();
      mutate((db) => {
        db.messages.push({ id, challengeId, kind: "chat", userId: db.meId, text: text.trim(), image: opts.image, replyTo: opts.replyTo, reactions: {}, at: Date.now() });
        db.lastRead[challengeId] = Date.now() + 1;
      });
      void call("send_message", { cid: challengeId, mid: id, body: text, reply: opts.replyTo ?? null, img: opts.image ?? null });
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
      void call("submit_result", { cid: challengeId, oid: optionId, val: value ?? null, evidence: evidence ?? null });
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
    follow(userId: ID) {
      mutate((db) => {
        db.following = db.following.includes(userId) ? db.following.filter((x) => x !== userId) : [...db.following, userId];
      });
      void call("follow_toggle", { target: userId });
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
  };
}
