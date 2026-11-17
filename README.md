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

## Game Night

A private room for a night of family games. Start one from **Rooms → Game Nights → New** (or the banner on Home).

- **Host** creates the room, invites friends who have Tyche, adds guests without the app (Dad, Grandma), and optionally splits everyone into two teams (Mom’s vs Dad’s, Parents vs Kids…).
- **Games**: Spades, Uno and Monopoly templates come with ready-made props, or the host makes a custom game (name + what you score). Each game shows the round, score, active props, who backed which side, what’s winning now, and what’s settled.
- **Scores → auto-settle**: after each round the host enters bids/books (Spades), cards drawn and who went out (Uno), or events and property counts (Monopoly). *Final* settles that round’s props and re-opens the repeating ones for the next round. Over/unders on a player (e.g. Dad over 4.5 books) settle the same way.
- **Props**: anyone can suggest a prop; the host approves, edits, settles by hand, fixes a wrong result (payouts are reversed and redone), or removes it (refunds). Players can dispute; the host gets notified.
- **Wild Props**: side bets about the table (“Will Dad complain about the rules?”), a flat 20 pts each. Nobody can bet on a Wild Prop about themselves. They count toward the Wild Card award, not the championship.
- **Board**: champion race (points won ÷ 10 + 5 per correct pick + 5 × best streak), team totals (members’ scores + 20 per game won), awards (most accurate, hot hand, big earner, prop master, Wild Card) and game records. Ending the night settles “Which team wins the night?” and crowns the champion.
- Self-betting rules carry over: you can back yourself to win, but not to lose (e.g. no UNDER on your own books).

Live mode: Game Night uses the `nights` / `night_members` tables and the `night_*` functions in `supabase/schema.sql`. Re-run that file after updating.

## Admin panel (`/admin`)

A private control panel at **jointyche.app/admin**, built into this app (same Supabase project, same logins). Desktop and tablet.

- **Overview**: users, daily/monthly active, points in circulation, admin-issued points, verified accounts, advertisers, live campaigns, impressions, clicks, underdelivery, with charts.
- **Users**: search by name, @username, email or ID; filter by verified, unverified, suspended, restricted, flagged or admins. Each profile shows its balance, points earned and spent, record, recent games, full points history and admin history. Actions: verify / remove verification, adjust points, restrict from games, flag for review, suspend / reactivate.
- **Points**: issue or deduct points with a reason and a review step. Every change to any balance (stakes, payouts, refunds, daily refills, Tyche+ top-ups, admin adjustments) is written to a permanent ledger.
- **Advertisers / Campaigns**: create and edit advertisers and campaigns; pause, reactivate or suspend advertisers; pause, resume or cancel campaigns; edit dates; set priority (Normal / High / Urgent). The ad preview uses the app's own ad components.
- **Performance**: pacing for every campaign (expected vs delivered, daily average, needed per day, estimated completion), with On track / Slightly behind / Underdelivering / Completed / Paused / Expired, filters, and a one-click priority boost.
- **Ad settings**: banner, sponsored-card and combined frequency limits, saved to the database. They take effect without a redeploy, and you're warned before changes that significantly increase ad frequency.
- **Activity log**: every sensitive action with admin, target, previous and new value, reason and time. It's append-only: entries can't be edited or deleted, even from the SQL editor.
- **Team**: grant or remove Admin / Super admin access.

**Roles.** *Admin*: everything above except ad settings and team changes; point adjustments up to 10,000 per action. *Super admin*: also ad settings, admin access, campaign purchase terms, and adjustments up to 1,000,000. Admins can't change their own account, and only super admins can act on another admin's account.

**Security.** All checks run in the database: every `admin_*` function verifies the caller's role before it does anything, and writes the log entry in the same transaction. No service-role key is involved. Roles, the log, the ledger and account status live in the private `tyche_private` schema, which the API can't reach. `/admin` is also served with `noindex`, no-framing and no-store headers (`middleware.ts`).

**Setup (once):**
1. Supabase → SQL Editor: run `supabase/schema.sql`, then `supabase/billing.sql` (if you use billing), then `supabase/admin.sql`. All three are safe to re-run; re-run `admin.sql` whenever you re-run `schema.sql`.
2. Make yourself super admin (SQL Editor):
   ```sql
   insert into tyche_private.admin_roles (user_id, role)
   select id, 'super_admin' from public.profiles where username = 'n8haniel'
   on conflict (user_id) do update set role = 'super_admin';
   ```
