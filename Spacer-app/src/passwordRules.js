// Rules for a new password, shared by every page that sets one.
// Kept free of imports so `npm test` can load it without Supabase.

export const MIN_PASSWORD_LENGTH = 8;
// bcrypt only uses the first 72 bytes, so longer passwords aren't really longer
export const MAX_PASSWORD_LENGTH = 72;

// Returns an error message, or null when the password can be used
export function validateNewPassword(password, confirmPassword) {
    if (password.length < MIN_PASSWORD_LENGTH) {
        return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (new TextEncoder().encode(password).length > MAX_PASSWORD_LENGTH) {
        return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
    }
    if (password !== confirmPassword) {
        return "Passwords don't match.";
    }
    return null;
}
