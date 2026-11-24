import { supabase, getSessionUser } from "../supabase"
import { createSignedLinks } from "../storageLinks"
import { dayKey } from "./generalFormat"
import { roleKey } from "../permissions"
import { dbRefusalMessage } from "../orgExitRules"
import { AVATAR_CHANGED_EVENT } from "../appEvents"

// Reads and writes for the General Space pages. Row-level security limits
// every query to the signed-in user's organization; posting announcements
// and events is limited to org admins (migration 20261030140000).
// Every function returns { data, error } and never throws.

export const GENERAL_MEDIA_BUCKET = "general-media"
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]

export const ORG_UPDATES_LIMIT = 8
// Newest announcements loaded at once; each needs signed image links
const ANNOUNCEMENTS_LIMIT = 100

const ANNOUNCEMENT_FIELDS =
    "id, title, body, category, pinned, cover_path, event_starts_at, event_ends_at, meeting_url, created_at, author_id, " +
    "author:users!announcements_author_id_fkey(id, name, job_title, avatar_path)"
const EVENT_FIELDS = "id, title, description, event_date, starts_at, ends_at, category, external_url, created_by"
const PERSON_FIELDS = "id, name, email, job_title, location, timezone, description, avatar_path, reports_to"

export function validateImage(file) {
    if (!IMAGE_TYPES.includes(file.type)) return "Use a JPG, PNG, WebP or GIF image."
    if (file.size > IMAGE_MAX_BYTES) return "Images can be at most 5 MB."
    return null
}

// The signed-in user's profile row; organization_id scopes everything else
export async function fetchMyProfile() {
    const user = await getSessionUser()
    if (!user?.id) return { data: null, error: new Error("Not signed in") }
    const { data, error } = await supabase.from("users").select(`${PERSON_FIELDS}, organization_id`).eq("id", user.id).maybeSingle()
    if (error) console.error("Loading your profile failed:", error)
    return { data, error }
}

// Adds `imageUrl` (signed, short-lived) to rows that have an image path at `pathOf(row)`
async function withImageLinks(rows, pathOf, key = "imageUrl") {
    const links = await createSignedLinks(GENERAL_MEDIA_BUCKET, rows.map(pathOf))
    return rows.map((row) => ({ ...row, [key]: links.get(pathOf(row)) ?? null }))
}

