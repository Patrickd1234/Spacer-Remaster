// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeInviteProblems } from "./launchInvites.js";

test("returns null when every invite went out", () => {
    assert.equal(summarizeInviteProblems([
        { email: "a@x.com", status: "invite_sent" },
        { email: "b@x.com", status: "notified_existing" },
    ]), null);
});

test("returns null for a missing or empty list", () => {
    assert.equal(summarizeInviteProblems(undefined), null);
    assert.equal(summarizeInviteProblems([]), null);
});

test("lists failed emails and people in other organizations separately", () => {
    const message = summarizeInviteProblems([
        { email: "a@x.com", status: "email_failed" },
        { email: "b@x.com", status: "invite_sent" },
        { email: "c@x.com", status: "email_failed" },
        { email: "d@x.com", status: "other_organization" },
    ]);
    assert.equal(
        message,
        "Couldn't email: a@x.com, c@x.com. Already in another organization, not invited: d@x.com.",
    );
});
