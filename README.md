# joeweisman.org

A memorial site for Joe Weisman (December 16, 1944 – July 10, 2026).

Obituary, service details, a photo gallery with public submissions, a second
gallery for things he made or owned, a guestbook, his own recipes, and a way to
collect email addresses. Built to be cheap, boring, and durable — it should still
be standing in ten years with nobody tending it.

Important documents:

* `ARCHITECTURE.md` -- describes what the site is (the stack, data model, security
  boundaries, design system). 
* `PLAN.md` -- covers what's still ahead to do.
* `history/` -- Some files that describe why past decisions were made the way they were, including what was tried and rejected.
* `FORKED.md` -- Instructions for making a new site for a different person by forking (copying) this site, setting up all the components, and configuring it.
* This file -- Technical notes on how to update, run, and deploy the site.

---

## ⚠️ Pushing to `main` publishes the site

Once the site is configured, if you "push" changes to the main branch of the project on GitHub, GitHub will automatically update the site. There is no separate deploy step and no staging gate.

```
git push origin main   →   Vercel builds   →  site live on joeweisman.org  (~1 min)
```

**If you are not ready for the world to see it, work on a branch.** Every branch and
pull request gets its own private preview URL, which is the right way to show a draft
to family before it goes live:

```bash
git checkout -b service-details
# ...edit...
git commit -am "Add service time and address"
git push -u origin service-details        # Vercel comments with a preview URL
```

Merging that branch to `main` is what makes it public.

**If a build fails, nothing changes** — the current site stays up and you get an email.
**To undo a bad deploy**, open the Vercel dashboard → Deployments → pick the previous
one → *Promote to Production*. It takes seconds; you don't need to revert the commit first.

---

## Moderating the site

Everything happens at **`/admin`** — not linked from anywhere, `noindex`, one password.

**You get an email when something arrives.** A guestbook entry includes the full message,
so you can decide from your inbox whether it needs removing. Photos send one email per
submission, however many pictures it contained.

|                               |                                                              |
| ----------------------------- | ------------------------------------------------------------ |
| **Guestbook**                 | Entries publish **immediately**. That is deliberate — a tribute that vanishes on submit reads as broken to the person who wrote it. *Hide* removes it from the public page; the row survives and *Restore* brings it back. |
| **Photos**                    | Held as `pending` and invisible until you *Approve*. *Reject* hides it reversibly. *Delete for good* appears only on already-rejected photos and also removes the file from Cloudflare — the one irreversible action here. |
| **Photographs vs. artifacts** | Every picture is one or the other, and shows on `/photos` or `/artifacts` accordingly. Submitters choose, and get it wrong both ways — *Move to artifacts* / *Move to photographs* fixes it in one click. |
| **Resolution**                | Shown under each photograph, admin-only. Flagged *small for print* under 2 MP and *very small* under 0.4 MP — a 5×7 at 300dpi wants about 3 MP, so anything flagged will disappoint if it's enlarged for the service. *size unknown* means it predates this and `npm run dimensions` hasn't been run. |
| **Archive files**             | Submissions that aren't pictures: recordings, scans, documents. **These appear nowhere on the site** and nothing links to them. Download one to see what it is, then *Keep* or *Not wanted*. What to do with them after that is a hand decision, like the recipes. |
| **Email list**                | The count is on the dashboard. Export and send by hand from Gmail, BCC (see below). |

Rate limits, if someone reports being blocked: five guestbook entries and forty photos per
IP per hour.

---

### How to email an update to the "mailing list"

There is no broadcast system, on purpose (`historic/HISTORY.md` §6). Export the addresses from the admin screen, then send
from `joeweismanmemorial@gmail.com` with everyone in **BCC** — never CC, which would leak
every mourner's address to every other mourner.

**Two separate ceilings apply, and the smaller one is not the documented limit.**

*Hard:* a consumer Gmail account allows **500 recipients per day**, rolling 24 hours, with
BCC counting fully. Past that Gmail refuses to send.

*Soft:* deliverability, which bites well below 500. A single message BCC'd to hundreds is
a bulk-mail signature, and the memorial Gmail is a new account with no sending history —
the profile most likely to be filtered. Most recipients will be on Gmail too, which
filters Gmail-to-Gmail bulk hardest. The failure is not a bounce you would notice; it is
the message landing in spam folders for people who then never hear about the service.

So: **fine up to roughly 200.** Beyond that, either split your mailing list across days or switch sender.

