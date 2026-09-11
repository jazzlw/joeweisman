/**
 * Write the caption data the print tool needs.
 *
 *   npm run print:manifest
 *
 * Separate from print_photos.py because the captions live in Postgres and the
 * image work happens in Python: this is the one step that needs database
 * credentials, so the Python side stays a pure file-in/file-out tool that
 * anyone can run against a folder.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
if (!process.env.DATABASE_URL) {
  console.error("No DATABASE_URL in .env.local");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

// Only what is archived: the print tool reads originals from R2's pulled copy,
// not the resized versions Cloudflare serves.
const rows = await sql`
  select id, archive_key, caption, taken_year, submitter, rotation, kind, width, height
  from photos
  where status = 'approved' and archive_key is not null
  order by created_at
`;

const out = join(ROOT, "media", "print");
mkdirSync(out, { recursive: true });
const dest = join(out, "manifest.json");
writeFileSync(dest, JSON.stringify(rows, null, 2));

const missing = rows.filter((r) => !r.width || !r.height).length;
console.log(`  ${rows.length} approved photographs written to media/print/manifest.json`);
if (missing) console.log(`  ${missing} have no recorded size — run: npm run dimensions`);
const rotated = rows.filter((r) => r.rotation !== 0).length;
if (rotated) console.log(`  ${rotated} are turned in the admin; the tool applies that to the file`);
