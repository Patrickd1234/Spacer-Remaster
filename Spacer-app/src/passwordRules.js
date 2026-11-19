// Rules for a new password, shared by every page that sets one.
// Kept free of imports so `npm test` can load it without Supabase.
// They match Supabase's "lowercase, uppercase letters, digits and symbols"
// setting (Authentication -> Email), so the database and the app agree.
// supabase/functions/change-password/index.ts repeats these rules on the server.

export const MIN_PASSWORD_LENGTH = 8;
// bcrypt only uses the first 72 bytes, so longer passwords aren't really longer
export const MAX_PASSWORD_LENGTH = 72;
export const PASSWORD_HINT =
    `At least ${MIN_PASSWORD_LENGTH} characters, with an uppercase and a lowercase letter, a number and a special character (! @ # $ …)`;

const HAS_LOWERCASE = /[a-z]/;
const HAS_UPPERCASE = /[A-Z]/;
const HAS_NUMBER = /[0-9]/;
// The symbols Supabase counts: ! @ # $ % ^ & * ( ) _ + - = [ ] { } ; ' \ : " | < > ? , . / ` ~
const HAS_SPECIAL = /[!@#$%^&*()_+\-=[\]{};'\\:"|<>?,./`~]/;

// Returns an error message, or null when the password is strong enough
export function passwordStrengthError(password) {
    if (password.length < MIN_PASSWORD_LENGTH) {
        return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (new TextEncoder().encode(password).length > MAX_PASSWORD_LENGTH) {
        return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
    }
    if (!HAS_LOWERCASE.test(password)) {
        return "Password must include at least one lowercase letter.";
    }
    if (!HAS_UPPERCASE.test(password)) {
        return "Password must include at least one uppercase letter.";
    }
    if (!HAS_NUMBER.test(password)) {
        return "Password must include at least one number.";
    }
    if (!HAS_SPECIAL.test(password)) {
        return "Password must include at least one special character, such as ! @ # or $.";
    }
    return null;
}

// Returns an error message, or null when the password can be used
export function validateNewPassword(password, confirmPassword) {
    const strengthError = passwordStrengthError(password);
    if (strengthError) return strengthError;
    if (password !== confirmPassword) {
        return "Passwords don't match.";
    }
    return null;
}
