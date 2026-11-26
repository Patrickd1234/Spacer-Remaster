import { test } from "node:test"
import assert from "node:assert/strict"
import { buildHoldups, holdupsForMe, heldUpProjects, holdupReason } from "./holdups.js"

const NOW = new Date(2026, 10, 25, 12) // 25 Nov 2026
const project = { id: "p1", name: "Nightfall", team_space_id: "dev" }
const waiting = (fields = {}) => ({ id: "ui", title: "Build UI", status: "todo", due_date: "2026-12-10", team_space_id: "design", project_id: "p1", project, ...fields })
const blocker = (fields = {}) => ({ id: "api", title: "Ship API", status: "in_progress", due_date: "2026-11-22", team_space_id: null, project_id: "p1", assignee_id: "u9", project, ...fields })
// task_dependencies rows with both tasks embedded
const edge = (task = waiting(), block = blocker(), created_at = "2026-11-20T09:00:00") => [{ task_id: task.id, blocker_task_id: block.id, created_at, task, blocker: block }]

test("each open wait across projects gets its departments and state", () => {
    const [row] = buildHoldups(edge(), NOW)
    assert.equal(row.projectId, "p1")
    assert.equal(row.waitingDepartmentId, "design")
    assert.equal(row.blockerDepartmentId, "dev") // no department = the project's lead department
    assert.equal(row.state, "late")
    assert.equal(row.isHolding, true)
    assert.equal(row.lateDays, 3)
})

test("finished blockers and waits inside one department are left out", () => {
    assert.deepEqual(buildHoldups(edge(waiting(), blocker({ status: "done" })), NOW), [])
    assert.deepEqual(buildHoldups(edge(waiting({ team_space_id: null })), NOW), [])
})

test("for me: what my departments hold up, and what they wait on", () => {
    const rows = buildHoldups(edge(), NOW)
    assert.equal(holdupsForMe(rows, { departmentIds: ["dev"] }).holdingUp.length, 1)
    assert.equal(holdupsForMe(rows, { departmentIds: ["dev"] }).waitingOn.length, 0)
    assert.equal(holdupsForMe(rows, { departmentIds: ["design"] }).waitingOn.length, 1)
    // The blocking task's assignee sees it too, wherever they sit
    assert.equal(holdupsForMe(rows, { departmentIds: [], userId: "u9" }).holdingUp.length, 1)
    // Organization-wide admins see every hold-up
    assert.equal(holdupsForMe(rows, { departmentIds: [], isOrgWide: true }).holdingUp.length, 1)
})

test("on-schedule waits are counted but not listed as hold-ups", () => {
    const rows = buildHoldups(edge(waiting(), blocker({ due_date: "2026-12-01" })), NOW)
    const mine = holdupsForMe(rows, { departmentIds: ["dev"] })
    assert.equal(mine.holdingUp.length, 0)
    assert.equal(mine.onScheduleCount, 1)
    assert.equal(heldUpProjects(rows).size, 0)
})

test("held-up projects name who holds them up", () => {
    const rows = buildHoldups(edge(), NOW)
    const names = new Map([["dev", "Development"], ["design", "Design"]])
    assert.equal(heldUpProjects(rows, (id) => names.get(id)).get("p1"), "Development is holding up Design")
})

test("reasons read as plain words", () => {
    assert.equal(holdupReason({ state: "late", lateDays: 3 }), "3 days late")
    assert.equal(holdupReason({ state: "late", lateDays: 1 }), "1 day late")
    assert.equal(holdupReason({ state: "conflict" }), "due after it's needed")
    assert.equal(holdupReason({ state: "stalled", waitingDays: 4 }), "waited on for 4 days, no due date")
})

test("a task waiting on two tasks gives a row for each", () => {
    const other = blocker({ id: "db", title: "Set up DB", due_date: "2026-12-01" })
    const rows = buildHoldups([...edge(), ...edge(waiting(), other)], NOW)
    assert.deepEqual(rows.map((r) => [r.blocker.id, r.isHolding]), [["api", true], ["db", false]])
})
