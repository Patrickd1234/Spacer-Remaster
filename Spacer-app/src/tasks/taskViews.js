// Views of a project's tasks (part F): board or list, a search, quick
// filters, grouping and sorting. A view is plain data, so it can be saved
// (task_views.config), remembered per project, and checked when it comes back.
// No imports, so `npm test` can load it.

export const VIEW_MODES = ["board", "list"]
export const QUICK_FILTERS = [
    { key: "mine", label: "Mine" },
    { key: "unassigned", label: "Unassigned" },
    { key: "overdue", label: "Overdue" },
    { key: "due_week", label: "Due this week" },
    { key: "urgent", label: "High priority" },
]
export const GROUP_OPTIONS = [
    { key: "status", label: "Status" },
    { key: "assignee", label: "Assignee" },
    { key: "priority", label: "Priority" },
    { key: "department", label: "Department" },
    { key: "none", label: "No grouping" },
]
export const SORT_OPTIONS = [
    { key: "created", label: "Newest first" },
    { key: "due", label: "Due date" },
    { key: "priority", label: "Priority" },
    { key: "title", label: "Title" },
]
export const PRIORITY_ORDER = ["urgent", "high", "medium", "low"]
const PRIORITY_NAMES = { urgent: "Urgent", high: "High", medium: "Medium", low: "Low" }
const SEARCH_MAX = 200
const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_DAYS = 7

export const DEFAULT_VIEW = Object.freeze({
    mode: "board",
    search: "",
    quick: [],
    groupBy: "status",
    sortBy: "created",
})

const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback)

/** A view from anything (saved JSON, storage): unknown values fall back to the defaults. */
export function normalizeView(raw) {
    const view = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}
    const quickKeys = QUICK_FILTERS.map((f) => f.key)
    return {
        mode: oneOf(view.mode, VIEW_MODES, DEFAULT_VIEW.mode),
        search: typeof view.search === "string" ? view.search.slice(0, SEARCH_MAX) : "",
        quick: Array.isArray(view.quick) ? [...new Set(view.quick.filter((k) => quickKeys.includes(k)))] : [],
        groupBy: oneOf(view.groupBy, GROUP_OPTIONS.map((g) => g.key), DEFAULT_VIEW.groupBy),
        sortBy: oneOf(view.sortBy, SORT_OPTIONS.map((s) => s.key), DEFAULT_VIEW.sortBy),
    }
}

/** Whether two views show the same thing (to tell a saved view has been changed). */
export function sameView(a, b) {
    const x = normalizeView(a)
    const y = normalizeView(b)
    return x.mode === y.mode && x.search === y.search && x.groupBy === y.groupBy && x.sortBy === y.sortBy
        && x.quick.length === y.quick.length && x.quick.every((k) => y.quick.includes(k))
}

const dayStart = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
const dueDay = (task) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(task.due_date || "")
    return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime() : null
}

/**
 * The tasks the view shows. `ctx.me` is the viewer's id, `ctx.keyOf(task)`
 * gives its key ("DEV-12") so search finds it by key too.
 */
export function filterTasks(tasks, view, { me = null, now = new Date(), keyOf = () => "" } = {}) {
    const { search, quick } = normalizeView(view)
    const needle = search.trim().toLowerCase()
    const today = dayStart(now)
    const tests = {
        mine: (t) => Boolean(me) && t.assignee_id === me,
        unassigned: (t) => !t.assignee_id,
        overdue: (t) => t.status !== "done" && dueDay(t) !== null && dueDay(t) < today,
        due_week: (t) => t.status !== "done" && dueDay(t) !== null && dueDay(t) >= today && dueDay(t) < today + WEEK_DAYS * DAY_MS,
        urgent: (t) => t.priority === "urgent" || t.priority === "high",
    }
    return tasks.filter((t) => {
        if (needle && !`${t.title || ""} ${keyOf(t) || ""}`.toLowerCase().includes(needle)) return false
        return quick.every((key) => tests[key](t))
    })
}

const priorityRank = (t) => {
    const i = PRIORITY_ORDER.indexOf(t.priority)
    return i === -1 ? PRIORITY_ORDER.length : i
}

