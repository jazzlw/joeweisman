import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/guestbook";
import { isAdmin } from "@/lib/admin-auth";
import LoginForm from "../login-form";
import ContactFieldEditor from "../contact-field-editor";
import ContactRsvpToggle from "../contact-rsvp-toggle";
import { setContactName, setContactNote, setContactAdminNote, setContactPartySize } from "../actions";

export const metadata: Metadata = {
  title: "Contacts",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  email: string;
  name: string | null;
  note: string | null;
  admin_note: string | null;
  party_size: number | null;
  rsvp_at: Date | null;
  created_at: Date;
};

export default async function AdminContactPage() {
  if (!(await isAdmin())) {
    return (
      <main className="page" id="main">
        <h1 className="page-title">Admin</h1>
        <hr className="rule" />
        <LoginForm />
      </main>
    );
  }

  const rows = (await db()`
    select id, email, name, note, admin_note, party_size, rsvp_at, created_at
    from contacts
    order by created_at desc
  `) as Row[];

  return (
    <main className="page page-wide" id="main">
      <div className="admin-head">
        <h1 className="page-title">Contacts</h1>
        <Link href="/admin" className="btn-quiet">
          &larr; Back to admin
        </Link>
      </div>
      <hr className="rule" />

      {rows.length === 0 ? (
        <p className="muted-note">Nobody on the list yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="contact-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Note</th>
                <th>Admin note</th>
                <th>Party size</th>
                <th>Coming</th>
                <th>Signed up</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="contact-email">{r.email}</td>
                  <td>
                    <ContactFieldEditor
                      id={r.id}
                      value={r.name}
                      placeholder="No name"
                      onSave={setContactName}
                    />
                  </td>
                  <td>
                    <ContactFieldEditor
                      id={r.id}
                      value={r.note}
                      placeholder="No note"
                      onSave={setContactNote}
                    />
                  </td>
                  <td>
                    <ContactFieldEditor
                      id={r.id}
                      value={r.admin_note}
                      placeholder="No admin note"
                      onSave={setContactAdminNote}
                    />
                  </td>
                  <td>
                    <ContactFieldEditor
                      id={r.id}
                      value={r.party_size == null ? null : String(r.party_size)}
                      placeholder="Not given"
                      onSave={setContactPartySize}
                    />
                  </td>
                  <td>
                    <ContactRsvpToggle id={r.id} rsvp={r.rsvp_at !== null} />
                  </td>
                  <td className="mod-meta">{formatDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
