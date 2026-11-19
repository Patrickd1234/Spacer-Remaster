// Must a signed-in user set up two-factor before using Spacers?
// Every account must (the database refuses data without it, see
// 20261119090000_require_mfa.sql).
// Kept free of imports so `npm test` can load it without Supabase.

/**
 * @param {object} options
 * @param {string|null|undefined} options.userId signed-in user, if any
 * @param {boolean} options.hasVerifiedFactor the account already has an authenticator app
 * @param {{ userId: string, required: boolean }|null} options.check the server's last answer
 * @returns {"none" | "checking" | "required"} none = nothing to set up
 */
export function mfaSetupState({ userId, hasVerifiedFactor, check }) {
    if (!userId || hasVerifiedFactor) return "none"
    if (check?.userId !== userId) return "checking"
    return check.required ? "required" : "none"
}

// True when the session's user has a verified authenticator factor
export function hasVerifiedFactor(user) {
    return Boolean(user?.factors?.some((f) => f.status === "verified"))
}
