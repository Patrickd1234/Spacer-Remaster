import { test } from "node:test"
import assert from "node:assert/strict"
import { departmentStats, filterByStatus, dependencyPairs, departmentMemberCounts, boardDependencySummary } from "./departmentsView.js"

const summary = (id, extra = {}) => ({ id, team_space_id: id, done: 0, total: 0, overdue: 0, waitingOn: [], status: "on_track", ...extra })

test("tiles add up the departments' figures", () => {
    const rows = [
        summary("design", { done: 2, total: 6, overdue: 2, status: "delayed" }),
        summary("product", { done: 3, total: 5, waitingOn: [{ departmentId: "design", tasks: 1, holdingTasks: 1, days: 2 }] }),
        summary("eng", { done: 2, total: 5, waitingOn: [{ departmentId: "product", tasks: 1, holdingTasks: 0, days: 0 }], status: "at_risk" }),
    ]
    assert.deepEqual(departmentStats(rows), { departments: 3, done: 7, total: 16, overdue: 2, waitingDepartments: 2 })
    assert.deepEqual(filterByStatus(rows, "at_risk").map((s) => s.id), ["eng"])
    assert.equal(filterByStatus(rows, "").length, 3)
    assert.deepEqual(dependencyPairs(rows).map((p) => [p.from, p.to, p.label]), [
        ["product", "design", "holding up 1 task"],
        ["eng", "product", "1 task on schedule"],
    ])
})

test("member counts: project members per department, each once", () => {
    const memberships = [
        { user_id: "u1", team_space_id: "design" }, { user_id: "u1", team_space_id: "design" },
        { user_id: "u2", team_space_id: "design" }, { user_id: "u3", team_space_id: "eng" },
        { user_id: "u1", team_space_id: "eng" },
    ]
    const counts = departmentMemberCounts(["u1", "u3"], memberships)
    assert.equal(counts.get("design"), 1)
    assert.equal(counts.get("eng"), 2)
})

test("board summary: who waits on which department, and who blocks another department", () => {
    const departments = [{ team_space_id: "eng", name: "Engineering" }, { team_space_id: "design", name: "Design" }]
    const tasks = [
        { id: "screens", status: "in_progress", team_space_id: "design", blocked_by: [] },
        { id: "auth", status: "waiting", team_space_id: "eng", blocked_by: [{ id: "screens" }] },
        { id: "copy", status: "todo", team_space_id: "design", blocked_by: [{ id: "screens" }] }, // inside Design
        { id: "api", status: "todo", team_space_id: "design", blocked_by: [{ id: "screens" }, { id: "auth" }] },
        { id: "old", status: "done", team_space_id: "eng", blocked_by: [{ id: "screens" }] },
    ]
    const summary = boardDependencySummary(tasks, departments)
    assert.deepEqual(summary.waiting, [{ name: "Design", count: 1 }, { name: "Engineering", count: 1 }])
    assert.equal(summary.blockingOthers, 2)
    assert.equal(summary.text, "1 task is waiting on Design, 1 task is waiting on Engineering • 2 tasks are blocking other departments")
    assert.equal(boardDependencySummary(tasks, []).text, "3 tasks are waiting on other tasks")
    assert.equal(boardDependencySummary([], departments).text, "No task is waiting on another department • 0 tasks are blocking other departments")
})
