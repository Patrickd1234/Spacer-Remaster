// The command palette's rules (Ctrl+K): what a typed query becomes for the
// database, task keys ("DEV-12"), and the pages and actions it can jump to.
// No imports, so `npm test` can load it.

const QUERY_MAX = 100
const TOKEN_MAX = 6

/**
 * A Postgres to_tsquery that matches every word as a prefix: "laun mark" ->
 * "laun:* & mark:*". Anything but letters and digits is dropped, so the
 * query can't carry tsquery syntax. null when nothing searchable is left.
 */
export function toPrefixQuery(text) {
    const tokens = String(text || "")
        .slice(0, QUERY_MAX)
        .normalize("NFKD")
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
        .slice(0, TOKEN_MAX)
    return tokens.length > 0 ? tokens.map((t) => `${t}:*`).join(" & ") : null
}

/** Text for an ILIKE pattern, with % _ and \ taken literally. */
export function escapeLike(text) {
    return String(text || "").slice(0, QUERY_MAX).replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** "dev-12" -> { prefix: "DEV", number: 12 }, else null. */
export function parseTaskKey(text) {
    const match = /^\s*([a-z][a-z0-9]{0,15})-(\d{1,7})\s*$/i.exec(String(text || ""))
    return match ? { prefix: match[1].toUpperCase(), number: Number(match[2]) } : null
}

/**
 * The scope ids (projects, or the organization) whose key prefix is `prefix`.
 * `prefixes` is Map(scope id -> prefix).
 */
export function scopesWithPrefix(prefixes, prefix) {
    return [...prefixes.entries()].filter(([, p]) => String(p).toUpperCase() === prefix).map(([id]) => id)
}

/**
 * Pages and actions, filtered by the query (every word must appear in the
 * label or its keywords). An empty query keeps them all.
 * items: [{ id, label, keywords? }]
 */
export function matchCommands(items, text) {
    const words = String(text || "").toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return items
    return items.filter((item) => {
        const haystack = `${item.label} ${item.keywords || ""}`.toLowerCase()
        return words.every((w) => haystack.includes(w))
    })
}

/** Where a task opens: its project's panel, or All Tasks for one without a project. */
export function taskPath(task) {
    return task.project_id ? `/project_page/${task.project_id}?task_id=${task.id}` : "/tasks"
}

/** Results in display order as one list, for moving through them with the arrow keys. */
export function flattenSections(sections) {
    return sections.flatMap((section) => section.items.map((item) => ({ ...item, section: section.key })))
}
