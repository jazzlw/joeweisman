/**
 * Who is coming, and what they asked for.
 *
 *   npm run rsvp                     read the database (current, nothing to download)
 *   npm run rsvp -- some-export.csv  read a CSV export instead
 *
 * The database is the default because a downloaded CSV is a file full of real
 * names and email addresses sitting on a laptop, and this repository is public.
 * The CSV path exists for reading an old export, or for anyone without database
 * credentials.
 *
 * Deliberately does not guess a head count out of the notes. A pattern match for
 * plural words was tried against the real replies and was wrong four times in
 * six: most people use "we" and "us" to describe how they knew Joe, in the past
 * tense, rather than who they are bringing — and it missed a reply that named a
 * second person without any plural word at all. So the arithmetic uses
 * party_size, and anything it cannot know is printed for a person to read.
 *
 * Everyone who replied before the party-size field existed has a blank there,
 * which is why that list is long today and should shrink to nothing.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Parse CSV properly rather than splitting on commas.
 *
 * The note column holds both commas and newlines — real replies contain each —
 * so a naive split silently corrupts rows and shifts every later column. Handles
 * quoted fields and doubled "" escapes.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v !== "")) rows.push(row);

  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ""])));
}

async function fromDatabase() {
  const envFile = join(ROOT, ".env.local");
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, "utf8").split("\n")) {
      const m = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
  if (!process.env.DATABASE_URL) {
    console.error("No DATABASE_URL. Set it in .env.local, or pass a CSV path.");
    process.exit(1);
  }
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`
    select email, name, note, party_size, rsvp_at
    from contacts
    where removed_at is null
    order by created_at
  `;
  return rows.map((r) => ({
    name: r.name ?? "",
    note: r.note ?? "",
    party_size: r.party_size == null ? "" : String(r.party_size),
    rsvp: r.rsvp_at ? "yes" : "no",
  }));
}

/** Words that mean someone asked for something, rather than reminisced. */
const REQUEST =
  /\b(chair|wheel|access|ramp|allerg|diet|vegetarian|vegan|gluten|ride|lift|stay|hotel|help|need|can't|cannot|unable|late|early)\b/i;

const arg = process.argv[2];
const source = arg ? `CSV: ${arg}` : "the database";
const rows = arg ? parseCsv(readFileSync(arg, "utf8")) : await fromDatabase();

const yes = rows.filter((r) => (r.rsvp || "").trim().toLowerCase() === "yes");
const size = (r) => {
  const v = (r.party_size || "").trim();
  return /^\d+$/.test(v) && Number(v) > 0 ? Number(v) : null;
};
const withSize = yes.filter((r) => size(r) !== null);
const noSize = yes.filter((r) => size(r) === null);
const stated = withSize.reduce((n, r) => n + size(r), 0);

const line = (label, value) => console.log(`  ${label.padEnd(28, ".")} ${value}`);

console.log(`\n  Source: ${source}\n`);
line("On the list", rows.length);
line("Coming", yes.length);
line("Not answered", rows.length - yes.length);
console.log();
line("Gave a party size", `${withSize.length} rows -> ${stated} people`);
line("No party size", `${noSize.length} rows -> counted as 1 each`);
console.log();
line("HEAD COUNT (lower bound)", stated + noSize.length);

const unread = noSize.filter((r) => (r.note || "").trim());
if (unread.length) {
  console.log(`\n  ── ${unread.length} said yes with no party size but wrote a note.`);
  console.log(`     Some name a number in words. Read them; this will not guess.\n`);
  for (const r of unread) {
    console.log(
      `     ${(r.name || "—").trim().slice(0, 26).padEnd(26)} ${(r.note || "").trim().replace(/\s*\n\s*/g, " / ").slice(0, 84)}`,
    );
  }
}

const requests = yes.filter((r) => REQUEST.test(r.note || ""));
if (requests.length) {
  console.log(`\n  ── ${requests.length} mention something that may need doing:\n`);
  for (const r of requests) {
    console.log(
      `     ${(r.name || "—").trim().slice(0, 26).padEnd(26)} ${(r.note || "").trim().replace(/\s*\n\s*/g, " / ").slice(0, 84)}`,
    );
  }
}

console.log();
