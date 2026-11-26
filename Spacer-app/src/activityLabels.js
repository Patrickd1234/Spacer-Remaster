// Turns activity_log rows into human-readable feed items.

import { TASK_STATUSES } from "./taskStatuses.js";

const STATUS_NAMES = Object.fromEntries(TASK_STATUSES.map((s) => [s.value, s.boardName]));

const quoted = (text) => (text ? `“${text}”` : "a task");
const projectName = (s) => (s.project_name ? `“${s.project_name}”` : "a project");

// Human label, icon and category for one activity_log row
export function describeActivity(row) {
    const s = row.new_state || {};
    const key = `${row.entity_type}:${row.action}`;
    switch (key) {
        case "task:created": return { title: `Created task ${quoted(s.title)}`, icon: "add_task", badge: "Tasks" };
        case "task:updated": return { title: `Updated task ${quoted(s.title)}`, icon: "edit_note", badge: "Tasks" };
        case "task:status_changed": return { title: `Moved ${quoted(s.title)} to ${STATUS_NAMES[s.status] || s.status}`, icon: "swap_horiz", badge: "Tasks" };
        case "task:priority_changed": return { title: `Set ${quoted(s.title)} to ${s.priority} priority`, icon: "flag", badge: "Tasks" };
        case "task:dependency_added": return { title: `${quoted(s.title)} now waits on ${quoted(s.blocker_title)}${s.blocker_department ? ` (${s.blocker_department})` : ""}`, icon: "link", badge: "Tasks" };
        case "task:dependency_removed": return { title: `${quoted(s.title)} no longer waits on ${quoted(s.blocker_title)}`, icon: "link_off", badge: "Tasks" };
        case "task:unblocked": return { title: `${quoted(s.title)} was unblocked: ${quoted(s.blocker_title)} is done`, icon: "check_circle", badge: "Tasks" };
        case "task:deleted": return { title: `Deleted task ${quoted(s.title)}`, icon: "delete", badge: "Tasks" };
        case "project:created": return { title: `Created project ${quoted(s.project_name || s.name)}`, icon: "create_new_folder", badge: "Projects" };
        case "project:project_deleted": return { title: "Deleted a project", icon: "folder_delete", badge: "Projects" };
        case "project:department_invited": return { title: `Invited ${s.department || "a department"} to ${projectName(s)}`, icon: "handshake", badge: "Projects" };
        case "project:department_joined": return { title: `${s.department || "A department"} joined ${projectName(s)}`, icon: "group_add", badge: "Projects" };
        case "project:department_added": return { title: `Added ${s.department || "a department"} to ${projectName(s)}`, icon: "group_add", badge: "Projects" };
        case "project:department_removed": {
            const moved = Number(s.moved_tasks) || 0;
            const note = moved > 0 ? ` (${moved} task${moved === 1 ? "" : "s"} moved to the lead department)` : "";
            return { title: `Removed ${s.department || "a department"} from ${projectName(s)}${note}`, icon: "group_remove", badge: "Projects" };
        }
        case "project:department_declined": return { title: `${s.department || "A department"} declined to work on ${projectName(s)}`, icon: "do_not_disturb_on", badge: "Projects" };
        case "department:department_deleted": return { title: "Deleted a department", icon: "domain_disabled", badge: "Departments" };
        case "file:file_added": return { title: `Uploaded ${quoted(s.name)}`, icon: "upload_file", badge: "Files" };
        case "file:file_removed": return { title: `Removed file ${quoted(s.name)}`, icon: "scan_delete", badge: "Files" };
        case "member:member_added": return { title: `Added ${s.name || "a member"} to a project`, icon: "person_add", badge: "Members" };
        case "membership:invited": return { title: `Invited ${s.email || "someone"} to ${s.team_name?.trim() || "a department"}`, icon: "forward_to_inbox", badge: "Members" };
        case "membership:created": return { title: `Joined a department as ${s.role || "member"}`, icon: "group_add", badge: "Members" };
        case "membership:updated": return { title: `Role changed to ${s.role || "member"}`, icon: "manage_accounts", badge: "Members" };
        case "membership:removed": return { title: "Left a department", icon: "group_remove", badge: "Members" };
        case "user:signup": return { title: "Joined Spacer", icon: "celebration", badge: "Account" };
        case "organization:member_left": return { title: `${s.name || "Someone"} left the organization`, icon: "logout", badge: "Members" };
        case "user:two_factor_reset": return {
            title: s.method === "recovery_code" ? "Used a recovery code to sign in" : `Reset two-factor for ${s.name || "someone"}`,
            icon: "phonelink_erase",
            badge: "Account",
        };
        case "organization:member_removed": return { title: `Removed ${s.name || "someone"} from the organization`, icon: "person_remove", badge: "Members" };
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
