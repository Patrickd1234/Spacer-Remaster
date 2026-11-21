// Rules for leaving an organization or removing someone from it, kept free of
// Supabase so they can be unit tested (see orgExit.test.js).

// Database functions mark the refusals they raise on purpose with one of
// these hints, so only those messages are shown to the user as written.
export const ORG_EXIT_HINT = "org_exit";
export const RBAC_HINT = "rbac";
const SHOWN_HINTS = new Set([ORG_EXIT_HINT, RBAC_HINT]);

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
 * The message to show for a failed database call: the database's own wording
 * when it refused on purpose, the fallback for anything unexpected.
 * @param {{ message?: string, hint?: string | null } | null} error
 * @param {string} fallback
 * @returns {string | null}
 */
export function dbRefusalMessage(error, fallback) {
    if (!error) return null;
    return SHOWN_HINTS.has(error.hint) && error.message ? error.message : fallback;
}

export const exitErrorMessage = dbRefusalMessage;
