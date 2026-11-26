import { supabase } from "./supabase"
import { TASK_STATUSES } from "./taskStatuses"

// Custom task-board columns per project (table project_columns, migration
// 20261026100000_project_columns.sql). Every column maps to a task status, so a
// card's status always follows the column it sits in.

export const BASE_STATUSES = TASK_STATUSES.map(({ value, label }) => ({ value, label }))

export const COLUMN_NAME_MAX = 40

// Shown when a project has no custom columns yet (ids are null until saved):
// one per status, Backlog, Doing, Waiting, In review, Done
export const DEFAULT_COLUMNS = TASK_STATUSES.map((s, position) => ({
    id: null, key: `default-${s.value}`, name: s.boardName, base_status: s.value, position,
}))

const COLUMN_FIELDS = "id, name, base_status, position"
// Errors that mean the migration hasn't been run on this database yet
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205", "PGRST204", "42703"])

const toBoardColumn = (row) => ({ ...row, key: row.id })

const sortByPosition = (columns) => [...columns].sort((a, b) => a.position - b.position)

// { columns, available } — available is false when the table doesn't exist yet
export async function fetchProjectColumns(projectId) {
    const { data, error } = await supabase
        .from("project_columns")
        .select(COLUMN_FIELDS)
        .eq("project_id", projectId)
        .order("position", { ascending: true })

    if (error) {
        if (!MISSING_TABLE_CODES.has(error.code)) console.error("Error loading board columns:", error)
        return { columns: DEFAULT_COLUMNS, available: !MISSING_TABLE_CODES.has(error.code) }
    }
    return { columns: data?.length ? data.map(toBoardColumn) : DEFAULT_COLUMNS, available: true }
}

// The first customisation saves the columns not saved yet (the defaults, or a
// column the board added for a status that had none) so they can be edited,
// keeping the order shown
export async function ensureSavedColumns(projectId, columns) {
    if (columns.every((c) => c.id)) return { columns, error: null }
    const unsaved = columns.map((c, position) => ({ c, position })).filter(({ c }) => !c.id)
    const { data, error } = await supabase
        .from("project_columns")
        .insert(unsaved.map(({ c, position }) => ({ project_id: projectId, name: c.name, base_status: c.base_status, position })))
        .select(COLUMN_FIELDS)
    if (error) return { columns, error }
    const inserted = sortByPosition(data).map(toBoardColumn)
    const merged = columns.map((c) => (c.id ? c : inserted.shift() || c))
    if (columns.some((c) => c.id)) {
        const { error: orderError } = await saveColumnOrder(merged)
        // The new columns are saved either way; return them so they aren't inserted twice
        if (orderError) return { columns: merged.map((c, position) => ({ ...c, position })), error: orderError }
    }
    return { columns: merged.map((c, position) => ({ ...c, position })), error: null }
}

export async function createColumn(projectId, { name, baseStatus, position }) {
    const { data, error } = await supabase
        .from("project_columns")
        .insert({ project_id: projectId, name: name.trim(), base_status: baseStatus, position })
        .select(COLUMN_FIELDS)
        .single()
    return { column: data ? toBoardColumn(data) : null, error }
}

export async function renameColumn(columnId, name) {
    const { error } = await supabase.from("project_columns").update({ name: name.trim() }).eq("id", columnId)
    return { error }
}

// Saves the given order (positions 0..n-1)
export async function saveColumnOrder(columns) {
    const results = await Promise.all(columns.map((c, position) =>
        supabase.from("project_columns").update({ position }).eq("id", c.id)
    ))
    return { error: results.find((r) => r.error)?.error || null }
}

// Moves the column's tasks to `target`, then deletes the column. When `target` has a
// different status (this was the last column for its status), tasks of that status
// that were never placed in a column move too, so none are left without a column.
export async function deleteColumn(projectId, column, target, { lastOfStatus }) {
    const moves = [
        supabase.from("tasks")
            .update({ column_id: target.id, status: target.base_status })
            .eq("project_id", projectId)
            .eq("column_id", column.id),
    ]
    if (lastOfStatus) {
        moves.push(supabase.from("tasks")
            .update({ column_id: target.id, status: target.base_status })
            .eq("project_id", projectId)
            .eq("status", column.base_status)
            .is("column_id", null))
    }
    const moveError = (await Promise.all(moves)).find((r) => r.error)?.error
    if (moveError) return { error: moveError }
    const { error } = await supabase.from("project_columns").delete().eq("id", column.id)
    return { error }
}

// Where a deleted column's tasks go: the next column with the same status, else the first other column
export function fallbackColumn(columns, column) {
    const others = columns.filter((c) => c.key !== column.key)
    return others.find((c) => c.base_status === column.base_status) || others[0] || null
}

// Lives with the other grouping rules, which tests can load without Supabase
export { columnKeyForTask } from "./boardGrouping"
