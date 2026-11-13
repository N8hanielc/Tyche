# Tyche

**If you can disagree about it, you can put it on Tyche.**

A mobile-first social challenge app: create a bet about anything, pick a side, send it to the group chat, argue in the Room, settle it, run it back.

## Run it

```bash
npm install
npm run dev
# open http://localhost:3000 (best in a phone-sized window or on your phone)
```

Stack: Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · lucide-react.

## What works

- **Sign up / sign in** – welcome screen, 3-step sign up (email + password with strength meter and 18+ terms, profile with photo, name and live username availability, follow friends), sign in with field errors, forgot password, Apple/Google placeholders, one-tap demo account (`nate@tyche.app` / `tyche1234`), sessions that persist across refresh, and sign out from Profile → Settings. Each account gets its own profile, follows, notifications and 1,000 starting points. Group and friends-only challenges are only visible to people who should see them.

- **Daily points + Tyche+** – a daily claim on Home (10 pts free, 100 pts with Tyche+, with a streak counter). The Tyche+ upgrade screen has a free vs. Plus comparison, Monthly ($4.99) / Yearly ($39.99) / Crew ($9.99) plans, a 7-day trial, and manage/cancel/resume. Every points challenge has a 50-pt minimum stake (`MIN_STAKE`), so a free user who runs low waits a couple of days of refills or upgrades. Bragging-rights challenges stay free to join. Free limits (5 open challenges, 2 owned groups) trigger upgrade prompts. Plus perks: Gold/Neon/Midnight share-card themes, head-to-head records on friends’ profiles, and a Plus badge and avatar ring. Billing is simulated; all rules live in `src/lib/plus.ts`.
- **Home feed** – category pills, For You / Friends / Live filters, challenge cards for all four formats with live pool bars, likes, comments, share, Take OVER / Take UNDER.
- **Create (7 steps)** – question (auto-detects format from wording), format (Over/Under with time or count lines, Yes/No, Pick One with friend quick-add, Exact Number), position, stakes (even pool / custom odds / bragging rights with payout breakdown), audience + invites, rules & verification, publish → share card.
- **Join** – bottom sheet with stake slider, presets, estimated multiplier and returns. Changing position is supported.
- **Challenge Room** – overview, live chat (reactions, replies, image sharing, timestamps), system activity rows, positions tab. Friends reply and join in simulated real time.
- **Live states** – road-trip timer with progress vs. line and location updates, live counter for count-based lines (plates, threes), elapsed clock for everything else. A “⏩ 1h” demo control lets you simulate time.
- **Automatic lifecycle** – challenges with an “Event begins” time start themselves (joining locks, everyone’s notified). Joining also locks with a system message when the close time passes. Creators have 24h after the start to submit a result; after that it opens to a 12h participant vote (majority wins once 3 votes are in, the leading option wins at close, no votes means everyone is refunded). Two disputes freeze a submitted result and send it to the same vote. Creators can resubmit with evidence at any point before settlement. Demo “⏩ Skip” / “⏩ End vote” controls fast-forward the clocks. Timing constants are at the top of the lifecycle section in `src/lib/store.tsx`; in production, `tick()` should run as a scheduled server job (e.g. Supabase cron) rather than in the browser.
- **Self-bet block + end-of-night votes** – options that name a person (via friend quick-add, or a typed name that matches you or someone you follow) are linked to that user, who can’t bet on or vote for that option (enforced in the UI and in `store.tsx`). “Everyone votes” challenges end with a hidden ballot: the creator taps “End the night — open voting” (or it opens at a set time), every participant votes, results stay hidden until everyone has voted or 3h pass, most votes wins, and a tie triggers a 30-min runoff (if the tie rule is “Run it back”) or refunds.
- **Results** – submit with optional photo evidence → group confirmation / vote / dispute → payouts, updated records, recap with final positions and “Run it back”.
- **Discover** – search (people, titles, categories, keywords), live, trending, most participants, leaderboard, creators to follow.
- **Rooms** – Active / Friends’ / Completed / private Groups (create groups, launch challenges inside them).
- **Profile** – stats, win %, points, badges, favorite categories, activity, created/joined history. Follow/unfollow other users.
- **Notifications** – unread badges, today/earlier, deep links into Rooms.

Everything persists to `localStorage`. Use the ↺ button on your Profile to reset the sample data.

## Brand assets

