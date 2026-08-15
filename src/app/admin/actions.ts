"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { deleteImage } from "@/lib/cf-images";
import { archivePhotoQuietly } from "@/lib/archive";
import { deleteObject } from "@/lib/r2";
import { parseYear } from "@/lib/exif";
import { parseKind } from "@/lib/photos";
import { checkPassword, grantSession, revokeSession, isAdmin } from "@/lib/admin-auth";

export type LoginState = { error?: string };

/**
 * Refresh everywhere a photograph is visible.
 *
 * Both galleries, because a photograph can move between them and because
 * approving one has to clear the page it lands on — not the page it came from.
 * Listing them here rather than at each call site means adding a third gallery
 * is one edit instead of four.
 */
function revalidateGalleries(): void {
  revalidatePath("/admin");
  revalidatePath("/photos");
  revalidatePath("/artifacts");
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = (formData.get("password") as string | null) ?? "";
  if (!checkPassword(password)) {
    // Deliberately vague: no hint about whether the password store is even set up.
    return { error: "That password isn't right." };
  }
  await grantSession();
  revalidatePath("/admin");
  return {};
}

export async function logout(): Promise<void> {
  await revokeSession();
  revalidatePath("/admin");
}

/**
 * Hide or restore a guestbook entry.
 *
 * Sets status rather than deleting: a removal made in haste, or a mistaken one,
 * should be reversible. Purging is a deliberate act done in the database.
 */
export async function setEntryStatus(id: string, status: "published" | "removed"): Promise<void> {
  // Every action re-checks. The page-level gate is not the security boundary —
  // server actions are callable directly by anyone who knows the endpoint.
  if (!(await isAdmin())) throw new Error("Not authorised.");

  await db()`update guestbook_entries set status = ${status} where id = ${id}::uuid`;
  revalidatePath("/admin");
  revalidatePath("/guestbook");
}

/**
 * Approve or reject a photo.
 *
 * Rejecting sets status and leaves the row and the image alone, so it can be
 * reconsidered. Purging is separate and deliberate.
 */
export async function setPhotoStatus(
  id: string,
  status: "pending" | "approved" | "rejected",
): Promise<void> {
  if (!(await isAdmin())) throw new Error("Not authorised.");

  await db()`
    update photos set status = ${status}, reviewed_at = now() where id = ${id}::uuid
  `;

  // Approving is the point at which the site commits to keeping a photograph, so
  // that is when it gets copied out of Cloudflare into R2.
  //
  // Deliberately awaited rather than deferred with after(). The first version
  // used after() so the click wouldn't wait on the copy — and the archive then
  // silently never happened in production, with no way to tell whether the
  // callback had run and failed or simply never run. For a backup of
  // irreplaceable photographs, "probably ran" is not good enough: an extra
  // second on a button an admin presses a few times a week buys certainty.
  //
  // Still never throws. A failed copy leaves archived_at null for
  // `npm run archive` to find, and must not stop the photo being approved.
  if (status === "approved") {
    await archivePhotoQuietly(id);
  }

  revalidateGalleries();
}

const MAX_CAPTION = 500;

/** Edit a photo's caption. */
export async function setPhotoCaption(id: string, caption: string): Promise<void> {
  if (!(await isAdmin())) throw new Error("Not authorised.");

  const trimmed = caption.trim().slice(0, MAX_CAPTION);
  await db()`update photos set caption = ${trimmed || null} where id = ${id}::uuid`;
  revalidateGalleries();
}

/**
 * Move a photograph between the two galleries.
 *
 * Submitters mark this themselves, and get it wrong in both directions — a
 * picture of the harpsichord filed as a photograph of Joe, a picture of Joe
 * standing beside it filed as an artifact. Neither is worth writing back to the
 * sender about; it's a one-click fix here.
 */
export async function setPhotoKind(id: string, kind: string): Promise<void> {
  if (!(await isAdmin())) throw new Error("Not authorised.");

  await db()`update photos set kind = ${parseKind(kind)} where id = ${id}::uuid`;
  revalidateGalleries();
}

/**
 * Set or clear the year a photograph was taken.
 *
 * Marked 'admin' so the source is visible: a hand-set year is the only one that
 * can be trusted over both the sender's guess and the file's metadata. Clearing
 * it hides the year rather than falling back to EXIF, because the reason to
 * clear is usually that EXIF was wrong.
 */
export async function setPhotoYear(id: string, year: string): Promise<void> {
  if (!(await isAdmin())) throw new Error("Not authorised.");

  const parsed = year.trim() === "" ? null : parseYear(year);
  if (year.trim() !== "" && parsed === null) {
    throw new Error("That isn't a plausible year.");
  }
  await db()`
    update photos set taken_year = ${parsed}, taken_source = ${parsed ? "admin" : null}
    where id = ${id}::uuid
  `;
  revalidateGalleries();
}

