-- ============================================================================
-- Tyche — Admin Control Panel (/admin)
-- Run in Supabase → SQL Editor AFTER schema.sql (and billing.sql if you use it).
-- Safe to re-run. Re-run it any time you re-run schema.sql.
--
-- Security model
--   • Roles live in tyche_private.admin_roles (not reachable through the API).
--   • Every admin_* function checks the caller's role inside the database
--     (tyche_private.require_admin) before doing anything. Hiding buttons in the
--     UI is not what protects these; the database refuses non-admins.
--   • Every change writes an append-only row to tyche_private.admin_log in the
--     same transaction, so an action can't happen without its log entry.
--   • No service-role key is used: admins act with their own signed-in session.
--
-- First super admin (run once, with your own username):
--   insert into tyche_private.admin_roles (user_id, role)
--   select id, 'super_admin' from public.profiles where username = 'n8haniel'
--   on conflict (user_id) do update set role = 'super_admin';
-- ============================================================================

-- ---------------------------------------------------------------- tables ----

create table if not exists tyche_private.admin_roles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role text not null check (role in ('admin', 'super_admin')),
  granted_by uuid,
  granted_at timestamptz not null default now()
);

-- Permanent audit trail. No foreign keys, so entries survive account deletion.
create table if not exists tyche_private.admin_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default clock_timestamp(),
  admin_id uuid not null,
  admin_username text,
  admin_role text not null,
  action text not null,              -- e.g. user.verify, points.issue, campaign.priority, settings.update
  target_type text not null check (target_type in ('user', 'advertiser', 'campaign', 'setting', 'admin')),
  target_id text,
  target_label text,
  before jsonb,
  after jsonb,
  reason text
);
create index if not exists admin_log_at on tyche_private.admin_log (at desc);
create index if not exists admin_log_target on tyche_private.admin_log (target_type, target_id);
create index if not exists admin_log_admin on tyche_private.admin_log (admin_id, at desc);

drop trigger if exists admin_log_append_only on tyche_private.admin_log;
create trigger admin_log_append_only before update or delete on tyche_private.admin_log
  for each row execute function tyche_private.append_only();
drop trigger if exists admin_log_no_truncate on tyche_private.admin_log;
create trigger admin_log_no_truncate before truncate on tyche_private.admin_log
  for each statement execute function tyche_private.append_only();

-- --------------------------------------------------------------- helpers ----

create or replace function tyche_private.admin_role(uid uuid) returns text language sql stable as $$
  select role from tyche_private.admin_roles where user_id = uid
$$;

-- Raises unless the caller is an admin (or a super admin when need = 'super_admin').
-- Also fails for suspended admins, because tyche_private.me() does.
create or replace function tyche_private.require_admin(need text default 'admin') returns uuid language plpgsql stable as $$
declare uid uuid := tyche_private.me(); r text;
begin
  r := tyche_private.admin_role(uid);
  if r is null or (need = 'super_admin' and r <> 'super_admin') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return uid;
end $$;

create or replace function tyche_private.need_reason(reason text) returns text language plpgsql immutable as $$
begin
  if reason is null or char_length(trim(reason)) < 3 then raise exception 'Add a reason (at least 3 characters)'; end if;
  if char_length(reason) > 500 then raise exception 'Keep the reason under 500 characters'; end if;
  return trim(reason);
end $$;

-- Admins can't act on their own account, and only super admins can act on another admin's.
create or replace function tyche_private.guard_target(target uuid) returns public.profiles language plpgsql stable as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = target;
  if not found then raise exception 'User not found'; end if;
  if target = auth.uid() then raise exception 'You can’t change your own account from the admin panel'; end if;
  if tyche_private.admin_role(target) is not null and tyche_private.admin_role(auth.uid()) <> 'super_admin' then
    raise exception 'Only a super admin can change another admin’s account' using errcode = '42501';
  end if;
  return p;
end $$;

create or replace function tyche_private.audit(act text, ttype text, tid text, tlabel text, before jsonb, after jsonb, reason text)
returns void language sql as $$
  insert into tyche_private.admin_log (admin_id, admin_username, admin_role, action, target_type, target_id, target_label, before, after, reason)
  values (auth.uid(), (select username from public.profiles where id = auth.uid()), coalesce(tyche_private.admin_role(auth.uid()), '?'),
          act, ttype, tid, tlabel, before, after, nullif(trim(coalesce(reason, '')), ''))
$$;

create or replace function tyche_private.user_status(uid uuid) returns text language sql stable as $$
  select case when s.suspended_at is not null then 'suspended' when p.verified then 'verified' else 'unverified' end
  from public.profiles p left join tyche_private.account_status s on s.user_id = p.id where p.id = uid
$$;

