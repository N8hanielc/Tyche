-- ============================================================================
-- Tyche — Supabase schema (Phase 1)
-- Run once in Supabase → SQL Editor → New query → paste → Run.
-- Safe to re-run: drops and recreates Tyche's functions; tables use IF NOT EXISTS.
--
-- Design: clients only READ tables (row-level security) and WRITE through the
-- RPC functions below. Every game rule (50-pt minimum, no self-bets, payouts,
-- votes, deadlines) is enforced here, not in the browser.
-- ============================================================================

create extension if not exists pgcrypto;
create schema if not exists tyche_private;

-- ---------------------------------------------------------------- tables ----

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._]{3,20}$'),
  name text not null check (char_length(name) between 1 and 60),
  avatar text,
  bio text check (bio is null or char_length(bio) <= 160),
  hue int not null default floor(random() * 360),
  points int not null default 1000 check (points >= 0),
  base_wins int not null default 0,
  base_losses int not null default 0,
  badges text[] not null default '{early}',
  plus jsonb,
  last_claim_at timestamptz,
  claim_streak int not null default 0,
  trial_used boolean not null default false,
  card_theme text,
  created_at timestamptz not null default now()
);

-- added for Google/Apple sign-in: false until the user confirms their profile
alter table public.profiles add column if not exists onboarded boolean not null default true;
-- Verified badge. Only you can set it (Supabase Table Editor or SQL); app users can't change it.
alter table public.profiles add column if not exists verified boolean not null default false;

-- Admin-only account state (suspension, game restriction, review flag, verification audit,
-- last activity). Kept out of `profiles` on purpose: every signed-in user can read all of
-- `profiles` through the API, and none of this should be visible to them.
create table if not exists tyche_private.account_status (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  suspended_at timestamptz,          -- can sign in, can't do anything
  suspended_reason text,
  restricted_at timestamptz,         -- can browse and chat, can't create, join, vote on or settle games
  restricted_reason text,
  flagged_at timestamptz,            -- internal review flag, invisible to the user
  flagged_reason text,
  verified_at timestamptz,
  verified_by uuid,
  last_active_at timestamptz
);

-- One row per user per (UTC) day they opened the app. Powers daily/monthly active users.
create table if not exists tyche_private.activity_days (
  day date not null,
  user_id uuid not null,
  primary key (day, user_id)
);

-- Permanent points ledger. Every change to profiles.points lands here (trigger below),
-- tagged with where it came from. No foreign keys: the ledger outlives deleted accounts.
create table if not exists tyche_private.points_transactions (
  id bigint generated always as identity primary key,
  at timestamptz not null default clock_timestamp(),
  user_id uuid not null,
  delta int not null,
  balance_before int not null,
  balance_after int not null,
  source text not null,   -- signup | opening_balance | stake | settle | refund | resettle | daily_claim | plus_topup | admin_issue | admin_deduct | app
  challenge_id uuid,
  admin_id uuid,
  reason text,
  idempotency_key uuid unique
);
create index if not exists points_tx_user_at on tyche_private.points_transactions (user_id, at desc);
create index if not exists points_tx_source_at on tyche_private.points_transactions (source, at);

