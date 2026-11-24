// Two-factor recovery codes: formatting and checking what people type.
// Kept free of imports so `npm test` can load it without Supabase.
// The server (20261124110000_mfa_recovery.sql) is the one that decides; these
// rules only match it so the app can say "that's not a code" before asking.

export const RECOVERY_CODE_LENGTH = 10;

/**
 * What the server compares: lowercase, no spaces or dashes, and o / i / l
 * read as 0 / 1 / 1 (the codes never contain those letters).
 * @param {string} input
 * @returns {string}
 */
export function normalizeRecoveryCode(input) {
    return String(input ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .replace(/o/g, "0")
        .replace(/[il]/g, "1");
}

/**
 * Could this be a recovery code? (Right length after normalizing.)
 * @param {string} input
 * @returns {boolean}
 */
export function looksLikeRecoveryCode(input) {
    return normalizeRecoveryCode(input).length === RECOVERY_CODE_LENGTH;
}

/**
 * "abcde12345" -> "abcde-12345", easier to read and copy.
 * @param {string} code
 * @returns {string}
 */
export function formatRecoveryCode(code) {
    const half = Math.ceil(code.length / 2);
    return `${code.slice(0, half)}-${code.slice(half)}`;
}

/**
 * The text file people download to keep their codes.
 * @param {string[]} codes
 * @param {Date} createdAt
 * @returns {string}
 */
export function recoveryCodesFileText(codes, createdAt) {
    return [
        "Spacer two-factor recovery codes",
        `Created ${createdAt.toISOString().slice(0, 10)}`,
        "",
        "Each code works once. Use one if you lose the phone with your authenticator app:",
        "on the code screen, choose \"Use a recovery code\".",
        "Creating new codes makes these stop working.",
        "",
        ...codes.map(formatRecoveryCode),
        "",
    ].join("\n");
}
