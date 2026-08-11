/**
 * The two strings a fork needs to change to stop being Joe's site.
 *
 * Kept in their own file, away from the Open Graph/metadata plumbing in
 * layout.tsx that reads them, so a fork never needs to open a file it also
 * has to merge future engine updates into. Listed in FORKING.md as the first
 * thing to edit, and in .gitattributes as `merge=ours` so a fork's edit here
 * is never overwritten by pulling an update from this repo.
 */
export const SITE_NAME = "Joe Weisman";
export const SITE_DESCRIPTION =
  "In memory of Joe Weisman, 1944–2026. Curiosity, generosity, justice, and living life to the fullest.";
