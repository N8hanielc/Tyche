import { supabase } from "@/lib/supabase";

/**
 * Typed wrappers around the admin_* database functions in supabase/admin.sql.
 * Every one of them checks the caller's admin role inside the database, so these
 * calls fail for anyone who isn't an admin no matter what the UI shows.
 */
export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new Error("The admin panel needs the live Supabase backend.");
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export type Role = "admin" | "super_admin";
export type UserStatus = "verified" | "unverified" | "suspended";
export type CampaignState = "on_track" | "slightly_behind" | "underdelivering" | "completed" | "paused" | "expired" | "scheduled" | "canceled";
export type Priority = "normal" | "high" | "urgent";

export interface Me { id: string; username: string; name: string; avatar?: string | null; hue: number; role: Role }

export interface UserRow {
  id: string; username: string; name: string; avatar?: string | null; hue: number; email?: string | null;
  createdAt: string; points: number; verified: boolean; status: UserStatus; restricted: boolean; flagged: boolean;
  flaggedReason?: string | null; plus: boolean; role?: Role | null; lastActiveAt?: string | null;
}
export interface Paged<T> { total: number; rows: T[] }

export interface LedgerRow {
  id: number; at: string; userId: string; username?: string; name?: string; delta: number; before: number; after: number;
  source: string; challengeId?: string | null; challenge?: string | null; adminId?: string | null; admin?: string | null; reason?: string | null;
}

export interface AdminLogRow {
  id: number; at: string; adminId: string; admin?: string; role: Role; action: string; targetType: string; targetId?: string;
  target?: string; before?: Record<string, unknown> | null; after?: Record<string, unknown> | null; reason?: string | null;
}

export interface UserDetail {
  id: string; username: string; name: string; avatar?: string | null; hue: number; bio?: string | null; email?: string | null;
  provider: string; lastSignInAt?: string | null; createdAt: string; points: number; verified: boolean; plus?: unknown; badges: string[];
  status: UserStatus; role?: Role | null; suspendedAt?: string | null; suspendedReason?: string | null; restrictedAt?: string | null;
  restrictedReason?: string | null; flaggedAt?: string | null; flaggedReason?: string | null; verifiedAt?: string | null; verifiedBy?: string | null;
  lastActiveAt?: string | null; activeDays30: number;
  stats: { created: number; joined: number; openStakes: number; lifetimeStaked: number; wins: number; losses: number; earned: number; spent: number; adminNet: number };
  activity: { kind: "joined" | "created"; at: string; challengeId: string; title: string; points?: number; option?: string; status: string }[];
  adminHistory: { id: number; at: string; admin: string; action: string; before?: Record<string, unknown>; after?: Record<string, unknown>; reason?: string }[];
}

export interface Campaign {
  id: string; advertiser: string; advertiserId: string; advertiserStatus: "active" | "paused" | "suspended";
  status: "active" | "paused" | "canceled"; state: CampaignState; priority: Priority; type: "banner" | "card" | "both";
  logo: string; tint: string; url: string; domain: string; question?: string | null; options: { label: string; sub?: string }[];
  cta: string; banner?: string | null; startsAt: string; endsAt: string; durationDays: number; createdAt: string;
  purchased: number; delivered: number; remaining: number; cardImpressions: number; bannerImpressions: number;
  clicks: number; ctr: number | null; reach: number; expectedNow: number; expectedPct: number; deliveryPct: number;
  pacePct: number | null; diffPct: number; dailyAvg: number | null; requiredDaily: number | null; estCompletion: string | null; daysLeft: number;
}

export interface Advertiser {
  id: string; name: string; contactName?: string | null; contactEmail?: string | null; contactPhone?: string | null; website?: string | null;
  notes?: string | null; status: "active" | "paused" | "suspended"; statusReason?: string | null; createdAt: string; logo?: string | null; tint?: string | null;
  campaigns: number; running: number; purchased: number; delivered: number; clicks: number;
}

export interface AdSetting {
  key: string; group: "banner" | "card" | "combined"; label: string; help: string; min: number; max: number; unit: string;
  more: "up" | "down"; zeroUnlimited: boolean; default: number; value: number; updatedAt?: string | null; updatedBy?: string | null;
}

export interface DayPoint {
  day: string; newUsers: number; totalUsers: number; dau: number; mau: number; adminIssued: number; adminDeducted: number; dailyClaims: number;
  bannerImpressions: number; cardImpressions: number; clicks: number;
}
export interface Overview {
  generatedAt: string; days: number;
  kpis: {
    users: number; usersNew7d: number; dau: number; mau: number; pointsBalances: number; pointsStaked: number; pointsAdminIssued: number;
    pointsAdminDeducted: number; verified: number; suspended: number; flagged: number; advertisersActive: number; advertisersTotal: number;
    bannerCampaignsActive: number; cardCampaignsActive: number; impressions: number; clicks: number; underdelivering: number; slightlyBehind: number;
    ledgerStartedAt?: string | null;
  };
  series: DayPoint[];
  campaigns: Campaign[];
}