3. For Google sign-in on the panel, add `https://jointyche.app/admin` under Supabase → Authentication → URL Configuration → Redirect URLs.

**What changes in the app.**
- Suspended users see a "your account is suspended" screen and can't take any action.
- Restricted users can browse and chat, but can't create, join, vote on or settle games or Game Nights.
- Daily/monthly active users are recorded when someone opens the app. Past activity was rebuilt from existing data on the first run.
- The points ledger starts when `schema.sql` is first re-run. Each existing account gets an opening-balance entry so the ledger totals match balances.

**Not built yet:** in-app reporting of users (flags are set by admins only), and an image slot in ads (ads use a logo, headline, two options and a button).

## Verified accounts

The purple check next to a name means the account is verified. Set it in **/admin → Users** (recorded in the activity log), or by hand:

- **Supabase → Table Editor → profiles → `verified` column**: tick or untick it on a row.
- Or SQL: `update profiles set verified = true where username = 'their.username';`

App users can't change it themselves. Changing a username removes the badge until you verify the new one.

## Ads (sponsored cards + Discover banner)

Campaigns live in **Supabase → Table Editor → `ad_campaigns`**. Add a row per campaign:

| Column | What to put |
|---|---|
| `advertiser` | Company name. Frequency caps are per company, so use the same spelling for all of a company's campaigns. |
| `logo` | An emoji, or an image URL (square works best). |
| `url` / `domain` | Where a tap goes, and the short domain shown on the card. |
| `card_question`, `card_options`, `card_cta` | The sponsored card: a question, exactly two options `[{"label":"…","sub":"…"},{"label":"…","sub":"…"}]`, and the button text. Leave `card_question` empty for banner-only. |
| `banner_text` | One line for the Discover banner. Leave empty for card-only. |
| `duration_days` | 7, 14 or 30. `ends_at` fills itself in. |
| `impressions_purchased` | 1000, 3000, 5000 or 10000 (shared by card + banner). |
| `starts_at` / `status` | When it begins; set `status` to `paused` to stop it. |

**Reporting:** `select * from ad_report;` shows impressions (card / banner), clicks, CTR, reach, remaining, days left, pace %, and whether it's running/expired.

**How delivery works**
- Pacing: each campaign is spread evenly over its run. It's skipped whenever it's ahead of schedule, and campaigns furthest behind get picked most often.
- Feed cards: first one after a user has viewed 4 organic posts, then at least 6 posts between ads, max 6 sponsored cards per user per day.
- Caps per user: same company banner 4/day · same company card 2 per 24h · same company across both 5/day · same card 2 per 24h.
- An impression only counts once the ad is at least half on screen for 1 second. Clicks count once per hour per person.
- Banner rotates every 20 seconds, preferring a different campaign each time.
- The defaults live in `tyche_private.cfg_default` (`ad_…` keys) in `schema.sql`. Change them in **/admin → Ad settings**, where they're saved to `tyche_private.settings` and apply without a redeploy.
- Advertisers can be paused or suspended (none of their ads show), campaigns can be canceled, and campaign **priority** (Normal 1× / High 2× / Urgent 4×) weights which eligible campaign wins a placement. Priority never overrides dates, remaining impressions, even pacing or frequency caps.

## Supabase (live mode)

The app connects to Supabase automatically (project URL + publishable key in `src/lib/supabase.ts`; override with `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`, or set `NEXT_PUBLIC_TYCHE_LOCAL=1` for the offline demo). The single-file preview always runs the offline demo.

One-time setup:
1. **SQL Editor → New query →** paste `supabase/schema.sql` → **Run**. It creates tables, row-level security, realtime, and all game logic as server functions. Safe to re-run.
2. **Authentication → Sign In / Providers → Email:** turn **off “Confirm email”** for the beta (otherwise new users must click an email link before signing in).
3. **Authentication → URL Configuration:** set **Site URL** to your Vercel URL and add it under Redirect URLs (needed for password-reset links).
4. Optional: **Database → Extensions → pg_cron**, then run `select cron.schedule('tyche-tick', '* * * * *', 'select tyche_private.tick()');` so bets start and votes close even when nobody has the app open. Without it, transitions happen whenever someone loads the app.