**If the list grows, send through Resend instead of Gmail.** It is already configured with
`notifications.joeweisman.org` verified and SPF/DKIM passing, so deliverability would be
genuinely good rather than dependent on a new Gmail's reputation. `historic/HISTORY.md` §6 chose Gmail
to avoid owning unsubscribe links and compliance machinery, which is still right for a
small list and worth revisiting for a large one. Free tier is 100/day and 3,000/month.

Either way the addresses live in our own table rather than a third party's form widget,
which is what keeps that switch cheap.

When someone asks to be removed, set `removed_at` on their row by hand. Honour it.

### Editing the content of the site

All the content is in a set of Markdown files, separate from the code, so changing it doesn't mean touching
React or any of the technical stuff. The following are some key files you might edit:

| File                  | Appears at                                                   |
| --------------------- | ------------------------------------------------------------ |
| `content/obituary.md` | The home page                                                |
| `content/service.md`  | `/service` — while empty, that page shows a placeholder instead. Its `title:` frontmatter is the page heading. |
| `content/recipes/`    | `/recipes` — Joe's own text files. See the README in that directory before touching them. |

Plain Markdown: blank line between paragraphs, `*italic*`, `## subheading`. Edit, commit,
push. That's the whole workflow. You can use a markdown editor such as [Typora](https://typora.io/) to edit these files more easily.

**Special Case:** The recipe files are **not** Markdown and must not be reformatted — they are the original
files off Joe's machine, rendered exactly as typed.

**Unfilled placeholders.** Anything like `XXXX` shows in amber during development and
prints a warning in the build log:

```
⚠  content/obituary.md still contains unfilled placeholders: XXXX
   These WILL appear on the live site.
```

It is a warning, not an error — it will not stop a deploy. Watch for it.

# Technical Stuff

The following have technical details of how the site is organized and how to run it.

## Running the site on your own computer