-- Campaign delivery, pacing and status, computed live.
create or replace view tyche_private.campaign_stats as
with ev as (
  select campaign_id,
    count(*) filter (where kind = 'impression') as imp,
    count(*) filter (where kind = 'impression' and format = 'card') as card_imp,
    count(*) filter (where kind = 'impression' and format = 'banner') as banner_imp,
    count(*) filter (where kind = 'click') as clicks,
    count(distinct user_id) filter (where kind = 'impression') as reach
  from public.ad_events group by campaign_id
), b1 as (
  select c.*, v.id as advertiser_id, v.status as advertiser_status,
    coalesce(ev.imp, 0)::int as delivered,
    coalesce(ev.card_imp, 0)::int as card_impressions,
    coalesce(ev.banner_imp, 0)::int as banner_impressions,
    coalesce(ev.clicks, 0)::int as clicks,
    coalesce(ev.reach, 0)::int as reach,
    least(1, greatest(0, extract(epoch from (now() - c.starts_at)) / nullif(extract(epoch from (c.ends_at - c.starts_at)), 0)))::numeric as elapsed,
    greatest(0, extract(epoch from (least(now(), c.ends_at) - c.starts_at)) / 86400.0)::numeric as days_elapsed,
    (extract(epoch from (c.ends_at - now())) / 86400.0)::numeric as days_left
  from public.ad_campaigns c
  join public.ad_advertisers v on v.name = c.advertiser
  left join ev on ev.campaign_id = c.id
), b2 as (
  select b1.*,
    case when card_question is not null and banner_text is not null then 'both' when card_question is not null then 'card' else 'banner' end as ctype,
    greatest(0, impressions_purchased - delivered) as remaining,
    impressions_purchased * elapsed as expected_raw,
    case when days_elapsed > 0 then delivered / greatest(days_elapsed, 1 / 24.0) end as daily_avg_raw
  from b1
)
select b2.*,
  round(expected_raw)::int as expected_now,
  round(100 * elapsed, 1) as expected_pct,
  round(100.0 * delivered / impressions_purchased, 1) as delivery_pct,
  case when expected_raw >= 1 and now() >= starts_at + interval '12 hours' then round(100.0 * delivered / expected_raw, 1) end as pace_pct,
  round(100.0 * delivered / impressions_purchased - 100 * elapsed, 1) as diff_pct,
  round(daily_avg_raw, 1) as daily_avg,
  case when days_left > 0 and remaining > 0 then ceil(remaining / greatest(days_left, 1 / 24.0))::int end as required_daily,
  case when remaining = 0 then null
       when daily_avg_raw > 0 then now() + make_interval(secs => (remaining / daily_avg_raw * 86400)::double precision) end as est_completion,
  round(100.0 * clicks / nullif(delivered, 0), 2) as ctr_pct,
  case
    when status = 'canceled' then 'canceled'
    when delivered >= impressions_purchased then 'completed'
    when status = 'paused' or advertiser_status <> 'active' then 'paused'
    when now() >= ends_at then 'expired'
    when now() < starts_at then 'scheduled'
    -- first 12 hours: too early to judge pace
    when now() < starts_at + interval '12 hours' or expected_raw < 1 or delivered >= 0.95 * expected_raw then 'on_track'
    when delivered >= 0.85 * expected_raw then 'slightly_behind'
    else 'underdelivering'
  end as state
from b2;

create or replace function tyche_private.campaign_json(c tyche_private.campaign_stats) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'id', c.id, 'advertiser', c.advertiser, 'advertiserId', c.advertiser_id, 'advertiserStatus', c.advertiser_status,
    'status', c.status, 'state', c.state, 'priority', c.priority, 'type', c.ctype,
    'logo', c.logo, 'tint', c.tint, 'url', c.url, 'domain', c.domain,
    'question', c.card_question, 'options', c.card_options, 'cta', c.card_cta, 'banner', c.banner_text,
    'startsAt', c.starts_at, 'endsAt', c.ends_at, 'durationDays', c.duration_days, 'createdAt', c.created_at,
    'purchased', c.impressions_purchased, 'delivered', c.delivered, 'remaining', c.remaining,
    'cardImpressions', c.card_impressions, 'bannerImpressions', c.banner_impressions,
    'clicks', c.clicks, 'ctr', c.ctr_pct, 'reach', c.reach,
    'expectedNow', c.expected_now, 'expectedPct', c.expected_pct, 'deliveryPct', c.delivery_pct,
    'pacePct', c.pace_pct, 'diffPct', c.diff_pct, 'dailyAvg', c.daily_avg, 'requiredDaily', c.required_daily,
    'estCompletion', c.est_completion, 'daysLeft', greatest(0, ceil(c.days_left))::int)
$$;

-- Editable ad settings: label, group, bounds, and which direction means "more ads".
create or replace function tyche_private.ad_setting_meta() returns table (key text, grp text, label text, help text, min numeric, max numeric, unit text, more text, zero_unlimited boolean, sort int)
language sql immutable as $$
  values
    ('ad_banner_enabled',          'banner',   'Banner ads on',                                 'Turn the Discover banner on or off everywhere.',                          0, 1,   'toggle',   'up',   false, 10),
    ('ad_cap_company_banner_day',  'banner',   'Banners per advertiser per user per day',       'Same company, banner placement, per viewer per day.',                    1, 50,  'per day',  'up',   false, 11),
    ('ad_banner_max_share_pct',    'banner',   'Max share of banner impressions per advertiser','One company’s share of all banner impressions in the last 24h. 100 = off.', 10, 100, '%',        'up',   false, 12),
    ('ad_banner_max_creatives',    'banner',   'Active banner creatives per advertiser',        'How many of one company’s banner campaigns can rotate at once.',          0, 20,  'creatives','up',   true,  13),
    ('ad_banner_rotate_sec',       'banner',   'Banner rotation interval',                      'How often the banner swaps to another campaign.',                        5, 300, 'seconds',  'down', false, 14),
    ('ad_banner_session_limit',    'banner',   'Banners per session',                           'Banner impressions per app session.',                                    0, 200, 'per session','up', true,  15),
    ('ad_card_enabled',            'card',     'Sponsored cards on',                            'Turn sponsored feed cards on or off everywhere.',                        0, 1,   'toggle',   'up',   false, 20),
    ('ad_card_min_organic',        'card',     'Organic posts before the first card',           'Posts a user scrolls past before the first sponsored card.',            1, 50,  'posts',    'down', false, 21),
    ('ad_card_gap',                'card',     'Organic posts between sponsored cards',         'Spacing between sponsored cards in the feed.',                           2, 50,  'posts',    'down', false, 22),
    ('ad_card_min_minutes',        'card',     'Minimum time between sponsored cards',          'Per viewer, across sessions.',                                           0, 240, 'minutes',  'down', true,  23),
    ('ad_card_session_limit',      'card',     'Sponsored cards per session',                   'Card impressions per app session.',                                      0, 50,  'per session','up', true,  24),
    ('ad_card_daily_limit',        'card',     'Sponsored cards per user per day',              'All companies combined.',                                                1, 50,  'per day',  'up',   false, 25),
    ('ad_cap_company_card_24h',    'card',     'Cards per advertiser per user per 24h',         'Same company, card placement, rolling 24 hours.',                        1, 20,  'per 24h',  'up',   false, 26),
    ('ad_cap_card_24h',            'card',     'Same card per user per 24h',                    'One creative, rolling 24 hours.',                                        1, 20,  'per 24h',  'up',   false, 27),
    ('ad_cap_company_any_day',     'combined', 'Per advertiser across banner + card per day',   'One company, both placements, per viewer per day.',                      1, 100, 'per day',  'up',   false, 30),
    ('ad_global_daily_limit',      'combined', 'All ads per user per day',                      'Every placement and company combined.',                                  0, 500, 'per day',  'up',   true,  31)
$$;

-- ================================================================ RPCs ======

