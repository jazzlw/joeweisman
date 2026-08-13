import type { Metadata } from "next";
import SubscribeForm from "./form";

export const metadata: Metadata = { title: "Stay in touch" };

export default function SubscribePage() {
  return (
    <main className="page" id="main">
      <h1 className="page-title">Stay in touch</h1>
      <hr className="rule" />
      <div className="prose">
        <p>
          Leave your address and we will write when there is more news about the
          memorial.
        </p>
        <p>
          The date and place are already settled &mdash; they are on{" "}
          <a href="/service">the service page</a>. If you are coming, it helps
          to <a href="/rsvp">let us know</a>; that adds you to this list too, so
          there is no need to do both.
        </p>
        <p>
          Rest assured, you are signing up for only a handful of messages. You
          can reply to any of them to ask to be taken off the list.
        </p>
      </div>

      <SubscribeForm siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />

      <p className="contact-note">
        Would you rather just write to someone?{" "}
        <a href="mailto:contact@joeweisman.org">contact@joeweisman.org</a>.
      </p>
    </main>
  );
}
