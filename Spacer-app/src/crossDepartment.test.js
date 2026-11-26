import { test } from "node:test"
import assert from "node:assert/strict"
import {
    summarizeDepartments, projectDelayStatus, delayCulprits, delayingTasks,
    departmentNote, culpritHeadline, wouldCreateCycle, blockableTasks, validateDepartmentDates, matchesDepartmentFilter, dependencyState, projectHealth, taskHoldupRoles, attachDependencies, openBlockers,
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

// ── Waiting vs holding up ──
// Design waits on Development's API. That is only "holding up" when the API is
// late, due after Design needs it, or (with no due date) waited on too long.
const DEV = "dev", DESIGN = "design"
const pair = [
    { team_space_id: DEV, name: "Development", is_lead_department: true, due_date: "2026-12-20" },
    { team_space_id: DESIGN, name: "Design", due_date: "2026-12-20" },
]
const api = (fields = {}) => task("api", DEV, { due_date: "2026-12-01", ...fields })
const ui = (fields = {}) => task("ui", DESIGN, { due_date: "2026-12-10", blocked_by_task_id: "api", blocked_at: "2026-11-16T09:00:00", ...fields })

test("waiting on a task that is on schedule is not holding anyone up", () => {
    const list = [api(), ui()]
    const s = byId(summarizeDepartments({ departments: pair, tasks: list, now: NOW }))
    assert.equal(dependencyState(list[1], list[0], NOW), "on_schedule")
    assert.equal(s[DEV].status, "on_track")
    assert.equal(s[DESIGN].status, "on_track")
    assert.deepEqual(delayCulprits(Object.values(s)), [])
    assert.equal(projectDelayStatus(Object.values(s), "2026-12-20", NOW), "on_track")
    assert.deepEqual(delayingTasks(list, Object.values(s), NOW), [])
    assert.equal(departmentNote(s[DEV], (id) => s[id]?.name), "Design is waiting on 1 of its tasks, on schedule.")
    assert.equal(departmentNote(s[DESIGN], (id) => s[id]?.name), "Waiting on 1 Development task, on schedule.")
})

test("an overdue blocking task holds the other department up", () => {
    const list = [api({ due_date: "2026-11-14" }), ui()]
    const s = summarizeDepartments({ departments: pair, tasks: list, now: NOW })
    assert.equal(dependencyState(list[1], list[0], NOW), "late")
    assert.equal(byId(s)[DESIGN].status, "blocked")
    assert.deepEqual(delayCulprits(s).map((d) => d.id), [DEV])
})

test("a blocking task due after the waiting task needs it is a date conflict", () => {
    const list = [api({ due_date: "2026-12-15" }), ui()]
    const s = summarizeDepartments({ departments: pair, tasks: list, now: NOW })
    assert.equal(dependencyState(list[1], list[0], NOW), "conflict")
    assert.equal(byId(s)[DEV].status, "at_risk")
    assert.deepEqual(delayCulprits(s).map((d) => d.id), [DEV])
    assert.equal(culpritHeadline(delayCulprits(s)[0], s, list, NOW).detail, "Design is waiting on 1 of its tasks, due after Design needs it.")
})

test("a blocking task with no due date holds others up once waited on too long", () => {
    assert.equal(dependencyState(ui({ blocked_at: "2026-11-15T09:00:00" }), api({ due_date: null }), NOW), "stalled")
    assert.equal(dependencyState(ui({ blocked_at: "2026-11-16T09:00:00" }), api({ due_date: null }), NOW), "on_schedule")
})

test("the project's health names who is holding it up, or nobody", () => {
    const late = projectHealth({ departments: pair, tasks: [api({ due_date: "2026-11-14" }), ui()], projectDueDate: "2026-12-20", now: NOW })
    assert.equal(late.status, "at_risk")
    assert.equal(late.culpritName, "Development")
    assert.equal(late.text, "At risk · Development is holding this up")
    const fine = projectHealth({ departments: pair, tasks: [api(), ui()], projectDueDate: "2026-12-20", now: NOW })
    assert.equal(fine.text, "On track")
    assert.equal(fine.culpritName, null)
})

test("board cards know whether a task holds others up or is held up", () => {
    const late = taskHoldupRoles([api({ due_date: "2026-11-14" }), ui()], NOW)
    assert.equal(late.get("api"), "holding")
    assert.equal(late.get("ui"), "held")
    assert.equal(taskHoldupRoles([api(), ui()], NOW).size, 0)
})

// ── Several dependencies per task (task_dependencies) ──
const deps = (...pairs) => pairs.map(([task_id, blocker_task_id, created_at = "2026-11-16T09:00:00"]) => ({ task_id, blocker_task_id, created_at, resolved_at: null }))

test("dependencies attach to their tasks, each with when the wait began", () => {
    const list = attachDependencies([task("a", DEV), task("b", DEV), task("c", DESIGN)], deps(["c", "a"], ["c", "b", "2026-11-10T09:00:00"]))
    const c = list.find((t) => t.id === "c")
    assert.deepEqual(c.blocked_by, [
        { id: "a", blocked_at: "2026-11-16T09:00:00", resolved_at: null, note: null },
        { id: "b", blocked_at: "2026-11-10T09:00:00", resolved_at: null, note: null },
    ])
    assert.deepEqual(list.find((t) => t.id === "a").blocked_by, [])
})

test("a task waiting on two tasks is held up by the late one only", () => {
    const list = attachDependencies([
        task("late", DEV, { due_date: "2026-11-14" }),
        task("fine", DEV, { due_date: "2026-12-01" }),
        task("ui", DESIGN, { due_date: "2026-12-10" }),
    ], deps(["ui", "late"], ["ui", "fine"]))
    const byKey = new Map(list.map((t) => [t.id, t]))
    assert.deepEqual(openBlockers(byKey.get("ui"), byKey).map((w) => w.blocker.id), ["late", "fine"])
    const s = byId(summarizeDepartments({ departments: pair, tasks: list, now: NOW }))
    assert.equal(s[DESIGN].status, "blocked")
    assert.deepEqual(s[DEV].waitedOnBy.map((l) => [l.tasks, l.holdingTasks]), [[2, 1]])
    const roles = taskHoldupRoles(list, NOW)
    assert.equal(roles.get("late"), "holding")
    assert.equal(roles.has("fine"), false)
    assert.deepEqual(delayingTasks(list, Object.values(s), NOW).map((r) => r.task.id), ["late"])
})

test("finished blockers stop counting, and loops are found through any path", () => {
    const list = attachDependencies([task("a", DEV, { status: "done" }), task("b", DEV), task("c", DESIGN)], deps(["c", "a"], ["c", "b"], ["b", "x"]))
    const byKey = new Map(list.map((t) => [t.id, t]))
    assert.deepEqual(openBlockers(byKey.get("c"), byKey).map((w) => w.blocker.id), ["b"])
    // c waits on b; b waiting on c would loop
    assert.equal(wouldCreateCycle(list, "b", "c"), true)
    assert.equal(wouldCreateCycle(list, "a", "c"), true)
    assert.equal(wouldCreateCycle(list, "c", "a"), false)
})

test("a task can wait on any open task of the project, in any department, once", () => {
    const list = attachDependencies([task("a", DEV), task("b", DESIGN), task("c", DEV), task("d", DEV, { status: "done" })], deps(["a", "b"]))
    assert.deepEqual(blockableTasks(list, "a").map((t) => t.id), ["c"])
    assert.deepEqual(blockableTasks(list, "a", DEV).map((t) => t.id), ["c"])
})
