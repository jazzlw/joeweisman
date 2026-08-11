# Plan — what's still ahead

Forward-looking only. What the site already is: `ARCHITECTURE.md`. Why past
decisions were made: `historic/HISTORY.md`. How to run and moderate the live
site: `README.md`.

## Before the service

- **Put a soft deadline on the photos page** — "send photos by [date] to be
  included in the service." Submissions are material for the slideshow,
  memory table, or printed board, and that only works if people know there's
  a cutoff.
- **QR code** for the printed program, linking to the site (or straight to
  `/photos/add`).
- **Freeze content a few days out** and verify the site on a real phone over
  cellular, not just wifi.

## After the service

- Add photos from the day itself.
- Export the mailing list and send the first update.
- Expect the largest burst of guestbook entries and photo submissions in the
  two weeks following — check the moderation queue daily during that window.

## Ongoing

- **Gallery sort order.** Curated photos currently lead, then submissions run
  newest-first. Chronological order by `taken_year` is the better arrangement
  once enough of those are confirmed (see `src/lib/photos.ts`) — worth
  revisiting once most approved photos have a real date rather than a
  submission timestamp.
- **Handoff notes** for whoever inherits running this, beyond what's already
  in `README.md` — who has the passwords, who pays for what, and where the
  physical/digital originals ended up.

## Year two: freeze to static

Submissions will stop, probably within six months of the service. When they
do:

1. Snapshot the guestbook and both galleries to plain HTML.
2. Delete the database (Neon, and its connection string).
3. Point the domain at static hosting.

After that the site costs only the domain renewal and cannot break — no
vendor, no tier, no free-plan policy change, nothing to unpause, nothing to
monitor. This is the actual long-term durability answer, and it's why the
database was always treated as temporary scaffolding rather than permanent
infrastructure (see `ARCHITECTURE.md` → "Data model").
