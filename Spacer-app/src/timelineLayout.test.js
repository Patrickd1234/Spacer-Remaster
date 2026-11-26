import { test } from "node:test"
import assert from "node:assert/strict"
import { timelineRange, packRows, layoutTimeline } from "./timelineLayout.js"

const NOW = new Date(2026, 10, 25, 12) // 25 Nov 2026
const task = (id, fields = {}) => ({ id, title: id.toUpperCase(), status: "todo", team_space_id: "dev", created_at: "2026-11-20T09:00:00", due_date: "2026-11-28", blocked_by: [], ...fields })

test("the range covers today, every task and the project deadline, with a little room", () => {
    const range = timelineRange([task("a", { created_at: "2026-11-10T09:00:00" }), task("b", { due_date: "2026-12-05" })], "2026-12-10", NOW)
    assert.equal(range.start.toDateString(), new Date(2026, 10, 8).toDateString())
    assert.equal(range.end.toDateString(), new Date(2026, 11, 12).toDateString())
    assert.equal(range.days, 35)
})

test("the range never runs longer than the cap", () => {
    const range = timelineRange([task("a", { created_at: "2025-01-01T09:00:00" })], "2026-12-10", NOW, { maxDays: 60 })
    assert.equal(range.days, 60)
})

test("bars that overlap go on separate rows; later ones reuse free rows", () => {
    const rows = packRows([{ id: "a", from: 0, to: 5 }, { id: "b", from: 3, to: 8 }, { id: "c", from: 6, to: 9 }])
    assert.deepEqual(rows, { a: 0, b: 1, c: 0 })
})

test("lanes per department, bars from start to due, arrows from blocker to waiting task", () => {
    const tasks = [
        task("api", { team_space_id: "dev", created_at: "2026-11-20T09:00:00", due_date: "2026-11-22" }),
        task("ui", { team_space_id: "design", created_at: "2026-11-21T09:00:00", due_date: "2026-11-30", blocked_by: [{ id: "api", blocked_at: "2026-11-21T09:00:00" }] }),
        task("note", { team_space_id: "design", due_date: null, created_at: "2026-11-24T09:00:00" }),
    ]
    const departments = [{ team_space_id: "dev", name: "Development", due_date: "2026-11-29" }, { team_space_id: "design", name: "Design", due_date: null }]
    const layout = layoutTimeline({ tasks, departments, projectDueDate: "2026-12-01", now: NOW })
    assert.deepEqual(layout.lanes.map((l) => [l.name, l.bars.map((b) => b.task.id)]), [["Development", ["api"]], ["Design", ["ui", "note"]]])
    const ui = layout.lanes[1].bars[0]
    assert.equal(ui.to - ui.from, 9) // 21 Nov to 30 Nov
    assert.equal(layout.lanes[1].bars[1].hasNoDueDate, true)
    assert.equal(layout.arrows.length, 1)
    assert.deepEqual([layout.arrows[0].fromId, layout.arrows[0].toId, layout.arrows[0].isHolding], ["api", "ui", true])
    assert.equal(layout.lanes[0].dueDay, layout.dayOf("2026-11-29"))
})

test("a one-department project gets a single lane", () => {
    const layout = layoutTimeline({ tasks: [task("a"), task("b", { team_space_id: null })], departments: [], projectDueDate: null, now: NOW })
    assert.deepEqual(layout.lanes.map((l) => [l.name, l.bars.length]), [["Tasks", 2]])
})
