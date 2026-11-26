import { useState, useEffect, useRef, useCallback } from "react"
import { useParams } from "react-router-dom"
import { supabase, getSessionUser } from "./supabase"
import Sidebar from "./partials/SidebarRouter"
import Header from "./partials/header"
import CreateTaskModal from "./partials/CreateTaskModal"
import DocViewer from "./components/DocViewer"
import GroupChat from "./components/LazyGroupChat"
import SprintTab from "./sprints/SprintTab"
import DepartmentsTab from "./components/DepartmentsTab"
import TaskBlockPanel from "./components/TaskBlockPanel"
import { DepartmentFilterBar, TaskDependencyNote } from "./components/DepartmentTaskBadges"
import { matchesDepartmentFilter } from "./crossDepartment"
import { addableProjectMembers } from "./projectDepartments"
import { TASK_CREATED_EVENT, announceProjectRenamed } from "./appEvents"
import { fetchProjectDepartments, updateTaskDepartment, setTaskBlock } from "./crossDepartmentData"
import { useRole } from "./RoleContext"
import { withSignedUrls } from "./projectFiles"
import { downloadUrl } from "./downloadLinks"
import { statusFromSubtasks } from "./taskStatus"
import { deleteWorkspaceItem } from "./workspaceDelete"
import {
    DEFAULT_COLUMNS, fetchProjectColumns, ensureSavedColumns, createColumn, renameColumn,
    saveColumnOrder, deleteColumn, fallbackColumn, columnKeyForTask,
} from "./projectColumns"
import { BoardColumnHeader, AddColumnTile, DeleteColumnModal } from "./components/BoardColumns"
import ProjectCalendar from "./components/ProjectCalendar"
import ProjectMembers from "./components/ProjectMembers"
import ProjectDeadline from "./components/ProjectDeadline"
import ProjectName from "./components/ProjectName"
import { findSavedProject } from "./projectListCache"
import TaskDeadline from "./components/TaskDeadline"
import { OVERDUE_COLUMN, isTaskOverdue, groupTasksByColumn } from "./boardGrouping"
import { dedupeActivity } from "./projectActivity"
import PlanetLoader from "./components/PlanetLoader"
import TaskKeyBar from "./tasks/TaskKeyBar"
import TaskComments from "./tasks/TaskComments"
import AwayBadge, { AwayDot } from "./availability/AwayBadge"
import { useAwayPeriods } from "./availability/availabilityData"
import ScheduleMeetingModal from "./meetings/ScheduleMeetingModal"
import { MEETING_SAVED_EVENT } from "./appEvents"
import PersonPhoto from "./avatars/PersonPhoto"

const ACCEPTED = [
    "image/*", "application/pdf", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip", "application/x-zip-compressed", "text/plain", "text/csv",
].join(",")

// How long a Kanban board message stays visible
const BOARD_NOTICE_MS = 5000

const TASK_COLUMNS = "id, project_id, organization_id, title, description, status, priority, due_date, assignee_id, sub_tasks, created_at, created_by"
// Added by migration 20261031090000_sprints
const SPRINT_TASK_COLUMNS = "sprint_id, story_points, completed_at"
// Added by migration 20261120100000_cross_department_projects
const DEPARTMENT_TASK_COLUMNS = "team_space_id, blocked_by_task_id, blocked_at"
// Added by migration 20261119100000_task_keys
const TASK_KEY_COLUMNS = "task_key_scope, task_number"

// Wait for a burst of task changes (e.g. a drag that also logs) to settle before reloading the feed
const ACTIVITY_RELOAD_DELAY_MS = 500

// The project's recent activity by anyone: entries about its work, plus its own
// "project created" entry (logged without a project_id). Returns { data, error }.
async function fetchProjectActivity(projectId) {
    const { data, error } = await supabase
        .from("activity_log")
        .select("id, action, entity_type, entity_id, actor_id, new_state, created_at, actor:users(name, email)")
        .or(`new_state->>project_id.eq.${projectId},and(entity_type.eq.project,entity_id.eq.${projectId},action.eq.created)`)
        .order("created_at", { ascending: false })
        .limit(30)
    if (error) console.error("Error fetching activity:", error)
    return { data: data || [], error }
}

// Board column names for each task status
const STATUS_LABELS = { todo: "Backlog", in_progress: "Doing", done: "Done" }
// Column dot colour by the status a column stands for
const STATUS_DOT = { todo: "bg-line", in_progress: "bg-[#3b82f6]", done: "bg-primary-fixed-dim" }

const MAX_FILE_SIZE_MB = 50
const MAX_FILE_SIZE    = MAX_FILE_SIZE_MB * 1024 * 1024   // 50 MB in bytes

// Extensions that are never allowed regardless of MIME type
const BLOCKED_EXTENSIONS = new Set([
    "exe","bat","cmd","com","pif","scr","vbs","wsf","reg",
    "msi","dll","sys","drv","bin","cpl","ocx",
    "sh","bash","zsh","fish","ps1","psm1","psd1",
    "jar","class","war","ear","jnlp",
    "php","php3","php4","php5","phtml","phar",
    "asp","aspx","ashx","asmx","axd","cshtml",
    "cgi","pl","rb","py","lua","go",
    "js","jsx","ts","tsx","mjs","cjs",
    "html","htm","xhtml",
    "swf","fla",
    "dmg","pkg","deb","rpm","run",
    "iso","img","vmdk",
])

// Allowed MIME types whitelist — kept in sync with ACCEPTED above
const ALLOWED_MIME_TYPES = new Set([
    "image/jpeg","image/png","image/gif","image/webp","image/bmp","image/tiff","image/heic","image/heif",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip","application/x-zip-compressed",
    "text/plain","text/csv",
])

// Read the first N bytes of a File (for magic-byte / file-signature verification)
const readFirstBytes = (file, n) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload  = (e) => resolve(new Uint8Array(e.target.result))
        reader.onerror = reject
        reader.readAsArrayBuffer(file.slice(0, n))
    })

