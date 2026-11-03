// Cleans up an activity feed (rows newest first): the project page's Recent
// Activity and My Space's. The database logs every task insert and update
// itself (tasks_log_activity), while the app also logs its own "created",
// "status_changed" and "priority_changed" entries, so one action can arrive as
// two rows; some app paths also wrote the same entry twice.

// How close in time two entries must be to count as one action
export const SAME_ACTION_WINDOW_MS = 60 * 1000

const NAMED_TASK_CHANGES = new Set(["status_changed", "priority_changed"])

// Columns that change on every write without meaning anything to the reader
const VOLATILE_KEYS = new Set(["updated_at", "search_vector"])

const timeOf = (row) => new Date(row.created_at).getTime()

const isNear = (a, b) => Math.abs(timeOf(a) - timeOf(b)) <= SAME_ACTION_WINDOW_MS

const sameTaskAndActor = (a, b) =>
    a.entity_type === "task" && b.entity_type === "task" && a.entity_id === b.entity_id && a.actor_id === b.actor_id

const stateKey = (state) => JSON.stringify(
    Object.keys(state || {}).filter((k) => !VOLATILE_KEYS.has(k)).sort().map((k) => [k, state[k]]),
)

export function dedupeActivity(rows) {
    const seenCreated = new Set()
    const lastKept = new Map() // action|entity|actor -> the newer entry kept for it
    return rows.filter((row) => {
        // A task is created once: keep the first entry for it
        if (row.entity_type === "task" && row.action === "created") {
            if (seenCreated.has(row.entity_id)) return false
            seenCreated.add(row.entity_id)
            return true
        }
        // A plain "updated" already described by a status or priority entry
        if (row.action === "updated" && rows.some((other) => NAMED_TASK_CHANGES.has(other.action) && sameTaskAndActor(row, other) && isNear(row, other))) {
            return false
        }
        // The same entry written twice in a row
        if (row.entity_id) {
            const key = `${row.action}|${row.entity_type}|${row.entity_id}|${row.actor_id}`
            const newer = lastKept.get(key)
            if (newer && isNear(row, newer) && stateKey(newer.new_state) === stateKey(row.new_state)) return false
            lastKept.set(key, row)
        }
        return true
    })
}
