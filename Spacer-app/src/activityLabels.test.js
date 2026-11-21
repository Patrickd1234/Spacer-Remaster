// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeActivity } from "./activityLabels.js";

test("someone leaving the organization is named", () => {
    const row = { entity_type: "organization", action: "member_left", new_state: { name: "Dana K" } };
    assert.equal(describeActivity(row).title, "Dana K left the organization");
});

test("a removal from the organization names who was removed", () => {
    const row = { entity_type: "organization", action: "member_removed", new_state: { name: "Dana K" } };
    assert.equal(describeActivity(row).title, "Removed Dana K from the organization");
});

test("older entries without a name still read as a sentence", () => {
    assert.equal(describeActivity({ entity_type: "organization", action: "member_left", new_state: null }).title, "Someone left the organization");
    assert.equal(describeActivity({ entity_type: "organization", action: "member_removed", new_state: null }).title, "Removed someone from the organization");
});

test("an action with no label of its own reads as plain words, not a code name", () => {
    const row = { entity_type: "sprint", action: "sprint_started", new_state: {} };
    assert.equal(describeActivity(row).title, "sprint started sprint");
});