create or replace function public.admin_whoami() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare uid uuid := tyche_private.require_admin();
begin
  return (select jsonb_build_object('id', p.id, 'username', p.username, 'name', p.name, 'avatar', p.avatar, 'hue', p.hue,
                                    'role', tyche_private.admin_role(p.id))
          from profiles p where p.id = uid);
end $$;

-- ----------------------------------------------------------- overview -------

create or replace function public.admin_overview(days int default 90) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  d int := least(greatest(coalesce(days, 90), 7), 365);
  today date := (now() at time zone 'utc')::date;
  d0 date := today - (d - 1);
begin
  perform tyche_private.require_admin();
  return jsonb_build_object(
    'generatedAt', now(),
    'days', d,
    'kpis', jsonb_build_object(
      'users', (select count(*) from profiles),
      'usersNew7d', (select count(*) from profiles where created_at > now() - interval '7 days'),
      'dau', (select count(*) from tyche_private.activity_days where day = today),
      'mau', (select count(distinct user_id) from tyche_private.activity_days where day > today - 30),
      'pointsBalances', (select coalesce(sum(points), 0) from profiles),
      'pointsStaked', (select coalesce(sum(e.points), 0) from entries e join challenges c on c.id = e.challenge_id where c.status <> 'settled'),
      'pointsAdminIssued', (select coalesce(sum(delta), 0) from tyche_private.points_transactions where source = 'admin_issue'),
      'pointsAdminDeducted', (select coalesce(-sum(delta), 0) from tyche_private.points_transactions where source = 'admin_deduct'),
      'verified', (select count(*) from profiles where verified),
      'suspended', (select count(*) from tyche_private.account_status where suspended_at is not null),
      'flagged', (select count(*) from tyche_private.account_status where flagged_at is not null),
      'advertisersActive', (select count(*) from ad_advertisers where status = 'active'),
      'advertisersTotal', (select count(*) from ad_advertisers),
      'bannerCampaignsActive', (select count(*) from tyche_private.campaign_stats where state in ('on_track', 'slightly_behind', 'underdelivering') and banner_text is not null),
      'cardCampaignsActive', (select count(*) from tyche_private.campaign_stats where state in ('on_track', 'slightly_behind', 'underdelivering') and card_question is not null),
      'impressions', (select count(*) from ad_events where kind = 'impression'),
      'clicks', (select count(*) from ad_events where kind = 'click'),
      'underdelivering', (select count(*) from tyche_private.campaign_stats where state = 'underdelivering'),
      'slightlyBehind', (select count(*) from tyche_private.campaign_stats where state = 'slightly_behind'),
      'ledgerStartedAt', (select min(at) from tyche_private.points_transactions)
    ),
    'series', (
      select jsonb_agg(jsonb_build_object(
        'day', g.day,
        'newUsers', (select count(*) from profiles p where (p.created_at at time zone 'utc')::date = g.day),
        'totalUsers', (select count(*) from profiles p where (p.created_at at time zone 'utc')::date <= g.day),
        'dau', (select count(*) from tyche_private.activity_days a where a.day = g.day),
        'mau', (select count(distinct a.user_id) from tyche_private.activity_days a where a.day between g.day - 29 and g.day),
        'adminIssued', (select coalesce(sum(t.delta), 0) from tyche_private.points_transactions t where t.source = 'admin_issue' and (t.at at time zone 'utc')::date = g.day),
        'adminDeducted', (select coalesce(-sum(t.delta), 0) from tyche_private.points_transactions t where t.source = 'admin_deduct' and (t.at at time zone 'utc')::date = g.day),
        'dailyClaims', (select coalesce(sum(t.delta), 0) from tyche_private.points_transactions t where t.source = 'daily_claim' and (t.at at time zone 'utc')::date = g.day),
        'bannerImpressions', (select count(*) from ad_events e where e.kind = 'impression' and e.format = 'banner' and (e.at at time zone 'utc')::date = g.day),
        'cardImpressions', (select count(*) from ad_events e where e.kind = 'impression' and e.format = 'card' and (e.at at time zone 'utc')::date = g.day),
        'clicks', (select count(*) from ad_events e where e.kind = 'click' and (e.at at time zone 'utc')::date = g.day)
      ) order by g.day)
      from (select generate_series(d0, today, interval '1 day')::date as day) g
    ),
    'campaigns', coalesce((select jsonb_agg(tyche_private.campaign_json(c) order by c.ends_at)
                           from tyche_private.campaign_stats c where c.state in ('on_track', 'slightly_behind', 'underdelivering', 'scheduled')), '[]')
  );
end $$;

-- -------------------------------------------------------------- users -------

create or replace function public.admin_users(q text default '', status_filter text default 'all', sort text default 'newest', lim int default 50, off int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare term text := nullif(trim(coalesce(q, '')), '');
begin
  perform tyche_private.require_admin();
  return (
    with base as (
      select p.*, u.email, s.suspended_at, s.restricted_at, s.flagged_at, s.flagged_reason,
             coalesce(s.last_active_at, (select max(a.day)::timestamptz from tyche_private.activity_days a where a.user_id = p.id)) as last_active_at,
             r.role as admin_role
      from profiles p
      left join auth.users u on u.id = p.id
      left join tyche_private.account_status s on s.user_id = p.id
      left join tyche_private.admin_roles r on r.user_id = p.id
      where (term is null
             or p.username ilike '%' || ltrim(term, '@') || '%'
             or p.name ilike '%' || term || '%'
             or u.email ilike '%' || term || '%'
             or p.id::text = lower(term))
        and case coalesce(status_filter, 'all')
              when 'verified' then p.verified
              when 'unverified' then not p.verified and s.suspended_at is null
              when 'suspended' then s.suspended_at is not null
              when 'restricted' then s.restricted_at is not null
              when 'flagged' then s.flagged_at is not null
              when 'admins' then r.role is not null
              else true end
    )
    select jsonb_build_object(
      'total', (select count(*) from base),
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
          'id', b.id, 'username', b.username, 'name', b.name, 'avatar', b.avatar, 'hue', b.hue, 'email', b.email,
          'createdAt', b.created_at, 'points', b.points, 'verified', b.verified,
          'status', case when b.suspended_at is not null then 'suspended' when b.verified then 'verified' else 'unverified' end,
          'restricted', b.restricted_at is not null, 'flagged', b.flagged_at is not null, 'flaggedReason', b.flagged_reason,
          'plus', b.plus is not null, 'role', b.admin_role, 'lastActiveAt', b.last_active_at))
        from (select * from base
              order by case when sort = 'points' then -points end nulls last,
                       case when sort = 'active' then last_active_at end desc nulls last,
                       case when sort = 'name' then lower(name) end,
                       created_at desc
              limit least(greatest(coalesce(lim, 50), 1), 200) offset greatest(coalesce(off, 0), 0)) b), '[]'))
  );
