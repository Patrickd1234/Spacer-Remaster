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

test("describeActivity names a two-factor reset by how it happened", () => {
    const viaCode = { entity_type: "user", action: "two_factor_reset", new_state: { method: "recovery_code", name: "Dana K" } };
    const byAdmin = { entity_type: "user", action: "two_factor_reset", new_state: { method: "admin_reset", name: "Dana K" } };
    assert.equal(describeActivity(viaCode).title, "Used a recovery code to sign in");
    assert.equal(describeActivity(byAdmin).title, "Reset two-factor for Dana K");
    assert.equal(describeActivity(byAdmin).badge, "Account");
});

test("department invites, joins and declines name the department and project", () => {
    const state = { department: "Development", project_name: "Nightfall" };
    assert.equal(describeActivity({ entity_type: "project", action: "department_invited", new_state: state }).title, "Invited Development to “Nightfall”");
    assert.equal(describeActivity({ entity_type: "project", action: "department_joined", new_state: state }).title, "Development joined “Nightfall”");
    assert.equal(describeActivity({ entity_type: "project", action: "department_declined", new_state: state }).title, "Development declined to work on “Nightfall”");
});

test("a department added or removed names it and the tasks that moved", () => {
    const state = { department: "Design", project_name: "Nightfall", moved_tasks: 3 };
    assert.equal(describeActivity({ entity_type: "project", action: "department_added", new_state: state }).title, "Added Design to “Nightfall”");
    assert.equal(describeActivity({ entity_type: "project", action: "department_removed", new_state: state }).title, "Removed Design from “Nightfall” (3 tasks moved to the lead department)");
    assert.equal(describeActivity({ entity_type: "project", action: "department_removed", new_state: { ...state, moved_tasks: 0 } }).title, "Removed Design from “Nightfall”");
});
