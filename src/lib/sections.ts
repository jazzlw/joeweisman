/**
 * The site's sections, in nav order.
 *
 * Lives here rather than in nav.tsx because that file is a client component, and
 * every export from a "use client" module becomes a client reference — importing
 * this array from there into a server component yields a proxy, not an array.
 */
/**
 * Pages carrying a Turnstile widget, which must be reached by a full page load.
 *
 * Turnstile's implicit rendering scans the DOM for `.cf-turnstile` once, when
 * its script executes. Next loads a `<Script>` exactly once per session — "even
 * if a user navigates between multiple routes", per its own docs — so after a
 * client-side navigation the script is already loaded, never runs again, and
 * never scans. The new page gets a widget container that nothing will ever fill:
 * `window.turnstile` is defined, no widget appears, no token is ever produced,
 * and the form says "please complete the verification below" over empty space.
 *
 * That was reported as intermittent for months. It isn't: arriving by link fails
 * every time, arriving by reload works every time. Confirmed from the telemetry
 * too — `turnstile:ready:script=true` with no token is precisely this shape.
 *
 * A plain <a> forces a document load, so the script re-executes and scans. The
 * cost is one slower navigation on three pages; the alternative is a form that
 * cannot be submitted. **Do not turn these back into <Link>.**
 */
export const NEEDS_FULL_LOAD = ["/photos/add", "/guestbook/add", "/subscribe", "/rsvp"];

/** True when a href lands on a page that renders a Turnstile widget. */
export function needsFullLoad(href: string): boolean {
  const path = href.split("?")[0];
  return NEEDS_FULL_LOAD.includes(path);
}

/**
 * What the artifacts section is called, in one place.
 *
 * The name is not settled — "Artifacts" is accurate but cooler in tone than the
 * rest of the nav, and something plainer may replace it. Everything that shows
 * the word reads it from here so that change stays a single edit. The URL is
 * deliberately not derived from it: /artifacts will already be in emails and
 * printed material, and a renamed section must not break those links.
 */
export const ARTIFACTS_LABEL = "Artifacts";

export const SECTIONS = [
  { href: "/service", label: "The Service" },
  { href: "/photos", label: "Photographs" },
  { href: "/artifacts", label: ARTIFACTS_LABEL },
  { href: "/guestbook", label: "Guestbook" },
  { href: "/recipes", label: "Recipes" },
  { href: "/subscribe", label: "Stay in touch" },
] as const;
