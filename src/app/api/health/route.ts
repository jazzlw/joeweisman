import { db } from "@/lib/db";

/**
 * Health check for UptimeRobot.
 *
 * Monitoring the home page alone would be near-useless: it is statically
 * prerendered, so Vercel keeps serving it with a 200 even if the database is
 * unreachable and the guestbook and gallery are broken. This touches the parts
 * that can actually fail quietly.
 *
 * Only genuine outages return 503. A monitor that fires for things which are not
 * outages gets ignored, and then the real one is missed too — so degraded
 * conditions are reported in the body but do not change the status code.
 *
 * Deliberately terse: it is public, so it reports whether things work, never
 * why. Detail goes to the logs.
 *
 * **The database is only checked when `?deep` is passed, and that matters.**
 * Neon's free plan gives 100 CU-hours a month and suspends an idle compute after
 * five minutes, a timeout that cannot be lengthened. Querying Postgres here, on a
 * URL polled every five minutes, reset that idle timer just before it ever fired
 * — so the compute never slept, spent 0.25 CU around the clock, and exhausted a
 * month's allowance in about seventeen days. It did exactly that.
 *
 * So: poll the plain URL as often as you like — it touches nothing and costs
 * nothing. Poll `?deep=1` hourly, which is what actually notices the database is
 * gone. An hour's delay on that alert is the trade, and it is the right one here:
 * a broken gallery is not an emergency, and an alert nobody can afford to keep
 * running is worth less than one that fires late.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const isProd = process.env.NODE_ENV === "production";
  // The database is only touched when asked for. See the note above.
  const deep = new URL(req.url).searchParams.has("deep");

  /** Broken for visitors right now. These decide the status code. */
  const critical: Record<string, boolean> = {};
  /** Working, but something is switched off. Reported, never alerted on. */
  const degraded: Record<string, boolean> = {};

  if (deep) {
    try {
      // Cheapest query that proves a real round trip to Postgres, rather than
      // just a client object being constructed.
      const rows = (await db()`select 1 as ok`) as { ok: number }[];
      critical.database = rows[0]?.ok === 1;
    } catch (e) {
      console.error("Health check: database unreachable:", e);
      critical.database = false;
    }
  }

  // Without the secret, verifyTurnstile fails closed and every form refuses
  // submissions — a real outage for visitors. Only in production: development
  // deliberately passes without it so the forms can be worked on.
  critical.turnstile = isProd ? Boolean(process.env.TURNSTILE_SECRET) : true;

  // Configuration presence, not live calls. Pinging Cloudflare or Resend on
  // every check would spend quota and turn their blips into our alerts.
  degraded.photoUploads = Boolean(
    process.env.CF_IMAGES_ACCOUNT_ID && process.env.NEXT_PUBLIC_CF_IMAGES_HASH,
  );
  degraded.notifications = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
  // Not an outage if absent — approvals still work — but photographs would stop
  // being backed up silently, which is exactly the kind of thing nobody notices.
  degraded.photoArchive = Boolean(
    process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET,
  );

  const ok = Object.values(critical).every(Boolean);

  return Response.json(
    { ok, critical, degraded },
    {
      status: ok ? 200 : 503,
      // Never let a CDN answer this on the origin's behalf.
      headers: { "cache-control": "no-store, max-age=0" },
    },
  );
}
