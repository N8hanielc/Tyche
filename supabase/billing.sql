-- ============================================================================
-- Tyche — real billing (Stripe)
-- Run in Supabase → SQL Editor after schema.sql. Safe to re-run.
-- Re-run this file any time you re-run schema.sql.
--
-- Tyche+ is now turned on/off ONLY by the Stripe webhook (server, service-role
-- key). Users can no longer grant themselves Plus from the app.
-- ============================================================================

create table if not exists public.billing_customers (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text,
  updated_at timestamptz not null default now()
);
alter table public.billing_customers enable row level security;
-- no policies: only the service role (server) can read or write it
revoke all on public.billing_customers from anon, authenticated;

-- Called by the webhook with the service-role key. SECURITY INVOKER on purpose:
-- app users have no UPDATE rights on profiles, so even if they could call it,
-- it would fail.
create or replace function public.apply_billing(uid uuid, plus_state jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare
  was_plus boolean := tyche_private.is_plus(uid);
  now_plus boolean := plus_state is not null and (plus_state ->> 'renewsAt')::bigint > tyche_private.ms(now());
begin
  update profiles set
    plus = plus_state,
    trial_used = trial_used or plus_state is not null,
    -- upgrading after today's free claim tops today up to the Plus amount
    points = points + case when not was_plus and now_plus and last_claim_at >= date_trunc('day', now())
                           then (tyche_private.cfg('daily_plus') - tyche_private.cfg('daily_free'))::int else 0 end
  where id = uid;
  if not was_plus and now_plus then
    perform tyche_private.notify(uid, 'invite', format('Welcome to Tyche+ ✦ %sYou now get %s points every day.',
      case when plus_state ? 'trialEndsAt' then tyche_private.cfg('trial_days') || '-day free trial is on. ' else '' end,
      tyche_private.cfg('daily_plus')));
  elsif was_plus and not now_plus then
    perform tyche_private.notify(uid, 'invite', 'Your Tyche+ membership has ended. Daily points are back to ' || tyche_private.cfg('daily_free') || '.');
  end if;
end $$;

revoke execute on function public.apply_billing(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_billing(uuid, jsonb) to service_role;
-- apply_billing runs as the caller (service role), so it needs Tyche's internal helpers
grant usage on schema tyche_private to service_role;
grant execute on all functions in schema tyche_private to service_role;

-- The beta self-serve subscription functions are disabled for app users.
revoke execute on function public.subscribe_plus(text) from public, anon, authenticated;
revoke execute on function public.set_plus_canceled(boolean) from public, anon, authenticated;

-- Anyone who self-granted Plus during the beta loses it (paid members come back via the webhook).
update public.profiles p set plus = null
where p.plus is not null and not exists (select 1 from public.billing_customers b where b.user_id = p.id and b.stripe_subscription_id is not null);
