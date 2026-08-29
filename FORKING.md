# Setting up your own memorial site from this fork

This file is written for you, if you want to make a site like the Joe Weisman memorial site. If you have not yet read it, we recommend reading `content/how-to-make-this.md` for a more friendly overview of how to use this file to make a site.

This file is designed to help you do this with the assistance of Claude Code. In particular, we wrote this file so you and Claude Code can both read it. Claude Code, after reading this file, can walk you through setting up and customizing your own version of the Joe Weisman site for your own loved one.

The first step is to "fork" the repository, meaning you will copy all the contents that run our site into a new place that will run yours.

Once the original site is forked, the information in this file will help Claude Code walk you through personalizing and deploying what you have copied, one step at a time, checking in after each one. It will not do everything silently in one long run so that you can control the process and understand what all the pieces are.



## What you'll end up with

A site like https://joeweisman.org/. The core elements are the following:

* an obituary
* a service-details page
* a photo gallery with public submissions and admin moderation
* a guestbook
* a mailing-list signup.

Visitors can also send files that aren't photographs — a recording, a scan, a letter — which go to a private
archive only you can see, never onto the site.

The original site for Joe Weisman also had a few extra things that you may or may not keep as you like:

* a second gallery for things the person made or owned.
* A repository of recipes (in `content/recipes/`)

The artifacts gallery and recipe repository are both optional — skip either if it doesn't apply.

Running cost is about **$5/month plus a domain name** (`README.md` → "The
services" has the exact breakdown). It's built to need no ongoing technical
maintenance.



## If something goes wrong

Just describe the problem to Claude Code. It already has the full context of how this project is built and why, from `CLAUDE.md`, `AGENTS.md`, and `ARCHITECTURE.md`.

Also, we would love to hear if this worked for you, and what was hard if something was. Please go to our original repository and post issues and requests for help, or email us directly.



## How to get started

If you are the person who forked this: you don't need to read the rest of
this file yourself. Just tell Claude Code:

> Read FORKING.md and walk me through setting this up.



## Instructions to Claude

If you are Claude Code reading this: confirm what the person wants before making changes, and prefer
asking over guessing when something below is ambiguous for their situation.



# Order of operations

1. **Get a GitHub account and fork the joeweisman repository.** Claude, this may involve some explanation to the user about what is happening.

   Once it's cloned locally, do two one-time things so you can pull our future
   fixes later without them overwriting anything you've personalized:

   ```bash
   git remote add upstream https://github.com/jazzlw/joeweisman.git
   git config merge.ours.driver true
   ```

   The first lets you fetch our updates. The second makes the files listed in
   `.gitattributes` — your content, your photos, your icons — permanently
   yours: merging our updates will never overwrite them, no matter what we
   change on our side. See "Staying in sync with our updates" near the end of
   this file for how that's used going forward.

2. **Get a blank version deployed first**, before touching any content. That
   proves the hosting, database, and image pipeline all work before there's
   anything to lose. Follow `README.md` → "First-time deployment setup" and
   "Running it locally" for the account creation and environment variables —
   Vercel, Neon (Postgres), Cloudflare (domain, Turnstile, Images), and
   optionally Resend. `.env.example` lists every variable needed.

3. **Create the database tables** — run `npm run migrate` once, with
   `DATABASE_URL` set in your `.env.local`.

   > Nothing does this for you. It is not part of the build and Vercel does
   > not run it on deploy. Skip it and the site still deploys and the home
   > page still loads — but the gallery, the guestbook, the signup form and
   > `/admin` will all fail, because the tables they read do not exist yet.
   > This is the most likely way to get stuck, and it looks like a broken
   > site rather than a missing step.

   Safe to re-run at any time: each file in `db/` is applied once and
   skipped thereafter. Run it again whenever you pull new changes.

4. **Personalize the content.** Everything below is safe to change and has
   no effect on the invariants in `AGENTS.md`:
   - `src/site.config.ts` — `SITE_NAME` and `SITE_DESCRIPTION` (used in the
     page title and social-share previews).
   - `content/obituary.md` — the home page.
   - `content/service.md` — service details; leave its placeholders
     (`XXXX`) until you have real dates, they only warn, never break a
     build.
   - `public/portrait-hero.jpg` and `public/og.jpg` — the portrait and the
     social-share image (1200×630). The share image is the one people see
     when the link is posted to Facebook, so it is worth getting right.
   - `src/app/icon.png` (512×512) and `src/app/apple-icon.png` (180×180) —
     the little picture in the browser tab, and the one iPhones use when
     somebody saves the site to their home screen. Both are Joe's initials,
     **JW**, set in the site's display serif, cream on the dark background.
     Swap the letters for your person's and replace both files, keeping the
     filenames and roughly those sizes: Next finds them by name, so there is
     no code to change and no `favicon.ico` involved.

     Worth doing even though it is small. Initials look deliberate rather
     than left over, so nobody thinks to mention that the tab on your
     person's site still says someone else's name.
   - `src/app/tokens.css` — colors, if you want a different palette. Check
     contrast in both light and dark mode before committing to one — see the
     note in `AGENTS.md`.
   - `content/how-to-make-this.md` — this page is about *us* making this for
     Joe. Simplest: replace it with the provided
     `content/how-to-make-this-fork-template.md` — copy its contents over
     `how-to-make-this.md` (or delete the old file and rename the template),
     and delete the template file afterward. It's already written to work for
     anyone forking this, crediting Jazz, Luke, and Joe as the source. Rewrite
     it further with your own story if you'd rather, or drop it entirely
     along with its link in `src/app/footer.tsx`.
   - `PLAN.md` — Joe-specific to-dos (a photo deadline, a QR code for his
     program). Not code, safe to ignore, delete, or replace with your own.
   - `content/recipes/` — remove this section and its nav entry
     (`src/lib/sections.ts`) entirely if it doesn't apply to your person. The
     same goes for the artifacts gallery (`src/app/artifacts/`), which is for
     things the person made or owned.

5. **Fix your repository's About panel on GitHub.** This one is not in the code
   and is easy to miss: a fork inherits our description and, more importantly,
   **our website link**, so your repository will advertise Joe's site until you
   change it.

   On your fork's GitHub page, click the gear icon beside **About** (top right
   of the sidebar), then set:
   - **Website** — your own site's address. This is the one that matters; left
     alone it sends anyone who finds your repository to joeweisman.org.
   - **Description** — your person's name and dates.

   Claude, raise this yourself once their site is deployed; nothing in the
   repository will remind them, and the inherited link looks deliberate.

