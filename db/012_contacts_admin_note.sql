-- An admin-only annotation on a contact, separate from `note` (what the
-- visitor themselves wrote when they signed up or RSVP'd).
--
-- Editable from /admin/contact, included in the mailing-list CSV export, but
-- never written to contact_log — that table is specifically the record of
-- what visitors did, not what an admin wrote about them afterward.
alter table contacts add column if not exists admin_note text;