/** A sorted copy. Tasks without a due date come last when sorting by due date. */
export function sortTasks(tasks, view) {
    const { sortBy } = normalizeView(view)
    const byCreated = (a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))
    const compare = {
        created: byCreated,
        due: (a, b) => {
            const x = dueDay(a)
            const y = dueDay(b)
            if (x === y) return byCreated(a, b)
            if (x === null) return 1
            if (y === null) return -1
            return x - y
        },
        priority: (a, b) => priorityRank(a) - priorityRank(b) || byCreated(a, b),
        title: (a, b) => String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base" }) || byCreated(a, b),
    }[sortBy]
    return [...tasks].sort(compare)
}

/**
 * The list view's groups, each { key, label, tasks, defaults }: `defaults` are
 * what a task added in that group gets (its column, assignee, priority or
 * department). Status groups follow the board's columns and stay even when
 * empty, so a task can be added to any of them.
 * ctx: { columns, columnKeyOf(task), personName(id), departments, leadDepartmentId }
 */
export function groupTasks(tasks, groupBy, ctx = {}) {
    const { columns = [], columnKeyOf = () => null, personName = () => null, departments = [], leadDepartmentId = null } = ctx
    if (groupBy === "none") return [{ key: "all", label: "All tasks", tasks, defaults: {} }]
    if (groupBy === "status") {
        return columns.map((column) => ({
            key: `status:${column.key}`,
            label: column.name,
            tasks: tasks.filter((t) => columnKeyOf(t) === column.key),
            defaults: { column },
        }))
    }
    if (groupBy === "priority") {
        return [...PRIORITY_ORDER, null]
            .map((p) => ({
                key: `priority:${p ?? "none"}`,
                label: p ? PRIORITY_NAMES[p] : "No priority",
                tasks: tasks.filter((t) => (PRIORITY_ORDER.includes(t.priority) ? t.priority : null) === p),
                defaults: p ? { priority: p } : {},
            }))
            .filter((g) => g.tasks.length > 0)
    }
    if (groupBy === "assignee") {
        const ids = [...new Set(tasks.map((t) => t.assignee_id).filter(Boolean))]
        const named = ids
            .map((id) => ({ key: `assignee:${id}`, label: personName(id) || "Someone", tasks: tasks.filter((t) => t.assignee_id === id), defaults: { assignee_id: id } }))
            .sort((a, b) => a.label.localeCompare(b.label))
        const unassigned = tasks.filter((t) => !t.assignee_id)
        return unassigned.length > 0 ? [...named, { key: "assignee:none", label: "Unassigned", tasks: unassigned, defaults: {} }] : named
    }
    // department: the project's departments in order; a task without one is the lead department's
    const departmentOf = (t) => String(t.team_space_id ?? leadDepartmentId ?? "")
    const known = departments.map((d) => String(d.team_space_id))
    const groups = departments.map((d) => ({
        key: `department:${d.team_space_id}`,
        label: d.name || "A department",
        tasks: tasks.filter((t) => departmentOf(t) === String(d.team_space_id)),
        defaults: { team_space_id: d.team_space_id },
    }))
    const other = tasks.filter((t) => !known.includes(departmentOf(t)))
    return [...groups, ...(other.length > 0 ? [{ key: "department:other", label: "Other", tasks: other, defaults: {} }] : [])]
        .filter((g) => g.tasks.length > 0)
}

/**
 * What a change to several tasks did, for the bulk bar: results are
 * { error } per task. "Changed 3 tasks." or "Changed 3 of 5 tasks. 2 weren't
 * changed: <first error>".
 */
export function bulkSummary(results, verb = "Changed") {
    const total = results.length
    const failed = results.filter((r) => r.error)
    const done = total - failed.length
    const noun = (n) => `task${n === 1 ? "" : "s"}`
    if (failed.length === 0) return { message: `${verb} ${done} ${noun(done)}.`, isError: false }
    const head = done === 0 ? `Nothing was ${verb.toLowerCase()}.` : `${verb} ${done} of ${total} ${noun(total)}.`
    return { message: `${head} ${failed.length} ${failed.length === 1 ? "wasn't" : "weren't"}: ${failed[0].error}`, isError: true }
}
