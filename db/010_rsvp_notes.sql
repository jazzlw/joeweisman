-- A log of every RSVP submission, not just the latest.
--
-- contacts holds one row per email — right for a mailing list, wrong for
-- notes: resubmitting an RSVP (a changed headcount, a new detail) only ever
-- filled in what was blank, so a second note silently vanished instead of
-- being added. That's a real loss — someone who RSVPs again close to the
-- date is usually updating something that matters.
--
-- Append-only and deliberately dumb: no foreign key to contacts, no upsert,
-- just one new row per submission. Whether it collates with contacts is a
-- question for whoever reads the export, not a constraint the schema enforces.
create table if not exists rsvp_notes (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  name       text,
  note       text,
  party_size int,
  created_at timestamptz not null default now()
);

create index if not exists rsvp_notes_recent on rsvp_notes (created_at);
