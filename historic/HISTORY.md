# Joe Weisman Memorial — History

> The decision record: what changed from the original proposal
> (`memorial-site-architecture.md`, in this same folder) and why, written as the
> build actually happened. Nobody needs to read this to run or extend the site —
> for that, see `ARCHITECTURE.md` (what the site is) and `PLAN.md` (what's still
> ahead), both at the repo root. Read this one when you want to know *why* it's
> Neon and not Supabase, why the guestbook auto-publishes, or any other choice
> that could plausibly have gone the other way.
>
> Section numbers below are cited from code comments throughout the repo
> (`grep -rn "HISTORY.md §"`) — kept stable on purpose, so don't renumber
> sections when editing this file. Add new sections at the end instead.
>
> This file used to be called `PLAN.md`, back when it was the live design
> document. It kept that name, and everything in it, right up to the rename —
> the sections below still say "Plan" and talk about the future in future tense,
> because that's what they were when written.
>
> **Original timeline, for the record:** service in September, site live in about
> a week, from a six-week runway. Both happened; see the milestones below.

---

## 1. What changed from the original brief, and why

| Original | Now | Reason |
|---|---|---|
| Resend + double opt-in + confirm/unsub tokens + broadcast admin | **Collect addresses only.** Export CSV, BCC from a dedicated Gmail. | You don't want the compliance surface. Personal memorial updates aren't commercial email — the burden was largely imaginary. Deletes ~40% of the build. |
| Supabase Auth + admin dashboard | **Password-gated `/admin`** (one long random secret in an env var) | Two admins don't need an identity system. ~30 lines instead of an auth integration. |
| Guestbook held for moderation | **Guestbook auto-publishes**, you get an email on each entry, one-click remove | A tribute that vanishes on submit reads as broken to a grieving 70-year-old. Turnstile catches the bots. |
| Photo submissions in v1 | **Kept, opening ~2 weeks in — before the service** | Originally deferred under a tighter deadline. With six weeks of runway that argument is gone, and collecting *before* September is actively better: the submissions become material for the service itself. See §3. |
| Build order starts with scaffold + design system | **Build order starts with the service details page** | Get the thing people need to know in front of them first; design can improve underneath it. |

Everything else from the original — Turnstile, server-side token verification, plain-text
rendering, Cloudflare Email Routing for `contact@`, off-platform backups — is kept as written.
The security section of the original doc was good.

---

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router, TypeScript) | Keep. Fine, and fast to build in. |
| Hosting | Vercel | Free tier. |
| Database | **Neon (Postgres)** | Free tier. Scales compute to zero when idle but **resumes automatically on the next query** — no manual unpause. See §7. |
| File storage | **Cloudflare R2** | Free tier, no egress fees. Object storage doesn't idle. |
| DNS + inbound email + Turnstile | Cloudflare | Free. `contact@` forwards to a real inbox. |
| Outbound email | **Resend — admin notifications only** | One recipient (you), a few messages a day. No list, no deliverability project, no domain-reputation risk. Free tier is ample. |
| List sending | **Gmail, by hand** | See §6. |
| Uptime monitoring | **UptimeRobot** | Free. Not optional — see §7. |

**Budget:** roughly **$5–10/mo plus the domain**, spent in this order:

1. **Domain registered 10 years up front (~$150 once).** The highest-value money in the
   project. A lapsed domain is the most common way memorial sites die, and the cause is
   almost always a dead card on a renewal three years out when nobody is watching.
   Prepaying a decade removes that failure mode for the period that matters.
