# Memorial Site — Architecture & Build Brief

> A context document to hand to Claude Code as the starting point for this project.
> It states the goals, the chosen stack, the data model, the endpoints, and the
> build order. It is opinionated on purpose — pick a target and adjust, rather than
> re-deciding everything mid-build.

---

## 1. Project context

A self-built memorial website. Two things are worth keeping in mind throughout,
even for a personal project:

- **Durability.** A memorial is often meant to last. Whoever should be able to keep
  it running needs access to the domain, accounts, and billing — don't bottleneck it
  on a single login (see §12).
- **Legitimacy.** Custom domain, clean design, no ad-supported free-tier branding.

### Goals (what the site does)
- Host informational pages about the memorial (history, event info, how to visit/contribute).
- Let visitors **join an info/email list** (double opt-in, with unsubscribe).
- Let the operator **send updates** to that list.
- Accept a **contact email** address that forwards to a real inbox.
- Public **guestbook** — visitors leave tribute messages.
- Public **photo submissions** — visitors upload photos.
- **Moderation:** guestbook entries and photos are held for review before going live.

### Non-goals (explicitly out of scope for v1)
- No user accounts for visitors (only one or two *admin* logins).
- No payments/donations in v1 (leave a clean hook to add later).
- No livestreaming / event RSVP system.

---

