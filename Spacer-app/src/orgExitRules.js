// Rules for leaving an organization or removing someone from it, kept free of
// Supabase so they can be unit tested (see orgExit.test.js).

// remove_from_organization() marks the refusals it raises on purpose with this
// hint, so only those messages are shown to the user as written.
export const ORG_EXIT_HINT = "org_exit";

/**
 * Whether the name typed into the confirmation box is the organization's name.
 * @param {string} typed
 * @param {string | null | undefined} organizationName
 * @returns {boolean}
 */
export function confirmationMatches(typed, organizationName) {
    const wanted = (organizationName || "").trim().toLowerCase();
    if (!wanted) return false;
    return (typed || "").trim().toLowerCase() === wanted;
}

/**
 * The message to show for a failed leave or removal: the database's own wording
 * when it refused on purpose, the fallback for anything unexpected.
 * @param {{ message?: string, hint?: string | null } | null} error
 * @param {string} fallback
 * @returns {string | null}
 */
export function exitErrorMessage(error, fallback) {
    if (!error) return null;
    return error.hint === ORG_EXIT_HINT && error.message ? error.message : fallback;
}