2. **Cloudflare Images, Starter Bundle ($5/mo)** for the photo pipeline — ingest,
   transcode, thumbnails, delivery. HEIC is the specific reason: iPhone photos won't
   render in browsers, and `sharp` doesn't decode HEIC in its default builds, so
   hand-rolling means wrestling libheif inside a serverless function with memory and
   timeout limits.

   *Take the bundle, not pay-as-you-go.* The `$5 per 100,000 images stored` on the PAYG
   plan is a minimum billing increment, not metered — 500 photos costs the same $5 as
   100,000. At an identical price the bundle also covers 500,000 deliveries, which PAYG
   bills separately. An earlier draft of this section estimated "pennies" by misreading
   that line as prorated.

   *Considered and rejected:* storing originals in R2 (free under 10GB) and running
   transformations against R2 URLs would be $0. Rejected because Cloudflare documents
   HEIC input for transformations as basic-only, with reported resize failures — and
   HEIC is the entire reason this product is in the stack. A failed transcode leaves a
   photo with no viewable derivative, which puts moderation back to approving images
   that can't be seen.
3. **Nothing else.** Neon free and Vercel free are not constraints here (see below).

**Deliberately not paying for:** a Neon paid tier (buys protected branches and longer
history retention; the free tier's idle behavior already self-heals, so this fixes
nothing), Supabase Pro (moot — we left), and Vercel Pro (free handles this traffic, and
the non-commercial ToS clause doesn't apply to a memorial).

**Supabase was the original choice and has been dropped.** It bundled DB + storage +
auth in one vendor, which was appealing, but its free tier pauses projects after ~7 days
without traffic and a paused project stays down until a human logs in and clicks unpause.
That is precisely the failure mode a memorial site hits in year three. We'd already cut
Supabase Auth, so the bundle was worth less than it looked. Neon's idle behavior is
transparent rather than destructive — the bad state isn't reachable.

**Considered and rejected:** consolidating onto Cloudflare (Pages + D1 + R2) would put
every service under one account and one bill — the best five-year answer, given the site
outlives your involvement. Rejected for v1 only because Next-on-Cloudflare adds friction
against a deadline. Worth revisiting at the one-year mark.

---

## 3. Build order

### Milestone 0 — today/tomorrow. Blocking: needs the domain.
- Register domain, auto-renew **on**, DNS on Cloudflare.
- Deploy a **single page**: name, dates, service date/time/address, map link, and a
  line about what else is coming. That's it. Nothing else on it.
- Cloudflare Email Routing: `contact@` → your inbox.

DNS and nameserver changes can take 24–48h to settle. This is the only thing on the
critical path that you cannot compress by working harder, so it starts first.

### Milestone 1 — the real site, live in ~1 week
- Obituary / life story.
- Service details page: parking, what to expect, dress, flowers or donations-in-lieu.
- Photo gallery — seeded with photos you already have.
  **Build it reading from the database from day one**, with your curated photos inserted
  as pre-approved rows. A gallery hardcoded to repo files gets thrown away two weeks
  later when submissions open; this way M2 adds a write path to something that already
  exists rather than replacing it.
- Email signup form (just collects; see §6).
- Open Graph tags + a share image. **These sites travel by Facebook share** — this is
  not a nice-to-have, it's the distribution channel.
- Design and accessibility per **§11** — that section is now decided, not deferred, and
  is where the type, color, and layout specifications live.

### Milestone 2 — weeks 2–3. Guestbook first, then photo submissions.
Guestbook goes first even though photos are the priority feature, because it builds the
shared plumbing photos then reuse: Turnstile verification, the `/admin` page, submission
email notifications, rate limiting. It's roughly a day of work and it de-risks the larger
feature behind it.

- Guestbook: submit + public list, auto-publishing, Turnstile, email notify, admin remove.
- Photo submissions: presigned upload URL, HEIC→JPEG transcode, thumbnails, EXIF strip,
  moderation queue. Writes into the gallery built in M1.

### Milestone 3 — late August, ahead of the service
- **Put a soft deadline on the photos page** — "send photos by [date] to be included in
  the service." Submissions collected now are material for the slideshow, memory table,
  or printed board. This is the main reason photos moved ahead of September, and it only
  pays off if people know there's a cutoff.
- **QR code** for the printed program / order of service.
- Freeze content changes a few days out; verify the site on a real phone on cellular.

### Milestone 4 — after the service
- Add photos from the day itself.
- Export the email list and send the first update from Gmail.
- Expect the largest burst of guestbook entries and photo submissions in the two weeks
  following. Watch the moderation queue daily during that window.

### Milestone 5 — the boring durability work
- Monthly DB export + photo bucket copy, stored somewhere off-platform.
- `README` runbook: where each service is, how to deploy, how to restore, who pays for what.
- Handoff notes for whoever inherits it.

### Milestone 6 — year two: freeze to static
Submissions will stop, probably within six months. When they do, snapshot the guestbook
and gallery to plain HTML, delete the database, and let the memorial become a folder of
files on static hosting. It then costs the domain renewal and **cannot break** — no
vendor, no tier, no free-plan policy change, nothing to unpause, nothing to monitor.

This is the actual long-term durability answer, and it's worth deciding now because it
reframes everything upstream: **the database is temporary scaffolding for the active
period, not permanent infrastructure.** Which is a further argument against paying to
make it nicer, and an argument for keeping the schema simple enough to flatten cleanly.

---

## 4. Pages

Public:
- `/` — Joe, dates, portrait, service details up top until the service passes
- `/obituary` (or fold into `/`) — life story
- `/service` — logistics, map, practical detail
- `/photos` — gallery (curated v1, submissions added in M3)
- `/guestbook` — read + submit
- `/contact` — or just an address in the footer

Admin (not linked, password-gated):
- `/admin` — pending photos, recent guestbook entries with a remove button, subscriber CSV export

---

## 5. Data model

```sql
-- Guestbook. Note the default: published, not pending.
create table guestbook_entries (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text,                                  -- optional, never shown publicly
  message    text not null,
  status     text not null default 'published',     -- published | removed
  ip_hash    text,                                  -- sha256(ip + IP_HASH_SALT)
  created_at timestamptz not null default now()
);

-- Photos. Table exists from M1 (curated, inserted as status='approved');
-- M2 adds the public write path. File lives in storage; the row holds the reference.
create table photos (
  id           uuid primary key default gen_random_uuid(),
  submitter    text,                                -- null for curated photos
  email        text,                                -- optional, private
  caption      text,
  storage_ref  text not null,                       -- R2 key, or Cloudflare Images ID
  status       text not null default 'pending',     -- pending | approved | rejected
  sort_order   int,                                 -- curated photos lead the gallery
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz
);

-- Address collection. No tokens, no status machine, no confirmation flow.
create table contacts (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  name       text,
  note       text,                                  -- "how did you know Joe" — optional
  created_at timestamptz not null default now(),
  removed_at timestamptz                            -- set by hand when someone asks off
);
create unique index contacts_email_key on contacts (lower(email));
-- Insert with `on conflict do nothing` so a duplicate signup is a silent success,
-- never a visible error.
```

**Access:** the browser never touches the database. Every read and write goes through a
Next.js route handler holding the connection string server-side, and the public pages
select only the columns they render — never `email`, never `ip_hash`. The original doc
described both a server-only model *and* anon-role RLS policies; this resolves that
ambiguity in favor of server-only. There is no browser-facing database credential to
scope, which is why the policy layer isn't doing work here.

**Photo storage — R2 and Cloudflare Images have distinct jobs.** An earlier draft listed
both without saying how they divide, which would have led to storing everything twice
for no reason. The split:

- **R2 is the archive.** Every original lands here via presigned upload under `pending/`,
  private, and stays permanently — including rejected ones, unless purged. This is the
  copy that gets backed up and the copy the year-two static freeze reads from.
- **Cloudflare Images is the serving layer.** On approval, the original is pushed to
  Images and the returned image ID is stored in `photos.storage_ref`. Images handles
  HEIC transcode, thumbnails, and delivery.

Nothing is served from R2 directly, and Cloudflare Images is never the only copy of
anything. If Images is ever dropped, the originals are all still in R2.

---

## 6. The email list, concretely

You collect addresses. You send from a dedicated Gmail. That's the whole system.

- Form posts to `/api/contacts`, Turnstile-verified, `on conflict do nothing`.
- Form copy sets the expectation plainly: *"Occasional updates about Joe's memorial.
  Reply to any message to be removed."* No checkbox theater.
- `/admin` exports CSV.
- Send with everyone in **BCC**. Never CC — CC leaks every mourner's address to every
  other mourner, which is the kind of mistake that's remembered.
- Record removals by setting `removed_at` when someone replies asking off. Honor it.

**Where this approach breaks:** consumer Gmail caps at ~500 recipients/day (Workspace,
~2000), and a single BCC to several hundred addresses from a fresh account has a real
chance of landing in spam. Under ~200 people this is genuinely fine. If the list gets
past ~300, split it across days or move to Buttondown at that point — the CSV makes
that migration trivial, which is the main reason to keep the data in your own table
rather than a third-party form.

---

## 7. Risks worth naming

- **The site quietly dying is the primary long-term risk**, and it has three causes:
  a database that pauses, a lapsed domain, and a lapsed card. The DB choice in §2
  addresses the first structurally rather than with a keepalive cron — a keepalive is
  itself a thing that breaks silently (GitHub Actions, for instance, auto-disables
  scheduled workflows on repos with no commits for 60 days, which is exactly the state
  a finished memorial site is in). Domain auto-renew and a card that outlives your
  attention handle the other two.
- **Neon's idle behavior was verified against their docs (July 2026)** and has two
  tiers, both self-healing: compute suspends after 5 min idle and *"reactivates
  automatically within a few hundred milliseconds"*; branches older than 14 days with
  24h of no access are archived to cold storage, and *"no action is required to
  unarchive a branch — it happens automatically."* Neither requires a human. Free-tier
  terms churn, so re-check at the one-year mark, but the failure mode is closed today.
- **Free plan caps: 0.5 GB storage and 100 CU-hours/month per project.** Exceeding
  storage fails writes (it does not delete data). Not a practical concern — photos are
  in R2, and 0.5 GB of text is hundreds of thousands of guestbook entries — but it is
  the limit to watch if anything ever starts writing bulk data to Postgres.
- **UptimeRobot is not optional.** The real failure isn't a service pausing, it's the
  site being down for three weeks with nobody noticing. Five minutes of setup, free tier,
  alerts to an address someone actually reads.
- **Auto-publishing the guestbook** accepts a small window where something ugly is
  public. Turnstile plus an instant email notification keeps that window to minutes.
  New domains get found by spam bots via certificate transparency logs within hours,
  so Turnstile goes on from the first deploy, not in a hardening pass at the end.
- **Photo rights.** Submitted photos will contain other living people. The submit form
  should say, in one line, that submissions may be published publicly.
- **Ownership.** Register the domain and create the accounts under an address that
  outlives your involvement — a dedicated Gmail is fine and you're standing one up
  anyway. Make sure at least one other person can get into it.

---

## 8. Carried-over fixes to the original data model

Recorded here so they aren't reintroduced later:
- Unsubscribe-by-`GET` was going to silently unsubscribe people, because mail clients
  and security scanners prefetch links. Moot now — there are no unsubscribe links.
- `email unique not null` on subscribers broke resubscribe-after-unsubscribe. Solved
  by the `on conflict do nothing` upsert above.
- `ip_hash` must be salted with a server-side secret. Unsalted IPv4 hashes are
  brute-forceable in seconds — the whole address space is 2^32.

---

## 9. What I need from you

**Blocking, today.** Still today despite September, because DNS takes 24–48h to settle
and a one-week target doesn't absorb that:
1. **Register `joeweisman.org`** (confirmed available) at Cloudflare Registrar — 10-year
   term, auto-renew on, free WHOIS privacy. `.com` deliberately skipped; see §10.
2. **Stand up `joeweismanmemorial@gmail.com`** and register every account under it.

**Blocking for Milestone 1 (the ~1-week site):**
3. Joe's full name as it should appear, and his dates.
4. A portrait photo — the main image of him.
5. **Obituary text, or the raw material for one.** With six weeks of runway, this is now
   the critical path, not the engineering. Writing it is the slow part and it can't be
   parallelized away. Start it before anything technical is ready.
6. Service date, time, and address — as much as is settled. A page saying "September,
   details to follow" is fine for launch and better than waiting.
7. The 15–30 photos to seed the gallery.
8. Flowers, or donations in lieu? If donations, to whom and where.

**Blocking for Milestone 3:**
9. The photo-submission cutoff date, and whether photos will actually be used in the
   service (slideshow, board, memory table). If not, the cutoff messaging changes.

**Can wait:**
10. Anything of Joe's the design should draw from — a color he liked, a photograph with
    the right feeling, a book or object with a look worth borrowing. §11 sets the
    register; this is what would make it his rather than merely tasteful.
11. Who else gets admin access.
12. Whether rejected photo submissions are kept or purged.

---

## 10. Names and accounts

**Domain: `joeweisman.org`.** Registrar: Cloudflare — at-cost pricing with no renewal
markup, free WHOIS privacy, 10-year terms supported (verified; they previously capped at
one year). Everything else is already Cloudflare, so this is one fewer account and one
fewer card on file. Trade-off accepted: Cloudflare Registrar requires Cloudflare
nameservers, and support is a community forum rather than a phone number — if lockout
recovery matters more than consolidation, Porkbun is the alternative at a few dollars more.

`.com` deliberately skipped. The residual risk is usability, not squatting: an older
audience defaults to typing `.com` after hearing the address spoken. A QR code on the
printed program covers the service itself; links from email and Facebook cover the rest.
Revisit for ~$10/yr as a redirect if it proves to be a problem.

**Email: `joeweismanmemorial@gmail.com`.** Not `joeweisman@` — an email from "Joe Weisman"
arriving in a mourner's inbox months later is a real harm, and inbox previews show the
sender before any context. The two names optimize for different things and are correctly
different: the domain gets spoken and typed, so short wins; the email gets read next to a
sender name, so clarity wins.

- Set the Gmail **display name** to `Jazz — Joe Weisman Memorial`. Most clients show the
  display name and hide the address entirely, so this does more work than the address does.
- Every service account (Cloudflare, Neon, Vercel, Resend, UptimeRobot) registers under
  this address, not a personal one.
- 2FA on, recovery codes stored somewhere a family member can actually reach. The domain
  is the only asset here that cannot be rebuilt from the repo.

**Do not** configure Gmail to send as `contact@joeweisman.org`. Cloudflare Email Routing
is forward-only, so outbound would require SPF/DKIM for the domain and would still show
"via gmail.com" in many clients — reintroducing exactly the deliverability work §6 exists
to avoid. `contact@` forwards *in*; the Gmail sends *out*. Keep those separate.

---

## 11. Design

Earlier drafts of this plan filed visual identity under "can wait." That was wrong —
for a memorial the design is most of what a visitor actually experiences, and with the
writing already done it is the bulk of the remaining work. Decided here.

**Register: quiet and classical.** Restrained, traditional, generous with space.

### Type
- **Serif throughout**, body and headings. `.woff2` files committed to the repo and
  loaded with `next/font/local`.

  *Correction to an earlier draft of this section:* it justified this partly on the
  grounds that `next/font/google` leaks visitor IPs to Google. That is wrong —
  `next/font/google` downloads the files at build time and serves them from your own
  origin, so there is no runtime request to Google and no IP leak. The decision stands
  on the remaining reason only: it fetches from Google **at build time**, so a rebuild
  in year three can fail if the API changes or the face is withdrawn. Committed files
  have no network dependency at any point, and the year-two static freeze inherits them
  for free. A weaker argument than originally stated, but still the right call here.
- Starting pick: **Source Serif 4** (SIL OFL) — drawn for screen, sturdy strokes that
  survive at large sizes. **Literata** is the alternative; we'll compare both in the
  mockup. Avoid high-contrast Didone faces — their hairlines vanish on phone screens
  and for older eyes.
- Body **19–20px**, line-height **1.65**, measure **62–68 characters**. Larger than a
  typical site on purpose.

### Color
- Warm cream background, warm near-black text — not pure black on pure white, which
  glares. Roughly `#FAF8F3` on `#1F1B16`, ~16:1 contrast, comfortably past WCAG AAA.
- **Support dark mode** via `prefers-color-scheme`, with a warm dark palette rather than
  a grey one. Phones default to dark and a full-screen cream page at night is harsh.
- One muted accent for links only. No other color outside the photographs.

### Layout
- Single centered column. Portrait **framed and modest**, not full-bleed — the
  full-bleed treatment belongs to the warm register we didn't pick.
- Name and dates beneath the portrait, then a rule, then the text.
- Nav is plain text links, centered, generously spaced. No hamburger, no sticky header.
- **No animation, no scroll effects, no parallax.** Nothing moves.

### Guestbook — simple stream
- Newest first. Name prominent, date muted, on one line; message below; hairline divider.
- **Messages render as plain text**, never HTML. Paragraph breaks preserved.
- **No truncation and no "read more."** A tribute someone wrote should not be collapsed.
- 50 entries per page with a "show older" button — keeps the page fast and keeps the
  static freeze straightforward.
- Empty state matters: the first visitor should see an invitation, not a blank page.
- A compact **"Add yours"** link at the top jumps to the full form at the bottom.
  Reading others' entries first tends to produce better writing than an empty box does.

### Photos
- Even grid, generous gutters, click for a lightbox. Captions below in small italic.
- Portrait and landscape both occur; the grid must handle mixed aspect ratios without
  cropping faces.

### Non-negotiable
Most traffic arrives on a phone from a Facebook link. Every judgment gets made on a
phone screen first, and verified on real hardware over cellular before launch.

---

## 12. Security notes from the build

**`npm audit` on the fresh scaffold reported 12 high-severity findings.** Nine were
transitive propagation from three roots. `npm audit fix` was useless — it proposed
*downgrading* Next from 16.2.12 to 9.3.3, the usual false remediation. Resolved instead
with `overrides` in `package.json` pinning patched versions; audit is now clean, and
`build` and `lint` both pass:

| Package | Was | Pinned | Real exposure |
|---|---|---|---|
| `sharp` | 0.34.5 | ^0.35.3 | **The one that mattered** — libvips CVEs, and sharp processes images at runtime. |
| `postcss` | <=8.5.17 | ^8.5.23 | Build-time only; would require attacker-controlled CSS in our own build. |
| `brace-expansion`, `minimatch` | <=5.0.7 | ^5.0.8, ^10.2.6 | Dev-only, via the ESLint chain. Negligible, pinned for tidiness. |

**The sharp finding has an architectural consequence worth keeping.** Next.js uses sharp
for `next/image` optimization on the server. If visitor-submitted photos are served
through `next/image`, then attacker-controlled image files are fed to libvips — a real
exploit path for a site whose whole point is accepting uploads from strangers.

**So: user-submitted photos are served directly from Cloudflare Images, never through
`next/image`.** Cloudflare does the transcoding in their sandbox, not ours. `next/image`
is reserved for curated assets we control — the portrait, the share image. This was
already the plan for pipeline reasons (§2); it turns out to also be the security
boundary, which is a good sign the decision was right.

Re-run `npm audit` after any dependency bump — the overrides pin minimums, not maximums,
and Next may later ship its own patched sharp, at which point the override can be dropped.