// Full client-side security validation, run before any file is accepted for upload.
// NOTE: this is a first line of defense for UX (fast feedback, blocks obvious junk).
// It is NOT a substitute for server-side / storage-bucket-side scanning — a
// determined attacker can bypass client-side checks entirely, so the same
// extension/MIME/size rules (and ideally real antivirus/malware scanning,
// e.g. via a Supabase storage webhook to a scanning service) should also be
// enforced wherever the file actually lands.
const validateFile = async (file) => {
    // 1 — Size
    if (file.size > MAX_FILE_SIZE)
        return { valid: false, error: `File too large. Maximum allowed is ${MAX_FILE_SIZE_MB} MB — your file is ${formatBytes(file.size)}.` }

    if (file.size === 0)
        return { valid: false, error: "File appears to be empty and cannot be uploaded." }

    // 2 — Extension blacklist
    const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
    if (!ext)
        return { valid: false, error: "File has no extension. Please upload a file with a recognised format." }
    if (BLOCKED_EXTENSIONS.has(ext))
        return { valid: false, error: `Files with the .${ext} extension are blocked for security reasons. Executable and script files cannot be uploaded.` }

    // 3 — MIME type whitelist (browsers don't always supply a type, so only check if present)
    if (file.type && !ALLOWED_MIME_TYPES.has(file.type) && !file.type.startsWith("image/"))
        return { valid: false, error: `File type "${file.type}" is not permitted. Only documents, images, spreadsheets, and archive files are accepted.` }

    // 4 — Magic bytes: verify file content matches its claimed type
    try {
        const bytes = await readFirstBytes(file, 8)
        const is = (sigs) => sigs.every((b, i) => b === null || bytes[i] === b)

        const isJPEG  = is([0xFF, 0xD8, 0xFF])
        const isPNG   = is([0x89, 0x50, 0x4E, 0x47])
        const isGIF   = is([0x47, 0x49, 0x46, 0x38])
        const isPDF   = is([0x25, 0x50, 0x44, 0x46])   // %PDF
        const isZIP   = is([0x50, 0x4B, 0x03, 0x04])   // PK (ZIP, DOCX, XLSX)
        const isZIPe  = is([0x50, 0x4B, 0x05, 0x06])   // PK (empty ZIP)
        const isZIPok = isZIP || isZIPe

        const checks = [
            { mime: "image/jpeg",       ok: isJPEG,  label: "JPEG" },
            { mime: "image/png",        ok: isPNG,   label: "PNG"  },
            { mime: "image/gif",        ok: isGIF,   label: "GIF"  },
            { mime: "application/pdf",  ok: isPDF,   label: "PDF"  },
            { mime: "application/zip",  ok: isZIPok, label: "ZIP"  },
            { mime: "application/x-zip-compressed", ok: isZIPok, label: "ZIP" },
            { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  ok: isZIPok, label: "DOCX" },
            { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",        ok: isZIPok, label: "XLSX" },
        ]

        for (const { mime, ok, label } of checks) {
            if (file.type === mime && !ok)
                return { valid: false, error: `Security check failed: the file's content does not match its declared format (${label}). This file may be disguised or corrupted and cannot be uploaded.` }
        }

        // 5 — Block Windows PE executables even if renamed (MZ header)
        if (bytes[0] === 0x4D && bytes[1] === 0x5A)   // MZ
            return { valid: false, error: "Security check failed: this file appears to be a Windows executable and cannot be uploaded." }

        // 6 — Block ELF binaries (Linux executables)
        if (bytes[0] === 0x7F && bytes[1] === 0x45 && bytes[2] === 0x4C && bytes[3] === 0x46)   // \x7fELF
            return { valid: false, error: "Security check failed: this file appears to be a Linux executable and cannot be uploaded." }

    } catch {
        // Can't read bytes — allow through on this check, but the earlier
        // extension/MIME/size checks still applied.
    }

    return { valid: true, error: null }
}

function getFileStyle(type = "") {
    if (type.startsWith("image/")) return { icon: "image", color: "text-primary-fixed-dim", bg: "bg-primary-container/20" }
    if (type === "application/pdf") return { icon: "picture_as_pdf", color: "text-error", bg: "bg-error-container/20" }
    if (type.includes("word") || type === "application/msword")
        return { icon: "description", color: "text-muted", bg: "bg-raised" }
    if (type.includes("sheet") || type === "application/vnd.ms-excel")
        return { icon: "table", color: "text-accent-ink", bg: "bg-[var(--primary-color)]/10" }
    if (type.includes("zip")) return { icon: "folder_zip", color: "text-muted", bg: "bg-raised" }
    if (type.startsWith("text/")) return { icon: "article", color: "text-muted", bg: "bg-raised" }
    return { icon: "insert_drive_file", color: "text-muted", bg: "bg-raised" }
}

function formatBytes(bytes) {
    if (!bytes) return ""
    if (bytes < 1024) return bytes + " B"
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
    return (bytes / (1024 * 1024)).toFixed(1) + " MB"
}


function ProjectPage() {
    const { project_id } = useParams()
    // The sidebar's saved list gives the name and deadline at once; the fetch below confirms them
    const [savedProject] = useState(() => findSavedProject(project_id))
    const [project_name, setProjectName] = useState(savedProject?.name || "")
    const [project_due_date, setProjectDueDate] = useState(savedProject?.due_date || "")
    const [isProjectLoaded, setIsProjectLoaded] = useState(false)
    const [project_tasks, setProjectTasks] = useState([])
    const [activityLog, setActivityLog] = useState([])
    const [isActivityCollapsed, setIsActivityCollapsed] = useState(false)
    const visibleActivity = dedupeActivity(activityLog)
    const [activeTab, setActiveTab] = useState("summary")
    const [organizationId, setOrganizationId] = useState("")
    const [teamSpaceId, setTeamSpaceId] = useState("")
    const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false)
    const [createTaskInitialStatus, setCreateTaskInitialStatus] = useState("todo")
    const [dragOverColumn, setDragOverColumn] = useState(null)
    const [selectedTask, setSelectedTask] = useState(null)
    const [orgUsers, setOrgUsers] = useState([])
    // Who is away now or later (empty until migration 20261120130000 is applied)
    const awayPeriods = useAwayPeriods()
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [priorityDropdownOpen, setPriorityDropdownOpen] = useState(false)
    const [newSubtaskTitle, setNewSubtaskTitle] = useState("")
    const [selectedDateEvents, setSelectedDateEvents] = useState(null)
    const [sidebarActionMenuOpen, setSidebarActionMenuOpen] = useState(false)
    const [creatingInSidebar, setCreatingInSidebar] = useState(null)
    const [currentUserId, setCurrentUserId] = useState(null)

    // The departments you're in (for cross-department projects)
    const { departments: myDepartments, can } = useRole()

    // ── Delete project
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [deletingProject, setDeletingProject] = useState(false)
    const [deleteProjectError, setDeleteProjectError] = useState("")
    // null while checking; then whether the server's can_manage_project allows a delete
    const [canDeleteProject, setCanDeleteProject] = useState(null)
    // Task details: the project's managers (can_manage_project) and the task's assignee
    const canEditTaskDetails = canDeleteProject === true || Boolean(selectedTask && selectedTask.assignee_id === currentUserId)
    // null while checking; then can_edit_project, the rule for adding tasks here
    const [canAddTasks, setCanAddTasks] = useState(null)
    const [projectDepartmentName, setProjectDepartmentName] = useState(null)
    // Task deadlines: super admins, admins and project managers (can_manage_project,
    // the same rule the database's tasks_guard_due_date trigger checks)
    const canEditTaskDeadline = canDeleteProject === true

    // Same rule the delete-workspace-item function enforces: team lead or higher in
    // the project's own department, or an org admin. Being a direct member is not enough.
    useEffect(() => {
        if (!project_id) return undefined
        let cancelled = false
        const checkDeletePermission = async () => {
            const [{ data: allowed, error: rpcError }, { data: canEdit, error: editError }, { data: project }] = await Promise.all([
                supabase.rpc("can_manage_project", { p_project_id: project_id }),
                supabase.rpc("can_edit_project", { p_project_id: project_id }),
                supabase.from("project_spaces").select("team_space:team_spaces(name)").eq("id", project_id).maybeSingle(),
            ])
            if (cancelled) return
            if (rpcError || editError) console.error("Error checking project permissions:", rpcError || editError)
            setCanDeleteProject(Boolean(allowed) && !rpcError)
            setCanAddTasks(Boolean(canEdit) && !editError)
            setProjectDepartmentName(project?.team_space?.name || null)
        }
        checkDeletePermission()
        return () => { cancelled = true }
    }, [project_id])

    // ── Members
    const [projectMembers, setProjectMembers] = useState([])
    const [showAddMemberModal, setShowAddMemberModal] = useState(false)
    // Until both lists arrive, an empty list means "still loading", not "nobody"
    const [isMembersLoaded, setIsMembersLoaded] = useState(false)
    const [isOrgUsersLoaded, setIsOrgUsersLoaded] = useState(false)

    // ── File upload state
    const [projectFiles, setProjectFiles] = useState([])
    const [showUploadZone, setShowUploadZone] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [uploadError, setUploadError] = useState("")
    const [dragOver, setDragOver] = useState(false)
    const [boardNotice, setBoardNotice] = useState("")
    // Custom board columns (project_columns); defaults until the project customises them
    const [boardColumns, setBoardColumns] = useState(DEFAULT_COLUMNS)
    const [columnsAvailable, setColumnsAvailable] = useState(true)
    const [columnSaving, setColumnSaving] = useState(false)
    const [draggingColumnKey, setDraggingColumnKey] = useState(null)
    const [columnDropKey, setColumnDropKey] = useState(null)
    const [columnToDelete, setColumnToDelete] = useState(null)
    const [deletingColumn, setDeletingColumn] = useState(false)
    const [deleteColumnError, setDeleteColumnError] = useState("")

    useEffect(() => {
        if (!project_id) return undefined
        let cancelled = false
        const loadColumns = async () => {
            const { columns, available } = await fetchProjectColumns(project_id)
            if (cancelled) return
            setBoardColumns(columns)
            setColumnsAvailable(available)
        }
        loadColumns()
        return () => { cancelled = true }
    }, [project_id])
    const [pendingFile, setPendingFile] = useState(null)
    const [pendingUrl, setPendingUrl] = useState(null)
    const [reviewFile, setReviewFile] = useState(null)
    const [confirmDeleteId, setConfirmDeleteId] = useState(null)
    const fileInputRef = useRef()
    const [taskUploading, setTaskUploading] = useState(false)
    const [taskUploadError, setTaskUploadError] = useState("")
    const taskFileInputRef = useRef()

    const updateTaskPriority = async (taskId, newPriority) => {
        const task = project_tasks.find(t => String(t.id) === String(taskId))
        setSelectedTask(prev => prev ? { ...prev, priority: newPriority } : null)
        setProjectTasks(prevTasks =>
            prevTasks.map(t =>
                String(t.id) === String(taskId) ? { ...t, priority: newPriority } : t
            )
        )
        const { error } = await supabase.from('tasks').update({ priority: newPriority }).eq('id', taskId)
        if (error) {
            console.error("Error updating priority", error)
        } else if (task) {
            const userData = { user: await getSessionUser() }
            const logEntry = {
                entity_type: "task",
                entity_id: taskId,
                actor_id: userData?.user?.id,
                action: "priority_changed",
                new_state: { project_id: project_id, title: task.title, priority: newPriority }
            }
            const { data: newLog } = await supabase.from("activity_log").insert(logEntry).select("*, actor:users(name, email)").single()
            if (newLog) setActivityLog(prev => [newLog, ...prev])
        }
    }

    const updateTaskSubtasks = async (taskId, newSubtasks) => {
        const task = project_tasks.find(t => String(t.id) === String(taskId))
        if (!task) return

        // Subtasks drive the status; with none left the task keeps its current status
        const newStatus = statusFromSubtasks(newSubtasks) ?? task.status
        const statusChanged = newStatus !== task.status

        const serialized = JSON.stringify(newSubtasks)

        setSelectedTask(prev => prev && String(prev.id) === String(taskId) ? { ...prev, sub_tasks: serialized, status: newStatus } : prev)
        setProjectTasks(prevTasks =>
            prevTasks.map(t =>
                String(t.id) === String(taskId) ? { ...t, sub_tasks: serialized, status: newStatus } : t
            )
        )

        const updatePayload = { sub_tasks: serialized }
        if (statusChanged) {
            updatePayload.status = newStatus
        }

        const { error } = await supabase.from('tasks').update(updatePayload).eq('id', taskId)
        if (error) {
            console.error("Error updating subtasks", error)
        } else if (statusChanged) {
            const userData = { user: await getSessionUser() }
            const logEntry = {
                entity_type: "task", entity_id: taskId, actor_id: userData?.user?.id,
                action: "status_changed",
                new_state: { project_id: project_id, title: task.title, status: newStatus }
            }
            const { data: newLog } = await supabase.from("activity_log").insert(logEntry).select("*, actor:users(name, email)").single()
            if (newLog) setActivityLog(prev => [newLog, ...prev])
        }
    }

    // ─── Task handlers (UNCHANGED) ────────────────────────────────────────────
    const handleDragStart = (e, taskId) => {
        e.dataTransfer.setData("taskId", taskId)
    }

    const showBoardNotice = (message) => {
        setBoardNotice(message)
        setTimeout(() => setBoardNotice(""), BOARD_NOTICE_MS)
    }

    // People who can manage the project (same server rule as deleting it) edit columns
    const canManageColumns = canDeleteProject === true && columnsAvailable

    const columnSaveFailed = () =>
        showBoardNotice("Couldn't save the board's columns. You may not have permission to change this project.")

    // Default columns are saved the first time someone customises the board
    const withSavedColumns = async () => {
        const { columns, error } = await ensureSavedColumns(project_id, boardColumns)
        if (error) {
            console.error("Error saving board columns:", error)
            columnSaveFailed()
            return null
        }
        if (columns !== boardColumns) setBoardColumns(columns)
        return columns
    }

    // New columns are added at the end of the board
    const handleAddColumn = async (name, baseStatus) => {
        setColumnSaving(true)
        try {
            const saved = await withSavedColumns()
            if (!saved) return false
            const { column, error } = await createColumn(project_id, { name, baseStatus, position: saved.length })
            if (error || !column) {
                console.error("Error adding column:", error)
                columnSaveFailed()
                return false
            }
            setBoardColumns([...saved, column])
            return true
        } finally {
            setColumnSaving(false)
        }
    }

    const handleRenameColumn = async (column, name) => {
        const index = boardColumns.findIndex(c => c.key === column.key)
        const saved = await withSavedColumns()
        if (!saved || index < 0) return
        setBoardColumns(saved.map((c, i) => (i === index ? { ...c, name } : c)))
        const { error } = await renameColumn(saved[index].id, name)
        if (error) {
            console.error("Error renaming column:", error)
            setBoardColumns(saved)
            columnSaveFailed()
        }
    }

    const handleMoveColumn = async (fromKey, toIndex) => {
        const fromIndex = boardColumns.findIndex(c => c.key === fromKey)
        if (fromIndex < 0 || toIndex < 0 || toIndex >= boardColumns.length || fromIndex === toIndex) return
        const saved = await withSavedColumns()
        if (!saved) return
        const reordered = [...saved]
        const [moved] = reordered.splice(fromIndex, 1)
        reordered.splice(toIndex, 0, moved)
        setBoardColumns(reordered)
        const { error } = await saveColumnOrder(reordered)
        if (error) {
            console.error("Error reordering columns:", error)
            setBoardColumns(saved)
            columnSaveFailed()
        }
    }

    const tasksInColumn = (column) => project_tasks.filter(t => columnKeyForTask(t, boardColumns) === column.key)
    // What the board shows, overdue split out; the Summary overview counts the same groups
    const tasksByColumn = groupTasksByColumn(project_tasks, boardColumns)

    // ── Cross-department projects (migration 20261120100000): the project's
    // departments, lead first. Empty until that migration is applied.
    // Every row, invited ones included; projectDepartments are the ones working on it
    const [allProjectDepartments, setProjectDepartments] = useState([])
    const projectDepartments = allProjectDepartments.filter((d) => d.status !== "invited")
    const invitedDepartments = allProjectDepartments.filter((d) => d.status === "invited")
    const [departmentsVersion, setDepartmentsVersion] = useState(0)
    const [departmentFilter, setDepartmentFilter] = useState({ departmentId: null, isBlockedOnly: false })
    const [hasLoadedDepartments, setHasLoadedDepartments] = useState(false)
    useEffect(() => {
        if (!project_id) return undefined
        let cancelled = false
        const loadDepartments = async () => {
            const { data } = await fetchProjectDepartments(project_id)
            if (cancelled) return
            setProjectDepartments(data)
            setHasLoadedDepartments(true)
        }
        loadDepartments()
        return () => { cancelled = true }
    }, [project_id, departmentsVersion])
    // Add Members offers the members of the project's department, or of all its
    // departments on a cross-department project. Waits until those are known.
    const memberDepartments = projectDepartments.length > 0
        ? projectDepartments
        : (teamSpaceId ? [{ team_space_id: teamSpaceId, name: projectDepartmentName || "" }] : [])
    const memberDepartmentKey = hasLoadedDepartments ? memberDepartments.map((d) => d.team_space_id).join(",") : ""
    const [departmentMemberRows, setDepartmentMemberRows] = useState([])
    const [loadedMemberKey, setLoadedMemberKey] = useState(null)
    useEffect(() => {
        if (!memberDepartmentKey) return undefined
        let cancelled = false
        const loadDepartmentMembers = async () => {
            const { data, error } = await supabase
                .from("memberships")
                .select("team_space_id, user:users(id, name, email, job_title)")
                .in("team_space_id", memberDepartmentKey.split(","))
            if (cancelled) return
            if (error) console.error("Error fetching department members:", error)
            setDepartmentMemberRows(error ? [] : (data || []))
            setLoadedMemberKey(memberDepartmentKey)
        }
        loadDepartmentMembers()
        return () => { cancelled = true }
    }, [memberDepartmentKey])

    // A task made from the header's Create menu on this page joins the board at once
    useEffect(() => {
        const addCreatedTask = (event) => {
            const task = event.detail
            if (!task || String(task.project_id) !== String(project_id)) return
            setProjectTasks((prev) => (prev.some((t) => String(t.id) === String(task.id)) ? prev : [task, ...prev]))
        }
        window.addEventListener(TASK_CREATED_EVENT, addCreatedTask)
        return () => window.removeEventListener(TASK_CREATED_EVENT, addCreatedTask)
    }, [project_id])
    const leadDepartmentId = projectDepartments[0]?.team_space_id ?? teamSpaceId
    const isCrossDepartment = projectDepartments.length > 1
    // The Departments tab also shows invites still waiting for an answer
    const hasDepartmentsTab = isCrossDepartment || invitedDepartments.length > 0
    // The board can show one department, or only blocked tasks; the Summary still counts everything
    const tasksById = new Map(project_tasks.map((t) => [String(t.id), t]))
    const boardTasks = isCrossDepartment
        ? project_tasks.filter((t) => matchesDepartmentFilter(t, departmentFilter, leadDepartmentId, tasksById))
        : project_tasks
    const boardTasksByColumn = groupTasksByColumn(boardTasks, boardColumns)
    // New tasks go to the department being viewed, else yours, else the lead department
    const myProjectDepartmentId = projectDepartments.find((d) => myDepartments.some((m) => String(m.team_space_id) === String(d.team_space_id)))?.team_space_id
    const newTaskDepartmentId = departmentFilter.departmentId || myProjectDepartmentId || leadDepartmentId
    const taskModalDepartments = isCrossDepartment ? projectDepartments : []

    // Same rule as the database's tasks_guard_department: the task's assignee or
    // creator, a lead of its department (its named lead, or project.manage there:
    // leads_project_department), or a project manager
    const canBlockTask = (task) => {
        if (!task || !currentUserId) return false
        const department = String(task.team_space_id ?? leadDepartmentId)
        return canDeleteProject === true
            || task.assignee_id === currentUserId
            || task.created_by === currentUserId
            || projectDepartments.some((d) => String(d.team_space_id) === department && d.lead_id === currentUserId)
            || can("project.manage", department)
    }
    const patchTask = (taskId, changes) => {
        setProjectTasks((prev) => prev.map((t) => (String(t.id) === String(taskId) ? { ...t, ...changes } : t)))
        setSelectedTask((prev) => (prev && String(prev.id) === String(taskId) ? { ...prev, ...changes } : prev))
    }
    // Both resolve to an error message for TaskBlockPanel, or null once saved
    const handleTaskDepartmentChange = async (taskId, departmentId) => {
        const { error } = await updateTaskDepartment(taskId, departmentId)
        if (!error) patchTask(taskId, { team_space_id: departmentId })
        return error
    }
    const handleTaskBlockSave = async (taskId, blockerId) => {
        const { data, error } = await setTaskBlock(taskId, blockerId)
        if (!error) patchTask(taskId, { blocked_by_task_id: data.blocked_by_task_id, blocked_at: data.blocked_at })
        return error
    }

    const confirmDeleteColumn = async () => {
        const column = columnToDelete
        if (!column) return
        const index = boardColumns.findIndex(c => c.key === column.key)
        setDeletingColumn(true)
        setDeleteColumnError("")
        try {
            const saved = await withSavedColumns()
            if (!saved || index < 0) {
                setDeleteColumnError("Couldn't save the board's columns. You may not have permission to change this project.")
                return
            }
            const savedColumn = saved[index]
            const target = fallbackColumn(saved, savedColumn)
            if (!target) {
                setDeleteColumnError("A board needs at least one column.")
                return
            }
            const lastOfStatus = !saved.some(c => c.key !== savedColumn.key && c.base_status === savedColumn.base_status)
            const { error } = await deleteColumn(project_id, savedColumn, target, { lastOfStatus })
            if (error) {
                setDeleteColumnError("Couldn't delete the column: " + error.message)
                return
            }
            setProjectTasks(prev => prev.map(t => {
                const movesWithColumn = t.column_id === savedColumn.id ||
                    (lastOfStatus && !t.column_id && t.status === savedColumn.base_status)
                return movesWithColumn ? { ...t, column_id: target.id, status: target.base_status } : t
            }))
            setBoardColumns(saved.filter(c => c.key !== savedColumn.key))
            setColumnToDelete(null)
        } finally {
            setDeletingColumn(false)
        }
    }

    const handleDrop = async (e, column) => {
        e.preventDefault()
        setDragOverColumn(null)
        const taskId = e.dataTransfer.getData("taskId")
        if (!taskId) return
        const task = project_tasks.find(t => String(t.id) === String(taskId))
        if (!task) return

        // Any task can be moved to any column; ticking subtasks still updates its status automatically
        const newStatus = column.base_status
        const isOverdue = isTaskOverdue({ ...task, status: newStatus })
        if (columnKeyForTask(task, boardColumns) === column.key) {
            if (isOverdue) showBoardNotice(`"${task.title}" is already in ${column.name} — it shows under Overdue until it's done or its due date changes.`)
            return
        }

        // column_id only exists once the custom-columns migration has been run
        const changes = columnsAvailable ? { status: newStatus, column_id: column.id || null } : { status: newStatus }
        const previous = { status: task.status, column_id: task.column_id ?? null }
        setProjectTasks(prevTasks =>
            prevTasks.map(t => (String(t.id) === String(taskId) ? { ...t, ...changes } : t))
        )

        // .select() confirms a row actually changed (permissions can silently update 0 rows)
        const { data: updated, error } = await supabase
            .from("tasks")
            .update(changes)
            .eq("id", taskId)
            .select("id")

        if (error || !updated?.length) {
            console.error("Error moving task:", error)
            setProjectTasks(prevTasks =>
                prevTasks.map(t => (String(t.id) === String(taskId) ? { ...t, ...previous } : t))
            )
            showBoardNotice(`Couldn't move "${task.title}". You may not have permission to edit this project.`)
            return
        }
        if (isOverdue) showBoardNotice(`"${task.title}" moved to ${column.name}. It stays under Overdue until it's done or its due date changes.`)
        if (newStatus === task.status) return // moved between columns of the same status
        const userData = { user: await getSessionUser() }
        const logEntry = {
            entity_type: "task", entity_id: taskId, actor_id: userData?.user?.id,
            action: "status_changed",
            new_state: { project_id: project_id, title: task.title, status: newStatus }
        }
        const { data: newLog } = await supabase.from("activity_log").insert(logEntry).select("*, actor:users(name, email)").single()
        if (newLog) setActivityLog(prev => [newLog, ...prev])
    }

    const handleDeleteTask = async (taskId, taskTitle) => {
        if (!window.confirm("Are you sure you want to delete this task?")) return;

        // Optimistically remove from UI
        setProjectTasks(prev => prev.filter(t => t.id !== taskId));

        const { error } = await supabase
            .from("tasks")
            .delete()
            .eq("id", taskId);

        if (error) {
            console.error("Error deleting task:", error);
            // Revert state if needed, but keeping it simple here
        } else {
            const userData = { user: await getSessionUser() }
            const logEntry = {
                entity_type: "task", entity_id: taskId, actor_id: userData?.user?.id,
                action: "deleted",
                new_state: { project_id: project_id, title: taskTitle }
            };
            const { data: newLog } = await supabase.from("activity_log").insert(logEntry).select("*, actor:users(name, email)").single();
            if (newLog) setActivityLog(prev => [newLog, ...prev]);
        }
    }

    // Resolves to an error message for ProjectDeadline, or null once saved.
    // .select() confirms a row changed: permissions can silently update 0 rows (B-06).
    const handleDeadlineSave = async (nextDate) => {
        const { data: updated, error } = await supabase
            .from("project_spaces")
            .update({ due_date: nextDate })
            .eq("id", project_id)
            .select("id")
        if (error || !updated?.length) {
            console.error("Error saving project deadline:", error)
            return "Couldn't save the deadline."
        }
        setProjectDueDate(nextDate || "")
        return null
    }

    // Resolves to an error message for ProjectName, or null once saved (B-06)
    const handleNameSave = async (nextName) => {
        const { data: updated, error } = await supabase
            .from("project_spaces")
            .update({ name: nextName })
            .eq("id", project_id)
            .select("id, name")
        if (error || !updated?.length) {
            console.error("Error renaming project:", error)
            return "Couldn't rename the project."
        }
        setProjectName(updated[0].name)
        announceProjectRenamed(project_id, updated[0].name)
        return null
    }

    // Resolves to an error message for TaskDeadline, or null once saved.
    // .select() confirms a row changed (permissions can silently update 0 rows).
    const handleTaskDeadlineSave = async (taskId, nextDate) => {
        const { data: updated, error } = await supabase
            .from("tasks")
            .update({ due_date: nextDate })
            .eq("id", taskId)
            .select("id")
        if (error || !updated?.length) {
            console.error("Error saving task deadline:", error)
            return "Couldn't save the deadline. Only project managers and admins can change it."
        }
        const withDeadline = t => (String(t.id) === String(taskId) ? { ...t, due_date: nextDate } : t)
        setSelectedTask(prev => (prev ? withDeadline(prev) : prev))
        setProjectTasks(prev => prev.map(withDeadline))
        return null
    }

    // ── File handlers
    const fetchFiles = useCallback(async () => {
        if (!project_id) return
        const { data, error } = await supabase
            .from("project_files")
            .select("id, project_id, name, type, size, path, url, uploaded_by, created_at")
            .eq("project_id", project_id)
            .order("created_at", { ascending: false })
        if (!error) setProjectFiles(await withSignedUrls(data || []))
    }, [project_id])

    const fetchProjectMembers = async () => {
        if (!project_id) return
        const { data, error } = await supabase
            .from("project_members")
            .select("*, user:users(*)")
            .eq("project_id", project_id)
        if (error) console.error("Error fetching project members:", error)
        else setProjectMembers(data || [])
        setIsMembersLoaded(true)
    }

    // ─── Data fetching (UNCHANGED) ────────────────────────────────────────────
    // Resolves to the error, or null once the member list is refreshed
    const removeProjectMember = async (userId) => {
        const { error } = await supabase.from("project_members").delete().eq("project_id", project_id).eq("user_id", userId)
        if (error) {
            console.error("Error removing project member:", error)
            return error
        }
        await fetchProjectMembers()
        return null
    }

    // Adds someone to the project and logs it. Resolves to the error, or null once
    // the member list is refreshed (project_members_insert: project managers only)
    const addProjectMember = async (user) => {
        const { error } = await supabase.from("project_members").insert({ project_id, user_id: user.id })
        if (error) {
            console.error("Error adding project member:", error)
            return error
        }
        await fetchProjectMembers()
        const sessionUser = await getSessionUser()
        await supabase.from("activity_log").insert({
            entity_type: "member", entity_id: user.id,
            actor_id: sessionUser?.id, action: "member_added",
            new_state: { project_id, name: user.name }
        })
        return null
    }

    // App.jsx keys this page by project_id, so switching projects starts from
    // fresh state instead of resetting it here
    useEffect(() => {
        const fetchProject = async () => {
            if (!project_id) return
            // Your organization is looked up alongside the project, not after it,
            // so the people lists (members, assignees) arrive sooner
            const [{ data, error }, myOrgId] = await Promise.all([
                supabase.from("project_spaces").select("*, team_spaces(organization_id)").eq("id", project_id),
                fetchMyOrganizationId(),
            ])
            setIsProjectLoaded(true)
            if (error) console.error("Error fetching project:", error)
            const project = !error && data?.length > 0 ? data[0] : null
            if (project) {
                setProjectName(project.name || "")
                setProjectDueDate(project.due_date || "")
                if (project.team_space_id) setTeamSpaceId(project.team_space_id)
            }
            // Always found, even when the project or its lead department can't be read
            // (people who reach it through another of its departments can't see the
            // lead one): the project is then in the user's own organization
            const orgId = project?.team_spaces?.organization_id || myOrgId
            if (orgId) {
                setOrganizationId(orgId)
                fetchOrgUsers(orgId)
            } else {
                console.error("Couldn't find the organization for project", project_id)
                setIsOrgUsersLoaded(true)
            }
        }

        const fetchMyOrganizationId = async () => {
            const user = await getSessionUser()
            if (!user) return null
            const { data, error } = await supabase.from("users").select("organization_id").eq("id", user.id).maybeSingle()
            if (error) console.error("Error fetching your organization:", error)
            return data?.organization_id ?? null
        }

        const fetchOrgUsers = async (orgId) => {
            if (!orgId) return
            const { data, error } = await supabase
                .from("users")
                .select("id, name, email, organization_id, job_title")
                .eq("organization_id", orgId)
            if (error) {
                console.error("Error fetching org users:", error)
            } else {
                setOrgUsers(data || [])
            }
            setIsOrgUsersLoaded(true)
        }

        const fetchTasks = async () => {
            if (!project_id) return
            const queryTasks = (columns) => supabase
                .from("tasks")
                .select(columns)
                .eq("project_id", project_id)
                .order("created_at", { ascending: false })
            // Newest columns first; 42703 means a migration isn't applied yet, so drop its columns
            let data = null
            let error = null
            for (const columns of [
                `${TASK_COLUMNS}, ${SPRINT_TASK_COLUMNS}, ${DEPARTMENT_TASK_COLUMNS}, ${TASK_KEY_COLUMNS}`,
                `${TASK_COLUMNS}, ${SPRINT_TASK_COLUMNS}, ${DEPARTMENT_TASK_COLUMNS}`,
                `${TASK_COLUMNS}, ${SPRINT_TASK_COLUMNS}, ${TASK_KEY_COLUMNS}`,
                `${TASK_COLUMNS}, ${SPRINT_TASK_COLUMNS}`,
                TASK_COLUMNS,
            ]) {
                ({ data, error } = await queryTasks(columns))
                if (error?.code !== "42703") break
            }
            if (error) { console.error("Error fetching tasks:", error) }
            else {
                // Show statuses as stored; they're only derived when subtasks are edited
                const corrected = data || [];
                setProjectTasks(corrected);
                const urlParams = new URLSearchParams(window.location.search);
                const taskIdParam = urlParams.get("task_id");
                if (taskIdParam) {
                    const taskToOpen = corrected.find(t => String(t.id) === String(taskIdParam));
                    if (taskToOpen) {
                        setSelectedTask(taskToOpen);
                        setActiveTab("tasks");
                    }
                }
            }
        }

        const fetchActivity = async () => {
            if (!project_id) return
            const { data, error } = await fetchProjectActivity(project_id)
            if (!error) setActivityLog(data)
        }

        const fetchUserRole = async () => {
            const authData = { user: await getSessionUser() }
            const userId = authData?.user?.id
            if (!userId) return
            setCurrentUserId(userId)
        }

        fetchProject()
        fetchTasks()
        fetchActivity()
        fetchUserRole()
        // Both only set state after their request returns (the rule can't see past the await)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchFiles()
        fetchProjectMembers()
    }, [project_id])

    // Live feed: any task change in this project (by anyone, including the
    // database's own task log) reloads Recent Activity
    useEffect(() => {
        if (!project_id) return
        let reloadTimer = null
        const reload = () => {
            clearTimeout(reloadTimer)
            reloadTimer = setTimeout(async () => {
                const { data, error } = await fetchProjectActivity(project_id)
                if (!error) setActivityLog(data)
            }, ACTIVITY_RELOAD_DELAY_MS)
        }
        const channel = supabase
            .channel(`project-activity-${project_id}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${project_id}` }, reload)
            .subscribe()
        return () => {
            clearTimeout(reloadTimer)
            supabase.removeChannel(channel)
        }
    }, [project_id])

    // Recent Activity again, for entries the database writes itself that no task
    // change announces, e.g. a completed sprint (B-05)
    const reloadActivity = async () => {
        const { data, error } = await fetchProjectActivity(project_id)
        if (!error) setActivityLog(data)
    }

    // ── Delete this project
    const handleDeleteProject = async () => {
        setDeletingProject(true)
        setDeleteProjectError("")
        // Server-side delete: also removes stored files and the project's chat channels
        const { error } = await deleteWorkspaceItem("project", project_id)
        if (error) {
            setDeleteProjectError(error)
            setDeletingProject(false)
            return
        }
        // Navigate home after deletion
        window.location.href = "/"
    }

    const assignedMemberIds = new Set(project_tasks.map(t => t.assignee_id).filter(Boolean))
    const assignedMembers = orgUsers.filter(u => assignedMemberIds.has(u.id))

    const handleFilePick = async (file) => {
        if (!file) return
        setUploadError("")
        const { valid, error } = await validateFile(file)
        if (!valid) {
            setUploadError(error)
            return
        }
        if (pendingUrl) URL.revokeObjectURL(pendingUrl)
        setPendingFile(file)
        setPendingUrl(URL.createObjectURL(file))
    }
    const cancelPending = () => {
        if (pendingUrl) URL.revokeObjectURL(pendingUrl)
        setPendingFile(null); setPendingUrl(null); setUploadError("")
    }
    const confirmUpload = async () => {
        if (!pendingFile) return
        setUploading(true); setUploadError("")
        const path = `${project_id}/${Date.now()}-${pendingFile.name}`
        const { error: storageError } = await supabase.storage
            .from("project-files").upload(path, pendingFile, { contentType: pendingFile.type, upsert: false })
        if (storageError) { setUploadError("Upload failed: " + storageError.message); setUploading(false); return }
        const userData = { user: await getSessionUser() }
        const uploaderName = userData?.user?.email?.split("@")[0] || "You"
        // No stored URL: the bucket is private, links are signed when the list loads
        const { data: fileData, error: dbError } = await supabase.from("project_files").insert({
            project_id, name: pendingFile.name, type: pendingFile.type,
            size: pendingFile.size, path, url: "",
            uploaded_by: uploaderName,
        }).select().single()

        if (!dbError && fileData) {
            const logEntry = {
                entity_type: "file",
                entity_id: fileData.id,
                actor_id: userData?.user?.id,
                action: "file_added",
                new_state: { project_id: project_id, name: pendingFile.name }
            }
            const { data: newLog } = await supabase.from("activity_log").insert(logEntry).select("*, actor:users(name, email)").single()
            if (newLog) setActivityLog(prev => [newLog, ...prev])
        }

        URL.revokeObjectURL(pendingUrl)
        setPendingFile(null); setPendingUrl(null); setShowUploadZone(false); setUploading(false)
        fetchFiles()
    }
    const deleteFile = async (f) => {
        // Record first, then the stored file: a refused delete must not leave a
        // listed file whose contents are gone (B-04)
        setUploadError("")
        const { data: deleted, error } = await supabase.from("project_files").delete().eq("id", f.id).select("id")
        if (error || !deleted?.length) {
            if (error) console.error("Deleting file failed:", error)
            setUploadError(`Couldn't delete "${f.name}". You may not have permission.`)
            setConfirmDeleteId(null)
            return
        }
        const { error: storageError } = await supabase.storage.from("project-files").remove([f.path])
        if (storageError) console.error("Removing the stored file failed:", storageError)
        {
            const userData = { user: await getSessionUser() }
            const logEntry = {
                entity_type: "file",
                entity_id: f.id,
                actor_id: userData?.user?.id,
                action: "file_removed",
                new_state: { project_id: project_id, name: f.name }
            }
            const { data: newLog } = await supabase.from("activity_log").insert(logEntry).select("*, actor:users(name, email)").single()
            if (newLog) setActivityLog(prev => [newLog, ...prev])
        }
        setConfirmDeleteId(null); fetchFiles()
    }

    const uploadTaskFile = async (file, taskId) => {
        if (!file || !taskId) return
        setTaskUploading(true)
        setTaskUploadError("")

        const { valid, error } = await validateFile(file)
        if (!valid) {
            setTaskUploadError(error)
            setTaskUploading(false)
            return
        }

        const path = `${project_id}/task-${taskId}/${Date.now()}-${file.name}`
        try {
            const { error: storageError } = await supabase.storage
                .from("project-files").upload(path, file, { contentType: file.type, upsert: false })
            if (storageError) {
                setTaskUploadError("Upload failed: " + storageError.message)
                setTaskUploading(false)
                return
            }
            const userData = { user: await getSessionUser() }
            const uploaderName = userData?.user?.email?.split("@")[0] || "You"
            const { data: fileData, error: dbError } = await supabase.from("project_files").insert({
                project_id,
                task_id: taskId,
                name: file.name,
                type: file.type,
                size: file.size,
                path,
                url: "",
                uploaded_by: uploaderName,
            }).select().single()

            if (dbError) {
                setTaskUploadError("Database save failed: " + dbError.message)
            } else if (fileData) {
                const logEntry = {
                    entity_type: "file",
                    entity_id: fileData.id,
                    actor_id: userData?.user?.id,
                    action: "file_added",
                    new_state: { project_id: project_id, name: file.name, task_id: taskId }
                }
                const { data: newLog } = await supabase.from("activity_log").insert(logEntry).select("*, actor:users(name, email)").single()
                if (newLog) setActivityLog(prev => [newLog, ...prev])
            }
        } catch (err) {
            console.error("Task upload error:", err)
            setTaskUploadError("An unexpected error occurred.")
        } finally {
            setTaskUploading(false)
        }
        fetchFiles()
    }

    const renderPreUploadPreview = () => {
        const isImage = pendingFile?.type?.startsWith("image/")
        const isPDF = pendingFile?.type === "application/pdf"
        const { icon, color, bg } = getFileStyle(pendingFile?.type)
        return (
            <div className="mt-lg border border-line/40 rounded-xl overflow-hidden">
                <div className="bg-surface1 flex items-center justify-center" style={{ minHeight: 220 }}>
                    {isImage && <img src={pendingUrl} alt={pendingFile.name} className="max-w-full max-h-[220px] object-contain rounded" />}
                    {isPDF && <iframe src={pendingUrl} title={pendingFile.name} className="w-full border-0" style={{ height: 220 }} />}
                    {!isImage && !isPDF && (
                        <div className="flex flex-col items-center gap-3 py-8">
                            <div className={`w-16 h-16 ${bg} flex items-center justify-center rounded-2xl`}>
                                <span className={`material-symbols-outlined text-4xl ${color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                            </div>
                            <p className="text-muted text-sm">No visual preview for this file type</p>
                        </div>
                    )}
                </div>
                <div className="bg-raised px-md py-sm flex items-center justify-between gap-md border-t border-line/30">
                    <div className="min-w-0">
                        <p className="text-sm text-white font-semibold truncate">{pendingFile?.name}</p>
                        <p className="text-[11px] text-muted">{formatBytes(pendingFile?.size)}</p>
                    </div>
                    <div className="flex items-center gap-sm shrink-0">
                        <button type="button" onClick={cancelPending} className="px-md py-sm rounded-lg border border-line text-muted hover:bg-line text-sm font-semibold transition-colors cursor-pointer">Cancel</button>
                        <button type="button" onClick={confirmUpload} disabled={uploading} className="px-md py-sm rounded-lg bg-[var(--primary-color)] text-on-accent font-bold hover:opacity-90 active:scale-95 cursor-pointer flex items-center gap-xs disabled:opacity-60">
                            {uploading
                                ? <><PlanetLoader className="text-[16px]" /> Uploading…</>
                                : <><span className="material-symbols-outlined text-[16px]">cloud_upload</span> Confirm Upload</>}
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // The project's own department, for the "Delete locked" note: from the project,
    // else your departments, else its department list (that one may say just "Department")
    const lockedDepartmentName = projectDepartmentName
        || myDepartments.find((d) => String(d.team_space_id) === String(teamSpaceId))?.name
        || projectDepartments.find((d) => String(d.team_space_id) === String(teamSpaceId) && d.name !== "Department")?.name
        || null

    // Name and deadline: shown at once when saved, otherwise placeholder bars until the fetch returns
    const projectHeading = project_name || isProjectLoaded
        ? (project_name
            ? <ProjectName key={project_name} name={project_name} canEdit={canDeleteProject === true} onSave={handleNameSave} />
            : <h2 className="font-headline-xl text-2xl text-primary leading-tight shrink-0">Project not found</h2>)
        : <div className="h-8 w-56 rounded-md bg-line animate-pulse" aria-label="Loading project" />
    const isDeadlinePending = !project_due_date && (!isProjectLoaded || canDeleteProject === null)
    const projectDeadline = isDeadlinePending
        ? <div className="h-7 w-32 rounded-full bg-line animate-pulse" aria-label="Loading deadline" />
        : <ProjectDeadline dueDate={project_due_date} canEdit={canDeleteProject === true} onSave={handleDeadlineSave} />

    return (
        <div className="bg-canvas min-h-screen text-white font-sans antialiased">
            <Sidebar onCollapsedChange={setSidebarCollapsed} />
            <Header />
            <main className={`${sidebarCollapsed ? "ml-[72px]" : "ml-[260px]"} p-lg h-[calc(100vh-64px)] overflow-y-auto scroll-hide transition-all duration-300 ease-out`}>
                {/* Project Header */}
                <div className="mb-lg">
                    <div className="flex items-center gap-md flex-wrap">
                        {projectHeading}
                        {projectDeadline}
                    </div>
                    {/* Sub-Tabs Navigation */}
                    <div className="flex items-center gap-sm mt-xl mb-lg">
                        {[
                            { id: "summary", label: "Summary", icon: "dashboard" },
                            { id: "tasks", label: "Orbit", icon: "view_kanban" },
                            // Only projects shared by more than one department
                            ...(hasDepartmentsTab ? [{ id: "departments", label: "Departments", icon: "lan" }] : []),
                            { id: "calendar", label: "Calendar", icon: "calendar_month" },
                            { id: "files", label: "Public Files", icon: "folder" },
                            { id: "members", label: "Members", icon: "group" },
                            { id: "sprint", label: "Sprint", icon: "directions_run" },
                            { id: "messages", label: "Messages", icon: "chat" }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-md font-label-md text-xs transition-colors cursor-pointer ${activeTab === tab.id
                                    ? "bg-primary-accent text-on-accent font-bold shadow-sm"
                                    : "text-muted hover:text-white hover:bg-line/50"
                                    }`}
                            >
                                <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}

                        {/* Trash — only when the server allows deleting this project */}
                        {canDeleteProject === true && (
                            <button
                                type="button"
                                title="Delete this project"
                                onClick={() => setShowDeleteConfirm(true)}
                                className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-md text-muted hover:text-red-400 hover:bg-red-950/20 transition-colors cursor-pointer text-[13px] font-medium"
                            >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                                Delete project
                            </button>
                        )}
                        {canDeleteProject === false && (
                            // Compact pill; the full reason shows in a tooltip on hover or focus
                            <span
                                tabIndex={0}
                                aria-describedby="delete-locked-reason"
                                className="group relative ml-auto shrink-0 flex items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-panel px-2.5 py-1.5 text-[12px] font-medium text-muted cursor-help outline-none hover:text-red-400 hover:border-red-500/40 hover:bg-red-950/20 focus-visible:text-red-400 focus-visible:border-red-500/40 focus-visible:bg-red-950/20 focus-visible:ring-2 focus-visible:ring-red-500/30 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[15px]" aria-hidden="true">lock</span>
                                Delete locked
                                <span
                                    id="delete-locked-reason"
                                    role="tooltip"
                                    className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-64 whitespace-normal rounded-lg border border-line bg-surface1 px-3 py-2 text-left text-[12px] font-normal leading-relaxed text-soft shadow-xl opacity-0 translate-y-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 group-focus-visible:opacity-100 group-focus-visible:translate-y-0"
                                >
                                    {/* Every project has a department; its name may just not be readable here */}
                                    Only an admin or team lead of {lockedDepartmentName
                                        ? <span className="text-white font-semibold">{lockedDepartmentName}</span>
                                        : "this project's department"} can delete this project.
                                </span>
                            </span>
                        )}
                    </div>
                </div>
                {/* Tab Contents */}
                <div id="content-area">
                    {/* Summary Tab */}
                    {activeTab === "summary" && (
                        <div className="tab-pane block" id="section-summary">
                            <div className="bento-grid">
                                {/* Task Status Overview */}
                                <div className="col-span-12 bg-raised border border-line p-xl rounded-xl mb-lg">
                                    <h3 className="font-headline-lg text-xl mb-xl text-white">Task Overview</h3>
                                    <div className="space-y-lg max-w-3xl">
                                        {/* Same columns and counts as the Tasks board, custom columns included */}
                                        {[...boardColumns, OVERDUE_COLUMN].map(column => ({
                                            key: column.key,
                                            label: column.name,
                                            count: (tasksByColumn[column.key] ?? []).length,
                                            color: column.isOverdue ? 'text-error' : column.base_status === 'done' ? 'text-accent-ink' : 'text-white',
                                            barColor: column.isOverdue ? 'bg-error' : column.base_status === 'done' ? 'bg-[var(--primary-color)]' : 'bg-muted',
                                        })).map(stat => {
                                            const total = Math.max(1, project_tasks.length);
                                            const percent = (stat.count / total) * 100;
                                            return (
                                                <div key={stat.key} className="flex items-center gap-6">
                                                    <span className={`w-28 text-right font-headline-sm tracking-wide ${stat.color}`}>{stat.label}</span>
                                                    <div className="flex-1 h-3.5 bg-line rounded-full overflow-hidden">
                                                        <div className={`h-full ${stat.barColor} rounded-full transition-all duration-1000`} style={{ width: `${percent}%` }}></div>
                                                    </div>
                                                    <span className="w-12 font-headline-sm text-white">{stat.count}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Recent Activity Feed (Full Width) */}
                                <div className="col-span-12 bg-raised border border-line p-lg rounded-xl">
                                    <div className={`flex items-center gap-2 ${isActivityCollapsed ? "" : "mb-lg"}`}>
                                        <button
                                            type="button"
                                            onClick={() => setIsActivityCollapsed(v => !v)}
                                            aria-expanded={!isActivityCollapsed}
                                            aria-controls="project-recent-activity"
                                            title={isActivityCollapsed ? "Expand recent activity" : "Collapse recent activity"}
                                            className="w-7 h-7 rounded-lg bg-canvas border border-line hover:border-line-strong text-muted hover:text-white flex items-center justify-center transition-all cursor-pointer"
                                        >
                                            <span className={`material-symbols-outlined text-[18px] transition-transform duration-200 ${isActivityCollapsed ? "-rotate-90" : ""}`}>expand_more</span>
                                        </button>
                                        <h3 className="font-headline-md text-lg text-white">Recent Activity</h3>
                                    </div>
                                    <div id="project-recent-activity" hidden={isActivityCollapsed} className="space-y-lg overflow-y-auto max-h-[600px] scroll-hide">
                                        {visibleActivity.length === 0 ? (
                                            <p className="text-muted text-sm">No recent activity found.</p>
                                        ) : (
                                            visibleActivity.map(activity => (
                                                <div key={activity.id} className="flex gap-sm">
                                                    <div className="w-8 h-8 shrink-0 rounded-full overflow-hidden bg-line flex items-center justify-center font-bold text-xs text-muted uppercase">
                                                        <PersonPhoto userId={activity.actor_id} fallback={activity.actor?.name?.charAt(0) || '?'} />
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-xs leading-snug">
                                                            <span className="text-primary font-bold">{activity.actor?.name || 'Unknown User'}</span>
                                                            {' '}
                                                            {activity.action === "created" && activity.entity_type === "project" && (
                                                                <>created the project <span className="text-primary-fixed-dim font-bold">{activity.new_state?.project_name}</span></>
                                                            )}
                                                            {activity.action === "created" && activity.entity_type !== "project" && (
                                                                <>created task <span className="text-primary-fixed-dim font-bold">{activity.new_state?.title}</span></>
                                                            )}
                                                            {activity.action === "updated" && (
                                                                <>updated task <span className="text-primary-fixed-dim font-bold">{activity.new_state?.title}</span></>
                                                            )}
                                                            {activity.action === "member_added" && (
                                                                <>added <span className="text-primary-fixed-dim font-bold">{activity.new_state?.name || "a member"}</span> to the project</>
                                                            )}
                                                            {activity.action === "deleted" && (
                                                                <>deleted task <span className="text-error font-bold">{activity.new_state?.title}</span></>
                                                            )}
                                                            {activity.action === "status_changed" && (
                                                                <>moved task <span className="text-primary-fixed-dim font-bold">{activity.new_state?.title}</span> to <span className="text-white capitalize border border-line rounded px-1">{activity.new_state?.status?.replace("_", " ")}</span></>
                                                            )}
                                                            {activity.action === "priority_changed" && (
                                                                <>changed priority of task <span className="text-primary-fixed-dim font-bold">{activity.new_state?.title}</span> to <span className="text-white capitalize border border-line rounded px-1">{activity.new_state?.priority}</span></>
                                                            )}
                                                            {activity.action === "file_added" && (
                                                                <>uploaded file <span className="text-primary-fixed-dim font-bold">{activity.new_state?.name}</span></>
                                                            )}
                                                            {activity.action === "file_removed" && (
                                                                <>deleted file <span className="text-error font-bold">{activity.new_state?.name}</span></>
                                                            )}
                                                            {activity.action === "sprint_started" && (
                                                                <>started <span className="text-primary-fixed-dim font-bold">{activity.new_state?.name}</span> with {activity.new_state?.totalTasks} task{activity.new_state?.totalTasks === 1 ? "" : "s"}{activity.new_state?.committedPoints > 0 && ` (${activity.new_state.committedPoints} pts)`}</>
                                                            )}
                                                            {["department_invited", "department_joined", "department_declined"].includes(activity.action) && (
                                                                <>{{ department_invited: "invited", department_joined: "accepted the invite for", department_declined: "declined the invite for" }[activity.action]} <span className="text-primary-fixed-dim font-bold">{activity.new_state?.department || "a department"}</span>{activity.action === "department_invited" ? " to work on this project" : ""}</>
                                                            )}
                                                            {activity.action === "department_nudged" && (
                                                                <>nudged <span className="text-primary-fixed-dim font-bold">{activity.new_state?.department || "a department"}</span> about this project</>
                                                            )}
                                                            {activity.action === "sprint_completed" && (
                                                                <>completed {activity.new_state?.name ? <span className="text-primary-fixed-dim font-bold">{activity.new_state.name}</span> : "a sprint"} with <span className="text-accent-ink font-bold">{activity.new_state?.completionPercent}%</span> done ({activity.new_state?.completedCount}/{activity.new_state?.totalTasks} tasks)</>
                                                            )}
                                                        </p>
                                                        <p className="text-muted text-[10px] mt-xs">{new Date(activity.created_at).toLocaleString()}</p>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Sprint Tab */}
                    {activeTab === "departments" && hasDepartmentsTab && (
                        <DepartmentsTab
                            projectId={project_id}
                            projectDueDate={project_due_date}
                            departments={projectDepartments}
                            invitedDepartments={invitedDepartments}
                            tasks={project_tasks}
                            orgUsers={orgUsers}
                            currentUserId={currentUserId}
                            canManage={canDeleteProject === true}
                            onResolve={(departmentId) => { setDepartmentFilter({ departmentId, isBlockedOnly: false }); setActiveTab("tasks") }}
                            onOpenTask={setSelectedTask}
                            onDepartmentsChanged={() => setDepartmentsVersion((v) => v + 1)}
                        />
                    )}
                    {activeTab === "sprint" && (
                        <SprintTab
                            projectId={project_id}
                            tasks={project_tasks}
                            onTasksChange={setProjectTasks}
                            canManage={canDeleteProject === true}
                            members={projectMembers}
                            onOpenTask={setSelectedTask}
                            onActivityLogged={reloadActivity}
                        />
                    )}

                    {/* Messages Tab */}
                    {activeTab === "messages" && (
                        <div className="tab-pane block h-full">
                            <GroupChat 
                                projectId={project_id} 
                                currentUserId={currentUserId} 
                                members={orgUsers} 
                            />
                        </div>
                    )}

                    {/* Tasks Tab — Orbit Board */}
                    {activeTab === "tasks" && (
                        <div className="tab-pane block" id="section-tasks">
                            <div className="flex items-center gap-md flex-wrap">
                                {isCrossDepartment && <DepartmentFilterBar departments={projectDepartments} filter={departmentFilter} onChange={setDepartmentFilter} />}
                                <button
                                    type="button"
                                    onClick={() => { setCreateTaskInitialStatus("todo"); setIsCreateTaskModalOpen(true) }}
                                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 btn-primary-accent rounded-lg text-sm font-semibold cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[18px]">add</span>
                                    Add Task
                                </button>
                            </div>
                            {boardNotice && (
                                <div role="status" className="mt-md px-md py-sm rounded-lg border border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#f59e0b] text-xs">
                                    {boardNotice}
                                </div>
                            )}
                            {canDeleteProject === true && !columnsAvailable && (
                                <p className="mt-md text-[12px] text-muted">
                                    Custom columns need a database update: run the <span className="text-white">20261026100000_project_columns</span> migration in Supabase.
                                </p>
                            )}
                            <div className="flex gap-md overflow-x-auto scroll-hide pb-md mt-md" style={{ minHeight: 'calc(100vh - 280px)' }}>
                                {[...boardColumns, OVERDUE_COLUMN].map((column, columnIndex) => {
                                    const columnTasks = boardTasksByColumn[column.key] ?? [];
                                    // "Overdue" is derived from the due date, not a column you can drop into
                                    const acceptsDrop = !column.isOverdue;
                                    const isDropTarget = acceptsDrop && (draggingColumnKey ? columnDropKey === column.key : dragOverColumn === column.key);
                                    const editable = canManageColumns && !column.isOverdue;
                                    return (
                                        <div
                                            key={column.key}
                                            onDragOver={acceptsDrop ? (e) => {
                                                e.preventDefault()
                                                if (draggingColumnKey) setColumnDropKey(column.key)
                                                else setDragOverColumn(column.key)
                                            } : undefined}
                                            onDragLeave={acceptsDrop ? (e) => {
                                                if (!e.currentTarget.contains(e.relatedTarget)) { setDragOverColumn(null); setColumnDropKey(null) }
                                            } : undefined}
                                            onDrop={acceptsDrop ? (e) => {
                                                if (draggingColumnKey) {
                                                    e.preventDefault()
                                                    const fromKey = draggingColumnKey
                                                    setDraggingColumnKey(null)
                                                    setColumnDropKey(null)
                                                    handleMoveColumn(fromKey, columnIndex)
                                                } else {
                                                    handleDrop(e, column)
                                                }
                                            } : undefined}
                                            className={`orbit-column flex-shrink-0 w-[280px] flex flex-col rounded-xl transition-all duration-200 bg-raised/50 border ${isDropTarget ? 'border-accent-ink bg-[var(--primary-color)]/5' : 'border-line/30'} ${draggingColumnKey === column.key ? 'opacity-50' : ''}`}
                                        >
                                            {/* Column Header */}
                                            <BoardColumnHeader
                                                column={column}
                                                count={columnTasks.length}
                                                dotColor={column.isOverdue ? "bg-error" : STATUS_DOT[column.base_status]}
                                                editable={editable}
                                                canMoveLeft={columnIndex > 0}
                                                canMoveRight={columnIndex < boardColumns.length - 1}
                                                canDelete={boardColumns.length > 1}
                                                onRename={(name) => handleRenameColumn(column, name)}
                                                onMoveLeft={() => handleMoveColumn(column.key, columnIndex - 1)}
                                                onMoveRight={() => handleMoveColumn(column.key, columnIndex + 1)}
                                                onDelete={() => { setDeleteColumnError(""); setColumnToDelete(column) }}
                                                onDragStart={(e) => {
                                                    e.dataTransfer.effectAllowed = "move"
                                                    e.dataTransfer.setData("text/plain", column.key)
                                                    setDraggingColumnKey(column.key)
                                                }}
                                                onDragEnd={() => { setDraggingColumnKey(null); setColumnDropKey(null) }}
                                            />

                                            {/* Task Cards */}
                                            <div className="flex-1 overflow-y-auto scroll-hide px-sm space-y-sm pb-sm">
                                                {columnTasks.map(task => (
                                                    <div
                                                        key={task.id}
                                                        draggable
                                                        onDragStart={(e) => handleDragStart(e, task.id)}
                                                        onDragEnd={() => setDragOverColumn(null)}
                                                        onClick={() => setSelectedTask(task)}
                                                        className="bg-raised border border-line rounded-lg p-md cursor-grab active:cursor-grabbing hover:border-accent-ink/50 transition-all group"
                                                    >
                                                        {/* Priority Badge */}
                                                        <div className="mb-sm">
                                                            <span className={`inline-flex items-center gap-xs px-sm py-[2px] rounded text-[10px] font-bold uppercase ${task.priority === 'urgent' ? 'bg-error/15 text-error' :
                                                                task.priority === 'high' ? 'bg-[#f59e0b]/15 text-[#f59e0b]' :
                                                                    task.priority === 'medium' ? 'bg-tertiary/15 text-tertiary' :
                                                                        'bg-primary-fixed-dim/15 text-primary-fixed-dim'
                                                                }`}>
                                                                <span className={`w-1.5 h-1.5 rounded-sm ${task.priority === 'urgent' ? 'bg-error' :
                                                                    task.priority === 'high' ? 'bg-[#f59e0b]' :
                                                                        task.priority === 'medium' ? 'bg-tertiary' :
                                                                            'bg-primary-fixed-dim'
                                                                    }`}></span>
                                                                {task.priority || 'Normal'}
                                                            </span>
                                                            {/* In the Overdue column, show the task's real status */}
                                                            {column.key === "overdue" && STATUS_LABELS[task.status] && (
                                                                <span className="ml-xs inline-flex items-center px-sm py-[2px] rounded text-[10px] font-bold uppercase bg-line text-soft">
                                                                    {STATUS_LABELS[task.status]}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Project Name */}
                                                        <p className="text-[11px] text-muted mb-[2px]">{project_name}</p>

                                                        {/* Task Title */}
                                                        <h4 className="text-sm text-white font-bold leading-snug mb-xs">{task.title}</h4>

                                                        {/* Waiting on another department / holding others up */}
                                                        {isCrossDepartment && <TaskDependencyNote task={task} tasks={project_tasks} departments={projectDepartments} />}

                                                        {/* Description */}
                                                        {task.description && (
                                                            <p className="text-[11px] text-muted/70 leading-relaxed mb-md" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{task.description}</p>
                                                        )}

                                                        {/* Sub-tasks Progress Bar */}
                                                        {(() => {
                                                            let subtasksList = [];
                                                            if (task.sub_tasks) {
                                                                if (Array.isArray(task.sub_tasks)) {
                                                                    subtasksList = task.sub_tasks;
                                                                } else if (typeof task.sub_tasks === "string") {
                                                                    const trimmed = task.sub_tasks.trim();
                                                                    if (trimmed && trimmed !== "null" && trimmed !== "undefined") {
                                                                        try {
                                                                            const parsed = JSON.parse(trimmed);
                                                                            if (Array.isArray(parsed)) {
                                                                                subtasksList = parsed;
                                                                            } else {
                                                                                console.warn("Malformed sub_tasks (expected array) for task", task.id, parsed);
                                                                                subtasksList = [];
                                                                            }
                                                                        } catch (e) {
                                                                            console.warn("Malformed sub_tasks for task", task.id, e);
                                                                            subtasksList = [];
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                            if (subtasksList.length === 0) return null;

                                                            const completedCount = subtasksList.filter(st => st.done).length;
                                                            const totalCount = subtasksList.length;
                                                            const percent = (completedCount / totalCount) * 100;

                                                            return (
                                                                <div className="mb-md">
                                                                    <div className="flex items-center justify-between text-[10px] text-muted mb-1 font-medium">
                                                                        <span className="flex items-center gap-xs">
                                                                            <span className="material-symbols-outlined text-[12px]">format_list_bulleted</span>
                                                                            Sub-tasks
                                                                        </span>
                                                                        <span>{completedCount}/{totalCount}</span>
                                                                    </div>
                                                                    <div className="w-full bg-surface1 rounded-full h-1 overflow-hidden">
                                                                        <div
                                                                            className="bg-[var(--primary-color)] h-full transition-all duration-300"
                                                                            style={{ width: `${percent}%` }}
                                                                        ></div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })()}

                                                        {/* Footer */}
                                                        <div className="flex items-center justify-between mt-auto pt-sm border-t border-line/20">
                                                            <div className="flex items-center gap-sm text-muted">
                                                                {(() => {
                                                                    const assignee = orgUsers.find(u => u.id === task.assignee_id);
                                                                    return task.assignee_id ? (
                                                                        <div className="relative w-5 h-5 rounded-full bg-surface1 border border-line flex items-center justify-center" title={assignee?.name || 'Assigned'}>
                                                                            {/* Clipped on its own so the away dot can sit outside the circle */}
                                                                            <span className="w-full h-full rounded-full overflow-hidden flex items-center justify-center text-[9px] font-bold text-muted uppercase">
                                                                                <PersonPhoto userId={task.assignee_id} fallback={assignee?.name?.charAt(0) || '?'} />
                                                                            </span>
                                                                            <AwayDot person={awayPeriods.get(task.assignee_id)} />
                                                                        </div>
                                                                    ) : null;
                                                                })()}
                                                            </div>
                                                            <div className="flex items-center gap-sm text-muted">
                                                                {task.due_date && (
                                                                    <span className="flex items-center gap-[3px] text-[10px]">
                                                                        <span className="material-symbols-outlined text-[13px]">calendar_today</span>
                                                                        {task.due_date.includes('T') || task.due_date.includes(' ')
                                                                            ? new Date(task.due_date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                                                                            : new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                                    </span>
                                                                )}
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id, task.title); }}
                                                                    className="text-muted hover:text-error transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                                                                    title="Delete Task"
                                                                >
                                                                    <span className="material-symbols-outlined text-[13px]">delete</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                                {columnTasks.length === 0 && (
                                                    <div className="flex flex-col items-center justify-center py-xl text-center opacity-40">
                                                        <span className="material-symbols-outlined text-[32px] text-muted mb-xs">drag_indicator</span>
                                                        <p className="text-[11px] text-muted">{column.isOverdue ? "No overdue tasks" : "Drag tasks here"}</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                                {canManageColumns && <AddColumnTile columns={boardColumns} onAdd={handleAddColumn} saving={columnSaving} />}
                            </div>
                        </div>
                    )}

                    {selectedDateEvents && (
                        <>
                            {/* Backdrop */}
                            <div
                                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                                onClick={() => setSelectedDateEvents(null)}
                            ></div>
                            {/* Sidebar */}
                            <div className="fixed top-0 right-0 z-50 w-1/2 h-full bg-raised border-l border-line shadow-2xl flex flex-col transform transition-transform duration-300">
                                <div className="flex items-center justify-between p-lg border-b border-line/20 shrink-0">
                                    <h2 className="font-headline-md text-white">
                                        Schedule for {selectedDateEvents.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                                    </h2>
                                    <div className="flex items-center gap-sm relative">
                                        <button
                                            className="text-muted hover:text-white cursor-pointer w-8 h-8 flex items-center justify-center rounded-full hover:bg-line transition-colors relative"
                                            onClick={() => setSidebarActionMenuOpen(!sidebarActionMenuOpen)}
                                        >
                                            <span className="material-symbols-outlined">add</span>
                                        </button>
                                        {sidebarActionMenuOpen && (
                                            <>
                                                <div className="fixed inset-0 z-40" onClick={() => setSidebarActionMenuOpen(false)}></div>
                                                <div className="font-body-md absolute right-0 top-full mt-1 w-48 bg-surface1 border border-line rounded-lg shadow-xl z-[70] overflow-hidden">
                                                    {canAddTasks === true && (
                                                        <button
                                                            className="w-full text-left px-4 py-3 hover:bg-line transition-colors flex items-center gap-3 text-sm font-medium text-white cursor-pointer"
                                                            onClick={() => { setSidebarActionMenuOpen(false); setCreatingInSidebar('task'); }}
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">task</span> Add Task
                                                        </button>
                                                    )}
                                                    <button
                                                        className="w-full text-left px-4 py-3 hover:bg-line transition-colors flex items-center gap-3 text-sm font-medium text-white cursor-pointer"
                                                        onClick={() => { setSidebarActionMenuOpen(false); setCreatingInSidebar('meeting'); }}
                                                    >
                                                        <span className="material-symbols-outlined text-[18px]">event</span> Add Meeting
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                        <button className="text-muted hover:text-white cursor-pointer w-8 h-8 flex items-center justify-center rounded-full hover:bg-line transition-colors" onClick={() => { setSelectedDateEvents(null); setCreatingInSidebar(null); setSidebarActionMenuOpen(false); }}>
                                            <span className="material-symbols-outlined">close</span>
                                        </button>
                                    </div>
                                </div>
                                <div className="p-lg overflow-y-auto flex-1 scroll-hide space-y-md">
                                    {creatingInSidebar === 'task' ? (
                                        <div className="h-full flex flex-col">
                                            <button onClick={() => setCreatingInSidebar(null)} className="mb-4 text-sm font-medium text-muted flex items-center gap-1 hover:text-white transition-colors cursor-pointer w-fit">
                                                <span className="material-symbols-outlined text-[16px]">arrow_back</span> Back to schedule
                                            </button>
                                            <CreateTaskModal
                                                projectId={project_id}
                                                organizationId={organizationId}
                                                teamSpaceId={teamSpaceId}
                                                departments={taskModalDepartments}
                                                defaultDepartmentId={newTaskDepartmentId}
                                                initialStatus="todo"
                                                initialDate={selectedDateEvents ? `${selectedDateEvents.getFullYear()}-${String(selectedDateEvents.getMonth() + 1).padStart(2, '0')}-${String(selectedDateEvents.getDate()).padStart(2, '0')}T09:00` : ""}
                                                isInline={true}
                                                onClose={() => setCreatingInSidebar(null)}
                                                onCreated={(newTask) => {
                                                    setProjectTasks(prev => [newTask, ...prev])
                                                    setCreatingInSidebar(null)
                                                }}
                                            />
                                        </div>
                                    ) : creatingInSidebar === 'meeting' ? (
                                        <div className="h-full flex flex-col">
                                            <button onClick={() => setCreatingInSidebar(null)} className="mb-4 text-sm font-medium text-muted flex items-center gap-1 hover:text-white transition-colors cursor-pointer w-fit">
                                                <span className="material-symbols-outlined text-[16px]">arrow_back</span> Back to schedule
                                            </button>
                                            <ScheduleMeetingModal
                                                organizer={currentUserId && organizationId ? { id: currentUserId, organization_id: organizationId } : null}
                                                defaultDate={selectedDateEvents || new Date()}
                                                onClose={() => setCreatingInSidebar(null)}
                                                onSaved={(meeting) => {
                                                    setCreatingInSidebar(null)
                                                    window.dispatchEvent(new CustomEvent(MEETING_SAVED_EVENT, { detail: meeting }))
                                                }}
                                            />
                                        </div>
                                    ) : (() => {
                                        const formatYMD = (date) => {
                                            if (!date) return ""
                                            const y = date.getFullYear()
                                            const m = String(date.getMonth() + 1).padStart(2, '0')
                                            const d = String(date.getDate()).padStart(2, '0')
                                            return `${y}-${m}-${d}`
                                        }
                                        const dateString = formatYMD(selectedDateEvents);
                                        const dayTasks = project_tasks.filter(t => t.due_date && t.due_date.substring(0, 10) === dateString);
                                        const combined = [
                                            ...dayTasks.map(t => ({ ...t, isTask: true, sortTime: new Date(t.due_date).getTime(), originalDateStr: t.due_date }))
                                        ].sort((a, b) => a.sortTime - b.sortTime);

                                        if (combined.length === 0) {
                                            return <p className="text-muted text-center italic py-md">Nothing scheduled for this day.</p>;
                                        }

                                        return combined.map(item => (
                                            <div
                                                key={(item.isEvent ? 'evt-' : 'tsk-') + item.id}
                                                onClick={() => {
                                                    if (!item.isEvent) {
                                                        setSelectedTask(item);
                                                    }
                                                }}
                                                className={`bg-raised p-md rounded-xl border border-line/20 flex flex-col gap-xs ${!item.isEvent ? 'cursor-pointer hover:border-primary-fixed-dim/50 transition-colors hover:shadow-lg' : ''}`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded flex items-center gap-1 ${item.isEvent ? 'bg-[#9c27b0]/20 text-[#9c27b0]' : 'bg-primary-fixed-dim/20 text-primary-fixed-dim'
                                                        }`}>
                                                        <span className="material-symbols-outlined text-[12px]">{item.isEvent ? 'event' : 'task'}</span>
                                                        {item.isEvent ? 'Event' : 'Task'}
                                                    </span>
                                                    <span className="text-xs text-muted font-medium">
                                                        {(item.originalDateStr.includes('T') || item.originalDateStr.includes(' '))
                                                            ? new Date(item.sortTime).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                                                            : 'All Day'}
                                                    </span>
                                                </div>
                                                <h3 className="text-base text-white font-semibold mt-1">{item.title}</h3>
                                                {item.description && <p className="text-xs text-muted line-clamp-2">{item.description}</p>}
                                            </div>
                                        ));
                                    })()}
                                </div>
                            </div>
                        </>
                    )}

                    {/* Public Files Tab */}
                    {activeTab === "files" && (
                        <div className="tab-pane block" id="section-files">
                            <div className="bg-raised p-lg rounded-xl glass-panel">
                                {/* Header */}
                                <div className="flex items-center justify-between mb-lg">
                                    <div className="flex items-center gap-sm">
                                        <span className="material-symbols-outlined text-primary-fixed-dim">move_to_inbox</span>
                                        <h3 className="font-headline-md text-lg">Project Files</h3>
                                        <span className="text-[11px] text-muted">
                                            {projectFiles.length} file{projectFiles.length !== 1 ? "s" : ""}
                                        </span>
                                    </div>
                                    <button type="button"
                                        onClick={() => { if (showUploadZone) { cancelPending(); setShowUploadZone(false) } else setShowUploadZone(true) }}
                                        className="flex items-center gap-xs text-[11px] text-primary-fixed-dim font-label-md uppercase tracking-wide hover:underline cursor-pointer">
                                        <span className="material-symbols-outlined text-[16px]">{showUploadZone ? "close" : "upload"}</span>
                                        {showUploadZone ? "Close" : "Upload"}
                                    </button>
                                </div>

                                {/* Upload zone */}
                                {showUploadZone && (
                                    <div className="mb-lg">
                                        <input ref={fileInputRef} type="file" accept={ACCEPTED} className="hidden"
                                            onChange={(e) => handleFilePick(e.target.files[0])} />
                                        {!pendingFile && (
                                            <div
                                                className={`rounded-xl border-2 border-dashed p-10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${dragOver ? "border-accent-ink bg-[var(--primary-color)]/10" : "border-line hover:border-outline hover:bg-line/50"}`}
                                                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                                                onDragLeave={() => setDragOver(false)}
                                                onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFilePick(e.dataTransfer.files[0]) }}
                                                onClick={() => fileInputRef.current?.click()}>
                                                <span className="material-symbols-outlined text-muted text-6xl">upload_file</span>
                                                <p className="text-sm text-white font-semibold">Drop a file here or click to browse</p>
                                                <p className="text-[12px] text-muted text-center">JPG · PNG · PDF · DOCX · XLSX · ZIP · CSV and more</p>
                                                <p className="text-[11px] text-muted/70 text-center">Max file size: {MAX_FILE_SIZE_MB} MB · Files are screened for viruses and disguised executables</p>
                                            </div>
                                        )}
                                        {pendingFile && renderPreUploadPreview()}
                                        {uploadError && <p className="mt-2 text-xs text-error">{uploadError}</p>}
                                    </div>
                                )}

                                {/* File list */}
                                {projectFiles.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                                        <span className="material-symbols-outlined text-muted text-5xl">folder_open</span>
                                        <p className="text-muted text-sm">No files uploaded yet.</p>
                                        <p className="text-[12px] text-muted">Click <strong>Upload</strong> above to add the first file.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-sm">
                                        {projectFiles.map((f) => {
                                            const { icon, color, bg } = getFileStyle(f.type)
                                            const isConfirming = confirmDeleteId === f.id
                                            return (
                                                <div key={f.id} className="rounded-lg overflow-hidden">
                                                    <div
                                                        className={`flex items-center justify-between p-sm transition-colors group cursor-pointer ${isConfirming ? "bg-error/5" : "hover:bg-line"}`}
                                                        onClick={() => { if (!isConfirming) setReviewFile(f) }}>
                                                        <div className="flex items-center gap-md">
                                                            {f.type?.startsWith("image/") ? (
                                                                <img src={f.url} alt={f.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                                                            ) : (
                                                                <div className={`w-10 h-10 ${bg} flex items-center justify-center rounded-lg shrink-0`}>
                                                                    <span className={`material-symbols-outlined ${color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                                                                </div>
                                                            )}
                                                            <div>
                                                                <p className={`text-sm ${isConfirming ? "text-error" : "text-primary"}`}>{f.name}</p>
                                                                <p className="text-muted text-[11px]">
                                                                    {f.uploaded_by ? `Added by ${f.uploaded_by}` : "Uploaded"}
                                                                    {f.size ? ` · ${formatBytes(f.size)}` : ""}
                                                                    {f.created_at ? ` · ${new Date(f.created_at).toLocaleDateString()}` : ""}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        {!isConfirming && (
                                                            <div className="flex items-center gap-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button type="button" title="Preview"
                                                                    onClick={(e) => { e.stopPropagation(); setReviewFile(f) }}
                                                                    className="material-symbols-outlined text-muted hover:text-white transition-colors text-[18px]">visibility</button>
                                                                <a href={downloadUrl(f.url, f.name)} download={f.name} target="_blank" rel="noreferrer"
                                                                    title="Download" onClick={(e) => e.stopPropagation()}
                                                                    className="material-symbols-outlined text-muted hover:text-white transition-colors text-[18px]">download</a>
                                                                <button type="button" title="Delete"
                                                                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(f.id) }}
                                                                    className="material-symbols-outlined text-muted hover:text-error transition-colors text-[18px]">delete</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {isConfirming && (
                                                        <div className="flex items-center justify-between px-sm py-sm bg-error/10 border-t border-error/20">
                                                            <div className="flex items-center gap-xs text-error text-[13px] font-semibold">
                                                                <span className="material-symbols-outlined text-[16px]">warning</span>
                                                                Are you sure you want to delete this file?
                                                            </div>
                                                            <div className="flex items-center gap-sm">
                                                                <button type="button"
                                                                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null) }}
                                                                    className="px-md py-[5px] rounded-lg border border-line text-muted hover:bg-line text-[12px] font-semibold transition-colors cursor-pointer">No, keep it</button>
                                                                <button type="button"
                                                                    onClick={(e) => { e.stopPropagation(); deleteFile(f) }}
                                                                    className="px-md py-[5px] rounded-lg bg-error text-white text-[12px] font-bold hover:opacity-90 cursor-pointer flex items-center gap-xs">
                                                                    <span className="material-symbols-outlined text-[14px]">delete</span>Yes, delete
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Members Tab */}
                    {activeTab === "members" && (
                        <ProjectMembers
                            projectMembers={projectMembers}
                            assignedUsers={assignedMembers}
                            currentUserId={currentUserId}
                            canManage={canDeleteProject === true}
                            isLoading={!isMembersLoaded || !isOrgUsersLoaded}
                            onRemove={removeProjectMember}
                            onAdd={addProjectMember}
                        />
                    )}

                    {/* Calendar Tab */}
                    {activeTab === "calendar" && (
                        <ProjectCalendar tasks={project_tasks} onPickDay={setSelectedDateEvents} onOpenTask={setSelectedTask} />
                    )}
                </div>
            </main>
            {/* ── Floating button: only where the tab's main action has no other home.
                 Tasks are added from the Tasks tab or the header's Create menu. ── */}
            {(() => {
                const fabConfig = {
                    files:   { icon: "upload",      label: "Upload File",    action: () => { setShowUploadZone(true); window.scrollTo({ top: 0, behavior: "smooth" }) } },
                    members: { icon: "person_add",  label: "Add Member",     action: () => setShowAddMemberModal(true) },
                }
                const cfg = fabConfig[activeTab]
                if (!cfg) return null
                return (
                    <button
                        type="button"
                        onClick={cfg.action}
                        className="fixed bottom-[96px] right-lg w-14 h-14 bg-primary-fixed-dim text-on-primary rounded-full shadow-[0_8px_32px_rgba(182,255,51,0.3)] flex items-center justify-center hover:scale-105 transition-transform active:scale-95 group z-30 cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-[28px] font-bold">{cfg.icon}</span>
                        <span className="absolute right-full mr-md px-md py-sm bg-raised text-white font-label-md text-xs rounded shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap border border-line">
                            {cfg.label}
                        </span>
                    </button>
                )
            })()}
            {isCreateTaskModalOpen && (
                <CreateTaskModal projectId={project_id} organizationId={organizationId} teamSpaceId={teamSpaceId}
                    departments={taskModalDepartments} defaultDepartmentId={newTaskDepartmentId}
                    initialStatus={createTaskInitialStatus} onClose={() => setIsCreateTaskModalOpen(false)}
                    onCreated={(newTask) => { setProjectTasks(prev => [newTask, ...prev]) }} />
            )}

            {/* Task Details Sidebar */}
            {selectedTask && (
                <div className="fixed inset-0 z-[60] flex justify-end">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-canvas/80 backdrop-blur-sm transition-opacity"
                        onClick={() => setSelectedTask(null)}
                    ></div>

                    {/* Sidebar */}
                    <div className="relative w-1/2 bg-raised shadow-2xl h-full overflow-y-auto flex flex-col transform transition-transform duration-300 border-l border-line">
                        {/* Header */}
                        <div className="flex items-center justify-between p-lg border-b border-line/30 bg-surface1">
                            <h2 className="font-headline-md text-white font-bold flex items-center gap-sm">
                                <span className="material-symbols-outlined">task</span>
                                Task Details
                            </h2>
                            <button
                                className="text-muted hover:text-white hover:bg-line w-8 h-8 rounded flex items-center justify-center transition-colors cursor-pointer"
                                onClick={() => setSelectedTask(null)}
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-lg space-y-xl flex-1">
                            <div>
                                <h1 className="font-headline-lg text-white font-bold mb-sm leading-tight">{selectedTask.title}</h1>
                                <TaskKeyBar task={selectedTask} className="mb-md" />
                                <div className="flex flex-wrap gap-sm">
                                    {(() => {
                                        const isOverdue = isTaskOverdue(selectedTask);
                                        const displayStatus = isOverdue ? 'overdue' : selectedTask.status;
                                        return (
                                            <span className={`px-md py-1.5 border rounded text-xs uppercase font-bold tracking-wider flex items-center gap-xs ${isOverdue ? 'bg-error/10 border-error/30 text-error' : 'bg-surface1 border border-line/50 text-muted'
                                                }`}>
                                                <span className="material-symbols-outlined text-[14px]">{isOverdue ? 'error' : 'flag'}</span>
                                                {displayStatus.replace('_', ' ')}
                                            </span>
                                        );
                                    })()}
                                    <div className="relative">
                                        <button
                                            className={`px-md py-1.5 rounded border text-xs font-bold uppercase tracking-wider flex items-center gap-xs cursor-pointer hover:opacity-80 transition-opacity ${selectedTask.priority === 'urgent' ? 'bg-error/10 border-error/30 text-error' :
                                                selectedTask.priority === 'high' ? 'bg-[#f59e0b]/10 border-[#f59e0b]/30 text-[#f59e0b]' :
                                                    selectedTask.priority === 'medium' ? 'bg-tertiary/10 border-tertiary/30 text-tertiary' :
                                                        'bg-primary-fixed-dim/10 border-primary-fixed-dim/30 text-primary-fixed-dim'
                                                }`}
                                            onClick={() => setPriorityDropdownOpen(!priorityDropdownOpen)}
                                        >
                                            <span className="material-symbols-outlined text-[14px]">bolt</span>
                                            {selectedTask.priority || 'Normal'}
                                        </button>
                                        {priorityDropdownOpen && (
                                            <>
                                                <div className="fixed inset-0 z-40" onClick={() => setPriorityDropdownOpen(false)}></div>
                                                <div className="font-body-md absolute left-0 top-full mt-1 w-32 bg-surface1 border border-line rounded-lg shadow-xl z-[70] overflow-hidden flex flex-col">
                                                    {['low', 'medium', 'high', 'urgent'].map(p => (
                                                        <button
                                                            key={p}
                                                            className={`text-left px-4 py-2 hover:bg-line transition-colors text-xs font-bold uppercase cursor-pointer ${selectedTask.priority === p ? 'text-primary' : 'text-white'}`}
                                                            onClick={() => {
                                                                updateTaskPriority(selectedTask.id, p);
                                                                setPriorityDropdownOpen(false);
                                                            }}
                                                        >
                                                            {p}
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="font-label-md text-muted uppercase tracking-wider mb-sm flex items-center gap-xs">
                                    <span className="material-symbols-outlined text-[16px]">description</span>
                                    Description
                                </h3>
                                {selectedTask.description ? (
                                    <p className="text-sm text-white whitespace-pre-wrap leading-relaxed bg-panel p-md rounded-xl border border-line/20">{selectedTask.description}</p>
                                ) : (
                                    <div className="bg-canvas p-md rounded-xl border border-line/20 border-dashed flex flex-col items-center justify-center gap-sm text-center">
                                        <span className="material-symbols-outlined text-muted/50 text-3xl">notes</span>
                                        <p className="text-xs text-muted/70 italic">No description provided for this task.</p>
                                    </div>
                                )}
                            </div>

                            <div>
                                <h3 className="font-label-md text-muted uppercase tracking-wider mb-sm flex items-center gap-xs">
                                    <span className="material-symbols-outlined text-[16px]">format_list_bulleted</span>
                                    Sub-tasks
                                </h3>
                                {(() => {
                                    const canEditSubtasks = canEditTaskDetails;
                                    let subtasksList = [];
                                    if (selectedTask.sub_tasks) {
                                        if (Array.isArray(selectedTask.sub_tasks)) {
                                            subtasksList = selectedTask.sub_tasks;
                                        } else if (typeof selectedTask.sub_tasks === "string") {
                                            const trimmed = selectedTask.sub_tasks.trim();
                                            if (trimmed && trimmed !== "null" && trimmed !== "undefined") {
                                                try {
                                                    const parsed = JSON.parse(trimmed);
                                                    if (Array.isArray(parsed)) {
                                                        subtasksList = parsed;
                                                    } else {
                                                        console.warn("Malformed sub_tasks (expected array) for task", selectedTask.id, parsed);
                                                        subtasksList = [];
                                                    }
                                                } catch (e) {
                                                    console.warn("Malformed sub_tasks for task", selectedTask.id, e);
                                                    subtasksList = [];
                                                }
                                            }
                                        }
                                    }

                                    const handleToggleSubtask = (stId) => {
                                        const updated = subtasksList.map(st =>
                                            st.id === stId ? { ...st, done: !st.done } : st
                                        );
                                        updateTaskSubtasks(selectedTask.id, updated);
                                    };

                                    const handleDeleteSubtask = (stId) => {
                                        const updated = subtasksList.filter(st => st.id !== stId);
                                        updateTaskSubtasks(selectedTask.id, updated);
                                    };

                                    const handleAddSubtask = (e) => {
                                        e.preventDefault();
                                        if (!newSubtaskTitle.trim()) return;
                                        const newSub = {
                                            id: Math.random().toString(36).substring(2, 9),
                                            title: newSubtaskTitle.trim(),
                                            done: false
                                        };
                                        updateTaskSubtasks(selectedTask.id, [...subtasksList, newSub]);
                                        setNewSubtaskTitle("");
                                    };

                                    return (
                                        <div className="space-y-sm bg-panel p-md rounded-xl border border-line/20">
                                            {subtasksList.length > 0 ? (
                                                <div className="space-y-xs max-h-48 overflow-y-auto pr-xs">
                                                    {subtasksList.map(st => (
                                                        <div key={st.id} className="flex items-center justify-between gap-sm group/sub">
                                                            <label className="flex items-center gap-sm cursor-pointer flex-1 py-0.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { if (canEditSubtasks) handleToggleSubtask(st.id) }}
                                                                    disabled={!canEditSubtasks}
                                                                    className={`check-btn ${!st.done ? '!bg-transparent !shadow-none !border !border-line hover:!bg-line' : ''} disabled:opacity-50 disabled:cursor-not-allowed !p-0 !w-4 !h-4 !rounded flex items-center justify-center shrink-0`}
                                                                    title={st.done ? "Mark as incomplete" : "Mark as done"}
                                                                >
                                                                    <svg className={`check-icon transition-opacity ${!st.done ? 'opacity-0' : 'opacity-100'} !w-3 !h-3`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                </button>
                                                                <span className={`text-sm text-white leading-tight transition-all ${st.done ? 'line-through text-muted/50' : ''}`}>
                                                                    {st.title}
                                                                </span>
                                                            </label>
                                                            {canEditSubtasks && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeleteSubtask(st.id)}
                                                                    className="text-muted hover:text-white opacity-0 group-hover/sub:opacity-100 transition-opacity cursor-pointer flex items-center justify-center p-0.5 rounded hover:bg-line"
                                                                >
                                                                    <span className="material-symbols-outlined text-[16px]">delete</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-muted/60 italic pb-xs">No sub-tasks yet.</p>
                                            )}
                                            {canEditSubtasks && (
                                                <form onSubmit={handleAddSubtask} className="flex items-center gap-xs pt-xs border-t border-line/10">
                                                    <input
                                                        type="text"
                                                        placeholder="Add a sub-task..."
                                                        value={newSubtaskTitle}
                                                        onChange={(e) => setNewSubtaskTitle(e.target.value)}
                                                        className="flex-1 bg-canvas border border-line/20 rounded px-sm py-[5px] text-sm text-white placeholder-muted/40 focus:outline-none focus:border-primary/50"
                                                    />
                                                    <button
                                                        type="submit"
                                                        className="bg-primary text-on-primary hover:bg-primary/90 text-xs font-bold px-sm py-[7px] rounded flex items-center gap-xs cursor-pointer transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-[14px]">add</span> Add
                                                    </button>
                                                </form>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-sm">
                                    <h3 className="font-label-md text-muted uppercase tracking-wider flex items-center gap-xs">
                                        <span className="material-symbols-outlined text-[16px]">attach_file</span>
                                        Attachments
                                    </h3>
                                    {canEditTaskDetails && (
                                        <div>
                                            <input
                                                ref={taskFileInputRef}
                                                type="file"
                                                accept={ACCEPTED}
                                                className="hidden"
                                                onChange={(e) => {
                                                    if (e.target.files?.[0]) {
                                                        uploadTaskFile(e.target.files[0], selectedTask.id);
                                                    }
                                                }}
                                            />
                                            <button
                                                type="button"
                                                disabled={taskUploading}
                                                onClick={() => taskFileInputRef.current?.click()}
                                                className="flex items-center gap-xs text-xs text-primary font-bold hover:underline cursor-pointer disabled:opacity-50"
                                            >
                                                {taskUploading ? (
                                                    <>
                                                        <PlanetLoader className="text-[14px]" />
                                                        Uploading…
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="material-symbols-outlined text-[14px]">add</span>
                                                        Attach File
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {taskUploadError && (
                                    <p className="text-xs text-error mb-xs">{taskUploadError}</p>
                                )}
                                {canEditTaskDetails && !taskUploadError && (
                                    <p className="text-[10px] text-muted/60 mb-xs">Max file size: {MAX_FILE_SIZE_MB} MB · Files are screened for viruses and disguised executables</p>
                                )}
                                {(() => {
                                    const taskFiles = projectFiles.filter(f => String(f.task_id) === String(selectedTask.id));
                                    return (
                                        <div className="space-y-xs bg-panel p-md rounded-xl border border-line/20">
                                            {taskFiles.length > 0 ? (
                                                <div className="space-y-xs max-h-48 overflow-y-auto pr-xs">
                                                    {taskFiles.map(f => {
                                                        const { icon, color, bg } = getFileStyle(f.type);
                                                        return (
                                                            <div key={f.id} className="flex items-center justify-between gap-sm group/file p-1 hover:bg-line/30 rounded transition-colors">
                                                                <div
                                                                    onClick={() => setReviewFile(f)}
                                                                    className="flex items-center gap-sm cursor-pointer min-w-0 flex-1"
                                                                >
                                                                    <div className={`w-8 h-8 ${bg} flex items-center justify-center rounded shrink-0`}>
                                                                        <span className={`material-symbols-outlined text-[18px] ${color}`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <p className="text-sm font-semibold text-white truncate" title={f.name}>{f.name}</p>
                                                                        <p className="text-[10px] text-muted">
                                                                            {f.size ? formatBytes(f.size) : ""} {f.uploaded_by ? `· by ${f.uploaded_by}` : ""}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-xs opacity-0 group-hover/file:opacity-100 transition-opacity shrink-0">
                                                                    <button
                                                                        type="button"
                                                                        title="Preview"
                                                                        onClick={() => setReviewFile(f)}
                                                                        className="material-symbols-outlined text-muted hover:text-white transition-colors text-[16px] cursor-pointer"
                                                                    >
                                                                        visibility
                                                                    </button>
                                                                    <a
                                                                        href={downloadUrl(f.url, f.name)}
                                                                        download={f.name}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        title="Download"
                                                                        className="material-symbols-outlined text-muted hover:text-white transition-colors text-[16px] cursor-pointer"
                                                                    >
                                                                        download
                                                                    </a>
                                                                    {canEditTaskDetails && (
                                                                        <button
                                                                            type="button"
                                                                            title="Delete"
                                                                            onClick={() => deleteFile(f)}
                                                                            className="material-symbols-outlined text-muted hover:text-error transition-colors text-[16px] cursor-pointer"
                                                                        >
                                                                            delete
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-muted/60 italic">No attachments yet.</p>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>

                            {isCrossDepartment && (
                                <TaskBlockPanel
                                    key={`${selectedTask.id}-${selectedTask.blocked_by_task_id ?? ""}`}
                                    task={selectedTask}
                                    tasks={project_tasks}
                                    departments={projectDepartments}
                                    canChangeDepartment={canEditTaskDetails || canDeleteProject === true}
                                    canBlock={canBlockTask(selectedTask)}
                                    onDepartmentChange={(id) => handleTaskDepartmentChange(selectedTask.id, id)}
                                    onBlockSave={(blockerId) => handleTaskBlockSave(selectedTask.id, blockerId)}
                                />
                            )}

                            <div className="grid grid-cols-2 gap-md">
                                <div className="bg-raised p-md rounded-xl border border-line/20 flex flex-col gap-xs">
                                    <h3 className="font-label-sm text-muted uppercase tracking-wider flex items-center gap-xs">
                                        <span className="material-symbols-outlined text-[14px]">person</span> Assignee
                                    </h3>
                                    {(() => {
                                        const assignee = selectedTask.assignee_id ? orgUsers.find(u => u.id === selectedTask.assignee_id) : null;
                                        return assignee ? (
                                            <div className="flex items-center gap-sm mt-1">
                                                <div className="w-6 h-6 rounded-full overflow-hidden bg-surface1 border border-line/50 flex items-center justify-center text-[10px] font-bold text-muted uppercase">
                                                    <PersonPhoto userId={assignee.id} fallback={assignee.name.charAt(0)} />
                                                </div>
                                                <div className="min-w-0 space-y-1">
                                                    <p className="text-sm text-white font-semibold">{assignee.name}</p>
                                                    <AwayBadge person={awayPeriods.get(assignee.id)} />
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-sm text-white mt-1 italic opacity-70">Unassigned</p>
                                        );
                                    })()}
                                </div>
                                <div className="bg-raised p-md rounded-xl border border-line/20 flex flex-col gap-xs">
                                    <h3 className="font-label-sm text-muted uppercase tracking-wider flex items-center gap-xs">
                                        <span className="material-symbols-outlined text-[14px]">calendar_today</span> Deadline
                                    </h3>
                                    <TaskDeadline
                                        key={selectedTask.id}
                                        dueDate={selectedTask.due_date}
                                        canEdit={canEditTaskDeadline}
                                        onSave={(nextDate) => handleTaskDeadlineSave(selectedTask.id, nextDate)}
                                    />
                                </div>
                            </div>

                            <TaskComments key={selectedTask.id} taskId={selectedTask.id} />

                            <div className="pt-md mt-auto flex justify-end items-center text-[11px] text-muted border-t border-line/20">
                                <span>Created {new Date(selectedTask.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Post-upload file review modal */}
            {reviewFile && (
                <DocViewer file={reviewFile} onClose={() => setReviewFile(null)} />
            )}

            {/* ── Delete column confirmation modal ── */}
            {columnToDelete && (
                <DeleteColumnModal
                    column={columnToDelete}
                    target={fallbackColumn(boardColumns, columnToDelete)}
                    taskCount={tasksInColumn(columnToDelete).length}
                    deleting={deletingColumn}
                    error={deleteColumnError}
                    onCancel={() => { if (!deletingColumn) { setColumnToDelete(null); setDeleteColumnError("") } }}
                    onConfirm={confirmDeleteColumn}
                />
            )}

            {/* ── Delete project confirmation modal ── */}
            {showDeleteConfirm && (
                <div
                    className="fixed inset-0 z-[150] flex items-center justify-center p-4"
                    style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
                    onClick={() => !deletingProject && setShowDeleteConfirm(false)}
                >
                    <div
                        className="bg-surface1 border border-line rounded-2xl shadow-2xl w-full max-w-sm p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Icon */}
                        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 mx-auto mb-4">
                            <span className="material-symbols-outlined text-red-400 text-[32px]">delete_forever</span>
                        </div>

                        {/* Text */}
                        <h2 className="text-white font-bold text-[18px] text-center mb-2">Delete this project?</h2>
                        <p className="text-muted text-[13px] text-center mb-1">You are about to permanently delete</p>
                        <p className="text-white font-bold text-[15px] text-center mb-3">"{project_name}"</p>
                        <p className="text-muted text-[12px] text-center mb-6">
                            All tasks, files, and chat channels in this project will also be removed. This cannot be undone.
                        </p>
                        {deleteProjectError && (
                            <p role="alert" className="text-red-400 text-[12px] text-center -mt-3 mb-4">{deleteProjectError}</p>
                        )}

                        {/* Buttons */}
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => { setShowDeleteConfirm(false); setDeleteProjectError("") }}
                                disabled={deletingProject}
                                className="flex-1 py-2.5 rounded-xl border border-line text-muted hover:bg-line hover:text-white text-[13px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
                            >
                                No, keep it
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteProject}
                                disabled={deletingProject}
                                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-[#ffffff] text-[13px] font-bold transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                {deletingProject ? (
                                    <><PlanetLoader className="text-[16px]" />Deleting…</>
                                ) : (
                                    <><span className="material-symbols-outlined text-[16px]">delete</span>Yes, delete</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Add Member modal ── */}
            {showAddMemberModal && (() => {
                const alreadyIn = new Set([
                    ...projectMembers.map(pm => pm.user_id),
                    ...assignedMembers.map(u => u.id),
                ])
                const available = addableProjectMembers(departmentMemberRows, memberDepartments, alreadyIn)
                // Who can be added is only known once every list is in
                const isReady = isMembersLoaded && isOrgUsersLoaded && memberDepartmentKey !== "" && loadedMemberKey === memberDepartmentKey
                const fromWhere = isCrossDepartment ? "this project's departments" : (projectDepartmentName || "this project's department")

                const addMember = (user) => addProjectMember(user)

                return (
                    <div
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                        style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
                        onClick={() => setShowAddMemberModal(false)}
                    >
                        <div
                            className="bg-surface1 border border-line rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-line">
                                <div>
                                    <h2 className="text-white font-bold text-[16px]">Add Members</h2>
                                    <p className="text-muted text-[12px]">Pick people from {fromWhere} to add to this project</p>
                                </div>
                                <button onClick={() => setShowAddMemberModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-white hover:bg-line transition-colors cursor-pointer">
                                    <span className="material-symbols-outlined text-[20px]">close</span>
                                </button>
                            </div>

                            {/* List */}
                            <div className="max-h-80 overflow-y-auto p-4 space-y-2">
                                {!isReady ? (
                                    <div className="space-y-2" aria-busy="true" aria-label="Loading people">
                                        {[0, 1, 2].map((row) => (
                                            <div key={row} className="flex items-center gap-3 p-3 rounded-xl bg-raised border border-line/50">
                                                <div className="w-9 h-9 rounded-full bg-line animate-pulse shrink-0" />
                                                <div className="flex-1 space-y-1.5">
                                                    <div className="h-3 w-32 rounded bg-line animate-pulse" />
                                                    <div className="h-2.5 w-44 rounded bg-line animate-pulse" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : available.length === 0 ? (
                                    <div className="text-center py-8">
                                        <span className="material-symbols-outlined text-muted text-4xl mb-2 block">group</span>
                                        <p className="text-muted text-[13px]">Everyone in {fromWhere} is already on this project.</p>
                                    </div>
                                ) : (
                                    available.map(user => (
                                        <div key={user.id} className="flex items-center justify-between p-3 rounded-xl bg-raised border border-line/50 hover:border-accent-ink/30 transition-colors group">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-full overflow-hidden bg-line flex items-center justify-center font-bold text-[14px] text-white uppercase shrink-0">
                                                    <PersonPhoto userId={user.id} fallback={user.name?.charAt(0) || "?"} />
                                                </div>
                                                <div>
                                                    <p className="text-white text-[13px] font-semibold">{user.name}</p>
                                                    <p className="text-muted text-[11px]">
                                                        {user.email}
                                                        {/* Which department, when the project has several */}
                                                        {isCrossDepartment && user.departments.length > 0 && ` · ${user.departments.join(", ")}`}
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => addMember(user)}
                                                className="px-3 py-1.5 rounded-lg bg-[var(--primary-color)]/10 border border-accent-ink/30 text-accent-ink text-[12px] font-bold hover:bg-[var(--primary-color)]/20 transition-colors cursor-pointer flex items-center gap-1"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">add</span>
                                                Add
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="px-6 py-4 border-t border-line">
                                <button onClick={() => setShowAddMemberModal(false)} className="w-full py-2.5 rounded-xl bg-line text-white text-[13px] font-semibold hover:bg-line-strong transition-colors cursor-pointer">
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                )
            })()}
        </div>
    )
}

export default ProjectPage