export async function purgePhoto(id: string): Promise<void> {
  if (!(await isAdmin())) throw new Error("Not authorised.");

  const [row] = (await db()`
    select storage_ref, archive_key from photos where id = ${id}::uuid and status = 'rejected'
  `) as { storage_ref: string; archive_key: string | null }[];
  // Only rejected photos can be purged, so an approved one can't go by mistake.
  if (!row) throw new Error("Only a rejected photo can be deleted.");

  await deleteImage(row.storage_ref);
  // "Delete for good" has to mean the archive too, or a purge would leave a
  // copy behind in R2 that nobody knows about.
  if (row.archive_key) await deleteObject(row.archive_key);
  await db()`delete from photos where id = ${id}::uuid`;
  revalidatePath("/admin");
}

/**
 * Mark an archived file as kept or not wanted.
 *
 * Nothing here is public, so this is triage rather than moderation: 'approved'
 * means someone has looked at it and wants it, 'rejected' means it can go. The
 * file stays in R2 either way until it is deliberately purged.
 */
export async function setArtifactFileStatus(
  id: string,
  status: "pending" | "approved" | "rejected",
): Promise<void> {
  if (!(await isAdmin())) throw new Error("Not authorised.");

  await db()`
    update artifact_files
    set status = ${status}, reviewed_at = now()
    where id = ${id}::uuid
  `;
  revalidatePath("/admin");
}

/** Delete a rejected file for good, removing it from R2 too. */
export async function purgeArtifactFile(id: string): Promise<void> {
  if (!(await isAdmin())) throw new Error("Not authorised.");

  const [row] = (await db()`
    select storage_key from artifact_files where id = ${id}::uuid and status = 'rejected'
  `) as { storage_key: string }[];
  // Only rejected files can be purged, so nothing goes by mistake.
  if (!row) return;

  await deleteObject(row.storage_key);
  await db()`delete from artifact_files where id = ${id}::uuid`;
  revalidatePath("/admin");
}

/**
 * Format a timestamp in Pacific time, e.g. "2026-08-13 6:25 PM PDT".
 *
 * The database stores UTC and a raw `toISOString()` used to go straight into
 * the CSV — technically correct, but a timestamp near midnight UTC lands on
 * the *previous* calendar day in Pacific, which is confusing enough that it
 * looks like a bug. `Intl.DateTimeFormat` handles the PST/PDT switch itself,
 * so this needs no extra dependency and no manual daylight-saving logic.
 */
function toPacific(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")} ${get("dayPeriod")} ${get("timeZoneName")}`;
}

function escCsv(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportContactsCsv(): Promise<string> {
  if (!(await isAdmin())) throw new Error("Not authorised.");

  const rows = (await db()`
    select email, name, note, created_at, rsvp_at, party_size
    from contacts
    where removed_at is null
    order by created_at
  `) as {
    email: string;
    name: string | null;
    note: string | null;
    created_at: Date;
    rsvp_at: Date | null;
    party_size: number | null;
  }[];

  // rsvp as a plain yes/no as well as the timestamp: the column gets sorted and
  // filtered in a spreadsheet, and "yes" does that job where a timestamp does not.
  return [
    "email,name,note,created_at,rsvp,rsvp_at,party_size",
    ...rows.map((r) =>
      [
        r.email,
        r.name,
        r.note,
        toPacific(r.created_at),
        r.rsvp_at ? "yes" : "no",
        r.rsvp_at ? toPacific(r.rsvp_at) : "",
        r.party_size,
      ]
        .map(escCsv)
        .join(","),
    ),
  ].join("\n");
}

/**
 * Every RSVP submission, in order — not just the latest per email.
 *
 * contacts collapses repeat RSVPs from the same address into one row, which
 * is right for a mailing list and wrong for notes: a second submission only
 * ever filled in what the first left blank, so an updated headcount or a new
 * detail silently didn't show up anywhere. rsvp_notes is a plain log, one row
 * per submission, so this export is where the full history actually lives.
 */
export async function exportRsvpNotesCsv(): Promise<string> {
  if (!(await isAdmin())) throw new Error("Not authorised.");

  const rows = (await db()`
    select email, name, note, party_size, created_at
    from rsvp_notes
    order by created_at
  `) as {
    email: string;
    name: string | null;
    note: string | null;
    party_size: number | null;
    created_at: Date;
  }[];

  return [
    "email,name,note,party_size,created_at",
    ...rows.map((r) =>
      [r.email, r.name, r.note, r.party_size, toPacific(r.created_at)].map(escCsv).join(","),
    ),
  ].join("\n");
}
