"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type GalleryPhoto = {
  id: string;
  /** Grid-sized. Big enough to stay crisp at 2x in a ~380px tile. */
  thumb: string;
  /** Full size, only fetched when a photo is actually enlarged. */
  full: string;
  caption: string | null;
  submitter: string | null;
  year: number | null;
};

/**
 * The gallery, with a click-to-enlarge view.
 *
 * Uses a native <dialog> rather than a lightbox library: it gives keyboard
 * dismissal, focus trapping and a backdrop for free, and adds no dependency to
 * a project that is trying to keep them countable.
 *
 * Images are plain <img> pointing at Cloudflare Images, never next/image. That
 * optimizer runs sharp over the file, and these come from strangers — the
 * security boundary in ARCHITECTURE.md → "Security boundaries".
 */
/**
 * Show the year only when the caption doesn't already say it.
 *
 * Most captions carry the date themselves — "Joe at Burning Man in 2015",
 * "Thanksgiving, 2011" — and 12 of the first 14 dated photographs read as
 * "…in 2015  2015". The year is worth showing when it adds something and
 * clutter when it doesn't.
 *
 * Matches the exact year only. If a caption says 2013 and the stored year is
 * 2015 they disagree, and showing both surfaces that for an admin to fix rather
 * than quietly hiding one.
 */
function yearWorthShowing(year: number | null, caption: string | null): number | null {
  if (!year) return null;
  if (caption && caption.includes(String(year))) return null;
  return year;
}

export default function Gallery({ photos }: { photos: GalleryPhoto[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  // Return focus to the thumbnail that was clicked, rather than the top of the page.
  const openerRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  const step = useCallback(
    (delta: number) => {
      setOpenIndex((i) => {
        if (i === null) return i;
        const next = i + delta;
        return next < 0 || next >= photos.length ? i : next;
      });
    },
    [photos.length],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (openIndex !== null && !dialog.open) dialog.showModal();
  }, [openIndex]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (openIndex === null) return;
      if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openIndex, step]);

  const current = openIndex === null ? null : photos[openIndex];

  return (
    <>
      <ul className="gallery">
        {photos.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              className="gallery-item"
              onClick={(e) => {
                openerRef.current = e.currentTarget;
                setOpenIndex(i);
              }}
              aria-label={p.caption ? `Enlarge: ${p.caption}` : "Enlarge photograph"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumb} alt={p.caption ?? "A photograph of Joe Weisman"} loading="lazy" decoding="async" />
            </button>
            {(() => {
              const yr = yearWorthShowing(p.year, p.caption);
              if (!p.caption && !p.submitter && !yr) return null;
              return (
                <p className="gallery-caption">
                  {p.caption}
                  {p.caption && (p.submitter || yr) && " "}
                  {yr && <span className="photo-year">{yr}</span>}
                  {yr && p.submitter && " "}
                  {p.submitter && <span className="credit">&mdash; {p.submitter}</span>}
                </p>
              );
            })()}
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        className="lightbox"
        // Escape and the backdrop both close; restore focus where they left off.
        onClose={() => {
          setOpenIndex(null);
          openerRef.current?.focus();
        }}
        onClick={(e) => {
          // Clicking the backdrop — the dialog element itself — closes it.
          if (e.target === dialogRef.current) close();
        }}
      >
        {current && (
          <div className="lightbox-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.full} alt={current.caption ?? "A photograph of Joe Weisman"} />

            <div className="lightbox-bar">
              <button
                type="button"
                className="btn-quiet"
                onClick={() => step(-1)}
                disabled={openIndex === 0}
              >
                &larr; Previous
              </button>
              <span className="lightbox-count">
                {(openIndex ?? 0) + 1} of {photos.length}
              </span>
              <button
                type="button"
                className="btn-quiet"
                onClick={() => step(1)}
                disabled={openIndex === photos.length - 1}
              >
                Next &rarr;
              </button>
            </div>

            {(() => {
              const yr = yearWorthShowing(current.year, current.caption);
              if (!current.caption && !current.submitter && !yr) return null;
              return (
                <p className="lightbox-caption">
                  {current.caption}
                  {current.caption && (current.submitter || yr) && " "}
                  {yr && <span className="photo-year">{yr}</span>}
                  {yr && current.submitter && " "}
                  {current.submitter && <span className="credit">&mdash; {current.submitter}</span>}
                </p>
              );
            })()}

            <button type="button" className="lightbox-close btn-quiet" onClick={close}>
              Close
            </button>
          </div>
        )}
      </dialog>
    </>
  );
}
