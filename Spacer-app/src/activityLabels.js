// Turns activity_log rows into human-readable feed items.

const STATUS_NAMES = { todo: "Backlog", in_progress: "Doing", done: "Done" };

const quoted = (text) => (text ? `“${text}”` : "a task");

// Human label, icon and category for one activity_log row
export function describeActivity(row) {
    const s = row.new_state || {};
    const key = `${row.entity_type}:${row.action}`;
    switch (key) {
        case "task:created": return { title: `Created task ${quoted(s.title)}`, icon: "add_task", badge: "Tasks" };
        case "task:updated": return { title: `Updated task ${quoted(s.title)}`, icon: "edit_note", badge: "Tasks" };
        case "task:status_changed": return { title: `Moved ${quoted(s.title)} to ${STATUS_NAMES[s.status] || s.status}`, icon: "swap_horiz", badge: "Tasks" };
        case "task:priority_changed": return { title: `Set ${quoted(s.title)} to ${s.priority} priority`, icon: "flag", badge: "Tasks" };
        case "task:deleted": return { title: `Deleted task ${quoted(s.title)}`, icon: "delete", badge: "Tasks" };
        case "project:created": return { title: `Created project ${quoted(s.project_name || s.name)}`, icon: "create_new_folder", badge: "Projects" };
        case "project:project_deleted": return { title: "Deleted a project", icon: "folder_delete", badge: "Projects" };
        case "department:department_deleted": return { title: "Deleted a department", icon: "domain_disabled", badge: "Departments" };
        case "file:file_added": return { title: `Uploaded ${quoted(s.name)}`, icon: "upload_file", badge: "Files" };
        case "file:file_removed": return { title: `Removed file ${quoted(s.name)}`, icon: "scan_delete", badge: "Files" };
        case "member:member_added": return { title: `Added ${s.name || "a member"} to a project`, icon: "person_add", badge: "Members" };
        case "membership:invited": return { title: `Invited ${s.email || "someone"} to ${s.team_name?.trim() || "a department"}`, icon: "forward_to_inbox", badge: "Members" };
        case "membership:created": return { title: `Joined a department as ${s.role || "member"}`, icon: "group_add", badge: "Members" };
        case "membership:updated": return { title: `Role changed to ${s.role || "member"}`, icon: "manage_accounts", badge: "Members" };
        case "membership:removed": return { title: "Left a department", icon: "group_remove", badge: "Members" };
        case "user:signup": return { title: "Joined Spacer", icon: "celebration", badge: "Account" };
        default: return { title: `${row.action.replace(/_/g, " ")} ${row.entity_type}`, icon: "history", badge: "Activity" };
    }
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// "just now", "5 min ago", "3 hours ago", "Yesterday", "4 days ago", or a date
export function timeAgo(isoDate) {
    const then = new Date(isoDate);
    const diff = Date.now() - then.getTime();
    if (diff < MINUTE) return "just now";
    if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
    if (diff < DAY) {
        const hours = Math.floor(diff / HOUR);
        return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    }
    if (diff < 2 * DAY) return "Yesterday";
    if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} days ago`;
    return then.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
