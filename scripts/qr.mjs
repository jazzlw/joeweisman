/**
 * Regenerate the QR codes for printed material.
 *
 *   npm run qr
 *
 * The codes live in `print/` and are committed, so ordinarily nothing needs
 * running — this exists so they can be reproduced exactly, years later, by
 * whoever still has the repository. The settings below are the reason it is a
 * script rather than a line in a README: regenerate without them and you get a
 * code that looks the same and is more fragile on paper.
 *
 * `qrcode` is a devDependency rather than an npx call so the version is pinned
 * in the lockfile and this keeps working with no network.
 */
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Every code the project needs, with its address.
 *
 * Static: each encodes the address itself. Most free QR generators hand you a
 * *dynamic* code that redirects through their own domain so they can sell scan
 * analytics — which works until that company folds, and then the printed paper
 * is a dead link nobody can patch.
 */
const CODES = [
  { url: "https://joeweisman.org", file: "print/qr-joeweisman-org.svg" },
  { url: "https://joeweisman.org/service", file: "print/qr-joeweisman-org-service.svg" },
];

const OPTIONS = {
  type: "svg",
  // Highest error correction, 30%. A fold, a thumbprint or a scuff on a card
  // still scans. These URLs are short enough that the code stays small anyway.
  errorCorrectionLevel: "H",
  // The blank border is required by the spec. It is included in the file
  // because a designer tidying the layout will otherwise crop to the black
  // edge, and the code silently stops scanning.
  margin: 4,
};

for (const { url, file } of CODES) {
  const out = join(ROOT, file);
  mkdirSync(dirname(out), { recursive: true });
  await QRCode.toFile(out, url, OPTIONS);
  console.log(`  ${file.padEnd(38)} ${url}`);
}

console.log(`\n${CODES.length} code(s) written. Scan a printed proof before any full run.`);
