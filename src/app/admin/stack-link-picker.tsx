"use client";

import { useState, useTransition } from "react";
import { setStackPrev } from "./actions";

/** How far up (negative, toward the top of the page — newer) or down
 * (positive, toward the bottom — older) a photo can reach to find what it
 * stacks underneath. Three either way skips over a couple of interposed
 * rows — an off-kind photo in the middle of an otherwise-contiguous run —
 * without needing a full search picker. */
const OFFSETS = [-3, -2, -1, 0, 1, 2, 3];

function labelFor(offset: number): string {
  if (offset === 0) return "none";
  return offset < 0 ? `<<${-offset}` : `>>${offset}`;
}

/**
 * "Stack underneath:" — which other photo, if any, this one continues.
 * Offsets are relative to this photo's own row on this page right now
 * (candidates, computed by the caller from the rendered list order — see
 * admin/page.tsx), not a stored position, so a later status change that
 * reorders the list doesn't retroactively change what an already-set link
 * points at.
 *
 * A dropdown of relative offsets rather than a plain "link to the row right
 * above" checkbox, so a photo can skip over one or two rows that don't
 * belong in its stack (an artifact interleaved between photos, say)
 * without needing a full picker.
 */
export default function StackLinkPicker({
  id,
  stackPrevId,
  candidates,
}: {
  id: string;
  stackPrevId: string | null;
  /** Photo id at each offset in OFFSETS order, or null where the list doesn't reach that far. */
  candidates: (string | null)[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState(false);

  // Falls back to "none" if stack_prev_id points somewhere outside this
  // +/-3 window — true today only for a link set before this picker existed.
  // candidates[i] !== null guards a row near either end of the list: an
  // out-of-range offset there is also null, which must never count as a
  // match just because this photo happens to be unlinked (stackPrevId also
  // null) — that would make the picker default to a disabled option
  // instead of "none".
  const matchIndex = OFFSETS.findIndex((offset, i) =>
    offset === 0 ? stackPrevId === null : candidates[i] !== null && candidates[i] === stackPrevId,
  );
  const value = matchIndex === -1 ? "0" : String(OFFSETS[matchIndex]);

  return (
    <label className="mod-stack-toggle">
      Stack underneath:
      <select
        value={value}
        disabled={pending}
        onChange={(e) =>
          start(async () => {
            setError(false);
            const offset = Number(e.target.value);
            const targetId = offset === 0 ? null : candidates[OFFSETS.indexOf(offset)];
            try {
              await setStackPrev(id, targetId);
            } catch {
              setError(true);
            }
          })
        }
      >
        {OFFSETS.map((offset, i) => (
          <option key={offset} value={offset} disabled={offset !== 0 && !candidates[i]}>
            {labelFor(offset)}
          </option>
        ))}
      </select>
      {error && <span className="mod-year-source">Didn&rsquo;t save</span>}
    </label>
  );
}
