import { supabase } from "../supabase"
import { toPrefixQuery, escapeLike, parseTaskKey, scopesWithPrefix } from "./paletteSearch"

// The command palette's searches. They run as the signed-in person, so
// row-level security leaves out anything they can't see (the same rule as the
// `search` edge function, without its round trip). Tasks match by key
// ("DEV-12"), by whole-word prefixes in the title and description, or by any
// part of the title; projects and people by any part of the name.

const TASK_FIELDS = "id, title, status, project_id, task_key_scope, task_number, project:project_spaces(name)"
const TASK_LIMIT = 8
const OTHER_LIMIT = 5

const merge = (...lists) => {
    const byId = new Map()
    lists.flat().forEach((row) => { if (row && !byId.has(row.id)) byId.set(row.id, row) })
    return [...byId.values()]
}

async function searchTasks(text, prefixes) {
    const key = parseTaskKey(text)
    if (key) {
        const scopes = scopesWithPrefix(prefixes, key.prefix)
        if (scopes.length === 0) return { data: [], error: null }
        return supabase.from("tasks").select(TASK_FIELDS).in("task_key_scope", scopes).eq("task_number", key.number).limit(TASK_LIMIT)
    }
    const tsQuery = toPrefixQuery(text)
    const [words, part] = await Promise.all([
        tsQuery
            ? supabase.from("tasks").select(TASK_FIELDS).textSearch("search_vector", tsQuery, { config: "english" }).limit(TASK_LIMIT)
            : Promise.resolve({ data: [] }),
        supabase.from("tasks").select(TASK_FIELDS).ilike("title", `%${escapeLike(text.trim())}%`).order("updated_at", { ascending: false }).limit(TASK_LIMIT),
    ])
    return { data: merge(part.data || [], words.data || []).slice(0, TASK_LIMIT), error: words.error || part.error }
}

/**
 * Tasks, projects and people matching `text`. Resolves to
 * { tasks, projects, people, error }; error is a message or null.
 */
export async function searchWorkspace(text, prefixes = new Map()) {
    const trimmed = String(text || "").trim()
    if (!trimmed) return { tasks: [], projects: [], people: [], error: null }
    const like = `%${escapeLike(trimmed)}%`
    const [tasks, projects, people] = await Promise.all([
        searchTasks(trimmed, prefixes),
        supabase.from("project_spaces").select("id, name").ilike("name", like).limit(OTHER_LIMIT),
        supabase.from("users").select("id, name").ilike("name", like).limit(OTHER_LIMIT),
    ])
    const failed = tasks.error || projects.error || people.error
    if (failed) console.error("Searching failed:", failed)
    return {
        tasks: tasks.data || [],
        projects: projects.data || [],
        people: people.data || [],
        error: failed ? "Some results couldn't be loaded." : null,
    }
}