end $$;

create or replace function public.admin_user(uid uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p profiles; u auth.users; s tyche_private.account_status;
begin
  perform tyche_private.require_admin();
  select * into p from profiles where id = uid;
  if not found then raise exception 'User not found'; end if;
  select * into u from auth.users where id = uid;
  select * into s from tyche_private.account_status where user_id = uid;
  return jsonb_build_object(
    'id', p.id, 'username', p.username, 'name', p.name, 'avatar', p.avatar, 'hue', p.hue, 'bio', p.bio,
    'email', u.email, 'provider', coalesce(u.raw_app_meta_data ->> 'provider', 'email'), 'lastSignInAt', u.last_sign_in_at,
    'createdAt', p.created_at, 'points', p.points, 'verified', p.verified, 'plus', p.plus, 'badges', p.badges,
    'status', tyche_private.user_status(uid), 'role', tyche_private.admin_role(uid),
    'suspendedAt', s.suspended_at, 'suspendedReason', s.suspended_reason,
    'restrictedAt', s.restricted_at, 'restrictedReason', s.restricted_reason,
    'flaggedAt', s.flagged_at, 'flaggedReason', s.flagged_reason,
    'verifiedAt', s.verified_at, 'verifiedBy', (select username from profiles where id = s.verified_by),
    'lastActiveAt', coalesce(s.last_active_at, (select max(day)::timestamptz from tyche_private.activity_days where user_id = uid)),
    'activeDays30', (select count(*) from tyche_private.activity_days where user_id = uid and day > (now() at time zone 'utc')::date - 30),
    'stats', jsonb_build_object(
      'created', (select count(*) from challenges where creator_id = uid),
      'joined', (select count(*) from entries where user_id = uid),
      'openStakes', (select coalesce(sum(e.points), 0) from entries e join challenges c on c.id = e.challenge_id where e.user_id = uid and c.status <> 'settled'),
      'lifetimeStaked', (select coalesce(sum(points), 0) from entries where user_id = uid),
      'wins', (select count(*) from entries e join challenges c on c.id = e.challenge_id
               where e.user_id = uid and c.status = 'settled' and coalesce((c.result -> 'payouts' ->> uid::text)::int, 0) > 0),
      'losses', (select count(*) from entries e join challenges c on c.id = e.challenge_id
                 where e.user_id = uid and c.status = 'settled' and coalesce((c.result -> 'payouts' ->> uid::text)::int, 0) < 0),
      'earned', (select coalesce(sum(delta), 0) from tyche_private.points_transactions where user_id = uid and delta > 0 and source <> 'opening_balance'),
      'spent', (select coalesce(-sum(delta), 0) from tyche_private.points_transactions where user_id = uid and delta < 0),
      'adminNet', (select coalesce(sum(delta), 0) from tyche_private.points_transactions where user_id = uid and source in ('admin_issue', 'admin_deduct'))),
    'activity', coalesce((select jsonb_agg(a order by t desc) from (
        select e.at as t, jsonb_build_object('kind', 'joined', 'at', e.at, 'challengeId', c.id, 'title', coalesce(c.title, c.question),
                                  'points', e.points, 'option', tyche_private.opt_label(c, e.option_id), 'status', c.status) as a
        from entries e join challenges c on c.id = e.challenge_id where e.user_id = uid
        union all
        select c.created_at, jsonb_build_object('kind', 'created', 'at', c.created_at, 'challengeId', c.id, 'title', coalesce(c.title, c.question), 'status', c.status)
        from challenges c where c.creator_id = uid
        order by 1 desc limit 25) x), '[]'),
    'adminHistory', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'at', l.at, 'admin', l.admin_username, 'action', l.action,
                                                                   'before', l.before, 'after', l.after, 'reason', l.reason) order by l.at desc)
                              from (select * from tyche_private.admin_log where target_type = 'user' and target_id = uid::text order by at desc limit 50) l), '[]')
  );
end $$;

-- ------------------------------------------------------------- points -------

