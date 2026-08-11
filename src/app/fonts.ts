import localFont from "next/font/local";

// Committed .woff2 files rather than next/font/google. Both self-host, but the
// Google loader fetches at build time — a rebuild in year three can fail if the
// API changes or a face is withdrawn. See ARCHITECTURE.md → "Design system".

export const bodySerif = localFont({
  variable: "--font-body",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
  src: [
    { path: "./fonts/source-serif-4-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/source-serif-4-latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/source-serif-4-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
});

export const displaySerif = localFont({
  variable: "--font-display",
  display: "swap",
  fallback: ["Georgia", "serif"],
  src: [{ path: "./fonts/eb-garamond-latin-400-normal.woff2", weight: "400", style: "normal" }],
});

// For the recipes, which were plain text files on his machine. Reads as early
// computing rather than typewriter, which is what they actually were.
export const mono = localFont({
  variable: "--font-mono",
  display: "swap",
  fallback: ["ui-monospace", "Menlo", "Consolas", "monospace"],
  src: [
    { path: "./fonts/ibm-plex-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
});