## 2. Chosen stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router, TypeScript)** | Pages + serverless API routes in one repo; Claude Code handles it fluently |
| Hosting | **Vercel** | Zero-config Next.js deploys from GitHub; free tier fits this traffic; custom domains are first-class. *(Cloudflare Pages is a viable swap if you prefer their ecosystem.)* |
| Database | **Supabase (Postgres)** | Managed Postgres + row-level security + storage + admin auth in one system → fewest moving parts to maintain |
| File storage | **Supabase Storage** | Photos live here; DB only stores the path/URL. (Cloudflare R2 is the alternative.) |
| Outbound email | **Resend** | Clean API from serverless functions; good deliverability; broadcast + transactional. *(Buttondown is the lower-maintenance alternative if you'd rather not own list logic.)* |
| Inbound email | **Cloudflare Email Routing** | Free; forwards `contact@yourdomain` to a real inbox. Durable and boring, which is what you want. |
| Spam / bot defense | **Cloudflare Turnstile** | Free, privacy-respecting CAPTCHA alternative on all public forms |

Rough running cost: **~$0–20/month** depending on list size and Resend volume.

---

## 3. High-level data flow

```
                         ┌─────────────────────────────┐
   Visitor browser  ───► │  Next.js on Vercel           │
                         │  • static/info pages          │
                         │  • public forms               │
                         │  • /api/* serverless funcs    │
                         └──────────┬───────────┬────────┘
                                    │           │
                       Turnstile ───┘           │ (server-side keys only)
                       verify                    ▼
                                        ┌──────────────────┐
                                        │  Supabase         │
                                        │  • Postgres tables│
                                        │  • Storage (photos)│
                                        │  • Auth (admins)  │
                                        └──────────────────┘
                                    │
        outbound list mail ─────────┼─────► Resend
        contact@ inbound ───────────┴─────► Cloudflare Email Routing ─► real inbox
```

Key principle: **all secrets and privileged DB access stay server-side** (in API
routes / server components). The browser never holds the Supabase service key or the
Resend key.

---

## 4. Site map / pages

Public:
- `/` — home / overview
- `/about` — history & context (association tie-in)
- `/visit` — practical info, event details
- `/guestbook` — read approved entries + submit form
- `/photos` — approved gallery + submit form
- `/subscribe` — join the info list (or an inline form in the footer)
- `/confirm` — landing for double-opt-in confirmation link
- `/unsubscribe` — one-click unsubscribe landing

Admin (behind Supabase Auth, not linked publicly):
- `/admin` — dashboard
- `/admin/moderation` — approve/reject pending guestbook entries and photos
- `/admin/subscribers` — view/export the list
- `/admin/broadcast` — compose and send an update to the list

---

## 5. Data model (Postgres)

```sql
-- Email/info list
create table subscribers (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  name          text,
  status        text not null default 'pending',  -- pending | confirmed | unsubscribed
  confirm_token uuid default gen_random_uuid(),    -- for double opt-in
  unsub_token   uuid default gen_random_uuid(),    -- for one-click unsubscribe
  created_at    timestamptz not null default now(),
  confirmed_at  timestamptz
);

-- Guestbook
create table guestbook_entries (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text,                                 -- optional, never shown publicly
  message    text not null,
  status     text not null default 'pending',      -- pending | approved | rejected
  ip_hash    text,                                 -- hashed, for rate-limit/abuse only
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- Photo submissions (file itself lives in Storage; row holds the path)
create table photos (
  id            uuid primary key default gen_random_uuid(),
  submitter     text,
  email         text,                              -- optional, private
  caption       text,
  storage_path  text not null,                     -- e.g. photos/pending/<uuid>.jpg
  status        text not null default 'pending',   -- pending | approved | rejected
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz
);
```

**Row-Level Security:** enable RLS on all tables. Public/anon role may `insert` into
guestbook/photos/subscribers and may `select` **only rows where `status = 'approved'`**
(and only non-private columns — expose approved guestbook/photos through a view or a
server route that omits `email`/`ip_hash`). All writes that change `status` require the
authenticated admin role.

---

## 6. API endpoints (Next.js route handlers)

Public:
- `POST /api/subscribe` — validate email, verify Turnstile, insert `pending`, email a confirmation link via Resend.
- `GET  /api/confirm?token=` — flip subscriber to `confirmed`.
- `GET  /api/unsubscribe?token=` — flip to `unsubscribed` (one click, no login).
- `POST /api/guestbook` — verify Turnstile, sanitize, insert `pending`.
- `POST /api/photos/upload-url` — verify Turnstile, return a **short-lived signed upload URL** to Supabase Storage; client uploads directly; then `POST /api/photos` records the row as `pending`.

Admin (require authenticated session):
- `POST /api/admin/moderate` — set a guestbook/photo row to `approved`/`rejected`; on photo approval, move file `pending/ → approved/`.
- `GET  /api/admin/subscribers` — list/export (CSV).
- `POST /api/admin/broadcast` — send an update to all `confirmed` subscribers via Resend (batch; include unsubscribe link in every message).

---

## 7. Moderation workflow

Nothing public appears without review. This matters for a memorial specifically —
public submission forms attract spam and the occasional bad actor.

```
submit ─► status = pending ─► admin reviews ─► approved (goes live)
                                            └► rejected (hidden; kept or purged)
```

Photos: store uploads under `photos/pending/`. On approval, copy/move to
`photos/approved/`; only the approved prefix is ever served publicly.

---

## 8. Email details

**Outbound (the info list)**
- Double opt-in is not optional — it protects deliverability and keeps you compliant.
- Every broadcast **must** include a working unsubscribe link (`/unsubscribe?token=`).
- Include a physical mailing address in the footer of list emails (CAN-SPAM requires
  one; a PO box works if you'd rather not use a home address).
- Verify your sending domain in Resend (SPF/DKIM/DMARC DNS records) or mail lands in spam.

**Inbound (`contact@yourdomain`)**
- Simplest durable option: Cloudflare Email Routing forwards to a real monitored inbox.
- Only reach for a programmatic inbound webhook (Resend/Postmark → your app) if you
  later want to *display or store* incoming mail. For v1, forwarding is enough.

---

## 9. Security & privacy checklist

- **Turnstile** on every public form; verify the token **server-side** before writing.
- **Rate-limit** submissions (per IP-hash and/or a simple per-window counter).
- **Sanitize** all user text; render guestbook messages as plain text, never as HTML.
- **Photo uploads:** restrict MIME type + max size server-side; validate the actual file, not just the extension.
- **Strip EXIF** from uploaded photos on approval — phone photos often carry GPS/location metadata you don't want public.
- **Never expose** submitter `email` or `ip_hash` on public pages.
- **Secrets** (Supabase service key, Resend key) live only in Vercel env vars / server code — never shipped to the browser, never in URL query strings.
- **Backups:** schedule a periodic Supabase DB export + a copy of the approved-photos bucket. For something meant to endure, a monthly off-platform backup is cheap insurance.

---

## 10. Environment variables

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=      # safe for browser; RLS enforces access
SUPABASE_SERVICE_ROLE_KEY=          # SERVER ONLY — full DB access

# Resend
RESEND_API_KEY=                     # SERVER ONLY
RESEND_FROM_ADDRESS=                # e.g. updates@yourdomain

# Cloudflare Turnstile
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=               # SERVER ONLY

# App
APP_BASE_URL=                       # for building confirm/unsubscribe links
```

---

## 11. Suggested build order

1. **Scaffold** — Next.js + TypeScript repo, deploy an empty site to Vercel, wire the custom domain early so DNS is settled.
2. **Static pages** — home / about / visit. Establish the design system here.
3. **Supabase** — create project, tables, enable RLS + policies, connect from the app.
4. **Info list** — subscribe form → confirmation email → confirm/unsubscribe routes.
5. **Guestbook** — submit (pending) + public read of approved entries.
6. **Photos** — signed-URL upload flow + public approved gallery.
7. **Admin + moderation** — Supabase Auth login, moderation dashboard, then broadcast.
8. **Hardening** — Turnstile, rate limits, EXIF stripping, backups.
9. **Inbound email** — Cloudflare Email Routing for `contact@`.

Ship 1–4 as a first milestone; the site is genuinely useful (info + list) even before the guestbook exists.

---

## 12. Longevity / ownership notes (worth doing for anything meant to last)

- Register the **domain with auto-renew on**, and make sure more than one person can access the account if that matters to you. A memorial site that dies because a renewal email got missed is a real failure mode.
- Consider creating the Supabase / Vercel / Resend / Cloudflare accounts under a **dedicated project email** rather than a personal one you might lose access to. Document the logins somewhere safe.
- Keep a short **runbook** (a `README` in the repo) covering: how to deploy, where each service is, and how to restore from backup.
- Keep an eye on **billing** so a lapsed card doesn't quietly take the site down.

---

## 13. Open decisions to confirm before/early in the build

- Domain name, and where DNS is (or will be) managed.
- Is there an existing visual identity (colors, imagery, typography) the site should match?
- Who are the moderators/admins (how many logins)?
- Should rejected submissions be retained (for records) or purged?
- Any donation/contribution flow needed later? (Leave a hook if so.)
- Data retention: is the info list expected to persist indefinitely?
