"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { db } from "@/lib/db";
import { verifyTurnstile } from "@/lib/turnstile";
import { notifyRsvp } from "@/lib/notify";

export type SubscribeState = {
  status: "idle" | "ok" | "error";
  message?: string;
};

// Deliberately permissive. The job is to catch typos and obvious nonsense, not to
// adjudicate RFC 5322 — a real address that a strict regex rejects is a person
// who doesn't hear about the service.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const MAX_EMAIL = 320;
const MAX_NAME = 120;
const MAX_NOTE = 500;
const MAX_PARTY_SIZE = 50;

export async function subscribe(
  _prev: SubscribeState,
  formData: FormData,
): Promise<SubscribeState> {
  // Honeypot: a field hidden from people but filled in by naive bots.
  if ((formData.get("website") as string | null)?.trim()) {
    // Report success so the bot learns nothing. Nothing is written.
    return { status: "ok", message: "Thank you — we'll be in touch when there's news." };
  }

  const email = (formData.get("email") as string | null)?.trim() ?? "";
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const note = (formData.get("note") as string | null)?.trim() ?? "";
  // Set by a hidden field on the RSVP page. Same form, same table, same consent —
  // an RSVP is a signup that also said yes, so the only difference is this flag
  // and the wording around it.
  const rsvp = formData.get("rsvp") === "1";

  if (!email) return { status: "error", message: "Please enter an email address." };
  if (email.length > MAX_EMAIL || !EMAIL.test(email)) {
    return { status: "error", message: "That doesn't look like an email address — please check it." };
  }
  if (name.length > MAX_NAME || note.length > MAX_NOTE) {
    return { status: "error", message: "That's longer than we can store. Please shorten it." };
  }

  // Only present on the RSVP form, and optional even there — left blank, the
  // admin headcount treats it as one person rather than blocking the submit.
  const partySizeRaw = (formData.get("partySize") as string | null)?.trim();
  let partySize: number | null = null;
  if (partySizeRaw) {
    const n = Number.parseInt(partySizeRaw, 10);
    if (!Number.isInteger(n) || n < 1 || n > MAX_PARTY_SIZE) {
      return { status: "error", message: `Number attending should be between 1 and ${MAX_PARTY_SIZE}.` };
    }
    partySize = n;
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  // "allow" on outage: if Cloudflare is unreachable, take the address anyway.
  // Losing a real person who wanted to hear about the service is worse than one
  // unverified row in a private list. A *rejected* token is still refused —
  // this only covers Cloudflare being down. The guestbook, which publishes
  // straight to the public page, will use "deny".
  const check = await verifyTurnstile(
    formData.get("cf-turnstile-response") as string | null,
    ip,
    "allow",
  );
  if (!check.ok) return { status: "error", message: check.error };

  try {
    // Signing up twice is a silent success, never an error, and the unique index
    // is on lower(email) so case doesn't create duplicates.
    //
    // `do update` rather than `do nothing`, because plenty of people who RSVP
    // are already on the list from weeks ago — `do nothing` would accept their
    // reply and record nothing, which is the worst outcome available.
    //
    // party_size is the odd one out: it takes the *new* value over the old,
    // rather than coalescing the other way, because the admin headcount reads
    // this column and a re-RSVP is usually someone updating their count —
    // keeping the first answer would silently freeze the headcount at a
    // number the person themselves has since corrected. name, note and
    // rsvp_at keep the opposite behaviour: they only ever fill in what was
    // blank, so the first rsvp_at (when they actually said yes) and an
    // earlier name or note survive a later submission that left them out.
    // The full note history lives in contact_log regardless of what happens
    // here.
    //
    // removed_at is deliberately untouched. Someone who asked to be taken off
    // the list has been honoured, and an RSVP doesn't silently undo that.
    await db()`
      insert into contacts (email, name, note, rsvp_at, party_size)
      values (${email}, ${name || null}, ${note || null}, ${rsvp ? new Date() : null}, ${partySize})
      on conflict (lower(email)) do update set
        rsvp_at    = coalesce(contacts.rsvp_at, excluded.rsvp_at),
        name       = coalesce(contacts.name, excluded.name),
        note       = coalesce(contacts.note, excluded.note),
        party_size = coalesce(excluded.party_size, contacts.party_size)
    `;

    // A second submission from the same address is usually an update — a
    // changed headcount, a new detail — and the coalesce above only ever
    // fills in what was blank on `contacts`, so a later note would otherwise
    // vanish silently instead of overwriting or appending. This is a plain
    // insert, never an upsert, so every submission survives as its own row
    // in the unified contact_log (mailing-list signups, RSVPs, photo and
    // file submissions, guestbook entries all land here — see the other
    // actions.ts files for their own inserts).
    await db()`
      insert into contact_log (type, email, name, detail, party_size)
      values (${rsvp ? "rsvp" : "subscribe"}, ${email}, ${name || null}, ${note || null}, ${partySize})
    `;
  } catch (e) {
    console.error("Failed to record a contact:", e);
    return {
      status: "error",
      message:
        "Something went wrong saving that. Please try again, or write to contact@joeweisman.org.",
    };
  }

  if (rsvp) {
    after(() => notifyRsvp({ email, name: name || null, note: note || null, partySize }));
    return {
      status: "ok",
      message:
        "Thank you — we have you down as coming, and we'll write when there's anything else to say.",
    };
  }

  return { status: "ok", message: "Thank you — we'll be in touch when there's news." };
}
