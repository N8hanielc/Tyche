import type { Metadata } from "next";
import { LEGAL } from "@/lib/legal";
import { LegalPage } from "../legal-page";

export const metadata: Metadata = { title: "Terms of Service · Tyche" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          These terms are the agreement between you and {LEGAL.company} for using {LEGAL.site} and the Tyche app. By creating an account you agree to them and to our{" "}
          <a className="text-lav" href="/privacy">Privacy Policy</a>.
        </p>
      }
      sections={[
        {
          h: "Who can use Tyche",
          body: <p>You must be 18 or older and able to agree to these terms. One account per person. Keep your login private; you’re responsible for what happens on your account.</p>,
        },
        {
          h: "Points are not money",
          body: (
            <>
              <p>
                Tyche is a social prediction game. Points are a game score only. <b>Points have no cash value</b>, can’t be bought on their own, and can’t be sold, transferred outside
                the app, or exchanged for money, prizes or anything of value. Tyche is not gambling and does not offer real-money betting.
              </p>
              <p>Don’t use Tyche to arrange or keep track of real-money bets between people. We may remove challenges or accounts that do.</p>
            </>
          ),
        },
        {
          h: "Tyche+ subscription",
          body: (
            <ul>
              <li>Tyche+ is an optional paid membership with the benefits shown on the Tyche+ screen (such as more daily points). Prices are shown before you pay.</li>
              <li><b>It renews automatically</b> each month or year at the price you agreed to, until you cancel.</li>
              <li><b>Free trial:</b> new members may get a 7-day free trial. Your card is charged when the trial ends unless you cancel before then. We remind you in the app before the trial ends.</li>
              <li>
                <b>Cancel anytime</b> in <b>Profile → Settings → Manage Tyche+ → Manage billing</b>. Cancelling takes a few taps, stops future charges, and Plus stays on until the end of the period
                you already paid for.
              </li>
              <li>Payments are handled by Stripe. Except where the law requires otherwise, payments are non-refundable, but email us if something went wrong and we’ll make it right.</li>
            </ul>
          ),
        },
        {
          h: "Your content and how you behave",
          body: (
            <>
              <p>You own what you post. You give us permission to store and show it to the people your settings allow, only to run Tyche.</p>
              <p>Don’t post or create challenges that:</p>
              <ul>
                <li>harass, threaten, bully or embarrass someone, or share private information about them;</li>
                <li>involve self-harm, dangerous stunts, violence, illegal activity, or anyone under 18;</li>
                <li>are sexual, hateful, or infringe someone else’s rights;</li>
                <li>spam, cheat, or manipulate results.</li>
              </ul>
              <p>Hosts and verifiers should settle results honestly. We may remove content, reverse results, or suspend accounts that break these rules.</p>
              <p>
                If you or someone you know is in crisis, call or text <b>988</b> (Suicide &amp; Crisis Lifeline, US) or contact local emergency services. Tyche is not a place to bet on anyone’s safety.
              </p>
            </>
          ),
        },
        {
          h: "Deleting your account",
          body: <p>You can delete your account any time in Profile → Settings → Delete account. We can also close accounts that break these terms.</p>,
        },
        {
          h: "The service",
          body: (
            <p>
              We’re constantly building Tyche, so features may change. Tyche shows sponsored content, labeled “Sponsored” or “Ad”; tapping it takes you to the advertiser, who is
              responsible for their own products and offers. Tyche is provided “as is,” without warranties of any kind. To the fullest extent the law allows, we aren’t liable for
              indirect or consequential damages, and our total liability is limited to what you paid us in the 12 months before the claim.
            </p>
          ),
        },
        {
          h: "Disputes and governing law",
          body: <p>These terms are governed by the laws of {LEGAL.governingLaw}. Please email us first. Most problems get sorted out quickly that way.</p>,
        },
        {
          h: "Changes",
          body: <p>If we change these terms in a meaningful way, we’ll tell you in the app before the change takes effect. Continuing to use Tyche after that means you accept the new terms.</p>,
        },
      ]}
    />
  );
}
