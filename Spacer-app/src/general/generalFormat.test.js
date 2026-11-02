// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    meetingPlatform, filterAnnouncements, sortAnnouncements, validateAnnouncement,
    upcomingEvents, eventsByDay, monthGrid, weekDays, dayKey, validateEvent,
    filterPeople, sortPeople, scopeDirectory, initials, eventDayKey, taskItem,
} from "./generalFormat.js";

test("meetingPlatform names known hosts and rejects non-https links", () => {
    assert.equal(meetingPlatform("https://meet.google.com/abc-defg-hij"), "Google Meet");
    assert.equal(meetingPlatform("https://us02web.zoom.us/j/123"), "Zoom");
    assert.equal(meetingPlatform("https://teams.microsoft.com/l/x"), "Microsoft Teams");
    assert.equal(meetingPlatform("https://example.com/call"), "Online meeting");
    assert.equal(meetingPlatform("javascript:alert(1)"), null);
    assert.equal(meetingPlatform("http://meet.google.com/x"), null);
    assert.equal(meetingPlatform(""), null);
});

const ANNOUNCEMENTS = [
    { id: 1, category: "policy", pinned: false, created_at: "2026-10-10T10:00:00Z" },
    { id: 2, category: "event", pinned: true, created_at: "2026-10-26T10:00:00Z" },
    { id: 3, category: "policy", pinned: true, created_at: "2026-10-20T10:00:00Z" },
];

test("announcements filter by pinned or category", () => {
    assert.deepEqual(filterAnnouncements(ANNOUNCEMENTS, "pinned").map((a) => a.id), [2, 3]);
    assert.deepEqual(filterAnnouncements(ANNOUNCEMENTS, "policy").map((a) => a.id), [1, 3]);
    assert.equal(filterAnnouncements(ANNOUNCEMENTS, "all").length, 3);
});

test("announcements sort newest or oldest first without changing the input", () => {
    assert.deepEqual(sortAnnouncements(ANNOUNCEMENTS, "latest").map((a) => a.id), [2, 3, 1]);
    assert.deepEqual(sortAnnouncements(ANNOUNCEMENTS, "oldest").map((a) => a.id), [1, 3, 2]);
    assert.deepEqual(ANNOUNCEMENTS.map((a) => a.id), [1, 2, 3]);
});

test("validateAnnouncement catches missing text and unsafe links", () => {
    const ok = { title: "Town Hall", body: "Join us", meetingUrl: "", startsAt: "", endsAt: "" };
    assert.equal(validateAnnouncement(ok), null);
    assert.equal(validateAnnouncement({ ...ok, title: " " }), "Add a title.");
    assert.match(validateAnnouncement({ ...ok, meetingUrl: "javascript:alert(1)" }), /https/);
    assert.match(validateAnnouncement({ ...ok, startsAt: "2026-10-30T11:00", endsAt: "2026-10-30T10:00" }), /before/);
});

const NOW = new Date(2026, 9, 28, 12, 0); // 28 Oct 2026, noon local

test("upcomingEvents keeps today's all-day and later events, soonest first", () => {
    const events = [
        { id: "past", event_date: "2026-10-20" },
        { id: "later", event_date: "2026-10-30", starts_at: new Date(2026, 9, 30, 10).toISOString() },
        { id: "today", event_date: "2026-10-28" },
        { id: "ended", event_date: "2026-10-28", starts_at: new Date(2026, 9, 28, 9).toISOString(), ends_at: new Date(2026, 9, 28, 10).toISOString() },
        { id: "far", event_date: "2027-01-15" },
    ];
    assert.deepEqual(upcomingEvents(events, NOW, 30).map((e) => e.id), ["today", "later"]);
    assert.deepEqual(upcomingEvents(events, NOW, 30, 1).map((e) => e.id), ["today"]);
});

test("timed events are grouped by their local day", () => {
    const late = { id: 1, event_date: "2026-10-28", starts_at: new Date(2026, 9, 28, 23, 30).toISOString() };
    assert.equal(eventDayKey(late), "2026-10-28");
    assert.deepEqual([...eventsByDay([late]).keys()], ["2026-10-28"]);
});

test("monthGrid is six Sunday-first weeks that include the whole month", () => {
    const grid = monthGrid(new Date(2026, 9, 15));
    assert.equal(grid.length, 42);
    assert.equal(grid[0].getDay(), 0);
    assert.equal(dayKey(grid[0]), "2026-09-27");
    assert.ok(grid.some((d) => dayKey(d) === "2026-10-31"));
});

test("weekDays starts on the Sunday before the date", () => {
    const week = weekDays(new Date(2026, 9, 28));
    assert.equal(dayKey(week[0]), "2026-10-25");
    assert.equal(dayKey(week[6]), "2026-10-31");
});

test("validateEvent requires a start time unless all day", () => {
    const ok = { title: "Standup", date: "2026-10-30", startTime: "09:00", endTime: "09:30", allDay: false, meetingUrl: "" };
    assert.equal(validateEvent(ok), null);
    assert.equal(validateEvent({ ...ok, startTime: "" }), "Add a start time, or mark it as all day.");
    assert.equal(validateEvent({ ...ok, startTime: "", allDay: true }), null);
    assert.match(validateEvent({ ...ok, endTime: "08:00" }), /before/);
});