-- Overrides for the tunable numbers in tyche_private.cfg (only ad_* keys are editable, from /admin).
create table if not exists tyche_private.settings (
  key text primary key,
  value numeric not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.follows (
  follower uuid not null references public.profiles (id) on delete cascade,
  followee uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  emoji text not null default '🔥',
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (group_id, user_id)
);

create table if not exists public.nights (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now(),
  status text not null default 'live' check (status in ('live', 'ended')),
  data jsonb not null default '{}', -- players (incl. guests), teams, games, rounds, scores
  ended_at timestamptz,
  champion jsonb
);

create table if not exists public.night_members (
  night_id uuid not null references public.nights (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (night_id, user_id)
);

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  category text not null,
  question text not null check (char_length(question) between 5 and 140),
  title text,
  description text,
  media text,
  format text not null check (format in ('over_under', 'yes_no', 'pick_one', 'exact')),
  line numeric,
  unit text,
  options jsonb not null,
  stake_mode text not null default 'even' check (stake_mode in ('even', 'odds', 'bragging')),
  odds jsonb,
  forfeit text,
  visibility text not null default 'friends' check (visibility in ('friends', 'link', 'group', 'public')),
  group_id uuid references public.groups (id) on delete set null,
  closes_at timestamptz not null,
  starts_at timestamptz,
  vote_at timestamptz,
  resolution text not null default '',
  tie_rule text not null default 'refund' check (tie_rule in ('refund', 'split', 'rematch')),
  verifier text not null default 'group' check (verifier in ('creator', 'group', 'vote', 'source')),
  status text not null default 'open' check (status in ('open', 'live', 'review', 'vote', 'settled')),
  live jsonb,
  result jsonb,
  vote jsonb,
  locked_at timestamptz,
  shares int not null default 0
);

-- Game Night props live on challenges too
alter table public.challenges add column if not exists night_id uuid references public.nights (id) on delete cascade;
alter table public.challenges add column if not exists game_id text;
alter table public.challenges add column if not exists prop jsonb;
alter table public.challenges drop constraint if exists challenges_visibility_check;
alter table public.challenges add constraint challenges_visibility_check check (visibility in ('friends', 'link', 'group', 'public', 'night'));
create index if not exists challenges_night on public.challenges (night_id);
create index if not exists night_members_user on public.night_members (user_id);

create table if not exists public.entries (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  option_id text not null,
  points int not null check (points >= 0),
  at timestamptz not null default clock_timestamp(),
  primary key (challenge_id, user_id)
);

create table if not exists public.likes (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (challenge_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  kind text not null check (kind in ('chat', 'system')),
  user_id uuid references public.profiles (id) on delete set null,
  text text not null default '' check (char_length(text) <= 1000),
  icon text,
  image text,
  reply_to uuid,
  reactions jsonb not null default '{}',
  at timestamptz not null default clock_timestamp()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  to_user uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  actor_id uuid references public.profiles (id) on delete set null,
  challenge_id uuid references public.challenges (id) on delete cascade,
  text text not null,
  at timestamptz not null default clock_timestamp(),
  read boolean not null default false
);

create table if not exists public.room_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (user_id, challenge_id)
);

create index if not exists messages_challenge_at on public.messages (challenge_id, at);
create index if not exists notifications_to_at on public.notifications (to_user, at desc);
create index if not exists entries_user on public.entries (user_id);
create index if not exists challenges_status on public.challenges (status);
create index if not exists group_members_user on public.group_members (user_id);

-- ------------------------------------------------------------- constants ----

create or replace function tyche_private.cfg_default(k text) returns numeric language sql immutable as $$
  select case k
    when 'min_stake' then 50
    when 'daily_free' then 10
    when 'daily_plus' then 100
    when 'open_limit' then 5
    when 'group_limit' then 2
    when 'required_confirms' then 2
    when 'deadline_h' then 24
    when 'vote_window_h' then 12
    when 'participant_vote_h' then 3
    when 'runoff_min' then 30
    when 'disputes_to_freeze' then 2
    when 'vote_quorum' then 3
    when 'trial_days' then 7
    when 'wild_stake' then 20
    -- ads
    when 'ad_card_min_organic' then 4      -- organic posts a user must view before the first sponsored card
    when 'ad_card_gap' then 6              -- organic posts between sponsored cards
    when 'ad_card_daily_limit' then 6      -- sponsored cards per user per day (all companies)
    when 'ad_cap_company_banner_day' then 4
    when 'ad_cap_company_card_24h' then 2
    when 'ad_cap_company_any_day' then 5
    when 'ad_cap_card_24h' then 2
    -- ads, added with the admin panel (0 = no limit where noted)
    when 'ad_banner_enabled' then 1
    when 'ad_card_enabled' then 1
    when 'ad_banner_rotate_sec' then 20
    when 'ad_banner_session_limit' then 0      -- banners per app session (0 = no limit)
    when 'ad_banner_max_share_pct' then 100    -- max share of all banner impressions (24h) one company can take
    when 'ad_banner_max_creatives' then 0      -- banner campaigns per company eligible at once (0 = no limit)
    when 'ad_card_session_limit' then 0        -- sponsored cards per app session (0 = no limit)
    when 'ad_card_min_minutes' then 0          -- minimum minutes between sponsored cards for one viewer
    when 'ad_global_daily_limit' then 0        -- all ads (cards + banners) per viewer per day (0 = no limit)
  end
$$;

-- Live value: an override from tyche_private.settings (set in /admin), else the default above.
create or replace function tyche_private.cfg(k text) returns numeric language sql stable as $$
  select coalesce((select value from tyche_private.settings where key = k), tyche_private.cfg_default(k))
$$;

-- --------------------------------------------------------------- helpers ----

create or replace function tyche_private.ms(t timestamptz) returns bigint language sql immutable as $$
  select (extract(epoch from t) * 1000)::bigint
$$;

create or replace function tyche_private.me() returns uuid language plpgsql stable as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  if exists (select 1 from tyche_private.account_status s where s.user_id = uid and s.suspended_at is not null) then
    raise exception 'Your account is suspended. Contact support if you think this is a mistake.' using errcode = '42501';
  end if;
  return uid;
end $$;

-- Restricted accounts can browse and chat but not create, join, vote on or settle games.
create or replace function tyche_private.assert_can_play(uid uuid) returns void language plpgsql stable as $$
begin
  if exists (select 1 from tyche_private.account_status s where s.user_id = uid and s.restricted_at is not null) then
    raise exception 'Your account can’t join or run games right now. Contact support if you think this is a mistake.' using errcode = '42501';
  end if;
end $$;

-- Tags the points changes that follow in this transaction for the ledger.
create or replace function tyche_private.pts(src text, ref uuid default null) returns void language plpgsql as $$
begin
  perform set_config('tyche.pts_src', src, true);
  perform set_config('tyche.pts_ref', coalesce(ref::text, ''), true);
end $$;

-- Records app activity for daily/monthly active users (cheap: at most one write per 5 minutes).
create or replace function tyche_private.touch(uid uuid) returns void language plpgsql as $$
begin
  insert into tyche_private.activity_days (day, user_id) values ((now() at time zone 'utc')::date, uid) on conflict do nothing;
  insert into tyche_private.account_status (user_id, last_active_at) values (uid, now())
  on conflict (user_id) do update set last_active_at = excluded.last_active_at
  where tyche_private.account_status.last_active_at is null or tyche_private.account_status.last_active_at < now() - interval '5 minutes';
end $$;

create or replace function tyche_private.first_name(uid uuid) returns text language sql stable as $$
  select coalesce(split_part(name, ' ', 1), 'Someone') from public.profiles where id = uid
$$;

create or replace function tyche_private.is_plus(uid uuid) returns boolean language sql stable as $$
  select coalesce((select p.plus is not null and (p.plus ->> 'renewsAt')::bigint > tyche_private.ms(now()) from public.profiles p where p.id = uid), false)
$$;

create or replace function tyche_private.opt_label(c public.challenges, oid text) returns text language sql stable as $$
  select coalesce(
    (select o ->> 'label' from jsonb_array_elements(c.options) o where o ->> 'id' = oid limit 1),
    case when oid = '__tie' then 'Tie' else oid end)
$$;

create or replace function tyche_private.is_self(c public.challenges, oid text, uid uuid) returns boolean language sql stable as $$
  select exists (select 1 from jsonb_array_elements(c.options) o where o ->> 'id' = oid and coalesce(o -> 'subjects', '[]') ? uid::text)
$$;

create or replace function tyche_private.has_option(c public.challenges, oid text) returns boolean language sql stable as $$
  select exists (select 1 from jsonb_array_elements(c.options) o where o ->> 'id' = oid)
$$;

create or replace function tyche_private.title(c public.challenges) returns text language sql stable as $$
  select coalesce(nullif(c.title, ''), c.question)
$$;

create or replace function tyche_private.total(cid uuid) returns int language sql stable as $$
  select coalesce(sum(points), 0)::int from public.entries where challenge_id = cid
$$;

create or replace function tyche_private.voters(c public.challenges) returns uuid[] language sql stable as $$
  select array(select distinct u from (select c.creator_id as u union all select user_id from public.entries where challenge_id = c.id) x)
$$;

create or replace function tyche_private.can_see(c public.challenges, uid uuid) returns boolean language sql stable as $$
  select c.creator_id = uid
    or exists (select 1 from public.entries e where e.challenge_id = c.id and e.user_id = uid)
    or c.visibility in ('public', 'link')
    or (c.visibility = 'group' and exists (select 1 from public.group_members m where m.group_id = c.group_id and m.user_id = uid))
    or (c.visibility = 'friends' and exists (select 1 from public.follows f where f.follower = uid and f.followee = c.creator_id))
    or (c.visibility = 'night' and exists (select 1 from public.night_members m where m.night_id = c.night_id and m.user_id = uid))
$$;

create or replace function tyche_private.sys(cid uuid, icon text, body text) returns void language sql as $$
  insert into public.messages (challenge_id, kind, icon, text) values (cid, 'system', icon, body)
$$;

create or replace function tyche_private.notify(to_user uuid, kind text, body text, cid uuid default null, actor uuid default null) returns void language sql as $$
  insert into public.notifications (to_user, kind, text, challenge_id, actor_id) values (to_user, kind, body, cid, actor)
$$;

create or replace function tyche_private.follow(uid uuid, target uuid) returns void language plpgsql as $$
begin
  if target is null or target = uid then return; end if;
  insert into public.follows (follower, followee) values (uid, target) on conflict do nothing;
  if not found then return; end if;
  -- one "started following you" per person per day, however often they toggle
  if not exists (select 1 from public.notifications where to_user = target and actor_id = uid and kind = 'follow' and at > now() - interval '24 hours') then
    perform tyche_private.notify(target, 'follow', 'started following you', null, uid);
  end if;
end $$;

create or replace function tyche_private.lock(cid uuid) returns public.challenges language plpgsql as $$
declare c public.challenges;
begin
  select * into c from public.challenges where id = cid for update;
  if not found then raise exception 'Challenge not found'; end if;
  return c;
end $$;

create or replace function tyche_private.result_due(c public.challenges) returns bigint language sql stable as $$
  select coalesce((c.live ->> 'resultDueAt')::bigint,
                  (c.live ->> 'startedAt')::bigint + (tyche_private.cfg('deadline_h') * 3600000)::bigint)
$$;

-- --------------------------------------------------------------- lifecycle ----

create or replace function tyche_private.settle(cid uuid) returns void language plpgsql as $$
declare
  c public.challenges := tyche_private.lock(cid);
  win text;
  tot int := tyche_private.total(cid);
  winpool int := 0;
  payouts jsonb := '{}';
  e record;
  net int;
  names text;
  winners int := 0;
  label text;
begin
  if c.result is null or c.status = 'settled' then return; end if;
  win := c.result ->> 'optionId';
  if win = '__tie' then win := null; end if;
  if win is not null then
    select coalesce(sum(points), 0) into winpool from public.entries where challenge_id = cid and option_id = win;
  end if;
  label := tyche_private.title(c);
  perform tyche_private.pts('settle', cid);
  for e in select * from public.entries where challenge_id = cid loop
    if win is null then net := 0;
    elsif e.option_id <> win then net := -e.points;
    elsif c.stake_mode = 'odds' and c.odds ? win then net := round(e.points * (c.odds ->> win)::numeric)::int - e.points;
    elsif winpool > 0 then net := round(e.points::numeric / winpool * tot)::int - e.points;
    else net := 0;
    end if;
    payouts := payouts || jsonb_build_object(e.user_id::text, net);
    if net >= 0 then update public.profiles set points = points + e.points + net where id = e.user_id; end if;
    if e.option_id = win then winners := winners + 1; end if;
    perform tyche_private.notify(e.user_id,
      case when net > 0 then 'won' when net < 0 then 'lost' else 'confirmed' end,
      case when net > 0 then format('You won “%s” · +%s pts', label, net)
           when net < 0 then format('Result confirmed: “%s” · %s pts', label, net)
           else format('Result confirmed: “%s” · stake refunded', label) end,
      cid);
  end loop;

  select string_agg(tyche_private.first_name(x::uuid), ', ') into names
  from jsonb_array_elements_text(coalesce(c.result -> 'confirmations', '[]')) x;

  update public.challenges set
    status = 'settled',
    result = result || jsonb_build_object('payouts', payouts, 'settledAt', tyche_private.ms(now())),
    live = case when live ? 'endedAt' then live else coalesce(live, '{}') || jsonb_build_object('endedAt', tyche_private.ms(now())) end
  where id = cid;

  perform tyche_private.sys(cid, '✅', 'Result confirmed by ' || coalesce(names, 'the creator'));
  if win is not null then
    perform tyche_private.sys(cid, '🏆', format('Winner: %s · %s winner%s split %s pts', tyche_private.opt_label(c, win), winners, case when winners = 1 then '' else 's' end, tot));
  else
    perform tyche_private.sys(cid, '🤝', case when c.tie_rule = 'rematch' then 'Tie — rematch called. Stakes refunded.' else 'Tie — all stakes refunded.' end);
  end if;
end $$;

create or replace function tyche_private.start(cid uuid, auto boolean) returns void language plpgsql as $$
declare
  c public.challenges := tyche_private.lock(cid);
  t text := to_char(now(), 'HH12:MI AM');
  u uuid;
begin
  if c.status <> 'open' then return; end if;
  update public.challenges set
    status = 'live',
    closes_at = least(closes_at, now()),
    locked_at = coalesce(locked_at, now()),
    live = jsonb_build_object('startedAt', tyche_private.ms(now()),
                              'resultDueAt', tyche_private.ms(now() + make_interval(hours => tyche_private.cfg('deadline_h')::int)))
           || case when format = 'over_under' and coalesce(unit, '') <> 'time' then '{"counter": 0}'::jsonb else '{}'::jsonb end
  where id = cid;
  perform tyche_private.sys(cid, '🔒', format('Challenge locked · %s participants · %s pts in the pool',
    (select count(*) from public.entries where challenge_id = cid), tyche_private.total(cid)));
  perform tyche_private.sys(cid, case when c.category = 'Road Trip' then '🚗' else '▶️' end,
    case when c.category = 'Road Trip' then 'Trip started' else 'Event started' end || case when auto then ' · started automatically' else '' end);
  foreach u in array tyche_private.voters(c) loop
    if u <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000') then
      perform tyche_private.notify(u, 'started', format('“%s” is live', tyche_private.title(c)), cid, c.creator_id);
    end if;
  end loop;
end $$;

create or replace function tyche_private.open_vote(cid uuid, reason text, runoff text[] default null) returns void language plpgsql as $$
declare
  c public.challenges := tyche_private.lock(cid);
  win_ms bigint;
  body text;
  u uuid;
begin
  win_ms := case
    when runoff is not null then tyche_private.cfg('runoff_min') * 60000
    when reason = 'participants' then tyche_private.cfg('participant_vote_h') * 3600000
    else tyche_private.cfg('vote_window_h') * 3600000 end;
  update public.challenges set
    status = 'vote',
    live = case when live is null then null when live ? 'endedAt' then live else live || jsonb_build_object('endedAt', tyche_private.ms(now())) end,
    vote = jsonb_strip_nulls(jsonb_build_object(
      'reason', reason,
      'opensAt', tyche_private.ms(now()),
      'endsAt', tyche_private.ms(now()) + win_ms,
      'votes', '{}'::jsonb,
      'proposed', case when reason = 'dispute' then result ->> 'optionId' end,
      'round', case when runoff is null then 1 else 2 end,
      'choices', to_jsonb(runoff)))
  where id = cid;
  body := case
    when runoff is not null then format('Tie between %s — %s-minute runoff vote.',
      (select string_agg(tyche_private.opt_label(c, r), ' and ') from unnest(runoff) r), tyche_private.cfg('runoff_min'))
    when reason = 'participants' then '🌙 Voting is open. Everyone votes — you can’t vote for yourself. Votes stay hidden until it closes.'
    when reason = 'deadline' then format('No result after %sh — it’s up to a vote. Majority wins; if nobody votes, everyone is refunded.', tyche_private.cfg('deadline_h'))
    else format('Result frozen after %s disputes — participants vote to decide.', tyche_private.cfg('disputes_to_freeze')) end;
  perform tyche_private.sys(cid, '🗳️', body);
  foreach u in array tyche_private.voters(c) loop
    perform tyche_private.notify(u, 'confirmed',
      case when runoff is not null then format('Runoff vote: “%s”', tyche_private.title(c))
           when reason = 'participants' then format('Time to vote: “%s”', c.question)
           when reason = 'deadline' then format('“%s” is overdue — vote on the result', tyche_private.title(c))
           else format('The result for “%s” was disputed — vote now', tyche_private.title(c)) end,
      cid);
  end loop;
end $$;

-- Options a user may vote for (never one that is about themselves)
create or replace function tyche_private.vote_choices(c public.challenges, uid uuid) returns text[] language sql stable as $$
  select array(
    select x from (
      select jsonb_array_elements_text(coalesce(c.vote -> 'choices', (select jsonb_agg(o -> 'id') from jsonb_array_elements(c.options) o))) as x
      union all
      select '__tie' where coalesce(c.vote ->> 'reason', '') <> 'participants'
    ) s
    where uid is null or not tyche_private.is_self(c, x, uid))
$$;

create or replace function tyche_private.resolve_vote(cid uuid, force boolean) returns boolean language plpgsql as $$
declare
  c public.challenges := tyche_private.lock(cid);
  total int;
  lead_opt text;
  lead_n int;
  second_n int;
  tied text[];
  quorum int;
  everyone boolean;
  clear boolean;
  winner text;
  backers text[];
  prev jsonb;
  score text;
begin
  if c.status <> 'vote' or c.vote is null then return false; end if;
  select coalesce(sum(n), 0) into total from (select count(*) n from jsonb_each_text(c.vote -> 'votes') group by value) t;
  select value, count(*) into lead_opt, lead_n from jsonb_each_text(c.vote -> 'votes') group by value order by count(*) desc limit 1;
  select count(*) into second_n from jsonb_each_text(c.vote -> 'votes') group by value order by count(*) desc offset 1 limit 1;
  second_n := coalesce(second_n, 0);
  lead_n := coalesce(lead_n, 0);
  clear := lead_n > 0 and lead_n > second_n;
  quorum := least(tyche_private.cfg('vote_quorum')::int, greatest(1, (select count(*) from public.entries where challenge_id = cid)::int));
  everyone := total >= coalesce(array_length(tyche_private.voters(c), 1), 0);

  if c.vote ->> 'reason' = 'participants' then
    if not force and not everyone then return false; end if;
    if total > 0 and not clear then
      select array_agg(value) into tied from (select value, count(*) n from jsonb_each_text(c.vote -> 'votes') group by value) t where n = lead_n;
      if c.tie_rule = 'rematch' and coalesce((c.vote ->> 'round')::int, 1) < 2 then
        perform tyche_private.open_vote(cid, 'participants', tied);
        return true;
      end if;
    end if;
    winner := case when total > 0 and clear then lead_opt else '__tie' end;
  elsif force then
    winner := case when total > 0 and clear then lead_opt else '__tie' end;
  elsif total >= quorum and clear and lead_n > total / 2.0 then
    winner := lead_opt;
  else
    return false;
  end if;

  select array_agg(key) into backers from jsonb_each_text(c.vote -> 'votes') where value = winner;
  select string_agg(n::text, '–') into score from (select count(*) n from jsonb_each_text(c.vote -> 'votes') group by value order by count(*) desc) t;
  prev := c.result;
  update public.challenges set result = jsonb_strip_nulls(jsonb_build_object(
    'optionId', winner,
    'value', case when prev ->> 'optionId' = winner then prev -> 'value' end,
    'submittedBy', coalesce(prev ->> 'submittedBy', 'vote'),
    'submittedAt', coalesce(prev -> 'submittedAt', to_jsonb(tyche_private.ms(now()))),
    'confirmations', coalesce(to_jsonb(backers), '[]'::jsonb),
    'disputes', coalesce(prev -> 'disputes', '[]'::jsonb),
    'evidence', prev -> 'evidence'))
  where id = cid;
  perform tyche_private.sys(cid, '🗳️', case when total = 0 then 'Vote closed with no votes — everyone is refunded.'
    else format('Vote decided: %s (%s)', tyche_private.opt_label(c, winner), score) end);
  perform tyche_private.settle(cid);
  return true;
end $$;

-- Time-based transitions. Runs inside get_state (so the app works without cron)
-- and can also be scheduled with pg_cron (see bottom of file).
create or replace function tyche_private.tick() returns void language plpgsql as $$
declare c public.challenges;
begin
  for c in select * from public.challenges where status in ('open', 'live', 'vote') for update skip locked loop
    if c.status = 'open' and c.starts_at is not null and c.starts_at <= now() then
      perform tyche_private.start(c.id, true);
    elsif c.status = 'open' and c.locked_at is null and c.closes_at <= now() then
      update public.challenges set locked_at = now() where id = c.id;
      perform tyche_private.sys(c.id, '🔒', format('Joining closed · %s in · %s pts in the pool',
        (select count(*) from public.entries where challenge_id = c.id), tyche_private.total(c.id)));
    elsif c.status = 'live' and c.verifier = 'vote' and c.vote_at is not null and c.vote_at <= now() and c.vote is null then
      perform tyche_private.open_vote(c.id, 'participants');
    elsif c.status = 'live' and c.result is null and tyche_private.result_due(c) <= tyche_private.ms(now()) then
      perform tyche_private.open_vote(c.id, 'deadline');
    elsif c.status = 'vote' and (c.vote ->> 'endsAt')::bigint <= tyche_private.ms(now()) then
      perform tyche_private.resolve_vote(c.id, true);
    end if;
  end loop;
end $$;

-- -------------------------------------------------------- new user trigger ----

-- Makes a valid, unique username from a name/email: "Nate Coates" -> "natecoates", "natecoates2", ...
create or replace function tyche_private.unique_username(seed text) returns text language plpgsql as $$
declare
  base text := left(regexp_replace(lower(coalesce(seed, '')), '[^a-z0-9._]', '', 'g'), 16);
  candidate text;
  n int := 0;
begin
  if char_length(base) < 3 then base := 'player' || base; end if;
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1;
    candidate := left(base, 16) || (case when n < 10 then n::text else (floor(random() * 9000) + 1000)::int::text end);
  end loop;
  return candidate;
end $$;

-- Creates the profile for every new account: email sign-up (name + username
-- chosen in the app) or Google/Apple (name + photo from the provider; the
-- user confirms their username in a short onboarding step).
create or replace function tyche_private.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}');
  provider text := coalesce(new.raw_app_meta_data ->> 'provider', 'email');
  social boolean := provider <> 'email';
  email_name text := split_part(coalesce(new.email, ''), '@', 1);
  display text := coalesce(nullif(meta ->> 'name', ''), nullif(meta ->> 'full_name', ''),
                           nullif(trim(concat_ws(' ', meta ->> 'given_name', meta ->> 'family_name')), ''),
                           case when email_name <> '' and new.email not like '%privaterelay.appleid.com' then initcap(regexp_replace(email_name, '[._0-9]+', ' ', 'g')) end,
                           'New player');
  wanted text := lower(nullif(meta ->> 'username', ''));
  uname text;
