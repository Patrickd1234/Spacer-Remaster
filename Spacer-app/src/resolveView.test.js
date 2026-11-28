import { test } from "node:test"
import assert from "node:assert/strict"
import { dueText, projectBlockers, departmentNextSteps, closeReadiness } from "./resolveView.js"

const NOW = new Date(2026, 11, 9, 12) // 9 Dec 2026
const departments = [
    { team_space_id: "eng", name: "Engineering", is_lead_department: true },
    { team_space_id: "design", name: "Design" },
    { team_space_id: "product", name: "Product" },
]
const task = (id, extra = {}) => ({ id, title: id, status: "todo", team_space_id: "eng", due_date: null, blocked_by: [], ...extra })

test("due text: overdue by, today, tomorrow, a date, none", () => {
    assert.deepEqual(dueText(task("a", { due_date: "2026-12-07" }), NOW), { text: "Overdue by 2 days", isOverdue: true })
    assert.equal(dueText(task("a", { due_date: "2026-12-09" }), NOW).text, "Due today")
    assert.equal(dueText(task("a", { due_date: "2026-12-10" }), NOW).text, "Due tomorrow")
    assert.equal(dueText(task("a", { due_date: "2026-12-20" }), NOW).text, "Due 20 Dec")
    assert.equal(dueText(task("a"), NOW).text, "No due date")
})

test("blockers: open tasks others wait on, most urgent first, with whose work waits", () => {
    const tasks = [
        task("screens", { team_space_id: "design", due_date: "2026-12-07" }),
        task("specs", { team_space_id: "design", due_date: "2026-12-09" }),
        task("endpoints", { due_date: "2026-12-10" }),
        task("flow", { team_space_id: "product", blocked_by: [{ id: "screens" }] }),
        task("auth", { blocked_by: [{ id: "specs" }, { id: "screens" }] }),
        task("copy", { team_space_id: "design", blocked_by: [{ id: "endpoints" }] }),
        task("done", { status: "done", blocked_by: [{ id: "endpoints" }] }),
        task("free"),
    ]
    const blockers = projectBlockers(tasks, departments, NOW)
    assert.deepEqual(blockers.map((b) => [b.task.id, b.departmentName, b.due.text, b.label]), [
        ["screens", "Design", "Overdue by 2 days", "Blocking Product, Engineering"],
        ["specs", "Design", "Due today", "Blocking Engineering"],
        ["endpoints", "Engineering", "Due tomorrow", "Blocking Design"],
    ])
    assert.deepEqual(projectBlockers(tasks, [], NOW).map((b) => b.label), ["Blocking 2 tasks", "Blocking 1 task", "Blocking 1 task"])
})

test("next steps: overdue first, then held up, blocking, on track", () => {
    const blockers = [{ departmentId: "eng", blocksOthers: true, task: task("x") }]
    const steps = departmentNextSteps([
        { id: "design", name: "Design", status: "delayed", overdue: 2, remaining: 3, waitingOn: [], lead_id: "u1" },
        { id: "product", name: "Product", status: "on_track", overdue: 0, remaining: 2, waitingOn: [], lead_id: "u2" },
        { id: "eng", name: "Engineering", status: "at_risk", overdue: 0, remaining: 4, waitingOn: [], lead_id: null },
        { id: "ops", name: "Ops", status: "done", overdue: 0, remaining: 0, waitingOn: [], lead_id: "u3" },
    ], blockers)
    assert.deepEqual(steps.map((s) => [s.name, s.text, s.action]), [
        ["Design", "2 overdue tasks • Action needed", "nudge"],
        ["Product", "No overdue tasks", "view"],
        ["Engineering", "1 task blocking another department", "view"], // no lead to nudge
        ["Ops", "All its tasks are done", "view"],
    ])
})

test("the project closes only with every task done and no invite waiting", () => {
    assert.deepEqual(closeReadiness([task("a"), task("b", { status: "done" })], [], [{}]), {
        canClose: false, reason: "1 task still open and 1 open blocker. Every task must be done first.",
    })
    assert.equal(closeReadiness([task("a", { status: "done" })], [{ name: "Design" }]).reason, "An invite is still waiting for an answer.")
    assert.equal(closeReadiness([task("a", { status: "done" })], []).canClose, true)
})
