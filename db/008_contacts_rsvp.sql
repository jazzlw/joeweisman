-- Who has said they are coming.
--
-- A column on `contacts` rather than a table of its own. An RSVP is a mailing
-- list signup that also said yes: the same person, the same address, and the
-- same "write to me about the memorial" consent. A second table would have
-- duplicated the address, the unsubscribe handling and the export, and then
-- needed reconciling every time someone appeared in both.
--
-- A timestamp rather than a boolean, because "when did they say so" is free to
-- keep and occasionally worth knowing — whether replies arrived after the email
-- went out, for one. NULL means they are on the list but have not RSVP'd, which
-- is the correct reading of every row that predates this.
alter table contacts add column if not exists rsvp_at timestamptz;

-- The admin dashboard counts these on every load. Not filtered on removed_at:
-- someone who unsubscribed and later said they are coming is still a head to
-- feed, and which of the two counts wants the filter is the caller's business.
create index if not exists contacts_rsvp on contacts (rsvp_at)
  where rsvp_at is not null;
