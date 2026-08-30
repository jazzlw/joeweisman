import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/guestbook";
import { isAdmin } from "@/lib/admin-auth";
import { thumbUrl } from "@/lib/cf-images";
import { logout } from "./actions";
import LoginForm from "./login-form";
import EntryActions from "./entry-actions";
import PhotoActions from "./photo-actions";
import CaptionEditor from "./caption-editor";
import YearEditor from "./year-editor";
import KindEditor from "./kind-editor";
import FileActions from "./file-actions";
import { getArtifactFiles, formatBytes } from "@/lib/artifact-files";
import ExportButton from "./export-button";
import ContactLogExportButton from "./contact-log-export-button";

export const metadata: Metadata = {
  title: "Admin",
  // Not linked from anywhere, but say so explicitly too.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Pixel size, with a word about it when it's small enough to matter.
 *
 * Two jobs: confirming at a glance that a photograph arrived whole, and finding
 * the ones that won't survive being printed or projected at the service. The
 * thresholds are about print — a 5×7 at 300dpi wants about 3 MP, so 2 MP is
 * already tight and half a megapixel is screen-only.
 */
function describeResolution(width: number | null, height: number | null) {
  if (!width || !height) {
    // Not a fault: everything submitted before this was recorded reads as
    // unknown until `npm run dimensions` has been over it.
    return <span className="mod-year-source">size unknown</span>;
  }

  const megapixels = (width * height) / 1_000_000;
  const note =
    megapixels < 0.4 ? "very small" : megapixels < 2 ? "small for print" : null;

  return (
    <>
      <span className="res">
        {width} &times; {height}
      </span>{" "}
      <span className="mod-year-source">{megapixels.toFixed(1)} MP</span>
      {note && <span className="tag tag-attention">{note}</span>}
    </>
  );
}

type Row = {
  id: string;
  name: string;
  message: string;
  email: string | null;
  status: "published" | "removed";
  created_at: Date;
};

export default async function AdminPage() {
  if (!(await isAdmin())) {
    return (
      <main className="page" id="main">
        <h1 className="page-title">Admin</h1>
        <hr className="rule" />
        <LoginForm />
      </main>
    );
  }

  const entries = (await db()`
    select id, name, message, email, status, created_at
    from guestbook_entries
    order by created_at desc
    limit 100
  `) as Row[];

  const [counts] = (await db()`
    select
      (select count(*)::int from contacts where removed_at is null) as contacts,
      -- Not filtered on removed_at: someone who unsubscribed and later said they
      -- are coming is still a head to feed.
      (select count(*)::int from contacts where rsvp_at is not null) as rsvps,
      -- A blank "number attending" counts as one person, not zero — the point
      -- of this figure is a headcount for food and chairs, and a signup who
      -- didn't answer the question is still at least themselves.
      (select coalesce(sum(coalesce(party_size, 1)), 0)::int
        from contacts where rsvp_at is not null) as attending,
      (select count(*)::int from contact_log) as contact_log,
      (select count(*)::int from guestbook_entries where status = 'published') as published,
      (select count(*)::int from guestbook_entries where status = 'removed') as removed,
      (select count(*)::int from photos where status = 'pending') as photos_pending,
      (select count(*)::int from photos where status = 'approved') as photos_approved,
      (select count(*)::int from photos
        where status = 'approved' and archived_at is null) as photos_unarchived
  `) as {
    contacts: number;
    rsvps: number;
    attending: number;
    contact_log: number;
    published: number;
    removed: number;
    photos_pending: number;
    photos_approved: number;
    photos_unarchived: number;
  }[];

  // Pending first, so nothing waits unnoticed — but newest first within each
  // group, matching the public gallery. Oldest-first buried a photograph that
  // had just arrived at the bottom of a long page.
  const photos = (await db()`
    select id, storage_ref, caption, submitter, email, status, created_at, archived_at,
           taken_year, taken_source, exif_taken_at, kind, width, height
    from photos
    order by (status = 'pending') desc, created_at desc
    limit 200
  `) as {
    id: string;
    storage_ref: string;
    caption: string | null;
    submitter: string | null;
    email: string | null;
    status: "pending" | "approved" | "rejected";
    created_at: Date;
    archived_at: Date | null;
    taken_year: number | null;
    taken_source: string | null;
    exif_taken_at: Date | null;
    kind: string;
    width: number | null;
    height: number | null;
  }[];

  // A failure here shouldn't cost the whole admin page — photos and the
  // guestbook still need moderating if R2 or this table is unhappy.
  let files: Awaited<ReturnType<typeof getArtifactFiles>> = [];
  try {
    files = await getArtifactFiles();
  } catch (e) {
    console.error("Failed to load artifact files:", e);
  }

  // Same reasoning: a diagnostics table failing to load must not cost the whole
  // moderation page.
  let trouble: {
    id: string;
    stage: string;
    detail: string | null;
    files: number | null;
    user_agent: string | null;
    created_at: Date;
  }[] = [];
  try {
    trouble = (await db()`
      select id, stage, detail, files, user_agent, created_at
      from upload_trouble
      where created_at > now() - interval '30 days'
      order by created_at desc
      limit 50
    `) as typeof trouble;
  } catch (e) {
    console.error("Failed to load upload trouble:", e);
  }

  return (
    <main className="page page-wide" id="main">
      <div className="admin-head">
        <h1 className="page-title">Admin</h1>
        <form action={logout}>
          <button type="submit" className="btn-quiet">
            Sign out
          </button>
        </form>
      </div>
      <hr className="rule" />

      <dl className="stats">
        <div>
          <dt>Published</dt>
          <dd>{counts.published}</dd>
        </div>
        <div>
          <dt>Hidden</dt>
          <dd>{counts.removed}</dd>
        </div>
        <div>
          <dt>Email list</dt>
          <dd>{counts.contacts}</dd>
        </div>
        <div>
          <dt>Coming</dt>
          <dd>{counts.rsvps}</dd>
        </div>
        <div>
          <dt>Total attending</dt>
          <dd>{counts.attending}</dd>
        </div>
        <div className={counts.photos_pending > 0 ? "stat-attention" : undefined}>
          <dt>Photos waiting</dt>
          <dd>{counts.photos_pending}</dd>
        </div>
        <div>
          <dt>Photos live</dt>
          <dd>{counts.photos_approved}</dd>
        </div>
        {/* An approved photo that isn't backed up is the one failure here that
            would otherwise be invisible. Only shown when it is non-zero. */}
        {counts.photos_unarchived > 0 && (
          <div className="stat-attention">
            <dt>Not backed up</dt>
            <dd>{counts.photos_unarchived}</dd>
          </div>
        )}
      </dl>

      {counts.photos_unarchived > 0 && (
        <p className="form-error">
          {counts.photos_unarchived}{" "}
          {counts.photos_unarchived === 1 ? "photograph is" : "photographs are"} live but not
          yet copied to the archive. Run <code>npm run archive</code> to fix.
        </p>
      )}

      <h2>Mailing list</h2>
      <ExportButton count={counts.contacts} />
      <p className="jump-note">
        <Link href="/admin/contact" className="btn-quiet">
          Browse/Edit Contacts
        </Link>
      </p>

      <h2>Contact log</h2>
      <ContactLogExportButton count={counts.contact_log} />

      <h2>Photographs</h2>
      {photos.length === 0 ? (
        <p className="muted-note">None submitted yet.</p>
      ) : (
        <div className="mod-grid">
          {photos.map((p) => (
            <figure key={p.id} className={`mod-photo is-${p.status}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbUrl(p.storage_ref)} alt={p.caption ?? "Submitted photograph"} loading="lazy" />
              <figcaption>
                <span className={`tag tag-${p.status}`}>{p.status}</span>
                {p.status === "approved" && !p.archived_at && (
                  <span className="tag tag-pending">not backed up</span>
                )}
                <CaptionEditor id={p.id} caption={p.caption} />
                <KindEditor id={p.id} kind={p.kind} />
                <YearEditor
                  id={p.id}
                  year={p.taken_year}
                  source={p.taken_source}
                  exifTakenAt={p.exif_taken_at}
                />
                <span className="mod-meta">
                  {p.submitter ?? "anonymous"}
                  {p.email && <> &middot; {p.email}</>}
                </span>
                <span className="mod-meta">{describeResolution(p.width, p.height)}</span>
              </figcaption>
              <PhotoActions id={p.id} status={p.status} />
            </figure>
          ))}
        </div>
      )}

      <h2>Upload trouble</h2>
      <p className="muted-note">
        Failures reported by the browser they happened in. Empty is the good
        outcome &mdash; but note this is JavaScript, so it can only report from a
        page that got far enough to run ours. A page that never finished loading
        stays invisible here.
      </p>
      {trouble.length === 0 ? (
        <p className="muted-note">Nothing reported.</p>
      ) : (
        <div className="entries">
          {trouble.map((t) => (
            <article key={t.id} className="entry">
              <header className="entry-head">
                <span className="entry-name">
                  <span className="tag tag-attention">{t.stage}</span> {t.detail ?? "no detail"}
                </span>
                <span className="entry-date">
                  {t.files ?? "?"} file{t.files === 1 ? "" : "s"} &middot;{" "}
                  {formatDateTime(t.created_at)}
                </span>
              </header>
              {t.user_agent && <p className="mod-meta">{t.user_agent}</p>}
            </article>
          ))}
        </div>
      )}

      <h2>Archive files</h2>
      <p className="muted-note">
        Submissions that aren&rsquo;t photographs. These appear nowhere on the
        site &mdash; nothing links to them and no page renders them. Download one
        to see what it is, then decide by hand what to do with it.
      </p>
      {files.length === 0 ? (
        <p className="muted-note">None submitted yet.</p>
      ) : (
        <div className="entries">
          {files.map((f) => (
            <article key={f.id} className={f.status === "rejected" ? "entry is-removed" : "entry"}>
              <header className="entry-head">
                <span className="entry-name">
                  <span className={`tag tag-${f.status}`}>{f.status}</span>{" "}
                  {/* Plain <a>, not <Link>: this is a file download, not a
                      navigation, and prefetching it would pull the bytes. */}
                  <a href={`/admin/files/${f.id}`} download>
                    {f.filename}
                  </a>
                </span>
                <span className="entry-date">
                  {formatBytes(f.byte_size)} &middot; {formatDate(f.created_at)}
                </span>
              </header>
              {f.description && <p className="entry-message">{f.description}</p>}
              <p className="mod-meta">
                {f.submitter ?? "anonymous"}
                {f.email && <> &middot; {f.email}</>}
                {f.content_type && <> &middot; claimed {f.content_type}</>}
              </p>
              <FileActions id={f.id} status={f.status} />
            </article>
          ))}
        </div>
      )}

      <h2>Guestbook</h2>
      {entries.length === 0 ? (
        <p className="muted-note">No entries yet.</p>
      ) : (
        <div className="entries">
          {entries.map((e) => (
            <article key={e.id} className={e.status === "removed" ? "entry is-removed" : "entry"}>
              <header className="entry-head">
                <span className="entry-name">
                  {e.name}
                  {e.status === "removed" && <span className="tag">hidden</span>}
                </span>
                <span className="entry-date">
                  {formatDate(e.created_at)}
                  {/* Submitter email is admin-only and never rendered publicly. */}
                  {e.email && <> &middot; {e.email}</>}
                </span>
              </header>
              <p className="entry-message">{e.message}</p>
              <EntryActions id={e.id} status={e.status} name={e.name} />
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
