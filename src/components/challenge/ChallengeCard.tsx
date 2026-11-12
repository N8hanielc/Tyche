"use client";

import { Clock, Heart, MessageCircle, Send, Users } from "lucide-react";
import type { Challenge, Option } from "@/lib/types";
import { useStore, useNow } from "@/lib/store";
import { useNav } from "@/lib/nav";
import { ago, countdown, cx, myEntry, statusLabel, totalPool, CATEGORY_EMOJI } from "@/lib/utils";
import { Avatar, CategoryTag, StatusDot } from "@/components/ui";
import { LineBadge, Outcomes } from "./Outcomes";

export function ChallengeCard({ c, index = 0 }: { c: Challenge; index?: number }) {
  const { db, actions } = useStore();
  const nav = useNav();
  const now = useNow(30_000);
  const creator = db.users[c.creatorId];
  const comments = db.messages.filter((m) => m.challengeId === c.id && m.kind === "chat").length;
  const liked = c.likes.includes(db.meId);
  const status = statusLabel(c, now);
  const mine = myEntry(c, db.meId);
  const open = () => nav.push({ kind: "room", id: c.id });
  const pick = (o: Option) => {
    if (status === "Open") nav.openSheet({ kind: "join", challengeId: c.id, optionId: o.id });
    else open();
  };

  const twoWay = c.options.length === 2;

  return (
    <article
      onClick={open}
      className="animate-rise cursor-pointer rounded-[26px] bg-card p-4 hairline transition-colors hover:bg-[#171a24]"
      style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
    >
      <header className="mb-3 flex items-center gap-2.5">
        <button
          onClick={(e) => {
            e.stopPropagation();
            nav.push({ kind: "user", id: c.creatorId });
          }}
        >
          <Avatar user={creator} size={34} />
        </button>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[14px] font-semibold">@{creator?.username}</div>
          <div className="text-[12px] text-dim">
            {ago(c.createdAt, now)} · {c.visibility === "public" ? "Public" : c.visibility === "group" ? db.groups.find((g) => g.id === c.groupId)?.name ?? "Group" : "Friends"}
          </div>
        </div>
        <StatusDot status={status} />
      </header>

      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-[13px]">{CATEGORY_EMOJI[c.category]}</span>
        <CategoryTag>{c.category}</CategoryTag>
      </div>
      <h3 className="mb-3 font-display text-[21px] font-bold leading-[1.15] tracking-[-0.02em] text-balance">{c.question}</h3>

      {c.media && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.media} alt="" className="mb-3 max-h-56 w-full rounded-2xl object-cover" />
      )}

      <LineBadge c={c} />
      <Outcomes c={c} db={db} onPick={pick} />

      <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
        {c.stakeMode === "bragging" ? (
          <span className="font-semibold text-gold">👑 {c.forfeit ?? "Bragging rights"}</span>
        ) : (
          <span className="font-semibold text-white tabular">
            {totalPool(c).toLocaleString()} pts <span className="font-normal text-muted">pool</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1 tabular">
          <Users size={13} /> {c.entries.length}
        </span>
        {status === "Open" && (
          <span className={cx("inline-flex items-center gap-1 tabular", c.closesAt - now < 30 * 60_000 && "text-gold")}>
            <Clock size={13} /> {countdown(c.closesAt, now)} left
          </span>
        )}
        {mine && (
          <span className="ml-auto rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-semibold text-lav">
            You: {c.options.find((o) => o.id === mine.optionId)?.label}
            {mine.points ? ` · ${mine.points}` : ""}
          </span>
        )}
      </div>

      <footer className="mt-3.5 flex items-center gap-1 border-t border-white/[0.05] pt-3">
        <button
          onClick={(e) => {
            e.stopPropagation();
            actions.toggleLike(c.id);
          }}
          className={cx("flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[13px] transition active:scale-90", liked ? "text-loss" : "text-muted hover:text-white")}
        >
          <Heart size={18} fill={liked ? "currentColor" : "none"} className={cx(liked && "animate-pop")} /> <span className="tabular">{c.likes.length}</span>
        </button>
        <button className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[13px] text-muted hover:text-white">
          <MessageCircle size={18} /> <span className="tabular">{comments}</span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            nav.openSheet({ kind: "share", challengeId: c.id });
          }}
          className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[13px] text-muted hover:text-white"
          aria-label="Share"
        >
          <Send size={17} />
        </button>
        <div className="ml-auto flex gap-1.5">
          {status === "Open" && !mine && twoWay ? (
            c.options.map((o, i) => (
              <button
                key={o.id}
                onClick={(e) => {
                  e.stopPropagation();
                  pick(o);
                }}
                className={cx(
                  "h-9 max-w-[118px] truncate rounded-xl px-3 text-[13px] font-semibold transition active:scale-95",
                  i === 0 ? "bg-brand text-white glow" : "bg-lav/15 text-lav",
                )}
              >
                Take {o.label.length > 9 ? o.label.split(" ")[0] : o.label}
              </button>
            ))
          ) : status === "Open" && !mine ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                nav.openSheet({ kind: "join", challengeId: c.id });
              }}
              className="h-9 rounded-xl bg-brand px-4 text-[13px] font-semibold text-white glow active:scale-95"
            >
              Join Challenge
            </button>
          ) : (
            <button className="h-9 rounded-xl bg-surface px-4 text-[13px] font-semibold text-white active:scale-95">
              {status === "Live" ? "Watch live" : status === "Settled" ? "View result" : "Open Room"}
            </button>
          )}
        </div>
      </footer>
    </article>
  );
}
