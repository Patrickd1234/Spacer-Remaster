// Run with: node --test src/myspace/taskStats.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    localDateKey, dueState, summarizeTasks, taskProgress, statusLabel, priorityLabel, boardTasks, greetingFor,
} from "./taskStats.js";

const TODAY = "2026-10-27";

test("localDateKey formats the local calendar day with zero padding", () => {
    assert.equal(localDateKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
});

test("dueState marks past, today and future due dates; done tasks are never late", () => {
    assert.equal(dueState({ status: "todo", due_date: "2026-10-26" }, TODAY), "overdue");
    assert.equal(dueState({ status: "in_progress", due_date: "2026-10-27" }, TODAY), "due_today");
    assert.equal(dueState({ status: "todo", due_date: "2026-10-28" }, TODAY), null);
    assert.equal(dueState({ status: "done", due_date: "2026-10-01" }, TODAY), null);
    assert.equal(dueState({ status: "todo", due_date: null }, TODAY), null);
});

test("summarizeTasks counts active, due today, overdue and completed", () => {
    const tasks = [
        { status: "todo", due_date: "2026-10-20" },
        { status: "in_progress", due_date: "2026-10-27" },
        { status: "todo", due_date: null },
        { status: "done", due_date: "2026-10-01" },
    ];
    assert.deepEqual(summarizeTasks(tasks, TODAY), { active: 3, dueToday: 1, overdue: 1, completed: 1 });
});

test("summarizeTasks returns zeros for no tasks", () => {
    assert.deepEqual(summarizeTasks([], TODAY), { active: 0, dueToday: 0, overdue: 0, completed: 0 });
});

test("taskProgress uses subtasks, accepting the stored JSON string", () => {
    const task = { status: "in_progress", sub_tasks: JSON.stringify([{ text: "a", done: true }, { text: "b", done: false }, { text: "c", done: false }]) };
    assert.deepEqual(taskProgress(task), { done: 1, total: 3, percent: 33 });
});

test("taskProgress without subtasks is 100% only when done", () => {
    assert.equal(taskProgress({ status: "done" }).percent, 100);
    assert.equal(taskProgress({ status: "todo", sub_tasks: "not json" }).percent, 0);
});

test("statusLabel shows Overdue ahead of the stored status", () => {
    assert.equal(statusLabel({ status: "in_progress", due_date: "2026-10-01" }, TODAY), "Overdue");
    assert.equal(statusLabel({ status: "in_progress" }, TODAY), "In progress");
    assert.equal(statusLabel({ status: "unknown" }, TODAY), "To do");
});

test("priorityLabel maps medium to Normal and hides missing priority", () => {
    assert.equal(priorityLabel("medium"), "Normal");
    assert.equal(priorityLabel(null), null);
});

test("boardTasks drops done tasks, puts overdue first, then soonest due, undated last", () => {
    const tasks = [
        { id: "undated", status: "todo", due_date: null },
        { id: "later", status: "todo", due_date: "2026-11-10" },
        { id: "done", status: "done", due_date: "2026-10-01" },
        { id: "overdue", status: "todo", due_date: "2026-10-02" },
        { id: "soon", status: "in_progress", due_date: "2026-10-28" },
    ];
    assert.deepEqual(boardTasks(tasks, TODAY).map((t) => t.id), ["overdue", "soon", "later", "undated"]);
    assert.equal(boardTasks(tasks, TODAY, 2).length, 2);
});

test("greetingFor picks morning, afternoon or evening", () => {
    assert.equal(greetingFor(8), "Good morning");
    assert.equal(greetingFor(13), "Good afternoon");
    assert.equal(greetingFor(20), "Good evening");
});