If you want to test the site on your own computer, you can. The site uses Node 22 via [fnm](https://github.com/Schniz/fnm). Node 24 is not used — it requires macOS 13.5+, and this project was set up on macOS 12.

If `node` isn't on your PATH, add this to `~/.bash_profile`:

```bash
export PATH="$HOME/.local/bin:$PATH"
eval "$(fnm env --use-on-cd --shell bash)"
```

Then:

```bash
npm install
npm run migrate             # first time only, and after pulling new db/ files
npm run dev -- -p 3117      # http://localhost:3117
```

`npm run migrate` creates the tables. Nothing runs it for you — it is not part of
`npm run build` and Vercel does not run it on deploy, so a fresh database has no
tables until you do. The site still starts without it and the home page still
renders, but the gallery, guestbook, signup and `/admin` all fail, which reads as
a broken site rather than a missing step. It is safe to re-run: each file in
`db/` is applied once and skipped afterwards.

Port 3117 rather than the default 3000, because Grafana is usually on 3000 on the originally
development machine. Any free port works.

| Command | What it does |
|---|---|
| `npm run dev` | Development server, hot reload |
| `npm run build` | Production build — run this before pushing anything structural |
| `npm start` | Serve the production build locally |
| `npm run lint` | ESLint |
| `npm test` | Unit tests — Node's built-in runner, no dependencies |
| `npm run migrate` | Apply any unapplied `.sql` file in `db/` |
| `npm run archive` | Copy any approved photo not yet backed up to R2 |
| `npm run archive -- --pull` | Download the whole archive to `media/archive/` |
| `npm run dimensions` | Fill in pixel size for any photo missing it (`-- --all` re-measures) |

The tests cover the parts where a mistake is expensive and silent: that a rejected
Turnstile token is refused even under the lenient outage policy, that an unset
`ADMIN_PASSWORD` lets nobody in, and that a failing notification never throws. Run them
before pushing anything touching `src/lib/`.

---



---

## What's where (file organization)

The site is roughly "the content" (all in `content/`) and "the technical stuff" (all the other folders). In particular we have the following hierarchy of files:

```
content/
  obituary.md · service.md    The written pages
  recipes/                    Joe's original recipe files + _titles.json
db/                           Numbered .sql migrations, applied by npm run migrate
scripts/                      migrate.mjs, archive.mjs
tests/                        Unit tests (npm test)
src/app/
  layout.tsx                  Shell, fonts, metadata, Open Graph
  nav.tsx                     Site header (client component — needs the current path)
  page.tsx                    Home: portrait, name, dates, obituary
  not-found.tsx               Styled 404
  tokens.css                  The entire design system
  fonts.ts · fonts/           Source Serif 4, EB Garamond, IBM Plex Mono
  icon.png · apple-icon.png   Favicons
  service/ recipes/           Content pages
  guestbook/ photos/ subscribe/   Forms — page + form.tsx + actions.ts each
  admin/                      Password-gated moderation
src/lib/
  content.ts recipes.ts       Read and render the written content
  db.ts                       Lazy Neon client (pooled connection)
  guestbook.ts photos.ts      Queries
  turnstile.ts                Bot verification, with the outage policy
  cf-images.ts                Direct uploads and delivery URLs
  notify.ts                   Admin emails via Resend
  admin-password.ts           Password + token crypto (no Next imports, so testable)
  admin-auth.ts               Cookie session on top of it
  r2.ts archive.ts            Photo originals archived to R2 on approval
  ip.ts sections.ts
public/                       Only what ships: portrait-hero.jpg, og.jpg
media/                        Working files. GITIGNORED, never deployed.
```

Choices worth knowing before you fight them:

- **No Tailwind.** The design is typography-driven and lives in `tokens.css`. One less
  build dependency, and it survives the eventual freeze to static (`ARCHITECTURE.md` →
  "Data model").
- **Fonts are committed as files**, not fetched by `next/font/google`. That loader
  downloads from Google at *build* time, so a rebuild in year three can fail if the API
  changes. `ARCHITECTURE.md` → "Design system".
- **Visitor photos are served straight from Cloudflare Images, never through
  `next/image`.** Next's optimizer runs `sharp`, and these files come from strangers.
  This is a security boundary, not a preference. `ARCHITECTURE.md` → "Security boundaries".
- **Visitor text is never rendered as HTML.** `dangerouslySetInnerHTML` is only ever used
  for our own Markdown in `content/`.
- **`admin-password.ts` is separate from `admin-auth.ts`** because the latter imports
  `next/headers` and so can't be tested outside the framework.

---

## The services used

| What | Where | Status |
|---|---|---|
| Domain | Cloudflare Registrar | Live. 10 years, auto-renew on |
| DNS | Cloudflare | Live. Records are **grey cloud** — see below |
| Hosting | Vercel | Live, free tier, auto-deploys from GitHub |
| Database | Neon (Postgres 18, `us-east-1`) | Live, free tier |
| Photo serving | Cloudflare Images | Live. **Starter Bundle, $5/mo** — why the bundle and not pay-as-you-go: `historic/HISTORY.md` §2 |
| Bot defence | Cloudflare Turnstile | Live on all three forms |
| `contact@` | Cloudflare Email Routing | Live, forwards to the memorial Gmail |
| Admin notifications | Resend | Live, from `notifications.joeweisman.org` |
| Uptime alerts | UptimeRobot | Live, free tier. Two monitors — see below |
| Photo archive | Cloudflare R2 | Live, free tier. Bucket `joeweisman-photos`, private |
| Visitor counts | Cloudflare Web Analytics | Free. Off unless `NEXT_PUBLIC_CF_ANALYTICS_TOKEN` is set |

Running cost is about **$5/month plus the domain**: everything is on a free tier except
Cloudflare Images.

### Visitor counts

Cloudflare Web Analytics, chosen over Vercel's for two reasons: Vercel's Hobby tier keeps
only **one month** of history, so next year you could not answer "how many people came
around the service", and Cloudflare's beacon [stores no cookie, no localStorage and no IP
address](https://developers.cloudflare.com/web-analytics/faq/). On a site where people
leave messages about someone they have lost, that is worth more than the extra detail.

To turn it on: Cloudflare dashboard → **Web Analytics** → **Add a site** → copy the token
out of the `data-cf-beacon` snippet → set `NEXT_PUBLIC_CF_ANALYTICS_TOKEN` in Vercel and
redeploy. Works with the grey-cloud DNS-only setup; no proxying needed.

Leave the variable unset and no beacon is loaded at all. That is the default, and the
right one for a fork.

Note `"spa": false` in the snippet. Left on, the beacon overrides `history.pushState` to
count client-side route changes — the same API Next's router drives. Real page loads are
enough for a five-page site, and every link into a form is a full load anyway.

### Uptime monitoring

Two monitors, because either alone would miss something:

| Monitor | Watches | Catches |
|---|---|---|
| `https://joeweisman.org/api/health` | status code | The **database being unreachable.** The home page is static, so Vercel keeps serving it with a 200 while the guestbook and gallery are broken — a homepage check would report all-clear through the outage that matters most. |
| `https://joeweisman.org` keyword `Joe Weisman` | page content | A Vercel error page returning 200. Checking for his name means the alert fires when the page is *wrong*, not merely reachable. |

`/api/health` returns 503 only for a real visitor-facing outage — the database being down,
or Turnstile's secret missing in production, which makes every form refuse submissions.
Optional services that are merely switched off appear under `degraded` in the body and do
**not** trip the alert. A monitor that fires for non-outages gets ignored, and then the
real one is missed too.

It deliberately makes no live calls to Cloudflare Images or Resend: doing so every five
minutes would spend quota and turn their blips into our alerts.

**SSL and domain expiry monitoring are paid features** despite what UptimeRobot's pricing
page implies, so they are not in use. That is an acceptable gap: both monitors above run
over HTTPS, so an expired certificate fails their TLS handshake and both alert within five
minutes. What is lost is only the advance warning — Vercel renews Let's Encrypt certs
automatically, so a lapse would be a surprise either way.

Domain expiry is different, and no monitor covers it: see the note below.

### Getting alerts to more than one person

UptimeRobot's free plan has **zero notify seats** — alerts only ever go to the account
owner's own address, and adding recipients starts at $9/month. That is poor value against
a site costing about $60/year to run.

**So there is more than one UptimeRobot account, each watching the same two URLs:**

| Account | Alerts | Purpose |
|---|---|---|
| `joeweismanmemorial@gmail.com` | the memorial Gmail | The project's own monitoring |
| Jazz's personal Google account | push to Jazz's phone | Survives the memorial Gmail being lost |

Push notifications through UptimeRobot's mobile app go to the account owner without
consuming a notify seat, so they work on the free plan — and an outage that buzzes a phone
gets noticed, where an email may sit unread for days.

Two free accounts beat one paid seat here, and not only on price. Vercel, Neon and
UptimeRobot all sign in through the memorial Gmail, so a single account would mean the
monitoring dies in the same event as the thing it monitors — nobody would be told. An
independently-owned second account has no such shared dependency.

Anyone else who should be alerted (Luke) can add their own free account the same way; the
monitors take a minute to recreate.

**When adding an account, recreate both monitors** — the health endpoint *and* the keyword
check. An account watching only the home page would report all-clear through a database
outage.

If two dashboards ever becomes tiresome, the alternative is a Gmail filter forwarding
`From: uptimerobot.com` to other addresses. Simpler to run, but it keeps the shared
dependency on the Gmail, which is the thing the second account exists to avoid.

Nothing here can warn about **domain expiry**. It works right up until it doesn't. The
registration runs ten years; the calendar reminder for year nine is the only defence.

> **Resend must never verify `joeweisman.org` itself.** Cloudflare Email Routing owns the
> apex MX records to deliver `contact@`, and Resend's MX would collide with them and break
> inbound mail. Only the `notifications.joeweisman.org` subdomain is verified, which keeps
> the two systems apart.

### How each account is logged into

Everything is under `joeweismanmemorial@gmail.com` rather than a personal address —
except the GitHub repo, which is on Jazz's personal account deliberately (the repo isn't
load-bearing for uptime; losing it means you can't *change* the site, not that it goes down).

| Account | Sign-in method |
|---|---|
| Cloudflare | Its own account — email + password, using the memorial Gmail |
| Resend | Its own account, using the memorial Gmail |
| Vercel | **Google OAuth** via the memorial Gmail |
| Neon | **Google OAuth** via the memorial Gmail |
| UptimeRobot | **Google OAuth** via the memorial Gmail |
| GitHub | Jazz's personal account (`jazzlw`) |

> **⚠️ The Gmail is a single point of failure for Vercel, Neon and UptimeRobot.**
> All three sign in through Google, so losing access to `joeweismanmemorial@gmail.com`
> means losing the host, the database, and the thing that would have told you they were
> down — with no separate password to fall back on for any of them.
>
> That last part is the nasty bit: the monitoring dies in the same event as the site, so
> nobody gets told. Cloudflare and Resend are safer, having their own credentials.
>
> Mitigate: put a recovery phone and a recovery email on the Google account, save the
> 2FA backup codes somewhere a family member can reach, and make sure at least one other
> person can get into that Gmail.
>
> The alerting half of this is already handled — there is a second UptimeRobot account
> under a personal Google account, so an outage still reaches someone even if the
> memorial Gmail is gone. See "Getting alerts to more than one person" above.

Secrets live in Vercel's environment variables, never in the repo. `.env.example` lists
what's needed; copy it to `.env.local` for development.

> **⚠️ Adding an environment variable in Vercel does nothing until you redeploy.**
> Values are injected into a deployment when it is built, so the running one keeps
> whatever it was built with. There is no error — the code simply behaves as though
> the variable is unset, which for this project means `/admin` refuses everyone,
> Turnstile refuses every submission, and IP hashing silently stops.
>
> After adding or changing any variable: **Deployments → latest → ⋯ → Redeploy.**
> This already cost one debugging round with `ADMIN_PASSWORD`.

Two variables are needed for the guestbook and admin, neither of which can be
recovered if lost:

| Variable | Notes |
|---|---|
| `ADMIN_PASSWORD` | The only way into `/admin`. The session cookie is derived from it, so changing it signs everyone out. |
| `IP_HASH_SALT` | Changing it orphans every existing hash and resets rate limiting. Set once. |



---

## First-time deployment setup

Done once. Recorded here so it isn't lost.

1. **Create the Vercel project** — import the GitHub repo at vercel.com. Next.js is
   detected automatically; no configuration needed.
2. **Add the domain** — Vercel → Settings → Domains → `joeweisman.org`. Add `www` as
   well and let Vercel redirect between them.
3. **Read the DNS records off the Vercel dashboard.** Do not copy values from a blog
   post — the CNAME target is specific to your project (something like
   `d1d4fc829fe7bc7c.vercel-dns-017.com`), not the old shared `cname.vercel-dns.com`.
4. **Create those records in Cloudflare with the proxy OFF — grey cloud, "DNS only."**

   > This is the step that goes wrong. With the orange cloud on, Cloudflare terminates
   > SSL itself, Vercel can't complete the Let's Encrypt handshake, and the domain sits
   > at "Invalid Configuration" forever. Nothing is lost by turning it off: Vercel's own
   > edge network does the CDN and certificate work.

5. **Wait a few minutes** for the certificate. Because the domain is registered at
   Cloudflare, the nameservers were always Cloudflare's — there's no nameserver
   propagation to wait out, only records.

### CORS on the R2 bucket — required for non-photo submissions

Files that aren't pictures go **straight from the visitor's browser to R2**, using a
presigned URL, because a Vercel server action caps its request body around 1 MB and a
recording or a scan is bigger than that. A cross-origin `PUT` is not a "simple" request,
so the browser sends a preflight first — and without a CORS policy R2 answers `403` with
no CORS headers and the upload never happens.

Photographs are unaffected: they go to Cloudflare Images, which sets its own CORS.

Cloudflare dashboard → **R2** → the bucket → **Settings** → **CORS policy** → *Add*:

```json
[
  {
    "AllowedOrigins": [
      "https://joeweisman.org",
      "https://www.joeweisman.org",
      "http://localhost:3117"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

`PUT` only — nothing needs to read from the bucket in a browser, and it must stay that
way. The archive is private; the admin download route reads it server-side.

Check it from a terminal — `access-control-allow-origin` should come back set:

```bash
curl -s -o /dev/null -D - -X OPTIONS \
  -H 'Origin: https://joeweisman.org' \
  -H 'Access-Control-Request-Method: PUT' \
  "https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com/<R2_BUCKET>/artifacts/x" \
  | grep -i 'access-control\|^HTTP'
```

Until this is set, sending a non-photo file fails with a connection error that points the
visitor at `contact@joeweisman.org`. Nothing is silently lost, but nothing arrives either.

---

## Things that will break this site, in order of likelihood

1. **A lapsed domain.** Registered for 10 years to make this unlikely. Set a calendar
   reminder for year nine.
2. **A dead credit card** on any of the accounts above.
3. **Nobody noticing it's down.** Hence UptimeRobot — an outage nobody sees for three
   weeks is the real failure mode, not an outage.

## Backups

The written content needs none — it is in git. The photographs do, because they are
irreplaceable and exist nowhere else.

An approved photo is copied to R2 automatically. That is still two Cloudflare products in
one account, so periodically run:

```bash
npm run archive              # catch anything the automatic copy missed
npm run archive -- --pull    # download everything to media/archive/
```

and put the result somewhere that is neither Cloudflare nor this laptop. That third copy
is the one that survives losing an account.

Worth doing the same for the database occasionally: `pg_dump` from Neon, kept alongside.