6. **Set the two required environment variables** in Vercel (`ADMIN_PASSWORD`,
   `IP_HASH_SALT`) — see `README.md` for what each does and why redeploying
   after setting them matters.

7. **Optional: visitor counts.** Leave `NEXT_PUBLIC_CF_ANALYTICS_TOKEN` unset
   and no analytics of any kind is loaded — that is the default, and it means a
   fork never reports to our account. `README.md` → "Visitor counts" covers
   turning it on with your own free Cloudflare token if you want it.

8. **If you want people to be able to send files that aren't photographs**
   (recordings, scans, documents), add a CORS policy to your R2 bucket —
   `README.md` → "CORS on the R2 bucket" has the exact JSON. Photograph
   uploads do not need this; those go to Cloudflare Images. Without it, a
   non-photo upload fails with a connection error.

9. **Test the golden path before sharing the link**: submit a guestbook
   entry, upload a photo, approve it from `/admin`, and sign up for the
   mailing list yourself.

10. **Explain to the user about backups:** Read the `README.md` file and ensure user understands how to protect precious information in the years to come.

## Staying in sync with our updates

We'll keep fixing bugs and adding features after you fork — the Cloudflare
Turnstile human-check has already changed once. To pull those in:

```bash
git fetch upstream
git merge upstream/main
```

Because of the one-time `git config merge.ours.driver true` from step 1, this
never touches the files listed in `.gitattributes` — your content, your
photos, your icons, `src/site.config.ts`. Everything else is application
code, which merges normally, and that's how a fix reaches you automatically
without you having to redo it by hand.

One edge case: if you've *deleted* a file we still maintain (say you dropped
`content/recipes/` entirely and we later touch something inside it), git will
ask you to resolve a "modify/delete" conflict once — tell it to keep the
deletion. That only happens for files you've removed outright, never for ones
you've simply edited.

## Reference

- `README.md` — running locally, deploying, moderating `/admin`, the full
  list of services and what each costs.
- `ARCHITECTURE.md` — what the site is: stack, data model, security
  boundaries, design system, as they stand today. Read this before any
  structural change.
- `AGENTS.md` — the technical invariants this codebase depends on (visitor
  content is never rendered as HTML, no Tailwind, nothing animates, and a
  few others) — worth knowing before changing anything, not just for Claude.
- `PLAN.md` — what's still ahead for *this* site (Joe's), not yours. Skip it
  unless you're curious.
- `historic/` — the original proposal and the full decision history: why
  each major choice was made, and what was tried and rejected instead.
  Entirely optional reading; nothing here depends on it.

