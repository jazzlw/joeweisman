/**
 * Admin notifications.
 *
 * One recipient — Jazz — so there is no list, no unsubscribe machinery and no
 * deliverability project. This is the narrow use of Resend described in
 * ARCHITECTURE.md → "Stack", deliberately separate from the mailing list,
 * which is sent by hand from Gmail.
 *
 * Everything here **fails soft**. A notification that doesn't send must never
 * cost someone their tribute or their photographs: the submission is already
 * saved by the time these run.
 *
 * Sent from a subdomain (notifications.joeweisman.org). The apex must stay
 * unverified in Resend, because Cloudflare Email Routing owns its MX records to
 * deliver contact@ — verifying the apex would break inbound mail.
 */

const API = "https://api.resend.com/emails";

export function notificationsConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM && process.env.ADMIN_NOTIFY_TO);
}

function adminUrl(): string {
  const base =
    process.env.APP_BASE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3117");
  return `${base.replace(/\/$/, "")}/admin`;
}

async function send(subject: string, text: string): Promise<void> {
  if (!notificationsConfigured()) {
    console.warn("Notifications are not configured — skipping:", subject);
    return;
  }
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM,
        to: [process.env.ADMIN_NOTIFY_TO],
        subject,
        text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error("Notification rejected by Resend:", res.status, (await res.text()).slice(0, 300));
    }
  } catch (e) {
    console.error("Notification failed to send:", e);
  }
}

/**
 * A guestbook entry has been published.
 *
 * The message is included in full so it can be judged from the inbox — entries
 * go live immediately, so the useful question is "does this need removing?",
 * and answering it shouldn't require opening the admin page.
 */
export async function notifyGuestbookEntry(entry: {
  name: string;
  message: string;
  email: string | null;
}): Promise<void> {
  const preview = entry.message.length > 2000 ? `${entry.message.slice(0, 2000)}\n[…]` : entry.message;
  await send(
    `Guestbook: ${entry.name}`,
    [
      `${entry.name} left a message on the guestbook.`,
      entry.email ? `Their email: ${entry.email}` : "No email given.",
      "",
      "----",
      preview,
      "----",
      "",
      "This is already live on the site. To hide it:",
      adminUrl(),
    ].join("\n"),
  );
}

/**
 * Files that aren't photographs have arrived in the archive.
 *
 * Worth its own notification rather than folding into the photo one: these
 * appear nowhere on the site and nothing surfaces them, so if nobody reads the
 * email nobody finds out they exist.
 */
export async function notifyArtifactFiles(details: {
  count: number;
  submitter: string | null;
  email: string | null;
  files: { filename: string; description: string }[];
}): Promise<void> {
  const { count, submitter, email, files } = details;
  const who = submitter || "Someone";

  await send(
    `Artifact files: ${count} from ${who}`,
    [
      `${who} sent ${count === 1 ? "a file" : `${count} files`} that ${count === 1 ? "isn't a photograph" : "aren't photographs"}.`,
      email ? `Their email: ${email}` : "No email given.",
      "",
      ...files.map((f) => `  • ${f.filename}${f.description ? ` — ${f.description}` : ""}`),
      "",
      "These are in the private archive only. Nothing shows them on the site.",
      "Download and decide what to do with them here:",
      adminUrl(),
    ].join("\n"),
  );
}

/**
 * Photographs have been submitted and are waiting for review.
 *
 * One email per submission, not per photo — someone sending twelve pictures
 * should not produce twelve emails.
 */
export async function notifyPhotoSubmission(details: {
  count: number;
  submitter: string | null;
  email: string | null;
  captions: string[];
}): Promise<void> {
  const { count, submitter, email, captions } = details;
  const who = submitter || "Someone";
  const noun = count === 1 ? "a photograph" : `${count} photographs`;

  await send(
    `Photos waiting: ${count} from ${who}`,
    [
      `${who} sent ${noun}.`,
      email ? `Their email: ${email}` : "No email given.",
      "",
      captions.filter(Boolean).length
        ? `Captions:\n${captions.filter(Boolean).map((c) => `  • ${c}`).join("\n")}`
        : "No captions given.",
      "",
      "These are NOT public yet. Review them here:",
      adminUrl(),
    ].join("\n"),
  );
}
