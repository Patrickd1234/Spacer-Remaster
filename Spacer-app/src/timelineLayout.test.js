import { test } from "node:test"
import assert from "node:assert/strict"
import {
    windowStart, shiftWindow, taskSpan, placeInWindow, timelineGroups, timelineArrows,
    timelineStats, keyDates, timelineInsights, toDay,
} from "./timelineLayout.js"

const NOW = new Date(2026, 11, 9, 12) // Wed 9 Dec 2026
const key = (d) => (d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : null)
const task = (id, extra = {}) => ({ id, title: id, status: "todo", team_space_id: null, created_at: "2026-12-08T10:00:00", due_date: "2026-12-12", blocked_by: [], ...extra })

test("the window starts on a Monday and moves by a week or four", () => {
    assert.equal(key(windowStart("week", NOW)), "2026-12-7")
    assert.equal(key(windowStart("month", NOW)), "2026-11-30") // the Monday before 1 Dec
    assert.equal(key(shiftWindow(windowStart("week", NOW), "week", 1)), "2026-12-14")
    assert.equal(key(shiftWindow(windowStart("month", NOW), "month", -1)), "2026-10-26") // the Monday before 1 Nov
    assert.equal(key(shiftWindow(windowStart("month", NOW), "month", 1)), "2026-12-28") // the Monday before 1 Jan
})

test("a task spans created day to due day; clipped to the window, or out of it", () => {
    const span = taskSpan(task("a", { created_at: "2026-12-01T09:00:00", due_date: "2026-12-10" }))
    assert.deepEqual(placeInWindow(span, toDay("2026-12-07"), 14), { from: 0, to: 3, startsBefore: true, endsAfter: false })
    assert.equal(placeInWindow(span, toDay("2026-12-14"), 14), null)
    const undated = taskSpan(task("b", { due_date: null }))
    assert.equal(undated.hasNoDueDate, true)
    assert.equal(key(undated.end), "2026-12-8")
})

test("rows are grouped by department, lead first, tasks by start date", () => {
    const departments = [{ team_space_id: "eng", name: "Engineering", is_lead_department: true }, { team_space_id: "design", name: "Design" }]
    const tasks = [
        task("late", { team_space_id: "design", created_at: "2026-12-05T09:00:00" }),
        task("early", { team_space_id: "design", created_at: "2026-12-01T09:00:00" }),
        task("api"),
    ]
    const groups = timelineGroups(tasks, departments)
    assert.deepEqual(groups.map((g) => [g.name, g.tasks.map((t) => t.id)]), [["Engineering", ["api"]], ["Design", ["early", "late"]]])
    assert.deepEqual(timelineGroups(tasks, []).map((g) => g.name), ["Tasks"])
    const gone = timelineGroups([...tasks, task("orphan", { team_space_id: "removed" })], departments)
    assert.deepEqual(gone[0].tasks.map((t) => t.id), ["api", "orphan"]) // with the lead department
})

test("tiles: progress, totals, overdue and open dependencies", () => {
    const tasks = [
        task("done", { status: "done", due_date: "2026-12-01" }),
        task("late", { due_date: "2026-12-05" }),
        task("blocker", { due_date: "2026-12-20" }),
        // past due but held up by another task: not its own lateness
        task("waiting", { status: "waiting", due_date: "2026-12-05", blocked_by: [{ id: "blocker" }] }),
    ]
    assert.deepEqual(timelineStats(tasks, NOW), { progress: 25, total: 4, overdue: 1, activeDependencies: 1 })
    assert.deepEqual(timelineArrows(tasks, NOW).map((a) => [a.fromId, a.toId]), [["blocker", "waiting"]])
})

test("key dates: the earliest start, the deadline, the next open milestone", () => {
    const departments = [
        { team_space_id: "eng", name: "Engineering", is_lead_department: true, due_date: "2026-12-15" },
        { team_space_id: "design", name: "Design", due_date: "2026-12-10" },
        { team_space_id: "old", name: "Old", due_date: "2026-12-01" },
    ]
    const tasks = [task("a", { created_at: "2026-12-03T09:00:00" }), task("b")]
    const dates = keyDates({ tasks, departments, projectDueDate: "2026-12-20", now: NOW })
    assert.equal(key(dates.start), "2026-12-3")
    assert.equal(key(dates.deadline), "2026-12-20")
    assert.deepEqual([dates.milestone.label, key(dates.milestone.date)], ["Design due", "2026-12-10"])
    assert.equal(keyDates({ tasks, departments: [], now: NOW }).milestone.label, "“a” due")
})

test("insights come from the tasks; on schedule when nothing stands out", () => {
    const overdue = timelineInsights({ tasks: [task("late", { due_date: "2026-12-05" }), task("undated", { due_date: null })], now: NOW })
    assert.deepEqual(overdue.map((i) => i.tone), ["warning", "info"])
    assert.equal(overdue[0].title, "1 task is overdue.")
    assert.equal(overdue[1].title, "1 open task has no due date.")
    const fine = timelineInsights({ tasks: [task("later", { due_date: "2027-01-20" })], now: NOW })
    assert.deepEqual(fine.map((i) => [i.tone, i.title]), [["ok", "On schedule."]])
    const yesterday = timelineInsights({ tasks: [task("y", { due_date: "2026-12-08" })], now: NOW })
    assert.equal(yesterday[0].detail, "The oldest, “y”, was due yesterday.")
    const soon = timelineInsights({ tasks: [task("soon", { due_date: "2026-12-11" })], now: NOW })
    assert.equal(soon[0].title, "“soon” is due in 2 days.")
})
