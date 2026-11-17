import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Privacy Policy · Tyche" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          This policy explains what {LEGAL.company} (“we”) collects when you use {LEGAL.site} and the Tyche app, why, who we share it with, and how to delete it. Short version: we
          collect what the app needs to work, we don’t sell your data, we don’t run ads, and you can delete your account and everything you uploaded from inside the app.
        </p>
      }
      sections={[
        {
          h: "What we collect",
          body: (
            <ul>
              <li><b>Account details:</b> your email address, name, username and password (stored hashed by our sign-in provider; we never see it). If you sign in with Google or Apple, we receive your name, email and profile photo from them.</li>
              <li><b>Profile:</b> your photo and bio, if you add them.</li>
              <li><b>What you create and do in Tyche:</b> challenges, props, sides you take, points, results, votes, disputes, follows, groups, Game Nights (including guest names a host types in), chat messages, and photos you upload as challenge images, chat images or result evidence.</li>
              <li><b>Payments:</b> if you subscribe to Tyche+, Stripe collects your card details. We never see or store your card number. We keep your Stripe customer ID and subscription status (plan, trial, renewal date).</li>
              <li><b>Technical data:</b> your approximate region (state/country, from your IP address) to check where Tyche+ is available, plus standard server logs (IP address, browser type, time of request) kept by our hosting provider for security and debugging. We store your time zone to reset daily points.</li>
            </ul>
          ),
        },
        {
          h: "How we use it",
          body: (
            <ul>
              <li>To run the app: show your profile, challenges and Rooms to the people allowed to see them, keep score, settle results and send in-app notifications.</li>
              <li>To run Tyche+ billing, including trial and renewal reminders.</li>
              <li>To keep Tyche safe: prevent abuse, enforce our Terms, and fix bugs.</li>
            </ul>
          ),
        },
        {
          h: "What we don’t do",
          body: (
            <ul>
              <li>We don’t sell or rent your personal information, and we don’t share it for advertising.</li>
              <li>We don’t show ads or use advertising trackers.</li>
              <li><b>We don’t use AI</b> to analyze, profile or make decisions about you. No artificial intelligence features process your data in the app. If that ever changes, we’ll update this policy and tell you in the app first.</li>
            </ul>
          ),
        },
        {
          h: "Who we share it with",
          body: (
            <>
              <p>Only these service providers, and only so the app can work. Each processes data on our behalf under its own privacy and security terms:</p>
              <ul>
                <li><b>Supabase</b>: database, sign-in and photo storage.</li>
                <li><b>Vercel</b>: website hosting and server logs.</li>
                <li><b>Stripe</b>: Tyche+ payments and billing.</li>
                <li><b>Google</b> and <b>Apple</b>: only if you choose to sign in with them. Google Fonts also serves the app’s fonts, which shares your IP address with Google.</li>
              </ul>
              <p>We may also disclose information if the law requires it, or to protect someone’s safety.</p>
            </>
          ),
        },
        {
          h: "Who can see what",
          body: (
            <ul>
              <li>Your name, username, photo, bio, record and follower counts are visible to other Tyche users.</li>
              <li>Challenges are visible according to the setting you pick: public, anyone with the link, friends, a group, or a Game Night’s members.</li>
              <li>Uploaded photos are stored at long, random web addresses that can’t be guessed, but anyone who has a photo’s exact link can open it. Don’t upload anything you wouldn’t want shared.</li>
            </ul>
          ),
        },
        {
          h: "Keeping and deleting your data",
          body: (
            <>
              <p>
                We keep your data while your account is open. You can delete your account any time in <b>Profile → Settings → Delete account</b>. That permanently deletes your
                profile, your challenges and Game Nights, your entries, messages and notifications, and every photo you uploaded. It also cancels any Tyche+ subscription. Points
                others staked on your open challenges are refunded to them.
              </p>
              <p>Stripe keeps payment records for as long as tax and financial laws require. Hosting logs are deleted on our provider’s normal schedule.</p>
            </>
          ),
        },
        {
          h: "Your rights",
          body: (
            <p>
              You can see and edit your profile in the app, and delete your account there. To ask for a copy of your data, a correction, or anything else, email{" "}
              <a className="text-lav" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>. Depending on where you live (for example California, Colorado, Virginia or the EU/UK), you
              may have additional rights to access, correct, delete or move your data, and to complain to a regulator. We’ll answer within 30 days and won’t treat you differently for asking.
            </p>
          ),
        },
        {
          h: "Age requirement",
          body: <p>Tyche is for people 18 and older. We don’t knowingly collect information from anyone under 18. If you believe a minor has an account, email us and we’ll delete it.</p>,
        },
        {
          h: "Security",
          body: <p>Data is encrypted in transit, access is limited by per-user database rules, and payment details stay with Stripe. No system is perfectly secure, so use a strong, unique password.</p>,
        },
        {
          h: "Changes",
          body: <p>If we change this policy in a meaningful way, we’ll tell you in the app before the change takes effect and update the date at the top.</p>,
        },
      ]}
    />
  );
}
