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

create or replace function tyche_private.cfg(k text) returns numeric language sql immutable as $$
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
  end
$$;

-- --------------------------------------------------------------- helpers ----

create or replace function tyche_private.ms(t timestamptz) returns bigint language sql immutable as $$
  select (extract(epoch from t) * 1000)::bigint
$$;

create or replace function tyche_private.me() returns uuid language plpgsql stable as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  return uid;
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
$$;

create or replace function tyche_private.sys(cid uuid, icon text, body text) returns void language sql as $$
  insert into public.messages (challenge_id, kind, icon, text) values (cid, 'system', icon, body)
$$;

create or replace function tyche_private.notify(to_user uuid, kind text, body text, cid uuid default null, actor uuid default null) returns void language sql as $$
  insert into public.notifications (to_user, kind, text, challenge_id, actor_id) values (to_user, kind, body, cid, actor)
$$;

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

create or replace function tyche_private.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare
  uname text := lower(coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), 'player' || substr(replace(new.id::text, '-', ''), 1, 8)));
begin
  insert into public.profiles (id, username, name)
  values (new.id, uname, coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), 'New player'));
  insert into public.notifications (to_user, kind, text)
  values (new.id, 'invite', format('Welcome to Tyche, %s 👋 You start with 1,000 points. Find a challenge to join or put your first one on Tyche.',
    split_part(coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), 'friend'), ' ', 1)));
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function tyche_private.handle_new_user();

-- ================================================================ RPCs ======
-- Everything below is callable from the app with supabase.rpc(...)

-- Whole visible graph in the exact shape the app's store uses.
create or replace function public.get_state() returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := tyche_private.me();
begin
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
        'trialUsed', p.trial_used, 'cardTheme', p.card_theme)))
      from profiles p), '{}'),
    'following', coalesce((select jsonb_agg(followee) from follows where follower = uid), '[]'),
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
    'lastRead', coalesce((select jsonb_object_agg(challenge_id, tyche_private.ms(at)) from room_reads where user_id = uid), '{}')
  );
end $$;

create or replace function public.username_available(u text) returns boolean language sql stable security definer set search_path = public as $$
  select lower(u) ~ '^[a-z0-9._]{3,20}$' and not exists (select 1 from profiles where username = lower(u))
$$;

create or replace function public.suggested_profiles() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]') from (
    select jsonb_strip_nulls(jsonb_build_object('id', p.id, 'username', p.username, 'name', p.name, 'avatar', p.avatar, 'hue', p.hue,
      'followers', (select count(*) from follows f where f.followee = p.id), 'following', 0, 'baseWins', 0, 'baseLosses', 0, 'points', 0)) x
    from profiles p order by (select count(*) from follows f where f.followee = p.id) desc, p.created_at desc limit 12) s
$$;