- `public/logo-mark.png`: the T mark, used in the header, splash, welcome screen and share cards (`LogoMark` / `Logo` in `src/components/ui`).
- `app/icon.png` and `app/apple-icon.png`: browser and home-screen icons (Next.js picks these up automatically).

## Structure

```
app/                    Next.js entry (layout, page, globals.css with the Tyche theme)
src/TycheApp.tsx        Providers + screen stack + sheets
src/lib/types.ts        Domain model (maps to future DB tables)
src/lib/seed.ts         Sample users, challenges, messages, notifications
src/lib/repository.ts   Persistence boundary (localStorage today)
src/lib/plus.ts         Tyche+ plans, limits, daily refills, card themes
src/lib/auth.tsx        Auth service + session provider (local today)
src/lib/store.tsx       State + all actions (join, create, chat, live, settle…)
src/lib/nav.tsx         In-app navigation stack, sheets, toasts
src/lib/utils.ts        Pools, payouts, formatting, derived stats
src/components/         UI primitives, challenge card, outcomes, join/share sheets, nav
src/screens/            Home, Discover, Create, Room, Rooms, Profile, Notifications, Leaderboard
preview/                Offline bundle script used to build the single-file preview
```

## Supabase (live mode)

The app connects to Supabase automatically (project URL + publishable key in `src/lib/supabase.ts`; override with `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`, or set `NEXT_PUBLIC_TYCHE_LOCAL=1` for the offline demo). The single-file preview always runs the offline demo.

One-time setup:
1. **SQL Editor → New query →** paste `supabase/schema.sql` → **Run**. It creates tables, row-level security, realtime, and all game logic as server functions. Safe to re-run.
2. **Authentication → Sign In / Providers → Email:** turn **off “Confirm email”** for the beta (otherwise new users must click an email link before signing in).
3. **Authentication → URL Configuration:** set **Site URL** to your Vercel URL and add it under Redirect URLs (needed for password-reset links).
4. Optional: **Database → Extensions → pg_cron**, then run `select cron.schedule('tyche-tick', '* * * * *', 'select tyche_private.tick()');` so bets start and votes close even when nobody has the app open. Without it, transitions happen whenever someone loads the app.

How it works: clients can only *read* tables (RLS); every write goes through an RPC (`create_challenge`, `join_challenge`, `cast_vote`, …) that enforces the rules: 50-pt minimum, no self-bets or self-votes, payouts, deadlines, dispute freezes, free-tier limits. `get_state()` returns everything the signed-in user can see in the shape the app’s store uses; Realtime changes trigger a reload. `subscribe_plus` is a **beta stand-in** (no billing). Replace it with a RevenueCat/Stripe webhook before charging money.

## Adding Supabase later (original notes)

- **Auth:** implement `AuthService` in `src/lib/auth.tsx` with `supabase.auth` (signUp, signInWithPassword, signInWithOAuth for Apple/Google, resetPasswordForEmail, onAuthStateChange) and pass it to `<AuthProvider service={...}>`. The prototype's local accounts use salted SHA-256 hashes in localStorage. That's fine for a demo and not secure for production.

- Implement `TycheRepository` in `src/lib/repository.ts` against Supabase tables (`users`, `challenges`, `entries`, `messages`, `notifications`, `groups`).
- Replace the simulated `later(...)` events in `store.tsx` with a Realtime channel per challenge (`room:<id>`) for messages and entries.
- Supabase Auth supplies `meId`. Settlement (`settle`) should move to a database function so payouts are server-authoritative.
- Each in-app `Screen` maps to a route (`/c/[id]`, `/u/[id]`, `/g/[id]`, `/create`, `/notifications`) when you want shareable URLs.

**Before launching paid refills:** Tyche+ gives subscribers larger daily point refills, so part of what they pay for is points. That's the "social casino" model. It's generally legal while points have no cash value and can't be redeemed, transferred or sold. But *Kater v. Churchill Downs* (9th Cir. 2018) treated purchased virtual currency as a "thing of value" under Washington law. Get a gaming attorney's review. Likely mitigations: never allow cash-out, redemption or point transfers between accounts; consider geoblocking paid refills in Washington; keep subscription perks mostly non-point. Note that the 50-pt minimum combined with 10/day free refills creates a "wait or pay to keep playing" loop, the same pattern at issue in *Kater*, so raise it with counsel specifically. In production, wire billing through RevenueCat (App Store / Play) and check entitlements server-side.

Points only. There is no real-money handling. Real-money wagering would need licensing, KYC, and geofencing before anything is built on top of this.
