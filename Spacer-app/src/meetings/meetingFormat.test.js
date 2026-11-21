// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    newMeetingForm, editMeetingForm, validateMeeting, meetingRow, expandRecurring, baseEventId,
    searchAttendees, attendeeChanges, repeatOptions, durationOptions, DESCRIPTION_MAX,
} from "./meetingFormat.js";

const NOW = new Date(2026, 11, 1, 10, 0) // Tue 1 Dec 2026, 10:00 local
const ANNA = { kind: "user", id: "u-anna", name: "Anna" }

const validForm = (overrides = {}) => ({
    ...newMeetingForm(new Date(2026, 11, 9), NOW),
    title: "Project Sync",
    time: "14:00",
    attendees: [ANNA],
    ...overrides,
})

test("newMeetingForm starts on the picked day, 30 minutes, not repeating, on my calendar", () => {
    const form = newMeetingForm(new Date(2026, 11, 9), NOW)
    assert.equal(form.date, "2026-12-09")
    assert.equal(form.duration, 30)
    assert.equal(form.repeat, "none")
    assert.equal(form.addToMyCalendar, true)
    assert.deepEqual(form.attendees, [])
})

test("newMeetingForm for today rounds the time up to the next half hour", () => {
    assert.equal(newMeetingForm(new Date(2026, 11, 1), new Date(2026, 11, 1, 10, 5)).time, "10:30")
    assert.equal(newMeetingForm(new Date(2026, 11, 1), new Date(2026, 11, 1, 10, 30)).time, "11:00")
    assert.equal(newMeetingForm(new Date(2026, 11, 2), NOW).time, "09:00")
})

test("validateMeeting accepts a complete meeting", () => {
    assert.equal(validateMeeting(validForm(), NOW, { isNew: true }), null)
})

test("validateMeeting names the first problem", () => {
    assert.match(validateMeeting(validForm({ title: "  " }), NOW, { isNew: true }), /title/i)
    assert.match(validateMeeting(validForm({ description: "x".repeat(DESCRIPTION_MAX + 1) }), NOW, { isNew: true }), /description/i)
    assert.match(validateMeeting(validForm({ time: "" }), NOW, { isNew: true }), /time/i)
    assert.match(validateMeeting(validForm({ attendees: [] }), NOW, { isNew: true }), /invite/i)
    assert.match(validateMeeting(validForm({ meetingUrl: "http://zoom.us/j/1" }), NOW, { isNew: true }), /https/i)
    assert.match(validateMeeting(validForm({ date: "2026-11-30" }), NOW, { isNew: true }), /past/i)
})

test("validateMeeting lets an existing meeting keep a past date", () => {
    assert.equal(validateMeeting(validForm({ date: "2026-11-30" }), NOW, { isNew: false }), null)
})

test("validateMeeting caps the agenda", () => {
    const agenda = Array.from({ length: 21 }, (_, i) => ({ key: String(i), text: `Item ${i}`, done: false }))
    assert.match(validateMeeting(validForm({ agenda }), NOW, { isNew: true }), /agenda/i)
    const long = [{ key: "a", text: "x".repeat(201), done: false }]
    assert.match(validateMeeting(validForm({ agenda: long }), NOW, { isNew: true }), /agenda/i)
})

test("meetingRow builds an invited meeting with start, end from the duration, and a clean agenda", () => {
    const row = meetingRow(validForm({
        duration: 45,
        meetingUrl: " https://meet.google.com/abc ",
        agenda: [{ key: "1", text: " Review ", done: true }, { key: "2", text: "  ", done: false }],
    }))
    assert.equal(row.title, "Project Sync")
    assert.equal(row.audience, "invited")
    assert.equal(row.category, "meeting")
    assert.equal(row.event_date, "2026-12-09")
    assert.equal(new Date(row.starts_at).getTime(), new Date(2026, 11, 9, 14, 0).getTime())
    assert.equal(new Date(row.ends_at).getTime(), new Date(2026, 11, 9, 14, 45).getTime())
    assert.equal(row.external_url, "https://meet.google.com/abc")
    assert.equal(row.description, null)
    assert.deepEqual(row.agenda, [{ text: "Review", done: true }])
    assert.equal(row.repeat, "none")
})

