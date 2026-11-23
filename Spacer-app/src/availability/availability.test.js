// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    AWAY_NOTE_MAX, dayKeyOf, awayState, isAwayOn, awayLabel, assigneeOptionLabel,
    assignWarning, validateAwayPeriod, awayFields, withAvailability, withPeriod, dayAfter,
} from "./availability.js";

const TODAY = "2026-11-20";
const AWAY_NOW = { name: "Ada", away_from: "2026-11-18", away_back_on: "2026-11-25", away_note: "Conference" };
const AWAY_LATER = { name: "Ben", away_from: "2026-12-22", away_back_on: "2027-01-05", away_note: null };
const ENDED = { name: "Cy", away_from: "2026-11-01", away_back_on: "2026-11-20", away_note: null };

test("dayKeyOf gives the local calendar day", () => {
    assert.equal(dayKeyOf(new Date(2026, 10, 20, 23, 59)), "2026-11-20");
    assert.equal(dayKeyOf(new Date(2026, 0, 5, 0, 1)), "2026-01-05");
});

test("awayState is away, upcoming or null", () => {
    assert.equal(awayState(AWAY_NOW, TODAY), "away");
    assert.equal(awayState(AWAY_LATER, TODAY), "upcoming");
    // The back-on day is the first day back, so the period is over
    assert.equal(awayState(ENDED, TODAY), null);
    assert.equal(awayState({ name: "No period" }, TODAY), null);
    assert.equal(awayState(null, TODAY), null);
});

test("isAwayOn counts the first day away but not the day they're back", () => {
    assert.equal(isAwayOn(AWAY_NOW, "2026-11-18"), true);
    assert.equal(isAwayOn(AWAY_NOW, "2026-11-24"), true);
    assert.equal(isAwayOn(AWAY_NOW, "2026-11-25"), false);
    assert.equal(isAwayOn(AWAY_NOW, "2026-11-17"), false);
    assert.equal(isAwayOn(AWAY_NOW, ""), false);
    assert.equal(isAwayOn({}, "2026-11-20"), false);
});

test("awayLabel shows the return date, or the start for an upcoming period", () => {
    assert.equal(awayLabel(AWAY_NOW, TODAY), "Away · back Nov 25");
    assert.equal(awayLabel(AWAY_LATER, TODAY), "Away from Dec 22 · back Jan 5");
    assert.equal(awayLabel(ENDED, TODAY), null);
});

test("assigneeOptionLabel marks people who are away now", () => {
    assert.equal(assigneeOptionLabel(AWAY_NOW, TODAY), "Ada (away, back Nov 25)");
    assert.equal(assigneeOptionLabel(AWAY_LATER, TODAY), "Ben (away from Dec 22)");
    assert.equal(assigneeOptionLabel(ENDED, TODAY), "Cy");
});

test("assignWarning warns when the due date falls in the away period", () => {
    assert.equal(
        assignWarning(AWAY_LATER, { today: TODAY, dueDate: "2026-12-23" }),
        "Ben is away on the due date (Dec 23) and back on Jan 5.",
    );
    assert.equal(assignWarning(AWAY_LATER, { today: TODAY, dueDate: "2027-01-05" }), null);
    assert.equal(assignWarning(AWAY_LATER, { today: TODAY, dueDate: "2026-12-01" }), null);
});

test("assignWarning warns about someone away now when there's no due date", () => {
    assert.equal(assignWarning(AWAY_NOW, { today: TODAY, dueDate: "" }), "Ada is away and back on Nov 25.");
    assert.equal(assignWarning(AWAY_LATER, { today: TODAY, dueDate: "" }), null);
    assert.equal(assignWarning(ENDED, { today: TODAY, dueDate: "" }), null);
    assert.equal(assignWarning(null, { today: TODAY, dueDate: "" }), null);
});

test("validateAwayPeriod needs both dates, in order, ending after today", () => {
    assert.equal(validateAwayPeriod({ from: "", backOn: "2026-11-25", note: "" }, TODAY), "Choose the first day you're away.");
    assert.equal(validateAwayPeriod({ from: "2026-11-21", backOn: "", note: "" }, TODAY), "Choose the day you're back.");
    assert.equal(validateAwayPeriod({ from: "2026-11-25", backOn: "2026-11-25", note: "" }, TODAY), "The day you're back must be after the first day away.");
    assert.equal(validateAwayPeriod({ from: "2026-11-01", backOn: "2026-11-20", note: "" }, TODAY), "That period is already over.");
    assert.equal(
        validateAwayPeriod({ from: "2026-11-21", backOn: "2026-11-25", note: "x".repeat(AWAY_NOTE_MAX + 1) }, TODAY),
        `Keep the note to ${AWAY_NOTE_MAX} characters.`,
    );
    assert.equal(validateAwayPeriod({ from: "2026-11-18", backOn: "2026-11-25", note: "Conference" }, TODAY), null);
});

test("awayFields trims the note and clears with null", () => {
    assert.deepEqual(
        awayFields({ from: "2026-11-21", backOn: "2026-11-25", note: "  On leave " }),
        { away_from: "2026-11-21", away_back_on: "2026-11-25", away_note: "On leave" },
    );
    assert.deepEqual(awayFields({ from: "2026-11-21", backOn: "2026-11-25", note: "  " }).away_note, null);
    assert.deepEqual(awayFields(null), { away_from: null, away_back_on: null, away_note: null });
});

test("withAvailability adds each person's period without changing the input", () => {
    const people = [{ id: "a", name: "Ada" }, { id: "b", name: "Ben" }];
    const byId = new Map([["a", { away_from: "2026-11-18", away_back_on: "2026-11-25", away_note: null }]]);
    const result = withAvailability(people, byId);
    assert.equal(result[0].away_back_on, "2026-11-25");
    assert.equal(result[1].away_back_on, undefined);
    assert.equal(people[0].away_back_on, undefined);
    assert.notEqual(result[0], people[0]);
    assert.equal(result[1], people[1]);
});

test("withPeriod sets or removes one person's period in a new Map", () => {
    const before = new Map([["a", { away_from: "2026-11-18", away_back_on: "2026-11-25", away_note: null }]]);
    const set = withPeriod(before, "b", { away_from: "2026-12-01", away_back_on: "2026-12-03", away_note: "Trip" }, TODAY);
    assert.equal(set.get("b").away_note, "Trip");
    assert.equal(before.has("b"), false);
    const cleared = withPeriod(set, "a", { away_from: null, away_back_on: null, away_note: null }, TODAY);
    assert.equal(cleared.has("a"), false);
    assert.equal(set.has("a"), true);
    // A period that has already ended isn't kept
    assert.equal(withPeriod(before, "c", { away_from: "2026-11-01", away_back_on: "2026-11-20", away_note: null }, TODAY).has("c"), false);
});

test("dayAfter steps over month and year ends", () => {
    assert.equal(dayAfter("2026-11-30"), "2026-12-01");
    assert.equal(dayAfter("2026-12-31"), "2027-01-01");
    assert.equal(dayAfter("2028-02-28"), "2028-02-29");
    assert.equal(dayAfter(""), "");
});
