import { supabase } from "./supabase"
import { dedupeActivity } from "./projectActivity"

export const RECENT_ACTIVITY_LIMIT = 10

const relativeTime = (createdAt) => {
    const date = new Date(createdAt)
    if (Number.isNaN(date.getTime())) return null
    const diffMin = Math.floor((Date.now() - date.getTime()) / (1000 * 60))
    if (diffMin < 1) return "Just now"
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`
    return date.toLocaleDateString()
}

const describe = (act, actorName) => {
    if (act.action === "login") {
        return [`${actorName} logged in`, act.new_state?.email ? `Session started (${act.new_state.email})` : "Active session"]
    }
    if (act.action === "signup") return [`${actorName} joined the organization`, "New team member onboarded"]
    if (act.action === "created") {
        const entity = act.entity_type || (act.new_state?.title ? "task" : "item")
        return [`${actorName} created ${entity}: ${act.new_state?.title || act.new_state?.name || "New entry"}`, act.new_state?.description || "Created recently"]
    }
    if (act.action === "updated") {
        return [`${actorName} updated ${act.entity_type || "item"}`, act.new_state?.title || (act.new_state?.status ? `Status: ${act.new_state.status}` : "Modified recently")]
    }
    return [`${actorName} performed ${act.action || "action"}`, act.new_state?.title || act.entity_type || "Activity recorded"]
}

export const formatActivityItem = (act) => {
    const actorName = act.actor?.name || act.actor?.email?.split("@")[0] || act.new_state?.full_name || "User"
    const initials = actorName.split(" ").map(n => n[0]).filter(Boolean).join("").toUpperCase().slice(0, 2) || "SA"
    const [title, detail] = describe(act, actorName)
    const time = act.created_at ? relativeTime(act.created_at) : null
    return { id: act.id, initials, title, sub: time ? `${detail} • ${time}` : detail }
}

// The signed-in user's own recent actions. Logins/sign-ups are left out so they
// don't crowd out real work. One action can be logged twice (by the app and by
// the database), so twice the rows are read and the doubles dropped.
// Returns { data: formatted items, error }.
export async function fetchRecentActivity(userId) {
    const { data, error } = await supabase
        .from("activity_log")
        .select("id, action, entity_type, entity_id, actor_id, new_state, created_at, actor:users(name, email)")
        .eq("actor_id", userId)
        .not("action", "in", "(login,signup)")
        .order("created_at", { ascending: false })
        .limit(RECENT_ACTIVITY_LIMIT * 2)
    if (error) console.warn("activity_log fetch error:", error)
    const items = dedupeActivity(data || []).slice(0, RECENT_ACTIVITY_LIMIT)
    return { data: items.map(formatActivityItem), error }
}
