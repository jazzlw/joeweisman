<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# joeweisman.org

A memorial site. Read `ARCHITECTURE.md` before any structural change — it describes
what the site is, and why, as of today. `historic/HISTORY.md` has the fuller decision
story for anyone curious. `README.md` covers running and deploying.

Invariants, each with a reason. Check `ARCHITECTURE.md` before overriding one:

- **Never render visitor-submitted text as HTML.** Guestbook messages are plain text,
  escaped server-side, `white-space: pre-line`. `dangerouslySetInnerHTML` is only ever
  used for our own Markdown in `content/`. (→ "Security boundaries")
- **`next/image` is for curated assets only.** Visitor-submitted photos are served
  directly from Cloudflare Images. Next's optimizer runs `sharp`, and feeding
  stranger-supplied files to libvips on our own server is a real exploit path.
  (→ "Security boundaries")
- **No Tailwind, no CSS-in-JS.** All styling lives in `src/app/tokens.css`.
- **Fonts are committed `.woff2` files** loaded via `next/font/local`, never
  `next/font/google` — that loader fetches from Google at build time. (→ "Design system")
- **Colors come from the tokens.** Every text pair is verified at WCAG AAA by
  computation. Don't add a color without checking contrast in both themes.
- **Nothing animates.** The audience is older and grieving.
- **The database is temporary scaffolding.** The site freezes to static in year two,
  so avoid designs that assume Postgres is permanent. (→ "Data model"; `PLAN.md` has
  the freeze-to-static plan itself)

The primary audience is older and often reading on a phone from a Facebook link, while
upset. Favor legibility and plainness over cleverness in both design and copy. 
