// In-app notifications: who sees which activity, and per-user read state.
//
// Scope rules (the user's own actions are never notified):
// - Members: activity that concerns them — tasks assigned to them, being added
//   to a project, invitations sent to their email.
// - Admins: everything in the projects of the departments (team spaces) they
//   are attached to, plus everything that concerns them.
// - Super admins: everything.
import { supabase } from "./supabase"

const NOTIFICATION_LIMIT = 20
const MAX_STORED_READ_IDS = 200
const ACTIVITY_COLUMNS = "id, action, entity_type, entity_id, actor_id, new_state, created_at, actor:users(name, email)"

// PostgREST filter values containing reserved characters must be quoted
const quote = (value) => `"${String(value).replace(/"/g, '\\"')}"`
const inList = (ids) => `(${ids.map(quote).join(",")})`

const fetchIds = async (query, label) => {
    const { data, error } = await query
    if (error) {
        console.warn(`Notification scope: unable to load ${label}`, error)
        return []
    }
    return (data || []).map((row) => row.id ?? row.team_space_id).filter(Boolean)
}

// OR conditions describing which activity concerns this user (and, for admins,
// their departments). Returns null when nothing can match.
const buildScopeConditions = async ({ userId, email, isAdmin }) => {
    const [taskIds, teamIds] = await Promise.all([
        fetchIds(supabase.from("tasks").select("id").eq("assignee_id", userId), "assigned tasks"),
        isAdmin
            ? fetchIds(supabase.from("memberships").select("team_space_id").eq("user_id", userId), "departments")
            : Promise.resolve([]),
    ])

    const projectIds = teamIds.length > 0
        ? await fetchIds(supabase.from("project_spaces").select("id").in("team_space_id", teamIds), "department projects")
        : []

    const conditions = [
        `entity_id.eq.${quote(userId)}`,                 // e.g. member_added for this user
        `new_state->>assignee_id.eq.${quote(userId)}`,   // task created for this user
    ]
    if (email) conditions.push(`new_state->>email.eq.${quote(email)}`) // invitations
    if (taskIds.length > 0) conditions.push(`entity_id.in.${inList(taskIds)}`)
    if (projectIds.length > 0) conditions.push(`new_state->>project_id.in.${inList(projectIds)}`)
    if (teamIds.length > 0) conditions.push(`new_state->>team_space_id.in.${inList(teamIds)}`)
    return conditions
}

// Activity for the header notification bell
export const fetchNotificationActivities = async ({ userId, email, isSuperAdmin, isAdmin, limit = NOTIFICATION_LIMIT }) => {
    if (!userId) return { data: [], error: null }

    let query = supabase
        .from("activity_log")
        .select(ACTIVITY_COLUMNS)
        .or(`actor_id.is.null,actor_id.neq.${quote(userId)}`)
        .order("created_at", { ascending: false })
        .limit(limit)

    if (!isSuperAdmin) {
        const conditions = await buildScopeConditions({ userId, email, isAdmin })
        query = query.or(conditions.join(",")).not("action", "in", "(login,signup)")
    }

    const { data, error } = await query
    return { data: data || [], error }
}

// ── Read state (per user, per browser) ──────────────────────────────────────
// Everything up to lastReadAt counts as read ("Mark all read"); ids holds
// notifications read individually after that.
const readKey = (userId) => `notifications_read:${userId}`

export const loadReadState = (userId) => {
    try {
        const parsed = JSON.parse(localStorage.getItem(readKey(userId)) || "null")
        return {
            lastReadAt: typeof parsed?.lastReadAt === "string" ? parsed.lastReadAt : null,
            ids: Array.isArray(parsed?.ids) ? parsed.ids : [],
        }
    } catch {
        return { lastReadAt: null, ids: [] }
    }
}

const saveReadState = (userId, state) => {
    try {
        localStorage.setItem(readKey(userId), JSON.stringify(state))
    } catch (err) {
        console.warn("Unable to save notification read state", err)
    }
}

export const isActivityRead = (readState, activity) =>
    readState.ids.includes(String(activity.id)) ||
    Boolean(readState.lastReadAt && activity.created_at &&
        new Date(activity.created_at).getTime() <= new Date(readState.lastReadAt).getTime())

export const markActivityRead = (userId, readState, activityId) => {
    const id = String(activityId)
    if (readState.ids.includes(id)) return readState
    const next = { ...readState, ids: [...readState.ids, id].slice(-MAX_STORED_READ_IDS) }
    saveReadState(userId, next)
    return next
}

export const markAllActivitiesRead = (userId, newestCreatedAt) => {
    const next = { lastReadAt: newestCreatedAt || new Date().toISOString(), ids: [] }
    saveReadState(userId, next)
    return next
}