5. **Photos (Phase 2):** run `supabase/storage.sql` in the SQL Editor. It creates a public `media` bucket where each user can only upload into their own folder. Profile photos, challenge photos, chat images and result evidence then upload to Storage and only the URL is saved. If the bucket is missing, the app falls back to storing images inline.

How it works: clients can only *read* tables (RLS); every write goes through an RPC (`create_challenge`, `join_challenge`, `cast_vote`, …) that enforces the rules: 50-pt minimum, no self-bets or self-votes, payouts, deadlines, dispute freezes, free-tier limits. `get_state()` returns everything the signed-in user can see in the shape the app’s store uses; Realtime changes trigger a reload. Tyche+ billing is real once `supabase/billing.sql` is run and Stripe is configured (below); the old self-serve `subscribe_plus` is then locked.

## Google & Apple sign-in

Buttons call `supabase.auth.signInWithOAuth` and only work for providers switched on in Supabase (the app checks `/auth/v1/settings`). New Google/Apple accounts get a profile from the provider (name, photo, generated username) and see a one-time onboarding screen to confirm their username and follow people (`complete_onboarding`).

- **Google:** Google Cloud Console → OAuth client (Web) with redirect URI `https://xezjxqwatubyzxqwnibp.supabase.co/auth/v1/callback` → paste Client ID + Secret into Supabase → Authentication → Providers → Google.
- **Apple:** needs an Apple Developer account. Create a Services ID + Sign in with Apple key, then enter them in Supabase → Providers → Apple (the generated secret expires every 6 months).
- Supabase → Authentication → URL Configuration must list your site URL under Redirect URLs.

## Billing (Stripe)

- `POST /api/billing/checkout` → Stripe Checkout (subscription; 7-day trial once per user; blocked in `BILLING_BLOCKED_REGIONS`, default `US-WA`).
- `POST /api/billing/portal` → Stripe customer portal (change plan, card, cancel).
- `POST /api/billing/webhook` → verifies the Stripe signature, then calls `apply_billing` with the service-role key to turn Plus on/off. Subscribe it to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `invoice.paid`, `invoice.payment_failed`.
- Vercel env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`, `SUPABASE_SERVICE_ROLE_KEY` (optional `BILLING_BLOCKED_REGIONS`, `STRIPE_PRICE_CREW`). Start with Stripe **test mode** keys.
- Crew plan is hidden in live mode until group billing is built. A native iOS app will need Apple in-app purchase for subscriptions (e.g. via RevenueCat) alongside Stripe on the web.

## Adding Supabase later (original notes)

- **Auth:** implement `AuthService` in `src/lib/auth.tsx` with `supabase.auth` (signUp, signInWithPassword, signInWithOAuth for Apple/Google, resetPasswordForEmail, onAuthStateChange) and pass it to `<AuthProvider service={...}>`. The prototype's local accounts use salted SHA-256 hashes in localStorage. That's fine for a demo and not secure for production.

- Implement `TycheRepository` in `src/lib/repository.ts` against Supabase tables (`users`, `challenges`, `entries`, `messages`, `notifications`, `groups`).
- Replace the simulated `later(...)` events in `store.tsx` with a Realtime channel per challenge (`room:<id>`) for messages and entries.
- Supabase Auth supplies `meId`. Settlement (`settle`) should move to a database function so payouts are server-authoritative.
- Each in-app `Screen` maps to a route (`/c/[id]`, `/u/[id]`, `/g/[id]`, `/create`, `/notifications`) when you want shareable URLs.

**Before launching paid refills:** Tyche+ gives subscribers larger daily point refills, so part of what they pay for is points. That's the "social casino" model. It's generally legal while points have no cash value and can't be redeemed, transferred or sold. But *Kater v. Churchill Downs* (9th Cir. 2018) treated purchased virtual currency as a "thing of value" under Washington law. Get a gaming attorney's review. Likely mitigations: never allow cash-out, redemption or point transfers between accounts; consider geoblocking paid refills in Washington; keep subscription perks mostly non-point. Note that the 50-pt minimum combined with 10/day free refills creates a "wait or pay to keep playing" loop, the same pattern at issue in *Kater*, so raise it with counsel specifically. In production, wire billing through RevenueCat (App Store / Play) and check entitlements server-side.

Points only. There is no real-money handling. Real-money wagering would need licensing, KYC, and geofencing before anything is built on top of this.
