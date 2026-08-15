"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { notifyPhotoSubmission, notifyArtifactFiles } from "@/lib/notify";
import { presignPut, r2Configured } from "@/lib/r2";
import {
  MAX_FILE_BYTES,
  newStorageKey,
  recordArtifactFile,
} from "@/lib/artifact-files";
import { db } from "@/lib/db";
import { hashIp } from "@/lib/ip";
import { verifyTurnstile } from "@/lib/turnstile";
import { parseYear } from "@/lib/exif";
import { parseKind } from "@/lib/photos";
import { createDirectUpload, imagesConfigured } from "@/lib/cf-images";
import { newUploadHandle, verifyUploadHandle } from "@/lib/upload-handle";

export type Ticket = { id: string; uploadURL: string; handle: string; expiresAt: number };

export type FileTicket = {
  storageKey: string;
  uploadURL: string;
  handle: string;
  expiresAt: number;
};

export type RequestResult =
  | { ok: true; tickets: Ticket[]; fileTickets: FileTicket[] }
  | { ok: false; error: string };

/** Per submission, and per IP per hour. Generous, but not unbounded. */
const MAX_PER_SUBMISSION = 12;
const HOURLY_LIMIT = 40;
const MAX_CAPTION = 500;
const MAX_NAME = 120;
const MAX_EMAIL = 320;
/** Non-photo files are rarer and much larger, so a tighter count. */
const MAX_FILES_PER_SUBMISSION = 6;
const MAX_FILENAME = 255;

/**
 * Step one: prove you're a person, get somewhere to upload to.
 *
 * Turnstile is checked here rather than at recording time, so a bot can't even
 * obtain somewhere to upload to. "deny" on outage — photographs end up on a
 * public page once approved, and an open write endpoint to the archive bucket is
 * worth more to an abuser than a slot in a moderation queue.
 *
 * Photographs and other files are requested together in one call because a
 * Turnstile token is single-use. Verifying twice would mean solving a second
 * challenge halfway through a submission that had already started uploading.
 */
export async function requestUploads(
  count: number,
  files: { name: string; size: number }[],
  turnstileToken: string | null,
): Promise<RequestResult> {
  const wanted = Array.isArray(files) ? files : [];

  if (count > 0 && !imagesConfigured()) {
    console.error("Cloudflare Images is not configured — refusing uploads.");
    return { ok: false, error: "Photo uploads aren't available just now. Please try again later." };
  }
  if (wanted.length > 0 && !r2Configured()) {
    console.error("R2 is not configured — refusing artifact file uploads.");
    return {
      ok: false,
      error:
        "Sending files other than photographs isn't available just now. Please email it to contact@joeweisman.org.",
    };
  }
  if (!Number.isInteger(count) || count < 0 || count > MAX_PER_SUBMISSION) {
    return { ok: false, error: `Please choose between 1 and ${MAX_PER_SUBMISSION} photos at a time.` };
  }
  if (wanted.length > MAX_FILES_PER_SUBMISSION) {
    return { ok: false, error: `Please send up to ${MAX_FILES_PER_SUBMISSION} other files at a time.` };
  }
  if (count === 0 && wanted.length === 0) {
    return { ok: false, error: "Nothing to send." };
  }
  const tooBig = wanted.find((f) => !Number.isFinite(f.size) || f.size > MAX_FILE_BYTES);
  if (tooBig) {
    return {
      ok: false,
      error: `"${tooBig.name}" is too large to send through the form. Please email it to contact@joeweisman.org.`,
    };
  }

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ipHash = hashIp(ip);

  const check = await verifyTurnstile(turnstileToken, ip, "deny");
  if (!check.ok) return { ok: false, error: check.error ?? "Verification failed." };

  try {
    const [row] = (await db()`
      select count(*)::int as n from photos
      where ip_hash = ${ipHash} and created_at > now() - interval '1 hour'
    `) as { n: number }[];
    if ((row?.n ?? 0) + count > HOURLY_LIMIT) {
      return {
        ok: false,
        error: "That's a lot of photos in a short time. Please come back in a little while, or write to contact@joeweisman.org.",
      };
    }

    const tickets: Ticket[] = [];
    for (let i = 0; i < count; i++) {
      const { id, uploadURL } = await createDirectUpload();
      const { handle, expiresAt } = newUploadHandle(id);
      tickets.push({ id, uploadURL, handle, expiresAt });
    }

    const fileTickets: FileTicket[] = [];
    for (const f of wanted) {
      const storageKey = newStorageKey(String(f.name).slice(0, MAX_FILENAME));
      const uploadURL = await presignPut(storageKey);
      const { handle, expiresAt } = newUploadHandle(storageKey);
      fileTickets.push({ storageKey, uploadURL, handle, expiresAt });
    }

    return { ok: true, tickets, fileTickets };
  } catch (e) {
    console.error("Failed to create uploads:", e);
    return { ok: false, error: "Something went wrong starting the upload. Please try again." };
  }
}

export type FileSubmission = {
  storageKey: string;
  handle: string;
  expiresAt: number;
  filename: string;
  contentType: string | null;
  byteSize: number;
  description: string;
};

