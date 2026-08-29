"use client";

import { useTransition } from "react";
import { setContactRsvp } from "./actions";

/**
 * Whether a contact has RSVP'd. A plain checkbox, not click-to-edit like the
 * text fields — there's nothing to draft, it's just on or off.
 */
export default function ContactRsvpToggle({ id, rsvp }: { id: string; rsvp: boolean }) {
  const [pending, start] = useTransition();

  return (
    <input
      type="checkbox"
      aria-label="Coming"
      checked={rsvp}
      disabled={pending}
      onChange={(e) => start(() => setContactRsvp(id, e.target.checked))}
    />
  );
}
