// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { projectStatus, isInDoingColumn, matchesStatusFilter } from "./projectStatus.js";

const counts = (total, done, overdue) => ({ total, done, overdue });
const project = (calculatedStatus, doingTasks) => ({ calculatedStatus, doingTasks });
const NOW = new Date("2026-11-03T12:00:00Z");

test("all tasks done is done", () => {
    assert.equal(projectStatus(counts(3, 3, 0)), "done");
});

test("any overdue task needs attention, even with work done", () => {
    assert.equal(projectStatus(counts(4, 1, 2)), "attention");
});

test("no overdue tasks is in progress", () => {
    assert.equal(projectStatus(counts(4, 1, 0)), "in_progress");
    assert.equal(projectStatus(counts(0, 0, 0)), "in_progress");
});

test("a task in progress and not overdue is under Doing", () => {
    assert.equal(isInDoingColumn({ status: "in_progress", due_date: "2026-11-10" }, NOW), true);
    assert.equal(isInDoingColumn({ status: "in_progress", due_date: null }, NOW), true);
});

test("overdue, to-do and done tasks are not under Doing", () => {
    assert.equal(isInDoingColumn({ status: "in_progress", due_date: "2026-10-01" }, NOW), false);
    assert.equal(isInDoingColumn({ status: "todo", due_date: null }, NOW), false);
    assert.equal(isInDoingColumn({ status: "done", due_date: null }, NOW), false);
});

test("In Progress lists a project with a task under Doing, whatever its badge", () => {
    assert.equal(matchesStatusFilter(project("in_progress", 1), "in_progress"), true);
    assert.equal(matchesStatusFilter(project("attention", 2), "in_progress"), true);
});

test("In Progress leaves out projects with nothing under Doing", () => {
    assert.equal(matchesStatusFilter(project("in_progress", 0), "in_progress"), false);
    assert.equal(matchesStatusFilter(project("attention", 0), "in_progress"), false);
});

test("In Progress leaves out finished projects", () => {
    assert.equal(matchesStatusFilter(project("done", 0), "in_progress"), false);
});

test("Needs Attention and Completed are unchanged", () => {
    assert.equal(matchesStatusFilter(project("attention", 2), "attention"), true);
    assert.equal(matchesStatusFilter(project("done", 0), "done"), true);
});