/**
 * Step two: record files that uploaded successfully.
 *
 * The signed handle proves this key came from a Turnstile-verified request, so
 * this cannot be used to write rows pointing at arbitrary objects.
 */
export async function recordArtifactFiles(
  files: FileSubmission[],
  submitter: string,
  email: string,
): Promise<{ ok: boolean; saved: number; error?: string }> {
  if (!Array.isArray(files) || files.length === 0) {
    return { ok: false, saved: 0, error: "No files to save." };
  }
  if (files.length > MAX_FILES_PER_SUBMISSION) {
    return { ok: false, saved: 0, error: "Too many files in one submission." };
  }

  const name = submitter.trim().slice(0, MAX_NAME);
  const mail = email.trim().slice(0, MAX_EMAIL);

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ipHash = hashIp(ip);

  let saved = 0;
  for (const f of files) {
    if (!verifyUploadHandle(f.storageKey, f.expiresAt, f.handle)) {
      console.warn("Rejected an artifact file with an invalid handle:", f.storageKey);
      continue;
    }
    try {
      await recordArtifactFile({
        storageKey: f.storageKey,
        filename: String(f.filename).slice(0, MAX_FILENAME) || "file",
        contentType: f.contentType ? String(f.contentType).slice(0, 200) : null,
        byteSize: Number.isFinite(f.byteSize) ? f.byteSize : null,
        description: f.description.trim().slice(0, MAX_CAPTION) || null,
        submitter: name || null,
        email: mail || null,
        ipHash,
      });
      saved++;
    } catch (e) {
      console.error("Failed to record artifact file", f.storageKey, e);
    }
  }

  if (saved === 0) {
    return { ok: false, saved: 0, error: "Those files couldn't be saved. Please try again." };
  }

  revalidatePath("/admin");

  after(() =>
    notifyArtifactFiles({
      count: saved,
      submitter: name || null,
      email: mail || null,
      files: files.map((f) => ({ filename: f.filename, description: f.description.trim() })),
    }),
  );

  return { ok: true, saved };
}

export type Submission = {
  id: string;
  handle: string;
  expiresAt: number;
  caption: string;
  /** Year the photo was taken, if the sender knew it. Beats EXIF. */
  year?: string;
  /** Which gallery this belongs on. Narrowed server-side; admin can move it. */
  kind?: string;
  /**
   * Pixel size, measured by the browser that decoded the file.
   *
   * Only ever an admin display stat, which is why taking it from the client is
   * acceptable here — nothing is decided by it. Bounded below in case it isn't
   * a plausible number.
   */
  width?: number | null;
  height?: number | null;
};

/** Nothing sane is bigger than this; anything that is, isn't worth recording. */
const MAX_DIMENSION = 100_000;

function plausibleDimension(n: unknown): number | null {
  const v = Number(n);
  if (!Number.isInteger(v) || v <= 0 || v > MAX_DIMENSION) return null;
  return v;
}

/**
 * Step two: record the photos that uploaded successfully.
 *
 * Each entry must carry the signed handle issued in step one, so this cannot be
 * called with arbitrary image ids by anything that skipped the form.
 */
export async function recordPhotos(
  submissions: Submission[],
  submitter: string,
  email: string,
): Promise<{ ok: boolean; saved: number; error?: string }> {
  if (!Array.isArray(submissions) || submissions.length === 0) {
    return { ok: false, saved: 0, error: "No photos to save." };
  }
  if (submissions.length > MAX_PER_SUBMISSION) {
    return { ok: false, saved: 0, error: "Too many photos in one submission." };
  }

  const name = submitter.trim().slice(0, MAX_NAME);
  const mail = email.trim().slice(0, MAX_EMAIL);

  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ipHash = hashIp(ip);

  let saved = 0;
  for (const s of submissions) {
    if (!verifyUploadHandle(s.id, s.expiresAt, s.handle)) {
      console.warn("Rejected a photo submission with an invalid handle:", s.id);
      continue;
    }
    try {
      const year = parseYear(s.year);
      const w = plausibleDimension(s.width);
      const h = plausibleDimension(s.height);
      await db()`
        insert into photos (submitter, email, caption, storage_ref, status, ip_hash,
                            taken_year, taken_source, kind, width, height)
        values (${name || null}, ${mail || null},
                ${s.caption.trim().slice(0, MAX_CAPTION) || null},
                ${s.id}, 'pending', ${ipHash},
                ${year}, ${year ? "submitter" : null},
                ${parseKind(s.kind)},
                ${w && h ? w : null}, ${w && h ? h : null})
      `;
      saved++;
    } catch (e) {
      console.error("Failed to record photo", s.id, e);
    }
  }

  if (saved === 0) {
    return { ok: false, saved: 0, error: "Those photos couldn't be saved. Please try again." };
  }

  revalidatePath("/admin");

  // One email for the whole batch, after the response is sent.
  after(() =>
    notifyPhotoSubmission({
      count: saved,
      submitter: name || null,
      email: mail || null,
      captions: submissions.map((s) => s.caption.trim()).filter(Boolean),
    }),
  );

  return { ok: true, saved };
}
