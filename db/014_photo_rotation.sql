-- How far to turn a photograph before showing it.
--
-- Some arrive sideways: the pixels themselves are rotated, not merely tagged
-- with an orientation the pipeline could honour, so there is nothing to read
-- and correct automatically. An admin says which way is up.
--
-- Degrees clockwise rather than a boolean or an enum, because that is what
-- Cloudflare's `rotate` option takes and it keeps the column readable in a
-- query. 0 is the overwhelming majority and costs nothing: a photo with no
-- rotation is served through the same named variant as before.
alter table photos add column if not exists rotation smallint not null default 0
  check (rotation in (0, 90, 180, 270));