create or replace function public.update_profile(p jsonb) returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := tyche_private.me(); f text;
begin
  update profiles set
    name = coalesce(nullif(p ->> 'name', ''), name),
    bio = case when p ? 'bio' then nullif(p ->> 'bio', '') else bio end,
    avatar = case when p ? 'avatar' then nullif(p ->> 'avatar', '') else avatar end
  where id = uid;
  for f in select jsonb_array_elements_text(coalesce(p -> 'follows', '[]')) loop
    insert into follows (follower, followee) values (uid, f::uuid) on conflict do nothing;
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
begin
  if not tyche_private.is_plus(uid)
     and (select count(*) from challenges where creator_id = uid and status <> 'settled') >= tyche_private.cfg('open_limit') then
    raise exception 'Free accounts can host % open challenges at a time', tyche_private.cfg('open_limit');
  end if;
  if jsonb_array_length(coalesce(p -> 'options', '[]')) < 2 then raise exception 'Add at least two options'; end if;
  if p ->> 'visibility' = 'group' and not exists (select 1 from group_members where group_id = (p ->> 'groupId')::uuid and user_id = uid) then
    raise exception 'You are not in that group';
  end if;

  insert into challenges (id, creator_id, category, question, title, description, media, format, line, unit, options, stake_mode, odds,
    forfeit, visibility, group_id, closes_at, starts_at, vote_at, resolution, tie_rule, verifier)
  values (cid, uid, coalesce(p ->> 'category', 'Custom'), trim(p ->> 'question'), nullif(trim(p ->> 'title'), ''), nullif(trim(p ->> 'description'), ''),
    nullif(p ->> 'media', ''), p ->> 'format', (p ->> 'line')::numeric, nullif(p ->> 'unit', ''), p -> 'options',
    coalesce(p ->> 'stakeMode', 'even'), case when p ->> 'stakeMode' = 'odds' then p -> 'odds' end, nullif(trim(p ->> 'forfeit'), ''),
    coalesce(p ->> 'visibility', 'friends'), case when p ->> 'visibility' = 'group' then (p ->> 'groupId')::uuid end,
    to_timestamp((p ->> 'closesAt')::bigint / 1000.0),
    case when p ? 'startsAt' and p ->> 'startsAt' is not null then to_timestamp((p ->> 'startsAt')::bigint / 1000.0) end,
    case when p ? 'voteAt' and p ->> 'voteAt' is not null then to_timestamp((p ->> 'voteAt')::bigint / 1000.0) end,
    coalesce(p ->> 'resolution', ''), coalesce(p ->> 'tieRule', 'refund'), coalesce(p ->> 'verifier', 'group'))
  returning * into c;

  perform tyche_private.sys(cid, '✨', format('%s created the challenge%s', tyche_private.first_name(uid),
    case when c.line is not null then ' · Line set at ' || c.line::text || coalesce(' ' || nullif(c.unit, 'time'), '') else '' end));

  if my_opt is not null then
    if not tyche_private.has_option(c, my_opt) then raise exception 'Unknown option'; end if;
    if tyche_private.is_self(c, my_opt, uid) then raise exception 'You can’t bet on yourself'; end if;
    if c.stake_mode = 'bragging' then stake := 0;
    else
      select points into bal from profiles where id = uid for update;
      if stake < tyche_private.cfg('min_stake') then raise exception 'Minimum stake is % pts', tyche_private.cfg('min_stake'); end if;
      if stake > bal then raise exception 'Not enough points'; end if;
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
  if not tyche_private.can_see(c, uid) then raise exception 'Challenge not found'; end if;
  if c.status <> 'open' or c.closes_at <= now() then raise exception 'Joining is closed'; end if;
  if not tyche_private.has_option(c, oid) then raise exception 'Unknown option'; end if;
  if tyche_private.is_self(c, oid, uid) then raise exception 'You can’t bet on yourself'; end if;
  select * into prev from entries where challenge_id = cid and user_id = uid;
  select points into bal from profiles where id = uid for update;
  bal := bal + coalesce(prev.points, 0);
  if c.stake_mode = 'bragging' then stake := 0;
  else
    if stake < tyche_private.cfg('min_stake') then raise exception 'Minimum stake is % pts', tyche_private.cfg('min_stake'); end if;
    if stake > bal then raise exception 'Not enough points'; end if;
  end if;
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
    insert into follows (follower, followee) values (uid, target);
    perform tyche_private.notify(target, 'follow', 'started following you', null, uid);
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

-- Realtime: tell the app when something it can see changes.
do $$
begin
  begin alter publication supabase_realtime add table public.messages; exception when others then null; end;
  begin alter publication supabase_realtime add table public.challenges; exception when others then null; end;
  begin alter publication supabase_realtime add table public.entries; exception when others then null; end;
  begin alter publication supabase_realtime add table public.notifications; exception when others then null; end;
end $$;

-- Optional (Phase 2): run transitions every minute even when nobody has the app open.
-- Enable the pg_cron extension in Database → Extensions first, then run:
--   select cron.schedule('tyche-tick', '* * * * *', 'select tyche_private.tick()');
