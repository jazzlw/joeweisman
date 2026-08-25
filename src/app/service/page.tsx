import type { Metadata } from "next";
import Placeholder from "../placeholder";
import { readDoc, isEmpty } from "@/lib/content";

export const metadata: Metadata = { title: "The Service" };

export default function ServicePage() {
  const doc = readDoc("service");

  // Once content/service.md is filled in, this renders it instead of the placeholder.
  // The heading comes from the file's frontmatter, so the page can be retitled
  // without touching code — the nav keeps its own shorter label.
  if (!isEmpty(doc)) {
    return (
      <main className="page" id="main">
        <h1 className="page-title">{doc.title ?? "The Service"}</h1>
        <hr className="rule" />

        {/* Plain anchor, not Link: /rsvp carries a Turnstile widget, and a
            client-side navigation would leave it unrendered. See needsFullLoad
            in lib/sections. */}
        <div className="toolbar-row toolbar-row--wide">
          <a href="/rsvp" className="btn-primary">
            Tell us you&rsquo;re coming
          </a>
          <p className="muted-note">
            It helps with the food and the chairs.
            <br />
            Not a ticket &mdash; come either way.
          </p>
        </div>

        <div className="prose" dangerouslySetInnerHTML={{ __html: doc.html }} />
      </main>
    );
  }

  return (
    <Placeholder title="The Service">
      <p>
        A memorial for Joe will be held in September. The date, time, and place
        will be posted here as soon as they are settled.
      </p>
      <p>
        If you would like to be told when the details are confirmed, you can{" "}
        <a href="/subscribe">leave your email address</a>.
      </p>
    </Placeholder>
  );
}
