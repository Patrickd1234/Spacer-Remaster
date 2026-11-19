// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateNewPassword, passwordStrengthError, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "./passwordRules.js";

test("accepts 8+ characters with upper and lowercase, a number and a special character", () => {
    assert.equal(validateNewPassword("Horse!42", "Horse!42"), null);
});

test("the minimum is still 8 characters", () => {
    assert.equal(MIN_PASSWORD_LENGTH, 8);
    assert.match(passwordStrengthError("Ab!4567"), /at least 8/);
});

test("rejects a password with no lowercase letter", () => {
    assert.match(passwordStrengthError("HORSE!42"), /lowercase/);
});

test("rejects a password with no uppercase letter", () => {
    assert.match(passwordStrengthError("horse!42"), /uppercase/);
});

test("rejects a password with no number", () => {
    assert.match(passwordStrengthError("Correct-horse"), /number/);
});

test("rejects a password with no special character", () => {
    assert.match(passwordStrengthError("Password123"), /special character/);
});

test("spaces don't count as the special character", () => {
    assert.match(passwordStrengthError("Correct horse 1"), /special character/);
});

test("the symbols Supabase counts are accepted", () => {
    for (const symbol of ["!", "@", "#", "$", "%", "_", "-", ".", "?", "~", "\\", "[", "]"]) {
        assert.equal(passwordStrengthError(`Spacers1${symbol}`), null, symbol);
    }
});

test("symbols Supabase doesn't count are not enough", () => {
    assert.match(passwordStrengthError("Spacers1€"), /special character/);
});

test("rejects a password longer than bcrypt can use", () => {
    const long = "aA1!".repeat(MAX_PASSWORD_LENGTH / 4 + 1); // 76 characters
    assert.match(validateNewPassword(long, long), /at most 72/);
});

test("counts bytes, not characters, toward the maximum", () => {
    const emoji = "😀".repeat(19) + "1"; // 77 bytes
    assert.match(validateNewPassword(emoji, emoji), /at most 72/);
});

test("rejects a confirmation that doesn't match", () => {
    assert.equal(validateNewPassword("Password1!", "Password2!"), "Passwords don't match.");
});
