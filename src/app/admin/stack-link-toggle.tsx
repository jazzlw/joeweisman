"use client";

import { useState, useTransition } from "react";
import { setStackPrev } from "./actions";

/**
 * "Link to prior" — this photo continues the stack from whichever photo is
 * shown right above it on this page, right now (priorId, computed by the
 * caller from the rendered list — see admin/page.tsx). Checking it means
 * only the one above shows as a tile in the gallery; this one becomes a
 * page within its stack instead of its own tile.
 *
 * Nothing to show for the very first photo on the page — there's nothing
 * above it to link to.
 */
export default function StackLinkToggle({
  id,
  priorId,
  linked,
}: {
  id: string;
  priorId: string | null;
  linked: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);

  if (!priorId) return null;

  return (
    <label className="mod-stack-toggle">
      <input
        type="checkbox"
        checked={linked}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            setError(false);
            try {
              await setStackPrev(id, e.target.checked ? priorId : null);
            } catch {
              setError(true);
            }
          })
        }
      />
      Link to prior
      {error && <span className="mod-year-source">Didn&rsquo;t save</span>}
    </label>
  );
}
