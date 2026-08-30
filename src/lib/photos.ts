import { db } from "./db.ts";

/**
 * Which gallery a photograph belongs to.
 *
 * 'artifact' covers anything with his hand on it — built, annotated, or simply
 * his: the harpsichord, a shelving unit, an marked-up recipe, his block-print
 * handwriting. Everything else is 'photo'.
 */
export type PhotoKind = "photo" | "artifact";

export const PHOTO_KINDS: PhotoKind[] = ["photo", "artifact"];

/** Narrow untrusted input to a kind, defaulting to the safer 'photo'. */
export function parseKind(input: unknown): PhotoKind {
  return input === "artifact" ? "artifact" : "photo";
}

export type Photo = {
  id: string;
  storage_ref: string;
  caption: string | null;
  submitter: string | null;
  created_at: Date;
  taken_year: number | null;
  kind: PhotoKind;
  stack_prev_id: string | null;
  /** Degrees clockwise to turn it before showing. 0 for almost everything. */
  rotation: number;
  /** Pixel size. Needed to swap the footprint when a photo is turned a quarter. */
  width: number | null;
  height: number | null;
};

export type PendingPhoto = Photo & { email: string | null; status: string };

/** A gallery tile: a photo, plus the rest of its stack, if it has one. */
export type GalleryEntry = Photo & { stack: Photo[] };

/**
 * Approved photos, in gallery order — one tile per stack, not per photo.
 *
 * A photo can continue the one shown right before it in /admin
 * (stack_prev_id), so a bundle of a few images of the same thing pages
 * through from one tile instead of each showing up separately. Fetches
 * every approved photo once and walks each chain in JS rather than a
 * recursive query — chains are short, and it keeps the SQL here the same
 * shape as everywhere else in this file.
 *
 * A photo whose stack_prev_id points at something *not* in this result set
 * (its predecessor got rejected, or is still pending) shows as its own tile
 * rather than vanishing — an incomplete chain should never hide a photo.
 *
 * Curated ones carry a sort_order and lead; submissions follow, newest first.
 * Oldest-first buried every new arrival at the bottom of the page, where the
 * person who had just sent it would never see it — the opposite of what you
 * want while photographs are still coming in before the service.
 *
 * Chronological by taken_year is the better arrangement once enough of those
 * are confirmed; see PLAN.md → "Ongoing".
 *
 * Selects only what the public page renders — never email.
 *
 * Takes the kind explicitly rather than defaulting, so adding a third gallery
 * can't silently start dropping rows out of an existing one.
 */
export async function getApprovedPhotos(kind: PhotoKind): Promise<GalleryEntry[]> {
  const rows = (await db()`
    select id, storage_ref, caption, submitter, created_at, taken_year, kind, stack_prev_id,
           rotation, width, height
    from photos
    where status = 'approved' and kind = ${kind}
    order by sort_order nulls last, created_at desc
  `) as Photo[];

  const byId = new Map(rows.map((p) => [p.id, p]));
  // Keyed by what each photo continues from, so a chain can be walked
  // forward one step at a time starting from its head.
  const nextOf = new Map<string, Photo>();
  for (const p of rows) {
    if (p.stack_prev_id && byId.has(p.stack_prev_id)) nextOf.set(p.stack_prev_id, p);
  }

  return rows
    .filter((p) => !p.stack_prev_id || !byId.has(p.stack_prev_id))
    .map((head) => {
      const stack: Photo[] = [];
      let cursor = nextOf.get(head.id);
      while (cursor) {
        stack.push(cursor);
        cursor = nextOf.get(cursor.id);
      }
      return { ...head, stack };
    });
}

/** Everything awaiting review, oldest first so nothing sits forgotten. */
export async function getPendingPhotos(): Promise<PendingPhoto[]> {
  return (await db()`
    select id, storage_ref, caption, submitter, email, status, created_at, kind, stack_prev_id, rotation
    from photos
    where status = 'pending'
    order by created_at
  `) as PendingPhoto[];
}

export async function countPhotosByStatus(): Promise<Record<string, number>> {
  const rows = (await db()`
    select status, count(*)::int as n from photos group by status
  `) as { status: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}
