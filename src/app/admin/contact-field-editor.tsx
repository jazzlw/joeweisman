"use client";

import { useState, useTransition } from "react";

/**
 * One editable text cell in the contacts grid — name, note, admin note, or
 * party size (as a string; setContactPartySize does its own parsing).
 * Generic over which field, since all four are the same click-to-edit shape.
 */
export default function ContactFieldEditor({
  id,
  value,
  placeholder,
  onSave,
}: {
  id: string;
  value: string | null;
  placeholder: string;
  onSave: (id: string, value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!editing) {
    return (
      <span className="field-editor-row">
        {value ? (
          <span className="field-editor-value">{value}</span>
        ) : (
          <span className="field-editor-value field-editor-empty">{placeholder}</span>
        )}
        <button
          type="button"
          className="btn-quiet"
          onClick={() => {
            setDraft(value ?? "");
            setError(null);
            setEditing(true);
          }}
        >
          Edit
        </button>
      </span>
    );
  }

  return (
    <span className="field-editor-row">
      <input
        type="text"
        className="field-editor-input"
        value={draft}
        disabled={pending}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
      />
      <button
        type="button"
        className="btn-quiet"
        disabled={pending}
        onClick={() =>
          start(async () => {
            try {
              await onSave(id, draft);
              setEditing(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Couldn't save that.");
            }
          })
        }
      >
        {pending ? "…" : "Save"}
      </button>
      <button type="button" className="btn-quiet" disabled={pending} onClick={() => setEditing(false)}>
        Cancel
      </button>
      {error && (
        <span className="form-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