const PEOPLE = [
    { id: "a", name: "Sarah Johnson", job_title: "CEO", email: "s@x.com", teams: [{ id: "t1", name: "Leadership" }] },
    { id: "b", name: "Daniel Okafor", job_title: "Product Manager", email: "d@x.com", teams: [{ id: "t2", name: "Product" }] },
    { id: "c", name: "Aisha Bello", job_title: "Product Manager", email: "a@x.com", teams: [] },
];

test("filterPeople searches name, title and team, and filters exactly", () => {
    assert.deepEqual(filterPeople(PEOPLE, { query: "product" }).map((p) => p.id), ["b", "c"]);
    assert.deepEqual(filterPeople(PEOPLE, { query: "leader" }).map((p) => p.id), ["a"]);
    assert.deepEqual(filterPeople(PEOPLE, { teamId: "t2" }).map((p) => p.id), ["b"]);
    assert.deepEqual(filterPeople(PEOPLE, { jobTitle: "CEO" }).map((p) => p.id), ["a"]);
});

test("sortPeople orders A-Z and Z-A", () => {
    assert.deepEqual(sortPeople(PEOPLE, "az").map((p) => p.id), ["c", "b", "a"]);
    assert.deepEqual(sortPeople(PEOPLE, "za").map((p) => p.id), ["a", "b", "c"]);
});

const ORG = [
    { id: "boss", teams: [] },
    { id: "adm", teams: [{ id: "eng", role: "admin" }, { id: "ops", role: "member" }] },
    { id: "dev", teams: [{ id: "eng", role: "member" }] },
    { id: "ops1", teams: [{ id: "ops", role: "member" }] },
    { id: "mkt", teams: [{ id: "marketing", role: "member" }] },
];
const ORG_TEAMS = [{ id: "eng" }, { id: "marketing" }, { id: "ops" }];
const ids = (list) => list.map((x) => x.id);

test("scopeDirectory shows super admins everyone", () => {
    const result = scopeDirectory(ORG, ORG_TEAMS, { viewerId: "boss", isSuperAdmin: true });
    assert.deepEqual(ids(result.people), ["boss", "adm", "dev", "ops1", "mkt"]);
    assert.deepEqual(ids(result.teams), ["eng", "marketing", "ops"]);
});

test("scopeDirectory shows admins only the departments they are admin of", () => {
    const result = scopeDirectory(ORG, ORG_TEAMS, { viewerId: "adm", isSuperAdmin: false });
    assert.deepEqual(ids(result.people), ["adm", "dev"]);
    assert.deepEqual(ids(result.teams), ["eng"]);
});

test("scopeDirectory shows members their fellow department members", () => {
    const result = scopeDirectory(ORG, ORG_TEAMS, { viewerId: "ops1", isSuperAdmin: false });
    assert.deepEqual(ids(result.people), ["adm", "ops1"]);
    assert.deepEqual(ids(result.teams), ["ops"]);
});

test("scopeDirectory always lists the viewer, even with no department", () => {
    const result = scopeDirectory(ORG, ORG_TEAMS, { viewerId: "boss", isSuperAdmin: false });
    assert.deepEqual(ids(result.people), ["boss"]);
    assert.deepEqual(result.teams, []);
});

test("initials uses up to two words", () => {
    assert.equal(initials("Destiny Okafor"), "DO");
    assert.equal(initials("cher"), "C");
    assert.equal(initials(""), "?");
});

test("calendar navigation moves by month, week or agenda period", async () => {
    const { visibleRange, shiftCursor, AGENDA_DAYS } = await import("./generalFormat.js");
    const cursor = new Date(2026, 9, 28);
    assert.equal(dayKey(shiftCursor("month", cursor, 1)), "2026-11-01");
    assert.equal(dayKey(shiftCursor("week", cursor, -1)), "2026-10-21");
    assert.equal(dayKey(shiftCursor("agenda", cursor, 1)), dayKey(new Date(2026, 9, 28 + AGENDA_DAYS)));
    const [from, to] = visibleRange("week", cursor);
    assert.deepEqual([dayKey(from), dayKey(to)], ["2026-10-25", "2026-10-31"]);
});

test("agendaItems keeps the period's items in time order", async () => {
    const { agendaItems } = await import("./generalFormat.js");
    const items = [
        { id: "late", event_date: "2026-11-10" },
        { id: "before", event_date: "2026-10-01" },
        { id: "soon", event_date: "2026-10-29" },
        { id: "after", event_date: "2026-12-30" },
    ];
    assert.deepEqual(agendaItems(items, new Date(2026, 9, 28)).map((e) => e.id), ["soon", "late"]);
});

test("taskItem places a task as an all-day item on its due date", () => {
    const task = { id: 7, title: "Ship it", description: "v1", due_date: "2026-11-03T17:00:00+00:00", status: "todo" };
    const item = taskItem(task);
    assert.equal(item.id, "task-7");
    assert.equal(item.kind, "task");
    assert.equal(item.event_date, "2026-11-03");
    assert.equal(item.starts_at, null);
    assert.equal(item.task, task);
    assert.deepEqual([...eventsByDay([item]).keys()], ["2026-11-03"]);
});
