// Pure helpers for task comments (TaskComments.jsx). No imports, so `npm test`
// can load it.

// Same cap as comments_body_length_check (migration 20261119120000_task_comments)
export const COMMENT_MAX = 5000
const MENTION_QUERY_MAX = 30
const MENTION_RESULTS = 6

// The "@query" being typed just before the caret: { start (index of "@"), query },
// or null. An "@" inside a word (an email address) doesn't count.
export function mentionQueryAt(text, caret) {
    const before = text.slice(0, caret)
    const at = before.lastIndexOf("@")
    if (at === -1) return null
    if (at > 0 && /\S/.test(before[at - 1])) return null
    const query = before.slice(at + 1)
    if (query.length > MENTION_QUERY_MAX || /\n/.test(query) || /\s{2,}/.test(query)) return null
    return { start: at, query }
}

// The text with "@query" replaced by "@Full Name " and where the caret goes.
// The database notifies people named exactly "@Full Name" in a comment.
export function insertMention(text, mention, name) {
    const end = mention.start + 1 + mention.query.length
    const rest = text.slice(end)
    // Reuse a space that's already there rather than doubling it
    const inserted = /^\s/.test(rest) ? `@${name}` : `@${name} `
    return { text: text.slice(0, mention.start) + inserted + rest, caret: mention.start + `@${name} `.length }
}

// People whose name contains the query (any word), leaving out the writer
export function matchMentionables(people, query, selfId) {
    const needle = query.trim().toLowerCase()
    return people
        .filter((p) => p.name && p.id !== selfId && p.name.toLowerCase().includes(needle))
        .slice(0, MENTION_RESULTS)
}

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function timeAgo(iso, now = new Date()) {
    const then = new Date(iso)
    const ago = now - then
    if (ago < MINUTE) return "just now"
    if (ago < HOUR) return `${Math.floor(ago / MINUTE)}m ago`
    if (ago < DAY) return `${Math.floor(ago / HOUR)}h ago`
    if (ago < 7 * DAY) return `${Math.floor(ago / DAY)}d ago`
    const sameYear = then.getFullYear() === now.getFullYear()
    return then.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) })
}
