import { test } from "node:test"
import assert from "node:assert/strict"
import { departmentScorecard } from "./departmentScorecard.js"

const NOW = new Date(2026, 10, 25, 12) // 25 Nov 2026
const project = { team_space_id: "dev" }
const task = (id, fields = {}) => ({ id, status: "todo", due_date: "2026-12-10", completed_at: null, team_space_id: "dev", project_id: "p1", project, ...fields })
const dep = (task_id, blocker_task_id, created_at, resolved_at = null) => ({ task_id, blocker_task_id, created_at, resolved_at })
const names = new Map([["dev", "Development"], ["design", "Design"]])

const tasks = [
    task("api", { due_date: "2026-11-20" }),                                   // Development, 5 days late, Design waits
    task("db", { status: "done", due_date: "2026-11-15", completed_at: "2026-11-14T10:00:00" }), // on time
    task("auth", { status: "done", due_date: "2026-11-15", completed_at: "2026-11-18T10:00:00" }), // late
    task("ui", { team_space_id: "design", due_date: "2026-12-01" }),
    task("copy", { team_space_id: "design", status: "done", due_date: null, completed_at: "2026-11-10T10:00:00" }),
    task("lead", { team_space_id: null }),                                      // no department = the project's lead (dev)
]
const deps = [
    dep("ui", "api", "2026-11-18T09:00:00"),                                       // open, Development holding Design up
    dep("ui", "db", "2026-11-10T09:00:00", "2026-11-14T10:00:00"),                 // Design waited 4 days, resolved
]

test("each department: open, overdue, on-time rate and its hold-ups", () => {
    const rows = departmentScorecard({ tasks, dependencies: deps, nameOf: (id) => names.get(id), now: NOW })
    const dev = rows.find((r) => r.id === "dev")
    assert.equal(dev.name, "Development")
    assert.equal(dev.open, 2)
    assert.equal(dev.overdue, 1)
    assert.equal(dev.onTimeRate, 0.5)          // db on time, auth late
    assert.equal(dev.holdingUpNow, 1)
    assert.equal(dev.othersWaitedDays, 4 + 7)  // 4 days resolved + 7 days open (18 to 25 Nov)
    const design = rows.find((r) => r.id === "design")
    assert.equal(design.heldUpNow, 1)
    assert.equal(design.onTimeRate, null)       // nothing finished with a due date
})

test("most holding-up first, then most overdue", () => {
    const rows = departmentScorecard({ tasks, dependencies: deps, nameOf: (id) => names.get(id), now: NOW })
    assert.deepEqual(rows.map((r) => r.id), ["dev", "design"])
})

test("waits inside one department don't count as hold-ups", () => {
    const rows = departmentScorecard({ tasks, dependencies: [dep("lead", "api", "2026-11-18T09:00:00")], nameOf: (id) => names.get(id), now: NOW })
    assert.equal(rows.find((r) => r.id === "dev").holdingUpNow, 0)
    assert.equal(rows.find((r) => r.id === "dev").othersWaitedDays, 0)
})
