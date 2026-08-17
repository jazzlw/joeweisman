import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedEntries, formatDate, PAGE_SIZE } from "@/lib/guestbook";

export const metadata: Metadata = { title: "Guestbook" };

// Stays per-request, unlike /photos and /artifacts, and not by choice: this page
// reads searchParams for pagination, which makes it dynamic whatever revalidate
// says. Caching it would mean moving pages into the path (/guestbook/2), which
// changes URLs people may already have.
//
// Accepted for now because it is the quieter of the two: the gallery is what a
// few hundred people open at once from an email. If Neon usage is still high
// after the other changes, this is the next thing to look at.
export const dynamic = "force-dynamic";

export default async function GuestbookPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: raw } = await searchParams;
  const page = Math.max(0, Number.parseInt(raw ?? "0", 10) || 0);

  let entries: Awaited<ReturnType<typeof getPublishedEntries>>["entries"] = [];
  let hasOlder = false;
  let failed = false;

  try {
    ({ entries, hasOlder } = await getPublishedEntries(page));
  } catch (e) {
    // A database problem shouldn't take the page down — visitors can still
    // navigate to /guestbook/add to write a message.
    console.error("Failed to load guestbook entries:", e);
    failed = true;
  }

  return (
    <main className="page" id="main">
      <h1 className="page-title">Guestbook</h1>
      <hr className="rule" />

      {page === 0 && (
        <p className="jump-note">
          {/* Plain anchor, not Link: the target renders a Turnstile widget and a
              client-side navigation leaves it unrendered. See needsFullLoad. */}
          <a href="/guestbook/add" className="btn-primary">
            Leave a message
          </a>
        </p>
      )}

      {failed ? (
        <p className="form-error">
          The messages can&rsquo;t be loaded just now. Please try again shortly —
          nothing has been lost.
        </p>
      ) : entries.length === 0 ? (
        <p className="prose empty-state">
          {page === 0
            ? "No messages yet. If you knew Joe, yours would be the first."
            : "There are no more messages."}
        </p>
      ) : (
        <div className="entries">
          {entries.map((entry) => (
            <article key={entry.id} className="entry">
              <header className="entry-head">
                {/* Rendered as text by React, never as HTML. */}
                <span className="entry-name">From {entry.name}</span>
                <time className="entry-date" dateTime={entry.created_at.toISOString()}>
                  {formatDate(entry.created_at)}
                </time>
              </header>
              {/* white-space: pre-line keeps the paragraph breaks people type,
                  without interpreting anything as markup. */}
              <p className="entry-message">{entry.message}</p>
            </article>
          ))}
        </div>
      )}

      {(page > 0 || hasOlder) && (
        <nav className="pager" aria-label="More messages">
          {page > 0 ? (
            <Link href={page === 1 ? "/guestbook" : `/guestbook?page=${page - 1}`}>
              &larr; Newer
            </Link>
          ) : (
            <span />
          )}
          {hasOlder && <Link href={`/guestbook?page=${page + 1}`}>Older &rarr;</Link>}
        </nav>
      )}

      {page > 0 && entries.length > 0 && (
        <p className="muted-note pager-note">
          Showing messages {page * PAGE_SIZE + 1}&ndash;{page * PAGE_SIZE + entries.length}.
        </p>
      )}
    </main>
  );
}
