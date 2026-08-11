-- Initial schema. See ARCHITECTURE.md → "Data model".
--
-- Deliberately small. This database is scaffolding for the active period, not
-- permanent infrastructure — the site freezes to static in year two (PLAN.md
-- has that plan), so the shape needs to flatten cleanly to HTML.

-- Guestbook. Note the default: published, not pending. A tribute that vanishes
-- on submit reads as broken to the person who wrote it, so entries go live
-- immediately and are removed after the fact if necessary.
create table if not exists guestbook_entries (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text,                                    -- optional, never shown publicly
  message    text not null,
  status     text not null default 'published'
             check (status in ('published', 'removed')),
  ip_hash    text,                                    -- sha256(ip + IP_HASH_SALT), salted
  created_at timestamptz not null default now()
);

-- Newest first is the only read pattern the public page has.
create index if not exists guestbook_published_recent
  on guestbook_entries (created_at desc)
  where status = 'published';


-- Photos. Curated ones are inserted as 'approved' with a sort_order so they lead
-- the gallery; submissions arrive as 'pending'. storage_ref is an R2 key before
-- approval and a Cloudflare Images id after.
create table if not exists photos (
  id           uuid primary key default gen_random_uuid(),
  submitter    text,                                  -- null for curated photos
  email        text,                                  -- optional, private
  caption      text,
  storage_ref  text not null,
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'rejected')),
  sort_order   int,
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz
);

create index if not exists photos_gallery
  on photos (sort_order nulls last, created_at)
  where status = 'approved';

create index if not exists photos_moderation_queue
  on photos (created_at)
  where status = 'pending';


-- Address collection. No confirmation tokens, no unsubscribe machinery, no
-- status enum — sending happens by hand from Gmail (ARCHITECTURE.md → "Stack").
create table if not exists contacts (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  name       text,
  note       text,                                    -- "how did you know Joe", optional
  created_at timestamptz not null default now(),
  removed_at timestamptz                              -- set by hand when someone asks off
);

-- Case-insensitive, so a duplicate signup can be swallowed with
-- `on conflict do nothing` rather than shown as an error.
create unique index if not exists contacts_email_key
  on contacts (lower(email));