test("editMeetingForm reads an event and its guest list back", () => {
    const event = {
        id: "e1", title: "Sync", description: "Notes", event_date: "2026-12-09",
        starts_at: new Date(2026, 11, 9, 14, 0).toISOString(), ends_at: new Date(2026, 11, 9, 15, 30).toISOString(),
        external_url: "https://zoom.us/j/1", repeat: "weekly", agenda: [{ text: "A", done: false }],
    }
    const form = editMeetingForm(event, [ANNA, { kind: "user", id: "me", name: "Me" }], "me")
    assert.equal(form.time, "14:00")
    assert.equal(form.duration, 90)
    assert.equal(form.repeat, "weekly")
    assert.equal(form.addToMyCalendar, true)
    assert.deepEqual(form.attendees, [ANNA])
    assert.equal(form.agenda[0].text, "A")
})

test("durationOptions keeps an unusual saved duration selectable", () => {
    assert.ok(durationOptions(30).some((o) => o.value === 30))
    assert.ok(durationOptions(50).some((o) => o.value === 50))
    assert.equal(durationOptions(90).find((o) => o.value === 90).label, "1 hr 30 mins")
})

test("repeatOptions describe the picked day", () => {
    const labels = repeatOptions("2026-12-09").map((o) => o.label)
    assert.deepEqual(labels, ["Does not repeat", "Daily", "Weekly on Wednesday", "Monthly on day 9"])
})

const weekly = {
    id: "w", title: "Standup", event_date: "2026-12-02", repeat: "weekly",
    starts_at: new Date(2026, 11, 2, 9, 0).toISOString(), ends_at: new Date(2026, 11, 2, 9, 30).toISOString(),
}

test("expandRecurring places each repeat inside the range and keeps the wall-clock time", () => {
    const out = expandRecurring([weekly], new Date(2026, 11, 1), new Date(2026, 11, 20))
    assert.deepEqual(out.map((e) => e.event_date), ["2026-12-02", "2026-12-09", "2026-12-16"])
    assert.equal(new Date(out[1].starts_at).getHours(), 9)
    assert.equal(new Date(out[1].ends_at).getMinutes(), 30)
    assert.equal(baseEventId(out[1]), "w")
    assert.notEqual(out[1].id, out[2].id)
})

test("expandRecurring never places a repeat before the first meeting", () => {
    const out = expandRecurring([weekly], new Date(2026, 10, 1), new Date(2026, 11, 3))
    assert.deepEqual(out.map((e) => e.event_date), ["2026-12-02"])
})

test("expandRecurring skips months without the day and leaves one-off events alone", () => {
    const monthly = { id: "m", title: "Close", event_date: "2027-01-31", repeat: "monthly", starts_at: null }
    const once = { id: "o", title: "Once", event_date: "2027-02-10", repeat: "none", starts_at: null }
    const out = expandRecurring([monthly, once], new Date(2027, 0, 1), new Date(2027, 3, 30))
    assert.deepEqual(out.map((e) => `${e.id.split("@")[0]}:${e.event_date}`).sort(), ["m:2027-01-31", "m:2027-03-31", "o:2027-02-10"])
})

test("searchAttendees finds people and departments, minus the chosen ones and me", () => {
    const people = [
        { id: "me", name: "Me Myself", email: "me@x.io" },
        { id: "u-anna", name: "Anna Bell", email: "anna@x.io" },
        { id: "u-tolu", name: "Tolu Adebayo", email: "tolu@x.io" },
    ]
    const teams = [{ id: "t-eng", name: "Engineering" }]
    const ids = (q, chosen = []) => searchAttendees(people, teams, q, chosen, "me").map((o) => `${o.kind}:${o.id}`)
    assert.deepEqual(ids("e"), ["user:u-anna", "user:u-tolu", "team:t-eng"])
    assert.deepEqual(ids("eng"), ["team:t-eng"])
    assert.deepEqual(ids("tolu@"), ["user:u-tolu"])
    assert.deepEqual(ids("a", [ANNA]), ["user:u-tolu"])
})

test("attendeeChanges lists who to add and who to remove", () => {
    const team = { kind: "team", id: "t1", name: "Eng" }
    const tolu = { kind: "user", id: "u-tolu", name: "Tolu" }
    const { added, removed } = attendeeChanges([ANNA, team], [team, tolu])
    assert.deepEqual(added, [tolu])
    assert.deepEqual(removed, [ANNA])
})