begin
  -- invite-only: email sign-ups must carry a valid invite password (social sign-ups are checked at onboarding)
  if not social and tyche_private.invite_only() and tyche_private.invite_match(meta ->> 'invite_code') is null then
    raise exception 'invite_required' using errcode = '42501';
  end if;
  if wanted ~ '^[a-z0-9._]{3,20}$' and not exists (select 1 from public.profiles where username = wanted) then
    uname := wanted;
  elsif wanted is not null and not social then
    -- email sign-up picked a name that's taken: fail so the app can say so
    raise exception 'username_taken' using errcode = '23505';
  else
    uname := tyche_private.unique_username(coalesce(nullif(regexp_replace(display, '\s', '', 'g'), 'Newplayer'), email_name));
  end if;
  insert into public.profiles (id, username, name, avatar, onboarded)
  values (new.id, uname, left(trim(display), 60), nullif(coalesce(meta ->> 'avatar_url', meta ->> 'picture'), ''), not social);
  insert into public.notifications (to_user, kind, text)
  values (new.id, 'invite', format('Welcome to Tyche, %s 👋 You start with 1,000 points. Find a challenge to join or put your first one on Tyche.',
    split_part(display, ' ', 1)));
  return new;
end $$;

-- Creates a profile for an account that doesn't have one (e.g. signed up
-- before this script was run). Called by get_state, so those users self-heal.
create or replace function tyche_private.ensure_profile(uid uuid) returns void language plpgsql security definer set search_path = public as $$
declare u auth.users;
  display text;
begin
  if exists (select 1 from public.profiles where id = uid) then return; end if;
  select * into u from auth.users where id = uid;
  if not found then return; end if;
  display := coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), nullif(u.raw_user_meta_data ->> 'full_name', ''),
                      initcap(regexp_replace(split_part(coalesce(u.email, ''), '@', 1), '[._0-9]+', ' ', 'g')), 'New player');
  insert into public.profiles (id, username, name, avatar, onboarded)
  values (uid,
          tyche_private.unique_username(coalesce(nullif(u.raw_user_meta_data ->> 'username', ''), regexp_replace(display, '\s', '', 'g'))),
          left(trim(coalesce(nullif(display, ''), 'New player')), 60),
          nullif(coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture'), ''),
          false) -- they confirm their username on the welcome screen
  on conflict (id) do nothing;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function tyche_private.handle_new_user();

-- ------------------------------------------------------------ points ledger ----
-- Every change to profiles.points is written to tyche_private.points_transactions in the
-- same transaction, so the ledger can't drift from balances. Functions tag the source
-- with tyche_private.pts(...); admin adjustments write their own rows (with reason + admin).
create or replace function tyche_private.log_points() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('tyche.pts_skip', true), '') = '1' then return null; end if;
  if tg_op = 'INSERT' then
    if new.points <> 0 then
      insert into tyche_private.points_transactions (user_id, delta, balance_before, balance_after, source)
      values (new.id, new.points, 0, new.points, 'signup');
    end if;
  elsif new.points is distinct from old.points then
    insert into tyche_private.points_transactions (user_id, delta, balance_before, balance_after, source, challenge_id)
    values (new.id, new.points - old.points, old.points, new.points,
            coalesce(nullif(current_setting('tyche.pts_src', true), ''), 'app'),
            nullif(current_setting('tyche.pts_ref', true), '')::uuid);
  end if;
  return null;
end $$;
drop trigger if exists profiles_points_ledger on public.profiles;
create trigger profiles_points_ledger after insert or update of points on public.profiles
  for each row execute function tyche_private.log_points();

-- The ledger is append-only.
create or replace function tyche_private.append_only() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end $$;
drop trigger if exists points_tx_append_only on tyche_private.points_transactions;
create trigger points_tx_append_only before update or delete on tyche_private.points_transactions
  for each row execute function tyche_private.append_only();
drop trigger if exists points_tx_no_truncate on tyche_private.points_transactions;
create trigger points_tx_no_truncate before truncate on tyche_private.points_transactions
  for each statement execute function tyche_private.append_only();

-- First run: one opening-balance row per existing account so ledger totals match balances.
insert into tyche_private.points_transactions (user_id, delta, balance_before, balance_after, source, reason)
select p.id, p.points, 0, p.points, 'opening_balance', 'Balance when the ledger started'
from public.profiles p
where not exists (select 1 from tyche_private.points_transactions t where t.user_id = p.id);

-- First run: rebuild past activity days from what's already in the database (safe to re-run).
insert into tyche_private.activity_days (day, user_id)
select distinct (t at time zone 'utc')::date, u from (
  select id as u, created_at as t from public.profiles
  union all select creator_id, created_at from public.challenges
  union all select user_id, at from public.entries
  union all select user_id, at from public.messages where user_id is not null and kind = 'chat'
  union all select id, last_sign_in_at from auth.users where last_sign_in_at is not null
) x
where u is not null and t is not null and exists (select 1 from public.profiles p where p.id = x.u)
on conflict do nothing;

-- ================================================================ RPCs ======
-- Everything below is callable from the app with supabase.rpc(...)

-- Whole visible graph in the exact shape the app's store uses.
create or replace function public.get_state() returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  -- suspended accounts get a flag instead of data; the app shows a "suspended" screen
  if exists (select 1 from tyche_private.account_status s where s.user_id = uid and s.suspended_at is not null) then
    return jsonb_build_object('version', 2, 'meId', uid, 'suspended', true);
  end if;
  perform tyche_private.ensure_profile(uid);
  perform tyche_private.touch(uid);
  perform tyche_private.tick();
  return jsonb_build_object(
    'version', 2,
    'meId', uid,
    'users', coalesce((select jsonb_object_agg(p.id, jsonb_strip_nulls(jsonb_build_object(
        'id', p.id, 'username', p.username, 'name', p.name, 'avatar', p.avatar, 'hue', p.hue, 'bio', p.bio,
        'followers', (select count(*) from follows f where f.followee = p.id),
        'following', (select count(*) from follows f where f.follower = p.id),
        'baseWins', p.base_wins, 'baseLosses', p.base_losses, 'points', p.points, 'badges', to_jsonb(p.badges),
        'plus', p.plus, 'lastClaimAt', tyche_private.ms(p.last_claim_at), 'claimStreak', p.claim_streak,
        'trialUsed', p.trial_used, 'cardTheme', p.card_theme, 'onboarded', p.onboarded, 'verified', p.verified)))
      from profiles p), '{}'),
    'following', coalesce((select jsonb_agg(followee) from follows where follower = uid), '[]'),
    'followerIds', coalesce((select jsonb_agg(follower order by created_at desc) from follows where followee = uid), '[]'),
    'challenges', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', c.id, 'creatorId', c.creator_id, 'createdAt', tyche_private.ms(c.created_at), 'category', c.category,
        'question', c.question, 'title', c.title, 'description', c.description, 'media', c.media, 'format', c.format,
        'line', c.line, 'unit', c.unit, 'options', c.options,
        'entries', coalesce((select jsonb_agg(jsonb_build_object('userId', e.user_id, 'optionId', e.option_id, 'points', e.points, 'at', tyche_private.ms(e.at)) order by e.at)
                             from entries e where e.challenge_id = c.id), '[]'),
        'stakeMode', c.stake_mode, 'odds', c.odds, 'forfeit', c.forfeit, 'visibility', c.visibility, 'groupId', c.group_id,
        'closesAt', tyche_private.ms(c.closes_at), 'startsAt', tyche_private.ms(c.starts_at), 'voteAt', tyche_private.ms(c.vote_at),
        'resolution', c.resolution, 'tieRule', c.tie_rule, 'verifier', c.verifier, 'status', c.status,
        'live', c.live, 'result', c.result, 'vote', c.vote, 'lockedAt', tyche_private.ms(c.locked_at),
        'nightId', c.night_id, 'gameId', c.game_id, 'prop', c.prop,
        'likes', coalesce((select jsonb_agg(l.user_id) from likes l where l.challenge_id = c.id), '[]'),
        'shares', c.shares)) order by c.created_at desc)
      from challenges c where tyche_private.can_see(c, uid)), '[]'),
    'messages', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', m.id, 'challengeId', m.challenge_id, 'kind', m.kind, 'userId', m.user_id, 'text', m.text, 'icon', m.icon,
        'image', m.image, 'replyTo', m.reply_to, 'reactions', m.reactions, 'at', tyche_private.ms(m.at))) order by m.at)
      from (select m.*, row_number() over (partition by m.challenge_id order by m.at desc) rn
            from messages m join challenges c on c.id = m.challenge_id
            where tyche_private.can_see(c, uid)) m
      where m.rn <= 200), '[]'),
    'notifications', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', n.id, 'kind', n.kind, 'actorId', n.actor_id, 'challengeId', n.challenge_id, 'text', n.text,
        'at', tyche_private.ms(n.at), 'read', n.read, 'to', n.to_user)) order by n.at desc)
      from (select * from notifications where to_user = uid order by at desc limit 100) n), '[]'),
    'groups', coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'ownerId', g.owner_id, 'name', g.name, 'emoji', g.emoji, 'createdAt', tyche_private.ms(g.created_at),
        'memberIds', (select jsonb_agg(gm.user_id) from group_members gm where gm.group_id = g.id)) order by g.created_at desc)
      from groups g where exists (select 1 from group_members gm where gm.group_id = g.id and gm.user_id = uid)), '[]'),
    'lastRead', coalesce((select jsonb_object_agg(challenge_id, tyche_private.ms(at)) from room_reads where user_id = uid), '{}'),
    'nights', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', n.id, 'hostId', n.host_id, 'name', n.name, 'createdAt', tyche_private.ms(n.created_at), 'status', n.status,
        'endedAt', tyche_private.ms(n.ended_at), 'champion', n.champion,
        'memberIds', (select jsonb_agg(m.user_id) from night_members m where m.night_id = n.id))) || n.data order by n.created_at desc)
      from nights n where exists (select 1 from night_members m where m.night_id = n.id and m.user_id = uid)), '[]')
  );
