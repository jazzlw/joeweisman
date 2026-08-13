import type { Metadata } from "next";
import SubscribeForm from "../subscribe/form";

export const metadata: Metadata = { title: "RSVP" };

/**
 * Its own page rather than a form on /service.
 *
 * /service is static and renders from Markdown; putting a Turnstile widget on it
 * would make it dynamic and add a client component to the one page most likely
 * to be read on a bad connection at the last minute. A separate route keeps the
 * details themselves plain, and the service page just points here.
 */
export default function RsvpPage() {
  return (
    <main className="page" id="main">
      <h1 className="page-title">RSVP</h1>
      <hr className="rule" />

      <div className="prose">
        <p>
          The celebration of Joe&rsquo;s life is on{" "}
          <strong>Saturday, September 19th, from 1 to 5 in the afternoon</strong>,
          at The Vue in Corvallis.
        </p>
        <p>
          Letting us know you are coming helps with the food and the chairs. It
          is not a ticket and nobody will be turned away &mdash; if you decide at
          the last minute, come anyway.
        </p>
      </div>

      <SubscribeForm siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} rsvp />

      <p className="contact-note">
        Would you rather just tell someone?{" "}
        <a href="mailto:contact@joeweisman.org">contact@joeweisman.org</a>.
      </p>
    </main>
  );
}
