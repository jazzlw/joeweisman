"use client";

import { useState } from "react";
import { exportRsvpNotesCsv } from "./actions";

/**
 * Download the full RSVP log as CSV — every submission, not just the latest
 * per email. See exportRsvpNotesCsv for why that distinction matters.
 */
export default function RsvpNotesExportButton({ count }: { count: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const csv = await exportRsvpNotesCsv();
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `joeweisman-rsvp-notes-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("RSVP notes export failed:", e);
      setError("Couldn't build the file. Try reloading and signing in again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="export">
      <button type="button" className="btn-quiet" onClick={download} disabled={busy || count === 0}>
        {busy ? "Preparing…" : `Download ${count} RSVP note${count === 1 ? "" : "s"} as CSV`}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="muted-note">
        Every submission, in order &mdash; the same person can appear more than once.
      </p>
    </div>
  );
}