end $$;

create or replace function public.username_available(u text) returns boolean language sql stable security definer set search_path = public as $$
  select lower(u) ~ '^[a-z0-9._]{3,20}$' and not exists (select 1 from profiles where username = lower(u))
$$;

create or replace function public.suggested_profiles() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]') from (
    select jsonb_strip_nulls(jsonb_build_object('id', p.id, 'username', p.username, 'name', p.name, 'avatar', p.avatar, 'hue', p.hue, 'verified', p.verified,
      'followers', (select count(*) from follows f where f.followee = p.id), 'following', 0, 'baseWins', 0, 'baseLosses', 0, 'points', 0)) x
    from profiles p order by (select count(*) from follows f where f.followee = p.id) desc, p.created_at desc limit 12) s
$$;

create or replace function public.update_profile(p jsonb) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := tyche_private.me(); f text; u text := lower(trim(coalesce(p ->> 'username', '')));
begin
  if uid is null then raise exception 'Sign in first'; end if;
  if u <> '' then
    if u !~ '^[a-z0-9._]{3,20}$' then raise exception 'Usernames are 3–20 letters, numbers, . or _'; end if;
    if exists (select 1 from profiles where username = u and id <> uid) then raise exception 'That username is taken'; end if;
  end if;
  if p ? 'name' and length(trim(p ->> 'name')) between 1 and 1 then raise exception 'Name is too short'; end if;
  update profiles set
    username = case when u <> '' then u else username end,
    verified = verified and (u = '' or u = username), -- a new username has to be re-verified
    name = coalesce(nullif(left(trim(p ->> 'name'), 60), ''), name),
    bio = case when p ? 'bio' then nullif(left(trim(p ->> 'bio'), 160), '') else bio end,
    avatar = case when p ? 'avatar' then nullif(p ->> 'avatar', '') else avatar end
  where id = uid;
  for f in select jsonb_array_elements_text(coalesce(p -> 'follows', '[]')) loop
    perform tyche_private.follow(uid, f::uuid);
  end loop;
end $$;

-- Google/Apple users confirm name + username (and follow people) once.
create or replace function public.complete_onboarding(p jsonb) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := tyche_private.me(); u text := lower(trim(coalesce(p ->> 'username', ''))); f text;
begin
  if tyche_private.invite_only() and tyche_private.invite_match(p ->> 'invite_code') is null then
    raise exception 'Enter a valid invite password to join Tyche';
  end if;
  if u !~ '^[a-z0-9._]{3,20}$' then raise exception 'Usernames are 3–20 letters, numbers, . or _'; end if;
  if exists (select 1 from profiles where username = u and id <> uid) then raise exception 'That username is taken'; end if;
  update profiles set
    username = u,
    name = coalesce(nullif(left(trim(p ->> 'name'), 60), ''), name),
    bio = case when p ? 'bio' then nullif(left(p ->> 'bio', 160), '') else bio end,
    avatar = case when coalesce(p ->> 'avatar', '') <> '' then p ->> 'avatar' else avatar end,
    onboarded = true
  where id = uid;
  for f in select jsonb_array_elements_text(coalesce(p -> 'follows', '[]')) loop
    perform tyche_private.follow(uid, f::uuid);
  end loop;
end $$;

