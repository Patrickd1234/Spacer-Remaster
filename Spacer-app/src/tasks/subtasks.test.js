import { test } from "node:test"
import assert from "node:assert/strict"
import { subtasksOf, subtaskProgress, parentOf, canHaveSubtasks, newSubtaskFields } from "./subtasks.js"

const tasks = [
    { id: "p", title: "Parent", status: "in_progress", created_at: "2026-11-01" },
    { id: "b", parent_task_id: "p", status: "done", created_at: "2026-11-03" },
    { id: "a", parent_task_id: "p", status: "todo", created_at: "2026-11-02" },
    { id: "x", status: "todo", created_at: "2026-11-04" },
]

test("a task's subtasks, oldest first", () => {
    assert.deepEqual(subtasksOf(tasks, "p").map((t) => t.id), ["a", "b"])
    assert.deepEqual(subtasksOf(tasks, "x"), [])
    assert.deepEqual(subtasksOf(tasks, null), [])
})

test("progress counts finished subtasks", () => {
    assert.deepEqual(subtaskProgress(tasks, "p"), { done: 1, total: 2 })
    assert.deepEqual(subtaskProgress(tasks, "x"), { done: 0, total: 0 })
})

test("parent lookup and the one-level rule", () => {
    const byId = new Map(tasks.map((t) => [t.id, t]))
    assert.equal(parentOf(tasks[1], byId).id, "p")
    assert.equal(parentOf(tasks[0], byId), null)
    assert.equal(canHaveSubtasks(tasks[0]), true)
    assert.equal(canHaveSubtasks(tasks[1]), false)
})

test("a new subtask copies the parent's project, organization and department", () => {
    const parent = { id: "p", project_id: "proj", organization_id: "org", team_space_id: "dev" }
    assert.deepEqual(newSubtaskFields(parent, "  Write tests ", "me"), {
        title: "Write tests", project_id: "proj", organization_id: "org", parent_task_id: "p",
        status: "todo", priority: "medium", created_by: "me", team_space_id: "dev",
    })
    assert.equal("team_space_id" in newSubtaskFields({ ...parent, team_space_id: null }, "x", "me"), false)
})
