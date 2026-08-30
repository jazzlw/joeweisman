"use client";

import { useState, useTransition } from "react";
import { setPhotoRotation } from "./actions";

/**
 * Turn a sideways photograph a quarter turn at a time.
 *
 * One button rather than left/right: four presses come back to where it started,
 * so there is nothing to undo and no wrong choice to worry about. The current
 * angle is shown beside it, because after a reload the picture looks correct and
 * there would otherwise be no sign anything had been changed.
 */
export default function RotateButton({
  id,
  rotation,
}: {
  id: string;
  rotation: number;
}) {
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  return (
    <span className="mod-year-row">
      <button
        type="button"
        className="btn-quiet"
        disabled={pending}
        title="Turn this photograph a quarter turn clockwise"
        onClick={() =>
          start(async () => {
            setFailed(false);
            try {
              await setPhotoRotation(id, rotation + 90);
            } catch {
              setFailed(true);
            }
          })
        }
      >
        {pending ? "…" : "↻ Rotate"}
      </button>
      {rotation !== 0 && <span className="mod-year-source">turned {rotation}°</span>}
      {failed && <span className="mod-year-source">Didn&rsquo;t save</span>}
    </span>
  );
}
