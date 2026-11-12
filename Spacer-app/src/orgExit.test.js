// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmationMatches, exitErrorMessage, ORG_EXIT_HINT } from "./orgExitRules.js";

test("the typed name matches the organization name ignoring case and outer spaces", () => {
    assert.equal(confirmationMatches("  spacer ", "Spacer"), true);
});

test("a partly typed name does not match", () => {
    assert.equal(confirmationMatches("Space", "Spacer"), false);
});

test("nothing typed never matches, even when the organization name is unknown", () => {
    assert.equal(confirmationMatches("", ""), false);
    assert.equal(confirmationMatches("  ", undefined), false);
});

test("inner spaces must match", () => {
    assert.equal(confirmationMatches("NOSPACE", "NO SPACE"), false);
});

test("shows the database's own message when it refused on purpose", () => {
    const error = { message: "Hand the organization to another admin before you leave.", hint: ORG_EXIT_HINT };
    assert.equal(exitErrorMessage(error, "Couldn't leave."), "Hand the organization to another admin before you leave.");
});

test("hides unexpected database errors behind the fallback", () => {
    const error = { message: 'relation "memberships" does not exist', hint: null };
    assert.equal(exitErrorMessage(error, "Couldn't leave."), "Couldn't leave.");
});

test("no error means no message", () => {
    assert.equal(exitErrorMessage(null, "Couldn't leave."), null);
});
