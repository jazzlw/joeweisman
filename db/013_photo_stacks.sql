-- A photo can continue the one shown right before it on the admin page — a
-- bundle of a few images of the same thing (several angles of an object, a
-- multi-page document), paged through from one tile rather than each
-- showing separately in the gallery grid.
--
-- Self-referencing rather than a separate "stacks" table: a stack is just a
-- chain of photos, and every photo already has a natural place in one
-- (nowhere, or right after whichever one it links to). The gallery query
-- shows only photos with stack_prev_id null as tiles, then walks the chain
-- for the rest — see getApprovedPhotos in src/lib/photos.ts.
alter table photos add column if not exists stack_prev_id uuid references photos(id);

alter table photos add constraint photos_stack_prev_not_self
  check (stack_prev_id is null or stack_prev_id <> id);

-- Each photo can be at most one other photo's predecessor, so a chain is
-- always a straight line, never a branch.
create unique index if not exists photos_stack_prev_unique
  on photos (stack_prev_id) where stack_prev_id is not null;
