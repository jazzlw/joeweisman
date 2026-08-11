import { cookies } from "next/headers";
import { expectedToken, safeEqual } from "./admin-password";

export { checkPassword } from "./admin-password";

/**
 * Admin session handling: the cookie half of the story.
 *
 * Not an identity system, deliberately. There are two admins and the blast
 * radius is hiding guestbook entries and reading submitter emails. Supabase
 * Auth was cut for exactly this reason (historic/HISTORY.md §1).
 *
 * The password and token logic lives in admin-password.ts, which has no Next
 * imports and is therefore testable outside the framework.
 */

const COOKIE = "jw_admin";

export async function grantSession(): Promise<void> {
  const token = expectedToken();
  if (!token) return;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/admin",
    maxAge: 60 * 60 * 12,
  });
}

export async function revokeSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** Fails closed: with no ADMIN_PASSWORD configured, nobody is an admin. */
export async function isAdmin(): Promise<boolean> {
  const expected = expectedToken();
  if (!expected) return false;
  const got = (await cookies()).get(COOKIE)?.value;
  return typeof got === "string" && safeEqual(got, expected);
}
