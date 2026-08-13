import { readFileSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";

const CONTENT_DIR = join(process.cwd(), "content");

/**
 * Send links that leave the site to a new tab.
 *
 * Somebody reading the service details and tapping the map should still have the
 * page when they come back — on a phone, following it in place means a return
 * journey through the browser's back button to find the address again.
 *
 * Only absolute http(s) links. Everything internal (/rsvp, /photos/add) stays a
 * same-tab navigation, which also keeps the plain-anchor behaviour the Turnstile
 * pages depend on.
 *
 * `rel="noopener noreferrer"` because a new tab otherwise gets a handle back to
 * this one through `window.opener`.
 */
const escapeAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

marked.use({
  renderer: {
    link({ href, title, tokens }) {
      // Regular function, not an arrow: `this.parser` renders the link's own
      // inline content (emphasis, code) rather than flattening it to text.
      const text = this.parser.parseInline(tokens);
      const external = /^https?:\/\//i.test(href);
      const attrs = [
        `href="${escapeAttr(href)}"`,
        title ? `title="${escapeAttr(title)}"` : "",
        external ? 'target="_blank" rel="noopener noreferrer"' : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<a ${attrs}>${text}</a>`;
    },
  },
});

export type Doc = {
  title?: string;
  html: string;
  /** Unfilled placeholders left in the draft, e.g. XXXX. Surfaced so they can't ship. */
  placeholders: string[];
};

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Read a Markdown file from content/ and render it.
 *
 * The source is ours and lives in the repo, so the rendered HTML is trusted.
 * Visitor-submitted text is never routed through here — guestbook entries render
 * as plain text, never as HTML. See ARCHITECTURE.md → "Security boundaries".
 */
export function readDoc(name: string): Doc {
  const raw = readFileSync(join(CONTENT_DIR, `${name}.md`), "utf8");

  let title: string | undefined;
  let body = raw;

  const fm = raw.match(FRONTMATTER);
  if (fm) {
    body = raw.slice(fm[0].length);
    const t = fm[1].match(/^title:\s*["']?(.*?)["']?\s*$/m);
    if (t) title = t[1];
  }

  // Strip HTML comments — the templates ship with instructions inside them.
  body = body.replace(/<!--[\s\S]*?-->/g, "").trim();

  const placeholders = [...new Set(body.match(/X{3,}/g) ?? [])];

  // In production a placeholder renders as ordinary text — "married Karen in XXXX"
  // would simply appear on the live page. Shout during the build so it shows up in
  // the Vercel deploy log rather than on the site.
  if (placeholders.length > 0) {
    console.warn(
      `\n  ⚠  content/${name}.md still contains unfilled placeholders: ` +
        `${placeholders.join(", ")}\n     These WILL appear on the live site.\n`,
    );
  }

  return {
    title,
    html: marked.parse(body, { async: false, gfm: true, breaks: false }),
    placeholders,
  };
}

/** True when a doc has no real content yet (only frontmatter and instructions). */
export function isEmpty(doc: Doc): boolean {
  return doc.html.replace(/<[^>]*>/g, "").trim().length === 0;
}
