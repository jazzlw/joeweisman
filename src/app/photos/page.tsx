import type { Metadata } from "next";
import Link from "next/link";
import Gallery from "./gallery";
import { getApprovedPhotos } from "@/lib/photos";
import { ARTIFACTS_LABEL } from "@/lib/sections";
import { imageUrl, thumbUrl, imagesConfigured } from "@/lib/cf-images";

export const metadata: Metadata = { title: "Photographs" };

// Cached, not per-request. Approving a photo calls revalidatePath("/photos"),
// so it still appears the moment it is approved — the window here is only a
// backstop for anything that changes outside that path.
//
// Per-request meant a Postgres round trip for every visitor, and this page is
// the one a few hundred people open at once when the email goes out. Neon bills
// by the time the compute is awake.
export const revalidate = 60;

export default async function PhotosPage() {
  let photos: Awaited<ReturnType<typeof getApprovedPhotos>> = [];
  let failed = false;
  try {
    photos = await getApprovedPhotos("photo");
  } catch (e) {
    // A database problem shouldn't take the page down — the gallery below still tries.
    console.error("Failed to load photos:", e);
    failed = true;
  }

  return (
    <main className="page page-photos" id="main">
      <h1 className="page-title">Photographs</h1>
      <hr className="rule" />

      <div className="toolbar-row">
        {/* Plain anchor, not Link: the target renders a Turnstile widget and a
            client-side navigation leaves it unrendered. See needsFullLoad. */}
        <a href="/photos/add" className="btn-primary">
          Add More Photographs
        </a>

        <p className="muted-note">
          Note: If some of the pictures are not loading, please hit your browser
          reload button.
        </p>
      </div>

      <p className="muted-note">
        Photographs of things he made or owned live under{" "}
        <Link href="/artifacts">{ARTIFACTS_LABEL}</Link>.
      </p>

      {failed ? (
        <p className="form-error">
          The gallery can&rsquo;t be loaded just now. Please try again shortly.
        </p>
      ) : photos.length === 0 ? (
        <p className="prose empty-state">
          The gallery is still being put together.{" "}
          {imagesConfigured() ? (
            <>
              If you have photographs of Joe, <a href="/photos/add">please send them</a>{" "}
              &mdash; they&rsquo;ll appear here.
            </>
          ) : (
            <>If you have photographs of Joe, there will be a way to add them shortly.</>
          )}
        </p>
      ) : (
        <Gallery
          photos={photos.map((p) => ({
            id: p.id,
            thumb: thumbUrl(p.storage_ref),
            full: imageUrl(p.storage_ref),
            caption: p.caption,
            submitter: p.submitter,
            year: p.taken_year,
            stack: p.stack.map((s) => ({
              thumb: thumbUrl(s.storage_ref),
              full: imageUrl(s.storage_ref),
              caption: s.caption,
            })),
          }))}
        />
      )}
    </main>
  );
}