create or replace function public.admin_points_ledger(uid uuid default null, src text default null, lim int default 50, off int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform tyche_private.require_admin();
  return (
    with base as (
      select t.* from tyche_private.points_transactions t
      where (uid is null or t.user_id = uid)
        and (src is null or src = '' or t.source = src or (src = 'admin' and t.source in ('admin_issue', 'admin_deduct')))
    )
    select jsonb_build_object(
      'total', (select count(*) from base),
      'rows', coalesce((select jsonb_agg(jsonb_build_object(
          'id', b.id, 'at', b.at, 'userId', b.user_id, 'username', p.username, 'name', p.name,
          'delta', b.delta, 'before', b.balance_before, 'after', b.balance_after, 'source', b.source,
          'challengeId', b.challenge_id, 'challenge', (select coalesce(c.title, c.question) from challenges c where c.id = b.challenge_id),
          'adminId', b.admin_id, 'admin', (select username from profiles where id = b.admin_id), 'reason', b.reason) order by b.at desc, b.id desc)
        from (select * from base order by at desc, id desc limit least(greatest(coalesce(lim, 50), 1), 500) offset greatest(coalesce(off, 0), 0)) b
        left join profiles p on p.id = b.user_id), '[]'))
  );
end $$;

-- Issue (delta > 0) or deduct (delta < 0) points. Atomic: locks the balance row, writes the
-- ledger and the audit log in one transaction. request_id makes retries/double-clicks safe:
-- the same request_id never applies twice.
create or replace function public.admin_adjust_points(uid uuid, delta int, reason text, request_id uuid, notify_user boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := tyche_private.require_admin();
  why text := tyche_private.need_reason(reason);
  p profiles;
  prior tyche_private.points_transactions;
  max_abs int := case when tyche_private.admin_role(me) = 'super_admin' then 1000000 else 10000 end;
  new_bal int;
  tx_id bigint;
begin
  if request_id is null then raise exception 'Missing request id'; end if;
  if delta is null or delta = 0 then raise exception 'Enter a non-zero amount'; end if;
  if abs(delta) > max_abs then raise exception 'Single adjustments are limited to % pts for your role', max_abs; end if;
  p := tyche_private.guard_target(uid);
  select * into p from profiles where id = uid for update;          -- serialize changes to this balance

  -- same request again (retry, double-click): return the original result, don't apply twice
  select * into prior from tyche_private.points_transactions where idempotency_key = request_id;
  if found then
    if prior.user_id <> uid or prior.delta <> delta then raise exception 'That request id was already used for a different adjustment'; end if;
    return jsonb_build_object('id', prior.id, 'before', prior.balance_before, 'after', prior.balance_after, 'duplicate', true);
  end if;
  -- a second, identical adjustment within a minute is almost always an accident
  if exists (select 1 from tyche_private.points_transactions t where t.admin_id = me and t.user_id = uid and t.delta = admin_adjust_points.delta
             and t.at > now() - interval '60 seconds') then
    raise exception 'An identical adjustment for this user was made less than a minute ago. Check the ledger before trying again.';
  end if;

  new_bal := p.points + delta;
  if new_bal < 0 then raise exception 'That would take @% below 0 (balance: % pts)', p.username, p.points; end if;

  perform set_config('tyche.pts_skip', '1', true);   -- this function writes its own, richer ledger row
  update profiles set points = new_bal where id = uid;
  perform set_config('tyche.pts_skip', '', true);

  insert into tyche_private.points_transactions (user_id, delta, balance_before, balance_after, source, admin_id, reason, idempotency_key)
  values (uid, delta, p.points, new_bal, case when delta > 0 then 'admin_issue' else 'admin_deduct' end, me, why, request_id)
  returning id into tx_id;

  perform tyche_private.audit(case when delta > 0 then 'points.issue' else 'points.deduct' end, 'user', uid::text, '@' || p.username,
    jsonb_build_object('balance', p.points), jsonb_build_object('balance', new_bal, 'delta', delta, 'transactionId', tx_id), why);

  if coalesce(notify_user, true) then
    perform tyche_private.notify(uid, 'invite', case when delta > 0
      then format('The Tyche team added %s points to your balance ✦', to_char(delta, 'FM999,999,999'))
      else format('The Tyche team removed %s points from your balance.', to_char(-delta, 'FM999,999,999')) end);
  end if;
  return jsonb_build_object('id', tx_id, 'before', p.points, 'after', new_bal, 'duplicate', false);
end $$;

-- ------------------------------------------------- verification & status ----

create or replace function public.admin_set_verified(uid uuid, on_off boolean, reason text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := tyche_private.require_admin(); why text := tyche_private.need_reason(reason); p profiles := tyche_private.guard_target(uid);
begin
  if p.verified = on_off then raise exception '@% is already %', p.username, case when on_off then 'verified' else 'unverified' end; end if;
  update profiles set verified = on_off where id = uid;
  insert into tyche_private.account_status (user_id, verified_at, verified_by) values (uid, case when on_off then now() end, case when on_off then me end)
  on conflict (user_id) do update set verified_at = excluded.verified_at, verified_by = excluded.verified_by;
  perform tyche_private.audit(case when on_off then 'user.verify' else 'user.unverify' end, 'user', uid::text, '@' || p.username,
    jsonb_build_object('verified', p.verified), jsonb_build_object('verified', on_off), why);
  if on_off then perform tyche_private.notify(uid, 'invite', 'Your account is now verified ✓'); end if;
end $$;

-- kind: 'suspended' | 'restricted' | 'flagged'
create or replace function public.admin_set_account_flag(uid uuid, kind text, on_off boolean, reason text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me uuid := tyche_private.require_admin();
  why text := tyche_private.need_reason(reason);
  p profiles := tyche_private.guard_target(uid);
  s tyche_private.account_status;
  was boolean;
begin
  if kind not in ('suspended', 'restricted', 'flagged') then raise exception 'Unknown status'; end if;
  insert into tyche_private.account_status (user_id) values (uid) on conflict do nothing;
  select * into s from tyche_private.account_status where user_id = uid for update;
  was := case kind when 'suspended' then s.suspended_at is not null when 'restricted' then s.restricted_at is not null else s.flagged_at is not null end;
  if was = on_off then raise exception '@% is already %', p.username, case when on_off then kind else 'not ' || kind end; end if;
  update tyche_private.account_status set
    suspended_at = case when kind = 'suspended' then case when on_off then now() end else suspended_at end,
    suspended_reason = case when kind = 'suspended' then case when on_off then why end else suspended_reason end,
    restricted_at = case when kind = 'restricted' then case when on_off then now() end else restricted_at end,
    restricted_reason = case when kind = 'restricted' then case when on_off then why end else restricted_reason end,
    flagged_at = case when kind = 'flagged' then case when on_off then now() end else flagged_at end,
    flagged_reason = case when kind = 'flagged' then case when on_off then why end else flagged_reason end
  where user_id = uid;
  perform tyche_private.audit(
    case kind when 'suspended' then case when on_off then 'user.suspend' else 'user.reactivate' end
              when 'restricted' then case when on_off then 'user.restrict' else 'user.unrestrict' end
              else case when on_off then 'user.flag' else 'user.unflag' end end,
    'user', uid::text, '@' || p.username, jsonb_build_object(kind, was), jsonb_build_object(kind, on_off), why);
end $$;

-- ------------------------------------------------------------ advertisers ---

create or replace function public.admin_advertisers() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform tyche_private.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', v.id, 'name', v.name, 'contactName', v.contact_name, 'contactEmail', v.contact_email, 'contactPhone', v.contact_phone,
      'website', v.website, 'notes', v.notes, 'status', v.status, 'statusReason', v.status_reason, 'createdAt', v.created_at,
      'logo', (select c.logo from ad_campaigns c where c.advertiser = v.name order by c.created_at desc limit 1),
      'tint', (select c.tint from ad_campaigns c where c.advertiser = v.name order by c.created_at desc limit 1),
      'campaigns', (select count(*) from ad_campaigns c where c.advertiser = v.name),
      'running', (select count(*) from tyche_private.campaign_stats c where c.advertiser = v.name and c.state in ('on_track', 'slightly_behind', 'underdelivering')),
      'purchased', (select coalesce(sum(c.impressions_purchased), 0) from ad_campaigns c where c.advertiser = v.name and c.status <> 'canceled'),
      'delivered', (select coalesce(sum(c.delivered), 0) from tyche_private.campaign_stats c where c.advertiser = v.name),
      'clicks', (select coalesce(sum(c.clicks), 0) from tyche_private.campaign_stats c where c.advertiser = v.name))
    order by v.status, v.name) from ad_advertisers v), '[]');
