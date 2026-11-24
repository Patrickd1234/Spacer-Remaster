import { test } from "node:test";
import assert from "node:assert/strict";
import {
    formatRecoveryCode,
    looksLikeRecoveryCode,
    normalizeRecoveryCode,
    recoveryCodesFileText,
    RECOVERY_CODE_LENGTH,
} from "./mfaRecovery.js";

test("normalizeRecoveryCode ignores case, spaces and dashes", () => {
    assert.equal(normalizeRecoveryCode(" ABCDE-12345 "), "abcde12345");
    assert.equal(normalizeRecoveryCode("abc de 123 45"), "abcde12345");
});

test("normalizeRecoveryCode reads o, i and l as the digits they look like", () => {
    assert.equal(normalizeRecoveryCode("O1IL0"), "01110");
});

test("normalizeRecoveryCode copes with empty input", () => {
    assert.equal(normalizeRecoveryCode(""), "");
    assert.equal(normalizeRecoveryCode(undefined), "");
    assert.equal(normalizeRecoveryCode(null), "");
});

test("looksLikeRecoveryCode wants exactly ten letters or digits", () => {
    assert.equal(looksLikeRecoveryCode("abcde-12345"), true);
    assert.equal(looksLikeRecoveryCode("abcde-1234"), false);
    assert.equal(looksLikeRecoveryCode("abcde-123456"), false);
    assert.equal(looksLikeRecoveryCode("123456"), false);
    assert.equal(RECOVERY_CODE_LENGTH, 10);
});

test("formatRecoveryCode splits the code in two halves", () => {
    assert.equal(formatRecoveryCode("abcde12345"), "abcde-12345");
});

test("recoveryCodesFileText lists every code, formatted, with the date and how to use them", () => {
    const text = recoveryCodesFileText(["abcde12345", "fghjk67890"], new Date("2026-11-24T10:00:00Z"));
    assert.match(text, /Created 2026-11-24/);
    assert.match(text, /abcde-12345\nfghjk-67890/);
    assert.match(text, /Each code works once/);
});