create or replace function public.create_challenge(p jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := tyche_private.me();
  cid uuid := coalesce((p ->> 'id')::uuid, gen_random_uuid());
  c challenges;
  my_opt text := nullif(p ->> 'myOptionId', '');
  stake int := coalesce((p ->> 'stake')::int, 0);
  bal int;
  inv text;
  nid uuid := nullif(p ->> 'nightId', '')::uuid;
  n nights;
  prop_meta jsonb := p -> 'prop';
begin
  perform tyche_private.assert_can_play(uid);
  if nid is not null then
    select * into n from nights where id = nid;
    if not found or not exists (select 1 from night_members where night_id = nid and user_id = uid) then raise exception 'You are not in that Game Night'; end if;
    if n.status <> 'live' then raise exception 'This Game Night has ended'; end if;
    -- props from anyone but the host wait for approval
    prop_meta := coalesce(prop_meta, '{}'::jsonb) || jsonb_build_object('pending', n.host_id <> uid);
  end if;
  if nid is null and not tyche_private.is_plus(uid)
     and (select count(*) from challenges where creator_id = uid and status <> 'settled' and night_id is null) >= tyche_private.cfg('open_limit') then
    raise exception 'Free accounts can host % open challenges at a time', tyche_private.cfg('open_limit');
  end if;
  if jsonb_array_length(coalesce(p -> 'options', '[]')) < 2 then raise exception 'Add at least two options'; end if;
  if nid is null and p ->> 'visibility' = 'group' and not exists (select 1 from group_members where group_id = (p ->> 'groupId')::uuid and user_id = uid) then
    raise exception 'You are not in that group';
  end if;

  insert into challenges (id, creator_id, category, question, title, description, media, format, line, unit, options, stake_mode, odds,
    forfeit, visibility, group_id, closes_at, starts_at, vote_at, resolution, tie_rule, verifier, night_id, game_id, prop)
  values (cid, uid, coalesce(p ->> 'category', 'Custom'), trim(p ->> 'question'), nullif(trim(p ->> 'title'), ''), nullif(trim(p ->> 'description'), ''),
    nullif(p ->> 'media', ''), p ->> 'format', (p ->> 'line')::numeric, nullif(p ->> 'unit', ''), p -> 'options',
    coalesce(p ->> 'stakeMode', 'even'), case when p ->> 'stakeMode' = 'odds' then p -> 'odds' end, nullif(trim(p ->> 'forfeit'), ''),
    case when nid is not null then 'night' else coalesce(p ->> 'visibility', 'friends') end,
    case when nid is null and p ->> 'visibility' = 'group' then (p ->> 'groupId')::uuid end,
    to_timestamp((p ->> 'closesAt')::bigint / 1000.0),
    case when p ? 'startsAt' and p ->> 'startsAt' is not null then to_timestamp((p ->> 'startsAt')::bigint / 1000.0) end,
    case when p ? 'voteAt' and p ->> 'voteAt' is not null then to_timestamp((p ->> 'voteAt')::bigint / 1000.0) end,
    coalesce(p ->> 'resolution', ''), coalesce(p ->> 'tieRule', 'refund'),
    case when nid is not null then 'creator' else coalesce(p ->> 'verifier', 'group') end,
    nid, nullif(p ->> 'gameId', ''), prop_meta)
  returning * into c;

  perform tyche_private.sys(cid, '✨', format('%s created the challenge%s', tyche_private.first_name(uid),
    case when c.line is not null then ' · Line set at ' || c.line::text || coalesce(' ' || nullif(c.unit, 'time'), '') else '' end));

  if my_opt is not null then
    if not tyche_private.has_option(c, my_opt) then raise exception 'Unknown option'; end if;
    if tyche_private.is_self(c, my_opt, uid) then raise exception 'You can’t bet on yourself'; end if;
    if c.stake_mode = 'bragging' then stake := 0;
    else
      select points into bal from profiles where id = uid for update;
      if c.prop ->> 'kind' = 'wild' then stake := tyche_private.cfg('wild_stake')::int; end if;
      if c.prop ->> 'kind' is distinct from 'wild' and stake < tyche_private.cfg('min_stake') then raise exception 'Minimum stake is % pts', tyche_private.cfg('min_stake'); end if;
      if stake > bal then raise exception 'Not enough points'; end if;
      perform tyche_private.pts('stake', cid);
      update profiles set points = points - stake where id = uid;
    end if;
    insert into entries (challenge_id, user_id, option_id, points) values (cid, uid, my_opt, stake);
    perform tyche_private.sys(cid, '🟣', format('%s joined %s%s', tyche_private.first_name(uid), tyche_private.opt_label(c, my_opt),
      case when stake > 0 then format(' with %s points', stake) else '' end));
  end if;

  for inv in select jsonb_array_elements_text(coalesce(p -> 'invited', '[]')) loop
    if inv::uuid <> uid then
      perform tyche_private.notify(inv::uuid, 'invite', format('invited you to “%s”', tyche_private.title(c)), cid, uid);
    end if;
  end loop;
  insert into room_reads (user_id, challenge_id, at) values (uid, cid, now() + interval '1 second')
    on conflict (user_id, challenge_id) do update set at = excluded.at;
  return cid;
end $$;

create or replace function public.join_challenge(cid uuid, oid text, pts int) returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := tyche_private.me();
  c challenges := tyche_private.lock(cid);
  prev entries;
  bal int;
  stake int := pts;
begin
  perform tyche_private.assert_can_play(uid);
  if not tyche_private.can_see(c, uid) then raise exception 'Challenge not found'; end if;
  if c.status <> 'open' or c.closes_at <= now() then raise exception 'Joining is closed'; end if;
  if not tyche_private.has_option(c, oid) then raise exception 'Unknown option'; end if;
  if tyche_private.is_self(c, oid, uid) then raise exception 'You can’t bet on yourself'; end if;
  if coalesce((c.prop ->> 'pending')::boolean, false) then raise exception 'Waiting for the host to approve this prop'; end if;
  if c.prop ->> 'kind' = 'wild' and c.stake_mode <> 'bragging' then stake := tyche_private.cfg('wild_stake')::int; end if;
  select * into prev from entries where challenge_id = cid and user_id = uid;
  select points into bal from profiles where id = uid for update;
  bal := bal + coalesce(prev.points, 0);
  if c.stake_mode = 'bragging' then stake := 0;
  else
    if c.prop ->> 'kind' is distinct from 'wild' and stake < tyche_private.cfg('min_stake') then raise exception 'Minimum stake is % pts', tyche_private.cfg('min_stake'); end if;
    if stake > bal then raise exception 'Not enough points'; end if;
  end if;
  perform tyche_private.pts('stake', cid);
  update profiles set points = bal - stake where id = uid;
  insert into entries (challenge_id, user_id, option_id, points) values (cid, uid, oid, stake)
    on conflict (challenge_id, user_id) do update set option_id = excluded.option_id, points = excluded.points, at = clock_timestamp();
  if prev.user_id is not null and prev.option_id <> oid then
    perform tyche_private.sys(cid, '🔁', format('%s changed position to %s%s', tyche_private.first_name(uid), tyche_private.opt_label(c, oid), case when stake > 0 then ' · ' || stake || ' pts' else '' end));
  elsif prev.user_id is not null then
    perform tyche_private.sys(cid, '➕', format('%s updated stake on %s to %s pts', tyche_private.first_name(uid), tyche_private.opt_label(c, oid), stake));
  else
    perform tyche_private.sys(cid, '🟣', format('%s joined %s%s', tyche_private.first_name(uid), tyche_private.opt_label(c, oid), case when stake > 0 then format(' with %s points', stake) else '' end));
    if c.creator_id <> uid then
      perform tyche_private.notify(c.creator_id, 'joined', format('joined %s on “%s”%s', tyche_private.opt_label(c, oid), tyche_private.title(c), case when stake > 0 then format(' with %s pts', stake) else '' end), cid, uid);
    end if;
  end if;
end $$;

create or replace function public.toggle_like(cid uuid) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := tyche_private.me();
begin
  if exists (select 1 from likes where challenge_id = cid and user_id = uid) then
    delete from likes where challenge_id = cid and user_id = uid;
  else
    insert into likes (challenge_id, user_id) values (cid, uid);
  end if;
end $$;

create or replace function public.add_share(cid uuid) returns void language sql security definer set search_path = public as $$
  update challenges set shares = shares + 1 where id = cid
$$;

create or replace function public.send_message(cid uuid, mid uuid, body text, reply uuid default null, img text default null) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := tyche_private.me(); c challenges; to_u uuid;
begin
  select * into c from challenges where id = cid;
  if not found or not tyche_private.can_see(c, uid) then raise exception 'Challenge not found'; end if;
  if coalesce(trim(body), '') = '' and img is null then return; end if;
  insert into messages (id, challenge_id, kind, user_id, text, image, reply_to) values (coalesce(mid, gen_random_uuid()), cid, 'chat', uid, coalesce(trim(body), ''), img, reply);
  insert into room_reads (user_id, challenge_id, at) values (uid, cid, now()) on conflict (user_id, challenge_id) do update set at = excluded.at;
  if reply is not null then
    select user_id into to_u from messages where id = reply;
    if to_u is not null and to_u <> uid then
      perform tyche_private.notify(to_u, 'reply', format('replied: “%s”', left(coalesce(nullif(trim(body), ''), 'Photo'), 80)), cid, uid);
    end if;
  end if;
end $$;

create or replace function public.react_message(mid uuid, emoji text) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := tyche_private.me(); m messages; list jsonb;
begin
  select * into m from messages where id = mid for update;
  if not found then return; end if;
  list := coalesce(m.reactions -> emoji, '[]');
  if list ? uid::text then
    list := (select coalesce(jsonb_agg(x), '[]') from jsonb_array_elements_text(list) x where x <> uid::text);
  else
    list := list || to_jsonb(uid::text);
  end if;
  update messages set reactions = case when jsonb_array_length(list) = 0 then reactions - emoji else jsonb_set(reactions, array[emoji], list) end where id = mid;
end $$;

create or replace function public.start_event(cid uuid) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := tyche_private.me(); c challenges := tyche_private.lock(cid);
begin
  if c.creator_id <> uid then raise exception 'Only the creator can start this'; end if;
  perform tyche_private.start(cid, false);
end $$;

create or replace function public.post_update(cid uuid, icon text, body text) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := tyche_private.me(); c challenges := tyche_private.lock(cid);
begin
  if c.creator_id <> uid or c.status <> 'live' then raise exception 'Only the creator can post live updates'; end if;
  perform tyche_private.sys(cid, coalesce(icon, '📣'), left(body, 200));
end $$;

create or replace function public.bump_counter(cid uuid, delta int) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := tyche_private.me(); c challenges := tyche_private.lock(cid); nxt int;
begin
  if c.creator_id <> uid or c.status <> 'live' or c.live ? 'endedAt' then raise exception 'Not allowed'; end if;
  nxt := greatest(0, coalesce((c.live ->> 'counter')::int, 0) + delta);
  update challenges set live = live || jsonb_build_object('counter', nxt) where id = cid;
  if delta > 0 then
    perform tyche_private.sys(cid, case c.category when 'Dinner' then '🍽️' when 'Sports' then '🎯' else '➕' end,
      format('%s: %s%s', coalesce(initcap(c.unit), 'Count'), nxt, case when c.line is not null and nxt > c.line then ' · OVER has hit' else '' end));
  end if;
end $$;

create or replace function public.stop_timer(cid uuid) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := tyche_private.me(); c challenges := tyche_private.lock(cid); mins int;
begin
  if c.creator_id <> uid or c.status <> 'live' or c.live ? 'endedAt' then raise exception 'Not allowed'; end if;
  update challenges set live = live || jsonb_build_object('endedAt', tyche_private.ms(now())) where id = cid;
  mins := greatest(1, round((tyche_private.ms(now()) - (c.live ->> 'startedAt')::bigint) / 60000.0));
  perform tyche_private.sys(cid, case when c.category = 'Road Trip' then '🏁' else '⏹' end,
    case when c.category = 'Road Trip' then 'Trip completed' else 'Event ended' end || ' — ' ||
    case when c.unit = 'time' then (mins / 60) || 'h ' || (mins % 60) || 'm' else 'time to call it' end);
end $$;

create or replace function public.submit_result(cid uuid, oid text, val numeric default null, evidence text default null) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := tyche_private.me(); c challenges := tyche_private.lock(cid); u uuid;
begin
  perform tyche_private.assert_can_play(uid);
  if c.creator_id <> uid then raise exception 'Only the creator submits the result'; end if;
  if c.status not in ('live', 'review', 'vote') then raise exception 'Start the event first'; end if;
  if oid <> '__tie' and not tyche_private.has_option(c, oid) then raise exception 'Unknown option'; end if;
  if c.result is not null then
    perform tyche_private.sys(cid, '🔁', format('%s resubmitted the result%s', tyche_private.first_name(uid), case when evidence is not null then ' with evidence' else '' end));
  end if;
  update challenges set
    status = 'review',
    vote = null,
    live = case when live is null then null when live ? 'endedAt' then live else live || jsonb_build_object('endedAt', tyche_private.ms(now())) end,
    result = jsonb_strip_nulls(jsonb_build_object('optionId', oid, 'value', val, 'submittedBy', uid, 'submittedAt', tyche_private.ms(now()),
      'confirmations', jsonb_build_array(uid), 'disputes', '[]'::jsonb, 'evidence', evidence))
  where id = cid;
  if evidence is not null then perform tyche_private.sys(cid, '📎', 'New evidence uploaded'); end if;
  perform tyche_private.sys(cid, '🏁', format('Result submitted: %s%s', tyche_private.opt_label(c, oid), case when val is not null then format(' (%s)', val) else '' end));
  if c.verifier = 'creator' then
    perform tyche_private.settle(cid);
  else
    foreach u in array tyche_private.voters(c) loop
      if u <> uid then perform tyche_private.notify(u, 'confirmed', format('submitted a result for “%s” — confirm it', tyche_private.title(c)), cid, uid); end if;
    end loop;
  end if;
end $$;

create or replace function public.confirm_result(cid uuid) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := tyche_private.me(); c challenges := tyche_private.lock(cid); confs jsonb;
begin
  if c.status <> 'review' or c.result is null then raise exception 'Nothing to confirm'; end if;
  if not uid = any (tyche_private.voters(c)) then raise exception 'Only participants can confirm'; end if;
  if c.result -> 'confirmations' ? uid::text then return; end if;
  confs := (c.result -> 'confirmations') || to_jsonb(uid::text);
  update challenges set result = jsonb_set(result, '{confirmations}', confs) where id = cid;
  perform tyche_private.sys(cid, '👍', format('%s confirmed the result', tyche_private.first_name(uid)));
  if jsonb_array_length(confs) >= tyche_private.cfg('required_confirms') then perform tyche_private.settle(cid); end if;
end $$;

create or replace function public.dispute_result(cid uuid, reason text default '') returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := tyche_private.me(); c challenges := tyche_private.lock(cid); disp jsonb;
begin
  if c.status <> 'review' or c.result is null then raise exception 'Nothing to dispute'; end if;
  if not uid = any (tyche_private.voters(c)) then raise exception 'Only participants can dispute'; end if;
  if c.result -> 'disputes' ? uid::text then return; end if;
  disp := coalesce(c.result -> 'disputes', '[]') || to_jsonb(uid::text);
  update challenges set result = jsonb_set(jsonb_set(result, '{disputes}', disp), '{confirmations}',
      (select coalesce(jsonb_agg(x), '[]') from jsonb_array_elements_text(result -> 'confirmations') x where x <> uid::text))
  where id = cid;
  perform tyche_private.sys(cid, '⚠️', format('%s disputed the result%s', tyche_private.first_name(uid), case when coalesce(trim(reason), '') <> '' then format(': “%s”', left(trim(reason), 140)) else '' end));
  if jsonb_array_length(disp) >= tyche_private.cfg('disputes_to_freeze') then perform tyche_private.open_vote(cid, 'dispute'); end if;
end $$;

create or replace function public.cast_vote(cid uuid, oid text) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := tyche_private.me(); c challenges := tyche_private.lock(cid); changed boolean;
begin
  perform tyche_private.assert_can_play(uid);
  if c.status <> 'vote' or c.vote is null then raise exception 'Voting isn’t open'; end if;
  if not uid = any (tyche_private.voters(c)) then raise exception 'Only participants can vote'; end if;
  if not oid = any (tyche_private.vote_choices(c, uid)) then raise exception 'You can’t vote for that option'; end if;
  changed := (c.vote -> 'votes') ? uid::text and c.vote -> 'votes' ->> uid::text <> oid;
  update challenges set vote = jsonb_set(vote, array['votes', uid::text], to_jsonb(oid)) where id = cid;
  perform tyche_private.sys(cid, '🗳️', format('%s %s', tyche_private.first_name(uid), case when changed then 'changed their vote' else 'voted' end));
  perform tyche_private.resolve_vote(cid, false);
end $$;

create or replace function public.open_voting(cid uuid) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := tyche_private.me(); c challenges := tyche_private.lock(cid);
begin
  if c.creator_id <> uid then raise exception 'Only the creator can open voting'; end if;
  if c.status in ('settled', 'vote') then return; end if;
  if c.status = 'open' then perform tyche_private.start(cid, false); end if;
  perform tyche_private.open_vote(cid, 'participants');
end $$;

create or replace function public.nudge(cid uuid) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := tyche_private.me(); c challenges;
begin
  select * into c from challenges where id = cid;
  if not found or c.creator_id = uid then return; end if;
  perform tyche_private.sys(cid, '👋', format('%s nudged %s to %s', tyche_private.first_name(uid), tyche_private.first_name(c.creator_id),
    case when c.verifier = 'vote' then 'open voting' else 'submit the result' end));
  perform tyche_private.notify(c.creator_id, 'reply', format('nudged you to %s “%s”', case when c.verifier = 'vote' then 'open voting on' else 'submit the result for' end, tyche_private.title(c)), cid, uid);
end $$;

create or replace function public.follow_toggle(target uuid) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := tyche_private.me();
begin
  if target = uid then return; end if;
  if exists (select 1 from follows where follower = uid and followee = target) then
    delete from follows where follower = uid and followee = target;
  else
    perform tyche_private.follow(uid, target);
  end if;
end $$;

create or replace function public.read_notifications() returns void language sql security definer set search_path = public as $$
  update notifications set read = true where to_user = auth.uid() and not read
$$;

create or replace function public.read_room(cid uuid) returns void language sql security definer set search_path = public as $$
  insert into room_reads (user_id, challenge_id, at) values (auth.uid(), cid, now())
  on conflict (user_id, challenge_id) do update set at = excluded.at
$$;

create or replace function public.create_group(gid uuid, gname text, gemoji text, members uuid[]) returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := tyche_private.me(); m uuid;
begin
  if not tyche_private.is_plus(uid) and (select count(*) from groups where owner_id = uid) >= tyche_private.cfg('group_limit') then
    raise exception 'Free accounts can run % private groups', tyche_private.cfg('group_limit');
  end if;
  insert into groups (id, owner_id, name, emoji) values (coalesce(gid, gen_random_uuid()), uid, trim(gname), coalesce(nullif(gemoji, ''), '🔥')) returning id into gid;
  insert into group_members (group_id, user_id) values (gid, uid);
  foreach m in array coalesce(members, '{}') loop
    insert into group_members (group_id, user_id) values (gid, m) on conflict do nothing;
    if m <> uid then perform tyche_private.notify(m, 'invite', format('added you to %s %s', gemoji, gname), null, uid); end if;
  end loop;
  return gid;
end $$;

-- Daily refill. tz = the device's IANA time zone so "today" matches the user's day.
create or replace function public.claim_daily(tz text default 'UTC') returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := tyche_private.me();
  p profiles;
  day_start timestamptz;
  amount int;
  streak int;
begin
  select * into p from profiles where id = uid for update;
  begin
    day_start := date_trunc('day', now() at time zone tz) at time zone tz;
  exception when others then
    day_start := date_trunc('day', now());
  end;
  if p.last_claim_at is not null and p.last_claim_at >= day_start then raise exception 'Already claimed today'; end if;
  amount := case when tyche_private.is_plus(uid) then tyche_private.cfg('daily_plus') else tyche_private.cfg('daily_free') end;
  streak := case when p.last_claim_at >= day_start - interval '1 day' then p.claim_streak + 1 else 1 end;
  perform tyche_private.pts('daily_claim');
  update profiles set points = points + amount, last_claim_at = now(), claim_streak = streak where id = uid;
  return jsonb_build_object('amount', amount, 'streak', streak);
end $$;

-- BETA ONLY: simulated subscription. Replace with a RevenueCat/Stripe webhook
-- (server-side, service role) before charging real money.
create or replace function public.subscribe_plus(plan text) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := tyche_private.me(); p profiles; trial_end bigint; period_days int;
begin
  if plan not in ('monthly', 'yearly', 'crew') then raise exception 'Unknown plan'; end if;
  select * into p from profiles where id = uid for update;
  trial_end := case when p.trial_used then null else tyche_private.ms(now() + make_interval(days => tyche_private.cfg('trial_days')::int)) end;
  period_days := case when plan = 'yearly' then 365 else 30 end;
  perform tyche_private.pts('plus_topup');
  update profiles set
    trial_used = true,
    plus = jsonb_strip_nulls(jsonb_build_object('plan', plan, 'startedAt', tyche_private.ms(now()), 'trialEndsAt', trial_end,
      'renewsAt', coalesce(trial_end, tyche_private.ms(now())) + period_days::bigint * 86400000)),
    points = points + case when not tyche_private.is_plus(uid) and p.last_claim_at >= date_trunc('day', now())
                           then (tyche_private.cfg('daily_plus') - tyche_private.cfg('daily_free'))::int else 0 end
  where id = uid;
  perform tyche_private.notify(uid, 'invite', format('Welcome to Tyche+ ✦ %sYou now get %s points every day.',
    case when trial_end is not null then tyche_private.cfg('trial_days') || '-day free trial is on. ' else '' end, tyche_private.cfg('daily_plus')));
end $$;

create or replace function public.set_plus_canceled(canceled boolean) returns void language sql security definer set search_path = public as $$
  update profiles set plus = plus || jsonb_build_object('canceled', canceled) where id = auth.uid() and plus is not null
$$;

create or replace function public.set_card_theme(theme text) returns void language sql security definer set search_path = public as $$
  update profiles set card_theme = theme where id = auth.uid()
$$;

create or replace function public.tick() returns void language sql security definer set search_path = public as $$
  select tyche_private.tick()
$$;

-- ============================================================ Game Night ====
-- Host-controlled game nights. The app computes scores and which props each
-- round decides; the server checks the caller is the host and does payouts.

create or replace function tyche_private.night_host(nid uuid) returns public.nights language plpgsql as $$
declare n public.nights;
begin
  select * into n from public.nights where id = nid for update;
  if not found then raise exception 'Game Night not found'; end if;
  if n.host_id <> auth.uid() then raise exception 'Only the host can do that'; end if;
  return n;
end $$;

create or replace function tyche_private.prop_host(cid uuid) returns public.challenges language plpgsql as $$
declare c public.challenges := tyche_private.lock(cid);
begin
  if c.night_id is null then raise exception 'Not a Game Night prop'; end if;
  perform tyche_private.night_host(c.night_id);
  return c;
end $$;

-- data never carries the night's own columns
create or replace function tyche_private.clean_night_data(d jsonb) returns jsonb language sql immutable as $$
  select coalesce(d, '{}'::jsonb) - 'id' - 'hostId' - 'name' - 'createdAt' - 'status' - 'endedAt' - 'champion' - 'memberIds'
$$;

create or replace function public.create_night(nid uuid, nname text, ndata jsonb, members uuid[]) returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := tyche_private.me(); m uuid;
begin
  perform tyche_private.assert_can_play(uid);
  insert into nights (id, host_id, name, data) values (coalesce(nid, gen_random_uuid()), uid, left(trim(nname), 60), tyche_private.clean_night_data(ndata)) returning id into nid;
  insert into night_members (night_id, user_id) values (nid, uid);
  foreach m in array coalesce(members, '{}') loop
    if m <> uid then
      insert into night_members (night_id, user_id) values (nid, m) on conflict do nothing;
      perform tyche_private.notify(m, 'invite', format('invited you to Game Night: %s 🎲', trim(nname)), null, uid);
    end if;
  end loop;
  return nid;
end $$;

create or replace function public.update_night(nid uuid, ndata jsonb) returns void language plpgsql security definer set search_path = public as $$
declare n nights := tyche_private.night_host(nid);
begin
  if n.status <> 'live' then raise exception 'This Game Night has ended'; end if;
  update nights set data = tyche_private.clean_night_data(ndata) where id = nid;
end $$;

create or replace function public.night_invite(nid uuid, members uuid[]) returns void language plpgsql security definer set search_path = public as $$
declare n nights := tyche_private.night_host(nid); m uuid;
begin
  foreach m in array coalesce(members, '{}') loop
    insert into night_members (night_id, user_id) values (nid, m) on conflict do nothing;
    if found then perform tyche_private.notify(m, 'invite', format('invited you to Game Night: %s 🎲', n.name), null, n.host_id); end if;
  end loop;
end $$;

create or replace function public.night_approve_prop(cid uuid) returns void language plpgsql security definer set search_path = public as $$
declare c challenges := tyche_private.prop_host(cid);
begin
  update challenges set prop = coalesce(prop, '{}') || '{"pending": false}' where id = cid;
  perform tyche_private.sys(cid, '✅', 'Host approved this prop — picks are open');
  if c.creator_id <> auth.uid() then perform tyche_private.notify(c.creator_id, 'confirmed', format('approved your prop: “%s”', c.question), cid, auth.uid()); end if;
end $$;

create or replace function public.night_edit_prop(cid uuid, q text, opts jsonb default null, new_line numeric default null) returns void language plpgsql security definer set search_path = public as $$
declare c challenges := tyche_private.prop_host(cid);
begin
  if c.status = 'settled' then raise exception 'Already settled'; end if;
  if (opts is not null or new_line is not null) and exists (select 1 from entries where challenge_id = cid) then
    raise exception 'People already picked — you can only change the wording';
  end if;
  update challenges set
    question = coalesce(nullif(trim(q), ''), question),
    options = coalesce(opts, options),
    line = coalesce(new_line, line),
    prop = case when new_line is not null and prop ? 'resolver' and prop -> 'resolver' ? 'line'
                then jsonb_set(prop, '{resolver,line}', to_jsonb(new_line)) else prop end
  where id = cid;
  perform tyche_private.sys(cid, '✏️', 'Host edited this prop');
end $$;

create or replace function public.night_remove_prop(cid uuid) returns void language plpgsql security definer set search_path = public as $$
declare c challenges := tyche_private.prop_host(cid); e record;
begin
  if c.status = 'settled' then raise exception 'Already settled — re-settle it instead'; end if;
  perform tyche_private.pts('refund', cid);
  for e in select * from entries where challenge_id = cid loop
    update profiles set points = points + e.points where id = e.user_id;
  end loop;
  delete from challenges where id = cid;
end $$;

create or replace function public.night_lock(cids uuid[]) returns void language plpgsql security definer set search_path = public as $$
declare cid uuid; c challenges;
begin
  foreach cid in array coalesce(cids, '{}') loop
    c := tyche_private.prop_host(cid);
    if c.status = 'open' and c.closes_at > now() then
      update challenges set closes_at = now(), locked_at = now() where id = cid;
      perform tyche_private.sys(cid, '🔒', 'Picks locked — cards are being dealt');
    end if;
  end loop;
end $$;

-- items: [{ "cid": "...", "optionId": "...", "value": 6 }]
create or replace function public.night_settle(items jsonb) returns int language plpgsql security definer set search_path = public as $$
declare it jsonb; c challenges; oid text; n int := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(items, '[]')) loop
    c := tyche_private.prop_host((it ->> 'cid')::uuid);
    if c.status = 'settled' then continue; end if;
    oid := it ->> 'optionId';
    if oid <> '__tie' and not tyche_private.has_option(c, oid) then raise exception 'Unknown option % for “%”', oid, c.question; end if;
    update challenges set status = 'review', closes_at = least(closes_at, now()),
      result = jsonb_strip_nulls(jsonb_build_object('optionId', oid, 'value', (it -> 'value'), 'submittedBy', auth.uid(),
        'submittedAt', tyche_private.ms(now()), 'confirmations', jsonb_build_array(auth.uid()), 'disputes', '[]'::jsonb))
    where id = c.id;
    perform tyche_private.sys(c.id, '🎲', format('Settled from the scoreboard: %s%s', tyche_private.opt_label(c, oid),
      case when it ? 'value' and it ->> 'value' is not null then format(' (%s)', it ->> 'value') else '' end));
    perform tyche_private.settle(c.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Host fixes a wrong result: undo payouts, then settle again.
create or replace function public.night_resettle(cid uuid, oid text) returns void language plpgsql security definer set search_path = public as $$
declare c challenges := tyche_private.prop_host(cid); e record; net int;
begin
  if c.status <> 'settled' then raise exception 'Not settled yet'; end if;
  if oid <> '__tie' and not tyche_private.has_option(c, oid) then raise exception 'Unknown option'; end if;
  perform tyche_private.pts('resettle', cid);
  for e in select * from entries where challenge_id = cid loop
    net := coalesce((c.result -> 'payouts' ->> e.user_id::text)::int, 0);
    if net >= 0 then update profiles set points = greatest(0, points - (e.points + net)) where id = e.user_id; end if;
  end loop;
  update challenges set status = 'review',
    result = jsonb_build_object('optionId', oid, 'submittedBy', auth.uid(), 'submittedAt', tyche_private.ms(now()),
      'confirmations', jsonb_build_array(auth.uid()), 'disputes', '[]'::jsonb)
  where id = cid;
  perform tyche_private.sys(cid, '↩️', format('Host re-settled this prop: %s', tyche_private.opt_label(c, oid)));
  perform tyche_private.settle(cid);
end $$;

create or replace function public.night_dispute(cid uuid, reason text default '') returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := tyche_private.me(); c challenges; n nights;
begin
  select * into c from challenges where id = cid;
  if not found or c.night_id is null then raise exception 'Not a Game Night prop'; end if;
  if not exists (select 1 from night_members where night_id = c.night_id and user_id = uid) then raise exception 'Not in this Game Night'; end if;
  select * into n from nights where id = c.night_id;
  perform tyche_private.sys(cid, '⚠️', format('%s disputed this%s', tyche_private.first_name(uid), case when coalesce(trim(reason), '') <> '' then format(': “%s”', left(trim(reason), 140)) else '' end));
  if n.host_id <> uid then perform tyche_private.notify(n.host_id, 'reply', format('disputed “%s”', c.question), cid, uid); end if;
end $$;

-- champ: { userId, name, score, awards: [...] }
create or replace function public.end_night(nid uuid, champ jsonb, ndata jsonb default null) returns void language plpgsql security definer set search_path = public as $$
declare n nights := tyche_private.night_host(nid); m record;
begin
  if n.status = 'ended' then return; end if;
  update nights set status = 'ended', ended_at = now(), champion = champ,
    data = case when ndata is null then data else tyche_private.clean_night_data(ndata) end
  where id = nid;
  for m in select user_id from night_members where night_id = nid loop
    perform tyche_private.notify(m.user_id, 'won', format('👑 %s is the champion of %s', coalesce(champ ->> 'name', 'Someone'), n.name), null, nullif(champ ->> 'userId', '')::uuid);
  end loop;
end $$;

-- ----------------------------------------------------------- permissions ----

alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.challenges enable row level security;
alter table public.entries enable row level security;
alter table public.likes enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.room_reads enable row level security;

-- Read-only policies (used by Realtime to decide who receives which change).
create or replace function public.can_see_challenge(cid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select tyche_private.can_see(c, auth.uid()) from challenges c where c.id = cid), false)
$$;

