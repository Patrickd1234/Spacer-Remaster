// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeActivity } from "./projectActivity.js";

const row = (id, action, entityId, at, actor = "u1", entityType = "task") =>
    ({ id, action, entity_type: entityType, entity_id: entityId, actor_id: actor, created_at: at });

test("keeps one entry when a task's creation is logged twice", () => {
    const rows = [
        row(2, "created", "t1", "2026-11-03T10:00:01Z"),
        row(1, "created", "t1", "2026-11-03T10:00:00Z"),
    ];
    assert.deepEqual(dedupeActivity(rows).map((r) => r.id), [2]);
});

test("keeps the creation of different tasks", () => {
    const rows = [
        row(2, "created", "t2", "2026-11-03T10:00:01Z"),
        row(1, "created", "t1", "2026-11-03T10:00:00Z"),
    ];
    assert.equal(dedupeActivity(rows).length, 2);
});

test("drops an update already described by a status change", () => {
    const rows = [
        row(2, "status_changed", "t1", "2026-11-03T10:00:01Z"),
        row(1, "updated", "t1", "2026-11-03T10:00:00Z"),
    ];
    assert.deepEqual(dedupeActivity(rows).map((r) => r.id), [2]);
});

test("drops an update already described by a priority change", () => {
    const rows = [
        row(2, "updated", "t1", "2026-11-03T10:00:02Z"),
        row(1, "priority_changed", "t1", "2026-11-03T10:00:00Z"),
    ];
    assert.deepEqual(dedupeActivity(rows).map((r) => r.id), [1]);
});

test("keeps an update made later or by someone else", () => {
    const rows = [
        row(3, "updated", "t1", "2026-11-03T10:05:00Z"),
        row(2, "updated", "t1", "2026-11-03T10:00:01Z", "u2"),
        row(1, "status_changed", "t1", "2026-11-03T10:00:00Z"),
    ];
    assert.deepEqual(dedupeActivity(rows).map((r) => r.id), [3, 2, 1]);
});

test("drops the same status change written twice in a row", () => {
    const rows = [
        { ...row(2, "status_changed", "t1", "2026-11-03T10:00:03Z"), new_state: { title: "A", status: "done" } },
        { ...row(1, "status_changed", "t1", "2026-11-03T10:00:00Z"), new_state: { title: "A", status: "done" } },
    ];
    assert.deepEqual(dedupeActivity(rows).map((r) => r.id), [2]);
});

test("keeps consecutive moves to different statuses", () => {
    const rows = [
        { ...row(2, "status_changed", "t1", "2026-11-03T10:00:03Z"), new_state: { title: "A", status: "done" } },
        { ...row(1, "status_changed", "t1", "2026-11-03T10:00:00Z"), new_state: { title: "A", status: "in_progress" } },
    ];
    assert.equal(dedupeActivity(rows).length, 2);
});

test("ignores updated_at when comparing repeated updates", () => {
    const rows = [
        { ...row(2, "updated", "t1", "2026-11-03T10:00:03Z"), new_state: { title: "A", updated_at: "b" } },
        { ...row(1, "updated", "t1", "2026-11-03T10:00:00Z"), new_state: { title: "A", updated_at: "a" } },
    ];
    assert.deepEqual(dedupeActivity(rows).map((r) => r.id), [2]);
});

test("leaves non-task entries alone", () => {
    const rows = [
        row(2, "created", "p1", "2026-11-03T10:00:01Z", "u1", "project"),
        row(1, "file_added", "f1", "2026-11-03T10:00:00Z", "u1", "file"),
    ];
    assert.equal(dedupeActivity(rows).length, 2);
});