export interface TeamMember { id: string; username: string; name: string; avatar?: string | null; hue: number; role: Role; grantedAt: string; grantedBy?: string | null }

export interface InviteCode { id: string; label: string; active: boolean; uses: number; lastUsedAt?: string | null; createdAt: string; createdBy?: string | null }
export interface InviteRequest { id: string; name: string; email: string; note?: string | null; status: "pending" | "invited" | "dismissed"; createdAt: string; handledAt?: string | null; handledBy?: string | null }
export interface Access { inviteOnly: boolean; updatedAt?: string | null; updatedBy?: string | null; codes: InviteCode[]; requests: InviteRequest[]; pending: number }

export const api = {
  access: () => rpc<Access>("admin_access"),
  setInviteOnly: (on: boolean, reason: string) => rpc<void>("admin_access_set", { on_off: on, reason }),
  createInviteCode: (label: string, code: string, reason?: string) => rpc<string>("admin_invite_code_create", { label, code, reason: reason || null }),
  setInviteCodeActive: (cid: string, on: boolean, reason: string) => rpc<void>("admin_invite_code_set_active", { cid, on_off: on, reason }),
  deleteInviteCode: (cid: string, reason: string) => rpc<void>("admin_invite_code_delete", { cid, reason }),
  setInviteRequest: (rid: string, status: InviteRequest["status"]) => rpc<void>("admin_invite_request_set", { rid, new_status: status }),
  whoami: () => rpc<Me>("admin_whoami"),
  overview: (days: number) => rpc<Overview>("admin_overview", { days }),
  users: (q: string, statusFilter: string, sort: string, lim: number, off: number) =>
    rpc<Paged<UserRow>>("admin_users", { q, status_filter: statusFilter, sort, lim, off }),
  user: (uid: string) => rpc<UserDetail>("admin_user", { uid }),
  ledger: (uid: string | null, src: string | null, lim: number, off: number) => rpc<Paged<LedgerRow>>("admin_points_ledger", { uid, src, lim, off }),
  adjustPoints: (uid: string, delta: number, reason: string, requestId: string, notifyUser: boolean) =>
    rpc<{ id: number; before: number; after: number; duplicate: boolean }>("admin_adjust_points", { uid, delta, reason, request_id: requestId, notify_user: notifyUser }),
  setVerified: (uid: string, on: boolean, reason: string) => rpc<void>("admin_set_verified", { uid, on_off: on, reason }),
  setAccountFlag: (uid: string, kind: "suspended" | "restricted" | "flagged", on: boolean, reason: string) =>
    rpc<void>("admin_set_account_flag", { uid, kind, on_off: on, reason }),
  advertisers: () => rpc<Advertiser[]>("admin_advertisers"),
  saveAdvertiser: (p: Record<string, unknown>, reason?: string) => rpc<string>("admin_advertiser_save", { p, reason: reason ?? null }),
  setAdvertiserStatus: (aid: string, status: Advertiser["status"], reason: string | null) =>
    rpc<void>("admin_advertiser_set_status", { aid, new_status: status, reason }),
  campaigns: () => rpc<Campaign[]>("admin_campaigns"),
  campaignDaily: (cid: string, days: number) =>
    rpc<{ day: string; cardImpressions: number; bannerImpressions: number; clicks: number }[]>("admin_campaign_daily", { cid, days }),
  saveCampaign: (p: Record<string, unknown>, reason?: string) => rpc<string>("admin_campaign_save", { p, reason: reason ?? null }),
  setCampaignStatus: (cid: string, status: Campaign["status"], reason: string | null) =>
    rpc<void>("admin_campaign_set_status", { cid, new_status: status, reason }),
  setCampaignPriority: (cid: string, priority: Priority, reason: string | null) =>
    rpc<void>("admin_campaign_set_priority", { cid, new_priority: priority, reason }),
  setCampaignDates: (cid: string, start: string, end: string, reason: string) =>
    rpc<void>("admin_campaign_set_dates", { cid, new_start: start, new_end: end, reason }),
  adSettings: () => rpc<AdSetting[]>("admin_ad_settings"),
  saveAdSettings: (changes: Record<string, number>, reason: string) => rpc<number>("admin_ad_settings_save", { changes, reason }),
  log: (f: { q?: string; act?: string; ttype?: string; admin?: string | null; since?: string | null; until?: string | null; lim: number; off: number }) =>
    rpc<Paged<AdminLogRow> & { admins: { id: string; username: string }[] }>("admin_log_list", {
      q: f.q ?? "", act: f.act ?? "", ttype: f.ttype ?? "", admin: f.admin ?? null, since: f.since ?? null, until: f.until ?? null, lim: f.lim, off: f.off,
    }),
  team: () => rpc<TeamMember[]>("admin_team"),
  setRole: (uid: string, role: Role | null, reason: string) => rpc<void>("admin_set_role", { uid, new_role: role, reason }),
};

export const newRequestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
