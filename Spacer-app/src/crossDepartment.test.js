import { test } from "node:test"
import assert from "node:assert/strict"
import {
    summarizeDepartments, projectDelayStatus, delayCulprits, delayingTasks,
    departmentNote, culpritHeadline, wouldCreateCycle, blockableTasks, validateDepartmentDates, matchesDepartmentFilter,
} from "./crossDepartment.js"

// The template's example: Operations leads, Customer Support waits on IT
const NOW = new Date(2026, 10, 17, 12) // 17 Nov 2026, noon
const OPS = "ops", SUPPORT = "support", IT = "it"
const departments = [
    { team_space_id: OPS, name: "Operations", is_lead_department: true, due_date: "2026-12-15" },
    { team_space_id: SUPPORT, name: "Customer Support", due_date: "2026-12-02" },
    { team_space_id: IT, name: "IT", due_date: "2026-11-28" },
]
const task = (id, dept, fields = {}) => ({ id, team_space_id: dept, status: "todo", due_date: null, blocked_by_task_id: null, blocked_at: null, ...fields })
const tasks = [
    task("o1", OPS, { status: "done" }), task("o2", OPS),
    task("i1", IT, { due_date: "2026-11-12" }), task("i2", IT, { due_date: "2026-11-14" }), task("i3", IT, { status: "done" }),
    task("s1", SUPPORT, { blocked_by_task_id: "i1", blocked_at: "2026-11-12T09:00:00" }),
    task("s2", SUPPORT, { blocked_by_task_id: "i2", blocked_at: "2026-11-14T09:00:00" }),
    task("s3", SUPPORT, { status: "done" }),
]
const byId = (list) => Object.fromEntries(list.map((s) => [s.id, s]))

test("each department totals its done, overdue and waiting work", () => {
    const s = byId(summarizeDepartments({ departments, tasks, now: NOW }))
    assert.equal(s[IT].total, 3)
    assert.equal(s[IT].done, 1)
    assert.equal(s[IT].overdue, 2)
    assert.equal(s[SUPPORT].waitingOnOthers, 2)
    assert.equal(Math.round(s[OPS].progress * 100), 50)
})

test("a department with tasks over a day overdue is delayed", () => {
    const s = byId(summarizeDepartments({ departments, tasks, now: NOW }))
    assert.equal(s[IT].status, "delayed")
})

test("a department waiting on another team is blocked, not delayed", () => {
    const s = byId(summarizeDepartments({ departments, tasks, now: NOW }))
    assert.equal(s[SUPPORT].status, "blocked")
    assert.deepEqual(s[SUPPORT].waitingOn.map((e) => [e.departmentId, e.tasks, e.days]), [[IT, 2, 5]])
})

test("nothing overdue and nobody waiting is on track", () => {
    const s = byId(summarizeDepartments({ departments, tasks, now: NOW }))
    assert.equal(s[OPS].status, "on_track")
})

test("a task one day overdue is not yet delayed", () => {
    const list = [task("a", IT, { due_date: "2026-11-16" })]
    const [it] = summarizeDepartments({ departments: [departments[2]], tasks: list, now: NOW })
    assert.equal(it.status, "on_track")
})

test("due within 3 days and under 70% done is at risk", () => {
    const dept = { team_space_id: IT, name: "IT", due_date: "2026-11-19" }
    const list = [task("a", IT), task("b", IT, { status: "done" })]
    const [it] = summarizeDepartments({ departments: [dept], tasks: list, now: NOW })
    assert.equal(it.status, "at_risk")
})

test("being waited on for 2 days or more is at risk", () => {
    const list = [task("i", IT), task("s", SUPPORT, { blocked_by_task_id: "i", blocked_at: "2026-11-15T09:00:00" })]
    const s = byId(summarizeDepartments({ departments, tasks: list, now: NOW }))
    assert.equal(s[IT].status, "at_risk")
})

test("a due date passed with work left is delayed", () => {
    const dept = { team_space_id: IT, name: "IT", due_date: "2026-11-15" }
    const [it] = summarizeDepartments({ departments: [dept], tasks: [task("a", IT)], now: NOW })
    assert.equal(it.status, "delayed")
})

test("rules can be changed per project", () => {
    const list = [task("a", IT, { due_date: "2026-11-15" })]
    const [it] = summarizeDepartments({ departments: [departments[2]], tasks: list, now: NOW, rules: { overdueGraceDays: 3 } })
    assert.equal(it.status, "on_track")
})

test("all tasks done, or a signed-off part, is done", () => {
    const [a] = summarizeDepartments({ departments: [departments[0]], tasks: [task("x", OPS, { status: "done" })], now: NOW })
    const [b] = summarizeDepartments({ departments: [{ ...departments[0], status: "signed_off" }], tasks: [task("x", OPS)], now: NOW })
    assert.equal(a.status, "done")
    assert.equal(b.status, "done")
    assert.equal(a.signedOff, false)
    assert.equal(b.signedOff, true)
    assert.equal(departmentNote(b, () => ""), "Signed off.")
})

test("tasks with no department count for the lead department", () => {
    const [ops] = summarizeDepartments({ departments: [departments[0]], tasks: [task("x", null)], now: NOW })
    assert.equal(ops.total, 1)
})

test("the project is at risk while a department is delayed and the deadline hasn't passed", () => {
    const summaries = summarizeDepartments({ departments, tasks, now: NOW })
    assert.equal(projectDelayStatus(summaries, "2026-12-15", NOW), "at_risk")
    assert.equal(projectDelayStatus(summaries, "2026-11-10", NOW), "delayed")
})

