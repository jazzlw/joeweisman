import type { Metadata } from "next";
import { bodySerif, displaySerif, mono } from "./fonts";
import Nav from "./nav";
import Footer from "./footer";
import { SITE_NAME, SITE_DESCRIPTION } from "../site.config";
import "./tokens.css";

/** Unset means no analytics at all, which is the correct default for a fork. */
const analyticsToken = process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN;

/**
 * Absolute base for Open Graph URLs.
 *
 * Falling back straight to localhost was shipping
 * `og:image = http://localhost:3000/...` to production, so every Facebook share
 * resolved to nothing. The tag was present, which is why it looked fine.
 *
 * Preference order: an explicit APP_BASE_URL, then Vercel's stable production
 * domain, then the per-deployment URL (so branch previews get working cards too),
 * then localhost for development. Vercel's variables carry no protocol.
 *
 * The dev fallback follows PORT because this project doesn't run on 3000 —
 * Grafana usually holds that port on the development machine.
 */
function resolveBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3117}`;
}

export const metadata: Metadata = {
  metadataBase: new URL(resolveBaseUrl()),
  title: {
    default: SITE_NAME,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  // These sites travel by Facebook share — historic/HISTORY.md §3, Milestone 1.
  openGraph: {
    type: "profile",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    // A dedicated 1200x630 crop. The square portrait was being centre-cropped by
    // Facebook and Twitter, which cut off his hands and the top of his head.
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: { card: "summary_large_image", title: SITE_NAME, description: SITE_DESCRIPTION },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${bodySerif.variable} ${displaySerif.variable} ${mono.variable}`}>
      {/* Browser extensions stamp attributes on <body> before React hydrates —
          Web of Trust adds wotdisconnected, others add their own — and React
          reports each as a hydration mismatch. This suppresses that comparison
          for <body>'s own attributes only; mismatches in the actual page
          content are still reported, which is what we want to hear about. */}
      <body suppressHydrationWarning>
        <a href="#main" className="skip">Skip to content</a>
        <Nav />
        {children}
        <Footer />

        {/* Cloudflare Web Analytics. Counts visits and nothing else: the beacon
            writes no cookie, no localStorage, and stores no IP address, which is
            the reason it's this one and not a tracker. The token is public by
            design — it appears in the page source — but it lives in an env var
            so a fork reports to its own account, or to none.

            spa:false on purpose. Left on, the beacon overrides history.pushState
            to count client-side route changes, and that is the same API Next's
            router drives. Real page loads are enough here: the site is five
            pages, and every link into a form is a full load anyway. */}
        {/* A plain tag, not next/script. next/script injects client-side after
            hydration, which puts the beacon behind the framework for no gain —
            it is fire-and-forget, it renders nothing, and nothing waits on it.
            Server-rendered it is visible in the page source, so it can be
            checked with curl, and it still counts a visit on a page where our
            JavaScript never comes alive. */}
        {analyticsToken && (
          <script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: analyticsToken, spa: false })}
          />
        )}
      </body>
    </html>
  );
}
