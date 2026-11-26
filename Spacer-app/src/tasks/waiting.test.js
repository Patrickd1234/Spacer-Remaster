import { test } from "node:test"
import assert from "node:assert/strict"
import { openWaits, waitingLabel, recentUnblock, choicesInDepartment, newlyUnblocked, taskDepartmentName } from "./waiting.js"

const DESIGN = "d1"
const ENG = "d2"
const departments = [{ team_space_id: ENG, name: "Engineering" }, { team_space_id: DESIGN, name: "Design" }]
const task = (id, extra = {}) => ({ id, title: id.toUpperCase(), status: "todo", team_space_id: ENG, blocked_by: [], ...extra })
const edge = (id, extra = {}) => ({ id, blocked_at: "2026-11-20T09:00:00Z", resolved_at: null, note: null, ...extra })

test("open waits list the unfinished tasks waited on, with department and note", () => {
    const screens = task("screens", { team_space_id: DESIGN })
    const done = task("done", { status: "done" })
    const ui = task("ui", { status: "waiting", blocked_by: [edge("screens", { note: "Need final screens" }), edge("done")] })
    const waits = openWaits(ui, [screens, done, ui], departments)
    assert.deepEqual(waits.map((w) => [w.blocker.id, w.departmentName, w.note]), [["screens", "Design", "Need final screens"]])
    assert.deepEqual(openWaits({ ...ui, status: "done" }, [screens, ui], departments), [])
})

test("the label names the departments waited on, or the task without departments", () => {
    const screens = task("screens", { team_space_id: DESIGN })
    const api = task("api")
    const ui = task("ui", { blocked_by: [edge("screens"), edge("api")] })
    assert.equal(waitingLabel(ui, [screens, api, ui], departments), "Waiting on Design, Engineering")
    const solo = task("solo", { blocked_by: [edge("api")] })
    assert.equal(waitingLabel(solo, [api, solo], []), "Waiting on “API”")
    assert.equal(waitingLabel(ui, [screens, api, ui], []), "Waiting on 2 tasks")
    assert.equal(waitingLabel(task("free"), [], departments), null)
})

test("a wait that ended in the last week shows once nothing else is open", () => {
    const now = new Date("2026-11-26T12:00:00Z")
    const screens = task("screens", { status: "done", team_space_id: DESIGN })
    const flow = task("flow", { status: "in_progress", blocked_by: [edge("screens", { resolved_at: "2026-11-25T10:24:00Z" })] })
    const found = recentUnblock(flow, [screens, flow], departments, now)
    assert.equal(found.blocker.id, "screens")
    assert.equal(found.departmentName, "Design")
    assert.equal(recentUnblock(flow, [screens, flow], departments, new Date("2026-12-10T00:00:00Z")), null)
    assert.equal(recentUnblock({ ...flow, status: "waiting" }, [screens, flow], departments, now), null)
    const other = task("other")
    const stillWaiting = { ...flow, blocked_by: [...flow.blocked_by, edge("other")] }
    assert.equal(recentUnblock(stillWaiting, [screens, other, stillWaiting], departments, now), null)
})

test("choices narrow to one department; the lead department owns tasks without one", () => {
    const choices = [task("a", { team_space_id: DESIGN }), task("b", { team_space_id: null }), task("c")]
    assert.deepEqual(choicesInDepartment(choices, departments, DESIGN).map((t) => t.id), ["a"])
    assert.deepEqual(choicesInDepartment(choices, departments, ENG).map((t) => t.id), ["b", "c"])
    assert.equal(choicesInDepartment(choices, departments, "").length, 3)
    assert.equal(taskDepartmentName(choices[0], departments), "Design")
    assert.equal(taskDepartmentName(choices[0], []), "")
})

test("newly unblocked: my Waiting tasks whose wait ended, not ones simply moved", () => {
    const open = [edge("x")]
    const ended = [edge("x", { resolved_at: "2026-11-26T10:00:00Z" })]
    const before = ["a", "b", "c", "d"].map((id) => task(id, { status: "waiting", assignee_id: id === "b" ? "you" : "me", blocked_by: open }))
    const after = [
        task("a", { status: "in_progress", assignee_id: "me", blocked_by: ended }),
        task("b", { status: "todo", assignee_id: "you", blocked_by: ended }),
        task("c", { status: "done", assignee_id: "me", blocked_by: ended }),
        task("d", { status: "in_review", assignee_id: "me", blocked_by: open }), // moved by hand
    ]
    assert.deepEqual(newlyUnblocked(before, after, "me").map((t) => t.id), ["a"])
    assert.deepEqual(newlyUnblocked(before, after, null), [])
})
