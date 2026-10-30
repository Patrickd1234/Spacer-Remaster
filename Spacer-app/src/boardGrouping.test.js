// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupTasksByColumn, isTaskOverdue, OVERDUE_COLUMN } from "./boardGrouping.js";

const NOW = new Date("2026-10-30T12:00:00Z");
const COLUMNS = [
    { id: null, key: "default-todo", name: "Backlog", base_status: "todo" },
    { id: null, key: "default-in_progress", name: "Doing", base_status: "in_progress" },
    { id: null, key: "default-done", name: "Done", base_status: "done" },
];

const counts = (groups) => Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length]));

test("an overdue backlog task counts only under Overdue", () => {
    const groups = groupTasksByColumn([
        { id: 1, status: "todo", due_date: "2026-07-22" },
        { id: 2, status: "todo", due_date: null },
    ], COLUMNS, NOW);
    assert.deepEqual(counts(groups), {
        "default-todo": 1, "default-in_progress": 0, "default-done": 0, [OVERDUE_COLUMN.key]: 1,
    });
});

test("a finished task is never overdue", () => {
    assert.equal(isTaskOverdue({ status: "done", due_date: "2026-07-22" }, NOW), false);
});

test("every task lands in exactly one group", () => {
    const tasks = [
        { id: 1, status: "todo", due_date: "2026-07-22" },
        { id: 2, status: "in_progress", due_date: "2026-12-01" },
        { id: 3, status: "done", due_date: "2026-01-01" },
        { id: 4, status: "todo" },
    ];
    const total = Object.values(groupTasksByColumn(tasks, COLUMNS, NOW)).reduce((n, g) => n + g.length, 0);
    assert.equal(total, tasks.length);
});

test("a task in a custom column is grouped under that column", () => {
    const columns = [...COLUMNS, { id: "c1", key: "c1", name: "Review", base_status: "in_progress" }];
    const groups = groupTasksByColumn([{ id: 1, status: "in_progress", column_id: "c1" }], columns, NOW);
    assert.equal(groups.c1.length, 1);
    assert.equal(groups["default-in_progress"].length, 0);
});
