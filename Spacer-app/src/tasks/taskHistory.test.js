import { test } from "node:test"
import assert from "node:assert/strict"
import { taskChanges, buildTaskHistory, dependencyLines } from "./taskHistory.js"

const names = {
    personName: (id) => ({ ada: "Ada Obi" })[id],
    departmentName: (id) => ({ design: "Design" })[id],
    statusName: (task) => (task.column_id === "c-review" ? "In review" : null),
    taskTitle: (id) => ({ p: "Launch site" })[id],
}

test("each tracked field becomes a line", () => {
    const before = { title: "Old", description: null, status: "todo", priority: "low", due_date: null, assignee_id: null, team_space_id: null, parent_task_id: null }
    const after = { title: "New", description: "Text", status: "in_progress", priority: "high", due_date: "2026-12-05", assignee_id: "ada", team_space_id: "design", parent_task_id: "p" }
    assert.deepEqual(taskChanges(before, after, names), [
        "renamed it from “Old” to “New”",
        "added a description",
        "moved it to Doing",
        "set the priority to High",
        "set the due date to 5 Dec 2026",
        "assigned it to Ada Obi",
        "gave it to Design",
        "made it a subtask of “Launch site”",
    ])
})

test("removals and custom columns", () => {
    assert.deepEqual(
        taskChanges({ description: "x", due_date: "2026-12-01", assignee_id: "ada", parent_task_id: "p", status: "todo" }, { description: "", due_date: null, assignee_id: null, parent_task_id: null, status: "in_progress", column_id: "c-review" }, names),
        ["removed the description", "moved it to In review", "removed the due date", "unassigned it", "made it a task of its own"],
    )
})

test("checklist items added, ticked and removed", () => {
    const before = JSON.stringify([{ id: "1", title: "Draft", done: false }, { id: "2", title: "Old", done: false }])
    const after = JSON.stringify([{ id: "1", title: "Draft", done: true }, { id: "3", title: "Review", done: false }])
    assert.deepEqual(taskChanges({ sub_tasks: before }, { sub_tasks: after }), [
        "ticked “Draft”", "added “Review” to the checklist", "removed “Old” from the checklist",
    ])
})

test("history: newest first, app duplicates and empty changes dropped", () => {
    const rows = [
        { id: "1", action: "created", actor_id: "ada", created_at: "2026-11-01T10:00:00Z", new_state: {} },
        { id: "2", action: "updated", actor_id: "ada", actor: { name: "Ada" }, created_at: "2026-11-02T10:00:00Z", prior_state: { priority: "low" }, new_state: { priority: "high" } },
        { id: "3", action: "priority_changed", actor_id: "ada", created_at: "2026-11-02T10:00:01Z", new_state: { priority: "high" } },
        { id: "4", action: "updated", actor_id: "ada", created_at: "2026-11-03T10:00:00Z", prior_state: { updated_at: "a" }, new_state: { updated_at: "b" } },
    ]
    const history = buildTaskHistory(rows, names)
    assert.deepEqual(history.map((e) => e.id), ["2", "1"])
    assert.equal(history[0].actorName, "Ada")
    assert.equal(history[1].actorName, "Ada Obi")
    assert.deepEqual(history[1].lines, ["created this task"])
})

test("dependency rows read as lines, with the department and the note", () => {
    const s = { blocker_title: "Create screens", blocker_department: "Design", note: "Need the final screens" }
    assert.deepEqual(dependencyLines("dependency_added", s), ["made it wait on “Create screens” (Design): “Need the final screens”"])
    assert.deepEqual(dependencyLines("dependency_removed", { blocker_title: "API" }), ["stopped it waiting on “API”"])
    assert.deepEqual(dependencyLines("unblocked", s), ["finished “Create screens” (Design), so this task was unblocked automatically"])
    const entries = buildTaskHistory([
        { id: 1, action: "unblocked", actor_id: "ada", created_at: "2026-11-26T10:24:00Z", new_state: s },
        { id: 2, action: "dependency_added", actor_id: "ada", created_at: "2026-11-25T14:17:00Z", new_state: s },
        { id: 3, action: "something_else", actor_id: "ada", created_at: "2026-11-25T14:18:00Z", new_state: {} },
    ], names)
    assert.deepEqual(entries.map((e) => e.kind), ["unblocked", "dependency_added"])
})
