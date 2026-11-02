// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateNewPassword, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from "./passwordRules.js";

test("accepts a long enough password typed the same twice", () => {
    assert.equal(validateNewPassword("correct horse", "correct horse"), null);
});

test("rejects a password shorter than the minimum", () => {
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    assert.match(validateNewPassword(short, short), /at least 8/);
});

test("rejects a password longer than bcrypt can use", () => {
    const long = "a".repeat(MAX_PASSWORD_LENGTH + 1);
    assert.match(validateNewPassword(long, long), /at most 72/);
});

test("counts bytes, not characters, toward the maximum", () => {
    const emoji = "😀".repeat(19); // 76 bytes, 38 UTF-16 units
    assert.match(validateNewPassword(emoji, emoji), /at most 72/);
});

test("rejects a confirmation that doesn't match", () => {
    assert.equal(validateNewPassword("password123", "password124"), "Passwords don't match.");
});
