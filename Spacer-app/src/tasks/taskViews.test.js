import { test } from "node:test"
import assert from "node:assert/strict"
import { DEFAULT_VIEW, normalizeView, sameView, filterTasks, sortTasks, groupTasks, bulkSummary } from "./taskViews.js"

const NOW = new Date(2026, 10, 27, 12) // 27 Nov 2026
const task = (id, fields = {}) => ({ id, title: id, status: "todo", priority: "medium", due_date: null, assignee_id: null, created_at: `2026-11-0${id.length}`, ...fields })
const tasks = [
    task("api", { assignee_id: "me", due_date: "2026-11-20", priority: "urgent" }),         // overdue, mine
    task("ui", { assignee_id: "ada", due_date: "2026-11-30", priority: "low" }),            // due this week
    task("docs", { due_date: "2026-12-20", priority: null }),                               // unassigned
    task("done", { status: "done", assignee_id: "me", due_date: "2026-11-01", priority: "high" }),
]

test("a saved view from untrusted JSON keeps only known values", () => {
    assert.deepEqual(normalizeView(null), { ...DEFAULT_VIEW, quick: [] })
    assert.deepEqual(normalizeView({ mode: "list", search: 42, quick: ["mine", "mine", "evil"], groupBy: "x", sortBy: "due" }), {
        mode: "list", search: "", quick: ["mine"], groupBy: "status", sortBy: "due",
    })
    assert.equal(normalizeView({ search: "a".repeat(500) }).search.length, 200)
    assert.equal(sameView({ quick: ["mine", "overdue"] }, { quick: ["overdue", "mine"] }), true)
    assert.equal(sameView({ sortBy: "due" }, {}), false)
})

test("quick filters and search combine", () => {
    const ids = (view) => filterTasks(tasks, view, { me: "me", now: NOW, keyOf: (t) => `DEV-${t.title.length}` }).map((t) => t.id)
    assert.deepEqual(ids({ quick: ["mine"] }), ["api", "done"])
    assert.deepEqual(ids({ quick: ["overdue"] }), ["api"])          // finished tasks are never overdue
    assert.deepEqual(ids({ quick: ["due_week"] }), ["ui"])
    assert.deepEqual(ids({ quick: ["unassigned"] }), ["docs"])
    assert.deepEqual(ids({ quick: ["urgent", "mine"] }), ["api", "done"])
    assert.deepEqual(ids({ search: "DOC" }), ["docs"])
    assert.deepEqual(ids({ search: "dev-2" }), ["ui"])               // by key
})

test("sorting: due date puts tasks without one last", () => {
    assert.deepEqual(sortTasks(tasks, { sortBy: "due" }).map((t) => t.id), ["done", "api", "ui", "docs"])
    assert.deepEqual(sortTasks(tasks, { sortBy: "priority" }).map((t) => t.id), ["api", "done", "ui", "docs"])
    assert.deepEqual(sortTasks(tasks, { sortBy: "title" }).map((t) => t.id), ["api", "docs", "done", "ui"])
    assert.deepEqual(sortTasks(tasks, { sortBy: "created" }).map((t) => t.id), ["docs", "done", "api", "ui"])
})

test("groups carry what a task added there gets", () => {
    const columns = [{ key: "todo", name: "Backlog" }, { key: "review", name: "Review" }]
    const byStatus = groupTasks(tasks, "status", { columns, columnKeyOf: (t) => (t.status === "done" ? "done" : "todo") })
    assert.deepEqual(byStatus.map((g) => [g.label, g.tasks.length]), [["Backlog", 3], ["Review", 0]])   // empty columns stay
    assert.equal(byStatus[1].defaults.column.key, "review")

    const byPerson = groupTasks(tasks, "assignee", { personName: (id) => ({ me: "Me", ada: "Ada" })[id] })
    assert.deepEqual(byPerson.map((g) => g.label), ["Ada", "Me", "Unassigned"])
    assert.deepEqual(byPerson[0].defaults, { assignee_id: "ada" })

    const byPriority = groupTasks(tasks, "priority")
    assert.deepEqual(byPriority.map((g) => g.label), ["Urgent", "High", "Low", "No priority"])

    const departments = [{ team_space_id: "dev", name: "Development" }, { team_space_id: "design", name: "Design" }]
    const byDepartment = groupTasks([...tasks, task("logo", { team_space_id: "design" })], "department", { departments, leadDepartmentId: "dev" })
    assert.deepEqual(byDepartment.map((g) => [g.label, g.tasks.length]), [["Development", 4], ["Design", 1]])
    assert.equal(groupTasks(tasks, "none")[0].tasks.length, 4)
})

test("bulk summary says what didn't change and why", () => {
    assert.deepEqual(bulkSummary([{ error: null }, { error: null }]), { message: "Changed 2 tasks.", isError: false })
    assert.deepEqual(bulkSummary([{ error: null }, { error: "No right." }, { error: "No right." }]), { message: "Changed 1 of 3 tasks. 2 weren't: No right.", isError: true })
    assert.deepEqual(bulkSummary([{ error: "No right." }], "Deleted"), { message: "Nothing was deleted. 1 wasn't: No right.", isError: true })
})