test("the department holding others up is named first", () => {
    const summaries = summarizeDepartments({ departments, tasks, now: NOW })
    assert.deepEqual(delayCulprits(summaries).map((s) => s.id), [IT])
})

test("the banner says what is late and who is waiting", () => {
    const summaries = summarizeDepartments({ departments, tasks, now: NOW })
    const { title, detail } = culpritHeadline(delayCulprits(summaries)[0], summaries, tasks, NOW)
    assert.equal(title, "IT is holding this project up")
    assert.equal(detail, "2 tasks are overdue (5 and 3 days). Customer Support is waiting on 2 of its tasks.")
})

test("tasks causing the delay list overdue days and what they block", () => {
    const summaries = summarizeDepartments({ departments, tasks, now: NOW })
    const rows = delayingTasks(tasks, summaries, NOW)
    assert.deepEqual(rows.map((r) => [r.task.id, r.overdueDays, r.blocks]), [
        ["i1", 5, [{ departmentId: SUPPORT, count: 1 }]],
        ["i2", 3, [{ departmentId: SUPPORT, count: 1 }]],
    ])
})

test("card notes explain each status", () => {
    const summaries = summarizeDepartments({ departments, tasks, now: NOW })
    const s = byId(summaries)
    const nameOf = (id) => s[id]?.name
    assert.equal(departmentNote(s[OPS], nameOf), "Nobody is waiting on Operations.")
    assert.equal(departmentNote(s[SUPPORT], nameOf), "Waiting on IT for 5 days. Not Customer Support's fault, so it is not marked delayed.")
    assert.equal(departmentNote(s[IT], nameOf), "Holding up Customer Support. Due in 11 days with 67% left.")
})

test("a task can't be blocked by itself or by a task waiting on it", () => {
    const list = [task("a", IT), task("b", IT, { blocked_by_task_id: "a" }), task("c", IT, { blocked_by_task_id: "b" })]
    assert.equal(wouldCreateCycle(list, "a", "a"), true)
    assert.equal(wouldCreateCycle(list, "a", "c"), true)
    assert.equal(wouldCreateCycle(list, "c", "a"), false)
})

test("blocking choices are the department's open tasks that don't loop back", () => {
    const list = [task("a", IT), task("b", IT, { blocked_by_task_id: "a" }), task("d", IT, { status: "done" }), task("e", OPS)]
    assert.deepEqual(blockableTasks(list, "a", IT).map((t) => t.id), [])
    assert.deepEqual(blockableTasks(list, "e", IT).map((t) => t.id), ["a", "b"])
})

test("department due dates must fall on or before the overall deadline", () => {
    assert.equal(validateDepartmentDates("2026-12-15", departments), null)
    assert.equal(validateDepartmentDates("2026-12-01", departments), "Operations is due after the overall deadline.")
    assert.equal(validateDepartmentDates("2026-12-15", [{ name: "IT", due_date: "" }]), "Pick a due date for IT.")
})

test("a task whose blocker is finished no longer counts as waiting", () => {
    const list = [task("i", IT, { status: "done" }), task("s", SUPPORT, { blocked_by_task_id: "i", blocked_at: "2026-11-12T09:00:00" })]
    const s = byId(summarizeDepartments({ departments, tasks: list, now: NOW }))
    assert.equal(s[SUPPORT].waitingOnOthers, 0)
    assert.equal(s[SUPPORT].status, "on_track")
    assert.deepEqual(s[IT].waitedOnBy, [])
})

test("the board filter shows one department, or only tasks still waiting", () => {
    const list = [task("o", null), task("i", IT), task("s", SUPPORT, { blocked_by_task_id: "i" }), task("x", SUPPORT, { blocked_by_task_id: "o2" })]
    const index = new Map(list.map((t) => [t.id, t]))
    const show = (filter) => list.filter((t) => matchesDepartmentFilter(t, filter, OPS, index)).map((t) => t.id)
    assert.deepEqual(show({ departmentId: null, isBlockedOnly: false }), ["o", "i", "s", "x"])
    assert.deepEqual(show({ departmentId: OPS, isBlockedOnly: false }), ["o"])
    assert.deepEqual(show({ departmentId: null, isBlockedOnly: true }), ["s"])
})

test("the banner, the card and the delay list count the same overdue tasks", () => {
    // IT: i1 5 days late (Support waits on it), i5 1 day late, i4 7 days late
    // but itself waiting on Operations, so not IT's fault
    const list = [
        task("o2", OPS),
        task("i1", IT, { due_date: "2026-11-12" }),
        task("i5", IT, { due_date: "2026-11-16" }),
        task("i4", IT, { due_date: "2026-11-10", blocked_by_task_id: "o2", blocked_at: "2026-11-10T09:00:00" }),
        task("s1", SUPPORT, { blocked_by_task_id: "i1", blocked_at: "2026-11-12T09:00:00" }),
    ]
    const summaries = summarizeDepartments({ departments, tasks: list, now: NOW })
    const it = byId(summaries)[IT]
    const { detail } = culpritHeadline(it, summaries, list, NOW)
    const listed = delayingTasks(list, summaries, NOW).filter((r) => r.departmentId === IT && r.overdueDays > 0)

    assert.equal(it.overdue, 2)
    assert.match(detail, /^2 tasks are overdue \(5 and 1 days\)\./)
    assert.deepEqual(listed.map((r) => r.task.id), ["i1", "i5"])
})

test("one day overdue shows as overdue, though the department isn't delayed for it", () => {
    const list = [task("a", IT, { due_date: "2026-11-16" })]
    const [it] = summarizeDepartments({ departments: [departments[2]], tasks: list, now: NOW })
    assert.equal(it.overdue, 1)
    assert.equal(it.status, "on_track")
})
