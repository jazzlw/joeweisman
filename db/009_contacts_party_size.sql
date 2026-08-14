-- How many people an RSVP covers.
--
-- A column on `contacts`, same reasoning as rsvp_at in the migration before
-- this one: it's an attribute of the signup, not a second entity.
--
-- Nullable rather than defaulting to 1: null means "didn't say," which is a
-- different fact from "said one." The admin headcount treats a blank RSVP as
-- one person, which is the right default for planning food and chairs, but
-- the distinction is worth keeping in the data even if nothing reads it yet.
alter table contacts add column if not exists party_size int
  check (party_size is null or (party_size between 1 and 50));