drop policy if exists "read profiles" on public.profiles;
create policy "read profiles" on public.profiles for select to authenticated using (true);
drop policy if exists "read own follows" on public.follows;
create policy "read own follows" on public.follows for select to authenticated using (follower = auth.uid() or followee = auth.uid());
drop policy if exists "read visible challenges" on public.challenges;
create policy "read visible challenges" on public.challenges for select to authenticated using (public.can_see_challenge(id));
drop policy if exists "read visible entries" on public.entries;
create policy "read visible entries" on public.entries for select to authenticated using (public.can_see_challenge(challenge_id));
drop policy if exists "read visible messages" on public.messages;
create policy "read visible messages" on public.messages for select to authenticated using (public.can_see_challenge(challenge_id));
drop policy if exists "read own notifications" on public.notifications;
create policy "read own notifications" on public.notifications for select to authenticated using (to_user = auth.uid());

revoke all on all tables in schema public from anon;
revoke insert, update, delete on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;

revoke all on schema tyche_private from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.username_available(text) to anon;
grant execute on function public.suggested_profiles() to anon;

-- If real billing is installed (billing.sql), keep Plus server-controlled even after re-running this file.
do $$
begin
  if to_regclass('public.billing_customers') is not null then
    revoke execute on function public.subscribe_plus(text) from public, anon, authenticated;
    revoke execute on function public.set_plus_canceled(boolean) from public, anon, authenticated;
    revoke execute on function public.apply_billing(uuid, jsonb) from public, anon, authenticated;
  end if;
