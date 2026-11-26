import { test } from "node:test"
import assert from "node:assert/strict"
import { statusFromSubtasks } from "./taskStatus.js"
import { STATUS_VALUES, statusInfo, statusLabel, statusGroup, isOpenStatus } from "./taskStatuses.js"

test("five statuses in board order", () => {
    assert.deepEqual(STATUS_VALUES, ["todo", "in_progress", "waiting", "in_review", "done"])
})

test("labels, with the default board names, and unknown values read as To do", () => {
    assert.equal(statusLabel("in_review"), "In review")
    assert.equal(statusLabel("in_progress", { board: true }), "Doing")
    assert.equal(statusLabel("todo", { board: true }), "Backlog")
    assert.equal(statusLabel(undefined), "To do")
    assert.equal(statusInfo("nonsense").value, "todo")
})

test("Waiting and In review count as in progress where there are three buckets", () => {
    assert.equal(statusGroup("waiting"), "in_progress")
    assert.equal(statusGroup("in_review"), "in_progress")
    assert.equal(statusGroup("in_progress"), "in_progress")
    assert.equal(statusGroup("done"), "done")
    assert.equal(statusGroup(null), "todo")
    assert.equal(isOpenStatus("waiting"), true)
    assert.equal(isOpenStatus("done"), false)
})

test("ticking some checklist items leaves a Waiting or In review task where it is", () => {
    const some = [{ done: true }, { done: false }]
    assert.equal(statusFromSubtasks(some, "in_review"), null)
    assert.equal(statusFromSubtasks(some, "waiting"), null)
    assert.equal(statusFromSubtasks(some, "todo"), "in_progress")
    assert.equal(statusFromSubtasks([{ done: true }], "in_review"), "done")
})
