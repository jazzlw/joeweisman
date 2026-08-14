import type { Metadata } from "next";
import SubscribeForm from "../subscribe/form";
import { readDoc } from "@/lib/content";

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
  const doc = readDoc("rsvp");

  return (
    <main className="page" id="main">
      <h1 className="page-title">{doc.title ?? "RSVP"}</h1>
      <hr className="rule" />

      {/* The service time is repeated here on purpose: people arrive at this
          page straight from a link and may never see /service, and turning up
          after 2 would mean missing the part they came for. Content lives in
          content/rsvp.md rather than here, so restating it doesn't require a
          code change — see content/service.md for the same information. */}
      <div className="prose" dangerouslySetInnerHTML={{ __html: doc.html }} />

      <SubscribeForm siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} rsvp />

      <p className="contact-note">
        Would you rather just tell someone?{" "}
        <a href="mailto:contact@joeweisman.org">contact@joeweisman.org</a>.
      </p>
    </main>
  );
}
