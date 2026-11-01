import { test } from "node:test";
import assert from "node:assert/strict";
import {
    groupSprints, sprintTotals, daysLeft, daysLeftLabel, suggestedSprintDates,
    nextSprintName, validateSprint, burndown, toDateKey,
} from "./sprintMath.js";

const day = (key) => new Date(`${key}T12:00:00`);

test("groupSprints splits by status and orders each group", () => {
    const sprints = [
        { id: "p2", status: "planned", starts_on: "2026-12-01" },
        { id: "c1", status: "completed", completed_at: "2026-10-10T00:00:00Z" },
        { id: "a", status: "active", starts_on: "2026-11-01" },
        { id: "p1", status: "planned", starts_on: "2026-11-15" },
        { id: "c2", status: "completed", completed_at: "2026-10-24T00:00:00Z" },
    ];
    const groups = groupSprints(sprints);
    assert.equal(groups.active.id, "a");
    assert.deepEqual(groups.planned.map((s) => s.id), ["p1", "p2"]);
    assert.deepEqual(groups.completed.map((s) => s.id), ["c2", "c1"]);
    assert.equal(groupSprints([]).active, null);
});

test("sprintTotals counts tasks and points", () => {
    const totals = sprintTotals([
        { status: "done", story_points: 3 },
        { status: "in_progress", story_points: 5 },
        { status: "done", story_points: null },
        { status: "todo" },
    ]);
    assert.deepEqual(totals, { totalTasks: 4, doneTasks: 2, totalPoints: 8, donePoints: 3, percent: 50 });
    assert.equal(sprintTotals([]).percent, 0);
});

test("daysLeft and its label count to the sprint's last day", () => {
    assert.equal(daysLeft("2026-11-05", day("2026-11-01")), 4);
    assert.equal(daysLeftLabel("2026-11-05", day("2026-11-01")), "4 days left");
    assert.equal(daysLeftLabel("2026-11-02", day("2026-11-01")), "1 day left");
    assert.equal(daysLeftLabel("2026-11-01", day("2026-11-01")), "Ends today");
    assert.equal(daysLeftLabel("2026-10-30", day("2026-11-01")), "2 days over");
});

test("suggestedSprintDates follows the last open sprint, or starts today", () => {
    assert.deepEqual(suggestedSprintDates([], day("2026-11-01")), { startsOn: "2026-11-01", endsOn: "2026-11-14" });
    const open = [{ status: "active", ends_on: "2026-11-10" }, { status: "completed", ends_on: "2026-12-31" }];
    assert.deepEqual(suggestedSprintDates(open, day("2026-11-01")), { startsOn: "2026-11-11", endsOn: "2026-11-24" });
    const stale = [{ status: "planned", ends_on: "2026-10-01" }];
    assert.equal(suggestedSprintDates(stale, day("2026-11-01")).startsOn, "2026-11-01");
});

test("nextSprintName numbers after existing sprints", () => {
    assert.equal(nextSprintName([]), "Sprint 1");
    assert.equal(nextSprintName([{}, {}]), "Sprint 3");
});

test("validateSprint checks name, goal and dates", () => {
    const ok = { name: "Sprint 1", goal: "", startsOn: "2026-11-01", endsOn: "2026-11-14" };
    assert.equal(validateSprint(ok), null);
    assert.match(validateSprint({ ...ok, name: "  " }), /name/);
    assert.match(validateSprint({ ...ok, name: "x".repeat(81) }), /80/);
    assert.match(validateSprint({ ...ok, goal: "x".repeat(501) }), /500/);
    assert.match(validateSprint({ ...ok, endsOn: "" }), /date/);
    assert.match(validateSprint({ ...ok, endsOn: "2026-10-31" }), /before/);
});

test("burndown tracks points left per day against an ideal line", () => {
    const sprint = { starts_on: "2026-11-01", ends_on: "2026-11-05" };
    const tasks = [
        { status: "done", story_points: 3, completed_at: "2026-11-02T15:00:00" },
        { status: "done", story_points: 2, completed_at: "2026-11-03T09:00:00" },
        { status: "in_progress", story_points: 5 },
    ];
    const chart = burndown(sprint, tasks, day("2026-11-03"));
    assert.equal(chart.unit, "points");
    assert.equal(chart.total, 10);
    assert.deepEqual(chart.days.map((d) => d.remaining), [10, 7, 5, null, null]);
    assert.deepEqual(chart.days.map((d) => d.ideal), [10, 7.5, 5, 2.5, 0]);
});

test("burndown counts tasks when nothing is estimated", () => {
    const sprint = { starts_on: "2026-11-01", ends_on: "2026-11-01" };
    const chart = burndown(sprint, [{ status: "done", completed_at: "2026-11-01T10:00:00" }, { status: "todo" }], day("2026-11-01"));
    assert.equal(chart.unit, "tasks");
    assert.deepEqual(chart.days, [{ date: "2026-11-01", ideal: 0, remaining: 1 }]);
});

test("burndown counts a done task with no completed_at as done today", () => {
    const sprint = { starts_on: "2026-11-01", ends_on: "2026-11-03" };
    const chart = burndown(sprint, [{ status: "done", story_points: 2 }, { status: "todo", story_points: 2 }], day("2026-11-02"));
    assert.deepEqual(chart.days.map((d) => d.remaining), [4, 2, null]);
});

test("toDateKey uses local dates", () => {
    assert.equal(toDateKey(new Date(2026, 0, 5, 23, 30)), "2026-01-05");
});
