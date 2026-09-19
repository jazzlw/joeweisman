-- A fourth provenance for taken_year: somebody worked it out.
--
-- 004 named three sources and ranked them by how much they can be trusted.
-- This is the one below all of them. Twenty-two photographs arrived with no
-- year at all, and the people who would know are the people this site is for,
-- so the year on those was reasoned out from what is in the frame — who is in
-- it and how old they look, whether it is film or digital, which dated
-- photographs sit either side of it.
--
-- Worth recording as its own source rather than writing the number in and
-- saying nothing, because a year nobody can vouch for should not sit on the
-- page looking exactly like one somebody remembers. Everything that renders a
-- year shows an approximate one as "~1971".
alter table photos drop constraint if exists photos_taken_source_check;
alter table photos add constraint photos_taken_source_check
  check (taken_source is null or taken_source in ('submitter', 'exif', 'admin', 'guess'));
