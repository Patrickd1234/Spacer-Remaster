import { supabase } from "../supabase"

// Reads and writes for task comments. Row-level security (migration
// 20261119120000_task_comments): people who can see a task read and add
// comments; authors edit and delete their own; project managers delete any.
// Every function returns { data, error } and never throws.

const COMMENT_FIELDS = "id, task_id, author_id, body, created_at, edited_at, author:users!comments_author_id_fkey(id, name)"

// Oldest first, like a conversation
export async function fetchComments(taskId) {
    const { data, error } = await supabase.from("comments").select(COMMENT_FIELDS).eq("task_id", taskId).order("created_at", { ascending: true })
    if (error) console.error("Loading comments failed:", error)
    return { data: data || [], error }
}

export async function addComment(taskId, authorId, body) {
    const { data, error } = await supabase.from("comments")
        .insert({ task_id: taskId, author_id: authorId, body: body.trim() })
        .select(COMMENT_FIELDS).single()
    if (error) console.error("Adding comment failed:", error)
    return { data, error }
}

export async function editComment(id, body) {
    const { data, error } = await supabase.from("comments").update({ body: body.trim() }).eq("id", id).select(COMMENT_FIELDS).single()
    if (error) console.error("Editing comment failed:", error)
    return { data, error }
}

export async function deleteComment(id) {
    const { error } = await supabase.from("comments").delete().eq("id", id)
    if (error) console.error("Deleting comment failed:", error)
    return { data: null, error }
}

// May the signed-in user delete other people's comments on this task?
export async function canModerateComments(taskId) {
    const { data, error } = await supabase.rpc("can_moderate_task_comments", { p_task_id: taskId })
    if (error) console.error("Checking comment rights failed:", error)
    return { data: Boolean(data), error }
}

// Everyone in the organization, for @mentions (row-level security limits users to it)
export async function fetchMentionables() {
    const { data, error } = await supabase.from("users").select("id, name").order("name")
    if (error) console.error("Loading people to mention failed:", error)
    return { data: data || [], error }
}

// Calls onChange whenever a comment on the task is added, edited or deleted
export function subscribeToComments(taskId, onChange) {
    const channel = supabase
        .channel(`comments:${taskId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `task_id=eq.${taskId}` }, onChange)
        .subscribe()
    return () => { supabase.removeChannel(channel) }
}
