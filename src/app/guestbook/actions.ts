"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { notifyGuestbookEntry } from "@/lib/notify";
import { db } from "@/lib/db";
import { hashIp } from "@/lib/ip";
import { recentCountForIp } from "@/lib/guestbook";
import { verifyTurnstile } from "@/lib/turnstile";

export type GuestbookState = { status: "idle" | "ok" | "error"; message?: string };

const MAX_NAME = 120;
const MAX_MESSAGE = 5000;
const MAX_EMAIL = 320;
/** Entries per IP per hour. High enough that a family posting together is fine. */
const HOURLY_LIMIT = 5;

export async function signGuestbook(
  _prev: GuestbookState,
  formData: FormData,
): Promise<GuestbookState> {
  if ((formData.get("website") as string | null)?.trim()) {
    // Honeypot hit. Report success so the bot learns nothing; write nothing.
    return { status: "ok", message: "Thank you for writing." };
  }

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const message = (formData.get("message") as string | null)?.trim() ?? "";
  const email = (formData.get("email") as string | null)?.trim() ?? "";

  if (!name) return { status: "error", message: "Please add your name." };
  if (!message) return { status: "error", message: "Please write a message." };
  if (name.length > MAX_NAME) {
    return { status: "error", message: "That name is longer than we can store." };
  }
  if (message.length > MAX_MESSAGE) {
    return {
      status: "error",
      message: `That's longer than we can store — ${MAX_MESSAGE.toLocaleString()} characters is the limit.`,
    };
  }
  if (email.length > MAX_EMAIL) {
    return { status: "error", message: "That email address is too long." };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ipHash = hashIp(ip);

  // "deny" on outage, unlike the signup form: entries here publish straight to
  // a public page, so an unverified one is visible to everyone who visits.
  const check = await verifyTurnstile(
    formData.get("cf-turnstile-response") as string | null,
    ip,
    "deny",
  );
  if (!check.ok) return { status: "error", message: check.error };

  try {
    if ((await recentCountForIp(ipHash)) >= HOURLY_LIMIT) {
      return {
        status: "error",
        message:
          "That's several messages in a short time. Please wait a little while, or write to contact@joeweisman.org.",
      };
    }

    // Published immediately — historic/HISTORY.md §1. A tribute that vanishes
    // on submit reads as broken to the person who wrote it, and they don't come back.
    await db()`
      insert into guestbook_entries (name, message, email, ip_hash, status)
      values (${name}, ${message}, ${email || null}, ${ipHash}, 'published')
    `;

    // Every visitor action lands in contact_log, not just mailing-list and
    // RSVP signups — see subscribe/actions.ts for the rest of the writers.
    await db()`
      insert into contact_log (type, email, name, detail)
      values ('guestbook', ${email || null}, ${name}, ${message})
    `;
  } catch (e) {
    console.error("Failed to record a guestbook entry:", e);
    return {
      status: "error",
      message:
        "Something went wrong saving that. Please try again, or write to contact@joeweisman.org.",
    };
  }

  revalidatePath("/guestbook");

  // after() runs once the response has been sent, so the writer isn't kept
  // waiting on an email round trip. It also survives the serverless function
  // returning, which a bare floating promise would not.
  after(() => notifyGuestbookEntry({ name, message, email: email || null }));

  return { status: "ok", message: "Thank you for writing." };
}
