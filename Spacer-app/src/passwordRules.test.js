// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateNewPassword, passwordStrengthError, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "./passwordRules.js";

test("accepts 8+ characters with a number and a special character, typed the same twice", () => {
    assert.equal(validateNewPassword("horse!42", "horse!42"), null);
});

test("the minimum is still 8 characters", () => {
    assert.equal(MIN_PASSWORD_LENGTH, 8);
    assert.match(passwordStrengthError("ab!4567"), /at least 8/);
});

test("rejects a password with no number", () => {
    assert.match(passwordStrengthError("correct-horse"), /number/);
});

test("rejects a password with no special character", () => {
    assert.match(passwordStrengthError("password123"), /special character/);
});

test("spaces don't count as the special character", () => {
    assert.match(passwordStrengthError("correct horse 1"), /special character/);
});

test("any symbol counts as a special character", () => {
    for (const symbol of ["!", "@", "#", "$", "_", "-", ".", "€", "?"]) {
        assert.equal(passwordStrengthError(`spacers1${symbol}`), null, symbol);
    }
});

test("rejects a password longer than bcrypt can use", () => {
    const long = "a1!".repeat(25);
    assert.match(validateNewPassword(long, long), /at most 72/);
});

test("counts bytes, not characters, toward the maximum", () => {
    const emoji = "😀".repeat(19) + "1"; // 77 bytes
    assert.match(validateNewPassword(emoji, emoji), /at most 72/);
});

test("rejects a confirmation that doesn't match", () => {
    assert.equal(validateNewPassword("password1!", "password2!"), "Passwords don't match.");
});
