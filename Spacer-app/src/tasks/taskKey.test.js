// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTaskKey, branchName } from "./taskKey.js";

test("formatTaskKey joins the prefix and number", () => {
    assert.equal(formatTaskKey("SPA", 123), "SPA-123");
});

test("formatTaskKey gives nothing until both parts are known", () => {
    assert.equal(formatTaskKey(null, 5), null);
    assert.equal(formatTaskKey("SPA", null), null);
    assert.equal(formatTaskKey("SPA", undefined), null);
});

test("branchName is the lower-case key plus a short slug of the title", () => {
    assert.equal(branchName("SPA", 42, "Fix the Login bug!"), "spa-42-fix-the-login-bug");
});

test("branchName drops accents and symbols and keeps whole words under the limit", () => {
    assert.equal(branchName("SPA", 7, "Café — résumé upload (v2)"), "spa-7-cafe-resume-upload-v2");
    const long = branchName("SPA", 1, "Make the onboarding checklist remember which steps people already finished last week");
    assert.ok(long.length <= 60, long);
    assert.ok(!long.endsWith("-"));
    assert.ok(long.startsWith("spa-1-make-the-onboarding"));
});

test("branchName is just the key when the title has no usable characters", () => {
    assert.equal(branchName("SPA", 9, "🚀🚀"), "spa-9");
    assert.equal(branchName("SPA", 9, ""), "spa-9");
});
