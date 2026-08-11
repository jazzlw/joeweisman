# Architecture

**Overview:** This document desribes what the site actually is, right now. For build history, and details on "we considered this and rejected it," see `historic/HISTORY.md`. What's still ahead to do is`PLAN.md`. How to run, deploy, and moderate the live site is `README.md`. Implementation-level conventions for anyone editing the code — including Claude Code — are in `CLAUDE.md` and `AGENTS.md`; _this document_ sits a level
above those, for understanding the system without reading the code first.

## Stack

| Layer | Choice | Why this one |
|---|---|---|
| Framework | Next.js (App Router, TypeScript) | Pages and server logic in one repo, deploys straight to Vercel |
| Hosting | Vercel | Zero-config Next.js deploys from GitHub, free tier fits this traffic |
| Database | Neon (Postgres) | Free tier; idles rather than pausing destructively |
| Photo serving | Cloudflare Images | Handles HEIC transcode, thumbnails, and delivery — `sharp` can't decode HEIC, and browsers can't render it raw |
| Photo archive | Cloudflare R2 | A permanent private original of every submission, independent of the serving layer |
| Non-photo file storage | Cloudflare R2, presigned upload | Recordings, scans, documents — never served publicly; see "Security boundaries" |
| Bot defense | Cloudflare Turnstile | On every public form; see `CLAUDE.md` for the outage-policy pattern |
| DNS + inbound email | Cloudflare | `contact@` forwards to a real inbox via Email Routing |
| Admin notifications | Resend | One recipient, a few emails a day — not a mailing-list sender |
| Mailing-list sending | Manual, from Gmail, BCC | No broadcast system, by design |
| Uptime monitoring | UptimeRobot | Two monitors, watching different failure modes |

Live status, exact costs, and account details: `README.md` → "The services".
The story of what this replaced (Supabase, Resend broadcast, double opt-in)
is in `historic/HISTORY.md`.

## Data model

Four tables in Neon Postgres, defined by the numbered files in `db/`.

**`guestbook_entries`** — publishes immediately (`status: published | removed`).
There's no moderation queue; Turnstile plus an instant admin email is the
defense against abuse.

**`photos`** — the two public galleries (`/photos` and `/artifacts`) are one
table, distinguished by `kind: photo | artifact`. Holds moderation state
(`pending | approved | rejected`), where the file lives (`storage_ref`), when
it was taken (`taken_year` / `taken_source` / `exif_taken_at` — three columns
because submitter-typed, EXIF, and admin-corrected dates disagree and aren't
equally trustworthy), pixel dimensions, and archive state (`archive_key` /
`archived_at`).

**`artifact_files`** — submissions that aren't photographs (recordings,
scans, documents). A separate table rather than a row in `photos`, because
these have no Cloudflare Images id and no viewable derivative — see "Security
boundaries" for why nothing in this table is ever served publicly.

**`contacts`** — the mailing list. No confirmation tokens, no status machine.
A duplicate signup is swallowed with `on conflict do nothing` rather than
shown as an error.

**Access:** the browser never touches the database directly. Every read and
write goes through a Next.js server action or route handler holding the
connection string server-side.

**The database is temporary scaffolding, not permanent infrastructure.** The
site is designed to freeze to static HTML once submissions taper off — see
`PLAN.md` for that plan. This is why the schema stays flat: no feature should
assume Postgres is permanent.

### The photo pipeline: two storage systems, two jobs

- **Cloudflare Images is the serving layer.** Every upload lands here first,
  direct from the visitor's browser to a one-time upload URL — Cloudflare
  transcodes on ingest, which is the whole point: a large share of uploads
  are HEIC from iPhones, and `sharp` doesn't decode HEIC in its default build.
- **R2 is the permanent archive.** On approval, the original is copied here
  and kept — even a later rejection leaves the R2 copy in place unless it's
  purged by hand. This is the copy backups are taken from, and the copy a
  year-two static freeze would read from.

Cloudflare Images is never the only copy of anything that's been approved.

## Pages and routes

Public, in nav order (`src/lib/sections.ts`): `/service`, `/photos` (with
`/photos/add`), `/artifacts`, `/guestbook` (with `/guestbook/add`),
`/recipes`, `/subscribe` — plus the home page `/` and `/how-to-make-this`.

Admin, password-gated, unlinked and `noindex`: `/admin` (the moderation
dashboard) and `/admin/files/[id]` (downloads one non-photo submission — the
only route that ever serves one).

API: `/api/health` (the uptime-monitor target) and `/api/upload-trouble`
(client-side upload-failure telemetry).

Module-level file map, and which file does what: `README.md` → "What's where".

## Security boundaries

Standing rules, not preferences — each one closes a real exploit path:

- **Visitor-submitted text is never rendered as HTML.** Guestbook messages
  render as plain text, `white-space: pre-line`. `dangerouslySetInnerHTML` is
  used only for the site's own Markdown in `content/`.
- **`next/image` is reserved for curated assets we control** — the portrait,
  the share image. Next's optimizer runs `sharp` over whatever it's given,
  and feeding stranger-supplied files to libvips on our own server is a real
  exploit path. Visitor photos are served directly from Cloudflare Images,
  which does its own transcoding in its own sandbox.
- **`artifact_files` is never served publicly, by any route.** These are
  stranger-supplied files with no fixed type — a `.html` or `.svg` served
  from our own origin is stored XSS, and filtering by extension doesn't close
  that; not serving the table at all does. The one exception,
  `/admin/files/[id]`, is admin-gated and forces
  `Content-Disposition: attachment` plus `nosniff` rather than trusting the
  uploader's claimed type.
- **Secrets never reach the browser.** Database credentials, the Resend key,
  and the Turnstile secret live only in Vercel's server-side environment.

## Design system

- **Serif throughout**, body and headings — `.woff2` files committed to the
  repo and loaded with `next/font/local`, never `next/font/google`. That
  loader fetches from Google at *build* time, so a rebuild years from now can
  fail if the API changes or the face is withdrawn; committed files have no
  network dependency at any point.
- **Warm cream on warm near-black**, not pure white on pure black — every
  text/background pair verified at WCAG AAA by computed contrast, in both a
  light and a dark palette (`prefers-color-scheme`).
- **Nothing animates.** No scroll effects, no parallax, no transition on
  navigation. The audience is often older and grieving.
- **Single centered column**, plain-text nav, no hamburger menu, no sticky
  header. Body text set large with generous line-height — most traffic
  arrives on a phone from a Facebook link.
- All of it lives in one file, `src/app/tokens.css` — no Tailwind, no
  CSS-in-JS.

Full rationale for each of these: `historic/HISTORY.md` §11.
