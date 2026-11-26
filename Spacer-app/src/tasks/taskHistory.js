// A task's History tab: the database logs every change to a task
// (tasks_log_activity: "created", and "updated" with the row before and after),
// and this turns those rows into lines like "moved it to Doing". The app's own
// "status_changed" and "priority_changed" entries repeat what the database
// already logged, so they are skipped. No imports, so `npm test` can load it.
import { parseSubtasks } from "../taskStatus.js"

const PRIORITY_NAMES = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" }
const DEFAULT_STATUS_NAMES = { todo: "Backlog", in_progress: "Doing", done: "Done" }

const quoted = (text) => `“${text}”`
const itemText = (item) => String(item?.title ?? item?.text ?? "").trim() || "an item"
const shortDate = (value) => {
    const day = String(value).slice(0, 10)
    const date = new Date(`${day}T00:00:00`)
    return Number.isNaN(date.getTime()) ? day : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

function checklistChanges(before, after) {
    const old = new Map(parseSubtasks(before).map((item) => [String(item.id ?? itemText(item)), item]))
    const now = new Map(parseSubtasks(after).map((item) => [String(item.id ?? itemText(item)), item]))
    const lines = []
    for (const [id, item] of now) {
        const was = old.get(id)
        if (!was) lines.push(`added ${quoted(itemText(item))} to the checklist`)
        else if (Boolean(was.done) !== Boolean(item.done)) lines.push(`${item.done ? "ticked" : "unticked"} ${quoted(itemText(item))}`)
    }
    for (const [id, item] of old) {
        if (!now.has(id)) lines.push(`removed ${quoted(itemText(item))} from the checklist`)
    }
    return lines
}

/**
 * What one "updated" row changed, as short lines ("renamed it to …").
 * @param {object} before prior_state
 * @param {object} after new_state
 * @param {{ personName?: Function, departmentName?: Function, statusName?: Function, taskTitle?: Function }} names
 * @returns {string[]}
 */
export function taskChanges(before = {}, after = {}, names = {}) {
    const changed = (field) => JSON.stringify(before?.[field] ?? null) !== JSON.stringify(after?.[field] ?? null)
    const person = (id) => names.personName?.(id) || "someone"
    const status = (task) => names.statusName?.(task) || DEFAULT_STATUS_NAMES[task.status] || task.status
    const lines = []

    if (changed("title")) lines.push(`renamed it from ${quoted(before.title || "")} to ${quoted(after.title || "")}`)
    if (changed("description")) {
        if (!before.description) lines.push("added a description")
        else if (!after.description) lines.push("removed the description")
        else lines.push("changed the description")
    }
    if (changed("status") || changed("column_id")) lines.push(`moved it to ${status(after)}`)
    if (changed("priority")) lines.push(`set the priority to ${PRIORITY_NAMES[after.priority] || after.priority || "none"}`)
    if (changed("due_date")) lines.push(after.due_date ? `set the due date to ${shortDate(after.due_date)}` : "removed the due date")
    if (changed("assignee_id")) lines.push(after.assignee_id ? `assigned it to ${person(after.assignee_id)}` : "unassigned it")
    if (changed("team_space_id") && after.team_space_id) lines.push(`gave it to ${names.departmentName?.(after.team_space_id) || "another department"}`)
    if (changed("parent_task_id")) {
        lines.push(after.parent_task_id
            ? `made it a subtask of ${quoted(names.taskTitle?.(after.parent_task_id) || "another task")}`
            : "made it a task of its own")
    }
    if (changed("sub_tasks")) lines.push(...checklistChanges(before.sub_tasks, after.sub_tasks))
    return lines
}

/**
 * activity_log rows about one task (any order) as History entries, newest
 * first: { id, actorId, actorName, at, lines }. Rows that change nothing
 * shown are dropped.
 */
export function buildTaskHistory(rows = [], names = {}) {
    return rows
        .filter((row) => row.action === "created" || row.action === "updated")
        .map((row) => ({
            id: row.id,
            actorId: row.actor_id,
            actorName: row.actor?.name || names.personName?.(row.actor_id) || "Someone",
            at: row.created_at,
            lines: row.action === "created" ? ["created this task"] : taskChanges(row.prior_state || {}, row.new_state || {}, names),
        }))
        .filter((entry) => entry.lines.length > 0)
        .sort((a, b) => String(b.at).localeCompare(String(a.at)))
}