end $$;

-- Account deletion (called by /api/account/delete with the service-role key).
-- Refunds everyone else's stakes on challenges that disappear with this account
-- (their own challenges + props in Game Nights they host), before the cascade.
create or replace function public.delete_account_prepare(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform tyche_private.pts('refund');
  update profiles p set points = p.points + r.total
  from (
    select e.user_id, sum(e.points)::int as total
    from entries e join challenges c on c.id = e.challenge_id
    where c.status <> 'settled' and e.user_id <> uid
      and (c.creator_id = uid or c.night_id in (select id from nights where host_id = uid))
    group by e.user_id
  ) r
  where p.id = r.user_id;
end $$;
revoke execute on function public.delete_account_prepare(uuid) from public, anon, authenticated;
grant execute on function public.delete_account_prepare(uuid) to service_role;


-- =================================================================== ADS ===
-- Sponsored cards (Home feed) and banners (Discover), sold as campaigns.
-- Manage campaigns in Supabase → Table Editor → ad_campaigns.
-- Reporting: select * from ad_report;  (Table Editor shows it too)

create table if not exists public.ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  advertiser text not null,                       -- the company; frequency caps are per company
  logo text not null default '📣',                -- emoji or image URL
  tint text not null default '#8247FF',
  url text not null default '',                   -- where taps go
  domain text not null default '',                -- shown on the card, e.g. "conexcard.com"
  card_question text,                             -- leave empty for banner-only campaigns
  card_options jsonb not null default '[]',       -- exactly two: [{"label":"…","sub":"…"}, …]
  card_cta text not null default 'Learn more',
  banner_text text,                               -- leave empty for card-only campaigns
  duration_days int not null default 7 check (duration_days in (7, 14, 30)),
  impressions_purchased int not null default 1000 check (impressions_purchased in (1000, 3000, 5000, 10000)),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  status text not null default 'active' check (status in ('active', 'paused')),
  created_at timestamptz not null default now()
);

-- Campaign priority (set in /admin). Weighs which eligible campaign gets a placement;
-- it never overrides dates, remaining impressions, pacing, advertiser status or caps.
alter table public.ad_campaigns add column if not exists priority text not null default 'normal';
alter table public.ad_campaigns drop constraint if exists ad_campaigns_priority_check;
alter table public.ad_campaigns add constraint ad_campaigns_priority_check check (priority in ('normal', 'high', 'urgent'));
-- 'canceled' ends a campaign for good (history is kept).
alter table public.ad_campaigns drop constraint if exists ad_campaigns_status_check;
alter table public.ad_campaigns add constraint ad_campaigns_status_check check (status in ('active', 'paused', 'canceled'));

-- ends_at follows starts_at + duration_days, unless it was set explicitly (admin date edits).
create or replace function tyche_private.ad_set_end() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.ends_at is null then new.ends_at := new.starts_at + make_interval(days => new.duration_days); end if;
  elsif new.ends_at is not distinct from old.ends_at then
    new.ends_at := new.starts_at + make_interval(days => new.duration_days);
  end if;
  return new;
end $$;
drop trigger if exists ad_set_end on public.ad_campaigns;
create trigger ad_set_end before insert or update of starts_at, duration_days on public.ad_campaigns
  for each row execute function tyche_private.ad_set_end();

-- Advertisers. Linked to campaigns by name (ad_campaigns.advertiser), so adding a campaign
-- in the Table Editor with a new company name creates the advertiser automatically.
-- Pausing or suspending an advertiser stops all of its ads; nothing is deleted.
create table if not exists public.ad_advertisers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 1 and 80),
  contact_name text,
  contact_email text,
  contact_phone text,
  website text,
  notes text,
  status text not null default 'active' check (status in ('active', 'paused', 'suspended')),
  status_reason text,
  created_at timestamptz not null default now()
);
insert into public.ad_advertisers (name) select distinct trim(advertiser) from public.ad_campaigns on conflict (name) do nothing;
update public.ad_campaigns set advertiser = trim(advertiser) where advertiser <> trim(advertiser);

create or replace function tyche_private.ad_ensure_advertiser() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.advertiser := trim(new.advertiser);
  insert into public.ad_advertisers (name) values (new.advertiser) on conflict (name) do nothing;
  return new;
end $$;
drop trigger if exists ad_ensure_advertiser on public.ad_campaigns;
create trigger ad_ensure_advertiser before insert or update of advertiser on public.ad_campaigns
  for each row execute function tyche_private.ad_ensure_advertiser();
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ad_campaigns_advertiser_fkey') then
    alter table public.ad_campaigns add constraint ad_campaigns_advertiser_fkey
      foreign key (advertiser) references public.ad_advertisers (name) on update cascade;
  end if;
end $$;

create table if not exists public.ad_events (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.ad_campaigns (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('impression', 'click')),
  format text not null check (format in ('card', 'banner')),
  at timestamptz not null default clock_timestamp()
);
-- app session the event happened in (for per-session caps); null from older app versions
alter table public.ad_events add column if not exists session_id uuid;
create index if not exists ad_events_user_at on public.ad_events (user_id, at desc);
create index if not exists ad_events_campaign on public.ad_events (campaign_id, kind);
create index if not exists ad_events_session on public.ad_events (session_id) where session_id is not null;
create index if not exists ad_events_at on public.ad_events (at);

alter table public.ad_campaigns enable row level security;
alter table public.ad_events enable row level security;
alter table public.ad_advertisers enable row level security;
revoke all on public.ad_campaigns, public.ad_events, public.ad_advertisers from anon, authenticated;

-- Start of "today" in the viewer's time zone.
create or replace function tyche_private.ad_day_start(tz text) returns timestamptz language plpgsql stable as $$
begin
  return date_trunc('day', now() at time zone tz) at time zone tz;
exception when others then
  return date_trunc('day', now());
end $$;

-- Per-company and per-creative frequency caps for one viewer. true = may show.
drop function if exists tyche_private.ad_under_caps(uuid, public.ad_campaigns, text, timestamptz);
create or replace function tyche_private.ad_under_caps(uid uuid, cid uuid, company text, fmt text, day_start timestamptz) returns boolean
language sql stable set search_path = public as $$
  with seen as (
    select e.campaign_id, a.advertiser, e.format, e.at
    from ad_events e join ad_campaigns a on a.id = e.campaign_id
    where e.user_id = uid and e.kind = 'impression' and e.at > least(day_start, now() - interval '24 hours')
  )
  select
    (fmt <> 'banner' or (select count(*) from seen where advertiser = company and format = 'banner' and at >= day_start) < tyche_private.cfg('ad_cap_company_banner_day'))
    and (fmt <> 'card' or (select count(*) from seen where advertiser = company and format = 'card' and at > now() - interval '24 hours') < tyche_private.cfg('ad_cap_company_card_24h'))
    and (fmt <> 'card' or (select count(*) from seen where campaign_id = cid and format = 'card' and at > now() - interval '24 hours') < tyche_private.cfg('ad_cap_card_24h'))
    and (select count(*) from seen where advertiser = company and at >= day_start) < tyche_private.cfg('ad_cap_company_any_day')
$$;

-- Viewer-level limits that don't depend on the campaign: placement on/off, all-ads daily
-- limit, per-session limits, minimum time between sponsored cards. true = may show.
create or replace function tyche_private.ad_viewer_ok(uid uuid, fmt text, day_start timestamptz, sid uuid) returns boolean
language plpgsql stable set search_path = public as $$
declare lim numeric;
begin
  if tyche_private.cfg(case fmt when 'card' then 'ad_card_enabled' else 'ad_banner_enabled' end) < 1 then return false; end if;
  lim := tyche_private.cfg('ad_global_daily_limit');
  if lim > 0 and (select count(*) from ad_events where user_id = uid and kind = 'impression' and at >= day_start) >= lim then return false; end if;
  lim := tyche_private.cfg(case fmt when 'card' then 'ad_card_session_limit' else 'ad_banner_session_limit' end);
  if lim > 0 and sid is not null
     and (select count(*) from ad_events where session_id = sid and user_id = uid and kind = 'impression' and format = fmt) >= lim then return false; end if;
  if fmt = 'card' then
    lim := tyche_private.cfg('ad_card_min_minutes');
    if lim > 0 and exists (select 1 from ad_events where user_id = uid and kind = 'impression' and format = 'card'
                           and at > now() - make_interval(mins => lim::int)) then return false; end if;
  end if;
  return true;
end $$;

-- Pacing: where a campaign *should* be by now if its impressions were spread evenly.
create or replace function tyche_private.ad_target(c public.ad_campaigns) returns numeric language sql stable as $$
  select c.impressions_purchased * least(1, greatest(0,
    extract(epoch from (now() + interval '1 hour' - c.starts_at)) / nullif(extract(epoch from (c.ends_at - c.starts_at)), 0)))
$$;

create or replace function tyche_private.ad_delivered(cid uuid) returns int language sql stable as $$
  select count(*)::int from public.ad_events where campaign_id = cid and kind = 'impression'
$$;

create or replace function tyche_private.ad_priority_weight(p text) returns numeric language sql immutable as $$
  select case p when 'urgent' then 4 when 'high' then 2 else 1 end::numeric
$$;

