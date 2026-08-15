-- Generalizes rsvp_notes into one append-only log of every visitor action on
-- the site, not just RSVPs: mailing-list signups, photo and artifact
-- submissions, non-photo file uploads, and guestbook entries. One row per
-- submission event, not per underlying photo or file — a batch of twelve
-- photos in one upload is one row with count = 12, the same way the rest of
-- the site already treats a submission as one action even when it carries
-- several files.
alter table rsvp_notes rename to contact_log;
alter index rsvp_notes_recent rename to contact_log_recent;

alter table contact_log add column if not exists type text;
update contact_log set type = 'rsvp' where type is null;
alter table contact_log alter column type set not null;
alter table contact_log add constraint contact_log_type_check
  check (type in ('subscribe', 'rsvp', 'photo', 'artifact', 'file', 'guestbook'));

-- Renamed from `note`: this column now also holds a photo caption, a
-- guestbook message, or a file description, depending on `type`.
alter table contact_log rename column note to detail;

-- Only an RSVP requires an email; a photo, file, or guestbook submission
-- often has none.
alter table contact_log alter column email drop not null;

-- How many items one submission covered — photos or files in a batch. Null
-- where "how many" doesn't apply (subscribe, rsvp, guestbook).
alter table contact_log add column if not exists count int
  check (count is null or count > 0);

create index if not exists contact_log_type on contact_log (type, created_at);