end $$;

create or replace function public.admin_advertiser_save(p jsonb, reason text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := tyche_private.require_admin();
  aid uuid := nullif(p ->> 'id', '')::uuid;
  old ad_advertisers;
  nu ad_advertisers;
  nm text := trim(coalesce(p ->> 'name', ''));
begin
  if char_length(nm) < 1 or char_length(nm) > 80 then raise exception 'Company name is required (max 80 characters)'; end if;
  if coalesce(p ->> 'contactEmail', '') <> '' and (p ->> 'contactEmail') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'That email doesn’t look right'; end if;
  if aid is null then
    insert into ad_advertisers (name, contact_name, contact_email, contact_phone, website, notes)
    values (nm, nullif(trim(p ->> 'contactName'), ''), nullif(trim(p ->> 'contactEmail'), ''), nullif(trim(p ->> 'contactPhone'), ''),
            nullif(trim(p ->> 'website'), ''), nullif(trim(p ->> 'notes'), ''))
    returning * into nu;
    perform tyche_private.audit('advertiser.create', 'advertiser', nu.id::text, nu.name, null, to_jsonb(nu), reason);
  else
    select * into old from ad_advertisers where id = aid for update;
    if not found then raise exception 'Advertiser not found'; end if;
    update ad_advertisers set name = nm,   -- campaigns follow the rename (on update cascade)
      contact_name = nullif(trim(p ->> 'contactName'), ''), contact_email = nullif(trim(p ->> 'contactEmail'), ''),
      contact_phone = nullif(trim(p ->> 'contactPhone'), ''), website = nullif(trim(p ->> 'website'), ''), notes = nullif(trim(p ->> 'notes'), '')
    where id = aid returning * into nu;
    perform tyche_private.audit('advertiser.update', 'advertiser', aid::text, nu.name,
      to_jsonb(old) - 'created_at' - 'status' - 'status_reason', to_jsonb(nu) - 'created_at' - 'status' - 'status_reason', reason);
  end if;
  return nu.id;
end $$;

-- status: 'active' | 'paused' | 'suspended'. Paused/suspended advertisers show no ads anywhere.
create or replace function public.admin_advertiser_set_status(aid uuid, new_status text, reason text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := tyche_private.require_admin(); v ad_advertisers; why text;
begin
  if new_status not in ('active', 'paused', 'suspended') then raise exception 'Unknown status'; end if;
  why := case when new_status = 'active' then nullif(trim(coalesce(reason, '')), '') else tyche_private.need_reason(reason) end;
  select * into v from ad_advertisers where id = aid for update;
  if not found then raise exception 'Advertiser not found'; end if;
  if v.status = new_status then raise exception '% is already %', v.name, new_status; end if;
  update ad_advertisers set status = new_status, status_reason = case when new_status = 'active' then null else why end where id = aid;
  perform tyche_private.audit(case new_status when 'active' then 'advertiser.reactivate' when 'paused' then 'advertiser.pause' else 'advertiser.suspend' end,
    'advertiser', aid::text, v.name, jsonb_build_object('status', v.status), jsonb_build_object('status', new_status), why);
end $$;

-- ------------------------------------------------------------- campaigns ----

create or replace function public.admin_campaigns() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform tyche_private.require_admin();
  return coalesce((select jsonb_agg(tyche_private.campaign_json(c) order by c.created_at desc) from tyche_private.campaign_stats c), '[]');
end $$;

create or replace function public.admin_campaign_daily(cid uuid, days int default 30) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d int := least(greatest(coalesce(days, 30), 7), 120); today date := (now() at time zone 'utc')::date;
begin
  perform tyche_private.require_admin();
  return (select jsonb_agg(jsonb_build_object('day', g.day,
      'cardImpressions', (select count(*) from ad_events e where e.campaign_id = cid and e.kind = 'impression' and e.format = 'card' and (e.at at time zone 'utc')::date = g.day),
      'bannerImpressions', (select count(*) from ad_events e where e.campaign_id = cid and e.kind = 'impression' and e.format = 'banner' and (e.at at time zone 'utc')::date = g.day),
      'clicks', (select count(*) from ad_events e where e.campaign_id = cid and e.kind = 'click' and (e.at at time zone 'utc')::date = g.day)) order by g.day)
    from (select generate_series(today - (d - 1), today, interval '1 day')::date as day) g);
end $$;

-- Create (no id) or edit a campaign's creative. Purchase terms (impressions, duration) can only be
-- changed by a super admin once a campaign exists. Priority, status and dates have their own functions.
create or replace function public.admin_campaign_save(p jsonb, reason text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := tyche_private.require_admin();
  cid uuid := nullif(p ->> 'id', '')::uuid;
  old ad_campaigns;
  nu ad_campaigns;
  adv text;
  q text := nullif(trim(coalesce(p ->> 'question', '')), '');
  b text := nullif(trim(coalesce(p ->> 'banner', '')), '');
  opts jsonb := coalesce(p -> 'options', '[]');
begin
  select name into adv from ad_advertisers where id = nullif(p ->> 'advertiserId', '')::uuid;
  if adv is null then raise exception 'Pick an advertiser'; end if;
  if q is null and b is null then raise exception 'Add a sponsored card question, a banner line, or both'; end if;
  if q is not null and (jsonb_typeof(opts) <> 'array' or jsonb_array_length(opts) <> 2
                        or exists (select 1 from jsonb_array_elements(opts) o where coalesce(trim(o ->> 'label'), '') = '')) then
    raise exception 'Sponsored cards need exactly two options, each with a label';
  end if;
  if q is not null and char_length(q) > 120 then raise exception 'Keep the card question under 120 characters'; end if;
  if b is not null and char_length(b) > 90 then raise exception 'Keep the banner line under 90 characters'; end if;
  if coalesce(p ->> 'url', '') <> '' and (p ->> 'url') !~ '^https?://' then raise exception 'Links must start with https://'; end if;

  if cid is null then
    insert into ad_campaigns (advertiser, logo, tint, url, domain, card_question, card_options, card_cta, banner_text,
                              duration_days, impressions_purchased, starts_at, priority)
    values (adv, coalesce(nullif(trim(p ->> 'logo'), ''), '📣'), coalesce(nullif(p ->> 'tint', ''), '#8247FF'),
            coalesce(trim(p ->> 'url'), ''), coalesce(trim(p ->> 'domain'), ''), q,
            case when q is null then '[]'::jsonb else opts end, coalesce(nullif(trim(p ->> 'cta'), ''), 'Learn more'), b,
            coalesce((p ->> 'durationDays')::int, 7), coalesce((p ->> 'purchased')::int, 1000),
            coalesce((p ->> 'startsAt')::timestamptz, now()), 'normal')
    returning * into nu;
    perform tyche_private.audit('campaign.create', 'campaign', nu.id::text, nu.advertiser || ' · ' || coalesce(q, b), null,
      jsonb_build_object('purchased', nu.impressions_purchased, 'durationDays', nu.duration_days, 'startsAt', nu.starts_at, 'endsAt', nu.ends_at), reason);
  else
    select * into old from ad_campaigns where id = cid for update;
    if not found then raise exception 'Campaign not found'; end if;
    if old.status = 'canceled' then raise exception 'Canceled campaigns can’t be edited'; end if;
    if (coalesce((p ->> 'purchased')::int, old.impressions_purchased) <> old.impressions_purchased
        or coalesce((p ->> 'durationDays')::int, old.duration_days) <> old.duration_days)
       and tyche_private.admin_role(me) <> 'super_admin' then
      raise exception 'Only a super admin can change purchased impressions or duration' using errcode = '42501';
    end if;
    update ad_campaigns set advertiser = adv,
      logo = coalesce(nullif(trim(p ->> 'logo'), ''), logo), tint = coalesce(nullif(p ->> 'tint', ''), tint),
      url = coalesce(trim(p ->> 'url'), ''), domain = coalesce(trim(p ->> 'domain'), ''),
      card_question = q, card_options = case when q is null then '[]'::jsonb else opts end,
      card_cta = coalesce(nullif(trim(p ->> 'cta'), ''), card_cta), banner_text = b,
      impressions_purchased = coalesce((p ->> 'purchased')::int, impressions_purchased),
      duration_days = coalesce((p ->> 'durationDays')::int, duration_days),
      ends_at = case when coalesce((p ->> 'durationDays')::int, duration_days) <> duration_days
                     then starts_at + make_interval(days => (p ->> 'durationDays')::int) else ends_at end
    where id = cid returning * into nu;
    perform tyche_private.audit('campaign.update', 'campaign', cid::text, nu.advertiser || ' · ' || coalesce(nu.card_question, nu.banner_text),
      to_jsonb(old) - 'created_at' - 'priority' - 'status', to_jsonb(nu) - 'created_at' - 'priority' - 'status', reason);
  end if;
  return nu.id;
end $$;

-- status: 'active' (resume) | 'paused' | 'canceled' (permanent; history kept)
create or replace function public.admin_campaign_set_status(cid uuid, new_status text, reason text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := tyche_private.require_admin(); c ad_campaigns; why text;
begin
  if new_status not in ('active', 'paused', 'canceled') then raise exception 'Unknown status'; end if;
  why := case when new_status = 'active' then nullif(trim(coalesce(reason, '')), '') else tyche_private.need_reason(reason) end;
  select * into c from ad_campaigns where id = cid for update;
  if not found then raise exception 'Campaign not found'; end if;
  if c.status = 'canceled' then raise exception 'This campaign was canceled and can’t be changed'; end if;
  if c.status = new_status then raise exception 'Campaign is already %', new_status; end if;
  update ad_campaigns set status = new_status where id = cid;
  perform tyche_private.audit(case new_status when 'active' then 'campaign.resume' when 'paused' then 'campaign.pause' else 'campaign.cancel' end,
    'campaign', cid::text, c.advertiser || ' · ' || coalesce(c.card_question, c.banner_text),
    jsonb_build_object('status', c.status), jsonb_build_object('status', new_status), why);
end $$;

create or replace function public.admin_campaign_set_priority(cid uuid, new_priority text, reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := tyche_private.require_admin(); c ad_campaigns;
begin
  if new_priority not in ('normal', 'high', 'urgent') then raise exception 'Priority must be normal, high or urgent'; end if;
  select * into c from ad_campaigns where id = cid for update;
  if not found then raise exception 'Campaign not found'; end if;
  if c.status = 'canceled' then raise exception 'This campaign was canceled'; end if;
  if c.priority = new_priority then raise exception 'Priority is already %', new_priority; end if;
  update ad_campaigns set priority = new_priority where id = cid;
  perform tyche_private.audit('campaign.priority', 'campaign', cid::text, c.advertiser || ' · ' || coalesce(c.card_question, c.banner_text),
    jsonb_build_object('priority', c.priority), jsonb_build_object('priority', new_priority), reason);
end $$;

create or replace function public.admin_campaign_set_dates(cid uuid, new_start timestamptz, new_end timestamptz, reason text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := tyche_private.require_admin(); why text := tyche_private.need_reason(reason); c ad_campaigns;
begin
  if new_start is null or new_end is null then raise exception 'Pick a start and an end date'; end if;
  if new_end <= new_start + interval '1 day' then raise exception 'The campaign has to run at least a day'; end if;
  if new_end > new_start + interval '120 days' then raise exception 'Campaigns can run at most 120 days'; end if;
  select * into c from ad_campaigns where id = cid for update;
  if not found then raise exception 'Campaign not found'; end if;
  if c.status = 'canceled' then raise exception 'This campaign was canceled'; end if;
  update ad_campaigns set starts_at = new_start, ends_at = new_end where id = cid;
  perform tyche_private.audit('campaign.dates', 'campaign', cid::text, c.advertiser || ' · ' || coalesce(c.card_question, c.banner_text),
    jsonb_build_object('startsAt', c.starts_at, 'endsAt', c.ends_at), jsonb_build_object('startsAt', new_start, 'endsAt', new_end), why);
end $$;

-- ----------------------------------------------------------- ad settings ----

create or replace function public.admin_ad_settings() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform tyche_private.require_admin();
  return (select jsonb_agg(jsonb_build_object(
      'key', m.key, 'group', m.grp, 'label', m.label, 'help', m.help, 'min', m.min, 'max', m.max, 'unit', m.unit,
      'more', m.more, 'zeroUnlimited', m.zero_unlimited,
      'default', tyche_private.cfg_default(m.key), 'value', tyche_private.cfg(m.key),
      'updatedAt', s.updated_at, 'updatedBy', (select username from profiles where id = s.updated_by)) order by m.sort)
    from tyche_private.ad_setting_meta() m left join tyche_private.settings s on s.key = m.key);
end $$;

-- changes: {"ad_card_gap": 8, ...}. Super admins only. Values outside the allowed range are rejected.
create or replace function public.admin_ad_settings_save(changes jsonb, reason text) returns int
language plpgsql security definer set search_path = public as $$
declare
  me uuid := tyche_private.require_admin('super_admin');
  why text := tyche_private.need_reason(reason);
  k text; v numeric; m record; cur numeric; n int := 0;
  before_j jsonb := '{}'; after_j jsonb := '{}';
begin
  if jsonb_typeof(changes) <> 'object' then raise exception 'Nothing to save'; end if;
  for k, v in select key, (value #>> '{}')::numeric from jsonb_each(changes) loop
    select * into m from tyche_private.ad_setting_meta() x where x.key = k;
    if not found then raise exception 'Unknown setting %', k; end if;
    if v is null or v <> trunc(v) or v < m.min or v > m.max then raise exception '% must be a whole number from % to %', m.label, m.min, m.max; end if;
    cur := tyche_private.cfg(k);
    if cur = v then continue; end if;
    insert into tyche_private.settings (key, value, updated_at, updated_by) values (k, v, now(), me)
    on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
    before_j := before_j || jsonb_build_object(k, cur);
    after_j := after_j || jsonb_build_object(k, v);
    n := n + 1;
  end loop;
  if n > 0 then perform tyche_private.audit('settings.update', 'setting', 'ads', 'Ad frequency settings', before_j, after_j, why); end if;
  return n;
end $$;

-- ------------------------------------------------------------- audit log ----

create or replace function public.admin_log_list(q text default '', act text default '', ttype text default '', admin uuid default null,
                                                 since timestamptz default null, until timestamptz default null, lim int default 50, off int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare term text := nullif(trim(coalesce(q, '')), '');
begin
  perform tyche_private.require_admin();
  return (
    with base as (
      select l.* from tyche_private.admin_log l
      where (term is null or l.target_label ilike '%' || term || '%' or l.reason ilike '%' || term || '%'
             or l.admin_username ilike '%' || term || '%' or l.target_id = term or l.action ilike '%' || term || '%')
        and (coalesce(act, '') = '' or l.action like act || '%')
        and (coalesce(ttype, '') = '' or l.target_type = ttype)
        and (admin is null or l.admin_id = admin)
        and (since is null or l.at >= since)
        and (until is null or l.at < until)
    )
    select jsonb_build_object(
      'total', (select count(*) from base),
      'admins', coalesce((select jsonb_agg(distinct jsonb_build_object('id', admin_id, 'username', admin_username)) from tyche_private.admin_log), '[]'),
      'rows', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'at', b.at, 'adminId', b.admin_id, 'admin', b.admin_username, 'role', b.admin_role,
          'action', b.action, 'targetType', b.target_type, 'targetId', b.target_id, 'target', b.target_label,
          'before', b.before, 'after', b.after, 'reason', b.reason) order by b.at desc, b.id desc)
        from (select * from base order by at desc, id desc limit least(greatest(coalesce(lim, 50), 1), 200) offset greatest(coalesce(off, 0), 0)) b), '[]'))
  );
end $$;

-- ------------------------------------------------------------------ team ----

create or replace function public.admin_team() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform tyche_private.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'name', p.name, 'avatar', p.avatar, 'hue', p.hue,
      'role', r.role, 'grantedAt', r.granted_at, 'grantedBy', (select username from profiles where id = r.granted_by)) order by r.role desc, r.granted_at)
    from tyche_private.admin_roles r join profiles p on p.id = r.user_id), '[]');
