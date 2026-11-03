// Run with: node --test src/taskReminders.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTaskReminders } from "./taskReminders.js";

// 30 Oct 2026, mid-afternoon local time
const now = new Date(2026, 9, 30, 15, 0, 0);
const task = (id, due_date, title = `Task ${id}`) => ({ id, title, due_date, status: "todo" });

test("no open tasks means no reminders", () => {
    assert.deepEqual(buildTaskReminders([], now), []);
    assert.deepEqual(buildTaskReminders(null, now), []);
});

test("one daily summary of open assigned tasks, with an id that changes each day", () => {
    const reminders = buildTaskReminders([task("a", null), task("b", null)], now);
    assert.equal(reminders.length, 1);
    assert.equal(reminders[0].kind, "daily");
    assert.equal(reminders[0].id, "reminder:daily:2026-10-30");
    assert.match(reminders[0].title, /2 open tasks/);

    const tomorrow = buildTaskReminders([task("a", null)], new Date(2026, 9, 31, 9, 0, 0));
    assert.equal(tomorrow[0].id, "reminder:daily:2026-10-31");
    assert.match(tomorrow[0].title, /1 open task assigned/);
});

test("reminders are dated at the start of the local day so read state lasts the day", () => {
    const [daily] = buildTaskReminders([task("a", null)], now);
    assert.equal(daily.created_at, new Date(2026, 9, 30).toISOString());
});

test("deadline reminders for tasks due today, tomorrow or in two days", () => {
    const reminders = buildTaskReminders([
        task("today", "2026-10-30"),
        task("tomorrow", "2026-10-31"),
        task("twoDays", "2026-11-01"),
        task("later", "2026-11-02"),
        task("overdue", "2026-10-29"),
    ], now);
    const due = reminders.filter((r) => r.kind === "due");
    assert.deepEqual(due.map((r) => r.taskId), ["today", "tomorrow", "twoDays"]);
    assert.match(due[0].title, /due today/);
    assert.match(due[1].title, /due tomorrow/);
    assert.match(due[2].title, /due in 2 days/);
    assert.equal(due[0].id, "reminder:due:today:2026-10-30");
});

test("done tasks are ignored", () => {
    const reminders = buildTaskReminders([{ ...task("a", "2026-10-30"), status: "done" }], now);
    assert.deepEqual(reminders, []);
});

test("accepts timestamp-style due dates", () => {
    const due = buildTaskReminders([task("a", "2026-10-31T00:00:00+00:00")], now).filter((r) => r.kind === "due");
    assert.equal(due.length, 1);
    assert.match(due[0].title, /due tomorrow/);
});
