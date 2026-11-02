// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeDeadline } from "./deadlineLabel.js";

const TODAY = new Date(2026, 10, 1, 15, 30); // Sun Nov 1 2026, mid-afternoon

test("no deadline gives null", () => {
    assert.equal(describeDeadline("", TODAY), null);
    assert.equal(describeDeadline(null, TODAY), null);
});

test("a deadline today or tomorrow is a warning", () => {
    assert.deepEqual(describeDeadline("2026-11-01", TODAY), { label: "Due today", tone: "warn" });
    assert.deepEqual(describeDeadline("2026-11-02", TODAY), { label: "Due tomorrow", tone: "warn" });
});

test("within a week is a warning with the days left", () => {
    assert.deepEqual(describeDeadline("2026-11-06", TODAY), { label: "Due Nov 6 · 5 days left", tone: "warn" });
});

test("further out is neutral", () => {
    assert.deepEqual(describeDeadline("2026-12-15", TODAY), { label: "Due Dec 15 · 44 days left", tone: "normal" });
});

test("a past deadline is overdue, counted in whole days", () => {
    assert.deepEqual(describeDeadline("2026-10-31", TODAY), { label: "Overdue by 1 day · Oct 31", tone: "danger" });
    assert.deepEqual(describeDeadline("2026-10-20", TODAY), { label: "Overdue by 12 days · Oct 20", tone: "danger" });
});

test("timestamp-style values use their date part", () => {
    assert.deepEqual(describeDeadline("2026-11-02T00:00:00+00:00", TODAY), { label: "Due tomorrow", tone: "warn" });
});

test("unparseable values give null instead of a wrong label", () => {
    assert.equal(describeDeadline("soon", TODAY), null);
});