end $$;

-- new_role: 'admin' | 'super_admin' | null (remove). Super admins only; can't change your own role.
create or replace function public.admin_set_role(uid uuid, new_role text, reason text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := tyche_private.require_admin('super_admin'); why text := tyche_private.need_reason(reason); p profiles; cur text;
begin
  if new_role is not null and new_role not in ('admin', 'super_admin') then raise exception 'Unknown role'; end if;
  if uid = me then raise exception 'You can’t change your own role'; end if;
  select * into p from profiles where id = uid;
  if not found then raise exception 'User not found'; end if;
  if exists (select 1 from tyche_private.account_status where user_id = uid and suspended_at is not null) then raise exception '@% is suspended', p.username; end if;
  cur := tyche_private.admin_role(uid);
  if cur is not distinct from new_role then raise exception 'No change'; end if;
  if new_role is null then
    delete from tyche_private.admin_roles where user_id = uid;
  else
    insert into tyche_private.admin_roles (user_id, role, granted_by) values (uid, new_role, me)
    on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by, granted_at = now();
  end if;
  perform tyche_private.audit(case when new_role is null then 'admin.revoke' when cur is null then 'admin.grant' else 'admin.change' end,
    'admin', uid::text, '@' || p.username, jsonb_build_object('role', cur), jsonb_build_object('role', new_role), why);
end $$;

-- ------------------------------------------------------------ permissions ---

revoke all on all tables in schema tyche_private from public, anon, authenticated;
-- admin_* functions are callable by any signed-in user, and refuse anyone who isn't an admin.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.username_available(text) to anon;
grant execute on function public.suggested_profiles() to anon;
do $$
begin
  if to_regclass('public.billing_customers') is not null then
    revoke execute on function public.subscribe_plus(text) from public, anon, authenticated;
    revoke execute on function public.set_plus_canceled(boolean) from public, anon, authenticated;
    revoke execute on function public.apply_billing(uuid, jsonb) from public, anon, authenticated;
    revoke execute on function public.billing_notice(uuid, text) from public, anon, authenticated;
  end if;
end $$;
revoke execute on function public.delete_account_prepare(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
