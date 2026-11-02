// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    sprintTotals, daysLeft, burndownSeries, velocityHistory, nextSprintDefaults,
    validateSprint, parseDay, POINT_OPTIONS, pointsLabel, dateRange,
} from "./sprintMath.js";

const task = (id, status, points = null, completedAt = null) =>
    ({ id, status, story_points: points, completed_at: completedAt });

test("POINT_OPTIONS matches the database check", () => {
    assert.deepEqual(POINT_OPTIONS, [0, 1, 2, 3, 5, 8, 13, 21]);
});

test("sprintTotals counts points when any task is estimated", () => {
    const totals = sprintTotals([task(1, "done", 3), task(2, "todo", 5), task(3, "in_progress")]);
    assert.equal(totals.usesPoints, true);
    assert.equal(totals.total, 8);
    assert.equal(totals.done, 3);
    assert.equal(totals.totalTasks, 3);
    assert.equal(totals.doneTasks, 1);
    assert.equal(totals.unestimated, 1);
    assert.equal(totals.percent, 38);
});

test("sprintTotals falls back to task count with no estimates", () => {
    const totals = sprintTotals([task(1, "done"), task(2, "todo"), task(3, "todo"), task(4, "done")]);
    assert.equal(totals.usesPoints, false);
    assert.equal(totals.total, 4);
    assert.equal(totals.done, 2);
    assert.equal(totals.percent, 50);
});

test("sprintTotals of an empty sprint is 0%", () => {
    assert.equal(sprintTotals([]).percent, 0);
});

test("daysLeft counts calendar days to the end date", () => {
    const sprint = { ends_on: "2026-11-13" };
    assert.equal(daysLeft(sprint, parseDay("2026-11-10")), 3);
    assert.equal(daysLeft(sprint, parseDay("2026-11-13")), 0);
    assert.equal(daysLeft(sprint, parseDay("2026-11-15")), -2);
});

test("burndownSeries: ideal falls to zero, actual drops as work finishes", () => {
    const sprint = { starts_on: "2026-11-02", ends_on: "2026-11-05" };
    const tasks = [
        task(1, "done", 3, "2026-11-02T15:00:00"),
        task(2, "done", 2, "2026-11-04T09:00:00"),
        task(3, "todo", 1),
    ];
    const series = burndownSeries(sprint, tasks, parseDay("2026-11-04"));
    assert.deepEqual(series.map((d) => d.day), ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]);
    assert.deepEqual(series.map((d) => d.ideal), [6, 4, 2, 0]);
    assert.deepEqual(series.map((d) => d.remaining), [3, 3, 1, null]);
});

test("burndownSeries counts a done task with no completion time as done from day one", () => {
    const sprint = { starts_on: "2026-11-02", ends_on: "2026-11-03" };
    const series = burndownSeries(sprint, [task(1, "done", 5), task(2, "todo", 5)], parseDay("2026-11-03"));
    assert.deepEqual(series.map((d) => d.remaining), [5, 5]);
});

test("burndownSeries uses task count when nothing is estimated", () => {
    const sprint = { starts_on: "2026-11-02", ends_on: "2026-11-02" };
    const series = burndownSeries(sprint, [task(1, "todo"), task(2, "todo")], parseDay("2026-11-02"));
    assert.deepEqual(series, [{ day: "2026-11-02", ideal: 0, remaining: 2 }]);
});

test("velocityHistory lists completed sprints oldest first with a recent average", () => {
    const sprints = [
        { id: "a", name: "S1", status: "completed", completed_at: "2026-10-01T10:00:00Z", completed_points: 10, committed_points: 12 },
        { id: "c", name: "S3", status: "completed", completed_at: "2026-10-29T10:00:00Z", completed_points: 20, committed_points: 18 },
        { id: "b", name: "S2", status: "completed", completed_at: "2026-10-15T10:00:00Z", completed_points: 14, committed_points: 14 },
        { id: "d", name: "S4", status: "active" },
    ];
    const history = velocityHistory(sprints);
    assert.deepEqual(history.sprints.map((s) => s.name), ["S1", "S2", "S3"]);
    assert.equal(history.average, 15); // (10 + 14 + 20) / 3, rounded
});

test("velocityHistory averages only the last three sprints", () => {
    const sprints = [2, 4, 6, 8].map((points, i) => ({
        id: String(i), name: `S${i}`, status: "completed",
        completed_at: `2026-10-0${i + 1}T00:00:00Z`, completed_points: points, committed_points: points,
    }));
    assert.equal(velocityHistory(sprints).average, 6); // (4 + 6 + 8) / 3
    assert.equal(velocityHistory([]).average, null);
});

test("nextSprintDefaults numbers the sprint and starts after the last one", () => {
    const today = parseDay("2026-11-02");
    assert.deepEqual(nextSprintDefaults([], today), { name: "Sprint 1", startsOn: "2026-11-02", endsOn: "2026-11-15" });
    const later = nextSprintDefaults([{ ends_on: "2026-11-20" }, { ends_on: "2026-11-06" }], today);
    assert.deepEqual(later, { name: "Sprint 3", startsOn: "2026-11-21", endsOn: "2026-12-04" });
    const past = nextSprintDefaults([{ ends_on: "2026-10-01" }], today);
    assert.equal(past.startsOn, "2026-11-02");
});

test("validateSprint checks name, goal length and dates", () => {
    const ok = { name: "Sprint 1", goal: "", startsOn: "2026-11-02", endsOn: "2026-11-15" };
    assert.equal(validateSprint(ok), null);
    assert.match(validateSprint({ ...ok, name: "  " }), /name/i);
    assert.match(validateSprint({ ...ok, name: "x".repeat(81) }), /80/);
    assert.match(validateSprint({ ...ok, goal: "x".repeat(501) }), /500/);
    assert.match(validateSprint({ ...ok, endsOn: "2026-11-01" }), /end/i);
    assert.match(validateSprint({ ...ok, startsOn: "" }), /date/i);
});

test("pointsLabel shows points, or tasks when nothing is estimated", () => {
    assert.equal(pointsLabel(sprintTotals([task(1, "todo", 5), task(2, "todo", 8)])), "13 pts");
    assert.equal(pointsLabel(sprintTotals([task(1, "todo")])), "1 task");
    assert.equal(pointsLabel(sprintTotals([task(1, "todo"), task(2, "todo")])), "2 tasks");
});

test("dateRange names both ends of the sprint", () => {
    const label = dateRange({ starts_on: "2026-11-02", ends_on: "2026-11-15" });
    assert.match(label, /2.*–.*15/);
});
