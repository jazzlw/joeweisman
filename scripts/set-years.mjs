/**
 * Apply reviewed years from a CSV back to the photos table.
 *
 *   node scripts/set-years.mjs media/years.csv            # show what would change
 *   node scripts/set-years.mjs media/years.csv --apply    # write it
 *
 * The companion to the CSV that `--slides` ordering needs: 22 photographs
 * arrived with no year, which puts them outside the chronology, and a year is
 * the one piece of metadata nobody can recover from the file itself once the
 * people who remember are not around to ask.
 *
 * Reads two columns per row, `year` and `guess_year`, and takes guess_year
 * when it is filled in. That way the same file both carries what is already
 * known and collects what was decided, and correcting an existing year means
 * typing the right one in the guess column rather than editing in place.
 *
 * A year that came from guess_year is recorded with taken_source 'guess' and
 * renders everywhere as "~1971", because a year somebody worked out from who
 * is in the frame should not sit on the page looking exactly like one somebody
 * remembers. The exception is a row marked `certain` in the confidence column:
 * two of these were read off a postmark and off a photograph's own pair, which
 * is evidence rather than reasoning, and they go in as 'admin'.
 *
 * Refuses anything that is not a plausible year. A typo here is silent — it
 * just moves a photograph to the wrong place in a sequence nobody is going to
 * audit frame by frame.
 */
import { readFileSync } from "node:fs";
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

const file = process.argv[2];
const apply = process.argv.includes("--apply");
if (!file) {
  console.error("Usage: node scripts/set-years.mjs <csv> [--apply]");
  process.exit(1);
}

/** Minimal RFC4180 reader — captions carry commas, quotes and the odd newline. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v !== ""));
}

const rows = parseCsv(readFileSync(file, "utf8"));
const head = rows.shift().map((h) => h.trim());
for (const needed of ["id", "year", "guess_year"]) {
  if (!head.includes(needed)) {
    console.error(`CSV has no "${needed}" column. Found: ${head.join(", ")}`);
    process.exit(1);
  }
}
const col = (r, name) => (r[head.indexOf(name)] ?? "").trim();

const THIS_YEAR = new Date().getFullYear();
const sql = neon(process.env.DATABASE_URL);
const current = new Map(
  (await sql`select id, taken_year, taken_source from photos`)
    .map((r) => [r.id.slice(0, 8), r]),
);

const changes = [], problems = [];
for (const r of rows) {
  const id = col(r, "id");
  const guessed = col(r, "guess_year");
  const raw = guessed || col(r, "year");
  if (!id || !raw) continue;

  if (!/^\d{4}$/.test(raw) || +raw < 1900 || +raw > THIS_YEAR) {
    problems.push(`${id}  "${raw}" is not a year between 1900 and ${THIS_YEAR}`);
    continue;
  }
  const was = current.get(id);
  if (!was) { problems.push(`${id}  no such photograph`); continue; }

  // Evidence goes in as admin; reasoning goes in as a guess and gets the tilde.
  const source = guessed
    ? (col(r, "confidence").toLowerCase() === "certain" ? "admin" : "guess")
    : was.taken_source;
  if (was.taken_year === +raw && was.taken_source === source) continue;
  changes.push({ id, from: was.taken_year, to: +raw, source });
}

for (const p of problems) console.log(`  SKIPPED  ${p}`);
for (const c of changes) {
  const shown = c.source === "guess" ? `~${c.to}` : `${c.to}`;
  console.log(`  ${c.id}  ${c.from ?? "(none)"} -> ${shown.padEnd(6)} ${c.source}`);
}
const guesses = changes.filter((c) => c.source === "guess").length;
console.log(`\n  ${changes.length} change(s), ${guesses} of them approximate, ${problems.length} problem(s)`);

if (!apply) { console.log("  (dry run — pass --apply to write)"); process.exit(problems.length ? 1 : 0); }
if (problems.length) { console.error("  Refusing to write while rows are unreadable."); process.exit(1); }

for (const c of changes) {
  await sql`update photos set taken_year = ${c.to}, taken_source = ${c.source}
            where id::text like ${c.id + "%"}`;
}
console.log(`  ${changes.length} updated. Next: npm run print:manifest`);