async function uploadImage(path, file) {
    const { error } = await supabase.storage.from(GENERAL_MEDIA_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
    if (error) console.error("Image upload failed:", error)
    return { data: error ? null : path, error }
}

async function removeImage(path) {
    if (!path) return
    const { error } = await supabase.storage.from(GENERAL_MEDIA_BUCKET).remove([path])
    if (error) console.error("Removing image failed:", error)
}

const safeFileName = (name) => name.replace(/[^\w.-]+/g, "_").slice(-80)

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

// pinnedFirst: pinned ones come first however old, for previews
export async function fetchAnnouncements({ limit = ANNOUNCEMENTS_LIMIT, pinnedFirst = false } = {}) {
    let query = supabase.from("announcements").select(ANNOUNCEMENT_FIELDS)
    if (pinnedFirst) query = query.order("pinned", { ascending: false })
    const { data, error } = await query.order("created_at", { ascending: false }).limit(limit)
    if (error) {
        console.error("Loading announcements failed:", error)
        return { data: [], error }
    }
    const withCovers = await withImageLinks(data || [], (a) => a.cover_path, "coverUrl")
    const withAvatars = await withImageLinks(withCovers, (a) => a.author?.avatar_path, "authorAvatarUrl")
    return { data: withAvatars, error: null }
}

// form: { title, body, category, pinned, meetingUrl, startsAt, endsAt, coverFile }
export async function createAnnouncement(profile, form) {
    let coverPath = null
    if (form.coverFile) {
        const path = `announcements/${profile.organization_id}/${crypto.randomUUID()}-${safeFileName(form.coverFile.name)}`
        const { error } = await uploadImage(path, form.coverFile)
        if (error) return { data: null, error }
        coverPath = path
    }
    const { data, error } = await supabase.from("announcements").insert({
        organization_id: profile.organization_id,
        author_id: profile.id,
        title: form.title.trim(),
        body: form.body.trim(),
        category: form.category,
        pinned: form.pinned,
        cover_path: coverPath,
        meeting_url: form.meetingUrl.trim() || null,
        event_starts_at: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        event_ends_at: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    }).select("id").single()
    if (error) {
        console.error("Creating announcement failed:", error)
        await removeImage(coverPath)
    }
    return { data, error }
}

export async function setAnnouncementPinned(id, pinned) {
    const { error } = await supabase.from("announcements").update({ pinned }).eq("id", id)
    if (error) console.error("Pinning announcement failed:", error)
    return { data: null, error }
}

// Same form as createAnnouncement. A new cover replaces the old one; no file
// keeps it. Only people with announcement.manage may do this (the policy
// decides; the page only shows the button to them).
export async function updateAnnouncement(announcement, form) {
    let coverPath = announcement.cover_path
    if (form.coverFile) {
        const path = `announcements/${announcement.organization_id}/${crypto.randomUUID()}-${safeFileName(form.coverFile.name)}`
        const { error } = await uploadImage(path, form.coverFile)
        if (error) return { data: null, error }
        coverPath = path
    }
    const { error } = await supabase.from("announcements").update({
        title: form.title.trim(),
        body: form.body.trim(),
        category: form.category,
        pinned: form.pinned,
        cover_path: coverPath,
        meeting_url: form.meetingUrl.trim() || null,
        event_starts_at: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        event_ends_at: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    }).eq("id", announcement.id)
    if (error) {
        console.error("Updating announcement failed:", error)
        if (coverPath !== announcement.cover_path) await removeImage(coverPath)
    } else if (coverPath !== announcement.cover_path) {
        await removeImage(announcement.cover_path)
    }
    return { data: null, error }
}

export async function deleteAnnouncement(announcement) {
    const { error } = await supabase.from("announcements").delete().eq("id", announcement.id)
    if (error) console.error("Deleting announcement failed:", error)
    else await removeImage(announcement.cover_path)
    return { data: null, error }
}

// ---------------------------------------------------------------------------
// Calendar events
// ---------------------------------------------------------------------------

// Before migration 20261119090000 there is no audience column (and no meetings)
const isMissingColumn = (error) => error?.code === "42703" || error?.code === "PGRST204"

// Company-wide events whose day falls between two dates (inclusive). Meetings
// people schedule for chosen attendees stay on their personal calendars.
export async function fetchEvents(from, to) {
    const query = () => supabase
        .from("calendar_events")
        .select(EVENT_FIELDS)
        .gte("event_date", dayKey(from))
        .lte("event_date", dayKey(to))
        .order("event_date", { ascending: true })
    let { data, error } = await query().eq("audience", "company")
    if (isMissingColumn(error)) ({ data, error } = await query())
    if (error) console.error("Loading events failed:", error)
    return { data: data || [], error }
}

// form: { title, description, date, allDay, startTime, endTime, category, meetingUrl }
function eventRow(form) {
    const at = (time) => (time ? new Date(`${form.date}T${time}`).toISOString() : null)
    return {
        title: form.title.trim(),
        description: form.description.trim() || null,
        event_date: form.date,
        starts_at: form.allDay ? null : at(form.startTime),
        ends_at: form.allDay ? null : at(form.endTime),
        category: form.category,
        external_url: form.meetingUrl.trim() || null,
    }
}

export async function createEvent(profile, form) {
    const { data, error } = await supabase.from("calendar_events")
        .insert({ ...eventRow(form), organization_id: profile.organization_id, created_by: profile.id })
        .select(EVENT_FIELDS).single()
    if (error) console.error("Creating event failed:", error)
    return { data, error }
}

export async function updateEvent(id, form) {
    const { data, error } = await supabase.from("calendar_events").update(eventRow(form)).eq("id", id).select(EVENT_FIELDS).single()
    if (error) console.error("Updating event failed:", error)
    return { data, error }
}

export async function deleteEvent(id) {
    const { error } = await supabase.from("calendar_events").delete().eq("id", id)
    if (error) console.error("Deleting event failed:", error)
    return { data: null, error }
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

// Everyone in the organization with the teams the viewer may see them in.
// Members only see teams they share access to, so tags can be partial.
// Everyone's team memberships in the organization as { user_id, team_space_id, team_name, role }.
// org_team_memberships() lets members see other people's teams; until that
// migration is applied, fall back to the tables (members then see only their own teams).
// Everyone's roles in the organization: { user_id, team_space_id (null =
// organization-wide), team_name, role, role_key }. Falls back to the older
// function (department roles only), then to the tables (your own teams).
async function fetchOrgTeamMemberships() {
    const { data, error } = await supabase.rpc("org_member_roles")
    if (!error) return data || []
    console.error("Loading organization roles failed, trying department roles:", error)
    const older = await supabase.rpc("org_team_memberships")
    if (!older.error) return (older.data || []).map((m) => ({ ...m, role_key: roleKey(m.team_space_id, m.role) }))
    console.error("Loading organization teams failed, using your own teams:", older.error)
    const [{ data: memberships }, { data: teams }] = await Promise.all([
        supabase.from("memberships").select("user_id, team_space_id, role").not("team_space_id", "is", null),
        supabase.from("team_spaces").select("id, name"),
    ])
    const nameById = new Map((teams || []).map((t) => [t.id, t.name]))
    return (memberships || [])
        .filter((m) => nameById.has(m.team_space_id))
        .map((m) => ({ ...m, team_name: nameById.get(m.team_space_id), role_key: roleKey(m.team_space_id, m.role) }))
}

// The organization's departments (what the viewer may see of them)
export async function fetchDepartments() {
    const { data, error } = await supabase.from("team_spaces").select("id, name").order("name")
    if (error) console.error("Loading departments failed:", error)
    return { data: data || [], error }
}

// Role changes go through the database functions, which check the caller
// (member.assign_role) and refuse with their own wording (docs/RBAC.md).
// roleKey: org_admin (teamId null), department_admin, team_lead, member, viewer.
export async function assignRole(userId, teamId, key) {
    const { error } = await supabase.rpc("assign_role", { p_user_id: userId, p_team_space_id: teamId, p_role_key: key })
    if (error) console.error("Assigning role failed:", error)
    return { data: null, error: dbRefusalMessage(error, "Couldn't change the role. Please try again.") }
}

export async function revokeRole(userId, teamId) {
    const { error } = await supabase.rpc("revoke_role", { p_user_id: userId, p_team_space_id: teamId })
    if (error) console.error("Revoking role failed:", error)
    return { data: null, error: dbRefusalMessage(error, "Couldn't remove the role. Please try again.") }
}

// An organization-wide role, most powerful first
const orgRoleOf = (rows) => (rows.some((m) => m.role_key === "owner") ? "owner" : rows.some((m) => m.role_key === "org_admin") ? "org_admin" : null)

export async function fetchPeople({ limit } = {}) {
    let usersQuery = supabase.from("users").select(PERSON_FIELDS).order("name")
    if (limit) usersQuery = usersQuery.limit(limit)
    const [{ data: users, error }, memberships] = await Promise.all([usersQuery, fetchOrgTeamMemberships()])
    if (error) {
        console.error("Loading people failed:", error)
        return { data: [], teams: [], error }
    }
    const departmentRows = memberships.filter((m) => m.team_space_id != null)
    const teams = [...new Map(departmentRows.map((m) => [m.team_space_id, { id: m.team_space_id, name: m.team_name }])).values()]
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    const people = (users || []).map((user) => ({
        ...user,
        // "owner" / "org_admin" / null: an organization-wide role
        orgRole: orgRoleOf(memberships.filter((m) => m.user_id === user.id)),
        teams: departmentRows
            .filter((m) => m.user_id === user.id)
            .map((m) => ({ id: m.team_space_id, name: m.team_name, role: m.role })),
    }))
    return { data: await withImageLinks(people, (p) => p.avatar_path, "avatarUrl"), teams, error: null }
}

// fields: { name, job_title, location, timezone, description }
export async function updateMyProfile(userId, fields) {
    const { error } = await supabase.from("users").update(fields).eq("id", userId)
    if (error) console.error("Updating profile failed:", error)
    return { data: null, error }
}

export async function updateMyAvatar(profile, file) {
    const path = `avatars/${profile.id}/${crypto.randomUUID()}-${safeFileName(file.name)}`
    const uploaded = await uploadImage(path, file)
    if (uploaded.error) return uploaded
    const saved = await updateMyProfile(profile.id, { avatar_path: path })
    if (saved.error) {
        await removeImage(path)
        return saved
    }
    await removeImage(profile.avatar_path)
    announceAvatarChange(profile.id, path)
    return { data: path, error: null }
}

export async function removeMyAvatar(profile) {
    if (!profile.avatar_path) return { data: null, error: null }
    const saved = await updateMyProfile(profile.id, { avatar_path: null })
    if (saved.error) return saved
    await removeImage(profile.avatar_path)
    announceAvatarChange(profile.id, null)
    return { data: null, error: null }
}

// Tells the sidebar, Settings and Profile (avatars/myAvatar.js) to show the new photo
function announceAvatarChange(userId, path) {
    window.dispatchEvent(new CustomEvent(AVATAR_CHANGED_EVENT, { detail: { userId, path } }))
}

export async function setReportsTo(userId, managerId) {
    const { error } = await supabase.rpc("set_reports_to", { p_user_id: userId, p_manager_id: managerId || null })
    if (error) console.error("Setting manager failed:", error)
    return { data: null, error }
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export async function fetchOrgUpdates() {
    const { data, error } = await supabase
        .from("activity_log")
        .select("id, action, entity_type, new_state, created_at, actor:users(name)")
        .not("action", "in", "(login)")
        .order("created_at", { ascending: false })
        .limit(ORG_UPDATES_LIMIT)
    if (error) console.error("Loading organization updates failed:", error)
    return { data: data || [], error }
}

export async function fetchOverviewCounts(profile) {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)
    const [announcements, members, teams] = await Promise.all([
        supabase.from("announcements").select("id", { count: "exact", head: true }).gte("created_at", monthStart.toISOString()),
        supabase.from("users").select("id", { count: "exact", head: true }).eq("organization_id", profile.organization_id),
        supabase.from("team_spaces").select("id", { count: "exact", head: true }),
    ])
    const error = announcements.error || members.error || teams.error
    if (error) console.error("Loading overview counts failed:", error)
    return {
        data: { announcements: announcements.count ?? 0, members: members.count ?? 0, teams: teams.count ?? 0 },
        error,
    }
}