-- Picks the campaign to show in one placement, or null if nothing should show.
--   fmt: 'card' | 'banner';  organic_seen: organic posts the viewer has seen since the last
--   sponsored card (cards only);  exclude: campaigns already on screen;  sid: app session id.
drop function if exists public.ad_pick(text, int, text, uuid[]);
create or replace function public.ad_pick(fmt text, organic_seen int default 0, tz text default 'UTC', exclude uuid[] default '{}', sid uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := tyche_private.me();
  day_start timestamptz := tyche_private.ad_day_start(tz);
  share_cap numeric := tyche_private.cfg('ad_banner_max_share_pct');
  max_creatives int := tyche_private.cfg('ad_banner_max_creatives')::int;
  pick uuid;
  c ad_campaigns;
begin
  if fmt not in ('card', 'banner') then return null; end if;
  -- 1. placement on? viewer under daily / session / spacing limits?
  if not tyche_private.ad_viewer_ok(uid, fmt, day_start, sid) then return null; end if;
  if fmt = 'card' then
    -- 2. enough organic posts? under the daily sponsored-card limit?
    if organic_seen < tyche_private.cfg('ad_card_gap') and exists (
         select 1 from ad_events where user_id = uid and kind = 'impression' and format = 'card' and at >= day_start)
       then return null; end if;
    if organic_seen < tyche_private.cfg('ad_card_min_organic') then return null; end if;
    if (select count(*) from ad_events where user_id = uid and kind = 'impression' and format = 'card' and at >= day_start)
       >= tyche_private.cfg('ad_card_daily_limit') then return null; end if;
  end if;

  -- 3. eligible campaigns (running, advertiser active, not ahead of pace, creative present)
  -- 4. weighted by how far behind schedule they are × priority
  with live as (
    select a.id, a.advertiser, a.priority, a.created_at, a.impressions_purchased, d.done, d.target, d.slack
    from ad_campaigns a
    join ad_advertisers v on v.name = a.advertiser and v.status = 'active'
    cross join lateral (select tyche_private.ad_delivered(a.id) as done, tyche_private.ad_target(a) as target,
                               greatest(3, a.impressions_purchased * 0.01) as slack) d
    where a.status = 'active' and now() >= a.starts_at and now() < a.ends_at
      and d.done < a.impressions_purchased
      and d.done < d.target + d.slack                        -- don't run ahead of the even pace
      and not (a.id = any(coalesce(exclude, '{}')))
      and case fmt when 'card' then a.card_question is not null and jsonb_array_length(a.card_options) = 2
                   else a.banner_text is not null end
  ),
  ranked as (
    select l.*, row_number() over (partition by l.advertiser
             order by tyche_private.ad_priority_weight(l.priority) desc, (l.target + l.slack - l.done) / l.impressions_purchased desc, l.created_at) as creative_rank
    from live l
  ),
  shares as (   -- banner share of voice over the last 24h
    select a.advertiser, count(*)::numeric as n, sum(count(*)) over () as total
    from ad_events e join ad_campaigns a on a.id = e.campaign_id
    where fmt = 'banner' and share_cap < 100 and e.kind = 'impression' and e.format = 'banner' and e.at > now() - interval '24 hours'
    group by a.advertiser
  )
  select r.id into pick
  from ranked r
  where (fmt <> 'banner' or max_creatives <= 0 or r.creative_rank <= max_creatives)
    and (fmt <> 'banner' or share_cap >= 100 or not exists (
          select 1 from shares s where s.advertiser = r.advertiser and s.total >= 50 and s.n * 100 / s.total >= share_cap))
    and tyche_private.ad_under_caps(uid, r.id, r.advertiser, fmt, day_start)
  order by random() ^ (1.0 / greatest(0.0001, tyche_private.ad_priority_weight(r.priority) * (r.target + r.slack - r.done) / r.impressions_purchased)) desc
  limit 1;

  if pick is null then return null; end if;
  select * into c from ad_campaigns where id = pick;
  return jsonb_build_object('id', c.id, 'sponsor', c.advertiser, 'logo', c.logo, 'tint', c.tint, 'url', c.url, 'domain', c.domain,
    'question', c.card_question, 'options', c.card_options, 'cta', c.card_cta, 'banner', c.banner_text);
end $$;

-- 5. Records a viewable impression (≥50% on screen for 1s) or a click.
--    Impressions are re-checked against caps and remaining delivery, so they can't be inflated.
drop function if exists public.ad_record(uuid, text, text, text);
create or replace function public.ad_record(cid uuid, fmt text, ev text, tz text default 'UTC', sid uuid default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := tyche_private.me();
  day_start timestamptz := tyche_private.ad_day_start(tz);
  c ad_campaigns;
begin
  if fmt not in ('card', 'banner') or ev not in ('impression', 'click') then return false; end if;
  select * into c from ad_campaigns where id = cid for update;   -- serialize the remaining-count check
  if not found then return false; end if;
  if ev = 'impression' then
    if c.status <> 'active' or now() < c.starts_at or now() >= c.ends_at or tyche_private.ad_delivered(cid) >= c.impressions_purchased then return false; end if;
    if not exists (select 1 from ad_advertisers v where v.name = c.advertiser and v.status = 'active') then return false; end if;
    if not tyche_private.ad_viewer_ok(uid, fmt, day_start, sid) then return false; end if;
    if not tyche_private.ad_under_caps(uid, c.id, c.advertiser, fmt, day_start) then return false; end if;
  else
    -- a click needs a recent impression, and counts once per hour per viewer
    if not exists (select 1 from ad_events where campaign_id = cid and user_id = uid and kind = 'impression' and at > now() - interval '24 hours') then return false; end if;
    if exists (select 1 from ad_events where campaign_id = cid and user_id = uid and kind = 'click' and at > now() - interval '1 hour') then return false; end if;
  end if;
  insert into ad_events (campaign_id, user_id, kind, format, session_id) values (cid, uid, ev, fmt, sid);
  return true;
end $$;

-- Ad settings the app needs on the device (set in /admin → Ad settings; no redeploy needed).
create or replace function public.ad_config() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'bannerEnabled', tyche_private.cfg('ad_banner_enabled') >= 1,
    'cardEnabled', tyche_private.cfg('ad_card_enabled') >= 1,
    'cardMinOrganic', tyche_private.cfg('ad_card_min_organic'),
    'cardGap', tyche_private.cfg('ad_card_gap'),
    'bannerRotateMs', tyche_private.cfg('ad_banner_rotate_sec') * 1000)
$$;

-- Campaign reporting (only you can read it: Table Editor or SQL Editor).
create or replace view public.ad_report with (security_invoker = true) as
select
  c.advertiser, c.id as campaign_id, c.status,
  c.starts_at, c.ends_at,
  case when now() >= c.ends_at then 'expired' when c.status = 'paused' then 'paused'
       when now() < c.starts_at then 'scheduled' else 'running' end as state,
  greatest(0, ceil(extract(epoch from (c.ends_at - now())) / 86400))::int as days_left,
  c.impressions_purchased,
  count(*) filter (where e.kind = 'impression') as impressions,
  count(*) filter (where e.kind = 'impression' and e.format = 'card') as card_impressions,
  count(*) filter (where e.kind = 'impression' and e.format = 'banner') as banner_impressions,
  greatest(0, c.impressions_purchased - count(*) filter (where e.kind = 'impression')) as remaining,
  count(*) filter (where e.kind = 'click') as clicks,
  round(100.0 * count(*) filter (where e.kind = 'click') / nullif(count(*) filter (where e.kind = 'impression'), 0), 2) as ctr_pct,
  count(distinct e.user_id) filter (where e.kind = 'impression') as reach,
  round(100.0 * count(*) filter (where e.kind = 'impression') / nullif(tyche_private.ad_target(c), 0), 0) as pace_pct
from public.ad_campaigns c
left join public.ad_events e on e.campaign_id = c.id
group by c.id
order by c.ends_at desc;
revoke all on public.ad_report from anon, authenticated;

-- Placeholder campaigns until real advertisers buy in (safe to re-run; delete them any time).
insert into public.ad_campaigns (id, advertiser, logo, tint, url, domain, card_question, card_options, card_cta, banner_text, duration_days, impressions_purchased)
values
  ('a0000000-0000-4000-8000-000000000001', 'Conex Card', '🪪', '#8247FF', '', '',
   'Still handing out paper business cards?',
   '[{"label":"Paper","sub":"Gets lost by Monday"},{"label":"Conex","sub":"One tap, saved forever"}]', 'Make your card',
   'Your business card, on everyone’s phone in one tap', 30, 10000),
  ('a0000000-0000-4000-8000-000000000002', 'Conex Card', '🪪', '#8247FF', '', '',
   'Who has the better business card at your next event?',
   '[{"label":"Them","sub":"Paper, plain, forgettable"},{"label":"You","sub":"Digital card, your brand"}]', 'Try Conex free',
   'Share your brand with a tap. Try Conex free', 30, 10000),
  ('a0000000-0000-4000-8000-000000000003', 'Les Belle Fleur', '💐', '#E58BA7', '', '',
   'Front door this season: wreath or bare?',
   '[{"label":"Custom wreath","sub":"Made to match your home"},{"label":"Bare door","sub":"The neighbors noticed"}]', 'Shop wreaths',
   'Custom wreaths & floral decor for every season', 30, 10000)
on conflict (id) do nothing;

-- ========================================================= INVITE ONLY ===
-- When invite-only is on, the app asks for an invite password on the opening
-- screen (or lets people request an invite). Controlled from /admin → Access.
-- New email sign-ups are also checked here in the database, so the app screen
-- can't be skipped.

create table if not exists tyche_private.access_settings (
  id boolean primary key default true check (id),
  invite_only boolean not null default false,
  updated_at timestamptz,
  updated_by uuid
);
insert into tyche_private.access_settings (id) values (true) on conflict (id) do nothing;

create table if not exists tyche_private.invite_codes (
  id uuid primary key default gen_random_uuid(),
  label text not null,                       -- e.g. "Family", "Launch party"
  code_hash text not null,                   -- bcrypt; the password itself is never stored
  active boolean not null default true,
  uses int not null default 0,
  last_used_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists tyche_private.invite_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'invited', 'dismissed')),
  created_at timestamptz not null default now(),
  handled_by uuid,
  handled_at timestamptz
);
create unique index if not exists invite_requests_pending_email on tyche_private.invite_requests (lower(email)) where status = 'pending';

-- Failed password attempts / requests per network address, to stop guessing.
create table if not exists tyche_private.access_attempts (
  ip text not null,
  kind text not null,
  at timestamptz not null default now()
);
create index if not exists access_attempts_ip on tyche_private.access_attempts (ip, kind, at desc);

create or replace function tyche_private.client_ip() returns text language sql stable as $$
  select coalesce(split_part(nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for', ',', 1), 'unknown')
$$;

create or replace function tyche_private.invite_only() returns boolean language sql stable as $$
  select coalesce((select invite_only from tyche_private.access_settings where id), false)
$$;

-- Matching invite code id, or null. Passwords are case-insensitive.
create or replace function tyche_private.invite_match(code text) returns uuid language sql stable set search_path = public, extensions as $$
  select id from tyche_private.invite_codes
  where active and code is not null and char_length(trim(code)) between 4 and 64
    and code_hash = crypt(lower(trim(code)), code_hash)
  limit 1
$$;

create or replace function public.access_status() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('inviteOnly', tyche_private.invite_only())
$$;

-- Checks an invite password. count_use = false for the silent re-check when the app reopens.
create or replace function public.access_check(code text, count_use boolean default true) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_ip text := tyche_private.client_ip(); cid uuid;
begin
  if not tyche_private.invite_only() then return true; end if;
  if (select count(*) from tyche_private.access_attempts where ip = v_ip and kind = 'fail' and at > now() - interval '10 minutes') >= 8 then
    raise exception 'Too many tries. Wait a few minutes and try again.';
  end if;
  cid := tyche_private.invite_match(code);
  if cid is null then
    insert into tyche_private.access_attempts (ip, kind) values (v_ip, 'fail');
    return false;
  end if;
  if count_use then update tyche_private.invite_codes set uses = uses + 1, last_used_at = now() where id = cid; end if;
  return true;
end $$;

create or replace function public.request_invite(full_name text, email_addr text, msg text default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_ip text := tyche_private.client_ip(); e text := lower(trim(coalesce(email_addr, ''))); nm text := left(trim(coalesce(full_name, '')), 80);
begin
  if char_length(nm) < 2 then raise exception 'Add your name'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(e) > 200 then raise exception 'Enter a valid email'; end if;
  if (select count(*) from tyche_private.access_attempts a where a.ip = v_ip and a.kind = 'request' and a.at > now() - interval '1 hour') >= 5 then
    raise exception 'Too many requests. Try again later.';
  end if;
  insert into tyche_private.access_attempts (ip, kind) values (v_ip, 'request');
  update tyche_private.invite_requests r set name = nm, note = coalesce(nullif(left(trim(coalesce(msg, '')), 300), ''), r.note), created_at = now()
  where lower(r.email) = e and r.status = 'pending';
  if not found then
    insert into tyche_private.invite_requests (name, email, note) values (nm, e, nullif(left(trim(coalesce(msg, '')), 300), ''));
  end if;
end $$;

grant execute on function public.access_status() to anon, authenticated;
grant execute on function public.access_check(text, boolean) to anon, authenticated;
grant execute on function public.request_invite(text, text, text) to anon, authenticated;

-- Realtime: tell the app when something it can see changes.
do $$
begin
  begin alter publication supabase_realtime add table public.messages; exception when others then null; end;
  begin alter publication supabase_realtime add table public.challenges; exception when others then null; end;
  begin alter publication supabase_realtime add table public.entries; exception when others then null; end;
  begin alter publication supabase_realtime add table public.notifications; exception when others then null; end;
  begin alter publication supabase_realtime add table public.nights; exception when others then null; end;
  begin alter publication supabase_realtime add table public.follows; exception when others then null; end;
end $$;

-- Optional (Phase 2): run transitions every minute even when nobody has the app open.
-- Enable the pg_cron extension in Database → Extensions first, then run:
--   select cron.schedule('tyche-tick', '* * * * *', 'select tyche_private.tick()');

-- Tell the API to pick up the new functions right away.
notify pgrst, 'reload schema';
